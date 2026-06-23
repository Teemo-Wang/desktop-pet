/**
 * 自定义右键菜单
 */

(function() {
  class ContextMenu {
    constructor() {
      this.el = null;
      this.isVisible = false;
      this.onAction = null;
      this._createDOM();
      this._bindEvents();
    }

    _createDOM() {
      this.el = document.createElement('div');
      this.el.className = 'context-menu';
      this.el.innerHTML = `
        <div class="menu-group">
          <div class="menu-item" data-action="ai-chat">
            <span class="menu-icon">🤖</span>
            <span class="menu-label">AI 助手</span>
          </div>
          <div class="menu-item" data-action="dingtalk">
            <span class="menu-icon">💬</span>
            <span class="menu-label">钉钉消息</span>
            <span class="menu-badge" id="dingtalkBadge">2</span>
          </div>
          <div class="menu-item" data-action="yuque">
            <span class="menu-icon">📄</span>
            <span class="menu-label">语雀文档</span>
          </div>
          <div class="menu-item" data-action="notifications">
            <span class="menu-icon">🔔</span>
            <span class="menu-label">消息提醒</span>
            <span class="menu-badge" id="notifBadge">3</span>
          </div>
        </div>
        <div class="menu-divider"></div>
        <div class="menu-group">
          <div class="menu-item" data-action="settings">
            <span class="menu-icon">⚙️</span>
            <span class="menu-label">设置</span>
          </div>
          <div class="menu-item" data-action="about">
            <span class="menu-icon">ℹ️</span>
            <span class="menu-label">关于桌宠</span>
          </div>
        </div>
        <div class="menu-divider"></div>
        <div class="menu-group">
          <div class="menu-item menu-item-danger" data-action="quit">
            <span class="menu-icon">⏻</span>
            <span class="menu-label">退出应用</span>
          </div>
        </div>
      `;
      document.body.appendChild(this.el);
    }

    _bindEvents() {
      this.el.addEventListener('click', (e) => {
        const item = e.target.closest('.menu-item');
        if (!item) return;
        this.hide();
        if (this.onAction) this.onAction(item.dataset.action);
      });

      document.addEventListener('mousedown', (e) => {
        if (this.isVisible && !this.el.contains(e.target)) this.hide();
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isVisible) this.hide();
      });
    }

    show(x, y) {
      this.el.style.visibility = 'hidden';
      this.el.classList.add('visible');
      const menuW = this.el.offsetWidth;
      const menuH = this.el.offsetHeight;
      let posX = Math.min(x, window.innerWidth - menuW - 8);
      let posY = y + menuH > window.innerHeight ? y - menuH : y;
      if (posX < 8) posX = 8;
      if (posY < 8) posY = 8;
      this.el.style.left = posX + 'px';
      this.el.style.top = posY + 'px';
      this.el.style.visibility = '';
      this.isVisible = true;
    }

    hide() {
      this.el.classList.remove('visible');
      this.isVisible = false;
    }

    updateBadge(type, count) {
      const id = type === 'dingtalk' ? 'dingtalkBadge' : 'notifBadge';
      const badge = document.getElementById(id);
      if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? '' : 'none';
      }
    }
  }

  window.ContextMenu = ContextMenu;
})();
