/**
 * Skill 技能中心面板
 * 列表视图 / 详情视图 / 结果视图
 */
(function() {

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
                ${s.custom ? `<button class="skill-card-del" data-del="${s.id}" title="删除">🗑</button>` : ''}
                <div class="skill-icon">${s.icon}</div>
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
      this.panel.querySelectorAll('.skill-card').forEach(c => {
        c.addEventListener('click', e => {
          if (e.target.closest('[data-del]')) return; // 让 del 按钮独立处理
          this.currentSkill = this.service.get(c.dataset.id);
          this.view = 'detail';
          this._renderDetail();
        });
      });
      this.panel.querySelectorAll('[data-del]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          this.service.remove(btn.dataset.del);
        });
      });
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
          <span class="panel-head-title">${s.icon} ${s.name}</span>
          <button class="btn-icon" onclick="document.dispatchEvent(new CustomEvent('panel-close-all'))">✕</button>
        </div>
        <div class="panel-body" style="padding:12px 14px;">
          <div class="skill-desc-full">${s.desc}</div>
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
