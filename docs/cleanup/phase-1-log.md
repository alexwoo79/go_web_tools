# Phase 1 过程记录（主入口文档与历史说明归档）

## 日期
- 2026-08-25

## 目标
- 统一主入口文档为当前仓库口径。
- 把历史修复说明和一次性总结归档到 `docs/archive/`。
- 让路由、命令、配置项和文档保持一致。

## 任务分解（逐项记录）
| 序号 | 文件 | 问题 | 动作 | 证据 | 结果 |
|---|---|---|---|---|---|
| 1 | README.md | 入口说明过旧 | 已更新 | 对照 `internal/config/router.go`、`internal/config/config.go` | done |
| 2 | QUICKSTART.md | 启动命令与口径过时 | 已更新 | 对照 `Makefile` | done |
| 3 | PROJECT.md | 目录说明过旧 | 已更新 | 对照当前仓库树 | done |
| 4 | MULTI_CONFIG_GUIDE.md | 多配置说明过旧 | 已更新 | 对照 `internal/config/config.go` | done |
| 5 | 历史修复与清理说明 | 占据根目录 | 已归档 | `docs/archive/README.md` | done |

## 验证清单
- [x] 文档内无绝对路径。
- [x] 文档内无 file:// 链接。
- [x] 提交/管理接口权限描述与路由一致。
- [x] 根目录历史修复说明已归档到 `docs/archive/`。

## 风险与备注
- 当前文档以代码现状为准，后续若路由再变更，应先改代码，再同步 README / QUICKSTART。

## 下一步
- 更新总台账并继续整理脚本/配置口径。
