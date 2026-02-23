# Jira Ticket Logger — Chrome Extension

## Project Overview
Chrome Extension (Manifest V3) with side panel UI. Auto-extracts Jira ticket data from DOM, presents conditional forms (Product vs Salesforce), calculates priority rating (Product only), and submits to a SharePoint List.

**Stack:** Plain JS / HTML / CSS — NO build tools, NO npm, NO TypeScript.

## Key Constants

### SharePoint
- **Site URL:** `https://gbtravel.sharepoint.com/sites/GlobalEfficiencyTeam`
- **List Name:** `JiraTicketLog`
- **Entity Type:** `SP.Data.JiraTicketLogListItem`
- **Auth:** Session-based via `credentials: 'include'` in background SW. Origin header rewritten via `declarativeNetRequest` (see Lessons Learned)

### Jira
- **Base URL:** `https://jira.amexgbt.com`
- **Match Patterns:** `/browse/*` and `/projects/*/queues/*`
- **Version:** Data Center v10.3.15
- **Region Custom Field:** `customfield_17039`

## SharePoint Column Names (Internal → Type)
All internal names match display names exactly (verified 2026-02-23).
```
Title              Text       — set to ticket number (e.g., EGEGOET-3299)
TicketNumber       Text       — duplicate detection query target
TicketType         Choice     — Product, Salesforce
Description        Note       — plain text
Reporter           Text
Assignee           Text
CreatedDate        Text       — date string only (e.g., "24/Nov/25")
Region             Choice     — APAC, EMEA, NA, Global, EMEA and APAC
TicketStatus       Choice     — New, In Progress, Hold, Complete, RTB Submitted, RTB Completed
OverallSavings     Choice     — <$50K, $50-$100K, >$100K
ImpactedArea       Choice     — POS, Single Region, >1 Region
ImpactedAudience   Choice     — Only Internal/Only Vendor, Internal and Vendor
Duration           Choice     — 0-1 Month, 1-2 Months, >3 Months
Stakeholder        Choice     — No Dependency, Strong Engagement, Need to Change
InvestmentTime     Choice     — <100 Hours, 100-200 Hours, >200 Hours
TargetCompleteDate Text       — free text
RiskWatchItems     Note       — plain text
CalculatedRating   Choice     — Accepted, Up Next, Maybe, Likely No, Rejected
Notes              Note       — plain text
SubmittedBy        Text       — = Assignee value
```

## Scoring Logic (Priority Calculator)
- **ROI Score** = Overall Savings + Impacted Area + Impacted Audience (range: 5-30)
- **Effort Score** = Duration + Stakeholder + Investment Time (range: 0-30)
- **Level Mapping:** 0-10 = Low, 11-20 = Medium, 21-30 = High
- **Matrix:** High ROI + Low Effort = Accepted; Low ROI + High Effort = Rejected; see implementation-plan.md for full matrix

## Coding Rules
1. **Always fix root cause** — no bandaids, no quick patches that mask the real issue
2. **Keep it simple** — no over-engineering, no premature abstractions
3. **Fail gracefully** — DOM extraction returns null/empty on failure, never throws
4. **Store display labels** in SharePoint (e.g., "<$50K"), not numeric scores
5. **Title + TicketNumber** both store the ticket number; TicketNumber is for querying
6. **SubmittedBy** always equals the Assignee field value

## File Structure
```
extension/
  manifest.json
  background.js
  content.js
  icons/ (16/32/48/128 png)
  sidepanel/
    sidepanel.html
    sidepanel.js
    sidepanel.css
    sharepoint.js
    calculator.js
```

## Phase Tracker
- [x] Phase 0: Auth POC — validated session auth + cross-origin
- [x] Phase 1: Core MVP — COMPLETE (2026-02-23)
- [x] Phase 2: Hardening & Polish — COMPLETE (2026-02-24)
- [ ] Phase 3: Rollout

## Architecture Notes
- **SharePoint calls MUST go through background.js** — side panel runs in chrome-extension:// origin and cannot send SharePoint session cookies. background.js has host_permissions and proxies all SP fetch calls via the `SP_FETCH` message type.
- **Origin header rewrite via `declarativeNetRequest`** — SharePoint CSRF rejects POSTs from `chrome-extension://` origin. The `sp_header_rules.json` rule rewrites `Origin` and `Referer` to the SP domain on all XHR requests to `gbtravel.sharepoint.com`.
- **Content script ↔ Side panel** communication is relayed through background.js via `GET_JIRA_DATA` / `EXTRACT_JIRA_DATA` messages.
- **Jira URL support:** Both `/browse/TICKET-123` and `/projects/*/queues/custom/NNN/TICKET-123` patterns are supported across manifest, background.js, and content.js.

## Lessons Learned
<!-- Update this section as we discover things during development -->
- SharePoint internal column names matched display names exactly — no encoding surprises
- Jira Description is a collapsible section (aui-toggle-header-button-label), not a standard field
- Test case 3 in implementation-plan.md was wrong: Effort=10 is Low (not Medium), result should be Accepted
- Region field in Jira is customfield_17039, visible in Details section (not sidebar)
- Side panel cannot use `credentials: 'include'` for SharePoint — cookies are domain-bound, must proxy through background service worker
- **MV3 service worker `credentials: 'include'` DOES send browser cookies** for domains in `host_permissions`. GETs work fine. But POSTs fail with 403 because the service worker sends `Origin: chrome-extension://...` which SharePoint's CSRF protection rejects.
- **`fetch()` treats `Origin` as a forbidden header** — setting it in the headers object is silently ignored. Manual `Cookie` header is also silently stripped. The only way to override `Origin` is via `declarativeNetRequest` `modifyHeaders` rules (`sp_header_rules.json`).
- `cookies` permission still useful for diagnostics but not needed for the actual auth flow.
- Description selector: NEVER use `.closest('.module')` — it climbs to the entire Details section. Use `.closest('.toggle-wrap')` instead
- Created Date: Use a HYBRID approach — (1) try visible text first (avoids UTC timezone shift on absolute dates like "24/Nov/25"), (2) if visible text is a relative date ("3 days ago", "yesterday"), fall back to `datetime` attribute but parse date components directly (regex `^(\d{4})-(\d{2})-(\d{2})`) — NEVER use `new Date()` on the ISO string as it converts to local timezone and can shift the date
- Phase 2: SharePoint retry uses `withRetry(fn, 2)` wrapper — only retries on transient errors (network, 500, 503, 429), NOT on auth (401/403) or conflict (412). On 403 during POST, invalidate digest cache so next retry gets a fresh one.
- Phase 2: Region dropdown has 5 options: APAC, EMEA, NA, Global, EMEA and APAC (added 2026-02-24)
