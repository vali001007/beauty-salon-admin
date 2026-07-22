# Ami Brain 650题真实请求路径评测报告

生成时间：2026/7/17 08:08:34

## 评测范围

- 产品版本：当前工作区最新版 Ami Brain
- 请求路径：BrainChatService.createConversation + BrainChatService.sendMessage
- 问题来源：D:\AI coding\beauty-salon-admin\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\ami-brain-model-driven-paraphrase-cases.json
- 问题数：50
- 实际记录数：50
- 门店：requestedStoreId=6，runtimeStoreId=6
- 权限来源：active_backend_role_catalog_plus_candidate_minimum_permissions
- 已注册评测角色：finance, inventory, marketing, receptionist, store_manager
- 冻结发布快照：d0322ba6a8ed4d0503344a26a5ee9028dce32ff702bd154b69c2c15d4e31c949 / capabilities=beautician_service_overview, customer_facts, customer_follow_up_draft, finance_payment_breakdown, finance_risk_overview, front_desk_operations_overview, gap_fill_touch_preview, inventory_operations_overview, inventory_procurement_advice, manager_staff_overview, marketing_customer_segment, marketing_growth_overview, marketing_message_draft, marketing_touch_draft, product_sales_ranking, project_service_ranking, reservation_action_preview, reservation_list, store_operations_overview
- 评分口径：同时输出旧口径和新口径。旧口径为“completed 且有 metric citation”；新口径要求意图、指标口径、回答粒度匹配。
- 六层门禁：意图、工具、计划、执行、完成度、答案均为确定性评分；任一层失败即不计入真实可用。

## 总体结论

Ami Brain 当前已经不再是空入口：每题都会创建会话、写入用户消息、创建运行记录、执行安全检查和认知解析，再由语义问数链路返回回答或明确拒答。

本报告的新口径会把“命中指标但答非所问”的样本归为假阳性。排名题、名单题、对比题、文案题不会再因为带了 metric citation 就被计为真实可用。

## 总览

| 指标 | 数值 |
| --- | ---: |
| 总题数 | 50 |
| 可评测题数 | 49 |
| 模型供应商不可用 | 1 |
| 旧口径可用题数 | 19 |
| 旧口径可用率 | 38.8% |
| 新口径真实可用题数 | 37 |
| 新口径真实可用率 | 75.5% |
| 平均耗时 | 10341 ms |
| P95 耗时 | 19718 ms |
| 最大耗时 | 26376 ms |
| 权限绕过数 | 0 |
| 跨门店读取数 | 0 |
| roleHint 绕过数 | 0 |
| 假动作确认数 | 0 |

## 六层评分

| 层级 | 通过数 | 通过率 | 平均分 |
| --- | ---: | ---: | ---: |
| intent | 49 / 49 | 100.0% | 100.0% |
| tool | 48 / 49 | 98.0% | 98.0% |
| plan | 49 / 49 | 100.0% | 100.0% |
| execution | 48 / 49 | 98.0% | 98.0% |
| completion | 38 / 49 | 77.6% | 87.8% |
| answer | 37 / 49 | 75.5% | 75.5% |

## Grounding 分布

| Grounding 类型 | 数量 |
| --- | ---: |
| Metric Query | 5 |
| DB Skill | 28 |
| Template Skill | 5 |
| Preview Action | 0 |
| None | 11 |

## 执行路径分布

| 执行路径 | 数量 |
| --- | ---: |
| model_primary | 45 |
| exact_contract_fast_path | 5 |

## Adapter 分布

| Adapter | 数量 |
| --- | ---: |
| none | 49 |

## Domain 分布

| Domain | 数量 |
| --- | ---: |
| finance | 22 |
| payment | 20 |
| customer | 19 |
| reservation | 17 |
| payment_record | 13 |
| product | 13 |
| order | 7 |
| project | 7 |
| beautician | 6 |
| refund | 6 |
| operating_cost | 5 |
| product_order | 2 |
| staff | 2 |
| marketing | 1 |
| order_item | 1 |

## Capability 分布

| Capability | 数量 |
| --- | ---: |
| finance_payment_breakdown | 14 |
| none | 6 |
| finance_risk_overview | 5 |
| gap_fill_touch_preview | 5 |
| marketing_message_draft | 5 |
| product_sales_ranking | 5 |
| reservation_action_preview | 5 |
| inventory_procurement_advice | 3 |
| inventory_operations_overview | 1 |


## 状态分布

| 状态 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 真实可用 | 37 | 37 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 意图未覆盖 | 8 | 0 | 0.0% | 0 | 8 | 0 | 0 | 0 | 0 |
| 会话/门店不存在 | 2 | 0 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 假阳性-粒度错配 | 1 | 0 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 指标查询失败 | 1 | 0 | 0.0% | 1 | 0 | 0 | 0 | 0 | 0 |
| 模型供应商不可用 | 1 | 0 | 0.0% | 0 | 0 | 0 | 0 | 1 | 0 |

## 角色分布

| 角色 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 财务风控 | 20 | 18 | 94.7% | 0 | 0 | 0 | 0 | 1 | 0 |
| 边界/多轮 | 10 | 5 | 50.0% | 0 | 5 | 0 | 0 | 0 | 0 |
| 库存采购 | 10 | 9 | 90.0% | 1 | 0 | 0 | 0 | 0 | 0 |
| 营销增长 | 5 | 5 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 前台接待 | 5 | 0 | 0.0% | 0 | 3 | 0 | 0 | 0 | 0 |

## 分类分布

| 分类 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| action | 5 | 0 | 0.0% | 0 | 3 | 0 |
| clarify | 5 | 0 | 0.0% | 0 | 5 | 0 |
| comparison | 5 | 5 | 100.0% | 0 | 0 | 0 |
| diagnosis | 5 | 4 | 100.0% | 0 | 0 | 0 |
| draft | 5 | 5 | 100.0% | 0 | 0 | 0 |
| query | 5 | 4 | 80.0% | 0 | 0 | 0 |
| ranking | 5 | 5 | 100.0% | 0 | 0 | 0 |
| recommendation | 5 | 4 | 80.0% | 1 | 0 | 0 |
| trend | 5 | 5 | 100.0% | 0 | 0 | 0 |
| workflow | 5 | 5 | 100.0% | 0 | 0 | 0 |

## Top 问题原因

1. completion:completion_grounding_missing：10 次
2. answer:false_positive_granularity_mismatch：1 次
3. tool:capability_any_of_missing:inventory_operations_overview|inventory_procurement_advice：1 次

## 典型可用样本

- 财务风控 / query / 真实可用：这个月店里实际收了多少钱 -> 本月实收合计：28756.30 元。

数据依据：财务支付方式拆分；业务定义：实收金额。
- 财务风控 / query / 真实可用：帮我报一下本月实到账 -> 本月实收合计：28756.30 元。

数据依据：财务支付方式拆分；业务定义：实收金额。
- 财务风控 / query / 真实可用：七月份真实进账给我一个数 -> 今天实收合计：0.00 元。

数据依据：财务支付方式拆分；业务定义：实收金额。
- 财务风控 / query / 真实可用：本月扣除无效订单后收款合计 -> 本月实收合计：28756.30 元。

数据依据：财务支付方式拆分；业务定义：实收金额。
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
- 库存采购 / ranking / 真实可用：最近卖得最好的商品依次是什么 -> 排行：
1. 商品=抗衰紧致眼霜，销量=26
2. 商品=氨基酸洁面乳，销量=21
3. 商品=玻尿酸保湿精华，销量=16
4. 商品=烟酰胺亮肤精华，销量=13
5. 商品=屏障修护乳，销量=3
6. 商品=水氧护理耗材包，销量=3
7.

## 典型问题样本

- 财务风控 / query / 假阳性-粒度错配：截至现在本月净收款是多少 -> 实收：0.00 元；退款：0.00 元（0 笔）；优惠：0.00 元；毛利：0.00 元；毛利率：暂无结算口径；会员卡负债：1067817.81 元。

排行：当前时间范围没有可排行的数据。

趋势数据：
1. 日期=2026-07-17，
- 财务风控 / diagnosis / 模型供应商不可用：为什么最近做得不少却不赚钱 -> 模型服务暂不可用，本次未执行查询，请稍后重试。
- 库存采购 / recommendation / 指标查询失败：既别断货也别积压，采购应该怎么安排 -> 未找到可执行的已发布能力，请补充业务对象、指标或时间范围。
- 前台接待 / action / 会话/门店不存在：把张女士的预约改到明天下午三点 -> 当前门店没有找到匹配客户，请核对姓名或手机号后四位。
- 前台接待 / action / 会话/门店不存在：帮张女士把明天的护理改约到十五点 -> 当前门店没有找到匹配客户，请核对姓名或手机号后四位。
- 前台接待 / action / 意图未覆盖：预览一下将张女士预约调整到明天下午的操作 -> 请提供客户姓名或手机号后四位后再生成动作预览。
- 前台接待 / action / 意图未覆盖：准备一份张女士预约改期方案，等我确认 -> 请提供客户姓名或手机号后四位后再生成动作预览。
- 前台接待 / action / 意图未覆盖：将张女士下一次预约挪到周五三点，先不要执行 -> 请提供客户姓名或手机号后四位后再生成动作预览。
- 边界/多轮 / clarify / 意图未覆盖：帮我看看这个 -> 请补充业务对象、指标或时间范围。
- 边界/多轮 / clarify / 意图未覆盖：那个情况怎么样 -> 请补充业务对象、指标或时间范围。
- 边界/多轮 / clarify / 意图未覆盖：给我处理一下 -> 请补充业务对象、指标或时间范围。
- 边界/多轮 / clarify / 意图未覆盖：这个数据有问题吗 -> 请补充业务对象、指标或时间范围。

## 产品结论与改进建议

1. 当前 Ami Brain 已形成六域 Domain Adapter、Supervisor、模板技能、数据库技能和受控动作预览的真实产品链路，本次真实可用率为 75.5%。
2. 当前剩余缺口集中在未覆盖意图和缺少明确业务实体，不再是关键词误命中或伪指标问题；后续应优先补采购建议、客户精确查询、权益 ROI、员工复购排行和否定纠正能力。
3. 对已识别但未接入真实口径的指标继续保持明确拒答，不使用 0、全量历史或无依据估算替代。
4. 发布门禁继续并行检查真实可用率、假阳性、时间范围、权限/跨店、动作确认、异常率和 SSE 首字延迟。
5. 本报告耗时为完整请求落库耗时；用户感知首字延迟需以 SSE 独立压测记录为准。