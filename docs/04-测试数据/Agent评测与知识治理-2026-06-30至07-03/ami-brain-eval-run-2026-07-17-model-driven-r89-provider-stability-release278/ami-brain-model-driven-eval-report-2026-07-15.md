# Ami Brain 650题真实请求路径评测报告

生成时间：2026/7/17 04:51:47

## 评测范围

- 产品版本：当前工作区最新版 Ami Brain
- 请求路径：BrainChatService.createConversation + BrainChatService.sendMessage
- 问题来源：D:\AI coding\beauty-salon-admin\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\ami-brain-model-driven-paraphrase-cases.json
- 问题数：5
- 实际记录数：5
- 门店：requestedStoreId=6，runtimeStoreId=6
- 权限来源：active_backend_role_catalog_plus_candidate_minimum_permissions
- 已注册评测角色：finance
- 冻结发布快照：a7c3cc0aa52511f8150bc94f36c67fdb12eaf42c2d70db8e1c220085b1600841 / capabilities=beautician_service_overview, customer_facts, finance_payment_breakdown, finance_risk_overview, front_desk_operations_overview, inventory_operations_overview, inventory_procurement_advice, manager_staff_overview, marketing_customer_segment, marketing_growth_overview, product_sales_ranking, project_service_ranking, reservation_list, store_operations_overview
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
| 旧口径可用题数 | 3 |
| 旧口径可用率 | 60.0% |
| 新口径真实可用题数 | 5 |
| 新口径真实可用率 | 100.0% |
| 平均耗时 | 7981 ms |
| P95 耗时 | 9309 ms |
| 最大耗时 | 9309 ms |
| 权限绕过数 | 0 |
| 跨门店读取数 | 0 |
| roleHint 绕过数 | 0 |
| 假动作确认数 | 0 |

## 六层评分

| 层级 | 通过数 | 通过率 | 平均分 |
| --- | ---: | ---: | ---: |
| intent | 5 / 5 | 100.0% | 100.0% |
| tool | 5 / 5 | 100.0% | 100.0% |
| plan | 5 / 5 | 100.0% | 100.0% |
| execution | 5 / 5 | 100.0% | 100.0% |
| completion | 5 / 5 | 100.0% | 100.0% |
| answer | 5 / 5 | 100.0% | 100.0% |

## Grounding 分布

| Grounding 类型 | 数量 |
| --- | ---: |
| Metric Query | 0 |
| DB Skill | 5 |
| Template Skill | 0 |
| Preview Action | 0 |
| None | 0 |

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
| finance | 5 |
| payment | 5 |
| payment_record | 3 |
| operating_cost | 2 |
| refund | 2 |

## Capability 分布

| Capability | 数量 |
| --- | ---: |
| finance_payment_breakdown | 3 |
| finance_risk_overview | 2 |


## 状态分布

| 状态 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 真实可用 | 5 | 5 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |

## 角色分布

| 角色 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 财务风控 | 5 | 5 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |

## 分类分布

| 分类 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| comparison | 3 | 3 | 100.0% | 0 | 0 | 0 |
| diagnosis | 2 | 2 | 100.0% | 0 | 0 | 0 |

## Top 问题原因

- 无

## 典型可用样本

- 财务风控 / comparison / 真实可用：本月进账和上月相比变化多少 -> 对比：实收金额，当前 本月 28756.30 元，上一期 上月 127761.01 元，变化 -99004.71 元（-77.5%）。

数据依据：财务支付方式拆分；业务定义：实收金额。
- 财务风控 / comparison / 真实可用：把七月和六月实收放一起比较 -> 对比：实收金额，当前 7月 28756.30 元，上一期 6月 127761.01 元，变化 -99004.71 元（-77.5%）。

数据依据：财务支付方式拆分；业务定义：实收金额。
- 财务风控 / comparison / 真实可用：上月到本月收款增减了几成 -> 对比：实收金额，当前 本月 28756.30 元，上一期 上月 127761.01 元，变化 -99004.71 元（-77.5%）。

数据依据：财务支付方式拆分；业务定义：实收金额。
- 财务风控 / diagnosis / 真实可用：帮我拆解这段时间利润率变差的问题 -> 实收：28756.30 元；退款：1419.00 元（4 笔）；优惠：1674.70 元；毛利：16154.94 元；毛利率：59.5%；会员卡负债：1067817.81 元。

排行：
1. 支付方式=wechat，金额=15086.10
- 财务风控 / diagnosis / 真实可用：为什么最近做得不少却不赚钱 -> 实收：120885.31 元；退款：4299.00 元（5 笔）；优惠：4357.69 元；毛利：78804.36 元；毛利率：71.7%；会员卡负债：1067817.81 元。

排行：
1. 支付方式=wechat，金额=75057.6

## 典型问题样本

- 无

## 产品结论与改进建议

1. 当前 Ami Brain 已形成六域 Domain Adapter、Supervisor、模板技能、数据库技能和受控动作预览的真实产品链路，本次真实可用率为 100.0%。
2. 当前剩余缺口集中在未覆盖意图和缺少明确业务实体，不再是关键词误命中或伪指标问题；后续应优先补采购建议、客户精确查询、权益 ROI、员工复购排行和否定纠正能力。
3. 对已识别但未接入真实口径的指标继续保持明确拒答，不使用 0、全量历史或无依据估算替代。
4. 发布门禁继续并行检查真实可用率、假阳性、时间范围、权限/跨店、动作确认、异常率和 SSE 首字延迟。
5. 本报告耗时为完整请求落库耗时；用户感知首字延迟需以 SSE 独立压测记录为准。