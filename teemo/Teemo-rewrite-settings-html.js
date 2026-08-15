const fs = require('fs');
const path = 'D:/Teemo助手/Teemo机器人项目/Teemo-source/Teemo-chat-window/Teemo-chat-window.html';
let html = fs.readFileSync(path, 'utf8');
const marker = '      <main class="teemo-settings-page" id="settingsView" hidden>';
const start = html.indexOf(marker);
if (start < 0) throw new Error('settingsView start not found');
const end = html.indexOf('      </main>', start);
if (end < 0) throw new Error('settingsView end not found');
const endClose = end + '      </main>'.length;

const panels = `
              <section class="teemo-settings-panel" data-panel="api">
                <div class="teemo-settings-panel-head">
                  <h2>API 与模型</h2>
                  <p>独立聊天和桌宠会共用这套配置</p>
                  <span id="apiSaveStatus" class="teemo-settings-status"></span>
                </div>
                <div class="teemo-settings-block">
                  <div class="teemo-settings-block-head"><strong>已保存连接</strong><span>点击即可立即切换</span></div>
                  <div class="teemo-api-connections" id="apiConnectionList"></div>
                </div>
                <details class="teemo-settings-collapse" id="apiFormCollapse">
                  <summary><strong>编辑接口详情</strong><span>点击展开备注、地址、Key 和生图触发方式</span></summary>
                  <div class="teemo-collapse-body teemo-form-grid">
                    <label class="teemo-form-wide"><span>接口备注名称</span><input id="apiRemarkName" placeholder="例如：Grok 主力接口、GPT 备用接口"></label>
                    <label><span>服务商</span><select id="apiProvider">
                      <option value="deepseek">DeepSeek</option><option value="openai">OpenAI</option>
                      <option value="qwen">通义千问</option><option value="zhipu">智谱</option>
                      <option value="kimi">Kimi</option><option value="custom">自定义兼容接口</option>
                    </select></label>
                    <label><span>模型名称</span><input id="apiModelName" placeholder="deepseek-chat"></label>
                    <label class="teemo-form-wide"><span>Base URL</span><input id="apiBaseUrl" placeholder="https://api.deepseek.com/v1"></label>
                    <label class="teemo-form-wide"><span>API Key</span><div class="teemo-secret-field"><input id="apiKey" type="password" placeholder="输入 API Key"><button id="toggleApiKey" type="button">显示</button></div></label>
                  </div>
                  <div class="teemo-collapse-body teemo-form-grid">
                    <div class="teemo-form-wide">
                      <span class="teemo-field-label">生图触发方式</span>
                      <label class="teemo-check-label"><input id="imageIntentAi" type="radio" name="imageIntentMode" value="ai"><span>AI 智能判断（推荐）— 由 API 理解你是否真要出图</span></label>
                      <label class="teemo-check-label"><input id="imageIntentKeyword" type="radio" name="imageIntentMode" value="keyword"><span>关键词触发 — 消息里带「生图 / 画图」等词才出图</span></label>
                    </div>
                    <label class="teemo-form-wide teemo-check-label"><input id="webBrowseEnabled" type="checkbox"><span>联网读取网页链接 — 消息里有 http 链接时自动抓取正文给模型</span></label>
                  </div>
                </details>
                <div class="teemo-card-actions">
                  <button class="teemo-secondary-button" id="newApiButton" type="button">＋ 新增接口</button>
                  <button class="teemo-secondary-button" id="pauseApiButton" type="button">暂停使用</button>
                  <button class="teemo-secondary-button teemo-danger-button" id="deleteApiButton" type="button">删除当前接口</button>
                  <button class="teemo-secondary-button" id="testApiButton" type="button">测试 API 连接</button>
                  <button class="teemo-primary-button" id="saveApiButton">保存 API 配置</button>
                </div>
              </section>

              <section class="teemo-settings-panel" data-panel="approval" hidden>
                <div class="teemo-settings-panel-head">
                  <h2>操作批准</h2>
                  <p>参考 ChatGPT：三档只决定要不要弹窗，都可访问本机各盘</p>
                  <span id="TeemoApprovalModeStatus" class="teemo-settings-status"></span>
                </div>
                <div class="teemo-settings-block teemo-approval-mode-card">
                  <div class="teemo-approval-mode-settings" role="radiogroup" aria-label="应如何批准 Teemo 操作？">
                    <label class="teemo-approval-mode-choice">
                      <input type="radio" name="TeemoApprovalMode" value="ask">
                      <span><strong>请求批准</strong><em>本机各盘可访问；读写每次都询问</em></span>
                    </label>
                    <label class="teemo-approval-mode-choice">
                      <input type="radio" name="TeemoApprovalMode" value="assisted">
                      <span><strong>帮我批准</strong><em>本机各盘可访问；读取自动允许，写入再询问</em></span>
                    </label>
                    <label class="teemo-approval-mode-choice">
                      <input type="radio" name="TeemoApprovalMode" value="full" checked>
                      <span><strong>完全访问</strong><em>本机各盘可访问；本会话读写自动允许（屏幕点击 / ComfyUI / 执行命令仍会询问）</em></span>
                    </label>
                  </div>
                  <p class="teemo-comfy-hint">屏幕点击、ComfyUI 渲染、执行命令等高风险操作，无论哪一档都会单独询问。</p>
                </div>
              </section>

              <section class="teemo-settings-panel" data-panel="audio" hidden>
                <div class="teemo-settings-panel-head">
                  <h2>音视频分析</h2>
                  <p>自动提取 MP4/MOV 音轨，识别人声、音乐、节奏和乐器</p>
                  <span id="audioApiSaveStatus" class="teemo-settings-status"></span>
                </div>
                <div class="teemo-settings-block">
                  <details class="teemo-settings-collapse" id="audioApiFormCollapse" open>
                    <summary><strong>编辑音频分析 API</strong><span>留空 Key 和地址时，自动复用已保存的 GPT/OpenAI 接口</span></summary>
                    <div class="teemo-collapse-body teemo-form-grid">
                      <label class="teemo-form-wide teemo-check-label"><input id="audioAnalysisEnabled" type="checkbox"><span>上传视频时自动分析音轨</span></label>
                      <label><span>音频理解模型</span><input id="audioAnalysisModel" placeholder="gpt-audio-1.5"></label>
                      <label><span>语音转写回退模型</span><input id="audioTranscriptionModel" placeholder="gpt-4o-mini-transcribe"></label>
                      <label class="teemo-form-wide"><span>音频 Base URL</span><input id="audioApiBaseUrl" placeholder="留空=自动复用 GPT 接口"></label>
                      <label class="teemo-form-wide"><span>音频 API Key</span><div class="teemo-secret-field"><input id="audioApiKey" type="password" placeholder="留空=自动复用 GPT 接口 Key"><button id="toggleAudioApiKey" type="button">显示</button></div></label>
                    </div>
                    <div class="teemo-comfy-hint">推荐 gpt-audio-1.5；若兼容接口不支持音频理解，会自动回退到 gpt-4o-mini-transcribe 识别人声。音轨在本机压缩后发送，临时文件会自动删除。</div>
                  </details>
                  <div class="teemo-card-actions">
                    <button class="teemo-primary-button" id="saveAudioApiButton" type="button">保存音频分析配置</button>
                  </div>
                </div>
              </section>

              <section class="teemo-settings-panel" data-panel="image" hidden>
                <div class="teemo-settings-panel-head">
                  <h2>生图与 ComfyUI</h2>
                  <p>云端文生图与本机 ComfyUI 引擎</p>
                </div>
                <div class="teemo-settings-block">
                  <div class="teemo-settings-block-head">
                    <div><strong>生图 API</strong><span>ComfyUI 关闭时会走这里；Key / 地址留空则复用对话 API</span></div>
                    <span id="imageApiSaveStatus" class="teemo-settings-status"></span>
                  </div>
                  <details class="teemo-settings-collapse" id="imageApiFormCollapse">
                    <summary><strong>编辑生图 API</strong><span>点击展开模型、尺寸、地址和 Key</span></summary>
                    <div class="teemo-collapse-body teemo-form-grid">
                      <label class="teemo-form-wide"><span>接口备注名称</span><input id="imageApiLabel" placeholder="例如：Seedream 生图、GPT-Image"></label>
                      <label><span>生图模型名称</span><input id="imageApiModelName" placeholder="doubao-seedream-4-5-251128"></label>
                      <label><span>默认尺寸</span><input id="imageApiSize" placeholder="2048x2048"></label>
                      <label class="teemo-form-wide"><span>生图 Base URL</span><input id="imageApiBaseUrl" placeholder="留空=复用对话地址，例如 https://ai.hctopup.com/v1"></label>
                      <label class="teemo-form-wide"><span>生图 API Key</span><div class="teemo-secret-field"><input id="imageApiKey" type="password" placeholder="留空=复用对话 Key"><button id="toggleImageApiKey" type="button">显示</button></div></label>
                    </div>
                    <div class="teemo-comfy-hint">推荐模型：Doubao-Seedream、gpt-image-1、gpt-image-2。填好后，关闭 ComfyUI 本地引擎时，聊天里识别到生图意图会走这个云端接口。</div>
                  </details>
                  <div class="teemo-card-actions">
                    <button class="teemo-secondary-button" id="testImageApiButton" type="button">测试生图连接</button>
                    <button class="teemo-primary-button" id="saveImageApiButton" type="button">保存生图 API</button>
                  </div>
                </div>
                <div class="teemo-settings-block">
                  <div class="teemo-settings-block-head">
                    <div><strong>ComfyUI 本地生图</strong><span>直接使用这台电脑的 RTX 4070 Ti 生成图片并返回聊天</span></div>
                    <span id="comfySaveStatus" class="teemo-settings-status"></span>
                  </div>
                  <div class="teemo-comfy-status" id="comfyConnectionStatus"><span class="teemo-status-dot"></span><strong>尚未检测</strong><span>默认地址 http://127.0.0.1:8188</span></div>
                  <div class="teemo-saved-block">
                    <div class="teemo-saved-block-title"><strong>当前工作流</strong><span>导入 ComfyUI 的 API JSON 后可快速切换</span></div>
                    <div class="teemo-workflow-controls">
                      <select id="comfyWorkflowSelect"></select>
                      <button class="teemo-secondary-button" id="importComfyWorkflowButton" type="button">导入 API JSON</button>
                      <button class="teemo-secondary-button teemo-danger-button" id="deleteComfyWorkflowButton" type="button">删除</button>
                    </div>
                    <div class="teemo-workflow-summary" id="comfyWorkflowSummary"></div>
                    <input id="comfyWorkflowFileInput" type="file" accept=".json,application/json" hidden>
                  </div>
                  <details class="teemo-settings-collapse">
                    <summary><strong>生图引擎、参数与存档</strong><span>点击展开引擎设置、高级参数和存档目录</span></summary>
                    <div class="teemo-collapse-body teemo-form-grid">
                      <label class="teemo-form-wide teemo-check-label"><input id="comfyEnabled" type="checkbox"><span>启用 ComfyUI 作为文生图引擎</span></label>
                      <label class="teemo-form-wide"><span>ComfyUI 地址</span><input id="comfyBaseUrl" placeholder="http://127.0.0.1:8188"></label>
                      <label class="teemo-form-wide"><span>Checkpoint 模型</span><select id="comfyCheckpoint"></select></label>
                      <label><span>图片宽度</span><input id="comfyWidth" type="number" min="256" max="2048" step="64"></label>
                      <label><span>图片高度</span><input id="comfyHeight" type="number" min="256" max="2048" step="64"></label>
                      <label><span>采样步数</span><input id="comfySteps" type="number" min="1" max="100"></label>
                      <label><span>CFG</span><input id="comfyCfg" type="number" min="1" max="30" step="0.5"></label>
                      <label class="teemo-form-wide"><span>反向提示词</span><textarea id="comfyNegativePrompt" rows="3"></textarea></label>
                    </div>
                    <div class="teemo-comfy-hint">基础工作流预设为 SDXL · 1024×1024 · 26 步。导入工作流会保留其中的模型、LoRA、VAE、尺寸和采样参数，只替换你的提示词与随机种子。</div>
                    <div class="teemo-saved-block teemo-archive-block">
                      <div class="teemo-saved-block-title"><strong>生图存档</strong><span>聊天里生成的图片会自动保存到本机，并写入索引</span></div>
                      <div class="teemo-archive-grid">
                        <label class="teemo-form-wide teemo-check-label"><input id="archiveEnabled" type="checkbox"><span>自动存档聊天生图到本地文件夹</span></label>
                        <label><span>Teemo 存档文件夹</span><input id="archiveDir" placeholder="D:\\Teemo助手"></label>
                        <button class="teemo-secondary-button" id="openArchiveDirButton" type="button">打开存档文件夹</button>
                        <label><span>ComfyUI 出图目录</span><input id="comfyOutputDir" placeholder="I:\\ComfyUI\\ComfyUI\\output"></label>
                        <button class="teemo-secondary-button" id="openComfyOutputButton" type="button">打开出图目录</button>
                      </div>
                    </div>
                  </details>
                  <div class="teemo-card-actions">
                    <button class="teemo-secondary-button" id="testComfyButton">检测连接并刷新模型</button>
                    <button class="teemo-primary-button" id="saveComfyButton">保存 ComfyUI 配置</button>
                  </div>
                </div>
              </section>

              <section class="teemo-settings-panel" data-panel="skill" hidden>
                <div class="teemo-settings-panel-head">
                  <h2>Skill 管理</h2>
                  <p>与桌宠共享；点「编辑」会在该 Skill 下方展开填写区</p>
                  <div class="teemo-heading-actions">
                    <button class="teemo-secondary-button" id="newSkillGroupButton">新建分组</button>
                    <button class="teemo-secondary-button" id="newSkillButton">新建 Skill</button>
                    <button class="teemo-secondary-button" id="importSkillButton">导入 Markdown</button>
                  </div>
                </div>
                <div class="teemo-settings-block">
                  <input id="skillFileInput" type="file" accept=".md,text/markdown,text/plain" hidden>
                  <div class="teemo-skill-status-line"><span id="skillSaveStatus"></span></div>
                  <details class="teemo-settings-collapse teemo-skill-collapse" open>
                    <summary><strong>桌宠已保存的 Skill</strong><span>可手动分组；编辑时在对应条目内展开</span></summary>
                    <div class="teemo-skill-list" id="skillList"></div>
                  </details>
                </div>
              </section>

              <section class="teemo-settings-panel" data-panel="appearance" hidden>
                <div class="teemo-settings-panel-head">
                  <h2>界面与关于</h2>
                  <p>调整聊天显示，并查看应用版本</p>
                  <span id="chatFontStatus" class="teemo-settings-status"></span>
                </div>
                <div class="teemo-settings-block">
                  <div class="teemo-settings-block-head"><strong>界面显示</strong><span>调整聊天文字大小，立刻生效</span></div>
                  <div class="teemo-form-grid">
                    <label class="teemo-form-wide teemo-font-size-label">
                      <span>聊天字号 <strong id="chatFontSizeValue">16</strong> px</span>
                      <input id="chatFontSize" type="range" min="12" max="22" step="1" value="16">
                    </label>
                    <div class="teemo-font-size-preview" id="chatFontPreview">这是预览文字：调大后这里也会变大。</div>
                    <div class="teemo-card-actions" style="margin:0;padding:0;border:0">
                      <button class="teemo-secondary-button" id="resetChatFontButton" type="button">恢复默认 16</button>
                    </div>
                  </div>
                </div>
                <footer class="teemo-settings-version" aria-label="应用版本">
                  <span>Teemo 助理</span>
                  <span class="teemo-settings-version-dot">·</span>
                  <span id="appVersionLabel">正在读取版本…</span>
                  <button class="teemo-version-update-button" id="checkUpdateButton" type="button">检查更新</button>
                  <span id="updateCheckStatus"></span>
                </footer>
              </section>`;

const newSettings = `      <aside class="teemo-settings-overlay" id="settingsView" hidden aria-label="设置">
        <div class="teemo-settings-shell">
          <div class="teemo-settings-shell-head">
            <button id="settingsBackButton" class="teemo-back-button" type="button">← 返回聊天</button>
            <div><h1>设置</h1><p>配置模型、权限与 Teemo 能力中心</p></div>
          </div>
          <div class="teemo-settings-shell-body">
            <nav class="teemo-settings-nav" id="TeemoSettingsNav" aria-label="设置分类">
              <div class="teemo-settings-nav-group">
                <span class="teemo-settings-nav-label">配置</span>
                <button type="button" class="teemo-settings-nav-item active" data-settings-panel="api">API 与模型</button>
                <button type="button" class="teemo-settings-nav-item" data-settings-panel="approval">操作批准</button>
                <button type="button" class="teemo-settings-nav-item" data-settings-panel="audio">音视频分析</button>
                <button type="button" class="teemo-settings-nav-item" data-settings-panel="image">生图与 ComfyUI</button>
                <button type="button" class="teemo-settings-nav-item" data-settings-panel="skill">Skill 管理</button>
                <button type="button" class="teemo-settings-nav-item" data-settings-panel="appearance">界面与关于</button>
              </div>
              <div class="teemo-settings-nav-group">
                <span class="teemo-settings-nav-label">能力中心</span>
                <button type="button" class="teemo-settings-nav-item teemo-settings-nav-cap" data-settings-capability="memory"><span class="teemo-settings-nav-dot memory"></span>Teemo 对我的了解</button>
                <button type="button" class="teemo-settings-nav-item teemo-settings-nav-cap" data-settings-capability="creative"><span class="teemo-settings-nav-dot creative"></span>Teemo 的设计判断</button>
                <button type="button" class="teemo-settings-nav-item teemo-settings-nav-cap" data-settings-capability="inspiration"><span class="teemo-settings-nav-dot inspiration"></span>我的灵感</button>
                <button type="button" class="teemo-settings-nav-item teemo-settings-nav-cap" data-settings-capability="runtime"><span class="teemo-settings-nav-dot runtime"></span>运行环境</button>
              </div>
            </nav>
            <div class="teemo-settings-panels" id="TeemoSettingsPanels">${panels}
            </div>
          </div>
        </div>
      </aside>`;

html = html.slice(0, start) + newSettings + html.slice(endClose);
fs.writeFileSync(path, html);
console.log('OK replaced settingsView', endClose - start, '->', newSettings.length);
