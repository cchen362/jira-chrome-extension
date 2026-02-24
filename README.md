# Jira Ticket Logger

Chrome extension that logs Jira tickets to the SharePoint `JiraTicketLog` list. Opens as a side panel, auto-extracts ticket data from the Jira page, and lets you fill in remaining fields before submitting.

## What It Does

1. Navigate to a Jira ticket (browse or queue view)
2. Click the extension icon to open the side panel
3. Ticket details (title, description, reporter, assignee, status, region, created date) are auto-extracted from the page
4. Choose ticket type — **Product** or **Salesforce**
5. For Product tickets, select a sub-category:
   - *Product Roadmap* or *Quick Wins/Impact to TCE* → auto-accepted (no scoring needed)
   - *Others* → fill in scoring fields (savings, impact, duration, etc.) and get a calculated priority rating
6. Fill in any remaining fields (notes, target date, etc.)
7. Submit to SharePoint

## Installation

1. On this page, click the green **Code** button, then click **Download ZIP**
2. Extract the ZIP file to a folder on your computer
3. Open Chrome and go to `chrome://extensions/`
4. Enable **Developer mode** (toggle in the top-right corner)
5. Click **Load unpacked** and select the `extension` folder inside the extracted folder
6. The Jira Ticket Logger icon should appear in your toolbar

## Usage Notes

- Make sure you are logged into SharePoint before submitting. The extension uses your existing browser session for authentication.
- After installing or updating the extension, **refresh any open Jira tabs** before using it. Otherwise you may see a "failed to fetch ticket details" error.
- Duplicate tickets are detected by ticket number — you'll get a warning if the ticket was already logged.
- The side panel only activates on Jira ticket pages (`/browse/TICKET-123` or queue views).

## File Structure

```
extension/
  manifest.json         — extension config (MV3)
  background.js         — service worker, proxies SharePoint calls
  content.js            — extracts ticket data from Jira DOM
  sp_header_rules.json  — declarativeNetRequest rules for SP auth
  icons/                — extension icons (16/32/48/128)
  sidepanel/
    sidepanel.html      — side panel UI
    sidepanel.js        — form logic and validation
    sidepanel.css       — styles
    sharepoint.js       — SharePoint API helpers
    calculator.js       — priority scoring calculator
```
