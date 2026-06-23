/**
 * 上下文构建 + 需求分析
 */
(function() {
  const ANALYSIS_PROMPT = `你是哈啰出行两轮事业部的资深设计助手。请基于以下工作上下文，输出结构化需求分析：

## 📋 需求摘要
## 🎯 关键目标
## 📱 涉及页面/活动
## 🎨 设计交付内容
## ❓ 需要确认的问题
## ✅ 下一步待办

---
`;

  window.ContextUtils = {
    // 从钉钉会话构建分析 prompt
    async buildAnalysisPrompt(conv, yuqueService) {
      let ctx = `【来源】钉钉 - ${conv.name}\n【消息】\n`;
      ctx += conv.messages.map(m => `[${m.time}] ${m.sender}: ${m.content}`).join('\n');

      // 检测语雀链接
      const links = (conv.messages.map(m=>m.content).join(' ').match(/[\w.-]*yuque\.com\/[\w\-\/]+/gi) || []);
      for (const link of [...new Set(links)]) {
        try {
          const doc = await yuqueService.getDocByUrl(link);
          ctx += `\n\n【关联文档：${doc.title}】\n${doc.content}`;
        } catch(e) {}
      }

      return ANALYSIS_PROMPT + ctx;
    },

    // 简单总结 prompt
    buildSummaryPrompt(conv) {
      const msgs = conv.messages.map(m => `${m.sender}: ${m.content}`).join('\n');
      return `请总结以下钉钉消息的重点，按优先级列出需要处理的事项：\n\n【${conv.name}】\n${msgs}`;
    }
  };
})();
