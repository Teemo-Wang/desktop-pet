/**
 * 需求卡片组件
 * 职责：在 AI 面板中渲染结构化的需求总结卡片，含作图判断和操作建议
 */
(function() {

  const SOURCE_CONFIG = {
    yuque: { icon: '📄', label: '语雀文档', color: '#00B365' },
    dingtalk: { icon: '💬', label: '钉钉消息', color: '#0076FF' },
    user: { icon: '💡', label: '用户输入', color: '#AF52DE' },
  };

  const TYPE_LABELS = {
    banner: '🖼️ Banner 设计',
    themeCard: '🃏 主题卡设计',
    icon: '⚙️ 图标设计',
    poster: '📐 海报/主视觉',
    illustration: '🎨 插画/IP',
    revision: '🔄 改图迭代',
    insufficient: '⚠️ 信息不足',
    'non-design': '',
  };

  class DemandCard {
    /**
     * 渲染需求卡片 HTML
     * @param {object} data
     *   - source: 'yuque'|'dingtalk'|'user'
     *   - sourceLabel: string (如 "语雀文档：新车上线方案")
     *   - aiSummary: string
     *   - demandType: string
     *   - needsVisual: boolean
     *   - suggestion: string
     *   - recommendedMethod: number
     * @returns {string} HTML
     */
    static render(data) {
      const src = SOURCE_CONFIG[data.source] || SOURCE_CONFIG.user;
      const typeLabel = TYPE_LABELS[data.demandType] || '';

      let html = `<div class="demand-card" data-demand-id="${data.id || ''}">`;

      // 来源标识
      html += `<div class="dc-source" style="--dc-color:${src.color}">
        <span class="dc-source-icon">${src.icon}</span>
        <span class="dc-source-text">${_esc(data.sourceLabel || src.label)}</span>
      </div>`;

      // AI 总结内容
      html += `<div class="dc-summary">${window.Markdown ? window.Markdown.render(data.aiSummary || '') : _esc(data.aiSummary || '')}</div>`;

      // 需求类型标签
      if (typeLabel) {
        html += `<div class="dc-type-tag">${typeLabel}</div>`;
      }

      // 操作建议
      if (data.suggestion) {
        html += `<div class="dc-suggestion">💡 ${_esc(data.suggestion)}</div>`;
      }

      // 生图按钮（仅作图需求展示）
      if (data.needsVisual) {
        html += `<button class="dc-gen-btn" data-action="start-visual-gen">🎨 生成视觉图</button>`;
      }

      html += `</div>`;
      return html;
    }

    /**
     * 构造需求卡片数据
     * @param {object} options
     *   - source, sourceLabel, aiSummary, classification (from VisualGenService.classifyDemand)
     * @returns {object} DemandCard 数据
     */
    static buildData({ source, sourceLabel, aiSummary, classification }) {
      return {
        id: 'dc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
        source: source || 'user',
        sourceLabel: sourceLabel || '',
        aiSummary: aiSummary || '',
        demandType: classification?.type || 'non-design',
        needsVisual: classification?.needsVisual || false,
        suggestion: classification?.suggestion || '',
        recommendedMethod: classification?.recommendedMethod || 2,
        extractedParams: classification?.extractedParams || {},
        timestamp: Date.now(),
      };
    }
  }

  function _esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  window.DemandCard = DemandCard;
})();
