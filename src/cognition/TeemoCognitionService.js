/**
 * Teemo Cognition local data service.
 * P1-2 keeps long-term, recent and project cognition separate and persists
 * only through TeemoStorageService.
 */
(function (root, factory) {
  const StorageService = root && root.TeemoStorageService
    ? root.TeemoStorageService
    : require('../services/TeemoStorageService');
  const Intelligence = root && root.TeemoCognitionIntelligence
    ? root.TeemoCognitionIntelligence
    : require('./TeemoCognitionIntelligence');
  const Service = factory(StorageService, Intelligence);
  if (root) root.TeemoCognitionService = Service;
  if (typeof window !== 'undefined') window.TeemoCognitionService = Service;
  if (typeof module === 'object' && module.exports) module.exports = Service;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (TeemoStorageService, TeemoCognitionIntelligence) {
  const VERSION = 2;
  const VALID_SCOPES = new Set(['global', 'recent', 'project']);
  const VALID_DOMAINS = new Set(['profile', 'recent', 'project']);
  const MAX_COGNITION_ITEM_CHARS = 420;
  const MAX_MANUAL_INPUT_CHARS = 12000;
  const MANAGEMENT_LOCK_HELD = Symbol('TeemoCognitionManagementLockHeld');

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
      enabled: true,
      revision: 0,
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

  function normalizeManualInput(value) {
    return String(value == null ? '' : value)
      .replace(/data:[^\s]+/gi, '[已过滤数据]')
      .replace(/\r\n?/g, '\n')
      .trim();
  }

  function splitParagraph(paragraph) {
    const text = String(paragraph || '').replace(/\s+/g, ' ').trim();
    if (!text) return [];
    if (text.length <= MAX_COGNITION_ITEM_CHARS) return [text];

    const sentences = text.match(/[^。！？!?；;]+[。！？!?；;]?/g) || [text];
    const chunks = [];
    let current = '';
    const flush = () => {
      if (current) chunks.push(current);
      current = '';
    };

    sentences.forEach(sentence => {
      let remaining = sentence.trim();
      if (!remaining) return;
      if (remaining.length > MAX_COGNITION_ITEM_CHARS) {
        flush();
        while (remaining.length > MAX_COGNITION_ITEM_CHARS) {
          chunks.push(remaining.slice(0, MAX_COGNITION_ITEM_CHARS));
          remaining = remaining.slice(MAX_COGNITION_ITEM_CHARS);
        }
        current = remaining;
        return;
      }
      if (current && current.length + remaining.length > MAX_COGNITION_ITEM_CHARS) flush();
      current += remaining;
    });
    flush();
    return chunks;
  }

  function splitManualContent(value) {
    const input = normalizeManualInput(value);
    if (!input) return [];
    return input
      .split(/\n\s*\n+/)
      .flatMap(splitParagraph)
      .map(normalizeContent)
      .filter(Boolean);
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
      /\b(?:api[ _-]?key|access[ _-]?token|refresh[ _-]?token|token|authorization|client[ _-]?secret|secret|password|passwd)\b\s*(?::|=|is)\s*\S+/i,
      /(?:密码|口令|密钥|令牌|授权码)\s*(?:[:=：]|是|为)\s*\S{4,}/i,
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
      enabled: source.enabled !== false,
      revision: Math.max(0, Number(source.revision) || 0),
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
      this.intelligence = options.intelligence || TeemoCognitionIntelligence;
      this.unreadable = false;
      this.data = this._load();
    }

    _load() {
      if (!this.storage.exists(this.fileName)) {
        this.unreadable = false;
        return emptyData();
      }
      const value = this.storage.readJson(this.fileName, null);
      this.unreadable = typeof this.storage.getReadState === 'function'
        && this.storage.getReadState(this.fileName) === 'error';
      return normalizeData(value);
    }

    reload() {
      this.data = this._load();
      return this.snapshot();
    }

    snapshot() { return clone(this.data); }

    getStoragePath() { return this.storage.getPath(this.fileName); }

    previewManualContent(value) {
      const input = normalizeManualInput(value);
      return {
        ok: input.length <= MAX_MANUAL_INPUT_CHARS,
        length: input.length,
        maxChars: MAX_MANUAL_INPUT_CHARS,
        itemMaxChars: MAX_COGNITION_ITEM_CHARS,
        itemCount: input.length <= MAX_MANUAL_INPUT_CHARS ? splitManualContent(input).length : 0,
      };
    }

    _persist() {
      this.data.version = VERSION;
      this.data.revision = Math.max(0, Number(this.data.revision) || 0) + 1;
      this.data.updatedAt = nowIso(this.clock);
      this.storage.writeJson(this.fileName, this.data);
    }

    isReadable() { return !this.unreadable; }

    isEnabled() { return !this.unreadable && this.data.enabled !== false; }

    getState() {
      return {
        enabled: this.isEnabled(),
        unreadable: this.unreadable,
        revision: Math.max(0, Number(this.data.revision) || 0),
        updatedAt: this.data.updatedAt || null,
      };
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

    getIntelligentContext(options = {}) {
      const now = this.clock();
      const allKnowledge = this._knowledgeCollections()
        .flatMap(({ items }) => this._active(items));
      const query = String(options.query || '');
      const rank = items => this.intelligence.rank(items, query, { now, allItems: allKnowledge });
      const relevant = item => !query.trim()
        || Number(item.intelligence && item.intelligence.relevanceMatchCount) > 0
        || Boolean(item.intelligence && item.intelligence.genericFollowUp)
        || Boolean(item.intelligence && item.intelligence.relevanceDomainMatch)
        || Boolean(item.intelligence && item.intelligence.personalProfileQuery);
      const recent = rank(this._active(this.data.recentContext))
        .filter(relevant)
        .filter(item => item.intelligence.freshness !== 'stale');
      const rankedProfile = rank(this._active(this.data.profile));
      const relevantProfile = rankedProfile.filter(relevant);
      return clone({
        profile: relevantProfile,
        recentContext: recent,
        projectContext: options.projectId ? rank(this._active(this.data.projectContexts[String(options.projectId)] || [])) : [],
      });
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
      const identity = this.intelligence.compositeIdentity({ ...input, content, scope, projectId });
      const existing = this.data.observations.find(item => (
        item.status !== 'superseded'
        && this.intelligence.compositeIdentity(item) === identity
      ));
      if (existing) {
        existing.evidenceCount = Math.max(1, Number(existing.evidenceCount) || 1) + 1;
        const observedDay = this.intelligence.naturalDay(observedAt);
        existing.evidenceDays = Array.from(new Set([
          ...this.intelligence.evidenceDays(existing),
          observedDay,
        ].filter(Boolean))).sort().slice(-64);
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
        evidenceDays: [this.intelligence.naturalDay(observedAt)].filter(Boolean),
        projectId,
        sourceSessionId: input.sourceSessionId ? String(input.sourceSessionId) : null,
        source: String(input.source || 'collector'),
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

    _upsertKnowledgeCurrent(collection, observation, extras = {}) {
      const observedAt = observation.lastObservedAt || nowIso(this.clock);
      const identity = this.intelligence.compositeIdentity({ ...observation, ...extras });
      let entry = collection.find(item => (
        item.status !== 'superseded'
        && this.intelligence.compositeIdentity(item) === identity
      ));
      if (!entry) {
        entry = {
          id: makeId('cog'),
          observationId: observation.id,
          category: observation.category,
          content: observation.content,
          fingerprint: observation.fingerprint,
          confidence: observation.confidence,
          evidenceCount: observation.evidenceCount,
          evidenceDays: this.intelligence.evidenceDays(observation),
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
        entry.evidenceDays = this.intelligence.evidenceDays(observation);
        entry.updatedAt = observedAt;
        entry.lastObservedAt = observedAt;
        Object.assign(entry, extras);
      }
      return entry;
    }

    _upsertKnowledge(collection, observation, extras = {}) {
      const entry = this._upsertKnowledgeCurrent(collection, observation, extras);
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

    _knowledgeCollections() {
      return [
        { domain: 'profile', projectId: null, items: this.data.profile },
        { domain: 'recent', projectId: null, items: this.data.recentContext },
        ...Object.entries(this.data.projectContexts).map(([projectId, items]) => ({
          domain: 'project',
          projectId,
          items: Array.isArray(items) ? items : [],
        })),
      ];
    }

    _findKnowledge(domain, id, projectId = null) {
      if (!VALID_DOMAINS.has(domain) || !id) return null;
      const collection = domain === 'profile'
        ? this.data.profile
        : domain === 'recent'
          ? this.data.recentContext
          : this.data.projectContexts[String(projectId || '')];
      if (!Array.isArray(collection)) return null;
      const entry = collection.find(item => item && item.id === id) || null;
      return entry ? { entry, collection } : null;
    }

    _managementSnapshotFromCurrent() {
      const safeItems = items => (Array.isArray(items) ? items : [])
        .filter(item => item && !isSensitiveText(item.content));
      const allKnowledge = this._knowledgeCollections().flatMap(({ items }) => safeItems(items));
      const annotate = items => this.intelligence.annotate(safeItems(items), {
        now: this.clock(),
        allItems: allKnowledge,
      });
      const projectContexts = {};
      Object.entries(this.data.projectContexts).forEach(([projectId, items]) => {
        projectContexts[projectId] = annotate(items);
      });
      const allItems = [
        ...this.data.profile,
        ...this.data.recentContext,
        ...Object.values(this.data.projectContexts).flatMap(items => Array.isArray(items) ? items : []),
        ...this.data.observations,
      ];
      return clone({
        version: VERSION,
        enabled: this.isEnabled(),
        unreadable: this.unreadable,
        revision: Math.max(0, Number(this.data.revision) || 0),
        updatedAt: this.data.updatedAt || null,
        profile: annotate(this.data.profile),
        recentContext: annotate(this.data.recentContext),
        projectContexts,
        observations: safeItems(this.data.observations),
        hiddenSensitiveCount: allItems.filter(item => item && isSensitiveText(item.content)).length,
      });
    }

    getManagementSnapshot() {
      this.reload();
      return this._managementSnapshotFromCurrent();
    }

    _prepareManagementMutation(expectedRevision) {
      this.reload();
      const currentRevision = Math.max(0, Number(this.data.revision) || 0);
      if (expectedRevision != null && Number(expectedRevision) !== currentRevision) {
        return {
          ok: false,
          code: 'COGNITION_CHANGED',
          message: '认知数据已在其他窗口更新，请刷新后重试',
          snapshot: this._managementSnapshotFromCurrent(),
        };
      }
      return null;
    }

    _withManagementLock(callback) {
      if (!this.storage || typeof this.storage.withFileLock !== 'function') return callback();
      const locked = this.storage.withFileLock(this.fileName, callback);
      if (locked.acquired) return locked.value;
      this.reload();
      return {
        ok: false,
        code: 'COGNITION_CHANGED',
        message: '认知数据正在由其他窗口更新，请刷新后重试',
        snapshot: this._managementSnapshotFromCurrent(),
      };
    }

    _scopeTarget(scope, projectId = null) {
      if (!VALID_SCOPES.has(scope)) return null;
      if (scope === 'global') return { domain: 'profile', projectId: null, collection: this.data.profile };
      if (scope === 'recent') return { domain: 'recent', projectId: null, collection: this.data.recentContext };
      const id = String(projectId || '').trim();
      if (!id) return null;
      if (!Array.isArray(this.data.projectContexts[id])) this.data.projectContexts[id] = [];
      return { domain: 'project', projectId: id, collection: this.data.projectContexts[id] };
    }

    _newObservation(input = {}) {
      const observedAt = nowIso(this.clock);
      return {
        id: makeId('obs'),
        category: String(input.category || 'preference'),
        scope: input.scope,
        content: input.content,
        fingerprint: fingerprint(input.content),
        confidence: Math.max(0, Math.min(1, Number(input.confidence) || 1)),
        evidenceCount: Math.max(1, Number(input.evidenceCount) || 1),
        evidenceDays: [this.intelligence.naturalDay(observedAt)].filter(Boolean),
        projectId: input.scope === 'project' ? String(input.projectId || '') : null,
        sourceSessionId: input.sourceSessionId ? String(input.sourceSessionId) : null,
        source: String(input.source || 'user_manual'),
        sourceObservationId: input.sourceObservationId || null,
        status: 'active',
        supersededBy: null,
        supersededReason: null,
        createdAt: observedAt,
        updatedAt: observedAt,
        lastObservedAt: observedAt,
      };
    }

    _newKnowledge(observation, target) {
      const observedAt = observation.lastObservedAt || nowIso(this.clock);
      return {
        id: makeId('cog'),
        observationId: observation.id,
        category: observation.category,
        scope: observation.scope,
        content: observation.content,
        fingerprint: observation.fingerprint,
        confidence: observation.confidence,
        evidenceCount: observation.evidenceCount,
        evidenceDays: this.intelligence.evidenceDays(observation),
        projectId: target.domain === 'project' ? target.projectId : undefined,
        source: observation.source,
        status: 'active',
        supersededBy: null,
        supersededReason: null,
        createdAt: observedAt,
        updatedAt: observedAt,
        lastObservedAt: observedAt,
      };
    }

    _supersedeByIdentity(reference, replacementId, reason) {
      const identity = this.intelligence.compositeIdentity(reference || {});
      const now = nowIso(this.clock);
      this._knowledgeCollections().forEach(({ items }) => {
        items.forEach(item => {
          if (item && item.status !== 'superseded' && this.intelligence.compositeIdentity(item) === identity) {
            item.status = 'superseded';
            item.supersededBy = replacementId || null;
            item.supersededReason = reason || 'user';
            item.updatedAt = now;
          }
        });
      });
    }

    _supersedeObservationById(observationId, replacementId, reason) {
      const observation = this.data.observations.find(item => item && item.id === observationId);
      if (!observation || observation.status === 'superseded') return;
      observation.status = 'superseded';
      observation.supersededBy = replacementId || null;
      observation.supersededReason = reason || 'user';
      observation.updatedAt = nowIso(this.clock);
    }

    commitCollectorTurn(input = {}, options = {}) {
      const execute = () => {
        this.reload();
        const currentRevision = Math.max(0, Number(this.data.revision) || 0);
        if (options.expectedRevision != null && Number(options.expectedRevision) !== currentRevision) {
          return { ok: false, code: 'COGNITION_CHANGED', revision: currentRevision };
        }
        if (!this.isEnabled()) return { ok: true, skipped: 'disabled', revision: currentRevision };

        let content = normalizeContent(input.content);
        if (!content) return { ok: false, skipped: 'empty', revision: currentRevision };
        if (isSensitiveText(content)) return { ok: false, skipped: 'sensitive', revision: currentRevision };
        const scope = VALID_SCOPES.has(input.scope) ? input.scope : 'recent';
        const projectId = scope === 'project' ? String(input.projectId || '').trim() : null;
        if (scope === 'project' && !projectId) return { ok: false, skipped: 'missing_project', revision: currentRevision };

        if (input.isCorrection) {
          const anchorKey = fingerprint(input.correctionAnchor);
          if (anchorKey && anchorKey.length >= 2) {
            const scopes = Array.isArray(input.correctionScopes) && input.correctionScopes.length
              ? input.correctionScopes
              : ['global', 'recent', 'project'];
            this.data.observations.forEach(item => {
              if (!item || item.status === 'superseded' || !scopes.includes(item.scope)) return;
              if (projectId && item.scope === 'project' && item.projectId !== projectId) return;
              if (!item.fingerprint.includes(anchorKey) && !anchorKey.includes(item.fingerprint)) return;
              item.status = 'superseded';
              item.supersededBy = null;
              item.supersededReason = 'collector_correction';
              item.updatedAt = nowIso(this.clock);
              this._markKnowledgeSuperseded(item.id, null);
            });
          } else if (scope === 'project' && input.allowSingleSessionMigration && input.sourceSessionId) {
            const candidates = this._active(this.data.observations)
              .filter(item => item.scope !== 'project' && item.sourceSessionId === String(input.sourceSessionId))
              .sort((a, b) => String(b.lastObservedAt || '').localeCompare(String(a.lastObservedAt || '')));
            if (candidates.length === 1) {
              const referenced = candidates[0];
              content = `${referenced.content}（仅适用于当前项目）`;
              referenced.status = 'superseded';
              referenced.supersededBy = null;
              referenced.supersededReason = 'collector_scope_change';
              referenced.updatedAt = nowIso(this.clock);
              this._markKnowledgeSuperseded(referenced.id, null);
            }
          }
        }

        const observedAt = nowIso(this.clock);
        const category = String(input.category || 'preference');
        const identity = this.intelligence.compositeIdentity({ content, category, scope, projectId });
        let observation = this.data.observations.find(item => (
          item && item.status !== 'superseded' && this.intelligence.compositeIdentity(item) === identity
        ));
        if (observation) {
          observation.evidenceCount = Math.max(1, Number(observation.evidenceCount) || 1) + 1;
          observation.evidenceDays = Array.from(new Set([
            ...this.intelligence.evidenceDays(observation),
            this.intelligence.naturalDay(observedAt),
          ].filter(Boolean))).sort().slice(-64);
          observation.lastObservedAt = observedAt;
          observation.updatedAt = observedAt;
          observation.confidence = Math.max(Number(observation.confidence) || 0, Number(input.confidence) || 0);
          if (input.sourceSessionId) observation.sourceSessionId = String(input.sourceSessionId);
        } else {
          observation = {
            id: makeId('obs'),
            category,
            scope,
            content,
            fingerprint: fingerprint(content),
            confidence: Math.max(0, Math.min(1, Number(input.confidence) || 0.6)),
            evidenceCount: 1,
            evidenceDays: [this.intelligence.naturalDay(observedAt)].filter(Boolean),
            projectId,
            sourceSessionId: input.sourceSessionId ? String(input.sourceSessionId) : null,
            source: 'collector',
            status: 'active',
            supersededBy: null,
            supersededReason: null,
            createdAt: observedAt,
            updatedAt: observedAt,
            lastObservedAt: observedAt,
          };
          this.data.observations.push(observation);
        }

        let promoted = false;
        if (scope === 'project') {
          if (!Array.isArray(this.data.projectContexts[projectId])) this.data.projectContexts[projectId] = [];
          this._upsertKnowledgeCurrent(this.data.projectContexts[projectId], observation, { scope: 'project', projectId });
        } else if (scope === 'global') {
          this._upsertKnowledgeCurrent(this.data.profile, observation, { scope: 'global' });
          promoted = true;
        } else {
          this._upsertKnowledgeCurrent(this.data.recentContext, observation, { scope: 'recent' });
          const derived = this.intelligence.derive(observation, {
            now: this.clock(),
            conflicts: this.intelligence.conflictIdentities(this.data.observations),
          });
          if (!input.isTemporary && derived.promotionEligible) {
            this._upsertKnowledgeCurrent(this.data.profile, observation, { scope: 'global' });
            promoted = true;
          }
        }

        this._persist();
        return {
          ok: true,
          observation: clone(observation),
          promoted,
          scope,
          revision: Math.max(0, Number(this.data.revision) || 0),
        };
      };

      if (this.storage && typeof this.storage.withFileLock === 'function') {
        const locked = this.storage.withFileLock(this.fileName, execute);
        return locked.acquired
          ? locked.value
          : { ok: false, code: 'COGNITION_CHANGED', revision: this.getState().revision };
      }
      return execute();
    }

    setEnabled(enabled, options = {}) {
      if (!options[MANAGEMENT_LOCK_HELD]) {
        return this._withManagementLock(() => this.setEnabled(enabled, { ...options, [MANAGEMENT_LOCK_HELD]: true }));
      }
      const conflict = this._prepareManagementMutation(options.expectedRevision);
      if (conflict) return conflict;
      this.data.enabled = enabled !== false;
      this._persist();
      return { ok: true, state: this.getState(), snapshot: this._managementSnapshotFromCurrent() };
    }

    manualCreate(input = {}, options = {}) {
      if (!options[MANAGEMENT_LOCK_HELD]) {
        return this._withManagementLock(() => this.manualCreate(input, { ...options, [MANAGEMENT_LOCK_HELD]: true }));
      }
      const conflict = this._prepareManagementMutation(options.expectedRevision);
      if (conflict) return conflict;
      const content = normalizeContent(input.content);
      if (!content) return { ok: false, code: 'COGNITION_EMPTY', message: '认知内容不能为空' };
      if (isSensitiveText(content)) return { ok: false, code: 'COGNITION_SENSITIVE', message: '认知内容疑似包含敏感信息，未保存' };
      const scope = VALID_SCOPES.has(input.scope) ? input.scope : 'global';
      const target = this._scopeTarget(scope, input.projectId);
      if (!target) return { ok: false, code: 'PROJECT_REQUIRED', message: '项目认知必须选择项目' };
      const identity = this.intelligence.compositeIdentity({
        content,
        category: input.category,
        scope,
        projectId: target.projectId,
      });
      const duplicate = this._knowledgeCollections().some(({ items }) => items.some(item => (
        item && item.status !== 'superseded' && this.intelligence.compositeIdentity(item) === identity
      )));
      if (duplicate) return { ok: false, code: 'COGNITION_DUPLICATE', message: '已有相同的有效认知，请编辑或迁移原认知' };
      const observation = this._newObservation({
        category: input.category,
        scope,
        projectId: target.projectId,
        content,
        confidence: 1,
        source: 'user_manual',
      });
      const cognition = this._newKnowledge(observation, target);
      this.data.observations.push(observation);
      target.collection.push(cognition);
      this._persist();
      return { ok: true, cognition: clone(cognition), observation: clone(observation), snapshot: this._managementSnapshotFromCurrent() };
    }

    manualCreateBatch(input = {}, options = {}) {
      if (!options[MANAGEMENT_LOCK_HELD]) {
        return this._withManagementLock(() => this.manualCreateBatch(input, { ...options, [MANAGEMENT_LOCK_HELD]: true }));
      }
      const conflict = this._prepareManagementMutation(options.expectedRevision);
      if (conflict) return conflict;
      const rawContent = normalizeManualInput(input.content);
      if (!rawContent) return { ok: false, code: 'COGNITION_EMPTY', message: '认知内容不能为空' };
      if (rawContent.length > MAX_MANUAL_INPUT_CHARS) {
        return { ok: false, code: 'COGNITION_TOO_LONG', message: `单次最多输入 ${MAX_MANUAL_INPUT_CHARS} 个字符，请精简后重试` };
      }
      if (isSensitiveText(rawContent)) return { ok: false, code: 'COGNITION_SENSITIVE', message: '认知内容疑似包含敏感信息，未保存' };

      const scope = VALID_SCOPES.has(input.scope) ? input.scope : 'global';
      const target = this._scopeTarget(scope, input.projectId);
      if (!target) return { ok: false, code: 'PROJECT_REQUIRED', message: '项目认知必须选择项目' };

      const existingKeys = new Set();
      this._knowledgeCollections().forEach(({ items }) => items.forEach(item => {
        if (item && item.status !== 'superseded') existingKeys.add(this.intelligence.compositeIdentity(item));
      }));

      const contents = splitManualContent(rawContent);
      const pending = [];
      let duplicateCount = 0;
      contents.forEach(content => {
        const key = this.intelligence.compositeIdentity({
          content,
          category: input.category,
          scope,
          projectId: target.projectId,
        });
        if (!key || existingKeys.has(key)) {
          duplicateCount += 1;
          return;
        }
        existingKeys.add(key);
        const observation = this._newObservation({
          category: input.category,
          scope,
          projectId: target.projectId,
          content,
          confidence: 1,
          source: 'user_manual',
        });
        pending.push({ observation, cognition: this._newKnowledge(observation, target) });
      });

      if (!pending.length) {
        return {
          ok: false,
          code: 'COGNITION_DUPLICATE',
          message: '输入内容均已存在，请编辑或迁移原认知',
          duplicateCount,
        };
      }

      pending.forEach(({ observation, cognition }) => {
        this.data.observations.push(observation);
        target.collection.push(cognition);
      });
      this._persist();
      return {
        ok: true,
        cognitions: clone(pending.map(item => item.cognition)),
        observations: clone(pending.map(item => item.observation)),
        createdCount: pending.length,
        duplicateCount,
        snapshot: this._managementSnapshotFromCurrent(),
      };
    }

    updateCognitionEntry(input = {}, options = {}) {
      if (!options[MANAGEMENT_LOCK_HELD]) {
        return this._withManagementLock(() => this.updateCognitionEntry(input, { ...options, [MANAGEMENT_LOCK_HELD]: true }));
      }
      const conflict = this._prepareManagementMutation(options.expectedRevision);
      if (conflict) return conflict;
      const found = this._findKnowledge(input.domain, input.id, input.projectId);
      if (!found || found.entry.status === 'superseded') return { ok: false, code: 'COGNITION_NOT_FOUND', message: '认知不存在或已失效' };
      const content = normalizeContent(input.content);
      if (!content) return { ok: false, code: 'COGNITION_EMPTY', message: '认知内容不能为空' };
      if (isSensitiveText(content)) return { ok: false, code: 'COGNITION_SENSITIVE', message: '认知内容疑似包含敏感信息，未保存' };
      if (content === found.entry.content) return { ok: true, unchanged: true, cognition: clone(found.entry), snapshot: this._managementSnapshotFromCurrent() };
      const target = this._scopeTarget(found.entry.scope, found.entry.projectId || input.projectId);
      const observation = this._newObservation({
        category: found.entry.category,
        scope: found.entry.scope,
        projectId: found.entry.projectId || input.projectId,
        content,
        confidence: 1,
        evidenceCount: found.entry.evidenceCount,
        source: 'user_manual_edit',
        sourceObservationId: found.entry.observationId,
      });
      this._supersedeByIdentity(found.entry, observation.id, 'user_edit');
      this._supersedeObservationById(found.entry.observationId, observation.id, 'user_edit');
      const cognition = this._newKnowledge(observation, target);
      this.data.observations.push(observation);
      target.collection.push(cognition);
      this._persist();
      return { ok: true, cognition: clone(cognition), observation: clone(observation), snapshot: this._managementSnapshotFromCurrent() };
    }

    supersedeCognitionEntry(input = {}, options = {}) {
      if (!options[MANAGEMENT_LOCK_HELD]) {
        return this._withManagementLock(() => this.supersedeCognitionEntry(input, { ...options, [MANAGEMENT_LOCK_HELD]: true }));
      }
      const conflict = this._prepareManagementMutation(options.expectedRevision);
      if (conflict) return conflict;
      const found = this._findKnowledge(input.domain, input.id, input.projectId);
      if (!found || found.entry.status === 'superseded') return { ok: false, code: 'COGNITION_NOT_FOUND', message: '认知不存在或已失效' };
      this._supersedeByIdentity(found.entry, null, 'user');
      this._supersedeObservationById(found.entry.observationId, null, 'user');
      this._persist();
      return { ok: true, snapshot: this._managementSnapshotFromCurrent() };
    }

    moveCognitionEntry(input = {}, options = {}) {
      if (!options[MANAGEMENT_LOCK_HELD]) {
        return this._withManagementLock(() => this.moveCognitionEntry(input, { ...options, [MANAGEMENT_LOCK_HELD]: true }));
      }
      const conflict = this._prepareManagementMutation(options.expectedRevision);
      if (conflict) return conflict;
      const found = this._findKnowledge(input.domain, input.id, input.projectId);
      if (!found || found.entry.status === 'superseded') return { ok: false, code: 'COGNITION_NOT_FOUND', message: '认知不存在或已失效' };
      const targetScope = VALID_SCOPES.has(input.targetScope) ? input.targetScope : null;
      const target = this._scopeTarget(targetScope, input.targetProjectId);
      if (!target) return { ok: false, code: 'PROJECT_REQUIRED', message: '迁移到项目认知时必须选择项目' };
      if (found.entry.scope === targetScope && (targetScope !== 'project' || found.entry.projectId === target.projectId)) {
        return { ok: true, unchanged: true, cognition: clone(found.entry), snapshot: this._managementSnapshotFromCurrent() };
      }
      const observation = this._newObservation({
        category: found.entry.category,
        scope: targetScope,
        projectId: target.projectId,
        content: found.entry.content,
        confidence: Math.max(0.95, Number(found.entry.confidence) || 0),
        evidenceCount: found.entry.evidenceCount,
        source: 'user_manual_scope',
        sourceObservationId: found.entry.observationId,
      });
      this._supersedeByIdentity(found.entry, observation.id, 'user_scope_change');
      this._supersedeObservationById(found.entry.observationId, observation.id, 'user_scope_change');
      const cognition = this._newKnowledge(observation, target);
      this.data.observations.push(observation);
      target.collection.push(cognition);
      this._persist();
      return { ok: true, cognition: clone(cognition), observation: clone(observation), snapshot: this._managementSnapshotFromCurrent() };
    }

    getEvidenceForEntry(input = {}) {
      this.reload();
      const found = this._findKnowledge(input.domain, input.id, input.projectId);
      if (!found) return { ok: false, code: 'COGNITION_NOT_FOUND', message: '未找到认知' };
      const entry = found.entry;
      const relatedIds = new Set([entry.observationId].filter(Boolean));
      let changed = true;
      while (changed) {
        changed = false;
        this.data.observations.forEach(observation => {
          if (!observation) return;
          const linked = relatedIds.has(observation.id)
            || relatedIds.has(observation.sourceObservationId)
            || relatedIds.has(observation.supersededBy);
          if (linked && !relatedIds.has(observation.id)) {
            relatedIds.add(observation.id);
            changed = true;
          }
          if (linked && observation.sourceObservationId && !relatedIds.has(observation.sourceObservationId)) {
            relatedIds.add(observation.sourceObservationId);
            changed = true;
          }
        });
      }
      const evidence = this.data.observations
        .filter(observation => observation && !isSensitiveText(observation.content) && (
          relatedIds.has(observation.id) || observation.fingerprint === entry.fingerprint
        ))
        .sort((a, b) => String(b.lastObservedAt || b.updatedAt || '').localeCompare(String(a.lastObservedAt || a.updatedAt || '')));
      return { ok: true, cognition: clone(entry), evidence: clone(evidence) };
    }
  }

  TeemoCognitionService.isSensitiveText = isSensitiveText;
  TeemoCognitionService.fingerprint = fingerprint;
  return TeemoCognitionService;
});
