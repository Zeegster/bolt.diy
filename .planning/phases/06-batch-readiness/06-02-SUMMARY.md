---
phase: 06
plan: "02"
subsystem: publisher
tags: [publisher, batch, metrics, diagnostics]
requires: ["06-01"]
provides: ["BATCH-02", "QUAL-01"]
affects:
  - app/lib/publisher/batch-metrics.ts
  - app/lib/publisher/batch-metrics.spec.ts
  - app/lib/publisher/batch.ts
tech_stack:
  - TypeScript
  - Vitest
key_files_modified:
  - app/lib/publisher/batch-metrics.ts
  - app/lib/publisher/batch-metrics.spec.ts
decisions:
  - Batch metrics consume queue rows plus optional diagnostic maps instead of deriving a second status taxonomy.
  - Failure buckets reuse `categorizePublisherDiagnostic` so batch reporting stays aligned with operator diagnostics.
metrics:
  completed_at: 2026-03-30T18:30:00Z
---

# Phase 06 Plan 02: Batch Metrics Summary

Publisher batch mode now exposes one deterministic metrics contract for throughput, aging, stage counts, and failure buckets.

## Completed Work

- Added `app/lib/publisher/batch-metrics.ts` with aggregate metrics helpers for queue counts, stale/stuck projects, recent builds, average time in stage, and operator-facing summary output.
- Added `bucketBatchFailuresByDiagnostic()` to reuse publisher diagnostic categories without duplicating heuristics.
- Added `app/lib/publisher/batch-metrics.spec.ts` covering throughput aggregation, failure bucket taxonomy, and summary contract stability.

## Verification

- `pnpm vitest app/lib/publisher/batch-metrics.spec.ts --run`
- `pnpm exec tsc --noEmit`

## Deviations from Plan

None - plan executed as written.

## Known Stubs

None.

## Self-Check: PASSED

- Summary file exists.
- Verification commands passed.
