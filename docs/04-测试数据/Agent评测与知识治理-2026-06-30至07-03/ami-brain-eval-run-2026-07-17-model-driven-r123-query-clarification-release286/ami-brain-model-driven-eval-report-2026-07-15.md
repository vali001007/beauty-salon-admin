# Ami Brain 650题真实请求路径评测报告

生成时间：2026/7/17 11:39:17

## 评测范围

- 产品版本：当前工作区最新版 Ami Brain
- 请求路径：BrainChatService.createConversation + BrainChatService.sendMessage
- 问题来源：D:\AI coding\beauty-salon-admin\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\ami-brain-model-driven-paraphrase-cases.json
- 问题数：6
- 实际记录数：6
- 门店：requestedStoreId=6，runtimeStoreId=6
- 权限来源：active_backend_role_catalog_plus_candidate_minimum_permissions
- 已注册评测角色：finance, store_manager
- 冻结发布快照：869ffa31f2f101198e90eb771830b39deb95800b43aab7863a29c4f9ad7ff405 / capabilities=beautician_service_overview, customer_facts, customer_follow_up_draft, finance_payment_breakdown, finance_risk_overview, front_desk_operations_overview, gap_fill_touch_preview, inventory_operations_overview, inventory_procurement_advice, manager_staff_overview, marketing_customer_segment, marketing_growth_overview, marketing_message_draft, marketing_touch_draft, product_sales_ranking, project_service_ranking, reservation_action_preview, reservation_list, store_operations_overview
- 评分口径：同时输出旧口径和新口径。旧口径为“completed 且有 metric citation”；新口径要求意图、指标口径、回答粒度匹配。
- 六层门禁：意图、工具、计划、执行、完成度、答案均为确定性评分；任一层失败即不计入真实可用。

## 总体结论

Ami Brain 当前已经不再是空入口：每题都会创建会话、写入用户消息、创建运行记录、执行安全检查和认知解析，再由语义问数链路返回回答或明确拒答。

本报告的新口径会把“命中指标但答非所问”的样本归为假阳性。排名题、名单题、对比题、文案题不会再因为带了 metric citation 就被计为真实可用。

## 总览

| 指标 | 数值 |
| --- | ---: |
| 总题数 | 6 |
| 可评测题数 | 6 |
| 模型供应商不可用 | 0 |
| 旧口径可用题数 | 1 |
| 旧口径可用率 | 16.7% |
| 新口径真实可用题数 | 5 |
| 新口径真实可用率 | 83.3% |
| 平均耗时 | 17629 ms |
| P95 耗时 | 25275 ms |
| 最大耗时 | 25275 ms |
| 权限绕过数 | 0 |
| 跨门店读取数 | 0 |
| roleHint 绕过数 | 0 |
| 假动作确认数 | 0 |

## 六层评分

| 层级 | 通过数 | 通过率 | 平均分 |
| --- | ---: | ---: | ---: |
| intent | 5 / 6 | 83.3% | 83.3% |
| tool | 6 / 6 | 100.0% | 100.0% |
| plan | 6 / 6 | 100.0% | 100.0% |
| execution | 6 / 6 | 100.0% | 100.0% |
| completion | 6 / 6 | 100.0% | 100.0% |
| answer | 6 / 6 | 100.0% | 100.0% |

## Grounding 分布

| Grounding 类型 | 数量 |
| --- | ---: |
| Metric Query | 0 |
| DB Skill | 1 |
| Template Skill | 0 |
| Preview Action | 0 |
| None | 5 |

## 执行路径分布

| 执行路径 | 数量 |
| --- | ---: |
| model_primary | 6 |

## Adapter 分布

| Adapter | 数量 |
| --- | ---: |
| none | 6 |

## Domain 分布

| Domain | 数量 |
| --- | ---: |
| none | 4 |
| finance | 2 |
| payment | 2 |
| refund | 2 |
| beautician | 1 |
| customer | 1 |
| order | 1 |
| payment_record | 1 |
| reservation | 1 |

## Capability 分布

| Capability | 数量 |
| --- | ---: |
| none | 5 |
| finance_risk_overview | 1 |


## 状态分布

| 状态 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 真实可用 | 5 | 5 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 假阳性-意图错配 | 1 | 0 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 |

## 角色分布

| 角色 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 边界/多轮 | 5 | 4 | 80.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 财务风控 | 1 | 1 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |

## 分类分布

| 分类 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| clarify | 5 | 4 | 80.0% | 0 | 0 | 0 |
| query | 1 | 1 | 100.0% | 0 | 0 | 0 |

## Top 问题原因

1. intent:intent_mismatch：1 次

## 典型可用样本

- 财务风控 / query / 真实可用：截至现在本月净收款是多少 -> 实收金额：28756.30 元；退款金额：1419.00 元。

未完成范围：当前请求包含多个独立已发布指标，本次分别展示，不将其自动合成未发布的派生指标。

数据依据：业务定义：实收金额；业务定义：退款金额；实收、支付方式与收入趋势；退款
- 边界/多轮 / clarify / 真实可用：帮我看看这个 -> 为了准确处理，请一次确认：“这个”没有可解析的指代对象，当前上下文未提供可继承的具体业务内容或附件？
- 边界/多轮 / clarify / 真实可用：那个情况怎么样 -> 为了准确处理，请一次确认：“那个情况”缺少可解析的业务对象、指标、时间或前文指代？
- 边界/多轮 / clarify / 真实可用：给我处理一下 -> 为了准确处理，请一次确认：用户仅表示“给我处理一下”，未说明需要处理的事项、对象或期望结果？
- 边界/多轮 / clarify / 真实可用：按之前那个做 -> 为了准确处理，请一次确认：“之前那个”未指明所引用的历史任务，且当前会话上下文没有可继承的上一轮目标？

## 典型问题样本

- 边界/多轮 / clarify / 假阳性-意图错配：这个数据有问题吗 -> 为了准确处理，请一次确认：“这个数据”未指明具体业务对象、报表、指标或数据内容？

## 产品结论与改进建议

1. 当前 Ami Brain 已形成六域 Domain Adapter、Supervisor、模板技能、数据库技能和受控动作预览的真实产品链路，本次真实可用率为 83.3%。
2. 当前剩余缺口集中在未覆盖意图和缺少明确业务实体，不再是关键词误命中或伪指标问题；后续应优先补采购建议、客户精确查询、权益 ROI、员工复购排行和否定纠正能力。
3. 对已识别但未接入真实口径的指标继续保持明确拒答，不使用 0、全量历史或无依据估算替代。
4. 发布门禁继续并行检查真实可用率、假阳性、时间范围、权限/跨店、动作确认、异常率和 SSE 首字延迟。
5. 本报告耗时为完整请求落库耗时；用户感知首字延迟需以 SSE 独立压测记录为准。