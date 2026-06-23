/**
 * 面板拉伸组件
 * 纯 CSS 缩放，不调整窗口（窗口固定为最大尺寸）
 */
(function() {

  class PanelResizer {
    constructor() {
      this.dragging = false;
      this.dir = null;
      this.sx = 0; this.sy = 0;
      this.sw = 340; this.sh = 370;
      this.w = 340; this.h = 370;
      this.minW = 280; this.maxW = 580;
      this.minH = 180; this.maxH = 380;
      this._addHandles();
      this._listen();
    }

    _addHandles() {
      setTimeout(() => {
        document.querySelectorAll('.panel').forEach(p => {
          if (p.querySelector('.rz')) return;
          p.insertAdjacentHTML('beforeend', `
            <div class="rz rz-t"></div>
            <div class="rz rz-l"></div>
            <div class="rz rz-tl"></div>
          `);
        });

        // 双击边缘恢复默认大小
        document.addEventListener('dblclick', (e) => {
          if (!e.target.closest('.rz')) return;
          this.w = 340;
          this.h = 370;
          this._apply();
        });
      }, 100);
    }

    _listen() {
      document.addEventListener('mousedown', (e) => {
        const rz = e.target.closest('.rz');
        if (!rz) return;
        e.preventDefault();
        e.stopPropagation();
        this.dragging = true;
        this.sx = e.clientX; this.sy = e.clientY;
        const panel = document.querySelector('.panel.open') || document.querySelector('.panel');
        if (panel) {
          this.sw = panel.offsetWidth;
          this.sh = panel.offsetHeight;
          // 记录右边缘锚点（屏幕右侧到 panel 右边缘的距离）
          // 拉伸时保持右边缘不动，让视觉变成"从左向左扩展"
          const rect = panel.getBoundingClientRect();
          this.anchorRight = window.innerWidth - rect.right;
        }
        if (rz.classList.contains('rz-tl')) this.dir = 'tl';
        else if (rz.classList.contains('rz-t')) this.dir = 't';
        else this.dir = 'l';
      });

      document.addEventListener('mousemove', (e) => {
        if (!this.dragging) return;
        const dx = this.sx - e.clientX;
        const dy = this.sy - e.clientY;

        let newW = this.w, newH = this.h;
        if (this.dir === 't' || this.dir === 'tl') {
          newH = Math.max(this.minH, Math.min(this.maxH, this.sh + dy));
        }
        if (this.dir === 'l' || this.dir === 'tl') {
          newW = Math.max(this.minW, Math.min(this.maxW, this.sw + dx));
        }

        if (newW === this.w && newH === this.h) return;
        this.w = newW;
        this.h = newH;
        this._apply();
      });

      document.addEventListener('mouseup', () => {
        this.dragging = false;
        this.anchorRight = null;
      });
    }

    _apply() {
      // 如果是左/左上方向，按右边缘锚点反推 left；其他情况不动 left
      const useAnchor = (this.dir === 'l' || this.dir === 'tl') && this.anchorRight != null;
      const newLeft = useAnchor ? (window.innerWidth - this.w - this.anchorRight) : null;

      document.querySelectorAll('.panel').forEach(p => {
        p.style.width = this.w + 'px';
        p.style.height = this.h + 'px';
        p.style.maxHeight = this.h + 'px';
        if (newLeft != null) {
          p.style.left = newLeft + 'px';
          p.style.right = 'auto';
        }
      });
      const dock = document.getElementById('quickDock');
      if (dock) {
        dock.style.width = this.w + 'px';
        if (newLeft != null) {
          dock.style.left = newLeft + 'px';
          dock.style.right = 'auto';
        }
      }
      // 系统面板的底部装饰条（API/偏好设置）也跟着对齐
      const sysDock = document.getElementById('systemDock');
      if (sysDock) {
        sysDock.style.width = this.w + 'px';
        if (newLeft != null) {
          sysDock.style.left = newLeft + 'px';
          sysDock.style.right = 'auto';
        }
      }
    }
  }

  window.PanelResizer = PanelResizer;
})();
