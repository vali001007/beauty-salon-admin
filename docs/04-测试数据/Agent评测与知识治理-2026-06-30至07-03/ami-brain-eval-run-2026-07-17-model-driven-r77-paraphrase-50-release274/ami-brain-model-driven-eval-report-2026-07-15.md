# Ami Brain 650题真实请求路径评测报告

生成时间：2026/7/17 03:17:58

## 评测范围

- 产品版本：当前工作区最新版 Ami Brain
- 请求路径：BrainChatService.createConversation + BrainChatService.sendMessage
- 问题来源：D:\AI coding\beauty-salon-admin\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\ami-brain-model-driven-paraphrase-cases.json
- 问题数：50
- 实际记录数：50
- 门店：requestedStoreId=6，runtimeStoreId=6
- 权限来源：active_backend_role_catalog_plus_candidate_minimum_permissions
- 已注册评测角色：finance, inventory, marketing, receptionist, store_manager
- 冻结发布快照：92b727237ba3dda028322b741e75caf51faef21caa0912080e500da1614efdb3 / capabilities=beautician_service_overview, customer_facts, finance_payment_breakdown, finance_risk_overview, front_desk_operations_overview, inventory_operations_overview, inventory_procurement_advice, manager_staff_overview, marketing_customer_segment, marketing_growth_overview, product_sales_ranking, project_service_ranking, reservation_list, store_operations_overview
- 评分口径：同时输出旧口径和新口径。旧口径为“completed 且有 metric citation”；新口径要求意图、指标口径、回答粒度匹配。
- 六层门禁：意图、工具、计划、执行、完成度、答案均为确定性评分；任一层失败即不计入真实可用。

## 总体结论

Ami Brain 当前已经不再是空入口：每题都会创建会话、写入用户消息、创建运行记录、执行安全检查和认知解析，再由语义问数链路返回回答或明确拒答。

本报告的新口径会把“命中指标但答非所问”的样本归为假阳性。排名题、名单题、对比题、文案题不会再因为带了 metric citation 就被计为真实可用。

## 总览

| 指标 | 数值 |
| --- | ---: |
| 总题数 | 50 |
| 可评测题数 | 29 |
| 模型供应商不可用 | 21 |
| 旧口径可用题数 | 6 |
| 旧口径可用率 | 20.7% |
| 新口径真实可用题数 | 7 |
| 新口径真实可用率 | 24.1% |
| 平均耗时 | 14864 ms |
| P95 耗时 | 23629 ms |
| 最大耗时 | 24928 ms |
| 权限绕过数 | 0 |
| 跨门店读取数 | 0 |
| roleHint 绕过数 | 0 |
| 假动作确认数 | 0 |

## 六层评分

| 层级 | 通过数 | 通过率 | 平均分 |
| --- | ---: | ---: | ---: |
| intent | 27 / 29 | 93.1% | 95.4% |
| tool | 16 / 29 | 55.2% | 55.2% |
| plan | 28 / 29 | 96.6% | 98.3% |
| execution | 18 / 29 | 62.1% | 62.1% |
| completion | 7 / 29 | 24.1% | 42.5% |
| answer | 7 / 29 | 24.1% | 24.1% |

## Grounding 分布

| Grounding 类型 | 数量 |
| --- | ---: |
| Metric Query | 0 |
| DB Skill | 7 |
| Template Skill | 0 |
| Preview Action | 0 |
| None | 22 |

## 执行路径分布

| 执行路径 | 数量 |
| --- | ---: |
| model_primary | 28 |
| model_unavailable | 21 |
| exact_contract_fast_path | 1 |

## Adapter 分布

| Adapter | 数量 |
| --- | ---: |
| none | 29 |

## Domain 分布

| Domain | 数量 |
| --- | ---: |
| finance | 13 |
| payment | 12 |
| product | 11 |
| payment_record | 9 |
| customer | 8 |
| order | 5 |
| reservation | 4 |
| marketing | 3 |
| refund | 2 |
| beautician | 1 |
| none | 1 |
| operating_cost | 1 |
| product_order | 1 |
| staff | 1 |

## Capability 分布

| Capability | 数量 |
| --- | ---: |
| none | 22 |
| finance_payment_breakdown | 6 |
| inventory_procurement_advice | 1 |


## 状态分布

| 状态 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 模型供应商不可用 | 21 | 0 | 0.0% | 0 | 0 | 0 | 0 | 21 | 0 |
| 指标查询失败 | 11 | 0 | 0.0% | 11 | 0 | 0 | 0 | 0 | 0 |
| 意图未覆盖 | 11 | 0 | 0.0% | 0 | 11 | 0 | 0 | 0 | 0 |
| 真实可用 | 7 | 7 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |

## 角色分布

| 角色 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 财务风控 | 20 | 6 | 54.5% | 0 | 5 | 0 | 0 | 9 | 0 |
| 库存采购 | 10 | 1 | 11.1% | 6 | 2 | 0 | 0 | 1 | 0 |
| 前台接待 | 10 | 0 | 0.0% | 0 | 1 | 0 | 0 | 9 | 0 |
| 边界/多轮 | 5 | 0 | 0.0% | 1 | 3 | 0 | 0 | 1 | 0 |
| 营销增长 | 5 | 0 | 0.0% | 4 | 0 | 0 | 0 | 1 | 0 |

## 分类分布

| 分类 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| action | 5 | 0 | 0.0% | 0 | 1 | 0 |
| clarify | 5 | 0 | 0.0% | 1 | 3 | 0 |
| comparison | 5 | 0 | 0.0% | 0 | 1 | 0 |
| diagnosis | 5 | 0 | 0.0% | 0 | 0 | 0 |
| draft | 5 | 0 | 0.0% | 4 | 0 | 0 |
| query | 5 | 3 | 60.0% | 0 | 2 | 0 |
| ranking | 5 | 0 | 0.0% | 3 | 2 | 0 |
| recommendation | 5 | 1 | 25.0% | 3 | 0 | 0 |
| trend | 5 | 3 | 60.0% | 0 | 2 | 0 |
| workflow | 5 | 0 | 0.0% | 0 | 0 | 0 |

## Top 问题原因

1. tool:capability_any_of_missing:product_sales_ranking|inventory_operations_overview：5 次
2. execution:brain_status:failed：4 次
3. tool:capability_any_of_missing:finance_payment_breakdown|finance_risk_overview|store_operations_overview：4 次
4. completion:completion_grounding_missing：3 次
5. tool:capability_any_of_missing:inventory_operations_overview|inventory_procurement_advice：3 次
6. intent:intent_mismatch：1 次
7. intent:metric_missing:paid_amount：1 次
8. plan:plan_preview_missing：1 次

## 典型可用样本

- 财务风控 / query / 真实可用：这个月店里实际收了多少钱 -> 本月实收合计：28756.30 元。

数据依据：财务支付方式拆分；业务定义：实收金额。
- 财务风控 / query / 真实可用：帮我报一下本月实到账 -> 本月实收合计：28756.30 元。

数据依据：财务支付方式拆分；业务定义：实收金额。
- 财务风控 / query / 真实可用：本月扣除无效订单后收款合计 -> 本月实收合计：28756.30 元。

数据依据：财务支付方式拆分；业务定义：实收金额。
- 财务风控 / trend / 真实可用：最近三十天每天收入走势 -> 趋势数据：
1. 日期=2026-06-18，实收=8616.00
2. 日期=2026-06-19，实收=0.00
3. 日期=2026-06-20，实收=7086.00
4. 日期=2026-06-21，实收=0.00
5. 日期=20
- 财务风控 / trend / 真实可用：画一下本月进账变化曲线 -> 趋势数据：
1. 日期=2026-07-01，实收=15019.40
2. 日期=2026-07-02，实收=0.00
3. 日期=2026-07-03，实收=0.00
4. 日期=2026-07-04，实收=476.00
5. 日期=20
- 财务风控 / trend / 真实可用：按天展示最近一个月的实收趋势 -> 趋势数据：
1. 日期=2026-06-18，实收=8616.00
2. 日期=2026-06-19，实收=0.00
3. 日期=2026-06-20，实收=7086.00
4. 日期=2026-06-21，实收=0.00
5. 日期=20
- 库存采购 / recommendation / 真实可用：结合消耗速度给个补货建议 -> 库存采购建议：共 1 项。
1. 玻尿酸保湿精华：当前库存 131，安全库存 143，建议采购 155，候选供应商 Ami MVP 供应商

数据依据：库存采购建议分析。

## 典型问题样本

- 财务风控 / query / 意图未覆盖：截至现在本月净收款是多少 -> 请补充业务对象、指标或时间范围。
- 财务风控 / query / 意图未覆盖：七月份真实进账给我一个数 -> 请补充业务对象、指标或时间范围。
- 库存采购 / ranking / 指标查询失败：本月哪些货卖得最靠前 -> 未找到可执行的已发布能力，请补充业务对象、指标或时间范围。
- 库存采购 / ranking / 意图未覆盖：给商品销量排个前十 -> 请补充业务对象、指标或时间范围。
- 库存采购 / ranking / 指标查询失败：哪几款产品这个月出货最多 -> 未找到可执行的已发布能力，请补充业务对象、指标或时间范围。
- 库存采购 / ranking / 指标查询失败：最近卖得最好的商品依次是什么 -> 未找到可执行的已发布能力，请补充业务对象、指标或时间范围。
- 库存采购 / ranking / 意图未覆盖：按销售件数把产品从高到低列出来 -> 请补充业务对象、指标或时间范围。
- 财务风控 / comparison / 模型供应商不可用：这个月比上个月少收了多少 -> 当前无法理解该问题，请换一种清晰表述后重试。
- 财务风控 / comparison / 模型供应商不可用：本月进账和上月相比变化多少 -> 当前无法理解该问题，请换一种清晰表述后重试。
- 财务风控 / comparison / 意图未覆盖：收入环比是涨了还是跌了，差额多少 -> 请补充业务对象、指标或时间范围。
- 财务风控 / comparison / 模型供应商不可用：把七月和六月实收放一起比较 -> 模型服务鉴权配置无效，本次未执行查询，请联系管理员修复模型配置。
- 财务风控 / comparison / 模型供应商不可用：上月到本月收款增减了几成 -> 当前无法理解该问题，请换一种清晰表述后重试。

## 产品结论与改进建议

1. 当前 Ami Brain 已形成六域 Domain Adapter、Supervisor、模板技能、数据库技能和受控动作预览的真实产品链路，本次真实可用率为 24.1%。
2. 当前剩余缺口集中在未覆盖意图和缺少明确业务实体，不再是关键词误命中或伪指标问题；后续应优先补采购建议、客户精确查询、权益 ROI、员工复购排行和否定纠正能力。
3. 对已识别但未接入真实口径的指标继续保持明确拒答，不使用 0、全量历史或无依据估算替代。
4. 发布门禁继续并行检查真实可用率、假阳性、时间范围、权限/跨店、动作确认、异常率和 SSE 首字延迟。
5. 本报告耗时为完整请求落库耗时；用户感知首字延迟需以 SSE 独立压测记录为准。