# P1 Agent Foundation Summary

> 状态：P1-1 至 P1-6 本地 Gate 已通过，等待 GPT 整体审阅。此文档在审阅确认前不宣称 P1 CLOSED。

## 交付范围

| Phase | Outcome | Review state |
|---|---|---|
| P1-1 | 模型无关 Agent Run/Step、Action Contract、取消与步数上限 | CLOSED / PASS |
| P1-2 | Teemo Profile、Recent/Project Context、Observation、保守 Cognition 与 Context Builder | CLOSED / PASS |
| P1-3 | 统一 Tool Registry、Schema、Envelope、受控 Context、Abort | CLOSED / PASS |
| P1-4 | Main 中央 Permission Service、once/session/resource、audit、fail closed | CLOSED / PASS |
| P1-5 | 4 read + 3 write Safe File Tools | CLOSED / PASS |
| P1-6A | 4 read + explicit stage + staged-only commit Git Tools | Local Gate PASS |
| P1-6B | npm-declared script + Node-only Controlled Execute | Local Gate PASS |

## 最终运行链路

```text
Provider-neutral Action
  -> TeemoAgentCore
  -> TeemoToolRegistry (schema / toolCallId / abort / envelope)
  -> Main trusted prepare (canonical path + dynamic resource)
  -> TeemoPermissionService (central decision / grant / audit)
  -> one-time Main execution authorization
  -> post-permission revalidation
  -> bounded File / Git / Execute operation
```

两个 renderer 各有稳定 Registry，但权限、授权根、准备操作与真实系统副作用都以 Main 为唯一事实源。

## 正式 Tool 清单

- none：`echo`、`get_agent_runtime_info`
- file read：`list_directory`、`read_file`、`search_files`、`search_text`
- file write：`create_file`、`patch_file`、`rename_file`
- git read：`git_status`、`git_diff`、`git_log`、`git_show`
- git write：`git_stage_files`、`git_commit`
- execute：`run_npm_script`、`run_process`（Node-only）

不存在 delete、任意 shell、cmd、PowerShell、Python、destructive/remote Git、网络服务或 ComfyUI Tool。

## 主要安全不变量

- 模型输入不直接成为 Permission Resource 或 shell command；resource 由 Main canonical policy 生成。
- 所有 read/write/execute Tool 在 handler 前 fail closed；direct IPC、owner spoof、错误 proof 与 replay 不得产生副作用。
- File/Git/Execute 在 Permission 后、真实副作用前重做 canonical/identity/hash 检查。
- create/patch/rename 不覆盖未知内容；Git 只 stage 明确文件、commit 只提交已 staged 内容。
- Execute 只允许可信 Node 与已声明 npm script，`shell:false`、stdin disabled、无 detached process。
- Git read/write 调用统一禁用 hooks、custom hooksPath、fsmonitor、commit signing、external diff/textconv 与 credential interaction；stage/diff 遇到 filter attribute 保守拒绝，避免间接绕过 execute permission。
- 子进程使用最小环境与 secret-name filter，并具有输出上限、ANSI/control 清洗、timeout、Abort 与 process-tree cleanup。
- 正式用户数据、authorized roots、settings、history、Skills、Cognition 与 Projects 没有被测试读取或修改；Electron 验证均使用隔离 profile/data。

## 验证基线

- `test:cognition`、`test:agent-core`、`test:tools`、`test:permissions`、`test:file-tools`、`test:git-tools`、`test:execute`：PASS
- File/Git/Execute 双 renderer Electron 隔离 smoke：PASS
- 完整应用隔离启动 smoke：PASS
- JavaScript syntax 与 `git diff --check`：PASS

## P1 后保留技术债

- Provider 原生 tool-calling adapter 尚未进入正式能力；当前基础设施保持 provider-neutral。
- Permission UI 对 rename source/destination 的展示仍可在后续阶段改善。
- File/Git/Execute 的最终 revalidate 与系统调用之间仍存在操作系统级微小竞态窗口；P1 已做到副作用前立即复核和保守失败。
- 依赖树既有 audit 风险、旧 `js/` 兼容代码与外围存储收敛不属于 P1 Agent Foundation。

## 封板条件

只有在“Teemo助手升级”返回整个 P1 `PASS / BLOCKERS: 0`，且所有要求修正完成并通过回归后，才可创建最终 close commit 与 `v1.2.0-p1-agent-foundation` 标签。
