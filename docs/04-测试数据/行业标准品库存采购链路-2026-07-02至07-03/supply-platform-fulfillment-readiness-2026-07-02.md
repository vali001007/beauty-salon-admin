# 供应链平台采购履约闭环就绪度报告

生成时间：2026-07-02T16:12:02.838Z

验收范围：Ami 全量演示门店（ID 6）

总状态：未闭环

## 1. 关键门禁

| 门禁 | 结果 | 说明 |
| --- | --- | --- |
| 可采购映射 | 未通过 | 有效映射+报价 0 条 |
| 补货来源平台采购单 | 未通过 | 补货来源订单 0 张 |
| 供应商发货 | 未通过 | 发货单 0 张，发货明细 0 条 |
| 门店收货入库 | 未通过 | 已收货订单 0 张，平台采购入库流水 0 条 |
| 供应商结算 | 未通过 | 结算单 0 张 |
| 最新订单可追溯 | 未通过 | 暂无补货来源平台订单 |

## 2. 对象计数

| 对象 | 数量 |
| --- | --- |
| active SupplyCatalogMapping | 0 |
| preferred SupplyCatalogMapping | 0 |
| mapping with active quote | 0 |
| replenishment ProcurementOrder | 0 |
| ProcurementOrderItem | 0 |
| SupplierShipment | 0 |
| SupplierShipmentItem | 0 |
| received ProcurementOrder | 0 |
| purchase_inbound StockMovement | 0 |
| SupplySettlement | 0 |

## 3. 最新补货来源平台订单

暂无补货来源平台订单。

## 4. 最新订单库存流水

暂无可追溯的平台采购入库流水。

## 5. 缺口与下一步

- 先在行业数据平台/供应链映射中建立本地商品到已审核供应链 SKU 的首选映射，并确保存在有效报价。
- 从库存采购建议生成平台采购单，或执行授权后的供应链履约样本脚本。
- 供应商确认订单并创建发货单。
- 门店执行平台采购收货，写入批次、商品库存和采购入库流水。
- 对已收货订单生成供应商月结记录。

说明：

- 本脚本只读，不会创建映射、采购单、发货单、批次、库存流水或结算单。
- 当前库存流水兼容识别 `sourceType=supply_platform_order` 和计划中的 `sourceType=procurement_order`；仓内既有供应链方案和页面以 `supply_platform_order` 为主。
