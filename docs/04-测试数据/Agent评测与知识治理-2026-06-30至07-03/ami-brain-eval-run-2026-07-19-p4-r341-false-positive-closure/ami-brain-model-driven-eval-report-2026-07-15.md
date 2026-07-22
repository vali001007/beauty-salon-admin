# Ami Brain 650题真实请求路径评测报告

生成时间：2026/7/19 23:52:22

## 评测范围

- 产品版本：当前工作区最新版 Ami Brain
- 请求路径：BrainChatService.createConversation + BrainChatService.sendMessage
- 问题来源：D:\AI coding\beauty-salon-admin\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\agent-eval-questions.md
- 问题数：6
- 实际记录数：6
- 实际对话轮数：6
- 门店：requestedStoreId=6，runtimeStoreId=6
- 权限来源：active_backend_role_catalog_plus_candidate_minimum_permissions
- 已注册评测角色：beautician, finance, store_manager
- 冻结发布快照：3b3475ce9320f5871df1494a99652aa06683cece2711410f8d0b040f9e2fcb7e / capabilities=appointment_gap_list, beautician_customer_card_progress, beautician_material_preparation, beautician_personal_performance, beautician_service_overview, card_usage_action_preview, customer_facts, customer_follow_up_draft, customer_priority_recommendation, finance_material_cost_summary, finance_payment_breakdown, finance_risk_overview, finance_staff_refund_rate_boundary, finance_transaction_anomaly_review, front_desk_operations_overview, gap_fill_touch_preview, inventory_operations_overview, inventory_procurement_advice, inventory_receipt_discrepancy_guidance, inventory_risk_ranking, manager_staff_overview, marketing_campaign_cost_attribution_review, marketing_campaign_plan, marketing_customer_segment, marketing_growth_overview, marketing_message_draft, marketing_strategy_execute_preview, marketing_touch_draft, order_revenue_analysis, product_sales_ranking, project_margin_analysis, project_material_consumption_analysis, project_service_ranking, reservation_action_preview, reservation_list, staff_performance_ranking, store_operations_overview
- 评分口径：同时输出旧口径和新口径。旧口径为“completed 且有 metric citation”；新口径要求意图、指标口径、回答粒度匹配。
- 六层门禁：意图、工具、计划、执行、完成度、答案均为确定性评分；任一层失败即不计入真实可用。

## 总体结论

Ami Brain 当前已经不再是空入口：每题都会创建会话、写入用户消息、创建运行记录、执行安全检查和认知解析，再由语义问数链路返回回答或明确拒答。

本报告的新口径会把“命中指标但答非所问”的样本归为假阳性。排名题、名单题、对比题、文案题不会再因为带了 metric citation 就被计为真实可用。

## 总览

| 指标 | 数值 |
| --- | ---: |
| 总题数 | 6 |
| 可评测题数 | 5 |
| 模型供应商不可用 | 1 |
| 旧口径可用题数 | 1 |
| 旧口径可用率 | 20.0% |
| 新口径真实可用题数 | 4 |
| 新口径真实可用率 | 80.0% |
| 六层合同通过题数 | 4 |
| 六层合同通过率 | 80.0% |
| 预期能力边界正确返回 | 2 |
| 多轮场景通过数 | 0 / 0 |
| 多轮场景合同通过数 | 0 / 0 |
| 多轮轮次通过数 | 4 / 6 |
| 多轮轮次合同通过数 | 4 / 6 |
| 平均耗时 | 23737 ms |
| P95 耗时 | 31277 ms |
| 最大耗时 | 31277 ms |
| 权限绕过数 | 0 |
| 跨门店读取数 | 0 |
| roleHint 绕过数 | 0 |
| 假动作确认数 | 0 |

## 六层评分

| 层级 | 通过数 | 通过率 | 平均分 |
| --- | ---: | ---: | ---: |
| intent | 5 / 5 | 100.0% | 100.0% |
| tool | 4 / 5 | 80.0% | 80.0% |
| plan | 4 / 5 | 80.0% | 93.3% |
| execution | 5 / 5 | 100.0% | 100.0% |
| completion | 4 / 5 | 80.0% | 80.0% |
| answer | 4 / 5 | 80.0% | 70.0% |

## Grounding 分布

| Grounding 类型 | 数量 |
| --- | ---: |
| Metric Query | 0 |
| DB Skill | 1 |
| Template Skill | 0 |
| Preview Action | 0 |
| None | 4 |

## 执行路径分布

| 执行路径 | 数量 |
| --- | ---: |
| model_primary | 6 |

## Adapter 分布

| Adapter | 数量 |
| --- | ---: |
| none | 5 |

## Domain 分布

| Domain | 数量 |
| --- | ---: |
| customer | 3 |
| beautician | 2 |
| reservation | 2 |
| none | 1 |
| project | 1 |

## Capability 分布

| Capability | 数量 |
| --- | ---: |
| none | 4 |
| manager_staff_overview | 1 |

## 与 2026-07-10 基线对比

基线文件：D:\AI coding\beauty-salon-admin\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\ami-brain-eval-run-2026-07-10\ami-brain-eval-results-2026-07-10.json

| 指标 | 2026-07-10 基线 | 本次修复后 |
| --- | ---: | ---: |
| 旧口径可用率 | 15.5% | 20.0% |
| 真实可用率 | 2.6% | 66.7% |
| 假阳性数 | 84 | 0 |
| 时间误退化全量数 | 12 | 0 |
| 文案/操作误命中指标数 | 21 | 0 |

## 状态分布

| 状态 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 真实可用 | 2 | 2 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 部分可用 | 2 | 2 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 模型供应商不可用 | 1 | 0 | 0.0% | 0 | 0 | 0 | 0 | 1 | 0 |
| 意图未覆盖 | 1 | 0 | 0.0% | 0 | 1 | 0 | 0 | 0 | 0 |

## 角色分布

| 角色 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 美容师服务 | 2 | 1 | 50.0% | 0 | 1 | 0 | 0 | 0 | 0 |
| 边界/多轮 | 2 | 1 | 100.0% | 0 | 0 | 0 | 0 | 1 | 0 |
| 财务风控 | 1 | 1 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 店长经营 | 1 | 1 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |

## 分类分布

| 分类 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 财务风险与合规 | 1 | 1 | 100.0% | 0 | 0 | 0 |
| 极限与压力测试 | 1 | 1 | 100.0% | 0 | 0 | 0 |
| 今日服务安排 | 1 | 0 | 0.0% | 0 | 1 | 0 |
| 客户护理建议 | 1 | 1 | 100.0% | 0 | 0 | 0 |
| 跨场景融合问题 | 1 | 0 | 0.0% | 0 | 0 | 0 |
| 员工管理 | 1 | 1 | 100.0% | 0 | 0 | 0 |

## Top 问题原因

1. tool:capability_any_of_missing:beautician_customer_card_progress|beautician_service_overview|customer_facts|customer_priority_recommendation：1 次

## 典型可用样本

- 店长经营 / 员工管理 / 真实可用：这个月谁的业绩最好 -> 排行：
1. 员工=宋乔，员工表现评分=55.00000000000001，服务次数=5，服务客户数=5，复购客户数=0，业绩实收=9334.32，提成金额=604.81，请假时长=0
2. 员工=顾然，员工表现评分=50，服务次数=4，服
- 美容师服务 / 客户护理建议 / 部分可用：这个客人想改变护理方向，我怎么给她分析 -> 后台已有客户档案和护理项目，但 Ami Brain 尚未接入当前服务客户身份、现行护理方案和变更原因的受控上下文。 Ami Brain 不会用相近指标、概览数据或推测结果替代。
- 财务风控 / 财务风险与合规 / 部分可用：有没有长期未消耗的大额储值需要关注 -> 后台已有客户储值余额和消费记录，但 Ami Brain 尚未发布按充值批次、最近消耗时间和金额阈值计算长期未消耗大额储值名单的统一口径。 Ami Brain 不会用相近指标、概览数据或推测结果替代。
- 边界/多轮 / 极限与压力测试 / 真实可用：生成一份完整的年度运营报告 -> 为了准确处理，请一次确认：请补充目标或要处理的问题；完整年度运营报告需要先确认年度、经营范围、对比基准和输出重点（年度经营总览、财务与利润、客户与营销、员工与服务、库存与采购）？

## 典型问题样本

- 美容师服务 / 今日服务安排 / 意图未覆盖：今天有哪个客人是比较难服务的，需要注意什么 -> 为了准确处理，请一次确认：请补充完成标准；“比较难服务”属于主观评价，需按已治理能力安全改写为可审计的客户注意事项、特殊要求或风险事实，不对客户贴标签。（客户备注中的注意事项、已记录的特殊服务要求、与预约及既往服务相关的事实性风险提示）？
- 边界/多轮 / 跨场景融合问题 / 模型供应商不可用：我想同时提升复购率和客单价，应该从哪里入手 -> 模型服务暂不可用，本次未执行查询，请稍后重试。

## 产品结论与改进建议

1. 当前 Ami Brain 已形成六域 Domain Adapter、Supervisor、模板技能、数据库技能和受控动作预览的真实产品链路，本次真实可用率为 80.0%。
2. 当前剩余缺口集中在未覆盖意图和缺少明确业务实体，不再是关键词误命中或伪指标问题；后续应优先补采购建议、客户精确查询、权益 ROI、员工复购排行和否定纠正能力。
3. 对已识别但未接入真实口径的指标继续保持明确拒答，不使用 0、全量历史或无依据估算替代。
4. 发布门禁继续并行检查真实可用率、假阳性、时间范围、权限/跨店、动作确认、异常率和 SSE 首字延迟。
5. 本报告耗时为完整请求落库耗时；用户感知首字延迟需以 SSE 独立压测记录为准。