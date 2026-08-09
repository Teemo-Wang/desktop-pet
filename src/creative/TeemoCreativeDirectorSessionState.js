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

    _key(sessionId) { return String(sessionId || '__renderer__'); }

    _default() {
      return { schemaVersion: 1, mode: 'balanced', intensity: 'standard', source: 'default', updatedAt: null };
    }

    getState(sessionId) {
      return clone(this.sessions.get(this._key(sessionId)) || this._default());
    }

    setMode(sessionId, mode, options = {}) {
      if (!Policy.MODES.has(mode)) return { ok: false, code: 'INVALID_CHALLENGE_MODE', state: this.getState(sessionId) };
      const intensity = options.intensity || this.getState(sessionId).intensity || 'standard';
      const source = options.source || 'ui';
      if (!Policy.INTENSITIES.has(intensity)) return { ok: false, code: 'INVALID_CHALLENGE_INTENSITY', state: this.getState(sessionId) };
      if (!Policy.SOURCES.has(source)) return { ok: false, code: 'INVALID_CHALLENGE_SOURCE', state: this.getState(sessionId) };
      const state = { schemaVersion: 1, mode, intensity, source, updatedAt: this.clock().toISOString() };
      this.sessions.set(this._key(sessionId), state);
      return { ok: true, state: clone(state) };
    }

    setIntensity(sessionId, intensity, options = {}) {
      const current = this.getState(sessionId);
      return this.setMode(sessionId, current.mode, { intensity, source: options.source || 'ui' });
    }

    clearSession(sessionId) {
      this.sessions.delete(this._key(sessionId));
      return this.getState(sessionId);
    }

    parseCommand(options = {}) {
      return Policy.parseCommand(currentUserMessage(options));
    }

    resolveRun(options = {}) {
      const sessionId = options.sessionId || null;
      const command = this.parseCommand(options);
      let session = this.getState(sessionId);
      let effectiveMode = session.mode;
      let effectiveIntensity = session.intensity;
      let oneShot = false;

      if (command.type === 'session_exit') {
        session = this.setMode(sessionId, 'balanced', { intensity: 'standard', source: 'explicit_command' }).state;
        effectiveMode = 'balanced';
        effectiveIntensity = 'standard';
      } else if (command.type === 'one_shot_suppress') {
        effectiveMode = 'balanced';
        oneShot = true;
      } else if (command.type === 'session_activate') {
        session = this.setMode(sessionId, 'challenge', { intensity: command.intensity, source: 'explicit_command' }).state;
        effectiveMode = 'challenge';
        effectiveIntensity = session.intensity;
      } else if (command.type === 'one_shot_challenge') {
        effectiveMode = 'challenge';
        effectiveIntensity = command.intensity || session.intensity || 'standard';
        oneShot = true;
      }

      return { sessionId, session, command, effectiveMode, effectiveIntensity, oneShot };
    }
  }

  return TeemoCreativeDirectorSessionState;
});
