# 行业标准品到库存采购 BOM 销售链路收口编排报告

业务日期：2026-07-03

生成时间（北京时间）：2026-07-03 15:23:55 Asia/Shanghai

生成时间（UTC）：2026-07-03T07:23:55.445Z

模式：dry-run

applyAllowed：false

执行计划就绪：true

业务闸门完成：true

## 1. 步骤汇总

| 步骤 | 类型 | 结果 | 失败类型 | 尝试 | 退出码 | 命令 |
| --- | --- | --- | --- | --- | --- | --- |
| 收口前链路基线快照 | 只读/预览 | passed | none | 1 | 0 | C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/industry-sku-chain-baseline.ts --store-id=6 |
| 收口前单位一致性巡检 | 只读/预览 | passed | none | 1 | 0 | C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/product-unit-consistency-audit.ts --store-id=6 |
| 真实写库前影响面快照 | 只读/预览 | passed | none | 1 | 0 | C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/industry-chain-apply-readiness.ts --strategy=mark-invalid --store-id=6 --strict |
| 失效采用记录修复预览 | 只读/预览 | passed | none | 1 | 0 | C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/industry-adoption-repair.ts --strategy=mark-invalid --store-id=6 |
| BOM 单位修复预览 | 只读/预览 | passed | none | 1 | 0 | C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/product-unit-repair.ts --store-id=6 |
| 供应链平台采购履约 MVP flow dry-run | 只读/预览 | passed | none | 1 | 0 | C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/supply-platform-mvp-flow.ts --dry-run --storeId=6 |
| 供应链履约就绪度只读验收 | 只读/预览 | passed | none | 1 | 0 | C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/supply-platform-fulfillment-readiness.ts --store-id=6 |
| 样本级闭环闸门 | 只读/预览 | passed | none | 1 | 0 | C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/industry-chain-sample-gate.ts --store-id=6 |
| 行业链路完成度闸门 | 只读/预览 | passed | none | 1 | 0 | C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/industry-chain-completion-gate.ts --store-id=6 |

## 2. 失败步骤

暂无。

## 3. 最终业务闸门

| 检查项 | 值 |
| --- | --- |
| 闸门 JSON | D:\AI coding\beauty-salon-admin\docs\04-测试数据\industry-chain-completion-gate-2026-07-03.json |
| checkedAt | 2026-07-03T07:23:55.317Z |
| complete | true |
| statusCounts | {"pass":10,"fail":0,"warning":0,"not_applicable":0} |

暂无阻断项。

## 4. 授权 apply 命令预览

| 步骤 | 类型 | 命令 |
| --- | --- | --- |
| 收口前链路基线快照 | 只读/预览 | C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/industry-sku-chain-baseline.ts --store-id=6 |
| 收口前单位一致性巡检 | 只读/预览 | C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/product-unit-consistency-audit.ts --store-id=6 |
| 真实写库前影响面快照 | 只读/预览 | C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/industry-chain-apply-readiness.ts --strategy=mark-invalid --store-id=6 --strict |
| 修复失效采用记录 | 写库 | C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/industry-adoption-repair.ts --strategy=mark-invalid --store-id=6 --apply --yes |
| 修复 BOM 单位到规格单位 | 写库 | C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/product-unit-repair.ts --store-id=6 --apply --yes |
| 执行供应链平台采购履约 MVP flow | 写库 | C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/supply-platform-mvp-flow.ts --apply --yes --storeId=6 |
| 供应链履约就绪度复验 | 只读/预览 | C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/supply-platform-fulfillment-readiness.ts --store-id=6 |
| MVP flow verify 复验 | 只读/预览 | C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/supply-platform-mvp-flow.ts --verify --storeId=6 |
| 样本级闭环闸门 | 只读/预览 | C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/industry-chain-sample-gate.ts --store-id=6 --strict |
| 行业链路完成度闸门 | 只读/预览 | C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/industry-chain-completion-gate.ts --store-id=6 --strict |

## 5. 步骤输出摘要

### 1. 收口前链路基线快照

- 结果：passed
- 失败类型：none
- 尝试：1
- 命令：`C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/industry-sku-chain-baseline.ts --store-id=6`

stdout：

```text
◇ injected env (27) from .env // tip: ◈ encrypted .env [www.dotenvx.com]
行业 SKU 链路基线生成完成：D:\AI coding\beauty-salon-admin\docs\04-测试数据\industry-sku-chain-baseline-2026-07-03.md
```

stderr：

```text
(node:18980) [DEP0180] DeprecationWarning: fs.Stats constructor is deprecated.
(Use `node --trace-deprecation ...` to show where the warning was created)
```

### 2. 收口前单位一致性巡检

- 结果：passed
- 失败类型：none
- 尝试：1
- 命令：`C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/product-unit-consistency-audit.ts --store-id=6`

stdout：

```text
◇ injected env (27) from .env // tip: ⌘ suppress logs { quiet: true }
Wrote D:\AI coding\beauty-salon-admin\docs\04-测试数据\product-unit-consistency-audit-2026-07-03.md
Wrote D:\AI coding\beauty-salon-admin\docs\04-测试数据\product-unit-consistency-audit-2026-07-03.json
```

stderr：

```text
(node:31020) [DEP0180] DeprecationWarning: fs.Stats constructor is deprecated.
(Use `node --trace-deprecation ...` to show where the warning was created)
```

### 3. 真实写库前影响面快照

- 结果：passed
- 失败类型：none
- 尝试：1
- 命令：`C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/industry-chain-apply-readiness.ts --strategy=mark-invalid --store-id=6 --strict`

stdout：

```text
◇ injected env (27) from .env // tip: ⌘ enable debugging { debug: true }
Wrote D:\AI coding\beauty-salon-admin\docs\04-测试数据\industry-chain-apply-readiness-2026-07-03.md
Wrote D:\AI coding\beauty-salon-admin\docs\04-测试数据\industry-chain-apply-readiness-2026-07-03.json
readiness brokenAdoptions=0 bomUnitRepairs=0 sampleProduct=82 guard=true
```

stderr：

```text
(node:29884) [DEP0180] DeprecationWarning: fs.Stats constructor is deprecated.
(Use `node --trace-deprecation ...` to show where the warning was created)
```

### 4. 失效采用记录修复预览

- 结果：passed
- 失败类型：none
- 尝试：1
- 命令：`C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/industry-adoption-repair.ts --strategy=mark-invalid --store-id=6`

stdout：

```text
◇ injected env (27) from .env // tip: ⌘ override existing { override: true }
{
  "mode": "dry-run",
  "strategy": "mark-invalid",
  "brokenAdoptions": 0,
  "actions": []
}
```

stderr：

```text
(node:26820) [DEP0180] DeprecationWarning: fs.Stats constructor is deprecated.
(Use `node --trace-deprecation ...` to show where the warning was created)
```

### 5. BOM 单位修复预览

- 结果：passed
- 失败类型：none
- 尝试：1
- 命令：`C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/product-unit-repair.ts --store-id=6`

stdout：

```text
◇ injected env (27) from .env // tip: ⌘ custom filepath { path: '/custom/path/.env' }
Wrote D:\AI coding\beauty-salon-admin\docs\04-测试数据\product-unit-repair-preview-2026-07-03.md
Wrote D:\AI coding\beauty-salon-admin\docs\04-测试数据\product-unit-repair-preview-2026-07-03.json
```

stderr：

```text
(node:30788) [DEP0180] DeprecationWarning: fs.Stats constructor is deprecated.
(Use `node --trace-deprecation ...` to show where the warning was created)
```

### 6. 供应链平台采购履约 MVP flow dry-run

- 结果：passed
- 失败类型：none
- 尝试：1
- 命令：`C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/supply-platform-mvp-flow.ts --dry-run --storeId=6`

stdout：

```text
jected env (27) from .env // tip: ⌘ custom filepath { path: '/custom/path/.env' }
Wrote D:\AI coding\beauty-salon-admin\docs\04-测试数据\supply-platform-mvp-flow-dry-run-2026-07-03.md
Wrote D:\AI coding\beauty-salon-admin\docs\04-测试数据\supply-platform-mvp-flow-dry-run-2026-07-03.json
{
  "mode": "dry-run",
  "dryRun": true,
  "applyAllowed": false,
  "flowKey": "supply-platform-mvp-flow",
  "lowStockSample": {
    "enabled": true,
    "currentStock": 133,
    "currentSafetyStock": 143,
    "targetSafetyStockAfterReceipt": 148
  },
  "store": {
    "id": 6,
    "name": "Ami 全量演示门店"
  },
  "product": {
    "id": 82,
    "name": "玻尿酸保湿精华",
    "sku": "AMI-DEMO-FULL-SKU-001",
    "currentStock": 133
  },
  "readiness": {
    "storeCheckSkipped": false,
    "productCheckSkipped": false,
    "reason": null
  },
  "schema": {
    "SupplySupplier": true,
    "SupplySku": true,
    "SupplyQuote": true,
    "SupplyCatalogMapping": true,
    "ProcurementOrder": true,
    "ProcurementOrderItem": true,
    "SupplierShipment": true,
    "SupplierShipmentItem": true,
    "SupplySettlement": true,
    "StockMovement": true
  },
  "blockers": [],
  "plannedSteps": [
    "ensure active SupplySupplier",
    "ensure approved SupplySku and SupplyQuote",
    "ensure SupplyCatalogMapping to Ami_Core Product",
    "create or reuse ProcurementOrder",
    "supplier accepts order",
    "supplier ships order",
    "store receives order and writes StockBatch + StockMovement",
    "set sample product safetyStock above currentStock for low-stock routing verification",
    "generate SupplySettlement"
  ],
  "verification": {
    "complete": true,
    "order": {
      "id": 1,
      "orderNo": "SP-MVP-1783038772440",
      "storeName": "Ami 全量演示门店",
      "supplierName": "Ami MVP 供应商",
      "status": "received",
      "itemCount": 1,
      "shipmentCount": 1,
      "totalAmount": 60,
      "netAmount": 57
    },
    "stockMovements": [
      {
        "id": 553,
        "movementNo": "SPI-MVP-1783038774368",
        "productName": "玻尿酸保湿精华",
        "batchNo": "B-MVP-1",
        "quantity": 5,
        "sourceType": "supply_platform_order",
        "sourceId": 1,
        "sourceNo": "SP-MVP-1783038772440"
      }
    ],
    "settlement": {
      "id": 1,
      "settleMonth": "2026-07",
      "orderCount": 1,
      "totalAmount": 60,
      "netPayable": 57,
      "status": "generated"
    }
  }
}
```

stderr：

```text
(node:25268) [DEP0180] DeprecationWarning: fs.Stats constructor is deprecated.
(Use `node --trace-deprecation ...` to show where the warning was created)
```

### 7. 供应链履约就绪度只读验收

- 结果：passed
- 失败类型：none
- 尝试：1
- 命令：`C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/supply-platform-fulfillment-readiness.ts --store-id=6`

stdout：

```text
◇ injected env (27) from .env // tip: ◈ encrypted .env [www.dotenvx.com]
Wrote D:\AI coding\beauty-salon-admin\docs\04-测试数据\supply-platform-fulfillment-readiness-2026-07-03.md
Wrote D:\AI coding\beauty-salon-admin\docs\04-测试数据\supply-platform-fulfillment-readiness-2026-07-03.json
```

stderr：

```text
(node:36532) [DEP0180] DeprecationWarning: fs.Stats constructor is deprecated.
(Use `node --trace-deprecation ...` to show where the warning was created)
```

### 8. 样本级闭环闸门

- 结果：passed
- 失败类型：none
- 尝试：1
- 命令：`C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/industry-chain-sample-gate.ts --store-id=6`

stdout：

```text
◇ injected env (27) from .env // tip: ⌘ suppress logs { quiet: true }
样本级闸门报告生成完成：D:\AI coding\beauty-salon-admin\docs\04-测试数据\industry-chain-sample-gate-2026-07-03.md
总状态：已完成
通过 10，未通过 0，待关注 0
```

stderr：

```text
(node:22020) [DEP0180] DeprecationWarning: fs.Stats constructor is deprecated.
(Use `node --trace-deprecation ...` to show where the warning was created)
```

### 9. 行业链路完成度闸门

- 结果：passed
- 失败类型：none
- 尝试：1
- 命令：`C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/industry-chain-completion-gate.ts --store-id=6`

stdout：

```text
◇ injected env (27) from .env // tip: ◈ secrets for agents [www.dotenvx.com]
完成度闸门报告生成完成：D:\AI coding\beauty-salon-admin\docs\04-测试数据\industry-chain-completion-gate-2026-07-03.md
总状态：已完成
通过 10，未通过 0，待关注 0，当前无样本 0
```

stderr：

```text
(node:32356) [DEP0180] DeprecationWarning: fs.Stats constructor is deprecated.
(Use `node --trace-deprecation ...` to show where the warning was created)
```


说明：

- dry-run 模式不会执行真实写库步骤，只执行预览和只读验收。
- 只读/预览步骤最多自动尝试 3 次，并在失败后短暂退避；写库步骤不自动重试，避免重复写入。
- apply 模式必须传入 `--apply --yes`，会按顺序修复采用记录、修复 BOM 单位、创建供应链履约样本，并执行只读验收。
- apply 模式下，只有最终完成度闸门 `complete=true` 才视为业务闭环完成。
