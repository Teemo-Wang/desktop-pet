# Teemo P3-5 More Inspiration Sources - Taskbook

Status: `CLOSED / PASS / BLOCKERS: 0`

## Gate

P3-4 is `CLOSED / PASS` with GPT Strict Review `PASS / BLOCKERS: 0`.
External GPT Strict Review: `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / IMPLEMENTATION_ALLOWED: YES`.
This taskbook defines the independent scope for P3-5. P3-6 and P3 Final Acceptance remain out of scope.

## Objective

Add one additional, local-only, read-only inspiration source while preserving the existing P3 source, metadata index, retrieval, preview, and authorization boundaries.

The first P3-5 source is an Eagle-compatible local library manifest source. The connector may read an explicitly selected synthetic Eagle library root containing Eagle's `images` item directories and metadata JSON, but it must not write to or modify that library.

Core path:

```text
User-selected authorized root
  -> P3-5 Eagle read-only Connector
  -> Inspiration Source Registry
  -> P1 authorized-root + source Permission
  -> bounded metadata read
  -> existing P3-3 Metadata Index
  -> existing P3-4 Retrieval
  -> existing P3-2 Preview
```

## Required Scope

- Add a validated `eagle-library` read-only connector definition.
- Support adding/removing an Eagle library source from the existing “我的灵感” area.
- Require an explicit local folder inside current P1 authorized roots; Source Registry is not an authorization source.
- Read only bounded Eagle item metadata needed for filename, relative path, dimensions when available, format, modified time, and preview path.
- Reuse the existing Main Process FileService, AccessGuard, index storage, retrieval, and preview boundaries.
- Keep index item identity deterministic and source-specific; do not alter the P3-3 index schema for existing `local_folder` sources unless a compatibility-preserving extension is required and proven safe.
- Expose clear fail-closed states for malformed manifest, missing library, revoked authorization, removed source, disabled Inspiration, unsupported item, and corrupt metadata.
- Keep every list, metadata, and preview request bounded by existing hard limits.
- Add isolated Node tests and Electron smoke using synthetic Eagle-compatible data only.

## Security Requirements

- Main Process remains the filesystem authorization boundary.
- P1 authorized roots remain the source of truth; no new root grant or automatic permission escalation.
- Reject traversal, absolute/drive, UNC, device namespace, ADS-like path segments, symlink/junction escapes, and paths outside the selected library root.
- Do not follow links or junctions while reading the library.
- Revalidate source registry revision, root authorization, manifest identity, and target file identity before preview.
- Read-only connector definitions must not expose write, delete, rename, move, upload, shell, PowerShell, Git, Controlled Execute, or arbitrary program methods.
- Do not send local paths, source bytes, or metadata to a Provider. P3-5 Provider Calls must remain `0`.
- Do not modify Eagle library files, source bytes, or add sidecars inside the library.
- Use synthetic temporary profiles and roots; never use formal user data.

## UI Scope

- Keep the existing “我的灵感” page and source controls.
- Add only the minimum source-type selection and add-library flow required to register an Eagle library.
- Existing retrieval filters and preview must work for the new source without a second search or preview UI.
- No new large page, external browser, shell open-folder action, crawler, or background watcher.

## Explicit Non-Goals

- No NAS, Pinterest, Behance, 花瓣, web crawling, cloud sync, or remote API.
- No Embedding, Vector DB, semantic/image similarity search, OCR, color/style tagging, or natural-language query parser.
- No filesystem watcher or background refresh.
- No Agent Context injection or automatic Agent use of Inspiration; that is P3-6.
- No changes to ordinary Chat Safe File Tool allowlist.
- No changes to P3-3 data semantics for existing sources unless required for backward-compatible source-kind support.
- No P4 desktop automation or P5 autonomous execution.

## Acceptance

Using a synthetic Eagle-compatible library:

1. Add the library under an authorized root and list one or more valid items.
2. Build its active metadata snapshot through the existing index path.
3. Retrieve it through existing P3-4 keyword/source/format/orientation/size/sort/pagination filters.
4. Preview a valid item through the existing P3-2 preview path.
5. Malformed metadata and unsupported files are skipped or reported without exposing them.
6. Revoked authorization, removed source, disabled Inspiration, missing library, and corrupt index all fail closed.
7. A path outside the authorized root never returns metadata or preview.
8. Existing P3-3 local-folder build/refresh/rebuild/metadata view and P3-4 retrieval regression remain passing.

## Evidence Required

```text
P3-5 More Inspiration Sources
STATUS: IMPLEMENTED / WAITING REVIEW
SOURCE_TYPE: eagle-library (read-only, local-only)
PROVIDER_CALLS: 0
SOURCE_BYTES_CHANGED: NO
P1_AUTHORIZATION_BYPASSED: NO
P3-3_CHANGED: NO
P3-6_STARTED: NO
TESTS:
- test:eagle-library: PASS (25 tests; index, retrieval, preview, revoked/removed/disabled fail-closed, traversal rejection)
- test:inspiration-foundation: PASS
- test:inspiration-isolation: PASS
- test:local-folder: PASS (68 tests)
- test:local-folder-isolation: PASS
- test:inspiration-index: PASS (73 tests)
- test:inspiration-index-isolation: PASS (52 tests)
- test:inspiration-retrieval: PASS (20 tests)
- test:permissions: PASS
- test:file-tools: PASS
- verify:release-version: PASS (package/UI/installer 1.3.2)
ELECTRON_SMOKE:
- test:eagle-library-ui-smoke: PASS (Eagle source add, index, retrieval, preview, source-kind tamper rejection)
- test:inspiration-ui-smoke: PASS
- test:local-folder-ui-smoke: PASS
- test:inspiration-index-ui-smoke: PASS
- test:inspiration-retrieval-ui-smoke: PASS
- Provider calls: 0; Agent Context changed: NO; formal user data touched: NO
PROJECT_KNOWLEDGE_SYNC: PASS
PROJECT_KNOWLEDGE_VERIFY: PASS
GIT:
- branch: Teemo/p3-personal-inspiration
- HEAD: f93a9341afb4c8e83f8e364933178a7dfda4233b
- worktree: DIRTY (implementation and evidence changes are uncommitted)
KNOWN_NON_BLOCKING_LIMITATIONS:
- No additional source types, watcher, provider integration, Agent Context injection, or natural-language root alias UX; all are outside approved P3-5 scope.
```

P3-5 Implementation Evidence received Strict Review approval. This stage is closed; P3-6 remains an independent Taskbook gate.
