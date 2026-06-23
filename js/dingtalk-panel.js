/**
 * 钉钉消息面板
 * 展示会话列表 + 消息详情 + 需求分析入口
 */

(function() {

  class DingTalkPanel {
    constructor() {
      this.service = new window.DingTalkService();
      this.el = null;
      this.isOpen = false;
      this.currentView = 'list';
      this.currentConvId = null;
      this._createDOM();
    }

    _createDOM() {
      this.el = document.createElement('div');
      this.el.id = 'dingtalkPanel';
      this.el.className = 'dingtalk-panel';
      document.querySelector('.app').appendChild(this.el);
    }

    async open() {
      this.isOpen = true;
      this.currentView = 'list';
      await this._renderList();
      this.el.classList.add('open');
    }

    close() {
      this.isOpen = false;
      this.el.classList.remove('open');
    }

    async _renderList() {
      const convs = await this.service.getConversations();
      const totalUnread = convs.reduce((s, c) => s + c.unreadCount, 0);

      this.el.innerHTML = `
        <div class="dt-header">
          <span class="dt-title">💬 钉钉消息</span>
          <span class="dt-unread-total">${totalUnread ? totalUnread + ' 条未读' : '全部已读'}</span>
          <button class="dt-close" id="dtClose">✕</button>
        </div>
        <div class="dt-status">
          <span class="dt-status-dot connected"></span>
          <span class="dt-status-text">${this.service.getUserInfo()?.name || '已连接'}</span>
        </div>
        <div class="dt-list">
          ${convs.map(c => this._renderConvItem(c)).join('')}
        </div>
      `;

      this._bindListEvents();
    }

    _renderConvItem(conv) {
      const isGroup = conv.chatType === window.DINGTALK_CHAT_TYPE.GROUP;
      const avatarText = conv.chatName.charAt(0);
      const avatarColor = isGroup ? '#0076FF' : '#00B365';

      return `
        <div class="dt-conv-item ${conv.unreadCount > 0 ? 'unread' : ''}" data-id="${conv.id}">
          <div class="dt-avatar" style="background:${avatarColor}">
            ${isGroup ? '群' : avatarText}
          </div>
          <div class="dt-conv-info">
            <div class="dt-conv-top">
              <span class="dt-conv-name">${conv.chatName}</span>
              <span class="dt-conv-time">${conv.lastMessage.timeLabel}</span>
            </div>
            <div class="dt-conv-bottom">
              <span class="dt-conv-summary">${isGroup ? conv.lastMessage.sender + ': ' : ''}${conv.lastMessage.content}</span>
              ${conv.unreadCount > 0 ? `<span class="dt-conv-badge">${conv.unreadCount}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }

    async _renderDetail(convId) {
      this.currentConvId = convId;
      this.currentView = 'detail';
      const messages = await this.service.getMessages(convId);
      const conv = (await this.service.getConversations()).find(c => c.id === convId);

      await this.service.markAsRead(convId);

      this.el.innerHTML = `
        <div class="dt-header">
          <button class="dt-back" id="dtBack">‹</button>
          <span class="dt-title">${conv.chatName}</span>
          <button class="dt-close" id="dtClose">✕</button>
        </div>
        <div class="dt-messages">
          ${messages.map(m => `
            <div class="dt-msg">
              <div class="dt-msg-sender">${m.sender}</div>
              <div class="dt-msg-content">${m.content}</div>
              <div class="dt-msg-time">${m.timeLabel}</div>
            </div>
          `).join('')}
        </div>
        <div class="dt-actions">
          <button class="dt-action-btn" data-action="summarize">📝 总结消息</button>
          <button class="dt-action-btn primary" data-action="analyze">🔍 需求分析</button>
        </div>
      `;

      this._bindDetailEvents(conv);
    }

    _bindListEvents() {
      this.el.querySelector('#dtClose').addEventListener('click', () => this.close());
      this.el.querySelectorAll('.dt-conv-item').forEach(item => {
        item.addEventListener('click', () => this._renderDetail(item.dataset.id));
      });
    }

    _bindDetailEvents(conv) {
      this.el.querySelector('#dtClose').addEventListener('click', () => this.close());
      this.el.querySelector('#dtBack').addEventListener('click', () => this._renderList());

      this.el.querySelectorAll('.dt-action-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const action = btn.dataset.action;
          // 派发事件，由 app.js 处理
          document.dispatchEvent(new CustomEvent('dingtalk-action', {
            detail: { action, conversation: conv }
          }));
        });
      });
    }

    async getUnreadCount() {
      return this.service.getUnreadCount();
    }
  }

  window.DingTalkPanel = DingTalkPanel;
})();
