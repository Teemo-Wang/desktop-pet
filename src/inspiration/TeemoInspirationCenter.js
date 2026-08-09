(function (root, factory) {
  const Center = factory();
  if (root) root.TeemoInspirationCenter = Center;
  if (typeof window !== 'undefined') window.TeemoInspirationCenter = Center;
  if (typeof module === 'object' && module.exports) module.exports = Center;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  class TeemoInspirationCenter {
    constructor(options = {}) {
      this.service = options.service || null;
      this.sourceClient = options.sourceClient || null;
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
        addFolder: get('TeemoInspirationAddFolderButton'),
        browser: get('TeemoInspirationBrowser'),
        browserTitle: get('TeemoInspirationBrowserTitle'),
        browserPath: get('TeemoInspirationBrowserPath'),
        browserBack: get('TeemoInspirationBrowserBack'),
        entryList: get('TeemoInspirationEntryList'),
        preview: get('TeemoInspirationPreview'),
      };
      this.snapshot = null;
      this.busy = false;
      this.activeSourceId = null;
      this.activeDirectory = '';
      this._bind();
    }

    _bind() {
      if (this.els.back) this.els.back.addEventListener('click', () => this.onBack());
      if (this.els.refresh) this.els.refresh.addEventListener('click', () => this.refresh('状态已刷新'));
      if (this.els.enabled) this.els.enabled.addEventListener('change', () => this._setEnabled(this.els.enabled.checked));
      if (this.els.addFolder) this.els.addFolder.addEventListener('click', () => this._addFolder());
      if (this.els.browserBack) this.els.browserBack.addEventListener('click', () => this._browseParent());
    }

    show() {
      this.refresh();
    }

    async refresh(message = '') {
      if (!this.service || typeof this.service.getManagementSnapshot !== 'function') {
        this._setStatus('Inspiration Service 暂不可用', true);
        return;
      }
      try {
        const base = this.service.getManagementSnapshot();
        const localFolderAvailable = Array.isArray(base.connectors)
          && base.connectors.some(connector => connector.connectorId === 'local-folder');
        let sourceSnapshot = { revision: 0, sources: [] };
        if (localFolderAvailable && this.sourceClient && typeof this.sourceClient.listSources === 'function') {
          sourceSnapshot = await this.sourceClient.listSources();
        }
        this.snapshot = {
          ...base,
          sources: Array.isArray(sourceSnapshot.sources) ? sourceSnapshot.sources : [],
          sourceRevision: Number(sourceSnapshot.revision) || 0,
          sourceStateError: sourceSnapshot.stateError || null,
          localFolderAvailable,
        };
        this.render();
        const stateError = this.snapshot.state && this.snapshot.state.stateError;
        if (stateError) this._setStatus(stateError.message || '灵感系统状态无法读取，已安全停用', true);
        else if (this.snapshot.sourceStateError) this._setStatus(this.snapshot.sourceStateError.message || '灵感来源配置无法读取，已安全停用', true);
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
      if (this.els.addFolder) {
        this.els.addFolder.hidden = !this.snapshot.localFolderAvailable;
        this.els.addFolder.disabled = this.busy || !enabled || Boolean(this.snapshot.sourceStateError);
      }
      if (this.els.stateLabel) {
        this.els.stateLabel.textContent = unreadable ? '安全停用' : enabled ? '基础能力已启用' : '当前停用';
        this.els.stateLabel.dataset.state = unreadable ? 'error' : enabled ? 'enabled' : 'disabled';
      }
      if (this.els.sourceCount) this.els.sourceCount.textContent = String(sources.length);
      if (this.els.sourceList) {
        this.els.sourceList.innerHTML = sources.length
          ? sources.map(source => `<div class="teemo-inspiration-source" data-source-id="${this._escape(source.sourceId)}">
              <div><strong>${this._escape(source.displayName)}</strong><span>本地文件夹 · ${this._escape(source.folderName || '')}</span></div>
              <div class="teemo-inspiration-source-actions">
                <em data-state="${this._escape(source.status)}">${this._sourceStatusLabel(source.status)}</em>
                ${source.status === 'AUTHORIZATION_REQUIRED'
                  ? `<button type="button" class="teemo-secondary-button" data-source-reauthorize ${this.busy || !enabled ? 'disabled' : ''}>重新授权</button>`
                  : `<button type="button" class="teemo-secondary-button" data-source-browse ${this.busy || !enabled ? 'disabled' : ''}>浏览</button>`}
                <button type="button" class="teemo-secondary-button teemo-danger-button" data-source-remove ${this.busy ? 'disabled' : ''}>移除</button>
              </div>
            </div>`).join('')
          : this.snapshot.localFolderAvailable
            ? '<div class="teemo-inspiration-empty"><strong>还没有本地灵感来源</strong><p>启用灵感能力后，可从上方添加一个明确授权的本地文件夹。</p></div>'
            : '<div class="teemo-inspiration-empty"><strong>当前没有已连接的素材来源</strong><p>本阶段只建立安全基础，尚未连接本地或在线素材来源。</p></div>';
        this._bindSourceActions();
      }
      if (this.activeSourceId) {
        const activeSource = sources.find(source => source.sourceId === this.activeSourceId);
        if (!enabled || !activeSource || activeSource.status !== 'CONFIGURED') this._closeBrowser();
      }
    }

    _bindSourceActions() {
      if (!this.els.sourceList) return;
      this.els.sourceList.querySelectorAll('[data-source-id]').forEach(row => {
        const sourceId = row.getAttribute('data-source-id');
        const browse = row.querySelector('[data-source-browse]');
        const remove = row.querySelector('[data-source-remove]');
        const reauthorize = row.querySelector('[data-source-reauthorize]');
        if (browse) browse.addEventListener('click', () => this._openSource(sourceId));
        if (remove) remove.addEventListener('click', () => this._removeSource(sourceId));
        if (reauthorize) reauthorize.addEventListener('click', () => this._reauthorize(sourceId));
      });
    }

    _sourceStatusLabel(status) {
      const labels = {
        CONFIGURED: '已配置',
        AUTHORIZATION_REQUIRED: '需要重新授权',
        MISSING: '文件夹不存在',
        INVALID_SOURCE: '来源无效',
        UNAVAILABLE: '暂不可用',
      };
      return labels[status] || '状态未知';
    }

    _applySourceErrorStatus(error) {
      if (!this.snapshot || !this.activeSourceId || !error) return;
      const statusByCode = {
        INSPIRATION_SOURCE_AUTHORIZATION_REQUIRED: 'AUTHORIZATION_REQUIRED',
        INSPIRATION_SOURCE_MISSING: 'MISSING',
        INSPIRATION_SOURCE_INVALID: 'INVALID_SOURCE',
        INSPIRATION_SOURCE_UNAVAILABLE: 'UNAVAILABLE',
      };
      const status = statusByCode[error.code];
      if (!status) return;
      const source = (this.snapshot.sources || []).find(item => item.sourceId === this.activeSourceId);
      if (source) source.status = status;
    }

    async _addFolder() {
      if (this.busy || !this.snapshot || !this.sourceClient) return;
      this.busy = true;
      this.render();
      try {
        const result = await this.sourceClient.selectAndAdd({ expectedRevision: this.snapshot.sourceRevision });
        if (result.canceled) return;
        await this.refresh('已添加本地灵感来源');
      } catch (error) {
        await this.refresh();
        this._setStatus(error && error.message ? error.message : '添加本地灵感来源失败', true);
      } finally {
        this.busy = false;
        this.render();
      }
    }

    async _removeSource(sourceId) {
      if (this.busy || !this.snapshot || !this.sourceClient) return;
      const accepted = typeof window === 'undefined' || typeof window.confirm !== 'function'
        ? true
        : window.confirm('移除灵感来源只会删除 Teemo 中的来源记录，不会删除原文件，也不会取消全局本地文件授权。');
      if (!accepted) return;
      this.busy = true;
      this.render();
      try {
        await this.sourceClient.removeSource(sourceId, { expectedRevision: this.snapshot.sourceRevision });
        if (this.activeSourceId === sourceId) this._closeBrowser();
        await this.refresh('已移除灵感来源，原文件保持不变');
      } catch (error) {
        await this.refresh();
        this._setStatus(error && error.message ? error.message : '移除灵感来源失败', true);
      } finally {
        this.busy = false;
        this.render();
      }
    }

    async _reauthorize(sourceId) {
      if (this.busy || !this.sourceClient) return;
      this.busy = true;
      this.render();
      try {
        const result = await this.sourceClient.reauthorize(sourceId);
        if (!result.canceled) await this.refresh('本地灵感来源已重新授权');
      } catch (error) {
        await this.refresh();
        this._setStatus(error && error.message ? error.message : '重新授权失败', true);
      } finally {
        this.busy = false;
        this.render();
      }
    }

    async _openSource(sourceId) {
      this.activeSourceId = sourceId;
      this.activeDirectory = '';
      if (this.els.browser) this.els.browser.hidden = false;
      await this._loadDirectory();
    }

    _closeBrowser() {
      this.activeSourceId = null;
      this.activeDirectory = '';
      if (this.els.browser) this.els.browser.hidden = true;
      if (this.els.entryList) this.els.entryList.innerHTML = '';
      if (this.els.preview) this.els.preview.innerHTML = '<span>选择支持的图片进行预览</span>';
    }

    _browseParent() {
      if (!this.activeDirectory) return;
      const parts = this.activeDirectory.split('/').filter(Boolean);
      parts.pop();
      this.activeDirectory = parts.join('/');
      this._loadDirectory();
    }

    async _loadDirectory() {
      if (!this.activeSourceId || this.busy) return;
      this.busy = true;
      this.render();
      if (this.els.entryList) this.els.entryList.innerHTML = '<div class="teemo-inspiration-browser-loading">正在读取...</div>';
      try {
        const result = await this.service.readLocalFolder(this.activeSourceId, 'list_items', {
          relativeDirectory: this.activeDirectory,
          limit: 100,
        }, { sessionId: 'inspiration-center' });
        if (!result.ok) throw Object.assign(new Error(result.error.message), { code: result.error.code });
        this._renderDirectory(result.data);
        this._setStatus(result.data.truncated ? '当前目录项目较多，仅显示前 100 项' : '');
      } catch (error) {
        this._applySourceErrorStatus(error);
        if (this.els.entryList) this.els.entryList.innerHTML = '<div class="teemo-inspiration-empty"><strong>无法读取当前目录</strong><p>请检查授权或稍后重试。</p></div>';
        this._setStatus(error && error.message ? error.message : '读取本地灵感来源失败', true);
      } finally {
        this.busy = false;
        this.render();
      }
    }

    _renderDirectory(data) {
      const source = (this.snapshot.sources || []).find(item => item.sourceId === this.activeSourceId);
      if (this.els.browserTitle) this.els.browserTitle.textContent = source ? source.displayName : '本地灵感';
      if (this.els.browserPath) this.els.browserPath.textContent = data.relativeDirectory ? `/${data.relativeDirectory}` : '/';
      if (this.els.browserBack) this.els.browserBack.disabled = !data.relativeDirectory;
      const entries = Array.isArray(data.entries) ? data.entries : [];
      if (this.els.entryList) {
        this.els.entryList.innerHTML = entries.length ? entries.map(entry => `<button type="button" class="teemo-inspiration-entry" data-entry-path="${this._escape(entry.relativePath)}" data-entry-type="${this._escape(entry.type)}" ${entry.type.startsWith('unsupported') || (entry.type === 'regular_file' && !entry.previewable) ? 'disabled' : ''}>
          <span class="teemo-inspiration-entry-icon">${entry.type === 'directory' ? '▣' : entry.previewable ? '▧' : '·'}</span>
          <span><strong>${this._escape(entry.name)}</strong><em>${entry.type === 'directory' ? '文件夹' : entry.type.startsWith('unsupported') ? '不支持的链接或项目' : this._formatBytes(entry.size)}</em></span>
        </button>`).join('') : '<div class="teemo-inspiration-empty"><strong>当前文件夹为空</strong></div>';
        this.els.entryList.querySelectorAll('[data-entry-path]').forEach(button => {
          button.addEventListener('click', () => {
            if (button.dataset.entryType === 'directory') {
              this.activeDirectory = button.dataset.entryPath;
              this._loadDirectory();
            } else if (button.dataset.entryType === 'regular_file') {
              this._preview(button.dataset.entryPath);
            }
          });
        });
      }
    }

    async _preview(relativePath) {
      if (!this.activeSourceId || this.busy) return;
      this.busy = true;
      this.render();
      if (this.els.preview) this.els.preview.innerHTML = '<span>正在读取预览...</span>';
      try {
        const result = await this.service.readLocalFolder(this.activeSourceId, 'preview', { relativePath }, { sessionId: 'inspiration-center' });
        if (!result.ok) throw Object.assign(new Error(result.error.message), { code: result.error.code });
        if (this.els.preview) this.els.preview.innerHTML = `<img alt="本地灵感预览" src="data:${this._escape(result.data.mimeType)};base64,${result.data.dataBase64}"><p>${this._escape(relativePath.split('/').pop())}</p>`;
        this._setStatus('');
      } catch (error) {
        this._applySourceErrorStatus(error);
        if (this.els.preview) this.els.preview.innerHTML = '<span>该文件无法安全预览</span>';
        this._setStatus(error && error.message ? error.message : '预览失败', true);
      } finally {
        this.busy = false;
        this.render();
      }
    }

    _formatBytes(value) {
      const bytes = Math.max(0, Number(value) || 0);
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
        this.snapshot = {
          ...result.snapshot,
          connectors: this.snapshot.connectors,
          sources: this.snapshot.sources,
          sourceRevision: this.snapshot.sourceRevision,
          sourceStateError: this.snapshot.sourceStateError,
          localFolderAvailable: this.snapshot.localFolderAvailable,
        };
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
