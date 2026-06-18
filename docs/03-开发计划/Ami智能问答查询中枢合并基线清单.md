# Ami 智能问答查询中枢合并基线清单

更新时间：2026-06-18

关联计划：

- `docs/03-开发计划/Ami智能问答查询中枢合并重构详细开发计划.md`

## 1. 目的

本清单用于冻结 BusinessQuery 与 Semantic SQL 合并重构的第一批验收问法，避免后续继续靠零散关键词补丁修复。

## 2. 当前合并策略

```text
自然语言 -> BusinessTask -> Capability -> QueryPlanner -> SemanticQueryExecutor / AgentTool
```

第一批已迁移到统一查询中枢的查询类能力：

| 能力 | Capability | 执行层 |
| --- | --- | --- |
| 收入/收银趋势 | `revenue_diagnosis` | `SemanticQueryExecutor` |
| 商品销量排行 | `product_sales_ranking` | `SemanticQueryExecutor` |
| 商品销量增长 | `product_sales_ranking` | `SemanticQueryExecutor` |
| 库存风险排行 | `inventory_risk_ranking` | `SemanticQueryExecutor` |
| 会员余额排行 | `card_member_business_diagnosis` | `SemanticQueryExecutor` |
| 卡项核销分析 | `card_member_business_diagnosis` | `SemanticQueryExecutor` |

继续保留专用工具的复杂能力：

| 能力 | Capability | 执行层 |
| --- | --- | --- |
| 客户优先跟进 | `customer_priority_recommendation` | `customer.priority.rank` |
| 员工表现排行 | `staff_performance_ranking` | `staff.performance.rank`，后续可迁移查询部分 |
| 预约排班诊断 | `reservation_schedule_diagnosis` | `schedule.diagnose` |
| 营销活动草稿 | `marketing.activity.draft` | 专用工具 + 审批 |
| 补货采购草稿 | `inventory.replenishment.draft` | 专用工具 + 审批 |

## 3. 高频问法基线

| 问法 | 领域 | 任务类型 | 时间 | 数量 | 目标 Capability | 目标执行层 |
| --- | --- | --- | --- | --- | --- | --- |
| 今天收银多少 | order | query | today | 默认 | `revenue_diagnosis` | SemanticQueryExecutor |
| 最近七天收银趋势 | order | query | last_7_days | 默认 | `revenue_diagnosis` | SemanticQueryExecutor |
| 本月收入怎么样 | business/order | query | this_month | 默认 | `revenue_diagnosis` | SemanticQueryExecutor |
| 最近销量好的商品有哪些 | product | ranking | last_30_days | 默认 | `product_sales_ranking` | SemanticQueryExecutor |
| 最近销量好的5个商品有哪些 | product | ranking | last_30_days | 5 | `product_sales_ranking` | SemanticQueryExecutor |
| 近期销量增长最快的商品 | product | ranking | last_30_days | 默认 | `product_sales_ranking` | SemanticQueryExecutor |
| 哪些商品库存不足 | inventory | query/ranking | last_30_days | 默认 | `inventory_risk_ranking` | SemanticQueryExecutor |
| 会员余额最高的客户 | memberCard | ranking | last_30_days | 默认 | `card_member_business_diagnosis` | SemanticQueryExecutor |
| 最近卡项核销情况 | card | query | last_30_days | 默认 | `card_member_business_diagnosis` | SemanticQueryExecutor |
| 今天最值得跟进的10个客户 | customer | recommendation | today | 10 | `customer_priority_recommendation` | 专用工具 |
| 下周重点关注哪些客户 | customer | recommendation/forecast | next_week | 默认 | `customer_priority_recommendation` | 专用工具 |
| 近期表现较好的员工 | staff | ranking | last_30_days | 默认 | `staff_performance_ranking` | 专用工具 |
| 最近活动转化怎么样 | marketing | query/diagnosis | last_30_days | 默认 | `marketing_conversion_diagnosis` | 专用工具，后续迁移查询部分 |
| 自动化执行效果怎么样 | automation | query/diagnosis | last_30_days | 默认 | `automation_execution_diagnosis` | 专用工具 |
| 最近退款多不多 | afterSales | query/diagnosis | last_30_days | 默认 | `refund_risk_diagnosis` | 专用工具，后续迁移查询部分 |

## 4. 用户侧展示约束

用户侧不得展示：

```text
recommended
opportunity
agent:tool:*
business-query:*
marketing:activity:*
timeRange=
storeId=
limit=
role=
operatorId=
CustomerPredictionSnapshot
ProductOrder
OrderItem
SQL
Prisma
```

用户侧必须展示：

```text
概述
明细
下一步动作
```

## 5. 当前验证入口

后端聚焦验证：

```powershell
cd D:\AI coding\beauty-salon-admin\packages\server-v2
npm.cmd test -- query-planner.service.spec.ts semantic-query-executor.service.spec.ts business-query.service.spec.ts agent.controller.spec.ts
npm.cmd run build
```

一键门禁：

```powershell
cd D:\AI coding\beauty-salon-admin
npm.cmd run check:ami-query-hub
```

## 6. 完成口径

本清单中的第一批 SemanticQueryExecutor 能力必须满足：

1. 生成 QueryPlan。
2. 通过 QuerySafetyGuard。
3. 使用白名单 Prisma 查询执行。
4. 返回统一 SemanticQueryResult。
5. BusinessQuery 兼容 API 可转接新结果。
6. 不展示内部字段。
7. 通过自动化测试和构建。
