# Agent V2 受控 Text-to-SQL 白名单语义视图清单

日期：2026-07-06

关联文档：

- `docs/03-开发计划/01-AI智能体与问数能力/Agent V2 QueryPlan优先与受控Text-to-SQL兜底方案-2026-07-06.md`
- `docs/03-开发计划/01-AI智能体与问数能力/Agent V2受控Text-to-SQL独立开发计划-tasks.md`

## 1. 定位

本清单采用“全业务域覆盖、字段级受控”的白名单策略。

目标不是只开放 5-8 个很窄的视图，而是把 Ami_Core 当前主要业务、领域、模块都纳入 Agent V2 Text-to-SQL 可查询范围。限制从“能不能查这个模块”转为“这个模块哪些字段、哪些行、哪些时间范围可以安全查询”。

核心原则：

- 所有业务模块尽量进入白名单语义视图。
- LLM 只能看到语义视图 schema，不能看到完整 Prisma schema。
- 每个视图必须有门店/组织范围字段，或明确是系统管理员专用。
- 大数据视图必须有默认时间字段。
- 敏感字段不进入视图，或只以脱敏字段进入。
- 写操作、状态变更、发券、删除、审批、下发仍不允许通过 Text-to-SQL 执行。

## 2. 字段策略

字段策略统一分三类：

| 策略 | 含义 | 示例 |
| --- | --- | --- |
| `allow` | 可查询、可展示 | 商品名、项目名、销售额汇总、订单数量、门店名 |
| `mask` | 可查询但必须脱敏展示 | 客户姓名首字、手机号后四位、OpenId hash、设备标识 hash |
| `deny` | 不进入视图或不可返回 | 完整手机号、身份证、完整地址、支付敏感号、token、密码、内部备注 |

默认 deny 字段：

- 密码、token、secret、refresh token、OpenId 原值、支付敏感号。
- 完整手机号、身份证、完整地址、生日精确值、客户私密备注。
- 内部审批备注、系统异常堆栈、原始 LLM prompt/response。
- 任何可能绕过权限或门店边界的内部关联字段。

## 3. 全域视图总览

| 序号 | 视图 ID | 领域 | 覆盖模块 | 优先级 |
| --- | --- | --- | --- | --- |
| 1 | `agent_v2_store_summary_view` | store | 门店基础、经营范围 | P0 |
| 2 | `agent_v2_customer_profile_summary_view` | customer | 客户档案、画像摘要 | P0 |
| 3 | `agent_v2_customer_behavior_view` | customer | 客户行为、复购、沉睡 | P1 |
| 4 | `agent_v2_customer_health_skin_view` | customer/serviceQuality | 健康档案、皮肤测试 | P1 |
| 5 | `agent_v2_order_summary_view` | order/finance | 订单、收银、成交 | P0 |
| 6 | `agent_v2_order_item_sales_view` | product/order | 商品销量、商品销售额 | P0 |
| 7 | `agent_v2_project_service_sales_view` | project/order | 项目服务、项目销售 | P0 |
| 8 | `agent_v2_payment_refund_view` | finance/afterSales | 支付、退款、售后 | P0 |
| 9 | `agent_v2_daily_settlement_view` | finance | 日结、营收、费用 | P0 |
| 10 | `agent_v2_cashier_shift_view` | finance | 收银班次、交接班 | P1 |
| 11 | `agent_v2_product_inventory_view` | inventory/product | 商品库存、临期、缺货 | P0 |
| 12 | `agent_v2_stock_movement_view` | inventory | 出入库、消耗、报废 | P0 |
| 13 | `agent_v2_inventory_scrap_view` | inventory | 报废库存流水 | P0 |
| 14 | `agent_v2_purchase_procurement_view` | supplyChain/inventory | 采购、到货、供应链 | P1 |
| 15 | `agent_v2_supplier_performance_view` | supplyChain | 供应商、报价、结算 | P1 |
| 16 | `agent_v2_project_catalog_view` | project | 项目、项目分类、BOM | P1 |
| 17 | `agent_v2_card_asset_view` | card/memberCard | 卡项、会员卡、余次 | P0 |
| 18 | `agent_v2_card_usage_view` | card/memberCard | 核销、权益消耗 | P0 |
| 19 | `agent_v2_customer_balance_view` | memberCard/finance | 储值余额、充值、消费 | P1 |
| 20 | `agent_v2_reservation_view` | reservation | 预约、到店、爽约 | P0 |
| 21 | `agent_v2_schedule_resource_view` | schedule | 排班、资源、可用性 | P1 |
| 22 | `agent_v2_staff_profile_view` | staff | 员工、美容师、等级 | P0 |
| 23 | `agent_v2_staff_performance_view` | staff/finance | 员工业绩、人效、提成 | P0 |
| 24 | `agent_v2_service_quality_view` | serviceQuality | 服务任务、护理记录质量 | P1 |
| 25 | `agent_v2_marketing_activity_view` | marketing | 营销活动、页面、素材 | P0 |
| 26 | `agent_v2_marketing_conversion_view` | marketing/channel | 线索、归因、转化 | P0 |
| 27 | `agent_v2_marketing_automation_view` | automation/marketing | 自动触达、策略执行 | P1 |
| 28 | `agent_v2_promotion_offer_view` | promotion | 优惠、促销、权益 | P1 |
| 29 | `agent_v2_customer_app_funnel_view` | customerApp/channel | 小程序绑定、访问、渠道漏斗 | P1 |
| 30 | `agent_v2_recommendation_prediction_view` | customer/marketing | 推荐、预测、客户机会 | P1 |
| 31 | `agent_v2_terminal_device_view` | terminal | 终端设备、会话、健康 | P2 |
| 32 | `agent_v2_print_job_view` | terminal/store | 打印任务、打印状态 | P2 |
| 33 | `agent_v2_appointment_gap_view` | reservation/marketing | 空档机会、邀约候选 | P1 |
| 34 | `agent_v2_industry_template_view` | industry | 行业模板、项目/商品知识 | P2 |
| 35 | `agent_v2_operating_cost_view` | finance | 经营成本、费用项目 | P1 |
| 36 | `agent_v2_store_comparison_view` | store/business | 多店对比、经营排行 | P1 |
| 37 | `agent_v2_user_role_permission_view` | system | 用户、角色、权限摘要 | P2 管理员 |
| 38 | `agent_v2_agent_governance_view` | agent | Agent 运行、评测、能力治理 | P1 管理员 |
| 39 | `agent_v2_ai_audit_view` | agent/system | AI 审计、问答日志摘要 | P2 管理员 |
| 40 | `agent_v2_data_quality_view` | system/business | 数据质量、缺字段、异常数据 | P2 管理员 |

## 4. 详细视图清单

### 4.1 门店与经营范围

#### `agent_v2_store_summary_view`

覆盖：

- 门店基础信息。
- 门店经营状态。
- 多店对比维度。

来源模型：

- `Store`

关键字段：

- `store_id`
- `store_name`
- `city`
- `status`
- `created_at`
- `business_type`

策略：

- `store_name`：allow
- `city`：allow
- `phone`：mask 或不进入首版
- `address`：mask，仅区/街道级摘要

可回答：

- 哪些门店本月表现最好？
- 当前门店经营多久了？
- 各门店数据是否完整？

### 4.2 客户与画像

#### `agent_v2_customer_profile_summary_view`

覆盖：

- 客户基础档案。
- 会员等级。
- 最近到店、最近消费。
- 客户标签摘要。

来源模型：

- `Customer`
- `CustomerHealthProfile`
- `CustomerBalanceAccount`
- `ProductOrder`
- `Reservation`

关键字段：

- `store_id`
- `customer_id`
- `customer_name_masked`
- `phone_last4`
- `gender`
- `age_band`
- `member_level`
- `first_visit_at`
- `last_visit_at`
- `last_order_at`
- `order_count`
- `total_paid_amount`
- `avg_order_amount`
- `tags_summary`

策略：

- 完整姓名：deny，改为 `customer_name_masked`
- 完整手机号：deny，改为 `phone_last4`
- 生日：deny，改为 `age_band`
- 客户备注：deny

可回答：

- 最近 30 天高消费客户有哪些？
- 哪些客户很久没来了？
- 高客单客户里最近复购下降的是谁？

#### `agent_v2_customer_behavior_view`

覆盖：

- 客户消费行为。
- 预约行为。
- 小程序行为。
- 营销触达行为。

来源模型：

- `Customer`
- `ProductOrder`
- `OrderItem`
- `Reservation`
- `CustomerBehaviorEvent`
- `CustomerAppEvent`
- `MarketingAutomationTouch`
- `RecommendationEvent`

关键字段：

- `store_id`
- `customer_id`
- `customer_name_masked`
- `event_type`
- `event_at`
- `event_source`
- `amount`
- `project_or_product_name`
- `channel`

可回答：

- 最近哪些客户互动变少？
- 哪些客户看了活动但没成交？
- 哪些客户有复购机会？

### 4.3 健康档案、肤况和服务质量

#### `agent_v2_customer_health_skin_view`

覆盖：

- 健康档案。
- 皮肤测试。
- 护理建议摘要。

来源模型：

- `CustomerHealthProfile`
- `SkinTest`
- `Customer`

关键字段：

- `store_id`
- `customer_id`
- `customer_name_masked`
- `skin_type`
- `skin_condition_summary`
- `test_at`
- `recommendation_summary`
- `risk_tags`

策略：

- 医疗或隐私级健康详情：deny
- 只保留可运营的肤况摘要和标签

可回答：

- 敏感肌客户最近做了什么项目？
- 哪类肤况客户最多？
- 哪些客户适合做护理邀约？

#### `agent_v2_service_quality_view`

覆盖：

- 服务任务。
- 护理记录完整度。
- 服务完成率。
- 服务异常。

来源模型：

- `ServiceTask`
- `SkinTest`
- `Reservation`
- `Beautician`
- `Customer`

关键字段：

- `store_id`
- `service_task_id`
- `customer_id`
- `customer_name_masked`
- `beautician_id`
- `beautician_name`
- `service_project`
- `status`
- `scheduled_at`
- `completed_at`
- `record_quality_score`
- `missing_record_fields`

可回答：

- 服务记录完整吗？
- 哪些服务任务超时？
- 哪个员工服务完成率最低？

### 4.4 订单、商品销售和项目服务

#### `agent_v2_order_summary_view`

覆盖：

- 订单主表。
- 成交、退款、客单价、客户数。

来源模型：

- `ProductOrder`
- `PaymentRecord`
- `RefundRecord`
- `Customer`

关键字段：

- `store_id`
- `order_id`
- `order_no_masked`
- `order_created_at`
- `customer_id`
- `customer_name_masked`
- `order_status`
- `total_amount`
- `paid_amount`
- `refund_amount`
- `net_amount`
- `pay_method`

策略：

- 订单号可 mask。
- 支付流水敏感号 deny。
- 客户信息脱敏。

可回答：

- 本月营业额多少？
- 上个月营业额和本月相比怎么样？
- 最近 7 天退款多不多？

#### `agent_v2_order_item_sales_view`

覆盖：

- 商品销售明细。
- 商品销量排行。
- 商品销售额、退款后净额。

来源模型：

- `OrderItem`
- `ProductOrder`
- `Product`
- `Category`

关键字段：

- `store_id`
- `order_id`
- `order_created_at`
- `product_id`
- `product_name`
- `sku`
- `category_name`
- `quantity`
- `gross_amount`
- `discount_amount`
- `net_amount`
- `refund_amount`
- `order_status`

可回答：

- 本月销量最好的商品。
- 最近 30 天销售额最高的商品。
- 哪类商品卖得最好？

#### `agent_v2_project_service_sales_view`

覆盖：

- 项目服务销售。
- 项目服务次数。
- 项目毛利口径预留。

来源模型：

- `OrderItem`
- `ProductOrder`
- `Project`
- `ProjectType`
- `ProjectBomItem`

关键字段：

- `store_id`
- `order_id`
- `order_created_at`
- `project_id`
- `project_name`
- `project_type`
- `service_quantity`
- `gross_amount`
- `net_amount`
- `estimated_material_cost`
- `estimated_margin`

可回答：

- 上个月卖得最多的项目。
- 哪些护理项目毛利最高？
- 本月项目服务次数趋势。

### 4.5 支付、退款、售后和财务

#### `agent_v2_payment_refund_view`

覆盖：

- 支付流水。
- 退款流水。
- 售后退款。

来源模型：

- `PaymentRecord`
- `RefundRecord`
- `ProductOrder`

关键字段：

- `store_id`
- `order_id`
- `paid_at`
- `refunded_at`
- `payment_method`
- `payment_amount`
- `refund_amount`
- `payment_status`
- `refund_status`
- `refund_reason_category`

策略：

- 支付账号、交易敏感号：deny
- 退款原因自由文本：mask 或分类化

可回答：

- 最近退款最多的原因是什么？
- 哪天退款金额最高？
- 本月实收、退款、净收是多少？

#### `agent_v2_daily_settlement_view`

覆盖：

- 日结。
- 收入、退款、净收、订单数。

来源模型：

- `DailySettlement`
- `ProductOrder`
- `PaymentRecord`
- `RefundRecord`

关键字段：

- `store_id`
- `settlement_date`
- `revenue_amount`
- `paid_amount`
- `refund_amount`
- `net_amount`
- `order_count`
- `customer_count`
- `cashier_shift_count`

可回答：

- 昨天日结情况。
- 本月每天营业额趋势。
- 哪天收入异常？

#### `agent_v2_operating_cost_view`

覆盖：

- 经营成本。
- 固定费用和变动费用。

来源模型：

- `OperatingCost`
- `DailySettlement`

关键字段：

- `store_id`
- `cost_id`
- `cost_date`
- `cost_category`
- `amount`
- `is_recurring`
- `settlement_date`

可回答：

- 本月成本最高的项目是什么？
- 本月净利润估算。
- 哪些费用异常增长？

#### `agent_v2_cashier_shift_view`

覆盖：

- 收银班次。
- 开班、交班、班次收入。

来源模型：

- `CashierShift`
- `PaymentRecord`
- `RefundRecord`

关键字段：

- `store_id`
- `shift_id`
- `cashier_id`
- `cashier_name`
- `opened_at`
- `closed_at`
- `shift_status`
- `paid_amount`
- `refund_amount`
- `net_amount`

可回答：

- 哪个班次收银最多？
- 今天有哪些未交班？
- 收银班次和日结是否匹配？

### 4.6 商品、库存、采购和供应链

#### `agent_v2_product_inventory_view`

覆盖：

- 商品基础。
- 当前库存。
- 安全库存。
- 临期批次。

来源模型：

- `Product`
- `Category`
- `StockBatch`

关键字段：

- `store_id`
- `product_id`
- `product_name`
- `sku`
- `category_name`
- `current_stock`
- `safety_stock`
- `stock_value`
- `nearest_expiry_date`
- `status`

可回答：

- 哪些商品缺货？
- 哪些商品快过期？
- 当前库存金额多少？

#### `agent_v2_stock_movement_view`

覆盖：

- 入库。
- 出库。
- 消耗。
- 调拨。
- 报废。

来源模型：

- `StockMovement`
- `Product`
- `StockBatch`
- `Store`

关键字段：

- `store_id`
- `movement_id`
- `occurred_at`
- `movement_type`
- `product_id`
- `product_name`
- `quantity`
- `unit`
- `reason_category`
- `operator_role`

可回答：

- 最近 30 天哪些商品消耗最多？
- 本周入库了哪些商品？
- 库存变化异常的商品有哪些？

#### `agent_v2_inventory_scrap_view`

覆盖：

- 报废库存流水。

来源模型：

- `StockMovement`
- `Product`
- `StockBatch`

过滤口径：

- `movement_type = scrap` 或报废类 reason。

关键字段：

- `store_id`
- `scrap_at`
- `product_id`
- `product_name`
- `sku`
- `category_name`
- `scrap_quantity`
- `unit`
- `scrap_reason_category`

可回答：

- 最近 30 天报废最多的产品有哪些？
- 本月报废金额估算。
- 哪类商品报废异常？

#### `agent_v2_purchase_procurement_view`

覆盖：

- 采购单。
- 采购明细。
- 到货。
- 采购状态。

来源模型：

- `PurchaseOrder`
- `ProcurementOrder`
- `ProcurementOrderItem`
- `SupplierShipment`
- `SupplierShipmentItem`
- `Product`
- `SupplySupplier`

关键字段：

- `store_id`
- `procurement_order_id`
- `supplier_id`
- `supplier_name`
- `product_id`
- `product_name`
- `ordered_quantity`
- `received_quantity`
- `order_status`
- `expected_arrival_at`
- `actual_arrival_at`
- `purchase_amount`

可回答：

- 哪些采购还没到货？
- 哪个供应商交付慢？
- 本月采购金额多少？

#### `agent_v2_supplier_performance_view`

覆盖：

- 供应商。
- 报价。
- 资质。
- 结算。

来源模型：

- `SupplySupplier`
- `SupplierQualification`
- `SupplyQuote`
- `SupplySettlement`
- `SupplySku`

关键字段：

- `supplier_id`
- `supplier_name`
- `qualification_status`
- `product_count`
- `average_quote_amount`
- `settlement_amount`
- `delivery_score`
- `last_cooperation_at`

可回答：

- 哪个供应商报价最低？
- 哪些供应商资质快过期？
- 供应商结算金额排行。

### 4.7 项目、BOM 和行业模板

#### `agent_v2_project_catalog_view`

覆盖：

- 项目基础。
- 项目分类。
- 项目耗材 BOM。

来源模型：

- `Project`
- `ProjectType`
- `ProjectBomItem`
- `Product`

关键字段：

- `store_id`
- `project_id`
- `project_name`
- `project_type`
- `duration_minutes`
- `standard_price`
- `bom_product_count`
- `estimated_material_cost`
- `status`

可回答：

- 哪些项目成本高？
- 哪些项目缺 BOM？
- 哪些项目适合做促销？

#### `agent_v2_industry_template_view`

覆盖：

- 行业项目模板。
- 行业商品模板。
- 行业证据。

来源模型：

- `IndustryServiceTemplate`
- `IndustryProductTemplate`
- `IndustryEvidence`
- `IndustryKnowledgeItem`
- `IndustryProjectBomTemplate`
- `IndustryProjectBomItemTemplate`

关键字段：

- `template_id`
- `template_type`
- `name`
- `category`
- `evidence_level`
- `source_type`
- `suggested_price_band`
- `care_cycle_weeks`

可回答：

- 哪些项目模板适合当前门店？
- 行业标准 BOM 有哪些？
- 哪些商品模板还没落地？

### 4.8 卡项、会员资产和储值

#### `agent_v2_card_asset_view`

覆盖：

- 卡项。
- 客户卡。
- 会员权益。

来源模型：

- `Card`
- `CustomerCard`
- `Customer`

关键字段：

- `store_id`
- `card_id`
- `card_name`
- `customer_card_id`
- `customer_id`
- `customer_name_masked`
- `card_status`
- `remaining_times`
- `remaining_amount`
- `expire_at`

策略：

- 客户信息脱敏。
- 卡内部备注 deny。

可回答：

- 哪些会员卡快到期？
- 哪些客户还有很多余次？
- 哪些卡项沉淀资金高？

#### `agent_v2_card_usage_view`

覆盖：

- 核销记录。
- 权益消耗。

来源模型：

- `CardUsageRecord`
- `CustomerCard`
- `Card`
- `Customer`

关键字段：

- `store_id`
- `usage_id`
- `used_at`
- `card_name`
- `customer_id`
- `customer_name_masked`
- `used_times`
- `used_amount`
- `project_or_product_name`
- `operator_role`

可回答：

- 本月核销最多的卡项。
- 哪些客户卡项使用变少？
- 核销金额趋势。

#### `agent_v2_customer_balance_view`

覆盖：

- 储值账户。
- 储值交易。

来源模型：

- `CustomerBalanceAccount`
- `CustomerBalanceTransaction`
- `Customer`

关键字段：

- `store_id`
- `customer_id`
- `customer_name_masked`
- `cash_balance`
- `gift_balance`
- `total_balance`
- `transaction_at`
- `transaction_type`
- `transaction_amount`

可回答：

- 储值余额最高的客户有哪些？
- 本月充值金额多少？
- 会员余额沉淀资金多少？

### 4.9 预约、排班和资源

#### `agent_v2_reservation_view`

覆盖：

- 预约。
- 到店。
- 爽约。
- 预约项目。

来源模型：

- `Reservation`
- `Customer`
- `Beautician`
- `Project`

关键字段：

- `store_id`
- `reservation_id`
- `reserved_at`
- `status`
- `customer_id`
- `customer_name_masked`
- `beautician_id`
- `beautician_name`
- `project_name`
- `arrival_status`

可回答：

- 今天预约有哪些？
- 本周爽约率多少？
- 哪个美容师预约最多？

#### `agent_v2_schedule_resource_view`

覆盖：

- 排班。
- 请假。
- 可用时间。
- 资源占用。

来源模型：

- `Schedule`
- `SchedulingRuleConfig`
- `BeauticianAvailability`
- `BeauticianTimeOff`
- `ResourceBooking`
- `StoreResource`

关键字段：

- `store_id`
- `beautician_id`
- `beautician_name`
- `schedule_date`
- `shift_start`
- `shift_end`
- `availability_status`
- `resource_name`
- `booking_status`

可回答：

- 明天哪些员工有空档？
- 哪些资源占用率最高？
- 本周排班利用率。

#### `agent_v2_appointment_gap_view`

覆盖：

- 预约空档机会。
- 候选客户。
- 邀约结果。

来源模型：

- `AppointmentGapOpportunity`
- `AppointmentGapCandidate`
- `AppointmentGapOpportunityEvent`
- `Customer`
- `Beautician`

关键字段：

- `store_id`
- `gap_id`
- `gap_start_at`
- `gap_end_at`
- `candidate_customer_id`
- `customer_name_masked`
- `opportunity_score`
- `event_type`
- `event_at`

可回答：

- 今天有哪些可填补空档？
- 哪些客户适合邀约补空档？
- 空档邀约转化怎么样？

### 4.10 员工、人效和提成

#### `agent_v2_staff_profile_view`

覆盖：

- 员工。
- 美容师。
- 等级。
- 技能。

来源模型：

- `User`
- `Beautician`
- `BeauticianLevel`
- `BeauticianProjectSkill`
- `UserStore`

关键字段：

- `store_id`
- `staff_id`
- `staff_name`
- `role_name`
- `beautician_level`
- `skill_project_count`
- `status`

策略：

- 登录账号敏感信息 deny。
- 手机号 mask。

可回答：

- 当前门店有多少美容师？
- 哪些员工技能覆盖多？
- 员工等级分布。

#### `agent_v2_staff_performance_view`

覆盖：

- 员工业绩。
- 服务量。
- 提成。
- 人效。

来源模型：

- `AmiPerformanceRecord`
- `CommissionRecord`
- `CommissionSettlement`
- `CommissionSettlementRecord`
- `ProductOrder`
- `ServiceTask`
- `Beautician`

关键字段：

- `store_id`
- `staff_id`
- `staff_name`
- `stat_date`
- `service_count`
- `order_amount`
- `paid_amount`
- `commission_amount`
- `customer_count`
- `average_order_amount`

可回答：

- 6 月份员工绩效排名。
- 哪个员工客单价最高？
- 哪个员工提成最高？

### 4.11 营销、推广、自动化和推荐

#### `agent_v2_marketing_activity_view`

覆盖：

- 营销活动。
- 活动页面。
- 页面版本。

来源模型：

- `MarketingActivity`
- `MarketingPage`
- `MarketingPageVersion`

关键字段：

- `store_id`
- `activity_id`
- `activity_name`
- `activity_type`
- `status`
- `start_at`
- `end_at`
- `page_id`
- `page_status`

可回答：

- 最近有哪些营销活动？
- 哪些活动还在进行？
- 哪些活动页面没有发布？

#### `agent_v2_marketing_conversion_view`

覆盖：

- 页面访问。
- 线索。
- 归因。
- 推荐事件。

来源模型：

- `MarketingPageEvent`
- `MarketingPageLead`
- `MarketingPageAttribution`
- `MarketingAttribution`
- `RecommendationEvent`

关键字段：

- `store_id`
- `activity_id`
- `page_id`
- `event_at`
- `event_type`
- `channel`
- `lead_count`
- `conversion_count`
- `attributed_order_amount`

策略：

- lead 手机号 deny 或 phone_last4。
- openId 原值 deny，使用 hash。

可回答：

- 哪个活动转化最好？
- 小程序最近带来多少客户？
- 哪个渠道线索最多？

#### `agent_v2_marketing_automation_view`

覆盖：

- 自动化策略。
- 自动触达。
- 执行效果。

来源模型：

- `MarketingAutomationStrategy`
- `MarketingRuleTemplate`
- `MarketingAutomationExecution`
- `MarketingAutomationTouch`

关键字段：

- `store_id`
- `strategy_id`
- `strategy_name`
- `rule_template_name`
- `execution_at`
- `touch_count`
- `success_count`
- `fail_count`
- `conversion_count`

可回答：

- 自动触达执行效果怎么样？
- 哪个自动化策略转化最好？
- 最近有哪些触达失败？

#### `agent_v2_promotion_offer_view`

覆盖：

- 优惠、促销、权益配置。

来源模型：

- `Promotion`

关键字段：

- `store_id`
- `promotion_id`
- `promotion_name`
- `promotion_type`
- `status`
- `start_at`
- `end_at`
- `budget_amount`
- `used_amount`

可回答：

- 当前有哪些有效优惠？
- 哪个促销使用最多？
- 哪些优惠快过期？

#### `agent_v2_recommendation_prediction_view`

覆盖：

- 预测任务。
- 客户预测快照。
- 推荐快照。

来源模型：

- `PredictionRun`
- `CustomerPredictionSnapshot`
- `MarketingRecommendationSnapshot`
- `RecommendationEvent`

关键字段：

- `store_id`
- `prediction_run_id`
- `customer_id`
- `customer_name_masked`
- `score_type`
- `score_value`
- `recommendation_type`
- `snapshot_at`

可回答：

- 哪些客户流失风险高？
- 哪些客户适合推荐活动？
- 最近推荐命中率怎么样？

### 4.12 客户小程序、渠道和终端

#### `agent_v2_customer_app_funnel_view`

覆盖：

- 客户小程序身份。
- 小程序事件。
- 渠道来源。

来源模型：

- `CustomerAppIdentity`
- `CustomerAppEvent`
- `Customer`

关键字段：

- `store_id`
- `customer_id`
- `customer_name_masked`
- `app_user_hash`
- `bind_status`
- `event_type`
- `event_at`
- `channel`
- `source`

策略：

- OpenId 原值 deny。
- app user id hash。

可回答：

- 小程序最近带来多少客户？
- 小程序绑定率怎么样？
- 哪些渠道访问最多？

#### `agent_v2_terminal_device_view`

覆盖：

- 终端设备。
- 终端会话。
- 终端健康。

来源模型：

- `TerminalDevice`
- `TerminalConversation`

关键字段：

- `store_id`
- `device_id`
- `device_name`
- `device_status`
- `last_seen_at`
- `conversation_count`
- `last_conversation_at`
- `runtime_version`

策略：

- device secret/token deny。
- 原始对话内容默认 deny，必要时只展示摘要和计数。

可回答：

- 哪些终端离线？
- 最近终端问答量多少？
- 哪台设备异常多？

#### `agent_v2_print_job_view`

覆盖：

- 打印任务。
- 打印状态。

来源模型：

- `PrintJob`

关键字段：

- `store_id`
- `print_job_id`
- `created_at`
- `printer_name`
- `job_type`
- `status`
- `retry_count`
- `error_category`

可回答：

- 今天打印失败有哪些？
- 哪台打印机失败率最高？
- 打印任务量趋势。

### 4.13 系统管理、权限和 Agent 治理

#### `agent_v2_user_role_permission_view`

覆盖：

- 用户。
- 角色。
- 门店授权。
- 权限摘要。

来源模型：

- `User`
- `Role`
- `UserRole`
- `UserStore`

适用：

- 仅系统管理员和具备 `core:agent-governance:manage` 权限的角色。

关键字段：

- `user_id`
- `user_name`
- `role_name`
- `store_id`
- `store_name`
- `permission_count`
- `status`
- `last_login_at`

策略：

- 密码、token、refresh token：deny。
- 手机号：mask。

可回答：

- 哪些用户有系统管理员权限？
- 哪些角色能管理 Agent？
- 哪些账号长期未登录？

#### `agent_v2_agent_governance_view`

覆盖：

- Agent 能力草稿。
- 能力发布版本。
- 发布运行。
- 工具 queryKey 注册。
- 自动发布日志。
- 健康指标。

来源模型：

- `AgentCapabilityDraft`
- `AgentCapabilityReview`
- `AgentCapabilityManifestVersion`
- `AgentCapabilityManifestItem`
- `AgentCapabilityPublishRun`
- `AgentToolQueryKeyRegistry`
- `AgentAutoPublishLog`
- `AgentHealthMetric`
- `AgentV2GrayRule`

适用：

- 系统管理员。

关键字段：

- `capability_id`
- `status`
- `domain`
- `risk_level`
- `manifest_version`
- `published_at`
- `dry_run_status`
- `eval_status`
- `query_key`
- `health_status`

可回答：

- 当前哪些能力待补齐？
- 哪些 queryKey dry-run 失败？
- 最近发布了哪些 Manifest？

#### `agent_v2_ai_audit_view`

覆盖：

- AI 审计日志。
- Agent 运行摘要。
- Agent 工具调用摘要。
- Agent 反馈。

来源模型：

- `AiAuditLog`
- `AgentRun`
- `AgentRunAuditDetail`
- `AgentMessage`
- `AgentStep`
- `AgentToolCall`
- `AgentFeedback`

策略：

- 原始 prompt/response 默认 deny。
- 仅展示摘要、状态、耗时、错误分类、工具名、风险等级。

可回答：

- 最近 Agent 失败原因有哪些？
- 哪些工具调用最多？
- 用户反馈最差的问题类型是什么？

#### `agent_v2_data_quality_view`

覆盖：

- 核心业务数据质量。
- 缺字段。
- 异常值。
- 重复数据摘要。

来源模型：

- 跨核心模型聚合：`Customer`、`Product`、`Project`、`ProductOrder`、`Reservation`、`StockMovement`、`MarketingActivity`。

关键字段：

- `store_id`
- `domain`
- `model_name`
- `issue_type`
- `issue_count`
- `sample_id_hash`
- `detected_at`

可回答：

- 哪些业务数据缺失严重？
- 哪些商品没有 SKU？
- 哪些客户缺手机号但有消费记录？

## 5. 模块覆盖矩阵

| 模块 | 视图覆盖 | 覆盖状态 |
| --- | --- | --- |
| 门店 | `agent_v2_store_summary_view`, `agent_v2_store_comparison_view` | 覆盖 |
| 客户 | `agent_v2_customer_profile_summary_view`, `agent_v2_customer_behavior_view` | 覆盖 |
| 健康/肤况 | `agent_v2_customer_health_skin_view` | 覆盖 |
| 商品 | `agent_v2_order_item_sales_view`, `agent_v2_product_inventory_view` | 覆盖 |
| 项目 | `agent_v2_project_service_sales_view`, `agent_v2_project_catalog_view` | 覆盖 |
| 订单 | `agent_v2_order_summary_view`, `agent_v2_order_item_sales_view` | 覆盖 |
| 支付/退款 | `agent_v2_payment_refund_view` | 覆盖 |
| 财务 | `agent_v2_daily_settlement_view`, `agent_v2_operating_cost_view`, `agent_v2_cashier_shift_view` | 覆盖 |
| 库存 | `agent_v2_product_inventory_view`, `agent_v2_stock_movement_view`, `agent_v2_inventory_scrap_view` | 覆盖 |
| 采购/供应链 | `agent_v2_purchase_procurement_view`, `agent_v2_supplier_performance_view` | 覆盖 |
| 卡项/会员资产 | `agent_v2_card_asset_view`, `agent_v2_card_usage_view`, `agent_v2_customer_balance_view` | 覆盖 |
| 预约 | `agent_v2_reservation_view`, `agent_v2_appointment_gap_view` | 覆盖 |
| 排班/资源 | `agent_v2_schedule_resource_view` | 覆盖 |
| 员工/人效 | `agent_v2_staff_profile_view`, `agent_v2_staff_performance_view` | 覆盖 |
| 服务质量 | `agent_v2_service_quality_view` | 覆盖 |
| 营销活动 | `agent_v2_marketing_activity_view`, `agent_v2_marketing_conversion_view` | 覆盖 |
| 自动化触达 | `agent_v2_marketing_automation_view` | 覆盖 |
| 促销权益 | `agent_v2_promotion_offer_view` | 覆盖 |
| 推荐/预测 | `agent_v2_recommendation_prediction_view` | 覆盖 |
| 客户小程序/渠道 | `agent_v2_customer_app_funnel_view` | 覆盖 |
| 终端 | `agent_v2_terminal_device_view` | 覆盖 |
| 打印 | `agent_v2_print_job_view` | 覆盖 |
| 行业模板 | `agent_v2_industry_template_view` | 覆盖 |
| 系统权限 | `agent_v2_user_role_permission_view` | 管理员覆盖 |
| Agent 治理 | `agent_v2_agent_governance_view`, `agent_v2_ai_audit_view` | 管理员覆盖 |
| 数据质量 | `agent_v2_data_quality_view` | 管理员覆盖 |

## 6. 对查询灵活性的影响

这种“全域白名单语义视图”会显著提升 Text-to-SQL 的灵活性：

- 用户可以跨时间、排序、筛选、分组自由提问。
- 同一模块不需要每个问法都补一个专用工具。
- 新增一个视图可以覆盖一批问题，例如订单、商品、客户、营销、库存各自都能衍生大量问法。
- 高频问题后续可以沉淀为正式 QueryPlan/Manifest 能力。

仍然存在的限制：

- LLM 不能访问视图之外的原始表。
- 视图没有暴露的字段不能被查询。
- deny 字段不能返回。
- 跨门店、跨组织仍受权限限制。
- 没有时间范围的大查询会被系统补默认时间或阻断。
- 需要写操作、审批、发券、下发的任务不能通过 Text-to-SQL 执行。

产品口径：

- 白名单视图要“广”，覆盖所有业务域。
- 字段策略要“严”，不暴露敏感原始字段。
- 执行门禁要“硬”，不允许越权和慢查询。

## 7. 首批实现建议

虽然目标是全域白名单，但开发上建议分批落地。

### 第一批：P0 经营问数高频视图

- `agent_v2_order_summary_view`
- `agent_v2_order_item_sales_view`
- `agent_v2_project_service_sales_view`
- `agent_v2_payment_refund_view`
- `agent_v2_daily_settlement_view`
- `agent_v2_product_inventory_view`
- `agent_v2_stock_movement_view`
- `agent_v2_inventory_scrap_view`
- `agent_v2_customer_profile_summary_view`
- `agent_v2_staff_performance_view`
- `agent_v2_reservation_view`
- `agent_v2_marketing_conversion_view`

### 第二批：P1 全经营域扩展

- `agent_v2_customer_behavior_view`
- `agent_v2_customer_health_skin_view`
- `agent_v2_project_catalog_view`
- `agent_v2_purchase_procurement_view`
- `agent_v2_supplier_performance_view`
- `agent_v2_card_asset_view`
- `agent_v2_card_usage_view`
- `agent_v2_customer_balance_view`
- `agent_v2_schedule_resource_view`
- `agent_v2_service_quality_view`
- `agent_v2_marketing_activity_view`
- `agent_v2_marketing_automation_view`
- `agent_v2_promotion_offer_view`
- `agent_v2_customer_app_funnel_view`
- `agent_v2_recommendation_prediction_view`
- `agent_v2_appointment_gap_view`
- `agent_v2_operating_cost_view`
- `agent_v2_store_comparison_view`

### 第三批：P2 管理、治理和系统域

- `agent_v2_store_summary_view`
- `agent_v2_terminal_device_view`
- `agent_v2_print_job_view`
- `agent_v2_industry_template_view`
- `agent_v2_user_role_permission_view`
- `agent_v2_agent_governance_view`
- `agent_v2_ai_audit_view`
- `agent_v2_data_quality_view`

## 8. 验收标准

### 8.1 覆盖验收

- 每个业务 domain 至少有一个启用语义视图。
- 每个核心模块至少有一个 P0/P1 语义视图。
- 所有视图在 registry 中有 description、domain、requiredPermissions、storeScopeField、defaultTimeField、fieldPolicies。

### 8.2 安全验收

- 所有视图不暴露 token/password/secret。
- 客户、员工、线索、渠道身份统一脱敏。
- 没有 store scope 的视图必须标记 `adminOnly=true`。
- 大数据视图必须有 defaultTimeField。
- `SELECT *`、非白名单视图、deny 字段查询必须被 Guard 阻断。

### 8.3 灵活性验收

以下问题应能路由到对应视图：

- 本月销量最好的商品。
- 最近 30 天报废最多的产品有哪些。
- 上个月营业额和本月相比怎么样。
- 哪个员工客单价最高。
- 哪些客户最近复购下降。
- 哪个营销活动转化最好。
- 哪个供应商交付最慢。
- 哪些会员卡快到期。
- 小程序最近带来多少客户。
- 最近 Agent 发布有哪些失败。

