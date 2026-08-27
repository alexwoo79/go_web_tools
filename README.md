# Go Web 表单系统

Go + Vue 3 + SQLite 的表单系统，使用 YAML 定义表单、自动建表、支持在线管理配置与热重载。

## 项目状态

- 表单配置支持 `forms`、`includes`、`select/checkbox/radio` 的静态 `options` 和动态 `options_from`
- 前端支持 `repeated_group`、评分声明 `scoring`、权限与结果分析等当前功能
- 后端默认把表单数据写入 SQLite，配置热重载后会自动刷新表单定义

## 快速开始

```bash
go mod download
cd vue-form && npm ci
```

常用入口：

```bash
make api       # 只跑 Go 后端
make web       # 只跑 Vue 前端开发服务器
make air       # Go 后端热重载
make dev       # 构建嵌入式前端并启动本地二进制
make build     # 构建本机二进制
make test      # 运行后端测试
make demo      # 使用 .demo/config.yaml 启动独立演示库
```

默认访问地址是 `http://localhost:8080`。

## 桌面应用（Wails）

项目同时提供 Wails 桌面端：同一套 Go 后端 + Vue 前端，打包为原生窗口应用，
无需手动启动服务或在浏览器打开。

```bash
make wails-dev           # 桌面端开发（Vite 热重载，后端固定 127.0.0.1:8080）
make wails-build         # 构建当前平台桌面应用 → build/bin/
make wails-build-mac     # 构建 macOS 通用 .app
make wails-package-win   # 构建 Windows NSIS 安装包（需 NSIS）
make wails-install-tools # 安装 Wails CLI（已安装则跳过）
```

说明：

- 桌面端代码在仓库根目录：`main.go`（生产）/ `main_dev.go`（`wails dev` 的 `dev` 构建标签）、
  `app.go`（绑定与系统菜单）、`redirector/`（首屏跳转页）、`wails.json`。
- 生产模式后端监听 `127.0.0.1` 随机端口（避免占用冲突），窗口先加载
  `redirector` 页、通过 Go 绑定拿到服务地址后跳转到 `http://127.0.0.1:<port>/`。
  这样 Cookie / 会话 / CSV 导出都运行在真实 HTTP 源上，规避 macOS
  自定义 scheme（`wails://`）不支持 Cookie 的已知问题。
- **可同时启动 Web 服务**：桌面窗口使用回环地址的同时，应用会按
  `config.yaml` 的 `server.host:port` 额外启动一个 Web 监听，**默认监听
  `0.0.0.0`（局域网可访问）**；局域网电脑可通过 `http://<本机IP>:<端口>` 打开。
  如需仅本机访问，用 `GO_FORM_WEB_ADDR=127.0.0.1:<port>` 启动应用（优先级最高）。
  两个监听共享同一路由与会话，Web 端与桌面端数据完全一致。
- **登录页可随时启停**：登录页底部有「Web 服务」卡片，无需登录即可一键
  启动/停止对外 Web 监听，并显示当前地址（局域网地址可直接点击打开）。
  控制接口为 `/api/desktop/web-service`（GET 状态 / POST 启动 / DELETE 停止，
  无需登录；该接口只控制额外监听，不涉及数据访问）。**该功能仅限本机使用**：
  对外（局域网）监听会屏蔽 `/api/desktop/*`（返回 403），局域网页面也不会显示按钮，
  因此连线用户无法通过网页关闭本机的 Web 服务。
- **端口被占用自动换端口**：启动 Web 服务时若目标端口（如 `8080`）已被占用，
  会自动改用同一主机上的空闲端口（日志会打印实际地址，登录页卡片同步显示）。
- **分享链接使用真实监听地址**：桌面端生成专用链接时不再用请求 Host 推断，
  而是取对外 Web 监听的**实际地址**：局域网开放时返回
  `http://<本机IP>:<端口>/s/<token>`（局域网电脑可直接打开）；未开放或未启动时
  返回本机回环地址，管理后台弹窗会提示如何开放。
- 配置解析优先级：`GO_FORM_WEB_CONFIG` 环境变量 > 可执行文件目录下 `config.yaml` >
  当前目录 `config.yaml` > 用户配置目录（如 `~/Library/Application Support/go-form-web`，
  首次运行自动写入内嵌默认配置）。数据库与 `data/` 相对配置所在目录生成。
- 构建桌面端前会先跑 `scripts/sync_frontend.sh` 把 `vue-form/dist` 同步到
  `ui/frontend`，保证内嵌前端是最新构建。

## 配置概览

主配置通常使用 `config.yaml`，并通过 `includes` 合并独立表单文件：

```yaml
server:
  port: 8080
  host: "localhost"

database:
  path: "data/data.db"
  type: "sqlite"

includes:
  - "*.yaml"

forms:
  - name: "user_registration"
    title: "用户注册表单"
    category: "general"
    status: "published"
    model:
      table_name: "user_registration"
    fields:
      - name: "username"
        label: "用户名"
        type: "text"
        required: true
```

常用字段类型：

| 类型 | 说明 |
| --- | --- |
| text / email / tel / password | 单行输入 |
| number | 数字输入，支持 `min/max/step` |
| textarea | 多行输入 |
| select / checkbox / radio | 选择型字段，支持 `options` 或 `options_from` |
| date / time | 日期和时间 |
| range | 滑块 |
| repeated_group | 可增删行的表格字段 |

动态选项：

- `options_from: users` 取用户名列表
- `options_from: departments` 取部门列表
- `options_from: roles` 取角色列表

## 路由与权限

- `/api/register`、`/api/login`、`/api/logout`、`/api/me`
- `/api/forms`、`/api/forms/{name}`、`/api/submit/{name}`、`/api/my/submissions`
- `/api/public/forms/{token}`、`/api/public/submit/{token}`
- `/api/admin/*`、`/api/export/{formName}`、`/api/data/{formName}`、`/api/assessment/*`

当前约定：

- 表单列表、表单页、普通提交接口需要登录
- 公共分享链接走 `/api/public/*`
- 管理接口需要管理员权限

## 目录概览

```
go_web_tools/
├── cmd/server            # 服务入口
├── main.go / app.go      # Wails 桌面端入口
├── wails.json / build/   # Wails 配置与打包资源
├── redirector/           # 桌面端首屏跳转页
├── internal              # 配置、处理器、模型
├── ui                    # 模板和嵌入式前端资源
├── vue-form              # Vue 3 前端源码
├── docs                  # 维护与清理文档
├── skills/forms-go       # Excel -> YAML 辅助 Skill
├── *.yaml                # 表单与配置文件
├── Makefile / build.sh   # 构建入口
└── CHANGELOG.md          # 变更记录
```

仓库整理和历史文档说明见 [docs/REPO_MAINTENANCE.md](docs/REPO_MAINTENANCE.md)，历史过程资料已归档到 [docs/archive/](docs/archive/README.md)。

## 开发提示

- Excel 转 YAML 的工作流在 `skills/forms-go/` 与仓库根目录 `AGENTS.md` 中说明
- 想验证接近发布态的行为，用 `make dev`
- 想看后端热重载，用 `make air`
- 想运行测试，用 `make test`

示例：在本地调试前端与后端（前后端分离）

```bash
# 在一个终端运行后端
make api

# 在另一个终端运行前端开发服务器
make web
```

更多高级打包/部署说明参考上文的“构建项目”与 Docker 小节。

## 发布（Release）

- 脚本 `release.sh` 会优先使用 `gh`（GitHub CLI）创建 Release 并上传 `./bin/*`。如果系统上未安装 `gh`，脚本会回退到使用 GitHub Releases API 上传，此时必须在环境变量中提供 `GITHUB_TOKEN`（拥有 `repo` 权限）。

- 使用示例：

```bash
export GITHUB_TOKEN=ghp_xxx
./release.sh
```

- 在 macOS 上安装 GitHub CLI：

```bash
brew install gh
gh auth login
```

- 注意：确保 `GITHUB_TOKEN` 的权限包含 `repo`（用于创建 Release 和上传资产）。
