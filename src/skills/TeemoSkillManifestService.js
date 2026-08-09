/* Persistent, revisioned Internal Manifest Registry for legacy and new Skills. */
(function (root, factory) {
  const Service = factory(
    root && root.TeemoSkillSpecification,
    root && root.TeemoSkillImporter,
    root && root.TeemoSkillValidator,
    root && root.TeemoStorageService,
  );
  if (root) root.TeemoSkillManifestService = Service;
  if (typeof window !== 'undefined') window.TeemoSkillManifestService = Service;
  if (typeof module === 'object' && module.exports) module.exports = Service;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Specification, ImporterClass, ValidatorClass, StorageClass) {
  const Spec = Specification || (typeof require === 'function' ? require('./TeemoSkillSpecification') : null);
  const TeemoSkillImporter = ImporterClass || (typeof require === 'function' ? require('./TeemoSkillImporter') : null);
  const TeemoSkillValidator = ValidatorClass || (typeof require === 'function' ? require('./TeemoSkillValidator') : null);
  const TeemoStorageService = StorageClass || (typeof require === 'function' ? require('../services/TeemoStorageService') : null);
  const REGISTRY_FILE = 'Teemo-skill-registry.json';

  function registryError(code, message) {
    const error = new Error(message);
    error.name = 'TeemoSkillRegistryError';
    error.code = code;
    return error;
  }

  class TeemoSkillManifestService {
    constructor(options = {}) {
      this.skillService = options.skillService || null;
      this.storage = options.storage || new TeemoStorageService(options);
      this.importer = options.importer || new TeemoSkillImporter();
      this.validator = options.validator || new TeemoSkillValidator();
      this.registryFile = options.registryFile || REGISTRY_FILE;
      this.registry = null;
      this.error = null;
      this.synchronize();
      if (this.skillService && typeof this.skillService.onChange === 'function') {
        this.skillService.onChange(() => { try { this.synchronize(); } catch (_) { /* surfaced through status */ } });
      }
    }

    _sources() {
      if (!this.skillService || typeof this.skillService.getAll !== 'function') return [];
      return this.skillService.getAll().filter(skill => skill && skill.id !== 'skill1').map(skill => ({
        id: String(skill.id), name: skill.name, desc: skill.desc, description: skill.desc,
        triggers: skill.triggers, domains: skill.domains, allowComposition: skill.allowComposition,
        rawBody: String(skill.rawSource != null ? skill.rawSource : skill.systemPrompt || skill.promptTpl || (typeof skill.prompt === 'string' ? skill.prompt : '') || ''),
        sourceRef: `skills.json#${String(skill.id)}`,
      }));
    }

    _normalizeRegistry(value) {
      const envelope = this.validator.validateRegistryEnvelope(value);
      if (!envelope.valid) throw registryError('SKILL_REGISTRY_UNREADABLE', `Skill 路由数据无效：${envelope.errors[0]}`);
      const skills = [];
      const invalidSkills = [];
      for (const manifest of value.skills) {
        const validation = this.validator.validateManifest(manifest);
        if (validation.valid) {
          skills.push(manifest);
          continue;
        }
        invalidSkills.push({
          skillId: String(manifest && manifest.skillId || ''),
          name: String(manifest && manifest.name || manifest && manifest.skillId || 'Unknown Skill'),
          sourceRef: String(manifest && manifest.source && manifest.source.sourceRef || ''),
          status: 'invalid',
          errors: validation.errors.slice(),
        });
      }
      const normalized = { ...value, skills, invalidSkills };
      Object.defineProperty(normalized, '_registrySkills', {
        value: value.skills.map(item => Spec.clone(item)),
        enumerable: false,
      });
      return normalized;
    }

    _read() {
      const value = this.storage.readJson(this.registryFile, null);
      const state = this.storage.getReadState(this.registryFile);
      if (state === 'error') throw registryError('SKILL_REGISTRY_UNREADABLE', 'Skill 路由数据无法读取');
      if (state === 'missing') return null;
      return this._normalizeRegistry(value);
    }

    _write(registry, options = {}) {
      const persistent = Spec.clone(registry);
      delete persistent.invalidSkills;
      const validation = options.allowInvalidEntries
        ? this.validator.validateRegistryEnvelope(persistent)
        : this.validator.validateRegistry(persistent);
      if (!validation.valid) throw registryError('SKILL_MANIFEST_INVALID', validation.errors.join('; '));
      this.storage.writeJson(this.registryFile, persistent);
      this.registry = this._normalizeRegistry(persistent);
      this.error = null;
      return this.registry;
    }

    synchronize() {
      try {
        const locked = this.storage.withFileLock(this.registryFile, () => {
          // Read, compare and write inside one lock so renderer startup/migration
          // cannot overwrite a newer override from another window.
          const existing = this._read();
          if (existing && existing.invalidSkills && existing.invalidSkills.length) {
            this.registry = existing;
            this.error = null;
            return existing;
          }
          const sources = this._sources();
          const previousById = new Map((existing && existing.skills || []).map(item => [item.skillId, item]));
          const generated = sources.map(source => this.importer.buildManifest(source, previousById.get(source.id)));
          const changed = !existing || JSON.stringify(existing.skills) !== JSON.stringify(generated);
          if (!changed) {
            this.registry = existing;
            this.error = null;
            return existing;
          }
          return this._write({
            schemaVersion: Spec.schemaVersion,
            revision: existing ? existing.revision + 1 : 1,
            updatedAt: new Date().toISOString(),
            skills: generated,
          });
        });
        if (!locked.acquired) throw registryError('SKILL_REGISTRY_CHANGED', 'Skill 路由信息正在由另一窗口更新');
        return this.getRegistrySnapshot();
      } catch (error) {
        this.registry = null;
        this.error = { code: error.code || 'SKILL_REGISTRY_UNREADABLE', message: error.message || 'Skill 路由数据无法读取' };
        return { ok: false, error: { ...this.error }, schemaVersion: Spec.schemaVersion, revision: null, skills: [] };
      }
    }

    reload() {
      try {
        if (this.skillService && typeof this.skillService.reload === 'function') this.skillService.reload();
        this.registry = this._read();
        this.error = null;
      } catch (error) {
        this.registry = null;
        this.error = { code: error.code || 'SKILL_REGISTRY_UNREADABLE', message: error.message };
      }
      return this.getRegistrySnapshot();
    }

    getRegistrySnapshot() {
      if (this.error) return { ok: false, error: { ...this.error }, schemaVersion: Spec.schemaVersion, revision: null, skills: [] };
      const registry = this.registry || { schemaVersion: Spec.schemaVersion, revision: 0, updatedAt: null, skills: [], invalidSkills: [] };
      return { ok: true, ...Spec.clone(registry) };
    }

    getSkillManifest(skillId) {
      const snapshot = this.getRegistrySnapshot();
      return snapshot.ok ? snapshot.skills.find(item => item.skillId === String(skillId)) || null : null;
    }

    getRawSkill(skillId) {
      if (!this.skillService || typeof this.skillService.get !== 'function') return null;
      const source = this.skillService.get(String(skillId));
      if (!source) return null;
      return {
        skillId: String(source.id), id: String(source.id), name: source.name,
        desc: source.desc, description: source.desc, triggers: source.triggers,
        domains: source.domains, allowComposition: source.allowComposition,
        rawBody: String(source.rawSource != null ? source.rawSource : source.systemPrompt || source.promptTpl || (typeof source.prompt === 'string' ? source.prompt : '') || ''),
        sourceRef: `skills.json#${String(source.id)}`,
      };
    }

    _update(skillId, expectedRevision, mutate, options = {}) {
      const locked = this.storage.withFileLock(this.registryFile, () => {
        const current = this._read();
        if (!current) throw registryError('SKILL_REGISTRY_UNREADABLE', 'Skill Registry 不存在');
        if (expectedRevision != null && current.revision !== expectedRevision) throw registryError('SKILL_REGISTRY_CHANGED', 'Skill 路由信息已变化，请重新载入');
        const entries = current._registrySkills || current.skills;
        const index = entries.findIndex(item => item && item.skillId === String(skillId));
        if (index < 0) throw registryError('SKILL_MANIFEST_INVALID', 'Skill Manifest 不存在');
        const targetValidation = this.validator.validateManifest(entries[index]);
        if (!targetValidation.valid && !options.allowInvalidTarget) throw registryError('SKILL_MANIFEST_INVALID', '该 Skill Manifest 无效，请先显式重建 Routing Metadata');
        const next = {
          schemaVersion: current.schemaVersion,
          revision: current.revision + 1,
          updatedAt: new Date().toISOString(),
          skills: entries.map(item => Spec.clone(item)),
        };
        next.skills[index] = mutate(next.skills[index]);
        return this._write(next, { allowInvalidEntries: Boolean(current.invalidSkills && current.invalidSkills.length) });
      });
      if (!locked.acquired) throw registryError('SKILL_REGISTRY_CHANGED', 'Skill 路由信息正在由另一窗口更新');
      return this.getRegistrySnapshot();
    }

    updateRoutingOverride(skillId, patch, expectedRevision) {
      const allowed = new Set(['status', 'role', 'domains', 'intents', 'aliases', 'positiveExamples', 'negativeExamples', 'exclusions', 'allowComposition', 'continuity', 'priority', 'inputModalities', 'outputModalities', 'sensitivity']);
      return this._update(skillId, expectedRevision, manifest => {
        const overrides = { ...(manifest.overrides || {}) };
        for (const [key, value] of Object.entries(patch || {})) if (allowed.has(key)) overrides[key] = Spec.clone(value);
        const routingOverrides = {};
        for (const key of ['status', 'role', 'domains', 'intents', 'aliases', 'positiveExamples', 'negativeExamples', 'exclusions', 'allowComposition', 'continuity', 'priority']) {
          if (Object.prototype.hasOwnProperty.call(overrides, key)) routingOverrides[key] = overrides[key];
        }
        const generatedModalities = manifest.generatedModalities || manifest.modalities;
        const generatedContent = manifest.generatedContent || manifest.content;
        const next = {
          ...manifest,
          overrides,
          routing: { ...(manifest.generatedRouting || manifest.routing), ...routingOverrides },
          modalities: {
            input: Array.isArray(overrides.inputModalities) ? Spec.normalizeList(overrides.inputModalities).filter(item => Spec.MODALITIES.includes(item)) : Spec.clone(generatedModalities.input),
            output: Array.isArray(overrides.outputModalities) ? Spec.normalizeList(overrides.outputModalities).filter(item => Spec.MODALITIES.includes(item)) : Spec.clone(generatedModalities.output),
          },
          content: { ...generatedContent, sensitivity: Spec.SENSITIVITIES.includes(overrides.sensitivity) ? overrides.sensitivity : generatedContent.sensitivity },
        };
        for (const field of ['domains', 'intents', 'aliases', 'positiveExamples', 'negativeExamples', 'exclusions']) next.routing[field] = Spec.normalizeList(next.routing[field]);
        const validation = this.validator.validateManifest(next);
        if (!validation.valid) throw registryError('SKILL_MANIFEST_INVALID', validation.errors.join('; '));
        return next;
      });
    }

    resetRoutingOverride(skillId, expectedRevision) {
      return this._update(skillId, expectedRevision, manifest => ({
        ...manifest,
        overrides: {},
        routing: Spec.clone(manifest.generatedRouting || Spec.defaultRouting()),
        modalities: Spec.clone(manifest.generatedModalities || manifest.modalities),
        content: Spec.clone(manifest.generatedContent || manifest.content),
      }));
    }

    setRoutingEnabled(skillId, enabled, expectedRevision) {
      return this.updateRoutingOverride(skillId, { status: enabled ? 'ready' : 'disabled' }, expectedRevision);
    }

    rebuildManifest(skillId, expectedRevision) {
      const source = this.getRawSkill(skillId);
      if (!source) throw registryError('SKILL_MANIFEST_INVALID', 'Raw Skill 不存在');
      return this._update(skillId, expectedRevision, previous => {
        const rebuilt = this.importer.buildManifest({
          ...source,
          id: source.skillId,
          sourceRef: previous && previous.source && previous.source.sourceRef || `skills.json#${source.skillId}`,
        }, null);
        const validation = this.validator.validateManifest(rebuilt, { rawBody: source.rawBody });
        if (!validation.valid) throw registryError('SKILL_MANIFEST_INVALID', validation.errors.join('; '));
        return rebuilt;
      }, { allowInvalidTarget: true });
    }

    validateSkill(skillId) {
      const manifest = this.getSkillManifest(skillId);
      const raw = this.getRawSkill(skillId);
      return manifest ? this.validator.validateManifest(manifest, { rawBody: raw && raw.rawBody }) : { valid: false, errors: ['manifest not found'] };
    }
  }

  TeemoSkillManifestService.REGISTRY_FILE = REGISTRY_FILE;
  return TeemoSkillManifestService;
});
