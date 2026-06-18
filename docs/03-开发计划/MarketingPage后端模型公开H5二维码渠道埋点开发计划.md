# MarketingPage 后端模型、公开 H5、二维码与渠道埋点开发计划

日期：2026-06-07  
关联文档：

- `docs/02-产品设计/营销H5小程序生成器方案.md`
- `docs/03-开发计划/营销H5小程序生成器阶段2商品项目生成器开发计划.md`

## 1. 背景与目标

当前商品/项目生成器已经能从商品或项目生成推广页草稿，并临时复用 `MarketingActivity.pageSchema` 发布为营销活动页。下一步需要把这条临时链路升级成真正的营销页面基础设施：

1. 后端新增独立 `MarketingPage` 模型，不再把商品/项目推广页全部塞进营销活动表。
2. 提供公开 H5 渲染端，客户无需后台登录即可打开推广页。
3. 发布后生成稳定分享链接、二维码、小程序路径和渠道参数。
4. 采集访问、点击、分享、留资、预约、领券等行为事件。
5. 在管理端展示页面维度和渠道维度的基础效果漏斗。

本阶段目标不是做完整交易闭环，而是先把“页面独立发布、公开访问、渠道分发、行为可追踪”打通。

## 2. 交付范围

### 2.1 本阶段必须交付

| 模块 | 必须能力 |
| --- | --- |
| 后端模型 | `MarketingPage`、`MarketingPageVersion`、`MarketingPageEvent` |
| 管理端 API | 页面创建、更新、发布、下线、复制、效果统计 |
| 公开 API | 按 `slug` 获取公开页面、上报事件、提交留资、提交预约意向 |
| 前端管理端 | 生成器发布目标从 `MarketingActivity` 迁移到 `MarketingPage`，展示链接和二维码 |
| H5 渲染端 | 能渲染商品页、项目页、活动页 Schema，支持移动端浏览 |
| 二维码 | 发布后生成基础二维码，支持渠道参数 |
| 埋点 | `view`、`click_cta`、`share`、`lead_submit`、`book` |
| 效果统计 | PV、UV、CTA 点击、留资、预约、渠道分布 |

### 2.2 本阶段暂缓

| 暂缓项 | 原因 |
| --- | --- |
| 微信支付/定金支付 | 会引入支付、退款、财务对账，独立阶段处理 |
| 拼团/分销佣金 | 规则复杂，先验证页面和渠道基础链路 |
| 小程序原生 Schema Renderer | 先用 H5 或小程序 web-view |
| 多租户自定义域名 | 先用统一分享域名 |
| 完整营销归因收入 | 本阶段只记录行为和预约线索，成交归因接订单闭环阶段 |

## 3. 当前状态

| 现有能力 | 当前位置 | 下一步处理 |
| --- | --- | --- |
| 商品/项目草稿生成器 | `src/utils/marketingPageGenerator.ts` | 输出结构迁移为 `MarketingPage` 创建 payload |
| 生成器弹窗 | `src/app/components/MarketingPageGeneratorDialog.tsx` | 发布接口从 `createMarketingActivity` 改为 `createMarketingPage/publishMarketingPage` |
| 商品入口 | `src/app/pages/GoodsProductManagement.tsx` | 保留入口，发布目标切换为 MarketingPage |
| 项目入口 | `src/app/pages/ProjectManagement.tsx` | 保留入口，发布目标切换为 MarketingPage |
| 分享域名配置 | `src/config/marketingAssets.ts` | 增加 `buildMarketingPageUrl(slug, params)` |
| 活动页 Schema | `src/types/ai.ts` | 第一版兼容复用，后续扩展为 `MarketingPageSchema` |
| 行为事件入口 | `/marketing/customer-events` | 新增公开页面事件专用接口，不复用后台鉴权接口 |

## 4. 数据模型设计

### 4.1 Prisma 模型

新增迁移建议命名：

```text
packages/server-v2/prisma/migrations/<timestamp>_marketing_pages
```

建议模型：

```prisma
model MarketingPage {
  id                Int       @id @default(autoincrement())
  storeId            Int?
  activityId         Int?
  sourceType         String    // product/project/activity/card/package/recommendation/store_topic
  sourceId           String?
  title              String
  slug               String    @unique
  runtimeType        String    @default("h5") // h5/miniapp/both
  pageSchema         Json
  snapshotJson       Json?
  themeJson          Json?
  shareTitle         String?
  shareDescription   String?
  shareImage         String?
  status             String    @default("draft") // draft/published/offline
  shareUrl           String?
  miniappPath        String?
  qrCodeUrl          String?
  aiGenerationId     String?
  promptVersion      String?
  publishedAt        DateTime?
  offlineAt          DateTime?
  createdBy          Int?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt

  versions           MarketingPageVersion[]
  events             MarketingPageEvent[]

  @@index([storeId, status])
  @@index([sourceType, sourceId])
  @@index([publishedAt])
}

model MarketingPageVersion {
  id               Int      @id @default(autoincrement())
  pageId           Int
  version          Int
  pageSchema       Json
  snapshotJson     Json?
  changeSummary    String?
  aiGenerationId   String?
  createdBy        Int?
  createdAt        DateTime @default(now())

  page             MarketingPage @relation(fields: [pageId], references: [id], onDelete: Cascade)

  @@unique([pageId, version])
  @@index([pageId])
}

model MarketingPageEvent {
  id             Int      @id @default(autoincrement())
  pageId         Int
  storeId        Int?
  customerId     Int?
  sessionId      String?
  openId         String?
  eventType      String   // view/share/click_cta/lead_submit/book/coupon_claim
  channel        String?
  referrer       String?
  staffId        Int?
  campaignId     String?
  source         String?
  medium         String?
  userAgent      String?
  ipHash         String?
  metadataJson   Json?
  occurredAt     DateTime @default(now())

  page           MarketingPage @relation(fields: [pageId], references: [id], onDelete: Cascade)

  @@index([pageId, eventType, occurredAt])
  @@index([storeId, occurredAt])
  @@index([customerId])
  @@index([sessionId])
  @@index([channel, occurredAt])
}

model MarketingPageLead {
  id             Int      @id @default(autoincrement())
  pageId         Int
  storeId        Int?
  customerId     Int?
  sessionId      String?
  name           String?
  phone          String
  intentType     String?  // consult/book/product/project
  message        String?
  channel        String?
  staffId        Int?
  status         String   @default("new") // new/contacted/booked/invalid
  metadataJson   Json?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([pageId, createdAt])
  @@index([storeId, status])
  @@index([phone])
}
```

说明：

- `snapshotJson` 保存发布时商品/项目/活动快照，避免后续改价影响历史页面。
- `slug` 是公开访问主键，不能暴露自增 ID 作为唯一入口。
- `ipHash` 只保存 hash，不保存明文 IP，降低隐私风险。
- `MarketingPageLead` 独立存线索，避免把手机号塞进事件 metadata。

### 4.2 Slug 规则

建议格式：

```text
mp_<sourceType>_<sourceId>_<shortHash>
```

示例：

```text
mp_product_18_a7k3p9
mp_project_32_f2q8lm
```

同一商品多次生成页面时，允许生成多个 slug；复制页面时生成新 slug。

## 5. 后端 API 设计

### 5.1 管理端 API

控制器建议：

```text
packages/server-v2/src/marketing-pages/marketing-pages.controller.ts
packages/server-v2/src/marketing-pages/marketing-pages.service.ts
packages/server-v2/src/marketing-pages/marketing-pages.module.ts
```

接口清单：

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/marketing/pages` | `core:marketing:view` | 页面列表，支持状态、sourceType、keyword、storeId |
| `POST` | `/marketing/pages` | `core:marketing:create` | 创建页面草稿 |
| `GET` | `/marketing/pages/:id` | `core:marketing:view` | 获取页面详情 |
| `PUT` | `/marketing/pages/:id` | `core:marketing:update` | 更新草稿或已下线页面 |
| `POST` | `/marketing/pages/:id/publish` | `core:marketing:update` | 发布页面，写版本、生成链接和二维码 |
| `POST` | `/marketing/pages/:id/offline` | `core:marketing:update` | 下线页面 |
| `POST` | `/marketing/pages/:id/duplicate` | `core:marketing:create` | 复制页面 |
| `GET` | `/marketing/pages/:id/effects` | `core:marketing:analytics` | 页面效果统计 |
| `GET` | `/marketing/pages/:id/events` | `core:marketing:analytics` | 页面事件明细 |
| `GET` | `/marketing/pages/:id/leads` | `core:marketing:view` | 页面线索列表 |

创建页面请求：

```ts
interface CreateMarketingPageDto {
  storeId?: number;
  activityId?: number;
  sourceType: 'product' | 'project' | 'activity' | 'card' | 'package' | 'recommendation';
  sourceId?: string | number;
  title: string;
  pageSchema: Record<string, unknown>;
  snapshotJson?: Record<string, unknown>;
  shareTitle?: string;
  shareDescription?: string;
  shareImage?: string;
  themeJson?: Record<string, unknown>;
  aiGenerationId?: string;
  promptVersion?: string;
}
```

发布响应：

```ts
interface PublishMarketingPageResult {
  id: number;
  slug: string;
  status: 'published';
  shareUrl: string;
  miniappPath?: string;
  qrCodeUrl?: string;
  publishedAt: string;
}
```

### 5.2 公开 API

公开控制器建议：

```text
packages/server-v2/src/public-marketing/public-marketing.controller.ts
```

接口清单：

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/public/marketing/pages/:slug` | 无后台登录 | 获取已发布页面公开数据 |
| `POST` | `/public/marketing/pages/:slug/events` | 无后台登录，限流 | 上报页面事件 |
| `POST` | `/public/marketing/pages/:slug/leads` | 验证手机号/限流 | 提交线索 |
| `POST` | `/public/marketing/pages/:slug/bookings` | 验证手机号/限流 | 提交预约意向 |

公开页面响应只允许返回：

- 页面标题、分享信息、页面 Schema
- 门店名、电话、地址
- 已发布状态
- 公开价格、活动规则

不得返回：

- 成本价、内部预测分数、客户分层、AI prompt、后台用户 ID、未发布草稿

## 6. 前端管理端开发

### 6.1 类型与 API

新增类型：

```text
src/types/marketing-page.ts
```

新增 API：

```text
src/api/real/marketingPage.ts
src/api/marketingPage.ts
```

建议导出：

- `createMarketingPage`
- `updateMarketingPage`
- `publishMarketingPage`
- `offlineMarketingPage`
- `duplicateMarketingPage`
- `getMarketingPagesPaginated`
- `getMarketingPageEffects`
- `getMarketingPageLeads`

### 6.2 生成器迁移

修改：

```text
src/app/components/MarketingPageGeneratorDialog.tsx
src/utils/marketingPageGenerator.ts
```

从当前：

```text
createMarketingActivity(buildMarketingActivityPayloadFromPageDraft(...))
```

迁移为：

```text
createMarketingPage(buildMarketingPagePayload(...))
publishMarketingPage(page.id)
```

保留临时 fallback：

- 如果 `/marketing/pages` 不可用，可提示“页面服务暂不可用”，不再静默发布为活动页。
- 迁移完成后删除“当前先复用营销活动发布能力”的提示文案。

### 6.3 页面库

新增页面：

```text
src/app/pages/MarketingPageManagement.tsx
```

路由建议：

```text
/customer-marketing/page-generator
```

菜单建议放在“智能营销”下：

```text
营销页面
```

页面能力：

- 页面列表：标题、来源对象、状态、PV、UV、线索、预约、更新时间
- 操作：预览、复制链接、下载二维码、复制页面、下线、查看效果
- 筛选：状态、来源类型、门店、关键词

## 7. 公开 H5 渲染端

### 7.1 推荐路径

先新建独立前台包：

```text
packages/marketing-h5
```

技术栈建议：

- React + Vite + TypeScript
- Tailwind CSS 或轻量 CSS module
- 复用 `ActivityPageSchema` 渲染结构

基础命令：

```bash
cd packages/marketing-h5
npm run dev
npm run build
```

### 7.2 H5 路由

| 路由 | 说明 |
| --- | --- |
| `/activity/:slug` | 兼容当前营销活动链接 |
| `/page/:slug` | 通用 MarketingPage 页面 |
| `/p/:slug` | 短链形式，可用于二维码 |

### 7.3 H5 页面能力

必须支持：

- 移动端首屏渲染
- 商品推荐模块
- 项目推荐模块
- 权益/价格模块
- FAQ、活动须知、门店信息
- CTA：咨询顾问、立即预约、提交手机号
- 自动上报 `view`
- 点击 CTA 上报 `click_cta`
- 分享按钮上报 `share`
- 留资表单上报 `lead_submit`
- 预约意向上报 `book`

### 7.4 H5 渲染原则

- 不复用后台弹窗样式，要做客户可见页面。
- 页面加载失败时展示“活动暂不可访问”。
- 已下线页面展示“活动已结束或已下线”。
- 主图缺失时使用行业默认图或渐变背景，但发布前后台应提示缺图。

## 8. 二维码与渠道参数

### 8.1 分享链接规则

新增：

```ts
buildMarketingPageUrl(slug, params)
```

链接示例：

```text
https://mini.ami-core.com/page/mp_product_18_a7k3p9?channel=wechat_group&staffId=12&utm_source=wechat&utm_medium=group&utm_campaign=summer_hydration
```

渠道参数：

| 参数 | 说明 |
| --- | --- |
| `channel` | 渠道，如 `wechat_group`、`moments`、`sms`、`poster` |
| `staffId` | 员工/顾问 ID |
| `campaignId` | 活动或投放批次 |
| `utm_source` | 来源 |
| `utm_medium` | 媒介 |
| `utm_campaign` | 投放名称 |
| `shareId` | 分享链路 ID，可后续做裂变 |

### 8.2 二维码生成

MVP 建议后端生成 PNG 并保存为静态资源路径或对象存储路径。

实现选项：

| 方案 | 优点 | 缺点 |
| --- | --- | --- |
| 后端 `qrcode` npm 包生成 PNG | 可控、简单、适合下载 | 需要后端文件存储策略 |
| 前端 `qrcode.react` 生成 | 快速预览、无后端存储 | 下载和长期链接管理弱 |
| 第三方短链/二维码服务 | 统计强 | 外部依赖和成本 |

建议：

- 管理端先用前端生成二维码预览和下载。
- 后端 `qrCodeUrl` 字段预留，发布时可为空。
- 后续接对象存储后，发布时生成稳定二维码文件。

### 8.3 渠道二维码

管理端支持生成渠道二维码：

- 微信群
- 朋友圈
- 短信
- 门店海报
- 顾问个人分享

每个二维码只是同一 slug + 不同渠道参数，不需要复制页面。

## 9. 埋点与效果统计

### 9.1 事件定义

| 事件 | 触发时机 | 关键字段 |
| --- | --- | --- |
| `view` | 页面加载成功 | `sessionId`、`channel`、`staffId`、`referrer` |
| `share` | 点击分享/复制链接 | `shareTarget` |
| `click_cta` | 点击主 CTA | `ctaAction`、`sectionType` |
| `lead_submit` | 提交手机号/姓名 | `leadId`、`intentType` |
| `book` | 提交预约意向 | `projectId`、`preferredTime` |
| `coupon_claim` | 领取权益 | `couponId` 或 `offerType` |

### 9.2 UV 口径

第一版使用：

```text
sessionId + pageId
```

sessionId 来源：

- 本地 localStorage 生成 UUID
- 小程序 web-view 可透传 openId 后替换或绑定
- 提交手机号后可补充 customerId

### 9.3 效果统计 API

`GET /marketing/pages/:id/effects` 返回：

```ts
interface MarketingPageEffects {
  pageId: number;
  pv: number;
  uv: number;
  shareCount: number;
  ctaClickCount: number;
  leadCount: number;
  bookingCount: number;
  conversionRate: string;
  channelStats: Array<{
    channel: string;
    pv: number;
    uv: number;
    leadCount: number;
    bookingCount: number;
  }>;
  dailyTrend: Array<{
    date: string;
    pv: number;
    uv: number;
    leadCount: number;
    bookingCount: number;
  }>;
}
```

## 10. 安全与合规

### 10.1 公开接口防护

- `/public/marketing/pages/:slug/events` 需要限流。
- 线索提交需要手机号格式校验。
- 同一 session/IP 对同一页面高频提交要拦截。
- 公开 API 不返回未发布页面。
- 下线页面不可继续提交线索和预约。

### 10.2 隐私处理

- 事件表不保存明文 IP。
- 手机号只保存在 `MarketingPageLead`，不要散落到 metadata。
- 管理端线索列表按权限展示手机号。

### 10.3 内容安全

发布前继续检查：

- 不含内部标签：流失风险、LTV、模型、预测、命中客户等。
- 不含医疗功效承诺。
- 价格、活动时间、门店信息完整。
- 商品下架或项目停用时阻止发布。

## 11. 开发顺序

### 阶段 A：后端模型与管理 API，3-5 天

任务：

1. 新增 Prisma 模型和 migration。
2. 新增 `marketing-pages` module/service/controller。
3. 实现页面 CRUD、发布、下线、复制。
4. 发布时写入 `MarketingPageVersion`。
5. 增加 service 单测。

验收：

- `packages/server-v2 npm run build` 通过。
- 可创建商品/项目页面草稿。
- 发布后返回 slug 和 shareUrl。
- 下线后公开接口不可访问。

### 阶段 B：前端管理端迁移，2-4 天

任务：

1. 新增 `src/types/marketing-page.ts`。
2. 新增 `src/api/marketingPage.ts` 和 `src/api/real/marketingPage.ts`。
3. 修改生成器弹窗发布逻辑。
4. 增加页面库列表。
5. 增加复制链接、二维码入口。

验收：

- 商品/项目生成器发布到 `MarketingPage`。
- 页面库能看到已发布页面。
- 可复制公开链接。

### 阶段 C：公开 H5 渲染端，4-7 天

任务：

1. 新建 `packages/marketing-h5`。
2. 实现公开页面 API client。
3. 实现 Schema Renderer。
4. 实现移动端页面样式。
5. 实现 CTA、留资、预约意向。
6. 接入基础事件上报。

验收：

- 公开链接可在浏览器打开。
- 商品页和项目页展示正常。
- 点击 CTA 和提交表单有事件记录。

### 阶段 D：二维码与渠道统计，2-4 天

任务：

1. 增加 `buildMarketingPageUrl`。
2. 管理端生成二维码预览和下载。
3. 支持渠道参数配置。
4. 效果统计按渠道聚合。

验收：

- 同一页面不同渠道链接能分开统计。
- 二维码扫码进入 H5 页面。
- 页面效果页能看到渠道分布。

### 阶段 E：联调、测试和灰度，3-5 天

任务：

1. 跑完整前后端构建。
2. 商品页、项目页、活动页各走一条发布链路。
3. 验证下线、复制、重新发布。
4. 验证公开 API 安全边界。
5. 灰度到测试门店。

验收：

- 管理端发布页和 H5 公开页端到端可用。
- 事件与线索数据能在管理端查看。
- 无后台登录也可访问已发布页面，但不可访问草稿/下线页面。

## 12. 测试计划

### 12.1 后端

建议命令：

```bash
cd packages/server-v2
npm run build
npm run test
```

覆盖：

- `MarketingPagesService.create`
- `publish`
- `offline`
- `duplicate`
- `getPublicPageBySlug`
- `recordEvent`
- `submitLead`
- `getEffects`

### 12.2 前端管理端

建议命令：

```bash
npx tsc --noEmit -p tsconfig.json
npm run test
```

覆盖：

- 商品/项目生成器发布调用 `marketingPage` API
- 页面 URL 生成工具
- 页面效果数据格式兼容

### 12.3 H5

建议命令：

```bash
cd packages/marketing-h5
npm run build
```

手动验收：

- iPhone 390px 宽度
- Android 360px 宽度
- 微信内置浏览器
- 普通浏览器
- 页面缺图、已下线、slug 不存在

## 13. 风险与决策点

| 风险 | 影响 | 建议 |
| --- | --- | --- |
| 现有后端工作区改动较多 | migration 和 service 容易冲突 | 先独立 module，避免改营销主 service 大段逻辑 |
| H5 包新增依赖 | 构建和部署脚本要更新 | 新包独立 package.json，根项目后续再决定是否纳入 workspace |
| 二维码文件存储未定 | `qrCodeUrl` 可能暂时为空 | 前端先本地生成二维码下载，后端字段预留 |
| 公开 API 被刷 | 数据污染和短信风险 | 事件限流，线索提交加频控，短信验证码后续接入 |
| 页面 Schema 继续复用 Activity 命名 | 长期语义不准确 | 本阶段兼容，下一阶段再重命名为 `MarketingPageSchema` |

## 14. 里程碑

| 里程碑 | 完成标准 |
| --- | --- |
| M1 后端模型完成 | `MarketingPage` 可创建、发布、下线 |
| M2 管理端迁移完成 | 商品/项目生成器发布到 `MarketingPage` |
| M3 H5 首版可访问 | 公开链接可渲染商品/项目页 |
| M4 渠道二维码完成 | 可下载二维码，不同渠道可统计 |
| M5 基础效果闭环 | 管理端能看 PV、UV、点击、线索、预约 |

## 15. 推荐下一步

优先做阶段 A：后端模型与管理 API。原因是当前前端已经能生成页面草稿，但没有独立持久化对象；只有先落 `MarketingPage`，公开 H5、二维码和埋点才有稳定页面 ID、slug 和版本快照。
