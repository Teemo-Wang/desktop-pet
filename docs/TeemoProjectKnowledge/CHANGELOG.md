# Teemo Capability Changelog

## 1.3.2

Current:
P3 Personal Inspiration is closed with zero blockers after final GPT Strict Review. P3-1 through P3-6 remain closed; final acceptance introduced no new product capability. P4-1 Runtime / Screen Awareness, P4-2 Controlled Desktop Actions, P4-3 Design Tool Adapters / Workflows, and P4 Final Acceptance are closed. P5-1 is closed under `v1.3.2-p5.1-autonomous-planning`; P5-2 passed implementation-evidence Strict Review and is closed under `v1.3.2-p5.2-autonomous-execution-verification`. P5-3/P5 Final Acceptance are not started.

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
