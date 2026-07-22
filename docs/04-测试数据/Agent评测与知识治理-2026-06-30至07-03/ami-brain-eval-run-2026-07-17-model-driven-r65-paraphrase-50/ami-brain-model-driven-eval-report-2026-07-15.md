# Ami Brain 650题真实请求路径评测报告

生成时间：2026/7/17 01:38:44

## 评测范围

- 产品版本：当前工作区最新版 Ami Brain
- 请求路径：BrainChatService.createConversation + BrainChatService.sendMessage
- 问题来源：D:\AI coding\beauty-salon-admin\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\ami-brain-model-driven-paraphrase-cases.json
- 问题数：50
- 实际记录数：50
- 门店：requestedStoreId=6，runtimeStoreId=6
- 权限来源：active_backend_role_catalog_plus_candidate_minimum_permissions
- 已注册评测角色：finance, inventory, marketing, receptionist, store_manager
- 冻结发布快照：d74fbb7654ef4ef93a06fcb195df2157b22282f3bf6d4ba5fcba31f9c02bee4e / capabilities=beautician_service_overview, customer_facts, finance_payment_breakdown, finance_risk_overview, front_desk_operations_overview, inventory_operations_overview, inventory_procurement_advice, manager_staff_overview, marketing_customer_segment, marketing_growth_overview, product_sales_ranking, project_service_ranking, reservation_list, store_operations_overview
- 评分口径：同时输出旧口径和新口径。旧口径为“completed 且有 metric citation”；新口径要求意图、指标口径、回答粒度匹配。
- 六层门禁：意图、工具、计划、执行、完成度、答案均为确定性评分；任一层失败即不计入真实可用。

## 总体结论

Ami Brain 当前已经不再是空入口：每题都会创建会话、写入用户消息、创建运行记录、执行安全检查和认知解析，再由语义问数链路返回回答或明确拒答。

本报告的新口径会把“命中指标但答非所问”的样本归为假阳性。排名题、名单题、对比题、文案题不会再因为带了 metric citation 就被计为真实可用。

## 总览

| 指标 | 数值 |
| --- | ---: |
| 总题数 | 50 |
| 可评测题数 | 23 |
| 模型供应商不可用 | 27 |
| 旧口径可用题数 | 3 |
| 旧口径可用率 | 13.0% |
| 新口径真实可用题数 | 4 |
| 新口径真实可用率 | 17.4% |
| 平均耗时 | 13966 ms |
| P95 耗时 | 20490 ms |
| 最大耗时 | 20677 ms |
| 权限绕过数 | 0 |
| 跨门店读取数 | 0 |
| roleHint 绕过数 | 0 |
| 假动作确认数 | 0 |

## 六层评分

| 层级 | 通过数 | 通过率 | 平均分 |
| --- | ---: | ---: | ---: |
| intent | 20 / 23 | 87.0% | 87.0% |
| tool | 13 / 23 | 56.5% | 56.5% |
| plan | 22 / 23 | 95.7% | 97.8% |
| execution | 8 / 23 | 34.8% | 34.8% |
| completion | 4 / 23 | 17.4% | 25.4% |
| answer | 4 / 23 | 17.4% | 17.4% |

## Grounding 分布

| Grounding 类型 | 数量 |
| --- | ---: |
| Metric Query | 3 |
| DB Skill | 1 |
| Template Skill | 0 |
| Preview Action | 0 |
| None | 19 |

## 执行路径分布

| 执行路径 | 数量 |
| --- | ---: |
| model_unavailable | 26 |
| model_primary | 24 |

## Adapter 分布

| Adapter | 数量 |
| --- | ---: |
| none | 23 |

## Domain 分布

| Domain | 数量 |
| --- | ---: |
| finance | 8 |
| payment | 8 |
| order | 7 |
| customer | 6 |
| product | 6 |
| payment_record | 5 |
| marketing | 3 |
| none | 3 |
| operating_cost | 3 |
| refund | 3 |
| reservation | 3 |
| order_item | 1 |
| project | 1 |

## Capability 分布

| Capability | 数量 |
| --- | ---: |
| none | 19 |
| product_sales_ranking | 3 |
| finance_risk_overview | 1 |


## 状态分布

| 状态 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 模型供应商不可用 | 27 | 0 | 0.0% | 0 | 0 | 0 | 0 | 27 | 0 |
| 指标查询失败 | 15 | 0 | 0.0% | 15 | 0 | 0 | 0 | 0 | 0 |
| 意图未覆盖 | 4 | 0 | 0.0% | 0 | 4 | 0 | 0 | 0 | 0 |
| 真实可用 | 4 | 4 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |

## 角色分布

| 角色 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 财务风控 | 20 | 1 | 12.5% | 6 | 1 | 0 | 0 | 12 | 0 |
| 库存采购 | 10 | 3 | 50.0% | 2 | 1 | 0 | 0 | 4 | 0 |
| 前台接待 | 10 | 0 | 0.0% | 0 | 1 | 0 | 0 | 9 | 0 |
| 边界/多轮 | 5 | 0 | 0.0% | 3 | 1 | 0 | 0 | 1 | 0 |
| 营销增长 | 5 | 0 | 0.0% | 4 | 0 | 0 | 0 | 1 | 0 |

## 分类分布

| 分类 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| action | 5 | 0 | 0.0% | 0 | 1 | 0 |
| clarify | 5 | 0 | 0.0% | 3 | 1 | 0 |
| comparison | 5 | 0 | 0.0% | 0 | 0 | 0 |
| diagnosis | 5 | 1 | 33.3% | 1 | 1 | 0 |
| draft | 5 | 0 | 0.0% | 4 | 0 | 0 |
| query | 5 | 0 | 0.0% | 2 | 0 | 0 |
| ranking | 5 | 3 | 75.0% | 0 | 1 | 0 |
| recommendation | 5 | 0 | 0.0% | 2 | 0 | 0 |
| trend | 5 | 0 | 0.0% | 3 | 0 | 0 |
| workflow | 5 | 0 | 0.0% | 0 | 0 | 0 |

## Top 问题原因

1. tool:capability_any_of_missing:finance_payment_breakdown|finance_risk_overview|store_operations_overview：5 次
2. execution:brain_status:failed：4 次
3. intent:intent_mismatch：3 次
4. tool:capability_any_of_missing:customer_facts|finance_risk_overview：2 次
5. tool:capability_any_of_missing:inventory_operations_overview|inventory_procurement_advice：2 次
6. completion:completion_grounding_missing：1 次
7. plan:plan_preview_missing：1 次
8. tool:capability_any_of_missing:product_sales_ranking|inventory_operations_overview：1 次

## 典型可用样本

- 库存采购 / ranking / 真实可用：本月哪些货卖得最靠前 -> 排行：
1. 商品=抗衰紧致眼霜，销量=18
2. 商品=烟酰胺亮肤精华，销量=11
3. 商品=氨基酸洁面乳，销量=11
4. 商品=玻尿酸保湿精华，销量=3
5. 商品=水氧护理耗材包，销量=1
6. 商品=舒缓修护面膜，销量=1
7.
- 库存采购 / ranking / 真实可用：给商品销量排个前十 -> 排行：
1. 商品=抗衰紧致眼霜，销量=26
2. 商品=氨基酸洁面乳，销量=21
3. 商品=玻尿酸保湿精华，销量=16
4. 商品=烟酰胺亮肤精华，销量=13
5. 商品=屏障修护乳，销量=3
6. 商品=水氧护理耗材包，销量=3
7.
- 库存采购 / ranking / 真实可用：哪几款产品这个月出货最多 -> 排行：
1. 商品=抗衰紧致眼霜，销量=18
2. 商品=烟酰胺亮肤精华，销量=11
3. 商品=氨基酸洁面乳，销量=11
4. 商品=玻尿酸保湿精华，销量=3
5. 商品=水氧护理耗材包，销量=1
6. 商品=舒缓修护面膜，销量=1
7.
- 财务风控 / diagnosis / 真实可用：为什么最近做得不少却不赚钱 -> 实收：120885.31 元；退款：4299.00 元（5 笔）；优惠：4357.69 元；毛利：121426.41 元；毛利率：76.6%；会员卡负债：1067817.81 元。

排行：
1. 支付方式=wechat，金额=75057.

## 典型问题样本

- 财务风控 / query / 模型供应商不可用：这个月店里实际收了多少钱 -> 当前无法理解该问题，请换一种清晰表述后重试。
- 财务风控 / query / 指标查询失败：帮我报一下本月实到账 -> 未找到可执行的已发布能力，请补充业务对象、指标或时间范围。
- 财务风控 / query / 模型供应商不可用：截至现在本月净收款是多少 -> 当前无法理解该问题，请换一种清晰表述后重试。
- 财务风控 / query / 指标查询失败：七月份真实进账给我一个数 -> 未找到可执行的已发布能力，请补充业务对象、指标或时间范围。
- 财务风控 / query / 模型供应商不可用：本月扣除无效订单后收款合计 -> 当前无法理解该问题，请换一种清晰表述后重试。
- 库存采购 / ranking / 模型供应商不可用：最近卖得最好的商品依次是什么 -> 当前无法理解该问题，请换一种清晰表述后重试。
- 库存采购 / ranking / 意图未覆盖：按销售件数把产品从高到低列出来 -> 请补充业务对象、指标或时间范围。
- 财务风控 / comparison / 模型供应商不可用：这个月比上个月少收了多少 -> 当前无法理解该问题，请换一种清晰表述后重试。
- 财务风控 / comparison / 模型供应商不可用：本月进账和上月相比变化多少 -> 当前无法理解该问题，请换一种清晰表述后重试。
- 财务风控 / comparison / 模型供应商不可用：收入环比是涨了还是跌了，差额多少 -> 当前无法理解该问题，请换一种清晰表述后重试。
- 财务风控 / comparison / 模型供应商不可用：把七月和六月实收放一起比较 -> 当前无法理解该问题，请换一种清晰表述后重试。
- 财务风控 / comparison / 模型供应商不可用：上月到本月收款增减了几成 -> 当前无法理解该问题，请换一种清晰表述后重试。

## 产品结论与改进建议

1. 当前 Ami Brain 已形成六域 Domain Adapter、Supervisor、模板技能、数据库技能和受控动作预览的真实产品链路，本次真实可用率为 17.4%。
2. 当前剩余缺口集中在未覆盖意图和缺少明确业务实体，不再是关键词误命中或伪指标问题；后续应优先补采购建议、客户精确查询、权益 ROI、员工复购排行和否定纠正能力。
3. 对已识别但未接入真实口径的指标继续保持明确拒答，不使用 0、全量历史或无依据估算替代。
4. 发布门禁继续并行检查真实可用率、假阳性、时间范围、权限/跨店、动作确认、异常率和 SSE 首字延迟。
5. 本报告耗时为完整请求落库耗时；用户感知首字延迟需以 SSE 独立压测记录为准。