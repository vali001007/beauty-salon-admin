# 数据补齐与业务闭环 — 任务卡清单

版本：v1.0
日期：2026-06-07
来源文档：`docs/03-开发计划/data-completion-and-integration-plan.md`
任务管理方式：每张卡可独立分配、独立交付、独立验收

---

## 阶段一：去伪存真

---

### TASK-101：Dashboard 去除硬编码 KPI

| 字段 | 内容 |
|------|------|
| **优先级** | P0 |
| **预估工时** | 1 天 |
| **分配建议** | 前端 |
| **依赖** | 无 |

**描述**：
移除 `Dashboard.tsx` 中三个角色 (`manager`/`reception`/`beautician`) 的全部硬编码 KPI 数值（客户数 2847、今日收入 ¥45680 等）。API 返回空或报错时显示骨架屏/占位符 `—`，而非假数字。

**涉及文件**：
- `src/app/pages/Dashboard.tsx`（删除 `workspaceConfig` 中所有硬编码 value/hint）

**具体步骤**：
1. 将 `workspaceConfig` 改为只定义结构（key/label/icon/tone/path），不含 value
2. `metrics` 渲染从 `overview?.metrics` 映射到结构，空值显示 `—`
3. `priorities` 为空时显示"当前无待办事项"
4. "门店运行状态"区域（342-355 行）：无终端设备时整段隐藏
5. 移除 `显示默认样例` 错误降级逻辑

**验收标准**：
- [ ] API 返回正常数据时 KPI 显示真实值
- [ ] API 返回空/报错时不显示任何数字，只显示骨架屏
- [ ] 代码中无任何硬编码数字
- [ ] `npm run build` 通过

---

### TASK-102：CreateActivityDialog 客户计数真实化

| 字段 | 内容 |
|------|------|
| **优先级** | P0 |
| **预估工时** | 1.5 天 |
| **分配建议** | 全栈（后端接口 + 前端改造） |
| **依赖** | 无 |

**描述**：
移除 `CreateActivityDialog.tsx` 中对 `mock/data/customers.json` 和 `mock/data/health-profiles.json` 的导入，改为调用后端真实客户分群计数接口。

**涉及文件**：
- `packages/server-v2/src/customers/customers.controller.ts`（新增 `GET /customers/segment-count`）
- `packages/server-v2/src/customers/customers.service.ts`（新增 `getSegmentCount` 方法）
- `src/api/real/customer.ts`（新增 `realGetCustomerSegmentCount`）
- `src/api/customer.ts`（导出）
- `src/app/components/CreateActivityDialog.tsx`（替换 mock 导入）

**具体步骤**：
1. 后端新增 `GET /customers/segment-count` 接口：
   - 接受 `storeId`、`segment`、`skinType`、`memberLevel`、`daysSinceLastVisit` 查询参数
   - 返回 `{ count: number, filters: {...} }`
2. 前端 API 层新增 `getCustomerSegmentCount(params)` 函数
3. `CreateActivityDialog` 中移除 `import rawCustomers` 和 `import rawHealthProfiles`
4. 用 `useEffect` 在分群条件变化时调用真实 API
5. API 失败时 count 显示 `—` 而非 0

**验收标准**：
- [ ] 代码中不再 import 任何 `mock/data/*.json`
- [ ] "符合条件客户"数字来自后端真实查询
- [ ] 后端 `npm run test` 通过
- [ ] 前端 `npm run build` 通过

---

### TASK-103：CreateActivityDialog 门店信息动态化

| 字段 | 内容 |
|------|------|
| **优先级** | P0 |
| **预估工时** | 0.5 天 |
| **分配建议** | 前端 |
| **依赖** | 无 |

**描述**：
移除 `CreateActivityDialog.tsx:98-99` 的硬编码门店常量 `STORE_NAME = '心悦芸美容养生会所'` 和 `STORE_PHONE = '0571-88888888'`，改为从 `storeStore` 获取当前门店信息。

**涉及文件**：
- `src/app/components/CreateActivityDialog.tsx`

**具体步骤**：
1. 引入 `useStoreStore`
2. 获取当前门店 `name`、`phone`、`address`
3. 删除 `STORE_NAME` 和 `STORE_PHONE` 常量
4. 将门店信息传入 AI 生成请求和 pageSchema 构建
5. 门店缺少电话时在 UI 提示"请先在系统设置中完善门店联系方式"

**验收标准**：
- [ ] 切换门店后弹窗自动更新门店信息
- [ ] 发布的营销页显示当前门店真实信息
- [ ] 代码中无硬编码门店名/电话

---

### TASK-104：CreateActivityDialog 商品列表改真实 API

| 字段 | 内容 |
|------|------|
| **优先级** | P1 |
| **预估工时** | 0.5 天 |
| **分配建议** | 前端 |
| **依赖** | 无 |

**描述**：
移除 `CreateActivityDialog.tsx:351-357` 的硬编码商品列表（玻尿酸精华液/修复面膜等），改为调用 `getProducts` API。

**涉及文件**：
- `src/app/components/CreateActivityDialog.tsx`

**具体步骤**：
1. 组件加载时调用 `getProducts({ status: 'active', pageSize: 100 })`
2. 商品选择列表从返回数据渲染
3. 删除硬编码 `products` 数组
4. 商品为空时提示"暂无可选商品"

**验收标准**：
- [ ] 商品选择来自真实 API
- [ ] 商品库为空时有明确提示

---

### TASK-105：终端 API 失败可视化

| 字段 | 内容 |
|------|------|
| **优先级** | P2 |
| **预估工时** | 1 天 |
| **分配建议** | 前端（Kiosk） |
| **依赖** | 无 |

**描述**：
改造 Kiosk 的 `optionalCoreCall` 机制，API 失败时在 UI 上明确标注"数据暂不可用"，而非静默显示空白。

**涉及文件**：
- `packages/Ami-Aura-Lite-Kiosk/src/app/services/auraCoreService.ts`
- `packages/Ami-Aura-Lite-Kiosk/src/app/AppContent.tsx`
- `packages/Ami-Aura-Lite-Kiosk/src/app/components/RoleDashboards.tsx`

**具体步骤**：
1. `optionalCoreCall` 返回 `{ data, source: 'api' | 'fallback', error?: string }`
2. 仪表盘组件在 `source === 'fallback'` 时显示橙色提示条
3. 美容师无数据时显示"暂无排班数据"而非空白

**验收标准**：
- [ ] 后端不可达时 Kiosk 显示"数据暂不可用"
- [ ] 不再静默空白导致用户误判

---

### TASK-106：营销推荐 Fallback 标记

| 字段 | 内容 |
|------|------|
| **优先级** | P2 |
| **预估工时** | 0.5 天 |
| **分配建议** | 全栈 |
| **依赖** | 无 |

**描述**：
后端 fallback 推荐卡增加 `isFallback: true`，前端展示"样例建议"标签。

**涉及文件**：
- `packages/server-v2/src/marketing/marketing.service.ts`
- `src/app/pages/MarketingRecommendation.tsx`

**具体步骤**：
1. `buildFallbackRecommendationCards` 每张卡加 `isFallback: true`
2. 管理端推荐页在 `card.isFallback` 时渲染橙色"样例建议"Badge

**验收标准**：
- [ ] 无预测数据时推荐卡标为"样例"
- [ ] 有真实数据时标签不显示

---

## 阶段二：补齐写入通道

---

### TASK-201：Customer DTO 全字段扩展

| 字段 | 内容 |
|------|------|
| **优先级** | P0 |
| **预估工时** | 1.5 天 |
| **分配建议** | 全栈 |
| **依赖** | 无 |

**描述**：
`CreateCustomerDto` 扩展 13 个缺失字段（birthday/occupation/address/allergy/surgery/skinType 等），让管理端可以完整录入客户档案。

**涉及文件**：
- `packages/server-v2/src/customers/dto/create-customer.dto.ts`
- `packages/server-v2/src/customers/dto/update-customer.dto.ts`（如有）
- `packages/server-v2/src/customers/customers.service.ts`（确认透传）
- 管理端客户编辑表单组件

**具体步骤**：
1. DTO 新增 13 个 `@IsOptional()` 字段
2. 确认 service 透传 dto 到 Prisma
3. 管理端客户编辑表单分组增加"体征信息"和"健康背景"区域
4. 创建客户时同步创建空 `CustomerHealthProfile`（upsert）

**验收标准**：
- [ ] API 可创建/更新全部 schema 字段
- [ ] 管理端表单覆盖关键字段（生日/职业/地址/过敏/手术/肤质）
- [ ] 旧数据（null 值）不影响展示
- [ ] 后端 `npx tsc` 通过

---

### TASK-202：ProductOrder 增加 source 字段

| 字段 | 内容 |
|------|------|
| **优先级** | P0 |
| **预估工时** | 0.5 天 |
| **分配建议** | 后端 |
| **依赖** | 无 |

**描述**：
前端提交 `source: 'admin' | 'terminal' | 'miniapp'` 但后端 schema 无此字段，数据丢失。

**涉及文件**：
- `packages/server-v2/prisma/schema.prisma`
- `packages/server-v2/src/orders/orders.service.ts`

**具体步骤**：
1. Schema 增加 `source String?` 字段
2. 运行 `npx prisma migrate dev --name add-order-source`
3. Service create 方法存储 `dto.source ?? 'admin'`
4. Terminal checkout 存储 `source: 'terminal'`

**验收标准**：
- [ ] 迁移成功
- [ ] 新订单 source 字段正确存储
- [ ] 旧订单 source 为 null，不影响查询

---

### TASK-203：Promotion CRUD 接口 + 管理页面

| 字段 | 内容 |
|------|------|
| **优先级** | P1 |
| **预估工时** | 2 天 |
| **分配建议** | 全栈 |
| **依赖** | 无 |

**描述**：
`Promotion` 模型在 schema 存在、终端在用，但无管理端 CRUD。新建完整模块。

**涉及文件**：
- `packages/server-v2/src/promotions/`（新建模块）
- `src/app/pages/PromotionManagement.tsx`（新建）
- `src/api/real/promotion.ts`（新建）
- `src/app/routes.tsx`（注册路由）
- `src/app/components/Layout.tsx`（菜单入口）

**具体步骤**：
1. 后端新建 `promotions.module.ts`、`controller.ts`、`service.ts`、DTO
2. 接口：GET(分页)、POST、PUT、DELETE、publish、offline
3. 在 `app.module.ts` 注册
4. 前端新建管理页面（表格 + 创建/编辑弹窗）
5. 在菜单"智能营销"下增加"优惠活动"入口
6. 路由注册 `/customer-marketing/promotions`

**验收标准**：
- [ ] 管理端可创建/编辑/发布/下线优惠活动
- [ ] 终端 `GET /terminal/promotions/available` 返回管理端创建的数据
- [ ] 后端 `npm run test` 通过

---

### TASK-204：终端设备管理页面 + 激活流程

| 字段 | 内容 |
|------|------|
| **优先级** | P1 |
| **预估工时** | 2 天 |
| **分配建议** | 全栈 |
| **依赖** | 无 |

**描述**：
`TerminalDevice` 只能通过 seed 预置，无管理端创建接口。新建设备管理页面 + 预置/激活流程。

**涉及文件**：
- `packages/server-v2/src/terminal/terminal.controller.ts`（新增 provision/list/delete）
- `packages/server-v2/src/terminal/terminal.service.ts`（新增方法）
- `src/app/pages/system/DeviceManagement.tsx`（新建）
- `src/app/routes.tsx`
- `src/app/components/Layout.tsx`

**具体步骤**：
1. 后端新增：
   - `POST /terminal/devices/provision`（生成 deviceCode + activationCode）
   - `GET /terminal/devices/admin-list`（管理端设备列表，JWT 鉴权）
   - `DELETE /terminal/devices/:id`
2. 前端新建 `/system/devices` 页面：设备列表、添加设备、设备详情
3. 设备状态：在线/离线/未激活
4. 菜单"系统设置"下增加"终端设备"入口

**验收标准**：
- [ ] 管理端可添加新设备并生成激活码
- [ ] 终端用激活码登录后状态变为在线
- [ ] 设备离线超 5 分钟标为 offline

---

### TASK-205：设备外设状态字段

| 字段 | 内容 |
|------|------|
| **优先级** | P1 |
| **预估工时** | 1 天 |
| **分配建议** | 后端 + Kiosk |
| **依赖** | TASK-204 |

**描述**：
移除终端服务硬编码的 `scanner: 'online'`、`camera: 'online'`，改为从数据库读取，heartbeat 上报时更新。

**涉及文件**：
- `packages/server-v2/prisma/schema.prisma`（TerminalDevice 加字段）
- `packages/server-v2/src/terminal/dto/device-heartbeat.dto.ts`
- `packages/server-v2/src/terminal/terminal.service.ts`

**具体步骤**：
1. Schema 新增 `printerStatus`、`scannerStatus`、`cameraStatus` 字段
2. 运行迁移
3. `DeviceHeartbeatDto` 增加三个可选字段
4. `deviceHeartbeat` 方法写入这三个字段
5. `getDeviceStatus` 从数据库读取，移除硬编码 `'online'`

**验收标准**：
- [ ] heartbeat 上报外设状态后 API 返回真实值
- [ ] 未上报时返回 `'unknown'` 而非 `'online'`

---

### TASK-206：MarketingActivity 效果聚合

| 字段 | 内容 |
|------|------|
| **优先级** | P2 |
| **预估工时** | 0.5 天 |
| **分配建议** | 后端 |
| **依赖** | 无 |

**描述**：
`MarketingActivity.participants` 和 `conversion` 创建时写 0 后无更新。新增 lazy 聚合。

**涉及文件**：
- `packages/server-v2/src/marketing/marketing.service.ts`

**具体步骤**：
1. 新增 `refreshActivityMetrics(activityId)` 方法
2. 在 `GET /marketing/activities/:id` 时触发 lazy 刷新
3. 用 `MarketingPageLead.count` 和 `ProductOrder.count` 聚合

**验收标准**：
- [ ] 活动详情页显示真实参与人数和转化率

---

### TASK-207：Dashboard 活动计数加门店过滤

| 字段 | 内容 |
|------|------|
| **优先级** | P1 |
| **预估工时** | 0.5 天 |
| **分配建议** | 后端 |
| **依赖** | 无 |

**描述**：
`dashboard.service.ts` "进行中活动"计数未按 storeId 过滤。

**涉及文件**：
- `packages/server-v2/src/dashboard/dashboard.service.ts`

**具体步骤**：
1. 活动计数查询增加 `storeId` 条件
2. 其他聚合指标确认已有门店过滤

**验收标准**：
- [ ] 切换门店后活动计数只显示当前门店数据

---

### TASK-208：Product DTO 强类型化

| 字段 | 内容 |
|------|------|
| **优先级** | P2 |
| **预估工时** | 1 天 |
| **分配建议** | 后端 |
| **依赖** | 无 |

**描述**：
`products.service.ts` 使用 `create(data: any)` 透传，无类型校验。

**涉及文件**：
- `packages/server-v2/src/products/dto/`（新建）
- `packages/server-v2/src/products/products.controller.ts`
- `packages/server-v2/src/products/products.service.ts`

**具体步骤**：
1. 新建 `CreateProductDto`（name/categoryId/retailPrice 必填，其余 Optional）
2. 新建 `UpdateProductDto`（PartialType）
3. Controller 使用 DTO 替代 any
4. Service 方法签名改为 DTO 类型

**验收标准**：
- [ ] 创建商品时 name/categoryId/retailPrice 为必填
- [ ] 不符合 DTO 的请求返回 400

---

### TASK-209：库存状态由后端统一返回

| 字段 | 内容 |
|------|------|
| **优先级** | P2 |
| **预估工时** | 0.5 天 |
| **分配建议** | 全栈 |
| **依赖** | 无 |

**描述**：
移除前端本地库存状态推断逻辑，后端直接返回 `status` 字段。

**涉及文件**：
- `packages/server-v2/src/inventory/inventory.service.ts`
- `src/api/real/inventory.ts`

**具体步骤**：
1. 后端 `getStockItems` 返回时计算 `status`：`out_of_stock | low | normal`
2. 前端移除本地 status 推断，直接消费后端字段

**验收标准**：
- [ ] 前端不再自行判断库存状态
- [ ] 后端返回的 status 与前端展示一致

---

## 阶段三：接入核心第三方

---

### TASK-301：微信支付 JSAPI 接入

| 字段 | 内容 |
|------|------|
| **优先级** | P0 |
| **预估工时** | 5-7 天 |
| **分配建议** | 后端（支付经验） |
| **依赖** | 微信商户号配置 |

**描述**：
让收银金额从"前端自报支付成功"变为"微信回调确认"。支付未确认前订单保持 `pending`。

**涉及文件**：
- `packages/server-v2/src/payments/`（新建模块）
  - `payments.module.ts`
  - `payments.controller.ts`
  - `payments.service.ts`
  - `wechat-pay.provider.ts`
- `packages/server-v2/src/app.module.ts`（注册模块）

**具体步骤**：
1. 新建 payments 模块
2. 实现 `POST /payments/create`（调微信下单返回 prepay_id）
3. 实现 `POST /payments/notify/wechat`（回调验签 → 更新 PaymentRecord）
4. 实现 `GET /payments/:id/status`（主动查询）
5. 实现 `POST /payments/:id/refund`（调微信退款）
6. 实现 `POST /payments/notify/refund`（退款回调）
7. 改造终端收银流程：checkout 创建 pending 订单 → 唤起支付 → 等回调
8. 现金/余额支付保持现有逻辑不变

**环境变量**：
```
WECHAT_PAY_APPID=
WECHAT_PAY_MCHID=
WECHAT_PAY_API_KEY=
WECHAT_PAY_CERT_PATH=
WECHAT_PAY_NOTIFY_URL=
```

**验收标准**：
- [ ] 微信支付成功后 PaymentRecord.transactionNo 由回调写入
- [ ] 支付超时（5 分钟未回调）订单自动取消
- [ ] 退款发起后由回调确认退款状态
- [ ] 现金/余额支付流程不受影响

---

### TASK-302：SMS 短信发送接入

| 字段 | 内容 |
|------|------|
| **优先级** | P0 |
| **预估工时** | 2-3 天 |
| **分配建议** | 后端 |
| **依赖** | 阿里云短信账号 |

**描述**：
让自动化营销的 SMS 渠道真正发送短信，Touch 状态从 `'reached'` 变为 `'sent'/'delivered'/'failed'`。

**涉及文件**：
- `packages/server-v2/src/sms/`（新建模块）
  - `sms.module.ts`
  - `sms.service.ts`
  - `providers/aliyun-sms.provider.ts`
- `packages/server-v2/src/terminal/terminal.service.ts`（自动化执行集成）
- `packages/server-v2/src/marketing/marketing.service.ts`（管理端执行集成）

**具体步骤**：
1. 新建 sms 模块，抽象 `SmsService.send(phone, templateId, params)`
2. 实现阿里云短信 Provider（`@alicloud/dysmsapi20170525`）
3. 自动化执行时：channel === 'sms' → 调用 SmsService → 更新 Touch status
4. 发送限流：单客户单日最多 3 条
5. 发送失败时 Touch status 设为 `'failed'`，记录错误原因

**环境变量**：
```
SMS_PROVIDER=aliyun
SMS_ACCESS_KEY_ID=
SMS_ACCESS_KEY_SECRET=
SMS_SIGN_NAME=Ami门店
SMS_DAILY_LIMIT_PER_CUSTOMER=3
```

**验收标准**：
- [ ] 自动化策略执行后目标客户收到真实短信
- [ ] Touch.status 正确反映发送结果
- [ ] 超过日发送限制时跳过并标记 `'skipped'`
- [ ] 无 SMS 配置时不崩溃，只 warn 并标记 `'channel_unavailable'`

---

### TASK-303：微信服务号模板消息

| 字段 | 内容 |
|------|------|
| **优先级** | P1 |
| **预估工时** | 3-4 天 |
| **分配建议** | 后端 |
| **依赖** | 微信公众号 + 客户 openId 绑定（可先不绑定，有 openId 时发送） |

**描述**：
接入微信服务号模板消息，支持预约确认/到店提醒/服务完成/营销触达等场景。

**涉及文件**：
- `packages/server-v2/src/wechat/`（新建模块）
  - `wechat.module.ts`
  - `wechat.service.ts`（access_token 管理 + 发送）
  - `templates.ts`（模板 ID 配置）
- `packages/server-v2/prisma/schema.prisma`（Customer 增加 `openId`）

**具体步骤**：
1. Customer 模型增加 `openId String? @unique`
2. 新建 wechat 模块，实现 access_token 获取和缓存
3. 实现 `sendTemplateMessage(openId, templateId, data, url?)`
4. 预约确认时：如客户有 openId 则推送
5. 自动化 wechat 渠道：调用模板消息发送

**环境变量**：
```
WECHAT_OA_APPID=
WECHAT_OA_SECRET=
WECHAT_TEMPLATE_BOOKING_CONFIRM=
WECHAT_TEMPLATE_VISIT_REMIND=
WECHAT_TEMPLATE_SERVICE_DONE=
WECHAT_TEMPLATE_MARKETING=
```

**验收标准**：
- [ ] 有 openId 的客户在预约确认后收到模板消息
- [ ] 无 openId 时静默跳过，不报错
- [ ] 自动化 wechat 渠道真正发送

---

### TASK-304：小程序行为埋点 SDK + 上报

| 字段 | 内容 |
|------|------|
| **优先级** | P1 |
| **预估工时** | 3-4 天 |
| **分配建议** | 前端（小程序/H5） |
| **依赖** | 后端 `POST /marketing/customer-events` 已就绪 |

**描述**：
为推荐引擎提供"浏览放弃/领券未核销/预约放弃"等即时信号来源。

**涉及文件**：
- 小程序端或 marketing-h5 增加 SDK（新建 `packages/tracking-sdk/` 或嵌入 marketing-h5）
- 后端接口已存在（`POST /marketing/customer-events`），无需改动

**具体步骤**：
1. 新建轻量 tracking SDK（< 2KB）：
   - `track(eventType, target, metadata?)` 方法
   - 自动管理 sessionId
   - fire-and-forget 发送
2. 在 marketing-h5 的关键位置埋点：
   - 页面打开：`page_view`
   - 浏览超 30s 未操作：`browse_abandon`
   - CTA 点击：`click_cta`
   - 表单提交：`lead_submit`
3. 在小程序端（如有）对应位置埋点
4. 后端验证 `CustomerBehaviorEvent` 正确入库

**验收标准**：
- [ ] 用户打开 H5 页面后 `page_view` 事件入库
- [ ] 浏览放弃事件正确触发
- [ ] 后端 `CustomerBehaviorEvent` 表有数据

---

## 阶段四：扩展集成

---

### TASK-401：打印机 ESC/POS 对接

| 字段 | 内容 |
|------|------|
| **优先级** | P2 |
| **预估工时** | 2-3 天 |
| **分配建议** | Kiosk 终端开发 |
| **依赖** | 网络打印机硬件 |

**描述**：
Kiosk 终端本地集成打印 SDK（网络打印机 HTTP/TCP），收银后自动出小票。

**涉及文件**：
- `packages/Ami-Aura-Lite-Kiosk/src/app/services/printService.ts`（新建）
- Heartbeat 上报 printerStatus

**验收标准**：
- [ ] 收银完成后自动发送打印指令
- [ ] 打印失败时 UI 提示并支持重试
- [ ] Heartbeat 上报打印机在线/离线状态

---

### TASK-402：小程序 OAuth + 会员绑定

| 字段 | 内容 |
|------|------|
| **优先级** | P2 |
| **预估工时** | 4-5 天 |
| **分配建议** | 全栈 |
| **依赖** | 微信小程序账号 |

**描述**：
将小程序 openId 与 Customer 绑定，实现跨端客户识别。

**涉及文件**：
- `packages/server-v2/src/auth/`（新增微信小程序登录）
- `packages/server-v2/prisma/schema.prisma`（Customer 增加 openId）

**具体步骤**：
1. 新增 `POST /auth/wechat-miniapp`（code → openId → 匹配/创建客户）
2. Customer 表 openId 唯一索引
3. 已有客户通过手机号匹配绑定 openId
4. 新客户自动创建 Customer 记录

**验收标准**：
- [ ] 小程序授权后 Customer.openId 正确绑定
- [ ] 已注册客户通过手机号匹配
- [ ] 绑定后营销页面事件自动关联 customerId

---

### TASK-403：皮肤检测仪器 SDK 对接

| 字段 | 内容 |
|------|------|
| **优先级** | P3 |
| **预估工时** | 视仪器而定（2-5 天） |
| **分配建议** | Kiosk 终端开发 |
| **依赖** | 具体仪器型号确认 |

**描述**：
对接具体皮肤检测仪器（如 VISIA/Observ），检测数据自动入库。

**验收标准**：
- [ ] 仪器检测完成后数据自动填充到 SkinTest
- [ ] `instrument` 字段标明仪器型号
- [ ] 无仪器时 fallback 到 AI 分析

---

### TASK-404：供应商采购系统对接

| 字段 | 内容 |
|------|------|
| **优先级** | P3 |
| **预估工时** | 视供应商而定 |
| **分配建议** | 后端 |
| **依赖** | 供应商 API 文档 |

**描述**：
库存预警触发时自动生成采购建议并对接供应商系统。

**验收标准**：
- [ ] 库存低于安全线时自动生成采购建议
- [ ] 确认后自动向供应商下单
- [ ] 供应商发货后自动入库

---

## 任务依赖关系图

```
阶段一（并行）                    阶段二（并行）              阶段三
┌─────────┐                    ┌─────────┐
│ TASK-101│──┐                 │ TASK-201│
│ TASK-102│  │                 │ TASK-202│
│ TASK-103│  ├── 全部完成后 ──→ │ TASK-203│──┐
│ TASK-104│  │                 │ TASK-204│──┼── TASK-205
│ TASK-105│  │                 │ TASK-206│  │
│ TASK-106│──┘                 │ TASK-207│  ├── 全部完成后 ──→ TASK-301
                               │ TASK-208│  │                  TASK-302
                               │ TASK-209│──┘                  TASK-303
                                                               TASK-304

阶段四（按需，独立）
TASK-401 / TASK-402 / TASK-403 / TASK-404
```

---

## 工时汇总

| 阶段 | 任务数 | 总工时 | 可并行度 | 实际日历时间 |
|------|--------|--------|----------|-------------|
| 阶段一 | 6 | 5 天 | 高（全部可并行） | 1-1.5 周 |
| 阶段二 | 9 | 10 天 | 高（大部分可并行） | 1.5-2 周 |
| 阶段三 | 4 | 13-18 天 | 中（301/302 可并行，303 依赖 openId） | 2.5-3 周 |
| 阶段四 | 4 | 按需 | 高（全部独立） | 按需 |
| **总计** | **23 张任务卡** | **28-33 天** | | **约 7 周** |
