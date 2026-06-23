/**
 * 聊天历史服务
 * 职责：多会话持久化、CRUD、按时间分组归档
 *
 * 数据结构：
 * {
 *   sessions: [
 *     { id, title, createdAt, updatedAt, messages: [{ id, role, content, ts }] }
 *   ],
 *   activeId: string
 * }
 */
(function() {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  const DIR = path.join(os.homedir(), '.hellobike-pet');
  const FILE = path.join(DIR, 'chat-history.json');

  // 单条消息上限：避免 system+history 累计过长
  const MAX_MESSAGES_PER_SESSION = 200;
  // 会话上限：超过则裁剪最旧的
  const MAX_SESSIONS = 50;

  function _uid(prefix) {
    return (prefix || 'c') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function _todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** 时间戳 → 分组标签 */
  function groupLabel(ts) {
    const d = new Date(ts);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return '今天';
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return '昨天';
    const diffDays = Math.floor((now - d) / 86400000);
    if (diffDays < 7) return '本周内';
    if (diffDays < 30) return '本月内';
    return '更早';
  }

  /** 时间戳 → 列表展示用相对时间 */
  function relativeTime(ts) {
    const d = new Date(ts);
    const now = Date.now();
    const diff = now - ts;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
    const sameYear = d.getFullYear() === new Date().getFullYear();
    if (sameYear) return `${d.getMonth() + 1}/${d.getDate()}`;
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  }

  class ChatHistoryService {
    constructor() {
      if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
      this.data = this._load();
      this.listeners = new Set();
    }

    _load() {
      try {
        if (!fs.existsSync(FILE)) {
          const init = { sessions: [], activeId: null };
          this._writeFile(init);
          return init;
        }
        const raw = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
        if (!raw.sessions) raw.sessions = [];
        return raw;
      } catch (e) {
        console.warn('[ChatHistory] load failed:', e);
        return { sessions: [], activeId: null };
      }
    }

    _writeFile(data) {
      try {
        fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf-8');
      } catch (e) {
        console.warn('[ChatHistory] save failed:', e);
      }
    }

    _persist() {
      this._writeFile(this.data);
      this._emit();
    }

    _emit() {
      this.listeners.forEach(fn => {
        try { fn(this.data); } catch (e) { console.warn(e); }
      });
    }

    onChange(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }

    /** 当前激活会话 */
    getActive() {
      if (!this.data.activeId) return null;
      return this.data.sessions.find(s => s.id === this.data.activeId) || null;
    }

    /** 获取所有会话（按 updatedAt 倒序） */
    getAll() {
      return this.data.sessions.slice().sort((a, b) => b.updatedAt - a.updatedAt);
    }

    /** 按分组返回 */
    getGrouped() {
      const groups = new Map();
      for (const s of this.getAll()) {
        const label = groupLabel(s.updatedAt);
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label).push(s);
      }
      // 保持期望顺序
      const order = ['今天', '昨天', '本周内', '本月内', '更早'];
      return order.filter(k => groups.has(k)).map(k => ({ label: k, items: groups.get(k) }));
    }

    /** 创建新会话 */
    create(systemPrompt) {
      const now = Date.now();
      const session = {
        id: _uid('s'),
        title: '新对话',
        createdAt: now,
        updatedAt: now,
        messages: systemPrompt ? [{ id: _uid('m'), role: 'system', content: systemPrompt, ts: now }] : [],
      };
      this.data.sessions.unshift(session);
      this.data.activeId = session.id;
      this._trimSessions();
      this._persist();
      return session;
    }

    /** 切换激活 */
    setActive(id) {
      if (this.data.sessions.find(s => s.id === id)) {
        this.data.activeId = id;
        this._persist();
      }
    }

    /** 删除会话 */
    remove(id) {
      const before = this.data.sessions.length;
      this.data.sessions = this.data.sessions.filter(s => s.id !== id);
      if (this.data.activeId === id) {
        this.data.activeId = this.data.sessions[0]?.id || null;
      }
      if (this.data.sessions.length !== before) this._persist();
    }

    /** 重命名 */
    rename(id, title) {
      const s = this.data.sessions.find(s => s.id === id);
      if (!s) return;
      s.title = (title || '未命名').slice(0, 50);
      s.updatedAt = Date.now();
      this._persist();
    }

    /** 向当前会话追加消息 */
    addMessage(role, content) {
      let active = this.getActive();
      if (!active) {
        // 没有激活会话，自动新建（含默认 system）
        active = this.create('');
      }
      const msg = { id: _uid('m'), role, content, ts: Date.now() };
      active.messages.push(msg);
      active.updatedAt = msg.ts;
      // 如果是首条用户消息，用前 20 字作为标题
      if (active.title === '新对话' && role === 'user') {
        active.title = content.slice(0, 20).replace(/\n/g, ' ').trim() || '新对话';
      }
      // 裁剪过长历史
      if (active.messages.length > MAX_MESSAGES_PER_SESSION) {
        // 保留 system + 最近的消息
        const sys = active.messages.find(m => m.role === 'system');
        const tail = active.messages.slice(-MAX_MESSAGES_PER_SESSION + (sys ? 1 : 0));
        active.messages = sys ? [sys, ...tail] : tail;
      }
      this._persist();
      return msg;
    }

    /** 替换最后一条消息（流式更新场景） */
    updateLastMessage(content) {
      const active = this.getActive();
      if (!active || active.messages.length === 0) return;
      const last = active.messages[active.messages.length - 1];
      last.content = content;
      active.updatedAt = Date.now();
      // 流式期间频繁写入会很费 IO；这里只更新内存，由上层在结束时调用 flush
    }

    /** 显式持久化（流式结束时调用） */
    flush() {
      this._persist();
    }

    /** 重置当前会话的 system prompt（用户改了系统提示词时） */
    setSystemPrompt(prompt) {
      const active = this.getActive();
      if (!active) return;
      const sys = active.messages.find(m => m.role === 'system');
      if (sys) sys.content = prompt;
      else active.messages.unshift({ id: _uid('m'), role: 'system', content: prompt, ts: Date.now() });
      this._persist();
    }

    _trimSessions() {
      if (this.data.sessions.length > MAX_SESSIONS) {
        // 按 updatedAt 倒序保留 MAX_SESSIONS 条
        this.data.sessions.sort((a, b) => b.updatedAt - a.updatedAt);
        this.data.sessions = this.data.sessions.slice(0, MAX_SESSIONS);
      }
    }
  }

  window.ChatHistoryService = ChatHistoryService;
  window.ChatHistoryUtils = { groupLabel, relativeTime };
})();
