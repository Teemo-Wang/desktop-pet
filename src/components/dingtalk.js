/**
 * 钉钉消息面板组件
 */
(function() {
  class DingTalkComponent {
    constructor(panelEl, service) {
      this.panel = panelEl;
      this.service = service;
      this.isOpen = false;
      this.onAction = null; // (action, conv) => void
    }

    async open() {
      this.isOpen = true;
      await this._renderList();
      this.panel.classList.add('open');
    }

    close() { this.isOpen = false; this.panel.classList.remove('open'); }

    async _renderList() {
      this.panel.innerHTML = '<div class="state-loading">加载中</div>';
      const convs = await this.service.getConversations();
      const unread = convs.reduce((s,c) => s + c.unread, 0);

      this.panel.innerHTML = `
        <div class="panel-head">
          <span class="panel-head-title"><img class="panel-head-icon" src="icon/钉钉.png" alt="">钉钉消息</span>
          <span class="panel-head-sub">${unread ? unread + ' 未读' : ''}</span>
          <button class="btn-icon" id="dtClose">✕</button>
        </div>
        <div class="panel-body">
          ${convs.length === 0 ? '<div class="state-empty"><div class="state-empty-icon">💬</div><div class="state-empty-text">暂无消息</div></div>' :
            convs.map(c => `
              <div class="list-item" data-id="${c.id}">
                <div class="list-item-avatar" style="background:${c.type==='group'?'var(--brand)':'var(--success)'}">${c.type==='group'?'群':c.name[0]}</div>
                <div class="list-item-body">
                  <div class="list-item-title">${c.name}</div>
                  <div class="list-item-desc">${c.lastMsg}</div>
                </div>
                <div class="list-item-right">
                  <span class="list-item-time">${c.lastTime}</span>
                  ${c.unread ? `<span class="badge">${c.unread}</span>` : ''}
                </div>
              </div>
            `).join('')}
        </div>`;

      this.panel.querySelector('#dtClose').addEventListener('click', () => document.dispatchEvent(new CustomEvent('panel-close-all')));
      this.panel.querySelectorAll('.list-item').forEach(el => {
        el.addEventListener('click', () => this._renderDetail(el.dataset.id));
      });
    }

    async _renderDetail(id) {
      const conv = await this.service.getConversation(id);
      if (!conv) return;
      await this.service.markRead(id);

      this.panel.innerHTML = `
        <div class="panel-head">
          <button class="btn-icon btn-back" id="dtBack">‹</button>
          <span class="panel-head-title">${conv.name}</span>
          <button class="btn-icon" id="dtClose2">✕</button>
        </div>
        <div class="panel-body" id="dtMessages" style="padding:10px 12px;display:flex;flex-direction:column;gap:8px;">
          ${conv.messages.map(m => this._renderMessage(m, false)).join('')}
        </div>
        <div class="dt-reply-row">
          <input class="dt-reply-input" placeholder="发送消息给 ${conv.name}..." autocomplete="off">
          <button class="dt-reply-upload" title="上传图片">
            <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
          </button>
          <input type="file" class="dt-file-input" accept="image/*" multiple style="display:none">
          <button class="dt-reply-send" title="发送">
            <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
        <div class="panel-foot">
          <button class="btn-action" data-a="takeover">🤖 AI接管</button>
          <button class="btn-action primary" data-a="analyze">🔍 需求分析</button>
        </div>`;

      this.panel.querySelector('#dtBack').addEventListener('click', () => this._renderList());
      this.panel.querySelector('#dtClose2').addEventListener('click', () => document.dispatchEvent(new CustomEvent('panel-close-all')));
      this.panel.querySelectorAll('.btn-action').forEach(btn => {
        btn.addEventListener('click', () => { if (this.onAction) this.onAction(btn.dataset.a, conv); });
      });

      // 自动滚动到最新消息
      const msgsContainer = this.panel.querySelector('#dtMessages');
      if (msgsContainer) {
        // 在下一帧滚动，确保 DOM 已布局
        requestAnimationFrame(() => {
          msgsContainer.scrollTop = msgsContainer.scrollHeight;
        });
      }

      // 回复输入
      const input = this.panel.querySelector('.dt-reply-input');
      const sendBtn = this.panel.querySelector('.dt-reply-send');
      const uploadBtn = this.panel.querySelector('.dt-reply-upload');
      const fileInput = this.panel.querySelector('.dt-file-input');
      this._pendingImages = [];

      const send = () => {
        const text = input.value.trim();
        if (!text && this._pendingImages.length === 0) return;
        // 先发图片
        for (const img of this._pendingImages) {
          this.sendReply(conv.id, '', img.dataUrl);
        }
        this._pendingImages = [];
        this._renderDtPending();
        // 再发文字
        if (text) {
          this.sendReply(conv.id, text);
          input.value = '';
        }
      };
      sendBtn.addEventListener('click', send);
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
      });

      // 上传图片
      this._dtFileDialogOpen = false;
      uploadBtn.addEventListener('click', () => {
        this._dtFileDialogOpen = true;
        fileInput.click();
      });
      fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files || []);
        await this._addDtImages(files);
        fileInput.value = '';
        setTimeout(() => { this._dtFileDialogOpen = false; }, 500);
      });

      // 拖拽上传
      this.panel.addEventListener('dragover', (e) => {
        e.preventDefault(); e.stopPropagation();
        this.panel.classList.add('drag-over');
      });
      this.panel.addEventListener('dragleave', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (!this.panel.contains(e.relatedTarget)) this.panel.classList.remove('drag-over');
      });
      this.panel.addEventListener('drop', async (e) => {
        e.preventDefault(); e.stopPropagation();
        this.panel.classList.remove('drag-over');
        const files = Array.from(e.dataTransfer.files || []).filter(f => /^image\//i.test(f.type));
        if (files.length > 0) await this._addDtImages(files);
      });
    }

    /** 添加待发送图片到预览 */
    async _addDtImages(files) {
      for (const file of files) {
        if (!/^image\//i.test(file.type)) continue;
        const dataUrl = await new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(file);
        });
        this._pendingImages.push({ name: file.name, dataUrl });
      }
      this._renderDtPending();
    }

    /** 渲染钉钉待发送图片预览 */
    _renderDtPending() {
      let preview = this.panel.querySelector('.dt-pending-preview');
      const replyRow = this.panel.querySelector('.dt-reply-row');
      if (!preview && replyRow) {
        preview = document.createElement('div');
        preview.className = 'dt-pending-preview';
        replyRow.parentNode.insertBefore(preview, replyRow);
      }
      if (!preview) return;
      if (!this._pendingImages || this._pendingImages.length === 0) {
        preview.style.display = 'none';
        preview.innerHTML = '';
        return;
      }
      preview.style.display = 'flex';
      preview.innerHTML = this._pendingImages.map((img, idx) => `
        <div class="dt-pending-item">
          <img src="${img.dataUrl}" alt="${img.name}">
          <button class="dt-pending-remove" data-idx="${idx}">✕</button>
        </div>
      `).join('');
      preview.querySelectorAll('.dt-pending-remove').forEach(btn => {
        btn.addEventListener('click', () => {
          this._pendingImages.splice(parseInt(btn.dataset.idx), 1);
          this._renderDtPending();
        });
      });
    }

    /** 渲染单条消息（区分自己/对方） */
    _renderMessage(m, isMine) {
      const cls = isMine || m.isMine ? 'dt-msg dt-msg-mine' : 'dt-msg';
      const senderHtml = !(isMine || m.isMine) ? `<div class="dt-msg-sender">${m.sender}</div>` : '';
      // 图片消息
      let contentHtml;
      if (m.image) {
        contentHtml = `<div class="dt-msg-content"><img class="dt-msg-img" src="${m.image}" alt="图片"></div>`;
      } else {
        const safe = String(m.content).replace(/</g, '&lt;');
        contentHtml = `<div class="dt-msg-content">${safe}</div>`;
      }
      return `
        <div class="${cls}">
          ${senderHtml}
          ${contentHtml}
          <div class="dt-msg-time">${m.time}</div>
        </div>
      `;
    }

    /**
     * 公开方法：在当前对话中追加一条"我"发出的消息
     * 供外部（chat AI 接管"直接回复"按钮）调用
     * @param {string} convId
     * @param {string} text - 文字内容
     * @param {string} [image] - 图片 dataUrl（可选）
     */
    sendReply(convId, text, image) {
      const msg = {
        sender: '我',
        content: text || '',
        time: _hhmm(),
        isMine: true,
      };
      if (image) msg.image = image;
      // 写入 service 的 mock 数据
      this.service.appendMessage && this.service.appendMessage(convId, msg);
      // 如果当前正打开这个会话，追加到 DOM
      const msgs = this.panel.querySelector('#dtMessages');
      if (msgs) {
        const div = document.createElement('div');
        div.innerHTML = this._renderMessage(msg, true);
        msgs.appendChild(div.firstElementChild);
        msgs.scrollTop = msgs.scrollHeight;
      }
    }
  }

  function _hhmm() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  window.DingTalkComponent = DingTalkComponent;
})();
