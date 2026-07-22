# Ami Brain 650题真实请求路径评测报告

生成时间：2026/7/20 17:25:12

## 评测范围

- 产品版本：当前工作区最新版 Ami Brain
- 请求路径：BrainChatService.createConversation + BrainChatService.sendMessage
- 问题来源：D:\AI coding\beauty-salon-admin\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\ami-brain-eval-run-2026-07-20-p4-r354-targeted-closure\targeted-paraphrase-cases.json
- 问题数：4
- 实际记录数：4
- 实际对话轮数：4
- 门店：requestedStoreId=6，runtimeStoreId=6
- 权限来源：active_backend_role_catalog_plus_candidate_minimum_permissions
- 已注册评测角色：store_manager
- 冻结发布快照：33a32c3a6f1ab31259808949bbd7d4e8e90cb82397ec517179c0b23c9c79355f / capabilities=appointment_gap_list, beautician_customer_card_progress, beautician_material_preparation, beautician_personal_performance, beautician_service_overview, card_usage_action_preview, customer_facts, customer_feedback_overview, customer_follow_up_draft, customer_priority_recommendation, customer_waiting_loss_overview, finance_material_cost_summary, finance_payment_breakdown, finance_risk_overview, finance_staff_refund_rate_boundary, finance_transaction_anomaly_review, front_desk_operations_overview, gap_fill_touch_preview, inventory_operations_overview, inventory_procurement_advice, inventory_receipt_discrepancy_guidance, inventory_risk_ranking, manager_staff_overview, marketing_automation_rule_preview, marketing_campaign_cost_attribution_review, marketing_campaign_plan, marketing_customer_segment, marketing_growth_overview, marketing_message_draft, marketing_strategy_execute_preview, marketing_touch_draft, order_revenue_analysis, product_sales_ranking, project_margin_analysis, project_material_consumption_analysis, project_service_ranking, reservation_action_preview, reservation_list, staff_performance_ranking, store_operations_overview
- 评分口径：同时输出旧口径和新口径。旧口径为“completed 且有 metric citation”；新口径要求意图、指标口径、回答粒度匹配。
- 六层门禁：意图、工具、计划、执行、完成度、答案均为确定性评分；任一层失败即不计入真实可用。

## 总体结论

Ami Brain 当前已经不再是空入口：每题都会创建会话、写入用户消息、创建运行记录、执行安全检查和认知解析，再由语义问数链路返回回答或明确拒答。

本报告的新口径会把“命中指标但答非所问”的样本归为假阳性。排名题、名单题、对比题、文案题不会再因为带了 metric citation 就被计为真实可用。

## 总览

| 指标 | 数值 |
| --- | ---: |
| 总题数 | 4 |
| 可评测题数 | 3 |
| 模型供应商不可用 | 1 |
| 旧口径可用题数 | 2 |
| 旧口径可用率 | 66.7% |
| 新口径真实可用题数 | 3 |
| 新口径真实可用率 | 100.0% |
| 六层合同通过题数 | 3 |
| 六层合同通过率 | 100.0% |
| 预期能力边界正确返回 | 0 |
| 多轮场景通过数 | 0 / 0 |
| 多轮场景合同通过数 | 0 / 0 |
| 多轮轮次通过数 | 3 / 4 |
| 多轮轮次合同通过数 | 3 / 4 |
| 平均耗时 | 17142 ms |
| P95 耗时 | 20997 ms |
| 最大耗时 | 20997 ms |
| 权限绕过数 | 0 |
| 跨门店读取数 | 0 |
| roleHint 绕过数 | 0 |
| 假动作确认数 | 0 |

## 六层评分

| 层级 | 通过数 | 通过率 | 平均分 |
| --- | ---: | ---: | ---: |
| intent | 3 / 3 | 100.0% | 100.0% |
| tool | 3 / 3 | 100.0% | 100.0% |
| plan | 3 / 3 | 100.0% | 100.0% |
| execution | 3 / 3 | 100.0% | 100.0% |
| completion | 3 / 3 | 100.0% | 100.0% |
| answer | 3 / 3 | 100.0% | 100.0% |

## Grounding 分布

| Grounding 类型 | 数量 |
| --- | ---: |
| Metric Query | 0 |
| DB Skill | 2 |
| Template Skill | 0 |
| Preview Action | 1 |
| None | 0 |

## 执行路径分布

| 执行路径 | 数量 |
| --- | ---: |
| model_primary | 3 |
| model_unavailable | 1 |

## Adapter 分布

| Adapter | 数量 |
| --- | ---: |
| none | 3 |

## Domain 分布

| Domain | 数量 |
| --- | ---: |
| beautician | 2 |
| staff | 2 |
| customer | 1 |
| project | 1 |

## Capability 分布

| Capability | 数量 |
| --- | ---: |
| manager_staff_overview | 2 |
| marketing_automation_rule_preview | 1 |


## 状态分布

| 状态 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 真实可用 | 3 | 3 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 模型供应商不可用 | 1 | 0 | 0.0% | 0 | 0 | 0 | 0 | 1 | 0 |

## 角色分布

| 角色 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 店长经营 | 4 | 3 | 100.0% | 0 | 0 | 0 | 0 | 1 | 0 |

## 分类分布

| 分类 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| ranking | 2 | 2 | 100.0% | 0 | 0 | 0 |
| recommendation | 2 | 1 | 100.0% | 0 | 0 | 0 |

## Top 问题原因

- 无

## 典型可用样本

- 店长经营 / ranking / 真实可用：本月美容师业绩实收谁排第一 -> 排行：
1. 员工=宋乔，业绩实收=9334.32

数据依据：业务定义：员工关联业绩实收；员工服务、客户、业绩与提成分析；员工排班忙闲与可用空档。
- 店长经营 / ranking / 真实可用：按这个月关联实收给美容师排个名 -> 排行：
1. 员工=宋乔，业绩实收=9334.32
2. 员工=顾然，业绩实收=7700.88
3. 员工=沈晴，业绩实收=5286.33
4. 员工=唐伊，业绩实收=4865.43

数据依据：业务定义：员工关联业绩实收；员工服务、客户、
- 店长经营 / recommendation / 真实可用：客户做完项目后，系统怎么自动推荐下次适合做的项目 -> 营销自动化规则预览：客户生命周期自动跟进。触发条件：满足已配置且可审计的客户行为条件；建议动作：创建跟进或推荐任务草稿；保护条件：不自动群发、不自动改权益、不跨门店触达。当前只生成可审阅规则预览，不发布自动化规则、不发送消息、不修改会员等级

## 典型问题样本

- 店长经营 / recommendation / 模型供应商不可用：设计一个消费完成后推荐下一护理项目的自动规则预览 -> 当前无法理解该问题，请换一种清晰表述后重试。

## 产品结论与改进建议

1. 当前 Ami Brain 已形成六域 Domain Adapter、Supervisor、模板技能、数据库技能和受控动作预览的真实产品链路，本次真实可用率为 100.0%。
2. 当前剩余缺口集中在未覆盖意图和缺少明确业务实体，不再是关键词误命中或伪指标问题；后续应优先补采购建议、客户精确查询、权益 ROI、员工复购排行和否定纠正能力。
3. 对已识别但未接入真实口径的指标继续保持明确拒答，不使用 0、全量历史或无依据估算替代。
4. 发布门禁继续并行检查真实可用率、假阳性、时间范围、权限/跨店、动作确认、异常率和 SSE 首字延迟。
5. 本报告耗时为完整请求落库耗时；用户感知首字延迟需以 SSE 独立压测记录为准。