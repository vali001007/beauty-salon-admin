# 行业标准品到库存采购 BOM 销售链路收口编排报告

业务日期：2026-07-03

生成时间（北京时间）：2026-07-03 08:33:06 Asia/Shanghai

生成时间（UTC）：2026-07-03T00:33:06.148Z

模式：apply

applyAllowed：true

执行计划就绪：true

业务闸门完成：true

## 1. 步骤汇总

| 步骤 | 类型 | 结果 | 失败类型 | 尝试 | 退出码 | 命令 |
| --- | --- | --- | --- | --- | --- | --- |
| 收口前链路基线快照 | 只读/预览 | passed | none | 1 | 0 | C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/industry-sku-chain-baseline.ts --store-id=6 |
| 收口前单位一致性巡检 | 只读/预览 | passed | none | 1 | 0 | C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/product-unit-consistency-audit.ts --store-id=6 |
| 真实写库前影响面快照 | 只读/预览 | passed | none | 1 | 0 | C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/industry-chain-apply-readiness.ts --strategy=mark-invalid --store-id=6 --strict |
| 修复失效采用记录 | 写库 | passed | none | 1 | 0 | C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/industry-adoption-repair.ts --strategy=mark-invalid --store-id=6 --apply --yes |
| 修复 BOM 单位到规格单位 | 写库 | passed | none | 1 | 0 | C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/product-unit-repair.ts --store-id=6 --apply --yes |
| 执行供应链平台采购履约 MVP flow | 写库 | passed | none | 1 | 0 | C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/supply-platform-mvp-flow.ts --apply --yes --storeId=6 |
| 供应链履约就绪度复验 | 只读/预览 | passed | none | 1 | 0 | C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/supply-platform-fulfillment-readiness.ts --store-id=6 |
| MVP flow verify 复验 | 只读/预览 | passed | none | 1 | 0 | C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/supply-platform-mvp-flow.ts --verify --storeId=6 |
| 样本级闭环闸门 | 只读/预览 | passed | none | 1 | 0 | C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/industry-chain-sample-gate.ts --store-id=6 --strict |
| 行业链路完成度闸门 | 只读/预览 | passed | none | 1 | 0 | C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/industry-chain-completion-gate.ts --store-id=6 --strict |

## 2. 失败步骤

暂无。

## 3. 最终业务闸门

| 检查项 | 值 |
| --- | --- |
| 闸门 JSON | D:\AI coding\beauty-salon-admin\docs\04-测试数据\industry-chain-completion-gate-2026-07-03.json |
| checkedAt | 2026-07-03T00:33:06.027Z |
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
(node:7480) [DEP0180] DeprecationWarning: fs.Stats constructor is deprecated.
(Use `node --trace-deprecation ...` to show where the warning was created)
```

### 2. 收口前单位一致性巡检

- 结果：passed
- 失败类型：none
- 尝试：1
- 命令：`C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/product-unit-consistency-audit.ts --store-id=6`

stdout：

```text
◇ injected env (27) from .env // tip: ◈ encrypted .env [www.dotenvx.com]
Wrote D:\AI coding\beauty-salon-admin\docs\04-测试数据\product-unit-consistency-audit-2026-07-03.md
Wrote D:\AI coding\beauty-salon-admin\docs\04-测试数据\product-unit-consistency-audit-2026-07-03.json
```

stderr：

```text
(node:32808) [DEP0180] DeprecationWarning: fs.Stats constructor is deprecated.
(Use `node --trace-deprecation ...` to show where the warning was created)
```

### 3. 真实写库前影响面快照

- 结果：passed
- 失败类型：none
- 尝试：1
- 命令：`C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/industry-chain-apply-readiness.ts --strategy=mark-invalid --store-id=6 --strict`

stdout：

```text
◇ injected env (27) from .env // tip: ⌘ override existing { override: true }
Wrote D:\AI coding\beauty-salon-admin\docs\04-测试数据\industry-chain-apply-readiness-2026-07-03.md
Wrote D:\AI coding\beauty-salon-admin\docs\04-测试数据\industry-chain-apply-readiness-2026-07-03.json
readiness brokenAdoptions=1 bomUnitRepairs=1 sampleProduct=82 guard=true
```

stderr：

```text
(node:2324) [DEP0180] DeprecationWarning: fs.Stats constructor is deprecated.
(Use `node --trace-deprecation ...` to show where the warning was created)
```

### 4. 修复失效采用记录

- 结果：passed
- 失败类型：none
- 尝试：1
- 命令：`C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/industry-adoption-repair.ts --strategy=mark-invalid --store-id=6 --apply --yes`

stdout：

```text
◇ injected env (27) from .env // tip: ⌘ enable debugging { debug: true }
{
  "mode": "apply",
  "strategy": "mark-invalid",
  "brokenAdoptions": 1,
  "actions": [
    {
      "adoptionId": 22,
      "action": "mark_invalid",
      "localProductId": 136
    }
  ]
}
```

stderr：

```text
(node:17344) [DEP0180] DeprecationWarning: fs.Stats constructor is deprecated.
(Use `node --trace-deprecation ...` to show where the warning was created)
```

### 5. 修复 BOM 单位到规格单位

- 结果：passed
- 失败类型：none
- 尝试：1
- 命令：`C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/product-unit-repair.ts --store-id=6 --apply --yes`

stdout：

```text
◇ injected env (27) from .env // tip: ⌘ override existing { override: true }
Wrote D:\AI coding\beauty-salon-admin\docs\04-测试数据\product-unit-repair-preview-2026-07-03.md
Wrote D:\AI coding\beauty-salon-admin\docs\04-测试数据\product-unit-repair-preview-2026-07-03.json
```

stderr：

```text
(node:30452) [DEP0180] DeprecationWarning: fs.Stats constructor is deprecated.
(Use `node --trace-deprecation ...` to show where the warning was created)
```

### 6. 执行供应链平台采购履约 MVP flow

- 结果：passed
- 失败类型：none
- 尝试：1
- 命令：`C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/supply-platform-mvp-flow.ts --apply --yes --storeId=6`

stdout：

```text
mary": "创建发货明细 supplySkuId=1 shippedQty=5",
      "rollbackHint": "如需回滚，先恢复采购明细/发货明细 receivedQty，再删除该发货明细。",
      "before": null
    },
    {
      "model": "ProcurementOrder",
      "action": "update",
      "id": 1,
      "summary": "采购单状态 accepted -> shipped",
      "rollbackHint": "如需回滚，恢复采购单 status/shippedAt。",
      "before": {
        "status": "accepted",
        "shippedAt": null
      }
    },
    {
      "model": "SupplierShipmentItem",
      "action": "reuse",
      "id": 1,
      "summary": "复用匹配当前采购明细的发货明细 orderItemId=1 supplySkuId=1",
      "rollbackHint": "复用对象不需要删除。",
      "before": null
    },
    {
      "model": "StockBatch",
      "action": "create",
      "id": 203,
      "summary": "创建入库批次 B-MVP-1 stock=5",
      "rollbackHint": "如需回滚，先删除引用该批次的库存流水，再删除批次。",
      "before": null
    },
    {
      "model": "Product",
      "action": "update",
      "id": 82,
      "summary": "产品库存 128 -> 133",
      "rollbackHint": "如需回滚，扣回本次入库数量并恢复 currentStock。",
      "before": {
        "currentStock": 128
      }
    },
    {
      "model": "StockMovement",
      "action": "create",
      "id": 553,
      "summary": "创建平台采购入库流水 SPI-MVP-1783038774368",
      "rollbackHint": "如需回滚，删除该入库流水并同步回滚产品库存/批次库存。",
      "before": null
    },
    {
      "model": "SupplierShipmentItem",
      "action": "update",
      "id": 1,
      "summary": "发货明细已收 0 -> 5",
      "rollbackHint": "如需回滚，恢复发货明细 receivedQty。",
      "before": {
        "receivedQty": 0
      }
    },
    {
      "model": "ProcurementOrderItem",
      "action": "update",
      "id": 1,
      "summary": "采购明细已收 0 -> 5",
      "rollbackHint": "如需回滚，恢复采购明细 receivedQty。",
      "before": {
        "receivedQty": 0
      }
    },
    {
      "model": "ProcurementOrder",
      "action": "update",
      "id": 1,
      "summary": "采购单状态 shipped -> received",
      "rollbackHint": "如需回滚，恢复采购单 status/receivedAt。",
      "before": {
        "status": "shipped",
        "receivedAt": null
      }
    },
    {
      "model": "Product",
      "action": "update",
      "id": 82,
      "summary": "产品安全库存 45 -> 143",
      "rollbackHint": "如需回滚，恢复产品 safetyStock。",
      "before": {
        "safetyStock": 45
      }
    },
    {
      "model": "SupplySettlement",
      "action": "create",
      "id": 1,
      "summary": "创建供应商 2026-07 月结算单",
      "rollbackHint": "如需回滚，删除该结算单。",
      "before": null
    }
  ]
}
```

stderr：

```text
(node:8504) [DEP0180] DeprecationWarning: fs.Stats constructor is deprecated.
(Use `node --trace-deprecation ...` to show where the warning was created)
```

### 7. 供应链履约就绪度复验

- 结果：passed
- 失败类型：none
- 尝试：1
- 命令：`C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/supply-platform-fulfillment-readiness.ts --store-id=6`

stdout：

```text
◇ injected env (27) from .env // tip: ⌘ custom filepath { path: '/custom/path/.env' }
Wrote D:\AI coding\beauty-salon-admin\docs\04-测试数据\supply-platform-fulfillment-readiness-2026-07-03.md
Wrote D:\AI coding\beauty-salon-admin\docs\04-测试数据\supply-platform-fulfillment-readiness-2026-07-03.json
```

stderr：

```text
(node:19108) [DEP0180] DeprecationWarning: fs.Stats constructor is deprecated.
(Use `node --trace-deprecation ...` to show where the warning was created)
```

### 8. MVP flow verify 复验

- 结果：passed
- 失败类型：none
- 尝试：1
- 命令：`C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/supply-platform-mvp-flow.ts --verify --storeId=6`

stdout：

```text
◇ injected env (27) from .env // tip: ⌘ enable debugging { debug: true }
Wrote D:\AI coding\beauty-salon-admin\docs\04-测试数据\supply-platform-mvp-flow-verify-2026-07-03.md
Wrote D:\AI coding\beauty-salon-admin\docs\04-测试数据\supply-platform-mvp-flow-verify-2026-07-03.json
{
  "mode": "verify",
  "dryRun": false,
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
(node:5972) [DEP0180] DeprecationWarning: fs.Stats constructor is deprecated.
(Use `node --trace-deprecation ...` to show where the warning was created)
```

### 9. 样本级闭环闸门

- 结果：passed
- 失败类型：none
- 尝试：1
- 命令：`C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/industry-chain-sample-gate.ts --store-id=6 --strict`

stdout：

```text
◇ injected env (27) from .env // tip: ⌘ suppress logs { quiet: true }
样本级闸门报告生成完成：D:\AI coding\beauty-salon-admin\docs\04-测试数据\industry-chain-sample-gate-2026-07-03.md
总状态：已完成
通过 10，未通过 0，待关注 0
```

stderr：

```text
(node:18500) [DEP0180] DeprecationWarning: fs.Stats constructor is deprecated.
(Use `node --trace-deprecation ...` to show where the warning was created)
```

### 10. 行业链路完成度闸门

- 结果：passed
- 失败类型：none
- 尝试：1
- 命令：`C:\Program Files\nodejs\node.exe node_modules/ts-node/dist/bin-esm.js prisma/industry-chain-completion-gate.ts --store-id=6 --strict`

stdout：

```text
◇ injected env (27) from .env // tip: ⌘ custom filepath { path: '/custom/path/.env' }
完成度闸门报告生成完成：D:\AI coding\beauty-salon-admin\docs\04-测试数据\industry-chain-completion-gate-2026-07-03.md
总状态：已完成
通过 10，未通过 0，待关注 0，当前无样本 0
```

stderr：

```text
(node:37848) [DEP0180] DeprecationWarning: fs.Stats constructor is deprecated.
(Use `node --trace-deprecation ...` to show where the warning was created)
```


说明：

- dry-run 模式不会执行真实写库步骤，只执行预览和只读验收。
- 只读/预览步骤最多自动尝试 3 次，并在失败后短暂退避；写库步骤不自动重试，避免重复写入。
- apply 模式必须传入 `--apply --yes`，会按顺序修复采用记录、修复 BOM 单位、创建供应链履约样本，并执行只读验收。
- apply 模式下，只有最终完成度闸门 `complete=true` 才视为业务闭环完成。
