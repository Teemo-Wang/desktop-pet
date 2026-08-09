/* Renderer-side IPC client. The Main Process remains the permission source of truth. */
(function (root, factory) {
  const api = factory();
  if (root) root.TeemoPermissionClient = api;
  if (typeof window !== 'undefined') window.TeemoPermissionClient = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CHANNELS = Object.freeze({
    request: 'teemo-permission:request',
    prompt: 'teemo-permission:prompt',
    respond: 'teemo-permission:respond',
    cancel: 'teemo-permission:cancel',
    evaluate: 'teemo-permission:evaluate',
    list: 'teemo-permission:list',
    revoke: 'teemo-permission:revoke',
    clearSession: 'teemo-permission:clear-session',
  });

  class TeemoPermissionClient {
    constructor(options = {}) {
      this.ipcRenderer = options.ipcRenderer || null;
      this.decisionProvider = options.decisionProvider || null;
      this.waiters = new Map();
      if (this.ipcRenderer && typeof this.ipcRenderer.on === 'function') {
        this.ipcRenderer.on(CHANNELS.prompt, (_event, request) => this._handlePrompt(request));
      }
    }

    async _handlePrompt(request) {
      if (!request || !request.toolCallId || !request.permissionRequestId) return;
      const waiter = this.waiters.get(request.toolCallId);
      if (!waiter || waiter.settled) return;
      waiter.permissionRequestId = request.permissionRequestId;
      if (typeof waiter.onPrompt === 'function') waiter.onPrompt(request);
      const provider = waiter.decisionProvider
        || this.decisionProvider
        || (typeof window !== 'undefined' && window.TeemoPermissionPrompt && window.TeemoPermissionPrompt.request);
      if (typeof provider !== 'function') {
        await this.ipcRenderer.invoke(CHANNELS.respond, {
          permissionRequestId: request.permissionRequestId,
          response: { decision: 'deny', reason: 'prompt_unavailable' },
        });
        return;
      }
      try {
        const response = await provider(request);
        if (!waiter.settled) {
          await this.ipcRenderer.invoke(CHANNELS.respond, {
            permissionRequestId: request.permissionRequestId,
            response,
          });
        }
      } catch (_) {
        if (!waiter.settled) {
          await this.ipcRenderer.invoke(CHANNELS.respond, {
            permissionRequestId: request.permissionRequestId,
            response: { decision: 'deny', reason: 'prompt_failed' },
          });
        }
      }
    }

    async authorize(request, options = {}) {
      if (!this.ipcRenderer || typeof this.ipcRenderer.invoke !== 'function') {
        throw new Error('Permission IPC is unavailable.');
      }
      const signal = options.signal || null;
      if (signal && signal.aborted) return { decision: 'deny', reason: 'cancelled', source: 'abort' };
      const waiter = {
        settled: false,
        onPrompt: options.onPrompt || null,
        decisionProvider: options.decisionProvider || null,
        permissionRequestId: null,
      };
      this.waiters.set(request.toolCallId, waiter);
      const abortListener = signal ? () => {
        this.ipcRenderer.invoke(CHANNELS.cancel, {
          toolCallId: request.toolCallId,
          permissionRequestId: waiter.permissionRequestId,
        }).catch(() => {});
      } : null;
      if (signal) signal.addEventListener('abort', abortListener, { once: true });
      try {
        return await this.ipcRenderer.invoke(CHANNELS.request, request);
      } finally {
        waiter.settled = true;
        this.waiters.delete(request.toolCallId);
        if (signal && abortListener) signal.removeEventListener('abort', abortListener);
        if (waiter.permissionRequestId && typeof window !== 'undefined'
          && window.TeemoPermissionPrompt && typeof window.TeemoPermissionPrompt.dismiss === 'function') {
          window.TeemoPermissionPrompt.dismiss(waiter.permissionRequestId);
        }
      }
    }

    evaluate(request) { return this.ipcRenderer.invoke(CHANNELS.evaluate, request); }
    listGrants(filters = {}) { return this.ipcRenderer.invoke(CHANNELS.list, filters); }
    revoke(grantId) { return this.ipcRenderer.invoke(CHANNELS.revoke, { grantId }); }
    clearSessionGrants(sessionId) { return this.ipcRenderer.invoke(CHANNELS.clearSession, { sessionId }); }
  }

  TeemoPermissionClient.CHANNELS = CHANNELS;
  return TeemoPermissionClient;
});
