/* Runtime-only P5-1 plan ownership. This class intentionally has no storage dependency. */
(function (root, factory) {
  const State = factory();
  if (root) root.TeemoPlanningSessionState = State;
  if (typeof window !== 'undefined') window.TeemoPlanningSessionState = State;
  if (typeof module === 'object' && module.exports) module.exports = State;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  class TeemoPlanningSessionState {
    constructor(options = {}) {
      this.clock = typeof options.clock === 'function' ? options.clock : () => new Date();
      this.plans = new Map();
    }

    _key(sessionId) {
      const value = String(sessionId == null ? '' : sessionId).trim();
      return value || null;
    }

    get(sessionId) {
      const key = this._key(sessionId);
      const value = key ? this.plans.get(key) : null;
      return value ? clone(value) : null;
    }

    set(sessionId, plan) {
      const key = this._key(sessionId);
      if (!key || !plan || typeof plan !== 'object') return { ok: false, code: 'MISSING_PLANNING_SESSION' };
      const value = { plan: clone(plan), createdAt: this.clock().toISOString(), revisedAt: null };
      this.plans.set(key, value);
      return { ok: true, value: this.get(sessionId) };
    }

    revise(sessionId, plan) {
      const key = this._key(sessionId);
      const current = key ? this.plans.get(key) : null;
      if (!current) return { ok: false, code: 'PLAN_NOT_FOUND' };
      current.plan = clone(plan);
      current.revisedAt = this.clock().toISOString();
      return { ok: true, value: this.get(sessionId) };
    }

    discard(sessionId) {
      const key = this._key(sessionId);
      const discarded = Boolean(key && this.plans.delete(key));
      return { ok: true, discarded };
    }
  }

  return TeemoPlanningSessionState;
});
