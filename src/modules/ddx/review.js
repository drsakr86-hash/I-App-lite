// Package E: clinician review of decision-support suggestions. Pure module.
// The rule set is versioned and says plainly whether a clinician has reviewed it: nothing here ever
// claims a review that did not happen. A suggestion is never written to the record automatically;
// the clinician accepts it (adds it to the diagnosis) or dismisses it WITH A REASON. Every decision is
// kept on the exam (`ddxReview`, append-only) with the rule-set version, who decided and when.

export const RULESET = Object.freeze({
  id: 'ddx-rules',
  version: '1.0.0',
  source: 'in-app rule tables (ddx/general.js + special-exam/ddx.js), thresholds in ddx/general.js T',
  reviewedBy: null, // set only after a named ophthalmologist signs the rule review
  reviewedAt: null
});
export const rulesetReviewed = (r = RULESET) => !!(r.reviewedBy && r.reviewedAt);

export const DISMISS_REASONS = Object.freeze(['notApplicable', 'alreadyExcluded', 'clinicallyUnlikely', 'dataIncomplete', 'other']);
export const MIN_OTHER_LEN = 5;

export function validDismissal(reasonKey, otherText) {
  if (!DISMISS_REASONS.includes(reasonKey)) return false;
  return reasonKey !== 'other' || String(otherText || '').trim().length >= MIN_OTHER_LEN;
}

export function makeReview({ itemId, label, action, reasonKey = '', otherText = '', by = '', at = new Date().toISOString(), ruleset = RULESET }) {
  if (!['accepted', 'dismissed', 'restored'].includes(action)) throw new Error('invalid action');
  if (action === 'dismissed' && !validDismissal(reasonKey, otherText)) throw new Error('dismissal reason required');
  return {
    itemId: String(itemId), label: String(label || ''), action,
    reason: action === 'dismissed' ? (reasonKey === 'other' ? String(otherText).trim() : reasonKey) : '',
    ruleset: ruleset.id + '@' + ruleset.version, by: String(by || ''), at
  };
}

// Append-only: history is never edited or removed.
export const appendReview = (list, entry) => [...(Array.isArray(list) ? list : []), entry];

// Latest decision wins; 'restored' clears a dismissal.
export function reviewState(list, itemId) {
  const hist = (Array.isArray(list) ? list : []).filter(r => r && r.itemId === String(itemId));
  const last = hist[hist.length - 1];
  return !last || last.action === 'restored' ? null : last.action;
}
