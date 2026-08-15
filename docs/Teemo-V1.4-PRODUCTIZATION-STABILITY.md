# Teemo V1.4 Productization & Stability - Taskbook

Status: `TASKBOOK APPROVED / IMPLEMENTATION ALLOWED`

Implementation Status: `IMPLEMENTED / STRICT REVIEW PASS / DEPLOYED`

Route-Specific Tool Exposure Follow-up: `IMPLEMENTED / DEPLOYED / REVIEW NOT REQUIRED`

Blocked Plan Semantics Maintenance: `IMPLEMENTED / DEPLOYED`

## Active Local Deployment Policy — 2026-08-12

```text
EXTERNAL_REVIEW_DEPLOYMENT_GATE: REMOVED
LOCAL_VERIFICATION_GATE: REMOVED
AUTO_DEPLOY_AFTER_CHANGE: ACTIVE
BUILD_AFTER_CHANGE: REQUIRED
INSTALL_AFTER_CHANGE: REQUIRED
RESTART_AFTER_CHANGE: REQUIRED
FORMAL_USER_DATA_PROTECTION: ACTIVE
```

The historical review/deployment sequence recorded below remains evidence of how V1.4 was originally delivered. It no longer defines the active local deployment gate. After a packaged-application change, auto build/install/restart is required in the same task; external review and local verification suites are not prerequisites.

## Gate

- P0-P5 are closed. P5 Final Acceptance is closed under `v1.3.2-p5-final-acceptance`.
- M1 Native Tool Calling is available. M2 Authorized Root Discovery & Grounding is deployed; its focused argument-normalization follow-up is `IMPLEMENTED / WAITING REVIEW / USER-AUTHORIZED DEPLOYMENT COMPLETE` and must complete its external review/closure without being mixed into a V1.4 close commit.
- Current source version is `1.3.2`. This Taskbook does not authorize a version bump.
- External GPT Strict Review: `STATUS: PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / IMPLEMENTATION_ALLOWED: YES`.
- V1.4 implementation remains limited to this Taskbook. The recorded second external Strict Review remains closure history, not an active local deployment prerequisite.
- Local build, installation, and restart use the current `AGENTS.md` verification gate. External review remains optional/recommended for closure and release/tag review.

## Objective

Productize the already-closed P0-P5 capabilities and deployed M2 path so ordinary Chat uses them reliably and explains their state naturally.

V1.4 adds no new core capability. It only makes existing capability awareness, intent selection, Tool contracts, user-facing errors, and execution-state presentation consistent across the current ordinary Chat path.

```text
natural-language user request
  -> provider-safe capability snapshot
  -> deterministic local intent route
  -> one existing path only
       normal chat
       existing Safe File Tool loop
       existing Inspiration Context retrieval
       existing P5-1 planning
       existing P5-2 autonomous execution
  -> existing Agent Core / Tool Registry / P1 / IPC / Main boundary
  -> normalized user-facing state or error
```

## Current Codebase Grounding

The minimal path is based on the current source, not a future architecture:

- `Teemo-chat-window/Teemo-chat-window.js` currently chooses planning only from the one-shot `planningMode` button, calls `runPlanning`, injects the M2 root summary, invokes `runNativeTools`, shows raw `error.message`, and owns the existing plan execution confirmation UI.
- `src/agent/TeemoAgentCore.js` already prepares Cognition, Creative, Challenge, Skill, and Inspiration context; exposes native Tool Calling; records normalization results; runs bounded planning; and provides the P5-2 Safe File action bridge.
- `src/inspiration/TeemoInspirationContextBuilder.js` already has an explicit, local-only inspiration intent gate and returns bounded untrusted metadata context.
- `src/execution/TeemoAutonomousExecution.js` already owns bounded, owner/session-bound execution, explicit run approval, exact write confirmation, P1 authorization, verification, cancellation, timeout, and terminal results.
- `src/tools/TeemoToolRegistry.js` already runs `normalizeArguments` before schema validation, then Permission and handler execution. Its validator must remain strict.
- `src/tools/file/TeemoFileTools.js`, `TeemoFileClient.js`, `TeemoFileToolIpc.js`, and `TeemoAuthorizedRootGrounding.js` already define and enforce the M2 structured path contract through Main.
- Current internal states and messages are inconsistent across Agent Core, P5-2, planning, permission, and Chat UI. This Taskbook adds a public mapping; it does not replace those internal state machines.

## Minimal Change Path

Add one small provider-neutral module, proposed as `src/agent/TeemoChatProductization.js`, with four pure responsibilities:

1. Build a bounded provider-safe capability snapshot from actual runtime availability.
2. Classify one user message into one V1.4 route.
3. Normalize known error codes into a small user-facing taxonomy.
4. Map existing internal run states into the unified public execution states.

Wire that module into the existing Chat Window and existing Agent/P5 callbacks. Do not add an execution engine, service, Tool, IPC channel, database, or persistent state.

Expected implementation touch set:

- Add `src/agent/TeemoChatProductization.js`.
- Load it from `Teemo-chat-window/Teemo-chat-window.html` in the existing dependency order.
- Make focused changes in `Teemo-chat-window/Teemo-chat-window.js` to select existing routes, inject capability context, reuse the existing plan execution flow, and show normalized public state/errors.
- Change `src/agent/TeemoAgentCore.js` only if a minimal state callback is required; do not rewrite its loops or contracts.
- Keep M2 runtime modules unchanged unless a contract-drift test proves a real mismatch. Validator relaxation is forbidden.
- Add focused Node and isolated ordinary Chat Electron E2E tests, plus package scripts using `Teemo`-prefixed test names.

Any implementation proposal that requires a new Service, Tool, IPC operation, persistence schema, provider-specific router, or broad Chat Window rewrite is outside this Taskbook and must stop for review.

## 1. Capability Awareness

Ordinary Chat receives a bounded system context derived from actual objects available in the current window, not from aspirational product claims.

The snapshot may describe only:

- ordinary chat;
- the existing eight Safe File Tools when the current Registry exposes them;
- authorized-root discovery availability without absolute root paths;
- existing explicit Inspiration retrieval availability;
- existing P5-1 planning availability;
- existing P5-2 execution availability and whether the current session has a valid plan;
- the fact that Runtime remains a separate advanced/debug entry for existing P4 paths.

Requirements:

- Capability availability is computed locally before the Provider request.
- The model is told to use available existing capability paths and not falsely claim it cannot access them.
- The model is also told that capability awareness is not permission: P1 and explicit execution confirmations remain authoritative.
- No credentials, absolute authorized-root path, formal user-data path, permission grant, execution authorization, internal stack, hidden IPC data, Runtime screenshot, or local source bytes enter the capability context.
- Unavailable capabilities are described honestly. The snapshot must never invent a Tool, source, plan, or grant.
- Provider output cannot override the route, Permission Layer, normalization, validator, or Main boundary.

## 2. Intent Routing

Implement one deterministic local classifier over the current user message and current session facts. It must not call a Provider merely to choose the route.

Public routes:

| Route | Trigger and existing destination |
| --- | --- |
| `normal_chat` | Default when no explicit supported intent matches; existing ordinary Chat Provider path. |
| `safe_file_operation` | Explicit read/list/search/create/patch/rename/create-directory request; existing native Safe File Tool loop only. |
| `inspiration_retrieval` | Existing explicit Inspiration intent; existing bounded `TeemoInspirationContextBuilder` path. |
| `planning` | Explicit natural-language planning request or existing one-shot planning button; existing `runPlanning` no-Tool path. |
| `autonomous_execution` | Explicit request to execute the current valid session plan; existing `TeemoAutonomousExecution` path and confirmations. |

Routing rules:

- Explicit UI selection remains authoritative for that one request.
- Explicit `autonomous_execution` requires a current valid owner-bound plan. Without one, return a normalized `invalid_request` asking the user to create a plan first; do not silently plan and execute in one turn.
- Explicit planning wins over execution/file keywords inside the goal because planning must remain Tool-free.
- A direct Safe File operation wins over the legacy local-document attachment shortcut so ordinary language can reach Native Tool Calling. Attachments retain their existing behavior when the request is not a Safe File operation.
- Inspiration routing reuses the existing explicit intent logic and must not turn generic mentions of “reference” into retrieval when intent is ambiguous.
- Ambiguous requests fall back to `normal_chat` or ask one natural clarification. They do not dispatch multiple capability paths.
- One input produces one top-level route. Skill routing and other existing context builders may still run inside the selected existing path where already allowed.
- The route result is bounded, session-local, non-persistent metadata. It is not a Tool call, permission, or execution authorization.

## 3. Tool Contract Stabilization

The authoritative Safe File flow remains:

```text
Provider Tool Definition
  -> native tool_call arguments
  -> trusted argument normalization
  -> Tool Registry schema validation
  -> runtime grounding/validation
  -> P1 Permission
  -> File IPC
  -> Main FileService
```

Required invariants:

- Provider-facing Tool definitions are generated from `TeemoToolRegistry.listDefinitions()` and remain exactly the current eight Safe File Tools.
- A resolved structured target reaches Registry validation/execution as `rootId + relativePath`, never `rootId + rootReference`, and never with legacy `path`.
- An unresolved exact reference may enter trusted grounding as `rootReference + relativePath`, then must canonicalize before execution.
- Exact absolute `path` remains compatibility input only and must be grounded against current P1 roots before execution.
- Provider definition, normalization output, Registry schema, runtime validator, IPC preparation, and Main FileService contract receive automated drift checks.
- Conflict arguments cannot bypass normalization or enter Permission/handler execution.
- `additionalProperties: false`, exact-one root selection, P1 boundaries, link containment, traversal/UNC/device/ADS denial, and fail-closed behavior remain unchanged.
- Do not solve a mismatch by widening a schema, weakening a validator, duplicating grounding in Renderer, or accepting unknown arguments.

## 4. Error Normalization

Add a code-first public error adapter. Internal errors retain safe diagnostic codes for tests/development, while ordinary UI and stored Chat history receive only a bounded category and natural message.

Required public categories:

| Public category | Includes |
| --- | --- |
| `permission_denied` | Explicit user denial or insufficient current grant. |
| `permission_timeout` | Permission prompt expired. |
| `file_not_found` | Current authorized target does not exist or became unavailable. |
| `invalid_request` | Unsupported/malformed route or Tool arguments after safe normalization/validation. |
| `provider_unavailable` | Missing Provider configuration, unavailable native Tool Calling/planning adapter, network/HTTP Provider failure. |
| `execution_failed` | Existing operation failed after valid routing/authorization and is not a more specific category. |
| `verification_failed` | Trusted postcondition or P5-2 verification could not be confirmed. |

Requirements:

- Mapping is code-first with a conservative safe fallback. Message-regex matching may only be a compatibility fallback for legacy AIService errors without codes.
- Cancellation is represented by the unified `cancelled` state and a natural cancellation message, not as a failure stack.
- Ordinary UI must not display `arguments.path is required`, schema paths, IPC channel names, stack traces, native exception details, authorization IDs, absolute hidden paths, or Provider response bodies.
- Raw internal errors are not inserted into Provider follow-up context or persisted as normal Chat content.
- Permission denial/timeout, invalid request, and Provider unavailability are actionable and must not be mislabeled as “file not found.”

## 5. Unified Execution State

Expose exactly these public states to ordinary Chat UI:

```text
idle
planning
waiting_permission
running
verifying
succeeded
failed
cancelled
```

This is a presentation adapter over existing internal states. It does not rewrite P5-2, Agent Core, Permission, upgrade, or Runtime state machines.

Minimum mapping:

- no active request -> `idle`
- P5-1 request in progress -> `planning`
- P1 permission prompt, whole-run approval, or write-step confirmation -> `waiting_permission`
- Provider processing, Tool preparation/execution, or P5-2 running/authorizing -> `running`
- trusted P5-2 postcondition check -> `verifying`
- completed Chat/plan/execution with required verification -> `succeeded`
- terminal non-cancel error, timeout, or blocked invalid state -> `failed`
- owner/user abort -> `cancelled`

Requirements:

- State transitions are monotonic for one request and bound to the initiating session.
- A stale callback from another/previous run cannot overwrite the active request state.
- `succeeded` is shown only after the selected existing path has really completed; autonomous mutations require trusted verification.
- No state is persisted as a new fact source or resumed after restart.

## 6. Chat-first UX

- Natural-language planning and execution requests may enter their already-existing paths from ordinary Chat.
- Safe File and Inspiration requests remain ordinary Chat-first and retain current security gates.
- Existing planning and plan-action buttons remain usable as explicit controls.
- Runtime remains available for its existing advanced/debug P4 entry points. V1.4 does not delete, merge, or broadly refactor Runtime.
- Chat shows a short route/state phrase only when useful. It does not expose internal architecture jargon to ordinary users.
- The current welcome copy may be updated to accurately mention existing safe file, Inspiration, planning, and approved-plan execution behavior without promising excluded capabilities.

## Security And Compatibility Boundaries

- Ordinary Chat Tool allowlist remains exactly eight Safe File Tools.
- No new Tool, File Tool, Permission type, IPC capability, Main capability, source connector, execution engine, or Provider capability.
- P1 authorized roots and Permission Layer remain Sources of Truth.
- Renderer performs no privileged filesystem I/O and receives no new privileged path.
- Provider cannot grant permission, approve execution, choose a hidden root, or mark verification successful.
- Existing Cognition, Creative Profile, Challenge, Skill, Project, Inspiration, and Project Knowledge fact sources remain independent.
- No persistence schema, formal user data, settings migration, dependency, installer configuration, or version change.
- Existing M1/M2/P1/P5 tests remain authoritative regression gates.

## Explicit Non-Goals

- No new ComfyUI Workflow.
- No Vision or OCR.
- No new Desktop Action.
- No Photoshop, Blender, or Figma integration.
- No new Inspiration Source.
- No Embedding or Vector database.
- No new Safe File Tool.
- No ordinary Chat exposure of Git, Shell, PowerShell, Controlled Execute, delete, arbitrary programs, or destructive operations.
- No self-upgrade permission expansion or Chat-first self-upgrade route.
- No P6-level capability, multi-agent orchestration, background agent, scheduler, watcher, autonomous goal selection, or recursive execution.
- No broad Agent Core, Runtime, Chat Window, IPC, or Service rewrite for future architecture.

## Implementation Sequence After Approval

1. Establish focused contract tests against the current behavior and required boundaries.
2. Add the pure `TeemoChatProductization` module and Node tests for capability, routing, errors, and state mapping.
3. Wire capability awareness and deterministic route selection into the existing Chat send path.
4. Extract/reuse the current plan execution action so explicit Chat intent and the existing button invoke the same bounded P5-2 flow.
5. Apply public error/state normalization at the Chat presentation boundary.
6. Add contract-drift tests across Provider definitions, normalization, Registry, IPC, and Main preparation without relaxing validators.
7. Add isolated ordinary Chat Electron E2E and run affected M1/M2/P1/P3/P5 regressions.
8. Update Project Knowledge; external Strict Review may be requested for closure or release review.
9. After the complete local gate passes, follow the active post-change deployment rule to rebuild, verify packaged content, preserve formal user data, install, restart, and verify the formal version.

## Required Acceptance Matrix

| Area | Required proof |
| --- | --- |
| Capability awareness | Provider receives only the accurate bounded capability snapshot and does not falsely deny an available tested path. |
| Normal chat | Generic conversation selects `normal_chat`, makes no Tool/Permission/Inspiration/Planning/Execution call, and replies normally. |
| Safe file | Natural-language read and one write case select the existing native Safe File path; P1 and exact write confirmation boundaries remain unchanged. |
| Inspiration | Explicit request selects existing local retrieval; generic “参考一下” ambiguity does not silently retrieve. |
| Planning | Natural-language planning enters existing no-Tool P5-1 path; attachment and unexpected Tool-call rules remain fail closed. |
| Autonomous execution | Explicit execute-current-plan intent reuses the existing P5-2 approval/confirmation/verification flow; no valid plan produces `invalid_request` and zero execution. |
| Tool contract | Captured Provider definition, raw mixed arguments, normalized arguments, Registry input, IPC preparation, and Main execution prove canonical contract and reject bypass. |
| Errors | Each required public category is shown without schema/IPC/stack leakage; cancellation is distinct. |
| State | All eight public states and session/run stale-update rejection pass. |
| Chat-first UX | Existing capability can be initiated naturally in ordinary Chat; existing explicit controls and Runtime remain available. |
| Boundaries | Tool count/allowlist, P1, Main, Provider neutrality, persistence, formal data, version, and all explicit non-goals remain unchanged. |

## Required Real Ordinary Chat E2E

Use an isolated Electron profile, synthetic authorized root/files, fake Provider adapters, and no formal user data. Capture actual route, Provider messages/Tool definitions, normalized native arguments, P1/IPC/Main calls, state transitions, user-visible text, and second Provider response.

At minimum cover:

1. `你好，今天帮我梳理一下思路` -> `normal_chat`.
2. `读取 Teemo-source 下的 docs/TeemoProjectKnowledge/INDEX.md` -> `safe_file_operation` -> canonical `rootId + relativePath` -> file result -> second Provider response.
3. One Safe File write request -> explicit P1/write confirmation -> execution; denial and timeout variants do not execute.
4. `从我的灵感库找一些极简科技海报参考` -> `inspiration_retrieval` with bounded metadata only.
5. `先规划一下如何整理这个项目，不要执行` -> `planning`, no Tool definitions/calls.
6. `执行刚才的计划` with a valid current plan -> `autonomous_execution` and existing bounded approval/verification.
7. The same execution request without a valid plan -> `invalid_request`, Tool/Permission/Main calls zero.
8. Inject schema, IPC, Provider, file-not-found, permission, execution, and verification failures; UI shows only normalized public messages.

## Required Regression And Verification

- New focused Node suite for `TeemoChatProductization`.
- New isolated real ordinary Chat Electron E2E for all five routes, public states, and error leakage denial.
- M2 argument-normalization Node and Electron E2E.
- M1 Native Tool Calling ordinary Chat Electron E2E.
- Tool Registry, Agent Core, Permission, Safe File Tools Node and Electron regressions.
- P3 Inspiration retrieval/context Node and Electron regressions.
- P5-1 planning and P5-2 execution Node and Electron regressions.
- Chat launch/stream/cancel regression.
- `npm.cmd run verify:release-version`.
- `npm.cmd run project:knowledge:sync` and `npm.cmd run project:knowledge:verify`.
- Syntax checks and `git diff --check`.
- Automated tests must use isolated profiles/synthetic data and report `FORMAL_USER_DATA_TOUCHED: NO`.

## Evidence Required Before Implementation Review

```text
Teemo V1.4 Productization & Stability

STATUS: IMPLEMENTED / WAITING REVIEW

CAPABILITY_AWARENESS: PASS
NORMAL_CHAT_ROUTING: PASS
SAFE_FILE_ROUTING: PASS
INSPIRATION_ROUTING: PASS
PLANNING_ROUTING: PASS
AUTONOMOUS_EXECUTION_ROUTING: PASS
TOOL_CONTRACT_STABILIZATION: PASS
ERROR_NORMALIZATION: PASS
UNIFIED_EXECUTION_STATE: PASS
CHAT_FIRST_UX: PASS
REAL_ORDINARY_CHAT_E2E: PASS

CHAT_SAFE_FILE_TOOL_COUNT: 8
CHAT_SAFE_FILE_ALLOWLIST_CHANGED: NO
P1_PERMISSION_BOUNDARY_CHANGED: NO
VALIDATOR_RELAXED: NO
NEW_IPC_CAPABILITY: NO
NEW_CORE_CAPABILITY: NO
GIT_SHELL_CONTROLLED_EXECUTE_EXPOSED: NO
SELF_UPGRADE_SCOPE_CHANGED: NO
PERSISTENCE_SCHEMA_CHANGED: NO
FORMAL_USER_DATA_TOUCHED: NO
VERSION_CHANGED: NO

TESTS:
- ...

GIT:
branch:
HEAD:
worktree:
```

## Implementation Evidence - 2026-08-11

- Added `src/agent/TeemoChatProductization.js` as the single provider-neutral productization adapter for runtime capability snapshots, five-route deterministic intent selection, an eight-Safe-File Provider Registry view, code-first error normalization, and public-state mapping with stale/terminal update rejection.
- Only the deterministic `safe_file_operation` route supplies the eight existing Safe File definitions to native Tool Calling. `normal_chat` and `inspiration_retrieval` use an Agent Core tool-free stream, while planning remains tool-free and P5-2 keeps its own bounded surface. The underlying Registry, strict validator, M2 normalization hook, P1, IPC, and Main FileService are unchanged.
- Natural planning and execute-current-plan intents reuse the existing P5-1 and P5-2 paths. Execution without a current owner-bound plan stops locally as `invalid_request` and makes zero Provider/Tool/Permission/Main calls.
- The existing plan button and natural Chat execution share the same bounded approval, exact write confirmation, authorization, timeout, cancellation, and verification function.
- Ordinary UI and stored Chat errors now use the seven public categories and do not expose schema paths, IPC names, stacks, Provider bodies, absolute hidden paths, or authorization identifiers.
- The public state adapter exposes exactly `idle`, `planning`, `waiting_permission`, `running`, `verifying`, `succeeded`, `failed`, and `cancelled`; a new request token prevents prior-session callbacks and terminal-state rewrites.
- The isolated ordinary Chat Electron E2E passed all five routes, natural Safe File read/write, P1 allow/deny/timeout, M2 mixed-argument canonicalization, File IPC/Main execution, second Provider response, bounded inspiration metadata, no-plan execution denial, capability context redaction, error leakage denial, and all public terminal paths with `FORMAL_USER_DATA_TOUCHED: NO`.
- Focused and affected M1/M2/P1/P3/P5 Node/Electron regressions pass. Release-version, Project Knowledge, syntax, and diff checks are required immediately before review evidence is submitted.
- Pre-implementation recovery marker: `v1.3.2-v1.4-pre-implementation-20260811` -> `371d63798f668cc8276af0436b111e7e72a49226`.
- No new capability, Tool, IPC, Permission, Service, persistence schema, dependency, version, Runtime route, self-upgrade scope, Git/Shell/Controlled Execute exposure, install, or formal-user-data write was introduced.

## Implementation Review And Deployment - 2026-08-11

- External implementation-evidence Strict Review returned `STATUS: PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / IMPLEMENTATION_ACCEPTED: YES / DEPLOYMENT_ALLOWED: YES / CAN_CLOSE_AND_TAG: YES after deployment verification`.
- The reviewer required an isolated build input. It separately confirmed `BUILD_ISOLATION_ACCEPTED: YES` for detached baseline `371d63798f668cc8276af0436b111e7e72a49226` plus only the three reviewed V1.4 packaged runtime files.
- Isolated runtime source hashes matched the reviewed source, the isolated diff contained exactly those three files, and release-version verification passed at `1.3.2`.
- Windows build completed successfully. Installer `Teemo-1.3.2-x64.exe` SHA-256 is `4431749D5F77FDD6E73DB8EA0C328A764007082068037F14A36B102A5821107B`; packaged `app.asar` SHA-256 is `88A30C462E6A4496A38DE65D39271034170AC0069EB6D324F5A1F10A2D4B1D74`.
- Packaged hashes for `TeemoChatProductization.js`, the Chat HTML, and Chat JavaScript exactly matched the reviewed source; the required unpacked Koffi binary was present.
- Silent installation returned exit code `0`. Installed `app.asar` exactly matches the isolated build, all three installed runtime files match the reviewed source, and formal product version remains `1.3.2`.
- Formal `local-file-access.json` SHA-256 remained `3A2A3949300DC6C961D2786873E064854C6CA0FF34C21CEED8E06FBB16CF43F8` before and after installation, with the existing `D:\\` root preserved.
- The formal application restarted successfully. No close commit/tag was created in the mixed source worktree; the pre-implementation recovery tag remains available.
- Final deployment evidence was returned to the same external GPT review conversation, which replied `FINAL_DEPLOYMENT_ACCEPTED: YES`.

## Route-Specific Tool Exposure Follow-up - 2026-08-11

Status: `IMPLEMENTED / WAITING REVIEW / USER-AUTHORIZED DEPLOYMENT COMPLETE`

- Fixed the focused post-deployment gap at the local route-to-Provider boundary. `normal_chat` and `inspiration_retrieval` now call `TeemoAgentCore.runToolFreeStream`, which prepares the existing Cognition/Creative/Challenge/Skill/Inspiration context but sends no Provider Tool definitions and never parses model prose as a Tool action.
- Only `safe_file_operation` enters the unchanged `runNativeTools` loop with the existing filtered Registry and exactly eight Safe File definitions. Authorized-root context is injected only on that route.
- Planning still uses `runPlanning`; autonomous execution still uses the existing P5-2 bounded executor. The Safe File allowlist, M2 argument normalization, strict validator, P1 permission/write confirmation, File IPC, and Main FileService are unchanged.
- The isolated real ordinary Chat Electron E2E proves both required `normal_chat` prompts have `providerToolDefinitionCount = 0`, `toolCalls = 0`, and `permissionCalls = 0`; the settings-panel prompt replies normally without `invalid_request`. The INDEX read and `test.md` title patch each expose exactly eight definitions and complete native Tool Calling, M2/P1/Main, write confirmation, and second Provider response. Planning exposes zero definitions.
- Acceptance: `NORMAL_CHAT_TOOLS_EXPOSED: NO`, `SAFE_FILE_ROUTE_TOOL_COUNT: 8`, `CHAT_SAFE_FILE_ALLOWLIST_CHANGED: NO`, `M2_CHANGED: NO`, `P1_CHANGED: NO`.
- The user explicitly authorized pre-review deployment on 2026-08-11. Windows build and release-version verification passed; installer SHA-256 is `631FB05E87F0BCD77E959E9623593303ABE546CAD356BDD93E5813599F4185E0` and packaged `app.asar` SHA-256 is `3D765D46621A0385D2A6FCA1EC9F927AE4BB3816A95F694834ACF01F596B9363`. Four critical packaged runtime files match source byte-for-byte and Koffi is unpacked.
- Silent installation returned `0`; installed `app.asar` exactly matches the verified build, formal version is `1.3.2.0`, and the application restarted with four Electron processes. Formal `local-file-access.json` remained byte-identical at SHA-256 `3A2A3949300DC6C961D2786873E064854C6CA0FF34C21CEED8E06FBB16CF43F8` before install, after install, and after restart.
- External Strict Review is still required before closure. No close commit or tag was created.

## Blocked Plan Semantics Maintenance - 2026-08-11

Status: `IMPLEMENTED / DEPLOYED`

- Diagnosed the real UI failure `A blocked plan step cannot be executed.`: P5-1 allowed `proposed/blocked` but did not tell the Provider that a planning-only request or later confirmation does not make an actionable step blocked. The UI then mislabeled truly blocked steps as “待确认”, enabled execution, and surfaced the internal English error only after starting P5-2.
- Planning instructions now require `proposed` for actionable future steps and reserve `blocked` for a concrete currently missing prerequisite named in the description. No blocked step is automatically unblocked.
- Chat and P5-2 both reject a truly blocked plan before run approval, Provider Tool Calling, P1 Permission, or Main execution. The plan card labels the step as blocked, explains the missing-prerequisite state in Chinese, disables execution, and directs the user to revise the plan.
- Focused Node and isolated Electron tests prove normal planning remains tool-free, proposed plans still execute through the unchanged P5-2 boundary, blocked plans make zero approval/Provider/Permission calls, and the English internal error no longer reaches the UI. M2 and ordinary Chat allowlists remain unchanged.
- Windows build and packaged-source verification passed. Installer SHA-256 is `D315610E7E00A23E6AA620C5CE72BF7D3A3C09F812C8C75264CE8529D390C67B`; packaged and installed `app.asar` both hash to `2EC2E820D7307D2F0EA8D9839B1AF4CC96D0415BDE066B552714CC22CC2FE01F`. Silent install returned `0`, formal `1.3.2.0` restarted, and the authorized-root configuration stayed byte-identical at `3A2A3949300DC6C961D2786873E064854C6CA0FF34C21CEED8E06FBB16CF43F8`.

## Rollback

- Before implementation, create a user-authorized recovery marker without overwriting the current dirty worktree.
- V1.4 runtime changes must be isolated to the focused module, Chat wiring, minimal optional state callback, tests, and status docs.
- Rollback removes the V1.4 wiring/module and restores the previous Chat route/presentation while leaving M1, M2, P1-P5, Runtime, authorized roots, and formal user data unchanged.
- Deployment failure must leave or restart the last working formal installation and report the failed stage.

## Review Request

Review this Taskbook only. Do not treat the proposal as implementation evidence.

Required external response:

```text
STATUS: PASS | FAIL
BLOCKERS: <number>
REQUIRED_FIXES:
- ...
IMPLEMENTATION_ALLOWED: YES | NO
```

Until the response is `STATUS: PASS`, `BLOCKERS: 0`, and `IMPLEMENTATION_ALLOWED: YES`, V1.4 implementation remains `NOT STARTED`.
