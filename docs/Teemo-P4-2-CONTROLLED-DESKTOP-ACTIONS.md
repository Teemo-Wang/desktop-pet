# Teemo P4-2 Controlled Desktop Actions - Taskbook

Status: `CLOSED / PASS / BLOCKERS: 0`

## Gate

P4-1 Runtime / Screen Awareness is `CLOSED / PASS / BLOCKERS: 0`.
P4-1 external GPT implementation-evidence Strict Review returned:

```text
PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / CAN_CLOSE_AND_TAG: YES / NEXT_STAGE_ALLOWED: P4-2 Taskbook Review only
```

External GPT Strict Review returned:

```text
STATUS: PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / IMPLEMENTATION_ALLOWED: YES
```

P4-2 implementation is authorized only within this Taskbook. P4-3 workflow, P4 Final Acceptance, and P5 remain out of scope.

P4-2 implementation-evidence external GPT Strict Review returned:

```text
STATUS: PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / CAN_CLOSE_AND_TAG: YES / NEXT_STAGE_ALLOWED: P4-3 Taskbook Review only
```

P4-2 is closed under recovery tag `v1.3.2-p4.2-controlled-desktop-actions`.

## Objective

Establish the smallest user-controlled desktop-action foundation: a user may explicitly choose one point on their own fresh P4-1 local screen preview, review the intended action locally, and authorize one primary-pointer click at that point.

P4-2 is not desktop automation. It provides no AI-selected action, no unattended execution, no multi-step workflow, and no claim that the target application reached a desired state.

## Proposed Core Path

```text
Explicit local user action in Runtime UI
  -> existing P4-1 owner-bound opaque display reference and fresh local preview
  -> user selects one normalized point and locally reviews the action summary
  -> Main Process prepares exact desktop action resource
  -> P1 execute Permission, forced to one-time scope
  -> one-shot Main Process execution authorization
  -> Main Process TeemoDesktopActionService validates current display layout
  -> Main Process restricted native primary-click adapter
  -> local dispatched / safely-failed result only
```

The Renderer may submit only the opaque display reference and a bounded normalized point. It never receives a native display source ID, physical screen bounds, global desktop coordinates, native input handle, or a general desktop-control API.

## Required Scope

- Add a provider-neutral Main Process `TeemoDesktopActionService` with exactly one public action in P4-2: `clickPrimaryAt`. It accepts a display reference plus normalized point only after the Main Process resolves and validates the real display geometry.
- Extend the existing Runtime / Screen Awareness UI only enough to let the user select one point on their own current local preview, see a local action summary, explicitly confirm, and see whether a click was dispatched or safely rejected.
- A selectable point must derive from a fresh P4-1 preview held by the same requesting `webContents`. Preview, display reference, point selection, prepared operation, Permission request, and execution authorization must all remain owner-bound.
- Use a P1 `execute` Permission on a precise opaque resource such as `desktop://display/<opaque-display-ref>/primary-click/<normalized-point>`. P4-2 must force `sessionId: null` and allow only `once`; session and resource grants are invalid for desktop actions.
- Immediately before input dispatch, Main Process must consume the exact one-shot authorization and revalidate that the opaque display reference is live, still belongs to the requesting owner, maps to the same current display, and that the normalized point resolves inside the current display bounds.
- The production input backend must be a restricted native Windows adapter called only through `TeemoDesktopActionService`. It may perform only the one requested primary click and must not expose a generic event, command, script, program, or arbitrary coordinate API to Renderer, Provider, Agent Core, or ordinary Chat.
- Require a local visible confirmation for every action. The application must describe the action as a dispatched click only; it must never infer or claim that a third-party application accepted, saved, deleted, sent, purchased, or otherwise completed an outcome.
- Prepare and execution records must be short-lived, single-use, bounded per `webContents`, released on cancel, deny, timeout, action failure, window destruction, preview discard, display invalidation, or expiry.
- Tests must inject synthetic display data and a fake restricted input adapter. Automated tests must not move the real pointer, send real input, capture a real user display, access formal user data, or interact with third-party applications.
- A production-adapter acceptance check, if run, must be an explicit manual check against an isolated Teemo-owned synthetic target window only. It may never run unattended or target real user applications, browser pages, files, dialogs, accounts, purchases, or external systems.

## Provider And Agent Boundary

- Provider calls for desktop actions and desktop-action coordinates remain `0`.
- P4-2 adds no ordinary Chat Tool and does not alter the Chat Safe File Tool allowlist.
- Agent Core, AIService, Provider adapters, ordinary Chat messages, Tool definitions, Tool results, chat history, logs, telemetry, Skill, Cognition, Creative Profile, and Inspiration Context receive no screen pixels, preview data, native source ID, global coordinate, window title, application identity, action token, Permission result, or desktop-action result.
- A model may not select points, request, prepare, authorize, execute, repeat, retry, schedule, or verify P4-2 actions. Only the current local Runtime UI can initiate the P4-2 path.

## Security Requirements

- Main Process is the sole desktop-input and authorization boundary. A model, Renderer, display reference, preview, coordinates, cached operation, or permission grant must never independently authorize an action.
- Renderer input must be fail-closed: reject missing, malformed, non-finite, out-of-range, forged, stale, cross-owner, expired, or display-mismatched references and normalized points before reaching any native adapter. Raw global coordinates are not accepted over IPC.
- The action resource must bind the exact opaque display reference and canonical normalized point. Main Process must use the same resource for the P1 request and one-shot execution authorization consumption.
- Refuse any persisted session/resource grant, action replay, second execute, concurrent duplicate operation, auto-retry, background execution, action after discard, action after window close, or action after a display configuration change.
- No fallback to PowerShell, Shell, `child_process`, arbitrary program execution, Control Execute, RobotJS, Nut.js direct access outside the restricted Main Process adapter, Win32 input surface from Renderer, or any general desktop automation API. A future adapter library must be encapsulated so no broader input capability is exported.
- P4-2 is limited to one primary click. It excludes keyboard input, text entry, key combinations, clipboard, mouse buttons other than primary, double click, drag/drop, hover, move as an exposed capability, scroll, touch, window focus, window move/resize, application launch/close, process inspection, accessibility automation, browser automation, OCR, recording, monitoring, networking, filesystem mutation, Git, delete, or destructive operations.
- P1 authorized-root enforcement, P1 File Tools, M1 ordinary Chat restrictions, P3 sources, P4-1 preview privacy rules, and all closed P3 stages remain unchanged.

## Privacy Requirements

- P4-2 reuses P4-1's bounded in-memory local preview only for the initiating window and action-selection UI. It does not persist screenshots, thumbnails, point-selection data, native coordinates, action tokens, Permission payloads, or action outcomes to user files, project files, logs, chat history, telemetry, or source control.
- UI text may show a non-sensitive display label and normalized point summary but never hidden native display identifiers, physical display bounds, application/window identity, or screen content outside the existing local preview.
- Discard and expiry must clear P4-1 preview data before any later action can reuse it.

## Explicit Non-Goals

- No P4-3 Design Tool Adapters / Workflows, P4 Final Acceptance, P5, autonomous planning, autonomous execution, self-upgrade, multi-agent coordination, or background daemon.
- No agent-driven or Provider-driven desktop actions, screen understanding, OCR, vision upload, multimodal prompt injection, window/app catalog, process monitoring, continuous capture, watcher, global shortcut, remote session, remote desktop, or telemetry.
- No arbitrary desktop automation, action macros, scripts, workflows, command execution, Shell, PowerShell, Git, Controlled Execute, program execution, file delete, or destructive operation.
- No change to P3-3 or any closed P3 stage.
- No version, installer, installation, restart, or auto-update change.

## Acceptance

Using only isolated profiles, injected synthetic display metadata/PNG bytes, and a fake restricted input adapter:

1. A Runtime UI user can select a point only from their own fresh P4-1 preview. Renderer sends no native display ID or raw global coordinate.
2. The exact flow is proven: local explicit confirmation -> Main IPC -> P1 execute Permission -> one-shot execution authorization -> Main display/point revalidation -> restricted Main adapter.
3. Deny, cancel, timeout, missing execution authorization, malformed point, stale/forged reference, preview discard, cross-renderer request, expired operation, display mismatch, adapter failure, and duplicate execution result in zero input-adapter calls and no fallback.
4. A permitted synthetic request calls the fake adapter exactly once with the Main-resolved bounded coordinate. A second execute or replay fails.
5. Automated tests prove Provider/Agent/Chat calls remain zero, ordinary Chat Tool allowlist is unchanged, Renderer has no direct native input capability, no real display capture occurs, no real OS input occurs, and no persistence occurs.
6. Focused P4-2 Node and Electron smoke tests plus affected P4-1, P1/M1, P2, and P3 regressions pass. `verify:release-version`, Project Knowledge sync/verify, syntax checks, and `git diff --check` pass.

## Evidence Required

```text
P4-2 Controlled Desktop Actions
STATUS: IMPLEMENTED / REVIEWED / CLOSED

CONTROLLED_ACTION:
- explicit_local_user_trigger: YES
- action_scope: primary_click_only
- fresh_owner_bound_preview: PASS
- normalized_point_only_from_renderer: PASS
- p1_execute_permission_once: PASS
- one_shot_execution_authorization: PASS
- main_process_input_only: PASS
- duplicate_or_replay_rejected: PASS
- failure_paths_zero_input: PASS

PRIVACY:
- provider_calls_for_desktop_action: 0
- agent_or_chat_desktop_context: NO
- desktop_action_data_persisted: NO
- real_user_display_captured_in_tests: NO
- real_os_input_in_automated_tests: NO
- renderer_direct_input: NO

NOT_EXPOSED:
- ordinary_chat_tool_allowlist_changed: NO
- shell_or_powershell: NO
- controlled_execute: NO
- git_tools: NO
- keyboard_clipboard_scroll_drag_double_click: NO
- p4_3_started: NO
- p3_3_changed: NO

TESTS:
- ...

GIT:
- branch: ...
- HEAD: ...
- worktree: ...

KNOWN_LIMITATIONS:
- P4-2 is a user-confirmed, single primary click only. It cannot infer application state, execute workflows, or control a desktop autonomously.
```

## Review Request

Please perform Strict Review of this P4-2 Taskbook only. Confirm whether its single-click scope, P1 one-time execute Permission, owner-bound P4-1 preview dependency, Main Process native adapter boundary, privacy restrictions, synthetic-test policy, and non-goals are sufficient to authorize implementation.

Do not authorize P4-3, P4 Final Acceptance, P5, Provider/Agent desktop control, arbitrary desktop automation, keyboard/clipboard/scroll/drag capability, or a general Shell/program execution path.

## Implementation Evidence

- Added Main-only `TeemoDesktopActionService`, `TeemoDesktopActionIpc`, and a restricted `TeemoWindowsPrimaryClickAdapter`. The adapter exposes only `clickPrimaryAt` and contains no Shell, PowerShell, child-process, program, or generic input interface.
- P4-1 snapshots retain their source display reference only in Main private state. Before dispatch, Main revalidates owner, snapshot, opaque display reference, native display identity, and the exact display-layout signature; Renderer sends only `snapshotId` and a point normalized to `[0, 1]`.
- `desktop_primary_click` is P1 `execute` only and forced to `once`; session/resource grants are rejected. Prepared operations, permissions, and actions are one-shot, TTL-bounded, owner-bound, and released on deny, cancel, discard, expiry, dispatch failure, replay, or window destruction.
- Added `test:desktop-actions` and `test:desktop-actions-ui-smoke`. They use synthetic display/PNG data and a fake adapter only; no real display capture or OS input runs in automated tests.
- Focused P4-1, P1/M1, P2, and P3 regressions pass. External GPT Strict Review returned `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / CAN_CLOSE_AND_TAG: YES`; P4-2 is closed under recovery tag `v1.3.2-p4.2-controlled-desktop-actions`.
