/**
 * AI 聊天面板组件
 * 特性：
 *  - 多会话历史（持久化），抽屉式切换
 *  - Markdown 渲染（标题/列表/代码块/链接）
 *  - 流式输出（mock + 真实 SSE 都支持）
 *  - 单条消息复制
 */
(function() {
  const QUICK_CMDS = [
    { id:'summary', icon:'📝', label:'总结消息', sources:['dingtalk'] },
    { id:'analyze', icon:'🔍', label:'需求分析', sources:['dingtalk'] },
    { id:'review', icon:'🎨', label:'设计复盘', sources:[] },
    { id:'copy', icon:'✍️', label:'营销文案', sources:[] },
    { id:'todos', icon:'✅', label:'转待办', sources:['dingtalk'] },
    { id:'visual', icon:'🖼️', label:'生成视觉图', sources:[] },
  ];

  class ChatComponent {
    constructor(panelEl, historyService) {
      this.panel = panelEl;
      this.history = historyService;       // ChatHistoryService 实例
      this.msgs = panelEl.querySelector('.chat-messages');
      this.input = panelEl.querySelector('.chat-input');
      this.sendBtn = panelEl.querySelector('.chat-send-btn');
      this.uploadBtn = panelEl.querySelector('.chat-upload-btn');
      this.fileInput = panelEl.querySelector('.chat-file-input');
      this.head = panelEl.querySelector('.panel-head');
      this.isOpen = false;
      this.sending = false;
      this.onQuickCmd = null;
      this.systemPrompt = '';
      this.drawerOpen = false;
      this.streamAbortCtrl = null;
      this._pendingFiles = [];  // 待发送的图片文件列表
      this._initHeader();
      this._initQuickCmds();
      this._initDrawer();
      this._initUpload();
      this._bind();

      // 历史更新时如果不在流式过程中，重渲消息列表
      this.history.onChange(() => {
        if (!this.sending && this.isOpen) this._renderActiveMessages();
        if (this.drawerOpen) this._renderDrawer();
      });
    }

    /** 初始化系统提示词，并确保有激活会话 */
    init(systemPrompt) {
      this.systemPrompt = systemPrompt || '';
      if (!this.history.getActive()) {
        this.history.create(this.systemPrompt);
      } else {
        // 同步系统提示词到当前会话（用户可能改过）
        this.history.setSystemPrompt(this.systemPrompt);
      }
      this._renderActiveMessages();
    }

    _initHeader() {
      // 在 takeover 按钮前插入"历史"和"新建"按钮
      const takeoverBtn = this.head.querySelector('.takeover-btn');
      const historyBtn = document.createElement('button');
      historyBtn.className = 'btn-icon chat-history-btn';
      historyBtn.title = '历史会话';
      historyBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h12v2H3v-2z"/></svg>';
      const newBtn = document.createElement('button');
      newBtn.className = 'btn-icon chat-new-btn';
      newBtn.title = '新建对话';
      newBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7V4z"/></svg>';
      this.head.insertBefore(historyBtn, takeoverBtn);
      this.head.insertBefore(newBtn, takeoverBtn);

      historyBtn.addEventListener('click', () => this._toggleDrawer());
      newBtn.addEventListener('click', () => {
        this.history.create(this.systemPrompt);
        this._renderActiveMessages();
        if (this.drawerOpen) this._renderDrawer();
      });
    }

    _initQuickCmds() {
      const area = this.panel.querySelector('.quick-cmds');
      area.innerHTML = QUICK_CMDS.map(c => `<button class="qc-btn" data-id="${c.id}"><span class="qc-icon">${c.icon}</span><span class="qc-label">${c.label}</span></button>`).join('');
      area.addEventListener('click', e => { const b = e.target.closest('.qc-btn'); if (b && this.onQuickCmd) this.onQuickCmd(b.dataset.id); });
    }

    _initDrawer() {
      this.drawer = document.createElement('div');
      this.drawer.className = 'chat-drawer';
      this.drawer.innerHTML = `
        <div class="chat-drawer-head">
          <span class="chat-drawer-title">历史会话</span>
          <button class="btn-icon chat-drawer-close" title="关闭">✕</button>
        </div>
        <div class="chat-drawer-list"></div>
      `;
      this.panel.appendChild(this.drawer);

      this.drawer.querySelector('.chat-drawer-close').addEventListener('click', () => this._toggleDrawer(false));
    }

    _initUpload() {
      // 标记：文件选择器打开期间不关闭面板
      this._fileDialogOpen = false;

      // 点击上传按钮
      this.uploadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._fileDialogOpen = true;
        this.fileInput.click();
      });

      // 文件选择完成
      this.fileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files || []);
        this._addPendingFiles(files);
        this.fileInput.value = '';
        // 延迟恢复标记，给窗口重新获焦留时间
        setTimeout(() => { this._fileDialogOpen = false; }, 500);
      });

      // 取消选择时也恢复标记
      this.fileInput.addEventListener('cancel', () => {
        setTimeout(() => { this._fileDialogOpen = false; }, 500);
      });

      // 监听窗口重新获焦（文件对话框关闭后触发），延迟恢复标记
      window.addEventListener('focus', () => {
        if (this._fileDialogOpen) {
          setTimeout(() => { this._fileDialogOpen = false; }, 300);
        }
      });

      // 拖拽进入面板
      this.panel.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.panel.classList.add('drag-over');
      });

      this.panel.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // 只在离开面板时移除高亮（子元素间切换不触发）
        if (!this.panel.contains(e.relatedTarget)) {
          this.panel.classList.remove('drag-over');
        }
      });

      this.panel.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.panel.classList.remove('drag-over');
        const files = Array.from(e.dataTransfer.files || []);
        const imageFiles = files.filter(f => /^image\/(png|jpe?g|gif|webp|bmp|svg\+xml)$/i.test(f.type));
        if (imageFiles.length > 0) {
          this._addPendingFiles(imageFiles);
        }
      });
    }

    /** 添加待发送文件到预览区 */
    _addPendingFiles(files) {
      for (const file of files) {
        if (!/^image\//i.test(file.type)) continue;
        this._pendingFiles.push(file);
      }
      this._renderPendingPreview();
      this.input.focus();
    }

    /** 渲染待发送图片预览 */
    _renderPendingPreview() {
      const preview = this.panel.querySelector('.chat-pending-preview');
      if (!preview) return;

      if (this._pendingFiles.length === 0) {
        preview.style.display = 'none';
        preview.innerHTML = '';
        return;
      }

      preview.style.display = 'flex';
      preview.innerHTML = this._pendingFiles.map((file, idx) => {
        const url = URL.createObjectURL(file);
        return `<div class="pending-img-item" data-idx="${idx}">
          <img src="${url}" alt="${_escape(file.name)}" />
          <button class="pending-img-remove" data-idx="${idx}">✕</button>
          <span class="pending-img-name">${_escape(file.name.length > 12 ? file.name.slice(0, 10) + '…' : file.name)}</span>
        </div>`;
      }).join('');

      // 删除按钮
      preview.querySelectorAll('.pending-img-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.dataset.idx);
          this._pendingFiles.splice(idx, 1);
          this._renderPendingPreview();
        });
      });
    }

    /** 清空待发送文件 */
    _clearPendingFiles() {
      this._pendingFiles = [];
      this._renderPendingPreview();
    }

    _toggleDrawer(force) {
      this.drawerOpen = (force === undefined) ? !this.drawerOpen : force;
      this.drawer.classList.toggle('open', this.drawerOpen);
      if (this.drawerOpen) this._renderDrawer();
    }

    _renderDrawer() {
      const groups = this.history.getGrouped();
      const activeId = this.history.getActive()?.id;
      const list = this.drawer.querySelector('.chat-drawer-list');

      if (groups.length === 0) {
        list.innerHTML = '<div class="state-empty"><div class="state-empty-text">还没有历史会话</div></div>';
        return;
      }

      list.innerHTML = groups.map(g => `
        <div class="chat-drawer-group">
          <div class="chat-drawer-group-label">${g.label}</div>
          ${g.items.map(s => {
            const preview = (s.messages.find(m => m.role === 'user')?.content || '空对话').slice(0, 40).replace(/\n/g, ' ');
            return `
              <div class="chat-drawer-item ${s.id === activeId ? 'active' : ''}" data-id="${s.id}">
                <div class="chat-drawer-item-body">
                  <div class="chat-drawer-item-title">${_escape(_stripLeadingEmoji(s.title))}</div>
                  <div class="chat-drawer-item-meta">
                    <span class="chat-drawer-item-preview">${_escape(_stripLeadingEmoji(preview))}</span>
                    <span class="chat-drawer-item-time">${window.ChatHistoryUtils.relativeTime(s.updatedAt)}</span>
                  </div>
                </div>
                <button class="btn-icon chat-drawer-item-del" title="删除" data-del="${s.id}">🗑</button>
              </div>
            `;
          }).join('')}
        </div>
      `).join('');

      list.querySelectorAll('.chat-drawer-item').forEach(row => {
        const id = row.dataset.id;
        row.addEventListener('click', e => {
          if (e.target.closest('[data-del]')) return;
          this.history.setActive(id);
          this._renderActiveMessages();
          this._toggleDrawer(false);
        });
      });
      list.querySelectorAll('[data-del]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          if (confirm('删除该会话？')) this.history.remove(btn.dataset.del);
        });
      });
    }

    _bind() {
      // 关闭按钮：head 中最后那个原生 ✕（class 仅 btn-icon，且不含 chat-history-btn / chat-new-btn）
      const closeBtn = Array.from(this.head.querySelectorAll('.btn-icon')).find(b => !b.classList.contains('chat-history-btn') && !b.classList.contains('chat-new-btn'));
      closeBtn?.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('panel-close-all'));
      });
      this.sendBtn.addEventListener('click', () => this._send());
      this.input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._send(); }
      });
    }

    open() {
      this.isOpen = true;
      this.panel.classList.add('open');
      // 切换会话或刚启动后重新渲染
      this._renderActiveMessages();
      setTimeout(() => this.input.focus(), 250);
    }
    close() { this.isOpen = false; this.panel.classList.remove('open'); this._toggleDrawer(false); }

    /** 渲染当前会话所有消息 */
    _renderActiveMessages() {
      const active = this.history.getActive();
      this.msgs.innerHTML = '';
      if (!active) return;
      for (const m of active.messages) {
        if (m.role === 'system') continue; // 不展示 system
        this._renderMessageDOM(m.role, m.content, false);
      }
      this.msgs.scrollTop = this.msgs.scrollHeight;
    }

    /** 创建单条消息 DOM；返回 DOM 引用（流式时由调用方持续更新内容） */
    _renderMessageDOM(role, content, animate = true) {
      const wrap = document.createElement('div');
      wrap.className = 'msg msg-' + role + (animate ? ' msg-in' : '');
      const body = document.createElement('div');
      body.className = 'msg-body';
      if (role === 'user') {
        // 检测富内容对象（带图片附件的消息）
        if (content && typeof content === 'object' && content._images && content._images.length > 0) {
          for (const img of content._images) {
            const imgEl = document.createElement('img');
            imgEl.className = 'msg-inline-img';
            imgEl.src = img.dataUrl;
            imgEl.alt = img.name || '图片';
            body.appendChild(imgEl);
          }
          if (content._text) {
            const p = document.createElement('p');
            p.textContent = content._text;
            body.appendChild(p);
          }
        } else {
          body.textContent = (typeof content === 'string') ? content : JSON.stringify(content);
        }
      } else {
        body.innerHTML = window.Markdown.render(typeof content === 'string' ? content : '');
      }
      wrap.appendChild(body);

      // bot 消息加复制按钮
      if (role === 'bot' || role === 'assistant') {
        wrap.classList.add('msg-bot');
        const tools = document.createElement('div');
        tools.className = 'msg-tools';
        const copyBtn = document.createElement('button');
        copyBtn.className = 'msg-copy-btn';
        copyBtn.title = '复制';
        copyBtn.innerHTML = '<svg viewBox="0 0 24 24" width="11" height="11"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';
        copyBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(body.textContent).then(() => {
            copyBtn.classList.add('copied');
            copyBtn.title = '已复制';
            setTimeout(() => { copyBtn.classList.remove('copied'); copyBtn.title = '复制'; }, 1500);
          });
        });
        tools.appendChild(copyBtn);
        wrap.appendChild(tools);
      }

      this.msgs.appendChild(wrap);
      this.msgs.scrollTop = this.msgs.scrollHeight;
      return { wrap, body };
    }

    async _send() {
      const t = this.input.value.trim();
      const hasFiles = this._pendingFiles.length > 0;
      if (!t && !hasFiles) return;
      if (this.sending) return;
      this.input.value = '';

      if (hasFiles) {
        // 将图片转为 base64
        const imageDataList = await this._filesToBase64(this._pendingFiles);
        const fileNames = this._pendingFiles.map(f => f.name);
        this._clearPendingFiles();

        // 先标记发送中，防止 history.onChange 触发重渲覆盖富内容
        this.sending = true;

        // 写入历史（文本形式记录图片信息）
        const historyText = `[图片：${fileNames.join(', ')}]${t ? '\n' + t : ''}`;
        this.history.addMessage('user', historyText);

        // 渲染用户消息（带缩略图）
        const richContent = { _images: imageDataList, _text: t || '' };
        this._renderMessageDOM('user', richContent);

        // 判断是否是生图/改图请求（调用 images API）
        const isImageGenRequest = this._isImageEditRequest(t);

        if (isImageGenRequest && window.aiService.config && !window.aiService.useMock) {
          // 使用 images/generations 端点
          const placeholder = this._renderMessageDOM('assistant', '🎨 正在生成图片...');
          placeholder.wrap.classList.add('msg-typing');
          const assistantMsg = this.history.addMessage('assistant', '');

          try {
            const result = await window.aiService.generateImage({
              prompt: t || '基于参考图生成',
              imageUrl: imageDataList[0]?.dataUrl || null,
            });

            placeholder.wrap.classList.remove('msg-typing');
            const imgUrl = result.url || (result.b64 ? `data:image/png;base64,${result.b64}` : null);
            if (imgUrl) {
              const responseText = `✅ 图片已生成：\n\n![生成结果](${imgUrl})`;
              placeholder.body.innerHTML = window.Markdown.render(responseText);
              assistantMsg.content = responseText;
            } else {
              placeholder.body.innerHTML = window.Markdown.render('⚠️ 生图完成但未返回图片数据');
              assistantMsg.content = '⚠️ 生图完成但未返回图片数据';
            }
            this.history.updateLastMessage(assistantMsg.content);
            this.history.flush();
          } catch (e) {
            placeholder.wrap.classList.remove('msg-typing');
            const errText = '⚠️ ' + (e.message || '生图失败');
            placeholder.body.innerHTML = window.Markdown.render(errText);
            assistantMsg.content = errText;
            this.history.updateLastMessage(errText);
            this.history.flush();
          } finally {
            this.sending = false;
          }
        } else {
          // 使用 chat/completions（多模态理解）
          const active = this.history.getActive();
          const apiMessages = active.messages
            .filter(m => m.role === 'system' || m.role === 'user' || m.role === 'assistant')
            .map(m => ({ role: m.role, content: m.content }));

          // 替换最后一条 user 为多模态格式
          const visionContent = [];
          for (const img of imageDataList) {
            visionContent.push({ type: 'image_url', image_url: { url: img.dataUrl } });
          }
          visionContent.push({ type: 'text', text: t || '请分析这张图片的内容、设计风格和元素。' });
          if (apiMessages.length > 0) {
            apiMessages[apiMessages.length - 1] = { role: 'user', content: visionContent };
          }

          const placeholder = this._renderMessageDOM('assistant', '…');
          placeholder.wrap.classList.add('msg-typing');
          const assistantMsg = this.history.addMessage('assistant', '');

          this.streamAbortCtrl = new AbortController();
          try {
            let acc = '';
            await window.aiService.stream(apiMessages, (chunk, full) => {
              if (placeholder.wrap.classList.contains('msg-typing')) placeholder.wrap.classList.remove('msg-typing');
              acc = full;
              placeholder.body.innerHTML = window.Markdown.render(full);
              this.msgs.scrollTop = this.msgs.scrollHeight;
            }, this.streamAbortCtrl.signal);
            assistantMsg.content = acc || '⚠️ 模型无响应';
            this.history.updateLastMessage(assistantMsg.content);
            this.history.flush();
          } catch (e) {
            placeholder.wrap.classList.remove('msg-typing');
            const errText = e.message || '⚠️ 请求失败';
            placeholder.body.innerHTML = window.Markdown.render(errText);
            assistantMsg.content = errText;
            this.history.updateLastMessage(errText);
            this.history.flush();
          } finally {
            this.streamAbortCtrl = null;
            this.sending = false;
          }
        }
        this.msgs.scrollTop = this.msgs.scrollHeight;
      } else {
        await this.sendToAI(t, t);
      }
    }

    /** 判断用户文字是否是改图/生图请求 */
    _isImageEditRequest(text) {
      if (!text) return false;
      const keywords = ['改', '修改', '换', '替换', '调整', '生成', '做一张', '画', '设计', '价格改', '文字改', '颜色改', '改成', '换成'];
      return keywords.some(kw => text.includes(kw));
    }

    /** 将文件列表转为 base64 data URL */
    async _filesToBase64(files) {
      const results = [];
      for (const file of files) {
        const dataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(file);
        });
        results.push({ name: file.name, dataUrl, size: file.size, type: file.type });
      }
      return results;
    }

    /**
     * 发送给 AI 并流式渲染回复
     * @param {string} displayText - 用户气泡显示的文本
     * @param {string} prompt - 实际发给 AI 的内容
     */
    async sendToAI(displayText, prompt) {
      if (this.sending) return;
      this.sending = true;

      // 入库 + 渲染用户消息
      this.history.addMessage('user', displayText);
      this._renderMessageDOM('user', displayText);

      // 占位：思考中
      const placeholder = this._renderMessageDOM('assistant', '…');
      placeholder.wrap.classList.add('msg-typing');

      // 构造请求消息（按 OpenAI 协议）
      const active = this.history.getActive();
      const apiMessages = active.messages
        .filter(m => m.role === 'system' || m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content }));
      // 如果是从快捷指令传 prompt（不同于 displayText），把最后一条 user 替换为 prompt
      if (prompt !== displayText && apiMessages.length > 0) {
        const lastUserIdx = (() => {
          for (let i = apiMessages.length - 1; i >= 0; i--) if (apiMessages[i].role === 'user') return i;
          return -1;
        })();
        if (lastUserIdx >= 0) apiMessages[lastUserIdx] = { role: 'user', content: prompt };
      }

      // 入库占位（开始为空，由流式更新）
      const assistantMsg = this.history.addMessage('assistant', '');

      this.streamAbortCtrl = new AbortController();
      try {
        let acc = '';
        await window.aiService.stream(apiMessages, (chunk, full) => {
          // 第一片 chunk 到来时移除"思考中"
          if (placeholder.wrap.classList.contains('msg-typing')) {
            placeholder.wrap.classList.remove('msg-typing');
          }
          acc = full;
          placeholder.body.innerHTML = window.Markdown.render(full);
          this.msgs.scrollTop = this.msgs.scrollHeight;
        }, this.streamAbortCtrl.signal);

        // 流式结束写库
        assistantMsg.content = acc || '⚠️ 模型无响应';
        this.history.updateLastMessage(assistantMsg.content);
        this.history.flush();
        if (!acc) placeholder.body.innerHTML = window.Markdown.render(assistantMsg.content);
      } catch (e) {
        const errText = e.message || '⚠️ 请求失败';
        placeholder.wrap.classList.remove('msg-typing');
        placeholder.body.innerHTML = window.Markdown.render(errText);
        assistantMsg.content = errText;
        this.history.updateLastMessage(errText);
        this.history.flush();
      } finally {
        this.streamAbortCtrl = null;
        this.sending = false;
      }
    }

    /** 直接添加消息（外部模块调用，比如 takeover 提示） */
    addMsg(cls, text) {
      // 兼容旧接口：cls 可能是 'user'|'bot'|'bot typing'
      const role = cls.startsWith('user') ? 'user' : 'assistant';
      this.history.addMessage(role, text);
      const dom = this._renderMessageDOM(role, text);
      if (cls.includes('typing')) dom.wrap.classList.add('msg-typing');
      // 返回 DOM 给旧调用方使用
      return Object.assign(dom.body, {
        // 兼容 .remove() / .textContent
        remove: () => dom.wrap.remove(),
      });
    }

    /**
     * 添加一条 AI 建议回复卡片（带"直接回复"按钮）
     * @param {string} convId
     * @param {string} convName
     * @param {string} replyText - AI 生成的回复内容
     * @param {(text:string)=>void} onSend - 点击直接回复时的回调
     */
    addReplyCard(convId, convName, replyText, onSend) {
      // 写入历史（带 reply 元信息标记，重渲时不复活按钮但保留文本）
      this.history.addMessage('assistant', `💬 建议回复「${convName}」：\n\n${replyText}`);

      const wrap = document.createElement('div');
      wrap.className = 'msg msg-assistant msg-bot msg-in reply-card';
      wrap.innerHTML = `
        <div class="msg-body">
          <div class="reply-card-head">💬 建议回复「${_escape(convName)}」</div>
          <div class="reply-card-body">${window.Markdown.render(replyText)}</div>
          <div class="reply-card-actions">
            <button class="reply-card-btn reply-card-edit">✎ 编辑后发送</button>
            <button class="reply-card-btn reply-card-send">📤 直接回复</button>
          </div>
        </div>
      `;
      this.msgs.appendChild(wrap);
      this.msgs.scrollTop = this.msgs.scrollHeight;

      const editBtn = wrap.querySelector('.reply-card-edit');
      const sendBtn = wrap.querySelector('.reply-card-send');
      let editing = false;

      sendBtn.addEventListener('click', () => {
        if (typeof onSend === 'function') {
          // 编辑态时取 textarea 的值
          const ta = wrap.querySelector('.reply-card-textarea');
          const final = (editing && ta) ? ta.value : replyText;
          onSend(final);
          // 视觉反馈
          sendBtn.classList.add('sent');
          sendBtn.disabled = true;
          editBtn.disabled = true;
          sendBtn.textContent = '✓ 已发送';
        }
      });

      editBtn.addEventListener('click', () => {
        if (editing) return;
        editing = true;
        const body = wrap.querySelector('.reply-card-body');
        body.innerHTML = `<textarea class="reply-card-textarea" rows="4">${_escape(replyText)}</textarea>`;
        editBtn.textContent = '✓ 完成编辑';
        editBtn.classList.add('editing');
        // 再次点击切换回展示
        editBtn.addEventListener('click', () => {
          if (!editing) return;
          const ta = wrap.querySelector('.reply-card-textarea');
          replyText = ta.value;
          body.innerHTML = window.Markdown.render(replyText);
          editing = false;
          editBtn.textContent = '✎ 编辑后发送';
          editBtn.classList.remove('editing');
        }, { once: true });
      });

      return wrap;
    }
  }

  function _escape(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** 去除字符串开头的 emoji 图标及其后的空白（历史会话列表标题/摘要不展示前缀图标） */
  function _stripLeadingEmoji(s) {
    if (s == null) return '';
    return String(s)
      .replace(/^(?:[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]+\s*)+/u, '')
      .trimStart();
  }

  window.ChatComponent = ChatComponent;
})();
