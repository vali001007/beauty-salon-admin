# 数据真实性与字段完整性修复开发计划

版本：v1.0
日期：2026-06-07
适用范围：管理端、server-v2 后端、Ami-Aura-Lite-Kiosk 终端
前置文档：`docs/aura-lite-terminal-open-loops-audit.md`

---

## 背景

经审计发现系统中存在 **246 处**数据来源不真实或字段缺失问题，分为 5 类：

1. 管理端页面使用硬编码/Mock 数据展示给用户
2. API 层用默认值静默填充后端未返回的字段
3. 数据库字段定义了但无写入路径
4. Kiosk 终端在 API 失败时静默构造本地假数据
5. 后端聚合逻辑不准确

这些问题在演示阶段可接受，但进入生产后会导致老板看到假数据做出错误决策。本计划按优先级系统性修复。

---

## P0：直接影响生产数据真实性（必须在上线前完成）

### P0-1：Dashboard 去除硬编码 KPI

**问题**：`Dashboard.tsx:91-153` 三个角色的全部 KPI 硬编码（客户数 2847、今日收入 ¥45680 等），API 返回空时静默展示假数据。

**当前行为**：
```typescript
// Dashboard.tsx:205-214
if (!overview?.metrics?.length) return workspace.metrics; // ← 返回硬编码
```

**目标行为**：API 返回空/失败时显示骨架屏或"暂无数据"，绝不显示假数字。

**实现方案**：

1. 移除 `workspaceConfig` 中所有硬编码的 `metrics` 数值和 `priorities` 列表。
2. `metrics` 改为只定义结构（label/icon/tone/path），value 和 hint 由 API 数据填充：

```typescript
const metricDefinitions: Record<AuraRole, Array<{ key: string; label: string; icon: LucideIcon; tone: Metric['tone']; path: string }>> = {
  manager: [
    { key: 'customers', label: '总客户数', icon: Users, tone: 'primary', path: '/customers/data' },
    { key: 'income', label: '今日收入', icon: TrendingUp, tone: 'rose', path: '/orders/products' },
    { key: 'inventory', label: '库存预警', icon: PackageCheck, tone: 'amber', path: '/inventory/stock' },
    { key: 'campaigns', label: '进行中活动', icon: Megaphone, tone: 'slate', path: '/customer-marketing/activity-management' },
  ],
  // ...reception, beautician 类似
};
```

3. 当 `overview?.metrics` 为空时，每个 KPI 卡片显示 `—` 而非假数字，并在卡片组下方显示"数据加载中..."或"暂无数据"。

4. `priorities` 为空时显示空状态："当前无待办事项"。

5. "门店运行状态"区域（`Dashboard.tsx:342-355`）改为调用后端 `GET /terminal/devices/status`，或在无终端设备时整段隐藏。

**文件**：
- `src/app/pages/Dashboard.tsx`
- `src/api/real/dashboard.ts`（确认接口返回字段覆盖）

**验收标准**：
- API 返回正常数据时 KPI 显示真实值
- API 返回空或报错时，页面不显示任何数字，只显示占位符
- 无任何硬编码数字存在于 Dashboard 代码中

**预估工期**：1 天

---

### P0-2：CreateActivityDialog 替换 Mock 客户数据

**问题**：`CreateActivityDialog.tsx:16-17` 直接 import mock JSON 文件做客户分群计数，显示"符合条件客户 X 人"是假数据。

**当前行为**：
```typescript
import rawCustomers from '@/api/mock/data/customers.json';
import rawHealthProfiles from '@/api/mock/data/health-profiles.json';
// 基于 mock 数据计算分群数量
```

**实现方案**：

1. 后端新增接口 `GET /customers/segment-count`：

```typescript
// customers.controller.ts
@Get('segment-count')
@Permissions('core:customer:view')
@ApiOperation({ summary: '获取客户分群计数' })
getSegmentCount(
  @Headers('x-store-id') storeId?: string,
  @Query('segment') segment?: string,
  @Query('skinType') skinType?: string,
  @Query('memberLevel') memberLevel?: string,
  @Query('daysSinceLastVisit') daysSinceLastVisit?: number,
) {
  return this.customersService.getSegmentCount(
    storeId ? Number(storeId) : undefined,
    { segment, skinType, memberLevel, daysSinceLastVisit },
  );
}
```

2. Service 实现：

```typescript
async getSegmentCount(storeId?: number, filters?: { segment?: string; skinType?: string; memberLevel?: string; daysSinceLastVisit?: number }) {
  const where: any = { deletedAt: null };
  if (storeId) where.storeId = storeId;
  if (filters?.skinType) where.skinType = filters.skinType;
  if (filters?.memberLevel) where.memberLevel = filters.memberLevel;
  if (filters?.daysSinceLastVisit) {
    where.reservations = {
      none: { startTime: { gte: new Date(Date.now() - filters.daysSinceLastVisit * 86400_000) } },
    };
  }
  const count = await this.prisma.customer.count({ where });
  return { count, filters };
}
```

3. 前端 `CreateActivityDialog.tsx` 移除 mock JSON 导入，改为调用真实 API：

```typescript
import { getCustomerSegmentCount } from '@/api/customer';

// 在目标客户选择变化时
useEffect(() => {
  getCustomerSegmentCount({ segment: selectedSegment, storeId: currentStoreId })
    .then(({ count }) => setMatchedCustomerCount(count))
    .catch(() => setMatchedCustomerCount(null));
}, [selectedSegment, currentStoreId]);
```

4. 在 `src/api/real/customer.ts` 新增：
```typescript
export async function realGetCustomerSegmentCount(params: { segment?: string; skinType?: string; storeId?: number }) {
  return apiClient.get('/customers/segment-count', { params });
}
```

**文件**：
- `packages/server-v2/src/customers/customers.controller.ts`
- `packages/server-v2/src/customers/customers.service.ts`
- `src/api/real/customer.ts`
- `src/api/customer.ts`
- `src/app/components/CreateActivityDialog.tsx`

**验收标准**：
- 代码中不再 import 任何 `mock/data/*.json`
- "符合条件客户"数字来自真实 API 查询
- API 失败时显示"—"而非 0

**预估工期**：1.5 天

---

### P0-3：CreateActivityDialog 门店信息动态获取

**问题**：`CreateActivityDialog.tsx:98-99` 硬编码门店名 `'心悦芸美容养生会所'` 和电话 `'0571-88888888'`。发布的营销页会展示错误的门店信息。

**实现方案**：

1. 从 `storeStore` 获取当前门店信息：

```typescript
import { useStoreStore } from '@/stores/storeStore';

// 组件内部
const currentStore = useStoreStore((s) => s.stores.find((st) => st.id === s.currentStoreId));
const storeName = currentStore?.name || '门店';
const storePhone = currentStore?.phone || '';
const storeAddress = currentStore?.address || '';
```

2. 移除 `STORE_NAME` 和 `STORE_PHONE` 常量。

3. 将 `storeName`/`storePhone`/`storeAddress` 传递到 AI 生成请求和页面 schema 构建中。

4. 如果门店缺少电话/地址字段，在弹窗中提示"请先在系统设置中完善门店联系方式"。

**文件**：
- `src/app/components/CreateActivityDialog.tsx`

**验收标准**：
- 切换门店后，活动创建弹窗自动更新门店信息
- 发布的营销页显示当前门店的真实信息
- 代码中不再有硬编码门店名/电话

**预估工期**：0.5 天

---

### P0-4：Customer DTO 扩展（补齐客户档案字段）

**问题**：`CreateCustomerDto` 只接受 10 个字段（name/phone/email/wechat/gender/memberLevel/source/remark/tags），但 Prisma `Customer` 模型有 25+ 字段。管理端创建/更新客户时无法填写生日、职业、过敏史、肤质等关键字段。

**实现方案**：

1. 扩展 `CreateCustomerDto`：

```typescript
// packages/server-v2/src/customers/dto/create-customer.dto.ts
export class CreateCustomerDto {
  // 已有字段保留...

  @IsOptional() @IsString() birthday?: string;
  @IsOptional() @IsString() landline?: string;
  @IsOptional() @IsString() maritalStatus?: string;
  @IsOptional() @IsInt() age?: number;
  @IsOptional() @IsNumber() height?: number;
  @IsOptional() @IsNumber() weight?: number;
  @IsOptional() @IsString() occupation?: string;
  @IsOptional() @IsString() workplace?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsBoolean() hasAllergy?: boolean;
  @IsOptional() @IsBoolean() hasSurgery?: boolean;
  @IsOptional() @IsString() skinCondition?: string;
  @IsOptional() @IsString() skinType?: string;
}
```

2. `UpdateCustomerDto` 使用 `PartialType(CreateCustomerDto)` 或手动补齐同样字段。

3. `customers.service.ts` 的 `create` 和 `update` 方法已经透传 dto，字段扩展后自动生效。

4. 管理端客户编辑表单（`src/app/pages/CustomerData.tsx` 或相关组件）中补齐这些字段的输入框（分组：基本信息 / 体征信息 / 皮肤状态 / 过敏史）。

**文件**：
- `packages/server-v2/src/customers/dto/create-customer.dto.ts`
- `packages/server-v2/src/customers/dto/update-customer.dto.ts`（如有单独文件）
- `packages/server-v2/src/customers/customers.service.ts`（确认透传）
- 管理端客户编辑表单组件

**验收标准**：
- 通过 API 可以创建/更新客户的全部 schema 字段
- 管理端编辑表单覆盖生日、职业、地址、过敏、手术、肤质等字段
- 旧数据（字段为 null）不影响展示

**预估工期**：1.5 天

---

## P1：影响业务判断准确性

### P1-1：CreateActivityDialog 商品列表改为真实 API

**问题**：`CreateActivityDialog.tsx:351-357` 硬编码 5 个产品名（玻尿酸精华液/修复面膜/美白精华/眼霜/防晒），不来自真实商品库。

**实现方案**：

1. 在组件加载时调用 `getProducts({ status: 'active', pageSize: 50 })`：

```typescript
const [availableProducts, setAvailableProducts] = useState<Product[]>([]);

useEffect(() => {
  getProducts({ status: 'active', pageSize: 100 })
    .then((res) => setAvailableProducts(res.items ?? res.data ?? []))
    .catch(() => setAvailableProducts([]));
}, []);
```

2. 移除硬编码 `products` 数组，商品选择列表从 `availableProducts` 渲染。

3. 如果商品列表为空，显示"暂无可选商品，请先在商品管理中添加"。

**文件**：
- `src/app/components/CreateActivityDialog.tsx`

**验收标准**：
- 商品选择列表来自真实 API
- 活动关联的商品 ID 在 `Product` 表中真实存在
- 商品库为空时有明确提示

**预估工期**：0.5 天

---

### P1-2：终端设备状态真实化

**问题**：
- `terminal.service.ts:1245-1252` 硬编码扫码器/摄像头 `status: 'online'`
- `Dashboard.tsx:342-355` 硬编码"网络正常/打印机在线/扫码器在线"
- Prisma `TerminalDevice` 模型无 scanner/camera/printer 状态字段

**实现方案**：

1. Schema 新增字段：

```prisma
model TerminalDevice {
  // 已有字段...
  printerStatus    String?  // "online" | "offline" | "error" | null
  scannerStatus    String?  // "online" | "offline" | null
  cameraStatus     String?  // "online" | "offline" | null
  peripheralJson   Json?    // 扩展外设状态 JSON
}
```

2. heartbeat 上报时更新外设状态：

```typescript
// terminal.service.ts → deviceHeartbeat
async deviceHeartbeat(deviceId: number, dto: DeviceHeartbeatDto) {
  await this.prisma.terminalDevice.update({
    where: { id: deviceId },
    data: {
      lastOnlineAt: new Date(),
      status: 'online',
      batteryLevel: dto.batteryLevel,
      networkStatus: dto.networkStatus,
      printerStatus: dto.printerStatus ?? undefined,
      scannerStatus: dto.scannerStatus ?? undefined,
      cameraStatus: dto.cameraStatus ?? undefined,
    },
  });
}
```

3. `DeviceHeartbeatDto` 新增可选字段：

```typescript
@IsOptional() @IsString() printerStatus?: string;
@IsOptional() @IsString() scannerStatus?: string;
@IsOptional() @IsString() cameraStatus?: string;
```

4. `getDeviceStatus` 方法改为从数据库读取，不再硬编码：

```typescript
async getDeviceStatus(storeId: number, deviceId: number) {
  const device = await this.prisma.terminalDevice.findFirst({ where: { id: deviceId, storeId } });
  return {
    network: { status: device?.networkStatus || 'unknown' },
    printer: { status: device?.printerStatus || 'unknown' },
    scanner: { status: device?.scannerStatus || 'unknown' },
    camera: { status: device?.cameraStatus || 'unknown' },
    lastOnline: device?.lastOnlineAt,
  };
}
```

5. 管理端 Dashboard 的"门店运行状态"改为调用设备状态 API（如无终端设备则隐藏该区域）。

**文件**：
- `packages/server-v2/prisma/schema.prisma`
- `packages/server-v2/src/terminal/dto/device-heartbeat.dto.ts`
- `packages/server-v2/src/terminal/terminal.service.ts`
- `src/app/pages/Dashboard.tsx`

**验收标准**：
- 终端 heartbeat 上报外设状态后，管理端和 Kiosk 顶部状态栏显示真实值
- 设备离线超过 5 分钟，状态自动变为 `'offline'`
- 代码中不再有硬编码 `'online'`

**预估工期**：1.5 天

---

### P1-3：美容师 specialties 字段保障

**问题**：`src/api/real/beautician.ts:17-18` 当后端未返回 `specialties` 时默认填充 `['面部护理','肌肤管理']`，导致所有美容师看起来都擅长同一领域。

**实现方案**：

1. 在后端 `beauticians.service.ts` 创建/更新时要求 `specialties` 为必填或从关联项目自动派生：

```typescript
// 创建美容师时，如果未指定 specialties，从关联项目类型中提取
if (!dto.specialties?.length && dto.projectIds?.length) {
  const projects = await this.prisma.project.findMany({
    where: { id: { in: dto.projectIds } },
    select: { type: true },
  });
  dto.specialties = [...new Set(projects.map(p => p.type).filter(Boolean))];
}
```

2. 前端 API 层移除默认值填充，改为显示"未设置"：

```typescript
// src/api/real/beautician.ts
specialties: raw.specialties ?? [],  // 不再填充假数据
level: raw.level || '',              // 前端组件自行处理空值展示
```

3. 管理端美容师列表页中，当 `specialties` 为空时显示灰色"未设置"标签。

**文件**：
- `packages/server-v2/src/beauticians/beauticians.service.ts`
- `src/api/real/beautician.ts`

**验收标准**：
- 新建美容师如指定了关联项目，specialties 自动填充
- 未设置时前端不显示假数据，而是"未设置"

**预估工期**：0.5 天

---

### P1-4：Dashboard 活动计数加门店过滤

**问题**：`dashboard.service.ts:86-87` "进行中活动"计数未按 `storeId` 过滤，多门店场景下显示全局数据。

**实现方案**：

```typescript
// dashboard.service.ts
const campaignCount = await this.prisma.marketingActivity?.count?.({
  where: {
    status: 'active',
    ...(storeId ? { storeId } : {}),
  },
}) ?? 0;
```

**文件**：
- `packages/server-v2/src/dashboard/dashboard.service.ts`

**验收标准**：切换门店后，Dashboard 活动计数只显示当前门店的活动数。

**预估工期**：0.5 天

---

### P1-5：卡项字段后端必填校验

**问题**：`src/api/real/card.ts:36-41` 对 `type`/`validDays`/`storeName` 用默认值填充，掩盖了后端数据不完整。

**实现方案**：

1. 确认后端 `cards.service.ts` 创建卡项时 `type` 和 `validDays` 为必填：

```typescript
// cards DTO
@IsString() type: string;          // 次卡 | 储值卡 | 年卡
@IsInt() @Min(1) validDays: number; // 有效天数
```

2. 前端 API 层保留 fallback 但加日志警告：

```typescript
if (!raw.type) console.warn(`卡项 ${raw.id} 缺少 type 字段`);
type: raw.type || '次卡',
```

3. 对已有数据做一次性修复：在 seed 脚本或迁移脚本中给缺失 `type` 的记录补默认值。

**文件**：
- `packages/server-v2/src/cards/` 相关 DTO
- `src/api/real/card.ts`

**验收标准**：新建卡项时后端拒绝不含 `type/validDays` 的请求。

**预估工期**：0.5 天

---

## P2：改善数据完整度与用户感知

### P2-1：管理端创建客户时同步创建空 HealthProfile

**问题**：`CustomerHealthProfile` 只有终端 health-profile 流程写入，管理端创建客户后该记录不存在，健康档案页显示空白。

**实现方案**：

```typescript
// customers.service.ts → create 方法
async create(storeId: number, dto: CreateCustomerDto) {
  const customer = await this.prisma.customer.create({ data: { ...dto, storeId } });

  // 同步创建空健康档案
  await this.prisma.customerHealthProfile.create({
    data: {
      customerId: customer.id,
      skinType: dto.skinType || null,
      skinStatus: null,
      mainProblems: null,
      allergyHistory: dto.hasAllergy ? '有过敏史（待补充详情）' : null,
    },
  });

  return customer;
}
```

**文件**：
- `packages/server-v2/src/customers/customers.service.ts`

**验收标准**：管理端新建客户后，在客户档案中看到健康档案 Tab 并可填写。

**预估工期**：0.5 天

---

### P2-2：终端 API 失败可视化

**问题**：`auraCoreService.ts:185-191` 的 `optionalCoreCall` 在 API 失败时静默返回空数据，前端显示"无数据"但不告知原因。

**实现方案**：

1. 在 `auraCoreService.ts` 中增加错误状态回传：

```typescript
type CoreCallResult<T> = { data: T; source: 'api' } | { data: T; source: 'fallback'; error?: string };

async function optionalCoreCall<T>(fn: () => Promise<T>, fallback: T, label?: string): Promise<CoreCallResult<T>> {
  try {
    const data = await fn();
    return { data, source: 'api' };
  } catch (error) {
    console.warn(`[Aura] ${label || 'API'} 失败，使用本地兜底`, error);
    return { data: fallback, source: 'fallback', error: error instanceof Error ? error.message : '未知错误' };
  }
}
```

2. 在 `AppContent.tsx` 的消息渲染中，当数据来源为 `fallback` 时在卡片顶部显示淡黄色提示条：

```tsx
{payload.source === 'fallback' && (
  <div className="text-xs text-amber-600 bg-amber-50 px-3 py-1 rounded-t">
    ⚠️ 部分数据暂时不可用，已显示缓存内容
  </div>
)}
```

3. 店长角色的仪表盘卡片中，如果核心数据来自 fallback，在 KPI 数字旁显示 `⚠` 图标。

**文件**：
- `packages/Ami-Aura-Lite-Kiosk/src/app/services/auraCoreService.ts`
- `packages/Ami-Aura-Lite-Kiosk/src/app/AppContent.tsx`
- `packages/Ami-Aura-Lite-Kiosk/src/app/components/RoleDashboards.tsx`

**验收标准**：
- 后端不可达时，Kiosk 页面显示明确的"数据暂不可用"提示
- 不再出现静默空白列表让用户误以为"真的没有数据"

**预估工期**：1 天

---

### P2-3：营销推荐 Fallback 标记

**问题**：`marketing.service.ts:521-568` 无预测数据时返回 fallback 推荐卡，用 `totalCustomers * 0.2` 估算目标客户数，不告知用户数据为样例。

**实现方案**：

1. 在推荐卡数据结构中增加 `isFallback: boolean` 字段：

```typescript
// marketing.service.ts → buildFallbackRecommendationCards
return cards.map(card => ({
  ...card,
  isFallback: true,
  dataEvidence: ['尚无预测数据，以下为样例建议'],
}));
```

2. 管理端"智能推荐"页面中，当 `isFallback === true` 时在卡片上显示"样例建议"标签：

```tsx
{card.isFallback && (
  <Badge variant="outline" className="text-amber-600 border-amber-300">
    样例建议 · 接入真实数据后自动更新
  </Badge>
)}
```

3. 终端 `AutomationTodayCard` 中如果策略都是 fallback 生成的，提示"暂无真实执行数据"。

**文件**：
- `packages/server-v2/src/marketing/marketing.service.ts`
- `src/app/pages/MarketingRecommendation.tsx`

**验收标准**：
- 无预测数据时推荐卡明确标为"样例"
- 有真实 PredictionRun 数据时标签不显示

**预估工期**：0.5 天

---

### P2-4：库存 API 移除本地 status 推断

**问题**：`src/api/real/inventory.ts:37-50` 在前端根据 `currentStock/safetyStock` 本地计算库存状态，而非由后端统一返回。

**实现方案**：

1. 后端 `inventory.service.ts` 在返回库存列表时直接计算并返回 `status` 字段：

```typescript
// inventory.service.ts → getStockItems
const items = await this.prisma.stockItem.findMany({ ... });
return items.map(item => ({
  ...item,
  status: item.currentStock <= 0 ? 'out_of_stock'
    : item.currentStock <= item.safetyStock ? 'low'
    : 'normal',
  availableStock: Math.max(0, item.currentStock - (item.reserved ?? 0)),
}));
```

2. 前端 `src/api/real/inventory.ts` 直接使用后端返回的 `status`，移除本地推断逻辑。

**文件**：
- `packages/server-v2/src/inventory/inventory.service.ts`
- `src/api/real/inventory.ts`

**验收标准**：
- 前端不再自行判断库存状态
- 后端返回 `status` 字段，前端直接消费

**预估工期**：0.5 天

---

### P2-5：Product DTO 校验补齐

**问题**：`products.service.ts` 的 `create(data: any)` 使用 `any` 类型透传，关键商品字段（品牌/规格/成本价/保质期/供应商等）是否填写完全取决于前端。

**实现方案**：

1. 新建 `CreateProductDto` 和 `UpdateProductDto`：

```typescript
export class CreateProductDto {
  @IsString() name: string;
  @IsInt() categoryId: number;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() spec?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsNumber() costPrice?: number;
  @IsNumber() retailPrice: number;
  @IsOptional() @IsNumber() salePrice?: number;
  @IsOptional() @IsInt() shelfLife?: number;
  @IsOptional() @IsString() supplier?: string;
  @IsOptional() @IsInt() safetyStock?: number;
  @IsOptional() @IsString() image?: string;
  @IsOptional() @IsString() status?: string;
}
```

2. 在 `products.controller.ts` 中使用 DTO：

```typescript
@Post()
create(@Body() dto: CreateProductDto, @Headers('x-store-id') storeId?: string) {
  return this.productsService.create({ ...dto, storeId: storeId ? Number(storeId) : undefined });
}
```

**文件**：
- `packages/server-v2/src/products/dto/` (新建)
- `packages/server-v2/src/products/products.controller.ts`
- `packages/server-v2/src/products/products.service.ts`

**验收标准**：
- 创建商品时 `name`、`categoryId`、`retailPrice` 为必填
- 不符合 DTO 的请求返回 400 错误

**预估工期**：1 天

---

### P2-6：Kiosk 自动化草稿校验后移

**问题**：`auraCoreService.ts:1170-1253` 自动化草稿完全在前端构造和解析，未经后端校验就展示给用户。

**实现方案**：

1. 在现有 `POST /terminal/automations/preview` 接口中增加对草稿字段完整性的校验，返回 `{ isValid, missingFields, warnings }` 信息。

2. Kiosk 端 `AutomationDraftCard` 在展示前先调用 preview 接口，如果后端返回 `missingFields`，在 UI 上明确标出哪些字段需要补充。

3. 仅在 preview 通过后才允许点击"启用"按钮。

**文件**：
- `packages/server-v2/src/terminal/terminal.service.ts` → `previewTerminalAutomationStrategy`
- `packages/Ami-Aura-Lite-Kiosk/src/app/components/AutomationDraftCard.tsx`
- `packages/Ami-Aura-Lite-Kiosk/src/app/services/auraCoreService.ts`

**验收标准**：
- 不完整的自动化草稿无法直接启用
- 缺失字段有明确提示

**预估工期**：1 天

---

## 交付总览

| 优先级 | 任务 | 预估 | 核心改动 |
|--------|------|------|----------|
| P0-1 | Dashboard 去除硬编码 KPI | 1 天 | 管理端 Dashboard.tsx |
| P0-2 | CreateActivityDialog 客户计数真实化 | 1.5 天 | 后端新接口 + 前端改造 |
| P0-3 | CreateActivityDialog 门店信息动态化 | 0.5 天 | 前端 |
| P0-4 | Customer DTO 字段扩展 | 1.5 天 | 后端 DTO + 前端表单 |
| P1-1 | 商品列表改真实 API | 0.5 天 | 前端 |
| P1-2 | 设备状态真实化 | 1.5 天 | schema + 后端 + 前端 |
| P1-3 | 美容师 specialties 保障 | 0.5 天 | 后端 + 前端 |
| P1-4 | 活动计数门店过滤 | 0.5 天 | 后端 |
| P1-5 | 卡项字段后端校验 | 0.5 天 | 后端 DTO |
| P2-1 | 创建客户同步建健康档案 | 0.5 天 | 后端 |
| P2-2 | 终端 API 失败可视化 | 1 天 | Kiosk |
| P2-3 | 营销推荐 fallback 标记 | 0.5 天 | 后端 + 前端 |
| P2-4 | 库存状态后端统一返回 | 0.5 天 | 后端 + 前端 |
| P2-5 | Product DTO 校验 | 1 天 | 后端 |
| P2-6 | 自动化草稿校验后移 | 1 天 | 后端 + Kiosk |

**总预估**：
- P0（上线前必做）：5 天
- P1（影响准确性）：3.5 天
- P2（改善完整度）：5 天
- **合计**：13.5 天，建议分 3 周迭代完成

---

## 修复原则

1. **不删数据** — 只加字段和校验，不修改已有数据结构
2. **向后兼容** — 新增字段全部 Optional，老数据不受影响
3. **先显示真实状态，再补数据** — 优先让"没有数据"能被用户看到，而非继续用假数据掩盖
4. **前端不造数据** — 前端只做展示和格式化，不做数据推断和本地聚合
5. **每次改动跑测试** — `npm run test` + `npm run build` + `cd packages/server-v2 && npx tsc`
