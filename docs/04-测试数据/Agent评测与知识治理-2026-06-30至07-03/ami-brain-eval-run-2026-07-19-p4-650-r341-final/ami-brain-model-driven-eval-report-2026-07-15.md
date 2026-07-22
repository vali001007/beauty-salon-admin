# Ami Brain 650题真实请求路径评测报告

生成时间：2026/7/19 23:39:27

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
- 冻结发布快照：3b3475ce9320f5871df1494a99652aa06683cece2711410f8d0b040f9e2fcb7e / capabilities=appointment_gap_list, beautician_customer_card_progress, beautician_material_preparation, beautician_personal_performance, beautician_service_overview, card_usage_action_preview, customer_facts, customer_follow_up_draft, customer_priority_recommendation, finance_material_cost_summary, finance_payment_breakdown, finance_risk_overview, finance_staff_refund_rate_boundary, finance_transaction_anomaly_review, front_desk_operations_overview, gap_fill_touch_preview, inventory_operations_overview, inventory_procurement_advice, inventory_receipt_discrepancy_guidance, inventory_risk_ranking, manager_staff_overview, marketing_campaign_cost_attribution_review, marketing_campaign_plan, marketing_customer_segment, marketing_growth_overview, marketing_message_draft, marketing_strategy_execute_preview, marketing_touch_draft, order_revenue_analysis, product_sales_ranking, project_margin_analysis, project_material_consumption_analysis, project_service_ranking, reservation_action_preview, reservation_list, staff_performance_ranking, store_operations_overview
- 评分口径：同时输出旧口径和新口径。旧口径为“completed 且有 metric citation”；新口径要求意图、指标口径、回答粒度匹配。
- 六层门禁：意图、工具、计划、执行、完成度、答案均为确定性评分；任一层失败即不计入真实可用。

## 总体结论

Ami Brain 当前已经不再是空入口：每题都会创建会话、写入用户消息、创建运行记录、执行安全检查和认知解析，再由语义问数链路返回回答或明确拒答。

本报告的新口径会把“命中指标但答非所问”的样本归为假阳性。排名题、名单题、对比题、文案题不会再因为带了 metric citation 就被计为真实可用。

## 总览

| 指标 | 数值 |
| --- | ---: |
| 总题数 | 650 |
| 可评测题数 | 627 |
| 模型供应商不可用 | 23 |
| 旧口径可用题数 | 54 |
| 旧口径可用率 | 8.6% |
| 新口径真实可用题数 | 378 |
| 新口径真实可用率 | 60.3% |
| 六层合同通过题数 | 378 |
| 六层合同通过率 | 60.3% |
| 预期能力边界正确返回 | 64 |
| 多轮场景通过数 | 0 / 0 |
| 多轮场景合同通过数 | 0 / 0 |
| 多轮轮次通过数 | 378 / 650 |
| 多轮轮次合同通过数 | 378 / 650 |
| 平均耗时 | 19371 ms |
| P95 耗时 | 35081 ms |
| 最大耗时 | 56621 ms |
| 权限绕过数 | 0 |
| 跨门店读取数 | 0 |
| roleHint 绕过数 | 0 |
| 假动作确认数 | 0 |

## 六层评分

| 层级 | 通过数 | 通过率 | 平均分 |
| --- | ---: | ---: | ---: |
| intent | 516 / 627 | 82.3% | 83.5% |
| tool | 449 / 627 | 71.6% | 71.6% |
| plan | 413 / 627 | 65.9% | 88.5% |
| execution | 552 / 627 | 88.0% | 88.0% |
| completion | 393 / 627 | 62.7% | 64.3% |
| answer | 393 / 627 | 62.7% | 56.2% |

## Grounding 分布

| Grounding 类型 | 数量 |
| --- | ---: |
| Metric Query | 4 |
| DB Skill | 297 |
| Template Skill | 33 |
| Preview Action | 0 |
| None | 293 |

## 执行路径分布

| 执行路径 | 数量 |
| --- | ---: |
| model_primary | 507 |
| exact_contract_fast_path | 127 |
| model_unavailable | 16 |

## Adapter 分布

| Adapter | 数量 |
| --- | ---: |
| none | 627 |

## Domain 分布

| Domain | 数量 |
| --- | ---: |
| customer | 272 |
| project | 177 |
| product | 172 |
| reservation | 135 |
| beautician | 115 |
| finance | 93 |
| payment | 85 |
| none | 67 |
| order | 61 |
| payment_record | 48 |
| product_order | 43 |
| refund | 42 |
| operating_cost | 31 |
| staff | 29 |
| marketing | 6 |
| order_item | 1 |

## Capability 分布

| Capability | 数量 |
| --- | ---: |
| none | 224 |
| inventory_operations_overview | 61 |
| finance_risk_overview | 57 |
| customer_facts | 50 |
| beautician_service_overview | 39 |
| marketing_campaign_plan | 32 |
| front_desk_operations_overview | 20 |
| finance_payment_breakdown | 19 |
| manager_staff_overview | 16 |
| marketing_message_draft | 16 |
| store_operations_overview | 15 |
| reservation_list | 14 |
| inventory_procurement_advice | 10 |
| marketing_customer_segment | 8 |
| project_margin_analysis | 7 |
| project_material_consumption_analysis | 6 |
| appointment_gap_list | 5 |
| customer_priority_recommendation | 5 |
| finance_transaction_anomaly_review | 5 |
| marketing_growth_overview | 4 |
| beautician_customer_card_progress | 3 |
| beautician_personal_performance | 3 |
| inventory_risk_ranking | 3 |
| order_revenue_analysis | 3 |
| card_usage_action_preview | 2 |
| finance_staff_refund_rate_boundary | 2 |
| gap_fill_touch_preview | 2 |
| marketing_campaign_cost_attribution_review | 2 |
| marketing_strategy_execute_preview | 2 |
| project_service_ranking | 2 |

## 与 2026-07-10 基线对比

基线文件：D:\AI coding\beauty-salon-admin\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\ami-brain-eval-run-2026-07-10\ami-brain-eval-results-2026-07-10.json

| 指标 | 2026-07-10 基线 | 本次修复后 |
| --- | ---: | ---: |
| 旧口径可用率 | 15.5% | 8.6% |
| 真实可用率 | 2.6% | 58.2% |
| 假阳性数 | 84 | 6 |
| 时间误退化全量数 | 12 | 0 |
| 文案/操作误命中指标数 | 21 | 1 |

## 状态分布

| 状态 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 真实可用 | 218 | 218 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 意图未覆盖 | 172 | 0 | 0.0% | 0 | 172 | 0 | 0 | 0 | 0 |
| 部分可用 | 160 | 160 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 指标查询失败 | 71 | 0 | 0.0% | 71 | 0 | 0 | 0 | 0 | 0 |
| 模型供应商不可用 | 23 | 0 | 0.0% | 0 | 0 | 0 | 0 | 23 | 0 |
| 假阳性-意图错配 | 4 | 0 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 假阳性-粒度错配 | 1 | 0 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 假阳性-指标错配 | 1 | 0 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 |

## 角色分布

| 角色 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 美容师服务 | 100 | 48 | 48.5% | 13 | 36 | 0 | 0 | 1 | 0 |
| 财务风控 | 100 | 63 | 64.9% | 6 | 27 | 0 | 0 | 3 | 0 |
| 库存采购 | 100 | 67 | 68.4% | 6 | 25 | 0 | 0 | 2 | 0 |
| 店长经营 | 100 | 73 | 75.3% | 10 | 13 | 0 | 0 | 3 | 0 |
| 营销增长 | 100 | 61 | 63.5% | 21 | 14 | 0 | 0 | 4 | 0 |
| 前台接待 | 100 | 40 | 41.7% | 12 | 44 | 0 | 0 | 4 | 0 |
| 边界/多轮 | 50 | 26 | 59.1% | 3 | 13 | 0 | 0 | 6 | 0 |

## 分类分布

| 分类 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 财务风险与合规 | 25 | 18 | 72.0% | 0 | 6 | 0 |
| 采购建议 | 25 | 13 | 54.2% | 3 | 8 | 0 |
| 成本与毛利 | 25 | 11 | 47.8% | 3 | 9 | 0 |
| 服务记录与跟进 | 25 | 6 | 24.0% | 4 | 15 | 0 |
| 个人业绩 | 25 | 9 | 37.5% | 3 | 12 | 0 |
| 今日服务安排 | 25 | 22 | 88.0% | 2 | 0 | 0 |
| 客户查询 | 25 | 5 | 20.0% | 1 | 19 | 0 |
| 客户护理建议 | 25 | 11 | 44.0% | 4 | 9 | 0 |
| 库存查询与风险 | 25 | 19 | 76.0% | 1 | 5 | 0 |
| 收入与对账 | 25 | 17 | 68.0% | 3 | 5 | 0 |
| 收银与核销 | 25 | 7 | 30.4% | 2 | 14 | 0 |
| 退款与折扣 | 25 | 17 | 70.8% | 0 | 7 | 0 |
| 现场协调 | 25 | 10 | 43.5% | 6 | 7 | 0 |
| 预约管理 | 25 | 18 | 72.0% | 3 | 4 | 0 |
| 风险预警 | 20 | 14 | 70.0% | 1 | 5 | 0 |
| 话术与内容生成 | 20 | 18 | 90.0% | 2 | 0 | 0 |
| 活动策划 | 20 | 19 | 95.0% | 1 | 0 | 0 |
| 经营概览 | 20 | 18 | 90.0% | 2 | 0 | 0 |
| 客户管理 | 20 | 13 | 65.0% | 4 | 3 | 0 |
| 客群识别与分析 | 20 | 8 | 40.0% | 11 | 1 | 0 |
| 库存运营 | 20 | 18 | 94.7% | 1 | 0 | 0 |
| 临期与损耗 | 20 | 18 | 90.0% | 1 | 1 | 0 |
| 权益与投入产出 | 20 | 6 | 35.3% | 3 | 8 | 0 |
| 消耗分析 | 20 | 11 | 55.0% | 1 | 8 | 0 |
| 员工管理 | 20 | 10 | 55.6% | 2 | 5 | 0 |
| 自动化与触达规则 | 20 | 10 | 52.6% | 4 | 5 | 0 |
| 代词和上下文继承测试 | 10 | 6 | 85.7% | 1 | 0 | 0 |
| 否定与纠正测试 | 10 | 3 | 30.0% | 0 | 7 | 0 |
| 供应链协调 | 10 | 6 | 66.7% | 0 | 3 | 0 |
| 极限与压力测试 | 10 | 3 | 37.5% | 0 | 4 | 0 |
| 跨场景融合问题 | 10 | 4 | 44.4% | 2 | 2 | 0 |
| 意图模糊测试 | 10 | 10 | 100.0% | 0 | 0 | 0 |

## Top 问题原因

1. intent:intent_mismatch：102 次
2. tool:capability_any_of_missing:customer_facts|customer_priority_recommendation|front_desk_operations_overview|reservation_list：27 次
3. tool:capability_any_of_missing:inventory_operations_overview|inventory_procurement_advice|inventory_risk_ranking|product_sales_ranking|project_material_consumption_analysis：19 次
4. plan:plan_nodes_below:1：9 次
5. tool:capability_any_of_missing:beautician_personal_performance|beautician_service_overview|customer_facts|staff_performance_ranking：7 次
6. execution:execution_status:no_data：4 次
7. tool:capability_any_of_missing:beautician_customer_card_progress|beautician_personal_performance|beautician_service_overview|customer_facts|customer_priority_recommendation|staff_performance_ranking：4 次
8. tool:capability_any_of_missing:beautician_customer_card_progress|beautician_service_overview|customer_facts|customer_priority_recommendation：4 次
9. tool:capability_any_of_missing:beautician_customer_card_progress|beautician_service_overview|customer_priority_recommendation：4 次
10. tool:capability_any_of_missing:customer_facts|customer_priority_recommendation|finance_material_cost_summary|finance_payment_breakdown|finance_risk_overview|finance_staff_refund_rate_boundary|finance_transaction_anomaly_review|inventory_risk_ranking|order_revenue_analysis|product_sales_ranking|project_margin_analysis|staff_performance_ranking：4 次

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
- 店长经营 / 经营概览 / 真实可用：这个月目标完成率多少了，还差多远 -> 实收：27130.96 元；订单：39 单；客户：20 人；客单价：695.67 元；预约：21 个；已到店：8 人；当前在店：3 人；新客：3 人（老客 18 人）；退款：1419.00 元（4 笔）；最大订单：4464.00 元（POM
- 店长经营 / 经营概览 / 真实可用：今天客单价多少，跟平时比怎么样 -> 实收：0.00 元；订单：0 单；客户：0 人；客单价：0.00 元；预约：0 个；已到店：0 人；当前在店：0 人；新客：0 人（老客 0 人）；退款：0.00 元（0 笔）。

对比：实收，当前 0.00 元，上一期 149826.64
- 店长经营 / 经营概览 / 真实可用：今天有没有什么异常情况我需要知道 -> 实收：0.00 元；订单：0 单；客户：0 人；客单价：0.00 元；预约：0 个；已到店：0 人；当前在店：0 人；新客：0 人（老客 0 人）；退款：0.00 元（0 笔）。

明细：
1. 员工=唐伊，预约数=0，状态=可接待，下次可
- 店长经营 / 经营概览 / 部分可用：现在店里哪些美容师在忙，哪些空着 -> 现在到今天结束没有找到匹配的预约记录。

明细：当前没有匹配数据。

说明：当前时间范围没有匹配的明细数据。

数据依据：预约到店与员工忙闲快照；服务超时影响分析；门店预约排期。

## 典型问题样本

- 店长经营 / 经营概览 / 指标查询失败：本周跟上周比，哪天差距最大 -> 当前无法完成查询，请稍后重试。
- 店长经营 / 经营概览 / 指标查询失败：今天最大的一笔消费是多少 -> 当前无法完成查询，请稍后重试。
- 店长经营 / 客户管理 / 指标查询失败：哪些客户卡里的次数快用完了还没约 -> 当前无法完成查询，请稍后重试。
- 店长经营 / 客户管理 / 意图未覆盖：最近有没有客户投诉或者表达不满 -> 说明：no_data:customer_feedback_check。
- 店长经营 / 客户管理 / 指标查询失败：哪些客户是高价值但最近不太活跃的 -> 当前无法完成查询，请稍后重试。
- 店长经营 / 客户管理 / 指标查询失败：有没有哪些客户快到生日了可以做关怀 -> 当前无法完成查询，请稍后重试。
- 店长经营 / 客户管理 / 意图未覆盖：最近有没有客户因为等待时间长而离开 -> 为了准确处理，请一次确认：请补充完成标准；“因为等待时间长而离开”需要同时具备可识别的等待时长与离开或放弃服务事实；当前受控上下文未声明该因果归因规则。（预约现场超时或延迟事实、客户离开、取消或放弃服务事实、等待导致离开的已发布归因规则）？
- 店长经营 / 客户管理 / 意图未覆盖：帮我看一下客户满意度整体情况 -> 说明：no_data:satisfaction_feedback_coverage。
- 店长经营 / 客户管理 / 指标查询失败：老客户平均多久回来一次 -> 当前无法完成查询，请稍后重试。
- 店长经营 / 员工管理 / 假阳性-意图错配：这个月谁的业绩最好 -> 排行：
1. 员工=宋乔，员工表现评分=55.00000000000001，服务次数=5，服务客户数=5，复购客户数=0，业绩实收=9334.32，提成金额=604.81，请假时长=0
2. 员工=顾然，员工表现评分=50，服务次数=4，服
- 店长经营 / 员工管理 / 意图未覆盖：哪个美容师的客诉最多，最近有没有 -> 当前后台没有客户投诉、差评或满意度事实闭环，无法按美容师统计或排行。Ami Brain 不会用服务量、业绩或综合表现分替代客诉指标。
- 店长经营 / 员工管理 / 意图未覆盖：新员工试用期表现怎么样 -> 当前后台没有员工试用期目标、阶段评价、带教记录或转正结论事实闭环，无法评价新员工试用期表现。Ami Brain 不会用服务量、接客数或通用业绩分替代试用期评估。

## 产品结论与改进建议

1. 当前 Ami Brain 已形成六域 Domain Adapter、Supervisor、模板技能、数据库技能和受控动作预览的真实产品链路，本次真实可用率为 60.3%。
2. 当前剩余缺口集中在未覆盖意图和缺少明确业务实体，不再是关键词误命中或伪指标问题；后续应优先补采购建议、客户精确查询、权益 ROI、员工复购排行和否定纠正能力。
3. 对已识别但未接入真实口径的指标继续保持明确拒答，不使用 0、全量历史或无依据估算替代。
4. 发布门禁继续并行检查真实可用率、假阳性、时间范围、权限/跨店、动作确认、异常率和 SSE 首字延迟。
5. 本报告耗时为完整请求落库耗时；用户感知首字延迟需以 SSE 独立压测记录为准。