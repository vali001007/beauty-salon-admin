# Agent V5 美业全业务 Ontology 经营 Agent 独立开发计划

> 日期：2026-07-08
> 对应需求：`docs/02-产品设计/01-AI智能体与问数能力/Agent V5美业全业务Ontology经营Agent需求文档-2026-07-08.md`
> 架构口径：V5 独立开发，可复用底层服务能力，但不得递归调用 V1/V2/V3/V4 Agent 入口。

## 1. 开发目标

完成独立 Agent V5：

- 独立后端模块：`packages/server-v2/src/agent-v5/`
- 独立 API：`/agent-v5/*`
- 独立 runtime code：`agent_v5`
- 独立前端 API facade：`src/api/agentV5.ts`、`src/api/real/agentV5.ts`
- 独立管理端和终端 runtime 接入。
- 独立审计过滤和运行详情。
- 全业务 ontology router。
- V5 adapter 层复用 V2/V3/V4/V1 的底层能力，但不串 Agent 版本入口。

最终目标：

```text
V5 作为统一全业务经营 Agent 前台。
V2 做治理底座。
V3 做只读问数工具。
V4 lifecycle ontology 做客户生命周期领域服务。
V1 只作为历史固定工具参考或 adapter 来源。
```

## 2. 强制边界

### 2.1 禁止事项

开发中禁止：

- `AgentV5OrchestratorService` 调用 `AgentV2OrchestratorService`。
- `AgentV5OrchestratorService` 调用 `AgentV3OrchestratorService`。
- `AgentV5OrchestratorService` 调用 `AgentV4OrchestratorService`。
- V5 后端通过 HTTP 调 `/agent-v2/runs`、`/agent-v3/runs`、`/agent-v4/runs`。
- V5 前端复用 V4 的 API facade 作为运行入口。
- V5 run 写成 `agent_v2`、`agent_v3`、`agent_v4`。
- 在 V2/V3/V4 orchestrator 中加入 V5 分支。
- 为了 V5 修改旧版本行为。

### 2.2 允许事项

允许通过 adapter 复用：

- `AgentV3ControlledTextToSqlService`
- V2 capability / policy / governance service
- `CustomerLifecycleOntologyService`
- `MarketingService` lifecycle methods
- 稳定的业务 service，例如 inventory、operation-profit、orders、reservations
- `AgentWorkflowRuntimeService`

但 adapter 必须属于 V5 模块，且返回 V5 统一结构。

## 3. 目标架构

```text
packages/server-v2/src/agent-v5/
  agent-v5.module.ts
  agent-v5.controller.ts
  agent-v5-orchestrator.service.ts
  agent-v5.types.ts
  ontology/
    business-ontology.registry.ts
    agent-v5-semantic-router.service.ts
    agent-v5-context-builder.service.ts
    agent-v5-evidence-pack.service.ts
    agent-v5-constraint-guard.service.ts
  adapters/
    agent-v5-readonly-query.adapter.ts
    agent-v5-governance.adapter.ts
    agent-v5-lifecycle.adapter.ts
    agent-v5-business-tool.adapter.ts
    agent-v5-legacy-tool.adapter.ts
  eval/
    agent-v5-failure-diagnosis.service.ts
    agent-v5-eval-mapper.service.ts
  *.spec.ts
```

运行流程：

```text
POST /agent-v5/runs
  -> AgentV5OrchestratorService
  -> AgentV5SemanticRouterService
  -> AgentV5ContextBuilderService
  -> Adapter selection
  -> Tool execution / diagnosis / plan
  -> AgentV5EvidencePackService
  -> AgentV5ConstraintGuardService
  -> AgentWorkflowRuntimeService writes agent_v5
```

## 4. 后端开发任务

### 4.1 Agent V5 Module

新增文件：

- `agent-v5.module.ts`
- `agent-v5.controller.ts`
- `agent-v5-orchestrator.service.ts`
- `agent-v5.types.ts`
- `agent-v5-orchestrator.service.spec.ts`

接口：

```text
POST /agent-v5/runs
POST /agent-v5/runs/:id/messages
GET  /agent-v5/runs
GET  /agent-v5/runs/:id
GET  /agent-v5/runs/:id/detail
```

要求：

- 请求复用现有 Agent create/append request 类型，必要时新增 V5 context。
- 响应复用 `AgentRunResultV2` 或现有 block 协议。
- 所有 run 写 `agentCode = agent_v5`。
- 所有 message metadata 写 `architecture = agent_v5_business_ontology_agent`。

### 4.2 Business Ontology Registry

新增：

- `business-ontology.registry.ts`

内容：

- domains：客户、预约、收银、库存、财务、营销、员工、终端、风险、SOP。
- concepts：Customer、Reservation、ProductOrder、Product、OperationProfit、MarketingActivity、Beautician 等。
- aliases：中文常见问法。
- metrics：营业额、订单数、客单价、毛利、库存周转、预约到店率等。
- capabilities：业务能力清单。
- constraints：只读、草稿、审批、禁止。

P0 使用代码 registry，不新增表。

### 4.3 Semantic Router

新增：

- `agent-v5-semantic-router.service.ts`

职责：

- 识别 intent。
- 识别 domains。
- 识别 concepts。
- 识别需要的 adapter。
- 输出 route decision。

优先级：

1. 高确定性命令：提交审批、生成计划、查看审批。
2. 业务域关键词：收入、预约、库存、毛利、客户、营销、排班。
3. 本体概念别名：护理周期、次卡、核销、临期、退款、提成。
4. 时间范围补全。
5. 不确定时澄清。

### 4.4 Context Builder

新增：

- `agent-v5-context-builder.service.ts`

职责：

- 根据 route decision 构建最小上下文。
- 不把全库数据塞给 LLM。
- 对跨域问题构建 domain summary。
- 输出 missing data。

### 4.5 Adapter 层

#### 4.5.1 Readonly Query Adapter

文件：

- `agent-v5-readonly-query.adapter.ts`

复用：

- `AgentV3ControlledTextToSqlService`

要求：

- 不创建 V3 run。
- 不调用 V3 controller。
- 只返回 V5 标准 result。
- trace 中标记 `readOnlyVia = agent_v3_text_to_sql_service`。

#### 4.5.2 Governance Adapter

文件：

- `agent-v5-governance.adapter.ts`

复用：

- V2 manifest provider。
- V2 policy gateway。
- V2 capability service。

要求：

- 判断 capability 是否 active。
- 判断权限、字段策略、审批策略。
- 不创建 V2 run。
- 不直接执行 V2 orchestrator。

#### 4.5.3 Lifecycle Adapter

文件：

- `agent-v5-lifecycle.adapter.ts`

复用：

- `CustomerLifecycleOntologyService`
- `MarketingService` lifecycle methods

能力：

- lifecycle.diagnoseOpportunities
- lifecycle.getCustomerContext
- lifecycle.listServiceCycles
- lifecycle.reviewAttribution
- lifecycle.createBusinessPlan
- lifecycle.submitBusinessPlanApproval

要求：

- 不调用 `/agent-v4/*`。
- 不创建 V4 run。
- V5 计划和审批写入 V5 trace。

#### 4.5.4 Business Tool Adapter

文件：

- `agent-v5-business-tool.adapter.ts`

接入：

- orders。
- reservations。
- inventory。
- operation-profit。
- commission。
- marketing。

P0 可先只读，P1 增加草稿和审批动作。

#### 4.5.5 Legacy Tool Adapter

文件：

- `agent-v5-legacy-tool.adapter.ts`

用途：

- 只复用稳定且已验证的 V1 固定工具逻辑。
- 不让 V1 planner 决策。

### 4.6 Evidence Pack

新增：

- `agent-v5-evidence-pack.service.ts`

统一输出：

- sources。
- domains。
- concepts。
- filters。
- sampleSize。
- metrics。
- facts。
- risks。
- limitations。
- quality。

所有 answer 都必须带 evidence pack。

### 4.7 Constraint Guard

新增：

- `agent-v5-constraint-guard.service.ts`

检查：

- 权限。
- 字段脱敏。
- 高风险动作。
- 库存/产能承接。
- 触达疲劳。
- 财务结算边界。
- 禁止动作。

输出：

- allow。
- draft_only。
- approval_required。
- blocked。

### 4.8 Failure Diagnosis

新增：

- `agent-v5-failure-diagnosis.service.ts`

失败分类：

- ontology_route_gap
- capability_not_published
- readonly_query_blocked
- permission_denied
- data_not_found
- tool_not_supported
- tool_execution_failed
- missing_required_slot
- quality_insufficient
- high_risk_action_blocked

写入：

- `AgentRun.resultJson.failureDiagnosis`
- `AgentRun.evidenceJson`
- 后续可落表。

## 5. 前端开发任务

### 5.1 API facade

新增：

- `src/api/real/agentV5.ts`
- `src/api/agentV5.ts`

导出：

- `createAgentV5Run`
- `appendAgentV5Message`
- `getAgentV5Run`
- `getAgentV5RunDetail`
- `getAgentV5RunsPaginated`

更新：

- `src/api/index.ts`
- `src/types/agent.ts`

### 5.2 AmiAgentWorkspace

改造：

- Runtime selector 增加 V5。
- V5 模式调用 agentV5 API。
- V5 模式显示全业务快捷入口。
- V5 回答展示 route、domains、concepts、evidence、constraints。
- V1/V2/V3/V4 不受影响。

快捷入口：

- 今日经营概览。
- 本周重点客户。
- 库存与项目风险。
- 财务与毛利。
- 今日预约现场协调。
- 营销触达复盘。
- 能力质量诊断。

### 5.3 Agent 治理中心

改造：

- 支持按 `agent_v5` 过滤。
- 详情页展示：
  - route decision。
  - ontology concepts。
  - adapters。
  - evidence pack。
  - constraint result。
  - failure diagnosis。

### 5.4 终端 Ami Aura

改造：

- runtime 增加 `agent_v5`。
- agent runtime service 调用 V5 API。
- V5 context 标记：
  - `architecture = agent_v5_business_ontology_agent`
  - `deviceRole`
  - `storeId`
  - `terminalMode`

终端 V5 默认只允许：

- 今日任务建议。
- 客户跟进建议。
- 现场协调建议。
- 草稿和审批说明。

## 6. 阶段计划

### P0：独立 V5 骨架与全业务路由

目标：独立版本跑通，避免串版本。

任务：

- 新增 `agent-v5` module/controller/orchestrator。
- 新增 `BusinessOntologyRegistry`。
- 新增 semantic router。
- 新增 readonly query adapter。
- 新增 lifecycle adapter。
- 新增 evidence pack。
- 管理端接入 V5。
- 终端接入 V5。

验收：

- `/agent-v5/runs` 可创建 run。
- run 写 `agent_v5`。
- V5 不创建 V2/V3/V4 run。
- “今天店里情况怎么样”不返回单一生命周期机会。
- “今天营业额多少”走只读问数。
- “本周哪些客户该跟进”走 lifecycle adapter。

### P1：全业务能力扩展和 V2 治理接入

目标：V5 能覆盖核心全业务问题，并接入 V2 治理底座。

任务：

- 增加财务、库存、预约、员工、营销域 adapter。
- 接入 V2 governance adapter。
- active capability 可走 V2 policy。
- 未发布 capability 不直接阻断，返回缺口并降级。
- 增加 constraint guard。
- 增加 failure diagnosis。

验收：

- V2 的 519 次未发布能力 blocked 不在 V5 原样出现。
- 高风险动作进入审批。
- 字段脱敏生效。
- 各业务域都有 evidence pack。

### P2：评测闭环和治理中心

目标：把 650 题评测和用户反馈变成持续优化机制。

任务：

- 新增 V5 eval runner。
- 评测报告按 domain / intent / failure 分类。
- 用户“有用/无用”反馈关联 failure diagnosis。
- 治理中心展示 V5 质量看板。
- 新增 ontology gap / capability gap 修复建议。

验收：

- 650 题 V5 可用率不低于 91.4%。
- 每个失败有分类。
- 每个新增能力有 eval case。

### P3：图谱和角色子 Agent 增强

目标：增强多跳和 SOP 知识。

任务：

- 可选只读图谱投影。
- 可选 SOP GraphRAG。
- 可选角色子 Agent。
- Supervisor 只在 V5 内部，不暴露多个版本入口。

验收：

- 跨场景融合问题可用率提升。
- SOP/话术类回答带来源引用。

## 7. 测试计划

### 7.1 后端单测

新增：

- `agent-v5-orchestrator.service.spec.ts`
- `agent-v5-semantic-router.service.spec.ts`
- `agent-v5-evidence-pack.service.spec.ts`
- `agent-v5-constraint-guard.service.spec.ts`
- `agent-v5-readonly-query.adapter.spec.ts`
- `agent-v5-lifecycle.adapter.spec.ts`
- `agent-v5-governance.adapter.spec.ts`

覆盖：

- 创建 V5 run。
- 追加 V5 message。
- V5 不调用旧 Agent orchestrator。
- V5 不写旧 agentCode。
- 路由到财务、库存、预约、生命周期。
- 只读问数复用 V3 service。
- 生命周期复用领域 service。
- 高风险动作审批。
- evidence pack 必填。
- failure diagnosis。

### 7.2 前端测试

新增/扩展：

- `src/test/api.test.ts`
- `AmiAgentWorkspace` V5 runtime 测试。
- 治理中心 V5 过滤测试。
- 终端 runtime service V5 测试。

覆盖：

- agentV5 facade 导出。
- V5 模式调用 V5 API。
- V1/V2/V3/V4 不受影响。
- V5 快捷入口展示。
- V5 renderedBlocks 渲染。

### 7.3 评测

新增命令建议：

```powershell
npm.cmd --prefix packages/server-v2 run test -- agent-v5-orchestrator.service.spec.ts --runInBand
npx.cmd vitest run src/test/api.test.ts
npm.cmd --prefix packages/server-v2 run build
npm.cmd run build
```

新增 V5 650 题评测：

```powershell
npm.cmd --prefix packages/server-v2 run agent:v5:eval
```

验收目标：

- V5 可用率 >= 91.4%。
- V5 blocked 低于 V4 当前 52 次。
- V5 不出现 V2 式 519 次未发布能力阻断。
- V5 各角色可用率尽量 >= 90%。

## 8. 数据库计划

P0：

- 不新增数据库表。
- 使用 `AgentRun.resultJson`、`AgentRun.evidenceJson` 记录 V5 trace。
- 使用代码 registry。

P1 可选：

- 新增 V5 ontology registry 表。
- 新增 V5 route log 表。
- 新增 V5 failure diagnosis 表。

如果新增 migration，必须：

```powershell
npm.cmd --prefix packages/server-v2 run db:generate
npm.cmd --prefix packages/server-v2 run test -- agent-v5-orchestrator.service.spec.ts --runInBand
```

真实数据库 migration 需用户明确授权。

## 9. 文件清单

后端：

```text
packages/server-v2/src/agent-v5/
packages/server-v2/src/app.module.ts
packages/server-v2/src/agent/agent.types.ts
packages/server-v2/src/agent/agent-workflow-runtime.service.ts
packages/server-v2/prisma/schema.prisma   # P1 可选
```

前端：

```text
src/api/real/agentV5.ts
src/api/agentV5.ts
src/api/index.ts
src/types/agent.ts
src/app/pages/ami-agent/AmiAgentWorkspace.tsx
src/app/pages/system/AgentGovernanceCenter.tsx
```

终端：

```text
packages/Ami-Aura-Lite-Kiosk/src/app/services/agentRuntimeService.ts
packages/Ami-Aura-Lite-Kiosk/src/app/services/auraCoreService.ts
packages/Ami-Aura-Lite-Kiosk/src/app/components/TopStatusBar.tsx
packages/Ami-Aura-Lite-Kiosk/src/app/components/AgentMessageItem.tsx
```

评测：

```text
packages/server-v2/prisma/agent-v5-eval.ts
docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/
```

## 10. 风险与控制

| 风险 | 表现 | 控制 |
| --- | --- | --- |
| 版本串联 | V5 run 中出现 V4/V3/V2 run | 单测断言旧 orchestrator 未被调用 |
| 生命周期偏置 | 全店经营概览只讲客户机会 | router 增加 business_overview domain |
| V2 blocked 污染 | V5 原样返回能力未发布 | governance adapter 只给缺口，不终止主流程 |
| V3 SQL 阻断 | 事实问数失败 | 本体补时间范围、对象、字段，再调用 V3 |
| evidence 不统一 | 前端展示碎片化 | EvidencePackBuilder 强制统一 |
| 高风险动作误执行 | 发券/扣库存/下单 | ConstraintGuard + Approval |
| registry 膨胀 | 维护困难 | P1 DB 化 + 治理中心 |

## 11. 开发顺序建议

1. 建 V5 后端空模块，跑通 `/agent-v5/runs`。
2. 写 router 和 ontology registry。
3. 接 readonly query adapter。
4. 接 lifecycle adapter。
5. 接 evidence pack。
6. 接管理端 V5。
7. 接终端 V5。
8. 接 governance adapter。
9. 接 constraint guard。
10. 接 failure diagnosis。
11. 跑 650 题 V5 评测。
12. 根据失败样本补 registry 和 adapter。

## 12. 完成定义

V5 视为 P0 完成，必须满足：

- V5 独立 API 可用。
- V5 独立前端模式可用。
- V5 独立终端模式可用。
- V5 运行记录全是 `agent_v5`。
- V5 不调用旧 Agent 入口。
- 至少覆盖经营概览、事实问数、生命周期客户、库存风险、财务毛利、预约现场、营销归因 7 类问题。
- 每个回答都有 evidence pack。
- 高风险动作不直接执行。
- 定向单测和 build 通过。

V5 视为正式候选，必须满足：

- 650 题评测可用率 >= 91.4%。
- 各角色核心问题可用率 >= 90%。
- 失败原因 100% 可分类。
- 治理中心可查看 V5 trace。
- 产品验收确认 V5 不再偏单一生命周期场景。
