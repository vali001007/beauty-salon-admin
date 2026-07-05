# 行业标准品到库存采购 BOM 销售链路 apply readiness 报告

生成时间：2026-07-03T00:32:46.244Z

验收门店：Ami 全量演示门店（ID 6）

写库授权状态：未授权，本报告只读。

strict guard：通过

## 1. 预计影响面

| 对象 | 数量/状态 |
| --- | --- |
| 失效采用记录待修复 | 1 |
| BOM 单位待修复 | 1 |
| 供应链样本产品 | 玻尿酸保湿精华 / 82 |
| 预计库存增加 | 5 |
| 预计低库存安全线 | 143 |

## 2. Strict Guard

| 检查项 | 值 |
| --- | --- |
| strict | true |
| pass | true |
| maxBrokenAdoptions | 1 |
| maxBomUnitRepairs | 1 |
| maxStockIncrement | 20 |

暂无失败项。

## 3. 采用记录修复清单

| 采用ID | 模板ID | 旧本地产品ID | 动作 |
| --- | --- | --- | --- |
| 22 | 22 | 136 | clear localProductId and mark payload.chainStatus=invalid |

## 4. BOM 单位修复清单

| BOM项ID | 项目 | 产品 | SKU | 当前单位 | 目标单位 | 动作 |
| --- | --- | --- | --- | --- | --- | --- |
| 353 | 亮肤淡斑管理 | 日间防晒乳 | IND-6-STD-RETAIL-SUNSCREEN-001 | 支 | ml | update ProjectBomItem.unit to Product.specUnit |

## 5. 供应链履约样本影响

| 项目 | 值 |
| --- | --- |
| 产品 | 玻尿酸保湿精华 / AMI-DEMO-FULL-SKU-001 |
| 当前库存 | 128 |
| 预计入库 | 5 |
| 预计入库后库存 | 133 |
| 库存流水单位 | ml |
| 已有供应商 | - |
| 已有供应 SKU | - |
| 已有报价 | - |
| 已有映射 | - |
| 已有采购单 | - |
| 已有入库流水 | 0 |
| 已有结算单 | - |

## 6. 授权后命令顺序

1. `npm.cmd --prefix packages/server-v2 run industry-chain:baseline -- --store-id=6`
2. `npm.cmd --prefix packages/server-v2 run product-unit:audit -- --store-id=6`
3. `npm.cmd --prefix packages/server-v2 run industry-chain:repair -- --strategy=mark-invalid --store-id=6 --apply --yes`
4. `npm.cmd --prefix packages/server-v2 run product-unit:repair -- --store-id=6 --apply --yes`
5. `npm.cmd --prefix packages/server-v2 run supply-platform:mvp-flow -- --storeId=6`
6. `npm.cmd --prefix packages/server-v2 run supply-platform:fulfillment-readiness -- --store-id=6`
7. `npm.cmd --prefix packages/server-v2 run supply-platform:mvp-flow:verify -- --storeId=6`
8. `npm.cmd --prefix packages/server-v2 run industry-chain:sample-gate:strict -- --store-id=6`
9. `npm.cmd --prefix packages/server-v2 run industry-chain:completion-gate:strict -- --store-id=6`

说明：本报告只读，不会创建、修复或删除任何业务数据。
