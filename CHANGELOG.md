# Changelog

## Teemo v1.4.0 正式版 - 2026-08-15 (RELEASED)

- 将 Cursor 目录（`Teemo-desktop-pet`，含 T1 插件化）与官方 `Teemo-source` 合并为一致代码库，以 Teemo-source 为准，版本升级为 1.4.0。
- 合入 T1 插件化：新增能力注册表（`image.generate` / `workflow.execute`）、插件运行时与 ComfyUI 插件，聊天出图走 Skill → Capability → Plugin。
- 合入 MiniMax-H3 视频技能（9 个技能）。
- 保留聊天上下文缓存命中率优化：易变上下文（认知/创意/挑战/灵感）后置到对话末尾，提升前缀缓存命中。
- 依赖调整：补 `adm-zip`（Skill 压缩包导入）、`koffi` 升级 3.1.5。
- 修复三个回归：桌宠无法点击/拖拽/交互（app.js 移除未加载的 P1-P5 模块引用，恢复 PetComponent 初始化）；能力中心页面错位（补回 `.teemo-settings-overlay-page` 定位）；桌宠图片被误替换（恢复 37x111 正确素材）。
- 验证：Node 测试 45/45 通过，`project:knowledge:verify` PASS。提交 `a663c2c`，标签 `v1.4.0`。

## Teemo Single-Pass Chat Orchestration - 2026-08-12 (IMPLEMENTED / DEPLOYED)
- Removed the default pre-send Structured AI Intent classifier from ordinary Chat send path.
- Ordinary `normal_chat` now keeps eight Safe File tools available when authorized roots exist, enabling single-pass native Tool Calling.
- Expanded local high-confidence routing for Safe File NL, inspiration, execute-current-plan, and self-upgrade; missing prerequisites soft-fallback to normal Chat.
- Updated focused Node and isolated Electron V1.4 / V1.4.1 suites. No P1/Main/Git/Shell/Execute exposure or version change.

## Teemo Auto-Deploy After Change - 2026-08-12 (ACTIVE)
- Removed every deployment-time review gate: external GPT Strict Review, WAITING REVIEW, and the previous local verification suite no longer block build/install/restart.
- Packaged-application changes must auto build/install/restart in the same Agent task so the formal app becomes the latest change.
- Kept hard safety boundaries only: formal user data protection, no Shell/Git expansion in ordinary Chat, no unknown dirty build input, and Project Knowledge sync/verify after changes.
- Added active decision D-2026-08-12-04: move ordinary Chat toward single-pass orchestration; do not keep a default extra Intent Classifier round-trip before every reply.

## Teemo Deployment Gate Simplification - 2026-08-12 (SUPERSEDED)
- Historical: external review was first removed while local verification remained the deployment gate. Superseded by Auto-Deploy After Change.

## V1.4.1 Safe Normal Chat Fallback Hotfix - 2026-08-12 (IMPLEMENTED / DEPLOYED / OPTIONAL REVIEW)
- Changed unreliable Structured AI Intent outcomes from a user-visible routing error/forced capability-choice response to the safe `normal_chat` tool-free fallback.
- Classifier timeout, unavailability, malformed JSON, invalid schema, unsupported/inconsistent intent, ambiguity, and low confidence cannot open Safe File, P5-2, P5-3, Permission, or any other effectful path.
- Added isolated ordinary Chat E2E for three exact `你好` failures, effectful execution/self-modification failure containment, and unchanged valid Safe File/P5-2/P5-3 routing.
- No keyword table, intent schema, Tool, P1, P5-2, P5-3, Tool Registry, Main boundary, persistence, dependency, or version changed. External review remains optional/recommended and does not block local deployment after the local gate passes.
- Fixed the visible pre-send pause by rendering a local-only user bubble and understanding state before the Structured Intent request completes. The preview has no Tool, Permission, persistence, or side effect, and pending classifier latency no longer blocks local message feedback. Drafts and attachments created during the wait are preserved.
- Delayed-classifier Electron coverage passes `IMMEDIATE_LOCAL_SEND_PREVIEW`, classifier-independent local rendering, and waiting-draft preservation while all original route and failure-escalation assertions remain unchanged.
- Immediate Send Feedback deployment passed: installer SHA-256 `48D98042DF54671B3E62125B2A6422A2B834DFC3C53CACEFD28BB7AB75CF0956`; packaged and installed `app.asar` SHA-256 `D53181BA42ADF5ADCB065392475792154E19899FF0CAFD9CB42553519447C801`; install exit `0`; formal `1.3.2.0` restarted with four processes. The complete 55-file formal-profile manifest and authorized-root configuration remained byte-identical across installation.
- Local-gate deployment passed: installer SHA-256 `464B70DBCCA09CC49D2EB9333952030E8D81DE35E25CA308DA2A171CEC9666F7`; packaged and installed `app.asar` SHA-256 `5A73374530E930AAB18FC05A2849625FF07FF663A64BE1D6DB441F25A866E8A7`; silent install exit `0`; formal version `1.3.2.0`; four running Electron processes. The 54-file formal-profile manifest and `local-file-access.json` hashes were unchanged.

## Teemo V1.4.1 AI Intent Orchestration - 2026-08-11 (IMPLEMENTED / STRICT REVIEW PASS / DEPLOYED)
- Added `docs/Teemo-V1.4.1-AI-INTENT-ORCHESTRATION.md`, grounded in the current keyword Router, Agent Core, AIService, Inspiration, P5-1/P5-2/P5-3, Tool Registry, P1, and ordinary Chat code.
- Proposed a bounded hybrid intent path: explicit high-confidence local controls, otherwise zero-Tool Structured AI Intent, strict local schema/confidence validation, live capability/state validation, and fixed local route exposure.
- Proposed only a minimal Chat entry to the existing P5-3 controller; ordinary Chat gains no Git, Execute, Shell, new Tool, IPC, Main privilege, permission relaxation, persistence change, dependency, or version change.
- Taskbook review is the active gate. Implementation, build, install, restart, commit, and tag remain prohibited until `PASS / BLOCKERS: 0 / IMPLEMENTATION_ALLOWED: YES`.
- Taskbook Strict Review passed after three routing-contract fixes. The approved implementation adds a zero-Tool Structured AI Intent call, closed schema/confidence fail-safe, runtime capability/state validation, and a sixth `controlled_self_upgrade` route without adding a capability.
- Execute-current-plan is no longer a local shortcut; the bounded current-plan summary lets AI distinguish P5-2 from P5-3, after which local validation selects the existing controller.
- The existing P5-3 plan-button flow and ordinary Chat share one UI helper. Dedicated Git/Execute/discovery registries remain internal to P5-3 and are never added to ordinary Chat.
- Focused Node and real isolated ordinary Chat Electron E2E pass all acceptance markers, including real synthetic P5-3 repository validation, immutable manifest, patch/hash/diff/npm verification, and evidence. Affected V1.4, M1/M2, P1/P3/P5 regressions pass; formal data and version are unchanged.
- External implementation-evidence Strict Review returned `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / IMPLEMENTATION_ACCEPTED: YES / DEPLOYMENT_ALLOWED: YES`. Installer `E2DBAF46...3390C` installed with exit `0`; built and installed `app.asar` match at `EC9B78DF...EA6A`; formal `1.3.2.0` restarted with four processes; authorized-root configuration stayed byte-identical at `3A2A3949...CF43F8`. No mixed-worktree close commit/tag was created.

## Blocked Planning Execution UX Maintenance - 2026-08-11 (IMPLEMENTED / DEPLOYED)
- Clarified P5-1 planning instructions so actionable future steps remain `proposed` even for planning-only requests; `blocked` now means a concrete missing prerequisite named in the description.
- Added pre-approval blocked-plan rejection in Chat and P5-2. It makes zero Provider/Tool/Permission/Main calls and does not weaken the existing execution boundary.
- Replaced the misleading “待确认” state and internal English execution error with a Chinese blocked-step explanation, disabled execution, and a plan-revision path.
- Focused Node and isolated Electron planning/execution/V1.4 regressions pass; M2, P1, allowlist, version, and formal data are unchanged.
- Built installer SHA-256 `D315610E7E00A23E6AA620C5CE72BF7D3A3C09F812C8C75264CE8529D390C67B`; packaged and installed `app.asar` both hash to `2EC2E820D7307D2F0EA8D9839B1AF4CC96D0415BDE066B552714CC22CC2FE01F`. Silent install returned `0`, formal `1.3.2.0` restarted, and authorized-root configuration remained unchanged.

## V1.4 Follow-up — Route-Specific Tool Exposure - 2026-08-11 (IMPLEMENTED / WAITING REVIEW / USER-AUTHORIZED DEPLOYMENT COMPLETE)
- Added a context-preserving `runToolFreeStream` Agent Core entry for ordinary Chat routes that must not receive Provider tools. It never enters Tool Registry execution or interprets tool-shaped prose as a Tool request.
- Local deterministic routing now gates capability exposure: only `safe_file_operation` receives the unchanged eight Safe File definitions; `normal_chat` and `inspiration_retrieval` receive zero, planning remains zero, and P5-2 is unchanged.
- Isolated ordinary Chat Electron E2E proves the two required normal prompts make zero Tool/Permission calls and reply normally, Safe File INDEX read and `test.md` patch each expose eight definitions and preserve M2/P1/Main behavior, and planning exposes zero definitions.
- Safe File allowlist, M2 normalization, validator, P1, IPC/Main, version, and formal data are unchanged.
- The user explicitly authorized pre-review deployment. Installer SHA-256 is `631FB05E87F0BCD77E959E9623593303ABE546CAD356BDD93E5813599F4185E0`; packaged and installed `app.asar` both hash to `3D765D46621A0385D2A6FCA1EC9F927AE4BB3816A95F694834ACF01F596B9363`; silent installation returned `0`; formal version `1.3.2.0` restarted. The authorized-root configuration hash remained `3A2A3949300DC6C961D2786873E064854C6CA0FF34C21CEED8E06FBB16CF43F8`.
- External Strict Review is still required before closure; no close commit or tag was created.

## Teemo V1.4 Productization & Stability - 2026-08-11 (IMPLEMENTED / STRICT REVIEW PASS / DEPLOYED)
- Added the pure `TeemoChatProductization` adapter and focused ordinary Chat wiring for runtime-derived capability awareness, deterministic five-route intent selection, code-first error normalization, and eight unified public states with stale/terminal update rejection.
- Provider Native Tool Calling receives exactly the existing eight Safe File definitions through a filtered Registry view only when the local route is `safe_file_operation`. The underlying Registry, M2 normalization, strict validator, P1, IPC, and Main contracts are unchanged.
- Natural planning and current-plan execution reuse the existing P5-1/P5-2 flows and confirmations. A missing current plan fails locally with no Provider/Tool/Permission/Main activity.
- Added focused Node and isolated ordinary Chat Electron E2E. All five routes, Safe File read/write, P1 allow/deny/timeout, M2 canonical arguments, Main execution, second Provider response, Inspiration, planning/execution, capability redaction, state and error leakage checks pass; affected M1/M2/P1/P3/P5 regressions pass.
- Added pre-implementation recovery marker `v1.3.2-v1.4-pre-implementation-20260811` at snapshot `371d6379...`. External implementation review returned `PASS / BLOCKERS: 0 / IMPLEMENTATION_ACCEPTED: YES / DEPLOYMENT_ALLOWED: YES`; isolated build input was separately accepted.
- Detached baseline `371d6379...` plus exactly three reviewed runtime files built `Teemo-1.3.2-x64.exe` (`4431749D...1107B`) and `app.asar` (`88A30C46...B1D74`). Packaged/installed source hashes match, silent install returned `0`, formal `D:\\` configuration was byte-identical, version remains `1.3.2`, and restart passed. No mixed-worktree close commit/tag was created.

## Teemo V1.4 Productization & Stability Taskbook - 2026-08-11 (APPROVED / IMPLEMENTATION ALLOWED)
- Added `docs/Teemo-V1.4-PRODUCTIZATION-STABILITY.md` from the current codebase. The proposal stabilizes existing P0-P5 + M2 capability awareness, five-way ordinary Chat routing, cross-layer Tool contracts, public errors/states, and Chat-first reuse without adding a core capability.
- Proposed minimal implementation is one pure `TeemoChatProductization` contract plus focused Chat wiring and isolated Node/Electron acceptance. Existing Agent Core, Inspiration, P5 planning/execution, Registry, P1, IPC, Main, and Runtime remain authoritative.
- External Taskbook Strict Review returned `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / IMPLEMENTATION_ALLOWED: YES`. Focused implementation is allowed; implementation evidence still requires external review before closure/deployment.

## M2 Follow-up — Safe File Tool Argument Normalization - 2026-08-11 (IMPLEMENTED / WAITING REVIEW)
- Added trusted Main-backed Safe File Tool argument normalization before Tool Registry schema validation. Mixed `rootId + rootReference + path` input canonicalizes to `rootId + relativePath`; resolved `rootReference`, legacy `path`, and rename `newPath` are removed.
- Registry validation remains strict and provider definitions expose no normalization hook. File IPC independently re-grounds current roots and adds trusted absolute paths only inside Main before the unchanged FileService path.
- Agent Context now explicitly requires exactly one root selector and forbids mixing structured selectors with `path`.
- Added `TeemoM2SafeFileArgumentNormalizationElectronSmoke.js` with the exact INDEX prompt. It captures raw mixed native arguments, proves final pre-execution `{ rootId, relativePath }`, and completes Registry -> P1 -> File IPC -> Main FileService -> content -> Tool Result -> second Provider response.
- Requested acceptance markers and M2/M1/Agent Core/Registry/P1/File Tool/P5-2 regressions pass. Version, persistence, P1, allowlist, Tool count, formal data, and V1.4 scope are unchanged. The user explicitly authorized deployment before review: rebuilt `Teemo-1.3.2-x64.exe` installed with exit code `0`; installed `app.asar` matches the build at SHA-256 `28FEEAE18FD2FC669E60F886AE0C6231D53EA85EE6F73BE82602B244A6DDE6E4`, contains the follow-up runtime, and runs as formal version `1.3.2.0`; restart succeeded and the existing `D:\\` authorized root was preserved. External review remains pending and no close commit/tag was created.

## Teemo Agent Post-Change Deployment Rule - 2026-08-11 (ACTIVE)
- Added a root `AGENTS.md` rule requiring completed packaged-application changes to automatically rebuild the current verified Windows installer, validate packaged content, install it, restart the formal application, and verify the installed version after all applicable gates pass.
- Required deployment gates are local tests, Electron smoke when applicable, syntax, Project Knowledge sync/verify, release-version, diff review, formal-data protection, unexpected-boundary review, and known build-input provenance. External Strict Review is optional/recommended and no longer blocks local deployment.
- The rule does not authorize automatic version bumps or changes to formal user data. Deployment failure must stop safely and be reported.
- Documentation-, test-, development-script-, and Project-Knowledge-only changes do not trigger deployment. `scripts/TeemoProjectKnowledge.js` now verifies the rule marker and Windows build command remain present.

## Teemo Maintenance M2 — Authorized Root Discovery & Grounding - 2026-08-11 (GPT STRICT REVIEW PASS / CLOSE AUTHORIZED)
- Added a Main-side trusted grounding layer that publishes only provider-safe active-root metadata and converts `rootId` or exact unique `rootReference` + `relativePath` into the existing trusted FileService path contract.
- Unified provider schemas for all eight ordinary Chat Safe File Tools. Exact absolute path input is compatibility-only and must match a current P1 authorized root; stale/revoked/ambiguous roots, outside-root paths, traversal, UNC/device paths, ADS, and link escapes fail closed.
- Added fixed deterministic aliases for the formal `Teemo-source` root (`Teemo源码`, `当前项目`) without alias learning, fuzzy matching, semantic search, or an alias-management UI.
- Added isolated Node contract/security coverage and real Chat Window Electron E2E for displayName, alias, authorized absolute path, outside-root denial, native Tool Calling, Tool result continuation, and unchanged renderer/Main/P1 boundaries.
- M1/P1/Agent Core/P5 shared-boundary regressions pass. Version, P0-P5 closure, ordinary Chat allowlist, Git/Controlled Execute/Shell/delete exposure, persistence, installer, and recovery tags are unchanged.
- External GPT Strict Review returned `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / CAN_CLOSE_AND_TAG: YES`. No close commit/tag or remote push was created; a future close commit must exclude the existing desktop-pet maintenance changes.
- Rebuilt and deployed `Teemo-1.3.2-x64.exe` after review. Silent installation returned `0`; installed `app.asar` matches the new build at SHA-256 `1597E29399C64C25F64EA9F87749CC1A2B61BC81A51AC549A4EEB98C2996D5FD`, contains `TeemoAuthorizedRootGrounding`, and the formal `1.3.2.0` application restarted successfully with the existing `D:\` authorized root preserved.

## Desktop Pet Interaction Maintenance - 2026-08-11 (IMPLEMENTED / REAL WINDOWS VERIFIED)
- Fixed the production renderer startup failure by loading `TeemoPlanningContract` before the upgrade/Agent modules and preventing the browser path from executing CommonJS-only registry exports. `PetComponent` now initializes in the formal application instead of leaving only the static pet markup visible.
- Windows input uses Main Process cursor hit-test polling over renderer-published interactive regions. `TeemoWindowsDesktopHitTest` maps Win32 physical client coordinates into Electron content coordinates so mixed-DPI and cross-display layouts remain aligned.
- Electron did not reliably clear native `WS_EX_TRANSPARENT` when disabling passthrough on the full-screen transparent window. The Windows adapter now synchronizes that style through `GetWindowLongPtrW` / `SetWindowLongPtrW` and refreshes the frame after each passthrough transition.
- Dragging keeps input captured until mouse release, preventing the pointer from escaping the moving pet hit region; IPC updates are accepted only from the owning renderer.
- Restored reliable right-bottom startup placement by waiting for valid viewport dimensions and providing a CSS fallback while the renderer initializes.
- Replaced `pet.png` with the authoritative `D:\Teemo助手\Teemo.png` bytes. Focused Node, isolated Electron smoke, and full-index Electron smoke cover the asset hash, cursor hit testing, drag lifecycle, click-to-open Dock, module initialization, and real 812 x 812 image decode.
- The current profile's skin selection was switched back to `default` so the authoritative bundled image is selected; the previous custom image bytes remain preserved in settings for recoverability.
- The build explicitly unpacks the Koffi Windows native binary from ASAR. Built `Teemo-1.3.2-x64.exe`, verified `app.asar` plus `app.asar.unpacked`, installed it successfully with exit code 0, and restarted the formal per-user application from `C:\Users\Teemo\AppData\Local\Programs\teemo-assistant\Teemo助理.exe`.
- Real Windows verification on the installed application confirmed `WS_EX_TRANSPARENT` is cleared over the pet and restored over empty desktop space. A physical drag moved the pet by approximately `(-365, -265)`, and a physical click opened the AI panel.
- No version, P5 capability, Tool allowlist, permission, persistence schema, or recovery tag changed.

## P5-3 Controlled Self-Upgrade - 2026-08-10 (CLOSED / PASS / BLOCKERS: 0)
- Added the planning-only Taskbook `docs/Teemo-P5-3-CONTROLLED-SELF-UPGRADE.md`; no P5-3 runtime or product capability has been added.
- The proposal defines one clean-baseline, owner/plan/repo-bound, immutable patch manifest using P5-2/P1/Main file execution, read-only Git verification, baseline-bound npm scripts, finite failure handling, and external Strict Review.
- External GPT Strict Review approved implementation within the Taskbook with zero blockers and no required fixes. Closed under `v1.3.2-p5.3-controlled-self-upgrade`; P5 Final Acceptance remains blocked. Create/delete/rename, package/dependency mutation, Git writes/remotes, arbitrary execution/Shell, installation/restart, background/persistent/recursive upgrade, and auto-close/tag remain excluded.

## P5 Final Acceptance - 2026-08-10 (CLOSED / PASS / BLOCKERS: 0)
- Verification-only P5 Final Acceptance matrix passed across P5-1/P5-2/P5-3 and shared P1-P4 boundaries using synthetic data. Closed under `v1.3.2-p5-final-acceptance`; no release build, installation, or restart was performed.

## P5-2 Autonomous Execution & Verification - 2026-08-10 (CLOSED / PASS)
- Added an owner/plan-bound, memory-only bounded execution state machine with explicit full-run approval, exact write-step confirmation, `maxSteps`, finite read/verification retry, timeout, cancellation, and fail-closed ownership/plan checks.
- Existing Agent Core and the unchanged eight Chat Safe File Tools now provide approved plan-step actions; Tool Registry, P1 Permission, File IPC, and Main Process FileService remain the only execution and postcondition-verification path.
- Added isolated Node and Electron acceptance. P1/M1, P2, P3, P4, and P5-1 regressions pass. P5-3, P5 Final Acceptance, self-upgrade, persistence/background execution, allowlist expansion, Git, Controlled Execute, Shell, programs, delete, desktop, and ComfyUI remain excluded.
- External GPT Strict Review returned `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / CAN_CLOSE_AND_TAG: YES / NEXT_STAGE_ALLOWED: P5-3 Taskbook Review only`. Recovery tag: `v1.3.2-p5.2-autonomous-execution-verification`.

## P5-1 Autonomous Planning - 2026-08-10 (CLOSED / PASS)
- Added an explicit planning-only Chat path with a provider-neutral request that omits Tool definitions and rejects unexpected provider tool calls before the Agent tool loop.
- Plans are bounded, untrusted, session-local data with proposed/blocked steps only; revision and discard never execute Tools, request Permission, access filesystem/desktop, or persist plan state.
- Added isolated Node and Electron smoke coverage. External GPT Strict Review: `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / CAN_CLOSE_AND_TAG: YES`. Recovery tag: `v1.3.2-p5.1-autonomous-planning`. P5-2/P5-3 remain not started; version remains `1.3.2`.

## P4 Final Acceptance - 2026-08-10 (CLOSED / PASS)
- P4-1 Runtime / Screen Awareness, P4-2 Controlled Desktop Actions, and P4-3 Design Tool Adapters / Workflows passed cross-stage final acceptance without adding any feature, Tool, provider flow, desktop adapter, permission scope, filesystem/network capability, version change, installer, installation, or restart.
- The final suite passed all focused P4 Node/Electron tests plus P1/M1, P2, and P3 regressions using synthetic inputs and isolated profiles only. No real display capture, OS input, ComfyUI/GPU, Provider, formal user data, or output directory was used.
- External GPT Strict Review: `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / CAN_CLOSE_AND_TAG: YES / NEXT_STAGE_ALLOWED: P4 Final close commit/tag only; P5 NOT ALLOWED`.
- Recovery tag: `v1.3.2-p4-final-acceptance`. P5 remains not started and requires its own approved Taskbook.

## P4-3 Design Tool Adapters / Workflows - 2026-08-10 (CLOSED / PASS)
- Added one Runtime-only fixed local ComfyUI SDXL adapter. Main Process owns the literal loopback transport, static workflow construction, response validation, P1 one-time execution binding, and owner-local expiring preview.
- The Runtime UI sends only a bounded local prompt and dimensions. It exposes no endpoint, workflow, model, checkpoint, path, output directory, queue, archive, Chat, Agent, or Provider control.
- Added synthetic Node and isolated Electron smoke coverage with a fake transport and PNG. No real ComfyUI/GPU, provider, formal user settings, user output, filesystem, screen capture, or desktop input is used in tests.
- External GPT Strict Review: `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / CAN_CLOSE_AND_TAG: YES / NEXT_STAGE_ALLOWED: P4 Final Acceptance Taskbook Review only`.
- Recovery tag: `v1.3.2-p4.3-design-tool-workflows`. P4 Final Acceptance and P5 are not started; no version bump, installer build/install, or restart was performed.

## P4-2 Controlled Desktop Actions - 2026-08-10 (CLOSED / PASS)
- Added a local Runtime UI path for a user-selected, explicitly confirmed, one-time primary click from a fresh P4-1 preview. Main Process resolves and revalidates all native display geometry immediately before dispatch.
- P1 enforces one-time `execute` Permission for `desktop_primary_click`; Renderer has no native display, global-coordinate, or input capability. Provider, Agent Core, ordinary Chat, Tool Calling, Chat history, logs, and persistence receive no desktop-action data.
- Added synthetic Node and Electron smoke coverage using a fake input adapter. Shell, PowerShell, child process execution, arbitrary program execution, Git, Controlled Execute, keyboard, clipboard, scroll, drag, double-click, P4-3, and delete remain unavailable.
- External GPT Strict Review: `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / CAN_CLOSE_AND_TAG: YES / NEXT_STAGE_ALLOWED: P4-3 Taskbook Review only`.
- Recovery tag: `v1.3.2-p4.2-controlled-desktop-actions`.

## P4-1 Runtime / Screen Awareness - 2026-08-10 (CLOSED / PASS)
- Added an explicit, Main Process-only display snapshot foundation with opaque display references, P1 read Permission, one-shot execution authorization, owner-bound IPC, bounded in-memory preview, discard, and expiry.
- Screen pixels and display metadata do not enter AIService, Provider adapters, Agent Core, ordinary Chat, Tool definitions/results, filesystem persistence, logs, or telemetry. Automated tests inject synthetic display/image data only.
- P4-1 does not add any Chat Tool, desktop action, Shell, PowerShell, Git, Controlled Execute, program execution, delete, OCR, Provider Vision, or P4-2/P4-3 capability.
- External GPT Strict Review of implementation evidence: `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / CAN_CLOSE_AND_TAG: YES / NEXT_STAGE_ALLOWED: P4-2 Taskbook Review only`.
- Recovery tag: `v1.3.2-p4.1-runtime-screen-awareness`.
- Implementation evidence is awaiting external GPT Strict Review; no close commit/tag has been created.

## P3-4 Inspiration Retrieval - 2026-08-10 (CLOSED / PASS)
- Added local retrieval over P3-3 active metadata with keyword, source, format, orientation, size, sorting, and bounded pagination.
- Main Process revalidates Source/P1 authorization; revoked, removed, corrupt, unindexed, and disabled sources fail closed.
- Results reuse P3-2 preview. No provider calls, source mutation, Agent Context injection, close commit, or recovery tag.
- GPT Strict Review: `PASS / BLOCKERS: 0 / CAN_CLOSE_AND_TAG: YES / NEXT_STAGE_ALLOWED: P3-5`.
- P3-5 More Inspiration Sources Taskbook received external GPT Strict Review approval; implementation is allowed within its Eagle-compatible read-only scope.

## P3-5 More Inspiration Sources - 2026-08-10 (CLOSED / PASS)
- Added an Eagle-compatible local-only, read-only connector with source registration, bounded metadata indexing, retrieval, and existing preview reuse.
- Reused P1 authorized-root and Permission boundaries; traversal, link/junction, containment, and TOCTOU checks fail closed.
- Provider calls: `0`; Eagle source bytes and formal user data unchanged. GPT Strict Review: `PASS / BLOCKERS: 0 / CAN_CLOSE_AND_TAG: YES`.

## P3 Personal Inspiration Final Acceptance - 2026-08-10 (CLOSED / PASS)
- P3-1 Inspiration Foundation, P3-2 Local Folder and Preview, P3-3 Visual Metadata Index, P3-4 Retrieval, P3-5 Eagle-compatible read-only source, and P3-6 Agent Inspiration Context completed their final acceptance.
- Final regression passed all listed P3 Node/Electron suites, Tool Registry, P1 Permission/Safe File Tools, Agent Core, Chat Tool Calling, Skill UI, auto-update policy, release-version, Project Knowledge, 164 JavaScript syntax checks, and `git diff --check`.
- GPT Strict Review: `PASS / BLOCKERS: 0 / CAN_CLOSE_P3: YES`; recovery tag `v1.3.2-p3-final-acceptance`. P4/P5 remain not started.

## P3-6 Agent Uses Inspiration - 2026-08-10 (CLOSED / PASS)
- Added explicit-request-only, bounded reuse of existing P3-4 local retrieval results as provider-neutral, untrusted Inspiration Context.
- Generic chat bypasses retrieval; disabled/revoked/unavailable sources fail closed. No absolute paths, source bytes, previews, credentials, or new filesystem permissions enter Provider payloads.
- Ordinary Chat Safe File Tools remain unchanged; Git, Controlled Execute, Shell, PowerShell, delete, P4, and P5 remain unavailable.
- GPT Strict Review: `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / CAN_CLOSE_AND_TAG: YES / NEXT_STAGE_ALLOWED: P3 Final Acceptance`.

## Teemo Project Knowledge SSOT - 2026-08-10（P3-6 CLOSED / PASS）

- 新增唯一项目知识目录 `docs/TeemoProjectKnowledge/`，以 `INDEX.md` 为所有 Teemo 自身开发 Agent 的强制入口，`CURRENT-STATE.md` 为当前项目状态权威摘要。
- 新增 `project:knowledge:sync` 和 `project:knowledge:verify`，同步版本、latest recovery tag 与 Last Verified Git Snapshot；verify 从实时 Git 查询 branch/HEAD/worktree，不要求 tracked 快照永久相等，并验证 Project Knowledge 基础结构。
- `AGENTS.md` 现强制统一 Pre-Flight/Post-Flight：开工先读取 Project Knowledge，完成后 sync/verify PASS 才能提交 Implementation Evidence。
- 未实现 Vector DB、Embedding、Semantic Search、Cloud Sync、Agent Memory、P3-6、Desktop Automation 或后台 daemon；P3-5 已关闭，P3-6 仍需独立 Taskbook。

## TeemoChatAgentToolCalling Maintenance M1 - 2026-08-10（PASS / BLOCKERS: 0）

- 普通 Chat 接入 Provider-neutral Native Tool Calling；结构化 `tool_calls` 统一经 `TeemoAgentCore`、Tool Registry、P1 Permission、File IPC 和 Main Process `TeemoFileService` 执行，Safe File Tool 路径不从 Renderer 直接执行 filesystem I/O。
- 普通 Chat Safe File Tool allowlist 为 `list_directory`、`read_file`、`search_files`、`search_text`、`create_file`、`patch_file`、`rename_file` 和 `create_directory`。
- M1 正式路径契约为 P1 authorized root 内的明确真实路径；未授权、越界和 Permission DENY 均 fail closed。`create_directory` 不覆盖、不删除，且不使用 PowerShell 或 Shell。
- 已验证当前兼容 Provider 的 Native Tool Calling、普通 Chat `read_file`、`create_directory`、Permission DENY 和保持原始 `tool_call_id` 的第二轮 tool-result continuation。
- Git Tools、Controlled Execute、任意 Shell/PowerShell、任意程序执行、delete 和 destructive operation 不向普通 Chat 开放。P3-3 未修改，P3-4/P3-5/P3-6 已关闭。
- 自然语言 authorized-root alias / root grounding 保留为非阻塞后续 UX Enhancement；当前状态见 `docs/TeemoProjectKnowledge/CURRENT-STATE.md`。

## P3-3 Visual Metadata Index - 2026-08-10（CLOSED / PASS）

- 新增 manifest + source-sharded revisioned JSONL Metadata Index、bounded Local Folder Scanner、Index Service、Main IPC、Renderer Client 和 metadata list UI。
- 支持 user-triggered Build/Refresh/Rebuild、增量 metadata reuse、进度/取消、timeout、stable pagination、Source remove cleanup 和显式 corruption recovery。
- PNG/JPEG/WEBP/GIF 只读取最多 1 MiB header以确认 MIME/dimensions；不完整 decode、不计算 source content hash、不修改 Source。
- 继续复用 P1 authorized roots 与 `inspiration://local-folder/<sourceId>` read Permission；撤权后隐藏已有 metadata。
- P3 三阶段专项、22/22 P1/P2 Node、9/9 既有 Electron、32/32 benchmark、auto-update、语法、diff 与版本检查全部通过；等待 GPT Strict Review。
- P3-3 closure scope did not implement Search、Embedding、Vector、Image Search、Eagle、NAS、Web、Watcher 或 Inspiration Agent Context；subsequent P3-4/P3-5 work is recorded above.
- GPT Strict Review：`PASS / BLOCKERS: 0 / CAN_CLOSE_AND_TAG: YES / NEXT_STAGE_ALLOWED: P3-4`。
- 已创建 close commit 和 annotated recovery tag：`v1.3.0-p3.3-visual-metadata-index`；remote push 未执行。

## P3-2 Local Folder Connector - 2026-08-09（CLOSED / PASS）

- 新增独立 Local Folder Source Registry、只读 Main Process Connector/Service/IPC 和“我的灵感”来源浏览 UI。
- 只复用 P1 authorized roots；Source Registry 不具有授权效力，每次读取使用 source-specific Permission resource 与一次性 execution authorization。
- 支持受限非递归目录浏览、实时 metadata 和 PNG/JPEG/WEBP/GIF 按需 preview；拒绝 traversal、UNC/device、link/junction、错误 signature 和超大文件。
- 移除 Source 不删除用户文件、不撤销 P1 root；P1 撤权后立即 fail closed，并支持显式重新授权。
- P3-2/P3-1 专项、22 组 P1/P2 Node、10 组既有 Electron、32-case benchmark、自动更新、语法、diff 与版本检查全部通过。
- 未实现 Metadata Index、Embedding、Vector、Search、Eagle、NAS 或 Agent Context。
- GPT Strict Review 确认 `PASS / BLOCKERS: 0 / CAN_CLOSE_AND_TAG: YES / NEXT_STAGE_ALLOWED: P3-3`；恢复标签为 `v1.3.0-p3.2-local-folder-connector`。

## P3-1 Inspiration Foundation - 2026-08-09（CLOSED / PASS）

- 新增独立 `Teemo-inspiration-state.json`，默认关闭，支持文件锁、optimistic revision 与损坏状态 fail closed。
- 新增只读 Connector Contract、Registry、P1 Permission Access Guard 和 Service；生产 Registry 保持为空。
- 独立聊天新增“我的灵感”最小管理页，只显示隐私边界、基础开关、状态和空来源列表。
- 未接入真实素材来源、索引、Embedding、Vector Store、检索或 Agent Context；P2 事实源与消息顺序不变。
- 新增三组隔离专项测试；开发版本升至 1.3.0，已安装生产版仍为 1.2.1，当前不构建、不安装。
- GPT Strict Review 确认 `PASS / BLOCKERS: 0 / CAN_CLOSE_AND_TAG: YES / NEXT_STAGE_ALLOWED: P3-2`。

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
- P5-1 Autonomous Planning is implemented and waiting for external GPT Strict Review. Explicit planning produces bounded, session-local proposed plans through a provider-neutral no-Tool request; plan data is never executed or persisted.
- P5-2 Autonomous Execution / Verification and P5-3 Controlled Self-Upgrade remain not started. Version remains `1.3.2`; no installer build, installation, restart, close commit, or tag was created.
