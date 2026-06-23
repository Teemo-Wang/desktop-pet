/**
 * 语雀 URL 解析工具（纯函数，无副作用）
 *
 * 支持的格式：
 *   1. https://hellobike.yuque.com/zo0rpl/am5rev/dfc1qnc6p65zvrda
 *   2. https://www.yuque.com/lark/yuque-api/xxxxxxx
 *   3. hellobike.yuque.com/zo0rpl/am5rev/xxx（无 schema）
 *
 * 输出统一结构：
 *   { host, namespace, slug, repoNamespace }
 *   其中 namespace = "zo0rpl/am5rev"（团队/知识库），slug = 文档路径
 *   repoNamespace 用于调 /api/v2/repos/:namespace/docs/:slug
 */
(function() {

  /**
   * 解析语雀 URL
   * @param {string} url
   * @returns {{host, namespace, slug, repoNamespace}|null}
   */
  function parseYuqueUrl(url) {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim();
    if (!trimmed) return null;

    try {
      // 没 schema 的补一个，便于 URL 构造器解析
      const u = new URL(/^https?:\/\//.test(trimmed) ? trimmed : 'https://' + trimmed);
      const host = u.hostname;
      // 必须是 yuque.com 子域名
      if (!host.endsWith('yuque.com')) return null;
      // path: /zo0rpl/am5rev/dfc1qnc6p65zvrda → ['zo0rpl', 'am5rev', 'dfc1qnc6p65zvrda']
      const parts = u.pathname.replace(/^\/+|\/+$/g, '').split('/');
      if (parts.length < 3) return null;
      const [team, repo, slug] = parts;
      return {
        host,
        namespace: `${team}/${repo}`,    // 用于调 API
        slug,
        repoNamespace: `${team}/${repo}`, // 仓库标识（同 namespace，预留扩展）
      };
    } catch (e) {
      return null;
    }
  }

  /** 判断字符串是否像语雀 URL */
  function looksLikeYuqueUrl(text) {
    if (!text) return false;
    return /yuque\.com/.test(text);
  }

  window.YuqueUrl = { parseYuqueUrl, looksLikeYuqueUrl };
})();
