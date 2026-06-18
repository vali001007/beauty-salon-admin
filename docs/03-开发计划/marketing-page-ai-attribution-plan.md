# 营销页面生成器 P1 + P2 开发计划

版本：v1.0  
日期：2026-06-07  
适用范围：管理端、server-v2 后端、marketing-h5 渲染端  
前置文档：`docs/03-开发计划/ai-optimization-plan.md`

---

## 背景

营销页面生成器已具备完整的创建/发布/渲染/事件上报/线索收集链路。但存在两个关键缺口：

1. **P1：前端页面生成器没有接入后端 AI**。当前 `MarketingPageGeneratorDialog` 用本地规则模板拼页面（`buildProductMarketingPageDraft`），标题/描述/文案全部是硬编码拼接，缺乏创意和个性化。后端 `/ai/generate/activity-page` 已经实现了完整的 AI 生成能力（含双版本变体），但前端从未调用。

2. **P2：效果数据有记录但无法归因到消费**。`MarketingPageEvent` 记录了 PV/share/CTA 点击/线索提交，但与客户后续到店消费之间没有关联链路。当前 `MarketingAttribution` 表只关联了 `MarketingAutomationTouch`（自动化触达），营销页面的归因完全缺失。

---

## P1：接入 AI 页面生成

### 目标

在 `MarketingPageGeneratorDialog` 和 `CreateActivityDialog` 中增加"AI 生成"能力，让 AI 根据商品/项目/活动信息自动生成更有创意的页面内容，用户可选择变体并在此基础上微调。

### 涉及文件

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `src/app/components/MarketingPageGeneratorDialog.tsx` | 改造 | 增加 AI 生成按钮和变体切换 |
| `src/app/components/CreateActivityDialog.tsx` | 改造 | 增加"AI 优化文案"选项 |
| `src/api/ai.ts` | 确认 | `generateActivityPage` 已导出，无需改动 |
| `src/api/real/ai.ts` | 确认 | `realGenerateActivityPage` 已实现 |
| `packages/server-v2/src/ai/ai.service.ts` | 可选优化 | 优化 Prompt 质量 |

### 详细实现

#### 1.1 MarketingPageGeneratorDialog 改造

当前流程：
```
打开弹窗 → buildDraftFromSource（本地规则生成） → 预览 → 发布
```

目标流程：
```
打开弹窗 → buildDraftFromSource（本地规则生成，作为初始默认）
         → 点击"AI 生成" → 调用 /ai/generate/activity-page → 返回 pageSchema + variants
         → 用户可切换变体（温和版/专业版）
         → 微调表单字段 → 预览 → 发布
```

状态新增：

```typescript
// MarketingPageGeneratorDialog.tsx 新增状态
const [isAiGenerating, setIsAiGenerating] = useState(false);
const [aiResult, setAiResult] = useState<GenerateActivityPageResult | null>(null);
const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);
```

AI 生成调用：

```typescript
import { generateActivityPage } from '@/api/ai';
import type { GenerateActivityPageRequest, GenerateActivityPageResult } from '@/types/ai';

const handleAiGenerate = async () => {
  if (!source || isAiGenerating) return;
  setIsAiGenerating(true);
  try {
    const request: GenerateActivityPageRequest = {
      campaignName: form.title || source.item.name,
      targetAudience: form.targetCustomers || '门店会员',
      offer: form.offer || '到店享专属护理建议',
      projectNames: source.type === 'project' ? [source.item.name] : undefined,
      productNames: source.type === 'product' ? [source.item.name] : undefined,
      storeName: source.storeName,
      storePhone: source.storePhone,
      storeAddress: source.storeAddress,
    };
    const result = await generateActivityPage(request);
    setAiResult(result);
    setSelectedVariantIndex(0);
    // 用 AI 生成的 schema 替换当前 draft 的 form 字段
    if (result.pageSchema) {
      setForm({
        title: result.pageSchema.title,
        offer: result.text || form.offer,
        targetCustomers: result.pageSchema.audienceLabel,
        description: result.pageSchema.subtitle || form.description,
      });
    }
    toast.success('AI 已生成页面方案');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI 生成失败，请稍后重试';
    toast.error(message);
  } finally {
    setIsAiGenerating(false);
  }
};
```

变体切换逻辑：

```typescript
const currentPageSchema = useMemo(() => {
  if (aiResult?.pageVariants?.length) {
    return aiResult.pageVariants[selectedVariantIndex]?.pageSchema ?? aiResult.pageSchema;
  }
  return draft?.pageSchema ?? null;
}, [aiResult, selectedVariantIndex, draft]);
```

UI 改动（表单区域底部新增）：

```tsx
{/* AI 生成区域 */}
<div className="border-t pt-4 mt-4 space-y-3">
  <Button
    variant="outline"
    className="w-full"
    onClick={handleAiGenerate}
    disabled={isAiGenerating}
  >
    {isAiGenerating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
    {isAiGenerating ? 'AI 正在生成...' : 'AI 生成页面方案'}
  </Button>

  {aiResult?.pageVariants && aiResult.pageVariants.length > 1 && (
    <div className="flex gap-2">
      {aiResult.pageVariants.map((variant, index) => (
        <Button
          key={variant.id}
          size="sm"
          variant={index === selectedVariantIndex ? 'default' : 'outline'}
          onClick={() => setSelectedVariantIndex(index)}
        >
          {variant.name}
        </Button>
      ))}
    </div>
  )}
</div>
```

预览数据源修改：将 `buildPreviewData(draft)` 改为优先使用 AI 生成的 `currentPageSchema`：

```typescript
const previewData = useMemo(() => {
  if (!draft) return null;
  const base = buildPreviewData(draft);
  if (currentPageSchema && currentPageSchema !== draft.pageSchema) {
    return { ...base, pageSchema: currentPageSchema, layout: 'modern' as const };
  }
  return base;
}, [draft, currentPageSchema]);
```

发布时存储 AI 来源信息：

```typescript
const handlePublish = async () => {
  if (!draft) return;
  const finalDraft = {
    ...draft,
    pageSchema: currentPageSchema ?? draft.pageSchema,
    aiGenerationId: aiResult?.id ?? draft.aiGenerationId,
  };
  // ...后续调用 createMarketingPage(buildMarketingPagePayloadFromPageDraft(finalDraft))
};
```

#### 1.2 CreateActivityDialog 增加 AI 选项

当前 `CreateActivityDialog` 已经调用了 `generateMarketingCopy`（文案生成），但页面结构仍是本地 `buildMarketingActivityPageSchema` 生成。

改动点：在生成营销页面的 step 中，增加"AI 优化页面结构"选项：

```typescript
// CreateActivityDialog.tsx 新增
const [useAiPageSchema, setUseAiPageSchema] = useState(false);
const [aiPageResult, setAiPageResult] = useState<GenerateActivityPageResult | null>(null);

// 在用户点击"生成推广页"时
const handleGenerateMiniPage = async () => {
  if (useAiPageSchema) {
    const result = await generateActivityPage({
      campaignName: formData.title,
      targetAudience: formData.targetCustomers,
      offer: formData.discount,
      projectNames: selectedProjects.map(p => p.name),
      productNames: selectedProducts.map(p => p.name),
      startDate: formData.startDate,
      endDate: formData.endDate,
      storeName: currentStoreName,
    });
    setAiPageResult(result);
    // 用 AI 生成的 schema 覆盖本地生成的
    return result.pageSchema;
  }
  // 否则走原有本地生成逻辑
  return buildMarketingActivityPageSchema(schemaInput);
};
```

#### 1.3 后端 Prompt 优化（可选）

当前 `ai.service.ts` 的 `generateActivityPage` 在 mock 模式下走本地 `buildActivityPageSchema`，real 模式下走 LLM 生成。需确认 LLM prompt 包含以下约束：

- 必须输出合法 `ActivityPageSchema` JSON（schemaVersion/title/subtitle/audienceLabel/theme/sections/cta/safety）
- sections 必须包含至少 hero + offer + cta
- 文案面向顾客，不得暴露内部标签（流失风险、预测分、匹配度等）
- 输出 2 个变体（warm/premium），每个变体只改 tone 和文案风格

### 验收标准

1. `MarketingPageGeneratorDialog` 中点击"AI 生成"，等待 1-5 秒后页面预览自动更新为 AI 生成的内容。
2. 可切换"温和关怀版"和"专业权益版"，预览实时变化。
3. AI 生成失败时 toast 提示错误，不影响原有本地规则生成流程。
4. 发布的 `MarketingPage` 记录中 `aiGenerationId` 字段正确填充。
5. `CreateActivityDialog` 勾选"AI 优化"后生成的推广页文案明显优于本地模板拼接。

### 预估工期

2-3 天。前端改造为主，后端 Prompt 优化可选。

---

## P2：营销页面效果归因

### 目标

在线索提交后自动关联客户，当该客户后续产生订单时可追溯到"是哪个营销页面带来的"。让管理端效果统计从"只有 PV/线索数"升级为"可计算 ROI"。

### 当前现状分析

**已有数据流**：
```
顾客打开 H5 → view 事件 → 点击 CTA → 提交手机号 → MarketingPageLead (phone, intentType, channel, staffId)
```

**缺失的链路**：
```
MarketingPageLead → (手机号匹配) → Customer → (归因窗口内消费) → ProductOrder → 归因记录
```

**现有 `MarketingAttribution` 表**只关联 `MarketingAutomationTouch`（自动化触达），没有关联 `MarketingPageLead`。需要扩展归因模型。

### 涉及文件

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `packages/server-v2/prisma/schema.prisma` | 新增模型 | `MarketingPageAttribution` |
| `packages/server-v2/src/marketing-pages/marketing-pages.service.ts` | 改造 | 线索提交时自动匹配客户 |
| `packages/server-v2/src/orders/orders.service.ts` | 改造 | 订单完成时检查归因窗口 |
| `packages/server-v2/src/marketing-pages/marketing-pages.controller.ts` | 新增 | 归因统计接口 |
| `src/types/marketing-page.ts` | 扩展 | 新增归因相关类型 |
| `src/api/real/marketingPage.ts` | 新增 | 归因查询 API |
| `src/app/pages/MarketingPageManagement.tsx` | 改造 | 效果统计增加"归因收入"列 |

### 详细实现

#### 2.1 数据模型扩展

在 `schema.prisma` 新增：

```prisma
model MarketingPageAttribution {
  id                    Int       @id @default(autoincrement())
  leadId                Int
  pageId                Int
  customerId            Int
  orderId               Int
  attributionType       String    @default("last_touch")
  attributedRevenue     Decimal   @default(0)
  attributionWindowDays Int       @default(30)
  touchedAt             DateTime
  convertedAt           DateTime
  createdAt             DateTime  @default(now())

  lead     MarketingPageLead @relation(fields: [leadId], references: [id], onDelete: Cascade)
  page     MarketingPage     @relation(fields: [pageId], references: [id], onDelete: Cascade)
  customer Customer          @relation(fields: [customerId], references: [id], onDelete: Cascade)
  order    ProductOrder      @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@unique([leadId, orderId])
  @@index([pageId, convertedAt])
  @@index([customerId])
  @@index([orderId])
}
```

同时在 `MarketingPage`、`MarketingPageLead`、`Customer`、`ProductOrder` 模型中补充关系字段：

```prisma
// MarketingPage 新增
attributions MarketingPageAttribution[]

// MarketingPageLead 新增
customerId   Int?
convertedAt  DateTime?
status       String    @default("new")  // new | contacted | converted | expired
attributions MarketingPageAttribution[]

// Customer 新增（如果没有）
pageAttributions MarketingPageAttribution[]

// ProductOrder 新增（如果没有）
pageAttributions MarketingPageAttribution[]
```

运行迁移：
```bash
cd packages/server-v2
npx prisma migrate dev --name add-marketing-page-attribution
```

#### 2.2 线索提交时自动匹配客户

改造 `marketing-pages.service.ts` 的 `submitLead` 方法：

```typescript
async submitLead(slug: string, dto: PublicLeadDto, requestMeta: RequestMeta = {}) {
  const page = await this.getPublishedPageRecord(slug);
  const phone = String(dto.phone || '').trim();
  // ...existing validation...

  // 新增：自动匹配已有客户
  let matchedCustomerId = dto.customerId ? Number(dto.customerId) : null;
  if (!matchedCustomerId && phone) {
    const existingCustomer = await this.prisma.customer.findFirst({
      where: {
        phone,
        storeId: page.storeId ?? undefined,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (existingCustomer) {
      matchedCustomerId = existingCustomer.id;
    }
  }

  const lead = await this.leadDelegate.create({
    data: {
      pageId: page.id,
      storeId: page.storeId,
      customerId: matchedCustomerId,  // 改为匹配后的 ID
      // ...其余字段不变
    },
  });

  // ...existing event recording...
  return { ok: true, intentType: lead.intentType };
}
```

#### 2.3 订单完成时自动归因

在 `orders.service.ts` 的订单完成/支付确认逻辑中增加归因检查：

```typescript
// orders.service.ts
private async checkMarketingPageAttribution(customerId: number, orderId: number, orderAmount: number) {
  const ATTRIBUTION_WINDOW_DAYS = 30;
  const windowStart = new Date(Date.now() - ATTRIBUTION_WINDOW_DAYS * 86400_000);

  // 查找该客户在归因窗口内的未转化线索
  const eligibleLeads = await this.prisma.marketingPageLead.findMany({
    where: {
      customerId,
      status: { not: 'expired' },
      createdAt: { gte: windowStart },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  if (!eligibleLeads.length) return;

  // Last-touch 归因：取最近一条线索
  const lastLead = eligibleLeads[0];

  // 检查是否已归因过（避免重复）
  const existing = await (this.prisma as any).marketingPageAttribution.findFirst({
    where: { leadId: lastLead.id, orderId },
  });
  if (existing) return;

  await (this.prisma as any).marketingPageAttribution.create({
    data: {
      leadId: lastLead.id,
      pageId: lastLead.pageId,
      customerId,
      orderId,
      attributionType: 'last_touch',
      attributedRevenue: orderAmount,
      attributionWindowDays: ATTRIBUTION_WINDOW_DAYS,
      touchedAt: lastLead.createdAt,
      convertedAt: new Date(),
    },
  });

  // 更新线索状态为已转化
  await this.prisma.marketingPageLead.update({
    where: { id: lastLead.id },
    data: { status: 'converted', convertedAt: new Date() },
  });
}
```

在订单完成时调用：

```typescript
// 在 completeOrder / checkout 等订单状态变为 completed 时
if (order.customerId) {
  await this.checkMarketingPageAttribution(order.customerId, order.id, Number(order.totalAmount));
}
```

#### 2.4 归因统计接口

在 `marketing-pages.controller.ts` 新增：

```typescript
@Get('marketing/pages/:id/attribution')
@Permissions('core:marketing:analytics')
@ApiOperation({ summary: '获取营销页面归因统计' })
getPageAttribution(@Param('id', ParseIntPipe) id: number) {
  return this.marketingPagesService.getPageAttribution(id);
}

@Get('marketing/pages/attribution/summary')
@Permissions('core:marketing:analytics')
@ApiOperation({ summary: '营销页面归因汇总' })
getAttributionSummary(
  @Headers('x-store-id') storeId?: string,
  @Query('startDate') startDate?: string,
  @Query('endDate') endDate?: string,
) {
  return this.marketingPagesService.getAttributionSummary(
    storeId ? Number(storeId) : undefined,
    startDate,
    endDate,
  );
}
```

Service 实现：

```typescript
async getPageAttribution(pageId: number) {
  const attributions = await (this.prisma as any).marketingPageAttribution.findMany({
    where: { pageId },
    orderBy: { convertedAt: 'desc' },
    take: 100,
  });

  const totalRevenue = attributions.reduce(
    (sum: number, item: any) => sum + Number(item.attributedRevenue || 0),
    0,
  );

  return {
    pageId,
    attributionCount: attributions.length,
    totalRevenue,
    averageOrderValue: attributions.length ? totalRevenue / attributions.length : 0,
    attributions: attributions.map((item: any) => ({
      id: item.id,
      customerId: item.customerId,
      orderId: item.orderId,
      revenue: Number(item.attributedRevenue),
      touchedAt: item.touchedAt,
      convertedAt: item.convertedAt,
      attributionType: item.attributionType,
      windowDays: item.attributionWindowDays,
    })),
  };
}

async getAttributionSummary(storeId?: number, startDate?: string, endDate?: string) {
  const where: any = {};
  if (storeId) {
    where.page = { storeId };
  }
  if (startDate || endDate) {
    where.convertedAt = {};
    if (startDate) where.convertedAt.gte = new Date(startDate);
    if (endDate) where.convertedAt.lte = new Date(endDate);
  }

  const attributions = await (this.prisma as any).marketingPageAttribution.findMany({
    where,
    include: { page: { select: { id: true, title: true, sourceType: true } } },
  });

  const byPage = new Map<number, { title: string; sourceType: string; count: number; revenue: number }>();
  for (const item of attributions) {
    const existing = byPage.get(item.pageId) ?? {
      title: item.page.title,
      sourceType: item.page.sourceType,
      count: 0,
      revenue: 0,
    };
    existing.count++;
    existing.revenue += Number(item.attributedRevenue || 0);
    byPage.set(item.pageId, existing);
  }

  return {
    totalAttributions: attributions.length,
    totalRevenue: attributions.reduce((sum: number, item: any) => sum + Number(item.attributedRevenue || 0), 0),
    byPage: [...byPage.entries()].map(([pageId, data]) => ({ pageId, ...data }))
      .sort((a, b) => b.revenue - a.revenue),
  };
}
```

#### 2.5 前端效果统计页面改造

在 `MarketingPageManagement.tsx` 的效果弹窗中新增"归因收入"面板：

```typescript
// 新增类型
interface MarketingPageAttributionSummary {
  pageId: number;
  attributionCount: number;
  totalRevenue: number;
  averageOrderValue: number;
  attributions: Array<{
    id: number;
    customerId: number;
    orderId: number;
    revenue: number;
    touchedAt: string;
    convertedAt: string;
  }>;
}

// 效果弹窗中新增 Tab
// Tab: 基础数据(PV/UV/线索) | 归因收入 | 事件明细 | 线索列表
```

在已有 `MarketingPageEffects` 展示区域下方新增：

```tsx
{/* 归因收入卡片 */}
<div className="rounded-lg border p-4 mt-4">
  <div className="text-sm font-medium text-gray-700 mb-2">归因收入（30天窗口）</div>
  <div className="grid grid-cols-3 gap-4 text-center">
    <div>
      <div className="text-2xl font-bold text-green-600">¥{attribution?.totalRevenue.toLocaleString() ?? '—'}</div>
      <div className="text-xs text-gray-500">归因总收入</div>
    </div>
    <div>
      <div className="text-2xl font-bold">{attribution?.attributionCount ?? 0}</div>
      <div className="text-xs text-gray-500">转化订单数</div>
    </div>
    <div>
      <div className="text-2xl font-bold">¥{attribution?.averageOrderValue.toFixed(0) ?? '—'}</div>
      <div className="text-xs text-gray-500">平均客单价</div>
    </div>
  </div>
</div>
```

在列表页的每行也增加"归因收入"列（从 `effectSummary` 扩展获取，或懒加载）。

#### 2.6 前端 API 新增

```typescript
// src/api/real/marketingPage.ts 新增
export async function realGetMarketingPageAttribution(id: number): Promise<MarketingPageAttributionSummary> {
  return apiClient.get(`/marketing/pages/${id}/attribution`);
}

export async function realGetMarketingPageAttributionSummary(params?: {
  storeId?: number;
  startDate?: string;
  endDate?: string;
}): Promise<MarketingPageAttributionOverview> {
  return apiClient.get('/marketing/pages/attribution/summary', { params });
}
```

### 验收标准

1. 顾客通过 H5 提交手机号后，如果该手机号在系统中已有客户记录，`MarketingPageLead.customerId` 自动填充。
2. 该客户在 30 天内产生新订单时，`MarketingPageAttribution` 自动写入一条记录，归因收入等于订单金额。
3. 管理端效果统计弹窗中可看到"归因总收入"、"转化订单数"、"平均客单价"。
4. 同一线索+同一订单不重复归因。
5. 超过 30 天窗口的线索不再归因。

### 预估工期

3-4 天。数据模型 + 迁移 0.5 天，后端归因逻辑 1.5 天，前端展示 1 天，联调测试 0.5 天。

---

## 开发顺序与依赖

```
P1（AI 接入）────── 无外部依赖，可独立开发
                    前端为主，后端仅优化 Prompt（可选）

P2（效果归因）───── 需要先运行 Prisma 迁移
                    后端为主，需改动 orders.service
                    前端展示依赖后端接口完成
```

P1 和 P2 无相互依赖，可并行推进。

---

## 交付总览

| 阶段 | 任务 | 预估 | 影响范围 |
|------|------|------|----------|
| P1-1 | `MarketingPageGeneratorDialog` AI 生成 + 变体切换 | 1.5 天 | 管理端商品/项目页面 |
| P1-2 | `CreateActivityDialog` AI 优化选项 | 0.5 天 | 管理端营销活动创建 |
| P1-3 | 后端 Prompt 优化（可选） | 0.5 天 | server-v2 AI 模块 |
| P2-1 | schema 迁移 + 模型关系 | 0.5 天 | 数据库 |
| P2-2 | 线索匹配客户 | 0.5 天 | marketing-pages service |
| P2-3 | 订单归因检查 | 1 天 | orders service |
| P2-4 | 归因统计接口 | 0.5 天 | marketing-pages controller |
| P2-5 | 前端归因展示 | 1 天 | 管理端营销页面管理 |

**总预估工期**：5-7 天（P1 和 P2 可并行）

---

## 注意事项

- P1 中 AI 生成是**可选增强**，不能破坏原有本地规则生成流程。AI 失败时 toast 提示，用户仍可使用本地草稿发布。
- P2 中归因逻辑必须幂等：同一 `(leadId, orderId)` 组合有唯一约束，重复调用不会产生多条记录。
- P2 中客户匹配使用 `phone` 字段精确匹配，考虑到门店内手机号唯一性，加 `storeId` 过滤。
- `MarketingPageLead.status` 新增字段需要兼容现有数据（default `'new'`），迁移时需要 `UPDATE ... SET status = 'new' WHERE status IS NULL`。
- 归因窗口 30 天是后端常量 `ATTRIBUTION_WINDOW_DAYS`，后续可改为环境变量配置。
- 订单归因检查是异步的，不应阻塞订单完成流程。如果归因写入失败，只 warn 日志不抛错。
