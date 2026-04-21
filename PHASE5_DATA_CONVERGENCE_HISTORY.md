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
- [x] Backend compiles and passes analytics tests.
- [x] Frontend compiles with new mapper behavior.
- [x] Build API accepts V2 payload from workbench.
- [x] Legacy V1 payload remains accepted.

### 2026-04-21 - Batch 2 (schema-driven options panel)
Implemented changes:
1. Split mapper responsibility:
	- `FieldMapper` now renders only `column` fields.
	- `ChartOptionsPanel` now renders non-column fields from definitions (`text/select/boolean/number`).
2. Extended chart definition metadata in backend builders:
	- Added option fields (`subTitle`, `seriesName*`, `sortMode`, `smoothLine`, `swapAxis`, `aggregateByName`, `gaugeMode`) by chart family.
3. Updated workbench request assembly:
	- Sends merged V2 config from mapping + options.
	- Sends sanitized legacy config fallback to avoid mixed-type decode issues.
4. Strengthened legacy parsing in build handler:
	- Added bool parsing and CSV parsing (`yExtraCols`) for V1 compatibility.

Verification:
- Backend tests: `go test ./internal/analytics/...` passed.
- Frontend build: `cd vue-form && npm run build` passed.

Commit:
- `d60462a` - phase5: batch2 schema-driven options and config split

### 2026-04-21 - Batch 3 (统一配置校验与字段高亮)
Implemented changes:
1. Backend unified validation response for chart build:
	- Added structured response `ValidationErrorResponse` with `details[]` field-level issues.
	- Added required-field validation based on chart definitions before build execution.
2. Frontend build error UX upgrade:
	- Workbench/Form analytics pages parse `details[]` and map errors to field keys.
	- `FieldMapper` and `ChartOptionsPanel` now support per-field error highlighting and inline messages.
3. Test coverage:
	- Added handler test for structured validation response on `/api/admin/analytics/build`.

Verification:
- Backend tests: `go test ./internal/analytics/...` passed.
- Frontend build: `cd vue-form && npm run build` passed.

Commit:
- `de60154` - phase5: batch3 unified validation and field-level errors

### 2026-04-21 - Batch 4 (错误码标准化 + i18n 映射 + 422 快照)
Implemented changes:
1. Backend error code standardization:
	- Added stable validation error codes (`ERR_REQUIRED_FIELD`, `ERR_UNSUPPORTED_CHART`) in analytics model.
	- Validation response details now use standardized `code` values as frontend contract keys.
2. Frontend internationalization mapping:
	- Added shared utility to map validation `code` to locale-aware text (zh/en).
	- Workbench/Form analytics views now render field errors from `code` mapping, with server message fallback.
3. 422 snapshot coverage:
	- Added handler snapshot test to lock JSON payload shape and code values for config validation errors.

Verification:
- Backend tests: `go test ./internal/analytics/...` passed.
- Frontend build: `cd vue-form && npm run build` passed.

Commit:
- Pending (Batch 4 not committed yet in this entry).

## Notes
This file is maintained as a historical record. Follow-up entries should append date, changes, verification results, and commit hash.
