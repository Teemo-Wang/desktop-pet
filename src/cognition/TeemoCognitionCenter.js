/**
 * User-facing Cognition Center for the standalone Teemo chat window.
 * All mutations go through TeemoCognitionService; this component never reads or writes JSON directly.
 */
(function (root, factory) {
  const Center = factory();
  if (root) root.TeemoCognitionCenter = Center;
  if (typeof window !== 'undefined') window.TeemoCognitionCenter = Center;
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

  function confidenceLabel(value) {
    const confidence = Number(value) || 0;
    if (confidence >= 0.8) return '高';
    if (confidence >= 0.5) return '中';
    return '低';
  }

  function categoryLabel(value) {
    return ({
      preference: '设计偏好',
      workflow: '工作习惯',
      goal: '长期目标',
      constraint: '要求与限制',
      correction: '用户纠正',
    })[value] || '其他';
  }

  function formatDate(value) {
    if (!value) return '时间未知';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '时间未知';
    return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
  }

  class TeemoCognitionCenter {
    constructor(options = {}) {
      this.service = options.service || null;
      this.projects = options.projects || null;
      this.confirm = typeof options.confirm === 'function' ? options.confirm : async () => true;
      this.onBack = typeof options.onBack === 'function' ? options.onBack : () => {};
      this.snapshot = null;
      this.filter = 'all';
      this.query = '';
      this.projectFilter = '';
      this.editorMode = 'create';
      this.editorTarget = null;
      this.busy = false;
      this.els = this._elements();
      this._bind();
    }

    _elements() {
      const get = id => document.getElementById(id);
      return {
        back: get('memoryBackButton'),
        enabled: get('memoryEnabled'),
        refresh: get('memoryRefreshButton'),
        add: get('memoryAddButton'),
        status: get('memoryStatus'),
        search: get('memorySearch'),
        filters: get('memoryFilterTabs'),
        projectFilter: get('memoryProjectFilter'),
        list: get('memoryList'),
        privacyCount: get('memorySensitiveCount'),
        editor: get('memoryEditorModal'),
        editorTitle: get('memoryEditorTitle'),
        editorTip: get('memoryEditorTip'),
        editorContent: get('memoryEditorContent'),
        editorCategory: get('memoryEditorCategory'),
        editorScope: get('memoryEditorScope'),
        editorProjectRow: get('memoryEditorProjectRow'),
        editorProject: get('memoryEditorProject'),
        editorError: get('memoryEditorError'),
        editorCancel: get('memoryEditorCancelButton'),
        editorSave: get('memoryEditorSaveButton'),
        evidence: get('memoryEvidenceModal'),
        evidenceTitle: get('memoryEvidenceTitle'),
        evidenceList: get('memoryEvidenceList'),
        evidenceClose: get('memoryEvidenceCloseButton'),
      };
    }

    _bind() {
      if (this.els.back) this.els.back.addEventListener('click', () => this.onBack());
      if (this.els.refresh) this.els.refresh.addEventListener('click', () => this.refresh('已刷新最新认知'));
      if (this.els.add) this.els.add.addEventListener('click', () => this.openCreate());
      if (this.els.search) this.els.search.addEventListener('input', event => {
        this.query = String(event.target.value || '').trim().toLowerCase();
        this.render();
      });
      if (this.els.filters) this.els.filters.addEventListener('click', event => {
        const button = event.target.closest('[data-memory-filter]');
        if (!button) return;
        this.filter = button.dataset.memoryFilter || 'all';
        this.els.filters.querySelectorAll('[data-memory-filter]').forEach(item => item.classList.toggle('active', item === button));
        this.render();
      });
      if (this.els.projectFilter) this.els.projectFilter.addEventListener('change', event => {
        this.projectFilter = event.target.value || '';
        this.render();
      });
      if (this.els.enabled) this.els.enabled.addEventListener('change', () => this._setEnabled(this.els.enabled.checked));
      if (this.els.list) this.els.list.addEventListener('click', event => this._handleListAction(event));
      if (this.els.editorScope) this.els.editorScope.addEventListener('change', () => this._syncProjectRequirement());
      if (this.els.editorCancel) this.els.editorCancel.addEventListener('click', () => this.closeEditor());
      if (this.els.editorSave) this.els.editorSave.addEventListener('click', () => this.saveEditor());
      if (this.els.editor) this.els.editor.addEventListener('click', event => {
        if (event.target === this.els.editor) this.closeEditor();
      });
      if (this.els.evidenceClose) this.els.evidenceClose.addEventListener('click', () => this.closeEvidence());
      if (this.els.evidence) this.els.evidence.addEventListener('click', event => {
        if (event.target === this.els.evidence) this.closeEvidence();
      });
    }

    show() {
      this.refresh();
    }

    refresh(message = '') {
      if (!this.service || typeof this.service.getManagementSnapshot !== 'function') {
        this._setStatus('Cognition Service 暂不可用', true);
        return;
      }
      try {
        this.snapshot = this.service.getManagementSnapshot();
        this._renderProjects();
        this.render();
        if (message) this._setStatus(message);
      } catch (error) {
        this._setStatus(error.message || '读取认知失败', true);
      }
    }

    _projects() {
      return this.projects && typeof this.projects.getAll === 'function' ? this.projects.getAll() : [];
    }

    _projectName(projectId) {
      const project = this._projects().find(item => item.id === projectId);
      return project ? project.name : `项目 ${projectId || '未知'}`;
    }

    _renderProjects() {
      const projects = this._projects();
      const known = new Set(projects.map(project => project.id));
      const orphanIds = Object.keys((this.snapshot && this.snapshot.projectContexts) || {}).filter(id => !known.has(id));
      const options = [
        '<option value="">全部项目</option>',
        ...projects.map(project => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.name)}</option>`),
        ...orphanIds.map(id => `<option value="${escapeHtml(id)}">${escapeHtml(`已删除项目 · ${id}`)}</option>`),
      ];
      if (this.els.projectFilter) {
        this.els.projectFilter.innerHTML = options.join('');
        this.els.projectFilter.value = this.projectFilter;
      }
      if (this.els.editorProject) this.els.editorProject.innerHTML = [
        '<option value="">请选择项目</option>',
        ...projects.map(project => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.name)}</option>`),
        ...orphanIds.map(id => `<option value="${escapeHtml(id)}">${escapeHtml(`已删除项目 · ${id}`)}</option>`),
      ].join('');
    }

    _matches(entry) {
      if (!this.query) return true;
      return [entry.content, entry.category, entry.scope, entry.projectId, this._projectName(entry.projectId)]
        .some(value => String(value || '').toLowerCase().includes(this.query));
    }

    _allKnowledge() {
      if (!this.snapshot) return [];
      return [
        ...this.snapshot.profile.map(entry => ({ ...entry, _domain: 'profile' })),
        ...this.snapshot.recentContext.map(entry => ({ ...entry, _domain: 'recent' })),
        ...Object.entries(this.snapshot.projectContexts).flatMap(([projectId, items]) => (
          (items || []).map(entry => ({ ...entry, projectId, _domain: 'project' }))
        )),
      ];
    }

    render() {
      if (!this.snapshot || !this.els.list) return;
      if (this.els.enabled) this.els.enabled.checked = this.snapshot.enabled !== false;
      if (this.els.privacyCount) {
        const count = Number(this.snapshot.hiddenSensitiveCount) || 0;
        this.els.privacyCount.textContent = count ? `已安全隐藏 ${count} 条疑似敏感数据` : '';
      }
      const all = this._allKnowledge().filter(entry => this._matches(entry));
      const active = all.filter(entry => entry.status !== 'superseded');
      const inactive = all.filter(entry => entry.status === 'superseded');
      const sections = [];
      if (this.filter === 'inactive') {
        sections.push(this._section('不再适用', '○', inactive));
      } else {
        if (this.filter === 'all' || this.filter === 'global') sections.push(this._section('长期认知', '◆', active.filter(entry => entry._domain === 'profile')));
        if (this.filter === 'all' || this.filter === 'recent') sections.push(this._section('最近变化', '◷', active.filter(entry => entry._domain === 'recent')));
        if (this.filter === 'all' || this.filter === 'project') {
          let projectEntries = active.filter(entry => entry._domain === 'project');
          if (this.projectFilter) projectEntries = projectEntries.filter(entry => entry.projectId === this.projectFilter);
          sections.push(this._section('项目认知', '▣', projectEntries));
        }
      }
      const visibleSections = sections.filter(Boolean);
      this.els.list.innerHTML = visibleSections.length ? visibleSections.join('') : this._emptyState();
    }

    _section(title, icon, entries) {
      if (!entries.length) return '';
      const sorted = entries.slice().sort((a, b) => String(b.updatedAt || b.lastObservedAt || '').localeCompare(String(a.updatedAt || a.lastObservedAt || '')));
      return `<section class="teemo-memory-section">
        <div class="teemo-memory-section-head"><span>${icon}</span><h2>${escapeHtml(title)}</h2><em>${sorted.length}</em></div>
        <div class="teemo-memory-cards">${sorted.map(entry => this._card(entry)).join('')}</div>
      </section>`;
    }

    _card(entry) {
      const scope = entry._domain === 'profile' ? '长期认知' : entry._domain === 'recent' ? '近期认知' : `项目：${this._projectName(entry.projectId)}`;
      const inactive = entry.status === 'superseded';
      const attrs = `data-domain="${escapeHtml(entry._domain)}" data-id="${escapeHtml(entry.id)}" data-project-id="${escapeHtml(entry.projectId || '')}"`;
      return `<article class="teemo-memory-card${inactive ? ' inactive' : ''}" ${attrs}>
        <div class="teemo-memory-card-top">
          <div class="teemo-memory-labels"><span class="scope ${escapeHtml(entry._domain)}">${escapeHtml(scope)}</span><span>${escapeHtml(categoryLabel(entry.category))}</span>${inactive ? '<span class="inactive-label">不再适用</span>' : ''}</div>
          <time>${escapeHtml(formatDate(entry.updatedAt || entry.lastObservedAt))}</time>
        </div>
        <p>${escapeHtml(entry.content)}</p>
        <div class="teemo-memory-meta"><span>可信度 ${confidenceLabel(entry.confidence)}</span><span>${Math.max(1, Number(entry.evidenceCount) || 1)} 次依据</span>${entry.source && /^user_manual/.test(entry.source) ? '<span>用户明确添加</span>' : '<span>对话中形成</span>'}</div>
        <div class="teemo-memory-actions">
          <button type="button" data-memory-action="evidence">为什么这么认为？</button>
          ${inactive ? '' : '<button type="button" data-memory-action="edit">纠正 / 修改</button><button type="button" data-memory-action="move">调整范围</button><button type="button" class="danger" data-memory-action="supersede">不再适用</button>'}
        </div>
      </article>`;
    }

    _emptyState() {
      const filtered = this.query || this.filter !== 'all' || this.projectFilter;
      return `<div class="teemo-memory-empty"><strong>${filtered ? '没有符合条件的认知' : 'Teemo 还在逐渐了解你'}</strong><p>${filtered ? '可以调整筛选条件或搜索词。' : '正常聊天中明确表达的长期偏好、近期变化和项目要求，会逐步形成认知。'}</p>${filtered ? '' : '<button type="button" data-memory-action="create">添加第一条认知</button>'}</div>`;
    }

    _targetFromCard(card) {
      return {
        domain: card.dataset.domain,
        id: card.dataset.id,
        projectId: card.dataset.projectId || null,
      };
    }

    _entry(target) {
      return this._allKnowledge().find(entry => (
        entry._domain === target.domain && entry.id === target.id && (entry.projectId || null) === (target.projectId || null)
      )) || null;
    }

    async _handleListAction(event) {
      const actionButton = event.target.closest('[data-memory-action]');
      if (!actionButton) return;
      const action = actionButton.dataset.memoryAction;
      if (action === 'create') return this.openCreate();
      const card = actionButton.closest('.teemo-memory-card');
      if (!card) return;
      const target = this._targetFromCard(card);
      if (action === 'evidence') return this.openEvidence(target);
      if (action === 'edit') return this.openEdit(target);
      if (action === 'move') return this.openMove(target);
      if (action === 'supersede') return this.supersede(target);
    }

    openCreate() {
      this.editorMode = 'create';
      this.editorTarget = null;
      this.els.editorTitle.textContent = '添加一条认知';
      this.els.editorTip.textContent = '这是你的明确输入，将以高可信度保存在本机。';
      this.els.editorContent.value = '';
      this.els.editorContent.readOnly = false;
      this.els.editorCategory.value = 'preference';
      this.els.editorCategory.disabled = false;
      this.els.editorScope.value = 'global';
      this.els.editorScope.disabled = false;
      this.els.editorProject.value = '';
      this.els.editorError.textContent = '';
      this._syncProjectRequirement();
      this.els.editor.hidden = false;
      this.els.editorContent.focus();
    }

    openEdit(target) {
      const entry = this._entry(target);
      if (!entry) return;
      this.editorMode = 'edit';
      this.editorTarget = target;
      this.els.editorTitle.textContent = '纠正或修改认知';
      this.els.editorTip.textContent = '原有依据会保留为历史，新内容成为当前有效认知。';
      this.els.editorContent.value = entry.content;
      this.els.editorContent.readOnly = false;
      this.els.editorCategory.value = entry.category || 'preference';
      this.els.editorCategory.disabled = true;
      this.els.editorScope.value = entry.scope || (target.domain === 'profile' ? 'global' : target.domain);
      this.els.editorScope.disabled = true;
      this.els.editorProject.value = entry.projectId || '';
      this.els.editorError.textContent = '';
      this._syncProjectRequirement();
      this.els.editor.hidden = false;
      this.els.editorContent.focus();
    }

    openMove(target) {
      const entry = this._entry(target);
      if (!entry) return;
      this.editorMode = 'move';
      this.editorTarget = target;
      this.els.editorTitle.textContent = '调整认知范围';
      this.els.editorTip.textContent = '原认知会标记为历史，只保留迁移后的一个有效版本。';
      this.els.editorContent.value = entry.content;
      this.els.editorContent.readOnly = true;
      this.els.editorCategory.value = entry.category || 'preference';
      this.els.editorCategory.disabled = true;
      this.els.editorScope.value = entry.scope || (target.domain === 'profile' ? 'global' : target.domain);
      this.els.editorScope.disabled = false;
      this.els.editorProject.value = entry.projectId || '';
      this.els.editorError.textContent = '';
      this._syncProjectRequirement();
      this.els.editor.hidden = false;
    }

    closeEditor() {
      if (this.busy) return;
      if (this.els.editor) this.els.editor.hidden = true;
    }

    _syncProjectRequirement() {
      if (!this.els.editorProjectRow || !this.els.editorScope) return;
      this.els.editorProjectRow.hidden = this.els.editorScope.value !== 'project';
    }

    async saveEditor() {
      if (this.busy || !this.snapshot) return;
      const content = this.els.editorContent.value.trim();
      const scope = this.els.editorScope.value;
      const projectId = scope === 'project' ? this.els.editorProject.value : null;
      if (!content) return this._editorError('请输入认知内容');
      if (scope === 'project' && !projectId) return this._editorError('请选择认知所属项目');
      this.busy = true;
      this.els.editorSave.disabled = true;
      try {
        let result;
        const options = { expectedRevision: this.snapshot.revision };
        if (this.editorMode === 'create') {
          result = this.service.manualCreate({ content, scope, projectId, category: this.els.editorCategory.value }, options);
        } else if (this.editorMode === 'edit') {
          result = this.service.updateCognitionEntry({ ...this.editorTarget, content }, options);
        } else {
          result = this.service.moveCognitionEntry({ ...this.editorTarget, targetScope: scope, targetProjectId: projectId }, options);
        }
        if (!result || !result.ok) return this._handleMutationError(result);
        this.snapshot = result.snapshot;
        this.els.editor.hidden = true;
        this._renderProjects();
        this.render();
        this._setStatus(this.editorMode === 'create' ? '已添加认知' : this.editorMode === 'edit' ? '认知已修改，原依据已保留' : '认知范围已调整');
      } catch (error) {
        this._editorError(error.message || '保存失败');
      } finally {
        this.busy = false;
        this.els.editorSave.disabled = false;
      }
    }

    _editorError(message) {
      if (this.els.editorError) this.els.editorError.textContent = message;
    }

    _handleMutationError(result) {
      if (result && result.snapshot) {
        this.snapshot = result.snapshot;
        this._renderProjects();
        this.render();
      }
      this._editorError(result && result.message ? result.message : '操作失败');
    }

    async supersede(target) {
      if (!this.snapshot) return;
      const entry = this._entry(target);
      if (!entry) return;
      const confirmed = await this.confirm('不再适用', `Teemo 后续回答将不再使用这条认知：\n\n${entry.content}`);
      if (!confirmed) return;
      try {
        const result = this.service.supersedeCognitionEntry(target, { expectedRevision: this.snapshot.revision });
        if (!result || !result.ok) {
          if (result && result.snapshot) this.snapshot = result.snapshot;
          this.render();
          return this._setStatus(result && result.message ? result.message : '操作失败', true);
        }
        this.snapshot = result.snapshot;
        this.render();
        this._setStatus('已标记为不再适用');
      } catch (error) {
        this._setStatus(error.message || '操作失败', true);
      }
    }

    openEvidence(target) {
      try {
        const result = this.service.getEvidenceForEntry(target);
        if (!result || !result.ok) return this._setStatus(result && result.message ? result.message : '读取依据失败', true);
        this.els.evidenceTitle.textContent = '为什么这么认为？';
        this.els.evidenceList.innerHTML = result.evidence.length
          ? result.evidence.map(item => `<article class="teemo-evidence-item"><div><time>${escapeHtml(formatDate(item.lastObservedAt || item.updatedAt))}</time><span>${escapeHtml(item.scope === 'global' ? '长期' : item.scope === 'recent' ? '近期' : `项目：${this._projectName(item.projectId)}`)}</span><span>${item.status === 'superseded' ? '历史依据' : '有效依据'}</span></div><p>${escapeHtml(item.content)}</p><small>${Math.max(1, Number(item.evidenceCount) || 1)} 次相同依据 · ${escapeHtml(item.source && /^user_manual/.test(item.source) ? '用户明确操作' : '对话中形成')}</small></article>`).join('')
          : '<div class="teemo-memory-empty compact"><strong>没有更多历史依据</strong><p>当前数据只保存了认知本身，没有扩展收集聊天副本。</p></div>';
        this.els.evidence.hidden = false;
      } catch (error) {
        this._setStatus(error.message || '读取依据失败', true);
      }
    }

    closeEvidence() {
      if (this.els.evidence) this.els.evidence.hidden = true;
    }

    _setEnabled(enabled) {
      if (this.busy || !this.snapshot) return;
      try {
        const result = this.service.setEnabled(enabled, { expectedRevision: this.snapshot.revision });
        if (!result || !result.ok) {
          if (result && result.snapshot) this.snapshot = result.snapshot;
          this.render();
          return this._setStatus(result && result.message ? result.message : '设置失败', true);
        }
        this.snapshot = result.snapshot;
        this.render();
        this._setStatus(enabled ? 'Teemo 个性化认知已启用' : '已暂停新增和使用认知，现有数据仍保留');
      } catch (error) {
        this.render();
        this._setStatus(error.message || '设置失败', true);
      }
    }

    _setStatus(message, error = false) {
      if (!this.els.status) return;
      this.els.status.textContent = message || '';
      this.els.status.classList.toggle('error', Boolean(error));
    }
  }

  TeemoCognitionCenter.confidenceLabel = confidenceLabel;
  TeemoCognitionCenter.categoryLabel = categoryLabel;
  return TeemoCognitionCenter;
});
