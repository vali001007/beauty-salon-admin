# 客户画像→智能推荐 链路补齐开发计划

版本：v1.0
日期：2026-06-09
适用范围：`packages/server-v2/`、`packages/Ami-Aura-Lite-Kiosk/`、`src/`（管理端）

---

## 一、现状诊断

### 已打通链路（营销方向）

```
Customer/ConsumptionRecord/Card/HealthProfile
  → MarketingService.runPredictions()
  → CustomerPredictionSnapshot（churn/repurchase/LTV/marketingResponse）
  → getRecommendations()（推荐卡）
  → buildAutomationAudience() + matchesRules()（圈人）
  → MarketingAutomationTouch（执行）
  → 管理端 MarketingRecommendation.tsx 展示
```

状态：**✅ 完整闭环**

### 断链节点（终端 + 客户详情）

| 断点 | 位置 | 问题 |
|------|------|------|
| 终端客户推荐 | `terminal.service.ts:2377` | 只查 Project 前 3 个，不读预测快照 |
| 终端 NBA | `terminal.service.ts:2397` | 查预约/订单/核销，不读 Snapshot |
| AI 服务建议 | `ai.service.ts:529` | 只拿 `{ customerId, projectId, taskId }`，不读画像 |
| AI 下一步行动 | `ai.service.ts:557` | context 由调用方拼，无标准化画像注入 |
| Kiosk 增长候选 | `auraCoreService.ts:2367` | 前端用 lastVisitDate/totalSpent 轻量打分，后端已有更准的 churnScore |
| 客户详情页 | 管理端 | API `getCustomerPrediction()` 已有，页面未接入 |
| 反馈闭环 | RecommendationEvent | 仅作为少量实时信号，未反哺预测权重 |

---

## 二、改造目标

```
                    ┌──────────────────────────────┐
                    │ 统一客户画像聚合接口          │
                    │ GET /customers/:id/profile    │
                    │ （基础+健康+消费+预测+标签）   │
                    └───────┬──────────┬───────────┘
                            │          │
            ┌───────────────┘          └──────────────────┐
            ▼                                             ▼
┌── 终端推荐（改造）──────┐              ┌── 管理端展示（补齐）──────┐
│ getCustomerRecommendations │              │ 客户详情页                │
│   基于 Snapshot + 健康档案│              │   画像雷达图              │
│   按预测分排序+匹配项目  │              │   推荐动作历史            │
│                           │              │   自动化触达记录          │
│ AI.generateServiceAdvice  │              └────────────────────────────┘
│   注入完整画像 context    │
│                           │
│ AI.recommendNextBestAction│
│   注入 Snapshot + 证据链  │
│                           │
│ Kiosk 客户增长            │
│   直接读后端预测，不本地算│
└───────────────────────────┘
```

---

## 三、分步实施

### Step 1：后端统一客户画像聚合接口（1 天）

#### 1.1 新增 `CustomerProfileService`

**文件**：`packages/server-v2/src/customers/customer-profile.service.ts`（新建）

```typescript
@Injectable()
export class CustomerProfileService {
  constructor(private prisma: PrismaService) {}

  async getCustomerProfile(customerId: number): Promise<CustomerProfile> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        healthProfile: true,
        consumptionRecords: { orderBy: { consumeTime: 'desc' }, take: 20 },
        customerCards: { where: { status: 'active' } },
      },
    });
    if (!customer) throw new NotFoundException('客户不存在');

    // 最新预测快照
    const prediction = await this.prisma.customerPredictionSnapshot.findFirst({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });

    // 最近营销触达
    const recentTouches = await this.prisma.marketingAutomationTouch.findMany({
      where: { customerId },
      orderBy: { touchedAt: 'desc' },
      take: 5,
    });

    // 最近推荐事件
    const recentRecommendationEvents = await this.prisma.recommendationEvent.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    return this.assembleProfile(customer, prediction, recentTouches, recentRecommendationEvents);
  }

  private assembleProfile(...): CustomerProfile {
    return {
      // 基础信息
      basic: { name, gender, age, memberLevel, source, tags },
      // 健康档案
      health: { skinType, skinStatus, mainProblems, allergyHistory, goals },
      // 消费画像
      consumption: {
        totalSpent, visitCount, lastVisitDate, lastVisitDays,
        avgSpentPerVisit, preferredProjects, recentRecords,
      },
      // 卡项状态
      cards: { activeCards, expiringCards, usedUpCards },
      // 预测画像（来自 CustomerPredictionSnapshot）
      prediction: {
        churnScore, churnLevel,
        repurchase30dScore,
        marketingResponseScore,
        ltv6m, ltv12m, ltvTier,
        featureJson, reasonJson, recommendedActionsJson,
        updatedAt,
      },
      // 营销触达历史
      touchHistory: recentTouches,
      // 推荐反馈
      recommendationEvents: recentRecommendationEvents,
    };
  }
}
```

#### 1.2 新增接口

**文件**：`packages/server-v2/src/customers/customers.controller.ts`

```typescript
@Get(':id/profile')
getCustomerProfile(@Param('id', ParseIntPipe) id: number) {
  return this.customerProfileService.getCustomerProfile(id);
}
```

#### 1.3 终端画像接口（轻量版）

**文件**：`packages/server-v2/src/terminal/terminal.controller.ts`

```typescript
@Get('customers/:id/profile')
getTerminalCustomerProfile(
  @Param('id', ParseIntPipe) id: number,
  @CurrentDevice() device: DeviceSession,
) {
  return this.customerProfileService.getCustomerProfile(id);
}
```

**类型定义**：`packages/server-v2/src/customers/dto/customer-profile.dto.ts`（新建）

---

### Step 2：改造终端推荐接口（1 天）

#### 2.1 改造 `getCustomerRecommendations()`

**文件**：`packages/server-v2/src/terminal/terminal.service.ts`（line 2377）

当前：查 Project 前 3 个，硬编码 reason。

改为：

```typescript
async getCustomerRecommendations(customerId: number) {
  const customer = await this.prisma.customer.findUnique({
    where: { id: customerId },
    include: { healthProfile: true, customerCards: { where: { status: 'active' } } },
  });
  if (!customer) throw new NotFoundException('客户不存在');

  // 读取最新预测快照
  const prediction = await this.prisma.customerPredictionSnapshot.findFirst({
    where: { customerId },
    orderBy: { createdAt: 'desc' },
  });

  // 读取消费偏好（最近消费的项目类型）
  const recentConsumptions = await this.prisma.consumptionRecord.findMany({
    where: { customerId },
    orderBy: { consumeTime: 'desc' },
    take: 10,
  });

  // 获取门店所有活跃项目
  const projects = await this.prisma.project.findMany({
    where: { storeId: customer.storeId, deletedAt: null, status: 'active' },
    include: { type: true },
  });

  // 画像驱动排序：基于预测分+消费偏好+健康需求匹配
  const scored = this.scoreProjectsForCustomer(projects, customer, prediction, recentConsumptions);
  return scored.slice(0, 5).map((item) => ({
    id: item.project.id,
    customerId,
    type: 'project',
    title: item.project.name,
    reason: item.reason,
    matchFactors: item.factors,    // 命中因素（肤质匹配/消费偏好/卡项关联）
    confidence: item.score,
    targetId: item.project.id,
    payload: { price: item.project.price, duration: item.project.duration },
  }));
}

private scoreProjectsForCustomer(
  projects: Project[],
  customer: Customer & { healthProfile?, customerCards? },
  prediction: CustomerPredictionSnapshot | null,
  recentConsumptions: ConsumptionRecord[],
) {
  // 评分维度：
  // 1. 消费偏好匹配（最近消费过同类型项目加分）
  // 2. 健康需求匹配（skinType/mainProblems 与项目关联）
  // 3. 卡项关联（有对应次卡的项目优先推，促进核销）
  // 4. 预测快照驱动（高流失→推低门槛体验项目；高LTV→推高客单升单项目）
  // 5. 复购周期匹配（上次做该项目距今 vs 建议周期）
  ...
}
```

#### 2.2 改造 `getCustomerNextBestActions()`

**文件**：`packages/server-v2/src/terminal/terminal.service.ts`（line 2397）

改为注入预测快照：

```typescript
async getCustomerNextBestActions(storeId: number, customerId: number) {
  const customer = await this.prisma.customer.findFirst({
    where: { id: customerId, storeId, deletedAt: null },
    include: {
      healthProfile: true,
      reservations: { orderBy: { date: 'desc' }, take: 3 },
      productOrders: { orderBy: { createdAt: 'desc' }, take: 3 },
      cardUsageRecords: { orderBy: { verifiedAt: 'desc' }, take: 3 },
      customerCards: { where: { status: 'active' } },
    },
  });
  if (!customer) throw new NotFoundException('客户不存在');

  // 新增：读取预测快照
  const prediction = await this.prisma.customerPredictionSnapshot.findFirst({
    where: { customerId },
    orderBy: { createdAt: 'desc' },
  });

  const recommendations = await this.getCustomerRecommendations(customerId);
  const actions = this.buildActionsFromPrediction(customer, prediction, recommendations);
  return { customerId, actions, prediction: prediction ? { churnLevel, ltvTier, repurchase30dScore } : null };
}

private buildActionsFromPrediction(customer, prediction, recommendations) {
  const actions = [];

  // 高流失风险 → 唤醒优先
  if (prediction?.churnLevel === 'high' || prediction?.churnLevel === 'critical') {
    actions.push({
      type: 'send_care_reminder',
      title: '流失风险唤醒',
      reason: `流失分 ${prediction.churnScore}，${prediction.featureJson?.lastVisitDays ?? '?'} 天未到店`,
      priority: 'high',
      urgency: 'high',
    });
  }

  // 高复购窗口 → 推项目
  if (prediction?.repurchase30dScore >= 65) {
    const top = recommendations[0];
    if (top) {
      actions.push({
        type: 'recommend_project',
        title: top.title,
        reason: `复购概率 ${prediction.repurchase30dScore}%，${top.reason}`,
        priority: 'high',
      });
    }
  }

  // 卡项即将到期 → 催核销
  const expiringCards = customer.customerCards?.filter(c =>
    c.remainingTimes > 0 && this.daysUntil(c.expiryDate) <= 30
  );
  if (expiringCards?.length) {
    actions.push({
      type: 'card_expiry_reminder',
      title: `${expiringCards[0].cardName} 即将到期`,
      reason: `剩余 ${expiringCards[0].remainingTimes} 次，${this.daysUntil(expiringCards[0].expiryDate)} 天后过期`,
      priority: 'high',
    });
  }

  // 高 LTV → 升单/办卡
  if (prediction?.ltvTier === 'high' || prediction?.ltvTier === 'premium') {
    actions.push({
      type: 'offer_card',
      title: '升单办卡建议',
      reason: `客户 LTV 层级 ${prediction.ltvTier}，消费能力强`,
      priority: 'medium',
    });
  }

  return actions;
}
```

---

### Step 3：改造 AI Service 注入画像（0.5 天）

#### 3.1 改造 `generateTerminalServiceAdvice()`

**文件**：`packages/server-v2/src/ai/ai.service.ts`（line 529）

当前：`{ role: 'user', content: JSON.stringify({ input: data, fallback }) }`

改为内部查询画像后注入：

```typescript
async generateTerminalServiceAdvice(data: {...}, userId?: number, storeId?: number) {
  const fallback = this.buildTerminalServiceAdviceFallback(data);

  // 新增：如果有 customerId，查询画像摘要注入给 LLM
  let profileContext = {};
  if (data.customerId) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: data.customerId },
      include: { healthProfile: true },
    });
    const prediction = await this.prisma.customerPredictionSnapshot.findFirst({
      where: { customerId: data.customerId },
      orderBy: { createdAt: 'desc' },
      select: { churnScore: true, churnLevel: true, repurchase30dScore: true, ltvTier: true, featureJson: true },
    });
    profileContext = {
      skinType: customer?.healthProfile?.skinType ?? customer?.skinType,
      skinStatus: customer?.healthProfile?.skinStatus,
      mainProblems: customer?.healthProfile?.mainProblems,
      allergyHistory: customer?.healthProfile?.allergyHistory,
      goals: customer?.healthProfile?.goals,
      churnLevel: prediction?.churnLevel,
      lastVisitDays: prediction?.featureJson?.lastVisitDays,
      ltvTier: prediction?.ltvTier,
    };
  }

  return this.runScenario('terminal_service_advice', userId, storeId, async () => {
    const result = await this.callLlm('terminal_service_advice', [
      { role: 'system', content: '...' },
      { role: 'user', content: JSON.stringify({ input: data, customerProfile: profileContext, fallback }) },
    ]);
    ...
  });
}
```

#### 3.2 改造 `recommendNextBestAction()`

**文件**：`packages/server-v2/src/ai/ai.service.ts`（line 557）

同理，注入预测快照摘要：

```typescript
async recommendNextBestAction(data: { customerId: number; context: any }, userId?, storeId?) {
  // 新增：查预测快照
  const prediction = await this.prisma.customerPredictionSnapshot.findFirst({
    where: { customerId: data.customerId },
    orderBy: { createdAt: 'desc' },
  });

  const enrichedContext = {
    ...data.context,
    prediction: prediction ? {
      churnScore: prediction.churnScore,
      churnLevel: prediction.churnLevel,
      repurchase30dScore: prediction.repurchase30dScore,
      ltvTier: prediction.ltvTier,
      reasons: prediction.reasonJson,
      recommendedActions: prediction.recommendedActionsJson,
    } : null,
  };

  const enrichedData = { ...data, context: enrichedContext };
  // ... 其余逻辑不变
}
```

---

### Step 4：Kiosk 端接入后端画像（0.5 天）

#### 4.1 替换 `buildCustomerGrowthCandidates()`

**文件**：`packages/Ami-Aura-Lite-Kiosk/src/app/services/auraCoreService.ts`

当前 `buildCustomerGrowthCandidates()` 在前端用 lastVisitDate/totalSpent 轻量打分。

改为调用后端接口：

```typescript
// 新增终端 API 调用
export async function getCustomerGrowthFromPrediction(): Promise<CustomerGrowthCandidate[]> {
  try {
    // 调用后端预测客户列表（取高流失+高复购窗口）
    const result = await terminalApiClient.get('/terminal/customers/growth-candidates');
    return result.data;
  } catch {
    // 降级：使用本地轻量算法
    const snapshot = await loadCoreSnapshot();
    return buildCustomerGrowthCandidatesLocal(snapshot);
  }
}
```

#### 4.2 后端新增终端客户增长接口

**文件**：`packages/server-v2/src/terminal/terminal.service.ts`

```typescript
async getGrowthCandidates(storeId: number, limit = 10) {
  const latestRun = await this.prisma.predictionRun.findFirst({
    where: { status: 'completed' },
    orderBy: { finishedAt: 'desc' },
  });
  if (!latestRun) return [];

  // 高流失 + 高复购窗口的客户
  const snapshots = await this.prisma.customerPredictionSnapshot.findMany({
    where: {
      runId: latestRun.id,
      OR: [
        { churnLevel: { in: ['high', 'critical'] } },
        { repurchase30dScore: { gte: 60 } },
      ],
    },
    include: { customer: { select: { id: true, name: true, phone: true, lastVisitDate: true, totalSpent: true, memberLevel: true } } },
    orderBy: { churnScore: 'desc' },
    take: limit,
  });

  return snapshots.map((s) => ({
    customerId: s.customer.id,
    name: s.customer.name,
    phone: s.customer.phone,
    lastVisitDate: s.customer.lastVisitDate,
    totalSpent: s.customer.totalSpent,
    memberLevel: s.customer.memberLevel,
    churnScore: s.churnScore,
    churnLevel: s.churnLevel,
    repurchase30dScore: s.repurchase30dScore,
    ltvTier: s.ltvTier,
    reason: this.getGrowthCandidateReason(s),
  }));
}
```

**接口**：`GET /terminal/customers/growth-candidates`

---

### Step 5：管理端客户详情页接入画像（0.5 天）

#### 5.1 客户详情页增加画像面板

**文件**：`src/app/pages/CustomerData.tsx`（或客户详情抽屉/弹窗）

在客户详情中新增"客户画像"标签页或面板：

```tsx
// 调用已有 API
const prediction = await getCustomerPrediction(customerId);

// 展示内容
<CustomerProfilePanel>
  <RadarChart data={[
    { axis: '流失风险', value: prediction.churnScore },
    { axis: '复购概率', value: prediction.repurchase30dScore },
    { axis: '营销响应', value: prediction.marketingResponseScore },
    { axis: 'LTV', value: normalizeLtv(prediction.ltv6m) },
  ]} />

  <PredictionReasons reasons={prediction.reasonJson} />

  <RecommendedActions actions={prediction.recommendedActionsJson} />

  <TouchHistory touches={prediction.recentTouches} />
</CustomerProfilePanel>
```

#### 5.2 API 层

已有封装：`src/api/marketing.ts:126` → `getCustomerPrediction(id)`

只需在客户详情页引入调用即可，无需新增 API。

---

### Step 6：反馈闭环（P2，1 天）

#### 6.1 推荐采纳/转化回写

当终端执行了推荐动作（客户实际消费了推荐项目），记录转化事件：

```typescript
// terminal.service.ts checkout 成功后
if (matchedRecommendationId) {
  await this.prisma.recommendationEvent.create({
    data: {
      storeId, customerId, deviceId,
      recommendationId: matchedRecommendationId,
      eventType: 'converted',
      orderId: newOrder.id,
      payload: { amount: orderTotal, projectName },
    },
  });
}
```

#### 6.2 转化数据影响下次预测

在 `buildPredictionSnapshot()` 中增加"最近被营销触达后转化"的特征：

```typescript
// marketing.service.ts buildPredictionSnapshot 中新增
const recentTouchConversions = await this.prisma.marketingAutomationTouch.count({
  where: { customerId: customer.id, status: 'converted', touchedAt: { gte: thirtyDaysAgo } },
});

// 作为 marketingResponseScore 的加分因子
const responseFactor = Math.min(recentTouchConversions * 5, 15);
```

---

## 四、改动文件汇总

| 文件 | Step | 改动类型 | 说明 |
|------|------|----------|------|
| `server-v2/src/customers/customer-profile.service.ts` | 1 | **新建** | 统一画像聚合服务 |
| `server-v2/src/customers/dto/customer-profile.dto.ts` | 1 | **新建** | 画像响应类型 |
| `server-v2/src/customers/customers.controller.ts` | 1 | 修改 | 加 `GET :id/profile` |
| `server-v2/src/customers/customers.module.ts` | 1 | 修改 | 注册 ProfileService |
| `server-v2/src/terminal/terminal.controller.ts` | 1,4 | 修改 | 加终端画像接口 + 增长候选接口 |
| `server-v2/src/terminal/terminal.service.ts` | 2,4 | 修改 | 改造推荐/NBA + 新增增长候选 |
| `server-v2/src/ai/ai.service.ts` | 3 | 修改 | serviceAdvice/NBA 注入画像 |
| `Kiosk/src/app/services/auraCoreService.ts` | 4 | 修改 | 客户增长接入后端预测 |
| `src/app/pages/CustomerData.tsx`（或详情组件） | 5 | 修改 | 展示预测画像面板 |
| `src/api/real/customers.ts` | 5 | 修改 | 加 getCustomerProfile 调用 |

---

## 五、工时与优先级

| Step | 内容 | 工时 | 优先级 | 风险 |
|------|------|------|--------|------|
| 1 | 统一客户画像聚合接口 | 1 天 | P0 | 低（纯查询聚合） |
| 2 | 改造终端推荐+NBA 接口 | 1 天 | P0 | 中（需评分算法调优） |
| 3 | AI Service 注入画像 context | 0.5 天 | P0 | 低（加查询+拼 JSON） |
| 4 | Kiosk 接入后端画像 | 0.5 天 | P1 | 低（加 API 调用+降级） |
| 5 | 管理端客户详情页展示 | 0.5 天 | P1 | 低（已有 API，补 UI） |
| 6 | 反馈闭环 | 1 天 | P2 | 低（加事件写入+特征） |
| **总计** | | **4.5 天** | | |

---

## 六、验收场景

| 场景 | 改造前 | 改造后 |
|------|--------|--------|
| 终端查询客户推荐 | 返回门店前3个项目（固定顺序） | 基于画像评分，返回命中因素+理由 |
| 终端 NBA | 通用"安排跟进/消费后护理" | "流失分82→优先唤醒"/"复购窗口→推A项目" |
| AI 服务建议 | LLM 只知道 customerId | LLM 知道肤质、流失风险、偏好、LTV |
| Kiosk 客户增长看板 | 前端轻量算法，与营销系统不一致 | 读后端预测快照，与营销推荐一致 |
| 管理端客户详情 | 无画像数据 | 展示雷达图+预测分+推荐历史 |
| 推荐转化 | 无记录 | 转化事件回写，影响下次预测分 |

### 关键验证用例

1. **画像驱动推荐**：高流失客户 → 推荐低门槛体验项目（而非最贵项目）
2. **AI 上下文感知**：对敏感肌客户，AI 不推荐刺激性项目
3. **一致性**：Kiosk 显示的"流失客户"列表与管理端营销推荐页的"高流失唤醒"受众一致
4. **降级可用**：无预测快照时，终端推荐降级为原有逻辑（不报错）

---

## 七、架构收益

| 维度 | 改造前 | 改造后 |
|------|--------|--------|
| 推荐质量 | 随机项目列表 | 画像×偏好×预测驱动 |
| AI 建议质量 | LLM 盲猜 | 基于完整画像的精准建议 |
| 数据一致性 | 前后端各算各的 | 统一 PredictionSnapshot 为 single source of truth |
| 反馈闭环 | 开环（推荐了不知效果） | 转化回写 → 预测更准 → 推荐更准 |
| 产品差异化 | 与普通 SaaS 无异 | "越用越懂客户"的 AI 能力 |

---

## 八、后续演进（非本次范围）

- 预测模型从规则引擎升级为 ML 模型（训练数据已充分时）
- 实时预测（每次到店/消费后实时更新 Snapshot，而非日批次）
- 跨客户协同过滤推荐（"类似客户也喜欢"）
- 客户生命周期自动阶段流转（新客→活跃→成熟→衰退→流失）
- 与行业知识库联动：推荐时参考行业标准护理周期和搭配方案
