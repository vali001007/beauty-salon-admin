# Ami Brain Release 322 正式候选、120 题与 650 题门禁诊断

## 一、结论

本轮完成了统一业务定义发布、候选能力自动刷新、正式评测快照冻结、120 题门禁和 650 题全量评测。

- `release 322`：24 张能力卡，Catalog 与源码新鲜度均通过。
- 120 题最终门禁：`96/119 = 80.7%`，观察口径 `96/120 = 80.0%`，假阳性 `0`。
- 650 题全量门禁：`257/638 = 40.3%`，观察口径 `257/650 = 39.5%`，假阳性 `52`。
- 安全门禁：权限绕过、跨门店读取、roleHint 绕权、假动作确认均为 `0`。
- 发布结论：**No-Go**。不得进入 canary，不得宣称六角色产品验收完成。

650 题可用率距离阶段目标 `>=42.0%` 还差 11 条可评测题；但真正阻断发布的不是这 11 条，而是 52 条假阳性、前台/美容师/财务覆盖不足，以及多轮和纠正能力未通过。

## 二、本轮修复与发布事实

### 2.1 业务定义发布闭环

Capability 刷新发现 4 张复合能力因 13 个统一业务定义尚未发布而被 fail-closed 阻断。本轮没有在 Ami Brain 内增加私有口径，而是通过 Semantic Candidate Scanner 从现有后端事实、查询模板和执行器合同自动发现并发布：

- `dimension.customerAgeGroup@1`
- `metric.dormant_reactivation_customer_count@1`
- `metric.new_customer_conversion_count@1`
- `metric.new_customer_conversion_rate@1`
- `metric.new_customer_count@1`
- `metric.discount_amount@2`
- `metric.product_below_cost_sale_count@1`
- `metric.product_gross_margin_rate@1`
- `metric.refund_count@2`
- `metric.inventory_consumption_quantity@2`
- `metric.product_sales_amount@1`
- `metric.staff_commission_amount@2`
- `metric.staff_customer_repurchase_rate@2`

13 个版本均使用门店 6 的真实 resolver 结果生成 fixture，并通过统一注册表校验后发布。

### 2.2 发布器缺陷修复

正式发布首次触发 `business_definition_publish_conflict`。根因是评测验证阶段已经生成不可变 projection，发布阶段再次插入同一唯一键。

修复后的合同：

1. 候选版本没有 projection 时，发布事务创建 5 类发布 projection。
2. 已有 projection 时，逐项校验类型、目标键、定义版本、定义指纹、来源指纹、payload 和 projection 指纹。
3. 完全一致时复用不可变 projection。
4. 任一差异返回 `business_definition_projection_drift`，禁止发布。

该修复遵守数据库只读触发器，不删除、不更新历史 projection。

### 2.3 能力卡与 release

12 张受影响能力卡完成确定性刷新，生成资源 `562-573`，全部通过 compile、contract、security 和 test 门禁：

- `customer_facts@39`
- `finance_payment_breakdown@35`
- `finance_risk_overview@37`
- `front_desk_operations_overview@37`
- `inventory_operations_overview@33`
- `inventory_procurement_advice@27`
- `manager_staff_overview@28`
- `marketing_customer_segment@25`
- `marketing_growth_overview@29`
- `marketing_message_draft@21`
- `reservation_list@39`
- `store_operations_overview@40`

以上资源替换 `release 321` 中的过期版本，冻结为 `release 322 / ami-brain-model-driven-publish-ready-20260719-r259`。冻结指纹：

`d1d59a2bbb9bdbdca78e5004bdc085d49f51b0b67a05d208fc8a058aeb9fa7f0`

## 三、120 题门禁

最终证据目录：

`ami-brain-eval-run-2026-07-19-model-driven-r263-release322-120-gate-final`

| 指标 | 结果 |
| --- | ---: |
| 总题数 | 120 |
| 可评测 | 119 |
| 精确可用 | 94 |
| 部分可用 | 2 |
| 真实可用率 | 80.7% |
| 假阳性 | 0 |
| 供应商不可用 | 1 |
| 店长 | 77/99 = 77.8% |
| 营销 | 19/20 = 95.0% |

退款笔数、到店客户年龄段和沉睡客户唤醒三条问题此前“答案正确但 semanticIntent 缺字段”。根因是 Exact Contract 定义解析在发布定义存在时只做完整别名子串匹配，忽略已有的受治理 definition-key matcher。修复后定向 `3/3 usable_exact`，完整 120 题假阳性归零。

## 四、650 题全量结果

### 4.1 总览

| 指标 | 结果 |
| --- | ---: |
| 总题数 | 650 |
| 可评测 | 638 |
| 精确可用 | 255 |
| 部分可用 | 2 |
| 真实可用率 | 40.3% |
| 观察可用率 | 39.5% |
| 供应商不可用 | 12 |
| 意图假阳性 | 33 |
| 粒度假阳性 | 11 |
| 指标假阳性 | 8 |
| 指标失败 | 53 |
| 未覆盖意图 | 243 |
| not_found | 33 |
| 平均耗时 | 15.3 秒 |
| P95 | 27.9 秒 |

六层通过率：

| 层级 | 通过率 |
| --- | ---: |
| Intent | 77.9% |
| Tool | 62.9% |
| Plan | 63.5% |
| Execution | 91.1% |
| Completion | 59.4% |
| Answer | 47.3% |

结果说明：底层执行器一旦被正确选择，执行成功率已经较高；主要断点发生在意图、工具发现、计划完成条件和答案粒度，不是数据库查询普遍不可用。

### 4.2 分角色结果

| 角色 | 可用/可评测 | 可用率 | 产品结论 |
| --- | ---: | ---: | --- |
| 店长 | 80/100 | 80.0% | 已形成稳定经营概览与核心问数面 |
| 营销 | 48/97 | 49.5% | 客群与内容较强，活动策划、ROI、自动化误路由严重 |
| 前台 | 26/99 | 26.3% | 预约基础可用，客户查询、收银核销和现场协调不足 |
| 美容师 | 4/99 | 4.0% | 当前最严重缺口，角色身份、客户绑定和本人服务工具未形成产品面 |
| 库存 | 58/100 | 58.0% | 查询/临期较强，消耗分析、调拨和复合采购仍不足 |
| 财务 | 32/97 | 33.0% | 基础实收退款可用，成本、对账、合规与员工维度不足 |
| 边界/多轮 | 9/46 | 19.6% | 上下文继承、纠正、模糊追问和跨域计划未通过 |

### 4.3 必须由 Ami Brain 修复的问题

以下问题对应当前管理端/后端已经存在的事实和功能，属于 Brain 自身缺口，下一轮必须继续开发：

1. **美容师角色工具面**：本人服务安排、客户档案/护理注意事项、本人业绩和跟进建议没有稳定进入 `beautician_service_overview`，大量问题被 `customer_facts`、`staff_performance_ranking` 或空能力接管。
2. **前台领域选择**：预约、客户、核销、储值卡消费和现场协调之间缺少明确工具边界，出现“投诉处理 -> 预约概览”“储值卡消费笔数 -> 实收金额”。
3. **营销策划与分析边界**：活动策划、老带新设计、渠道质量和自动化规则检查被 `marketing_growth_overview` 总览吞掉，回答已有经营数据而不是方案或目标分析。
4. **财务粒度与复合指标**：成本/毛利、支付渠道、员工提成、退款优惠和合规问题频繁缺指标、缺维度或返回全店汇总。
5. **库存复合分析**：采购建议、消耗分析、供应链协调在多个能力之间选择不稳定，存在产品、员工和支付域混入。
6. **Supervisor 多工具规划**：跨域问题和多步骤问题经常 `plan_nodes_below` 或 `capability_any_of_missing`，说明候选检索和计划完成条件没有覆盖已发布工具组合。
7. **上下文与纠正**：代词继承、否定纠正、改变时间或对象后的重规划成功率不足。
8. **答案合同**：部分结果虽然执行成功，但回答意图、指标或粒度不匹配，必须在输出前执行 completion/answer contract 校验并触发 replan 或明确拒答。

### 4.4 单独冻结的管理端/后端缺口

以下问题没有完整管理端/后端业务事实，本轮继续单独登记，不在 Ami Brain 内开发第二套表、页面或模拟技能：

- 员工试用期目标、带教、阶段评价和转正审批。
- 客户归属历史、员工离职带客和客户转移原因。
- 设备台账、巡检、保养、故障、消防和服务事故。
- 优惠授权规则、审批记录、操作人审计和储值提现审计。
- 短信、企微/微信渠道、退订、黑名单、模板审批和真实渠道账单。
- 客户反馈与等待事实虽然表和服务已存在，但当前真实记录为 0；只进入数据采集和覆盖率治理，不扩建第二套能力。

## 五、发布决策与下一步

### 5.1 发布决策

- `release 322` 保持 evaluation-only draft。
- 不激活生产，不创建 canary 序列。
- 生产唯一 active release 不变。
- 650 题通过前不执行 shadow -> 5% -> 20% -> 50% -> 100%。

### 5.2 下一轮修复顺序

1. P0：美容师本人身份、客户实体和 `beautician_service_overview` 工具发现闭环。
2. P0：前台客户/预约/核销/现场协调工具边界及错误路由收口。
3. P0：营销 `draft/recommendation/diagnosis/query/action` 意图区分，阻止总览能力吞掉策划与自动化问题。
4. P0：执行后 Answer Contract Validator，对 52 条假阳性 fail-closed 并触发受控 replan。
5. P1：财务和库存的指标/维度补全及 Supervisor 复合计划。
6. P1：上下文继承、否定纠正和跨域 DAG。
7. 重新冻结候选 release，先跑定向簇和 120 回归，再重跑 650；假阳性必须为 0、真实可用率必须达到门禁后才能进入 canary。
