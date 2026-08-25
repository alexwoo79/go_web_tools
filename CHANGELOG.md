# Changelog

记录本项目主要功能与优化变更。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本参考 [SemVer](https://semver.org/lang/zh-CN/)。

## [Unreleased]

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
