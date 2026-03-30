# Phase 4: Release Pipeline and Quality Gates - Research

**Researched:** 2026-03-30
**Domain:** Publisher release pipeline, validation gates, artifact contracts, and CI discipline
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Keep this phase implementation within current publisher runtime and contract model.
- Preserve deterministic output shape and compatibility with existing operator workflows.
- Treat requirements set as locked for scope: [BUILD-04, OPER-04, VAL-01, VAL-02, VAL-03, VAL-04, PUB-01, PUB-02, PUB-03].

### Claude's Discretion
- Execute this phase as additive work following roadmap success criteria.
- Favor minimal contract changes with clear migration guards.

### Deferred Ideas (OUT OF SCOPE)
- Infrastructure scaling, external orchestration, and advanced runtime optimization can stay in later phases.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BUILD-04 | Build pipeline supports a distinct optimize/check stage after assembly | Split `assemblePublisherProject()` into typed stage functions with persisted stage outputs and diagnostics. |
| OPER-04 | Operator can access build history, generated entry points, and release readiness in one workflow | Keep `PublisherReleaseWorkspace` as the UI surface, but back it with authoritative stage/artifact records instead of local-only summary data. |
| VAL-01 | Working checks support day-to-day operator review without blocking draft iteration | Preserve `gate: working` vs `gate: release`, but make stage ownership explicit so working warnings never masquerade as publish blockers. |
| VAL-02 | Release checks block publish when metadata, canonical URLs, robots/sitemap consistency, internal links, or asset policy fail | Reuse current check engine as the blocker source; extend it to validate generated artifacts and managed asset existence more completely. |
| VAL-03 | Typecheck, tests, and CI linting are part of the standard release discipline | Build on existing GitHub Actions CI and formalize a release gate command sequence for build, typecheck, lint, and tests. |
| VAL-04 | Publisher flows have integration tests covering intake, contracts, assembly, and release checks | Expand current Vitest publisher specs into stage-aware integration tests and add UI tests for release workspace/build history behavior. |
| PUB-01 | Export/publish flow has a documented artifact contract, deploy entrypoints, and build metadata format | Persist a standalone publish/export contract that describes artifact root, entrypoints, provenance, and can-publish status. |
| PUB-02 | Publish history records enough provenance to inspect what source and contract state produced an artifact | Treat generated provenance plus persisted build history as one contract; do not rely on `localStorage` alone for release provenance. |
| PUB-03 | System can support rollback-friendly artifact retention or reproducible rebuilds | Keep rebuild-first rollback, but make artifact/source fingerprints and retention policy first-class and testable. |
</phase_requirements>

## Summary

The repo already has the right raw ingredients for Phase 4. `app/lib/publisher/assembler.ts` emits generated files, a build summary, synthetic stage jobs, and a publish contract, while `app/lib/publisher/checker.ts` already distinguishes `working` vs `release` checks. `PublisherReleaseWorkspace` and persisted `buildHistory` also give Phase 4 an operator-facing anchor. This means the phase should be planned as a hardening/refactoring phase, not a greenfield pipeline rewrite.

The main gap is that the current release pipeline is only conceptually staged. `assemblePublisherProject()` still performs assembly, optimization placeholder logic, validation, artifact summarization, and export-state generation in one pass. The four jobs are post-hoc records, not true stage boundaries. There is also no persisted standalone publish contract artifact, no authoritative publish step, and build history is stored in browser `localStorage`, which is useful for UX but not sufficient for provenance or rollback-grade history.

CI and tests exist, but they are still baseline quality discipline, not release-pipeline discipline. GitHub Actions runs build, typecheck, lint, and tests, and publisher-focused Vitest specs already cover contract loading, assembly, checks, provenance, and blocker behavior. The next step is to formalize a release contract and stage outputs so both UI and CI are verifying the same thing.

**Primary recommendation:** Plan Phase 4 around a typed, persisted stage pipeline inside the existing publisher runtime: `assemble -> optimize -> check -> publish/export`, with one authoritative artifact contract consumed by UI, tests, and CI.

## Project Constraints (from AGENTS.md)

- Use `pnpm` for package management and project scripts.
- Keep changes focused and avoid touching unrelated files.
- Do not run destructive commands or rewrite user changes without explicit direction.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | repo `5.7.2`, local `tsc 5.8.2` | Typed release contracts and stage outputs | Existing publisher runtime is already strongly typed through `app/types/publisher.ts`. |
| Vitest | repo `2.1.7`, local `2.1.9` | Unit and integration coverage for publisher release behavior | Already used across publisher specs and fast enough for per-stage gating. |
| ESLint | local `9.23.0` | Enforce release-discipline code quality in CI | Already wired into CI and compatible with current flat config. |
| GitHub Actions | repo workflows | Standard CI gate for build, lint, typecheck, and tests | Already present in `.github/workflows/ci.yaml`; Phase 4 should extend it, not replace it. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@vitest/coverage-v8` | add current matching major to Vitest if coverage thresholds are introduced | Native coverage thresholds and reports | Use in this phase if VAL-03/VAL-04 need measurable coverage gates. |
| Wrangler | repo `4.5.1` | Preview/build parity for Cloudflare Pages target | Use only for final build/preview validation, not as the core release orchestrator. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Existing publisher runtime | External SSG/deployer orchestration | Out of scope and contradicts locked decision to stay within current runtime/contract model. |
| Vitest integration tests | Playwright end-to-end release tests | Better browser fidelity, but heavier; Phase 4 should first exhaust fast stage-level integration coverage. |
| Browser `localStorage` build history | Server-backed release history | Better provenance, but out of scope for this milestone; keep additive and contract-safe. |

**Installation:**
```bash
pnpm add -D @vitest/coverage-v8
```

**Version verification:** `npm view` on 2026-03-30 showed latest published versions: Vitest `4.1.2` (modified 2026-03-26), TypeScript `6.0.2` (modified 2026-03-28), ESLint `10.1.0` (modified 2026-03-20), Wrangler `4.78.0` (modified 2026-03-27). Recommendation for this phase is to stay on the repo’s current stack unless a required feature forces an upgrade.

## Architecture Patterns

### Recommended Project Structure
```text
app/lib/publisher/
├── release-pipeline.ts   # New pure stage runner and typed stage results
├── assembler.ts          # Assembly-only generation logic
├── checker.ts            # Check computation and blocker classification
├── metadata.ts           # Canonical/sitemap/robots/schema generation
├── persistence.ts        # Operator-facing cached history
└── contracts.ts          # Contract loading/validation

app/components/publisher/
├── PublisherReleaseWorkspace.tsx   # Release readiness UI
└── PublisherIntakeWorkspace.tsx    # Build/rebuild workflow integration
```

### Pattern 1: Pure Stage Boundaries
**What:** Each release stage returns a typed result object and never infers state from UI caches.
**When to use:** For every transition between assemble, optimize, check, and publish/export.
**Example:**
```typescript
type ReleaseStageResult<T> = {
  stage: 'assemble' | 'optimize' | 'check' | 'publish';
  status: 'completed' | 'failed';
  diagnostics: CheckReport[];
  output: T;
};
```
Source: current repo direction in `app/lib/publisher/assembler.ts` and `app/types/publisher.ts`

### Pattern 2: Publish Consumes Contracts, Not Live UI State
**What:** Publish/export reads a persisted artifact contract and stage summaries, not `buildHistory` from `localStorage`.
**When to use:** For `PUB-01` through `PUB-03`, and anywhere the operator inspects a previous release.
**Example:**
```typescript
interface PublisherExportContract {
  buildId: string;
  artifactRoot: string;
  entrypoints: string[];
  artifactFingerprint: string;
  sourceFingerprint: string;
  canPublish: boolean;
}
```
Source: current repo contracts in `app/types/publisher.ts` and missing persisted contract in `app/lib/publisher/assembler.ts`

### Pattern 3: One Check Engine, Two Gates
**What:** Keep a single source of truth for checks, but classify them explicitly as advisory (`working`) or blocking (`release`).
**When to use:** Everywhere checks are shown, persisted, or enforced.
**Example:**
```typescript
const releaseBlockers = checks.filter((check) => check.gate === 'release' && check.status === 'fail');
const workingIssues = checks.filter((check) => check.gate === 'working' && check.status !== 'pass');
```
Source: `app/lib/publisher/checker.ts`

### Anti-Patterns to Avoid
- **Synthetic stages without real outputs:** Current jobs are generated after the fact; Phase 4 should not stop at renaming or re-labeling them.
- **Recomputing release truth in multiple places:** UI, CI, and export must all consume the same persisted stage/check contract.
- **Using `localStorage` as authoritative provenance:** `persistence.ts` is fine for UX memory, not for artifact-grade history.
- **Adding a new publish subsystem:** Locked scope says stay inside the current runtime and contract model.
- **Expanding warnings into blockers implicitly:** `working` checks must remain non-blocking unless intentionally promoted into `release`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Test coverage gating | Custom coverage parser | Vitest coverage provider and thresholds | Coverage reports and thresholds are solved problems; custom parsing adds maintenance risk. |
| CI dependency caching | Bespoke pnpm cache scripts | `actions/setup-node` with `cache: pnpm` | Already used in the repo’s composite action and less error-prone than manual cache orchestration. |
| Artifact retention semantics in CI | Homemade checksum/retention shell glue | GitHub Actions artifact upload/download behavior plus repo fingerprints | CI artifacts already support retention and digests; app-level fingerprints should complement, not replace, that. |
| SEO/runtime ownership | Agent-authored release HTML/head logic | Existing app-owned metadata and checker pipeline | Requirement set already locks metadata/runtime ownership into the app. |

**Key insight:** The complex part of this phase is not file generation. It is making stage outputs, blockers, provenance, and operator history agree across code, UI, and CI.

## Common Pitfalls

### Pitfall 1: Treating `assemblePublisherProject()` as Already-Separated Pipeline
**What goes wrong:** Planner assumes the stage model already exists because `PublisherJobStage` contains `assemble`, `optimize`, `check`, and `export`.
**Why it happens:** The current implementation creates stage jobs after a single monolithic build pass.
**How to avoid:** Plan explicit pure functions and persisted outputs per stage.
**Warning signs:** Tests only assert job names or counts, not stage-specific inputs/outputs.

### Pitfall 2: Using Build History as Release Provenance
**What goes wrong:** UI history looks correct, but old releases are not reproducible or auditable.
**Why it happens:** `buildHistory` lives in browser `localStorage` and is sorted summaries only.
**How to avoid:** Persist a standalone export/publish contract and keep provenance in generated artifacts.
**Warning signs:** A previous build cannot be reconstructed from files alone.

### Pitfall 3: Blocking on Checks That Are Not Artifact-Aware
**What goes wrong:** Release passes even when generated artifacts are missing expected entrypoints or copied assets.
**Why it happens:** Current checks mostly inspect contracts plus a few metadata/link rules, not the post-build artifact tree.
**How to avoid:** Add release-stage checks against generated files and managed asset presence.
**Warning signs:** `checks.json` is green while `generated/` is structurally incomplete.

### Pitfall 4: CI Verifies “App Healthy” Instead of “Publisher Release Healthy”
**What goes wrong:** CI stays green while publisher release regressions slip through.
**Why it happens:** Current CI is global and publisher tests are still mostly library-level happy-path checks.
**How to avoid:** Add targeted publisher release commands and artifact assertions into CI.
**Warning signs:** Release bugs require manual local rebuilds to detect.

### Pitfall 5: Mixing `pnpm` Policy with New `npm` Scripts
**What goes wrong:** Release pipeline becomes inconsistent with project policy.
**Why it happens:** Existing `package.json` still contains legacy `npm run` indirections.
**How to avoid:** New release/test/docs commands for this phase should use `pnpm` explicitly.
**Warning signs:** CI or docs introduce new `npm run ...` examples.

## Code Examples

Verified patterns from official sources:

### Vitest Coverage Thresholds
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
  },
});
```
Source: https://vitest.dev/guide/coverage.html

### GitHub Actions Artifact Retention
```yaml
- name: Upload publisher release artifacts
  uses: actions/upload-artifact@v4
  with:
    name: publisher-release
    path: .bolt/publisher/generated
    retention-days: 7
```
Source: https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/storing-and-sharing-data-from-a-workflow

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single rebuild function with synthetic stage labels | Typed stage pipeline with persisted outputs | Phase 4 target | Makes release failures explainable and testable. |
| Local-only build history | Artifact-backed provenance plus operator cache | Phase 4 target | Enables rollback-friendly inspection and reproducible rebuilds. |
| Happy-path unit tests | Stage-aware integration tests plus CI gating | Phase 4 target | Prevents release regressions from hiding behind app-wide green CI. |

**Deprecated/outdated:**
- `export` as the last meaningful stage: good enough for Phase 3, but insufficient for a formal release/publish contract.
- `buildHistory` as the main release record: acceptable for UX continuity, not for `PUB-02`/`PUB-03`.

## Open Questions

1. **What is the canonical persisted publish artifact?**
   - What we know: generated output, `state.json`, `checks.json`, and `provenance.json` already exist.
   - What's unclear: whether Phase 4 should add a dedicated `publish-contract.json` or extend `state.json`.
   - Recommendation: add a standalone publish/export contract file to avoid overloading UI state.

2. **Should “publish” remain a local export concept in this phase?**
   - What we know: locked scope keeps work inside current runtime and defers external orchestration.
   - What's unclear: whether the final stage name should be `publish` or `export` in code.
   - Recommendation: expose `publish` in UX/requirements, but keep migration-safe code aliases if existing types still use `export`.

3. **How far should CI go on Lighthouse gating now?**
   - What we know: success criteria mention future Lighthouse gating and Phase 6 owns `QUAL-01`.
   - What's unclear: whether Phase 4 should add only scaffolding or actual thresholds.
   - Recommendation: add artifact/test hooks and placeholders now, but do not block releases on Lighthouse until Phase 6.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | build, tests, CI parity | ✓ | `v25.8.1` | repo requires `>=18.18.0`; avoid relying on Node 25-only behavior |
| pnpm | scripts and package management | ✓ | `9.4.0` | none |
| Vitest CLI | publisher integration tests | ✓ | `2.1.9` | none |
| TypeScript CLI | typecheck gate | ✓ | `5.8.2` | none |
| ESLint CLI | lint gate | ✓ | `9.23.0` | none |
| GitHub Actions workflows | CI enforcement | ✓ configured | repo workflows present | local `pnpm run build && pnpm run typecheck && pnpm run lint && pnpm run test` |

**Missing dependencies with no fallback:**
- None for planning/research.

**Missing dependencies with fallback:**
- Coverage provider package is not configured. Fallback is to keep phase tests green without thresholds, but that weakens `VAL-03`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `2.1.9` |
| Config file | none - uses package script defaults |
| Quick run command | `pnpm test -- app/lib/publisher/publisher.spec.ts` |
| Full suite command | `pnpm run build && pnpm run typecheck && pnpm run lint && pnpm run test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BUILD-04 | Separate assemble/optimize/check/publish stage behavior and diagnostics | integration | `pnpm test -- app/lib/publisher/publisher.spec.ts` | ✅ |
| OPER-04 | Release workspace exposes build history, entrypoints, and readiness | component | `pnpm test -- app/components/publisher/PublisherReleaseWorkspace.spec.tsx` | ❌ Wave 0 |
| VAL-01 | Working checks remain visible but non-blocking | integration | `pnpm test -- app/lib/publisher/publisher.spec.ts` | ✅ |
| VAL-02 | Release blockers stop publish on metadata/link/asset/runtime failures | integration | `pnpm test -- app/lib/publisher/publisher.spec.ts` | ✅ |
| VAL-03 | Build/typecheck/lint/tests form release discipline | CI/smoke | `pnpm run build && pnpm run typecheck && pnpm run lint && pnpm run test` | ✅ |
| VAL-04 | Intake -> contracts -> assembly -> release checks are covered | integration | `pnpm test -- app/lib/publisher/intake.spec.ts && pnpm test -- app/lib/publisher/publisher.spec.ts` | ✅ |
| PUB-01 | Artifact contract and deploy entrypoints are persisted | integration | `pnpm test -- app/lib/publisher/release-pipeline.spec.ts` | ❌ Wave 0 |
| PUB-02 | Publish history retains provenance | integration | `pnpm test -- app/lib/publisher/persistence.spec.ts` | ❌ Wave 0 |
| PUB-03 | Rollback-friendly retention or reproducible rebuilds | integration | `pnpm test -- app/lib/publisher/release-pipeline.spec.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test -- app/lib/publisher/publisher.spec.ts`
- **Per wave merge:** `pnpm test -- app/lib/publisher/intake.spec.ts && pnpm test -- app/lib/publisher/publisher.spec.ts`
- **Phase gate:** `pnpm run build && pnpm run typecheck && pnpm run lint && pnpm run test`

### Wave 0 Gaps
- [ ] `vitest.config.ts` - centralize coverage/reporter thresholds for `VAL-03`
- [ ] `app/components/publisher/PublisherReleaseWorkspace.spec.tsx` - covers `OPER-04`
- [ ] `app/lib/publisher/release-pipeline.spec.ts` - covers `BUILD-04`, `PUB-01`, `PUB-03`
- [ ] `app/lib/publisher/persistence.spec.ts` - covers `PUB-02`
- [ ] `.github/workflows/ci.yaml` artifact upload/reporting step - makes release artifacts inspectable in CI

## Sources

### Primary (HIGH confidence)
- Local codebase: `app/lib/publisher/assembler.ts`, `app/lib/publisher/checker.ts`, `app/lib/publisher/persistence.ts`, `app/components/publisher/PublisherReleaseWorkspace.tsx`, `app/components/workbench/StructureView.tsx`, `app/lib/publisher/publisher.spec.ts`, `app/lib/publisher/intake.spec.ts`
- GitHub Actions docs - storing and sharing workflow data: https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/storing-and-sharing-data-from-a-workflow
- Vitest docs - coverage: https://vitest.dev/guide/coverage.html

### Secondary (MEDIUM confidence)
- npm registry metadata for current package versions via `npm view` on 2026-03-30
- Repo CI workflows: `.github/workflows/ci.yaml`, `.github/actions/setup-and-build/action.yaml`

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - based on current repo usage, verified local tool availability, and npm registry version checks.
- Architecture: HIGH - grounded in current publisher code paths and locked phase scope.
- Pitfalls: HIGH - derived from direct gaps between requirements and existing implementation.

**Research date:** 2026-03-30
**Valid until:** 2026-04-06
