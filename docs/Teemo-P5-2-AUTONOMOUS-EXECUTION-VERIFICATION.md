# Teemo P5-2 Autonomous Execution & Verification - Taskbook

Status: `TASKBOOK APPROVED / IMPLEMENTATION ALLOWED`

Implementation Status: `CLOSED / PASS / BLOCKERS: 0`

## Gate

- P5-1 Autonomous Planning is `CLOSED / PASS / BLOCKERS: 0` under recovery tag `v1.3.2-p5.1-autonomous-planning`.
- Current version is `1.3.2`.
- External GPT Strict Review: `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / IMPLEMENTATION_ALLOWED: YES / P5_3_STARTED: NO / P5_FINAL_STARTED: NO`.
- P5-2 implementation is authorized only within this approved Taskbook.
- P5-3 Controlled Self-Upgrade and P5 Final Acceptance are `NOT STARTED` and remain blocked.
- This implementation evidence authorizes no release build, installer, installation, restart, close commit, recovery tag, P5-3, or P5 Final Acceptance work.

## Objective

Define one bounded, user-controlled execution path for a valid P5-1 plan:

```text
P5-1 plan
  -> explicit user approval to start one execution run
  -> bounded sequential step execution
  -> owner-bound in-memory state tracking
  -> result verification
  -> finite retry or stop / fail / ask user
```

P5-2 must never turn planning into a background or self-directed agent. A P5-1 plan remains untrusted proposed data until the initiating user explicitly approves a bounded execution run. User approval begins a run; it is not a P1 permission grant and cannot bypass any existing authorization boundary.

## Proposed Execution Path

```text
Owner-bound P5-1 plan
  -> local bounded execution-run validation
  -> explicit user approval of the run
  -> per-step risk confirmation where required
  -> provider-neutral Agent Core action contract
  -> existing Chat Safe File Tool allowlist only
  -> Tool Registry
  -> P1 Permission Layer
  -> File IPC
  -> Main Process FileService
  -> bounded local verification
  -> result / state update, retry, stop, fail, or ask user
```

- The Renderer may request, approve, cancel, or display an owner-bound run. It must not execute filesystem work directly and must not invoke a Tool Registry handler, File IPC handler, or FileService directly.
- A provider may produce only an existing structured native Tool Call. Provider adapters stay provider-neutral and must not own local execution, permission, path resolution, retry policy, or verification authority.
- The existing Agent Core and Tool Registry remain the only route to a Tool. Main Process FileService remains the final filesystem execution boundary.
- P1 authorization is checked for every dispatched Tool request. Local run approval and per-step confirmation are additional lifecycle gates, never substitutes for P1 Permission.

## Allowed Execution Surface

P5-2 may use only the current ordinary Chat Safe File Tool allowlist, without expansion:

- `list_directory`
- `read_file`
- `search_files`
- `search_text`
- `create_file`
- `patch_file`
- `rename_file`
- `create_directory`

Each call must retain its existing Tool Registry schema, P1 risk classification, authorized-root enforcement, canonical path checks, and Main Process FileService behavior. P5-2 must not add a second executor, a second permission model, direct filesystem access, or a path-resolution bypass.

## Run Bounds And State

- Each run is owned by the P5-1 initiating session/window and is in-memory only. It must not persist, resume after restart, migrate to another window, or run without a user-present owner.
- `maxSteps` is mandatory, validated at run creation, and capped at 12. The run cannot add steps or increase the cap after approval.
- `maxRetries` is mandatory, validated at run creation, and capped at 1 per eligible step. It defaults to 0. A side-effecting Tool call must never be retried automatically; a repeat requires a fresh explicit user confirmation and P1 authorization.
- A run and every step have finite validated deadlines. The initial implementation must use a run deadline no greater than 5 minutes and a step deadline no greater than 60 seconds. Deadline expiry aborts pending work and ends the run with `timed_out`.
- An owner may cancel at any time. Cancellation must propagate through Agent Core and P1 pending work where applicable; no queued or later step may dispatch after cancellation.
- The only P5-2 runtime states are `pending`, `awaiting_user_approval`, `awaiting_step_confirmation`, `authorizing`, `running`, `verifying`, `succeeded`, `failed`, `blocked`, `cancelled`, and `timed_out`.
- A failed, denied, cancelled, timed-out, stale, malformed, or unverifiable step stops the run and reports `fail` or `ask user`. It cannot silently continue, select a new goal, add a Tool, or loop.

## User Confirmation And Risk

- The initiating owner must explicitly approve the complete, bounded run before its first step.
- Before each side-effecting Safe File Tool (`create_file`, `patch_file`, `rename_file`, or `create_directory`), the owner must explicitly confirm the exact pending action and target. The confirmation is one-time and invalidates on plan, target, session, or run changes.
- Read-only steps may proceed after run approval, subject to their existing P1 policy. Any P1 `ASK` still requires its existing explicit Permission decision.
- P1 `DENY`, user cancellation, expired confirmation, a stale owner, or an authorization/resource mismatch must prevent execution and cause the run to stop or ask the user. No fallback path is permitted.

## Verification And Retry

- Verification is bounded, tied to the completed step's declared postcondition, and executed only through trusted local boundaries. Renderer verification and provider assertions are insufficient.
- A Tool success result is not presented as a verified run success until its allowed postcondition is confirmed through the existing Tool/Service/Main Process route, or the step is explicitly marked unverifiable and stopped.
- A retry is eligible only for a transient, non-side-effecting verification or read-only failure and only while `maxRetries` remains. Retrying must reuse the same bounded run, step, owner, deadline, and authorization constraints.
- A second failure, exhausted retry budget, denied Permission, mutation uncertainty, or unsupported verification must stop and report the state to the user. It must not rerun mutations, use a different Tool, switch providers, or invent a successful result.

## Required Security Constraints

- No infinite loop, background daemon, watcher, scheduler, autonomous continuation, queue persistence, self-directed goal selection, self-upgrade, P5-3, or P5 Final Acceptance work.
- No arbitrary Shell, PowerShell, `cmd`, process/program execution, Git Tool, Controlled Execute, delete, destructive operation, desktop input/capture, ComfyUI action, network adapter, or new ordinary Chat Tool definition.
- Ordinary Chat Safe File Tool definitions and the existing Native Tool Calling path remain unchanged. P5-2 must not use prompt JSON, simulated Tool Calls, or a provider-specific filesystem executor.
- Provider, plan, Tool arguments, and verification messages are untrusted until validated by their existing boundary. No API key, secret, raw user data directory, or hidden system state may be added to the provider payload.
- P1 authorized roots, canonicalization, traversal/UNC/device/ADS/symlink containment checks, Permission decisions, authorization consumption, and Main Process revalidation remain authoritative.
- Every execution run, confirmation, permission request, Tool call, result, verification, cancellation, timeout, and retry decision must be owner-bound and correlated to the same run and step. Cross-window/session replay fails closed.

## Explicit Non-Goals

- No P5-3 Controlled Self-Upgrade, P5 Final Acceptance, autonomous code modification, dependency installation, installer update, version change, build, installation, restart, or background service.
- No Chat Tool allowlist expansion or ordinary Chat access to Git, Controlled Execute, Shell, PowerShell, arbitrary program execution, delete, destructive operations, desktop control, or ComfyUI.
- No database, Memory/Cognition/Skill/Inspiration fact source, vector store, persistent queue, telemetry, analytics, cloud state, scheduled task, daemon, or cross-session execution history.
- No lowering or replacing P1 Permission, Main Process execution, Tool Registry validation, or Safe File Tool path security.

## Required Acceptance Matrix

| Area | Required proof |
| --- | --- |
| Explicit approval | A valid owner-bound P5-1 plan does not dispatch until the owner explicitly approves one bounded run. |
| Bounded execution | Missing/invalid `maxSteps`, `maxRetries`, timeout, owner, or plan validation fails closed; a run cannot exceed its caps. |
| Existing safe path | An allowed Safe File Tool request follows Agent Core -> Tool Registry -> P1 Permission -> File IPC -> Main Process FileService. Renderer direct filesystem access remains absent. |
| Risk confirmation | A side-effecting Safe File step requires fresh exact owner confirmation and its existing P1 decision before Main Process execution. |
| Verification | A successful Tool result has its declared bounded postcondition confirmed through the trusted local path before it is reported as verified. |
| Deny / cancel / timeout | Denial, cancellation, timeout, stale ownership, or malformed data dispatches no later step and leaves no false success claim. |
| Retry | Retries are capped, never loop, never automatically repeat a side-effecting action, and stop once exhausted. |
| Isolation | Another window/session cannot inspect, approve, cancel, resume, or replay an owner-bound run; restart restores no execution state. |
| Surface limits | Git, Controlled Execute, Shell, PowerShell, programs, delete, destructive operations, desktop, ComfyUI, P5-3, and self-upgrade remain unavailable. |
| Regression | P1/M1, P2, P3, P4, and P5-1 shared-boundary regressions remain pass. |

## Evidence Required Before Implementation Close

```text
P5-2 Autonomous Execution & Verification

STATUS: IMPLEMENTED / WAITING REVIEW

EXPLICIT_RUN_APPROVAL: PASS
MAX_STEPS_ENFORCED: PASS
MAX_RETRIES_ENFORCED: PASS
TIMEOUT_ENFORCED: PASS
CANCEL_ENFORCED: PASS
RISKY_STEP_CONFIRMATION: PASS

AGENT_CORE_PATH: PASS
TOOL_REGISTRY_PATH: PASS
P1_PERMISSION_PATH: PASS
MAIN_PROCESS_EXECUTION: PASS
RESULT_VERIFICATION: PASS
FINITE_RETRY_STOP: PASS
OWNER_SESSION_ISOLATION: PASS

NO_INFINITE_LOOP: PASS
NO_BACKGROUND_DAEMON: PASS
NO_SELF_UPGRADE: PASS
P5_3_STARTED: NO

CHAT_SAFE_FILE_ALLOWLIST_CHANGED: NO
GIT_TOOLS_EXPOSED_TO_CHAT: NO
CONTROLLED_EXECUTE_EXPOSED_TO_CHAT: NO
SHELL_EXPOSED_TO_CHAT: NO
DELETE_EXPOSED_TO_CHAT: NO
RENDERER_DIRECT_FS: NO

TESTS:
- ...

GIT:
branch:
HEAD:
worktree:
```

## Implementation Evidence

```text
P5-2 Autonomous Execution & Verification

STATUS: IMPLEMENTED / WAITING REVIEW

EXPLICIT_RUN_APPROVAL: PASS
MAX_STEPS_ENFORCED: PASS
MAX_RETRIES_ENFORCED: PASS
TIMEOUT_ENFORCED: PASS
CANCEL_ENFORCED: PASS
RISKY_STEP_CONFIRMATION: PASS

AGENT_CORE_PATH: PASS
TOOL_REGISTRY_PATH: PASS
P1_PERMISSION_PATH: PASS
MAIN_PROCESS_EXECUTION: PASS
RESULT_VERIFICATION: PASS
FINITE_RETRY_STOP: PASS
OWNER_SESSION_ISOLATION: PASS

NO_INFINITE_LOOP: PASS
NO_BACKGROUND_DAEMON: PASS
NO_SELF_UPGRADE: PASS
P5_3_STARTED: NO

CHAT_SAFE_FILE_ALLOWLIST_CHANGED: NO
GIT_TOOLS_EXPOSED_TO_CHAT: NO
CONTROLLED_EXECUTE_EXPOSED_TO_CHAT: NO
SHELL_EXPOSED_TO_CHAT: NO
DELETE_EXPOSED_TO_CHAT: NO
RENDERER_DIRECT_FS: NO

TESTS:
- test:autonomous-execution: PASS
- test:autonomous-execution-ui-smoke: PASS
- P1/M1 Tool Registry, Permission, File Tools, Agent Core, and Chat Tool Calling: PASS
- P2 Cognition, Creative, Challenge, Skill, and 32-case routing benchmark: PASS
- P3 Foundation, Isolation, Local Folder, Index, Retrieval, Context, and Eagle: PASS
- P4 Screen, Desktop Action, and ComfyUI Node/Electron: PASS
- P5-1 Autonomous Planning Node/Electron: PASS

GIT:
branch: Teemo/p3-personal-inspiration
HEAD: 8920ae5434cbc45e3ae27be6e7e49ba574d91801
worktree: DIRTY (P5-2 implementation evidence; no close commit/tag)
```

## Review Result

External GPT Strict Review approved this Taskbook with `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / IMPLEMENTATION_ALLOWED: YES / P5_3_STARTED: NO / P5_FINAL_STARTED: NO`. P5-2 implementation may proceed only within this document; P5-3 and P5 Final Acceptance remain `NOT STARTED`.

External GPT Strict Review of implementation evidence returned `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / CAN_CLOSE_AND_TAG: YES / NEXT_STAGE_ALLOWED: P5-3 Taskbook Review only / P5_3_STARTED: NO / P5_FINAL_STARTED: NO`. P5-2 is closed under recovery tag `v1.3.2-p5.2-autonomous-execution-verification`.
