# Ami Brain 650题真实请求路径评测报告

生成时间：2026/7/20 08:59:21

## 评测范围

- 产品版本：当前工作区最新版 Ami Brain
- 请求路径：BrainChatService.createConversation + BrainChatService.sendMessage
- 问题来源：D:\AI coding\beauty-salon-admin\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\agent-eval-questions.md
- 问题数：7
- 实际记录数：7
- 实际对话轮数：7
- 门店：requestedStoreId=6，runtimeStoreId=6
- 权限来源：active_backend_role_catalog_plus_candidate_minimum_permissions
- 已注册评测角色：finance, inventory, marketing, receptionist, store_manager
- 冻结发布快照：6312b46f23cf45aa03daffe56c9c32d58666061e97cc09280a656e58f6fca2d5 / capabilities=appointment_gap_list, beautician_customer_card_progress, beautician_material_preparation, beautician_personal_performance, beautician_service_overview, card_usage_action_preview, customer_facts, customer_follow_up_draft, customer_priority_recommendation, finance_material_cost_summary, finance_payment_breakdown, finance_risk_overview, finance_staff_refund_rate_boundary, finance_transaction_anomaly_review, front_desk_operations_overview, gap_fill_touch_preview, inventory_operations_overview, inventory_procurement_advice, inventory_receipt_discrepancy_guidance, inventory_risk_ranking, manager_staff_overview, marketing_campaign_cost_attribution_review, marketing_campaign_plan, marketing_customer_segment, marketing_growth_overview, marketing_message_draft, marketing_strategy_execute_preview, marketing_touch_draft, order_revenue_analysis, product_sales_ranking, project_margin_analysis, project_material_consumption_analysis, project_service_ranking, reservation_action_preview, reservation_list, staff_performance_ranking, store_operations_overview
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
| 旧口径可用题数 | 1 |
| 旧口径可用率 | 14.3% |
| 新口径真实可用题数 | 6 |
| 新口径真实可用率 | 85.7% |
| 六层合同通过题数 | 6 |
| 六层合同通过率 | 85.7% |
| 预期能力边界正确返回 | 3 |
| 多轮场景通过数 | 0 / 0 |
| 多轮场景合同通过数 | 0 / 0 |
| 多轮轮次通过数 | 6 / 7 |
| 多轮轮次合同通过数 | 6 / 7 |
| 平均耗时 | 9997 ms |
| P95 耗时 | 13375 ms |
| 最大耗时 | 13375 ms |
| 权限绕过数 | 0 |
| 跨门店读取数 | 0 |
| roleHint 绕过数 | 0 |
| 假动作确认数 | 0 |

## 六层评分

| 层级 | 通过数 | 通过率 | 平均分 |
| --- | ---: | ---: | ---: |
| intent | 6 / 7 | 85.7% | 89.3% |
| tool | 6 / 7 | 85.7% | 85.7% |
| plan | 6 / 7 | 85.7% | 92.9% |
| execution | 7 / 7 | 100.0% | 100.0% |
| completion | 6 / 7 | 85.7% | 89.3% |
| answer | 6 / 7 | 85.7% | 71.4% |

## Grounding 分布

| Grounding 类型 | 数量 |
| --- | ---: |
| Metric Query | 1 |
| DB Skill | 1 |
| Template Skill | 0 |
| Preview Action | 0 |
| None | 5 |

## 执行路径分布

| 执行路径 | 数量 |
| --- | ---: |
| model_primary | 6 |
| exact_contract_fast_path | 1 |

## Adapter 分布

| Adapter | 数量 |
| --- | ---: |
| none | 7 |

## Domain 分布

| Domain | 数量 |
| --- | ---: |
| customer | 4 |
| reservation | 2 |
| beautician | 1 |
| marketing | 1 |
| none | 1 |
| order | 1 |
| payment | 1 |
| product | 1 |
| product_order | 1 |
| project | 1 |

## Capability 分布

| Capability | 数量 |
| --- | ---: |
| none | 5 |
| finance_material_cost_summary | 1 |
| order_revenue_analysis | 1 |


## 状态分布

| 状态 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 部分可用 | 4 | 4 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 真实可用 | 2 | 2 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 意图未覆盖 | 1 | 0 | 0.0% | 0 | 1 | 0 | 0 | 0 | 0 |

## 角色分布

| 角色 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 边界/多轮 | 3 | 2 | 66.7% | 0 | 1 | 0 | 0 | 0 | 0 |
| 财务风控 | 1 | 1 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 库存采购 | 1 | 1 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 营销增长 | 1 | 1 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 前台接待 | 1 | 1 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |

## 分类分布

| 分类 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 代词和上下文继承测试 | 1 | 0 | 0.0% | 0 | 1 | 0 |
| 跨场景融合问题 | 1 | 1 | 100.0% | 0 | 0 | 0 |
| 收入与对账 | 1 | 1 | 100.0% | 0 | 0 | 0 |
| 消耗分析 | 1 | 1 | 100.0% | 0 | 0 | 0 |
| 意图模糊测试 | 1 | 1 | 100.0% | 0 | 0 | 0 |
| 预约管理 | 1 | 1 | 100.0% | 0 | 0 | 0 |
| 自动化与触达规则 | 1 | 1 | 100.0% | 0 | 0 | 0 |

## Top 问题原因

1. intent:intent_mismatch：1 次

## 典型可用样本

- 营销增长 / 自动化与触达规则 / 部分可用：有没有办法让系统自动识别客户的节假日并发关怀 -> 后台已有客户和营销触达能力，但尚未发布客户节假日识别、触发日历、渠道冷却和送达回执的一体化自动化合同。 Ami Brain 不会用相近指标、概览数据或推测结果替代。
- 前台接待 / 预约管理 / 部分可用：今天有没有可能爽约的预约需要提前联系 -> 后台已有预约状态和到店结果，但尚未发布预约爽约概率模型、风险阈值和可解释特征，不能用普通客户跟进优先级替代。 Ami Brain 不会用相近指标、概览数据或推测结果替代。
- 库存采购 / 消耗分析 / 部分可用：帮我看一下耗材成本占服务收入的比例 -> 耗材成本：0.00 元；耗材成本占收入：暂无。

数据依据：财务收入与耗材成本分析。
- 财务风控 / 收入与对账 / 真实可用：今天的日均客单价是多少 -> 指标：客单价：0（口径版本 2）。

数据依据：业务定义：客单价。
- 边界/多轮 / 意图模糊测试 / 真实可用：有什么问题吗 -> 为了准确处理，请一次确认：请补充目标或要处理的问题；“有什么问题吗”未指明需检查的业务域、对象或范围，无法确定是经营、财务、库存、预约、客户还是员工问题。（门店整体经营风险、财务与退款优惠风险、库存风险、预约现场问题、客户经营问题、员工运营
- 边界/多轮 / 跨场景融合问题 / 部分可用：新招了个美容师，怎么快速帮她建立客源 -> 后台已有员工表现和客户分群事实，但尚未发布新员工客户分配、服务承接、归属变更和效果归因的统一增长闭环。 Ami Brain 不会用相近指标、概览数据或推测结果替代。

## 典型问题样本

- 边界/多轮 / 代词和上下文继承测试 / 意图未覆盖：今天哪个时间段还有空档？（然后）能不能再加一个客人进去？ -> 可以先生成加客预览，但需要你确认客户、服务项目和目标空档时段。请先补充这三项中的缺失信息。

## 产品结论与改进建议

1. 当前 Ami Brain 已形成六域 Domain Adapter、Supervisor、模板技能、数据库技能和受控动作预览的真实产品链路，本次真实可用率为 85.7%。
2. 当前剩余缺口集中在未覆盖意图和缺少明确业务实体，不再是关键词误命中或伪指标问题；后续应优先补采购建议、客户精确查询、权益 ROI、员工复购排行和否定纠正能力。
3. 对已识别但未接入真实口径的指标继续保持明确拒答，不使用 0、全量历史或无依据估算替代。
4. 发布门禁继续并行检查真实可用率、假阳性、时间范围、权限/跨店、动作确认、异常率和 SSE 首字延迟。
5. 本报告耗时为完整请求落库耗时；用户感知首字延迟需以 SSE 独立压测记录为准。