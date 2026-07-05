# Ami Aura Lite 美容师角色智能终端详细开发计划

版本：v1.0
日期：2026-06-15
适用范围：`packages/Ami-Aura-Lite-Kiosk`、`packages/server-v2/src/terminal`、`packages/server-v2/prisma`、`src/api/real/*`、管理端美容师管理页面
问题来源：智能终端切换到“沈晴 / 美容师”后，需要明确美容师角色各模块现状，并按“我的预约、我的提成、客户档案、服务记录、护理建议、完成服务”形成稳定闭环。

## 1. 计划结论

美容师角色不建议继续在现有“全店排班取第一位美容师”的逻辑上补丁式扩展。正确路线是先完成 **管理端用户账号与美容师档案绑定**，再围绕绑定后的 `beauticianId` 打造专属终端工作台。

本计划分为五个阶段：

| 阶段 | 名称 | 目标 | 优先级 | 建议周期 |
| --- | --- | --- | --- | --- |
| 0 | 身份绑定与角色配置收口 | 让“沈晴账号”稳定映射到“沈晴美容师档案” | P0 | 1-2 天 |
| 1 | 美容师专属后端接口 | 所有“我的”数据按当前美容师过滤 | P0 | 2-3 天 |
| 2 | 终端美容师工作台改造 | 首页、快捷入口、缓存、消息流改成专属视图 | P0 | 3-4 天 |
| 3 | 服务记录与护理建议闭环 | 从快捷完成升级为可编辑服务记录和专业护理建议 | P1 | 3-5 天 |
| 4 | 验收、测试与演示数据 | 补齐测试、演示脚本、异常态和性能验收 | P0/P1 | 1-2 天 |

整体建议周期：10-16 个开发日。
P0 可演示闭环建议控制在 6-9 个开发日。

## 2. 当前现状

### 2.1 已具备能力

当前美容师角色已经具备以下基础：

- 顶部账号切换能选择“沈晴 / 美容师”。
- 前端本地角色配置中，美容师快捷入口包含：
  - 我的预约
  - 我的提成
  - 客户档案
  - 服务记录
  - 护理建议
  - 完成服务
- 终端已有基础消息流、快捷按钮、命令输入、角色首页和业务卡片框架。
- 后端已有服务任务、服务记录、客户健康档案、客户行为画像、推荐、提成等部分接口能力。
- 管理端美容师管理页面前端已经有 `userId` 选择字段。
- 终端提成接口已存在：`/terminal/commission/records/beautician-summary`。

### 2.2 关键问题

| 问题 | 当前表现 | 影响 |
| --- | --- | --- |
| 用户账号与美容师档案未落库绑定 | `Beautician` Prisma 模型没有 `userId`，但前端管理页已使用 `userId` | 沈晴账号不一定等于沈晴美容师档案 |
| 后端与前端角色配置不一致 | 前端有“我的提成”，后端 bootstrap 美容师 actions 缺少 `beautician.commission` | 页面入口可能依赖前端兜底或缓存，长期不稳定 |
| 我的预约不是严格本人数据 | `getBeauticianDashboard()` 从全店排班中取 `staff[0]` | 只是在演示数据中碰巧显示沈晴，换账号会错 |
| 我的提成依赖错误风险高 | 提成接口需要准确 `beauticianId` | 账号未绑定时可能查错人 |
| 客户档案数据源偏弱 | 当前使用核销上下文或本地快照兜底 | 美容师看不到完整服务客户、皮肤档案和服务历史 |
| 服务记录没有表单 | 后端 DTO 支持服务结果、反馈、建议、图片、耗材，但终端 UI 未承接 | 无法做真实服务记录录入 |
| 护理建议偏原型 | 当前只是客户卡片摘要文案，不是专业护理方案 | 建议不够具体，难以支撑美容师服务 |
| 完成服务直接取第一个任务 | 当前快捷完成会取今日第一个服务任务 | 容易误完成他人任务或错误客户 |

## 3. 目标体验

### 3.1 美容师登录后的首页

当沈晴切换到美容师角色时，首页应展示：

- 当前美容师：沈晴，初级美容师。
- 今日排班：只展示沈晴自己的排班、忙碌、请假、已预约状态。
- 今日服务：待开始、进行中、待补记录、已完成。
- 我的提成：今日提成、本月累计、待确认、已确认。
- 待处理提醒：
  - 下一个客户
  - 当前服务任务
  - 服务记录待补
  - 可做护理建议的客户

### 3.2 快捷入口目标

| 入口 | 目标体验 |
| --- | --- |
| 我的预约 | 查看本人今日/本周预约和排班，可切换日期，只能改本人可编辑状态 |
| 我的提成 | 查看本人今日、本月、待确认、已确认、提成构成和明细 |
| 客户档案 | 搜索或选择本人服务客户，展示消费、皮肤、卡项、服务历史 |
| 服务记录 | 选择任务或客户，录入服务结果、客户反馈、下次建议、图片、耗材，提交后写回 Ami_Core |
| 护理建议 | 基于客户档案、健康档案、服务历史、项目和皮肤问题生成具体建议 |
| 完成服务 | 选择本人进行中/待完成任务，确认服务记录后完成，而不是自动完成第一条 |

### 3.3 权限目标

- 美容师只能看自己的排班、服务任务、提成和服务过的客户。
- 店长/超级管理员切换到美容师视角时，应明确是“代看某美容师”还是“选择美容师后查看”。
- 前台不能进入美容师专属提成和服务记录编辑能力，除非角色权限配置允许。

## 4. 数据模型计划

### 4.1 补齐用户账号与美容师档案绑定

当前 `packages/server-v2/prisma/schema.prisma` 中 `Beautician` 没有 `userId`。建议新增：

```prisma
model User {
  // existing fields...
  beauticianProfiles Beautician[]
}

model Beautician {
  id        Int      @id @default(autoincrement())
  storeId   Int
  userId    Int?
  name      String
  phone     String?
  levelId   Int?
  avatar    String?
  status    String   @default("active")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  store Store @relation(fields: [storeId], references: [id])
  user  User? @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([storeId])
  @@index([userId])
  @@unique([storeId, userId])
}
```

说明：

- `userId` 允许为空，兼容没有系统账号的美容师档案。
- `@@unique([storeId, userId])` 保证同一门店同一账号只绑定一个美容师档案。
- 如果未来支持同一用户跨多店任职，按 `storeId + userId` 绑定更稳妥。

### 4.2 演示数据绑定

在 `seed-demo-full-store.ts` 中补齐绑定：

| 用户账号 | 用户名 | 绑定美容师 |
| --- | --- | --- |
| 沈晴 | `ami_demo_full_beautician_01` | 沈晴 |
| 唐伊 | `ami_demo_full_beautician_02` | 唐伊 |
| 顾然 | `ami_demo_full_beautician_03` | 顾然 |

绑定策略：

1. 优先按用户名后缀和姓名匹配。
2. 同名同门店时绑定对应 `Beautician`。
3. 管理端手工创建或编辑美容师时也能绑定系统用户。

### 4.3 管理端美容师管理同步

涉及文件：

- `src/app/pages/BeauticianManagement.tsx`
- `src/api/real/beautician.ts`
- `packages/server-v2/src/beautician/*`
- `packages/server-v2/prisma/schema.prisma`

任务：

- 后端 DTO 支持 `userId`。
- 创建/编辑美容师时写入 `userId`。
- 列表接口返回 `userId`。
- 用户下拉只显示当前门店可用账号，且建议筛选美容师角色账号。
- 已绑定账号需要在其他美容师编辑中禁用或提示“已绑定”。

验收：

- 管理端编辑“沈晴”美容师时能看到绑定账号 `ami_demo_full_beautician_01`。
- 保存后刷新仍保留绑定关系。
- 终端切换沈晴账号后，能拿到 `currentBeautician.id = 沈晴美容师档案 id`。

## 5. 后端接口计划

### 5.1 Bootstrap 补齐美容师上下文

接口：`GET /api/terminal/bootstrap`

新增返回字段建议：

```ts
interface TerminalBootstrap {
  currentUser: TerminalUser;
  currentRole: 'manager' | 'reception' | 'beautician';
  currentBeautician?: {
    id: number;
    name: string;
    phone?: string;
    level?: string;
    storeId: number;
    status: string;
  };
  terminalUsers: Array<TerminalUser & {
    boundBeauticianId?: number;
    boundBeauticianName?: string;
  }>;
}
```

任务：

- `mapTerminalAuthUser()` 增加绑定美容师信息。
- `mapTerminalUserOption()` 增加 `boundBeauticianId`、`boundBeauticianName`。
- `getBootstrap()` 根据 `selectedUser.id` 和 `storeId` 查找 `Beautician.userId`。
- 美容师角色下，如果无绑定美容师：
  - 纯美容师账号：返回业务化错误或空态，引导管理端绑定。
  - 店长/管理员代看：允许通过 `beauticianId` 查询参数选择要代看的美容师。

### 5.2 统一角色配置

当前前后端配置不一致。后端美容师 `actionMap` 需要补齐：

```ts
beautician: [
  'beautician.schedule',
  'beautician.commission',
  'beautician.customer',
  'beautician.record',
  'beautician.advice',
  'operation.service-complete',
]
```

同时补齐：

- `labelMap['beautician.commission'] = '我的提成'`
- `iconMap['beautician.commission'] = 'Wallet'`
- 权限建议增加 `aura:commission:read:self` 或沿用 `aura:beautician:view`

验收：

- `GET /terminal/bootstrap?operatorId=32&role=beautician` 返回 6 个 quick actions。
- 前端不依赖本地兜底也能显示“我的提成”。

### 5.3 新增美容师专属接口

建议新增 Controller：`TerminalBeauticianController`

路由前缀：

```text
/api/terminal/beautician
```

#### 5.3.1 当前美容师上下文

```http
GET /api/terminal/beautician/me
```

返回：

```ts
interface TerminalBeauticianMe {
  userId: number;
  beauticianId: number;
  name: string;
  level: string;
  storeId: number;
  storeName: string;
  roleMode: 'self' | 'manager_delegate';
}
```

用途：

- 所有美容师接口统一先解析当前 `beauticianId`。
- 如果没有绑定，返回明确错误：`当前账号未绑定美容师档案，请在管理端美容师管理中绑定账号`。

#### 5.3.2 美容师首页

```http
GET /api/terminal/beautician/dashboard?date=2026-06-15
```

返回：

```ts
interface TerminalBeauticianDashboard {
  beautician: TerminalBeauticianMe;
  date: string;
  schedule: {
    todaySlots: ScheduleSlot[];
    weekSlots: ScheduleSlot[][];
    weekStart: string;
    utilization: string;
  };
  tasks: {
    pending: TerminalServiceTask[];
    inProgress: TerminalServiceTask[];
    needRecord: TerminalServiceTask[];
    completedToday: TerminalServiceTask[];
    nextTask?: TerminalServiceTask;
  };
  commission: TerminalBeauticianCommissionSummary;
  alerts: Array<{
    type: 'next_task' | 'record_missing' | 'customer_advice' | 'commission_pending';
    title: string;
    description: string;
    relatedId?: number;
  }>;
  summary: string;
}
```

数据来源：

- `Beautician.userId` 解析本人。
- `Schedule` 查本人周排班。
- `Reservation` 查本人今日预约。
- `ServiceTask` 查本人今日服务任务。
- `CommissionRecord` 查本人提成。

#### 5.3.3 我的预约/排班

```http
GET /api/terminal/beautician/schedule?weekStart=2026-06-15
PATCH /api/terminal/beautician/schedule/slots
```

要求：

- 只返回当前美容师排班。
- 可编辑状态限定为：正常、忙碌、请假。
- 已预约、已过时不可编辑。
- 店长代看模式是否可编辑由权限决定。

#### 5.3.4 我的提成

现有接口可复用：

```http
GET /api/terminal/commission/records/beautician-summary?beauticianId=40&period=month&detailLimit=50
```

建议新增本人语义接口：

```http
GET /api/terminal/beautician/commission?period=month&detailLimit=50
```

原因：

- 前端不应自己传错 `beauticianId`。
- 后端统一用当前账号绑定的 `beauticianId`。

#### 5.3.5 我的客户

```http
GET /api/terminal/beautician/customers?keyword=&scope=served
GET /api/terminal/beautician/customers/:id/profile
```

客户范围：

- 本人预约过的客户。
- 本人服务任务关联客户。
- 本人提成订单关联客户。
- 店长代看时按选中美容师范围。

客户详情应包含：

- 基础档案。
- 标签、会员等级、累计消费、最近到店。
- 健康档案、肤质、过敏史、护理目标。
- 最近服务记录。
- 可用卡项。
- 最近消费。
- 下一步建议。

#### 5.3.6 服务任务

```http
GET /api/terminal/beautician/tasks?date=2026-06-15&status=pending
PATCH /api/terminal/beautician/tasks/:id/start
PATCH /api/terminal/beautician/tasks/:id/complete
```

要求：

- 只允许操作本人任务。
- 完成服务前必须确认服务记录基础字段。
- 不再允许“直接取第一条任务自动完成”。

#### 5.3.7 服务记录

复用现有：

```http
POST /api/terminal/service-records
PUT /api/terminal/tasks/:id/service-record
```

建议新增本人语义接口：

```http
POST /api/terminal/beautician/service-records
PUT /api/terminal/beautician/tasks/:id/service-record
```

请求体：

```ts
interface BeauticianServiceRecordSubmit {
  taskId?: number;
  customerId: number;
  projectId?: number;
  result?: string;
  customerFeedback?: string;
  nextSuggestion?: string;
  remark?: string;
  images?: string[];
  consumptionItems?: Array<{
    productId?: number;
    productName?: string;
    sku?: string;
    standardQty?: number;
    actualQty?: number;
    unit?: string;
  }>;
  transferToCashier?: boolean;
  nextReservationSuggestion?: string;
}
```

#### 5.3.8 护理建议

```http
POST /api/terminal/beautician/care-advice
```

请求：

```ts
interface CareAdviceRequest {
  customerId: number;
  taskId?: number;
  projectId?: number;
  skinTestId?: number;
  currentConcern?: string;
}
```

返回：

```ts
interface CareAdviceResponse {
  customerId: number;
  customerName: string;
  riskNotes: string[];
  todayAdvice: string[];
  nextCarePlan: Array<{
    projectName: string;
    reason: string;
    suggestedIntervalDays: number;
  }>;
  homeCareTips: string[];
  contraindications: string[];
  upsellHints: string[];
  source: {
    healthProfile: boolean;
    serviceHistory: boolean;
    skinTest: boolean;
    aiGenerated: boolean;
  };
}
```

要求：

- 先用结构化规则生成基础建议。
- AI 只用于润色和补充，不生成未验证事实。
- 没有健康档案时，要提示“建议补充肤况/过敏史”。

## 6. 前端开发计划

### 6.1 类型与服务层

涉及文件：

- `packages/Ami-Aura-Lite-Kiosk/src/app/types.ts`
- `packages/Ami-Aura-Lite-Kiosk/src/app/services/auraCoreService.ts`
- `packages/Ami-Aura-Lite-Kiosk/src/app/services/terminalQueryClient.ts`
- `src/types/terminal.ts`
- `src/api/real/terminal.ts`
- `src/api/terminal.ts`

任务：

- 新增 `TerminalBeauticianMe`、`TerminalBeauticianDashboard`、`CareAdviceResponse` 等类型。
- `AuraBootstrap` 增加 `currentBeautician`。
- `getBeauticianDashboard()` 改为调用美容师专属接口。
- 缓存 Key 增加 `operatorId` / `beauticianId`：

```ts
['beautician-dashboard', storeId, beauticianId, date]
['beautician-schedule', storeId, beauticianId, weekStart]
['beautician-commission', storeId, beauticianId, period]
['beautician-customers', storeId, beauticianId, keyword]
```

验收：

- 切换沈晴/唐伊/顾然后，缓存不会串数据。
- 切换角色后，对话历史和数据缓存隔离仍有效。

### 6.2 美容师首页卡片

建议将现有 `BeauticianDashboardCard` 拆分为：

- `BeauticianHomeCard`
- `BeauticianSchedulePanel`
- `BeauticianTaskPanel`
- `BeauticianCommissionPanel`
- `BeauticianAlertPanel`

首页布局建议：

```text
美容师信息条
  沈晴 · 初级美容师 · 今日 4 个任务 · 下一个客户 12:00

今日服务任务
  待开始 / 进行中 / 待补记录 / 已完成

我的提成
  今日 / 本月 / 待确认 / 已确认

我的排班
  今日、明日、后日 / 状态切换
```

体验要求：

- 不使用全店排班宽表。
- 不展示其他美容师名字。
- 任务卡片直接给“开始服务、写记录、完成服务、护理建议”按钮。
- 没有绑定美容师时展示明确空态，不展示第一位美容师。

### 6.3 我的预约

入口：`beautician.schedule`

目标：

- 打开美容师首页并聚焦排班/预约区。
- 展示本人今日/明日/后日预约。
- 支持从预约进入客户档案、护理建议、服务记录。

调整：

- `runMicroAppIntent()` 中 `beautician.schedule` 使用美容师专属 dashboard。
- `BeauticianDashboardCard` 不再保存全店 `saveSchedule` 数据。
- 保存排班时调用本人排班接口。

验收：

- 沈晴只能看到沈晴预约。
- 唐伊只能看到唐伊预约。
- 切换日期不出现其他美容师数据。

### 6.4 我的提成

入口：`beautician.commission`

目标：

- 默认打开提成面板。
- 展示今日、本月、待确认、已确认。
- 展开查看本月明细。
- 支持按项目、商品、开卡、充值分组。

调整：

- 后端 bootstrap 增加入口。
- 前端 `runMicroAppIntent()` 保留 `focus: 'commission'`，但数据从本人接口读取。
- 明细加载时不再传全局错误的 `beauticianId`。

验收：

- 沈晴看到的提成接口请求中对应沈晴绑定 `beauticianId`。
- 月度明细展开后不报错。
- 无提成时展示空态，而不是 0 值误导。

### 6.5 客户档案

入口：`beautician.customer`

目标：

- 默认展示“我的服务客户”列表。
- 输入客户姓名/手机号时在本人服务客户范围内搜索。
- 详情包含：基础信息、健康档案、服务历史、卡项、消费记录、下一步建议。

前端组件：

- 扩展 `CustomerProfileCard`。
- 新增 `BeauticianCustomerSearchCard`。
- 新增 `CustomerServiceHistoryList`。

验收：

- 美容师不能通过客户档案入口看到非本人服务客户，除非有店长权限。
- 客户详情中肤质、过敏史、护理目标可见。
- 最近服务记录可见。

### 6.6 服务记录

入口：`beautician.record`

当前问题：

- 现在入口直接调用 `getOperationResult('operation.service-complete')`。
- 没有选择任务，没有表单，没有图片/耗材/客户反馈录入。

目标流程：

```text
点击服务记录
  -> 展示本人今日任务列表
  -> 选择任务或客户
  -> 进入服务记录表单
  -> 填写服务结果、客户反馈、下次建议、耗材、图片
  -> 可选转前台收银
  -> 提交
  -> 返回服务记录成功卡片
```

新增组件：

- `ServiceRecordFlowCard`
- `ServiceTaskSelectList`
- `ServiceConsumableDetails`
- `ServiceImageUploader`

字段：

- 客户
- 项目
- 服务任务
- 服务结果
- 客户反馈
- 下次护理建议
- 耗材明细
- 服务图片
- 是否转前台收银
- 下次预约建议

验收：

- 没有任务时允许新建服务记录，但必须选择客户和项目。
- 有任务时优先选择任务。
- 提交后 `ServiceTask` 变为 completed。
- 消耗记录写入成功。
- 需要转前台收银时返回明确 next action。

### 6.7 护理建议

入口：`beautician.advice`

目标：

- 不再只是改客户卡片摘要。
- 先让美容师选择客户。
- 基于客户肤质、健康档案、服务历史、最近项目、卡项情况生成具体建议。

建议输出结构：

- 今日护理重点
- 禁忌/注意事项
- 推荐项目
- 推荐频次
- 居家护理提醒
- 可追加销售但不强推的项目/卡项提示
- 需要补充的档案字段

组件：

- `CareAdviceCard`
- `CareAdviceCustomerPicker`

验收：

- 建议里必须出现客户姓名和具体肤况/项目依据。
- 没有健康档案时，不编造肤况，提示补充。
- 建议可被复制到服务记录的“下次护理建议”。

### 6.8 完成服务

入口：`operation.service-complete`

目标：

- 从“自动完成第一条任务”改为“选择任务 + 确认服务记录 + 完成”。

流程：

```text
点击完成服务
  -> 展示本人进行中/待完成任务
  -> 选择任务
  -> 展示确认页
  -> 可补服务记录核心字段
  -> 确认完成
  -> 更新任务、刷新首页、刷新提成/收银相关缓存
```

验收：

- 不会误完成其他美容师任务。
- 已完成任务不能重复完成。
- 没有任务时给出“请先开始服务或联系前台创建任务”。

## 7. 权限与数据范围

### 7.1 角色数据范围

| 角色 | 美容师数据范围 |
| --- | --- |
| 美容师 | 仅本人绑定 `beauticianId` |
| 店长 | 可查看全店，也可选择某美容师代看 |
| 前台 | 默认不可查看提成；可查看服务任务协作信息 |
| 超级管理员 | 全店可见，可代看 |

### 7.2 终端上下文解析

后端统一实现：

```ts
resolveTerminalBeauticianContext(storeId, userId, operatorId?, role?, beauticianId?)
```

返回：

- `mode = self`：普通美容师本人。
- `mode = manager_delegate`：店长/管理员代看。
- `beauticianId`：最终数据过滤用 ID。
- `canEditSchedule`、`canReadCommission`、`canWriteServiceRecord`。

### 7.3 错误提示

| 场景 | 提示 |
| --- | --- |
| 美容师账号未绑定档案 | 当前账号未绑定美容师档案，请在管理端“美容师管理”中绑定系统账号 |
| 当前账号无美容师权限 | 当前账号没有美容师终端权限 |
| 店长代看未选择美容师 | 请选择要查看的美容师 |
| 访问非本人客户 | 当前客户不在你的服务范围内 |
| 完成他人任务 | 当前服务任务不属于你，无法完成 |

## 8. 缓存与性能

### 8.1 缓存 Key

美容师模块缓存必须带上 `operatorId` 和 `beauticianId`：

```ts
['beautician-dashboard', storeId, operatorId, beauticianId, date]
['beautician-schedule', storeId, operatorId, beauticianId, weekStart]
['beautician-tasks', storeId, operatorId, beauticianId, date, status]
['beautician-commission', storeId, operatorId, beauticianId, period]
['beautician-customers', storeId, operatorId, beauticianId, keyword]
```

### 8.2 失效规则

| 操作 | 失效缓存 |
| --- | --- |
| 切换账号 | 清当前 operator 缓存，加载新 operator 缓存 |
| 切换角色 | 清 role home cache |
| 保存排班状态 | `beautician-schedule`、`beautician-dashboard` |
| 开始服务 | `beautician-tasks`、`beautician-dashboard` |
| 提交服务记录 | `beautician-tasks`、`beautician-dashboard`、`beautician-customers` |
| 完成服务并转收银 | `beautician-tasks`、`beautician-dashboard`、`cashier-context` |
| 收银完成 | `beautician-commission`、`beautician-dashboard`、`manager-dashboard` |

### 8.3 性能目标

| 动作 | 目标 |
| --- | --- |
| 切到美容师首页 | 有缓存时 300ms 内展示，无缓存 2s 内可见 |
| 我的提成展开明细 | 2s 内返回或展示明确加载失败 |
| 服务记录提交 | 3s 内完成或展示可重试错误 |
| 护理建议生成 | 规则建议 1s 内，AI 增强 5s 内 |

## 9. 测试计划

### 9.1 后端单测

文件建议：

- `packages/server-v2/src/terminal/terminal.service.spec.ts`
- `packages/server-v2/src/beautician/*.spec.ts`

用例：

- bootstrap 返回美容师 `beautician.commission`。
- 沈晴账号解析到沈晴美容师档案。
- 未绑定美容师账号返回明确错误。
- 美容师只能读取本人任务。
- 美容师不能完成他人任务。
- 店长代看时可指定 `beauticianId`。
- 服务记录提交会更新任务并写消费记录。
- 护理建议在没有健康档案时不编造肤况。

### 9.2 前端单测

文件建议：

- `packages/Ami-Aura-Lite-Kiosk/src/app/microApps/runMicroApp.test.ts`
- `packages/Ami-Aura-Lite-Kiosk/src/app/services/auraCoreService.auth.test.ts`
- `packages/Ami-Aura-Lite-Kiosk/src/app/services/terminalQueryClient.test.ts`

用例：

- `beautician.schedule` 打开本人 dashboard。
- `beautician.commission` 聚焦提成面板。
- `beautician.record` 打开服务记录流程，不直接完成任务。
- `beautician.advice` 先选客户再出建议。
- 切换沈晴/唐伊后缓存隔离。

### 9.3 手动验收脚本

#### 脚本 A：沈晴首页

1. 打开 `http://127.0.0.1:5175/login`。
2. 切换账号为沈晴。
3. 确认角色为美容师。
4. 验证快捷入口有 6 个：我的预约、我的提成、客户档案、服务记录、护理建议、完成服务。
5. 首页只出现沈晴自己的排班和服务任务。

#### 脚本 B：我的提成

1. 点击“我的提成”。
2. 验证展示今日提成、本月累计、待确认、已确认。
3. 点击展开本月明细。
4. 验证明细属于沈晴绑定的 `beauticianId`。

#### 脚本 C：服务记录

1. 点击“服务记录”。
2. 选择沈晴今日任务。
3. 填写服务结果、客户反馈、下次建议。
4. 添加耗材明细。
5. 提交。
6. 验证任务完成，客户档案出现服务记录。

#### 脚本 D：完成服务

1. 点击“完成服务”。
2. 选择一个进行中任务。
3. 确认服务记录。
4. 完成服务。
5. 验证不会完成其他美容师任务。

#### 脚本 E：护理建议

1. 点击“护理建议”。
2. 选择沈晴服务客户。
3. 验证输出包含：
   - 今日护理重点
   - 禁忌/注意事项
   - 推荐项目
   - 下次护理间隔
   - 居家护理提醒

## 10. 交付清单

### 10.1 P0 交付

- [x] `Beautician.userId` 数据库字段和迁移。
- [x] 管理端美容师管理支持绑定系统账号并持久化。
- [x] 演示数据绑定沈晴、唐伊、顾然、宋乔账号。
- [x] 后端 bootstrap 美容师 actions 补齐 `beautician.commission`。
- [x] bootstrap 返回 `currentBeautician`。
- [x] 新增美容师 `me/dashboard/tasks/commission` 本人语义接口。
- [x] 前端美容师首页按本人数据展示，优先调用本人 dashboard 接口。
- [x] 我的提成按当前绑定美容师取数，不再由页面猜测 `beauticianId`。
- [x] 完成服务不再自动完成全店第一条任务；仅在当前美容师唯一进行中任务时快捷完成，否则提示选择任务。
- [x] 我的预约独立页面/弹层已扩展为本人任务视图。

### 10.2 P1 交付

- [x] 服务记录完整表单。
- [x] 服务记录快捷入口不再触发完成服务，改为准备记录上下文和提示必填项。
- [x] 客户档案优先使用当前美容师预约/服务任务关联客户。
- [x] 护理建议改为独立建议卡，优先调用结构化服务建议。
- [x] 图片上传/服务图片占位能力。
- [x] 耗材明细联动项目 BOM。
- [x] 店长代看美容师视角。
- [x] 异常态和空态完整。

### 10.3 P2 后续增强

- [x] 语音录入服务记录。
- [x] 摄像头拍摄/上传服务前后对比图，并随服务记录提交。
- [x] 护理建议接入更完整 AI 解释，结构化展示方案判断、服务前确认、关键步骤、耗材提示、服务后跟进和下次预约。
- [x] 客户签字确认服务记录，支持终端屏幕签名和姓名确认。
- [x] 美容师服务质量/复购贡献分析，按本人本月任务、记录完整率、重复服务客户和提成来源金额汇总。

### 10.4 当前验证结果

- [x] `packages/server-v2` 后端构建通过：`npm.cmd run build`。
- [x] `packages/Ami-Aura-Lite-Kiosk` 终端构建通过：`npm.cmd run build`。
- [x] 终端微应用入口测试通过：`npm.cmd exec -- vitest run src/app/microApps/runMicroApp.test.ts`，8/8 通过。

## 11. 风险与处理

| 风险 | 影响 | 处理 |
| --- | --- | --- |
| 历史美容师无账号 | 美容师无法登录终端 | 允许 `userId` 为空，但终端账号必须绑定后才能进入美容师本人视角 |
| 同名美容师匹配错误 | 演示数据绑定错人 | seed 使用 username 明确映射，不只靠姓名 |
| 店长切美容师角色含义不清 | 数据范围混乱 | 明确定义为“代看”，必须选择美容师 |
| 服务记录字段太多影响终端效率 | 美容师不愿填写 | P0 只保留核心字段，耗材/图片折叠 |
| 护理建议生成慢 | 影响现场服务 | 先出规则建议，AI 后台增强 |
| 提成数据延迟 | 美容师误解收入 | 展示“待确认/已确认”状态和更新时间 |

## 12. 待产品确认问题

1. 一个系统用户是否允许绑定多个门店的美容师档案？
2. 店长切换到美容师角色时，是默认代看第一个美容师，还是必须选择美容师？
3. 美容师是否允许编辑自己的排班状态，还是只能申请忙碌/请假？
4. 服务记录 P0 必填字段有哪些：服务结果、客户反馈、下次建议是否都必填？
5. 护理建议是否需要一键写入服务记录？
6. 完成服务是否必须先开始服务，还是允许从待开始直接完成？
7. 提成是否允许美容师看到订单号、客户名和金额明细？

## 13. 推荐实施顺序

推荐按以下顺序执行，避免前端做完后因身份数据不稳返工：

1. **先做数据模型和绑定**：`Beautician.userId`、管理端绑定、演示 seed。
2. **再做 bootstrap 和权限**：让终端知道当前账号对应哪个美容师。
3. **再做本人 dashboard 接口**：首页、排班、任务、提成统一从本人接口来。
4. **再改前端美容师工作台**：去掉 `staff[0]` 逻辑，按 `currentBeautician` 渲染。
5. **最后深化服务记录和护理建议**：形成真正服务闭环。

如果只做 P0，建议交付范围为：

- 沈晴账号绑定沈晴美容师档案。
- 美容师首页只看沈晴。
- 我的提成只看沈晴。
- 我的预约只看沈晴。
- 完成服务必须选择沈晴任务。
- 服务记录先做核心字段表单，不做图片和复杂耗材。
