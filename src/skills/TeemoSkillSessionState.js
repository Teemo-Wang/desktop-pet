/* Runtime-only, session-isolated active Skill state. */
(function (root, factory) {
  const SessionState = factory();
  if (root) root.TeemoSkillSessionState = SessionState;
  if (typeof window !== 'undefined') window.TeemoSkillSessionState = SessionState;
  if (typeof module === 'object' && module.exports) module.exports = SessionState;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  class TeemoSkillSessionState {
    constructor() { this.sessions = new Map(); }
    _key(sessionId) {
      const value = String(sessionId == null ? '' : sessionId).trim();
      return value || null;
    }
    get(sessionId) {
      const key = this._key(sessionId);
      const value = key && this.sessions.get(key);
      return value ? { ...value, selectedSkillIds: [...value.selectedSkillIds] } : null;
    }
    set(sessionId, route, options = {}) {
      const key = this._key(sessionId);
      if (!key || !route || !Array.isArray(route.selectedSkillIds) || !route.selectedSkillIds.length) return null;
      const state = {
        selectedSkillIds: [...route.selectedSkillIds],
        explicit: Boolean(options.explicit),
        updatedAt: Date.now(),
      };
      this.sessions.set(key, state);
      return this.get(key);
    }
    clear(sessionId) {
      const key = this._key(sessionId);
      if (key) this.sessions.delete(key);
      return null;
    }
    clearAll() { this.sessions.clear(); }
  }
  return TeemoSkillSessionState;
});
