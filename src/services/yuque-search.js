/**
 * 语雀 AI 智能搜索
 * 职责：把用户的模糊关键词翻译成"最相关的文档列表"
 * 策略：
 *   1. 先做关键词初筛（命中标题/正文），命中数≥1 直接返回
 *   2. 命中为 0 时调 AI，从全量文档元数据中按语义匹配
 *   3. AI 返回结构化 JSON: [{ slug, title, score, reason }]
 *
 * 用法：
 *   const searcher = new YuqueSearchService(yqService);
 *   const results = await searcher.search('新车 banner 设计规范');
 *   // results: [{ slug, title, author, updated, excerpt, score, reason }]
 */
(function() {

  /** 判断输入是否像 URL（包含语雀域名或 http） */
  function looksLikeURL(text) {
    if (!text) return false;
    return /^https?:\/\//.test(text) || /yuque\.com/.test(text);
  }

  class YuqueSearchService {
    constructor(yuqueService) {
      this.yq = yuqueService;
    }

    /**
     * 搜索入口
     * @param {string} query
     * @returns {Promise<{ mode: 'keyword'|'ai'|'empty', results: Array }>}
     */
    async search(query) {
      const q = String(query || '').trim();
      if (!q) return { mode: 'empty', results: [] };

      // 第一步：关键词初筛
      const keywordHits = this.yq.keywordFilter(q);
      if (keywordHits.length > 0) {
        return {
          mode: 'keyword',
          results: keywordHits.map(d => ({ ...d, score: 100, reason: '标题或正文匹配关键词' })),
        };
      }

      // 第二步：AI 语义搜索
      try {
        const aiResults = await this._aiSearch(q);
        return { mode: 'ai', results: aiResults };
      } catch (e) {
        console.warn('[yuque-search] AI 搜索失败:', e);
        return { mode: 'ai', results: [] };
      }
    }

    /** 调 AI 在文档元数据中找最相关项 */
    async _aiSearch(query) {
      const meta = this.yq.listMeta();
      if (meta.length === 0) return [];

      const docList = meta.map(d => `- slug: ${d.slug}\n  标题: ${d.title}\n  作者: ${d.author}\n  摘要: ${d.excerpt}`).join('\n\n');
      const prompt = `下面是知识库中所有文档的元数据，用户正在搜索：「${query}」\n\n请挑出与用户搜索意图最相关的文档（最多 5 个），按相关度从高到低排序。\n仅输出严格 JSON 数组，不要任何额外说明、markdown 标记或注释，每项格式：\n[{"slug":"slug值","score":0-100,"reason":"为什么相关，一句话"}]\n如果没有相关文档，返回 []\n\n文档元数据：\n${docList}`;

      const reply = await window.aiService.send([
        { role: 'system', content: '你是一个高效的文档检索助手，只输出 JSON。' },
        { role: 'user', content: prompt }
      ]);

      const parsed = this._parseJSON(reply);
      // 把 slug 映射回完整文档元数据
      return parsed
        .map(item => {
          const m = meta.find(d => d.slug === item.slug);
          if (!m) return null;
          return { ...m, score: Number(item.score) || 0, reason: String(item.reason || '') };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score);
    }

    /** AI 输出 JSON 容错解析 */
    _parseJSON(raw) {
      if (!raw) return [];
      let text = String(raw).trim();
      text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      const start = text.indexOf('[');
      const end = text.lastIndexOf(']');
      if (start === -1 || end === -1 || end < start) return [];
      try {
        const arr = JSON.parse(text.slice(start, end + 1));
        return Array.isArray(arr) ? arr.filter(x => x && typeof x.slug === 'string') : [];
      } catch (e) {
        console.warn('[yuque-search] parse fail:', e);
        return [];
      }
    }
  }

  window.YuqueSearchService = YuqueSearchService;
  window.YuqueSearchUtils = { looksLikeURL };
})();
