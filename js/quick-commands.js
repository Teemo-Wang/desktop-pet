/**
 * 快捷指令模块
 * 定义预设 prompt 模板，支持上下文注入
 */

(function() {

  // 快捷指令定义
  const COMMANDS = [
    {
      id: 'summarize-dingtalk',
      icon: '💬',
      label: '总结钉钉消息',
      prompt: '请帮我总结以下钉钉消息的重点，按优先级排列，标注需要我回复或处理的事项。',
      contextSources: ['dingtalk'],
    },
    {
      id: 'summarize-yuque',
      icon: '📄',
      label: '总结语雀文档',
      prompt: '请帮我总结以下语雀文档的更新要点，哪些和我的工作相关需要关注。',
      contextSources: ['yuque'],
    },
    {
      id: 'design-review',
      icon: '🎨',
      label: '生成设计复盘',
      prompt: '请帮我生成一份设计复盘模板，包含：项目背景、设计目标、方案亮点、数据表现、改进方向。请用简洁的结构化格式输出。',
      contextSources: [],
    },
    {
      id: 'marketing-copy',
      icon: '✍️',
      label: '营销活动文案',
      prompt: '请帮我生成一组哈啰出行的营销活动文案，要求：活泼有趣、突出骑行场景、适合年轻用户、包含主标题+副标题+行动按钮文案。',
      contextSources: [],
    },
    {
      id: 'extract-requirements',
      icon: '📋',
      label: '提炼需求重点',
      prompt: '请帮我从以下信息中提炼需求重点，输出：核心目标、关键功能点、设计约束、优先级建议。',
      contextSources: ['dingtalk', 'notifications'],
    },
    {
      id: 'to-todos',
      icon: '✅',
      label: '转为待办事项',
      prompt: '请把以下信息转化为清晰的待办事项列表，按优先级排序，每项包含：任务描述、截止时间（如有）、关联人。',
      contextSources: ['dingtalk', 'notifications'],
    },
    {
      id: 'requirement-analysis',
      icon: '🔍',
      label: '需求分析',
      prompt: '',  // 使用 RequirementAnalyzer 的专用 prompt
      contextSources: ['dingtalk'],
      isSpecial: true,  // 标记为特殊处理
    },
  ];

  class QuickCommands {
    constructor() {
      this.commands = COMMANDS;
      this.onSelect = null; // 回调: (command) => void
      this.el = null;
    }

    /**
     * 渲染快捷指令区域到指定容器
     * @param {HTMLElement} container
     */
    render(container) {
      this.el = document.createElement('div');
      this.el.className = 'quick-commands';
      this.el.innerHTML = this.commands.map(cmd => `
        <button class="quick-cmd-btn" data-id="${cmd.id}" title="${cmd.prompt.slice(0, 30)}...">
          <span class="quick-cmd-icon">${cmd.icon}</span>
          <span class="quick-cmd-label">${cmd.label}</span>
        </button>
      `).join('');

      container.appendChild(this.el);
      this._bindEvents();
    }

    _bindEvents() {
      this.el.addEventListener('click', (e) => {
        const btn = e.target.closest('.quick-cmd-btn');
        if (!btn) return;
        const cmd = this.commands.find(c => c.id === btn.dataset.id);
        if (cmd && this.onSelect) this.onSelect(cmd);
      });
    }

    /**
     * 获取指令定义
     */
    getCommand(id) {
      return this.commands.find(c => c.id === id);
    }
  }

  window.QuickCommands = QuickCommands;
})();
