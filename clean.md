# go_web_tools 清理与整改计划（clean.md）

## 1. 目标
- 清理不适配当前仓库的脚本与文档内容，统一项目口径。
- 消除“代码实现”和“文档说明”不一致的问题。
- 输出可执行、可验收、可回滚的整改路径。

## 2. 适用范围
- 顶层文档：README、QUICKSTART、PROJECT、集成分析与历史报告类文档。
- 脚本：build/publish/release/init/validate。
- 配置与路由口径：认证权限、data_directory 配置语义。
- 非目标：不改业务功能逻辑（除非为统一文档口径必须的小改动）。

## 3. 技术现状基线（用于判定“是否不适配”）
- 后端：Go + Gorilla Mux + SQLite(modernc) + YAML。
- 前端：Vue 3 + Vue Router + Pinia + ECharts + Vite。
- 部署：前端产物嵌入 Go 二进制，支持 Docker 单容器。
- 路由事实：提交与大部分 API 受登录保护；导出/管理类接口要求管理员；analytics 当前是登录可访问（非管理员专属）。

## 4. 清理分级

### P0（必须优先完成）
1. 清理文档中的绝对路径、个人路径、file:// 链接。
2. 修正文档与真实鉴权逻辑不一致（匿名提交、analytics 权限）。
3. 清理旧仓库名、残留尾注、失效链接。

### P1（本轮建议完成）
1. 统一 data_directory 口径（文档称废弃，但代码仍回填默认值）。
2. 修复过时目录结构文档和错误能力描述。
3. 处理历史修复报告中的无效“相关文档”引用。

### P2（可选优化）
1. 容器服务名/镜像名统一命名风格。
2. init/validate 脚本降级为 legacy 或重写为最小可维护版本。
3. 历史阶段文档归档，降低主目录噪音。

## 5. 文件级整改清单

### 5.1 文档整改
1. README.md
- 替换绝对路径为相对路径。
- 删除尾部脏内容与旧仓库名残留。
- 增补“认证与权限模型”小节，明确提交接口需要登录（共享链接路径除外）。

2. QUICKSTART.md
- 去除固定机器路径与旧式启动命令。
- 统一推荐入口为 make api / make web / make dev / make build。
- 修正“数据库+JSON 双写”陈述为数据库单写（若决定保留双写能力，需同步代码与文档说明）。
- API 示例与当前路由前缀保持一致。

3. MULTI_CONFIG_GUIDE.md
- 删除或标记 data_directory 为 legacy 配置。
- 修正示例命令参数格式，确保可直接运行。

4. LOGIN_SYSTEM.md 与 LOGIN_FEATURE_SUMMARY.md
- 修正文档中的“公开访问与匿名提交”描述，和当前路由鉴权一致。

5. CHECKBOX_FIX_REPORT.md
- file:// 链接替换为仓库相对路径。
- 删除不存在文档引用，或改为“已归档/未保留”。

6. PROJECT.md
- 按当前真实目录重写，移除不存在文件与过时能力项。

7. ANALYTICS_INTEGRATION_PLAN.md 与 ECHARTS_INTEGRATION_ANALYSIS.md
- 统一仓库命名为 go_web_tools。
- 标注“当前权限现状”和“目标权限策略”区别，避免误导。

### 5.2 脚本整改
1. release.sh
- 去除硬编码分支（如 vue）。
- 增加参数化：版本号、目标分支、是否推送 tag。
- 增加前置检查：工作区状态、tag 冲突、gh 登录状态。
- 以 dist 发行包为上传来源，避免误上传无关产物。

2. init.sh
- 方案 A：改名 init.legacy.sh 并在 README 标注仅历史兼容。
- 方案 B：重写为最小初始化脚本（目录 + 配置复制），去除旧模板生成逻辑。

3. validate.sh
- 从 grep 规则校验升级为“调用 Go 配置加载逻辑的真实校验”。
- 支持 includes 与错误定位（文件名、字段上下文）。

### 5.3 配置口径整改
1. data_directory 处理策略二选一
- 策略 A（推荐）：标记为 legacy，仅兼容读取，不再默认回填，不在新文档示例出现。
- 策略 B：彻底移除字段与回填逻辑（需评估兼容性与迁移说明）。

2. analytics 权限策略二选一
- 策略 A（文档对齐代码）：保留登录可访问，文档改为 requires login。
- 策略 B（代码对齐文档）：改为管理员访问，路由由 RequireLogin 收紧为 RequireAdmin。

## 6. 执行顺序
1. 阶段 1（P0 文档一致性）
- README、QUICKSTART、LOGIN 文档、CHECKBOX 报告。

2. 阶段 2（脚本稳定性）
- release.sh、validate.sh、init.sh。

3. 阶段 3（结构与历史文档）
- PROJECT、MULTI_CONFIG_GUIDE、ANALYTICS 相关文档统一。

4. 阶段 4（可选）
- 容器命名统一、历史文档归档到 docs/history。

## 7. 验收标准
- 文档中不再出现本机绝对路径与 file:// 链接。
- 所有“权限说明”与实际路由一致。
- 快速启动文档可在新机器直接执行通过。
- 发布脚本可无人工交互执行（或明确交互模式），并能稳定生成发布物。
- validate 脚本能对主配置 + includes 做真实校验。

## 8. 风险与回滚
- 风险 1：文档先改但代码未同步，造成临时认知偏差。
  - 处置：每个 PR 附“代码事实对照表”。
- 风险 2：release 流程变更导致发版中断。
  - 处置：保留 release.sh.bak 一版，灰度 1 次后再删除。
- 风险 3：移除 data_directory 影响旧配置。
  - 处置：先走 legacy 兼容，观察一版后再考虑彻底移除。

## 9. 交付物
- clean.md（本文件）
- 文档整改 PR（P0/P1）
- 脚本整改 PR（release/init/validate）
- 可选：历史文档归档 PR

## 10. 建议里程碑（按 1~2 天节奏）
- D1：完成 P0 文档一致性整改并自检。
- D2：完成脚本整改与联调验证。
- D3：完成 P1 结构文档与口径统一，补充迁移说明。

## 11. 过程文档与阶段提交要求
- 过程总览：`docs/cleanup/README.md`
- 总台账：`docs/cleanup/change-log.md`
- 阶段日志：`docs/cleanup/phase-<n>-log.md`

执行要求：
1. 每个阶段开始前先创建或更新对应 `phase` 日志，列出逐项任务。
2. 每完成一项，记录“文件、动作、证据、结论”。
3. 每个阶段完成后必须独立 git 提交，禁止跨阶段混合提交。
4. 提交后在总台账登记提交哈希与阶段状态。
