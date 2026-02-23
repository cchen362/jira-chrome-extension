# PRD: Jira Ticket Logger Chrome Extension
**Product Name:** Jira Ticket Logger
**Version:** 1.1
**Author:** CL
**Status:** Requirements Finalized — Auth Validated
**Date:** 2026-02-23
**Changelog:** v1.1 — Updated with requirements workshop findings (scoring matrix, exact fields, Jira/SharePoint details)

---

## 1. Problem Statement

Analysts at Amex GBT are required to log Jira tickets into a Power Apps calculator for prioritization and tracking. This workflow has a critical friction point: it requires a context switch — the analyst must leave the Jira ticket they're reviewing, open a separate Power Apps tool, and manually re-enter ticket details they've already seen.

As a result, tickets go unlogged, prioritization data is incomplete, and reporting is unreliable. The root cause isn't negligence — it's workflow friction.

---

## 2. Proposed Solution

A Chrome Extension that lives inside the Jira browser tab and provides a side panel for logging tickets directly from the page the analyst is already on. The extension:

- Auto-detects the current Jira ticket and pre-populates known fields
- Prompts only for the delta (fields not available on the Jira page)
- Calculates a priority rating using the same logic as the existing Power Apps tool (Product tickets only)
- Submits the result to a SharePoint List (replacing the Power Apps backend)
- Detects previously logged tickets and allows editing/updating

**Core design principle:** Meet analysts where they work. Add intelligence to an existing workflow rather than creating a new one.

---

## 3. Goals

| Goal | Metric |
|------|--------|
| Reduce logging time | < 60 seconds from ticket view to log submission |
| Increase logging compliance | Target 90%+ of reviewed tickets logged |
| Eliminate duplicate data entry | 0 manual re-entry of fields already on Jira page |
| Maintain calculation consistency | 100% parity with existing Power Apps priority matrix |

---

## 4. Non-Goals (v1)

- This is not a replacement for Jira itself
- No bulk logging of historical tickets
- No dashboard or reporting within the extension (SharePoint handles this)
- No mobile support (Chrome desktop only)
- No integration with other ticketing systems (e.g., ServiceNow)
- No board view support — single ticket page only

---

## 5. Users

**Primary user:** Analysts who review and triage Jira tickets as part of their daily workflow.

**Secondary user:** Team leads and operations managers who consume the logged data via SharePoint for prioritization and reporting.

**Deployment model:** Internal enterprise tool. Distributed via Chrome Enterprise or manual sideloading to a defined group.

---

## 6. Target Environment

| System | Details |
|--------|---------|
| Jira | Self-hosted Data Center v10.3.15 at `jira.amexgbt.com` |
| SharePoint | `gbtravel.sharepoint.com/sites/GlobalEfficiencyTeam` |
| Browser | Chrome desktop |
| Auth | Microsoft 365 session-based (analyst already logged in) |

---

## 7. User Flow

### Entry Point
The extension icon appears in the Chrome toolbar. When the analyst is on a Jira ticket page (`jira.amexgbt.com/browse/XXXX-1234`), clicking the icon opens a **side panel** (30% screen width) without navigating away from the ticket.

---

### Pre-Check — Duplicate Detection
On panel open, the extension queries the SharePoint List for an existing entry matching the current ticket number.

| Result | Behavior |
|--------|----------|
| Existing entry found | Show warning banner: "This ticket was previously logged on [date]." Pre-fill form with saved data. Submit will update (not duplicate). |
| No existing entry | Pre-fill form with Jira page data only. Submit will create new entry. |

---

### Step 0 — Ticket Type Detection (Conditional)
The extension reads the Jira **Component/s** field on the page.

| Component detected | Action |
|---|---|
| `Product` (single component) | Skip to Step 1 with Product form |
| `Salesforce` (single component) | Skip to Step 1 with Salesforce form |
| Blank / multiple components / unrecognized | Show type selector: **[Product] [Salesforce]** |

---

### Step 1 — Pre-Populated Form

#### Common Auto-Extracted Fields (both ticket types, editable)
- **Jira Number** (e.g., `EGEGOET-1234`) — readonly
- **Reporter**
- **Assignee**
- **Description** (separate Description field from the ticket, not the title)
- **Created Date** (extracted from Jira Dates section, date only — e.g., "24/Nov/26")

#### Product Ticket — Additional Fields

**Scoring dropdowns (6 fields, drives priority calculation):**

| Field | Options | Score |
|-------|---------|-------|
| Overall Savings | <$50K | 0 |
| | $50-$100K | 5 |
| | >$100K | 10 |
| Impacted Area | POS | 0 |
| | Single Region | 5 |
| | >1 Region | 10 |
| Impacted Audience | Only Internal/Only Vendor | 5 |
| | Internal and Vendor | 10 |
| Duration | 0-1 Month | 0 |
| | 1-2 Months | 5 |
| | >3 Months | 10 |
| Stakeholder | No Dependency | 0 |
| | Strong Engagement | 5 |
| | Need to Change | 10 |
| Investment Time | <100 Hours | 0 |
| | 100-200 Hours | 5 |
| | >200 Hours | 10 |

**Free text fields:**
- Target Complete Date (free text — analyst may enter "Q2 2026", "March 2026", "TBD", etc.)
- Risk/Watch Items (free text)

#### Salesforce Ticket — Additional Fields

**Auto-extracted (editable dropdown):**
- Region (pre-filled from Jira custom field): APAC, EMEA, NA, Global

**Analyst fills in:**
- Status (dropdown, manually selected): New, In Progress, Hold, Complete, RTB Submitted, RTB Completed

*Note: Salesforce tickets are logged only — no priority calculation or rating.*

#### Always Present (both types)
- Notes (free text, optional)

---

### Step 2 — Review Screen
Displays a summary of all entered data.

**For Product tickets**, also shows the **calculated priority rating**:

| Rating | Description |
|---|---|
| Accepted | High ROI + Low Effort — action immediately |
| Up Next | Queue for upcoming sprint |
| Maybe | Low priority, revisit later |
| Likely No | Below threshold, unlikely to pursue |
| Rejected | Low ROI + High Effort — does not meet threshold |

**For Salesforce tickets**, shows summary only — no rating displayed.

Analyst sees: **[Go Back]** or **[Submit]**

---

### Step 3 — Success Confirmation
- New ticket: "Ticket EGEGOET-1234 logged successfully."
- Updated ticket: "Ticket EGEGOET-1234 updated successfully."
- Options: **[Log Another]** | **[Close Panel]**

---

## 8. Priority Calculation Engine

### Scoring

**ROI Score** = Overall Savings + Impacted Area + Impacted Audience

| Component | Range |
|-----------|-------|
| Overall Savings | 0, 5, or 10 |
| Impacted Area | 0, 5, or 10 |
| Impacted Audience | 5 or 10 (no 0 option) |
| **ROI Total** | **5 – 30** |

**Effort Score** = Duration + Stakeholder + Investment Time

| Component | Range |
|-----------|-------|
| Duration | 0, 5, or 10 |
| Stakeholder | 0, 5, or 10 |
| Investment Time | 0, 5, or 10 |
| **Effort Total** | **0 – 30** |

### Level Mapping

| Score Range | Level |
|-------------|-------|
| 0 – 10 | Low |
| 11 – 20 | Medium |
| 21 – 30 | High |

### Priority Matrix (ROI rows x Effort columns)

|              | Low Effort | Medium Effort | High Effort |
|--------------|-----------|---------------|-------------|
| **High ROI** | Accepted  | Up Next       | Maybe       |
| **Medium ROI** | Up Next | Maybe         | Maybe       |
| **Low ROI**  | Maybe     | Likely No     | Rejected    |

---

## 9. Technical Architecture

### Extension Structure
```
extension/
  manifest.json          — Chrome Extension Manifest v3
  background.js          — Service worker (side panel control, message relay)
  content.js             — Jira page DOM scraper
  icons/                 — Extension icons (16/32/48/128px)
  sidepanel/
    sidepanel.html       — Side panel UI (4-step flow)
    sidepanel.js         — Form logic, state management, step navigation
    sidepanel.css        — Professional blue theme styling
    sharepoint.js        — SharePoint REST API module
    calculator.js        — Priority calculation engine
```

### Data Extraction — Content Script
`content.js` runs on Jira ticket pages (`jira.amexgbt.com/browse/*`) and extracts:
- Ticket number from URL or page element
- Reporter, Assignee from people section
- Description from description field (not the ticket title)
- Created Date from dates section (date only, time stripped)
- Component/s for ticket type detection
- Region from custom field (Salesforce tickets)
- Data passed to side panel via `chrome.runtime.sendMessage` through the background service worker

Uses multi-strategy DOM selectors with fallbacks for resilience against Jira version changes.

### Calculation Engine
Replicates the existing Power Apps priority matrix in client-side JavaScript. Input: 6 dropdown values from Step 1 form. Output: one of five rating strings. Logic is deterministic and offline — no API call needed.

### Data Destination — SharePoint List
A dedicated SharePoint List ("JiraTicketLog") on `gbtravel.sharepoint.com/sites/GlobalEfficiencyTeam` with the following schema:

| Column | Type | Source |
|---|---|---|
| TicketNumber | Text | Auto-extracted |
| TicketType | Choice (Product/Salesforce) | Auto-detected or selected |
| Description | Multi-line text | Auto-extracted |
| Reporter | Text | Auto-extracted |
| Assignee | Text | Auto-extracted |
| CreatedDate | Text | Auto-extracted (date only string) |
| Region | Choice (APAC/EMEA/NA/Global) | Auto-extracted, Salesforce only |
| TicketStatus | Choice | Analyst input, Salesforce only |
| OverallSavings | Choice | Analyst input, Product only |
| ImpactedArea | Choice | Analyst input, Product only |
| ImpactedAudience | Choice | Analyst input, Product only |
| Duration | Choice | Analyst input, Product only |
| Stakeholder | Choice | Analyst input, Product only |
| InvestmentTime | Choice | Analyst input, Product only |
| TargetCompleteDate | Text | Analyst input, Product only |
| RiskWatchItems | Multi-line text | Analyst input, Product only |
| CalculatedRating | Choice | Computed, Product only |
| Notes | Multi-line text | Analyst input |
| SubmittedBy | Text | = Assignee value |

Built-in SharePoint "Created" and "Modified" columns serve as submission timestamps.

*SharePoint List chosen over Excel for stability — no file path fragility, better for concurrent writes, REST API support.*

### Authentication
**Approach: Session-based (piggyback on existing browser SharePoint login)**

The analyst is already logged into Microsoft 365 in the same Chrome profile. The extension uses `fetch()` with `credentials: 'include'` to call the SharePoint REST API, inheriting the existing session cookie. The extension declares `host_permissions` for `gbtravel.sharepoint.com` in the manifest.

**Fallback if session-based auth is blocked:**
1. Route all SharePoint API calls through the background service worker (which bypasses CORS via `host_permissions`)
2. If still blocked: Azure AD app registration with OAuth 2.0 PKCE flow

**Validation step (Phase 0 — before any extension work):** Run a browser console test against SharePoint REST API to confirm session-based auth works in the corporate environment.

---

## 10. Implementation Phases

### Phase 0 — Authentication Proof of Concept (Gate)
- Create a minimal SharePoint List with test columns
- Run browser console REST API test (write + read + update)
- Confirm cross-origin access from non-SharePoint page
- **Gate:** Do not proceed to Phase 1 until connectivity is proven

### Phase 1 — Core Extension (MVP)
- Manifest v3 setup with side panel
- Background service worker: side panel control + message relay
- Content script: DOM extraction from Jira ticket page
- Side panel: 4-step form flow with auto-populated fields
- Calculation engine: Port Power Apps matrix to JS
- SharePoint module: form digest, CRUD, duplicate detection
- SharePoint write: POST/PATCH on submit

### Phase 2 — Hardening & Polish
- Create all production SharePoint List columns
- Comprehensive error handling (network failures, auth expiry, missing fields)
- Field validation with inline error messages
- Loading states and submission feedback
- Edge cases: no components, missing fields, unassigned tickets, long descriptions
- Retry logic with exponential backoff

### Phase 3 — Rollout
- Package for internal distribution (sideload as `.zip`)
- Sideload instructions for pilot analysts
- Monitor SharePoint List for data quality
- Collect analyst feedback on form friction

---

## 11. Open Questions

| # | Question | Owner | Status |
|---|---|---|---|
| 1 | Does session-based SharePoint auth work in the corporate Chrome environment? | CL | ✅ Validated — session auth + cross-origin both work |
| 2 | What is the Region custom field ID in Jira? | CL | ⏳ Need to inspect Salesforce ticket in DevTools |
| 3 | Will IT need to approve/whitelist the extension? | IT | ⏳ To assess |
| 4 | What is the exact `ListItemEntityTypeFullName` for the SharePoint List? | CL | ⏳ Discover via REST API |

*Previously open questions now resolved:*
- *Scoring matrix: Documented in Section 8 (from Power Apps screenshot)*
- *Jira instance: `jira.amexgbt.com`, Data Center v10.3.15*
- *Salesforce sub-categorization: Region + Status dropdowns, plus Notes*
- *SharePoint site: `gbtravel.sharepoint.com/sites/GlobalEfficiencyTeam`*

---

## 12. Success Criteria

The extension is considered successful when:
- Analysts can log a ticket in under 60 seconds without leaving Jira
- The SharePoint List has sufficient data quality for reporting within 2 weeks of rollout
- Analyst feedback indicates the tool reduces, not adds, cognitive load

---

## 13. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Session auth blocked by corp policy | Medium | High | Validate early (Phase 0); fallback to service worker proxy or Azure AD app reg |
| Jira DOM structure changes break extraction | Medium | Medium | Use multiple selectors per field; fail gracefully with manual entry; REST API fallback |
| Region custom field ID unknown | Low | Low | One-time DevTools inspection to discover; hardcode once found |
| SharePoint "Status" column name conflict | Medium | Low | Use "TicketStatus" as column name |
| Scope creep during build | High | Medium | Strict v1 scope; capture future requests in backlog |
| Low analyst adoption | Low | High | Keep form under 90 seconds; gather feedback in pilot |

---

## 14. Appendix

### A. Existing Tool Being Replaced
Power Apps prioritization calculator — requires separate launch, manual data entry, disconnected from Jira workflow.

### B. Why SharePoint List (not Excel)
Previous Power Automate to Excel workflows experienced file path fragility causing data loss. SharePoint Lists provide a stable REST API, concurrent write support, and native column typing without the file handle risks of Excel.

### C. Why Chrome Extension (not Power App, not Bookmarklet)
- **Chrome Extension:** Lives in the browser, no context switch, can read the Jira DOM, side panel UX is native
- **Power App:** Requires separate launch, manual re-entry — same problem as today
- **Bookmarklet:** No persistent UI, no side panel support, harder to distribute

### D. Related Tools & Systems
- Jira Data Center v10.3.15 (source of ticket data)
- SharePoint Online (destination for logged data)
- Microsoft 365 (authentication context)
- Existing Power Apps calculator (logic reference for priority matrix)
