# 智能问答（AI Q&A）优化方案

版本：v1.1  
日期：2026-06-08  
适用范围：`packages/Ami-Aura-Lite-Kiosk/`、`packages/server-v2/src/ai/`

---

## 一、现状问题

| # | 问题 | 影响 | 严重度 |
|---|------|------|--------|
| 1 | 文本输入全部走 AI，绕过意图路由 | "查客户张三"不走客户查询 micro-app，而是问 AI | P0 |
| 2 | 无业务相关性判断 | "今天天气如何"也走 AI 回答，终端不应回答无关问题 | P0 |
| 3 | 无多轮对话上下文 | 追问"他还买了什么"丢失上文 | P1 |
| 4 | 无对话历史持久化 | 刷新/次日后历史全丢，无法回溯 | P1 |
| 5 | `getAiSuggestion` 与 `getTerminalBusinessAnswer` 两套并存 | 类型引用前者，运行时用后者，维护混乱 | P1 |
| 6 | `appendAiHint` 忽略 businessSummary | micro-app 上下文没传给 AI，回答不相关 | P2 |
| 7 | 无 streaming 输出 | 长回复阻塞 2-5 秒用户无反馈 | P2 |

---

## 二、架构目标

```
用户输入
  ↓
┌─────────────────────────────────┐
│ handleCommand(command, source)  │
│  ├─ manager 自动化特殊逻辑      │
│  ├─ 所有 source 统一走意图路由   │  ← 核心改动
│  └─ resolveCommandIntent()      │
│       ├─ 规则命中 → micro-app   │
│       ├─ AI 意图解析命中 → micro-app │
│       └─ action=null → AI Q&A   │  ← AI 问答作为最终 fallback
└─────────────────────────────────┘
```

改动原则：**先走意图路由，路由失败才 fallback 到 AI 问答**。

---

## 三、分阶段实施

### Phase 1：统一文本入口到意图路由 + 业务相关性守卫（P0，2.5 天）

#### 改动 1.1：删除 `AppContent.tsx` 文本直通 AI 的分支

当前 `handleCommand` line 728-746 对 `source === "text"` 直接调 `getTerminalBusinessAnswer`，导致所有文本绕过意图系统。

**改为**：去掉 `if (source === "text") { ... return; }` 分支，让文本和快捷操作走同一条路径。保留 manager 自动化前置逻辑不变。

```typescript
// AppContent.tsx handleCommand 改动后流程：
const handleCommand = async (command: string, source: AuraCommandSource = "text") => {
  // 1. manager 自动化特殊逻辑（保持不变）
  if (source === "text" && currentRole === "manager" && latestAutomationDraft?.status === "needs_info") { ... }
  if (source === "text" && currentRole === "manager") { /* tryHandleAutomationTextOperation */ }

  // 2. 统一走意图路由（原来只有非 text 才走）
  const intent = await resolveCommandIntent({ command, role: currentRole, definition: roleDefinition, source });
  if (shouldDisplayUserCommand(intent)) {
    appendMessage(createMessage("query", { text: command }, "用户指令"));
  }
  // ... 其余逻辑保持不变（runMicroAppIntent 内部 !action 时自动 fallback AI）
};
```

**涉及文件**：
- `packages/Ami-Aura-Lite-Kiosk/src/app/AppContent.tsx`（line 728-746 删除）

**验收**：输入"查客户张三"走 `customer.search` 而非 AI 问答；输入"今天天气如何"被业务相关性守卫拦截并提示"与本门店业务无关"。

---

#### 改动 1.2：增强规则解析器覆盖度

当前 `ruleIntentParser.ts` 对部分常见业务表述没有规则（如"查一下张三"、"帮我收银"），导致本应命中的指令落到 AI fallback。

**新增规则**（示例）：

```typescript
// ruleIntentParser.ts 补充
{ patterns: [/查.*客户|查一下|找客户|客户.*信息/], action: "customer.search" as AuraAction },
{ patterns: [/帮.*收银|收一下|结账|买单/], action: "operation.cashier" as AuraAction },
{ patterns: [/帮.*充值|充钱|充值/], action: "operation.recharge" as AuraAction },
```

**涉及文件**：
- `packages/Ami-Aura-Lite-Kiosk/src/app/intent/ruleIntentParser.ts`

---

#### 改动 1.3：AI 意图解析置信度调优

当前 `MIN_AI_CONFIDENCE = 0.65`，对于明确业务意图（如"看看今天预约"）后端返回 0.6 也会被拒。

**改为**：0.55（降低 fallback 率），同时增加"如果 AI 返回 action 在 allowedActions 中且无 missingSlots，confidence ≥ 0.5 即通过"的快速通道。

**涉及文件**：
- `packages/Ami-Aura-Lite-Kiosk/src/app/intent/aiIntentParser.ts`（line 10, 86）

---

#### 改动 1.4：业务相关性守卫（非门店相关拒答）

当意图路由最终 fallback 到 AI 问答时，需先判断用户输入是否与本美业门店业务相关。无关问题（如"今天天气怎么样"、"帮我写首诗"、"讲个笑话"）直接拦截，不调用 AI。

**实现方式**：在 `runMicroApp.ts` 的 `!action` fallback 分支中，调用 AI 前先做相关性检测。

**方案 A：本地规则快筛（推荐，零延迟）**

```typescript
// Kiosk/src/app/intent/relevanceGuard.ts 新建
const BEAUTY_KEYWORDS = /客户|预约|排班|收银|充值|开卡|核销|库存|商品|项目|服务|美容|护理|皮肤|面部|身体|头发|指甲|会员|提成|业绩|营业|订单|退款|优惠|活动|门店|员工|技师|美容师|顾问/;
const OFF_TOPIC_PATTERNS = /天气|新闻|股票|写诗|写作文|讲笑话|编程|代码|翻译.*英文|历史人物|政治|体育赛事|游戏攻略|做饭|食谱|旅游攻略/;

export function isBusinessRelevant(command: string): boolean {
  // 命中离题模式 → 无关
  if (OFF_TOPIC_PATTERNS.test(command)) return false;
  // 命中业务关键词 → 相关
  if (BEAUTY_KEYWORDS.test(command)) return true;
  // 短指令（≤ 4 字）大概率是业务操作简称，放行
  if (command.length <= 4) return true;
  // 其他情况默认放行（交给 AI 的 system prompt 兜底）
  return true;
}
```

**方案 B：AI 辅助判断（用于兜底，有延迟）**

后端 AI 的 system prompt 中追加指令，让 AI 自行判断并拒答：

```typescript
// auraCoreService.ts → getTerminalBusinessAnswer 的 system prompt 改为：
const SYSTEM_PROMPT = `你是 Ami Aura Lite 智能终端的业务问答助手。
规则：
1. 必须只基于用户提供的 Ami_Core 数据回答，不要编造客户、订单、预约、库存或金额。
2. 如果用户的问题与本美业门店的经营管理无关（如天气、新闻、闲聊、编程、翻译等），直接回复"抱歉，该问题与本门店业务无关，暂无法回复。"，不做任何延伸。
3. 回答要短、可执行，必要时列出客户姓名和证据。`;
```

**两层组合使用**：本地规则快筛（零延迟拦截明显离题）+ AI system prompt 兜底（处理边界情况）。

```typescript
// runMicroApp.ts 修改 !action 分支
if (!action) {
  if (!isBusinessRelevant(command)) {
    return {
      messages: [{
        type: "ai",
        payload: {
          kind: "ai",
          data: {
            title: "Ami 提示",
            text: "抱歉，该问题与本门店业务无关，暂无法回复。",
            source: "Ami AI",
          },
        },
      }],
    };
  }
  const data = await getTerminalBusinessAnswer({ role: intent.role, command });
  return { messages: [{ type: "ai", payload: { kind: "ai", data } }] };
}
```

**涉及文件**：
- `packages/Ami-Aura-Lite-Kiosk/src/app/intent/relevanceGuard.ts`（**新建**）
- `packages/Ami-Aura-Lite-Kiosk/src/app/microApps/runMicroApp.ts`（`!action` 分支前置守卫）
- `packages/Ami-Aura-Lite-Kiosk/src/app/services/auraCoreService.ts`（system prompt 强化）

**验收**：
- 输入"今天天气怎么样" → 立即返回"抱歉，该问题与本门店业务无关，暂无法回复。"
- 输入"帮我写首诗" → 同上拒答
- 输入"张三的皮肤状况" → 正常走 AI 问答
- 输入"库存还够吗" → 正常走 AI 问答

#### 改动 2.1：引入会话级消息历史（运行时上下文）

在 `getTerminalBusinessAnswer` 和 `sendAiChatMessage` 调用中加入最近 N 轮对话上下文，支持代词追问。

**设计**：

```typescript
// auraCoreService.ts 新增
const MAX_CONTEXT_TURNS = 6;

interface ConversationEntry {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

let conversationHistory: ConversationEntry[] = [];

export function appendToConversation(role: "user" | "assistant", content: string) {
  conversationHistory.push({ role, content, timestamp: Date.now() });
  if (conversationHistory.length > MAX_CONTEXT_TURNS * 2) {
    conversationHistory = conversationHistory.slice(-MAX_CONTEXT_TURNS * 2);
  }
}

export function clearConversation() {
  conversationHistory = [];
}

export function getConversationMessages() {
  // 超过 10 分钟的旧消息不带入（避免跨场景混淆）
  const cutoff = Date.now() - 10 * 60 * 1000;
  return conversationHistory.filter((e) => e.timestamp > cutoff);
}
```

#### 改动 2.2：调用 sendAiChatMessage 时注入历史

```typescript
// getTerminalBusinessAnswer 内部
const history = getConversationMessages();
const result = await sendAiChatMessage({
  role: ...,
  messages: [
    { role: "system", content: "..." },
    ...history.map((e) => ({ role: e.role, content: e.content })),
    { role: "user", content: JSON.stringify(context) },
  ],
  context,
});
appendToConversation("user", params.command);
appendToConversation("assistant", result.text);
```

#### 改动 2.3：对话历史持久化存储

终端对话需要持久化到后端，每天 24:00 归档保存，次日 0:00 清除当天对话界面。用户可通过"历史记录"按钮查询往日对话。

**后端 Schema**：

```prisma
model TerminalConversation {
  id          Int      @id @default(autoincrement())
  deviceId    String
  storeId     String
  role        String   // manager | reception | beautician
  operatorId  String?  // 当前登录员工 ID
  date        DateTime @db.Date  // 归属日期（用于按天查询）
  messages    Json     // [{ role, content, timestamp, type }]
  messageCount Int     @default(0)
  createdAt   DateTime @default(now())
  archivedAt  DateTime?

  @@index([storeId, date])
  @@index([deviceId, date])
}
```

**后端接口**：

| 接口 | 功能 |
|------|------|
| `POST /terminal/conversations/save` | 保存当天对话（终端定时调用 + 页面卸载时） |
| `GET /terminal/conversations/history` | 查询历史对话（按 storeId + 日期范围分页） |
| `DELETE /terminal/conversations/:id` | 删除指定日期记录（管理员权限） |

**前端定时归档机制**：

```typescript
// Kiosk/src/app/services/conversationPersistence.ts 新增
const ARCHIVE_HOUR = 0; // 0:00 触发归档

export function initConversationScheduler(deviceId: string, storeId: string) {
  // 每分钟检查一次是否跨天
  setInterval(() => {
    const now = new Date();
    if (now.getHours() === ARCHIVE_HOUR && now.getMinutes() === 0) {
      archiveAndClear(deviceId, storeId);
    }
  }, 60_000);

  // 页面卸载前保存
  window.addEventListener("beforeunload", () => {
    saveCurrentConversation(deviceId, storeId);
  });
}

async function archiveAndClear(deviceId: string, storeId: string) {
  await saveCurrentConversation(deviceId, storeId);
  clearConversation();      // 清空运行时上下文
  clearMessageDisplay();    // 清空 UI 消息列表
}

async function saveCurrentConversation(deviceId: string, storeId: string) {
  const messages = getAllDisplayMessages(); // 从 AppContent state 获取
  if (messages.length === 0) return;
  await terminalApi.saveConversation({
    deviceId,
    storeId,
    role: getCurrentRole(),
    operatorId: getCurrentOperatorId(),
    date: getToday(),
    messages,
    messageCount: messages.length,
  });
}
```

#### 改动 2.4：历史对话查询 UI

在终端顶部状态栏或消息区域增加"历史记录"按钮：

```
┌─────────────────────────────────────────┐
│  [📋 历史记录]  ← 顶部状态栏右侧按钮     │
├─────────────────────────────────────────┤
│  弹出抽屉/面板：                          │
│  ┌─────────────────────────────────┐    │
│  │ 2026-06-07 (32条)  [查看]       │    │
│  │ 2026-06-06 (18条)  [查看]       │    │
│  │ 2026-06-05 (45条)  [查看]       │    │
│  └─────────────────────────────────┘    │
│  点击[查看]展开该日对话（只读浏览）        │
└─────────────────────────────────────────┘
```

**组件设计**：

```typescript
// Kiosk/src/app/components/ConversationHistory.tsx 新增
interface ConversationHistoryProps {
  storeId: string;
  onClose: () => void;
}

export function ConversationHistory({ storeId, onClose }: ConversationHistoryProps) {
  const [records, setRecords] = useState<ConversationRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    // 加载最近 30 天的对话记录摘要
    terminalApi.getConversationHistory({ storeId, days: 30 }).then(setRecords);
  }, [storeId]);

  // 点击某天 → 加载该天完整对话
  const viewDay = async (date: string) => {
    const detail = await terminalApi.getConversationDetail({ storeId, date });
    setMessages(detail.messages);
    setSelectedDate(date);
  };

  return (
    <Drawer open onClose={onClose}>
      {!selectedDate ? <DateList records={records} onSelect={viewDay} /> : <MessageViewer messages={messages} />}
    </Drawer>
  );
}
```

#### 改动 2.5：角色切换 / 登出时保存并清空

```typescript
// AppContent.tsx
const handleRoleSwitch = async (newRole: Role) => {
  await saveCurrentConversation(deviceId, storeId);  // 先保存
  clearConversation();  // 清空运行时上下文
  setCurrentRole(newRole);
};

const handleLogout = async () => {
  await saveCurrentConversation(deviceId, storeId);
  clearConversation();
  // ...existing logout logic
};
```

**涉及文件**：
- `packages/server-v2/prisma/schema.prisma`（新增 TerminalConversation）
- `packages/server-v2/src/terminal/terminal.controller.ts`（新增 3 个端点）
- `packages/server-v2/src/terminal/terminal.service.ts`（新增保存/查询方法）
- `packages/Ami-Aura-Lite-Kiosk/src/app/services/auraCoreService.ts`（运行时上下文）
- `packages/Ami-Aura-Lite-Kiosk/src/app/services/conversationPersistence.ts`（新建）
- `packages/Ami-Aura-Lite-Kiosk/src/app/components/ConversationHistory.tsx`（新建）
- `packages/Ami-Aura-Lite-Kiosk/src/app/components/TopStatusBar.tsx`（加历史按钮）
- `packages/Ami-Aura-Lite-Kiosk/src/app/AppContent.tsx`（初始化调度 + 登出/切换保存）

**验收**：
- 连续问"张三最近消费了什么"→"他的卡还剩多少次"，第二句能理解"他"指张三
- 0:00 后消息区域自动清空，前一天对话已持久化
- 点击"历史记录"按钮可查看往日对话（只读）
- 角色切换前自动保存当前对话

---

### Phase 3：合并双 AI 函数 + 修复 aiHint（P1，1 天）

#### 改动 3.1：废弃 `getAiSuggestion`，统一到 `getTerminalBusinessAnswer`

`getAiSuggestion` 的美容师服务建议能力（`generateTerminalServiceAdvice`）并入 `getTerminalBusinessAnswer`：

```typescript
// getTerminalBusinessAnswer 新增判断
if (params.role === "beautician" && /建议|推荐|适合|护理|服务|项目/.test(params.command)) {
  const customerId = extractCustomerIdFromContext(snapshot);
  if (customerId) {
    const result = await generateTerminalServiceAdvice({ customerId });
    return { title: "服务建议", text: result.text, source: "Ami AI", structured: result.structured };
  }
}
```

然后删除 `getAiSuggestion` 导出，更新 `microAppTypes.ts` 类型引用。

#### 改动 3.2：修复 `appendAiHint` 传递上下文

```typescript
// AppContent.tsx
const appendAiHint = async (businessSummary: string, aiCommand = command) => {
  const data = await getTerminalBusinessAnswer({
    role: currentRole,
    command: aiCommand,
    businessContext: businessSummary,  // 新增参数
  });
  appendMessage(createMessage("ai", { kind: "ai", data }));
};
```

`getTerminalBusinessAnswer` 接受可选 `businessContext`，在构建 context 时优先使用该摘要作为 user message 前缀。

**涉及文件**：
- `packages/Ami-Aura-Lite-Kiosk/src/app/services/auraCoreService.ts`
- `packages/Ami-Aura-Lite-Kiosk/src/app/microApps/microAppTypes.ts`
- `packages/Ami-Aura-Lite-Kiosk/src/app/AppContent.tsx`

---

### Phase 4：Streaming 输出（P2，2 天）

#### 改动 4.1：后端 AI chat 支持 SSE

```typescript
// packages/server-v2/src/ai/ai.controller.ts
@Post('chat/messages/stream')
@Sse()
async chatStream(@Body() dto: ChatDto): Observable<MessageEvent> {
  return this.aiService.chatStream(dto);
}
```

#### 改动 4.2：前端渐进渲染

```typescript
// auraCoreService.ts
export async function getTerminalBusinessAnswerStream(params: {...}): AsyncGenerator<string> {
  const response = await fetch('/api/ai/chat/messages/stream', { method: 'POST', body: ... });
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    yield decoder.decode(value);
  }
}
```

AppContent 中 AI 卡片改为 progressive 渲染：每收到 chunk 更新 `data.text`。

**涉及文件**：
- `packages/server-v2/src/ai/ai.controller.ts`
- `packages/server-v2/src/ai/ai.service.ts`
- `packages/Ami-Aura-Lite-Kiosk/src/app/services/auraCoreService.ts`
- `packages/Ami-Aura-Lite-Kiosk/src/app/AppContent.tsx`

**验收**：AI 回复逐字显示，首字响应 < 500ms。

---

## 四、工时汇总

| Phase | 内容 | 工时 | 优先级 |
|-------|------|------|--------|
| 1 | 统一文本入口 + 规则增强 + 置信度调优 + 业务相关性守卫 | 2.5 天 | P0 |
| 2 | 多轮对话上下文 + 持久化历史 + 历史查询 UI | 4 天 | P1 |
| 3 | 合并双 AI 函数 + 修复 aiHint | 1 天 | P1 |
| 4 | Streaming 输出 | 2 天 | P2 |
| **总计** | | **9.5 天** | |

---

## 五、改动文件汇总

| 文件 | Phase | 改动类型 |
|------|-------|----------|
| `Kiosk/src/app/AppContent.tsx` | 1,2,3,4 | 删除直通分支 + 初始化调度 + streaming 渲染 |
| `Kiosk/src/app/intent/ruleIntentParser.ts` | 1 | 补充规则覆盖 |
| `Kiosk/src/app/intent/aiIntentParser.ts` | 1 | 调低置信度阈值 |
| `Kiosk/src/app/intent/relevanceGuard.ts` | 1 | **新建**，业务相关性守卫 |
| `Kiosk/src/app/services/auraCoreService.ts` | 1,2,3,4 | system prompt 强化 + 多轮上下文 + 合并函数 + stream |
| `Kiosk/src/app/services/conversationPersistence.ts` | 2 | **新建**，定时归档 + 页面卸载保存 |
| `Kiosk/src/app/components/ConversationHistory.tsx` | 2 | **新建**，历史对话查询面板 |
| `Kiosk/src/app/components/TopStatusBar.tsx` | 2 | 加"历史记录"按钮 |
| `Kiosk/src/app/microApps/microAppTypes.ts` | 3 | 修正类型引用 |
| `Kiosk/src/app/microApps/runMicroApp.ts` | 1 | `!action` 分支加业务相关性守卫 |
| `server-v2/prisma/schema.prisma` | 2 | 新增 TerminalConversation 模型 |
| `server-v2/src/terminal/terminal.controller.ts` | 2 | 新增对话保存/查询/删除端点 |
| `server-v2/src/terminal/terminal.service.ts` | 2 | 新增对话持久化方法 |
| `server-v2/src/ai/ai.controller.ts` | 4 | 新增 SSE endpoint |
| `server-v2/src/ai/ai.service.ts` | 4 | 新增 chatStream |

---

## 六、风险与取舍

| 决策 | 取舍 | 理由 |
|------|------|------|
| 业务相关性采用两层机制（本地规则 + AI prompt） | 本地规则可能误拦边界情况 | 本地规则零延迟拦截明确离题；AI prompt 兜底处理模糊地带；关键词列表可持续维护 |
| 运行时上下文仅保留 6 轮 × 10 分钟窗口 | 超出窗口的历史不参与 AI 推理 | 终端短对话为主，长窗口浪费 token 且易混淆 |
| 持久化保存整天对话，0:00 清空 UI | 次日启动界面干净 | 终端是公共设备，每天清零避免信息泄露 |
| 历史记录按天存储、只读浏览 | 不支持从历史中"继续对话" | 跨天上下文失效，继续意义不大 |
| AI 置信度降到 0.55 | 偶尔误触发业务操作 | 有 `requiresConfirmation` 兜底，高危操作仍需确认 |
| AI 问答通过底部输入框触发 | 不另设快捷操作按钮 | 输入框是唯一入口，保持 UI 简洁 |
| Phase 4 streaming 可延后 | 体验不如 ChatGPT 流畅 | 当前平均响应 2-3s，可接受 |

---

## 七、验收场景

| 场景 | 期望行为 | Phase |
|------|----------|-------|
| 输入"查客户张三" | 走 `customer.search` micro-app，显示客户卡片 | 1 |
| 输入"帮我收银" | 走 `cashier.checkout` micro-app，显示收银表单 | 1 |
| 输入"今天营业额怎么样" | AI 意图解析 → `manager.dashboard`（置信度 > 0.55） | 1 |
| 输入"宇宙的尽头是什么" | 被业务相关性守卫拦截，返回"抱歉，该问题与本门店业务无关，暂无法回复。" | 1 |
| 输入"帮我写首诗" | 同上拒答 | 1 |
| 输入"张三的皮肤状况" | 命中业务关键词，正常走 AI 问答 | 1 |
| 连续问"张三最近来过吗" → "他的卡还有几次" | 第二问理解"他"=张三 | 2 |
| 切换角色后追问 | 上下文已清空，不混淆 | 2 |
| 0:00 自动清空 | 消息区域清空，前一天对话已保存到后端 | 2 |
| 点击"历史记录"按钮 | 弹出面板，显示近 30 天对话列表，可展开查看 | 2 |
| 角色切换 / 登出 | 当前对话先保存再清空 | 2 |
| micro-app 执行完显示 aiHint | hint 包含该 micro-app 的业务摘要上下文 | 3 |
| AI 回答较长（> 100 字） | 逐字渐进显示 | 4 |
