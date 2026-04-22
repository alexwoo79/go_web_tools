# 仓库维护与整理指南

目的：把仓库按“运行期（production/runtime）”和“开发期（development）”进行分层，方便删减、迁移和部署决策。

简要结论
- 后端运行时必需：`cmd/server`, `internal/*`, `ui`（内嵌模板与构建产物）、`config*.yaml`、`data/`。
- 开发期工具：`vue-form/`（前端源代码）、`Makefile`/`build.sh`/`release.sh`、测试用例、lint/ci 配置。

技术栈
- 后端：Go 1.25，Gorilla Mux，YAML 配置，SQLite（modernc.org/sqlite）。
- 前端：Vue 3（beta） + Vite + TypeScript + Pinia + ECharts。
- 打包/容器：`build.sh` 将前端构建并拷贝到 `ui/frontend`，再构建 Go 二进制，Dockerfile 运行 `/bin/go-web`。

文件分类（建议直接用于整理、移动或归档）

1) 运行期（部署/生产镜像中应包含）
- `cmd/server/*` — 后端可执行的入口与启动参数
- `internal/*` — 业务逻辑、路由、模型、处理器
- `ui/templates/*` — 运行时需要的 HTML 模板
- `ui/static/*` — 若服务以内嵌静态为主
- `ui/frontend/*` — 构建后拷贝的 Vue `dist`（由 `build.sh` 生成并嵌入）
- `config.yaml`, `config.example.yaml`, `*.yaml`（生产配置和表单定义）
- `data/` — 运行时数据目录（应由卷挂载或独立持久化）
- `bin/`（发布产物）以及生产 Dockerfile / docker-compose.yml

2) 开发期（应保留在源代码仓，以便本地开发/CI）
- `vue-form/` — 前端源码、测试、npm 配置
- `Makefile`, `build.sh`, `release.sh` — 本地构建、打包与发布脚本
- 各种测试文件：`internal/**/*_test.go`、`vue-form` 下的 vitest/playwright 配置
- linter/format 配置：`eslint.config.ts`, `oxlintrc`, `tsconfig*` 等

3) 可归档 / 建议移出仓库（大体积或历史产物）
- 大体积镜像/压缩包：`*.tar`, `*.zip`（例如仓库中的 `alpine-*.tar`, `go_form.zip`）
- 生成产物目录（若为 CI 可再生）：`bin/`, `vue-form/node_modules/`, `vue-form/dist/`, `playwright-report/`, `test-results/`
- 临时/历史脚本（如果不再使用）：`init.sh`, `validate.sh`, `publish.sh`（先审查再删除）

整理与变更步骤（可按此顺序在分支上执行）
1. 在新分支上做所有变更（例如 `chore/repo-cleanup`）。
2. 同步文档：更新 `README.md` 与 `QUICKSTART.md`，指向本文件作为整理规范。
3. 删除或归档不再使用的入口/脚本：先 grep 全局确认没有引用，再删除或移动到 `docs/archive/`。
4. 更新 `.gitignore`，确保不再提交 `node_modules/`, `dist/`, 大体积制品。
5. 运行测试：`go test ./...`，并在前端目录运行 `npm run build` 验证构建流程（或在 CI 中执行）。
6. 本地一体化验证：`./build.sh` → 启动 `./bin/go-web --config ./bin/config.yaml` → 访问 `http://localhost:8080`（或 `make dev` / `make api` + `make web`）。

示例命令
```bash
# 在新分支
git checkout -b chore/repo-cleanup

# 搜索残留引用
rg "cmd/generate|init.sh|generated/" || true

# 运行后端测试
go test ./...

# 前端构建（可选）
cd vue-form && npm ci && npm run build

# 一体化构建
./build.sh
```

回滚与审查建议
- 逐个小步删除（每次提交包含：1 个脚本删除 + 相关文档更新 + CI/测试通过），便于回滚与代码审查。
- 对于疑似仍在使用的脚本或产物，先移动到 `docs/archive/` 并在 PR 描述中列出理由，经过 1-2 周无影响后再彻底删除。

结语
本文件可作为团队内部的整理准则：执行前请在分支上提交并在 CI 中通过所有测试，必要时在 README 指明变更影响范围。
