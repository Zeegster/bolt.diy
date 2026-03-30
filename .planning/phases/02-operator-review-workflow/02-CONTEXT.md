# Phase 2: Operator Review Workflow - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 2 turns the current publisher intake/review/release surfaces into an explicit operator workflow. Scope is limited to workflow clarity, repair surfaces, grouped diagnostics, and constrained editing inside Publisher Mode. This phase does not add batch orchestration, new publishing backends, or broaden the contract model beyond what Phase 1 already locked.

</domain>

<decisions>
## Implementation Decisions

### Workflow stages and status visibility
- **D-01:** Keep Publisher Mode isolated inside the existing workbench and make the operator journey explicit through visible workflow stages rather than introducing a separate app shell.
- **D-02:** The primary workflow states for this phase are intake, review, and release readiness, mapped onto the existing publisher status model instead of inventing a second state machine.
- **D-03:** Status surfaces should explain what is blocking progress and what action the operator should take next, not just display raw enum values.

### Repair and review surfaces
- **D-04:** Source-of-truth review must keep source content, contract edits, and release output understandable in one workflow, using side-by-side or clearly linked surfaces instead of forcing the operator to inspect raw files manually.
- **D-05:** Metadata repair should stay inline and page-scoped; operators should be able to fix title, description, H1, and extracted sections without leaving the review flow.
- **D-06:** Diff-oriented review should reuse existing workbench/editor affordances where possible rather than inventing a separate diff subsystem just for Publisher Mode.

### Diagnostics and readiness model
- **D-07:** Diagnostics must be grouped by severity and by operator-meaningful categories such as metadata, zone/block composition, ownership, deprecated blocks, and release blockers.
- **D-08:** Working and release readiness should remain distinct so draft iteration stays possible while publish-blocking issues remain obvious.
- **D-09:** Review screens should prefer actionable copy that points to the page, zone, or field to fix, not only low-level validation messages.

### Constrained editing and risky fields
- **D-10:** Block editing in this phase should be constrained to approved block props and zone placement only; app-owned metadata and reserved head concerns remain outside block editing.
- **D-11:** Risky fields should be handled with explicit guardrails and operator-facing explanations rather than silent mutation or hidden failures.
- **D-12:** Any UI that edits block content should surface why a field is read-only when it is reserved by project/page contracts.

### the agent's Discretion
- Exact UI composition, layout density, and component hierarchy for workflow stages.
- Whether grouped diagnostics are rendered as tabs, accordions, stacked panels, or status cards.
- Persistence details for local review state, as long as they remain inside existing publisher storage patterns.

</decisions>

<specifics>
## Specific Ideas

- Keep the operator in one coherent review workspace instead of bouncing between unrelated tabs or raw files.
- Reuse the current source preview, release workspace, and structure/workbench patterns before introducing new abstractions.
- Make the “next action” obvious at each stage: resolve intake ambiguity, repair metadata, fix contract issues, or verify release readiness.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` — Phase 2 goal, plan slots, and success criteria.
- `.planning/REQUIREMENTS.md` — Phase 2 requirement IDs (`INTK-01..04`, `OPER-01..03`) and cross-phase constraints.
- `.planning/PROJECT.md` — Core value, isolation constraint for Publisher Mode, and operator-first principles.
- `.planning/STATE.md` — Current project position after Phase 1 completion.
- `.planning/phases/01-contract-safety-and-registry-v2/01-VERIFICATION.md` — The contract and ownership boundaries that Phase 2 UI must respect.

### Existing publisher workflow surfaces
- `app/components/workbench/StructureView.tsx` — Current publisher entrypoint and workflow orchestration inside the workbench.
- `app/components/publisher/PublisherIntakeWorkspace.tsx` — Intake/review/release container surface already in use.
- `app/components/publisher/PublisherIntakeReviewWorkspace.tsx` — Current metadata repair and source review UX.
- `app/components/publisher/PublisherReleaseWorkspace.tsx` — Existing release readiness and build history surface.
- `app/lib/publisher/status.ts` — Current status derivation logic that Phase 2 should clarify, not replace.

### Diagnostics and contract boundaries
- `app/lib/publisher/checker.ts` — Current working/release diagnostics model and operator-facing messages.
- `app/lib/publisher/contracts.ts` — Contract guardrails, reserved metadata ownership, and effective zone logic from Phase 1.
- `app/lib/publisher/intake-ui.ts` — Draft creation and diagnostics categorization used by review UI.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `StructureView`: already coordinates publisher state, intake session handling, checks, and status derivation.
- `PublisherIntakeWorkspace`: already contains a staged publisher-specific container with intake review and release workspace hooks.
- `PublisherIntakeReviewWorkspace`: already supports metadata repair, source preview, and page-scoped checks.
- `PublisherReleaseWorkspace`: already exposes release readiness and build history concepts that Phase 2 can strengthen.
- Workbench diff/editor infrastructure: existing diff and editor surfaces can likely support source/contract/output comparison without new infrastructure.

### Established Patterns
- Publisher logic stays isolated under `app/lib/publisher/*` and `app/components/publisher/*`.
- `derivePublisherProjectStatus()` already centralizes readiness derivation; Phase 2 should build on that instead of scattering status logic across components.
- Diagnostics are already split into `working` and `release` concerns; the missing piece is operator presentation and workflow clarity.

### Integration Points
- UI changes will likely center on `StructureView` plus publisher workspace components rather than global routing.
- Any review-stage persistence should integrate with existing publisher persistence/session helpers instead of adding a new store model.
- Constrained block editing will need to connect contract-safe UI controls to existing page/slot data rather than bypassing Phase 1 guardrails.

</code_context>

<deferred>
## Deferred Ideas

- Batch inbox/queue management belongs to Phase 6.
- New publish backends or external site runtimes remain out of scope until later phases.
- Artifact provenance expansion and deterministic asset handling belong to Phase 3.
- Full release pipeline separation and broader release gates belong to Phase 4.

</deferred>

---

*Phase: 02-operator-review-workflow*
*Context gathered: 2026-03-30*
