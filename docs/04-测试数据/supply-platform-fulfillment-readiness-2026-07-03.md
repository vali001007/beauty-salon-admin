# 供应链平台采购履约闭环就绪度报告

生成时间：2026-07-03T07:23:48.593Z

验收范围：Ami 全量演示门店（ID 6）

总状态：已闭环

## 1. 关键门禁

| 门禁 | 结果 | 说明 |
| --- | --- | --- |
| 可采购映射 | 通过 | 有效映射+报价 1 条 |
| 补货来源平台采购单 | 通过 | 补货来源订单 1 张 |
| 供应商发货 | 通过 | 发货单 1 张，发货明细 1 条 |
| 门店收货入库 | 通过 | 已收货订单 1 张，平台采购入库流水 1 条 |
| 供应商结算 | 通过 | 结算单 1 张 |
| 最新订单可追溯 | 通过 | 订单 SP-MVP-1783038772440，流水 1 条 |

## 2. 对象计数

| 对象 | 数量 |
| --- | --- |
| active SupplyCatalogMapping | 1 |
| preferred SupplyCatalogMapping | 1 |
| mapping with active quote | 1 |
| replenishment ProcurementOrder | 1 |
| ProcurementOrderItem | 1 |
| SupplierShipment | 1 |
| SupplierShipmentItem | 1 |
| received ProcurementOrder | 1 |
| purchase_inbound StockMovement | 1 |
| SupplySettlement | 1 |

## 3. 最新补货来源平台订单

| 字段 | 值 |
| --- | --- |
| 订单号 | SP-MVP-1783038772440 |
| 来源 | supply-platform-mvp-flow |
| 状态 | received |
| 门店 | Ami 全量演示门店 |
| 供应商 | Ami MVP 供应商 |
| 明细数 | 1 |
| 发货单数 | 1 |
| 采购金额 | 60.00 |
| 净额 | 57.00 |

## 4. 最新订单库存流水

| 流水ID | 产品 | SKU | 批次 | 数量 | 来源类型 | 来源单号 |
| --- | --- | --- | --- | --- | --- | --- |
| 553 | 玻尿酸保湿精华 | AMI-DEMO-FULL-SKU-001 | B-MVP-1 | 5 | supply_platform_order | SP-MVP-1783038772440 |

## 5. 缺口与下一步

- 当前平台采购履约链路已具备闭环证据。

说明：

- 本脚本只读，不会创建映射、采购单、发货单、批次、库存流水或结算单。
- 当前库存流水兼容识别 `sourceType=supply_platform_order` 和计划中的 `sourceType=procurement_order`；仓内既有供应链方案和页面以 `supply_platform_order` 为主。
