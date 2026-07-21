# Ami Brain 650题真实请求路径评测报告

生成时间：2026/7/16 14:17:50

## 评测范围

- 产品版本：当前工作区最新版 Ami Brain
- 请求路径：BrainChatService.createConversation + BrainChatService.sendMessage
- 问题来源：D:\AI coding\beauty-salon-admin\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\agent-eval-questions.md
- 问题数：120
- 实际记录数：120
- 门店：requestedStoreId=6，runtimeStoreId=6
- 权限来源：active_backend_role_catalog_plus_candidate_minimum_permissions
- 已注册评测角色：marketing, store_manager
- 冻结发布快照：8b047c0396de76dfa49212b460126f5f2f0cf75d0f79a9ccde58ada62802ab1d / capabilities=beautician_service_overview, customer_facts, finance_payment_breakdown, finance_risk_overview, front_desk_operations_overview, inventory_operations_overview, inventory_procurement_advice, manager_staff_overview, marketing_customer_segment, marketing_growth_overview, reservation_list, store_operations_overview
- 评分口径：同时输出旧口径和新口径。旧口径为“completed 且有 metric citation”；新口径要求意图、指标口径、回答粒度匹配。
- 六层门禁：意图、工具、计划、执行、完成度、答案均为确定性评分；任一层失败即不计入真实可用。

## 总体结论

Ami Brain 当前已经不再是空入口：每题都会创建会话、写入用户消息、创建运行记录、执行安全检查和认知解析，再由语义问数链路返回回答或明确拒答。

本报告的新口径会把“命中指标但答非所问”的样本归为假阳性。排名题、名单题、对比题、文案题不会再因为带了 metric citation 就被计为真实可用。

## 总览

| 指标 | 数值 |
| --- | ---: |
| 总题数 | 120 |
| 可评测题数 | 119 |
| 模型供应商不可用 | 1 |
| 旧口径可用题数 | 1 |
| 旧口径可用率 | 0.8% |
| 新口径真实可用题数 | 58 |
| 新口径真实可用率 | 48.7% |
| 平均耗时 | 9579 ms |
| P95 耗时 | 14618 ms |
| 最大耗时 | 19821 ms |
| 权限绕过数 | 0 |
| 跨门店读取数 | 0 |
| roleHint 绕过数 | 0 |
| 假动作确认数 | 0 |

## 六层评分

| 层级 | 通过数 | 通过率 | 平均分 |
| --- | ---: | ---: | ---: |
| intent | 104 / 119 | 87.4% | 90.7% |
| tool | 69 / 119 | 58.0% | 58.0% |
| plan | 77 / 119 | 64.7% | 88.2% |
| execution | 113 / 119 | 95.0% | 95.0% |
| completion | 75 / 119 | 63.0% | 79.1% |
| answer | 63 / 119 | 52.9% | 52.1% |

## Grounding 分布

| Grounding 类型 | 数量 |
| --- | ---: |
| Metric Query | 0 |
| DB Skill | 70 |
| Template Skill | 0 |
| Preview Action | 0 |
| None | 49 |

## Adapter 分布

| Adapter | 数量 |
| --- | ---: |
| none | 119 |

## Domain 分布

| Domain | 数量 |
| --- | ---: |
| customer | 59 |
| beautician | 25 |
| staff | 23 |
| finance | 20 |
| product | 18 |
| reservation | 14 |
| payment | 11 |
| order | 10 |
| refund | 7 |
| none | 6 |
| marketing | 4 |
| operating_cost | 3 |
| project | 3 |

## Capability 分布

| Capability | 数量 |
| --- | ---: |
| none | 49 |
| customer_facts | 21 |
| store_operations_overview | 17 |
| manager_staff_overview | 13 |
| inventory_operations_overview | 11 |
| finance_risk_overview | 5 |
| front_desk_operations_overview | 5 |
| finance_payment_breakdown | 2 |
| inventory_procurement_advice | 2 |
| marketing_growth_overview | 1 |
| reservation_list | 1 |

## 与 2026-07-10 基线对比

基线文件：D:\AI coding\beauty-salon-admin\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\ami-brain-eval-run-2026-07-10\ami-brain-eval-results-2026-07-10.json

| 指标 | 2026-07-10 基线 | 本次修复后 |
| --- | ---: | ---: |
| 旧口径可用率 | 15.5% | 0.8% |
| 真实可用率 | 3.7% | 48.3% |
| 假阳性数 | 77 | 5 |
| 时间误退化全量数 | 12 | 0 |
| 文案/操作误命中指标数 | 21 | 1 |

## 状态分布

| 状态 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 真实可用 | 54 | 54 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 意图未覆盖 | 49 | 0 | 0.0% | 0 | 49 | 0 | 0 | 0 | 0 |
| 指标查询失败 | 7 | 0 | 0.0% | 7 | 0 | 0 | 0 | 0 | 0 |
| 假阳性-意图错配 | 4 | 0 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 部分可用 | 4 | 4 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 假阳性-粒度错配 | 1 | 0 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 模型供应商不可用 | 1 | 0 | 0.0% | 0 | 0 | 0 | 0 | 1 | 0 |

## 角色分布

| 角色 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 店长经营 | 100 | 52 | 52.5% | 6 | 37 | 0 | 0 | 1 | 0 |
| 营销增长 | 20 | 6 | 30.0% | 1 | 12 | 0 | 0 | 0 | 0 |

## 分类分布

| 分类 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 风险预警 | 20 | 7 | 35.0% | 1 | 12 | 0 |
| 经营概览 | 20 | 15 | 78.9% | 2 | 1 | 0 |
| 客户管理 | 20 | 8 | 40.0% | 0 | 10 | 0 |
| 客群识别与分析 | 20 | 6 | 30.0% | 1 | 12 | 0 |
| 库存运营 | 20 | 10 | 50.0% | 3 | 7 | 0 |
| 员工管理 | 20 | 12 | 60.0% | 0 | 7 | 0 |

## Top 问题原因

1. tool:capability_any_of_missing:customer_facts|manager_staff_overview|marketing_customer_segment|marketing_growth_overview|store_operations_overview：12 次
2. tool:capability_any_of_missing:customer_facts|marketing_customer_segment|marketing_growth_overview：11 次
3. intent:intent_mismatch：10 次
4. answer:unsupported_intent：5 次
5. tool:capability_any_of_missing:customer_facts|finance_payment_breakdown|finance_risk_overview|front_desk_operations_overview|inventory_operations_overview|inventory_procurement_advice|manager_staff_overview|marketing_customer_segment|marketing_growth_overview|reservation_list|store_operations_overview：4 次
6. tool:capability_any_of_missing:manager_staff_overview|store_operations_overview：4 次
7. tool:capability_any_of_missing:inventory_operations_overview|inventory_procurement_advice：3 次
8. intent:dimension_missing:customerName：2 次
9. tool:capability_any_of_missing:customer_facts|finance_risk_overview|front_desk_operations_overview|inventory_operations_overview|manager_staff_overview|marketing_customer_segment|marketing_growth_overview|store_operations_overview：2 次
10. tool:capability_any_of_missing:inventory_operations_overview：2 次

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

- 店长经营 / 经营概览 / 指标查询失败：今天哪个项目做得最多 -> 实收：0.00 元；订单：0 单；客户：0 人；客单价：0.00 元；预约：0 个；已到店：0 人；当前在店：0 人；新客：0 人（老客 0 人）；退款：0.00 元（0 笔）。

明细：
1. 员工=唐伊，预约数=0，状态=可接待，下次可
- 店长经营 / 经营概览 / 模型供应商不可用：今天最大的一笔消费是多少 -> 当前无法理解该问题，请换一种清晰表述后重试。
- 店长经营 / 经营概览 / 指标查询失败：今天折扣优惠送出去多少钱 -> 当前无法生成受控复合计划，本次未执行查询。
- 店长经营 / 经营概览 / 意图未覆盖：这周有没有哪天特别差，为什么 -> 请补充业务对象、指标或时间范围。
- 店长经营 / 经营概览 / 假阳性-粒度错配：今天储值卡消耗了多少，新充值了多少 -> 排行：
1. 支付方式=储值余额，金额=0.00，笔数=0

数据依据：财务支付方式拆分。
- 店长经营 / 客户管理 / 意图未覆盖：上个月新来了多少新客，转化了多少 -> 请补充业务对象、指标或时间范围。
- 店长经营 / 客户管理 / 意图未覆盖：最近有没有客户投诉或者表达不满 -> 当前客户事实能力尚未注册该业务口径，不会编造回答。已接入精确客户、VIP、高价值、沉睡、生日、低余次卡、重要到店和营销响应客户查询。

数据依据：客户精确事实查询。
- 店长经营 / 客户管理 / 意图未覆盖：这个月流失了多少客户，主要是什么原因 -> 请补充业务对象、指标或时间范围。
- 店长经营 / 客户管理 / 假阳性-意图错配：哪些客户是高价值但最近不太活跃的 -> 高价值低活跃客户（统一口径：累计消费不少于 5000 元，且近 30 天未到店）：共 544 人，展示前 10 人。
1. 刘婉清：钻石会员，累计消费 186301.00 元，到店 94 次，最近到店 2026-04-23
2. 高美琳：钻
- 店长经营 / 客户管理 / 意图未覆盖：帮我看一下今天到店客人的画像，主要是什么年龄段 -> 当前客户事实能力尚未注册该业务口径，不会编造回答。已接入精确客户、VIP、高价值、沉睡、生日、低余次卡、重要到店和营销响应客户查询。

数据依据：客户精确事实查询。
- 店长经营 / 客户管理 / 意图未覆盖：我们的老客回头率大概是多少 -> 请补充业务对象、指标或时间范围。
- 店长经营 / 客户管理 / 意图未覆盖：哪些客户消费了钱但很少用次卡 -> 请补充业务对象、指标或时间范围。

## 产品结论与改进建议

1. 当前 Ami Brain 已形成六域 Domain Adapter、Supervisor、模板技能、数据库技能和受控动作预览的真实产品链路，本次真实可用率为 48.7%。
2. 当前剩余缺口集中在未覆盖意图和缺少明确业务实体，不再是关键词误命中或伪指标问题；后续应优先补采购建议、客户精确查询、权益 ROI、员工复购排行和否定纠正能力。
3. 对已识别但未接入真实口径的指标继续保持明确拒答，不使用 0、全量历史或无依据估算替代。
4. 发布门禁继续并行检查真实可用率、假阳性、时间范围、权限/跨店、动作确认、异常率和 SSE 首字延迟。
5. 本报告耗时为完整请求落库耗时；用户感知首字延迟需以 SSE 独立压测记录为准。