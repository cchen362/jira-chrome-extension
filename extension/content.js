// content.js — Jira DOM scraper for Data Center v10.3.x
// Runs on jira.amexgbt.com/browse/* pages
// Extracts ticket data and responds to messages from the side panel (via background)

// --- Extraction Helpers ---

/**
 * Try multiple strategies in order, return the first non-empty result.
 * Each strategy is a function that returns a string or null.
 */
function tryStrategies(...strategies) {
  for (const fn of strategies) {
    try {
      const result = fn();
      if (result && result.trim()) return result.trim();
    } catch (e) {
      // Strategy failed, try next
    }
  }
  return '';
}

/**
 * Find an element by searching for a label text, then return the adjacent value.
 * Jira detail rows typically use: <label>Label:</label> <value>...</value>
 */
function findByLabel(labelText) {
  // Strategy 1: Look for <strong> or <label> containing the text
  const allLabels = document.querySelectorAll('strong, label, .wrap .name, dt');
  for (const el of allLabels) {
    if (el.textContent.trim().replace(':', '') === labelText) {
      // Try next sibling, parent's next sibling, or adjacent element
      const sibling = el.nextElementSibling;
      if (sibling) return sibling.textContent.trim();

      const parent = el.parentElement;
      if (parent) {
        const nextSibling = parent.nextElementSibling;
        if (nextSibling) return nextSibling.textContent.trim();
      }
    }
  }
  return null;
}

// --- Field Extractors ---

function extractTicketNumber() {
  return tryStrategies(
    // Primary: URL regex
    () => {
      const match = window.location.pathname.match(/(?:\/browse\/|\/queues\/custom\/\d+\/)([A-Z]+-\d+)/);
      return match ? match[1] : null;
    },
    // Fallback: DOM element
    () => {
      const el = document.getElementById('key-val');
      return el ? el.textContent : null;
    },
    // Fallback: heading area
    () => {
      const el = document.querySelector('[data-issue-key]');
      return el ? el.getAttribute('data-issue-key') : null;
    }
  );
}

function extractReporter() {
  return tryStrategies(
    () => {
      const el = document.getElementById('reporter-val');
      return el ? el.textContent : null;
    },
    () => findByLabel('Reporter'),
    () => {
      // People section in right sidebar
      const peopleModule = document.getElementById('peoplemodule');
      if (!peopleModule) return null;
      const items = peopleModule.querySelectorAll('.people-details .item');
      for (const item of items) {
        if (item.querySelector('.name')?.textContent.includes('Reporter')) {
          const val = item.querySelector('.value, .user-hover');
          return val ? val.textContent : null;
        }
      }
      return null;
    }
  );
}

function extractAssignee() {
  return tryStrategies(
    () => {
      const el = document.getElementById('assignee-val');
      return el ? el.textContent : null;
    },
    () => findByLabel('Assignee'),
    () => {
      const peopleModule = document.getElementById('peoplemodule');
      if (!peopleModule) return null;
      const items = peopleModule.querySelectorAll('.people-details .item');
      for (const item of items) {
        if (item.querySelector('.name')?.textContent.includes('Assignee')) {
          const val = item.querySelector('.value, .user-hover');
          return val ? val.textContent : null;
        }
      }
      return null;
    }
  );
}

function extractDescription() {
  return tryStrategies(
    // Primary: Find the Description heading and get the content block that follows it.
    // The Description is a collapsible section separate from the Details block.
    // IMPORTANT: Do NOT use .closest('.module') — that climbs to the entire Details section.
    () => {
      // Look for all heading elements that say "Description"
      const headings = document.querySelectorAll('h2, h3, .toggle-title, .aui-toggle-header-button-label');
      for (const heading of headings) {
        if (heading.textContent.trim() !== 'Description') continue;

        // Walk up only to the nearest toggle-wrap, header, or heading container — NOT to .module
        const container = heading.closest('.toggle-wrap, .aui-toggle-header, [id*="description"]');
        if (container) {
          // Look for the content block within or after this container
          const content = container.querySelector('.user-content-block, .mod-content, .field-ignore-highlight');
          if (content) return content.textContent;
          // Try next sibling of the container
          const next = container.nextElementSibling;
          if (next) {
            const nested = next.querySelector('.user-content-block, .mod-content, .field-ignore-highlight');
            if (nested) return nested.textContent;
            return next.textContent;
          }
        }

        // If no container, try siblings of the heading itself
        let sibling = heading.parentElement?.nextElementSibling;
        if (sibling) {
          const content = sibling.querySelector('.user-content-block, .mod-content, .field-ignore-highlight');
          if (content) return content.textContent;
        }
      }
      return null;
    },
    // Fallback: Direct ID-based selectors
    () => {
      const el = document.querySelector('#description-val .user-content-block');
      return el ? el.textContent : null;
    },
    () => {
      const el = document.querySelector('#descriptionmodule .user-content-block');
      return el ? el.textContent : null;
    },
    () => {
      const el = document.querySelector('#descriptionmodule .mod-content');
      return el ? el.textContent : null;
    },
    () => {
      const el = document.getElementById('description-val');
      return el ? el.textContent : null;
    }
  );
}

function extractCreatedDate() {
  // Hybrid approach:
  // 1. Try visible text first (avoids UTC timezone-shift bugs on absolute dates)
  // 2. If visible text is a relative date ("3 days ago"), fall back to datetime attribute
  //    but parse it WITHOUT new Date() to avoid timezone conversion
  return tryStrategies(
    // Primary: time element — check visible text, fall back to datetime attr for relative dates
    () => {
      const el = document.querySelector('#created-val time, #create-date time');
      if (!el) return null;
      const visibleText = stripTime(el.textContent);
      if (visibleText && !isRelativeDate(visibleText)) return visibleText;
      // Relative date detected — use datetime attribute, parsed safely
      return dateFromAttr(el.getAttribute('datetime'));
    },
    // Fallback: #created-val text with same hybrid logic
    () => {
      const el = document.getElementById('created-val');
      if (!el) return null;
      const time = el.querySelector('time');
      const visibleText = stripTime(time ? time.textContent : el.textContent);
      if (visibleText && !isRelativeDate(visibleText)) return visibleText;
      if (time) return dateFromAttr(time.getAttribute('datetime'));
      return null;
    },
    // Fallback: Dates section label search
    () => {
      const datesModule = document.getElementById('datesmodule');
      if (!datesModule) return null;
      const items = datesModule.querySelectorAll('.item, dl dt');
      for (const item of items) {
        if (item.textContent.includes('Created')) {
          const val = item.nextElementSibling || item.parentElement?.nextElementSibling;
          if (val) {
            const time = val.querySelector('time');
            if (time) {
              const visibleText = stripTime(time.textContent);
              if (visibleText && !isRelativeDate(visibleText)) return visibleText;
              return dateFromAttr(time.getAttribute('datetime'));
            }
            return stripTime(val.textContent);
          }
        }
      }
      return null;
    },
    () => {
      const val = findByLabel('Created');
      if (val && !isRelativeDate(val)) return stripTime(val);
      return null;
    }
  );
}

/**
 * Strip time portion from a Jira date string.
 * Input:  "24/Nov/25 4:33 PM" or "24/Nov/2025 4:33 PM"
 * Output: "24/Nov/25" or "24/Nov/2025"
 */
function stripTime(dateStr) {
  if (!dateStr) return null;
  // Remove time portion (everything after the date)
  const stripped = dateStr.trim().replace(/\s+\d{1,2}:\d{2}\s*(AM|PM|am|pm)?.*$/, '');
  return stripped || dateStr.trim();
}

/**
 * Check if a string is a relative date like "3 days ago", "yesterday", "last week", etc.
 */
function isRelativeDate(str) {
  if (!str) return false;
  const lower = str.toLowerCase().trim();
  return /^(today|yesterday|last\s|(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago)/.test(lower);
}

/**
 * Extract a date string from a datetime attribute (ISO 8601).
 * Parses the date components directly to avoid timezone conversion bugs.
 * Input:  "2026-02-20T08:33:00+0000" or "2026-02-20T08:33:00.000+0530"
 * Output: "20/Feb/26"
 */
function dateFromAttr(datetimeAttr) {
  if (!datetimeAttr) return null;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  // Match the date portion before the T — this is the LOCAL date Jira intended
  const match = datetimeAttr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = match[1].slice(2); // "2026" → "26"
  const monthIdx = parseInt(match[2], 10) - 1;
  const day = parseInt(match[3], 10);
  if (monthIdx < 0 || monthIdx > 11) return null;
  return `${day}/${months[monthIdx]}/${year}`;
}

function extractComponents() {
  return tryStrategies(
    () => {
      const container = document.getElementById('components-val');
      if (!container) return null;
      const links = container.querySelectorAll('a, span.component');
      if (links.length === 0) return null;
      return Array.from(links).map(l => l.textContent.trim()).filter(Boolean).join(',');
    },
    () => {
      const container = document.getElementById('components-field');
      if (!container) return null;
      const links = container.querySelectorAll('a, span');
      if (links.length === 0) return null;
      return Array.from(links).map(l => l.textContent.trim()).filter(Boolean).join(',');
    },
    () => {
      const val = findByLabel('Component/s');
      return val || null;
    }
  );
}

function extractRegion() {
  return tryStrategies(
    // Primary: Known custom field ID
    () => {
      const el = document.getElementById('customfield_17039-val');
      return el ? el.textContent : null;
    },
    // Fallback: data-field-id attribute
    () => {
      const el = document.querySelector('[data-field-id="customfield_17039"]');
      if (!el) return null;
      const val = el.querySelector('.value, .field-value');
      return val ? val.textContent : el.textContent;
    },
    // Fallback: Label search
    () => findByLabel('Region')
  );
}

// --- Main Extraction ---

function extractAll() {
  return {
    ticketNumber: extractTicketNumber(),
    reporter: extractReporter(),
    assignee: extractAssignee(),
    description: extractDescription(),
    createdDate: extractCreatedDate(),
    components: extractComponents(),
    region: extractRegion()
  };
}

// --- Message Listener ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXTRACT_JIRA_DATA') {
    const data = extractAll();
    console.log('[Jira Ticket Logger] Extracted data:', data);
    sendResponse({ success: true, data });
  }
  // No async work needed, so no return true
});
