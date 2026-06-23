/**
 * AI Service - 统一模型接入层
 * 
 * 支持：OpenAI / DeepSeek / 通义千问 / Claude / 自定义
 * 统一接口：sendMessage(messages) → string
 * 预留流式：sendMessageStream(messages, onChunk) → void
 */

(function() {

  // 各平台默认配置
  const PROVIDER_PRESETS = {
    openai: {
      baseUrl: 'https://api.openai.com/v1',
      defaultModel: 'gpt-4o-mini',
    },
    deepseek: {
      baseUrl: 'https://api.deepseek.com/v1',
      defaultModel: 'deepseek-chat',
    },
    qwen: {
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      defaultModel: 'qwen-turbo',
    },
    claude: {
      baseUrl: 'https://api.anthropic.com/v1',
      defaultModel: 'claude-3-haiku-20240307',
    },
    custom: {
      baseUrl: '',
      defaultModel: '',
    }
  };

  // 错误类型
  const ERROR_TYPES = {
    NO_API_KEY: 'NO_API_KEY',
    NETWORK_ERROR: 'NETWORK_ERROR',
    AUTH_ERROR: 'AUTH_ERROR',
    RATE_LIMIT: 'RATE_LIMIT',
    MODEL_ERROR: 'MODEL_ERROR',
    TIMEOUT: 'TIMEOUT',
    UNKNOWN: 'UNKNOWN',
  };

  // 错误提示文案
  const ERROR_MESSAGES = {
    NO_API_KEY: '⚠️ 请先在设置中配置 API Key',
    NETWORK_ERROR: '⚠️ 网络连接失败，请检查网络',
    AUTH_ERROR: '⚠️ API Key 无效或已过期',
    RATE_LIMIT: '⚠️ 请求过于频繁，请稍后再试',
    MODEL_ERROR: '⚠️ 模型无响应，请检查模型名称',
    TIMEOUT: '⚠️ 请求超时，请稍后再试',
    UNKNOWN: '⚠️ 未知错误，请重试',
  };

  class AIService {
    constructor() {
      this.config = null;
      this.useMock = true; // 当前使用 mock，后续切换为 false
    }

    /**
     * 初始化配置
     * @param {object} modelSettings - 来自 SettingsStore 的 model 配置
     */
    configure(modelSettings) {
      this.config = { ...modelSettings };
      // 如果有 apiKey 则关闭 mock
      this.useMock = !this.config.apiKey;
    }

    /**
     * 获取供应商预设
     */
    getPreset(provider) {
      return PROVIDER_PRESETS[provider] || PROVIDER_PRESETS.custom;
    }

    /**
     * 发送消息（非流式）
     * @param {Array} messages - OpenAI 格式的消息数组
     * @returns {Promise<string>} AI 回复文本
     */
    async sendMessage(messages) {
      // 前置校验
      if (!this.config) {
        throw this._createError(ERROR_TYPES.UNKNOWN, '服务未初始化');
      }

      // Mock 模式
      if (this.useMock) {
        return this._mockResponse(messages);
      }

      // API Key 校验
      if (!this.config.apiKey) {
        throw this._createError(ERROR_TYPES.NO_API_KEY);
      }

      // 真实请求
      return this._requestCompletion(messages);
    }

    /**
     * 发送消息（流式）- 预留结构
     * @param {Array} messages - 消息数组
     * @param {Function} onChunk - 每收到一段文本的回调 (text: string) => void
     * @param {Function} onDone - 完成回调 () => void
     * @param {Function} onError - 错误回调 (error: Error) => void
     */
    async sendMessageStream(messages, onChunk, onDone, onError) {
      if (this.useMock) {
        // Mock 流式：逐字输出
        const reply = await this._mockResponse(messages);
        for (let i = 0; i < reply.length; i++) {
          await new Promise(r => setTimeout(r, 30));
          onChunk(reply[i]);
        }
        onDone();
        return;
      }

      if (!this.config.apiKey) {
        onError(this._createError(ERROR_TYPES.NO_API_KEY));
        return;
      }

      try {
        const response = await this._fetchStream(messages);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);
            if (data === '[DONE]') { onDone(); return; }
            try {
              const json = JSON.parse(data);
              const content = json.choices?.[0]?.delta?.content;
              if (content) onChunk(content);
            } catch (e) { /* 忽略解析错误 */ }
          }
        }
        onDone();
      } catch (err) {
        onError(this._classifyError(err));
      }
    }

    /**
     * 测试连接
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async testConnection() {
      if (!this.config.apiKey) {
        return { success: false, message: ERROR_MESSAGES.NO_API_KEY };
      }

      try {
        const res = await fetch(this.config.baseUrl + '/models', {
          headers: { 'Authorization': 'Bearer ' + this.config.apiKey },
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) return { success: true, message: '连接成功' };
        if (res.status === 401) return { success: false, message: 'API Key 无效' };
        return { success: false, message: `HTTP ${res.status}` };
      } catch (e) {
        return { success: false, message: '网络错误: ' + e.message };
      }
    }

    // ===== 内部方法 =====

    async _requestCompletion(messages) {
      try {
        const response = await fetch(this.config.baseUrl + '/chat/completions', {
          method: 'POST',
          headers: this._getHeaders(),
          body: JSON.stringify({
            model: this.config.modelName,
            messages: messages,
            max_tokens: 1000,
            temperature: 0.7,
          }),
          signal: AbortSignal.timeout(30000),
        });

        if (!response.ok) {
          throw await this._handleHttpError(response);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) throw this._createError(ERROR_TYPES.MODEL_ERROR);
        return content;

      } catch (err) {
        if (err.type && ERROR_MESSAGES[err.type]) throw err;
        throw this._classifyError(err);
      }
    }

    async _fetchStream(messages) {
      const response = await fetch(this.config.baseUrl + '/chat/completions', {
        method: 'POST',
        headers: this._getHeaders(),
        body: JSON.stringify({
          model: this.config.modelName,
          messages: messages,
          max_tokens: 1000,
          temperature: 0.7,
          stream: true,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) throw await this._handleHttpError(response);
      return response;
    }

    _getHeaders() {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + this.config.apiKey,
      };
      // Claude 使用不同的 header
      if (this.config.provider === 'claude') {
        headers['x-api-key'] = this.config.apiKey;
        headers['anthropic-version'] = '2023-06-01';
        delete headers['Authorization'];
      }
      return headers;
    }

    async _handleHttpError(response) {
      const status = response.status;
      if (status === 401 || status === 403) return this._createError(ERROR_TYPES.AUTH_ERROR);
      if (status === 429) return this._createError(ERROR_TYPES.RATE_LIMIT);
      if (status >= 500) return this._createError(ERROR_TYPES.MODEL_ERROR);
      return this._createError(ERROR_TYPES.UNKNOWN, `HTTP ${status}`);
    }

    _classifyError(err) {
      if (err.name === 'AbortError' || err.name === 'TimeoutError') {
        return this._createError(ERROR_TYPES.TIMEOUT);
      }
      if (err.message?.includes('fetch') || err.message?.includes('network')) {
        return this._createError(ERROR_TYPES.NETWORK_ERROR);
      }
      return this._createError(ERROR_TYPES.UNKNOWN, err.message);
    }

    _createError(type, detail) {
      const err = new Error(ERROR_MESSAGES[type] + (detail ? ` (${detail})` : ''));
      err.type = type;
      return err;
    }

    // ===== Mock 响应 =====

    async _mockResponse(messages) {
      await new Promise(r => setTimeout(r, 600 + Math.random() * 400));

      const lastMsg = messages[messages.length - 1]?.content || '';

      // 根据关键词返回不同 mock 回复
      if (lastMsg.includes('你好') || lastMsg.includes('hi')) {
        return '你好呀！我是哈啰小哈 🐾 有什么可以帮你的？';
      }
      if (lastMsg.includes('设计') || lastMsg.includes('规范')) {
        return '关于设计规范，你可以参考语雀上的《2026 Q2 设计规范更新》文档。需要我帮你打开吗？';
      }
      if (lastMsg.includes('切图') || lastMsg.includes('素材')) {
        return '切图相关的工具在项目的 docs/ 目录下，包括 bike-material-generator 和 lottie-image-replacer。需要我详细介绍哪个？';
      }
      if (lastMsg.includes('钉钉') || lastMsg.includes('消息')) {
        return '你有 2 条未读钉钉消息，要我帮你查看吗？可以右键点击我选择"钉钉消息"。';
      }

      // 通用回复
      const replies = [
        '收到！让我想想... 🤔 这个问题我可以帮你分析一下。',
        '好的，我来帮你处理这个问题。你能再详细描述一下吗？',
        '明白了！作为设计助手，我建议你可以从用户体验的角度来思考这个问题。',
        '这是个好问题！我查了一下相关资料，建议你参考一下最新的设计趋势。',
      ];
      return replies[Math.floor(Math.random() * replies.length)];
    }
  }

  window.AIService = AIService;
  window.AI_ERROR_TYPES = ERROR_TYPES;
  window.AI_PROVIDER_PRESETS = PROVIDER_PRESETS;

})();
