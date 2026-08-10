# Teemo Architecture

## Stable Execution Path

```text
User
  -> Teemo Agent Core
  -> Context
  -> Tool Calling
  -> Tool Registry
  -> Permission Layer
  -> Main Process
  -> Local / External Capability
```

## Independent Facts Sources

The following remain independent facts sources: Cognition, Creative Profile, Challenge, Skill, Project, Inspiration, and Project Knowledge. Project Knowledge is project engineering state; it must not become part of Cognition, Skill, Inspiration, or Creative Profile.

## Security Boundaries

- Renderer does not own high-privilege filesystem execution.
- Main Process is the local execution security boundary.
- A model is not the Permission Source of Truth.
- Tool Calling does not equal automatic authorization.
- P1 authorized roots remain the filesystem authorization Source of Truth.
- Ordinary Chat does not expose arbitrary Shell, Git Tools, Controlled Execute, delete, or destructive operations.
- Automated tests use isolated profiles and synthetic data, never formal user data.
