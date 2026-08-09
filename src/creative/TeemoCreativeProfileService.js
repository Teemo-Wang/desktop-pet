/**
 * Local state for Teemo Agent's versioned Creative Profile.
 * Professional principles stay in source; this file persists only user control state.
 */
(function (root, factory) {
  const StorageService = root && root.TeemoStorageService
    ? root.TeemoStorageService
    : require('../services/TeemoStorageService');
  const defaults = root && root.TeemoCreativeProfileDefaults
    ? root.TeemoCreativeProfileDefaults
    : require('./TeemoCreativeProfileDefaults');
  const Service = factory(StorageService, defaults);
  if (root) root.TeemoCreativeProfileService = Service;
  if (typeof window !== 'undefined') window.TeemoCreativeProfileService = Service;
  if (typeof module === 'object' && module.exports) module.exports = Service;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (TeemoStorageService, TeemoCreativeProfileDefaults) {
  const STATE_FILE = 'Teemo-creative-profile.json';
  const SCHEMA_VERSION = 1;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function defaultState() {
    const profile = TeemoCreativeProfileDefaults.getProfile();
    return {
      schemaVersion: SCHEMA_VERSION,
      profileVersion: profile.profileVersion,
      enabled: true,
      revision: 0,
      updatedAt: null,
    };
  }

  function normalizeState(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const state = defaultState();
    state.enabled = source.enabled !== false;
    state.revision = Math.max(0, Number(source.revision) || 0);
    state.updatedAt = source.updatedAt || null;
    return state;
  }

  class TeemoCreativeProfileService {
    constructor(options = {}) {
      if (!TeemoStorageService && !options.storage) throw new Error('TeemoCreativeProfileService 缺少 TeemoStorageService');
      this.storage = options.storage || new TeemoStorageService(options);
      this.fileName = options.fileName || STATE_FILE;
      this.clock = typeof options.clock === 'function' ? options.clock : () => new Date();
      this.state = this._load();
    }

    _load() {
      if (!this.storage.exists(this.fileName)) return defaultState();
      return normalizeState(this.storage.readJson(this.fileName, null));
    }

    reload() {
      this.state = this._load();
      return this.getState();
    }

    _persist() {
      this.state.schemaVersion = SCHEMA_VERSION;
      this.state.profileVersion = TeemoCreativeProfileDefaults.getProfile().profileVersion;
      this.state.revision = Math.max(0, Number(this.state.revision) || 0) + 1;
      this.state.updatedAt = this.clock().toISOString();
      this.storage.writeJson(this.fileName, this.state);
    }

    isEnabled() {
      return this.state.enabled !== false;
    }

    getState() {
      return clone(this.state);
    }

    getProfile() {
      return TeemoCreativeProfileDefaults.getProfile();
    }

    getManagementSnapshot() {
      this.reload();
      return { state: this.getState(), profile: this.getProfile() };
    }

    setEnabled(enabled, options = {}) {
      this.reload();
      const currentRevision = Math.max(0, Number(this.state.revision) || 0);
      if (options.expectedRevision != null && Number(options.expectedRevision) !== currentRevision) {
        return {
          ok: false,
          code: 'CREATIVE_PROFILE_CHANGED',
          message: '设计判断状态已在其他窗口更新，请刷新后重试',
          snapshot: { state: this.getState(), profile: this.getProfile() },
        };
      }
      this.state.enabled = enabled !== false;
      this._persist();
      return { ok: true, snapshot: { state: this.getState(), profile: this.getProfile() } };
    }
  }

  TeemoCreativeProfileService.STATE_FILE = STATE_FILE;
  return TeemoCreativeProfileService;
});
