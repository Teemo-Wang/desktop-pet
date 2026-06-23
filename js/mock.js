/**
 * Mock 数据和占位接口
 */

window.MockData = {
  dingtalkMessages: [
    { id: 1, sender: '张三（产品）', content: '新车上线需求文档已更新，麻烦看下', time: '10:32', unread: true },
    { id: 2, sender: '李四（开发）', content: '接口联调完成，可以验收了', time: '09:45', unread: true },
    { id: 3, sender: '设计周会群', content: '王五: 本周设计评审改到周四下午', time: '昨天', unread: false },
  ],

  yuqueDocuments: [
    { id: 1, title: '新车曝光资源位工作手册', updatedAt: '2小时前', author: '我' },
    { id: 2, title: '2026 Q2 设计规范更新', updatedAt: '昨天', author: '设计组' },
    { id: 3, title: '彩蛋车链路梳理 SOP', updatedAt: '3天前', author: '我' },
    { id: 4, title: '骑行卡视觉方案 V2', updatedAt: '上周', author: '我' },
  ],

  notifications: [
    { id: 1, type: 'design', title: '设计评审提醒', content: '明天 14:00 新车主题卡评审', time: '30分钟后' },
    { id: 2, type: 'task', title: '任务截止提醒', content: '骑行卡切图交付 - 今天 18:00', time: '5小时后' },
    { id: 3, type: 'system', title: '系统通知', content: 'Figma 插件已更新到 v2.1.0', time: '1小时前' },
  ],

  about: {
    name: '哈啰桌面助手',
    version: '1.0.0-demo',
    description: '哈啰两轮事业部设计团队桌面工作助手',
    author: '哈啰设计中心',
  }
};

window.MockAPI = {
  async getDingtalkMessages() {
    await this._delay(200);
    return window.MockData.dingtalkMessages;
  },
  async getYuqueDocuments() {
    await this._delay(200);
    return window.MockData.yuqueDocuments;
  },
  async getNotifications() {
    await this._delay(200);
    return window.MockData.notifications;
  },
  async getUnreadCount() {
    return {
      dingtalk: window.MockData.dingtalkMessages.filter(m => m.unread).length,
      notifications: window.MockData.notifications.length,
    };
  },
  _delay(ms) { return new Promise(r => setTimeout(r, ms)); }
};
