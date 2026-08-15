/* Local drive roots for Chat Safe File. Approval mode only controls prompts. */
(function (root, factory) {
  const api = factory();
  if (root) root.TeemoLocalDriveRoots = api;
  if (typeof window !== 'undefined') window.TeemoLocalDriveRoots = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');

  function normalizeApprovalMode(value) {
    const mode = String(value || '').trim().toLowerCase();
    if (mode === 'assisted' || mode === 'help' || mode === 'smart') return 'assisted';
    if (mode === 'full' || mode === 'auto' || mode === 'full_access') return 'full';
    return 'ask';
  }

  function readApprovalModeFromSettings(settingsPath) {
    try {
      const raw = JSON.parse(fs.readFileSync(String(settingsPath), 'utf8'));
      const mode = (raw && raw.permission && raw.permission.approvalMode);
      if (!mode) return 'full';
      return normalizeApprovalMode(mode);
    } catch (_) {
      return 'full';
    }
  }

  function listDriveRoots(options = {}) {
    const exists = typeof options.existsSync === 'function' ? options.existsSync : fs.existsSync;
    if (process.platform !== 'win32') {
      const home = options.homeDir || os.homedir();
      return home ? [path.resolve(home)] : [];
    }
    const roots = [];
    for (let code = 65; code <= 90; code += 1) {
      const root = `${String.fromCharCode(code)}:\\`;
      try {
        if (exists(root)) roots.push(root);
      } catch (_) {
        // Ignore inaccessible drive letters.
      }
    }
    return roots;
  }

  function mergeRoots(authorizedRoots, driveRoots) {
    const merged = [];
    const seen = new Set();
    for (const candidate of [...(authorizedRoots || []), ...(driveRoots || [])]) {
      const value = String(candidate || '').trim();
      if (!value) continue;
      const key = process.platform === 'win32' ? value.toLowerCase() : value;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(value);
    }
    return merged;
  }

  function resolveEffectiveRoots(options = {}) {
    const authorized = Array.isArray(options.authorizedRoots) ? options.authorizedRoots : [];
    // Chat Safe File always uses local drive roots; approval mode only controls prompting.
    return mergeRoots(authorized, listDriveRoots(options));
  }

  return Object.freeze({
    normalizeApprovalMode,
    readApprovalModeFromSettings,
    listDriveRoots,
    mergeRoots,
    resolveEffectiveRoots,
  });
});
