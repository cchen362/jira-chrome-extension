// calculator.js — Priority calculation engine (pure logic, no DOM/network)
// Replicates the Power Apps priority matrix for Product tickets.

const Calculator = (() => {
  // Label → numeric score mapping
  const SCORE_MAP = {
    // Overall Savings (ROI component)
    '<$50K': 0,
    '$50-$100K': 5,
    '>$100K': 10,
    // Impacted Area (ROI component)
    'POS': 0,
    'Single Region': 5,
    '>1 Region': 10,
    // Impacted Audience (ROI component, no 0 option)
    'Only Internal/Only Vendor': 5,
    'Internal and Vendor': 10,
    // Duration (Effort component)
    '0-1 Month': 0,
    '1-2 Months': 5,
    '>3 Months': 10,
    // Stakeholder (Effort component)
    'No Dependency': 0,
    'Strong Engagement': 5,
    'Need to Change': 10,
    // Investment Time (Effort component)
    '<100 Hours': 0,
    '100-200 Hours': 5,
    '>200 Hours': 10
  };

  // Score → Level mapping (confirmed from original Power Apps legend)
  // 0-10 = Low, 11-20 = Medium, 21-30 = High
  function scoreToLevel(score) {
    if (score <= 10) return 'Low';
    if (score <= 20) return 'Medium';
    return 'High';
  }

  // Priority matrix: PRIORITY_MATRIX[roiLevel][effortLevel] → rating
  const PRIORITY_MATRIX = {
    'High':   { 'Low': 'Accepted',  'Medium': 'Up Next',   'High': 'Maybe' },
    'Medium': { 'Low': 'Up Next',   'Medium': 'Maybe',     'High': 'Maybe' },
    'Low':    { 'Low': 'Maybe',     'Medium': 'Likely No',  'High': 'Rejected' }
  };

  /**
   * Convert a display label to its numeric score.
   * @param {string} label - Display label (e.g., "<$50K")
   * @returns {number} Score value (0, 5, or 10)
   */
  function labelToScore(label) {
    const score = SCORE_MAP[label];
    if (score === undefined) {
      throw new Error(`Unknown scoring label: "${label}"`);
    }
    return score;
  }

  /**
   * Calculate the priority rating from 6 scoring dropdown labels.
   * @param {Object} labels - Object with keys: overallSavings, impactedArea, impactedAudience, duration, stakeholder, investmentTime
   * @returns {Object} { roiScore, roiLevel, effortScore, effortLevel, rating }
   */
  function calculateRating(labels) {
    const roiScore =
      labelToScore(labels.overallSavings) +
      labelToScore(labels.impactedArea) +
      labelToScore(labels.impactedAudience);

    const effortScore =
      labelToScore(labels.duration) +
      labelToScore(labels.stakeholder) +
      labelToScore(labels.investmentTime);

    const roiLevel = scoreToLevel(roiScore);
    const effortLevel = scoreToLevel(effortScore);
    const rating = PRIORITY_MATRIX[roiLevel][effortLevel];

    return { roiScore, roiLevel, effortScore, effortLevel, rating };
  }

  // Public API
  return { calculateRating, labelToScore, scoreToLevel, SCORE_MAP };
})();
