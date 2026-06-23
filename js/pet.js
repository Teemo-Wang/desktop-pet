/**
 * IP 形象交互
 */

(function() {
  const { ipcRenderer } = require('electron');

  class Pet {
    constructor() {
      this.area = document.getElementById('petArea');
      this.bubble = document.getElementById('speechBubble');
      this.isDragging = false;
      this.mouseDownTime = 0;
      this.lastX = 0;
      this.lastY = 0;
      this.onClick = null;
      this.onRightClick = null;
      this._bind();
    }

    _bind() {
      this.area.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        this.mouseDownTime = Date.now();
        this.isDragging = false;
        this.lastX = e.screenX;
        this.lastY = e.screenY;
      });

      document.addEventListener('mousemove', (e) => {
        if (this.mouseDownTime === 0) return;
        const dx = e.screenX - this.lastX;
        const dy = e.screenY - this.lastY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          this.isDragging = true;
          ipcRenderer.send('move-window', { deltaX: dx, deltaY: dy });
          this.lastX = e.screenX;
          this.lastY = e.screenY;
        }
      });

      document.addEventListener('mouseup', () => {
        if (this.mouseDownTime === 0) return;
        const elapsed = Date.now() - this.mouseDownTime;
        if (!this.isDragging && elapsed < 300 && this.onClick) this.onClick();
        this.mouseDownTime = 0;
        this.isDragging = false;
      });

      this.area.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (this.onRightClick) this.onRightClick(e.clientX, e.clientY);
      });

      this.area.addEventListener('mouseenter', () => this.bubble.classList.add('visible'));
      this.area.addEventListener('mouseleave', () => this.bubble.classList.remove('visible'));
    }

    setBubbleVisible(v) {
      this.bubble.classList.toggle('visible', v);
    }
  }

  window.Pet = Pet;
})();
