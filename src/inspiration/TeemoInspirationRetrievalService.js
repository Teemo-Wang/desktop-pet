const TeemoInspirationContracts = require('./TeemoInspirationContracts');

const MAX_PAGE_SIZE = 100;
const MAX_QUERY_LENGTH = 160;
const FORMAT_ALIASES = Object.freeze({
  png: { extension: '.png', mime: 'image/png' },
  jpeg: { extension: '.jpeg', mime: 'image/jpeg' },
  jpg: { extension: '.jpg', mime: 'image/jpeg' },
  webp: { extension: '.webp', mime: 'image/webp' },
  gif: { extension: '.gif', mime: 'image/gif' },
  'image/png': { extension: '.png', mime: 'image/png' },
  'image/jpeg': { extension: null, mime: 'image/jpeg' },
  'image/webp': { extension: '.webp', mime: 'image/webp' },
  'image/gif': { extension: '.gif', mime: 'image/gif' },
});

function safeInteger(value, fallback = 0, maximum = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) return fallback;
  return Math.min(maximum, Math.max(0, number));
}

function compareNs(left, right) {
  const a = String(left || '0').replace(/^0+(?=\d)/, '');
  const b = String(right || '0').replace(/^0+(?=\d)/, '');
  if (a.length !== b.length) return a.length - b.length;
  return a.localeCompare(b);
}

function normalizedText(value, maximum = MAX_QUERY_LENGTH) {
  return String(value || '').trim().slice(0, maximum);
}

class TeemoInspirationRetrievalService {
  constructor(options = {}) {
    if (!options.indexService || !options.sourceService) {
      throw new Error('TeemoInspirationRetrievalService requires indexService and sourceService.');
    }
    this.indexService = options.indexService;
    this.sourceService = options.sourceService;
    this.inspirationStateService = options.inspirationStateService || null;
  }

  _isEnabled() {
    if (!this.inspirationStateService) return true;
    this.inspirationStateService.reload();
    return this.inspirationStateService.isEnabled();
  }

  _queryOptions(input = {}) {
    const query = normalizedText(input.query).toLocaleLowerCase();
    const sourceId = normalizedText(input.sourceId, 120);
    const formatKey = normalizedText(input.format, 40).toLocaleLowerCase();
    const format = FORMAT_ALIASES[formatKey] || null;
    const orientation = ['landscape', 'portrait', 'square'].includes(input.orientation)
      ? input.orientation
      : null;
    const sort = ['newest', 'oldest', 'name'].includes(input.sort) ? input.sort : 'newest';
    return {
      query,
      sourceId,
      format,
      orientation,
      minWidth: safeInteger(input.minWidth),
      minHeight: safeInteger(input.minHeight),
      sort,
      offset: safeInteger(input.offset),
      limit: Math.min(MAX_PAGE_SIZE, Math.max(1, safeInteger(input.limit, MAX_PAGE_SIZE, MAX_PAGE_SIZE))),
    };
  }

  _matches(item, options) {
    if (options.query) {
      const name = String(item.name || '').toLocaleLowerCase();
      const relativePath = String(item.relativePath || '').toLocaleLowerCase();
      if (!name.includes(options.query) && !relativePath.includes(options.query)) return false;
    }
    if (options.format) {
      const extensionMatches = options.format.extension && item.extension === options.format.extension;
      if (!extensionMatches && item.mime !== options.format.mime) return false;
    }
    if (options.orientation === 'landscape' && !(item.width > item.height)) return false;
    if (options.orientation === 'portrait' && !(item.height > item.width)) return false;
    if (options.orientation === 'square' && item.width !== item.height) return false;
    return item.width >= options.minWidth && item.height >= options.minHeight;
  }

  _sort(items, sort) {
    return items.sort((left, right) => {
      if (sort === 'name') {
        return left.name.localeCompare(right.name) || left.relativePath.localeCompare(right.relativePath)
          || left.sourceId.localeCompare(right.sourceId);
      }
      const time = compareNs(left.mtimeNs, right.mtimeNs);
      if (time !== 0) return sort === 'oldest' ? time : -time;
      return left.name.localeCompare(right.name) || left.relativePath.localeCompare(right.relativePath)
        || left.sourceId.localeCompare(right.sourceId);
    });
  }

  _publicItem(item, source) {
    return {
      itemId: item.itemId,
      sourceId: item.sourceId,
      sourceDisplayName: source.displayName,
      name: item.name,
      relativePath: item.relativePath,
      mime: item.mime,
      extension: item.extension,
      width: item.width,
      height: item.height,
      sizeBytes: item.sizeBytes,
      mtimeNs: item.mtimeNs,
    };
  }

  search(input = {}) {
    if (!this._isEnabled()) {
      return { status: 'DISABLED', items: [], total: 0, offset: 0, limit: MAX_PAGE_SIZE, hasMore: false, unavailableSources: [] };
    }

    const options = this._queryOptions(input);
    const sourceSnapshot = this.sourceService.reload();
    if (sourceSnapshot.stateError) {
      return {
        status: 'SOURCES_UNREADABLE', items: [], total: 0, offset: options.offset, limit: options.limit,
        hasMore: false, unavailableSources: [],
      };
    }
    const sources = Array.isArray(sourceSnapshot.sources) ? sourceSnapshot.sources : [];
    const requestedSources = options.sourceId
      ? sources.filter(source => source.sourceId === options.sourceId)
      : sources;
    if (options.sourceId && requestedSources.length === 0) {
      return {
        status: 'SOURCE_NOT_FOUND', items: [], total: 0, offset: options.offset, limit: options.limit,
        hasMore: false, unavailableSources: [],
      };
    }

    const matches = [];
    const unavailableSources = [];
    let readySources = 0;
    for (const source of requestedSources) {
      // The index service revalidates P1 authorization before exposing active metadata.
      const snapshot = this.indexService.getSourceSnapshot(source.sourceId, { all: true });
      if (snapshot.status !== 'READY') {
        unavailableSources.push({ sourceId: source.sourceId, status: snapshot.status });
        continue;
      }
      readySources += 1;
      for (const item of snapshot.items || []) {
        if (this._matches(item, options)) matches.push(this._publicItem(item, source));
      }
    }
    this._sort(matches, options.sort);
    const page = matches.slice(options.offset, options.offset + options.limit);
    const unavailableStatus = unavailableSources.length ? unavailableSources[0].status : null;
    const requestedFailure = options.sourceId && unavailableStatus
      ? unavailableStatus
      : !options.sourceId && requestedSources.length > 0 && readySources === 0 && unavailableStatus
        ? unavailableStatus
        : 'READY';
    return {
      status: requestedFailure,
      items: page,
      total: matches.length,
      offset: options.offset,
      limit: options.limit,
      hasMore: options.offset + options.limit < matches.length,
      unavailableSources,
    };
  }
}

TeemoInspirationRetrievalService.MAX_PAGE_SIZE = MAX_PAGE_SIZE;
TeemoInspirationRetrievalService.MAX_QUERY_LENGTH = MAX_QUERY_LENGTH;
TeemoInspirationRetrievalService.FORMAT_ALIASES = FORMAT_ALIASES;
TeemoInspirationRetrievalService.compareNs = compareNs;
module.exports = TeemoInspirationRetrievalService;
