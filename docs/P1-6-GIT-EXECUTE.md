# P1-6 Git + Controlled Execute

> 当前状态：P1-6A Git Tools Gate 已通过；P1-6B Controlled Execute 待实现。P1-6 是 P1 最后阶段，完成后必须等待整个 P1 总审阅，不进入 P2。

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
- 固定 `--no-pager`、禁颜色、禁 external diff/textconv、禁交互凭据提示。
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

`tests/TeemoGitTools.test.js` 使用临时 repo，覆盖 status/diff/log/show、输出截断、显式 stage、commit 不自动 add、未暂存拒绝、repo/root/pathspec/symlink 边界、文件 TOCTOU、Permission deny、动态 canonical resource、Main owner/direct IPC/replay、abort、timeout、process-tree 清理与 repo identity 替换。没有对 `Teemo-source` 做 Git 写测试。

Electron 双 renderer 烟测使用：

```text
C:\Users\Teemo\Documents\Codex\2026-08-09\w\work\Teemo-P1-6A-git-smoke-final-20260809
```

独立 profile/data 与临时 repo 输出 `TEEMO_GIT_TOOLS_ELECTRON_SMOKE_PASS`；验证两个 renderer 的 6 个 Definition 一致、中央 session grant、deny、explicit stage、commit staged only、abort/late allow。未读取或修改正式 authorized roots、settings、history、Cognition、Skills 或 Projects。

完整应用另使用 `C:\Users\Teemo\Documents\Codex\2026-08-09\w\work\Teemo-P1-6A-app-smoke-20260809` 的隔离 profile/data 启动 10 秒，Main Git Service/IPC 与两套生产 Registry 初始化无新增错误；只有既有 CSP 警告和隔离环境缺少语雀配置的预期提示。

## P1-6B Controlled Execute

待实现。生产范围将优先只开放 `run_npm_script`；如果开放 `run_process`，只能执行 Main policy 解析的 Node + authorized-root 内 `.js/.cjs/.mjs`，不得包含 Git、cmd、PowerShell、Python 或任意 executable/shell string。
