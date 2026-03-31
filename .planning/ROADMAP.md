# Roadmap: bolt.diy Publisher Workspace UI Refactor

## Overview

Milestone `v1.2` focuses on a structured UI refactor for Publisher mode. The target is an operator-first workspace that is visually calmer, behaviorally deterministic, and easier to scale: fixed layout shell, explicit IA, reusable form primitives, and a polished accessible responsive layer.

## Phases

- [x] **Phase 1: Layout Shell** - Fixed screen shell, panel-only scrolling, chat switches above chat, onboarding right.
- [x] **Phase 2: Publisher Workspace IA** - Reorganize workspace into `Основное / Дизайн / SEO` plus explicit `Intake Source` panel.
- [x] **Phase 3: Form Components and Unification** - Introduce `ImageAssetInput` + `TagInput` and standardize form interactions.
- [x] **Phase 4: Visual Polish, Accessibility, Responsive** - Polish visuals, close a11y gaps, verify desktop/tablet/mobile behavior and scroll states.

## Phase Details

### Phase 1: Layout Shell
**Goal**: Establish a deterministic publisher shell where viewport framing is fixed and only intended panels scroll.
**Depends on**: None (milestone start)
**Requirements**: [PUBUI-01, PUBUI-02, PUBUI-03]
**Success Criteria** (what must be TRUE):
  1. Publisher mode is rendered in a fixed-screen shell; root page scroll is disabled for this workspace.
  2. Left/center/right panel scroll behavior is explicit, consistent, and independent.
  3. Chat switches remain above chat content and onboarding/help is stably placed in the right panel.
**Plans**: 2 plans
Plans:
- [x] 01-layout-shell-01-PLAN.md — Implement fixed-shell layout contract, panel-only scroll ownership, pinned chat switches, and right-panel onboarding/help placement.
- [x] 01-layout-shell-02-PLAN.md — Execute DoD gates with responsive scroll screenshots, runtime/hook validation, and `pnpm typecheck && pnpm lint`.

### Phase 2: Publisher Workspace IA
**Goal**: Make information architecture predictable and task-oriented via three primary sections and explicit intake source surface.
**Depends on**: Phase 1
**Requirements**: [PUBIA-01, PUBIA-02, PUBIA-03]
**Success Criteria** (what must be TRUE):
  1. Operator can switch between `Основное / Дизайн / SEO` without context loss or hidden content.
  2. `Intake Source` exists as a clear panel entry with observable state.
  3. Main operator surface is focused on the active task and not overloaded by secondary context.
**Plans**: 1 plan
Plans:
- [x] 02-01-PLAN.md — Implement IA section switching (`Основное / Дизайн / SEO`), explicit `Intake Source` entry/state, and phase DoD evidence package.

### Phase 3: Form Components and Unification
**Goal**: Reduce UI drift by consolidating shared form logic into reusable components.
**Depends on**: Phase 2
**Requirements**: [PUBFORM-01, PUBFORM-02, PUBFORM-03]
**Success Criteria** (what must be TRUE):
  1. `ImageAssetInput` and `TagInput` are reusable typed components integrated in publisher forms.
  2. Publisher forms share consistent validation and error presentation patterns.
  3. Existing touched forms are migrated without behavior regressions.
**Plans**: 1 plan
Plans:
- [x] 03-01-PLAN.md — Unify shared form primitives and migrate touched publisher forms to common validation/a11y patterns with DoD evidence.

### Phase 4: Visual Polish, Accessibility, Responsive
**Goal**: Finalize publisher workspace quality to release-ready UI standards.
**Depends on**: Phase 3
**Requirements**: [PUBQA-01, PUBQA-02, PUBQA-03]
**Success Criteria** (what must be TRUE):
  1. Desktop/tablet/mobile screenshots (including scroll states) are captured for changed surfaces.
  2. No React runtime or hook errors are present in manual validation.
  3. `pnpm typecheck && pnpm lint` are green after the phase changes.
**Plans**: 1 plan
Plans:
- [x] 04-01-PLAN.md — Apply visual/a11y/responsive polish and close DoD with screenshots, runtime smoke, and static gates.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Layout Shell | 2/2 | Complete | 2026-03-31 |
| 2. Publisher Workspace IA | 1/1 | Complete | 2026-03-31 |
| 3. Form Components and Unification | 1/1 | Complete | 2026-03-31 |
| 4. Visual Polish, Accessibility, Responsive | 1/1 | Complete | 2026-03-31 |
