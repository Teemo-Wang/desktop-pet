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
      this._view = 'list';   // 'list' | 'detail'
      this._curId = null;    // 当前详情会话 ID

      // 实时消息到达：面板打开时自动刷新当前视图
      if (service.onIncoming) {
        service.onIncoming((payload) => {
          if (!this.isOpen) return;
          if (this._view === 'list') this._renderList();
          else if (this._view === 'detail' && this._curId === payload.convId) this._renderDetail(this._curId);
        });
      }
    }

    async open() {
      this.isOpen = true;
      await this._renderList();
      this.panel.classList.add('open');
    }

    close() { this.isOpen = false; this.panel.classList.remove('open'); }

    async _renderList() {
      this._view = 'list';
      this._curId = null;
      this.panel.innerHTML = '<div class="state-loading">加载中</div>';
      const convs = await this.service.getConversations();
      const unread = convs.reduce((s,c) => s + c.unread, 0);

      this.panel.innerHTML = `
        <div class="panel-head">
          <span class="panel-head-title"><img class="panel-head-icon" src="icon/钉钉.png" alt="">钉钉消息</span>
          <span class="panel-head-sub" style="flex:1">${unread ? unread + ' 未读' : ''}</span>
          <button class="btn-icon" id="dtClose">✕</button>
        </div>
        <div class="panel-body">
          ${convs.length === 0 ? '<div class="state-empty"><div class="state-empty-icon">💬</div><div class="state-empty-text">暂无消息</div></div>' :
            convs.map(c => `
              <div class="list-item dt-conv-item" data-id="${c.id}" style="position:relative;user-select:none">
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
      // 长按对话框删除单条会话（替代旧的🗑图标按钮）
      this.panel.querySelectorAll('.dt-conv-item').forEach(el => {
        let pressTimer = null;
        let longPressed = false;   // 标记本次是否触发了长按，避免 click 也进入详情
        const startPress = (e) => {
          longPressed = false;
          pressTimer = setTimeout(() => {
            pressTimer = null;
            longPressed = true;
            const id = el.dataset.id;
            if (!confirm('确认删除此会话？')) return;
            this.service.deleteConversation(id);
            this._renderList();
          }, 600);
        };
        const cancelPress = () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };
        el.addEventListener('mousedown', startPress);
        el.addEventListener('touchstart', startPress, { passive: true });
        el.addEventListener('mouseup', cancelPress);
        el.addEventListener('mouseleave', cancelPress);
        el.addEventListener('touchend', cancelPress);
        el.addEventListener('touchcancel', cancelPress);
        // 普通点击（非长按）→ 进入详情
        el.addEventListener('click', () => { if (longPressed) { longPressed = false; return; } this._renderDetail(el.dataset.id); });
      });
    }

    async _renderDetail(id) {
      const conv = await this.service.getConversation(id);
      if (!conv) return;
      this._view = 'detail';
      this._curId = id;
      await this.service.markRead(id);

      this.panel.innerHTML = `
        <div class="panel-head">
          <button class="btn-icon btn-back" id="dtBack">‹</button>
          <span class="panel-head-title">${conv.name}</span>
          <button class="btn-icon" id="dtClose2">✕</button>
        </div>
        <div class="panel-body" id="dtMessages" style="padding:10px 12px;display:flex;flex-direction:column;gap:8px;">
          ${conv.messages.length > 50 ? `<div class="dt-load-more" style="text-align:center;padding:6px 0;color:var(--text-3);font-size:12px;cursor:pointer" data-offset="${conv.messages.length - 50}">查看更早的 ${conv.messages.length - 50} 条消息 ↑</div>` : ''}
          ${conv.messages.slice(-50).map(m => this._renderMessage(m, false)).join('')}
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
        `;
        // 已按需求移除会话操作按钮（智能解读 / 拟回复 / 提取任务 / 接管）

      this.panel.querySelector('#dtBack').addEventListener('click', () => this._renderList());
      this.panel.querySelector('#dtClose2').addEventListener('click', () => document.dispatchEvent(new CustomEvent('panel-close-all')));

      // 「查看更多」：点击加载更早的消息（每次追加 50 条）
      const loadMoreBtn = this.panel.querySelector('.dt-load-more');
      if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
          const offset = parseInt(loadMoreBtn.dataset.offset, 10) || 0;
          const prevScrollHeight = msgsContainer.scrollHeight;
          const chunk = conv.messages.slice(Math.max(0, offset - 50), offset);
          const html = chunk.map(m => this._renderMessage(m, false)).join('');
          const firstChild = msgsContainer.querySelector('.dt-load-more').nextElementSibling;
          // 在现有第一条消息前插入更早的消息
          firstChild.insertAdjacentHTML('beforebegin', html);
          // 更新或移除「查看更多」按钮
          const newOffset = offset - 50;
          if (newOffset <= 0) {
            loadMoreBtn.remove();
          } else {
            loadMoreBtn.dataset.offset = newOffset;
            loadMoreBtn.textContent = `查看更早的 ${newOffset} 条消息 ↑`;
          }
          // 保持滚动位置（不跳到顶部）
          msgsContainer.scrollTop = msgsContainer.scrollHeight - prevScrollHeight;
          this._hydrateImages(msgsContainer);
        });
      }
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
        // 加载消息中的素材小图
        this._hydrateImages(msgsContainer);
        // 折叠展开 / 链接打开（事件委托）
        msgsContainer.addEventListener('click', (e) => {
          const foldBtn = e.target.closest('[data-act="dt-fold"]');
          if (foldBtn) {
            const fold = foldBtn.previousElementSibling;
            if (fold) {
              const show = fold.style.display === 'none';
              fold.style.display = show ? 'flex' : 'none';
              foldBtn.textContent = show ? '收起' : foldBtn.textContent;
              if (show) this._hydrateImages(fold);
            }
            return;
          }
          const link = e.target.closest('.dt-link[data-open]');
          if (link) { try { require('electron').shell.openExternal(link.dataset.open); } catch (err) {} }
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

    /**
     * 渲染回复正文：markdown 图片 → 小图（最多 2 张，其余折叠），链接 → 可点击，其余按文本
     * 图片用 data-src 占位，随后 _hydrateImages 带 token 加载
     */
    _renderReplyBody(content) {
      const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const images = [];
      // 抽取 markdown 图片
      let text = content.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, url) => {
        images.push({ alt: alt || '素材', url });
        return '';
      });
      // 链接 [text](url) → 占位标记，稍后转可点击
      const links = [];
      text = text.replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (m, t, url) => {
        links.push({ t: t || url, url });
        return `\u0001L${links.length - 1}\u0001`;
      });
      // 文本转义 + 还原链接为按钮 + 换行
      let html = esc(text)
        .replace(/\u0001L(\d+)\u0001/g, (m, i) => {
          const l = links[+i];
          return `<a class="dt-link" data-open="${esc(l.url)}">${esc(l.t)} ↗</a>`;
        })
        .replace(/\n{2,}/g, '<br>')
        .replace(/\n/g, '<br>');

      // 图片区：前 2 张直显，其余折叠
      let imgHtml = '';
      if (images.length) {
        const one = (im) => `<img class="dt-md-img" data-src="${esc(im.url)}" alt="${esc(im.alt)}" title="${esc(im.alt)}">`;
        imgHtml += `<div class="dt-md-imgs">${images.slice(0, 2).map(one).join('')}</div>`;
        if (images.length > 2) {
          imgHtml += `<div class="dt-md-fold" style="display:none">${images.slice(2).map(one).join('')}</div>`;
          imgHtml += `<button class="dt-md-more" data-act="dt-fold">展开剩余 ${images.length - 2} 张</button>`;
        }
      }
      return html + imgHtml;
    }

    /** 给 data-src 的图片带 token 拉取并显示（复用素材服务） */
    _hydrateImages(root) {
      const svc = window.materialService;
      const imgs = Array.from((root || this.panel).querySelectorAll('.dt-md-img[data-src]'));
      imgs.forEach(async (img) => {
        const src = img.getAttribute('data-src');
        if (!src) return;
        img.removeAttribute('data-src');
        try {
          const dataUrl = svc && svc.fetchThumb ? await svc.fetchThumb(src) : '';
          img.src = dataUrl || src;
        } catch (e) { img.src = src; }
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
        // 富文本：解析 markdown 图片（小图，最多 2 张，其余折叠）与链接
        contentHtml = `<div class="dt-msg-content">${this._renderReplyBody(String(m.content || ''))}</div>`;
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
    async sendReply(convId, text, image) {
      // 图片 / 空文字：sessionWebhook 不支持图片，仅本地展示
      if (image || !text) {
        const msg = { sender: '我', content: text || '', time: _hhmm(), isMine: true };
        if (image) msg.image = image;
        this.service.appendMessage && this.service.appendMessage(convId, msg);
        this._appendMsgDom(msg);
        return { ok: true };
      }

      // 文字：通过 service 真正发送到钉钉（POST sessionWebhook）
      let res;
      if (this.service.reply) {
        res = await this.service.reply(convId, text);
      } else {
        res = { ok: false, error: '服务不可用' };
      }

      if (res.ok) {
        // service.reply 成功时内部已写入数据模型，这里仅补充 DOM 即时展示
        this._appendMsgDom({ sender: '我', content: text, time: _hhmm(), isMine: true });
      } else {
        // 发送失败：界面明确提示，避免"看起来发了其实没发"
        this._appendMsgDom({ sender: '系统', content: '⚠️ 发送失败：' + (res.error || '未知错误'), time: _hhmm(), isMine: false });
      }
      return res;
    }

    /** 把一条消息追加到当前会话 DOM（若正打开该会话） */
    _appendMsgDom(msg) {
      const msgs = this.panel.querySelector('#dtMessages');
      if (!msgs) return;
      const div = document.createElement('div');
      div.innerHTML = this._renderMessage(msg, msg.isMine);
      if (div.firstElementChild) {
        const node = div.firstElementChild;
        msgs.appendChild(node);
        this._hydrateImages(node);
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
