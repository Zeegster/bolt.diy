---
phase: 05-agent-operating-model
plan: "02"
subsystem: publisher-runtime
tags: [publisher, runtime, zod, action-runner, vitest]
requires:
  - phase: 05-agent-operating-model
    provides: prompt-level intent vocabulary and file-scope markers
provides:
  - typed publisher action contract for normalize, map, fill, and repair intents
  - runtime publisher file write guard with explicit contract/check scope enforcement
  - Wave 0 regression tests for action parsing and out-of-scope publisher writes
affects: [05-03, 06-batch-readiness, runtime-actions]
tech-stack:
  added: []
  patterns: [zod discriminated union for agent intents, runtime publisher path guard with contracts-only fallback]
key-files:
  created: [app/lib/publisher/agent-model.ts, app/lib/publisher/agent-model.spec.ts, app/lib/runtime/action-runner.spec.ts, .planning/phases/05-agent-operating-model/05-02-SUMMARY.md]
  modified: [app/types/publisher.ts, app/types/actions.ts, app/lib/runtime/action-runner.ts]
key-decisions:
  - "File actions can optionally carry `publisherAction`, but runtime falls back to `contracts-only` for publisher paths so missing metadata never widens write scope."
  - "Runtime guard lives in `action-runner` as the single filesystem choke-point instead of spreading checks through UI layers."
patterns-established:
  - "Publisher intent parsing is centralized in `agent-model.ts` and reused by runtime and repair-loop code."
  - "Publisher runtime denies generated, intake, and state writes before any filesystem mutation."
requirements-completed: [AGNT-01, AGNT-02, AGNT-03]
duration: 21min
completed: 2026-03-30
---

# Phase 05 Plan 02: Runtime Guard Summary

**Typed publisher action contract with `normalize|map|fill|repair` parsing and runtime file write blocking for generated, intake, and state surfaces**

## Performance

- **Duration:** 21 min
- **Started:** 2026-03-30T14:55:00Z
- **Completed:** 2026-03-30T15:16:24Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Added a Zod-based publisher action model with strict parsing and file-scope resolution for `normalize`, `map`, `fill`, and `repair`.
- Enforced publisher write boundaries in `ActionRunner` before `mkdir`/`writeFile`, blocking `generated`, `intake`, and `state.json` surfaces while allowing contracts and optional `checks.json` for repair.
- Filled the Phase 05 Wave 0 gaps with focused tests for action parsing and publisher write-guard behavior.

## Task Commits

1. **Task 1-3: Agent action contract, runtime guard, and Wave 0 tests** - `PENDING` (feat)

## Files Created/Modified

- `app/lib/publisher/agent-model.ts` - Canonical action contract parser, file-scope resolver, and repair-intent helpers.
- `app/types/publisher.ts` - Shared publisher action contract and file-scope types.
- `app/types/actions.ts` - Optional `publisherAction` metadata on file actions.
- `app/lib/runtime/action-runner.ts` - Runtime publisher write guard and exported helper/error for tests.
- `app/lib/publisher/agent-model.spec.ts` - Validates allowed action intents and deterministic repair mapping.
- `app/lib/runtime/action-runner.spec.ts` - Validates allowed vs blocked publisher write targets.
- `.planning/phases/05-agent-operating-model/05-02-SUMMARY.md` - Plan execution record.

## Decisions Made

- Used `contracts-only` as the safe default fallback scope so missing publisher action metadata cannot silently widen runtime access.
- Exported `assertPublisherFileWriteAllowed` and `ActionCommandError` for unit-level verification instead of booting the whole workbench/runtime stack.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- One initial TypeScript error came from importing `PublisherDiagnosticCategory` from the wrong module; resolved by sourcing it from `intake-ui.ts`, where the category type is defined.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `05-03` can now convert release diagnostics into typed repair intents without inventing a second action vocabulary.
- Phase `06` batch/orchestration seams can reuse the same action contract instead of adding another freeform command model.

## Self-Check: PENDING

- Summary file exists.
- Plan commit hash will be filled after commit creation.
