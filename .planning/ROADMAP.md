# Roadmap: bolt.diy Publisher Factory

## Overview

The codebase already contains a real publisher foundation inside a larger AI workbench. The roadmap below turns that foundation into a deterministic production line: first tighten contracts and guardrails, then make operator review and release reliable, then harden assets/runtime/validation, and only after that add batch-level throughput features.

## Phases

- [x] **Phase 1: Contract Safety and Registry v2** - Finish the rules that make publisher output predictable before more workflow surface is added. Completed 2026-03-30.
- [x] **Phase 2: Operator Review Workflow** - Turn the current review workbench into an explicit intake/review/release operator flow. Completed 2026-03-30.
- [ ] **Phase 3: Deterministic Assets and Provenance** - Make asset handling and generated outputs stable enough for release operations.
- [ ] **Phase 4: Release Pipeline and Quality Gates** - Separate assemble/optimize/check/publish and enforce release-grade verification.
- [ ] **Phase 5: Agent Operating Model** - Lock down how agents interact with publisher files, blocks, contracts, and repair loops.
- [ ] **Phase 6: Batch Readiness** - Add queue/inbox, throughput visibility, and server-ready seams after the single-operator workflow is stable.

## Phase Details

### Phase 1: Contract Safety and Registry v2
**Goal**: Publisher contracts and block rules become strict enough that invalid site compositions are caught early and metadata ownership is explicit.
**Depends on**: Nothing (first phase)
**Requirements**: [PLAT-01, PLAT-02, CONT-01, CONT-02, CONT-03, CONT-04, CONT-05, META-01, META-02]
**Success Criteria** (what must be TRUE):
  1. Publisher contracts define required zones and reject incompatible block placements before build.
  2. Registry metadata supports versioning, allowed zones, prop schema expectations, and deprecation signals without breaking existing blocks.
  3. Page metadata ownership is enforced so blocks and agents cannot override app-owned `head` concerns.
**Plans**: 3 plans

Plans:
- [x] 01-01: Audit current contract/registry implementation and land registry v2 compatibility model.
- [x] 01-02: Add authoring/save/build guardrails for zones, required props, and forbidden metadata overrides.
- [x] 01-03: Align publisher prompts, docs, and diagnostics with the enforced ownership model.

### Phase 2: Operator Review Workflow
**Goal**: Operator gets a clean production workflow for intake review, metadata repair, block review, and release readiness.
**Depends on**: Phase 1
**Requirements**: [INTK-01, INTK-02, INTK-03, INTK-04, OPER-01, OPER-02, OPER-03]
**Success Criteria** (what must be TRUE):
  1. Intake, review, and release stages are visible as explicit workflow states in the UI.
  2. Operator can resolve ambiguity, repair source metadata, and understand current readiness without reading raw implementation files.
  3. Source, contracts, and generated output can be compared through purpose-built review surfaces.
**Plans**: 4 plans

Plans:
- [x] 02-01: Stabilize intake state machine and visible stage/status indicators across publisher UI.
- [x] 02-02: Build source-of-truth editing surfaces for markdown/source metadata and extracted content repair.
- [x] 02-03: Add source -> contract -> output diff surfaces and grouped diagnostics by severity.
- [x] 02-04: Finish constrained block editing UX for risky fields and invalid composition prevention.

### Phase 3: Deterministic Assets and Provenance
**Goal**: Generated site assets and build outputs become traceable, normalized, and safe for repeated production use.
**Depends on**: Phase 2
**Requirements**: [META-03, BUILD-01, BUILD-02, BUILD-03]
**Success Criteria** (what must be TRUE):
  1. Asset ingestion normalizes naming, deduplicates by hash, and captures width/height metadata where needed.
  2. Generated files have stable public paths, deterministic manifests, and build provenance.
  3. Operator can inspect which inputs and contract state produced the current artifact set.
**Plans**: 3 plans

Plans:
- [ ] 03-01: Implement asset ingestion helpers, hashing, path normalization, and image metadata capture.
- [ ] 03-02: Extend assembler/build outputs with deterministic manifest and provenance records.
- [ ] 03-03: Surface artifact and build-history data in release-facing UI.

### Phase 4: Release Pipeline and Quality Gates
**Goal**: Publisher flow becomes a proper release pipeline with optimization, validation, and publish contract boundaries.
**Depends on**: Phase 3
**Requirements**: [BUILD-04, OPER-04, VAL-01, VAL-02, VAL-03, VAL-04, PUB-01, PUB-02, PUB-03]
**Success Criteria** (what must be TRUE):
  1. Assemble, optimize, check, and publish are explicit stages with diagnostics and failure handling.
  2. Release checks block publish when critical metadata, links, asset, or runtime issues exist.
  3. CI and test coverage meaningfully exercise publisher release behavior instead of only local happy paths.
**Plans**: 4 plans

Plans:
- [ ] 04-01: Separate assemble -> optimize -> check -> publish stages in code and diagnostics.
- [ ] 04-02: Expand release checks for links, assets, sitemap/robots/schema, and publish blockers.
- [ ] 04-03: Formalize export/publish contract, artifact shape, and rollback or rebuild strategy.
- [ ] 04-04: Expand integration/tests/CI coverage for release behavior and future Lighthouse gating.

### Phase 5: Agent Operating Model
**Goal**: Agent behavior in publisher mode becomes explicit, constrained, and repair-oriented instead of generative-by-default.
**Depends on**: Phase 4
**Requirements**: [AGNT-01, AGNT-02, AGNT-03, AGNT-04]
**Success Criteria** (what must be TRUE):
  1. Agent prompts, docs, and runtime checks encode reserved ownership and forbidden outputs.
  2. Agent actions map cleanly to normalize/map/fill/repair workflows.
  3. Diagnostics from release gates can be fed back into the repair loop without widening scope.
**Plans**: 3 plans

Plans:
- [ ] 05-01: Audit and tighten prompt context plus reserved publisher file boundaries.
- [ ] 05-02: Document and implement agent action contracts for normalize/map/fill/repair.
- [ ] 05-03: Connect gate diagnostics to repair workflows and operator confirmation steps.

### Phase 6: Batch Readiness
**Goal**: After the single-operator pipeline is stable, the system gains queue, metrics, and orchestration seams needed for `10-20` sites/day.
**Depends on**: Phase 5
**Requirements**: [BATCH-01, BATCH-02, BATCH-03, QUAL-01, QUAL-02]
**Success Criteria** (what must be TRUE):
  1. Operator can manage many sites from a queue/inbox with clear readiness and failure visibility.
  2. The system reports throughput and failure categories useful for production tuning.
  3. Interfaces exist for later server-backed orchestration without replacing the internal assembler.
**Plans**: 3 plans

Plans:
- [ ] 06-01: Build intake queue/inbox model with readiness, ambiguity, and stuck-state signals.
- [ ] 06-02: Add throughput, failure-bucket, and operator-efficiency metrics.
- [ ] 06-03: Prepare server-ready orchestration seams and optional Lighthouse-based release enhancements.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Contract Safety and Registry v2 | 3/3 | Complete | 2026-03-30 |
| 2. Operator Review Workflow | 4/4 | Complete | 2026-03-30 |
| 3. Deterministic Assets and Provenance | 0/3 | Not started | - |
| 4. Release Pipeline and Quality Gates | 0/4 | Not started | - |
| 5. Agent Operating Model | 0/3 | Not started | - |
| 6. Batch Readiness | 0/3 | Not started | - |
