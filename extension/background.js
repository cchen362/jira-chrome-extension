// background.js — Service worker for Jira Ticket Logger
// Responsibilities:
// 1. Enable/disable side panel based on active tab URL
// 2. Handle extension icon click to open side panel
// 3. Relay messages between side panel and content script

const JIRA_TICKET_PATTERN = /^https:\/\/jira\.amexgbt\.com\/browse\/[A-Z]+-\d+/;

// --- Side Panel Control ---

// Enable or disable the side panel based on the current tab URL
function updateSidePanelForTab(tabId, url) {
  if (url && JIRA_TICKET_PATTERN.test(url)) {
    chrome.sidePanel.setOptions({
      tabId,
      path: 'sidepanel/sidepanel.html',
      enabled: true
    });
  } else {
    chrome.sidePanel.setOptions({
      tabId,
      enabled: false
    });
  }
}

// Listen for tab URL changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    updateSidePanelForTab(tabId, changeInfo.url);
  }
});

// Listen for tab activation (switching tabs)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    updateSidePanelForTab(activeInfo.tabId, tab.url);
  } catch (e) {
    // Tab may have been closed between events
  }
});

// --- Action Click Handler ---

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  if (tab.id && tab.url && JIRA_TICKET_PATTERN.test(tab.url)) {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

// --- Message Relay ---

// Relay messages between side panel and content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_JIRA_DATA') {
    // Side panel is requesting Jira data — forward to content script in active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]?.id) {
        sendResponse({ success: false, error: 'No active tab found.' });
        return;
      }

      const tabId = tabs[0].id;

      chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_JIRA_DATA' }, (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({
            success: false,
            error: 'Unable to read the Jira page. Refresh the Jira tab and reopen the panel.'
          });
          return;
        }
        sendResponse(response);
      });
    });

    // Return true to indicate we will respond asynchronously
    return true;
  }
});
