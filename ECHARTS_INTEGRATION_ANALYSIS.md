# go_form_web-vue 与 go_echarts_tools 能力抽取整合分析

## 1. 文档目的

本文档用于记录将 `go_echarts_tools` 的可视化能力按“能力抽取型”方案整合进当前仓库 `go_form_web-vue` 的分析结论。

目标不是直接合并两个完整应用，而是抽取 `go_echarts_tools` 中可复用的数据解析、图表构建和可视化配置能力，接入当前项目既有的：

- Go 后端 API
- Vue SPA 管理后台
- SQLite 业务数据
- YAML 驱动的表单定义体系

本文档用于为下一步详细实施 plan 提供统一上下文。

---

## 2. 当前两个仓库的定位

### 2.1 当前仓库：go_form_web-vue

当前仓库本质上是一个“配置驱动的表单业务系统”，主路径为：

- YAML 定义表单
- Go 启动时加载配置并创建/更新 SQLite 表结构
- Go 暴露登录、表单、提交、管理 API
- Vue SPA 作为前端管理和填写界面
- 构建时将 Vue `dist` 内嵌进 Go 二进制

核心特征：

- 业务主线明确，已形成单体部署模型
- 后端职责偏 API 化
- 前端职责偏 SPA 化
- 已具备用户体系、管理员权限、表单数据持久化能力

### 2.2 外部仓库：go_echarts_tools

外部仓库本质上是一个“轻量级图表工作台”，主路径为：

- 上传 CSV/XLSX 文件
- 解析数据为内存 Dataset
- 自动推断列映射
- 通过 Builder 生成甘特图或通用图表 payload
- 由 Gin + 模板 + 静态 JS 页面渲染交互式图表

核心特征：

- 自带完整 Web 壳子
- 数据默认只存在内存中
- 更像一个独立工具站，而不是一个可直接 import 的纯库
- 价值集中在“数据解析 + builder 机制 + 图表 payload 生成”

---

## 3. 总体整合结论

### 3.1 推荐方案

推荐采用“能力抽取型整合”，不推荐“整仓直接拼接”或“保留双应用壳并行运行”。

最优目标形态为：

- 保留当前仓库作为唯一主应用
- 抽取 `go_echarts_tools` 的后端数据解析和图表构建能力
- 将其接入当前仓库的管理员 API
- 由当前 Vue SPA 新增图表分析工作台页面

### 3.2 不推荐方案

以下方案不建议作为长期方案：

1. 直接把 `go_echarts_tools` 原样并入当前项目
2. 在当前服务中同时保留 Gin 模板页和 Vue SPA 两套 UI
3. 通过 iframe 或平级路径长期挂载一个独立图表站点
4. 将外部仓库直接作为 Go module 依赖引用

原因：

- Web 框架和页面模型不同
- 鉴权与权限模型不同
- 数据存储语义不同
- 构建链和部署方式不同
- 外部仓库并非 library-first 结构

---

## 4. go_echarts_tools 中可复用的能力

### 4.1 数据集模型

可复用内容：

- `Dataset`
- 表头与二维表格行结构
- 列映射配置对象
- 图表配置对象

这部分适合沉淀为当前项目内部的 analytics 领域模型。

### 4.2 CSV/XLSX 解析能力

可复用内容：

- CSV 解析
- XLSX 解析
- 上传文件自动识别
- 表头归一化
- 空行过滤
- 多格式日期解析
- Excel 序列日期兼容

这部分适合迁入当前项目，作为“上传即分析”的基础能力。

### 4.3 Builder 注册机制

可复用内容：

- 图表注册表
- Builder 接口
- 图表类型元信息定义
- 按类型动态选择 builder 进行构建

这部分适合成为当前项目 `analytics/viz` 的核心扩展机制。

### 4.4 图表 payload 生成逻辑

可复用内容：

- 柱状图/折线图/面积图等笛卡尔图构建
- 饼图/环形图构建
- 散点图构建
- 雷达图构建
- 仪表盘构建
- 桑基图/关系图构建
- 树图/矩形树图构建
- 层级结构校验逻辑
- 甘特图任务和统计构建逻辑

这些逻辑非常适合保留在 Go 后端，让前端只负责渲染，不负责聚合计算。

---

## 5. 不建议直接复用的部分

### 5.1 Gin 服务器层

不建议保留：

- `internal/server/server.go`
- `internal/server/handlers.go`
- `internal/server/render.go`

原因：

- 当前项目已经使用 `gorilla/mux` 管理路由
- 当前项目路由已围绕 API + SPA fallback 形成稳定结构
- 再叠加 Gin 只会引入双栈维护成本

### 5.2 模板页面和静态工作台壳子

不建议直接保留：

- `templates/*.tmpl`
- `static/style.css`
- 以模板为核心的页面交互结构

原因：

- 当前项目前端已稳定采用 Vue SPA
- 两套页面体验会割裂
- 模板页不利于和当前鉴权、导航、状态管理整合

### 5.3 内存 Dataset Store 的默认实现

外部仓库当前是进程内 `map + RWMutex` 缓存 Dataset。

这可以作为当前项目的第一阶段临时实现，但不能原样作为长期方案。至少需要补上：

- 所属用户绑定
- 访问控制
- TTL 失效策略
- 清理机制
- 可选持久化能力

### 5.4 外部前端脚本原样迁移

不建议将外部 `chart.js` 和 `viz.js` 全量搬进 Vue 作为核心实现。

可复用的是：

- 工具栏行为思路
- 导出 HTML 思路
- 交互能力设计

不建议复用的是：

- 模板时代的 DOM 组织方式
- 对 `window.GANTT_DATA` / `window.VIZ_DATA` 的全局依赖
- 依赖模板脚本注入的前端结构

---

## 6. 架构兼容性分析

### 6.1 Web 架构差异

当前项目：

- Go 提供 API
- Vue 负责页面和状态管理

外部工具：

- Go 负责 HTTP + HTML 模板渲染 + 静态资源托管

结论：

整合时必须放弃外部工具的 Web 壳，只保留领域能力。

### 6.2 权限模型差异

当前项目已有：

- 登录注册
- 管理员权限
- Cookie 会话
- 管理员专用接口

外部工具默认是开放式工作台。

结论：

任何图表分析能力都应挂到当前项目的管理员权限体系下，不能平级开放。

### 6.3 数据来源模型差异

当前项目数据源：

- YAML 定义的表单结构
- SQLite 中的表单提交数据

外部工具数据源：

- 临时上传的 CSV/XLSX

结论：

整合时应建立统一的 Dataset 抽象，使“上传数据”和“现有业务数据”都能走同一套 builder。

### 6.4 ECharts 版本差异

外部工具中：

- 甘特图页面使用 ECharts 5
- 通用图形页面使用 ECharts 6

结论：

整合后应统一为单一版本，推荐统一为 ECharts 6，避免双版本并存。

---

## 7. 目标整合架构

建议在当前仓库中新增 `analytics` 子域，形成如下职责划分：

### 7.1 后端分层

- `internal/analytics/model`
  - 图表领域模型
  - Dataset、Config、Definition、Result 等

- `internal/analytics/dataset`
  - CSV/XLSX 解析
  - 日期解析
  - Dataset 存储接口与实现

- `internal/analytics/viz`
  - 通用图表 builder 注册表
  - 各类图表构建器
  - 层级校验

- `internal/analytics/gantt`
  - 甘特图 builder
  - 任务构建和统计逻辑

- `internal/analytics/service`
  - 从 SQLite 表单数据构造 Dataset
  - 从上传文件构造 Dataset
  - 统一调度 Build 逻辑

- `internal/analytics/handler`
  - 对管理员暴露 analytics API

### 7.2 前端分层

在 `vue-form/src` 中新增：

- 图表分析工作台页面
- 表单专属分析页面
- 图表渲染组件
- 数据上传组件
- 字段映射组件
- 图表配置组件

### 7.3 路由层

后端新增管理员 API：

- 上传分析数据集
- 获取图表定义
- 构建图表
- 校验层级数据
- 基于表单数据生成分析图

前端新增管理员页面路由：

- `/admin/analytics`
- `/admin/analytics/forms/:formName`

---

## 8. 建议抽取后的目录结构

建议目标目录如下：

```text
internal/
  analytics/
    model/
      types.go
    dataset/
      parse.go
      store.go
    gantt/
      builder.go
    viz/
      config.go
      registry.go
      validate.go
      builders_cartesian.go
      builders_items.go
      builders_relation.go
      builders_hierarchy.go
      builders_radar.go
      builders_gauge.go
      build.go
    service/
      dataset_from_upload.go
      dataset_from_forms.go
      build.go
    handler/
      analytics.go
```

前端建议目标目录如下：

```text
vue-form/src/
  components/
    analytics/
      ChartCanvas.vue
      DatasetUpload.vue
      FieldMapper.vue
      ChartOptionsPanel.vue
      ChartToolbar.vue
  views/
    AnalyticsWorkbenchView.vue
    FormAnalyticsView.vue
```

---

## 9. 数据模型统一建议

### 9.1 Dataset 统一抽象

建议在当前项目中定义统一的 Dataset 结构，用于承载两类来源：

1. 上传文件生成的临时数据集
2. 从表单提交记录转换而来的业务数据集

建议字段示意：

```go
type Dataset struct {
    ID        string
    Name      string
    Source    string
    FormName  string
    OwnerID   int
    Headers   []string
    Rows      [][]string
    CreatedAt time.Time
    ExpiresAt time.Time
}
```

### 9.2 图表构建输入统一抽象

建议定义统一的图表构建请求：

```go
type BuildRequest struct {
    DatasetID string
    ChartKind string
    Config    map[string]any
}
```

### 9.3 业务表单转 Dataset

需要新增“表单数据转 Dataset”的服务逻辑：

- 从 SQLite 查询表数据
- 读取列名和字段信息
- 转为统一 `Headers + Rows`
- 交给同一套 viz builder

这样上传数据与业务数据最终走同一条图表构建链路。

---

## 10. API 设计建议

建议新增以下管理员接口。

### 10.1 上传数据集

`POST /api/admin/analytics/datasets/upload`

用途：

- 上传 CSV/XLSX
- 返回 `datasetId`、`headers`、`preview`

### 10.2 获取数据集信息

`GET /api/admin/analytics/datasets/{id}`

用途：

- 返回预览数据
- 返回 headers
- 返回来源信息和 TTL

### 10.3 获取图表类型定义

`GET /api/admin/analytics/definitions`

用途：

- 返回所有支持的图表定义
- 返回分类 family
- 返回字段说明和默认值

### 10.4 构建图表

`POST /api/admin/analytics/build`

用途：

- 根据 `datasetId + chart config` 构建 payload

### 10.5 校验层级图配置

`POST /api/admin/analytics/validate-hierarchy`

用途：

- 对树图/矩形树图配置做预校验

### 10.6 基于表单数据构图

`POST /api/admin/analytics/forms/{formName}/build`

用途：

- 直接基于当前业务表单的 SQLite 数据生成图表

### 10.7 获取表单可分析字段信息

`GET /api/admin/analytics/forms/{formName}/schema`

用途：

- 返回字段列表
- 返回字段类型
- 返回图表推荐方案

---

## 11. 前端工作台设计建议

### 11.1 页面分层

建议前端区分两类入口：

1. 通用分析工作台
   - 入口：`/admin/analytics`
   - 用于上传 CSV/XLSX 后做临时分析

2. 表单分析页
   - 入口：`/admin/analytics/forms/:formName`
   - 用于对当前系统中的表单提交数据直接分析

### 11.2 页面组成

建议工作台页面由以下区域组成：

- 数据源选择区
- 数据预览区
- 图表类型选择区
- 字段映射区
- 图表配置区
- 图表渲染区
- 导出与复制操作区

### 11.3 Vue 中的图表渲染策略

建议统一封装单一的 `ChartCanvas` 组件，用来做：

- ECharts 实例初始化
- option 应用
- resize 监听
- 主题切换
- 导出图片/HTML

前端不要依赖模板时代的 `window.GANTT_DATA` 或 `window.VIZ_DATA`。

---

## 12. 与当前表单系统的业务融合方向

整合后，不应只支持“上传文件作图”，更应优先支持“基于已有表单数据的统计分析”。

### 12.1 建议优先支持的分析类型

#### 选项分布分析

适用于：

- `radio`
- `select`
- `checkbox`

推荐图表：

- 柱状图
- 饼图
- 环形图

#### 时间趋势分析

适用于：

- `_submitted_at`
- 日期字段

推荐图表：

- 折线图
- 面积图

#### 数值字段分析

适用于：

- `number`
- `range`

推荐图表：

- 柱状图
- 散点图
- 雷达图
- 仪表盘

### 12.2 当前仓库中的高价值场景

特别适合优先接入的表单包括：

- 满意度调查
- 绩效评分
- 项目任务类表单
- 跑步训练数据表单

例如 `running.yaml` 场景可优先做：

- 跑步距离趋势图
- 平均配速趋势图
- 疲劳度分布图
- 心率与距离散点图
- 训练类型占比图

---

## 13. 存储与安全建议

### 13.1 临时上传数据集管理

建议为上传 Dataset 增加：

- `owner_user_id`
- `created_at`
- `expires_at`
- 清理任务

第一阶段可用内存缓存，但必须具备过期清理。

### 13.2 访问控制

所有 analytics API 必须放在管理员权限下。

不建议开放匿名上传分析入口。

### 13.3 文件上传安全

建议补齐：

- 文件大小限制
- 扩展名校验
- MIME 类型校验
- 行数/列数限制
- 失败时的友好错误返回

### 13.4 日志与隐私

不要将上传的原始数据、图表请求体、敏感字段值直接写入日志。

建议只记录：

- 管理员 ID
- 数据集 ID
- 图表类型
- 来源表单名
- 是否成功

---

## 14. 构建与部署建议

### 14.1 保持当前一体化构建链

当前项目已形成：

- Vue 构建
- `dist` 拷贝到 embed 目录
- Go 编译为单二进制

整合 analytics 后，建议继续沿用当前仓库已有构建链，不再单独保留 `go_echarts_tools` 的 `main.go` 与构建脚本作为运行入口。

### 14.2 统一前端资源来源

建议在当前 Vue 项目中正式接入 ECharts，并由 Vite 管理其依赖。

不建议继续依赖模板中动态插入 CDN 脚本的模式。

---

## 15. 推荐实施阶段

### 阶段 1：后端能力抽取

目标：

- 将外部仓库的数据解析和 builder 能力迁入当前仓库
- 在当前后端中形成独立的 analytics 子域

产出：

- `internal/analytics/*`
- 最小可运行构图 API

### 阶段 2：最小前端工作台

目标：

- 新增 Vue 页面
- 先支持最常用图表类型：柱状图、折线图、饼图

产出：

- `/admin/analytics`
- 图表类型选择、字段映射、图表展示

### 阶段 3：表单数据直连分析

目标：

- 直接从当前 SQLite 表单数据生成 Dataset
- 不依赖上传文件也能分析

产出：

- `/admin/analytics/forms/:formName`
- 预设推荐图表

### 阶段 4：高级图表与导出能力

目标：

- 引入甘特图、桑基图、树图、矩形树图、雷达图、仪表盘
- 实现导出图片、导出 HTML、分享图表配置等能力

---

## 16. 三种可选整合路线对比

### 路线 A：快速挂载型

做法：

- 把 `go_echarts_tools` 作为独立子应用挂到当前服务下

优点：

- 上线快

缺点：

- 两套 UI
- 两套路由
- 两套交互模型
- 长期维护成本高

结论：

- 仅适合作为临时验证，不适合作为正式整合方案

### 路线 B：能力抽取型

做法：

- 只抽取后端解析与图表构建能力
- 前端用 Vue 重建工作台

优点：

- 与当前项目架构一致
- 复用价值最高
- 便于长期演进

缺点：

- 前端需要重写工作台页面

结论：

- 推荐采用

### 路线 C：独立微服务型

做法：

- 保持 `go_echarts_tools` 独立部署
- 当前项目跳转或 iframe 调用

优点：

- 服务边界清晰

缺点：

- 登录、权限、风格统一复杂
- 部署和联调成本高

结论：

- 只有在你希望图表工具独立对外提供时才有意义

---

## 17. 最终建议

最终建议如下：

1. 以当前仓库为唯一主应用，不保留双应用壳
2. 抽取 `go_echarts_tools` 的数据解析、图表 builder、图表配置与校验逻辑
3. 用当前仓库的管理员 API 承载 analytics 能力
4. 用当前 Vue SPA 重新建设图表工作台页面
5. 优先支持“基于现有表单提交数据的统计分析”，上传 CSV/XLSX 作为补充能力
6. 统一 ECharts 版本与前端依赖管理方式
7. 对临时数据集补齐权限、TTL、清理、安全限制

这套方案的结果应当是：

- 当前表单系统继续作为主业务系统
- 管理后台新增图表分析能力
- 数据上传分析与现有表单分析共用一套 analytics 内核
- 后续新增图表类型时，仅需要扩展 analytics builder，而不需要重构整体架构

---

## 18. 下一步建议

下一步制定详细 plan 时，建议按以下顺序展开：

1. 先确定目标目录结构与包边界
2. 再定义统一 Dataset / Config / BuildRequest 模型
3. 然后列出后端 API 清单与返回结构
4. 再拆前端页面、组件与状态流
5. 最后安排迁移顺序、验证策略和里程碑

如果进入下一轮详细 plan，建议直接输出：

- 分阶段任务清单
- 文件级改动清单
- API 契约草案
- 风险与回滚策略