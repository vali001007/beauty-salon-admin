# Ami Brain 650题真实请求路径评测报告

生成时间：2026/7/17 05:14:18

## 评测范围

- 产品版本：当前工作区最新版 Ami Brain
- 请求路径：BrainChatService.createConversation + BrainChatService.sendMessage
- 问题来源：D:\AI coding\beauty-salon-admin\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\ami-brain-model-driven-paraphrase-cases.json
- 问题数：50
- 实际记录数：50
- 门店：requestedStoreId=6，runtimeStoreId=6
- 权限来源：active_backend_role_catalog_plus_candidate_minimum_permissions
- 已注册评测角色：finance, inventory, marketing, receptionist, store_manager
- 冻结发布快照：a7c3cc0aa52511f8150bc94f36c67fdb12eaf42c2d70db8e1c220085b1600841 / capabilities=beautician_service_overview, customer_facts, finance_payment_breakdown, finance_risk_overview, front_desk_operations_overview, inventory_operations_overview, inventory_procurement_advice, manager_staff_overview, marketing_customer_segment, marketing_growth_overview, product_sales_ranking, project_service_ranking, reservation_list, store_operations_overview
- 评分口径：同时输出旧口径和新口径。旧口径为“completed 且有 metric citation”；新口径要求意图、指标口径、回答粒度匹配。
- 六层门禁：意图、工具、计划、执行、完成度、答案均为确定性评分；任一层失败即不计入真实可用。

## 总体结论

Ami Brain 当前已经不再是空入口：每题都会创建会话、写入用户消息、创建运行记录、执行安全检查和认知解析，再由语义问数链路返回回答或明确拒答。

本报告的新口径会把“命中指标但答非所问”的样本归为假阳性。排名题、名单题、对比题、文案题不会再因为带了 metric citation 就被计为真实可用。

## 总览

| 指标 | 数值 |
| --- | ---: |
| 总题数 | 50 |
| 可评测题数 | 47 |
| 模型供应商不可用 | 3 |
| 旧口径可用题数 | 15 |
| 旧口径可用率 | 31.9% |
| 新口径真实可用题数 | 19 |
| 新口径真实可用率 | 40.4% |
| 平均耗时 | 12355 ms |
| P95 耗时 | 22761 ms |
| 最大耗时 | 28229 ms |
| 权限绕过数 | 0 |
| 跨门店读取数 | 0 |
| roleHint 绕过数 | 0 |
| 假动作确认数 | 0 |

## 六层评分

| 层级 | 通过数 | 通过率 | 平均分 |
| --- | ---: | ---: | ---: |
| intent | 45 / 47 | 95.7% | 95.7% |
| tool | 37 / 47 | 78.7% | 78.7% |
| plan | 42 / 47 | 89.4% | 94.7% |
| execution | 35 / 47 | 74.5% | 74.5% |
| completion | 20 / 47 | 42.6% | 59.6% |
| answer | 19 / 47 | 40.4% | 40.4% |

## Grounding 分布

| Grounding 类型 | 数量 |
| --- | ---: |
| Metric Query | 2 |
| DB Skill | 19 |
| Template Skill | 0 |
| Preview Action | 0 |
| None | 26 |

## 执行路径分布

| 执行路径 | 数量 |
| --- | ---: |
| model_primary | 45 |
| exact_contract_fast_path | 5 |

## Adapter 分布

| Adapter | 数量 |
| --- | ---: |
| none | 47 |

## Domain 分布

| Domain | 数量 |
| --- | ---: |
| finance | 21 |
| payment | 21 |
| customer | 16 |
| payment_record | 12 |
| product | 12 |
| reservation | 11 |
| order | 8 |
| refund | 7 |
| marketing | 5 |
| operating_cost | 5 |
| project | 3 |
| beautician | 1 |
| none | 1 |

## Capability 分布

| Capability | 数量 |
| --- | ---: |
| none | 26 |
| finance_payment_breakdown | 13 |
| finance_risk_overview | 4 |
| product_sales_ranking | 2 |
| customer_facts | 1 |
| front_desk_operations_overview | 1 |
| inventory_operations_overview | 1 |
| inventory_procurement_advice | 1 |


## 状态分布

| 状态 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 真实可用 | 19 | 19 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 意图未覆盖 | 15 | 0 | 0.0% | 0 | 15 | 0 | 0 | 0 | 0 |
| 指标查询失败 | 12 | 0 | 0.0% | 12 | 0 | 0 | 0 | 0 | 0 |
| 模型供应商不可用 | 3 | 0 | 0.0% | 0 | 0 | 0 | 0 | 3 | 0 |
| 假阳性-粒度错配 | 1 | 0 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 |

## 角色分布

| 角色 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 财务风控 | 20 | 16 | 80.0% | 2 | 1 | 0 | 0 | 0 | 0 |
| 库存采购 | 10 | 3 | 30.0% | 4 | 3 | 0 | 0 | 0 | 0 |
| 前台接待 | 10 | 0 | 0.0% | 1 | 6 | 0 | 0 | 3 | 0 |
| 边界/多轮 | 5 | 0 | 0.0% | 1 | 4 | 0 | 0 | 0 | 0 |
| 营销增长 | 5 | 0 | 0.0% | 4 | 1 | 0 | 0 | 0 | 0 |

## 分类分布

| 分类 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| action | 5 | 0 | 0.0% | 0 | 5 | 0 |
| clarify | 5 | 0 | 0.0% | 1 | 4 | 0 |
| comparison | 5 | 5 | 100.0% | 0 | 0 | 0 |
| diagnosis | 5 | 3 | 60.0% | 2 | 0 | 0 |
| draft | 5 | 0 | 0.0% | 4 | 1 | 0 |
| query | 5 | 4 | 80.0% | 0 | 0 | 0 |
| ranking | 5 | 2 | 40.0% | 0 | 3 | 0 |
| recommendation | 5 | 1 | 20.0% | 4 | 0 | 0 |
| trend | 5 | 4 | 80.0% | 0 | 1 | 0 |
| workflow | 5 | 0 | 0.0% | 1 | 1 | 0 |

## Top 问题原因

1. completion:completion_grounding_missing：6 次
2. execution:brain_status:failed：4 次
3. plan:plan_preview_missing：4 次
4. tool:capability_any_of_missing:inventory_operations_overview|inventory_procurement_advice：4 次
5. tool:capability_any_of_missing:product_sales_ranking|inventory_operations_overview：3 次
6. intent:intent_mismatch：2 次
7. tool:capability_any_of_missing:customer_facts|finance_risk_overview：2 次
8. answer:false_positive_granularity_mismatch：1 次
9. execution:execution_status:rejected：1 次
10. tool:capability_any_of_missing:finance_payment_breakdown|finance_risk_overview|store_operations_overview：1 次

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
- 库存采购 / ranking / 真实可用：哪几款产品这个月出货最多 -> 排行：
1. 商品=抗衰紧致眼霜，销量=18
2. 商品=烟酰胺亮肤精华，销量=11
3. 商品=氨基酸洁面乳，销量=11
4. 商品=玻尿酸保湿精华，销量=3
5. 商品=水氧护理耗材包，销量=1
6. 商品=舒缓修护面膜，销量=1
7.
- 财务风控 / comparison / 真实可用：这个月比上个月少收了多少 -> 对比：实收金额，当前 本月 28756.30 元，上一期 上月 127761.01 元，变化 -99004.71 元（-77.5%）。

数据依据：财务支付方式拆分；业务定义：实收金额。
- 财务风控 / comparison / 真实可用：本月进账和上月相比变化多少 -> 对比：实收金额，当前 本月 28756.30 元，上一期 上月 127761.01 元，变化 -99004.71 元（-77.5%）。

数据依据：财务支付方式拆分；业务定义：实收金额。

## 典型问题样本

- 财务风控 / query / 假阳性-粒度错配：截至现在本月净收款是多少 -> 实收：0.00 元；退款：0.00 元（0 笔）；优惠：0.00 元；毛利：0.00 元；毛利率：暂无结算口径；会员卡负债：1067817.81 元。

排行：当前时间范围没有可排行的数据。

趋势数据：
1. 日期=2026-07-17，
- 库存采购 / ranking / 意图未覆盖：给商品销量排个前十 -> 请补充业务对象、指标或时间范围。
- 库存采购 / ranking / 意图未覆盖：最近卖得最好的商品依次是什么 -> 请补充业务对象、指标或时间范围。
- 库存采购 / ranking / 意图未覆盖：按销售件数把产品从高到低列出来 -> 请补充业务对象、指标或时间范围。
- 财务风控 / trend / 意图未覆盖：七月份营业额每天是怎么走的 -> 请补充业务对象、指标或时间范围。
- 财务风控 / diagnosis / 指标查询失败：帮我拆解这段时间利润率变差的问题 -> 未找到可执行的已发布能力，请补充业务对象、指标或时间范围。
- 财务风控 / diagnosis / 指标查询失败：给我定位本月盈利能力下降的根因 -> 未找到可执行的已发布能力，请补充业务对象、指标或时间范围。
- 库存采购 / recommendation / 指标查询失败：库存不足的商品下一步怎么补最合理 -> 未找到可执行的已发布能力，请补充业务对象、指标或时间范围。
- 库存采购 / recommendation / 指标查询失败：结合消耗速度给个补货建议 -> 未找到可执行的已发布能力，请补充业务对象、指标或时间范围。
- 库存采购 / recommendation / 指标查询失败：哪些货该先采购，数量怎么定 -> 未找到可执行的已发布能力，请补充业务对象、指标或时间范围。
- 库存采购 / recommendation / 指标查询失败：根据安全库存和近期销量推荐采购清单 -> 未找到可执行的已发布能力，请补充业务对象、指标或时间范围。
- 营销增长 / draft / 指标查询失败：写一条提醒老客户预约护理的消息 -> 未找到可执行的已发布能力，请补充业务对象、指标或时间范围。

## 产品结论与改进建议

1. 当前 Ami Brain 已形成六域 Domain Adapter、Supervisor、模板技能、数据库技能和受控动作预览的真实产品链路，本次真实可用率为 40.4%。
2. 当前剩余缺口集中在未覆盖意图和缺少明确业务实体，不再是关键词误命中或伪指标问题；后续应优先补采购建议、客户精确查询、权益 ROI、员工复购排行和否定纠正能力。
3. 对已识别但未接入真实口径的指标继续保持明确拒答，不使用 0、全量历史或无依据估算替代。
4. 发布门禁继续并行检查真实可用率、假阳性、时间范围、权限/跨店、动作确认、异常率和 SSE 首字延迟。
5. 本报告耗时为完整请求落库耗时；用户感知首字延迟需以 SSE 独立压测记录为准。