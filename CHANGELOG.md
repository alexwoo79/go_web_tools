# Changelog

记录本项目主要功能与优化变更。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本参考 [SemVer](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 2026-08-27 Wails 桌面端

#### Added
- **Wails 桌面应用**：复用同一套 Go 后端 + Vue 前端，打包为原生桌面应用（`make wails-dev` / `make wails-build`）。
- **后端共享包 `internal/app`**：把 `cmd/server/main.go` 的初始化逻辑抽成可复用入口，Web 服务与桌面端共用配置加载、动态建表、路由与优雅关闭。
- **生产模式 HTTP 源跳转**：桌面窗口先加载 `redirector/` 跳转页，经 Go 绑定取得后端地址后跳转到 `http://127.0.0.1:<port>/`，规避 macOS `wails://` 自定义 scheme 不支持 Cookie 的已知问题，会话/导出与 Web 版行为一致。
- **桌面配置解析**：优先 `GO_FORM_WEB_CONFIG`，其次可执行文件/当前目录的 `config.yaml`，最后回退到用户配置目录并自动写入内嵌默认配置。
- **原生系统菜单**：在浏览器中打开、打开数据目录、打开配置目录、退出。
- **同时启动 Web 服务（局域网访问）**：桌面端按 `server.host:port` 额外监听一个
  对外端口（默认 `localhost:8080` 仅本机；`server.host: "0.0.0.0"` 或
  `GO_FORM_WEB_ADDR` 环境变量可开放局域网），与窗口监听共享路由与会话，
  桌面端与 Web 端数据一致。
- **登录页 Web 服务启停按钮**：登录页底部新增「Web 服务」卡片（无需登录），
  可运行时启动/停止对外监听并显示地址；后端接口 `/api/desktop/web-service`
  （GET/POST/DELETE，无需登录，仅控制额外监听），`app.Server` 实现
  `config.WebServiceController`，测试覆盖启停、幂等与接口可用性。
- **端口占用自动回退**：Web 服务目标端口被占用时，自动改用同一主机上的空闲
  端口启动，日志与登录页卡片显示实际地址；新增 `TestStartExtraPortFallback` 覆盖。
- **修复专用链接无法访问**：桌面端生成的分享链接此前拼上 127.0.0.1 主监听的
  随机端口，局域网打不开。现在链接基础地址取自对外 Web 监听的实际地址
  （局域网开放时用本机 IP + 实际端口），未启动时回退本机回环地址并在管理后台
  提示；handler 增加 `SetShareURLBase` 注入点，Web 版行为不变。
- **Web 服务默认开放局域网**：桌面端启动/开启 Web 服务时，回环主机
  （localhost/127.0.0.1）自动转为 `0.0.0.0` 监听，局域网电脑默认可访问；
  `GO_FORM_WEB_ADDR` 环境变量可显式覆盖（如强制仅本机）。
- **Web 服务启停仅限本机**：对外（局域网）监听通过 `lanHandler` 屏蔽
  `/api/desktop/*`（返回 403），局域网页面隐藏启停按钮，连线用户无法通过
  网页关闭本机 Web 服务；本机桌面窗口（127.0.0.1）不受影响。
- **Windows NSIS 打包支持**：`make wails-package-win` 构建前检查 `makensis`，
  缺失时给出明确安装指引；新增 `make wails-install-nsis`
  （`brew install makensis`），`make wails-install-tools` 顺带报告 NSIS 状态。
  已在本机安装 NSIS 并验证 `wails build -platform windows/amd64 -nsis` 流程。

### 2026-08-25 文档整理

#### Changed
- 重写 `README.md`、`QUICKSTART.md`、`PROJECT.md`、`MULTI_CONFIG_GUIDE.md`，统一为当前仓库口径。
- 更新 `docs/REPO_MAINTENANCE.md` 与 `docs/cleanup/*`，把阶段日志和现状对齐。
- 归档历史修复/总结类 Markdown，减少根目录噪音。

### 2026-08-25 绩效考核模块（评分体系重构 + 结果分析）

#### Added
- **任意有序评分人列表**：考核定义由固定“评分/审核/确认”三段改为 `reviewers: [{role, weight}]`，管理员可在前端增删/排序评分人，顺序即评分顺序（默认 0.4/0.3/0.3）。
- **表单评分声明 `scoring`**：可在表单 YAML 用 `mode/group/score_field/weight_field` 声明评分模式，支持 `single`（每评分人一个总分）、`item_avg`（逐项简单平均）、`item_weighted`（逐项按权重汇总）；切换打分方式只改配置、不改评分代码。
- **逐项打分（item 模式）**：评分人对表单评分项（`score_field` 所在的 repeated_group 每行）各打 0-100 分，系统按 `weight_field` 加权（或无权重简单平均）汇总为该评分人的分，再按评分人权重得到最终分；逐项明细存入 `assessment_records.scores.details`。
- **最终汇总展示**：评审详情与员工“我的考核”增加加权汇总公式明细（`Σ(得分×权重)÷Σ(权重)`）。
- **考核结果页签（管理员）**：`/api/assessment/results` 返回所有人员结果（姓名/部门/状态/各评分人/最终得分/等级/名次），前端支持按列排序、按部门/状态/等级筛选、等级分布统计。
- **结果导出 CSV**：`/api/assessment/results/export` 导出当前周期结果（含各评分人得分、最终分、等级、名次）。
- **A/B/C/D 强制分布**：考核定义新增 `gradeConfig`（`enabled/group_by/rules`），对“已确认”记录按最终得分在比较组（部门或全员，`group_by`）内排序后按比例分布；未确认记录暂不参与。有独立等级编辑区与分布统计。

#### Changed
- **评分状态机**：`submitted → scored → approved → finalized` 改为 `submitted → grading → finalized`，可支持任意人数评分链。
- **自评跳过**：若记录所属人角色正好是某评分人（自己评自己），自动跳过该级，并按剩余评分人权重归一化汇总。
- **评分结果存储**：评分结果存 `assessment_records.scores` JSON（key=`stage_N`），不再回写表单行的“得分”列；员工自评表在评审页只读展示。
- **`normalizePayloadArray`**：兼容 `[]map[string]interface{}`，避免逐项汇总漏算。
- **`validateItemScores`**：为空（未提交行）的评分组不再强制要求打分。

#### Data / Migration
- `assessment_records` 增加 `scores` 列（JSON）。
- `assessment_periods` 增加 `grade_config` 列（JSON）。
- 老库启动时通过 `ALTER TABLE` 自动补齐上述列。

#### Other (本轮工作区)
- 用户/角色/部门/管理范围界面与用户管理页优化。
- 热重载配置 `.air.toml`（`make air`），开发调试更高效。
- `README.md` / `AGENTS.md` 更新，补充考核评分、表单 `scoring`、结果导出与等级分布说明。
