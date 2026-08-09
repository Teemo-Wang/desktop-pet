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

  function emptyCommand(text) {
    return {
      type: 'none',
      intensity: null,
      controlSpan: null,
      consumedText: '',
      remainingUserContent: text,
    };
  }

  function isQuoted(text, start, end) {
    const pairs = [['“', '”'], ['‘', '’'], ['「', '」'], ['『', '』'], ['"', '"'], ["'", "'"]];
    return pairs.some(([open, close]) => {
      const left = text.lastIndexOf(open, start);
      if (left < 0) return false;
      const right = text.indexOf(close, Math.max(end, left + 1));
      return right >= end;
    });
  }

  function isMetaLanguageUse(text, match) {
    if (isQuoted(text, match.index, match.index + match[0].length)) return true;
    const before = text.slice(0, match.index);
    const after = text.slice(match.index + match[0].length);
    if (/(?:把|将)\s*$/i.test(before) && /^\s*(?:翻译|译成|改写)/i.test(after)) return true;
    if (/(?:翻译|解释|分析|说明|讨论)\s*$/i.test(before) && /^\s*(?:这句话|这段话|的意思|的含义)?/i.test(after)) return true;
    if (/(?:文档|文章|提示词).{0,12}(?:写|加入|包含)(?:一句)?\s*$/i.test(before)) return true;
    return false;
  }

  function remainingContent(text, start, end) {
    const before = text.slice(0, start).replace(/[\s，,。；;：:！!？?]+$/, '');
    const after = text.slice(end)
      .replace(/^[\s，,。；;：:！!？?]+/, '')
      .replace(/^(?:另外|同时|还有|并且|然后)\s*[，,:：]?\s*/i, '');
    return [before, after].filter(Boolean).join(' ').trim();
  }

  function matchedCommand(text, type, match) {
    const start = match.index;
    const end = start + match[0].length;
    return {
      type,
      intensity: type === 'session_activate' || type === 'one_shot_challenge'
        ? detectIntensity(match[0])
        : null,
      controlSpan: { start, end },
      consumedText: match[0],
      remainingUserContent: remainingContent(text, start, end),
    };
  }

  function parseCommand(value) {
    const text = textOf(value);
    if (!text) return emptyCommand('');
    const exit = text.match(/(?:关闭|退出)(?:设计总监|挑战)模式|恢复(?:常规判断|正常模式|常规模式)/i);
    if (exit && !isMetaLanguageUse(text, exit)) return matchedCommand(text, 'session_exit', exit);
    const suppress = text.match(/(?:这次|本轮).{0,8}(?:别|不要)挑战|(?:这次|本轮).{0,12}直接按要求(?:改|做)/i);
    if (suppress && !isMetaLanguageUse(text, suppress)) return matchedCommand(text, 'one_shot_suppress', suppress);
    if (/(?:不要|别)(?:开启|进入|切换到)(?:设计总监|挑战)模式/i.test(text)) {
      return emptyCommand(text);
    }
    const activate = text.match(/(?:开启|进入|切换到)\s*(?:(?:轻度|标准|强(?:烈)?|深度)\s*)?(?:设计总监|挑战)模式|接下来.{0,8}(?:用|使用|保持)\s*(?:(?:轻度|标准|强(?:烈)?|深度)\s*)?(?:设计总监|挑战)模式|接下来别顺着我/i);
    if (activate && !isMetaLanguageUse(text, activate)) return matchedCommand(text, 'session_activate', activate);
    const oneShot = text.match(/挑战一下(?:这个|这版|该)?(?:设计|方案|方向)?|从反方向(?:看看|看一下)|别顺着我.{0,8}(?:挑|评)|(?:强一点|狠狠).{0,6}(?:挑|挑战)/i);
    if (oneShot && !isMetaLanguageUse(text, oneShot)) return matchedCommand(text, 'one_shot_challenge', oneShot);
    return emptyCommand(text);
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
