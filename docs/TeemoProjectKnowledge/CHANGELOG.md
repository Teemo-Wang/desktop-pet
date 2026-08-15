# Teemo Capability Changelog

## 2026-08-15

Teemo v1.4.0 正式版发布。合并 Cursor 目录（T1 插件化 + MiniMax-H3 技能）与 Teemo-source 为一致代码库，以 Teemo-source 为准。保留聊天上下文缓存命中率优化。修复三个回归：桌宠交互（app.js 移除未加载的 P1-P5 模块引用）、能力中心错位（补回 `.teemo-settings-overlay-page` 定位）、桌宠图片（恢复 37x111）。依赖调整：补 `adm-zip`、`koffi` 升级 3.1.5。Node 测试 45/45、`project:knowledge:verify` PASS。提交 `a663c2c`，标签 `v1.4.0`。

## 2026-08-12

Three-Level Approval Mode is `IMPLEMENTED / DEPLOYED`. Chat permission UX mirrors ChatGPT’s three levels (`请求批准` / `帮我批准` / `完全访问`) via `settings.permission.approvalMode`. Authorized folders remain the hard path boundary; auto-allow only reduces popups inside those folders. Execute / desktop click / ComfyUI always prompt. Decision `D-2026-08-12-05`. Installer `0296A8EA...B66AD`; packaged/installed `app.asar` `037CF862...7F60A`; silent install exit `0`; formal `1.3.2.0` restarted.

Single-Pass Chat Orchestration is `IMPLEMENTED / DEPLOYED`. Ordinary Chat no longer performs a pre-send Intent Classifier round-trip. Default path is one Provider request; `normal_chat` may expose the eight Safe File tools when authorized roots exist. Local rules cover planning/cancel/Safe File/inspiration/execute/self-upgrade, with soft-fallback when prerequisites are missing. Auto-Deploy After Change remains active.

V1.4.1 Safe Normal Chat Fallback is `IMPLEMENTED / DEPLOYED / OPTIONAL REVIEW`. Unreliable classifier outcomes now deny capability escalation but continue ordinary conversation through `normal_chat` and `runToolFreeStream()` with zero Provider Tool definitions and zero Safe File, Permission, P5-2, or P5-3 calls. Immediate Send Feedback renders a local-only user bubble and understanding state before classifier completion, performs no persistence/capability/side effect before validation, and preserves drafts/attachments entered during the wait. The delayed-classifier Electron E2E plus all original failure and valid-routing scenarios pass. No keyword table, intent schema, Tool, P1, P5-2, P5-3, Tool Registry, Main boundary, persistence, dependency, or version changed. Immediate Send Feedback deployment passed on 2026-08-12: installer `48D98042...F0956`, packaged and installed `app.asar` `D53181BA...C801`, install exit `0`, formal `1.3.2.0` with four running processes, and byte-identical 55-file formal-profile and authorized-root configuration hashes.

## 2026-08-11

Teemo V1.4.1 AI Intent Orchestration Taskbook is `TASKBOOK PROPOSED / WAITING REVIEW`. The proposal is grounded in the current keyword Router, Agent Core, AIService, P3, P5-1/P5-2/P5-3, Tool Registry, P1, and ordinary Chat wiring. It retains only explicit high-confidence local controls, introduces a zero-Tool Structured AI Intent classification for semantic cases, and requires strict local schema/confidence/capability/state validation before fixed route-specific exposure. The only new route integration is a minimal ordinary Chat entry into the existing owner-bound P5-3 controller; no Git/Execute Tool becomes ordinary-Chat-visible. No implementation, build, install, restart, commit, or tag is allowed before external review returns `PASS / BLOCKERS: 0 / IMPLEMENTATION_ALLOWED: YES`.

The first V1.4.1 Taskbook Strict Review returned `FAIL / BLOCKERS: 1 / IMPLEMENTATION_ALLOWED: NO` only because the E2E text simultaneously declared a closed six-value intent enum and expected an unsupported P4/ComfyUI/desktop value to reach capability validation. The Taskbook now consistently rejects such a value at strict schema validation with zero Tool/side-effect calls and no new route. It remains waiting re-review; implementation has not started.

The second V1.4.1 Taskbook review returned `FAIL / BLOCKERS: 1 / IMPLEMENTATION_ALLOWED: NO` because a broad execute-current-plan local rule could intercept `按刚才方案开始修改你自己的设置页面` before AI classification. The proposal now limits local P5-2 routing to an anchored whole-command request that only executes the existing ordinary plan. Compound instructions with a new target or Teemo self-modification object must enter Structured AI Intent and local P5-3 capability validation. No implementation has started.

The third V1.4.1 Taskbook review returned `FAIL / BLOCKERS: 1 / IMPLEMENTATION_ALLOWED: NO` because current P5-1 state has no trusted local execution-type marker, so even standalone `执行刚才计划` could represent P5-3 work. The Taskbook now removes that local shortcut: all current-plan execution requests use Structured AI Intent with a bounded plan summary, followed by local selection and validation of the existing P5-2 or P5-3 controller. No plan-type persistence, keyword list, or implementation was added.

Final V1.4.1 Taskbook Strict Review returned `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / IMPLEMENTATION_ALLOWED: YES`. Focused implementation is allowed within the approved Taskbook. A second external review of implementation evidence remains required before deployment or closure.

Teemo V1.4.1 AI Intent Orchestration is now `IMPLEMENTED / STRICT REVIEW PASS / DEPLOYED`. One zero-Tool classifier path, closed local schema/confidence validation, live Capability Snapshot validation, and fixed six-route dispatch replace broad keyword authority. All execute-current-plan requests use AI classification with a bounded plan summary because current plans have no trusted P5-2/P5-3 type. Ordinary Chat and the plan button share the existing P5-3 controller helper; Git/Execute remain dedicated and invisible to ordinary Chat. The new isolated ordinary Chat Electron E2E passes normal, Safe File/M2, planning, P5-2, P5-3, low-confidence, and invalid-intent scenarios including real synthetic repository/manifest/patch/hash/diff/npm/evidence. Affected V1.4, M1/M2, P1/P3/P5 regressions pass with formal data untouched. Implementation-evidence Strict Review returned `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / IMPLEMENTATION_ACCEPTED: YES / DEPLOYMENT_ALLOWED: YES`. Installer `E2DBAF46...3390C` installed with exit `0`; built and installed `app.asar` match at `EC9B78DF...EA6A`; formal `1.3.2.0` restarted with four processes; authorized-root configuration remained byte-identical at `3A2A3949...CF43F8`. No mixed-worktree close commit/tag was created.

Blocked Planning Execution UX Maintenance is `IMPLEMENTED / DEPLOYED`. It fixes the observed `A blocked plan step cannot be executed.` path by defining `proposed` as actionable future work even when the request is planning-only, reserving `blocked` for a named missing prerequisite, and rejecting truly blocked plans before approval or any Provider/Tool/Permission/Main call. Chat now labels blocked steps accurately, disables execution, and explains revision in Chinese. Proposed P5-2 execution, P5-1 tool-free planning, V1.4 routes, M2/P1 boundaries, allowlist, version, and formal data remain unchanged; focused Node/Electron regressions pass. Installer `D315610E...0C67B` installed with exit `0`; installed `app.asar` matches the build at `2EC2E820...2FE01F`; formal `1.3.2.0` restarted; authorized-root configuration remained byte-identical.

V1.4 Route-Specific Tool Exposure follow-up is `IMPLEMENTED / WAITING REVIEW / USER-AUTHORIZED DEPLOYMENT COMPLETE`. The deterministic local route now controls Provider capability exposure: normal Chat and Inspiration use a context-preserving Agent Core tool-free stream with zero Safe File definitions and no Tool/Permission execution; only `safe_file_operation` receives the unchanged eight Safe File definitions. Planning and P5-2 remain on their existing separate paths. The isolated ordinary Chat E2E passes the exact normal, settings-panel, INDEX read, `test.md` patch, and planning prompts, preserving M2 canonicalization, P1 write confirmation, Registry/IPC/Main boundaries, and the allowlist. The user explicitly authorized pre-review deployment: installer SHA-256 is `631FB05E...185E0`, packaged and installed `app.asar` both hash to `3D765D46...B9363`, silent install returned `0`, formal `1.3.2.0` restarted, and authorized-root configuration remained byte-identical at `3A2A3949...CF43F8`. External Strict Review is still required before closure; no close commit or tag was created.

Teemo V1.4 Productization & Stability is `IMPLEMENTED / STRICT REVIEW PASS / DEPLOYED`. The approved minimal implementation adds one pure `TeemoChatProductization` adapter and focused ordinary Chat wiring for actual-capability context, five existing routes, an exactly-eight Safe File Provider Registry view, seven public error categories, and eight public states with stale/terminal update rejection. Natural planning/execution reuse P5-1/P5-2, no-plan execution fails locally, and no Tool, IPC/Main capability, Permission, persistence, version, Runtime route, or self-upgrade scope changed. Focused Node, full isolated ordinary Chat E2E, and affected M1/M2/P1/P3/P5 regressions pass with formal user data untouched. External implementation review returned `PASS / BLOCKERS: 0 / IMPLEMENTATION_ACCEPTED: YES / DEPLOYMENT_ALLOWED: YES`; isolated build input was separately accepted. Detached baseline `371d6379...` plus exactly three reviewed runtime files produced installer hash `4431749D...1107B` and app.asar hash `88A30C46...B1D74`. Silent install returned `0`, installed runtime matches the reviewed source, formal root configuration remained byte-identical with `D:\\`, version remains `1.3.2`, and restart passed. Recovery marker `v1.3.2-v1.4-pre-implementation-20260811` remains available; no mixed-worktree close commit/tag was created.

Teemo V1.4 Productization & Stability Taskbook is `APPROVED / IMPLEMENTATION ALLOWED`. External GPT Strict Review returned `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / IMPLEMENTATION_ALLOWED: YES`. Grounded in the current Chat Window, Agent Core, Inspiration Context, P5 planning/execution, Registry, M2 grounding, P1, IPC, and Main code, it authorizes one pure `TeemoChatProductization` contract and focused Chat wiring/tests for accurate existing-capability awareness, five-way deterministic routing, Tool-contract drift protection, public error taxonomy, unified execution-state presentation, and Chat-first reuse. It adds no core capability, Tool, IPC/Main privilege, Service, persistence, version change, or excluded V1.4/P6 feature. Implementation evidence requires a second external Strict Review before closure/deployment.

M2 Safe File Tool Argument Normalization follow-up is `IMPLEMENTED / WAITING REVIEW / USER-AUTHORIZED DEPLOYMENT COMPLETE`. One trusted Main-backed pre-validation hook canonicalizes mixed Provider routing fields to `rootId + relativePath`, removes resolved `rootReference` and legacy `path`/`newPath`, and then lets the unchanged Tool Registry schema validator run. Main File IPC independently re-grounds before FileService. The exact ordinary Chat INDEX prompt passes a real Electron E2E through Tool Registry, P1, File IPC, Main FileService, Tool Result, and second Provider response with all five requested acceptance markers. Existing M2/M1/P1/P5 boundaries, Chat allowlist, Tool count, version, persistence, and formal data remain unchanged. The user explicitly authorized deployment before review on 2026-08-11: silent installation returned `0`, installed `app.asar` matches the build at SHA-256 `28FEEAE18FD2FC669E60F886AE0C6231D53EA85EE6F73BE82602B244A6DDE6E4`, formal version `1.3.2.0` restarted, and the existing `D:\\` authorized root remained unchanged. External Strict Review is still required before closure; no close commit/tag was created.

The Agent Post-Change Deployment rule is active under the local verification gate. Focused/affected tests, Electron smoke when applicable, syntax, release-version, Project Knowledge, diff, data protection, boundary review, and known build-input provenance control deployment eligibility. External review is optional/recommended and does not block build/install/restart. Documentation-, test-, development-script-, and Project-Knowledge-only changes do not trigger deployment. The Project Knowledge verifier checks the active policy markers and build command.

Authorized Root Discovery & Grounding M2 is implemented and passed external GPT Strict Review with `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / CAN_CLOSE_AND_TAG: YES`. Main now publishes only provider-safe active-root metadata and deterministically grounds `rootId` or exact unique `rootReference` + `relativePath` for all eight ordinary Chat Safe File Tools; exact absolute paths are compatibility input and must resolve inside a current P1 authorized root. Display-name, case-insensitive, fixed alias, ambiguity, stale/revoked root, traversal/UNC/device/ADS, outside-root, and symlink/junction tests pass. Isolated real Chat Window Electron E2E passes for displayName, `Teemo源码`, authorized absolute path, outside-root denial, native Tool Calling, and second Provider continuation. The ordinary Chat allowlist, P1/Main boundaries, version, persistence, closed P5 semantics, and recovery tags are unchanged. A future close commit must isolate M2 from the existing desktop-pet maintenance changes; none was created during review.

M2 is now deployed to the formal application. The current `Teemo-1.3.2-x64.exe` was rebuilt and verified, silent installation returned `0`, installed `app.asar` matches the build at SHA-256 `1597E29399C64C25F64EA9F87749CC1A2B61BC81A51AC549A4EEB98C2996D5FD`, the M2 runtime is packaged, and the formal `1.3.2.0` application restarted successfully. The existing `D:\` authorized root remains valid.

Desktop Pet Interaction Maintenance fixed the production renderer dependency order so `PetComponent` initializes. Main Process cursor polling now maps Win32 physical client coordinates to Electron content coordinates across mixed DPI/multiple displays and explicitly synchronizes native `WS_EX_TRANSPARENT`, which Electron did not reliably clear. The bundled pet image matches the authoritative `D:\Teemo助手\Teemo.png`; focused Node, isolated Electron, and full-index Electron smoke pass. The Koffi native binary is unpacked for production. The installer was built, verified, installed, and the formal `1.3.2.0` application restarted. Real Windows input moved the pet and opened the AI panel while empty desktop space retained passthrough. P5, Tool, permission, and persistence boundaries are unchanged.

## 1.3.2

Current:
P3 and P4 are closed. P5-1 is closed under `v1.3.2-p5.1-autonomous-planning`; P5-2 passed implementation-evidence Strict Review and is closed under `v1.3.2-p5.2-autonomous-execution-verification`; P5-3 passed implementation-evidence Strict Review and is closed under `v1.3.2-p5.3-controlled-self-upgrade`. P5 Final Acceptance is not started.

Planned:
P5-3 Controlled Self-Upgrade Taskbook approves one clean-baseline, owner-controlled, immutable existing-file patch manifest with P5-2/P1/Main execution, read-only Git verification, baseline-bound npm verification, explicit rollback, and external Strict Review. Implementation is allowed only within those bounds.

P5 Final Acceptance has a verification-only Taskbook proposal; external Strict Review is required before any final verification begins.

P5 Final Acceptance passed final external implementation-evidence Strict Review and is closed under `v1.3.2-p5-final-acceptance`; no new product capability was added.

Added:
P5-2 Autonomous Execution & Verification implements one explicit, bounded, owner/plan-bound in-memory run using only the existing Safe File Tools through Agent Core, Tool Registry, P1 Permission, File IPC, and Main Process FileService. Exact write confirmation, trusted postcondition verification, finite retry, timeout, cancellation, and fail-closed ownership checks are enforced. Status is `CLOSED / PASS / BLOCKERS: 0`.

Added:
P4 Final Acceptance is a verification-only closure. Focused P4 and P1/M1, P2, and P3 regressions passed with synthetic display/PNG/input/transport data and isolated profiles only. It added no product capability, Tool, provider flow, desktop adapter, permission scope, filesystem/network capability, version change, installer, installation, or restart.

Security:
P4 retains Main Process boundaries, P1 one-shot permissions, owner-bound expiring memory previews, and the unchanged ordinary Chat Safe File Tool allowlist. P5 implementation remains blocked pending its own approved Taskbook.

Added:
P4-3 one fixed local Runtime-only ComfyUI SDXL render adapter: fixed Main Process loopback transport, static workflow, exact P1 execute-once permission, owner-bound bounded memory preview, cancellation, discard, and expiry. Provider/Agent/Chat/filesystem paths remain absent. Recovery tag: `v1.3.2-p4.3-design-tool-workflows`.

Security:
P4-3 adds no general ComfyUI client, workflow/model/endpoint/path control, remote networking, output archive, Chat Tool, Shell, PowerShell, program execution, Git, Controlled Execute, delete, desktop input, P4 Final, or P5 capability.

Added:
P4-1 explicit local-only screen awareness: opaque display references, P1 read permission, one-shot Main execution authorization, Main Process screen-only capture, owner-bound bounded in-memory preview, discard, and expiry. Screen data has no Provider/Agent/persistence path and automated tests use synthetic data only.

Added:
P4-2 controlled desktop action: a local user selects one point on a fresh P4-1 preview, explicitly confirms, obtains one-time P1 execute Permission, and Main Process revalidates current display geometry before dispatching one restricted primary click. No Provider/Agent/Chat desktop path, persistence, or general input capability exists.

Security:
P4-2 permits no keyboard, clipboard, scroll, drag, double-click, workflow, retry, Shell, PowerShell, program execution, Git, Controlled Execute, delete, or destructive operation. Renderer receives only opaque preview/action references and normalized points; global coordinates and native input remain Main-only.

Added:
P3-5 source registration, bounded Eagle metadata indexing, existing retrieval/preview reuse, and fail-closed P1 authorization checks. Provider calls remain zero and source bytes remain unchanged.

P3-6 Taskbook approved by external GPT Strict Review: implementation allowed for explicit, bounded Inspiration Retrieval to Agent Context only.

P3-6 is closed: explicit trigger gate, bounded retrieval reuse, untrusted Inspiration Context, Provider payload redaction, and disabled/revoked fail-closed behavior. GPT Strict Review returned `PASS / BLOCKERS: 0 / CAN_CLOSE_AND_TAG: YES`. P4/P5 remain not started.

Added:
P3-4 local Inspiration Retrieval over active P3-3 metadata snapshots, with bounded keyword search, filters, sorting, pagination, and existing P3-2 preview reuse.

Security:
Retrieval is Main Process local-only and fails closed for disabled, removed, revoked, corrupt, or unavailable sources. It makes no provider calls, Agent Context changes, source mutations, or new filesystem authorization paths.

Added:
Native Tool Calling for ordinary Chat.

Added:
Safe `create_directory` through the existing P1 Permission and Main Process FileService path.

Changed:
Ordinary Chat can invoke P1 Safe File Tools through provider-neutral Native Tool Calling.

Security:
Git Tools, Controlled Execute, arbitrary Shell, delete, and destructive operations remain unavailable in ordinary Chat.

Changed:
Teemo Project Knowledge is maintained under this directory and verified against Git and `package.json`.

Changed:
Git branch, HEAD, and worktree are verified from live Git. `CURRENT-STATE.md` retains them only as a Last Verified Git Snapshot.
