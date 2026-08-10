/* Renderer IPC client for P4-2. It transports only an opaque snapshot ID and normalized point. */
(function (root, factory) {
  const api = factory();
  if (root) root.TeemoDesktopActionClient = api;
  if (typeof window !== 'undefined') window.TeemoDesktopActionClient = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CHANNELS = Object.freeze({
    prepare: 'teemo-desktop-action:prepare',
    execute: 'teemo-desktop-action:execute',
    release: 'teemo-desktop-action:release',
  });

  function safeError(payload, fallback) {
    const error = new Error(payload && payload.message ? payload.message : fallback);
    error.code = payload && payload.code ? payload.code : 'DESKTOP_ACTION_IPC_FAILED';
    error.teemoSafe = true;
    return error;
  }

  class TeemoDesktopActionClient {
    constructor(options = {}) {
      this.ipcRenderer = options.ipcRenderer || null;
    }

    _invoke(channel, payload) {
      if (!this.ipcRenderer || typeof this.ipcRenderer.invoke !== 'function') {
        throw safeError(null, 'Controlled desktop actions are unavailable.');
      }
      return this.ipcRenderer.invoke(channel, payload);
    }

    async prepare(snapshotId, point, context = {}) {
      const result = await this._invoke(CHANNELS.prepare, {
        snapshotId,
        point: point && { x: point.x, y: point.y },
        toolCallId: context.toolCallId || null,
        runId: context.runId || null,
        sessionId: null,
      });
      if (!result || !result.ok) throw safeError(result && result.error, 'Desktop action could not be prepared.');
      return Object.freeze({
        resource: result.resource,
        reason: result.reason,
        expiresAt: result.expiresAt,
        preparation: Object.freeze({ actionId: result.actionId }),
      });
    }

    async execute(preparation) {
      const actionId = preparation && preparation.actionId;
      const result = await this._invoke(CHANNELS.execute, { actionId });
      if (!result || !result.ok) throw safeError(result && result.error, 'Desktop action failed safely.');
      return result.result;
    }

    async release(preparation) {
      const actionId = preparation && preparation.actionId;
      if (!actionId) return false;
      const result = await this._invoke(CHANNELS.release, { actionId });
      return !!(result && result.ok && result.released);
    }
  }

  TeemoDesktopActionClient.CHANNELS = CHANNELS;
  return TeemoDesktopActionClient;
});
