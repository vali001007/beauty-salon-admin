# AI 功能优化开发计划

版本：v1.0  
日期：2026-06-07  
适用范围：管理端、server-v2 后端、Ami Aura Lite Kiosk 终端  
相关文档：`docs/智能推荐算法升级需求文档.md`、`docs/terminal-api.md`、`docs/算法优化.md`

---

## 背景

当前系统已具备完整的 AI Gateway、终端意图驱动、智能推荐、AI 生成文案等核心能力。但在体验细节、推荐引擎质量、Prompt 稳定性、可观测性等方向存在明显短板，需要系统性补全。

本计划聚焦 6 个优化方向，按优先级和依赖关系分 3 个阶段交付。

---

## 现状评估

| 方向 | 现状 | 问题 |
|------|------|------|
| 终端意图解析 | 规则 + AI fallback | 规则覆盖率低，长尾输入频繁走 AI，延迟明显 |
| 服务建议 / NBA 推荐 | 原始 JSON 直接入 prompt | 无 system prompt 约束，输出格式不稳定 |
| 营销推荐引擎 | 预测分驱动，推荐卡已上线 | 即时信号缺失，推荐偏"泛泛建议" |
| 皮肤检测 fallback | Face++ 失败时返回演示数据 | Kiosk 端未区分标注，顾客可能误读结果 |
| AI 审计日志 | 写入正常 | 管理端无消费页面，数据无法利用 |
| LLM Provider 可用性 | 单 Provider，失败直接报错 | 无 fallback 链，中断无预警 |

---

## 优化计划

### 阶段一：稳定性与体验（1–2 周）

#### P0-1：终端规则意图扩充

**问题**：`ruleIntentParser.ts` 当前只覆盖约 20 个关键词，长尾自然语言（"帮我看看小李今天做什么"、"最近有没有要到期的次卡"）直接 fallback 到 AI，每次需要 1–3s 额外等待。

**目标**：把 AI fallback 使用率从当前约 30–40% 降低到 5% 以内。

**实现方案**：

1. 在 `ruleIntentParser.ts` 中按角色扩充关键词矩阵，增加同义词/口语化表达：

```
// manager 新增
"今天怎么样" / "业绩" / "情况" → manager.dashboard
"人员" / "今天谁在" → manager.staff
"流失" / "没来" / "很久没到店" → manager.customers
"缺货" / "快用完了" → manager.inventory

// reception 新增  
"有没有预约" / "今天来几个" / "排了什么" → reception.appointments
"新客户" / "没有档案" → operation.register
"买单" / "结算" / "多少钱" → operation.cashier

// beautician 新增
"我今天做什么" / "我的客户" → beautician.schedule
"她皮肤怎么样" / "上次做什么" → beautician.customer
"推荐什么" / "适合做" → beautician.advice
```

2. 在 `slotUtils.ts` 中增加手机号、卡名、项目名等 slot 提取规则，减少 `missingSlots` 导致的二次 AI 调用。

3. 补充单测覆盖规则新增部分，确保 `npm run test` 通过。

**文件**：
- `packages/Ami-Aura-Lite-Kiosk/src/app/intent/ruleIntentParser.ts`
- `packages/Ami-Aura-Lite-Kiosk/src/app/intent/slotUtils.ts`

**验收标准**：对 20 条典型口语化输入跑规则解析，命中率 ≥ 80%，无需 AI fallback。

---

#### P0-2：皮肤检测 Fallback 标注

**问题**：Face++ 失败时返回的演示数据混入正常结果流，`instrument` 字段写着"Face++ 调用失败兜底"，顾客和美容师在 Kiosk 上看到会产生误解。

**实现方案**：

1. 后端 `ai.service.ts` 的 fallback 结果增加 `isFallback: true` 标志字段：

```typescript
// ai.service.ts analyzeSkinPhoto fallback 返回
return {
  ...this.buildSkinPhotoAnalyzeResult(data),
  isFallback: true,          // 新增
  instrument: 'Ami AI 初筛（仅供参考）',
  explanation: '正式肤质检测暂不可用，以下为 AI 初筛结果，建议到店由顾问进行专业仪器检测。',
};
```

2. Kiosk 端皮肤检测结果卡片增加条件渲染：当 `isFallback === true` 时，在卡片顶部显示"仅供参考"橙色标签，并隐藏具体量化数值（仅显示文字描述）。

3. 同步更新 `src/types/terminal.ts` 中 `SkinTest` 相关类型定义，补充 `isFallback?: boolean`。

**文件**：
- `packages/server-v2/src/ai/ai.service.ts`
- `packages/Ami-Aura-Lite-Kiosk/src/app/components/` 相关皮肤检测卡片

**验收标准**：Face++ Key 未配置时，Kiosk 显示"仅供参考"标签，量化指标不显示。

---

### 阶段二：推荐质量与 Prompt 稳定性（2–3 周）

#### P1-1：服务建议与 NBA Prompt 结构化改造

**问题**：`generateTerminalServiceAdvice` 和 `recommendNextBestAction` 直接把 JSON 数据塞给 LLM，没有 system prompt 约束，导致：
- 输出有时是段落文字，有时是列表，格式不稳定
- 容易出现"建议加强服务质量"等无意义的泛化回复
- 无法解析为结构化结果，前端只能全文展示

**目标**：输出格式稳定可解析，内容基于真实数据，杜绝无根据建议。

**实现方案**：

1. 为两个场景定义输出结构：

```typescript
// 终端服务建议输出结构
type ServiceAdviceStructured = {
  preChecks: string[];        // 服务前确认项（过敏史、禁忌）
  keySteps: string[];         // 关键操作步骤
  materialUsage: string[];    // 耗材用量提示
  followUpAdvice: string;     // 服务后跟进建议
  nextBookingHint: string;    // 下次预约建议
};

// NBA 推荐输出结构
type NextBestActionStructured = {
  action: 'recommend_project' | 'send_care_reminder' | 'offer_card' | 'escalate_to_consultant';
  reason: string;             // 基于数据的推荐理由
  projectName?: string;       // 推荐项目名（若有）
  urgency: 'now' | 'this_week' | 'this_month';
  confidence: number;
};
```

2. 改造 `ai.service.ts` 的 prompt 构建：

```typescript
// generateTerminalServiceAdvice
const systemPrompt = `你是美容门店服务规划助手。
只能基于用户提供的 JSON 数据输出服务建议，不得编造项目名称、客户信息或耗材数量。
必须输出合法 JSON，格式：{ preChecks, keySteps, materialUsage, followUpAdvice, nextBookingHint }。
每个字段不超过 30 字。`;

// recommendNextBestAction  
const systemPrompt = `你是客户下一步行动推荐助手。
只能从 availableActions 中选择，基于客户数据给出唯一最优建议。
必须输出合法 JSON，格式：{ action, reason, projectName, urgency, confidence }。
reason 必须引用具体数据证据（如"距上次到店 45 天"），不得泛泛而谈。`;
```

3. 在 `runScenario` 返回结果中增加 `parseJsonObject` 调用，将 `structured` 字段填充。

4. Kiosk 端 `AutomationDraftCard` 等组件使用 `structured` 字段渲染，而非全文 `text`。

**文件**：
- `packages/server-v2/src/ai/ai.service.ts`（`generateTerminalServiceAdvice`、`recommendNextBestAction` 方法）

**验收标准**：连续调用 10 次，`structured` 字段解析成功率 100%，内容无泛化废话。

---

#### P1-2：营销推荐即时信号接入

**问题**：当前推荐引擎只依赖 `PredictionRun` 中的预测分（流失/复购/响应/LTV），缺少以下即时信号：
- 次卡余量 ≤ 2 次（`CardUsageRecord` 可计算）
- 距上次到店 ≥ 21 天（`Reservation` 可计算）
- 优惠券已领未核销（`Promotion` + `RecommendationEvent` 可关联）
- 近 7 天预约放弃（`Reservation` 状态为 `cancelled`）

**目标**：让推荐卡从"分数区间内泛泛建议"变为"今天就应该触达这批人"。

**实现方案**：

1. 在 `marketing.service.ts` 的 `getSnapshotsForRecommendationRun` 之后，新增一个 `getRealtimeSignals(storeId)` 方法，查询：

```typescript
// 次卡快到期（剩余 ≤ 2 次）
const cardExpiryCustomers = await this.prisma.cardUsageRecord.groupBy({
  by: ['customerId'],
  where: { card: { storeId }, remainingCount: { lte: 2, gt: 0 } },
  _count: { customerId: true },
});

// 护理周期到期（距上次预约完成 ≥ 21 天）
const careCycleCustomers = await this.prisma.reservation.findMany({
  where: {
    storeId,
    status: 'completed',
    endTime: { lte: new Date(Date.now() - 21 * 86400_000) },
    customer: { reservations: { none: { startTime: { gte: new Date(Date.now() - 21 * 86400_000) } } } },
  },
  select: { customerId: true },
  distinct: ['customerId'],
});
```

2. 将即时信号集合与 `snapshotsForCards` 做 join，增强现有推荐卡的 `dataEvidence` 字段，并新增两类推荐卡：
   - **次卡续费提醒卡**（`cardExpiry` 类型）：次卡余量不足的客户，推荐渠道优先企业微信 + 短信
   - **护理周期回访卡**（`careCycle` 类型）：21 天未到店且复购分 ≥ 55 的客户

3. `executionModes` 中的"活动"和"自动规则"根据信号类型自动推荐：
   - 次卡到期 → 优先自动规则（持续滚动）
   - 节假日/季节活动 → 优先一次性活动

**文件**：
- `packages/server-v2/src/marketing/marketing.service.ts`

**验收标准**：在有真实客户数据的门店下，次卡余量 ≤ 2 和护理周期 ≥ 21 天的客户能出现在对应推荐卡的目标客户列表中。

---

### 阶段三：可观测性与稳定性（1–2 周）

#### P2-1：AI 审计日志管理页面

**问题**：`AiAuditLog` 表已积累数据，`/ai/audit-logs/paginated` 接口已存在，但管理端没有对应页面。这些数据是优化 Prompt 质量的关键依据（哪些场景失败率高、哪些 Prompt 输出被安全过滤）。

**实现方案**：

1. 在管理端 `系统设置` 下新增 `/system/ai-audit` 路由（需 `core:system:view` 权限）。

2. 页面展示以下字段，支持按 `scenario` 和 `status` 筛选，分页加载：

| 字段 | 说明 |
|------|------|
| 时间 | `createdAt` |
| 场景 | `scenario`（chat / customer-invitation-script / terminal_intent 等） |
| 状态 | `status`（success / failed / failed_fallback） |
| Provider | `usage.provider` + `usage.model` |
| Token | `inputTokens` + `outputTokens` |
| 安全拦截 | `safety.blocked` |
| 耗时 | `latencyMs` |
| 操作 | 查看原始 prompt/response（按需展开） |

3. 顶部增加今日汇总统计卡片：总调用数、成功率、平均耗时、被拦截次数。

4. 在 `src/api/real/ai.ts` 增加 `realGetAiAuditLogs` 接口调用，补充 `src/api/ai.ts` 导出。

5. 在 `src/app/routes.tsx` 注册路由，在 `src/app/components/Layout.tsx` 的系统设置菜单下增加"AI 审计"入口。

**文件**：
- `src/app/routes.tsx`
- `src/app/components/Layout.tsx`
- `src/api/real/ai.ts`
- `src/api/ai.ts`
- `src/app/pages/system/AiAuditPage.tsx`（新建）

**验收标准**：管理员可以在 `/system/ai-audit` 分页查看 AI 调用记录，按场景筛选，数据与 `AiAuditLog` 表一致。

---

#### P2-2：LLM Provider Fallback 链

**问题**：当前 `AiService` 只支持单 Provider，`callLlm` 失败直接抛 `BadGatewayException`，无任何降级机制。生产环境主 Provider 出现网络抖动时会导致所有 AI 功能中断。

**实现方案**：

1. 在 `ai.service.ts` 新增 fallback Provider 配置：

```
LLM_FALLBACK_PROVIDER=openai-compat   # 可选
LLM_FALLBACK_API_KEY=...
LLM_FALLBACK_BASE_URL=...
LLM_FALLBACK_MODEL=...
LLM_FALLBACK_TIMEOUT_MS=20000
```

2. 改造 `callLlm` 方法，主 Provider 失败后自动尝试 fallback Provider（最多 1 次），在审计日志中记录实际使用的 Provider：

```typescript
private async callLlmWithFallback(scenario: string, messages: AiMessage[]): Promise<AiGenerationResult> {
  try {
    return await this.callLlm(scenario, messages);
  } catch (primaryError) {
    if (!this.hasFallbackProvider()) throw primaryError;
    try {
      const result = await this.callLlmFallback(scenario, messages);
      return { ...result, usage: { ...result.usage, provider: `${result.usage.provider}(fallback)` } };
    } catch {
      throw primaryError; // 两个都失败时抛原始错误
    }
  }
}
```

3. 只在非 mock 模式下启用 fallback；mock 模式不受影响。

4. 在系统启动日志中输出 Provider 配置状态（primary / fallback / mock），方便运维排查。

**文件**：
- `packages/server-v2/src/ai/ai.service.ts`

**验收标准**：主 Provider API Key 配置错误时，fallback Provider 能正常响应；两者都失败时返回明确的 502 错误信息。

---

## 交付总览

| 优先级 | 任务 | 预估工期 | 依赖 | 影响范围 |
|--------|------|----------|------|----------|
| P0 | 终端规则意图扩充 | 2–3 天 | 无 | Kiosk 终端体验 |
| P0 | 皮肤检测 Fallback 标注 | 1 天 | 无 | Kiosk 顾客端 |
| P1 | 服务建议 / NBA Prompt 结构化 | 3–4 天 | 无 | Kiosk + 后端 |
| P1 | 营销推荐即时信号接入 | 3–5 天 | 数据库有客户数据 | 管理端推荐页 |
| P2 | AI 审计日志管理页面 | 2–3 天 | 无 | 管理端系统设置 |
| P2 | LLM Provider Fallback 链 | 1–2 天 | 无 | 后端 AI Gateway |

**总预估工期**：2–4 周（P0 优先并行推进，P1 依次完成，P2 可并行）

---

## 注意事项

- `ruleIntentParser.ts` 改动后必须跑 Kiosk 的 `npm run typecheck`，并手动验证 5 个以上典型场景。
- `marketing.service.ts` 新增数据库查询前，先在测试数据库上验证 SQL，避免 N+1 查询。
- AI 审计日志页面包含原始 prompt，可能含客户姓名等敏感字段，需限制为 `core:system:view` 以上权限且支持字段脱敏展示。
- LLM Fallback 链只在 `VITE_API_MODE=real` 且非 mock Provider 时生效，不影响测试环境。
- 所有 Prompt 改动后在审计日志中追踪 1 周，确认输出格式稳定后再关闭验收。
