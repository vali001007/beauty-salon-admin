# Agent 能力补齐计划

版本：v1.0
日期：2026-06-28
关联文档：
- agent-core-unification-tasks.md（对话内核统一改造）
- agent-eval-questions.md（650条评测问题库）
- 洞悉美业_新一代门店运营智能体_产品需求文档_v2.0.md

---

## 总览

当前 Agent 框架已完成基础查询/诊断类工具，存在三类缺口：
1. **P0 阻断**：16个工具已注册但方法体缺失，调用即500
2. **P1 核心**：财务/前台/操作闭环类工具不完整，影响角色可用性
3. **P2 增强**：高价值领域（客户生命周期/多步骤/预测）能力缺失

总工期估算：**10-12 天**（后端为主，前端 Block 补充为辅）

| 阶段 | 内容 | 工期 | 优先级 |
|---|---|---|---|
| 阶段一 | P0 消灭500：补齐16个缺方法体工具 | 2天 | P0 |
| 阶段二 | P1 核心操作闭环：预约/生命周期/多步骤 | 3天 | P1 |
| 阶段三 | P1 Block渲染：新增6种专业卡片 | 1.5天 | P1 |
| 阶段四 | P2 高价值能力：比较/预测/客服/多店 | 3天 | P2 |
| 阶段五 | P1 Planner质量：意图识别/多步骤/纠正 | 1.5天 | P1 |
---

## 阶段一：P0 消灭500（2天）

> 目标：所有已注册工具都有可运行的方法体，调用不抛异常。
> 策略：核心查询逻辑完整实现，草稿类返回结构化预览即可。

**文件：** packages/server-v2/src/agent/agent-tool-registry.service.ts

### T1-1 前台接待工具（3个）

**reception.followup.note.draft**
- 方法：createFollowUpNoteDraft(args, ctx)
- 输入：customerId 或 customerName
- 查询：prisma.customer.findFirst + 最近预约记录
- 返回：confirm_action block（草稿内容预览 + 确认按钮）
- riskLevel: medium，requiresApproval: true

**reception.checkout.link**
- 方法：getCheckoutLink(args, ctx)
- 输入：customerId（可选）
- 逻辑：构建收银入口上下文链接（不发起真实收银）
- 返回：link_card block（title: 前往收银，url 含 customerId 参数）
- riskLevel: low

**reception.verify.link**
- 方法：getVerifyLink(args, ctx)
- 输入：customerId（可选）、cardId（可选）
- 逻辑：构建核销入口链接
- 返回：link_card block（title: 前往核销）
- riskLevel: low

### T1-2 店长工具（1个）

**manager.followup.plan.draft**
- 方法：createManagerFollowUpPlanDraft(args, ctx)
- 查询：今日待确认预约 + customer.priority.rank 前5 + inventory.risk.rank 前3
- 返回：confirm_action block（待办事项预览列表）
- riskLevel: medium

### T1-3 美容师工具（2个）

**beautician.repurchase.opportunity**
- 方法：getBeauticianRepurchaseOpportunity(args, ctx)
- 查询：本人客户中 remainingTimes <= 2 的 customerCard + daysSinceVisit > 20
- 返回：table block（客户名/卡项/剩余次数/最近到店/建议话术）
- riskLevel: low

**beautician.followup.task.draft**
- 方法：createBeauticianFollowUpTaskDraft(args, ctx)
- 输入：customerId
- 返回：confirm_action block（跟进内容草稿，含护理建议）
- riskLevel: medium
### T1-4 库存工具（4个）

**inventory.purchase.intake.draft**
- 方法：createPurchaseIntakeDraft(args, ctx)
- 输入：productId 列表、供应商名称
- 返回：confirm_action block（采购单预览）
- riskLevel: medium，requiresApproval: true

**inventory.stock.operation.draft**
- 方法：createStockOperationDraft(args, ctx)
- 输入：操作类型（入库/出库/调拨）、productId、quantity
- 返回：confirm_action block（库存操作草稿）
- riskLevel: medium，requiresApproval: true

**inventory.product.metadata.suggest**
- 方法：suggestProductMetadata(args, ctx)
- 输入：productName（模糊）
- 查询：prisma.product.findFirst（模糊搜索）
- 返回：table block（商品名/SKU/单位/成本价/安全库存）
- riskLevel: low

**inventory.transfer.suggestion**
- 方法：getInventoryTransferSuggestion(args, ctx)
- 查询：currentStock > safetyStock * 2 的产品，找同连锁低库存门店
- 返回：table block（建议调拨品目/数量/目标门店）
- riskLevel: low

### T1-5 财务工具（6个）

> 可复用现有 OperationProfitService 查询逻辑（packages/server-v2/src/operation-profit/）

**finance.revenue.summary**
- 方法：getFinanceRevenueSummary(args, ctx)
- 复用：prisma.productOrder.aggregate（参考 operation-profit.service.ts）
- 返回：kpi_card × 4（实收/应收/退款/订单数）+ evidence_panel
- riskLevel: low

**finance.profit.diagnose**
- 方法：getFinanceProfitDiagnose(args, ctx)
- 复用：OperationProfitService.getOverview() 核心逻辑
- 返回：text（结论）+ kpi_card × 3（毛利/净利/利润率）+ chart（趋势折线）
- riskLevel: low

**finance.margin.risk.rank**
- 方法：getFinanceMarginRiskRank(args, ctx)
- 复用：OperationProfitService.getProjectMargins() 低毛利排行
- 返回：table block（项目/商品/毛利率/风险等级）
- riskLevel: low

**finance.refund.discount.audit**
- 方法：getFinanceRefundDiscountAudit(args, ctx)
- 查询：productOrder where (status=refunded OR totalDiscountAmount>0)
- 返回：table block（订单号/客户/折扣/退款/经手人）+ alert（异常高亮）
- riskLevel: medium

**finance.beautician.performance.audit**
- 方法：getFinanceBeauticianPerformanceAudit(args, ctx)
- 复用：OperationProfitService.getBeauticianPerformance() 逻辑
- 返回：table block（美容师/服务收入/提成/贡献毛利）
- riskLevel: medium

**finance.report.draft**
- 方法：createFinanceReportDraft(args, ctx)
- 整合：revenue + margin + refund 三类数据
- 返回：document_preview block（报告正文 Markdown）+ confirm_action（下载/分享）
- riskLevel: low

### T1-6 验收标准



手动验证：各工具调用返回 200，renderedBlocks 数组非空。
---

## 阶段二：P1 核心操作闭环（3天）

目标：前台/预约/营销的操作流可以完整走通，不仅能查还能执行。

### T2-1 预约操作工具（新增2个工具）

**reservation.create.draft**
- 新工具，注册 riskLevel: medium，requiresApproval: true
- 方法：createReservationDraft(args, ctx)
- 输入：customerId、projectId、beauticianId（可选）、date、startTime
- 查询：校验客户存在 + 美容师当日是否冲突
- 返回：confirm_action block（预约草稿：客户/项目/时间/美容师）
- 审批后执行：prisma.reservation.create

**reservation.update.draft**
- 新工具，注册 riskLevel: medium，requiresApproval: true
- 方法：updateReservationDraft(args, ctx)
- 输入：reservationId、newDate（可选）、newStartTime（可选）、newBeauticianId（可选）
- 返回：confirm_action block（改期前后对比表格）

### T2-2 客户生命周期识别（新增1个工具）

**customer.lifecycle.stage**
- 新工具，注册 riskLevel: low，allowedRoles: [manager, reception, beautician]
- 方法：identifyCustomerLifecycleStage(args, ctx)
- 输入：customerId 或 customerName
- 查询：lastVisitDate、visitCount、totalSpent、customerCards（remainingTimes）
- 生命周期判断逻辑：
  - new_customer：visitCount <= 2，createdAt < 60天
  - experience：visitCount 3-5，无有效次卡
  - card_holder：有有效次卡，remainingTimes > 3
  - repurchase_pending：remainingTimes <= 2，lastVisitDate > 15天
  - dormant：lastVisitDate 30-90天
  - lost：lastVisitDate > 90天
- 返回：customer_lifecycle_card block（阶段标签+建议动作）+ follow_up_chips

### T2-3 营销召回增强

**marketing.customer.segment.discover 升级**
- 新增 lifecycle_stage 分群维度（对接 T2-2 阶段判断）
- 新增 high_value_dormant 分群（totalSpent > 3000 且 lastVisitDate > 45天）
- 新增 expiring_card 分群（remainingTimes <= 2 且 expiryDate < 30天）
- 返回新增 opportunity_card block（每个客群一张，含人数+建议动作）

### T2-4 Planner 多步骤规划增强

文件：packages/server-v2/src/agent/agent-planner.service.ts

新增意图识别规则：

| 规则方法 | 触发条件 | toolPlan |
|---|---|---|
| isReservationCreateRequest() | 包含预约+帮我/新建/加一个 | [reception.customer.lookup, reservation.create.draft] |
| isReservationUpdateRequest() | 包含改期/取消/修改预约 | [reception.reservation.today, reservation.update.draft] |
| isCustomerLifecycleRequest() | 包含生命周期/哪个阶段/流失边缘 | [customer.lifecycle.stage, customer.priority.rank] |
| isMarketingFullFlowRequest() | 包含帮我做个活动/召回活动 | [segment.discover, offer.match, activity.draft] |
| isFinanceFullAuditRequest() | 包含整体财务/财务审计/利润分析 | [revenue.summary, margin.diagnose, refund.audit] |

### T2-5 AnswerContract 实现

文件：packages/agent-core/logic/answerContract.ts

为每类意图定义期望输出 block 组合：
- query 类 → expectedKinds: [kpi_card, table, evidence_panel, follow_up_chips]
- diagnosis 类 → expectedKinds: [summary_text, alert, chart, evidence_panel, follow_up_chips]
- draft 类 → expectedKinds: [confirm_action, evidence_panel]
- clarify 类 → requiredKinds: [clarification_card]

Orchestrator 验证输出完整性，缺失必要 block 时触发补全逻辑。

### T2-6 验收

- 前台完整流程：查客户 → 查预约 → 改期（confirm 后写入）
- 营销完整流程：找沉睡客户 → 匹配权益 → 生成活动草稿
- 生命周期识别：输入客户名 → 返回阶段标签和对应建议
---

## 阶段三：P1 Block 渲染补充（1.5天）

目标：补齐6种业务场景专属 Block，提升问答结果可读性和操作性。

### T3-1 新增 Block 类型定义

文件：packages/agent-core/types/blocks.ts

新增6种 kind：

**reservation_timeline**
- 字段：date, slots[{time, customerName, projectName, beauticianName, status, color}]
- 用途：今日预约时间轴，比 table 更直观，按小时排列、状态色标

**beautician_schedule_card**
- 字段：beauticianName, today[{time, status, customerName}], utilizationRate, nextAvailableSlot
- 用途：美容师排班卡，含空档绿色可视化标注

**customer_lifecycle_card**
- 字段：customerId, name, stage, stageName, stageColor, stageDescription, suggestedActions[{label, actionId}]
- 用途：客户生命周期阶段卡（new/experience/card_holder/repurchase_pending/dormant/lost）

**commission_breakdown_card**
- 字段：beauticianName, month, totalAmount, items[{projectName, serviceAmount, rate, commission}]
- 用途：提成明细卡，逐笔透明展示，底部合计

**report_download_card**
- 字段：title, reportType, dateRange, downloadUrl, previewText, generatedAt
- 用途：报告下载卡（日报/月报/财务报告）

**health_profile_card**
- 字段：customerId, skinType, allergies[], sensitivity, lastSkinNote, careHistory[{date, projectName, note}]
- 用途：客户皮肤健康档案卡，美容师服务前参考

同步更新 src/types/agent.ts 的 AuraResponseBlock union type。

### T3-2 Kiosk BlockRenderer 新增6个 case

文件：packages/Ami-Aura-Lite-Kiosk/src/app/components/BlockRenderer.tsx

| case | 组件 | 渲染描述 |
|---|---|---|
| reservation_timeline | ReservationTimeline | 竖向时间轴，每小时一行，色标：待确认/已确认/服务中/完成 |
| beautician_schedule_card | BeauticianScheduleCard | 美容师头像+当日时间格，空档绿色标注，可点击预约 |
| customer_lifecycle_card | CustomerLifecycleCard | 阶段色标徽章+描述+建议操作按钮组 |
| commission_breakdown_card | CommissionBreakdownCard | 明细列表+底部合计，支持展开/收起 |
| report_download_card | ReportDownloadCard | 报告标题+日期范围+下载按钮 |
| health_profile_card | HealthProfileCard | 皮肤类型+过敏标签+护理历史时间线 |

### T3-3 管理端 AgentBlockRenderer 同步

文件：src/app/pages/ami-agent/components/AgentBlockRenderer.tsx

同步新增6个 case，与 Kiosk 共享相同组件逻辑。

### T3-4 验收

- Kiosk typecheck + build 通过
- 管理端 typecheck + build 通过
- 手动验证：构造包含新 block 的 mock 数据，6种卡片渲染正常无报错

---

## 阶段四：P2 高价值能力增强（3天）

目标：提升 Agent 对复杂问题的处理质量，从查数据升级为给洞察。

### T4-1 比较类问题：双期对比

文件：packages/server-v2/src/agent/agent-planner.service.ts

识别和上周/上个月/同期比类问题，自动扩展 toolPlan：
- 同一工具调用两次，timeRange 参数分别为 current 和 previous
- Orchestrator 合并两次结果生成对比 table block

示例：
- 问：这个月和上个月收入差多少
- toolPlan：[revenue.diagnose(this_month), revenue.diagnose(last_month)]
- 返回：kpi_card（差值+同比）+ chart（双期折线）+ text（结论）

### T4-2 原因追溯：交叉诊断

文件：packages/server-v2/src/agent/agent-orchestrator.service.ts

当工具结果中出现异常指标，自动触发第二轮工具：

| 触发条件 | 自动追加工具 |
|---|---|
| revenue 下滑 > 15% | schedule.diagnose + customer.priority.rank |
| inventory.risk.rank 发现高危品 | supply_chain.diagnose |
| finance.margin 异常 | finance.refund.discount.audit |

返回：alert（异常说明）+ 交叉分析 table + text（综合结论）

### T4-3 预测类能力（新增2个工具）

**revenue.forecast**
- 方法：forecastRevenue(args, ctx)
- 预测公式：月末预测 = 已完成收入 + 日均收入(近7天) × 剩余天数
- 返回：kpi_card（预测值/当前完成/预计达成率）+ chart（预测趋势线虚线）
- riskLevel: low

**customer.churn.risk.rank**
- 方法：rankCustomerChurnRisk(args, ctx)
- 评分维度：daysSinceVisit(40%) + 剩余次数比例(30%) + 消费金额(30%)
- 返回：table block（客户/风险分/主要原因/建议动作）
- riskLevel: low

### T4-4 客服 Agent 基础能力（新增2个工具）

> 仅覆盖低风险咨询类，不处理退款/投诉等高风险场景

**customer.service.consultation**
- 方法：handleServiceConsultation(args, ctx)
- 输入：question（咨询内容）、customerId（可选）
- 匹配类别：项目介绍/价格咨询/护理说明/权益解释
- 查询：Project + Promotion + CustomerCard
- 返回：text block + link_card（跳转详情）+ follow_up_chips
- riskLevel: low，allowedRoles: [reception, manager]

**customer.appointment.self.service**
- 方法：createSelfServiceAppointmentDraft(args, ctx)
- 支持改期/取消预约（生成草稿，前台确认后执行）
- 返回：confirm_action block（改期预览：原时间/新时间对比）
- riskLevel: medium，requiresApproval: true

### T4-5 多门店基础能力（新增1个工具）

**store.multi.overview**
- 方法：getMultiStoreOverview(args, ctx)
- 查询：用户可访问的所有门店的今日/本月收入+客流（基于 User.stores 权限）
- 返回：table block（门店/营业额/客流/客单价/目标完成率）+ chart（横向条形图对比）
- riskLevel: low，allowedRoles: [manager]

### T4-6 Capability Registry 补充（5个新能力）

文件：packages/server-v2/src/agent/capabilities/capability-registry.service.ts

| capabilityId | domain | toolPlan |
|---|---|---|
| marketing_campaign_full_flow | marketing | [segment.discover, offer.match, activity.draft] |
| customer_churn_prevention | customers | [customer.churn.risk.rank, customer.lifecycle.stage, followup.task.draft] |
| revenue_forecast | business | [revenue.diagnose, revenue.forecast] |
| finance_full_audit | finance | [revenue.summary, margin.diagnose, refund.audit] |
| multi_store_comparison | store | [store.multi.overview, store.comparison.diagnose] |

### T4-7 验收

- 这个月和上个月比营业额差多少 → 双期对比 chart + kpi_card
- 下个月营业额能到多少 → 预测 kpi_card + 趋势图
- 哪些客户快流失了 → customer.churn.risk.rank 结果 table
- 帮我策划一个召回活动 → 一次性返回客群+权益+活动草稿全流程
- 多门店收入对比 → table + 条形图
---

## 阶段五：P1 Planner 质量提升（1.5天）

目标：提升复杂/模糊问题的意图识别准确率，减少 fallback 到 business.query。

### T5-1 意图置信度追问机制

文件：packages/server-v2/src/agent/agent-planner.service.ts

当 BusinessTaskCompiler 输出 confidence < 0.5 时：
- 不直接执行 toolPlan
- 返回 clarification_card block（包含2-3个选项供用户明确意图）

示例：
- 问：帮我看看
- 返回：clarification_card（你想看：A. 今日经营  B. 预约情况  C. 库存风险）

### T5-2 多意图拆分

识别一句话包含多个独立意图（然后/同时/顺便/还有分隔）：
- 拆分为多个子任务，顺序串行执行
- 前一步结果可作为下一步上下文传入

示例：
- 问：查张雯的情况，然后帮她发个回访消息
- toolPlan：[reception.customer.lookup(张雯), customer.followup.task.draft(customerId)]

### T5-3 否定/纠正处理

多轮对话识别否定意图：

| 用户表达 | 处理逻辑 |
|---|---|
| 不对/重新查 | 清除当前工具结果，重新规划 |
| 上个月不是这个月 | 修改 timeRange 参数，重新执行同一工具 |
| 太复杂了/简单说 | 压缩 renderedBlocks，只保留 summary_text + kpi_card |
| 换个角度 | 触发 follow_up_chips 中的备选问题 |

### T5-4 评测集验证

使用 docs/04-测试数据/agent-eval-questions.md 中的 Edge Case 问题：

| 类别 | 问题数 | 目标通过率 |
|---|---|---|
| 意图模糊类 | 10条 | >= 70% 触发 clarification_card |
| 多步骤类 | 10条 | >= 80% 正确拆分多工具 toolPlan |
| 否定纠正类 | 10条 | >= 80% 正确识别并重新规划 |

---

## 依赖关系与并行建议


阶段一（P0，必须先完成）
  └── 阶段二（核心闭环）
       └── 阶段四（能力增强）

阶段三（Block渲染）可与阶段二并行
阶段五（Planner质量）可与阶段二并行


最优执行顺序：
- Day 1-2：阶段一（所有人）
- Day 3-4：阶段二（后端）+ 阶段三（前端）
- Day 5：阶段五（后端）
- Day 6-8：阶段四（后端）
- Day 9：集成测试和验收

---

## 新增工具汇总（23个）

| 工具名 | 类型 | 所属 Agent | 阶段 |
|---|---|---|---|
| reception.followup.note.draft | 草稿 | 前台 | 一 |
| reception.checkout.link | 跳转 | 前台 | 一 |
| reception.verify.link | 跳转 | 前台 | 一 |
| manager.followup.plan.draft | 草稿 | 店长 | 一 |
| beautician.repurchase.opportunity | 查询 | 美容师 | 一 |
| beautician.followup.task.draft | 草稿 | 美容师 | 一 |
| inventory.purchase.intake.draft | 草稿 | 库存 | 一 |
| inventory.stock.operation.draft | 草稿 | 库存 | 一 |
| inventory.product.metadata.suggest | 查询 | 库存 | 一 |
| inventory.transfer.suggestion | 查询 | 库存 | 一 |
| finance.revenue.summary | 查询 | 财务 | 一 |
| finance.profit.diagnose | 诊断 | 财务 | 一 |
| finance.margin.risk.rank | 排行 | 财务 | 一 |
| finance.refund.discount.audit | 审计 | 财务 | 一 |
| finance.beautician.performance.audit | 审计 | 财务 | 一 |
| finance.report.draft | 草稿 | 财务 | 一 |
| reservation.create.draft | 草稿 | 前台/店长 | 二 |
| reservation.update.draft | 草稿 | 前台 | 二 |
| customer.lifecycle.stage | 分析 | 全角色 | 二 |
| revenue.forecast | 预测 | 财务/店长 | 四 |
| customer.churn.risk.rank | 排行 | 营销/店长 | 四 |
| customer.service.consultation | 查询 | 前台 | 四 |
| store.multi.overview | 查询 | 店长 | 四 |

---

## 最终验收清单

| 验收场景 | 预期输出 |
|---|---|
| 前台问今天预约 | reservation_timeline block + 待确认预约 alert |
| 前台问张雯的卡 | customer_card + commission_breakdown_card |
| 店长问本月财务 | kpi_card × 4 + chart + evidence_panel |
| 店长问和上月差多少 | 双期对比 table + kpi_card（差值）|
| 美容师问下一个客人 | beautician_schedule_card + health_profile_card |
| 营销问帮我做召回活动 | 客群 table + opportunity_card + activity_draft_card |
| 任意角色问下个月预测 | revenue.forecast kpi_card + 趋势 chart |
| 模糊问帮我看看 | clarification_card（2-3个选项）|
| 多步骤查张雯然后发消息 | 两轮工具串行 + confirm_action |
| 后端测试 | 492/492 通过 |
| 两端 typecheck | 0 错误 |
| 两端 build | 成功 |