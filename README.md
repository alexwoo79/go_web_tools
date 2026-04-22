# Go Web 表单系统 - README

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
