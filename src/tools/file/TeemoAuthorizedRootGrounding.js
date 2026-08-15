const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class TeemoAuthorizedRootGroundingError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'TeemoAuthorizedRootGroundingError';
    this.code = code;
    this.teemoSafe = true;
  }
}

function fail(code, message) {
  throw new TeemoAuthorizedRootGroundingError(code, message);
}

function referenceKey(value) {
  return String(value || '').trim().normalize('NFKC').toLocaleLowerCase('en-US');
}

function samePath(left, right) {
  return process.platform === 'win32'
    ? String(left).toLowerCase() === String(right).toLowerCase()
    : String(left) === String(right);
}

function stableRootId(canonicalPath) {
  return `root_${crypto.createHash('sha256').update(
    process.platform === 'win32' ? canonicalPath.toLowerCase() : canonicalPath,
  ).digest('hex').slice(0, 16)}`;
}

function safeAliases(displayName) {
  const aliases = [];
  if (referenceKey(displayName) === 'teemo-source') {
    aliases.push('Teemo源码', '当前项目');
  }
  return aliases;
}

const ROUTING_ARGUMENTS = new Set([
  'rootId', 'rootReference', 'relativePath', 'path', 'newRelativePath', 'newPath',
]);

function copyNonRoutingArguments(args) {
  return Object.fromEntries(Object.entries(args).filter(([key]) => !ROUTING_ARGUMENTS.has(key)));
}

function looksLikeWindowsAbsolutePath(value) {
  return typeof value === 'string' && /^[A-Za-z]:[\\/]/.test(value.trim());
}

function coerceRoutingArguments(args = {}) {
  const next = { ...args };
  if (looksLikeWindowsAbsolutePath(next.relativePath) && !next.path) {
    next.path = String(next.relativePath).trim().replace(/\//g, '\\');
    delete next.relativePath;
    delete next.rootId;
    delete next.rootReference;
  }
  if (looksLikeWindowsAbsolutePath(next.path)) {
    next.path = String(next.path).trim().replace(/\//g, '\\');
    delete next.rootId;
    delete next.rootReference;
    delete next.relativePath;
  }
  if (next.rootId === '' || next.rootId == null) delete next.rootId;
  if (next.rootReference === '' || next.rootReference == null) delete next.rootReference;
  return next;
}

class TeemoAuthorizedRootGrounding {
  constructor(options = {}) {
    if (!options.fileService) throw new Error('Authorized root grounding requires TeemoFileService.');
    this.fileService = options.fileService;
  }

  _records(roots) {
    const records = [];
    const seen = new Set();
    for (const candidate of Array.isArray(roots) ? roots : []) {
      try {
        const canonicalPath = this.fileService.canonicalPath(candidate);
        if (!fs.statSync(canonicalPath).isDirectory()) continue;
        const key = process.platform === 'win32' ? canonicalPath.toLowerCase() : canonicalPath;
        if (seen.has(key)) continue;
        seen.add(key);
        const displayName = path.basename(canonicalPath)
          || (process.platform === 'win32' && /^[A-Za-z]:\\?$/.test(canonicalPath)
            ? `${canonicalPath[0].toUpperCase()}盘`
            : canonicalPath);
        records.push(Object.freeze({
          rootId: stableRootId(canonicalPath),
          displayName,
          capabilities: Object.freeze(['read', 'write']),
          aliases: Object.freeze(safeAliases(displayName)),
          canonicalPath,
        }));
      } catch (_) {
        // Missing, malformed, or revoked roots are not provider-visible.
      }
    }
    return records;
  }

  summarize(roots) {
    return this._records(roots).map(record => ({
      rootId: record.rootId,
      displayName: record.displayName,
      capabilities: [...record.capabilities],
      aliases: [...record.aliases],
    }));
  }

  _resolveRootReference(reference, records, options = {}) {
    const value = String(reference || '').trim();
    if (!value) fail('FILE_ROOT_REFERENCE_INVALID', 'An authorized root reference is required.');
    if (options.rootIdOnly) {
      const exact = records.find(record => record.rootId === value);
      if (!exact) fail('FILE_ROOT_REFERENCE_STALE', 'The authorized root is unavailable or has been revoked.');
      return exact;
    }
    const key = referenceKey(value);
    const matches = records.filter(record => (
      referenceKey(record.displayName) === key
      || record.aliases.some(alias => referenceKey(alias) === key)
    ));
    const unique = [...new Map(matches.map(record => [record.rootId, record])).values()];
    if (!unique.length) fail('FILE_ROOT_REFERENCE_INVALID', 'No authorized root matches that name or alias.');
    if (unique.length > 1) fail('FILE_ROOT_REFERENCE_AMBIGUOUS', 'Multiple authorized roots match that name or alias. Ask the user to choose one.');
    return unique[0];
  }

  resolveRootReference(reference, roots, options = {}) {
    const record = this._resolveRootReference(reference, this._records(roots), options);
    return {
      rootId: record.rootId,
      displayName: record.displayName,
      capabilities: [...record.capabilities],
      aliases: [...record.aliases],
    };
  }

  validateRelativePath(relativePath, options = {}) {
    if (typeof relativePath !== 'string' || relativePath.length > 32767 || relativePath.includes('\u0000')) {
      fail('FILE_RELATIVE_PATH_INVALID', 'A valid relativePath is required.');
    }
    if (!relativePath && options.allowEmpty) return '';
    if (!relativePath) fail('FILE_RELATIVE_PATH_INVALID', 'A non-empty relativePath is required.');
    const slashPath = relativePath.replace(/\\/g, '/');
    if (/^(?:\/|[A-Za-z]:)/.test(slashPath)) {
      fail('FILE_RELATIVE_PATH_ABSOLUTE', 'relativePath must not be absolute.');
    }
    const parts = slashPath.split('/');
    if (parts.some(part => !part || part === '.' || part === '..')) {
      fail('FILE_PATH_TRAVERSAL', 'relativePath must not contain empty, current, or parent traversal segments.');
    }
    if (parts.some(part => part.includes(':'))) {
      fail('FILE_PATH_UNSAFE', 'Alternate data streams and URI-like relative paths are not allowed.');
    }
    return parts.join('/');
  }

  _validateAbsoluteInput(absolutePath) {
    if (typeof absolutePath !== 'string' || !absolutePath || absolutePath.length > 32767 || absolutePath.includes('\u0000')) {
      fail('FILE_PATH_INVALID', 'A valid absolute path is required.');
    }
    const windowsPath = absolutePath.replace(/\//g, '\\');
    if (/^\\\\/.test(windowsPath) || /^\\\\[?.]\\/.test(windowsPath) || /^\\\?\?\\/.test(windowsPath)) {
      fail('FILE_PATH_UNSAFE', 'UNC and Windows device paths are not allowed.');
    }
    if (!path.isAbsolute(absolutePath)) {
      fail('FILE_PATH_CONTRACT_INVALID', 'Use rootId or rootReference with relativePath, or provide an exact absolute path.');
    }
    const colonAt = absolutePath.indexOf(':');
    if (colonAt >= 0 && (!(colonAt === 1 && /^[A-Za-z]:/.test(absolutePath)) || absolutePath.indexOf(':', colonAt + 1) >= 0)) {
      fail('FILE_PATH_UNSAFE', 'Alternate data streams and URI-like paths are not allowed.');
    }
    if (absolutePath.replace(/\\/g, '/').split('/').includes('..')) {
      fail('FILE_PATH_TRAVERSAL', 'Parent traversal segments are not allowed.');
    }
  }

  _groundAbsolutePath(absolutePath, records, options = {}) {
    this._validateAbsoluteInput(absolutePath);
    let target;
    try {
      target = this.fileService.canonicalPath(absolutePath);
    } catch (error) {
      if (!options.allowMissingLeaf) throw error;
      const parent = this.fileService.canonicalPath(path.dirname(absolutePath));
      target = path.join(parent, path.basename(absolutePath));
    }
    const matches = records
      .filter(record => this.fileService.isPathWithinRoot(record.canonicalPath, target))
      .sort((left, right) => right.canonicalPath.length - left.canonicalPath.length);
    if (!matches.length) fail('FILE_OUTSIDE_AUTHORIZED_ROOT', 'The requested path is outside authorized folders.');
    const root = matches[0];
    const relativePath = path.relative(root.canonicalPath, target).split(path.sep).join('/');
    return { root, relativePath, target };
  }

  _groundOne(args, records, options = {}) {
    const hasRootId = Object.prototype.hasOwnProperty.call(args, 'rootId');
    const hasRootReference = Object.prototype.hasOwnProperty.call(args, 'rootReference');
    const hasRelativePath = Object.prototype.hasOwnProperty.call(args, 'relativePath');
    const hasAbsolutePath = Object.prototype.hasOwnProperty.call(args, 'path');
    if (hasRootId || hasRootReference || hasRelativePath) {
      if (hasRootId === hasRootReference || !hasRelativePath || hasAbsolutePath) {
        fail('FILE_PATH_CONTRACT_INVALID', 'Use exactly one of rootId or rootReference with relativePath, without path.');
      }
      const root = this._resolveRootReference(
        hasRootId ? args.rootId : args.rootReference,
        records,
        { rootIdOnly: hasRootId },
      );
      const relativePath = this.validateRelativePath(args.relativePath, { allowEmpty: options.allowEmpty });
      return {
        root,
        relativePath,
        target: relativePath
          ? path.join(root.canonicalPath, ...relativePath.split('/'))
          : root.canonicalPath,
      };
    }
    if (!hasAbsolutePath) {
      fail('FILE_PATH_CONTRACT_INVALID', 'Use rootId or rootReference with relativePath, or provide an exact absolute path.');
    }
    return this._groundAbsolutePath(args.path, records, options);
  }

  _normalizeOne(args, records, options = {}) {
    const hasRootId = Object.prototype.hasOwnProperty.call(args, 'rootId');
    const hasRootReference = Object.prototype.hasOwnProperty.call(args, 'rootReference');
    const hasRelativePath = Object.prototype.hasOwnProperty.call(args, 'relativePath');
    const hasAbsolutePath = Object.prototype.hasOwnProperty.call(args, 'path');
    if (hasRootId || hasRootReference || hasRelativePath) {
      if (!hasRelativePath || (!hasRootId && !hasRootReference)) {
        fail('FILE_PATH_CONTRACT_INVALID', 'Use exactly one of rootId or rootReference with relativePath, without path.');
      }
      let root = null;
      if (hasRootId) {
        try {
          root = this._resolveRootReference(args.rootId, records, { rootIdOnly: true });
        } catch (error) {
          if (!hasRootReference) throw error;
        }
      }
      if (!root && hasRootReference) {
        root = this._resolveRootReference(args.rootReference, records);
      }
      const relativePath = this.validateRelativePath(args.relativePath, { allowEmpty: options.allowEmpty });
      return {
        root,
        relativePath,
        target: relativePath
          ? path.join(root.canonicalPath, ...relativePath.split('/'))
          : root.canonicalPath,
      };
    }
    if (!hasAbsolutePath) {
      fail('FILE_PATH_CONTRACT_INVALID', 'Use rootId or rootReference with relativePath, or provide an exact absolute path.');
    }
    return this._groundAbsolutePath(args.path, records, options);
  }

  normalizeToolArguments(toolName, args = {}, roots = []) {
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      fail('FILE_PATH_CONTRACT_INVALID', 'Safe File Tool arguments must be an object.');
    }
    const tool = String(toolName || '');
    const records = this._records(roots);
    args = coerceRoutingArguments(args);
    const passthrough = copyNonRoutingArguments(args);
    if (tool === 'rename_file') {
      const structured = Object.prototype.hasOwnProperty.call(args, 'rootId')
        || Object.prototype.hasOwnProperty.call(args, 'rootReference')
        || Object.prototype.hasOwnProperty.call(args, 'relativePath')
        || Object.prototype.hasOwnProperty.call(args, 'newRelativePath');
      if (structured) {
        const source = this._normalizeOne(args, records);
        const newRelativePath = this.validateRelativePath(args.newRelativePath);
        return {
          ...passthrough,
          rootId: source.root.rootId,
          relativePath: source.relativePath,
          newRelativePath,
        };
      }
      if (!Object.prototype.hasOwnProperty.call(args, 'path') || !Object.prototype.hasOwnProperty.call(args, 'newPath')) {
        fail('FILE_PATH_CONTRACT_INVALID', 'rename_file requires rootId/rootReference with relativePath and newRelativePath, or two exact absolute paths.');
      }
      const source = this._groundAbsolutePath(args.path, records);
      const destination = this._groundAbsolutePath(args.newPath, records, { allowMissingLeaf: true });
      if (!samePath(source.root.canonicalPath, destination.root.canonicalPath)) {
        fail('FILE_RENAME_CROSS_ROOT', 'Rename must stay inside the same authorized folder.');
      }
      return {
        ...passthrough,
        rootId: source.root.rootId,
        relativePath: source.relativePath,
        newRelativePath: destination.relativePath,
      };
    }

    const allowEmpty = tool === 'list_directory' || tool === 'search_files' || tool === 'search_text';
    const allowMissingLeaf = tool === 'create_file' || tool === 'create_directory';
    const hasRootId = Object.prototype.hasOwnProperty.call(args, 'rootId');
    const hasRootReference = Object.prototype.hasOwnProperty.call(args, 'rootReference');
    const hasRelativePath = Object.prototype.hasOwnProperty.call(args, 'relativePath');
    // Models often omit relativePath for root-level search/list; default to "".
    if (allowEmpty && (hasRootId || hasRootReference) && !hasRelativePath) {
      args = { ...args, relativePath: '' };
    }
    const grounded = this._normalizeOne(args, records, { allowEmpty, allowMissingLeaf });
    return {
      ...passthrough,
      rootId: grounded.root.rootId,
      relativePath: grounded.relativePath,
    };
  }

  groundToolArguments(toolName, args = {}, roots = []) {
    const tool = String(toolName || '');
    const records = this._records(roots);
    const normalized = this.normalizeToolArguments(tool, args, roots);
    if (tool === 'rename_file') {
      const source = this._groundOne(normalized, records);
      return {
        ...normalized,
        rootId: source.root.rootId,
        relativePath: source.relativePath,
        path: source.target,
        newPath: path.join(source.root.canonicalPath, ...normalized.newRelativePath.split('/')),
      };
    }

    const allowEmpty = tool === 'list_directory' || tool === 'search_files' || tool === 'search_text';
    const allowMissingLeaf = tool === 'create_file' || tool === 'create_directory';
    const grounded = this._groundOne(normalized, records, { allowEmpty, allowMissingLeaf });
    return {
      ...normalized,
      rootId: grounded.root.rootId,
      relativePath: grounded.relativePath,
      path: grounded.target,
    };
  }
}

TeemoAuthorizedRootGrounding.Error = TeemoAuthorizedRootGroundingError;
module.exports = TeemoAuthorizedRootGrounding;
