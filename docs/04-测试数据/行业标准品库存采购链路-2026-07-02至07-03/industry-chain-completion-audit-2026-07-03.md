# 行业标准品到库存采购 BOM 销售链路完成定义审计

业务日期：2026-07-03

生成时间（北京时间）：2026-07-03 01:55:50 Asia/Shanghai

生成时间（UTC）：2026-07-02T17:55:50.677Z

报告模式：dry-run

strict 模式：关闭

验收门店：Ami 全量演示门店（ID 6）

完成定义全部证明：否

## 1. 报告读取状态

| 报告 | 状态 | 路径 |
| --- | --- | --- |
| industry-chain-close-loop-dry-run | 已读取 | D:\AI coding\beauty-salon-admin\docs\04-测试数据\industry-chain-close-loop-dry-run-2026-07-03.json |
| industry-chain-completion-gate | 已读取 | D:\AI coding\beauty-salon-admin\docs\04-测试数据\industry-chain-completion-gate-2026-07-03.json |
| industry-chain-sample-gate | 已读取 | D:\AI coding\beauty-salon-admin\docs\04-测试数据\industry-chain-sample-gate-2026-07-03.json |
| industry-chain-evidence-summary | 已读取 | D:\AI coding\beauty-salon-admin\docs\04-测试数据\industry-chain-evidence-summary-2026-07-03.json |

## 2. 总体状态

| 检查项 | 当前值 |
| --- | --- |
| reportsReady | true |
| closeLoop.executionReady | true |
| closeLoop.businessComplete | false |
| completionGate.complete | false |
| sampleGate.complete | false |
| evidenceSummary.deliverableReady | false |
| proofCounts | {"未完成":5,"已证明":3,"证据不足":2} |

## 3. 完成定义逐条审计

| 序号 | 完成定义 | 证明等级 | 闸门状态 | 证据 | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 1 | 任一已发布标准品能看到是否已采用、采用到哪个本地产品。 | 未完成 | 未通过 | 已发布标准品 34 个；有效采用 9 条；失效采用 1 条 | 先修复或标记失效采用记录，避免来源追溯指向已删除产品。 |
| 2 | 任一本地产品能看到来源标准品、BOM 使用情况、库存流水、采购记录、销售/服务消耗。 | 已证明 | 通过 | 有效采用产品 9 个；BOM 产品 30 个；有库存流水产品 37 个；销售商品 21 个；服务扣耗流水 262 条 | 继续保证产品详情链路视图使用同一套真实聚合口径。 |
| 3 | 任一低库存产品能判断是否有供应链映射和可用报价。 | 证据不足 | 当前无样本 | 当前门店没有触发安全库存阈值的低库存产品，代码路径已具备判断字段，但真实库暂无低库存样本。 | 补一个可控低库存样本复验平台/手工采购分流。 |
| 4 | 有映射和报价的产品能从补货建议直接生成平台采购单。 | 未完成 | 未通过 | 有效映射 0 条；首选映射 0 条；有可用报价映射 0 条；补货来源平台采购单 0 张 | 需要先建立真实映射+报价，再从采购建议生成平台采购单或执行授权后的 MVP flow 样本。 |
| 5 | 平台采购单能完成供应商确认、发货、门店收货、库存入库。 | 未完成 | 未通过 | 平台/补货采购单 0 张；发货单 0 张；发货明细 0 条；已收货订单 0 张 | 对样本采购单执行供应商确认、发货和门店收货，形成真实履约记录。 |
| 6 | 收货入库能写批次、产品库存和库存流水。 | 未完成 | 未通过 | 平台采购入库流水 0 条；关联批次 0 个 | 完成平台采购收货后复验 StockBatch、Product.currentStock、StockMovement 是否同步写入。 |
| 7 | 服务完成能按 BOM 扣库存。 | 证据不足 | 待关注 | 服务扣耗流水 262 条；BOM 单位异常 1 条 | 授权后执行 BOM 单位修复，再复验服务扣耗单位口径。 |
| 8 | 商品销售能生成销售出库流水。 | 已证明 | 通过 | 商品销售/商品订单来源出库流水 45 条；抽样销售明细 200 条，订单明细未固化单位 200 条，可关联销售出库 45 条，其中按包装单位落库 45 条、按规格单位落库 0 条 | 新增订单写入已固化 packageUnit 到 OrderItem.payload；当前不回填历史订单，继续用巡检跟踪新旧数据差异。 |
| 9 | 链路总览能显示每个阶段的数量和断点。 | 已证明 | 通过 | 标准品 34 个；本地产品 46 个；供应链映射 0 条；平台采购单 0 张；库存流水 452 条 | 运营报表继续按未生成本地 SKU、缺映射、BOM 无库存、低库存分流输出缺口。 |
| 10 | 真实数据库有可复验样例，不只停留在 mock 或单测。 | 未完成 | 未通过 | 失效采用 1；有报价映射 0；平台采购单 0；已收货 0；采购入库流水 0；结算 0；BOM 单位异常 1 | 需要授权真实写库：修复采用/BOM 单位，建立映射+报价并完成一条平台采购履约闭环。 |

## 4. 当前阻断项

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

## 5. 复验命令

```powershell
npm.cmd --prefix packages/server-v2 run industry-chain:completion-audit
npm.cmd run check:industry-chain:post-apply
```

说明：本审计只读取既有报告，不访问数据库，不执行写库。
