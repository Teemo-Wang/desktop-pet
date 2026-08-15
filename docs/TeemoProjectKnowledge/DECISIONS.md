# Teemo Active Decisions

## D-2026-08-10-01

Date:
`2026-08-10`

Decision:
Ordinary Chat Tool Calling exposes only Safe File Tools.

Reason:
Enable safe local file work without expanding the local execution attack surface.

Scope:
Chat Agent

Status:
`ACTIVE`

## D-2026-08-10-02

Date:
`2026-08-10`

Decision:
Natural-language authorized-root aliases do not block M1.

Reason:
Explicit paths within P1 authorized roots have completed real E2E validation; root aliases are a UX enhancement.

Scope:
Chat Agent File Tools

Status:
`ACTIVE`

## D-2026-08-10-03

Date:
`2026-08-10`

Decision:
`docs/TeemoProjectKnowledge/INDEX.md` is the single entry for Teemo project knowledge.

Reason:
Agents need one Git-tracked, verifiable current-state authority instead of copied handoffs or private memory.

Scope:
All Teemo development and maintenance Agents

Status:
`ACTIVE`

## D-2026-08-10-04

Date:
`2026-08-10`

Decision:
`CURRENT-STATE.md` keeps Git branch, HEAD, and worktree only as a Last Verified Git Snapshot.

Reason:
Tracked documentation cannot remain permanently equal to Git HEAD and worktree after it changes or is committed. Runtime Git queries are the authoritative source for those facts.

Scope:
Teemo Project Knowledge verification and Agent Pre-Flight

Status:
`ACTIVE`

## D-2026-08-10-05

Date:
`2026-08-10`

Decision:
P4-3 permits only one explicit Runtime-local ComfyUI adapter with a fixed Main Process loopback endpoint and static workflow.

Reason:
Provide a bounded design-tool workflow without turning Teemo into a general ComfyUI, network, filesystem, Chat, Agent, or desktop-automation client.

Scope:
P4-3 Design Tool Adapters / Workflows

Status:
`ACTIVE`

## D-2026-08-11-01

Date:
`2026-08-11`

Decision:
After an AI Agent completes a change that affects the packaged Windows application and all applicable task, review, release-version, and Project Knowledge gates pass, the same task automatically rebuilds the installer, installs the current verified version, restarts the formal application, and verifies the installed version. Documentation-, test-, development-script-, and Project-Knowledge-only changes do not trigger deployment.

Reason:
Keep the formal running application aligned with the verified source without requiring a second manual deployment request, while preserving Taskbook prohibitions, explicit user opt-outs, version discipline, and formal user data.

Scope:
All Teemo AI development and maintenance Agents

Status:
`SUPERSEDED BY D-2026-08-12-02`

## D-2026-08-12-01

Date:
`2026-08-12`

Decision:
Structured AI Intent failure or insufficient confidence denies every capability escalation but falls back to ordinary `normal_chat` through the tool-free response path.

Reason:
Fail-closed execution safety must not make ordinary conversation depend on classifier availability or correctness.

Scope:
V1.4.1 ordinary Chat intent routing

Status:
`ACTIVE`

## D-2026-08-12-02

Date:
`2026-08-12`

Decision:
Focused implementation may build, install, and restart after the complete local verification gate passes. External GPT Strict Review is optional/recommended and is not a deployment prerequisite.

```text
EXTERNAL_REVIEW_DEPLOYMENT_GATE: REMOVED
LOCAL_VERIFICATION_GATE: ACTIVE
BUILD_AFTER_LOCAL_PASS: ALLOWED
INSTALL_AFTER_LOCAL_PASS: ALLOWED
RESTART_AFTER_LOCAL_PASS: ALLOWED
FORMAL_USER_DATA_PROTECTION: ACTIVE
```

Reason:
Local deployment feedback should not depend on external reviewer availability when focused tests, affected regressions, Electron smoke, syntax, release/version knowledge, diff, data protection, security-boundary checks, and build-input provenance have all passed.

Scope:
All Teemo local Windows build/install/restart workflows. External review may still be requested for stage closure, architecture or P1/Permission/Main/Tool Registry boundary changes, and release/tag review.

Status:
`SUPERSEDED BY D-2026-08-12-03`

## D-2026-08-12-03

Date:
`2026-08-12`

Decision:
Remove every deployment-time review gate. After a packaged-application change, the same Agent task must automatically build, install, and restart so the formal Windows app becomes the latest change.

```text
EXTERNAL_REVIEW_DEPLOYMENT_GATE: REMOVED
LOCAL_VERIFICATION_GATE: REMOVED
AUTO_DEPLOY_AFTER_CHANGE: ACTIVE
BUILD_AFTER_CHANGE: REQUIRED
INSTALL_AFTER_CHANGE: REQUIRED
RESTART_AFTER_CHANGE: REQUIRED
FORMAL_USER_DATA_PROTECTION: ACTIVE
```

Reason:
Waiting for external Strict Review, WAITING REVIEW, or a complete local verification suite blocks the user from getting the newest Teemo immediately. Formal user data protection and unknown dirty-build exclusion remain hard safety boundaries, not review gates.

Scope:
All Teemo local Windows build/install/restart workflows after packaged-application changes.

Status:
`ACTIVE`

## D-2026-08-12-04

Date:
`2026-08-12`

Decision:
Ordinary Chat orchestration should move toward single-pass AI understanding. Do not keep an extra full Provider Intent Classifier round-trip before every normal reply. Prefer: normal Chat first; only when the model requests a capability, locally validate and execute through existing Permission / Tool Registry / Main paths.

Reason:
The current V1.4.1 pre-send classifier adds latency and often forces tool-free fallback, which makes natural language feel less understood. GPT overview guidance and local architecture audit agree on removing the default double-request path while keeping local permission authority.

Scope:
V1.4 / V1.4.1 Chat orchestration maintenance. Does not authorize Shell/Git exposure or weakening P1/Main.

Status:
`ACTIVE`

## D-2026-08-12-05

Date:
`2026-08-12`

Decision:
Chat operation approval UX uses three GPT-style levels (`ask` / `assisted` / `full`). All three levels use local drive roots for Safe File (no separate folder-boundary settings UI). Levels only control prompting frequency. High-risk execute / desktop click / ComfyUI actions always prompt. Git / Execute / Inspiration keep their own authorized-root providers where required.

Reason:
Per-file prompts and a separate “authorized folder” settings card felt redundant once Safe File already spans drive letters like ChatGPT full access.

Scope:
Chat permission UX, Safe File `rootsProvider`, and removal of the Chat settings “本地文件夹边界” card. Does not expand Shell/Git/Execute Tool allowlists.

Status:
`ACTIVE`
