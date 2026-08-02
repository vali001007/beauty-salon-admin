# Agent V6 美业 Ontology 与指标口径设计

版本：v1.0
日期：2026-07-09
依据：《Agent V6 完全独立经营管理 Agent 需求文档-2026-07-09.md》
边界：本文定义 Agent V6 独立美业语义层，不复用历史 Agent 知识图谱、提示词或评测题库。

## 1. 设计目标

Agent V6 的 Ontology 不是学术知识图谱，而是美业门店经营语义层。它要解决四类问题：

1. 用户用口语说“最近业绩不行”“小王客户掉了”“库存不太对”时，系统知道要问什么、查什么、按什么口径解释。
2. 数据分散在客户、预约、订单、会员卡、库存、营销、员工、财务等表时，系统知道对象关系。
3. 同一个指标有多种口径时，系统能展示定义、来源、时间范围和排除项。
4. Agent 生成建议和动作时，能绑定对象、状态、风险和权限。

## 2. 12 个一级意图域

| 域 | 用户口语 | 核心对象 | P0 目标 |
| --- | --- | --- | --- |
| 经营概览 | 今天经营怎么样、这周差在哪 | Store、Order、Customer、Reservation | 收入、客流、预约、库存风险汇总 |
| 客户经营 | 谁快流失了、老客怎么拉回 | Customer、Lifecycle、Opportunity | 流失风险、复购机会、客户分层 |
| 预约到店 | 下午空不空、谁没来 | Reservation、Room、Employee | 今日预约、空档、未到店 |
| 服务履约 | 上次做了什么、护理跟进 | ServiceItem、ServiceTask、CardUsage | 服务历史、待服务、复购建议 |
| 会员与资产 | 卡还有多少、负债高不高 | MemberCard、Balance、CardUsage | 会员资产、扣次、负债风险 |
| 收银财务 | 昨天收银有没有异常 | Order、Payment、Refund | 收银、退款、折扣、对账异常 |
| 库存供应链 | 哪些快没了、哪些临期 | Product、StockBatch、StockMovement | 低库存、临期、异常消耗 |
| 营销增长 | 给哪些人发活动、效果怎样 | Campaign、Segment、Touch、Attribution | 分群、活动效果、触达建议 |
| 员工人效 | 小王最近怎么样 | Employee、Schedule、Commission | 业绩、服务、排班、人效 |
| 客服私域 | 投诉处理了吗、谁要回访 | Complaint、FollowUpTask、Feedback | 回访、客诉、差评提醒 |
| 风险合规 | 有什么风险、谁越权了 | RiskSignal、Policy、Approval | 风险提示、权限拦截 |
| 系统运维 | 终端离线了吗、接口失败了吗 | Device、SyncJob、Run | 终端、同步、任务失败 |

## 3. 核心对象模型

### 3.1 门店与组织

| 对象 | 含义 | 关键关系 |
| --- | --- | --- |
| `Store` | 门店 | 拥有客户、员工、库存、订单、预约 |
| `BusinessUnit` | 总部/区域/门店单元 | 管理多个门店 |
| `Room` | 房间 | 承接预约和服务 |
| `Device` | 终端设备 | 产生终端服务、核销、问答或同步状态 |
| `Channel` | 来源渠道 | 关联客户、预约、活动和订单 |

### 3.2 人

| 对象 | 含义 | 关键关系 |
| --- | --- | --- |
| `Customer` | 客户 | 预约、订单、会员卡、画像、触达、风险 |
| `Employee` | 员工 | 排班、服务、业绩、提成 |
| `Beautician` | 美容师 | 服务项目、客户偏好、服务记录 |
| `Operator` | 系统操作人 | 发起查询、审批、执行动作 |
| `Supplier` | 供应商 | 商品、采购、交付风险 |

### 3.3 商品服务

| 对象 | 含义 | 关键关系 |
| --- | --- | --- |
| `ServiceItem` | 服务项目 | 关联疗程、价格、耗材、员工技能 |
| `TreatmentPlan` | 疗程计划 | 关联客户、项目、周期、次数 |
| `Package` | 次卡/组合权益 | 关联会员资产和核销 |
| `Product` | 产品/耗材 | 关联库存、采购、服务消耗 |
| `Consumable` | 耗材 | 被服务项目消耗 |

### 3.4 交易资产

| 对象 | 含义 | 关键关系 |
| --- | --- | --- |
| `Appointment` | 预约 | 客户、项目、员工、房间、到店状态 |
| `Order` | 订单 | 客户、商品/项目、支付、退款 |
| `Payment` | 支付 | 订单、支付方式、对账 |
| `Refund` | 退款 | 订单、原因、审批 |
| `MemberCard` | 会员卡/次卡 | 客户资产、扣次、负债 |
| `Balance` | 储值/余额 | 账户、流水、负债 |
| `Coupon` | 优惠券/权益 | 活动、客户、核销 |

### 3.5 经营动作与风险

| 对象 | 含义 | 关键关系 |
| --- | --- | --- |
| `Campaign` | 营销活动 | 分群、触达、转化、归因 |
| `FollowUpTask` | 跟进任务 | 客户、负责人、结果 |
| `PurchaseOrder` | 采购单 | 产品、供应商、库存 |
| `InventoryMovement` | 库存流水 | 入库、出库、调拨、消耗 |
| `RiskSignal` | 风险信号 | 触发任务、审批、建议 |
| `ApprovalRule` | 审批规则 | 动作风险、权限、审批人 |

## 4. 关系设计

P0 需要支持的基础关系：

| 关系 | 说明 | 用途 |
| --- | --- | --- |
| Customer -> Appointment | 客户产生预约 | 空档、到店、爽约分析 |
| Customer -> Order | 客户产生消费 | 客户价值、复购、流失 |
| Customer -> MemberCard | 客户拥有会员资产 | 资产风险、扣次、权益 |
| Customer -> Campaign | 客户被活动触达 | 营销归因、触达疲劳 |
| ServiceItem -> Product | 项目消耗产品/耗材 | 库存预测、毛利 |
| Appointment -> Employee | 预约由员工承接 | 排班、人效、服务质量 |
| Order -> Payment/Refund | 订单产生支付和退款 | 财务异常、对账 |
| Product -> StockBatch | 产品有库存批次 | 临期、低库存 |
| RiskSignal -> FollowUpTask | 风险触发任务 | 数字店长行动 |
| AgentRun -> Evidence | 回答绑定证据 | 治理和追责 |

## 5. 状态机

### 5.1 客户生命周期

| 状态 | 定义 | 进入条件 | 建议动作 |
| --- | --- | --- | --- |
| `new_lead` | 新线索 | 有咨询或留资，无到店 | 首次邀约 |
| `new_customer` | 新客 | 首次到店或首次消费 | 建档、服务体验跟进 |
| `active_customer` | 活跃客户 | 近周期有预约或消费 | 复购和升单 |
| `treatment_in_progress` | 疗程中 | 有未完成疗程/次卡 | 护理提醒、扣次跟进 |
| `at_risk` | 流失风险 | 超过复购周期或消费下降 | 高优先级回访 |
| `dormant` | 沉睡客户 | 长期未到店 | 唤醒活动 |
| `lost` | 流失客户 | 超长周期无互动 | 低频触达或标记流失 |

### 5.2 预约状态

| 状态 | 含义 | 风险 |
| --- | --- | --- |
| `pending` | 待确认 | 未确认导致空档 |
| `confirmed` | 已确认 | 需关注到店 |
| `checked_in` | 已到店 | 需完成服务/收银 |
| `completed` | 已完成 | 需回访和复购 |
| `cancelled` | 已取消 | 高频取消风险 |
| `no_show` | 爽约 | 客户风险和排班损耗 |

### 5.3 库存状态

| 状态 | 定义 | 建议 |
| --- | --- | --- |
| `normal` | 高于安全库存且未临期 | 无需动作 |
| `low_stock` | 当前库存低于安全库存 | 生成补货建议 |
| `expiring` | 批次在临期窗口内 | 生成消耗或促销建议 |
| `abnormal_consumption` | 消耗偏离预约/服务量 | 核查服务消耗或盘点 |
| `stockout` | 无可用库存 | 高优先级采购或调拨 |

### 5.4 动作状态

| 状态 | 含义 |
| --- | --- |
| `draft` | Agent 生成草案 |
| `dry_run` | 已计算影响 |
| `pending_approval` | 等待审批 |
| `approved` | 已审批 |
| `executed` | 已执行 |
| `rejected` | 已拒绝 |
| `cancelled` | 已取消 |

## 6. 别名与口语映射

P0 需要建立别名词典：

| 用户说法 | 规范对象/指标 |
| --- | --- |
| 业绩 | 收入、订单数、客单价、服务人次，需追问口径 |
| 客流 | 到店客户数、预约数、新客数，需看上下文 |
| 回款 | 实收金额、应收款、储值充值，需追问 |
| 卡耗 | 会员卡扣次、次卡核销 |
| 补水项目 | 服务项目别名，需映射项目表 |
| 小王 | 员工/美容师/前台别名，需按门店和角色消歧 |
| 最近 | 默认最近 30 天，可按上下文改最近 7 天 |
| 这周 | 本周自然周 |
| 不太行 | 需要追问是收入、客数、满意度、复购还是投诉 |

消歧规则：

- 人名重名时优先问角色。
- 指标多口径时优先问口径。
- 时间范围缺失时默认给建议假设并允许用户改。
- 涉及高风险动作时不能只靠别名推断。

## 7. 指标定义模板

每个指标必须按统一模板注册：

```json
{
  "key": "revenue.today",
  "name": "今日收入",
  "domain": "finance",
  "definition": "当前门店今日已完成订单和开卡产生的实收收入汇总",
  "formula": "sum(productOrder.totalAmount where status in active) + sum(customerCard.card.price)",
  "timeRangeDefault": "today",
  "dimensions": ["store", "employee", "channel", "serviceItem"],
  "sourceEntities": ["ProductOrder", "CustomerCard", "PaymentRecord"],
  "permission": "core:finance:view",
  "sensitivity": "P1",
  "traceable": true,
  "usableForSuggestion": true,
  "exclusions": ["cancelled orders", "failed payments"]
}
```

## 8. P0 指标清单

### 8.1 经营概览

| 指标 key | 名称 | 默认口径 | 权限 |
| --- | --- | --- | --- |
| `revenue.today` | 今日收入 | 今日已完成订单和开卡收入 | `core:finance:view` |
| `revenue.week` | 本周收入 | 本周已完成订单和开卡收入 | `core:finance:view` |
| `customer.new.count` | 新增客户数 | 时间范围内新增客户 | `core:customer:view` |
| `reservation.today.count` | 今日预约数 | 今日有效预约 | `core:store:reservations` |
| `inventory.warning.count` | 库存预警数 | 低库存 + 临期批次 | `core:inventory:stock` |

### 8.2 客户经营

| 指标 key | 名称 | 默认口径 | 权限 |
| --- | --- | --- | --- |
| `customer.churnRisk.count` | 流失风险客户数 | 超过复购周期或消费下降 | `core:customer:profile` |
| `customer.highValue.count` | 高价值客户数 | 消费或资产排名靠前 | `core:customer:profile` |
| `customer.dormant.count` | 沉睡客户数 | 长期无预约/消费 | `core:marketing:recommend` |
| `customer.followup.pending` | 待跟进客户数 | 未完成回访或营销任务 | `core:marketing:view` |

### 8.3 收银财务

| 指标 key | 名称 | 默认口径 | 权限 |
| --- | --- | --- | --- |
| `finance.refund.count` | 退款笔数 | 时间范围内退款记录 | `core:finance:view` |
| `finance.discount.abnormal` | 异常折扣数 | 折扣超过阈值或频率异常 | `core:finance:view` |
| `memberAsset.liability.amount` | 会员资产负债 | 未消耗储值/次卡估算 | `core:prepaid-liability:view` |
| `payment.failed.count` | 支付失败数 | 支付失败或未对账记录 | `core:finance:view` |

### 8.4 库存供应链

| 指标 key | 名称 | 默认口径 | 权限 |
| --- | --- | --- | --- |
| `inventory.lowStock.count` | 低库存数量 | 当前库存低于安全库存 | `core:inventory:stock` |
| `inventory.expiring.count` | 临期批次数 | 30 天内到期批次 | `core:inventory:expiry` |
| `inventory.consumption.abnormal` | 异常消耗项 | 消耗偏离服务量 | `core:inventory:consumption` |
| `purchase.pending.count` | 待采购数 | 待处理采购单 | `core:inventory:purchase` |

### 8.5 员工人效

| 指标 key | 名称 | 默认口径 | 权限 |
| --- | --- | --- | --- |
| `staff.service.count` | 服务人次 | 员工完成服务次数 | `core:store:beauticians` |
| `staff.revenue.amount` | 员工业绩 | 关联订单收入 | `core:finance:view` |
| `staff.commission.amount` | 员工提成 | 已计算提成 | `core:finance:view` |
| `staff.schedule.load` | 排班负载 | 已排服务时长/可用时长 | `core:store:scheduling` |

## 9. 跨表查询口径

P0 至少支持以下跨表查询：

1. 高价值流失风险客户：Customer + Order + Reservation + MemberCard + CustomerPredictionSnapshot。
2. 空档填充候选：Reservation + Customer + CustomerLifecycle + MarketingTouch。
3. 收银异常：ProductOrder + PaymentRecord + RefundRecord + CustomerCard。
4. 低库存与预约影响：Product + StockBatch + ProjectBomItem + Reservation。
5. 美容师业绩变化：Beautician + Reservation + Order + CommissionRecord。
6. 营销活动转化：MarketingActivity + MarketingAutomationTouch + Order + Attribution。

每个跨表查询必须输出：

- 结论。
- 时间范围。
- 涉及对象。
- 数据来源。
- 明细引用。
- 权限判断。
- 不确定项。

## 10. 评测映射

Ontology 需要和评测集绑定。

| 评测类型 | 检查点 |
| --- | --- |
| 意图识别 | 用户口语能命中正确 domain 和 intent |
| 实体解析 | 人名、客户、项目、门店、时间能解析或追问 |
| 指标口径 | 收入、业绩、客流、库存等能解释口径 |
| 权限过滤 | 无权限时不返回敏感明细 |
| 证据引用 | 回答必须有 source 和 time range |
| 高风险动作 | L3/L4 必须拦截到审批 |

## 11. P0 验收

P0 Ontology 通过标准：

- 12 个一级意图域完整注册。
- 核心对象、关系、状态机、别名和 P0 指标清单可通过 API 查询。
- 至少 50 个常见口语表达能映射到 domain/intent 或触发追问。
- 至少 20 个 P0 指标有完整定义、公式、来源、权限和敏感级别。
- 跨表查询答案能展示口径和 evidence。
- 无法确定口径时必须追问，不能假装确定。
