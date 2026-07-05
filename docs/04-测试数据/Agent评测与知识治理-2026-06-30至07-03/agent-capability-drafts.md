# Agent Capability 草案候选

生成时间：2026-07-02T11:33:06.991Z
来源报告：docs/04-测试数据/agent-knowledge-scan-report.json

## 摘要

- 草案总数：120
- Agent gap：0
- 前端页面候选：0
- API 候选：120
- 当前扫描时间：2026-07-02T11:33:00.475Z

## 使用原则

- 本文件只生成草案，不自动写入 CapabilityCatalog、SkillRegistry 或 ToolRegistry。
- 进入正式开发前必须由产品或研发确认业务语义、权限、输出形式和审批策略。
- 高风险动作只能生成确认卡或审批草稿，不允许直接执行。

## P1 草案

- 无

## P2 草案

- 无

## P3 草案

| 草案 | Persona | 来源 | 建议工具 | 风险 | 证据 | 待确认 |
|---|---|---|---|---|---|---|
| agent_automations_apioperation | marketing | api_endpoint | business.query.ask | low | GET /agent/automations<br>src\agent\agent.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| agent_automations_effects_apioperation | marketing | api_endpoint | business.query.ask | low | GET /agent/automations/effects<br>src\agent\agent.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| agent_automations_pending_approvals_apioperation | marketing | api_endpoint | business.query.ask | low | GET /agent/automations/pending-approvals<br>src\agent\agent.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| agent_automations_runs_apioperation | marketing | api_endpoint | business.query.ask | low | GET /agent/automations/runs<br>src\agent\agent.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| agent_automations_triggers_apioperation | marketing | api_endpoint | business.query.ask | low | GET /agent/automations/triggers<br>src\agent\agent.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| beautician_levels_permissions | beautician | api_endpoint | business.query.ask | low | GET /beautician-levels<br>src\beauticians\beauticians.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| beauticians_permissions | beautician | api_endpoint | business.query.ask | low | GET /beauticians<br>src\beauticians\beauticians.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| beauticians_id_permissions | beautician | api_endpoint | business.query.ask | low | GET /beauticians/:id<br>src\beauticians\beauticians.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| beauticians_paginated_permissions | beautician | api_endpoint | business.query.ask | low | GET /beauticians/paginated<br>src\beauticians\beauticians.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| bom_services_permissions | beautician | api_endpoint | business.query.ask | low | GET /bom/services<br>src\bom\bom.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| bom_services_id_consumption_permissions | beautician | api_endpoint | business.query.ask | low | GET /bom/services/:id/consumption<br>src\bom\bom.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| cards_permissions | reception | api_endpoint | business.query.ask | low | GET /cards<br>src\cards\cards.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| cards_id_permissions | reception | api_endpoint | business.query.ask | low | GET /cards/:id<br>src\cards\cards.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| cards_sale_options_permissions | reception | api_endpoint | business.query.ask | low | GET /cards/sale-options<br>src\cards\cards.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| commission_ami_bills_permissions | finance | api_endpoint | business.query.ask | low | GET /commission/ami/bills<br>src\commission\commission.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| commission_ami_bills_month_permissions | finance | api_endpoint | business.query.ask | low | GET /commission/ami/bills/:month<br>src\commission\commission.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| commission_ami_dashboard_permissions | finance | api_endpoint | business.query.ask | low | GET /commission/ami/dashboard<br>src\commission\commission.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| commission_ami_performance_permissions | finance | api_endpoint | business.query.ask | low | GET /commission/ami/performance<br>src\commission\commission.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| commission_daily_settlements_permissions | finance | api_endpoint | business.query.ask | low | GET /commission/daily-settlements<br>src\commission\commission.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| commission_payment_records_permissions | finance | api_endpoint | business.query.ask | low | GET /commission/payment-records<br>src\commission\commission.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| commission_platform_revenue_permissions | finance | api_endpoint | business.query.ask | low | GET /commission/platform/revenue<br>src\commission\commission.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| commission_reconciliation_exceptions_permissions | finance | api_endpoint | business.query.ask | low | GET /commission/reconciliation-exceptions<br>src\commission\commission.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| commission_records_beautician_summary_apioperation | finance | api_endpoint | business.query.ask | low | GET /commission/records/beautician-summary<br>src\commission\commission.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| commission_records_paginated_permissions | finance | api_endpoint | business.query.ask | low | GET /commission/records/paginated<br>src\commission\commission.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| commission_records_summary_permissions | finance | api_endpoint | business.query.ask | low | GET /commission/records/summary<br>src\commission\commission.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| commission_refund_records_permissions | finance | api_endpoint | business.query.ask | low | GET /commission/refund-records<br>src\commission\commission.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| commission_rule_assignments_permissions | finance | api_endpoint | business.query.ask | low | GET /commission/rule-assignments<br>src\commission\commission.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| commission_rules_permissions | finance | api_endpoint | business.query.ask | low | GET /commission/rules<br>src\commission\commission.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| commission_rules_id_permissions | finance | api_endpoint | business.query.ask | low | GET /commission/rules/:id<br>src\commission\commission.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| commission_settlements_export_permissions | finance | api_endpoint | business.query.ask | low | GET /commission/settlements/export<br>src\commission\commission.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| commission_settlements_id_permissions | finance | api_endpoint | business.query.ask | low | GET /commission/settlements/:id<br>src\commission\commission.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| commission_settlements_paginated_permissions | finance | api_endpoint | business.query.ask | low | GET /commission/settlements/paginated<br>src\commission\commission.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| commission_shifts_current_permissions | finance | api_endpoint | business.query.ask | low | GET /commission/shifts/current<br>src\commission\commission.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| commission_shifts_current_apioperation | finance | api_endpoint | business.query.ask | low | GET /commission/shifts/current<br>src\commission\commission.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| commission_shifts_history_permissions | finance | api_endpoint | business.query.ask | low | GET /commission/shifts/history<br>src\commission\commission.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| commission_shifts_history_apioperation | finance | api_endpoint | business.query.ask | low | GET /commission/shifts/history<br>src\commission\commission.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| customer_app_admin_display_configs_apibearerauth | manager | api_endpoint | business.query.ask | low | GET /customer-app/admin/display-configs<br>src\customer-app\customer-app.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| customer_app_admin_events_apibearerauth | manager | api_endpoint | business.query.ask | low | GET /customer-app/admin/events<br>src\customer-app\customer-app.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| customer_app_admin_events_paginated_apibearerauth | manager | api_endpoint | business.query.ask | low | GET /customer-app/admin/events/paginated<br>src\customer-app\customer-app.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| customer_app_contact_apioperation | manager | api_endpoint | business.query.ask | low | GET /customer-app/contact<br>src\customer-app\customer-app.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| customer_app_home_apioperation | manager | api_endpoint | business.query.ask | low | GET /customer-app/home<br>src\customer-app\customer-app.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| customer_app_me_apibearerauth | manager | api_endpoint | business.query.ask | low | GET /customer-app/me<br>src\customer-app\customer-app.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| customer_app_me_cards_apibearerauth | reception | api_endpoint | business.query.ask | low | GET /customer-app/me/cards<br>src\customer-app\customer-app.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| customer_app_me_consumption_records_apibearerauth | manager | api_endpoint | business.query.ask | low | GET /customer-app/me/consumption-records<br>src\customer-app\customer-app.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| customer_app_me_member_card_apibearerauth | reception | api_endpoint | business.query.ask | low | GET /customer-app/me/member-card<br>src\customer-app\customer-app.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| customer_app_me_reservations_apibearerauth | reception | api_endpoint | business.query.ask | low | GET /customer-app/me/reservations<br>src\customer-app\customer-app.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| customer_app_projects_apioperation | manager | api_endpoint | business.query.ask | low | GET /customer-app/projects<br>src\customer-app\customer-app.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| customer_app_projects_id_apioperation | manager | api_endpoint | business.query.ask | low | GET /customer-app/projects/:id<br>src\customer-app\customer-app.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| customer_app_projects_id_available_beauticians_apioperation | beautician | api_endpoint | business.query.ask | low | GET /customer-app/projects/:id/available-beauticians<br>src\customer-app\customer-app.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| customer_app_reservations_availability_apioperation | reception | api_endpoint | business.query.ask | low | GET /customer-app/reservations/availability<br>src\customer-app\customer-app.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| customer_app_skin_tests_id_apibearerauth | manager | api_endpoint | business.query.ask | low | GET /customer-app/skin-tests/:id<br>src\customer-app\customer-app.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| customer_app_skin_tests_id_recommendations_apibearerauth | manager | api_endpoint | business.query.ask | low | GET /customer-app/skin-tests/:id/recommendations<br>src\customer-app\customer-app.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| customers_permissions | manager | api_endpoint | business.query.ask | low | GET /customers<br>src\customers\customers.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| customers_card_portraits_permissions | reception | api_endpoint | business.query.ask | low | GET /customers/card-portraits<br>src\customers\customers.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| customers_consumption_records_permissions | manager | api_endpoint | business.query.ask | low | GET /customers/consumption-records<br>src\customers\customers.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| customers_consumption_records_paginated_permissions | manager | api_endpoint | business.query.ask | low | GET /customers/consumption-records/paginated<br>src\customers\customers.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| customers_health_profiles_permissions | manager | api_endpoint | business.query.ask | low | GET /customers/health-profiles<br>src\customers\customers.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| customers_id_permissions | manager | api_endpoint | business.query.ask | low | GET /customers/:id<br>src\customers\customers.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| customers_id_consumption_records_paginated_permissions | manager | api_endpoint | business.query.ask | low | GET /customers/:id/consumption-records/paginated<br>src\customers\customers.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| customers_id_health_profile_permissions | manager | api_endpoint | business.query.ask | low | GET /customers/:id/health-profile<br>src\customers\customers.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| customers_id_profile_permissions | manager | api_endpoint | business.query.ask | low | GET /customers/:id/profile<br>src\customers\customers.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| customers_miniapp_behavior_analysis_permissions | manager | api_endpoint | business.query.ask | low | GET /customers/miniapp-behavior-analysis<br>src\customers\customers.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| customers_paginated_permissions | manager | api_endpoint | business.query.ask | low | GET /customers/paginated<br>src\customers\customers.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| customers_profile_analytics_permissions | manager | api_endpoint | business.query.ask | low | GET /customers/profile-analytics<br>src\customers\customers.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| customers_profile_analytics_behavior_permissions | manager | api_endpoint | business.query.ask | low | GET /customers/profile-analytics/behavior<br>src\customers\customers.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| customers_profile_analytics_overview_permissions | manager | api_endpoint | business.query.ask | low | GET /customers/profile-analytics/overview<br>src\customers\customers.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| customers_profile_analytics_prediction_permissions | manager | api_endpoint | business.query.ask | low | GET /customers/profile-analytics/prediction<br>src\customers\customers.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| customers_profile_analytics_segment_permissions | manager | api_endpoint | business.query.ask | low | GET /customers/profile-analytics/segment<br>src\customers\customers.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| customers_profile_analytics_skin_permissions | manager | api_endpoint | business.query.ask | low | GET /customers/profile-analytics/skin<br>src\customers\customers.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| customers_segment_count_permissions | manager | api_endpoint | business.query.ask | low | GET /customers/segment-count<br>src\customers\customers.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| dashboard_overview_permissions | manager | api_endpoint | business.query.ask | low | GET /dashboard/overview<br>src\dashboard\dashboard.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| dashboard_workbench_permissions | manager | api_endpoint | business.query.ask | low | GET /dashboard/workbench<br>src\dashboard\dashboard.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| industry_bom_templates_servicetemplateid_permissions | beautician | api_endpoint | business.query.ask | low | GET /industry/bom-templates/:serviceTemplateId<br>src\industry\industry.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| industry_service_templates_permissions | beautician | api_endpoint | business.query.ask | low | GET /industry/service-templates<br>src\industry\industry.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| industry_service_templates_id_permissions | beautician | api_endpoint | business.query.ask | low | GET /industry/service-templates/:id<br>src\industry\industry.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| industry_service_templates_id_bom_permissions | beautician | api_endpoint | business.query.ask | low | GET /industry/service-templates/:id/bom<br>src\industry\industry.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| industry_service_templates_paginated_permissions | beautician | api_endpoint | business.query.ask | low | GET /industry/service-templates/paginated<br>src\industry\industry.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| inventory_batches_permissions | inventory | api_endpoint | business.query.ask | low | GET /inventory/batches<br>src\inventory\inventory.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| inventory_expiring_permissions | inventory | api_endpoint | business.query.ask | low | GET /inventory/expiring<br>src\inventory\inventory.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| inventory_expiring_paginated_permissions | inventory | api_endpoint | business.query.ask | low | GET /inventory/expiring/paginated<br>src\inventory\inventory.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| inventory_expiring_summary_permissions | inventory | api_endpoint | business.query.ask | low | GET /inventory/expiring/summary<br>src\inventory\inventory.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| inventory_purchase_orders_permissions | inventory | api_endpoint | business.query.ask | low | GET /inventory/purchase-orders<br>src\inventory\inventory.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| inventory_purchase_orders_paginated_permissions | inventory | api_endpoint | business.query.ask | low | GET /inventory/purchase-orders/paginated<br>src\inventory\inventory.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| inventory_replenishment_permissions | inventory | api_endpoint | business.query.ask | low | GET /inventory/replenishment<br>src\inventory\inventory.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| inventory_stock_permissions | inventory | api_endpoint | business.query.ask | low | GET /inventory/stock<br>src\inventory\inventory.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| inventory_stock_movements_permissions | inventory | api_endpoint | business.query.ask | low | GET /inventory/stock-movements<br>src\inventory\inventory.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| inventory_stock_paginated_permissions | inventory | api_endpoint | business.query.ask | low | GET /inventory/stock/paginated<br>src\inventory\inventory.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| inventory_transfers_paginated_permissions | inventory | api_endpoint | business.query.ask | low | GET /inventory/transfers/paginated<br>src\inventory\inventory.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| inventory_transfers_suggestions_permissions | inventory | api_endpoint | business.query.ask | low | GET /inventory/transfers/suggestions<br>src\inventory\inventory.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| marketing_activities_permissions | marketing | api_endpoint | business.query.ask | low | GET /marketing/activities<br>src\marketing\marketing.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| marketing_activities_id_permissions | marketing | api_endpoint | business.query.ask | low | GET /marketing/activities/:id<br>src\marketing\marketing.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| marketing_automation_effects_permissions | marketing | api_endpoint | business.query.ask | low | GET /marketing/automation/effects<br>src\marketing\marketing.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| marketing_automation_executions_id_permissions | marketing | api_endpoint | business.query.ask | low | GET /marketing/automation/executions/:id<br>src\marketing\marketing.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| marketing_automation_executions_paginated_permissions | marketing | api_endpoint | business.query.ask | low | GET /marketing/automation/executions/paginated<br>src\marketing\marketing.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| marketing_automation_rule_templates_permissions | marketing | api_endpoint | business.query.ask | low | GET /marketing/automation/rule-templates<br>src\marketing\marketing.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| marketing_automation_rule_templates_id_permissions | marketing | api_endpoint | business.query.ask | low | GET /marketing/automation/rule-templates/:id<br>src\marketing\marketing.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| marketing_automation_rule_templates_id_effects_permissions | marketing | api_endpoint | business.query.ask | low | GET /marketing/automation/rule-templates/:id/effects<br>src\marketing\marketing.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| marketing_automation_strategies_paginated_permissions | marketing | api_endpoint | business.query.ask | low | GET /marketing/automation/strategies/paginated<br>src\marketing\marketing.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| marketing_automation_trigger_options_permissions | marketing | api_endpoint | business.query.ask | low | GET /marketing/automation/trigger-options<br>src\marketing\marketing.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| marketing_effects_unified_permissions | marketing | api_endpoint | business.query.ask | low | GET /marketing/effects/unified<br>src\marketing\marketing.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| marketing_follow_up_tasks_permissions | marketing | api_endpoint | business.query.ask | low | GET /marketing/follow-up-tasks<br>src\marketing\marketing.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| marketing_follow_up_tasks_summary_permissions | marketing | api_endpoint | business.query.ask | low | GET /marketing/follow-up-tasks/summary<br>src\marketing\marketing.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| marketing_invitation_candidates_permissions | marketing | api_endpoint | business.query.ask | low | GET /marketing/invitation-candidates<br>src\marketing\marketing.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| marketing_pages_permissions | marketing | api_endpoint | business.query.ask | low | GET /marketing/pages<br>src\marketing-pages\marketing-pages.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| marketing_pages_attribution_summary_permissions | marketing | api_endpoint | business.query.ask | low | GET /marketing/pages/attribution/summary<br>src\marketing-pages\marketing-pages.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| marketing_pages_id_permissions | marketing | api_endpoint | business.query.ask | low | GET /marketing/pages/:id<br>src\marketing-pages\marketing-pages.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| marketing_pages_id_attribution_permissions | marketing | api_endpoint | business.query.ask | low | GET /marketing/pages/:id/attribution<br>src\marketing-pages\marketing-pages.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| marketing_pages_id_effects_permissions | marketing | api_endpoint | business.query.ask | low | GET /marketing/pages/:id/effects<br>src\marketing-pages\marketing-pages.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| marketing_pages_id_events_permissions | marketing | api_endpoint | business.query.ask | low | GET /marketing/pages/:id/events<br>src\marketing-pages\marketing-pages.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| marketing_pages_id_leads_permissions | marketing | api_endpoint | business.query.ask | low | GET /marketing/pages/:id/leads<br>src\marketing-pages\marketing-pages.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| marketing_predictions_customers_permissions | marketing | api_endpoint | business.query.ask | low | GET /marketing/predictions/customers<br>src\marketing\marketing.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| marketing_predictions_customers_id_permissions | marketing | api_endpoint | business.query.ask | low | GET /marketing/predictions/customers/:id<br>src\marketing\marketing.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| marketing_predictions_latest_permissions | marketing | api_endpoint | business.query.ask | low | GET /marketing/predictions/latest<br>src\marketing\marketing.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| marketing_recommendations_permissions | marketing | api_endpoint | business.query.ask | low | GET /marketing/recommendations<br>src\marketing\marketing.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| marketing_recommendations_id_audience_permissions | marketing | api_endpoint | business.query.ask | low | GET /marketing/recommendations/:id/audience<br>src\marketing\marketing.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| marketing_strategies_effects_permissions | marketing | api_endpoint | business.query.ask | low | GET /marketing/strategies/effects<br>src\marketing\marketing.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| operation_costs_permissions | manager | api_endpoint | business.query.ask | low | GET /operation-costs<br>src\operation-profit\operation-costs.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| operation_profit_beautician_performance_permissions | finance | api_endpoint | business.query.ask | low | GET /operation-profit/beautician-performance<br>src\operation-profit\operation-profit.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| operation_profit_overview_permissions | finance | api_endpoint | business.query.ask | low | GET /operation-profit/overview<br>src\operation-profit\operation-profit.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
| operation_profit_prepaid_liabilities_permissions | finance | api_endpoint | business.query.ask | low | GET /operation-profit/prepaid-liabilities<br>src\operation-profit\operation-profit.controller.ts | 确认 API 返回字段口径<br>确认是否已有 BusinessQuery 能力覆盖 |
