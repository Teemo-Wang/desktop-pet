/**
 * 日报数据聚合器
 * 职责：把待办、钉钉、语雀、统计四路数据揉成 morning/evening 报数据
 *      不含 UI，便于单元测试和 UI 替换
 *
 * 用法：
 *   const brief = new DailyBriefService({ todos, dingtalk, yuque, stats });
 *   const morning = await brief.buildMorning();
 *   const evening = await brief.buildEvening();
 */
(function() {

  /** 取问候语 */
  function _greeting() {
    const h = new Date().getHours();
    if (h < 6) return '凌晨好';
    if (h < 11) return '早上好';
    if (h < 14) return '中午好';
    if (h < 18) return '下午好';
    if (h < 22) return '晚上好';
    return '夜深了';
  }

  /** 一条 motto，按星期/心情轮换 */
  function _motto() {
    const day = new Date().getDay();
    const weekdayMotto = {
      0: '周日休息日，养精蓄锐 🛋️',
      1: '新的一周开始啦，先列个清单 📋',
      2: '周二状态在线，开始攻坚 ⚡',
      3: '周三过半，节奏稳一稳 🌿',
      4: '周四冲刺日，多线并行也别慌 🚀',
      5: '周五啦，把这周收个尾 ✅',
      6: '周末快乐，记得 unplug 🎈',
    };
    return weekdayMotto[day] || '今天也辛苦了 ☕';
  }

  /**
   * 把待办按"今天到期 / 已逾期 / 进行中 / 高优先级未开始"分组
   * @param {Array} todos
   */
  function _categorizeTodos(todos) {
    const now = Date.now();
    const todayEnd = (() => {
      const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime();
    })();

    const overdue = [];
    const dueToday = [];
    const doing = [];
    const importantPending = [];

    for (const t of todos) {
      if (t.status === 'done' || t.status === 'cancelled') continue;
      if (t.deadline && t.deadline < now) {
        overdue.push(t);
      } else if (t.deadline && t.deadline <= todayEnd) {
        dueToday.push(t);
      } else if (t.status === 'doing') {
        doing.push(t);
      } else if (t.priority === 'high') {
        importantPending.push(t);
      }
    }

    // 按 deadline 升序，无 deadline 的放后面
    const sortByDeadline = (a, b) => (a.deadline || Infinity) - (b.deadline || Infinity);
    return {
      overdue: overdue.sort(sortByDeadline),
      dueToday: dueToday.sort(sortByDeadline),
      doing: doing.sort(sortByDeadline),
      importantPending: importantPending.sort(sortByDeadline),
    };
  }

  class DailyBriefService {
    constructor({ todos, dingtalk, yuque, stats }) {
      this.todos = todos;
      this.dingtalk = dingtalk;
      this.yuque = yuque;
      this.stats = stats;
    }

    /** 构建早安数据 */
    async buildMorning() {
      const all = this.todos.getAll();
      const cats = _categorizeTodos(all);
      const unread = await this.dingtalk.getUnreadCount();

      // 前几条聚合成可读 highlight（最多 5 条）
      const highlights = [];
      for (const t of cats.overdue.slice(0, 3)) highlights.push({ kind: 'overdue', todo: t });
      for (const t of cats.dueToday.slice(0, 3)) highlights.push({ kind: 'dueToday', todo: t });
      for (const t of cats.doing.slice(0, 2)) highlights.push({ kind: 'doing', todo: t });
      for (const t of cats.importantPending.slice(0, 2)) highlights.push({ kind: 'important', todo: t });

      // 取前 5 条作为主推
      const focused = highlights.slice(0, 5);

      // 简短摘要：用于 IP 气泡 / 通知
      const summary = this._buildSummaryText({
        overdueCount: cats.overdue.length,
        dueTodayCount: cats.dueToday.length,
        doingCount: cats.doing.length,
        unread,
      });

      return {
        kind: 'morning',
        greeting: _greeting(),
        motto: _motto(),
        date: new Date(),
        unreadMessages: unread,
        todos: cats,
        focused,
        summary,
        // 给"一键开始今天"用：把高优 + 今天到期且未开始的转成 doing 候选
        startTodayCandidates: cats.dueToday
          .concat(cats.importantPending)
          .filter(t => t.status === 'todo')
          .slice(0, 5),
      };
    }

    /** 构建晚报数据 */
    async buildEvening() {
      const today = this.stats.today();
      const yesterday = this.stats.yesterday();

      const all = this.todos.getAll();
      const completedToday = all.filter(t => {
        if (t.status !== 'done' || !t.completedAt) return false;
        return _isSameDay(t.completedAt, Date.now());
      });

      const stillPending = all.filter(t =>
        t.status !== 'done' && t.status !== 'cancelled'
      ).length;

      return {
        kind: 'evening',
        greeting: _greeting(),
        date: new Date(),
        completed: completedToday,
        stats: today,
        compareYesterday: {
          completed: today.todoCompleted - yesterday.todoCompleted,
          messageHandled: today.messageHandled - yesterday.messageHandled,
        },
        stillPending,
      };
    }

    _buildSummaryText({ overdueCount, dueTodayCount, doingCount, unread }) {
      const parts = [];
      if (overdueCount > 0) parts.push(`⚠️ ${overdueCount} 项已逾期`);
      if (dueTodayCount > 0) parts.push(`⏰ ${dueTodayCount} 项今天到期`);
      if (doingCount > 0) parts.push(`🔵 ${doingCount} 项进行中`);
      if (unread > 0) parts.push(`💬 ${unread} 条未读`);
      if (parts.length === 0) return '今天暂无紧急事项，状态轻松 ✨';
      return parts.join('  ·  ');
    }
  }

  function _isSameDay(ts1, ts2) {
    const a = new Date(ts1), b = new Date(ts2);
    return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
  }

  window.DailyBriefService = DailyBriefService;
})();
