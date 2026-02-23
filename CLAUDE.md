# Jira Ticket Logger — Chrome Extension

## Project Overview
Chrome Extension (Manifest V3) with side panel UI. Auto-extracts Jira ticket data from DOM, presents conditional forms (Product vs Salesforce), calculates priority rating (Product only), and submits to a SharePoint List.

**Stack:** Plain JS / HTML / CSS — NO build tools, NO npm, NO TypeScript.

## Key Constants

### SharePoint
- **Site URL:** `https://gbtravel.sharepoint.com/sites/GlobalEfficiencyTeam`
- **List Name:** `JiraTicketLog`
- **Entity Type:** `SP.Data.JiraTicketLogListItem`
- **Auth:** Session-based (`credentials: 'include'`), piggybacks on browser SharePoint login

### Jira
- **Base URL:** `https://jira.amexgbt.com`
- **Match Pattern:** `https://jira.amexgbt.com/browse/*`
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
Region             Choice     — APAC, EMEA, NA, Global
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
- [ ] Phase 1: Core MVP — IN PROGRESS
- [ ] Phase 2: Hardening & Polish
- [ ] Phase 3: Rollout

## Lessons Learned
<!-- Update this section as we discover things during development -->
- SharePoint internal column names matched display names exactly — no encoding surprises
- Jira Description is a collapsible section (aui-toggle-header-button-label), not a standard field
- Test case 3 in implementation-plan.md was wrong: Effort=10 is Low (not Medium), result should be Accepted
- Region field in Jira is customfield_17039, visible in Details section (not sidebar)
