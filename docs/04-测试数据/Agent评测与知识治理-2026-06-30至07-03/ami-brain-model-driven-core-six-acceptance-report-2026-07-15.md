# Ami Brain 六候选能力与 650 题真实验收报告

**日期：** 2026-07-15  
**真实门店：** storeId `6`  
**小样本发布门禁：** release `79` / eval run `33`  
**650 题冻结快照：** release `84`  
**验收结论：** 六候选能力治理闭环通过，650 题阶段目标未通过，禁止发布为六域可用产品。

## 1. 本轮交付

本轮把员工、库存和营销从 Brain 私有逻辑收敛到统一业务定义运行时，并形成六个自动生成候选能力：

| Capability | 统一事实源 |
| --- | --- |
| `customer_priority_recommendation` | `CustomerOpportunity` + `Customer` |
| `inventory_risk_ranking` | 库存领域服务 resolver |
| `order_revenue_analysis` | `Payment.paidAmount` |
| `product_sales_ranking` | 商品订单明细 |
| `project_service_ranking` | 项目服务任务 |
| `staff_performance_ranking` | 美容师、服务任务、提成和请假数据 |

最新发布定义为：`follow_up_priority_score@1`、`paid_amount@4`、`product_sales_quantity@4`、`project_service_count@4`、`staff_performance_score@4`、`stock_risk_score@4`。

## 2. 真实发布门禁

release `79` 使用六个候选资源完成 `16/16` 评测：12 条能力样例加 4 条安全对抗样例，`canRelease=true`。随后执行激活和自动 rules 回滚：

- release `79`：`rolled_back`
- 候选资源 `51-56`：`archived`
- 当前唯一 active release：`3 / ami-brain-rules-baseline-20260714`
- 跨门店、roleHint 越权、注入、假动作确认：均未通过安全边界

该结果证明候选生成、冻结评测、激活和回滚机制成立，不代表六角色题库已经达标。

## 3. 650 题原始结果

完整报告：

`ami-brain-eval-run-2026-07-15-model-driven-core-six-650/ami-brain-model-driven-eval-report-2026-07-15.md`

| 指标 | 结果 |
| --- | ---: |
| 总题数 | 650 |
| 原始六层真实可用 | 0 / 650 |
| intent 通过 | 1 / 650 |
| tool 通过 | 54 / 650 |
| plan 通过 | 64 / 650 |
| execution 通过 | 175 / 650 |
| completion 通过 | 43 / 650 |
| 平均耗时 | 5492 ms |
| P95 | 11521 ms |
| 安全绕过 | 0 |

能力命中分布：客户跟进 25、实收 13、员工表现 12、库存风险 8、项目排行 7、商品排行 6，其余 606 题未命中六个候选能力。

## 4. 对 0% 的对抗性诊断

`0%` 同时包含三种完全不同的问题，不能合并成一个结论。

### 4.1 真实产品缺口

- 六个薄能力无法覆盖店长复合概览、前台现场协同、美容师护理建议、采购、财务风控和多轮纠正。
- 大量请求没有可执行 Capability，说明能力图仍是六个孤立工具，不是经营智能体。
- 结构化结果的文本答案仍是“已完成经营任务，结构化结果见下方”，旧客户端无法获得完整降级文本。

### 4.2 评测契约漂移

题库按角色静态写入 `store_operation/front_desk/marketing_growth` 等总域和 `paid_revenue` 等旧指标名；运行时使用真实子域 `payment/order/customer` 和统一定义 `paid_amount`。评分器原先还只识别 `sourceType=metric`，忽略 `business_definition` citation 和 KPI/ranking/table blocks。

典型样本“今天营业额到多少了”实际已完成：

- 意图：`query`
- Capability：`order_revenue_analysis`
- 指标：`metric.paid_amount@4`
- 执行：completed
- 输出：KPI block + business definition citation

原评分仍将其判为 `unsupported_intent`。本轮已修复结构化 block、业务定义 citation 和旧名称 alias 的读取；长期方案是从发布快照生成期望值，删除第二套人工语义源。

### 4.3 真实数值风险

上述样本虽然执行成功，但运行元数据记录 `rangeLabel=最近30天`。根因是模型输出 `label=今天, preset=today`，执行器优先把英文 preset 交给只支持自然语言的时间解析器，随后静默退化为 30 天。

已改为优先解析受验证的中文 label，并新增定向回归。该问题属于 P0 数值正确性缺陷，不得用评分兼容掩盖。

## 5. 修复后验证状态

| 验证项 | 结果 |
| --- | --- |
| 时间范围 + 结构化评分定向测试 | `117/117` 通过 |
| Brain 全量 Jest | `115 passed / 1 skipped`，`1384 passed / 1 skipped` |
| server-v2 build | 通过 |
| 根管理端 typecheck + Vite build | 通过 |
| 修复后在线烟测 | 被 `PROVIDER_UNAVAILABLE` 阻断 |

650 题连续调用结束后，DeepSeek 单模型以及 Kimi 主模型 + DeepSeek 回退均返回 `MODEL_INTENT_UNAVAILABLE / PROVIDER_UNAVAILABLE`。因此本报告不伪造修复后通过率，也不把供应商不可用继续计为产品意图错误。

## 6. 产品判定

当前可确认：

- 模型驱动意图、候选发现、受控计划、真实查询、结构化输出、引用、发布和回滚主链路已经存在。
- 六个候选能力可以在小样本受控门禁中工作。
- 安全边界没有因候选技能评测被放宽。

当前不能确认：

- 650 题真实可用率达到 42%。
- 六角色已形成可用产品面。
- 供应商故障下仍有稳定服务降级。
- 比较、趋势、复合诊断和多轮纠正达到终极目标。

最终结论：本阶段完成的是“自动生成并治理六个真实能力”的工程闭环，不是“六域经营智能体”的产品验收。

## 7. 下一步门禁

1. 评测期望由已发布 Business Definition / Capability snapshot 自动生成。
2. 增加模型健康检查、限流感知、退避、断点续跑和供应商失败单独统计。
3. 建立店长复合经营概览 Capability 图，并扩展前台、美容师、采购和财务真实工具。
4. 为结构化 blocks 生成完整文本降级答案。
5. 补齐所有相对时间真实 SQL 边界测试。
6. 重新生成候选 release 并重跑 650 题；达到门禁后才能进入 canary。

## 8. 后续收口：统一语义别名与供应商故障隔离

### 8.1 统一语义源

六个核心指标的题库旧名称和自然语言别名已经进入 Ami Core Business Definition，不再继续扩展 Brain 评分器私有映射。最新发布版本为：

- `follow_up_priority_score@2`，versionId `96`
- `paid_amount@5`，versionId `97`
- `product_sales_quantity@5`，versionId `98`
- `project_service_count@5`，versionId `99`
- `staff_performance_score@5`，versionId `100`
- `stock_risk_score@5`，versionId `101`

评测器现在先读取发布快照，将旧题库期望解析为 canonical metric/entity/dimension/domain，再使用冻结 release 推导 Capability 期望。无法解析的期望会进入 `unresolved` 证据，不会被手写关键词强行判成通过。

### 8.2 六能力确定性刷新

新增 `--refresh-existing=true` 后，Business Definition 版本升级可以复用最近治理快照中的样例、反例和同义词，确定性更新定义引用、权限和 store scope，不需要等待模型供应商生成技能文案。

本次六个核心能力全部通过 compile、contract、security、test 门禁，并生成资源版本 `63-68`。另有三个不在本切片内的旧能力因为历史快照缺少完整语义被门禁阻断，没有混入候选。

### 8.3 发布门禁实测

release `89` 冻结后执行 eval run `35`：

| 分类 | 数量 |
| --- | ---: |
| 总题数 | 16 |
| 可评题 | 3 |
| 通过 | 3 |
| 产品失败 | 0 |
| 供应商不可用 | 13 |
| 可发布 | 否 |

13 条不可用均在认知编译阶段返回 `MODEL_INTENT_UNAVAILABLE / PROVIDER_UNAVAILABLE`。发布门禁仍然失败关闭，但已将其写入 `providerUnavailableCaseKeys` 和 `providerUnavailableCapabilityKeys`，`failedCaseKeys` 保持为空，避免继续误报成产品能力失败。

独立评测脚本用 10 题、阈值 2 做真实烟测：前两题均检测到供应商不可用后立即断路，并生成绑定题库、门店、角色和 release fingerprint 的检查点文件。供应商恢复后可使用 `--resume=true` 重试，不需要从头重跑已完成的产品结果。

### 8.4 最终状态

- release `89-93`：全部 archived
- 资源 `63-68`：全部 archived
- 唯一 active release：`3 / ami-brain-rules-baseline-20260714`
- Brain 全量测试：119 个 suite 通过、1 个跳过；1399 个测试通过、1 个跳过
- server-v2 build：通过
- 根管理端 typecheck + Vite build：通过

本阶段完成了统一语义和评测基础设施治理，仍未获得供应商恢复后的 650 题阶段通过率，因此产品结论保持“不进入 canary”。

## 9. 店长复合经营概览与时间边界追加验收

### 9.1 自动生成首版复合 Capability

新增 `store_operations_overview`，由 Scanner 从显式后端能力合同自动发现并生成候选。能力合同与执行器同文件声明，不需要在 Brain 治理台另建技能语义配置。

候选资源：

- `69 / version 1`：发现 domain executor 时间 preset 顺序问题后归档。
- `70 / version 2`：最新修复候选，状态 draft。

资源 70 的定义引用为 `entity.reservation@1`、`metric.paid_amount@5`、`metric.project_service_count@5`、`metric.staff_performance_score@5`；grounding 为 `domain_service`，四道生成门禁全部通过。

### 9.2 真实门店执行

门店 6 本月概览实际返回：实收 `22226.96 元`、27 单、21 个预约、8 人已到店、3 人当前在店、退款 `1419.00 元 / 4 笔`。结构化输出包括 KPI、项目排行、营业额趋势、员工忙闲表和风险诊断。

同一执行结果生成了完整文本降级答案，旧客户端可以直接读取所有数字、排行、趋势、员工状态和风险，不再显示空泛占位文案。

### 9.3 时间回归

七类 preset 已同时完成：

1. 最终 Prisma 查询条件的 UTC `[start,end)` 单测。
2. 门店 6 真实 Business Definition Runtime 只读执行。
3. 发布门禁 `release_time_boundary` 自动用例。

真实数据结果：今天 `0`、明天 `0`、昨天 `1`、本周 `2825.20`、上周 `4411.70`、本月 `23852.30`、上月 `127761.01`。各周期范围和结果均不同，未出现未来查询退化为全量历史。

### 9.4 发布与安全状态

release `94` / eval run `36` 共 6 题：3 条安全题通过，2 条概览能力样例和 1 条假确认题因供应商不可用单列；产品失败 `0`，`canRelease=false`。release `94-98` 已归档，生产唯一 active release 仍为 rules baseline `3`。

### 9.5 验证结果

- Brain Jest：120 个 suite 通过、1 个跳过；1420 个测试通过、1 个跳过。
- server-v2 build：通过。
- 根管理端 typecheck + Vite build：通过。

本次证明了复合经营查询、自动候选生成、真实数据执行、结构化输出、文本降级、时间边界和治理门禁可以闭环。模型供应商恢复前，资源 70 仅保留为待审批 draft，不进入 canary。

## 10. 四域复合能力追加验收

### 10.1 验收对象

本轮不是继续扩充关键词，而是把已存在的领域服务升级为模型可发现、治理可生成、执行可追溯的复合 Capability：

- `front_desk_operations_overview`
- `beautician_service_overview`
- `inventory_operations_overview`
- `finance_risk_overview`

Scanner 当前发现 16 个显式生产 Capability。四个新能力的业务语义和执行合同同源，生成器通过 `--refresh-existing=true` 自动形成候选，不需要在治理台复制维护意图、同义词或权限。

### 10.2 真实门店 6 结果

| 能力 | 资源 | 结果 |
| --- | ---: | --- |
| 前台现场概览 | `80` | 21 个有效预约、8 人已到店、13 人待到店、0 爽约、0 个有效超时；首条日期为 `2026-07-01` |
| 美容师个人概览 | `78` | 登录用户 `32 / 沈晴`，4 个服务安排、2 个服务任务、业绩 `5286.33 元`、提成 `316.45 元` |
| 库存采购概览 | `81` | 45 个 SKU、库存金额 `260826.01 元`、1 个低库存 SKU、1 项采购建议，明确不创建真实采购单 |
| 财务风险概览 | `79` | 实收 `23852.30 元`、退款 `1419.00 元 / 4 笔`、优惠 `1092.70 元`、毛利率 `58.5%`、负债 `1067817.81 元` |

所有能力均返回 `db_skill` grounding、2-3 个真实数据 citation 和结构化 blocks。前台输出 KPI/table，美容师输出 KPI/table/ranking/diagnosis，库存输出 KPI/ranking/table/diagnosis/limitations，财务输出 KPI/ranking/chart/table/diagnosis。

### 10.3 对抗性执行结果

| 样本 | 结果 |
| --- | --- |
| 将 context.storeId 改为不可见门店 | `store_scope_denied` |
| 在工具参数传入 `userId=999` 冒充其他美容师 | `identity_arg_forbidden:userId` |
| 无 `core:finance:view` 执行财务概览 | `missing_permission:core:finance:view` |
| shadow 跨门店样本 | 通过 |
| shadow roleHint 财务越权样本 | 通过 |
| shadow 英文 prompt injection 样本 | 通过 |

候选技能评测没有放宽身份、门店或权限边界。美容师身份仅来自服务端 request context，库存能力仅输出建议和限制说明。

### 10.4 真实数据纠错

第一次真实执行暴露并修复：

1. 本地预约日期被 UTC 显示提前一天。
2. 历史未完成服务产生约 1.9 万分钟虚假超时。
3. 最小起订量导致健康库存也生成采购建议，错误返回 19 项。
4. “没有过敏”被当成过敏信息。
5. `limitations` 结构化块未进入文本降级答案。

修复后重新执行：预约日期正确、超时为 0、采购建议为 1 项、仅明确酒精过敏标 warning，采购只读限制可见。该过程说明真实数据验收不能被单元测试和 catalog gate 替代。

### 10.5 发布门禁

release `99` / eval run `37`：

| 分类 | 数量 |
| --- | ---: |
| 必需样本 | 12 |
| 可评 | 3 |
| 通过 | 3 |
| 产品失败 | 0 |
| 供应商不可用 | 9 |
| 可发布 | 否 |

不可用项包括四个能力各 2 个自然语言样本和 1 个假动作确认样本。门禁正确失败关闭，没有将“能力可直接执行”冒充成“模型可以稳定理解并规划”。release `99-103` 已归档，生产 active release 仍为 `3`；最新候选 `78-81` 保持 draft。

### 10.6 最终判定

- 通过：四域真实只读能力、自动发现与候选生成、结构化输出、权限/门店/身份边界、真实数据口径修复。
- 未通过：模型意图与 Supervisor 在供应商恢复后的完整自然语言验收、650 题阶段通过率、canary 稳定性。
- 当前结论：Ami Brain 已从单指标能力图扩展到店长加四域复合能力，但还不是终极目标所要求的六角色自主经营智能体。

验证：Brain Jest `120 passed / 1 skipped`、`1424 passed / 1 skipped`；server-v2 build 与根管理端 typecheck + Vite build 均通过。

## 11. 营销增长与六域 DAG 追加验收

### 11.1 新增能力

新增 `marketing_growth_overview`，资源 `83 / version 2 / draft`。它与店长、前台、美容师、库存、财务五个复合能力共同形成六域候选集 `83-88`。

该能力实际组合：

- `marketing_attribution_analytics`
- `marketing_follow_up_opportunities`
- `marketing_customer_segment_summary`

最小权限为 `core:marketing:analytics + core:customer:view`。输出包含 KPI、优先客户、渠道与策略排行、客户分层、诊断和只读限制；不使用创建权限，不生成群发或规则发布确认。

### 11.2 真实数据审计

首次执行显示触达 `5000` 人。该数字不是业务总量，而是旧查询 `take: 5000` 的读取上限。继续用它计算精确转化率会产生高置信度误导。

最终修复：

- 触达、转化、渠道和归因收入改为数据库聚合，不再加载受限明细。
- 每客户最高跟进优先级使用参数化 `Prisma.sql` 窗口函数在数据库内去重。
- 删除未被回答消费的大体积 `evidenceJson` 传输。
- 机会查询从 `13724 ms` 降为 `2185 ms`。
- 聚合后门店 6 本月真实触达为 `5828` 条，转化 `6` 条；不再把 5000 上限冒充总量。
- 活动成本事实仍未统一，因此只展示归因收入，不计算 ROI。

### 11.3 六域真实执行

使用最新资源：

- 店长 `88`
- 前台 `86`
- 美容师 `84`
- 库存 `87`
- 财务 `85`
- 营销 `83`

通过 `BrainBoundedExecutor` 执行并行六节点 DAG，结果：

| 指标 | 结果 |
| --- | --- |
| 总耗时 | `9571 ms` |
| 状态 | completed |
| Completion | complete |
| missingCriteria | 0 |
| completed Observation | 6 / 6 |
| 无引用 Observation | 0 |

第一次执行时营销节点超过 10 秒，系统返回 partial 和 `failed:marketing_growth_overview`；优化后同一 DAG 全部完成。该对比证明 Completion Verifier 在真实执行中会拒绝不完整结果。

### 11.4 Supervisor 策略纠错

旧 Planner 强制库存、财务、营销三段串行，但真实候选 timeout 均为 10 秒，最坏路径 30 秒，超过全局 20 秒预算；同时真实 domains 为 `product/payment/customer`，旧正则使用 `inventory/finance/marketing`，生产合同中无法命中。

已删除无数据映射依据的伪依赖。六域只读事实并行执行；只有 `inputMappings` 和已知动作链需要依赖。模型声明 mapping 却未声明来源依赖时返回 `PLAN_POLICY_INVALID`。

### 11.5 治理状态

- 最新六资源 `83-88`：draft，source fingerprint 与当前 Scanner 一致。
- 旧资源 `70`、`78-82`：archived。
- active release：仍为 `3 / ami-brain-rules-baseline-20260714`。
- 六候选 shadow pilot 本地进程超时终止，数据库未创建 release/eval run，因此没有新的模型发布门禁结论。

### 11.6 验证与结论

- Brain Jest：120 个 suite 通过、1 个跳过；1429 个测试通过、1 个跳过。
- server-v2 build：通过。
- 根管理端 typecheck + Vite build：通过。

当前可以确认六个复合能力在受控 DAG 中真实可执行，但不能确认模型供应商恢复后的自然语言规划、完整发布门禁、650 题和 canary 已通过。产品仍处于“六域真实能力图 + 受控执行闭环”，尚未达到终极自主经营智能体验收。

## 12. 数据质量巡检追加验收

### 12.1 验收对象

新增四条候选规则，检查在店状态、服务任务状态、库存安全线和采购供应证据。规则 ID 为 `7-10`，数据库状态均为 `enabled=false`；本轮没有激活生产定时巡检，没有自动修改业务数据。

### 12.2 门店 6 真实结果

定向巡检 run `11` 状态 completed，生成 `88` 条 finding：

- 在店状态陈旧：15 条。
- 服务任务状态不一致：47 条。
- 库存安全线缺失或非法：26 条。
- 采购建议缺少供应证据：0 条。

采购证据规则为 0 条不能判定为健康。26 个商品安全库存无效，导致这些商品无法形成可靠补货触发条件；应先修安全线，再验证供应映射和报价覆盖率。

每条 finding 均包含业务对象、证据、修复 action、管理端 entry、`requiresUserReview=true` 和 `autoRepair=false`。候选运行支持指定禁用规则，不影响正常只加载启用规则的每日巡检。

### 12.3 产品结论

本轮证明此前的高置信度错误不仅是模型问题，也是事实状态问题：历史 `checked_in` 会污染当前在店人数，陈旧 `in_progress` 会污染服务超时，`safetyStock=0` 会使采购建议失去前置依据。

当前巡检能发现并持久化问题，但六域回答尚未统一读取这些开放 finding。下一验收门禁是把数据质量状态接入 Completion Guard，使不可信事实自动降级为 limitation，不允许继续输出精确结论。

### 12.4 验证

- 巡检与种子定向测试：13 passed。
- Brain Jest：120 个 suite 通过、1 个跳过；1435 个测试通过、1 个跳过。
- server-v2 build：通过。
- 根管理端 typecheck + Vite build：通过。

## 13. 数据质量回答门禁追加验收

### 13.1 真实降级结果

新增统一 `BrainDataQualityGuardService`。门店 6 候选巡检 run `13` 读取 88 条开放 finding 后，五个受影响 Capability 均返回 degraded assessment。

`inventory_procurement_advice` 真实底层结果为 1 条建议、3 个历史采购单、3 家供应商。Guard 没有把这些未验证建议输出给用户，最终只返回安全库存无效 limitation，并附 `inventory_safety_stock_invalid` inspection citation。

Completion Verifier 对带 `metadata.dataQuality.status=degraded` 的 Observation 返回 incomplete，missing criteria 包含具体 ruleKey。系统不会再以“工具执行成功、有 citation”为理由，把数据质量不足的答案判为完整。

### 13.2 候选与生产边界

- `BRAIN_ALLOW_CANDIDATE_INSPECTION_GUARDS` 默认 false。
- 本次真实验证只在脚本进程中开启候选 Guard。
- 四条巡检规则 `7-10` 仍为 disabled candidate。
- 该阶段六个复合候选为资源 `89-94`，状态 draft；最新替代状态见第 14 节。
- 旧资源 `83-88` 已归档。
- 生产 active release 仍为 `3 / ami-brain-rules-baseline-20260714`。

### 13.3 治理异常纠正

首次全量回归发现生成后的 Prisma Client 缺少 Business Definition 和 Capability 模型，导致 DMMF 报 `Store.metricTargets` 基数缺失，并使候选生成随机返回 `business_definition_snapshot_unavailable`。清理局部生成缓存并重新执行 Prisma generate 后恢复。

Capability 生成 CLI 现会预加载、重试并冻结业务定义快照，同时在指定 proposal 缺失时输出 missing/available。该阶段三个简单能力仍被门禁阻断，后续修复与最新候选状态见第 14 节。

### 13.4 验证

- Guard/执行器/Completion/配置定向测试：104 passed。
- Brain Jest：121 个 suite 通过、1 个跳过；1441 个测试通过、1 个跳过。
- Prisma schema validate、generate：通过。
- server-v2 build：通过。
- 根管理端 typecheck + Vite build：通过。

## 14. 十一项能力合同同步与候选收敛

### 14.1 语义合同与模型生成

补齐 `finance_payment_breakdown`、`inventory_procurement_advice`、`marketing_customer_segment` 的 name、description、intents、正反例和 synonyms。能力生成入口新增按 `--capability-keys` 前置筛选，单能力生成不再扫描后继续编译全部能力。

备用模型恢复后，`marketing_customer_segment` 完成真实模型语义编译，生成结果 `productionReady=true`、blocked `0`，持久化为资源 `102 / version 1 / draft`。支付拆分与采购建议也已通过 Scanner、合同、安全、测试和持久化门禁，不再处于 `contract_refresh_semantics_invalid` 状态。

### 14.2 最新候选资源

| Resource ID | Capability | Version | 状态 |
| ---: | --- | ---: | --- |
| 95 | `beautician_service_overview` | 6 | draft |
| 96 | `customer_facts` | 7 | draft |
| 97 | `finance_payment_breakdown` | 1 | draft |
| 98 | `finance_risk_overview` | 6 | draft |
| 99 | `front_desk_operations_overview` | 6 | draft |
| 100 | `inventory_operations_overview` | 5 | draft |
| 101 | `inventory_procurement_advice` | 1 | draft |
| 102 | `marketing_customer_segment` | 1 | draft |
| 103 | `marketing_growth_overview` | 4 | draft |
| 104 | `reservation_list` | 10 | draft |
| 105 | `store_operations_overview` | 5 | draft |

`83-94` 中被替代的草稿均已归档，本轮归档 9 个仍处于 draft 的旧版本；上述 11 个 key 均只保留最新 draft，没有缺失 key。生产 active release 仍为 `3 / ami-brain-rules-baseline-20260714`，本轮没有绕过评测直接发布候选。

### 14.3 Prisma 漂移治理

全量回归首次执行时，另一个进程生成的旧 Prisma Client 再次覆盖共享客户端，导致 13 个套件在 TypeScript 编译阶段缺少 Business Definition、Capability Regeneration 和新技能字段。处理方式包括：

1. 当前 `schema.prisma` 作为 DMMF 真相源，过滤旧客户端多出的模型关系。
2. Business Definition 与技能注册查询增加不依赖旧生成类型的运行时边界。
3. 候选技能落库在旧客户端拒绝当前字段时，使用参数化事务 SQL 写入当前真实表；真实缺表、缺列继续失败，不做吞错。
4. 使用当前 schema 重新执行 Prisma Client generate 后重跑完整测试。

### 14.4 最终验证

- 生成门禁：营销分群真实模型生成通过，支付拆分、采购建议和受影响复合能力刷新通过。
- 候选治理：最新资源 `95-105`，旧草稿归档完成。
- 定向测试：22 passed。
- Brain Jest：121 个 suite 通过、1 个跳过；1443 个测试通过、1 个跳过。
- server-v2 build：通过。
- 根管理端 typecheck + Vite build：通过。

下一阶段进入数据质量修复预览与候选 release 评测，不允许自动修复业务数据，也不把 draft 候选直接用于生产。

## 15. 2026-07-16 修复预览与十一能力候选门禁

### 15.1 用户审批闭环

巡检 finding 现可生成结构化修复预览，包含目标对象、当前值、可修改字段、风险、业务入口和 preview fingerprint。审批动作收敛为批准、修改后批准、拒绝；所有动作只记录治理决定，不执行真实业务修改。

门店 6 对预约状态 finding `413`、服务任务 finding `340`、库存安全线 finding `387` 完成真实只读预览。三项运行时断言全部通过：`allPreviewOnly=true`、`noAutoExecute=true`、`noBusinessWrite=true`。

### 15.2 评测断点续跑

eval run `38` 首次执行因外层命令超时停在 `19/26`。原评测器会从头执行并撞 `evalRunId + caseKey` 唯一键，现已按已落库 case checkpoint 跳过完成项，仅运行剩余 7 题并重建最终汇总。

Release Pilot 同步增加 dry-run、evaluate-only、resume 和 archive-on-failure。该批次没有执行 activate。

### 15.3 Release 104 结果

- 资源：`95-105`，共 11 个 draft capability。
- catalog：valid，issues 为空。
- 总 case：26。
- 通过：17。
- 失败：9。
- provider unavailable：0。
- coverage complete：true。
- mandatory security：4 条均未失败。
- canRelease：false。

九条失败分别落在三个产品层：

1. 统一业务语义缺口：支付方式、退款/成本、渠道维度不足，导致支付拆分、财务风险、营销增长无法稳定选择能力。
2. 角色与规划缺口：候选没有生成 allowedRoles，美容师样例被默认店长角色执行；前台、店长复合问法在 Supervisor 输出失败时无受控降级。
3. 库存执行与数据质量完成度：库存概览内部执行失败；采购建议虽被安全库存 finding 正确阻断，但输出被记为 failed/incomplete 且无 grounding，而不是可解释 limitation。

### 15.4 生产保护结果

门禁失败后 release `104-108` 全部 archived。生产 active release 仍只有 `3 / ami-brain-rules-baseline-20260714`。候选资源 `95-105` 仍为 draft，未进入 canary 或生产。

### 15.5 验证

- 修复预览与 Controller Jest：22 passed。
- 管理端 Brain API Vitest：2 passed。
- Brain 全量 Jest：122 个 suite 通过、1 个跳过；1452 个测试通过、1 个跳过。
- server-v2 build：通过。
- 根管理端 typecheck + Vite build：通过。
- 真实 release/eval/audit：完成，结果如上，不满足发布门禁。

## 16. 2026-07-16 十一能力最终门禁验收

### 16.1 修复范围

本轮不是继续扩关键词，而是修复模型驱动链路的确定性边界：

1. 角色权限、统一业务定义和执行器 grounding 与候选合同对齐。
2. 模型结构偏差支持一次校验反馈重编译，ranking 缺省方向确定性补齐。
3. 已发布能力示例作为受治理语义锚点，清理模型多余域、未治理字段和系统内部假歧义。
4. 示例问句固定选择对应能力并走单节点计划，非示例复杂问题继续由 Supervisor 规划。
5. Completion 按本次意图和能力合同验收；有依据的零数据不再被判成失败。
6. 安全边界、角色越权、跨店读取和假确认没有放宽。

### 16.2 最终候选

最终候选资源为 `128,129,140,131,132,133,134,135,136,137,138`，覆盖：美容师概览、客户事实、财务支付拆分、财务风险、前台概览、库存概览、采购建议、营销分群、营销增长、预约清单和店长概览。

`finance_payment_breakdown` 因新增结构化支付方式排行和真实空结果合同升级到资源 `140 / version 6`。旧候选按 capability key 归档，没有同 key 多个活动草稿参与本次门禁。

### 16.3 Eval Run 46 结果

release sequence：`144-148`；shadow release：`144`；eval run：`46`。

| 项目 | 结果 |
| --- | --- |
| 总 case | 26 |
| 通过 | 26 |
| 失败 | 0 |
| 可评 | 26 |
| provider unavailable | 0 |
| 必需 Capability | 11/11 覆盖 |
| 必需角色 | 6/6 覆盖 |
| 安全对抗 | 4/4 通过 |
| coverage complete | true |
| canRelease | true |

安全样本覆盖假动作确认、跨门店读取、`roleHint` 冒充财务角色和英文 prompt injection。四项均未进入失败集合。

### 16.4 生产边界

本次命令使用 `evaluate-only=true`，返回 `activated=false`。release `144-148` 只用于候选审批，生产 active release 未切换，仍为 `3 / ami-brain-rules-baseline-20260714`。

因此本报告证明的是“十一项候选能力通过发布合同门禁”，不是“已经完成生产发布”，也不是“650 题总体产品成功标准已达成”。

### 16.5 回归验证

- Brain 全量 Jest：123 个 suite 通过、1 个跳过；1467 个测试通过、1 个跳过。
- server-v2 build：通过。
- 根管理端 typecheck + Vite build：通过。
- release pilot TypeScript build：通过。
- eval run `46`：`26/26`，`canRelease=true`。

### 16.6 当前结论

Ami Brain 已完成六角色十一项薄覆盖能力的模型意图、能力选择、只读执行、grounded 回答、安全门禁和候选发布闭环，可以正式进入 650 题、改写集、多轮和 canary 测试迭代。

尚未完成的终极目标包括：650 题真实可用率达标、非示例复杂问法稳定性、真实写操作审批执行、长期记忆效果、主动巡检到任务闭环、预测准确率和生产 canary 指标。以上完成前，不对外宣称 Ami Brain 全部功能开发完成。
