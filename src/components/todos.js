/**
 * 待办清单面板组件
 * 支持：勾选完成 / 新建 / 删除 / 编辑标题与截止时间 / 优先级切换 / 来源标识
 */
(function() {

  const FILTERS = [
    { id: 'all', label: '全部', icon: '📋' },
    { id: 'doing', label: '进行中', icon: '🔵' },
    { id: 'todo', label: '待开始', icon: '⚪' },
    { id: 'done', label: '已完成', icon: '✅' },
    { id: 'cancelled', label: '已中止', icon: '⛔' },
  ];

  const PRIORITIES = [
    { id: 'high', label: '高', dot: '🔴' },
    { id: 'medium', label: '中', dot: '🟡' },
    { id: 'low', label: '低', dot: '⚪' },
  ];

  // 编辑器中可选的状态（done / cancelled 不在编辑里出现，由专用按钮处理）
  const STATUS_CHOICES = [
    { id: 'todo', label: '待开始', dot: '⚪' },
    { id: 'doing', label: '进行中', dot: '🔵' },
  ];

  // 分组方式
  const GROUP_BY_OPTIONS = [
    { id: 'none', label: '不分组', icon: '📄' },
    { id: 'status', label: '按状态', icon: '🏷️' },
    { id: 'requester', label: '按需求方', icon: '👥' },
    { id: 'deadline', label: '按时间', icon: '📅' },
    { id: 'priority', label: '按优先级', icon: '⚡' },
  ];

  // 状态分组顺序与展示
  const STATUS_GROUP_META = {
    doing: { label: '🔵 进行中', order: 0 },
    todo: { label: '⚪ 待开始', order: 1 },
    done: { label: '✅ 已完成', order: 2 },
    cancelled: { label: '⛔ 已中止', order: 3 },
  };

  // 优先级分组顺序
  const PRIORITY_GROUP_META = {
    high: { label: '🔴 高优先级', order: 0 },
    medium: { label: '🟡 中优先级', order: 1 },
    low: { label: '⚪ 低优先级', order: 2 },
  };

  class TodosComponent {
    constructor(panelEl, service) {
      this.panel = panelEl;
      this.service = service;
      this.isOpen = false;
      this.activeFilter = 'all';
      this.editingId = null;     // 正在编辑的待办 ID
      this.creating = false;     // 是否处于"新增中"状态
      this.confirmingDeleteId = null; // 内联确认删除的待办 ID
      this._confirmTimer = null;
      this.groupBy = 'none';     // 分组方式：none|status|requester|deadline|priority
      this.groupMenuOpen = false; // 分组下拉是否打开
      this._groupMenuOutsideHandler = null; // 外部点击关闭分组菜单的监听器引用
      // 数据变更时如果面板打开就重渲
      this.service.onChange(() => { if (this.isOpen) this._render(); });
    }

    open() {
      this.isOpen = true;
      this.editingId = null;
      this.creating = false;
      this._exitDeleteConfirm();
      this._render();
      this.panel.classList.add('open');
    }

    close() {
      this.isOpen = false;
      this._exitDeleteConfirm();
      this._removeGroupMenuOutsideHandler();
      this.groupMenuOpen = false;
      this.panel.classList.remove('open');
    }

    /** 卸载分组菜单的"点外部关闭"监听器 */
    _removeGroupMenuOutsideHandler() {
      if (this._groupMenuOutsideHandler) {
        document.removeEventListener('mousedown', this._groupMenuOutsideHandler, true);
        this._groupMenuOutsideHandler = null;
      }
    }

    /** 进入删除确认态，5 秒后自动撤销 */
    _enterDeleteConfirm(id) {
      this.confirmingDeleteId = id;
      if (this._confirmTimer) clearTimeout(this._confirmTimer);
      this._confirmTimer = setTimeout(() => {
        if (this.confirmingDeleteId === id) {
          this._exitDeleteConfirm();
          this._render();
        }
      }, 5000);
      this._render();
    }

    _exitDeleteConfirm() {
      this.confirmingDeleteId = null;
      if (this._confirmTimer) {
        clearTimeout(this._confirmTimer);
        this._confirmTimer = null;
      }
    }

    _render() {
      const all = this.service.getAll();
      const filtered = this.activeFilter === 'all'
        ? all
        : all.filter(t => t.status === this.activeFilter);

      const counts = {
        all: all.length,
        doing: all.filter(t => t.status === 'doing').length,
        todo: all.filter(t => t.status === 'todo').length,
        done: all.filter(t => t.status === 'done').length,
        cancelled: all.filter(t => t.status === 'cancelled').length,
      };

      const groupOpt = GROUP_BY_OPTIONS.find(g => g.id === this.groupBy) || GROUP_BY_OPTIONS[0];

      this.panel.innerHTML = `
        <div class="todo-layout">
          <div class="todo-header">
            <span class="todo-header-title"><img class="panel-head-icon" src="icon/待办.png" alt="">待办清单</span>
            <div class="todo-header-actions">
              <button class="btn-icon todo-group-btn ${this.groupBy !== 'none' ? 'active' : ''}" title="分组方式">
                <span class="todo-group-btn-icon">${groupOpt.icon}</span>
                <span class="todo-group-btn-label">${groupOpt.label}</span>
                <span class="todo-group-btn-arrow">▾</span>
              </button>
              <button class="btn-icon todo-add-btn" title="新建待办">＋</button>
              <button class="btn-icon" data-close>✕</button>
            </div>
            ${this.groupMenuOpen ? `
              <div class="todo-group-menu">
                ${GROUP_BY_OPTIONS.map(g => `
                  <div class="todo-group-menu-item ${g.id === this.groupBy ? 'active' : ''}" data-group="${g.id}">
                    <span class="todo-group-menu-icon">${g.icon}</span>
                    <span class="todo-group-menu-label">${g.label}</span>
                    ${g.id === this.groupBy ? '<span class="todo-group-menu-check">✓</span>' : ''}
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>
          <div class="todo-content-row">
            <div class="todo-sidebar">
              ${FILTERS.map(f => `
                <div class="todo-filter ${f.id === this.activeFilter ? 'active' : ''}" data-filter="${f.id}">
                  <span class="todo-filter-icon">${f.icon}</span>
                  <span class="todo-filter-label">${f.label}</span>
                  <span class="todo-filter-count">${counts[f.id]}</span>
                </div>
              `).join('')}
            </div>
            <div class="todo-main">
              <div class="todo-list">
                ${this.creating ? this._renderEditor(null) : ''}
                ${filtered.length === 0 && !this.creating
                  ? '<div class="state-empty"><div class="state-empty-icon">🎉</div><div class="state-empty-text">没有待办事项</div><div class="state-empty-hint">点击右上角 ＋ 新建</div></div>'
                  : this._renderListBody(filtered)
                }
              </div>
            </div>
          </div>
        </div>
        <div class="rz rz-t"></div>
        <div class="rz rz-l"></div>
        <div class="rz rz-tl"></div>
      `;

      this._bind();
    }

    /** 列表主体：根据 groupBy 决定扁平 / 分组 */
    _renderListBody(items) {
      // 不分组 / 编辑中 — 扁平
      if (this.groupBy === 'none') {
        return items.map(t => this.editingId === t.id ? this._renderEditor(t) : this._renderItem(t)).join('');
      }
      const groups = this._buildGroups(items);
      return groups.map(g => `
        <div class="todo-group">
          <div class="todo-group-head">
            <span class="todo-group-label">${g.label}</span>
            <span class="todo-group-count">${g.items.length}</span>
          </div>
          ${g.items.map(t => this.editingId === t.id ? this._renderEditor(t) : this._renderItem(t)).join('')}
        </div>
      `).join('');
    }

    /** 根据 groupBy 把任务分组 */
    _buildGroups(items) {
      const map = new Map();

      const ensure = (key, label, order = 999) => {
        if (!map.has(key)) map.set(key, { key, label, order, items: [] });
        return map.get(key);
      };

      if (this.groupBy === 'status') {
        for (const t of items) {
          const meta = STATUS_GROUP_META[t.status] || { label: t.status, order: 999 };
          ensure(t.status, meta.label, meta.order).items.push(t);
        }
      } else if (this.groupBy === 'priority') {
        for (const t of items) {
          const meta = PRIORITY_GROUP_META[t.priority] || PRIORITY_GROUP_META.medium;
          ensure(t.priority, meta.label, meta.order).items.push(t);
        }
      } else if (this.groupBy === 'requester') {
        for (const t of items) {
          const key = t.fromChat || '__no_requester__';
          const label = t.fromChat ? `💬 ${t.fromChat}` : '✏️ 自建任务';
          ensure(key, label, t.fromChat ? 0 : 1).items.push(t);
        }
      } else if (this.groupBy === 'deadline') {
        const now = Date.now();
        const todayEnd = (() => { const d = new Date(); d.setHours(23,59,59,999); return d.getTime(); })();
        const tomorrowEnd = todayEnd + 86400000;
        const weekEnd = todayEnd + 7 * 86400000;
        for (const t of items) {
          let key, label, order;
          if (!t.deadline) { key = 'no'; label = '📌 无截止时间'; order = 5; }
          else if (t.deadline < now) { key = 'overdue'; label = '⚠️ 已逾期'; order = 0; }
          else if (t.deadline <= todayEnd) { key = 'today'; label = '📍 今天'; order = 1; }
          else if (t.deadline <= tomorrowEnd) { key = 'tomorrow'; label = '📅 明天'; order = 2; }
          else if (t.deadline <= weekEnd) { key = 'week'; label = '🗓 本周内'; order = 3; }
          else { key = 'later'; label = '⏳ 更晚'; order = 4; }
          ensure(key, label, order).items.push(t);
        }
        // 组内按 deadline 升序
        for (const g of map.values()) {
          g.items.sort((a, b) => (a.deadline || Infinity) - (b.deadline || Infinity));
        }
      }

      return [...map.values()].sort((a, b) => a.order - b.order);
    }

    /** 渲染单条待办（只读视图） */
    _renderItem(t) {
      // 如果该项处于"删除二次确认"状态，渲染内联确认条
      if (this.confirmingDeleteId === t.id) {
        return `
          <div class="todo-item todo-confirm-row" data-id="${t.id}">
            <div class="todo-confirm-icon">⚠️</div>
            <div class="todo-confirm-text">删除「${_escape(t.title)}」？</div>
            <div class="todo-confirm-actions">
              <button class="todo-confirm-cancel" data-act="confirm-cancel">取消</button>
              <button class="todo-confirm-ok" data-act="confirm-ok">删除</button>
            </div>
          </div>
        `;
      }

      const deadlineText = window.TodoUtils.formatDeadline(t.deadline);
      const overdue = t.deadline && t.deadline < Date.now() && t.status !== 'done' && t.status !== 'cancelled';
      const priority = PRIORITIES.find(p => p.id === t.priority) || PRIORITIES[1];
      const fromTag = t.fromChat ? `<span class="todo-source" title="来源">💬 ${t.fromChat}</span>` : '';
      const cancelled = t.status === 'cancelled';

      // 已中止：用恢复按钮取代复选框；隐藏到期文案
      const checkOrRestore = cancelled
        ? `<button class="todo-restore-btn" data-act="restore" title="恢复到待开始">↻</button>`
        : `<div class="todo-check ${t.status === 'done' ? 'checked' : ''}" data-act="toggle"></div>`;

      // 中止按钮：仅未完成 / 非中止 时显示
      const cancelBtn = (t.status !== 'done' && !cancelled)
        ? `<button class="btn-icon todo-cancel" data-act="cancel" title="中止">⛔</button>`
        : '';

      // 进度切换：仅 todo / doing 时显示，一键在两者之间切换
      const progressBtn = (t.status === 'todo' || t.status === 'doing')
        ? `<button class="btn-icon todo-progress" data-act="toggle-progress" title="${t.status === 'todo' ? '设为进行中' : '设为待开始'}">${t.status === 'todo' ? '▶' : '⏸'}</button>`
        : '';

      return `
        <div class="todo-item ${t.status}${overdue ? ' overdue' : ''}" data-id="${t.id}">
          ${checkOrRestore}
          <div class="todo-item-body">
            <div class="todo-item-title">${_escape(t.title)}</div>
            <div class="todo-item-meta">
              ${t.status === 'doing' ? `<span class="todo-doing-tag">进行中</span>` : ''}
              <span class="todo-priority ${t.priority}" data-act="cycle-priority" title="点击切换优先级">${priority.dot}</span>
              ${!cancelled && deadlineText ? `<span class="todo-deadline${overdue ? ' overdue' : ''}">${deadlineText}</span>` : ''}
              ${cancelled ? `<span class="todo-cancelled-tag">已中止</span>` : ''}
              ${fromTag}
            </div>
          </div>
          <div class="todo-item-actions">
            ${progressBtn}
            ${cancelBtn}
            <button class="btn-icon todo-edit" data-act="edit" title="编辑">✎</button>
            <button class="btn-icon todo-del" data-act="delete" title="删除">🗑</button>
          </div>
        </div>
      `;
    }

    /** 渲染编辑器（新建或编辑） */
    _renderEditor(t) {
      const editing = !!t;
      const title = editing ? t.title : '';
      const priority = editing ? t.priority : 'medium';
      const deadlineLocal = editing && t.deadline ? _toLocalInput(t.deadline) : '';
      const idAttr = editing ? `data-id="${t.id}"` : 'data-new="1"';
      // 状态默认值：编辑取自身；新建时如果当前筛选是 doing，则默认进行中
      const status = editing
        ? (t.status === 'doing' ? 'doing' : 'todo')
        : (this.activeFilter === 'doing' ? 'doing' : 'todo');

      return `
        <div class="todo-editor" ${idAttr}>
          <input class="todo-edit-title" type="text" placeholder="待办标题，回车保存" value="${_escape(title)}" maxlength="80">
          <div class="todo-edit-row">
            <div class="todo-edit-status">
              ${STATUS_CHOICES.map(s => `
                <label class="todo-st-radio ${status === s.id ? 'active' : ''}" data-status="${s.id}" title="${s.label}">
                  ${s.dot} ${s.label}
                </label>
              `).join('')}
            </div>
            <div class="todo-edit-priority">
              ${PRIORITIES.map(p => `
                <label class="todo-pri-radio ${priority === p.id ? 'active' : ''}" data-priority="${p.id}">
                  ${p.dot} ${p.label}
                </label>
              `).join('')}
            </div>
          </div>
          <div class="todo-edit-row">
            <input class="todo-edit-deadline" type="datetime-local" value="${deadlineLocal}" title="截止时间（可空）">
          </div>
          <div class="todo-edit-actions">
            <button class="todo-edit-cancel">取消</button>
            <button class="todo-edit-save">${editing ? '保存' : '添加'}</button>
          </div>
        </div>
      `;
    }

    _bind() {
      // 关闭按钮
      this.panel.querySelector('[data-close]')?.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('panel-close-all'));
      });

      // 分组按钮
      this.panel.querySelector('.todo-group-btn')?.addEventListener('click', e => {
        e.stopPropagation();
        this.groupMenuOpen = !this.groupMenuOpen;
        this._render();
      });
      // 分组菜单项
      this.panel.querySelectorAll('.todo-group-menu-item').forEach(el => {
        el.addEventListener('click', e => {
          e.stopPropagation();
          this.groupBy = el.dataset.group;
          this.groupMenuOpen = false;
          this._removeGroupMenuOutsideHandler();
          this._exitDeleteConfirm();
          this._render();
        });
      });
      // 每次重渲前先清除旧的"点外部关闭"监听器，避免堆积
      this._removeGroupMenuOutsideHandler();
      // 仅当分组菜单打开时挂载一次
      if (this.groupMenuOpen) {
        this._groupMenuOutsideHandler = (ev) => {
          if (!ev.target.closest('.todo-group-btn') && !ev.target.closest('.todo-group-menu')) {
            this._removeGroupMenuOutsideHandler();
            this.groupMenuOpen = false;
            this._render();
          }
        };
        // 下次进入事件循环再绑定，避免本次点击立即触发
        setTimeout(() => {
          // 期间可能已被关闭，需复检
          if (this.groupMenuOpen && this._groupMenuOutsideHandler) {
            document.addEventListener('mousedown', this._groupMenuOutsideHandler, true);
          }
        }, 0);
      }

      // 筛选切换
      this.panel.querySelectorAll('.todo-filter').forEach(el => {
        el.addEventListener('click', () => {
          this.activeFilter = el.dataset.filter;
          this.editingId = null;
          this.creating = false;
          this._exitDeleteConfirm();
          this._render();
        });
      });

      // 新建按钮
      this.panel.querySelector('.todo-add-btn')?.addEventListener('click', () => {
        this.creating = true;
        this.editingId = null;
        this._exitDeleteConfirm();
        this._render();
        // 自动聚焦
        this.panel.querySelector('.todo-edit-title')?.focus();
      });

      // 列表内行为委托
      this.panel.querySelectorAll('.todo-item').forEach(row => {
        const id = row.dataset.id;
        row.querySelector('[data-act="toggle"]')?.addEventListener('click', () => {
          this.service.toggleDone(id);
        });
        row.querySelector('[data-act="toggle-progress"]')?.addEventListener('click', () => {
          const cur = this.service.getAll().find(t => t.id === id);
          if (!cur) return;
          this.service.update(id, { status: cur.status === 'doing' ? 'todo' : 'doing' });
        });
        row.querySelector('[data-act="restore"]')?.addEventListener('click', () => {
          this.service.restore(id);
        });
        row.querySelector('[data-act="cancel"]')?.addEventListener('click', () => {
          this.service.cancel(id);
        });
        row.querySelector('[data-act="edit"]')?.addEventListener('click', () => {
          this.editingId = id;
          this.creating = false;
          this._exitDeleteConfirm();
          this._render();
          this.panel.querySelector('.todo-edit-title')?.focus();
        });
        row.querySelector('[data-act="delete"]')?.addEventListener('click', () => {
          // 进入二次确认状态，避免阻塞式弹窗
          this._enterDeleteConfirm(id);
        });
        // 内联确认：取消 / 删除
        row.querySelector('[data-act="confirm-cancel"]')?.addEventListener('click', () => {
          this._exitDeleteConfirm();
          this._render();
        });
        row.querySelector('[data-act="confirm-ok"]')?.addEventListener('click', () => {
          this._exitDeleteConfirm();
          this.service.remove(id);
        });
        row.querySelector('[data-act="cycle-priority"]')?.addEventListener('click', () => {
          const order = ['low', 'medium', 'high'];
          const cur = this.service.getAll().find(t => t.id === id);
          if (!cur) return;
          const next = order[(order.indexOf(cur.priority) + 1) % order.length];
          this.service.update(id, { priority: next });
        });
      });

      // 编辑器
      this.panel.querySelectorAll('.todo-editor').forEach(ed => this._bindEditor(ed));
    }

    _bindEditor(ed) {
      const id = ed.dataset.id || null;
      const titleInput = ed.querySelector('.todo-edit-title');
      const deadlineInput = ed.querySelector('.todo-edit-deadline');
      let priority = ed.querySelector('.todo-pri-radio.active')?.dataset.priority || 'medium';
      let status = ed.querySelector('.todo-st-radio.active')?.dataset.status || 'todo';

      ed.querySelectorAll('.todo-pri-radio').forEach(r => {
        r.addEventListener('click', () => {
          priority = r.dataset.priority;
          ed.querySelectorAll('.todo-pri-radio').forEach(x => x.classList.toggle('active', x === r));
        });
      });

      ed.querySelectorAll('.todo-st-radio').forEach(r => {
        r.addEventListener('click', () => {
          status = r.dataset.status;
          ed.querySelectorAll('.todo-st-radio').forEach(x => x.classList.toggle('active', x === r));
        });
      });

      const save = () => {
        const title = titleInput.value.trim();
        if (!title) {
          titleInput.focus();
          return;
        }
        const deadline = deadlineInput.value ? new Date(deadlineInput.value).getTime() : null;
        if (id) {
          this.service.update(id, { title, priority, deadline, status });
        } else {
          this.service.create({ title, priority, deadline, status });
        }
        this.editingId = null;
        this.creating = false;
        // _persist 会触发 onChange → 自动重渲，无需手动
      };

      const cancel = () => {
        this.editingId = null;
        this.creating = false;
        this._render();
      };

      ed.querySelector('.todo-edit-save').addEventListener('click', save);
      ed.querySelector('.todo-edit-cancel').addEventListener('click', cancel);
      titleInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); save(); }
        else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      });
    }
  }

  // 内部工具
  function _escape(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** 时间戳 → datetime-local input 需要的本地时间字符串 */
  function _toLocalInput(ts) {
    const d = new Date(ts);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  window.TodosComponent = TodosComponent;
})();
