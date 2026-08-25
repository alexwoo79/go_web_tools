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
