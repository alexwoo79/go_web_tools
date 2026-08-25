---
name: forms-go
description: 生成 go_web_tools（go_form_web-vue）项目的 YAML 表单定义（含 repeated_group 表格），输入可以是 Excel/CSV 文件，也可以是自然语言描述（如「构造一个员工周末活动计划调研表」）。只负责生成 YAML，不启动/不部署 Go 服务。当用户说「上传 Excel 生成表单 YAML」「把这份 xlsx 转成表单配置」「构造一个 XX 表单」或要求生成表单定义时使用。
---

# Excel 转表单 YAML

本 skill 只做一件事：**把 Excel/CSV 转换为一套 YAML 表单定义**。不启动 Go 服务、不写入配置文件、不做部署。

用 `scripts/` 里的真实脚本交互分析，不要只凭经验猜结构。先安装依赖：

```bash
python3 -m pip install -r skills/forms-go/scripts/requirements.txt
```

## 核心流程

1. 获取 Excel 文件路径（用户可能给出文件或附件）。
2. **分析结构**：运行 `python3 skills/forms-go/scripts/analyze_excel.py <文件> --max-rows 10`，
   阅读报告里的表头行、合并单元格、每列样例与推断（可用 `--json` 拿结构化结果）。
   重点核对：表头行是否正确、有没有「表头为空回退分组标题」的列、百分比/序号等特殊列。
3. **交互确认**：把报告中的推断展示给用户。对拿不准的列（如回退列、选项列），
   用 `excel_to_yaml.py` 的参数修正（`--label D:项目名称`、`--type`、`--text`、`--select`、`--required`、
   `--header-row`、`--sheet`），必要时用 `--max-rows` 看更多行再定。
4. **生成 YAML**：`python3 skills/forms-go/scripts/excel_to_yaml.py <文件> --title ... --category ... --output <路径>.yaml`，
   检查 stderr 的字段决策摘要与 warnings。
5. **交付**：向用户展示生成的 YAML 内容与输出路径，确认无误后结束。加载到 Go 程序是仓库侧/用户手动操作，
   不属于本 skill 职责（可提示：把 YAML 放进仓库根目录会被自动加载，或通过管理后台「新增表单」粘贴）。

## 脚本

- `analyze_excel.py`：输出表格结构报告（工作表、合并单元格、逐行明细、每列样例与推断、表头回退提示）。
- `excel_to_yaml.py`：按推断规则 + 参数覆盖生成 YAML；`--json` 返回结构化结果；`--output` 写文件。
- `lib_excel.py`：共享解析库（表头识别、合并标签回退、类型推断、拼音字段名）。
- `validate_form_yaml.py`：校验 YAML 是否符合项目 schema（字段类型、必填、options、repeated_group、权重约束等），生成后必跑。

多区块表格（如考核表的「重点任务 / 日常任务」两个表）用 `--repeated-group` 模式生成：

```bash
python3 excel_to_yaml.py 考核表.xlsx \
  --title 员工绩效季度考核目标责任书 --category hr --name jixiao_2026q2 \
  --repeated-group --group-by 类别 \
  --drop D --label "E:单项权重" \
  --table-name "重点（专项）工作任务:key_tasks" --table-name "日常工作任务:daily_tasks" \
  --weight-field 单项权重 --weight-limit 1 --weight-total-limit 1 \
  --required 考核指标 --default-rows 3
```

`--group-by` 指定分组列（列字母/数字/标签），按该列值（含合并单元格）把数据行分成多个
`repeated_group` 表格；`--drop` 跳过列（如已删掉的「权重」列）、`--table-name` 指定表格字段名、
`--weight-*` 生成权重合计约束。

自动识别能力：表头上方「标签：值」信息行（如 `部门：设计研究部`）会生成前置 text 字段
（部门/岗位/姓名等），可用 `--no-info-fields` 关闭；信息行与合并的分节标题行不会干扰表头定位。

解析规则与推断关键字（表头 → 字段）见 `references/yaml-schema.md` 的附录，或直接读 `lib_excel.py`。

## 评分声明（考核类表单可选）

若表单是考核/绩效类（含「考核指标 + 得分 + 权重」的 repeated_group），在生成的 YAML 里追加 `scoring:` 块，
声明“每个评分人如何打分”。评分引擎只读此配置，改表单不用改评分代码。

```yaml
scoring:
  mode: "item_weighted"         # single=每评分人一个总分；item_avg=逐项简单平均；item_weighted=逐项按权重汇总
  group: ""                     # 留空=所有含 score_field 的 repeated_group 逐项打分；填一个分组名则只用该组
  score_field: "de_fen"         # 每项得分字段名（须存在于评分项表格 group_fields）
  weight_field: "dan_xiang_quan_zhong"  # 每项权重字段名（item_weighted 用，无则回退简单平均）
```

- `mode: single`：每个评分人对一条记录打一个总分（0-100），与表格结构完全解耦。
- `mode: item_avg / item_weighted`：评分人对每个考核指标逐项打分；`score_field` 是每行得分列，
  `weight_field` 是该行权重列（`item_weighted` 用）；系统先汇总为该评分人的分，再按评分人权重得到最终分。
- `group` 留空时对所有含 `score_field` 的 repeated_group 逐项打分（如“重点工作 + 日常任务”都算）；
  只评某一组就填该组字段名。
- 评分人、权重、A/B/C/D 等级分布（`reviewers`、`gradeConfig`）在**考核定义页**由管理员配置，**不进表单 YAML**。

结合上方考核表的例子，在 `forms[0]` 下加：

```yaml
    scoring:
      mode: item_weighted
      group: ""
      score_field: de_fen
      weight_field: dan_xiang_quan_zhong
```

## 自然语言 → 表单 YAML

用户用文字描述需求时（例如「构造一个表单，收集员工周末活动计划调研表」），按以下步骤生成：

1. **拆解字段**：从需求中提取字段，套用常见字段约定：
   - 姓名→text、手机/电话→tel、邮箱→email、日期/时间→date/time、金额/数量/分数→number
   - 评价/意见/说明/备注→textarea；有限选项（是/否、类型、活动）→select/radio/checkbox
   - 无法确定选项的列→text；带多个同类明细（如任务列表）→repeated_group
   - 若属于考核/绩效（要“按指标打分”），再补 `scoring:` 声明块（见上文）
2. **命名**：`name` 用拼音小写下划线（姓名→xing_ming），`label` 用中文，title/category/status 补全。
3. **生成 YAML**：直接写出 `forms:` 结构（schema 见 `references/yaml-schema.md`）。
4. **校验**：`python3 skills/forms-go/scripts/validate_form_yaml.py <文件>.yaml`，
   有错误就修正后重新校验，直到通过。
5. **交付**：展示 YAML 与输出路径，确认后结束。加载到 Go 程序是仓库侧/用户手动操作。

拿不准的字段类型或选项，先展示设计给用户确认再定稿，不要直接输出。

需要「选择用户/部门/角色」的字段，用动态选项 `options_from: users|departments|roles`
（见 `references/yaml-schema.md`），不要手工抄名单。

## 约束

- 只生成 YAML：不启动服务、不写入/修改任何配置文件、不做部署。
- `name` 是表单唯一标识，生成后不可改；输出前和用户确认字段与命名。
- 字段类型只使用项目支持集合：text、email、tel、number、textarea、select、checkbox、radio、date、time、range，
  以及表格行字段 `repeated_group`（`group_fields` + `default_rows`/`min_rows`/`max_rows`，见 `references/yaml-schema.md`）。
- 表单级可选键：`weight_sum_total_limit`（表格权重合计上限）、`scoring`（评分声明，见上文），
  以及动态选项 `options_from`（users/departments/roles）。不要写 `permissions` 等不支持键。
- 若解析结果明显不合理（如识别错表头），展示推断依据并让用户调整，而不是直接输出。
