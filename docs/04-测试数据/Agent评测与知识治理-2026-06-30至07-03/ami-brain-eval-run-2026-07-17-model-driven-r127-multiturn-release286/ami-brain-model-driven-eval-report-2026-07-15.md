# Ami Brain 650题真实请求路径评测报告

生成时间：2026/7/17 12:56:06

## 评测范围

- 产品版本：当前工作区最新版 Ami Brain
- 请求路径：BrainChatService.createConversation + BrainChatService.sendMessage
- 问题来源：D:\AI coding\beauty-salon-admin\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\ami-brain-model-driven-multiturn-cases.json
- 问题数：5
- 实际记录数：5
- 实际对话轮数：10
- 门店：requestedStoreId=6，runtimeStoreId=6
- 权限来源：active_backend_role_catalog_plus_candidate_minimum_permissions
- 已注册评测角色：finance, receptionist, store_manager
- 冻结发布快照：869ffa31f2f101198e90eb771830b39deb95800b43aab7863a29c4f9ad7ff405 / capabilities=beautician_service_overview, customer_facts, customer_follow_up_draft, finance_payment_breakdown, finance_risk_overview, front_desk_operations_overview, gap_fill_touch_preview, inventory_operations_overview, inventory_procurement_advice, manager_staff_overview, marketing_customer_segment, marketing_growth_overview, marketing_message_draft, marketing_touch_draft, product_sales_ranking, project_service_ranking, reservation_action_preview, reservation_list, store_operations_overview
- 评分口径：同时输出旧口径和新口径。旧口径为“completed 且有 metric citation”；新口径要求意图、指标口径、回答粒度匹配。
- 六层门禁：意图、工具、计划、执行、完成度、答案均为确定性评分；任一层失败即不计入真实可用。

## 总体结论

Ami Brain 当前已经不再是空入口：每题都会创建会话、写入用户消息、创建运行记录、执行安全检查和认知解析，再由语义问数链路返回回答或明确拒答。

本报告的新口径会把“命中指标但答非所问”的样本归为假阳性。排名题、名单题、对比题、文案题不会再因为带了 metric citation 就被计为真实可用。

## 总览

| 指标 | 数值 |
| --- | ---: |
| 总题数 | 5 |
| 可评测题数 | 5 |
| 模型供应商不可用 | 0 |
| 旧口径可用题数 | 3 |
| 旧口径可用率 | 60.0% |
| 新口径真实可用题数 | 0 |
| 新口径真实可用率 | 0.0% |
| 多轮场景通过数 | 0 / 5 |
| 多轮轮次通过数 | 3 / 10 |
| 平均耗时 | 22111 ms |
| P95 耗时 | 27956 ms |
| 最大耗时 | 27956 ms |
| 权限绕过数 | 0 |
| 跨门店读取数 | 0 |
| roleHint 绕过数 | 0 |
| 假动作确认数 | 0 |

## 六层评分

| 层级 | 通过数 | 通过率 | 平均分 |
| --- | ---: | ---: | ---: |
| intent | 5 / 10 | 50.0% | 64.3% |
| tool | 6 / 10 | 60.0% | 60.0% |
| plan | 9 / 10 | 90.0% | 95.0% |
| execution | 8 / 10 | 80.0% | 80.0% |
| completion | 5 / 10 | 50.0% | 50.0% |
| answer | 6 / 10 | 60.0% | 60.0% |

## Grounding 分布

| Grounding 类型 | 数量 |
| --- | ---: |
| Metric Query | 1 |
| DB Skill | 3 |
| Template Skill | 0 |
| Preview Action | 0 |
| None | 1 |

## 执行路径分布

| 执行路径 | 数量 |
| --- | ---: |
| model_primary | 5 |

## Adapter 分布

| Adapter | 数量 |
| --- | ---: |
| none | 5 |

## Domain 分布

| Domain | 数量 |
| --- | ---: |
| customer | 2 |
| finance | 2 |
| order | 1 |
| payment | 1 |
| payment_record | 1 |
| product | 1 |
| refund | 1 |

## Capability 分布

| Capability | 数量 |
| --- | ---: |
| customer_facts | 1 |
| finance_payment_breakdown | 1 |
| finance_risk_overview | 1 |
| none | 1 |
| product_sales_ranking | 1 |


## 状态分布

| 状态 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 假阳性-意图错配 | 4 | 0 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 指标查询失败 | 1 | 0 | 0.0% | 1 | 0 | 0 | 0 | 0 | 0 |

## 角色分布

| 角色 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 财务风控 | 2 | 0 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 前台接待 | 2 | 0 | 0.0% | 1 | 0 | 0 | 0 | 0 | 0 |
| 店长经营 | 1 | 0 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 |

## 分类分布

| 分类 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| abandon-clarification-objective | 1 | 0 | 0.0% | 0 | 0 | 0 |
| correct-metric-objective | 1 | 0 | 0.0% | 0 | 0 | 0 |
| fill-action-target | 1 | 0 | 0.0% | 1 | 0 | 0 |
| fill-comparison-period | 1 | 0 | 0.0% | 0 | 0 | 0 |
| fill-customer-reference | 1 | 0 | 0.0% | 0 | 0 | 0 |

## Top 问题原因

1. ask-comparison:intent:missing_slot_missing:comparisonTarget：1 次
2. ask:intent:answer_shape_mismatch：1 次
3. ask:intent:intent_mismatch：1 次
4. ask:intent:missing_slot_missing:comparisonTarget：1 次
5. correct-refund:answer:false_positive_intent_mismatch：1 次

## 典型可用样本

- 本次没有可用样本。

## 典型问题样本

- 财务风控 / fill-comparison-period / 假阳性-意图错配：把本月实收跟另一个周期比较 -> 上个月 -> 对比：实收金额，当前 本月 28756.30 元，上一期 上月 127761.01 元，变化 -99004.71 元（-77.5%）。

数据依据：财务支付方式拆分；业务定义：实收金额。
- 前台接待 / fill-customer-reference / 假阳性-意图错配：查一下这个客户最近消费和卡项情况 -> 客户叫胡静怡 -> 当前客户事实能力尚未注册该业务口径，不会编造回答。已接入精确客户、VIP、高价值、沉睡、生日、低余次卡、重要到店和营销响应客户查询。

数据依据：客户精确事实查询。
- 前台接待 / fill-action-target / 指标查询失败：生成一个客户跟进预览，先不要执行 -> 目标客户是胡静怡，提醒她回来做护理 -> 未找到可执行的已发布能力，请补充业务对象、指标或时间范围。
- 财务风控 / correct-metric-objective / 假阳性-意图错配：本月实收是多少 -> 不是实收，改看本月退款金额 -> 退款金额：1419.00 元。

数据依据：业务定义：退款金额；退款、优惠与毛利风险。
- 店长经营 / abandon-clarification-objective / 假阳性-意图错配：把本月实收跟另一个周期比较 -> 算了，改看本月商品销售排行 -> 排行：
1. 商品=抗衰紧致眼霜，销量=18
2. 商品=烟酰胺亮肤精华，销量=11
3. 商品=氨基酸洁面乳，销量=11
4. 商品=玻尿酸保湿精华，销量=3
5. 商品=水氧护理耗材包，销量=1
6. 商品=舒缓修护面膜，销量=1
7.

## 产品结论与改进建议

1. 当前 Ami Brain 已形成六域 Domain Adapter、Supervisor、模板技能、数据库技能和受控动作预览的真实产品链路，本次真实可用率为 0.0%。
2. 当前剩余缺口集中在未覆盖意图和缺少明确业务实体，不再是关键词误命中或伪指标问题；后续应优先补采购建议、客户精确查询、权益 ROI、员工复购排行和否定纠正能力。
3. 对已识别但未接入真实口径的指标继续保持明确拒答，不使用 0、全量历史或无依据估算替代。
4. 发布门禁继续并行检查真实可用率、假阳性、时间范围、权限/跨店、动作确认、异常率和 SSE 首字延迟。
5. 本报告耗时为完整请求落库耗时；用户感知首字延迟需以 SSE 独立压测记录为准。