/**
 * 语雀 HTTP API 客户端
 *
 * 文档：https://www.yuque.com/yuque/developer/api
 *
 * 重要：
 *   - 所有请求必须带 X-Auth-Token 头
 *   - 个人 Token 在 https://www.yuque.com/settings/tokens 创建
 *   - 企业空间需要用对应的 baseUrl，例如 https://hellobike.yuque.com
 *
 * 错误处理：所有方法抛出已翻译的中文错误，外层只需 catch 显示 message
 */
(function() {

  /** 把 HTTP 错误转成可读的中文 Error */
  async function _toError(res) {
    let detail = '';
    try {
      const data = await res.json();
      detail = data?.message || data?.error || '';
    } catch (e) { /* 不是 JSON */ }
    if (res.status === 401) return new Error('⚠️ Token 无效或已过期');
    if (res.status === 403) return new Error('⚠️ 无权访问该资源');
    if (res.status === 404) return new Error('⚠️ 文档不存在或已删除');
    if (res.status === 429) return new Error('⚠️ 请求过于频繁，请稍后再试');
    if (res.status >= 500) return new Error('⚠️ 语雀服务暂时不可用');
    return new Error('⚠️ 请求失败 (' + res.status + ')' + (detail ? '：' + detail : ''));
  }

  class YuqueAPI {
    /**
     * @param {{baseUrl:string, token:string}} config
     */
    constructor(config) {
      this.config = config || { baseUrl: 'https://www.yuque.com', token: '' };
    }

    /** 更新配置（切换 token / baseUrl 时调用） */
    setConfig(config) {
      this.config = { ...this.config, ...config };
    }

    /** 通用请求方法 */
    async _request(path, options = {}) {
      if (!this.config.token) throw new Error('⚠️ 未配置 Token');
      const url = this.config.baseUrl.replace(/\/+$/, '') + '/api/v2' + path;
      const res = await fetch(url, {
        ...options,
        headers: {
          'X-Auth-Token': this.config.token,
          'User-Agent': 'hellobike-desktop-pet',
          ...(options.headers || {}),
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw await _toError(res);
      const json = await res.json();
      return json.data;
    }

    /** 获取当前用户信息（用于校验 Token） */
    async getCurrentUser() {
      return this._request('/user');
    }

    /**
     * 获取单篇文档
     * @param {string} namespace - 团队/知识库，如 "zo0rpl/am5rev"
     * @param {string} slug - 文档路径
     * @returns {Promise<{id, title, body, body_html, user, updated_at, word_count, ...}>}
     */
    async getDoc(namespace, slug) {
      return this._request(`/repos/${encodeURIComponent(namespace)}/docs/${encodeURIComponent(slug)}`);
    }

    /**
     * 获取知识库下的文档列表（分页，最多 100 条/页）
     * @param {string} namespace
     */
    async listDocs(namespace) {
      return this._request(`/repos/${encodeURIComponent(namespace)}/docs`);
    }
  }

  window.YuqueAPI = YuqueAPI;
})();
