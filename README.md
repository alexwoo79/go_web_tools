# Go Web 表单系统/数据制图 - README

[TOC]

## 📋 概述

一个基于 Go 语言和 SQLite 的 Web 表单系统，可以通过 YAML 文件定义 HTML 表单并收集数据。

## ✨ 特性

- ✅ 通过 YAML 文件定义表单
- ✅ 支持多种表单字段类型
- ✅ 使用 SQLite 数据库存储数据
- ✅ 自动创建数据表
- ✅ 支持文件保存
- ✅ 响应式 UI 设计
- ✅ RESTful API 接口

## 🚀 快速开始

### 安装依赖

```bash
go mod download
cd vue-form && npm ci
```

### 推荐命令

```bash
make api      # 只跑 Go 后端
make web      # 只跑 Vue 前端开发服务器
make dev      # 构建内嵌前端并启动本地二进制
make build    # 构建带内嵌前端的本机版本
```

### 访问应用

打开浏览器访问: http://localhost:8080

## 📝 配置文件

配置文件使用 YAML 格式：

```yaml
server:
  port: 8080
  host: "localhost"

database:
  path: "data/data.db"
  type: "sqlite"

forms:
  - name: "user_registration"
    title: "用户注册"
    description: "用户注册表单"
    category: "general"
    pinned: true
    sort_order: 10
    priority: "high"      # high | medium | low
    status: "published"   # draft | published | archived
    publish_at: "2026-03-20 09:00:00"
    expire_at: "2026-12-31"
    fields:
      - name: "username"
        label: "用户名"
        type: "text"
        required: true
```

管理排序规则（已内置）：

1. `pinned=true` 置顶优先
2. `status` 顺序：`published` > `draft` > `archived`
3. `sort_order` 升序（越小越靠前）
4. `priority` 顺序：`high` > `medium` > `low`
5. `publish_at` 降序（更新的更靠前）
6. `name` 升序兜底，保证稳定顺序

## 📋 表单字段类型

| 类型 | 说明 |
|------|------|
| text | 文本输入框 |
| email | 邮箱输入框 |
| tel | 电话输入框 |
| number | 数字输入框 |
| textarea | 多行文本框 |
| select | 下拉选择框 |
| checkbox | 复选框 |
| radio | 单选框 |
| date | 日期选择器 |
| time | 时间选择器 |

## 📂 项目结构

```
go-web/
├── cmd/
│   └── server/     # Web 服务器
├── internal/
│   ├── config/     # 配置管理
│   ├── handler/    # HTTP 处理器
│   ├── models/     # 数据模型
│   └── utils/      # 工具函数
├── ui/
│   ├── templates/  # HTML 模板
│   ├── static/     # 内嵌静态资源
│   └── frontend/   # 内嵌 Vue 构建产物
├── data/           # 数据文件
├── config.yaml     # 配置文件
└── go.mod          # Go 模块
```

更多仓库整理、运行期/开发期文件清单与删除流程请参阅：
[docs/REPO_MAINTENANCE.md](docs/REPO_MAINTENANCE.md)

## 🛠️ 开发

### 最小操作

前后端分离调试是默认推荐方式：

```bash
# 终端 1
make api

# 终端 2
make web
```

这种模式下前端走 Vite 开发服务器，`/api` 会自动代理到本地 Go 服务。

如果需要按接近发布态的一体化方式验证：

```bash
make dev
```

这个命令会先执行前端构建，再把产物内嵌到 Go 二进制中启动，适合检查接近发布态的行为。

### 构建项目

推荐直接使用 Make：

```bash
make build
make windows
make all
make package
```

底层仍然调用一体化脚本 [build.sh](/Users/crccredc/Documents/github/go_form_web-vue/build.sh)，它会先构建前端，再把产物同步到内嵌目录后编译 Go 二进制。

如果你需要直接调用脚本，也可以使用：

```bash
./build.sh              # 构建本机版本
./build.sh windows      # 构建 Windows 版本（bin/go-web.exe）
./build.sh all          # 同时构建本机 + Windows
```

### Docker 发布

当前推荐方式是继续使用“前端内嵌到 Go 二进制”的单容器发布模式：

```bash
make docker-build
make docker-up
```

这样容器里只需要：

- 后端可执行文件
- 配置文件
- 数据目录挂载

不需要额外维护单独的前端静态目录容器。

### 补充说明

如果只是临时验证 Go 服务本身，仍然可以直接运行：

```bash
go run ./cmd/server --config ./config.yaml
```

但日常开发和发布更建议统一使用 `make api`、`make web`、`make dev`、`make build` 这组入口。

### 运行测试

```bash
go test ./...
```

## 📄 许可证

MIT License
# go_form_web

## 📊 数据分析与制图（使用说明）

本项目内置数据分析与制图功能，前端提供两个主要入口：

- **数据分析工作台（Workbench）**：适合通过上传 CSV/样例数据进行可视化探索与试验。
  - 支持可视化配置（图表类型、字段映射、主题等）。
  - 支持在表格预览中进行内联编辑（使用 ag-grid），编辑后可点击“保存”将变更持久化到后台数据集（PUT /api/admin/analytics/datasets/{id}），随后构建时会使用已保存的数据。
  - 预览表格支持分页（每页 5/10/20/50/全部）和折叠视图。

- **表单分析页面（Form Analytics）**：直接使用系统已收集的表单提交数据生成图表，预览为只读（与 Workbench 风格一致），便于快速从真实提交数据建图。

主要功能与 API：

- 构建图表（通用/甘特图）
  - 使用已上传数据集构建：POST /api/admin/analytics/build  (body 包含 `datasetId`, `chartKind`, `config` 等)
  - 使用表单数据构建：POST /api/admin/analytics/forms/{formName}/build
  - 甘特图专用构建接口：POST /api/admin/analytics/forms/{formName}/gantt/build

- 预览与数据集管理
  - 获取数据集（含预览页）：GET /api/admin/analytics/datasets/{id}?full=1
  - 更新数据集的行（保存预览编辑）：PUT /api/admin/analytics/datasets/{id}  （body: { rows: [][]string }）
  - 表单预览（用于 Form 页）：GET /api/admin/analytics/forms/{formName}/preview?full=1

UI 行为说明：

- Workbench 中的表格支持编辑并保存；Form 页面为只读预览以避免误修改。
- 导出图片（PNG）由图表工具栏提供（ChartToolbar），界面上的“导出 PNG”按钮已移除以避免重复。
- 甘特图支持显示任务详情（`showTaskDetails`）、显示总周期统计（总周期天数）等配置，均可通过字段映射与构建选项控制。
- 为提升大数据量场景的可用性，服务器对预览提供了分页支持（query 中的 page/size），前端默认分页大小为 5（Form 页）或可调（Workbench）。

打包与性能建议：

- 生产构建会将大型依赖（如 echarts、ag-grid）打包为独立的 vendor chunk；若要进一步减小首屏体积，请考虑：
  - 动态 import (`import()`) 懒加载 `GanttChart`, `ChartCanvas`, `AgGridVue` 等仅在少数场景使用的组件；
  - 将不常用的功能拆分为异步路由或按需加载模块。

示例：在本地调试前端与后端（前后端分离）

```bash
# 在一个终端运行后端
make api

# 在另一个终端运行前端开发服务器
make web
```

更多高级打包/部署说明参考上文的“构建项目”与 Docker 小节。
