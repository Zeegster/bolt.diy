# Roadmap: bolt.diy Publisher Factory

## Overview

Milestone `v1.1` focuses on the gap between the current publisher foundation and a truly production-safe fast-sites intake flow. The goal is not broader throughput yet; the goal is proving that one site can move from imperfect source pack to clean release-ready static output under the shared content, heading, zone, and deployment rules. Once that contract is stable, throughput and orchestration work will land on top of a safer base.

## Phases

- [x] **Phase 7: Complete Manual Intake Flow** - Turn the existing intake pieces into one operator-complete flow with explicit blockers, fixes, and completion semantics.
- [x] **Phase 8: Enforce Content and Heading Integrity** - Remove remaining template/pipeline behaviors that inject meaning or headings outside the source-of-truth document contract.
- [x] **Phase 9: Align Static-Site Project Contract** - Make generated artifacts and project structure match the shared fast-sites rules for links, metadata consistency, tables/media, and static deploy shape.
- [x] **Phase 10: Rules Diagnostics and End-to-End Validation** - Add operator-facing diagnostics and release checks that prove the full manual intake flow under the new rules.

## Phase Details

### Phase 7: Complete Manual Intake Flow
**Goal**: Turn current intake primitives into a first-class workflow that can carry one real site from imported source pack to contract-complete review state.
**Depends on**: Phase 6
**Requirements**: [INTK-05, INTK-06, INTK-07]
**Success Criteria** (what must be TRUE):
  1. Operator can import a supported source pack and drive it through explicit intake states until all blockers are either resolved or clearly surfaced.
  2. Unsupported, partial, or ambiguous source structures are visible as concrete review tasks instead of hidden degradation.
  3. The resulting project state is sufficient to hand off into contract/release review without raw file surgery.
**Plans**: 3 plans

Plans:
- [x] 07-01: Audit current manual intake path and define canonical completion/blocker states for one-site intake.
- [x] 07-02: Wire missing operator actions and persisted review state needed to finish intake without raw runtime edits.
- [x] 07-03: Prove the manual intake flow on representative source-pack fixtures and close the most dangerous gaps.

### Phase 8: Enforce Content and Heading Integrity
**Goal**: Guarantee that publisher output preserves source meaning and heading hierarchy instead of letting templates or normalizers invent semantic structure.
**Depends on**: Phase 7
**Requirements**: [CONT-06, CONT-07, CONT-08]
**Success Criteria** (what must be TRUE):
  1. Approved source content remains the only origin of page headings and primary semantic text unless the operator edits approved source-of-truth fields.
  2. Templates and pipeline transforms cannot silently inject extra `h1`/`h2`/`h3` or content-bearing sections.
  3. Decorative zones are enforced as decorative/supporting surfaces and do not steal core page meaning from `content`.
**Plans**: 3 plans

Plans:
- [x] 08-01: Audit and fix template-layer heading/content violations against fast-sites rules.
- [x] 08-02: Add pipeline and contract guards that reject semantic drift introduced after intake.
- [x] 08-03: Cover heading/content preservation with fixtures and diagnostics.

### Phase 9: Align Static-Site Project Contract
**Goal**: Make Bolt publisher output conform to the shared fast-sites project contract for deployable static bundles.
**Depends on**: Phase 8
**Requirements**: [STAT-01, STAT-02, STAT-03]
**Success Criteria** (what must be TRUE):
  1. Generated site shell, internal linking policies by zone, and technical output shape follow the shared static-sites rules.
  2. Public URLs, internal links, canonical data, sitemap data, and technical files stay consistent for the chosen URL mode.
  3. Tables, figures, and media are rendered through stable wrappers and attributes that preserve mobile readability and layout stability.
**Plans**: 3 plans

Plans:
- [x] 09-01-PLAN.md — Define and enforce the static output + zone-link policy contract.
- [x] 09-02-PLAN.md — Harden URL/metadata consistency and technical file alignment.
- [x] 09-03-PLAN.md — Enforce table/media wrapper invariants for stable mobile output.

### Phase 10: Rules Diagnostics and End-to-End Validation
**Goal**: Expose fast-sites rule failures clearly to the operator and prove the updated flow with end-to-end validation.
**Depends on**: Phase 9
**Requirements**: [OPER-05, OPER-06, OPER-07, VAL-05, VAL-06]
**Success Criteria** (what must be TRUE):
  1. Operator can see whether an issue comes from source input, template choice, or runtime generation, and has constrained repair paths for each.
  2. Release readiness checks fail on fast-sites rule violations with actionable diagnostics.
  3. At least one representative end-to-end intake fixture proves the new flow from source pack to release-ready output.
**Plans**: 4 plans

Plans:
- [x] 10-01-PLAN.md — Add fast-sites diagnostics taxonomy and source/template/runtime attribution in operator review surfaces.
- [x] 10-02-PLAN.md — Connect constrained repair actions to diagnostics without widening agent scope.
- [x] 10-03-PLAN.md — Expand release gates for fast-sites invariants with actionable rule diagnostics.
- [x] 10-04-PLAN.md — Land end-to-end canonical/broken fixture coverage for complete manual intake flow.

## Progress

**Execution Order:**
Phases execute in numeric order: 7 -> 8 -> 9 -> 10

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 7. Complete Manual Intake Flow | 3/3 | Complete | 2026-03-31 |
| 8. Enforce Content and Heading Integrity | 3/3 | Complete | 2026-03-31 |
| 9. Align Static-Site Project Contract | 3/3 | Complete | 2026-03-31 |
| 10. Rules Diagnostics and End-to-End Validation | 4/4 | Complete   | 2026-03-31 |
