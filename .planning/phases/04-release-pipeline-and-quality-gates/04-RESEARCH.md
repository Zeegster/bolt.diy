# Phase 4: Release Pipeline and Quality Gates - Research

**Researched:** 2026-03-30
**Domain:** Publisher release pipeline staging, release diagnostics, publish contract boundaries, CI coverage
**Confidence:** HIGH

<user_constraints>
## User Constraints

Use the existing project and roadmap decisions as locked constraints for this phase:

### Locked Decisions
- Stay inside the current publisher runtime and contract model.
- Keep `Publisher Mode` isolated from the default bolt workflow.
- Preserve deterministic generated output and compatibility with the current operator review surfaces.
- Requirements in scope are fixed: `BUILD-04`, `OPER-04`, `VAL-01`, `VAL-02`, `VAL-03`, `VAL-04`, `PUB-01`, `PUB-02`, `PUB-03`.

### the agent's Discretion
- Exact contract shape for staged build jobs and publish/export metadata.
- Whether stage separation is represented primarily in build summaries, pipeline jobs, generated artifacts, or all three.
- How far to push release checks in this phase versus later Lighthouse-oriented quality work.

### Deferred Ideas
- Server-backed publish orchestration.
- Multi-operator queueing and inbox work.
- Heavy optimization features such as responsive image generation or Lighthouse enforcement thresholds.
</user_constraints>

<research_summary>
## Summary

The repository already has most of the raw pieces needed for Phase 4, but they are still loosely coupled:

- [`app/lib/publisher/assembler.ts`](/Users/razrabotcik/Documents/Projects/bolt.diy/app/lib/publisher/assembler.ts) generates deterministic output, provenance, `robots.txt`, `sitemap.xml`, `checks.json`, and build summaries.
- [`app/lib/publisher/checker.ts`](/Users/razrabotcik/Documents/Projects/bolt.diy/app/lib/publisher/checker.ts) already distinguishes `working` and `release` gates, including canonical, metadata, link, and asset policy checks.
- [`app/lib/publisher/status.ts`](/Users/razrabotcik/Documents/Projects/bolt.diy/app/lib/publisher/status.ts) derives operator workflow state from checks and latest build data.
- [`app/components/publisher/PublisherReleaseWorkspace.tsx`](/Users/razrabotcik/Documents/Projects/bolt.diy/app/components/publisher/PublisherReleaseWorkspace.tsx) already exposes build history and generated file entry points.
- [`app/types/publisher.ts`](/Users/razrabotcik/Documents/Projects/bolt.diy/app/types/publisher.ts) already includes `PublisherJobStage`, `PublisherPipelineResult`, `PublisherPublishContract`, and `PublisherBuildSummary`.

The main gap is that the release pipeline is conceptually present but not yet formalized as a first-class staged contract. Today the assembler is still the place where assemble/check/export concerns meet, publish metadata is in-memory only, and CI does not specifically prove release-path behavior beyond generic typecheck/lint/test.

**Primary recommendation:** use Phase 4 to convert the current release behavior into an explicit staged pipeline contract, then widen release checks and test coverage around that contract instead of adding more ad hoc checks directly to the UI.
</research_summary>

<current_architecture>
## Current Architecture

### Build and artifact generation
- [`app/lib/publisher/assembler.ts`](/Users/razrabotcik/Documents/Projects/bolt.diy/app/lib/publisher/assembler.ts) is the current center of gravity for generated output.
- It already writes stable artifacts and fingerprints them for `PublisherBuildSummary`.
- It already imports `runPublisherChecks`, so assembly and validation are still coupled inside one orchestration path.

### Validation and diagnostics
- [`app/lib/publisher/checker.ts`](/Users/razrabotcik/Documents/Projects/bolt.diy/app/lib/publisher/checker.ts) has a solid base:
  - `working` versus `release` gate distinction
  - broken internal link checks
  - metadata completeness and canonical checks
  - asset convention warnings
  - sitemap emptiness checks
- The missing piece is not “more validation exists nowhere”; it is “validation is not yet represented as an explicit pipeline stage with publish-blocking semantics and operator-facing stage history.”

### Operator workflow
- [`app/lib/publisher/status.ts`](/Users/razrabotcik/Documents/Projects/bolt.diy/app/lib/publisher/status.ts) derives `draft`, `intake-review`, `contract-ready`, `release-ready`, `published`, and `failed`.
- [`app/components/publisher/PublisherReleaseWorkspace.tsx`](/Users/razrabotcik/Documents/Projects/bolt.diy/app/components/publisher/PublisherReleaseWorkspace.tsx) shows readiness and build history, but it does not yet present a full staged release contract such as assemble -> optimize -> check -> publish with per-stage outcomes.

### Persistence and history
- [`app/lib/publisher/persistence.ts`](/Users/razrabotcik/Documents/Projects/bolt.diy/app/lib/publisher/persistence.ts) stores normalized build history in localStorage and already sorts artifacts.
- Current persisted history is adequate for UI inspection, but not yet rich enough to serve as a rollback-friendly publish ledger.

### CI coverage
- [`.github/workflows/ci.yaml`](/Users/razrabotcik/Documents/Projects/bolt.diy/.github/workflows/ci.yaml) runs typecheck, lint, and the full test suite.
- That is valuable baseline discipline, but it does not encode publisher-release-specific verification or a narrower signal for future release-gate regressions.
</current_architecture>

<gaps>
## Gaps Against Phase Requirements

### BUILD-04
- `PublisherJobStage` already includes `assemble`, `optimize`, and `check`, but the live pipeline does not yet surface these as explicit executed stages with diagnostics and history.
- The current orchestration still feels like “assemble and include checks” rather than “run stage N, persist stage result, then continue or block.”

### OPER-04
- Release workspace shows generated artifacts and latest build counts, but not the full release workflow in one authoritative contract.
- Operator can inspect outputs, but publish/export boundaries and latest stage results are not yet explicit enough for confident release handling.

### VAL-01 / VAL-02
- Working and release gates exist, which is good foundation.
- Missing coverage areas are broader release-policy checks around sitemap/robots/schema/export readiness and a stronger link between release failures and publish blockers.

### VAL-03 / VAL-04
- Generic CI exists, but there is no phase-specific plan yet for publisher release integration coverage.
- Existing tests are centered on happy-path publisher behavior; they need explicit staging and gate assertions.

### PUB-01 / PUB-02 / PUB-03
- `PublisherPublishContract` and `PublisherPipelineResult` types exist, but they are not yet formalized into a generated artifact contract and operator workflow boundary.
- Rollback strategy is hinted as `rebuild`, but retention/reproducibility semantics are not yet enforced through produced artifacts or history structure.
</gaps>

<recommended_approach>
## Recommended Implementation Approach

### 04-01: Make the pipeline stages real
- Split the current release orchestration into explicit assemble -> optimize -> check -> publish/export stages.
- Persist stage outcomes in `PublisherBuildSummary` / `PublisherPipelineResult`.
- Surface stage-specific diagnostics so operator UX and build history describe where the pipeline failed, not just that checks failed somewhere.

### 04-02: Expand release gate coverage
- Keep `checker.ts` as the canonical validation engine.
- Extend it with stricter release-only checks for:
  - internal links
  - managed asset policies
  - `robots.txt` / `sitemap.xml` / schema consistency
  - publish blockers derived from release failures
- Avoid duplicating logic in the UI; the workspace should only render richer stage/check results.

### 04-03: Formalize publish/export contract and rebuild strategy
- Emit a stable generated contract artifact for publish/export metadata, not just runtime memory.
- Make artifact shape, source fingerprinting, and rollback/rebuild semantics explicit.
- Keep rollback strategy simple and deterministic: rebuild from locked source/contracts plus retained manifests, not mutable deploy state.

### 04-04: Lock release behavior into tests and CI
- Add focused integration tests around staged build behavior and release blocking semantics.
- Keep generic CI intact, but add publisher-specific coverage or workflow steps so regressions in the release path are visible quickly.
- Prepare seams for future Lighthouse gating without making Lighthouse itself a hard dependency in this phase.
</recommended_approach>

<risks>
## Risks and Migration Notes

### Main risks
1. **Overloading assembler further**
   - If stage separation is only represented as more branches inside `assembler.ts`, the phase will increase coupling instead of reducing it.
   - Mitigation: introduce explicit pipeline result structures and helper boundaries rather than one longer assembly function.

2. **UI-driven contract drift**
   - If publish blockers are computed in UI copy instead of in the canonical check/pipeline layer, the workflow will eventually diverge.
   - Mitigation: make pipeline and publish contract artifacts the source of truth, then render them.

3. **Check sprawl**
   - Adding many one-off release checks without grouping or stage ownership will create noise and make failures hard to reason about.
   - Mitigation: tie each new rule to `check` or `publish` semantics and ensure diagnostics explain which stage owns remediation.

4. **CI noise without intent**
   - Broadening tests without a publisher-specific target can slow the suite without improving release confidence.
   - Mitigation: add focused publisher release tests and route them through existing `pnpm` scripts or small CI augmentations.

### Migration strategy
- Keep Phase 4 additive and compatibility-friendly.
- Preserve current build history and UI entry points while enriching summary/pipeline contracts.
- Reuse existing generated files and add new artifacts only where they clarify publish boundaries.
</risks>

<test_strategy>
## Test Strategy

### Required automated coverage
- Extend [`app/lib/publisher/publisher.spec.ts`](/Users/razrabotcik/Documents/Projects/bolt.diy/app/lib/publisher/publisher.spec.ts) with staged pipeline and publish blocker assertions.
- Extend [`app/lib/publisher/ui-state.spec.ts`](/Users/razrabotcik/Documents/Projects/bolt.diy/app/lib/publisher/ui-state.spec.ts) or add adjacent tests if workflow/status derivation changes.
- Verify any new publish contract or generated artifact shape through regression tests rather than manual inspection only.

### Verification commands
- `pnpm vitest app/lib/publisher/publisher.spec.ts --run`
- `pnpm vitest app/lib/publisher/ui-state.spec.ts --run`
- `pnpm exec tsc --noEmit`
- `pnpm run lint`

### Manual review points
- Confirm the release workspace explains which stage failed and why.
- Confirm publish is blocked by canonical release/publish contract data, not UI heuristics.
- Confirm build history remains readable for operators and deterministic across repeated builds.
</test_strategy>

<canonical_refs>
## Canonical References

### Pipeline and contracts
- [`app/types/publisher.ts`](/Users/razrabotcik/Documents/Projects/bolt.diy/app/types/publisher.ts) - canonical types for stages, pipeline result, publish contract, build summaries
- [`app/lib/publisher/assembler.ts`](/Users/razrabotcik/Documents/Projects/bolt.diy/app/lib/publisher/assembler.ts) - current orchestration and generated artifact production
- [`app/lib/publisher/constants.ts`](/Users/razrabotcik/Documents/Projects/bolt.diy/app/lib/publisher/constants.ts) - reserved publisher output paths

### Validation and status
- [`app/lib/publisher/checker.ts`](/Users/razrabotcik/Documents/Projects/bolt.diy/app/lib/publisher/checker.ts) - working/release gate logic and diagnostics
- [`app/lib/publisher/status.ts`](/Users/razrabotcik/Documents/Projects/bolt.diy/app/lib/publisher/status.ts) - operator workflow derivation
- [`app/lib/publisher/persistence.ts`](/Users/razrabotcik/Documents/Projects/bolt.diy/app/lib/publisher/persistence.ts) - build history persistence boundary

### Operator surfaces
- [`app/components/publisher/PublisherReleaseWorkspace.tsx`](/Users/razrabotcik/Documents/Projects/bolt.diy/app/components/publisher/PublisherReleaseWorkspace.tsx) - release-facing UI for checks and artifacts
- [`app/components/publisher/PublisherIntakeWorkspace.tsx`](/Users/razrabotcik/Documents/Projects/bolt.diy/app/components/publisher/PublisherIntakeWorkspace.tsx) - workflow/status handoff context

### CI and test coverage
- [`app/lib/publisher/publisher.spec.ts`](/Users/razrabotcik/Documents/Projects/bolt.diy/app/lib/publisher/publisher.spec.ts) - integration coverage anchor
- [`app/lib/publisher/ui-state.spec.ts`](/Users/razrabotcik/Documents/Projects/bolt.diy/app/lib/publisher/ui-state.spec.ts) - workflow/UI state assertions
- [`.github/workflows/ci.yaml`](/Users/razrabotcik/Documents/Projects/bolt.diy/.github/workflows/ci.yaml) - current CI baseline
</canonical_refs>

<open_questions>
## Open Questions

1. Should `publish` be a distinct runtime stage, or should Phase 4 stop at a formalized export contract with publish-ready semantics?
   - Recommendation: make the contract explicit now, and keep actual remote deployment optional behind that contract.

2. Should optimization be a no-op stage at first if there are no heavy transforms yet?
   - Recommendation: yes. A lightweight explicit optimize stage is still valuable because it prevents future pipeline coupling.

3. How much rollback should be implemented now?
   - Recommendation: stay with deterministic rebuild plus retained manifests/build history instead of introducing snapshot deployment complexity.
</open_questions>

---

*Phase: 04-release-pipeline-and-quality-gates*
*Research completed: 2026-03-30*
*Ready for planning: yes*
