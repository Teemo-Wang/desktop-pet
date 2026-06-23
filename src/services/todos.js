/**
 * 待办数据服务
 * 职责：CRUD、本地持久化、到期提醒轮询、未完成数广播
 *
 * 数据结构：
 * {
 *   id: string,                      // 唯一 ID
 *   title: string,                   // 标题
 *   status: 'todo'|'doing'|'done',   // 状态
 *   priority: 'high'|'medium'|'low', // 优先级
 *   deadline: number|null,           // 截止时间戳（ms），可空
 *   deadlineText: string,            // 展示文本（自动生成）
 *   createdAt: number,
 *   completedAt: number|null,
 *   remindedAt: number|null,         // 最近一次提醒时间，避免重复
 *   fromChat: string|null,           // 来源会话名（AI 转待办时）
 *   projectId: string|null,          // 关联项目 ID，null = 无项目关联
 * }
 */
(function() {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  const DIR = path.join(os.homedir(), '.hellobike-pet');
  const FILE = path.join(DIR, 'todos.json');

  // 提醒轮询频率：30 秒
  const POLL_INTERVAL = 30 * 1000;
  // 到期前多少毫秒触发提醒
  const REMIND_BEFORE = 30 * 60 * 1000; // 30 分钟

  // 默认 Mock（首次启动时填充，让面板不空）
  // projectId 字段：关联项目 ID，null 表示独立待办
  const SEED_TODOS = [
    { id: _uid(), title: '新车 Banner 初稿', status: 'doing', priority: 'high', deadline: _todayAt(18, 0), createdAt: Date.now(), completedAt: null, remindedAt: null, fromChat: null, projectId: null },
    { id: _uid(), title: '骑行卡切图交付', status: 'doing', priority: 'high', deadline: _tomorrowAt(12, 0), createdAt: Date.now(), completedAt: null, remindedAt: null, fromChat: null, projectId: null },
    { id: _uid(), title: '确认新车三视图素材', status: 'todo', priority: 'medium', deadline: _tomorrowAt(18, 0), createdAt: Date.now(), completedAt: null, remindedAt: null, fromChat: null, projectId: null },
    { id: _uid(), title: '设计评审 PPT 准备', status: 'todo', priority: 'medium', deadline: _daysLater(2, 14, 0), createdAt: Date.now(), completedAt: null, remindedAt: null, fromChat: null, projectId: null },
    { id: _uid(), title: '618 活动页视觉方案', status: 'todo', priority: 'low', deadline: _daysLater(7, 18, 0), createdAt: Date.now(), completedAt: null, remindedAt: null, fromChat: null, projectId: null },
    { id: _uid(), title: '彩蛋车贴纸设计', status: 'done', priority: 'high', deadline: null, createdAt: Date.now() - 86400000, completedAt: Date.now() - 3600000, remindedAt: null, fromChat: null, projectId: null },
    { id: _uid(), title: 'Q1 设计复盘文档', status: 'done', priority: 'medium', deadline: null, createdAt: Date.now() - 172800000, completedAt: Date.now() - 86400000, remindedAt: null, fromChat: null, projectId: null },
  ];

  function _uid() {
    return 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function _todayAt(h, m) {
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.getTime();
  }

  function _tomorrowAt(h, m) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(h, m, 0, 0);
    return d.getTime();
  }

  function _daysLater(days, h, m) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(h, m, 0, 0);
    return d.getTime();
  }

  /**
   * 把时间戳格式化为人类可读的展示文本
   * @param {number|null} ts
   */
  function formatDeadline(ts) {
    if (!ts) return '';
    const now = new Date();
    const target = new Date(ts);
    const diff = ts - now.getTime();
    const sameDay = now.toDateString() === target.toDateString();
    const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = tomorrow.toDateString() === target.toDateString();
    const time = `${String(target.getHours()).padStart(2, '0')}:${String(target.getMinutes()).padStart(2, '0')}`;

    if (diff < 0) {
      const overdueMin = Math.abs(Math.floor(diff / 60000));
      if (overdueMin < 60) return `已逾期 ${overdueMin}m`;
      const overdueHr = Math.floor(overdueMin / 60);
      if (overdueHr < 24) return `已逾期 ${overdueHr}h`;
      return `已逾期 ${Math.floor(overdueHr / 24)}d`;
    }
    if (sameDay) return `今天 ${time}`;
    if (isTomorrow) return `明天 ${time}`;
    const daysAway = Math.ceil(diff / 86400000);
    if (daysAway < 7) return `${daysAway} 天后 ${time}`;
    return `${target.getMonth() + 1}/${target.getDate()} ${time}`;
  }

  class TodoService {
    constructor() {
      if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
      this.items = this._load();
      this.listeners = new Set();      // 数据变更监听（用于 UI 重渲）
      this.remindListeners = new Set(); // 到期提醒监听（用于通知气泡）
      this.pollTimer = null;
    }

    /** 加载数据；首次启动写入 seed；向后兼容无 projectId 的旧数据 */
    _load() {
      try {
        if (!fs.existsSync(FILE)) {
          this._writeFile(SEED_TODOS);
          return JSON.parse(JSON.stringify(SEED_TODOS));
        }
        const raw = fs.readFileSync(FILE, 'utf-8');
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return [];
        // 向后兼容：旧数据缺失 projectId 字段时自动补 null
        for (const item of arr) {
          if (!('projectId' in item)) item.projectId = null;
        }
        return arr;
      } catch (e) {
        console.warn('[TodoService] load failed, fallback to seed:', e);
        return JSON.parse(JSON.stringify(SEED_TODOS));
      }
    }

    _writeFile(data) {
      try {
        fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf-8');
      } catch (e) {
        console.warn('[TodoService] save failed:', e);
      }
    }

    _persist() {
      this._writeFile(this.items);
      this._emit();
    }

    _emit() {
      this.listeners.forEach(fn => {
        try { fn(this.items); } catch (e) { console.warn(e); }
      });
    }

    /** 订阅数据变更 */
    onChange(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }

    /** 订阅到期提醒 */
    onRemind(fn) {
      this.remindListeners.add(fn);
      return () => this.remindListeners.delete(fn);
    }

    /** 获取全部 */
    getAll() {
      return this.items.slice();
    }

    /** 按状态筛选 */
    getByStatus(status) {
      if (status === 'all') return this.getAll();
      return this.items.filter(t => t.status === status);
    }

    /** 未完成数（todo + doing） */
    getUnfinishedCount() {
      return this.items.filter(t => t.status !== 'done' && t.status !== 'cancelled').length;
    }

    /**
     * 新建
     * @param {object} payload - { title, priority?, deadline?, status?, fromChat?, projectId? }
     */
    create(payload) {
      const now = Date.now();
      const item = {
        id: _uid(),
        title: (payload.title || '未命名').trim(),
        status: payload.status || 'todo',
        priority: payload.priority || 'medium',
        deadline: payload.deadline || null,
        createdAt: now,
        completedAt: null,
        remindedAt: null,
        fromChat: payload.fromChat || null,
        projectId: payload.projectId || null,
      };
      this.items.unshift(item);
      this._persist();
      return item;
    }

    /**
     * 批量新建（AI 转待办场景）
     * @param {Array<object>} list
     */
    createBatch(list) {
      const created = list.map(p => {
        const now = Date.now();
        return {
          id: _uid(),
          title: (p.title || '未命名').trim(),
          status: p.status || 'todo',
          priority: p.priority || 'medium',
          deadline: p.deadline || null,
          createdAt: now,
          completedAt: null,
          remindedAt: null,
          fromChat: p.fromChat || null,
          projectId: p.projectId || null,
        };
      });
      this.items = created.concat(this.items);
      this._persist();
      return created;
    }

    /** 更新 */
    update(id, patch) {
      const idx = this.items.findIndex(t => t.id === id);
      if (idx < 0) return null;
      this.items[idx] = Object.assign({}, this.items[idx], patch);
      this._persist();
      return this.items[idx];
    }

    /** 切换完成状态 */
    toggleDone(id) {
      const item = this.items.find(t => t.id === id);
      if (!item) return null;
      if (item.status === 'done') {
        return this.update(id, { status: 'todo', completedAt: null });
      }
      return this.update(id, { status: 'done', completedAt: Date.now() });
    }

    /** 中止任务（不删除，保留为 cancelled，可恢复） */
    cancel(id) {
      const item = this.items.find(t => t.id === id);
      if (!item) return null;
      return this.update(id, { status: 'cancelled', completedAt: null });
    }

    /** 恢复中止/完成的任务到 todo */
    restore(id) {
      return this.update(id, { status: 'todo', completedAt: null });
    }

    /** 删除 */
    remove(id) {
      const before = this.items.length;
      this.items = this.items.filter(t => t.id !== id);
      if (this.items.length !== before) this._persist();
    }

    /** 按项目 ID 筛选待办 */
    getByProject(projectId) {
      if (!projectId) return this.items.filter(t => !t.projectId);
      return this.items.filter(t => t.projectId === projectId);
    }

    /**
     * 获取今日相关待办（跨项目）
     * 包含：今天到期 + 已逾期未完成 + 24h 内即将到期
     */
    getTodayTodos() {
      const now = Date.now();
      const todayEnd = (() => {
        const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime();
      })();
      const next24h = now + 24 * 60 * 60 * 1000;

      return this.items.filter(t => {
        if (t.status === 'done' || t.status === 'cancelled') return false;
        if (!t.deadline) return false;
        // 已逾期 或 今天到期 或 24h 内到期
        return t.deadline < next24h;
      }).sort((a, b) => (a.deadline || Infinity) - (b.deadline || Infinity));
    }

    /**
     * 清空某项目的关联（项目被删除时调用）
     * 不删除待办本身，只把 projectId 置空
     */
    clearProjectId(projectId) {
      let dirty = false;
      for (const item of this.items) {
        if (item.projectId === projectId) {
          item.projectId = null;
          dirty = true;
        }
      }
      if (dirty) this._persist();
    }

    /** 启动到期提醒轮询 */
    startReminder() {
      if (this.pollTimer) return;
      this._checkOverdue(); // 启动时立即检查一次
      this.pollTimer = setInterval(() => this._checkOverdue(), POLL_INTERVAL);
    }

    stopReminder() {
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
    }

    /** 检查到期 / 即将到期，触发提醒回调 */
    _checkOverdue() {
      const now = Date.now();
      let dirty = false;
      for (const item of this.items) {
        if (item.status === 'done' || item.status === 'cancelled' || !item.deadline) continue;
        const diff = item.deadline - now;
        // 进入提醒窗口（含已逾期），且距离上次提醒 > 30 分钟
        if (diff <= REMIND_BEFORE) {
          const lastRemind = item.remindedAt || 0;
          if (now - lastRemind >= 30 * 60 * 1000) {
            item.remindedAt = now;
            dirty = true;
            // 广播
            this.remindListeners.forEach(fn => {
              try { fn(item); } catch (e) { console.warn(e); }
            });
          }
        }
      }
      if (dirty) this._writeFile(this.items);
    }
  }

  // 工具函数挂到全局给 UI 用
  window.TodoService = TodoService;
  window.TodoUtils = { formatDeadline };
})();
