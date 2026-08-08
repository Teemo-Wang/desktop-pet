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

  function langLabel(lang) {
    const key = String(lang || '').trim().toLowerCase();
    if (!key) return 'CODE';
    const map = {
      js: 'JS', javascript: 'JS', ts: 'TS', typescript: 'TS',
      json: 'JSON', css: 'CSS', html: 'HTML', md: 'MD', markdown: 'MD',
      py: 'Python', python: 'Python', sh: 'Shell', bash: 'Shell', shell: 'Shell',
      ps1: 'PowerShell', powershell: 'PowerShell', txt: 'Text', text: 'Text',
    };
    return map[key] || key.toUpperCase();
  }

  function buildCodeBlock(rawCode, lang) {
    const codeText = escapeHTML(rawCode);
    const label = langLabel(lang);
    return `<div class="md-code-block">
      <div class="md-code-toolbar">
        <span class="md-code-lang">${escapeHTML(label)}</span>
        <button type="button" class="md-copy-btn" data-copy-code="1">复制</button>
      </div>
      <pre><code class="lang-${escapeHTML(lang || '')}">${codeText}</code></pre>
    </div>`;
  }

  function renderInline(text) {
    let s = escapeHTML(text);
    // 行内代码：`code`
    s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    // 加粗：**text**
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    // 斜体：*text*（避免与上面 ** 冲突）
    s = s.replace(/(^|[\s])\*([^*\n]+)\*(?=[\s.,!?;:)]|$)/g, '$1<em>$2</em>');
    // 图片：![alt](url) —— 必须在链接规则之前处理；file:/// 本地路径也支持
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,
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
          out.push(buildCodeBlock(codeBuf.join('\n'), codeLang));
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
      out.push(buildCodeBlock(codeBuf.join('\n'), codeLang));
    }
    flushList();

    return out.join('');
  }

  async function copyText(text) {
    const value = String(text || '');
    if (!value) return false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch (_) { /* fall through */ }
    try {
      const area = document.createElement('textarea');
      area.value = value;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.left = '-9999px';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch (_) {
      return false;
    }
  }

  /** 仅识别「Skill 系统文案」代码块，普通对话一律不算 */
  function looksLikeSystemCopy(text) {
    const value = String(text || '').trim();
    if (!value) return false;
    // 必须是明确的 Skill 文档结构，不能因为提到“技能/规则”就判定
    if (/#\s*Skill[:：]\s*\S+/i.test(value)) return true;
    if (/^---\s*\n[\s\S]*?\nname\s*:\s*.+\n[\s\S]*?\n---/i.test(value) && /#\s+\S+/m.test(value)) return true;
    return false;
  }

  function isSkillCodeBlock(text) {
    const value = String(text || '').trim();
    if (!value) return false;
    return /#\s*Skill[:：]\s*\S+/i.test(value)
      || (/name\s*:\s*.+/i.test(value) && /description\s*:/i.test(value) && value.length >= 120);
  }

  /** 给代码块绑定复制；整段「复制文案」仍只给 Skill 系统文案 */
  function bindCopyButtons(root, options = {}) {
    if (!root) return;

    // 先清掉普通对话上误加的整段复制按钮
    root.querySelectorAll('.teemo-msg-copy').forEach(btn => btn.remove());
    root.querySelectorAll('.teemo-message-body, .msg-body').forEach(body => {
      body.dataset.copyBound = '0';
    });

    root.querySelectorAll('.md-code-block').forEach(block => {
      const code = block.querySelector('code');
      const codeText = code ? String(code.textContent || '') : '';
      const button = block.querySelector('.md-copy-btn[data-copy-code]');
      if (!button || button.dataset.bound === '1') return;
      button.dataset.bound = '1';
      button.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        const ok = await copyText(codeText);
        const old = button.textContent;
        button.textContent = ok ? '已复制' : '复制失败';
        setTimeout(() => { button.textContent = old || '复制'; }, 1200);
      });
    });

    // 默认不再给整条气泡加「复制文案」；只有显式开启且正文本身就是 Skill 文档时才加
    if (options.messageCopy !== true) return;

    root.querySelectorAll('.teemo-message.assistant .teemo-message-body, .msg.bot .msg-body, .msg.assistant .msg-body').forEach(body => {
      const text = (body.innerText || body.textContent || '').trim();
      if (!looksLikeSystemCopy(text)) return;
      if (body.querySelector('.teemo-msg-copy')) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'teemo-msg-copy';
      btn.textContent = '复制文案';
      btn.title = '复制 Skill 系统文案';
      btn.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        const latest = (body.innerText || body.textContent || '').replace(/\n?复制文案\s*$/, '').trim();
        const ok = await copyText(latest);
        const old = btn.textContent;
        btn.textContent = ok ? '已复制' : '复制失败';
        setTimeout(() => { btn.textContent = old; }, 1200);
      });
      body.appendChild(btn);
    });
  }

  window.Markdown = { render, escapeHTML, copyText, bindCopyButtons, looksLikeSystemCopy };
})();
