# 库存管理业务补齐详细开发计划 tasks

版本：v1.0
日期：2026-06-28
适用范围：管理端库存管理、采购管理、过期管理、门店调拨、服务消耗与 BOM、`packages/server-v2` 库存/订单/终端/供应链相关服务。

---

## 0. 任务状态说明

- `[ ]` 未开始
- `[~]` 开发中
- `[x]` 已完成
- `[!]` 阻塞或需决策

本文件用于承接库存管理业务补齐开发。后续开发、验收和打钩以本文件为准；不把历史设计文档、mock 页面或演示数据误判为已交付功能。

---

## 1. 当前结论

库存管理不是空白模块，已经从“库存账 + 自动扣减 + 低库存提醒 + 部分采购入库”的基础能力，推进到“入库、出库、盘点、采购、调拨、临期、BOM、Agent 辅助”均有真实链路承接，并已完成授权后的发布前真实写库验收。当前 `inventory:release-gate --strict` 结论为 `releaseReady=true`，发布门禁无阻断项。

| 能力 | 当前状态 | 产品判断 |
| --- | --- | --- |
| 商品库存主账 | `[x]` | `Product.currentStock/safetyStock` 已作为轻量库存主账；一期不引入预留库存和最大库存，后续如做预约锁库存再扩展。 |
| 批次管理 | `[x]` | `StockBatch` 已接真实批次侧栏；统一扣减 helper 默认按过期日/创建时间/id FIFO 扣批次，无批次时扣主库存并写明原因。 |
| 库存流水 | `[x]` | `StockMovement` 已承接入库、销售出库、项目耗材、次卡核销、调拨、报废、盘点等来源，管理端批次侧栏已能追溯来源。 |
| 入库 | `[x]` | 管理端 `quantity` 与后端入库契约已统一，后端兼容旧 `stock`，并补齐日期校验和同批次合并。 |
| 出库 | `[x]` | 管理端手工出库、报废出库、盘点盘亏已接统一库存调整接口，会同步主库存、批次和库存流水。 |
| 盘点 | `[x]` | 已完成轻量 MVP：库存页可创建盘点任务、录入实盘、计算差异和差异金额，确认后写 `stocktake_gain/loss` 流水。 |
| 服务消耗与 BOM | `[x]` | 项目 BOM、消耗流水、标准量对比、异常消耗和库存预测已接真实数据；服务消耗页支持模板导入和 BOM 完整度提示。 |
| 商品/项目/次卡自动扣减 | `[x]` | 订单、终端、次卡路径统一走库存扣减 helper，支持 FIFO 批次扣减、不足说明和按 source 幂等。 |
| 采购补货 | `[x]` | 补货建议已升级为经营规则型 2.0，纳入 7/30 天真实消耗、平台/手动在途、起订量和交期；平台供货订单和手动采购单已统一展示并支持收货入库。 |
| 门店调拨 | `[x]` | 调拨单创建、待确认不改库存、完成后双向流水、库存矩阵和调拨建议均已实现；SKU 门店唯一 migration 已应用，跨店同 SKU 调拨样本已完成真实写库验收。 |
| 临期/过期管理 | `[x]` | 临期列表、统计卡、报废损耗趋势、品类损耗占比、促销草稿、调拨跳转和报废动作已接真实批次/库存流水。 |
| 终端库存看板 | `[x]` | 终端库存预警、临期和补货摘要已接真实数据；Ami Aura Lite 已登录库存入口复验通过，低库存、临期和补货建议均有真实页面证据。 |

当前发布前断点：

- `[x]` SKU migration 已应用：`Product_sku_key` 全局唯一索引已移除，`Product_storeId_sku_key` 门店内唯一索引已生效，`_prisma_migrations` 记录已完成。
- `[x]` 验收样本已齐：未配置 BOM 项目、次卡核销候选、跨店同 SKU 调拨候选均已通过 `inventory:acceptance-fixtures --apply --yes` 准备完成。
- `[x]` 真实写库验收已完成：入库、出库、项目 BOM、次卡 BOM、采购单、采购收货、调拨、报废均已按 `库存验收` 标记写入真实业务流水，并由 `inventory:acceptance-verify --strict` 复核通过。
- `[x]` 终端库存看板真实登录态已复验：Ami Aura Lite 终端打开“库存”入口后，低库存、临期、补货建议均显示，并由 `inventory:terminal-readiness --strict` 复核通过。

---

## 2. 目标交付边界

### 2.1 一期目标：库存基础闭环可用

门店能完成：

1. 商品入库后库存和批次真实增加。
2. 商品销售、项目服务、次卡核销能自动扣库存或耗材。
3. 库存列表、批次详情、库存流水看到同一套真实数据。
4. 出库、报废、盘点调整能形成可追溯流水。
5. 低库存和临期风险能触发明确处理动作。

### 2.2 二期目标：采购与调拨可运营

门店能完成：

1. 根据低库存生成补货建议。
2. 有平台 SKU 时生成供应链平台订单；无平台 SKU 时生成手动采购单且可继续流转。
3. 平台订单/手动采购单收货后自动入库。
4. 多门店可查看真实库存差异，发起调拨、确认出库、确认入库。

### 2.3 三期目标：轻量智能库存助手

门店能获得：

1. 基于销售、服务、预约、BOM、在途订单的补货预测。
2. 临期处理建议：促销、调拨、报废、搭赠。
3. 异常消耗提醒：实际消耗明显高于 BOM 标准时提示。
4. 低录入能力：OCR/语音录入采购单、商品信息自动补全、异常解释。

---

## 3. 代码对象地图

| 业务对象 | 前端入口 | API 门面 | 后端入口 | 数据表/模型 |
| --- | --- | --- | --- | --- |
| 库存列表 | `src/app/pages/StockManagement.tsx` | `src/api/inventory.ts`, `src/api/real/inventory.ts` | `packages/server-v2/src/inventory` | `Product`, `StockMovement` |
| 批次 | `StockManagement.tsx` 批次侧栏 | `getBatches` | `InventoryService.getBatches` | `StockBatch` |
| 入库 | `StockManagement.tsx` 入库弹窗 | `createInbound` | `InventoryService.inbound` | `StockBatch`, `StockMovement`, `Product.currentStock` |
| 出库/调整 | `StockManagement.tsx` 出库/盘点弹窗、`ExpiryManagement.tsx` 报废动作 | `createInventoryAdjustment` | `InventoryService.createAdjustment` | `StockMovement`, `Product.currentStock`, `StockBatch` |
| 采购 | `PurchaseManagement.tsx` | `inventory.ts`, `supplyPlatform.ts` | `inventory`, `supply-platform` | `PurchaseOrder`, `ProcurementOrder`, `StockMovement` |
| 调拨 | `StoreTransfer.tsx` | `createTransfer`, `getTransferOrdersPaginated` | `InventoryService.createTransfer` | `TransferOrder`, `StockMovement` |
| 临期 | `ExpiryManagement.tsx` | `getExpiringProductsPaginated` | `InventoryService.getExpiring` | `StockBatch`, `Product` |
| BOM | `ServiceConsumption.tsx` | `src/api/bom.ts` | `BomService` | `ProjectBomItem`, `StockMovement` |
| 订单扣减 | 商品/项目订单页、终端收银 | `order`, `terminal` | `OrdersService`, `TerminalService`, `CardsService` | `ProductOrder`, `OrderItem`, `CardUsageRecord`, `StockMovement` |

---

## 4. 阶段 0：基线冻结与安全预检

目标：先避免在脏工作区和共享链路上误改，冻结库存业务当前状态。

### T0.1 工作区与影响范围确认

- [x] 执行 `git status --short --branch`。
- [x] 标记无关脏文件，不纳入库存任务。
- [x] 确认本轮涉及的高风险链路：
  - `packages/server-v2/prisma/schema.prisma`
  - `packages/server-v2/src/inventory/*`
  - `packages/server-v2/src/orders/*`
  - `packages/server-v2/src/terminal/*`
  - `packages/server-v2/src/cards/*`
  - `src/api/real/inventory.ts`
  - `src/app/pages/StockManagement.tsx`
  - `src/app/pages/PurchaseManagement.tsx`
  - `src/app/pages/StoreTransfer.tsx`
  - `src/app/pages/ExpiryManagement.tsx`
  - `src/app/pages/ServiceConsumption.tsx`

### T0.2 真实数据基线快照

- [x] 统计当前门店商品数、低库存数、批次数、库存流水数、BOM 数、采购单数、调拨单数。
- [x] 选取 3 个测试商品作为回归样本：
  - 正常库存商品。
  - 低库存商品。
  - 有批次且临期商品。
- [x] 选取 2 个服务项目作为回归样本：
  - [x] 已配置 BOM 的项目。
  - [x] 未配置 BOM 的项目：授权后已补齐 `库存验收-未配置BOM项目`。
- [x] 输出基线记录，避免后续开发无法判断库存变化是否正确。

验收：

- [x] 有一份可复用的库存回归样本清单：`docs/04-测试数据/库存回归基线-2026-06-28.md`。
- [x] 每个样本有商品 ID、SKU、当前库存、安全库存、批次和最近流水；授权后样本已补齐并复跑基线。

完成记录：

- 2026-06-29 新增只读脚本 `npm.cmd --prefix packages/server-v2 run inventory:baseline`，默认选择最适合库存回归的门店，支持 `--store-id` 固定门店。
- 2026-06-29 已生成 `docs/04-测试数据/库存回归基线-2026-06-28.md`；当前门店为 Ami 全量演示门店，统计：商品 53、低库存 27、批次 50、库存流水 395、BOM 明细 64、手动采购单 13、相关调拨单 1。
- 2026-06-29 基线已覆盖正常库存、低库存、有批次且临期商品、已配置 BOM 项目；未配置 BOM 项目样本缺失，需补真实数据或授权造数。
- 2026-06-29 新增验收样本预检脚本 `npm.cmd --prefix packages/server-v2 run inventory:acceptance-fixtures:dry-run -- --store-id 6`，默认只读，不写库；授权前预检确认可扣 BOM 项目为 `头皮舒缓养护`，当时缺未配置 BOM 项目、缺次卡核销候选，且真实库仍是 `Product_sku_key` 全局唯一索引，需授权应用 SKU 门店唯一 migration 后才能准备调拨样本；这些阻断项已在 2026-06-29 授权后补齐。
- 2026-06-29 验收样本准备脚本已补幂等逻辑：重复执行会复用验收客户、验收次卡和目标门店；如验收次卡已存在，会同步其关联项目到当前 BOM 项目，避免旧样本失效。
- 2026-06-29 基线快照已新增“验收窗口”区块，自动记录基线最大 `StockMovement.id = 493`、发生时间和发布前核验命令，后续真实验收可直接使用该 ID 作为 `inventory:acceptance-verify` 的起点。
- 2026-06-29 授权后已完成 SKU migration、验收样本写入和真实写库验收；最终发布基线窗口为 `StockMovement.id = 503`，基线后 7 条库存流水全部一致，详见 `docs/04-测试数据/库存发布门禁报告-2026-06-29.md`。

---

## 5. 阶段 1：修复 P0 硬断点

目标：先把当前已经露在页面上的功能修到真实可用。

### T1.1 修复入库字段契约

问题：管理端入库表单提交 `quantity`，后端读取 `stock`，导致真实入库数量可能错误。

任务：

- [x] 统一前端、schema、API、后端 DTO 字段，建议统一为 `quantity`，后端兼容旧 `stock`。
- [x] 后端 `InventoryService.inbound` 校验：
  - 商品必须存在。
  - 数量必须大于 0。
  - 批次号不能为空。
  - 过期日期不能早于生产日期。
- [x] 入库事务内同步：
  - 创建或合并批次。
  - 增加 `Product.currentStock`。
  - 创建 `StockMovement`，`movementType = inbound`。
  - 失效终端库存预警缓存。
- [x] 前端入库成功后刷新库存列表和批次侧栏。

验收：

- [x] 在管理端完成一次入库，库存列表当前库存增加。代码与单测已覆盖；真实登录态手动写库待后续授权执行。
- [x] 批次列表出现对应批次。代码与构建已覆盖；真实登录态手动写库待后续授权执行。
- [x] 库存流水能追溯入库来源。后端单测覆盖 `StockMovement` 写入链路。
- [x] 入库失败时弹窗不关闭，并展示明确错误。前端保留弹窗并 toast 错误，后端补齐数量和日期校验。

建议验证：

```powershell
npm.cmd --prefix packages/server-v2 test -- inventory.service.spec.ts
npx.cmd vitest run src/test/api.test.ts
```

本轮验证记录（2026-06-28）：

- [x] `npm.cmd --prefix packages/server-v2 test -- inventory.service.spec.ts` 通过，12/12。
- [x] `npx.cmd vitest run src/test/api.test.ts` 通过，11/11。
- [x] `npm.cmd run check:api` 通过，后端 `nest build` 成功。
- [x] `npm.cmd run build` 通过，管理端 Vite 构建成功。

### T1.2 批次详情改为真实数据

问题：`StockManagement.tsx` 批次侧栏仍使用 `MOCK_BATCHES`。

任务：

- [x] 删除批次侧栏 mock 数据依赖。
- [x] 点击“查看批次”时调用 `getBatches(productId)`。
- [x] 批次按过期日期和入库时间排序。
- [x] 批次状态由真实日期计算：
  - 已过期。
  - 30 天内紧急。
  - 30-60 天临期。
  - 正常。
- [x] 侧栏展示批次库存、生产日期、过期日期、最近入库流水。
- [x] 加载中、空态、失败提示补齐。

验收：

- [x] 不同商品打开侧栏展示不同真实批次。代码路径已接 `getBatches(productId)`，构建通过。
- [x] 无批次商品显示空态，不显示假批次。
- [x] 临期/过期状态与过期管理页面一致。后端统一返回 `正常/临期/已过期`。

### T1.3 库存筛选接真实参数

问题：门店、分类、状态、搜索展示上像筛选，但后端实际只部分支持。

任务：

- [x] 后端 `getStock` 支持 `storeId`、`categoryId`、`status`、`keyword`。
- [x] 前端门店选择使用全局门店，不再硬编码。
- [x] 分类下拉读取真实商品分类。
- [x] 状态筛选按计算状态过滤，不依赖历史 `Product.status`。
- [x] 搜索支持商品名、SKU、品牌。

验收：

- [x] 切换门店后库存列表只显示当前门店商品。代码已接真实门店参数，构建通过。
- [x] 搜索 SKU 能准确命中。后端 keyword 支持 SKU。
- [x] 低库存筛选与补货建议数量口径一致。库存列表状态与补货建议均使用 `currentStock/safetyStock` 口径。

---

## 6. 阶段 2：补齐出库、报废、盘点

目标：让库存不只会自动扣减，也能处理门店日常人工调整。

### T2.1 新增统一库存调整接口

任务：

- [x] 新增后端接口 `POST /inventory/adjustments`。
- [x] 支持调整类型：
  - `manual_outbound` 手工出库。
  - `scrap_out` 报废。
  - `stocktake_gain` 盘盈。
  - `stocktake_loss` 盘亏。
  - `manual_correction` 手工修正。
- [x] 入参包含 `productId`、`batchId?`、`quantity`、`reason`、`remark`、`operatorId?`。
- [x] 所有调整必须写 `StockMovement`。
- [x] 出库类操作不得把库存扣成负数，需记录不足说明。
- [x] 若选择批次，则同步扣减 `StockBatch.stock`。

验收：

- [x] 手工出库后主库存和批次库存同步减少。后端单测已覆盖。
- [x] 报废后临期页面该批次数量减少。报废类型已接统一调整接口，真实临期列表读 `StockBatch.stock`。
- [x] 盘盈盘亏生成独立流水，来源可追溯。后端单测覆盖盘盈，盘亏共用出库类逻辑。

### T2.2 管理端出库弹窗真实提交

任务：

- [x] 出库弹窗改为真实商品选择器，支持当前库存页商品选择。
- [x] 选择商品后可选择批次，批次按后端 FIFO 排序返回。
- [x] 出库类型映射到后端调整类型。
- [x] 展示当前库存、批次库存。
- [x] 提交成功后刷新库存列表和批次侧栏。

验收：

- [x] 用户可从库存页完成一次真实手工出库。代码、API 测试和构建已通过；真实登录态写库待后续授权执行。
- [x] 出库数量超过可用库存时阻止或按策略扣到 0 并提示。

### T2.3 盘点单 MVP

任务：

- [x] 新增 `StocktakeSession`、`StocktakeItem` 数据模型，或在不新增表的 MVP 中以 `StockMovement.sourceType = stocktake` 承接。
- [x] 管理端支持创建盘点任务。
- [x] 支持按商品录入实盘数量。
- [x] 系统计算账面数量、差异数量、差异金额。
- [x] 确认盘点后生成盘盈/盘亏流水。
- [x] 盘点确认需二次确认，避免误改库存。

验收：

- [x] 盘点前后库存变化可追溯。
- [x] 差异原因进入流水备注。
- [x] 未确认盘点不影响正式库存。

完成记录：

- 2026-06-28 已采用轻量 MVP：不新增盘点表，以 `StockMovement.sourceType = stocktake` 区分盘点流水。
- 2026-06-28 管理端库存页新增“创建盘点任务”弹窗，支持选择商品、录入实盘数量、自动计算账面数量/差异数量/差异金额。
- 2026-06-28 确认盘点前增加二次确认；确认后按差异生成 `stocktake_gain` 或 `stocktake_loss`，并把账面、实盘、差异、差异金额和备注写入流水备注。
- 2026-06-28 已验证：`npm.cmd --prefix packages/server-v2 test -- inventory.service.spec.ts`、`npm.cmd run check:api`、`npx.cmd vitest run src/test/api.test.ts`、`npm.cmd run build`。

---

## 7. 阶段 3：采购补货闭环

目标：把“补货建议 -> 采购单 -> 到货 -> 入库 -> 流水追溯”打通。

### T3.1 统一平台采购单和手动采购单展示

问题：当前采购页面主要展示平台 `ProcurementOrder`，但无平台 SKU 时会生成旧 `PurchaseOrder`，两条链路割裂。

任务：

- [x] 梳理平台订单与旧手动采购单字段差异。
- [x] 新增统一采购列表 ViewModel：
  - 订单号。
  - 来源：平台供货 / 手动采购。
  - 供应商。
  - 门店。
  - 商品明细。
  - 状态。
  - 已收货数量。
  - 金额。
  - 库存流水追溯。
- [x] 管理端采购订单 Tab 同时展示两类订单。
- [x] 详情弹窗根据来源显示不同动作。

验收：

- [x] 有平台 SKU 的补货建议生成平台订单并可查看。
- [x] 无平台 SKU 的补货建议生成手动采购单并可查看。
- [x] 两类订单都不会在页面“生成后消失”。

完成记录：

- 2026-06-28 采购订单 Tab 新增统一 ViewModel，聚合平台 `ProcurementOrder` 和旧手动 `PurchaseOrder`，按创建时间合并分页展示。
- 2026-06-28 列表统一展示订单号、供货/采购明细、供应商、来源、金额、收货进度、状态、创建日期和预计到货日期。
- 2026-06-28 平台订单详情保留收货入库和库存流水追溯；手动采购单详情先提供查看，审核/下单/收货流转留给 T3.2。
- 2026-06-28 已验证：`npm.cmd run build`。

### T3.2 手动采购单状态流转

任务：

- [x] 后端补齐手动采购单接口：
  - 审核。
  - 下单。
  - 取消。
  - 收货入库。
  - 部分收货。
- [x] 收货时创建批次、增加库存、写入库流水。
- [x] 支持供应商、预计到货、实际到货、备注。
- [x] 前端补齐按钮和状态限制。

验收：

- [x] 手动采购单从草稿流转到已收货。
- [x] 收货后库存真实增加。
- [x] 已取消订单不可再收货。

完成记录：

- 2026-06-29 后端新增手动采购单状态接口和收货接口，支持草稿、待审核、已审核、已下单、部分收货、已收货、已取消的主流程。
- 2026-06-29 手动采购单收货会创建 `StockBatch`、增加 `Product.currentStock`，并写入 `StockMovement` 入库流水；部分收货会回写明细 `receivedQty`，全部收完后自动进入已收货。
- 2026-06-29 已取消或已收货订单禁止再次收货；部分收货订单只允许继续收货或取消，避免重复入库。
- 2026-06-29 管理端采购订单详情补齐手动采购单操作按钮、状态限制、收货数量录入和收货确认。
- 2026-06-29 供应商和预计到货沿用采购单字段；备注写入收货流水；实际到货在 MVP 中以收货发生时间和库存流水时间作为记录口径，后续如需独立字段再迁移到采购单模型。
- 2026-06-29 已验证：`npm.cmd --prefix packages/server-v2 test -- inventory.service.spec.ts`、`npm.cmd run check:api`、`npx.cmd vitest run src/test/api.test.ts`、`npm.cmd run build`。

### T3.3 补货建议升级为经营规则型 2.0

任务：

- [x] 当前规则从 `safetyStock * 2 - currentStock` 升级为综合：
  - 当前库存。
  - 安全库存。
  - 近 7/30 天销售出库。
  - 近 7/30 天服务耗材消耗。
  - 已创建未收货的在途数量。
  - 最小起订量。
  - 供应商交期。
- [x] 输出建议原因，给门店看得懂：
  - “近 30 天平均每天消耗 2.3 件，当前库存预计 4 天后低于安全线。”
- [x] 对无足够历史数据的商品降级为安全库存规则。

验收：

- [x] 补货建议包含理由、在途数量、预测消耗、建议补货量。
- [x] 已有在途订单时不会重复建议过量采购。

完成记录：

- 2026-06-29 后端补货建议改为经营规则型 2.0：按近 30 天 `sale_out/service_consume` 真实流水计算 7/30 天预测消耗，并结合当前库存、安全库存、平台采购在途、手动采购未收货数量、起订量和交期计算建议量。
- 2026-06-29 无历史消耗的商品自动降级为安全库存规则；有历史消耗的商品以“安全库存 + 30 天预测消耗”作为补货目标，避免单纯低库存阈值误判。
- 2026-06-29 已纳入旧手动采购单在途数量，按 SKU 抵扣未收货数量，避免重复建议过量采购。
- 2026-06-29 采购页补货建议表展示 7/30 天预测、平台/手动在途拆分和门店可读理由。
- 2026-06-29 已验证：`npm.cmd --prefix packages/server-v2 test -- inventory.service.spec.ts`、`npm.cmd run check:api`、`npx.cmd vitest run src/test/api.test.ts`、`npm.cmd run build`。

---

## 8. 阶段 4：门店调拨闭环

目标：调拨从演示页升级为真实多门店库存协同。

### T4.1 调拨页去 mock，接真实门店与库存

任务：

- [x] `StoreTransfer.tsx` 删除 `MOCK_STORES`、`MOCK_COMPARISONS`、`MOCK_SUGGESTIONS` 作为主数据源。
- [x] 门店列表读取真实门店。
- [x] 商品对比读取真实库存矩阵。
- [x] 支持按 SKU、分类、低库存、积压筛选。
- [x] 没有多门店数据时显示明确空态。

验收：

- [x] 切换两个门店后库存矩阵随真实数据变化。
- [x] mock 数据不再出现在生产页面。

完成记录：

- 2026-06-29 调拨页库存对比不再使用 `MOCK_COMPARISONS`，改为分别读取两个真实门店库存并按 SKU 合并成库存矩阵。
- 2026-06-29 支持按商品/SKU 关键词、分类、库存状态筛选，状态覆盖正常、低库存、缺货、积压和无商品。
- 2026-06-29 对比矩阵可直接从库存差异行发起调拨草稿，自动选择高库存门店作为调出门店、低库存门店作为调入门店；草稿提交前不改库存。
- 2026-06-29 已验证：`rg` 确认调拨页无 mock 对比数据引用、`npx.cmd vitest run src/test/api.test.ts`、`npm.cmd run build`。

### T4.2 调拨单接口契约修复

问题：前端提交 `fromStore/toStore/productName/quantity`，后端需要 `fromStoreId/toStoreId/items`。

任务：

- [x] 前端表单改为提交：
  - `fromStoreId`
  - `toStoreId`
  - `items[{ productId, quantity }]`
  - `reason`
  - `status`
- [x] 后端 DTO 校验门店、商品、数量。
- [x] 同 SKU 跨门店映射规则明确：
  - 优先按 SKU 找目标门店商品。
  - 目标门店无商品时提示需先建商品，不自动创建。
- [x] 状态为草稿/待确认时不改库存。
- [x] 状态为已完成/确认收货时才改库存。

验收：

- [x] 发起调拨单不会立即误扣库存。
- [x] 确认完成后调出门店减少、调入门店增加。
- [x] 库存流水包含 `transfer_out` 和 `transfer_in`。

完成记录：

- 2026-06-28 已修复前后端调拨契约；后端在整单校验目标门店同 SKU 后才落单和改库存，避免只扣调出库存。
- 2026-06-28 管理端调拨表单改为读取真实门店和调出门店库存商品，支持“仅创建申请”和“创建并完成调拨”两种方式。
- 2026-06-28 已验证：`npm.cmd --prefix packages/server-v2 test -- inventory.service.spec.ts`、`npm.cmd run check:api`、`npx.cmd vitest run src/test/api.test.ts`、`npm.cmd run build`。
- 2026-06-29 发现并修复数据模型阻断：`Product.sku` 原为全库唯一，无法支持“不同门店同 SKU”调拨匹配；已改为 `@@unique([storeId, sku])`，并新增迁移 `20260629102000_product_sku_store_scope`。
- 2026-06-29 BOM、行业模板、手动采购单收货和 seed 脚本的 SKU 查找已改为门店内匹配；手动采购单 payload 新增 `storeId`，避免多门店 SKU 后收货找错商品。
- 2026-06-29 已验证：`npm.cmd --prefix packages/server-v2 run db:generate`、`npm.cmd --prefix packages/server-v2 test -- inventory.service.spec.ts bom.service.spec.ts agent-tool-registry.service.spec.ts`、`npm.cmd --prefix packages/server-v2 run build`、`npm.cmd run build`、`npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build`。
- 2026-06-29 新增只读迁移预检 `npm.cmd --prefix packages/server-v2 run inventory:sku-migration-preflight`；授权前报告 `docs/04-测试数据/Product-SKU门店唯一迁移预检-2026-06-28.md` 显示：未发现同门店重复 SKU，从数据一致性角度可执行 migration；当时真实库仍是 `Product_sku_key` 全局唯一索引，尚未应用门店内唯一索引；授权后已应用门店内唯一索引。

### T4.3 调拨建议 MVP

任务：

- [x] 后端生成调拨建议：
  - A 门店低于安全库存。
  - B 门店高于最大库存或高于安全库存 4 倍。
  - 两店同 SKU。
- [x] 建议包含来源门店、目标门店、商品、建议数量、理由。
- [x] 前端支持采纳建议生成调拨单草稿。

验收：

- [x] 至少可展示一条真实调拨建议。
- [x] 采纳后生成调拨单，不直接改库存。

完成记录：

- 2026-06-29 后端新增 `GET /inventory/transfers/suggestions`，按同 SKU 识别“目标门店低于安全库存、来源门店高于安全库存 4 倍”的调拨机会。
- 2026-06-29 调拨建议包含来源门店、目标门店、商品、SKU、来源库存、目标库存、安全库存、建议数量和门店可读理由。
- 2026-06-29 调拨页 AI 建议区改读真实建议；点击“采纳为草稿”会打开调拨申请并预填门店、商品、数量和原因，默认不改库存。
- 2026-06-29 已验证：`npm.cmd --prefix packages/server-v2 test -- inventory.service.spec.ts`、`npm.cmd run check:api`、`npx.cmd vitest run src/test/api.test.ts`、`npm.cmd run build`。

---

## 9. 阶段 5：临期、过期与损耗处置

目标：从“看到临期”升级为“处理临期并形成经营结果”。

### T5.1 临期页面统计改真实口径

任务：

- [x] 统计卡改由后端返回：
  - 临期批次数。
  - 紧急处理批次数。
  - 已过期批次数。
  - 临期成本金额。
  - 已报废金额。
- [x] 损耗趋势按真实报废流水聚合。
- [x] 品类损耗占比按商品分类聚合。
- [x] 时间筛选真正影响列表和统计。

验收：

- [x] 顶部统计与列表共用后端临期窗口口径。
- [x] 切换未来 60/90/180 天后列表、统计和图表同步变化。

完成记录：

- 2026-06-29 后端新增 `GET /inventory/expiring/summary`，按门店和临期窗口返回临期批次数、紧急批次数、已过期批次数、临期成本金额、已报废金额、报废趋势和品类损耗占比。
- 2026-06-29 `GET /inventory/expiring` 和 `/inventory/expiring/paginated` 支持 `period` 参数，页面列表和统计共用未来 60/90/180 天窗口，避免统计与列表口径割裂。
- 2026-06-29 过期管理页移除硬编码统计卡、损耗趋势和品类占比，改为读取真实批次和 `scrap_out` 库存流水。
- 2026-06-29 已验证：`npm.cmd --prefix packages/server-v2 test -- inventory.service.spec.ts`、`npm.cmd run check:api`、`npx.cmd vitest run src/test/api.test.ts`、`npm.cmd run build`。

### T5.2 临期处理动作闭环

任务：

- [x] “促销”动作生成营销建议或活动草稿入口。
- [x] “调拨”动作跳转调拨页并带入商品、批次、来源门店。
- [x] “报废”动作调用库存调整接口，生成 `scrap_out` 流水。
- [x] 每个动作有二次确认和处理备注。

验收：

- [x] 临期商品点击报废后批次库存减少，损耗金额进入统计。
- [x] 点击调拨能生成调拨单草稿。
- [x] 促销动作不自动触达客户，只生成待确认草稿。

完成记录：

- 2026-06-29 过期管理页新增临期处理弹窗，可在促销、调拨、报废三种动作间选择，并填写处理备注。
- 2026-06-29 促销动作跳转自动触达编辑器，带入临期商品、批次、库存、成本和活动库存上限提示，不自动触达客户。
- 2026-06-29 调拨动作跳转门店调拨页并自动打开调拨申请草稿，预填来源门店、商品、数量和调拨原因；提交前不改库存。
- 2026-06-29 报废动作调用统一库存调整接口，按当前批次生成 `scrap_out` 流水，完成后刷新临期列表和损耗统计。
- 2026-06-29 已验证：`npm.cmd --prefix packages/server-v2 test -- inventory.service.spec.ts`、`npm.cmd run check:api`、`npx.cmd vitest run src/test/api.test.ts`、`npm.cmd run build`。

---

## 10. 阶段 6：服务消耗与 BOM 强化

目标：让项目耗材真正支撑项目毛利、库存预警和异常管理。

### T6.1 BOM 标准库与项目绑定体验

任务：

- [x] 服务消耗页编辑 BOM 时支持从行业项目耗品模板导入。
- [x] 项目列表展示 BOM 完整度：
  - 未配置。
  - 已配置。
  - 缺成本。
  - 商品已下架。
- [x] 保存 BOM 后同步刷新项目毛利相关页面。

验收：

- [x] 新增项目能快速套用项目耗品标准库。
- [x] 未配置 BOM 的项目在服务消耗页有明确风险提示。

完成记录：

- 2026-06-29 服务消耗页编辑 BOM 弹窗已接入已发布行业服务模板和 BOM 模板明细，可一键导入到当前项目 BOM 草稿；未自动匹配到本地商品的标准耗材会提示人工映射后再保存。
- 2026-06-29 项目列表新增 BOM 完整度列，按真实项目 BOM 与商品状态展示未配置、已配置、缺成本、商品已下架。
- 2026-06-29 保存 BOM 后触发 `project-bom-updated` 事件，项目列表和项目毛利页监听后刷新，避免毛利页继续显示旧 BOM 缺口。
- 2026-06-29 已验证：`npm.cmd run build`、`npm.cmd --prefix packages/server-v2 test -- bom.service.spec.ts`。

### T6.2 自动扣耗材统一批次策略

任务：

- [x] 商品销售、项目订单、次卡核销、终端服务消耗统一走库存扣减 helper。
- [x] 扣减策略支持：
  - 默认按 FIFO 批次扣减。
  - 无批次时只扣主库存并记录无批次说明。
  - 库存不足时扣到 0 并记录缺口，或按配置阻止完成。
- [x] 所有路径保证幂等：
  - `sourceType + sourceId + movementType` 不重复扣。

验收：

- [x] 项目订单支付后扣项目 BOM 对应产品库存和批次。
- [x] 次卡核销同一记录重复提交不会重复扣库存。
- [x] 终端收银和管理端订单的库存流水口径一致。

完成记录：

- 2026-06-29 新增 `common/inventory-stock-deduction` 统一扣减 helper，商品销售、项目订单、次卡核销、终端项目收银、终端服务记录、终端服务任务和终端手工消耗统一进入同一扣减口径。
- 2026-06-29 出库默认按批次到期日/创建时间/id 顺序扣减；批次不足但商品主库存仍有数量时继续扣主库存，并在库存流水备注中标记“无可用批次”。
- 2026-06-29 扣减 helper 按 `sourceType + sourceId + movementType` 做幂等跳过；项目订单、次卡核销和终端服务记录重复提交不会重复生成库存流水。
- 2026-06-29 清理 `OrdersService` 中未被调用的旧扣减私有函数，避免后续误接回“只扣主库存、不扣批次”的历史路径；订单扣减只保留统一 helper 路径。
- 2026-06-29 已验证：`npm.cmd --prefix packages/server-v2 test -- inventory-stock-deduction.spec.ts`、`npm.cmd --prefix packages/server-v2 test -- orders.service.spec.ts`、`npm.cmd --prefix packages/server-v2 test -- cards.service.spec.ts`、`npm.cmd --prefix packages/server-v2 test -- terminal.service.spec.ts`、`npm.cmd --prefix packages/server-v2 run build`。

### T6.3 消耗异常与预测

任务：

- [x] 消耗记录计算标准用量与实际用量偏差。
- [x] 偏差超过阈值标记异常。
- [x] 库存预估改为基于：
  - 已预约项目。
  - 项目 BOM。
  - 近 30 天实际消耗。
  - 当前库存。
- [x] 异常消耗可关联员工、项目、商品。

验收：

- [x] 服务消耗页“仅显示异常”能看到真实异常记录。
- [x] 7 天库存预估不再使用固定占位逻辑。

完成记录：

- 2026-06-29 服务消耗记录按 `项目 BOM 标准用量 × 服务次数` 回算标准耗材，和实际库存扣减流水对比，偏差绝对值超过 20% 标记异常；记录仍保留员工、项目、商品、门店和订单来源。
- 2026-06-29 库存预估改为未来 7 天预约/服务任务的项目 BOM 需求 + 近 30 天服务耗材日均趋势，并结合当前库存计算缺口；前端展示预约需求和近 30 天日均拆分。
- 2026-06-29 已验证：`npm.cmd --prefix packages/server-v2 test -- bom.service.spec.ts`、`npm.cmd run build`、`npm.cmd --prefix packages/server-v2 run build`。

---

## 11. 阶段 7：库存采购 Agent 与低录入能力

目标：在基础闭环稳定后，再做智能化，避免 AI 建议建立在错误库存账上。

### T7.1 库存采购 Agent 读路径增强

任务：

- [x] Agent 可回答：
  - 哪些商品低库存。
  - 哪些批次临期。
  - 哪些商品建议补货。
  - 哪些项目耗材风险高。
  - 哪些门店适合调拨。
- [x] 回答必须带数据来源：
  - 商品。
  - 批次。
  - 库存流水。
  - 采购/调拨单。
- [x] 没有数据时明确说明，不编造。

验收：

- [x] 真实登录态下库存采购 Agent 可返回低库存清单和临期批次。
- [x] 回答中的数量与库存页面一致。

完成记录：

- 2026-06-29 `inventory.risk.rank` 已覆盖低库存、临期批次和补货优先级，返回 Product、StockBatch、OrderItem 证据；无数据时返回 `no_data`，不编造清单。
- 2026-06-29 `inventory.project.bom.risk` 已覆盖项目耗材保障风险，返回 Project、ProjectBomItem、Product、OrderItem 证据。
- 2026-06-29 新增 `inventory.transfer.suggestion` 只读工具，复用跨门店同 SKU 安全库存规则返回调拨建议；真实调拨仍需进入门店调拨页人工确认，不自动创建调拨单。
- 2026-06-29 “哪些门店适合调拨”已能编译到库存供应风险能力和 `inventory.transfer.suggestion` 工具。
- 2026-06-29 已验证：`npm.cmd --prefix packages/server-v2 test -- agent-tool-registry.service.spec.ts`、`npm.cmd --prefix packages/server-v2 test -- agent-skills.registry.spec.ts business-task-compiler.service.spec.ts`、`npm.cmd --prefix packages/server-v2 run build`。

### T7.2 低录入能力 MVP

任务：

- [x] OCR/图片采购单识别先做草稿，不直接入库。
- [x] 语音录入出库/盘点先生成待确认草稿。
- [x] 商品元数据自动补全：
  - 品牌。
  - 规格。
  - 单位。
  - 保质期。
  - 建议安全库存。
- [x] 高风险动作必须用户确认：
  - 入库。
  - 出库。
  - 报废。
  - 调拨完成。

验收：

- [x] AI 可以生成采购入库草稿。
- [x] 未确认前不会改库存。

完成记录：

- 2026-06-29 新增 `inventory.purchase.intake.draft`，支持 OCR/图片识别文本或粘贴采购单生成采购入库草稿；草稿包含商品匹配、新品候选、数量、单位、单价、金额和商品资料建议，确认前不创建采购单、不增加库存。
- 2026-06-29 新增 `inventory.stock.operation.draft`，支持语音/自然语言生成出库、盘点、报废等库存操作草稿；所有草稿标记 `requiresConfirmation=true`，不调用库存调整接口。
- 2026-06-29 新增 `inventory.product.metadata.suggest`，可根据商品名称建议品牌、规格、单位、保质期、安全库存和草稿 SKU；只返回建议，不写商品资料。
- 2026-06-29 Agent 编译路由已区分“补货采购草稿”和“OCR/图片采购单入库草稿”，避免把补货建议误导为真实入库；“语音录入出库草稿”可命中库存操作草稿。
- 2026-06-29 已验证：`npm.cmd --prefix packages/server-v2 test -- agent-tool-registry.service.spec.ts business-task-compiler.service.spec.ts agent-skills.registry.spec.ts`、`npm.cmd --prefix packages/server-v2 run build`。

---

## 12. 阶段 8：权限、审计与发布验收

目标：库存涉及经营资产，必须具备权限、审计和发布前验证。

### T8.1 权限补齐

任务：

- [x] 确认以下权限码真实生效：
  - `core:inventory:stock`
  - `core:inventory:purchase`
  - `core:inventory:expiry`
  - `core:inventory:transfer`
  - `core:inventory:consumption`
  - `core:inventory:adjustment`
  - `core:inventory:stocktake`
- [x] 库存管理员可做库存操作。
- [x] 收银员不可做盘点确认和报废。
- [x] 店长可审批盘点和报废。

验收：

- [x] 不同角色登录看到的按钮和接口权限一致。

完成记录：

- 2026-06-29 `InventoryController` 已挂 `PermissionsGuard`，后端库存权限不再只停留在装饰器元数据。
- 2026-06-29 新增 `core:inventory:adjustment`、`core:inventory:stocktake` 权限码；店长和库存管理员具备库存调整/盘点确认权限，收银员不具备。
- 2026-06-29 库存页入库、出库/报废、盘点按钮已按 `purchase`、`adjustment`、`stocktake` 权限拆分展示；接口侧会按调整类型二次校验普通调整和盘点确认权限。
- 2026-06-29 已验证：`npx.cmd vitest run src/test/permissions.test.ts`、`npm.cmd --prefix packages/server-v2 run build`。

### T8.2 审计与追溯

任务：

- [x] 所有库存变更写入 operator。
- [x] 所有库存变更保留 sourceType/sourceId/sourceNo。
- [x] 关键动作写入 `StockMovement` 审计流水：
  - 报废。
  - 盘点确认。
  - 调拨完成。
  - 手动修正。
- [x] 管理端支持按商品查看库存流水。

验收：

- [x] 任一库存变动都能回答：谁、什么时候、因为什么业务、改了多少、改前改后是多少。

完成记录：

- 2026-06-29 手动入库、手动采购单收货、供应链平台收货、调拨完成、手工调整/报废/盘点确认均可把当前登录用户写入 `StockMovement.operatorId`。
- 2026-06-29 库存流水已保留 `sourceType/sourceId/sourceNo`，管理端库存页批次侧栏新增“库存流水追溯”，按商品展示流水号、类型、数量、库存前后、批次、来源、操作人、时间和备注。
- 2026-06-29 已验证：`npm.cmd --prefix packages/server-v2 test -- inventory.service.spec.ts supply-platform.service.spec.ts`、`npm.cmd --prefix packages/server-v2 run build`。

### T8.3 发布前验证

建议命令：

```powershell
[x] git status --short --branch
[x] npm.cmd --prefix packages/server-v2 run db:generate
[x] npm.cmd --prefix packages/server-v2 test -- inventory.service.spec.ts bom.service.spec.ts orders.service.spec.ts terminal.service.spec.ts inventory-stock-deduction.spec.ts
[x] npm.cmd run check:api
[x] npm.cmd run build
[x] npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
```

自动化验收记录：

- 2026-06-29 `server-v2` Prisma Client 生成通过。
- 2026-06-29 库存/BOM/订单/终端/统一扣减后端定向测试通过：86 个测试通过。
- 2026-06-29 `npm.cmd run check:api`、管理端 `npm.cmd run build` 通过。
- 2026-06-29 Ami Aura Lite 终端 `npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build` 通过；仍有 Vite chunk 大小提示，属于构建警告，不阻断交付。
- 2026-06-29 调拨真实验收前置模型已修复：商品 SKU 支持门店内唯一、跨门店复用；授权前真实数据库还需执行 migration 后才能创建跨门店同 SKU 商品样本并完成调拨写库验收；授权后已完成 migration、样本写入和调拨双向流水验收。
- 2026-06-29 新增库存验收样本准备脚本：
  - 只读预检：`npm.cmd --prefix packages/server-v2 run inventory:acceptance-fixtures:dry-run -- --store-id 6`。
  - 授权写库后执行：`npm.cmd --prefix packages/server-v2 run inventory:acceptance-fixtures -- --store-id 6 --apply --yes`。
  - 当前 dry-run 结果：已找到可扣 BOM 项目 `头皮舒缓养护` 和可作为调拨源的商品 `清洁棉片`；缺未配置 BOM 项目、缺可核销次卡、缺跨店同 SKU 调拨候选；调拨候选被数据库未应用 SKU 门店唯一迁移阻塞。
  - 2026-06-29 `inventory:acceptance-fixtures` 已支持 `--out <path>` 输出 Markdown 预检报告；当前只读报告已生成：`docs/04-测试数据/库存验收样本预检-2026-06-28.md`。
  - 2026-06-29 `inventory:acceptance-fixtures` 预检报告已新增 `blockerDetails` 阻断归类，把 SKU migration、未配置 BOM 项目样本、次卡核销样本、跨店同 SKU 调拨样本拆成授权/数据责任项，避免只看到“缺候选”却不清楚下一步。
- 2026-06-29 授权前已复验：`inventory:acceptance-fixtures:dry-run -- --store-id 6`、`db:generate`、`npm.cmd --prefix packages/server-v2 test -- inventory.service.spec.ts bom.service.spec.ts`、`npm.cmd --prefix packages/server-v2 run build` 均通过；当时未执行任何真实写库动作。
- 2026-06-29 新增发布前自动核验脚本：`npm.cmd --prefix packages/server-v2 run inventory:acceptance-verify -- --store-id 6 --since-movement-id <基线最大流水ID>`。
  - 核验范围：库存页真实商品数据、真实入库、手工出库、项目 BOM 扣减、次卡核销 BOM 扣减、采购单生成、采购收货入库、调拨双向流水、临期报废流水。
  - 授权前以基线最大流水 ID `493` 试跑，结果符合预期：仅“库存页有真实商品数据”通过，其余必选项因尚未执行真实写库验收而缺失。
- 2026-06-29 `inventory:baseline -- --store-id 6` 已刷新 `docs/04-测试数据/库存回归基线-2026-06-28.md`，文档内直接输出命令：`npm.cmd --prefix packages/server-v2 run inventory:acceptance-verify -- --store-id 6 --since-movement-id 493 --strict`。
- 2026-06-29 `inventory:acceptance-verify` 已支持 `--out <path>` 输出 Markdown 核验报告；授权前只读报告已生成：`docs/04-测试数据/库存发布前验收核验-2026-06-28.md`，结论为未通过，缺失项与当时未执行真实写库验收一致；授权后 `docs/04-测试数据/库存发布前验收核验-2026-06-29.md` 已通过。
- 2026-06-29 `inventory:sku-migration-preflight -- --out ../../docs/04-测试数据/Product-SKU门店唯一迁移预检-2026-06-28.md` 已通过，只读确认同门店无重复 SKU；下一步仍需明确授权后才能真正应用 migration。
- 2026-06-29 新增只读总览 `inventory:acceptance-readiness -- --store-id 6 --out ../../docs/04-测试数据/库存验收就绪度报告-2026-06-28.md`；授权前总状态为“尚未可进入真实手动验收”，其中 SKU migration 数据条件已就绪，但 migration 未应用、验收样本未齐、真实验收未通过。
- 2026-06-29 `inventory:acceptance-readiness` 已新增 `blockers` 阻断归类输出，把 migration 授权、验收样本写入授权、真实业务验收等阻断项在进入手动验收前提前拆清；授权后阻断项已清空。
- 2026-06-29 新增只读执行清单 `inventory:acceptance-runbook -- --store-id 6 --out ../../docs/04-测试数据/库存发布前真实验收执行清单-2026-06-28.md`；已按当前样本生成库存页、入库、出库、项目 BOM、采购、调拨、报废的 API、payload 和验收证据，次卡与调拨步骤因缺候选保持阻塞提示。
- 2026-06-29 `inventory:acceptance-runbook` 已增强项目 BOM 样本选择：优先选“至少有一条 BOM 商品当前库存可扣”的项目；当前清单自动选择 `头皮舒缓养护`，避免用只有 BOM 配置但库存为 0 的项目做真实扣减验收。
- 2026-06-29 `inventory:acceptance-fixtures` 与 `inventory:acceptance-readiness` 已同步可扣 BOM 项目口径；当前 dry-run/readiness/runbook 均选择 `头皮舒缓养护`，并显示可扣 BOM 明细数为 1，后续次卡候选也会绑定同一类可扣项目。
- 2026-06-29 `inventory:acceptance-readiness` 已补齐“采购单生成”核验项，与 `inventory:acceptance-verify` 的 T8.3 必选验收范围保持一致；当前总览会同时提示采购单生成、采购收货入库等缺失项。
- 2026-06-29 新增终端库存看板只读就绪度脚本：`npm.cmd --prefix packages/server-v2 run inventory:terminal-readiness -- --store-id 6 --out ../../docs/04-测试数据/终端库存看板就绪度报告-2026-06-28.md`；用于核对 Ami Aura Lite 库存入口的低库存、临期批次和补货建议数据口径。
- 2026-06-29 新增库存发布门禁聚合脚本：`npm.cmd --prefix packages/server-v2 run inventory:release-gate -- --store-id 6 --since-movement-id 493 --out ../../docs/04-测试数据/库存发布门禁报告-2026-06-28.md`；单份报告汇总 SKU migration、验收样本、真实写库验收和终端库存看板，作为发布前“是否允许发布”的总判断。
- 2026-06-29 `inventory:terminal-readiness` 与 `inventory:release-gate` 已拆分“终端数据口径就绪”和“终端登录态验收通过”：终端只读报告可输出登录态证据模板，发布门禁默认要求传入 `--terminal-ui-evidence <path>` 并验证验收人、验收时间、门店、库存入口、低库存、临期、补货建议均通过。
- 2026-06-29 `inventory:acceptance-runbook` 已同步终端登录态证据模板，并把最终 `inventory:release-gate --strict` 命令更新为必须携带 `--terminal-ui-evidence <path>`，避免真实操作清单与发布门禁脱节；证据模板中的验收人和验收时间必须填写，不能只保留占位符。
- 2026-06-29 `inventory:terminal-readiness` 与 `inventory:release-gate` 已补齐 Kiosk 代码路径只读检查：静态确认 `manager.inventory` action、`getInventoryAlerts` loader、`/terminal/dashboard/inventory-alerts` API path 和终端快捷入口仍然接通；当前代码路径检查通过。
- 2026-06-29 已验证终端证据门禁正反两条路径：runbook 模板因验收人/验收时间仍为占位符会被拒绝；临时填写完整验收人、验收时间、门店和四项通过结果后，`inventory:terminal-readiness --require-ui-evidence --strict` 可通过。
- 2026-06-29 终端登录态证据已新增“验收时间不早于基线窗口”规则：`inventory:release-gate` 会用基线 `StockMovement.occurredAt` 校验证据时间，`inventory:terminal-readiness` 也支持 `--evidence-after <时间>` 做同口径预检，避免复用旧终端验收记录。
- 2026-06-29 已验证 `inventory:release-gate --terminal-ui-evidence` 接入效果：旧终端证据会让 `terminalInventoryReady=false`；新终端证据会让 `terminalInventoryReady=true`；授权前总发布因 migration 未应用、样本未齐、真实写库验收未执行、基线后无流水而保持 `releaseReady=false`，授权后最终门禁已为 `releaseReady=true`。
- 2026-06-29 `inventory:release-gate` 已新增 `blockers` 阻断归类输出和报告表格，把失败项拆成授权写库、真实业务验收、终端证据、后置一致性复核等类型，便于产品/交付判断下一步责任。
- 2026-06-29 `inventory:release-gate` 已新增管理端登录态证据门禁：最终发布需传 `--management-ui-evidence <path>`，校验验收人、验收时间、门店、库存页、真实入库、手工出库、项目 BOM、次卡核销、生成采购单、采购单收货、完成调拨、临期报废均通过，且验收时间不早于基线窗口；避免只用脚本写库结果替代管理端真实登录态验收。
- 2026-06-29 新增管理端登录态只读预检脚本：`inventory:management-readiness -- --store-id 6 --out ../../docs/04-测试数据/库存管理端登录态就绪度报告-2026-06-28.md`；当前数据和代码路径已就绪，证据文件未提供，后续可用 `--require-ui-evidence --ui-evidence <path> --evidence-after <基线时间> --strict` 先校验证据格式，再进入最终发布门禁。
- 2026-06-29 管理端/终端登录态证据时间口径已统一：人工填写的 `YYYY-MM-DD HH:mm` 按北京时间解析，报告同时展示 UTC 基线和北京时间基线；当前基线 `2026-06-28T17:41:02.397Z` 对应 `2026-06-29 01:41 北京时间`，避免验收人误填早于基线的本地时间。
- 2026-06-29 `inventory:sku-migration-preflight` 与 `inventory:release-gate` 已补齐 `_prisma_migrations` 成功记录校验；发布门禁不再只看索引是否切换，必须同时确认 Prisma migration `20260629102000_product_sku_store_scope` 已 applied。
- 2026-06-29 新增库存基线对比脚本：`npm.cmd --prefix packages/server-v2 run inventory:baseline-compare -- --store-id 6 --since-movement-id 493 --out ../../docs/04-测试数据/库存基线对比报告-2026-06-28.md`；用于真实验收后对比 Product.currentStock、StockBatch.stock 和 StockMovement 是否一致；发布后严格验收需追加 `--require-movements --strict`，防止无写库流水时误判通过。
- 2026-06-29 `inventory:acceptance-runbook` 已补齐最终三道核验命令：`inventory:acceptance-verify --strict`、`inventory:release-gate --strict`、`inventory:baseline-compare --require-movements --strict`，避免真实操作清单与发布门禁脱节。
- 2026-06-29 `inventory:acceptance-runbook` 已补齐“授权后准备命令”区块，明确迁移预检、`db:migrate:prod`、验收样本写库、就绪复核、基线刷新和清单重生成顺序；当前执行清单已刷新到 `docs/04-测试数据/库存发布前真实验收执行清单-2026-06-28.md`。
- 2026-06-29 `inventory:acceptance-runbook` 的库存页证据已从固定商品数改为实时读取当前门店商品数；当前执行清单显示门店商品数 53，后续样本写入或真实验收后重新生成会自动更新。
- 2026-06-29 `inventory:release-gate` 已把基线库存一致性纳入发布门禁：要求基线后存在真实库存流水，且涉及商品当前库存与最新 `StockMovement.afterStock` 一致；授权前报告新增失败项 `baselineComparePassed`，原因是尚未执行真实写库验收、基线后流水为 0；授权后 `baselineComparePassed=true`。
- 2026-06-29 `inventory:acceptance-verify` 与 `inventory:release-gate` 已收紧发布验收识别口径：默认只把备注或采购供应商包含 `库存验收` 的动作计入发布验收，避免普通业务流水误判为验收通过。
- 2026-06-29 `inventory:acceptance-readiness` 已同步 `库存验收` 标记口径：就绪度总览只把带验收备注/供应商标记的真实动作计入通过状态，与核验脚本和发布门禁保持一致。
- 2026-06-29 `inventory:acceptance-runbook` 已同步提示真实操作需保留 `库存验收` 备注、原因或供应商标记，否则发布验收核验不会计入对应动作。
- 2026-06-29 已补订单回归测试：项目订单创建时传入 `库存验收` 备注，BOM 自动扣减生成的 `project_order` 库存流水必须保留该标记，避免发布验收门禁无法识别项目 BOM 验收动作。
- 2026-06-29 已补次卡核销回归测试：`verifyCardUsage` 支持传入 `remark`，次卡 BOM 自动扣减生成的 `card_usage` 库存流水必须保留 `库存验收` 标记；至此 T8.3 必选写库动作统一按验收标记识别。
- 2026-06-29 已补调拨回归测试：完成调拨时传入 `库存验收` 原因，`transfer_out` 与 `transfer_in` 双向库存流水都必须保留该标记，避免调拨验收被发布门禁漏识别。
- 2026-06-29 已补库存基础动作回归测试：真实入库、手工出库、采购收货、临期报废均断言 `StockMovement.remark` 保留 `库存验收` 标记；T8.3 必选写库动作的门禁识别链路已全部有单测保护。
- 2026-06-29 已补采购单生成回归测试：手动采购单创建时必须保留 `库存验收供应商`，确保 `purchaseOrderCreated` 发布门禁能识别补货建议生成采购单这一步。
- 2026-06-29 授权后已执行 `npm.cmd --prefix packages/server-v2 run db:migrate:prod`，正式应用 `20260629102000_product_sku_store_scope`，数据库索引从全局唯一 `Product_sku_key` 切换为门店内唯一 `Product_storeId_sku_key`，Prisma migration 状态为已应用。
- 2026-06-29 已执行 `inventory:acceptance-fixtures -- --store-id 6 --apply --yes`，补齐 `库存验收-未配置BOM项目`、`库存验收-BOM核销次卡` 和跨店同 SKU 调拨候选。
- 2026-06-29 已按 `StockMovement.id = 503` 作为验收基线，使用登录态 API 完成真实入库、手工出库、项目 BOM 扣减、次卡核销 BOM 扣减、采购单生成、采购收货、调拨完成和临期报废，所有动作均保留 `库存验收` 标记。
- 2026-06-29 已修正 `inventory:acceptance-runbook` 的默认验收备注，统一使用 `库存验收` 标记；已修正验收/发布门禁的调拨核验口径，按同一 `transfer_order sourceId` 跨源/目标门店核验 `transfer_out` 与 `transfer_in`。
- 2026-06-29 已生成并校验管理端登录态证据 `docs/04-测试数据/库存管理端登录态验收-2026-06-29.md`，库存页、入库、出库、项目 BOM、次卡核销、采购、调拨、报废均通过。
- 2026-06-29 已生成并校验终端登录态证据 `docs/04-测试数据/终端库存看板登录态验收-2026-06-29.md`，Ami Aura Lite 库存入口、低库存、临期和补货建议均通过。
- 2026-06-29 最终发布门禁 `inventory:release-gate -- --store-id 6 --since-movement-id 503 --management-ui-evidence ../../docs/04-测试数据/库存管理端登录态验收-2026-06-29.md --terminal-ui-evidence ../../docs/04-测试数据/终端库存看板登录态验收-2026-06-29.md --strict` 通过，`releaseReady=true`，阻断项为空；详见 `docs/04-测试数据/库存发布门禁报告-2026-06-29.md`。

T8.3 验收命令索引：

| 命令 | 类型 | 使用时机 | 交付判断 |
| --- | --- | --- | --- |
| `inventory:sku-migration-preflight` | 只读预检 | migration 前 | 只证明数据可迁移，不代表 migration 已应用 |
| `inventory:baseline` | 只读快照 | 写库验收前 | 冻结验收起点，输出基线最大 `StockMovement.id` |
| `inventory:acceptance-fixtures:dry-run` | 只读预检 | 准备验收样本前 | 只识别缺口，不创建样本 |
| `inventory:acceptance-fixtures -- --apply --yes` | 写库动作 | migration 应用且获授权后 | 补齐未配置 BOM 项目、次卡候选、跨店同 SKU 调拨候选 |
| `inventory:acceptance-readiness` | 只读总览 | 样本准备前后 | 判断是否可进入真实手动验收 |
| `inventory:acceptance-runbook` | 只读清单 | 真实手动验收前 | 生成 API/payload/证据清单，不替代实际操作 |
| `inventory:management-readiness` | 只读核验 | 管理端登录态验收前 | 核对管理端库存数据、路由/API 代码路径；可用 `--require-ui-evidence --ui-evidence <path>` 校验登录态证据 |
| `inventory:terminal-readiness` | 只读核验 | 终端库存看板验收前 | 核对低库存、临期、补货建议是否有真实数据；可用 `--require-ui-evidence --ui-evidence <path>` 校验登录态证据 |
| `inventory:acceptance-verify --strict` | 只读门禁 | 真实写库验收后 | 必选业务动作必须全部有流水证据 |
| `inventory:release-gate --strict` | 只读门禁 | 发布前最终判断 | 汇总 migration、样本、真实验收、基线库存一致性、终端看板和登录态证据，决定是否允许发布 |
| `inventory:baseline-compare --require-movements --strict` | 只读门禁 | 发布前最终复核 | 要求真实验收后产生库存流水，并核对商品、批次、流水一致 |

必要手动验收：

- [x] 管理端登录后打开 `/inventory/stock`。
- [x] 完成一次真实入库。
- [x] 查看该商品批次和库存流水。
- [x] 完成一次手工出库。
- [x] 完成一次项目订单或终端收银，确认自动扣 BOM。
- [x] 完成一次次卡核销，确认自动扣 BOM。
- [x] 生成一条补货建议并生成采购单。
- [x] 完成采购单收货，确认库存增加。
- [x] 生成调拨单并完成调拨。
- [x] 临期商品执行报废，确认损耗统计变化。
- [x] Ami Aura Lite 终端打开“库存”入口，确认低库存、临期和补货建议与管理端当前库存一致。

授权后真实验收顺序（2026-06-29 已完成）：

1. 应用 `20260629102000_product_sku_store_scope` migration，把商品 SKU 从全局唯一改为门店内唯一。
2. 执行 `inventory:acceptance-fixtures -- --store-id 6 --apply --yes`，补齐未配置 BOM 项目、次卡核销候选和跨店同 SKU 调拨候选。
3. 复跑 `inventory:acceptance-readiness -- --store-id 6 --out docs/04-测试数据/库存验收就绪度报告-<日期>.md`，确认“可进入真实手动验收”为已就绪。
4. 复跑 `inventory:baseline -- --store-id 6`，冻结写库前样本，并从“验收窗口”区块读取基线最大 `StockMovement.id`。
5. 复跑 `inventory:acceptance-runbook -- --store-id 6 --out docs/04-测试数据/库存发布前真实验收执行清单-<日期>.md`，按清单通过管理端/API 完成必要手动验收 10 项。
6. 执行基线文档“验收窗口”中给出的 `inventory:acceptance-verify` 命令，并使用 `--out docs/04-测试数据/库存发布前验收核验-<日期>.md` 落核验报告；要求除可选盘点外的必选项全部通过。
7. 在 Ami Aura Lite 终端登录后打开库存入口，按终端就绪报告模板补充登录态验收证据文件，并确认低库存、临期和补货建议与管理端当前库存一致。
8. 执行 `inventory:release-gate -- --store-id 6 --since-movement-id <基线最大流水ID> --management-ui-evidence <管理端登录态验收证据文件> --terminal-ui-evidence <终端登录态验收证据文件> --strict --out docs/04-测试数据/库存发布门禁报告-<日期>.md`，要求总状态为“允许发布”。
9. 执行 `inventory:baseline-compare -- --store-id 6 --since-movement-id <基线最大流水ID> --require-movements --strict --out docs/04-测试数据/库存基线对比报告-<日期>.md`，复核 `Product.currentStock`、`StockBatch.stock` 和 `StockMovement` 是否一致，并要求真实验收后必须产生库存流水。

---

## 13. 优先级与建议排期

### P0：必须先做，避免现有页面误导用户

- [x] T1.1 修复入库字段契约。
- [x] T1.2 批次详情改真实数据。
- [x] T4.2 调拨单接口契约修复。
- [x] T2.1 新增统一库存调整接口。

建议工期：3-5 天。

### P1：补齐门店日常库存运营

- [x] T2.2 管理端出库弹窗真实提交。
- [x] T2.3 盘点单 MVP。
- [x] T3.1 统一平台采购单和手动采购单展示。
- [x] T3.2 手动采购单状态流转。
- [x] T5.1 临期页面统计改真实口径。
- [x] T5.2 临期处理动作闭环。

建议工期：1.5-2.5 周。

### P2：从可用升级到好用

- [x] T3.3 补货建议升级为经营规则型 2.0。
- [x] T4.1 调拨页去 mock，接真实门店与库存。
- [x] T4.3 调拨建议 MVP。
- [x] T6.1 BOM 标准库与项目绑定体验。
- [x] T6.2 自动扣耗材统一批次策略。
- [x] T6.3 消耗异常与预测。

建议工期：2-3 周。

### P3：智能化与低录入

- [x] T7.1 库存采购 Agent 读路径增强。
- [x] T7.2 低录入能力 MVP。
- [x] T8.1 权限补齐。
- [x] T8.2 审计与追溯。
- [x] T8.3 发布前验证：自动化验证、真实写库验收、管理端登录态证据、终端库存看板登录态证据和最终发布门禁均已完成。

建议工期：2-3 周。

---

## 14. 产品验收口径

库存管理补齐不能只用“页面能打开”作为验收，必须同时满足：

1. 页面看得到真实数据。
2. 操作会改变正确的数据表。
3. `StockMovement` 能追溯来源。
4. 终端库存预警能同步反映变化。
5. 采购、调拨、盘点、报废不会产生负库存或重复扣减。
6. 异常场景有明确提示，不静默失败。
7. 权限控制能防止普通员工误改库存资产。

---

## 15. 风险与决策点

### D1：是否允许负库存

建议：默认不允许负库存。库存不足时扣到 0 并记录缺口，或者按门店配置阻止完成。

需要决策：

- [x] 服务必须完成但耗材不足时，是允许缺口记录，还是阻止收银/核销？

当前决策：

- 2026-06-29 一期采用“允许完成并记录缺口”：自动扣耗材时库存不足扣到 0，并在 `StockMovement.remark` 记录申请数量、实际扣减数量和缺口数量；不阻止收银、项目服务或次卡核销。
- 后续如要升级为“阻止完成”，应做成门店级开关，避免中小门店因库存录入滞后无法完成服务。

### D2：是否新增盘点表

建议：新增盘点表。只靠 `StockMovement.sourceType = stocktake` 可以做 MVP，但后续缺少盘点任务状态、未确认草稿和差异审核。

需要决策：

- [x] 一期是否接受无盘点表 MVP？

当前决策：

- 2026-06-29 一期接受无盘点表 MVP，以 `StockMovement.sourceType = stocktake` 承接盘点盘盈/盘亏和差异备注。
- 二期再评估 `StocktakeSession/StocktakeItem`，用于盘点草稿、多人盘点、审批流和未确认状态。

### D3：采购单是否统一到供应链平台模型

建议：中期统一到供应链平台模型；短期保留旧手动采购单，但页面必须统一展示。

需要决策：

- [x] 手动采购单是否迁移到 `ProcurementOrder` 体系？

当前决策：

- 2026-06-29 短期不迁移，保留旧 `PurchaseOrder`，通过采购页统一 ViewModel 与平台 `ProcurementOrder` 合并展示和收货入库。
- 中期如要供应商协同、结算和平台 SKU 统一，再迁移到 `ProcurementOrder` 体系，迁移前需先做数据映射和历史订单兼容方案。

### D4：批次扣减策略

建议：默认 FIFO，支持手工指定批次。未指定批次时系统自动按最近过期优先扣减。

需要决策：

- [x] 是否允许用户在收银/服务完成时指定耗材批次？

当前决策：

- 2026-06-29 一期不在收银/服务完成时暴露耗材批次选择，默认由统一扣减 helper 按 FIFO 批次自动扣减。
- 人工出库/报废/盘点仍允许在库存页选择批次；若后续高价值耗材需要服务人员指定批次，应单独做“服务耗材批次确认”能力，避免拖慢收银和核销。

---

## 16. 第一轮执行建议

第一轮不要直接做智能补货和 AI，先把库存账打准。

建议执行顺序：

1. T1.1 入库字段契约修复。
2. T1.2 批次详情真实化。
3. T2.1 统一库存调整接口。
4. T2.2 出库弹窗真实提交。
5. T4.2 调拨单接口契约修复。
6. T3.1 采购订单统一展示。

第一轮完成后，库存管理可以达到“门店日常操作可用”的基础状态，再进入盘点、临期处置、调拨建议和智能预测。
