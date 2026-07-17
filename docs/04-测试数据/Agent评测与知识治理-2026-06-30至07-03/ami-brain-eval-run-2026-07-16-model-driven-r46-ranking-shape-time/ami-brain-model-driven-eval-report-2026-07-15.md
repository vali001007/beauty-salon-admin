# Ami Brain 650题真实请求路径评测报告

生成时间：2026/7/16 16:43:18

## 评测范围

- 产品版本：当前工作区最新版 Ami Brain
- 请求路径：BrainChatService.createConversation + BrainChatService.sendMessage
- 问题来源：D:\AI coding\beauty-salon-admin\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\agent-eval-questions.md
- 问题数：2
- 实际记录数：2
- 门店：requestedStoreId=6，runtimeStoreId=6
- 权限来源：active_backend_role_catalog_plus_candidate_minimum_permissions
- 已注册评测角色：store_manager
- 冻结发布快照：e79ff4f6403aa0e77bcce529f19142306a164c97c32df6802df6cc22b9043af3 / capabilities=beautician_service_overview, customer_facts, finance_payment_breakdown, finance_risk_overview, front_desk_operations_overview, inventory_operations_overview, inventory_procurement_advice, manager_staff_overview, marketing_customer_segment, marketing_growth_overview, product_sales_ranking, project_service_ranking, reservation_list, store_operations_overview
- 评分口径：同时输出旧口径和新口径。旧口径为“completed 且有 metric citation”；新口径要求意图、指标口径、回答粒度匹配。
- 六层门禁：意图、工具、计划、执行、完成度、答案均为确定性评分；任一层失败即不计入真实可用。

## 总体结论

Ami Brain 当前已经不再是空入口：每题都会创建会话、写入用户消息、创建运行记录、执行安全检查和认知解析，再由语义问数链路返回回答或明确拒答。

本报告的新口径会把“命中指标但答非所问”的样本归为假阳性。排名题、名单题、对比题、文案题不会再因为带了 metric citation 就被计为真实可用。

## 总览

| 指标 | 数值 |
| --- | ---: |
| 总题数 | 2 |
| 可评测题数 | 2 |
| 模型供应商不可用 | 0 |
| 旧口径可用题数 | 2 |
| 旧口径可用率 | 100.0% |
| 新口径真实可用题数 | 2 |
| 新口径真实可用率 | 100.0% |
| 平均耗时 | 13023 ms |
| P95 耗时 | 13545 ms |
| 最大耗时 | 13545 ms |
| 权限绕过数 | 0 |
| 跨门店读取数 | 0 |
| roleHint 绕过数 | 0 |
| 假动作确认数 | 0 |

## 六层评分

| 层级 | 通过数 | 通过率 | 平均分 |
| --- | ---: | ---: | ---: |
| intent | 2 / 2 | 100.0% | 100.0% |
| tool | 2 / 2 | 100.0% | 100.0% |
| plan | 2 / 2 | 100.0% | 100.0% |
| execution | 2 / 2 | 100.0% | 100.0% |
| completion | 2 / 2 | 100.0% | 100.0% |
| answer | 2 / 2 | 100.0% | 100.0% |

## Grounding 分布

| Grounding 类型 | 数量 |
| --- | ---: |
| Metric Query | 0 |
| DB Skill | 2 |
| Template Skill | 0 |
| Preview Action | 0 |
| None | 0 |

## Adapter 分布

| Adapter | 数量 |
| --- | ---: |
| none | 2 |

## Domain 分布

| Domain | 数量 |
| --- | ---: |
| order | 2 |
| product | 1 |
| project | 1 |

## Capability 分布

| Capability | 数量 |
| --- | ---: |
| product_sales_ranking | 1 |
| project_service_ranking | 1 |

## 与 2026-07-10 基线对比

基线文件：D:\AI coding\beauty-salon-admin\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\ami-brain-eval-run-2026-07-10\ami-brain-eval-results-2026-07-10.json

| 指标 | 2026-07-10 基线 | 本次修复后 |
| --- | ---: | ---: |
| 旧口径可用率 | 15.5% | 100.0% |
| 真实可用率 | 3.7% | 100.0% |
| 假阳性数 | 77 | 0 |
| 时间误退化全量数 | 12 | 0 |
| 文案/操作误命中指标数 | 21 | 0 |

## 状态分布

| 状态 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 真实可用 | 2 | 2 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |

## 角色分布

| 角色 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 店长经营 | 2 | 2 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |

## 分类分布

| 分类 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 经营概览 | 1 | 1 | 100.0% | 0 | 0 | 0 |
| 库存运营 | 1 | 1 | 100.0% | 0 | 0 | 0 |

## Top 问题原因

- 无

## 典型可用样本

- 店长经营 / 经营概览 / 真实可用：今天哪个项目做得最多 -> 排行：当前时间范围没有可排行的数据。

指标：项目服务次数：0（口径版本 6）。

未完成范围：当前时间范围没有可排行的数据。

数据依据：业务定义：项目服务次数。
- 店长经营 / 库存运营 / 真实可用：最近卖得最好的产品是什么 -> 排行：
1. productId=86，productName=抗衰紧致眼霜，product_sales_quantity=26
2. productId=84，productName=氨基酸洁面乳，product_sales_quanti

## 典型问题样本

- 无

## 产品结论与改进建议

1. 当前 Ami Brain 已形成六域 Domain Adapter、Supervisor、模板技能、数据库技能和受控动作预览的真实产品链路，本次真实可用率为 100.0%。
2. 当前剩余缺口集中在未覆盖意图和缺少明确业务实体，不再是关键词误命中或伪指标问题；后续应优先补采购建议、客户精确查询、权益 ROI、员工复购排行和否定纠正能力。
3. 对已识别但未接入真实口径的指标继续保持明确拒答，不使用 0、全量历史或无依据估算替代。
4. 发布门禁继续并行检查真实可用率、假阳性、时间范围、权限/跨店、动作确认、异常率和 SSE 首字延迟。
5. 本报告耗时为完整请求落库耗时；用户感知首字延迟需以 SSE 独立压测记录为准。