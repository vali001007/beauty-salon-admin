# 数据补齐与业务闭环方案

版本：v1.0  
日期：2026-06-07  
适用范围：管理端、server-v2 后端、Ami-Aura-Lite-Kiosk 终端、小程序/H5  
前置文档：`docs/data-integrity-fix-plan.md`、`docs/aura-lite-terminal-closure-development-plan.md`

---

## 背景

系统存在三类数据问题：

1. **假数据掩盖真实状态** — Dashboard/活动弹窗使用硬编码或 mock 数据，让用户以为系统在正常运转
2. **字段存在但无写入通道** — schema 定义了 30+ 字段但 DTO/接口不支持写入
3. **关键第三方未接入** — 支付确认、SMS 发送、微信通知、小程序行为等业务闭环的"最后一公里"缺失

本方案整合所有数据问题，按 4 个阶段系统性修复，确保系统从"可演示"升级为"可信任的生产系统"。

---

## 阶段一：去伪存真（2 周）

> 目标：消除所有假数据展示，让用户看到的一定是真实状态

### 1.1 Dashboard 去除硬编码 KPI

**问题**：`Dashboard.tsx:91-153` 硬编码三个角色全部 KPI（客户数 2847、收入 ¥45680 等）。

**改动**：

| 文件 | 动作 |
|------|------|
| `src/app/pages/Dashboard.tsx` | 移除 `workspaceConfig` 中所有硬编码数值；API 空时显示 `—` + "暂无数据" |
| `src/app/pages/Dashboard.tsx:342-355` | "门店运行状态"改为调用设备 API 或隐藏（无终端时不展示） |

**验收**：API 断连时 Dashboard 显示骨架屏而非假数字。

---

### 1.2 CreateActivityDialog 数据来源修复

**问题**：4 处硬编码/mock 数据。

| 序号 | 问题 | 修复 |
|------|------|------|
| 1 | import mock/data/customers.json 做分群计数 | 调用 `GET /customers/segment-count` 真实 API |
| 2 | 硬编码 5 个商品名 | 调用 `getProducts({ status: 'active' })` |
| 3 | 门店名 `'心悦芸美容养生会所'` + 电话 `'0571-88888888'` | 从 `storeStore` 取当前门店信息 |
| 4 | `participants: 0, conversion: '0%'` 创建时硬编码 | 移除这两个字段初始化，后端聚合填充 |

**新增接口**：

```typescript
// packages/server-v2/src/customers/customers.controller.ts
@Get('segment-count')
getSegmentCount(@Headers('x-store-id') storeId?: string, @Query() filters: SegmentCountQueryDto)
```

**验收**：活动创建弹窗中"符合条件客户"数字来自真实查询；商品选择列表来自真实商品库。

---

### 1.3 API 层移除假默认值填充

**问题**：前端 API 层用本地默认值掩盖了后端数据缺失。

| 文件 | 当前行为 | 修复 |
|------|----------|------|
| `src/api/real/beautician.ts:17-18` | specialties 默认 `['面部护理','肌肤管理']` | 改为 `[]`，前端显示"未设置" |
| `src/api/real/card.ts:36-41` | type 默认 `'次卡'`，validDays 默认 `365` | 保留但加 `console.warn` 提醒数据不完整 |
| `src/api/real/inventory.ts:37-50` | status 本地推断 | 后端统一返回 status 字段 |

**后端配合改动**：

```typescript
// inventory.service.ts → getStockItems 返回时直接计算 status
status: item.currentStock <= 0 ? 'out_of_stock'
  : item.currentStock <= (item.safetyStock ?? 0) ? 'low'
  : 'normal',
```

---

### 1.4 终端 Fallback 可视化

**问题**：`auraCoreService.ts` 的 `optionalCoreCall` 静默返回空数据。

**改动**：

1. `optionalCoreCall` 返回 `{ data, source: 'api' | 'fallback' }` 结构
2. Kiosk 组件在 `source === 'fallback'` 时显示橙色"数据暂不可用"提示条
3. 美容师空仪表盘改为"暂无排班数据"而非静默空白

---

### 1.5 营销推荐 Fallback 标记

**改动**：`marketing.service.ts` 的 fallback 推荐卡增加 `isFallback: true`，前端展示"样例建议"标签。

---

**阶段一总工期**：8-10 天

---

## 阶段二：补齐写入通道（2 周）

> 目标：让 schema 中定义的每个字段都有明确的写入路径

### 2.1 Customer DTO 全字段扩展

**当前**：`CreateCustomerDto` 只接受 10 个字段，schema 有 25+ 字段。

**改动**：

```typescript
// CreateCustomerDto 新增
birthday?: string;      // ISO date
landline?: string;
maritalStatus?: string; // single | married | divorced | widowed
age?: number;
height?: number;
weight?: number;
occupation?: string;
workplace?: string;
address?: string;
hasAllergy?: boolean;
hasSurgery?: boolean;
skinCondition?: string;
skinType?: string;
```

**配合改动**：
- 管理端客户编辑表单分组增加"体征信息"和"健康背景"区域
- 管理端创建客户时同步创建空 `CustomerHealthProfile`
- 终端 `quick-create` DTO 保持轻量（name/phone/gender/source），详细信息由管理端后补

---

### 2.2 ProductOrder 增加 source 字段

**问题**：前端提交 `source: 'admin' | 'terminal' | 'miniapp'`，schema 无此字段，数据在入库时丢失。

**改动**：

```prisma
model ProductOrder {
  // 已有字段...
  source    String?   // "admin" | "terminal" | "miniapp" | "import"
}
```

```typescript
// orders.service.ts → create
data: { ...dto, source: dto.source ?? 'admin' }
```

迁移：`ALTER TABLE "ProductOrder" ADD COLUMN "source" TEXT;`

---

### 2.3 Promotion CRUD 接口

**问题**：`Promotion` 模型在 schema 存在、终端在用，但无管理端 CRUD API。

**新建**：

```typescript
// packages/server-v2/src/promotions/
promotions.module.ts
promotions.controller.ts  // GET /promotions, POST, PUT, DELETE
promotions.service.ts
dto/create-promotion.dto.ts
dto/update-promotion.dto.ts
```

接口设计：

| 接口 | 功能 |
|------|------|
| `GET /promotions` | 分页列表（支持 status/storeId 筛选） |
| `POST /promotions` | 创建优惠活动 |
| `PUT /promotions/:id` | 更新 |
| `POST /promotions/:id/publish` | 发布 |
| `POST /promotions/:id/offline` | 下线 |
| `DELETE /promotions/:id` | 删除 |

管理端新增"优惠管理"页面，注册路由 `/customer-marketing/promotions`。

---

### 2.4 终端设备管理页面 + 激活流程

**问题**：`TerminalDevice` 只能通过 seed 预置，无管理端创建接口。

**新建**：

```typescript
// packages/server-v2/src/terminal/ 扩展 controller
@Post('devices/provision')   // 管理端预置设备（生成 deviceCode + activationCode）
@Get('devices')              // 管理端设备列表
@Delete('devices/:id')       // 管理端删除设备
```

管理端新增 `/system/devices` 页面：
- 设备列表（在线/离线/未激活）
- 添加设备（自动生成激活码）
- 设备详情（最近心跳、外设状态、绑定门店）

---

### 2.5 设备外设状态字段

**Schema 新增**：

```prisma
model TerminalDevice {
  // 已有字段...
  printerStatus   String?   // online | offline | error
  scannerStatus   String?   // online | offline
  cameraStatus    String?   // online | offline
  peripheralJson  Json?     // 扩展字段
}
```

**Heartbeat DTO 扩展**：

```typescript
@IsOptional() @IsString() printerStatus?: string;
@IsOptional() @IsString() scannerStatus?: string;
@IsOptional() @IsString() cameraStatus?: string;
```

移除 `terminal.service.ts:1245-1252` 的硬编码 `'online'`。

---

### 2.6 MarketingActivity 效果聚合

**问题**：`participants` 和 `conversion` 创建时写 0，后续无更新。

**改动**：在 `marketing.service.ts` 新增定时聚合或 on-demand 计算：

```typescript
async refreshActivityMetrics(activityId: number) {
  const orders = await this.prisma.productOrder.count({
    where: { activityId, status: 'completed' },
  });
  const leads = await this.prisma.marketingPageLead.count({
    where: { page: { activityId } },
  });
  await this.prisma.marketingActivity.update({
    where: { id: activityId },
    data: {
      participants: leads,
      conversion: orders > 0 && leads > 0 ? `${Math.round((orders / leads) * 100)}%` : '0%',
    },
  });
}
```

在 `GET /marketing/activities/:id` 时触发 lazy 刷新。

---

### 2.7 Dashboard 活动计数加门店过滤

```typescript
// dashboard.service.ts
const campaignCount = await this.prisma.marketingActivity?.count?.({
  where: { status: 'active', ...(storeId ? { storeId } : {}) },
}) ?? 0;
```

---

### 2.8 Product DTO 强类型化

将 `products.service.ts` 的 `create(data: any)` 改为使用正式 DTO：

```typescript
export class CreateProductDto {
  @IsString() name: string;
  @IsInt() categoryId: number;
  @IsNumber() retailPrice: number;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() spec?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsNumber() costPrice?: number;
  @IsOptional() @IsNumber() salePrice?: number;
  @IsOptional() @IsInt() shelfLife?: number;
  @IsOptional() @IsString() supplier?: string;
  @IsOptional() @IsInt() safetyStock?: number;
  @IsOptional() @IsString() image?: string;
}
```

---

**阶段二总工期**：8-10 天

---

## 阶段三：接入核心第三方（3 周）

> 目标：支付可信、触达可达、行为可追踪

### 3.1 微信支付 JSAPI 接入

**价值**：让收银金额从"前端自报"变为"微信确认"。

**架构**：

```
终端/管理端 → POST /payments/create-order → 后端调微信下单 → 返回 prepay_id
客户支付 → 微信回调 → POST /payments/notify → 更新 PaymentRecord.status + transactionNo
```

**新建模块**：`packages/server-v2/src/payments/`

| 文件 | 职责 |
|------|------|
| `payments.module.ts` | 模块注册 |
| `payments.controller.ts` | 下单、回调、查询、退款 |
| `payments.service.ts` | 微信支付 SDK 调用、签名验证 |
| `wechat-pay.provider.ts` | 微信支付配置和 HTTP 客户端 |

**接口**：

| 接口 | 功能 | 说明 |
|------|------|------|
| `POST /payments/create` | 创建支付订单 | 返回 prepay_id 给前端唤起支付 |
| `POST /payments/notify/wechat` | 微信回调 | 验签 → 更新 PaymentRecord → 确认订单 |
| `GET /payments/:id/status` | 主动查询支付状态 | 回调延迟时前端轮询 |
| `POST /payments/:id/refund` | 发起退款 | 调微信退款接口 |
| `POST /payments/notify/refund` | 退款回调 | 更新 RefundRecord |

**配置**：

```env
WECHAT_PAY_APPID=
WECHAT_PAY_MCHID=
WECHAT_PAY_API_KEY=
WECHAT_PAY_CERT_PATH=
WECHAT_PAY_NOTIFY_URL=
```

**关键设计**：
- 支付未确认前订单状态保持 `pending`，不直接标 `completed`
- 前端收银流程改为：创建订单 → 唤起支付 → 等待回调确认 → 显示成功
- 现金/储值余额支付不走微信通道，保持现有逻辑
- `PaymentRecord.transactionNo` 由回调写入而非前端提交

**预估工期**：5-7 天

---

### 3.2 SMS 短信发送接入

**价值**：让自动化营销真正触达客户。

**架构**：

```
MarketingAutomationExecution → TerminalAutomationTouch(status: 'pending')
                             → SmsService.send(phone, template, params)
                             → 回调/轮询 → Touch.status = 'delivered' | 'failed'
```

**新建**：`packages/server-v2/src/sms/`

| 文件 | 职责 |
|------|------|
| `sms.module.ts` | 模块注册 |
| `sms.service.ts` | 短信发送抽象（适配阿里云/云片） |
| `providers/aliyun-sms.provider.ts` | 阿里云短信实现 |

**核心方法**：

```typescript
async send(phone: string, templateId: string, params: Record<string, string>): Promise<{ messageId: string; status: 'sent' | 'failed' }> {
  // 调用阿里云短信 API
  // 成功返回 messageId
  // 失败返回 status: 'failed'
}
```

**与营销自动化集成**：

```typescript
// terminal.service.ts → executeTerminalAutomationStrategy
for (const customer of targetCustomers) {
  const touch = await this.createTouch(execution, customer, 'pending');
  if (channel === 'sms' && customer.phone) {
    const result = await this.smsService.send(customer.phone, templateId, params);
    await this.updateTouchStatus(touch.id, result.status === 'sent' ? 'sent' : 'failed');
  }
}
```

**配置**：

```env
SMS_PROVIDER=aliyun         # aliyun | yunpian
SMS_ACCESS_KEY_ID=
SMS_ACCESS_KEY_SECRET=
SMS_SIGN_NAME=Ami门店
SMS_TEMPLATE_CARE_REMINDER=SMS_123456
SMS_TEMPLATE_MARKETING=SMS_789012
```

**预估工期**：2-3 天

---

### 3.3 微信服务号模板消息

**价值**：到店提醒、核销通知、服务完成通知等关键场景。

**新建**：`packages/server-v2/src/wechat/`

| 接口 | 场景 |
|------|------|
| 预约确认通知 | 客户预约后推送确认 + 到店时间 |
| 到店提醒 | 预约前 2 小时推送 |
| 服务完成通知 | 美容师完成服务后推送满意度评价 |
| 营销触达 | 自动化营销 wechat 渠道 |

**前置条件**：需要微信公众号 + 模板消息权限 + 客户 openId 绑定。

**与 Customer 关联**：在 Customer 模型增加 `openId String?` 字段，小程序 OAuth 后绑定。

**预估工期**：3-4 天

---

### 3.4 小程序行为埋点（CustomerBehaviorEvent 上报端）

**价值**：为推荐引擎提供"浏览放弃/领券未核销/预约放弃"等即时信号。

**架构**：

```
小程序/H5 → SDK 采集行为 → POST /marketing/customer-events → CustomerBehaviorEvent
                                                            → 推荐引擎实时信号
```

**小程序端 SDK**（轻量版）：

```typescript
// packages/miniapp-sdk/track.ts
export function track(eventType: string, target: { type: string; id: number }, metadata?: Record<string, unknown>) {
  const sessionId = getSessionId();
  const customerId = getCurrentCustomerId();
  fetch(`${API_BASE}/marketing/customer-events`, {
    method: 'POST',
    body: JSON.stringify({ eventType, targetType: target.type, targetId: target.id, sessionId, customerId, metadataJson: metadata }),
  }).catch(() => {}); // fire-and-forget
}
```

**埋点事件类型**：

| eventType | 触发场景 | 推荐引擎用途 |
|-----------|----------|-------------|
| `page_view` | 打开项目/商品详情 | 兴趣偏好 |
| `browse_abandon` | 浏览 > 30s 未操作 | 浏览放弃信号 |
| `booking_start` | 点击预约按钮 | 预约意向 |
| `booking_abandon` | 预约流程中退出 | 预约放弃信号 |
| `coupon_claim` | 领取优惠券 | 领券行为 |
| `coupon_unused_remind` | 领券后 7 天未核销 | 领券未核销信号 |
| `share` | 分享页面 | 传播行为 |

**预估工期**：3-4 天（后端已就绪，主要是小程序端 SDK 开发）

---

**阶段三总工期**：13-18 天

---

## 阶段四：扩展集成（按需）

> 目标：硬件对接和供应链等深度集成，按业务进展分批实施

### 4.1 打印机 ESC/POS 对接

**当前**：`PrintJob` 模型完整但状态是模拟的。

**方案**：Kiosk 终端本地集成打印 SDK（网络打印机 HTTP/TCP），heartbeat 上报打印机状态。

| 组件 | 职责 |
|------|------|
| Kiosk 本地打印服务 | 监听 PrintJob 队列，发送 ESC/POS 指令 |
| 后端 PrintJob | 管理队列状态 |
| Heartbeat | 上报 printerStatus |

**预估工期**：2-3 天

---

### 4.2 皮肤检测仪器 SDK

**当前**：Face++ API + AI fallback 已有，但硬件仪器数据未直连。

**方案**：如果对接具体仪器（如 VISIA/Observ），需要：
- 仪器 SDK 在 Kiosk 本地调用
- 检测结果（图片 + metrics JSON）通过 `POST /terminal/skin-tests` 写入
- `instrument` 字段标明来源设备型号

**预估工期**：视仪器而定（2-5 天）

---

### 4.3 供应商/采购系统对接

**当前**：`PurchaseOrder` 可手动创建，但无供应商系统联动。

**未来方向**：
- 库存预警 → 自动生成采购建议 → 供应商确认 → 发货 → 入库
- 需要供应商侧提供 API 或使用中间平台（如 1688 开放平台）

**预估工期**：视供应商合作模式定

---

### 4.4 小程序 OAuth + 会员绑定

**目标**：将小程序 openId 与 Customer 记录绑定，实现跨端客户识别。

**流程**：

```
小程序 wx.login → code → 后端 POST /auth/wechat-miniapp → 换 openId/unionId
  → 查找 Customer(openId) 或创建新客户
  → 返回业务 token + customer 信息
```

**Schema**：`Customer` 增加 `openId String? @unique`

**预估工期**：4-5 天

---

## 交付总览

| 阶段 | 目标 | 任务数 | 工期 | 核心成果 |
|------|------|--------|------|----------|
| **一** | 去伪存真 | 5 项 | 2 周 | 用户看到的每个数字都是真实的 |
| **二** | 补齐写入 | 8 项 | 2 周 | 每个 schema 字段都有明确的写入通道 |
| **三** | 接入第三方 | 4 项 | 3 周 | 支付可信、触达可达、行为可追踪 |
| **四** | 扩展集成 | 4 项 | 按需 | 硬件和供应链深度对接 |

**总计**：阶段一~三约 7 周，可将系统从"演示级"提升为"生产级"。

---

## 数据流完整度预期

| 业务场景 | 当前 | 阶段一后 | 阶段二后 | 阶段三后 |
|----------|------|----------|----------|----------|
| 客户到店消费 | 70% | 75% | 85% | **95%** |
| 会员储值消费 | 80% | 80% | 85% | **95%** |
| 营销活动闭环 | 50% | 55% | 70% | **90%** |
| 库存管理 | 75% | 80% | 85% | 85% |
| 小程序用户行为 | 30% | 30% | 35% | **80%** |
| 终端设备管理 | 60% | 65% | **85%** | 90% |
| 数字员工绩效追踪 | 0% | 0% | 60% | **85%** |

---

## 实施原则

1. **先去假、再补真** — 阶段一的核心是"不骗人"，把假数据换成"暂无数据"；阶段二再补真实写入通道
2. **第三方分步接入** — 支付和 SMS 是 MVP 必须，微信模板和小程序埋点可在用户量起来后接入
3. **向后兼容** — 所有 schema 变更新增字段为 Optional，不影响已有数据
4. **每次改动先跑测试** — `npm run build` + `npm run test` + `cd packages/server-v2 && npx tsc`
5. **文档同步** — 每次接入第三方后更新 `docs/api-contract.md` 和 `.env.example`
