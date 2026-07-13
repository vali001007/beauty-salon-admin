# 行业标准品到库存采购 BOM 销售链路样本级闸门报告

生成时间：2026-07-03T00:33:22.247Z

验收门店：Ami 全量演示门店（ID 6）

样本标识：supply-platform-mvp-flow

总状态：已完成

## 1. 样本对象

| 对象 | 值 |
| --- | --- |
| 商品 | 玻尿酸保湿精华 / AMI-DEMO-FULL-SKU-001 / 82 |
| 供应商 | 1 |
| 供应 SKU | 1 |
| 有效报价 | 1 |
| 首选映射 | 1 |
| 采购单 | SP-MVP-1783038772440 |
| 采购明细 | 1 |
| 发货明细 | 1 |
| 入库流水 | 553 |
| 结算单 | 1 |

## 2. 样本级闸门

| 序号 | 闸门 | 状态 | 证据 | 下一步 |
| --- | --- | --- | --- | --- |
| 1 | 采用记录无失效指向 | 通过 | 采用记录 9 条；失效 0 条；样本 - | 授权后执行 industry-chain:repair 清理失效 localProductId。 |
| 2 | BOM 单位已按规格单位修复 | 通过 | 门店 BOM 单位异常 0 条；样本 - | 授权后执行 product-unit:repair 修复 BOM 单位。 |
| 3 | 样本商品存在 | 通过 | 玻尿酸保湿精华 / AMI-DEMO-FULL-SKU-001 / ID 82 | 检查门店是否有可用于供应链 MVP 的本地商品。 |
| 4 | 样本供应商/SKU/报价可采购 | 通过 | supplier=1；supplySku=1；activeQuote=1 | 授权后由 supply-platform:mvp-flow 创建或修正供应商、供应 SKU 和有效报价。 |
| 5 | 样本商品有首选供应链映射 | 通过 | mapping=1；product=82；supplySku=1 | 授权后由 supply-platform:mvp-flow 创建或修正首选映射。 |
| 6 | 样本平台采购单与明细匹配 | 通过 | order=SP-MVP-1783038772440 / received；orderItem=1 | 授权后创建补货/MVP 来源采购单，并确保明细匹配样本商品和供应 SKU。 |
| 7 | 样本发货与收货完成 | 通过 | orderStatus=received；shipmentItems=1；receivedQty=5 | 授权后执行供应商发货和门店收货入库。 |
| 8 | 样本入库批次与库存流水可追溯 | 通过 | purchase_inbound=1 条；入库数量=5；批次=B-MVP-1 | 授权后收货写入 StockBatch、Product.currentStock 和 StockMovement。 |
| 9 | 样本低库存路由可复验 | 通过 | currentStock=133；safetyStock=143；低库存样本=true | 授权 apply 后将安全库存调到收货后库存之上，形成低库存路由样本。 |
| 10 | 样本供应商结算可追溯 | 通过 | settlement=1；settleMonth=2026-07；status=generated | 授权后为样本供应商生成当月结算记录。 |

## 3. BOM 异常样本

暂无。

说明：本报告只读，不会创建、修复或删除任何业务数据。
