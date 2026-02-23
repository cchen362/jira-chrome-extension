// sharepoint.js — SharePoint REST API module
// All fetch calls are routed through the background service worker
// (which has host_permissions and access to SharePoint session cookies).

const SharePoint = (() => {
  const SITE_URL = 'https://gbtravel.sharepoint.com/sites/GlobalEfficiencyTeam';
  const LIST_NAME = 'JiraTicketLog';
  const ENTITY_TYPE = 'SP.Data.JiraTicketLogListItem';

  // Form digest cache
  let digestCache = { value: null, timestamp: 0 };
  const DIGEST_TTL_MS = 25 * 60 * 1000; // 25 minutes (expires at 30)

  /**
   * Send a fetch request through the background service worker.
   * The background has host_permissions for gbtravel.sharepoint.com,
   * so it can send cookies that the side panel origin cannot.
   */
  function bgFetch(url, options) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'SP_FETCH', url, options },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!response) {
            reject(new Error('No response from background worker.'));
            return;
          }
          if (response.error) {
            reject(new Error(response.error));
            return;
          }
          resolve(response);
        }
      );
    });
  }

  /**
   * Get a valid form digest for write operations.
   */
  async function getFormDigest() {
    const now = Date.now();
    if (digestCache.value && (now - digestCache.timestamp) < DIGEST_TTL_MS) {
      return digestCache.value;
    }

    const result = await bgFetch(`${SITE_URL}/_api/contextinfo`, {
      method: 'POST',
      headers: { 'Accept': 'application/json;odata=verbose' }
    });

    if (!result.ok) {
      if (result.status === 401 || result.status === 403) {
        throw new Error('Not authenticated to SharePoint. Open SharePoint in another tab, log in, then try again.');
      }
      throw new Error(`Failed to get form digest: ${result.status} ${result.statusText}`);
    }

    digestCache.value = result.data.d.GetContextWebInformation.FormDigestValue;
    digestCache.timestamp = now;
    return digestCache.value;
  }

  /**
   * Query SharePoint for an existing item with the given ticket number.
   */
  async function findByTicketNumber(ticketNumber) {
    const filter = encodeURIComponent(`TicketNumber eq '${ticketNumber}'`);
    const url = `${SITE_URL}/_api/web/lists/getbytitle('${LIST_NAME}')/items?$filter=${filter}&$top=1`;

    const result = await bgFetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json;odata=verbose' }
    });

    if (!result.ok) {
      if (result.status === 401 || result.status === 403) {
        throw new Error('Not authenticated to SharePoint. Open SharePoint in another tab, log in, then try again.');
      }
      throw new Error(`Failed to query SharePoint: ${result.status} ${result.statusText}`);
    }

    const results = result.data.d.results;
    if (results.length === 0) {
      return { exists: false };
    }

    const item = results[0];
    return {
      exists: true,
      item,
      id: item.Id,
      etag: item.__metadata.etag
    };
  }

  /**
   * Create a new item in the SharePoint list.
   */
  async function createItem(fieldData) {
    const digest = await getFormDigest();
    const url = `${SITE_URL}/_api/web/lists/getbytitle('${LIST_NAME}')/items`;

    const body = {
      __metadata: { type: ENTITY_TYPE },
      ...fieldData
    };

    const result = await bgFetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json;odata=verbose',
        'Content-Type': 'application/json;odata=verbose',
        'X-RequestDigest': digest
      },
      body: JSON.stringify(body)
    });

    if (!result.ok) {
      if (result.status === 401 || result.status === 403) {
        throw new Error('Not authenticated to SharePoint. Open SharePoint in another tab, log in, then try again.');
      }
      throw new Error(`Failed to create item: ${result.status} ${result.statusText}. ${result.bodyText || ''}`);
    }

    return result.data;
  }

  /**
   * Update an existing item in the SharePoint list.
   */
  async function updateItem(itemId, fieldData, etag) {
    const digest = await getFormDigest();
    const url = `${SITE_URL}/_api/web/lists/getbytitle('${LIST_NAME}')/items(${itemId})`;

    const body = {
      __metadata: { type: ENTITY_TYPE },
      ...fieldData
    };

    const result = await bgFetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json;odata=verbose',
        'Content-Type': 'application/json;odata=verbose',
        'X-RequestDigest': digest,
        'X-HTTP-Method': 'MERGE',
        'If-Match': etag
      },
      body: JSON.stringify(body)
    });

    if (!result.ok) {
      if (result.status === 401 || result.status === 403) {
        throw new Error('Not authenticated to SharePoint. Open SharePoint in another tab, log in, then try again.');
      }
      if (result.status === 412) {
        throw new Error('This item was modified by someone else. Please refresh and try again.');
      }
      throw new Error(`Failed to update item: ${result.status} ${result.statusText}. ${result.bodyText || ''}`);
    }
  }

  // Public API
  return { getFormDigest, findByTicketNumber, createItem, updateItem };
})();
