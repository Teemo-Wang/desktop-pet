/**
 * Teemo 联网读取：从用户消息里提取链接，抓取网页/ GitHub 文本后注入给模型。
 */
(function () {
  const https = require('https');
  const http = require('http');
  const { URL } = require('url');

  const URL_RE = /https?:\/\/[^\s<>"'`）)】\]}，,。；;！!？?]+/gi;
  const DEFAULTS = { enabled: true, maxPages: 3, maxChars: 12000, timeoutMs: 20000 };

  function getConfig(store) {
    const raw = (store && typeof store.get === 'function' ? store.get('webBrowse') : null) || {};
    return {
      enabled: raw.enabled !== false,
      maxPages: Math.max(1, Math.min(5, Number(raw.maxPages) || DEFAULTS.maxPages)),
      maxChars: Math.max(2000, Math.min(30000, Number(raw.maxChars) || DEFAULTS.maxChars)),
      timeoutMs: Math.max(5000, Math.min(60000, Number(raw.timeoutMs) || DEFAULTS.timeoutMs)),
    };
  }

  function extractUrls(text) {
    const matches = String(text || '').match(URL_RE) || [];
    const cleaned = matches.map(item => item.replace(/[),.，。；;！!？?]+$/g, ''));
    return [...new Set(cleaned)].slice(0, 5);
  }

  function htmlToText(html) {
    return String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  function extractTitle(html, fallback) {
    const match = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!match) return fallback || '';
    return htmlToText(match[1]).slice(0, 120);
  }

  function requestText(url, options = {}) {
    return new Promise((resolve, reject) => {
      let parsed;
      try {
        parsed = new URL(url);
      } catch (error) {
        reject(new Error('无效链接'));
        return;
      }
      if (!/^https?:$/i.test(parsed.protocol)) {
        reject(new Error('只支持 http/https 链接'));
        return;
      }

      const lib = parsed.protocol === 'https:' ? https : http;
      const timeoutMs = options.timeoutMs || DEFAULTS.timeoutMs;
      const req = lib.request({
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: {
          'User-Agent': 'TeemoDesktopPet/1.0 (WebBrowse)',
          'Accept': 'text/html,application/xhtml+xml,application/json,text/plain,*/*',
          ...(options.headers || {}),
        },
      }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = new URL(res.headers.location, url).toString();
          res.resume();
          requestText(next, options).then(resolve, reject);
          return;
        }
        const chunks = [];
        let size = 0;
        res.on('data', chunk => {
          size += chunk.length;
          if (size > 2 * 1024 * 1024) {
            req.destroy();
            reject(new Error('页面过大'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const encoding = /charset=([^\s;]+)/i.exec(String(res.headers['content-type'] || ''))?.[1] || 'utf-8';
          let body = '';
          try {
            body = buffer.toString(encoding);
          } catch (_) {
            body = buffer.toString('utf-8');
          }
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          resolve({
            url,
            status: res.statusCode || 200,
            contentType: String(res.headers['content-type'] || ''),
            body,
          });
        });
      });
      req.setTimeout(timeoutMs, () => {
        req.destroy();
        reject(new Error('读取超时'));
      });
      req.on('error', reject);
      req.end();
    });
  }

  function githubRawCandidates(url) {
    const match = String(url).match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/(?:tree|blob)\/([^/]+)(?:\/(.*))?)?(?:\/)?$/i);
    if (!match) return [];
    const owner = match[1];
    const repo = match[2].replace(/\.git$/i, '');
    const branch = match[3] || 'main';
    const filePath = match[4] ? decodeURIComponent(match[4]) : '';
    if (filePath) {
      return [`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`];
    }
    return [
      `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/README.md`,
      `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/readme.md`,
      `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/README`,
      `https://raw.githubusercontent.com/${owner}/${repo}/master/README.md`,
    ];
  }

  async function fetchOne(url, config, signal) {
    if (signal && signal.aborted) throw new Error('已取消');
    const candidates = githubRawCandidates(url);
    const tryList = candidates.length ? candidates : [url];
    let lastError = null;

    for (const target of tryList) {
      if (signal && signal.aborted) throw new Error('已取消');
      try {
        const result = await requestText(target, { timeoutMs: config.timeoutMs });
        const isHtml = /text\/html|application\/xhtml/i.test(result.contentType) || /<html[\s>]/i.test(result.body);
        const text = (isHtml ? htmlToText(result.body) : String(result.body || '')).trim();
        if (!text) {
          lastError = new Error('页面没有可读文本');
          continue;
        }
        return {
          ok: true,
          url,
          sourceUrl: target,
          title: isHtml ? extractTitle(result.body, url) : (candidates.length ? 'GitHub 文件' : url),
          text: text.slice(0, config.maxChars),
        };
      } catch (error) {
        lastError = error;
      }
    }

    return {
      ok: false,
      url,
      title: '',
      text: '',
      error: (lastError && lastError.message) || '读取失败',
    };
  }

  async function enrichPrompt(text, options = {}) {
    const store = options.store || null;
    const config = getConfig(store);
    if (!config.enabled) {
      return { prompt: text, fetched: [], enabled: false };
    }

    const urls = extractUrls(text).slice(0, config.maxPages);
    if (!urls.length) {
      return { prompt: text, fetched: [], enabled: true };
    }

    if (typeof options.onStatus === 'function') {
      options.onStatus(`正在联网读取 ${urls.length} 个网页…`);
    }

    const fetched = [];
    for (const url of urls) {
      if (options.signal && options.signal.aborted) break;
      if (typeof options.onStatus === 'function') {
        options.onStatus(`正在读取：${url}`);
      }
      fetched.push(await fetchOne(url, config, options.signal));
    }

    const okPages = fetched.filter(item => item.ok && item.text);
    if (!okPages.length) {
      const errors = fetched.map(item => `- ${item.url}：${item.error || '失败'}`).join('\n');
      return {
        prompt: `${text}\n\n【联网读取失败】\n${errors}\n请根据失败原因说明，并请用户改贴正文或换链接。`,
        fetched,
        enabled: true,
      };
    }

    const blocks = okPages.map((item, index) => {
      return `### 网页 ${index + 1}\n来源：${item.url}\n标题：${item.title || '（无标题）'}\n正文：\n${item.text}`;
    }).join('\n\n');

    const prompt = `${text}

【联网读取结果】
你已经获得下面网页正文，请基于这些内容回答用户，不要再说“无法浏览网页”。若内容不完整，可指出并请用户补充。

${blocks}`;

    return { prompt, fetched, enabled: true };
  }

  window.teemoWebBrowse = {
    getConfig,
    extractUrls,
    enrichPrompt,
    fetchOne,
  };
})();
