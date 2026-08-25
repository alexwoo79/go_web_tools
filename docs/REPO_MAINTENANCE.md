# 仓库维护与整理指南

目的：把仓库按“运行期”和“开发期”分层，方便判断哪些文件要保留、哪些可以归档。

## 当前结论

- 后端运行时必需：`cmd/server`、`internal/*`、`ui/`、`config*.yaml`、`*.yaml`
- 前端源码：`vue-form/`
- 构建与发布：`Makefile`、`build.sh`、`release.sh`
- 运行数据：`data/`
- 文档：`README.md`、`QUICKSTART.md`、`PROJECT.md`、`CHANGELOG.md`、`docs/`

## 目录分层

### 运行期

- `cmd/server/*`
- `internal/*`
- `ui/templates/*`
- `ui/static/*`
- `ui/frontend/*`
- `config.yaml`、`config.example.yaml`、`*.yaml`
- `data/`

### 开发期

- `vue-form/`
- `Makefile`
- `build.sh`
- `release.sh`
- `internal/**/*_test.go`

### 归档区

- 历史修复报告、一次性说明、阶段总结放到 `docs/archive/`
- `docs/cleanup/` 只保留清理流程与过程记录

## 整理原则

1. 主入口文档只保留最新说明
2. 历史材料进归档，不和主文档混放
3. 路径示例全部使用仓库相对路径
4. 涉及权限、路由、命令的说明要和代码一致

## 推荐验证

```bash
go test ./...
make api
make web
make dev
```

如果要检查构建态，再补充：

```bash
make build
```
