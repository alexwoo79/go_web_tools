# 项目目录

这是当前仓库的目录说明，方便快速定位代码、配置和文档。

## 根目录

- `README.md`：项目主入口
- `QUICKSTART.md`：最小启动指南
- `PROJECT.md`：当前目录说明
- `CHANGELOG.md`：主要变更记录
- `config.yaml`：默认运行配置
- `config.example.yaml`：配置样例
- `*.yaml`：独立表单配置
- `Makefile`、`build.sh`、`release.sh`：构建与发布入口
- `docs/`：维护、清理、归档文档
- `skills/forms-go/`：Excel → YAML 辅助 Skill

## 后端

- `cmd/server/main.go`：启动入口、配置加载、数据库初始化、路由装配
- `internal/config/`：配置结构、includes 合并、路由注册
- `internal/handler/`：HTTP 处理器、权限、表单与管理后台逻辑
- `internal/models/`：SQLite 建表、数据读写、迁移逻辑
- `internal/utils/`：表单生成等辅助工具

## 前端

- `vue-form/`：Vue 3 + Vite 源码
- `ui/templates/`：服务端模板
- `ui/static/`：内嵌静态资源
- `ui/frontend/`：构建后的前端产物，供嵌入式运行使用

## 数据与运行时

- `data/`：运行时数据库与导出数据
- `.demo/`：独立演示库相关配置
- `bin/`：本机构建产物

## 文档原则

- 主入口文档只保留最新说明
- 历史修复、过程记录和阶段日志放在 `docs/archive/` 与 `docs/cleanup/`
- 只在对外文档里保留当前有效的命令、路由和配置项
