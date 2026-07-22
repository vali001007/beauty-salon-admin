# Ami Brain 650题真实请求路径评测报告

生成时间：2026/7/19 06:56:03

## 评测范围

- 产品版本：当前工作区最新版 Ami Brain
- 请求路径：BrainChatService.createConversation + BrainChatService.sendMessage
- 问题来源：D:\AI coding\beauty-salon-admin\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\agent-eval-questions.md
- 问题数：15
- 实际记录数：15
- 实际对话轮数：31
- 门店：requestedStoreId=6，runtimeStoreId=6
- 权限来源：active_backend_role_catalog_plus_candidate_minimum_permissions
- 已注册评测角色：store_manager
- 冻结发布快照：42bc62c1b4c95580ab2a3390f28042a2f386f8c34356c7af2a9d65c71ce814af / capabilities=beautician_customer_card_progress, beautician_material_preparation, beautician_service_overview, card_usage_action_preview, customer_facts, customer_follow_up_draft, customer_priority_recommendation, finance_payment_breakdown, finance_risk_overview, front_desk_operations_overview, gap_fill_touch_preview, inventory_operations_overview, inventory_procurement_advice, inventory_risk_ranking, manager_staff_overview, marketing_campaign_plan, marketing_customer_segment, marketing_growth_overview, marketing_message_draft, marketing_strategy_execute_preview, marketing_touch_draft, order_revenue_analysis, product_sales_ranking, project_service_ranking, reservation_action_preview, reservation_list, staff_performance_ranking, store_operations_overview
- 评分口径：同时输出旧口径和新口径。旧口径为“completed 且有 metric citation”；新口径要求意图、指标口径、回答粒度匹配。
- 六层门禁：意图、工具、计划、执行、完成度、答案均为确定性评分；任一层失败即不计入真实可用。

## 总体结论

Ami Brain 当前已经不再是空入口：每题都会创建会话、写入用户消息、创建运行记录、执行安全检查和认知解析，再由语义问数链路返回回答或明确拒答。

本报告的新口径会把“命中指标但答非所问”的样本归为假阳性。排名题、名单题、对比题、文案题不会再因为带了 metric citation 就被计为真实可用。

## 总览

| 指标 | 数值 |
| --- | ---: |
| 总题数 | 15 |
| 可评测题数 | 15 |
| 模型供应商不可用 | 0 |
| 旧口径可用题数 | 4 |
| 旧口径可用率 | 26.7% |
| 新口径真实可用题数 | 9 |
| 新口径真实可用率 | 60.0% |
| 多轮场景通过数 | 9 / 15 |
| 多轮轮次通过数 | 24 / 31 |
| 平均耗时 | 29999 ms |
| P95 耗时 | 51892 ms |
| 最大耗时 | 51892 ms |
| 权限绕过数 | 0 |
| 跨门店读取数 | 0 |
| roleHint 绕过数 | 0 |
| 假动作确认数 | 0 |

## 六层评分

| 层级 | 通过数 | 通过率 | 平均分 |
| --- | ---: | ---: | ---: |
| intent | 30 / 31 | 96.8% | 96.8% |
| tool | 29 / 31 | 93.5% | 93.5% |
| plan | 28 / 31 | 90.3% | 95.2% |
| execution | 27 / 31 | 87.1% | 87.1% |
| completion | 26 / 31 | 83.9% | 86.8% |
| answer | 24 / 31 | 77.4% | 77.4% |

## Grounding 分布

| Grounding 类型 | 数量 |
| --- | ---: |
| Metric Query | 0 |
| DB Skill | 11 |
| Template Skill | 0 |
| Preview Action | 0 |
| None | 4 |

## 执行路径分布

| 执行路径 | 数量 |
| --- | ---: |
| model_primary | 15 |

## Adapter 分布

| Adapter | 数量 |
| --- | ---: |
| none | 15 |

## Domain 分布

| Domain | 数量 |
| --- | ---: |
| customer | 5 |
| finance | 4 |
| payment | 4 |
| product | 4 |
| reservation | 4 |
| order | 3 |
| beautician | 1 |
| none | 1 |
| payment_record | 1 |
| product_order | 1 |
| refund | 1 |

## Capability 分布

| Capability | 数量 |
| --- | ---: |
| customer_facts | 4 |
| finance_risk_overview | 3 |
| inventory_procurement_advice | 2 |
| none | 2 |
| order_revenue_analysis | 2 |
| finance_payment_breakdown | 1 |
| front_desk_operations_overview | 1 |
| gap_fill_touch_preview | 1 |
| inventory_operations_overview | 1 |
| product_sales_ranking | 1 |
| reservation_list | 1 |
| store_operations_overview | 1 |

## 与 2026-07-10 基线对比

基线文件：D:\AI coding\beauty-salon-admin\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\ami-brain-eval-run-2026-07-10\ami-brain-eval-results-2026-07-10.json

| 指标 | 2026-07-10 基线 | 本次修复后 |
| --- | ---: | ---: |
| 旧口径可用率 | 15.5% | 26.7% |
| 真实可用率 | 3.4% | 60.0% |
| 假阳性数 | 79 | 1 |
| 时间误退化全量数 | 12 | 0 |
| 文案/操作误命中指标数 | 21 | 0 |

## 状态分布

| 状态 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 真实可用 | 9 | 9 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 指标查询失败 | 3 | 0 | 0.0% | 3 | 0 | 0 | 0 | 0 | 0 |
| 假阳性-粒度错配 | 1 | 0 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 会话/门店不存在 | 1 | 0 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 意图未覆盖 | 1 | 0 | 0.0% | 0 | 1 | 0 | 0 | 0 | 0 |

## 角色分布

| 角色 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 边界/多轮 | 15 | 9 | 60.0% | 3 | 1 | 0 | 0 | 0 | 0 |

## 分类分布

| 分类 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 代词和上下文继承测试 | 10 | 5 | 50.0% | 3 | 1 | 0 |
| 否定与纠正测试 | 5 | 4 | 80.0% | 0 | 0 | 0 |

## Top 问题原因

1. turn-2:tool:capability_any_of_missing:card_usage_action_preview|customer_follow_up_draft|gap_fill_touch_preview|marketing_strategy_execute_preview|marketing_touch_draft|reservation_action_preview：2 次
2. turn-1:answer:false_positive_granularity_mismatch：1 次
3. turn-2:answer:not_found：1 次
4. turn-2:execution:execution_status:rejected：1 次
5. turn-2:intent:intent_mismatch：1 次

## 典型可用样本

- 边界/多轮 / 代词和上下文继承测试 / 真实可用：帮我查一下客户马美琳，手机号后四位6325的信息。 -> 她上次来是什么项目？ -> 明细：当前没有匹配数据。

说明：当前时间范围没有匹配的明细数据。

数据依据：客户档案与最近到店事实。
- 边界/多轮 / 代词和上下文继承测试 / 真实可用：库存低的产品有哪些？ -> 帮我生成补货清单 -> 库存采购建议：共 1 项。
1. 玻尿酸保湿精华：当前库存 131，安全库存 143，建议采购 155，候选供应商 Ami MVP 供应商

数据依据：库存采购建议分析。
- 边界/多轮 / 代词和上下文继承测试 / 真实可用：本月营业额多少？ -> 比上个月高了多少？ -> 对比：实收金额，当前 本月 28756.30 元，上一期 上月 127761.01 元，变化 -99004.71 元（-77.5%）。

数据依据：财务支付方式拆分；业务定义：实收金额。
- 边界/多轮 / 代词和上下文继承测试 / 真实可用：帮我看一下退款情况。 -> 有没有异常的？ -> 具体是哪几笔？ -> 实收：0.00 元；退款：0.00 元（0 笔）；优惠：0.00 元；毛利：0.00 元；毛利率：暂无结算口径；会员卡负债：1067817.81 元。

排行：当前时间范围没有可排行的数据。

趋势数据：
1. 日期=2026-07-19，
- 边界/多轮 / 代词和上下文继承测试 / 真实可用：这个月毛利率是多少？ -> 为什么比上个月低？ -> 实收：28756.30 元；退款：1419.00 元（4 笔）；优惠：1674.70 元；毛利：16154.94 元；毛利率：59.5%；会员卡负债：1067817.81 元。

排行：
1. 支付方式=wechat，金额=15086.10
- 边界/多轮 / 否定与纠正测试 / 真实可用：这个月营业额是多少 -> 不对，我问的是上个月不是这个月 -> 指标：实收金额：127761.01（口径版本 8）。

数据依据：业务定义：实收金额。
- 边界/多轮 / 否定与纠正测试 / 真实可用：这个月营业额是多少 -> 这个数据不对，帮我重新查一下 -> 指标：实收金额：28756.30（口径版本 8）。

数据依据：业务定义：实收金额。
- 边界/多轮 / 否定与纠正测试 / 真实可用：本月商品销售排行 -> 我不要表格，给我用文字说 -> 排行：
1. 商品=抗衰紧致眼霜，product_sales_amount=8535.220000000001
2. 商品=烟酰胺亮肤精华，product_sales_amount=3643.5299999999997
3. 商品=氨基酸洁

## 典型问题样本

- 边界/多轮 / 代词和上下文继承测试 / 假阳性-粒度错配：帮我看今天的预约。 -> 其中有几个是VIP？ -> 今天没有预约客户。系统当前只有预约客户的原始会员等级，尚未发布统一的 VIP 等级映射规则，因此只展示会员等级，不自动把某个等级判定为 VIP。

明细：当前没有匹配数据。

未完成范围：rejected:vip_customers:bra
- 边界/多轮 / 代词和上下文继承测试 / 指标查询失败：帮我找45天没来的客户。 -> 给她们发一条召回消息 -> 未找到可执行的已发布能力，请补充业务对象、指标或时间范围。
- 边界/多轮 / 代词和上下文继承测试 / 意图未覆盖：这个月哪个员工业绩最好？ -> 给她发个鼓励通知 -> 为了准确处理，请一次确认：请补充操作对象；请补充业务对象；“她”可能指向上轮查询结果中的员工，但当前上下文未提供具体员工姓名或已解析结果。（上轮业绩最佳员工、其他此前提及的女性员工）？
- 边界/多轮 / 代词和上下文继承测试 / 指标查询失败：有哪些临期产品？ -> 适合搭配什么活动消化掉？ -> 在库 SKU：45 个；库存金额：259391.31 元；低库存 SKU：1 个；临期库存金额：0.00 元（截止 2026-08-18）；采购建议：1 项；候选供应商：3 家。

排行：
1. 商品=玻尿酸保湿精华，当前库存=131，出库
- 边界/多轮 / 代词和上下文继承测试 / 指标查询失败：今天哪个时间段还有空档？ -> 能不能再加一个客人进去？ -> 当前无法完成查询，请稍后重试。
- 边界/多轮 / 否定与纠正测试 / 会话/门店不存在：帮我查一下张雯，她上次来是什么时候 -> 这个客人不是张雯，是张文 -> 当前门店没有找到匹配客户，请核对姓名或手机号后四位。

数据依据：客户精确事实查询。

## 产品结论与改进建议

1. 当前 Ami Brain 已形成六域 Domain Adapter、Supervisor、模板技能、数据库技能和受控动作预览的真实产品链路，本次真实可用率为 60.0%。
2. 当前剩余缺口集中在未覆盖意图和缺少明确业务实体，不再是关键词误命中或伪指标问题；后续应优先补采购建议、客户精确查询、权益 ROI、员工复购排行和否定纠正能力。
3. 对已识别但未接入真实口径的指标继续保持明确拒答，不使用 0、全量历史或无依据估算替代。
4. 发布门禁继续并行检查真实可用率、假阳性、时间范围、权限/跨店、动作确认、异常率和 SSE 首字延迟。
5. 本报告耗时为完整请求落库耗时；用户感知首字延迟需以 SSE 独立压测记录为准。