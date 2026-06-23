/**
 * AI Service — 统一模型接入
 * 支持 OpenAI 兼容协议（OpenAI / DeepSeek / 通义 / 智谱 / Kimi / 自定义）
 * Claude 协议待后续单独适配
 */
(function() {
  class AIService {
    constructor() { this.config = null; this.useMock = true; }

    /** 配置/重新配置当前供应商。无 apiKey 时自动回退 mock 数据 */
    configure(cfg) { this.config = cfg; this.useMock = !cfg.apiKey; }

    /** 非流式发送 */
    async send(messages) {
      if (this.useMock) return this._mock(messages);
      if (!this.config.apiKey) throw new Error('⚠️ 请先配置 API Key');
      const res = await fetch(this.config.baseUrl + '/chat/completions', {
        method: 'POST',
        headers: this._buildHeaders(),
        body: JSON.stringify({ model: this.config.modelName, messages, max_tokens: 2048, temperature: 0.7 }),
        signal: AbortSignal.timeout(60000),
      });
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
      if (!this.config.apiKey) throw new Error('⚠️ 请先配置 API Key');

      const res = await fetch(this.config.baseUrl + '/chat/completions', {
        method: 'POST',
        headers: this._buildHeaders(),
        body: JSON.stringify({ model: this.config.modelName, messages, max_tokens: 2048, temperature: 0.7, stream: true }),
        signal: signal || AbortSignal.timeout(60000),
      });
      if (!res.ok) throw new Error(await this._formatHttpError(res));
      if (!res.body) throw new Error('⚠️ 不支持流式响应，请关闭流式开关');

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

    /** 测试连接：优先 /models 端点；不支持时降级用一次极简 chat 探活 */
    async test() {
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
        if (res.status === 404) return { ok: false, msg: '模型名/接入点不存在，请检查模型 ID' };
        if (res.status === 429) return { ok: false, msg: '请求过于频繁' };
        const detail = await this._formatHttpError(res);
        return { ok: false, msg: detail.replace(/^⚠️\s*/, '') };
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
     * 调用 images/generations 端点生成图片
     * 适用于 doubao-seedream / DALL-E 等纯生图模型
     * @param {object} options - { prompt, model?, size?, n?, imageUrl? }
     * @returns {Promise<{url?:string, b64?:string}>} 生成结果
     */
    async generateImage(options = {}) {
      if (!this.config?.apiKey) throw new Error('⚠️ 请先配置 API Key');

      // 优先用专门的生图模型配置
      const imgCfg = this.imageConfig || {};
      const model = options.model || imgCfg.modelName || this.config.imageModel || this.config.modelName;
      const body = {
        model,
        prompt: options.prompt || '哈啰骑行场景，品牌风格',
        n: options.n || 1,
        response_format: 'url',
      };

      // 火山方舟 seedream 要求 size 像素总数 ≥ 3686400（约 1920×1920）
      body.size = options.size || imgCfg.size || '2048x2048';

      // 如果有参考图（image-to-image 编辑），加入 image 字段
      if (options.imageUrl) {
        body.image = options.imageUrl;
      }

      const endpoint = this.config.baseUrl.replace(/\/+$/, '') + '/images/generations';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: this._buildHeaders(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000), // 生图可能较慢
      });

      if (!res.ok) {
        // 读取完整错误体，便于定位生图失败原因
        let detail = '';
        try {
          const errData = await res.json();
          detail = errData?.error?.message || errData?.message || JSON.stringify(errData);
        } catch (e) {
          detail = await res.text().catch(() => '');
        }
        console.error('[generateImage] 失败:', res.status, detail, '请求体:', JSON.stringify(body).slice(0, 300));
        throw new Error(`生图失败 (${res.status})：${detail}`);
      }

      const data = await res.json();
      // OpenAI 格式：data.data[0].url 或 data.data[0].b64_json
      const result = data.data?.[0] || {};
      return {
        url: result.url || null,
        b64: result.b64_json || null,
      };
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
      if (status >= 500) return '⚠️ 服务端错误 (' + status + ')';
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
