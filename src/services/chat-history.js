/**
 * 聊天历史服务
 * 职责：多会话持久化、CRUD、按时间分组归档
 *
 * 数据结构：
 * {
 *   sessions: [
 *     { id, title, createdAt, updatedAt, folderId, pinned, messages: [...] }
 *   ],
 *   folders: [{ id, name, createdAt, collapsed }],
 *   activeId: string
 * }
 */
(function() {
  const storage = new window.TeemoStorageService();
  const DIR = storage.getDir();
  const FILE = storage.getPath('chat-history.json');

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

  function _sanitizeContent(content) {
    if (typeof content !== 'string') return content;
    if (!/data:image|!\[[^\]]*\]\(data:/i.test(content)) return content;
    if (window.TeemoMessageSanitize) return window.TeemoMessageSanitize.stripForApi(content);
    return content
      .replace(/!\[[^\]]*\]\(\s*data:[^)]+\)/g, '[图片]')
      .replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=\s]+/gi, '[图片]');
  }

  function _sanitizeSession(session) {
    if (!session || !Array.isArray(session.messages)) return;
    session.messages.forEach(msg => {
      if (msg && typeof msg.content === 'string' && /data:image/i.test(msg.content)) {
        msg.content = _sanitizeContent(msg.content);
      }
    });
  }

  class ChatHistoryService {
    constructor() {
      storage.ensureDir();
      this.data = this._load();
      this.listeners = new Set();
    }

    _load() {
      try {
        if (!storage.exists('chat-history.json')) {
          const init = { sessions: [], folders: [], activeId: null };
          this._writeFile(init);
          return init;
        }
        const raw = storage.readJson('chat-history.json', null);
        if (!raw || typeof raw !== 'object') throw new Error('invalid chat history');
        if (!raw.sessions) raw.sessions = [];
        if (!Array.isArray(raw.folders)) raw.folders = [];
        const folderIds = new Set(raw.folders.map(folder => folder && folder.id).filter(Boolean));
        raw.folders = raw.folders
          .filter(folder => folder && folder.id && folder.name)
          .map(folder => ({
            id: folder.id,
            name: String(folder.name || '未命名分组').slice(0, 30),
            createdAt: folder.createdAt || Date.now(),
            collapsed: folder.collapsed === true,
          }));
        raw.sessions.forEach(session => {
          session.pinned = session.pinned === true;
          if (session.pinned && !session.pinnedAt) session.pinnedAt = session.updatedAt || session.createdAt || Date.now();
          if (session.folderId && !folderIds.has(session.folderId)) session.folderId = null;
          if (!session.folderId) session.folderId = null;
          _sanitizeSession(session);
        });
        return raw;
      } catch (e) {
        console.warn('[ChatHistory] load failed:', e);
        return { sessions: [], folders: [], activeId: null };
      }
    }

    _writeFile(data) {
      try {
        storage.writeJson('chat-history.json', data);
      } catch (e) {
        console.warn('[ChatHistory] save failed:', e);
      }
    }

    _persist() {
      if (this.data && Array.isArray(this.data.sessions)) {
        this.data.sessions.forEach(session => _sanitizeSession(session));
      }
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

    /** 获取所有会话（置顶优先；各组内按更新时间倒序） */
    getAll() {
      return this.data.sessions.slice().sort((a, b) => {
        if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
        if (a.pinned && b.pinned) return (b.pinnedAt || b.updatedAt) - (a.pinnedAt || a.updatedAt);
        return b.updatedAt - a.updatedAt;
      });
    }

    /** 自定义分组列表 */
    getFolders() {
      return (this.data.folders || []).slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    }

    /** 侧边栏分组：置顶 → 自定义分组 → 未分组(按时间) */
    getGrouped() {
      const all = this.getAll();
      const result = [];
      const pinned = all.filter(session => session.pinned);
      if (pinned.length) result.push({ type: 'pin', label: '置顶', items: pinned });

      const folders = this.getFolders();
      folders.forEach(folder => {
        const items = all.filter(session => !session.pinned && session.folderId === folder.id);
        result.push({
          type: 'folder',
          id: folder.id,
          label: folder.name,
          collapsed: folder.collapsed === true,
          items,
        });
      });

      const ungrouped = all.filter(session => !session.pinned && !session.folderId);
      const timeGroups = new Map();
      ungrouped.forEach(session => {
        const label = groupLabel(session.updatedAt);
        if (!timeGroups.has(label)) timeGroups.set(label, []);
        timeGroups.get(label).push(session);
      });
      const order = ['今天', '昨天', '本周内', '本月内', '更早'];
      order.filter(label => timeGroups.has(label)).forEach(label => {
        result.push({ type: 'time', label, items: timeGroups.get(label) });
      });
      return result;
    }

    createFolder(name) {
      const text = String(name || '').trim().slice(0, 30);
      if (!text) return null;
      if (!Array.isArray(this.data.folders)) this.data.folders = [];
      const folder = {
        id: _uid('f'),
        name: text,
        createdAt: Date.now(),
        collapsed: false,
      };
      this.data.folders.push(folder);
      this._persist();
      return folder;
    }

    renameFolder(id, name) {
      const folder = (this.data.folders || []).find(item => item.id === id);
      if (!folder) return false;
      const text = String(name || '').trim().slice(0, 30);
      if (!text) return false;
      folder.name = text;
      this._persist();
      return true;
    }

    removeFolder(id) {
      if (!Array.isArray(this.data.folders)) return false;
      const before = this.data.folders.length;
      this.data.folders = this.data.folders.filter(folder => folder.id !== id);
      this.data.sessions.forEach(session => {
        if (session.folderId === id) session.folderId = null;
      });
      if (this.data.folders.length !== before) {
        this._persist();
        return true;
      }
      return false;
    }

    toggleFolderCollapsed(id, force) {
      const folder = (this.data.folders || []).find(item => item.id === id);
      if (!folder) return false;
      folder.collapsed = force === undefined ? !folder.collapsed : !!force;
      this._persist();
      return folder.collapsed;
    }

    setSessionFolder(sessionId, folderId) {
      const session = this.data.sessions.find(item => item.id === sessionId);
      if (!session) return false;
      if (folderId) {
        const exists = (this.data.folders || []).some(folder => folder.id === folderId);
        if (!exists) return false;
        session.folderId = folderId;
      } else {
        session.folderId = null;
      }
      session.updatedAt = Date.now();
      this._persist();
      return true;
    }

    /** 创建新会话 */
    create(systemPrompt) {
      const now = Date.now();
      const session = {
        id: _uid('s'),
        title: '新对话',
        createdAt: now,
        updatedAt: now,
        folderId: null,
        pinned: false,
        pinnedAt: 0,
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

    /** 置顶或取消置顶会话 */
    togglePin(id, force) {
      const session = this.data.sessions.find(item => item.id === id);
      if (!session) return false;
      session.pinned = force === undefined ? !session.pinned : !!force;
      session.pinnedAt = session.pinned ? Date.now() : 0;
      this._persist();
      return session.pinned;
    }

    /** 向当前会话追加消息 */
    addMessage(role, content) {
      let active = this.getActive();
      if (!active) {
        // 没有激活会话，自动新建（含默认 system）
        active = this.create('');
      }
      const msg = { id: _uid('m'), role, content: _sanitizeContent(content), ts: Date.now() };
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
      last.content = _sanitizeContent(content);
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
        // 优先保留置顶会话，其余按 updatedAt 倒序裁剪。
        this.data.sessions = this.getAll().slice(0, MAX_SESSIONS);
      }
    }
  }

  window.ChatHistoryService = ChatHistoryService;
  window.ChatHistoryUtils = { groupLabel, relativeTime };
})();
