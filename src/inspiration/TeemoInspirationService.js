(function (root, factory) {
  const Storage = root && root.TeemoStorageService
    ? root.TeemoStorageService
    : require('../services/TeemoStorageService');
  const Contracts = root && root.TeemoInspirationContracts
    ? root.TeemoInspirationContracts
    : require('./TeemoInspirationContracts');
  const Service = factory(Storage, Contracts);
  if (root) root.TeemoInspirationService = Service;
  if (typeof window !== 'undefined') window.TeemoInspirationService = Service;
  if (typeof module === 'object' && module.exports) module.exports = Service;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (TeemoStorageService, Contracts) {
  const STATE_FILE = 'Teemo-inspiration-state.json';

  function defaultState() {
    return {
      schemaVersion: Contracts.SCHEMA_VERSION,
      enabled: false,
      revision: 0,
      updatedAt: null,
    };
  }

  function unreadableState() {
    return {
      ...defaultState(),
      stateError: Contracts.publicError({ code: Contracts.ERROR_CODES.stateUnreadable }),
    };
  }

  function isValidState(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    if (value.schemaVersion !== Contracts.SCHEMA_VERSION) return false;
    if (typeof value.enabled !== 'boolean') return false;
    if (!Number.isSafeInteger(value.revision) || value.revision < 0) return false;
    if (value.updatedAt !== null && (typeof value.updatedAt !== 'string' || Number.isNaN(Date.parse(value.updatedAt)))) return false;
    return true;
  }

  function normalizeState(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
      schemaVersion: Contracts.SCHEMA_VERSION,
      enabled: source.enabled === true,
      revision: Math.max(0, Number(source.revision) || 0),
      updatedAt: source.updatedAt || null,
    };
  }

  class TeemoInspirationService {
    constructor(options = {}) {
      if (!TeemoStorageService && !options.storage) throw new Error('TeemoInspirationService 缺少 TeemoStorageService');
      this.storage = options.storage || new TeemoStorageService(options);
      this.fileName = options.fileName || STATE_FILE;
      this.registry = options.registry || null;
      this.accessGuard = options.accessGuard || null;
      this.clock = typeof options.clock === 'function' ? options.clock : () => new Date();
      this.state = this._load();
    }

    _load() {
      if (!this.storage.exists(this.fileName)) return defaultState();
      const value = this.storage.readJson(this.fileName, null);
      if (!isValidState(value)) return unreadableState();
      return normalizeState(value);
    }

    reload() {
      this.state = this._load();
      return this.getState();
    }

    getState() {
      return Contracts.clone(this.state);
    }

    isEnabled() {
      return !this.state.stateError && this.state.enabled === true;
    }

    getManagementSnapshot() {
      this.reload();
      return {
        state: this.getState(),
        enabled: this.isEnabled(),
        connectors: this.registry && typeof this.registry.listDefinitions === 'function'
          ? this.registry.listDefinitions()
          : [],
        sources: [],
      };
    }

    setEnabled(enabled, options = {}) {
      const expectedRevision = options.expectedRevision == null ? null : Number(options.expectedRevision);
      const locked = this.storage.withFileLock(this.fileName, () => {
        const latest = this._load();
        if (latest.stateError) {
          return { ok: false, error: Contracts.publicError({ code: Contracts.ERROR_CODES.stateUnreadable }) };
        }
        if (expectedRevision != null && expectedRevision !== latest.revision) {
          return { ok: false, error: Contracts.publicError({ code: Contracts.ERROR_CODES.stateChanged }) };
        }
        const next = {
          schemaVersion: Contracts.SCHEMA_VERSION,
          enabled: enabled === true,
          revision: latest.revision + 1,
          updatedAt: this.clock().toISOString(),
        };
        this.storage.writeJson(this.fileName, next);
        return { ok: true, state: next };
      });
      if (!locked.acquired) {
        return { ok: false, error: Contracts.publicError({ code: Contracts.ERROR_CODES.stateChanged }), snapshot: this.getManagementSnapshot() };
      }
      if (!locked.value.ok) {
        this.reload();
        return { ...locked.value, snapshot: this.getManagementSnapshot() };
      }
      this.state = locked.value.state;
      return { ok: true, snapshot: this.getManagementSnapshot() };
    }

    async read(connectorId, operation, request = {}, context = {}) {
      this.reload();
      if (this.state.stateError) return { ok: false, error: Contracts.publicError({ code: Contracts.ERROR_CODES.stateUnreadable }) };
      if (!this.isEnabled()) return { ok: false, error: Contracts.publicError({ code: Contracts.ERROR_CODES.disabled }) };
      if (!this.accessGuard || typeof this.accessGuard.execute !== 'function') {
        return { ok: false, error: Contracts.publicError({ code: Contracts.ERROR_CODES.connectorUnavailable }) };
      }
      try {
        const data = await this.accessGuard.execute(connectorId, operation, request, context);
        return { ok: true, data: Contracts.clone(data) };
      } catch (error) {
        return { ok: false, error: Contracts.publicError(error) };
      }
    }

    readLocalFolder(sourceId, operation, request = {}, context = {}) {
      const id = Contracts.safeText(sourceId, 120);
      if (!id) return Promise.resolve({ ok: false, error: Contracts.publicError({ code: Contracts.ERROR_CODES.connectorInvalid }) });
      return this.read('local-folder', operation, { ...Contracts.clone(request), sourceId: id }, {
        ...context,
        permissionToolName: 'inspiration_local_folder',
        permissionResource: `inspiration://local-folder/${encodeURIComponent(id)}`,
        requiresExecutionAuthorization: true,
      });
    }

    readEagleLibrary(sourceId, operation, request = {}, context = {}) {
      const id = Contracts.safeText(sourceId, 120);
      if (!id) return Promise.resolve({ ok: false, error: Contracts.publicError({ code: Contracts.ERROR_CODES.connectorInvalid }) });
      return this.read('eagle-library', operation, { ...Contracts.clone(request), sourceId: id }, {
        ...context,
        permissionToolName: 'inspiration_eagle_library',
        permissionResource: `inspiration://eagle-library/${encodeURIComponent(id)}`,
        requiresExecutionAuthorization: true,
      });
    }
  }

  TeemoInspirationService.STATE_FILE = STATE_FILE;
  TeemoInspirationService.SCHEMA_VERSION = Contracts.SCHEMA_VERSION;
  return TeemoInspirationService;
});
