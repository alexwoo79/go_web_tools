# 清理执行总览

## 目的
- 让清理工作具备可追踪、可审计、可回滚特性。
- 每个阶段都产出过程文档，并进行独立 git 提交。

## 阶段定义
- Phase 0：基线建立（计划、范围、证据入口、提交规范）。
- Phase 1：P0 文档一致性清理。
- Phase 2：脚本整改（release/init/validate）。
- Phase 3：P1 文档与口径统一。
- Phase 4：可选优化（命名统一、历史归档）。

## 文档结构
- docs/cleanup/README.md：执行规范与提交流程。
- docs/cleanup/change-log.md：跨阶段总台账。
- docs/cleanup/phase-<n>-log.md：阶段过程记录（逐项）。

## 每阶段最小记录要求
1. 目标与范围。
2. 变更清单（文件级）。
3. 决策与取舍（含风险）。
4. 验证结果（命令与结论）。
5. 未完成项与下一步。

## git 提交规范
- 单阶段单提交，避免跨阶段混改。
- commit message 建议：
  - docs(cleanup/phaseN): <阶段摘要>
  - chore(cleanup/phaseN): <脚本或配置摘要>
- 阶段完成后更新 docs/cleanup/change-log.md。

## 操作流程
1. 开始阶段：新建或更新 phase 日志，写明目标与任务分解。
2. 执行变更：边改边记录“项-证据-结论”。
3. 阶段自检：补充验证与风险。
4. git add + git commit：仅提交本阶段内容。
5. 更新总台账：记录提交哈希与阶段状态。
