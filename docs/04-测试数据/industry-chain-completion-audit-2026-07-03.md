# 行业标准品到库存采购 BOM 销售链路完成定义审计

业务日期：2026-07-03

生成时间（北京时间）：2026-07-03 15:24:54 Asia/Shanghai

生成时间（UTC）：2026-07-03T07:24:54.931Z

报告模式：dry-run

strict 模式：关闭

验收门店：Ami 全量演示门店（ID 6）

完成定义全部证明：是

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
| closeLoop.businessComplete | true |
| completionGate.complete | true |
| sampleGate.complete | true |
| evidenceSummary.deliverableReady | true |
| proofCounts | {"已证明":10} |

## 3. 完成定义逐条审计

| 序号 | 完成定义 | 证明等级 | 闸门状态 | 证据 | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 1 | 任一已发布标准品能看到是否已采用、采用到哪个本地产品。 | 已证明 | 通过 | 已发布标准品 34 个；有效采用 9 条；失效采用 0 条 | 保持采用巡检纳入回归。 |
| 2 | 任一本地产品能看到来源标准品、BOM 使用情况、库存流水、采购记录、销售/服务消耗。 | 已证明 | 通过 | 有效采用产品 9 个；BOM 产品 30 个；有库存流水产品 37 个；销售商品 21 个；服务扣耗流水 262 条 | 继续保证产品详情链路视图使用同一套真实聚合口径。 |
| 3 | 任一低库存产品能判断是否有供应链映射和可用报价。 | 已证明 | 通过 | 低库存 1 个；有映射 1 个；有可用报价 1 个 | 检查低库存样本的映射/报价状态是否在采购建议页完整展示。 |
| 4 | 有映射和报价的产品能从补货建议直接生成平台采购单。 | 已证明 | 通过 | 有效映射 1 条；首选映射 1 条；有可用报价映射 1 条；补货来源平台采购单 1 张 | 需要先建立真实映射+报价，再从采购建议生成平台采购单或执行授权后的 MVP flow 样本。 |
| 5 | 平台采购单能完成供应商确认、发货、门店收货、库存入库。 | 已证明 | 通过 | 平台/补货采购单 1 张；发货单 1 张；发货明细 1 条；已收货订单 1 张 | 对样本采购单执行供应商确认、发货和门店收货，形成真实履约记录。 |
| 6 | 收货入库能写批次、产品库存和库存流水。 | 已证明 | 通过 | 平台采购入库流水 1 条；关联批次 1 个 | 完成平台采购收货后复验 StockBatch、Product.currentStock、StockMovement 是否同步写入。 |
| 7 | 服务完成能按 BOM 扣库存。 | 已证明 | 通过 | 服务扣耗流水 262 条；BOM 单位异常 0 条 | 保持服务扣耗回归测试覆盖。 |
| 8 | 商品销售能生成销售出库流水。 | 已证明 | 通过 | 商品销售/商品订单来源出库流水 45 条；抽样销售明细 200 条，订单明细未固化单位 200 条，可关联销售出库 45 条，其中按包装单位落库 45 条、按规格单位落库 0 条 | 新增订单写入已固化 packageUnit 到 OrderItem.payload；当前不回填历史订单，继续用巡检跟踪新旧数据差异。 |
| 9 | 链路总览能显示每个阶段的数量和断点。 | 已证明 | 通过 | 标准品 34 个；本地产品 46 个；供应链映射 1 条；平台采购单 1 张；库存流水 453 条 | 运营报表继续按未生成本地 SKU、缺映射、BOM 无库存、低库存分流输出缺口。 |
| 10 | 真实数据库有可复验样例，不只停留在 mock 或单测。 | 已证明 | 通过 | 失效采用 0；有报价映射 1；平台采购单 1；已收货 1；采购入库流水 1；结算 1；BOM 单位异常 0 | 需要授权真实写库：修复采用/BOM 单位，建立映射+报价并完成一条平台采购履约闭环。 |

## 4. 当前阻断项

- 暂无阻断项。

## 5. 复验命令

```powershell
npm.cmd --prefix packages/server-v2 run industry-chain:completion-audit
npm.cmd run check:industry-chain:post-apply
```

说明：本审计只读取既有报告，不访问数据库，不执行写库。
