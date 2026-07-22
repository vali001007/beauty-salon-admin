# Ami Brain 1题真实请求路径评测报告

生成时间：2026/7/21 17:51:59

## 评测范围

- 产品版本：当前工作区最新版 Ami Brain
- 请求路径：BrainChatService.createConversation + BrainChatService.sendMessage
- 问题来源：D:\AI coding\beauty-salon-admin-ami-brain-p1\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\agent-eval-questions.md
- 问题数：1
- 实际记录数：1
- 实际对话轮数：1
- 门店：requestedStoreId=6，runtimeStoreId=6
- 权限来源：active_backend_role_catalog_plus_candidate_minimum_permissions
- 已注册评测角色：store_manager
- 冻结发布快照：ff731367df3f125236a49e7054f32f04b894d744cecbad171d458c261602e84e / capabilities=appointment_gap_list, beautician_customer_card_progress, beautician_material_preparation, beautician_personal_performance, beautician_service_overview, card_usage_action_preview, customer_facts, customer_follow_up_draft, customer_priority_recommendation, customer_waiting_loss_overview, finance_material_cost_summary, finance_payment_breakdown, finance_risk_overview, finance_staff_refund_rate_boundary, finance_transaction_anomaly_review, front_desk_operations_overview, gap_fill_touch_preview, inventory_operations_overview, inventory_procurement_advice, inventory_receipt_discrepancy_guidance, inventory_risk_ranking, manager_staff_overview, marketing_automation_rule_preview, marketing_campaign_cost_attribution_review, marketing_campaign_plan, marketing_customer_segment, marketing_growth_overview, marketing_message_draft, marketing_strategy_execute_preview, marketing_touch_draft, order_revenue_analysis, product_sales_ranking, project_margin_analysis, project_material_consumption_analysis, project_service_ranking, purchase_order_draft, reservation_action_preview, reservation_list, staff_performance_ranking, store_operations_overview
- 评分口径：同时输出旧口径和新口径。旧口径为“completed 且有 metric citation”；新口径要求意图、指标口径、回答粒度匹配。
- 六层门禁：意图、工具、计划、执行、完成度、答案均为确定性评分；任一层失败即不计入真实可用。

## 总体结论

Ami Brain 当前已经不再是空入口：每题都会创建会话、写入用户消息、创建运行记录、执行安全检查和认知解析，再由语义问数链路返回回答或明确拒答。

本报告的新口径会把“命中指标但答非所问”的样本归为假阳性。排名题、名单题、对比题、文案题不会再因为带了 metric citation 就被计为真实可用。

## 总览

| 指标 | 数值 |
| --- | ---: |
| 总题数 | 1 |
| 可评测题数 | 1 |
| 模型供应商不可用 | 0 |
| 旧口径可用题数 | 0 |
| 旧口径可用率 | 0.0% |
| 新口径真实可用题数 | 0 |
| 新口径真实可用率 | 0.0% |
| 六层合同通过题数 | 0 |
| 六层合同通过率 | 0.0% |
| 预期能力边界正确返回 | 0 |
| 多轮场景通过数 | 0 / 0 |
| 多轮场景合同通过数 | 0 / 0 |
| 多轮轮次通过数 | 0 / 1 |
| 多轮轮次合同通过数 | 0 / 1 |
| 平均耗时 | 6285 ms |
| P95 耗时 | 6285 ms |
| 最大耗时 | 6285 ms |
| 权限绕过数 | 0 |
| 跨门店读取数 | 0 |
| roleHint 绕过数 | 0 |
| 假动作确认数 | 0 |

## 六层评分

| 层级 | 通过数 | 通过率 | 平均分 |
| --- | ---: | ---: | ---: |
| intent | 0 / 1 | 0.0% | 0.0% |
| tool | 1 / 1 | 100.0% | 100.0% |
| plan | 0 / 1 | 0.0% | 66.7% |
| execution | 0 / 1 | 0.0% | 0.0% |
| completion | 0 / 1 | 0.0% | 0.0% |
| answer | 0 / 1 | 0.0% | 0.0% |

## Grounding 分布

| Grounding 类型 | 数量 |
| --- | ---: |
| Metric Query | 0 |
| DB Skill | 0 |
| Template Skill | 0 |
| Preview Action | 0 |
| None | 1 |

## 执行路径分布

| 执行路径 | 数量 |
| --- | ---: |
| exact_contract_fast_path | 1 |

## Adapter 分布

| Adapter | 数量 |
| --- | ---: |
| none | 1 |

## Domain 分布

| Domain | 数量 |
| --- | ---: |
| none | 1 |

## Capability 分布

| Capability | 数量 |
| --- | ---: |
| store_operations_overview | 1 |


## 失败题回归结果

- 来源：D:\AI coding\beauty-salon-admin\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\ami-brain-eval-run-2026-07-21-release362-final-650\ami-brain-model-driven-eval-results-2026-07-15.json
- 范围：product
- 选中：1
- 已修复：0
- 未修复：1
- 供应商不可用：0
- 题目缺失：0
- 回归门禁：未通过

未修复题号：qb-manager-business-overview-005



## 状态分布

| 状态 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 指标查询失败 | 1 | 0 | 0.0% | 1 | 0 | 0 | 0 | 0 | 0 |

## 角色分布

| 角色 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 店长经营 | 1 | 0 | 0.0% | 1 | 0 | 0 | 0 | 0 | 0 |

## 分类分布

| 分类 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 经营概览 | 1 | 0 | 0.0% | 1 | 0 | 0 |

## Top 问题原因

1. intent:intent_mismatch：1 次

## 典型可用样本

- 本次没有可用样本。

## 典型问题样本

- 店长经营 / 经营概览 / 指标查询失败：本周跟上周比，哪天差距最大 -> 当前无法完成查询，请稍后重试。

## 产品结论与改进建议

1. 当前 Ami Brain 已形成六域 Domain Adapter、Supervisor、模板技能、数据库技能和受控动作预览的真实产品链路，本次真实可用率为 0.0%。
2. 当前剩余缺口集中在未覆盖意图和缺少明确业务实体，不再是关键词误命中或伪指标问题；后续应优先补采购建议、客户精确查询、权益 ROI、员工复购排行和否定纠正能力。
3. 对已识别但未接入真实口径的指标继续保持明确拒答，不使用 0、全量历史或无依据估算替代。
4. 发布门禁继续并行检查真实可用率、假阳性、时间范围、权限/跨店、动作确认、异常率和 SSE 首字延迟。
5. 本报告耗时为完整请求落库耗时；用户感知首字延迟需以 SSE 独立压测记录为准。