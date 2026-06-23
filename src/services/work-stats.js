/**
 * 工作统计服务
 * 职责：持久化记录每日工作数据，供日报使用
 *   - 今日完成的待办数
 *   - 今日新建的待办数
 *   - 今日处理的钉钉消息数
 *   - 桌宠唤醒次数 / 最近一次唤醒时间
 *
 * 数据按天分桶（YYYY-MM-DD），跨天自动新建桶
 * 文件：~/.hellobike-pet/work-stats.json
 */
(function() {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  const DIR = path.join(os.homedir(), '.hellobike-pet');
  const FILE = path.join(DIR, 'work-stats.json');
  // 历史保留天数（超过自动裁剪）
  const RETAIN_DAYS = 30;

  function _todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** 默认空桶 */
  function _emptyBucket() {
    return {
      todoCompleted: 0,
      todoCreated: 0,
      todoCancelled: 0,
      messageHandled: 0,    // 处理过的消息数（点开/总结/转待办都算）
      docOpened: 0,         // 打开过的文档数
      petAwakened: 0,       // 唤醒次数
      firstAwakeAt: null,   // 首次唤醒时间戳
      lastAwakeAt: null,
    };
  }

  class WorkStatsService {
    constructor() {
      if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
      this.data = this._load();
      this._ensureToday();
    }

    _load() {
      try {
        if (!fs.existsSync(FILE)) return { buckets: {} };
        const raw = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
        if (!raw.buckets) raw.buckets = {};
        return raw;
      } catch (e) {
        console.warn('[WorkStats] load failed:', e);
        return { buckets: {} };
      }
    }

    _persist() {
      try {
        fs.writeFileSync(FILE, JSON.stringify(this.data, null, 2), 'utf-8');
      } catch (e) {
        console.warn('[WorkStats] save failed:', e);
      }
    }

    /** 确保今天的桶存在；同时裁剪老数据 */
    _ensureToday() {
      const key = _todayKey();
      if (!this.data.buckets[key]) this.data.buckets[key] = _emptyBucket();
      this._trimOldBuckets();
    }

    _trimOldBuckets() {
      const keys = Object.keys(this.data.buckets).sort().reverse();
      if (keys.length <= RETAIN_DAYS) return;
      const keep = new Set(keys.slice(0, RETAIN_DAYS));
      const next = {};
      for (const k of keys) if (keep.has(k)) next[k] = this.data.buckets[k];
      this.data.buckets = next;
    }

    /** 取今日桶 */
    today() {
      this._ensureToday();
      return this.data.buckets[_todayKey()];
    }

    /** 取指定日期桶（YYYY-MM-DD），不存在返回空桶 */
    getByDate(dateKey) {
      return this.data.buckets[dateKey] || _emptyBucket();
    }

    /** 是否是今天首次唤醒（用于触发早安卡片） */
    isFirstAwakeOfDay() {
      return !this.today().firstAwakeAt;
    }

    /** 是否还没在今天展示过早安卡片 */
    shouldShowMorning() {
      // 简化判断：首次唤醒就显示一次；二次唤醒不重复显示
      // （app 层会把展示后的状态记到 lastAwakeAt 上）
      return this.isFirstAwakeOfDay();
    }

    /** 记录唤醒 */
    recordAwake() {
      const t = this.today();
      const now = Date.now();
      if (!t.firstAwakeAt) t.firstAwakeAt = now;
      t.lastAwakeAt = now;
      t.petAwakened += 1;
      this._persist();
    }

    /** 通用计数器自增 */
    increment(key, n = 1) {
      const t = this.today();
      if (typeof t[key] !== 'number') return;
      t[key] += n;
      this._persist();
    }

    /** 获取昨天的桶（用于晚报对比） */
    yesterday() {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return this.getByDate(k);
    }
  }

  window.WorkStatsService = WorkStatsService;
  window.WorkStatsUtils = { todayKey: _todayKey };
})();
