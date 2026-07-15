/**
 * 任务上下文记忆服务（渲染层，持久化到 ~/.hellobike-pet/task-context.json）
 *
 * 目标：让钉钉机器人在同一会话内具备「任务级」记忆——
 *   记住当前任务类型、选中素材、当前版本、历史版本、是否在等确认等，
 *   避免用户重复发素材/链接/完整需求（对应需求文档第八章）。
 *
 * 设计原则：与钉钉消息、DesignHub 调用、发图、AI 意图识别模块解耦，
 *   仅提供「读取/更新任务上下文 + 意图关键词判断」能力，关键状态落盘持久化。
 *
 * 数据结构：
 * {
 *   convs: {
 *     [conversationId]: { activeTaskId, tasks: { [taskId]: Task } }
 *   }
 * }
 */
(function() {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  const DIR = path.join(os.homedir(), '.hellobike-pet');
  const FILE = path.join(DIR, 'task-context.json');

  // 未完成任务保留 30 天，已完成 90 天（毫秒）
  const TTL_UNFINISHED = 30 * 24 * 3600 * 1000;
  const TTL_COMPLETED = 90 * 24 * 3600 * 1000;

  // 「继续当前任务」意图词
  const CONTINUE_RE = /(继续改|接着改|再改|换成这个|标题换成|再大一?点|再小一?点|颜色.*(深|浅)|(深|浅)一?点|(大|小)一?点|换一?张图|这个可以|就这个|再出一?版|再来一?版|整组都改|其他尺寸|同步|保留原|一样的)/;
  // 「新建任务」意图词
  const NEW_RE = /(另外(帮我)?找|再帮我处理|换一个需求|新建(一个)?任务|接下来处理|重新(帮我)?找|还有(一张|个)|再找一?个)/;
  // 确认「是/否」
  const YES_RE = /^(是|对|嗯+|好的?|可以|没错|就(是|这)|要|需要|ok|OK|👍)/;
  const NO_RE = /(不是|不对|都不|不要|重新|换一?批|没有一个|no)/i;
  // 选择第几个
  const PICK2_RE = /(第\s*[2二]\s*个|第\s*[2二]\s*张|后(一个|面那个)|用第[2二])/;
  const PICK1_RE = /(第\s*[1一]\s*个|第\s*[1一]\s*张|前(一个|面那个)|用第[1一])/;
  // 清除/重置类指令
  const RESET_RE = /(清除当前任务|忘记这个素材|删除这次修改|清空.*未完成|重新开始|取消当前)/;
  // 导出/结束
  const EXPORT_RE = /(导出|定稿|最终文件|就这样|完成了?吧?|可以了)/;

  function _uid(p) { return (p || 't') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7); }

  class TaskContextStore {
    constructor() {
      if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
      this.data = this._load();
      this._gc();
    }

    _load() {
      try { return JSON.parse(fs.readFileSync(FILE, 'utf-8')) || { convs: {} }; }
      catch (e) { return { convs: {} }; }
    }
    _persist() {
      try { fs.writeFileSync(FILE, JSON.stringify(this.data, null, 2), 'utf-8'); }
      catch (e) { console.warn('[TaskContext] save failed:', e.message || e); }
    }
    /** 过期清理：未完成 30 天 / 已完成 90 天 */
    _gc() {
      const now = Date.now();
      let changed = false;
      for (const convId of Object.keys(this.data.convs || {})) {
        const c = this.data.convs[convId];
        for (const id of Object.keys(c.tasks || {})) {
          const t = c.tasks[id];
          const done = t.status === 'completed' || t.status === 'cancelled';
          const ttl = done ? TTL_COMPLETED : TTL_UNFINISHED;
          if (now - (t.updated_at || 0) > ttl) {
            delete c.tasks[id];
            if (c.activeTaskId === id) c.activeTaskId = null;
            changed = true;
          }
        }
      }
      if (changed) this._persist();
    }

    _conv(convId) {
      if (!this.data.convs[convId]) this.data.convs[convId] = { activeTaskId: null, tasks: {} };
      return this.data.convs[convId];
    }

    /** 当前激活任务（可能为 null） */
    getActiveTask(convId) {
      const c = this._conv(convId);
      return c.activeTaskId ? (c.tasks[c.activeTaskId] || null) : null;
    }

    /** 会话下所有未完成任务 */
    listUnfinished(convId) {
      const c = this._conv(convId);
      return Object.values(c.tasks).filter(t => !['completed', 'cancelled', 'expired'].includes(t.status));
    }

    /**
     * 新建任务并设为激活
     * @param {string} convId
     * @param {object} init - { task_type, status, task_name, original_request, candidates, current_material, waiting_for_user }
     */
    createTask(convId, init = {}) {
      const c = this._conv(convId);
      const now = Date.now();
      const t = {
        task_id: _uid('task'),
        conversation_id: convId,
        task_type: init.task_type || 'unknown',
        task_name: init.task_name || '',
        status: init.status || 'pending',
        user_request: {
          original_request: init.original_request || '',
          latest_instruction: '',
          edit_scope: init.edit_scope || 'single',
          output_format: 'png',
        },
        candidates: init.candidates || [],       // 搜索候选（前 2 项，供用户确认选择）
        group: init.group || [],                  // 本次命中的整组素材（供「整组批量改」）
        current_material: init.current_material || null,
        current_version: null,
        version_history: [],
        completed_actions: [],
        last_bot_question: init.last_bot_question || '',
        waiting_for_user: !!init.waiting_for_user,
        created_at: now,
        updated_at: now,
      };
      c.tasks[t.task_id] = t;
      c.activeTaskId = t.task_id;
      this._persist();
      return t;
    }

    /** 更新当前激活任务 */
    updateActive(convId, patch = {}) {
      const t = this.getActiveTask(convId);
      if (!t) return null;
      Object.assign(t, patch);
      if (patch.user_request) t.user_request = Object.assign({}, t.user_request, patch.user_request);
      t.updated_at = Date.now();
      this._persist();
      return t;
    }

    /** 设定当前选中素材 */
    setMaterial(convId, material) {
      const t = this.getActiveTask(convId);
      if (!t) return null;
      t.current_material = material;
      t.updated_at = Date.now();
      this._persist();
      return t;
    }

    /** 追加一个新版本并设为当前版本 */
    addVersion(convId, ver = {}) {
      const t = this.getActiveTask(convId);
      if (!t) return null;
      const prev = t.current_version ? t.current_version.version_id : null;
      const v = {
        version_id: _uid('ver'),
        previous_version_id: prev,
        file_url: ver.file_url || '',
        edit: ver.edit || '',
        created_at: Date.now(),
      };
      t.version_history.push(v);
      t.current_version = v;
      t.completed_actions.push(ver.edit || '修改');
      t.updated_at = Date.now();
      this._persist();
      return v;
    }

    /** 取当前参考图 URL：优先最新版本，其次选中素材 cdnUrl */
    currentReferenceUrl(convId) {
      const t = this.getActiveTask(convId);
      if (!t) return '';
      if (t.current_version && t.current_version.file_url) return t.current_version.file_url;
      if (t.current_material) return t.current_material.url || t.current_material.cdnUrl || '';
      return '';
    }

    /** 结束/取消当前任务 */
    finishActive(convId, status = 'completed') {
      const t = this.getActiveTask(convId);
      if (!t) return;
      t.status = status;
      t.waiting_for_user = false;
      t.updated_at = Date.now();
      this._persist();
    }
    clearActive(convId) {
      const c = this._conv(convId);
      if (c.activeTaskId) { delete c.tasks[c.activeTaskId]; c.activeTaskId = null; this._persist(); }
    }

    // ===== 意图判断（纯函数，供上层路由）=====
    looksContinue(text) { return CONTINUE_RE.test(text || ''); }
    looksNew(text) { return NEW_RE.test(text || ''); }
    looksReset(text) { return RESET_RE.test(text || ''); }
    looksExport(text) { return EXPORT_RE.test(text || ''); }
    /** 是否要求整组/批量修改 */
    looksBatch(text) { return /(整组|全部|所有|这组|那组|批量|都改|都换|一起改|每[张个]|各[张个])/.test(text || ''); }
    /** 是否要求「把结果直接发我/再发一次」 */
    looksSend(text) { return /(直接发|发给我|发我|发过来|发一?[张份遍次]|再发|给我(图|文件|素材|一份|看看图)|把.*(发|给)我|要(原|成品)?图|下载给我|导出给我)/.test(text || ''); }
    isYes(text) { return YES_RE.test((text || '').trim()); }
    isNo(text) { return NO_RE.test(text || ''); }
    /** 返回选中的候选下标：0=第一个 1=第二个 -1=未指明 */
    resolvePick(text) {
      const t = (text || '').trim();
      if (PICK2_RE.test(t)) return 1;
      if (PICK1_RE.test(t)) return 0;
      if (this.isYes(t)) return 0;   // 泛确认默认第一个（匹配度最高）
      return -1;
    }
  }

  window.taskContext = new TaskContextStore();
  window.TaskContextStore = TaskContextStore;
})();
