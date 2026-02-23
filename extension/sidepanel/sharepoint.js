// sharepoint.js — SharePoint REST API module
// Handles form digest, CRUD operations, and duplicate detection for JiraTicketLog list.

const SharePoint = (() => {
  const SITE_URL = 'https://gbtravel.sharepoint.com/sites/GlobalEfficiencyTeam';
  const LIST_NAME = 'JiraTicketLog';
  const ENTITY_TYPE = 'SP.Data.JiraTicketLogListItem';

  // Form digest cache
  let digestCache = { value: null, timestamp: 0 };
  const DIGEST_TTL_MS = 25 * 60 * 1000; // 25 minutes (expires at 30)

  /**
   * Get a valid form digest for write operations.
   * Caches the digest and refreshes when expired.
   */
  async function getFormDigest() {
    const now = Date.now();
    if (digestCache.value && (now - digestCache.timestamp) < DIGEST_TTL_MS) {
      return digestCache.value;
    }

    const response = await fetch(`${SITE_URL}/_api/contextinfo`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Accept': 'application/json;odata=verbose'
      }
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('Not authenticated to SharePoint. Open SharePoint in another tab, log in, then try again.');
      }
      throw new Error(`Failed to get form digest: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    digestCache.value = data.d.GetContextWebInformation.FormDigestValue;
    digestCache.timestamp = now;
    return digestCache.value;
  }

  /**
   * Query SharePoint for an existing item with the given ticket number.
   * @param {string} ticketNumber - e.g., "EGEGOET-3299"
   * @returns {Object} { exists: boolean, item?: Object, id?: number, etag?: string }
   */
  async function findByTicketNumber(ticketNumber) {
    const filter = encodeURIComponent(`TicketNumber eq '${ticketNumber}'`);
    const url = `${SITE_URL}/_api/web/lists/getbytitle('${LIST_NAME}')/items?$filter=${filter}&$top=1`;

    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'application/json;odata=verbose'
      }
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('Not authenticated to SharePoint. Open SharePoint in another tab, log in, then try again.');
      }
      throw new Error(`Failed to query SharePoint: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const results = data.d.results;

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
   * @param {Object} fieldData - Column name → value pairs (use internal names)
   * @returns {Object} The created item
   */
  async function createItem(fieldData) {
    const digest = await getFormDigest();
    const url = `${SITE_URL}/_api/web/lists/getbytitle('${LIST_NAME}')/items`;

    const body = {
      __metadata: { type: ENTITY_TYPE },
      ...fieldData
    };

    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Accept': 'application/json;odata=verbose',
        'Content-Type': 'application/json;odata=verbose',
        'X-RequestDigest': digest
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      if (response.status === 401 || response.status === 403) {
        throw new Error('Not authenticated to SharePoint. Open SharePoint in another tab, log in, then try again.');
      }
      throw new Error(`Failed to create item: ${response.status} ${response.statusText}. ${errorText}`);
    }

    return (await response.json()).d;
  }

  /**
   * Update an existing item in the SharePoint list.
   * @param {number} itemId - The SharePoint item ID
   * @param {Object} fieldData - Column name → value pairs to update
   * @param {string} etag - The item's etag for concurrency control
   * @returns {void}
   */
  async function updateItem(itemId, fieldData, etag) {
    const digest = await getFormDigest();
    const url = `${SITE_URL}/_api/web/lists/getbytitle('${LIST_NAME}')/items(${itemId})`;

    const body = {
      __metadata: { type: ENTITY_TYPE },
      ...fieldData
    };

    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Accept': 'application/json;odata=verbose',
        'Content-Type': 'application/json;odata=verbose',
        'X-RequestDigest': digest,
        'X-HTTP-Method': 'MERGE',
        'If-Match': etag
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      if (response.status === 401 || response.status === 403) {
        throw new Error('Not authenticated to SharePoint. Open SharePoint in another tab, log in, then try again.');
      }
      if (response.status === 412) {
        throw new Error('This item was modified by someone else. Please refresh and try again.');
      }
      throw new Error(`Failed to update item: ${response.status} ${response.statusText}. ${errorText}`);
    }
  }

  // Public API
  return { getFormDigest, findByTicketNumber, createItem, updateItem };
})();
