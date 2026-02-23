// sidepanel.js — Main controller for the Jira Ticket Logger side panel
// Wires together: message passing, form population, step navigation,
// validation, calculation, and SharePoint submission.

(() => {
  // --- State ---
  const state = {
    ticketType: null,   // 'product' or 'salesforce'
    jiraData: null,     // raw extracted data from content script
    existingItem: null, // SharePoint item if duplicate { id, etag, item }
    isUpdate: false     // true if editing a previously logged ticket
  };

  // --- DOM References ---
  const views = {
    loading: document.getElementById('loading-view'),
    typeSelect: document.getElementById('type-select-view'),
    form: document.getElementById('form-view'),
    review: document.getElementById('review-view'),
    success: document.getElementById('success-view')
  };

  const banners = {
    duplicate: document.getElementById('duplicate-banner'),
    duplicateMsg: document.getElementById('duplicate-message'),
    error: document.getElementById('error-banner'),
    errorMsg: document.getElementById('error-message')
  };

  const stepDots = document.querySelectorAll('.step-dot');

  // Form field IDs
  const FIELD_IDS = {
    ticketNumber: 'field-ticket-number',
    reporter: 'field-reporter',
    assignee: 'field-assignee',
    description: 'field-description',
    createdDate: 'field-created-date',
    overallSavings: 'field-overall-savings',
    impactedArea: 'field-impacted-area',
    impactedAudience: 'field-impacted-audience',
    duration: 'field-duration',
    stakeholder: 'field-stakeholder',
    investmentTime: 'field-investment-time',
    targetDate: 'field-target-date',
    riskItems: 'field-risk-items',
    region: 'field-region',
    status: 'field-status',
    notes: 'field-notes'
  };

  // --- View Management ---

  function showView(viewId) {
    Object.values(views).forEach(v => v.classList.add('hidden'));
    views[viewId].classList.remove('hidden');

    // Update step dots
    const stepMap = { form: 0, review: 1, success: 2 };
    const currentStep = stepMap[viewId] ?? -1;
    stepDots.forEach((dot, i) => {
      dot.classList.remove('active', 'completed');
      if (i === currentStep) dot.classList.add('active');
      else if (i < currentStep) dot.classList.add('completed');
    });
  }

  function showError(message) {
    banners.errorMsg.textContent = message;
    banners.error.classList.remove('hidden');
  }

  function hideError() {
    banners.error.classList.add('hidden');
  }

  function showDuplicateBanner(item) {
    // Use SharePoint's Modified date for "previously logged on" message
    const modified = item.Modified || item.Created;
    let dateStr = '';
    if (modified) {
      const d = new Date(modified);
      if (!isNaN(d)) {
        dateStr = ` on ${d.toLocaleDateString()}`;
      }
    }
    banners.duplicateMsg.textContent = `This ticket was previously logged${dateStr}. Submitting will update the existing entry.`;
    banners.duplicate.classList.remove('hidden');
  }

  // --- Initialization ---

  async function initialize() {
    showView('loading');
    hideError();
    banners.duplicate.classList.add('hidden');
    state.ticketType = null;
    state.jiraData = null;
    state.existingItem = null;
    state.isUpdate = false;

    try {
      // Request Jira data from content script (via background)
      const jiraResponse = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'GET_JIRA_DATA' }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!response || !response.success) {
            reject(new Error(response?.error || 'Unable to read the Jira page. Refresh the Jira tab and reopen the panel.'));
            return;
          }
          resolve(response.data);
        });
      });

      state.jiraData = jiraResponse;

      // Query SharePoint for existing entry (duplicate check)
      let spResult = { exists: false };
      if (state.jiraData.ticketNumber) {
        try {
          spResult = await SharePoint.findByTicketNumber(state.jiraData.ticketNumber);
        } catch (e) {
          // SharePoint error is non-fatal for initial load — form still works
          console.warn('[Jira Ticket Logger] SharePoint query failed:', e.message);
        }
      }

      if (spResult.exists) {
        state.existingItem = spResult;
        state.isUpdate = true;
        showDuplicateBanner(spResult.item);
      }

      // Detect ticket type from components
      const components = (state.jiraData.components || '').split(',').map(c => c.trim().toLowerCase()).filter(Boolean);

      if (components.length === 1 && components[0] === 'product') {
        state.ticketType = 'product';
        showForm();
      } else if (components.length === 1 && components[0] === 'salesforce') {
        state.ticketType = 'salesforce';
        showForm();
      } else {
        // Ambiguous — show type selector
        showView('typeSelect');
      }
    } catch (error) {
      showView('form');
      showError(error.message);
    }
  }

  // --- Form Population ---

  function showForm() {
    populateForm();
    showView('form');
  }

  function populateForm() {
    const data = state.jiraData || {};
    const existing = state.existingItem?.item;

    // Auto-extracted fields (always use fresh Jira data)
    getField('ticketNumber').value = data.ticketNumber || '';
    getField('reporter').value = data.reporter || '';
    getField('assignee').value = data.assignee || '';
    getField('description').value = data.description || '';
    getField('createdDate').value = data.createdDate || '';

    // Show/hide type-specific sections
    const productSection = document.getElementById('product-fields');
    const sfSection = document.getElementById('sf-fields');

    if (state.ticketType === 'product') {
      productSection.classList.remove('hidden');
      sfSection.classList.add('hidden');
    } else {
      productSection.classList.add('hidden');
      sfSection.classList.remove('hidden');

      // Pre-fill region from Jira data
      const region = data.region || '';
      setSelectValue('region', region);
    }

    // If editing, overlay saved analyst-entered fields
    if (existing) {
      if (state.ticketType === 'product') {
        setSelectValue('overallSavings', existing.OverallSavings);
        setSelectValue('impactedArea', existing.ImpactedArea);
        setSelectValue('impactedAudience', existing.ImpactedAudience);
        setSelectValue('duration', existing.Duration);
        setSelectValue('stakeholder', existing.Stakeholder);
        setSelectValue('investmentTime', existing.InvestmentTime);
        getField('targetDate').value = existing.TargetCompleteDate || '';
        getField('riskItems').value = existing.RiskWatchItems || '';
      } else {
        setSelectValue('region', existing.Region || data.region || '');
        setSelectValue('status', existing.TicketStatus);
      }
      getField('notes').value = existing.Notes || '';
    }
  }

  function getField(name) {
    return document.getElementById(FIELD_IDS[name]);
  }

  function setSelectValue(fieldName, value) {
    if (!value) return;
    const select = getField(fieldName);
    if (!select) return;
    // Try exact match
    for (const opt of select.options) {
      if (opt.value === value) {
        select.value = value;
        return;
      }
    }
    // Try case-insensitive match
    const lower = value.toLowerCase();
    for (const opt of select.options) {
      if (opt.value.toLowerCase() === lower) {
        select.value = opt.value;
        return;
      }
    }
  }

  // --- Validation ---

  function validateForm() {
    let valid = true;
    clearValidationErrors();

    // Common required fields
    const commonRequired = ['reporter', 'assignee', 'description', 'createdDate'];
    for (const name of commonRequired) {
      if (!getField(name).value.trim()) {
        showFieldError(name, 'This field is required.');
        valid = false;
      }
    }

    if (state.ticketType === 'product') {
      // All 6 scoring dropdowns required
      const scoringFields = ['overallSavings', 'impactedArea', 'impactedAudience', 'duration', 'stakeholder', 'investmentTime'];
      for (const name of scoringFields) {
        if (!getField(name).value) {
          showFieldError(name, 'Please select an option.');
          valid = false;
        }
      }
      // Risk/Watch Items required
      if (!getField('riskItems').value.trim()) {
        showFieldError('riskItems', 'This field is required.');
        valid = false;
      }
    } else {
      // Salesforce: Status required
      if (!getField('status').value) {
        showFieldError('status', 'Please select a status.');
        valid = false;
      }
    }

    // Scroll to first error
    if (!valid) {
      const firstError = document.querySelector('.form-group.has-error');
      if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    return valid;
  }

  function showFieldError(fieldName, message) {
    const field = getField(fieldName);
    const group = field.closest('.form-group');
    const errorEl = group.querySelector('.error-text');
    group.classList.add('has-error');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.remove('hidden');
    }
  }

  function clearValidationErrors() {
    document.querySelectorAll('.form-group.has-error').forEach(g => {
      g.classList.remove('has-error');
      const err = g.querySelector('.error-text');
      if (err) {
        err.textContent = '';
        err.classList.add('hidden');
      }
    });
  }

  // --- Review Screen ---

  function showReview() {
    if (!validateForm()) return;

    const reviewFields = document.getElementById('review-fields');
    reviewFields.innerHTML = '';

    // Build review data
    const rows = [
      ['Jira Number', getField('ticketNumber').value],
      ['Ticket Type', state.ticketType === 'product' ? 'Product' : 'Salesforce'],
      ['Reporter', getField('reporter').value],
      ['Assignee', getField('assignee').value],
      ['Description', getField('description').value],
      ['Created Date', getField('createdDate').value]
    ];

    if (state.ticketType === 'product') {
      // Calculate rating
      const ratingResult = Calculator.calculateRating({
        overallSavings: getField('overallSavings').value,
        impactedArea: getField('impactedArea').value,
        impactedAudience: getField('impactedAudience').value,
        duration: getField('duration').value,
        stakeholder: getField('stakeholder').value,
        investmentTime: getField('investmentTime').value
      });

      // Show rating badge
      const ratingContainer = document.getElementById('rating-container');
      const ratingBadge = document.getElementById('rating-badge');
      ratingContainer.classList.remove('hidden');
      ratingBadge.textContent = ratingResult.rating;
      ratingBadge.className = 'rating-badge rating-' + ratingResult.rating.toLowerCase().replace(/\s+/g, '-');

      // Show scoring breakdown
      const breakdown = document.getElementById('scoring-breakdown');
      breakdown.classList.remove('hidden');
      document.getElementById('review-roi-score').textContent = ratingResult.roiScore;
      document.getElementById('review-roi-level').textContent = ratingResult.roiLevel;
      document.getElementById('review-effort-score').textContent = ratingResult.effortScore;
      document.getElementById('review-effort-level').textContent = ratingResult.effortLevel;

      rows.push(
        ['Overall Savings', getField('overallSavings').value],
        ['Impacted Area', getField('impactedArea').value],
        ['Impacted Audience', getField('impactedAudience').value],
        ['Duration', getField('duration').value],
        ['Stakeholder', getField('stakeholder').value],
        ['Investment Time', getField('investmentTime').value],
        ['Target Complete Date', getField('targetDate').value || '(not set)'],
        ['Risk/Watch Items', getField('riskItems').value]
      );
    } else {
      // Hide rating for Salesforce
      document.getElementById('rating-container').classList.add('hidden');
      document.getElementById('scoring-breakdown').classList.add('hidden');

      rows.push(
        ['Region', getField('region').value || '(not set)'],
        ['Status', getField('status').value]
      );
    }

    // Notes (both types)
    const notes = getField('notes').value;
    if (notes) rows.push(['Notes', notes]);

    // Render review rows
    for (const [label, value] of rows) {
      const row = document.createElement('div');
      row.className = 'review-row';
      row.innerHTML = `<span class="review-label">${escapeHtml(label)}</span><span class="review-value">${escapeHtml(value)}</span>`;
      reviewFields.appendChild(row);
    }

    showView('review');
  }

  // --- Submission ---

  async function submitToSharePoint() {
    const submitBtn = document.getElementById('submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    // Show overlay
    const overlay = document.createElement('div');
    overlay.className = 'submitting-overlay';
    overlay.innerHTML = '<div class="spinner"></div><p>Saving to SharePoint...</p>';
    document.body.appendChild(overlay);

    try {
      const fieldData = assembleSharePointData();

      if (state.isUpdate && state.existingItem) {
        await SharePoint.updateItem(state.existingItem.id, fieldData, state.existingItem.etag);
      } else {
        await SharePoint.createItem(fieldData);
      }

      // Show success
      const ticketNum = getField('ticketNumber').value;
      const action = state.isUpdate ? 'updated' : 'logged';
      document.getElementById('success-title').textContent = `Ticket ${action}!`;
      document.getElementById('success-message').textContent = `Ticket ${ticketNum} ${action} successfully.`;

      showView('success');
    } catch (error) {
      showError(`Failed to save: ${error.message}`);
      showView('review');
    } finally {
      overlay.remove();
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit';
    }
  }

  function assembleSharePointData() {
    const ticketNumber = getField('ticketNumber').value;
    const data = {
      Title: ticketNumber,
      TicketNumber: ticketNumber,
      TicketType: state.ticketType === 'product' ? 'Product' : 'Salesforce',
      Description: getField('description').value,
      Reporter: getField('reporter').value,
      Assignee: getField('assignee').value,
      CreatedDate: getField('createdDate').value,
      SubmittedBy: getField('assignee').value,
      Notes: getField('notes').value || null
    };

    if (state.ticketType === 'product') {
      data.OverallSavings = getField('overallSavings').value;
      data.ImpactedArea = getField('impactedArea').value;
      data.ImpactedAudience = getField('impactedAudience').value;
      data.Duration = getField('duration').value;
      data.Stakeholder = getField('stakeholder').value;
      data.InvestmentTime = getField('investmentTime').value;
      data.TargetCompleteDate = getField('targetDate').value || null;
      data.RiskWatchItems = getField('riskItems').value;

      // Calculate and store the rating
      const result = Calculator.calculateRating({
        overallSavings: data.OverallSavings,
        impactedArea: data.ImpactedArea,
        impactedAudience: data.ImpactedAudience,
        duration: data.Duration,
        stakeholder: data.Stakeholder,
        investmentTime: data.InvestmentTime
      });
      data.CalculatedRating = result.rating;
    } else {
      data.Region = getField('region').value || null;
      data.TicketStatus = getField('status').value;
    }

    return data;
  }

  // --- Utility ---

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Event Listeners ---

  // Type selection buttons
  document.getElementById('type-product-btn').addEventListener('click', () => {
    state.ticketType = 'product';
    showForm();
  });

  document.getElementById('type-salesforce-btn').addEventListener('click', () => {
    state.ticketType = 'salesforce';
    showForm();
  });

  // Review & Submit button
  document.getElementById('review-btn').addEventListener('click', showReview);

  // Go Back button
  document.getElementById('back-btn').addEventListener('click', () => {
    showView('form');
  });

  // Submit button
  document.getElementById('submit-btn').addEventListener('click', submitToSharePoint);

  // Log Another button
  document.getElementById('log-another-btn').addEventListener('click', initialize);

  // Close Panel button
  document.getElementById('close-panel-btn').addEventListener('click', () => {
    window.close();
  });

  // Error Retry button
  document.getElementById('error-retry-btn').addEventListener('click', () => {
    hideError();
    initialize();
  });

  // --- Start ---
  document.addEventListener('DOMContentLoaded', initialize);
})();
