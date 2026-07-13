# 供应链平台 MVP flow dry-run 报告

生成时间：2026-07-02T17:48:46.383Z

模式：dry-run

## 1. 汇总

| 检查项 | 状态 |
| --- | --- |
| dryRun | true |
| applyAllowed | false |
| blockers | 0 |
| verification.complete | false |

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
| 闭环完成 | 未通过 |
| 采购单 | 缺失 |
| 入库流水 | 0 |
| 结算单 | 缺失 |

## 7. 写入审计与回滚线索

暂无。

说明：dry-run 和 verify 不写入数据库；真实执行必须使用 `supply-platform:mvp-flow` 对应的 `--apply --yes` 脚本命令。
