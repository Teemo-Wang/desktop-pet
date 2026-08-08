/**
 * 聊天消息清洗：避免 base64 图片撑爆 API token 与 chat-history.json
 */
(function() {
  const IMAGE_MARKDOWN = /!\[[^\]]*\]\([^)]+\)/g;
  const DATA_URL = /data:image\/[^;]+;base64,[A-Za-z0-9+/=\s]+/gi;

  /** 发给 API 前：所有图片信息都变成 [图片]，不占 token。 */
  function stripForApi(content) {
    if (typeof content !== 'string') return content;
    return content
      .replace(IMAGE_MARKDOWN, '[图片]')
      .replace(DATA_URL, '[图片]')
      .replace(/^📁\s*原图：.*$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function stripDataUrls(content) {
    return stripForApi(content);
  }

  function toFileUrl(filePath) {
    const normalized = String(filePath || '').replace(/\\/g, '/');
    if (!normalized) return '';
    return normalized.startsWith('file://') ? normalized : `file:///${normalized.replace(/^\/+/, '')}`;
  }

  /** 写入 chat-history：只存缩略图路径，绝不存 base64。 */
  function buildStoredImageReply(prefix, archived) {
    const head = String(prefix || '✅ 图片已生成：').trim();
    if (!archived || !archived.ok) return `${head}\n\n[图片]`;
    const thumbUrl = archived.thumbUrl || toFileUrl(archived.thumbPath || archived.path);
    const lines = [`${head}`, '', `![缩略图](${thumbUrl})`];
    if (archived.path) lines.push('', `📁 原图：${archived.path}`);
    return lines.join('\n');
  }

  /** @deprecated 兼容旧调用 */
  function sanitizeForStorage(content, options = {}) {
    if (typeof content !== 'string') return content;
    if (/data:image/i.test(content)) {
      const filePath = options.thumbPath || options.filePath || options.archivedPath || '';
      if (filePath) {
        const fileUrl = toFileUrl(filePath);
        return content
          .replace(IMAGE_MARKDOWN, `![缩略图](${fileUrl})`)
          .replace(DATA_URL, '[图片]');
      }
      return stripForApi(content);
    }
    return content;
  }

  function buildApiMessages(messages, options = {}) {
    const maxMessages = Number(options.maxMessages) || 24;
    const list = Array.isArray(messages) ? messages.slice() : [];
    const system = list.filter(item => item.role === 'system');
    const dialog = list.filter(item => item.role === 'user' || item.role === 'assistant');
    const tail = dialog.slice(-maxMessages);
    return [...system, ...tail].map(item => ({
      role: item.role,
      content: stripForApi(item.content),
    }));
  }

  window.TeemoMessageSanitize = {
    stripDataUrls,
    stripForApi,
    sanitizeForStorage,
    buildStoredImageReply,
    buildApiMessages,
    toFileUrl,
  };
})();
