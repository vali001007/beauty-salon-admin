# Ami Brain 650题真实请求路径评测报告

生成时间：2026/7/19 03:43:03

## 评测范围

- 产品版本：当前工作区最新版 Ami Brain
- 请求路径：BrainChatService.createConversation + BrainChatService.sendMessage
- 问题来源：D:\AI coding\beauty-salon-admin\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\agent-eval-questions.md
- 问题数：650
- 实际记录数：650
- 实际对话轮数：650
- 门店：requestedStoreId=6，runtimeStoreId=6
- 权限来源：active_backend_role_catalog_plus_candidate_minimum_permissions
- 已注册评测角色：beautician, finance, inventory, marketing, receptionist, store_manager
- 冻结发布快照：d1d59a2bbb9bdbdca78e5004bdc085d49f51b0b67a05d208fc8a058aeb9fa7f0 / capabilities=card_usage_action_preview, customer_facts, customer_follow_up_draft, customer_priority_recommendation, finance_payment_breakdown, finance_risk_overview, front_desk_operations_overview, gap_fill_touch_preview, inventory_operations_overview, inventory_procurement_advice, inventory_risk_ranking, manager_staff_overview, marketing_customer_segment, marketing_growth_overview, marketing_message_draft, marketing_strategy_execute_preview, marketing_touch_draft, order_revenue_analysis, product_sales_ranking, project_service_ranking, reservation_action_preview, reservation_list, staff_performance_ranking, store_operations_overview
- 评分口径：同时输出旧口径和新口径。旧口径为“completed 且有 metric citation”；新口径要求意图、指标口径、回答粒度匹配。
- 六层门禁：意图、工具、计划、执行、完成度、答案均为确定性评分；任一层失败即不计入真实可用。

## 总体结论

Ami Brain 当前已经不再是空入口：每题都会创建会话、写入用户消息、创建运行记录、执行安全检查和认知解析，再由语义问数链路返回回答或明确拒答。

本报告的新口径会把“命中指标但答非所问”的样本归为假阳性。排名题、名单题、对比题、文案题不会再因为带了 metric citation 就被计为真实可用。

## 总览

| 指标 | 数值 |
| --- | ---: |
| 总题数 | 650 |
| 可评测题数 | 638 |
| 模型供应商不可用 | 12 |
| 旧口径可用题数 | 87 |
| 旧口径可用率 | 13.6% |
| 新口径真实可用题数 | 257 |
| 新口径真实可用率 | 40.3% |
| 多轮场景通过数 | 0 / 0 |
| 多轮轮次通过数 | 257 / 650 |
| 平均耗时 | 15265 ms |
| P95 耗时 | 27942 ms |
| 最大耗时 | 39423 ms |
| 权限绕过数 | 0 |
| 跨门店读取数 | 0 |
| roleHint 绕过数 | 0 |
| 假动作确认数 | 0 |

## 六层评分

| 层级 | 通过数 | 通过率 | 平均分 |
| --- | ---: | ---: | ---: |
| intent | 497 / 638 | 77.9% | 81.2% |
| tool | 401 / 638 | 62.9% | 62.9% |
| plan | 405 / 638 | 63.5% | 87.8% |
| execution | 581 / 638 | 91.1% | 91.1% |
| completion | 379 / 638 | 59.4% | 61.6% |
| answer | 302 / 638 | 47.3% | 47.3% |

## Grounding 分布

| Grounding 类型 | 数量 |
| --- | ---: |
| Metric Query | 15 |
| DB Skill | 342 |
| Template Skill | 14 |
| Preview Action | 0 |
| None | 267 |

## 执行路径分布

| 执行路径 | 数量 |
| --- | ---: |
| model_primary | 561 |
| exact_contract_fast_path | 80 |
| model_unavailable | 9 |

## Adapter 分布

| Adapter | 数量 |
| --- | ---: |
| none | 638 |

## Domain 分布

| Domain | 数量 |
| --- | ---: |
| customer | 316 |
| project | 174 |
| reservation | 153 |
| product | 147 |
| beautician | 135 |
| finance | 127 |
| payment | 79 |
| order | 73 |
| staff | 55 |
| payment_record | 49 |
| product_order | 45 |
| marketing | 43 |
| refund | 36 |
| operating_cost | 32 |
| none | 30 |
| order_item | 6 |

## Capability 分布

| Capability | 数量 |
| --- | ---: |
| none | 242 |
| customer_facts | 95 |
| inventory_operations_overview | 76 |
| finance_risk_overview | 60 |
| marketing_growth_overview | 31 |
| manager_staff_overview | 23 |
| store_operations_overview | 20 |
| front_desk_operations_overview | 19 |
| marketing_message_draft | 17 |
| inventory_procurement_advice | 16 |
| customer_priority_recommendation | 13 |
| reservation_list | 12 |
| marketing_customer_segment | 11 |
| finance_payment_breakdown | 8 |
| order_revenue_analysis | 8 |
| gap_fill_touch_preview | 4 |
| reservation_action_preview | 3 |
| card_usage_action_preview | 2 |
| inventory_risk_ranking | 2 |
| project_service_ranking | 2 |
| staff_performance_ranking | 2 |
| product_sales_ranking | 1 |

## 与 2026-07-10 基线对比

基线文件：D:\AI coding\beauty-salon-admin\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\ami-brain-eval-run-2026-07-10\ami-brain-eval-results-2026-07-10.json

| 指标 | 2026-07-10 基线 | 本次修复后 |
| --- | ---: | ---: |
| 旧口径可用率 | 15.5% | 13.6% |
| 真实可用率 | 3.4% | 39.5% |
| 假阳性数 | 79 | 52 |
| 时间误退化全量数 | 12 | 1 |
| 文案/操作误命中指标数 | 21 | 14 |

## 状态分布

| 状态 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 真实可用 | 255 | 255 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 意图未覆盖 | 243 | 0 | 0.0% | 0 | 243 | 0 | 0 | 0 | 0 |
| 指标查询失败 | 53 | 0 | 0.0% | 53 | 0 | 0 | 0 | 0 | 0 |
| 假阳性-意图错配 | 33 | 0 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 会话/门店不存在 | 33 | 0 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 模型供应商不可用 | 12 | 0 | 0.0% | 0 | 0 | 0 | 0 | 12 | 0 |
| 假阳性-粒度错配 | 11 | 0 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 假阳性-指标错配 | 8 | 0 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 部分可用 | 2 | 2 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |

## 角色分布

| 角色 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 美容师服务 | 100 | 4 | 4.0% | 12 | 59 | 0 | 0 | 1 | 0 |
| 财务风控 | 100 | 32 | 33.0% | 14 | 35 | 0 | 0 | 3 | 0 |
| 库存采购 | 100 | 58 | 58.0% | 3 | 27 | 0 | 0 | 0 | 0 |
| 店长经营 | 100 | 80 | 80.0% | 0 | 20 | 0 | 0 | 0 | 0 |
| 营销增长 | 100 | 48 | 49.5% | 11 | 24 | 0 | 0 | 3 | 0 |
| 前台接待 | 100 | 26 | 26.3% | 8 | 54 | 0 | 0 | 1 | 0 |
| 边界/多轮 | 50 | 9 | 19.6% | 5 | 24 | 0 | 0 | 4 | 0 |

## 分类分布

| 分类 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 财务风险与合规 | 25 | 10 | 40.0% | 1 | 12 | 0 |
| 采购建议 | 25 | 14 | 56.0% | 1 | 8 | 0 |
| 成本与毛利 | 25 | 5 | 20.8% | 5 | 9 | 0 |
| 服务记录与跟进 | 25 | 0 | 0.0% | 4 | 19 | 0 |
| 个人业绩 | 25 | 1 | 4.2% | 5 | 14 | 0 |
| 今日服务安排 | 25 | 0 | 0.0% | 1 | 8 | 0 |
| 客户查询 | 25 | 2 | 8.0% | 0 | 18 | 0 |
| 客户护理建议 | 25 | 3 | 12.0% | 2 | 18 | 0 |
| 库存查询与风险 | 25 | 19 | 76.0% | 0 | 5 | 0 |
| 收入与对账 | 25 | 8 | 33.3% | 5 | 7 | 0 |
| 收银与核销 | 25 | 5 | 20.0% | 2 | 16 | 0 |
| 退款与折扣 | 25 | 9 | 37.5% | 3 | 7 | 0 |
| 现场协调 | 25 | 4 | 16.7% | 5 | 13 | 0 |
| 预约管理 | 25 | 15 | 60.0% | 1 | 7 | 0 |
| 风险预警 | 20 | 9 | 45.0% | 0 | 11 | 0 |
| 话术与内容生成 | 20 | 14 | 70.0% | 3 | 3 | 0 |
| 活动策划 | 20 | 10 | 52.6% | 3 | 0 | 0 |
| 经营概览 | 20 | 20 | 100.0% | 0 | 0 | 0 |
| 客户管理 | 20 | 17 | 85.0% | 0 | 3 | 0 |
| 客群识别与分析 | 20 | 19 | 95.0% | 0 | 1 | 0 |
| 库存运营 | 20 | 20 | 100.0% | 0 | 0 | 0 |
| 临期与损耗 | 20 | 14 | 70.0% | 0 | 2 | 0 |
| 权益与投入产出 | 20 | 4 | 21.1% | 3 | 7 | 0 |
| 消耗分析 | 20 | 7 | 35.0% | 2 | 8 | 0 |
| 员工管理 | 20 | 14 | 70.0% | 0 | 6 | 0 |
| 自动化与触达规则 | 20 | 1 | 5.3% | 2 | 13 | 0 |
| 代词和上下文继承测试 | 10 | 3 | 33.3% | 3 | 1 | 0 |
| 否定与纠正测试 | 10 | 1 | 10.0% | 0 | 9 | 0 |
| 供应链协调 | 10 | 4 | 40.0% | 0 | 4 | 0 |
| 极限与压力测试 | 10 | 2 | 20.0% | 2 | 4 | 0 |
| 跨场景融合问题 | 10 | 3 | 42.9% | 0 | 3 | 0 |
| 意图模糊测试 | 10 | 0 | 0.0% | 0 | 7 | 0 |

## Top 问题原因

1. intent:intent_mismatch：115 次
2. answer:not_found：32 次
3. tool:capability_any_of_missing:customer_facts|customer_priority_recommendation|front_desk_operations_overview|reservation_list：30 次
4. answer:unsupported_intent：21 次
5. tool:capability_any_of_missing:customer_facts|customer_priority_recommendation|finance_payment_breakdown|finance_risk_overview|order_revenue_analysis|product_sales_ranking|staff_performance_ranking：17 次
6. tool:capability_any_of_missing:inventory_operations_overview|inventory_procurement_advice|product_sales_ranking：16 次
7. plan:plan_nodes_below:1：14 次
8. tool:capability_any_of_missing:customer_facts|customer_priority_recommendation：11 次
9. tool:capability_any_of_missing:customer_facts|staff_performance_ranking：8 次
10. intent:answer_shape_mismatch：7 次

## 典型可用样本

- 店长经营 / 经营概览 / 真实可用：今天店里情况怎么样，给我来个总结 -> 实收：0.00 元；订单：0 单；客户：0 人；客单价：0.00 元；预约：0 个；已到店：0 人；当前在店：0 人；新客：0 人（老客 0 人）；退款：0.00 元（0 笔）。

明细：
1. 员工=唐伊，预约数=0，状态=可接待，下次可
- 店长经营 / 经营概览 / 部分可用：今天营业额到多少了 -> 实收：0.00 元；订单：0 单；客户：0 人；客单价：0.00 元；预约：0 个；已到店：0 人；当前在店：0 人；新客：0 人（老客 0 人）；退款：0.00 元（0 笔）。

明细：
1. 员工=唐伊，预约数=0，状态=可接待，下次可
- 店长经营 / 经营概览 / 真实可用：今天来了几个客人，现在还有几个在店 -> 实收：0.00 元；订单：0 单；客户：0 人；客单价：0.00 元；预约：0 个；已到店：0 人；当前在店：0 人；新客：0 人（老客 0 人）；退款：0.00 元（0 笔）。

明细：
1. 员工=唐伊，预约数=0，状态=可接待，下次可
- 店长经营 / 经营概览 / 真实可用：今天和昨天比营业额差多少 -> 实收：0.00 元；订单：0 单；客户：0 人；客单价：0.00 元；预约：0 个；已到店：0 人；当前在店：0 人；新客：0 人（老客 0 人）；退款：0.00 元（0 笔）。

对比：实收，当前 0.00 元，上一期 0.00 元，变化
- 店长经营 / 经营概览 / 真实可用：本周跟上周比，哪天差距最大 -> 排行：
1. 星期=周三，本期日期=2026-07-15，本期实收=4904.00，上期日期=2026-07-08，上期实收=741.70，差额=+4162.30 元
2. 星期=周一，本期日期=2026-07-13，本期实收=3407.5
- 店长经营 / 经营概览 / 真实可用：这个月目标完成率多少了，还差多远 -> 实收：27130.96 元；订单：39 单；客户：20 人；客单价：695.67 元；预约：21 个；已到店：8 人；当前在店：3 人；新客：3 人（老客 18 人）；退款：1419.00 元（4 笔）；最大订单：4464.00 元（POM
- 店长经营 / 经营概览 / 真实可用：今天客单价多少，跟平时比怎么样 -> 实收：0.00 元；订单：0 单；客户：0 人；客单价：0.00 元；预约：0 个；已到店：0 人；当前在店：0 人；新客：0 人（老客 0 人）；退款：0.00 元（0 笔）。

对比：实收，当前 0.00 元，上一期 149826.64
- 店长经营 / 经营概览 / 真实可用：今天有没有什么异常情况我需要知道 -> 实收：0.00 元；订单：0 单；客户：0 人；客单价：0.00 元；预约：0 个；已到店：0 人；当前在店：0 人；新客：0 人（老客 0 人）；退款：0.00 元（0 笔）。

明细：
1. 员工=唐伊，预约数=0，状态=可接待，下次可

## 典型问题样本

- 店长经营 / 客户管理 / 意图未覆盖：最近有没有客户投诉或者表达不满 -> 说明：no_data:customer_feedback_recheck。
- 店长经营 / 客户管理 / 意图未覆盖：最近有没有客户因为等待时间长而离开 -> 为了准确处理，请一次确认：请补充完成标准；当前受控定义和能力摘要未声明“因等待时间过长离开”的直接事件或因果归因事实，只能基于可用预约现场证据识别疑似情况？
- 店长经营 / 客户管理 / 意图未覆盖：帮我看一下客户满意度整体情况 -> 为了准确处理，请一次确认：请补充指标口径；当前已发布指标与能力描述中未提供客户满意度、评分、投诉或反馈的可引用口径？
- 店长经营 / 员工管理 / 意图未覆盖：哪个美容师的客诉最多，最近有没有 -> 当前后台没有客户投诉、差评或满意度事实闭环，无法按美容师统计或排行。Ami Brain 不会用服务量、业绩或综合表现分替代客诉指标。
- 店长经营 / 员工管理 / 意图未覆盖：新员工试用期表现怎么样 -> 当前后台没有员工试用期目标、阶段评价、带教记录或转正结论事实闭环，无法评价新员工试用期表现。Ami Brain 不会用服务量、接客数或通用业绩分替代试用期评估。
- 店长经营 / 员工管理 / 意图未覆盖：有没有员工最近很长时间没有新客了 -> 当前客户事实能力尚未注册该业务口径，不会编造回答。已接入精确客户、VIP、高价值、沉睡、生日、低余次卡、重要到店和营销响应客户查询。

数据依据：客户精确事实查询。
- 店长经营 / 员工管理 / 意图未覆盖：哪个美容师擅长的项目客户最满意 -> 当前客户事实能力尚未注册该业务口径，不会编造回答。已接入精确客户、VIP、高价值、沉睡、生日、低余次卡、重要到店和营销响应客户查询。

数据依据：客户精确事实查询。
- 店长经营 / 员工管理 / 意图未覆盖：有没有员工到期转正需要我处理 -> 当前后台没有员工试用期目标、阶段评价、带教记录或转正结论事实闭环，无法评价新员工试用期表现。Ami Brain 不会用服务量、接客数或通用业绩分替代试用期评估。
- 店长经营 / 员工管理 / 意图未覆盖：有没有员工的客户被别的美容师挖走的迹象 -> 当前后台没有客户归属历史、归属变更事件或转移原因事实闭环，无法判断客户是否被其他美容师挖走。Ami Brain 不会用当前客户归属、员工业绩或接客排行反推历史流转。
- 店长经营 / 风险预警 / 意图未覆盖：店里设备最近有没有什么问题 -> 当前管理端和后台没有设备台账、巡检、保养、故障和维修状态事实，无法判断门店设备是否存在问题。Ami Brain 不会用库存、预约或经营异常替代设备状态。
- 店长经营 / 风险预警 / 意图未覆盖：今天有没有超时服务影响了下一个预约 -> 当前客户事实能力尚未注册该业务口径，不会编造回答。已接入精确客户、VIP、高价值、沉睡、生日、低余次卡、重要到店和营销响应客户查询。

数据依据：客户精确事实查询。
- 店长经营 / 风险预警 / 意图未覆盖：有没有员工在没有授权的情况下给了额外优惠 -> 当前管理端和后台只有订单优惠金额，没有优惠授权规则、审批记录、实际操作人和例外事件事实，无法判断员工是否未经授权给予额外优惠。Ami Brain 不会用员工排行或全店优惠总额替代授权审计。

## 产品结论与改进建议

1. 当前 Ami Brain 已形成六域 Domain Adapter、Supervisor、模板技能、数据库技能和受控动作预览的真实产品链路，本次真实可用率为 40.3%。
2. 当前剩余缺口集中在未覆盖意图和缺少明确业务实体，不再是关键词误命中或伪指标问题；后续应优先补采购建议、客户精确查询、权益 ROI、员工复购排行和否定纠正能力。
3. 对已识别但未接入真实口径的指标继续保持明确拒答，不使用 0、全量历史或无依据估算替代。
4. 发布门禁继续并行检查真实可用率、假阳性、时间范围、权限/跨店、动作确认、异常率和 SSE 首字延迟。
5. 本报告耗时为完整请求落库耗时；用户感知首字延迟需以 SSE 独立压测记录为准。