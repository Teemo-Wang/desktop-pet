/**
 * Skill 技能中心面板
 * 列表视图 / 详情视图 / 结果视图
 */
(function() {
  const { ipcRenderer } = require('electron');

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  class SkillsComponent {
    constructor(panelEl, service) {
      this.panel = panelEl;
      this.service = service;
      this.isOpen = false;
      this.currentSkill = null;
      this.view = 'list'; // list | detail | result | upload
      // 自定义 skill 变化时刷新列表
      this.service.onChange(() => {
        if (this.isOpen && this.view === 'list') this._renderList();
      });
    }

    open() {
      this.isOpen = true;
      this.view = 'list';
      this._render();
      this.panel.classList.add('open');
    }

    close() { this.isOpen = false; this.panel.classList.remove('open'); }

    _render() {
      if (this.view === 'list') this._renderList();
      else if (this.view === 'detail') this._renderDetail();
      else if (this.view === 'upload') this._renderUpload();
    }

    _renderList() {
      const skills = this.service.getAll();
      this.panel.innerHTML = `
        <div class="panel-head">
          <span class="panel-head-title"><img class="panel-head-icon" src="icon/skill.png" alt="">技能中心</span>
          <button class="btn-icon skill-upload-btn" id="skUpload" title="上传新技能">＋</button>
          <button class="btn-icon" onclick="document.dispatchEvent(new CustomEvent('panel-close-all'))">✕</button>
        </div>
        <div class="panel-body">
          <div class="skill-grid">
            ${skills.map(s => `
              <div class="skill-card${s.custom ? ' skill-card-custom' : ''}" data-id="${s.id}">
                <div class="skill-name">${s.name}</div>
                <div class="skill-desc">${s.desc}</div>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="rz rz-t"></div><div class="rz rz-l"></div><div class="rz rz-tl"></div>
      `;
      this.panel.querySelector('#skUpload').addEventListener('click', () => {
        this.view = 'upload';
        this._renderUpload();
      });
      // 点击进入详情；长按弹出操作菜单（改名 / 导出 / 删除）
      this.panel.querySelectorAll('.skill-card').forEach(c => {
        let pressTimer = null;
        let longPressed = false;
        const start = () => {
          longPressed = false;
          pressTimer = setTimeout(() => {
            pressTimer = null;
            longPressed = true;
            this._showSkillActions(c.dataset.id);
          }, 550);
        };
        const cancel = () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };
        c.addEventListener('mousedown', start);
        c.addEventListener('touchstart', start, { passive: true });
        c.addEventListener('mouseup', cancel);
        c.addEventListener('mouseleave', cancel);
        c.addEventListener('touchend', cancel);
        c.addEventListener('touchcancel', cancel);
        c.addEventListener('click', () => {
          if (longPressed) { longPressed = false; return; }
          this.currentSkill = this.service.get(c.dataset.id);
          this.view = 'detail';
          this._renderDetail();
        });
      });
    }

    /** 长按卡片弹出的操作菜单：改备注名 / 导出分享 / 删除 */
    _showSkillActions(id) {
      const s = this.service.get(id);
      if (!s) return;
      const isBuiltinCore = id === 'skill1'; // 核心回复规则不可删除，仅可改名
      const overlay = document.createElement('div');
      overlay.className = 'skill-action-overlay';
      overlay.innerHTML = `
        <div class="skill-action-sheet">
          <div class="skill-action-title">${s.name}</div>
          <button class="skill-action-btn" data-act="rename">✏️ 修改备注名</button>
          <button class="skill-action-btn" data-act="export">⬇ 导出分享</button>
          ${!isBuiltinCore ? `<button class="skill-action-btn skill-action-danger" data-act="delete">🗑 删除</button>` : ''}
          <button class="skill-action-btn skill-action-cancel" data-act="cancel">取消</button>
        </div>
      `;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
      overlay.querySelector('[data-act="cancel"]').addEventListener('click', close);
      overlay.querySelector('[data-act="rename"]').addEventListener('click', () => {
        close();
        const next = prompt('修改备注名', s.name);
        if (next && next.trim() && next.trim() !== s.name) {
          this.service.rename(id, next.trim());
          this._renderList();
        }
      });
      overlay.querySelector('[data-act="export"]').addEventListener('click', () => {
        close();
        this._exportSkill(id);
      });
      const delBtn = overlay.querySelector('[data-act="delete"]');
      if (delBtn) {
        delBtn.addEventListener('click', () => {
          close();
          if (!confirm(`确定删除「${s.name}」？此操作不可恢复。`)) return;
          this.service.remove(id);
          this._renderList();
        });
      }
    }

    /** 导出技能为 SKILL.md 文件，供分享给团队成员（对方用"上传新技能"导入） */
    async _exportSkill(id) {
      const data = this.service.exportMarkdown(id);
      if (!data) { alert('导出失败：技能不存在'); return; }
      try {
        const res = await ipcRenderer.invoke('save-text-file', {
          text: data.content,
          suggestedName: data.filename,
          filters: [{ name: 'Markdown', extensions: ['md'] }],
        });
        if (res && res.ok) {
          alert('已导出：' + res.path + '\n把这个 .md 文件发给同事，对方在「技能中心 → ＋ 上传新技能」里导入即可。');
        } else if (res && res.error && res.error !== '已取消') {
          alert('导出失败：' + res.error);
        }
      } catch (e) {
        alert('导出失败：' + (e.message || e));
      }
    }

    /** 上传/创建自定义 skill 表单 */
    _renderUpload() {
      this.panel.innerHTML = `
        <div class="panel-head">
          <button class="btn-icon btn-back" id="skUpBack">‹</button>
          <span class="panel-head-title">＋ 上传新技能</span>
          <button class="btn-icon" onclick="document.dispatchEvent(new CustomEvent('panel-close-all'))">✕</button>
        </div>
        <div class="panel-body" style="padding:12px 14px;">
          <div class="skill-upload-md-zone" id="skMdDrop">
            <div class="skill-upload-md-icon">📄</div>
            <div class="skill-upload-md-title">从 SKILL.md 导入</div>
            <div class="skill-upload-md-hint">点击选择 / 拖入文件 / 直接粘贴 Markdown 内容</div>
            <input type="file" id="skMdFile" accept=".md,text/markdown" style="display:none">
          </div>

          <div class="skill-upload-divider"><span>或手动填写</span></div>

          <div class="skill-upload-form">
            <div class="skill-field">
              <label>技能名称 *</label>
              <input type="text" class="skill-up-input" id="upName" placeholder="如：写日报">
            </div>
            <div class="skill-field skill-field-row">
              <div style="flex:0 0 70px;">
                <label>图标</label>
                <input type="text" class="skill-up-input" id="upIcon" placeholder="📝" maxlength="2" value="⭐">
              </div>
              <div style="flex:1;">
                <label>简介</label>
                <input type="text" class="skill-up-input" id="upDesc" placeholder="一句话描述这个技能">
              </div>
            </div>
            <div class="skill-field">
              <label>输入字段 <span class="hint">每行一个，格式：key|标签|占位提示</span></label>
              <textarea class="skill-up-input" id="upInputs" rows="3" placeholder="topic|主题|今天的工作内容&#10;style|风格|简洁/详细"></textarea>
            </div>
            <div class="skill-field">
              <label>Prompt 模板 * <span class="hint">用 {{key}} 占位</span></label>
              <textarea class="skill-up-input" id="upPrompt" rows="5" placeholder="基于「{{topic}}」帮我写一份 {{style}} 风格的日报..."></textarea>
            </div>
            <div class="skill-up-actions">
              <button class="skill-up-btn" id="upCancel">取消</button>
              <button class="skill-up-btn primary" id="upSave">保存</button>
            </div>
          </div>
        </div>
        <div class="rz rz-t"></div><div class="rz rz-l"></div><div class="rz rz-tl"></div>
      `;

      this.panel.querySelector('#skUpBack').addEventListener('click', () => {
        this.view = 'list';
        this._renderList();
      });
      this.panel.querySelector('#upCancel').addEventListener('click', () => {
        this.view = 'list';
        this._renderList();
      });
      this.panel.querySelector('#upSave').addEventListener('click', () => this._saveUpload());

      // 文件选择 / 拖拽 / 粘贴：三种入口
      const drop = this.panel.querySelector('#skMdDrop');
      const fileInput = this.panel.querySelector('#skMdFile');

      drop.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', e => {
        const f = e.target.files[0];
        if (f) this._readMarkdownFile(f);
      });

      // 拖拽
      ['dragover', 'dragenter'].forEach(evt => {
        drop.addEventListener(evt, e => {
          e.preventDefault();
          drop.classList.add('drag-over');
        });
      });
      ['dragleave', 'drop'].forEach(evt => {
        drop.addEventListener(evt, e => {
          e.preventDefault();
          drop.classList.remove('drag-over');
        });
      });
      drop.addEventListener('drop', e => {
        const f = e.dataTransfer.files[0];
        if (f) this._readMarkdownFile(f);
      });

      // 粘贴
      drop.addEventListener('paste', e => {
        const text = e.clipboardData.getData('text/plain');
        if (text && text.trim()) this._importFromText(text);
      });
      drop.tabIndex = 0; // 允许聚焦才能接收 paste
    }

    /** 读取本地 .md 文件 */
    _readMarkdownFile(file) {
      if (!file) return;
      if (!/\.md$/i.test(file.name) && file.type !== 'text/markdown' && file.type !== 'text/plain') {
        alert('请选择 .md 文件');
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => this._importFromText(String(e.target.result || ''), file.name);
      reader.readAsText(file, 'utf-8');
    }

    /** 解析并填充表单（让用户能预览/微调后再保存） */
    _importFromText(mdText, filename) {
      try {
        const parsed = this.service._parseMarkdown(mdText, filename);
        // 回填到表单：用户可以再调整
        this.panel.querySelector('#upName').value = parsed.name || '';
        this.panel.querySelector('#upIcon').value = parsed.icon || '📜';
        this.panel.querySelector('#upDesc').value = parsed.desc || '';
        this.panel.querySelector('#upInputs').value = (parsed.inputs || [])
          .map(i => `${i.key}|${i.label}|${i.placeholder || ''}`).join('\n');
        this.panel.querySelector('#upPrompt').value = parsed.prompt || '';
        // 把 systemPrompt 暂存到 panel 上（保存时一起带上）
        this._pendingSystemPrompt = parsed.systemPrompt || '';

        // UI 反馈
        const drop = this.panel.querySelector('#skMdDrop');
        drop.classList.add('imported');
        drop.querySelector('.skill-upload-md-title').textContent = `✓ 已导入 ${filename || 'Markdown'}`;
        drop.querySelector('.skill-upload-md-hint').textContent = '可以微调下方表单后保存';
      } catch (e) {
        alert('解析失败：' + (e.message || e));
      }
    }

    _saveUpload() {
      const name = this.panel.querySelector('#upName').value.trim();
      const icon = this.panel.querySelector('#upIcon').value.trim() || '⭐';
      const desc = this.panel.querySelector('#upDesc').value.trim();
      const inputsRaw = this.panel.querySelector('#upInputs').value.trim();
      const promptTpl = this.panel.querySelector('#upPrompt').value.trim();

      if (!name) { this.panel.querySelector('#upName').focus(); return; }
      if (!promptTpl) { this.panel.querySelector('#upPrompt').focus(); return; }

      // 解析输入字段：每行 key|label|placeholder
      const inputs = inputsRaw.split('\n')
        .map(l => l.trim()).filter(Boolean)
        .map(line => {
          const parts = line.split('|').map(s => s.trim());
          return {
            key: parts[0] || '',
            label: parts[1] || parts[0] || '',
            placeholder: parts[2] || '',
            type: (parts[0] || '').includes('text') || parts[3] === 'textarea' ? 'textarea' : 'text',
          };
        }).filter(inp => inp.key);

      try {
        this.service.upload({
          name, icon, desc, inputs, prompt: promptTpl,
          systemPrompt: this._pendingSystemPrompt || '',
        });
        this._pendingSystemPrompt = '';
        this.view = 'list';
        this._renderList();
      } catch (e) {
        alert(e.message || '保存失败');
      }
    }

    _renderDetail() {
      const s = this.currentSkill;
      this.panel.innerHTML = `
        <div class="panel-head">
          <button class="btn-icon btn-back" id="skBack">‹</button>
          <span class="panel-head-title">${s.name}</span>
          <button class="btn-icon" onclick="document.dispatchEvent(new CustomEvent('panel-close-all'))">✕</button>
        </div>
        <div class="panel-body" style="padding:12px 14px;">
          <div class="skill-desc-full">${s.desc}</div>
          <button class="skill-run-btn" id="skExport" style="margin-bottom:10px;background:rgba(0,118,255,0.08);color:var(--brand);">⬇ 导出分享（SKILL.md）</button>
          ${s.id === 'skill1' ? `<button class="skill-run-btn" id="skEditRules" style="margin-bottom:10px;background:rgba(0,118,255,0.08);color:var(--brand);">✏️ 编辑规则</button>` : ''}
          ${s.custom ? `<button class="skill-run-btn" id="skEditCustomRules" style="margin-bottom:10px;background:rgba(0,118,255,0.08);color:var(--brand);">✏️ 查看/编辑内容</button>` : ''}
          <div class="skill-form">
            ${s.inputs.map(inp => `
              <div class="skill-field">
                <label>${inp.label}</label>
                ${inp.type === 'textarea'
                  ? `<textarea class="skill-input" data-key="${inp.key}" placeholder="${inp.placeholder}"></textarea>`
                  : `<input type="text" class="skill-input" data-key="${inp.key}" placeholder="${inp.placeholder}">`
                }
              </div>
            `).join('')}
          </div>
          <button class="skill-run-btn" id="skRun">⚡ 执行</button>
          <div class="skill-result" id="skResult"></div>
        </div>
        <div class="rz rz-t"></div><div class="rz rz-l"></div><div class="rz rz-tl"></div>
      `;

      this.panel.querySelector('#skBack').addEventListener('click', () => { this.view = 'list'; this._renderList(); });
      this.panel.querySelector('#skRun').addEventListener('click', () => this._execute());
      const exportBtn = this.panel.querySelector('#skExport');
      if (exportBtn) exportBtn.addEventListener('click', () => this._exportSkill(s.id));
      const editBtn = this.panel.querySelector('#skEditRules');
      if (editBtn) editBtn.addEventListener('click', () => this._renderRulesEdit());
      const editCustomBtn = this.panel.querySelector('#skEditCustomRules');
      if (editCustomBtn) editCustomBtn.addEventListener('click', () => this._renderCustomRulesEdit());
    }

    /** 自定义技能内容编辑：编辑 systemPrompt 正文；规范类保存后即作为机器人回复参考 */
    _renderCustomRulesEdit() {
      const s = this.currentSkill;
      const rules = s.systemPrompt || '';
      const isRule = s.category === 'rule';
      const tip = isRule
        ? '这套规则会作为机器人回复的<strong>参考规范</strong>（独立于默认回复规则），可随时调整或清空（Markdown 格式）。'
        : '这是该技能的<strong>内容/指令正文</strong>（执行时作为系统提示词），可随时编辑（Markdown 格式）。';
      const delLabel = isRule ? '🗑 删除此规范' : '🗑 删除此技能';
      const delConfirm = isRule
        ? `确定删除规范技能「${s.name}」？删除后机器人回复将不再参考这套规则。`
        : `确定删除技能「${s.name}」？`;
      this.panel.innerHTML = `
        <div class="panel-head">
          <button class="btn-icon btn-back" id="cRulesBack">‹</button>
          <span class="panel-head-title">编辑内容</span>
          <button class="btn-icon" onclick="document.dispatchEvent(new CustomEvent('panel-close-all'))">✕</button>
        </div>
        <div class="panel-body" style="padding:12px 14px;display:flex;flex-direction:column;gap:10px;height:100%;box-sizing:border-box;">
          <div class="skill-desc-full" style="margin:0;">${tip}</div>
          <textarea class="skill-up-input" id="cRulesText" style="flex:1;min-height:320px;font-family:ui-monospace,Menlo,monospace;font-size:12px;line-height:1.6;resize:none;">${_esc(rules)}</textarea>
          <div class="skill-up-actions">
            <button class="skill-up-btn" id="cRulesDelete" style="color:#d33;">${delLabel}</button>
            <button class="skill-up-btn" id="cRulesCancel">取消</button>
            <button class="skill-up-btn primary" id="cRulesSave">保存并生效</button>
          </div>
        </div>
        <div class="rz rz-t"></div><div class="rz rz-l"></div><div class="rz rz-tl"></div>
      `;
      this.panel.querySelector('#cRulesBack').addEventListener('click', () => { this.view = 'detail'; this._renderDetail(); });
      this.panel.querySelector('#cRulesCancel').addEventListener('click', () => { this.view = 'detail'; this._renderDetail(); });
      this.panel.querySelector('#cRulesSave').addEventListener('click', () => {
        const t = this.panel.querySelector('#cRulesText').value;
        this.service.updateCustomSystemPrompt(s.id, t);
        this.currentSkill = this.service.get(s.id);
        this.view = 'detail';
        this._renderDetail();
      });
      this.panel.querySelector('#cRulesDelete').addEventListener('click', () => {
        if (!confirm(delConfirm)) return;
        this.service.remove(s.id);
        this.view = 'list';
        this._renderList();
      });
    }

    /** skill1 规则编辑界面：直接编辑机器人回复规则（Markdown），保存后实时生效 */
    _renderRulesEdit() {
      const rules = this.service.getRules ? this.service.getRules() : '';
      this.panel.innerHTML = `
        <div class="panel-head">
          <button class="btn-icon btn-back" id="rulesBack">‹</button>
          <span class="panel-head-title">📋 编辑机器人回复规则</span>
          <button class="btn-icon" onclick="document.dispatchEvent(new CustomEvent('panel-close-all'))">✕</button>
        </div>
        <div class="panel-body" style="padding:12px 14px;display:flex;flex-direction:column;gap:10px;height:100%;box-sizing:border-box;">
          <div class="skill-desc-full" style="margin:0;">编辑后保存即生效，会影响机器人在钉钉/对话里的回复方式（Markdown 格式）。</div>
          <textarea class="skill-up-input" id="rulesText" style="flex:1;min-height:340px;font-family:ui-monospace,Menlo,monospace;font-size:12px;line-height:1.6;resize:none;">${_esc(rules)}</textarea>
          <div class="skill-up-actions">
            <button class="skill-up-btn" id="rulesReset">恢复默认</button>
            <button class="skill-up-btn" id="rulesCancel">取消</button>
            <button class="skill-up-btn primary" id="rulesSave">保存并生效</button>
          </div>
        </div>
        <div class="rz rz-t"></div><div class="rz rz-l"></div><div class="rz rz-tl"></div>
      `;
      this.panel.querySelector('#rulesBack').addEventListener('click', () => { this.view = 'detail'; this._renderDetail(); });
      this.panel.querySelector('#rulesCancel').addEventListener('click', () => { this.view = 'detail'; this._renderDetail(); });
      this.panel.querySelector('#rulesSave').addEventListener('click', () => {
        const t = this.panel.querySelector('#rulesText').value;
        this.service.saveRules(t);
        this.currentSkill = this.service.get('skill1');
        this.view = 'detail';
        this._renderDetail();
      });
      this.panel.querySelector('#rulesReset').addEventListener('click', () => {
        if (!confirm('确定恢复为默认规则？当前编辑会被覆盖。')) return;
        this.service.resetRules();
        this.panel.querySelector('#rulesText').value = this.service.getRules();
      });
    }

    async _execute() {
      const inputs = {};
      this.panel.querySelectorAll('.skill-input').forEach(el => {
        inputs[el.dataset.key] = el.value.trim();
      });

      const result = this.panel.querySelector('#skResult');
      const btn = this.panel.querySelector('#skRun');
      btn.disabled = true; btn.textContent = '⏳ 执行中...';
      result.innerHTML = '<div class="state-loading">AI 正在思考</div>';

      try {
        const output = await this.service.execute(this.currentSkill.id, inputs);
        result.innerHTML = `<div class="skill-output">${output.replace(/\n/g, '<br>')}</div>`;
      } catch(e) {
        result.innerHTML = `<div class="state-error">⚠️ ${e.message}</div>`;
      }

      btn.disabled = false; btn.textContent = '⚡ 重新执行';
    }
  }

  window.SkillsComponent = SkillsComponent;
})();
