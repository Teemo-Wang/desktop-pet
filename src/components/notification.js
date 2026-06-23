/**
 * 通知管理组件
 * 支持富内容气泡：显示发送人、消息摘要、来源图标
 */
(function() {

  class NotificationComponent {
    constructor() {
      this.bubble = document.getElementById('notifyBubble');
      this.timer = null;
      this.queue = [];       // 消息队列
      this.showing = false;
      this.lastNotify = 0;
      this.throttle = 10 * 1000; // 10秒节流（demo 用短一点）
      this.duration = 6000;      // 显示6秒
      this.onTap = null;         // 点击气泡回调
      this.showContent = true;   // 隐私设置：是否显示消息内容
      this._bindTap();
    }

    /**
     * 推送钉钉消息通知
     * @param {object} msg - { sender, content, chatName, type:'dingtalk' }
     */
    pushDingtalk(msg) {
      this.queue.push({
        icon: '💬',
        title: msg.sender || msg.chatName,
        content: msg.content,
        type: 'dingtalk',
      });
      this._processQueue();
    }

    /**
     * 推送语雀文档更新通知
     * @param {object} doc - { title, author, type:'yuque' }
     */
    pushYuque(doc) {
      this.queue.push({
        icon: '📄',
        title: doc.title,
        content: doc.author + ' 更新了文档',
        type: 'yuque',
      });
      this._processQueue();
    }

    /**
     * 推送通用文本通知
     */
    pushText(text) {
      this.queue.push({ icon: '🔔', title: '', content: text, type: 'general' });
      this._processQueue();
    }

    hide() {
      if (this.bubble) this.bubble.classList.remove('visible');
      this.showing = false;
    }

    _processQueue() {
      if (this.showing || this.queue.length === 0) return;

      // 如果有面板或 dock 打开，不弹通知
      const hasPanel = document.querySelector('.panel.open');
      const dock = document.getElementById('quickDock');
      if (hasPanel || (dock && dock.classList.contains('visible'))) {
        // 延迟重试
        setTimeout(() => this._processQueue(), 2000);
        return;
      }

      // 节流
      const now = Date.now();
      if (now - this.lastNotify < this.throttle && this.lastNotify > 0) {
        // 延迟处理
        setTimeout(() => this._processQueue(), this.throttle - (now - this.lastNotify));
        return;
      }

      this.lastNotify = now;
      this.showing = true;

      // 如果队列中有多条，合并显示
      if (this.queue.length > 1) {
        const count = this.queue.length;
        const first = this.queue[0];
        this._showRich(first.icon, `${count} 条新消息`, this.queue.map(q => q.content).slice(0, 2).join(' | '));
        this.queue = [];
      } else {
        const item = this.queue.shift();
        this._showRich(item.icon, item.title, item.content);
      }

      // 自动隐藏
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.hide();
        // 处理队列中剩余的
        setTimeout(() => this._processQueue(), 500);
      }, this.duration);
    }

    _showRich(icon, title, content) {
      if (!this.bubble) return;
      // 隐私模式：隐藏具体内容
      const displayTitle = this.showContent ? title : (title ? title.split('（')[0] : '');
      const displayContent = this.showContent ? content : '你收到了一条新消息';

      this.bubble.innerHTML = `
        <div class="notif-icon">${icon}</div>
        <div class="notif-body">
          ${displayTitle ? `<div class="notif-title">${displayTitle}</div>` : ''}
          <div class="notif-content">${displayContent}</div>
        </div>
      `;
      this.bubble.classList.add('visible');
    }

    _bindTap() {
      if (!this.bubble) return;
      this.bubble.addEventListener('click', () => {
        this.hide();
        if (this.onTap) this.onTap();
      });
    }
  }

  window.NotificationComponent = NotificationComponent;
})();
