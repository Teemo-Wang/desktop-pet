(function (root, factory) {
  const Center = factory();
  if (root) root.TeemoInspirationCenter = Center;
  if (typeof window !== 'undefined') window.TeemoInspirationCenter = Center;
  if (typeof module === 'object' && module.exports) module.exports = Center;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  class TeemoInspirationCenter {
    constructor(options = {}) {
      this.service = options.service || null;
      this.onBack = typeof options.onBack === 'function' ? options.onBack : () => {};
      const get = id => document.getElementById(id);
      this.els = {
        back: get('TeemoInspirationBackButton'),
        enabled: get('TeemoInspirationEnabled'),
        refresh: get('TeemoInspirationRefreshButton'),
        status: get('TeemoInspirationStatus'),
        stateLabel: get('TeemoInspirationStateLabel'),
        sourceCount: get('TeemoInspirationSourceCount'),
        sourceList: get('TeemoInspirationSourceList'),
      };
      this.snapshot = null;
      this.busy = false;
      this._bind();
    }

    _bind() {
      if (this.els.back) this.els.back.addEventListener('click', () => this.onBack());
      if (this.els.refresh) this.els.refresh.addEventListener('click', () => this.refresh('状态已刷新'));
      if (this.els.enabled) this.els.enabled.addEventListener('change', () => this._setEnabled(this.els.enabled.checked));
    }

    show() {
      this.refresh();
    }

    refresh(message = '') {
      if (!this.service || typeof this.service.getManagementSnapshot !== 'function') {
        this._setStatus('Inspiration Service 暂不可用', true);
        return;
      }
      try {
        this.snapshot = this.service.getManagementSnapshot();
        this.render();
        const stateError = this.snapshot.state && this.snapshot.state.stateError;
        if (stateError) this._setStatus(stateError.message || '灵感系统状态无法读取，已安全停用', true);
        else if (message) this._setStatus(message);
        else this._setStatus('');
      } catch (_) {
        this._setStatus('灵感系统暂不可用', true);
      }
    }

    render() {
      if (!this.snapshot) return;
      const state = this.snapshot.state || {};
      const unreadable = Boolean(state.stateError);
      const enabled = !unreadable && state.enabled === true;
      const sources = Array.isArray(this.snapshot.sources) ? this.snapshot.sources : [];
      if (this.els.enabled) {
        this.els.enabled.checked = enabled;
        this.els.enabled.disabled = unreadable || this.busy;
      }
      if (this.els.refresh) this.els.refresh.disabled = this.busy;
      if (this.els.stateLabel) {
        this.els.stateLabel.textContent = unreadable ? '安全停用' : enabled ? '基础能力已启用' : '当前停用';
        this.els.stateLabel.dataset.state = unreadable ? 'error' : enabled ? 'enabled' : 'disabled';
      }
      if (this.els.sourceCount) this.els.sourceCount.textContent = String(sources.length);
      if (this.els.sourceList) {
        this.els.sourceList.innerHTML = sources.length
          ? sources.map(source => `<div class="teemo-inspiration-source"><strong>${this._escape(source.displayName)}</strong><span>${this._escape(source.kind)}</span></div>`).join('')
          : '<div class="teemo-inspiration-empty"><strong>当前没有已连接的素材来源</strong><p>本阶段只建立安全基础，尚未连接本地或在线素材来源。</p></div>';
      }
    }

    _setEnabled(enabled) {
      if (this.busy || !this.snapshot) return;
      this.busy = true;
      this.render();
      try {
        const result = this.service.setEnabled(enabled, { expectedRevision: this.snapshot.state.revision });
        if (!result || !result.ok) {
          if (result && result.snapshot) this.snapshot = result.snapshot;
          this.render();
          this._setStatus(result && result.error ? result.error.message : '设置失败', true);
          return;
        }
        this.snapshot = result.snapshot;
        this.render();
        this._setStatus(enabled ? '灵感基础能力已启用' : '灵感基础能力已停用');
      } catch (_) {
        this.refresh();
        this._setStatus('设置失败，请刷新后重试', true);
      } finally {
        this.busy = false;
        this.render();
      }
    }

    _setStatus(message, error = false) {
      if (!this.els.status) return;
      this.els.status.textContent = message || '';
      this.els.status.classList.toggle('error', Boolean(error));
    }

    _escape(value) {
      return String(value == null ? '' : value).replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
      })[character]);
    }
  }

  return TeemoInspirationCenter;
});
