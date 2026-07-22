# Ami Brain 650题真实请求路径评测报告

生成时间：2026/7/21 11:03:41

## 评测范围

- 产品版本：当前工作区最新版 Ami Brain
- 请求路径：BrainChatService.createConversation + BrainChatService.sendMessage
- 问题来源：D:\AI coding\beauty-salon-admin-ami-brain-p1\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\ami-brain-p1-service-record-2026-07-21\ami-brain-p1-service-record-cases-2026-07-21.json
- 问题数：5
- 实际记录数：5
- 实际对话轮数：5
- 门店：requestedStoreId=6，runtimeStoreId=6
- 权限来源：active_backend_role_catalog_plus_candidate_minimum_permissions
- 已注册评测角色：beautician
- 冻结发布快照：7d92c5f5a5fa53f2500879d4a0f06c3708c61594ac4d780c7385a559e7d7b66e / capabilities=appointment_gap_list, beautician_customer_card_progress, beautician_material_preparation, beautician_personal_performance, beautician_service_overview, card_usage_action_preview, customer_facts, customer_follow_up_draft, customer_priority_recommendation, customer_waiting_loss_overview, finance_material_cost_summary, finance_payment_breakdown, finance_risk_overview, finance_staff_refund_rate_boundary, finance_transaction_anomaly_review, front_desk_operations_overview, gap_fill_touch_preview, inventory_operations_overview, inventory_procurement_advice, inventory_receipt_discrepancy_guidance, inventory_risk_ranking, manager_staff_overview, marketing_automation_rule_preview, marketing_campaign_cost_attribution_review, marketing_campaign_plan, marketing_customer_segment, marketing_growth_overview, marketing_message_draft, marketing_strategy_execute_preview, marketing_touch_draft, order_revenue_analysis, product_sales_ranking, project_margin_analysis, project_material_consumption_analysis, project_service_ranking, purchase_order_draft, reservation_action_preview, reservation_list, service_record_completion_preview, staff_performance_ranking, store_operations_overview
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
| 旧口径可用题数 | 0 |
| 旧口径可用率 | 0.0% |
| 新口径真实可用题数 | 5 |
| 新口径真实可用率 | 100.0% |
| 六层合同通过题数 | 5 |
| 六层合同通过率 | 100.0% |
| 预期能力边界正确返回 | 0 |
| 多轮场景通过数 | 0 / 0 |
| 多轮场景合同通过数 | 0 / 0 |
| 多轮轮次通过数 | 5 / 5 |
| 多轮轮次合同通过数 | 5 / 5 |
| 平均耗时 | 13077 ms |
| P95 耗时 | 17098 ms |
| 最大耗时 | 17098 ms |
| 权限绕过数 | 0 |
| 跨门店读取数 | 0 |
| roleHint 绕过数 | 0 |
| 假动作确认数 | 0 |

## 六层评分

| 层级 | 通过数 | 通过率 | 平均分 |
| --- | ---: | ---: | ---: |
| intent | 5 / 5 | 100.0% | 100.0% |
| tool | 5 / 5 | 100.0% | 100.0% |
| plan | 5 / 5 | 100.0% | 100.0% |
| execution | 5 / 5 | 100.0% | 100.0% |
| completion | 5 / 5 | 100.0% | 100.0% |
| answer | 5 / 5 | 100.0% | 100.0% |

## Grounding 分布

| Grounding 类型 | 数量 |
| --- | ---: |
| Metric Query | 0 |
| DB Skill | 0 |
| Template Skill | 0 |
| Preview Action | 3 |
| None | 2 |

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
| beautician | 5 |
| customer | 5 |
| project | 5 |

## Capability 分布

| Capability | 数量 |
| --- | ---: |
| service_record_completion_preview | 5 |


## 状态分布

| 状态 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 真实可用 | 5 | 5 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |

## 角色分布

| 角色 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 美容师服务 | 5 | 5 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |

## 分类分布

| 分类 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| action | 5 | 5 | 100.0% | 0 | 0 | 0 |

## Top 问题原因

- 无

## 典型可用样本

- 美容师服务 / action / 真实可用：预览完成服务单 #493 并保存记录：敏感肌舒缓修护已完成，客户肤况稳定，无明显不适。 -> 保存服务记录：黄紫萱 - 敏感肌舒缓修护（服务单 #493）。确认后将通过服务任务业务接口完成并保存记录。

待确认操作：共 1 项，尚未执行。

数据依据：服务记录执行预览。
- 美容师服务 / action / 真实可用：服务单 #493 已做完，请先给我看保存服务记录的确认预览，备注客户过程舒适、结束后没有不良反应。 -> 保存服务记录：黄紫萱 - 敏感肌舒缓修护（服务单 #493）。确认后将通过服务任务业务接口完成并保存记录。

待确认操作：共 1 项，尚未执行。

数据依据：服务记录执行预览。
- 美容师服务 / action / 真实可用：为服务单 #493 保存护理记录，先生成待确认方案：本次护理完成，皮肤状态稳定，客户反馈舒适。 -> 保存服务记录：黄紫萱 - 敏感肌舒缓修护（服务单 #493）。确认后将通过服务任务业务接口完成并保存记录。

待确认操作：共 1 项，尚未执行。

数据依据：服务记录执行预览。
- 美容师服务 / action / 真实可用：预览完成服务单 #283 并保存记录：护理已完成，客户状态正常。 -> 没有找到属于当前美容师且待完成的服务任务。
- 美容师服务 / action / 真实可用：预览完成服务单 #999999 并保存记录：护理已完成，客户状态正常。 -> 没有找到属于当前美容师且待完成的服务任务。

## 典型问题样本

- 无

## 产品结论与改进建议

1. 当前 Ami Brain 已形成六域 Domain Adapter、Supervisor、模板技能、数据库技能和受控动作预览的真实产品链路，本次真实可用率为 100.0%。
2. 当前剩余缺口集中在未覆盖意图和缺少明确业务实体，不再是关键词误命中或伪指标问题；后续应优先补采购建议、客户精确查询、权益 ROI、员工复购排行和否定纠正能力。
3. 对已识别但未接入真实口径的指标继续保持明确拒答，不使用 0、全量历史或无依据估算替代。
4. 发布门禁继续并行检查真实可用率、假阳性、时间范围、权限/跨店、动作确认、异常率和 SSE 首字延迟。
5. 本报告耗时为完整请求落库耗时；用户感知首字延迟需以 SSE 独立压测记录为准。