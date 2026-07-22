# Ami Brain 650题真实请求路径评测报告

生成时间：2026/7/16 09:24:45

## 评测范围

- 产品版本：当前工作区最新版 Ami Brain
- 请求路径：BrainChatService.createConversation + BrainChatService.sendMessage
- 问题来源：D:\AI coding\beauty-salon-admin\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\agent-eval-questions.md
- 问题数：120
- 实际记录数：120
- 门店：requestedStoreId=6，runtimeStoreId=6
- 权限来源：active_backend_role_catalog_plus_candidate_minimum_permissions
- 已注册评测角色：marketing, store_manager
- 冻结发布快照：437578798156a471c806eb477c46178276c0c7405b7c95a6ba2839576c10426d / capabilities=beautician_service_overview, customer_facts, finance_payment_breakdown, finance_risk_overview, front_desk_operations_overview, inventory_operations_overview, inventory_procurement_advice, manager_staff_overview, marketing_customer_segment, marketing_growth_overview, reservation_list, store_operations_overview
- 评分口径：同时输出旧口径和新口径。旧口径为“completed 且有 metric citation”；新口径要求意图、指标口径、回答粒度匹配。
- 六层门禁：意图、工具、计划、执行、完成度、答案均为确定性评分；任一层失败即不计入真实可用。

## 总体结论

Ami Brain 当前已经不再是空入口：每题都会创建会话、写入用户消息、创建运行记录、执行安全检查和认知解析，再由语义问数链路返回回答或明确拒答。

本报告的新口径会把“命中指标但答非所问”的样本归为假阳性。排名题、名单题、对比题、文案题不会再因为带了 metric citation 就被计为真实可用。

## 总览

| 指标 | 数值 |
| --- | ---: |
| 总题数 | 120 |
| 可评测题数 | 120 |
| 模型供应商不可用 | 0 |
| 旧口径可用题数 | 0 |
| 旧口径可用率 | 0.0% |
| 新口径真实可用题数 | 49 |
| 新口径真实可用率 | 40.8% |
| 平均耗时 | 13916 ms |
| P95 耗时 | 25127 ms |
| 最大耗时 | 29451 ms |
| 权限绕过数 | 0 |
| 跨门店读取数 | 0 |
| roleHint 绕过数 | 0 |
| 假动作确认数 | 0 |

## 六层评分

| 层级 | 通过数 | 通过率 | 平均分 |
| --- | ---: | ---: | ---: |
| intent | 100 / 120 | 83.3% | 87.9% |
| tool | 61 / 120 | 50.8% | 50.8% |
| plan | 70 / 120 | 58.3% | 86.1% |
| execution | 110 / 120 | 91.7% | 91.7% |
| completion | 67 / 120 | 55.8% | 74.2% |
| answer | 58 / 120 | 48.3% | 47.7% |

## Grounding 分布

| Grounding 类型 | 数量 |
| --- | ---: |
| Metric Query | 0 |
| DB Skill | 61 |
| Template Skill | 0 |
| Preview Action | 0 |
| None | 59 |

## Adapter 分布

| Adapter | 数量 |
| --- | ---: |
| none | 120 |

## Domain 分布

| Domain | 数量 |
| --- | ---: |
| customer | 54 |
| beautician | 26 |
| staff | 23 |
| finance | 20 |
| product | 17 |
| payment | 15 |
| reservation | 14 |
| order | 10 |
| none | 9 |
| refund | 8 |
| operating_cost | 4 |
| marketing | 3 |
| project | 3 |

## Capability 分布

| Capability | 数量 |
| --- | ---: |
| none | 58 |
| store_operations_overview | 19 |
| customer_facts | 17 |
| manager_staff_overview | 11 |
| inventory_operations_overview | 8 |
| finance_risk_overview | 4 |
| front_desk_operations_overview | 4 |
| inventory_procurement_advice | 2 |
| reservation_list | 2 |
| finance_payment_breakdown | 1 |

## 与 2026-07-10 基线对比

基线文件：D:\AI coding\beauty-salon-admin\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\ami-brain-eval-run-2026-07-10\ami-brain-eval-results-2026-07-10.json

| 指标 | 2026-07-10 基线 | 本次修复后 |
| --- | ---: | ---: |
| 旧口径可用率 | 15.5% | 0.0% |
| 真实可用率 | 3.7% | 40.8% |
| 假阳性数 | 77 | 8 |
| 时间误退化全量数 | 12 | 0 |
| 文案/操作误命中指标数 | 21 | 0 |

## 状态分布

| 状态 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 意图未覆盖 | 53 | 0 | 0.0% | 0 | 53 | 0 | 0 | 0 | 0 |
| 真实可用 | 47 | 47 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 指标查询失败 | 10 | 0 | 0.0% | 10 | 0 | 0 | 0 | 0 | 0 |
| 假阳性-意图错配 | 7 | 0 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 部分可用 | 2 | 2 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 假阳性-粒度错配 | 1 | 0 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 |

## 角色分布

| 角色 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 店长经营 | 100 | 42 | 42.0% | 8 | 42 | 0 | 0 | 0 | 0 |
| 营销增长 | 20 | 7 | 35.0% | 2 | 11 | 0 | 0 | 0 | 0 |

## 分类分布

| 分类 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 风险预警 | 20 | 6 | 30.0% | 2 | 11 | 0 |
| 经营概览 | 20 | 14 | 70.0% | 1 | 3 | 0 |
| 客户管理 | 20 | 8 | 40.0% | 2 | 10 | 0 |
| 客群识别与分析 | 20 | 7 | 35.0% | 2 | 11 | 0 |
| 库存运营 | 20 | 8 | 40.0% | 3 | 8 | 0 |
| 员工管理 | 20 | 6 | 30.0% | 0 | 10 | 0 |

## Top 问题原因

1. tool:capability_any_of_missing:customer_facts|manager_staff_overview|marketing_customer_segment|marketing_growth_overview|store_operations_overview：15 次
2. intent:intent_mismatch：14 次
3. tool:capability_any_of_missing:customer_facts|marketing_customer_segment|marketing_growth_overview：10 次
4. tool:capability_any_of_missing:customer_facts|finance_payment_breakdown|finance_risk_overview|front_desk_operations_overview|inventory_operations_overview|inventory_procurement_advice|manager_staff_overview|marketing_customer_segment|marketing_growth_overview|reservation_list|store_operations_overview：6 次
5. tool:capability_any_of_missing:inventory_operations_overview|inventory_procurement_advice：5 次
6. tool:capability_any_of_missing:manager_staff_overview|store_operations_overview：5 次
7. intent:dimension_missing:customerName：4 次
8. tool:capability_any_of_missing:customer_facts|finance_risk_overview|front_desk_operations_overview|inventory_operations_overview|manager_staff_overview|marketing_customer_segment|marketing_growth_overview|store_operations_overview：2 次
9. tool:capability_any_of_missing:inventory_operations_overview：2 次
10. answer:false_positive_granularity_mismatch：1 次

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
- 店长经营 / 经营概览 / 真实可用：今天和昨天比营业额差多少 -> 实收：0.00 元；订单：0 单；客户：0 人；客单价：0.00 元；预约：0 个；已到店：0 人；当前在店：0 人；新客：0 人（老客 0 人）；退款：0.00 元（0 笔）。

对比：实收，当前 0.00 元，上一期 4904.00 元
- 店长经营 / 经营概览 / 真实可用：本周跟上周比，哪天差距最大 -> 实收：8311.53 元；订单：19 单；客户：9 人；客单价：437.45 元；预约：0 个；已到店：0 人；当前在店：0 人；新客：0 人（老客 0 人）；退款：299.00 元（2 笔）；最大订单：700.00 元（PO1783924
- 店长经营 / 经营概览 / 真实可用：这个月目标完成率多少了，还差多远 -> 实收：27130.96 元；订单：39 单；客户：20 人；客单价：695.67 元；预约：21 个；已到店：8 人；当前在店：3 人；新客：3 人（老客 18 人）；退款：1419.00 元（4 笔）；最大订单：4464.00 元（POM
- 店长经营 / 经营概览 / 真实可用：今天客单价多少，跟平时比怎么样 -> 实收：0.00 元；订单：0 单；客户：0 人；客单价：0.00 元；预约：0 个；已到店：0 人；当前在店：0 人；新客：0 人（老客 0 人）；退款：0.00 元（0 笔）。

对比：实收，当前 0.00 元，上一期 159126.64
- 店长经营 / 经营概览 / 真实可用：今天有没有什么异常情况我需要知道 -> 实收：0.00 元；订单：0 单；客户：0 人；客单价：0.00 元；预约：0 个；已到店：0 人；当前在店：0 人；新客：0 人（老客 0 人）；退款：0.00 元（0 笔）。

明细：
1. 员工=唐伊，预约数=0，状态=可接待，下次可

## 典型问题样本

- 店长经营 / 经营概览 / 假阳性-意图错配：今天新客老客各来了几个 -> 实收：0.00 元；订单：0 单；客户：0 人；客单价：0.00 元；预约：0 个；已到店：0 人；当前在店：0 人；新客：0 人（老客 0 人）；退款：0.00 元（0 笔）。

明细：
1. 员工=唐伊，预约数=0，状态=可接待，下次可
- 店长经营 / 经营概览 / 指标查询失败：今天哪个项目做得最多 -> 实收：0.00 元；订单：0 单；客户：0 人；客单价：0.00 元；预约：0 个；已到店：0 人；当前在店：0 人；新客：0 人（老客 0 人）；退款：0.00 元（0 笔）。

明细：
1. 员工=唐伊，预约数=0，状态=可接待，下次可
- 店长经营 / 经营概览 / 意图未覆盖：今天折扣优惠送出去多少钱 -> 请补充业务对象、指标或时间范围。
- 店长经营 / 经营概览 / 意图未覆盖：这周有没有哪天特别差，为什么 -> 请补充业务对象、指标或时间范围。
- 店长经营 / 经营概览 / 假阳性-粒度错配：今天现金收了多少，微信支付宝各多少 -> 实收合计 0.00 元。当前没有支付方式明细。

未完成范围：no_data:ranking。

数据依据：财务支付方式拆分。
- 店长经营 / 经营概览 / 意图未覆盖：今天储值卡消耗了多少，新充值了多少 -> 请补充业务对象、指标或时间范围。
- 店长经营 / 客户管理 / 意图未覆盖：上个月新来了多少新客，转化了多少 -> 请补充业务对象、指标或时间范围。
- 店长经营 / 客户管理 / 意图未覆盖：最近有没有客户投诉或者表达不满 -> 请补充业务对象、指标或时间范围。
- 店长经营 / 客户管理 / 意图未覆盖：这个月流失了多少客户，主要是什么原因 -> 请补充业务对象、指标或时间范围。
- 店长经营 / 客户管理 / 指标查询失败：哪些客户是高价值但最近不太活跃的 -> 当前无法完成查询，请稍后重试。
- 店长经营 / 客户管理 / 意图未覆盖：帮我看一下今天到店客人的画像，主要是什么年龄段 -> 请补充业务对象、指标或时间范围。
- 店长经营 / 客户管理 / 意图未覆盖：我们的老客回头率大概是多少 -> 请补充业务对象、指标或时间范围。

## 产品结论与改进建议

1. 当前 Ami Brain 已形成六域 Domain Adapter、Supervisor、模板技能、数据库技能和受控动作预览的真实产品链路，本次真实可用率为 40.8%。
2. 当前剩余缺口集中在未覆盖意图和缺少明确业务实体，不再是关键词误命中或伪指标问题；后续应优先补采购建议、客户精确查询、权益 ROI、员工复购排行和否定纠正能力。
3. 对已识别但未接入真实口径的指标继续保持明确拒答，不使用 0、全量历史或无依据估算替代。
4. 发布门禁继续并行检查真实可用率、假阳性、时间范围、权限/跨店、动作确认、异常率和 SSE 首字延迟。
5. 本报告耗时为完整请求落库耗时；用户感知首字延迟需以 SSE 独立压测记录为准。