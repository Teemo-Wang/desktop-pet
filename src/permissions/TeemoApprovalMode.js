/* Teemo Chat approval mode: GPT-style three levels. Full mode expands local Safe File roots. */
(function (root, factory) {
  const api = factory();
  if (root) root.TeemoApprovalMode = api;
  if (typeof window !== 'undefined') window.TeemoApprovalMode = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MODES = Object.freeze({
    ASK: 'ask',
    ASSISTED: 'assisted',
    FULL: 'full',
  });

  const LABELS = Object.freeze({
    [MODES.ASK]: '请求批准',
    [MODES.ASSISTED]: '帮我批准',
    [MODES.FULL]: '完全访问',
  });

  const DESCRIPTIONS = Object.freeze({
    [MODES.ASK]: '可访问本机各盘；读写本地文件时每次都询问你',
    [MODES.ASSISTED]: '可访问本机各盘；读取自动允许，写入或有风险时再询问',
    [MODES.FULL]: '可访问本机各盘；本会话读写自动允许（高风险操作仍会询问）',
  });

  function normalizeMode(value) {
    const mode = String(value || '').trim().toLowerCase();
    if (mode === MODES.ASSISTED || mode === 'help' || mode === 'smart') return MODES.ASSISTED;
    if (mode === MODES.FULL || mode === 'auto' || mode === 'full_access') return MODES.FULL;
    return MODES.ASK;
  }

  function isForcedPromptTool(request = {}) {
    const toolName = String(request.toolName || '');
    const permission = String(request.permission || '');
    if (permission === 'execute') return true;
    return /desktop_primary_click|comfyui_builtin_render|run_npm_script|git_/i.test(toolName);
  }

  /** Returns an automatic permission response, or null to show the normal prompt. */
  function decide(request = {}, modeInput = MODES.ASK) {
    const mode = normalizeMode(modeInput);
    if (isForcedPromptTool(request)) return null;
    const permission = String(request.permission || '');
    if (mode === MODES.FULL && (permission === 'read' || permission === 'write')) {
      return Object.freeze({
        decision: 'allow',
        scope: 'session',
        reason: 'approval_mode_full',
      });
    }
    if (mode === MODES.ASSISTED && permission === 'read') {
      return Object.freeze({
        decision: 'allow',
        scope: 'session',
        reason: 'approval_mode_assisted_read',
      });
    }
    return null;
  }

  function createDecisionProvider(getMode, fallbackPrompt) {
    return async function approvalModeDecisionProvider(request) {
      const automatic = decide(request, typeof getMode === 'function' ? getMode() : getMode);
      if (automatic) return automatic;
      if (typeof fallbackPrompt === 'function') return fallbackPrompt(request);
      return { decision: 'deny', reason: 'prompt_unavailable' };
    };
  }

  return Object.freeze({
    MODES,
    LABELS,
    DESCRIPTIONS,
    normalizeMode,
    isForcedPromptTool,
    decide,
    createDecisionProvider,
  });
});
