# Ami Brain 650题真实请求路径评测报告

生成时间：2026/7/17 03:28:33

## 评测范围

- 产品版本：当前工作区最新版 Ami Brain
- 请求路径：BrainChatService.createConversation + BrainChatService.sendMessage
- 问题来源：D:\AI coding\beauty-salon-admin\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\ami-brain-model-driven-paraphrase-cases.json
- 问题数：5
- 实际记录数：5
- 门店：requestedStoreId=6，runtimeStoreId=6
- 权限来源：active_backend_role_catalog_plus_candidate_minimum_permissions
- 已注册评测角色：inventory
- 冻结发布快照：e32f7918d892caec3ee589830e864ef1f36a810b9a3e3531abcd655e3c104617 / capabilities=beautician_service_overview, customer_facts, finance_payment_breakdown, finance_risk_overview, front_desk_operations_overview, inventory_operations_overview, inventory_procurement_advice, manager_staff_overview, marketing_customer_segment, marketing_growth_overview, product_sales_ranking, project_service_ranking, reservation_list, store_operations_overview
- 评分口径：同时输出旧口径和新口径。旧口径为“completed 且有 metric citation”；新口径要求意图、指标口径、回答粒度匹配。
- 六层门禁：意图、工具、计划、执行、完成度、答案均为确定性评分；任一层失败即不计入真实可用。

## 总体结论

Ami Brain 当前已经不再是空入口：每题都会创建会话、写入用户消息、创建运行记录、执行安全检查和认知解析，再由语义问数链路返回回答或明确拒答。

本报告的新口径会把“命中指标但答非所问”的样本归为假阳性。排名题、名单题、对比题、文案题不会再因为带了 metric citation 就被计为真实可用。

## 总览

| 指标 | 数值 |
| --- | ---: |
| 总题数 | 5 |
| 可评测题数 | 5 |
| 模型供应商不可用 | 0 |
| 旧口径可用题数 | 4 |
| 旧口径可用率 | 80.0% |
| 新口径真实可用题数 | 4 |
| 新口径真实可用率 | 80.0% |
| 平均耗时 | 12299 ms |
| P95 耗时 | 17679 ms |
| 最大耗时 | 17679 ms |
| 权限绕过数 | 0 |
| 跨门店读取数 | 0 |
| roleHint 绕过数 | 0 |
| 假动作确认数 | 0 |

## 六层评分

| 层级 | 通过数 | 通过率 | 平均分 |
| --- | ---: | ---: | ---: |
| intent | 5 / 5 | 100.0% | 100.0% |
| tool | 4 / 5 | 80.0% | 80.0% |
| plan | 5 / 5 | 100.0% | 100.0% |
| execution | 5 / 5 | 100.0% | 100.0% |
| completion | 4 / 5 | 80.0% | 90.0% |
| answer | 4 / 5 | 80.0% | 80.0% |

## Grounding 分布

| Grounding 类型 | 数量 |
| --- | ---: |
| Metric Query | 4 |
| DB Skill | 0 |
| Template Skill | 0 |
| Preview Action | 0 |
| None | 1 |

## 执行路径分布

| 执行路径 | 数量 |
| --- | ---: |
| model_primary | 5 |

## Adapter 分布

| Adapter | 数量 |
| --- | ---: |
| none | 5 |

## Domain 分布

| Domain | 数量 |
| --- | ---: |
| order | 5 |
| product | 5 |

## Capability 分布

| Capability | 数量 |
| --- | ---: |
| product_sales_ranking | 4 |
| none | 1 |


## 状态分布

| 状态 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 真实可用 | 4 | 4 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 意图未覆盖 | 1 | 0 | 0.0% | 0 | 1 | 0 | 0 | 0 | 0 |

## 角色分布

| 角色 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 库存采购 | 5 | 4 | 80.0% | 0 | 1 | 0 | 0 | 0 | 0 |

## 分类分布

| 分类 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| ranking | 5 | 4 | 80.0% | 0 | 1 | 0 |

## Top 问题原因

1. tool:capability_any_of_missing:product_sales_ranking|inventory_operations_overview：1 次

## 典型可用样本

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
- 库存采购 / ranking / 真实可用：最近卖得最好的商品依次是什么 -> 排行：
1. 商品=抗衰紧致眼霜，销量=26
2. 商品=氨基酸洁面乳，销量=21
3. 商品=玻尿酸保湿精华，销量=16
4. 商品=烟酰胺亮肤精华，销量=13
5. 商品=屏障修护乳，销量=3
6. 商品=水氧护理耗材包，销量=3
7.
- 库存采购 / ranking / 真实可用：按销售件数把产品从高到低列出来 -> 排行：
1. 商品=抗衰紧致眼霜，销量=26
2. 商品=氨基酸洁面乳，销量=21
3. 商品=玻尿酸保湿精华，销量=16
4. 商品=烟酰胺亮肤精华，销量=13
5. 商品=屏障修护乳，销量=3
6. 商品=水氧护理耗材包，销量=3
7.

## 典型问题样本

- 库存采购 / ranking / 意图未覆盖：给商品销量排个前十 -> 请补充业务对象、指标或时间范围。

## 产品结论与改进建议

1. 当前 Ami Brain 已形成六域 Domain Adapter、Supervisor、模板技能、数据库技能和受控动作预览的真实产品链路，本次真实可用率为 80.0%。
2. 当前剩余缺口集中在未覆盖意图和缺少明确业务实体，不再是关键词误命中或伪指标问题；后续应优先补采购建议、客户精确查询、权益 ROI、员工复购排行和否定纠正能力。
3. 对已识别但未接入真实口径的指标继续保持明确拒答，不使用 0、全量历史或无依据估算替代。
4. 发布门禁继续并行检查真实可用率、假阳性、时间范围、权限/跨店、动作确认、异常率和 SSE 首字延迟。
5. 本报告耗时为完整请求落库耗时；用户感知首字延迟需以 SSE 独立压测记录为准。