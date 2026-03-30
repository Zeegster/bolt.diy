# Requirements: bolt.diy Publisher Factory

**Defined:** 2026-03-30
**Core Value:** One operator must be able to move a site from source intake to release-ready output through a deterministic pipeline with minimal ambiguity and no manual `head` or runtime assembly work.

## v1 Requirements

### Existing Platform

- [x] **PLAT-01**: `Publisher Mode` remains isolated from the default bolt coding workflow and does not break the main chat/workbench experience.
- [x] **PLAT-02**: Publisher state, files, prompts, and build artifacts stay inside reserved publisher paths and contracts.

### Intake and Source Normalization

- [ ] **INTK-01**: Operator can import document-only source packs and template-plus-documents source packs.
- [x] **INTK-02**: Intake identifies ambiguity in family/template/home-page selection and surfaces it as an explicit review step.
- [x] **INTK-03**: Source metadata and extracted content can be corrected inline without losing source-of-truth visibility.
- [ ] **INTK-04**: Intake sessions, source manifests, and operator edits are persisted and recoverable.

### Contracts and Block System

- [x] **CONT-01**: Project, theme, page, reference, and checks contracts remain machine-parseable and deterministic.
- [x] **CONT-02**: Every page enforces required zones `header`, `content`, and `footer`.
- [x] **CONT-03**: Block registry supports schema versioning, allowed zones, prop schemas, and deprecation metadata without breaking legacy manifests.
- [x] **CONT-04**: Invalid block-to-zone placements and missing required props are prevented or surfaced before build.
- [x] **CONT-05**: Page metadata fields are owned by contracts and cannot be overridden by blocks.

### Metadata and Runtime Ownership

- [x] **META-01**: The application generates and owns `<head>`, canonical URLs, robots, sitemap, schema JSON-LD, favicon/meta image tags, and language defaults.
- [x] **META-02**: `title`, `description`, and `h1` come only from intake documents and approved contract edits.
- [ ] **META-03**: Generated output includes deterministic metadata, provenance, and stable artifact fingerprints.

### Build and Assets

- [ ] **BUILD-01**: Output is assembled only from approved contracts through a one-way generation path.
- [ ] **BUILD-02**: Generated files use normalized public paths and stable file mapping.
- [ ] **BUILD-03**: Asset ingestion normalizes names, hashes duplicates, and captures dimensions needed for rendering and image policy checks.
- [x] **BUILD-04**: Build pipeline supports a distinct optimize/check stage after assembly.

### Operator Workflow

- [x] **OPER-01**: UI exposes a clear project status machine: `draft -> intake-review -> contract-ready -> release-ready -> published -> failed`.
- [x] **OPER-02**: Operator can see grouped `working` and `release` diagnostics with severity and actionable detail.
- [x] **OPER-03**: Operator can inspect the relationship between source, contracts, and generated output during review.
- [x] **OPER-04**: Operator can access build history, generated entry points, and release readiness in one workflow.

### Agent Layer

- [ ] **AGNT-01**: Agents work only on approved publisher files and contracts.
- [ ] **AGNT-02**: Agents are limited to `normalize`, `map`, `fill`, and `repair` actions.
- [ ] **AGNT-03**: Agents cannot create new block types, new zones, or freeform SEO/runtime output unless explicitly requested.
- [ ] **AGNT-04**: Agent prompts and context clearly communicate reserved ownership boundaries and failure-repair loops.

### Validation and Release Gates

- [x] **VAL-01**: Working checks support day-to-day operator review without blocking draft iteration.
- [x] **VAL-02**: Release checks block publish when metadata completeness, canonical URLs, robots/sitemap consistency, internal links, or asset policy fail.
- [x] **VAL-03**: Typecheck, tests, and CI linting are part of the standard release discipline.
- [x] **VAL-04**: Publisher flows have integration tests covering intake, contracts, assembly, and release checks.

### Publish and History

- [x] **PUB-01**: Export/publish flow has a documented artifact contract, deploy entrypoints, and build metadata format.
- [x] **PUB-02**: Publish history records enough provenance to inspect what source and contract state produced an artifact.
- [x] **PUB-03**: System can support rollback-friendly artifact retention or reproducible rebuilds.

## v2 Requirements

### Batch Operations

- **BATCH-01**: Operator can manage many sites from an intake queue/inbox with readiness, ambiguity, and stuck-state visibility.
- **BATCH-02**: System reports throughput metrics and failure buckets to support `10-20` sites/day operations.
- **BATCH-03**: Queue and release workflow are ready for later server-backed orchestration without replacing the internal assembler.

### Enhanced Quality

- **QUAL-01**: Release flow enforces Lighthouse thresholds for preview/exported output.
- **QUAL-02**: Asset pipeline can generate responsive variants and smarter hero/LCP strategies when needed.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Freeform agent-generated final HTML structure | Conflicts with deterministic contracts and makes validation fragile |
| Agent-authored `head`/SEO/runtime logic | High-risk duplication of app-owned behavior |
| Immediate migration to Astro/Eleventy/external builder | Adds unnecessary system churn before current runtime is fully hardened |
| Multi-operator backend orchestration in the first stable milestone | Single-operator production line must be proven first |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PLAT-01 | Phase 1 | Complete |
| PLAT-02 | Phase 1 | Complete |
| INTK-01 | Phase 2 | Pending |
| INTK-02 | Phase 2 | Complete |
| INTK-03 | Phase 2 | Complete |
| INTK-04 | Phase 2 | Pending |
| CONT-01 | Phase 1 | Complete |
| CONT-02 | Phase 1 | Complete |
| CONT-03 | Phase 1 | Complete |
| CONT-04 | Phase 1 | Complete |
| CONT-05 | Phase 1 | Complete |
| META-01 | Phase 1 | Complete |
| META-02 | Phase 1 | Complete |
| META-03 | Phase 3 | Pending |
| BUILD-01 | Phase 3 | Pending |
| BUILD-02 | Phase 3 | Pending |
| BUILD-03 | Phase 3 | Pending |
| BUILD-04 | Phase 4 | Complete |
| OPER-01 | Phase 2 | Complete |
| OPER-02 | Phase 2 | Complete |
| OPER-03 | Phase 2 | Complete |
| OPER-04 | Phase 4 | Complete |
| AGNT-01 | Phase 5 | Pending |
| AGNT-02 | Phase 5 | Pending |
| AGNT-03 | Phase 5 | Pending |
| AGNT-04 | Phase 5 | Pending |
| VAL-01 | Phase 4 | Complete |
| VAL-02 | Phase 4 | Complete |
| VAL-03 | Phase 4 | Complete |
| VAL-04 | Phase 4 | Complete |
| PUB-01 | Phase 4 | Complete |
| PUB-02 | Phase 4 | Complete |
| PUB-03 | Phase 4 | Complete |
| BATCH-01 | Phase 6 | Pending |
| BATCH-02 | Phase 6 | Pending |
| BATCH-03 | Phase 6 | Pending |
| QUAL-01 | Phase 6 | Pending |
| QUAL-02 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 31 total
- Mapped to phases: 31
- Unmapped: 0

---
*Requirements defined: 2026-03-30*
*Last updated: 2026-03-30 after Phase 1 completion*
