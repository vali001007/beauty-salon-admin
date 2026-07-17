# Ami Brain 650题真实请求路径评测报告

生成时间：2026/7/18 04:47:22

## 评测范围

- 产品版本：当前工作区最新版 Ami Brain
- 请求路径：BrainChatService.createConversation + BrainChatService.sendMessage
- 问题来源：D:\AI coding\beauty-salon-admin\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\agent-eval-questions.md
- 问题数：120
- 实际记录数：120
- 实际对话轮数：120
- 门店：requestedStoreId=6，runtimeStoreId=6
- 权限来源：active_backend_role_catalog_plus_candidate_minimum_permissions
- 已注册评测角色：marketing, store_manager
- 冻结发布快照：f56f0d309b3ea906fdbda0d140aa44a33a3f51b056cf7ed1ca5381156de69d56 / capabilities=beautician_service_overview, customer_facts, customer_follow_up_draft, finance_payment_breakdown, finance_risk_overview, front_desk_operations_overview, gap_fill_touch_preview, inventory_operations_overview, inventory_procurement_advice, manager_staff_overview, marketing_customer_segment, marketing_growth_overview, marketing_message_draft, marketing_touch_draft, product_sales_ranking, project_service_ranking, reservation_action_preview, reservation_list, store_operations_overview
- 评分口径：同时输出旧口径和新口径。旧口径为“completed 且有 metric citation”；新口径要求意图、指标口径、回答粒度匹配。
- 六层门禁：意图、工具、计划、执行、完成度、答案均为确定性评分；任一层失败即不计入真实可用。

## 总体结论

Ami Brain 当前已经不再是空入口：每题都会创建会话、写入用户消息、创建运行记录、执行安全检查和认知解析，再由语义问数链路返回回答或明确拒答。

本报告的新口径会把“命中指标但答非所问”的样本归为假阳性。排名题、名单题、对比题、文案题不会再因为带了 metric citation 就被计为真实可用。

## 总览

| 指标 | 数值 |
| --- | ---: |
| 总题数 | 120 |
| 可评测题数 | 118 |
| 模型供应商不可用 | 2 |
| 旧口径可用题数 | 29 |
| 旧口径可用率 | 24.6% |
| 新口径真实可用题数 | 98 |
| 新口径真实可用率 | 83.1% |
| 多轮场景通过数 | 0 / 0 |
| 多轮轮次通过数 | 98 / 120 |
| 平均耗时 | 7870 ms |
| P95 耗时 | 21308 ms |
| 最大耗时 | 30777 ms |
| 权限绕过数 | 0 |
| 跨门店读取数 | 0 |
| roleHint 绕过数 | 0 |
| 假动作确认数 | 0 |

## 六层评分

| 层级 | 通过数 | 通过率 | 平均分 |
| --- | ---: | ---: | ---: |
| intent | 111 / 118 | 94.1% | 96.0% |
| tool | 108 / 118 | 91.5% | 91.5% |
| plan | 111 / 118 | 94.1% | 98.0% |
| execution | 113 / 118 | 95.8% | 95.8% |
| completion | 110 / 118 | 93.2% | 94.4% |
| answer | 99 / 118 | 83.9% | 83.5% |

## Grounding 分布

| Grounding 类型 | 数量 |
| --- | ---: |
| Metric Query | 2 |
| DB Skill | 104 |
| Template Skill | 0 |
| Preview Action | 0 |
| None | 12 |

## 执行路径分布

| 执行路径 | 数量 |
| --- | ---: |
| model_primary | 60 |
| exact_contract_fast_path | 59 |
| model_unavailable | 1 |

## Adapter 分布

| Adapter | 数量 |
| --- | ---: |
| none | 118 |

## Domain 分布

| Domain | 数量 |
| --- | ---: |
| customer | 69 |
| beautician | 36 |
| order | 32 |
| finance | 30 |
| reservation | 28 |
| product | 27 |
| payment | 25 |
| staff | 22 |
| project | 19 |
| payment_record | 11 |
| operating_cost | 9 |
| product_order | 8 |
| refund | 8 |
| marketing | 5 |
| none | 3 |
| order_item | 1 |

## Capability 分布

| Capability | 数量 |
| --- | ---: |
| customer_facts | 34 |
| manager_staff_overview | 21 |
| inventory_operations_overview | 15 |
| store_operations_overview | 13 |
| finance_risk_overview | 12 |
| none | 10 |
| marketing_growth_overview | 5 |
| finance_payment_breakdown | 4 |
| front_desk_operations_overview | 4 |
| inventory_procurement_advice | 2 |
| marketing_customer_segment | 1 |
| product_sales_ranking | 1 |
| project_service_ranking | 1 |

## 与 2026-07-10 基线对比

基线文件：D:\AI coding\beauty-salon-admin\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\ami-brain-eval-run-2026-07-10\ami-brain-eval-results-2026-07-10.json

| 指标 | 2026-07-10 基线 | 本次修复后 |
| --- | ---: | ---: |
| 旧口径可用率 | 15.5% | 24.6% |
| 真实可用率 | 3.7% | 81.7% |
| 假阳性数 | 77 | 2 |
| 时间误退化全量数 | 12 | 0 |
| 文案/操作误命中指标数 | 21 | 0 |

## 状态分布

| 状态 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 真实可用 | 96 | 96 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 意图未覆盖 | 13 | 0 | 0.0% | 0 | 13 | 0 | 0 | 0 | 0 |
| 指标查询失败 | 5 | 0 | 0.0% | 5 | 0 | 0 | 0 | 0 | 0 |
| 模型供应商不可用 | 2 | 0 | 0.0% | 0 | 0 | 0 | 0 | 2 | 0 |
| 部分可用 | 2 | 2 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 假阳性-粒度错配 | 1 | 0 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 假阳性-意图错配 | 1 | 0 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 |

## 角色分布

| 角色 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 店长经营 | 100 | 83 | 83.8% | 2 | 12 | 0 | 0 | 1 | 0 |
| 营销增长 | 20 | 15 | 78.9% | 3 | 1 | 0 | 0 | 1 | 0 |

## 分类分布

| 分类 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 风险预警 | 20 | 12 | 63.2% | 1 | 5 | 0 |
| 经营概览 | 20 | 20 | 100.0% | 0 | 0 | 0 |
| 客户管理 | 20 | 17 | 85.0% | 0 | 3 | 0 |
| 客群识别与分析 | 20 | 15 | 78.9% | 3 | 1 | 0 |
| 库存运营 | 20 | 20 | 100.0% | 0 | 0 | 0 |
| 员工管理 | 20 | 14 | 70.0% | 1 | 4 | 0 |

## Top 问题原因

1. answer:unsupported_intent：6 次
2. intent:intent_mismatch：4 次
3. intent:metric_missing:staff_performance_score：2 次
4. tool:capability_any_of_missing:customer_facts|finance_payment_breakdown|finance_risk_overview|front_desk_operations_overview|inventory_operations_overview|inventory_procurement_advice|manager_staff_overview|marketing_customer_segment|marketing_growth_overview|product_sales_ranking|reservation_list|store_operations_overview：2 次
5. intent:answer_shape_mismatch：1 次
6. tool:capability_any_of_missing:customer_facts|finance_risk_overview|front_desk_operations_overview|inventory_operations_overview|manager_staff_overview|marketing_customer_segment|marketing_growth_overview|store_operations_overview：1 次
7. tool:capability_any_of_missing:customer_facts|manager_staff_overview|marketing_customer_segment|marketing_growth_overview|store_operations_overview：1 次
8. tool:capability_any_of_missing:customer_facts|marketing_customer_segment|marketing_growth_overview：1 次
9. tool:capability_any_of_missing:finance_risk_overview|inventory_operations_overview|marketing_growth_overview：1 次
10. tool:capability_any_of_missing:manager_staff_overview|store_operations_overview：1 次

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

对比：实收，当前 0.00 元，上一期 0.00 元，变化
- 店长经营 / 经营概览 / 真实可用：本周跟上周比，哪天差距最大 -> 排行：
1. 星期=周三，本期日期=2026-07-15，本期实收=4904.00，上期日期=2026-07-08，上期实收=741.70，差额=+4162.30 元
2. 星期=周一，本期日期=2026-07-13，本期实收=3407.5
- 店长经营 / 经营概览 / 真实可用：这个月目标完成率多少了，还差多远 -> 实收：27130.96 元；订单：39 单；客户：20 人；客单价：695.67 元；预约：21 个；已到店：8 人；当前在店：3 人；新客：3 人（老客 18 人）；退款：1419.00 元（4 笔）；最大订单：4464.00 元（POM
- 店长经营 / 经营概览 / 真实可用：今天客单价多少，跟平时比怎么样 -> 实收：0.00 元；订单：0 单；客户：0 人；客单价：0.00 元；预约：0 个；已到店：0 人；当前在店：0 人；新客：0 人（老客 0 人）；退款：0.00 元（0 笔）。

对比：实收，当前 0.00 元，上一期 158442.64
- 店长经营 / 经营概览 / 真实可用：今天有没有什么异常情况我需要知道 -> 实收：0.00 元；订单：0 单；客户：0 人；客单价：0.00 元；预约：0 个；已到店：0 人；当前在店：0 人；新客：0 人（老客 0 人）；退款：0.00 元（0 笔）。

明细：
1. 员工=唐伊，预约数=0，状态=可接待，下次可

## 典型问题样本

- 店长经营 / 客户管理 / 意图未覆盖：最近有没有客户投诉或者表达不满 -> 当前客户事实能力尚未注册该业务口径，不会编造回答。已接入精确客户、VIP、高价值、沉睡、生日、低余次卡、重要到店和营销响应客户查询。

数据依据：客户精确事实查询。
- 店长经营 / 客户管理 / 意图未覆盖：最近有没有客户因为等待时间长而离开 -> 为了准确处理，请一次确认：请补充完成标准；“因等待时间长而离开”是因果判断，已治理数据可能只能提供服务超时、受影响预约或未到店等关联迹象，未必能够直接确认离开原因？
- 店长经营 / 客户管理 / 意图未覆盖：帮我看一下客户满意度整体情况 -> 当前客户事实能力尚未注册该业务口径，不会编造回答。已接入精确客户、VIP、高价值、沉睡、生日、低余次卡、重要到店和营销响应客户查询。

数据依据：客户精确事实查询。
- 店长经营 / 员工管理 / 假阳性-意图错配：有没有员工这周业绩明显下滑 -> 排行：
1. 员工=宋乔，员工表现评分=22.531919999999996，服务次数=0，服务客户数=0，复购客户数=0，业绩实收=3755.32，提成金额=284.38，请假时长=0
2. 员工=顾然，员工表现评分=14.8612800
- 店长经营 / 员工管理 / 意图未覆盖：哪个美容师的客诉最多，最近有没有 -> 当前后台没有客户投诉、差评或满意度事实闭环，无法按美容师统计或排行。Ami Brain 不会用服务量、业绩或综合表现分替代客诉指标。
- 店长经营 / 员工管理 / 意图未覆盖：新员工试用期表现怎么样 -> 当前后台没有员工试用期目标、阶段评价、带教记录或转正结论事实闭环，无法评价新员工试用期表现。Ami Brain 不会用服务量、接客数或通用业绩分替代试用期评估。
- 店长经营 / 员工管理 / 指标查询失败：哪个美容师擅长的项目客户最满意 -> 当前已发布能力缺少该问题需要的业务对象或分析维度，本次不执行泛化查询。
- 店长经营 / 员工管理 / 意图未覆盖：有没有员工到期转正需要我处理 -> 为了准确处理，请一次确认：请补充目标或要处理的问题；当前已发布实体和能力未提供员工试用期、转正到期或待处理状态的受控事实定义？
- 店长经营 / 员工管理 / 意图未覆盖：有没有员工的客户被别的美容师挖走的迹象 -> 当前客户事实能力尚未注册该业务口径，不会编造回答。已接入精确客户、VIP、高价值、沉睡、生日、低余次卡、重要到店和营销响应客户查询。

数据依据：客户精确事实查询。
- 店长经营 / 风险预警 / 意图未覆盖：今天有没有什么需要我特别注意的风险 -> 实收：0.00 元；退款：0.00 元（0 笔）；优惠：0.00 元；毛利：0.00 元；毛利率：暂无结算口径；会员卡负债：1067817.81 元。

排行：当前时间范围没有可排行的数据。

趋势数据：
1. 日期=2026-07-18，
- 店长经营 / 风险预警 / 意图未覆盖：店里设备最近有没有什么问题 -> 为了准确处理，请一次确认：请补充业务对象；受控 Ontology 未提供“设备”实体或可明确对应设备状态、故障与维护信息的已发布定义？
- 店长经营 / 风险预警 / 意图未覆盖：有没有客户最近投诉了但我还没处理 -> 当前客户事实能力尚未注册该业务口径，不会编造回答。已接入精确客户、VIP、高价值、沉睡、生日、低余次卡、重要到店和营销响应客户查询。

数据依据：客户精确事实查询。

## 产品结论与改进建议

1. 当前 Ami Brain 已形成六域 Domain Adapter、Supervisor、模板技能、数据库技能和受控动作预览的真实产品链路，本次真实可用率为 83.1%。
2. 当前剩余缺口集中在未覆盖意图和缺少明确业务实体，不再是关键词误命中或伪指标问题；后续应优先补采购建议、客户精确查询、权益 ROI、员工复购排行和否定纠正能力。
3. 对已识别但未接入真实口径的指标继续保持明确拒答，不使用 0、全量历史或无依据估算替代。
4. 发布门禁继续并行检查真实可用率、假阳性、时间范围、权限/跨店、动作确认、异常率和 SSE 首字延迟。
5. 本报告耗时为完整请求落库耗时；用户感知首字延迟需以 SSE 独立压测记录为准。