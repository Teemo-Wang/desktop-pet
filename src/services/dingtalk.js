/**
 * 钉钉服务 — 凭据驱动的「真实 Stream / Mock」自动切换
 *
 * - 配置了 AppKey/AppSecret → 真实模式：主进程建立 Stream 长连接，
 *   实时接收「用户单聊机器人 / 群内@机器人」的消息，归入会话列表
 * - 未配置 → Mock 模式：使用内置演示数据，保证 UI 可用
 *
 * 对外接口与原版保持一致（connect/getConversations/getMessages/getConversation/
 * getUnreadCount/markRead/appendMessage），新增：configure / reply / onIncoming
 */
(function() {
  const { ipcRenderer } = require('electron');
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  // 钉钉会话持久化文件（真实模式下的历史会话 + 回复地址）
  const STORE_DIR = path.join(os.homedir(), '.hellobike-pet');
  const STORE_FILE = path.join(STORE_DIR, 'dingtalk-history.json');
  // 单会话消息上限，超过则裁剪最旧的，避免文件无限增长
  const MAX_MESSAGES_PER_CONV = 500;

  // Mock 演示数据（未配置真实凭据时使用）
  const MOCK_CONVS = [
    { id:'c1', type:'single', name:'张三（产品）', unread:2, lastMsg:'新车上线需求文档已更新，麻烦看下', lastTime:'10:32',
      messages:[
        {sender:'张三',content:'在吗？新车上线的需求有更新',time:'10:28'},
        {sender:'张三',content:'[链接] 新车上线PRD v2.3 hellobike.yuque.com/zo0rpl/am5rev/new-bike-spec',time:'10:30'},
        {sender:'张三',content:'新车上线需求文档已更新，麻烦看下评审意见',time:'10:32'},
      ]},
    { id:'c2', type:'single', name:'李四（前端）', unread:1, lastMsg:'接口联调完成，骑行卡页面可以验收了', lastTime:'09:45',
      messages:[
        {sender:'李四',content:'骑行卡的接口我这边改好了',time:'09:40'},
        {sender:'李四',content:'接口联调完成，骑行卡页面可以验收了',time:'09:45'},
      ]},
    { id:'c3', type:'group', name:'两轮设计周会群', unread:5, lastMsg:'王五: 本周设计评审改到周四下午3点', lastTime:'昨天',
      messages:[
        {sender:'王五',content:'@所有人 本周评审时间有变动',time:'17:15'},
        {sender:'赵六',content:'收到',time:'17:18'},
        {sender:'王五',content:'本周设计评审改到周四下午3点，地点不变',time:'17:20'},
      ]},
    { id:'c4', type:'group', name:'哈啰新车项目组', unread:0, lastMsg:'设计-小明: [图片] 新车渲染图终稿', lastTime:'昨天',
      messages:[{sender:'设计-小明',content:'[图片] 新车渲染图终稿',time:'14:30'}]},
  ];

  class DingTalkService {
    constructor() {
      this.connected = false;
      this.realMode = false;            // 是否启用真实 Stream 模式
      this.cfg = { appKey:'', appSecret:'' };
      this.convs = JSON.parse(JSON.stringify(MOCK_CONVS)); // 当前会话列表
      this.sessionWebhooks = {};        // convId -> sessionWebhook（真实模式回复用）
      this.senderInfo = {};             // convId -> { userId, robotCode }（发图片消息用）
      this.incomingListeners = new Set(); // 新消息到达回调
      this._ipcBound = false;
    }

    /** 配置凭据。有 appKey+appSecret 即视为真实模式 */
    configure(cfg) {
      this.cfg = cfg || { appKey:'', appSecret:'', robotCode:'' };
      this.realMode = !!(this.cfg.appKey && this.cfg.appSecret);
      if (this.realMode) {
        // 真实模式：从本地文件恢复历史会话与回复地址；无历史则从空开始
        const saved = this._load();
        this.convs = saved.convs || [];
        this.sessionWebhooks = saved.sessionWebhooks || {};
      }
    }

    /** 从本地文件读取持久化的会话历史 */
    _load() {
      try {
        if (!fs.existsSync(STORE_FILE)) return { convs: [], sessionWebhooks: {} };
        const raw = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
        return {
          convs: Array.isArray(raw.convs) ? raw.convs : [],
          sessionWebhooks: raw.sessionWebhooks && typeof raw.sessionWebhooks === 'object' ? raw.sessionWebhooks : {},
        };
      } catch (e) {
        console.warn('[dingtalk] 历史加载失败:', e.message);
        return { convs: [], sessionWebhooks: {} };
      }
    }

    /** 持久化当前会话到本地文件（仅真实模式，避免写入 Mock 演示数据） */
    _persist() {
      if (!this.realMode) return;
      try {
        if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true });
        fs.writeFileSync(STORE_FILE, JSON.stringify({
          convs: this.convs,
          sessionWebhooks: this.sessionWebhooks,
        }, null, 2), 'utf-8');
      } catch (e) {
        console.warn('[dingtalk] 历史保存失败:', e.message);
      }
    }

    /** 订阅新消息到达（payload 为归一化后的单条消息所属会话 convId） */
    onIncoming(fn) {
      this.incomingListeners.add(fn);
      return () => this.incomingListeners.delete(fn);
    }

    /** 绑定主进程推送（只绑定一次） */
    _bindIpc() {
      if (this._ipcBound) return;
      this._ipcBound = true;
      ipcRenderer.on('dingtalk:message', (e, payload) => this._ingest(payload));
      ipcRenderer.on('dingtalk:status', (e, s) => {
        if (s.status === 'connected') this.connected = true;
        else if (s.status === 'closed' || s.status === 'disconnected') this.connected = false;
        console.log('[dingtalk] 连接状态:', s.status, s.detail || '');
      });
    }

    /** 连接：真实模式走 Stream，Mock 模式直接置连接成功 */
    async connect() {
      if (this.realMode) {
        this._bindIpc();
        const res = await ipcRenderer.invoke('dingtalk:connect', {
          appKey: this.cfg.appKey,
          appSecret: this.cfg.appSecret,
        });
        if (!res.ok) throw new Error(res.error || '钉钉连接失败');
        this.connected = true;
        return;
      }
      // Mock
      await this._d(300);
      this.connected = true;
    }

    /** 断开真实连接 */
    async disconnect() {
      if (this.realMode) await ipcRenderer.invoke('dingtalk:disconnect');
      this.connected = false;
    }

    /** 把主进程推送的一条消息归入会话列表 */
    _ingest(payload) {
      if (!payload || !payload.convId) return;
      let conv = this.convs.find(c => c.id === payload.convId);
      if (!conv) {
        conv = { id: payload.convId, type: payload.type, name: payload.name, unread: 0, lastMsg: '', lastTime: '', messages: [] };
        this.convs.unshift(conv);
      }
      conv.messages.push({
        sender: payload.sender,
        senderId: payload.senderId,
        content: payload.content,
        time: payload.time,
        // 富文本/图片消息里的图片下载码（改图取原图用；已并入引用消息里的图片码）
        imageDownloadCodes: payload.imageDownloadCodes || [],
        // 引用回复里被引用消息的文本（可能为空）
        quotedText: payload.quotedText || '',
        // 文件/文件夹上传（含压缩包下载码）
        fileUpload: payload.fileUpload || null,
      });
      // 裁剪过长的会话消息，避免历史文件无限增长
      if (conv.messages.length > MAX_MESSAGES_PER_CONV) {
        conv.messages = conv.messages.slice(-MAX_MESSAGES_PER_CONV);
      }
      conv.unread = (conv.unread || 0) + 1;
      conv.lastMsg = payload.content;
      conv.lastTime = payload.time;
      // 记录最新 sessionWebhook（回复用，2 小时有效）
      if (payload.sessionWebhook) this.sessionWebhooks[payload.convId] = payload.sessionWebhook;
      // 记录发送者与机器人码（发图片消息用）
      // type/openConversationId 供发图分流：群走群接口，单聊走单聊接口
      this.senderInfo[payload.convId] = {
        userId: payload.senderId || '',
        robotCode: payload.robotCode || this.cfg.robotCode || '',
        type: payload.type || 'single',
        // 群消息回调里的 conversationId 即群的 openConversationId
        openConversationId: payload.type === 'group' ? payload.convId : '',
      };
      // 把会话移到列表顶部
      const idx = this.convs.indexOf(conv);
      if (idx > 0) { this.convs.splice(idx, 1); this.convs.unshift(conv); }
      // 持久化
      this._persist();
      // 广播
      this.incomingListeners.forEach(fn => { try { fn(payload, conv); } catch (err) { console.warn(err); } });
    }

    /**
     * 以机器人身份回复会话
     * @param {string} convId
     * @param {string} text
     * @param {string} [title] - 提供时按 markdown 发送
     * @returns {Promise<{ok:boolean, error?:string}>}
     */
    async reply(convId, text, title) {
      if (!this.realMode) {
        // Mock 模式：直接写入本地会话
        this.appendMessage(convId, { sender:'助理', content:text, time:_hhmm(), isMine:true });
        return { ok: true };
      }
      const webhook = this.sessionWebhooks[convId];
      if (!webhook) return { ok:false, error:'会话回复地址已失效（超过 2 小时），请等对方再发一条消息后重试' };
      const res = await ipcRenderer.invoke('dingtalk:reply', { sessionWebhook: webhook, text, title });
      if (res.ok) {
        this.appendMessage(convId, { sender:'助理', content:text, time:_hhmm(), isMine:true });
      }
      return res;
    }

    /**
     * 给会话对方发送素材缩略图（下载→上传钉钉媒体→发图片消息）
     * @param {string} convId
     * @param {Array<{url,name}>} images
     * @returns {Promise<{ok:boolean, sent:number, error?:string}>}
     */
    /**
     * 发送"正在处理"回执：直接走 sessionWebhook，但不写入会话历史
     * （避免污染 conv.messages，使后续读取的"最后一条"仍是用户消息）
     * @param {string} convId
     * @param {string} text
     */
    async sendAck(convId, text) {
      if (!this.realMode) return { ok: false };
      const webhook = this.sessionWebhooks[convId];
      if (!webhook || !text) return { ok: false };
      try {
        return await ipcRenderer.invoke('dingtalk:reply', { sessionWebhook: webhook, text });
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }

    /**
     * 把会话里某条消息的图片下载码换成可下载 URL（改图取原图用）
     * @param {string} convId
     * @param {string} downloadCode
     * @returns {Promise<{ok:boolean, downloadUrl?:string, error?:string}>}
     */
    async downloadMessageImage(convId, downloadCode) {
      if (!this.realMode) return { ok: false, error: 'Mock 模式不支持' };
      const info = this.senderInfo[convId] || {};
      return await ipcRenderer.invoke('dingtalk:download-file', {
        appKey: this.cfg.appKey,
        appSecret: this.cfg.appSecret,
        robotCode: info.robotCode || this.cfg.robotCode || this.cfg.appKey || '',
        downloadCode,
      });
    }

    async sendImages(convId, images, opts = {}) {
      if (!this.realMode) return { ok: false, sent: 0, error: 'Mock 模式不支持发图' };
      const info = this.senderInfo[convId] || {};
      // 会话类型分流：优先用 senderInfo 记录的类型，兜底从会话列表推断
      const conv = this.convs.find(c => c.id === convId);
      const conversationType = info.type || (conv && conv.type) || 'single';
      // 群发图用 openConversationId（群消息回调的 conversationId 即为它，兜底用 convId）
      const openConversationId = info.openConversationId || (conversationType === 'group' ? convId : '');
      return await ipcRenderer.invoke('dingtalk:send-images', {
        appKey: this.cfg.appKey,
        appSecret: this.cfg.appSecret,
        // robotCode 兜底：消息回调 → 配置 → AppKey（内部机器人常与 AppKey 相同）
        robotCode: info.robotCode || this.cfg.robotCode || this.cfg.appKey || '',
        conversationType,
        openConversationId,
        userId: info.userId || '',
        images: images || [],
        searchUrl: opts.searchUrl || '',
        askConfirm: !!opts.askConfirm,
        dhToken: opts.dhToken || '',
      });
    }

    async getConversations() { if (!this.connected) await this.connect(); return this.convs; }
    async getMessages(id) { return (this.convs.find(c => c.id === id) || {}).messages || []; }
    async getConversation(id) { return this.convs.find(c => c.id === id); }
    async getUnreadCount() { return this.convs.reduce((s, c) => s + (c.unread || 0), 0); }
    async markRead(id) { const c = this.convs.find(x => x.id === id); if (c && c.unread) { c.unread = 0; this._persist(); } }

    /** 清除单条会话的所有消息记录（保留会话本身但清空 messages） */
    clearConversation(id) {
      const c = this.convs.find(x => x.id === id);
      if (!c) return;
      c.messages = [];
      c.unread = 0;
      c.lastMsg = '';
      this._persist();
    }

    /** 删除单条会话（从列表移除） */
    deleteConversation(id) {
      const idx = this.convs.findIndex(x => x.id === id);
      if (idx === -1) return;
      this.convs.splice(idx, 1);
      this._persist();
    }

    /** 清除全部会话记录（清空消息 + 列表） */
    clearAllConversations() {
      this.convs = [];
      this._persist();
    }

    /** 追加一条消息到会话（含"我/助理"发出的回复） */
    appendMessage(id, msg) {
      const c = this.convs.find(x => x.id === id);
      if (!c) return;
      c.messages.push(msg);
      if (c.messages.length > MAX_MESSAGES_PER_CONV) {
        c.messages = c.messages.slice(-MAX_MESSAGES_PER_CONV);
      }
      if (!msg.isMine) c.unread = (c.unread || 0) + 1;
      c.lastMsg = (msg.isMine ? '助理: ' : '') + msg.content;
      c.lastTime = msg.time || '';
      this._persist();
    }

    _d(ms) { return new Promise(r => setTimeout(r, ms)); }
  }

  function _hhmm() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  window.DingTalkService = DingTalkService;
})();
