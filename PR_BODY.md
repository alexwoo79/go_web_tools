Title: feat(analytics): add analytics PoC (Go API + Shiny/plumber + docker-compose)

Summary
------
This PR introduces a minimal PoC that integrates an analytics workflow into the project:
- `go-server` PoC: upload/files/tasks API stubs and a local storage implementation
- `ops/shiny` PoC: a plumber endpoint to render a simple HTML report into shared storage
- `docker-compose.yml` to run the PoC services (go-server, shiny-plumber, redis)

Files changed/added (PoC folder)
--------------------------------
- go_web_tools_poc/docker-compose.yml
- go_web_tools_poc/go-server/main.go
- go_web_tools_poc/go-server/internal/api/{upload.go,files.go,tasks.go}
- go_web_tools_poc/go-server/internal/storage/storage.go
- go_web_tools_poc/ops/shiny/{plumber.R,app.R,render_report.R,report.qmd}
- go_web_tools_poc/LOCAL_DEBUG_AND_MERGE.md

How to run (local PoC)
----------------------
1. Start services with Docker (recommended):
```bash
cd go_web_tools_poc
docker compose up --build
```
2. Health checks:
 - Go: `http://localhost:8080/health`
 - Plumber: `http://localhost:8000`

Quick manual test
-----------------
1) Upload a sample file (returns `fileID`):
```bash
curl -F "file=@/path/to/sample.csv" http://localhost:8080/api/analytics/upload
```
2) Create a render task (returns `taskID`):
```bash
curl -X POST -H "Content-Type: application/json" -d '{"fileID":"<fileID>"}' http://localhost:8080/api/analytics/tasks
```
3) Poll task status:
```bash
curl http://localhost:8080/api/analytics/tasks/<taskID>
```
4) Generated report path: `go_web_tools_poc/data/uploads/reports`

Verification checklist (before merge)
------------------------------------
- `go build` and `go vet` succeed in `go-server`
- PoC flow works end-to-end (upload → task → report)
- `LOCAL_DEBUG_AND_MERGE.md` contains run & verification steps (already added)
- Security: uploads should be validated and API endpoints protected before production

Testing notes
-------------
- This PoC contains simple unitable stubs for internal logic. For production, convert storage to a proper interface with S3 implementation and add unit tests for each module.

Merge strategy
--------------
- Recommend `squash and merge` for this PoC branch to keep main history concise. After merge, migrate PoC artifacts into repository canonical layout (`internal/` and `ops/`) and add CI tests.

Reviewers & Owners
------------------
- @alexwoo79 (repo owner)
- Analytics / Platform team

Notes
-----
- If remote push fails due to network, a git bundle `analytics_poc.bundle` is available at the repository root for manual application.

PR Body prepared by automation — please edit before submitting to the upstream repo to add any further context or link to issue/ticket.
