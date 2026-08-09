/**
 * Deterministic, provider-neutral intelligence derived from Cognition v2 data.
 * Derived values are runtime-only; existing persisted fingerprints stay intact.
 */
(function (root, factory) {
  const Intelligence = factory();
  if (root) root.TeemoCognitionIntelligence = Intelligence;
  if (typeof window !== 'undefined') window.TeemoCognitionIntelligence = Intelligence;
  if (typeof module === 'object' && module.exports) module.exports = Intelligence;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const FRESHNESS_FACTORS = { fresh: 1, current: 0.9, aging: 0.72, stale: 0.45, stable: 1 };
  const STOP_WORDS = new Set([
    '这个', '那个', '这些', '那些', '这里', '现在', '最近', '目前', '已经', '还是', '可以', '需要',
    '喜欢', '偏好', '默认', '设计', '项目', '使用', '记住', '以后', '一直', '通常', '比较', '一些',
  ]);

  function normalizeText(value) {
    return String(value == null ? '' : value)
      .normalize('NFKC')
      .replace(/data:[^\s]+/gi, '[已过滤数据]')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function contentFingerprint(value) {
    return normalizeText(value)
      .toLowerCase()
      .replace(/[\s。！？,.!?；;：:'"“”‘’、（）()\[\]{}<>《》]/g, '')
      .slice(0, 500);
  }

  function compositeIdentity(value = {}) {
    const scope = ['global', 'recent', 'project'].includes(value.scope) ? value.scope : 'recent';
    const category = normalizeText(value.category || 'preference').toLowerCase();
    const projectId = scope === 'project' ? normalizeText(value.projectId || '') : '';
    return [scope, category, projectId, contentFingerprint(value.content)].join('|');
  }

  function naturalDay(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
  }

  function evidenceDays(item = {}) {
    const days = new Set(Array.isArray(item.evidenceDays) ? item.evidenceDays.filter(Boolean) : []);
    [item.createdAt, item.lastObservedAt, item.updatedAt].forEach(value => {
      const day = naturalDay(value);
      if (day) days.add(day);
    });
    return Array.from(days).sort();
  }

  function freshness(item = {}, now = new Date()) {
    if (item.scope === 'global') return { state: 'stable', ageDays: 0 };
    if (item.scope === 'project') return { state: 'current', ageDays: 0 };
    const timestamp = new Date(item.lastObservedAt || item.updatedAt || item.createdAt || 0).getTime();
    const nowValue = new Date(now).getTime();
    const ageDays = Number.isFinite(timestamp) && timestamp > 0 && Number.isFinite(nowValue)
      ? Math.max(0, Math.floor((nowValue - timestamp) / DAY_MS))
      : Number.POSITIVE_INFINITY;
    if (ageDays <= 14) return { state: 'fresh', ageDays };
    if (ageDays <= 45) return { state: 'current', ageDays };
    if (ageDays <= 90) return { state: 'aging', ageDays };
    return { state: 'stale', ageDays };
  }

  function polarity(value) {
    const text = normalizeText(value);
    return /(?:不再|不喜欢|不要|避免|禁止|拒绝|取消|并非|不是)/.test(text) ? 'negative' : 'positive';
  }

  function conflictAnchor(value) {
    return contentFingerprint(normalizeText(value).replace(
      /(?:我|现在|最近|以后|一直|通常|一般|比较|默认|记住|更正|纠正|不是|不再|不喜欢|不要|避免|禁止|拒绝|取消|并非|喜欢|偏好|希望|想要|使用|采用|了|的)/g,
      ''
    ));
  }

  function conflictIdentities(items) {
    const groups = new Map();
    (Array.isArray(items) ? items : []).forEach(item => {
      if (!item || item.status === 'superseded') return;
      const anchor = conflictAnchor(item.content);
      if (anchor.length < 2) return;
      const groupKey = [item.scope || 'recent', item.projectId || '', anchor].join('|');
      const current = groups.get(groupKey) || { positive: [], negative: [] };
      current[polarity(item.content)].push(compositeIdentity(item));
      groups.set(groupKey, current);
    });
    const conflicts = new Set();
    groups.forEach(group => {
      if (!group.positive.length || !group.negative.length) return;
      group.positive.concat(group.negative).forEach(identity => conflicts.add(identity));
    });
    return conflicts;
  }

  function confidenceLabel(value) {
    const confidence = Number(value) || 0;
    if (confidence >= 0.8) return 'high';
    if (confidence >= 0.5) return 'medium';
    return 'low';
  }

  function derive(item = {}, options = {}) {
    const now = options.now || new Date();
    const freshnessValue = freshness(item, now);
    const identity = compositeIdentity(item);
    const conflict = options.conflicts instanceof Set ? options.conflicts.has(identity) : false;
    const days = evidenceDays(item);
    const evidenceCount = Math.max(1, Number(item.evidenceCount) || 1);
    const pending = item.scope === 'recent' && (evidenceCount < 3 || days.length < 2);
    const factor = FRESHNESS_FACTORS[freshnessValue.state] || 1;
    const effectiveConfidence = Math.max(0, Math.min(1,
      (Number(item.confidence) || 0) * factor * (conflict ? 0.5 : 1)
    ));
    const promotionEligible = item.status !== 'superseded'
      && item.scope === 'recent'
      && item.category !== 'correction'
      && evidenceCount >= 3
      && days.length >= 2
      && freshnessValue.state !== 'stale'
      && !conflict;
    const state = conflict
      ? 'conflict'
      : item.scope === 'global'
        ? 'stable'
        : freshnessValue.state === 'stale'
          ? 'stale'
          : freshnessValue.state === 'aging'
            ? 'aging'
            : pending
              ? 'pending'
              : 'recent';
    return {
      identity,
      freshness: freshnessValue.state,
      ageDays: Number.isFinite(freshnessValue.ageDays) ? freshnessValue.ageDays : null,
      effectiveConfidence,
      confidenceLabel: confidenceLabel(effectiveConfidence),
      conflict,
      pending,
      promotionEligible,
      state,
      lastConfirmedAt: item.lastObservedAt || item.updatedAt || item.createdAt || null,
      evidenceCount,
      evidenceDayCount: days.length,
    };
  }

  function annotate(items, options = {}) {
    const source = Array.isArray(items) ? items : [];
    const allItems = Array.isArray(options.allItems) ? options.allItems : source;
    const conflicts = conflictIdentities(allItems);
    return source.map(item => ({ ...item, intelligence: derive(item, { ...options, conflicts }) }));
  }

  function tokens(value) {
    const text = normalizeText(value).toLowerCase();
    const found = new Set((text.match(/[a-z0-9][a-z0-9_-]+/g) || []).filter(token => token.length >= 2));
    const cjkRuns = text.match(/[\u3400-\u9fff]+/g) || [];
    cjkRuns.forEach(run => {
      if (run.length <= 2 && !STOP_WORDS.has(run)) found.add(run);
      for (let index = 0; index < run.length - 1; index += 1) {
        const token = run.slice(index, index + 2);
        if (!STOP_WORDS.has(token)) found.add(token);
      }
    });
    return found;
  }

  function relevanceDetails(item, query, options = {}) {
    const intelligence = item.intelligence || derive(item, options);
    const queryTokens = tokens(query);
    const itemTokens = tokens(item.content);
    let overlap = 0;
    queryTokens.forEach(token => { if (itemTokens.has(token)) overlap += 1; });
    const scopeBase = item.scope === 'project' ? 300 : item.scope === 'recent' ? 200 : 100;
    const genericFollowUp = queryTokens.size <= 2 && /(?:这个|那个|它|继续|刚才|上面|再|怎么|呢)/.test(normalizeText(query));
    const recency = intelligence.freshness === 'fresh' ? 24 : intelligence.freshness === 'current' ? 12 : 0;
    const conflictPenalty = intelligence.conflict ? 80 : 0;
    return {
      score: scopeBase + overlap * 45 + intelligence.effectiveConfidence * 30 + recency
        + (genericFollowUp && item.scope === 'recent' ? 18 : 0) - conflictPenalty,
      matchCount: overlap,
      genericFollowUp,
      queryTokenCount: queryTokens.size,
    };
  }

  function relevanceScore(item, query, options = {}) {
    return relevanceDetails(item, query, options).score;
  }

  function rank(items, query, options = {}) {
    return annotate(items, options).map(item => {
      const relevance = relevanceDetails(item, query, options);
      return {
        ...item,
        intelligence: {
          ...item.intelligence,
          relevanceScore: relevance.score,
          relevanceMatchCount: relevance.matchCount,
          genericFollowUp: relevance.genericFollowUp,
          queryTokenCount: relevance.queryTokenCount,
        },
      };
    }).sort((a, b) => {
      const score = b.intelligence.relevanceScore - a.intelligence.relevanceScore;
      if (score) return score;
      return String(b.lastObservedAt || b.updatedAt || '').localeCompare(String(a.lastObservedAt || a.updatedAt || ''));
    });
  }

  return {
    normalizeText,
    contentFingerprint,
    compositeIdentity,
    naturalDay,
    evidenceDays,
    freshness,
    conflictIdentities,
    derive,
    annotate,
    rank,
    relevanceScore,
    relevanceDetails,
    confidenceLabel,
  };
});
