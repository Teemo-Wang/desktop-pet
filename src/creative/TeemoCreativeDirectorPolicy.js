/** Deterministic P2-3 Challenge commands and validated runtime enums. */
(function (root, factory) {
  const policy = factory();
  if (root) root.TeemoCreativeDirectorPolicy = policy;
  if (typeof window !== 'undefined') window.TeemoCreativeDirectorPolicy = policy;
  if (typeof module === 'object' && module.exports) module.exports = policy;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MODES = new Set(['balanced', 'challenge']);
  const INTENSITIES = new Set(['light', 'standard', 'strong']);
  const SOURCES = new Set(['default', 'ui', 'explicit_command']);

  function textOf(value) {
    if (typeof value === 'string') return value.trim();
    if (!Array.isArray(value)) return '';
    return value.filter(item => item && item.type === 'text').map(item => String(item.text || '')).join('\n').trim();
  }

  function detectIntensity(text) {
    if (/(?:轻度|轻一点|温和一点)/i.test(text)) return 'light';
    if (/(?:强挑战|强一点|强烈|狠狠|深度挑战|严格挑)/i.test(text)) return 'strong';
    return 'standard';
  }

  function parseCommand(value) {
    const text = textOf(value);
    if (!text) return { type: 'none', intensity: null };
    if (/(?:关闭|退出)(?:设计总监|挑战)模式|恢复(?:常规判断|正常模式|常规模式)/i.test(text)) {
      return { type: 'session_exit', intensity: null };
    }
    if (/(?:这次|本轮).{0,8}(?:别|不要)挑战|(?:这次|本轮).{0,12}直接按要求(?:改|做)/i.test(text)) {
      return { type: 'one_shot_suppress', intensity: null };
    }
    if (/(?:不要|别)(?:开启|进入|切换到)(?:设计总监|挑战)模式/i.test(text)) {
      return { type: 'none', intensity: null };
    }
    if (/(?:开启|进入|切换到)(?:设计总监|挑战)模式|接下来.{0,8}(?:用|使用|保持)(?:设计总监|挑战)模式|接下来别顺着我/i.test(text)) {
      return { type: 'session_activate', intensity: detectIntensity(text) };
    }
    if (/挑战一下(?:这个|这版|该)?(?:设计|方案|方向)?|从反方向(?:看看|看一下)|别顺着我.{0,8}(?:挑|评)|(?:强一点|狠狠).{0,6}(?:挑|挑战)/i.test(text)) {
      return { type: 'one_shot_challenge', intensity: detectIntensity(text) };
    }
    return { type: 'none', intensity: null };
  }

  function validateState(value) {
    const errors = [];
    if (!value || value.schemaVersion !== 1) errors.push('schemaVersion must be 1');
    if (!value || !MODES.has(value.mode)) errors.push('invalid mode');
    if (!value || !INTENSITIES.has(value.intensity)) errors.push('invalid intensity');
    if (!value || !SOURCES.has(value.source)) errors.push('invalid source');
    return { ok: errors.length === 0, errors };
  }

  return { MODES, INTENSITIES, SOURCES, parseCommand, validateState };
});
