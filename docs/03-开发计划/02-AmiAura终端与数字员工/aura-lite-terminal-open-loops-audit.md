# Ami Aura Lite 智能终端未闭合功能梳理

更新时间：2026-06-02

范围：

- 智能终端主线：`packages/Ami-Aura-Lite-Kiosk`
- 管理端共享 API：`src/api/terminal.ts`、`src/api/real/terminal.ts`、`src/types/terminal.ts`
- 后端主线：`packages/server-v2/src/terminal`
- 数据模型：`packages/server-v2/prisma/schema.prisma`

## 总体结论

智能终端现在已经不是纯静态原型，核心读写链路大多已经接到 Ami_Core / server-v2：

- 已闭合较好：启动上下文、门店切换、今日预约查询、预约新增/修改/确认/取消/到店、核销、收银、办卡、充值、登记、面部检测建档、打印任务。
- 仍未闭合：美容师服务记录的完整表单、服务任务和预约联动、AI 建议落地反馈、营销邀约任务、会员余额消费、打印机真实状态、权限的后端强校验、终端字段与管理端字段的统一。
- 主要风险：终端演示层仍有旧 mock 组件残留，`auraCoreService.ts` 里仍有若干快捷兜底写操作会自动拿第一个客户/第一个项目执行，容易和真实业务逻辑不一致。

## 一、功能闭合矩阵

| 功能 | 当前状态 | 已有接口 | 未闭合点 |
|---|---|---|---|
| 启动上下文 / 角色 / 门店 | 基本闭合 | `GET /terminal/bootstrap`、`GET /terminal/dashboard/role` | 后端权限目前更像返回能力清单，写接口缺少逐动作强权限校验。 |
| 切换门店 | 基本闭合 | 依赖 `X-Store-Id` + `bootstrap` | 前端缓存已清，但需要补自动化测试验证所有卡片随门店刷新。 |
| 店长经营首页 | 部分闭合 | `GET /terminal/dashboard/role` | 经营 KPI 聚合口径和管理端报表口径需要统一，例如订单状态、退款、核销是否计入营业额。 |
| 前台今日预约 | 基本闭合 | `GET /terminal/reservations/today` | 字段仍偏终端展示，和管理端“项目预约”列表字段需对齐更多业务字段，如来源、创建人、取消原因。 |
| 添加预约 | 基本闭合 | `POST /terminal/reservations` | 后端 DTO 仍是 `any`，缺少正式 `CreateReservationDto` 校验；未检查美容师排班冲突。 |
| 修改预约 | 部分闭合 | `PUT /terminal/reservations/:id` | 后端未记录改期历史；取消/改期原因没有独立字段。 |
| 确认预约 / 到店 / 取消 | 基本闭合 | `PATCH /confirm`、`/check-in`、`/cancel` | 到店后没有自动创建服务任务，和美容师工作台联动不足。 |
| 客户查询 / 客户卡片 | 部分闭合 | `GET /terminal/customers/search`、`summary`、`health-profile`、`behavior-profile` | 终端 `getCustomerCard` 仍主要从本地聚合快照取客户和订单，没有完整使用 `summary/health/behavior/records`。 |
| 登记客户 | 基本闭合 | `POST /terminal/customers/quick-create`、`POST /terminal/skin-tests` | 前端只覆盖终端最小字段；与管理端客户完整字段仍未全部一致。 |
| 面部检测 | 部分闭合 | `/ai/skin/analyze`、`POST /terminal/skin-tests` | 终端已接上传/摄像头分析，但删除照片、重新绑定检测、检测历史选择等与管理端能力未完全一致。 |
| 次卡核销 | 基本闭合 | `GET /terminal/customers/:id/cards`、`POST /terminal/cards/verify`、`POST /terminal/cards/consume` | 前端确认核销时默认使用第一个美容师，未让用户选择本次服务美容师；核销后未自动生成服务记录/耗材记录。 |
| 收银 | 基本闭合 | `POST /terminal/cashier/checkout`、`POST /terminal/cashier-orders/:id/complete-payment` | `checkout` 已直接 completed，前端又可能补 complete-payment，支付状态模型需要收敛；会员余额支付未真正扣余额。 |
| 办卡 | 基本闭合 | `POST /terminal/card-orders` | 赠送项目写入订单 payload，但没有独立权益/赠送项目使用规则。 |
| 充值 | 基本闭合 | `POST /terminal/recharge-orders` | 已有余额账本，但缺少“储值余额消费/退款/调整”的终端接口。 |
| 打印小票 | 部分闭合 | `POST /terminal/print-jobs`、`GET /terminal/print-jobs/:id` | 后端默认创建后即 completed，未接真实打印机队列、失败重试、补打历史。 |
| 美容师我的预约 | 部分闭合 | `GET /terminal/tasks`、`GET /terminal/dashboard/role` | 终端首页显示排班/任务，但预约到店后未自动生成或关联服务任务。 |
| 服务记录 / 完成服务 | 未完全闭合 | `PATCH /terminal/tasks/:id/complete`、`POST /terminal/consumption-records` | 前端“服务记录”快捷按钮只是快捷完成第一个任务，没有完整表单：护理结果、图片、耗材、客户反馈、下次建议。 |
| 护理建议 / 推荐 | 部分闭合 | `GET /terminal/customers/:id/recommendations`、`GET /terminal/skin-tests/:id/recommendations`、`POST /terminal/recommendation-events`、`POST /ai/generate/terminal-service-advice` | 前端没有把推荐展示、采纳、跳过、转化完整串起来。 |
| 营销邀约话术 | 部分闭合 | AI 侧有客户摘要/建议能力 | 缺终端专用“邀约任务/话术生成/触达记录/完成反馈”业务闭环接口。 |
| 锁屏 / 指纹入口 | 原型态 | 无真实生物识别接口 | 目前是前端模拟入口，未对接设备能力或 Core 审计。 |

## 二、缺少或需要补强的 API

### 1. 预约模块

当前已有：

- `GET /terminal/reservations/today`
- `POST /terminal/reservations`
- `PUT /terminal/reservations/:id`
- `PATCH /terminal/reservations/:id/confirm`
- `PATCH /terminal/reservations/:id/check-in`
- `PATCH /terminal/reservations/:id/cancel`

需要补强：

- `POST /terminal/reservations/:id/reschedule`：独立改期接口，记录改期原因、原时间、新时间、操作人。
- `POST /terminal/reservations/:id/no-show`：爽约状态，和取消区分。
- `GET /terminal/reservations/availability`：查询美容师可预约时段，避免前端直接提交冲突时间。
- `POST /terminal/reservations/:id/create-task` 或到店自动创建服务任务：把预约和美容师服务工作台打通。

### 2. 服务记录模块

当前已有：

- `GET /terminal/tasks`
- `GET /terminal/tasks/:id`
- `POST /terminal/tasks`
- `PATCH /terminal/tasks/:id/start`
- `PATCH /terminal/tasks/:id/complete`
- `PATCH /terminal/tasks/:id/cancel`
- `POST /terminal/consumption-records`

需要补强：

- `POST /terminal/service-records`：终端服务记录专用提交接口，字段包括 `taskId/customerId/projectId/beauticianId/result/customerFeedback/nextSuggestion/images/consumptionItems/nextReservationSuggestion`。
- `GET /terminal/tasks/:id/service-record`：查看已完成服务记录。
- `PUT /terminal/tasks/:id/service-record`：补充或修改服务记录。
- `POST /terminal/tasks/:id/transfer-cashier`：服务完成后转前台收银。

### 3. 会员余额与支付

当前已有：

- `POST /terminal/recharge-orders`
- Prisma 已有 `CustomerBalanceAccount` 和 `CustomerBalanceTransaction`

需要补强：

- `GET /terminal/customers/:id/balance`：查询储值余额。
- `POST /terminal/balance/consume`：使用储值余额支付，并写余额流水。
- `POST /terminal/balance/refund`：余额退款。
- `POST /terminal/balance/adjust`：后台/店长调整余额，需高权限。
- 收银 `paymentMethod=member_balance` 时必须调用余额扣减，而不是只写普通支付记录。

### 4. 打印与设备

当前已有：

- `POST /terminal/print-jobs`
- `GET /terminal/print-jobs/:id`
- `POST /terminal/devices/heartbeat`

需要补强：

- `GET /terminal/print-jobs?sourceType=&sourceId=`：小票历史和补打。
- `POST /terminal/print-jobs/:id/retry`：失败重试。
- `PATCH /terminal/print-jobs/:id/status`：真实打印机回传队列状态。
- `GET /terminal/devices/status`：网络、打印机、扫码器、摄像头统一状态，替代前端静态“网络正常/打印机/扫码器”。

### 5. AI 推荐与营销邀约

当前已有：

- `POST /ai/chat/messages`
- `POST /ai/generate/customer-summary`
- `POST /ai/generate/service-note-summary`
- `POST /ai/generate/skin-test-explanation`
- `POST /ai/generate/terminal-service-advice`
- `POST /ai/terminal/resolve-intent`
- `POST /terminal/recommendation-events`

需要补强：

- `POST /ai/generate/customer-invitation-script`：基于客户、项目、流失风险生成邀约话术。
- `POST /terminal/follow-up-tasks`：创建客户跟进任务。
- `PATCH /terminal/follow-up-tasks/:id/complete`：记录邀约结果。
- `GET /terminal/customers/:id/next-best-actions`：把推荐项目、护理建议、邀约建议聚合成终端可执行动作。

## 三、与管理端业务逻辑不一致的地方

### 1. 预约状态与管理端项目预约模块仍需统一

终端目前使用：

- `pending`
- `confirmed`
- `checked_in`
- `completed`
- `cancelled`
- `no_show`

需要确认管理端项目预约模块是否使用同一套状态。如果管理端仍是中文状态或其他枚举，必须在 Core 层统一转换，不能让终端和管理端各自判断。

关键差异：

- 终端“到店”只改预约状态，不自动生成服务任务。
- 终端“取消”只把原因写入 `remark`，没有独立 `cancelReason/cancelledAt/cancelledBy`。
- 终端“修改”直接改预约，不留改期历史。

### 2. 收银状态模型不一致

终端 `checkout` 接口语义是“开单并收款”，后端创建 `ProductOrder` 时已经 `status='completed'`，前端又保留 `complete-payment` 兼容调用。

建议收敛为两种明确模式：

- 模式 A：一体化收银：`POST /terminal/cashier/checkout` 直接完成支付，不再调用 `complete-payment`。
- 模式 B：开单和收款分离：`POST /terminal/cashier/orders` 创建待支付订单，`POST /terminal/cashier-orders/:id/complete-payment` 完成支付。

当前混用会导致重复支付记录、状态语义不清、后续退款难处理。

### 3. 服务记录不等于完成服务

当前前端 `beautician.record` 会走 `operation.service-complete`，实际只是把第一个服务任务标记完成。

管理端真实服务记录应至少包含：

- 服务项目
- 服务人员
- 服务结果
- 客户反馈
- 护理备注
- 图片
- 耗材
- 下次护理建议
- 是否转收银/预约下次

终端需要把“完成任务”和“填写服务记录”拆开。

### 4. 核销和服务/库存没有联动

核销接口会扣减 `CustomerCard` 并写 `CardUsageRecord`，但还没有稳定联动：

- 服务任务完成状态
- 服务记录
- 项目 BOM 耗材扣减
- 前台/美容师业绩归属

这会导致“卡项扣了，但服务过程和库存过程没有完全闭合”。

### 5. 充值和会员余额消费只闭合了一半

充值已写入 `CustomerBalanceAccount` 和 `CustomerBalanceTransaction`，但消费侧没有闭合：

- 收银用会员余额付款时未实际扣余额。
- 退款、调整、冻结、流水查询未在终端形成操作入口。

## 四、字段不一致或字段缺失

### 1. 客户字段

管理端 `Customer` 模型较完整：姓名、手机号、邮箱、微信、座机、婚姻、生日、身高、体重、职业、单位、地址、过敏、手术史、肤质、来源、标签等。

终端登记目前主要覆盖：

- `name`
- `phone`
- `gender`
- `source`
- `birthday`
- `skinCondition`
- `tags`
- `remark`

缺口：

- 微信、职业、地址、过敏史、手术史等管理端字段没有终端入口。
- 生日字段前端必须统一 ISO 日期，之前已出现 `birthday must be a valid ISO 8601 date string`。
- `storeName` 不应提交给 `quick-create`，应由 `X-Store-Id` 决定门店。

### 2. 预约字段

终端类型使用：

- `appointmentTime`
- `duration`
- `customerName/customerPhone`
- `projectName`
- `beauticianName`

数据库模型使用：

- `date`
- `startTime`
- `endTime`
- `customerId`
- `projectId`
- `beauticianId`

缺口：

- 后端没有正式 `CreateReservationDto/UpdateReservationDto`，controller 仍使用 `any`。
- 前端提交了名称字段，但后端主要依赖 ID，名称字段只作为兜底。
- 缺 `source/channel/createBy/cancelReason/rescheduleReason`。

### 3. 支付字段

前端类型存在中文支付方式：

- `现金`
- `微信`
- `支付宝`
- `银行卡`
- `次卡抵扣`

后端 DTO 和服务更偏英文/标准 key：

- `cash`
- `wechat`
- `alipay`
- `card`
- `customer_card`
- `member_balance`

缺口：

- 需要统一支付方式枚举和显示映射。
- `payMethod` 与 `paymentMethod` 混用，需要在 API 契约层统一。
- `transactionNo` 前端多数流程未填写。

### 4. 卡项和赠送项目

办卡赠送项目目前写入 `ProductOrder.items` / `OrderItem.payload`，没有独立权益模型。

缺口：

- 赠送项目是否可核销、有效期、剩余次数、适用项目规则都没有标准化。
- 管理端如需查看赠送权益，当前只能从订单 payload 解析。

### 5. 面部检测字段

终端面部检测使用：

- `images`
- `metrics`
- `skinType`
- `skinStatus`
- `mainProblems`
- `recommendationText`

管理端客户健康档案使用：

- `skinType`
- `skinStatus`
- `mainProblems`
- `allergyHistory`
- `goals`
- `recommendedCare`
- `instrument`
- `lastCheck`

缺口：

- `instrument/confidence/analyzeId/imageUrl` 没有完整入库字段，只部分拼进 recommendationText。
- 删除/替换图片没有终端接口。
- 检测记录和健康档案之间的同步规则需要明确。

## 五、仍在原型内残留的 mock / 旧组件

以下文件仍引用 `mockData` 或保留旧 Figma 原型流程，容易和主线混淆：

- `packages/Ami-Aura-Lite-Kiosk/src/app/types.ts`
- `packages/Ami-Aura-Lite-Kiosk/src/app/components/AppointmentCard.tsx`
- `packages/Ami-Aura-Lite-Kiosk/src/app/components/CashierCard.tsx`
- `packages/Ami-Aura-Lite-Kiosk/src/app/components/CustomerRegistrationForm.tsx`
- `packages/Ami-Aura-Lite-Kiosk/src/app/components/CustomerResultCard.tsx`
- `packages/Ami-Aura-Lite-Kiosk/src/app/components/NewCardForm.tsx`
- `packages/Ami-Aura-Lite-Kiosk/src/app/components/PrintStatusCard.tsx`
- `packages/Ami-Aura-Lite-Kiosk/src/app/components/TodayOverviewCard.tsx`

处理建议：

- 不批量删除。
- 给旧组件加 `legacy` 标记或迁入 `components/legacy/`，但迁移前要确认没有被引用。
- 主线只保留 `AppContent -> runMicroAppIntent -> auraCoreService -> src/api/terminal.ts` 这条链路。

## 六、建议下一步闭合顺序

1. 先做接口契约清理
   - 给预约创建/更新补 DTO。
   - 统一 `paymentMethod/payMethod`。
   - 统一状态枚举和错误码。

2. 闭合预约到服务任务
   - 到店后自动创建或关联 `ServiceTask`。
   - 美容师首页只展示本人服务任务和关联客户。

3. 闭合服务记录
   - 新增终端服务记录表单。
   - 调用 `PATCH /terminal/tasks/:id/complete` + `POST /terminal/consumption-records` 或新增统一 `POST /terminal/service-records`。
   - 写入图片、耗材、客户反馈、下次建议。

4. 闭合会员余额消费
   - 增加余额查询、余额消费、退款、调整接口。
   - 收银选择会员余额时必须扣减余额账本。

5. 闭合 AI 推荐执行反馈
   - 推荐展示、采纳、跳过、转化都写 `RecommendationEvent`。
   - 邀约话术要能生成跟进任务并记录结果。

6. 处理旧 mock 组件
   - 先标记 legacy。
   - 再逐个确认是否还有引用。
   - 确认无引用后再按用户确认迁移或删除。

## 七、交付判断标准

一个终端功能算闭合，需要同时满足：

1. 前端不是 mock 表单，而是从 `src/api/terminal.ts` 取数或提交。
2. 后端有明确 controller + DTO + service。
3. Prisma 有真实落点，且迁移已执行。
4. 字段与管理端业务对象一致，或有明确 adapter 转换。
5. 失败时返回业务错误，不显示裸 `Internal server error`。
6. 成功后刷新相关卡片，例如预约、客户卡项、余额、服务任务、经营数据。
7. 有最小测试覆盖或手动验证路径。
