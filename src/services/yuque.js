/**
 * 语雀服务（编排层）
 *
 * 行为策略：
 *   - 配置了 Token → 走真实 API（YuqueAPI + YuqueCache）
 *   - 没配置 Token → 走 Mock 数据演示
 *
 * 对外 API 保持不变，UI 层无需改动。
 */
(function() {

  // ===== Mock 数据（无 Token 时使用，保留原 demo 体验） =====
  const MOCK_DOCS = {
    'new-bike-spec': {
      id: 'd1', title: '新车曝光资源位工作手册', author: '设计-小哈',
      updated: '2小时前', words: 3200,
      content: '# 新车曝光资源位工作手册\n\n## 一、资源位概述\n新车曝光资源位是哈啰两轮 App 首页核心运营位。\n\n## 二、设计规范\n- 首页 Banner：750×360px @2x\n- 场景卡：340×200px @2x\n- Tab 图标：96×96px，安全区 72×72px\n- 场景卡文案≤3字，动态文案≤6字'
    },
    'design-spec-q2': {
      id: 'd2', title: '2026 Q2 设计规范更新', author: '设计组',
      updated: '昨天', words: 5600,
      content: '# 2026 Q2 设计规范更新\n\n## 色彩系统\n- 主色 #0076FF 不变\n- 新增渐变 #0076FF → #1492FF\n- 辅助色新增活力橙 #FF6D00'
    },
    'easter-egg-sop': {
      id: 'd3', title: '彩蛋车链路梳理 SOP', author: '设计-小哈',
      updated: '3天前', words: 2100,
      content: '# 彩蛋车链路梳理 SOP\n\n## 设计链路\n1. 运营确定主题和奖励\n2. 设计制作车身贴纸\n3. 开发配置识别逻辑'
    },
    'test-doc': {
      id: 'd4', title: '【测试文档】桌宠功能演示用例', author: '桌宠 Demo',
      updated: '刚刚', words: 1500,
      content: '# 桌宠功能演示用例\n\n## 一、需求背景\n2026 年 Q2，哈啰两轮要做一次"夏日骑行"主题活动。\n\n## 二、核心目标\n- 提升新用户首周骑行率 15%\n- 强化"夏日 + 哈啰蓝"心智'
    },
  };

  class YuqueService {
    constructor() {
      this.connected = false;
      this.recent = [];
      this.userInfo = null;
      this.api = new window.YuqueAPI();
      this.cache = new window.YuqueCache();
      // Electron 主进程 IPC（复用 dragon-mcp 团队 Token，零配置读取内网语雀）
      try { this.ipc = require('electron').ipcRenderer; } catch (e) { this.ipc = null; }
      // 从本地存储恢复"最近读取"记忆（重启不丢失）
      this.recent = this._loadRecent();
      // 恢复收藏列表
      this.favorites = this._loadFavorites();
      // 恢复回收站列表（最近删除）
      this.trash = this._loadTrash();
    }

    // localStorage 键名
    static get RECENT_KEY() { return 'yq_recent_docs'; }
    static get FAV_KEY() { return 'yq_favorite_docs'; }
    static get TRASH_KEY() { return 'yq_trash_docs'; }

    /** 从 localStorage 读取最近文档列表 */
    _loadRecent() {
      try {
        const raw = localStorage.getItem(YuqueService.RECENT_KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
      } catch (e) {
        return [];
      }
    }

    /** 持久化最近文档列表到 localStorage */
    _saveRecent() {
      try {
        localStorage.setItem(YuqueService.RECENT_KEY, JSON.stringify(this.recent));
      } catch (e) {
        console.warn('[yuque] 保存最近读取失败:', e);
      }
    }

    /** 从 localStorage 读取收藏列表 */
    _loadFavorites() {
      try {
        const raw = localStorage.getItem(YuqueService.FAV_KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
      } catch (e) {
        return [];
      }
    }

    /** 持久化收藏列表 */
    _saveFavorites() {
      try {
        localStorage.setItem(YuqueService.FAV_KEY, JSON.stringify(this.favorites));
      } catch (e) {
        console.warn('[yuque] 保存收藏失败:', e);
      }
    }

    /** 获取收藏列表 */
    getFavorites() {
      return this.favorites;
    }

    /** 是否已收藏 */
    isFavorited(id) {
      return this.favorites.some(d => d.id === id);
    }

    /** 切换收藏状态。返回切换后的状态（true=已收藏） */
    toggleFavorite(doc) {
      const idx = this.favorites.findIndex(d => d.id === doc.id);
      if (idx >= 0) {
        this.favorites.splice(idx, 1);
        this._saveFavorites();
        return false;
      }
      this.favorites = [
        { id: doc.id, slug: doc.slug, title: doc.title, content: doc.content, author: doc.author, updated: doc.updated, words: doc.words, favTime: Date.now() },
        ...this.favorites,
      ];
      this._saveFavorites();
      return true;
    }

    /** 从最近读取中删除一条（移入回收站） */
    removeRecent(id) {
      const doc = this.recent.find(d => d.id === id);
      const before = this.recent.length;
      this.recent = this.recent.filter(d => d.id !== id);
      if (this.recent.length !== before) {
        this._saveRecent();
        if (doc) this._addTrash(doc, 'recent');
      }
    }

    /** 取消收藏（纯移除，不进回收站） */
    removeFavorite(id) {
      const before = this.favorites.length;
      this.favorites = this.favorites.filter(d => d.id !== id);
      if (this.favorites.length !== before) this._saveFavorites();
    }

    /** 删除收藏（移入回收站） */
    deleteFavorite(id) {
      const doc = this.favorites.find(d => d.id === id);
      const before = this.favorites.length;
      this.favorites = this.favorites.filter(d => d.id !== id);
      if (this.favorites.length !== before) {
        this._saveFavorites();
        if (doc) this._addTrash(doc, 'favorite');
      }
    }

    // ===== 回收站（最近删除） =====

    /** 从 localStorage 读取回收站列表 */
    _loadTrash() {
      try {
        const raw = localStorage.getItem(YuqueService.TRASH_KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
      } catch (e) {
        return [];
      }
    }

    /** 持久化回收站列表 */
    _saveTrash() {
      try {
        localStorage.setItem(YuqueService.TRASH_KEY, JSON.stringify(this.trash));
      } catch (e) {
        console.warn('[yuque] 保存回收站失败:', e);
      }
    }

    /** 获取回收站列表 */
    getTrash() {
      return this.trash;
    }

    /** 加入回收站（去重 + 限长 20 条） */
    _addTrash(doc, from) {
      this.trash = [
        { id: doc.id, slug: doc.slug, title: doc.title, content: doc.content, author: doc.author, updated: doc.updated, words: doc.words, from, delTime: Date.now() },
        ...this.trash.filter(d => d.id !== doc.id),
      ].slice(0, 20);
      this._saveTrash();
    }

    /** 从回收站恢复一条（回到最近读取） */
    restoreTrash(id) {
      const doc = this.trash.find(d => d.id === id);
      if (!doc) return;
      this.trash = this.trash.filter(d => d.id !== id);
      this._saveTrash();
      const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      this.recent = [
        { id: doc.id, slug: doc.slug, title: doc.title, time, content: doc.content, author: doc.author, updated: doc.updated, words: doc.words },
        ...this.recent.filter(d => d.id !== doc.id),
      ].slice(0, 8);
      this._saveRecent();
    }

    /** 从回收站彻底删除一条 */
    removeTrash(id) {
      const before = this.trash.length;
      this.trash = this.trash.filter(d => d.id !== id);
      if (this.trash.length !== before) this._saveTrash();
    }

    /** 清空回收站 */
    clearTrash() {
      this.trash = [];
      this._saveTrash();
    }

    /**
     * 连接（校验 Token + 拉取用户信息）
     * @param {string} token
     * @param {string} [baseUrl] - 默认 https://www.yuque.com，企业用户传 https://xxx.yuque.com
     */
    async connect(token, baseUrl = 'https://www.yuque.com') {
      if (!token || !token.trim()) throw new Error('Token 不能为空');
      this.api.setConfig({ token: token.trim(), baseUrl });
      try {
        const user = await this.api.getCurrentUser();
        this.userInfo = { login: user.login, name: user.name, avatar: user.avatar_url };
        this.connected = true;
        return this.userInfo;
      } catch (e) {
        this.connected = false;
        this.userInfo = null;
        throw e;
      }
    }

    disconnect() {
      this.connected = false;
      this.userInfo = null;
      this.cache.clear();
      this.api.setConfig({ token: '' });
    }

    /**
     * 通过 URL 获取文档（带缓存）
     * @param {string} url - 语雀文档 URL
     * @returns {Promise<{id, title, author, updated, words, content}>}
     */
    async getDocByUrl(url) {
      // 优先：主进程 IPC（复用 dragon-mcp 团队 Token，无需用户配置、自动绕过 CORS / 证书拦截）
      if (this.ipc) {
        const parsed = window.YuqueUrl.parseYuqueUrl(url);
        if (parsed) {
          // 命中缓存
          const cached = this.cache.get(parsed.namespace, parsed.slug);
          if (cached) { this._addRecent(cached); return cached; }

          const res = await this.ipc.invoke('yuque-fetch-doc', url);
          if (res && res.ok) {
            const doc = this._normalizeIpc(res.doc, parsed.slug);
            this.cache.set(parsed.namespace, parsed.slug, doc);
            this._addRecent(doc);
            return doc;
          }
          // IPC 明确失败（如团队未配置 token）→ 抛出错误，不静默吞掉
          if (res && res.error) throw new Error(res.error);
        }
      }

      // 次选：用户已配置个人 Token 的真实 API 路径
      if (this.connected) {
        const parsed = window.YuqueUrl.parseYuqueUrl(url);
        if (!parsed) throw new Error('链接格式无效');

        // 命中缓存
        const cached = this.cache.get(parsed.namespace, parsed.slug);
        if (cached) {
          this._addRecent(cached);
          return cached;
        }

        // 调 API
        const raw = await this.api.getDoc(parsed.namespace, parsed.slug);
        const doc = this._normalize(raw);
        this.cache.set(parsed.namespace, parsed.slug, doc);
        this._addRecent(doc);
        return doc;
      }

      // 兜底：Mock 路径
      await this._delay(300);
      const key = Object.keys(MOCK_DOCS).find(k => url.includes(k));
      if (!key) throw new Error('Mock 数据中未找到该文档（请配置 Token 使用真实 API）');
      const doc = MOCK_DOCS[key];
      this._addRecent(doc);
      return doc;
    }

    /** 获取文档完整内容（兼容旧接口，真实模式从缓存取） */
    async getContent(id) {
      // 先看 mock
      const mock = Object.values(MOCK_DOCS).find(d => d.id === id);
      if (mock) return mock.content;
      // 真实模式下：先从缓存找
      for (const entry of this.cache._map.values()) {
        if (entry.value.id === id) return entry.value.content;
      }
      // 缓存未命中（如重启后）：从持久化的最近读取里找
      const recent = this.recent.find(d => d.id === id);
      if (recent && recent.content) return recent.content;
      return '';
    }

    getRecent() {
      return this.recent;
    }

    /**
     * 把文档内容转为「适合喂给 AI」的纯文本
     * 去掉图片 markdown（CDN url 占 token 且无语义）、压缩空白
     * @param {string} content
     */
    toPlainText(content) {
      if (!content) return '';
      let s = content;
      // 图片 ![alt](url) → 用 alt 占位（无 alt 则标记[图片]）
      s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, (_, alt) => alt ? `[图片:${alt}]` : '[图片]');
      // 链接 [text](url) → 只保留文字
      s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
      // 压缩连续的表格分隔符与空单元格（lake 表格会产生大量 | | |）
      s = s.replace(/\|[\s|]*\|/g, ' ').replace(/\|/g, ' ');
      // 折叠空白
      s = s.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
      return s;
    }

    /**
     * 列出 Mock 文档元数据（供 AI 关键词搜索使用）
     * 真实模式下返回最近读取过的文档
     */
    listMeta() {
      if (this.connected) {
        return this.recent.map(d => ({
          id: d.id, slug: d.slug, title: d.title, author: d.author,
          updated: d.updated, words: d.words,
          excerpt: (d.content || '').replace(/^#+\s*/g, '').slice(0, 120),
        }));
      }
      return Object.entries(MOCK_DOCS).map(([slug, d]) => ({
        id: d.id, slug, title: d.title, author: d.author,
        updated: d.updated, words: d.words,
        excerpt: (d.content || '').replace(/^#+\s*/g, '').slice(0, 120),
      }));
    }

    /** 关键词初筛（标题/正文包含关键词） */
    keywordFilter(query) {
      if (!query) return [];
      const q = query.toLowerCase().trim();
      const source = this.connected
        ? this.recent
        : Object.entries(MOCK_DOCS).map(([slug, d]) => ({ ...d, slug }));
      return source.filter(d => {
        return (d.title || '').toLowerCase().includes(q)
            || (d.content || '').toLowerCase().includes(q);
      }).map(d => ({
        id: d.id, slug: d.slug, title: d.title, author: d.author,
        updated: d.updated,
        excerpt: (d.content || '').replace(/^#+\s*/g, '').slice(0, 120),
      }));
    }

    // ===== 内部辅助 =====

    /** 规范化主进程 IPC 返回的文档（lake 格式 → 可读文本） */
    _normalizeIpc(doc, slug) {
      const content = this._lakeToText(doc.content || '');
      return {
        id: doc.id,
        slug,
        title: doc.title || '(无标题)',
        author: doc.team || '语雀',
        updated: this._humanizeTime(doc.updated),
        words: doc.wordCount || content.length,
        content,
      };
    }

    /**
     * 语雀 lake 内容清洗
     * lake 格式本质就是 Markdown（图片是 ![](url) 语法），
     * 只需清掉混入的少量 HTML 标签（<br>、<font> 等），保留 Markdown 结构与图片
     */
    _lakeToText(raw) {
      if (!raw) return '';
      let s = raw;
      // <br> → 换行
      s = s.replace(/<br\s*\/?>/gi, '\n');
      // 去掉 <font ...> </font> 等纯样式标签，保留其中文字
      s = s.replace(/<\/?(font|span|u|sub|sup)[^>]*>/gi, '');
      // 其余未知 HTML 标签也去掉（但 markdown 的 ![]() 不含尖括号，不受影响）
      s = s.replace(/<\/?[a-z][^>]*>/gi, '');
      // 解码常见 HTML 实体
      s = s.replace(/&nbsp;/g, ' ')
           .replace(/&lt;/g, '<')
           .replace(/&gt;/g, '>')
           .replace(/&quot;/g, '"')
           .replace(/&#39;/g, "'")
           .replace(/&amp;/g, '&');
      // 折叠多余空行
      s = s.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim();
      return s;
    }

    /** 把语雀 API 原始响应规范化为统一结构 */
    _normalize(raw) {
      // body_html 含 markdown 渲染过的内容；body 是原始 markdown
      const content = raw.body || raw.body_draft || '';
      return {
        id: String(raw.id),
        slug: raw.slug,
        title: raw.title || '(无标题)',
        author: raw.user?.name || raw.creator?.name || '未知',
        updated: this._humanizeTime(raw.updated_at || raw.published_at),
        words: raw.word_count || content.length,
        content,
      };
    }

    /** ISO 时间转人类可读 */
    _humanizeTime(iso) {
      if (!iso) return '';
      const ts = new Date(iso).getTime();
      const diff = Date.now() - ts;
      if (diff < 60_000) return '刚刚';
      if (diff < 3600_000) return Math.floor(diff / 60000) + ' 分钟前';
      if (diff < 86400_000) return Math.floor(diff / 3600000) + ' 小时前';
      if (diff < 7 * 86400_000) return Math.floor(diff / 86400000) + ' 天前';
      const d = new Date(iso);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    /** 加入最近读取列表（去重 + 限长 8 条，并持久化） */
    _addRecent(doc) {
      const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      this.recent = [
        { id: doc.id, slug: doc.slug, title: doc.title, time, content: doc.content, author: doc.author, updated: doc.updated, words: doc.words },
        ...this.recent.filter(d => d.id !== doc.id),
      ].slice(0, 8);
      this._saveRecent();
    }

    _delay(ms) { return new Promise(r => setTimeout(r, ms)); }
  }

  window.YuqueService = YuqueService;
})();
