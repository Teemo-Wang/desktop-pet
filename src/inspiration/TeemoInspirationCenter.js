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
      this.eagleLibraryClient = options.eagleLibraryClient || null;
      this.indexClient = options.indexClient || null;
      this.retrievalClient = options.retrievalClient || null;
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
        addEagle: get('TeemoInspirationAddEagleButton'),
        indexReset: get('TeemoInspirationIndexResetButton'),
        indexPanel: get('TeemoInspirationIndexPanel'),
        indexTitle: get('TeemoInspirationIndexTitle'),
        indexSummary: get('TeemoInspirationIndexSummary'),
        indexList: get('TeemoInspirationIndexList'),
        indexClose: get('TeemoInspirationIndexClose'),
        indexPrevious: get('TeemoInspirationIndexPrevious'),
        indexNext: get('TeemoInspirationIndexNext'),
        indexPage: get('TeemoInspirationIndexPage'),
        browser: get('TeemoInspirationBrowser'),
        browserTitle: get('TeemoInspirationBrowserTitle'),
        browserPath: get('TeemoInspirationBrowserPath'),
        browserBack: get('TeemoInspirationBrowserBack'),
        entryList: get('TeemoInspirationEntryList'),
        preview: get('TeemoInspirationPreview'),
        retrieval: get('TeemoInspirationRetrieval'),
        searchInput: get('TeemoInspirationSearchInput'),
        searchSource: get('TeemoInspirationSearchSource'),
        searchFormat: get('TeemoInspirationSearchFormat'),
        searchOrientation: get('TeemoInspirationSearchOrientation'),
        searchMinWidth: get('TeemoInspirationSearchMinWidth'),
        searchMinHeight: get('TeemoInspirationSearchMinHeight'),
        searchSort: get('TeemoInspirationSearchSort'),
        searchButton: get('TeemoInspirationSearchButton'),
        searchResults: get('TeemoInspirationSearchResults'),
        resultCount: get('TeemoInspirationResultCount'),
        searchPrevious: get('TeemoInspirationSearchPrevious'),
        searchNext: get('TeemoInspirationSearchNext'),
        searchPage: get('TeemoInspirationSearchPage'),
      };
      this.snapshot = null;
      this.busy = false;
      this.activeSourceId = null;
      this.activeDirectory = '';
      this.activeIndexSourceId = null;
      this.activeIndexOffset = 0;
      this.activeIndexSnapshot = null;
      this.activeIndexOperation = null;
      this.indexProgress = null;
      this.searchOffset = 0;
      this.searchResult = null;
      this._bind();
    }

    _bind() {
      if (this.els.back) this.els.back.addEventListener('click', () => this.onBack());
      if (this.els.refresh) this.els.refresh.addEventListener('click', () => this.refresh('状态已刷新'));
      if (this.els.enabled) this.els.enabled.addEventListener('change', () => this._setEnabled(this.els.enabled.checked));
      if (this.els.addFolder) this.els.addFolder.addEventListener('click', () => this._addFolder());
      if (this.els.addEagle) this.els.addEagle.addEventListener('click', () => this._addEagleLibrary());
      if (this.els.indexReset) this.els.indexReset.addEventListener('click', () => this._resetCorruptIndex());
      if (this.els.indexClose) this.els.indexClose.addEventListener('click', () => this._closeIndex());
      if (this.els.indexPrevious) this.els.indexPrevious.addEventListener('click', () => this._changeIndexPage(-1));
      if (this.els.indexNext) this.els.indexNext.addEventListener('click', () => this._changeIndexPage(1));
      if (this.els.browserBack) this.els.browserBack.addEventListener('click', () => this._browseParent());
      if (this.els.searchButton) this.els.searchButton.addEventListener('click', () => this._search(0));
      if (this.els.searchInput) this.els.searchInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') this._search(0);
      });
      if (this.els.searchPrevious) this.els.searchPrevious.addEventListener('click', () => this._search(Math.max(0, this.searchOffset - 100)));
      if (this.els.searchNext) this.els.searchNext.addEventListener('click', () => {
        if (this.searchResult && this.searchResult.hasMore) this._search(this.searchOffset + 100);
      });
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
          indexState: sourceSnapshot.indexState || null,
          localFolderAvailable,
          eagleLibraryAvailable: Array.isArray(base.connectors)
            && base.connectors.some(connector => connector.connectorId === 'eagle-library'),
        };
        this.render();
        this._renderSearchSources();
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
      const indexUnreadable = (this.snapshot.indexState && this.snapshot.indexState.status === 'INDEX_UNREADABLE')
        || sources.some(source => source.index && source.index.status === 'INDEX_UNREADABLE');
      if (this.els.enabled) {
        this.els.enabled.checked = enabled;
        this.els.enabled.disabled = unreadable || this.busy;
      }
      if (this.els.refresh) this.els.refresh.disabled = this.busy;
      if (this.els.addFolder) {
        this.els.addFolder.hidden = !this.snapshot.localFolderAvailable;
        this.els.addFolder.disabled = this.busy || !enabled || Boolean(this.snapshot.sourceStateError);
      }
      if (this.els.addEagle) {
        this.els.addEagle.hidden = !this.snapshot.eagleLibraryAvailable;
        this.els.addEagle.disabled = this.busy || !enabled || Boolean(this.snapshot.sourceStateError);
      }
      if (this.els.indexReset) {
        this.els.indexReset.hidden = !indexUnreadable;
        this.els.indexReset.disabled = this.busy || !enabled;
      }
      if (this.els.stateLabel) {
        this.els.stateLabel.textContent = unreadable ? '安全停用' : enabled ? '基础能力已启用' : '当前停用';
        this.els.stateLabel.dataset.state = unreadable ? 'error' : enabled ? 'enabled' : 'disabled';
      }
      if (this.els.sourceCount) this.els.sourceCount.textContent = String(sources.length);
      if (this.els.sourceList) {
        this.els.sourceList.innerHTML = sources.length
          ? sources.map(source => this._sourceMarkup(source, enabled)).join('')
          : this.snapshot.localFolderAvailable
            ? '<div class="teemo-inspiration-empty"><strong>还没有本地灵感来源</strong><p>启用灵感能力后，可从上方添加一个明确授权的本地文件夹。</p></div>'
            : '<div class="teemo-inspiration-empty"><strong>当前没有已连接的素材来源</strong><p>本阶段只建立安全基础，尚未连接本地或在线素材来源。</p></div>';
        this._bindSourceActions();
      }
      if (this.activeSourceId) {
        const activeSource = sources.find(source => source.sourceId === this.activeSourceId);
        if (!enabled || !activeSource || activeSource.status !== 'CONFIGURED') this._closeBrowser();
      }
      if (this.activeIndexSourceId) {
        const activeSource = sources.find(source => source.sourceId === this.activeIndexSourceId);
        if (!enabled || !activeSource || activeSource.status !== 'CONFIGURED') this._closeIndex();
      }
      if (this.els.retrieval) this.els.retrieval.hidden = !enabled || !this.retrievalClient;
      this._renderSearchSources();
      this._renderSearchResult();
    }

    _renderSearchSources() {
      if (!this.els.searchSource || !this.snapshot) return;
      const current = this.els.searchSource.value;
      const sources = (this.snapshot.sources || []).filter(source => source.status === 'CONFIGURED');
      this.els.searchSource.innerHTML = '<option value="">全部来源</option>' + sources.map(source => `<option value="${this._escape(source.sourceId)}">${this._escape(source.displayName)}</option>`).join('');
      this.els.searchSource.value = sources.some(source => source.sourceId === current) ? current : '';
    }

    async _search(offset = 0) {
      if (this.busy || !this.retrievalClient) return;
      this.busy = true; this.searchOffset = Math.max(0, Number(offset) || 0); this.render();
      try {
        this.searchResult = await this.retrievalClient.search({
          query: this.els.searchInput && this.els.searchInput.value,
          sourceId: this.els.searchSource && this.els.searchSource.value,
          format: this.els.searchFormat && this.els.searchFormat.value,
          orientation: this.els.searchOrientation && this.els.searchOrientation.value,
          minWidth: this.els.searchMinWidth && this.els.searchMinWidth.value,
          minHeight: this.els.searchMinHeight && this.els.searchMinHeight.value,
          sort: this.els.searchSort && this.els.searchSort.value,
          offset: this.searchOffset,
          limit: 100,
        });
        if (this.searchResult.status !== 'READY') {
          const labels = { DISABLED: '灵感基础能力当前已停用', NOT_INDEXED: '请先建立素材索引', CORRUPT: '索引不可用，请先重建', AUTHORIZATION_REQUIRED: '来源需要重新授权', SOURCE_NOT_FOUND: '找不到指定来源' };
          this._setStatus(labels[this.searchResult.status] || '当前没有可检索的已授权索引', true);
        } else this._setStatus('');
      } catch (error) {
        this.searchResult = { status: 'FAILED', items: [], total: 0, offset: this.searchOffset, limit: 100, hasMore: false };
        this._setStatus(error && error.message ? error.message : '灵感检索失败', true);
      } finally { this.busy = false; this.render(); }
    }

    _renderSearchResult() {
      const result = this.searchResult;
      if (!this.els.searchResults || !result) return;
      const items = Array.isArray(result.items) ? result.items : [];
      if (this.els.resultCount) this.els.resultCount.textContent = `${Number(result.total) || 0} 项结果`;
      this.els.searchResults.innerHTML = items.length ? items.map(item => `<button type="button" class="teemo-inspiration-search-result" data-search-source="${this._escape(item.sourceId)}" data-search-path="${this._escape(item.relativePath)}">
        <span class="teemo-inspiration-search-result-copy"><strong>${this._escape(item.name)}</strong><em>${this._escape(item.sourceDisplayName)} · ${this._escape(item.relativePath)}</em></span>
        <span class="teemo-inspiration-search-result-meta">${item.width} × ${item.height} · ${this._escape(item.mime)}</span>
      </button>`).join('') : '<div class="teemo-inspiration-empty"><strong>没有匹配的已授权素材</strong></div>';
      this.els.searchResults.querySelectorAll('[data-search-source]').forEach(button => button.addEventListener('click', () => this._previewSearchResult(button.dataset.searchSource, button.dataset.searchPath)));
      const limit = Math.max(1, Number(result.limit) || 100);
      const pages = Math.max(1, Math.ceil((Number(result.total) || 0) / limit));
      if (this.els.searchPage) this.els.searchPage.textContent = `${Math.floor((Number(result.offset) || 0) / limit) + 1} / ${pages}`;
      if (this.els.searchPrevious) this.els.searchPrevious.disabled = !result.offset || this.busy;
      if (this.els.searchNext) this.els.searchNext.disabled = !result.hasMore || this.busy;
    }

    async _previewSearchResult(sourceId, relativePath) {
      if (!this.snapshot || this.busy || !this.service) return;
      const source = (this.snapshot.sources || []).find(item => item.sourceId === sourceId);
      if (!source || source.status !== 'CONFIGURED') { this._setStatus('来源需要重新授权后才能预览', true); return; }
      this.activeSourceId = sourceId; this.activeDirectory = '';
      if (this.els.browser) this.els.browser.hidden = false;
      await this._preview(relativePath);
    }

    _sourceMarkup(source, enabled) {
      const scanning = this.activeIndexOperation && this.activeIndexOperation.sourceId === source.sourceId;
      const index = scanning
        ? { status: 'SCANNING', progress: this.indexProgress || {} }
        : (source.index || { status: 'NOT_INDEXED', itemCount: 0 });
      const disabled = this.busy || !enabled;
      let indexActions = '';
      if (source.status === 'CONFIGURED' && this.indexClient) {
        if (scanning) {
          indexActions = '<button type="button" class="teemo-secondary-button" data-source-index-cancel>取消</button>';
        } else if (index.status === 'READY') {
          indexActions = `<button type="button" class="teemo-secondary-button" data-source-index-view ${disabled ? 'disabled' : ''}>查看索引</button>
            <button type="button" class="teemo-secondary-button" data-source-index="refresh" ${disabled ? 'disabled' : ''}>刷新索引</button>
            <button type="button" class="teemo-secondary-button" data-source-index="rebuild" ${disabled ? 'disabled' : ''}>重建索引</button>`;
        } else if (index.status === 'CORRUPT') {
          indexActions = `<button type="button" class="teemo-secondary-button" data-source-index="rebuild" ${disabled ? 'disabled' : ''}>重建索引</button>`;
        } else if (index.status !== 'INDEX_UNREADABLE') {
          indexActions = `<button type="button" class="teemo-secondary-button" data-source-index="build" ${disabled ? 'disabled' : ''}>建立索引</button>`;
        }
      }
      const sourceAction = source.status === 'AUTHORIZATION_REQUIRED'
        ? `<button type="button" class="teemo-secondary-button" data-source-reauthorize ${disabled ? 'disabled' : ''}>重新授权</button>`
        : `<button type="button" class="teemo-secondary-button" data-source-browse ${disabled ? 'disabled' : ''}>浏览</button>`;
      return `<div class="teemo-inspiration-source" data-source-id="${this._escape(source.sourceId)}">
        <div class="teemo-inspiration-source-copy">
          <strong>${this._escape(source.displayName)}</strong>
          <span>${source.kind === 'eagle_library' ? 'Eagle-compatible 灵感库' : '本地文件夹'} · ${this._escape(source.folderName || '')}</span>
          <small data-index-state="${this._escape(index.status)}">${this._escape(this._indexStatusText(index, source.status))}</small>
        </div>
        <div class="teemo-inspiration-source-actions">
          <em data-state="${this._escape(source.status)}">${this._sourceStatusLabel(source.status)}</em>
          ${indexActions}
          ${sourceAction}
          <button type="button" class="teemo-secondary-button teemo-danger-button" data-source-remove ${this.busy ? 'disabled' : ''}>移除</button>
        </div>
      </div>`;
    }

    _indexStatusText(index, sourceStatus) {
      if (sourceStatus === 'AUTHORIZATION_REQUIRED') return '重新授权后可查看上次索引';
      if (!index) return '尚未建立素材索引';
      if (index.status === 'SCANNING') {
        const progress = index.progress || {};
        return `正在索引 · 已检查 ${Number(progress.entriesInspected) || 0} · 已索引 ${Number(progress.indexed) || 0}`;
      }
      if (index.status === 'READY') {
        const time = index.lastSuccessfulScanAt ? this._formatTime(index.lastSuccessfulScanAt) : '时间未知';
        return `已索引 ${Number(index.itemCount) || 0} 项 · 上次索引 ${time}`;
      }
      const labels = {
        CORRUPT: '索引已损坏，需要重建',
        INDEX_UNREADABLE: '灵感索引状态无法读取',
        SOURCE_MISSING: '来源当前不可用',
        AUTHORIZATION_REQUIRED: '需要重新授权',
        LIMIT_EXCEEDED: '上次索引超过安全限制',
      };
      return labels[index.status] || '尚未建立素材索引';
    }

    _bindSourceActions() {
      if (!this.els.sourceList) return;
      this.els.sourceList.querySelectorAll('[data-source-id]').forEach(row => {
        const sourceId = row.getAttribute('data-source-id');
        const browse = row.querySelector('[data-source-browse]');
        const remove = row.querySelector('[data-source-remove]');
        const reauthorize = row.querySelector('[data-source-reauthorize]');
        const indexAction = row.querySelector('[data-source-index]');
        const indexView = row.querySelector('[data-source-index-view]');
        const indexCancel = row.querySelector('[data-source-index-cancel]');
        if (browse) browse.addEventListener('click', () => this._openSource(sourceId));
        if (remove) remove.addEventListener('click', () => this._removeSource(sourceId));
        if (reauthorize) reauthorize.addEventListener('click', () => this._reauthorize(sourceId));
        if (indexAction) indexAction.addEventListener('click', () => this._runIndex(sourceId, indexAction.dataset.sourceIndex));
        if (indexView) indexView.addEventListener('click', () => this._openIndex(sourceId, 0));
        if (indexCancel) indexCancel.addEventListener('click', () => this._cancelIndex());
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

    async _addEagleLibrary() {
      if (this.busy || !this.snapshot || !this.eagleLibraryClient) return;
      this.busy = true;
      this.render();
      try {
        const result = await this.eagleLibraryClient.selectAndAdd({ expectedRevision: this.snapshot.sourceRevision });
        if (result.canceled) return;
        await this.refresh('已添加 Eagle-compatible 灵感库');
      } catch (error) {
        await this.refresh();
        this._setStatus(error && error.message ? error.message : '添加 Eagle 灵感库失败', true);
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
        const removal = await this.sourceClient.removeSource(sourceId, { expectedRevision: this.snapshot.sourceRevision });
        if (this.activeSourceId === sourceId) this._closeBrowser();
        if (this.activeIndexSourceId === sourceId) this._closeIndex();
        await this.refresh(removal && removal.indexCleanupWarning
          ? '来源已移除且原文件保持不变；派生索引将在下次刷新时重试清理'
          : '已移除灵感来源，原文件保持不变');
      } catch (error) {
        await this.refresh();
        this._setStatus(error && error.message ? error.message : '移除灵感来源失败', true);
      } finally {
        this.busy = false;
        this.render();
      }
    }

    async _reauthorize(sourceId) {
      if (this.busy || !this.snapshot) return;
      const source = (this.snapshot.sources || []).find(item => item.sourceId === sourceId);
      const client = source && source.kind === 'eagle_library' ? this.eagleLibraryClient : this.sourceClient;
      if (!client || typeof client.reauthorize !== 'function') return;
      this.busy = true;
      this.render();
      try {
        const result = await client.reauthorize(sourceId);
        if (!result.canceled) await this.refresh('本地灵感来源已重新授权');
      } catch (error) {
        await this.refresh();
        this._setStatus(error && error.message ? error.message : '重新授权失败', true);
      } finally {
        this.busy = false;
        this.render();
      }
    }

    async _runIndex(sourceId, mode) {
      if (this.busy || !this.indexClient) return;
      if (mode === 'rebuild' && typeof window !== 'undefined' && typeof window.confirm === 'function'
        && !window.confirm('重建只会替换 Teemo 的本地素材索引，不会修改或删除原文件。')) return;
      this.busy = true;
      this.indexProgress = { entriesInspected: 0, indexed: 0 };
      let lastRender = 0;
      const source = (this.snapshot.sources || []).find(item => item.sourceId === sourceId);
      const operation = this.indexClient.startScan(sourceId, mode, {
        sessionId: 'inspiration-center',
        sourceKind: source && source.kind === 'eagle_library' ? 'eagle_library' : 'local_folder',
        onProgress: progress => {
          this.indexProgress = progress;
          if (Date.now() - lastRender >= 100) {
            lastRender = Date.now();
            this.render();
          }
        },
      });
      this.activeIndexOperation = { ...operation, sourceId, mode };
      this.render();
      try {
        await operation.promise;
        this.activeIndexOperation = null;
        this.indexProgress = null;
        this.busy = false;
        await this.refresh(mode === 'build' ? '素材索引已建立' : mode === 'rebuild' ? '素材索引已重建' : '素材索引已刷新');
        await this._openIndex(sourceId, 0);
      } catch (error) {
        this.activeIndexOperation = null;
        this.indexProgress = null;
        this.busy = false;
        await this.refresh();
        this._setStatus(error && error.message ? error.message : '素材索引未能完成，旧索引保持不变', true);
      } finally {
        this.activeIndexOperation = null;
        this.indexProgress = null;
        this.busy = false;
        this.render();
      }
    }

    async _cancelIndex() {
      if (!this.activeIndexOperation) return;
      try {
        await this.activeIndexOperation.cancel();
        this._setStatus('正在取消索引...');
      } catch (_) {
        this._setStatus('取消请求未能送达', true);
      }
    }

    async _openIndex(sourceId, offset = 0) {
      if (!this.indexClient || this.activeIndexOperation) return;
      try {
        const snapshot = await this.indexClient.getSource(sourceId, { offset, limit: 100 });
        if (snapshot.status !== 'READY') {
          const messages = {
            AUTHORIZATION_REQUIRED: '重新授权后才可查看上次索引',
            CORRUPT: '该素材来源的索引已损坏，需要重建',
            INDEX_UNREADABLE: '灵感索引状态无法读取，已安全停用',
            NOT_INDEXED: '该灵感来源尚未建立索引',
          };
          throw new Error(messages[snapshot.status] || '素材索引暂不可用');
        }
        this.activeIndexSourceId = sourceId;
        this.activeIndexOffset = Number(snapshot.offset) || 0;
        this.activeIndexSnapshot = snapshot;
        this._renderIndexSnapshot();
        if (this.els.indexPanel) this.els.indexPanel.hidden = false;
        this._setStatus('');
      } catch (error) {
        this._closeIndex();
        this._setStatus(error && error.message ? error.message : '读取素材索引失败', true);
      }
    }

    _renderIndexSnapshot() {
      const snapshot = this.activeIndexSnapshot;
      if (!snapshot || snapshot.status !== 'READY') return;
      const source = (this.snapshot.sources || []).find(item => item.sourceId === this.activeIndexSourceId);
      if (this.els.indexTitle) this.els.indexTitle.textContent = source ? `${source.displayName} · 素材索引` : '素材索引';
      if (this.els.indexSummary) {
        this.els.indexSummary.textContent = `${snapshot.total} 项 · 上次索引 ${this._formatTime(snapshot.entry.lastSuccessfulScanAt)}`;
      }
      const items = Array.isArray(snapshot.items) ? snapshot.items : [];
      if (this.els.indexList) {
        this.els.indexList.innerHTML = items.length ? items.map(item => `<div class="teemo-inspiration-index-item">
          <div><strong>${this._escape(item.name)}</strong><span>${this._escape(item.relativePath)}</span></div>
          <dl>
            <div><dt>类型</dt><dd>${this._escape(item.mime)}</dd></div>
            <div><dt>尺寸</dt><dd>${item.width} × ${item.height}</dd></div>
            <div><dt>大小</dt><dd>${this._formatBytes(item.sizeBytes)}</dd></div>
            <div><dt>修改</dt><dd>${this._formatNsTime(item.mtimeNs)}</dd></div>
          </dl>
        </div>`).join('') : '<div class="teemo-inspiration-empty"><strong>当前索引没有支持的视觉素材</strong></div>';
      }
      const limit = Math.max(1, Number(snapshot.limit) || 100);
      const pages = Math.max(1, Math.ceil((Number(snapshot.total) || 0) / limit));
      const page = Math.floor(this.activeIndexOffset / limit) + 1;
      if (this.els.indexPage) this.els.indexPage.textContent = `${page} / ${pages}`;
      if (this.els.indexPrevious) this.els.indexPrevious.disabled = this.activeIndexOffset <= 0;
      if (this.els.indexNext) this.els.indexNext.disabled = !snapshot.hasMore;
    }

    _changeIndexPage(direction) {
      if (!this.activeIndexSnapshot || !this.activeIndexSourceId) return;
      const limit = Math.max(1, Number(this.activeIndexSnapshot.limit) || 100);
      const next = Math.max(0, this.activeIndexOffset + (direction * limit));
      if (direction > 0 && !this.activeIndexSnapshot.hasMore) return;
      this._openIndex(this.activeIndexSourceId, next);
    }

    _closeIndex() {
      this.activeIndexSourceId = null;
      this.activeIndexOffset = 0;
      this.activeIndexSnapshot = null;
      if (this.els.indexPanel) this.els.indexPanel.hidden = true;
      if (this.els.indexList) this.els.indexList.innerHTML = '';
    }

    async _resetCorruptIndex() {
      if (this.busy || !this.indexClient) return;
      if (typeof window !== 'undefined' && typeof window.confirm === 'function'
        && !window.confirm('这只会重置 Teemo 的派生索引数据。来源记录、授权和原文件都不会改变。')) return;
      this.busy = true;
      this.render();
      try {
        await this.indexClient.resetCorruptIndex();
        this._closeIndex();
        await this.refresh('灵感索引数据已重置，可按来源重新建立');
      } catch (error) {
        this._setStatus(error && error.message ? error.message : '重置灵感索引失败', true);
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
        const result = await this._readSource('list_items', {
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
        const result = await this._readSource('preview', { relativePath });
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

    _readSource(operation, request) {
      const source = (this.snapshot && this.snapshot.sources || []).find(item => item.sourceId === this.activeSourceId);
      if (source && source.kind === 'eagle_library' && this.service && typeof this.service.readEagleLibrary === 'function') {
        return this.service.readEagleLibrary(this.activeSourceId, operation, request, { sessionId: 'inspiration-center' });
      }
      return this.service.readLocalFolder(this.activeSourceId, operation, request, { sessionId: 'inspiration-center' });
    }

    _formatBytes(value) {
      const bytes = Math.max(0, Number(value) || 0);
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    _formatTime(value) {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '时间未知';
      return date.toLocaleString('zh-CN', { hour12: false });
    }

    _formatNsTime(value) {
      try {
        const milliseconds = Number(BigInt(String(value || '0')) / 1000000n);
        return this._formatTime(milliseconds);
      } catch (_) {
        return '时间未知';
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
        this.snapshot = {
          ...result.snapshot,
          connectors: this.snapshot.connectors,
          sources: this.snapshot.sources,
          sourceRevision: this.snapshot.sourceRevision,
          sourceStateError: this.snapshot.sourceStateError,
          localFolderAvailable: this.snapshot.localFolderAvailable,
          eagleLibraryAvailable: this.snapshot.eagleLibraryAvailable,
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
