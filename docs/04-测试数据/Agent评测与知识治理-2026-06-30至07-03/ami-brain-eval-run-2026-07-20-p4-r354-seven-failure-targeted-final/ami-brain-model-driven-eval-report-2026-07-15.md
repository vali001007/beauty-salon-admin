# Ami Brain 650题真实请求路径评测报告

生成时间：2026/7/20 17:27:45

## 评测范围

- 产品版本：当前工作区最新版 Ami Brain
- 请求路径：BrainChatService.createConversation + BrainChatService.sendMessage
- 问题来源：D:\AI coding\beauty-salon-admin\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\agent-eval-questions.md
- 问题数：7
- 实际记录数：7
- 实际对话轮数：7
- 门店：requestedStoreId=6，runtimeStoreId=6
- 权限来源：active_backend_role_catalog_plus_candidate_minimum_permissions
- 已注册评测角色：beautician, inventory, marketing, store_manager
- 冻结发布快照：33a32c3a6f1ab31259808949bbd7d4e8e90cb82397ec517179c0b23c9c79355f / capabilities=appointment_gap_list, beautician_customer_card_progress, beautician_material_preparation, beautician_personal_performance, beautician_service_overview, card_usage_action_preview, customer_facts, customer_feedback_overview, customer_follow_up_draft, customer_priority_recommendation, customer_waiting_loss_overview, finance_material_cost_summary, finance_payment_breakdown, finance_risk_overview, finance_staff_refund_rate_boundary, finance_transaction_anomaly_review, front_desk_operations_overview, gap_fill_touch_preview, inventory_operations_overview, inventory_procurement_advice, inventory_receipt_discrepancy_guidance, inventory_risk_ranking, manager_staff_overview, marketing_automation_rule_preview, marketing_campaign_cost_attribution_review, marketing_campaign_plan, marketing_customer_segment, marketing_growth_overview, marketing_message_draft, marketing_strategy_execute_preview, marketing_touch_draft, order_revenue_analysis, product_sales_ranking, project_margin_analysis, project_material_consumption_analysis, project_service_ranking, reservation_action_preview, reservation_list, staff_performance_ranking, store_operations_overview
- 评分口径：同时输出旧口径和新口径。旧口径为“completed 且有 metric citation”；新口径要求意图、指标口径、回答粒度匹配。
- 六层门禁：意图、工具、计划、执行、完成度、答案均为确定性评分；任一层失败即不计入真实可用。

## 总体结论

Ami Brain 当前已经不再是空入口：每题都会创建会话、写入用户消息、创建运行记录、执行安全检查和认知解析，再由语义问数链路返回回答或明确拒答。

本报告的新口径会把“命中指标但答非所问”的样本归为假阳性。排名题、名单题、对比题、文案题不会再因为带了 metric citation 就被计为真实可用。

## 总览

| 指标 | 数值 |
| --- | ---: |
| 总题数 | 7 |
| 可评测题数 | 7 |
| 模型供应商不可用 | 0 |
| 旧口径可用题数 | 2 |
| 旧口径可用率 | 28.6% |
| 新口径真实可用题数 | 7 |
| 新口径真实可用率 | 100.0% |
| 六层合同通过题数 | 7 |
| 六层合同通过率 | 100.0% |
| 预期能力边界正确返回 | 1 |
| 多轮场景通过数 | 0 / 0 |
| 多轮场景合同通过数 | 0 / 0 |
| 多轮轮次通过数 | 7 / 7 |
| 多轮轮次合同通过数 | 7 / 7 |
| 平均耗时 | 8150 ms |
| P95 耗时 | 21130 ms |
| 最大耗时 | 21130 ms |
| 权限绕过数 | 0 |
| 跨门店读取数 | 0 |
| roleHint 绕过数 | 0 |
| 假动作确认数 | 0 |

## 六层评分

| 层级 | 通过数 | 通过率 | 平均分 |
| --- | ---: | ---: | ---: |
| intent | 7 / 7 | 100.0% | 100.0% |
| tool | 7 / 7 | 100.0% | 100.0% |
| plan | 7 / 7 | 100.0% | 100.0% |
| execution | 7 / 7 | 100.0% | 100.0% |
| completion | 7 / 7 | 100.0% | 100.0% |
| answer | 7 / 7 | 100.0% | 89.3% |

## Grounding 分布

| Grounding 类型 | 数量 |
| --- | ---: |
| Metric Query | 0 |
| DB Skill | 4 |
| Template Skill | 0 |
| Preview Action | 1 |
| None | 2 |

## 执行路径分布

| 执行路径 | 数量 |
| --- | ---: |
| exact_contract_fast_path | 5 |
| model_primary | 2 |

## Adapter 分布

| Adapter | 数量 |
| --- | ---: |
| none | 7 |

## Domain 分布

| Domain | 数量 |
| --- | ---: |
| customer | 5 |
| beautician | 4 |
| reservation | 3 |
| project | 2 |
| staff | 2 |
| customer_service_feedback | 1 |
| finance | 1 |
| none | 1 |
| order | 1 |
| payment | 1 |
| product | 1 |

## Capability 分布

| Capability | 数量 |
| --- | ---: |
| none | 2 |
| beautician_service_overview | 1 |
| customer_feedback_overview | 1 |
| manager_staff_overview | 1 |
| marketing_automation_rule_preview | 1 |
| store_operations_overview | 1 |


## 状态分布

| 状态 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 真实可用 | 4 | 4 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 部分可用 | 3 | 3 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |

## 角色分布

| 角色 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 店长经营 | 3 | 3 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 美容师服务 | 1 | 1 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 边界/多轮 | 1 | 1 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 库存采购 | 1 | 1 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 营销增长 | 1 | 1 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |

## 分类分布

| 分类 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 员工管理 | 2 | 2 | 100.0% | 0 | 0 | 0 |
| 个人业绩 | 1 | 1 | 100.0% | 0 | 0 | 0 |
| 供应链协调 | 1 | 1 | 100.0% | 0 | 0 | 0 |
| 经营概览 | 1 | 1 | 100.0% | 0 | 0 | 0 |
| 意图模糊测试 | 1 | 1 | 100.0% | 0 | 0 | 0 |
| 自动化与触达规则 | 1 | 1 | 100.0% | 0 | 0 | 0 |

## Top 问题原因

- 无

## 典型可用样本

- 店长经营 / 经营概览 / 真实可用：今天客单价多少，跟平时比怎么样 -> 今天客单价：0.00 元。

对比：客单价，当前 0.00 元，上一期 780.35 元，变化 -780.35 元。

数据依据：业务定义：平均客单价；经营收入、客户、项目与员工分析。
- 店长经营 / 员工管理 / 真实可用：这个月谁的业绩最好 -> 排行：
1. 员工=宋乔，业绩实收=9334.32
2. 员工=顾然，业绩实收=7700.88
3. 员工=沈晴，业绩实收=5286.33
4. 员工=唐伊，业绩实收=4865.43

数据依据：业务定义：员工关联业绩实收；员工服务、客户、
- 店长经营 / 员工管理 / 部分可用：哪个美容师的客诉最多，最近有没有 -> 排行：当前时间范围没有可排行的数据。

未完成范围：当前时间范围没有可排行的数据；当前评价采集覆盖率 0.0%（0/10 个已完成服务），未记录不代表客户没有不满。

数据依据：客户投诉与满意度统一事实；美容师客户反馈聚合。
- 营销增长 / 自动化与触达规则 / 真实可用：能不能在客户消费后自动给她推荐下一个适合的项目 -> 营销自动化规则预览：消费完成后下一项目推荐。触发条件：客户完成有效服务或消费结算后；建议动作：结合已购项目、服务记录和当前可售项目创建下一项目推荐任务及可编辑话术草稿；保护条件：先校验客户身份、过敏与禁忌、当前护理方案、项目状态和触达冷却；
- 美容师服务 / 个人业绩 / 部分可用：有没有哪个客户最近好久没来了，我应该联系一下 -> 本人可联系的久未到店客户：0 人（60 天阈值）。

明细：当前没有匹配数据。

未完成范围：当前时间范围没有匹配的明细数据；不会返回其他美容师独占或本人从未服务过的全店客户名单。

数据依据：当前登录美容师历史服务与客户最近到店事实。
- 库存采购 / 供应链协调 / 部分可用：和供应商发生了纠纷，怎么记录和处理 -> 当前采购后台没有供应商纠纷、责任认定、证据附件、索赔处理和关闭结果的统一业务合同；收货数量或金额差异不能替代供应商纠纷记录。 Ami Brain 不会用相近指标、概览数据或推测结果替代。
- 边界/多轮 / 意图模糊测试 / 真实可用：有什么问题吗 -> 为了准确处理，请补充要检查的业务范围：门店经营、财务、库存、预约现场、客户经营或员工运营。

## 典型问题样本

- 无

## 产品结论与改进建议

1. 当前 Ami Brain 已形成六域 Domain Adapter、Supervisor、模板技能、数据库技能和受控动作预览的真实产品链路，本次真实可用率为 100.0%。
2. 当前剩余缺口集中在未覆盖意图和缺少明确业务实体，不再是关键词误命中或伪指标问题；后续应优先补采购建议、客户精确查询、权益 ROI、员工复购排行和否定纠正能力。
3. 对已识别但未接入真实口径的指标继续保持明确拒答，不使用 0、全量历史或无依据估算替代。
4. 发布门禁继续并行检查真实可用率、假阳性、时间范围、权限/跨店、动作确认、异常率和 SSE 首字延迟。
5. 本报告耗时为完整请求落库耗时；用户感知首字延迟需以 SSE 独立压测记录为准。