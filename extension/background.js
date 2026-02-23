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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Relay Jira data requests to the content script
  if (message.type === 'GET_JIRA_DATA') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]?.id) {
        sendResponse({ success: false, error: 'No active tab found.' });
        return;
      }

      chrome.tabs.sendMessage(tabs[0].id, { type: 'EXTRACT_JIRA_DATA' }, (response) => {
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
    return true;
  }

  // Proxy SharePoint fetch requests from the side panel.
  // The background service worker has host_permissions for gbtravel.sharepoint.com,
  // so fetch() here includes the user's SharePoint session cookies automatically.
  // The side panel's chrome-extension:// origin cannot send these cookies directly.
  if (message.type === 'SP_FETCH') {
    (async () => {
      try {
        const { url, options } = message;
        const fetchOptions = {
          method: options.method || 'GET',
          credentials: 'include',
          headers: options.headers || {}
        };
        if (options.body) {
          fetchOptions.body = options.body;
        }

        const response = await fetch(url, fetchOptions);

        // Read the response body
        let data = null;
        let bodyText = '';
        const contentType = response.headers.get('Content-Type') || '';

        if (contentType.includes('application/json')) {
          data = await response.json();
        } else {
          bodyText = await response.text();
        }

        sendResponse({
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          data,
          bodyText
        });
      } catch (e) {
        sendResponse({ error: e.message });
      }
    })();
    return true;
  }
});
