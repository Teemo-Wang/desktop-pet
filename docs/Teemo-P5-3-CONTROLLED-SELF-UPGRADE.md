# Teemo P5-3 Controlled Self-Upgrade - Taskbook

Status: `TASKBOOK APPROVED / IMPLEMENTATION ALLOWED`

Implementation Status: `CLOSED / PASS / BLOCKERS: 0`

## Gate

- P5-1 Autonomous Planning is `CLOSED / PASS / BLOCKERS: 0` under `v1.3.2-p5.1-autonomous-planning`.
- P5-2 Autonomous Execution & Verification is `CLOSED / PASS / BLOCKERS: 0` under `v1.3.2-p5.2-autonomous-execution-verification`.
- Current version remains `1.3.2`.
- External GPT Strict Review: `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / IMPLEMENTATION_ALLOWED: YES / P5_FINAL_STARTED: NO`.
- P5-3 implementation completed within this approved Taskbook and passed external implementation-evidence Strict Review with zero blockers.
- Close recovery tag: `v1.3.2-p5.3-controlled-self-upgrade`.
- P5 Final Acceptance is `NOT STARTED` and remains blocked.
- No release build, installer, installation, restart, close commit, recovery tag, or P5 Final Acceptance work is authorized by this approval.

## Objective

Define one explicit, bounded, owner-controlled self-upgrade session for the authorized Teemo source repository:

```text
owner selects authorized Teemo source root
  -> Main validates clean Teemo Git baseline and Project Knowledge
  -> P5-1 produces a bounded upgrade plan
  -> provider proposes an exact hash-bound patch manifest
  -> owner approves the immutable manifest
  -> P5-2 confirms and applies each existing-file patch
  -> trusted Git/File verification
  -> owner confirms each exact baseline npm verification script
  -> bounded evidence package
  -> external GPT Strict Review
  -> human/Codex close decision only
```

P5-3 is not unrestricted self-modification. The model may propose changes, but it cannot select a new repository, expand the manifest, bypass P1, approve its own work, create a commit/tag, install/restart Teemo, or begin another self-upgrade session automatically.

## Dedicated Upgrade Surface

- P5-3 must use a dedicated owner-only upgrade controller and registry. It must not add Git or Execute Tools to ordinary Chat.
- The selected root must already be within P1 authorized roots. Main Process must canonicalize it and validate all of: `AGENTS.md`, `package.json`, `docs/TeemoProjectKnowledge/INDEX.md`, and an internal `.git` directory.
- Main must read real Git branch, HEAD, worktree, version, Project Knowledge, and recovery tag before any proposal. A missing, invalid, detached, conflicted, or dirty baseline fails closed.
- The Renderer may display and confirm state, but may not read/write source files, inspect `.git`, spawn processes, or construct trusted path/hash/Git facts.
- Provider content, plan text, patch text, test suggestions, and success claims remain untrusted.

## Immutable Upgrade Manifest

Before mutation, Main and the controller must validate and freeze one manifest containing:

- exact owner/session and upgrade run ID;
- canonical repository identity, baseline HEAD, branch, version, and Project Knowledge version;
- one approved goal and P5-1 plan fingerprint;
- 1 to 6 existing regular UTF-8 text files;
- repository-relative path, baseline SHA-256, exact old text, exact new text, and expected post-patch SHA-256 for every file;
- 1 to 8 exact baseline npm verification script names;
- total changed source bytes no greater than 256 KiB;
- finite run and step deadlines.

The manifest is immutable after owner approval. Any plan, path, hash, patch, script, repository, branch, HEAD, version, owner, or session change invalidates approval and stops the run.

## Allowed File Changes

- P5-3 may use only existing `read_file`, `search_files`, `search_text`, and `patch_file` behavior through P5-2, Tool Registry, P1 Permission, File IPC, and Main Process FileService.
- Only existing regular files listed in the approved manifest may be patched.
- Every patch requires a fresh exact owner confirmation and its existing P1 decision.
- Main revalidates repository identity, baseline HEAD, clean-worktree ownership, file canonical path, baseline SHA-256, and containment immediately before each patch.
- After each patch, a fresh trusted `read_file` must match the manifest post-patch SHA-256.

Initial P5-3 explicitly forbids create, delete, rename, directory creation, binary edits, symlink targets, submodules, `.git`, dependencies, generated output, user-data directories, secrets/config credentials, and any file not in the approved manifest.

The following paths are always excluded from an upgrade manifest:

- `.git/**`
- `node_modules/**`
- build, dist, installer, unpacked, cache, log, coverage, and temporary output
- formal user data, settings, chat history, skills, projects, todos, and work statistics
- credential or local-secret files
- `package.json` and `package-lock.json` in the initial implementation

## Git Boundaries

- P5-3 may use existing `git_status` and `git_diff` only through a dedicated upgrade registry, P1 read Permission, Git IPC, and Main Process GitService.
- Git facts are used to validate baseline cleanliness and confirm the final diff is limited to the approved manifest.
- No `git_stage_files`, `git_commit`, checkout, reset, clean, restore, branch, merge, rebase, tag, fetch, pull, push, remote, or history rewrite is available to the P5-3 runtime.
- A close commit and recovery tag remain an external post-Strict-Review action under `AGENTS.md`; the model and upgrade runtime cannot create them.

## Verification Execution

- P5-3 may use existing `run_npm_script` only through the dedicated upgrade registry, P1 `execute` Permission, Execute IPC, and Main Process ExecuteService.
- Each script must have existed in the clean baseline `package.json`, be named in the immutable manifest, and remain byte-for-byte bound to the baseline package/script hash.
- Script names are restricted to `test:*`, `verify:release-version`, and `project:knowledge:verify`. `start`, `dist*`, `release`, `prerelease`, `predist*`, `project:knowledge:sync`, lifecycle hooks, and every other script are rejected.
- The owner must explicitly confirm the exact script before every execution. P1 authorization remains separately mandatory and one-time.
- No script arguments are allowed in the initial implementation.
- Maximum 8 scripts, maximum 120 seconds per script, maximum 15 minutes for the whole upgrade session. Cancellation terminates pending/running work and prevents later scripts.
- A non-zero exit, timeout, cancellation, output limit, resource change, missing script, Permission denial, or unverifiable result fails the upgrade and prevents success evidence.
- P5-3 adds no `run_process`, arbitrary executable, Shell, PowerShell, `cmd`, Python, dependency installation, package script modification, network service, detached process, or background runner.

## Failure And Rollback

- Any stale or unexpected change stops the run; the controller never adapts the manifest or asks the provider to invent replacement files/commands.
- Because initial P5-3 patches existing files only, Main retains bounded baseline text/hash evidence in memory for the active owner session.
- Rollback is never automatic. After a failed/cancelled verification, the owner may explicitly approve an exact reverse manifest. Each reverse patch again requires P5-2 confirmation, P1 write Permission, Main revalidation, and postcondition verification.
- A rollback mismatch, external modification, lost owner, restart, or expired run fails closed and reports manual recovery guidance. It must not use Git reset/checkout or delete.
- Restart restores no run, manifest, approval, snapshot, or rollback authority.

## Evidence And Review Boundary

- Evidence is bounded structured local data: baseline branch/HEAD/version, manifest paths and hashes, P1 decisions, Tool results, final Git status/diff summary, verification script names/exit status/duration, cancellation/timeout state, and rollback state.
- Raw secrets, environment, full user directories, credentials, hidden state, or unbounded source/log output are not evidence and must not reach a Provider.
- The internal model cannot mark P5-3 PASS/CLOSED, waive failures, approve rollback, create a close commit/tag, or begin P5 Final Acceptance.
- Only an independent external GPT Strict Review may return `CAN_CLOSE_AND_TAG: YES`. Until then the state is `IMPLEMENTED / WAITING REVIEW`.

## Required Security Constraints

- No ordinary Chat Git/Execute exposure and no Safe File allowlist expansion.
- No arbitrary Shell/process/program execution, delete, create, rename, dependency install, package mutation, desktop input/capture, ComfyUI, network adapter, installer, installation, restart, remote Git, or self-selected repository.
- No infinite loop, recursive self-upgrade, background daemon, watcher, scheduler, queue persistence, cross-session resume, multi-agent delegation, or autonomous continuation.
- P1 authorized roots, Permission decisions, one-time execution authorization, Main canonicalization/identity checks, P5-2 owner/plan binding, and existing File/Git/Execute service policies remain authoritative.
- Automated tests use temporary synthetic repositories and isolated profiles only. They must never patch or execute the formal Teemo source repository or formal user data.

## Required Acceptance Matrix

| Area | Required proof |
| --- | --- |
| Explicit trigger | No source/Git/process action occurs before the owner explicitly begins one upgrade session. |
| Clean baseline | Invalid repo, dirty/conflicted/detached state, missing Project Knowledge, or version mismatch fails before proposal/mutation. |
| Manifest bounds | Missing/extra fields, more than 6 files, more than 256 KiB, new/non-text/excluded paths, stale hashes, or more than 8 scripts fails closed. |
| Owner approval | The immutable exact manifest requires explicit approval; any owner/session/plan/repo/HEAD/path/hash/script change invalidates it. |
| File path | Every mutation follows P5-2 -> Tool Registry -> P1 -> File IPC -> Main FileService and receives fresh exact confirmation. |
| Postcondition | Every patched file is freshly read and matches its approved post-patch SHA-256. |
| Git isolation | Only read-only status/diff are available; final diff contains only manifest files; no Git write/remote/history action exists. |
| Verification | Only baseline-bound, manifest-listed npm scripts run through P1 execute-once and Main ExecuteService after exact owner confirmation. |
| Failure/rollback | Failure stops later work; rollback is separate, exact, owner-approved, permissioned, verified, and never uses Git reset/delete. |
| Cancellation/timeout | Cancel/timeout propagates and no later patch or script dispatches. |
| Isolation/persistence | Other windows cannot inspect/approve/cancel/replay; restart restores nothing. |
| Review gate | Internal results cannot close P5-3 or begin P5 Final; external Strict Review remains mandatory. |
| Regression | P1/M1, P2, P3, P4, P5-1, and P5-2 regressions remain pass. |

## Evidence Required Before Implementation Close

```text
P5-3 Controlled Self-Upgrade

STATUS: IMPLEMENTED / WAITING REVIEW

EXPLICIT_UPGRADE_TRIGGER: PASS
CLEAN_BASELINE_REQUIRED: PASS
IMMUTABLE_MANIFEST: PASS
FILE_AND_BYTE_LIMITS: PASS
OWNER_MANIFEST_APPROVAL: PASS
FRESH_PATCH_CONFIRMATION: PASS
P1_FILE_PERMISSION: PASS
MAIN_FILE_EXECUTION: PASS
POST_PATCH_HASH_VERIFICATION: PASS

GIT_STATUS_DIFF_READ_ONLY: PASS
GIT_WRITE_AVAILABLE: NO
BASELINE_NPM_SCRIPTS_ONLY: PASS
P1_EXECUTE_ONCE: PASS
MAIN_EXECUTE_PATH: PASS
FINITE_TIMEOUT_CANCEL: PASS
USER_APPROVED_ROLLBACK_ONLY: PASS
EXTERNAL_STRICT_REVIEW_REQUIRED: PASS

ORDINARY_CHAT_ALLOWLIST_CHANGED: NO
SHELL_EXPOSED: NO
DELETE_CREATE_RENAME_EXPOSED: NO
DEPENDENCY_INSTALL_AVAILABLE: NO
REMOTE_GIT_AVAILABLE: NO
AUTO_COMMIT_TAG_AVAILABLE: NO
BACKGROUND_OR_RECURSIVE_UPGRADE: NO
P5_FINAL_STARTED: NO

TESTS:
- ...

GIT:
branch:
HEAD:
worktree:
```

## Review Request

External GPT Strict Review approved this bounded Taskbook with `IMPLEMENTATION_ALLOWED: YES`. Implementation evidence is below and passed with `CAN_CLOSE_AND_TAG: YES`; only the separate P5 Final Taskbook may authorize final acceptance.

## Implementation Evidence

```text
P5-3 Controlled Self-Upgrade

STATUS: CLOSED / PASS / BLOCKERS: 0

EXPLICIT_UPGRADE_TRIGGER: PASS
CLEAN_BASELINE_REQUIRED: PASS
IMMUTABLE_MANIFEST: PASS
FILE_AND_BYTE_LIMITS: PASS
OWNER_MANIFEST_APPROVAL: PASS
FRESH_PATCH_CONFIRMATION: PASS
P1_FILE_PERMISSION: PASS
MAIN_FILE_EXECUTION: PASS
POST_PATCH_HASH_VERIFICATION: PASS

GIT_STATUS_DIFF_READ_ONLY: PASS
GIT_WRITE_AVAILABLE: NO
BASELINE_NPM_SCRIPTS_ONLY: PASS
P1_EXECUTE_ONCE: PASS
MAIN_EXECUTE_PATH: PASS
FINITE_TIMEOUT_CANCEL: PASS
USER_APPROVED_ROLLBACK_ONLY: PASS
EXTERNAL_STRICT_REVIEW_REQUIRED: PASS

ORDINARY_CHAT_ALLOWLIST_CHANGED: NO
SHELL_EXPOSED: NO
DELETE_CREATE_RENAME_EXPOSED: NO
DEPENDENCY_INSTALL_AVAILABLE: NO
REMOTE_GIT_AVAILABLE: NO
AUTO_COMMIT_TAG_AVAILABLE: NO
BACKGROUND_OR_RECURSIVE_UPGRADE: NO
P5_FINAL_STARTED: NO

EXTERNAL_STRICT_REVIEW: `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / CAN_CLOSE_AND_TAG: YES / NEXT_STAGE_ALLOWED: P5 Final Acceptance Taskbook Review only`

TESTS:
- `node tests/TeemoControlledSelfUpgrade.test.js`: PASS (synthetic repositories)
- `node_modules/.bin/electron.cmd tests/TeemoControlledSelfUpgradeElectronSmoke.js`: PASS; Permission audit events: 14; formalUserDataTouched: false
- `npm.cmd run test:autonomous-execution`: PASS
- `npm.cmd run test:autonomous-execution-ui-smoke`: PASS
- `npm.cmd run test:autonomous-planning`: PASS
- `npm.cmd run test:tools`: PASS
- `npm.cmd run test:permissions`: PASS
- `npm.cmd run test:file-tools`: PASS
- `npm.cmd run test:git-tools`: PASS
- `npm.cmd run test:execute`: PASS
- `node --check` for P5-3 controller, registry, UI, and Electron smoke: PASS
- `git diff --check`: PASS

GIT:
branch: `Teemo/p3-personal-inspiration`
HEAD: `f8e5646db04d9f533c369ff447696388535d8348`
worktree: `DIRTY` (implementation evidence only; no close commit/tag)
P5_FINAL_STARTED: NO
```
