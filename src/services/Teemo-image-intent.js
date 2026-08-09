/**
 * Teemo 生图意图识别：AI 判断 vs 关键词触发
 */
(function() {
  const INTENT_SYSTEM = `你是 Teemo 助理的意图路由器。默认 want_image=false。

只有用户明确要求「立刻生成图片文件」时才 want_image=true。
明确出图：生图、画一张、生成一张图、出张图、文生图、生成图片、做张海报图。

以下一律 false（只回文字）：
- 写提示词 / prompt / 文案
- 描述画面、构图、反差、自拍场景，但没说要出图
- 按 K2/Anima/规则输出提示词
- 「随机生成」但目标是提示词
- 不确定时优先 false

只输出一行 JSON：
{"want_image":false,"prompt":""}`

  function parseIntentJson(raw) {
    const text = String(raw || '').trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const data = JSON.parse(match[0]);
      return {
        wantImage: !!(data.want_image ?? data.wantImage),
        prompt: String(data.prompt || data.image_prompt || '').trim(),
      };
    } catch (_) {
      return null;
    }
  }

  function readIntentMode() {
    try {
      if (!window.SettingsStore) return 'ai';
      const store = new window.SettingsStore();
      if (typeof store.reload === 'function') store.reload();
      return (store.get('imageIntent') || {}).mode || 'ai';
    } catch (_) {
      return 'ai';
    }
  }

  /** 关键词模式：只在用户明确提到出图时触发 */
  function looksLikeKeyword(text) {
    const value = String(text || '').trim();
    if (!value) return false;
    const explicit = /(生图|文生图|画图|画一?张|画个|出一?张图|出个图|生成一?张图|生成图片|做一?张图|做个图|来一?张图|text[\s-]*to[\s-]*image|txt2img)/i;
    if (explicit.test(value)) return true;
    const action = /(生成|画|做|出|来|设计).{0,8}(一|张|个|幅)?/i;
    const noun = /(图|图片|banner|海报|视觉|背景|插画|logo|封面|素材|壁纸|头图|头像|照片)/i;
    // 只要提示词时，关键词模式不触发生图
    if (/(提示词|prompt\b)/i.test(value) && !/(生图|画图|生成图片|一张图)/i.test(value)) return false;
    return action.test(value) && noun.test(value);
  }

  class TeemoImageIntentService {
    getMode() {
      return readIntentMode();
    }

    looksLikeKeyword(text) {
      return looksLikeKeyword(text);
    }

    /**
     * @param {import('./ai').AIService} ai
     * @param {string} text
     * @param {{mode?:string, signal?:AbortSignal, timeout?:number}} options
     * @returns {Promise<{wantImage:boolean,prompt:string,source:string}>}
     */
    async detect(ai, text, options = {}) {
      const value = String(text || '').trim();
      if (!value) return { wantImage: false, prompt: '', source: 'empty' };

      const mode = options.mode || readIntentMode();
      if (mode === 'keyword') {
        return {
          wantImage: looksLikeKeyword(value),
          prompt: value,
          source: 'keyword',
        };
      }

      // AI 模式也只对明确包含出图动作的请求做二次判断。
      // 普通聊天本来就会被下方的“明确出图”校验否决，无需额外等待一次 AI 请求。
      if (!looksLikeKeyword(value)) {
        return { wantImage: false, prompt: '', source: 'local-negative' };
      }

      // 明确出图时再让 AI 做二次确认并整理意图，避免相似词误触发。
      if (!ai || ai.useMock) {
        return { wantImage: false, prompt: '', source: 'mock' };
      }

      try {
        const result = await ai.send([
          { role: 'system', content: INTENT_SYSTEM },
          { role: 'user', content: value },
        ], {
          timeout: options.timeout || 20000,
          signal: options.signal,
        });
        const parsed = parseIntentJson(result);
        if (parsed) {
          if (parsed.wantImage && !looksLikeKeyword(value)) {
            return { wantImage: false, prompt: '', source: 'ai-need-explicit' };
          }
          return { ...parsed, source: 'ai' };
        }
      } catch (error) {
        console.warn('[TeemoImageIntent] AI 意图识别失败，按普通聊天处理:', error && error.message);
      }

      return { wantImage: false, prompt: '', source: 'fallback' };
    }
  }

  window.TeemoImageIntentService = TeemoImageIntentService;
  window.teemoImageIntent = new TeemoImageIntentService();
})();
