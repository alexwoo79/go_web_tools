# Analytics 工作台能力抽取整合 — 详细实施 Plan

> **文档版本**：v1.0 · 2026-04-21
> **依赖上下文**：[ECHARTS_INTEGRATION_ANALYSIS.md](ECHARTS_INTEGRATION_ANALYSIS.md)
> **策略**：能力抽取型，以当前仓库为唯一主应用，不保留双应用壳

---

## TL;DR

从 `go_echarts_tools` 抽取 CSV/XLSX 解析 + 图表 builder 层，在 `go_form_web-vue` 内组建 `internal/analytics` 子域，对接管理员 API，Vue SPA 新增图表分析工作台页面。四个阶段独立可回滚，优先支持基于现有表单数据的统计分析，上传文件分析作为补充能力。

---

## 一、分阶段任务清单

### Phase 1 — 后端能力抽取

> 依赖：无，可独立上线
> 目标：后端具备接收建图请求并返回 ECharts option 的完整能力

| # | 任务 | 说明 | 来源参考 |
|---|---|---|---|
| 1.1 | 新建 `internal/analytics/model/types.go` | 定义 Dataset、ChartDefinition、BuildRequest、BuildResponse、FieldMapping | `go_echarts_tools/internal/model/types.go` |
| 1.2 | 新建 `internal/analytics/dataset/parse.go` | ParseCSV / ParseXLSX / ParseDate（含中文日期/Excel序列数） | `go_echarts_tools/internal/data/parse.go` |
| 1.3 | 新建 `internal/analytics/dataset/store.go` | 内存 Dataset 存储，增加 OwnerID + ExpiresAt + GC goroutine | `go_echarts_tools/internal/data/store.go`（扩展版） |
| 1.4 | 新建 `internal/analytics/viz/registry.go` | ChartBuilder 接口 + 全局注册表 Register / Get | `go_echarts_tools/internal/charts/chart.go` |
| 1.5 | 新建 `internal/analytics/viz/builders_cartesian.go` | bar / line / area / scatter | `go_echarts_tools/internal/viz/viz.go` 节选 |
| 1.6 | 新建 `internal/analytics/viz/builders_items.go` | pie / donut / funnel / gauge | 同上 |
| 1.7 | 新建 `internal/analytics/viz/builders_relation.go` | sankey / graph / chord | 同上 |
| 1.8 | 新建 `internal/analytics/viz/builders_hierarchy.go` | tree / treemap（含循环引用校验） | 同上 |
| 1.9 | 新建 `internal/analytics/viz/builders_radar.go` | radar | 同上 |
| 1.10 | 新建 `internal/analytics/viz/build.go` | `Build(req, dataset)` 分发到注册 builder；`InferDefaults(kind, headers)` 推断推荐映射 | 整合层 |
| 1.11 | 新建 `internal/analytics/viz/validate.go` | `ValidateHierarchy(dataset, labelField, parentField)` 循环检测 | `go_echarts_tools/internal/viz/viz.go` 节选 |
| 1.12 | 新建 `internal/analytics/gantt/builder.go` | GanttBuilder.Build() + Task + Stats（actual vs planned） | `go_echarts_tools/internal/charts/gantt/gantt.go` |
| 1.13 | 新建 `internal/analytics/service/dataset_from_upload.go` | `NewDatasetFromUpload(file, filename, ownerID)` → Dataset | 新建 |
| 1.14 | 新建 `internal/analytics/service/build.go` | `BuildChart(ds, req)` → `map[string]any`（ECharts option） | 新建 |
| 1.15 | 新建 `internal/analytics/handler/analytics.go` | AnalyticsHandler 结构体，6个 HTTP handler 方法 | 新建 |
| 1.16 | **修改** `internal/config/router.go` | 追加 7 条 analytics API 路由（见 API 契约章节） | 改动 |
| 1.17 | **修改** `cmd/server/main.go` | 初始化 `analytics.NewHandler(db, cfg)` 并传入 router | 改动 |
| 1.18 | **修改** `go.mod` | `go get github.com/xuri/excelize/v2`（XLSX 解析） | 改动 |

**Phase 1 验收**
- `curl -X POST .../api/admin/analytics/datasets/upload -F "file=@test.csv"` 返回含 headers 和 preview 的 JSON
- `GET .../api/admin/analytics/definitions` 返回 17 种图表定义
- `go build ./...` 编译无错误
- `go test ./internal/analytics/...` 全部通过

---

### Phase 2 — 最小前端工作台

> 依赖：Phase 1 完成
> 目标：管理员能在浏览器上传 CSV → 选图表类型 → 映射字段 → 查看图表

| # | 任务 | 说明 |
|---|---|---|
| 2.1 | **修改** `vue-form/package.json` | `npm install echarts`，使用 echarts/core 按需导入控制体积 |
| 2.2 | 新建 `vue-form/src/components/analytics/ChartCanvas.vue` | ECharts 实例生命周期（init/dispose/resize）、Props: option+loading、expose: exportPNG() |
| 2.3 | 新建 `vue-form/src/components/analytics/DatasetUpload.vue` | 拖拽/点击上传 CSV/XLSX，调用 POST /api/admin/analytics/datasets/upload，emit uploaded(id, headers, preview) |
| 2.4 | 新建 `vue-form/src/components/analytics/FieldMapper.vue` | Props: headers[], chartKind；动态渲染字段映射表单（x轴/y轴/分组/层级父子等） |
| 2.5 | 新建 `vue-form/src/components/analytics/ChartOptionsPanel.vue` | 图表类型选择器（按 family 分组展示）、标题/颜色/图例等通用配置 |
| 2.6 | 新建 `vue-form/src/views/AnalyticsWorkbenchView.vue` | 页面编排：DatasetUpload → FieldMapper → ChartOptionsPanel → ChartCanvas；调用 POST /api/admin/analytics/build |
| 2.7 | **修改** `vue-form/src/router/index.ts` | 追加路由 `/admin/analytics`（requiresAdmin: true）和 `/admin/analytics/forms/:formName`（requiresAdmin: true） |
| 2.8 | **修改** `vue-form/src/views/AdminView.vue` | 在管理后台顶部或表单列表增加"数据分析"导航入口，链接到 `/admin/analytics` |

**Phase 2 验收**
- 管理员登录后，能完整走通「上传 CSV → 选柱状图 → 映射 x/y 字段 → 渲染图表」流程
- 浏览器无 console 错误
- `npm run build` 成功，dist 增量 ≤ 1.5MB

---

### Phase 3 — 表单数据直连分析

> 依赖：Phase 1 + 2 完成
> 目标：管理员无需上传文件，直接对 SQLite 中已有表单提交数据作图

| # | 任务 | 说明 |
|---|---|---|
| 3.1 | 新建 `internal/analytics/service/dataset_from_forms.go` | `FromFormData(db, formName, fields)` → Dataset；查询 SQLite，最多取 10,000 行，系统字段（_submitted_at, _ip）单独标注类型 |
| 3.2 | **修改** `internal/analytics/handler/analytics.go` | 追加 HandleGetFormSchema 和 HandleBuildFromForm 两个方法 |
| 3.3 | **修改** `internal/config/router.go` | 追加 `GET /api/admin/analytics/forms/{formName}/schema` 和 `POST /api/admin/analytics/forms/{formName}/build` |
| 3.4 | 新建 `vue-form/src/views/FormAnalyticsView.vue` | 调用 schema API 展示字段列表和推荐图表；点击推荐即填充 FieldMapper；调用 POST .../forms/:formName/build |
| 3.5 | **修改** `vue-form/src/views/AdminView.vue` | 在每条表单记录旁增加"分析"按钮，跳转到 `/admin/analytics/forms/:formName` |

**Phase 3 验收**
- 管理员点击某表单"分析"入口，自动获取字段推荐
- 选择折线图后点击构建，直接渲染基于 SQLite 数据的图表，无需上传文件

---

### Phase 4 — 高级图表与导出能力

> 依赖：Phase 2 + 3 完成，可分多个 PR 独立上线

| # | 任务 | 说明 |
|---|---|---|
| 4.1 | 新建 `vue-form/src/components/analytics/GanttChart.vue` | 专用甘特图渲染组件，对接甘特图 ECharts option（使用 ECharts 自定义系列模拟甘特） |
| 4.2 | 新建 `vue-form/src/components/analytics/ChartToolbar.vue` | 导出 PNG、复制 ECharts option JSON、全屏切换 |
| 4.3 | **修改** `vue-form/src/components/analytics/ChartCanvas.vue` | 补全 exportPNG / exportHTML 实现 |
| 4.4 | 新建 `vue-form/src/components/analytics/ChartSharePanel.vue` | 可选：分享当前图表配置（序列化 config 到 URL query param） |

**Phase 4 验收**
- 点击导出 PNG，正确下载图片文件
- 甘特图正确渲染任务条和统计区域

---

## 二、文件级改动清单

### 新建文件（共 23 个）

```
internal/analytics/model/types.go
internal/analytics/dataset/parse.go
internal/analytics/dataset/store.go
internal/analytics/viz/registry.go
internal/analytics/viz/build.go
internal/analytics/viz/validate.go
internal/analytics/viz/builders_cartesian.go
internal/analytics/viz/builders_items.go
internal/analytics/viz/builders_relation.go
internal/analytics/viz/builders_hierarchy.go
internal/analytics/viz/builders_radar.go
internal/analytics/gantt/builder.go
internal/analytics/service/dataset_from_upload.go
internal/analytics/service/dataset_from_forms.go       ← Phase 3
internal/analytics/service/build.go
internal/analytics/handler/analytics.go
vue-form/src/views/AnalyticsWorkbenchView.vue
vue-form/src/views/FormAnalyticsView.vue               ← Phase 3
vue-form/src/components/analytics/ChartCanvas.vue
vue-form/src/components/analytics/DatasetUpload.vue
vue-form/src/components/analytics/FieldMapper.vue
vue-form/src/components/analytics/ChartOptionsPanel.vue
vue-form/src/components/analytics/ChartToolbar.vue     ← Phase 4
```

### 修改文件（共 6 个）

| 文件 | 改动内容 | 所属阶段 |
|---|---|---|
| `go.mod` | 新增 `github.com/xuri/excelize/v2` 依赖 | Phase 1 |
| `internal/config/router.go` | 追加 9 条 analytics 路由；引入 analyticsHandler | Phase 1 + 3 |
| `cmd/server/main.go` | 初始化 AnalyticsHandler，传入 router | Phase 1 |
| `vue-form/package.json` | 新增 echarts 依赖 | Phase 2 |
| `vue-form/src/router/index.ts` | 追加 2 条 analytics 页面路由 | Phase 2 |
| `vue-form/src/views/AdminView.vue` | 增加数据分析入口链接 + 表单"分析"按钮 | Phase 2 + 3 |

### 不改动的核心文件（安全边界）

```
internal/handler/handler.go        ← 不动，现有业务路由完全独立
internal/models/database.go        ← 不动，service 层通过已有接口调 Query()
internal/config/config.go          ← 不动
ui/assets.go                       ← 不动
vue-form/src/stores/auth.ts        ← 不动，analytics 页面复用已有 isAdmin() 守卫
```

---

## 三、API 契约草案

> 所有 analytics API 均挂在 `/api/admin/analytics/` 前缀下，接受 Cookie session 鉴权，非管理员返回 `403`。

---

### 3.1 上传数据集

```
POST /api/admin/analytics/datasets/upload
Content-Type: multipart/form-data
```

**Request**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `file` | File | ✓ | CSV 或 XLSX，最大 10MB |

**Response 200**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "data.csv",
  "source": "upload",
  "headers": ["日期", "距离", "配速"],
  "preview": [
    ["2026-01-01", "5.0", "6:30"],
    ["2026-01-03", "10.0", "5:50"]
  ],
  "rowCount": 42,
  "expiresIn": 3600
}
```

**Errors**

| Code | 场景 |
|---|---|
| 400 | 非 CSV/XLSX 文件，或文件为空 |
| 413 | 超过 10MB |
| 422 | 解析失败（损坏文件）|
| 500 | 服务内部错误 |

---

### 3.2 获取数据集详情

```
GET /api/admin/analytics/datasets/{id}
```

**Response 200**

```json
{
  "id": "550e8400-...",
  "name": "data.csv",
  "source": "upload",
  "headers": ["日期", "距离", "配速"],
  "preview": [["2026-01-01", "5.0", "6:30"]],
  "rowCount": 42,
  "createdAt": "2026-04-21T10:00:00Z",
  "expiresAt": "2026-04-21T11:00:00Z"
}
```

**Errors**：403（非该数据集 owner）、404（不存在或已过期）

---

### 3.3 删除数据集

```
DELETE /api/admin/analytics/datasets/{id}
```

**Response**：204 No Content
**Errors**：403、404

---

### 3.4 获取图表类型定义

```
GET /api/admin/analytics/definitions
```

**Response 200**

```json
{
  "definitions": [
    {
      "kind": "bar",
      "label": "柱状图",
      "family": "cartesian",
      "description": "适合多类目数值对比",
      "fields": [
        {"key": "xAxis",  "label": "X 轴字段", "required": true},
        {"key": "yAxis",  "label": "Y 轴字段", "required": true},
        {"key": "series", "label": "分组字段", "required": false}
      ]
    },
    {
      "kind": "line",
      "label": "折线图",
      "family": "cartesian",
      "description": "适合时间趋势分析",
      "fields": [
        {"key": "xAxis",  "label": "X 轴字段", "required": true},
        {"key": "yAxis",  "label": "Y 轴字段", "required": true},
        {"key": "series", "label": "分组字段", "required": false}
      ]
    },
    {
      "kind": "pie",
      "label": "饼图",
      "family": "items",
      "description": "适合占比分析",
      "fields": [
        {"key": "nameField",  "label": "名称字段", "required": true},
        {"key": "valueField", "label": "数值字段", "required": true}
      ]
    },
    {
      "kind": "tree",
      "label": "树图",
      "family": "hierarchy",
      "description": "适合层级关系展示",
      "fields": [
        {"key": "labelField",  "label": "节点名称字段", "required": true},
        {"key": "parentField", "label": "父节点字段",   "required": true},
        {"key": "valueField",  "label": "数值字段",     "required": false}
      ]
    }
  ]
}
```

> 共 17 种图表类型，按 family 分组：cartesian（bar/line/area/scatter）、items（pie/donut/funnel/gauge）、relation（sankey/graph/chord）、hierarchy（tree/treemap）、radar、gantt

---

### 3.5 构建图表（通用入口）

```
POST /api/admin/analytics/build
Content-Type: application/json
```

**Request**

```json
{
  "datasetId": "550e8400-...",
  "chartKind": "line",
  "config": {
    "xAxis":  "日期",
    "yAxis":  "距离",
    "series": "",
    "title":  "跑步距离趋势"
  }
}
```

**Response 200**

```json
{
  "option": {
    "title":  { "text": "跑步距离趋势" },
    "xAxis":  { "type": "category", "data": ["2026-01-01", "..."] },
    "yAxis":  { "type": "value" },
    "series": [{ "type": "line", "data": [5.0, 10.0] }]
  }
}
```

**Errors**：400（字段映射缺失）、404（datasetId 不存在）、422（构建失败）

---

### 3.6 校验层级图结构

```
POST /api/admin/analytics/validate-hierarchy
Content-Type: application/json
```

**Request**

```json
{
  "datasetId":   "550e8400-...",
  "labelField":  "name",
  "parentField": "parent",
  "valueField":  "amount"
}
```

**Response（有效）**

```json
{ "valid": true, "errors": [] }
```

**Response（无效）**

```json
{
  "valid": false,
  "errors": ["循环引用: A → B → C → A", "缺失父节点: '部门X'"]
}
```

---

### 3.7 获取表单可分析字段信息（Phase 3）

```
GET /api/admin/analytics/forms/{formName}/schema
```

**Response 200**

```json
{
  "formName": "running",
  "title":    "跑步训练记录",
  "rowCount": 45,
  "fields": [
    {"name": "_submitted_at",    "type": "datetime", "label": "提交时间",   "system": true},
    {"name": "running_distance", "type": "number",   "label": "跑步距离",   "system": false},
    {"name": "total_time",       "type": "text",     "label": "总用时",     "system": false},
    {"name": "average_pace",     "type": "text",     "label": "平均配速",   "system": false}
  ],
  "recommendations": [
    {
      "chartKind": "line",
      "reason":    "time_series",
      "label":     "距离趋势图",
      "config":    { "xAxis": "_submitted_at", "yAxis": "running_distance" }
    },
    {
      "chartKind": "scatter",
      "reason":    "numeric_pair",
      "label":     "距离与配速散点图",
      "config":    { "xAxis": "running_distance", "yAxis": "average_pace" }
    }
  ]
}
```

**Errors**：404（表单不存在）

---

### 3.8 基于表单数据构建图表（Phase 3）

```
POST /api/admin/analytics/forms/{formName}/build
Content-Type: application/json
```

**Request**（无 datasetId 字段，数据来自 SQLite）

```json
{
  "chartKind": "line",
  "config": {
    "xAxis": "_submitted_at",
    "yAxis": "running_distance",
    "title": "跑步距离趋势"
  }
}
```

**Response 200**：同 3.5（返回 ECharts option object）
**Errors**：404（表单不存在）、400（字段不存在或类型不兼容）

---

### API 路由汇总

| Method | Path | Auth | 所属阶段 |
|---|---|---|---|
| POST | `/api/admin/analytics/datasets/upload` | Admin | Phase 1 |
| GET | `/api/admin/analytics/datasets/{id}` | Admin | Phase 1 |
| DELETE | `/api/admin/analytics/datasets/{id}` | Admin | Phase 1 |
| GET | `/api/admin/analytics/definitions` | Admin | Phase 1 |
| POST | `/api/admin/analytics/build` | Admin | Phase 1 |
| POST | `/api/admin/analytics/validate-hierarchy` | Admin | Phase 1 |
| GET | `/api/admin/analytics/forms/{formName}/schema` | Admin | Phase 3 |
| POST | `/api/admin/analytics/forms/{formName}/build` | Admin | Phase 3 |

---

## 四、风险与回滚策略

### 4.1 风险矩阵

| # | 风险描述 | 概率 | 影响 | 缓解措施 |
|---|---|---|---|---|
| R1 | Dataset 内存泄漏（GC goroutine 未正确清理） | 中 | 高 | TTL 默认 1h；GC 每 10min 扫一次；限制最多 100 个活跃 dataset |
| R2 | 恶意上传超大文件 / ZIP bomb .xlsx | 中 | 高 | 硬限 10MB；行数 ≤ 100,000；列数 ≤ 200；扩展名 + MIME 双重校验 |
| R3 | 大表单 SQLite 查询阻塞管理后台 | 低 | 中 | FromFormData 加 `LIMIT 10000`；分析请求走独立 goroutine |
| R4 | ECharts bundle 体积增大（约 +1MB） | 高 | 低 | 使用 `echarts/core` + 按需 `use()` 注册，预估压缩后 +400KB |
| R5 | Builder 产出 option 格式错误，前端白屏 | 中 | 中 | ChartCanvas.vue 增加 try/catch + 用户可见错误提示；后端单测覆盖各图表类型 |
| R6 | excelize 依赖树大，Go 编译变慢 | 中 | 低 | 可接受；必要时用 build tag 剔除 XLSX 支持 |
| R7 | ECharts 甘特图需自定义系列，实现复杂 | 中 | 中 | Phase 4 独立拆分，不阻塞 Phase 1-3 上线 |

---

### 4.2 回滚策略

每阶段均设计为**独立可回滚**，不污染现有功能。

#### Phase 1 回滚（纯后端，最安全）

```bash
# 1. 删除新增文件
rm -rf internal/analytics/

# 2. 恢复 router.go（移除 analytics 路由段）
# 3. 恢复 cmd/server/main.go（移除 analytics handler 初始化）

# 4. 清理依赖
go mod tidy
```

影响范围：仅新建文件被删除，现有 23 条 API 路由、所有表单业务、用户管理不受影响。

#### Phase 2 回滚（前端）

```bash
# 1. 删除新增组件和页面
rm -rf vue-form/src/components/analytics/
rm vue-form/src/views/AnalyticsWorkbenchView.vue

# 2. 恢复 router/index.ts（移除 2 条 analytics 路由）
# 3. 恢复 AdminView.vue（移除分析入口链接）

# 4. 重新构建
npm run build
# echarts 依赖可保留不影响现有 bundle（tree-shaking）
```

#### Phase 3 回滚

```bash
# 1. 删除新增服务文件和页面
rm internal/analytics/service/dataset_from_forms.go
rm vue-form/src/views/FormAnalyticsView.vue

# 2. 恢复 router.go（移除 forms schema/build 路由）
# 3. 恢复 handler/analytics.go（移除 Phase 3 方法）
# 4. 恢复 AdminView.vue（移除表单级"分析"按钮）
```

---

### 4.3 分支与里程碑策略

```
main
 └── feature/analytics
      ├── analytics/phase1-backend    （完成后 tag: analytics-v0.1）
      ├── analytics/phase2-workbench  （完成后 tag: analytics-v0.2）
      ├── analytics/phase3-forms      （完成后 tag: analytics-v0.3）
      └── analytics/phase4-advanced   （完成后 tag: analytics-v1.0）
```

- 每阶段 PR merge 前执行：`go build ./...`、`go test ./...`、`npm run build`
- analytics 路由统一前缀 `/api/admin/analytics/`，便于整体功能开关（一行注释即可禁用）
- 前端通过 AdminView 中的入口链接控制可见性（路由存在但入口隐藏 = 软禁用）

---

### 4.4 前置安全加固建议（与 Phase 1 并行）

以下非 analytics 功能，建议在开发过程中一并处理：

| 项目 | 当前问题 | 建议修复 |
|---|---|---|
| 密码存储 | SHA-256 无盐 | 迁移到 `golang.org/x/crypto/bcrypt` |
| Debug 日志 | 提交时打印原始 data 字段 | 移除或脱敏 `database.go` 里的 debug Print |
| 默认凭据 | `admin/admin123` 硬编码打印到终端 | 首次启动提示修改，或环境变量覆盖 |

---

## 五、验收标准汇总

| 阶段 | 验收操作 | 预期结果 |
|---|---|---|
| Phase 1 | `curl -X POST .../api/admin/analytics/datasets/upload -F "file=@test.csv" -b 'session_id=...'` | 返回 200，含 id/headers/preview |
| Phase 1 | `GET .../api/admin/analytics/definitions` | 返回 17 种图表定义 JSON |
| Phase 1 | `go build ./...` | 编译无错误 |
| Phase 1 | `go test ./internal/analytics/...` | 全部通过 |
| Phase 2 | 管理员登录 → 上传 CSV → 选柱状图 → 映射字段 → 渲染 | 图表正确展示，浏览器无报错 |
| Phase 2 | `npm run build` | 构建成功，dist 增量 ≤ 1.5MB |
| Phase 3 | 管理员点击表单"分析"按钮 → 选推荐折线图 → 构建 | 直接基于 SQLite 数据渲染图表 |
| Phase 4 | 点击导出 PNG | 正确下载图片文件 |
