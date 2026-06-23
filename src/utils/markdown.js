/**
 * 轻量 Markdown 渲染器
 * 支持：标题(#~####) 加粗 *斜体* `行内代码` ``` 代码块 - * 1. 列表 链接 引用 分割线
 * 不引第三方依赖，避免膨胀
 */
(function() {

  function escapeHTML(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderInline(text) {
    let s = escapeHTML(text);
    // 行内代码：`code`
    s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    // 加粗：**text**
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    // 斜体：*text*（避免与上面 ** 冲突）
    s = s.replace(/(^|[\s])\*([^*\n]+)\*(?=[\s.,!?;:)]|$)/g, '$1<em>$2</em>');
    // 图片：![alt](url) —— 必须在链接规则之前处理，否则会被链接规则吃掉
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
      '<img class="md-img" src="$2" alt="$1" loading="lazy">');
    // 链接：[text](url)
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    // 自动链接：纯 URL（排除已在标签属性中的，简单用前导空白/括号约束）
    s = s.replace(/(^|[\s(])((https?:\/\/)[^\s)<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
    return s;
  }

  /**
   * 把 markdown 文本渲染为 HTML
   * @param {string} text
   * @returns {string}
   */
  function render(text) {
    if (!text) return '';
    const lines = String(text).split('\n');
    const out = [];

    let inCodeBlock = false;
    let codeBuf = [];
    let codeLang = '';

    let listType = null;   // 'ul' | 'ol' | null
    let listBuf = [];

    const flushList = () => {
      if (listType && listBuf.length) {
        out.push(`<${listType}>` + listBuf.map(item => `<li>${renderInline(item)}</li>`).join('') + `</${listType}>`);
      }
      listType = null;
      listBuf = [];
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // 代码块开关
      const fenceMatch = line.match(/^```\s*(\w*)\s*$/);
      if (fenceMatch) {
        if (inCodeBlock) {
          out.push(`<pre><code class="lang-${codeLang}">${escapeHTML(codeBuf.join('\n'))}</code></pre>`);
          inCodeBlock = false;
          codeBuf = [];
          codeLang = '';
        } else {
          flushList();
          inCodeBlock = true;
          codeLang = fenceMatch[1] || '';
        }
        continue;
      }
      if (inCodeBlock) { codeBuf.push(line); continue; }

      // 空行：刷新列表，输出空白
      if (!line.trim()) {
        flushList();
        out.push('<div class="md-spacer"></div>');
        continue;
      }

      // 分割线
      if (/^---+$/.test(line.trim())) {
        flushList();
        out.push('<hr>');
        continue;
      }

      // 标题
      const h = line.match(/^(#{1,4})\s+(.+)$/);
      if (h) {
        flushList();
        const level = h[1].length;
        out.push(`<h${level + 2} class="md-h${level}">${renderInline(h[2])}</h${level + 2}>`);
        continue;
      }

      // 引用
      const blockquote = line.match(/^>\s?(.*)$/);
      if (blockquote) {
        flushList();
        out.push(`<blockquote>${renderInline(blockquote[1])}</blockquote>`);
        continue;
      }

      // 有序列表
      const ol = line.match(/^\s*(\d+)\.\s+(.+)$/);
      if (ol) {
        if (listType !== 'ol') { flushList(); listType = 'ol'; }
        listBuf.push(ol[2]);
        continue;
      }

      // 无序列表
      const ul = line.match(/^\s*[-*]\s+(.+)$/);
      if (ul) {
        if (listType !== 'ul') { flushList(); listType = 'ul'; }
        listBuf.push(ul[1]);
        continue;
      }

      // 普通段落
      flushList();
      out.push(`<p>${renderInline(line)}</p>`);
    }

    // 收尾
    if (inCodeBlock && codeBuf.length) {
      out.push(`<pre><code class="lang-${codeLang}">${escapeHTML(codeBuf.join('\n'))}</code></pre>`);
    }
    flushList();

    return out.join('');
  }

  window.Markdown = { render, escapeHTML };
})();
