/**
 * 钉钉服务层
 * 封装钉钉开放平台 API，当前使用 mock 数据
 * 后续替换为真实接口：https://open.dingtalk.com/
 */

(function() {

  // 授权状态枚举
  const AUTH_STATUS = {
    NOT_CONNECTED: 'not_connected',  // 未连接
    CONNECTING: 'connecting',        // 连接中
    CONNECTED: 'connected',          // 已连接
    EXPIRED: 'expired',              // 授权过期
    ERROR: 'error',                  // 连接错误
  };

  // 消息类型枚举
  const MSG_TYPE = {
    TEXT: 'text',
    IMAGE: 'image',
    FILE: 'file',
    LINK: 'link',
    VOICE: 'voice',
    VIDEO: 'video',
    CARD: 'card',
  };

  // 会话类型
  const CHAT_TYPE = {
    SINGLE: 'single',   // 单聊
    GROUP: 'group',      // 群聊
  };

  // Mock 消息数据（更丰富）
  const MOCK_CONVERSATIONS = [
    {
      id: 'conv_001',
      chatType: CHAT_TYPE.SINGLE,
      chatName: '张三（产品经理）',
      avatar: null,
      unreadCount: 2,
      lastMessage: {
        id: 'msg_001_3',
        type: MSG_TYPE.TEXT,
        content: '新车上线需求文档已更新，麻烦看下评审意见',
        sender: '张三',
        time: '2026-05-27T10:32:00',
        timeLabel: '10:32',
      },
      messages: [
        { id: 'msg_001_1', type: MSG_TYPE.TEXT, content: '在吗？新车上线的需求有更新', sender: '张三', time: '2026-05-27T10:28:00', timeLabel: '10:28' },
        { id: 'msg_001_2', type: MSG_TYPE.LINK, content: '[链接] 新车上线PRD v2.3', sender: '张三', time: '2026-05-27T10:30:00', timeLabel: '10:30' },
        { id: 'msg_001_3', type: MSG_TYPE.TEXT, content: '新车上线需求文档已更新，麻烦看下评审意见', sender: '张三', time: '2026-05-27T10:32:00', timeLabel: '10:32' },
      ]
    },
    {
      id: 'conv_002',
      chatType: CHAT_TYPE.SINGLE,
      chatName: '李四（前端开发）',
      avatar: null,
      unreadCount: 1,
      lastMessage: {
        id: 'msg_002_2',
        type: MSG_TYPE.TEXT,
        content: '接口联调完成，骑行卡页面可以验收了',
        sender: '李四',
        time: '2026-05-27T09:45:00',
        timeLabel: '09:45',
      },
      messages: [
        { id: 'msg_002_1', type: MSG_TYPE.TEXT, content: '骑行卡的接口我这边改好了', sender: '李四', time: '2026-05-27T09:40:00', timeLabel: '09:40' },
        { id: 'msg_002_2', type: MSG_TYPE.TEXT, content: '接口联调完成，骑行卡页面可以验收了', sender: '李四', time: '2026-05-27T09:45:00', timeLabel: '09:45' },
      ]
    },
    {
      id: 'conv_003',
      chatType: CHAT_TYPE.GROUP,
      chatName: '两轮设计周会群',
      avatar: null,
      unreadCount: 5,
      lastMessage: {
        id: 'msg_003_3',
        type: MSG_TYPE.TEXT,
        content: '本周设计评审改到周四下午3点，地点不变',
        sender: '王五',
        time: '2026-05-26T17:20:00',
        timeLabel: '昨天',
      },
      messages: [
        { id: 'msg_003_1', type: MSG_TYPE.TEXT, content: '@所有人 本周评审时间有变动', sender: '王五', time: '2026-05-26T17:15:00', timeLabel: '17:15' },
        { id: 'msg_003_2', type: MSG_TYPE.TEXT, content: '收到', sender: '赵六', time: '2026-05-26T17:18:00', timeLabel: '17:18' },
        { id: 'msg_003_3', type: MSG_TYPE.TEXT, content: '本周设计评审改到周四下午3点，地点不变', sender: '王五', time: '2026-05-26T17:20:00', timeLabel: '17:20' },
      ]
    },
    {
      id: 'conv_004',
      chatType: CHAT_TYPE.GROUP,
      chatName: '哈啰新车项目组',
      avatar: null,
      unreadCount: 0,
      lastMessage: {
        id: 'msg_004_1',
        type: MSG_TYPE.IMAGE,
        content: '[图片] 新车渲染图终稿',
        sender: '设计-小明',
        time: '2026-05-26T14:30:00',
        timeLabel: '昨天',
      },
      messages: [
        { id: 'msg_004_1', type: MSG_TYPE.IMAGE, content: '[图片] 新车渲染图终稿', sender: '设计-小明', time: '2026-05-26T14:30:00', timeLabel: '14:30' },
      ]
    },
    {
      id: 'conv_005',
      chatType: CHAT_TYPE.SINGLE,
      chatName: '陈七（运营）',
      avatar: null,
      unreadCount: 0,
      lastMessage: {
        id: 'msg_005_1',
        type: MSG_TYPE.TEXT,
        content: '618活动的 banner 素材收到了，谢谢！',
        sender: '陈七',
        time: '2026-05-25T16:00:00',
        timeLabel: '前天',
      },
      messages: [
        { id: 'msg_005_1', type: MSG_TYPE.TEXT, content: '618活动的 banner 素材收到了，谢谢！', sender: '陈七', time: '2026-05-25T16:00:00', timeLabel: '前天' },
      ]
    },
  ];

  class DingTalkService {
    constructor() {
      this.authStatus = AUTH_STATUS.NOT_CONNECTED;
      this.userInfo = null;
      this.conversations = [];
    }

    /**
     * 获取授权状态
     */
    getAuthStatus() {
      return this.authStatus;
    }

    /**
     * 模拟授权连接
     * 后续替换为钉钉 OAuth2 流程
     */
    async connect() {
      this.authStatus = AUTH_STATUS.CONNECTING;
      await this._delay(800);
      // Mock: 直接成功
      this.authStatus = AUTH_STATUS.CONNECTED;
      this.userInfo = {
        name: '设计师小哈',
        avatar: null,
        userId: 'mock_user_001',
        department: '两轮事业部-设计中心',
      };
      return true;
    }

    /**
     * 断开连接
     */
    disconnect() {
      this.authStatus = AUTH_STATUS.NOT_CONNECTED;
      this.userInfo = null;
      this.conversations = [];
    }

    /**
     * 获取会话列表
     */
    async getConversations() {
      if (this.authStatus !== AUTH_STATUS.CONNECTED) {
        await this.connect();
      }
      await this._delay(300);
      this.conversations = MOCK_CONVERSATIONS;
      return this.conversations;
    }

    /**
     * 获取某个会话的消息详情
     */
    async getMessages(conversationId) {
      await this._delay(200);
      const conv = MOCK_CONVERSATIONS.find(c => c.id === conversationId);
      return conv ? conv.messages : [];
    }

    /**
     * 获取总未读数
     */
    async getUnreadCount() {
      const convs = await this.getConversations();
      return convs.reduce((sum, c) => sum + c.unreadCount, 0);
    }

    /**
     * 标记会话已读
     */
    async markAsRead(conversationId) {
      await this._delay(100);
      const conv = MOCK_CONVERSATIONS.find(c => c.id === conversationId);
      if (conv) conv.unreadCount = 0;
      return true;
    }

    /**
     * 获取用户信息
     */
    getUserInfo() {
      return this.userInfo;
    }

    _delay(ms) { return new Promise(r => setTimeout(r, ms)); }
  }

  window.DingTalkService = DingTalkService;
  window.DINGTALK_AUTH_STATUS = AUTH_STATUS;
  window.DINGTALK_MSG_TYPE = MSG_TYPE;
  window.DINGTALK_CHAT_TYPE = CHAT_TYPE;
})();
