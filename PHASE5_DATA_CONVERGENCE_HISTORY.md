# Phase 5 Data Convergence History

Created: 2026-04-21
Owner: analytics workbench

## Goal
Converge analytics data contracts and frontend mapping logic to reduce drift between backend payloads, request config keys, and UI mapping behavior.

## Scope (Phase 5 kickoff)
- Add contract version support for chart build requests.
- Introduce typed V2 build config while keeping V1 compatibility.
- Extend chart field metadata to support schema-driven UI (including multi-select fields).
- Upgrade mapper UI to handle `multi` field definitions.

## Work Log

### 2026-04-21 - Kickoff
Planned actions:
1. Add `schemaVersion` and `configV2` support to analytics build request model.
2. Keep backward compatibility for legacy `config` map keys.
3. Extend `FieldDef` with metadata (`description`, `multi`, `type`, `options`, `aliases`).
4. Update chart definition registrations to provide richer field metadata.
5. Update Vue `FieldMapper` to support multi-select binding.
6. Update workbench request payload to send V2 config.

Acceptance checklist:
- [ ] Backend compiles and passes analytics tests.
- [ ] Frontend compiles with new mapper behavior.
- [ ] Build API accepts V2 payload from workbench.
- [ ] Legacy V1 payload remains accepted.

## Notes
This file is maintained as a historical record. Follow-up entries should append date, changes, verification results, and commit hash.
