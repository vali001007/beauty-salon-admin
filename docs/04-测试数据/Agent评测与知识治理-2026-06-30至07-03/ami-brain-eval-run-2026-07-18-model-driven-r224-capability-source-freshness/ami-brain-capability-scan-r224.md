# Ami Brain Capability Scan

- Generated: 2026-07-18T05:36:19.656Z
- Total: 28
- Draft: 28
- Blocked: 0
- Strict: FAIL

| Capability | Status | Explicit | Permissions | Fingerprint |
| --- | --- | --- | --- | --- |
| beautician_customer_card_progress | draft | yes | core:brain:beautician-view, core:brain:use, core:store:reservations | a5fa18841b1e |
| beautician_material_preparation | draft | yes | core:brain:beautician-view, core:brain:use, core:store:reservations | 25e7001fdb58 |
| beautician_service_overview | draft | yes | core:brain:beautician-view, core:brain:use, core:store:reservations | 62872afaa6ed |
| customer_facts | draft | yes | core:brain:use, core:customer:view | 06691df3673a |
| customer_feedback_overview | draft | yes | core:brain:use, core:customer:view | 5cb14561aa40 |
| customer_follow_up_draft | draft | yes | core:brain:use, core:customer:view | 1286cfee6e31 |
| customer_priority_recommendation | draft | yes | core:brain:use, core:marketing:analytics | 60ba1927a8e2 |
| customer_waiting_loss_overview | draft | yes | core:brain:use, core:store:reservations | 16d9b2656bd8 |
| finance_payment_breakdown | draft | yes | core:brain:use, core:finance:view | 17c0d4a59662 |
| finance_risk_overview | draft | yes | core:brain:use, core:finance:view | b283f8678d4b |
| front_desk_operations_overview | draft | yes | core:brain:use, core:store:reservations | 4f2e5fa0fb9b |
| gap_fill_touch_preview | draft | yes | core:brain:use, core:marketing:create, core:store:scheduling | 5624c7a8024b |
| inventory_operations_overview | draft | yes | core:brain:use, core:inventory:stock | 7e4a4b6216e3 |
| inventory_procurement_advice | draft | yes | core:brain:use, core:inventory:stock | 81a92f1b7e6d |
| inventory_risk_ranking | draft | yes | core:brain:use, core:inventory:stock | 004378999506 |
| manager_staff_overview | draft | yes | core:beautician-performance:view, core:brain:use, core:store:reservations | 2cb152d7d209 |
| marketing_customer_segment | draft | yes | core:brain:use, core:marketing:analytics | ef7f75661608 |
| marketing_growth_overview | draft | yes | core:brain:use, core:customer:view, core:marketing:analytics | ff93f37217a7 |
| marketing_message_draft | draft | yes | core:brain:use, core:marketing:create | 4fbdc45d5330 |
| marketing_touch_draft | draft | yes | core:brain:use, core:marketing:create | d59e2b7a12d5 |
| order_revenue_analysis | draft | yes | core:brain:use, core:finance:view | 822334cbfb0a |
| product_sales_ranking | draft | yes | core:brain:use, core:order:products | 1e8a425418be |
| project_service_ranking | draft | yes | core:brain:use, core:project-order-profit:view | aecb7c26d341 |
| purchase_order_draft | draft | yes | core:brain:use, core:supply:manage | 8513bc60fd29 |
| reservation_action_preview | draft | yes | core:brain:use, core:store:reservations | 463a25bcd7d3 |
| reservation_list | draft | yes | core:brain:use, core:store:reservations | 040e86051bad |
| staff_performance_ranking | draft | yes | core:beautician-performance:view, core:brain:use | 762b1d28be39 |
| store_operations_overview | draft | yes | core:brain:use, core:dashboard:view, core:finance:view, core:store:reservations | 413d1e851502 |

## Drift

| Capability | Type | High Risk | Reasons |
| --- | --- | --- | --- |
| beautician_customer_card_progress | added | no | new_capability |
| beautician_material_preparation | added | no | new_capability |
| beautician_service_overview | changed | yes | permission_narrowed_or_changed |
| customer_facts | changed | no | source_contract_changed |
| customer_feedback_overview | added | no | new_capability |
| customer_follow_up_draft | added | no | new_capability |
| customer_priority_recommendation | changed | no | source_contract_changed |
| customer_waiting_loss_overview | added | no | new_capability |
| finance_payment_breakdown | changed | no | source_contract_changed |
| finance_risk_overview | changed | no | source_contract_changed |
| front_desk_operations_overview | changed | no | source_contract_changed |
| gap_fill_touch_preview | added | no | new_capability |
| inventory_operations_overview | changed | no | source_contract_changed |
| inventory_procurement_advice | changed | no | source_contract_changed |
| inventory_risk_ranking | changed | no | source_contract_changed |
| manager_staff_overview | changed | no | source_contract_changed |
| marketing_customer_segment | changed | no | source_contract_changed |
| marketing_growth_overview | changed | no | source_contract_changed |
| marketing_message_draft | added | no | new_capability |
| marketing_touch_draft | added | no | new_capability |
| order_revenue_analysis | changed | no | source_contract_changed |
| product_sales_ranking | changed | no | source_contract_changed |
| project_service_ranking | changed | no | source_contract_changed |
| purchase_order_draft | added | no | new_capability |
| reservation_action_preview | added | no | new_capability |
| reservation_list | changed | no | source_contract_changed |
| staff_performance_ranking | changed | no | source_contract_changed |
| store_operations_overview | changed | no | source_contract_changed |
