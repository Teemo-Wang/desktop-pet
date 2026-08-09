/** Session-local, runtime-only Creative Director state. Never persisted. */
(function (root, factory) {
  const policy = root && root.TeemoCreativeDirectorPolicy
    ? root.TeemoCreativeDirectorPolicy
    : require('./TeemoCreativeDirectorPolicy');
  const State = factory(policy);
  if (root) root.TeemoCreativeDirectorSessionState = State;
  if (typeof window !== 'undefined') window.TeemoCreativeDirectorSessionState = State;
  if (typeof module === 'object' && module.exports) module.exports = State;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Policy) {
  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function currentUserMessage(options = {}) {
    if (options.userMessage != null) return options.userMessage;
    const messages = Array.isArray(options.messages) ? options.messages : [];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index] && messages[index].role === 'user') return messages[index].content;
    }
    return null;
  }

  class TeemoCreativeDirectorSessionState {
    constructor(options = {}) {
      this.clock = typeof options.clock === 'function' ? options.clock : () => new Date();
      this.sessions = new Map();
    }

    _key(sessionId) {
      if (sessionId == null || String(sessionId).trim() === '') return null;
      return String(sessionId);
    }

    _default() {
      return { schemaVersion: 1, mode: 'balanced', intensity: 'standard', source: 'default', updatedAt: null };
    }

    getState(sessionId) {
      const key = this._key(sessionId);
      return clone((key && this.sessions.get(key)) || this._default());
    }

    setMode(sessionId, mode, options = {}) {
      const key = this._key(sessionId);
      if (!key) return { ok: false, code: 'MISSING_CHALLENGE_SESSION_ID', state: this._default() };
      if (!Policy.MODES.has(mode)) return { ok: false, code: 'INVALID_CHALLENGE_MODE', state: this.getState(sessionId) };
      const intensity = options.intensity || this.getState(sessionId).intensity || 'standard';
      const source = options.source || 'ui';
      if (!Policy.INTENSITIES.has(intensity)) return { ok: false, code: 'INVALID_CHALLENGE_INTENSITY', state: this.getState(sessionId) };
      if (!Policy.SOURCES.has(source)) return { ok: false, code: 'INVALID_CHALLENGE_SOURCE', state: this.getState(sessionId) };
      const state = { schemaVersion: 1, mode, intensity, source, updatedAt: this.clock().toISOString() };
      this.sessions.set(key, state);
      return { ok: true, state: clone(state) };
    }

    setIntensity(sessionId, intensity, options = {}) {
      const current = this.getState(sessionId);
      return this.setMode(sessionId, current.mode, { intensity, source: options.source || 'ui' });
    }

    clearSession(sessionId) {
      const key = this._key(sessionId);
      if (key) this.sessions.delete(key);
      return this.getState(sessionId);
    }

    parseCommand(options = {}) {
      return Policy.parseCommand(currentUserMessage(options));
    }

    resolveRun(options = {}) {
      const sessionId = options.sessionId || null;
      const hasSession = Boolean(this._key(sessionId));
      const command = this.parseCommand(options);
      let session = this.getState(sessionId);
      let effectiveMode = session.mode;
      let effectiveIntensity = session.intensity;
      let oneShot = false;

      if (command.type === 'session_exit') {
        if (hasSession) session = this.setMode(sessionId, 'balanced', { intensity: 'standard', source: 'explicit_command' }).state;
        effectiveMode = 'balanced';
        effectiveIntensity = 'standard';
      } else if (command.type === 'one_shot_suppress') {
        effectiveMode = 'balanced';
        oneShot = true;
      } else if (command.type === 'session_activate') {
        if (hasSession) {
          session = this.setMode(sessionId, 'challenge', { intensity: command.intensity, source: 'explicit_command' }).state;
          effectiveMode = 'challenge';
          effectiveIntensity = session.intensity;
        } else {
          effectiveMode = 'balanced';
          effectiveIntensity = 'standard';
        }
      } else if (command.type === 'one_shot_challenge') {
        effectiveMode = 'challenge';
        effectiveIntensity = command.intensity || session.intensity || 'standard';
        oneShot = true;
      }

      return { sessionId, hasSession, session, command, effectiveMode, effectiveIntensity, oneShot };
    }
  }

  return TeemoCreativeDirectorSessionState;
});
