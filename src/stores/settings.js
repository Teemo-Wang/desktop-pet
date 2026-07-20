/**
 * 设置持久化 Store
 */
(function() {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const DIR = path.join(os.homedir(), '.hellobike-pet');
  const FILE = path.join(DIR, 'settings.json');

  const DEFAULTS = {
    general: { alwaysOnTop:true, opacity:100, scale:100 },
    // skin: 'default'=内置小哈 | 'custom'=用户自定义；customSkin=自定义形象图片(data URL)
    appearance: { idleAnimation:'float', messageReaction:'bounce', skin:'default', customSkin:'' },
    work: { dingtalkNotify:true, aiAssistant:true, yuqueAccess:true, dndEnabled:false, dndStart:'22:00', dndEnd:'08:00', showMsgContent:true, allowChitchat:true, editMethod:'designhub' },
    model: { provider:'deepseek', apiKey:'', modelName:'deepseek-chat', baseUrl:'https://api.deepseek.com/v1', systemPrompt:`你是哈啰出行两轮事业部的设计工作 AI 助手，名叫"小哈"。你的直属用户是一位视觉设计师。

## 你的核心能力
1. 需求分析：从钉钉消息/文档中提取设计需求，输出结构化的需求摘要
2. 设计规范答疑：熟悉哈啰两轮的设计规范（品牌色 #0076FF、尺寸规格、命名规范等）
3. 文案撰写：活动文案、Banner 文案、按钮文案，风格活泼年轻
4. 待办管理：把消息转为可执行的待办，标注优先级和截止时间
5. 文档总结：快速提取语雀文档的核心要点
6. 视觉生成：你已接入图片生成/编辑能力。当用户上传图片并要求修改（改文字、改配色、改价格等），或要求生成新图时，系统会自动调用生图接口。你不要否认这个能力，应配合引导用户描述清楚修改需求（主体、尺寸、风格、文案）

## 工作上下文
- 团队：哈啰两轮设计中心
- 常见资源位尺寸：首页 Banner 750×360px @2x、场景卡 340×200px @2x、Tab 图标 96×96px（安全区 72×72px）
- 场景卡文案≤3字、动态文案≤6字
- 品牌主色 #0076FF、品牌渐变 #0076FF→#1492FF
- 素材命名规范：{类型}_{尺寸}_{版本}.png
- 交付流程：需求文档 → 设计出图 → 批量生成（bike-material-generator）→ 上传 CDN → 通知开发

## 回复原则
- 简洁专业，不啰嗦
- 涉及设计规范时给出具体数值（尺寸、色值、字数限制）
- 提到待办时标注优先级（高/中/低）和建议截止时间
- 需求分析时用结构化格式（需求摘要/关键目标/设计交付/需要确认/下一步）
- 对话中如果用户提到具体的钉钉消息或语雀文档内容，紧密围绕那些信息回答，不要泛泛而谈
- 如果信息不足，主动追问而不是猜测` },
    yuque: { token:'', baseUrl:'https://www.yuque.com', userLogin:'', userName:'' },
    // 钉钉机器人（实名 AI 助理）：Stream 模式接入凭据 + 回复策略
    // replyMode: 'confirm'=人工确认后再发（默认，更稳妥） | 'auto'=自动回复 + 可随时接管
    dingtalk: { appKey:'', appSecret:'', robotCode:'', robotName:'', replyMode:'confirm', autoEnabled:false },
    // 素材库（DesignHub 团队素材管理工具）：登录邮箱 + 本地缓存的 session token
    material: { dhEmail:'', dhToken:'', dhUserName:'' },
    // 生图模型：modelName=当前生效的模型；options=可切换的模型名列表；apiKey/baseUrl 留空则复用对话配置
    imageModel: { modelName:'doubao-seedream-4-5-251128', size:'2048x2048', apiKey:'', baseUrl:'', options:[] },
    // 各供应商独立配置（apiKey/modelName/baseUrl 互不干扰）
    providerConfigs: {},
    // 用户自建的 API 供应商：{ [id]: { label, baseUrl, modelName, hint } }，可自定义命名
    customProviders: {},
    dock: { items: [
      { id:'chat', icon:'🤖', label:'AI' },
      { id:'dingtalk', icon:'💬', label:'钉钉' },
      { id:'yuque', icon:'📄', label:'语雀' },
      { id:'todos', icon:'✅', label:'待办' },
      { id:'skills', icon:'⚡', label:'技能' },
    ]},
  };

  function merge(a, b) {
    const r = JSON.parse(JSON.stringify(a));
    for (const k of Object.keys(b||{})) {
      if (r[k] && typeof r[k]==='object' && typeof b[k]==='object' && !Array.isArray(r[k])) r[k] = merge(r[k], b[k]);
      else r[k] = b[k];
    }
    return r;
  }

  class SettingsStore {
    constructor() {
      if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, {recursive:true});
      try {
        this.data = fs.existsSync(FILE) ? merge(DEFAULTS, JSON.parse(fs.readFileSync(FILE,'utf-8'))) : JSON.parse(JSON.stringify(DEFAULTS));
      } catch(e) { this.data = JSON.parse(JSON.stringify(DEFAULTS)); }
      this._save();
    }
    get(g) { return g ? this.data[g] : this.data; }
    set(g, k, v) { if(this.data[g]) { this.data[g][k]=v; this._save(); } }
    /** 整组替换（用于自定义供应商等需要增删键的场景） */
    setGroup(g, obj) { this.data[g] = obj || {}; this._save(); }
    _save() { try { fs.writeFileSync(FILE, JSON.stringify(this.data,null,2),'utf-8'); } catch(e){} }
  }
  window.SettingsStore = SettingsStore;
})();
