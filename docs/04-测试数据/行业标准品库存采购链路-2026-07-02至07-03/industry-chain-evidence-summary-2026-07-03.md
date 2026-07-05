# 行业标准品到库存采购 BOM 销售链路收口证据汇总

业务日期：2026-07-03

生成时间（北京时间）：2026-07-03 08:33:06 Asia/Shanghai

生成时间（UTC）：2026-07-03T00:33:06.668Z

close-loop 报告模式：apply

strict 模式：关闭

交付状态：可交付

验收门店：Ami 全量演示门店（ID 6）

## 1. 报告读取状态

| 报告 | 状态 | 路径 |
| --- | --- | --- |
| close-loop apply | 已读取 | D:\AI coding\beauty-salon-admin\docs\04-测试数据\industry-chain-close-loop-apply-2026-07-03.json |
| apply readiness | 已读取 | D:\AI coding\beauty-salon-admin\docs\04-测试数据\industry-chain-apply-readiness-2026-07-03.json |
| sample gate | 已读取 | D:\AI coding\beauty-salon-admin\docs\04-测试数据\industry-chain-sample-gate-2026-07-03.json |
| completion gate | 已读取 | D:\AI coding\beauty-salon-admin\docs\04-测试数据\industry-chain-completion-gate-2026-07-03.json |
| baseline | 已读取 | D:\AI coding\beauty-salon-admin\docs\04-测试数据\industry-sku-chain-baseline-2026-07-03.json |
| unit audit | 已读取 | D:\AI coding\beauty-salon-admin\docs\04-测试数据\product-unit-consistency-audit-2026-07-03.json |
| fulfillment readiness | 已读取 | D:\AI coding\beauty-salon-admin\docs\04-测试数据\supply-platform-fulfillment-readiness-2026-07-03.json |

## 2. 交付判定

| 序号 | 检查项 | 结果 | 证据 | 下一步 |
| --- | --- | --- | --- | --- |
| 1 | 执行计划就绪 | 通过 | executionReady=true | 查看 apply 报告中的失败步骤和失败类型。 |
| 2 | 真实业务闸门完成 | 通过 | businessComplete=true | 授权执行 close-loop apply 后复验。 |
| 3 | readiness guard 通过 | 通过 | guard=true；brokenAdoptions=1；bomUnitRepairs=1 | 若 guard 失败，先缩小影响面或调整 guard 上限。 |
| 4 | 样本级闸门完成 | 通过 | complete=true；pass=10；fail=0 | 授权 apply 后要求 10 个样本节点全部通过。 |
| 5 | 完成度闸门完成 | 通过 | complete=true；pass=10；fail=0 | 授权 apply 后要求 10 条完成标准全部通过。 |
| 6 | 没有脚本/连接失败 | 通过 | 1:none, 2:none, 3:none, 4:none, 5:none, 6:none, 7:none, 8:none, 9:none, 10:none | 若出现 db_timeout，先恢复数据库连接后重跑；若 script_error，先修脚本或数据。 |

## 3. 当前阻断项

- 暂无阻断项。

## 4. 真实数据验收摘要

| 指标 | 当前值 | 证据来源 |
| --- | --- | --- |
| 标准品总数 | 34 | baseline.summary.productTemplates |
| 有效采用数 | 9 | baseline.summary.adoptionValidActive |
| 失效采用数 | 1 | baseline.summary.adoptionInvalid |
| 本地产品数 | 46 | baseline.summary.activeProducts |
| 已进入 BOM 的产品数 | 30 | completion.counts.productsInBom |
| 有库存流水的产品数 | 37 | completion.counts.productsWithStockMovements |
| 有供应链映射的产品数 | 1 | completion.counts.activeMappings |
| 有可用报价的产品数 | 1 | completion.counts.mappingsWithQuote |
| 低库存样本数 | 1 | completion.counts.lowStockProducts |
| 低库存样本中有供应链映射数量 | 1 | completion.counts.lowStockWithMapping |
| 低库存样本中有可用报价数量 | 1 | completion.counts.lowStockWithQuote |
| 平台采购单数 | 1 | completion.counts.replenishmentOrders |
| 平台收货入库流水数 | 1 | completion.counts.procurementInboundMovements |

## 5. 业务影响与交付口径

| 范围 | 状态 | 证据 | 交付影响 |
| --- | --- | --- | --- |
| 本地经营基础 | 已具备 | 本地产品 46；进入 BOM 产品 30；有库存流水产品 37 | 门店内部库存、BOM 扣耗和销售出库已有基础证据。 |
| 标准品采用健康 | 待修复 | 有效采用 9；失效采用 1 | 存在失效采用时，标准品到本地 SKU 的关系不能作为完整交付证据。 |
| 平台采购可用性 | 已具备 | 供应链映射 1；可用报价 1 | 映射和有效报价为 0 时，补货建议只能走手工采购兜底，不能自动生成平台采购单。 |
| 履约闭环证据 | 已具备 | 平台采购单 1；平台入库流水 1 | 平台采购单、发货收货、入库流水和结算未形成前，供应链闭环仍不可交付。 |
| 最终交付判定 | 可交付 | deliverableReady=true；businessComplete=true | apply 报告仍未达标时，按阻断项逐条处理后复验。 |

## 6. 授权后验收命令

```powershell
npm.cmd --prefix packages/server-v2 run industry-chain:close-loop -- --apply --yes
npm.cmd --prefix packages/server-v2 run industry-chain:evidence-summary:strict -- --mode=apply
```

说明：本汇总只读，不会创建、修复或删除任何业务数据。
