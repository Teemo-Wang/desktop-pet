/**
 * AI Service — 统一模型接入
 * 支持 OpenAI 兼容协议（OpenAI / DeepSeek / 通义 / 智谱 / Kimi / 自定义）
 * Claude 协议待后续单独适配
 */
(function() {
  /**
   * 读取图片真实宽高（渲染进程用 Image 加载，支持 http(s) URL 和 data URL）
   * @param {string} src
   * @returns {Promise<{w:number,h:number}|null>}
   */
  function _measureImageSize(src) {
    return new Promise((resolve) => {
      try {
        if (typeof Image === 'undefined' || !src) return resolve(null);
        const img = new Image();
        const timer = setTimeout(() => resolve(null), 8000);
        img.onload = () => { clearTimeout(timer); resolve({ w: img.naturalWidth, h: img.naturalHeight }); };
        img.onerror = () => { clearTimeout(timer); resolve(null); };
        img.src = src;
      } catch (e) { resolve(null); }
    });
  }

  /**
   * 将图片精确缩放到目标宽高（canvas 降采样）。
   * 远程 url 可能因跨域污染 canvas，故先经主进程下载成 dataURL（若可用）再画。
   * @returns {Promise<string|null>} 目标尺寸的 PNG dataURL
   */
  async function _resizeToExact(src, w, h) {
    if (!src || !w || !h) return null;
    let usable = src;
    // 远程图先转 dataURL，规避 canvas 跨域污染导致 toDataURL 抛错
    if (!/^data:/.test(src) && window.materialService && window.materialService.fetchImageAsDataUrl) {
      try { const d = await window.materialService.fetchImageAsDataUrl(src); if (d) usable = d; } catch (e) { /* 用原 src 兜底 */ }
    }
    return new Promise((resolve) => {
      try {
        if (typeof Image === 'undefined' || typeof document === 'undefined') return resolve(null);
        const img = new Image();
        const timer = setTimeout(() => resolve(null), 12000);
        img.onload = () => {
          clearTimeout(timer);
          try {
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            const ctx = c.getContext('2d');
            // 保持原图比例进行 contain 缩放：不足的区域保持透明，绝不压扁/拉宽完整模板成图。
            const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
            const dw = Math.round(img.naturalWidth * scale);
            const dh = Math.round(img.naturalHeight * scale);
            const dx = Math.round((w - dw) / 2);
            const dy = Math.round((h - dh) / 2);
            console.warn('[resizeImage] 原图=' + img.naturalWidth + 'x' + img.naturalHeight + ' 目标=' + w + 'x' + h + ' 绘制=' + dw + 'x' + dh);
            ctx.drawImage(img, dx, dy, dw, dh);
            resolve(c.toDataURL('image/png'));
          } catch (e) { resolve(null); }
        };
        img.onerror = () => { clearTimeout(timer); resolve(null); };
        img.src = usable;
      } catch (e) { resolve(null); }
    });
  }

  /**
   * 把原图宽高等比缩放到 seedream 的合规尺寸范围，保留原始比例。
   * seedream 约束：总像素需在 [3686400(约1920²), 16777216(约4096²)] 之间，单边不超过 4096。
   * @returns {string|null} "宽x高"
   */
  function _fitImageGenSize(w, h) {
    if (!w || !h) return null;
    const MIN = 3686400, MAX = 16777216, SIDE_MAX = 4096;
    let ww = w, hh = h;
    // 小于最小像素 → 等比放大（留 2% 余量，避免取整后又低于阈值）
    if (ww * hh < MIN) { const s = Math.sqrt((MIN * 1.02) / (ww * hh)); ww = Math.round(ww * s); hh = Math.round(hh * s); }
    // 大于最大像素 → 等比缩小
    if (ww * hh > MAX) { const s = Math.sqrt(MAX / (ww * hh)); ww = Math.round(ww * s); hh = Math.round(hh * s); }
    // 单边超上限 → 等比压到 4096 内
    if (ww > SIDE_MAX || hh > SIDE_MAX) { const s = SIDE_MAX / Math.max(ww, hh); ww = Math.round(ww * s); hh = Math.round(hh * s); }
    // 压缩后若又跌破最小像素（极端长条比例），再放大一次
    if (ww * hh < MIN) { const s = Math.sqrt((MIN * 1.02) / (ww * hh)); ww = Math.round(ww * s); hh = Math.round(hh * s); }
    return `${ww}x${hh}`;
  }

  class AIService {
    constructor() { this.config = null; this.useMock = true; }

    /**
     * 仅缩放完整成图到指定像素，不叠加元素、不裁切、不改变既有版式。
     * 用于将 DesignHub 的“原始尺寸”改图结果交付为资源位最终尺寸。
     */
    async resizeImageToExact(src, width, height) {
      return await _resizeToExact(src, width, height);
    }

    /** 配置/重新配置当前供应商。无 apiKey 时自动回退 mock 数据 */
    configure(cfg) {
      this.config = cfg;
      // 哈啰 AI 应用平台用 applicationGuid（复用"模型"字段），不需要 apiKey；
      // 因此真实模式的判断基于是否填了 applicationGuid，而非 apiKey
      if (cfg && cfg.baseUrl && /aibrain-ai-application/.test(cfg.baseUrl)) {
        this.useMock = !cfg.modelName;
      } else {
        this.useMock = !cfg.apiKey;
      }
    }

    /** 是否为哈啰 AI 应用平台（自定义 execute 协议，非 OpenAI 兼容） */
    _isAIBrain() {
      return !!(this.config && this.config.baseUrl && /aibrain-ai-application/.test(this.config.baseUrl));
    }

    /** 非流式发送（opts.timeout 可自定义超时毫秒，默认 40s；慢网关/长提示词场景可放宽） */
    async send(messages, opts = {}) {
      if (this.useMock) return this._mock(messages);
      if (this._isAIBrain()) return this._aibrainExecute(messages, null);
      if (!this.config.apiKey) throw new Error('⚠️ 请先配置 API Key');
      const timeoutMs = opts.timeout || 40000;
      // 仅对"连接被重置/GOAWAY"这类快速失败重试；超时不重试（超时说明网关慢，重试只会叠加等待）
      let res, lastErr;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          res = await fetch(this.config.baseUrl + '/chat/completions', {
            method: 'POST',
            headers: this._buildHeaders(),
            body: JSON.stringify({ model: this.config.modelName, messages, max_tokens: 2048, temperature: 0.7 }),
            signal: AbortSignal.timeout(timeoutMs),
          });
          break;
        } catch (e) {
          lastErr = e;
          const isTimeout = (e && (e.name === 'TimeoutError' || /timed?\s*out|abort/i.test(e.message || '')));
          console.warn('[ai.send] 第 ' + attempt + ' 次请求失败:', e && (e.message || e.name), isTimeout ? '(超时，不重试)' : '');
          if (isTimeout) break;   // 超时直接放弃，避免长时间"假死"
          await new Promise(r => setTimeout(r, 600));
        }
      }
      if (!res) throw (lastErr || new Error('网络请求失败'));
      if (!res.ok) throw new Error(await this._formatHttpError(res));
      const data = await res.json();
      const msg = data.choices?.[0]?.message || {};
      // 处理多模态响应（图片 + 文本混合）
      if (Array.isArray(msg.content)) {
        let result = '';
        for (const part of msg.content) {
          if (part.type === 'image_url' && part.image_url?.url) {
            result += `\n![生成图片](${part.image_url.url})\n`;
          } else if (part.type === 'text' && part.text) {
            result += part.text;
          }
        }
        return result || '⚠️ 模型无响应';
      }
      // 推理模型正文在 content，思考过程在 reasoning_content；正文为空时回退推理内容
      return msg.content || msg.reasoning_content || '⚠️ 模型无响应';
    }

    /**
     * 流式发送（SSE）
     * @param {Array} messages
     * @param {(chunk:string,full:string)=>void} onChunk
     * @param {AbortSignal} [signal]
     * @returns {Promise<string>} 完整文本
     */
    async stream(messages, onChunk, signal) {
      if (this.useMock) return this._mockStream(messages, onChunk, signal);
      // 哈啰 AI 应用平台：走自定义 execute 接口（非流式），结果一次性回调
      if (this._isAIBrain()) {
        const full = await this._aibrainExecute(messages, signal);
        if (onChunk) onChunk(full, full);
        return full;
      }
      if (!this.config.apiKey) throw new Error('⚠️ 请先配置 API Key');

      let res;
      try {
        res = await fetch(this.config.baseUrl + '/chat/completions', {
          method: 'POST',
          // 流式请求必须带 Accept: text/event-stream，否则部分网关（如幻视大模型）按非流式处理，导致"憋完整段才返回"
          headers: { ...this._buildHeaders(), 'Accept': 'text/event-stream' },
          body: JSON.stringify({ model: this.config.modelName, messages, max_tokens: 2048, temperature: 0.7, stream: true }),
          signal: signal || AbortSignal.timeout(60000),
        });
      } catch (e) {
        // 用户主动中止（点了停止）：不降级，直接向上抛
        if (signal && signal.aborted) throw e;
        // 网关在响应前就断连（如 HTTP/2 GOAWAY、连接重置、拒绝 SSE）：自动降级为非流式请求
        // 哈啰 AIBrain 大模型引擎网关不支持 SSE，会直接 GOAWAY 关闭连接，必须走此降级
        console.warn('[ai.stream] 流式请求失败，降级为非流式:', e && (e.message || e.name || e));
        return await this._streamFallback(messages, onChunk, signal);
      }
      // 部分企业网关不支持流式（SSE），会返回 405/400；此时自动降级为非流式请求
      if (!res.ok) {
        if (res.status === 405 || res.status === 400 || res.status === 501) {
          return await this._streamFallback(messages, onChunk, signal);
        }
        throw new Error(await this._formatHttpError(res));
      }
      // 响应体不可读（网关不返回流）时，同样降级为非流式
      if (!res.body) {
        return await this._streamFallback(messages, onChunk, signal);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buf = '';
      let full = '';            // 正文内容
      let reasoning = '';       // 推理内容（部分推理模型先输出 reasoning_content）
      let reasoningDone = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        // SSE 按 \n\n 分块
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const line of block.split('\n')) {
            const m = line.match(/^data:\s*(.*)$/);
            if (!m) continue;
            const payload = m[1].trim();
            if (!payload || payload === '[DONE]') continue;
            try {
              const json = JSON.parse(payload);
              const delta = json.choices?.[0]?.delta || {};
              const reasonChunk = delta.reasoning_content || '';
              const textChunk = delta.content || '';
              // 处理多模态响应（图片）：delta.content 可能是数组
              if (Array.isArray(delta.content)) {
                for (const part of delta.content) {
                  if (part.type === 'image_url' && part.image_url?.url) {
                    const imgMd = `\n![生成图片](${part.image_url.url})\n`;
                    full += imgMd;
                    if (onChunk) onChunk(imgMd, full);
                  } else if (part.type === 'text' && part.text) {
                    full += part.text;
                    if (onChunk) onChunk(part.text, full);
                  }
                }
              } else {
                // 推理阶段：累积推理过程，作为「思考中」实时展示（带灰字前缀）
                if (reasonChunk) {
                  reasoning += reasonChunk;
                  if (onChunk) onChunk('', '💭 思考中…\n' + reasoning);
                }
              // 正文阶段：推理结束后输出真正回答
              if (textChunk) {
                if (!reasoningDone) { reasoningDone = true; full = ''; } // 切到正文时清掉思考占位
                full += textChunk;
                if (onChunk) onChunk(textChunk, full);
              }
              } // end else (non-array content)
            } catch (e) { /* 忽略解析错误的行 */ }
          }
        }
      }
      // 若模型只产出推理、无正文（如 max_tokens 太小被截断），回退展示推理内容
      if (!full && reasoning) return reasoning;
      return full || '⚠️ 模型无响应';
    }

    /**
     * 流式降级：网关不支持 SSE 时，改用非流式请求，一次性把完整回复通过 onChunk 输出
     * @param {Array} messages
     * @param {(chunk:string,full:string)=>void} onChunk
     * @param {AbortSignal} [signal]
     * @returns {Promise<string>} 完整文本
     */
    async _streamFallback(messages, onChunk, signal) {
      const res = await fetch(this.config.baseUrl + '/chat/completions', {
        method: 'POST',
        headers: this._buildHeaders(),
        body: JSON.stringify({ model: this.config.modelName, messages, max_tokens: 2048, temperature: 0.7 }),
        signal: signal || AbortSignal.timeout(60000),
      });
      if (!res.ok) throw new Error(await this._formatHttpError(res));
      const data = await res.json();
      const msg = data.choices?.[0]?.message || {};
      let full = '';
      if (Array.isArray(msg.content)) {
        // 多模态：图片 + 文本混合
        for (const part of msg.content) {
          if (part.type === 'image_url' && part.image_url?.url) full += `\n![生成图片](${part.image_url.url})\n`;
          else if (part.type === 'text' && part.text) full += part.text;
        }
      } else {
        // 推理模型正文在 content，思考过程在 reasoning_content
        full = msg.content || msg.reasoning_content || '';
      }
      full = full || '⚠️ 模型无响应';
      // 一次性把完整结果交给上层渲染（模拟流式回调的最终态）
      if (onChunk) onChunk(full, full);
      return full;
    }

    /**
     * 哈啰 AI 应用平台执行接口（自定义协议，非 OpenAI 兼容）
     * POST {base_url}/AIBrainAIApplication/api/v1/run/execute
     * body: { applicationGuid, prompt, imageList?, stream, userInfo? }
     * @param {Array} messages - 标准 messages，会抽取最后一条 user 作为 prompt
     * @param {AbortSignal} [signal]
     * @returns {Promise<string>} 应用输出文本
     */
    async _aibrainExecute(messages, signal) {
      const { prompt, images } = this._extractPrompt(messages);
      const base = this.config.baseUrl.replace(/\/+$/, '');
      const url = base + '/AIBrainAIApplication/api/v1/run/execute';
      const body = {
        applicationGuid: this.config.modelName,   // 复用"模型"字段填 applicationGuid（应用ID）
        prompt: prompt || '',
        stream: false,
      };
      // AIBrain 的 imageList 要求是 http(s) 图片 URL，不支持 base64 data URL
      const urlImages = (images || []).filter(u => /^https?:\/\//.test(u));
      if (urlImages.length) body.imageList = urlImages;
      // 若配置了用户邮箱（知识库授权场景需要），带上 userInfo
      if (this.config.userEmail) body.userInfo = { email: this.config.userEmail };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(body),
        signal: signal || AbortSignal.timeout(120000),
      });
      if (!res.ok) throw new Error(await this._formatHttpError(res));
      const json = await res.json();
      const code = json.code;
      // 成功码兼容 0 / 200（字符串或数字）
      if (code !== 0 && code !== 200 && code !== '0' && code !== '200') {
        throw new Error('⚠️ ' + (json.msg || json.errorMsg || ('应用返回错误 code=' + code)));
      }
      return this._aibrainAnswer(json);
    }

    /** 从标准 messages 抽取最后一条 user 消息作为 prompt（兼容多模态） */
    _extractPrompt(messages) {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role !== 'user') continue;
        const c = messages[i].content;
        if (typeof c === 'string') return { prompt: c, images: [] };
        if (Array.isArray(c)) {
          let text = ''; const images = [];
          for (const part of c) {
            if (part.type === 'text') text += (part.text || '');
            else if (part.type === 'image_url' && part.image_url?.url) images.push(part.image_url.url);
          }
          return { prompt: text, images };
        }
      }
      return { prompt: '', images: [] };
    }

    /** 解析 AIBrain 返回，取出真正的答案文本（response 可能是嵌套 JSON 字符串） */
    _aibrainAnswer(json) {
      let ans = json.response;
      if (typeof ans === 'string') {
        const t = ans.trim();
        if (t.startsWith('{')) {
          try {
            const inner = JSON.parse(t);
            if (inner && typeof inner.response === 'string') ans = inner.response;
          } catch (e) { /* 非嵌套 JSON，保持原样 */ }
        }
      }
      return (ans && String(ans).trim()) || json.reasoningContent || '⚠️ 应用无响应';
    }

    /** 测试连接：优先 /models 端点；不支持时降级用一次极简 chat 探活 */
    async test() {
      // 哈啰 AI 应用平台：用一次极简 execute 探活
      if (this._isAIBrain()) {
        if (!this.config.modelName) return { ok: false, msg: '请在「模型」框填应用ID(applicationGuid)' };
        try {
          const r = await this._aibrainExecute([{ role: 'user', content: '你好' }], AbortSignal.timeout(30000));
          return r ? { ok: true, msg: '连接成功' } : { ok: false, msg: '应用无响应' };
        } catch (e) {
          return { ok: false, msg: String(e.message || e).replace(/^⚠️\s*/, '') };
        }
      }
      if (!this.config?.apiKey) return { ok: false, msg: '未配置 Key' };
      try {
        // 超时放宽到 15s，国内代理首包慢
        const r = await fetch(this.config.baseUrl + '/models', {
          headers: this._buildHeaders(),
          signal: AbortSignal.timeout(15000)
        });
        if (r.ok) return { ok: true, msg: '连接成功' };
        if (r.status === 401) return { ok: false, msg: 'API Key 无效或权限不足' };
        if (r.status === 403) return { ok: false, msg: '该 Key 无访问权限' };
        if (r.status === 429) return { ok: false, msg: '请求过于频繁' };
        // 部分供应商（如火山方舟）不提供 /models 端点，降级用 chat 探活
        if (r.status === 404 || r.status === 405) return this._testByChat();
        return { ok: false, msg: 'HTTP ' + r.status };
      } catch (e) {
        // 把常见英文错误翻译成可读提示
        const m = String(e.message || e.name || '');
        if (m.includes('timed out') || m.includes('TimeoutError')) {
          return { ok: false, msg: '连接超时，请检查网络/代理是否能访问该地址' };
        }
        if (m.includes('Failed to fetch') || m.includes('NetworkError') || m.includes('ENOTFOUND')) {
          return { ok: false, msg: '网络无法到达，请确认代理已开启或换用国内供应商' };
        }
        return { ok: false, msg: m };
      }
    }

    /** 用一次最小 chat 请求探活（供不支持 /models 的供应商使用，如火山方舟） */
    async _testByChat() {
      try {
        const res = await fetch(this.config.baseUrl + '/chat/completions', {
          method: 'POST',
          headers: this._buildHeaders(),
          body: JSON.stringify({
            model: this.config.modelName,
            messages: [{ role: 'user', content: 'hi' }],
            max_tokens: 1,
          }),
          signal: AbortSignal.timeout(15000),
        });
        if (res.ok) return { ok: true, msg: '连接成功' };
        if (res.status === 401 || res.status === 403) return { ok: false, msg: 'API Key 无效或权限不足' };
        if (res.status === 429) return { ok: false, msg: '请求过于频繁' };
        // 其余错误（含 404）直接暴露网关返回原文，便于排查真实原因（路径错 vs 模型错）
        let raw = '';
        try { raw = await res.text(); } catch (e) { /* ignore */ }
        return { ok: false, msg: `HTTP ${res.status}：${(raw || '无响应体').slice(0, 200)}` };
      } catch (e) {
        return { ok: false, msg: String(e.message || e.name || '探活失败') };
      }
    }

    /** 构造请求头（OpenAI 协议） */
    _buildHeaders() {
      return {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + this.config.apiKey,
      };
    }

    /**
     * 统一生图入口：根据模型 family、是否有参考图、以及网关类型自动路由。
     *
     * 路由规则：
     *   - GPT-Image 系列 + 有图 + OpenAI 官方网关 → /images/edits（multipart/form-data）
     *   - GPT-Image 系列 + 有图 + 哈啰/非官方网关 → /images/generations（JSON，image 字段传 base64）
     *   - GPT-Image 系列 + 无图                   → /images/generations（JSON）
     *   - Seedream 等其他模型                      → /images/generations（JSON），参考图通过 body.image 传递
     *
     * 哈啰内部生图网关（aibrain-large-model-engine-common.hellobike.cn）只有 /images/generations，
     * 没有 /images/edits 端点；所以只有 api.openai.com 才走 multipart edits。
     *
     * @param {object} options
     *   - prompt {string}           生图或改图描述
     *   - model {string}            覆盖模型名
     *   - size {string}             目标尺寸，如 '1024x1024'；空/0 表示自适应
     *   - n {number}                生成数量
     *   - imageUrl {string|null}    参考图（data URL 或 https URL）；有值即触发改图路径
     *   - imageUrls {string[]}      多张参考图（GPT-Image edits 支持多图）
     * @returns {Promise<{url?:string, b64?:string}>}
     */
    async generateImage(options = {}) {
      const imgCfg = this.imageConfig || {};
      const imgApiKey = imgCfg.apiKey || this.config?.apiKey;
      const imgBaseUrl = imgCfg.baseUrl || this.config?.baseUrl;
      if (!imgApiKey) throw new Error('⚠️ 请先配置 API Key');
      if (!imgBaseUrl) throw new Error('⚠️ 请先配置生图地址');
      const model = options.model || imgCfg.modelName || this.config.imageModel || this.config.modelName;

      // 汇总所有参考图（支持单图/多图两种入参形式）
      const inputImages = [];
      if (options.imageUrls && Array.isArray(options.imageUrls)) inputImages.push(...options.imageUrls.filter(Boolean));
      if (options.imageUrl && !inputImages.includes(options.imageUrl)) inputImages.push(options.imageUrl);

      const isGptImage = /gpt-?image/i.test(String(model));
      const hasImages = inputImages.length > 0;
      // 改图路径判断：
      //   - 官方 OpenAI (api.openai.com)：走 /images/edits，JSON body，images 数组传参考图
      //   - 哈啰及其他网关：走 /images/generations，JSON body，images 数组传参考图（路径不同，格式一样）
      const isOfficialOpenAI = /api\.openai\.com/i.test(String(imgBaseUrl));
      const useEditsEndpoint = isGptImage && hasImages && isOfficialOpenAI;
      // 哈啰网关图像编辑也走 /images/generations，通过 images 数组传参考图（非 multipart）
      const useGenerationsWithImages = isGptImage && hasImages && !isOfficialOpenAI;

      console.warn('[generateImage] 模型=' + model
        + ' isGptImage=' + isGptImage
        + ' isOfficialOpenAI=' + isOfficialOpenAI
        + ' 输入图片数=' + inputImages.length
        + ' 接口=' + (useEditsEndpoint ? 'images/edits(官方)' : hasImages && isGptImage ? 'images/generations(含images数组)' : 'images/generations'));


      // 尺寸处理
      const cfgSize = String(options.size || imgCfg.size || '').trim();
      const isAdaptive = !cfgSize || cfgSize === '0' || cfgSize === '0x0' || cfgSize.toLowerCase() === 'adaptive';
      let exactW = 0, exactH = 0;
      const _em = cfgSize.match(/^(\d+)\s*[x×*]\s*(\d+)$/i);
      if (!isAdaptive && _em) { exactW = parseInt(_em[1], 10); exactH = parseInt(_em[2], 10); }

      let url = null, b64 = null;

      if (useEditsEndpoint) {
        // ── GPT-Image 改图（OpenAI 官方）：/images/edits JSON body ──
        const editsUrl = imgBaseUrl.replace(/\/+$/, '') + '/images/edits';
        const GPT_EDIT_SIZES = ['1024x1024', '1024x1536', '1536x1024', 'auto'];
        const editSize = (!isAdaptive && GPT_EDIT_SIZES.includes(cfgSize)) ? cfgSize : '1024x1024';
        const editsBody = {
          model,
          prompt: options.prompt || '',
          n: options.n || 1,
          size: editSize,
          images: inputImages.map(u => ({ image_url: u })),
        };
        console.warn('[generateImage] → images/edits JSON images[]=' + inputImages.length + ' size=' + editSize);
        const res = await fetch(editsUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + imgApiKey },
          body: JSON.stringify(editsBody),
          signal: AbortSignal.timeout(180000),
        });
        if (!res.ok) {
          let detail = '';
          try { const e = await res.json(); detail = e?.error?.message || e?.message || JSON.stringify(e); }
          catch (_) { detail = await res.text().catch(() => ''); }
          console.error('[generateImage] images/edits 失败:', res.status, detail);
          throw new Error(`改图失败 (${res.status})：${detail}`);
        }
        const data = await res.json();
        console.warn('[generateImage] images/edits 返回 status=' + res.status + ' items=' + (data.data?.length || 0));
        const r0 = data.data?.[0] || {};
        url = r0.url || (r0.b64_json ? `data:image/png;base64,${r0.b64_json}` : null);
        b64 = r0.b64_json || null;

      } else {
        // ── 文生图 / 非官方网关改图：/images/generations JSON ──
        const body = { model, prompt: options.prompt || '哈啰骑行场景，品牌风格', n: options.n || 1 };
        if (isGptImage) {
          const GPT_SIZES = ['1024x1024', '1024x1536', '1536x1024', 'auto'];
          body.size = (!isAdaptive && GPT_SIZES.includes(cfgSize)) ? cfgSize : 'auto';
          // 哈啰网关改图：使用 imageList 字段（数组，仅支持 http(s) URL，不支持 base64）
          if (useGenerationsWithImages) {
            const httpImages = inputImages.filter(u => /^https?:\/\//i.test(u));
            if (httpImages.length) {
              body.imageList = httpImages;
              console.warn('[generateImage] GPT-Image 哈啰网关改图，imageList URL数=' + httpImages.length + '，base64跳过=' + (inputImages.length - httpImages.length));
            } else {
              console.warn('[generateImage] GPT-Image 哈啰网关：所有参考图均为 base64，无法通过 imageList 传递，退回文生图');
            }
          }
        } else {
          // Seedream 等：image 字段传第一张参考图
          if (hasImages) body.image = inputImages[0];
          if (!isAdaptive) {
            const m = cfgSize.match(/^(\d+)\s*[x×*]\s*(\d+)$/i);
            body.size = m ? (_fitImageGenSize(parseInt(m[1], 10), parseInt(m[2], 10)) || cfgSize) : cfgSize;
          } else if (hasImages) {
            try { const dim = await _measureImageSize(inputImages[0]); const fitted = dim && _fitImageGenSize(dim.w, dim.h); if (fitted) body.size = fitted; }
            catch (e) { /* 量不到用模型默认 */ }
          }
        }
        const endpoint = imgBaseUrl.replace(/\/+$/, '') + '/images/generations';
        // 有参考图（改图）耗时更长，放宽到 300s；纯文生图通常 30-60s，保持 120s 避免假等待
        const genTimeout = (body.imageList || body.image) ? 300000 : 120000;
        console.warn('[generateImage] → images/generations model=' + model
          + ' size=' + (body.size || 'auto')
          + ' imageList=' + (body.imageList ? body.imageList.length : (body.image ? 1 : 0))
          + ' timeout=' + (genTimeout / 1000) + 's');
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + imgApiKey },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(genTimeout),
        });
        if (!res.ok) {
          let detail = '';
          try { const e = await res.json(); detail = e?.error?.message || e?.message || JSON.stringify(e); }
          catch (_) { detail = await res.text().catch(() => ''); }
          console.error('[generateImage] images/generations 失败:', res.status, detail, '请求体:', JSON.stringify(body).slice(0, 400));
          throw new Error(`生图失败 (${res.status})：${detail}`);
        }
        const data = await res.json();
        console.warn('[generateImage] images/generations 返回 status=' + res.status + ' items=' + (data.data?.length || 0));
        const r0 = data.data?.[0] || {};
        url = r0.url || (r0.b64_json ? `data:image/png;base64,${r0.b64_json}` : null);
        b64 = r0.b64_json || null;
      }

      // 精确尺寸等比缩放（仅 Seedream 非标准尺寸时需要）
      if (url && exactW && exactH && !isGptImage) {
        try { const resized = await _resizeToExact(url, exactW, exactH); if (resized) url = resized; }
        catch (e) { console.warn('[generateImage] 精确缩放失败，返回原图:', e && e.message); }
      }
      return { url, b64 };
    }

    /**
     * 把 HTTP 错误响应转成可读的中文提示
     * 重点处理 OpenAI 的 429（额度耗尽 vs 速率限制）
     */
    async _formatHttpError(res) {
      const status = res.status;
      let detail = '';
      try {
        const data = await res.json();
        detail = data?.error?.message || data?.message || '';
        const code = data?.error?.code || '';
        // OpenAI 余额耗尽场景
        if (status === 429 && (code === 'insufficient_quota' || /quota|insufficient/i.test(detail))) {
          return '⚠️ API 余额不足，请到平台充值（注意：ChatGPT Plus 与 API 余额不互通）';
        }
        if (status === 429) return '⚠️ 请求过于频繁或速率超限：' + (detail || '请稍后重试');
      } catch (e) { /* 响应不是 JSON，忽略 */ }
      if (status === 401 || status === 403) return '⚠️ 鉴权失败 (' + status + ')：' + (detail || 'API Key 无效');
      if (status >= 500) return '⚠️ 服务端错误 (' + status + ')' + (detail ? '：' + detail : '（网关未返回详情，多为模型名不对或该模型服务异常）');
      return '⚠️ 请求失败 (' + status + ')' + (detail ? '：' + detail : '');
    }

    async _mock(messages) {
      await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
      const last = messages[messages.length - 1]?.content || '';

      // 多模态消息（带图片）：检测 content 是否是数组格式
      const lastMsg = messages[messages.length - 1];
      const isVision = Array.isArray(lastMsg?.content);
      if (isVision) {
        // 提取文本部分
        const textParts = lastMsg.content.filter(c => c.type === 'text').map(c => c.text).join(' ');
        const hasImage = lastMsg.content.some(c => c.type === 'image_url');
        if (hasImage) {
          // 模拟图片理解回复
          if (textParts.includes('改') || textParts.includes('修改') || textParts.includes('换')) {
            return `收到你的图片和修改要求。\n\n📋 **修改需求理解：**\n- ${textParts}\n\n⚠️ **当前为 Demo 模式**，图片编辑功能需要对接真实的图像生成 API（如 GPT-4o Image Edit / DALL-E 3）。\n\n💡 **接入真实 API 后的流程：**\n1. 上传原图 → AI 理解图片内容\n2. 输入修改指令 → 调用图像编辑 API\n3. 返回修改后的新图片\n\n你可以在「API 接入」面板中配置支持图片编辑的模型来启用此功能。`;
          }
          return `收到你上传的图片，我已识别其内容。\n\n🎨 **图片分析：**\n- 类型：设计稿/素材图\n- 可以为你做：需求分析、元素提取、配色分析、改图建议\n\n请告诉我需要对这张图做什么？比如：\n- 「修改价格文字为 9/60」\n- 「换一个更活力的配色方案」\n- 「基于这张图生成不同尺寸适配」`;
        }
      }

      // 待办提取场景：返回结构化 JSON，便于上层解析入库
      if (last.includes('JSON 数组') || last.includes('JSON数组') || last.includes('待办提取助手') || last.includes('提取出') || last.includes('事项')) {
        const today = new Date();
        const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(18, 0, 0, 0);
        const dayAfter = new Date(today); dayAfter.setDate(dayAfter.getDate() + 2); dayAfter.setHours(15, 0, 0, 0);
        return JSON.stringify([
          { title: '查看更新后的需求文档', priority: 'high', deadline: fmt(tomorrow) },
          { title: '配合接口联调验收', priority: 'medium', deadline: fmt(dayAfter) },
          { title: '准备周四设计评审材料', priority: 'medium', deadline: null }
        ]);
      }
      if (last.includes('需求摘要') || last.includes('需求分析')) {
        return `## 📋 需求摘要\n新车上线需要全套曝光资源位素材更新\n\n## 🎯 关键目标\n- 提升新车型首周曝光量 30%\n- 统一视觉风格，强化品牌认知\n\n## 📱 涉及页面/活动\n- App 首页 Banner\n- 骑行页场景卡\n- Tab 图标更新\n\n## 🎨 设计交付内容\n- Banner 750×360px @2x\n- 场景卡 340×200px @2x\n- Tab 图标 96×96px\n- Lottie 入场动效\n\n## ❓ 需要确认的问题\n- 新车三视图素材是否已提供？\n- 是否需要适配深色模式？\n- 上线时间是否确定？\n\n## ✅ 下一步待办\n1. 确认车型渲染图（今天）\n2. 出 Banner 初稿（明天）\n3. 批量生成全套素材（后天）\n4. 交付开发配置（本周五）`;
      }
      if (last.includes('总结')) return '📝 消息重点：\n1. 需求文档已更新，需要查看评审意见\n2. 接口联调完成，可以开始验收\n3. 本周设计评审改到周四下午';
      const replies = ['收到，让我帮你分析一下 🤔', '好的，我来整理一下相关信息。', '明白了，作为设计助手我建议从用户体验角度思考这个问题。'];
      return replies[Math.floor(Math.random() * replies.length)];
    }

    /** Mock 流式：把完整文本切片输出 */
    async _mockStream(messages, onChunk, signal) {
      const full = await this._mock(messages);
      let acc = '';
      // 中文按字、英文按单词切，节奏更自然
      const tokens = full.match(/(\s+|\w+|[\u4e00-\u9fa5]|[^\s\w])/g) || [full];
      for (const tok of tokens) {
        if (signal && signal.aborted) break;
        acc += tok;
        if (onChunk) onChunk(tok, acc);
        await new Promise(r => setTimeout(r, 20 + Math.random() * 30));
      }
      return acc;
    }
  }
  window.AIService = AIService;
})();
