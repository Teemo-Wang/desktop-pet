/**
 * 需求分析模块
 * 打通钉钉消息 + 语雀文档 + AI 助手的完整工作流
 * 
 * 流程：
 * 1. 从钉钉消息中提取需求信息
 * 2. 检测消息中的语雀链接，自动读取文档
 * 3. 将所有上下文整合后发送给 AI 分析
 * 4. 输出结构化的需求分析报告
 */

(function() {

  // 需求分析 prompt 模板
  const ANALYSIS_PROMPT = `你是哈啰出行两轮事业部的资深设计助手。请基于以下工作上下文，输出一份结构化的需求分析报告。

请严格按照以下格式输出：

## 📋 需求摘要
（一句话概括这个需求是什么）

## 🎯 关键目标
（列出 2-3 个核心目标）

## 📱 涉及页面/活动
（列出需要设计的页面或活动）

## 🎨 设计交付内容
（列出具体需要交付的设计物料，含尺寸规格）

## ❓ 需要确认的问题
（列出需要和产品/开发确认的问题）

## ✅ 下一步待办
（按优先级列出待办事项，含建议时间）

---
以下是工作上下文：

`;

  class RequirementAnalyzer {
    constructor() {
      this.yuqueService = null; // 由外部注入
    }

    /**
     * 注入语雀服务（避免重复实例化）
     */
    setYuqueService(service) {
      this.yuqueService = service;
    }

    /**
     * 从钉钉会话分析需求
     * @param {object} conversation - 钉钉会话对象
     * @returns {object} { context, yuqueLinks, prompt }
     */
    async analyzeFromConversation(conversation) {
      // 1. 提取消息文本
      const messagesText = conversation.messages.map(m =>
        `[${m.timeLabel}] ${m.sender}: ${m.content}`
      ).join('\n');

      // 2. 检测语雀链接
      const yuqueLinks = this._extractYuqueLinks(conversation.messages);

      // 3. 读取语雀文档内容
      let yuqueContent = '';
      if (yuqueLinks.length > 0 && this.yuqueService) {
        for (const link of yuqueLinks) {
          try {
            const doc = await this.yuqueService.getDocumentByUrl(link);
            const content = await this.yuqueService.getDocumentContent(doc.id);
            yuqueContent += `\n\n【关联文档：${doc.title}】\n${content}`;
          } catch (e) {
            yuqueContent += `\n\n【文档读取失败：${link}】${e.message}`;
          }
        }
      }

      // 4. 组装完整上下文
      const context = this._buildContext(conversation, messagesText, yuqueContent);

      // 5. 生成 prompt
      const prompt = ANALYSIS_PROMPT + context;

      return {
        context,
        yuqueLinks,
        prompt,
        conversationName: conversation.chatName,
      };
    }

    /**
     * 从纯文本分析需求（用于快捷指令）
     * @param {string} text - 用户输入或粘贴的需求文本
     */
    async analyzeFromText(text) {
      // 检测语雀链接
      const links = this._extractYuqueLinksFromText(text);
      let yuqueContent = '';

      if (links.length > 0 && this.yuqueService) {
        for (const link of links) {
          try {
            const doc = await this.yuqueService.getDocumentByUrl(link);
            const content = await this.yuqueService.getDocumentContent(doc.id);
            yuqueContent += `\n\n【关联文档：${doc.title}】\n${content}`;
          } catch (e) { /* 静默 */ }
        }
      }

      const context = `【需求信息】\n${text}${yuqueContent}`;
      return ANALYSIS_PROMPT + context;
    }

    /**
     * 从消息中提取语雀链接
     */
    _extractYuqueLinks(messages) {
      const links = [];
      const regex = /(?:https?:\/\/)?[\w.-]*yuque\.com\/[\w\-\/]+/gi;

      for (const msg of messages) {
        const matches = msg.content.match(regex);
        if (matches) links.push(...matches);
      }

      return [...new Set(links)]; // 去重
    }

    _extractYuqueLinksFromText(text) {
      const regex = /(?:https?:\/\/)?[\w.-]*yuque\.com\/[\w\-\/]+/gi;
      const matches = text.match(regex);
      return matches ? [...new Set(matches)] : [];
    }

    _buildContext(conversation, messagesText, yuqueContent) {
      let context = '';

      context += `【来源】钉钉 - ${conversation.chatName}\n`;
      context += `【会话类型】${conversation.chatType === 'group' ? '群聊' : '单聊'}\n\n`;
      context += `【消息记录】\n${messagesText}\n`;

      if (yuqueContent) {
        context += `\n${yuqueContent}`;
      }

      return context;
    }
  }

  window.RequirementAnalyzer = RequirementAnalyzer;
})();
