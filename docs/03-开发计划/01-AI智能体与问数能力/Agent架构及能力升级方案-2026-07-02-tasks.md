# Agent 架构及能力升级方案详细开发计划 tasks

版本：v2.0
日期：2026-07-02
最近更新：2026-07-03
来源方案：`docs/03-开发计划/Agent架构及能力升级方案-2026-07-02.md`
执行原则：不再继续给旧关键词路由、旧 `BusinessTaskCompilerService`、旧专用工具打补丁；新能力按 `agent-v2` 独立重建，旧链路只作为兼容回退。

---

## 0. 状态标记

- `[ ]` 未开始
- `[~]` 开发中
- `[x]` 已完成
- `[!]` 阻塞或需决策

---

## 1. 本轮重建策略

### 1.1 技术路线

新建 `packages/server-v2/src/agent-v2`，形成独立 V2 能力层：

```text
用户问题
  -> AgentV2CapabilityDecisionService
  -> AgentV2RuntimeService
  -> AgentV2ToolRegistryService
  -> business.record.query / business.metric.query / business.trend.query / business.detail.query / business.action.draft
  -> 授权证据包
  -> AgentV2AnswerContractValidatorService
  -> 返回 / 拦截 / 回退旧链路
```

旧链路保留原因：

- 现有终端和管理端入口仍在使用旧 Agent Gateway。
- V2 未覆盖的能力必须能回退，避免上线后出现大面积不可答。
- 接入旧入口只允许做“单点接入缝”，不继续在旧 compiler、旧 planner、旧工具注册表里散落补丁。

### 1.2 当前已落地范围

- [x] 新建 `packages/server-v2/src/agent-v2/capability/*`
- [x] 新建 `packages/server-v2/src/agent-v2/tools/*`
- [x] 新建 `packages/server-v2/src/agent-v2/contracts/*`
- [x] 新建 `packages/server-v2/src/agent-v2/agent-v2-runtime.service.ts`
- [x] 新建 `packages/server-v2/src/agent-v2/agent-v2-tool-registry.service.ts`
- [x] 新建 `packages/server-v2/src/agent-v2/agent-v2.module.ts`
- [x] 接入旧 Agent 入口的单点 V2 takeover；仅当 V2 明确可执行时接管，否则回退旧链路。
- [x] 增加灰度开关：`AGENT_CAPABILITY_DECISION_V2=false` 时 V2 不接管。

---

## 2. 里程碑总览

| 阶段 | 优先级 | 状态 | 目标 | 主要产物 | 验收口径 |
|---|---|---:|---|---|---|
| M0 基线盘点 | P0 | [x] | 固化旧 Agent 错路由基线 | 基线报告、失败分类 | 能复现“报废记录答成风险” |
| M1 V2 统一决策入口 | P0 | [x] | V2 能力裁决成为新入口 | `AgentV2CapabilityDecisionService` | “已报废”和“报废风险”可区分 |
| M2 V2 能力目录 | P0 | [x] | Manifest 支持对象、事件、权限、字段策略、正反例 | `AgentV2CapabilityManifest` | P0 只读/指标能力已有边界和反例 |
| M3 V2 通用工具 | P0 | [x] | 用少量通用工具替代补丁工具 | record/metric/trend/detail/draft | record/metric/trend/detail/draft 均已形成原生 V2 执行器 |
| M4 权限与证据包 | P0/P1 | [x] | 工具只返回授权后的证据包 | V2 权限网关、字段策略、证据结构 | 能力级权限、字段策略、证据结构已独立 |
| M5 回复契约 | P0 | [x] | 拦截答非所问 | V2 contract validator | “有哪些”必须返回列表/表格 |
| M6 自动能力生成 | P1 | [x] | 管理端迭代后自动生成候选能力 | 扫描脚本、草稿 manifest | 新页面/接口可出现在能力草稿 |
| M7 评测驱动治理 | P1/P2 | [x] | 全量评测题纳入常规回归 | eval 报告、CI 门禁 | 错路由率可量化 |

---

## 3. P0 已实现垂直闭环

### T1.1 V2 能力裁决服务

- [x] 新增 `AgentV2CapabilityDecisionService`
- [x] 根据问题语义选择 V2 能力。
- [x] 输出候选能力、排除能力、选择原因、边界警告。
- [x] 明确区分：
  - `inventory.scrap.records.list`：已发生报废记录。
  - `inventory.expiring-risk.list`：临期/报废风险。
  - `inventory.stock.operation.draft`：库存操作草稿。

验收：

- [x] “本周有哪些报废产品”命中 `inventory.scrap.records.list`。
- [x] “哪些产品快报废了”不会命中已发生报废记录。
- [x] “帮我报废这批过期面膜”识别为动作草稿，不直接执行。

### T1.2 V2 Runtime

- [x] 新增 `AgentV2RuntimeService`。
- [x] V2 只接管已有原生 V2 工具的能力。
- [x] 未实现原生工具的能力回退旧链路。
- [x] 增加 `AGENT_CAPABILITY_DECISION_V2=false` 回退开关。

验收：

- [x] V2 能回答“本周有哪些报废产品”。
- [x] V2 不接管尚无原生工具的临期风险能力。
- [x] 关闭开关后旧链路继续工作。

### T1.3 V2 旧入口单点接入

- [x] `AgentModule` 引入 `AgentV2Module`。
- [x] `AgentOrchestratorService` 只增加单点 takeover：
  - 先问 V2 是否有可执行计划。
  - 有则执行 V2。
  - 无则继续旧链路。
- [x] 不改旧 compiler/planner/tool registry 的业务判断。

验收：

- [x] 旧入口可列出 V2 工具。
- [x] V2 执行结果沿用旧 Runtime 的 run/message/toolCall 记录能力。
- [x] V2 输出包含 `architecture: agent_v2` 元信息。

---

## 4. P0 能力目录任务

### T2.1 Manifest Schema

- [x] 新增 `AgentV2CapabilityManifest`。
- [x] 支持：
  - `capabilityId`
  - `domain`
  - `businessObject`
  - `sourceModels`
  - `sourceApis`
  - `eventTypes`
  - `outputKinds`
  - `executor`
  - `storeScope`
  - `permissionCodes`
  - `fieldPolicies`
  - `riskLevel`
  - `releaseStrategy`
  - `examples`
  - `negativeExamples`
  - `boundaryNotes`
  - `source`
  - `version`
- [x] 支持发布策略：
  - `auto_publish`
  - `approval_required`
  - `write_blocked`

验收：

- [x] 能力定义能表达事实记录、风险预测、动作草稿的边界。
- [x] 能力定义能表达权限、字段可见性和证据来源。

### T2.2 P0 手工内置能力

- [x] `inventory.scrap.records.list`
- [x] `inventory.expiring-risk.list`
- [x] `inventory.stock.operation.draft`
- [x] `order.product.records.list`
- [x] `order.project.records.list`
- [x] `order.member-card.records.list`
- [x] `order.card-package.records.list`
- [x] `cashier.payment.records.list`
- [x] `card.usage.records.list`
- [x] `finance.daily-settlement.metric`
- [x] `finance.payment-method-breakdown.metric`
- [x] `finance.refund.metric`
- [x] `finance.staff-commission.metric`
- [x] `finance.staff-commission.records.list`
- [x] `customer.consumption.records.list`
- [x] `marketing.coupon-redemption.metric`
- [x] `customer.coupon.status.lookup`
- [x] `card.package.status.lookup`
- [x] `card.package.inactive-customers.list`
- [x] `card.package.free-vs-paid.behavior.metric`
- [x] `navigation.cashier.open`
- [x] `navigation.card-usage.open`
- [x] `finance.discount-permission-risk.metric`
- [x] `finance.risk-diagnostics.metric`
- [x] `finance.commission-cost-optimization.advice`
- [x] `agent.multi-domain.summary`

验收：

- [x] 已完成库存 P0 三类能力边界。
- [x] 已完成订单、收银、财务、核销、客户消费、权益核销、次卡状态、次卡沉睡、财务诊断、多域摘要 P0 manifest。
- [x] 直接写入/删除/发券/下发仍为审批或阻断；只读、指标类能力可自动发布。

### T2.3 版本化与治理

- [x] manifest 已有 `version`、`status`、`source`。
- [x] 能力目录已通过内置 manifest、`agent-v2-capability-drafts.json` 和治理报告持久化。
- [x] 能力启停审计已在草稿治理报告中按 `status`、`source`、`releaseStrategy`、`permissionSource` 输出。
- [x] 自动扫描草稿与手工内置能力已通过 `source=auto_scan_draft/manual_builtin` 分层管理。
- 说明：管理端治理页面属于后续产品化展示，不阻断当前 V2 能力目录、门禁和运行时交付。

---

## 5. P0 通用工具任务

### T3.1 `business.record.query`

- [x] 新增 V2 工具注册：`business.record.query`。
- [x] 新增 `AgentV2BusinessRecordQueryService`。
- [x] 支持 `inventory.scrap.records.list`。
- [x] 查询条件：
  - 当前门店 `storeId`
  - `StockMovement.movementType = scrap_out`
  - 时间范围
  - `limit`
- [x] 返回授权后的：
  - 表格数据
  - 汇总摘要
  - evidence
  - 可选 action
- [x] 支持订单记录：
  - 商品订单
  - 项目订单
  - 会员卡充值订单
  - 次卡开卡订单
- [x] 支持收银记录。
- [x] 支持次卡核销记录，并区分管理端核销与智能终端核销。
- [x] 支持次卡沉睡客户名单，按仍有余次且超过阈值未使用的真实 CustomerCard / CardUsageRecord 输出。
- [x] 支持客户次卡状态查询；缺少客户上下文时返回 `no_data` 并要求补充客户名、手机号或客户 ID。
- [x] 支持客户优惠券/权益状态查询；无客户上下文时不猜测、不暴露他人权益。
- [x] 支持员工提成流水，主体优先使用统一 `staffUserId`。
- [x] 支持客户消费记录。

验收：

- [x] “本周有哪些报废产品”返回已发生报废流水，不返回临期风险。
- [x] 没有报废流水时返回 `no_data`，不编造风险结论。
- [x] “项目订单 PO1781893252477 为什么没有同步”命中项目订单记录能力。
- [x] “订单 POMQPDGTF8 有没有进财务”命中收银支付记录能力。
- [x] “今天次卡核销记录”命中次卡核销记录能力。
- [x] “哪些客户买了次卡但最近一直不来用”命中次卡沉睡客户能力。
- [x] “这位客人有没有未核销的优惠券”缺客户上下文时返回需补充客户信息，不编造客户。

### T3.2 `business.metric.query`

- [x] 新建 V2 metric executor。
- [x] 支持单指标、复合指标和口径说明。
- [x] P0 已支持：
  - 日结实收
  - 退款金额
  - 日结净额
  - 订单数
  - 客户数
- [x] 本轮新增 P0 指标：
  - 支付方式收款拆分：现金、微信、支付宝、银行卡、会员卡余额等。
  - 退款笔数与金额：只读 RefundRecord，不执行退款。
  - 员工提成汇总：以系统用户 `staffUserId` 为主体汇总，不再只按美容师表。
- [x] 已支持经营利润指标：
  - 商品毛利指标
  - 项目毛利指标
  - 整体毛利率
  - 次卡销售金额
  - 支付渠道手续费预估
- [x] 本轮补齐 P0 诊断/分析指标：
  - 优惠券/权益核销周期和核销率
  - 免费次卡与付费次卡客户消费差异
  - 手工/超权限折扣风险
  - 财务异常、漏洞、报销线索和月度简报摘要
  - 多域经营摘要，不执行写入动作

验收：

- [x] “订单 POMQPDGTF8 有没有进入财务日结”命中日结指标能力。
- [x] 日结指标返回 KPI、表格和证据来源。
- [x] “今天现金、微信、支付宝各收了多少”命中支付方式拆分指标。
- [x] “今天退款有几笔，金额多少”命中退款指标。
- [x] “这个月提成最高的是谁，大概多少”命中员工提成汇总指标。
- [x] “免费次卡换来的客户和付费客户的消费行为有什么差异”命中免费/付费次卡行为对比。
- [x] “帮我检查一下这个月的财务数据有没有异常”命中财务诊断能力。
- [x] “帮我同时做六件事：查今日营收、看预约、检查库存、分析员工、找沉睡客户、生成月报”命中多域摘要能力，且不执行写入。
- [x] “终端收银订单是否进入日结报表”可通过收银支付记录、订单详情和日结指标证据联合判断。

### T3.3 `business.trend.query`

- [x] 新建 V2 trend executor：`AgentV2BusinessTrendQueryService`。
- [x] 当前支持营业额趋势：按业务日期聚合 `ProductOrder.netAmount`，无净额时回退 `totalAmount`。
- [x] 返回 `metrics`、`items/rows`、`chart` 和 evidence。
- 说明：周、月分桶、同比、环比作为后续趋势分析增强，不阻断 P0 营收趋势闭环。

验收：

- [x] “最近三天营业额趋势怎么样”返回趋势表/图所需结构。
- [x] `business.trend.query` 已注册为原生 V2 工具，V2 runtime 可直接执行。
- [x] 回复契约要求趋势能力必须返回 chart，不能只输出文字结论。

### T3.4 `business.detail.query`

- [x] 新建 V2 detail executor：`AgentV2BusinessDetailQueryService`。
- [x] 当前支持按订单编号查订单详情。
- [x] 返回订单主信息、商品/项目明细、支付记录、退款记录和 evidence。
- [x] 字段按 V2 工具输出结构收敛，后续继续接 manifest 字段策略做更细粒度脱敏。
- 说明：客户、商品、活动详情作为后续对象详情扩展，不阻断订单编号详情闭环。

验收：

- [x] “看一下订单 PO1781893252477 / POMQPDGTF8”路由到 `order.detail.lookup`，不再误落到宽泛订单列表。
- [x] `business.detail.query` 已注册为原生 V2 工具，V2 runtime 可直接执行。

### T3.5 `business.action.draft`

- [x] 新建 V2 draft executor：`AgentV2BusinessActionDraftService`。
- [x] 当前支持库存报废/出库/盘点/领用/消耗类动作草稿。
- [x] 只读取候选商品并生成 `actionDraft`，不会直接写入 `StockMovement`。
- [x] 高风险动作通过 `approvalRequired` 和 action card 进入人工确认。

验收：

- [x] “帮我报废这批过期面膜”只生成报废草稿。
- [x] 直接写入、删除、发券、下发不自动执行。
- [x] 回复契约要求草稿能力必须返回 action card，不能只输出文字确认。

---

## 6. P0/P1 权限与证据包任务

### T4.1 V2 权限网关

- [x] 新建 `AgentV2PolicyGatewayService`。
- [x] V2 bridge 已按 manifest `permissionCodes` 做能力级权限校验。
- [x] 旧 `AgentPolicyService` 不再承担 V2 工具角色、动作风险和发布策略校验；旧链路只保留兼容回退。
- [x] 校验：
  - [x] 角色：已进入 V2 policy gateway。
  - [x] 权限码
  - [x] 门店范围
  - [x] 字段级策略
  - [x] 风险等级：已区分 `auto_publish`、`approval_required`、`write_blocked`，并接入动作级策略。
  - [x] 发布策略：除直接写入、删除、发券、下发外，其他只读、指标、明细、趋势、对象详情和草稿能力均可自动发布。

验收：

- [x] 无库存权限不能执行报废记录查询。
- [x] 无财务权限不能查询财务明细。
- [x] V2 查询按当前 `storeId` 过滤；跨门店字段不进入返回结果。

### T4.2 字段级策略

- [x] manifest 已支持 `fieldPolicies`。
- [x] 工具结果统一应用字段策略。
- [x] 支持 `allow`、`mask`、`deny`。
- [x] 输出字段过滤审计：`data.fieldPolicyApplied`。

验收：

- [x] 客户手机号等非 manifest 允许字段不会进入模型上下文。
- [x] `mask` 字段默认显示“已脱敏”。
- [x] 被拒字段不会进入模型上下文。

### T4.3 证据包标准

- [x] `inventory.scrap.records.list` 已返回 evidence。
- [x] V2 字段策略会追加 evidence 限制说明。
- [x] 统一证据包结构：
  - [x] `sourceModels`
  - [x] `sourceApis`
  - [x] `filters`
  - [x] `timeRange`
  - [x] `storeScope`
  - [x] `fieldPolicyApplied`
  - [x] `sampleSize`
  - [x] `limitations`
- [x] 所有 V2 工具执行器必须返回 evidence。

验收：

- [x] 最终回复数字和表格能追溯到 evidence。
- [x] evidence 不包含越权原始字段；工具 data 已先执行字段策略过滤。

---

## 7. P0 回复契约任务

### T5.1 问题一致性校验

- [x] 新增 `AgentV2AnswerContractValidatorService`。
- [x] 拦截：
  - 问“已发生报废记录”却命中风险能力。
  - 问“风险/临期”却命中已发生记录能力。
- [x] 要求 `inventory.scrap.records.list` 必须有表格或 `items`。
- [x] 扩展到次卡开卡订单与次卡核销边界。
- [x] 扩展到记录型能力必须返回表格、指标型能力必须返回 KPI。
- [x] 订单、收银、财务、客户消费已具备 P0 业务一致性契约；更细粒度规则进入后续 eval 扩展。

验收：

- [x] “本周有哪些报废产品”不能回答成库存风险。
- [x] “次卡核销记录”不能误路由为“次卡开卡订单”。
- [x] “终端收银订单是否进入日结报表”已能路由到财务/收银/订单详情能力，并输出跨对象证据。

### T5.2 证据一致性校验

- [x] V2 已要求 evidence。
- [x] 数字型回答必须能从证据包找到来源字段。
- [x] “有哪些/列出/明细”必须返回列表或表格。
- [x] “为什么/原因”必须返回证据和限制说明。

### T5.3 失败处理

- [x] `contract_failed` 时优先重试一次能力裁决。
- [x] 重试仍失败时返回拦截说明。
- [x] 失败样例通过 `failureCategory`、`contractResult` 和 eval gate 报告沉淀为后续治理输入。

---

## 8. P1 自动化能力生成任务

### T6.1 Schema 扫描

- [x] 新增独立 V2 扫描脚本，不在旧 `agent:knowledge:*` 上继续补丁。
- [x] 输出 V2 manifest 草稿。
- [x] 已扫描 Prisma 模型与字段，并识别可选字段、数组字段、关联字段、时间字段、门店字段、用户字段、金额字段和状态字段。

### T6.2 Controller / DTO 扫描

- [x] 扫描 Nest Controller 路由。
- [x] 扫描 DTO 入参字段。
- [x] 返回字段按 DTO、schema、能力输出形态和证据要求生成草稿；需要人工发布的候选能力进入治理报告，不自动发布。
- [x] 识别只读、指标、趋势、详情、草稿、写入、删除、发券、下发等动作类型。

### T6.3 前端路由和菜单扫描

- [x] 扫描管理端路由和菜单入口。
- [x] 已从 `withGuard(...)` 识别前端路由权限。
- [x] 后端接口已识别 `@Permissions(...)`；无显式权限的能力会标记为 `domain_inferred` 并进入治理报告，不影响已发布 V2 能力门禁。

### T6.4 语义字典和反例生成

- [x] 从业务词典、路由、接口和内置 manifest 生成同义词。
- [x] 已根据接口、路由、内置 manifest 自动生成正例、反例草稿。
- [x] 将 eval 失败样例沉淀成 `negativeExamples` / `failureCategory`。

### T6.5 发布策略

发布规则：

- [x] 直接写入：不自动发布，必须审批。
- [x] 删除：不自动发布，必须审批。
- [x] 发券：不自动发布，必须审批。
- [x] 下发跟进/外部触达：不自动发布，必须审批。
- [x] 其他只读、指标、明细、趋势、对象详情、草稿能力：可自动发布，但必须通过权限、字段、证据包和评测门禁。
- [x] 自动生成器已按上述策略生成 `auto_publish`、`approval_required`、`write_blocked` 三类草稿。

验收：

- [x] 生成 `agent-v2-capability-drafts.json`。
- [x] 生成 `agent-v2-capability-drafts.md`。
- [x] 生成 `agent-v2-eval-drafts.json`。
- [x] 生成 `agent-v2-eval-drafts.md`。
- [x] 生成 `agent-v2-capability-governance-report.json`。
- [x] 生成 `agent-v2-capability-governance-report.md`。
- [x] 生成 `agent-v2-eval-gate-report.json`。
- [x] 生成 `agent-v2-eval-gate-report.md`。

---

## 9. P1/P2 评测驱动治理任务

### T7.1 全量题库接入

- [x] 读取 `docs/04-测试数据/agent-eval-questions.md` 全量题库。
- [x] 不在任务文档里复制全部 600+ 题，避免题库双写。
- [x] 题库作为唯一验收数据源。
- [x] 当前生成结果：650 条问题全部进入 `agent-v2-eval-drafts.json`。

题库验收覆盖：

- 店长经营 Agent
- 库存 Agent
- 收银 Agent
- 客户增长 Agent
- 客户跟进 Agent
- 排班 Agent
- 预约 Agent
- 核销 Agent
- 办卡/充值 Agent
- 财务/利润 Agent
- 供应链/采购 Agent
- 权限敏感问题
- 系统暂不支持问题

### T7.2 评测分类

- [x] 每条题已输出基础草稿字段：
  - `question`
  - `selectedCapabilityId`
  - `outputKinds`
- [x] 已补齐正式评测字段：
  - `expectedIntent`
  - `evidenceRequired`
  - `permissionResult`
  - `contractResult`
  - `failureCategory`

失败分类：

- 能力缺失
- 语义错路由
- 权限缺失
- 字段脱敏缺失
- 证据缺失
- 输出形态错误
- 数据缺口
- 需要澄清
- 暂不支持

### T7.3 门禁指标

- [x] P0 问题错路由率为 0。
- [x] P0 支持问题契约通过率 100%。
- [x] 只读问题越权证据包为 0。
- [x] 高风险写入自动执行数为 0。
- [x] 已生成 V2 草稿治理报告。
- [x] 已生成 V2 eval 门禁报告。
- [x] CI strict 门禁接入：`.github/workflows/agent-v2.yml`。
- [x] 当前门禁通过：650 条问题全部进入 V2 eval drafts；103 条 P0 问题中，未映射 0、权限需复核 0、契约未通过 0、能力缺失/语义错路由 0、高风险自动发布 0。
- 说明：自动扫描产生的候选草稿仍有 50 条使用领域推断权限，按治理报告进入人工审核队列，不阻断已发布 V2 能力运行门禁。

---

## 10. 验证记录

当前已执行：

```powershell
npm.cmd --prefix packages/server-v2 test -- agent-v2-capability-decision.service.spec.ts agent-v2-business-record-query.service.spec.ts agent-v2-business-metric-query.service.spec.ts agent-v2-navigation.service.spec.ts agent-v2-runtime.service.spec.ts --runInBand
npm.cmd run agent-v2:capability-drafts
npm.cmd run agent-v2:eval-gate
npm.cmd --prefix packages/server-v2 run build
npm.cmd --prefix packages/server-v2 test -- --runTestsByPath src/agent-v2/agent-v2-runtime.service.spec.ts src/agent-v2/capability/agent-v2-capability-decision.service.spec.ts src/agent-v2/contracts/agent-v2-answer-contract-validator.service.spec.ts src/agent-v2/policy/agent-v2-policy-gateway.service.spec.ts src/agent-v2/tools/agent-v2-business-record-query.service.spec.ts src/agent-v2/tools/agent-v2-business-metric-query.service.spec.ts src/agent-v2/tools/agent-v2-business-trend-query.service.spec.ts src/agent-v2/tools/agent-v2-business-detail-query.service.spec.ts src/agent-v2/tools/agent-v2-business-action-draft.service.spec.ts src/agent-v2/tools/agent-v2-navigation.service.spec.ts
npm.cmd --prefix packages/server-v2 run agent-v2:capability-drafts
npm.cmd --prefix packages/server-v2 run agent-v2:eval-gate:strict
npm.cmd --prefix packages/server-v2 run build
```

结果：

- [x] 2026-07-03：`agent-v2` 定向测试通过，5 个测试套件、25 个用例全部通过。
- [x] 2026-07-03：`server-v2` build 通过。
- [x] 2026-07-03：新增 V2 policy gateway 后，`agent-v2` 定向测试通过，6 个测试套件、27 个用例全部通过。
- [x] 2026-07-03：新增 V2 policy gateway 后，`server-v2` build 通过。
- [x] 2026-07-03：新增 `agent-v2-capability-draft-generator` 后，`npm.cmd --prefix packages/server-v2 run agent-v2:capability-drafts` 通过。
- [x] 2026-07-03：生成 581 条 V2 能力草稿，其中自动发布候选 308 条、需审批 265 条、写入阻断 8 条。
- [x] 2026-07-03：全量读取 `agent-eval-questions.md`，生成 650 条 V2 eval 草稿，其中 499 条保守标记为未映射能力候选。
- [x] 2026-07-03 02:34：按“重新开发”口径重新运行 V2 能力生成器，输出 581 条能力草稿、650 条 eval 草稿；生成策略仍为 V2 独立能力目录，旧 Agent 仅保留兼容桥接。
- [x] 2026-07-03 02:34：`agent-v2` 定向测试通过，6 个测试套件、27 个用例全部通过。
- [x] 2026-07-03 02:35：`server-v2` build 通过。
- [x] 2026-07-03 02:58：V2 能力生成器已补充 DTO、真实权限来源和治理报告；扫描 120 个 Prisma 模型、177 个 DTO、587 个 Controller 接口、71 个前端路由，生成 581 条能力草稿、650 条 eval 草稿。
- [x] 2026-07-03 02:58：新增 `agent-v2-capability-governance-report.json` 和 `agent-v2-capability-governance-report.md`，报告会区分 controller/route 显式权限与 `domain_inferred` 推断权限。
- [x] 2026-07-03 02:59：`agent-v2` 定向测试通过，6 个测试套件、27 个用例全部通过。
- [x] 2026-07-03 02:59：`server-v2` build 通过。
- [x] 2026-07-03 03:10：重新生成能力草稿，扫描 120 个 Prisma 模型、177 个 DTO、587 个 Controller 接口、71 个前端路由、650 条评测题，输出 581 条能力草稿和 650 条 eval 草稿。
- [x] 2026-07-03 03:10：生成 `agent-v2-eval-gate-report.json` 和 `agent-v2-eval-gate-report.md`，门禁未通过：P0 题数 103，P0 未映射 47，P0 权限需复核 62，P0 契约未通过 53，高风险自动发布样例 50，推断权限样例 50。
- [x] 2026-07-03 03:11：`agent-v2` 定向测试通过，6 个测试套件、27 个用例全部通过。
- [x] 2026-07-03 03:11：`server-v2` build 通过。
- [x] 2026-07-03 03:17：根项目 `npm.cmd run agent-v2:eval-gate` 通过并刷新门禁报告；门禁结论仍为未通过，缺口数字未变化。
- [x] 2026-07-03 03:37：新增支付方式收款拆分、退款统计、员工提成汇总三个 V2 指标能力；`agent-v2` 定向测试通过，6 个测试套件、33 个用例全部通过。
- [x] 2026-07-03 03:37：`server-v2` build 通过。
- [x] 2026-07-03 03:37：重新生成能力草稿，扫描 120 个 Prisma 模型、177 个 DTO、587 个 Controller 接口、71 个前端路由、650 条评测题，输出 581 条能力草稿和 650 条 eval 草稿。
- [x] 2026-07-03 03:38：根项目 `npm.cmd run agent-v2:eval-gate` 通过并刷新门禁报告；门禁仍未通过，但 P0 未映射从 47 降至 22，P0 权限需复核从 62 降至 36，P0 契约未通过从 53 降至 47。
- [x] 2026-07-03 05:48：按“不要在旧文件上打补丁，直接重新开发”边界继续推进 V2；新增次卡沉睡、免费/付费次卡对比、财务诊断、多域摘要等 P0 能力，不再向旧 `src/agent/*` 增加业务规则。
- [x] 2026-07-03 05:48：`npm.cmd --prefix packages/server-v2 test -- agent-v2-capability-decision.service.spec.ts agent-v2-business-record-query.service.spec.ts agent-v2-business-metric-query.service.spec.ts agent-v2-navigation.service.spec.ts agent-v2-runtime.service.spec.ts --runInBand` 通过，5 个测试套件、72 个用例全部通过。
- [x] 2026-07-03 05:48：`npm.cmd run agent-v2:capability-drafts` 通过，扫描 120 个 Prisma 模型、177 个 DTO、587 个 Controller 接口、71 个前端路由、650 条评测题，输出 581 条能力草稿和 650 条 eval 草稿。
- [x] 2026-07-03 05:49：`npm.cmd run agent-v2:eval-gate` 通过；650 条题、103 条 P0，P0 未映射 0、权限需复核 0、契约未通过 0、能力缺失/语义错路由 0、高风险自动发布 0，门禁结论通过。
- [x] 2026-07-03 05:49：仍有 50 条自动扫描候选草稿使用领域推断权限，已归入治理报告待办，不阻断已发布 V2 能力。
- [x] 2026-07-03 05:50：`npm.cmd --prefix packages/server-v2 run build` 通过。
- [x] 2026-07-03 06:49：按“不要在旧文件上打补丁，直接重新开发”继续推进 V2 原生工具层；新增 `business.trend.query`、`business.detail.query`、`business.action.draft` 三类执行器及 contract 门禁，不向旧 `packages/server-v2/src/agent/*` 增加业务规则。
- [x] 2026-07-03 06:49：`npm.cmd --prefix packages/server-v2 test -- --runTestsByPath src/agent-v2/agent-v2-runtime.service.spec.ts src/agent-v2/capability/agent-v2-capability-decision.service.spec.ts src/agent-v2/contracts/agent-v2-answer-contract-validator.service.spec.ts src/agent-v2/tools/agent-v2-business-trend-query.service.spec.ts src/agent-v2/tools/agent-v2-business-detail-query.service.spec.ts src/agent-v2/tools/agent-v2-business-action-draft.service.spec.ts` 通过，6 个测试套件、60 个用例全部通过。
- [x] 2026-07-03 06:50：`npm.cmd --prefix packages/server-v2 run agent-v2:capability-drafts` 通过，扫描 120 个 Prisma 模型、177 个 DTO、587 个 Controller 接口、71 个前端路由、650 条评测题，输出 581 条能力草稿和 650 条 eval 草稿。
- [x] 2026-07-03 06:51：`npm.cmd --prefix packages/server-v2 run agent-v2:eval-gate` 通过；650 条题、103 条 P0，P0 未映射 0、权限需复核 0、契约未通过 0、能力缺失/语义错路由 0、高风险自动发布 0，门禁结论通过。
- [x] 2026-07-03 06:51：仍有 50 条自动扫描候选草稿使用领域推断权限，继续归入治理报告待办，不阻断已发布 V2 能力。
- [x] 2026-07-03 07:26：新增跨平台 V2 脚本启动器 `packages/server-v2/scripts/run-agent-v2-script.mjs`，替代 Windows 专用 `set ...&&`，CI/Linux 与 Windows 本地使用同一入口。
- [x] 2026-07-03 07:26：新增 `.github/workflows/agent-v2.yml`，接入 V2 单测、能力草稿生成、strict eval gate 和 API build。
- [x] 2026-07-03 07:26：`npm.cmd --prefix packages/server-v2 run agent-v2:capability-drafts` 通过；扫描 120 个 Prisma 模型、177 个 DTO、587 个 Controller 接口、275 个显式权限接口、71 个前端路由、650 条评测题，输出 581 条能力草稿和 650 条 eval 草稿。
- [x] 2026-07-03 07:26：`npm.cmd --prefix packages/server-v2 run agent-v2:eval-gate:strict` 通过；650 条题、103 条 P0，P0 未映射 0、权限需复核 0、契约未通过 0、能力缺失/语义错路由 0、高风险自动发布 0，门禁结论通过。
- [x] 2026-07-03 07:27：`npm.cmd --prefix packages/server-v2 test -- --runTestsByPath ...agent-v2...` 通过，10 个测试套件、98 个用例全部通过。
- [x] 2026-07-03 07:27：`npm.cmd --prefix packages/server-v2 run build` 通过。
- [x] 2026-07-03 07:47：重新运行 `npm.cmd --prefix packages/server-v2 test -- --runTestsByPath ...agent-v2...`，10 个测试套件、98 个用例全部通过。
- [x] 2026-07-03 07:47：重新运行 `npm.cmd --prefix packages/server-v2 run agent-v2:eval-gate:strict`，650 条题、103 条 P0，五个 P0 门禁项全部为 0，门禁结论通过。
- [x] 2026-07-03 07:48：重新运行 `npm.cmd --prefix packages/server-v2 run build`，API build 通过。

已知未通过的旧链路测试：

```powershell
npm.cmd --prefix packages/server-v2 test -- --runInBand business-task-compiler.service.spec.ts agent-planner.service.spec.ts
```

结果：

- [!] 旧 `business-task-compiler` / `agent-planner` 存在历史期望漂移。
- [!] 这部分不按“补丁式修旧测试”处理，后续应迁移为 V2 eval 或明确保留为 legacy fallback 测试。

---

## 11. 下一阶段开发顺序

### Sprint 1：V2 P0 能力补齐

- [x] 补齐订单、收银、客户消费、财务日结、员工提成 P0 manifest。
- [x] `business.record.query` 支持订单、收银、核销、充值、客户消费。
- [x] `business.record.query` 支持次卡沉睡客户、客户次卡状态、客户权益状态。
- [x] `business.metric.query` 已支持日结、支付方式拆分、退款统计、员工提成汇总、商品毛利、项目毛利、整体毛利、次卡销售、支付手续费、权益核销、免费/付费次卡对比、折扣风险、财务诊断、多域摘要。
- [x] 回复契约已覆盖 P0 记录/KPI基本形态、次卡边界、只读退款、财务诊断、多域摘要。
- [x] 订单、收银、财务跨对象详情解释已通过 `business.detail.query` 进入 V2 原生详情执行器。

### Sprint 2：权限和字段策略独立化

- [x] 新建 `AgentV2PolicyGatewayService`。
- [x] V2 工具执行前统一走 policy gateway。
- [x] V2 工具结果统一应用 field policy。
- [x] 证据包加字段策略审计。
- [x] 将工具角色校验、动作风险审批和发布策略进一步从旧 policy 完整迁移到 V2 policy gateway。

### Sprint 3：自动生成能力

- [x] 扫描 Prisma、Controller、DTO、路由、菜单和真实权限码；无显式权限候选进入治理报告。
- [x] 生成 V2 capability drafts。
- [x] 生成 eval drafts。
- [x] 发布策略已自动分类；人工审核只针对 `domain_inferred` 和高风险候选能力，不阻断已发布 V2 能力。

### Sprint 4：全量评测门禁

- [x] 读取 `agent-eval-questions.md`，当前 650 条问题已进入 V2 eval drafts。
- [x] 输出全量 eval 门禁报告。
- [x] CI 增加 P0 门禁。
- [x] 线上反馈按 `failureCategory` / `negativeExamples` / eval drafts 口径沉淀，不再靠旧关键词补丁。

---

## 12. 完成标准

本专项全部完成必须同时满足：

- [x] 旧关键词路由不再直接决定最终工具。
- [x] 支持能力全部经过 V2 能力目录裁决。
- [x] P0 业务问法均有 manifest、executor、evidence、contract。
- [x] 只读、指标、明细、趋势、对象详情、草稿能力可自动发布。
- [x] 直接写入、删除、发券、下发必须审批，不允许自动执行。
- [x] 全量题库接入评测，P0 错路由率为 0。
- [x] 所有可见数字和表格都有授权证据包。
- [x] 无权限数据不会进入模型上下文。

---

## 13. 当前交付结论

当前不是“旧文件补丁修复”，而是已经按 `agent-v2` 独立能力层重建。
本轮已完成 P0 评测闭环：650 条题库已进入 V2 eval drafts，103 条 P0 问题在能力映射、权限、契约、错路由和高风险自动发布五个门禁项上全部通过。
架构边界已经验证：事实记录、风险预测、指标诊断、导航、动作草稿被拆成独立能力，只有已有原生 V2 工具且通过权限/证据/契约的能力才会接管旧入口。

本专项交付边界已经从“旧 Agent 补丁”切换为“V2 独立能力目录 + 通用工具执行器 + 授权证据包 + 回复契约 + eval/CI 门禁”。
剩余可选工作是产品化治理台：对 50 条 `domain_inferred` 自动扫描候选能力做人工审核、启停、版本和审计展示；这不阻断已发布 V2 能力运行门禁。
