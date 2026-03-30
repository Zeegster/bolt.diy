---
phase: 06
plan: "01"
subsystem: publisher
tags: [publisher, batch, queue, storage]
requires: []
provides: ["BATCH-01"]
affects:
  - app/lib/publisher/batch.ts
  - app/lib/publisher/batch.spec.ts
  - app/lib/publisher/persistence.ts
  - app/lib/publisher/intake-session.ts
tech_stack:
  - TypeScript
  - Vitest
key_files_modified:
  - app/lib/publisher/batch.ts
  - app/lib/publisher/persistence.ts
  - app/lib/publisher/intake-session.ts
decisions:
  - Batch queue stays fully derived from persisted project state and intake sessions instead of introducing another stored project model.
  - Persisted non-draft project statuses are respected in batch mode when build/check inputs are temporarily absent.
metrics:
  completed_at: 2026-03-30T18:28:00Z
---

# Phase 06 Plan 01: Batch Queue Summary

Publisher batch readiness now has a deterministic queue/inbox model built on top of existing persisted project and intake-session state.

## Completed Work

- Added `app/lib/publisher/batch.ts` with queue-row derivation, readiness/blocking/stuck signals, deterministic sorting, and snapshot-based adapters.
- Added `app/lib/publisher/batch.spec.ts` to cover queue derivation, ordering, and storage-backed normalization.
- Added `listPublisherProjectStates()` in `app/lib/publisher/persistence.ts` for project-side batch snapshots.
- Added `listIntakeSessionsByUpdatedAtDesc()` in `app/lib/publisher/intake-session.ts` for deterministic intake-side batch ordering.

## Verification

- `pnpm vitest app/lib/publisher/batch.spec.ts --run`
- `pnpm exec tsc --noEmit`

## Deviations from Plan

None - plan executed as written.

## Known Stubs

None.

## Self-Check: PASSED

- Summary file exists.
- Verification commands passed.
