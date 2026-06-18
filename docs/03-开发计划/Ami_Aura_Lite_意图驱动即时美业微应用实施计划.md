# Ami Aura Lite Kiosk Prototype 意图驱动即时美业微应用实施计划

版本：v1.1  
日期：2026-05-31  
关联需求文档：`02-产品设计/Ami_Aura_Lite_意图驱动即时美业微应用需求文档.md`  
主线目录：`packages/Ami-Aura-Lite-Kiosk`  
基础平台：Ami_Core 美业管理平台  
后端主线：`packages/server-v2`，统一承接业务 API 与 AI Gateway

## 1. 计划结论

本次实施不建议推翻现有原型重做，而是以 `packages/Ami-Aura-Lite-Kiosk` 为主线，在现有三角色首页、消息流、快捷按钮和流程卡片基础上，逐步收敛成“意图驱动的即时美业微应用”。

总体改造目标：

- 让终端从“固定按钮 + 本地硬编码流程”升级为“intent router + micro app handlers”。
- 让所有业务事实、权限、门店、查询和写回来自 Ami_Core。
- 让 AI 从“简单建议卡片”升级为“意图理解、槽位抽取、澄清、解释和建议”，但不生成业务事实。
- 让店长、前台、美容师通过快捷按钮、自然语言、语音、扫码、摄像头触发即时业务卡片。
- 先保证可演示、可联调、可验收，再逐步增强实时语音和多模态能力。

## 2. 当前基线

### 2.1 已具备能力

当前原型已经具备：

- Vite + React 单页终端工程。
- `@` 指向根项目 `src`，可复用 Ami_Core API、store、types。
- `@aura` 指向原型自身 `src`。
- `/api` 代理到 `http://127.0.0.1:8080`。
- `envDir` 指向仓库根目录。
- 顶部状态栏：门店、员工、角色、设备状态、锁屏。
- 底部命令栏：快捷按钮、文本输入、语音按钮 UI。
- 三角色首页：店长、前台、美容师。
- 业务卡片：经营、预约、员工、客户、库存、核销、收银、办卡、充值、登记、操作结果。
- Core 适配服务：`src/app/services/auraCoreService.ts`。
- AI 建议入口：`sendAiChatMessage()`。

### 2.2 主要问题

必须优先解决：

- 源码多处中文乱码，影响界面、指令识别、支付方式和错误提示。
- `package.json` 包名仍为 Figma 导出名，工程身份不清晰。
- `build` 只做 `vite build`，没有 `tsc --noEmit` 类型检查。
- `AppContent.tsx` 既负责页面状态，又负责指令识别、动作分发、消息渲染，职责过重。
- `resolveAction()` 是本地硬编码字符串匹配，尚未形成标准 Intent Schema。
- 部分流程依赖 `loadCoreSnapshot()` 全量拉取多组接口，导致慢、失败面大。
- 预约改期、核销、收银等写操作仍需强化确认、幂等、失败兜底和刷新逻辑。
- AI 只做建议，尚未承担统一意图分类和槽位抽取。
- 语音按钮、摄像头检测仍偏 UI 或模拟。

## 3. 交付边界

### 3.1 本期必须交付

P0 必须交付：

- 修复中文乱码。
- 增加类型检查。
- 固定 Kiosk Prototype 为本次主线目录。
- 统一入口：快捷按钮、文本输入都进入 intent router。
- 建立标准 Intent Schema。
- 建立 command registry。
- 拆分 `AppContent.tsx` 中的指令识别和业务处理。
- 三角色首页继续从 Core bootstrap / role dashboard 获取数据。
- 核销、收银、办卡、充值、登记、预约形成可闭环微应用。
- AI 建议不阻塞业务卡片。
- 无数据、无权限、接口失败都有业务化提示。

P1 必须交付：

- AI 意图分类和槽位抽取。
- 低置信度澄清。
- 写操作幂等键。
- 预约改期可选择时段。
- 服务记录微应用深化。
- Core 专用轻量接口替代全量 snapshot。

P2 规划交付：

- 语音转文本。
- 摄像头真实采集。
- 皮肤检测记录增强。
- 多设备协同提示。
- AI 成本、耗时和采纳埋点。

### 3.2 本期不做

- 完整实时语音 Agent。
- AI 无确认自动交易。
- Computer Use 操作后台页面。
- 独立 Lite 数据库。
- 复杂图表和高级经营预测。
- 自动营销群发。

## 4. 阶段计划总览

| 阶段 | 名称 | 目标 | 优先级 | 建议周期 |
| --- | --- | --- | --- | --- |
| 0 | 基线确认与防护 | 固定目录、环境、构建和文案基线 | P0 | 0.5 天 |
| 1 | 原型稳定化 | 修复乱码、类型检查、启动和慢加载问题 | P0 | 1-2 天 |
| 2 | 意图架构改造 | 建立 Intent Schema、Router、Registry、Handlers | P0 | 2-3 天 |
| 3 | Core 数据收敛 | 微应用改为专用 Core 接口，减少 snapshot | P0/P1 | 3-5 天 |
| 4 | 核心微应用闭环 | 预约、核销、收银、办卡、充值、登记、服务记录闭环 | P0/P1 | 4-6 天 |
| 5 | AI 编排增强 | AI 分类、槽位抽取、澄清、建议 | P1 | 2-4 天 |
| 6 | 权限、性能、埋点 | 角色能力、幂等、审计、加载性能和数据埋点 | P1 | 2-3 天 |
| 7 | 语音与多模态预研 | 语音转文本、摄像头真实采集 | P2 | 3-5 天 |
| 8 | 验收与演示包 | 回归测试、演示脚本、交付文档 | P0 | 1-2 天 |

## 5. 阶段 0：基线确认与防护

### 5.1 目标

避免后续改造时把历史原型、主线终端包和 Core 后台混改。先确认这次只围绕 `packages/Ami-Aura-Lite-Kiosk` 推进。

### 5.2 开发任务

1. 确认主线目录
   - 主线目录固定为 `packages/Ami-Aura-Lite-Kiosk`。
   - 不再迁移到已退役的轻量终端包。
   - 废弃轻量终端包不作为参考或修改目标。

2. 确认运行端口
   - Kiosk Prototype 默认端口保持 5175。
   - Ami_Core 管理端默认端口 5173。
   - Core API / server-v2 本地端口按现有配置走 8080 或后端文档约定。

3. 确认环境变量
   - 继续读取根目录 `.env`。
   - real 模式走 `/api`。
   - mock 模式仍必须通过 Core mock 层，不允许 Lite 自建业务 mock。

4. 建立变更保护
   - 不批量删除历史原型文件。
   - 不清理 `dist`、`outputs`、文档目录。
   - 每阶段只改相关文件。

### 5.3 交付物

- 本实施计划。
- 阶段任务清单。
- 明确主线目录和运行方式。

### 5.4 验收标准

- 团队确认本轮开发目标目录是 `packages/Ami-Aura-Lite-Kiosk`。
- 不再混用 `packages/app` 或已退役轻量终端包作为当前主线。

## 6. 阶段 1：原型稳定化

### 6.1 目标

先解决影响演示和联调的基础问题：乱码、构建、启动、加载慢和页面错误。

### 6.2 重点文件

- `packages/Ami-Aura-Lite-Kiosk/package.json`
- `packages/Ami-Aura-Lite-Kiosk/vite.config.ts`
- `packages/Ami-Aura-Lite-Kiosk/src/app/AppContent.tsx`
- `packages/Ami-Aura-Lite-Kiosk/src/app/types.ts`
- `packages/Ami-Aura-Lite-Kiosk/src/app/components/SmartCommandBar.tsx`
- `packages/Ami-Aura-Lite-Kiosk/src/app/components/TopStatusBar.tsx`
- `packages/Ami-Aura-Lite-Kiosk/src/app/components/*FlowCard.tsx`
- `packages/Ami-Aura-Lite-Kiosk/src/app/services/auraCoreService.ts`

### 6.3 开发任务

1. 修复中文乱码
   - 修复所有用户可见文案。
   - 修复指令识别关键词。
   - 修复支付方式枚举。
   - 修复错误提示、placeholder、按钮 title。
   - 修复 Vite 注释里的乱码。

2. 补充类型检查
   - 增加脚本：`typecheck`: `tsc --noEmit`。
   - `build` 改为先 `tsc --noEmit` 再 `vite build`，或增加单独 CI 可执行命令。

3. 工程身份整理
   - 包名从 `@figma/my-make-file` 改为更明确的内部包名，例如 `@ami/aura-lite-kiosk-prototype`。
   - README 补充运行命令。

4. 启动与 API 检查
   - 验证 `/api` 代理实际可用。
   - 在 Network 中确认请求走 Core 后台，不静默走本地假数据。
   - 登录态失效时给出明确入口，而不是空白页。

5. 加载体验优化
   - 角色首页加载采用骨架屏。
   - AI 建议延后加载，不阻塞主业务卡片。
   - Core 接口失败时展示“门店数据加载失败 + 重试 + 检查登录/门店”。

### 6.4 验收标准

- 页面无中文乱码。
- `npm run build` 通过。
- `npm run typecheck` 通过。
- Kiosk Prototype 能在 5175 打开。
- 三角色首页能显示骨架或数据。
- Core 不可用时页面不空白。

## 7. 阶段 2：意图架构改造

### 7.1 目标

把现有 `resolveAction()` 升级为标准意图驱动架构。后续所有快捷按钮、自然语言、语音、扫码、摄像头都走同一个入口。

### 7.2 新增目录建议

```text
packages/Ami-Aura-Lite-Kiosk/src/app/intent/
  intentTypes.ts
  intentSchema.ts
  commandRegistry.ts
  ruleIntentParser.ts
  aiIntentParser.ts
  intentRouter.ts
  slotUtils.ts
  permissionUtils.ts
```

```text
packages/Ami-Aura-Lite-Kiosk/src/app/microApps/
  microAppTypes.ts
  managerHandlers.ts
  appointmentHandlers.ts
  customerHandlers.ts
  cardConsumeHandlers.ts
  cashierHandlers.ts
  cardOrderHandlers.ts
  rechargeHandlers.ts
  registrationHandlers.ts
  beauticianHandlers.ts
  inventoryHandlers.ts
  printHandlers.ts
```

### 7.3 开发任务

1. 定义 Intent Schema
   - `intent`
   - `role`
   - `source`
   - `confidence`
   - `slots`
   - `missingSlots`
   - `riskLevel`
   - `requiresConfirmation`
   - `idempotencyKey`

2. 建立 command registry
   - 每个 intent 注册：
     - 名称
     - 所属角色
     - 所需权限
     - 必填槽位
     - 是否写操作
     - 风险等级
     - 对应 handler
     - 展示名称

3. 快捷按钮改造
   - 快捷按钮不直接传 `operation.verify` 这类技术字符串。
   - 改为传标准 intent，例如 `card.consume`。
   - UI 层不展示 intent code。

4. 文本指令改造
   - 规则识别先处理高频指令。
   - 模糊表达交给 AI intent parser。
   - 未识别时进入澄清卡片。

5. `AppContent.tsx` 降职责
   - 只保留全局状态、消息追加、当前角色、调用 router。
   - 移除大段 if/else action 分发。
   - 业务处理迁移到 micro app handlers。

6. 统一消息类型
   - 用户输入消息。
   - 系统提示消息。
   - 微应用卡片消息。
   - 操作结果消息。
   - AI 建议消息。
   - 澄清问题消息。
   - 错误消息。

### 7.4 关键 Intent 示例

```ts
type AuraIntentName =
  | 'manager.dashboard.view'
  | 'manager.staff.view'
  | 'manager.customer_growth.view'
  | 'manager.inventory.view'
  | 'appointment.today.view'
  | 'appointment.confirm'
  | 'appointment.reschedule'
  | 'appointment.cancel'
  | 'appointment.check_in'
  | 'customer.search'
  | 'customer.quick_create'
  | 'card.consume'
  | 'cashier.checkout'
  | 'card_order.create'
  | 'recharge.create'
  | 'service_record.create'
  | 'service_task.complete'
  | 'care_advice.generate'
  | 'print.receipt';
```

### 7.5 验收标准

- 快捷按钮和文本输入都走 `intentRouter`。
- 业务 action 不再散落在 `AppContent.tsx`。
- 页面不展示技术命令码。
- 低置信度输入能追问。
- 缺客户、金额、时间等字段时能补问。

## 8. 阶段 3：Core 数据收敛

### 8.1 目标

减少 `loadCoreSnapshot()` 对页面速度和稳定性的影响，让每个微应用只请求自己需要的数据。

### 8.2 改造原则

- 首页优先使用 `getTerminalRoleDashboard()`。
- 查询微应用使用专用查询接口。
- 写操作先用轻量详情/校验接口，再提交。
- `loadCoreSnapshot()` 仅保留为降级兜底，不能作为默认路径。

### 8.3 需要梳理的 Core 接口

启动：

- `GET /api/terminal/bootstrap`
- `GET /api/terminal/dashboard/role`
- `GET /api/terminal/config`

预约：

- `GET /api/terminal/reservations/today`
- `GET /api/terminal/reservations/:id`
- `POST /api/terminal/reservations`
- `PATCH /api/terminal/reservations/:id/confirm`
- `PATCH /api/terminal/reservations/:id/reschedule`
- `PATCH /api/terminal/reservations/:id/cancel`
- `PATCH /api/terminal/reservations/:id/check-in`
- `GET /api/terminal/reservations/available-slots`

客户：

- `GET /api/terminal/customers/search`
- `GET /api/terminal/customers/:id/summary`
- `POST /api/terminal/customers/quick-create`
- `PATCH /api/terminal/customers/:id`

卡项核销：

- `GET /api/terminal/customers/:id/cards`
- `POST /api/terminal/cards/consume/preview`
- `POST /api/terminal/cards/consume`

收银：

- `GET /api/terminal/catalog/sellable-items`
- `GET /api/terminal/payment-methods`
- `POST /api/terminal/cashier/orders`
- `POST /api/terminal/cashier/orders/:id/pay`

办卡充值：

- `GET /api/terminal/cards/sellable`
- `GET /api/terminal/promotions/available`
- `POST /api/terminal/card-orders`
- `POST /api/terminal/recharge-orders`

美容师服务：

- `GET /api/terminal/service-tasks/my`
- `GET /api/terminal/service-tasks/:id`
- `PATCH /api/terminal/service-tasks/:id/start`
- `PATCH /api/terminal/service-tasks/:id/complete`
- `POST /api/terminal/service-records`

皮肤检测：

- `POST /api/terminal/skin-tests`
- `GET /api/terminal/skin-tests/:id`
- `POST /api/terminal/skin-tests/:id/bind-customer`

打印：

- `POST /api/terminal/print-jobs`
- `GET /api/terminal/print-jobs/:id`

AI：

- `POST /api/ai/intent/classify`
- `POST /api/ai/chat/messages`
- `POST /api/ai/generate/customer-summary`
- `POST /api/ai/generate/service-note-summary`
- `POST /api/ai/generate/terminal-service-advice`
- `POST /api/ai/recommend/next-best-action`

### 8.4 开发任务

1. 在 Core API 层补齐缺口
   - mock 和 real 双实现同步。
   - 统一响应格式。
   - 统一错误格式。

2. 改造 `auraCoreService.ts`
   - 按微应用拆服务方法。
   - 每个服务方法只拉必要数据。
   - 写操作不再先全量 snapshot。

3. 增加专用 adapter
   - Core 原始数据转 Lite 卡片视图模型。
   - adapter 层负责字段兜底，不在组件内做复杂转换。

4. 增加缓存策略
   - bootstrap 30 秒。
   - role dashboard 15 秒。
   - 字典类数据 5 分钟。
   - 客户搜索不缓存或短缓存。

### 8.5 验收标准

- 首页不再因单个明细接口慢而整体卡住。
- 核销打开只拉预约客户和客户搜索所需数据。
- 收银打开只拉客户候选和可售 catalog。
- 写操作成功后刷新相关卡片。
- 无权限和无数据都能清晰展示。

## 9. 阶段 4：核心即时微应用闭环

### 9.1 今日预约微应用

任务：

- 展示客户名称、手机号、预约时间、会员等级、画像标签、项目、美容师、状态。
- 支持确认预约。
- 支持修改时间。
- 支持取消预约。
- 支持确认到店。
- 操作成功后刷新今日预约列表。

改造点：

- 改期不能默认加 30 分钟，必须显示可选时段。
- 取消必须二次确认并输入或选择取消原因。
- 到店后建议下一步：核销、收银、通知美容师。

验收：

- 输入“今日预约”出现预约微应用。
- 点击确认、改期、取消、到店均调用 Core。
- API 失败时展示失败原因。

### 9.2 核销微应用

任务：

- 客户选择支持搜索。
- 默认优先显示当天预约客户。
- 选择客户后加载可核销卡项。
- 选择项目和次数。
- 确认核销。
- 显示核销成功卡和时间戳。

改造点：

- 移除“核销已提交”中间状态展示。
- 成功卡不显示后续按钮堆叠，只保留关键结果和时间。
- 写操作增加 idempotency key。

验收：

- 核销流程符合“选择客户 -> 选择次卡核销内容 -> 确认核销”。
- 不显示 `operation.verify`。
- 不重复提交。

### 9.3 收银微应用

任务：

- 选择客户。
- 多选项目/商品。
- 调整数量。
- 输入优惠金额。
- 选择支付方式。
- 确认收款。
- 显示收银完成卡。

改造点：

- 支付方式从 Core 字典读取。
- 优惠金额不能超过应收。
- 大额优惠预留店长授权。
- 成功后刷新经营数据和客户消费记录。

验收：

- 收银流程符合“开单 -> 收款 -> 完成”。
- 应收、优惠、实收计算正确。
- 失败不产生订单重复。

### 9.4 办卡微应用

任务：

- 选择客户。
- 选择次卡。
- 输入优惠金额。
- 选择赠送项目。
- 确认开卡。
- 显示开卡完成卡。

改造点：

- 卡项来自 Core 可售卡项。
- 赠送项目来自 Core 项目或活动。
- 成功后刷新客户卡项。

验收：

- 办卡流程符合“选择客户 -> 选择次卡 -> 输入优惠金额及赠送项目 -> 开卡完成”。

### 9.5 充值微应用

任务：

- 选择客户。
- 输入充值金额。
- 输入赠送金额。
- 选择赠送项目。
- 选择支付方式。
- 确认充值。
- 显示充值完成卡。

改造点：

- 金额字段继承 Core 校验。
- 赠送金额或大额充值预留确认。
- 成功后刷新客户余额和交易记录。

验收：

- 充值流程符合“选择客户 -> 输入充值金额、优惠金额、赠送项目 -> 充值完成”。

### 9.6 登记微应用

任务：

- 录入用户信息。
- 调用摄像头或模拟检测。
- 生成用户信息卡。
- 确认登记。
- 写入客户档案和皮肤检测记录。

改造点：

- 字段继承 Ami_Core 客户字段。
- 手机号重复时提示已有客户。
- 摄像头不可用时可跳过。
- 检测结果标注为护理建议，不是医疗诊断。

验收：

- 登记流程符合“录入用户信息 -> 面部检测 -> 生成用户信息卡 -> 登记完成”。

### 9.7 美容师服务微应用

任务：

- 我的今日预约。
- 下一个客户。
- 客户服务档案。
- 服务记录。
- 护理建议。
- 完成服务。
- 转前台收银。

改造点：

- 只显示本人服务相关客户。
- 服务记录支持语音转文本预留。
- 完成服务后刷新任务状态。

验收：

- 美容师看不到完整经营报表。
- 美容师可完成本人服务任务。

## 10. 阶段 5：AI 编排增强

### 10.1 目标

AI 不再只是业务卡片下方的建议，而是成为自然语言入口的辅助理解层。

### 10.2 开发任务

1. 新增 AI intent classifier
   - 输入：当前角色、可用 intent、用户文本、上下文。
   - 输出：标准 Intent JSON。

2. 新增槽位抽取
   - 客户名。
   - 手机号。
   - 时间。
   - 卡项。
   - 项目。
   - 金额。
   - 支付方式。
   - 美容师。

3. 增加澄清卡片
   - 客户不唯一。
   - 卡项不唯一。
   - 金额缺失。
   - 时间冲突。
   - 权限不足。

4. AI 建议分场景
   - 店长经营建议。
   - 前台接待话术。
   - 美容师护理建议。
   - 客户摘要。
   - 服务记录摘要。

5. AI 安全边界
   - AI 只返回建议和结构化意图。
   - 写操作仍由 Core 和用户确认执行。
   - AI 建议必须标注为“参考”。

### 10.3 验收标准

- 输入“帮张三核销补水卡”能进入核销流程并预填客户/卡项候选。
- 输入“给李四充值 1000”能进入充值流程并预填金额。
- 输入“我的下一个客户是谁”能展示美容师服务卡。
- 模糊输入能追问。
- AI 失败时规则仍可兜底。

## 11. 阶段 6：权限、性能、埋点

### 11.1 权限任务

- Lite 只消费 Core bootstrap 返回的可用角色和可用动作。
- 无权限快捷按钮隐藏或禁用。
- Core 写接口二次校验权限。
- 前台不显示员工绩效。
- 美容师不显示经营财务。
- 店长可看经营风险，但日常交易入口不抢占主屏。

### 11.2 性能任务

- 首页从 role dashboard 聚合接口加载。
- 字典类数据缓存。
- 客户搜索防抖。
- 卡片级 loading。
- 写操作按钮防重复点击。
- AI 建议异步追加。

### 11.3 埋点任务

意图埋点：

- 来源。
- 原始输入。
- intent。
- confidence。
- 是否澄清。
- 是否成功。

流程埋点：

- 开始。
- 步骤完成。
- 放弃。
- 提交成功。
- 提交失败。
- 耗时。

AI 埋点：

- 场景。
- 响应时间。
- 失败率。
- 成本。
- 采纳情况。

### 11.4 验收标准

- 切换角色后快捷按钮和首页立即变化。
- 弱网情况下不会整页白屏。
- 重复点击不会产生重复交易。
- 可以追踪用户从意图到完成的全过程。

## 12. 阶段 7：语音与多模态预研

### 12.1 语音转文本

任务：

- 语音按钮接入浏览器录音授权。
- 将语音转为文本后进入 intent router。
- 金额、手机号、次数等关键槽位需要复述确认。

验收：

- 语音说“今日预约”能触发预约微应用。
- 语音说“给张三充值一千”能进入充值流程并确认金额。

### 12.2 摄像头

任务：

- 登记流程接入 `getUserMedia`。
- 捕获面部图片。
- 上传 Core 皮肤检测接口或保存为检测记录附件。
- 摄像头不可用时允许跳过。

验收：

- 用户授权后能完成拍照。
- 拍照失败有明确提示。
- 检测结果写入 Core。

### 12.3 多模态 AI

任务：

- 后续支持对皮肤检测图片生成解释。
- 输出必须标注为护理建议。
- 不输出医疗诊断。

验收：

- 图片建议不作为确定性医学结论。

## 13. 阶段 8：测试、验收与演示包

### 13.1 手动测试清单

店长：

- 今日经营。
- 员工表现。
- 流失客户。
- 库存预警。

前台：

- 今日预约。
- 确认预约。
- 改期。
- 取消。
- 到店。
- 核销。
- 收银。
- 办卡。
- 充值。
- 登记。
- 打印。

美容师：

- 我的预约。
- 下一个客户。
- 客户档案。
- 护理建议。
- 服务记录。
- 完成服务。

异常：

- Core 不可用。
- AI 不可用。
- 无权限。
- 无数据。
- 重复提交。
- 网络慢。

### 13.2 自动化测试建议

单元测试：

- intent router。
- rule parser。
- slot extractor。
- micro app handlers。
- adapter 数据转换。

集成测试：

- Core mock 模式下三角色首页。
- 核销流程。
- 收银流程。
- 办卡流程。
- 充值流程。
- 登记流程。

E2E：

- 登录后进入终端首页。
- 前台完整核销。
- 前台完整收银。
- 美容师完成服务。

### 13.3 构建验证

必须通过：

```bash
cd "packages/Ami-Aura-Lite-Kiosk"
npm run typecheck
npm run build
```

如涉及 Core：

```bash
npm run build

cd packages/server-v2
npm run build
npm run test
```

### 13.4 演示脚本

演示顺序建议：

1. 店长查看今日经营。
2. 店长查看库存风险。
3. 前台查看今日预约。
4. 前台确认客户到店。
5. 前台完成核销。
6. 前台完成收银。
7. 前台登记新客户并做面部检测。
8. 美容师查看下一个客户。
9. 美容师生成护理建议。
10. 美容师完成服务记录。

## 14. 文件改造清单

### 14.1 重点改造文件

```text
packages/Ami-Aura-Lite-Kiosk/package.json
packages/Ami-Aura-Lite-Kiosk/vite.config.ts
packages/Ami-Aura-Lite-Kiosk/src/app/AppContent.tsx
packages/Ami-Aura-Lite-Kiosk/src/app/types.ts
packages/Ami-Aura-Lite-Kiosk/src/app/services/auraCoreService.ts
packages/Ami-Aura-Lite-Kiosk/src/app/components/SmartCommandBar.tsx
packages/Ami-Aura-Lite-Kiosk/src/app/components/TopStatusBar.tsx
packages/Ami-Aura-Lite-Kiosk/src/app/components/RoleDashboards.tsx
packages/Ami-Aura-Lite-Kiosk/src/app/components/CardVerificationFlowCard.tsx
packages/Ami-Aura-Lite-Kiosk/src/app/components/CashierFlowCard.tsx
packages/Ami-Aura-Lite-Kiosk/src/app/components/CardOpeningFlowCard.tsx
packages/Ami-Aura-Lite-Kiosk/src/app/components/RechargeFlowCard.tsx
packages/Ami-Aura-Lite-Kiosk/src/app/components/RegistrationFlowCard.tsx
```

### 14.2 建议新增文件

```text
packages/Ami-Aura-Lite-Kiosk/src/app/intent/intentTypes.ts
packages/Ami-Aura-Lite-Kiosk/src/app/intent/intentSchema.ts
packages/Ami-Aura-Lite-Kiosk/src/app/intent/commandRegistry.ts
packages/Ami-Aura-Lite-Kiosk/src/app/intent/ruleIntentParser.ts
packages/Ami-Aura-Lite-Kiosk/src/app/intent/aiIntentParser.ts
packages/Ami-Aura-Lite-Kiosk/src/app/intent/intentRouter.ts
packages/Ami-Aura-Lite-Kiosk/src/app/intent/slotUtils.ts
packages/Ami-Aura-Lite-Kiosk/src/app/microApps/microAppTypes.ts
packages/Ami-Aura-Lite-Kiosk/src/app/microApps/managerHandlers.ts
packages/Ami-Aura-Lite-Kiosk/src/app/microApps/appointmentHandlers.ts
packages/Ami-Aura-Lite-Kiosk/src/app/microApps/cardConsumeHandlers.ts
packages/Ami-Aura-Lite-Kiosk/src/app/microApps/cashierHandlers.ts
packages/Ami-Aura-Lite-Kiosk/src/app/microApps/cardOrderHandlers.ts
packages/Ami-Aura-Lite-Kiosk/src/app/microApps/rechargeHandlers.ts
packages/Ami-Aura-Lite-Kiosk/src/app/microApps/registrationHandlers.ts
packages/Ami-Aura-Lite-Kiosk/src/app/microApps/beauticianHandlers.ts
packages/Ami-Aura-Lite-Kiosk/src/app/microApps/resultBuilders.ts
packages/Ami-Aura-Lite-Kiosk/src/app/services/auraAdapters.ts
packages/Ami-Aura-Lite-Kiosk/src/app/services/auraCache.ts
```

### 14.3 Core 侧可能新增或补齐

```text
src/api/terminal.ts
src/api/mock/terminal.ts
src/api/real/terminal.ts
src/api/ai.ts
src/api/mock/ai.ts
src/api/real/ai.ts
packages/server-v2/src/terminal/*
packages/server-v2/src/ai/*
```

## 15. 优先级任务拆分

### P0：必须先做

1. 修复乱码。
2. 加 typecheck。
3. 梳理并固定 Kiosk Prototype 运行方式。
4. 建立 Intent Schema。
5. 建立 command registry。
6. 拆出 intent router。
7. 快捷按钮接入 intent。
8. 文本输入接入 intent。
9. 核销流程稳定。
10. 收银流程稳定。
11. 预约流程稳定。
12. Core 错误卡片化。

### P1：核心增强

1. AI intent classifier。
2. 槽位抽取。
3. 澄清卡片。
4. 写操作幂等。
5. 办卡和充值增强。
6. 登记摄像头真实接入。
7. 美容师服务记录深化。
8. 性能缓存和专用接口。
9. 权限能力完全来自 bootstrap。

### P2：体验升级

1. 语音转文本。
2. 多模态皮肤检测解释。
3. 多设备协同。
4. AI 建议采纳反馈。
5. 离线只读模式。
6. 实时语音 Agent 试点。

## 16. 验收看板

| 模块 | 验收项 | 状态 |
| --- | --- | --- |
| 基础工程 | 无乱码、可启动、可构建、可类型检查 | 待开发 |
| 意图架构 | 快捷按钮和文本统一走 intent router | 待开发 |
| Core 接入 | 首页、查询、提交均来自 Core | 待开发 |
| 店长 | 经营、员工、客户增长、库存可用 | 待开发 |
| 前台预约 | 今日预约、确认、改期、取消、到店可用 | 待开发 |
| 核销 | 选择客户、选择卡项、确认核销、成功卡 | 待开发 |
| 收银 | 开单、多选、优惠、支付、完成 | 待开发 |
| 办卡 | 选客户、选卡、优惠赠送、开卡完成 | 待开发 |
| 充值 | 选客户、金额赠送、充值完成 | 待开发 |
| 登记 | 用户信息、摄像头、检测、登记完成 | 待开发 |
| 美容师 | 我的预约、客户档案、服务记录、护理建议 | 待开发 |
| AI | 意图分类、槽位抽取、建议、不编造事实 | 待开发 |
| 权限 | 三角色数据和动作不越权 | 待开发 |
| 性能 | 首页 2 秒内骨架或关键数据可见 | 待开发 |

## 17. 关键风险

| 风险 | 影响 | 处理方式 |
| --- | --- | --- |
| 原型源码乱码较多 | 修复量大，容易漏 | 先全局扫描，按组件逐个修复 |
| Core 接口不完整 | 微应用不能闭环 | mock/real 同步补接口，先补 P0 流程 |
| `loadCoreSnapshot()` 过重 | 加载慢 | 专用接口替代，snapshot 只兜底 |
| AI 误判业务意图 | 误触发流程 | 规则优先，AI 低置信度追问 |
| 权限模型仍在改 | 按钮和数据变化 | 只依赖 bootstrap capabilities |
| 写操作重复提交 | 重复核销或订单 | 幂等键、按钮锁、Core 防重 |
| 真实设备不可用 | 登记、打印、扫码演示中断 | 提供模拟和降级 |

## 18. 下一步建议

建议立即进入阶段 1 和阶段 2，顺序如下：

1. 修复 Kiosk Prototype 中文乱码。
2. 增加 `typecheck`。
3. 把当前快捷按钮 action 梳理为标准 intent。
4. 新建 intent router 和 command registry。
5. 先把“今日预约、核销、收银”三个最高频前台流程迁到新架构。
6. 再迁移“店长经营、库存、员工”和“美容师我的预约、客户档案、护理建议”。
7. 最后接 AI intent classifier。

这样做的好处是：先把最影响演示和联调的基础问题解决，再逐步把架构从硬编码改成意图驱动，不会一次性大拆导致当前可演示能力丢失。
