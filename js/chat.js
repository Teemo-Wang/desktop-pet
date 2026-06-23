/**
 * AI 聊天面板
 * 集成快捷指令 + 上下文注入
 */

(function() {

  class ChatPanel {
    constructor() {
      this.panel = document.getElementById('chatPanel');
      this.closeBtn = document.getElementById('chatClose');
      this.input = document.getElementById('chatInput');
      this.sendBtn = document.getElementById('chatSend');
      this.messages = document.getElementById('chatMessages');
      this.isOpen = false;
      this.history = [];
      this.systemPrompt = '';
      this.isSending = false;

      // 快捷指令 & 上下文
      this.quickCommands = new window.QuickCommands();
      this.contextBuilder = new window.ContextBuilder();

      this._bindEvents();
      this._initQuickCommands();
    }

    init(systemPrompt) {
      this.systemPrompt = systemPrompt;
      this.history = [{ role: 'system', content: systemPrompt }];
    }

    _bindEvents() {
      this.closeBtn.addEventListener('click', () => this.close());
      this.sendBtn.addEventListener('click', () => this._send());
      this.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._send(); }
      });
    }

    _initQuickCommands() {
      // 在输入框上方插入快捷指令区域
      const inputArea = this.panel.querySelector('.chat-input-area');
      this.quickCommands.render(inputArea.parentElement);
      // 移动到 input-area 前面
      const qcEl = this.panel.querySelector('.quick-commands');
      inputArea.parentElement.insertBefore(qcEl, inputArea);

      // 点击快捷指令
      this.quickCommands.onSelect = (cmd) => this._executeCommand(cmd);
    }

    /**
     * 执行快捷指令
     */
    async _executeCommand(cmd) {
      if (this.isSending) return;

      // 显示用户选择的指令
      this._append('user', cmd.icon + ' ' + cmd.label);

      this.isSending = true;
      const typing = this._append('assistant typing', '正在整理上下文...');

      try {
        // 构建带上下文的 prompt
        const fullPrompt = await this.contextBuilder.buildPromptWithContext(
          cmd.prompt,
          cmd.contextSources
        );

        // 加入历史
        this.history.push({ role: 'user', content: fullPrompt });

        typing.textContent = '思考中...';

        // 调用 AI
        const reply = await window.aiService.sendMessage(this.history);
        typing.remove();
        this._append('assistant', reply);
        this.history.push({ role: 'assistant', content: reply });
      } catch (err) {
        typing.remove();
        this._append('assistant', err.message || '⚠️ 未知错误');
      }

      this.isSending = false;
    }

    async _send() {
      const text = this.input.value.trim();
      if (!text || this.isSending) return;

      this.isSending = true;
      this._append('user', text);
      this.input.value = '';
      this.history.push({ role: 'user', content: text });

      const typing = this._append('assistant typing', '思考中...');

      try {
        const reply = await window.aiService.sendMessage(this.history);
        typing.remove();
        this._append('assistant', reply);
        this.history.push({ role: 'assistant', content: reply });
      } catch (err) {
        typing.remove();
        this._append('assistant', err.message || '⚠️ 未知错误');
      }

      this.isSending = false;
    }

    open() {
      this.isOpen = true;
      this.panel.classList.add('open');
      setTimeout(() => this.input.focus(), 300);
    }

    close() {
      this.isOpen = false;
      this.panel.classList.remove('open');
    }

    toggle() { this.isOpen ? this.close() : this.open(); }

    clear() {
      this.messages.innerHTML = '<div class="message assistant">对话已清除，有什么可以帮你的？😊</div>';
      this.history = [{ role: 'system', content: this.systemPrompt }];
    }

    _append(cls, text) {
      const div = document.createElement('div');
      div.className = 'message ' + cls;
      div.textContent = text;
      this.messages.appendChild(div);
      this.messages.scrollTop = this.messages.scrollHeight;
      return div;
    }
  }

  window.ChatPanel = ChatPanel;
})();
