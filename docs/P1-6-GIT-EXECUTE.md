# P1-6 Git + Controlled Execute

> 当前状态：P1-6A Git Tools Gate 与 P1-6B Controlled Execute 本地 Gate 均已通过，正在等待整个 P1 总审阅。P1-6 是 P1 最后阶段，总审阅确认前不进入 P2。

## P1-6A Git Tools

正式 Git Tool 只有：

| Tool | Permission | 边界 |
|---|---|---|
| `git_status` | read | 结构化 branch/head/staged/unstaged/untracked/ahead/behind |
| `git_diff` | read | working tree 或 staged，可限制单文件，输出有界 |
| `git_log` | read | 最多 100 条本地历史 |
| `git_show` | read | 固定解析后的 commit，可限制单文件，输出有界 |
| `git_stage_files` | write | 只暂存明确列出的 repository-relative regular files 或 tracked deletion |
| `git_commit` | write | 只提交调用前已经 staged 的内容，不自动 add |

不存在 reset、clean、checkout、restore、rebase、merge、cherry-pick、revert、push、pull、fetch、删除分支/标签或任何远程 Tool。

### Repository 与权限边界

- repo 输入先经过 `TeemoFileService` 的 authorized-root/realpath containment。
- Main 使用固定 `git rev-parse` 找到 top-level 与 absolute git-dir；两者必须都在授权根，且 git-dir 必须位于 repo 内。外置 worktree/git-dir 保守拒绝。
- 模型 raw path 不进入 Permission。Main 生成 `git+file:///D:/...` 可信 resource。
- prepared operation 绑定 `webContents.id`、toolCallId、session、tool、permission 与 resource；真实操作前必须消费 PermissionService 一次性 execution authorization。
- Permission 后重新验证 repo/git-dir canonical path 与 filesystem identity；stage 还复核每个文件 path/existence/identity/sha256，commit 复核 HEAD 与 staged tree。变化返回 `GIT_RESOURCE_CHANGED`。
- prepare 阶段的只读 Git 探测也支持 toolCallId 级取消；执行中 abort/timeout 终止 process tree。

### Git 进程策略

- 只使用 `spawn(git, explicitArgs, { shell:false })`，不拼接 shell string，不调用 cmd/PowerShell。
- 所有正式 Git 调用都经过同一个 Safe Git Invocation Policy；固定 `--no-pager`、禁颜色、禁 external diff/textconv、禁交互凭据提示。
- 每次调用以命令级配置绑定 Teemo 创建并校验为空的独立 hooks 目录，同时设置 `core.fsmonitor=false`、`commit.gpgSign=false`、清空 credential helper 与 external diff；不修改仓库或用户永久 Git config。
- `git_stage_files` 在 prepare、授权后 revalidate 和 `git add` 前均以相同 Safe Policy 调用 `git check-attr -z filter`。显式文件的 `filter` 只允许 `unspecified`/`unset`；其他值返回 `GIT_EXTERNAL_FILTER_NOT_ALLOWED`。显式 `git_diff` 与 repo-wide diff 选出文件后也执行同一检查。
- 因此 read/write Git Tool 不会通过 repository/user 配置的 hooks、custom `core.hooksPath`、clean/process filter、fsmonitor、commit signing、external diff/textconv 或 credential interaction 间接获得 execute 能力。
- 环境使用最小允许列表并按 API_KEY/TOKEN/AUTHORIZATION/PASSWORD/SECRET 名称再次过滤。
- stdout/stderr 均有 byte limit，所有操作有 timeout 与 Abort；Windows 通过内部 `taskkill /T /F` 终止测试进程树，该机制不暴露为 Tool。
- Git stderr、Node errno 与 stack 不直接返回模型；输出移除 ANSI 和危险控制字符。
- commit 不修改 user.name/email/config，不使用 `--no-verify`，不自动签名或修改历史。

### Stage / Commit Contract

`git_stage_files` 拒绝绝对路径、`..`、`.`、`.git`、pathspec magic、wildcard、目录、重复项和 repo/root 外路径；最终只调用 `git add -- <explicit files...>`。文件内容在 Permission 等待期间变化会被 hash 复核拦截。

`git_commit` 将换行压成单行，限制 200 字符并拒绝其他控制字符。prepare 时必须已有 staged files；Permission 后 HEAD 或 staged tree 改变即拒绝。执行只调用 `git commit -m <message>`，不会 stage 当前 working tree/untracked files。

### P1-6A Gate 结果

- `npm.cmd run test:git-tools`：PASS
- `npm.cmd run test:file-tools`：PASS
- `npm.cmd run test:permissions`：PASS
- `npm.cmd run test:tools`：PASS
- `npm.cmd run test:agent-core`：PASS
- `npm.cmd run test:cognition`：PASS
- 受影响 JavaScript `node --check`：PASS
- `git diff --check`：PASS

`tests/TeemoGitTools.test.js` 使用临时 repo，覆盖 status/diff/log/show、输出截断、显式 stage、commit 不自动 add、未暂存拒绝、repo/root/pathspec/symlink 边界、文件 TOCTOU、Permission deny、动态 canonical resource、Main owner/direct IPC/replay、abort、timeout、process-tree 清理与 repo identity 替换。新增恶意 repo 断言：普通 hooks、自定义 `core.hooksPath`、commit signing program、fsmonitor program 都不会产生 marker；配置 clean filter 的文件在 stage/diff 前以 `GIT_EXTERNAL_FILTER_NOT_ALLOWED` 拒绝且 marker 为 0。没有对 `Teemo-source` 做 Git 写测试。

Electron 双 renderer 烟测使用：

```text
C:\Users\Teemo\Documents\Codex\2026-08-09\w\work\Teemo-P1-6A-git-smoke-final-20260809
```

独立 profile/data 与临时 repo 输出 `TEEMO_GIT_TOOLS_ELECTRON_SMOKE_PASS`；验证两个 renderer 的 6 个 Definition 一致、中央 session grant、deny、explicit stage、commit staged only、abort/late allow。未读取或修改正式 authorized roots、settings、history、Cognition、Skills 或 Projects。

最终 Safe Git Policy 补丁另在 `C:\Users\Teemo\Documents\Codex\2026-08-09\w\work\Teemo-P1-6-git-policy-smoke-20260809` 重新执行相同隔离 smoke，并再次输出 PASS marker。

完整应用另使用 `C:\Users\Teemo\Documents\Codex\2026-08-09\w\work\Teemo-P1-6A-app-smoke-20260809` 的隔离 profile/data 启动 10 秒，Main Git Service/IPC 与两套生产 Registry 初始化无新增错误；只有既有 CSP 警告和隔离环境缺少语雀配置的预期提示。

## P1-6B Controlled Execute

正式 Execute Tool 只有：

| Tool | Permission | 边界 |
|---|---|---|
| `run_npm_script` | execute | 只运行 authorized project 根 `package.json` 已声明的单个 script |
| `run_process` | execute | 只运行 Main 解析的可信 Node.js 与 cwd 内单个 `.js/.cjs/.mjs` 文件 |

没有任意 shell Tool，也没有 Git、cmd、PowerShell、Python、网络服务、detached process 或任意 executable 字符串入口。`run_process.executable` 的 Schema 与 Main policy 都只接受 `node` / `node.exe`。

### Execute 权限与 TOCTOU

- cwd/project 先通过既有 `TeemoFileService` authorized-root/realpath containment；Node script 还必须位于 cwd 内且是普通文件。
- Main 查找 PATH 中的 canonical Node；npm 通过同一 Node 安装目录内的 `npm-cli.js` 启动，避免 Windows 对 `.cmd` 使用 shell。
- Main 生成可信 `exec+file:///` resource，查询参数绑定 operation、canonical executable、npm CLI（适用时）、npm script 名、`package.json` hash、声明命令 hash，或 Node script 相对路径与 hash。
- `TeemoResourceMatcher` 保留完整 query；execute session grant 只匹配完全相同的 operation/resource，不会把同 cwd 的另一个脚本或变更后的 hash 一并放行。
- prepared operation 绑定 renderer owner、toolCallId、run/session、tool、permission 与 resource；真实执行前必须消费中央 Permission Service 的一次性 execution authorization，直接 IPC、错误 owner、伪造 proof 与 replay 都会失败。
- Permission 后重新解析并逐项比较 cwd、Node/npm canonical identity、package/script identity/hash、声明命令 hash、参数与 resource。任何变化统一返回 `EXECUTION_RESOURCE_CHANGED`，且不会启动进程。

### Process Policy

- 只使用 `spawn(canonicalNode, explicitArgs, { shell:false, detached:false })`；stdin 为 `ignore`，不拼接 shell command。
- `run_npm_script` 只接受 `package.json.scripts` 中实际存在的名称；参数在 `--` 后传递，并拒绝 shell metacharacters 与控制字符。
- 环境变量为最小 allowlist，并再次按 API_KEY/TOKEN/AUTHORIZATION/PASSWORD/SECRET 名称过滤；合成 secret 泄漏测试为 PASS。
- timeout 上限 120 秒；stdout 1 MiB、stderr 256 KiB，达到限制立即终止进程树；输出移除 ANSI 与危险控制字符。
- Abort、timeout 与 output limit 都会清理完整进程树；Windows 内部使用 `taskkill /T /F`，但该能力不暴露为 Tool。
- 模型只收到稳定错误码和安全消息，不返回 errno、stack 或未清洗的内部错误。
- `execute` 是明确的高风险代码执行授权，不等同于文件系统或网络 OS sandbox；npm/Node 用户代码的能力边界在 Permission UI 与最终技术债中明确记录。

### P1-6B Gate 结果

- `npm.cmd run test:execute`：PASS
- `npm.cmd run test:permissions`：PASS（含完整 execute query resource 绑定）
- `npm.cmd run test:git-tools`：PASS
- `npm.cmd run test:file-tools`：PASS
- `npm.cmd run test:tools`：PASS
- `npm.cmd run test:agent-core`：PASS
- `npm.cmd run test:cognition`：PASS
- 受影响 JavaScript `node --check`：PASS
- `git diff --check`：PASS

`tests/TeemoExecuteTools.test.js` 覆盖 npm/Node 正常执行、未声明脚本、非法 package、非 Node executable、cwd/root/extension 边界、参数限制、package/script TOCTOU、敏感环境过滤、输出清洗与上限、timeout、Abort、process-tree 清理、Definition 权限、Permission deny、Main owner/direct IPC/replay。

Electron 双 renderer 烟测使用：

```text
C:\Users\Teemo\Documents\Codex\2026-08-09\w\work\Teemo-P1-6B-execute-smoke-final2-20260809
```

隔离 profile/data 输出 `TEEMO_EXECUTE_TOOLS_ELECTRON_SMOKE_PASS`；验证两个 renderer 的 2 个 Definition 一致、中央精确 session grant、allow-once 第二次重新询问、deny、真实 npm/Node 运行、timeout、abort/late allow，以及 `package.json` 在 Permission 等待期变化后 `EXECUTION_RESOURCE_CHANGED` 且 process starts 不增加。

完整应用使用 `C:\Users\Teemo\Documents\Codex\2026-08-09\w\work\Teemo-P1-6B-app-smoke-20260809` 隔离 profile/data 启动 10 秒，Main Execute Service/IPC 与两套生产 Registry 初始化无新增错误；仅出现既有 CSP 警告与隔离环境缺少语雀配置的预期提示。
