# Agent V5 美业全业务 Ontology 经营 Agent 需求文档

> 日期：2026-07-08
> 版本：V1.1
> 定位：Agent V5 独立版本需求文档
> 前置依据：`Agent V5美业全业务Ontology升级加强版多方案分析-2026-07-08.md` 中第 10 节最终建议
> 核心约束：V5 可复用其他版本底层能力，但必须独立开发，不递归调用 V1/V2/V3/V4 Agent 入口，不把 V5 逻辑写回旧版本。V5 的复用只能发生在 service/tool/policy/query 层，不能发生在旧版本 controller/orchestrator/run 入口层。

## 1. 产品定位

Agent V5 是 Ami Core 的全业务经营 Agent。

它以美业全业务 ontology 为语义中枢，以 V3 的事实问数能力作为只读工具，以 V2 的能力治理和发布体系作为治理底座，以 V4 的客户生命周期经营闭环作为第一条成熟业务链路，统一提供：

- 经营诊断。
- 事实问数。
- 客户与服务建议。
- 库存、财务、收银、预约、员工等全业务分析。
- 计划草稿。
- 审批动作。
- 归因复盘。
- 能力质量治理。

V5 不是“更大的 V2”，也不是“更大的 V4”。

- 不是更大的 V2：避免继续遇到“能力未发布就阻断”的问题。
- 不是更大的 V4：避免继续偏客户生命周期，无法覆盖财务、库存、收银、预约、员工等全业务问题。

V5 是一个独立正式版本：

```text
用户看到：Agent V5 / 全业务经营 Agent
内部实现：V5 Router + 全业务 Ontology + 独立运行时 + V5 Adapter
可复用：V2 治理能力、V3 问数能力、V4 生命周期领域服务、V1 固定工具经验
禁止：V5 -> /agent-v2/runs、V5 -> /agent-v3/runs、V5 -> /agent-v4/runs 这种 Agent 串 Agent
```

V5 采用“全局 ontology router + 垂直 ontology adapter”的产品架构：

```text
Agent V5
  -> 全局 Ontology Router：识别业务域、意图、对象、风险和候选 adapter
  -> 垂直 Ontology Adapter：在单一业务域内做高命中率理解和证据组织
  -> 底层服务能力：复用现有 service/query/tool，不复用旧 Agent 入口
  -> 统一 Evidence Pack：所有回答统一输出证据、限制和动作边界
```

其中 `AgentV5LifecycleAdapter` 是第一个成熟样板。其他模块可以按同样方式建设垂直 ontology，以提升自然语言问题命中率、证据稳定性和业务闭环能力。

## 2. 背景与问题

650 题全版本真实评测显示：

| 版本 | 可用率 | 对 V5 的启发 |
| --- | ---: | --- |
| V4 | 91.4% | 可用率最高，但存在生命周期偏置，需要全业务 ontology |
| V1 | 89.7% | 历史工具覆盖广，但规则老化，不适合作为新正式架构 |
| Ami AI | 89.4% | 可读性强，但事实性弱，不能承担正式经营决策 |
| V3 | 49.2% | 适合只读问数底座，但复杂语义和安全计划阻断较多 |
| V2 | 17.1% | 治理体系强，但自然语言主入口大量 blocked |

报告中的主要失败原因：

- V2 519 次未匹配已发布能力。
- V3 多次无法生成安全查询计划。
- V4 在“今天店里情况怎么样”这类全业务问题上容易返回生命周期机会，说明经营视角过窄。
- V1/Ami AI 虽然可用率高，但存在泛化回答、规则老化和缺少真实证据的问题。

因此 V5 要解决的不是单个 Agent 版本增强，而是建立一个全业务语义中枢，让不同底层能力按清晰边界协同。

## 3. 目标与非目标

### 3.1 产品目标

1. 一个入口覆盖美业全业务问题。
2. 对用户自然语言先做全业务 ontology 路由，而不是直接交给某个旧版本。
3. 对事实型问题优先给真实数据和结构化证据。
4. 对经营型问题给诊断、建议、计划和审批入口。
5. 对高风险动作必须进入审批或草稿，不允许直接执行。
6. 对失败问题给可解释诊断：缺数据、缺能力、缺权限、缺时间范围、工具失败或本体缺口。
7. 与 V1/V2/V3/V4 运行记录、前端状态和 API 边界保持独立。

### 3.2 工程目标

1. 新增独立 `agent-v5` 后端模块。
2. 新增独立 `agent_v5` runtime code。
3. 新增独立 API：`/agent-v5/*`。
4. 新增独立前端 API facade：`agentV5`。
5. 管理端和终端可选择 V5，但不影响 V1/V2/V3/V4。
6. 复用底层 service 时通过 V5 adapter，不通过旧 Agent controller 或旧 Agent orchestrator。
7. 评测、审计、反馈都能按 `agentCode=agent_v5` 过滤。

### 3.3 非目标

- 不删除 V1/V2/V3/V4。
- 不把 V5 逻辑写进 V2/V3/V4 orchestrator。
- 不让 V5 调用 `/agent-v2/runs`、`/agent-v3/runs`、`/agent-v4/runs`。
- 不在 P0 引入图数据库。
- 不让 Agent 自动发券、群发、改客户资产、扣库存、创建订单或改排班。
- 不把轻量归因直接作为财务结算依据。

## 4. 版本边界原则

### 4.1 允许复用

| 来源 | 允许复用方式 | 示例 |
| --- | --- | --- |
| V2 | 通过 adapter 读取治理能力、policy、capability 状态 | `AgentV5GovernanceAdapter` |
| V3 | 通过 adapter 调用只读 SQL 能力服务 | `AgentV5ReadonlyQueryAdapter` |
| V4 | 通过 adapter 调用生命周期领域服务 | `AgentV5LifecycleAdapter` |
| V1 | 通过 adapter 复用稳定固定工具或历史工具经验 | `AgentV5LegacyToolAdapter` |
| Agent Runtime | 复用底层 run/message/step/approval 存储服务 | 写入 `agentCode=agent_v5` |

### 4.2 禁止串联

| 禁止行为 | 原因 |
| --- | --- |
| V5 HTTP 调 `/agent-v4/runs` | 会产生嵌套 Agent、审计混乱、上下文重复 |
| V5 HTTP 调 `/agent-v3/runs` | V3 是版本入口，不是工具接口 |
| V5 HTTP 调 `/agent-v2/runs` | V2 blocked 语义会污染 V5 体验 |
| V5 run 写成 `agent_v4` 或 `agent_v2` | 审计不可分 |
| 在 V4 orchestrator 内加 V5 分支 | 版本边界倒置 |
| 前端 V5 模式复用 V4 状态字段 | UI 状态和行为难以排查 |

### 4.3 正确调用形态

```text
错误：
AgentV5Orchestrator -> AgentV4Controller -> AgentV4Orchestrator -> MarketingService

正确：
AgentV5Orchestrator -> AgentV5LifecycleAdapter -> CustomerLifecycleOntologyService / MarketingService lifecycle methods
```

```text
错误：
AgentV5Orchestrator -> AgentV3Controller -> AgentV3Orchestrator

正确：
AgentV5Orchestrator -> AgentV5ReadonlyQueryAdapter -> AgentV3ControlledTextToSqlService
```

```text
错误：
AgentV5Orchestrator -> AgentV2Controller -> AgentV2Orchestrator

正确：
AgentV5Orchestrator -> AgentV5GovernanceAdapter -> V2 Policy / Manifest / Capability service
```

### 4.4 垂直 Ontology Adapter 标准

每个 V5 adapter 都必须是 V5 自己的代码模块，不能把旧版本 Agent 作为黑盒再调用一次。adapter 的职责不是“转发问题”，而是把某个业务域的问题结构化为可执行能力。

统一标准：

```ts
type AgentV5VerticalAdapterContract = {
  adapterCode: string;
  domain: string;
  concepts: string[];
  supportedIntents: string[];
  acceptedActions: string[];
  requiredSlots: string[];
  allowedServiceDependencies: string[];
  forbiddenAgentEntrypoints: string[];
  execute(input: AgentV5AdapterInput): Promise<AgentV5AdapterResult>;
};
```

adapter 必须输出：

- 命中的业务概念。
- 绑定的实体，如客户、商品、项目、订单、员工、预约。
- 使用的数据源。
- 指标口径。
- 风险与限制。
- 可执行动作及审批要求。

adapter 不允许输出：

- 只靠自然语言拼出来的结论。
- 无来源的经营建议。
- 绕过审批的动作。
- 旧版本 Agent 的原始回答。

### 4.5 旧版本能力复用红线

V5 可复用其他版本能力，但复用粒度必须足够低：

| 来源版本 | 可以复用 | 禁止复用 |
| --- | --- | --- |
| V1 | 稳定工具逻辑、业务查询模式、能力命名、已验证样例 | V1 controller、V1 orchestrator、V1 run、V1 planner 决策 |
| V2 | capability manifest、policy、审批策略、字段治理、发布状态 | V2 run 入口、V2 blocked 文案、V2 orchestrator |
| V3 | 受控 Text-to-SQL service、SQL guard、schema mapping | V3 run 入口、V3 对话状态、V3 orchestrator |
| V4 | 生命周期领域 service、business plan、attribution、quality/rule 方法 | V4 run 入口、V4 页面专属状态、V4 orchestrator |

工程上必须满足：

- V5 依赖可以 import service，但不能 import 旧版本 orchestrator 作为执行器。
- V5 可以读取旧版本治理数据，但不能把 run 写成旧版本 agent code。
- V5 可以复用旧版本测试样例，但评测结果必须归入 `agent_v5`。
- V5 的错误、证据、动作和渲染块必须重新包装为 V5 协议。

## 5. 用户与角色

| 角色 | 主要问题 | V5 应答重点 |
| --- | --- | --- |
| 店长 | 今天店里情况、目标差距、本周重点 | 综合经营概览、风险、优先动作 |
| 前台 | 今日预约、客户到店、核销、补录 | 现场任务、客户状态、可执行提醒 |
| 美容师 | 今日服务、客户护理建议、复购 | 服务记录、护理周期、话术和跟进 |
| 营销 | 客群、活动、触达、归因 | 生命周期机会、活动草稿、效果复盘 |
| 库存 | 缺货、临期、损耗、补货 | 库存风险、项目关联、采购建议 |
| 财务 | 收入、退款、毛利、对账 | 事实问数、异常预警、口径解释 |
| 运营管理员 | 能力质量、评测、失败原因 | 本体缺口、能力缺口、治理建议 |

## 6. 全业务 Ontology 范围

### 6.1 业务域

| 域 | 核心对象 | 动作 |
| --- | --- | --- |
| 客户会员 | Customer、CustomerCard、Balance、Lifecycle | 查询、分层、跟进建议 |
| 服务预约 | Project、Reservation、ServiceTask、CardUsageRecord | 今日安排、护理周期、核销 |
| 收银订单 | ProductOrder、OrderItem、Payment、Refund | 营业额、退款、折扣、核销 |
| 库存供应链 | Product、StockMovement、Supplier、Purchase | 风险、补货、临期、损耗 |
| 财务毛利 | DailySettlement、OperationProfit、Commission | 毛利、对账、提成、成本 |
| 营销增长 | Activity、Automation、Touch、Attribution | 活动、触达、转化、归因 |
| 员工排班 | User、Beautician、Schedule、Performance | 排班、绩效、负载 |
| 终端现场 | TerminalDevice、FollowUpTask、RecommendationEvent | 今日跟进、现场协同 |
| 风险审批 | AgentApproval、Policy、RuleVersion | 阻断、审批、审计 |
| SOP 知识 | 项目说明、护理禁忌、话术模板 | 解释、话术、培训 |

### 6.2 Ontology 元素

V5 ontology 统一管理五类元素：

1. Concept：业务概念。
2. Relation：概念关系。
3. Metric：指标口径。
4. Capability：可执行能力。
5. Constraint：风险约束。

示例：

```ts
type AgentV5OntologyConcept = {
  code: string;
  label: string;
  domain: string;
  aliases: string[];
  sourceModels: string[];
  piiLevel: 'none' | 'low' | 'medium' | 'high';
};

type AgentV5OntologyCapability = {
  code: string;
  label: string;
  domain: string;
  intentExamples: string[];
  requiredConcepts: string[];
  adapter: string;
  tool: string;
  riskLevel: 'read' | 'draft' | 'approval_required' | 'blocked';
  evidenceRequired: boolean;
};
```

## 7. 核心使用场景

### 7.1 全店经营概览

用户问：“今天店里情况怎么样？”

V5 应：

- 不默认走生命周期机会。
- 识别为 `store_business_overview`。
- 汇总收入、订单、预约、到店、库存风险、重点客户、今日跟进。
- 若部分数据缺失，说明缺口。
- 给 3 个优先动作。

### 7.2 事实问数

用户问：“今天营业额到多少了？”

V5 应：

- 路由到订单/收银 ontology。
- 通过 V5 readonly query adapter 调用 V3 只读能力。
- 输出金额、订单数、客单价、时间范围、数据来源。
- 不能泛泛回答。

### 7.3 客户生命周期经营

用户问：“本周哪些客户最值得跟进？”

V5 应：

- 路由到生命周期 ontology。
- 通过 V5 lifecycle adapter 调用生命周期领域服务。
- 输出客户数、机会类型、证据、建议动作、风险。
- 可生成经营计划草稿。

### 7.4 库存与项目联动

用户问：“哪些商品库存风险会影响项目服务？”

V5 应：

- 路由到库存 + 项目 ontology。
- 查询库存、项目 BOM、服务预约。
- 输出受影响项目、商品、库存状态、建议处理方式。
- 不自动扣库存或下采购单。

### 7.5 财务与毛利

用户问：“这个月哪些项目毛利低？”

V5 应：

- 路由到财务毛利 ontology。
- 调用 operation profit 或 V3 问数能力。
- 输出项目、收入、成本、毛利率、风险说明。
- 若成本快照缺失，提示质量问题。

### 7.6 预约与现场协调

用户问：“今天哪些预约要重点盯？”

V5 应：

- 路由到预约 + 客户 + 终端现场 ontology。
- 输出今日预约、客户风险、服务项目、顾问/美容师注意事项。
- 可生成终端跟进任务草稿。

### 7.7 营销归因复盘

用户问：“最近一次触达效果怎么样？”

V5 应：

- 路由到营销归因 ontology。
- 查询 `LifecycleAttributionEvent`、MarketingAttribution、RecommendationEvent。
- 输出触达、行为、预约、核销、订单证据链。
- 标注轻量归因不等于财务结算。

### 7.8 能力治理

用户问：“为什么这个问题答不上来？”

V5 应：

- 输出失败分类：语义路由缺口、能力未发布、SQL 阻断、权限不足、数据为空、工具异常。
- 给修复建议。
- 可写入 V5 eval / feedback backlog。

## 8. 功能需求

### 8.1 独立运行入口

后端：

- `POST /agent-v5/runs`
- `POST /agent-v5/runs/:id/messages`
- `GET /agent-v5/runs`
- `GET /agent-v5/runs/:id`
- `GET /agent-v5/runs/:id/detail`

要求：

- 所有运行记录 `agentCode = agent_v5`。
- 所有消息 metadata 标记 `architecture = agent_v5_business_ontology_agent`。
- V5 run 不创建 V2/V3/V4 run。

### 8.2 全业务语义路由

输入用户问题后，输出：

```ts
type AgentV5RouteDecision = {
  intent: string;
  domains: string[];
  concepts: string[];
  capabilityCandidates: string[];
  adapterCandidates: string[];
  confidence: number;
  riskLevel: 'read' | 'draft' | 'approval_required' | 'blocked';
  missingSlots: string[];
  fallbackPolicy: 'ask_clarification' | 'readonly_query' | 'domain_summary' | 'blocked';
};
```

### 8.3 V5 Adapter 层

必须新增 V5 自己的 adapter，不直接调用旧 Agent 入口：

- `AgentV5ReadonlyQueryAdapter`
- `AgentV5GovernanceAdapter`
- `AgentV5LifecycleAdapter`
- `AgentV5LegacyToolAdapter`
- `AgentV5BusinessToolAdapter`
- `AgentV5ReceptionAdapter`
- `AgentV5CashierAdapter`
- `AgentV5BeauticianAdapter`
- `AgentV5ScheduleAdapter`
- `AgentV5FinanceAdapter`
- `AgentV5InventorySupplyAdapter`
- `AgentV5StaffPerformanceAdapter`

P0 可以先由 `AgentV5BusinessToolAdapter` 承接多个业务域，但正式版本必须逐步拆成垂直 adapter。拆分目标不是为了文件数量，而是为了让每个业务域拥有自己的概念、同义词、指标、实体绑定、动作边界和证据链。

### 8.4 Evidence Pack

V5 每个回答必须输出统一证据包：

```ts
type AgentV5EvidencePack = {
  sources: string[];
  domains: string[];
  concepts: string[];
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

### 8.5 动作与审批

V5 允许：

- 生成经营计划草稿。
- 生成活动草稿。
- 生成自动规则草稿。
- 生成终端跟进任务草稿。
- 提交审批。
- 查看审批状态。

V5 禁止：

- 自动发券。
- 自动群发。
- 自动改客户资产。
- 自动扣库存。
- 自动创建订单。
- 自动改排班。
- 自动确认退款或财务结算。

### 8.6 失败诊断

V5 所有不可用回答必须落到以下分类：

- `ontology_route_gap`
- `capability_not_published`
- `readonly_query_blocked`
- `permission_denied`
- `data_not_found`
- `tool_not_supported`
- `tool_execution_failed`
- `missing_required_slot`
- `quality_insufficient`
- `high_risk_action_blocked`

## 9. 前端需求

### 9.1 管理端 Ami Agent

- Runtime 选项新增 V5。
- V5 为默认推荐版本，但不自动替换 V1/V2/V3/V4。
- V5 模式展示全业务经营入口：
  - 今日经营概览。
  - 本周重点客户。
  - 库存与项目风险。
  - 财务与毛利。
  - 今日预约现场协调。
  - 营销触达复盘。
  - 能力质量诊断。

### 9.2 终端 Ami Aura

- 支持 `agent_v5` runtime。
- 终端默认给轻量经营建议和现场任务。
- 高风险动作显示审批说明。
- 终端不能绕过审批直接执行营销、库存、订单类动作。

### 9.3 治理中心

- 支持按 `agentCode=agent_v5` 过滤。
- 展示 V5 route decision、ontology concepts、adapter、tool、evidence、constraint、fallback reason。
- 展示 V5 失败原因分布。

## 10. 数据与接口需求

### 10.1 P0 不新增重型图数据库

P0 使用代码 registry + 现有表：

- `AgentRun`
- `AgentApproval`
- V2 capability / governance 相关表。
- V4 lifecycle 相关表。
- V3 只读语义视图和 SQL guard。
- 现有客户、订单、库存、预约、财务、营销、员工表。

### 10.2 可选新增轻量表

P1 可新增：

- `AgentV5OntologyConcept`
- `AgentV5OntologyCapability`
- `AgentV5OntologyRouteLog`
- `AgentV5FailureDiagnosis`
- `AgentV5EvalCase`

如果不希望 P1 增表，可先写入 `AgentRun.resultJson` / `AgentRun.evidenceJson`。

## 11. 权限与安全

- V5 必须继承门店隔离。
- V5 必须继承角色权限。
- PII 字段必须按字段策略脱敏。
- 高风险能力必须审批。
- 未发布能力不能直接执行，但 V5 可以解释缺口并降级到只读分析。
- V5 不得绕过 V2 policy 使用受控能力。

## 12. 验收指标

### 12.1 评测指标

- 650 题 V5 可用率不低于 V4 当前 91.4%。
- V5 在店长经营、财务风控、库存采购、前台接待、营销增长、美容师服务各角色可用率不低于 90%。
- V5 blocked 原因必须 100% 可分类。
- V5 不能出现 V2 原样“能力未发布就终止”的高频体验。
- V5 对全店经营概览不能只返回生命周期机会。

### 12.2 产品验收

- V5 能回答“今天店里情况怎么样”，并覆盖收入、预约、客户、库存、风险和动作。
- V5 能回答“本周哪些客户该跟进”，并展示生命周期证据。
- V5 能回答“库存哪些商品会影响服务”，并展示项目关联。
- V5 能回答“这个月毛利低的项目有哪些”，并展示数据口径。
- V5 能生成经营计划草稿并提交审批。
- V5 审批前不执行高风险动作。

### 12.3 工程验收

- V5 有独立后端模块。
- V5 有独立前端 API facade。
- V5 有独立终端 runtime。
- V5 run 全部写 `agent_v5`。
- V5 不调用 `/agent-v2/*`、`/agent-v3/*`、`/agent-v4/*`。
- V1/V2/V3/V4 行为不被 V5 改动影响。

## 13. 发布策略

1. 内测：仅管理端超级管理员可见 V5。
2. 灰度：店长和运营管理员开放 V5。
3. 终端试点：Ami Aura 支持 V5，但只开放现场轻动作。
4. 正式：V5 作为默认推荐 Agent，旧版本保留在高级切换里。

## 14. 关键产品判断

V5 的成败不在于“是否更像人”，而在于它是否能把美业全业务事实和动作边界说清楚：

- 这个问题属于哪个业务域。
- 用了哪些数据和规则。
- 为什么给这个建议。
- 哪些动作能做，哪些动作必须审批，哪些动作禁止。
- 如果答不上来，到底缺什么。

这才是 V5 相比 V1/V2/V3/V4 的产品价值。

## 15. 垂直 Ontology Adapter 详细需求

### 15.1 客户生命周期价值 Adapter

模块名：`AgentV5LifecycleAdapter`

定位：客户价值、服务周期、营销触达和归因闭环的垂直 ontology。

核心概念：

- Customer。
- CustomerLifecycleSnapshot。
- CustomerOpportunity。
- CustomerServiceCycleState。
- LifecycleAttributionEvent。
- CustomerCard。
- MarketingAutomationTouch。
- Reservation。
- ProductOrder。

支持问题：

- “本周哪些客户该跟进？”
- “哪些客户护理周期快到了？”
- “沉睡客户怎么召回？”
- “最近一次触达效果怎么样？”
- “生成本周经营计划。”

允许复用：

- `CustomerLifecycleOntologyService`。
- `MarketingService` lifecycle 方法。
- lifecycle business plan 方法。
- lifecycle attribution 查询方法。

禁止：

- 调用 `/agent-v4/runs`。
- 创建 `agent_v4` run。
- 复用 V4 页面状态作为 V5 业务状态。

输出要求：

- 客户数。
- 机会类型。
- 生命周期阶段。
- LTV 分层。
- 证据。
- 触达疲劳。
- 库存/产能承接风险。
- 建议动作。
- 审批要求。

### 15.2 前台客户查询 Adapter

模块名：`AgentV5ReceptionAdapter`

定位：前台接待场景下的客户、预约、卡项和到店查询。

核心概念：

- Customer。
- Reservation。
- CustomerCard。
- CardUsageRecord。
- CustomerProfile。
- TerminalFollowUpTask。

支持问题：

- “张雯今天有没有预约？”
- “这个客户还有什么卡和权益？”
- “今天有哪些客户还没到店？”
- “帮我查一下手机号后四位 1234 的客户。”

允许复用：

- V1 中稳定的 `reception.customer.lookup` 查询逻辑。
- V1 中稳定的 `reception.card.benefit.summary` 查询逻辑。
- 客户、预约、卡项相关 service。
- V3 只读问数 service，作为兜底事实查询。

禁止：

- 让 V5 调用 V1 Agent run。
- 让前台 adapter 执行核销、退款、改卡项等写动作。
- 未脱敏展示手机号、证件号等 PII。

输出要求：

- 客户基础摘要。
- 今日预约。
- 卡项权益。
- 近期消费。
- 到店/未到店状态。
- 可执行前台动作，如查看客户详情、生成提醒，不直接改资产。

### 15.3 收银核销 Adapter

模块名：`AgentV5CashierAdapter`

定位：收银、核销、办卡、充值、退款和订单流水查询。

核心概念：

- ProductOrder。
- OrderItem。
- PaymentRecord。
- RefundRecord。
- CustomerCard。
- CardUsageRecord。
- DailySettlement。

支持问题：

- “这笔收银单明细是什么？”
- “今天核销了多少次卡？”
- “张雯这张卡还剩几次？”
- “今天收银和退款对不上，差在哪里？”

允许复用：

- V1/V3 中订单、核销、财务事实查询逻辑。
- order/payment/refund/card usage service。
- V3 readonly query service。

禁止：

- 直接确认收款。
- 直接退款。
- 直接扣卡。
- 直接改订单。
- 直接改日结。

输出要求：

- 订单/核销事实。
- 支付与退款证据。
- 卡项消耗证据。
- 对账差异。
- 风险说明。
- 需要人工操作的入口提示。

### 15.4 美容师服务 Adapter

模块名：`AgentV5BeauticianAdapter`

定位：美容师今日服务、客户护理准备、服务记录和复购机会。

核心概念：

- Beautician。
- ServiceTask。
- Reservation。
- Customer。
- CustomerCard。
- Project。
- ServiceRecord。

支持问题：

- “我今天要服务哪些客户？”
- “下一个客户有什么注意事项？”
- “这个客户适合推荐什么护理？”
- “我这个月表现怎么样？”

允许复用：

- V1 中美容师今日服务工具。
- 服务任务 service。
- 客户生命周期 service。
- 员工业绩 service。

禁止：

- 自动提交正式服务记录。
- 自动销售项目或商品。
- 自动扣卡。
- 展示非本人权限范围内的敏感客户信息。

输出要求：

- 今日服务清单。
- 客户护理摘要。
- 卡项与禁忌提醒。
- 服务后建议。
- 复购机会。
- 个人绩效摘要。

### 15.5 预约排班 Adapter

模块名：`AgentV5ScheduleAdapter`

定位：预约、排班、产能、空档和现场协调。

核心概念：

- Schedule。
- Reservation。
- Beautician。
- BeauticianAvailability。
- AppointmentGapOpportunity。
- Project。

支持问题：

- “今天谁有空能接水光？”
- “下午有没有美容师空档？”
- “今天哪些预约要重点盯？”
- “本周排班有什么风险？”

允许复用：

- scheduling service。
- reservation service。
- V1 中 `schedule.diagnose` / `reception.schedule.availability` 相关逻辑。

禁止：

- 自动改排班。
- 自动取消预约。
- 自动确认预约。
- 绕过角色权限查看所有员工隐私排班。

输出要求：

- 可用时段。
- 美容师负载。
- 预约状态。
- 产能风险。
- 现场协调建议。
- 人工确认入口。

### 15.6 财务经营 Adapter

模块名：`AgentV5FinanceAdapter`

定位：收入、毛利、退款折扣、成本、对账和经营利润。

核心概念：

- ProductOrder。
- PaymentRecord。
- RefundRecord。
- OperationProfit。
- DailySettlement。
- CommissionRecord。
- StockCostSnapshot。

支持问题：

- “今天营业额多少？”
- “这个月哪些项目毛利低？”
- “退款折扣有没有异常？”
- “日结和订单对不上是什么原因？”

允许复用：

- operation-profit service。
- finance metrics service。
- V3 readonly query service。
- V1 finance 工具中稳定的 margin/report/audit 逻辑。

禁止：

- 自动生成正式财务结算。
- 自动修改日结。
- 自动确认退款。
- 把轻量归因当成财务结算依据。

输出要求：

- 指标口径。
- 金额。
- 时间范围。
- 成本来源。
- 退款/折扣风险。
- 对账差异。
- 财务限制说明。

### 15.7 库存供应链 Adapter

模块名：`AgentV5InventorySupplyAdapter`

定位：库存风险、项目 BOM、耗材、补货、供应商和采购建议。

核心概念：

- Product。
- StockMovement。
- ProductStockBatch。
- ProjectBomItem。
- Supplier。
- PurchaseOrder。
- InventoryRisk。

支持问题：

- “哪些商品库存不足？”
- “哪些耗材会影响项目服务？”
- “本周应该优先补哪些货？”
- “哪些商品适合一起采购？”

允许复用：

- inventory service。
- V1 inventory 工具中稳定的 risk/replenishment/supplier 逻辑。
- IndustryServiceTemplate 与 Project BOM 映射能力。

禁止：

- 自动扣库存。
- 自动创建采购单。
- 自动调价。
- 自动改商品资料。

输出要求：

- 当前库存。
- 安全库存。
- 可承接天数。
- 关联项目。
- 供应商建议。
- 补货优先级。
- 仅草稿/审批说明。

### 15.8 员工业绩 Adapter

模块名：`AgentV5StaffPerformanceAdapter`

定位：员工服务、销售、提成、完成率和人效。

核心概念：

- Beautician。
- User。
- CommissionRecord。
- Reservation。
- ProductOrder。
- ServiceTask。

支持问题：

- “本月美容师业绩排行。”
- “谁的服务完成率低？”
- “宋乔这个月业绩怎么样？”
- “我的表现怎么样？”

允许复用：

- commission service。
- V1 staff performance 工具逻辑。
- operation-profit/finance 相关成本和提成数据。

禁止：

- 普通美容师查看他人敏感绩效。
- 自动改提成。
- 自动调整排班。

输出要求：

- 服务量。
- 销售额。
- 提成。
- 完成率。
- 预约到店率。
- 异常信号。
- 权限限制说明。

### 15.9 营销增长 Adapter

模块名：`AgentV5MarketingAdapter`

定位：活动、客群、触达、权益、自动化和营销归因。

核心概念：

- MarketingActivity。
- MarketingAutomationRule。
- Promotion。
- MarketingAutomationTouch。
- MarketingAttribution。
- RecommendationEvent。
- CustomerOpportunity。

支持问题：

- “最近活动效果怎么样？”
- “哪些客户适合发回店礼？”
- “生成沉睡客户召回活动草稿。”
- “自动化触达转化如何？”

允许复用：

- marketing service。
- lifecycle opportunity。
- V1 marketing 工具经验。
- V2 approval/policy。

禁止：

- 自动群发。
- 自动发券。
- 自动修改权益资产。
- 自动创建正式活动并发布。

输出要求：

- 客群。
- 活动。
- 触达。
- 行为。
- 预约/核销/订单。
- 归因限制。
- 草稿和审批状态。

### 15.10 治理与质量 Adapter

模块名：`AgentV5GovernanceAdapter`

定位：解释 V5 为什么命中、为什么失败、缺什么能力、哪些规则需要补。

核心概念：

- AgentRun。
- AgentStep。
- AgentApproval。
- Capability。
- Policy。
- OntologyConcept。
- FailureDiagnosis。

支持问题：

- “为什么这个问题答不上来？”
- “刚才为什么命中库存？”
- “V5 哪些能力还缺？”
- “哪些问题失败最多？”

允许复用：

- V2 governance/policy/capability service。
- V5 failure diagnosis。
- 评测报告。

禁止：

- 原样返回 V2 blocked 文案。
- 让治理 adapter 直接改生产能力发布状态。
- 让 V5 逻辑写回 V2/V3/V4。

输出要求：

- 路由解释。
- 能力解释。
- 缺口分类。
- 修复建议。
- 评测影响。
- 发布/回滚需人工治理。

## 16. Agent 入口隔离验收

V5 独立性的验收必须可测试、可审计。

### 16.1 后端隔离验收

必须满足：

- `AgentV5OrchestratorService` 不注入旧版本 orchestrator。
- `AgentV5OrchestratorService` 不调用旧版本 controller。
- V5 创建 run 时 `agentCode` 只能是 `agent_v5`。
- V5 adapter trace 必须写明底层服务来源，例如 `readOnlyVia = agent_v3_text_to_sql_service`，但不能生成 `agent_v3` run。
- V5 lifecycle trace 可以写 `domainService = CustomerLifecycleOntologyService`，但不能生成 `agent_v4` run。
- 单测必须 mock 旧版本 orchestrator，并断言未被调用。

建议增加静态扫描规则：

```text
packages/server-v2/src/agent-v5/** 不允许出现：
  /agent-v1/runs
  /agent-v2/runs
  /agent-v3/runs
  /agent-v4/runs
  AgentV1Orchestrator
  AgentV2Orchestrator
  AgentV3Orchestrator
  AgentV4Orchestrator
```

允许出现：

```text
AgentV3ControlledTextToSqlService
CustomerLifecycleOntologyService
MarketingService
InventoryService
OperationProfitService
CommissionService
BusinessQueryService
V2 policy/governance service
```

### 16.2 前端隔离验收

必须满足：

- V5 模式只调用 `src/api/agentV5.ts`。
- V5 模式不复用 `agentV4` API 创建 run。
- V5 runtime 切换不改变 V1/V2/V3/V4 行为。
- V5 的快捷入口和经营计划入口只在 V5 模式展示。
- 审计页按 `agentCode=agent_v5` 查询 V5。

### 16.3 终端隔离验收

必须满足：

- 终端 `agent_v5` runtime 调 `/agent-v5/*`。
- 终端高风险动作只展示审批或草稿说明。
- 终端不能通过 V5 绕过收银、库存、订单和排班的正式业务流程。

## 17. 需求优先级

### P0 必须完成

- V5 独立入口。
- 全局 ontology router。
- 生命周期 adapter。
- 只读问数 adapter。
- 基础 business tool adapter。
- Evidence Pack。
- Constraint Guard 基础版。
- 管理端 V5 runtime。
- 终端 V5 runtime。
- 不递归调用旧 Agent 入口的单测。

### P1 必须完成

- 前台客户查询 adapter。
- 收银核销 adapter。
- 预约排班 adapter。
- 财务经营 adapter。
- 库存供应链 adapter。
- 员工业绩 adapter。
- 营销增长 adapter。
- Governance adapter 与 V2 治理接入。
- Failure diagnosis 完整分类。
- 650 题按 domain/adapter 评测。

### P2 建议完成

- Ontology registry 可视化治理。
- Ontology gap 自动归类。
- Adapter 命中率看板。
- 低命中问题反向生成规则建议。
- SOP/话术知识接入。
- 只读图谱投影。

## 18. 最终验收口径

Agent V5 不是“再做一个聊天入口”，而是一个全业务经营 Agent。最终验收看四件事：

1. 独立性：V5 不递归调用 V1/V2/V3/V4 Agent 入口，也不把 V5 逻辑写回旧版本。
2. 命中率：核心业务问题能命中正确垂直 ontology adapter，而不是泛化回答。
3. 证据链：每个结论能说明数据源、口径、样本和限制。
4. 动作边界：能生成建议、计划、草稿和审批申请，但不自动执行高风险业务动作。

当 V5 能稳定回答“今天店里情况怎么样”“哪些客户该跟进”“哪些预约要重点盯”“哪些库存会影响服务”“这个月毛利为什么下降”“收银核销哪里异常”“员工表现谁需要关注”这类问题，并且每个回答都有证据和边界，V5 才算完成从单点 Agent 到全业务经营 Agent 的升级。
