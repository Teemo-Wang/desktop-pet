/**
 * 项目工作台组件
 * 职责：承载项目列表/今日待办/项目详情的面板 UI
 * 内部视图切换：home（首页）↔ detail（项目详情）
 */
(function() {

  class WorkspaceComponent {
    constructor(el, { projects, todos }) {
      this.el = el;
      this.projects = projects;
      this.todos = todos;
      this.isOpen = false;
      this._view = 'home';         // 'home' | 'detail'
      this._activeProjectId = null; // 详情页当前项目
      this._showAllTodos = false;   // 首页切换：今日/全部
      this._init();
      // 订阅数据变更自动刷新
      this.projects.onChange(() => this._render());
      this.todos.onChange(() => this._render());
    }

    _init() {
      // 面板头部（固定）
      this.el.innerHTML = `
        <div class="panel-head">
          <span class="panel-head-title ws-head-title">📋 项目工作台</span>
          <button class="btn-icon ws-close-btn">✕</button>
        </div>
        <div class="ws-body"></div>
      `;
      this._body = this.el.querySelector('.ws-body');
      // 关闭按钮
      this.el.querySelector('.ws-close-btn').addEventListener('click', () => {
        document.dispatchEvent(new Event('panel-close-all'));
      });
      // 事件代理
      this._body.addEventListener('click', (e) => this._handleClick(e));
    }

    open() {
      this.isOpen = true;
      this.el.classList.add('open');
      this._render();
    }

    close() {
      this.isOpen = false;
      this.el.classList.remove('open');
    }

    /** 从外部跳转到首页的今日待办视图 */
    openToday() {
      this._view = 'home';
      this._showAllTodos = false;
      this.open();
    }

    /** 从外部跳转到某项目详情 */
    openProject(projectId) {
      this._view = 'detail';
      this._activeProjectId = projectId;
      this.open();
    }

    // =========== 渲染 ===========

    _render() {
      if (!this.isOpen) return;
      if (this._view === 'home') {
        this._renderHome();
      } else {
        this._renderDetail();
      }
    }

    _renderHome() {
      const todayTodos = this._showAllTodos
        ? this.todos.getAll().filter(t => t.status !== 'done' && t.status !== 'cancelled')
        : this.todos.getTodayTodos();
      const activeProjects = this.projects.getActive();
      const archivedProjects = this.projects.getArchived();

      // 面板标题恢复
      this.el.querySelector('.ws-head-title').textContent = '📋 项目工作台';

      let html = '';
      // 今日待办区
      html += `<section class="ws-section ws-today">`;
      html += `<div class="ws-section-head">
        <h4>${this._showAllTodos ? '全部待办' : '今日待办'}</h4>
        <button class="ws-toggle-view" data-action="toggle-todo-view">
          ${this._showAllTodos ? '看今日' : '看全部'}
        </button>
      </div>`;
      if (todayTodos.length === 0) {
        html += `<div class="ws-empty">${this._showAllTodos ? '暂无未完成待办 ✨' : '今天暂无紧急任务 ✨'}</div>`;
      } else {
        html += `<div class="ws-todo-list">`;
        for (const t of todayTodos.slice(0, 10)) {
          html += this._renderTodoItem(t);
        }
        if (todayTodos.length > 10) {
          html += `<div class="ws-more">还有 ${todayTodos.length - 10} 项...</div>`;
        }
        html += `</div>`;
      }
      html += `<button class="ws-add-btn" data-action="add-todo">+ 新增待办</button>`;
      html += `</section>`;

      // 项目列表区
      html += `<section class="ws-section ws-projects">`;
      html += `<div class="ws-section-head">
        <h4>我的项目</h4>
        <button class="ws-add-btn ws-add-project" data-action="add-project">+ 新建</button>
      </div>`;
      if (activeProjects.length === 0) {
        html += `<div class="ws-empty">暂无项目，点击上方新建</div>`;
      } else {
        html += `<div class="ws-project-cards">`;
        for (const p of activeProjects) {
          const projectTodos = this.todos.getByProject(p.id);
          const done = projectTodos.filter(t => t.status === 'done').length;
          const total = projectTodos.length;
          html += `<div class="ws-project-card" data-action="open-project" data-id="${p.id}">
            <div class="ws-card-name">${this._esc(p.name)}</div>
            <div class="ws-card-meta">
              <span class="ws-card-progress">${total > 0 ? `${done}/${total} 完成` : '暂无待办'}</span>
              <span class="ws-card-time">${this._relativeTime(p.updatedAt)}</span>
            </div>
          </div>`;
        }
        html += `</div>`;
      }
      // 归档区
      if (archivedProjects.length > 0) {
        html += `<details class="ws-archived"><summary>已归档（${archivedProjects.length}）</summary>`;
        for (const p of archivedProjects) {
          html += `<div class="ws-project-card archived" data-action="open-project" data-id="${p.id}">
            <div class="ws-card-name">${this._esc(p.name)}</div>
          </div>`;
        }
        html += `</details>`;
      }
      html += `</section>`;

      this._body.innerHTML = html;
    }

    _renderDetail() {
      const project = this.projects.getById(this._activeProjectId);
      if (!project) { this._view = 'home'; this._renderHome(); return; }

      // 面板标题显示项目名
      this.el.querySelector('.ws-head-title').textContent = '📋 ' + project.name;

      const projectTodos = this.todos.getByProject(project.id);
      const doing = projectTodos.filter(t => t.status === 'doing');
      const todo = projectTodos.filter(t => t.status === 'todo');
      const done = projectTodos.filter(t => t.status === 'done' || t.status === 'cancelled');

      let html = '';
      // 返回按钮
      html += `<div class="ws-detail-nav">
        <button class="ws-back-btn" data-action="go-home">← 返回</button>
        <button class="ws-archive-btn" data-action="archive-project" data-id="${project.id}">
          ${project.status === 'archived' ? '恢复' : '归档'}
        </button>
      </div>`;

      // 项目信息区
      html += `<div class="ws-info-sections">`;
      html += this._renderInfoField('项目背景', 'background', project.background);
      html += this._renderInfoField('业务目标', 'businessGoal', project.businessGoal);
      html += this._renderInfoField('设计 Brief', 'designBrief', project.designBrief);
      html += this._renderInfoField('视觉方向', 'visualDirection', project.visualDirection);
      html += `</div>`;

      // 项目待办区
      html += `<section class="ws-section ws-project-todos">`;
      html += `<div class="ws-section-head"><h4>项目待办</h4></div>`;
      if (doing.length + todo.length === 0 && done.length === 0) {
        html += `<div class="ws-empty">暂无待办</div>`;
      } else {
        html += `<div class="ws-todo-list">`;
        for (const t of doing) html += this._renderTodoItem(t);
        for (const t of todo) html += this._renderTodoItem(t);
        html += `</div>`;
        if (done.length > 0) {
          html += `<details class="ws-done-group"><summary>已完成（${done.length}）</summary><div class="ws-todo-list">`;
          for (const t of done) html += this._renderTodoItem(t);
          html += `</div></details>`;
        }
      }
      html += `<button class="ws-add-btn" data-action="add-project-todo" data-project="${project.id}">+ 新增待办</button>`;
      html += `</section>`;

      this._body.innerHTML = html;
    }

    // =========== 子渲染 ===========

    _renderTodoItem(t) {
      const isDone = t.status === 'done' || t.status === 'cancelled';
      const priorityClass = `ws-pri-${t.priority}`;
      const deadlineText = t.deadline ? window.TodoUtils.formatDeadline(t.deadline) : '';
      const overdue = t.deadline && t.deadline < Date.now() && !isDone;
      // 如果在首页视图，显示项目名
      let projectLabel = '';
      if (this._view === 'home' && t.projectId) {
        const proj = this.projects.getById(t.projectId);
        if (proj) projectLabel = `<span class="ws-todo-project" data-action="open-project" data-id="${proj.id}">${this._esc(proj.name)}</span>`;
      }
      return `<div class="ws-todo-item ${isDone ? 'done' : ''} ${overdue ? 'overdue' : ''}" data-todo-id="${t.id}">
        <button class="ws-todo-check" data-action="toggle-todo" data-id="${t.id}">${isDone ? '✓' : '○'}</button>
        <div class="ws-todo-content">
          <span class="ws-todo-title">${this._esc(t.title)}</span>
          <div class="ws-todo-meta">
            <span class="${priorityClass}">${t.priority === 'high' ? '🔴' : t.priority === 'medium' ? '🟡' : '🔵'}</span>
            ${deadlineText ? `<span class="ws-todo-deadline ${overdue ? 'overdue' : ''}">${deadlineText}</span>` : ''}
            ${projectLabel}
          </div>
        </div>
      </div>`;
    }

    _renderInfoField(label, key, value) {
      return `<div class="ws-info-field" data-field="${key}">
        <div class="ws-info-label">${label}</div>
        <div class="ws-info-value ${!value ? 'empty' : ''}" data-action="edit-field" data-field="${key}">
          ${value ? this._esc(value) : '点击填写...'}
        </div>
      </div>`;
    }

    // =========== 事件处理 ===========

    _handleClick(e) {
      const action = e.target.closest('[data-action]');
      if (!action) return;
      const act = action.dataset.action;

      switch (act) {
        case 'toggle-todo-view':
          this._showAllTodos = !this._showAllTodos;
          this._render();
          break;

        case 'open-project':
          this._view = 'detail';
          this._activeProjectId = action.dataset.id;
          this._render();
          break;

        case 'go-home':
          this._view = 'home';
          this._activeProjectId = null;
          this._render();
          break;

        case 'toggle-todo': {
          const id = action.dataset.id;
          this.todos.toggleDone(id);
          break;
        }

        case 'add-todo':
          this._promptAddTodo(null);
          break;

        case 'add-project-todo':
          this._promptAddTodo(action.dataset.project);
          break;

        case 'add-project':
          this._promptAddProject();
          break;

        case 'archive-project': {
          const pid = action.dataset.id;
          const project = this.projects.getById(pid);
          if (!project) break;
          if (project.status === 'archived') {
            this.projects.restore(pid);
          } else {
            this.projects.archive(pid);
          }
          this._view = 'home';
          this._render();
          break;
        }

        case 'edit-field':
          this._promptEditField(action.dataset.field);
          break;
      }
    }

    /** 弹窗式新增待办（简易 prompt） */
    _promptAddTodo(projectId) {
      // 用 contentEditable 模拟行内输入
      const title = prompt('待办标题：');
      if (!title || !title.trim()) return;
      this.todos.create({
        title: title.trim(),
        priority: 'medium',
        projectId: projectId || null,
      });
    }

    /** 弹窗式新建项目 */
    _promptAddProject() {
      const name = prompt('项目名称：');
      if (!name || !name.trim()) return;
      const project = this.projects.create({ name: name.trim() });
      // 自动进入详情
      this._view = 'detail';
      this._activeProjectId = project.id;
      this._render();
    }

    /** 弹窗式编辑项目字段 */
    _promptEditField(field) {
      const project = this.projects.getById(this._activeProjectId);
      if (!project) return;
      const labels = { background: '项目背景', businessGoal: '业务目标', designBrief: '设计 Brief', visualDirection: '视觉方向' };
      const current = project[field] || '';
      const value = prompt(`${labels[field] || field}：`, current);
      if (value === null) return; // 取消
      this.projects.update(project.id, { [field]: value });
    }

    // =========== 工具 ===========

    _esc(str) {
      const div = document.createElement('div');
      div.textContent = str || '';
      return div.innerHTML;
    }

    _relativeTime(ts) {
      const diff = Date.now() - ts;
      if (diff < 60000) return '刚刚';
      if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
      if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
      if (diff < 604800000) return Math.floor(diff / 86400000) + ' 天前';
      const d = new Date(ts);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    }
  }

  window.WorkspaceComponent = WorkspaceComponent;
})();
