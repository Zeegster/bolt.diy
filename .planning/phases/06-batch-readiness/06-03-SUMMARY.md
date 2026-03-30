---
phase: 06
plan: "03"
subsystem: publisher
tags: [publisher, batch, orchestration, ui]
requires: ["06-02"]
provides: ["BATCH-03", "QUAL-02"]
affects:
  - app/lib/publisher/orchestration.ts
  - app/lib/publisher/orchestration.spec.ts
  - app/components/publisher/PublisherReleaseWorkspace.tsx
  - app/components/publisher/PublisherIntakeWorkspace.tsx
  - app/components/workbench/StructureView.tsx
tech_stack:
  - TypeScript
  - React
  - Vitest
key_files_modified:
  - app/lib/publisher/orchestration.ts
  - app/components/workbench/StructureView.tsx
decisions:
  - Orchestration actions are modeled as a local transport envelope first so the UI contract can stay stable when remoting is added later.
  - Future Lighthouse-style checks are represented as optional quality extensions rather than hard release gates.
metrics:
  completed_at: 2026-03-30T18:34:00Z
---

# Phase 06 Plan 03: Orchestration Seam Summary

Publisher batch mode now has a typed orchestration contract and optional UI handoff callbacks without replacing the existing local operator workflow.

## Completed Work

- Added `app/lib/publisher/orchestration.ts` with typed orchestration actions for enqueue, rebuild, release checks, publish/export, and retry-repair flows.
- Added optional quality extension support in the orchestration envelope for future Lighthouse or export verifiers.
- Added `app/lib/publisher/orchestration.spec.ts` covering action validation and quality-extension metadata.
- Threaded optional orchestration callbacks through `PublisherReleaseWorkspace`, `PublisherIntakeWorkspace`, and `StructureView`.
- Kept current local flow intact by letting orchestration-triggered rebuild/check/publish actions continue through existing local preview rebuild behavior.

## Verification

- `pnpm vitest app/lib/publisher/orchestration.spec.ts --run`
- `pnpm exec tsc --noEmit`
- `pnpm run test:publisher:release`

## Deviations from Plan

None - plan executed as written.

## Known Stubs

None.

## Self-Check: PASSED

- Summary file exists.
- Verification commands passed.
