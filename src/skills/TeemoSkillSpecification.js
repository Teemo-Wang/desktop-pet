/* Teemo Skill Specification v1 shared constants and deterministic helpers. */
(function (root, factory) {
  const api = factory();
  if (root) root.TeemoSkillSpecification = api;
  if (typeof window !== 'undefined') window.TeemoSkillSpecification = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ROLES = Object.freeze(['task', 'domain', 'brand', 'utility']);
  const STATUSES = Object.freeze(['ready', 'needs_review', 'disabled']);
  const MODALITIES = Object.freeze(['text', 'image', 'video', 'audio', 'pdf', 'document', 'spreadsheet', 'slides', 'code', 'mixed', 'unknown']);
  const SENSITIVITIES = Object.freeze(['general', 'sensitive', 'adult', 'unknown']);
  const ROLE_ORDER = Object.freeze({ task: 0, domain: 1, brand: 2, utility: 3 });
  const ARRAY_LIMIT = 64;

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function normalizeText(value) {
    return String(value == null ? '' : value)
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\u200b-\u200d\ufeff]/g, '')
      .replace(/[\s\-_/\\|·，,。.!！?？:：;；()（）\[\]【】]+/g, ' ')
      .trim();
  }

  function normalizeList(value, limit = ARRAY_LIMIT) {
    const seen = new Set();
    const output = [];
    for (const item of Array.isArray(value) ? value : []) {
      const text = String(item == null ? '' : item).trim();
      const key = normalizeText(text);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      output.push(text);
      if (output.length >= limit) break;
    }
    return output;
  }

  function containsPhrase(text, phrase) {
    const haystack = normalizeText(text);
    const needle = normalizeText(phrase);
    if (!haystack || !needle) return false;
    return haystack.includes(needle);
  }

  function hashText(value) {
    const text = String(value == null ? '' : value);
    try {
      const crypto = require('crypto');
      return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
    } catch (_) {
      // Browser-only fallback is deterministic but is not used in Electron/Node.
      let a = 2166136261;
      for (let index = 0; index < text.length; index += 1) {
        a ^= text.charCodeAt(index);
        a = Math.imul(a, 16777619);
      }
      return `fallback-${(a >>> 0).toString(16).padStart(8, '0')}`;
    }
  }

  function stableSkillId(sourceId, name) {
    const source = normalizeText(sourceId || name || 'skill');
    return `teemo-skill-${hashText(source).slice(0, 20)}`;
  }

  function defaultRouting() {
    return {
      status: 'needs_review', role: 'task', domains: [], intents: [], aliases: [],
      positiveExamples: [], negativeExamples: [], exclusions: [],
      allowComposition: false, continuity: true, priority: 0,
    };
  }

  function emptyResult(extra = {}) {
    return {
      type: 'no_skill', selectedSkillIds: [], confidence: 'low', reasons: [],
      excluded: [], continuityUsed: false, ambiguousCandidates: [], ...extra,
    };
  }

  return Object.freeze({
    schemaVersion: 1,
    ROLES, STATUSES, MODALITIES, SENSITIVITIES, ROLE_ORDER, ARRAY_LIMIT,
    clone, normalizeText, normalizeList, containsPhrase, hashText, stableSkillId,
    defaultRouting, emptyResult,
  });
});
