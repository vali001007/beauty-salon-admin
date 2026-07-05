# Ami 智能问答全领域覆盖矩阵

更新时间：2026-06-18

## 1. 文档定位

本文档是 `Ami经营语义中枢详细开发计划.md` 的独立交付物，用于回答三个问题：

1. 当前智能问答覆盖了哪些经营领域。
2. 每个领域由哪个 BusinessTask / Capability / Tool / Metric 承接。
3. 后续新增问法时，应进入既有能力增强、指标扩展，还是新增 Capability。

本文只记录已经进入当前经营语义中枢主线的能力，不把历史临时关键词补丁、旧端侧卡片或不受控自由 SQL 作为完成能力。

## 2. 当前主线架构覆盖

| 层级 | 当前交付状态 | 主要文件 | 验收证据 |
| --- | --- | --- | --- |
| 自然语言入口 | 已接入 Kiosk 经营 Agent；快捷按钮和固定业务操作不进入 AI 识别 | `packages/Ami-Aura-Lite-Kiosk/src/app/intent/*`、`packages/Ami-Aura-Lite-Kiosk/src/app/microApps/runMicroApp.ts` | `npm.cmd run check:ami-semantic-agent`，Kiosk Browser Eval 8/8 通过 |
| BusinessTask 编译 | 已覆盖经营、客户、商品、项目、预约、排班、订单、卡项、会员卡、库存、供应链、财务、营销、权益、自动化、员工、服务质量、小程序、渠道、终端、多店、售后 | `packages/server-v2/src/agent/business-task/*` | 后端核心门禁 14 个 spec 通过 |
| Capability Registry | 已注册 P0/P1 主线能力和兜底受控问数能力 | `packages/server-v2/src/agent/capabilities/capability-registry.service.ts` | `business-task-compiler.service.spec.ts`、`agent-planner.service.spec.ts` |
| Tool Registry | 已实现只读诊断、排行、推荐和草稿类工具；高风险动作需审批或只生成草稿 | `packages/server-v2/src/agent/agent-tool-registry.service.ts` | `agent-tool-registry.service.spec.ts` |
| Semantic Metric Registry | 已注册 40+ 经营指标，含中文名、来源、过滤口径、敏感级别 | `packages/server-v2/src/semantic-data/semantic-metric-registry.service.ts` | `semantic-sql-decision.service.spec.ts`、`semantic-sql-executor.service.spec.ts` |
| Semantic SQL | 已作为受控 Beta 执行层，白名单指标、白名单维度、只读、limit、门店范围、审计，不承接自由自然语言主路径 | `packages/server-v2/src/semantic-sql/*` | `semantic-sql-decision.service.spec.ts`、`semantic-sql-executor.service.spec.ts` |
| Response Composer / 安全 | 已做中文化、内部字段过滤、字段级权限脱敏、统一卡片结构 | `packages/server-v2/src/agent/agent-response-safety.service.ts`、`packages/Ami-Aura-Lite-Kiosk/src/app/components/RoleDashboards.tsx` | `agent-response-safety.service.spec.ts`、`RoleDashboards.business-result.test.tsx`、Browser Eval |
| Agent Studio / 审计 | 已有 Agent 审计页、编译预览、工具目录、评测摘要、候选池接口 | `src/app/pages/system/AgentAuditPage.tsx`、`packages/server-v2/src/agent/agent.controller.ts` | 路由 `system/agent-audit` 已接入，API 已接入 |
| 自动化门禁 | 已接入本地一键门禁和 CI | `scripts/check-ami-semantic-agent.mjs`、`.github/workflows/ci.yml` | `npm.cmd run check:ami-semantic-agent` 通过 |

## 3. 全领域覆盖矩阵

| 领域 | BusinessTask domain | 代表问题 | 当前 Capability | 当前 Tool | 关键指标 | 角色边界 | 当前状态 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 经营总览 | `business` | 今天经营怎么样、为什么收入下降 | `revenue_diagnosis` | `revenue.diagnose` | `revenue`、`net_revenue`、`average_order_value`、`business_anomaly_count` | 店长 | 已完成 |
| 客户跟进 | `customer` | 今天最值得跟进的 10 个客户、下周重点关注哪些客户 | `customer_priority_recommendation` | `customer.priority.rank` | `follow_up_priority_score`、`ltv`、`rfm_score` | 店长、前台；美容师不看全店排行 | 已完成 |
| 商品销售 | `product` | 最近销量好的商品有哪些、近 30 天销量增长最快的商品 | `product_sales_ranking` | `product.sales.rank` | `product_sales_growth`、`product_sales_amount` | 店长、前台；美容师受限 | 已完成 |
| 商品活动机会 | `product` / `marketing` | 有哪些商品适合做活动 | `marketing_opportunity_discovery` | `marketing.opportunity.discover` | `promotion_fit_score`、`product_gross_margin`、`slow_moving_days` | 店长 | 已完成 |
| 项目经营 | `project` | 最近做得最多的项目、项目耗材毛利怎么样 | `project_business_diagnosis` | `project.diagnose` | `project_service_growth`、`project_service_count`、`project_gross_margin` | 店长、前台 | 已完成 |
| 护理适配 | `project` | 敏感肌客户适合做什么项目 | `project_business_diagnosis` / 受控问数 | `project.diagnose` / `business.query.ask` | `care_fit_score` | 店长、前台、美容师按本人服务范围 | 已接入基础能力，后续继续增强个体肤况样本 |
| 预约排班 | `schedule` / `reservation` | 今天哪些美容师空闲、预约客户未到情况 | `reservation_schedule_diagnosis` | `schedule.diagnose` | `schedule_utilization_rate`、`reservation_arrival_rate`、`reservation_no_show_rate`、`staff_idle_hours` | 店长、前台 | 已完成 |
| 员工表现 | `staff` | 近期表现较好的员工、我的表现怎么样 | `staff_performance_ranking` | `staff.performance.rank` | `staff_performance_score`、`staff_service_revenue`、`staff_commission_amount`、`staff_customer_repurchase_rate` | 店长看全店；美容师仅本人 | 已完成 |
| 订单与收银 | `order` | 客单价怎么样、支付方式占比怎么样 | `business_query` / `revenue_diagnosis` | `business.query.ask` / `revenue.diagnose` | `average_order_value`、`payment_method_ratio`、`net_revenue` | 店长、前台按权限 | 已接入指标和受控问数，订单细分能力后续可沉淀为专用 Capability |
| 售后退款 | `afterSales` | 哪些退款异常、退款率高不高 | `refund_risk_diagnosis` | `order.refund.diagnose` | `refund_amount`、`refund_rate` | 店长、前台 | 已完成 |
| 次卡 | `card` | 未来 30 天哪些次卡快到期、次卡核销率怎么样 | `card_member_business_diagnosis` | `card.diagnose` | `card_expiry_risk`、`card_usage_times`、`card_writeoff_rate` | 店长、前台 | 已完成 |
| 会员卡 | `memberCard` | 会员卡余额怎么样、储值沉睡情况 | `card_member_business_diagnosis` | `card.diagnose` | `member_balance`、`balance_inactive_days` | 店长、前台；敏感金额按字段权限 | 已完成 |
| 财务毛利 | `finance` | 近 30 天毛利怎么样、成本是不是太高 | `finance_margin_diagnosis` | `finance.margin.diagnose` | `gross_margin`、`gross_margin_rate`、`material_cost`、`commission_cost`、`net_revenue` | 店长；字段级权限脱敏 | 已完成 |
| 库存风险 | `inventory` | 哪些商品库存不足、哪些批次快过期 | `inventory_risk_ranking` | `inventory.risk.rank` | `stock_risk_score`、`stock_turnover_days`、`batch_expiry_risk` | 店长、前台 | 已完成 |
| 供应链采购 | `supplyChain` | 哪个供应商供货慢、供应链采购建议 | `supplier_performance_diagnosis` | `supply_chain.diagnose` | `supplier_delivery_cycle`、`supplier_settlement_amount`、`supplier_purchase_score` | 店长 | 已完成 |
| 营销活动 | `marketing` | 活动转化效果怎么样、活动成交收入多少 | `marketing_conversion_diagnosis` | `marketing.conversion.diagnose` | `campaign_conversion_rate`、`campaign_revenue` | 店长 | 已完成 |
| 权益促销 | `promotion` | 权益领取和使用效果怎么样 | `promotion_effect_analysis` | `promotion.effect.analyze` | `promotion_claim_rate`、`campaign_conversion_rate` | 店长 | 已完成 |
| 自动化触达 | `automation` | 自动化触达效果怎么样 | `automation_execution_diagnosis` | `automation.execution.diagnose` | `automation_touch_success_rate`、`campaign_conversion_rate` | 店长 | 已完成 |
| 客户小程序 | `customerApp` | 小程序最近带来多少客户 | `customer_app_funnel_analysis` | `customer_app.funnel.analyze` | `customer_app_active_count`、`customer_app_bind_rate`、`channel_conversion_rate` | 店长 | 已完成 |
| 渠道转化 | `channel` | 微信渠道成交怎么样、渠道转化率 | `customer_app_funnel_analysis` / 受控 Semantic SQL | `customer_app.funnel.analyze` / `semantic-sql` | `channel_conversion_rate` | 店长 | 已接入 |
| 终端设备 | `terminal` | 终端最近失败最多的问题、设备状态异常 | `terminal_health_diagnosis` | `terminal.health.diagnose` | `terminal_failure_rate`、`terminal_conversation_count` | 店长 | 已完成 |
| 服务质量 | `serviceQuality` | 服务记录完整吗、服务质量风险有哪些 | `service_quality_diagnosis` | `service.quality.diagnose` | `service_completion_rate`、`staff_performance_score` | 店长 | 已完成 |
| 多店对比 | `store` | 哪个门店表现最好、多店经营对比 | `store_comparison_diagnosis` | `store.comparison.diagnose` | `store_rank_score`、`revenue`、`stock_risk_score`、`campaign_conversion_rate` | 仅授权门店 | 已完成基础门禁 |
| 长尾受控问数 | 多领域 | 未命中专用能力但属于经营范围的问题 | `business_query` | `business.query.ask` | 按领域匹配 | 店长、前台、美容师按权限 | 已完成兜底治理；高频问题进入候选池 |

## 4. 评测覆盖矩阵

| 评测类型 | 覆盖目标 | 当前证据 |
| --- | --- | --- |
| 默认 360+ 自然语言评测 | 领域识别、任务类型、Capability 命中、TopN、时间范围、权限边界、中文化运行结果 | `packages/server-v2/src/agent/agent-eval.cases.ts`、`agent-eval.service.spec.ts` |
| 编译器单测 | BusinessTask、PreParser、LLM draft 合并、Semantic SQL 候选决策 | `business-task-*.spec.ts`、`semantic-sql-decision.service.spec.ts` |
| 工具执行单测 | 各领域只读工具、无数据、不足权限、字段脱敏、跨门店基础隔离 | `agent-tool-registry.service.spec.ts`、`agent-policy.service.spec.ts` |
| 响应安全单测 | 内部枚举、内部 action key、SQL/字段名、角色/账号字段不上屏 | `agent-response-safety.service.spec.ts` |
| Kiosk 组件单测 | 统一卡片结构、中文字段映射、概述/明细/下一步动作展示 | `RoleDashboards.business-result.test.tsx` |
| Kiosk Browser Eval | 用户输入保留、快捷按钮隔离、固定流程隔离、多账号会话、前台/美容师角色边界、无数据/不足权限/字段脱敏/连续追问 | `packages/Ami-Aura-Lite-Kiosk/e2e/business-agent.spec.ts` |
| 一键门禁 | 汇总后端核心、Kiosk 测试、Kiosk 构建、Browser Eval | `npm.cmd run check:ami-semantic-agent` |

## 5. 新增问法处理规则

1. 先判定是否已属于上表某个领域和 Capability。
2. 如果属于既有 Capability 但回答差，优先补工具查询、指标口径、Response Composer 或评测，不新增关键词补丁。
3. 如果命中 `business_query` 兜底且重复出现，进入 `capability-candidates` 候选池，由产品确认口径后沉淀为正式 Capability。
4. 如果涉及写入、发布、核销、收银、建档、排班发布等动作，只生成草稿或进入固定业务流程，不允许 Agent 直接执行高风险动作。
5. 如果新增工具、字段、结果结构或权限类型，必须同步补：
   - 核心 spec。
   - Agent Eval case 或 runtime fixture。
   - 中文化黑名单和字段映射。
   - 字段权限断言。
   - Browser Eval 页面断言。
   - `npm.cmd run check:ami-semantic-agent` 必须通过。

## 6. 当前结论

按当前代码与门禁，Ami 经营语义中枢已经覆盖门店经营问答的 P0/P1 主线：

- 用户自然语言经营问题默认进入经营 Agent，而不是旧端侧卡片。
- 核心领域均有 BusinessTask、Metric、Capability 或受控问数承接。
- SQL 是受控执行层，不是自由问答主路径。
- 结果统一进入概述、明细、下一步动作和数据依据结构。
- 内部字段、英文枚举、工具 key、原始权限字段不能直接上屏。
- 账号、角色、字段权限、无数据、不足权限、连续追问和固定流程隔离均有门禁。

后续工作不再是“先把计划开发完”的主线任务，而是按新增业务域、新指标、新工具或真实运营反馈持续扩展。
