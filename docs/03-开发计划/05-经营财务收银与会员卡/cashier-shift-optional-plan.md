# 收银班次可选化开发计划

版本：v1.0
日期：2026-06-08
适用范围：`packages/server-v2/`、`packages/Ami-Aura-Lite-Kiosk/`、`src/`（管理端门店设置）

---

## 一、背景与目标

### 业务背景

收银班次（CashierShift）的核心价值是**现金对账**：记录开班备用金、统计班次内现金收入、关班时核对实收 vs 系统应收差异。适用于有现金收款、多人轮班的中大型门店。

对于小型门店（1-2 人、主要微信/支付宝收款、无班次交接需求），该功能增加了操作负担：
- 每天必须先"开班"才能收银
- 关班需要清点现金
- 终端 Dashboard 上占据一块面板空间

### 改造目标

在**不影响收银和财务体系**的前提下，允许门店级别关闭班次功能：
- 关闭后：终端收银不再要求开班，Dashboard 不显示班次面板
- 财务数据不受影响：订单、支付记录、提成、日结报表全部独立于班次

### 安全底线

| 保证项 | 说明 |
|--------|------|
| 订单创建不中断 | 关闭班次的门店，`/terminal/checkout` 正常通过 |
| 财务报表不受影响 | `DailySettlement` 独立计算，不依赖 CashierShift |
| 提成计算不受影响 | CommissionRecord 基于 PaymentRecord，不经班次 |
| 已有班次数据不丢失 | 历史 CashierShift 记录保留，仅关闭强制开班要求 |
| 可随时重新启用 | 开关双向可切换，开启后恢复原有完整班次流程 |

---

## 二、当前架构分析

### 班次在系统中的位置

```
终端收银流程：
用户选客户 + 添加明细 → [班次检查] → 确认收款 → 创建订单/支付记录/提成

班次检查有两层：
1. 前端 CashierFlowCard：loadShiftStatus prop 存在时检查 shift.status === "open"
2. 后端 TerminalService.checkout()：调用 ensureOpenCashierShift(storeId, deviceId)
```

### 关键依赖关系

| 组件 | 是否依赖 CashierShift | 说明 |
|------|----------------------|------|
| `TerminalService.checkout()` | **是（可配置化）** | `ensureOpenCashierShift` 仅在有 deviceId 时强制 |
| `TerminalService.createCardOrder()` | 否 | 不调用 shift guard |
| `TerminalService.createRechargeOrder()` | 否 | 不调用 shift guard |
| `CommissionService.generateDailySettlement()` | 否 | 直接查 PaymentRecord/RefundRecord |
| `CommissionService.closeCashierShift()` | 间接 | 关班时汇总支付明细，但不写入 Settlement |
| Dashboard（Ami/Manager） | 否 | 从 AmiPerformanceRecord 读取 |
| 前端 `CashierFlowCard` | **是（可配置化）** | `loadShiftStatus` prop 控制 |
| 前端 `RoleDashboards` | **是（可配置化）** | 始终渲染 CashierShiftPanel |

---

## 三、方案设计

### 核心思路：门店级开关 `shiftRequired`

在 Store 模型上增加字段 `shiftRequired`（默认 `true`），通过此字段控制前后端是否强制班次。

### 数据流

```
管理端门店设置
  → Store.shiftRequired = false
  → 终端登录时下发 store.shiftRequired
  → Kiosk 本地判断：
      shiftRequired = false → 不传 loadShiftStatus → 不检查班次
      shiftRequired = false → 不渲染 CashierShiftPanel
  → 后端 ensureOpenCashierShift：
      shiftRequired = false → 直接 return
```

---

## 四、分步实施

### Step 1：后端 Schema 与 Service 改动（0.5 天）

#### 1.1 Prisma Schema 加字段

```prisma
// packages/server-v2/prisma/schema.prisma
model Store {
  // ... existing fields ...
  shiftRequired  Boolean  @default(true)  // 收银班次是否强制，小门店可关闭
}
```

**操作**：
- 修改 `schema.prisma` 的 Store 模型
- 执行 `npx prisma migrate dev --name add-store-shift-required`
- 执行 `npx prisma generate`

#### 1.2 后端 Guard 加门店配置判断

**文件**：`packages/server-v2/src/terminal/terminal.service.ts`（line 2900）

当前代码：
```typescript
private async ensureOpenCashierShift(storeId: number, deviceId?: number) {
  if (!deviceId) return;
  const shift = await this.prisma.cashierShift.findFirst({
    where: { storeId, deviceId, status: 'open' },
    select: { id: true },
    orderBy: { startedAt: 'desc' },
  });
  if (!shift) throw new BadRequestException('当前终端未开班，请先开班后再收银');
}
```

改为：
```typescript
private async ensureOpenCashierShift(storeId: number, deviceId?: number) {
  if (!deviceId) return;
  const store = await this.prisma.store.findUnique({
    where: { id: storeId },
    select: { shiftRequired: true },
  });
  if (!store?.shiftRequired) return;
  const shift = await this.prisma.cashierShift.findFirst({
    where: { storeId, deviceId, status: 'open' },
    select: { id: true },
    orderBy: { startedAt: 'desc' },
  });
  if (!shift) throw new BadRequestException('当前终端未开班，请先开班后再收银');
}
```

> 优化点：如果性能敏感，可将 `store.shiftRequired` 缓存到设备会话信息中（已有 deviceSession），避免每次 checkout 查 Store 表。后续视情况做。

#### 1.3 终端登录响应中下发 `shiftRequired`

**文件**：`packages/server-v2/src/terminal/terminal.service.ts` — `login()` / `getDeviceInfo()`

在终端设备认证后返回的 store 信息中，追加 `shiftRequired` 字段：

```typescript
// getDeviceInfo 返回结构中
return {
  device: { ... },
  store: {
    id: store.id,
    name: store.name,
    shiftRequired: store.shiftRequired,  // 新增
    // ...
  },
};
```

#### 1.4 门店管理接口支持更新 `shiftRequired`

**文件**：`packages/server-v2/src/stores/` 相关 controller/service

在更新门店的 DTO 和 service 中增加 `shiftRequired` 可选字段，允许管理端设置。

---

### Step 2：Kiosk 终端前端改动（0.5 天）

#### 2.1 获取并存储 `shiftRequired` 配置

**文件**：`packages/Ami-Aura-Lite-Kiosk/src/app/services/auraCoreService.ts`

终端启动/登录时已获取 store 信息，需确保 `shiftRequired` 被传递到组件层。

实现方式：在 `auraCoreService` 或 App 状态中暴露当前 store 的 `shiftRequired` 值。

```typescript
// auraCoreService.ts 新增
export function isShiftRequired(): boolean {
  return currentStore?.shiftRequired !== false;
}
```

#### 2.2 CashierFlowCard 条件化传入 `loadShiftStatus`

**文件**：`packages/Ami-Aura-Lite-Kiosk/src/app/AppContent.tsx`

当前代码：
```tsx
<CashierFlowCard
  data={payload.data}
  onConfirm={handleCashierConfirm}
  loadShiftStatus={getCashierShiftStatus}
/>
```

改为：
```tsx
<CashierFlowCard
  data={payload.data}
  onConfirm={handleCashierConfirm}
  loadShiftStatus={isShiftRequired() ? getCashierShiftStatus : undefined}
/>
```

- `loadShiftStatus` 为 `undefined` 时，`CashierFlowCard` 内部 `requireOpenShift = false`，跳过班次检查
- **无需修改 CashierFlowCard 组件本身**，它已通过 `Boolean(loadShiftStatus)` 做了兼容

#### 2.3 Dashboard 隐藏 CashierShiftPanel

**文件**：`packages/Ami-Aura-Lite-Kiosk/src/app/components/RoleDashboards.tsx`（line 1272）

当前 `ReceptionDashboardCard` 始终渲染 `<CashierShiftPanel />`。

改为条件渲染：
```tsx
{isShiftRequired() ? (
  <CashierShiftPanel
    shift={cashierShift}
    openingCash={openingCash}
    closingCash={closingCash}
    loading={shiftLoading}
    error={shiftError}
    onOpeningCashChange={setOpeningCash}
    onClosingCashChange={setClosingCash}
    onOpen={() => void handleOpenShift()}
    onClose={() => void handleCloseShift()}
  />
) : null}
```

同时，`useEffect` 中加载班次状态的逻辑也需条件化：
```typescript
React.useEffect(() => {
  if (!isShiftRequired()) return;  // 新增
  let mounted = true;
  getCashierShiftStatus()
    .then((shift) => { if (mounted) setCashierShift(shift); })
    .catch((err) => { if (mounted) setShiftError(...); });
  return () => { mounted = false; };
}, []);
```

---

### Step 3：管理端门店设置 UI（0.5 天）

#### 3.1 门店设置页加开关

**位置**：管理端门店详情/编辑页面（`src/` 中门店管理相关页面）

增加一个开关：

```
┌───────────────────────────────────────────┐
│ 收银班次管理                               │
│                                           │
│ [开关] 启用收银班次                         │
│                                           │
│ 启用后，终端收银前必须先开班，关班时需       │
│ 清点现金并核对差异。适合有现金收款、         │
│ 多人轮班的门店。                           │
│                                           │
│ 关闭后，终端可直接收银，不要求开关班。       │
│ 不影响财务报表和提成计算。                   │
└───────────────────────────────────────────┘
```

**字段映射**：`shiftRequired: boolean`

**API 调用**：PUT `/stores/:id` body 中包含 `shiftRequired`

---

## 五、改动文件汇总

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `server-v2/prisma/schema.prisma` | 修改 | Store 模型加 `shiftRequired` 字段 |
| `server-v2/src/terminal/terminal.service.ts` | 修改 | `ensureOpenCashierShift` 查 store 配置 |
| `server-v2/src/terminal/terminal.service.ts` | 修改 | login/getDeviceInfo 下发 `shiftRequired` |
| `server-v2/src/stores/dto/update-store.dto.ts` | 修改 | 加 `shiftRequired` 可选字段 |
| `server-v2/src/stores/stores.service.ts` | 修改 | update 逻辑支持该字段 |
| `Kiosk/src/app/services/auraCoreService.ts` | 修改 | 暴露 `isShiftRequired()` |
| `Kiosk/src/app/AppContent.tsx` | 修改 | 条件化传入 `loadShiftStatus` |
| `Kiosk/src/app/components/RoleDashboards.tsx` | 修改 | 条件化渲染 CashierShiftPanel + 班次加载 |
| `src/pages/stores/` 或对应门店设置页 | 修改 | 加"启用收银班次"开关 |
| 迁移文件（自动生成） | 新建 | Prisma migration |

---

## 六、工时与优先级

| 步骤 | 内容 | 工时 | 风险 |
|------|------|------|------|
| Step 1 | 后端 Schema + Guard + 登录下发 | 0.5 天 | 低（加字段 + 1 行 if） |
| Step 2 | Kiosk 前端条件化 | 0.5 天 | 低（已有 prop 兼容设计） |
| Step 3 | 管理端门店设置 UI | 0.5 天 | 低（单字段开关） |
| **总计** | | **1.5 天** | |

---

## 七、验收场景

| 场景 | shiftRequired | 期望行为 |
|------|--------------|----------|
| 终端收银（开关开启） | true | 必须先开班，否则前端阻止 + 后端 400 |
| 终端收银（开关关闭） | false | 直接进入收银流程，无班次检查 |
| 终端 Dashboard（开关关闭） | false | 不显示"收银班次"面板 |
| 终端 Dashboard（开关开启） | true | 正常显示班次面板（开班/关班） |
| 办卡（无论开关） | * | 不受影响，正常走办卡流程 |
| 充值（无论开关） | * | 不受影响，正常走充值流程 |
| 日结报表（无论开关） | * | 正常生成，数据从 PaymentRecord 独立计算 |
| 提成计算（无论开关） | * | 正常计算，不依赖 CashierShift |
| 管理端设置 | - | 门店详情页可切换开关，保存后终端立即生效 |
| 开关从 false 改为 true | true | 终端下次收银恢复要求开班 |
| 历史班次数据 | - | 保留不动，关闭开关只是不再强制开班 |

---

## 八、风险与取舍

| 决策 | 取舍 | 理由 |
|------|------|------|
| 门店级开关而非终端级 | 同一门店内所有终端一致 | 小店通常只有 1 台终端，门店级粒度足够；终端级会增加配置复杂度 |
| 默认 `true`（启用） | 现有门店行为不变 | 向后兼容，现有门店无感知变化 |
| 不删除 CashierShift 模型/接口 | 保留完整班次能力 | 开关可双向切换，大店仍需要完整班次管理 |
| `ensureOpenCashierShift` 内查 Store | 每次收银多一次查询 | 单行 `findUnique(id)` 极快（<1ms）；若需优化，后续可缓存到 device session |
| 前端通过 prop 控制 | 不修改 CashierFlowCard 组件内部 | 该组件已设计为"有 loadShiftStatus 才检查"，零改动零风险 |

---

## 九、后续演进（非本次范围）

- 如果未来需要更细粒度（如仅关闭"班次面板"但保留"收银前确认"），可拆为两个字段
- 如果需要"建议开班但不强制"（soft check），可引入 `shiftMode: 'required' | 'optional' | 'disabled'`
- 班次历史报表可根据开关状态显示"该门店未启用班次管理"提示

---

## 十、总结

收银班次是一个**操作管理工具**，不是财务数据链路的一环。小门店关闭后：
- 收银体验更轻：打开终端即可直接收银，无需每天开/关班
- 终端界面更简洁：Dashboard 少一块面板
- 财务完整性不受影响：日结、提成、支付记录全部独立计算

改动量小（约 1.5 天）、风险低（加字段 + 条件判断）、完全向后兼容。
