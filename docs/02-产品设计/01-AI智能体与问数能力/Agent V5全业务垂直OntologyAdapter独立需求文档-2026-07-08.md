# Agent V5 全业务垂直 Ontology Adapter 独立需求文档

> 日期：2026-07-08
> 更新：2026-07-09，新增模糊问法追问、V5 记忆能力、AI 治理中心接入 V5 要求
> 文档类型：产品需求文档 / 架构边界说明
> 适用范围：Ami Core 管理端、Ami Aura 终端、server-v2 Agent V5
> 核心结论：Agent V5 可以复用 V1/V2/V3/V4 的底层能力，但必须作为独立版本开发。V5 不递归调用旧 Agent 入口，不把 V5 逻辑写回旧版本，不让旧版本承担 V5 的编排职责。

## 1. 背景

当前 Ami Core 已经形成多代 Agent 能力：

- V1：多角色工具型 Agent，覆盖前台、库存、财务、员工等较多固定能力。
- V2：治理底座较强，有 capability、policy、审批、发布治理能力。
- V3：只读 Text-to-SQL 能力，适合事实问数，但复杂语义和安全计划容易阻断。
- V4：客户生命周期经营 Agent，围绕生命周期机会、经营计划、归因和审批形成较完整闭环。
- V5：目标是全业务经营 Agent，需要覆盖美业门店经营全链路。

V5 不应做成“更大的 V1/V2/V3/V4”。它应该是新的全业务语义中枢：

```text
用户自然语言
  -> V5 全局 Ontology Router
  -> V5 垂直 Ontology Adapter
  -> 底层 service/query/tool/policy
  -> V5 Evidence Pack
  -> V5 统一回答、计划、草稿、审批
```

其中，客户全生命周期价值 `AgentV5LifecycleAdapter` 是第一个成熟样板。其他业务模块可以采用同样方式建设垂直 Ontology，以提升问题命中率、回答稳定性和业务证据质量。

## 2. 产品定位

Agent V5 是 Ami Core 的全业务经营 Agent。

它面向店长、前台、美容师、营销、财务、库存、运营管理员等角色，统一回答：

- 今天店里情况怎么样。
- 哪些客户值得跟进。
- 哪些预约需要重点盯。
- 哪些商品库存会影响服务。
- 收银核销和退款有没有异常。
- 本月毛利为什么下降。
- 员工业绩谁需要关注。
- 为什么某个问题答不上来。

V5 的价值不是“多一个聊天入口”，而是把全业务数据、规则、动作和风险边界组织成可解释的经营能力。

## 3. 核心原则

### 3.1 独立版本原则

V5 必须有独立入口、独立编排、独立运行记录和独立审计。

必须满足：

- 后端独立模块：`packages/server-v2/src/agent-v5/`
- API 独立：`/agent-v5/*`
- runtime 独立：`agent_v5`
- 前端 facade 独立：`src/api/agentV5.ts`、`src/api/real/agentV5.ts`
- 终端 runtime 独立：`agent_v5`
- 审计按 `agentCode=agent_v5` 过滤

### 3.2 可复用底层能力原则

V5 可以复用其他版本已经沉淀的底层能力，但只能复用低层 service/tool/query/policy，不复用旧版本 Agent 入口。

允许：

- 复用 V1 的稳定工具逻辑和业务查询经验。
- 复用 V2 的治理、能力发布、权限、审批策略。
- 复用 V3 的受控 Text-to-SQL service 和 SQL guard。
- 复用 V4 的客户生命周期领域 service、经营计划和归因方法。
- 复用现有业务 service，例如 customer、order、inventory、marketing、reservation、operation-profit、commission。

禁止：

- V5 调用 `/agent/runs`、`/agent-v2/runs`、`/agent-v3/runs`、`/agent-v4/runs`。
- V5 调用 V1/V2/V3/V4 orchestrator 来完成回答。
- V5 创建旧版本 run。
- V5 run 写成 `agent_v1`、`agent_v2`、`agent_v3` 或 `agent_v4`。
- 在 V1/V2/V3/V4 orchestrator 里加入 V5 分支。
- 把 V5 的 ontology、adapter、constraint、evidence 逻辑写回旧版本。

### 3.3 垂直 Ontology 原则

V5 不只靠关键词匹配。每个核心业务域都要有自己的垂直 Ontology Adapter。

垂直 Ontology 要定义：

- 业务概念。
- 同义词。
- 关键实体。
- 关系。
- 指标口径。
- 可执行能力。
- 风险边界。
- 证据来源。
- 失败原因。

这样才能把“自然语言问题”稳定转换成“业务能力调用”。

## 4. 总体架构

```text
Agent V5
  ├─ AgentV5Controller
  ├─ AgentV5OrchestratorService
  ├─ Ontology
  │   ├─ BusinessOntologyRegistry
  │   ├─ AgentV5SemanticRouterService
  │   ├─ AgentV5ContextBuilderService
  │   ├─ AgentV5ClarificationService
  │   ├─ AgentV5MemoryService
  │   ├─ AgentV5EvidencePackService
  │   └─ AgentV5ConstraintGuardService
  ├─ Vertical Adapters
  │   ├─ AgentV5LifecycleAdapter
  │   ├─ AgentV5ReceptionAdapter
  │   ├─ AgentV5CashierAdapter
  │   ├─ AgentV5BeauticianAdapter
  │   ├─ AgentV5ScheduleAdapter
  │   ├─ AgentV5FinanceAdapter
  │   ├─ AgentV5InventorySupplyAdapter
  │   ├─ AgentV5StaffPerformanceAdapter
  │   ├─ AgentV5MarketingAdapter
  │   └─ AgentV5GovernanceAdapter
  └─ Existing Low-level Services
      ├─ V3 ControlledTextToSqlService
      ├─ V2 Governance / Policy / Approval services
      ├─ CustomerLifecycleOntologyService
      ├─ MarketingService
      ├─ InventoryService
      ├─ OperationProfitService
      ├─ CommissionService
      ├─ Reservation / Schedule services
      └─ BusinessQueryService
```

## 5. 全局 Ontology Router 需求

V5 全局 Router 负责第一层判断。

输入：

- 用户问题。
- 当前角色。
- 当前门店。
- 当前终端/管理端上下文。
- 历史对话摘要。
- V5 记忆快照。
- 权限和运行模式。

输出：

```ts
type AgentV5RouteDecision = {
  intent:
    | 'business_overview'
    | 'readonly_query'
    | 'lifecycle_diagnosis'
    | 'reservation_coordination'
    | 'cashier_reconciliation'
    | 'inventory_risk'
    | 'finance_margin'
    | 'staff_performance'
    | 'marketing_growth'
    | 'governance_diagnosis'
    | 'clarify';
  domains: string[];
  concepts: string[];
  entities: Array<{
    type: string;
    id?: string | number;
    name?: string;
    confidence: number;
  }>;
  capabilityCandidates: string[];
  adapterCandidates: string[];
  confidence: number;
  riskLevel: 'read' | 'draft' | 'approval_required' | 'blocked';
  missingSlots: string[];
  ambiguity?: {
    type: 'domain' | 'entity' | 'metric' | 'time_range' | 'scope' | 'action' | 'multi_intent';
    candidates: string[];
    question: string;
  };
  fallbackPolicy: 'ask_clarification' | 'readonly_query' | 'domain_summary' | 'blocked';
  reason: string;
};
```

路由要求：

- “今天店里情况怎么样”应命中经营概览，不应默认落到生命周期机会。
- “张雯还有什么卡”应命中前台客户查询或收银卡项查询。
- “今天核销多少次卡”应命中收银核销。
- “谁下午有空”应命中预约排班。
- “本月毛利低的项目”应命中财务经营。
- “哪些商品会影响项目服务”应命中库存供应链。
- “宋乔这个月业绩怎么样”应命中员工业绩。
- “为什么刚才答不上来”应命中治理与质量。

## 6. 垂直 Adapter 统一协议

每个 adapter 必须实现统一协议：

```ts
type AgentV5AdapterInput = {
  runId: number;
  storeId: number;
  userId?: number;
  role: string;
  message: string;
  route: AgentV5RouteDecision;
  slots: Record<string, unknown>;
  permissions: string[];
  memory: AgentV5MemorySnapshot;
  context: Record<string, unknown>;
};

type AgentV5AdapterResult = {
  status: 'success' | 'no_data' | 'blocked' | 'failed' | 'draft';
  title: string;
  summary: string;
  data?: unknown;
  evidence: AgentV5EvidencePack;
  renderedBlocks: AuraResponseBlock[];
  actions: Array<{
    label: string;
    action: string;
    riskLevel: 'low' | 'medium' | 'high';
    approvalRequired?: boolean;
  }>;
  failureReason?: string;
};
```

adapter 必须遵守：

- 只接收 V5 route decision。
- 只返回 V5 adapter result。
- 不直接返回旧版本 Agent 回答。
- 不创建旧版本 run。
- 不修改旧版本运行状态。
- 不绕过 V5 constraint guard。

## 7. Evidence Pack 需求

V5 每个回答必须带统一证据包。

```ts
type AgentV5EvidencePack = {
  sources: string[];
  domains: string[];
  concepts: string[];
  entities: Array<{
    type: string;
    id?: string | number;
    name?: string;
  }>;
  filters: string[];
  sampleSize: number;
  metrics: Record<string, string | number>;
  facts: Array<{
    source: string;
    id?: string | number;
    label: string;
    value?: string | number;
    occurredAt?: string;
  }>;
  risks: string[];
  limitations: string[];
  quality: Record<string, string | number | null>;
};
```

证据包必须回答：

- 用了哪些表或服务。
- 时间范围是什么。
- 样本量是多少。
- 指标口径是什么。
- 哪些数据缺失。
- 哪些结论只能作为建议，不能作为财务结算或正式业务动作依据。

## 8. 垂直 Ontology Adapter 清单

### 8.1 客户生命周期价值 Adapter

模块名：`AgentV5LifecycleAdapter`

定位：客户价值、生命周期阶段、护理周期、营销机会、经营计划和归因闭环。

核心对象：

- Customer。
- CustomerLifecycleSnapshot。
- CustomerOpportunity。
- CustomerServiceCycleState。
- LifecycleAttributionEvent。
- CustomerCard。
- Reservation。
- ProductOrder。
- MarketingAutomationTouch。

典型问题：

- “本周哪些客户该跟进？”
- “哪些客户护理周期到期？”
- “沉睡客户怎么召回？”
- “最近一次触达效果怎么样？”
- “生成本周经营计划。”

复用来源：

- `CustomerLifecycleOntologyService`
- `MarketingService` lifecycle 方法
- 生命周期经营计划和归因方法

禁止：

- 调用 V4 Agent 入口。
- 创建 `agent_v4` run。
- 自动发券、群发、改客户资产。

### 8.2 前台客户查询 Adapter

模块名：`AgentV5ReceptionAdapter`

定位：前台接待的客户查询、预约状态、卡项权益和到店提醒。

核心对象：

- Customer。
- CustomerProfile。
- CustomerCard。
- Reservation。
- CardUsageRecord。
- TerminalFollowUpTask。

典型问题：

- “张雯今天有没有预约？”
- “这个客户还有什么卡和权益？”
- “今天有哪些客户还没到店？”
- “手机号后四位 1234 是哪个客户？”

复用来源：

- V1 `reception.customer.lookup` 的底层查询逻辑。
- V1 `reception.card.benefit.summary` 的底层查询逻辑。
- customer/reservation/card service。

禁止：

- 自动核销。
- 自动改卡项。
- 未脱敏展示手机号等敏感信息。

### 8.3 收银核销 Adapter

模块名：`AgentV5CashierAdapter`

定位：收银单、核销、办卡、充值、退款、支付流水和日结差异。

核心对象：

- ProductOrder。
- OrderItem。
- PaymentRecord。
- RefundRecord。
- CustomerCard。
- CardUsageRecord。
- DailySettlement。

典型问题：

- “今天核销了多少次卡？”
- “这笔收银单明细是什么？”
- “张雯这张卡还剩几次？”
- “今天收银和退款对不上差在哪里？”

复用来源：

- V1/V3 订单、核销、财务事实查询逻辑。
- order/payment/refund/card usage service。
- V3 readonly query service。

禁止：

- 自动确认收款。
- 自动退款。
- 自动扣卡。
- 自动修改订单。

### 8.4 美容师服务 Adapter

模块名：`AgentV5BeauticianAdapter`

定位：美容师今日服务、客户护理准备、服务记录草稿和复购机会。

核心对象：

- Beautician。
- ServiceTask。
- Reservation。
- Customer。
- CustomerCard。
- Project。
- ServiceRecord。

典型问题：

- “我今天服务哪些客户？”
- “下一个客户有什么注意事项？”
- “这个客户适合推荐什么护理？”
- “我这个月表现怎么样？”

复用来源：

- V1 美容师服务相关工具逻辑。
- service task service。
- lifecycle service。
- commission/performance service。

禁止：

- 自动提交正式服务记录。
- 自动销售项目。
- 自动扣卡。
- 越权查看其他员工客户信息。

### 8.5 预约排班 Adapter

模块名：`AgentV5ScheduleAdapter`

定位：预约、排班、产能、空档、现场协调和预约风险。

核心对象：

- Schedule。
- Reservation。
- Beautician。
- BeauticianAvailability。
- AppointmentGapOpportunity。
- Project。

典型问题：

- “今天谁有空能接水光？”
- “下午有没有美容师空档？”
- “今天哪些预约要重点盯？”
- “本周排班有什么风险？”

复用来源：

- scheduling service。
- reservation service。
- V1 `schedule.diagnose` 和 `reception.schedule.availability` 底层逻辑。

禁止：

- 自动改排班。
- 自动取消预约。
- 自动确认预约。

### 8.6 财务经营 Adapter

模块名：`AgentV5FinanceAdapter`

定位：收入、毛利、成本、退款折扣、对账、日结和利润风险。

核心对象：

- ProductOrder。
- PaymentRecord。
- RefundRecord。
- OperationProfit。
- DailySettlement。
- CommissionRecord。
- StockCostSnapshot。

典型问题：

- “今天营业额多少？”
- “这个月哪些项目毛利低？”
- “退款折扣有没有异常？”
- “日结和订单对不上是什么原因？”

复用来源：

- operation-profit service。
- finance metrics service。
- V3 readonly query service。
- V1 finance margin/report/audit 底层逻辑。

禁止：

- 自动修改日结。
- 自动确认退款。
- 自动生成正式财务结算。
- 把轻量归因当作财务结算依据。

### 8.7 库存供应链 Adapter

模块名：`AgentV5InventorySupplyAdapter`

定位：库存风险、项目 BOM、耗材保障、补货、采购和供应商建议。

核心对象：

- Product。
- StockMovement。
- ProductStockBatch。
- ProjectBomItem。
- Supplier。
- PurchaseOrder。
- InventoryRisk。

典型问题：

- “哪些商品库存不足？”
- “哪些耗材会影响项目服务？”
- “本周应该优先补哪些货？”
- “哪些商品适合一起采购？”

复用来源：

- inventory service。
- V1 inventory risk/replenishment/supplier 底层逻辑。
- IndustryServiceTemplate 与 Project BOM 映射能力。

禁止：

- 自动扣库存。
- 自动创建采购单。
- 自动调价。
- 自动改商品资料。

### 8.8 员工业绩 Adapter

模块名：`AgentV5StaffPerformanceAdapter`

定位：员工服务、销售、提成、完成率、人效和绩效风险。

核心对象：

- Beautician。
- User。
- CommissionRecord。
- Reservation。
- ProductOrder。
- ServiceTask。

典型问题：

- “本月美容师业绩排行。”
- “谁的服务完成率低？”
- “宋乔这个月业绩怎么样？”
- “我的表现怎么样？”

复用来源：

- commission service。
- V1 staff performance 底层逻辑。
- operation-profit/finance 相关成本和提成数据。

禁止：

- 普通美容师查看他人敏感绩效。
- 自动改提成。
- 自动调整排班。

### 8.9 营销增长 Adapter

模块名：`AgentV5MarketingAdapter`

定位：客群、活动、权益、自动化、触达和归因。

核心对象：

- MarketingActivity。
- MarketingAutomationRule。
- Promotion。
- MarketingAutomationTouch。
- MarketingAttribution。
- RecommendationEvent。
- CustomerOpportunity。

典型问题：

- “最近活动效果怎么样？”
- “哪些客户适合发回店礼？”
- “生成沉睡客户召回活动草稿。”
- “自动化触达转化如何？”

复用来源：

- marketing service。
- lifecycle opportunity。
- V1 marketing 工具经验。
- V2 approval/policy。

禁止：

- 自动群发。
- 自动发券。
- 自动修改权益资产。
- 自动发布正式活动。

### 8.10 治理与质量 Adapter

模块名：`AgentV5GovernanceAdapter`

定位：解释 V5 为什么命中、为什么失败、缺什么能力、怎么改进。

核心对象：

- AgentRun。
- AgentStep。
- AgentApproval。
- Capability。
- Policy。
- OntologyConcept。
- FailureDiagnosis。

典型问题：

- “为什么这个问题答不上来？”
- “刚才为什么命中库存？”
- “V5 哪些能力还缺？”
- “哪些问题失败最多？”

复用来源：

- V2 governance/policy/capability service。
- V5 failure diagnosis。
- 评测报告。

禁止：

- 原样返回 V2 blocked 文案。
- 直接改能力发布状态。
- 把 V5 逻辑写回 V2/V3/V4。

## 9. 版本复用边界

| 来源 | 允许复用 | 禁止复用 |
| --- | --- | --- |
| V1 | 稳定工具逻辑、业务查询经验、评测样例 | V1 controller、V1 orchestrator、V1 run、V1 planner |
| V2 | capability、policy、approval、field scope、发布状态 | V2 run、V2 orchestrator、V2 blocked 主流程 |
| V3 | ControlledTextToSqlService、SQL guard、schema mapping | V3 run、V3 controller、V3 orchestrator |
| V4 | 生命周期领域 service、经营计划、归因、质量方法 | V4 run、V4 controller、V4 orchestrator |

正确示例：

```text
AgentV5FinanceAdapter
  -> OperationProfitService
  -> V3 ControlledTextToSqlService
  -> V5 Evidence Pack
```

错误示例：

```text
AgentV5FinanceAdapter
  -> /agent-v3/runs
  -> AgentV3Orchestrator
  -> V3 answer
```

## 10. 动作边界

V5 允许：

- 查询。
- 诊断。
- 解释。
- 生成建议。
- 生成计划草稿。
- 生成活动草稿。
- 生成自动规则草稿。
- 生成终端跟进任务草稿。
- 提交审批申请。

V5 禁止：

- 自动发券。
- 自动群发。
- 自动改客户资产。
- 自动扣库存。
- 自动创建订单。
- 自动退款。
- 自动改排班。
- 自动发布活动。
- 自动确认财务结算。

## 11. 前端需求

### 11.1 管理端 Ami Agent

要求：

- runtime selector 支持 V5。
- V5 模式只调用 `agentV5` API。
- V5 显示全业务快捷入口。
- V5 回答展示 route、adapter、entity、evidence、limitations、actions。
- V5 对模糊问法展示追问卡片，支持用户点击选项或直接补充文本。
- V5 对多轮问题展示当前继承的时间范围、实体和业务域，避免用户不知道系统沿用了什么上下文。
- V1/V2/V3/V4 行为不受影响。

快捷入口：

- 今日经营概览。
- 本周重点客户。
- 前台客户查询。
- 收银核销复盘。
- 今日预约现场协调。
- 库存与项目风险。
- 财务毛利诊断。
- 员工业绩分析。
- 营销触达复盘。
- 能力质量诊断。

### 11.2 Ami Aura 终端

要求：

- 终端 runtime 支持 `agent_v5`。
- 终端 V5 默认面向现场轻动作。
- 高风险动作只展示审批说明。
- 不能绕过正式业务流程执行收银、库存、订单、排班写动作。

### 11.3 治理中心

要求：

- 支持按 `agentCode=agent_v5` 过滤。
- 展示 route decision。
- 展示 adapter 命中。
- 展示模糊问法追问记录，包括触发原因、候选选项、用户选择和是否命中。
- 展示 V5 记忆使用记录，包括记忆类型、来源、有效期、是否参与路由、是否参与回答。
- 展示 evidence pack。
- 展示 constraint result。
- 展示 failure diagnosis。
- 展示各垂直 adapter 命中率和失败原因。
- 支持 V5 专属治理视图：Ontology Router、Adapter 命中、Memory、Clarification、Evidence、Constraint、Eval Gap。

## 12. 后端接口需求

V5 独立接口：

```text
POST /agent-v5/runs
POST /agent-v5/runs/:id/messages
GET  /agent-v5/runs
GET  /agent-v5/runs/:id
GET  /agent-v5/runs/:id/detail
```

要求：

- 所有 run 写 `agentCode = agent_v5`。
- 所有 metadata 写 `architecture = agent_v5_business_ontology_agent`。
- 不创建 V1/V2/V3/V4 run。
- 不调用旧版本 Agent controller。
- 不依赖旧版本前端 API facade。

## 13. 模糊问法追问功能

### 13.1 产品目标

V5 不能在用户问题模糊时强行猜测，也不能简单回答“请说清楚”。它需要把模糊点转成可选择、可继续执行的追问。

目标：

- 降低路由误命中。
- 降低实体识别错误。
- 降低“答非所问”。
- 让用户用一次点击或一句补充就能继续。
- 将追问过程沉淀到治理中心，反向优化 ontology 和 adapter。

### 13.2 触发场景

V5 在以下场景必须触发追问：

| 模糊类型 | 示例 | 追问目标 |
| --- | --- | --- |
| 业务域模糊 | “今天情况怎么样” | 确认是经营概览、预约现场、财务收入还是客户跟进 |
| 实体模糊 | “张姐今天来了吗” | 确认具体客户或员工 |
| 指标模糊 | “今天收入多少” | 确认营业额、实收、流水、毛利或充值 |
| 时间模糊 | “最近表现怎么样” | 确认今天、本周、本月、近 30 天 |
| 范围模糊 | “谁表现好” | 确认全店、本人、某门店、某角色 |
| 动作模糊 | “处理一下这些客户” | 确认查看建议、生成草稿、提交审批 |
| 多意图冲突 | “查库存并发活动” | 拆分为库存诊断和营销草稿两步 |

### 13.3 追问策略

V5 使用三档策略：

1. 自动补全：置信度高且风险低时，自动采用默认值，并在回答中说明“已按本月/本店/全店口径计算”。
2. 轻追问：缺少时间、实体、指标等关键槽位时，展示 2-4 个选项。
3. 阻断追问：涉及高风险动作或多意图冲突时，不执行动作，先确认用户意图。

默认规则：

- 事实问数缺时间范围时，默认优先使用“今天”或“本月”，但必须展示口径。
- 涉及客户、订单、卡项、员工等实体冲突时，必须追问。
- 涉及发券、群发、退款、扣库存、改排班、改订单等动作时，必须追问并进入审批或阻断。
- 同时命中两个以上 adapter 且置信度差距小于 15% 时，必须追问。

### 13.4 追问卡片

V5 输出 `clarification_card`：

```ts
type AgentV5ClarificationCard = {
  kind: 'clarification_card';
  title: string;
  question: string;
  ambiguityType: 'domain' | 'entity' | 'metric' | 'time_range' | 'scope' | 'action' | 'multi_intent';
  options: Array<{
    label: string;
    value: string;
    description?: string;
    confidence?: number;
  }>;
  allowFreeText: boolean;
  defaultOption?: string;
};
```

前端要求：

- 管理端和终端都能渲染追问卡。
- 用户点击选项后，继续当前 V5 run，不新建旧版本 run。
- 用户输入补充文本后，V5 合并上一轮 route decision 和新槽位重新执行。
- 追问卡必须显示当前已识别内容，例如“已识别：财务 / 收入 / 今天”。

### 13.5 追问记账

每次追问必须写入 V5 trace：

```ts
type AgentV5ClarificationTrace = {
  runId: number;
  messageId?: number;
  ambiguityType: string;
  candidates: string[];
  question: string;
  selectedValue?: string;
  resolved: boolean;
  adapterBefore?: string[];
  adapterAfter?: string[];
};
```

P0 可写入 `AgentRun.resultJson`。P1 可接入 AI 治理中心做统计。

## 14. V5 记忆能力

### 14.1 产品目标

V5 需要具备受控记忆能力，让多轮对话更自然，也让治理中心能看到“系统为什么沿用了某个上下文”。

记忆不是让 Agent 自行编造事实。V5 记忆必须是可解释、可过期、可撤销、可审计的上下文资产。

### 14.2 记忆分层

V5 采用四层记忆：

| 记忆层 | 生命周期 | 例子 | 存储建议 |
| --- | --- | --- | --- |
| Run Working Memory | 当前对话内 | 上一轮提到的客户张雯、时间范围本月 | `AgentRun.resultJson.memory` |
| User Preference Memory | 用户级，可过期 | 店长常看毛利、默认关注本店、本月口径 | P0 写 run，P1 可独立表 |
| Store Business Memory | 门店级，可过期 | 本店近期重点是沉睡召回、库存临期、毛利低项目 | P0 从业务数据实时生成 |
| Governance Memory | 治理级，长期 | 哪类问题经常失败、哪个 adapter 命中率低 | AI 治理中心统计 |

### 14.3 记忆内容

允许记忆：

- 最近对话实体：客户、商品、项目、订单、员工、预约。
- 用户偏好：常用时间范围、常看指标、常用业务域。
- 业务上下文：最近生成的经营计划、最近一次触达复盘、最近查看的库存风险。
- 治理结果：失败问题、追问结果、adapter 命中纠偏。

禁止记忆：

- 未脱敏手机号、证件号、openid、支付凭证等敏感信息。
- 用户未授权的跨门店数据。
- 旧版本 Agent 的原始回答作为事实。
- 未经证据验证的推断。
- 已过期的业务事实继续用于回答。

### 14.4 记忆使用规则

V5 使用记忆时必须遵守：

- 记忆只能补上下文，不能替代实时事实查询。
- 事实型问题必须重新查数据。
- 记忆参与回答时，Evidence Pack 要标记 `memoryUsed`。
- 记忆存在冲突时，优先实时数据，其次当前 run 上下文，再其次用户偏好。
- 记忆超过有效期必须失效。
- 高风险动作不能仅凭记忆执行。

示例：

```text
用户：张雯今天来了吗？
V5：查询张雯今日预约。

用户：她还有什么卡？
V5：可从 Run Working Memory 继承“她 = 张雯”，但回答仍需实时查 CustomerCard。
```

### 14.5 记忆结构

```ts
type AgentV5MemorySnapshot = {
  working: Array<{
    key: string;
    value: string;
    entityType?: string;
    entityId?: string | number;
    sourceMessageId?: number;
    expiresAt?: string;
  }>;
  preferences: Array<{
    key: string;
    value: string;
    confidence: number;
    source: 'explicit_user_choice' | 'repeated_behavior' | 'admin_setting';
    expiresAt?: string;
  }>;
  businessContext: Array<{
    key: string;
    value: string;
    source: string;
    evidenceId?: string | number;
    computedAt: string;
    expiresAt: string;
  }>;
  governance: Array<{
    issueType: string;
    count: number;
    lastOccurredAt: string;
    suggestedFix: string;
  }>;
};
```

### 14.6 记忆可视化

管理端和 AI 治理中心必须能看到：

- 本次回答用了哪些记忆。
- 记忆来源。
- 记忆有效期。
- 是否参与路由。
- 是否参与回答。
- 是否被实时数据覆盖。

终端只展示必要提示，例如“已沿用上一轮客户：张雯”，不展示完整治理细节。

## 15. AI 治理中心接入 V5

### 15.1 产品目标

AI 治理中心是 V5 的统一后台，不新增分散入口。V5 的路由、adapter、追问、记忆、证据、约束、失败诊断和评测结果都应在 AI 治理中心可见。

目标：

- 让运营管理员知道 V5 为什么这么答。
- 让产品和研发知道 V5 哪些问题命中不好。
- 让 ontology gap、adapter gap、数据 gap 可追踪。
- 让用户反馈能回流到具体 adapter 和概念。

### 15.2 信息架构

AI 治理中心新增或扩展 V5 视图：

```text
AI 治理中心
  ├─ 总览
  ├─ 运行审计
  │   └─ 支持 agentCode = agent_v5
  ├─ V5 Ontology Router
  ├─ V5 Adapter 命中
  ├─ V5 模糊追问
  ├─ V5 记忆
  ├─ V5 Evidence Pack
  ├─ V5 Constraint Guard
  ├─ V5 Failure Diagnosis
  └─ V5 评测与 Gap
```

### 15.3 V5 总览

展示指标：

- V5 总运行次数。
- 成功率。
- 追问率。
- 追问后成功率。
- 记忆使用率。
- 记忆纠错率。
- adapter 命中分布。
- 失败原因分布。
- 高风险动作阻断次数。
- 审批申请次数。
- 用户反馈有用率。

### 15.4 Route 审计

每个 V5 run 详情展示：

- 原始问题。
- 识别出的 domain。
- 识别出的 concept。
- 识别出的 entity。
- 候选 adapter。
- 最终 adapter。
- 置信度。
- fallback policy。
- 是否触发追问。
- 是否使用记忆。
- 是否触发 constraint guard。

### 15.5 Adapter 命中治理

按 adapter 展示：

- 运行次数。
- 成功次数。
- no_data 次数。
- blocked 次数。
- failed 次数。
- 平均置信度。
- 低置信度样例。
- 常见失败问题。
- 建议补充的 alias、concept、metric、entity resolver。

### 15.6 模糊追问治理

展示：

- 触发追问的问题。
- 模糊类型。
- 候选选项。
- 用户选择。
- 选择后命中的 adapter。
- 追问是否解决问题。
- 哪些模糊问法重复出现。

治理动作：

- 将高频模糊问法加入 ontology alias。
- 将高频二选一问题变成默认策略。
- 将高风险模糊动作加入强制追问规则。

### 15.7 记忆治理

展示：

- 记忆类型。
- 记忆 key。
- 来源。
- 有效期。
- 使用次数。
- 最近使用时间。
- 是否被用户纠正。
- 是否被实时数据覆盖。

治理动作：

- 清除错误记忆。
- 降低低置信度偏好记忆权重。
- 将稳定偏好提升为用户设置。
- 将高频门店上下文沉淀为经营看板配置。

### 15.8 Evidence 与安全治理

展示：

- 每次回答的数据源。
- 样本量。
- 指标口径。
- 限制说明。
- PII 脱敏状态。
- 门店隔离状态。
- 高风险动作处理结果。

AI 治理中心必须能发现：

- 没有证据的回答。
- 缺少指标口径的回答。
- 记忆替代实时查询的风险。
- 未经审批的高风险动作尝试。

### 15.9 前端接入要求

当前 `/system/agent-governance` 作为统一入口，V5 接入要求：

- 保持 AI 治理中心单入口，不新增历史版本菜单。
- V5 作为治理中心内的筛选项和专题视图。
- URL 可支持：
  - `/system/agent-governance?agentCode=agent_v5`
  - `/system/agent-governance/runs?agentCode=agent_v5`
  - `/system/agent-governance/v5/router`
  - `/system/agent-governance/v5/memory`
  - `/system/agent-governance/v5/clarifications`
  - `/system/agent-governance/v5/eval`
- 旧入口继续跳转到治理中心，不恢复分散菜单。

### 15.10 后端接口要求

P0 可复用现有 run/detail 接口扩展返回 V5 trace。P1 建议新增治理接口：

```text
GET /agent-v5/governance/overview
GET /agent-v5/governance/routes
GET /agent-v5/governance/adapters
GET /agent-v5/governance/clarifications
GET /agent-v5/governance/memory
GET /agent-v5/governance/failures
GET /agent-v5/governance/eval
```

所有接口必须：

- 支持门店隔离。
- 支持 `agentCode=agent_v5`。
- 支持时间范围。
- 支持 adapter/domain/failureCode 筛选。
- 不返回未脱敏 PII。

## 16. 失败诊断

V5 不可用回答必须归类：

- `ontology_route_gap`
- `entity_resolution_failed`
- `capability_not_published`
- `readonly_query_blocked`
- `permission_denied`
- `data_not_found`
- `tool_not_supported`
- `tool_execution_failed`
- `missing_required_slot`
- `quality_insufficient`
- `high_risk_action_blocked`

失败回答必须告诉用户：

- 当前识别到了什么。
- 缺了什么。
- 还能怎么问。
- 是否需要补数据、补权限、补 adapter、补 ontology。

## 17. 测试与验收

### 17.1 独立性验收

必须通过：

- V5 run 全部为 `agent_v5`。
- V5 不生成 V1/V2/V3/V4 run。
- V5 orchestrator 不注入旧版本 orchestrator。
- V5 代码不出现旧版本 run endpoint 调用。
- V5 前端模式不调用 `agentV4`、`agentV3`、`agentV2` facade。
- V5 终端 runtime 调 `/agent-v5/*`。

建议静态扫描：

```text
packages/server-v2/src/agent-v5/** 不允许出现：
  /agent-v2/runs
  /agent-v3/runs
  /agent-v4/runs
  AgentV2Orchestrator
  AgentV3Orchestrator
  AgentV4Orchestrator
```

### 17.2 命中率验收

目标：

- V5 650 题可用率不低于 V4 当前水平。
- 各业务域核心问题可用率不低于 90%。
- 失败原因 100% 可分类。
- “今天店里情况怎么样”不能只返回生命周期机会。
- “核销”“扣次”“划扣”“用卡”应归一到收银核销/卡项消耗语义。
- “谁有空”“排班”“空档”应归一到预约排班语义。

### 17.3 追问验收

必须满足：

- 模糊问法能触发追问卡。
- 追问卡最多展示 4 个主选项。
- 用户选择后继续当前 V5 run。
- 追问结果写入 trace。
- 追问后成功率纳入 AI 治理中心统计。
- 高风险动作模糊时不能直接执行。

### 17.4 记忆验收

必须满足：

- V5 能在同一 run 内继承上一轮明确实体。
- V5 使用记忆时必须在 trace 中标记。
- 事实型问题不能只用记忆回答。
- 记忆过期后不能继续参与路由。
- 用户纠正后，错误记忆不能继续生效。
- AI 治理中心能查看记忆来源和有效期。

### 17.5 AI 治理中心验收

必须满足：

- `/system/agent-governance` 能筛选 `agent_v5`。
- V5 run 详情能看到 route、adapter、clarification、memory、evidence、constraint、failure diagnosis。
- 能看到 V5 adapter 命中率和失败分布。
- 能看到高频模糊问法。
- 能看到记忆使用和纠错记录。
- 旧 AI/Agent 治理入口不恢复成多个菜单。

### 17.6 证据验收

每个成功回答必须包含：

- 数据源。
- 时间范围。
- 样本量或记录数。
- 指标口径。
- 关键事实。
- 风险和限制。
- 动作边界。

### 17.7 安全验收

必须满足：

- PII 脱敏。
- 门店隔离。
- 角色权限。
- 高风险动作审批。
- 禁止自动写库存、订单、客户资产、排班、财务结算。

## 18. 分阶段范围

### P0：独立 V5 骨架

目标：

- 独立 `/agent-v5/*` 跑通。
- 全局 ontology router 跑通。
- lifecycle adapter 跑通。
- readonly query adapter 跑通。
- business tool adapter 初版。
- evidence pack 初版。
- constraint guard 初版。
- 模糊问法追问初版。
- Run Working Memory 初版。
- AI 治理中心支持 `agent_v5` 运行审计。
- 管理端和终端可选择 V5。

验收：

- V5 不串旧版本入口。
- 能回答经营概览、事实问数、生命周期机会、库存风险、财务毛利、预约现场六类问题。
- 模糊问法能追问，追问后继续当前 run。
- 同一 run 内能继承上一轮明确实体。

### P1：全业务垂直 Adapter

目标：

- 前台客户查询 adapter。
- 收银核销 adapter。
- 美容师服务 adapter。
- 预约排班 adapter。
- 财务经营 adapter。
- 库存供应链 adapter。
- 员工业绩 adapter。
- 营销增长 adapter。
- 治理与质量 adapter。
- User Preference Memory。
- Store Business Memory。
- AI 治理中心 V5 router、adapter、clarification、memory 视图。

验收：

- 650 题按 adapter 统计命中率。
- 每个 adapter 至少覆盖 10 个核心问题。
- 每个 adapter 有独立单测和失败诊断。
- 追问率、追问后成功率、记忆使用率进入治理中心。

### P2：治理和持续优化

目标：

- Adapter 命中率看板。
- Ontology gap 看板。
- Failure diagnosis 看板。
- Clarification 看板。
- Memory 看板。
- 评测样例回灌。
- 能力发布建议。
- 可选只读图谱投影。

验收：

- 用户反馈能归因到具体 adapter、concept、capability 或 data gap。
- 新增能力必须绑定评测样例。
- 高频模糊问法能回灌为 ontology alias 或强制追问规则。

## 19. 产品验收样例

| 用户问题 | 应命中 adapter | 不应出现 |
| --- | --- | --- |
| 今天店里情况怎么样 | business overview / finance / schedule / inventory 汇总 | 只返回客户生命周期机会 |
| 张雯还有什么卡 | ReceptionAdapter / CashierAdapter | 泛泛说建议查看客户资料 |
| 今天核销多少次卡 | CashierAdapter | 跑到营销归因 |
| 谁下午有空能接水光 | ScheduleAdapter | 只列员工名单不看排班 |
| 哪些商品会影响项目服务 | InventorySupplyAdapter | 只说低库存不关联项目 |
| 本月毛利为什么下降 | FinanceAdapter | 无数据口径的自然语言分析 |
| 宋乔这个月业绩怎么样 | StaffPerformanceAdapter | 越权展示其他员工隐私 |
| 最近触达效果怎么样 | MarketingAdapter / LifecycleAdapter | 把轻量归因当财务结算 |
| 为什么刚才答不上来 | GovernanceAdapter | 原样返回旧版本 blocked |
| 她还有什么卡 | 继承上一轮客户实体后命中 ReceptionAdapter | 不知道“她”是谁却强答 |
| 今天收入怎么样 | 追问或明确默认口径为营业额/实收 | 混用营业额、实收、毛利 |
| 帮我处理这些客户 | 追问是查看建议、生成草稿还是提交审批 | 直接群发或改客户资产 |

## 20. 最终定义

Agent V5 完成不是指“能聊天”，而是指它具备稳定的全业务经营能力：

1. 能把自然语言问题路由到正确业务域。
2. 能通过垂直 Ontology Adapter 命中正确能力。
3. 能复用底层服务，但不递归调用旧 Agent 版本入口。
4. 能输出可审计证据。
5. 能说明限制和风险。
6. 能把高风险动作控制在草稿和审批内。
7. 能通过评测和用户反馈持续补齐 ontology gap。
8. 能在模糊问题上追问，而不是强行猜测。
9. 能使用受控记忆提升多轮体验，但不让记忆替代实时事实。
10. 能在 AI 治理中心完整解释 V5 的路由、追问、记忆、证据和失败原因。

V5 的最终产品形态应是：一个独立、可审计、可治理、覆盖美业全业务的经营 Agent。
