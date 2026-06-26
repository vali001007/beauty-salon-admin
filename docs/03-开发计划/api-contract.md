# 美业管理平台 API 契约草案

本文用于当前 MVP 联调阶段。管理端运行时 API 已统一走 `src/api/real/*` 与 `server-v2`，不再通过 `VITE_API_MODE` 在 mock/real 之间切换。所有请求基于 `VITE_API_BASE_URL`，默认回退 `/api`。

## 通用约定

- 认证头：`Authorization: Bearer <token>`
- 门店头：`X-Store-Id: <storeId>`，未选门店时不发送
- 分页请求：`page` 从 `1` 开始，`pageSize` 为每页条数
- 分页响应：

```json
{
  "items": [],
  "data": [],
  "total": 0,
  "page": 1,
  "pageSize": 10
}
```

- 错误响应：

```json
{
  "message": "业务错误说明",
  "code": "OPTIONAL_ERROR_CODE",
  "details": {}
}
```

## 当前已收口接口

### 终端与管理端共享业务服务

终端和管理端保留不同鉴权入口：终端继续走设备鉴权与 `/terminal/*` 路由，管理端继续走 JWT、权限码与后台路由。业务事实不能按入口分叉，以下高频动作必须收敛到同一后端 service：

| 业务动作 | 终端入口 | 管理端入口 | 权威 service | 统一副作用 |
| --- | --- | --- | --- | --- |
| 次卡核销 | `POST /terminal/cards/consume` | `POST /cards/verify-usage`、`POST /cards/usage` | `CardsService.verifyCardUsage` | 卡剩余次数、核销记录、履约收入、BOM 耗材、服务提成 |
| 新建客户 | `POST /terminal/customers/quick-create` | `POST /customers` | `CustomersService.create` | 客户主表、健康档案、客户画像基础数据 |
| 会员充值 | `POST /terminal/recharge-orders` | `POST /orders/member-cards/:id/recharge` | `OrdersService.createRechargeOrder` / `createMemberCardRecharge` | 充值订单、余额账户、余额流水、支付记录、提成、日结 |
| 收银写单 | `POST /terminal/cashier/checkout` | `POST /orders/product`、`POST /orders/project` | `OrdersService.createProductOrder` | 商品/项目订单、明细、支付、余额消费、库存、BOM、提成、日结 |

新增或调整这些业务时，应先改权威 service，再由终端和管理端入口补齐各自上下文字段，例如 `storeId`、`deviceId`、`operatorId`、`source` 和权限校验。

### 认证

| Method | Path | 说明 |
| --- | --- | --- |
| POST | `/auth/login` | 登录 |
| POST | `/auth/logout` | 登出 |
| GET | `/auth/user-info` | 获取当前用户 |
| POST | `/auth/register` | 注册门店管理员 |

### 客户与画像

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/customers` | 客户列表 |
| GET | `/customers/paginated` | 客户分页 |
| GET | `/customers/consumption-records` | 客户消费记录 |
| GET | `/customers/health-profiles` | 客户健康档案 |
| GET | `/customers/profile-analytics` | 客户画像聚合分析 |

### 库存与调拨

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/inventory/transfers/paginated` | 门店调拨列表 |
| POST | `/inventory/transfers` | 创建调拨单 |

### 营销推荐

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/marketing/recommendations` | 智能推荐列表 |
| GET | `/marketing/recommendations/{id}/audience` | 推荐命中客户列表 |

### 自动营销

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/marketing/automation/trigger-options` | 触发规则目录 |
| GET | `/marketing/automation/strategies/paginated` | 策略分页 |
| POST | `/marketing/automation/strategies` | 创建策略 |
| PUT | `/marketing/automation/strategies/{id}` | 更新策略 |
| POST | `/marketing/automation/strategies/{id}/enable` | 启用策略 |
| POST | `/marketing/automation/strategies/{id}/pause` | 暂停策略 |
| POST | `/marketing/automation/strategies/{id}/preview-audience` | 预估命中客户 |
| POST | `/marketing/automation/strategies/{id}/execute` | 执行策略 |
| GET | `/marketing/automation/executions/paginated` | 执行记录分页 |
| GET | `/marketing/automation/effects` | 效果统计 |

### 行业数据平台

行业数据平台首期只提供行业模板、项目 BOM、标准商品/耗品、岗位薪酬和知识库能力，不直接负责真实供应商 SKU、报价、采购和履约。供应链平台 MVP 已接入后，行业标准品/BOM 到真实供货商品的关系由 `SupplyCatalogMapping` 承接；行业接口仍只表达模板侧映射状态，不触发采购。

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/industry/data-sources` | 行业数据源分页列表 |
| POST | `/industry/data-sources` | 创建行业数据源 |
| PATCH | `/industry/data-sources/{id}` | 更新行业数据源 |
| GET | `/industry/service-templates/paginated` | 后台分页查询行业服务项目模板 |
| GET | `/industry/service-templates` | 查询已发布行业服务项目模板，供 Ami_Core 采用 |
| GET | `/industry/service-templates/{id}` | 查询行业服务项目模板详情 |
| POST | `/industry/service-templates` | 创建行业服务项目模板 |
| PATCH | `/industry/service-templates/{id}` | 更新行业服务项目模板 |
| POST | `/industry/service-templates/{id}/submit-review` | 提交行业服务项目模板审核 |
| POST | `/industry/service-templates/{id}/publish` | 发布行业服务项目模板 |
| POST | `/industry/service-templates/{id}/offline` | 下线行业服务项目模板 |
| GET | `/industry/service-templates/{id}/bom` | 查询已发布行业项目 BOM 模板，供 Ami_Core 采用 |
| POST | `/industry/service-templates/{id}/adopt-project` | 采用已发布服务模板，事务创建门店项目、项目 BOM 和采用记录；默认自动创建/复用本地商品，传 `createMissingProducts=false` + `productMappings[{ productTemplateId, productId }]` 时改为手动映射已有商品/耗品 |
| GET | `/industry/bom-templates/{serviceTemplateId}` | 后台查询行业项目 BOM 模板 |
| PUT | `/industry/bom-templates/{serviceTemplateId}` | 保存行业项目 BOM 模板 |
| POST | `/industry/bom-templates/{serviceTemplateId}/publish` | 发布行业项目 BOM 模板 |
| GET | `/industry/product-templates/paginated` | 后台分页查询标准商品/耗品模板 |
| GET | `/industry/product-templates` | 查询已发布标准商品/耗品模板，供 Ami_Core 采用 |
| GET | `/industry/product-templates/{id}` | 查询标准商品/耗品模板详情 |
| POST | `/industry/product-templates` | 创建标准商品/耗品模板 |
| PATCH | `/industry/product-templates/{id}` | 更新标准商品/耗品模板 |
| POST | `/industry/product-templates/{id}/publish` | 发布标准商品/耗品模板 |
| POST | `/industry/product-templates/{id}/adopt-product` | 采用已发布标准品，事务创建门店本地商品/耗品和采用记录 |
| GET | `/industry/knowledge/items/paginated` | 后台分页查询行业知识库 |
| GET | `/industry/knowledge/items` | 查询已发布行业知识条目，供 AI/终端调用 |
| POST | `/industry/knowledge/items` | 创建行业知识条目 |
| PATCH | `/industry/knowledge/items/{id}` | 更新行业知识条目 |
| GET | `/industry/salary-benchmarks/paginated` | 后台分页查询岗位薪酬模板 |
| GET | `/industry/salary-benchmarks` | 查询已发布岗位薪酬模板 |
| POST | `/industry/salary-benchmarks` | 创建岗位薪酬模板 |
| PATCH | `/industry/salary-benchmarks/{id}` | 更新岗位薪酬模板 |
| POST | `/industry/adoptions` | Ami_Core 回传行业模板采用记录 |
| GET | `/industry/adoptions` | 查询行业模板采用记录 |
| GET | `/industry/template-updates` | 查询已采用模板的可升级版本，MVP 先返回空列表 |
| GET | `/industry/product-templates/{id}/supply-mappings` | 查询标准品到供应链平台 SKU 的映射状态 |
| GET | `/industry/bom-items/{id}/supply-candidates` | 查询 BOM 明细可映射的供应链候选，采购仍走库存补货入口 |
| POST | `/industry/supply-mapping-requests` | 记录供应链映射需求，不触发采购 |

行业项目 BOM 模板响应核心字段：

```json
{
  "id": 1,
  "serviceTemplateId": 10,
  "version": 1,
  "status": "published",
  "totalCostMin": 8.2,
  "totalCostMax": 28.6,
  "items": [
    {
      "id": 101,
      "productTemplateId": 201,
      "itemRole": "main_material",
      "standardQty": 5,
      "unit": "ml",
      "lossRate": 0,
      "required": true,
      "costIncluded": true,
      "serviceStep": "清洁",
      "futureSupplyRequired": true,
      "futureSupplyMappingKey": "cleanser_500ml",
      "productTemplate": {
        "standardProductCode": "STD-CLEANSER-PRO-001",
        "name": "院装温和洁面乳",
        "referenceCostMin": 0.18,
        "referenceCostMax": 0.45
      }
    }
  ]
}
```

### 供应链平台 MVP

供应链平台是独立 bounded context，负责供应商、商品上架、报价、采购履约、发货、收货回执和供应商结算。Ami_Core 管理端库存管理只保留补货建议、平台下单、订单状态查询和收货入库；不再把供应商商品、报价、返利和结算作为门店库存管理的主能力。

#### 边界

| 系统 | owns | 调用关系 |
| --- | --- | --- |
| 供应链平台 | `SupplySupplier`、`SupplySku`、`SupplyQuote`、`SupplyCatalogMapping`、`ProcurementOrder`、`SupplierShipment`、`SupplySettlement` | 对 Ami_Core 暴露可供 SKU/报价、采购订单、发货和结算接口 |
| Ami_Core 库存管理 | `Product`、`StockBatch`、`StockMovement`、安全库存、服务扣耗、销售扣库存 | `GET /inventory/replenishment` 查询平台报价与在途订单，收货时写本地库存批次和流水 |
| 历史采购单 | `PurchaseOrder` | 仅作为无平台供货时的手动采购兜底和历史兼容 |

#### 平台运营与供应商门户接口

权限边界：

- 平台运营使用 `core:supply:manage`，可创建供应商、审核供应商/商品/报价、生成结算和维护映射。
- 门店库存采购使用 `core:inventory:purchase`，只能查询可供 SKU/报价、创建平台采购单和收货入库。
- 供应商账号使用 `supplier_admin` 角色和 `core:supply:supplier` 权限，并通过 `User.supplySupplierId` 绑定供应商主档；后端按该供应商 ID 自动隔离供应商、商品、报价、订单、发货和结算查询。
- 供应商账号不能访问 Ami_Core 客户、门店订单、库存采购入库、财务和平台审核能力。

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/supply-platform/suppliers` | 查询供应链平台供应商 |
| GET | `/supply-platform/suppliers/{id}` | 查询供应商详情、资质和关联数据 |
| POST | `/supply-platform/suppliers` | 创建供应商或供应商注册补资料 |
| PATCH | `/supply-platform/suppliers/{id}` | 更新供应商资料 |
| PATCH | `/supply-platform/suppliers/{id}/status` | 审核、启用、冻结供应商 |
| POST | `/supply-platform/supplier-qualifications` | 提交供应商资质 |
| GET | `/supply-platform/skus` | 查询供应链商品池 |
| GET | `/supply-platform/skus/{id}` | 查询供应链商品详情 |
| POST | `/supply-platform/skus` | 供应商提交商品上架 |
| PATCH | `/supply-platform/skus/{id}` | 更新商品资料 |
| PATCH | `/supply-platform/skus/{id}/audit` | 平台审核商品 |
| GET | `/supply-platform/quotes` | 查询报价；`availableOnly=true` 只返回已审核、有效期内报价 |
| POST | `/supply-platform/quotes` | 供应商提交报价 |
| PATCH | `/supply-platform/quotes/{id}` | 更新报价 |
| PATCH | `/supply-platform/quotes/{id}/audit` | 平台审核报价 |
| POST | `/supply-platform/mappings` | 绑定供应链 SKU 与门店商品或行业标准品 |

#### 采购履约接口

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/supply-platform/procurement/orders` | 查询平台采购订单，支持 `storeId`、`supplierId`、`status`、`keyword` |
| GET | `/supply-platform/procurement/orders/{id}` | 查询平台采购订单详情 |
| POST | `/supply-platform/procurement/orders` | Ami_Core 库存补货创建平台采购订单，下单锁定报价 |
| PATCH | `/supply-platform/procurement/orders/{id}/status` | 更新采购订单状态 |
| POST | `/supply-platform/procurement/orders/{id}/shipments` | 供应商发货，可部分发货 |
| POST | `/supply-platform/procurement/orders/{id}/receipts` | 门店确认收货并写 `StockBatch`、`StockMovement`、`Product.currentStock` |

采购订单创建请求：

```json
{
  "storeId": 1,
  "supplierId": 10,
  "expectedArrivalDate": "2026-06-28",
  "sourceType": "replenishment",
  "items": [
    {
      "productId": 201,
      "supplySkuId": 301,
      "quoteId": 401,
      "quantity": 6,
      "unitPrice": 88
    }
  ]
}
```

收货入库口径：

```json
{
  "movementType": "purchase_inbound",
  "sourceType": "supply_platform_order",
  "sourceId": 1001,
  "sourceNo": "SP-20260621-0001"
}
```

#### 供应商结算接口

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/supply-platform/settlements` | 查询供应商结算单 |
| POST | `/supply-platform/settlements/generate` | 按月份生成供应商月结 |

#### 库存补货返回扩展

`GET /inventory/replenishment` 仍是 Ami_Core 库存入口，但已扩展平台供货字段。页面按这些字段决定生成平台供货订单还是手动采购兜底。

| 字段 | 说明 |
| --- | --- |
| `productId` | Ami_Core 本地商品 ID |
| `inTransitQty` | 平台未收货在途数量 |
| `supplierId` / `supplierName` | 平台供货供应商 |
| `supplySkuId` / `supplySkuName` | 平台供应链 SKU |
| `quoteId` | 下单锁价使用的报价 |
| `supplyPrice` / `moq` / `leadDays` | 供货价、起订量、交期 |
| `availabilityStatus` | `platform_available`、`legacy_supplier_available`、`manual_purchase` |

### 终端

| Method | Path | 说明 |
| --- | --- | --- |
| POST | `/terminal/device/login` | 设备登录 |
| GET | `/terminal/bootstrap` | 终端初始化数据 |
| GET | `/terminal/customers/search` | 客户搜索 |
| GET | `/terminal/service-tasks` | 服务任务列表 |
| POST | `/terminal/card-usage/preview` | 次卡核销预览 |
| POST | `/terminal/card-usage/verify` | 次卡核销确认 |

### 订单与收银优惠分摊

`POST /orders/product`、`POST /orders/project`、`POST /terminal/cashier/checkout` 已统一支持订单级优惠分摊。新订单写入订单头和明细的原价、优惠、实收字段，经营利润、提成和退款优先使用 `netAmount`，历史数据回退 `subtotal` / `totalAmount`。

请求字段：

| 字段 | 说明 |
| --- | --- |
| `discountMode` | `none`、`amount`、`rate`、`package_price`、`manual` |
| `discountAmount` | 整单优惠金额，`amount` 模式使用 |
| `discountRate` | 折扣率，`rate` 模式使用，例如 `0.8` 表示八折 |
| `packagePrice` | 套餐成交价，`package_price` 模式使用 |
| `allocationMethod` | 默认 `price_ratio`，按明细实收占比分摊整单优惠 |
| `discountSource` | `order`、`package`、`promotion`、`coupon`、`manual` |
| `items[].listAmount` | 明细原价小计，不传则按 `quantity * unitPrice` |
| `items[].itemDiscountAmount` | 明细级优惠 |
| `items[].isGift` | 赠品收入为 0，不参与整单优惠分摊 |
| `items[].eligibleForOrderDiscount` | 是否参与整单优惠分摊 |

响应字段：

| 字段 | 说明 |
| --- | --- |
| `listAmount` | 订单原价合计 |
| `itemDiscountAmount` | 明细优惠合计 |
| `orderDiscountAmount` | 整单分摊优惠合计 |
| `totalDiscountAmount` | 总优惠 |
| `netAmount` | 订单实收，应与 `totalAmount` 保持一致 |
| `items[].orderAllocatedDiscountAmount` | 明细分摊到的整单优惠 |
| `items[].netAmount` | 明细实收，利润和提成基数使用该字段 |

### 经营利润

经营利润模块不把办卡/充值现金流直接算作利润。前端只展示后端聚合结果，核心利润公式、成本缺口和数据质量标记由 `server-v2` 返回。

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/operation-profit/overview` | 利润看板：现金收入、经营收入、毛利、经营利润、净利率、收入/成本结构、趋势和异常提醒 |
| GET | `/operation-profit/product-margins` | 商品毛利：商品销售收入、商品成本、商品提成、商品毛利、毛利率、成本来源和缺成本/缺提成提示 |
| GET | `/operation-profit/project-margins` | 项目毛利：项目收入、耗材成本、提成成本、贡献毛利、缺项目档案/缺 BOM/缺耗材/缺提成提示 |
| GET | `/operation-profit/prepaid-liabilities` | 会员卡履约：剩余次数、剩余权益估算、临期/沉睡/高剩余风险 |
| GET | `/operation-profit/beautician-performance` | 员工人效：美容师服务收入、服务次数、客户数、办卡金额、贡献毛利 |
| GET | `/operation-costs` | 经营成本列表，按门店、月份、分类分页查询 |
| POST | `/operation-costs` | 新增经营成本 |
| PATCH | `/operation-costs/{id}` | 更新经营成本 |
| DELETE | `/operation-costs/{id}` | 删除经营成本 |
| POST | `/operation-costs/copy-from-previous-month` | 复制上月经营成本到目标月份 |

经营利润查询参数：

| 参数 | 适用接口 | 说明 |
| --- | --- | --- |
| `from` / `to` | overview、product-margins、project-margins、beautician-performance | 日期范围，格式 `YYYY-MM-DD` |
| `basis` | overview、product-margins、project-margins、beautician-performance | `cash` 或 `operating`，默认经营口径 |
| `storeId` | 全部接口 | 可选；管理端通常通过 `X-Store-Id` 传当前门店 |
| `page` / `pageSize` | product-margins、project-margins、prepaid-liabilities、operation-costs | 分页 |
| `status` | product-margins、project-margins | 毛利状态筛选；商品支持 `high_profit`、`normal`、`low_margin`、`loss`、`cost_missing` |
| `keyword` / `categoryId` / `sortBy` | product-margins | 商品名/SKU/品牌、分类、排序；`sortBy` 支持 `salesAmount`、`grossProfit`、`marginRate`、`quantity` |
| `riskOnly` | prepaid-liabilities | 只返回有履约风险的会员卡 |
| `periodMonth` / `category` | operation-costs | 成本月份和分类筛选 |

商品毛利返回字段：

```json
{
  "items": [
    {
      "productId": 201,
      "productName": "修护精华",
      "sku": "SKU-201",
      "categoryName": "精华",
      "quantitySold": 1,
      "salesAmount": 120,
      "refundAmount": 0,
      "netSalesAmount": 120,
      "unitCost": 50,
      "costSource": "order_snapshot",
      "productCost": 50,
      "commissionCost": 6,
      "grossProfit": 64,
      "marginRate": 0.5333,
      "orderCount": 1,
      "sourceOrders": [
        {
          "orderId": 10,
          "orderNo": "O10",
          "orderItemId": 1,
          "orderedAt": "2026-06-10",
          "customerName": "张女士",
          "quantity": 1,
          "salesAmount": 120,
          "refundAmount": 0,
          "netSalesAmount": 120,
          "commissionCost": 6
        }
      ],
      "status": "high_profit",
      "missingCostReasons": []
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20
}
```

`costSource=order_snapshot` 表示 `OrderItem.payload.costPrice/costAmount` 已记录成交当时商品成本；新建商品订单会写入该快照。历史订单无快照时会退回销售出库确认或商品档案成本。

`sourceOrders` 表示该商品毛利行关联的商品订单明细，页面右侧“订单明细”按钮使用该字段展示订单编号、客户、数量、净收入和提成；`orderCount` 是本期计入该商品毛利的订单数。

数据质量字段：

```json
{
  "dataQuality": {
    "status": "missing_cost",
    "missingCostReasons": ["missing_cost", "missing_project_master", "missing_bom", "missing_commission"],
    "detail": "本期存在未录入的经营成本，利润为预估值。"
  }
}
```

成本分类：

```text
rent, salary, commission, marketing, utilities, depreciation, supplies_adjustment, other
```

### 项目订单利润明细

项目订单列表的逐单利润弹窗使用该接口。权限要求：用户必须能访问项目订单，并且是系统管理员或店长；收银员、美容师和库存管理员默认不能查看逐单利润。

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/orders/project/{id}/profit` | 单笔项目订单利润明细：收入、项目 BOM/实际耗材、提成成本、毛利和数据缺口 |

成本口径：

- 项目收入：项目订单行 `subtotal`。
- 耗材成本：优先使用该订单的 `StockMovement` 实际扣耗材成本；没有实际扣减流水时，按项目 BOM 标准数量乘以商品成本价估算。
- 提成成本：优先使用订单行关联的 `CommissionRecord`；历史未绑定订单行的提成会进入 `unassignedCommissionRecords` 并计入订单总成本。

响应示例：

```json
{
  "orderId": 501,
  "orderNo": "PO-501",
  "customerName": "罗若兰",
  "storeName": "Ami 全量演示门店",
  "totalIncome": 400,
  "standardMaterialCost": 60,
  "actualMaterialCost": 60,
  "materialCost": 60,
  "commissionCost": 40,
  "unassignedCommissionCost": 0,
  "totalCost": 100,
  "grossProfit": 300,
  "grossMargin": 0.75,
  "materialCostSource": "actual_stock_movement",
  "dataQuality": "complete",
  "missingReasons": [],
  "items": [
    {
      "orderItemId": 701,
      "projectId": 101,
      "projectName": "肩颈舒压",
      "beauticianName": "周宁",
      "income": 400,
      "standardMaterialCost": 60,
      "commissionCost": 40,
      "grossProfit": 300,
      "grossMargin": 0.75,
      "bomItems": [
        { "productId": 301, "productName": "按摩精油", "quantity": 3, "costAmount": 60 }
      ],
      "commissionRecords": [
        { "staffUserName": "周宁", "ruleName": "项目通用提成", "sourceAmount": 400, "amount": 40 }
      ],
      "missingReasons": []
    }
  ],
  "actualMaterialMovements": [],
  "unassignedCommissionRecords": []
}
```

## 说明

- 客户画像页、智能推荐页、门店调拨页已尽量复用同一批基础数据源。
- 后续新增 API 时，优先沿用 `mock / real / export` 三层结构，并保持返回结构和本文一致。

## AI Gateway / 大模型能力

所有大模型能力必须经 `packages/server-v2` 调用，前端和 Ami Aura Lite 不直连模型供应商，不保存模型 Key。`server-v2` 负责鉴权、门店隔离、字段脱敏、Prompt 模板版本、审计日志、成本统计和限流；旧 `POST /v1/messages` Anthropic-compatible 兼容入口已移除，移动/助手端应接入 Agent Gateway 或 `/api/ai/*`。

| Method | Path | 说明 |
| --- | --- | --- |
| POST | `/ai/chat/messages` | 管理端智能助手，后续支持 SSE 流式返回 |
| POST | `/ai/generate/customer-invitation-script` | 客户邀约话术生成 |
| POST | `/ai/generate/marketing-copy` | 营销渠道文案生成 |
| POST | `/ai/generate/campaign-variants` | 营销活动多版本文案生成 |
| POST | `/ai/generate/customer-summary` | 客户画像摘要 |
| POST | `/ai/generate/service-note-summary` | 服务记录摘要 |
| POST | `/ai/generate/skin-test-explanation` | 肌肤检测报告解释 |
| POST | `/ai/generate/terminal-service-advice` | Ami Aura Lite 服务建议话术 |
| POST | `/ai/recommend/next-best-action` | 基于规则结果生成下一步建议说明 |
| GET | `/ai/audit-logs/paginated` | AI 调用审计日志 |

`POST /ai/generate/terminal-service-advice` 会在后端读取已发布行业知识作为 `structured.industryKnowledge` 上下文。读取口径固定为 `IndustryService.findKnowledgeItems(query, true)`，即只允许 `reviewStatus=approved` 的知识进入 AI Gateway；未审核、草稿、下线知识不能进入终端服务建议。

AI 生成响应：

```json
{
  "id": "ai-marketing_copy-1770000000000",
  "scenario": "marketing_copy",
  "text": "生成后的可展示文本",
  "variants": [
    { "title": "短信版本", "text": "短信文案", "channel": "sms" }
  ],
  "structured": {},
  "safety": {
    "masked": true,
    "blocked": false,
    "reasons": []
  },
  "usage": {
    "provider": "mock",
    "model": "ami-core-mock-llm",
    "inputTokens": 120,
    "outputTokens": 80,
    "estimatedCost": 0
  }
}
```

AI Gateway 环境变量：

| 变量 | 说明 |
| --- | --- |
| `LLM_PROVIDER` | `mock`、`deepseek`、`openai_compatible`、`claude_compatible` |
| `LLM_MODEL` | 默认模型名 |
| `LLM_BASE_URL` | 模型供应商服务地址 |
| `LLM_API_KEY` | 仅后端保存的模型 Key |
| `LLM_TIMEOUT_MS` | 模型调用超时时间 |
| `LLM_DAILY_BUDGET` | 每日预算上限，第一阶段先记录配置 |
