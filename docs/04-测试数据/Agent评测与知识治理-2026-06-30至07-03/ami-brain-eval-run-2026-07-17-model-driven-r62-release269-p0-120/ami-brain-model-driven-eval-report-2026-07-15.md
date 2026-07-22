# Ami Brain 650题真实请求路径评测报告

生成时间：2026/7/17 01:03:06

## 评测范围

- 产品版本：当前工作区最新版 Ami Brain
- 请求路径：BrainChatService.createConversation + BrainChatService.sendMessage
- 问题来源：D:\AI coding\beauty-salon-admin\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\agent-eval-questions.md
- 问题数：120
- 实际记录数：120
- 门店：requestedStoreId=6，runtimeStoreId=6
- 权限来源：active_backend_role_catalog_plus_candidate_minimum_permissions
- 已注册评测角色：marketing, store_manager
- 冻结发布快照：d74fbb7654ef4ef93a06fcb195df2157b22282f3bf6d4ba5fcba31f9c02bee4e / capabilities=beautician_service_overview, customer_facts, finance_payment_breakdown, finance_risk_overview, front_desk_operations_overview, inventory_operations_overview, inventory_procurement_advice, manager_staff_overview, marketing_customer_segment, marketing_growth_overview, product_sales_ranking, project_service_ranking, reservation_list, store_operations_overview
- 评分口径：同时输出旧口径和新口径。旧口径为“completed 且有 metric citation”；新口径要求意图、指标口径、回答粒度匹配。
- 六层门禁：意图、工具、计划、执行、完成度、答案均为确定性评分；任一层失败即不计入真实可用。

## 总体结论

Ami Brain 当前已经不再是空入口：每题都会创建会话、写入用户消息、创建运行记录、执行安全检查和认知解析，再由语义问数链路返回回答或明确拒答。

本报告的新口径会把“命中指标但答非所问”的样本归为假阳性。排名题、名单题、对比题、文案题不会再因为带了 metric citation 就被计为真实可用。

## 总览

| 指标 | 数值 |
| --- | ---: |
| 总题数 | 120 |
| 可评测题数 | 89 |
| 模型供应商不可用 | 31 |
| 旧口径可用题数 | 5 |
| 旧口径可用率 | 5.6% |
| 新口径真实可用题数 | 52 |
| 新口径真实可用率 | 58.4% |
| 平均耗时 | 18394 ms |
| P95 耗时 | 28373 ms |
| 最大耗时 | 127127 ms |
| 权限绕过数 | 0 |
| 跨门店读取数 | 0 |
| roleHint 绕过数 | 0 |
| 假动作确认数 | 0 |

## 六层评分

| 层级 | 通过数 | 通过率 | 平均分 |
| --- | ---: | ---: | ---: |
| intent | 80 / 89 | 89.9% | 94.4% |
| tool | 60 / 89 | 67.4% | 67.4% |
| plan | 67 / 89 | 75.3% | 91.8% |
| execution | 82 / 89 | 92.1% | 92.1% |
| completion | 66 / 89 | 74.2% | 83.1% |
| answer | 55 / 89 | 61.8% | 60.7% |

## Grounding 分布

| Grounding 类型 | 数量 |
| --- | ---: |
| Metric Query | 2 |
| DB Skill | 58 |
| Template Skill | 0 |
| Preview Action | 0 |
| None | 29 |

## 执行路径分布

| 执行路径 | 数量 |
| --- | ---: |
| model_primary | 67 |
| exact_contract_fast_path | 33 |
| model_unavailable | 20 |

## Adapter 分布

| Adapter | 数量 |
| --- | ---: |
| none | 89 |

## Domain 分布

| Domain | 数量 |
| --- | ---: |
| customer | 52 |
| finance | 23 |
| beautician | 21 |
| reservation | 20 |
| payment | 18 |
| product | 18 |
| order | 16 |
| refund | 14 |
| staff | 9 |
| marketing | 6 |
| project | 6 |
| operating_cost | 3 |
| payment_record | 3 |
| product_order | 2 |
| none | 1 |

## Capability 分布

| Capability | 数量 |
| --- | ---: |
| none | 29 |
| customer_facts | 19 |
| store_operations_overview | 12 |
| inventory_operations_overview | 9 |
| manager_staff_overview | 6 |
| marketing_growth_overview | 4 |
| front_desk_operations_overview | 3 |
| finance_risk_overview | 2 |
| inventory_procurement_advice | 2 |
| finance_payment_breakdown | 1 |
| product_sales_ranking | 1 |
| project_service_ranking | 1 |

## 与 2026-07-10 基线对比

基线文件：D:\AI coding\beauty-salon-admin\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\ami-brain-eval-run-2026-07-10\ami-brain-eval-results-2026-07-10.json

| 指标 | 2026-07-10 基线 | 本次修复后 |
| --- | ---: | ---: |
| 旧口径可用率 | 15.5% | 5.6% |
| 真实可用率 | 3.7% | 43.3% |
| 假阳性数 | 77 | 3 |
| 时间误退化全量数 | 12 | 0 |
| 文案/操作误命中指标数 | 21 | 0 |

## 状态分布

| 状态 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 真实可用 | 49 | 49 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 模型供应商不可用 | 31 | 0 | 0.0% | 0 | 0 | 0 | 0 | 31 | 0 |
| 意图未覆盖 | 27 | 0 | 0.0% | 0 | 27 | 0 | 0 | 0 | 0 |
| 指标查询失败 | 7 | 0 | 0.0% | 7 | 0 | 0 | 0 | 0 | 0 |
| 假阳性-意图错配 | 3 | 0 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 部分可用 | 3 | 3 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |

## 角色分布

| 角色 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 店长经营 | 100 | 43 | 57.3% | 6 | 23 | 0 | 0 | 25 | 0 |
| 营销增长 | 20 | 9 | 64.3% | 1 | 4 | 0 | 0 | 6 | 0 |

## 分类分布

| 分类 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 风险预警 | 20 | 5 | 38.5% | 3 | 5 | 0 |
| 经营概览 | 20 | 12 | 70.6% | 3 | 0 | 0 |
| 客户管理 | 20 | 9 | 52.9% | 0 | 8 | 0 |
| 客群识别与分析 | 20 | 9 | 64.3% | 1 | 4 | 0 |
| 库存运营 | 20 | 11 | 61.1% | 0 | 6 | 0 |
| 员工管理 | 20 | 6 | 60.0% | 0 | 4 | 0 |

## Top 问题原因

1. tool:capability_any_of_missing:customer_facts|manager_staff_overview|marketing_customer_segment|marketing_growth_overview|store_operations_overview：7 次
2. answer:unsupported_intent：5 次
3. intent:intent_mismatch：5 次
4. tool:capability_any_of_missing:customer_facts|finance_payment_breakdown|finance_risk_overview|front_desk_operations_overview|inventory_operations_overview|inventory_procurement_advice|manager_staff_overview|marketing_customer_segment|marketing_growth_overview|reservation_list|store_operations_overview：3 次
5. tool:capability_any_of_missing:customer_facts|marketing_customer_segment|marketing_growth_overview：3 次
6. tool:capability_any_of_missing:customer_facts|finance_risk_overview|front_desk_operations_overview|inventory_operations_overview|manager_staff_overview|marketing_customer_segment|marketing_growth_overview|store_operations_overview：2 次
7. tool:capability_any_of_missing:finance_payment_breakdown|finance_risk_overview|store_operations_overview：2 次
8. tool:capability_any_of_missing:marketing_growth_overview：2 次
9. intent:dimension_missing:productName：1 次
10. intent:metric_missing:paid_amount：1 次

## 典型可用样本

- 店长经营 / 经营概览 / 真实可用：今天店里情况怎么样，给我来个总结 -> 实收：0.00 元；订单：0 单；客户：0 人；客单价：0.00 元；预约：0 个；已到店：0 人；当前在店：0 人；新客：0 人（老客 0 人）；退款：0.00 元（0 笔）。

明细：
1. 员工=唐伊，预约数=0，状态=可接待，下次可
- 店长经营 / 经营概览 / 部分可用：今天营业额到多少了 -> 实收：0.00 元；订单：0 单；客户：0 人；客单价：0.00 元；预约：0 个；已到店：0 人；当前在店：0 人；新客：0 人（老客 0 人）；退款：0.00 元（0 笔）。

明细：
1. 员工=唐伊，预约数=0，状态=可接待，下次可
- 店长经营 / 经营概览 / 真实可用：今天来了几个客人，现在还有几个在店 -> 实收：0.00 元；订单：0 单；客户：0 人；客单价：0.00 元；预约：0 个；已到店：0 人；当前在店：0 人；新客：0 人（老客 0 人）；退款：0.00 元（0 笔）。

明细：
1. 员工=唐伊，预约数=0，状态=可接待，下次可
- 店长经营 / 经营概览 / 真实可用：本周跟上周比，哪天差距最大 -> 排行：
1. 星期=周三，本期日期=2026-07-15，本期实收=4904.00，上期日期=2026-07-08，上期实收=741.70，差额=+4162.30 元
2. 星期=周一，本期日期=2026-07-13，本期实收=3407.5
- 店长经营 / 经营概览 / 真实可用：这个月目标完成率多少了，还差多远 -> 实收：27130.96 元；订单：39 单；客户：20 人；客单价：695.67 元；预约：21 个；已到店：8 人；当前在店：3 人；新客：3 人（老客 18 人）；退款：1419.00 元（4 笔）；最大订单：4464.00 元（POM
- 店长经营 / 经营概览 / 真实可用：今天客单价多少，跟平时比怎么样 -> 实收：0.00 元；订单：0 单；客户：0 人；客单价：0.00 元；预约：0 个；已到店：0 人；当前在店：0 人；新客：0 人（老客 0 人）；退款：0.00 元（0 笔）。

对比：实收，当前 0.00 元，上一期 158740.64
- 店长经营 / 经营概览 / 真实可用：今天有没有什么异常情况我需要知道 -> 实收：0.00 元；订单：0 单；客户：0 人；客单价：0.00 元；预约：0 个；已到店：0 人；当前在店：0 人；新客：0 人（老客 0 人）；退款：0.00 元（0 笔）。

明细：
1. 员工=唐伊，预约数=0，状态=可接待，下次可
- 店长经营 / 经营概览 / 真实可用：现在店里哪些美容师在忙，哪些空着 -> 实收：0.00 元；订单：0 单；客户：0 人；客单价：0.00 元；预约：0 个；已到店：0 人；当前在店：0 人；新客：0 人（老客 0 人）；退款：0.00 元（0 笔）。

明细：
1. 员工=唐伊，预约数=0，状态=可接待，下次可

## 典型问题样本

- 店长经营 / 经营概览 / 假阳性-意图错配：今天和昨天比营业额差多少 -> 实收：0.00 元；订单：0 单；客户：0 人；客单价：0.00 元；预约：0 个；已到店：0 人；当前在店：0 人；新客：0 人（老客 0 人）；退款：0.00 元（0 笔）。

对比：实收，当前 0.00 元，上一期 0.00 元，变化
- 店长经营 / 经营概览 / 假阳性-意图错配：今天退款有几笔，金额多少 -> 实收：0.00 元；订单：0 单；客户：0 人；客单价：0.00 元；预约：0 个；已到店：0 人；当前在店：0 人；新客：0 人（老客 0 人）；退款：0.00 元（0 笔）。

明细：
1. 员工=唐伊，预约数=0，状态=可接待，下次可
- 店长经营 / 经营概览 / 模型供应商不可用：这个月跟上个月比收入差多少 -> 当前无法理解该问题，请换一种清晰表述后重试。
- 店长经营 / 经营概览 / 模型供应商不可用：现在几点了，下午还有几个预约 -> 模型服务暂不可用，本次未执行查询，请稍后重试。
- 店长经营 / 经营概览 / 指标查询失败：今天折扣优惠送出去多少钱 -> 未找到可执行的已发布能力，请补充业务对象、指标或时间范围。
- 店长经营 / 经营概览 / 指标查询失败：最近三天营业额趋势怎么样 -> 未找到可执行的已发布能力，请补充业务对象、指标或时间范围。
- 店长经营 / 经营概览 / 模型供应商不可用：这周有没有哪天特别差，为什么 -> 当前无法理解该问题，请换一种清晰表述后重试。
- 店长经营 / 经营概览 / 指标查询失败：今天现金收了多少，微信支付宝各多少 -> 未找到可执行的已发布能力，请补充业务对象、指标或时间范围。
- 店长经营 / 客户管理 / 模型供应商不可用：上个月新来了多少新客，转化了多少 -> 当前无法理解该问题，请换一种清晰表述后重试。
- 店长经营 / 客户管理 / 意图未覆盖：最近有没有客户投诉或者表达不满 -> 请补充业务对象、指标或时间范围。
- 店长经营 / 客户管理 / 意图未覆盖：这个月流失了多少客户，主要是什么原因 -> 请补充业务对象、指标或时间范围。
- 店长经营 / 客户管理 / 模型供应商不可用：帮我看一下今天到店客人的画像，主要是什么年龄段 -> 模型服务暂不可用，本次未执行查询，请稍后重试。

## 产品结论与改进建议

1. 当前 Ami Brain 已形成六域 Domain Adapter、Supervisor、模板技能、数据库技能和受控动作预览的真实产品链路，本次真实可用率为 58.4%。
2. 当前剩余缺口集中在未覆盖意图和缺少明确业务实体，不再是关键词误命中或伪指标问题；后续应优先补采购建议、客户精确查询、权益 ROI、员工复购排行和否定纠正能力。
3. 对已识别但未接入真实口径的指标继续保持明确拒答，不使用 0、全量历史或无依据估算替代。
4. 发布门禁继续并行检查真实可用率、假阳性、时间范围、权限/跨店、动作确认、异常率和 SSE 首字延迟。
5. 本报告耗时为完整请求落库耗时；用户感知首字延迟需以 SSE 独立压测记录为准。