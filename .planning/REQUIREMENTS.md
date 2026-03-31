# Requirements: bolt.diy Publisher Factory

**Defined:** 2026-03-31
**Core Value:** One operator must be able to move a site from source intake to release-ready output through a deterministic pipeline with minimal ambiguity and no manual `head` or runtime assembly work.

## v1 Requirements

### Manual Intake Completion

- [x] **INTK-05**: Operator can complete one full manual intake flow from imported source pack to release-ready project state without editing raw runtime output files.
- [x] **INTK-06**: Intake review explicitly tracks unresolved source gaps, operator fixes, and completion blockers until the project reaches a contract-complete state.
- [x] **INTK-07**: Intake supports the canonical fast-sites source shapes needed for current delivery work and makes unsupported or partial packs explicit instead of silently degrading.

### Content and Heading Integrity

- [x] **CONT-06**: Publisher pipeline preserves original textual content and heading hierarchy from intake documents unless the operator explicitly edits the approved source-of-truth fields.
- [x] **CONT-07**: Templates, normalizers, and generated blocks do not introduce semantic headings or primary content that are absent from the approved source documents.
- [x] **CONT-08**: Decorative zones remain decorative and cannot absorb core page meaning that belongs to the main content zone.

### Static-Site Rules Alignment

- [x] **STAT-01**: Generated project output follows the shared static-sites contract for page shell, internal linking policies by zone, and clean deployable static bundle structure.
- [x] **STAT-02**: Output metadata, URLs, canonical behavior, sitemap data, and technical files remain mutually consistent for the chosen public URL mode.
- [x] **STAT-03**: Tables and media are emitted through stable wrappers and attributes that satisfy mobile readability and layout-stability rules.

### Operator Review and Repair

- [ ] **OPER-05**: Operator UI exposes purpose-built diagnostics for fast-sites rule violations, including heading drift, content injection, linking misuse, and unsupported source structure.
- [ ] **OPER-06**: Operator can resolve document/template/rules mismatches through constrained review actions instead of ad hoc freeform generation.
- [ ] **OPER-07**: Review surfaces make it obvious which issue came from source input, which came from template choice, and which came from generation/runtime layers.

### Validation and Readiness

- [ ] **VAL-05**: Release readiness checks fail when generated output violates fast-sites content, heading, link-zone, or static-bundle invariants.
- [ ] **VAL-06**: The project includes at least one representative end-to-end fixture proving a full manual intake flow under the new rules.

## v2 Requirements

### Throughput and Orchestration

- **BATCH-04**: System can distribute intake and repair work across multiple providers/accounts without changing publisher correctness rules.
- **BATCH-05**: Runtime orchestration supports worker-pool style execution and provider routing for `10-20` sites/day throughput.

### Advanced Quality and Variability

- **QUAL-03**: Release flow enforces Lighthouse thresholds for preview/exported output.
- **QUAL-04**: Asset pipeline can generate richer responsive media strategies and stronger anti-fingerprint variation policies.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Freeform agent-generated final HTML structure | Conflicts with deterministic contracts and makes validation fragile |
| Agent-authored `head`/SEO/runtime logic | High-risk duplication of app-owned behavior |
| Immediate migration to Astro/Eleventy/external builder | Adds unnecessary system churn before current runtime is fully hardened |
| Full multi-provider throughput work in this milestone | Intake correctness and rules alignment are higher leverage right now |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INTK-05 | Phase 7 | Complete |
| INTK-06 | Phase 7 | Complete |
| INTK-07 | Phase 7 | Complete |
| CONT-06 | Phase 8 | Complete |
| CONT-07 | Phase 8 | Complete |
| CONT-08 | Phase 8 | Complete |
| STAT-01 | Phase 9 | Complete |
| STAT-02 | Phase 9 | Complete |
| STAT-03 | Phase 9 | Complete |
| OPER-05 | Phase 10 | Pending |
| OPER-06 | Phase 10 | Pending |
| OPER-07 | Phase 10 | Pending |
| VAL-05 | Phase 10 | Pending |
| VAL-06 | Phase 10 | Pending |

**Coverage:**
- v1 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0

---
*Requirements defined: 2026-03-31*
*Last updated: 2026-03-31 after phase 09 verification*
