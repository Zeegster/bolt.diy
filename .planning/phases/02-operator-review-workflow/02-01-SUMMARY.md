## Summary

- Added a dedicated publisher workflow-state layer that derives explicit operator stages, summaries, blocking reasons, and next actions from intake sessions, checks, and build history.
- Updated intake and release workspaces to show stage framing and actionable next-step guidance instead of only raw status strings and check counters.
- Extended publisher regression coverage for draft, intake-review, contract-ready, release-ready, and failed workflow state derivation.
