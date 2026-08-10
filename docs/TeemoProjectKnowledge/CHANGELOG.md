# Teemo Capability Changelog

## 1.3.2

Current:
P3-6 Agent Uses Inspiration is closed with zero blockers after GPT Strict Review. P3 Final Acceptance is the only next P3 work and requires its own approved Taskbook.

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
