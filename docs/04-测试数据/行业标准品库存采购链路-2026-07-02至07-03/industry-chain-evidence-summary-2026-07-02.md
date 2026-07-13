# 行业标准品到库存采购 BOM 销售链路收口证据汇总

生成时间：2026-07-02T16:12:15.016Z

close-loop 报告模式：dry-run

交付状态：未完成

验收门店：Ami 全量演示门店（ID 6）

## 1. 报告读取状态

| 报告 | 状态 | 路径 |
| --- | --- | --- |
| close-loop dry-run | 已读取 | D:\AI coding\beauty-salon-admin\docs\04-测试数据\industry-chain-close-loop-dry-run-2026-07-02.json |
| apply readiness | 已读取 | D:\AI coding\beauty-salon-admin\docs\04-测试数据\industry-chain-apply-readiness-2026-07-02.json |
| sample gate | 已读取 | D:\AI coding\beauty-salon-admin\docs\04-测试数据\industry-chain-sample-gate-2026-07-02.json |
| completion gate | 已读取 | D:\AI coding\beauty-salon-admin\docs\04-测试数据\industry-chain-completion-gate-2026-07-02.json |
| baseline | 已读取 | D:\AI coding\beauty-salon-admin\docs\04-测试数据\industry-sku-chain-baseline-2026-07-02.json |
| unit audit | 已读取 | D:\AI coding\beauty-salon-admin\docs\04-测试数据\product-unit-consistency-audit-2026-07-02.json |
| fulfillment readiness | 已读取 | D:\AI coding\beauty-salon-admin\docs\04-测试数据\supply-platform-fulfillment-readiness-2026-07-02.json |

## 2. 交付判定

| 序号 | 检查项 | 结果 | 证据 | 下一步 |
| --- | --- | --- | --- | --- |
| 1 | 执行计划就绪 | 通过 | executionReady=true | 先运行 industry-chain:close-loop dry-run，确保所有只读/预览步骤通过。 |
| 2 | 真实业务闸门完成 | 未通过 | businessComplete=false | 授权执行 close-loop apply 后复验。 |
| 3 | readiness guard 通过 | 通过 | guard=true；brokenAdoptions=1；bomUnitRepairs=1 | 若 guard 失败，先缩小影响面或调整 guard 上限。 |
| 4 | 样本级闸门完成 | 未通过 | complete=false；pass=1；fail=9 | 授权 apply 后要求 10 个样本节点全部通过。 |
| 5 | 完成度闸门完成 | 未通过 | complete=false；pass=3；fail=5 | 授权 apply 后要求 10 条完成标准全部通过。 |
| 6 | 没有脚本/连接失败 | 通过 | 1:none, 2:none, 3:none, 4:none, 5:none, 6:none, 7:none, 8:none, 9:none | 若出现 db_timeout，先恢复数据库连接后重跑；若 script_error，先修脚本或数据。 |

## 3. 当前阻断项

- 失效采用记录 1 条，样本 ID：22
- 供应链映射为 0，采购建议不能平台化。
- 有可用报价的供应链映射为 0。
- 补货来源平台采购单为 0。
- 供应商发货单为 0。
- 已收货平台采购单为 0。
- 平台采购入库库存流水为 0。
- 供应商结算单为 0。
- BOM 单位异常 1 条。
- 采用记录无失效指向：采用记录 10 条；失效 1 条；样本 22
- BOM 单位已按规格单位修复：门店 BOM 单位异常 1 条；样本 353:支->ml
- 样本供应商/SKU/报价可采购：supplier=-；supplySku=-；activeQuote=-
- 样本商品有首选供应链映射：mapping=-；product=82；supplySku=-
- 样本平台采购单与明细匹配：order=- / -；orderItem=-
- 样本发货与收货完成：orderStatus=-；shipmentItems=0；receivedQty=0
- 样本入库批次与库存流水可追溯：purchase_inbound=0 条；入库数量=0；批次=-
- 样本低库存路由可复验：currentStock=128；safetyStock=45；低库存样本=true
- 样本供应商结算可追溯：settlement=-；settleMonth=-；status=-

## 4. 授权后验收命令

```powershell
npm.cmd --prefix packages/server-v2 run industry-chain:close-loop -- --apply --yes
npm.cmd --prefix packages/server-v2 run industry-chain:evidence-summary -- --mode=apply
```

说明：本汇总只读，不会创建、修复或删除任何业务数据。
