# Teemo P4-1 Runtime / Screen Awareness - Taskbook

Status: `CLOSED / PASS / BLOCKERS: 0`

## Gate

P3 Personal Inspiration is `CLOSED / PASS / BLOCKERS: 0`.
P3 final recovery tag: `v1.3.2-p3-final-acceptance`.
P4 begins only with this independent P4-1 Taskbook. P4-2 Controlled Desktop Actions, P4-3 Design Tool Adapters / Workflows, and P4 Final Acceptance are not started.

External GPT Strict Review returned:

```text
PASS / BLOCKERS: 0 / IMPLEMENTATION_ALLOWED: YES
```

Required fixes: `none`.
Non-blocking limitations: P4-1 provides only explicit, single-display snapshots for local preview. Screen understanding, OCR, Provider Vision, window-level semantic awareness, continuous monitoring, and desktop actions remain later-stage work.

## Objective

Establish the smallest privacy-preserving, user-controlled foundation for Teemo to learn runtime display availability and to take one explicitly requested local screen snapshot for local preview.

P4-1 is observation only. It creates no desktop-control capability, no Agent screen-vision capability, and no Provider upload path. A screen snapshot is never automatic and is not added to ordinary Chat or its Tool allowlist.

## Proposed Core Path

```text
Explicit user action in Teemo UI
  -> Renderer requests an opaque display reference
  -> Main Process TeemoScreenService validates current display ownership
  -> P1 Permission Layer (read, screen://display/<opaque-id>)
  -> one-shot Main Process execution authorization
  -> Electron desktop capture in Main Process only
  -> bounded in-memory local preview IPC response
  -> local UI preview only
```

The renderer never calls `desktopCapturer`, `getDisplayMedia`, native input APIs, filesystem APIs, or privileged Electron capture APIs directly.

## Required Scope

- Add a provider-neutral `TeemoScreenService` in the Main Process with a narrow, testable contract for enumerating available displays and obtaining one display snapshot after authorization.
- Expose a minimal IPC client for a local Runtime / Screen Awareness UI state: display references, capture request, pending state, permission result, and local preview.
- Display references must be opaque, short-lived, and bound to the requesting `webContents`; no native display source ID, absolute local path, window title, process identity, or other hidden system detail is returned to the renderer or Provider.
- Use a P1 `read` permission for the exact opaque display resource. Every capture must require current authorization and a one-shot execution authorization checked again by Main Process immediately before capture.
- Capture is initiated only by an explicit user action. There is no launch capture, timed capture, repeated capture, hidden capture, watcher, background daemon, or capture-on-chat-message behavior.
- Keep at most one bounded in-memory snapshot per requesting window. Do not write screen pixels, thumbnails, metadata, or audit payloads to user files, project files, logs, chat history, or source control.
- The local preview must be cleared on explicit discard, window close, failed/cancelled capture, authorization revocation, and a short hard expiry. A new capture replaces the prior preview only after the new request is authorized.
- Use Electron capture APIs only from a Main Process service seam. Tests inject synthetic display metadata and synthetic image bytes; automated tests must never capture formal user screen content.
- Add focused Node tests plus an isolated Electron smoke test proving IPC ownership, authorization, expiry/discard, and renderer isolation. P1/P2/P3/M1 regressions remain intact.

## Provider And Agent Boundary

- Provider calls for P4-1 screen data remain `0`.
- No screenshot, thumbnail, OCR result, display metadata, native source ID, window title, app identity, clipboard data, or absolute local path may be included in AIService, Provider adapter, Agent Core context, ordinary Chat messages, Tool definitions, Tool results, logs, or telemetry.
- P4-1 does not add a Chat Tool, modify the ordinary Chat Safe File Tool allowlist, or make a screen capture available to the model.
- Any later Provider use of user screen content requires its own independent approved Taskbook, explicit scoped permission, a bounded data contract, and a new Strict Review gate.

## Security Requirements

- Main Process remains the sole capture and authorization boundary. Permission decisions remain authoritative; a model, renderer, display reference, or cached snapshot cannot grant access.
- Permission requests must be owner-bound to the initiating `webContents`; a second renderer cannot read, execute, release, or discard another renderer's prepared capture.
- The Main Process must reject malformed, stale, forged, cross-renderer, expired, unavailable, or revoked display references before calling Electron capture APIs.
- Only screen display sources are in scope. Window capture, application enumeration, microphone, webcam, audio capture, clipboard capture, OCR, recording, streaming, remote upload, and persistence are excluded.
- Bound image dimensions and encoded-byte size before sending a preview over IPC. Fail closed on source mismatch, missing display, malformed image, over-limit data, permission timeout, cancellation, or any capture exception.
- Do not add Shell, PowerShell, subprocesses, RobotJS, Nut.js, Win32 input injection, `SendInput`, accessibility automation, arbitrary program execution, Git, Controlled Execute, delete, or destructive operations.
- P1 authorized-root rules, Safe File Tools, P3 source authorization, and existing ordinary Chat restrictions remain unchanged.
- Tests use isolated temporary profiles and injected synthetic data only. No test is permitted to capture, retain, upload, screenshot, or inspect a real user display.

## UI Scope

- Add only the smallest Runtime / Screen Awareness control surface necessary to explicitly choose an available opaque display reference, request a snapshot, view the bounded local preview, and discard it.
- The UI must explain capture state and permission denial without showing hidden system identifiers.
- No always-on visual overlay, recording indicator, desktop overlay control, global shortcut, auto-run workflow, or remote session UI is in scope.
- The UI must not make a preview appear in chat history, prompts, upload attachments, project data, or persistent application state.

## Explicit Non-Goals

- No mouse, keyboard, touch, drag/drop, click, scroll, focus, window move/resize, clipboard, or desktop action of any kind.
- No P4-2 Controlled Desktop Actions, P4-3 Design Tool Adapters / Workflows, P4 Final Acceptance, or P5 work.
- No Agent Tool Calling expansion, Chat Tool allowlist expansion, multimodal prompt injection, screen understanding, OCR, vision model request, or Provider upload.
- No continuous monitoring, event watcher, capture scheduling, recorder, video, audio, webcam, microphone, remote desktop, browser automation, app/window catalog, process inspection, or telemetry.
- No database, Memory, Vector DB, embedding, filesystem persistence, source mutation, installer/version change, automatic update, installation, or restart.
- No change to P3-3 or any closed P3 stage.

## Acceptance

Using only an injected synthetic display provider and isolated test profile:

1. The Runtime UI lists only opaque current display references with bounded, non-sensitive display labels; it exposes no native source IDs, window titles, paths, or Provider calls.
2. An explicit capture request follows `renderer -> Main IPC -> P1 Permission -> Main one-shot authorization -> Main capture service -> owner-bound local preview`; no renderer direct capture API is available.
3. Permission deny, timeout, cancellation, stale/forged reference, cross-renderer request, unavailable display, expiry, and capture failure produce no snapshot and no fallback behavior.
4. A permitted synthetic capture produces one bounded in-memory preview for its owner, can be discarded, expires, and cannot be read by another renderer.
5. Automated tests prove no real display capture, no filesystem persistence, no Provider call, no ordinary Chat/Agent Tool change, no shell/program execution, and no desktop action.
6. Focused P4-1 Node/Electron tests and affected P1/P2/P3/M1 regression suites pass. `project:knowledge:sync`, `project:knowledge:verify`, release version verification, syntax checks, and `git diff --check` pass.

## Evidence Required

```text
P4-1 Runtime / Screen Awareness
STATUS: IMPLEMENTED / WAITING REVIEW

SCREEN_AWARENESS:
- explicit_user_trigger: YES
- opaque_display_references: YES
- main_process_capture_only: YES
- p1_permission: PASS
- execution_authorization: PASS
- owner_bound_ipc: PASS
- bounded_in_memory_preview: PASS
- discard_and_expiry: PASS

PRIVACY:
- provider_calls_for_screen_data: 0
- real_user_display_captured_in_tests: NO
- screen_data_persisted: NO
- screen_data_in_chat_or_provider: NO
- renderer_direct_capture: NO

NOT_EXPOSED:
- ordinary_chat_tool_allowlist_changed: NO
- git_tools: NO
- controlled_execute: NO
- shell_or_powershell: NO
- program_execution: NO
- desktop_actions: NO
- mouse_keyboard_clipboard: NO
- p4_2_started: NO
- p4_3_started: NO
- p3_3_changed: NO

TESTS:
- ...

GIT:
- branch: ...
- HEAD: ...
- worktree: ...

KNOWN_LIMITATIONS:
- P4-1 is explicit local screen observation only. Screen content does not enter Agent or Provider context, and Teemo cannot control the desktop.
```

## Review Request

Please perform Strict Review of this P4-1 Taskbook only. Confirm whether its scope, Main Process/P1 permission boundary, IPC ownership, privacy rules, synthetic-test requirement, and non-goals are sufficient to authorize implementation. Do not authorize P4-2 or later stages.

## Implementation Evidence (Reviewed)

- Added `TeemoScreenService`, owner-bound Main Process Screen IPC, and a renderer IPC client. `desktopCapturer` is called only by the Main Process provider for Electron `screen` sources after P1 read permission and a one-shot execution authorization.
- Added the minimal Chat Window Runtime / Screen Awareness page. It lists opaque display references, requests a fresh one-time Permission decision, renders only a bounded local preview, and discards the preview on explicit action or leaving the page.
- Screen data is neither persisted nor sent to AIService, Provider adapters, Agent Core, ordinary Chat, Tool definitions/results, logs, or telemetry. No Chat Tool was added.
- `test:screen-awareness`: PASS (20 assertions; opaque reference, cross-owner denial, invalid capture rejection, discard, reference expiry, snapshot expiry; injected PNG only).
- `test:screen-awareness-ui-smoke`: PASS (25 assertions; real Chat UI, permission deny/no capture, explicit allow, local preview, discard, missing execution authorization, cross-renderer denial, Chat allowlist unchanged; injected PNG only).
- P1/M1 Node regression PASS: `test:permissions`, `test:file-tools`, `test:agent-core`.
- P2/P3 Node regression PASS: `test:cognition`, `test:creative-profile`, `test:skill-integration`, `test:inspiration-foundation`, `test:local-folder`, `test:inspiration-index`, `test:inspiration-retrieval`, `test:inspiration-context`, `test:eagle-library`.
- Electron regression PASS: `test:chat-tool-calling-ui-smoke`, `test:creative-ui-smoke`, `test:skill-ui-smoke`, `test:inspiration-ui-smoke`, `test:local-folder-ui-smoke`, `test:inspiration-index-ui-smoke`, `test:inspiration-retrieval-ui-smoke`, `test:inspiration-context-ui-smoke`, `test:eagle-library-ui-smoke`.
- No real display was captured in automated tests. Screen-data Provider calls: `0`; screen-data persistence: `0`; renderer direct capture: `NO`; desktop actions: `0`.

## Closure

External GPT Strict Review of this implementation evidence returned:

```text
PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / CAN_CLOSE_AND_TAG: YES / NEXT_STAGE_ALLOWED: P4-2 Taskbook Review only
```

P4-1 is closed under recovery tag `v1.3.2-p4.1-runtime-screen-awareness`. P4-2 implementation, P4-3, P4 Final Acceptance, and P5 remain out of scope.
