# Teemo助理 — 项目进度与规划

> 文档版本：v1.20 ｜ 更新日期：2026-08-09 ｜ 当前应用版本：**v1.2.1（P2 Personal Intelligence IN PROGRESS）**

## 当前状态

- Product：`Teemo助理`
- Version：`v1.2.1`
- Source：`D:\Teemo助手\Teemo机器人项目\Teemo-source`
- P0：`CLOSED`
- P1：`CLOSED / PASS / BLOCKERS: 0`
- P0 Baseline：`219b92a` / `v1.1.6-p0-closed`
- Current Development：`P2-3 CLOSED / PASS；NEXT P2-4 Cognition Intelligence`
- Current Branch：`Teemo/p2-personal-intelligence`

## P2-3 阶段（2026-08-09，CLOSED / PASS）

- 新增 session-local、runtime-only 的 balanced/challenge 行为层与 light/standard/strong 三档强度；新 session、新窗口和重启默认 balanced，不写磁盘。
- 新增 deterministic 命令解析、one-shot challenge、session exit 与 one-shot suppression；普通“挑战”文本不切换状态。
- Agent Core 在 Creative 之后最小接入 Challenge Overlay；mandatory 约束、证据和 Direction Diversity Policy 不受 optional 内容裁剪，失败独立降级。
- “Teemo 的设计判断”页新增评审模式控制，聊天输入区新增快速状态按钮；Creative OFF/unreadable 时控件禁用并 fail closed。
- 三套 P2-3 专项测试、隔离 Electron 双窗口/重启 smoke、P1/P2-1/P2-2 全量回归、版本与语法检查均已通过。详见 `docs/P2-3-CREATIVE-DIRECTOR.md`。
- GPT 首轮审阅指出缺失 sessionId 的共享 fallback、复合命令整条跳过 Cognition 及引用误触两个边界；`f6bb0e2` 已移除 fallback，并引入 control span/remaining content 与引用防误触。
- GPT 复审确认 `STATUS: PASS / BLOCKERS: 0 / CAN_CLOSE_AND_TAG: YES / NEXT_STAGE_ALLOWED: P2-4`；实现提交 `5a0d472`、修复提交 `f6bb0e2`，恢复标签为 `v1.2.1-p2.3-challenge-mode`。
- 未实现 P2-4、P2-5、P3、Creative Calibration、GUI 自动化或 Multi-Agent；P2-4 将在独立任务书下启动。

## P2-2 阶段（2026-08-09，CLOSED / PASS）

- 新增独立于 Cognition 的版本化 Agent Creative Profile：10 条专业原则、9 个评价维度、权重总和 100，以及 General/Brand/Marketing/UI/3D/Motion 六个 Domain Lens。
- 新增相关性门控、默认 1,400 字符预算的 Creative Context Builder，并以可选依赖平行接入 Agent Core；普通非设计聊天不注入，失败时独立降级。
- 约束优先级为当前用户明确要求 > 项目约束 > Skill 规范 > Creative Judgment；GPT、Grok、DeepSeek 共用同一 Provider-neutral Profile。
- 新增“Teemo 的设计判断”只读页面和独立开关；本地状态仅保存 enabled/version/revision，不保存或学习用户偏好与个人素材。
- 专项单元、隔离 Electron smoke 和 P1/P2-1 全量回归已通过；详细记录见 `docs/P2-2-CREATIVE-PROFILE.md`。
- GPT 首轮审阅的恢复点证据、mandatory policy 预算、relevance 边界、损坏状态 fail-safe、流式/跨实例验证 5 个 blocker 已修复；第二轮全量回归通过，复审确认全部解除。
- GPT 复审确认 `PASS / BLOCKERS: 0 / CAN_CLOSE_AND_TAG: YES / NEXT_STAGE_ALLOWED: P2-3`；恢复标签为 `v1.2.1-p2.2-creative-profile`。
- 未实现 P2-3 Challenge/Creative Director、P2-4 Cognition Intelligence Upgrade 或 P3 Personal Inspiration Intelligence；P2-3 将在独立阶段启动。

## v1.2.1 维护更新（2026-08-09）

- 修复 Memory Center 手动新增认知在 1,000 字符处静默截断、达到上限后无法继续输入的问题。
- 单次输入上限调整为 12,000 字符，界面显示实时字符数、超限反馈和预计认知条数。
- 长内容按段落和句子拆分为不超过 420 字符的认知；批量新增只持久化一次，并保留敏感信息、重复项和 revision 保护。
- 维护版本标签：`v1.2.1-cognition-input`；P2-1 原恢复标签保持不变，P2-2 仍未开始。

## P2-1 阶段（2026-08-09，CLOSED / PASS）

- 独立聊天侧栏新增「Teemo 对我的了解」一级入口，展示长期、近期、项目和不再适用认知。
- 新增手动认知、纠正/修改、作用域迁移、不再适用、Observation 依据、搜索过滤和 Cognition 开关。
- Cognition Service 增加 version 2 `enabled` / `revision` 和结构化管理 API；写入仍只通过 TeemoStorageService。
- 管理 mutation 使用 latest-read + optimistic revision，Context Builder/Collector 每轮 reload，保证下一次跨窗口请求使用最新状态。
- 新增 `test:cognition-management` 与隔离 Electron `test:cognition-ui-smoke`；正式用户数据未用于测试。
- GPT 严格审阅确认：`P2-1 Cognition UI / Memory Center STATUS: PASS / BLOCKERS: 0 / REQUIRED_FIXES: 无`。
- 详细记录见 `docs/P2-1-COGNITION-UI.md`；阶段恢复标签为 `v1.2.0-p2.1-cognition-ui`，P2-2 尚未开始。

## P0 阶段收尾（2026-08-09）

- 产品命名已统一为 `Teemo助理`；当前源码、界面与安装包版本为 `v1.2.0`，后续安装包、快捷方式和版本显示不得再使用“哈啰设计助手”。
- 版本规则：发布标签 `vX.Y.Z-*` 的数字前缀是版本事实源；`package.json`、lockfile、界面 `app.getVersion()` 与安装包文件名必须一致，构建前由 `npm run verify:release-version` 强制检查。
- P0-1：唯一正式开发源码为 `D:\Teemo助手\Teemo机器人项目\Teemo-source`，Git 基线分支和可构建标签已建立。
- P0-2：AI、存储、本地文件能力已整理为 AIService、TeemoStorageService、TeemoFileService 统一入口。
- P0-3：根目录 `AGENTS.md` 已建立，作为 Codex、Kiro、Grok 等 AI Coding Agent 的最高优先级协作规则。
- GPT 审阅结论：总体方向符合预期；已补齐 Storage 安全写入、多 AI 防覆盖、正式构建验收和 P1 Permission Layer 边界说明。
- 正式 Windows 构建：`dist\Teemo-1.1.6-x64.exe` 已从 `Teemo-source` 生成并完成隔离 profile 启动烟测。
- 下一阶段：P1-Agent Core。Agent Core、Tool Calling、Memory、Permission Layer、FileTool 写入/执行能力不属于 P0。

## P1-1 阶段（2026-08-09）

- 已建立 `src/agent/TeemoAgentCore.js`，支持 Agent Run/Step、统一 Action、最大步骤、取消和统一错误结果。
- 已接入桌宠聊天和独立聊天窗口的流式兼容包装，保留原有 UI、历史、Skill、附件和模型切换。
- 仅提供无副作用的 `echo` 与 `get_agent_runtime_info` 内部测试 Tool。
- 详细记录见 `docs/P1-1-AGENT-CORE.md`。
- P1-1 已经 GPT 审阅确认封板；阶段提交为 `20f90b0` 和 `dbfc598`，恢复标签为 `v1.1.7-p1.1-agent-core`。
- P1-2（Teemo Cognition + Context Builder）已完成实现、本地自动测试和 GPT 两轮审阅，详细记录见 `docs/P1-2-COGNITION-CONTEXT.md`；阶段恢复标签为 `v1.1.7-p1.2-cognition-context`。

## P1-2 阶段（2026-08-09）

- 新增模型无关的 Teemo Profile、Recent Context、按 projectId 隔离的 Project Context 和 Observation 数据层。
- 新增保守 Cognition Collector：只采集用户明确偏好/习惯/目标/项目约束，支持重复证据、长期升级和纠正 supersede，不调用 AIService。
- 新增统一 Context Builder：按当前指令 > 项目 > Recent > Profile 的优先级组装有限预算上下文。
- Agent Core 以可选依赖最小接入；Builder/Collector 失败时普通非流式和流式聊天均安全降级。
- Cognition 只通过 TeemoStorageService 保存到本地 `Teemo-cognition.json`；测试使用隔离临时目录，没有读取或修改正式用户数据。
- GPT 首轮审阅指出 active project 模糊偏好和指代迁移两个作用域风险；修正提交 `a0c2f04` 已收紧为“项目内模糊审美默认归项目、仅唯一候选允许迁移”。
- GPT 最终审阅结论：`P1-2 Teemo Cognition + Context Builder STATUS: CLOSED / RESULT: PASS / BLOCKERS: 0`。

## P1-3 阶段（2026-08-09，CLOSED / PASS）

- 新增模型无关的 `TeemoToolRegistry`，统一注册、Schema 校验、调用编号、受控上下文、Abort 和结果 envelope。
- `echo` 与 `get_agent_runtime_info` 已迁移到共享内置 Definition 来源；Agent Core 已移除具体 Tool 映射，只依赖注入的 Registry。
- 桌宠与独立聊天 renderer 启动时各创建一次稳定 Registry，所有 Agent Run 复用；公开 Definitions 不包含 handler 或 metadata。
- 未增加 Permission、文件、Git、Shell、网络、ComfyUI、Memory 或 Provider Adapter 能力。
- GPT 严格审阅确认：`P1-3 Tool Registry STATUS: CLOSED / RESULT: PASS / BLOCKERS: 0`。
- 详细记录见 `docs/P1-3-TOOL-REGISTRY.md`；阶段实现提交为 `5bed161`，恢复标签为 `v1.1.7-p1.3-tool-registry`。

## P1-4 阶段（2026-08-09，CLOSED / PASS）

- Main Process 新增唯一 `TeemoPermissionService`，两个 renderer 通过带 owner 绑定的 IPC Client 共享 grants、pending request 和 audit。
- 建立 none/read/write/execute 风险等级与 allow/prompt/deny Decision Contract；支持 once、session、测试 URI resource scope。
- Registry 在 handler 前 fail closed；deny、timeout、abort、服务异常或缺失 metadata 均保证 handler 不执行。
- 新增最小权限确认 UI，但生产 Registry 仍只有 permission=none 的两个安全 builtin，不会增加真实系统权限。
- GPT 严格审阅确认：`P1-4 Permission Layer STATUS: CLOSED / RESULT: PASS / BLOCKERS: 0`。
- 详细记录见 `docs/P1-4-PERMISSION-LAYER.md`；阶段实现提交为 `625cd1f`，恢复标签为 `v1.1.7-p1.4-permission-layer`。

## P1-5 阶段（2026-08-09，CLOSED / PASS）

- 新增 `list_directory`、`read_file`、`search_files`、`search_text`、`create_file`、`patch_file`、`rename_file` 七个正式 Agent 文件工具；没有删除、Git、Shell、网络或执行能力。
- 模型路径先由 Main `TeemoFileService` 规范化并检查授权根，再生成 `file:///` Permission Resource；获准后在真实 I/O 前第二次解析并检查文件身份，阻止 traversal、UNC/device/ADS、symlink/junction 逃逸和授权等待期 TOCTOU。
- Main 准备操作同时绑定 renderer owner 与 `toolCallId`；文件执行必须消费中央 Permission Service 的一次性授权凭证，直接调用文件 IPC 不能绕过权限。
- 写入仅限保守纯文本白名单；create 独占不覆盖，patch 强制 expectedSha256/精确唯一编辑/原子替换，rename 强制 expectedSha256/同授权根/不覆盖；没有 delete。
- 桌宠和独立聊天窗口由同一 `TeemoFileTools` Definition Factory 注册相同工具，共享 Main 授权根与权限状态。
- 单元/安全/并发回归及隔离 Electron 双 renderer、完整应用烟测均通过；详细记录见 `docs/P1-5-FILE-TOOLS.md`。
- GPT 严格审阅确认：`P1-5 Safe File Tools STATUS: CLOSED / RESULT: PASS / BLOCKERS: 0`；实现提交为 `0211a40`，阶段恢复标签为 `v1.1.7-p1.5-file-tools`。

## P1-6A 阶段（2026-08-09，CLOSED / PASS）

- 新增 `git_status`、`git_diff`、`git_log`、`git_show` 四个 read Tool，以及 `git_stage_files`、`git_commit` 两个 write Tool。
- repo 必须位于既有 authorized root；Main 生成可信 `git+file:///` resource，并在 Permission 后复核 repo/git-dir identity、stage 文件 hash 或 HEAD/staged tree。
- Git 进程固定 `shell:false` 与参数数组，具备环境脱敏、输出限制、timeout、abort/process-tree 清理；Main 一次性 execution authorization 防止 direct IPC、owner spoof 与 replay。
- 全部 Git 调用统一覆盖空 hooksPath、关闭 fsmonitor/commit signing、清空 credential helper/external diff；stage/diff 对 Git filter attributes 保守 fail closed，防止 read/write 权限经 Git 配置间接启动外部程序。
- stage 只处理明确文件；commit 不自动 add。正式 Definition 中 destructive Git 与 remote Git Tool 数量均为 0。
- `test:git-tools` 包含 hooks/custom hooksPath/signing/filter/fsmonitor 恶意 marker 测试；P1-1 至 P1-5 回归与双 renderer 隔离 Git 烟测均 PASS。详细记录见 `docs/P1-6-GIT-EXECUTE.md`。

## P1-6B 阶段（2026-08-09，CLOSED / PASS）

- 新增 `run_npm_script` 与 Node-only `run_process` 两个 execute Tool；没有任意 shell、Git/cmd/PowerShell/Python executable 或网络服务入口。
- cwd、package、Node script、Node/npm canonical identity 与内容 hash 由 Main 解析，生成含完整 operation/executable/hash query 的可信 `exec+file:///` Permission Resource。
- Permission 后重新解析全部 execution snapshot；package/script/command/resource 任一变化都以 `EXECUTION_RESOURCE_CHANGED` fail closed，且不启动进程。
- 进程固定 `shell:false`、stdin disabled、minimal env、secret-name filter、timeout、Abort、输出上限/清洗与 process-tree cleanup。
- `test:execute`、P1 全量回归、双 renderer 隔离 Execute 烟测和完整应用隔离启动均 PASS；详细记录见 `docs/P1-6-GIT-EXECUTE.md`。
- GPT 总审阅最终确认：`P1 Agent Foundation STATUS: CLOSED / RESULT: PASS / BLOCKERS: 0`。
- P1-6 实现提交为 `ecd7bda`、`9b8978d`；Git 间接执行安全补丁为 `1bbdf95`、`2e91f42`。最终恢复标签为 `v1.2.0-p1-agent-foundation`。
- P1 到此结束；未进入 P2，后续阶段必须由新的明确规划启动。

### P0 已知风险

- `npm ci` 报告现有依赖树存在 11 项 audit vulnerabilities（10 high、1 critical）。本阶段未升级依赖，避免改变稳定基线；后续单独建立依赖升级任务和回归窗口。
- `js/` 旧兼容模块和外围模块的独立存储逻辑暂保留，作为技术债记录。

---

## 一、项目定位

一个面向哈啰两轮事业部视觉设计师的 **桌面端 AI 工作助手**。以桌面宠物（IP 形象）为交互入口，整合 AI 对话、钉钉消息、语雀文档、待办管理等日常工作流，帮助设计师在不切换应用的情况下高效处理信息和设计任务。

| 维度 | 说明 |
|------|------|
| 用户群体 | 哈啰两轮设计中心的视觉设计师 |
| 核心价值 | 一个「始终在桌面的 AI 设计搭档」，减少上下文切换，把 AI 能力融入日常工作 |
| 产品形态 | Electron 桌面应用，透明悬浮窗 + 全屏鼠标穿透，IP 形象可自由拖拽 |

---

## 二、技术架构

| 维度 | 方案 |
|------|------|
| 运行时 | Electron 31+ |
| 渲染层 | 原生 HTML / CSS / JS（无框架） |
| 窗口模式 | 全屏透明 + 鼠标穿透（forward 模式） |
| AI 协议 | OpenAI 兼容协议（OpenAI / DeepSeek / 通义 / 智谱 / Kimi / 火山方舟等） |
| 数据持久化 | 本地 JSON 文件（`~/.hellobike-pet/`） |
| 网络代理 | config.json / 环境变量 / 系统代理 三级回退 |

### 代码结构

```
desktop-pet/
├── main.js                # Electron 主进程（窗口管理 / 代理 / 语雀 API / IPC）
├── index.html             # 渲染进程入口
├── config.json            # AI 模型 & 代理配置
├── pet.png                # IP 形象图片
├── start.command          # macOS 双击启动脚本
├── icon/                  # 应用图标 & Dock 图标
└── src/
    ├── app.js             # 渲染进程总入口，初始化所有模块
    ├── components/        # UI 组件层（16 个组件）
    ├── services/          # 业务逻辑层（15 个服务）
    ├── stores/            # 设置持久化
    ├── styles/            # 模块化 CSS（16 个文件）
    └── utils/             # 工具函数（上下文构建 / Markdown 渲染）
```

> ⚠️ 说明：根目录另存在一套旧版 `js/` 扁平结构代码，`src/` 为重构后的分层主力版本。若 `js/` 已废弃，建议后续清理以避免混淆。

---

## 三、当前开发进度

### ✅ 已完成模块

| 模块 | 说明 | 关键文件 |
|------|------|----------|
| 桌宠 IP 交互 | 自由拖拽、贴边收纳/弹回、悬停气泡、点击事件、右键菜单 | `src/components/pet.js` |
| 快捷 Dock | 点击 IP 弹出底部标签栏，支持 AI / 钉钉 / 语雀 / 待办 / 技能切换 | `src/components/quick-dock.js` |
| AI 聊天面板 | 多轮对话、流式输出、Markdown 渲染、快捷指令（需求分析/总结/文案/复盘/转待办） | `src/components/chat.js`、`src/services/ai.js` |
| AI 模型接入 | 支持 OpenAI 协议全家桶，含连接测试、流式 SSE、推理模型适配（reasoning_content） | `src/services/ai.js` |
| 钉钉消息 | 消息列表、未读计数、单条消息 AI 总结/需求分析/AI 接管回复 | `src/components/dingtalk.js`、`src/services/dingtalk.js` |
| AI 接管模式 | 全局接管 / 单会话接管，自动读取钉钉消息并生成回复建议 | `src/services/ai-takeover.js` |
| 语雀文档 | 通过公网 API 读取团队语雀文档，支持 URL 解析、文档内容摘要送 AI | `src/services/yuque*.js`、`main.js` |
| 待办管理 | CRUD、优先级、截止时间、到期提醒（30 分钟前通知）、AI 对话转待办 | `src/services/todos.js`、`src/components/todos.js` |
| 技能系统 | 内置 6 个设计技能（配色/文案/命名/评审/Banner/图标）+ 用户上传自定义 Skill | `src/services/skills.js`、`src/components/skills.js` |
| 今日简报 | 早安卡片（待办概览 + 一键开始今天）/ 晚报卡片（完成统计 + AI 小结） | `src/services/daily-brief.js`、`src/components/daily-brief.js` |
| 通知气泡 | 钉钉新消息 / 语雀更新 / 待办到期 → 桌宠头顶弹出气泡通知 | `src/components/notification.js` |
| 工作统计 | 每日待办完成/取消/消息处理次数记录，晚报对比昨日数据 | `src/services/work-stats.js` |
| 偏好设置 | 缩放大小、置顶开关、待机动画、隐私设置（消息预览显隐） | `src/components/preferences.js`、`src/stores/settings.js` |
| API 接入面板 | 可视化配置 AI 供应商/Key/模型，一键测试连接 | `src/components/api-connect.js` |
| 面板拉伸 | 面板可拖拽调整宽度 | `src/components/panel-resizer.js` |
| 对话历史 | 本地持久化聊天记录，多会话管理 | `src/services/chat-history.js` |
| 代理支持 | 三级代理回退机制，解决海外 API 网络不通问题 | `main.js`（setupProxy） |
| 语雀团队 Token | 内置 20+ 团队的读取令牌，覆盖两轮各业务线知识库 | `main.js`（YUQUE_TEAMS） |
| 规范沉淀 | 对话/钉钉中提出的规范自动/手动沉淀为独立规范技能，作为机器人回复的参考依据；支持查看/编辑/删除 | `src/services/rule-capture.js`、`src/services/skills.js`、`src/services/dingtalk-ai.js` |

### 进度概览

- **核心交互链路**：✅ 已跑通
- **AI 对话 / 待办 / 技能系统**：✅ 可正常使用
- **语雀文档**：✅ 真实读取
- **规范沉淀与参考注入**：✅ 已跑通
- **钉钉消息**：🟡 模拟数据（Mock 阶段）

### 专项：规范沉淀与参考注入

> 场景：使用者 / 同事在对话或钉钉里提出「以后遵循某规范」时，系统把规则完整沉淀为一个**独立**的规范技能，作为机器人回复的**参考依据**（不并入默认回复规则），并支持随时手动调整/删除。

**捕获入口（三处，行为一致）**

| 入口 | 触发方式 | 说明 |
|------|---------|------|
| AI 聊天面板 | 自动 | 消息命中规范特征 → 后台非阻塞抽取，默认追加到「规范合集」 |
| AI 聊天面板 | 手动 | 「把刚才那条规范记下来 / 存成技能」→ 回溯最近对话抽取，回执真实结果 |
| 钉钉接管 | 自动 + 手动 | `buildTakeoverReply` 中同事消息自动沉淀；显式「存成技能」则回执确认 |

**关键设计**

- **默认追加、明确才新建**：所有规范默认汇入同一个「📚 规范合集」技能（固定 id `rule_collection`），仅当消息明确说「新建一个技能」时才单独成技能。
- **独立于默认规则**：捕获的规范是 `category==='rule'` 的自定义技能，**不修改** skill1「机器人回复规则」。
- **作为回复参考注入**：`SkillService.getReferenceRules()` 聚合所有规范技能正文，`dingtalk-ai.js` 的 `suggestReply` 将其作为「参考规范」段落注入机器人回复系统提示词。
- **可编辑/删除**：技能中心的规范技能提供「查看/编辑规则」（编辑 `systemPrompt`）与「删除此规范」。
- **成本与稳健**：关键词初筛（覆盖「遵循/规范」显式措辞 + 「当…时/每当/只要…」条件式指令 + 「以后…都…」常驻指令）先行，避免每条消息都调用 AI；AI 抽取有 `isRule` 兜底，误判只多一次调用、不生成脏技能；5 分钟指纹去重防重复建。

**涉及文件**：`src/services/rule-capture.js`（捕获服务）、`src/services/skills.js`（参考聚合 + 规则编辑）、`src/services/dingtalk-ai.js`（参考注入）、`src/components/chat.js`（聊天入口）、`src/components/skills.js`（编辑/删除 UI）、`src/app.js`（装配 + 钉钉入口 + UI 反馈）。

---

## 四、后续目标规划

### 🔧 待优化 / 规划中

| 方向 | 状态 | 优先级建议 |
|------|------|-----------|
| 真实钉钉 API 对接（替换 Mock 数据） | 🟡 Mock 阶段 | 高 |
| Claude 协议适配 | 🟡 预留接口 | 中 |
| 多模态：图片 / 截图识别 | 🟡 规划中 | 中 |
| IP 动效（Lottie 替代静态 PNG） | 🟡 规划中 | 中 |
| 打包分发（DMG / 自动更新） | 🟡 未开始 | 高 |
| 深色模式 | 🟡 未开始 | 低 |
| Figma 插件联动 | 🟡 概念阶段 | 中 |

### 阶段性目标拆解（建议）

**近期（打磨可用性 → 可分发）**
1. 钉钉真实 API 对接，打通消息读取与 AI 接管的完整闭环
2. 打包分发流程（DMG + 自动更新），让设计师可直接安装使用
3. 清理 `js/` 旧版代码，统一到 `src/` 分层架构

**中期（能力增强）**
4. 多模态截图识别，支持把设计稿/界面截图丢给 AI 分析
5. IP 动效升级（Lottie），让桌宠表情/状态更生动
6. Claude 协议适配，扩展模型选择
7. Figma 插件联动，与现有素材生成/替换工具打通

**远期（体验完善）**
8. 深色模式
9. 更丰富的技能市场与团队共享机制

---

## 五、风险与注意事项

1. **配置安全**：`config.json` 中 `apiKey` 为占位值（`sk-your-api-key-here`），真实 Key 应走本地配置，切勿提交至公开仓库。
2. **敏感令牌**：`yuque-teams.local.json` 内置团队读取 Token，注意纳入 `.gitignore`，避免泄露。
3. **代码双版本并存**：`js/`（旧）与 `src/`（新）需尽快收敛，降低维护成本。
4. **钉钉数据真实性**：当前为 Mock，对外演示时需说明，避免误判功能完成度。

---

## 六、启动方式

```bash
cd docs/desktop-pet
npm install
npm start
```

或 macOS 下双击 `start.command` 脚本启动。
