/**
 * 上下文构建器
 * 把不同来源的信息整理成 AI 可读的上下文格式
 * 后续可接入真实钉钉/语雀数据
 */

(function() {

  class ContextBuilder {
    constructor() {
      this.sources = {}; // 缓存的上下文数据
    }

    /**
     * 加载指定来源的上下文
     * @param {string} source - 来源类型: dingtalk / yuque / task / custom
     */
    async load(source) {
      switch (source) {
        case 'dingtalk':
          this.sources.dingtalk = await window.MockAPI.getDingtalkMessages();
          break;
        case 'yuque':
          this.sources.yuque = await window.MockAPI.getYuqueDocuments();
          break;
        case 'notifications':
          this.sources.notifications = await window.MockAPI.getNotifications();
          break;
      }
    }

    /**
     * 构建上下文文本（注入到 AI 消息中）
     * @param {string[]} sources - 需要注入的来源列表
     * @returns {string} 格式化的上下文文本
     */
    async build(sources) {
      const parts = [];

      for (const source of sources) {
        await this.load(source);
        parts.push(this._format(source));
      }

      return parts.filter(Boolean).join('\n\n');
    }

    /**
     * 格式化单个来源为文本
     */
    _format(source) {
      const data = this.sources[source];
      if (!data || data.length === 0) return '';

      switch (source) {
        case 'dingtalk':
          return this._formatDingtalk(data);
        case 'yuque':
          return this._formatYuque(data);
        case 'notifications':
          return this._formatNotifications(data);
        default:
          return '';
      }
    }

    _formatDingtalk(messages) {
      const lines = messages.map(m =>
        `- [${m.time}] ${m.sender}: ${m.content}${m.unread ? ' (未读)' : ''}`
      );
      return `【钉钉消息】\n${lines.join('\n')}`;
    }

    _formatYuque(docs) {
      const lines = docs.map(d =>
        `- 《${d.title}》 ${d.author} 更新于${d.updatedAt}`
      );
      return `【语雀文档】\n${lines.join('\n')}`;
    }

    _formatNotifications(notifs) {
      const lines = notifs.map(n =>
        `- [${n.type}] ${n.title}: ${n.content} (${n.time})`
      );
      return `【待办提醒】\n${lines.join('\n')}`;
    }

    /**
     * 构建带上下文的用户消息
     * @param {string} userPrompt - 用户原始输入
     * @param {string[]} contextSources - 需要注入的上下文来源
     * @returns {string} 带上下文的完整 prompt
     */
    async buildPromptWithContext(userPrompt, contextSources) {
      if (!contextSources || contextSources.length === 0) {
        return userPrompt;
      }

      const context = await this.build(contextSources);
      return `以下是相关的工作上下文信息：\n\n${context}\n\n---\n\n用户的问题/指令：${userPrompt}`;
    }
  }

  window.ContextBuilder = ContextBuilder;
})();
