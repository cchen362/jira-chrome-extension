# Implementation Plan: Jira Ticket Logger Chrome Extension
**Version:** 1.0
**Date:** 2026-02-23
**Status:** Auth Validated — Ready for Phase 1

---

## Summary
Greenfield Chrome Extension (Manifest V3) with side panel UI. Auto-extracts Jira ticket data from DOM, presents conditional forms (Product vs Salesforce), calculates priority rating (Product only), and submits to a SharePoint List. No build tooling — plain JS/HTML/CSS.

---

## Key Facts (from requirements workshop)

- **Jira:** Self-hosted Data Center v10.3.15 at `jira.amexgbt.com/browse/*` (single ticket pages only)
- **SharePoint:** `gbtravel.sharepoint.com/sites/GlobalEfficiencyTeam` — new List "JiraTicketLog"
- **Auth:** Session-based (piggyback on browser SharePoint login) — **VALIDATED** (Phase 0 passed, cross-origin works)
- **Ticket type detection:** From **Component/s** field on the Jira page
- **5 priority ratings:** Accepted, Up Next, Maybe, Likely No, Rejected
- **6 scoring fields:** Overall Savings, Impacted Area, Impacted Audience, Duration, Stakeholder, Investment Time
- **SubmittedBy** = Assignee field value (analyst logs tickets assigned to them)
- **Duplicate handling:** Query SharePoint by TicketNumber → pre-fill form with saved data + warning banner → PATCH on re-submit

---

## File Structure

```
extension/
  manifest.json          — Manifest V3 config
  background.js          — Service worker (side panel control, message relay)
  content.js             — Jira DOM scraper (runs on ticket pages)
  icons/
    icon16.png
    icon32.png
    icon48.png
    icon128.png
  sidepanel/
    sidepanel.html       — Side panel UI shell (4 steps)
    sidepanel.js         — Form controller, state management, step navigation
    sidepanel.css        — Professional blue theme
    sharepoint.js        — SharePoint REST API module (digest, CRUD, duplicate check)
    calculator.js        — Priority calculation engine (pure logic, no DOM/network)
```

---

## Implementation Phases

### Phase 0 — Auth POC (GATE: must pass before Phase 1)

1. Create minimal SharePoint List "JiraTicketLog" with test columns (Title, TicketNumber, TestField)
2. Run browser console test from a SharePoint page to validate session-based REST API write access
3. Test from a non-SharePoint page (e.g., Jira) to check CORS behavior
4. Discover `ListItemEntityTypeFullName` via REST API
5. **If session auth fails:** fall back to routing all SharePoint calls through background service worker (bypasses CORS via `host_permissions`)

### Phase 1 — Core MVP (build order)

| Step | File | What to build |
|------|------|---------------|
| 1 | `manifest.json` | Skeleton with permissions, content script match, side panel path. Load in Chrome to verify install. |
| 2 | `background.js` | Service worker: URL-based side panel enable/disable, message relay between side panel and content script. |
| 3 | `content.js` | DOM extraction with multi-strategy selectors for Jira v10.3.x. Requires on-instance selector discovery first. |
| 4 | `sidepanel.html` + `sidepanel.css` | Static HTML/CSS for all 4 steps (type select, form, review, success). Blue theme. |
| 5 | `calculator.js` | Scoring engine. Test in browser console with verification matrix. |
| 6 | `sharepoint.js` | SharePoint API module: form digest, findByTicketNumber, createItem, updateItem. |
| 7 | `sidepanel.js` | Wire everything: message passing, form population, step navigation, validation, submission. |
| 8 | Integration test | End-to-end on real Jira tickets (Product + Salesforce + ambiguous). |

### Phase 2 — Hardening & Polish

- Comprehensive field validation with inline errors
- Loading states (spinner overlay during SharePoint calls)
- Retry logic for transient network failures + form digest expiry refresh
- Edge cases: missing DOM fields, unassigned tickets, long descriptions
- CSS polish: responsive widths, focus states, accessibility

### Phase 3 — Rollout

- Create all production columns on SharePoint List
- Package as `.zip` for sideloading
- Pilot with 2-3 analysts, collect feedback

---

## manifest.json Specification

```json
{
  "manifest_version": 3,
  "name": "Jira Ticket Logger",
  "version": "1.0.0",
  "description": "Log Jira tickets to SharePoint with auto-extracted data and priority calculation.",
  "permissions": ["sidePanel", "activeTab", "tabs"],
  "host_permissions": [
    "https://jira.amexgbt.com/*",
    "https://gbtravel.sharepoint.com/*"
  ],
  "background": { "service_worker": "background.js" },
  "content_scripts": [{
    "matches": ["https://jira.amexgbt.com/browse/*"],
    "js": ["content.js"],
    "run_at": "document_idle"
  }],
  "side_panel": { "default_path": "sidepanel/sidepanel.html" },
  "action": {
    "default_title": "Jira Ticket Logger",
    "default_icon": { "16": "icons/icon16.png", "32": "icons/icon32.png", "48": "icons/icon48.png", "128": "icons/icon128.png" }
  },
  "icons": { "16": "icons/icon16.png", "48": "icons/icon48.png", "128": "icons/icon128.png" }
}
```

**Key decisions:**
- `sidePanel` permission for `chrome.sidePanel.*` API
- `activeTab` for temporary access to the active tab on icon click
- `tabs` for `chrome.tabs.onUpdated` listener (URL change detection)
- `host_permissions` for both Jira (content script injection) and SharePoint (cross-origin fetch)
- Content script only matches `/browse/*` — not dashboards, boards, or search
- `run_at: "document_idle"` ensures DOM is loaded before extraction

---

## Content Script — DOM Extraction (content.js)

**Jira v10.3.x (Data Center)** — selectors must be verified on the live instance. Multi-strategy approach per field:

| Field | Primary Strategy | Fallback |
|-------|-----------------|----------|
| Ticket Number | URL regex: `/browse/([A-Z]+-\d+)/` | `#key-val` element |
| Reporter | `#reporter-val` | People details section label search |
| Assignee | `#assignee-val` | People details section label search |
| Description | `#description-val .user-content-block` | `#descriptionmodule .mod-content` |
| Created Date | `#create-date time` or `#created-val time` | Dates section label search; strip time portion |
| Component/s | `#components-val` children (`a` or `span`) | `#components-field` children |
| Region (custom) | `[data-field-id="customfield_XXXXX"]` | Label text search for "Region" then sibling value |

**CRITICAL pre-req:** The Region custom field ID (`customfield_XXXXX`) must be discovered by inspecting a Salesforce ticket in DevTools. One-time lookup.

**Jira REST API fallback:** If DOM extraction fails for any field, call `GET /rest/api/2/issue/XXX-1234?fields=...` with `credentials: 'include'`.

---

## Forms — Complete Field Specification

### Product Form

**Auto-extracted from Jira page (editable):**
- Jira Number (readonly)
- Reporter
- Assignee
- Description (separate Description field, not the ticket title)
- Created Date (date only, stripped from "24/Nov/26 4:33PM" format)

**Analyst fills in — Scoring dropdowns (6 fields, drives priority calculation):**

| Field | Options (label / score) |
|-------|------------------------|
| Overall Savings | <$50K (0), $50-$100K (5), >$100K (10) |
| Impacted Area | POS (0), Single Region (5), >1 Region (10) |
| Impacted Audience | Only Internal/Only Vendor (5), Internal and Vendor (10) |
| Duration | 0-1 Month (0), 1-2 Months (5), >3 Months (10) |
| Stakeholder | No Dependency (0), Strong Engagement (5), Need to Change (10) |
| Investment Time | <100 Hours (0), 100-200 Hours (5), >200 Hours (10) |

**Analyst fills in — Free text:**
- Target Complete Date (free text, NOT date picker — analyst may enter "Q2 2026" or "TBD")
- Risk/Watch Items (free text, required)
- Notes (free text, optional)

### Salesforce Form

**Auto-extracted from Jira page (editable):**
- Jira Number (readonly)
- Reporter
- Assignee
- Description
- Created Date
- Region (pre-filled from Jira custom field, editable dropdown: APAC, EMEA, NA, Global)

**Analyst fills in:**
- Status (dropdown, NOT auto-extracted: New, In Progress, Hold, Complete, RTB Submitted, RTB Completed)
- Notes (free text, optional)

**No scoring/rating for Salesforce tickets.**

---

## Calculation Engine (calculator.js)

### Scoring Logic

```
ROI Score = Overall Savings + Impacted Area + Impacted Audience
  Range: 5-30 (Impacted Audience minimum is 5, no 0 option)

Effort Score = Duration + Stakeholder + Investment Time
  Range: 0-30

Level Mapping:
  0-10  = Low
  11-20 = Medium
  21-30 = High
```

### Priority Matrix (ROI rows x Effort columns)

|              | Low Effort | Medium Effort | High Effort |
|--------------|-----------|---------------|-------------|
| **High ROI** | Accepted  | Up Next       | Maybe       |
| **Medium ROI** | Up Next | Maybe         | Maybe       |
| **Low ROI**  | Maybe     | Likely No     | Rejected    |

### Verification Test Cases

| Overall Savings | Impacted Area | Impacted Audience | Duration | Stakeholder | Investment Time | ROI (Level) | Effort (Level) | Rating |
|---|---|---|---|---|---|---|---|---|
| 10 | 10 | 10 | 0 | 0 | 0 | 30 (High) | 0 (Low) | Accepted |
| 10 | 5 | 10 | 0 | 5 | 0 | 25 (High) | 5 (Low) | Accepted |
| 10 | 10 | 5 | 5 | 5 | 0 | 25 (High) | 10 (Low) | Up Next |
| 5 | 5 | 5 | 5 | 5 | 5 | 15 (Med) | 15 (Med) | Maybe |
| 0 | 0 | 5 | 10 | 10 | 10 | 5 (Low) | 30 (High) | Rejected |
| 5 | 0 | 5 | 5 | 10 | 5 | 10 (Low) | 20 (Med) | Likely No |
| 0 | 0 | 5 | 0 | 0 | 0 | 5 (Low) | 0 (Low) | Maybe |

---

## SharePoint Integration (sharepoint.js)

**Config:**
- Site: `https://gbtravel.sharepoint.com/sites/GlobalEfficiencyTeam`
- List: `JiraTicketLog`
- Entity type: `SP.Data.JiraTicketLogListItem` (verify via REST API)

**Key operations:**
1. `getFormDigest()` — POST to `/_api/contextinfo`, cache for 25 min (expires at 30)
2. `findByTicketNumber(num)` — GET with `$filter=TicketNumber eq 'XXX-1234'&$top=1` (returns item + etag)
3. `createItem(data)` — POST to list items endpoint
4. `updateItem(id, data, etag)` — POST with `X-HTTP-Method: MERGE` and `If-Match: etag`

**Dropdown storage:** Store display labels (e.g., "<$50K") not numeric scores. Map labels back to scores when re-loading for edit.

**CORS:** Validated — cross-origin fetch with `credentials: 'include'` works from non-SharePoint pages. Side panel can call SharePoint directly. No background proxy needed.

---

## SharePoint List Schema

| Column | Type | Choices | Notes |
|--------|------|---------|-------|
| TicketNumber | Text | — | **Index this column** for query performance |
| TicketType | Choice | Product, Salesforce | |
| Description | Multi-line text | — | Plain text |
| Reporter | Text | — | |
| Assignee | Text | — | |
| CreatedDate | Text | — | Stored as extracted date string |
| Region | Choice | APAC, EMEA, NA, Global | Salesforce only |
| TicketStatus | Choice | New, In Progress, Hold, Complete, RTB Submitted, RTB Completed | Named "TicketStatus" to avoid built-in "Status" conflict |
| OverallSavings | Choice | <$50K, $50-$100K, >$100K | Product only |
| ImpactedArea | Choice | POS, Single Region, >1 Region | Product only |
| ImpactedAudience | Choice | Only Internal/Only Vendor, Internal and Vendor | Product only |
| Duration | Choice | 0-1 Month, 1-2 Months, >3 Months | Product only |
| Stakeholder | Choice | No Dependency, Strong Engagement, Need to Change | Product only |
| InvestmentTime | Choice | <100 Hours, 100-200 Hours, >200 Hours | Product only |
| TargetCompleteDate | Text | — | Free text, Product only |
| RiskWatchItems | Multi-line text | — | Product only |
| CalculatedRating | Choice | Accepted, Up Next, Maybe, Likely No, Rejected | Product only |
| Notes | Multi-line text | — | |
| SubmittedBy | Text | — | = Assignee value |

Built-in "Created" and "Modified" columns serve as SubmittedDate.

---

## UX Flow

```
Panel Opens → Loading overlay
  |
Request Jira data from content script
  |
Query SharePoint for existing entry
  |
+-- Found? --YES--> Pre-fill with saved data + warning banner ("Previously logged on [date]")
|            NO---> Pre-fill from Jira data only
  |
Detect ticket type from Component/s
  |
+-- Product or Salesforce detected? --YES--> Show correct form
|                                     NO---> Show type selector [Product] [Salesforce]
  |
Step 1: Form (auto-populated + manual fields)
  |
[Review & Submit] button → validate required fields
  |
Step 2: Review screen (all data + rating badge for Product only)
  |
[Go Back] <-- or --> [Submit]
  |
Submit → POST (new) or PATCH (existing) to SharePoint
  |
Step 3: Success ("logged" or "updated" message)
  |
[Log Another] or [Close Panel]
```

### Component/s Detection Logic
- Component = "Product" (single) → Product form
- Component = "Salesforce" (single) → Salesforce form
- Blank / multiple / unrecognized → type selector prompt

### Duplicate/Edit Flow
- On panel open, query SharePoint by TicketNumber
- If found: load saved data into form + warning banner with previous submission date
- Jira auto-extracted fields use current page values (may have changed)
- Analyst-entered fields use previously saved values (editable)
- Submit does PATCH (update) instead of POST (create)

---

## Error Handling

| Scenario | Message | Recovery |
|----------|---------|----------|
| SharePoint 401/403 | "Not authenticated to SharePoint. Open SharePoint in another tab, log in, then try again." | Retry button |
| Network error | "Network error. Check your connection and try again." | Retry button |
| Content script no response | "Unable to read the Jira page. Refresh the Jira tab and reopen the panel." | Manual instruction |
| DOM extraction fails for a field | Field left blank + "(could not auto-detect)" hint | Analyst fills manually |
| SharePoint write failure | "Failed to save: [error detail]" | Retry + Go Back buttons |
| Validation failure | Inline red error on each empty required field | Scroll to first error |

Form digest auto-refreshes on expiry (cached 25 min, expires at 30). Retry with exponential backoff for transient failures.

---

## Verification Checklist

- [ ] Phase 0: Console test confirms SharePoint REST API write + read + update
- [ ] Extension installs without errors in Chrome
- [ ] Side panel appears only on `jira.amexgbt.com/browse/*` pages
- [ ] All auto-extracted fields populate for Product tickets
- [ ] All auto-extracted fields populate for Salesforce tickets
- [ ] Component detection correctly identifies Product and Salesforce
- [ ] Type selector appears for ambiguous tickets
- [ ] All 6 Product scoring dropdowns render with correct options
- [ ] Salesforce Region pre-fills from Jira custom field
- [ ] Rating calculation matches matrix for all 9 combinations
- [ ] Review screen shows rating badge (Product) or no rating (Salesforce)
- [ ] "Go Back" preserves form data
- [ ] Submit creates item in SharePoint (new ticket)
- [ ] Submit updates item in SharePoint (existing ticket)
- [ ] Warning banner shows for previously logged tickets
- [ ] Success message distinguishes "logged" vs "updated"
- [ ] Error messages display for auth, network, and validation failures
- [ ] Extension does not break or slow down the Jira page
