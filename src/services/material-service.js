/**
 * 素材库服务（渲染层）
 * 职责：
 *   1. 登录 DesignHub（换 token，交由 store 持久化）
 *   2. 关键词搜索素材（token 失效自动提示重连）
 *   3. 判断一句话是否是「找素材」意图 + 提取检索关键词
 *
 * 依赖：主进程 IPC（material:login / material:search）、window.aiService（意图识别）
 */
(function() {
  const { ipcRenderer } = require('electron');

  class MaterialService {
    constructor(store) {
      this.store = store;
      const cfg = (store && store.get('material')) || {};
      this.token = cfg.dhToken || '';
      this.email = cfg.dhEmail || '';
    }

    get connected() { return !!this.token; }

    /** 构造 DesignHub 原生搜索页 URL（用其自带搜索，更精准） */
    buildSearchUrl(keyword) {
      return 'https://designhub.hellobike.cn/assets?keyword=' + encodeURIComponent(keyword || '');
    }

    /** 登录并持久化 token */
    async login(email, password) {
      const res = await ipcRenderer.invoke('material:login', { email, password });
      if (res.ok) {
        this.token = res.token;
        this.email = email;
        if (this.store) {
          this.store.set('material', 'dhToken', res.token);
          this.store.set('material', 'dhEmail', email);
        }
      }
      return res;
    }

    /** 拉取受鉴权保护的图片，返回 base64 data URL（供 <img> 显示） */
    async fetchThumb(url) {
      if (!url || !this.token) return '';
      try {
        const res = await ipcRenderer.invoke('material:image', { token: this.token, url });
        return res && res.ok ? res.dataUrl : '';
      } catch (e) { return ''; }
    }

    /**
     * 通用图片下载 → base64 data URL（不要求登录 token）。
     * 用于把生图/远程图经主进程 net 下载成内联图，规避渲染进程 <img> 加载内网/证书/CORS 失败导致的"图裂开"。
     * @param {string} url
     * @returns {Promise<string>} data URL；失败返回空串
     */
    async fetchImageAsDataUrl(url) {
      if (!url) return '';
      try {
        const res = await ipcRenderer.invoke('material:image', { token: this.token || '', url });
        return res && res.ok ? res.dataUrl : '';
      } catch (e) { return ''; }
    }

    /** 断开：清除本地 token */
    logout() {
      this.token = '';
      if (this.store) this.store.set('material', 'dhToken', '');
    }

    /**
     * 搜索素材
     * @param {string} keyword
     * @param {object} [opts] - { page, pageSize }
     * @returns {Promise<{ok:boolean, items?:Array, total?:number, needAuth?:boolean, error?:string}>}
     */
    async search(keyword, opts = {}) {
      if (!this.token) return { ok: false, needAuth: true, error: '未登录素材库' };
      return await ipcRenderer.invoke('material:search', {
        token: this.token,
        keyword: keyword || '',
        page: opts.page || 1,
        pageSize: opts.pageSize || 20,
      });
    }

    /**
     * DesignHub AI 智能改图：参考图 + 描述 → 生成变体
     * @param {object} opts - { referenceImageUrl, prompt, size?, count?, assetId?, preserveTemplateLayout? }
     * @returns {Promise<{ok:boolean, images?:string[], needAuth?:boolean, error?:string}>}
     */
    async generateVariant(opts = {}) {
      if (!this.token) return { ok: false, needAuth: true, error: '未登录素材库' };
      return await ipcRenderer.invoke('material:generate-variant', {
        token: this.token,
        referenceImageUrl: opts.referenceImageUrl || '',
        prompt: opts.prompt || '',
        size: opts.size || '',
        count: opts.count || 1,
        assetId: opts.assetId || '',
        preserveTemplateLayout: opts.preserveTemplateLayout === true,
      });
    }
  }

  window.MaterialService = MaterialService;
  window.__MaterialServiceClass = MaterialService;
})();

/**
 * 素材意图识别 + 关键词提取（扩展到 MaterialService 原型）
 * 先用本地规则快速判断，命中率不足时再交给 AI。
 */
(function() {
  const Cls = window.__MaterialServiceClass;
  if (!Cls) return;

  // 搜索动词 + 素材名词：同一句里都出现即判定为「找素材」意图（不限制两者距离）
  const VERB = /(找|搜|搜索|检索|来个|来一?个|要个|要一?个|有没有|有木有|给我|需要|想要|帮我找|调取|查一?下)/;
  const NOUN = /(素材|banner|横幅|海报|kv|主视觉|主题卡|场景卡|图标|icon|插画|背景图|背景|样机|模板|贴纸|表情|logo|头图|封面|切图|图片|图)/i;
  const CLEAN = /(帮我|请|麻烦|一下|我想|我要|想要|找一?下?|搜一?下?|搜索|检索|来一?个|给我|有没有|有木有|需要|调取|查一?下|看一?下|看看|素材库(里|中)?的?|素材|相关的?|图片|的|吗|呀|啊|个|里|中)/g;

  /** 快速本地判断是否找素材意图 */
  Cls.prototype.looksLikeSearch = function(text) {
    if (!text) return false;
    return VERB.test(text) && NOUN.test(text);
  };

  /**
   * 从一句话提取检索关键词（本地规则版，去掉口语修饰）
   * @returns {string}
   */
  Cls.prototype.extractKeyword = function(text) {
    if (!text) return '';
    let k = String(text).replace(CLEAN, ' ').replace(/[，。！？、,.!?]/g, ' ');
    k = k.replace(/\s+/g, ' ').trim();
    return k;
  };

  /**
   * 用 AI 把口语需求转成精炼检索词（本地规则不够时兜底）
   * @returns {Promise<string>}
   */
  Cls.prototype.aiExtractKeyword = async function(text) {
    try {
      const raw = await window.aiService.send([
        { role:'system', content:
          '你是素材库检索助手。从用户的一句话里提取「用于素材库搜索的核心关键词」。\n' +
          '规则：\n' +
          '1. 只保留关键信息：节日/主题（如 端午、520、双十一）、活动名、产品/车型名、素材类型（如 banner、海报、主题卡、图标）。\n' +
          '2. 去掉所有寒暄、语气、疑问、修饰词（如 哈喽、之前、有没有、做过、相关、帮我、看看、呢、吗）。\n' +
          '3. 多个关键词用空格分隔，总长不超过 10 个字。\n' +
          '4. 只输出关键词本身，不要标点、不要解释、不要引号。\n' +
          '示例：\n' +
          '「哈喽，之前有没有做过端午相关的素材呢」→ 端午\n' +
          '「帮我找个 520 的 banner」→ 520 banner\n' +
          '「有没有新车发布的主题卡」→ 新车发布 主题卡' },
        { role:'user', content: text },
      ]);
      const kw = String(raw || '').replace(/["「」『』\n]/g, '').replace(/[，。！？、,.!?]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 20);
      return kw || this.extractKeyword(text);
    } catch (e) {
      return this.extractKeyword(text);
    }
  };
})();
