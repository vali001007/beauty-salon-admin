# 行业标准品到库存采购 BOM 销售链路样本级闸门报告

生成时间：2026-07-02T16:12:06.831Z

验收门店：Ami 全量演示门店（ID 6）

样本标识：supply-platform-mvp-flow

总状态：未完成

## 1. 样本对象

| 对象 | 值 |
| --- | --- |
| 商品 | 玻尿酸保湿精华 / AMI-DEMO-FULL-SKU-001 / 82 |
| 供应商 | - |
| 供应 SKU | - |
| 有效报价 | - |
| 首选映射 | - |
| 采购单 | - |
| 采购明细 | - |
| 发货明细 | - |
| 入库流水 | - |
| 结算单 | - |

## 2. 样本级闸门

| 序号 | 闸门 | 状态 | 证据 | 下一步 |
| --- | --- | --- | --- | --- |
| 1 | 采用记录无失效指向 | 未通过 | 采用记录 10 条；失效 1 条；样本 22 | 授权后执行 industry-chain:repair 清理失效 localProductId。 |
| 2 | BOM 单位已按规格单位修复 | 未通过 | 门店 BOM 单位异常 1 条；样本 353:支->ml | 授权后执行 product-unit:repair 修复 BOM 单位。 |
| 3 | 样本商品存在 | 通过 | 玻尿酸保湿精华 / AMI-DEMO-FULL-SKU-001 / ID 82 | 检查门店是否有可用于供应链 MVP 的本地商品。 |
| 4 | 样本供应商/SKU/报价可采购 | 未通过 | supplier=-；supplySku=-；activeQuote=- | 授权后由 supply-platform:mvp-flow 创建或修正供应商、供应 SKU 和有效报价。 |
| 5 | 样本商品有首选供应链映射 | 未通过 | mapping=-；product=82；supplySku=- | 授权后由 supply-platform:mvp-flow 创建或修正首选映射。 |
| 6 | 样本平台采购单与明细匹配 | 未通过 | order=- / -；orderItem=- | 授权后创建补货/MVP 来源采购单，并确保明细匹配样本商品和供应 SKU。 |
| 7 | 样本发货与收货完成 | 未通过 | orderStatus=-；shipmentItems=0；receivedQty=0 | 授权后执行供应商发货和门店收货入库。 |
| 8 | 样本入库批次与库存流水可追溯 | 未通过 | purchase_inbound=0 条；入库数量=0；批次=- | 授权后收货写入 StockBatch、Product.currentStock 和 StockMovement。 |
| 9 | 样本低库存路由可复验 | 未通过 | currentStock=128；safetyStock=45；低库存样本=true | 授权 apply 后将安全库存调到收货后库存之上，形成低库存路由样本。 |
| 10 | 样本供应商结算可追溯 | 未通过 | settlement=-；settleMonth=-；status=- | 授权后为样本供应商生成当月结算记录。 |

## 3. BOM 异常样本

| BOM项ID | 项目 | 产品 | SKU | 当前单位 | 目标单位 |
| --- | --- | --- | --- | --- | --- |
| 353 | 亮肤淡斑管理 | 日间防晒乳 | IND-6-STD-RETAIL-SUNSCREEN-001 | 支 | ml |

说明：本报告只读，不会创建、修复或删除任何业务数据。
