# Phase 02 Research: Operator Review Workflow

## Goal

Turn the existing publisher intake/review/release surfaces into a coherent operator workflow without breaking the isolated Publisher Mode boundary established in Phase 1.

## Current Codebase Signals

### Existing workflow surfaces
- `app/components/workbench/StructureView.tsx` already orchestrates publisher state, intake sessions, checks, build history, and selected page state.
- `app/components/publisher/PublisherIntakeWorkspace.tsx` already acts as a publisher-specific container with project rail, page navigation, source references, and release workspace embedding.
- `app/components/publisher/PublisherIntakeReviewWorkspace.tsx` already covers disambiguation, metadata repair, source preview, and page-scoped checks.
- `app/components/publisher/PublisherReleaseWorkspace.tsx` already exposes status pills, working/release checks, and build history summaries.

### Supporting logic
- `app/lib/publisher/status.ts` centralizes publisher status derivation and is the right place to refine stage transitions.
- `app/lib/publisher/intake.ts` and related intake files already emit intake warnings/checks and ambiguity signals.
- `app/lib/publisher/intake-ui.ts` now has diagnostics categorization helpers from Phase 1.
- `app/lib/publisher/contracts.ts` and `app/lib/publisher/checker.ts` already define the contract-safe rules the Phase 2 UI must surface.

### Constraints
- Publisher Mode must remain inside the existing workbench and must not regress the default coding workflow.
- Page/project metadata ownership remains outside block editing and outside agent-generated slot props.
- The current worktree is dirty in publisher-related files, so Phase 2 should avoid broad rewrites and prefer incremental tightening of existing surfaces.

## Gaps Relative to Phase Goal

1. Workflow state is present but not yet consistently presented as an explicit operator journey across intake, review, and release.
2. Source-of-truth editing exists for some metadata but still needs clearer source/contract/output comparison and stronger repair ergonomics.
3. Diagnostics exist but remain split across places and need more operator-friendly grouping and action framing.
4. Constrained block editing for risky fields and invalid composition prevention is not yet a clear, dedicated UX path.

## Planning Recommendations

- Use existing publisher workspace components as the backbone; do not introduce a parallel routing model.
- Break the phase into:
  1. State machine and stage/status clarity
  2. Source/metadata repair surfaces
  3. Source-contract-output comparison and grouped diagnostics
  4. Constrained block editing and invalid composition prevention
- Keep tests centered on publisher workflow behavior and stage/status derivation.
- Prefer reusing existing workbench diff/editor primitives over new bespoke comparison infrastructure.

## Risk Notes

- `roadmap analyze` and `init milestone-op` currently disagree on phase counts; use roadmap analysis as the authoritative milestone source during autonomous progression.
- Existing untracked publisher files indicate in-progress local work. Planning should assume incremental integration rather than greenfield implementation.
