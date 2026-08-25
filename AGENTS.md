# AGENTS.md — Go Web 表单系统（go_form_web-vue）

Go + Vue3 + SQLite 表单系统：用 YAML 定义表单、自动建表、收集数据、管理后台在线维护配置并热重载。

## 常用命令

```bash
make api        # 只跑 Go 后端（默认 http://localhost:8080）
make web        # 只跑 Vue 开发服务器
make dev        # 构建内嵌前端并本地启动
make build      # 构建 bin/go-web（内嵌前端）
make test       # go test ./...
make docker-up  # docker compose 部署
./release.sh    # 打 tag + 发布 GitHub Release
```

## 代码结构

- `cmd/server/main.go`：入口，加载配置、建表、启动 HTTP。
- `internal/config/`：配置加载与合并（`config.yaml` + `includes: ["*.yaml"]`）、路由。
- `internal/handler/`：HTTP 处理器（登录、表单、提交、管理后台）。
- `internal/handler/assessment.go`：绩效考核模块（考核周期、四层流程记录、评审 API）。
- `internal/models/`：SQLite 动态建表与数据读写。
- `vue-form/src/`：Vue3 前端（views/components/stores/router）。
- `skills/forms-go/`：Codex Skill「forms_go」（Excel/CSV/自然语言 → 表单 YAML），可安装到 `~/.codex/skills/`。
  - `scripts/analyze_excel.py`：交互式分析 Excel 结构（表头/合并单元格/每列推断）。
  - `scripts/excel_to_yaml.py`：生成表单 YAML（支持 `--label`/`--type`/`--required` 等参数覆盖）。
  - `scripts/lib_excel.py`：共享解析库。

## 表单 YAML 规范（摘要）

```yaml
forms:
  - name: "user_registration"        # 唯一标识，创建后不可改
    title: "用户注册表单"
    category: "general"              # general/hr/marketing/survey/project
    status: "published"              # draft | published | archived
    model:
      table_name: "user_registration" # 缺省 form_<name>
    fields:
      - name: "username"
        label: "用户名"
        type: "text"                 # text/email/tel/password/number/textarea/select/checkbox/radio/date/time/range
        required: true
        options: []
        min: 0
        max: 100
```

详细 schema 见 `skills/forms-go/references/yaml-schema.md`。

## Excel → 表单 YAML 工作流

用户要求「上传 Excel 生成表单」时：

1. 读取/上传 Excel（.xlsx/.xls/.csv）。
2. 先运行 `skills/forms-go/scripts/analyze_excel.py <文件>` 看结构报告，确认表头行与特殊列。
3. 用 `skills/forms-go/scripts/excel_to_yaml.py` 生成 YAML；空表头列用 `--label D:名称` 补名，
   拿不准的类型用 `--type`/`--text`/`--select`/`--required` 覆盖。
4. 展示生成的 YAML 与输出路径给用户确认。

**skill 只负责 Excel → YAML**：不启动服务、不写入配置、不部署。加载到 Go 程序是仓库侧手动流程：
把 YAML 放入仓库根目录（`*.yaml` 会被 includes 自动加载）或管理后台「新增表单」粘贴，然后重启/热重载验证。
Go 程序不内置 Excel 解析。

## 约束

- 新增表单优先放独立 YAML（如 `hr_forms.yaml`），不要堆进 `config.yaml`。
- 修改配置前备份；`name` 唯一且不可改；删除表单需用户确认。
- 字段类型只用上述集合；前端 FormView 按类型渲染。
- 支持 `repeated_group` 表格行字段（`group_fields` + `default_rows`/`min_rows`/`max_rows`），
  前端 FormView 渲染为可增删行的表格，提交时校验行内必填字段；参考 `jixiao_2026q2_table.yaml`。
- repeated_group 支持 `weight_sum_field` + `weight_sum_limit`：对该组内字段求和并限制上限
  （如「权重 = 单项权重求和」）；表单级 `weight_sum_total_limit` 约束所有表格合计上限
  （如两个表格合计 ≤ 1，单个表格可占满 1），前后端都会校验。
- 用户/角色目前为 admin/user 两级；表单级权限未实现，生成 YAML 不要写 `permissions` 等不支持的键。
- 绩效考核：角色含 职员(staff)/部门负责人(dept_head)/分管领导(division_leader)/主管领导(top_leader)；
  用户表有 department 字段（从 departments 表下拉选择）；分管/主管领导通过
  `leader_departments` 表设置“管理范围”（多部门），评审按该范围过滤；考核周期在管理后台创建
  并绑定自评表单，员工提交后自动生成考核记录，按 填报→逐级评分→确认 流转
  （`/api/assessment/*`、`/api/admin/departments`、`/api/admin/user-departments`），评审页 `/assessment`。
  **评分人列表由管理员在考核定义里配置**（`reviewers: [{role, weight}]`，有序，可任意增删/排序，
  默认 0.4/0.3/0.3）；每个评分人对一条记录打**一个总分（0-100）**。
  若记录所属人角色正好是某评分人（自己评自己），自动跳过该级并按剩余评分人权重归一化汇总
  （最终分 = Σ(得分×权重)/Σ(权重)）。评分结果存 `assessment_records.scores` JSON（key=`stage_N`），
  不再写回表单行。记录状态为 `submitted`(已填报)/`grading`(评分中)/`finalized`(已确认)。
  表单 YAML 可选 `scoring:` 声明块（`mode/group/score_field/weight_field`）描述评分模式，
  评分引擎只读此配置，改表单不用改评分代码。`mode: single` 时每个评分人打一个总分；
  `mode: item_avg`（逐项简单平均）/ `mode: item_weighted`（逐项按 `weight_field` 加权）时，
  评分人在表单的评分项（`score_field` 所在的 repeated_group，`group` 留空=所有含该字段的表格）每行各打一个 0-100 分，
  系统先汇总为该评分人的分，再按评分人权重得到最终分。
  考核结果接口 `/api/assessment/results`（含等级/名次）与 `/api/assessment/results/export`（CSV）由管理端使用；
  A/B/C/D 强制分布在考核定义 `gradeConfig`（`enabled/group_by/rules`，默认 A0.2 B0.3 C0.4 D0.1）里配置，
  对“已确认”记录按最终得分在比较组（部门或全员）内排序后按比例分布，未确认的先不参与。
- 数据表由 `fields` 动态生成，新增字段会自动 ALTER TABLE 加列。

## 管理后台常用 API

`/api/login`、`/api/forms`、`/api/forms/{name}`、`/api/submit/{name}`、`/api/admin`、`/api/admin/form-config`（GET/POST/PUT/DELETE）、`/api/export/{name}`、`/api/admin/share-links`。
