# Ami 财务体系设计方案

版本：v1.0  
日期：2026-06-07  
适用范围：管理端、server-v2 后端、Ami Aura Lite 终端、数字员工绩效、供应链抽佣  
前置文档：`docs/digital-employee-market-analysis.md`、`docs/03-开发计划/data-completion-and-integration-plan.md`

---

## 一、现状评估

### 已有基础

| 模块 | 现状 | 成熟度 |
|------|------|--------|
| 订单系统 | `ProductOrder` + `OrderItem` + `PaymentRecord` + `RefundRecord`，覆盖产品/项目/次卡/储值 | ★★★☆ |
| 收银（终端） | 完整 checkout → 扣库存 → 更新客户消费 → 写 PaymentRecord | ★★★☆ |
| 储值卡账户 | `CustomerBalanceAccount` + `CustomerBalanceTransaction`，双余额（现金+赠送）分账 | ★★★☆ |
| 次卡核销 | `CardUsageRecord`，记录项目、次数、美容师 | ★★★☆ |
| 库存成本 | `Product.costPrice/retailPrice/salePrice`，采购单有 `totalAmount` | ★★☆☆ |
| BOM 物料 | `ProjectBomItem` 定义服务耗材标准量 | ★★☆☆ |
| 营销归因 | `MarketingAttribution` + `MarketingPageAttribution`，已关联到订单 | ★★★☆ |

### 缺失环节

| 模块 | 状态 | 影响 |
|------|------|------|
| 员工绩效/提成 | **完全未实现**，无 schema、无 API | 美容师积极性无抓手，老板看不到人效 |
| 数字员工绩效 | **仅有规划文档** | 无法量化 Ami 贡献，商业模式无法落地 |
| 收银对账 | **无**，付款全靠前端自报 | 资金漏洞、飞单无法追查 |
| 日结/班结 | **无** | 收银员交接班无凭据 |
| 供应链结算 | **无**，供应商仅 string 字段 | 无法做采购分账、抽佣 |
| 财务报表 | **无** | 老板看不到利润、毛利、人效 |

---

## 二、美业财务特点分析

美业不同于零售和餐饮，有以下独有特点需要在设计中重点考虑：

### 1. 收入结构复杂

```
门店收入
├── 项目服务收入（手工费 + 物料费，占 60-70%）
│   ├── 现付项目
│   └── 次卡消耗（确认收入时点 ≠ 收款时点）
├── 产品销售（零售，占 15-25%）
├── 储值充值（预收款，非即时收入）
│   ├── 现金部分（负债 → 消耗时确认收入）
│   └── 赠送部分（营销成本）
├── 次卡/年卡销售（预收款，按次分摊确认）
└── 其他收入（加盟费、培训费等）
```

**关键**：储值和次卡是"预收款"而非"收入"，消耗时才确认收入。这决定了提成计算的时点。

### 2. 人力是核心成本

- 美容师底薪 + 手工提成 + 产品销售提成 + 办卡提成 + 充值提成
- 提成规则复杂：按岗位等级不同、项目不同、是否指定美容师不同
- 美容师流动性大，需要日结可查以增强信任

### 3. 预收款管理是命脉

- 储值余额 = 门店负债
- 次卡未消耗 = 门店负债
- 健康的门店：预收/实收比 < 3:1
- 需要追踪"何时收的钱"和"何时提供的服务"

### 4. 供应链利润薄

- 产品毛利 40-60%，但实际扣除耗材后项目毛利可能只有 30-40%
- 美业采购量小，议价空间有限
- 平台抽佣需要从"集采降本"或"信息差"中产生价值

---

## 三、整体架构设计

```
┌─────────────────────────────────────────────────────────────────────┐
│                          财务核心层                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐               │
│  │ 订单与收银  │  │ 资金流水    │  │  预收款台账   │               │
│  │ ProductOrder│  │ FundLedger  │  │  PrepaidLedger│               │
│  │ + 日结班结  │  │ (收/支/转)  │  │  (储值+次卡) │               │
│  └──────┬──────┘  └──────┬──────┘  └──────┬───────┘               │
│         │                │                 │                        │
├─────────┼────────────────┼─────────────────┼────────────────────────┤
│         ▼                ▼                 ▼                        │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │                  结算引擎 (SettlementEngine)               │      │
│  │  ● 人工员工提成结算                                        │      │
│  │  ● 数字员工绩效结算                                        │      │
│  │  ● 供应商采购结算                                          │      │
│  │  ● 平台服务费结算                                          │      │
│  └───────────────────────┬──────────────────────────────────┘      │
│                          │                                          │
├──────────────────────────┼──────────────────────────────────────────┤
│                          ▼                                          │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │                  报表与分析层                              │      │
│  │  ● 日报/周报/月报                                         │      │
│  │  ● 人效分析                                               │      │
│  │  ● 毛利分析                                               │      │
│  │  ● 数字员工 ROI                                           │      │
│  └──────────────────────────────────────────────────────────┘      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 四、模块详细设计

### 模块 A：员工绩效与提成

#### A1. 数据模型

```prisma
// 提成规则模板
model CommissionRule {
  id              Int      @id @default(autoincrement())
  storeId         Int
  name            String
  type            String   // "project" | "product" | "card_sale" | "recharge" | "new_customer"
  targetType      String   // "all" | "category" | "specific"
  targetId        Int?     // category id 或 project/product id
  levelId         Int?     // 关联 BeauticianLevel，null 表示全等级通用
  rate            Decimal  // 提成比例，如 0.35 表示 35%
  fixedAmount     Decimal? // 固定金额提成（与 rate 二选一）
  calcBase        String   // "total" | "service_fee" | "material_fee" | "profit"
  isDesignated    Boolean  @default(false) // 指定美容师时是否加成
  designatedBonus Decimal? // 指定加成比例
  minThreshold    Decimal? // 最低触发金额
  status          String   @default("active")
  priority        Int      @default(0)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  store Store          @relation(fields: [storeId], references: [id])
  level BeauticianLevel? @relation(fields: [levelId], references: [id])

  @@index([storeId, type, status])
  @@index([levelId])
}

// 提成流水（每笔触发一条）
model CommissionRecord {
  id             Int      @id @default(autoincrement())
  storeId        Int
  beauticianId   Int
  orderId        Int?
  orderItemId    Int?
  ruleId         Int?
  type           String   // 同 CommissionRule.type
  sourceAmount   Decimal  // 原始金额基数
  rate           Decimal  // 适用比例
  amount         Decimal  // 实际提成金额
  status         String   @default("pending") // "pending" | "confirmed" | "settled" | "cancelled"
  settleMonth    String?  // "2026-06" 结算归属月
  confirmedAt    DateTime?
  settledAt      DateTime?
  remark         String?
  createdAt      DateTime @default(now())

  store      Store      @relation(fields: [storeId], references: [id])
  beautician Beautician @relation(fields: [beauticianId], references: [id])
  order      ProductOrder? @relation(fields: [orderId], references: [id])

  @@index([beauticianId, settleMonth])
  @@index([storeId, status])
  @@index([orderId])
}

// 月度结算单
model CommissionSettlement {
  id             Int      @id @default(autoincrement())
  storeId        Int
  beauticianId   Int
  settleMonth    String   // "2026-06"
  projectAmount  Decimal  @default(0)
  productAmount  Decimal  @default(0)
  cardSaleAmount Decimal  @default(0)
  rechargeAmount Decimal  @default(0)
  otherAmount    Decimal  @default(0)
  totalAmount    Decimal  @default(0)
  deductions     Decimal  @default(0) // 扣款（迟到/耗材超标等）
  netAmount      Decimal  @default(0) // 实发
  status         String   @default("draft") // "draft" | "confirmed" | "paid"
  confirmedBy    Int?
  confirmedAt    DateTime?
  paidAt         DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  store      Store      @relation(fields: [storeId], references: [id])
  beautician Beautician @relation(fields: [beauticianId], references: [id])

  @@unique([storeId, beauticianId, settleMonth])
}
```

#### A2. 提成计算逻辑

```
订单完成（or 次卡核销）
  → 查找适用的 CommissionRule（按 type + targetId + levelId 匹配，priority 排序）
  → 计算提成金额：
     项目类：(项目价格 - 物料成本) × rate  或  项目价格 × rate
     产品类：产品金额 × rate
     办卡类：卡售价 × rate
     充值类：充值金额 × rate
  → 指定美容师额外加成：amount × (1 + designatedBonus)
  → 写入 CommissionRecord(status: 'pending')
```

#### A3. 提成确认时点（美业核心问题）

| 业务类型 | 提成确认时点 | 理由 |
|----------|-------------|------|
| 项目现付 | 服务完成时 | 已交付服务 |
| 产品零售 | 收银完成时 | 已交付商品 |
| 次卡核销 | 核销时 | 服务交付 = 提成产生 |
| 办卡（次卡） | 卡销售时 50% + 每次核销时均分 50% | 平衡销售激励与服务质量 |
| 储值充值 | 充值时 | 行业惯例，激励拓客 |
| 新客到店 | 首次消费完成时 | 确认有效客户 |

#### A4. 美容师端可见性

终端 Kiosk 美容师角色仪表盘新增：

- **今日提成**：实时累计（含待确认）
- **本月累计**：已确认提成总额
- **提成明细**：每笔流水可查（客户名/项目/金额/比例/提成额）
- **月度排行**：同门店美容师提成排行（可选开关）

---

### 模块 B：数字员工（Ami）绩效追踪

#### B1. 设计原则

数字员工的绩效 = Ami 系统为门店创造的可量化价值。用"工时 + 提成"模型让老板理解 AI 的贡献。

#### B2. Ami 贡献分类

| 贡献类型 | 量化指标 | 计费模型 |
|----------|----------|----------|
| 智能营销触达 | 自动化策略带来的到店/消费 | 按转化订单金额抽成 |
| 预约提醒 | 减少爽约率（对比无提醒期间） | 工时计费（固定月费分摊） |
| 客户建档/跟进 | 新客建档数、跟进回访数 | 按有效建档数计件 |
| 次卡续费提醒 | 续费成功的卡金额 | 按续费金额抽成 |
| 流失挽回 | 流失预警后回店消费的客户 | 按挽回消费金额抽成 |
| 收银辅助 | 收银笔数（终端完成） | 工时计费 |
| 库存预警 | 避免断货损失 | 工时计费 |
| 智能排班 | 提升人效（美容师空闲率下降） | 工时计费 |

#### B3. 数据模型

```prisma
// 数字员工贡献记录
model AmiPerformanceRecord {
  id              Int      @id @default(autoincrement())
  storeId         Int
  category        String   // "marketing_conversion" | "reminder_retention" | "new_customer" |
                           // "card_renewal" | "churn_recovery" | "cashier_assist" | "inventory_alert" | "scheduling"
  triggerType     String   // "automation" | "recommendation" | "reminder" | "prediction"
  triggerId       Int?     // 关联到具体 automation execution / recommendation event 等
  customerId      Int?
  orderId         Int?
  revenueAmount   Decimal? // 关联收入金额
  commissionRate  Decimal? // 抽成比例
  commissionAmount Decimal? // Ami 贡献提成
  workMinutes     Int?     // 工时（分钟）
  occurredAt      DateTime @default(now())
  settleMonth     String   // "2026-06"
  metadata        Json?    // 扩展字段

  store    Store         @relation(fields: [storeId], references: [id])
  customer Customer?     @relation(fields: [customerId], references: [id])
  order    ProductOrder? @relation(fields: [orderId], references: [id])

  @@index([storeId, settleMonth])
  @@index([category])
}

// 数字员工月度账单
model AmiMonthlyBill {
  id             Int      @id @default(autoincrement())
  storeId        Int
  settleMonth    String   // "2026-06"
  baseFee        Decimal  // 基础工时费（月租）
  commissionFee  Decimal  // 提成费用
  totalFee       Decimal  // 总费用
  revenueGenerated Decimal // Ami 关联总收入
  roi            Decimal? // 投入产出比
  breakdown      Json     // 分类明细
  status         String   @default("draft") // "draft" | "confirmed" | "invoiced" | "paid"
  createdAt      DateTime @default(now())

  store Store @relation(fields: [storeId], references: [id])

  @@unique([storeId, settleMonth])
}
```

#### B4. Ami 贡献归因规则

```
营销转化归因：
  自动化策略执行 → 客户收到触达 → 7日内到店消费
  → 订单归因到该策略 → Ami 贡献 = 订单金额 × commissionRate(5-10%)

次卡续费归因：
  次卡余量≤2 → Ami 发送续费提醒 → 客户续费
  → Ami 贡献 = 续费金额 × commissionRate(3-5%)

流失挽回归因：
  流失预警（>21天） → Ami 自动触达 → 客户回店消费
  → Ami 贡献 = 消费金额 × commissionRate(8-12%)

工时类计费：
  每月固定 base fee = 门店选择的套餐档位
  工时统计：AI 调用次数 × 平均处理时长 → 换算为"数字工时"
```

#### B5. 定价建议

| 套餐 | 月租（基础工时费） | 提成规则 | 适合门店 |
|------|-------------------|----------|----------|
| 轻量版 | ¥299/月 | 营销转化 5% | 单店、月营收 <10 万 |
| 标准版 | ¥699/月 | 营销转化 8% + 挽回 10% | 2-5 店、月营收 10-50 万 |
| 旗舰版 | ¥1499/月 | 全品类 10-12% + 专属优化 | 连锁、月营收 >50 万 |

**封顶机制**：单月提成上限 = 月租 × 3（防止大额订单导致门店接受度低）

---

### 模块 C：收银对账与日结

#### C1. 数据模型

```prisma
// 收银班次
model CashierShift {
  id           Int       @id @default(autoincrement())
  storeId      Int
  deviceId     Int?      // 终端设备
  operatorId   Int       // 收银员（User 或 Beautician）
  operatorType String    // "user" | "beautician"
  startedAt    DateTime
  endedAt      DateTime?
  status       String    @default("open") // "open" | "closed" | "reconciled"
  openingCash  Decimal   @default(0) // 开班备用金
  closingCash  Decimal?  // 关班实收现金
  systemCash   Decimal?  // 系统应收现金
  cashDiff     Decimal?  // 差异
  summary      Json?     // 各支付方式汇总
  createdAt    DateTime  @default(now())

  store Store @relation(fields: [storeId], references: [id])

  @@index([storeId, startedAt])
}

// 门店日结
model DailySettlement {
  id               Int      @id @default(autoincrement())
  storeId          Int
  settleDate       DateTime // 具体日期
  totalRevenue     Decimal  // 总收入（实收）
  cashRevenue      Decimal  // 现金收入
  wechatRevenue    Decimal  // 微信
  alipayRevenue    Decimal  // 支付宝
  cardRevenue      Decimal  // 银行卡
  balanceRevenue   Decimal  // 储值消耗
  rechargeIncome   Decimal  // 充值收入
  refundAmount     Decimal  // 退款
  orderCount       Int      // 订单笔数
  customerCount    Int      // 消费客户数
  avgTransaction   Decimal  // 客单价
  materialCost     Decimal  // 物料成本（BOM）
  grossProfit      Decimal  // 毛利
  grossMargin      Decimal  // 毛利率
  commissionTotal  Decimal  // 提成合计
  status           String   @default("draft") // "draft" | "confirmed"
  confirmedBy      Int?
  confirmedAt      DateTime?
  createdAt        DateTime @default(now())

  store Store @relation(fields: [storeId], references: [id])

  @@unique([storeId, settleDate])
}
```

#### C2. 日结流程

```
每日凌晨 1:00 定时任务（或手动触发）：
  1. 统计当日所有 ProductOrder（by storeId + createdAt）
  2. 按 PaymentRecord.method 分组汇总金额
  3. 统计退款（RefundRecord）
  4. 计算物料成本（OrderItem × BOM标准量 × Product.costPrice）
  5. 汇总提成（CommissionRecord 当日 pending/confirmed）
  6. 写入 DailySettlement
```

#### C3. 现金对账

```
关班时：
  1. 收银员输入实际现金金额
  2. 系统计算应收现金 = 开班备用金 + 现金收入 - 现金退款 - 现金找零
  3. 差异 = 实收 - 应收
  4. 差异 > ±50 元时标记异常，通知门店管理员
```

---

### 模块 D：供应链结算与平台抽佣

#### D1. 商业模式

Ami 平台参与供应链有两种盈利路径：

**路径 1：集采返利（面向门店有感知）**

```
门店通过 Ami 下单 → Ami 集中采购 → 供应商给 Ami 返利 → 门店享受比自采更低的价格
  ● 门店视角：降本
  ● 平台收入：供应商返利（采购金额的 3-8%）
  ● 透明度：高（门店看到的就是最终价）
```

**路径 2：撮合服务费（面向门店透明）**

```
门店选品 → Ami 对接供应商 → 门店直接付款给供应商 → Ami 收取服务费
  ● 门店视角：信息撮合
  ● 平台收入：每笔交易服务费（1-3%）或年费
  ● 透明度：最高
```

**推荐**：初期用路径 1（集采返利），门店感知到价格优势；规模上来后叠加路径 2。

#### D2. 数据模型

```prisma
// 供应商
model Supplier {
  id           Int      @id @default(autoincrement())
  name         String
  contactName  String?
  phone        String?
  email        String?
  address      String?
  category     String?  // "skincare" | "instrument" | "consumable" | "equipment"
  rebateRate   Decimal? // 返利比例
  paymentTerms String?  // "月结30天" | "货到付款"
  status       String   @default("active")
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  products     ProductSupplier[]
  orders       SupplierOrder[]
  settlements  SupplierSettlement[]
}

// 产品-供应商关联（同一产品可有多个供应商）
model ProductSupplier {
  id           Int      @id @default(autoincrement())
  productId    Int
  supplierId   Int
  supplyPrice  Decimal  // 供货价
  moq          Int?     // 最小起订量
  leadDays     Int?     // 交货周期（天）
  isPrimary    Boolean  @default(false)
  createdAt    DateTime @default(now())

  product  Product  @relation(fields: [productId], references: [id])
  supplier Supplier @relation(fields: [supplierId], references: [id])

  @@unique([productId, supplierId])
}

// 供应商采购订单（升级现有 PurchaseOrder）
model SupplierOrder {
  id           Int      @id @default(autoincrement())
  orderNo      String   @unique
  supplierId   Int
  storeId      Int
  totalAmount  Decimal
  platformFee  Decimal  @default(0) // 平台服务费
  rebateAmount Decimal  @default(0) // 返利金额
  netAmount    Decimal  // 门店实付 = totalAmount - rebateAmount
  status       String   @default("pending") // "pending" | "confirmed" | "shipped" | "received" | "settled"
  orderedAt    DateTime @default(now())
  receivedAt   DateTime?
  settledAt    DateTime?

  supplier Supplier           @relation(fields: [supplierId], references: [id])
  store    Store              @relation(fields: [storeId], references: [id])
  items    SupplierOrderItem[]

  @@index([supplierId, status])
  @@index([storeId])
}

// 采购订单明细
model SupplierOrderItem {
  id            Int     @id @default(autoincrement())
  orderId       Int
  productId     Int
  quantity      Int
  unitPrice     Decimal // 采购单价
  subtotal      Decimal
  receivedQty   Int?    // 实收数量
  
  order   SupplierOrder @relation(fields: [orderId], references: [id], onDelete: Cascade)
  product Product       @relation(fields: [productId], references: [id])

  @@index([orderId])
}

// 供应商结算单
model SupplierSettlement {
  id             Int      @id @default(autoincrement())
  supplierId     Int
  settleMonth    String   // "2026-06"
  orderCount     Int
  totalAmount    Decimal  // 订单总额
  rebateAmount   Decimal  // 返利
  platformFee    Decimal  // 平台费
  netPayable     Decimal  // 应付供应商
  status         String   @default("draft") // "draft" | "confirmed" | "paid"
  createdAt      DateTime @default(now())

  supplier Supplier @relation(fields: [supplierId], references: [id])

  @@unique([supplierId, settleMonth])
}
```

#### D3. 抽佣计算

```
每笔供应商订单确认收货时：
  1. platformFee = totalAmount × platformFeeRate (1-3%)
  2. rebateAmount = totalAmount × supplier.rebateRate (3-8%)
  3. netAmount = totalAmount - rebateAmount (门店实付)
  4. 平台收入 = platformFee + rebateAmount

月度供应商结算：
  netPayable = sum(orderAmount) - sum(rebateAmount) - sum(platformFee)
```

#### D4. 门店感知

门店看到的价格体系：

| 对比维度 | 自采 | 通过 Ami 采购 |
|----------|------|--------------|
| 产品单价 | 供应商报价 | 集采优惠价（低 5-15%） |
| 配送 | 自行对接 | 平台统一物流 |
| 账期 | 各供应商不同 | 统一月结 |
| 预警补货 | 手动 | Ami 自动建议 |
| 门店关注点 | **比自己买更便宜** | |

---

## 五、平台盈利模型汇总

```
Ami 平台收入 = 数字员工订阅费 + 数字员工提成 + 供应链抽佣 + 增值服务

┌────────────────────────────────────────────────────────┐
│ 收入项            │ 模型           │ 单店月收入预估      │
├────────────────────────────────────────────────────────┤
│ 数字员工基础费     │ SaaS 月租       │ ¥299-1499         │
│ 数字员工业绩提成   │ 按转化金额抽成  │ ¥200-2000         │
│ 供应链集采返利     │ 采购额 3-8%    │ ¥300-1500         │
│ 供应链平台服务费   │ 采购额 1-3%    │ ¥100-500          │
│ 增值服务（培训等） │ 按需           │ ¥0-500            │
├────────────────────────────────────────────────────────┤
│ 单店综合月收入     │                │ ¥900-5999         │
└────────────────────────────────────────────────────────┘

标准版门店预估：
  月租 ¥699 + 提成 ¥800 + 供应链 ¥600 ≈ ¥2100/月/店
  100 店规模 → 年收入 ≈ ¥252 万
  1000 店规模 → 年收入 ≈ ¥2520 万
```

---

## 六、实施路线

### Phase 1：员工提成（4 周）

优先做：让美容师看到钱，让老板看到人效。

| 周 | 任务 |
|----|------|
| W1 | Schema 设计 + CommissionRule CRUD 接口 + 管理端规则配置页 |
| W2 | 提成计算引擎 + 订单/核销触发写入 CommissionRecord |
| W3 | 美容师端仪表盘（今日提成、月度累计、明细查询） |
| W4 | 月度结算单生成 + 管理端确认/导出流程 |

### Phase 2：收银对账（2 周）

| 周 | 任务 |
|----|------|
| W1 | CashierShift 模型 + 开班/关班 API + 终端班次管理 UI |
| W2 | DailySettlement 日结计算 + 管理端日结报表页面 |

### Phase 3：数字员工绩效（3 周）

| 周 | 任务 |
|----|------|
| W1 | AmiPerformanceRecord 模型 + 各贡献类型自动写入（挂接现有自动化/推荐流程） |
| W2 | AmiMonthlyBill 生成 + ROI 计算 + 管理端"数字员工绩效"页面 |
| W3 | 定价套餐配置 + 账单展示 + 老板可视化 |

### Phase 4：供应链（4 周）

| 周 | 任务 |
|----|------|
| W1 | Supplier 模型 + CRUD + 管理端供应商管理页 |
| W2 | ProductSupplier 关联 + SupplierOrder 替代旧 PurchaseOrder |
| W3 | 收货确认 + 自动入库 + 返利计算 |
| W4 | SupplierSettlement 月结 + 平台收入报表 |

---

## 七、与现有系统的集成点

### 7.1 提成写入触发点

| 现有流程 | 触发位置 | 写入内容 |
|----------|----------|----------|
| 终端收银 checkout | `terminal.service.ts` checkout 完成后 | project 类 → 项目提成；product 类 → 产品提成 |
| 次卡核销 | `terminal.service.ts` cardConsume 完成后 | 核销提成（按分摊规则） |
| 管理端开卡 | `orders.service.ts` createCardOrder 完成后 | 办卡提成 |
| 管理端/终端充值 | `orders.service.ts / terminal.service.ts` recharge 完成后 | 充值提成 |
| 新客首次消费 | checkout 时判断 `customer.visitCount === 0` | 新客提成 |

### 7.2 数字员工贡献写入触发点

| 现有流程 | 触发位置 | 写入内容 |
|----------|----------|----------|
| 自动化策略执行 | `terminal.service.ts` executeAutomation 完成后 | 记录 touch + 等待转化 |
| 营销归因确认 | `marketing.service.ts` applyAttribution 时 | 如有自动化来源 → 写 AmiPerformanceRecord |
| 流失预警触达 | 自动化策略 `churn_prevention` 执行后 + 客户回店 | 挽回贡献 |
| 次卡提醒 → 续费 | automation + 客户续费订单 | 续费贡献 |
| AI 收银辅助 | 终端 checkout `source: 'terminal'` | 累计工时 |

### 7.3 供应链与现有库存集成

| 现有功能 | 改造点 |
|----------|--------|
| `PurchaseOrder` | 升级为 `SupplierOrder`，增加供应商关联和结算字段 |
| `Product.supplier` (string) | 改为 `ProductSupplier` 多对多关联 |
| `Product.costPrice` | 取 `ProductSupplier.supplyPrice`（primarySupplier） |
| 补货建议 `getReplenishment()` | 从 `ProductSupplier` 取价格和 MOQ |
| 入库 `inbound` | 关联 `SupplierOrder`，确认收货更新结算 |

---

## 八、关键设计决策

### Q1：提成按"收款"还是"服务交付"算？

**推荐：服务交付时确认**。

理由：
- 储值充值 → 充值时就给提成（行业惯例，因为拓客/锁客是关键动作）
- 次卡消耗 → 核销时给提成（激励做好服务，否则卖卡不做服务）
- 项目现付 → 服务完成时给提成（同上）

### Q2：数字员工"提成"如何让门店接受？

**关键策略**：

1. **ROI 可视化**：每月账单明确展示"Ami 帮你赚了多少 → 收你多少"，ROI > 5:1 为健康
2. **对比基线**：上线前 30 天为基线，之后的增量才计入 Ami 贡献
3. **封顶机制**：单月提成不超过月租 × 3，降低门店心理负担
4. **免费试用**：首月免提成，只收基础月租，让门店看到效果

### Q3：平台何时开始供应链抽佣？

**推荐：100 店规模后启动**。

理由：
- <100 店：采购量太小，无法从供应商拿到好价格
- 100-500 店：集采有议价空间，可以做到比门店自采便宜 5-10%
- >500 店：可以自建品牌贴牌，毛利进一步提升

---

## 九、数据安全与合规

| 关注点 | 措施 |
|--------|------|
| 财务数据不可篡改 | PaymentRecord / CommissionRecord 只增不改，修正用新记录对冲 |
| 提成争议可追溯 | CommissionRecord 记录完整 ruleId + sourceAmount + rate，可回溯 |
| 供应商价格保密 | `ProductSupplier.supplyPrice` 仅 admin 可见，美容师/前台不可见 |
| 日结金额确认 | DailySettlement 需门店管理员签字确认（`confirmedBy`） |
| 平台费透明 | AmiMonthlyBill 完整展示计算过程，门店可复核 |

---

## 十、前端页面规划

### 管理端新增页面

| 路由 | 页面名 | 权限 |
|------|--------|------|
| `/finance/daily-settlement` | 日结报表 | `core:finance:view` |
| `/finance/commission-rules` | 提成规则配置 | `core:finance:manage` |
| `/finance/commission-records` | 提成明细 | `core:finance:view` |
| `/finance/monthly-settlement` | 月度结算 | `core:finance:manage` |
| `/finance/ami-performance` | 数字员工绩效 | `core:finance:view` |
| `/finance/ami-billing` | 数字员工账单 | `core:finance:view` |
| `/supply-chain/suppliers` | 供应商管理 | `core:supply:manage` |
| `/supply-chain/orders` | 采购订单 | `core:supply:view` |
| `/supply-chain/settlements` | 供应商结算 | `core:supply:manage` |

### 终端新增场景

| 角色 | 新增卡片/指标 |
|------|-------------|
| 美容师 | 今日提成、月累计、提成明细 |
| 前台 | 班次收银汇总、现金应收 |
| 店长 | 今日毛利、人效排名、数字员工贡献 |

---

## 附录：美业提成规则参考

### 常见提成比例

| 类型 | 初级美容师 | 中级美容师 | 高级美容师/顾问 |
|------|-----------|-----------|---------------|
| 项目（指定） | 35-40% | 40-45% | 45-50% |
| 项目（非指定） | 25-30% | 30-35% | 35-40% |
| 产品零售 | 10-15% | 15-20% | 20-25% |
| 办卡/续卡 | 3-5% | 5-8% | 8-10% |
| 储值充值 | 2-3% | 3-5% | 5-8% |
| 新客首次消费 | 固定 ¥20-50 | 固定 ¥30-80 | 固定 ¥50-100 |

### 特殊规则

- **团队提成**：2人以上协作完成的项目，按分工比例拆分
- **阶梯提成**：月累计超过 X 万后，比例上调 5%
- **扣减项**：客户投诉扣提成、耗材超标扣差额、迟到早退扣固定金额
- **保底机制**：月提成 < ¥2000 时补齐到保底线（吸引新人入职）
