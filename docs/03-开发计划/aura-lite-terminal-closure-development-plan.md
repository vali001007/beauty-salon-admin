# Ami Aura Lite 智能终端闭合开发计划

更新时间：2026-06-02

## 目标

以 `packages/Ami-Aura-Lite-Kiosk` 为智能终端主线，补齐当前未闭合的业务链路，让终端不再只停留在“能展示/能演示”，而是逐步与 Ami_Core 的真实业务状态、字段、权限和数据落点一致。

本计划不迁移、不复用 `packages/ami-aura-lite`。

## 闭合原则

- Ami_Core / `server-v2` 是唯一业务事实来源。
- 终端只做意图驱动、微应用卡片、快捷操作和前台交互，不维护独立业务模型。
- 查询类功能必须来自 `/terminal/*` 或 Core 共享 API。
- 提交类功能必须写回 Core，并返回明确业务结果。
- AI 只做解释、建议、话术和摘要，不生成客户、预约、订单、余额、库存等事实数据。
- 所有新增能力优先采用兼容式新增接口，不破坏管理端现有路由、页面和权限。

## 一、后端接口闭合计划

### 1. 预约闭合

当前问题：

- `POST /terminal/reservations` 和 `PUT /terminal/reservations/:id` 仍使用 `any`，字段边界不清。
- 终端可新增/修改/确认/取消/到店，但缺少改期、爽约、可预约时段和到店后服务任务联动。
- 预约字段和管理端项目预约字段存在映射差异。

开发内容：

- 新增正式 DTO：
  - `CreateReservationDto`
  - `UpdateReservationDto`
  - `RescheduleReservationDto`
  - `ReservationAvailabilityQueryDto`
- 新增接口：
  - `GET /terminal/reservations/availability`
  - `POST /terminal/reservations/:id/reschedule`
  - `POST /terminal/reservations/:id/no-show`
  - `POST /terminal/reservations/:id/create-task`
- 到店后可创建服务任务，避免前台到店和美容师工作台脱节。
- 可预约时段接口先基于门店营业时间、已有预约和美容师过滤，后续再接更完整排班规则。

验收标准：

- 终端添加预约、修改预约、确认、取消、到店、爽约都有明确接口。
- 预约提交字段有 DTO 校验，不再靠 `any`。
- 到店后可以在美容师任务中看到对应服务任务。

### 2. 服务记录闭合

当前问题：

- “服务记录”快捷操作实际更像完成第一个任务，不是完整服务记录。
- 服务结果、客户反馈、图片、耗材、下次建议没有统一提交入口。

开发内容：

- 新增接口：
  - `POST /terminal/service-records`
  - `GET /terminal/tasks/:id/service-record`
  - `PUT /terminal/tasks/:id/service-record`
  - `POST /terminal/tasks/:id/transfer-cashier`
- 服务记录提交后：
  - 更新服务任务状态。
  - 写入消费/服务记录。
  - 可选写入耗材消耗。
  - 返回下一步动作：转收银、预约下次、打印服务单。

验收标准：

- 美容师可以提交完整服务记录，而不是只点“完成服务”。
- 服务记录可回看、可补充修改。
- 服务完成后可转前台收银。

### 3. 会员余额与收银闭合

当前问题：

- 充值已经能写入余额账本，但余额消费、退款、调整缺少终端接口。
- 收银 `checkout` 与 `complete-payment` 语义容易混用。

开发内容：

- 新增接口：
  - `GET /terminal/customers/:id/balance`
  - `POST /terminal/balance/consume`
  - `POST /terminal/balance/refund`
  - `POST /terminal/balance/adjust`
- 当收银支付方式为会员余额时，必须扣减 `CustomerBalanceAccount` 并写 `CustomerBalanceTransaction`。
- 保留现有 `checkout` 兼容一体化收银，后续再拆“开单”和“收款”两步接口。

验收标准：

- 充值后能查询余额。
- 余额支付会真实扣减余额。
- 退款/调整有余额流水。
- 不再出现“订单完成但会员余额没变”的情况。

### 4. 打印与设备状态闭合

当前问题：

- 小票预览和打印任务已有雏形，但打印状态偏模拟。
- 顶部设备状态仍偏前端静态展示。

开发内容：

- 补充接口：
  - `GET /terminal/print-jobs?sourceType=&sourceId=`
  - `POST /terminal/print-jobs/:id/retry`
  - `PATCH /terminal/print-jobs/:id/status`
  - `GET /terminal/devices/status`
- 先返回可演示的队列状态，后续对接真实打印机/扫码器/摄像头。

验收标准：

- 收银完成可查看小票、创建打印任务、查询任务结果。
- 打印失败时能重试。
- 终端顶部设备状态来自 Core。

### 5. AI 推荐与邀约闭合

当前问题：

- DeepSeek 智能回复已接入方向明确，但推荐采纳、跳过、邀约任务未闭环。

开发内容：

- 补充接口：
  - `POST /ai/generate/customer-invitation-script`
  - `GET /terminal/customers/:id/next-best-actions`
  - `POST /terminal/follow-up-tasks`
  - `PATCH /terminal/follow-up-tasks/:id/complete`
- 推荐/话术必须基于 Core 已有客户摘要、消费记录、预约、检测结果。
- 采纳/跳过/完成要写入推荐事件或跟进任务。

验收标准：

- 店长问“哪些客户可能流失”能看到客户清单、原因和下一步动作。
- 输入“某客户邀约话术”能生成可复制的话术。
- 邀约结果可记录，不停留在纯文本建议。

## 二、前端终端闭合计划

### 1. 统一 API 入口

- `packages/Ami-Aura-Lite-Kiosk/src/app/services/auraCoreService.ts` 只调用根项目 `src/api/terminal.ts` 暴露的终端 API。
- 不新增 Lite 本地业务 mock。
- 查询无数据显示空状态，提交失败显示 Core 返回的业务错误。

### 2. 微应用流程补齐

需要补齐或改造的微应用：

- 预约：新增、改期、确认、取消、到店、爽约、创建服务任务。
- 核销：选择客户、选择卡项、选择服务美容师、确认核销、生成成功卡。
- 收银：开单、选择项目/商品、优惠、支付方式、余额支付、小票预览/打印。
- 登记：客户字段按 Core DTO 提交，生日统一 ISO 日期，不提交 `storeName`。
- 面部检测：摄像头、上传照片、删除照片、检测记录绑定客户。
- 服务记录：完整表单、图片、耗材、反馈、下次建议、转收银。
- 充值：充值金额、优惠/赠送、余额变化、流水结果。

### 3. 字段一致性

- 预约：前端展示 `appointmentTime`，提交到 Core 时转换为 `date/startTime/endTime` 或后端标准 DTO。
- 支付：前端中文文案与后端标准 key 建立映射，例如 `wechat/alipay/cash/card/member_balance`。
- 客户：登记字段只提交 DTO 允许字段，生日为空时不提交。
- 服务：服务任务、服务记录、消费记录的字段统一从 `terminal` 类型导出。

## 三、权限与数据范围

- 写接口由 Core 校验权限，终端只做入口显隐和禁用提示。
- 店长可看经营、员工、客户增长、库存、异常。
- 前台可做预约、核销、收银、办卡、充值、登记、打印。
- 美容师只看本人预约、服务客户、服务记录、护理建议。
- 所有接口按 `X-Store-Id` 过滤门店数据。

## 四、测试计划

### 后端

- `cd packages/server-v2 && npm run build`
- 增加或手工验证：
  - 预约可用时段、改期、爽约、创建服务任务。
  - 服务记录创建/查看/修改/转收银。
  - 余额查询、消费、退款、调整。
  - 打印任务查询、重试、状态更新。

### 前端共享 API

- 根项目 `npm run build`
- 确认 `src/api/real/terminal.ts` 每个新增方法都对应后端 `/terminal/*`。
- 确认响应数组统一解包，避免 `items.map is not a function`。

### 智能终端

- `cd "packages/Ami-Aura-Lite-Kiosk" && npm run build`
- 重点手工验收：
  - 前台添加预约并确认到店。
  - 美容师看到由预约生成的服务任务。
  - 美容师提交服务记录并转收银。
  - 前台使用会员余额收银并扣减余额。
  - 收银完成后打印小票。
  - 店长查看流失客户并生成邀约话术。

## 五、本次开发落地范围

本次先落地对终端闭合影响最大的“基础契约”：

1. 预约 DTO 与预约扩展接口。
2. 预约到服务任务联动。
3. 会员余额查询与消费/退款/调整接口。
4. 服务记录专用提交接口。
5. 前端共享 API 类型与调用入口。

打印设备真实驱动、复杂营销任务和完整 AI 推荐反馈可在上述基础稳定后继续扩展。
