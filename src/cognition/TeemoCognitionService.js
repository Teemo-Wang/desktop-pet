/**
 * Teemo Cognition local data service.
 * P1-2 keeps long-term, recent and project cognition separate and persists
 * only through TeemoStorageService.
 */
(function (root, factory) {
  const StorageService = root && root.TeemoStorageService
    ? root.TeemoStorageService
    : require('../services/TeemoStorageService');
  const Service = factory(StorageService);
  if (root) root.TeemoCognitionService = Service;
  if (typeof window !== 'undefined') window.TeemoCognitionService = Service;
  if (typeof module === 'object' && module.exports) module.exports = Service;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (TeemoStorageService) {
  const VERSION = 1;
  const VALID_SCOPES = new Set(['global', 'recent', 'project']);

  function makeId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function nowIso(clock) {
    const value = clock();
    return (value instanceof Date ? value : new Date(value)).toISOString();
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function emptyData() {
    return {
      version: VERSION,
      profile: [],
      recentContext: [],
      projectContexts: {},
      observations: [],
      updatedAt: null,
    };
  }

  function normalizeContent(value) {
    return String(value == null ? '' : value)
      .replace(/data:[^\s]+/gi, '[已过滤数据]')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1000);
  }

  function fingerprint(value) {
    return normalizeContent(value)
      .toLowerCase()
      .replace(/[\s。！？,.!?；;：:'"“”‘’、]/g, '')
      .slice(0, 500);
  }

  function isSensitiveText(value) {
    const text = String(value == null ? '' : value);
    if (!text) return false;
    return [
      /\b(?:api[ _-]?key|access[ _-]?token|refresh[ _-]?token|token|authorization|client[ _-]?secret|secret|password|passwd)\b/i,
      /(?:密码|口令|密钥|令牌|授权码)/i,
      /\b(?:api[ _-]?key|access[ _-]?token|refresh[ _-]?token|authorization|client[ _-]?secret|password|passwd)\b\s*[:=：]\s*\S+/i,
      /(?:密码|口令|密钥|令牌|授权码)\s*[:=：]\s*\S+/i,
      /\bBearer\s+[A-Za-z0-9._~+\/-]{12,}/i,
      /\b(?:sk|rk|ghp|github_pat|xox[baprs])-?[A-Za-z0-9_-]{12,}\b/i,
    ].some(pattern => pattern.test(text));
  }

  function normalizeData(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const projectContexts = source.projectContexts && typeof source.projectContexts === 'object' && !Array.isArray(source.projectContexts)
      ? source.projectContexts
      : {};
    return {
      version: VERSION,
      profile: Array.isArray(source.profile) ? source.profile : [],
      recentContext: Array.isArray(source.recentContext) ? source.recentContext : [],
      projectContexts,
      observations: Array.isArray(source.observations) ? source.observations : [],
      updatedAt: source.updatedAt || null,
    };
  }

  class TeemoCognitionService {
    constructor(options = {}) {
      if (!TeemoStorageService && !options.storage) throw new Error('TeemoCognitionService 缺少 TeemoStorageService');
      this.storage = options.storage || new TeemoStorageService(options);
      this.fileName = options.fileName || 'Teemo-cognition.json';
      this.clock = typeof options.clock === 'function' ? options.clock : () => new Date();
      this.data = this._load();
    }

    _load() {
      if (!this.storage.exists(this.fileName)) return emptyData();
      const value = this.storage.readJson(this.fileName, null);
      return normalizeData(value);
    }

    reload() {
      this.data = this._load();
      return this.snapshot();
    }

    snapshot() { return clone(this.data); }

    getStoragePath() { return this.storage.getPath(this.fileName); }

    _persist() {
      this.data.updatedAt = nowIso(this.clock);
      this.storage.writeJson(this.fileName, this.data);
    }

    _active(items) {
      return (items || []).filter(item => (
        item
        && item.status !== 'superseded'
        && !isSensitiveText(item.content)
      ));
    }

    getProfile(options = {}) {
      const items = options.includeSuperseded ? this.data.profile : this._active(this.data.profile);
      return clone(items);
    }

    getRecentContext(options = {}) {
      const items = options.includeSuperseded ? this.data.recentContext : this._active(this.data.recentContext);
      return clone(items);
    }

    getProjectContext(projectId, options = {}) {
      if (!projectId) return [];
      const items = Array.isArray(this.data.projectContexts[projectId]) ? this.data.projectContexts[projectId] : [];
      return clone(options.includeSuperseded ? items : this._active(items));
    }

    listObservations(options = {}) {
      let items = this.data.observations.slice();
      if (!options.includeSuperseded) items = this._active(items);
      if (options.scope) items = items.filter(item => item.scope === options.scope);
      if (options.projectId) items = items.filter(item => item.projectId === options.projectId);
      return clone(items);
    }

    recordObservation(input = {}) {
      const content = normalizeContent(input.content);
      if (!content) return { ok: false, skipped: 'empty' };
      if (isSensitiveText(content)) return { ok: false, skipped: 'sensitive' };
      const scope = VALID_SCOPES.has(input.scope) ? input.scope : 'recent';
      const projectId = scope === 'project' ? String(input.projectId || '').trim() : null;
      if (scope === 'project' && !projectId) return { ok: false, skipped: 'missing_project' };
      const observedAt = nowIso(this.clock);
      const key = fingerprint(content);
      const existing = this.data.observations.find(item => (
        item.status !== 'superseded'
        && item.scope === scope
        && (item.projectId || null) === projectId
        && item.fingerprint === key
      ));
      if (existing) {
        existing.evidenceCount = Math.max(1, Number(existing.evidenceCount) || 1) + 1;
        existing.lastObservedAt = observedAt;
        existing.updatedAt = observedAt;
        existing.confidence = Math.max(existing.confidence || 0, Number(input.confidence) || 0);
        if (input.sourceSessionId) existing.sourceSessionId = String(input.sourceSessionId);
        this._persist();
        return { ok: true, created: false, observation: clone(existing) };
      }
      const observation = {
        id: makeId('obs'),
        category: String(input.category || 'preference'),
        scope,
        content,
        fingerprint: key,
        confidence: Math.max(0, Math.min(1, Number(input.confidence) || 0.6)),
        evidenceCount: 1,
        projectId,
        sourceSessionId: input.sourceSessionId ? String(input.sourceSessionId) : null,
        status: 'active',
        supersededBy: null,
        createdAt: observedAt,
        updatedAt: observedAt,
        lastObservedAt: observedAt,
      };
      this.data.observations.push(observation);
      this._persist();
      return { ok: true, created: true, observation: clone(observation) };
    }

    _upsertKnowledge(collection, observation, extras = {}) {
      const observedAt = observation.lastObservedAt || nowIso(this.clock);
      let entry = collection.find(item => item.status !== 'superseded' && item.fingerprint === observation.fingerprint);
      if (!entry) {
        entry = {
          id: makeId('cog'),
          observationId: observation.id,
          category: observation.category,
          content: observation.content,
          fingerprint: observation.fingerprint,
          confidence: observation.confidence,
          evidenceCount: observation.evidenceCount,
          status: 'active',
          supersededBy: null,
          createdAt: observedAt,
          updatedAt: observedAt,
          lastObservedAt: observedAt,
          ...extras,
        };
        collection.push(entry);
      } else {
        entry.observationId = observation.id;
        entry.content = observation.content;
        entry.confidence = Math.max(entry.confidence || 0, observation.confidence || 0);
        entry.evidenceCount = Math.max(entry.evidenceCount || 1, observation.evidenceCount || 1);
        entry.updatedAt = observedAt;
        entry.lastObservedAt = observedAt;
        Object.assign(entry, extras);
      }
      this._persist();
      return clone(entry);
    }

    promoteToProfile(observation) {
      if (!observation || observation.scope === 'project') return null;
      return this._upsertKnowledge(this.data.profile, observation, { scope: 'global' });
    }

    updateRecentFromObservation(observation) {
      if (!observation) return null;
      return this._upsertKnowledge(this.data.recentContext, observation, { scope: 'recent' });
    }

    updateProjectFromObservation(projectId, observation) {
      const id = String(projectId || observation && observation.projectId || '').trim();
      if (!id || !observation) return null;
      if (!Array.isArray(this.data.projectContexts[id])) this.data.projectContexts[id] = [];
      return this._upsertKnowledge(this.data.projectContexts[id], observation, { scope: 'project', projectId: id });
    }

    _markKnowledgeSuperseded(observationId, replacementId) {
      const collections = [this.data.profile, this.data.recentContext, ...Object.values(this.data.projectContexts)];
      for (const collection of collections) {
        if (!Array.isArray(collection)) continue;
        for (const item of collection) {
          if (item.observationId === observationId && item.status !== 'superseded') {
            item.status = 'superseded';
            item.supersededBy = replacementId || null;
            item.updatedAt = nowIso(this.clock);
          }
        }
      }
    }

    supersedeObservation(observationId, replacementId = null) {
      const item = this.data.observations.find(observation => observation.id === observationId);
      if (!item || item.status === 'superseded') return false;
      item.status = 'superseded';
      item.supersededBy = replacementId;
      item.updatedAt = nowIso(this.clock);
      this._markKnowledgeSuperseded(item.id, replacementId);
      this._persist();
      return true;
    }

    supersedeSimilar(anchor, options = {}) {
      const key = fingerprint(anchor);
      if (!key || key.length < 2) return [];
      const scopes = Array.isArray(options.scopes) && options.scopes.length ? options.scopes : ['global', 'recent', 'project'];
      const matched = this.data.observations.filter(item => {
        if (item.status === 'superseded' || !scopes.includes(item.scope)) return false;
        if (options.projectId && item.scope === 'project' && item.projectId !== options.projectId) return false;
        return item.fingerprint.includes(key) || key.includes(item.fingerprint);
      });
      matched.forEach(item => {
        item.status = 'superseded';
        item.supersededBy = options.replacementId || null;
        item.updatedAt = nowIso(this.clock);
        this._markKnowledgeSuperseded(item.id, options.replacementId || null);
      });
      if (matched.length) this._persist();
      return clone(matched);
    }

    remove(domain, id, projectId = null) {
      const collections = {
        profile: this.data.profile,
        recent: this.data.recentContext,
        observation: this.data.observations,
        project: projectId ? this.data.projectContexts[projectId] : null,
      };
      const collection = collections[domain];
      if (!Array.isArray(collection)) return false;
      const before = collection.length;
      const next = collection.filter(item => item.id !== id);
      if (next.length === before) return false;
      if (domain === 'profile') this.data.profile = next;
      else if (domain === 'recent') this.data.recentContext = next;
      else if (domain === 'observation') this.data.observations = next;
      else this.data.projectContexts[projectId] = next;
      this._persist();
      return true;
    }
  }

  TeemoCognitionService.isSensitiveText = isSensitiveText;
  TeemoCognitionService.fingerprint = fingerprint;
  return TeemoCognitionService;
});
