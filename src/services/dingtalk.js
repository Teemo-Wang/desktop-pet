/**
 * 钉钉服务 — Mock 数据，后续替换真实 API
 */
(function() {
  const CONVS = [
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
    constructor() { this.connected = false; }
    async connect() { await this._d(300); this.connected = true; }
    async getConversations() { if(!this.connected) await this.connect(); return CONVS; }
    async getMessages(id) { return (CONVS.find(c=>c.id===id)||{}).messages||[]; }
    async getConversation(id) { return CONVS.find(c=>c.id===id); }
    async getUnreadCount() { return CONVS.reduce((s,c)=>s+c.unread,0); }
    async markRead(id) { const c=CONVS.find(x=>x.id===id); if(c) c.unread=0; }
    /** 追加一条消息到会话（含"我"发出的回复） */
    appendMessage(id, msg) {
      const c = CONVS.find(x => x.id === id);
      if (!c) return;
      c.messages.push(msg);
      // 只有非本人消息才计未读
      if (!msg.isMine) c.unread = (c.unread || 0) + 1;
      c.lastMsg = (msg.isMine ? '我: ' : '') + msg.content;
      c.lastTime = msg.time || '';
    }
    _d(ms){return new Promise(r=>setTimeout(r,ms));}
  }
  window.DingTalkService = DingTalkService;
})();
