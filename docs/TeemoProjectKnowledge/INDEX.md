# Teemo Project Knowledge

## Project

- Product: `Teemo助理`
- Official source: `D:\Teemo助手\Teemo机器人项目\Teemo-source`
- Project Knowledge directory: `docs/TeemoProjectKnowledge/`
- Current stable project status and version: `CURRENT-STATE.md`

## Single Entry And Reading Order

This file is the required first project document for every AI or Agent working on Teemo itself. Before any Teemo development task, read in order:

1. `INDEX.md`
2. `CURRENT-STATE.md`
3. `ROADMAP.md`
4. `ARCHITECTURE.md`
5. `DECISIONS.md`

Then read task-specific material as needed: root `AGENTS.md`, `CURRENT-TASK.md`, `PROJECT-STATUS.md`, root `CHANGELOG.md`, the relevant stage document, source, and tests. If time is limited, at minimum read this file, `CURRENT-STATE.md`, and root `AGENTS.md`.

## Document Responsibilities

- `CURRENT-STATE.md`: authoritative current project-status summary.
- `ROADMAP.md`: confirmed stage route plus the active cross-stage local deployment policy.
- `ARCHITECTURE.md`: stable architecture and security boundaries.
- `DECISIONS.md`: active decisions that constrain future work.
- `CHANGELOG.md`: concise capability evolution for Agents.
- `HISTORY/`: immutable snapshots of formally closed important stages.

Root `CURRENT-TASK.md` is the current single implementation task. Root `PROJECT-STATUS.md` keeps detailed engineering-stage records. Root `CHANGELOG.md` keeps product and release changes. Historical chats, copied handoffs, and SOP files are not current-status authorities.

## Conflict Rules

For current status, `CURRENT-STATE.md` overrides old chats, copied handoffs, and historical status documents. Git branch, HEAD, worktree, actual code, `package.json`, and executed test results are higher-order engineering facts. Agents must query Git directly during Pre-Flight. `CURRENT-STATE.md` may retain a Last Verified Git Snapshot, but that snapshot is historical and is never required to equal current Git. If stable Project Knowledge claims disagree with real engineering facts, stop inferring, inspect the real state, and correct documentation without changing business code merely to match a document.

## Update Rules

After any Teemo source change, update the affected root task/status/changelog documents and this Project Knowledge set. Update `DECISIONS.md` only for active cross-task decisions and `ROADMAP.md` only when the confirmed route changes. Then run:

```powershell
npm.cmd run project:knowledge:sync
npm.cmd run project:knowledge:verify
```

`sync` updates the Project Knowledge version, latest recovery tag, and an optional Last Verified Git Snapshot. It never decides PASS, CLOSED, blockers, or next-stage approval. `verify` reads Git directly and checks version consistency, required Project Knowledge structure, root status-document consistency, and Agent Pre-Flight/Post-Flight rules. It does not compare the historical Git snapshot with live HEAD or worktree.

## Local Deployment Gate

```text
EXTERNAL_REVIEW_DEPLOYMENT_GATE: REMOVED
LOCAL_VERIFICATION_GATE: REMOVED
AUTO_DEPLOY_AFTER_CHANGE: ACTIVE
BUILD_AFTER_CHANGE: REQUIRED
INSTALL_AFTER_CHANGE: REQUIRED
RESTART_AFTER_CHANGE: REQUIRED
FORMAL_USER_DATA_PROTECTION: ACTIVE
```

After any packaged-application change, the same Agent task must automatically build, install, and restart the formal Windows application so the user immediately runs the latest change. External GPT Strict Review, WAITING REVIEW, and local verification suites are not deployment prerequisites. Formal user data protection and exclusion of unknown dirty build input remain hard safety boundaries.

## Agent Start And Finish

Before modifying Teemo, follow the unified Pre-Flight in root `AGENTS.md`, including this reading order and Git/version inspection. Before reporting implementation evidence, follow its Post-Flight: synchronize Project Knowledge and require `project:knowledge:verify` to pass. No review gate may block auto-deploy after a packaged change.
