/**
 * TeemoFileService
 * 统一处理授权目录校验及只读文档解析，不提供写入、删除或 Shell 能力。
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.TeemoFileService = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const fs = require('fs');
  const path = require('path');
  const mammoth = require('mammoth');
  const pdfParse = require('pdf-parse');

  const TEXT_EXTENSIONS = new Set([
    '.txt', '.md', '.json', '.csv', '.log', '.html', '.css', '.js', '.ts', '.jsx', '.tsx',
    '.py', '.java', '.c', '.cpp', '.h', '.yaml', '.yml', '.xml', '.sql', '.sh', '.ps1',
  ]);

  class TeemoFileService {
    constructor(options = {}) {
      this.maxBytes = Number(options.maxBytes) || 15 * 1024 * 1024;
      this.maxText = Number(options.maxText) || 60000;
      this.textExtensions = options.textExtensions || TEXT_EXTENSIONS;
    }

    loadAuthorizedRoots(filePath) {
      try {
        const raw = JSON.parse(fs.readFileSync(String(filePath), 'utf8'));
        return Array.isArray(raw) ? raw.filter(item => typeof item === 'string' && item.trim()) : [];
      } catch (_) {
        return [];
      }
    }

    saveAuthorizedRoots(filePath, roots) {
      const target = String(filePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const normalized = [...new Set((Array.isArray(roots) ? roots : []).map(String))];
      fs.writeFileSync(target, JSON.stringify(normalized, null, 2), 'utf8');
      return normalized;
    }

    canonicalPath(filePath) {
      return fs.realpathSync.native(String(filePath || ''));
    }

    isPathWithinRoot(rootPath, targetPath) {
      const relative = path.relative(rootPath, targetPath);
      return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
    }

    resolveAuthorizedPath(filePath, roots) {
      const target = this.canonicalPath(filePath);
      const canonicalRoots = (Array.isArray(roots) ? roots : [])
        .map(root => { try { return this.canonicalPath(root); } catch (_) { return null; } })
        .filter(Boolean);
      const root = canonicalRoots.find(item => this.isPathWithinRoot(item, target));
      if (!root) throw new Error('文件不在已授权目录内');
      return { target, root };
    }

    async readDocument(filePath) {
      const target = this.canonicalPath(filePath);
      const stat = fs.statSync(target);
      if (!stat.isFile()) throw new Error('目标不是文件');
      if (stat.size > this.maxBytes) throw new Error('文件超过 15 MB');
      const ext = path.extname(target).toLowerCase();
      if (!this.textExtensions.has(ext) && ext !== '.pdf' && ext !== '.docx') {
        throw new Error('暂不支持此文件格式，请选择 TXT、Markdown、代码、PDF 或 DOCX');
      }
      return this.readBuffer(fs.readFileSync(target), path.basename(target), stat.size);
    }

    async readBuffer(buffer, fileName = 'document', size) {
      const input = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || '');
      const byteSize = Number.isFinite(size) ? size : input.length;
      if (byteSize > this.maxBytes) throw new Error('文件超过 15 MB');
      const ext = path.extname(String(fileName || '')).toLowerCase();
      if (!this.textExtensions.has(ext) && ext !== '.pdf' && ext !== '.docx') {
        throw new Error('暂不支持此文件格式，请选择 TXT、Markdown、代码、PDF 或 DOCX');
      }
      let content = '';
      if (ext === '.pdf') content = (await pdfParse(input)).text || '';
      else if (ext === '.docx') content = (await mammoth.extractRawText({ buffer: input })).value || '';
      else content = input.toString('utf8');
      content = content.replace(/\u0000/g, '').trim();
      if (!content) throw new Error('文件中没有可读取的文本');
      if (content.length > this.maxText) content = `${content.slice(0, this.maxText)}\n\n[文件内容过长，已截取前 ${this.maxText} 字]`;
      return { content, size: byteSize, ext };
    }
  }

  if (typeof globalThis !== 'undefined') {
    globalThis.TeemoFileService = TeemoFileService;
    globalThis.FileService = TeemoFileService;
  }
  return TeemoFileService;
});
