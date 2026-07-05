# 行业标准品到库存采购 BOM 销售链路授权执行 Runbook

版本日期：2026-07-02

适用范围：门店 `Ami 全量演示门店`（ID 6）

当前状态：待真实写库授权。本 runbook 只描述授权后执行步骤，不代表已执行写库。

## 1. 执行前确认

执行前必须同时满足：

| 检查项 | 当前证据 | 结论 |
| --- | --- | --- |
| close-loop dry-run | `executionReady=true`，`businessComplete=false` | 可进入授权前确认 |
| readiness guard | `pass=true` | 预计影响面未超上限 |
| 失效采用记录 | 1 条，ID 22，旧本地产品 ID 136 | 授权后按 `mark-invalid` 清理 |
| BOM 单位异常 | 1 条，BOM 项 353，`支 -> ml` | 授权后修复为规格单位 |
| 供应链样本商品 | 产品 82，玻尿酸保湿精华，SKU `AMI-DEMO-FULL-SKU-001` | 用作闭环样本 |
| 预计入库 | 当前库存 128，入库 5，入库后 133 | 在 guard 上限 20 内 |
| 低库存样本 | 入库后安全库存设置为 143 | 用于复验补货路由 |
| 样本级闸门 | 10 项中 1 通过、9 未通过 | 未通过项应由授权 apply 补齐 |

不满足任一项时，不应执行真实写库。

## 2. 授权后推荐命令

主命令：

```powershell
npm.cmd --prefix packages/server-v2 run industry-chain:close-loop -- --apply --yes
```

该命令会按编排顺序执行写库和复验。不要拆开手工执行，除非需要排障。

## 3. 实际写库动作

授权 apply 会写入或更新以下对象：

| 顺序 | 动作 | 写库对象 | 预期影响 |
| --- | --- | --- | --- |
| 1 | 修复失效采用 | `IndustryAdoptionRecord` ID 22 | 清空失效 `localProductId`，标记链路状态失效 |
| 2 | 修复 BOM 单位 | `ProjectBomItem` ID 353 | 单位从 `支` 改为 `ml` |
| 3 | 创建/修正供应商 | `SupplySupplier` | 创建或激活 `supply-platform-mvp-flow` 样本供应商 |
| 4 | 创建/修正供应 SKU | `SupplySku` | 绑定样本产品 82 的平台 SKU |
| 5 | 创建/修正报价 | `SupplyQuote` | 设置已审核、有效、可供货报价 |
| 6 | 创建/修正映射 | `SupplyCatalogMapping` | 产品 82 到供应 SKU 的首选映射 |
| 7 | 创建采购履约 | `ProcurementOrder` / `ProcurementOrderItem` | 生成补货/MVP 来源平台采购单 |
| 8 | 创建发货履约 | `SupplierShipment` / `SupplierShipmentItem` | 生成供应商发货和发货明细 |
| 9 | 收货入库 | `StockBatch` / `StockMovement` / `Product.currentStock` | 入库 5，库存 128 -> 133 |
| 10 | 低库存样本 | `Product.safetyStock` | 安全库存调整为 143 |
| 11 | 供应商结算 | `SupplySettlement` | 创建当月结算样本 |

## 4. 成功判定

授权执行后必须同时通过：

```powershell
npm.cmd run check:industry-chain:post-apply
```

该命令只读，会依次执行样本级 strict 闸门、完成度 strict 闸门、apply 模式证据汇总 strict 闸门和完成定义逐条审计 strict 闸门；即使前一项失败，也会继续跑完后续项，最后统一返回非 0，便于一次性查看所有未达标点。

复验会生成归档报告：

- `docs/04-测试数据/industry-chain-post-apply-verify-YYYY-MM-DD.md`
- `docs/04-测试数据/industry-chain-post-apply-verify-YYYY-MM-DD.json`

其中 evidence summary 子步骤会单独输出 post-apply 专用证据，避免覆盖默认 dry-run 证据：

- `docs/04-测试数据/industry-chain-evidence-summary-post-apply-verify-YYYY-MM-DD.md`
- `docs/04-测试数据/industry-chain-evidence-summary-post-apply-verify-YYYY-MM-DD.json`

完成定义逐条审计子步骤会单独输出 post-apply 专用证据，逐条证明计划第 12 节 10 条完成定义：

- `docs/04-测试数据/industry-chain-completion-audit-post-apply-verify-YYYY-MM-DD.md`
- `docs/04-测试数据/industry-chain-completion-audit-post-apply-verify-YYYY-MM-DD.json`

如需拆分排障，可分别执行：

```powershell
npm.cmd --prefix packages/server-v2 run industry-chain:sample-gate:strict -- --store-id=6
npm.cmd --prefix packages/server-v2 run industry-chain:completion-gate:strict -- --store-id=6
npm.cmd --prefix packages/server-v2 run industry-chain:evidence-summary:strict -- --mode=apply
npm.cmd --prefix packages/server-v2 run industry-chain:completion-audit:strict -- --mode=apply --evidence-report=industry-chain-evidence-summary-post-apply-verify
```

最终验收口径：

| 验收项 | 目标 |
| --- | --- |
| close-loop | `executionReady=true` 且 `businessComplete=true` |
| 样本级闸门 | `complete=true`，10 个样本节点全部通过 |
| 完成度闸门 | `complete=true`，10 条完成标准全部通过 |
| 证据汇总 | `deliverableReady=true` |
| 完成定义审计 | `allProven=true`，第 12 节 10 条完成定义均为“已证明” |
| 写入审计 | `supply-platform-mvp-flow` 报告存在 `writeAudit`，能看到创建/更新/复用对象 |
| 业务数据 | 供应链映射、报价、采购单、发货单、入库流水、结算单均能追溯到门店 6 和产品 82 |

## 5. 失败处理

如果命令失败，先看 close-loop 报告中的 `failureType`：

| failureType | 含义 | 处理方式 |
| --- | --- | --- |
| `db_timeout` | 数据库连接或查询超时 | 等待数据库恢复后重跑 close-loop；不要手工补写数据 |
| `script_error` | 脚本逻辑或数据校验失败 | 查看失败步骤 stderr/stdout，先修脚本或数据口径 |
| `missing_script` | 编排脚本映射缺失 | 修复 `industry-chain-close-loop.ts` 脚本映射 |
| `none` | 无失败 | 若业务仍未完成，查看样本级/完成度闸门阻断项 |

## 6. 回滚原则

优先使用 `supply-platform-mvp-flow` apply 报告中的 `writeAudit` 做人工回滚线索。不要直接批量删除。

推荐回滚顺序：

1. 删除或反向调整 `StockMovement`，并同步恢复 `Product.currentStock`。
2. 删除对应 `StockBatch`。
3. 恢复 `SupplierShipmentItem.receivedQty` 和 `ProcurementOrderItem.receivedQty`。
4. 恢复或删除 `SupplierShipment`。
5. 恢复或删除 `ProcurementOrder` / `ProcurementOrderItem`。
6. 恢复 `SupplySettlement`。
7. 恢复 `SupplyCatalogMapping` 首选状态。
8. 恢复 `SupplyQuote` / `SupplySku` / `SupplySupplier` 状态。
9. 恢复 `Product.safetyStock` 和 `Product.currentStock`。
10. 如需撤回单位修复，恢复 `ProjectBomItem.unit`。
11. 如需撤回采用修复，恢复 `IndustryAdoptionRecord.localProductId` 和 payload。

回滚后必须重新执行样本级闸门和完成度闸门，确认系统处于预期状态。

## 7. 当前不执行事项

- 不在未授权状态下执行 `--apply --yes`。
- 不手工绕过 `industry-chain:close-loop` 拆步骤写库。
- 不强行修改历史库存流水单位。
- 不把 dry-run 通过解释为业务完成。
