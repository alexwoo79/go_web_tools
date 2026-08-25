# 项目 YAML 表单 Schema 参考

仓库：`go_form_web-vue`（Go + Vue3 + SQLite + YAML 定义表单）

## 主配置结构（config.yaml）

```yaml
server:
  port: 8080
  host: "localhost"

database:
  path: "data/data.db"
  type: "sqlite"

includes:
  - "*.yaml"          # 自动加载仓库根目录其它 yaml（跳过 config.yaml 自身与 *.example.yaml）

forms:
  - name: "user_registration"
    title: "用户注册表单"
    description: "欢迎注册"
    category: "general"        # general / hr / marketing / survey / project ...
    pinned: false
    sort_order: 10
    priority: "high"           # high | medium | low
    status: "published"        # draft | published | archived
    publish_at: "2026-03-20 09:00:00"
    expire_at: "2026-12-31"
    model:
      table_name: "user_registration"   # 缺省为 form_<name>
    fields:
      - name: "username"
        label: "用户名"
        type: "text"
        placeholder: "请输入用户名"
        required: true
        options: []            # select/checkbox/radio 用
        min: 1                 # number 用（float）
        max: 150
        step: 1
        regex: ""
```

## 字段类型（前端 FormView 支持）

| type | 渲染 | 说明 |
| --- | --- | --- |
| text | 单行输入 | 默认 |
| email / tel | 单行输入 | 浏览器校验格式 |
| password | 单行输入 | type=password |
| number | 数字输入 | 支持 min/max/step |
| textarea | 多行 | |
| select | 下拉 | 需要 options |
| checkbox | 复选组 | 需要 options |
| radio | 单选组 | 需要 options |
| date / time | 日期/时间 | |
| range | 滑块 | min/max 必填 |
| repeated_group | 可增删行表格 | `group_fields` 定义列，支持 `default_rows`/`min_rows`/`max_rows`；行内字段可设 required，提交时校验；`weight_sum_field`+`weight_sum_limit` 可约束组内某数字字段合计上限（如单项权重求和不超过板块权重） |

动态选项（下拉直接引用用户管理数据）：select/checkbox/radio 可写 `options_from` 替代静态 `options`：

```yaml
fields:
  - name: fu_ze_ren
    label: 负责人
    type: select
    options_from: users        # 用户管理中的全部用户名
  - name: bu_men
    label: 部门
    type: select
    options_from: departments  # 部门表中的全部部门
  - name: jiao_se
    label: 角色
    type: select
    options_from: roles        # 普通用户/职员/部门负责人/分管领导/主管领导/管理员
```

`options_from` 取值：`users`、`departments`、`roles`。选项由后端在打开表单时从数据库实时解析。

repeated_group 示例（表格行字段）：

```yaml
forms:
  - name: example_table
    title: 示例
    weight_sum_total_limit: 1   # 表单级：所有表格权重合计上限（两个表格合计 ≤ 1）
    fields:
      - name: key_tasks
        label: 重点（专项）工作任务
        type: repeated_group
        default_rows: 3
        min_rows: 1
        max_rows: 100
        weight_sum_field: dan_xiang_quan_zhong
        weight_sum_limit: 1     # 单表上限（单个表格可占满 1）
        group_fields:
          - name: kao_he_zhi_biao
            label: 考核指标
            type: text
            required: true
          - name: dan_xiang_quan_zhong
            label: 单项权重
            type: number
            min: 0
```

表格行数据提交后以 JSON 数组存储在表单表的 TEXT 列与 `data` 列中。
`weight_sum_limit` 是每个 repeated_group 的权重上限（单个表格可设为 1）；
表单级 `weight_sum_total_limit` 约束所有表格权重合计（如两个表格合计 ≤ 1），前后端都会校验。

## 表单评分声明（可选）

表单可用 `scoring:` 块向考核模块声明“本表单如何被评分”。评分引擎只读此配置，改表单不用改评分代码。
考核类表单（含 考核指标/得分/权重 的 repeated_group 表格）建议加上，否则按默认 `single` 处理。

```yaml
forms:
  - name: example_table
    scoring:
      mode: "item_weighted"             # single | item_avg | item_weighted
      group: ""                         # 留空=对所有含 score_field 的 repeated_group 逐项打分；填写则只用该组
      score_field: "de_fen"             # 每项得分字段名（必须存在于评分项表格的 group_fields）
      weight_field: "dan_xiang_quan_zhong"  # 每项权重字段名（item_weighted 用；无则回退简单平均）
```

评分模式说明：
- `single`：每个评分人对一条记录打一个总分（0-100）。
- `item_avg`：评分人对每个评分项（`score_field` 所在的 repeated_group 每行）打 0-100 分，汇总为简单平均。
- `item_weighted`：同上，但按 `weight_field` 加权汇总；无有效权重时回退简单平均。
- `group`：指定“评分项”所在的 repeated_group；留空则覆盖所有含 `score_field` 的 repeated_group。

评分人列表（`reviewers: [{role, weight}]`，有序可增删）与 A/B/C/D 等级分布（`gradeConfig`）
由考核定义在管理后台配置，**不属于表单 YAML**；表单只需用 `scoring` 声明“怎么打分”。
生成后用 `validate_form_yaml.py` 会校验 `scoring`（mode 合法性、score_field/weight_field 是否存在于评分项表格）。

## 排序与可见性规则（内置）

1. `pinned=true` 置顶
2. `status`：published > draft > archived
3. `sort_order` 升序
4. `priority`：high > medium > low
5. `publish_at` 降序
6. `name` 升序兜底

`expire_at` 到期后停止提交且首页不显示；`status: draft` 不对外显示。

本 skill 只负责生成符合上述 schema 的 YAML；加载/部署由仓库侧手动完成
（把 YAML 放入仓库根目录自动加载，或管理后台「新增表单」粘贴）。

## 附录：表头 → 字段推断规则（与 lib_excel.py 一致）

## 自然语言 → 字段约定

用文字描述生成表单时，按以下约定把需求拆成字段：

- 姓名/名称/部门/岗位/项目→text；手机/电话→tel；邮箱→email；日期→date；时间→time
- 金额/合同额/数量/人数/年龄/得分/评分/预算→number（min 默认 0）
- 评价/意见/说明/内容/总结/备注/建议→textarea
- 有限选项（是/否、类型、活动、性别、状态）→select（单选）或 checkbox（多选）/ radio；选项从描述中提取，不确定就先确认
- 一个字段下有多条同类明细（如「列出工作任务」）→repeated_group + group_fields
- 字段名：中文转拼音小写下划线（姓名→xing_ming）；title 用需求中的表名

生成后用 `validate_form_yaml.py` 校验。

- 表头：第一个只有 1 个非空单元格的行视为大标题；第一个 ≥2 非空单元格的行为表头块起点；
  若下一行非空单元格更多，则当前行是分组行（合并标题），下一行是字段行。
- 字段行单元格为空时：回退到合并单元格分组标题，再回退到分组行（自下而上），并给出警告。
- 字段名：中文转拼音小写、下划线分隔（`姓名` → `xing_ming`）；重复时追加 `_2`、`_3`。
- 必填：表头包含 `*`、`＊`、`必填`、`required`。
- 类型关键字：
  - `日期`→date；`时间`→time；`邮箱/邮件`→email；`电话/手机/联系方式`→tel
  - `得分/分数/评分/分值`→number（min 0、max 100）；样例为百分比时→select/text
  - `序号/编号/工号/行号`→number（min 0，不设上限，样例值不代表后续行）
  - `权重/百分比/比例/占比`：样例全为百分比且 2–12 个去重值→select+options，否则 text
  - `数量/人数/年龄/金额/价格/工作量/公里/里程/时长/分钟`→number（min 0）
  - `评价/意见/描述/说明/内容/总结/自评/建议/心得/体会/汇报/备注/评语/完成情况`→textarea
  - `多选/勾选`→checkbox；`选择/性别/部门/类别/类型/状态/地区/城市/学历/岗位/职位/等级/级别/是否/渠道/方向/选项`→select
  - `姓名/名称/项目/指标/单位/编号/单号/地址/签字/签名/工号`→text
  - 其它列：样例 2–12 个去重短文本（非数字/日期）→select+options，否则 text
- 交互修正：`--label D:新名称` 指定空表头列名，`--type 标签:number:0:100`、`--text`、`--select`、
  `--required`、`--optional` 覆盖推断，`--header-row N` 指定表头行。
- 表格模式：`--repeated-group --group-by 类别` 按分组列把数据行拆成多个 repeated_group 表格；
  `--table-name "标签:字段名"`、`--drop D`（跳过列）、`--default-rows N`、
  `--weight-field 单项权重 --weight-limit 1 --weight-total-limit 1`（生成权重合计约束）。
- 信息字段：表头上方的「标签：值」行（如 `部门：设计研究部`、`岗位：职员`、`姓名：董俊杰`）
  自动生成为前置 text 字段（label 去掉冒号，name 转拼音）；`--no-info-fields` 可关闭。
  这类信息行会被表头定位逻辑自动跳过，不会误当表头。
- 评分检测：若识别到 `得分/评分/分值`（number，min 0 max 100）与 `权重/比例/占比` 数列（考核/绩效类），
  生成的 YAML 应追加 `scoring:` 声明块（见上文「表单评分声明」）。
