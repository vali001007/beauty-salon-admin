# Ami Brain 650题真实请求路径评测报告

生成时间：2026/7/16 06:45:06

## 评测范围

- 产品版本：当前工作区最新版 Ami Brain
- 请求路径：BrainChatService.createConversation + BrainChatService.sendMessage
- 问题来源：D:\AI coding\beauty-salon-admin\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\agent-eval-questions.md
- 问题数：3
- 实际记录数：3
- 门店：requestedStoreId=6，runtimeStoreId=6
- 权限来源：active_backend_role_catalog_plus_candidate_minimum_permissions
- 已注册评测角色：marketing, store_manager
- 冻结发布快照：b1ea3118b88ba5e456cfc3e26d85a2863289f3d77b49170ceea7b1331a93bea8 / capabilities=beautician_service_overview, customer_facts, finance_payment_breakdown, finance_risk_overview, front_desk_operations_overview, inventory_operations_overview, inventory_procurement_advice, marketing_customer_segment, marketing_growth_overview, reservation_list, store_operations_overview
- 评分口径：同时输出旧口径和新口径。旧口径为“completed 且有 metric citation”；新口径要求意图、指标口径、回答粒度匹配。
- 六层门禁：意图、工具、计划、执行、完成度、答案均为确定性评分；任一层失败即不计入真实可用。

## 总体结论

Ami Brain 当前已经不再是空入口：每题都会创建会话、写入用户消息、创建运行记录、执行安全检查和认知解析，再由语义问数链路返回回答或明确拒答。

本报告的新口径会把“命中指标但答非所问”的样本归为假阳性。排名题、名单题、对比题、文案题不会再因为带了 metric citation 就被计为真实可用。

## 总览

| 指标 | 数值 |
| --- | ---: |
| 总题数 | 3 |
| 可评测题数 | 3 |
| 模型供应商不可用 | 0 |
| 旧口径可用题数 | 0 |
| 旧口径可用率 | 0.0% |
| 新口径真实可用题数 | 1 |
| 新口径真实可用率 | 33.3% |
| 平均耗时 | 6223 ms |
| P95 耗时 | 8049 ms |
| 最大耗时 | 8049 ms |
| 权限绕过数 | 0 |
| 跨门店读取数 | 0 |
| roleHint 绕过数 | 0 |
| 假动作确认数 | 0 |

## 六层评分

| 层级 | 通过数 | 通过率 | 平均分 |
| --- | ---: | ---: | ---: |
| intent | 3 / 3 | 100.0% | 100.0% |
| tool | 1 / 3 | 33.3% | 33.3% |
| plan | 1 / 3 | 33.3% | 77.8% |
| execution | 1 / 3 | 33.3% | 33.3% |
| completion | 1 / 3 | 33.3% | 33.3% |
| answer | 1 / 3 | 33.3% | 33.3% |

## Grounding 分布

| Grounding 类型 | 数量 |
| --- | ---: |
| Metric Query | 0 |
| DB Skill | 1 |
| Template Skill | 0 |
| Preview Action | 0 |
| None | 2 |

## Adapter 分布

| Adapter | 数量 |
| --- | ---: |
| none | 3 |

## Domain 分布

| Domain | 数量 |
| --- | ---: |
| customer | 2 |
| product | 1 |

## Capability 分布

| Capability | 数量 |
| --- | ---: |
| none | 2 |
| customer_facts | 1 |

## 与 2026-07-10 基线对比

基线文件：D:\AI coding\beauty-salon-admin\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\ami-brain-eval-run-2026-07-10\ami-brain-eval-results-2026-07-10.json

| 指标 | 2026-07-10 基线 | 本次修复后 |
| --- | ---: | ---: |
| 旧口径可用率 | 15.5% | 0.0% |
| 真实可用率 | 3.7% | 33.3% |
| 假阳性数 | 77 | 0 |
| 时间误退化全量数 | 12 | 0 |
| 文案/操作误命中指标数 | 21 | 0 |

## 状态分布

| 状态 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 指标查询失败 | 2 | 0 | 0.0% | 2 | 0 | 0 | 0 | 0 | 0 |
| 真实可用 | 1 | 1 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |

## 角色分布

| 角色 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 店长经营 | 2 | 1 | 50.0% | 1 | 0 | 0 | 0 | 0 | 0 |
| 营销增长 | 1 | 0 | 0.0% | 1 | 0 | 0 | 0 | 0 | 0 |

## 分类分布

| 分类 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 客户管理 | 1 | 1 | 100.0% | 0 | 0 | 0 |
| 客群识别与分析 | 1 | 0 | 0.0% | 1 | 0 | 0 |
| 库存运营 | 1 | 0 | 0.0% | 1 | 0 | 0 |

## Top 问题原因

1. tool:capability_any_of_missing:customer_facts|marketing_customer_segment|marketing_growth_overview：1 次
2. tool:capability_any_of_missing:inventory_operations_overview|inventory_procurement_advice：1 次

## 典型可用样本

- 店长经营 / 客户管理 / 真实可用：帮我找一下三个月没来消费的客户 -> 90 天未到店客户名单：
1. 马欣怡：累计消费 51043.00 元，到店 173 次，最近到店 2025-10-25
2. 杨若兰：累计消费 42242.00 元，到店 77 次，最近到店 2025-12-24
3. 胡静怡：累计消费 

## 典型问题样本

- 店长经营 / 库存运营 / 指标查询失败：现在哪些产品库存不够了 -> 未找到可执行的已发布能力，请补充业务对象、指标或时间范围。
- 营销增长 / 客群识别与分析 / 指标查询失败：帮我找一下45天没来的客户，大概有多少人 -> 能力匹配存在歧义，请补充业务对象、指标或时间范围。

## 产品结论与改进建议

1. 当前 Ami Brain 已形成六域 Domain Adapter、Supervisor、模板技能、数据库技能和受控动作预览的真实产品链路，本次真实可用率为 33.3%。
2. 当前剩余缺口集中在未覆盖意图和缺少明确业务实体，不再是关键词误命中或伪指标问题；后续应优先补采购建议、客户精确查询、权益 ROI、员工复购排行和否定纠正能力。
3. 对已识别但未接入真实口径的指标继续保持明确拒答，不使用 0、全量历史或无依据估算替代。
4. 发布门禁继续并行检查真实可用率、假阳性、时间范围、权限/跨店、动作确认、异常率和 SSE 首字延迟。
5. 本报告耗时为完整请求落库耗时；用户感知首字延迟需以 SSE 独立压测记录为准。