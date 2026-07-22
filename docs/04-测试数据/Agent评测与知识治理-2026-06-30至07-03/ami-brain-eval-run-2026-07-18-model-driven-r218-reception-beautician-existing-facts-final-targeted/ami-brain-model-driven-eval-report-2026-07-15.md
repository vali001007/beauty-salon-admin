# Ami Brain 650题真实请求路径评测报告

生成时间：2026/7/18 12:42:38

## 评测范围

- 产品版本：当前工作区最新版 Ami Brain
- 请求路径：BrainChatService.createConversation + BrainChatService.sendMessage
- 问题来源：D:\AI coding\beauty-salon-admin\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\agent-eval-questions.md
- 问题数：19
- 实际记录数：19
- 实际对话轮数：19
- 门店：requestedStoreId=6，runtimeStoreId=6
- 权限来源：active_backend_role_catalog_plus_candidate_minimum_permissions
- 已注册评测角色：beautician, receptionist
- 冻结发布快照：4876c4c71ace5b799f90b273906d8d0c6ef71c8346996e6fbd81d102d9dfbc43 / capabilities=beautician_customer_card_progress, beautician_material_preparation, beautician_service_overview, customer_facts, customer_follow_up_draft, finance_payment_breakdown, finance_risk_overview, front_desk_operations_overview, gap_fill_touch_preview, inventory_operations_overview, inventory_procurement_advice, manager_staff_overview, marketing_customer_segment, marketing_growth_overview, marketing_message_draft, marketing_touch_draft, product_sales_ranking, project_service_ranking, reservation_action_preview, reservation_list, store_operations_overview
- 评分口径：同时输出旧口径和新口径。旧口径为“completed 且有 metric citation”；新口径要求意图、指标口径、回答粒度匹配。
- 六层门禁：意图、工具、计划、执行、完成度、答案均为确定性评分；任一层失败即不计入真实可用。

## 总体结论

Ami Brain 当前已经不再是空入口：每题都会创建会话、写入用户消息、创建运行记录、执行安全检查和认知解析，再由语义问数链路返回回答或明确拒答。

本报告的新口径会把“命中指标但答非所问”的样本归为假阳性。排名题、名单题、对比题、文案题不会再因为带了 metric citation 就被计为真实可用。

## 总览

| 指标 | 数值 |
| --- | ---: |
| 总题数 | 19 |
| 可评测题数 | 19 |
| 模型供应商不可用 | 0 |
| 旧口径可用题数 | 0 |
| 旧口径可用率 | 0.0% |
| 新口径真实可用题数 | 16 |
| 新口径真实可用率 | 84.2% |
| 多轮场景通过数 | 0 / 0 |
| 多轮轮次通过数 | 16 / 19 |
| 平均耗时 | 9521 ms |
| P95 耗时 | 32344 ms |
| 最大耗时 | 32344 ms |
| 权限绕过数 | 0 |
| 跨门店读取数 | 0 |
| roleHint 绕过数 | 0 |
| 假动作确认数 | 0 |

## 六层评分

| 层级 | 通过数 | 通过率 | 平均分 |
| --- | ---: | ---: | ---: |
| intent | 19 / 19 | 100.0% | 100.0% |
| tool | 19 / 19 | 100.0% | 100.0% |
| plan | 19 / 19 | 100.0% | 100.0% |
| execution | 19 / 19 | 100.0% | 100.0% |
| completion | 19 / 19 | 100.0% | 100.0% |
| answer | 16 / 19 | 84.2% | 84.2% |

## Grounding 分布

| Grounding 类型 | 数量 |
| --- | ---: |
| Metric Query | 0 |
| DB Skill | 16 |
| Template Skill | 0 |
| Preview Action | 0 |
| None | 3 |

## 执行路径分布

| 执行路径 | 数量 |
| --- | ---: |
| exact_contract_fast_path | 17 |
| model_primary | 2 |

## Adapter 分布

| Adapter | 数量 |
| --- | ---: |
| none | 19 |

## Domain 分布

| Domain | 数量 |
| --- | ---: |
| customer | 18 |
| project | 16 |
| reservation | 16 |
| beautician | 9 |
| product | 1 |

## Capability 分布

| Capability | 数量 |
| --- | ---: |
| beautician_service_overview | 7 |
| front_desk_operations_overview | 7 |
| beautician_customer_card_progress | 2 |
| reservation_list | 2 |
| beautician_material_preparation | 1 |

## 与 2026-07-10 基线对比

基线文件：D:\AI coding\beauty-salon-admin\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\ami-brain-eval-run-2026-07-10\ami-brain-eval-results-2026-07-10.json

| 指标 | 2026-07-10 基线 | 本次修复后 |
| --- | ---: | ---: |
| 旧口径可用率 | 15.5% | 0.0% |
| 真实可用率 | 3.4% | 84.2% |
| 假阳性数 | 79 | 0 |
| 时间误退化全量数 | 12 | 0 |
| 文案/操作误命中指标数 | 21 | 0 |

## 状态分布

| 状态 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 真实可用 | 16 | 16 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 意图未覆盖 | 3 | 0 | 0.0% | 0 | 3 | 0 | 0 | 0 | 0 |

## 角色分布

| 角色 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 美容师服务 | 10 | 8 | 80.0% | 0 | 2 | 0 | 0 | 0 | 0 |
| 前台接待 | 9 | 8 | 88.9% | 0 | 1 | 0 | 0 | 0 | 0 |

## 分类分布

| 分类 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 今日服务安排 | 10 | 8 | 80.0% | 0 | 2 | 0 |
| 预约管理 | 9 | 8 | 88.9% | 0 | 1 | 0 |

## Top 问题原因

1. answer:unsupported_intent：3 次

## 典型可用样本

- 前台接待 / 预约管理 / 真实可用：今天下午还有几个预约没到 -> 今天没有已预约待到店客户。

明细：当前没有匹配数据。

数据依据：预约到店与员工忙闲快照；服务超时影响分析；门店预约排期。
- 前台接待 / 预约管理 / 真实可用：张美丽的预约是几点，做什么项目 -> 今天没有找到匹配的预约记录。

明细：当前没有匹配数据。

数据依据：门店预约清单。
- 前台接待 / 预约管理 / 真实可用：有没有预约了但还没确认的客人 -> 今天没有待确认预约。

明细：当前没有匹配数据。

数据依据：预约到店与员工忙闲快照；服务超时影响分析；门店预约排期。
- 前台接待 / 预约管理 / 真实可用：下午3点那个预约是谁，有什么要注意的 -> 今天没有找到匹配的预约记录。

明细：当前没有匹配数据。

数据依据：预约到店与员工忙闲快照；服务超时影响分析；门店预约排期。
- 前台接待 / 预约管理 / 真实可用：帮我看一下今天赵美容师的预约安排 -> 今天没有找到匹配的预约记录。

明细：当前没有匹配数据。

数据依据：门店预约清单。
- 前台接待 / 预约管理 / 真实可用：今天有几个预约是做面部的，几个是身体的 -> 今天按项目分类统计：没有有效预约。

明细：当前没有匹配数据。

数据依据：预约到店与员工忙闲快照；服务超时影响分析；门店预约排期。
- 前台接待 / 预约管理 / 真实可用：有没有预约超过两小时没有确认的 -> 今天没有超过两小时仍未确认预约。

明细：当前没有匹配数据。

数据依据：预约到店与员工忙闲快照；服务超时影响分析；门店预约排期。
- 前台接待 / 预约管理 / 真实可用：今天下午最后一个预约是几点，是谁 -> 今天没有有效预约。

明细：当前没有匹配数据。

数据依据：预约到店与员工忙闲快照；服务超时影响分析；门店预约排期。

## 典型问题样本

- 前台接待 / 预约管理 / 意图未覆盖：帮我确认一下明天所有预约都通知到位了吗 -> 现有预约记录没有统一的通知发送与送达回执字段，无法确认预约是否已经通知到位。Ami Brain 不会用预约状态代替消息送达状态。
- 美容师服务 / 今日服务安排 / 意图未覆盖：今天有没有安排我去做培训或其他任务 -> 当前美容师能力只接入个人预约与服务事实，没有统一的培训或其他任务排期数据，无法判断今天是否另有培训或非预约任务。
- 美容师服务 / 今日服务安排 / 意图未覆盖：下一个客人最近情绪状态怎么样，需要特别关心吗 -> 当前客户档案没有结构化、可审计的近期情绪状态，无法推断客户情绪。可以查看已有客户备注和明确注意事项，但不会据此给客户贴情绪标签。

## 产品结论与改进建议

1. 当前 Ami Brain 已形成六域 Domain Adapter、Supervisor、模板技能、数据库技能和受控动作预览的真实产品链路，本次真实可用率为 84.2%。
2. 当前剩余缺口集中在未覆盖意图和缺少明确业务实体，不再是关键词误命中或伪指标问题；后续应优先补采购建议、客户精确查询、权益 ROI、员工复购排行和否定纠正能力。
3. 对已识别但未接入真实口径的指标继续保持明确拒答，不使用 0、全量历史或无依据估算替代。
4. 发布门禁继续并行检查真实可用率、假阳性、时间范围、权限/跨店、动作确认、异常率和 SSE 首字延迟。
5. 本报告耗时为完整请求落库耗时；用户感知首字延迟需以 SSE 独立压测记录为准。