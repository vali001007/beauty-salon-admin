# Agent V3 纯 Text-to-SQL 智能体详细方案

更新时间：2026-07-07
版本定位：Agent V3
核心原则：只用受控 Text-to-SQL，不使用 Manifest，不依赖 Agent V2 能力中心发布链路。

## 1. 产品定位

Agent V3 是一条独立智能体路线：面向“所有业务、领域、模块的数据问数与自由组合分析”，只通过受控 Text-to-SQL 完成只读查询、分析、汇总、排行、趋势、对比和解释。

它不再走 Agent V2 的 Manifest 能力目录，也不需要“先治理能力、再审核、再发布 Manifest”才能回答。用户问“本月销量最好的商品”“最近 3 个月营业额趋势”“哪些客户买过这些项目”“库存报废和销售有什么关系”，V3 的目标是直接基于语义视图、权限和 SQL Guard 生成安全查询计划并返回结果。

Agent V3 的产品边界：

- 只读问数和分析：允许。
- 数据汇总、趋势、排行、交叉分析：允许。
- 敏感字段脱敏后查询：允许。
- 写入、删除、审批、发券、下发、状态变更：不允许。
- 任意原表自由查询：不允许。
- 让 LLM 直接执行未审查 SQL：不允许。

一句话：V3 是“受控数据分析智能体”，不是“自动操作智能体”。

## 2. 为什么需要 V3

Agent V2 的优点是可治理、可发布、可控，适合稳定高频能力。但它天然有一个产品问题：新问法、新组合、新分析需求，必须先进入能力目录或 Text-to-SQL 兜底，否则容易出现“未命中能力”“回答错能力”“默认时间范围不对”。

V3 解决的是另一类问题：

- 问法变化快，不希望每个问法都人工补 Manifest。
- 业务数据维度多，用户希望自由组合。
- 管理端和后台已有大量表、接口、模块，希望 Agent 能快速覆盖。
- PM/门店管理者关心结果，不关心这个问题是否已经发布成能力。

因此 V3 不做 Manifest，不做能力发布，不做能力中心审核。它只做一件事：在安全边界内，把自然语言问题转换为只读 SQL 查询和结构化答案。

## 3. 与 Agent V2 的关系

| 维度 | Agent V2 | Agent V3 |
| --- | --- | --- |
| 主路径 | DB active Manifest + 工具执行 | 受控 Text-to-SQL |
| 是否使用 Manifest | 使用 | 不使用 |
| 是否依赖能力中心发布 | 依赖 | 不依赖 |
| 覆盖方式 | 一个个能力治理发布 | 语义视图全域覆盖 |
| 灵活性 | 中，高频稳定 | 高，适合自由问数 |
| 稳定性 | 高，适合生产固定能力 | 依赖 Guard、视图质量和 SQL 生成质量 |
| 写操作 | 草稿/阻断/人工确认 | 全部阻断 |
| 可解释性 | Manifest + tool trace + evidence | SQL trace + semantic view evidence + field policy |
| 最适合场景 | 稳定功能、固定业务动作、可发布能力 | 临时分析、自由组合、跨域问数 |

建议产品上并行存在：

- V2：正式能力智能体，负责稳定、可发布、可审计的标准能力。
- V3：数据分析智能体，负责自由问数和探索式分析。

产品入口直接放在智能终端的 Runtime 版本切换里，管理端只保留审计和配置入口：

- `V2 能力治理版`
- `V3 数据分析版`

V3 不再设计阶段性开放流程。实现完成后，在智能终端中直接出现 V3 版本，用户可切换后使用。权限仍按账号角色和业务权限控制：

- 系统管理员、店长、运营角色优先开放 V3。
- 前台、美容师默认不开 V3 或仅开放受限视图。
- 普通用户不开放 V3。

## 4. 总体架构

```mermaid
flowchart TD
  User["用户问题"] --> Client["智能终端 V3 数据分析入口"]
  Client --> Api["POST /agent-v3/runs"]
  Api --> Orchestrator["AgentV3OrchestratorService"]

  Orchestrator --> Intent["问题理解 / 时间解析 / 指标识别"]
  Intent --> ViewSelector["语义视图选择器"]
  ViewSelector --> Catalog["Semantic View Registry"]
  Catalog --> Views["agent_v3_*_view 白名单语义视图"]

  Intent --> Planner["Text-to-SQL Planner"]
  Planner --> SqlDraft["候选 SQL"]
  SqlDraft --> AstGuard["SQL AST Guard"]
  AstGuard --> PolicyGuard["权限 / 门店 / 字段策略 Guard"]
  PolicyGuard --> CostGuard["成本 / LIMIT / 时间范围 Guard"]
  CostGuard --> Rewrite["SQL 安全改写"]
  Rewrite --> Executor["只读 SQL Executor"]
  Executor --> ReadonlyDb["独立只读数据库账号"]

  Executor --> Composer["Answer Composer"]
  Composer --> Answer["结构化答案 / 表格 / 图表 / 证据"]

  Orchestrator --> Audit["AgentV3Run / SQL Audit / Feedback"]
  Audit --> Governance["V3 审计与质量看板"]
```

## 5. 核心设计原则

### 5.1 不使用 Manifest

V3 不读取：

- `AgentCapabilityManifestVersion`
- `AgentCapabilityManifestItem`
- 内置 `agent-v2-capability-manifest.ts`
- Agent V2 能力中心草稿、审核、发布状态

V3 的运行依据只有：

- 语义视图目录
- 语义字段说明
- 权限规则
- 字段脱敏策略
- SQL Guard 策略
- 只读数据库连接
- 审计与反馈数据

这样可以避免 V3 再次变成“能力目录驱动”，保持它作为自由问数引擎的定位。

### 5.2 只读优先

V3 永远不执行写操作。即使用户说：

- “帮我给这些客户发券”
- “把库存报废掉”
- “删除这些订单”
- “审批这些退款”

V3 只能回答：

- 可查询影响范围。
- 可生成建议清单。
- 可输出人工操作建议。
- 可提示切换到相应业务页面。

但不能调用写接口，也不能生成写 SQL。

### 5.3 全域语义视图，而不是窄能力

V3 不按“能力”开放，而按“语义视图”开放。所有主要业务模块都进入白名单视图：

- 门店
- 客户
- 订单
- 商品
- 项目
- 卡项
- 收银
- 退款
- 库存
- 报废
- 采购
- 供应商
- 预约
- 排班
- 员工
- 服务履约
- 营销活动
- 营销转化
- 小程序
- 终端设备
- 打印任务
- 财务成本
- 多店对比
- 权限与系统审计
- Agent 运行审计

限制不再是“这个模块能不能查”，而是：

- 这个视图允许哪些角色查。
- 这个角色能看哪些门店。
- 这个字段是否脱敏。
- 这个查询时间范围是否合理。
- 这个 SQL 成本是否可接受。

### 5.4 LLM 只负责生成候选计划，不负责最终放行

LLM 可以生成：

- 语义视图选择
- SQL 草稿
- 查询解释
- 结果摘要
- 图表建议

但最终必须由系统 Guard 决定是否执行。Guard 不通过，SQL 不执行。

## 6. 数据层设计

### 6.1 语义视图命名

V3 建议新建独立视图前缀：

```text
agent_v3_*_view
```

不直接复用 `agent_v2_*_view` 作为长期运行源，原因：

- V3 是独立版本，应避免和 V2 运行模式、迁移、治理状态耦合。
- V3 视图可以按 Text-to-SQL 最优结构重建，不必兼容 V2 当前字段。
- 后续 V2 和 V3 可以独立演进。

短期可从 V2 视图复制第一版结构，但运行命名、注册表和审计表应独立。

### 6.2 视图类型

建议分 4 类视图：

| 类型 | 用途 | 示例 |
| --- | --- | --- |
| 明细视图 | 列表、追溯、筛选 | 订单明细、库存流水、预约记录 |
| 汇总视图 | KPI、经营看板 | 门店日结、员工人效、商品销售汇总 |
| 维度视图 | 解释字段、分类、主体 | 商品、项目、客户、员工、门店 |
| 审计视图 | AI/系统运行质量 | Agent run、SQL audit、权限变更 |

### 6.3 字段分级

字段必须分级：

| 等级 | 说明 | 策略 |
| --- | --- | --- |
| public | 普通经营字段 | 可直接返回 |
| internal | 内部业务字段 | 需权限 |
| sensitive | 敏感字段 | 默认脱敏 |
| restricted | 高敏字段 | 默认禁止 |
| derived | 派生指标 | 可返回，但需说明口径 |

示例：

- 客户姓名：敏感，默认显示脱敏名。
- 手机号：高敏，只允许后四位。
- 订单金额：内部字段，按权限和门店范围返回。
- 毛利率：派生指标，必须带口径。
- 权限码：系统敏感，管理员可看，普通角色不可看。

### 6.4 推荐首批 V3 语义视图

第一阶段建议覆盖以下视图：

| 领域 | 视图 |
| --- | --- |
| 门店 | `agent_v3_store_summary_view` |
| 客户 | `agent_v3_customer_profile_view` |
| 客户行为 | `agent_v3_customer_behavior_view` |
| 订单 | `agent_v3_order_summary_view` |
| 商品销售 | `agent_v3_order_item_sales_view` |
| 项目销售 | `agent_v3_project_service_sales_view` |
| 收银退款 | `agent_v3_payment_refund_view` |
| 日结财务 | `agent_v3_daily_settlement_view` |
| 商品库存 | `agent_v3_product_inventory_view` |
| 库存流水 | `agent_v3_stock_movement_view` |
| 报废记录 | `agent_v3_inventory_scrap_view` |
| 采购 | `agent_v3_purchase_procurement_view` |
| 供应商 | `agent_v3_supplier_performance_view` |
| 卡项资产 | `agent_v3_card_asset_view` |
| 卡项核销 | `agent_v3_card_usage_view` |
| 预约 | `agent_v3_reservation_view` |
| 员工 | `agent_v3_staff_profile_view` |
| 员工人效 | `agent_v3_staff_performance_view` |
| 服务履约 | `agent_v3_service_quality_view` |
| 营销活动 | `agent_v3_marketing_activity_view` |
| 营销转化 | `agent_v3_marketing_conversion_view` |
| 自动触达 | `agent_v3_marketing_automation_view` |
| 小程序 | `agent_v3_customer_app_funnel_view` |
| 终端 | `agent_v3_terminal_device_view` |
| 财务成本 | `agent_v3_operating_cost_view` |
| 多店对比 | `agent_v3_store_comparison_view` |
| 系统权限 | `agent_v3_user_role_permission_view` |
| AI 审计 | `agent_v3_ai_audit_view` |
| Agent 审计 | `agent_v3_agent_run_audit_view` |

后续再扩展到更细颗粒度视图。

## 7. V3 运行链路

### 7.1 Step 1：问题预处理

输入：

```text
最近3个月营业额趋势
```

预处理输出：

```json
{
  "normalizedQuestion": "最近3个月营业额趋势",
  "intent": "trend",
  "domains": ["finance", "order"],
  "metrics": ["revenue"],
  "timeRange": {
    "preset": "last_3_months",
    "label": "近 3 个月"
  },
  "output": ["chart", "table", "summary"]
}
```

这一层不需要 Manifest，只做语言和时间解析。

### 7.2 Step 2：语义视图选择

根据问题选择候选视图：

```json
{
  "primaryViews": ["agent_v3_daily_settlement_view"],
  "secondaryViews": ["agent_v3_order_summary_view"],
  "reason": "问题询问营业额趋势，优先使用日结/订单汇总视图。"
}
```

如果需要跨域：

```text
最近3个月销量最好的商品，库存还够吗？
```

候选视图：

- `agent_v3_order_item_sales_view`
- `agent_v3_product_inventory_view`

### 7.3 Step 3：生成候选 SQL

LLM 只生成候选 SQL，不执行：

```sql
SELECT
  date_trunc('month', settlement_date) AS month,
  SUM(net_revenue) AS revenue,
  SUM(order_count) AS order_count
FROM agent_v3_daily_settlement_view
WHERE store_id = :store_id
  AND settlement_date >= :start_at
  AND settlement_date < :end_at
GROUP BY 1
ORDER BY 1 ASC
LIMIT 100;
```

### 7.4 Step 4：SQL Guard

Guard 检查：

- 只允许 `SELECT`。
- 禁止 `INSERT/UPDATE/DELETE/ALTER/DROP/TRUNCATE`。
- 禁止访问非白名单视图。
- 禁止访问原始业务表。
- 禁止危险函数。
- 必须带门店范围。
- 必须带 LIMIT。
- 大范围查询必须有时间过滤。
- 字段必须符合字段策略。
- 禁止返回 restricted 字段。

### 7.5 Step 5：权限和字段策略注入

系统自动注入：

```sql
AND store_id IN (:authorized_store_ids)
```

字段脱敏：

- `customer_name` -> `customer_name_masked`
- `phone` -> `phone_last4`
- `app_open_id` -> `app_user_hash`

普通角色没有权限时直接阻断：

```json
{
  "status": "blocked",
  "reasonCode": "permission_denied",
  "message": "当前账号没有查看财务营业额趋势的权限。"
}
```

### 7.6 Step 6：只读执行

执行要求：

- 独立只读数据库账号。
- 独立连接池。
- 查询超时。
- 最大返回行数。
- Explain 成本检查。
- SQL 审计落库。

环境变量：

```text
AGENT_V3_ENABLED=true
AGENT_V3_TEXT_TO_SQL_ENABLED=true
AGENT_V3_READONLY_DATABASE_URL=postgresql://readonly_user:***@host/db
AGENT_V3_ADMIN_ONLY=true
AGENT_V3_MAX_LIMIT=200
AGENT_V3_QUERY_TIMEOUT_MS=5000
AGENT_V3_MAX_RANGE_DAYS=730
AGENT_V3_SQL_DRY_RUN_ONLY=false
```

本地可以允许：

```text
AGENT_V3_SQL_DRY_RUN_ONLY=true
```

用于开发环境先看计划，不真实查只读库。

### 7.7 Step 7：答案生成

答案必须包含：

- 结论摘要。
- 表格或图表数据。
- 口径说明。
- 数据来源。
- 时间范围。
- 权限和脱敏说明。
- 数据不足或无数据说明。

示例：

```text
近 3 个月营业额呈上升趋势，总营业额 ¥128,600，订单 312 单。
其中 5 月 ¥36,200，6 月 ¥41,800，7 月截至目前 ¥50,600。
数据来源：agent_v3_daily_settlement_view；口径为日结净收，已按当前门店授权过滤。
```

## 8. 后端模块设计

建议新增独立目录：

```text
packages/server-v2/src/agent-v3/
```

模块结构：

```text
agent-v3/
  agent-v3.module.ts
  agent-v3.controller.ts
  agent-v3-orchestrator.service.ts
  agent-v3-run.service.ts
  agent-v3-question-preprocessor.service.ts
  agent-v3-semantic-view-registry.service.ts
  agent-v3-view-selector.service.ts
  agent-v3-text-to-sql-planner.service.ts
  agent-v3-sql-ast-parser.service.ts
  agent-v3-sql-guard.service.ts
  agent-v3-sql-cost-guard.service.ts
  agent-v3-readonly-sql-executor.service.ts
  agent-v3-answer-composer.service.ts
  agent-v3-audit.service.ts
  agent-v3-feedback.service.ts
  agent-v3.types.ts
```

说明：

- 不引用 Agent V2 Manifest provider。
- 不引用 Agent V2 capability center。
- 可以复用通用 Prisma、Auth、AI Gateway、业务时间工具。
- SQL Guard 可以参考 V2 Text-to-SQL 的实现思路，但建议 V3 独立类名和独立配置，避免后续版本边界混乱。

## 9. API 设计

### 9.1 运行接口

```http
POST /agent-v3/runs
```

请求：

```json
{
  "message": "最近3个月营业额趋势",
  "storeId": 1,
  "mode": "execute"
}
```

响应：

```json
{
  "runId": 1001,
  "status": "completed",
  "answer": "近 3 个月营业额...",
  "blocks": [
    { "kind": "summary_text" },
    { "kind": "chart" },
    { "kind": "table" },
    { "kind": "evidence_panel" }
  ],
  "evidence": {
    "sourceViews": ["agent_v3_daily_settlement_view"],
    "dateRange": "2026-05-01 至 2026-07-07",
    "storeScope": "store_id=1",
    "fieldPolicies": []
  }
}
```

### 9.2 SQL dry-run

```http
POST /agent-v3/text-to-sql/dry-run
```

用途：

- 管理员调试。
- 查看生成 SQL。
- 查看 Guard 结果。
- 不执行数据库查询。

### 9.3 审计接口

```http
GET /agent-v3/runs
GET /agent-v3/runs/:id
GET /agent-v3/sql-runs
GET /agent-v3/sql-runs/:id
POST /agent-v3/sql-runs/:id/feedback
```

### 9.4 语义视图接口

```http
GET /agent-v3/semantic-views
GET /agent-v3/semantic-views/:name
POST /agent-v3/semantic-views/:name/test
```

## 10. 数据模型

建议新增 Prisma 模型：

```prisma
model AgentV3Run {
  id              Int      @id @default(autoincrement())
  storeId         Int?
  userId          Int?
  role            String?
  question        String
  normalizedInput Json?
  status          String
  answerJson      Json?
  evidenceJson    Json?
  createdAt       DateTime @default(now())
  completedAt     DateTime?

  sqlRuns         AgentV3SqlRun[]

  @@map("agent_v3_runs")
}

model AgentV3SqlRun {
  id              Int      @id @default(autoincrement())
  runId           Int?
  userId          Int?
  storeIdsJson    Json?
  question        String
  selectedViews   Json
  generatedSql    String?
  safeSql         String?
  redactedSql     String?
  guardResultJson Json?
  costJson        Json?
  status          String
  rowCount        Int      @default(0)
  executionMs     Int?
  blockedReason   String?
  createdAt       DateTime @default(now())

  run             AgentV3Run? @relation(fields: [runId], references: [id], onDelete: SetNull)
  feedback        AgentV3Feedback[]

  @@map("agent_v3_sql_runs")
}

model AgentV3SemanticView {
  id              Int      @id @default(autoincrement())
  viewName        String   @unique
  domain          String
  description     String
  requiredPerms   Json
  storeScopeField String?
  dateField       String?
  fieldsJson      Json
  examplesJson    Json?
  isEnabled       Boolean  @default(true)
  adminOnly       Boolean  @default(false)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@map("agent_v3_semantic_views")
}

model AgentV3Feedback {
  id          Int      @id @default(autoincrement())
  sqlRunId    Int
  userId      Int?
  rating      String
  reason      String?
  createdAt   DateTime @default(now())

  sqlRun      AgentV3SqlRun @relation(fields: [sqlRunId], references: [id], onDelete: Cascade)

  @@map("agent_v3_feedback")
}
```

## 11. 前端设计

### 11.1 入口

智能终端 Runtime 切换增加：

```text
V1 旧链路
V2 能力治理
V3 数据分析
```

V3 终端标签建议：

```text
Text-to-SQL / 数据分析版
```

不要叫“自由 SQL”，避免用户误以为可以随便查库。

管理端不作为 V3 的主要使用入口，管理端职责调整为：

- 查看 V3 运行审计。
- 查看 SQL Guard 阻断原因。
- 管理语义视图启停、权限和字段策略。
- 查看高频问题和用户反馈。

### 11.2 回答展示

V3 回答需要固定展示：

- 答案摘要。
- 图表。
- 数据表。
- 数据来源。
- 查询口径。
- 权限和脱敏说明。
- 反馈按钮：有用 / 无用 / 数据不对。

### 11.3 管理后台

新增 V3 数据分析治理页：

- V3 运行记录。
- SQL 审计。
- 语义视图健康。
- Guard 阻断原因。
- 高频问题。
- 用户反馈。
- 慢查询。
- 无数据率。
- 错答反馈。

## 12. 权限策略

V3 权限建议分三层：

### 12.1 入口权限

```text
core:agent-v3:view
core:agent-v3:manage
core:agent-v3:debug
```

### 12.2 领域权限

继承业务域权限：

- `core:order:view`
- `core:finance:view`
- `core:customer:view`
- `core:inventory:view`
- `core:marketing:view`
- `core:staff:view`
- `core:reservation:view`

### 12.3 字段权限

字段策略根据角色和权限控制：

- 店长：可看经营金额、客户脱敏信息。
- 系统管理员：可看更完整的经营分析，但仍默认脱敏手机号。
- 前台：只看自己职责范围内的预约、收银、客户基础信息。
- 美容师：只看服务相关数据，不看全店财务。

## 13. SQL 安全策略

必须阻断：

- 多语句 SQL。
- 写操作。
- DDL。
- 非白名单视图。
- 原始表。
- 系统表。
- 未带 LIMIT 的明细查询。
- 超过最大时间范围的查询。
- 返回 restricted 字段。
- 跨门店越权。
- 高成本 Explain。
- 可推断隐私的小样本查询。

小样本隐私保护：

- 查询客户分群时，如果结果少于阈值，例如 3 人，不返回明细，只返回“样本过小，已隐藏明细”。
- 敏感字段只返回脱敏值。

## 14. LLM 提示词策略

Planner 提示词必须包含：

- 只能使用给定语义视图。
- 只能生成 SELECT。
- 必须使用参数占位符。
- 必须带 LIMIT。
- 必须优先使用 dateField。
- 必须按 storeScopeField 过滤。
- 不知道字段时返回 unable_to_plan，不要编造字段。
- 不要返回解释性废话，只返回结构化 JSON。

候选输出：

```json
{
  "status": "planned",
  "selectedViews": ["agent_v3_order_item_sales_view"],
  "sql": "SELECT ...",
  "params": {
    "store_ids": [1],
    "start_at": "2026-07-01",
    "end_at": "2026-07-07",
    "limit": 20
  },
  "expectedOutput": "table",
  "metricDefinitions": ["销量 = SUM(quantity)"]
}
```

## 15. 典型问题覆盖

| 用户问题 | V3 处理方式 |
| --- | --- |
| 最近3个月营业额趋势 | 日结/订单视图，按月聚合，输出折线图 |
| 本月销量最好的商品 | 商品销售视图，按 quantity 排行 |
| 最近30天报废的产品有哪些 | 报废视图，按 occurred_at 过滤 |
| 哪些客户买过这些商品 | 订单明细 + 客户脱敏视图 |
| 员工人效排名 | 员工人效视图，按服务/销售/提成指标排序 |
| 哪些营销活动带来成交 | 营销转化视图，按活动聚合成交 |
| 库存不足但销量好的商品 | 商品销售视图 + 库存视图组合 |
| 退款率为什么升高 | 退款视图 + 订单视图，按时间对比 |
| 小程序最近带来多少客户 | 小程序 funnel 视图 |
| 多门店本月营收对比 | 多店对比视图 |

## 16. 不支持场景

V3 不支持：

- “给这些客户发券”
- “帮我创建采购单”
- “把商品报废”
- “删除订单”
- “审核退款”
- “修改客户手机号”
- “自动发布营销活动”

这些需要业务动作智能体或 V2/V4 的审批型工具链，不应该放进纯 Text-to-SQL。

## 17. 质量评测

V3 需要独立评测集，不复用 V2 Manifest Eval Gate。

评测维度：

- 视图选择正确率。
- 时间范围正确率。
- SQL 安全通过率。
- 权限阻断正确率。
- 脱敏正确率。
- 口径说明完整率。
- 答案与 SQL 结果一致率。
- 无数据解释正确率。
- 高频问题覆盖率。
- 用户反馈有效率。

建议首批评测题不少于 100 条：

- 经营财务 20 条。
- 商品库存 15 条。
- 客户卡项 15 条。
- 员工服务 10 条。
- 营销转化 10 条。
- 预约排班 10 条。
- 多店对比 10 条。
- 安全越权 10 条。

## 18. 智能终端直接切换策略

V3 不再单独设计阶段性开放策略。产品落地方式改为：在 Ami Aura Lite 智能终端中直接新增 `V3 数据分析版` Runtime，和现有 V1/V2 一起作为可切换版本。

终端切换项：

```text
V1 旧链路
V2 能力治理
V3 数据分析
```

V3 启用条件：

- 后端 `agent-v3` API 可用。
- 独立只读库连接可用。
- V3 语义视图 migration 已应用。
- 当前终端登录账号具备 `core:agent-v3:view` 或对应业务域只读权限。
- SQL Guard、字段脱敏、门店范围注入全部启用。

终端使用规则：

- 用户切到 V3 后，所有问题都走 `/agent-v3/runs`。
- V3 不读取 Manifest，也不回退 V2 能力目录。
- V3 只回答只读数据问题。
- 写操作问题直接阻断，并提示切回业务页面或 V2/V1 可用入口。
- V3 回答必须展示数据来源、时间范围、口径和脱敏说明。
- V3 查询失败时展示明确原因：权限不足、语义视图缺失、SQL Guard 阻断、只读库不可用或无数据。

上线前只保留工程验收，不做分阶段开放：

- 本地 dry-run 验证。
- 只读库 readiness 验证。
- 安全负向测试。
- 智能终端 V3 切换验收。
- 真实门店账号权限验收。
- 核心问数题集验收。

高频、稳定、需强治理的问题仍可从 V3 反馈沉淀回 V2 正式能力，但 V3 本身不因此进入 Manifest 发布链路。

## 19. 开发计划

### 第一阶段：V3 骨架

- 新增 `agent-v3` 模块。
- 新增 `/agent-v3/runs`。
- 新增 V3 run/audit 数据表。
- 新增 Runtime 切换入口。
- 完成 dry-run 模式。

### 第二阶段：语义视图

- 新建 `agent_v3_*_view`。
- 新增 `AgentV3SemanticView` registry。
- 完成首批 20-30 个视图。
- 建立字段策略、权限策略、示例问题。

### 第三阶段：SQL 生成与 Guard

- 实现 V3 Text-to-SQL planner。
- 实现 AST parser。
- 实现 SQL Guard。
- 实现 Cost Guard。
- 实现只读 executor。
- 实现 SQL redaction。

### 第四阶段：答案生成

- 结构化回答 block。
- 表格、KPI、图表、证据面板。
- 口径说明。
- 无数据说明。
- 脱敏说明。

### 第五阶段：治理台

- V3 运行记录。
- SQL 审计。
- Guard 阻断原因。
- 语义视图健康。
- 用户反馈。
- 高频问题。

### 第六阶段：智能终端 V3 接入验收

- 本地 dry-run。
- 只读库 readiness。
- 安全负向测试。
- 智能终端新增 `V3 数据分析` 切换项。
- 终端切到 V3 后请求 `/agent-v3/runs`。
- 终端展示 V3 结构化回答、图表、表格、证据和脱敏说明。
- 终端写操作问题展示阻断原因。

## 20. 验收标准

功能验收：

- V3 不读取 Manifest。
- V3 能回答首批 100 条问数评测题中的 80% 以上。
- V3 对所有写操作请求 100% 阻断。
- V3 对无权限领域 100% 阻断。
- V3 返回结果必须包含 evidence。
- V3 SQL 审计 100% 落库。

安全验收：

- 不能执行非 SELECT。
- 不能访问非白名单视图。
- 不能访问原始表。
- 不能跨门店越权。
- 不能返回未脱敏手机号、OpenID、身份证等敏感字段。
- 不能绕过 LIMIT。

产品验收：

- “最近3个月营业额趋势”能按近 3 个月回答，不退回近 7 天。
- “本月销量最好的商品”能按商品销量排行回答，不误答库存状态。
- “最近30天报废的产品有哪些”能按报废记录回答，不误答本周。
- “哪些客户买过这些商品”能做订单与客户脱敏关联。
- “库存不足但销量好的商品”能跨销售与库存视图组合分析。

## 21. 风险与应对

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| LLM 生成错误 SQL | 答非所问或查询失败 | AST Guard、字段白名单、SQL dry-run、失败解释 |
| 语义视图字段不足 | 回答不了复杂问题 | 视图健康看板和反馈闭环 |
| 权限配置不严 | 数据泄露 | 三层权限、门店注入、字段脱敏 |
| 查询成本高 | 影响数据库 | 只读库、超时、Explain、LIMIT |
| 用户把 V3 当操作智能体 | 期望错位 | UI 明确标注“数据分析版，只读” |
| 与 V2 职责混乱 | 产品认知混乱 | V2=能力治理版，V3=数据分析版 |

## 22. 推荐决策

建议确定：

1. Agent V3 独立版本成立。
2. V3 只做 Text-to-SQL，不接 Manifest。
3. V3 只读，不做任何写操作。
4. V3 使用独立 `agent_v3_*` 视图、独立审计表、独立 API。
5. V3 和 V2 并行，不互相替代。
6. 高频稳定问题可从 V3 反馈沉淀回 V2，但 V3 运行时不依赖 V2。

最终产品形态：

- Agent V2：标准能力、治理发布、稳定执行。
- Agent V3：自由问数、跨域分析、受控 SQL、快速覆盖全业务数据。

## 23. 当前实现状态

更新时间：2026-07-07

已完成：

- 后端新增 `packages/server-v2/src/agent-v3` 独立模块，已挂载到 `AppModule`。
- 新增 `POST /agent-v3/runs`、`POST /agent-v3/runs/:id/messages`、`GET /agent-v3/runs`、`GET /agent-v3/runs/:id`、`GET /agent-v3/runs/:id/detail`。
- 新增 V3 Text-to-SQL 调试与审计接口：`/agent-v3/text-to-sql/dry-run`、`/execute`、`/semantic-views`、`/status`、`/runs`、`/runs/:id/feedback`。
- V3 运行时不读取 Manifest，不调用 Agent V2 能力中心，不提供候选能力提升到 Manifest 的接口。
- 新增 Prisma 模型：`AgentV3TextToSqlRun`、`AgentV3TextToSqlSemanticView`、`AgentV3TextToSqlFeedback`。
- 新增 migration：`20260707120000_agent_v3_text_to_sql`，包含独立 `agent_v3_*` 语义视图和 V3 审计表。
- 智能终端新增 `V3` Runtime 版本切换，切换后直接调用 `/agent-v3/runs`。
- V3 本地默认 `AGENT_V3_SQL_DRY_RUN_ONLY=true` 语义，未配置只读库时可先 dry-run 闭环，不阻断本地开发。
- V3 Planner 已修正“退款率为什么升高”这类问数问题，不再被误判为写操作。

已验证：

```powershell
npm.cmd --prefix packages/server-v2 run db:generate
npm.cmd --prefix packages/server-v2 test -- agent-v3-orchestrator.service.spec.ts agent-v3-text-to-sql-planner.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run build
npm.cmd run build
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
git diff --check
```

验证结果：

- 后端 V3 定向测试通过：2 个测试套件、4 条用例全部通过。
- 后端构建通过。
- 管理端构建通过。
- Ami Aura Lite 智能终端构建通过，仅保留既有 chunk size warning。
- `git diff --check` 无空白错误，仅 Windows 换行提示。

未执行：

- 未对当前 `DATABASE_URL` 执行 migration。只读检查显示该连接指向 Supabase，且 `20260707013000_agent_v2_text_to_sql`、`20260707120000_agent_v3_text_to_sql` 尚未应用。由于这属于真实数据库写入，本轮只生成 migration 文件，不自动写入远端库。

下一步：

- 如需打开真实只读执行，需要先明确目标环境，再执行 migration，并配置 `AGENT_V3_READONLY_DATABASE_URL` 或 `AGENT_V3_TEXT_TO_SQL_READONLY_DATABASE_URL`。
- 生产执行前将 `AGENT_V3_SQL_DRY_RUN_ONLY=false`，并保留 SQL Guard、字段脱敏和门店范围注入。
