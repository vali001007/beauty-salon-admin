# Ami Brain 650题真实请求路径评测报告

生成时间：2026/7/17 18:22:53

## 评测范围

- 产品版本：当前工作区最新版 Ami Brain
- 请求路径：BrainChatService.createConversation + BrainChatService.sendMessage
- 问题来源：D:\AI coding\beauty-salon-admin\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\agent-eval-questions.md
- 问题数：12
- 实际记录数：12
- 实际对话轮数：12
- 门店：requestedStoreId=6，runtimeStoreId=6
- 权限来源：active_backend_role_catalog_plus_candidate_minimum_permissions
- 已注册评测角色：store_manager
- 冻结发布快照：eaf8548ff35f7ee08a5ff5ca73da2fe9f410a42143a9a3be57c3411ab269bf77 / capabilities=beautician_service_overview, customer_facts, customer_follow_up_draft, finance_payment_breakdown, finance_risk_overview, front_desk_operations_overview, gap_fill_touch_preview, inventory_operations_overview, inventory_procurement_advice, manager_staff_overview, marketing_customer_segment, marketing_growth_overview, marketing_message_draft, marketing_touch_draft, product_sales_ranking, project_service_ranking, reservation_action_preview, reservation_list, store_operations_overview
- 评分口径：同时输出旧口径和新口径。旧口径为“completed 且有 metric citation”；新口径要求意图、指标口径、回答粒度匹配。
- 六层门禁：意图、工具、计划、执行、完成度、答案均为确定性评分；任一层失败即不计入真实可用。

## 总体结论

Ami Brain 当前已经不再是空入口：每题都会创建会话、写入用户消息、创建运行记录、执行安全检查和认知解析，再由语义问数链路返回回答或明确拒答。

本报告的新口径会把“命中指标但答非所问”的样本归为假阳性。排名题、名单题、对比题、文案题不会再因为带了 metric citation 就被计为真实可用。

## 总览

| 指标 | 数值 |
| --- | ---: |
| 总题数 | 12 |
| 可评测题数 | 12 |
| 模型供应商不可用 | 0 |
| 旧口径可用题数 | 7 |
| 旧口径可用率 | 58.3% |
| 新口径真实可用题数 | 10 |
| 新口径真实可用率 | 83.3% |
| 多轮场景通过数 | 0 / 0 |
| 多轮轮次通过数 | 10 / 12 |
| 平均耗时 | 6425 ms |
| P95 耗时 | 26843 ms |
| 最大耗时 | 26843 ms |
| 权限绕过数 | 0 |
| 跨门店读取数 | 0 |
| roleHint 绕过数 | 0 |
| 假动作确认数 | 0 |

## 六层评分

| 层级 | 通过数 | 通过率 | 平均分 |
| --- | ---: | ---: | ---: |
| intent | 11 / 12 | 91.7% | 95.8% |
| tool | 11 / 12 | 91.7% | 91.7% |
| plan | 11 / 12 | 91.7% | 97.2% |
| execution | 12 / 12 | 100.0% | 100.0% |
| completion | 11 / 12 | 91.7% | 94.4% |
| answer | 10 / 12 | 83.3% | 83.3% |

## Grounding 分布

| Grounding 类型 | 数量 |
| --- | ---: |
| Metric Query | 0 |
| DB Skill | 10 |
| Template Skill | 0 |
| Preview Action | 0 |
| None | 2 |

## 执行路径分布

| 执行路径 | 数量 |
| --- | ---: |
| exact_contract_fast_path | 9 |
| model_primary | 3 |

## Adapter 分布

| Adapter | 数量 |
| --- | ---: |
| none | 12 |

## Domain 分布

| Domain | 数量 |
| --- | ---: |
| customer | 8 |
| beautician | 3 |
| finance | 3 |
| payment | 3 |
| staff | 3 |
| operating_cost | 2 |
| product_order | 2 |
| refund | 2 |
| reservation | 2 |
| marketing | 1 |
| payment_record | 1 |

## Capability 分布

| Capability | 数量 |
| --- | ---: |
| customer_facts | 5 |
| manager_staff_overview | 3 |
| finance_risk_overview | 2 |
| finance_payment_breakdown | 1 |
| none | 1 |

## 与 2026-07-10 基线对比

基线文件：D:\AI coding\beauty-salon-admin\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\ami-brain-eval-run-2026-07-10\ami-brain-eval-results-2026-07-10.json

| 指标 | 2026-07-10 基线 | 本次修复后 |
| --- | ---: | ---: |
| 旧口径可用率 | 15.5% | 58.3% |
| 真实可用率 | 3.7% | 83.3% |
| 假阳性数 | 77 | 0 |
| 时间误退化全量数 | 12 | 0 |
| 文案/操作误命中指标数 | 21 | 0 |

## 状态分布

| 状态 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 真实可用 | 10 | 10 | 100.0% | 0 | 0 | 0 | 0 | 0 | 0 |
| 意图未覆盖 | 2 | 0 | 0.0% | 0 | 2 | 0 | 0 | 0 | 0 |

## 角色分布

| 角色 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 供应商不可用 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 店长经营 | 12 | 10 | 83.3% | 0 | 2 | 0 | 0 | 0 | 0 |

## 分类分布

| 分类 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 客户管理 | 6 | 5 | 83.3% | 0 | 1 | 0 |
| 经营概览 | 3 | 3 | 100.0% | 0 | 0 | 0 |
| 员工管理 | 3 | 2 | 66.7% | 0 | 1 | 0 |

## Top 问题原因

1. intent:intent_mismatch：1 次
2. tool:capability_any_of_missing:customer_facts|manager_staff_overview|marketing_customer_segment|marketing_growth_overview|store_operations_overview：1 次

## 典型可用样本

- 店长经营 / 经营概览 / 真实可用：今天退款有几笔，金额多少 -> 退款金额：0.00 元；退款笔数：0 笔。

未完成范围：当前请求包含多个独立已发布指标，本次分别展示，不将其自动合成未发布的派生指标。

数据依据：业务定义：退款金额；业务定义：退款笔数；退款、优惠与毛利风险。
- 店长经营 / 经营概览 / 真实可用：今天折扣优惠送出去多少钱 -> 优惠金额：0.00 元。

数据依据：业务定义：优惠金额；退款、优惠与毛利风险。
- 店长经营 / 经营概览 / 真实可用：今天现金收了多少，微信支付宝各多少 -> 排行：
1. 支付方式=现金，金额=0.00，笔数=0
2. 支付方式=微信，金额=0.00，笔数=0
3. 支付方式=支付宝，金额=0.00，笔数=0

数据依据：财务支付方式拆分；业务定义：实收金额。
- 店长经营 / 客户管理 / 真实可用：我们的老客回头率大概是多少 -> 客户复购率：26.8%；有效消费客户：250 人；复购客户：67 人。

数据依据：业务定义：客户复购率；客户有效消费与复购统计。
- 店长经营 / 客户管理 / 真实可用：帮我找一下三个月没来消费的客户 -> 90 天未到店客户名单：共 265 人，展示前 10 人。
1. 吴梦瑶：累计消费 141561.00 元，到店 147 次，最近到店 2026-04-17
2. 王晓雯：累计消费 129289.00 元，到店 109 次，最近到店 202
- 店长经营 / 客户管理 / 真实可用：哪些客户消费了钱但很少用次卡 -> 明细：
1. 客户=马美琳，cardName=焕肤清洁 12 次卡，usedTimes=0，totalTimes=12，remainingTimes=10，usageRate=0，累计消费=196626.00
2. 客户=刘思琪，cardN
- 店长经营 / 客户管理 / 真实可用：我们有多少客户开了次卡但从来不来消费 -> 开卡未核销：324 人次卡。

明细：
1. 客户=徐诗涵，cardName=抗衰管理 6 次卡，remainingTimes=5，totalTimes=6，累计消费=3680.00
2. 客户=林伟明，cardName=焕肤清洁 12 次
- 店长经营 / 客户管理 / 真实可用：老客户平均多久回来一次 -> 平均回访间隔：13.0 天（154 个相邻消费间隔）。

数据依据：业务定义：客户平均回访间隔；客户有效消费间隔统计。

## 典型问题样本

- 店长经营 / 客户管理 / 意图未覆盖：上个月新来了多少新客，转化了多少 -> 为了准确处理，请一次确认：请补充对比周期或对象；用户询问“转化了多少”，但未明确新客转化的具体目标对象或转化事件？
- 店长经营 / 员工管理 / 意图未覆盖：哪个美容师的客诉最多，最近有没有 -> 当前后台没有客户投诉、差评或满意度事实闭环，无法按美容师统计或排行。Ami Brain 不会用服务量、业绩或综合表现分替代客诉指标。

## 产品结论与改进建议

1. 当前 Ami Brain 已形成六域 Domain Adapter、Supervisor、模板技能、数据库技能和受控动作预览的真实产品链路，本次真实可用率为 83.3%。
2. 当前剩余缺口集中在未覆盖意图和缺少明确业务实体，不再是关键词误命中或伪指标问题；后续应优先补采购建议、客户精确查询、权益 ROI、员工复购排行和否定纠正能力。
3. 对已识别但未接入真实口径的指标继续保持明确拒答，不使用 0、全量历史或无依据估算替代。
4. 发布门禁继续并行检查真实可用率、假阳性、时间范围、权限/跨店、动作确认、异常率和 SSE 首字延迟。
5. 本报告耗时为完整请求落库耗时；用户感知首字延迟需以 SSE 独立压测记录为准。