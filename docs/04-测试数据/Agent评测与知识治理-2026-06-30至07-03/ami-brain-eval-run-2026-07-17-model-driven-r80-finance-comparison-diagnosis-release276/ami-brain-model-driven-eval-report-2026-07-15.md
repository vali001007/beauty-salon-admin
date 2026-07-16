# Ami Brain 650题真实请求路径评测报告

生成时间：2026/7/17 03:56:46

## 评测范围

- 产品版本：当前工作区最新版 Ami Brain
- 请求路径：BrainChatService.createConversation + BrainChatService.sendMessage
- 问题来源：D:\AI coding\beauty-salon-admin\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\ami-brain-model-driven-paraphrase-cases.json
- 问题数：10
- 实际记录数：10
- 门店：requestedStoreId=6，runtimeStoreId=6
- 权限来源：active_backend_role_catalog_plus_candidate_minimum_permissions
- 已注册评测角色：finance
- 冻结发布快照：4ee98661b48bc9bfa87e9eed2845f8c4eff1da01d92c5a367e6c90ed45455732 / capabilities=beautician_service_overview, customer_facts, finance_payment_breakdown, finance_risk_overview, front_desk_operations_overview, inventory_operations_overview, inventory_procurement_advice, manager_staff_overview, marketing_customer_segment, marketing_growth_overview, product_sales_ranking, project_service_ranking, reservation_list, store_operations_overview
- 评分口径：同时输出旧口径和新口径。旧口径为“completed 且有 metric citation”；新口径要求意图、指标口径、回答粒度匹配。
- 六层门禁：意图、工具、计划、执行、完成度、答案均为确定性评分；任一层失败即不计入真实可用。

## 总体结论

Ami Brain 当前已经不再是空入口：每题都会创建会话、写入用户消息、创建运行记录、执行安全检查和认知解析，再由语义问数链路返回回答或明确拒答。

本报告的新口径会把“命中指标但答非所问”的样本归为假阳性。排名题、名单题、对比题、文案题不会再因为带了 metric citation 就被计为真实可用。

## 总览

| 指标 | 数值 |
| --- | ---: |
| 总题数 | 10 |
| 可评测题数 | 7 |
| 模型供应商不可用 | 3 |
| 旧口径可用题数 | 2 |
| 旧口径可用率 | 28.6% |
| 新口径真实可用题数 | 3 |
| 新口径真实可用率 | 42.9% |
| 平均耗时 | 4796 ms |
| P95 耗时 | 10007 ms |
| 最大耗时 | 10007 ms |
| 权限绕过数 | 0 |
| 跨门店读取数 | 0 |
| roleHint 绕过数 | 0 |
| 假动作确认数 | 0 |

## 六层评分

| 层级 | 通过数 | 通过率 | 平均分 |
| --- | ---: | ---: | ---: |
| intent | 5 / 7 | 71.4% | 90.5% |
| tool | 5 / 7 | 71.4% | 71.4% |
| plan | 7 / 7 | 100.0% | 100.0% |
| execution | 5 / 7 | 71.4% | 71.4% |
| completion | 5 / 7 | 71.4% | 71.4% |
| answer | 5 / 7 | 71.4% | 71.4% |

## Grounding 分布

| Grounding 类型 | 数量 |
| --- | ---: |
| Metric Query | 0 |
| DB Skill | 5 |
| Template Skill | 0 |
| Preview Action | 0 |
| None | 2 |

## 执行路径分布

| 执行路径 | 数量 |
| --- | ---: |
| exact_contract_fast_path | 4 |
| model_primary | 4 |
| model_unavailable | 2 |

## Adapter 分布

| Adapter | 数量 |
| --- | ---: |
| none | 7 |

## Domain 分布

| Domain | 数量 |
| --- | ---: |
| finance | 7 |
| payment | 7 |
| operating_cost | 5 |
| refund | 5 |
| product | 1 |
| project | 1 |

## Capability 分布

| Capability | 数量 |
| --- | ---: |
| finance_risk_overview | 3 |
| finance_payment_breakdown | 2 |
| none | 2 |


## 状态分布

| 状态 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 模型供应商不可用 | 3 | 0 | 0.0% | 0 | 0 | 0 | 0 | 3 | 0 |
| 真实可用 | 3 | 3 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 假阳性-意图错配 | 2 | 0 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 指标查询失败 | 2 | 0 | 0.0% | 2 | 0 | 0 | 0 | 0 | 0 |

## 角色分布

| 角色 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 财务风控 | 10 | 3 | 42.9% | 2 | 0 | 0 | 0 | 3 | 0 |

## 分类分布

| 分类 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| comparison | 5 | 0 | 0.0% | 0 | 0 | 0 |
| diagnosis | 5 | 3 | 60.0% | 2 | 0 | 0 |

## Top 问题原因

1. intent:intent_mismatch：2 次
2. tool:capability_any_of_missing:customer_facts|finance_risk_overview：2 次

## 典型可用样本

- 财务风控 / diagnosis / 真实可用：最近毛利掉下来的主要原因是什么 -> 实收：120885.31 元；退款：4299.00 元（5 笔）；优惠：4357.69 元；毛利：78804.36 元；毛利率：71.7%；会员卡负债：1067817.81 元。

排行：
1. 支付方式=wechat，金额=75057.6
- 财务风控 / diagnosis / 真实可用：为什么最近做得不少却不赚钱 -> 实收：120885.31 元；退款：4299.00 元（5 笔）；优惠：4357.69 元；毛利：78804.36 元；毛利率：71.7%；会员卡负债：1067817.81 元。

排行：
1. 支付方式=wechat，金额=75057.6
- 财务风控 / diagnosis / 真实可用：给我定位本月盈利能力下降的根因 -> 实收：28756.30 元；退款：1419.00 元（4 笔）；优惠：1674.70 元；毛利：16154.94 元；毛利率：59.5%；会员卡负债：1067817.81 元。

排行：
1. 支付方式=wechat，金额=15086.10

## 典型问题样本

- 财务风控 / comparison / 假阳性-意图错配：这个月比上个月少收了多少 -> 排行：
1. 支付方式=微信，金额=15086.10，笔数=26
2. 支付方式=储值余额，金额=7625.00，笔数=10
3. 支付方式=支付宝，金额=6044.20，笔数=4
4. 支付方式=现金，金额=1.00，笔数=1

数据依据
- 财务风控 / comparison / 模型供应商不可用：本月进账和上月相比变化多少 -> 模型服务暂不可用，本次未执行查询，请稍后重试。
- 财务风控 / comparison / 假阳性-意图错配：收入环比是涨了还是跌了，差额多少 -> 排行：
1. 支付方式=微信，金额=15086.10，笔数=26
2. 支付方式=储值余额，金额=7625.00，笔数=10
3. 支付方式=支付宝，金额=6044.20，笔数=4
4. 支付方式=现金，金额=1.00，笔数=1

数据依据
- 财务风控 / comparison / 模型供应商不可用：把七月和六月实收放一起比较 -> 当前无法理解该问题，请换一种清晰表述后重试。
- 财务风控 / comparison / 模型供应商不可用：上月到本月收款增减了几成 -> 当前无法理解该问题，请换一种清晰表述后重试。
- 财务风控 / diagnosis / 指标查询失败：帮我拆解这段时间利润率变差的问题 -> 未找到可执行的已发布能力，请补充业务对象、指标或时间范围。
- 财务风控 / diagnosis / 指标查询失败：查一下毛利异常是折扣、成本还是项目结构造成的 -> 当前已发布能力缺少该问题需要的业务对象或分析维度，本次不执行泛化查询。

## 产品结论与改进建议

1. 当前 Ami Brain 已形成六域 Domain Adapter、Supervisor、模板技能、数据库技能和受控动作预览的真实产品链路，本次真实可用率为 42.9%。
2. 当前剩余缺口集中在未覆盖意图和缺少明确业务实体，不再是关键词误命中或伪指标问题；后续应优先补采购建议、客户精确查询、权益 ROI、员工复购排行和否定纠正能力。
3. 对已识别但未接入真实口径的指标继续保持明确拒答，不使用 0、全量历史或无依据估算替代。
4. 发布门禁继续并行检查真实可用率、假阳性、时间范围、权限/跨店、动作确认、异常率和 SSE 首字延迟。
5. 本报告耗时为完整请求落库耗时；用户感知首字延迟需以 SSE 独立压测记录为准。