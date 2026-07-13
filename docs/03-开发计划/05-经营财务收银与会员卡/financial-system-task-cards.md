# 财务体系开发 — 任务卡清单

版本：v1.0
日期：2026-06-08
来源文档：`docs/financial-system-design.md`
任务管理方式：每张卡可独立分配、独立交付、独立验收

---

## Phase 1：员工提成系统（4 周）

---

### FIN-101：提成规则 Schema + 迁移

| 字段 | 内容 |
|------|------|
| **优先级** | P0 |
| **预估工时** | 1 天 |
| **分配建议** | 后端 |
| **依赖** | 无 |

**描述**：
在 Prisma schema 中新增 `CommissionRule`、`CommissionRecord`、`CommissionSettlement` 三张表，并运行迁移。

**涉及文件**：
- `packages/server-v2/prisma/schema.prisma`

**具体步骤**：

1. 新增 `CommissionRule` 模型：

```prisma
model CommissionRule {
  id              Int      @id @default(autoincrement())
  storeId         Int
  name            String
  type            String   // "project" | "product" | "card_sale" | "recharge" | "new_customer"
  targetType      String   @default("all") // "all" | "category" | "specific"
  targetId        Int?
  levelId         Int?
  rate            Decimal
  fixedAmount     Decimal?
  calcBase        String   @default("total") // "total" | "service_fee" | "profit"
  isDesignated    Boolean  @default(false)
  designatedBonus Decimal?
  minThreshold    Decimal?
  status          String   @default("active")
  priority        Int      @default(0)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  store Store           @relation(fields: [storeId], references: [id])
  level BeauticianLevel? @relation(fields: [levelId], references: [id])

  @@index([storeId, type, status])
}
```

2. 新增 `CommissionRecord` 模型：

```prisma
model CommissionRecord {
  id             Int       @id @default(autoincrement())
  storeId        Int
  beauticianId   Int
  orderId        Int?
  orderItemId    Int?
  ruleId         Int?
  type           String
  sourceAmount   Decimal
  rate           Decimal
  amount         Decimal
  status         String   @default("pending") // "pending" | "confirmed" | "settled" | "cancelled"
  settleMonth    String?
  confirmedAt    DateTime?
  settledAt      DateTime?
  remark         String?
  createdAt      DateTime @default(now())

  store      Store        @relation(fields: [storeId], references: [id])
  beautician Beautician   @relation(fields: [beauticianId], references: [id])
  order      ProductOrder? @relation(fields: [orderId], references: [id])

  @@index([beauticianId, settleMonth])
  @@index([storeId, status])
  @@index([orderId])
}
```

3. 新增 `CommissionSettlement` 模型：

```prisma
model CommissionSettlement {
  id             Int       @id @default(autoincrement())
  storeId        Int
  beauticianId   Int
  settleMonth    String
  projectAmount  Decimal   @default(0)
  productAmount  Decimal   @default(0)
  cardSaleAmount Decimal   @default(0)
  rechargeAmount Decimal   @default(0)
  otherAmount    Decimal   @default(0)
  totalAmount    Decimal   @default(0)
  deductions     Decimal   @default(0)
  netAmount      Decimal   @default(0)
  status         String    @default("draft") // "draft" | "confirmed" | "paid"
  confirmedBy    Int?
  confirmedAt    DateTime?
  paidAt         DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  store      Store      @relation(fields: [storeId], references: [id])
  beautician Beautician @relation(fields: [beauticianId], references: [id])

  @@unique([storeId, beauticianId, settleMonth])
}
```

4. 在 `Beautician` 和 `BeauticianLevel` 中添加 relations。
5. 运行 `npx prisma migrate dev --name add-commission-tables`。
6. 运行 `npx prisma generate`。

**验收标准**：
- [ ] 迁移成功，数据库新增三张表
- [ ] `npx tsc` 编译通过
- [ ] Prisma Client 可正常访问新模型

---

### FIN-102：提成规则 CRUD 接口 + 管理页面

| 字段 | 内容 |
|------|------|
| **优先级** | P0 |
| **预估工时** | 3 天 |
| **分配建议** | 全栈 |
| **依赖** | FIN-101 |

**描述**：
新建 `CommissionModule`，实现提成规则 CRUD；管理端新增规则配置页面。

**涉及文件**：
- `packages/server-v2/src/commission/`（新建模块）
  - `commission.module.ts`
  - `commission.controller.ts`
  - `commission.service.ts`
  - `dto/create-commission-rule.dto.ts`
  - `dto/update-commission-rule.dto.ts`
- `packages/server-v2/src/app.module.ts`（注册 CommissionModule）
- `src/app/pages/finance/CommissionRules.tsx`（新建）
- `src/api/real/commission.ts`（新建）
- `src/api/commission.ts`（新建）
- `src/app/routes.tsx`（注册路由）
- `src/app/components/Layout.tsx`（菜单入口）

**具体步骤**：

1. 后端新建 `commission` 模块：

```typescript
// commission.controller.ts
@Controller('commission')
export class CommissionController {
  @Get('rules')          // 规则列表（分页 + storeId 筛选）
  @Get('rules/:id')      // 规则详情
  @Post('rules')         // 创建规则
  @Put('rules/:id')      // 更新规则
  @Delete('rules/:id')   // 删除规则
  @Post('rules/batch')   // 批量导入（行业模板）
}
```

2. DTO 设计：

```typescript
export class CreateCommissionRuleDto {
  @IsString() name: string;
  @IsString() type: string; // project | product | card_sale | recharge | new_customer
  @IsString() @IsOptional() targetType?: string;
  @IsInt() @IsOptional() targetId?: number;
  @IsInt() @IsOptional() levelId?: number;
  @IsNumber() rate: number;
  @IsNumber() @IsOptional() fixedAmount?: number;
  @IsString() @IsOptional() calcBase?: string;
  @IsBoolean() @IsOptional() isDesignated?: boolean;
  @IsNumber() @IsOptional() designatedBonus?: number;
  @IsNumber() @IsOptional() minThreshold?: number;
  @IsInt() @IsOptional() priority?: number;
}
```

3. Service 实现：
   - `getRules(storeId, filters)` → 分页查询，支持按 type/levelId/status 筛选
   - `createRule(storeId, dto)` → 创建，验证 levelId/targetId 存在性
   - `updateRule(id, dto)` → 更新
   - `deleteRule(id)` → 软删（status → archived）
   - `batchCreateFromTemplate(storeId, template)` → 按行业模板批量创建

4. 在 `app.module.ts` 注册 `CommissionModule`。

5. 前端新建 `/finance/commission-rules` 页面：
   - 规则列表表格（类型/名称/等级/比例/状态）
   - 创建/编辑弹窗
   - 行业模板一键导入按钮（预置美业常见比例）
   - 按美容师等级分组展示

6. 菜单"财务管理"下新增"提成规则"入口。

7. 路由注册 `finance/commission-rules`，权限 `core:finance:manage`。

**验收标准**：
- [ ] 管理端可创建/编辑/删除提成规则
- [ ] 规则支持按等级、项目类型、指定/非指定区分
- [ ] 行业模板导入后自动创建多条规则
- [ ] 后端 `npx tsc` 通过
- [ ] 前端 `npm run build` 通过

---

### FIN-103：提成计算引擎

| 字段 | 内容 |
|------|------|
| **优先级** | P0 |
| **预估工时** | 3 天 |
| **分配建议** | 后端 |
| **依赖** | FIN-101, FIN-102 |

**描述**：
实现核心提成计算逻辑，在订单完成、次卡核销等触发点自动生成 `CommissionRecord`。

**涉及文件**：
- `packages/server-v2/src/commission/commission.service.ts`（新增计算方法）
- `packages/server-v2/src/orders/orders.service.ts`（挂载触发点）
- `packages/server-v2/src/terminal/terminal.service.ts`（挂载触发点）
- `packages/server-v2/src/cards/cards.service.ts`（挂载触发点）

**具体步骤**：

1. 在 `CommissionService` 新增核心方法：

```typescript
async calculateCommission(params: {
  storeId: number;
  beauticianId: number;
  orderId?: number;
  orderItemId?: number;
  type: 'project' | 'product' | 'card_sale' | 'recharge' | 'new_customer';
  itemId?: number;         // project/product/card id
  categoryId?: number;
  sourceAmount: number;    // 计算基数
  isDesignated?: boolean;
  levelId?: number;
}): Promise<CommissionRecord | null>
```

2. 规则匹配逻辑：

```
查找适用规则：
  WHERE storeId = params.storeId
    AND type = params.type
    AND status = 'active'
    AND (targetType = 'all'
         OR (targetType = 'category' AND targetId = params.categoryId)
         OR (targetType = 'specific' AND targetId = params.itemId))
    AND (levelId IS NULL OR levelId = params.levelId)
  ORDER BY priority DESC, targetType DESC
  LIMIT 1

如有匹配规则：
  base = sourceAmount（按 calcBase 可选取不同基数）
  commission = fixedAmount ?? (base × rate)
  如 isDesignated && rule.isDesignated：
    commission = commission × (1 + designatedBonus)
  如 commission < minThreshold：跳过

  写入 CommissionRecord
```

3. 新增批量计算方法（处理一个订单的所有 items）：

```typescript
async calculateOrderCommissions(params: {
  storeId: number;
  orderId: number;
  beauticianId: number;
  levelId?: number;
  isDesignated?: boolean;
  items: Array<{ itemType: string; itemId?: number; categoryId?: number; subtotal: number; orderItemId?: number }>;
}): Promise<CommissionRecord[]>
```

4. 挂载触发点：

**终端收银** (`terminal.service.ts` checkout 完成后，约 line 2767)：

```typescript
// 在 applyMarketingAttribution 之后
if (dto.beauticianId) {
  await this.commissionService.calculateOrderCommissions({
    storeId,
    orderId: result.order.id,
    beauticianId: dto.beauticianId,
    levelId: beautician?.levelId,
    isDesignated: dto.isDesignated ?? false,
    items: normalizedItems,
  });
}
```

**管理端订单** (`orders.service.ts` createProductOrder 完成后，约 line 466)：

```typescript
if (data.beauticianId) {
  await this.commissionService.calculateOrderCommissions({
    storeId: data.storeId,
    orderId: order.id,
    beauticianId: data.beauticianId,
    levelId: data.levelId,
    isDesignated: data.isDesignated ?? false,
    items: orderItems,
  });
}
```

**次卡核销** (`terminal.service.ts` consumeCard 完成后，约 line 2673)：

```typescript
if (beauticianId) {
  await this.commissionService.calculateCommission({
    storeId: device.storeId,
    beauticianId,
    type: 'project',
    itemId: dto.projectId,
    sourceAmount: cardUnitPrice, // 卡项目单次价值 = card.price / card.totalTimes
    isDesignated: false,
  });
}
```

**充值** (`terminal.service.ts` createRechargeOrder 完成后，约 line 3033)：

```typescript
if (dto.beauticianId) {
  await this.commissionService.calculateCommission({
    storeId,
    beauticianId: dto.beauticianId,
    orderId: result.order.id,
    type: 'recharge',
    sourceAmount: dto.amount,
  });
}
```

5. 退款时反转提成：

在 `orders.service.ts` refundOrder 中（约 line 590）：

```typescript
await this.commissionService.reverseOrderCommissions(id, refundAmount);
```

**验收标准**：
- [ ] 终端收银后自动生成提成记录（status: 'pending'）
- [ ] 次卡核销后自动生成项目提成
- [ ] 充值后自动生成充值提成
- [ ] 退款后对应提成记录标为 'cancelled'
- [ ] 规则匹配优先级正确（specific > category > all）
- [ ] 无适用规则时不生成记录，不报错
- [ ] 后端 `npm run test` 通过

---

### FIN-104：提成明细查询接口 + 管理页面

| 字段 | 内容 |
|------|------|
| **优先级** | P0 |
| **预估工时** | 2 天 |
| **分配建议** | 全栈 |
| **依赖** | FIN-103 |

**描述**：
提成流水查询接口 + 管理端提成明细页面，支持按美容师/月份/类型筛选。

**涉及文件**：
- `packages/server-v2/src/commission/commission.controller.ts`（新增接口）
- `packages/server-v2/src/commission/commission.service.ts`（新增查询方法）
- `src/app/pages/finance/CommissionRecords.tsx`（新建）
- `src/app/routes.tsx`

**具体步骤**：

1. 后端新增接口：

```typescript
@Get('records/paginated')  // 提成流水分页（筛选：beauticianId/type/status/settleMonth）
@Get('records/summary')    // 按美容师汇总（月度）
@Put('records/:id/confirm')  // 确认提成
@Put('records/batch-confirm') // 批量确认
```

2. 前端新建 `/finance/commission-records` 页面：
   - 顶部：月份选择器 + 美容师筛选 + 类型筛选
   - 汇总卡片：当月总提成、待确认金额、已确认金额
   - 明细表格：日期/客户/项目/类型/金额基数/比例/提成额/状态
   - 支持导出 Excel
   - 批量确认操作

3. 路由注册 `finance/commission-records`，权限 `core:finance:view`。

**验收标准**：
- [ ] 管理端可按月份/美容师查看提成明细
- [ ] 支持批量确认操作
- [ ] 汇总数据准确
- [ ] 支持 Excel 导出

---

### FIN-105：月度结算单生成 + 确认流程

| 字段 | 内容 |
|------|------|
| **优先级** | P1 |
| **预估工时** | 2 天 |
| **分配建议** | 全栈 |
| **依赖** | FIN-104 |

**描述**：
按月汇总每位美容师的提成，生成结算单，支持确认和导出。

**涉及文件**：
- `packages/server-v2/src/commission/commission.controller.ts`
- `packages/server-v2/src/commission/commission.service.ts`
- `src/app/pages/finance/MonthlySettlement.tsx`（新建）

**具体步骤**：

1. 后端新增接口：

```typescript
@Post('settlements/generate')     // 生成指定月份结算单
@Get('settlements/paginated')     // 结算单列表
@Get('settlements/:id')           // 结算单详情
@Put('settlements/:id/confirm')   // 确认结算
@Put('settlements/:id/mark-paid') // 标记已发放
@Get('settlements/export')        // 导出工资表
```

2. 结算单生成逻辑：

```typescript
async generateSettlement(storeId: number, settleMonth: string) {
  // 1. 查找该月所有 confirmed 状态的 CommissionRecord
  // 2. 按 beauticianId 分组汇总
  // 3. 按 type 分别统计金额
  // 4. upsert CommissionSettlement
  // 5. 返回生成结果
}
```

3. 前端 `/finance/monthly-settlement` 页面：
   - 月份选择 + "生成结算单"按钮
   - 结算单列表：美容师/项目提成/产品提成/办卡/充值/合计/扣款/实发/状态
   - 确认 + 标记已发放操作
   - 导出为工资表 Excel

**验收标准**：
- [ ] 一键生成指定月份所有美容师结算单
- [ ] 结算金额 = 该月已确认提成汇总
- [ ] 支持确认 → 已发放状态流转
- [ ] 导出 Excel 包含所有字段

---

### FIN-106：美容师端提成仪表盘

| 字段 | 内容 |
|------|------|
| **优先级** | P0 |
| **预估工时** | 2 天 |
| **分配建议** | 前端（Kiosk） |
| **依赖** | FIN-103 |

**描述**：
Kiosk 终端美容师角色仪表盘新增提成数据展示。

**涉及文件**：
- `packages/server-v2/src/commission/commission.controller.ts`（新增终端查询接口）
- `packages/server-v2/src/terminal/terminal.controller.ts`（或直接用 commission 接口）
- `packages/Ami-Aura-Lite-Kiosk/src/app/components/RoleDashboards.tsx`
- `packages/Ami-Aura-Lite-Kiosk/src/app/services/auraCoreService.ts`

**具体步骤**：

1. 后端新增接口（无需 JWT，用设备鉴权）：

```typescript
@Get('records/beautician-summary') // 美容师个人汇总
// params: beauticianId, period('today' | 'month')
// returns: { todayAmount, monthAmount, todayCount, monthCount, recentRecords[] }
```

2. Kiosk `auraCoreService.ts` 新增：

```typescript
async getBeauticianCommission(beauticianId: number): Promise<CommissionSummary>
```

3. 美容师仪表盘新增卡片区：
   - 今日提成（实时累计，含待确认）
   - 本月累计（已确认 + 待确认分开展示）
   - 最近 5 笔提成明细（客户名/项目/金额）
   - 点击查看完整月度明细列表

4. 仪表盘快捷指令增加"我的提成"意图关键词。

**验收标准**：
- [ ] 美容师登录 Kiosk 后可看到今日/本月提成
- [ ] 每完成一单后提成实时更新
- [ ] 提成明细可点击展开查看

---

### FIN-107：提成单元测试

| 字段 | 内容 |
|------|------|
| **优先级** | P1 |
| **预估工时** | 1.5 天 |
| **分配建议** | 后端 |
| **依赖** | FIN-103 |

**描述**：
为提成计算引擎编写完整的单元测试，覆盖规则匹配、金额计算、边界条件。

**涉及文件**：
- `packages/server-v2/src/commission/commission.service.spec.ts`（新建）

**具体步骤**：

1. 测试用例覆盖：
   - 基本规则匹配（type + targetType + levelId）
   - 优先级排序（specific > category > all）
   - 指定美容师加成计算
   - 固定金额 vs 比例金额
   - minThreshold 过滤
   - 无匹配规则时返回 null
   - 退款反转逻辑
   - 次卡单次价值计算（card.price / totalTimes）
   - 结算单生成汇总准确性

**验收标准**：
- [ ] 测试覆盖率 > 85%
- [ ] `npm run test` 全部通过
- [ ] 边界条件（金额为 0、规则为空、美容师不存在）全覆盖

---

## Phase 2：收银对账与日结（2 周）

---

### FIN-201：收银班次 Schema + 日结模型

| 字段 | 内容 |
|------|------|
| **优先级** | P0 |
| **预估工时** | 0.5 天 |
| **分配建议** | 后端 |
| **依赖** | 无 |

**描述**：
新增 `CashierShift` 和 `DailySettlement` 模型。

**涉及文件**：
- `packages/server-v2/prisma/schema.prisma`

**具体步骤**：

1. 新增 `CashierShift` 模型（字段见设计文档）。
2. 新增 `DailySettlement` 模型（字段见设计文档）。
3. 运行 `npx prisma migrate dev --name add-cashier-shift-daily-settlement`。

**验收标准**：
- [ ] 迁移成功
- [ ] `npx tsc` 编译通过

---

### FIN-202：班次管理接口 + 终端 UI

| 字段 | 内容 |
|------|------|
| **优先级** | P0 |
| **预估工时** | 3 天 |
| **分配建议** | 全栈（后端 + Kiosk） |
| **依赖** | FIN-201 |

**描述**：
实现开班/关班 API，Kiosk 前台角色集成班次管理。

**涉及文件**：
- `packages/server-v2/src/commission/commission.controller.ts`（或新建 cashier 子模块）
- `packages/server-v2/src/commission/commission.service.ts`
- `packages/Ami-Aura-Lite-Kiosk/src/app/components/`（新建 ShiftCard）
- `packages/Ami-Aura-Lite-Kiosk/src/app/services/auraCoreService.ts`

**具体步骤**：

1. 后端新增接口：

```typescript
@Post('shifts/open')    // 开班（传入 openingCash）
@Post('shifts/close')   // 关班（传入 closingCash）
@Get('shifts/current')  // 当前班次状态
@Get('shifts/history')  // 班次历史
```

2. 关班计算逻辑：

```typescript
async closeShift(shiftId: number, closingCash: number) {
  // 统计该班次时间段内所有 PaymentRecord
  // systemCash = openingCash + 现金收入 - 现金退款
  // cashDiff = closingCash - systemCash
  // summary: { cash, wechat, alipay, card, member_balance }
  // 更新 CashierShift
}
```

3. Kiosk 前台角色：
   - 登录后检查是否已开班，未开班则弹出开班卡片
   - 开班输入备用金金额
   - 顶部状态栏显示"当前班次 HH:MM 起"
   - 关班按钮 → 输入实收现金 → 显示差异 → 确认关班
   - 关班后显示班次汇总卡片

4. 差异预警：`|cashDiff| > 50` 时标红并发通知给门店管理员。

**验收标准**：
- [ ] 前台开班后才能进行收银
- [ ] 关班时系统自动计算应收现金
- [ ] 现金差异超标时有明显提醒
- [ ] 班次汇总含各支付方式金额统计

---

### FIN-203：日结自动计算 + 管理端报表

| 字段 | 内容 |
|------|------|
| **优先级** | P0 |
| **预估工时** | 3 天 |
| **分配建议** | 全栈 |
| **依赖** | FIN-201, FIN-103 |

**描述**：
实现每日自动结算 + 管理端日结报表页面。

**涉及文件**：
- `packages/server-v2/src/commission/commission.service.ts`（日结方法）
- `packages/server-v2/src/commission/commission.controller.ts`（日结接口）
- `src/app/pages/finance/DailySettlement.tsx`（新建）
- `src/app/routes.tsx`

**具体步骤**：

1. 后端日结计算方法：

```typescript
async generateDailySettlement(storeId: number, date: Date) {
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);

  // 1. 统计当日 ProductOrder（storeId + createdAt in range）
  // 2. 按 PaymentRecord.method 分组汇总
  // 3. 统计 RefundRecord 金额
  // 4. 计算物料成本（OrderItem join ProjectBomItem join Product.costPrice）
  // 5. 汇总当日 CommissionRecord
  // 6. 计算毛利 = totalRevenue - materialCost
  // 7. 毛利率 = grossProfit / totalRevenue
  // 8. 客单价 = totalRevenue / customerCount
  // 9. upsert DailySettlement
}
```

2. 定时任务：每日凌晨 1:00 自动为所有门店生成前一天日结（使用 `@nestjs/schedule`）。

3. 后端接口：

```typescript
@Get('daily-settlements')       // 日结列表（storeId + 日期范围）
@Post('daily-settlements/generate') // 手动触发日结
@Put('daily-settlements/:id/confirm') // 确认日结
```

4. 前端 `/finance/daily-settlement` 页面：
   - 日历选择器 + 门店选择
   - 日结卡片：总收入 / 现金 / 微信 / 支付宝 / 储值消耗 / 退款
   - 关键指标：订单数 / 客户数 / 客单价 / 毛利率
   - 趋势图（近 7 日 / 30 日折线图）
   - 确认按钮

**验收标准**：
- [ ] 定时任务凌晨自动生成日结
- [ ] 各支付方式金额与 PaymentRecord 汇总一致
- [ ] 物料成本基于 BOM 标准量 × 成本价计算
- [ ] 管理端可查看历史日结并确认
- [ ] 支持手动重新计算

---

### FIN-204：OrderItem 增加 beauticianId

| 字段 | 内容 |
|------|------|
| **优先级** | P0 |
| **预估工时** | 1 天 |
| **分配建议** | 后端 |
| **依赖** | 无 |

**描述**：
当前 `OrderItem` 无 `beauticianId`，无法精确到明细级别计算提成。需要在订单明细中记录服务美容师。

**涉及文件**：
- `packages/server-v2/prisma/schema.prisma`（OrderItem 加 beauticianId）
- `packages/server-v2/src/terminal/terminal.service.ts`（checkout 写 OrderItem 时携带）
- `packages/server-v2/src/orders/orders.service.ts`（createProductOrder 写 OrderItem 时携带）

**具体步骤**：

1. Schema 新增：`beauticianId Int?` on `OrderItem`。
2. 迁移。
3. Terminal checkout `createOrderItems` 传入 `dto.beauticianId` 或 item 级别的 beauticianId。
4. Admin createProductOrder 同样透传。

**验收标准**：
- [ ] OrderItem 可记录服务美容师
- [ ] 多美容师协作时每个 item 可单独记录

---

## Phase 3：数字员工绩效（3 周）

---

### FIN-301：Ami 绩效 Schema + 迁移

| 字段 | 内容 |
|------|------|
| **优先级** | P0 |
| **预估工时** | 0.5 天 |
| **分配建议** | 后端 |
| **依赖** | 无 |

**描述**：
新增 `AmiPerformanceRecord` 和 `AmiMonthlyBill` 模型。

**涉及文件**：
- `packages/server-v2/prisma/schema.prisma`

**具体步骤**：

1. 新增两个模型（字段见设计文档）。
2. 运行迁移。

**验收标准**：
- [ ] 迁移成功
- [ ] `npx tsc` 通过

---

### FIN-302：营销转化自动归因写入

| 字段 | 内容 |
|------|------|
| **优先级** | P0 |
| **预估工时** | 2 天 |
| **分配建议** | 后端 |
| **依赖** | FIN-301 |

**描述**：
在现有营销归因流程中，当订单被归因到自动化策略时，同步写入 `AmiPerformanceRecord`。

**涉及文件**：
- `packages/server-v2/src/orders/orders.service.ts`（applyMarketingAttribution 内）
- `packages/server-v2/src/terminal/terminal.service.ts`（applyMarketingAttribution 内）
- `packages/server-v2/src/commission/commission.service.ts`（新增 Ami 绩效写入方法）

**具体步骤**：

1. 在 `CommissionService`（或新建 `AmiPerformanceService`）新增：

```typescript
async recordAmiContribution(params: {
  storeId: number;
  category: string;      // marketing_conversion | churn_recovery | card_renewal ...
  triggerType: string;   // automation | recommendation | reminder
  triggerId?: number;    // automationTouchId or executionId
  customerId?: number;
  orderId?: number;
  revenueAmount?: number;
  commissionRate?: number;
}) {
  const commissionAmount = (params.revenueAmount ?? 0) * (params.commissionRate ?? 0.08);
  const settleMonth = format(new Date(), 'yyyy-MM');

  await this.prisma.amiPerformanceRecord.create({
    data: { ...params, commissionAmount, settleMonth },
  });
}
```

2. 挂载到 `applyMarketingAttribution`：

```typescript
// orders.service.ts line ~172, 归因成功后
await this.commissionService.recordAmiContribution({
  storeId: order.storeId,
  category: 'marketing_conversion',
  triggerType: 'automation',
  triggerId: touch.id,
  customerId: order.customerId,
  orderId: order.id,
  revenueAmount: amount,
  commissionRate: 0.08, // 从门店套餐配置读取
});
```

3. 同样挂载到 terminal 的 `applyMarketingAttribution`。

4. 流失挽回场景：在归因时判断 touch 类型为 `churn_prevention`，category 用 `churn_recovery`，commissionRate 用 0.10。

**验收标准**：
- [ ] 自动化策略带来的订单转化后自动写入 AmiPerformanceRecord
- [ ] 不同 category 使用不同 commissionRate
- [ ] 无归因的订单不产生 Ami 绩效记录

---

### FIN-303：Ami 工时类贡献自动记录

| 字段 | 内容 |
|------|------|
| **优先级** | P1 |
| **预估工时** | 1.5 天 |
| **分配建议** | 后端 |
| **依赖** | FIN-301 |

**描述**：
对"收银辅助""库存预警""智能排班"等工时类贡献进行自动统计。

**涉及文件**：
- `packages/server-v2/src/terminal/terminal.service.ts`（checkout 后累计）
- `packages/server-v2/src/inventory/inventory.service.ts`（预警触发后）
- `packages/server-v2/src/scheduling/scheduling.service.ts`（排班生成后）
- `packages/server-v2/src/commission/commission.service.ts`

**具体步骤**：

1. 收银辅助：终端每完成一次 checkout，记录 `workMinutes: 2`（预估单笔处理时间）。

2. 库存预警：`getReplenishment()` 返回预警结果时，记录 `workMinutes: 5`（分析 + 建议时间）。

3. 智能排班：`generateSchedule()` 完成后，记录 `workMinutes: 15`。

4. 去重：同一 triggerId + category 24 小时内不重复记录。

**验收标准**：
- [ ] 终端收银后自动累计 Ami 工时
- [ ] 库存预警触发后有记录
- [ ] 同一触发源 24 小时内不重复

---

### FIN-304：Ami 月度账单生成 + 页面

| 字段 | 内容 |
|------|------|
| **优先级** | P0 |
| **预估工时** | 3 天 |
| **分配建议** | 全栈 |
| **依赖** | FIN-302, FIN-303 |

**描述**：
按月汇总 Ami 贡献，生成账单并在管理端展示。

**涉及文件**：
- `packages/server-v2/src/commission/commission.service.ts`
- `packages/server-v2/src/commission/commission.controller.ts`
- `src/app/pages/finance/AmiPerformance.tsx`（新建）
- `src/app/pages/finance/AmiBilling.tsx`（新建）
- `src/app/routes.tsx`

**具体步骤**：

1. 后端月度账单生成：

```typescript
async generateAmiMonthlyBill(storeId: number, settleMonth: string) {
  const records = await this.prisma.amiPerformanceRecord.findMany({
    where: { storeId, settleMonth },
  });

  // 分类汇总
  const breakdown = groupBy(records, 'category');
  const commissionFee = sum(records.map(r => r.commissionAmount));
  const baseFee = getStorePlanBaseFee(storeId); // 从门店套餐配置
  const totalFee = baseFee + commissionFee;
  const revenueGenerated = sum(records.map(r => r.revenueAmount));
  const roi = totalFee > 0 ? revenueGenerated / totalFee : 0;

  // upsert AmiMonthlyBill
}
```

2. 后端接口：

```typescript
@Get('ami/performance')        // Ami 绩效记录列表
@Get('ami/bills')              // 账单列表
@Get('ami/bills/:month')       // 月度账单详情
@Post('ami/bills/generate')    // 手动生成账单
@Get('ami/dashboard')          // Ami 贡献仪表盘数据
```

3. 前端 `/finance/ami-performance` 页面：
   - 概览卡片：本月贡献收入 / Ami 费用 / ROI 倍数
   - 贡献分类饼图（营销转化/流失挽回/收银辅助等占比）
   - 贡献明细列表（可按 category 筛选）
   - 趋势图：近 6 个月 ROI 变化

4. 前端 `/finance/ami-billing` 页面：
   - 月度账单列表
   - 账单详情（基础费 + 提成费明细 + ROI 展示）
   - 历史账单对比

**验收标准**：
- [ ] 月度账单自动生成，金额可追溯到每条记录
- [ ] ROI 正确计算：关联收入 / Ami 总费用
- [ ] 管理端页面清晰展示贡献分类和 ROI
- [ ] 账单封顶机制生效（提成 ≤ 月租 × 3）

---

### FIN-305：店长仪表盘集成 Ami 贡献

| 字段 | 内容 |
|------|------|
| **优先级** | P1 |
| **预估工时** | 1 天 |
| **分配建议** | 前端（Kiosk） |
| **依赖** | FIN-304 |

**描述**：
Kiosk 店长角色仪表盘新增"数字员工贡献"卡片。

**涉及文件**：
- `packages/Ami-Aura-Lite-Kiosk/src/app/components/RoleDashboards.tsx`
- `packages/Ami-Aura-Lite-Kiosk/src/app/services/auraCoreService.ts`

**具体步骤**：

1. `auraCoreService` 新增 `getAmiDashboard(storeId)` 调用。
2. 店长仪表盘新增卡片：
   - 本月 Ami 关联收入
   - 本月 Ami 费用
   - ROI（倍数，用绿/黄/红色标识）
   - "查看详情"跳转到管理端

**验收标准**：
- [ ] 店长登录终端可看到 Ami 贡献概览
- [ ] ROI ≥ 5 绿色，3-5 黄色，< 3 红色

---

## Phase 4：供应链结算（4 周）

---

### FIN-401：Supplier 模型 + 管理页面

| 字段 | 内容 |
|------|------|
| **优先级** | P0 |
| **预估工时** | 2 天 |
| **分配建议** | 全栈 |
| **依赖** | 无 |

**描述**：
新增正式的 `Supplier` 模型，替代 Product 上的 string 字段。管理端新增供应商管理页面。

**涉及文件**：
- `packages/server-v2/prisma/schema.prisma`
- `packages/server-v2/src/supply-chain/`（新建模块）
- `src/app/pages/supply-chain/SupplierManagement.tsx`（新建）
- `src/app/routes.tsx`

**具体步骤**：

1. 新增 `Supplier`、`ProductSupplier` 模型（字段见设计文档）。
2. 迁移。
3. 后端新建 `supply-chain` 模块，实现 Supplier CRUD。
4. 前端新建 `/supply-chain/suppliers` 页面。
5. 数据迁移脚本：将现有 `Product.supplier` string 转为 Supplier 记录 + ProductSupplier 关联。

**验收标准**：
- [ ] 管理端可添加/编辑/删除供应商
- [ ] 产品可关联多个供应商并标记主供应商
- [ ] 旧 Product.supplier 字符串数据迁移到新模型

---

### FIN-402：供应商采购订单（替代 PurchaseOrder）

| 字段 | 内容 |
|------|------|
| **优先级** | P0 |
| **预估工时** | 3 天 |
| **分配建议** | 全栈 |
| **依赖** | FIN-401 |

**描述**：
用正式的 `SupplierOrder` + `SupplierOrderItem` 替代现有 JSON-based `PurchaseOrder`。

**涉及文件**：
- `packages/server-v2/prisma/schema.prisma`
- `packages/server-v2/src/supply-chain/supply-chain.controller.ts`
- `packages/server-v2/src/supply-chain/supply-chain.service.ts`
- `src/app/pages/supply-chain/PurchaseOrders.tsx`（新建或改造现有 PurchaseManagement）

**具体步骤**：

1. 新增 `SupplierOrder`、`SupplierOrderItem` 模型。
2. 迁移。
3. 采购单 CRUD 接口：
   - `POST /supply-chain/orders` — 创建采购单（自动计算 platformFee + rebateAmount）
   - `GET /supply-chain/orders` — 列表
   - `PUT /supply-chain/orders/:id/confirm` — 供应商确认
   - `PUT /supply-chain/orders/:id/receive` — 收货确认 → 自动入库
   - `PUT /supply-chain/orders/:id/settle` — 标记已结算

4. 收货确认逻辑：

```typescript
async receiveOrder(orderId: number, receivedItems: Array<{ itemId: number; receivedQty: number }>) {
  // 1. 更新 SupplierOrderItem.receivedQty
  // 2. 为每个收货 item 创建 StockMovement(type: 'purchase_in')
  // 3. 更新 Product.currentStock
  // 4. 更新 SupplierOrder.status = 'received'
  // 5. 更新 SupplierOrder.receivedAt
}
```

5. 补货建议集成：`getReplenishment()` 改为从 `ProductSupplier` 取价格和 MOQ。

6. 前端页面改造（或新建）：采购单列表 + 创建 + 收货确认流程。

**验收标准**：
- [ ] 采购单创建时自动填充供应商价格和 MOQ
- [ ] 收货确认后自动入库（StockMovement + currentStock 更新）
- [ ] 返利和平台费自动计算
- [ ] 旧 PurchaseOrder 数据兼容（不删除，逐步迁移）

---

### FIN-403：供应商月度结算

| 字段 | 内容 |
|------|------|
| **优先级** | P1 |
| **预估工时** | 2 天 |
| **分配建议** | 后端 |
| **依赖** | FIN-402 |

**描述**：
按月汇总供应商采购金额、返利、平台费，生成结算单。

**涉及文件**：
- `packages/server-v2/prisma/schema.prisma`（SupplierSettlement）
- `packages/server-v2/src/supply-chain/supply-chain.service.ts`
- `src/app/pages/supply-chain/SupplierSettlements.tsx`（新建）

**具体步骤**：

1. 新增 `SupplierSettlement` 模型。
2. 月结生成逻辑：

```typescript
async generateSupplierSettlement(supplierId: number, settleMonth: string) {
  // 汇总当月所有 received/settled 状态的 SupplierOrder
  // orderCount, totalAmount, rebateAmount, platformFee
  // netPayable = totalAmount - rebateAmount - platformFee
}
```

3. 管理端页面：供应商结算单列表 + 详情 + 确认/标记已付款。

**验收标准**：
- [ ] 月结金额与采购单汇总一致
- [ ] 平台实际收入 = rebateAmount + platformFee 可追溯
- [ ] 支持导出对账单

---

### FIN-404：平台收入报表

| 字段 | 内容 |
|------|------|
| **优先级** | P1 |
| **预估工时** | 2 天 |
| **分配建议** | 全栈 |
| **依赖** | FIN-304, FIN-403 |

**描述**：
汇总平台整体收入（数字员工订阅 + 提成 + 供应链抽佣），用于平台运营决策。

**涉及文件**：
- `packages/server-v2/src/commission/commission.controller.ts`（新增平台报表接口）
- `src/app/pages/finance/PlatformRevenue.tsx`（新建）

**具体步骤**：

1. 后端接口：

```typescript
@Get('platform/revenue')  // 平台收入汇总
// params: period (month/quarter/year)
// returns: {
//   amiSubscription: { total, storeCount },
//   amiCommission: { total, avgPerStore },
//   supplyChainRebate: { total, orderCount },
//   supplyChainFee: { total },
//   totalRevenue,
//   monthOverMonth,
// }
```

2. 前端页面：
   - 收入构成饼图
   - 月度趋势折线图
   - 门店贡献排行
   - 关键指标：ARPU（每店月均收入）、LTV 预估

**验收标准**：
- [ ] 平台收入可按月/季度/年度查看
- [ ] 各收入来源可追溯到具体记录
- [ ] ARPU 计算正确

---

## Phase 5：权限与菜单集成

---

### FIN-501：财务权限码注册 + 菜单

| 字段 | 内容 |
|------|------|
| **优先级** | P0 |
| **预估工时** | 1 天 |
| **分配建议** | 全栈 |
| **依赖** | FIN-102 |

**描述**：
在权限系统中注册财务相关权限码，在菜单中新增"财务管理"和"供应链"一级分组。

**涉及文件**：
- `src/config/permissions.ts`（新增权限码）
- `src/app/components/Layout.tsx`（新增菜单分组）
- `src/app/routes.tsx`（注册所有 finance/ 和 supply-chain/ 路由）
- `packages/server-v2/src/common/decorators/permissions.decorator.ts`（确认后端 guard）

**具体步骤**：

1. 新增权限码：

```typescript
// permissions.ts PERMISSION_CATALOG 新增
'core:finance:view'     // 查看财务数据
'core:finance:manage'   // 管理提成规则/确认结算
'core:finance:export'   // 导出财务报表
'core:supply:view'      // 查看供应链
'core:supply:manage'    // 管理供应商/采购/结算
```

2. `ROLE_PERMISSIONS` 中为 `super_admin` 和 `store_manager` 添加财务权限。

3. Layout 菜单新增两个分组：

```
📊 财务管理
  ├── 日结报表
  ├── 提成规则
  ├── 提成明细
  ├── 月度结算
  ├── 数字员工绩效
  └── 数字员工账单

📦 供应链
  ├── 供应商管理
  ├── 采购订单
  └── 供应商结算
```

4. 路由注册所有 finance/ 和 supply-chain/ 页面。

**验收标准**：
- [ ] 超级管理员可看到所有财务菜单
- [ ] 门店管理员可看到日结和提成
- [ ] 普通员工无法访问财务页面
- [ ] 权限不足时路由返回 403

---

## 任务依赖关系图

```
Phase 1（员工提成）                Phase 2（对账日结）
┌──────────┐                      ┌──────────┐
│ FIN-101  │──┐                   │ FIN-201  │──┐
└──────────┘  │                   └──────────┘  │
              ├──→ FIN-102 ──→ FIN-103 ──┐      ├──→ FIN-202
              │                          │      │
              │                          ├──→ FIN-104 ──→ FIN-105
              │                          │      ├──→ FIN-203
┌──────────┐  │                          │      │
│ FIN-204  │──┘（可并行）                 ├──→ FIN-106
└──────────┘                             │
                                         └──→ FIN-107

Phase 3（数字员工）                Phase 4（供应链）
┌──────────┐                      ┌──────────┐
│ FIN-301  │──┐                   │ FIN-401  │──→ FIN-402 ──→ FIN-403
└──────────┘  ├──→ FIN-302 ──┐    └──────────┘
              │               │
              └──→ FIN-303 ──┼──→ FIN-304 ──→ FIN-305
                             │
                             └──→ FIN-404（需 FIN-304 + FIN-403）

Phase 5（集成）
FIN-501（在 FIN-102 之后即可开始，持续迭代）
```

---

## 工时汇总

| 阶段 | 任务数 | 总工时 | 可并行度 | 实际日历时间 |
|------|--------|--------|----------|-------------|
| Phase 1：员工提成 | 7 | 14.5 天 | 中（101→102→103 串行，104-107 部分并行） | 4 周 |
| Phase 2：收银对账 | 4 | 7.5 天 | 中（201 串行，202/203 可并行） | 2 周 |
| Phase 3：数字员工 | 5 | 8 天 | 高（302/303 可并行） | 3 周 |
| Phase 4：供应链 | 4 | 9 天 | 中（401→402→403 串行） | 4 周 |
| Phase 5：权限集成 | 1 | 1 天 | — | 穿插完成 |
| **总计** | **21 张任务卡** | **40 天** | | **约 13 周** |

---

## 实施优先级建议

```
月份    │  W1   │  W2   │  W3   │  W4   │  W5   │  W6   │  W7   │  W8   │ ...
────────┼───────┼───────┼───────┼───────┼───────┼───────┼───────┼───────┼────
Phase 1 │██████████████████████████████████████│                              │
Phase 2 │                  │████████████████████│                              │
Phase 5 │      │█│         │      │      │      │      │      │      │      │ (穿插)
Phase 3 │                              │████████████████████████│              │
Phase 4 │                                              │████████████████████████│
```

**推荐启动顺序**：

1. **先做 Phase 1**（提成）— 对美容师激励效果最直接，门店付费意愿的核心抓手
2. **Phase 2 与 Phase 1 后半段并行** — 对账是门店老板的刚需，且技术耦合低
3. **Phase 3 在提成系统验证后启动** — 数字员工绩效依赖提成思路跑通
4. **Phase 4 最后** — 供应链需要真实供应商合作，技术就绪后等商务进展

---

## 与现有任务卡的关系

本计划与 `docs/data-completion-task-cards.md` 有以下交叉依赖：

| 本计划任务 | 依赖的数据补齐任务 | 说明 |
|-----------|-------------------|------|
| FIN-103（提成引擎） | TASK-202（OrderItem source） | 需要知道订单来源区分终端/管理端 |
| FIN-203（日结） | TASK-207（Dashboard 门店过滤） | 日结也需要严格按门店聚合 |
| FIN-402（供应商采购） | TASK-208（Product DTO 强类型） | 产品需要正式的 costPrice 字段保障 |
| FIN-302（Ami 归因） | TASK-304（行为埋点） | 更多行为数据让归因更精准 |

建议：**数据补齐 Phase 1-2 先于本计划 Phase 1 完成**，确保提成计算基于真实数据。
