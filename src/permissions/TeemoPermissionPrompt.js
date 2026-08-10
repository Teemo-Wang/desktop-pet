/* Minimal permission confirmation UI. It only renders sanitized request fields. */
(function (root) {
  const queue = [];
  let activeItem = null;

  function setMainPassthrough(disabled) {
    try {
      if (typeof require !== 'function') return;
      const { ipcRenderer } = require('electron');
      ipcRenderer.send(disabled ? 'disable-passthrough' : 'enable-passthrough');
    } catch (_) { /* normal browser fallback */ }
  }

  function labelPermission(permission) {
    return { read: '读取', write: '写入', execute: '执行' }[permission] || String(permission || '未知');
  }

  function showNext() {
    if (activeItem || !queue.length || typeof document === 'undefined') return;
    const item = queue.shift();
    activeItem = item;
    const overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.58);font-family:system-ui,sans-serif;color:#f6f6f6;';
    const card = document.createElement('div');
    card.style.cssText = 'width:min(420px,calc(100vw - 40px));padding:22px;border:1px solid rgba(255,255,255,.14);border-radius:16px;background:#1d1d1f;box-shadow:0 22px 70px rgba(0,0,0,.45);';
    const title = document.createElement('h2');
    title.textContent = 'Teemo助理请求操作权限';
    title.style.cssText = 'margin:0 0 14px;font-size:18px;';
    const details = document.createElement('div');
    details.style.cssText = 'display:grid;gap:8px;font-size:13px;line-height:1.5;color:#d3d3d3;word-break:break-word;';
    const rows = [
      ['工具', item.request.toolName],
      ['权限', labelPermission(item.request.permission)],
      ['资源', item.request.resource || '未指定'],
      ['原因', item.request.reason || '该工具声明需要此权限'],
    ];
    for (const [label, value] of rows) {
      const row = document.createElement('div');
      const strong = document.createElement('strong');
      strong.textContent = `${label}：`;
      const text = document.createTextNode(String(value || ''));
      row.append(strong, text);
      details.appendChild(row);
    }
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:20px;flex-wrap:wrap;';

    function finish(response) {
      overlay.remove();
      activeItem = null;
      item.resolve(response);
      showNext();
    }
    item.finish = finish;

    const buttons = [
      ['拒绝', { decision: 'deny', reason: 'user_denied' }, '#343438'],
      ['允许一次', { decision: 'allow', scope: 'once' }, '#3b3b40'],
      ['本会话允许', { decision: 'allow', scope: 'session' }, '#3478f6'],
    ];
    if (item.request.toolName === 'desktop_primary_click' || item.request.toolName === 'comfyui_builtin_render') buttons.pop();
    for (const [label, response, background] of buttons) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.style.cssText = `border:0;border-radius:9px;padding:9px 13px;background:${background};color:#fff;cursor:pointer;`;
      button.addEventListener('click', () => finish(response));
      actions.appendChild(button);
    }
    card.append(title, details, actions);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    setMainPassthrough(true);
  }

  const api = Object.freeze({
    request(request) {
      return new Promise(resolve => {
        queue.push({ request, resolve });
        showNext();
      });
    },
    dismiss(permissionRequestId) {
      const target = String(permissionRequestId || '');
      if (activeItem && activeItem.request.permissionRequestId === target) {
        activeItem.finish({ decision: 'deny', reason: 'request_inactive' });
        return true;
      }
      const index = queue.findIndex(item => item.request.permissionRequestId === target);
      if (index < 0) return false;
      const [item] = queue.splice(index, 1);
      item.resolve({ decision: 'deny', reason: 'request_inactive' });
      return true;
    },
  });
  if (root) root.TeemoPermissionPrompt = api;
  if (typeof window !== 'undefined') window.TeemoPermissionPrompt = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
