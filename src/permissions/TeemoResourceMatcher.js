/* Safe resource-scope matching for permission grants. P1-4 uses URIs only. */
class TeemoResourceMatcher {
  normalize(resource) {
    const value = String(resource || '').trim();
    if (!value || value.length > 32768) return null;
    try {
      const url = new URL(value);
      if (!url.protocol) return null;
      const localFileProtocol = ['file:', 'git+file:', 'exec+file:'].includes(url.protocol);
      if (localFileProtocol) {
        if (url.hostname) return null;
      } else if (!url.hostname) return null;
      const pathname = url.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
      const normalizedPath = localFileProtocol && process.platform === 'win32'
        ? pathname.toLowerCase()
        : pathname;
      return `${url.protocol.toLowerCase()}//${url.hostname.toLowerCase()}${normalizedPath}`;
    } catch (_) {
      return null;
    }
  }

  contains(scopeResource, requestedResource) {
    const scope = this.normalize(scopeResource);
    const requested = this.normalize(requestedResource);
    if (!scope || !requested) return false;
    if (scope === requested) return true;
    return requested.startsWith(`${scope}/`);
  }
}

module.exports = TeemoResourceMatcher;
