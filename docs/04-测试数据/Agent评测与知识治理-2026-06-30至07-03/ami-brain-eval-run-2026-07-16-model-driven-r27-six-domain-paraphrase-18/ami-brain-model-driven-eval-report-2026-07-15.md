# Ami Brain 650题真实请求路径评测报告

生成时间：2026/7/16 07:48:19

## 评测范围

- 产品版本：当前工作区最新版 Ami Brain
- 请求路径：BrainChatService.createConversation + BrainChatService.sendMessage
- 问题来源：D:\AI coding\beauty-salon-admin\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\agent-eval-questions.md
- 问题数：18
- 实际记录数：18
- 门店：requestedStoreId=6，runtimeStoreId=6
- 权限来源：active_backend_role_catalog_plus_candidate_minimum_permissions
- 已注册评测角色：marketing, store_manager
- 冻结发布快照：b8ff49a6334fc4dc8f3d605e30e37e26edf3bf4cade3f5f5bb79f3c83d696d7d / capabilities=beautician_service_overview, customer_facts, finance_payment_breakdown, finance_risk_overview, front_desk_operations_overview, inventory_operations_overview, inventory_procurement_advice, marketing_customer_segment, marketing_growth_overview, reservation_list, store_operations_overview
- 评分口径：同时输出旧口径和新口径。旧口径为“completed 且有 metric citation”；新口径要求意图、指标口径、回答粒度匹配。
- 六层门禁：意图、工具、计划、执行、完成度、答案均为确定性评分；任一层失败即不计入真实可用。

## 总体结论

Ami Brain 当前已经不再是空入口：每题都会创建会话、写入用户消息、创建运行记录、执行安全检查和认知解析，再由语义问数链路返回回答或明确拒答。

本报告的新口径会把“命中指标但答非所问”的样本归为假阳性。排名题、名单题、对比题、文案题不会再因为带了 metric citation 就被计为真实可用。

## 总览

| 指标 | 数值 |
| --- | ---: |
| 总题数 | 18 |
| 可评测题数 | 18 |
| 模型供应商不可用 | 0 |
| 旧口径可用题数 | 1 |
| 旧口径可用率 | 5.6% |
| 新口径真实可用题数 | 3 |
| 新口径真实可用率 | 16.7% |
| 平均耗时 | 9962 ms |
| P95 耗时 | 17272 ms |
| 最大耗时 | 17272 ms |
| 权限绕过数 | 0 |
| 跨门店读取数 | 0 |
| roleHint 绕过数 | 0 |
| 假动作确认数 | 0 |

## 六层评分

| 层级 | 通过数 | 通过率 | 平均分 |
| --- | ---: | ---: | ---: |
| intent | 14 / 18 | 77.8% | 83.3% |
| tool | 8 / 18 | 44.4% | 44.4% |
| plan | 8 / 18 | 44.4% | 81.5% |
| execution | 17 / 18 | 94.4% | 94.4% |
| completion | 6 / 18 | 33.3% | 65.7% |
| answer | 5 / 18 | 27.8% | 27.8% |

## Grounding 分布

| Grounding 类型 | 数量 |
| --- | ---: |
| Metric Query | 0 |
| DB Skill | 8 |
| Template Skill | 0 |
| Preview Action | 0 |
| None | 10 |

## Adapter 分布

| Adapter | 数量 |
| --- | ---: |
| none | 18 |

## Domain 分布

| Domain | 数量 |
| --- | ---: |
| customer | 8 |
| product | 4 |
| finance | 3 |
| order | 3 |
| beautician | 2 |
| reservation | 2 |
| staff | 2 |
| none | 1 |
| payment | 1 |
| project | 1 |
| refund | 1 |

## Capability 分布

| Capability | 数量 |
| --- | ---: |
| none | 10 |
| inventory_operations_overview | 3 |
| customer_facts | 2 |
| store_operations_overview | 2 |
| finance_payment_breakdown | 1 |
| finance_risk_overview | 1 |
| marketing_customer_segment | 1 |
| marketing_growth_overview | 1 |

## 与 2026-07-10 基线对比

基线文件：D:\AI coding\beauty-salon-admin\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\ami-brain-eval-run-2026-07-10\ami-brain-eval-results-2026-07-10.json

| 指标 | 2026-07-10 基线 | 本次修复后 |
| --- | ---: | ---: |
| 旧口径可用率 | 15.5% | 5.6% |
| 真实可用率 | 3.7% | 16.7% |
| 假阳性数 | 77 | 3 |
| 时间误退化全量数 | 12 | 0 |
| 文案/操作误命中指标数 | 21 | 0 |

## 状态分布

| 状态 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 意图未覆盖 | 10 | 0 | 0.0% | 0 | 10 | 0 | 0 | 0 | 0 |
| 真实可用 | 3 | 3 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 指标查询失败 | 2 | 0 | 0.0% | 2 | 0 | 0 | 0 | 0 | 0 |
| 假阳性-粒度错配 | 1 | 0 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 假阳性-意图错配 | 1 | 0 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 假阳性-指标错配 | 1 | 0 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 |

## 角色分布

| 角色 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 店长经营 | 15 | 3 | 20.0% | 2 | 8 | 0 | 0 | 0 | 0 |
| 营销增长 | 3 | 0 | 0.0% | 0 | 2 | 0 | 0 | 0 | 0 |

## 分类分布

| 分类 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 风险预警 | 3 | 0 | 0.0% | 0 | 3 | 0 |
| 经营概览 | 3 | 0 | 0.0% | 1 | 1 | 0 |
| 客户管理 | 3 | 1 | 33.3% | 0 | 2 | 0 |
| 客群识别与分析 | 3 | 0 | 0.0% | 0 | 2 | 0 |
| 库存运营 | 3 | 2 | 66.7% | 0 | 1 | 0 |
| 员工管理 | 3 | 0 | 0.0% | 1 | 1 | 0 |

## Top 问题原因

1. intent:intent_mismatch：2 次
2. tool:capability_any_of_missing:customer_facts|marketing_customer_segment|marketing_growth_overview：2 次
3. tool:capability_any_of_missing:customer_facts|marketing_customer_segment|marketing_growth_overview|store_operations_overview：2 次
4. answer:false_positive_granularity_mismatch：1 次
5. answer:false_positive_metric_mismatch：1 次
6. answer:unsupported_intent：1 次
7. completion:completion_status:incomplete：1 次
8. intent:dimension_missing:customerName：1 次
9. intent:domain_missing:customer：1 次
10. tool:capability_any_of_missing:customer_facts|finance_risk_overview|front_desk_operations_overview|inventory_operations_overview|marketing_customer_segment|marketing_growth_overview|store_operations_overview：1 次

## 典型可用样本

- 店长经营 / 客户管理 / 真实可用：最近哪些老客好久没来了，帮我列一下 -> 60 天未到店客户名单：共 854 人，展示前 10 人。
1. 刘婉清：累计消费 186301.00 元，到店 94 次，最近到店 2026-04-23
2. 高美琳：累计消费 186059.00 元，到店 71 次，最近到店 2026-
- 店长经营 / 库存运营 / 真实可用：现在哪些产品库存不够了 -> 在库 SKU：45 个；库存金额：259391.31 元；低库存 SKU：1 个；临期库存金额：0.00 元（截止 2026-08-15）；采购建议：1 项；候选供应商：3 家。

排行：
1. 商品=玻尿酸保湿精华，当前库存=131，安全
- 店长经营 / 库存运营 / 真实可用：有没有产品快断货但还没采购的 -> 在库 SKU：45 个；库存金额：259391.31 元；低库存 SKU：1 个；临期库存金额：0.00 元（截止 2026-08-15）；采购建议：1 项；候选供应商：3 家。

排行：
1. 商品=玻尿酸保湿精华，当前库存=131，出库

## 典型问题样本

- 店长经营 / 经营概览 / 意图未覆盖：今天新客老客各来了几个 -> 请补充业务对象、指标或时间范围。
- 店长经营 / 经营概览 / 指标查询失败：今天哪个项目做得最多 -> 实收：0.00 元；订单：0 单；客户：0 人；客单价：0.00 元；预约：0 个；已到店：0 人；当前在店：0 人；新客：0 人（老客 0 人）；退款：0.00 元（0 笔）。

明细：
1. 员工=唐伊，预约数=0，状态=可接待，下次可
- 店长经营 / 经营概览 / 假阳性-粒度错配：今天现金收了多少，微信支付宝各多少 -> 未完成范围：no_data:ranking。

数据依据：财务支付方式拆分。
- 店长经营 / 客户管理 / 意图未覆盖：有没有哪些客户快到生日了可以做关怀 -> 请补充业务对象、指标或时间范围。
- 店长经营 / 客户管理 / 意图未覆盖：今天有没有重要客户来店，需要特别关注的 -> 请补充业务对象、指标或时间范围。
- 店长经营 / 员工管理 / 意图未覆盖：哪个美容师接的客人最多 -> 请补充业务对象、指标或时间范围。
- 店长经营 / 员工管理 / 指标查询失败：各美容师今天的排班情况，有没有空档 -> 当前无法生成受控复合计划，本次未执行查询。
- 店长经营 / 员工管理 / 假阳性-意图错配：帮我看一下各美容师的服务次数对比 -> 实收：0.00 元；订单：0 单；客户：0 人；客单价：0.00 元；预约：0 个；已到店：0 人；当前在店：0 人；新客：0 人（老客 0 人）；退款：0.00 元（0 笔）。

明细：
1. 员工=唐伊，预约数=0，状态=可接待，下次可
- 店长经营 / 库存运营 / 意图未覆盖：有没有快过期的产品，数量多少 -> 请补充业务对象、指标或时间范围。
- 店长经营 / 风险预警 / 意图未覆盖：今天有没有什么需要我特别注意的风险 -> 实收：0.00 元；退款：0.00 元（0 笔）；优惠：0.00 元；毛利：0.00 元；毛利率：暂无结算口径；会员卡负债：1067817.81 元。

明细：
1. 成本类别=物料成本，金额=0
2. 成本类别=提成成本，金额=0
3. 
- 店长经营 / 风险预警 / 意图未覆盖：这周预约爽约率高不高 -> 请补充业务对象、指标或时间范围。
- 店长经营 / 风险预警 / 意图未覆盖：有没有大额异常退款我不知道的 -> 请补充业务对象、指标或时间范围。

## 产品结论与改进建议

1. 当前 Ami Brain 已形成六域 Domain Adapter、Supervisor、模板技能、数据库技能和受控动作预览的真实产品链路，本次真实可用率为 16.7%。
2. 当前剩余缺口集中在未覆盖意图和缺少明确业务实体，不再是关键词误命中或伪指标问题；后续应优先补采购建议、客户精确查询、权益 ROI、员工复购排行和否定纠正能力。
3. 对已识别但未接入真实口径的指标继续保持明确拒答，不使用 0、全量历史或无依据估算替代。
4. 发布门禁继续并行检查真实可用率、假阳性、时间范围、权限/跨店、动作确认、异常率和 SSE 首字延迟。
5. 本报告耗时为完整请求落库耗时；用户感知首字延迟需以 SSE 独立压测记录为准。