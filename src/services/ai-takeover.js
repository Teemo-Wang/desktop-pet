/**
 * AI 接管服务
 * 自动读取钉钉消息并用 AI 生成回复
 * 支持全局接管和单会话接管
 */
(function() {

  class AITakeoverService {
    constructor() {
      this.globalEnabled = false;        // 全局接管开关
      this.takeoverChats = new Set();    // 被接管的单独会话 ID
      this.pollTimer = null;
      this.onAutoReply = null;           // 回调: (convId, reply) => void
      this.onStatusChange = null;        // 回调: (enabled) => void
    }

    // 开启全局接管
    enableGlobal() {
      this.globalEnabled = true;
      this._startPolling();
      if (this.onStatusChange) this.onStatusChange(true);
    }

    // 关闭全局接管
    disableGlobal() {
      this.globalEnabled = false;
      this._stopPolling();
      if (this.onStatusChange) this.onStatusChange(false);
    }

    toggleGlobal() {
      if (this.globalEnabled) this.disableGlobal();
      else this.enableGlobal();
    }

    // 单会话接管
    enableChat(convId) {
      this.takeoverChats.add(convId);
      if (!this.pollTimer) this._startPolling();
    }

    disableChat(convId) {
      this.takeoverChats.delete(convId);
      if (!this.globalEnabled && this.takeoverChats.size === 0) this._stopPolling();
    }

    toggleChat(convId) {
      if (this.takeoverChats.has(convId)) this.disableChat(convId);
      else this.enableChat(convId);
    }

    isChatEnabled(convId) {
      return this.globalEnabled || this.takeoverChats.has(convId);
    }

    // 模拟轮询检查新消息并自动回复
    _startPolling() {
      if (this.pollTimer) return;
      this.pollTimer = setInterval(() => this._checkAndReply(), 10000); // 10秒检查一次
    }

    _stopPolling() {
      if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    }

    async _checkAndReply() {
      // Mock: 模拟检测到新消息并生成回复
      // 真实场景中这里会调用钉钉 API 获取新消息
      // 然后调用 AI 生成回复，再通过钉钉 API 发送
      console.log('[AI接管] 检查新消息...');
    }

    /**
     * 为指定消息生成 AI 回复（预览）
     * @param {object} conv - 会话对象
     * @returns {string} AI 生成的回复建议
     */
    async generateReply(conv) {
      const lastMsg = conv.messages[conv.messages.length - 1];
      const prompt = `你是用户的AI助手，正在帮用户回复钉钉消息。请根据以下对话上下文，生成一条简洁专业的回复：

【会话】${conv.name}
【最新消息】${lastMsg.sender}: ${lastMsg.content}
【历史消息】
${conv.messages.map(m => `${m.sender}: ${m.content}`).join('\n')}

请直接输出回复内容，不要加引号或前缀：`;

      return await window.aiService.send([
        { role: 'system', content: '你是一位哈啰出行设计团队的成员，回复风格简洁专业友好。' },
        { role: 'user', content: prompt }
      ]);
    }
  }

  window.AITakeoverService = AITakeoverService;
})();
