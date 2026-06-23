/**
 * 语雀文档缓存
 *
 * 目的：
 *   - 同一文档 5 分钟内不重复请求语雀 API（语雀有 QPS 限制）
 *   - AI 总结、转待办等多次操作复用同一份文档内容
 *
 * 策略：内存 LRU，最多 50 条
 */
(function() {

  const TTL = 5 * 60 * 1000; // 5 分钟
  const MAX_SIZE = 50;

  class YuqueCache {
    constructor() {
      this._map = new Map(); // key → { value, expireAt }
    }

    /** 生成缓存键 */
    _key(namespace, slug) {
      return `${namespace}::${slug}`;
    }

    get(namespace, slug) {
      const key = this._key(namespace, slug);
      const entry = this._map.get(key);
      if (!entry) return null;
      if (Date.now() > entry.expireAt) {
        this._map.delete(key);
        return null;
      }
      // 访问后移到最新位置（LRU）
      this._map.delete(key);
      this._map.set(key, entry);
      return entry.value;
    }

    set(namespace, slug, value) {
      const key = this._key(namespace, slug);
      this._map.set(key, { value, expireAt: Date.now() + TTL });
      // 超出上限淘汰最旧项
      while (this._map.size > MAX_SIZE) {
        const firstKey = this._map.keys().next().value;
        this._map.delete(firstKey);
      }
    }

    clear() {
      this._map.clear();
    }
  }

  window.YuqueCache = YuqueCache;
})();
