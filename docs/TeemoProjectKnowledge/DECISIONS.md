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
