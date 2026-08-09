# Changelog

## P3-1 Inspiration Foundation - 2026-08-09（IMPLEMENTED / WAITING REVIEW）

- 新增独立 `Teemo-inspiration-state.json`，默认关闭，支持文件锁、optimistic revision 与损坏状态 fail closed。
- 新增只读 Connector Contract、Registry、P1 Permission Access Guard 和 Service；生产 Registry 保持为空。
- 独立聊天新增“我的灵感”最小管理页，只显示隐私边界、基础开关、状态和空来源列表。
- 未接入真实素材来源、索引、Embedding、Vector Store、检索或 Agent Context；P2 事实源与消息顺序不变。
- 新增三组隔离专项测试；开发版本升至 1.3.0，已安装生产版仍为 1.2.1，当前不构建、不安装。

## Teemo Release Update Policy - 2026-08-09
- 新版本在后台下载完成后直接静默安装并强制重启 Teemo 助理，不再等待“稍后”确认。
- 新增 `test:auto-update`，锁定自动下载、退出时安装和下载完成后自动重启策略。

## P2 Personal Intelligence Final Acceptance - 2026-08-09（CLOSED / PASS）

- P2-1 至 P2-5 全部关闭并保留独立 recovery tag；P1 与既有 P2 tag 均验证未移动。
- 跨层 Source of Truth、Context 顺序、约束优先级、send/stream、双 Renderer、Session/Restart、损坏状态与正式数据隔离通过总验收。
- 最终 22 组 Node、9 组 Electron、32-case Skill benchmark、50 个 P2 变更 JS 语法、累计 diff 与 v1.2.1 版本映射全部 PASS。
- GPT Final Acceptance 确认 `PASS / BLOCKERS: 0 / CAN_CLOSE_P2: YES / NEXT_STAGE_ALLOWED: RELEASE-INSTALL-RESTART`；未进入 P3。

## P2-5 - 2026-08-09（CLOSED / PASS）

- 建立 Teemo Skill Specification v1，保留导入 Raw Skill 原文并与 `Teemo-skill-registry.json` Internal Manifest 永久分离。
- 新增 deterministic Provider-neutral Importer、Validator、Manifest Service、Router、Composer 和 runtime-only Session State；不使用 LLM、Embedding 或 Vector DB。
- Registry 使用 schemaVersion/revision/expectedRevision、原子写和文件锁；损坏 fail closed、不覆盖原字节，双窗口 stale write 不静默覆盖。
- Router 支持 explicit、NO_SKILL、ambiguity、hard exclusion、attachment modality、project enhancer、required-tool availability、adult/sensitive 同架构和最多三项跨 role composition。
- Agent Core 统一 send/stream 与两个 Renderer 的 Skill 注入，保持 Skill、Cognition、Creative、Challenge、Current User 顺序；Router/Composer 失败普通聊天继续且不 fail open。
- 两个既有 Skill UI 增加 Routing Metadata override、状态和轻量聊天 Skill chip；override、Registry 读取和重启不修改 Raw Skill。
- 增加整轮 negative/meta/question/comparison suppression、hard-rejected Session 清理与 multi-Skill survivor retention，防止被拒绝 Skill 从 explicit/auto/continuity 回流。
- 单个 invalid Manifest 支持隔离、合法邻居 save/reset 和双 UI 显式 Repair；重建从 current Raw Skill 生成并跨重启持久化，broken Registry 仍 fail closed 且不覆盖原 bytes。
- 8 个 P2-5 测试入口、32 条 deterministic benchmark、22 组 Node 和 9 组 Electron smoke 全部通过；版本保持 1.2.1。
- GPT 四轮 strict review 最终确认 `PASS / BLOCKERS: 0 / CAN_CLOSE_AND_TAG: YES / NEXT_STAGE_ALLOWED: P2-FINAL-ACCEPTANCE`；恢复标签为 `v1.2.1-p2.5-skill-intelligence`。

## P2-4 - 2026-08-09（CLOSED / PASS）

- 新增 `TeemoCognitionIntelligence`，运行时派生 composite identity、exact dedup、freshness、effective confidence、conflict、promotion eligibility 和 relevance；顶层 schema 保持 v2，无 read-time migration。
- Collector 改为一次锁内业务提交与一次 revision 增量，冲突最多 retry 1 次；Recent 晋升要求至少 3 次证据、跨 2 个自然日、无冲突且未 stale，Project/Manual Recent 不自动晋升。
- Context 保持 5200 字符预算，按 Current Project > Relevant Recent > Relevant Profile 选择；stale Recent 默认排除，Cognition 以不可信 JSON data block 注入并阻止 role-like prompt injection 获得指令权限。
- “Teemo 对我的了解”增加稳定/近期/逐渐陈旧/已陈旧/有冲突/待确认、有效可信度、最后确认和证据次数，不新增导航或统计面板。
- 新增四套 P2-4 专项测试；P1/P2-1/P2-2/P2-3 全量回归、两套 Cognition Electron smoke、语法与 diff 检查通过，版本仍为 1.2.1。
- GPT strict review 最终确认 `PASS / BLOCKERS: 0 / CAN_CLOSE_AND_TAG: YES / NEXT_STAGE_ALLOWED: P2-5`；恢复标签为 `v1.2.1-p2.4-cognition-intelligence`。
- GPT 首轮审阅后补齐 active project 中“以后所有项目”显式跨项目路由，并删除 single Profile 对无关请求的无条件 fallback；新增正反、敏感题材与 send/stream 测试。
- P2-1 Management 写 API 与 Collector 统一使用同一文件锁，避免两个 renderer/UI 与后台采集交叉覆盖；`evidenceDays` 采用 UTC 日期去重并限制最近 64 天。
- GPT 第二轮源码复审后阻止 Manual Recent lineage 自动晋升；correction 仅唯一 anchor candidate 自动 supersede，一对多保持待确认。
- broad design-domain 仅保留 ranking boost，不再单独准入 Profile/Recent；新增敏感设计题材跨普通设计任务的数据最小化负向测试和相关/个人偏好正向 send/stream 测试。

## P2-3 - 2026-08-09（CLOSED / PASS）

- 新增 session-local、runtime-only 的 Creative Director 状态：balanced/challenge 与 light/standard/strong，不写磁盘且重启恢复 balanced。
- 新增确定性 session/one-shot/exit/suppress 命令解析，以及最多 900 字符的 Provider-neutral Challenge Overlay。
- Challenge mandatory policy 固定用户/项目/Skill 优先级、证据边界和 Direction Diversity Contract；Creative disabled/unreadable 或 Builder 失败时安全降级。
- 扩展“Teemo 的设计判断”页面和聊天快速状态按钮；双窗口、重启、Creative OFF 和 one-shot 隔离 smoke 通过。
- 纯 Challenge 运行时控制语句在 Cognition Collector 前明确跳过，避免 mode/intensity 指令污染个人认知；普通内容的既有收集规则不变。
- GPT 首轮审阅后移除缺失 sessionId 的 renderer 共享状态 fallback；未知 identity fail balanced，one-shot 仅当前 Run 生效。
- 命令解析新增 control span/remaining content：纯控制语句零写入，复合消息保留实质认知内容，引用/翻译/解释控制短语不改变状态；send/stream 与同 renderer Session A/B 均补充回归。
- 新增 `test:creative-director`、`test:challenge-context`、`test:creative-director-ui-smoke`；完整回归、三个 Electron UI smoke、版本与语法检查已通过，版本仍为 1.2.1。
- GPT 复审确认 `PASS / BLOCKERS: 0 / CAN_CLOSE_AND_TAG: YES / NEXT_STAGE_ALLOWED: P2-4`；实现提交 `5a0d472`、审阅修复 `f6bb0e2`，恢复标签为 `v1.2.1-p2.3-challenge-mode`。

## v1.2.1 - 2026-08-09

### P2-2 Agent Creative Profile（CLOSED / PASS）

- 新增版本化、Provider-neutral 的 Agent Creative Profile，包含 10 条专业原则、9 个评价维度、总和为 100 的默认权重和 6 个 Domain Lens。
- 新增相关性门控、默认 1,400 字符预算的 Creative Context Builder，与 Cognition 平行接入 Agent Core；失败只独立降级。
- 新增“Teemo 的设计判断”只读页面、独立 enabled 开关和 optimistic revision；本地状态文件不保存原则正文。
- 明确 Cognition、Creative Profile 与未来 Personal Inspiration Intelligence 三者事实源独立，以及用户 > 项目 > Skill > Creative Judgment 的约束优先级。
- 新增 `test:creative-profile`、`test:creative-context` 和隔离 Electron `test:creative-ui-smoke`；P2-2 未修改 package/UI/installer 版本。
- GPT 首轮严格审阅后收紧：mandatory policy 不受预算裁剪；当前用户意图主导 relevance；损坏 Creative state fail closed；补齐默认 send/stream、附件、实际消息顺序和跨实例回归。
- GPT 复审确认 `PASS / BLOCKERS: 0 / REQUIRED_FIXES: 无`；实现提交 `095ca4c`、审阅修复提交 `78f1a8d`，阶段恢复标签为 `v1.2.1-p2.2-creative-profile`。

## v1.2.0 - 2026-08-09

### P2-1 Cognition UI / Memory Center（CLOSED / PASS）

- 独立聊天侧栏新增「Teemo 对我的了解」，展示长期、近期、项目认知、不再适用历史与 Observation 依据。
- 新增手动添加、纠正/修改、安全 scope migration、不再适用、搜索过滤和 Cognition 开关。
- Cognition Schema 兼容升级到 version 2，增加 enabled/revision；管理操作使用结构化 Service API、敏感信息拦截和 optimistic concurrency。
- Context Builder 与 Collector 每轮读取最新 Cognition，关闭开关后停止新增和注入但保留数据。
- 新增 Cognition management 测试与隔离 Electron UI smoke；P1 全量回归、版本检查与 diff 检查全部 PASS。
- GPT 严格审阅确认 `STATUS: PASS / BLOCKERS: 0 / REQUIRED_FIXES: 无`；阶段恢复标签为 `v1.2.0-p2.1-cognition-ui`，未进入 P2-2。

### 版本与 P1 封板一致

- 将 `package.json`、lockfile、设置界面动态版本与 Windows 安装包版本统一为 `1.2.0`，对应标签 `v1.2.0-p1-agent-foundation` 的数字前缀。
- 新增 `scripts/TeemoVerifyReleaseVersion.js` 与构建前生命周期检查；最近可达标签 `vX.Y.Z-*` 与 package/UI/installer 版本不一致时拒绝打包。
- P1 Agent Foundation 保持 `CLOSED / PASS / BLOCKERS: 0`，没有进入 P2。

## v1.1.7 - 2026-08-09

### P1-6 Git + Controlled Execute（CLOSED / PASS）

- 新增 4 个只读 Git Tool、显式文件 stage 与 staged-only commit；不存在 destructive/remote Git Tool。
- 新增 `run_npm_script` 与 Node-only `run_process`；不存在任意 shell、cmd、PowerShell、Python 或任意 executable Tool。
- Git/Execute 都使用 Main canonical policy、可信动态 Permission Resource、一次性 execution authorization、授权后 TOCTOU 复核与 owner/replay 防护。
- Git Safe Invocation Policy 以空 hooksPath、关闭 fsmonitor/commit signing、清空 credential helper/external diff 与 filter attribute fail-closed，阻止 read/write Git Tool 间接启动外部程序绕过 execute permission。
- 所有子进程固定 `shell:false`、参数数组、最小环境、secret filter、输出清洗/上限、timeout、Abort 与 process-tree cleanup。
- `test:git-tools`、`test:execute` 与 P1-1 至 P1-5 全量回归通过；Git/Execute 双 renderer 隔离烟测及完整应用隔离启动通过。
- P1-6A/P1-6B 实现提交为 `ecd7bda`、`9b8978d`；Git hooks/filter/signing/fsmonitor/textconv 间接执行补丁为 `1bbdf95`、`2e91f42`。
- GPT 最终总审阅确认：`P1 Agent Foundation STATUS: CLOSED / RESULT: PASS / BLOCKERS: 0`；最终恢复标签为 `v1.2.0-p1-agent-foundation`。

### P1-5 Safe File Tools（CLOSED / PASS）

- 新增 4 个 read 与 3 个 write 文件 Tool；写入仅限文本白名单，create 不覆盖，patch 需要 expected hash/唯一匹配，rename 不覆盖且不提供 delete。
- 使用 Main authorized-root/canonical path、可信 `file:///` Permission Resource、授权后 TOCTOU 复核与 owner/replay 防护。
- 单元、安全、并发、双 renderer Electron 与完整应用隔离烟测通过。
- GPT 严格审阅确认 `BLOCKERS: 0`；实现提交为 `0211a40`，恢复标签为 `v1.1.7-p1.5-file-tools`。

### P1-4 Permission Layer（CLOSED / PASS）

- 新增 Main Process 中央 `TeemoPermissionService`、renderer IPC Client 和最小权限确认 UI。
- 建立 none/read/write/execute 风险等级、allow/prompt/deny Decision、once/session/resource scope、timeout、abort、fail closed 和内存 audit。
- Registry 在 handler 前统一授权；两个 renderer 的 Registry 实例共享同一 Main 权限事实源，且 pending 响应绑定发起 `webContents`。
- `echo` 与 `get_agent_runtime_info` 显式保持 permission=none；没有新增真实 File/Git/Shell/Network/ComfyUI Tool。
- 增加 `test:permissions` 与双 renderer Electron IPC 集成烟测；四套自动测试和完整应用双隔离烟测均通过。
- GPT 严格审阅确认 `BLOCKERS: 0`；阶段实现提交为 `625cd1f`，恢复标签为 `v1.1.7-p1.4-permission-layer`。
- P1-5 硬约束：模型路径必须先经可信 FileService canonicalization/authorized-root 校验生成 permission resource，并在授权后、实际 I/O 前再次校验以防 TOCTOU。

### P1-3 Tool Registry（CLOSED / PASS）

- 新增模型无关的统一 `TeemoToolRegistry`、轻量 JSON Schema 校验、独立 toolCallId、受控执行 context、Abort 和统一 Tool Result envelope。
- 将无副作用的 `echo`、`get_agent_runtime_info` 迁移为共享内置 Tool Definitions；Agent Core 不再硬编码具体 Tool handler。
- 桌宠与独立聊天窗口在 renderer 启动时各创建一次稳定 Registry，并共享相同 Definition 来源。
- 增加 `registry.listDefinitions()` 安全导出，明确排除 handler、metadata 和内部 context，为未来 Provider Adapter 预留边界。
- 增加 `docs/P1-3-TOOL-REGISTRY.md` 和 `npm.cmd run test:tools`；未引入 Permission 或任何真实高权限 Tool。
- GPT 严格审阅确认 `BLOCKERS: 0`；阶段实现提交为 `5bed161`，恢复标签为 `v1.1.7-p1.3-tool-registry`。
- 后续约束：P1-4 的权限状态必须以中央服务为唯一事实源，不能随两个 renderer 的 Registry 实例各自复制。

### P1-2 Cognition + Context Builder（CLOSED / PASS）

- 新增 Teemo Profile、Recent Context、按 projectId 隔离的 Project Context 和 Observation 数据模型。
- 新增不调用模型的保守 Cognition Collector，支持重复证据升级、用户纠正 supersede 与敏感凭据拦截。
- 新增有预算的模型无关 Context Builder，并以可选依赖接入 Agent Core 的流式/非流式路径。
- Cognition 数据只通过 TeemoStorageService 保存到本地 `Teemo-cognition.json`；Builder/Collector 失败不影响普通聊天。
- 补齐旧外围服务对 `TEEMO_ASSISTANT_DATA_DIR` 的隔离支持，避免完整 Electron 烟测读取正式用户目录。
- GPT 审阅后收紧作用域：active project 下的模糊审美默认归项目；指代纠正只有唯一候选时才允许 supersede/migrate。
- GPT 复审确认 `BLOCKERS: 0`，P1-2 正式封板；恢复标签为 `v1.1.7-p1.2-cognition-context`。
- 增加 `docs/P1-2-COGNITION-CONTEXT.md` 和 `npm.cmd run test:cognition` 隔离验证入口。

### P1-1 Agent Core

- 新增模型无关的 `TeemoAgentCore` 基础执行循环、Run/Step 状态、统一 Action Contract、取消和最大步骤保护。
- 新增仅内存运行的 `echo`、`get_agent_runtime_info` 安全测试 Tool。
- 保持普通聊天流式输出、模型切换、历史会话、Skill 注入和附件上下文兼容。
- 增加 `docs/P1-1-AGENT-CORE.md` 和 `npm.cmd run test:agent-core` 验证入口。
- GPT 审阅后补齐并发 Run 隔离与非法 Action schema 校验，P1-1 已确认封板。

### P1 前稳定基线

- 更新当前使用 SOP、README 和项目状态文档，统一记录 Teemo助理 v1.1.7、P0 恢复点及 P1 开发入口。
- 扩展 `.gitignore`，预留用户配置、聊天历史、个人 Skill、上传文件、缓存和 Memory/Cognition 数据的保护边界。

### 产品命名

- 产品显示名称、安装包和快捷方式统一为 `Teemo助理`。
- Electron 应用标识更新为 `cn.teemo.assistant`。
- 旧“哈啰设计助手”仅保留在历史安装产物和兼容业务字符串中，不再用于新版本命名。

### 启动图标

- Windows 应用图标、安装包图标和快捷方式图标统一替换为 `D:\Teemo助手\Teemo.png`。

## v1.1.6-p0-closed - 2026-08-09

### 产品命名

- 后续产品显示名称、安装包和快捷方式统一为 `Teemo助理`。
- 旧“哈啰设计助手”仅作为历史安装产物名称，不再用于新版本。

### P0 收尾

- 建立唯一源码基线：`D:\Teemo助手\Teemo机器人项目\Teemo-source`
- 统一 AI、存储、本地文件三个核心 Service 入口
- 增加 `AGENTS.md`，规范多 AI 协作、数据保护、权限边界、Git 和测试流程
- 增加 StorageService 安全写入保护：读取失败不覆盖原文件，JSON 临时文件校验后替换
- 增加多 AI 工作区防覆盖规则
- 完成隔离 Storage、FileService、AIService 和 Electron smoke tests
- 从唯一源码完成 Windows clean install/build/package 验证

### 保留到 P1

- Agent Core
- Tool Calling
- 统一 Permission Layer 实现
- Memory / Teemo Cognition / Agent Creative Profile
- FileTool 写入、Patch、Git 和 Shell 执行能力

### 已知风险

- 当前依赖树 `npm ci` 报告 11 项 audit vulnerabilities（10 high、1 critical），后续单独处理。
- 旧兼容模块和外围存储逻辑暂未删除或完全迁移。
