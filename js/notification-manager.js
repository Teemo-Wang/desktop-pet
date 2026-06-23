/**
 * 消息提醒管理器
 * 统一管理：提醒节流、免打扰、气泡展示、未读数、动作反馈
 */

(function() {

  class NotificationManager {
    constructor() {
      // 状态
      this.unreadCount = 0;
      this.lastNotifyTime = 0;
      this.pendingCount = 0;       // 节流期间累积的消息数
      this.throttleTimer = null;
      this.bubbleTimer = null;
      this.pollTimer = null;

      // 配置（从 settings 读取）
      this.enabled = true;
      this.dndEnabled = false;
      this.dndStart = '22:00';
      this.dndEnd = '08:00';
      this.throttleInterval = 5 * 60 * 1000; // 5分钟合并提醒
      this.bubbleDuration = 6000;             // 气泡显示6秒
      this.pollInterval = 30 * 1000;          // 30秒轮询一次

      // 回调
      this.onNotify = null;         // (count) => void  触发提醒
      this.onBadgeUpdate = null;    // (count) => void  更新badge
      this.onPetReaction = null;    // (type) => void   桌宠动作
      this.onBubbleShow = null;     // (text) => void   显示气泡
      this.onBubbleHide = null;     // () => void       隐藏气泡

      // DOM
      this._createBubble();
    }

    /**
     * 从设置加载配置
     */
    configure(workSettings) {
      this.enabled = workSettings.dingtalkNotify;
      this.dndEnabled = workSettings.dndEnabled;
      this.dndStart = workSettings.dndStart;
      this.dndEnd = workSettings.dndEnd;
    }

    /**
     * 启动轮询检查新消息
     * @param {Function} fetchUnread - 异步函数，返回当前未读数
     */
    startPolling(fetchUnread) {
      this._fetchUnread = fetchUnread;
      this._poll();
      this.pollTimer = setInterval(() => this._poll(), this.pollInterval);
    }

    /**
     * 停止轮询
     */
    stopPolling() {
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
    }

    /**
     * 手动触发检查（如用户操作后）
     */
    async checkNow() {
      await this._poll();
    }

    /**
     * 标记全部已读
     */
    clearUnread() {
      this.unreadCount = 0;
      this.pendingCount = 0;
      this._updateBadge(0);
      this._hideBubble();
    }

    /**
     * 销毁
     */
    destroy() {
      this.stopPolling();
      if (this.bubbleTimer) clearTimeout(this.bubbleTimer);
      if (this.throttleTimer) clearTimeout(this.throttleTimer);
    }

    // ===== 内部方法 =====

    async _poll() {
      if (!this._fetchUnread) return;

      try {
        const newCount = await this._fetchUnread();

        // 有新消息
        if (newCount > this.unreadCount) {
          const delta = newCount - this.unreadCount;
          this.unreadCount = newCount;
          this._onNewMessages(delta);
        } else {
          this.unreadCount = newCount;
        }

        this._updateBadge(this.unreadCount);
      } catch (e) {
        // 静默失败，下次重试
      }
    }

    _onNewMessages(count) {
      // 检查是否启用
      if (!this.enabled) return;

      // 检查免打扰
      if (this._isDND()) return;

      // 节流：累积消息数
      this.pendingCount += count;

      // 如果在节流期内，等待合并
      const now = Date.now();
      const elapsed = now - this.lastNotifyTime;

      if (elapsed < this.throttleInterval && this.lastNotifyTime > 0) {
        // 还在节流期，设置延迟触发
        if (!this.throttleTimer) {
          const remaining = this.throttleInterval - elapsed;
          this.throttleTimer = setTimeout(() => {
            this._fireNotification();
            this.throttleTimer = null;
          }, remaining);
        }
      } else {
        // 超过节流期，立即触发
        this._fireNotification();
      }
    }

    _fireNotification() {
      const count = this.pendingCount;
      this.pendingCount = 0;
      this.lastNotifyTime = Date.now();

      if (count <= 0) return;

      // 1. 显示气泡
      const text = count === 1 ? '你有 1 条新消息' : `你有 ${count} 条新消息`;
      this._showBubble(text);

      // 2. 桌宠动作反馈
      if (this.onPetReaction) this.onPetReaction('message');

      // 3. 回调
      if (this.onNotify) this.onNotify(count);
    }

    _showBubble(text) {
      if (this.bubbleEl) {
        this.bubbleEl.textContent = text;
        this.bubbleEl.classList.add('visible');
      }
      if (this.onBubbleShow) this.onBubbleShow(text);

      // 自动隐藏
      if (this.bubbleTimer) clearTimeout(this.bubbleTimer);
      this.bubbleTimer = setTimeout(() => this._hideBubble(), this.bubbleDuration);
    }

    _hideBubble() {
      if (this.bubbleEl) this.bubbleEl.classList.remove('visible');
      if (this.onBubbleHide) this.onBubbleHide();
    }

    _updateBadge(count) {
      if (this.onBadgeUpdate) this.onBadgeUpdate(count);
    }

    _isDND() {
      if (!this.dndEnabled) return false;

      const now = new Date();
      const h = now.getHours();
      const m = now.getMinutes();
      const current = h * 60 + m;

      const [startH, startM] = this.dndStart.split(':').map(Number);
      const [endH, endM] = this.dndEnd.split(':').map(Number);
      const start = startH * 60 + startM;
      const end = endH * 60 + endM;

      // 跨午夜情况（如 22:00 - 08:00）
      if (start > end) {
        return current >= start || current < end;
      }
      return current >= start && current < end;
    }

    _createBubble() {
      // 复用已有的 speechBubble，或创建专用通知气泡
      this.bubbleEl = document.getElementById('notifyBubble');
      if (!this.bubbleEl) {
        this.bubbleEl = document.createElement('div');
        this.bubbleEl.id = 'notifyBubble';
        this.bubbleEl.className = 'notify-bubble';
        // 插入到 app 中
        setTimeout(() => {
          const app = document.querySelector('.app');
          if (app) app.appendChild(this.bubbleEl);
        }, 0);
      }
    }
  }

  window.NotificationManager = NotificationManager;
})();
