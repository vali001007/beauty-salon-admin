# Agent V6 P0 开发计划与 tasks.md

版本：v1.0
日期：2026-07-09
依据：《Agent V6 完全独立经营管理 Agent 需求文档-2026-07-09.md》
边界：本文是 P0 开发执行合同，只覆盖独立底座和可信只读闭环，不做 P1/P2 写操作、实时语音和跨系统第三方 Agent 互联。

## 1. P0 目标

P0 要证明 Agent V6 是独立、可治理、能理解美业经营并可信问数/提示风险的系统。

完成后应具备：

- 独立 `/api/agent-v6/*` 后端模块。
- 独立 AgentV6 数据模型。
- 基础对话工作台。
- 治理中心 P0。
- 分层记忆 P0。
- 模糊追问 P0。
- Ontology P0。
- Capability Scanner P0。
- 只读查询工具和风险提示。
- 权限、脱敏、L3/L4 拦截。
- P0 验收用例和评测集。

## 2. 明确不做

P0 不做：

- 不自动执行退款、会员资产、财务冲正、库存调整、营销群发。
- 不接实时语音。
- 不做完整排班优化。
- 不做第三方 A2A/MCP 互联。
- 不复用历史 Agent V1-V5 的 runtime、prompt、eval、数据表。
- 不在旧 Agent 工作台或旧治理中心里继续堆 V6。

## 3. 任务清单

### T0：执行前隔离与基线确认

- [ ] 新建独立工作分支或工作树，避免混入当前脏工作区。
- [ ] 确认 PRD 文件存在：`docs/02-产品设计/01-AI智能体与问数能力/Agent V6完全独立经营管理Agent需求文档-2026-07-09.md`。
- [ ] 确认不读取历史 Agent 方案作为 V6 设计输入。
- [ ] 记录当前 `git status --short --branch`。

验收：

- 有独立分支/工作树。
- 开发记录说明 clean-room 边界。

### T1：Prisma 独立数据模型

- [ ] 在 `packages/server-v2/prisma/schema.prisma` 新增 `AgentV6*` 模型。
- [ ] 覆盖 Conversation、Run、Step、Message、MemoryItem、OntologyNode、OntologyEdge、MetricDefinition、CapabilitySnapshot、CapabilityItem、ToolDefinition、ToolInvocation、PermissionDecision、Evidence、Feedback、EvaluationCase、EvaluationResult。
- [ ] 生成 migration。
- [ ] 执行 `npm.cmd --prefix packages/server-v2 run db:generate`。

验收：

- 所有模型以 `AgentV6` 前缀命名。
- 不修改历史 Agent 表结构。
- Prisma generate 成功。

### T2：后端 Agent V6 模块骨架

- [ ] 新增 `packages/server-v2/src/agent-v6`。
- [ ] 新增 module、controller、service、dto、types。
- [ ] 在 `AppModule` 注册 `AgentV6Module`。
- [ ] controller 使用 `JwtAuthGuard` 和 `PermissionsGuard`。
- [ ] API 使用 `/api/agent-v6/*`。

验收：

- `GET /api/agent-v6/governance/overview` 可返回空状态。
- 无 V6 权限时被拒绝。

### T3：模型网关

- [ ] 新增 `AgentV6ModelGateway` 接口。
- [ ] 实现 `mock` adapter，用确定性输出支持测试。
- [ ] 实现 `openai` adapter 的配置入口，但 P0 测试默认不依赖真实 key。
- [ ] 所有模型输出经过 zod 或 class-validator schema 校验。

验收：

- 无模型 key 时 P0 测试可通过。
- 模型输出缺字段时能降级或报结构化错误。

### T4：运行追踪与 Evidence

- [ ] 实现 run、step、message、toolInvocation、permissionDecision、evidence 写入。
- [ ] 每个工具调用关联 runId 和 stepId。
- [ ] 每个回答关联 evidence。
- [ ] 治理 API 可查询 run 和 trace。

验收：

- 任意 P0 run 都能查到 trace。
- 回答中没有 evidence 的数据结论必须被拒绝或标记无数据。

### T5：Memory P0

- [ ] 实现会话记忆。
- [ ] 实现用户偏好记忆。
- [ ] 实现实体别名记忆。
- [ ] 增加记忆 scope、source、sensitivity、expiresAt、status。
- [ ] 增加记忆查看、禁用、删除 API。

验收：

- 同一会话能理解代词和上文时间范围。
- 用户可查看和禁用自己的长期记忆。
- 高敏字段默认不进入长期记忆。

### T6：Semantic Layer 与 Ontology P0

- [ ] 注册 12 个一级意图域。
- [ ] 注册核心对象、关系、状态机。
- [ ] 注册 P0 指标定义。
- [ ] 注册别名和口语表达。
- [ ] 提供 `/ontology` 和 `/metrics` API。

验收：

- 至少 50 条口语表达能识别 domain/intent 或触发追问。
- 至少 20 个指标有定义、公式、来源、权限和敏感级别。

### T7：模糊追问

- [ ] 实现 slot 缺失识别：时间、对象、指标、门店、动作。
- [ ] 实现低置信追问。
- [ ] 实现高风险动作强制确认。
- [ ] 返回结构化 `clarification`。

验收：

- “小王最近不太行”能追问小王身份和指标口径。
- “最近收入怎么样”能给默认时间假设或追问。
- “直接退款”被识别为 L4。

### T8：Capability Scanner P0

- [ ] 扫描前端菜单和路由。
- [ ] 扫描 API facade 和 real API。
- [ ] 扫描后端 controller。
- [ ] 扫描 Prisma schema。
- [ ] 扫描权限线索。
- [ ] 生成 capability snapshot 和 item。
- [ ] 在治理中心展示能力地图。

验收：

- 能按 12 个业务域归类。
- 能识别 read/write capability。
- 能标记 L3/L4 写操作为 blocked。
- 能输出至少 20 个只读工具候选。

### T9：Tool Registry 与 P0 只读工具

- [ ] 实现工具注册中心。
- [ ] 实现工具 schema 校验。
- [ ] 实现客户、预约、财务、库存、营销、员工、治理领域 P0 工具。
- [ ] 工具执行前调用 Policy Engine。
- [ ] 工具输出写入 evidence。

验收：

- 至少实现以下工具：`customer.churnRisk.list`、`reservation.today.list`、`reservation.emptySlot.list`、`finance.cashierAnomaly.scan`、`memberAsset.liability.summary`、`inventory.lowStock.list`、`inventory.expiringBatch.list`、`marketing.segment.preview`、`staff.performance.summary`、`capability.map.query`。
- 工具无权限时不执行。

### T10：Policy Engine 与安全护栏

- [ ] 实现 V6 权限码。
- [ ] 实现业务权限校验。
- [ ] 实现门店范围校验。
- [ ] 实现字段脱敏。
- [ ] 实现 L0-L4 动作风险判断。
- [ ] 实现 prompt injection 基础拦截。

验收：

- 无权限用户无法查询财务、库存、会员资产明细。
- 跨门店查询被拒绝。
- 手机号、余额、退款、提成按权限脱敏。
- L3/L4 动作被拦截。

### T11：Orchestrator P0

- [ ] 串联 message -> memory -> semantic -> policy -> tools -> evidence -> answer。
- [ ] 实现店长、营销、财务、库存、前台、数据审计 6 个 P0 角色。
- [ ] 支持单工具和多工具组合。
- [ ] 输出 actionCards，但 P0 只生成草案或拦截说明。

验收：

- 6 类主场景都能返回结构化回答。
- 回答包含 summary、evidence、nextBestActions、traceSummary。

### T12：前端 Agent V6 工作台

- [ ] 新增 `/agent-v6` 路由。
- [ ] 新增菜单入口“Agent V6 / Ami Operator”。
- [ ] 新增对话工作台页面。
- [ ] 支持追问、证据抽屉、动作卡、运行状态、错误提示。
- [ ] 支持反馈提交。

验收：

- 用户能发起 P0 查询。
- 缺参数时展示追问选项。
- 能打开证据抽屉。
- 无权限时展示清晰提示。

### T13：前端 Agent V6 治理中心

- [ ] 新增 `/system/agent-v6-governance`。
- [ ] 展示运行追踪。
- [ ] 展示能力地图。
- [ ] 展示工具注册中心。
- [ ] 展示记忆管理。
- [ ] 展示 Ontology 和指标。
- [ ] 展示评测结果。

验收：

- 管理员可查看 run trace。
- 可筛选 capability 状态和风险等级。
- 可查看工具启用状态。

### T14：P0 评测与验收集

- [ ] 建立 P0 评测用例。
- [ ] 覆盖老板、店长、前台、财务、库存、美容师 6 类主场景。
- [ ] 覆盖权限越权、缺参追问、无数据、敏感字段、L3/L4 拦截、证据引用。
- [ ] 接入后端 evaluation service。

验收：

- 评测用例不少于 60 条。
- P0 主路径通过率达到 95%。
- 安全拦截类用例 100% 通过。

### T15：验证脚本与文档

- [ ] 新增 `check:agent-v6` 脚本。
- [ ] 补开发记录。
- [ ] 补 P0 验收结果。
- [ ] 执行全量 P0 门禁。

建议命令：

```powershell
npm.cmd --prefix packages/server-v2 run db:generate
npm.cmd --prefix packages/server-v2 run test -- agent-v6 --runInBand
npm.cmd --prefix packages/server-v2 run build
npx.cmd vitest run src/app/pages/agent-v6 src/api/real/agentV6.test.ts src/test/permissions.test.ts
npm.cmd run build
git diff --check
```

验收：

- 后端测试通过。
- 前端测试通过。
- 前后端 build 通过。
- 文档记录已更新。

## 4. 里程碑

| 里程碑 | 输出 | 验收 |
| --- | --- | --- |
| M1 独立底座 | 数据模型、模块、API、模型网关 | 空 run 和 governance 可用 |
| M2 语义与扫描 | Ontology、指标、Scanner、能力地图 | 能力地图和指标 API 可用 |
| M3 工具与证据 | P0 工具、Policy、Evidence | 只读问数有证据和权限决策 |
| M4 工作台与治理 | 前端工作台、治理中心 | 管理端可操作 P0 |
| M5 评测与收口 | 评测集、门禁、文档 | P0 验收通过 |

## 5. 交付记录要求

开发完成后必须记录：

- 改动文件。
- 新增 API。
- 新增数据表。
- 已完成任务。
- 明确未做事项。
- 验证命令和结果。
- 已知风险。
- 下一步 P1 建议。
