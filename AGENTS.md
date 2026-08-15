# Teemo 私人助理：AI 协作开发规范

本文件是 Teemo 私人助理项目对 Codex、Kiro、Grok 及其他 AI Coding Agent 的统一开发规则。
任何 AI 开始修改代码前必须先读取本文件。若本文件与历史交接文档、旧 README 或旧开发记录冲突，以本文件为准。

## 1. 项目定位

- 项目名称：Teemo 私人助理
- 项目类型：Windows Electron 桌面 AI 助手
- 当前主要方向：个人设计生产力 Agent
- 产品显示名称：`Teemo助理`
- 安装包、快捷方式和后续版本命名统一使用：`Teemo助理`
- 版本标签统一使用 `vX.Y.Z-*`；界面版本、`package.json` / `package-lock.json` 与安装包版本必须等于标签前缀 `X.Y.Z`
- 界面不得硬编码版本号，应通过 Electron `app.getVersion()` 的可信 IPC 读取；正式构建前必须运行 `npm run verify:release-version`
- 启动图标统一使用 `icon/Teemo-app.png`，源文件为 `D:\Teemo助手\Teemo.png`
- “哈啰设计助手”不再是本项目的产品名称；旧业务接口、数据目录和历史文档中的兼容字符串不得用于新版本命名
- 当前稳定版本基线：`v1.1.6-local-baseline`

未来重点能力：

- 多模型 AI
- Agent Core
- Tool Calling
- 本地文件操作
- Memory
- Skill
- ComfyUI
- 设计资产管理
- 个人自动化工作流

当前不再作为重点扩展方向：

- DesignHub
- 钉钉
- 语雀
- 其他公司内部业务能力

这些模块可以在兼容性需要时维护，但新需求默认不扩大其业务范围。

## 2. 唯一源码与目录边界

正式开发源码只有：

```text
D:\Teemo助手\Teemo机器人项目\Teemo-source
```

所有源码修改、分支、提交、测试脚本和架构调整都必须基于该目录。

以下目录禁止作为长期开发源码直接修改：

- `Teemo-app`
- `Teemo-unpacked`
- `app.asar`
- 正式安装目录

这些目录只能用于：

- 运行
- 参考
- 问题排查
- 版本恢复

如果运行版本与源码不一致，先确认实际运行路径和打包内容，再回到 `Teemo-source` 修复。不要直接在构建产物上修补后继续开发。

## 3. 文档优先级

开发规则按以下顺序解释：

1. 本 `AGENTS.md`
2. 用户当前任务中的明确要求
3. 当前 Git 分支、HEAD、worktree、源码、`package.json` 与已执行测试的实际结果
4. `docs/TeemoProjectKnowledge/CURRENT-STATE.md` 的稳定当前项目状态
5. `PROJECT-STATUS.md`、`PROJECT_STATUS.md`、`CONTINUE-HERE-继续优化指南.md` 等历史状态/交接文档
6. README、旧注释和更早的开发记录

`docs/TeemoProjectKnowledge/INDEX.md` 是所有 Teemo 自身开发任务的唯一 Project Knowledge 入口。Git branch、HEAD 与 worktree 是实时工程事实，必须在 Pre-Flight 直接查询；`CURRENT-STATE.md` 内的 Last Verified Git Snapshot 仅作历史记录。历史文档用于了解业务背景、已完成工作和技术债，不自动代表当前状态。发现稳定 Project Knowledge 与 Git、源码、版本或测试结果冲突时，先检查真实状态并修正文档；不得为匹配旧文档而修改业务代码。

## 4. 修改前必须执行的流程

任何 AI 修改代码前必须完成：

1. 先读取 `docs/TeemoProjectKnowledge/INDEX.md`、`CURRENT-STATE.md`、`ROADMAP.md`、`ARCHITECTURE.md` 与 `DECISIONS.md`。
2. 读取本 `AGENTS.md`。
3. 执行并检查 `git status --short`、`git branch --show-current`、`git rev-parse HEAD` 与 `package.json` version。
4. 确认工作区状态：包括已有修改、未跟踪文件和最近提交；同时检查 `CURRENT-TASK.md` 与 `CURRENT-STATE.md` 是否显示其他未完成任务。
5. 阅读与任务直接相关的代码和调用方。
6. 理解现有调用关系、数据格式、权限边界和启动方式。
7. 明确影响范围、验证方式和回滚方式。

在读取 `docs/TeemoProjectKnowledge/INDEX.md` 前，不得修改 Teemo 源码、创建 Taskbook、判断当前阶段、升级版本、创建 commit/tag 或开始下一阶段。

禁止：

- 看到需求后直接大规模修改。
- 没有阅读现有实现就重写模块。
- 为了代码“更漂亮”进行无关重构。
- 覆盖、撤销或删除其他开发者/其他 AI 已有的未提交修改。
- 把构建产物当作源码继续开发。

如果工作区已经有与当前任务相关的修改，先读取并理解这些修改，再在其基础上继续。

## 5. 用户数据保护

项目存在真实用户数据，包括但不限于：

- `settings`
- `chat-history`
- `skills`
- `projects`
- `todos`
- `work-stats`

任何 AI 不得在未获明确授权的情况下：

- 清空用户数据。
- 覆盖用户配置。
- 删除聊天历史。
- 重置 Skill。
- 删除项目或待办。
- 修改正式数据目录中的测试数据。

测试保存、迁移、升级和恢复功能时，优先使用：

- 隔离测试 profile。
- 临时数据目录。
- 数据副本。
- Mock 数据。

测试必须明确记录使用的 profile/目录。除非任务明确要求，不得让测试写入正式用户数据。

## 6. 敏感信息规则

禁止提交、输出、记录或截图暴露以下内容：

- API Key
- Token
- 密码
- Authorization Header
- Cookie、Session 或真实账号凭据

禁止把凭据直接写入：

- 源码
- Git 提交
- 测试文件
- 日志
- README 或其他开发文档

如果发现现有代码、配置或本地数据中存在明文凭据：

1. 只报告风险位置和风险类型。
2. 不要把凭据复制到回复、提交或新文件。
3. 不要擅自删除或修改凭据，避免破坏当前可用配置。
4. 后续由用户决定轮换、迁移或清理方式。

## 7. 开发原则

每次开发优先遵循：

```text
小范围修改
    ↓
保持兼容
    ↓
验证受影响模块
    ↓
再继续下一步
```

默认不采用：

- 整模块重写。
- 一次修改几十个无关文件。
- 无关代码清理。
- 大规模目录迁移。
- 数据库迁移。
- UI 框架替换。

除非用户任务明确要求，否则只处理完成当前目标所必需的范围。额外问题记录为技术债或后续建议，不擅自扩展需求。

新增文件、节点或需要重新命名的项目资产，命名优先使用 `Teemo` 前缀；用户明确指定的文件名（例如 `AGENTS.md`）除外。

## 8. Service 与 Tool 架构

已有底层能力优先通过统一 Service 调用：

- `AIService`
- `StorageService`
- `FileService`

未来 Agent 能力统一进入 `tools/`，建议按职责拆分：

- `FileTool`
- `GitTool`
- `ImageTool`
- `ComfyTool`
- `MemoryTool`
- `ProjectTool`

统一调用关系：

```text
Model
  ↓
Agent Core
  ↓
Tool
  ↓
Service
  ↓
本地系统 / 外部 API
```

规则：

- 不让不同模型分别实现一套本地权限逻辑。
- Tool 负责意图和参数边界，Service 负责稳定的底层能力。
- UI 不应直接复制 Service 的底层实现。
- 新 Tool 必须复用现有 Service，或明确说明为什么需要新增 Service。
- P0 现有系统能力继续遵循各自已有的安全边界；P0 不宣称已经具备统一 Permission Layer。
- P1 开始新增的 Agent Tool，只要涉及本地文件、系统资源或执行能力，就必须经过统一 Permission Layer。
- 禁止未来新增 Tool 绕过 Permission Layer，直接向模型暴露系统能力。

## 9. 权限原则

未来本地 Agent 权限统一由 Permission Layer 管理，至少分为：

### 只读

- 读取文件。
- 搜索文件。
- 分析项目。

### 编辑

- 修改文件。
- 创建文件。
- 应用 Patch。

### 执行

- Shell。
- 安装依赖。
- 执行脚本。
- Git 操作。
- 启动程序。

权限规则：

- 默认从最低权限开始。
- 高风险操作必须有明确的 Permission Layer 检查。
- 模型不能直接获得无限制系统权限。
- 只读阶段不得偷偷增加写入、删除或执行能力。
- 权限拒绝必须返回可理解的原因，不得静默绕过。

## 10. Git 开发规则

新功能优先创建独立分支，不直接在稳定基线分支开发。

示例：

```text
Teemo/agent-core
Teemo/file-tool
Teemo/memory-system
Teemo/comfy-agent
```

分支和提交规则：

- 每次提交尽量保持单一目的。
- 不把多个完全不同的功能塞进一个巨大提交。
- 提交前检查 `git diff`、`git status` 和敏感信息。
- 不使用破坏性 Git 命令覆盖用户修改。
- 未经明确要求，不擅自执行 reset、checkout、clean 或强制推送。

### 多 AI 协作防覆盖规则

- 开始任务前必须运行并阅读 `git status`。
- 发现已有未提交修改时，不得执行 `git reset`、`git clean`、`git checkout` 覆盖文件或擅自 revert。
- 只修改当前任务需要的文件；发现目标文件已有其他未提交修改时，必须保留并基于当前内容继续。
- 提交时只 stage 当前任务的文件，不得顺带提交其他 AI 或开发者的无关修改。
- 如果无法区分修改归属，先停止提交并在交付报告中列出疑点。
- 多 Agent 并行开发扩大后，再评估使用 Git worktree；P0 不要求建立 worktree。

提交示例：

```text
Teemo: add agent tool registry
Teemo: add file read tool
Teemo: add permission check
```

## 11. 修改后的最低验证

任何代码修改后至少执行：

1. 语法检查。
2. 应用启动检查。
3. 受影响功能测试。
4. `git diff` 和 `git status` 检查。

按影响范围补充验证：

- 修改聊天：测试聊天、流式输出和取消。
- 修改 AI：测试 Mock、模型切换和 API 测试入口。
- 修改文件能力：测试授权目录、越界路径和文件类型限制。
- 修改 Storage：使用隔离目录测试读取、保存和旧数据兼容。
- 修改 Skill：测试 Skill 加载、保存、编辑和删除边界。
- 修改 ComfyUI：测试连接、工作流加载和受影响节点调用。
- 修改 Electron 主进程：使用隔离 profile 启动验证。

不要因为局部任务执行全部重型测试，但必须覆盖受影响模块。

## 11.1 Project Knowledge 收尾规则

完成任何 Teemo 源码、维护、架构或项目状态修改后，在交付前必须：

1. 同步 `CURRENT-TASK.md`、`PROJECT-STATUS.md`、相关根目录 `CHANGELOG.md` 与 `docs/TeemoProjectKnowledge/CURRENT-STATE.md`。
2. 如存在重要长期决策，更新 `docs/TeemoProjectKnowledge/DECISIONS.md`；如确认路线变更，更新 `ROADMAP.md`。
3. 执行 `npm.cmd run project:knowledge:sync`。
4. 执行 `npm.cmd run project:knowledge:verify` 并要求 PASS。

同步脚本更新版本、latest recovery tag 与可选的 Last Verified Git Snapshot；Git branch、HEAD、worktree 的实时事实仍由 Pre-Flight 直接查询。它不得自行推断 PASS、CLOSED、BLOCKERS 或下一阶段。`project:knowledge:verify` 直接读取 Git，但不要求历史快照持续等于实时 HEAD/worktree；失败时不得宣称已实施完成。外部 Strict Review、WAITING REVIEW、以及任何外部/本地审核门禁都不再阻止本地 build/install/restart；交付状态统一写 `IMPLEMENTED / DEPLOYED`（仅文档类可写 `DOC ONLY`）。

## 11.2 AI Agent 改版后自动部署为最新安装

```text
EXTERNAL_REVIEW_DEPLOYMENT_GATE: REMOVED
LOCAL_VERIFICATION_GATE: REMOVED
AUTO_DEPLOY_AFTER_CHANGE: ACTIVE
BUILD_AFTER_CHANGE: REQUIRED
INSTALL_AFTER_CHANGE: REQUIRED
RESTART_AFTER_CHANGE: REQUIRED
FORMAL_USER_DATA_PROTECTION: ACTIVE
```

当 AI Coding Agent 完成会进入 Windows 安装包的正式应用代码、资源、依赖或打包配置改版后，**同一任务内必须自动**重新构建安装包、安装到正式位置并重启正式应用，让用户立刻用到最新改动。外部 GPT Strict Review、本地完整测试门禁、WAITING REVIEW 都不再作为部署前置条件。仅文档、测试、开发脚本或 Project Knowledge 变更不触发正式部署。

部署前仍必须遵守的硬安全边界（不是审核门禁）：

1. 正式用户数据与配置不得被清空、覆盖或迁移。
2. 不得把未知或无关 dirty change 混进正式构建输入；无法隔离时停止部署并报告。
3. 不得擅自扩大普通 Chat 的 Shell / Git / Controlled Execute / 删除暴露面。
4. 用户明确要求跳过部署时，可以跳过。
5. 建议做 focused smoke / syntax / `git diff --check`，但这些检查失败时优先修复后继续自动部署，不得以“等待审核”为由停住。
6. 收尾仍需 `project:knowledge:sync` 与 `project:knowledge:verify` PASS。

自动部署顺序：

1. 从唯一源码目录运行 `npm.cmd run dist:win`，使用当前 `package.json` version 生成 `dist\Teemo-${version}-x64.exe`；默认不擅自升级版本号，除非用户明确要求升版。
2. 确认安装包存在，关键改版已进入 packaged `app.asar`，并按改版范围检查所需的 `app.asar.unpacked` 原生依赖。
3. 使用安装包支持的受控无交互方式安装到现有正式安装位置。只允许关闭/替换 Teemo 正式应用文件，不得清空、覆盖或迁移正式用户数据与配置。
4. 从正式安装路径重启 `Teemo助理.exe`，确认进程成功启动，并验证已安装产品版本等于当前 `package.json` version。
5. 在交付报告中记录安装包路径、安装进程退出码、正式可执行文件路径、启动结果和已安装版本。

任何构建、安装或重启步骤失败时必须立即停止后续部署，保留既有安装与用户数据，报告失败阶段和错误；不得宣称已经运行最新版本。

## 12. 交付汇报格式

每次开发任务结束后，AI 必须明确汇报：

- 做了什么。
- 修改了哪些文件。
- 为什么这样改。
- 是否修改数据结构。
- 是否增加配置项。
- 测试了什么。
- 测试结果。
- 当前剩余风险。
- 如何回滚。

不能只回复“已完成”。如果某项验证未执行，必须明确说明原因。

## 13. 基础开发文档

项目应持续维护：

- `AGENTS.md`：当前 AI 协作开发规则，优先级最高。
- `PROJECT-STATUS.md`：项目状态、架构和阶段记录。
- `CHANGELOG.md`：版本变更记录（如项目建立该文件）。
- `docs/`：稳定的架构、测试和操作文档（如需要）。

这些文档至少记录：

- 当前版本。
- 当前架构。
- 已完成功能。
- 正在开发功能。
- 已知问题。
- 下一阶段计划。

历史交接文档不删除。若历史内容过期或与本文件冲突，以本文件为规则来源，并在报告中指出。

## 14. P0/P1 阶段边界

P0-1：确认唯一正确源码并恢复 Git 可追踪基线。
P0-2：整理 AI、存储、本地文件三个核心 Service。
P0-3：建立本 AI 协作开发规范。

P0-3 不增加用户可见功能，不进行基础重构，不继续扩展 DesignHub、钉钉或语雀业务能力。

P0 完成后，下一阶段进入 P1：

- Agent Core
- Tool Calling
- 模型统一调度
- Permission Layer
- File Tool
- 后续本地文件修改与执行能力

在 P1 开始前，仍必须遵守本文件的目录、数据、权限、Git 和验证规则。

## 15. P0-3 完成标准

P0-3 完成时必须满足：

- 项目根目录存在 `AGENTS.md`。
- 唯一源码路径明确。
- AI 开发前检查流程明确。
- 用户数据保护规则明确。
- 敏感信息规则明确。
- Git 分支与提交规则明确。
- Service/Tool 关系明确。
- 权限分级原则明确。
- 测试和交付要求明确。
- 旧状态文档已检查，冲突以本文件为准。
