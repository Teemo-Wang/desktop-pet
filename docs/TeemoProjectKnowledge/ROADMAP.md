# Teemo Roadmap

This roadmap contains only the confirmed route. A stage begins only after its own Taskbook is approved.

## P3 Personal Inspiration Intelligence

1. P3-4 Inspiration Retrieval
2. P3-5 More Inspiration Sources
3. P3-6 Agent Uses Inspiration
4. P3 Final Acceptance

## P4 Runtime And Desktop Capability

1. Runtime / Screen Awareness
2. Controlled Desktop Actions
3. Design Tool Adapters / Workflows
4. P4 Final Acceptance

## P5 Autonomous Capability

1. Autonomous Planning
2. Autonomous Execution / Verification
3. Controlled Self-Upgrade
4. P5 Final Acceptance

No P3-4, P4, or P5 work is authorized until an independent approved Taskbook defines its scope and gate.

## V1.4 Productization And Stability

V1.4 is a maintenance/productization stage after closed P0-P5. Its first Taskbook is `docs/Teemo-V1.4-PRODUCTIZATION-STABILITY.md` with status `IMPLEMENTED / STRICT REVIEW PASS / DEPLOYED`; both Taskbook and implementation-evidence reviews returned `PASS / BLOCKERS: 0`.

The confirmed first scope is limited to existing capability awareness, deterministic ordinary Chat intent routing, Tool-contract stabilization, user-facing error normalization, unified public execution states, and Chat-first reuse of existing paths. It adds no core capability. Implementation, isolated deployment, installed-content verification, and restart are complete.

The focused Route-Specific Tool Exposure follow-up is `IMPLEMENTED / DEPLOYED / REVIEW NOT REQUIRED`. It restricts the eight existing Safe File Provider definitions to `safe_file_operation`; normal Chat, Inspiration, and planning expose zero Safe File definitions, while P5-2 remains unchanged. Pre-review deployment already completed with formal data preserved. No review gate remains for this follow-up.

## V1.4.1 AI Intent Orchestration Optimization

The V1.4.1 Taskbook is `docs/Teemo-V1.4.1-AI-INTENT-ORCHESTRATION.md`; Taskbook Strict Review returned `PASS / BLOCKERS: 0 / IMPLEMENTATION_ALLOWED: YES`, implementation-evidence review returned `PASS / BLOCKERS: 0 / IMPLEMENTATION_ACCEPTED: YES / DEPLOYMENT_ALLOWED: YES`, and focused implementation is `IMPLEMENTED / STRICT REVIEW PASS / DEPLOYED`.

Implementation remains within the approved hybrid top-level Router: explicit high-confidence local controls, otherwise zero-Tool Structured AI Intent classification, strict local confidence/capability/state validation, fixed route-specific exposure, and minimal reuse of the existing P5-3 controller from ordinary Chat. Because the current plan has no trusted P5-2/P5-3 type marker, execute-current-plan requests also use Structured AI Intent. It adds no new capability, ordinary Chat Tool, permission, IPC/Main privilege, persistence, dependency, or version change. External review accepted the implementation; packaging, installation, installed-content verification, formal-data preservation, and restart are complete.

## Local Deployment Policy

```text
EXTERNAL_REVIEW_DEPLOYMENT_GATE: REMOVED
LOCAL_VERIFICATION_GATE: REMOVED
AUTO_DEPLOY_AFTER_CHANGE: ACTIVE
BUILD_AFTER_CHANGE: REQUIRED
INSTALL_AFTER_CHANGE: REQUIRED
RESTART_AFTER_CHANGE: REQUIRED
FORMAL_USER_DATA_PROTECTION: ACTIVE
```

After any packaged-application change, automatically build/install/restart in the same task. External review and local verification suites are not deployment prerequisites. Formal user data protection remains active.
