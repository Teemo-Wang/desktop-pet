/**
 * 桌宠交互组件
 * 拖拽移动 DOM 位置（全屏窗口内自由移动）；支持贴边收纳：
 *   - 拖到左/右屏幕边缘外触发吸附，IP 仅露出一半
 *   - 收纳状态下单击 → 弹回到屏幕内，再次单击 → 走 onClick（打开 dock）
 */
(function() {
  const { ipcRenderer } = require('electron');

  // IP 容器尺寸（与 CSS 宽 130 / 高 150 + 阴影 一致）
  const PET_W = 130;
  const PET_H = 170;
  const HALF_W = PET_W / 2;
  // 吸附触发阈值：中心点距屏幕边缘多近时触发
  const DOCK_TRIGGER = 30;
  // 弹出后停靠位置距边缘
  const UNDOCK_INSET = 16;
  // 过渡动画时长（与 CSS 对应）
  const ANIM_MS = 280;

  class PetComponent {
    constructor() {
      this.el = document.getElementById('petArea');
      this.img = this.el.querySelector('.pet-image');
      this.hoverBubble = document.getElementById('hoverBubble');
      this.onClick = null;
      this.onRightClick = null;
      this._dragging = false;
      this._downTime = 0;
      this._lx = 0; this._ly = 0;
      this._docked = null;     // null | 'left' | 'right'
      this._animTimer = null;

      // 初始位置：右下角（兜底用屏幕宽，避免 innerWidth 还未就绪时算出 0）
      this._initPosition();

      this._bind();

      // window 完全加载后再校正一次位置，防止首屏 innerWidth 为 0 导致桌宠卡左上角
      if (document.readyState === 'complete') {
        // 已加载完成，下一帧再校正
        requestAnimationFrame(() => this._initPosition());
      } else {
        window.addEventListener('load', () => this._initPosition(), { once: true });
      }
    }

    /** 初始化/重置位置到右下角 */
    _initPosition() {
      const w = window.innerWidth || screen.width || 1440;
      const h = window.innerHeight || screen.height || 900;
      this._posX = w - PET_W - 32;
      this._posY = h - PET_H - 32;
      // 防御：如果算出来还是负数（极端情况），强行放到 100,100
      if (this._posX < 0 || this._posY < 0) {
        this._posX = Math.max(100, this._posX);
        this._posY = Math.max(100, this._posY);
      }
      this._clampPosition(false);
      this._updatePosition();
      console.log('[pet] 初始化位置:', this._posX, this._posY, '窗口:', w, 'x', h);
    }

    /**
     * 限制位置
     * @param {boolean} allowOverhang - 拖拽中允许越界半屏，便于触发吸附
     */
    _clampPosition(allowOverhang) {
      // 兜底：window 尺寸异常时直接跳过 clamp，避免把桌宠夹到 0,0
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (!w || !h) return;

      if (allowOverhang) {
        this._posX = Math.max(-HALF_W, Math.min(w - HALF_W, this._posX));
      } else {
        this._posX = Math.max(0, Math.min(w - PET_W - 10, this._posX));
      }
      this._posY = Math.max(0, Math.min(h - PET_H, this._posY));
    }

    _updatePosition() {
      this.el.style.left = this._posX + 'px';
      this.el.style.top = this._posY + 'px';
      this.el.style.right = 'auto';
      this.el.style.bottom = 'auto';
      this.el.style.transform = 'none';
      this._syncPanelPosition();
    }

    /** 给 IP 加过渡动画（吸附 / 弹回时调用） */
    _animate() {
      this.el.classList.add('pet-anim');
      if (this._animTimer) clearTimeout(this._animTimer);
      this._animTimer = setTimeout(() => {
        this.el.classList.remove('pet-anim');
        this._animTimer = null;
      }, ANIM_MS + 40);
    }

    /** 吸附到屏幕边缘 */
    _dock(side) {
      this._docked = side;
      this.el.classList.add('docked');
      this.el.classList.toggle('docked-left', side === 'left');
      this.el.classList.toggle('docked-right', side === 'right');
      this._posX = side === 'left' ? -HALF_W : window.innerWidth - HALF_W;
      // 收纳期间隐藏 hover 气泡
      if (this.hoverBubble) this.hoverBubble.classList.remove('visible');
      this._animate();
      this._updatePosition();
    }

    /** 弹回到屏幕内 */
    _undock() {
      if (!this._docked) return;
      const side = this._docked;
      this._docked = null;
      this.el.classList.remove('docked', 'docked-left', 'docked-right');
      this._posX = side === 'left' ? UNDOCK_INSET : window.innerWidth - PET_W - UNDOCK_INSET;
      this._animate();
      this._updatePosition();
    }

    _syncPanelPosition() {
      const panels = document.querySelectorAll('.panel');
      const dock = document.getElementById('quickDock');
      const bubbles = [document.getElementById('notifyBubble'), document.getElementById('hoverBubble')];

      // 收纳态下 IP 位置含负值，面板也要同步（虽然此时通常不会打开面板）
      const panelLeft = Math.max(0, this._posX + (PET_W / 2) - 170);
      // 面板底（=dock 顶）距 IP 顶的间距：值越大间距越大
      const PANEL_GAP = 56;
      const panelBottom = window.innerHeight - this._posY + PANEL_GAP;

      panels.forEach(p => {
        p.style.left = panelLeft + 'px';
        p.style.right = 'auto';
        p.style.bottom = panelBottom + 'px';
      });

      if (dock) {
        dock.style.left = panelLeft + 'px';
        dock.style.right = 'auto';
        dock.style.bottom = (panelBottom - 36) + 'px';
      }

      const sd = document.getElementById('systemDock');
      if (sd) {
        sd.style.left = panelLeft + 'px';
        sd.style.right = 'auto';
        sd.style.bottom = (panelBottom - 36) + 'px';
      }

      bubbles.forEach(b => {
        if (!b) return;
        b.style.left = (this._posX + (PET_W / 2)) + 'px';
        b.style.right = 'auto';
        b.style.bottom = (window.innerHeight - this._posY + 4) + 'px';
        b.style.transform = 'translateX(-50%)';
      });

      // 今日简报卡片同步：IP 上方居中（与 DailyBriefCard._syncPosition 保持一致）
      const brief = document.getElementById('dailyBriefCard');
      if (brief) {
        const cardW = 320;
        const briefLeft = Math.max(8, this._posX + (PET_W / 2) - cardW / 2);
        brief.style.left = Math.min(briefLeft, window.innerWidth - cardW - 8) + 'px';
        brief.style.right = 'auto';
        brief.style.bottom = (window.innerHeight - this._posY + 12) + 'px';
      }
    }

    _bind() {
      // 鼠标穿透状态去重，避免重渲时频繁切换 IPC 导致窗口失焦
      let lastInside = null;
      // 鼠标穿透控制 + 拖拽
      document.addEventListener('mousemove', (e) => {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const insideContent = !!(el && el !== document.body && el !== document.documentElement && !el.classList.contains('app'));
        if (insideContent !== lastInside) {
          lastInside = insideContent;
          ipcRenderer.send(insideContent ? 'mouse-enter-content' : 'mouse-leave-content');
        }

        // 拖拽
        if (this._downTime === 0) return;
        const dx = e.clientX - this._lx;
        const dy = e.clientY - this._ly;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          this._dragging = true;
          this._posX += dx;
          this._posY += dy;
          this._lx = e.clientX;
          this._ly = e.clientY;
          // 拖拽中允许越界，预览吸附
          this._clampPosition(true);
          this._updatePosition();

          // 实时给一个候选反馈：将要吸附时 IP 加 will-dock 标记
          const centerX = this._posX + HALF_W;
          this.el.classList.toggle('will-dock-left', centerX < DOCK_TRIGGER);
          this.el.classList.toggle('will-dock-right', centerX > window.innerWidth - DOCK_TRIGGER);
        }
      });

      this.el.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        this._downTime = Date.now();
        this._dragging = false;
        this._lx = e.clientX;
        this._ly = e.clientY;
      });

      document.addEventListener('mouseup', () => {
        if (this._downTime === 0) return;
        const elapsed = Date.now() - this._downTime;
        const wasDragging = this._dragging;
        this._downTime = 0;
        this._dragging = false;
        // 清除候选标记
        this.el.classList.remove('will-dock-left', 'will-dock-right');

        if (wasDragging) {
          // 拖拽结束：判断是否吸附
          const centerX = this._posX + HALF_W;
          if (centerX < DOCK_TRIGGER) {
            this._dock('left');
          } else if (centerX > window.innerWidth - DOCK_TRIGGER) {
            this._dock('right');
          } else {
            // 不在吸附区：如果之前是 docked，也认为用户拖出，清掉
            if (this._docked) {
              this._docked = null;
              this.el.classList.remove('docked', 'docked-left', 'docked-right');
            }
            this._clampPosition(false);
            this._animate();
            this._updatePosition();
          }
          return;
        }

        // 单击：收纳状态先弹出，否则触发 onClick
        if (elapsed < 300) {
          if (this._docked) {
            this._undock();
          } else if (this.onClick) {
            this.onClick();
          }
        }
      });

      this.el.addEventListener('contextmenu', e => {
        e.preventDefault();
        if (this.onRightClick) this.onRightClick(e.clientX, e.clientY);
      });

      this.el.addEventListener('mouseenter', () => {
        if (this._docked) return; // 收纳态不显示提示气泡
        const dock = document.getElementById('quickDock');
        const hasPanel = document.querySelector('.panel.open');
        if ((dock && dock.classList.contains('visible')) || hasPanel) return;
        if (this.hoverBubble) this.hoverBubble.classList.add('visible');
      });
      this.el.addEventListener('mouseleave', () => {
        if (this.hoverBubble) this.hoverBubble.classList.remove('visible');
      });

      // 窗口尺寸变化时，docked 位置需要校正
      window.addEventListener('resize', () => {
        if (this._docked === 'right') {
          this._posX = window.innerWidth - HALF_W;
        }
        this._clampPosition(!!this._docked);
        this._updatePosition();
      });
    }

    react(type) {
      this.img.classList.add('react-' + (type || 'bounce'));
      setTimeout(() => this.img.classList.remove('react-' + (type || 'bounce')), 600);
    }

    hideHoverBubble() { if (this.hoverBubble) this.hoverBubble.classList.remove('visible'); }

    /** 外部查询：是否处于收纳态 */
    isDocked() { return !!this._docked; }
  }
  window.PetComponent = PetComponent;
})();
