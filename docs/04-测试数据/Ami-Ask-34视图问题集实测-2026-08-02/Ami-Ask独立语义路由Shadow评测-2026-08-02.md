# Ami Ask 独立语义路由 Shadow 评测

- 样本：286 道现有全局不重复问题
- 模式：只评估确定性语义候选，不调用模型、不执行 SQL、不访问数据库

## 结论

- 旧候选召回率：73.4%
- 新语义候选召回率：100.0%
- 召回率变化：26.6%
- 真实歧义澄清比例：10.8%
- 无理由澄清比例：0.0%
- 需语义模型回退比例：2.5%
- 确定性路由平均 / P95：0.56ms / 0.71ms

该结果只证明“问题进入正确候选视图”的离线路由能力，不代表 SQL 生成准确率、数据库执行成功率或最终回答准确率。完整 286 题真实模型与数据库复测仍需单独执行。

## 逐视图候选召回

| 视图 | 题数 | 旧召回 | 新召回 |
|---|---:|---:|---:|
| 订单摘要<br>`agent_v3_order_summary_view` | 10 | 100.0% | 100.0% |
| 商品销售<br>`agent_v3_order_item_sales_view` | 10 | 20.0% | 100.0% |
| 项目服务销售<br>`agent_v3_project_service_sales_view` | 10 | 0.0% | 100.0% |
| 支付与退款<br>`agent_v3_payment_refund_view` | 10 | 90.0% | 100.0% |
| 日结<br>`agent_v3_daily_settlement_view` | 10 | 60.0% | 100.0% |
| 商品库存<br>`agent_v3_product_inventory_view` | 10 | 100.0% | 100.0% |
| 库存流水<br>`agent_v3_stock_movement_view` | 10 | 80.0% | 100.0% |
| 库存报废<br>`agent_v3_inventory_scrap_view` | 0 | 0.0% | 0.0% |
| 客户档案摘要<br>`ask_data_customer_profile_summary_view` | 10 | 50.0% | 100.0% |
| 员工档案<br>`agent_v3_staff_profile_view` | 5 | 20.0% | 100.0% |
| 员工绩效<br>`ask_data_staff_performance_view` | 10 | 30.0% | 100.0% |
| 预约<br>`agent_v3_reservation_view` | 10 | 100.0% | 100.0% |
| 营销转化<br>`agent_v3_marketing_conversion_view` | 10 | 100.0% | 100.0% |
| 次卡资产<br>`agent_v3_card_asset_view` | 10 | 100.0% | 100.0% |
| 次卡核销<br>`agent_v3_card_usage_view` | 10 | 100.0% | 100.0% |
| 客户余额<br>`agent_v3_customer_balance_view` | 5 | 100.0% | 100.0% |
| 服务质量<br>`agent_v3_service_quality_view` | 10 | 100.0% | 100.0% |
| 预约空档<br>`agent_v3_appointment_gap_view` | 9 | 55.6% | 100.0% |
| 项目目录<br>`agent_v3_project_catalog_view` | 10 | 0.0% | 100.0% |
| 营销活动<br>`agent_v3_marketing_activity_view` | 10 | 100.0% | 100.0% |
| 自动触达<br>`agent_v3_marketing_automation_view` | 10 | 100.0% | 100.0% |
| 优惠活动<br>`agent_v3_promotion_offer_view` | 1 | 100.0% | 100.0% |
| 经营成本<br>`ask_data_operating_cost_view` | 10 | 40.0% | 100.0% |
| 采购<br>`agent_v3_purchase_procurement_view` | 10 | 90.0% | 100.0% |
| 供应商表现<br>`agent_v3_supplier_performance_view` | 7 | 100.0% | 100.0% |
| 已确认实际利润<br>`ask_data_confirmed_profit_view` | 10 | 100.0% | 100.0% |
| 财务对账异常<br>`ask_data_reconciliation_issue_view` | 10 | 10.0% | 100.0% |
| 会员履约负债<br>`ask_data_member_liability_view` | 10 | 100.0% | 100.0% |
| 排班与员工产能<br>`ask_data_staff_capacity_view` | 10 | 100.0% | 100.0% |
| 库存调拨<br>`ask_data_transfer_status_view` | 0 | 0.0% | 0.0% |
| BOM 实际消耗偏差<br>`ask_data_bom_consumption_variance_view` | 4 | 100.0% | 100.0% |
| 客户反馈<br>`ask_data_customer_feedback_view` | 5 | 100.0% | 100.0% |
| 客户生命周期<br>`ask_data_customer_lifecycle_view` | 10 | 50.0% | 100.0% |
| 营销 ROI<br>`ask_data_marketing_roi_view` | 10 | 100.0% | 100.0% |
