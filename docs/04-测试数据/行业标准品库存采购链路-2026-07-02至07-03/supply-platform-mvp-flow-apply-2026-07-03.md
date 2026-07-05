# 供应链平台 MVP flow apply 报告

生成时间：2026-07-03T00:32:55.807Z

模式：apply

## 1. 汇总

| 检查项 | 状态 |
| --- | --- |
| dryRun | false |
| applyAllowed | true |
| blockers | 0 |
| verification.complete | true |

## 2. 样本

| 对象 | 值 |
| --- | --- |
| 门店 | Ami 全量演示门店 / 6 |
| 产品 | 玻尿酸保湿精华 / AMI-DEMO-FULL-SKU-001 / 82 |
| 当前库存 | 128 |
| 低库存验收样本 | 启用；当前安全库存 45，预计收货后安全库存 143 |

## 3. Schema

| 表 | 状态 |
| --- | --- |
| SupplySupplier | 已存在 |
| SupplySku | 已存在 |
| SupplyQuote | 已存在 |
| SupplyCatalogMapping | 已存在 |
| ProcurementOrder | 已存在 |
| ProcurementOrderItem | 已存在 |
| SupplierShipment | 已存在 |
| SupplierShipmentItem | 已存在 |
| SupplySettlement | 已存在 |
| StockMovement | 已存在 |

## 4. Blockers

暂无。

## 5. 计划步骤

1. ensure active SupplySupplier
2. ensure approved SupplySku and SupplyQuote
3. ensure SupplyCatalogMapping to Ami_Core Product
4. create or reuse ProcurementOrder
5. supplier accepts order
6. supplier ships order
7. store receives order and writes StockBatch + StockMovement
8. set sample product safetyStock above currentStock for low-stock routing verification
9. generate SupplySettlement

## 6. 验证结果

| 对象 | 状态 |
| --- | --- |
| 闭环完成 | 通过 |
| 采购单 | SP-MVP-1783038772440 / received |
| 入库流水 | 1 |
| 结算单 | 1 / generated |

## 7. 写入审计与回滚线索

| 模型 | 动作 | ID | 摘要 | 回滚线索 |
| --- | --- | --- | --- | --- |
| SupplySupplier | create | 1 | 创建供应链 MVP 验收供应商 | 如需回滚，先删除依赖的结算、发货、采购、报价、SKU、映射后再删除该供应商。 |
| SupplySku | create | 1 | 创建供应链 MVP 验收 SKU | 如需回滚，先删除依赖报价、映射、采购明细后再删除该 SKU。 |
| SupplyQuote | create | 1 | 创建供应链 MVP 验收报价 | 如需回滚，删除依赖采购明细后再删除该报价。 |
| SupplyCatalogMapping | create | 1 | 创建本地产品到供应链 SKU 的首选映射 | 如需回滚，删除该映射并恢复原首选映射。 |
| ProcurementOrder | create | 1 | 创建 MVP 验收平台采购单 SP-MVP-1783038772440 | 如需回滚，先删除入库流水、批次、发货、结算和采购明细后再删除采购单。 |
| ProcurementOrderItem | create | 1 | 创建采购明细 productId=82 quantity=5 | 如需回滚，先删除依赖发货明细和入库记录后再删除采购明细。 |
| ProcurementOrder | update | 1 | 采购单状态 pending_supplier_confirm -> accepted | 如需回滚，恢复采购单 status/acceptedAt。 |
| SupplierShipment | create | 1 | 创建供应商发货单 SHP-MVP-1783038773343 | 如需回滚，先删除发货明细及相关入库记录后再删除发货单。 |
| SupplierShipmentItem | create | 1 | 创建发货明细 supplySkuId=1 shippedQty=5 | 如需回滚，先恢复采购明细/发货明细 receivedQty，再删除该发货明细。 |
| ProcurementOrder | update | 1 | 采购单状态 accepted -> shipped | 如需回滚，恢复采购单 status/shippedAt。 |
| SupplierShipmentItem | reuse | 1 | 复用匹配当前采购明细的发货明细 orderItemId=1 supplySkuId=1 | 复用对象不需要删除。 |
| StockBatch | create | 203 | 创建入库批次 B-MVP-1 stock=5 | 如需回滚，先删除引用该批次的库存流水，再删除批次。 |
| Product | update | 82 | 产品库存 128 -> 133 | 如需回滚，扣回本次入库数量并恢复 currentStock。 |
| StockMovement | create | 553 | 创建平台采购入库流水 SPI-MVP-1783038774368 | 如需回滚，删除该入库流水并同步回滚产品库存/批次库存。 |
| SupplierShipmentItem | update | 1 | 发货明细已收 0 -> 5 | 如需回滚，恢复发货明细 receivedQty。 |
| ProcurementOrderItem | update | 1 | 采购明细已收 0 -> 5 | 如需回滚，恢复采购明细 receivedQty。 |
| ProcurementOrder | update | 1 | 采购单状态 shipped -> received | 如需回滚，恢复采购单 status/receivedAt。 |
| Product | update | 82 | 产品安全库存 45 -> 143 | 如需回滚，恢复产品 safetyStock。 |
| SupplySettlement | create | 1 | 创建供应商 2026-07 月结算单 | 如需回滚，删除该结算单。 |

说明：dry-run 和 verify 不写入数据库；真实执行必须使用 `supply-platform:mvp-flow` 对应的 `--apply --yes` 脚本命令。
