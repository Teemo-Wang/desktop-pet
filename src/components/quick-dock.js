/**
 * 快捷标签 Dock
 * 左键点击桌宠后向上弹出的快捷入口
 */
(function() {

  class QuickDock {
    constructor(store) {
      this.store = store;
      this.el = null;
      this.indicator = null;
      this.isOpen = false;
      this.onSelect = null;
      this._createDOM();
      this._bind();
    }

    _getItems() {
      const custom = this.store.get('dock');
      if (custom && custom.items && custom.items.length > 0) return custom.items;
      return [
        { id: 'chat', icon: '🤖', label: 'AI' },
        { id: 'dingtalk', icon: '💬', label: '钉钉' },
        { id: 'yuque', icon: '📄', label: '语雀' },
        { id: 'todos', icon: '✅', label: '待办' },
        { id: 'skills', icon: '⚡', label: '技能' },
      ];
    }

    /** 按 dock 项 id 映射本地图标图片，找不到则用 emoji 兜底 */
    _iconHTML(item) {
      const map = {
        chat: 'icon/Ai.png',
        dingtalk: 'icon/钉钉.png',
        yuque: 'icon/语雀.png',
        todos: 'icon/待办.png',
        skills: 'icon/skill.png',
      };
      const src = map[item.id];
      if (src) {
        return `<img class="dock-item-img" src="${src}" alt="${item.label}" draggable="false">`;
      }
      // 兜底：保留 emoji
      return `<span class="dock-item-icon">${item.icon}</span>`;
    }

    _createDOM() {
      this.el = document.createElement('div');
      this.el.id = 'quickDock';
      this.el.className = 'quick-dock';
      // 滑动指示条
      this.indicator = document.createElement('div');
      this.indicator.className = 'dock-indicator';
      this.el.appendChild(this.indicator);
      document.querySelector('.app').appendChild(this.el);
    }

    _render() {
      const items = this._getItems();
      // 移除旧按钮
      this.el.querySelectorAll('.dock-item').forEach(b => b.remove());
      // 添加新按钮
      items.forEach((item) => {
        const btn = document.createElement('button');
        btn.className = 'dock-item';
        btn.dataset.action = item.id;
        btn.innerHTML = `${this._iconHTML(item)}<span class="dock-item-label">${item.label}</span><span class="dock-badge" data-badge="${item.id}" style="display:none"></span>`;
        this.el.appendChild(btn);
      });
    }

    open() {
      this._render();
      this.isOpen = true;
      this.el.classList.add('visible');
      const hb = document.getElementById('hoverBubble');
      if (hb) hb.classList.remove('visible');
    }

    close() {
      this.isOpen = false;
      this.el.classList.remove('visible');
    }

    toggle() { this.isOpen ? this.close() : this.open(); }

    // 更新指示条滑动到指定标签
    updateIndicator(actionId) {
      const btn = this.el.querySelector(`[data-action="${actionId}"]`);
      if (!btn) return;
      // 高亮
      this.el.querySelectorAll('.dock-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // 滑动指示条
      requestAnimationFrame(() => {
        this.indicator.style.left = (btn.offsetLeft + 8) + 'px';
        this.indicator.style.width = (btn.offsetWidth - 16) + 'px';
      });
    }

    _bind() {
      this.el.addEventListener('click', (e) => {
        const btn = e.target.closest('.dock-item');
        if (!btn) return;
        this.updateIndicator(btn.dataset.action);
        if (this.onSelect) this.onSelect(btn.dataset.action);
      });
    }

    // 设置标签 badge
    setBadge(actionId, count) {
      const badge = this.el.querySelector(`[data-badge="${actionId}"]`);
      if (!badge) return;
      if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.style.display = '';
      } else {
        badge.style.display = 'none';
      }
    }
  }

  window.QuickDock = QuickDock;
})();
