# Teemo Capability Changelog

## 1.3.2

Current:
P3-5 Eagle-compatible local-only read-only connector is closed with zero blockers. P3-6 remains not started and requires an independent Taskbook.

Added:
P3-5 source registration, bounded Eagle metadata indexing, existing retrieval/preview reuse, and fail-closed P1 authorization checks. Provider calls remain zero and source bytes remain unchanged.

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
