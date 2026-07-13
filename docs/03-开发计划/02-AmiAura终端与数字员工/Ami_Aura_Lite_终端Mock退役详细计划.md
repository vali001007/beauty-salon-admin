# Ami Aura Lite 终端 Mock 退役详细计划

更新时间：2026-06-09

适用范围：

- 终端主线：`packages/Ami-Aura-Lite-Kiosk`
- 管理端共享 API：`src/api/terminal.ts`、`src/api/real/terminal.ts`
- 后端主线：`packages/server-v2/src/terminal`
- 终端类型：`src/types/terminal.ts`、`packages/Ami-Aura-Lite-Kiosk/src/app/types.ts`

## 一、总体结论

Ami Aura Lite 终端已经不是纯本地原型。当前主线已有 `auraCoreService`、`terminalQueryClient`、`src/api/terminal.ts`、`src/api/real/terminal.ts` 这一套真实数据链路，覆盖启动上下文、门店切换、今日预约、收银、办卡、充值、次卡核销、客户登记、皮肤检测、打印任务、服务任务、自动化等核心场景。

本轮要退役的不是测试里的 `vi.mock`，也不是 `terminalQueryClient` 的缓存兜底，而是终端界面中仍直接读取 `mockData` 或页面内硬编码列表的原型组件。

建议结论：

- 可以单独推进一轮“终端 Mock 退役”。
- 不建议直接批量删除组件。
- 先把仍有业务价值的原型组件迁移到真实 `FlowCard` 或 `auraCoreService` 数据，再删除 `mockData` 和 `LEGACY_FIGMA_COMPAT_DATA`。
- 最终目标是让终端主线只保留：真实 API、真实缓存、明确的空状态、测试 mock。

## 二、退役目标

### 2.1 产品目标

1. 终端演示和真实 Ami 全量演示门店保持一致。
2. 前台、店长、美容师看到的预约、客户、卡项、收银、打印等数据均来自 server-v2。
3. 终端不再出现“张三、李四、固定门店、固定小票”等本地原型数据。
4. 后续开发不再维护终端本地 mock 与生产/演示库两套数据。

### 2.2 技术目标

1. 删除 `packages/Ami-Aura-Lite-Kiosk/src/app/types.ts` 中的 `mockData` 与 `LEGACY_FIGMA_COMPAT_DATA`。
2. 清理终端组件中对 `mockData` 的直接 import。
3. 页面级硬编码业务列表改为真实接口、真实上下文或组件 props。
4. 保留测试中的 `vi.mock`，但测试 mock 只用于隔离网络和服务依赖。
5. 增加检查规则，避免新业务代码重新引入 `mockData`、`MOCK_*` 业务常量。

## 三、当前残留清单

### 3.1 `mockData` 定义

文件：`packages/Ami-Aura-Lite-Kiosk/src/app/types.ts`

当前内容：

- `mockData.storeName`
- `mockData.employeeName`
- `mockData.appointments`
- `mockData.customer`
- `mockData.overview`
- `LEGACY_FIGMA_COMPAT_DATA`

问题：

- 文案已出现编码异常，说明它更像历史 Figma/原型迁移残留。
- 数据固定，不跟随当前门店、当前登录人、当前日期刷新。
- 容易让终端演示结果与 Ami 全量演示门店不一致。

### 3.2 直接使用 `mockData` 的组件

| 组件 | 当前用途 | 建议处理 |
| --- | --- | --- |
| `AppointmentCard.tsx` | 本地今日预约列表、新增/确认/取消/到店、固定客户/项目/美容师/时段 | 迁移到 `getReceptionDashboard`、`getAppointments`、`createAppointmentFromTerminal`、`confirmAppointmentFromTerminal`、`checkInAppointmentFromTerminal`、`cancelAppointmentFromTerminal`；或由现有 `RoleDashboards` 替代 |
| `TodayOverviewCard.tsx` | 固定今日营收、预约、待到店、已到店 | 迁移到 `getReceptionDashboard` 或 `getTerminalTodayReservationsDashboard`，店长视角用 `getManagerDashboard` |
| `CustomerResultCard.tsx` | 固定客户查询结果 | 迁移到 `getCustomerCard(keyword)`，或直接退役，由 `CustomerProfileCard` / 微应用结果卡承接 |
| `CustomerRegistrationForm.tsx` | 新增客户表单，默认门店来自 `mockData.storeName`，提交只回调名称 | 迁移到 `RegistrationFlowCard` + `confirmRegistration`；如保留完整表单，需要接 `quickCreateTerminalCustomer` |
| `CashierCard.tsx` | 本地收银、固定客户/项目、模拟支付、模拟小票打印 | 迁移到 `CashierFlowCard` + `getCashierFlow` + `confirmCashierPayment` + `createTerminalPrintJob` |
| `NewCardForm.tsx` | 本地办卡，固定卡目录/客户/门店/项目 | 迁移到 `CardOpeningFlowCard` + `getCardOpeningFlow` + `confirmCardOpening` |
| `PrintStatusCard.tsx` | 固定待补打小票、模拟打印成功/失败、固定门店/收银员 | 迁移到 `getTerminalPrintJobs`、`getTerminalPrintJobStatus`、`retryTerminalPrintJob`、`updateTerminalPrintJobStatus`；设备状态接 `getTerminalDeviceStatus` |

### 3.3 页面内硬编码业务数据

除 `mockData` 外，部分组件还有固定数组：

- `AppointmentCard.tsx`：`STORES`、`PROJECTS`、`BEAUTICIANS`、`TIME_SLOTS`
- `CashierCard.tsx`：`CUSTOMERS`、`SERVICES`、`PAY_METHODS`
- `NewCardForm.tsx`：`CARD_CATALOG`、`STORES`、`CUSTOMERS`、`PROJECTS`
- `PrintStatusCard.tsx`：`PENDING_RECEIPTS`

处理原则：

- `TIME_SLOTS` 可以暂时保留为 UI 选择辅助，但最终应由预约可用时段接口或统一配置驱动。
- `PAY_METHODS` 可以保留为显示枚举，但 key 必须与后端支付方式一致，例如 `cash`、`wechat`、`alipay`、`card`、`member_balance`。
- 客户、项目、美容师、门店、卡目录、待打印小票必须走真实接口。

### 3.4 不纳入退役的 mock

以下内容不属于本轮退役对象：

- `*.test.ts`、`*.test.tsx` 中的 `vi.mock`。
- `terminalQueryClient` 的缓存、stale-while-revalidate、fallback 状态。
- `auraCoreService` 中用于接口失败时展示空态的降级逻辑。

但需要把“降级为空数据”和“本地假数据”区分清楚：接口失败时可以展示空态和错误提示，不应回退到固定张三/李四数据。

## 四、现有真实能力映射

### 4.1 终端已有前端服务

| 能力 | 前端服务 |
| --- | --- |
| 启动上下文 / 角色 / 门店 | `loadAuraBootstrap`、`switchAuraStore` |
| 查询缓存 | `terminalQuery`、`terminalPrefetch`、`setTerminalQueryData` |
| 前台首页 / 今日预约 | `getReceptionDashboard`、`getAppointments` |
| 预约新增 / 修改 / 到店 / 确认 / 取消 | `createAppointmentFromTerminal`、`updateAppointmentFromTerminal`、`confirmAppointmentFromTerminal`、`checkInAppointmentFromTerminal`、`cancelAppointmentFromTerminal` |
| 收银 | `getCashierFlow`、`confirmCashierPayment` |
| 办卡 | `getCardOpeningFlow`、`confirmCardOpening` |
| 充值 | `getRechargeFlow`、`confirmRecharge` |
| 次卡核销 | `getCardVerificationFlow`、`confirmCardVerification` |
| 客户登记 | `getRegistrationFlow`、`confirmRegistration` |
| 客户卡片 | `getCustomerCard` |
| 打印任务 | `createTerminalPrintJob`、`getTerminalPrintJobs`、`getTerminalPrintJobStatus`、`retryTerminalPrintJob` |

### 4.2 已有后端 / API 契约

已有真实接口主要集中在：

- `GET /terminal/bootstrap`
- `GET /terminal/dashboard/role`
- `GET /terminal/reservations/today`
- `POST /terminal/reservations`
- `PUT /terminal/reservations/:id`
- `PATCH /terminal/reservations/:id/confirm`
- `PATCH /terminal/reservations/:id/check-in`
- `PATCH /terminal/reservations/:id/cancel`
- `GET /terminal/customers/search`
- `POST /terminal/customers/quick-create`
- `POST /terminal/cashier/checkout`
- `POST /terminal/card-orders`
- `POST /terminal/recharge-orders`
- `POST /terminal/cards/verify`
- `POST /terminal/cards/consume`
- `POST /terminal/print-jobs`
- `GET /terminal/print-jobs`
- `GET /terminal/print-jobs/:id`
- `POST /terminal/print-jobs/:id/retry`
- `GET /terminal/devices/status`

## 五、改造方案

### 5.1 主线组件收敛

现有终端主线已经在 `AppContent.tsx` 中使用以下真实流程组件：

- `CardVerificationFlowCard`
- `CashierFlowCard`
- `CardOpeningFlowCard`
- `RechargeFlowCard`
- `RegistrationFlowCard`
- `RoleDashboards`

因此，本轮优先策略不是给旧原型组件逐个补接口，而是判断旧组件是否仍被主线引用：

1. 已有真实 FlowCard 覆盖的旧组件，直接从主线入口移除，确认无引用后删除组件。
2. 暂无完整替代的旧组件，先改造成接收 props，不再 import `mockData`。
3. 需要保留 UI 价值的部分，迁移到真实 FlowCard 内，避免两套界面并存。

### 5.2 `AppointmentCard` 退役路径

目标：

- 不再使用 `mockData.appointments`。
- 不再用本地 state 伪造确认、取消、到店。
- 今日预约全部来自 server-v2。

建议步骤：

1. 确认 `RoleDashboards` 中前台预约卡片是否已覆盖列表、确认、到店、取消、新增预约。
2. 若已覆盖，删除 `AppointmentCard` 的主线引用，后续删除组件文件。
3. 若仍需保留旧 UI，则改为：
   - props 输入：`data: AppointmentCardData`
   - 操作回调：`onCreate`、`onConfirm`、`onCheckIn`、`onCancel`、`onReschedule`
   - 数据加载统一放在 `auraCoreService`。
4. 新增预约选项从 `getAppointmentCreateOptions` 获取。
5. 到店后刷新 `["today-reservations"]`、`["role-dashboard"]` 相关缓存。

验收：

- 切换门店后预约列表随门店变化。
- 新增、确认、取消、到店后刷新真实数据。
- 页面中无 `mockData.appointments`。

### 5.3 `TodayOverviewCard` 退役路径

目标：

- 今日营收、今日预约、待到店、已到店从真实 dashboard 数据获取。

建议步骤：

1. 如果前台首页已经由 `RoleDashboards` 渲染，则删除 `TodayOverviewCard` 主线引用。
2. 如果仍要保留该卡片，改为 props：
   - `todayRevenue`
   - `appointmentCount`
   - `pendingArrivalCount`
   - `arrivedCount`
3. 数据来源：
   - 前台：`getReceptionDashboard`
   - 店长：`getManagerDashboard`
   - 预约专项：`getTerminalTodayReservationsDashboard`

验收：

- 数据和当前门店、当前日期一致。
- API 失败时显示空态或错误态，不显示固定 12800、12、5、7。

### 5.4 `CustomerResultCard` 退役路径

目标：

- 客户查询结果来自真实客户搜索和客户卡片聚合。

建议步骤：

1. 优先用现有 `CustomerProfileCard` 或微应用结果卡承接客户查询结果。
2. `CustomerResultCard` 如仍保留，改为 props：
   - `customer`
   - `summary`
   - `availableCards`
   - `lastVisitAt`
   - `onCashier`
   - `onVerifyCard`
3. 数据来源：
   - `getCustomerCard(keyword)`
   - `getTerminalCustomerSummary(customerId)`
   - `getTerminalCustomerCards(customerId)`

验收：

- 搜索不同客户展示不同结果。
- 无固定 `mockData.customer`。
- 开单收银、次卡核销按钮进入真实流程。

### 5.5 `CustomerRegistrationForm` 退役路径

目标：

- 新增客户写入 server-v2，而不是只回调名称。

建议步骤：

1. 优先确认 `RegistrationFlowCard` 是否覆盖当前新增客户诉求。
2. 旧表单如仍保留，提交接 `confirmRegistration` 或 `quickCreateTerminalCustomer`。
3. 门店字段不再提交 `storeName`，统一由 `X-Store-Id` / 当前门店上下文决定。
4. 默认门店显示来自 `loadAuraBootstrap().currentStore` 或 `useStoreStore.currentStoreId` 对应名称。
5. 生日统一 ISO 日期，避免后端校验失败。

验收：

- 提交后数据库出现真实客户。
- 切换门店后客户归属正确。
- 无 `mockData.storeName`。

### 5.6 `CashierCard` 退役路径

目标：

- 收银客户、商品/项目、支付、小票全部进入真实链路。

建议步骤：

1. 优先以 `CashierFlowCard` 作为主线收银入口。
2. 删除或隔离旧 `CashierCard`。
3. 如复用旧 UI，数据映射为：
   - 客户：`getCashierFlow().customers`
   - 商品/项目目录：`getCashierFlow().catalog`
   - 支付：`confirmCashierPayment`
   - 小票：`createTerminalPrintJob`
4. 支付方式统一使用后端 key：
   - `cash`
   - `wechat`
   - `alipay`
   - `card`
   - `member_balance`
5. 移除 `setTimeout` 和 `Math.random()` 模拟打印结果。

验收：

- 收银后生成真实订单。
- 支付方式写入真实订单。
- 小票打印任务进入 `print-jobs`。
- 无固定 `CUSTOMERS`、`SERVICES`、`mockData.storeName`、`mockData.employeeName`。

### 5.7 `NewCardForm` 退役路径

目标：

- 办卡走真实卡目录、真实客户、真实订单。

建议步骤：

1. 以 `CardOpeningFlowCard` 作为主线入口。
2. 旧 `NewCardForm` 如无主线引用，删除。
3. 如需要保留完整表格 UI，数据来源改为：
   - 客户：`getCardOpeningFlow().customers`
   - 卡目录：`getCardOpeningFlow().cards`
   - 赠送项目：`getCardOpeningFlow().giftProjects`
   - 提交：`confirmCardOpening`
4. 门店不再由用户选择固定数组，而由当前终端门店决定。

验收：

- 办卡后生成真实卡订单。
- 客户卡项可在后续次卡核销流程查到。
- 无固定 `CARD_CATALOG`、`CUSTOMERS`、`STORES`、`PROJECTS`。

### 5.8 `PrintStatusCard` 退役路径

目标：

- 待补打记录、打印状态、设备状态来自真实打印接口。

建议步骤：

1. 用 `getTerminalPrintJobs({ status })` 替代 `PENDING_RECEIPTS`。
2. 用 `getTerminalDeviceStatus()` 替代固定“未连接”。
3. 用 `retryTerminalPrintJob(id)` 替代本地“重试”。
4. 用 `getTerminalPrintJobStatus(id)` 或 `updateTerminalPrintJobStatus(id)` 承接状态同步。
5. 小票门店、收银员、客户、项目、金额全部取自 print job payload / source order。

验收：

- 待补打数量来自真实 print job。
- 点击补打会调用真实 retry 接口。
- 设备状态来自后端。
- 无 `PENDING_RECEIPTS`、无随机打印成功/失败。

## 六、实施阶段

### 阶段 0：保护线和引用审计

工期：0.5 天

任务：

1. 运行引用扫描：
   - `rg -n "mockData|LEGACY_FIGMA_COMPAT_DATA" packages/Ami-Aura-Lite-Kiosk/src`
   - `rg -n "MOCK_|PENDING_RECEIPTS|CUSTOMERS|SERVICES|CARD_CATALOG" packages/Ami-Aura-Lite-Kiosk/src/app/components`
2. 确认 7 个旧原型组件是否仍被 `AppContent.tsx`、`routes.tsx` 或微应用入口引用。
3. 建立临时保护规则：
   - 非测试代码禁止新增 `mockData`
   - 非测试代码禁止新增业务型 `MOCK_*`

产出：

- 最新引用清单。
- 可删除组件清单。
- 需要迁移的 UI 清单。

### 阶段 1：主线入口切换

工期：1 天

任务：

1. 确认 `AppContent.tsx` 只使用真实 FlowCard 和 `RoleDashboards`。
2. 如仍有旧组件入口，替换为：
   - `RoleDashboards`
   - `CashierFlowCard`
   - `CardOpeningFlowCard`
   - `RegistrationFlowCard`
   - `CardVerificationFlowCard`
   - `RechargeFlowCard`
3. 保留用户操作路径：
   - 今日预约
   - 新增客户
   - 收银
   - 办卡
   - 次卡核销
   - 打印小票

验收：

- 终端首页和微应用入口不再依赖旧原型组件。
- 终端核心路径仍可从语音/文本意图进入。

### 阶段 2：组件级退役或改造

工期：1.5-2 天

任务：

1. 对无引用组件执行删除候选确认。
2. 对仍有 UI 价值的组件改为 props 驱动，不再直接读服务或 mock。
3. 删除 `mockData` import。
4. 替换页面内硬编码业务数组。
5. 操作后统一刷新 `terminalQueryClient` 缓存。

建议优先级：

1. `TodayOverviewCard`
2. `AppointmentCard`
3. `CustomerResultCard`
4. `CustomerRegistrationForm`
5. `CashierCard`
6. `NewCardForm`
7. `PrintStatusCard`

验收：

- `rg -n "mockData|LEGACY_FIGMA_COMPAT_DATA" packages/Ami-Aura-Lite-Kiosk/src/app` 只允许没有结果。
- 非测试代码不再出现固定客户/固定门店/固定小票数据。

### 阶段 3：删除 `mockData` 与类型清理

工期：0.5 天

任务：

1. 删除 `packages/Ami-Aura-Lite-Kiosk/src/app/types.ts` 中：
   - `LegacyAppointment`
   - `mockData`
   - `LEGACY_FIGMA_COMPAT_DATA`
2. 保留真实业务类型：
   - `AppointmentCardData`
   - `CoreSnapshot`
   - `CashierFlowData`
   - `CardOpeningFlowData`
   - `RegistrationFlowData`
3. 修复因删除导致的类型错误。

验收：

- `npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run typecheck` 通过。
- `npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build` 通过。

### 阶段 4：真实数据联调

工期：1-2 天

任务：

1. 启动后端：
   - `npm.cmd run dev:api`
2. 启动终端：
   - `npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run dev -- --host 127.0.0.1 --port 5175`
3. 使用 Ami 全量演示门店验证：
   - 启动上下文
   - 今日预约
   - 新增预约
   - 到店
   - 快速登记客户
   - 收银
   - 办卡
   - 次卡核销
   - 打印任务
4. 对 API 失败场景检查空态/错误态。

验收：

- 终端演示不再出现固定张三/李四、固定门店、固定小票。
- 终端写操作能在管理端或数据库中看到结果。
- 切换门店后数据隔离正确。

### 阶段 5：防回归

工期：0.5 天

任务：

1. 增加测试或脚本检查：
   - 非测试代码禁止 `mockData`
   - 非测试代码禁止 `LEGACY_FIGMA_COMPAT_DATA`
   - 非测试代码禁止从 `types.ts` 导出历史原型数据
2. 保留 `vi.mock` 测试能力。
3. 更新相关文档：
   - `AGENTS.md`
   - `docs/terminal-api.md`
   - `docs/api-contract.md`
   - `docs/aura-lite-terminal-open-loops-audit.md`

验收：

- 后续新增终端业务不会重新引入本地原型数据。
- 文档明确：终端开发走 server-v2 + `auraCoreService` + `terminalQueryClient`。

## 七、验收清单

### 7.1 搜索验收

必须无结果：

```powershell
rg -n "mockData|LEGACY_FIGMA_COMPAT_DATA" packages/Ami-Aura-Lite-Kiosk/src/app
```

非测试文件必须无业务型假数据：

```powershell
rg -n "PENDING_RECEIPTS|CARD_CATALOG|const CUSTOMERS|const SERVICES|const STORES" packages/Ami-Aura-Lite-Kiosk/src/app -g "*.ts" -g "*.tsx"
```

允许存在：

```text
*.test.ts
*.test.tsx
vi.mock(...)
```

### 7.2 构建验收

```powershell
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run typecheck
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
```

如改动共享 API 或后端接口，还需执行：

```powershell
npm.cmd run build
npm.cmd --prefix packages/server-v2 run build
npm.cmd --prefix packages/server-v2 run test
```

### 7.3 手工验收

| 场景 | 验收点 |
| --- | --- |
| 终端启动 | 当前门店、当前用户、角色能力来自 `bootstrap` |
| 今日预约 | 列表、数量、到店状态与后端一致 |
| 新增预约 | 写入真实预约，刷新后仍存在 |
| 客户登记 | 写入真实客户，管理端可查 |
| 收银 | 生成真实订单和支付信息 |
| 办卡 | 生成真实卡订单，客户卡项可查 |
| 次卡核销 | 扣减真实卡项次数，生成核销记录 |
| 打印 | 生成真实 print job，可查询状态和重试 |
| 接口失败 | 展示错误/空态，不显示本地假数据 |
| 门店切换 | 所有列表随 `X-Store-Id` 切换 |

## 八、风险与处理

### 8.1 旧组件可能仍有 UI 价值

风险：

- 直接删除可能丢失某些原型里更完整的表单字段。

处理：

- 删除前先确认是否被主线引用。
- 有价值的 UI 先迁移到真实 FlowCard。
- 无引用、无独特能力的组件再删除。

### 8.2 真实接口字段仍不完全闭合

风险：

- 某些旧组件字段比现有接口多，例如完整客户档案、打印设备状态、补打历史。

处理：

- 能走现有接口的先接现有接口。
- 接口缺口记录到后续“终端业务闭环”计划，不用本地 mock 兜底。

### 8.3 API 失败后体验变空

风险：

- 去掉 mock 后，接口失败会更明显。

处理：

- 保留 `CoreDataStatus`、错误提示、重试按钮、缓存旧数据。
- 不再用假客户假订单兜底。

### 8.4 编码异常文案可能扩散

风险：

- 历史组件里存在乱码中文，迁移时可能继续污染新界面。

处理：

- 迁移 UI 时同步修复文案。
- 对直接退役的旧组件不单独修乱码，避免无效投入。

## 九、推荐执行顺序

推荐按以下顺序推进：

1. 引用审计：确认 7 个旧组件是否仍被主线使用。
2. 主线入口切换：全部回到 `AppContent -> runMicroApp -> auraCoreService -> real API`。
3. 低风险卡片替换：`TodayOverviewCard`、`CustomerResultCard`。
4. 预约与登记替换：`AppointmentCard`、`CustomerRegistrationForm`。
5. 交易类替换：`CashierCard`、`NewCardForm`、`PrintStatusCard`。
6. 删除 `mockData` 与 `LEGACY_FIGMA_COMPAT_DATA`。
7. 构建、测试、真实演示门店联调。
8. 加防回归检查。

## 十、完成定义

本轮“终端 Mock 退役”完成的标准：

1. `packages/Ami-Aura-Lite-Kiosk/src/app` 非测试代码中没有 `mockData`。
2. `types.ts` 不再导出 `LEGACY_FIGMA_COMPAT_DATA`。
3. 终端核心路径全部从真实 API 或真实缓存读取数据。
4. 接口失败只展示空态、错误态、重试态，不展示假数据。
5. Ami 全量演示门店能完成一轮终端核心演示：
   - 今日预约
   - 新增客户
   - 收银
   - 办卡
   - 充值
   - 次卡核销
   - 打印任务
6. 构建通过：
   - `npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run typecheck`
   - `npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build`

## 十一、执行结果

执行时间：2026-06-09

### 11.1 已完成

1. 已清理 `packages/Ami-Aura-Lite-Kiosk/src/app/types.ts` 中的历史原型数据导出：
   - `mockData`
   - `LEGACY_FIGMA_COMPAT_DATA`
   - `LegacyAppointment`
2. 已将旧原型组件改为 props 驱动或空态兼容，不再内置本地业务假数据：
   - `AppointmentCard.tsx`
   - `TodayOverviewCard.tsx`
   - `CustomerResultCard.tsx`
   - `CustomerRegistrationForm.tsx`
   - `CashierCard.tsx`
   - `NewCardForm.tsx`
   - `PrintStatusCard.tsx`
3. 额外清理了同类本地假数据组件：
   - `RechargeCard.tsx`
4. 已新增终端防回归脚本：
   - `packages/Ami-Aura-Lite-Kiosk/scripts/check-no-local-mock.mjs`
   - `packages/Ami-Aura-Lite-Kiosk/package.json` 新增 `check:no-mock`

### 11.2 验收结果

搜索验收已通过：

```powershell
rg -n "mockData|LEGACY_FIGMA_COMPAT_DATA|PENDING_RECEIPTS|CARD_CATALOG|const CUSTOMERS|const SERVICES|const STORES" packages\Ami-Aura-Lite-Kiosk\src\app -g "*.ts" -g "*.tsx"
```

结果：无匹配。

防回归脚本已通过：

```powershell
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run check:no-mock
```

结果：

```text
Ami Aura Lite local mock guard passed.
```

类型检查已通过：

```powershell
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run typecheck
```

生产构建已通过：

```powershell
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
```

说明：构建仍有 Vite 大 chunk 警告，这是既有包体拆分问题，不影响本轮终端 mock 退役验收。

### 11.3 后续建议

1. 将 `check:no-mock` 接入终端 CI 或本地质量检查。
2. 若后续确认旧原型兼容组件长期无引用，可在用户授权后单独执行“旧组件文件删除”清理。
3. 本轮退役后，终端新增业务应优先走 `AppContent -> runMicroApp -> auraCoreService -> real API` 主线，不再新增本地业务假数据。
