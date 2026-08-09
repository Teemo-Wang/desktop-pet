/** Read-only Creative Profile page with an independent enable switch. */
(function (root, factory) {
  const Center = factory();
  if (root) root.TeemoCreativeProfileCenter = Center;
  if (typeof window !== 'undefined') window.TeemoCreativeProfileCenter = Center;
  if (typeof module === 'object' && module.exports) module.exports = Center;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  class TeemoCreativeProfileCenter {
    constructor(options = {}) {
      this.service = options.service || null;
      this.onBack = typeof options.onBack === 'function' ? options.onBack : () => {};
      this.snapshot = null;
      this.selectedDomain = 'general';
      this.busy = false;
      this.els = this._elements();
      this._bind();
    }

    _elements() {
      const get = id => document.getElementById(id);
      return {
        back: get('TeemoCreativeBackButton'),
        enabled: get('TeemoCreativeEnabled'),
        version: get('TeemoCreativeVersion'),
        status: get('TeemoCreativeStatus'),
        principles: get('TeemoCreativePrinciples'),
        dimensions: get('TeemoCreativeDimensions'),
        domains: get('TeemoCreativeDomains'),
        domainDetail: get('TeemoCreativeDomainDetail'),
      };
    }

    _bind() {
      if (this.els.back) this.els.back.addEventListener('click', () => this.onBack());
      if (this.els.enabled) this.els.enabled.addEventListener('change', () => this._setEnabled(this.els.enabled.checked));
      if (this.els.domains) this.els.domains.addEventListener('click', event => {
        const button = event.target.closest('[data-creative-domain]');
        if (!button) return;
        this.selectedDomain = button.dataset.creativeDomain || 'general';
        this._renderDomains();
      });
    }

    show() {
      this.refresh();
    }

    refresh(message = '') {
      if (!this.service || typeof this.service.getManagementSnapshot !== 'function') {
        this._setStatus('Creative Profile Service 暂不可用', true);
        return;
      }
      try {
        this.snapshot = this.service.getManagementSnapshot();
        this.render();
        if (message) this._setStatus(message);
      } catch (error) {
        this._setStatus(error.message || '读取设计判断失败', true);
      }
    }

    render() {
      if (!this.snapshot) return;
      const { state, profile } = this.snapshot;
      if (this.els.enabled) this.els.enabled.checked = state.enabled !== false;
      if (state.readError) this._setStatus(state.readError.message || '设计判断状态读取失败，已安全停用', true);
      if (this.els.version) this.els.version.textContent = `Profile ${profile.profileVersion}`;
      if (this.els.principles) {
        this.els.principles.innerHTML = profile.principles.map((item, index) => `
          <article class="teemo-creative-principle">
            <span>${String(index + 1).padStart(2, '0')}</span>
            <div><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.summary)}</p></div>
          </article>
        `).join('');
      }
      if (this.els.dimensions) {
        this.els.dimensions.innerHTML = profile.dimensions.map(item => `
          <div class="teemo-creative-dimension">
            <div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.description)}</span></div>
            <div class="teemo-creative-weight"><i style="--teemo-weight:${Number(item.weight) || 0}%"></i></div>
            <em>${Number(item.weight) || 0}</em>
          </div>
        `).join('');
      }
      this._renderDomains();
    }

    _renderDomains() {
      if (!this.snapshot) return;
      const lenses = this.snapshot.profile.domainLenses || {};
      const lens = lenses[this.selectedDomain] || lenses.general;
      this.selectedDomain = lens.id;
      if (this.els.domains) {
        this.els.domains.innerHTML = Object.values(lenses).map(item => `
          <button type="button" class="${item.id === lens.id ? 'active' : ''}" data-creative-domain="${escapeHtml(item.id)}">${escapeHtml(item.name)}</button>
        `).join('');
      }
      if (this.els.domainDetail) {
        this.els.domainDetail.innerHTML = `
          <div><span>${escapeHtml(lens.id.toUpperCase())}</span><h3>${escapeHtml(lens.name)}判断重点</h3></div>
          <ul>${lens.focus.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
        `;
      }
    }

    _setEnabled(enabled) {
      if (this.busy || !this.snapshot) return;
      this.busy = true;
      if (this.els.enabled) this.els.enabled.disabled = true;
      try {
        const result = this.service.setEnabled(enabled, { expectedRevision: this.snapshot.state.revision });
        if (!result || !result.ok) {
          if (result && result.snapshot) this.snapshot = result.snapshot;
          this.render();
          this._setStatus(result && result.message ? result.message : '更新失败', true);
          return;
        }
        this.snapshot = result.snapshot;
        this.render();
        this._setStatus(enabled ? 'Teemo 设计判断已启用' : 'Teemo 设计判断已关闭');
      } catch (error) {
        this.refresh();
        this._setStatus(error.message || '更新失败', true);
      } finally {
        this.busy = false;
        if (this.els.enabled) this.els.enabled.disabled = false;
      }
    }

    _setStatus(message, error = false) {
      if (!this.els.status) return;
      this.els.status.textContent = message || '';
      this.els.status.classList.toggle('error', Boolean(error));
    }
  }

  return TeemoCreativeProfileCenter;
});
