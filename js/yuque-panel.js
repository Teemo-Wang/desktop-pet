/**
 * 语雀文档面板
 * 支持：输入链接读取、最近记录、发送给AI总结
 */

(function() {

  class YuquePanel {
    constructor() {
      this.service = new window.YuqueService();
      this.el = null;
      this.isOpen = false;
      this.currentDoc = null;
      this._createDOM();
    }

    _createDOM() {
      this.el = document.createElement('div');
      this.el.id = 'yuquePanel';
      this.el.className = 'yuque-panel';
      document.querySelector('.app').appendChild(this.el);
    }

    async open() {
      this.isOpen = true;
      // 自动连接（mock）
      if (this.service.getAuthStatus() !== 'connected') {
        try { await this.service.connect('mock-token-xxx'); } catch(e) {}
      }
      this._renderMain();
      this.el.classList.add('open');
    }

    close() {
      this.isOpen = false;
      this.el.classList.remove('open');
    }

    _renderMain() {
      const recent = this.service.getRecentDocs();
      const authOk = this.service.getAuthStatus() === 'connected';

      this.el.innerHTML = `
        <div class="yq-header">
          <span class="yq-title">📄 语雀文档</span>
          <div class="yq-status">
            <span class="yq-status-dot ${authOk ? 'connected' : ''}"></span>
            <span class="yq-status-text">${authOk ? '已连接' : '未连接'}</span>
          </div>
          <button class="yq-close" id="yqClose">✕</button>
        </div>
        <div class="yq-input-area">
          <input class="yq-url-input" id="yqUrlInput" placeholder="粘贴语雀文档链接..." autocomplete="off">
          <button class="yq-fetch-btn" id="yqFetchBtn">读取</button>
        </div>
        <div class="yq-body" id="yqBody">
          ${recent.length > 0 ? `
            <div class="yq-section-title">最近读取</div>
            ${recent.map(d => `
              <div class="yq-recent-item" data-id="${d.id}">
                <div class="yq-recent-title">${d.title}</div>
                <div class="yq-recent-meta">${d.author} · ${d.readAt}</div>
              </div>
            `).join('')}
          ` : `
            <div class="yq-empty">
              <div class="yq-empty-icon">📑</div>
              <div class="yq-empty-text">粘贴语雀链接读取文档</div>
              <div class="yq-empty-hint">支持总结、提炼重点、转待办</div>
            </div>
          `}
        </div>
      `;

      this._bindMainEvents();
    }

    _renderDocDetail(doc, content) {
      this.currentDoc = { ...doc, content };
      const summary = content.split('\n').filter(l => l.trim()).slice(0, 8).join('\n');

      this.el.innerHTML = `
        <div class="yq-header">
          <button class="yq-back" id="yqBack">‹</button>
          <span class="yq-title yq-title-sm">${doc.title}</span>
          <button class="yq-close" id="yqClose">✕</button>
        </div>
        <div class="yq-doc-meta">
          <span>${doc.author}</span>
          <span>·</span>
          <span>${doc.updatedAt}</span>
          <span>·</span>
          <span>${doc.wordCount} 字</span>
        </div>
        <div class="yq-doc-content" id="yqDocContent">${this._renderMarkdown(content)}</div>
        <div class="yq-doc-actions">
          <button class="yq-action-btn" data-action="copy">📋 复制摘要</button>
          <button class="yq-action-btn primary" data-action="ai-summary">🤖 AI 总结</button>
        </div>
      `;

      this._bindDetailEvents();
    }

    _renderError(msg) {
      const body = document.getElementById('yqBody');
      if (body) {
        body.innerHTML = `<div class="yq-error">${msg}</div>`;
      }
    }

    _renderMarkdown(text) {
      // 简单 markdown 渲染
      return text
        .split('\n')
        .map(line => {
          if (line.startsWith('# ')) return `<h3 class="yq-md-h1">${line.slice(2)}</h3>`;
          if (line.startsWith('## ')) return `<h4 class="yq-md-h2">${line.slice(3)}</h4>`;
          if (line.startsWith('### ')) return `<h5 class="yq-md-h3">${line.slice(4)}</h5>`;
          if (line.startsWith('- ')) return `<div class="yq-md-li">• ${line.slice(2)}</div>`;
          if (line.trim() === '') return '<div class="yq-md-br"></div>';
          return `<div class="yq-md-p">${line}</div>`;
        })
        .join('');
    }

    _bindMainEvents() {
      this.el.querySelector('#yqClose').addEventListener('click', () => this.close());

      this.el.querySelector('#yqFetchBtn').addEventListener('click', () => this._fetchDoc());
      this.el.querySelector('#yqUrlInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this._fetchDoc();
      });

      // 最近记录点击
      this.el.querySelectorAll('.yq-recent-item').forEach(item => {
        item.addEventListener('click', () => this._openRecent(item.dataset.id));
      });
    }

    _bindDetailEvents() {
      this.el.querySelector('#yqClose').addEventListener('click', () => this.close());
      this.el.querySelector('#yqBack').addEventListener('click', () => this._renderMain());

      this.el.querySelectorAll('.yq-action-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const action = btn.dataset.action;
          if (action === 'copy') this._copyAbstract();
          if (action === 'ai-summary') this._sendToAI();
        });
      });
    }

    async _fetchDoc() {
      const input = this.el.querySelector('#yqUrlInput');
      const url = input.value.trim();
      if (!url) return;

      const btn = this.el.querySelector('#yqFetchBtn');
      btn.textContent = '读取中...';
      btn.disabled = true;

      try {
        const doc = await this.service.getDocumentByUrl(url);
        const content = await this.service.getDocumentContent(doc.id);
        this._renderDocDetail(doc, content);
      } catch (err) {
        this._renderError('⚠️ ' + err.message);
      }

      btn.textContent = '读取';
      btn.disabled = false;
    }

    async _openRecent(docId) {
      try {
        const content = await this.service.getDocumentContent(docId);
        const recent = this.service.getRecentDocs().find(d => d.id === docId);
        this._renderDocDetail({ ...recent, wordCount: content.length, updatedAt: recent.readAt }, content);
      } catch (err) {
        this._renderError('⚠️ ' + err.message);
      }
    }

    _copyAbstract() {
      if (!this.currentDoc) return;
      const abstract = this.currentDoc.content.split('\n').filter(l => l.trim()).slice(0, 10).join('\n');
      navigator.clipboard.writeText(abstract);
      // 简单反馈
      const btn = this.el.querySelector('[data-action="copy"]');
      btn.textContent = '✓ 已复制';
      setTimeout(() => { btn.textContent = '📋 复制摘要'; }, 1500);
    }

    _sendToAI() {
      if (!this.currentDoc) return;
      // 关闭语雀面板，打开聊天面板并注入文档内容
      this.close();

      // 通过全局事件通知 app 打开 AI 并注入上下文
      const event = new CustomEvent('yuque-to-ai', {
        detail: {
          title: this.currentDoc.title,
          content: this.currentDoc.content,
        }
      });
      document.dispatchEvent(event);
    }
  }

  window.YuquePanel = YuquePanel;
})();
