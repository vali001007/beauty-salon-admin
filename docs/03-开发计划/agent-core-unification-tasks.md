# Agent 对话内核统一改造 — 详细开发任务

版本：v1.0
日期：2026-06-27
关联文档：`docs/02-产品设计/洞悉美业_新一代门店运营智能体_产品需求文档_v2.0.md`

---

## 总览

将 Kiosk 和 /ami-agent 两套对话实现统一为共享对话内核 `packages/agent-core`，Kiosk 作为门店核心终端，/ami-agent 降级为管理面板 + 轻量调试对话。

**总工期估算：5-6 天**

---

## 阶段 A：创建 agent-core 共享包（0.5 天）

### A-1 初始化 packages/agent-core 包结构

创建目录和 package.json：

```
packages/agent-core/
├── package.json       → { "name": "@ami/agent-core", "version": "0.1.0" }
├── tsconfig.json      → 继承根 tsconfig，paths 设置
├── index.ts           → 统一 barrel export
├── types/
├── logic/
├── hooks/
└── api/
```

验收：目录存在，`import {} from '@ami/agent-core'` 在两端 IDE 可解析

### A-2 配置 Vite alias

修改文件：
- `packages/Ami-Aura-Lite-Kiosk/vite.config.ts` → 添加 `'@ami/agent-core': resolve(rootDir, 'packages/agent-core')`
- `vite.config.ts`（根项目/管理端）→ 添加同样的 alias
- `tsconfig.json`（根项目）→ paths 添加 `"@ami/agent-core": ["packages/agent-core/index.ts"]`

验收：两端 `import { xxx } from '@ami/agent-core'` typecheck 通过

### A-3 Vitest 配置覆盖 agent-core

修改 `vitest.config.ts` 或根 `vite.config.ts` 的 test.alias，确保测试也能解析 `@ami/agent-core`。

验收：`npm run test` 不因 alias 报错

---

## 阶段 B：类型统一，迁入 agent-core/types（0.5 天）

### B-1 创建 agent-core/types/blocks.ts

将 16 种 AuraResponseBlock union type 写入此文件，作为唯一真实来源。
包含：`AuraBlockAction`、`AuraResponseBlock`。

来源参考：`src/types/agent.ts` 中的 AuraResponseBlock 定义（16 种 kind）。

### B-2 创建 agent-core/types/conversation.ts

```typescript
export interface AgentConversationMessage {
  id: string;
  role: 'user' | 'agent';
  text?: string;
  blocks?: AuraResponseBlock[];
  followUpSuggestions?: string[];
  loading?: boolean;
  error?: string;
  runId?: number;
  personaCode?: string;
}

export interface ConversationContext {
  sessionId: string;
  role: string;
  storeId: number | undefined;
  recentTurns: RecentTurn[];
  activeEntities: ActiveEntities;
}

export interface RecentTurn { ... }
export interface ActiveEntities { ... }
```

来源参考：`Kiosk/intent/conversationContext.ts` 的类型定义。

### B-3 创建 agent-core/types/persona.ts

```typescript
export type AgentPersonaCode = 'manager' | 'marketing' | 'reception' | 'beautician' | 'inventory' | 'finance';
export type AgentRole = 'manager' | 'reception' | 'beautician';

export interface AgentPersonaSummary {
  code: AgentPersonaCode;
  name: string;
  description: string;
  targetRoles: string[];
  toolGroups: string[];
  suggestedQuestions: string[];
}

export const PERSONA_ACCESS: Record<AgentRole, AgentPersonaCode[]> = {
  manager: ['manager', 'marketing', 'reception', 'beautician', 'inventory', 'finance'],
  reception: ['reception', 'marketing'],
  beautician: ['beautician'],
};
```

### B-4 创建 agent-core/types/result.ts

```typescript
export interface AgentRunResultV2 {
  runId: number;
  runNo: string;
  status: string;
  plan?: AgentPlan;
  answer: string;
  toolResults: AgentToolResult[];
  actions: AgentSuggestedAction[];
  evidence?: AgentEvidence;
  renderedBlocks?: AuraResponseBlock[];
  followUpSuggestions?: string[];
  personaCode?: AgentPersonaCode;
}
```

### B-5 改写两端类型引用

- `packages/Ami-Aura-Lite-Kiosk/src/app/types.ts`：删除本地 AuraResponseBlock 定义，改为 `export type { AuraResponseBlock, AuraBlockAction } from '@ami/agent-core'`
- `src/types/agent.ts`：删除本地 AuraResponseBlock/AgentRunResultV2 定义，改为 re-export from `@ami/agent-core`

验收：两端 typecheck 通过，无重复类型定义

---

## 阶段 C：逻辑层迁入 agent-core/logic（1 天）

### C-1 迁移 conversationContext.ts

从 `Kiosk/intent/conversationContext.ts` 搬到 `agent-core/logic/conversationContext.ts`。

导出函数：
- `createConversationContext()`
- `updateConversationContext()`
- `resolvePronouns()`
- `buildContextSummary()`
- `resetConversationContext()`

原文件改为：`export { ... } from '@ami/agent-core'`

### C-2 创建 agent-core/logic/personaAccess.ts

```typescript
export function canAccessPersona(role: AgentRole, persona: AgentPersonaCode): boolean
export function getPersonasForRole(role: AgentRole): AgentPersonaCode[]
export function getDefaultPersona(role: AgentRole): AgentPersonaCode
```

### C-3 创建 agent-core/logic/blockUtils.ts

从 `AgentBlockRenderer.tsx` 提取纯逻辑函数：
- `groupKpiCards(blocks)` → 连续 kpi_card 合组
- `orderBlocksForDisplay(blocks)` → block 排序（text → alert → kpi → content → evidence → confirm → chips）

### C-4 创建 agent-core/api/agentApi.ts

封装后端 Agent API 调用（不依赖具体 HTTP client，接收 client 作为参数）：

```typescript
export function createAgentApi(httpClient: { post: Function; get: Function }) {
  return {
    createRun(data: AgentCreateRunRequest): Promise<AgentRunResultV2>,
    appendMessage(runId: number, data: AgentAppendMessageRequest): Promise<AgentRunResultV2>,
    getPersonas(): Promise<AgentPersonaSummary[]>,
    getPersonaByCode(code: string): Promise<AgentPersonaSummary>,
    submitFeedback(runId: number, data: AgentFeedbackRequest): Promise<void>,
  };
}
```

这样两端都可以传入自己的 httpClient（Kiosk 用 auraCoreService 的 client，管理端用 apiClient）。

### C-5 创建 agent-core/hooks/useAgentConversation.ts

React hook，封装对话状态管理：

```typescript
export function useAgentConversation(options: {
  api: ReturnType<typeof createAgentApi>;
  role: AgentRole;
  personaCode: AgentPersonaCode;
  storeId?: number;
}) {
  // 返回：
  messages: AgentConversationMessage[];
  sending: boolean;
  error: string | null;
  activeRunId: number | null;
  conversationContext: ConversationContext;
  send(text: string): Promise<void>;
  reset(): void;
  submitFeedback(runId: number, adopted: boolean): Promise<void>;
}
```

### C-6 创建 agent-core/hooks/usePersona.ts

```typescript
export function usePersona(options: {
  api: ReturnType<typeof createAgentApi>;
  role: AgentRole;
}) {
  // 返回：
  personas: AgentPersonaSummary[];
  activePersona: AgentPersonaSummary | null;
  switchPersona(code: AgentPersonaCode): void;
  loading: boolean;
}
```

### C-7 创建 agent-core/index.ts barrel export

统一导出所有 types、logic、hooks、api。

### C-8 验证

- `packages/agent-core` 单独 typecheck 通过
- 根项目 `npm run test` 通过

---

## 阶段 D：Kiosk BlockRenderer 升级到 16 种 block（1 天）

### D-1 从 AgentBlockRenderer.tsx 提取 6 个新组件

新增文件到 `Kiosk/components/`：
- `OpportunityCard.tsx` — opportunity_card
- `ActivityDraftCard.tsx` — activity_draft_card
- `CopyVariantsBlock.tsx` — copy_variants
- `InventoryItemCard.tsx` — inventory_item_card
- `SupplierPurchaseCard.tsx` — supplier_purchase_card
- `MetricChip.tsx` — 共用的指标芯片小组件

### D-2 修改 Kiosk BlockRenderer.tsx

- import 6 个新组件
- switch 中添加 6 个 case 分支
- 引入 `orderBlocksForDisplay` 和 `groupKpiCards` from `@ami/agent-core`（替换本地实现）
- 添加 `action_card` case（合并到 `confirm_action` 渲染）

### D-3 验证

- Kiosk typecheck + build 通过
- 手动验证：构造包含 16 种 block 的 mock 数据，确认渲染正常

---

## 阶段 E：Kiosk 集成 Persona + 反馈 + Insight（1.5 天）

### E-1 新增 PersonaSwitcher.tsx

位置：`Kiosk/components/PersonaSwitcher.tsx`

UI 形式：水平 chip 栏，展示当前角色可用的 Persona（基于 PERSONA_ACCESS 过滤）。

```
[📊 店长] [📣 营销] [🎪 前台] [✨ 美容师] [📦 库存] [💰 财务]
                     ↑ 当前选中高亮
```

### E-2 新增 AgentFeedback.tsx

位置：`Kiosk/components/AgentFeedback.tsx`

- 两个按钮：👍 有用 / 👎 无用
- 点击后调用 `api.submitFeedback(runId, adopted)`
- 提交后按钮变为灰色已提交状态
- 不阻塞用户操作

### E-3 新增 InsightPanel.tsx

位置：`Kiosk/components/InsightPanel.tsx`

- 默认收起（图标按钮触发）
- 内容：当前 Persona 信息、最近 5 次 Run 状态、置信度分布
- 宽屏（>1280px）可常驻右侧
- 窄屏时为底部抽屉

### E-4 改造 AppContent.tsx —— 拆分 Agent 对话模式

核心改动：

1. 新增 state：
   ```typescript
   const agentApi = useMemo(() => createAgentApi(apiClientInstance), []);
   const persona = usePersona({ api: agentApi, role: currentRole });
   const conversation = useAgentConversation({
     api: agentApi,
     role: currentRole,
     personaCode: persona.activePersona?.code ?? 'manager',
     storeId: currentStoreId,
   });
   ```

2. 消息流分区：
   ```typescript
   // Agent 对话消息 → conversation.messages → BlockRenderer
   // FlowCard 操作消息 → messages state（原有逻辑不动）
   ```

3. handleCommand 改造：
   ```typescript
   const handleCommand = async (command, source) => {
     const intent = await resolveCommandIntent(options, conversation.conversationContext);

     if (isFlowCardAction(intent.action)) {
       // 走原有 FlowCard 逻辑（不变）
       ...
     } else {
       // 走 Agent 对话模式
       await conversation.send(command);
     }
   };
   ```

4. 渲染区域：
   ```typescript
   {/* 当有 FlowCard 消息时显示 FlowCard 区 */}
   {hasFlowCardMessages && <FlowCardPanel messages={flowCardMessages} ... />}

   {/* Agent 对话消息流 */}
   {conversation.messages.map(msg => (
     <AgentMessageItem msg={msg} onFollowUp={...} onFeedback={...} />
   ))}
   ```

### E-5 改造 SmartCommandBar.tsx

- 快捷操作按钮改为动态：`persona.activePersona?.suggestedQuestions` 的前 5 个
- Persona 切换后快捷操作自动更新

### E-6 改造 TopStatusBar.tsx

- 展示当前 Persona 名称："📊 店长经营 Agent"
- Persona 切换器可以放在这里（或放在 SmartCommandBar 上方）

### E-7 验证

- Kiosk typecheck + build
- 手动验证：
  - 登录后看到 Persona 切换器
  - 切换到营销 Agent → 快捷操作变为营销相关问题
  - 输入"哪些客户适合召回" → Agent 对话模式，BlockRenderer 渲染 renderedBlocks
  - 输入"核销" → FlowCard 模式，卡片流渲染
  - 对话消息底部有 👍/👎 按钮

---

## 阶段 F：/ami-agent 降级为管理面板 + 调试对话（1 天）

### F-1 重构 AmiAgentWorkspace.tsx 为 Tab 布局

```typescript
const TABS = [
  { key: 'debug', label: '对话调试' },
  { key: 'audit', label: '运行审计' },
  { key: 'approvals', label: '审批管理' },
  { key: 'personas', label: 'Persona 配置' },
  { key: 'eval', label: '评测' },
  { key: 'quality', label: '质量大盘' },
];
```

### F-2 对话调试 Tab

使用 `useAgentConversation` hook（来自 agent-core），轻量版对话 UI：
- 输入框 + 消息流 + BlockRenderer
- 可选择任意 Persona 进行测试
- 展示完整的 AgentRun 详情（plan、toolCalls、evidence）用于调试

### F-3 运行审计 Tab

复用现有 `getAgentRunsPaginated` + `getAgentRunDetail`：
- 分页列表（runNo、userInput、status、personaCode、entrypoint、createdAt）
- 点击展开详情：messages、steps、toolCalls、approvals

### F-4 审批管理 Tab

复用现有 `getAgentApprovalsPaginated` + `approve/reject`：
- 待审批列表
- 一键批准/拒绝

### F-5 Persona 配置 Tab

展示 6 个 Persona 的当前配置：
- 工具分组
- 推荐问题（可编辑并保存到 AgentPersona 表）
- 目标角色

### F-6 质量大盘 Tab

展示 AgentFeedback 聚合数据：
- 采纳率趋势图
- 按 Persona 分组的工具成功率
- 人工接管率
- 最近负面反馈列表

### F-7 移除 AgentBlockRenderer.tsx 的对话嵌入逻辑

`AgentBlockRenderer.tsx` 保留为 /ami-agent 审计详情和调试对话的渲染器，但不再作为主对话入口。

### F-8 验证

- 管理端 typecheck + build
- /ami-agent 各 Tab 可正常访问

---

## 阶段 G：清理与测试（0.5 天）

### G-1 删除 Kiosk 中已迁移到 agent-core 的本地实现

- `Kiosk/intent/conversationContext.ts` → 改为 re-export from `@ami/agent-core`
- `Kiosk/types.ts` 中的 AuraResponseBlock → re-export
- `src/types/agent.ts` 中的重复类型 → re-export

### G-2 删除冗余的测试 mock

`ruleIntentParser.test.ts` 和 `runMicroApp.test.ts` 中 mock `@/api` 的代码确认仍兼容新路径。

### G-3 前端完整测试

```bash
npm run test                    # 管理端 169 tests
cd packages/Ami-Aura-Lite-Kiosk && npm run typecheck && npm run build
```

### G-4 后端完整测试

```bash
cd packages/server-v2 && npm run test -- --runInBand   # 492 tests
```

### G-5 清理临时/废弃文件

- 删除 `docs/02-产品设计/洞悉美业_v2.md`（测试占位文件）
- 删除 `docs/02-产品设计/洞悉美业_v2test.md`
- 删除 `docs/02-产品设计/洞悉美业_v2.0.md`（被 v2.0 正式版替代）

---

## 依赖关系

```
A (包结构) → B (类型) → C (逻辑/hooks) → D (BlockRenderer) → E (Kiosk集成)
                                        → F (/ami-agent改造)
                                                              → G (清理)
```

A-B-C 是串行基础；D 和 F 可在 C 完成后并行；E 依赖 D；G 最后执行。

---

## 文件变更汇总

### 新增（18 个文件）

| 路径 | 说明 |
|---|---|
| `packages/agent-core/package.json` | 共享包配置 |
| `packages/agent-core/tsconfig.json` | TypeScript 配置 |
| `packages/agent-core/index.ts` | Barrel export |
| `packages/agent-core/types/blocks.ts` | AuraResponseBlock（16种） |
| `packages/agent-core/types/conversation.ts` | 对话消息和上下文类型 |
| `packages/agent-core/types/persona.ts` | Persona 类型 + 访问规则 |
| `packages/agent-core/types/result.ts` | AgentRunResultV2 |
| `packages/agent-core/logic/conversationContext.ts` | 上下文管理 |
| `packages/agent-core/logic/personaAccess.ts` | Persona 权限映射 |
| `packages/agent-core/logic/blockUtils.ts` | block 分组/排序 |
| `packages/agent-core/hooks/useAgentConversation.ts` | 对话 hook |
| `packages/agent-core/hooks/usePersona.ts` | Persona hook |
| `packages/agent-core/api/agentApi.ts` | API 封装 |
| `Kiosk/components/PersonaSwitcher.tsx` | Persona 切换器 |
| `Kiosk/components/AgentFeedback.tsx` | 反馈按钮 |
| `Kiosk/components/InsightPanel.tsx` | 信息面板 |
| `Kiosk/components/OpportunityCard.tsx` | 营销机会卡 |
| `Kiosk/components/ActivityDraftCard.tsx` | 活动草稿卡 |
| `Kiosk/components/CopyVariantsBlock.tsx` | 话术变体卡 |
| `Kiosk/components/InventoryItemCard.tsx` | 库存风险卡 |
| `Kiosk/components/SupplierPurchaseCard.tsx` | 供应商采购卡 |

### 修改（12 个文件）

| 路径 | 改动 |
|---|---|
| `packages/Ami-Aura-Lite-Kiosk/vite.config.ts` | 添加 @ami/agent-core alias |
| `vite.config.ts` | 添加 @ami/agent-core alias |
| `tsconfig.json` | paths 添加 @ami/agent-core |
| `Kiosk/app/types.ts` | AuraResponseBlock 改为 re-export |
| `Kiosk/app/components/BlockRenderer.tsx` | +6 种 block case |
| `Kiosk/app/AppContent.tsx` | 集成 useAgentConversation + Persona + 分区渲染 |
| `Kiosk/app/components/SmartCommandBar.tsx` | 快捷操作动态化 |
| `Kiosk/app/components/TopStatusBar.tsx` | 展示 Persona 名称 |
| `Kiosk/app/intent/conversationContext.ts` | 改为 re-export |
| `src/types/agent.ts` | 改为 re-export from agent-core |
| `src/app/pages/ami-agent/AmiAgentWorkspace.tsx` | 降级为 Tab 管理面板 |
| `vitest.config.ts` | alias 配置 |

### 废弃/降级

| 路径 | 处理 |
|---|---|
| `src/app/pages/ami-agent/components/AgentBlockRenderer.tsx` | 仅审计详情页复用，不再作为主渲染器 |

---

## 风险与注意事项

| 风险 | 缓解措施 |
|---|---|
| agent-core 包引入增加构建复杂度 | 不发 npm，纯 monorepo 内引用，Vite alias 解决 |
| AppContent.tsx 改造范围大 | 先拆出 AgentConversationPanel 再集成，不一次性重写 |
| FlowCard 和 Agent 对话模式切换可能有状态冲突 | 明确互斥：进入 FlowCard 时暂停 Agent 消息流 |
| Kiosk typecheck 引用 agent-core 后报路径错误 | 确保 tsconfig paths 和 vite alias 同时配置 |
| 测试中 mock 路径变化 | 逐一检查 vi.mock 路径，确保指向新位置 |
| 现有用户数据（AgentRun）兼容性 | 后端不改，只是前端消费方式变化 |

---

## 验收标准

| 场景 | 预期行为 |
|---|---|
| Kiosk 登录后 | 看到 Persona 切换器 + 角色首屏（不变） |
| 切换到营销 Agent | 快捷操作变为营销推荐问题 |
| 输入"哪些客户适合召回" | Agent 对话模式，BlockRenderer 渲染 opportunity_card + table + follow_up_chips |
| 输入"核销" | FlowCard 模式，CardVerificationFlowCard 全屏卡片流（不变） |
| Agent 回复底部 | 👍/👎 反馈按钮，点击后提交 |
| 管理端 /ami-agent | Tab 布局：对话调试 + 审计 + 审批 + Persona 配置 + 质量大盘 |
| 两端 import 路径 | 全部走 `@ami/agent-core`，无 `../../../../` 相对路径引用类型 |
| 全部测试 | 前端 169+、后端 492、两端 typecheck + build 通过 |
