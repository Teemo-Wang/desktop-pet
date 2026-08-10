# Teemo P3-6 Agent Uses Inspiration - Taskbook

Status: `CLOSED / PASS`

## Gate

P3-5 More Inspiration Sources is `CLOSED / PASS / BLOCKERS: 0` with GPT Strict Review approval.
P3-5 close commit: `8d9da07ea5f98c0442a7f795c5b964896c53e588`.
P3-5 recovery tag: `v1.3.2-p3.5-eagle-library`.
P3-6 Taskbook received GPT Strict Review approval: `PASS / BLOCKERS: 0 / IMPLEMENTATION_ALLOWED: YES`.

## Objective

Allow the Agent to use existing local Inspiration Retrieval results when the user explicitly asks for inspiration/reference help, while preserving P3 source isolation, P1 authorization, provider-neutral Agent Core, and Main Process security boundaries.

The first P3-6 version is a bounded, read-only retrieval-to-context path. It does not add a new source, index, search engine, permission root, or autonomous behavior.

## Proposed Core Path

```text
User explicitly requests inspiration/reference help
  -> deterministic request gate
  -> existing P3-4 Retrieval in Main Process
  -> P1 authorized-root/source/index revalidation
  -> bounded local metadata result
  -> provider-neutral Inspiration Context composer
  -> existing Agent Core / Provider request
```

## Required Scope

- Add one deterministic, provider-neutral Inspiration request gate for explicit user intent only.
- Reuse the existing Main Process P3-4 Retrieval service and IPC; do not scan source directories during a chat turn.
- Return only bounded public metadata already exposed by Retrieval: source display name, item name, relative path, MIME/format, dimensions, size, and modified time when available.
- Keep result count and serialized context under explicit hard limits; fail closed on malformed, unavailable, revoked, removed, disabled, corrupt, or unindexed sources.
- Compose Inspiration Context as clearly labeled untrusted reference data, separate from Project, Skill, Cognition, Creative, Challenge, and Current User facts.
- Keep existing Agent Core and Provider adapters provider-neutral; GPT, Grok, DeepSeek and other compatible providers receive the same context contract.
- Preserve ordinary Chat Safe File Tool allowlist exactly as-is. Git Tools, Controlled Execute, Shell, PowerShell, delete, and destructive operations remain unavailable.
- Use isolated synthetic profiles, sources, and indexes for Node and Electron tests.

## Explicit Trigger Contract

- Inspiration retrieval is eligible only when the user explicitly asks for inspiration, references, examples,素材,灵感, or equivalent reference lookup.
- Generic chat, coding, file-operation, memory, or design-judgment requests do not trigger retrieval.
- No background retrieval, watcher, proactive suggestion, hidden query expansion, or automatic use based only on conversation history.
- The deterministic gate may extract a bounded keyword query from the user's message; it must not infer filesystem paths or invent source IDs.
- Empty, ambiguous, unsupported, or overlong queries produce no retrieval and continue normal chat.

## Security Requirements

- Main Process remains the final local authorization boundary.
- P1 authorized roots remain the filesystem authorization Source of Truth; Source Registry and model output cannot grant access.
- Retrieval must use active P3-3/P3-5 index snapshots and existing authorization revalidation.
- Provider must never receive API keys, absolute local paths, source bytes, preview bytes, credentials, or hidden filesystem metadata.
- Relative paths may be returned only in the existing bounded public retrieval shape and must not be converted to executable filesystem requests by the context layer.
- Inspiration Context must be marked as untrusted reference material; text from filenames/metadata cannot issue Agent instructions or alter Tool permissions.
- Retrieval failures are non-fatal to ordinary chat but must be observable in run evidence and must not yield fabricated results.
- Revocation, removal, disabled Inspiration, corrupt index, or stale source state must produce zero context items.

## Non-Goals

- No new Eagle/NAS/Web/cloud source, official Eagle API, crawler, watcher, or background daemon.
- No semantic search, Embedding, Vector DB, image similarity, OCR, color/style tagging, or natural-language query planner.
- No preview bytes or image upload to a Provider in P3-6.
- No write, delete, rename, move, shell, PowerShell, Git, Controlled Execute, program execution, or desktop automation.
- No new filesystem authorization root or Permission escalation.
- No expansion of the ordinary Chat Safe File Tool allowlist.
- No P4 or P5 implementation.

## Acceptance

Using synthetic indexed sources only:

1. Explicit request such as “找一些适合这个页面的灵感参考” retrieves bounded local metadata and produces an Inspiration Context block.
2. The normal Provider request contains the same provider-neutral context contract across supported adapters and contains no absolute local path or source bytes.
3. Generic chat does not call Retrieval and does not receive Inspiration Context.
4. Disabled Inspiration, revoked authorization, removed source, corrupt index, unavailable source, and malformed query fail closed with zero context items and a normal-chat fallback.
5. Context size, item count, query length, and metadata field lengths stay within hard limits.
6. Metadata text containing prompt-injection-like instructions remains inert reference data and cannot change tools or permissions.
7. Existing P3-1/P3-2/P3-3/P3-4/P3-5 regression, M1 Native Tool Calling, and P1/P2 regression remain passing.
8. Electron smoke proves explicit-trigger retrieval, generic-chat bypass, disabled/revoked fail-closed behavior, provider payload redaction, and formal user-data isolation.

## Evidence Required

```text
P3-6 Agent Uses Inspiration
STATUS: CLOSED / PASS
TRIGGER_GATE: PASS
RETRIEVAL_REUSE: PASS
INSPIRATION_CONTEXT: PASS
PROVIDER_NEUTRAL: PASS
ABSOLUTE_PATHS_TO_PROVIDER: NO
SOURCE_BYTES_TO_PROVIDER: NO
P1_AUTHORIZATION_BYPASSED: NO
CHAT_SAFE_FILE_ALLOWLIST_CHANGED: NO
P1_SAFE_FILE_TOOL_RENDERER_DIRECT_FS: NO
P3_6_RENDERER_SOURCE_FILESYSTEM_READS: NO
GIT_TOOLS_EXPOSED_TO_CHAT: NO
CONTROLLED_EXECUTE_EXPOSED_TO_CHAT: NO
SHELL_EXPOSED_TO_CHAT: NO
DELETE_EXPOSED_TO_CHAT: NO
P3-5_CHANGED: NO
P4_STARTED: NO
P5_STARTED: NO
TESTS: PASS
- P3-6: `test:inspiration-context` (11 assertions), `test:inspiration-context-ui-smoke`.
- P3 regression: `test:inspiration-foundation`, `test:inspiration-isolation`, `test:inspiration-ui-smoke`, `test:local-folder`, `test:local-folder-isolation`, `test:local-folder-ui-smoke`, `test:inspiration-index`, `test:inspiration-index-isolation`, `test:inspiration-index-ui-smoke`, `test:inspiration-retrieval`, `test:inspiration-retrieval-ui-smoke`, `test:eagle-library`, `test:eagle-library-ui-smoke`.
- Agent/P1/M1 regression: `test:agent-core`, `test:chat-tool-calling-ui-smoke`, `test:permissions`, `test:file-tools`, `test:skill-ui-smoke`.
- Release and Project Knowledge: `verify:release-version`, `project:knowledge:sync`, `project:knowledge:verify`, `git diff --check`.
ELECTRON_SMOKE: PASS - `npm.cmd run test:inspiration-context-ui-smoke`; explicit retrieval READY with 1 bounded item, generic chat BYPASS, disabled/revoked fail-closed, zero provider calls, no absolute path/source bytes/formal user data.
PROJECT_KNOWLEDGE_SYNC: PASS
PROJECT_KNOWLEDGE_VERIFY: PASS
GIT:
- branch: `Teemo/p3-personal-inspiration`
- HEAD: `f47e855b08f4d12b077efda642a6d2a16ea552b3` (runtime snapshot before final doc sync)
- worktree: `DIRTY` (implementation and evidence changes are uncommitted)
KNOWN_NON_BLOCKING_LIMITATIONS: Natural-language authorized-root alias/root-grounding UX is not required for P3-6 and remains a later enhancement; no filesystem authorization is expanded.
```

Implementation Evidence received external GPT Strict Review: `PASS / BLOCKERS: 0 / REQUIRED_FIXES: none / CAN_CLOSE_AND_TAG: YES / NEXT_STAGE_ALLOWED: P3 Final Acceptance`. P3-6 is closed; the close commit and recovery tag are authorized. P3 Final Acceptance remains a separate Taskbook and has not started.
