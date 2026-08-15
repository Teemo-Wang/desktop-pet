# Current Task

## Teemo Three-Level Approval Mode (IMPLEMENTED / DEPLOYED)

```text
EXTERNAL_REVIEW_DEPLOYMENT_GATE: REMOVED
LOCAL_VERIFICATION_GATE: REMOVED
AUTO_DEPLOY_AFTER_CHANGE: ACTIVE
BUILD_AFTER_CHANGE: REQUIRED
INSTALL_AFTER_CHANGE: REQUIRED
RESTART_AFTER_CHANGE: REQUIRED
FORMAL_USER_DATA_PROTECTION: ACTIVE
```

- Chat permission UX now mirrors ChatGPT’s three levels: `请求批准` / `帮我批准` / `完全访问`.
- Composer no longer shows the “支持图片、MP4/MOV…” hint text.
- `完全访问` expands Safe File roots to local drive letters, so Chat/local-document no longer requires pre-authorizing folders. `ask` / `assisted` still use authorized folders. Git/Execute/Inspiration keep authorized roots.
- Default approval mode is `full`. High-risk execute / desktop click / ComfyUI always ask.
- Decision: `D-2026-08-12-05`.

## Teemo Single-Pass Chat Orchestration (IMPLEMENTED / DEPLOYED)

```text
EXTERNAL_REVIEW_DEPLOYMENT_GATE: REMOVED
LOCAL_VERIFICATION_GATE: REMOVED
AUTO_DEPLOY_AFTER_CHANGE: ACTIVE
BUILD_AFTER_CHANGE: REQUIRED
INSTALL_AFTER_CHANGE: REQUIRED
RESTART_AFTER_CHANGE: REQUIRED
FORMAL_USER_DATA_PROTECTION: ACTIVE
```

- Removed the default pre-send Structured AI Intent classifier from ordinary Chat. Most messages now go through one Provider request (single-pass).
- Ordinary `normal_chat` stays tool-free and streaming; Safe File tools are exposed only on the `safe_file_operation` route so greetings remain fast and reliable.
- Local high-confidence rules remain for planning, cancel, absolute/relative Safe File phrasing, inspiration retrieval, execute-current-plan, and self-upgrade. Missing prerequisites soft-fallback to normal Chat instead of hard-stopping conversation.
- Classifier helpers remain in code for compatibility but are not used by the Chat send path.
- Focused Node + isolated Electron V1.4 / V1.4.1 suites pass. P1/Main/Tool allowlist, Git/Shell/Execute exposure, and formal user data are unchanged.
- Auto-deploy completed: installer SHA-256 `367525A12E398FA6BE2854FFCF6ACCF99FCB38B7CD2860F158CA2E171E0BD92E`; packaged and installed `app.asar` both hash to `E01E5844877C9CDA8ED02568DC5F6FEDB8AA6CACA906938C0924034B3D87DFCC`; silent install exit `0`; formal `1.3.2.0` restarted with four processes.
- Hotfix: restored tool-free streaming for ordinary `normal_chat` after greetings regressed through non-streaming native tool calling (`操作执行失败` / stuck `思考中`).

## Teemo Auto-Deploy After Change (IMPLEMENTED / ACTIVE)

```text
EXTERNAL_REVIEW_DEPLOYMENT_GATE: REMOVED
LOCAL_VERIFICATION_GATE: REMOVED
AUTO_DEPLOY_AFTER_CHANGE: ACTIVE
BUILD_AFTER_CHANGE: REQUIRED
INSTALL_AFTER_CHANGE: REQUIRED
RESTART_AFTER_CHANGE: REQUIRED
FORMAL_USER_DATA_PROTECTION: ACTIVE
```

- Removed every deployment-time review gate: external GPT Strict Review, WAITING REVIEW, and the previous local verification suite no longer block build/install/restart.
- After any packaged-application change, the same Agent task must automatically rebuild the installer, install the current version, and restart the formal app so the user immediately runs the latest change.
- Hard safety boundaries remain: no formal-user-data mutation, destructive Git, automatic remote push, Shell/PowerShell expansion in ordinary Chat, or unknown dirty build input.
- Next product focus for Chat is Single-Pass orchestration (D-2026-08-12-04), guided by the user-provided P0-P5 overview while concrete fixes follow the local architecture audit.

## V1.4.1 Hotfix — Safe Normal Chat Fallback (IMPLEMENTED / DEPLOYED)

- Fixed the V1.4.1 regression where classifier timeout, unavailability, malformed/invalid output, unsupported or inconsistent intent, and low confidence could stop ordinary conversation before `runToolFreeStream()`.
- Every unreliable classifier result now resolves to `normal_chat` with zero Provider Tool definitions and no Safe File, Permission, P5-2, or P5-3 calls. The tool-free response answers ordinary conversation normally; an apparently effectful request may only ask the user to explicitly reconfirm or restate the action.
- The focused runtime change is limited to ordinary Chat fallback dispatch. No keyword table, intent-schema change, Tool, P1, P5-2, P5-3, Tool Registry, IPC, or Main Process change was made.
- The isolated ordinary Chat Electron E2E passes low-confidence, timeout, unavailable, malformed JSON, unsupported intent, effectful-failure non-escalation, and valid Safe File/P5-2/P5-3 routing regressions. Local deployment is allowed after the full local gate and dirty-build-input audit pass; external review remains optional/recommended and no longer blocks build/install/restart.
- Immediate Send Feedback follow-up fixes the visible pre-send pause: after a valid click, a local-only user bubble and `正在理解你的需求…` state render on the next animation frame before Structured Intent returns. The preview performs no history persistence, Provider Tool exposure, Permission call, or side effect; it is atomically replaced by the validated route lifecycle. New drafts and attachments entered while classification is pending are preserved.
- The delayed-classifier Electron E2E reports `IMMEDIATE_LOCAL_SEND_PREVIEW: PASS`, `CLASSIFIER_DELAY_BLOCKS_LOCAL_MESSAGE_RENDER: NO`, and `WAITING_DRAFT_PRESERVATION: PASS`. V1.4/V1.4.1, Agent Core, M1/M2, P1, Safe File, and P5-2 affected regressions pass with isolated profiles.
- Immediate Send Feedback deployment completed on 2026-08-12. Installer SHA-256 is `48D98042DF54671B3E62125B2A6422A2B834DFC3C53CACEFD28BB7AB75CF0956`; packaged and installed `app.asar` both hash to `D53181BA42ADF5ADCB065392475792154E19899FF0CAFD9CB42553519447C801`; silent install returned `0`; formal `1.3.2.0` restarted with four processes. The complete 55-file formal-profile manifest and `local-file-access.json` hashes remained byte-identical across installation.
- Local-gate deployment completed on 2026-08-12. Installer `Teemo-1.3.2-x64.exe` SHA-256 is `464B70DBCCA09CC49D2EB9333952030E8D81DE35E25CA308DA2A171CEC9666F7`; packaged and installed `app.asar` both hash to `5A73374530E930AAB18FC05A2849625FF07FF663A64BE1D6DB441F25A866E8A7`; silent install returned `0`; formal `1.3.2.0` restarted with four processes. The 54-file formal-profile manifest and `local-file-access.json` hashes remained byte-identical.

## Teemo V1.4.1 — AI Intent Orchestration Optimization (IMPLEMENTED / STRICT REVIEW PASS / DEPLOYED)

- Taskbook: `docs/Teemo-V1.4.1-AI-INTENT-ORCHESTRATION.md`.
- The proposal replaces broad keyword authority with a bounded hybrid flow: only explicit high-confidence local controls remain deterministic; other natural language receives a zero-Tool Structured AI Intent classification, followed by strict local confidence, capability, state, and route-exposure validation.
- The six proposed routes are existing capability classes only: normal Chat, Safe File, Inspiration, P5-1 planning, P5-2 execution, and P5-3 controlled self-upgrade.
- P5-3 ordinary Chat integration reuses the current owner-bound controller, dedicated registries, repository selection, immutable manifest, approvals, P1/Main enforcement, and evidence. Git/Execute Tools remain absent from ordinary Chat.
- Historical V1.4.1 pre-implementation gate (satisfied on 2026-08-11): implementation originally waited for external Taskbook approval. Under the active 2026-08-12 policy, this history does not gate local build/install/restart.
- First Strict Review returned `FAIL / BLOCKERS: 1 / IMPLEMENTATION_ALLOWED: NO` for one Taskbook-only contradiction: an unsupported P4/ComfyUI/desktop value could not both violate the closed intent enum and reach capability validation. The E2E now rejects it at strict schema validation with zero exposure/execution and is waiting re-review.
- Second Strict Review found that a scan-style execute-current-plan rule could intercept a compound Teemo self-modification request before AI classification. The Taskbook now permits local `autonomous_execution` only for an anchored whole-command ordinary-plan execution request; any appended new/self-modification target must go to Structured AI Intent. Implementation remains not started.
- Third Strict Review correctly noted that current P5-1 state has no trusted local P5-2/P5-3 plan-type marker, so even a standalone `执行刚才计划` could be misrouted. The Taskbook now removes that local shortcut entirely: all current-plan execution requests use Structured AI Intent plus the bounded plan summary, then local validation selects the existing P5-2 or P5-3 controller. Implementation remains not started.
- Final Taskbook Strict Review returned `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / IMPLEMENTATION_ALLOWED: YES`. This remains historical closure evidence; current local deployment no longer requires a second external review.
- Implemented the approved zero-Tool Structured AI Intent path, closed schema/confidence fail-safe, live local capability/state validation, sixth P5-3 route, and shared existing P5-3 Chat/button orchestration. Execute-current-plan always uses AI classification because current plans have no trusted P5-2/P5-3 type marker.
- New isolated ordinary Chat Electron E2E completes real Safe File/M2, P5-2, and synthetic P5-3 repository/manifest/patch/hash/diff/test/evidence flows. Focused and affected V1.4, M1/M2, P1/P3/P5 regressions pass with formal data untouched.
- External implementation-evidence Strict Review returned `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / IMPLEMENTATION_ACCEPTED: YES / DEPLOYMENT_ALLOWED: YES`. Deployment passed: installer `E2DBAF46...3390C`, built and installed `app.asar` `EC9B78DF...EA6A`, silent install exit `0`, formal `1.3.2.0` restart with four processes, and byte-identical authorized-root configuration `3A2A3949...CF43F8`. No close commit/tag was created from the mixed worktree.

## Blocked Planning Execution UX Maintenance (IMPLEMENTED / DEPLOYED)

- Root cause of the observed `A blocked plan step cannot be executed.` failure was a planning-status semantic gap plus misleading UI: planning-only requests could be emitted as `blocked`, while the UI displayed “待确认” and enabled execution.
- Planning now uses `proposed` for actionable future work even when the user says not to execute yet. `blocked` is reserved for a named missing prerequisite and is never auto-unblocked.
- Truly blocked plans stop locally before run approval, Provider, Tool, Permission, or Main calls; the UI explains the blocker in Chinese and requires plan revision.
- Planning, execution, V1.4 ordinary Chat, M2, Agent Core, release-version, and isolated Electron regressions pass.
- Installer `D315610E...0C67B` built and installed with exit `0`; installed `app.asar` matches the build at `2EC2E820...2FE01F`; formal `1.3.2.0` restarted; authorized-root configuration remained byte-identical.

## V1.4 Follow-up — Route-Specific Tool Exposure (IMPLEMENTED / WAITING REVIEW / USER-AUTHORIZED DEPLOYMENT COMPLETE)

- The deterministic route now controls Provider capability exposure: `normal_chat` and `inspiration_retrieval` use a context-preserving tool-free Agent Core stream; only `safe_file_operation` receives the existing eight Safe File definitions.
- Planning remains Provider-tool-free. Autonomous execution remains on the unchanged P5-2 bounded surface.
- Required ordinary Chat Electron scenarios pass: both normal prompts have zero Provider definitions, zero Tool calls, zero Permission calls, and normal replies; the settings-panel request no longer becomes `invalid_request`; Safe File read/patch each expose eight definitions; P1 write confirmation and M2 canonical arguments remain intact.
- Acceptance: `NORMAL_CHAT_TOOLS_EXPOSED: NO`, `SAFE_FILE_ROUTE_TOOL_COUNT: 8`, `CHAT_SAFE_FILE_ALLOWLIST_CHANGED: NO`, `M2_CHANGED: NO`, `P1_CHANGED: NO`.
- The user explicitly authorized pre-review deployment. Build and packaged-content checks passed; installer SHA-256 is `631FB05E...185E0`, installed `app.asar` matches the build at `3D765D46...B9363`, silent installation returned `0`, formal version `1.3.2.0` restarted, and the authorized-root configuration remained byte-identical at `3A2A3949...CF43F8`.
- Next gate remains external GPT Strict Review. No close commit or tag is allowed before review.

## Teemo V1.4 Productization & Stability (IMPLEMENTED / STRICT REVIEW PASS / DEPLOYED)

- Taskbook: `docs/Teemo-V1.4-PRODUCTIZATION-STABILITY.md`.
- Scope is productization of existing P0-P5 + M2 behavior only: accurate capability awareness, deterministic routing among normal Chat / Safe File / Inspiration / planning / existing autonomous execution, cross-layer Tool contract drift protection, user-facing error normalization, one public execution-state vocabulary, and Chat-first access to existing paths.
- Implemented the approved minimal path: one pure `TeemoChatProductization` contract plus focused Chat Window wiring and isolated tests.
- Explicitly excluded: new Tools, new IPC/Main capability, new ComfyUI workflow, Vision/OCR, desktop actions, design-app integrations, new Inspiration sources, Embedding/Vector, Git/Shell/Controlled Execute exposure, self-upgrade expansion, P6 features, persistence/version changes, and broad refactors.
- Taskbook external GPT Strict Review returned `PASS / BLOCKERS: 0 / IMPLEMENTATION_ALLOWED: YES`. The second implementation-evidence review returned `PASS / BLOCKERS: 0 / IMPLEMENTATION_ACCEPTED: YES / DEPLOYMENT_ALLOWED: YES / CAN_CLOSE_AND_TAG: YES after deployment verification`.
- Ordinary Chat now routes natural language deterministically, provides a bounded actual-capability snapshot, sends exactly eight Safe File Provider definitions only on the `safe_file_operation` route, reuses existing P5 execution safety, normalizes seven user-facing error categories, and exposes eight public states with stale callback rejection.
- New isolated ordinary Chat E2E passes all five routes, Safe File read/write, P1 allow/deny/timeout, M2 canonicalization, Main execution and second Provider response, Inspiration, planning/execution, no-plan denial, capability redaction, and error leakage denial with formal data untouched.
- The existing M2 follow-up remains separately `IMPLEMENTED / WAITING REVIEW / USER-AUTHORIZED DEPLOYMENT COMPLETE`; its changes must not be overwritten or mixed into a V1.4 close commit.
- Reviewer-confirmed isolated build used pre-implementation marker `v1.3.2-v1.4-pre-implementation-20260811` (`371d6379...`) plus exactly three reviewed packaged runtime files. Build, content verification, silent install (`0`), installed hash verification, formal-data preservation, and restart passed. No mixed-worktree close commit/tag was created.
- Final deployment evidence was returned to the external GPT conversation and accepted with `FINAL_DEPLOYMENT_ACCEPTED: YES`.

## M2 Follow-up — Safe File Tool Argument Normalization (IMPLEMENTED / WAITING REVIEW)

- Scope is limited to Provider -> Safe File Tool argument normalization. P1 permissions, ordinary Chat allowlist, File Tool count, validator strictness, version, persistence, and all V1.4 scope remain unchanged.
- Root cause: trusted root grounding previously ran during File IPC preparation, after Tool Registry schema validation, and `...args` retained resolved `rootReference` plus legacy `path`.
- Safe File Tool definitions now use one internal Main-backed `normalizeArguments` hook. Main resolves current roots and returns canonical provider arguments before Registry validation; successful execution receives only `rootId + relativePath` (plus tool-specific non-routing fields). `rootReference`, `path`, and rename `newPath` are removed before validation.
- Main File IPC preparation independently grounds the already normalized contract again and alone adds trusted absolute `path`/`newPath` for the unchanged `TeemoFileService` boundary.
- Agent Context now explicitly requires exactly one root selector and forbids legacy `path` when a structured selector is present. The Provider adapter itself remains pass-through and the existing strict grounding contract remains fail closed.
- New real ordinary Chat Electron E2E sends only `读取 Teemo-source 下的 docs/TeemoProjectKnowledge/INDEX.md`, deliberately receives mixed native arguments (`rootId + rootReference + path`), captures the final pre-validation/preparation arguments as exactly `{ rootId, relativePath }`, then completes Tool Registry -> P1 -> File IPC -> Main FileService -> file content -> Tool Result -> second Provider response.
- Acceptance: `TOOL_ARGUMENT_NORMALIZATION: PASS`, `ROOTID_ONLY_AFTER_GROUNDING: PASS`, `ROOTREFERENCE_REMOVED_AFTER_RESOLUTION: PASS`, `LEGACY_PATH_REMOVED: PASS`, `REAL_CHAT_INDEX_READ_E2E: PASS`.
- Regression: existing M2 ordinary Chat E2E, M1 Native Tool Calling, Agent Core, Tool Registry, P1 Permission, File Tools Node/dual-renderer Electron, and P5-2 Node/Electron all pass with isolated profiles/synthetic data only.
- Required next gate: external GPT Strict Review. The user explicitly authorized a pre-review deployment on 2026-08-11: `Teemo-1.3.2-x64.exe` rebuilt successfully, silent installation returned `0`, installed `app.asar` matches the build at SHA-256 `28FEEAE18FD2FC669E60F886AE0C6231D53EA85EE6F73BE82602B244A6DDE6E4`, formal version is `1.3.2.0`, and the application restarted with the existing `D:\\` authorized root preserved. Status remains `IMPLEMENTED / WAITING REVIEW`; no close commit or tag is allowed before review.

## Teemo Agent Post-Change Deployment Rule (ACTIVE)

- `AGENTS.md` now requires every completed AI Agent change that affects the packaged Windows application to rebuild `dist\Teemo-${version}-x64.exe`, verify packaged content, install the current verified version, restart the formal `Teemo助理.exe`, and verify the installed version in the same task.
- Deployment starts only after all applicable local tests, Project Knowledge, release-version, diff, data-protection, security-boundary, and build-input gates pass. External review is optional/recommended and is not a deployment prerequisite; explicit user opt-out and non-Review safety restrictions remain authoritative stops.
- “Latest version” means the current verified `package.json` version; this rule never authorizes an automatic version bump.
- Formal user data and configuration must not be reset, overwritten, or migrated by the deployment step. Failures stop safely and must be reported with the failed stage.
- Documentation-, test-, development-script-, and Project-Knowledge-only work does not trigger a Windows rebuild/install/restart. This rule change therefore does not deploy the application.

## Teemo Maintenance M2 — Authorized Root Discovery & Grounding (GPT STRICT REVIEW PASS / CLOSE AUTHORIZED)

- Objective: make ordinary Chat reliably read files under current P1 authorized roots without asking the Provider to invent Windows absolute paths.
- Added one Main-side trusted grounding module. Active roots are exposed to the Provider only as `rootId`, `displayName`, `capabilities`, and fixed safe aliases; absolute root paths are not included in discovery metadata.
- All eight ordinary Chat Safe File Tools now accept the same provider-facing structured contract: `rootId` or an exact unique `rootReference` plus `relativePath`. Exact absolute path input remains compatibility-only and is converted to `rootId + relativePath` by Main before the unchanged FileService path.
- Display-name and alias resolution is exact and case-insensitive. Ambiguous aliases do not guess; stale/revoked roots fail closed. Outside-root absolute paths, traversal, UNC/device paths, ADS, and symlink/junction escapes remain rejected.
- The ordinary Chat absolute-path read intent now stays on the Native Tool Calling route instead of being intercepted by the older local-document attachment shortcut.
- New Node coverage verifies discovery metadata, exact/case-insensitive/alias grounding, ambiguity, revoked/stale roots, relative/absolute path validation, outside-root denial, absolute conversion, symlink/junction containment, and schema/runtime consistency for all eight tools.
- New isolated real Chat Window Electron E2E uses only synthetic profile/root/files and passes displayName, alias, authorized absolute path, outside-root denial, Provider native Tool Call, Tool Registry, P1, File IPC, Main FileService, and second Provider response.
- M1 Native Tool Calling, P1 Permission, Safe File Tools, Tool Registry, Agent Core, and P5 execution Node/Electron regressions pass. Ordinary Chat allowlist, Git/Controlled Execute/Shell/delete exposure, version, persistence, and closed P5 semantics are unchanged.
- External GPT Strict Review: `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / CAN_CLOSE_AND_TAG: YES`.
- The review confirms the two real failures are resolved and lists alias UI, typo tolerance, fuzzy/semantic matching, and learned aliases as non-blocking. Its only operational note is to isolate any M2 close commit from the existing desktop-pet maintenance changes.
- Post-review deployment completed on 2026-08-11: `Teemo-1.3.2-x64.exe` rebuilt from the current worktree, silent installation returned `0`, installed `app.asar` SHA-256 is `1597E29399C64C25F64EA9F87749CC1A2B61BC81A51AC549A4EEB98C2996D5FD`, the M2 grounding runtime is present, formal version is `1.3.2.0`, and the formal application restarted successfully. The existing `D:\` authorized root remains available.
- Next allowed action: M2 close commit/tag only. No close commit, recovery tag, or remote push has been created in the mixed worktree.

## Desktop Pet Interaction Maintenance (IMPLEMENTED / REAL WINDOWS VERIFIED)

- Scope: restore reliable desktop-pet click/drag behavior, right-bottom initial placement, and the current authoritative pet image without changing closed P5 scope.
- The production renderer now loads `TeemoPlanningContract` in the required order and avoids browser-side CommonJS export execution, allowing `PetComponent` and its click/drag handlers to initialize.
- Windows Main Process polls the cursor against renderer-published interactive regions. Win32 physical client coordinates are normalized to Electron content coordinates across mixed DPI and multiple displays, and native `WS_EX_TRANSPARENT` is explicitly synchronized when passthrough changes. The visible pet and open UI receive clicks while the remainder of the transparent work-area window falls through; an active drag captures input until release.
- Initial placement waits for a valid viewport and keeps a CSS right-bottom fallback. `pet.png` now exactly matches `D:\Teemo助手\Teemo.png`; duplicate early custom-skin restoration was removed and the existing Preferences path remains authoritative.
- The current profile now selects the default bundled skin; its previous custom image bytes remain preserved and were not deleted.
- Focused Node, isolated Electron smoke, and full-index Electron smoke verify the asset hash, 812 x 812 decode, startup-module initialization, cursor hit testing, renderer ownership, drag lifecycle, and click-to-open Dock.
- Windows installer build, packaged `app.asar` verification, per-user installation, and formal application restart passed; installed product version is `1.3.2.0`.
- The Koffi native binary is explicitly unpacked for production. Real Windows checks on the installed application confirmed inside/outside passthrough transitions, a physical `(-365, -265)` drag, and physical click-to-open of the AI panel.
- This maintenance does not change P5 scope, Tool exposure, permissions, persistence schema, version, or recovery tags.

## P5-3 Controlled Self-Upgrade (CLOSED / PASS / BLOCKERS: 0)

- Taskbook: `docs/Teemo-P5-3-CONTROLLED-SELF-UPGRADE.md`.
- External GPT Strict Review: `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / IMPLEMENTATION_ALLOWED: YES / P5_FINAL_STARTED: NO`.
- P5-3 implementation completed within the approved Taskbook: one owner-controlled, memory-only upgrade session over a clean authorized Teemo repository -> immutable manifest -> existing-file patches through P5-2/P1/Main -> read-only Git verification -> baseline-bound npm verification -> evidence.
- Initial scope forbids create/delete/rename, package/dependency mutation, Git writes/remotes, arbitrary process/Shell, desktop/ComfyUI, installation/restart, persistence/background execution, recursive self-upgrade, auto-close/tag, and P5 Final Acceptance.
- P5-2 remains closed under `v1.3.2-p5.2-autonomous-execution-verification`; P5 Final Acceptance remains `NOT STARTED`.

## P5-2 Autonomous Execution & Verification (CLOSED / PASS / BLOCKERS: 0)

- Taskbook: `docs/Teemo-P5-2-AUTONOMOUS-EXECUTION-VERIFICATION.md`.
- External GPT Strict Review: `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / IMPLEMENTATION_ALLOWED: YES / P5_3_STARTED: NO / P5_FINAL_STARTED: NO`.
- P5-2 implementation is authorized only within the approved Taskbook.
- Implemented path: P5-1 plan -> explicit user-approved bounded execution run -> state tracking -> trusted result verification -> finite retry or stop / fail / ask user.
- The implementation requires `maxSteps`, `maxRetries`, timeout, cancellation, P1 Permission, Main Process execution, and fresh explicit owner confirmation for every side-effecting step.
- Existing ordinary Chat Safe File Tools are the only execution surface. Git, Controlled Execute, Shell, PowerShell, program execution, delete, destructive operations, desktop/ComfyUI actions, P5-3, self-upgrade, a background daemon, and persistent execution are excluded.
- P5-1 remains closed under recovery tag `v1.3.2-p5.1-autonomous-planning`; P5-3 and P5 Final Acceptance remain `NOT STARTED`.
- Implemented one owner/plan-bound in-memory execution state machine with explicit run approval, exact write-step confirmation, mandatory bounded limits, cancellation, timeout, and no restart resume or background continuation.
- Each provider action is restricted by Agent Core to the unchanged eight Safe File Tools. Tool execution and fresh postcondition verification reuse Tool Registry -> P1 Permission -> File IPC -> Main Process FileService.
- Focused Node/Electron acceptance and P1/M1, P2, P3, P4, and P5-1 regressions pass with isolated synthetic data. No release build, install, restart, close commit, or recovery tag was created.
- External GPT Strict Review of implementation evidence: `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / CAN_CLOSE_AND_TAG: YES / NEXT_STAGE_ALLOWED: P5-3 Taskbook Review only / P5_3_STARTED: NO / P5_FINAL_STARTED: NO`.
- P5-2 is closed under recovery tag `v1.3.2-p5.2-autonomous-execution-verification`. P5-3 implementation and P5 Final Acceptance remain `NOT STARTED`.

## P5-1 Autonomous Planning (CLOSED / PASS / BLOCKERS: 0)

- Taskbook: `docs/Teemo-P5-1-AUTONOMOUS-PLANNING.md`.
- Scope is explicit planning only. It may generate, revise, and discard a bounded session-local plan, but must not execute Tools, request P1 Permission, access filesystem or desktop capabilities, call ComfyUI, run Shell/programs, or self-upgrade.
- External GPT Strict Review: `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / IMPLEMENTATION_ALLOWED: YES / P5_2_STARTED: NO / P5_3_STARTED: NO`.
- External GPT Strict Review of implementation evidence: `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / CAN_CLOSE_AND_TAG: YES / P5_2_STARTED: NO / P5_3_STARTED: NO`.
- P5-1 is closed under recovery tag `v1.3.2-p5.1-autonomous-planning`. P5-2, P5-3, and P5 Final Acceptance remain not started and require separate Taskbooks.

## P4 Final Acceptance (CLOSED / PASS / BLOCKERS: 0)

- P4-1/P4-2/P4-3 are independently `CLOSED / PASS / BLOCKERS: 0`; P4-3 recovery tag: `v1.3.2-p4.3-design-tool-workflows`.
- Taskbook: `docs/Teemo-P4-FINAL-ACCEPTANCE.md`.
- Scope is final verification/evidence only. It adds no P4 feature, Tool, provider flow, desktop adapter, permission scope, network/filesystem capability, version change, installer, install, or restart.
- External GPT Strict Review: `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / IMPLEMENTATION_ALLOWED: YES / P5_STARTED: NO`.
- P4 final verification, focused P4 Node/Electron acceptance, and P1/M1, P2, and P3 regressions passed using synthetic test data only.
- Final implementation-evidence Strict Review: `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / CAN_CLOSE_AND_TAG: YES / NEXT_STAGE_ALLOWED: P4 Final close commit/tag only; P5 NOT ALLOWED / P5_STARTED: NO`.
- P4 is closed under recovery tag `v1.3.2-p4-final-acceptance`. P5-1 is later closed under its own recovery tag; P5-2/P5-3 remain not started.

## P4-3 Design Tool Adapters / Workflows (CLOSED / PASS / BLOCKERS: 0)

- P3 Personal Inspiration is `CLOSED / PASS / BLOCKERS: 0`; recovery tag: `v1.3.2-p3-final-acceptance`.
- P4-1 Runtime / Screen Awareness is `CLOSED / PASS / BLOCKERS: 0`. Its implementation evidence received external GPT Strict Review: `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / CAN_CLOSE_AND_TAG: YES / NEXT_STAGE_ALLOWED: P4-2 Taskbook Review only`.
- P4-1 closed capability: explicit local display selection, P1 read permission, one-shot Main execution authorization, owner-bound Main capture, bounded in-memory local preview, discard, and expiry. Provider/Agent calls for screen data remain zero.
- P4-1 used only injected synthetic data in Node and isolated Chat Window Electron smoke. It adds no Provider/Agent screen context, ordinary Chat Tools, desktop actions, mouse/keyboard/clipboard access, filesystem persistence, Shell, PowerShell, Git, Controlled Execute, program execution, delete, or destructive behavior.
- P4-2 Taskbook is `docs/Teemo-P4-2-CONTROLLED-DESKTOP-ACTIONS.md`: only a user-confirmed, one-time primary click selected from an owner-bound fresh P4-1 local preview. It is provider/Agent/ordinary-Chat neutral.
- P4-2 Taskbook external GPT Strict Review: `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / IMPLEMENTATION_ALLOWED: YES`.
- P4-2 Controlled Desktop Actions is `CLOSED / PASS / BLOCKERS: 0`; its implementation evidence received external GPT Strict Review: `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / CAN_CLOSE_AND_TAG: YES / NEXT_STAGE_ALLOWED: P4-3 Taskbook Review only`.
- P4-2 closed capability: a user-confirmed, one-time primary click selected from a fresh owner-bound P4-1 preview. Main-only validation and P1 `execute` + `once` Permission remain mandatory. Its recovery tag is `v1.3.2-p4.2-controlled-desktop-actions`.
- P4-3 Taskbook: `docs/Teemo-P4-3-DESIGN-TOOL-WORKFLOWS.md`. It authorizes one Main-only fixed local ComfyUI built-in render adapter, per-request P1 `execute` + `once` permission, and owner-bound bounded memory preview.
- P4-3 external GPT Strict Review: `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / IMPLEMENTATION_ALLOWED: YES`. P4-3 implementation is authorized only within this Taskbook; P4 Final Acceptance and P5 are not started.
- Implemented the approved single Runtime-only adapter: `teemo_comfyui_builtin_sdxl`. Its Main Process loopback transport is fixed to `http://127.0.0.1:8188`; Main builds the static SDXL workflow with the reviewed RTX 4070 Ti 12GB profile. Renderer can submit only a bounded local prompt and bounded dimensions.
- `comfyui_builtin_render` uses the exact `comfyui://local/teemo-builtin-sdxl/v1` P1 `execute` resource and can only receive a one-time authorization. Prepared work, the authorization, rendering, and its expiring memory preview are bound to the initiating `webContents`.
- Focused synthetic Node and isolated Chat Window Electron smoke pass. They cover allow/deny, missing execution authorization, owner isolation, expiry/discard, no direct Renderer local-network path, and unchanged ordinary Chat Tool allowlist. P1/M1, P2, P3, P4-1, and P4-2 regressions pass.
- Implementation evidence external GPT Strict Review: `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / CAN_CLOSE_AND_TAG: YES / NEXT_STAGE_ALLOWED: P4 Final Acceptance Taskbook Review only`.
- P4-3 is closed under recovery tag `v1.3.2-p4.3-design-tool-workflows`. P4 Final Acceptance is later closed after its own Taskbook and implementation-evidence Strict Reviews; P5 remains not started.
- Taskbook: `docs/Teemo-P4-1-RUNTIME-SCREEN-AWARENESS.md`.
- P4-1 Taskbook received external GPT Strict Review: `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / IMPLEMENTATION_ALLOWED: YES`.
- Synthetic Node and real Chat Window Electron smoke cover allow/deny, missing execution authorization, owner isolation, expiry/discard, no direct renderer capture, and unchanged ordinary Chat Tool allowlist. P1/P2/P3/M1 regressions passed.
- The authorized P4-1 recovery tag is `v1.3.2-p4.1-runtime-screen-awareness`; no P4-2 code is included in the P4-1 close commit.

## P3 Personal Inspiration Final Acceptance (CLOSED / PASS)

- Active P3-3 metadata snapshots now support local keyword retrieval, source/format/orientation/size filters, newest/oldest/name sorting, and pagination capped at 100 items.
- Results are returned through Main Process retrieval IPC and reuse the existing P3-2 preview path. Revoked, removed, corrupt, unindexed, or disabled sources fail closed.
- P3-4 retrieval itself adds no provider call, source mutation, watcher, second index, Shell, or new filesystem authorization. P3-6 adds only the approved bounded Inspiration Context path.
- P3-4 Strict Review: PASS / BLOCKERS: 0 / CAN_CLOSE_AND_TAG: YES; P3-4 is closed.
- External GPT Strict Review: PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / IMPLEMENTATION_ALLOWED: YES.
- P3-5 More Inspiration Sources: `CLOSED / PASS / BLOCKERS: 0`; close commit `8d9da07` and recovery tag `v1.3.2-p3.5-eagle-library` are present.
- P3-6 Taskbook received GPT Strict Review approval: `PASS / BLOCKERS: 0 / IMPLEMENTATION_ALLOWED: YES`.
- P3-6 Implementation Evidence received GPT Strict Review: `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / CAN_CLOSE_AND_TAG: YES / NEXT_STAGE_ALLOWED: P3 Final Acceptance`.
- P3-6 is closed with commit `79bb4bb` and recovery tag `v1.3.2-p3.6-agent-uses-inspiration`.
- P3 Final Acceptance Taskbook received GPT Strict Review: `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / IMPLEMENTATION_ALLOWED: YES / NEXT_STAGE_ALLOWED: P3 Final Acceptance Evidence only; P4/P5 NOT ALLOWED`.
- Final acceptance verification passed P3/P1/P2 regression, Electron smoke, version, syntax, Project Knowledge, and diff checks.
- Final GPT Strict Review: `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / CAN_CLOSE_P3: YES / NEXT_STAGE_ALLOWED: P3 Final close commit/tag only; P4/P5 NOT ALLOWED`.
- P3 is closed. Recovery tag: `v1.3.2-p3-final-acceptance`. P4/P5 remain not started and require independent approved Taskbooks.

## 当前阶段

- Product：Teemo助理
- Branch：`Teemo/p3-personal-inspiration`
- Phase：P5-3 Controlled Self-Upgrade
- State：`IMPLEMENTED / WAITING REVIEW; P5 Final Acceptance NOT STARTED`
- External GPT Strict Review: `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / CAN_CLOSE_AND_TAG: YES / NEXT_STAGE_ALLOWED: P5 Final Acceptance Taskbook Review only / P5_FINAL_STARTED: NO`.
- P5-3 is closed under recovery tag `v1.3.2-p5.3-controlled-self-upgrade`; P5 Final Acceptance remains `NOT STARTED`.

## P5 Final Acceptance (CLOSED / PASS / BLOCKERS: 0)

- Taskbook: `docs/Teemo-P5-FINAL-ACCEPTANCE.md`.
- External GPT Strict Review: `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / IMPLEMENTATION_ALLOWED: YES / P5_3_STARTED: NO / P5_FINAL_STARTED: NO`.
- Verification-only implementation completed within the approved Taskbook and passed external implementation-evidence Strict Review with zero blockers.
- P5 Final is closed under recovery tag `v1.3.2-p5-final-acceptance`.
- P5-1, P5-2, and P5-3 remain closed; current version remains `1.3.2`.
- Installed App Version：`v1.3.2`
- Development App Version：`v1.3.2`
- P3 Baseline：`cd29e6f` / `v1.2.1-p3-baseline`
- P1 Recovery Tag：`v1.2.0-p1-agent-foundation`
- P2-1 Recovery Tag：`v1.2.0-p2.1-cognition-ui`
- P2-2 Recovery Tag：`v1.2.1-p2.2-creative-profile`
- P2-3 Recovery Tag：`v1.2.1-p2.3-challenge-mode`
- P2-4 Recovery Tag：`v1.2.1-p2.4-cognition-intelligence`
- P2-5 Recovery Tag：`v1.2.1-p2.5-skill-intelligence`
- P3-1 Recovery Tag：`v1.3.0-p3.1-inspiration-foundation`
- P3-2 Recovery Tag：`v1.3.0-p3.2-local-folder-connector`
- P3-3 Recovery Tag：`v1.3.0-p3.3-visual-metadata-index`

## TeemoProjectKnowledge SSOT（P3-6 CLOSED / PASS）

- 新建唯一正式目录 `docs/TeemoProjectKnowledge/`，以 `INDEX.md` 作为所有 Teemo 自身开发 Agent 的强制入口。
- `CURRENT-STATE.md` 负责权威当前摘要；`ROADMAP.md`、`ARCHITECTURE.md`、`DECISIONS.md`、精简 `CHANGELOG.md` 与 `HISTORY/` 按固定职责维护。
- 新增 `project:knowledge:sync` 和 `project:knowledge:verify`；同步版本、latest recovery tag 与 Last Verified Git Snapshot，验证 Project Knowledge 文件结构、版本一致性和状态文档一致性。Git branch/HEAD/worktree 由 Pre-Flight 直接查询，不要求与 tracked 文档永久相等。
- 根目录 `AGENTS.md` 已加入统一 Pre-Flight 与 Post-Flight：先读 Project Knowledge，修改后必须 sync/verify PASS 才能提交 Implementation Evidence。
- P3-5/P3-6 已通过 Strict Review 并关闭；下一步仅限 P3 Final Acceptance Taskbook 与 Strict Review，不开始 P4/P5。

## TeemoChatAgentToolCalling M1（PASS / BLOCKERS: 0）

- 普通 Chat 已接入 Provider-neutral Native Tool Calling：兼容 Provider 的结构化 `tool_calls` 统一进入 `TeemoAgentCore`、Tool Registry、P1 Permission、File IPC 和 Main Process `TeemoFileService`；Safe File Tool 路径不从 Renderer 直接执行 filesystem I/O。
- 普通 Chat 仅开放 Safe File Tool allowlist：`list_directory`、`read_file`、`search_files`、`search_text`、`create_file`、`patch_file`、`rename_file`、`create_directory`。
- M1 正式使用契约是：用户提供位于 P1 authorized root 内的明确真实路径。每次操作仍经 P1 Permission 和 Main Process 最终授权边界；未授权路径、越界路径与拒绝授权均 fail closed。
- 普通 Chat 不开放 Git Tools、Controlled Execute、任意 Shell/PowerShell、任意程序执行、delete 或其他 destructive operation。
- 已完成真实 Provider 的 `read_file` 与 `create_directory` 正常链路，以及 Permission DENY 无文件系统变化验证；`tool_call_id` 以原值作为 `role: tool` 结果回传后继续第二轮 Provider 回复。
- Natural-language authorized-root alias / root grounding 仍可作为后续 UX Enhancement；它不属于 M1 关闭前的阻塞项，模型不得借此获得未授权路径。
- P3-3 与 P3-4 保持既有关闭状态。M1 当前已通过 Gate；详细当前事实见 `docs/TeemoProjectKnowledge/CURRENT-STATE.md`。

## P3-3 已实现

- 新增独立 manifest + source-sharded revisioned JSONL Metadata Index、bounded recursive Scanner、Index Service、Main IPC 和 Renderer Client/UI。
- 只读取 Local Folder 内 PNG/JPEG/WEBP/GIF 的最多 1 MiB header；不完整 decode、不计算素材 content hash、不修改 Source。
- Source identity 复用 P3 sourceId；itemId 使用 sourceId + normalized relative path；rename 为 remove + add。
- Build/Refresh/Rebuild 使用 `inspiration://local-folder/<sourceId>` read Permission 和一次性 `inspiration_metadata_index` execution authorization。
- 支持增量 metadata reuse、进度、取消、timeout、stale writer、显式 corruption rebuild、授权撤销隐藏和 Source removal cleanup。
- P3-6 已关闭受限 Inspiration Context；没有新增 Search、Embedding、Vector、Image Search、NAS、Web 或 Watcher。

## 当前送审证据

1. P3-3 实现与三组专项测试已完成；文档见 `docs/Teemo-P3-3-VISUAL-METADATA-INDEX.md`。
2. P3-3/P3-2/P3-1 各 2 Node + 1 Electron、P1/P2 22/22 Node、9/9 既有 Electron、32/32 benchmark、auto-update、版本、syntax、diff 与 sensitive scan 全部通过。
3. Electron synthetic UI 截图为 2199 x 1316，SHA256 `0c05187d0039e5f43604c54fc93bde5525706db107be884281a57d75def42ba7`，无真实路径、凭据或正式素材。
4. 全部文件将由唯一 implementation commit `Teemo: add P3-3 visual metadata index` 固化；实际 hash 在最终 Evidence 中报告。
5. P3-3 GPT Strict Review 已返回 `PASS / BLOCKERS: 0 / CAN_CLOSE_AND_TAG: YES / NEXT_STAGE_ALLOWED: P3-4`；P3-3/P3-4 已封板并创建 close commit/tag。
6. remote push 未执行，正式 v1.2.1 不安装或重启 P3 开发版。

## 禁止扩展

P3-3/P3-4/P3-5/P3-6 已 `CLOSED / PASS / BLOCKERS: 0`；下一步仅限 P3 Final Acceptance Taskbook 与 Strict Review。仍禁止 Watcher、NAS、Figma、网页平台、Search、Embedding、Vector DB、Image Similarity、Taste Signals、Cloud Sync、Multi-Agent 或 GUI Automation。
