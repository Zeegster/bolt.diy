## Summary

- Unified intake review around the shared `IntakePageEditor` so page-scoped metadata repair, source guidance, and contract boundary reminders live in one editor model.
- Extended `intake-ui` draft shaping with repair summaries, missing-field detection, and issue counts that separate metadata repair from extraction and contract diagnostics.
- Made intake checks more actionable with review-specific repair guidance and added regression coverage for repair-oriented draft shaping and intake diagnostics.

## Verification

- `pnpm vitest app/lib/publisher/publisher.spec.ts --run`
- `pnpm exec tsc --noEmit`
- `node "$HOME/.codex/get-shit-done/bin/gsd-tools.cjs" verify plan-structure .planning/phases/02-operator-review-workflow/02-02-PLAN.md`
