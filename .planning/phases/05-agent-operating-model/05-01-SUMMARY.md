---
phase: 05-agent-operating-model
plan: "01"
subsystem: publisher-prompts
tags: [publisher, prompts, agent, repair, vitest]
requires:
  - phase: 04.1-publisher-intake-adapter-markdown-html-guardrails-deterministic-batch-normalize-contract
    provides: deterministic imported review/release surfaces and bounded metadata normalize workflow
provides:
  - explicit global publisher prompt ownership boundaries and default-deny output clauses
  - scoped prompt-context intent and file-scope markers for page, slot, preview, and repair flows
  - regression tests locking repair-oriented wording and forbidden-output language
affects: [05-02, 05-03, runtime-guard, publisher-ui]
tech-stack:
  added: []
  patterns: [intent-tagged prompt builders, prompt-level default-deny generated/intake surfaces]
key-files:
  created: [.planning/phases/05-agent-operating-model/05-01-SUMMARY.md]
  modified: [app/lib/common/prompts/publisher.ts, app/lib/publisher/prompt-context.ts, app/lib/publisher/publisher.spec.ts]
key-decisions:
  - "Preview rebuild prompts are tagged as repair-intent with generated-rebuild-only scope instead of staying as generic regenerate text."
  - "Prompt boundary regressions are guarded in publisher.spec.ts rather than relying on snapshot-only text reviews."
patterns-established:
  - "All publisher scoped prompt builders carry explicit intent and targetFileScope markers."
  - "Global publisher prompt text encodes default-deny generated/intake ownership, not just generic warnings."
requirements-completed: [AGNT-03, AGNT-04]
duration: 15min
completed: 2026-03-30
---

# Phase 05 Plan 01: Prompt Ownership Summary

**Publisher prompts now declare explicit `normalize|map|fill|repair` intents, default-deny generated/intake writes, and bounded repair scope markers**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-30T14:56:00Z
- **Completed:** 2026-03-30T15:11:18Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Hardened the global publisher prompt with explicit allowed intents, default-deny generated/intake write policy, and a direct prohibition on inventing new zones or block IDs without operator approval.
- Added intent and `targetFileScope` markers to page, slot, preview, and new repair prompt builders so downstream runtime/UI layers can reason about repair scope deterministically.
- Expanded prompt regression coverage to lock ownership-boundary wording and repair-loop language in tests.

## Task Commits

1. **Task 1-3: Prompt ownership clauses, intent markers, and regression tests** - `PENDING` (feat)

## Files Created/Modified

- `app/lib/common/prompts/publisher.ts` - Global publisher prompt now states explicit intents and default-deny generated/intake output policy.
- `app/lib/publisher/prompt-context.ts` - Scoped prompt builders now emit intent and scope markers plus a new repair prompt builder.
- `app/lib/publisher/publisher.spec.ts` - Tests lock prompt wording for ownership boundaries and repair-oriented scoped prompts.
- `.planning/phases/05-agent-operating-model/05-01-SUMMARY.md` - Plan execution record.

## Decisions Made

- Kept prompt changes additive and text-based so `05-02` runtime enforcement can consume the same vocabulary without rewriting the chat or action pipeline first.
- Added `buildRepairRegeneratePrompt` in prompt-context rather than scattering repair prompt assembly through UI components.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `05-02` can now parse and enforce the same `normalize|map|fill|repair` vocabulary at runtime.
- `05-03` can reuse `buildRepairRegeneratePrompt` when converting diagnostics into confirmation-gated repair actions.

## Self-Check: PENDING

- Summary file exists.
- Plan commit hash will be filled after commit creation.
