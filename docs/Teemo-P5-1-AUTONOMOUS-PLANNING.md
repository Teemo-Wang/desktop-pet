# Teemo P5-1 Autonomous Planning - Taskbook

Status: `TASKBOOK APPROVED / IMPLEMENTATION ALLOWED`

Implementation Status: `CLOSED / PASS / BLOCKERS: 0`

## Gate

- P4 Final Acceptance is `CLOSED / PASS / BLOCKERS: 0` under recovery tag `v1.3.2-p4-final-acceptance`.
- Current version is `1.3.2`.
- P5-2 Autonomous Execution / Verification, P5-3 Controlled Self-Upgrade, and P5 Final Acceptance are `NOT STARTED`.
- External GPT Strict Review: `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / IMPLEMENTATION_ALLOWED: YES / P5_2_STARTED: NO / P5_3_STARTED: NO`.
- P5-1 implementation is allowed only within this Taskbook. A separate external GPT Strict Review of implementation evidence is required before a close commit/tag.

## Objective

Add one explicit, provider-neutral Autonomous Planning capability only.

For an explicit user request, Teemo may generate, revise, and discard a bounded session-local plan. A plan describes proposed future work; it does not execute work. Planning output must never represent a Tool call, a permission grant, an execution authorization, or a claim that any step has run.

## Proposed Path

```text
Explicit user planning request
  -> Chat Window planning intent
  -> Teemo Agent Core planning run
  -> AIService / provider-neutral planning adapter (no Tool definitions)
  -> bounded local plan validation
  -> session-local plan view
```

- Planning is opt-in for each request. Ordinary chat must not silently become a planning run.
- Planning provider requests omit Tool definitions. Any unexpected `tool_calls` response is rejected and cannot enter Tool Registry, Permission, IPC, Main Process, or an Agent tool loop.
- A valid plan contains only bounded untrusted data: goal summary, assumptions, constraints, ordered proposed steps, risks, and success criteria.
- Plans are session-local and may be revised or discarded by the initiating user. They do not auto-run, persist as Memory/Cognition/Skill/Project/Inspiration data, resume after restart, or transfer to another window/session.

## Required Constraints

- Planning must not execute any Tool and must not request P1 Permission.
- Planning must not access files, authorized roots, desktop capture/input, ComfyUI, network adapters, processes, Git, Controlled Execute, Shell, PowerShell, `child_process`, program launch, delete, or destructive operations.
- No P4 capability is callable from planning. P4 remains Runtime-only and explicitly user-triggered through its existing paths.
- Existing ordinary Chat Safe File Tool allowlist remains unchanged. No P5 Tool appears in normal Chat definitions.
- Provider-neutral behavior is mandatory. No provider receives a privileged executor, raw local state, credentials, hidden system data, or a provider-specific filesystem/desktop path.
- If a response cannot validate as a bounded plan, Teemo must return a clear planning failure and must not infer execution or synthesize a valid plan from unsafe data.
- A displayed plan step may be `proposed` or `blocked` only. P5-1 cannot mark a step running, completed, authorized, or executed.

## Scope Bounds

- One plan per explicit request, owned by its initiating session/window.
- Goal input: UTF-8, 1 to 2,000 bytes.
- Plan: 1 to 12 ordered steps; each title and description has bounded UTF-8 length; bounded assumptions, risks, and success criteria.
- No background timers, watchers, queue, scheduler, retry loop, autonomous continuation, or self-directed goal selection.
- Automated tests use fake provider responses and isolated temporary profiles only. They use no formal user data, real provider, real filesystem, real display capture/input, ComfyUI/GPU, or user output directories.

## Explicit Non-Goals

- No Autonomous Execution / Verification, P5-2, P5-3, P5 Final Acceptance, or self-upgrade.
- No plan approval that triggers execution, permission request, tool run, filesystem mutation, desktop action, or process launch.
- No Chat Tool allowlist expansion, Agent Tool, Provider tool calling, Git, Controlled Execute, Shell, PowerShell, delete, or destructive operation.
- No database, Vector, embedding, new Memory/Cognition/Skill/Inspiration fact source, persistence, sync, telemetry, analytics, cloud state, or cross-session planning history.
- No version change, installer build, installation, restart, or release work.

## Required Acceptance Matrix

| Area | Required proof |
| --- | --- |
| Explicit intent | Generic chat does not enter planning; only the explicit planning action starts a planning run. |
| Plan-only response | Valid output is bounded and displayed as proposed work only; no Tool call is present or executed. |
| Unexpected tool call | Provider `tool_calls` are rejected before Agent Core tool loop, Registry, Permission, IPC, or Main Process. |
| Failure handling | Invalid, oversized, malformed, cancelled, stale, cross-window, or provider-failed plans fail closed and create no execution side effect. |
| Session isolation | Another window/session cannot read, revise, or discard an owner-bound plan; restart does not restore it. |
| Existing boundaries | No P1 Permission request, FileService call, P4 call, desktop input/capture, ComfyUI transport, process, filesystem, or network side effect occurs. |
| Regression | P1/M1, P2, P3, and P4 shared-boundary regressions remain pass. |

## Evidence Required

```text
P5-1 Autonomous Planning

STATUS: IMPLEMENTED / WAITING REVIEW

EXPLICIT_PLANNING_INTENT: PASS
BOUNDED_SESSION_LOCAL_PLAN: PASS
PLAN_REVISION_AND_DISCARD: PASS
GENERIC_CHAT_PLANNING_BYPASS: PASS
UNEXPECTED_PROVIDER_TOOL_CALL_REJECTED: PASS

TOOL_EXECUTION_DURING_PLANNING: NO
P1_PERMISSION_REQUESTED: NO
FILESYSTEM_SIDE_EFFECT: NO
DESKTOP_SIDE_EFFECT: NO
COMFYUI_SIDE_EFFECT: NO
PROCESS_OR_SHELL_EXECUTION: NO
P4_CAPABILITY_CALLED: NO
SELF_UPGRADE_STARTED: NO

CHAT_SAFE_FILE_ALLOWLIST_CHANGED: NO
GIT_TOOLS_EXPOSED_TO_CHAT: NO
CONTROLLED_EXECUTE_EXPOSED_TO_CHAT: NO
DELETE_EXPOSED_TO_CHAT: NO

P5_2_STARTED: NO
P5_3_STARTED: NO
VERSION_CHANGE: NO
INSTALLER_BUILD_INSTALL_RESTART: NO

TESTS:
- ...

GIT:
branch:
HEAD:
worktree:
```

## Implementation Evidence

P5-1 implementation received external GPT Strict Review: `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / CAN_CLOSE_AND_TAG: YES / P5_2_STARTED: NO / P5_3_STARTED: NO`.

```text
P5-1 Autonomous Planning

STATUS: CLOSED / PASS / BLOCKERS: 0

EXPLICIT_PLANNING_INTENT: PASS
BOUNDED_SESSION_LOCAL_PLAN: PASS
PLAN_REVISION_AND_DISCARD: PASS
GENERIC_CHAT_PLANNING_BYPASS: PASS
UNEXPECTED_PROVIDER_TOOL_CALL_REJECTED: PASS

TOOL_EXECUTION_DURING_PLANNING: NO
P1_PERMISSION_REQUESTED: NO
FILESYSTEM_SIDE_EFFECT: NO
DESKTOP_SIDE_EFFECT: NO
COMFYUI_SIDE_EFFECT: NO
PROCESS_OR_SHELL_EXECUTION: NO
P4_CAPABILITY_CALLED: NO
SELF_UPGRADE_STARTED: NO

CHAT_SAFE_FILE_ALLOWLIST_CHANGED: NO
GIT_TOOLS_EXPOSED_TO_CHAT: NO
CONTROLLED_EXECUTE_EXPOSED_TO_CHAT: NO
DELETE_EXPOSED_TO_CHAT: NO

P5_2_STARTED: NO
P5_3_STARTED: NO
VERSION_CHANGE: NO
INSTALLER_BUILD_INSTALL_RESTART: NO

TESTS:
- `npm.cmd run test:autonomous-planning` PASS
- `npm.cmd run test:autonomous-planning-ui-smoke` PASS; planning request contained no tools and session ownership was isolated
- `npm.cmd run test:agent-core` PASS
- `npm.cmd run test:chat-tool-calling-ui-smoke` PASS
- P1 regression: `test:tools`, `test:permissions`, `test:file-tools`, `test:git-tools`, and `test:execute` PASS
- P2 regression: Cognition, Creative, Challenge, and Skill Node/Electron smoke entries PASS
- P3 regression: Foundation, local folder, metadata index, retrieval, context, Eagle Node/Electron smoke entries PASS
- P4 regression: Screen awareness, controlled desktop actions, and Comfy workflow Node/Electron smoke entries PASS
- `npm.cmd run project:knowledge:verify` PASS
- Node syntax checks PASS for planning, Agent Core, AIService, and Chat Window

GIT:
branch: `Teemo/p3-personal-inspiration`
HEAD: `ceecb407d6e2d7406fab0941355e3286598ecfb5`
worktree: `DIRTY` before the close commit/tag (implementation and status documentation only)
```

## Review Request

External GPT Strict Review result: `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / CAN_CLOSE_AND_TAG: YES / P5_2_STARTED: NO / P5_3_STARTED: NO`.

P5-1 is closed under recovery tag `v1.3.2-p5.1-autonomous-planning`. P5-2, P5-3, and P5 Final Acceptance remain `NOT STARTED` and require separate Taskbooks and Strict Reviews.
