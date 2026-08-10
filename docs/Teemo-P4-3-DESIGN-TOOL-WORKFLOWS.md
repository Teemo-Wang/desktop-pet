# Teemo P4-3 Design Tool Adapters / Workflows - Taskbook

Status: `CLOSED / PASS / BLOCKERS: 0`

## Gate

P4-1 Runtime / Screen Awareness and P4-2 Controlled Desktop Actions are independently `CLOSED / PASS / BLOCKERS: 0`.

P4-2 implementation-evidence external GPT Strict Review returned:

```text
STATUS: PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / CAN_CLOSE_AND_TAG: YES / NEXT_STAGE_ALLOWED: P4-3 Taskbook Review only
```

P4-3 implementation is prohibited until this Taskbook receives independent external GPT Strict Review approval. P4 Final Acceptance and P5 remain out of scope.

P4-3 external GPT Strict Review returned:

```text
STATUS: PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / IMPLEMENTATION_ALLOWED: YES / P4_FINAL_STARTED: NO / P5_STARTED: NO
```

Implementation was completed only within this Taskbook. External GPT Strict Review of implementation evidence returned `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / CAN_CLOSE_AND_TAG: YES / NEXT_STAGE_ALLOWED: P4 Final Acceptance Taskbook Review only`. P4-3 is closed under recovery tag `v1.3.2-p4.3-design-tool-workflows`; P4 Final work remains independently gated.

## Objective

Create one narrow, local design-tool adapter that a user can explicitly run from Teemo's Runtime page: a fixed built-in ComfyUI image workflow on the same computer.

P4-3 does not make Teemo a general ComfyUI client or an autonomous workflow engine. It must prove that an adapter can be user-triggered, provider-neutral, Main-Process-owned, permissioned, bounded, cancellable, and safely previewed without opening arbitrary local-network, filesystem, desktop-input, or model-control capability.

## Approved Candidate Scope

The candidate adapter identity is fixed as `teemo_comfyui_builtin_sdxl` and has exactly one operation: `renderBuiltinImage`.

The operation is initiated only by an explicit local Runtime UI interaction. The user enters the positive prompt locally and may select bounded image dimensions. It is not initiated by ordinary Chat, Agent Core, AIService, a Provider, a Skill, a background timer, a watcher, or P4-2 desktop input.

The Main Process builds the entire immutable built-in workflow. The Renderer cannot provide a ComfyUI API JSON, node graph, node class, custom checkpoint, custom sampler, custom scheduler, custom endpoint, output path, filesystem path, URL, script, or command.

The initial built-in workflow is constrained to the existing local hardware baseline:

- local endpoint: `http://127.0.0.1:8188` only;
- fixed built-in SDXL checkpoint profile already used by Teemo's local configuration;
- default dimensions: `1024 x 1024` for RTX 4070 Ti 12GB;
- accepted dimensions: `512..1024`, multiples of `64`, with a fixed one-image batch;
- fixed sampler/scheduler/steps/CFG from the reviewed built-in profile;
- one request per owner at a time, no queue batch, retry, scheduling, or parallel render.

## Required Core Path

```text
Explicit local Runtime UI action
  -> local prompt + bounded dimensions
  -> Main Process prepares opaque ComfyUI render operation
  -> P1 execute Permission, forced to one-time scope
  -> one-shot Main execution authorization
  -> Main Process revalidates owner, operation, fixed adapter, and local endpoint
  -> Main Process submits fixed built-in workflow to local ComfyUI
  -> bounded Main-memory result preview for the initiating owner
  -> local display, explicit discard, and expiry
```

The P1 resource is deterministic and excludes the prompt, user paths, image bytes, API keys, and arbitrary endpoint data. It may identify only the fixed adapter/version such as `comfyui://local/teemo-builtin-sdxl/v1`.

## Main Process Adapter Boundary

- Add a provider-neutral Main Process `TeemoComfyUIWorkflowService` and owner-bound IPC/client pair. It exposes only `prepareBuiltinRender`, `executeBuiltinRender`, `getPreview`, `discard`, and `release`.
- Main Process receives a prompt string with a strict bounded length and bounded dimensions. It normalizes/rejects malformed input before a permission request; it does not forward user-controlled workflow structure to ComfyUI.
- Only Main Process may issue the local HTTP requests. The destination is fixed to literal loopback `127.0.0.1:8188`; redirects, hostnames, IPv6, private-network alternatives, remote URLs, proxy values, credentials, headers, arbitrary ports, and Renderer-provided base URLs are rejected.
- The adapter has no filesystem API. It does not read user workflow files, import JSON, enumerate models, expose output directories, select checkpoints, archive output, or invoke `FileService` for arbitrary paths.
- The adapter uses a static workflow constructor with a fixed model profile and a single output. It must reject non-image responses, oversized response bytes, malformed history records, unexpected image descriptors, and invalid MIME signatures.
- Result bytes may live only in bounded, expiring Main memory and may be retrieved only by the same `webContents` as a data URL. Teemo does not persist, archive, log, upload, index, send to a Provider, add to chat history, or expose the result to Agent/Skill/Cognition/Inspiration.
- The adapter describes only that a local render request was accepted, completed, cancelled, or safely failed. It does not claim aesthetic quality, that a file was saved, or that an external application completed a broader workflow.

## P1 Permission And Operation Binding

- Use P1 `execute` Permission with `toolName: 'comfyui_builtin_render'`, `sessionId: null`, `requiresExecutionAuthorization: true`, and the exact fixed resource.
- Force this action to `once` only. Reject session/resource grants in `TeemoPermissionService`; the Permission UI offers only deny or allow-once.
- Prepared operations bind exact owner, generated `toolCallId`, fixed resource, normalized dimensions, immutable adapter version, and short TTL. Operations are single-use and bounded per owner.
- Main Process consumes the exact P1 one-shot execution authorization immediately before local network dispatch. Missing, expired, replayed, owner-mismatched, cancelled, or denied authorizations perform zero network request and produce zero result preview.
- Discard, timeout, cancellation, window destruction, service failure, permission deny, or a second execute must release all operation and preview state.

## Local Render Limits

- Positive prompt: plain text only, UTF-8 length `1..1200`; no system/prompt interpretation by Teemo beyond literal transport to the fixed prompt field.
- Width and height: integer `512..1024`, divisible by `64`; batch size remains `1`.
- Main requests have explicit connect/response/result deadlines, bounded redirects `0`, bounded JSON/result/image sizes, and abort support.
- Only one pending or running render is allowed per owner; no retry, no resume, no poller after cancellation, no background recovery, and no history browsing.
- A ComfyUI output node may create its normal local output under the existing ComfyUI-owned configuration. That external side effect is stated in the explicit P1 execute permission reason; Teemo itself does not access or persist the path or bytes outside the returned bounded preview.

## Runtime UI

- Add only a local Runtime panel for the fixed adapter, a prompt field, bounded size control, render command, cancellation while pending, status, owner-local preview, and discard.
- The local UI must visibly state that the request goes to the local ComfyUI endpoint and that execution requires one-time confirmation.
- The panel does not offer endpoint, checkpoint, sampler, workflow, JSON, path, model, script, batch, queue, schedule, auto-run, Chat, Provider, Agent, or desktop-action controls.
- P4-1 screen preview and P4-2 primary click remain independent. A P4-3 render neither reads the screen nor sends desktop input.

## Provider, Agent, And Chat Boundary

- Provider calls for P4-3 workflow execution and result data: `0`.
- Ordinary Chat Tool allowlist is unchanged. `comfyui_builtin_render` is not an Agent Tool and is not exposed as a Chat tool definition.
- Agent Core, AIService, Provider adapters, Tool Registry, Tool Results, chat history, Skills, Cognition, Creative Profile, Inspiration Context, telemetry, and logs receive no P4-3 prompt, preview bytes, local endpoint response, job token, local output descriptor, or completion data.
- Existing legacy Chat image-generation behavior is not modified by P4-3. The new adapter is a separate local Runtime action only.

## Security Requirements

- Main Process is the sole network, operation, permission, and preview boundary for the new adapter. Renderer cannot directly fetch local ComfyUI, use `ws`, import `fs`, access output files, invoke a general network API, or construct a workflow.
- Fail closed for unavailable endpoint, redirect, malformed result, malformed preview, non-loopback target, changed adapter resource, stale operation, cross-window access, deny, timeout, cancellation, replay, or duplicate execute.
- No arbitrary HTTP client, browser navigation, LAN/NAS/remote ComfyUI, SSRF, web search, proxy configuration, socket passthrough, WebSocket passthrough, prompt relay, external upload, telemetry, result persistence, file archive, or output-directory access.
- No Shell, PowerShell, `child_process`, program launch, Git, Controlled Execute, delete, arbitrary filesystem access, desktop input, keyboard, clipboard, scroll, drag, double-click, window control, or P4-4/P5 work.
- P1 authorized-root/File Tool behavior, M1 ordinary Chat restrictions, P3 source privacy, P4-1 screen privacy, and P4-2 desktop-click constraints remain unchanged.

## Privacy Requirements

- Tests use an injected fake local ComfyUI transport and synthetic PNG bytes only. They never connect to a real local server, exercise a GPU, run a real ComfyUI workflow, read formal user settings, access a user output directory, create an output file, or use a real prompt containing personal material.
- Automated tests make Provider, Agent, Chat, filesystem, desktop-capture, and desktop-input calls `0`.
- Prompt, result bytes, and operation state are bounded per owner and cleared on discard/expiry/failure. No data is written by Teemo to user/project/source-control files.

## Explicit Non-Goals

- No arbitrary ComfyUI workflow import/run/edit, node graph editor, model list, checkpoint selection, output path selection, queue/history inspector, batch generation, image-to-image, ControlNet, LoRA, custom node, file upload, filesystem browsing, or result archive.
- No Provider prompt generation, Agent orchestration, Chat tool, background workflow, automatic retry, autonomous planning/execution, multi-step workflow, or outcome verification.
- No Figma, Photoshop, Illustrator, Blender, browser, accessibility, UI Automation, desktop application, keyboard, clipboard, mouse behavior beyond the already closed P4-2 single primary click, or remote desktop adapter.
- No P4 Final Acceptance, P5, version bump, installer build, installation, restart, or auto-update change.

## Acceptance

Using isolated profiles, a fake Main transport, synthetic displayless PNG data, and a fake P1 prompt:

1. Only a local Runtime user can prepare a fixed built-in render. Renderer sends only bounded prompt/dimensions and no endpoint/workflow/path.
2. The exact path is proven: local explicit command -> Main prepare -> P1 execute once -> exact one-shot authorization -> Main fixed loopback transport -> owner-bound bounded preview.
3. Allow executes the fake transport once with a Main-built static workflow; its user prompt can affect only the designated positive-prompt field and bounded dimensions. No raw workflow, URL, headers, model name, path, or command is accepted.
4. Deny, cancel, timeout, missing authorization, invalid prompt/dimensions, forged/stale operation, cross-renderer operation, response redirect, non-image/oversized/malformed result, preview discard, expiry, and replay make zero transport calls or zero preview access as applicable.
5. A permitted result can be retrieved only by the initiating owner, then discard/expiry clears bytes. No persistence, Provider, Agent, Chat, filesystem, screen capture, or desktop input occurs.
6. Focused Node and Electron smoke plus P4-1/P4-2, P1/M1, P2, and P3 regressions pass. Version, Project Knowledge, syntax, and diff checks pass.

## Evidence Required

```text
P4-3 Design Tool Adapters / Workflows
STATUS: IMPLEMENTED / WAITING REVIEW

COMFYUI_ADAPTER:
- explicit_local_runtime_trigger: YES
- adapter_scope: fixed_builtin_local_comfyui_render_only
- main_process_transport_only: PASS
- loopback_endpoint_only: PASS
- static_workflow_only: PASS
- p1_execute_permission_once: PASS
- one_shot_execution_authorization: PASS
- owner_bound_preview: PASS
- discard_expiry: PASS
- deny_cancel_failure_zero_transport: PASS

PRIVACY:
- provider_calls_for_workflow: 0
- agent_or_chat_workflow_context: NO
- workflow_or_result_persisted_by_teemo: NO
- real_comfyui_or_gpu_in_tests: NO
- formal_user_settings_or_output_used_in_tests: NO
- renderer_direct_local_network: NO

NOT_EXPOSED:
- arbitrary_workflow_json: NO
- arbitrary_url_or_remote_comfyui: NO
- filesystem_or_output_directory_access: NO
- ordinary_chat_tool_allowlist_changed: NO
- shell_powershell_program_execution: NO
- git_controlled_execute_delete: NO
- desktop_keyboard_clipboard_scroll_drag_double_click: NO
- p4_final_started: NO
- p5_started: NO

TESTS:
- ...

GIT:
- branch: ...
- HEAD: ...
- worktree: ...
```

## Implementation Evidence Summary

- `TeemoComfyWorkflowService` builds the fixed SDXL workflow in Main Process and uses a fixed literal loopback transport. It accepts only a UTF-8 bounded prompt and dimensions, validates bounded ComfyUI responses as PNG, and retains preview bytes only in expiring owner-bound memory.
- `TeemoComfyWorkflowIpc` binds an opaque prepared action to the initiating `webContents`, requires exact one-shot P1 execution authorization, and cancels/releases stale, denied, replayed, or owner-mismatched work before any local transport call.
- `TeemoComfyWorkflowClient` transports only bounded input and opaque IDs. The Runtime UI has no endpoint, model, workflow, path, queue, archive, Agent, Provider, or Chat control.
- `test:comfy-workflow` uses a fake transport and synthetic PNG to validate static workflow construction, fixed loopback URLs, redirect rejection, deny/cancel/invalid/malformed/expiry behavior, one-shot permission, owner isolation, discard, and preview expiry.
- `test:comfy-workflow-ui-smoke` uses an isolated Electron profile, fake P1 prompt, fake Main transport, and synthetic PNG to validate the actual Runtime UI path. P1/M1, P2, P3, P4-1, and P4-2 regressions also pass.

## Review Request

Please Strict Review this P4-3 Taskbook only. Confirm whether its one fixed local ComfyUI adapter, Main-Process-only loopback transport, static workflow, one-time P1 execute Permission, owner-bound in-memory preview, local-side-effect disclosure, synthetic-test policy, and non-goals are sufficient to authorize implementation.

Do not authorize a general ComfyUI client, arbitrary workflow/model/endpoint control, Chat/Provider/Agent workflow execution, desktop application automation, Figma/Photoshop/Illustrator/Blender adapters, keyboard/clipboard/mouse expansion, P4 Final Acceptance, P5, Shell, PowerShell, Git, Controlled Execute, or delete.
