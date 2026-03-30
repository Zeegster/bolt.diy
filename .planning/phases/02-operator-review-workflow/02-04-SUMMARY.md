## Summary

- Added constrained block-editing guidance in Publisher Mode so operators can see safe block props, blocked fields, and the reason a field is locked before touching the page contract.
- Connected editing restrictions to runtime contract rules with shared helper logic for ownership vs composition boundaries, then surfaced the same explanations in intake review and README.
- Added regression coverage for reserved metadata and unsupported prop boundaries so constrained editing behavior stays aligned with publisher contract guards.

## Verification

- `pnpm vitest app/lib/publisher/publisher.spec.ts --run`
- `pnpm exec tsc --noEmit`
- `rg -n "block editing|reserved|ownership|invalid composition" README.md`
- `node "$HOME/.codex/get-shit-done/bin/gsd-tools.cjs" verify plan-structure .planning/phases/02-operator-review-workflow/02-04-PLAN.md`
