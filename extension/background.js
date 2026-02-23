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
  if (message.type === 'SP_FETCH') {
    (async () => {
      try {
        const { url, options } = message;

        // Diagnostic: check what cookies the browser has for SharePoint
        const spCookies = await chrome.cookies.getAll({ url: 'https://gbtravel.sharepoint.com' });
        console.log('[SP_FETCH]', options.method || 'GET', url);
        console.log('[SP_FETCH] Browser cookies for SP:', spCookies.length,
          '| Names:', spCookies.map(c => c.name).join(', '),
          '| Domains:', [...new Set(spCookies.map(c => c.domain))].join(', '));

        // Build cookie header from browser's cookie jar
        const cookieStr = spCookies.map(c => `${c.name}=${c.value}`).join('; ');

        const fetchOptions = {
          method: options.method || 'GET',
          headers: { ...options.headers }
        };
        if (options.body) {
          fetchOptions.body = options.body;
        }

        // Strategy: use credentials:'omit' and manually attach cookies.
        // In MV3 service workers, credentials:'include' uses the SW's own
        // cookie jar (which is empty). The chrome.cookies API reads the
        // BROWSER's cookies, which is what we need.
        fetchOptions.credentials = 'omit';
        if (cookieStr) {
          fetchOptions.headers['Cookie'] = cookieStr;
        }

        let response = await fetch(url, fetchOptions);
        console.log('[SP_FETCH] Response (manual cookies):', response.status, response.statusText);

        // If manual cookies didn't work (403/401), try credentials:'include'
        // as fallback — in case this Chrome version DOES share the cookie jar
        if (response.status === 401 || response.status === 403) {
          console.log('[SP_FETCH] Manual cookies failed, trying credentials:include...');
          const fallbackOptions = {
            method: options.method || 'GET',
            credentials: 'include',
            headers: { ...options.headers }
          };
          if (options.body) {
            fallbackOptions.body = options.body;
          }
          response = await fetch(url, fallbackOptions);
          console.log('[SP_FETCH] Response (credentials:include):', response.status, response.statusText);
        }

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
