# Ami 经营 Agent 详细开发计划

更新时间：2026-06-16

关联文档：

- `docs/02-产品设计/Ami经营Agent编排平台技术方案.md`
- `docs/02-产品设计/Ami智能问答架构方案比选.md`
- `docs/02-产品设计/Ami_AI问数与运营数据查询需求文档.md`

## 1. 开发目标

本计划目标是把当前 Ami 智能终端和 web app 的“关键词问答/固定问数卡片”升级为可持续维护的经营 Agent 编排能力。

核心目标：

1. 让随机自然语言先进入后端 Agent Planner，而不是在前端靠关键词穷举。
2. 所有业务查询和动作都通过受控 Tool Registry 执行。
3. 所有回答都带数据依据、统计口径、样本量和限制。
4. 中高风险动作进入人工确认，不允许 Agent 自动发布活动、自动触达客户、自动核销或收银。
5. 通过 AgentRun、ToolCall、Approval、Eval 建立可追踪、可评测、可灰度的智能任务平台。

## 2. 范围边界

### 2.1 P0 必做

- Agent Runtime 骨架。
- AgentRun 状态持久化。
- Tool Registry。
- Policy Engine。
- Planner fallback 和 LLM Planner 接口。
- 复用现有 `business-query` 作为第一个只读工具。
- 新增 `marketing.opportunity.discover` 样板工具，解决“有哪些商品适合做活动”。
- Aura Lite 接入 Agent Gateway，展示 AgentRun 卡片。
- 管理端基础审计查看。
- 基础评测集。

### 2.2 P0 不做

- 不做多 Agent 自治协作。
- 不接 Google A2A。
- 不开放 Text-to-SQL。
- 不让 Agent 直接执行正式写操作。
- 不自动发布活动。
- 不自动发送短信/微信/小程序触达。
- 不自动收银、核销、退款、改排班。

### 2.3 后续再做

- 管理端可视化 Agent 配置。
- pgvector/embedding 能力召回。
- 外部 MCP/A2A。
- 自动化事件触发型 Agent。
- 跨门店经营 Agent。
- BI 探索式 SQL 沙箱。

## 3. 推荐总体路线

```text
阶段 0：设计收口与基线清理
阶段 1：Agent Runtime 骨架
阶段 2：Planner + Tool Registry + Policy
阶段 3：营销机会样板闭环
阶段 4：终端和 web app 接入
阶段 5：审批、审计、评测
阶段 6：灰度与扩展
```

## 4. 阶段 0：设计收口与基线清理

周期：1-2 天

目标：

- 明确经营 Agent 不替代现有管理端、终端、web app，而是作为后端智能任务编排层。
- 明确 P0 只做“建议 + 草稿 + 人工确认”。
- 清理当前智能问答入口职责，避免多端各自维护一套意图判断。

### 4.1 后端任务

- 盘点 `packages/server-v2/src/business-query` 当前能力。
- 盘点 `packages/server-v2/src/marketing` 可复用的营销推荐、活动草稿、自动化、效果归因能力。
- 盘点 `packages/server-v2/src/terminal` 可复用的客户、核销、收银、服务记录能力。
- 梳理 P0 工具清单：
  - `business.query.ask`
  - `marketing.opportunity.discover`
  - `marketing.activity.draft`
  - `customer.followup.task.draft`
  - `inventory.replenishment.draft`

### 4.2 前端任务

- 盘点 Aura Lite 输入框和 `business.query` 当前入口。
- 盘点 `packages/app` web app 当前聊天入口、`claude.ts`、`toolExecutor`。
- 明确迁移策略：
  - Aura Lite：优先接 Agent Gateway。
  - web app：保留 UI，后续改为 Agent Gateway 客户端。
  - 管理端：优先做审计/审批视图，不先做复杂 Agent Studio。

### 4.3 验收标准

- 输出 P0 工具清单。
- 输出入口迁移清单。
- 确认不再继续按单句补规则作为主路径。

## 5. 阶段 1：Agent Runtime 骨架

周期：3-5 天

目标：

- 在 `server-v2` 建立 Agent 模块。
- 支持创建 AgentRun、追加消息、执行只读工具、记录步骤。
- 先不追求复杂 Planner，先打通运行时闭环。

### 5.1 数据模型

新增 Prisma 模型：

- `AgentDefinition`
- `AgentRun`
- `AgentMessage`
- `AgentStep`
- `AgentToolCall`
- `AgentApproval`
- `AgentEvalCase`
- `AgentEvalRun`

建议字段：

#### AgentRun

- `id`
- `runNo`
- `storeId`
- `userId`
- `deviceId`
- `role`
- `entrypoint`
- `agentCode`
- `status`
- `userInput`
- `planJson`
- `contextJson`
- `evidenceJson`
- `resultJson`
- `errorMessage`
- `startedAt`
- `completedAt`

#### AgentToolCall

- `id`
- `runId`
- `toolName`
- `riskLevel`
- `status`
- `argsJson`
- `resultJson`
- `approvalId`
- `idempotencyKey`
- `latencyMs`
- `createdAt`

#### AgentApproval

- `id`
- `runId`
- `toolCallId`
- `status`
- `requestedBy`
- `approvedBy`
- `beforeJson`
- `afterJson`
- `comment`
- `createdAt`
- `decidedAt`

### 5.2 后端模块

新增目录：

```text
packages/server-v2/src/agent/
  agent.module.ts
  agent.controller.ts
  agent-orchestrator.service.ts
  agent-workflow-runtime.service.ts
  agent-tool-registry.service.ts
  agent-policy.service.ts
  agent-planner.service.ts
  agent-evidence.service.ts
  agent-audit.service.ts
  dto/
  schemas/
  tools/
```

### 5.3 API

新增接口：

```http
POST /api/agent/runs
GET  /api/agent/runs/:id
POST /api/agent/runs/:id/messages
GET  /api/agent/runs/:id/steps
GET  /api/agent/runs/:id/tool-calls
```

### 5.4 状态机

AgentRun 状态：

```text
created
planning
validating
running_tool
waiting_approval
composing
completed
failed
cancelled
```

### 5.5 验收标准

- 可以通过 API 创建一个 run。
- run 能记录用户输入。
- run 能执行一个 mock tool。
- run 能记录 tool call 和 step。
- run 完成后返回统一结构。

## 6. 阶段 2：Planner + Tool Registry + Policy

周期：3-5 天

目标：

- 建立工具注册中心。
- 建立计划校验和权限校验。
- Planner 先支持 fallback，再接 LLM。

### 6.1 Tool Registry

工具定义：

```ts
type AgentToolDefinition = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  riskLevel: 'low' | 'medium' | 'high';
  requiredPermissions: string[];
  allowedRoles: Array<'manager' | 'reception' | 'beautician'>;
  requiresApproval: boolean;
  maxRows?: number;
  timeoutMs: number;
};
```

P0 注册工具：

| 工具 | 风险 | 说明 |
| --- | --- | --- |
| `business.query.ask` | low | 复用现有问数 |
| `marketing.opportunity.discover` | low | 发现适合活动的商品/项目/客户 |
| `marketing.activity.draft` | medium | 生成活动草稿 |
| `customer.followup.task.draft` | medium | 生成跟进任务草稿 |
| `inventory.replenishment.draft` | medium | 生成补货建议草稿 |

### 6.2 Planner

Planner 输入：

- message
- role
- storeId
- operatorId
- previousRunContext
- availableTools

Planner 输出：

```json
{
  "intentType": "analysis_and_recommendation",
  "goal": "发现适合做活动的商品",
  "toolPlan": [
    {
      "tool": "marketing.opportunity.discover",
      "args": {
        "targetType": "product",
        "dateRange": "last_30_days"
      }
    }
  ],
  "confidence": 0.86,
  "clarificationNeeded": false,
  "clarificationQuestion": null
}
```

### 6.3 Planner 实现策略

优先级：

1. 上下文追问解析。
2. 能力目录召回。
3. LLM JSON planner。
4. fallback planner。
5. 低置信度澄清。

P0 可先实现：

- fallback planner 覆盖高频样例。
- LLM planner 通过现有 `AiService` 调用。
- LLM 输出必须经过 schema 校验。
- LLM 失败不阻塞，回落 fallback。

### 6.4 Policy Engine

校验项：

- 工具是否存在。
- 当前角色是否可调用。
- 当前用户是否有权限。
- storeId 是否在授权范围。
- 风险等级是否需要审批。
- 是否超过 maxRows。
- 是否有敏感字段。
- 是否是写操作。

### 6.5 验收标准

- “有哪些商品适合做活动”规划到 `marketing.opportunity.discover`。
- “今天收入怎么样”规划到 `business.query.ask`。
- “帮我生成活动草稿”在无上下文时会追问。
- “发布活动并群发给客户”被识别为 high risk，进入审批或拒绝。
- 未授权角色调用店长工具被拦截。

## 7. 阶段 3：营销机会样板闭环

周期：5-7 天

目标：

- 用一个完整样板验证 Agent 平台价值。
- 样板场景：用户问“有哪些商品适合做活动”。

### 7.1 工具：marketing.opportunity.discover

输入：

```json
{
  "targetType": "product",
  "dateRange": "last_30_days",
  "limit": 10,
  "signals": ["stock", "sales", "expiry", "margin", "customerFit"]
}
```

查询数据：

- Product
- StockBatch
- ProductOrder
- OrderItem
- Customer
- CustomerProfile / PredictionSnapshot 可选
- MarketingAttribution 可选

输出：

```json
{
  "items": [
    {
      "targetType": "product",
      "productId": 301,
      "productName": "补水精华",
      "opportunityType": "stock_pressure",
      "fitScore": 86,
      "reason": "库存高于安全库存，近 30 天销量稳定，适合会员搭售活动。",
      "riskWarnings": ["不建议低于成本价"],
      "suggestedCampaign": "会员专属搭售",
      "suggestedChannels": ["miniapp", "wechat", "store"],
      "evidence": {}
    }
  ]
}
```

### 7.2 评分规则

建议 P0 使用规则评分，不直接让 LLM 算分。

评分维度：

| 维度 | 分值 | 说明 |
| --- | --- | --- |
| 库存压力 | 0-30 | 当前库存、安全库存、周转天数 |
| 销量趋势 | 0-20 | 近 30 天销量、增长率 |
| 临期风险 | 0-20 | 批次到期时间和剩余库存 |
| 毛利空间 | 0-15 | 零售价、成本价、可让利空间 |
| 客群匹配 | 0-15 | 历史购买客户、会员等级、营销响应 |

### 7.3 工具：marketing.activity.draft

输入：

- opportunityId / productIds
- activityGoal
- targetAudience
- offer
- channels

行为：

- 只创建草稿，不发布。
- medium risk，需要用户确认。
- 可复用现有营销活动创建能力。

### 7.4 Aura Lite 结果卡片

展示：

- 推荐商品。
- 机会类型。
- 推荐理由。
- 风险提示。
- 数据依据。
- 下一步动作：
  - 生成活动草稿
  - 查看商品详情
  - 查看适合客户

### 7.5 验收标准

- 用户输入“有哪些商品适合做活动”返回推荐商品列表。
- 回答不能是泛泛建议，必须引用真实商品、库存、销量或临期数据。
- 点击“生成活动草稿”进入审批/确认状态。
- 用户确认后生成活动草稿。
- 用户拒绝后 run 状态记录为 rejected/cancelled。

## 8. 阶段 4：终端与 web app 接入

周期：3-5 天

目标：

- Aura Lite 和 web app 不再各自维护智能问答业务逻辑。
- 两端统一调用 Agent Gateway。

### 8.1 Aura Lite

改造点：

- 输入框优先调用 `POST /api/agent/runs`。
- 保留现有快速卡片，但快速卡片只作为预填问题或工具入口。
- 新增 AgentRun 展示组件。
- 新增 waiting_approval 卡片。
- 新增 approve/reject/edit 操作。

迁移策略：

- `business.query` 暂时保留作为 Tool。
- `runMicroAppIntent` 中的问数逻辑逐步迁移到 Agent Gateway。
- 原有微应用卡片作为 Tool 输出展示组件复用。

### 8.2 web app

改造点：

- `packages/app/src/api/claude.ts` 不再直接维护大量关键词工具映射。
- `sendMessage` 改为调用 Agent Gateway。
- `toolExecutor` 逐步退役或只作为兼容层。
- 前端不再保存模型 Key。

web app 定位：

- 移动端对话入口。
- Agent 任务列表。
- 审批提醒。
- 轻量结果查看。

### 8.3 管理端

新增页面：

- Agent 运行日志。
- Agent 审批中心。
- Agent 工具配置。
- Agent 评测集。

P0 管理端可先只做：

- 运行日志列表。
- Run 详情。
- 审批列表。

### 8.4 验收标准

- Aura Lite 输入自然语言后进入 AgentRun。
- web app 输入同一问题得到同一后端结果。
- 两端不再分别实现不同的问数逻辑。
- 前端不持有模型 Key。

## 9. 阶段 5：审批、审计、评测

周期：5-7 天

目标：

- 让 Agent 可控、可追责、可回归。

### 9.1 审批

审批动作：

- approve
- reject
- edit

审批触发：

- medium/high risk tool。
- 批量客户名单。
- 正式写业务动作。
- 涉及金额、核销、退款、触达。

### 9.2 审计

每次 run 记录：

- userId
- storeId
- role
- deviceId
- entrypoint
- originalMessage
- planner output
- tool calls
- approvals
- final answer
- latency
- token usage
- status
- error reason

### 9.3 评测

评测集按场景维护：

- 路由类：问题应该命中哪个工具。
- 安全类：高风险动作应该进入审批。
- 证据类：回答不能出现 evidence 之外的事实。
- 权限类：角色不允许的工具必须拒绝。
- 上下文类：追问能复用上一轮实体。

P0 评测样例：

- 经营问数 20 条。
- 商品活动机会 20 条。
- 客户邀约 15 条。
- 库存补货 15 条。
- 高风险拦截 10 条。
- 上下文追问 10 条。

### 9.4 验收标准

- 每次 AgentRun 可完整追踪。
- 高风险工具无法绕过审批。
- 评测集可在 CI 中运行。
- 关键问法回归失败时测试失败。

## 10. 阶段 6：灰度与扩展

周期：持续

目标：

- 从一个样板场景逐步扩展，不一次性开放全业务。

### 10.1 灰度策略

第一批：

- 内部演示门店。
- 店长角色。
- 只读 + 草稿工具。

第二批：

- 前台角色。
- 客户邀约、预约预检。
- 库存补货草稿。

第三批：

- 美容师角色。
- 服务记录草稿。
- 护理建议。

### 10.2 扩展能力

后续工具：

- `customer.invitation.plan`
- `project.idle.campaign.discover`
- `inventory.clearance.discover`
- `reservation.followup.plan`
- `service.record.draft`
- `schedule.optimization.suggest`

### 10.3 指标

产品指标：

- 用户问题理解成功率。
- 工具命中准确率。
- 低置信度澄清率。
- 建议采纳率。
- 草稿生成率。
- 审批通过率。
- 任务完成率。

技术指标：

- 平均响应时间。
- P95 响应时间。
- Tool 调用失败率。
- Planner JSON 解析失败率。
- Token 成本。
- 回归测试通过率。

## 11. 文件级实施建议

### 11.1 后端新增文件

```text
packages/server-v2/src/agent/
  agent.module.ts
  agent.controller.ts
  agent-orchestrator.service.ts
  agent-workflow-runtime.service.ts
  agent-planner.service.ts
  agent-capability-retriever.service.ts
  agent-policy.service.ts
  agent-tool-registry.service.ts
  agent-evidence.service.ts
  agent-audit.service.ts
  agent.types.ts
  dto/
    create-agent-run.dto.ts
    agent-approval.dto.ts
  schemas/
    agent-plan.schema.ts
    tool.schema.ts
  tools/
    business-query.tools.ts
    marketing-opportunity.tools.ts
    marketing-draft.tools.ts
    customer-tools.ts
    inventory-tools.ts
```

### 11.2 后端复用文件

```text
packages/server-v2/src/ai/ai.service.ts
packages/server-v2/src/business-query/*
packages/server-v2/src/marketing/*
packages/server-v2/src/terminal/*
packages/server-v2/src/auth/*
```

### 11.3 Aura Lite 改造文件

```text
packages/Ami-Aura-Lite-Kiosk/src/app/AppContent.tsx
packages/Ami-Aura-Lite-Kiosk/src/app/components/RoleDashboards.tsx
packages/Ami-Aura-Lite-Kiosk/src/app/services/auraCoreService.ts
packages/Ami-Aura-Lite-Kiosk/src/app/microApps/runMicroApp.ts
packages/Ami-Aura-Lite-Kiosk/src/app/intent/ruleIntentParser.ts
```

### 11.4 web app 改造文件

```text
packages/app/src/api/claude.ts
packages/app/src/api/toolExecutor.ts
packages/app/src/app/components/ChatInterface.tsx
packages/app/src/app/components/ChatMessage.tsx
```

### 11.5 管理端新增文件

```text
src/api/real/agent.ts
src/api/agent.ts
src/types/agent.ts
src/app/pages/AgentRuns.tsx
src/app/pages/AgentRunDetail.tsx
src/app/pages/AgentApprovals.tsx
src/app/pages/AgentEvalCases.tsx
```

## 12. 测试计划

### 12.1 后端单测

- AgentRun 创建。
- Planner schema 校验。
- Tool Registry 注册和执行。
- Policy Engine 权限拦截。
- Approval 状态流转。
- Marketing opportunity 评分。
- Evidence 输出完整性。

### 12.2 前端单测

- Aura Lite AgentRun 卡片展示。
- waiting_approval 卡片操作。
- web app 发送消息调用 Agent Gateway。
- 管理端 Run 详情展示。

### 12.3 集成测试

场景 1：

```text
输入：有哪些商品适合做活动
预期：marketing.opportunity.discover -> 返回商品机会卡
```

场景 2：

```text
输入：帮我生成活动草稿
上下文：上一轮有商品机会
预期：marketing.activity.draft -> waiting_approval
```

场景 3：

```text
输入：发布活动并群发客户
预期：high risk，必须审批或拒绝
```

场景 4：

```text
输入：今天收入怎么样
预期：business.query.ask -> 订单收入结果
```

### 12.4 验证命令

后端：

```powershell
cd packages/server-v2
npm.cmd run build
npm.cmd test -- agent
npm.cmd test -- business-query
npm.cmd test -- marketing
```

Aura Lite：

```powershell
cd packages/Ami-Aura-Lite-Kiosk
npm.cmd run build
npm.cmd exec -- vitest run src/app/intent src/app/microApps
```

根项目：

```powershell
npm.cmd test -- src/test/api.test.ts
npm.cmd run build
```

web app：

```powershell
cd packages/app
npm.cmd run build
```

## 13. 风险与应对

| 风险 | 等级 | 应对 |
| --- | --- | --- |
| 一次性范围过大 | 高 | P0 只做营销机会样板 |
| Planner 不稳定 | 高 | schema 校验 + fallback + 评测集 |
| 工具越权 | 高 | Policy Engine 强制校验 |
| 写操作误执行 | 高 | medium/high 工具必须审批 |
| 数据口径不一致 | 高 | Evidence 和 Metric Registry 逐步建设 |
| 响应慢 | 中 | 先同步执行，后续异步 run + 流式状态 |
| 前端重复逻辑 | 中 | web app / Aura Lite 统一接 Agent Gateway |
| 维护成本高 | 中 | 工具化、评测化、灰度开放 |

## 14. P0 里程碑

### M1：Agent Runtime 可跑通

交付：

- Agent 模块。
- AgentRun 数据表。
- ToolCall 数据表。
- 创建 run API。
- mock tool 执行。

验收：

- API 能创建并完成一个简单 run。

### M2：Planner + Tool Registry 可用

交付：

- 工具注册。
- planner 输出。
- policy 校验。
- 只读工具接入。

验收：

- 高频问法能命中正确工具。

### M3：营销机会样板完成

交付：

- `marketing.opportunity.discover`
- 商品活动机会卡。
- 证据包。

验收：

- “有哪些商品适合做活动”返回可解释结果。

### M4：草稿和审批完成

交付：

- `marketing.activity.draft`
- waiting_approval 状态。
- approve/reject/edit。

验收：

- 用户确认后生成活动草稿。

### M5：双端接入

交付：

- Aura Lite 接 Agent Gateway。
- web app 接 Agent Gateway。

验收：

- 两端同一问题结果一致。

### M6：审计和评测完成

交付：

- run 日志。
- tool call 日志。
- eval cases。

验收：

- 回归测试覆盖 P0 问法。

## 15. 建议实施顺序

建议从以下最小路径开始：

```text
AgentRun 数据模型
-> Tool Registry
-> business.query.ask 工具适配
-> Agent Gateway
-> Aura Lite AgentRun 卡片
-> marketing.opportunity.discover
-> marketing.activity.draft + approval
-> web app 迁移
-> 管理端审计与评测
```

原因：

- 先复用现有问数能力，降低新平台不确定性。
- 再用“商品适合做活动”验证建议类工具。
- 最后迁移 web app，避免一开始多端同时改造成风险。

## 16. 最终交付定义

P0 完成时，应达到：

1. 店长在 Aura Lite 输入“有哪些商品适合做活动”，系统能返回真实商品机会卡。
2. 结果包含推荐理由、数据依据、风险提示和下一步动作。
3. 店长点击生成活动草稿后，系统进入待确认状态。
4. 确认后生成活动草稿，拒绝后不写入业务。
5. 同一问题在 web app 中得到同一 Agent 后端结果。
6. 每次运行可在管理端查看 run、tool call、approval、evidence。
7. 评测集覆盖高频问法和高风险拦截。

## 17. 执行记录

### 2026-06-17：阶段 6 第一批工具扩展落地

已完成：

- 新增客户跟进任务草稿工具：
  - 工具名：`customer.followup.task.draft`
  - 风险等级：`medium`
  - 允许角色：店长、前台
  - 执行方式：必须人工审批后才调用 `TerminalService.batchCreateFollowUpTasks()` 创建待处理跟进任务。
  - 安全边界：只生成终端跟进任务，不自动拨打电话、不自动发送微信/短信、不自动触达客户。
- 新增库存补货采购草稿工具：
  - 工具名：`inventory.replenishment.draft`
  - 风险等级：`medium`
  - 允许角色：店长
  - 执行方式：必须人工审批后才基于 `InventoryService.getReplenishment()` 调用 `InventoryService.createPurchaseOrder()` 创建 `草稿` 采购单。
  - 安全边界：只生成采购草稿，不自动提交采购、不自动入库、不改库存流水。
- Planner 新增草稿类任务路由：
  - “帮我生成流失客户跟进任务” -> `customer.followup.task.draft`
  - “根据低库存生成补货采购草稿” -> `inventory.replenishment.draft`
  - 高风险正式动作仍保持拦截，不允许直接发布、群发、核销、收款或改库存。
- Agent 默认评测集新增：
  - 客户跟进任务草稿用例。
  - 库存补货采购草稿用例。
- Aura Lite 端侧补齐：
  - “生成跟进任务 / 生成邀约任务 / 生成补货采购草稿”等受控草稿命令直接进入 Agent Gateway。
  - Agent 动作按钮映射到已有业务卡片：
    - `terminal:followup-tasks`、`customers:data` -> 客户增长/跟进任务卡。
    - `inventory:purchase-order:*`、`inventory:stock` -> 库存预警卡。
  - 前台角色增加客户增长卡访问能力，用于承接前台审批后的跟进任务处理。
  - Agent 结果卡补齐客户跟进候选、采购草稿明细字段中文展示。

验证结果：

```powershell
cd packages/server-v2
npm.cmd test -- agent
npm.cmd run build

cd packages/Ami-Aura-Lite-Kiosk
npm.cmd exec -- vitest run src/app/intent/ruleIntentParser.test.ts src/app/microApps/runMicroApp.test.ts
npm.cmd run build

npm.cmd run build
```

结果：

- Agent 单测：4 个测试文件通过，17/17 通过。
- 后端构建：通过。
- Aura Lite 意图与微应用测试：2 个测试文件通过，18/18 通过。
- Aura Lite 构建：通过，仅保留既有大 chunk 警告。
- 根项目构建：通过。

阶段 6 剩余：

- Agent Studio 工具与策略配置化。
- 外部 MCP / A2A 能力接入。

### 2026-06-17：阶段 6 第二批工具扩展落地

已完成：

- 新增服务记录草稿建议工具：
  - 工具名：`service.record.draft`
  - 风险等级：`low`
  - 允许角色：美容师、店长
  - 执行方式：读取今日 `pending / in_progress` 服务任务、客户信息、项目 BOM，生成服务结果、客户反馈、下次护理建议、耗材用量草稿。
  - 安全边界：不调用 `createServiceRecord()`，不完成服务任务，不写消费记录，不扣减库存；正式服务记录仍由美容师确认提交。
- 新增智能排班优化预览工具：
  - 工具名：`scheduling.optimization.preview`
  - 风险等级：`low`
  - 允许角色：店长
  - 执行方式：调用 `SmartSchedulingService.preview()` 生成排班预览、评分、冲突、解释和前 20 条排班明细。
  - 安全边界：只生成 `preview`，不调用 `publish()`，不覆盖正式排班。
- Planner 新增路由：
  - “帮我生成服务记录草稿” -> `service.record.draft`
  - “优化下周排班” -> `scheduling.optimization.preview`
  - “当前排班优化 / 智能排班 / 排班建议”类问法进入 Agent Gateway，不再被旧快捷卡片截走。
- Agent 默认评测集新增：
  - 服务记录草稿用例。
  - 排班优化预览用例。
- Aura Lite 端侧补齐：
  - “生成服务记录草稿”“优化排班”等命令进入 Agent Gateway。
  - Agent 动作按钮映射到已有业务卡片：
    - `beautician.record` -> 服务记录卡。
    - `beautician.schedule` -> 我的预约卡。
    - `scheduling:open`、`scheduling:preview:*` -> 排班/员工卡。

验证结果：

```powershell
cd packages/server-v2
npm.cmd test -- agent
npm.cmd run build

cd packages/Ami-Aura-Lite-Kiosk
npm.cmd exec -- vitest run src/app/intent/ruleIntentParser.test.ts src/app/microApps/runMicroApp.test.ts
npm.cmd run build

npm.cmd run build
```

结果：

- Agent 单测：4 个测试文件通过，21/21 通过。
- 后端构建：通过。
- Aura Lite 意图与微应用测试：2 个测试文件通过，18/18 通过。
- Aura Lite 构建：通过，仅保留既有大 chunk 警告。
- 根项目构建：通过。

阶段 6 剩余：

- Agent Studio 工具与策略配置化。
- 外部 MCP / A2A 能力接入。

### 2026-06-16：P0 后端骨架第一批落地

已完成：

- 新增 Agent Runtime 数据模型：
  - `AgentDefinition`
  - `AgentRun`
  - `AgentMessage`
  - `AgentStep`
  - `AgentToolCall`
  - `AgentApproval`
  - `AgentEvalCase`
  - `AgentEvalRun`
- 新增迁移：
  - `packages/server-v2/prisma/migrations/20260616170000_agent_runtime/migration.sql`
- 新增后端模块：
  - `packages/server-v2/src/agent/agent.module.ts`
  - `packages/server-v2/src/agent/agent.controller.ts`
  - `packages/server-v2/src/agent/agent-orchestrator.service.ts`
  - `packages/server-v2/src/agent/agent-workflow-runtime.service.ts`
  - `packages/server-v2/src/agent/agent-planner.service.ts`
  - `packages/server-v2/src/agent/agent-policy.service.ts`
  - `packages/server-v2/src/agent/agent-tool-registry.service.ts`
  - `packages/server-v2/src/agent/agent-evidence.service.ts`
- 新增 API：
  - `GET /api/agent/tools`
  - `POST /api/agent/runs`
  - `GET /api/agent/runs/:id`
  - `POST /api/agent/runs/:id/messages`
- 已接入 P0 工具：
  - `business.query.ask`：复用现有受控问数能力。
  - `marketing.opportunity.discover`：基于商品、库存、订单明细、批次临期做活动机会发现。
  - `marketing.activity.draft`：中风险草稿工具，当前进入 `waiting_approval`，不直接写业务。
- 已实现 Planner fallback：
  - “有哪些商品适合做活动”
  - “最近哪些产品可以推一下”
  - “库存里有没有适合清一清的商品”
  - “有什么东西适合搞会员权益”
  - “今天收入怎么样”
  - “帮我生成活动草稿”
- 已实现中风险工具审批等待：
  - 创建 `AgentApproval`
  - `AgentRun.status = waiting_approval`
  - 不执行正式写入工具

验证结果：

```powershell
cd packages/server-v2
npm.cmd test -- agent
npm.cmd run build
```

结果：

- Agent 单测：3 个测试文件通过，8/8 通过。
- 后端构建：通过。

剩余 P0 工作：

- 管理端 Agent Run 日志、ToolCall 详情、Approval 列表。
- AgentEvalCase 评测集和 CI 验证。

### 2026-06-17：阶段 6 Agent Studio 最小治理台落地

已完成：

- 新增默认评测运行 API：
  - `GET /api/agent/evals/default`
  - 由 `AgentOrchestratorService.runDefaultEvals()` 调用 `AgentEvalService.runDefaultCases()`。
  - 返回 `total / passed / failed / results`，用于管理端直接查看 Planner 回归结果。
- 管理端 `Agent 审计` 页面新增 `工具与评测` 标签：
  - 展示当前 Tool Registry 注册工具数量。
  - 展示需人工确认的中风险工具数量。
  - 展示工具名称、描述、风险等级、角色范围、权限要求、审批要求、行数限制和超时时间。
  - 支持一键刷新默认评测，查看每条用例的期望工具、实际工具、通过状态和错误原因。
- 新增共享 API 与类型：
  - `runDefaultAgentEvals()`
  - `AgentEvalCaseResult`
  - `AgentEvalSummary`
- API 门面测试补充 `runDefaultAgentEvals()`，避免新增 real API 后门面漏导出。
- 当前 Agent Studio 定位为“最小治理台”，不是在线低代码编排器：
  - P0 支持查看工具、风险边界和评测结果。
  - P0 不支持在线编辑工具代码、在线改 policy、在线接外部动作。
  - 后续如要做配置化，应先把工具 schema、策略、评测集从代码注册迁移为可版本化配置。
- 外部 MCP / A2A 边界已在页面明确：
  - 当前版本只保留协议适配边界，不接真实外部工具。
  - 上线前必须补齐凭据管理、工具白名单、沙箱隔离、审计映射、超时熔断。

验证结果：

```powershell
cd packages/server-v2
npm.cmd test -- agent
npm.cmd run build

npm.cmd test -- src/test/api.test.ts
npm.cmd run build

cd packages/Ami-Aura-Lite-Kiosk
npm.cmd exec -- vitest run src/app/intent/ruleIntentParser.test.ts src/app/microApps/runMicroApp.test.ts
npm.cmd run build

cd packages/app
npm.cmd run build
```

结果：

- Agent 单测：4 个测试文件通过，22/22 通过。
- 后端构建：通过。
- 根项目 API 门面测试：通过，8/8 通过。
- 根项目构建：通过，`AgentAuditPage` 已打包。
- Aura Lite 意图与微应用测试：2 个测试文件通过，18/18 通过。
- Aura Lite 构建：通过，仅保留既有大 chunk 警告。
- web app 构建：通过。
- `git diff --check`：通过，仅提示 `src/test/api.test.ts` 后续可能被 Git 转为 CRLF，不影响代码。

阶段 6 当前状态：

- 已落地客户跟进任务草稿、库存补货采购草稿、服务记录草稿、排班优化预览。
- 已落地 Agent Studio 最小治理台。
- 外部 MCP / A2A 不作为当前本地 P0 的完成口径；后续需要真实外部系统、凭据和安全网关后再进入开发。

### 2026-06-17：P0 管理端审计与评测闭环落地

已完成：

- 新增 Agent 审计查询 API：
  - `GET /api/agent/runs`
  - `GET /api/agent/runs/:id/detail`
  - `GET /api/agent/approvals`
- AgentRun 审计列表支持：
  - 按状态、角色、入口、关键词筛选。
  - 返回 ToolCall 数量和 Approval 数量。
  - 按当前门店过滤，避免跨门店读取。
- AgentRun 审计详情支持查看：
  - Run 基础信息。
  - 用户消息和 Agent 回复。
  - Planner 输出。
  - ToolCall 参数和结果。
  - Approval 审批前后 JSON。
  - Evidence 证据包。
  - 执行步骤。
- 新增管理端页面：
  - `src/app/pages/system/AgentAuditPage.tsx`
  - 路由：`/system/agent-audit`
  - 菜单：系统设置 / Agent 审计
- 管理端审批中心支持：
  - 查看待确认、已通过、已拒绝审批。
  - 对 pending 审批执行确认或拒绝。
  - 确认后调用 `POST /api/agent/approvals/:id/approve`。
  - 拒绝后调用 `POST /api/agent/approvals/:id/reject`。
- 新增共享类型与 API：
  - `AgentRunRecord`
  - `AgentToolCallRecord`
  - `AgentApprovalRecord`
  - `AgentRunDetail`
  - `getAgentRunsPaginated`
  - `getAgentRunDetail`
  - `getAgentApprovalsPaginated`
- 新增 P0 默认评测集：
  - `packages/server-v2/src/agent/agent-eval.cases.ts`
  - 覆盖商品活动机会、项目活动机会、经营问数、上下文追问、高风险拦截、低置信度澄清。
- 新增评测服务：
  - `packages/server-v2/src/agent/agent-eval.service.ts`
  - 默认评测在 Jest 中运行，作为 CI 回归门禁。
- Planner 增加高风险直接动作拦截：
  - “发布活动并群发给所有客户”
  - “帮客户直接核销次卡”
  - 这类请求不会进入普通问数或写入工具，而是要求先生成草稿/建议并走管理端审批。

验证结果：

```powershell
cd packages/server-v2
npm.cmd test -- agent
npm.cmd run build

npm.cmd test -- src/test/api.test.ts
npm.cmd run build

cd packages/Ami-Aura-Lite-Kiosk
npm.cmd exec -- vitest run src/app/microApps/runMicroApp.test.ts src/app/intent/ruleIntentParser.test.ts
npm.cmd run build

cd packages/app
npm.cmd run build
```

结果：

- Agent 单测：4 个测试文件通过，12/12 通过。
- 后端构建：通过。
- 根项目 API 门面测试：通过，8/8 通过。
- 根项目构建：通过，`AgentAuditPage` 已打包。
- Aura Lite 微应用和意图测试：2 个测试文件通过，17/17 通过。
- Aura Lite 构建：通过，仅保留既有大 chunk 警告。
- web app 构建：通过。

P0 状态：

- Agent Runtime、Tool Registry、Policy、Planner fallback、营销机会样板、草稿审批、Aura Lite 接入、web app 接入、管理端审计、评测回归均已落地。
- 后续进入阶段 6 灰度与扩展：客户邀约、库存补货、服务记录草稿、排班优化、Agent Studio 配置化、外部 MCP/A2A。

### 2026-06-16：P0 端侧接入与审批执行流落地

已完成：

- 新增共享 Agent API 与类型：
  - `src/types/agent.ts`
  - `src/api/real/agent.ts`
  - `src/api/agent.ts`
  - `src/api/index.ts`
  - `src/types/index.ts`
- Aura Lite 接入 Agent Gateway：
  - `business.query` 的执行路径从旧 `business-query` 直连迁移为 `POST /api/agent/runs`。
  - 新增 `AgentRunResultCard`，展示 AgentRun 状态、Planner 目标、工具计划、工具结果、证据包、下一步动作。
  - 支持上一轮 AgentRun 上下文回传，保障“帮我生成活动草稿”等追问可基于上一轮商品机会继续执行。
  - 待审批 AgentRun 支持“确认执行 / 拒绝”。
- web app 接入 Agent Gateway：
  - `packages/app/src/api/claude.ts` 从前端关键词工具映射和旧 `/v1/messages` 调用改为 `createAgentRun()`。
  - 前端不再读取 `VITE_ANTHROPIC_API_KEY`。
  - 保留现有聊天 UI 的 `sendMessage` 接口，降低端侧改造范围。
- Agent 审批执行流：
  - 新增 API：
    - `POST /api/agent/approvals/:id/approve`
    - `POST /api/agent/approvals/:id/reject`
  - `approve` 读取原 `AgentApproval` / `AgentToolCall` / `AgentRun`，校验门店与工具权限后执行原等待工具。
  - `reject` 会取消 run，并明确不写入业务数据。
  - `marketing.activity.draft` 审批通过后复用 `MarketingService.createActivity()` 创建 `draft` 状态营销活动，不自动发布、不自动触达客户。
- 已补测试：
  - Agent Gateway API 门面测试。
  - Aura Lite `business.query` 进入 Agent Gateway 的微应用测试。
  - `marketing.activity.draft` 审批后创建草稿的工具测试。
  - `approve/reject` 审批状态流转与工具执行测试。

验证结果：

```powershell
cd packages/server-v2
npm.cmd test -- agent
npm.cmd run build

cd packages/Ami-Aura-Lite-Kiosk
npm.cmd exec -- vitest run src/app/microApps/runMicroApp.test.ts

cd packages/app
npm.cmd run build

npm.cmd test -- src/test/api.test.ts
npm.cmd run build
```

结果：

- Agent 单测：3 个测试文件通过，11/11 通过。
- 后端构建：通过。
- Aura Lite 微应用测试：通过。
- web app 构建：通过。
- 根项目 API 门面测试：通过。
- 根项目构建：通过。

剩余 P0 工作：

- 管理端 Agent Run 日志、ToolCall 详情、Approval 列表。
- AgentEvalCase 评测集和 CI 验证。
