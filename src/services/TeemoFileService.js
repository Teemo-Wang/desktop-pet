/**
 * TeemoFileService
 * Main-process authority for P1-5 local file reads and conservative text writes.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.TeemoFileService = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const fs = require('fs');
  const path = require('path');
  const crypto = require('crypto');
  const { pathToFileURL } = require('url');
  const { TextDecoder } = require('util');
  const mammoth = require('mammoth');
  const pdfParse = require('pdf-parse');

  const READ_TEXT_EXTENSIONS = new Set([
    '.txt', '.md', '.json', '.csv', '.log', '.html', '.css', '.scss', '.js', '.cjs', '.mjs',
    '.ts', '.jsx', '.tsx', '.py', '.java', '.c', '.cpp', '.h', '.yaml', '.yml', '.xml',
    '.sql', '.sh', '.ps1',
  ]);
  const WRITE_TEXT_EXTENSIONS = new Set([
    '.txt', '.md', '.json', '.csv', '.html', '.css', '.scss', '.js', '.cjs', '.mjs', '.ts',
    '.jsx', '.tsx', '.py', '.ps1', '.yaml', '.yml', '.xml',
  ]);
  const IGNORED_DIRECTORIES = new Set(['node_modules', '.git', 'dist', 'cache', '.cache']);
  const TOOLS = new Set([
    'list_directory', 'read_file', 'search_files', 'search_text',
    'create_file', 'create_directory', 'patch_file', 'rename_file',
  ]);

  class TeemoFileError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'TeemoFileError';
      this.code = code;
      this.teemoSafe = true;
    }
  }

  function fail(code, message) {
    throw new TeemoFileError(code, message);
  }

  function sha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  function iso(value) {
    return new Date(value).toISOString();
  }

  class TeemoFileService {
    constructor(options = {}) {
      this.limits = Object.freeze({
        maxReadBytes: Number(options.maxReadBytes || options.maxBytes) || 15 * 1024 * 1024,
        maxReturnedText: Number(options.maxReturnedText || options.maxText) || 60000,
        maxPatchBytes: Number(options.maxPatchBytes) || 2 * 1024 * 1024,
        maxPatchEdits: Number(options.maxPatchEdits) || 100,
        maxCreateBytes: Number(options.maxCreateBytes) || 1024 * 1024,
        maxListItems: Number(options.maxListItems) || 300,
        maxSearchFiles: Number(options.maxSearchFiles) || 2000,
        maxSearchResults: Number(options.maxSearchResults) || 200,
        maxSearchDepth: Number(options.maxSearchDepth) || 8,
        maxSearchBytes: Number(options.maxSearchBytes) || 20 * 1024 * 1024,
      });
      this.maxBytes = this.limits.maxReadBytes;
      this.maxText = this.limits.maxReturnedText;
      this.textExtensions = options.textExtensions || READ_TEXT_EXTENSIONS;
      this.writeTextExtensions = options.writeTextExtensions || WRITE_TEXT_EXTENSIONS;
    }

    static get TeemoFileError() { return TeemoFileError; }
    static get READ_TEXT_EXTENSIONS() { return READ_TEXT_EXTENSIONS; }
    static get WRITE_TEXT_EXTENSIONS() { return WRITE_TEXT_EXTENSIONS; }

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

    _validatePathInput(filePath) {
      const input = String(filePath || '');
      if (!input || input.includes('\u0000')) fail('FILE_PATH_INVALID', 'A non-empty local path is required.');
      const normalized = input.replace(/\//g, '\\');
      if (/^\\\\/.test(normalized) || /^\\\\[?.]\\/.test(normalized)) {
        fail('FILE_PATH_UNSAFE', 'UNC and Windows device paths are not allowed.');
      }
      const colonAt = input.indexOf(':');
      if (colonAt >= 0 && (!(colonAt === 1 && /^[A-Za-z]:/.test(input)) || input.indexOf(':', colonAt + 1) >= 0)) {
        fail('FILE_PATH_UNSAFE', 'Alternate data streams and URI-like paths are not allowed.');
      }
      const segments = input.replace(/\\/g, '/').split('/');
      if (segments.includes('..')) fail('FILE_PATH_TRAVERSAL', 'Parent traversal segments are not allowed.');
      return path.resolve(input);
    }

    canonicalPath(filePath) {
      const validated = this._validatePathInput(filePath);
      try { return fs.realpathSync.native(validated); } catch (_) { fail('FILE_NOT_FOUND', 'The requested path does not exist.'); }
    }

    isPathWithinRoot(rootPath, targetPath) {
      const relative = path.relative(rootPath, targetPath);
      return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
    }

    _canonicalRoots(roots) {
      const result = [];
      for (const root of Array.isArray(roots) ? roots : []) {
        try {
          const canonical = this.canonicalPath(root);
          if (fs.statSync(canonical).isDirectory()) result.push(canonical);
        } catch (_) {}
      }
      return [...new Set(result.map(item => process.platform === 'win32' ? item.toLowerCase() : item))]
        .map(key => result.find(item => (process.platform === 'win32' ? item.toLowerCase() : item) === key));
    }

    _findRoot(target, roots) {
      return this._canonicalRoots(roots).find(root => this.isPathWithinRoot(root, target)) || null;
    }

    resolveAuthorizedPath(filePath, roots) {
      const target = this.canonicalPath(filePath);
      const root = this._findRoot(target, roots);
      if (!root) fail('FILE_OUTSIDE_AUTHORIZED_ROOT', 'The requested path is outside authorized folders.');
      return { target, root };
    }

    _resolveExisting(filePath, roots, kind) {
      const resolved = this.resolveAuthorizedPath(filePath, roots);
      let stat;
      try { stat = fs.statSync(resolved.target); } catch (_) { fail('FILE_NOT_FOUND', 'The requested path does not exist.'); }
      if (kind === 'file' && !stat.isFile()) fail('FILE_NOT_REGULAR', 'The requested path is not a regular file.');
      if (kind === 'directory' && !stat.isDirectory()) fail('FILE_NOT_DIRECTORY', 'The requested path is not a directory.');
      return { ...resolved, stat };
    }

    _resolveNewFile(filePath, roots) {
      const requested = this._validatePathInput(filePath);
      const basename = path.basename(requested);
      if (!basename || basename === '.' || basename === '..') fail('FILE_PATH_INVALID', 'A file name is required.');
      if (process.platform === 'win32') {
        if (/[. ]$/.test(basename) || /[<>:"/\\|?*]/.test(basename)
          || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(basename)) {
          fail('FILE_PATH_UNSAFE', 'The destination file name is unsafe on Windows.');
        }
      }
      let parent;
      try { parent = fs.realpathSync.native(path.dirname(requested)); } catch (_) { fail('FILE_PARENT_NOT_FOUND', 'The destination folder does not exist.'); }
      const root = this._findRoot(parent, roots);
      if (!root) fail('FILE_OUTSIDE_AUTHORIZED_ROOT', 'The destination is outside authorized folders.');
      const target = path.join(parent, basename);
      if (!this.isPathWithinRoot(root, target)) fail('FILE_OUTSIDE_AUTHORIZED_ROOT', 'The destination is outside authorized folders.');
      return { target, root, parent };
    }

    _resolveNewDirectory(directoryPath, roots) {
      const requested = this._validatePathInput(directoryPath);
      const basename = path.basename(requested);
      if (!basename || basename === '.' || basename === '..') fail('FILE_PATH_INVALID', 'A directory name is required.');
      if (process.platform === 'win32' && (/[. ]$/.test(basename)
        || /[<>:"/\\|?*]/.test(basename)
        || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(basename))) {
        fail('FILE_PATH_UNSAFE', 'The destination directory name is unsafe on Windows.');
      }
      let parent;
      try { parent = fs.realpathSync.native(path.dirname(requested)); } catch (_) { fail('FILE_PARENT_NOT_FOUND', 'The destination parent folder does not exist.'); }
      const root = this._findRoot(parent, roots);
      if (!root) fail('FILE_OUTSIDE_AUTHORIZED_ROOT', 'The destination is outside authorized folders.');
      const target = path.join(parent, basename);
      if (!this.isPathWithinRoot(root, target)) fail('FILE_OUTSIDE_AUTHORIZED_ROOT', 'The destination is outside authorized folders.');
      return { target, root, parent };
    }

    _resource(filePath) {
      return pathToFileURL(filePath).href;
    }

    _assertTextWrite(filePath) {
      const ext = path.extname(filePath).toLowerCase();
      if (!this.writeTextExtensions.has(ext)) {
        fail('FILE_TYPE_NOT_WRITABLE', 'Only approved plain-text file types can be written.');
      }
      return ext;
    }

    _decodeUtf8(buffer) {
      if (buffer.length >= 2 && ((buffer[0] === 0xff && buffer[1] === 0xfe) || (buffer[0] === 0xfe && buffer[1] === 0xff))) {
        fail('FILE_ENCODING_UNSUPPORTED', 'Only UTF-8 text files can be modified.');
      }
      if (buffer.includes(0)) fail('FILE_BINARY_UNSUPPORTED', 'Binary files cannot be modified.');
      try {
        return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, '');
      } catch (_) {
        fail('FILE_ENCODING_UNSUPPORTED', 'Only valid UTF-8 text files can be modified.');
      }
    }

    _assertNotCancelled(checkCancelled) {
      if (typeof checkCancelled === 'function' && checkCancelled()) fail('TOOL_CANCELLED', 'Tool execution was cancelled.');
    }

    _snapshot(resolved, extra = {}) {
      return {
        target: resolved.target,
        root: resolved.root,
        resource: this._resource(resolved.target),
        ...(resolved.stat ? { targetIdentity: `${resolved.stat.dev}:${resolved.stat.ino}:${resolved.stat.birthtimeMs}` } : {}),
        ...extra,
      };
    }

    _identity(filePath) {
      const stat = fs.statSync(filePath);
      return `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
    }

    prepareOperation(toolName, args = {}, roots = []) {
      const tool = String(toolName || '');
      if (!TOOLS.has(tool)) fail('FILE_TOOL_UNKNOWN', 'Unknown file tool.');
      let snapshot;
      if (tool === 'create_file') {
        const resolved = this._resolveNewFile(args.path, roots);
        this._assertTextWrite(resolved.target);
        const exists = fs.existsSync(resolved.target);
        if (exists) fail('FILE_ALREADY_EXISTS', 'The destination file already exists.');
        snapshot = this._snapshot(resolved, {
          parent: resolved.parent,
          parentIdentity: this._identity(resolved.parent),
          exists,
        });
      } else if (tool === 'create_directory') {
        const resolved = this._resolveNewDirectory(args.path, roots);
        const exists = fs.existsSync(resolved.target);
        if (exists) fail('FILE_ALREADY_EXISTS', 'The destination directory already exists.');
        snapshot = this._snapshot(resolved, {
          parent: resolved.parent,
          parentIdentity: this._identity(resolved.parent),
          exists,
        });
      } else if (tool === 'rename_file') {
        const source = this._resolveExisting(args.path, roots, 'file');
        const destination = this._resolveNewFile(args.newPath, roots);
        this._assertTextWrite(source.target);
        this._assertTextWrite(destination.target);
        if (!this._samePath(source.root, destination.root)) {
          fail('FILE_RENAME_CROSS_ROOT', 'Rename must stay inside the same authorized folder.');
        }
        const destinationExists = fs.existsSync(destination.target);
        if (destinationExists) fail('FILE_ALREADY_EXISTS', 'The rename destination already exists.');
        snapshot = this._snapshot(source, {
          destination: destination.target,
          destinationParent: destination.parent,
          destinationParentIdentity: this._identity(destination.parent),
          destinationResource: this._resource(destination.target),
          destinationExists,
        });
      } else {
        const kind = tool === 'read_file' || tool === 'patch_file' ? 'file' : 'directory';
        snapshot = this._snapshot(this._resolveExisting(args.path, roots, kind));
        if (tool === 'patch_file') this._assertTextWrite(snapshot.target);
      }
      const reason = tool === 'rename_file'
        ? `${tool}: ${snapshot.resource} -> ${snapshot.destinationResource}`
        : `${tool}: ${snapshot.resource}`;
      return Object.freeze({ tool, args: JSON.parse(JSON.stringify(args)), snapshot: Object.freeze(snapshot), resource: snapshot.resource, reason });
    }

    _samePath(left, right) {
      return process.platform === 'win32'
        ? String(left).toLowerCase() === String(right).toLowerCase()
        : String(left) === String(right);
    }

    _revalidate(prepared, roots) {
      let current;
      try {
        current = this.prepareOperation(prepared.tool, prepared.args, roots);
      } catch (_) {
        fail('FILE_RESOURCE_CHANGED', 'The file resource changed while permission was pending.');
      }
      const before = prepared.snapshot;
      const after = current.snapshot;
      if (!this._samePath(before.target, after.target)
        || !this._samePath(before.root, after.root)
        || before.resource !== after.resource
        || before.targetIdentity !== after.targetIdentity
        || (before.parent && !this._samePath(before.parent, after.parent))
        || before.parentIdentity !== after.parentIdentity
        || (before.destination && !this._samePath(before.destination, after.destination))
        || (before.destinationParent && !this._samePath(before.destinationParent, after.destinationParent))
        || before.destinationParentIdentity !== after.destinationParentIdentity
        || before.exists !== after.exists
        || before.destinationExists !== after.destinationExists) {
        fail('FILE_RESOURCE_CHANGED', 'The file resource changed while permission was pending.');
      }
      return current;
    }

    async executePrepared(prepared, roots, options = {}) {
      if (!prepared || !TOOLS.has(prepared.tool)) fail('FILE_PREPARATION_INVALID', 'Prepared file operation is invalid.');
      this._assertNotCancelled(options.checkCancelled);
      const current = this._revalidate(prepared, roots);
      this._assertNotCancelled(options.checkCancelled);
      const handlers = {
        list_directory: () => this._listDirectory(current, options),
        read_file: () => this._readFile(current, options),
        search_files: () => this._search(current, false, options),
        search_text: () => this._search(current, true, options),
        create_file: () => this._createFile(current, options),
        create_directory: () => this._createDirectory(current, options),
        patch_file: () => this._patchFile(current, options),
        rename_file: () => this._renameFile(current, options),
      };
      return handlers[prepared.tool]();
    }

    _listDirectory(prepared) {
      const entries = [];
      const directory = fs.opendirSync(prepared.snapshot.target);
      try {
        let entry;
        while (entries.length <= this.limits.maxListItems && (entry = directory.readSync())) entries.push(entry);
      } finally {
        directory.closeSync();
      }
      const limited = entries.slice(0, this.limits.maxListItems).map(entry => ({
        name: entry.name,
        path: path.join(prepared.snapshot.target, entry.name),
        type: entry.isDirectory() ? 'directory' : (entry.isFile() ? 'file' : 'other'),
      })).sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
      return {
        path: prepared.snapshot.target,
        type: 'directory',
        entries: limited,
        truncated: entries.length > this.limits.maxListItems,
      };
    }

    async _readFile(prepared) {
      const target = prepared.snapshot.target;
      const stat = fs.statSync(target);
      if (stat.size > this.limits.maxReadBytes) fail('FILE_TOO_LARGE', 'The file exceeds the read limit.');
      const buffer = fs.readFileSync(target);
      const ext = path.extname(target).toLowerCase();
      let text;
      let extracted = false;
      if (ext === '.pdf') { text = (await pdfParse(buffer)).text || ''; extracted = true; }
      else if (ext === '.docx') { text = (await mammoth.extractRawText({ buffer })).value || ''; extracted = true; }
      else {
        if (!this.textExtensions.has(ext)) fail('FILE_TYPE_NOT_READABLE', 'This file type is not supported for text reading.');
        text = this._decodeUtf8(buffer);
      }
      const truncated = text.length > this.limits.maxReturnedText;
      const returned = truncated ? text.slice(0, this.limits.maxReturnedText) : text;
      return {
        path: target,
        type: 'file',
        size: stat.size,
        ...(extracted ? { extractedText: returned } : { content: returned }),
        truncated,
        sha256: sha256(buffer),
        modifiedAt: iso(stat.mtimeMs),
      };
    }

    _walk(directory, options, visitor, depth = 0, state = { files: 0, bytes: 0, stopped: false }) {
      if (state.stopped || depth > this.limits.maxSearchDepth) return state;
      this._assertNotCancelled(options.checkCancelled);
      let entries;
      try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch (_) { return state; }
      for (const entry of entries) {
        if (state.stopped) break;
        this._assertNotCancelled(options.checkCancelled);
        if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name.toLowerCase())) continue;
        const candidate = path.join(directory, entry.name);
        let canonical;
        try { canonical = fs.realpathSync.native(candidate); } catch (_) { continue; }
        if (!this.isPathWithinRoot(options.authorizedRoot, canonical)) continue;
        if (entry.isDirectory()) this._walk(canonical, options, visitor, depth + 1, state);
        else if (entry.isFile()) {
          state.files += 1;
          if (state.files > this.limits.maxSearchFiles) { state.stopped = true; break; }
          visitor(canonical, state);
        }
      }
      return state;
    }

    _search(prepared, textSearch, options) {
      const args = prepared.args;
      const query = String(args.query || '').toLowerCase();
      if (!query) fail('FILE_SEARCH_QUERY_INVALID', 'A non-empty search query is required.');
      const results = [];
      const root = prepared.snapshot.target;
      const state = this._walk(root, { ...options, authorizedRoot: prepared.snapshot.root }, (candidate, walkState) => {
        if (results.length >= this.limits.maxSearchResults) { walkState.stopped = true; return; }
        if (!textSearch) {
          if (path.basename(candidate).toLowerCase().includes(query)) {
            results.push({ path: candidate, relativePath: path.relative(root, candidate), type: 'file' });
          }
          return;
        }
        const ext = path.extname(candidate).toLowerCase();
        if (!this.textExtensions.has(ext)) return;
        let stat;
        try { stat = fs.statSync(candidate); } catch (_) { return; }
        if (stat.size > this.limits.maxPatchBytes || walkState.bytes + stat.size > this.limits.maxSearchBytes) {
          if (walkState.bytes + stat.size > this.limits.maxSearchBytes) walkState.stopped = true;
          return;
        }
        walkState.bytes += stat.size;
        let content;
        try { content = this._decodeUtf8(fs.readFileSync(candidate)); } catch (_) { return; }
        const lines = content.split(/\r?\n/);
        for (let index = 0; index < lines.length && results.length < this.limits.maxSearchResults; index += 1) {
          if (lines[index].toLowerCase().includes(query)) {
            results.push({ path: candidate, relativePath: path.relative(root, candidate), line: index + 1, preview: lines[index].slice(0, 500) });
          }
        }
      });
      return { path: root, query: args.query, results, truncated: state.stopped };
    }

    _createFile(prepared, options) {
      const { target } = prepared.snapshot;
      const content = String(prepared.args.content);
      const buffer = Buffer.from(content, 'utf8');
      if (buffer.length > this.limits.maxCreateBytes) fail('FILE_CONTENT_TOO_LARGE', 'New file content exceeds the create limit.');
      if (path.extname(target).toLowerCase() === '.json') {
        try { JSON.parse(content); } catch (_) { fail('FILE_CONTENT_VALIDATION_FAILED', 'JSON content must be valid.'); }
      }
      this._assertNotCancelled(options.checkCancelled);
      let handle;
      try {
        handle = fs.openSync(target, 'wx');
        fs.writeFileSync(handle, buffer);
        fs.fsyncSync(handle);
      } catch (error) {
        if (error && error.code === 'EEXIST') fail('FILE_ALREADY_EXISTS', 'The destination file already exists.');
        throw error;
      } finally {
        if (handle !== undefined) fs.closeSync(handle);
      }
      const stat = fs.statSync(target);
      return { path: target, created: true, size: stat.size, sha256: sha256(buffer), modifiedAt: iso(stat.mtimeMs) };
    }

    _patchFile(prepared, options) {
      const target = prepared.snapshot.target;
      const expected = String(prepared.args.expectedSha256 || '').toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(expected)) fail('FILE_HASH_REQUIRED', 'A valid expectedSha256 is required.');
      const before = fs.readFileSync(target);
      if (before.length > this.limits.maxPatchBytes) fail('FILE_TOO_LARGE_TO_PATCH', 'The file exceeds the patch limit.');
      const previousSha256 = sha256(before);
      if (previousSha256 !== expected) fail('FILE_HASH_MISMATCH', 'The file changed since it was read.');
      const original = this._decodeUtf8(before);
      const edits = prepared.args.edits;
      if (original.length > this.limits.maxReturnedText) fail('FILE_TRUNCATED_CANNOT_PATCH', 'A file that would be truncated when read cannot be patched.');
      if (!Array.isArray(edits) || !edits.length || edits.length > this.limits.maxPatchEdits) {
        fail('PATCH_EDITS_INVALID', 'The exact edit list is empty or exceeds its limit.');
      }
      let updated = original;
      for (const edit of edits) {
        const oldText = String(edit.oldText);
        const newText = String(edit.newText);
        if (!oldText) fail('PATCH_EDITS_INVALID', 'oldText must not be empty.');
        const first = updated.indexOf(oldText);
        if (first < 0) fail('PATCH_TARGET_NOT_FOUND', 'An exact patch target was not found.');
        if (updated.indexOf(oldText, first + oldText.length) >= 0) fail('PATCH_TARGET_AMBIGUOUS', 'An exact patch target appears more than once.');
        updated = `${updated.slice(0, first)}${newText}${updated.slice(first + oldText.length)}`;
      }
      const ext = path.extname(target).toLowerCase();
      if (ext === '.json') {
        let originalWasValid = false;
        try { JSON.parse(original); originalWasValid = true; } catch (_) {}
        if (originalWasValid) {
          try { JSON.parse(updated); } catch (_) { fail('FILE_CONTENT_VALIDATION_FAILED', 'Patch would make valid JSON invalid.'); }
        }
      }
      const after = Buffer.from(updated, 'utf8');
      if (after.length > this.limits.maxPatchBytes) fail('FILE_TOO_LARGE_TO_PATCH', 'Patched content exceeds the patch limit.');
      this._assertNotCancelled(options.checkCancelled);
      const temp = path.join(path.dirname(target), `.Teemo-patch-${crypto.randomUUID()}.tmp`);
      let handle;
      try {
        handle = fs.openSync(temp, 'wx', 0o600);
        fs.writeFileSync(handle, after);
        fs.fsyncSync(handle);
        fs.closeSync(handle);
        handle = undefined;
        if (sha256(fs.readFileSync(temp)) !== sha256(after)) fail('FILE_ATOMIC_WRITE_FAILED', 'Temporary patch verification failed.');
        if (sha256(fs.readFileSync(target)) !== previousSha256) fail('FILE_HASH_MISMATCH', 'The file changed during patch preparation.');
        fs.renameSync(temp, target);
      } finally {
        if (handle !== undefined) fs.closeSync(handle);
        try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch (_) {}
      }
      const stat = fs.statSync(target);
      return { path: target, patched: true, editsApplied: edits.length, previousSha256, sha256: sha256(after), size: stat.size, modifiedAt: iso(stat.mtimeMs) };
    }

    _renameFile(prepared, options) {
      const source = prepared.snapshot.target;
      const destination = prepared.snapshot.destination;
      const expected = String(prepared.args.expectedSha256 || '').toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(expected)) fail('FILE_HASH_REQUIRED', 'A valid expectedSha256 is required.');
      const buffer = fs.readFileSync(source);
      const currentHash = sha256(buffer);
      if (currentHash !== expected) fail('FILE_HASH_MISMATCH', 'The file changed since it was read.');
      this._assertNotCancelled(options.checkCancelled);
      if (fs.existsSync(destination)) fail('FILE_ALREADY_EXISTS', 'The rename destination already exists.');
      if (sha256(fs.readFileSync(source)) !== expected) fail('FILE_HASH_MISMATCH', 'The file changed since it was read.');
      try {
        fs.linkSync(source, destination);
      } catch (error) {
        if (error && error.code === 'EEXIST') fail('FILE_ALREADY_EXISTS', 'The rename destination already exists.');
        throw error;
      }
      try {
        fs.unlinkSync(source);
      } catch (error) {
        try { fs.unlinkSync(destination); } catch (_) {}
        throw error;
      }
      const stat = fs.statSync(destination);
      return { path: destination, previousPath: source, renamed: true, sha256: currentHash, size: stat.size, modifiedAt: iso(stat.mtimeMs) };
    }

    _createDirectory(prepared, options) {
      const target = prepared.snapshot.target;
      this._assertNotCancelled(options.checkCancelled);
      if (fs.existsSync(target)) fail('FILE_ALREADY_EXISTS', 'The destination directory already exists.');
      try {
        fs.mkdirSync(target);
      } catch (error) {
        if (error && error.code === 'EEXIST') fail('FILE_ALREADY_EXISTS', 'The destination directory already exists.');
        throw error;
      }
      const stat = fs.statSync(target);
      if (!stat.isDirectory()) fail('FILE_OPERATION_FAILED', 'The destination is not a directory.');
      return { path: target, type: 'directory', created: true, createdAt: iso(stat.birthtimeMs) };
    }

    async readDocument(filePath) {
      const target = this.canonicalPath(filePath);
      const stat = fs.statSync(target);
      if (!stat.isFile()) fail('FILE_NOT_REGULAR', 'The requested path is not a regular file.');
      const prepared = { snapshot: { target }, args: {} };
      const result = await this._readFile(prepared);
      const ext = path.extname(target).toLowerCase();
      return { content: result.content || result.extractedText || '', size: stat.size, ext, truncated: result.truncated };
    }

    async readBuffer(buffer, fileName = 'document', size) {
      const input = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || '');
      const byteSize = Number.isFinite(size) ? size : input.length;
      if (byteSize > this.limits.maxReadBytes) fail('FILE_TOO_LARGE', 'The file exceeds the read limit.');
      const ext = path.extname(String(fileName || '')).toLowerCase();
      let content;
      if (ext === '.pdf') content = (await pdfParse(input)).text || '';
      else if (ext === '.docx') content = (await mammoth.extractRawText({ buffer: input })).value || '';
      else {
        if (!this.textExtensions.has(ext)) fail('FILE_TYPE_NOT_READABLE', 'This file type is not supported for text reading.');
        content = this._decodeUtf8(input);
      }
      const truncated = content.length > this.limits.maxReturnedText;
      return { content: truncated ? content.slice(0, this.limits.maxReturnedText) : content, size: byteSize, ext, truncated };
    }
  }

  if (typeof globalThis !== 'undefined') {
    globalThis.TeemoFileService = TeemoFileService;
    globalThis.FileService = TeemoFileService;
  }
  return TeemoFileService;
});
