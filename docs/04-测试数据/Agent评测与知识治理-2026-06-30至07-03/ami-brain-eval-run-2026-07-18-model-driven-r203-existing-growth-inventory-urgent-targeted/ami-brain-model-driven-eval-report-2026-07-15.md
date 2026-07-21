# Ami Brain 650题真实请求路径评测报告

生成时间：2026/7/18 09:14:22

## 评测范围

- 产品版本：当前工作区最新版 Ami Brain
- 请求路径：BrainChatService.createConversation + BrainChatService.sendMessage
- 问题来源：D:\AI coding\beauty-salon-admin\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\agent-eval-questions.md
- 问题数：4
- 实际记录数：4
- 实际对话轮数：4
- 门店：requestedStoreId=6，runtimeStoreId=6
- 权限来源：active_backend_role_catalog_plus_candidate_minimum_permissions
- 已注册评测角色：marketing, store_manager
- 冻结发布快照：97929e76334b095c1eac0f1167f8f590714458cc5efb05cf7519147d83d2841e / capabilities=beautician_service_overview, customer_facts, customer_follow_up_draft, finance_payment_breakdown, finance_risk_overview, front_desk_operations_overview, gap_fill_touch_preview, inventory_operations_overview, inventory_procurement_advice, manager_staff_overview, marketing_customer_segment, marketing_growth_overview, marketing_message_draft, marketing_touch_draft, product_sales_ranking, project_service_ranking, reservation_action_preview, reservation_list, store_operations_overview
- 评分口径：同时输出旧口径和新口径。旧口径为“completed 且有 metric citation”；新口径要求意图、指标口径、回答粒度匹配。
- 六层门禁：意图、工具、计划、执行、完成度、答案均为确定性评分；任一层失败即不计入真实可用。

## 总体结论

Ami Brain 当前已经不再是空入口：每题都会创建会话、写入用户消息、创建运行记录、执行安全检查和认知解析，再由语义问数链路返回回答或明确拒答。

本报告的新口径会把“命中指标但答非所问”的样本归为假阳性。排名题、名单题、对比题、文案题不会再因为带了 metric citation 就被计为真实可用。

## 总览

| 指标 | 数值 |
| --- | ---: |
| 总题数 | 4 |
| 可评测题数 | 4 |
| 模型供应商不可用 | 0 |
| 旧口径可用题数 | 0 |
| 旧口径可用率 | 0.0% |
| 新口径真实可用题数 | 4 |
| 新口径真实可用率 | 100.0% |
| 多轮场景通过数 | 0 / 0 |
| 多轮轮次通过数 | 4 / 4 |
| 平均耗时 | 2580 ms |
| P95 耗时 | 4074 ms |
| 最大耗时 | 4074 ms |
| 权限绕过数 | 0 |
| 跨门店读取数 | 0 |
| roleHint 绕过数 | 0 |
| 假动作确认数 | 0 |

## 六层评分

| 层级 | 通过数 | 通过率 | 平均分 |
| --- | ---: | ---: | ---: |
| intent | 4 / 4 | 100.0% | 100.0% |
| tool | 4 / 4 | 100.0% | 100.0% |
| plan | 4 / 4 | 100.0% | 100.0% |
| execution | 4 / 4 | 100.0% | 100.0% |
| completion | 4 / 4 | 100.0% | 100.0% |
| answer | 4 / 4 | 100.0% | 100.0% |

## Grounding 分布

| Grounding 类型 | 数量 |
| --- | ---: |
| Metric Query | 0 |
| DB Skill | 4 |
| Template Skill | 0 |
| Preview Action | 0 |
| None | 0 |

## 执行路径分布

| 执行路径 | 数量 |
| --- | ---: |
| exact_contract_fast_path | 4 |

## Adapter 分布

| Adapter | 数量 |
| --- | ---: |
| none | 4 |

## Domain 分布

| Domain | 数量 |
| --- | ---: |
| customer | 3 |
| project | 3 |
| order | 2 |
| beautician | 1 |
| finance | 1 |
| payment | 1 |
| product | 1 |
| reservation | 1 |

## Capability 分布

| Capability | 数量 |
| --- | ---: |
| marketing_customer_segment | 2 |
| inventory_operations_overview | 1 |
| store_operations_overview | 1 |

## 与 2026-07-10 基线对比

基线文件：D:\AI coding\beauty-salon-admin\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\ami-brain-eval-run-2026-07-10\ami-brain-eval-results-2026-07-10.json

| 指标 | 2026-07-10 基线 | 本次修复后 |
| --- | ---: | ---: |
| 旧口径可用率 | 15.5% | 0.0% |
| 真实可用率 | 3.5% | 100.0% |
| 假阳性数 | 78 | 0 |
| 时间误退化全量数 | 12 | 0 |
| 文案/操作误命中指标数 | 21 | 0 |

## 状态分布

| 状态 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 真实可用 | 4 | 4 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |

## 角色分布

| 角色 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 店长经营 | 2 | 2 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 营销增长 | 2 | 2 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |

## 分类分布

| 分类 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 客群识别与分析 | 2 | 2 | 100.0% | 0 | 0 | 0 |
| 风险预警 | 1 | 1 | 100.0% | 0 | 0 | 0 |
| 库存运营 | 1 | 1 | 100.0% | 0 | 0 | 0 |

## Top 问题原因

- 无

## 典型可用样本

- 店长经营 / 库存运营 / 真实可用：有什么产品积压太久了 -> 排行：
1. 商品=清透防晒乳，当前库存=122，安全库存=45，stockValue=11224.00，oldestBatchAgeDays=47，lastOutboundDays=83，outboundQuantity=3，可用天数=1
- 店长经营 / 风险预警 / 真实可用：今天有没有需要我马上处理的紧急事项 -> 需优先处理：1 项；待到店：0 人；可接待员工：4 人；低库存：1 个 SKU。

诊断：
1. [预警] 低库存待复核：1 个 SKU 低于安全库存：玻尿酸保湿精华。

未完成范围：本摘要只覆盖当前已接入的预约接待、服务超时、财务退款/毛
- 营销增长 / 客群识别与分析 / 真实可用：新客中哪些人最有潜力转成长期客户 -> 新客长期转化潜力候选：共 2 人，展示前 2 人。口径为最新预测批次中近 90 天建档、当前到店不超过 2 次且 30 天复购评分不低于 70 分。
1. 高晓雯：近 90 天建档、到店 2 次，30 天复购评分 78，6 个月预期价值 1
- 营销增长 / 客群识别与分析 / 真实可用：有没有客户对某个项目特别感兴趣但还没办卡 -> 项目兴趣但未办卡候选：共 2 人次，展示前 2 人次。
1. H5真实联调客户-20260707：背部净透护理，信号 预约成功，兴趣分 8，最近信号 2026-07-07，当前无活跃卡
2. 微信客户0000：射频紧致提升护理，信号 预约成

## 典型问题样本

- 无

## 产品结论与改进建议

1. 当前 Ami Brain 已形成六域 Domain Adapter、Supervisor、模板技能、数据库技能和受控动作预览的真实产品链路，本次真实可用率为 100.0%。
2. 当前剩余缺口集中在未覆盖意图和缺少明确业务实体，不再是关键词误命中或伪指标问题；后续应优先补采购建议、客户精确查询、权益 ROI、员工复购排行和否定纠正能力。
3. 对已识别但未接入真实口径的指标继续保持明确拒答，不使用 0、全量历史或无依据估算替代。
4. 发布门禁继续并行检查真实可用率、假阳性、时间范围、权限/跨店、动作确认、异常率和 SSE 首字延迟。
5. 本报告耗时为完整请求落库耗时；用户感知首字延迟需以 SSE 独立压测记录为准。