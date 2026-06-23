/**
 * 右键菜单组件
 */
(function() {
  class MenuComponent {
    constructor() {
      this.el = document.createElement('div');
      this.el.className = 'ctx-menu';
      this.el.innerHTML = `
        <div class="ctx-menu-group">
          <div class="ctx-menu-item" data-a="brief"><span class="ctx-menu-icon">📅</span><span class="ctx-menu-label">今日简报</span></div>
          <div class="ctx-menu-item" data-a="chat"><img class="ctx-menu-icon-img" src="icon/Ai.png" alt=""><span class="ctx-menu-label">AI 助手</span></div>
          <div class="ctx-menu-item" data-a="dingtalk"><img class="ctx-menu-icon-img" src="icon/钉钉.png" alt=""><span class="ctx-menu-label">钉钉消息</span><span class="ctx-menu-badge" id="badgeDT" style="display:none">0</span></div>
          <div class="ctx-menu-item" data-a="yuque"><img class="ctx-menu-icon-img" src="icon/语雀.png" alt=""><span class="ctx-menu-label">语雀文档</span></div>
          <div class="ctx-menu-item" data-a="todos"><img class="ctx-menu-icon-img" src="icon/待办.png" alt=""><span class="ctx-menu-label">待办清单</span><span class="ctx-menu-badge" id="badgeTodos" style="display:none">0</span></div>
          <div class="ctx-menu-item" data-a="skills"><img class="ctx-menu-icon-img" src="icon/skill.png" alt=""><span class="ctx-menu-label">技能中心</span></div>
        </div>
        <div class="ctx-menu-sep"></div>
        <div class="ctx-menu-group">
          <div class="ctx-menu-item" data-a="api"><span class="ctx-menu-icon">🔌</span><span class="ctx-menu-label">API 接入</span></div>
          <div class="ctx-menu-item" data-a="settings"><span class="ctx-menu-icon">⚙️</span><span class="ctx-menu-label">偏好设置</span></div>
          <div class="ctx-menu-item" data-a="about"><span class="ctx-menu-icon">ℹ️</span><span class="ctx-menu-label">关于</span></div>
        </div>
        <div class="ctx-menu-sep"></div>
        <div class="ctx-menu-group">
          <div class="ctx-menu-item danger" data-a="quit"><span class="ctx-menu-icon">⏻</span><span class="ctx-menu-label">退出</span></div>
        </div>`;
      document.body.appendChild(this.el);
      this.onAction = null;
      this.visible = false;
      this.el.addEventListener('click', e => { const i = e.target.closest('[data-a]'); if (i) { this.hide(); if (this.onAction) this.onAction(i.dataset.a); } });
      document.addEventListener('mousedown', e => { if (this.visible && !this.el.contains(e.target)) this.hide(); });
      document.addEventListener('click', e => { if (this.visible && !this.el.contains(e.target)) this.hide(); });
      // 鼠标移开菜单后短延迟关闭
      this.el.addEventListener('mouseleave', () => {
        this._leaveTimer = setTimeout(() => { if (this.visible) this.hide(); }, 1500);
      });
      this.el.addEventListener('mouseenter', () => {
        if (this._leaveTimer) clearTimeout(this._leaveTimer);
      });
    }

    show(x, y) {
      this.el.classList.add('visible');
      const w = this.el.offsetWidth, h = this.el.offsetHeight;
      this.el.style.left = Math.min(x, window.innerWidth - w - 6) + 'px';
      this.el.style.top = (y + h > window.innerHeight ? y - h : y) + 'px';
      this.visible = true;
    }

    hide() { this.el.classList.remove('visible'); this.visible = false; }

    setBadge(type, n) {
      const map = { dingtalk: 'badgeDT', todos: 'badgeTodos' };
      const el = document.getElementById(map[type]);
      if (el) { el.textContent = n; el.style.display = n > 0 ? '' : 'none'; }
    }
  }
  window.MenuComponent = MenuComponent;
})();
