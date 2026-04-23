# 本地调试与合并到远程 — 步骤指南

目的：按顺序给出在本地调试 PoC（Go + Plumber/Shiny）并将功能分支合并到远程仓库的操作步骤与常见检查点。

## 1. 前置要求
- 已安装 Docker / Docker Compose（推荐）或至少安装 Go 与 R（若使用本地运行）
- 配置好 `git`（name/email）并在需要时能访问 GitHub（SSH 或 HTTPS）
- 工作目录：`/Users/crccredc/Documents/github/data_analysis/go_web_tools_poc`

## 2. 启动 PoC（推荐：Docker）
在 PoC 根目录运行：
```bash
cd /Users/crccredc/Documents/github/data_analysis/go_web_tools_poc
docker compose up --build
```

- Go server: http://localhost:8080/health
- Plumber: http://localhost:8000

停止：
```bash
docker compose down
```

## 3. 验证基本 API（示例）
- 上传文件（返回 `fileID`）：
```bash
curl -F "file=@/path/to/sample.csv" http://localhost:8080/api/analytics/upload
```
- 列表文件：
```bash
curl http://localhost:8080/api/analytics/files
```
- 发起任务（JSON body 包含 `fileID`）：
```bash
curl -X POST -H "Content-Type: application/json" -d '{"fileID":"<fileID>"}' http://localhost:8080/api/analytics/tasks
```
- 查询任务状态：
```bash
curl http://localhost:8080/api/analytics/tasks/<taskID>
```

生成的报告位于共享目录：`go_web_tools_poc/data/uploads/reports`（容器内路径 `/data/uploads/reports`）。

## 4. 本地逐步调试（可选）
- 运行 Go 服务（便于断点调试）：
```bash
cd go-server
go run main.go
```
- 运行 Plumber（需 R 已安装）：
```bash
R -e "install.packages(c('plumber','jsonlite'), repos='https://cran.rstudio.com')"
R -e "pr <- plumber::plumb('ops/shiny/plumber.R'); pr$run(host='0.0.0.0', port=8000)"
```

## 5. 常见问题与排查
- 报错 `connection refused`：确认容器服务端口映射正确且容器已启动。查看容器日志：`docker compose logs go-server`。
- 上传失败或超时：检查 `docker compose` 启动时是否挂载 `./data/uploads`；检查文件权限。
- Plumber 未响应：在容器内执行 `R` 命令看错误日志，或直接查看 `docker compose logs shiny-plumber`。

## 6. 本地验证通过后的 Git 操作（将分支推到远程）

场景 A：你对 `alexwoo79/go_web_tools` 有写权限（直接推到上游）
```bash
cd /Users/crccredc/Documents/github/data_analysis/go_web_tools_poc
git checkout feature/analytics-integration
git add .
git commit -m "feat(analytics): add PoC analytics integration"   # 如有新改动
git remote add upstream https://github.com/alexwoo79/go_web_tools.git || true
git push upstream feature/analytics-integration
```

场景 B：无写权限（推荐 fork 并推到你的 fork）
```bash
# 在你的 GitHub 上 fork alexwoo79/go_web_tools
git remote add myfork git@github.com:<your-user>/go_web_tools.git
git push myfork feature/analytics-integration
# 在 GitHub 上发起 PR： your-fork:feature/analytics-integration -> alexwoo79/go_web_tools:main
```

场景 C：当前网络受限（使用 bundle）
- 我已生成 `analytics_poc.bundle` 在工作区根。把 bundle 复制到有网络的机器上：
```bash
scp analytics_poc.bundle you@other-machine:/tmp
# 在另一台有网络的机器上：
git clone https://github.com/alexwoo79/go_web_tools.git
cd go_web_tools
git fetch /tmp/analytics_poc.bundle feature/analytics-integration:feature/analytics-integration
git checkout feature/analytics-integration
git push origin feature/analytics-integration
```

## 7. 在 GitHub 上创建 PR（推荐包含验证步骤）
- 使用 `gh`（GitHub CLI）：
```bash
gh pr create --base main --head <your-username>:feature/analytics-integration \
  --title "feat(analytics): add analytics PoC" \
  --body "PoC: Go API stubs, local storage, plumber service, and docker-compose. Run steps: ..." 
```
- 或在网页上点击 `Compare & pull request` 并填写说明。

## 8. 合并前检查清单
- 本地 `go build` / `go test` 通过
- PoC 流程可复现（upload → task → report）
- `config.example.yaml` / `README.md` 更新（运行和配置说明）
- 指定 reviewer 并等待 CI 通过（若仓库有 CI）

## 9. 合并与部署建议
- 合并方式：Squash（保持主分支整洁）或 Merge commit（保留开发历史），依据项目习惯
- 合并后：在目标环境（或 CI/CD）运行 `docker compose up --build` 或按生产部署流程部署并验证

## 10. 回滚与清理
- 如果必须回滚，使用 GitHub 的 Revert PR 或在主分支上 `git revert` 合并提交
- 清理：在合并并验证后，可删除远程分支 `feature/analytics-integration`。

---
如果你希望，我可以把一份预填的 PR body（含测试命令与验证截图说明）生成到工作区供你复制粘贴。是否需要？
