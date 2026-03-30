---
phase: 06
reviewers: [codex]
reviewed_at: 2026-03-30T15:44:46Z
plans_reviewed: ["06-01-PLAN.md", "06-02-PLAN.md", "06-03-PLAN.md"]
notes:
  - "claude CLI was detected but review invocation failed due account usage limit in current environment"
---

# Cross-AI Plan Review — Phase 06

## Codex Review

## Summary

The phase plans are generally coherent, incremental, and aligned with the stated goal of adding local-first batch readiness without replacing the existing publisher runtime. The sequence (queue derivation → metrics → orchestration seam) is logically sound and respects most constraints (staying in existing stack, deterministic model, avoiding second source of truth). However, there are notable gaps: `QUAL-01` enforcement is not clearly implemented in `06-02` (only surfaced), edge-case handling for derived state is under-specified, and the UI seam work in `06-03` risks coupling with existing workbench internals unless carefully constrained. Overall, plans are strong on structure but need tighter contracts, stronger failure semantics, and explicit non-regression guarantees.

---

## Strengths

- Clear decomposition by objective with explicit requirement-to-plan mapping (`BATCH-01`, `BATCH-02`, `BATCH-03`, `QUAL-01`, `QUAL-02`).
- Good adherence to minimality: `06-01` avoids introducing a new persisted queue source-of-truth and focuses on derivation.
- TDD-first framing is consistent (`verify` tasks and task-specific specs), improving determinism and long-term maintenance.
- `06-03` correctly introduces a typed orchestration contract instead of immediate infrastructure changes (good fit for future remoting).
- Verification includes type-checking and targeted unit tests, which is important for a brownfield app with many integration surfaces.

---

## Concerns

### 06-01 (BATCH-01)

- **[HIGH] Queue row derivation ambiguity for orphaned states**  
  The plan does not explicitly define behavior when intake session/project records are inconsistent (e.g., session exists without project, project exists without session, corrupted metadata). This can produce unstable queue rows or missing/operator-confusing entries.

- **[HIGH] Deterministic readiness/stuck-state is underspecified**  
  “readiness/ambiguity/stuck-state” signals are mentioned but acceptance criteria do not define boundary rules (age thresholds, retry counts, transient vs terminal failure). Without canonical rules, implementations may drift.

- **[MEDIUM] Hidden coupling risk via persistence adapters**  
  Adding adapters in `persistence.ts` and `intake-session.ts` can accidentally widen public API and couple batch logic too tightly to storage internals unless strictly read-only/immutable selectors are used.

- **[LOW] Test scope may miss large N behavior**  
  For queue throughput goals (10–20 sites/day), no performance-oriented test or bench is planned; deriving/sorting very large arrays may become an issue and should be covered early.

### 06-02 (BATCH-02, QUAL-01)

- **[HIGH] QUAL-01 requirement mismatch**  
  The requirement is “Release flow enforces Lighthouse thresholds.” The plan appears to create aggregate metrics/seams, but no explicit enforcement path is defined here (or in explicit CI wiring for Lighthouse as a gate in this plan).

- **[MEDIUM] Metrics bucket semantics not fully specified**  
  Reusing `categorizePublisherDiagnostic` is right, but the mapping strategy for “no diagnostics yet,” “blocked-but-no-diagnostic,” and “stale-but-healthy” cases is unclear, which can skew failure buckets.

- **[MEDIUM] Time semantics not locked**  
  Throughput and age metrics depend on timestamp interpretation (UTC/local, build completion vs check completion, timezone/DST boundaries). This can lead to unstable comparisons across environments.

- **[LOW] Cross-layer responsibility drift**  
  `app/lib/publisher/intake-ui.ts` is listed for `06-02` despite primary objective being library-level metrics. This suggests logic might leak into UI-level concerns before batch UI is explicitly scoped.

### 06-03 (BATCH-03, QUAL-02)

- **[HIGH] StructureView coupling risk**  
  Modifying `StructureView.tsx` directly in batch orchestration seams can break or regress default coding workflow if not carefully optionalized and isolated.

- **[MEDIUM] Orchestration contract missing operational semantics**  
  “enqueue/rebuild/check/publish/retry” actions need explicit idempotency, cancellation, and authorization/error semantics. Without these, adding remote execution later will be harder and riskier.

- **[MEDIUM] Security/command abuse not addressed**  
  Even if local-first, action contract design should still validate ownership/project scoping and prevent arbitrary command invocation via malformed IDs/handlers.

- **[LOW] Missing integration tests for orchestration->UI handoff**  
  There are only unit specs listed; with multiple UI touchpoints modified, a render/type-level integration path should be considered to avoid prop/handler regressions.

---

## Suggestions

- Add explicit canonical definitions for `readiness`, `blocked`, and `stuck` in `batch.ts` (e.g., explicit status enum + aging thresholds + retry-state rules), including what to do on missing/invalid data.
- Keep queue model as a pure derived projection with stable ordering tie-breakers (e.g., `priority`, `nextAction`, `updatedAt`, `id`) to guarantee deterministic rendering.
- Add a small adapter boundary: read-only query functions in persistence/intake-session; forbid mutation from batch layer.
- Introduce a migration-safe schema version for queue-related derived metrics if persisted caches are added later; if in-memory only, document that.
- For `QUAL-01`, include either:
  1) a concrete contract for Lighthouse threshold attachment to release checks now, or  
  2) a clearly marked follow-up artifact + acceptance criterion that phase 6 includes a “gate disabled by default but report-producing” mode only if intentional.
- Define metric window semantics explicitly (e.g., last 24h/7d UTC-based windows, fallback to no-data states) and test boundary cases.
- In `orchestration.ts`, include:
  - idempotent action IDs,
  - action status transitions,
  - structured validation errors,
  - no-op fallback for unsupported actions (typed exhaustiveness).
- Keep UI seam additions purely additive:
  - optional callbacks with stable defaults,
  - no behavior changes unless callback present,
  - pass-through wrappers preserving existing single-site flow.
- Add one integration check that compiles all affected UI paths and validates no required prop regressions.
- Clarify command execution context for remote future:
  - expected id fields (`siteId`, `intakeSessionId`, `publishRunId`),
  - allowed transitions,
  - failure/retry metadata shape.

---

## Risk Assessment

**Overall: MEDIUM**

The plan set is directionally strong and non-disruptive, but two high-impact risks remain: (1) `QUAL-01` may be interpreted only as reporting rather than enforcement, and (2) orchestration/UI seams can accidentally couple to existing single-project behavior and introduce regression risk. Closing these with explicit state semantics, typed contracts, and non-functional constraints will move risk toward LOW.

---

## Consensus Summary

Only one reviewer completed successfully (`codex`), so consensus is treated as provisional.

### Agreed Strengths

- The phase decomposition order (`06-01 -> 06-02 -> 06-03`) is structurally sound.
- Plans maintain local-first constraints and avoid premature server orchestration.
- Verification discipline (unit specs + typecheck + release test seam) is strong.

### Agreed Concerns

- `QUAL-01` enforcement path is under-specified versus requirement wording.
- Queue/stuck/readiness semantics need stricter canonical definitions for deterministic behavior.
- UI seam work around `StructureView` has regression risk without explicit isolation guarantees.

### Divergent Views

No divergence analysis available because only one reviewer completed in this run.
