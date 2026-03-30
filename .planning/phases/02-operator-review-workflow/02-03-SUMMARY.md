## Summary

- Added an explicit source-to-contract-to-output comparison rail inside Publisher Mode so operators can jump straight to the relevant raw source, page contract, or generated HTML for the current page.
- Reworked release diagnostics into grouped operator-facing panels by gate, severity, and category, while keeping working and release issues visually distinct.
- Tightened checker guidance and regression coverage so diagnostic categories and repair hints stay stable as publisher rules evolve.

## Verification

- `pnpm vitest app/lib/publisher/publisher.spec.ts --run`
- `pnpm exec tsc --noEmit`
- `node "$HOME/.codex/get-shit-done/bin/gsd-tools.cjs" verify plan-structure .planning/phases/02-operator-review-workflow/02-03-PLAN.md`
