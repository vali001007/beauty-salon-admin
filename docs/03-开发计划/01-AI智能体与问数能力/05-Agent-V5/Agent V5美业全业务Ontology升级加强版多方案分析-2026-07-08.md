# Agent V5 美业全业务 Ontology 升级加强版多方案分析

> 日期：2026-07-08
> 依据：`docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-all-version-eval-report-2026-07-08.md`
> 目标：结合 650 题全版本真实评测结果，提出 3 个以上可行的 Agent V5 全业务 ontology 升级方案，并逐个挑刺。

## 1. 评测报告给 V5 的约束

650 题全版本真实测评结果非常关键：

| 版本 | 可用率 | 主要启发 |
| --- | ---: | --- |
| V4 | 91.4% | 当前最适合做正式版经营入口，但回答容易偏生命周期机会，需要全业务本体扩展 |
| V1 | 89.7% | 历史工具覆盖广，但规则分支老化，不适合作为新架构继续堆功能 |
| Ami AI | 89.4% | 可读性好，但很多回答没有真实数据，不适合承担事实和决策 |
| V3 | 49.2% | 适合只读问数底座，但受控 SQL 对复杂/模糊问题阻断高 |
| V2 | 17.1% | 治理强，但作为自然语言主入口被大量“未发布能力”阻断 |

Top 失败原因也说明了 V5 的设计边界：

1. V2 有 519 次“没有匹配的已发布能力”，说明 capability-driven 适合作为治理系统，不适合作为自然语言前台。
2. V3 有大量“无法生成安全查询计划”，说明 Text-to-SQL 必须被本体语义路由和业务对象约束包裹。
3. V1/Ami AI 可用率高，但有泛化回答和规则老化问题，不能作为正式事实链路。
4. V4 可用率高，但样本里“今天店里情况怎么样”返回生命周期机会，说明 V4 当前经营视角偏窄，需要全业务 ontology。

因此，V5 不能简单等于“V4 改名”，也不应回到“V2 全能力图谱主入口”。V5 应该是：

```text
V5 = 全业务 Ontology 语义中枢
   + V3 只读问数工具
   + V2 能力治理和发布系统
   + V4 生命周期经营闭环
   + V1 历史工具适配层
   + 审批 / 归因 / 质量 / 无用反馈闭环
```

## 2. V5 全业务 Ontology 范围

美业全业务本体不应只覆盖客户生命周期，还应覆盖以下业务域：

| 业务域 | 核心对象 | 典型问题 |
| --- | --- | --- |
| 客户与会员 | Customer、CustomerCard、CustomerLifecycleSnapshot | 哪些客户该跟进，哪些会员卡快到期 |
| 服务与预约 | Project、Reservation、ServiceTask、CardUsageRecord | 今天服务安排、护理周期、到店核销 |
| 收银与订单 | ProductOrder、OrderItem、PaymentRecord、RefundRecord | 今日营业额、退款、折扣、核销 |
| 库存与供应链 | Product、StockMovement、Supplier、PurchaseOrder | 缺货、临期、损耗、采购建议 |
| 财务与毛利 | DailySettlement、OperationProfit、CommissionRecord | 毛利、成本、对账、员工提成 |
| 营销与触达 | MarketingActivity、Automation、Touch、Attribution | 活动效果、触达规则、转化归因 |
| 员工与排班 | User、Beautician、Schedule、Performance | 员工业绩、排班、服务负载 |
| 终端现场 | TerminalDevice、FollowUpTask、RecommendationEvent | 今日跟进、现场协调、终端推荐 |
| 风险与审批 | AgentApproval、Policy、RuleVersion | 哪些动作需要审批，哪些动作禁止 |
| 知识与 SOP | 项目说明、护理禁忌、话术、运营 SOP | 怎么解释项目，怎么生成话术 |

V5 的本体不是单纯画图，而是统一五类东西：

1. 对象：客户、订单、项目、库存、活动、员工、财务。
2. 关系：客户购买了什么、预约了什么、消耗了什么、被触达后有没有转化。
3. 规则：生命周期、库存安全线、产能承接、权限、字段脱敏。
4. 动作：查询、诊断、计划、草稿、审批、跟进任务。
5. 证据：来源表、时间范围、筛选条件、样本、归因链、质量限制。

## 3. 方案一：轻量全业务 SQL Ontology 版

### 3.1 方案描述

在现有 V4 生命周期小本体基础上横向扩展，不引入图数据库。新增一个全业务 `BusinessOntologyRegistry`，把美业核心对象、关系、指标、工具和风险规则都注册为 TypeScript registry 或 Prisma JSON 配置。

架构：

```text
/agent-v5/runs
  -> AgentV5Orchestrator
  -> BusinessOntologyRouter
  -> OntologyContextBuilder
  -> V3 Readonly SQL / V4 Lifecycle / V1 Legacy Tools
  -> EvidencePackBuilder
  -> ConstraintGuard
  -> AgentRun / AgentApproval
```

关键模块：

- `BusinessOntologyRegistry`：全业务概念、别名、来源表、关系。
- `BusinessOntologyRouter`：识别问题属于经营概览、库存、财务、预约、营销、员工等域。
- `OntologyContextBuilder`：按域加载最小上下文包。
- `EvidencePackBuilder`：统一回答证据。
- `ConstraintGuard`：判断是否只读、草稿、审批、禁止。

### 3.2 优势

- 交付最快，最贴合当前代码和脏工作区现状。
- 能直接复用 V4 91.4% 的高可用表现，同时纠正生命周期偏置。
- 不引入新基础设施，PostgreSQL / Prisma 仍是事实源。
- 适合快速把 V5 做成正式版前台。
- 对 V3 的 SQL 阻断有缓解：先由本体识别业务对象和时间范围，再交给 V3。

### 3.3 挑刺

- 本质仍是“轻量注册表 + 规则路由”，复杂多跳推理能力有限。
- 如果 registry 维护不好，会变成另一套大 if/else。
- 对 SOP、项目知识、话术等非结构化知识支持弱。
- 没有 V2 那么完整的 capability 发布治理，容易出现“能力先上线、治理后补”。
- 当业务域越来越多，TypeScript registry 会膨胀，需要尽早规划治理 UI 或 DB 化。

### 3.4 适合场景

适合作为 V5 P0/P1。目标是 2-3 周内让 V5 成为统一入口，覆盖评测里的大部分角色和问题类型。

## 4. 方案二：V2 治理底座 + V5 Ontology 语义中枢版

### 4.1 方案描述

这是推荐方案。把 V2 从“用户直接访问的主运行入口”降级为“能力治理底座”，把 V5 做成用户前台和语义中枢。

架构：

```text
用户问题
  -> Agent V5
  -> 全业务 Ontology Router
  -> 判断：
     1. 已发布正式能力 -> 调 V2 capability/tool
     2. 事实问数 -> 调 V3 Text-to-SQL
     3. 生命周期经营 -> 调 V4 lifecycle ontology
     4. 旧固定工具 -> 调 V1 adapter
     5. 高风险动作 -> AgentApproval
```

V2 负责：

- capability manifest。
- 工具发布。
- dry-run / eval gate。
- 字段策略。
- 权限和审批策略。
- 能力治理中心。

V5 负责：

- 业务问题理解。
- 全业务本体上下文。
- 路由到 V2/V3/V4/V1。
- 跨域证据整合。
- 统一回答和行动建议。

### 4.2 优势

- 继承 V2 最强的治理能力，避免 V5 野蛮扩展。
- 避免 V2 当前最大问题：自然语言主入口可用率只有 17.1%，大量没有发布能力就阻断。
- V5 可以先用 V3/V4 兜底，等 V2 capability 成熟后逐步接管正式工具。
- 产品上更清楚：V5 是“一个入口”，V2 是“能力后台”。
- 适合长期正式版演进：业务能力可发布、可灰度、可回滚、可评测。

### 4.3 挑刺

- 架构复杂度最高，短期需要梳理 V2/V3/V4/V1 的边界。
- 如果路由做不好，会出现“同一个问题 V5 不知道该调 V2 还是 V3”的分歧。
- V2 capability 覆盖不足时，V5 仍会大量走 V3/V4，V2 治理价值短期不明显。
- 需要统一 evidence、renderedBlocks、approval、tool trace，否则前端展示会碎片化。
- 对工程纪律要求高：每新增能力都要写本体概念、工具注册、权限、测试和评测样本。

### 4.4 适合场景

适合作为正式版主路线。它吸收评测报告的结论：V4 做前台、V3 做问数、V2 做治理。

## 5. 方案三：完整 Knowledge Graph / GraphRAG 全业务版

### 5.1 方案描述

构建真正的全业务知识图谱，把客户、订单、预约、项目、库存、员工、活动、归因、SOP、话术等都投影到图谱中。结构化数据来自 PostgreSQL，非结构化文档进入 GraphRAG。V5 通过图谱做多跳推理，再通过工具执行受控动作。

架构：

```text
PostgreSQL / Prisma facts -> Graph Projection
Docs / SOP / Project Knowledge -> GraphRAG
Agent V5 -> Graph Query / GraphRAG / V3 SQL / V2 Tool
```

可选技术：

- Neo4j / Memgraph 做只读图谱投影。
- LlamaIndex / GraphRAG 做文档知识和语义检索。
- PostgreSQL materialized view 做轻量图边表。

### 5.2 优势

- 多跳关系最强，适合复杂问题：客户、项目、库存、员工、归因、SOP 跨域联动。
- 能把项目知识、护理禁忌、营销话术和业务数据放在同一语义空间。
- 适合做可视化：客户经营网络、库存消耗网络、触达转化路径。
- 长期技术想象力最大，和“完整 knowledge graph”路线最一致。

### 5.3 挑刺

- 当前不是最优先。评测报告显示最大问题不是缺图数据库，而是 V2 缺已发布能力、V3 语义路由弱、V4 偏生命周期。
- 新增图数据库会带来同步、权限、数据一致性、运维和调试成本。
- 图谱如果只是从 SQL 复制数据，很容易变成第二套不一致事实源。
- 非结构化 GraphRAG 对事实问数帮助有限，不能替代订单、库存、财务 SQL。
- 交付周期长，短期不一定提升 650 题可用率。

### 5.4 适合场景

适合 P3 以后，作为增强层，不建议作为 V5 第一阶段主线。正确用法是“只读图谱投影 + 文档知识增强”，不是替代 PostgreSQL。

## 6. 方案四：多角色子 Agent 联邦版

### 6.1 方案描述

按美业角色拆分 V5 子 Agent：

- 店长经营 Agent。
- 前台接待 Agent。
- 美容师服务 Agent。
- 营销增长 Agent。
- 库存采购 Agent。
- 财务风控 Agent。
- 员工绩效 Agent。

每个子 Agent 共享全业务 ontology，但拥有自己的工具、权限、回答模板和风险边界。V5 主 Agent 负责调度和合成。

架构：

```text
Agent V5 Supervisor
  -> ManagerAgent
  -> ReceptionAgent
  -> BeauticianAgent
  -> MarketingAgent
  -> InventoryAgent
  -> FinanceAgent
  -> StaffPerformanceAgent
```

### 6.2 优势

- 非常贴合美业真实组织和终端角色。
- 可以按角色优化上下文，减少工具和数据泄露风险。
- 对评测报告中的角色分组很友好，便于逐角色优化可用率。
- 终端 Ami Aura 可直接按当前登录角色调用子 Agent。

### 6.3 挑刺

- Supervisor 路由难度高，容易把跨域问题拆错。
- 多 Agent 合成容易变慢，成本也更高。
- 如果共享 ontology 没做好，各子 Agent 会各说各话。
- 对“店长经营概览”这类跨角色问题，需要多 Agent 协同，复杂度不低。
- 前期容易变成 UI 上很多版本和入口，产品理解成本高。

### 6.4 适合场景

适合 P2/P3，当统一 V5 已稳定后，再按角色拆 agent persona。不要第一阶段就上多 Agent 联邦，否则会放大路由和治理问题。

## 7. 方案五：评测驱动的 V5 自修复版

### 7.1 方案描述

把 650 题评测、用户“无用”反馈、运行失败 trace、本体质量快照打通，形成 V5 的自动诊断和能力修复建议池。

架构：

```text
AgentRun / EvalResult / UserFeedback
  -> Failure Classifier
  -> Ontology Gap Detector
  -> Capability Gap Detector
  -> Fix Proposal
  -> Human Review
  -> Registry / Capability / Prompt / Tool Patch
```

### 7.2 优势

- 直接针对评测报告暴露的问题优化。
- 能解释为什么失败：缺时间范围、缺语义视图、缺 capability、权限不足、工具异常、数据为空。
- 可形成产品经理看得懂的治理看板。
- 能持续提升 V5，而不是一次性方案。

### 7.3 挑刺

- 它不是独立前台 Agent，只是治理增强层。
- 自动修复不能直接改生产能力，必须人工审核。
- 需要大量标准化失败分类，否则会变成日志堆积。
- 对短期用户体验提升不如方案一和方案二直接。

### 7.4 适合场景

适合作为所有方案的配套模块。V5 正式版如果没有评测闭环，后续会重新回到“凭感觉补能力”。

## 8. 综合对比

| 方案 | 交付速度 | 长期可维护 | 业务闭环 | 治理能力 | 技术复杂度 | 推荐度 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 方案一：轻量全业务 SQL Ontology | 高 | 中 | 中-高 | 中 | 中 | 4 星 |
| 方案二：V2 治理 + V5 语义中枢 | 中 | 高 | 高 | 高 | 高 | 5 星 |
| 方案三：完整 KG / GraphRAG | 低 | 中 | 中-高 | 中 | 很高 | 3 星 |
| 方案四：多角色子 Agent | 中 | 中 | 高 | 中 | 高 | 3.5 星 |
| 方案五：评测驱动自修复 | 中 | 高 | 间接 | 高 | 中 | 4 星，作为配套 |

## 9. 推荐路线

推荐采用“方案二为主，方案一先落地，方案五同步建设，方案三/四延后”的组合路线。

### P0：V5 轻量全业务入口

目标：解决 V4 生命周期偏置，让 V5 能覆盖全业务问题。

任务：

- 新增 `/agent-v5/runs`。
- 新增 `BusinessOntologyRegistry`。
- 新增全业务语义路由。
- 接入 V3 只读问数、V4 生命周期、V1 固定工具。
- 输出统一 evidence pack。
- 针对评测报告 Top 失败问题补路由。

验收：

- 对 650 题重新跑，V5 可用率目标不低于 V4 的 91.4%。
- 店长经营、财务风控、库存采购、前台接待不再被生命周期机会覆盖。

### P1：接入 V2 治理

目标：让 V5 能调用 V2 已发布 capability，同时不被 V2 未发布能力阻断。

任务：

- V5 route 先判断 capability 是否 active。
- active capability 走 V2 policy/tool。
- 非 active capability 自动降级到 V3/V4 或返回能力缺口解释。
- V2 governance center 增加 V5 使用统计。

验收：

- V2 的 519 次 blocked 不会在 V5 原样出现。
- 已发布能力受 V2 policy 控制。

### P2：评测驱动治理

目标：把 650 题和用户反馈变成持续优化机制。

任务：

- 建立 failure taxonomy。
- AgentRun 自动归因失败原因。
- 本体缺口、能力缺口、语义路由缺口自动生成修复建议。
- 每次发布跑 V5 eval gate。

验收：

- 每个失败问题都有可归类原因。
- 新增能力必须绑定 eval case。

### P3：图谱与多 Agent 增强

目标：增强复杂多跳、SOP 和跨角色协作。

任务：

- 只读图谱投影。
- 文档 GraphRAG。
- 角色子 Agent。
- 复杂跨域问题由 supervisor 分解。

验收：

- 复杂跨场景融合问题可用率提升。
- SOP/话术/护理知识问题有来源引用。

## 10. 最终建议

如果现在要定义 Agent V5，我建议定位为：

> Agent V5 是 Ami Core 的全业务经营 Agent。它以美业全业务 ontology 为语义中枢，以 V3 为事实问数工具，以 V2 为能力治理和发布底座，以 V4 生命周期经营闭环为第一条成熟业务链路，统一提供经营诊断、事实问数、计划草稿、审批动作、归因复盘和能力质量治理。

不要把 V5 做成“更大的 V2”，否则会继续遇到能力未发布就阻断的问题。也不要把 V5 做成“更大的 V4”，否则会继续偏客户生命周期，无法覆盖财务、库存、收银、预约、员工等全业务问题。

V5 应该是一个分层整合版：

```text
用户看到：一个全业务 Ami Agent
内部实现：V5 router + ontology + V3 query + V2 governance + V4 lifecycle + approval/eval loop
```

这条路线对当前项目最稳，也最贴近评测报告给出的真实证据。
