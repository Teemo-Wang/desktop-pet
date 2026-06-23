/**
 * 语雀服务层
 * 封装语雀开放 API，当前使用 mock 数据
 * 后续替换：https://www.yuque.com/yuque/developer
 */

(function() {

  const AUTH_STATUS = {
    NOT_CONNECTED: 'not_connected',
    CONNECTED: 'connected',
    EXPIRED: 'expired',
    ERROR: 'error',
  };

  // Mock 文档数据
  const MOCK_DOCS = {
    'hellobike.yuque.com/zo0rpl/am5rev/new-bike-spec': {
      id: 'doc_001',
      title: '新车曝光资源位工作手册',
      author: '设计-小哈',
      updatedAt: '2026-05-27 09:30',
      wordCount: 3200,
      content: `# 新车曝光资源位工作手册

## 一、资源位概述
新车曝光资源位是哈啰两轮 App 首页核心运营位，用于新车型上线时的视觉曝光和用户引导。

## 二、设计规范
### 2.1 尺寸规格
- 首页 Banner：750×360px（@2x）
- 场景卡：340×200px（@2x）
- Tab 图标：96×96px（@2x），安全区 72×72px

### 2.2 设计约束
- 场景卡文案不超过 3 个字
- 动态文案不超过 6 个字
- 主色调跟随品牌蓝 #0076FF
- 新车渲染图需提供三视图（正面、侧面、45度）

## 三、交付流程
1. 产品提供需求文档和车型信息
2. 设计出图（含 A-F 分类全套素材）
3. 使用 bike-material-generator 批量生成
4. 上传至 CDN 并通知开发配置

## 四、注意事项
- 所有切图需要 tinify 压缩
- Lottie 动效文件不超过 200KB
- 适配深色模式需额外出一套`,
    },
    'hellobike.yuque.com/zo0rpl/am5rev/design-spec-q2': {
      id: 'doc_002',
      title: '2026 Q2 设计规范更新',
      author: '设计组',
      updatedAt: '2026-05-26 14:00',
      wordCount: 5600,
      content: `# 2026 Q2 设计规范更新

## 更新概要
本次更新主要涉及：色彩系统微调、圆角规范统一、新增组件库。

## 一、色彩系统
### 品牌色
- 主色保持 #0076FF 不变
- 新增品牌渐变：#0076FF → #1492FF（用于 CTA 按钮）
- 辅助色新增活力橙 #FF6D00（用于活动运营）

### 功能色调整
- Success 绿色从 #34C759 调整为 #00B365（更沉稳）
- Warning 保持 #FF9500
- Error 保持 #FF3B30

## 二、圆角规范
统一为 4px 基础单位：
- 小组件：8px
- 卡片：16px
- 弹窗/Sheet：20px
- 全屏模态：28px

## 三、新增组件
- 骑行卡组件（含动效）
- 新车展示卡（支持 3D 旋转）
- 活动倒计时组件`,
    },
    'hellobike.yuque.com/zo0rpl/am5rev/easter-egg-sop': {
      id: 'doc_003',
      title: '彩蛋车链路梳理 SOP',
      author: '设计-小哈',
      updatedAt: '2026-05-24 16:45',
      wordCount: 2100,
      content: `# 彩蛋车链路梳理 SOP

## 什么是彩蛋车
彩蛋车是哈啰两轮的特殊运营玩法，用户在骑行过程中随机遇到特殊外观的车辆，扫码骑行可获得奖励。

## 设计链路
1. 运营确定彩蛋主题和奖励方案
2. 设计制作彩蛋车外观贴纸
3. 开发配置彩蛋车识别逻辑
4. 设计制作中奖动效和弹窗
5. 上线测试和数据监控

## 设计交付物
- 车身贴纸设计稿（AI 格式）
- 扫码成功弹窗（Figma 标注）
- 中奖动效（Lottie JSON）
- 分享卡片（750×1334px）`,
    },
  };

  class YuqueService {
    constructor() {
      this.authStatus = AUTH_STATUS.NOT_CONNECTED;
      this.token = '';
      this.userInfo = null;
      this.recentDocs = []; // 最近读取记录
    }

    getAuthStatus() { return this.authStatus; }

    /**
     * 连接授权
     * @param {string} token - 语雀 Personal Access Token
     */
    async connect(token) {
      if (!token || token.trim().length < 5) {
        throw new Error('Token 格式无效');
      }
      this.token = token.trim();
      await this._delay(500);
      // Mock: 直接成功
      this.authStatus = AUTH_STATUS.CONNECTED;
      this.userInfo = { name: '设计师小哈', login: 'designer-xiaoha' };
      return true;
    }

    /**
     * 断开授权
     */
    disconnect() {
      this.authStatus = AUTH_STATUS.NOT_CONNECTED;
      this.token = '';
      this.userInfo = null;
    }

    /**
     * 测试连接
     */
    async testConnection() {
      if (!this.token) return { success: false, message: '未配置 Token' };
      await this._delay(300);
      if (this.authStatus === AUTH_STATUS.CONNECTED) {
        return { success: true, message: `已连接 (${this.userInfo.name})` };
      }
      return { success: false, message: '连接失败' };
    }

    /**
     * 通过 URL 获取文档
     * @param {string} url - 语雀文档链接
     */
    async getDocumentByUrl(url) {
      if (this.authStatus !== AUTH_STATUS.CONNECTED) {
        throw new Error('请先授权连接语雀');
      }

      // 解析 URL
      const docKey = this._parseUrl(url);
      if (!docKey) {
        throw new Error('链接格式无效，请输入正确的语雀文档链接');
      }

      await this._delay(400);

      // 查找 mock 数据
      const doc = MOCK_DOCS[docKey];
      if (!doc) {
        throw new Error('文档不存在或无权限访问');
      }

      // 加入最近记录
      this._addToRecent(doc);

      return {
        id: doc.id,
        title: doc.title,
        author: doc.author,
        updatedAt: doc.updatedAt,
        wordCount: doc.wordCount,
        summary: doc.content.split('\n').slice(0, 5).join('\n'),
      };
    }

    /**
     * 获取文档完整内容
     * @param {string} docId
     */
    async getDocumentContent(docId) {
      if (this.authStatus !== AUTH_STATUS.CONNECTED) {
        throw new Error('请先授权连接语雀');
      }

      await this._delay(300);

      // 从 mock 中查找
      const doc = Object.values(MOCK_DOCS).find(d => d.id === docId);
      if (!doc) throw new Error('文档不存在');

      return doc.content;
    }

    /**
     * 获取最近读取记录
     */
    getRecentDocs() {
      return this.recentDocs;
    }

    /**
     * 解析语雀 URL
     */
    _parseUrl(url) {
      try {
        // 支持格式：https://hellobike.yuque.com/zo0rpl/am5rev/xxx
        const u = new URL(url.startsWith('http') ? url : 'https://' + url);
        const host = u.hostname;
        const path = u.pathname.replace(/^\//, '');
        return host + '/' + path;
      } catch (e) {
        // 尝试直接匹配
        const cleaned = url.replace(/^https?:\/\//, '');
        if (MOCK_DOCS[cleaned]) return cleaned;
        return null;
      }
    }

    _addToRecent(doc) {
      // 去重
      this.recentDocs = this.recentDocs.filter(d => d.id !== doc.id);
      // 加到最前面
      this.recentDocs.unshift({
        id: doc.id,
        title: doc.title,
        author: doc.author,
        readAt: new Date().toLocaleString('zh-CN'),
      });
      // 最多保留 10 条
      if (this.recentDocs.length > 10) this.recentDocs.pop();
    }

    _delay(ms) { return new Promise(r => setTimeout(r, ms)); }
  }

  window.YuqueService = YuqueService;
  window.YUQUE_AUTH_STATUS = AUTH_STATUS;
})();
