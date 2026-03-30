---
phase: 05
plan: "03"
subsystem: publisher
tags: [publisher, repair-loop, diagnostics, ui]
requires: ["05-02"]
provides: ["AGNT-03", "AGNT-04"]
affects:
  - app/lib/publisher/agent-model.ts
  - app/components/publisher/PublisherReleaseWorkspace.tsx
  - app/components/publisher/PublisherIntakeWorkspace.tsx
  - app/components/workbench/StructureView.tsx
  - app/lib/publisher/agent-model.spec.ts
  - app/lib/publisher/publisher.spec.ts
tech_stack:
  - TypeScript
  - React
  - Vitest
key_files_modified:
  - app/lib/publisher/agent-model.ts
  - app/components/publisher/PublisherReleaseWorkspace.tsx
  - app/components/workbench/StructureView.tsx
decisions:
  - Repair CTAs stay suggestion-only and always route through one confirmation-gated prompt prefill path.
  - Diagnostic grouping reuses centralized categorization and intent derivation instead of duplicating UI heuristics.
metrics:
  started_at: 2026-03-30T18:20:00Z
  completed_at: 2026-03-30T18:23:00Z
---

# Phase 05 Plan 03: Release Repair Loop Summary

Deterministic release diagnostics now map into bounded `normalize|fill|repair` intents with an operator confirmation gate before any repair prompt is queued.

## Completed Work

- Added bounded repair prompt composition in `app/lib/publisher/agent-model.ts`, including explicit `intentBoundaries` text for normalize, fill, map, and repair paths.
- Added regression coverage in `app/lib/publisher/agent-model.spec.ts` for deterministic mapping and bounded fallback behavior.
- Extended `app/components/publisher/PublisherReleaseWorkspace.tsx` with `onQueueRepairIntent`, visible repair CTA buttons, and confirmation-required copy near diagnostics.
- Threaded the repair handoff through `app/components/publisher/PublisherIntakeWorkspace.tsx` into `app/components/workbench/StructureView.tsx`.
- Added a single `handleQueueRepairIntent` confirmation gate in `StructureView` so prompt prefill keeps page/zone/slot scope constrained.
- Added prompt-content regression coverage in `app/lib/publisher/publisher.spec.ts`.

## Verification

- `pnpm vitest app/lib/publisher/agent-model.spec.ts app/lib/publisher/publisher.spec.ts --run`
- `pnpm run test:publisher:release`
- `pnpm exec tsc --noEmit`
- `node "$HOME/.codex/get-shit-done/bin/gsd-tools.cjs" verify plan-structure .planning/phases/05-agent-operating-model/05-03-PLAN.md`

## Deviations from Plan

None - plan executed as written.

## Known Stubs

None.

## Self-Check: PASSED

- Summary file exists.
- Verification commands passed.
