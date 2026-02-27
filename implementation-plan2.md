# Implementation Plan 2: Product Sub-Category, Stakeholder Rename, Status Auto-Extract
**Version:** 1.0
**Date:** 2026-02-24
**Status:** COMPLETE (2026-02-24)
**Prerequisite:** Phase 2 complete. All existing functionality working.

---

## Summary

Three changes to the Jira Ticket Logger Chrome Extension:

1. **Stakeholder dropdown rename** — 2 option labels changed
2. **Product sub-category branching** — new popup dialog routes Product tickets into auto-accepted (no scoring) or full form with scoring
3. **Status auto-extraction for BOTH ticket types** — extract Jira status from page, pre-fill editable dropdown, updated dropdown options

---

## Pre-Conditions (Already Done by User)

- SharePoint List `Stakeholder` column updated with new option labels
- SharePoint List `TicketStatus` column updated with new options: New Request, In Progress, On Hold, Pending Review, RTB Submitted, RTB Completed, Closed
- SharePoint List `ProductCategory` column created (Choice: Product Roadmap, Quick Wins/Impact to TCE, Others)

---

## Step 1: Rename Stakeholder Options

**Files:** `extension/sidepanel/sidepanel.html`, `extension/sidepanel/calculator.js`

### 1a. Update HTML dropdown — `sidepanel.html` lines 141-143

**Before:**
```html
<option value="Strong Engagement">Strong Engagement</option>
<option value="Need to Change">Need to Change</option>
```

**After:**
```html
<option value="Needs Engagement">Needs Engagement</option>
<option value="Need to Change Roadmap">Need to Change Roadmap</option>
```

### 1b. Update SCORE_MAP keys — `calculator.js` lines 23-25

**Before:**
```js
'Strong Engagement': 5,
'Need to Change': 10,
```

**After:**
```js
'Needs Engagement': 5,
'Need to Change Roadmap': 10,
```

### Verify Step 1
- Open a Product ticket, navigate to Others flow (once Step 4 is done) or just the form
- Confirm Stakeholder dropdown shows: No Dependency, Needs Engagement, Need to Change Roadmap
- Confirm calculator still works (select all 6 fields, click Review & Submit, rating should compute correctly)

---

## Step 2: Status Auto-Extraction + Move to Common Section

**Files:** `extension/content.js`, `extension/sidepanel/sidepanel.html`, `extension/sidepanel/sidepanel.js`

### 2a. Add `extractStatus()` to content.js

Add this new function before `extractAll()` (before line 304):

```js
function extractStatus() {
  return tryStrategies(
    // Primary: Jira DC opsbar status button — contains a <span class="dropdown-text">
    // The button class includes the status category, e.g.:
    //   opsbar-transitions__status-category_indeterminate
    //   opsbar-transitions__status-category_done
    //   opsbar-transitions__status-category_new
    () => {
      const el = document.querySelector('[class*="opsbar-transitions__status-category"] .dropdown-text');
      return el ? el.textContent : null;
    },
    // Fallback: #status-val element (older Jira layouts)
    () => {
      const el = document.getElementById('status-val');
      return el ? el.textContent : null;
    },
    // Fallback: label-based search
    () => findByLabel('Status')
  );
}
```

### 2b. Add `status` to `extractAll()` return object — content.js line 307-315

**Before:**
```js
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
```

**After:**
```js
function extractAll() {
  return {
    ticketNumber: extractTicketNumber(),
    reporter: extractReporter(),
    assignee: extractAssignee(),
    description: extractDescription(),
    createdDate: extractCreatedDate(),
    components: extractComponents(),
    region: extractRegion(),
    status: extractStatus()
  };
}
```

### 2c. Update Status dropdown options — sidepanel.html lines 191-199

Replace the entire Status `<select>` options. Also remove the `<div class="form-group">` for Status from the `#sf-fields` section entirely (it will be moved to the common section in step 2d).

**Remove from `#sf-fields`** (lines 189-201):
```html
<div class="form-group">
  <label for="field-status">Status <span class="required">*</span></label>
  <select id="field-status">
    <option value="">-- Select --</option>
    <option value="New">New</option>
    <option value="In Progress">In Progress</option>
    <option value="Hold">Hold</option>
    <option value="Complete">Complete</option>
    <option value="RTB Submitted">RTB Submitted</option>
    <option value="RTB Completed">RTB Completed</option>
  </select>
  <span class="error-text hidden"></span>
</div>
```

### 2d. Add Status to common "Ticket Details" section — sidepanel.html

Insert the Status dropdown into the common section (after the Created Date field, before the closing `</section>` of the first form section — after line 87):

```html
<div class="form-group">
  <label for="field-status">Status <span class="required">*</span></label>
  <select id="field-status">
    <option value="">-- Select --</option>
    <option value="New Request">New Request</option>
    <option value="In Progress">In Progress</option>
    <option value="On Hold">On Hold</option>
    <option value="Pending Review">Pending Review</option>
    <option value="RTB Submitted">RTB Submitted</option>
    <option value="RTB Completed">RTB Completed</option>
    <option value="Closed">Closed</option>
  </select>
  <span class="error-text hidden"></span>
</div>
```

### 2e. Auto-fill Status in `populateForm()` — sidepanel.js

Add auto-fill for Status in the **common** section of `populateForm()`, after the other auto-extracted fields (after line 187):

```js
// Auto-fill status from Jira (for both ticket types)
setSelectValue('status', data.status || '');
```

For the **edit flow** — the existing logic at line 218 (`setSelectValue('status', existing.TicketStatus)`) needs to be moved to the common edit section. Currently it's inside the `else` (SF-only) block. Move it to run for BOTH ticket types, after the type-specific edit blocks (after line 221, before the closing `}`).

**Edit overlay for status** (common, both types):
```js
if (existing) {
  // ... existing type-specific blocks ...

  // Status applies to both types — saved value overrides auto-extracted
  if (existing.TicketStatus) {
    setSelectValue('status', existing.TicketStatus);
  }

  getField('notes').value = existing.Notes || '';
}
```

### 2f. Move Status validation to common — sidepanel.js

Move the Status validation out of the SF-specific block (lines 279-283) to the common required fields section.

**Before** (lines 256-283):
```js
const commonRequired = ['reporter', 'assignee', 'description', 'createdDate'];
// ...
} else {
  // Salesforce: Status required
  if (!getField('status').value) {
    showFieldError('status', 'Please select a status.');
    valid = false;
  }
}
```

**After:**
```js
const commonRequired = ['reporter', 'assignee', 'description', 'createdDate'];
// ...validate common fields...

// Status required for both ticket types
if (!getField('status').value) {
  showFieldError('status', 'Please select a status.');
  valid = false;
}

if (state.ticketType === 'product') {
  // scoring validation (unchanged)...
} else {
  // SF-specific validation (Status check removed from here)
}
```

### 2g. Update review screen — sidepanel.js

Move the Status row from the SF-specific review block to the common rows (add after Created Date, before the type-specific branches):

```js
const rows = [
  ['Jira Number', getField('ticketNumber').value],
  ['Ticket Type', state.ticketType === 'product' ? 'Product' : 'Salesforce'],
  ['Reporter', getField('reporter').value],
  ['Assignee', getField('assignee').value],
  ['Description', getField('description').value],
  ['Created Date', getField('createdDate').value],
  ['Status', getField('status').value]        // <-- ADD THIS
];
```

Remove `['Status', getField('status').value]` from the SF-specific block (line 378).

### 2h. Update `assembleSharePointData()` — sidepanel.js

Move `data.TicketStatus` from the SF-specific block to the common section:

**Before** (line 472):
```js
} else {
  data.Region = getField('region').value || null;
  data.TicketStatus = getField('status').value;
}
```

**After:**
```js
// Common to both types
data.TicketStatus = getField('status').value;

if (state.ticketType === 'product') {
  // ...product fields...
} else {
  data.Region = getField('region').value || null;
  // TicketStatus already set above
}
```

### Verify Step 2
- Open a **Salesforce** ticket → Status dropdown should auto-fill from Jira page, can be overridden
- Open a **Product** ticket → Status dropdown also appears and auto-fills
- Dropdown options: New Request, In Progress, On Hold, Pending Review, RTB Submitted, RTB Completed, Closed
- If Jira status doesn't match any option (case-insensitive), dropdown stays at "-- Select --"
- Review screen shows Status for both types
- SP payload includes `TicketStatus` for both types

---

## Step 3: Product Sub-Category — State & Helpers

**File:** `extension/sidepanel/sidepanel.js`

### 3a. Add `productCategory` to state object (line 7-12)

**Before:**
```js
const state = {
  ticketType: null,
  jiraData: null,
  existingItem: null,
  isUpdate: false
};
```

**After:**
```js
const state = {
  ticketType: null,
  productCategory: null,   // 'Product Roadmap' | 'Quick Wins/Impact to TCE' | 'Others' | null
  jiraData: null,
  existingItem: null,
  isUpdate: false
};
```

### 3b. Add helper constant and function (after the state object, before DOM references)

```js
const AUTO_ACCEPTED_CATEGORIES = ['Product Roadmap', 'Quick Wins/Impact to TCE'];

function isAutoAccepted() {
  return AUTO_ACCEPTED_CATEGORIES.includes(state.productCategory);
}
```

### 3c. Reset productCategory in `initialize()` (after line 112)

Add `state.productCategory = null;` alongside the other state resets.

---

## Step 4: Product Sub-Category — HTML & CSS

**Files:** `extension/sidepanel/sidepanel.html`, `extension/sidepanel/sidepanel.css`

### 4a. Add Product Category View — sidepanel.html

Insert after the `#type-select-view` closing `</div>` (after line 51), before the `#form-view`:

```html
<!-- Product Category Select View -->
<div id="product-category-view" class="view hidden">
  <div class="category-select-container">
    <h2>Select Product Category</h2>
    <p>Choose the category that best fits this ticket:</p>
    <div class="category-options">

      <button type="button" class="category-card" data-category="Product Roadmap">
        <div class="category-header">
          <span class="category-title">Product Roadmap</span>
          <span class="category-tag">Auto-accepted</span>
        </div>
        <p class="category-desc">Jiras which Product raise and we need to start working on.</p>
      </button>

      <button type="button" class="category-card" data-category="Quick Wins/Impact to TCE">
        <div class="category-header">
          <span class="category-title">Quick Wins / Impact to TCE</span>
          <span class="category-tag">Auto-accepted</span>
        </div>
        <ul class="category-desc">
          <li>General questions that can be answered within 1–2 messages</li>
          <li>Not valid Jiras, e.g. needs to be redirected to correct team such as EGTS etc.</li>
          <li>Topics which will stop work for TCE and need urgent attention, e.g. changes with a supplier</li>
        </ul>
      </button>

      <button type="button" class="category-card" data-category="Others">
        <div class="category-header">
          <span class="category-title">Others</span>
        </div>
        <p class="category-desc">For all other Jiras which need to be given a rating.</p>
      </button>

    </div>
  </div>
</div>
```

**Design notes:**
- Quick Wins uses `<ul>` with `<li>` items for clear separation of 3 distinct points
- Product Roadmap and Quick Wins have a green "Auto-accepted" tag badge
- Others has no tag
- Each card uses `data-category` attribute — a single delegated listener handles all 3

### 4b. Wrap scoring dropdowns — sidepanel.html

Inside `#product-fields` (lines 91-171), wrap from the `<h2>Priority Scoring</h2>` through the last scoring dropdown (`</div>` after Investment Time, line 157) in a new `<div id="scoring-fields">`.

**Before:**
```html
<section id="product-fields" class="form-section hidden">
  <h2>Priority Scoring</h2>

  <div class="form-group">
    <label for="field-overall-savings">Overall Savings...
  <!-- ... all 6 scoring dropdowns ... -->
  </div>

  <h2>Additional Details</h2>
  <!-- Target Date, Risk/Watch Items -->
</section>
```

**After:**
```html
<section id="product-fields" class="form-section hidden">
  <div id="scoring-fields">
    <h2>Priority Scoring</h2>

    <div class="form-group">
      <label for="field-overall-savings">Overall Savings...
    <!-- ... all 6 scoring dropdowns ... -->
    </div>
  </div>

  <h2>Additional Details</h2>
  <!-- Target Date, Risk/Watch Items — NOT inside scoring-fields -->
</section>
```

### 4c. Add CSS for category cards — sidepanel.css

Insert after the Type Select section (after line 204, before `/* === Form === */`):

```css
/* === Product Category Select === */
.category-select-container {
  text-align: center;
  padding: 24px 16px;
}

.category-select-container h2 {
  font-size: 16px;
  margin-bottom: 6px;
  color: #172B4D;
}

.category-select-container > p {
  color: #6B778C;
  margin-bottom: 20px;
  font-size: 13px;
}

.category-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.category-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  padding: 14px 16px;
  border: 2px solid #DFE1E6;
  background: #fff;
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s, transform 0.1s;
  box-shadow: 0 1px 3px rgba(9, 30, 66, 0.08);
  font-family: inherit;
}

.category-card:hover {
  border-color: #0052CC;
  box-shadow: 0 4px 8px rgba(0, 82, 204, 0.15);
  transform: translateY(-1px);
}

.category-card:active {
  transform: translateY(0);
  box-shadow: 0 1px 2px rgba(0, 82, 204, 0.2);
}

.category-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.category-title {
  font-size: 14px;
  font-weight: 600;
  color: #0052CC;
}

.category-tag {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  background: #E3FCEF;
  color: #006644;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.category-desc {
  font-size: 12px;
  color: #6B778C;
  line-height: 1.5;
  margin: 0;
}

ul.category-desc {
  padding-left: 18px;
  list-style: disc;
}

ul.category-desc li {
  margin-bottom: 3px;
}

ul.category-desc li:last-child {
  margin-bottom: 0;
}
```

---

## Step 5: Product Sub-Category — JS Wiring

**File:** `extension/sidepanel/sidepanel.js`

### 5a. Register view in views object (lines 15-21)

Add `productCategory` to the views object:

```js
const views = {
  loading: document.getElementById('loading-view'),
  typeSelect: document.getElementById('type-select-view'),
  productCategory: document.getElementById('product-category-view'),
  form: document.getElementById('form-view'),
  review: document.getElementById('review-view'),
  success: document.getElementById('success-view')
};
```

### 5b. Add `showProductCategorySelector()` function

Add near other view helpers (after `showForm()`, around line 176):

```js
function showProductCategorySelector() {
  showView('productCategory');
}
```

### 5c. Add event listener for category cards

After the type-selection button listeners (after line 518), add:

```js
// Product category selection (delegated)
document.getElementById('product-category-view').addEventListener('click', (e) => {
  const card = e.target.closest('.category-card');
  if (!card) return;
  state.productCategory = card.dataset.category;
  showForm();
});
```

### 5d. Modify auto-detected product routing (line 155-157)

**Before:**
```js
if (components.length === 1 && components[0] === 'product') {
  state.ticketType = 'product';
  showForm();
```

**After:**
```js
if (components.length === 1 && components[0] === 'product') {
  state.ticketType = 'product';
  if (state.productCategory) {
    showForm();  // Re-edit: category already known, skip dialog
  } else {
    showProductCategorySelector();
  }
```

### 5e. Modify manual product button (line 510-513)

**Before:**
```js
document.getElementById('type-product-btn').addEventListener('click', () => {
  state.ticketType = 'product';
  showForm();
});
```

**After:**
```js
document.getElementById('type-product-btn').addEventListener('click', () => {
  state.ticketType = 'product';
  showProductCategorySelector();
});
```

### 5f. Restore productCategory from existing SP item

In `initialize()`, after `state.isUpdate = true` (line 148), add:

```js
if (spResult.item.ProductCategory) {
  state.productCategory = spResult.item.ProductCategory;
}
```

---

## Step 6: Product Sub-Category — Form Logic

**File:** `extension/sidepanel/sidepanel.js`

### 6a. Conditionally show/hide scoring in `populateForm()`

After the line `productSection.classList.remove('hidden');` (line 194), add:

```js
// Show/hide scoring fields based on product category
const scoringSection = document.getElementById('scoring-fields');
if (isAutoAccepted()) {
  scoringSection.classList.add('hidden');
  // Clear any stale scoring values
  ['overallSavings', 'impactedArea', 'impactedAudience', 'duration', 'stakeholder', 'investmentTime'].forEach(f => {
    getField(f).value = '';
  });
} else {
  scoringSection.classList.remove('hidden');
}
```

### 6b. Modify validation — skip scoring for auto-accepted

In `validateForm()`, replace the product scoring validation block (lines 264-277):

**Before:**
```js
if (state.ticketType === 'product') {
  const scoringFields = ['overallSavings', 'impactedArea', 'impactedAudience', 'duration', 'stakeholder', 'investmentTime'];
  for (const name of scoringFields) {
    if (!getField(name).value) {
      showFieldError(name, `Please select ${FIELD_LABELS[name].toLowerCase()}.`);
      valid = false;
    }
  }
  if (!getField('riskItems').value.trim()) {
    showFieldError('riskItems', `${FIELD_LABELS['riskItems']} is required.`);
    valid = false;
  }
}
```

**After:**
```js
if (state.ticketType === 'product') {
  // Scoring fields only required for "Others" category
  if (!isAutoAccepted()) {
    const scoringFields = ['overallSavings', 'impactedArea', 'impactedAudience', 'duration', 'stakeholder', 'investmentTime'];
    for (const name of scoringFields) {
      if (!getField(name).value) {
        showFieldError(name, `Please select ${FIELD_LABELS[name].toLowerCase()}.`);
        valid = false;
      }
    }
  }
  // Risk/Watch Items required for ALL product categories
  if (!getField('riskItems').value.trim()) {
    showFieldError('riskItems', `${FIELD_LABELS['riskItems']} is required.`);
    valid = false;
  }
}
```

### 6c. Modify review screen — handle auto-accepted rating

Replace the product branch in `showReview()` (lines 335-370):

**Before:**
```js
if (state.ticketType === 'product') {
  const ratingResult = Calculator.calculateRating({...});
  const ratingContainer = document.getElementById('rating-container');
  const ratingBadge = document.getElementById('rating-badge');
  ratingContainer.classList.remove('hidden');
  ratingBadge.textContent = ratingResult.rating;
  ratingBadge.className = 'rating-badge rating-' + ratingResult.rating.toLowerCase().replace(/\s+/g, '-');
  const breakdown = document.getElementById('scoring-breakdown');
  breakdown.classList.remove('hidden');
  // ... scoring breakdown + rows ...
}
```

**After:**
```js
if (state.ticketType === 'product') {
  const ratingContainer = document.getElementById('rating-container');
  const ratingBadge = document.getElementById('rating-badge');
  const breakdown = document.getElementById('scoring-breakdown');
  ratingContainer.classList.remove('hidden');

  if (isAutoAccepted()) {
    // Auto-accepted: just show "Accepted" badge, no scoring breakdown
    ratingBadge.textContent = 'Accepted';
    ratingBadge.className = 'rating-badge rating-accepted';
    breakdown.classList.add('hidden');
  } else {
    // "Others": full calculation
    const ratingResult = Calculator.calculateRating({
      overallSavings: getField('overallSavings').value,
      impactedArea: getField('impactedArea').value,
      impactedAudience: getField('impactedAudience').value,
      duration: getField('duration').value,
      stakeholder: getField('stakeholder').value,
      investmentTime: getField('investmentTime').value
    });
    ratingBadge.textContent = ratingResult.rating;
    ratingBadge.className = 'rating-badge rating-' + ratingResult.rating.toLowerCase().replace(/\s+/g, '-');
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
      ['Investment Time', getField('investmentTime').value]
    );
  }

  // Always show for product tickets
  rows.push(
    ['Product Category', state.productCategory],
    ['Target Complete Date', getField('targetDate').value || '(not set)'],
    ['Risk/Watch Items', getField('riskItems').value]
  );
}
```

### 6d. Modify `assembleSharePointData()` — handle auto-accepted

Replace the product branch (lines 450-469):

**Before:**
```js
if (state.ticketType === 'product') {
  data.OverallSavings = getField('overallSavings').value;
  data.ImpactedArea = getField('impactedArea').value;
  data.ImpactedAudience = getField('impactedAudience').value;
  data.Duration = getField('duration').value;
  data.Stakeholder = getField('stakeholder').value;
  data.InvestmentTime = getField('investmentTime').value;
  data.TargetCompleteDate = getField('targetDate').value.trim() || null;
  data.RiskWatchItems = getField('riskItems').value.trim();
  const result = Calculator.calculateRating({...});
  data.CalculatedRating = result.rating;
} else {
  data.Region = getField('region').value || null;
  data.TicketStatus = getField('status').value;
}
```

**After:**
```js
// TicketStatus is common to both types (moved out of else block)
data.TicketStatus = getField('status').value;

if (state.ticketType === 'product') {
  data.ProductCategory = state.productCategory;
  data.TargetCompleteDate = getField('targetDate').value.trim() || null;
  data.RiskWatchItems = getField('riskItems').value.trim();

  if (isAutoAccepted()) {
    // Auto-accepted: hardcode rating, no scoring fields
    data.CalculatedRating = 'Accepted';
  } else {
    // "Others": full scoring + calculation
    data.OverallSavings = getField('overallSavings').value;
    data.ImpactedArea = getField('impactedArea').value;
    data.ImpactedAudience = getField('impactedAudience').value;
    data.Duration = getField('duration').value;
    data.Stakeholder = getField('stakeholder').value;
    data.InvestmentTime = getField('investmentTime').value;

    const result = Calculator.calculateRating({
      overallSavings: data.OverallSavings,
      impactedArea: data.ImpactedArea,
      impactedAudience: data.ImpactedAudience,
      duration: data.Duration,
      stakeholder: data.Stakeholder,
      investmentTime: data.InvestmentTime
    });
    data.CalculatedRating = result.rating;
  }
} else {
  data.Region = getField('region').value || null;
}
```

---

## Step 7: Update CLAUDE.md

Update these sections:

1. **SharePoint Column Names table:**
   - `Stakeholder` Choice values → `No Dependency, Needs Engagement, Need to Change Roadmap`
   - `TicketStatus` Choice values → `New Request, In Progress, On Hold, Pending Review, RTB Submitted, RTB Completed, Closed` — note: applies to BOTH ticket types now
   - Add `ProductCategory` row: `Choice — Product Roadmap, Quick Wins/Impact to TCE, Others (Product only)`

2. **Scoring Logic section:**
   - Update Stakeholder labels if referenced

3. **Architecture Notes:**
   - Add: Status auto-extracted from Jira opsbar for both ticket types; editable dropdown
   - Add: Product sub-category branching — Product Roadmap and Quick Wins/Impact to TCE are auto-accepted (no scoring fields, rating = "Accepted"); Others gets full scoring form

4. **Lessons Learned:**
   - Jira status selector: `[class*="opsbar-transitions__status-category"] .dropdown-text`
   - Product sub-category stored in `ProductCategory` SP column

---

## Verification Checklist

### Stakeholder Rename
- [ ] Stakeholder dropdown shows: No Dependency, Needs Engagement, Need to Change Roadmap
- [ ] Calculator still computes correct ratings with new labels

### Status Auto-Extract
- [ ] Status dropdown appears for **both** Product and Salesforce tickets
- [ ] Status auto-fills from Jira page (case-insensitive match)
- [ ] If Jira status doesn't match, dropdown stays at "-- Select --"
- [ ] Dropdown is editable (user can override)
- [ ] Dropdown options: New Request, In Progress, On Hold, Pending Review, RTB Submitted, RTB Completed, Closed
- [ ] Review screen shows Status for both types
- [ ] SP payload includes `TicketStatus` for both types
- [ ] Edit/duplicate flow: saved TicketStatus overrides auto-extracted value

### Product Sub-Category Dialog
- [ ] Dialog appears when ticket type = Product (auto-detected or manual)
- [ ] 3 cards with elegant formatting:
  - Product Roadmap: green "Auto-accepted" tag, single-line description
  - Quick Wins / Impact to TCE: green "Auto-accepted" tag, 3-item bullet list
  - Others: no tag, single-line description
- [ ] Hover effect: blue border + subtle lift

### Product Roadmap Flow
- [ ] Selecting "Product Roadmap" → form loads WITHOUT 6 scoring dropdowns
- [ ] "Additional Details" section (Target Date, Risk/Watch Items) still visible
- [ ] Status dropdown still visible and auto-filled
- [ ] Validation: scoring dropdowns NOT required, Risk/Watch Items + Status required
- [ ] Review: "Accepted" badge displayed, NO scoring breakdown, "Product Category: Product Roadmap" row shown
- [ ] SP payload: `ProductCategory: 'Product Roadmap'`, `CalculatedRating: 'Accepted'`, no scoring fields

### Quick Wins / Impact to TCE Flow
- [ ] Same as Product Roadmap but `ProductCategory: 'Quick Wins/Impact to TCE'`

### Others Flow
- [ ] Selecting "Others" → full form with all 6 scoring dropdowns
- [ ] Rating calculation works as before
- [ ] SP payload: `ProductCategory: 'Others'`, calculated `CalculatedRating`, all scoring fields present

### Salesforce Flow
- [ ] No category dialog (unchanged)
- [ ] Status dropdown now in common section, auto-filled from Jira

### Edge Cases
- [ ] Manual type selection: click "Product" on ambiguous dialog → category dialog appears
- [ ] Edit/duplicate: re-opening a Product Roadmap ticket → category dialog skipped, correct form variant loads
- [ ] Edit/duplicate: re-opening an Others ticket → category dialog skipped, full scoring form loads
