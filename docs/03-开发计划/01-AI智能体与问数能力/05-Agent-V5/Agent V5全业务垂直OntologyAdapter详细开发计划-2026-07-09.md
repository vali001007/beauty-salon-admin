# Agent V5 全业务垂直 Ontology Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 Agent V5 骨架上补齐全业务垂直 Ontology Adapter、模糊问法追问、受控记忆、AI 治理中心 V5 视图和可验证评测闭环。

**Architecture:** V5 继续保持独立版本：`/agent-v5/*`、`agent_v5` runtime、V5 orchestrator、V5 adapter、V5 trace。旧版本能力只允许通过底层 service/query/policy 复用，不递归调用 V1/V2/V3/V4 Agent 入口。后端新增追问、记忆、治理报告服务；前端在 Ami Agent、Ami Aura 和 AI 治理中心渲染 V5 trace、clarification、memory、evidence 和 adapter 命中。

**Tech Stack:** NestJS + Prisma + TypeScript、React + Vite + TypeScript、Ami Aura Lite Kiosk、Vitest/Jest、现有 `AgentWorkflowRuntimeService`、现有 `AuraResponseBlock` 结构化渲染协议。

---

## 0. 当前基线

需求来源：

- `docs/02-产品设计/01-AI智能体与问数能力/Agent V5全业务垂直OntologyAdapter独立需求文档-2026-07-08.md`

当前已存在的 V5 文件：

- `packages/server-v2/src/agent-v5/agent-v5.module.ts`
- `packages/server-v2/src/agent-v5/agent-v5.controller.ts`
- `packages/server-v2/src/agent-v5/agent-v5-orchestrator.service.ts`
- `packages/server-v2/src/agent-v5/agent-v5.types.ts`
- `packages/server-v2/src/agent-v5/ontology/business-ontology.registry.ts`
- `packages/server-v2/src/agent-v5/ontology/agent-v5-semantic-router.service.ts`
- `packages/server-v2/src/agent-v5/ontology/agent-v5-context-builder.service.ts`
- `packages/server-v2/src/agent-v5/ontology/agent-v5-evidence-pack.service.ts`
- `packages/server-v2/src/agent-v5/ontology/agent-v5-constraint-guard.service.ts`
- `packages/server-v2/src/agent-v5/adapters/agent-v5-lifecycle.adapter.ts`
- `packages/server-v2/src/agent-v5/adapters/agent-v5-readonly-query.adapter.ts`
- `packages/server-v2/src/agent-v5/adapters/agent-v5-business-tool.adapter.ts`
- `packages/server-v2/src/agent-v5/adapters/agent-v5-governance.adapter.ts`
- `packages/server-v2/src/agent-v5/adapters/agent-v5-legacy-tool.adapter.ts`
- `packages/server-v2/src/agent-v5/eval/agent-v5-failure-diagnosis.service.ts`
- `src/api/agentV5.ts`
- `src/api/real/agentV5.ts`

当前主要缺口：

- V5 route decision 尚未包含 `entities`、`ambiguity`、clarification trace 和 memory trace。
- 追问逻辑目前只按 `missingSlots` 简单返回澄清，没有面向业务域、实体、指标、时间范围、动作风险的追问服务。
- V5 尚无 `AgentV5MemoryService`。
- AI 治理中心 `AGENT_GOVERNANCE_ENGINE_OPTIONS` 尚未包含 `agent_v5`，也没有 V5 专属 router/adapter/clarification/memory 视图。
- 全业务垂直 adapter 尚未拆出 Reception、Cashier、Beautician、Schedule、Finance、InventorySupply、StaffPerformance、Marketing。

## 1. 文件结构规划

### 1.1 后端新增文件

- Create: `packages/server-v2/src/agent-v5/ontology/agent-v5-clarification.service.ts`
  - 负责模糊问法识别、追问卡片生成、追问选择合并。
- Create: `packages/server-v2/src/agent-v5/ontology/agent-v5-clarification.service.spec.ts`
  - 覆盖业务域模糊、实体模糊、指标模糊、动作模糊、多意图冲突。
- Create: `packages/server-v2/src/agent-v5/ontology/agent-v5-memory.service.ts`
  - 负责 run working memory、用户偏好 memory 快照、门店业务 memory 快照、治理 memory 摘要。
- Create: `packages/server-v2/src/agent-v5/ontology/agent-v5-memory.service.spec.ts`
  - 覆盖实体继承、过期、纠错、PII 过滤、事实查询不得只靠记忆。
- Create: `packages/server-v2/src/agent-v5/governance/agent-v5-governance-report.service.ts`
  - 负责 V5 治理中心数据聚合：overview、routes、adapters、clarifications、memory、failures、eval。
- Create: `packages/server-v2/src/agent-v5/governance/agent-v5-governance-report.service.spec.ts`
  - 覆盖 agentCode 过滤、门店隔离、PII 不透出、聚合指标。
- Create: `packages/server-v2/src/agent-v5/adapters/agent-v5-reception.adapter.ts`
- Create: `packages/server-v2/src/agent-v5/adapters/agent-v5-cashier.adapter.ts`
- Create: `packages/server-v2/src/agent-v5/adapters/agent-v5-beautician.adapter.ts`
- Create: `packages/server-v2/src/agent-v5/adapters/agent-v5-schedule.adapter.ts`
- Create: `packages/server-v2/src/agent-v5/adapters/agent-v5-finance.adapter.ts`
- Create: `packages/server-v2/src/agent-v5/adapters/agent-v5-inventory-supply.adapter.ts`
- Create: `packages/server-v2/src/agent-v5/adapters/agent-v5-staff-performance.adapter.ts`
- Create: `packages/server-v2/src/agent-v5/adapters/agent-v5-marketing.adapter.ts`
  - 这些 adapter 在 P1 逐步从 `AgentV5BusinessToolAdapter` 拆出。

### 1.2 后端修改文件

- Modify: `packages/server-v2/src/agent-v5/agent-v5.types.ts`
  - 增加 route entity、ambiguity、clarification、memory、governance DTO 类型。
- Modify: `packages/server-v2/src/agent-v5/agent-v5.module.ts`
  - 注册 clarification、memory、governance report 和新增垂直 adapter。
- Modify: `packages/server-v2/src/agent-v5/agent-v5.controller.ts`
  - 增加 `/agent-v5/governance/*` 只读接口。
- Modify: `packages/server-v2/src/agent-v5/agent-v5-orchestrator.service.ts`
  - 接入 memory snapshot、clarification service、trace 持久化。
- Modify: `packages/server-v2/src/agent-v5/ontology/agent-v5-semantic-router.service.ts`
  - 输出 `entities`、`ambiguity`、更细 intent 和 adapter candidates。
- Modify: `packages/server-v2/src/agent-v5/ontology/business-ontology.registry.ts`
  - 补全全业务 concepts、aliases、capabilities。
- Modify: `packages/server-v2/src/agent-v5/ontology/agent-v5-evidence-pack.service.ts`
  - 支持 `entities`、`memoryUsed`、clarification trace 和 quality flags。
- Modify: `packages/server-v2/src/agent-v5/ontology/agent-v5-constraint-guard.service.ts`
  - 对模糊高风险动作强制阻断或审批。
- Modify: `packages/server-v2/src/agent-v5/agent-v5-orchestrator.service.spec.ts`
  - 增加独立性、追问、记忆、治理 trace 单测。

### 1.3 前端新增文件

- Create: `src/api/real/agentV5Governance.ts`
- Create: `src/api/agentV5Governance.ts`
  - V5 治理接口 facade。
- Create: `src/app/pages/system/agent-governance/V5GovernancePanel.tsx`
  - AI 治理中心 V5 专属视图容器。
- Create: `src/app/pages/system/agent-governance/V5RouteAuditPanel.tsx`
- Create: `src/app/pages/system/agent-governance/V5AdapterMetricsPanel.tsx`
- Create: `src/app/pages/system/agent-governance/V5ClarificationPanel.tsx`
- Create: `src/app/pages/system/agent-governance/V5MemoryPanel.tsx`
- Create: `src/app/pages/system/agent-governance/V5FailurePanel.tsx`

### 1.4 前端修改文件

- Modify: `src/types/agent.ts`
  - 增加 V5 route、clarification、memory、trace 类型。
- Modify: `src/types/agentGovernance.ts`
  - 增加 V5 governance overview/list 类型。
- Modify: `src/api/index.ts`
  - 导出 `agentV5Governance` facade。
- Modify: `src/app/pages/ami-agent/components/AgentBlockRenderer.tsx`
  - 渲染 V5 clarification、memory、capability trace。
- Modify: `src/app/pages/ami-agent/AmiAgentWorkspace.tsx`
  - V5 模式处理追问点击、记忆提示和快捷入口。
- Modify: `src/app/pages/system/AgentGovernanceCenter.tsx`
  - `AGENT_GOVERNANCE_ENGINE_OPTIONS` 增加 V5。
  - 增加 V5 页签或 V5 专题面板入口。

### 1.5 终端修改文件

- Modify: `packages/Ami-Aura-Lite-Kiosk/src/app/components/BlockRenderer.tsx`
  - 渲染追问卡和记忆提示。
- Modify: `packages/Ami-Aura-Lite-Kiosk/src/app/services/agentRuntimeService.ts`
  - V5 追问选项点击后追加 V5 message。
- Modify: `packages/Ami-Aura-Lite-Kiosk/src/app/services/auraCoreService.ts`
  - 透传 V5 clarification selection 和 memory context。

### 1.6 文档与评测文件

- Modify: `docs/03-开发计划/01-AI智能体与问数能力/Agent V5美业全业务Ontology经营Agent独立开发计划-2026-07-08.md`
  - 同步本计划的阶段和新增能力。
- Modify: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-eval-questions.md`
  - 标记 V5 clarification/memory 覆盖样例。
- Modify: `packages/server-v2/prisma/agent-all-version-eval.ts`
  - V5 评测输出增加 clarification/memory 统计。

## 2. 开发阶段划分

### P0：V5 追问、记忆、治理中心基础接入

目标：在不新增数据库表的前提下，把 V5 的追问、run working memory 和 AI 治理中心运行审计打通。

验收：

- 模糊问法能返回 `clarification_card`。
- 用户选择追问选项后继续同一个 V5 run。
- “她还有什么卡”能继承上一轮客户实体，但仍实时查卡项事实。
- `/system/agent-governance` 能筛选 `agent_v5`。
- V5 run detail 能看到 route、clarification、memory、evidence、constraint、failure diagnosis。

### P1：全业务垂直 Adapter 拆分

目标：把 `AgentV5BusinessToolAdapter` 中的多域逻辑拆成独立垂直 adapter，提升命中率和可维护性。

验收：

- Reception、Cashier、Beautician、Schedule、Finance、InventorySupply、StaffPerformance、Marketing 至少各覆盖 10 个核心问题。
- 每个 adapter 有单独单测。
- 650 题评测按 adapter 输出命中率。
- V5 不出现递归调用旧 Agent 入口。

### P2：AI 治理中心 V5 专题和持续优化闭环

目标：把追问、记忆、adapter 命中、失败诊断、评测 gap 变成治理中心可运营的看板。

验收：

- 治理中心展示 V5 总览、router、adapter、clarification、memory、failure、eval。
- 高频模糊问法可回灌为 ontology alias 或强制追问规则。
- 用户反馈能关联到 adapter、concept、capability 或 data gap。

## 3. 详细任务

### Task 1: 扩展 V5 类型契约

**Files:**

- Modify: `packages/server-v2/src/agent-v5/agent-v5.types.ts`
- Modify: `src/types/agent.ts`

- [ ] **Step 1: 扩展后端 V5 类型**

在 `packages/server-v2/src/agent-v5/agent-v5.types.ts` 增加以下类型。保留已有字段，追加新字段，避免破坏现有调用方。

```ts
export type AgentV5AmbiguityType =
  | 'domain'
  | 'entity'
  | 'metric'
  | 'time_range'
  | 'scope'
  | 'action'
  | 'multi_intent';

export type AgentV5RouteEntity = {
  type: string;
  id?: string | number;
  name?: string;
  confidence: number;
  source?: 'message' | 'memory' | 'context' | 'resolver';
};

export type AgentV5RouteAmbiguity = {
  type: AgentV5AmbiguityType;
  candidates: string[];
  question: string;
};

export type AgentV5ClarificationTrace = {
  runId: number;
  messageId?: number;
  ambiguityType: AgentV5AmbiguityType;
  candidates: string[];
  question: string;
  selectedValue?: string;
  resolved: boolean;
  adapterBefore?: string[];
  adapterAfter?: string[];
};

export type AgentV5MemoryItem = {
  key: string;
  value: string;
  entityType?: string;
  entityId?: string | number;
  sourceMessageId?: number;
  source?: 'message' | 'explicit_user_choice' | 'repeated_behavior' | 'admin_setting' | 'business_context' | 'governance';
  confidence?: number;
  expiresAt?: string;
};

export type AgentV5MemorySnapshot = {
  working: AgentV5MemoryItem[];
  preferences: AgentV5MemoryItem[];
  businessContext: AgentV5MemoryItem[];
  governance: Array<{
    issueType: string;
    count: number;
    lastOccurredAt: string;
    suggestedFix: string;
  }>;
};
```

扩展 `AgentV5RouteDecision`：

```ts
export type AgentV5RouteDecision = {
  intent: AgentV5Intent;
  domains: string[];
  concepts: string[];
  entities: AgentV5RouteEntity[];
  capabilityCandidates: string[];
  adapterCandidates: string[];
  confidence: number;
  riskLevel: AgentV5RiskLevel;
  missingSlots: string[];
  ambiguity?: AgentV5RouteAmbiguity;
  fallbackPolicy: 'ask_clarification' | 'readonly_query' | 'domain_summary' | 'blocked';
  reason: string;
};
```

扩展 `AgentV5EvidencePack`：

```ts
export type AgentV5EvidencePack = {
  sources: string[];
  domains: string[];
  concepts: string[];
  entities: Array<{ type: string; id?: string | number; name?: string }>;
  filters: string[];
  sampleSize: number;
  metrics: Record<string, string | number>;
  facts: AgentV5EvidenceFact[];
  risks: string[];
  limitations: string[];
  quality: Record<string, string | number | null>;
  memoryUsed?: AgentV5MemoryItem[];
  clarification?: AgentV5ClarificationTrace;
};
```

- [ ] **Step 2: 扩展前端类型**

在 `src/types/agent.ts` 中增加与后端同名的前端类型。若已有相近类型，采用兼容扩展，不删除旧字段。

```ts
export type AgentV5AmbiguityType =
  | 'domain'
  | 'entity'
  | 'metric'
  | 'time_range'
  | 'scope'
  | 'action'
  | 'multi_intent';

export type AgentV5RouteEntity = {
  type: string;
  id?: string | number;
  name?: string;
  confidence: number;
  source?: 'message' | 'memory' | 'context' | 'resolver';
};

export type AgentV5MemoryItem = {
  key: string;
  value: string;
  entityType?: string;
  entityId?: string | number;
  sourceMessageId?: number;
  source?: string;
  confidence?: number;
  expiresAt?: string;
};

export type AgentV5MemorySnapshot = {
  working: AgentV5MemoryItem[];
  preferences: AgentV5MemoryItem[];
  businessContext: AgentV5MemoryItem[];
  governance: Array<{
    issueType: string;
    count: number;
    lastOccurredAt: string;
    suggestedFix: string;
  }>;
};
```

- [ ] **Step 3: 运行类型相关测试**

Run:

```powershell
npx.cmd vitest run src/test/api.test.ts
```

Expected:

```text
Test Files  1 passed
```

如果该测试因现有脏改失败，记录失败输出，不要改无关文件。

### Task 2: 新增 V5 模糊追问服务

**Files:**

- Create: `packages/server-v2/src/agent-v5/ontology/agent-v5-clarification.service.ts`
- Create: `packages/server-v2/src/agent-v5/ontology/agent-v5-clarification.service.spec.ts`
- Modify: `packages/server-v2/src/agent-v5/agent-v5.module.ts`

- [ ] **Step 1: 写 clarification service 单测**

Create `packages/server-v2/src/agent-v5/ontology/agent-v5-clarification.service.spec.ts`:

```ts
import { AgentV5ClarificationService } from './agent-v5-clarification.service.js';
import type { AgentV5RouteDecision } from '../agent-v5.types.js';

function route(partial: Partial<AgentV5RouteDecision>): AgentV5RouteDecision {
  return {
    intent: 'readonly_query',
    domains: ['order'],
    concepts: ['order'],
    entities: [],
    capabilityCandidates: ['readonly.query'],
    adapterCandidates: ['readonly_query'],
    confidence: 0.7,
    riskLevel: 'read',
    missingSlots: [],
    fallbackPolicy: 'readonly_query',
    reason: 'test',
    ...partial,
  };
}

describe('AgentV5ClarificationService', () => {
  const service = new AgentV5ClarificationService();

  it('asks a domain clarification for broad business status questions', () => {
    const result = service.inspect({
      message: '今天情况怎么样',
      route: route({
        intent: 'business_overview',
        domains: ['business_overview'],
        confidence: 0.62,
      }),
    });

    expect(result.required).toBe(true);
    expect(result.trace.ambiguityType).toBe('domain');
    expect(result.block?.kind).toBe('clarification_card');
    expect(result.block?.options.map((item) => item.value)).toEqual(
      expect.arrayContaining(['business_overview', 'reservation_coordination', 'finance_margin', 'lifecycle_diagnosis']),
    );
  });

  it('asks an entity clarification for ambiguous person references without memory', () => {
    const result = service.inspect({
      message: '她还有什么卡',
      route: route({ intent: 'readonly_query', confidence: 0.72 }),
    });

    expect(result.required).toBe(true);
    expect(result.trace.ambiguityType).toBe('entity');
    expect(result.block?.question).toContain('哪个客户');
  });

  it('blocks high risk vague action requests with an action clarification', () => {
    const result = service.inspect({
      message: '帮我处理这些客户',
      route: route({ intent: 'lifecycle_diagnosis', domains: ['customer'], confidence: 0.86 }),
    });

    expect(result.required).toBe(true);
    expect(result.trace.ambiguityType).toBe('action');
    expect(result.block?.options.map((item) => item.value)).toEqual(
      expect.arrayContaining(['view_recommendation', 'create_draft', 'submit_approval']),
    );
  });
});
```

- [ ] **Step 2: 实现 clarification service**

Create `packages/server-v2/src/agent-v5/ontology/agent-v5-clarification.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import type { AuraResponseBlock } from '../../agent/agent.types.js';
import type { AgentV5ClarificationTrace, AgentV5RouteDecision } from '../agent-v5.types.js';

type InspectInput = {
  message: string;
  route: AgentV5RouteDecision;
};

type ClarificationOption = {
  label: string;
  value: string;
  description?: string;
  confidence?: number;
};

export type AgentV5ClarificationResult = {
  required: boolean;
  trace: AgentV5ClarificationTrace;
  block?: AuraResponseBlock & {
    kind: 'clarification_card';
    question: string;
    options: ClarificationOption[];
    allowFreeText: boolean;
  };
};

@Injectable()
export class AgentV5ClarificationService {
  inspect(input: InspectInput): AgentV5ClarificationResult {
    const text = String(input.message ?? '');
    const ambiguity = this.detectAmbiguity(text, input.route);
    if (!ambiguity) {
      return {
        required: false,
        trace: {
          runId: 0,
          ambiguityType: 'domain',
          candidates: [],
          question: '',
          resolved: true,
          adapterBefore: input.route.adapterCandidates,
          adapterAfter: input.route.adapterCandidates,
        },
      };
    }

    const trace: AgentV5ClarificationTrace = {
      runId: 0,
      ambiguityType: ambiguity.type,
      candidates: ambiguity.options.map((item) => item.value),
      question: ambiguity.question,
      resolved: false,
      adapterBefore: input.route.adapterCandidates,
    };

    return {
      required: true,
      trace,
      block: {
        kind: 'clarification_card',
        title: ambiguity.title,
        question: ambiguity.question,
        options: ambiguity.options,
        allowFreeText: true,
      },
    };
  }

  private detectAmbiguity(message: string, route: AgentV5RouteDecision): null | {
    type: AgentV5ClarificationTrace['ambiguityType'];
    title: string;
    question: string;
    options: ClarificationOption[];
  } {
    if (/^(今天|最近|本周)?(情况|怎么样|咋样|如何)\??$/.test(message.trim()) || /今天情况怎么样|最近情况怎么样/.test(message)) {
      return {
        type: 'domain',
        title: '需要确认业务视角',
        question: '你想看哪个方向的情况？',
        options: [
          { label: '经营概览', value: 'business_overview', description: '收入、预约、客户、库存和风险汇总' },
          { label: '预约现场', value: 'reservation_coordination', description: '今日预约、到店和空档' },
          { label: '财务收入', value: 'finance_margin', description: '营业额、实收、毛利和异常' },
          { label: '客户跟进', value: 'lifecycle_diagnosis', description: '生命周期机会和重点客户' },
        ],
      };
    }

    if (/(她|他|这个客户|那个客户)/.test(message) && !route.entities?.length) {
      return {
        type: 'entity',
        title: '需要确认客户',
        question: '你说的是哪个客户？可以输入姓名、手机号后四位或从候选客户中选择。',
        options: [
          { label: '输入客户姓名', value: 'input_customer_name' },
          { label: '输入手机号后四位', value: 'input_phone_suffix' },
        ],
      };
    }

    if (/处理|执行|发|群发|扣|退款|改|下单/.test(message)) {
      return {
        type: 'action',
        title: '需要确认动作边界',
        question: '你希望我执行到哪一步？',
        options: [
          { label: '只看建议', value: 'view_recommendation', description: '只输出原因和建议动作' },
          { label: '生成草稿', value: 'create_draft', description: '创建活动、规则或跟进任务草稿' },
          { label: '提交审批', value: 'submit_approval', description: '进入人工审批，不直接执行' },
        ],
      };
    }

    if (route.confidence < 0.68) {
      return {
        type: 'domain',
        title: '需要进一步明确问题',
        question: '这个问题更接近哪个业务域？',
        options: [
          { label: '客户', value: 'customer' },
          { label: '收银', value: 'cashier' },
          { label: '库存', value: 'inventory' },
          { label: '财务', value: 'finance' },
        ],
      };
    }

    return null;
  }
}
```

- [ ] **Step 3: 注册 service**

Modify `packages/server-v2/src/agent-v5/agent-v5.module.ts`，在 providers 中加入：

```ts
AgentV5ClarificationService,
```

并补 import：

```ts
import { AgentV5ClarificationService } from './ontology/agent-v5-clarification.service.js';
```

- [ ] **Step 4: 运行后端测试**

Run:

```powershell
npm.cmd --prefix packages/server-v2 run test -- agent-v5-clarification.service.spec.ts --runInBand
```

Expected:

```text
PASS src/agent-v5/ontology/agent-v5-clarification.service.spec.ts
```

### Task 3: 新增 V5 Run Working Memory

**Files:**

- Create: `packages/server-v2/src/agent-v5/ontology/agent-v5-memory.service.ts`
- Create: `packages/server-v2/src/agent-v5/ontology/agent-v5-memory.service.spec.ts`
- Modify: `packages/server-v2/src/agent-v5/agent-v5.module.ts`

- [ ] **Step 1: 写 memory service 单测**

Create `packages/server-v2/src/agent-v5/ontology/agent-v5-memory.service.spec.ts`:

```ts
import { AgentV5MemoryService } from './agent-v5-memory.service.js';

describe('AgentV5MemoryService', () => {
  const service = new AgentV5MemoryService();

  it('extracts a customer mention into run working memory', () => {
    const memory = service.buildSnapshot({
      message: '张雯今天有没有预约',
      previousMemory: null,
      runContext: {},
    });

    expect(memory.working).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'last_customer_name', value: '张雯', entityType: 'Customer' }),
      ]),
    );
  });

  it('inherits last customer for pronoun follow-up', () => {
    const previous = service.buildSnapshot({
      message: '张雯今天有没有预约',
      previousMemory: null,
      runContext: {},
    });

    const resolved = service.resolvePronouns('她还有什么卡', previous);
    expect(resolved.message).toContain('张雯');
    expect(resolved.memoryUsed).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'last_customer_name', value: '张雯' })]),
    );
  });

  it('does not persist phone-like sensitive values as memory', () => {
    const memory = service.buildSnapshot({
      message: '手机号 13800138000 的客户是谁',
      previousMemory: null,
      runContext: {},
    });

    expect(JSON.stringify(memory)).not.toContain('13800138000');
  });
});
```

- [ ] **Step 2: 实现 memory service**

Create `packages/server-v2/src/agent-v5/ontology/agent-v5-memory.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import type { AgentV5MemoryItem, AgentV5MemorySnapshot } from '../agent-v5.types.js';

type BuildSnapshotInput = {
  message: string;
  previousMemory: AgentV5MemorySnapshot | null;
  runContext: Record<string, unknown>;
};

@Injectable()
export class AgentV5MemoryService {
  buildSnapshot(input: BuildSnapshotInput): AgentV5MemorySnapshot {
    const previous = input.previousMemory ?? this.empty();
    const working = [...previous.working.filter((item) => !this.isExpired(item))];
    const customerName = this.extractCustomerName(input.message);
    if (customerName && !this.containsSensitive(customerName)) {
      this.upsert(working, {
        key: 'last_customer_name',
        value: customerName,
        entityType: 'Customer',
        source: 'message',
        confidence: 0.82,
        expiresAt: this.minutesFromNow(60),
      });
    }

    return {
      working,
      preferences: previous.preferences.filter((item) => !this.isExpired(item)),
      businessContext: previous.businessContext.filter((item) => !this.isExpired(item)),
      governance: previous.governance,
    };
  }

  resolvePronouns(message: string, memory: AgentV5MemorySnapshot): { message: string; memoryUsed: AgentV5MemoryItem[] } {
    const lastCustomer = memory.working.find((item) => item.key === 'last_customer_name' && !this.isExpired(item));
    if (!lastCustomer) return { message, memoryUsed: [] };
    if (!/(她|他|这个客户|那个客户)/.test(message)) return { message, memoryUsed: [] };
    return {
      message: message.replace(/她|他|这个客户|那个客户/g, String(lastCustomer.value)),
      memoryUsed: [lastCustomer],
    };
  }

  empty(): AgentV5MemorySnapshot {
    return { working: [], preferences: [], businessContext: [], governance: [] };
  }

  private upsert(items: AgentV5MemoryItem[], next: AgentV5MemoryItem) {
    const index = items.findIndex((item) => item.key === next.key);
    if (index >= 0) items[index] = next;
    else items.push(next);
  }

  private extractCustomerName(message: string) {
    const match = message.match(/([\u4e00-\u9fa5]{2,4})(今天|还有|预约|客户|卡|消费|来了吗|有没有)/);
    return match?.[1] ?? null;
  }

  private containsSensitive(value: string) {
    return /\d{7,}|openid|unionid|身份证|证件|token|secret/i.test(value);
  }

  private isExpired(item: AgentV5MemoryItem) {
    return Boolean(item.expiresAt && new Date(item.expiresAt).getTime() < Date.now());
  }

  private minutesFromNow(minutes: number) {
    return new Date(Date.now() + minutes * 60_000).toISOString();
  }
}
```

- [ ] **Step 3: 注册 memory service**

Modify `packages/server-v2/src/agent-v5/agent-v5.module.ts`:

```ts
import { AgentV5MemoryService } from './ontology/agent-v5-memory.service.js';
```

providers 加入：

```ts
AgentV5MemoryService,
```

- [ ] **Step 4: 运行 memory 测试**

Run:

```powershell
npm.cmd --prefix packages/server-v2 run test -- agent-v5-memory.service.spec.ts --runInBand
```

Expected:

```text
PASS src/agent-v5/ontology/agent-v5-memory.service.spec.ts
```

### Task 4: 将追问和记忆接入 V5 Orchestrator

**Files:**

- Modify: `packages/server-v2/src/agent-v5/agent-v5-orchestrator.service.ts`
- Modify: `packages/server-v2/src/agent-v5/agent-v5-orchestrator.service.spec.ts`

- [ ] **Step 1: 扩展 orchestrator 构造函数**

在 `AgentV5OrchestratorService` 注入：

```ts
private readonly clarification: AgentV5ClarificationService,
private readonly memory: AgentV5MemoryService,
```

补 import：

```ts
import { AgentV5ClarificationService } from './ontology/agent-v5-clarification.service.js';
import { AgentV5MemoryService } from './ontology/agent-v5-memory.service.js';
```

- [ ] **Step 2: 在 processRun 中构建 memory snapshot**

在 `processRun` 中 route 前增加：

```ts
const previousMemory = this.asObject(input.run?.resultJson)?.memory as AgentV5MemorySnapshot | undefined;
const memorySnapshot = this.memory.buildSnapshot({
  message: input.message,
  previousMemory: previousMemory ?? null,
  runContext: input.context ?? {},
});
const resolvedMessage = this.memory.resolvePronouns(input.message, memorySnapshot);
const route = this.router.route(resolvedMessage.message, {
  ...(input.context ?? {}),
  agentV5Memory: memorySnapshot,
});
```

替换原来的：

```ts
const route = this.router.route(input.message, input.context ?? {});
```

- [ ] **Step 3: 执行前检查 clarification**

在 `executeRoute` 开头，`missingSlots` 前增加：

```ts
const clarification = this.clarification.inspect({ message: input.message, route: input.route });
if (clarification.required && clarification.block) {
  const trace = { ...clarification.trace, runId: input.runId };
  const pack = this.evidencePack.build({
    route: input.route,
    partial: {
      sources: ['AgentV5ClarificationService'],
      domains: input.route.domains,
      concepts: input.route.concepts,
      filters: trace.candidates,
      sampleSize: trace.candidates.length,
      limitations: ['问题存在歧义，等待用户选择后继续执行。'],
      clarification: trace,
    },
  });
  const evidence = this.evidencePack.toAgentEvidence(pack);
  return {
    route: input.route,
    answer: clarification.block.question,
    renderedBlocks: [clarification.block],
    actions: [],
    evidence,
    status: 'completed',
  };
}
```

- [ ] **Step 4: 持久化 memory 和 clarification**

在 `setRunStatus` 的 `resultJson` 中加入：

```ts
memory: memorySnapshot,
memoryUsed: resolvedMessage.memoryUsed,
```

同时 `recordStep.inputJson` 加入：

```ts
memory: memorySnapshot,
resolvedMessage: resolvedMessage.message,
memoryUsed: resolvedMessage.memoryUsed,
```

- [ ] **Step 5: 增加 orchestrator 单测**

在 `agent-v5-orchestrator.service.spec.ts` 增加用例：

```ts
it('returns clarification card for ambiguous V5 question without creating old agent runs', async () => {
  const result = await service.createRun({
    message: '今天情况怎么样',
    actor,
    context: {},
  });

  expect(result.answer).toContain('哪个方向');
  expect(result.renderedBlocks?.some((block) => block.kind === 'clarification_card')).toBe(true);
  expect(runtime.createRun).toHaveBeenCalledWith(expect.objectContaining({ agentCode: 'agent_v5' }));
});

it('uses run working memory for pronoun follow-up and keeps agentCode as agent_v5', async () => {
  await service.createRun({ message: '张雯今天有没有预约', actor, context: {} });
  const result = await service.appendMessage({ runId: 1, message: '她还有什么卡', actor, context: {} });

  expect(JSON.stringify(result)).toContain('memory');
  expect(runtime.createRun).not.toHaveBeenCalledWith(expect.objectContaining({ agentCode: 'agent_v4' }));
});
```

- [ ] **Step 6: 运行 orchestrator 测试**

Run:

```powershell
npm.cmd --prefix packages/server-v2 run test -- agent-v5-orchestrator.service.spec.ts agent-v5-clarification.service.spec.ts agent-v5-memory.service.spec.ts --runInBand
```

Expected:

```text
PASS src/agent-v5/agent-v5-orchestrator.service.spec.ts
PASS src/agent-v5/ontology/agent-v5-clarification.service.spec.ts
PASS src/agent-v5/ontology/agent-v5-memory.service.spec.ts
```

### Task 5: 补全 V5 Router 的 entity 和 ambiguity 输出

**Files:**

- Modify: `packages/server-v2/src/agent-v5/ontology/agent-v5-semantic-router.service.ts`
- Modify: `packages/server-v2/src/agent-v5/ontology/business-ontology.registry.ts`
- Create: `packages/server-v2/src/agent-v5/ontology/agent-v5-semantic-router.service.spec.ts`

- [ ] **Step 1: 写 router 单测**

Create `packages/server-v2/src/agent-v5/ontology/agent-v5-semantic-router.service.spec.ts`:

```ts
import { BusinessOntologyRegistry } from './business-ontology.registry.js';
import { AgentV5SemanticRouterService } from './agent-v5-semantic-router.service.js';

describe('AgentV5SemanticRouterService', () => {
  const router = new AgentV5SemanticRouterService(new BusinessOntologyRegistry());

  it('routes card usage words to cashier semantics', () => {
    const result = router.route('今天核销多少次卡');
    expect(result.intent).toBe('cashier_reconciliation');
    expect(result.adapterCandidates).toContain('cashier');
  });

  it('routes schedule availability questions to schedule adapter', () => {
    const result = router.route('谁下午有空能接水光');
    expect(result.intent).toBe('reservation_coordination');
    expect(result.adapterCandidates).toContain('schedule');
  });

  it('extracts customer entity candidates from message text', () => {
    const result = router.route('张雯还有什么卡');
    expect(result.entities).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'Customer', name: '张雯' })]),
    );
  });
});
```

- [ ] **Step 2: 扩展 intent union**

在 `agent-v5.types.ts` 中把 `AgentV5Intent` 扩展为：

```ts
export type AgentV5Intent =
  | 'business_overview'
  | 'readonly_query'
  | 'lifecycle_diagnosis'
  | 'business_plan'
  | 'submit_business_plan'
  | 'attribution_review'
  | 'quality_review'
  | 'reception_lookup'
  | 'cashier_reconciliation'
  | 'beautician_service'
  | 'inventory_risk'
  | 'finance_margin'
  | 'reservation_coordination'
  | 'staff_performance'
  | 'marketing_growth'
  | 'failure_diagnosis'
  | 'clarify';
```

- [ ] **Step 3: 更新 router intent map**

在 `resolveIntent` 中补优先级：

```ts
if (/核销|扣次|划扣|用卡|收银单|小票|充值|办卡/.test(message)) return 'cashier_reconciliation';
if (/张[\u4e00-\u9fa5]|客户|顾客|会员|卡和权益|还有什么卡/.test(message)) return 'reception_lookup';
if (/我今天|下一个客户|护理准备|服务记录/.test(message)) return 'beautician_service';
if (/员工|美容师|业绩|绩效|提成|服务完成率/.test(message)) return 'staff_performance';
if (/活动|触达|自动化|优惠券|权益|营销/.test(message)) return 'marketing_growth';
```

- [ ] **Step 4: 更新 capability map**

在 `capabilityForIntent` 中加入：

```ts
reception_lookup: 'reception.customer.lookup',
cashier_reconciliation: 'cashier.card_usage.review',
beautician_service: 'beautician.service.today',
staff_performance: 'staff.performance.review',
marketing_growth: 'marketing.growth.review',
```

在 `domainsForIntent` 和 `conceptsForIntent` 中加入对应映射。

- [ ] **Step 5: 增加简单实体抽取**

在 router 中添加私有方法：

```ts
private extractEntities(message: string) {
  const entities = [];
  const customer = message.match(/([\u4e00-\u9fa5]{2,4})(今天|还有|预约|客户|卡|消费|来了吗|有没有)/)?.[1];
  if (customer) entities.push({ type: 'Customer', name: customer, confidence: 0.78, source: 'message' as const });
  const product = message.match(/([\u4e00-\u9fa5A-Za-z0-9]{2,20})(库存|缺货|临期|补货|耗材)/)?.[1];
  if (product && product !== customer) entities.push({ type: 'Product', name: product, confidence: 0.72, source: 'message' as const });
  return entities;
}
```

在 return 中加入：

```ts
entities: this.extractEntities(text),
```

- [ ] **Step 6: 运行 router 测试**

Run:

```powershell
npm.cmd --prefix packages/server-v2 run test -- agent-v5-semantic-router.service.spec.ts --runInBand
```

Expected:

```text
PASS src/agent-v5/ontology/agent-v5-semantic-router.service.spec.ts
```

### Task 6: 扩展 Evidence Pack 支持 memory 和 clarification

**Files:**

- Modify: `packages/server-v2/src/agent-v5/ontology/agent-v5-evidence-pack.service.ts`
- Create: `packages/server-v2/src/agent-v5/ontology/agent-v5-evidence-pack.service.spec.ts`

- [ ] **Step 1: 写 evidence pack 测试**

Create `packages/server-v2/src/agent-v5/ontology/agent-v5-evidence-pack.service.spec.ts`:

```ts
import { AgentV5EvidencePackService } from './agent-v5-evidence-pack.service.js';

describe('AgentV5EvidencePackService', () => {
  const service = new AgentV5EvidencePackService();

  it('keeps memory and clarification in the evidence pack', () => {
    const pack = service.build({
      route: {
        intent: 'reception_lookup',
        domains: ['customer'],
        concepts: ['customer'],
        entities: [{ type: 'Customer', name: '张雯', confidence: 0.8, source: 'memory' }],
        capabilityCandidates: ['reception.customer.lookup'],
        adapterCandidates: ['reception'],
        confidence: 0.8,
        riskLevel: 'read',
        missingSlots: [],
        fallbackPolicy: 'domain_summary',
        reason: 'test',
      },
      partial: {
        sources: ['Customer'],
        memoryUsed: [{ key: 'last_customer_name', value: '张雯', entityType: 'Customer' }],
        clarification: {
          runId: 1,
          ambiguityType: 'entity',
          candidates: ['张雯'],
          question: '你说的是哪个客户？',
          selectedValue: '张雯',
          resolved: true,
        },
      },
    });

    expect(pack.entities).toEqual([expect.objectContaining({ type: 'Customer', name: '张雯' })]);
    expect(pack.memoryUsed?.[0].value).toBe('张雯');
    expect(pack.clarification?.resolved).toBe(true);
  });
});
```

- [ ] **Step 2: 修改 evidence pack service**

确保 `build` 合并：

```ts
entities: partial.entities ?? route.entities?.map((item) => ({
  type: item.type,
  id: item.id,
  name: item.name,
})) ?? [],
memoryUsed: partial.memoryUsed ?? [],
clarification: partial.clarification,
```

确保 `toAgentEvidence` 在 `details` 或等价 JSON 字段中保留：

```ts
memoryUsed: pack.memoryUsed,
clarification: pack.clarification,
entities: pack.entities,
```

- [ ] **Step 3: 运行 evidence 测试**

Run:

```powershell
npm.cmd --prefix packages/server-v2 run test -- agent-v5-evidence-pack.service.spec.ts --runInBand
```

Expected:

```text
PASS src/agent-v5/ontology/agent-v5-evidence-pack.service.spec.ts
```

### Task 7: 后端 V5 Governance Report 接口

**Files:**

- Create: `packages/server-v2/src/agent-v5/governance/agent-v5-governance-report.service.ts`
- Create: `packages/server-v2/src/agent-v5/governance/agent-v5-governance-report.service.spec.ts`
- Modify: `packages/server-v2/src/agent-v5/agent-v5.controller.ts`
- Modify: `packages/server-v2/src/agent-v5/agent-v5.module.ts`

- [ ] **Step 1: 写 governance report service 测试**

Create `packages/server-v2/src/agent-v5/governance/agent-v5-governance-report.service.spec.ts`:

```ts
import { AgentV5GovernanceReportService } from './agent-v5-governance-report.service.js';

describe('AgentV5GovernanceReportService', () => {
  const prisma = {
    agentRun: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(() => jest.clearAllMocks());

  it('filters all governance queries by agent_v5 and storeId', async () => {
    prisma.agentRun.findMany.mockResolvedValue([]);
    prisma.agentRun.count.mockResolvedValue(0);
    const service = new AgentV5GovernanceReportService(prisma as any);

    await service.overview({ storeId: 1, days: 7 });

    expect(prisma.agentRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ agentCode: 'agent_v5', storeId: 1 }),
      }),
    );
  });
});
```

- [ ] **Step 2: 实现 governance report service**

Create `packages/server-v2/src/agent-v5/governance/agent-v5-governance-report.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AGENT_V5_CODE } from '../agent-v5.types.js';

type Query = {
  storeId: number;
  days?: number | string;
  adapter?: string;
  failureCode?: string;
};

@Injectable()
export class AgentV5GovernanceReportService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(query: Query) {
    const where = this.where(query);
    const runs = await this.prisma.agentRun.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        status: true,
        resultJson: true,
        evidenceJson: true,
        createdAt: true,
      },
    });
    return {
      total: runs.length,
      success: runs.filter((run) => run.status === 'completed').length,
      failed: runs.filter((run) => run.status === 'failed').length,
      waitingApproval: runs.filter((run) => run.status === 'waiting_approval').length,
      clarificationCount: runs.filter((run) => JSON.stringify(run.resultJson ?? {}).includes('clarification')).length,
      memoryUsedCount: runs.filter((run) => JSON.stringify(run.resultJson ?? {}).includes('memoryUsed')).length,
      adapterDistribution: this.countBy(runs, (run) => this.readFirstAdapter(run.resultJson)),
      failureDistribution: this.countBy(runs, (run) => this.readFailureCode(run.resultJson)),
    };
  }

  async recentRuns(query: Query) {
    return this.prisma.agentRun.findMany({
      where: this.where(query),
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, status: true, resultJson: true, evidenceJson: true, createdAt: true, updatedAt: true },
    });
  }

  private where(query: Query) {
    const days = Number(query.days ?? 7);
    return {
      agentCode: AGENT_V5_CODE,
      storeId: Number(query.storeId),
      createdAt: { gte: new Date(Date.now() - Math.max(days, 1) * 86_400_000) },
    };
  }

  private countBy<T>(items: T[], readKey: (item: T) => string) {
    return items.reduce<Record<string, number>>((acc, item) => {
      const key = readKey(item) || 'unknown';
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
  }

  private readFirstAdapter(resultJson: unknown) {
    const value = resultJson as any;
    return value?.route?.adapterCandidates?.[0] ?? 'unknown';
  }

  private readFailureCode(resultJson: unknown) {
    const value = resultJson as any;
    return value?.failureDiagnosis?.code ?? 'none';
  }
}
```

- [ ] **Step 3: controller 增加治理接口**

在 `agent-v5.controller.ts` 注入 `AgentV5GovernanceReportService`，新增：

```ts
@Get('governance/overview')
overview(@Req() req: any, @Query() query: Record<string, string>) {
  const actor = this.resolveActor(req);
  return this.governanceReport.overview({ storeId: actor.storeId, days: query.days });
}

@Get('governance/routes')
routes(@Req() req: any, @Query() query: Record<string, string>) {
  const actor = this.resolveActor(req);
  return this.governanceReport.recentRuns({ storeId: actor.storeId, days: query.days });
}
```

- [ ] **Step 4: module 注册 governance report service**

在 `agent-v5.module.ts` providers 加入：

```ts
AgentV5GovernanceReportService,
```

- [ ] **Step 5: 运行治理测试**

Run:

```powershell
npm.cmd --prefix packages/server-v2 run test -- agent-v5-governance-report.service.spec.ts --runInBand
```

Expected:

```text
PASS src/agent-v5/governance/agent-v5-governance-report.service.spec.ts
```

### Task 8: 前端 API facade 接入 V5 Governance

**Files:**

- Create: `src/api/real/agentV5Governance.ts`
- Create: `src/api/agentV5Governance.ts`
- Modify: `src/api/index.ts`
- Modify: `src/types/agentGovernance.ts`
- Modify: `src/test/api.test.ts`

- [ ] **Step 1: 增加 governance 类型**

在 `src/types/agentGovernance.ts` 添加：

```ts
export type AgentV5GovernanceOverview = {
  total: number;
  success: number;
  failed: number;
  waitingApproval: number;
  clarificationCount: number;
  memoryUsedCount: number;
  adapterDistribution: Record<string, number>;
  failureDistribution: Record<string, number>;
};

export type AgentV5GovernanceRunTrace = {
  id: number;
  status: string;
  resultJson?: unknown;
  evidenceJson?: unknown;
  createdAt: string;
  updatedAt?: string;
};
```

- [ ] **Step 2: 创建 real API**

Create `src/api/real/agentV5Governance.ts`:

```ts
import client from '../client';
import type { AgentV5GovernanceOverview, AgentV5GovernanceRunTrace } from '@/types/agentGovernance';

export async function getAgentV5GovernanceOverview(params: { days?: number } = {}) {
  return client.get<AgentV5GovernanceOverview>('/agent-v5/governance/overview', { params });
}

export async function getAgentV5GovernanceRoutes(params: { days?: number } = {}) {
  return client.get<AgentV5GovernanceRunTrace[]>('/agent-v5/governance/routes', { params });
}
```

- [ ] **Step 3: 创建 facade**

Create `src/api/agentV5Governance.ts`:

```ts
export {
  getAgentV5GovernanceOverview,
  getAgentV5GovernanceRoutes,
} from './real/agentV5Governance';
```

- [ ] **Step 4: 导出 facade**

Modify `src/api/index.ts`:

```ts
export * from './agentV5Governance';
```

- [ ] **Step 5: 扩展 API 测试**

在 `src/test/api.test.ts` 添加断言：

```ts
it('exports Agent V5 governance facade', async () => {
  const api = await import('@/api');
  expect(api.getAgentV5GovernanceOverview).toBeTypeOf('function');
  expect(api.getAgentV5GovernanceRoutes).toBeTypeOf('function');
});
```

- [ ] **Step 6: 运行 API 测试**

Run:

```powershell
npx.cmd vitest run src/test/api.test.ts
```

Expected:

```text
Test Files  1 passed
```

### Task 9: AI 治理中心接入 V5

**Files:**

- Create: `src/app/pages/system/agent-governance/V5GovernancePanel.tsx`
- Modify: `src/app/pages/system/AgentGovernanceCenter.tsx`
- Modify: `src/app/pages/system/AgentGovernanceCenter.test.tsx`

- [ ] **Step 1: 创建 V5GovernancePanel**

Create `src/app/pages/system/agent-governance/V5GovernancePanel.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { getAgentV5GovernanceOverview, getAgentV5GovernanceRoutes } from '@/api';
import type { AgentV5GovernanceOverview, AgentV5GovernanceRunTrace } from '@/types/agentGovernance';

export function V5GovernancePanel() {
  const [overview, setOverview] = useState<AgentV5GovernanceOverview | null>(null);
  const [runs, setRuns] = useState<AgentV5GovernanceRunTrace[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getAgentV5GovernanceOverview({ days: 7 }),
      getAgentV5GovernanceRoutes({ days: 7 }),
    ])
      .then(([overviewResult, routesResult]) => {
        if (cancelled) return;
        setOverview(overviewResult);
        setRuns(routesResult);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading && !overview) return <div className="rounded-lg border p-4 text-sm text-gray-500">正在加载 V5 治理数据...</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Metric label="V5 运行" value={overview?.total ?? 0} />
        <Metric label="成功" value={overview?.success ?? 0} />
        <Metric label="失败" value={overview?.failed ?? 0} />
        <Metric label="追问" value={overview?.clarificationCount ?? 0} />
        <Metric label="记忆使用" value={overview?.memoryUsedCount ?? 0} />
      </div>
      <section className="rounded-lg border p-4">
        <h3 className="mb-3 text-sm font-semibold">V5 最近运行</h3>
        <div className="space-y-2">
          {runs.slice(0, 10).map((run) => (
            <div key={run.id} className="rounded border px-3 py-2 text-xs">
              <div className="font-medium">Run #{run.id} · {run.status}</div>
              <div className="mt-1 text-gray-500">{new Date(run.createdAt).toLocaleString()}</div>
            </div>
          ))}
          {!runs.length ? <div className="text-sm text-gray-500">暂无 V5 运行记录</div> : null}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}
```

- [ ] **Step 2: 治理中心 engine options 增加 V5**

Modify `AgentGovernanceCenter.tsx`:

```ts
const AGENT_GOVERNANCE_ENGINE_OPTIONS: Array<{ value: AgentGovernanceEngineFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'ami_ai', label: 'Ami AI' },
  { value: 'agent_v1', label: 'V1' },
  { value: 'agent_v2', label: 'V2' },
  { value: 'agent_v3', label: 'V3' },
  { value: 'agent_v4', label: 'V4' },
  { value: 'agent_v5', label: 'V5' },
];
```

如果 `AgentGovernanceEngineFilter` 类型尚不支持，扩展 `src/types/agentGovernance.ts`。

- [ ] **Step 3: 增加 V5 专题页签**

将 `TabKey` 扩展：

```ts
type TabKey = 'overview' | 'runs' | 'knowledge' | 'capabilities' | 'gray' | 'eval' | 'textSql' | 'feedback' | 'debug' | 'v5';
```

导入：

```ts
import { V5GovernancePanel } from './agent-governance/V5GovernancePanel';
```

在 TabsList 增加：

```tsx
<TabsTrigger value="v5">V5 治理</TabsTrigger>
```

在 TabsContent 增加：

```tsx
<TabsContent value="v5">
  <V5GovernancePanel />
</TabsContent>
```

- [ ] **Step 4: 增加治理中心测试**

在 `AgentGovernanceCenter.test.tsx` 增加：

```tsx
it('shows Agent V5 governance entry', async () => {
  render(<AgentGovernanceCenter />);
  expect(await screen.findByText('V5 治理')).toBeInTheDocument();
});
```

- [ ] **Step 5: 运行前端测试**

Run:

```powershell
npx.cmd vitest run src/app/pages/system/AgentGovernanceCenter.test.tsx
```

Expected:

```text
Test Files  1 passed
```

### Task 10: Ami Agent 前端渲染 V5 追问和记忆

**Files:**

- Modify: `src/app/pages/ami-agent/components/AgentBlockRenderer.tsx`
- Modify: `src/app/pages/ami-agent/AmiAgentWorkspace.tsx`
- Modify: `src/app/pages/ami-agent/AmiAgentWorkspace.test.tsx`

- [ ] **Step 1: 渲染 clarification card**

在 `AgentBlockRenderer.tsx` 的 block switch 中确保支持：

```tsx
case 'clarification_card':
  return <ClarificationCard block={block as any} onSelect={onClarificationSelect} />;
```

新增组件：

```tsx
function ClarificationCard({
  block,
  onSelect,
}: {
  block: {
    title?: string;
    question: string;
    options?: Array<{ label: string; value: string; description?: string }>;
    allowFreeText?: boolean;
  };
  onSelect?: (value: string) => void;
}) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
      <div className="font-semibold text-amber-900">{block.title ?? '需要确认'}</div>
      <div className="mt-1 text-amber-800">{block.question}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        {(block.options ?? []).map((option) => (
          <button
            key={option.value}
            type="button"
            className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs text-amber-900 hover:bg-amber-100"
            onClick={() => onSelect?.(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Workspace 处理追问选择**

在 `AmiAgentWorkspace.tsx` 的 V5 消息处理逻辑中增加：

```ts
const handleV5ClarificationSelect = useCallback((value: string) => {
  if (!activeRunId || selectedRuntime !== 'agent_v5') return;
  appendAgentV5Message(activeRunId, {
    message: value,
    context: {
      agentV5ClarificationSelection: value,
    },
  });
}, [activeRunId, selectedRuntime]);
```

把 `handleV5ClarificationSelect` 传给 block renderer。

- [ ] **Step 3: 渲染 memory 提示**

在 V5 capability trace 或 evidence 面板中，如果 `memoryUsed` 有值，展示：

```tsx
<div className="rounded border border-violet-100 bg-violet-50 px-3 py-2 text-xs text-violet-800">
  已沿用上下文：{memoryUsed.map((item) => `${item.key}=${item.value}`).join('、')}
</div>
```

- [ ] **Step 4: 前端测试**

在 `AmiAgentWorkspace.test.tsx` 增加：

```tsx
it('renders V5 clarification options and submits selected value', async () => {
  render(<AmiAgentWorkspace />);
  await userEvent.click(screen.getByText('V5'));
  expect(screen.getByText('V5')).toBeInTheDocument();
});
```

该测试若当前文件尚无完整 V5 mock，先覆盖 renderer 级别，避免引入大范围 workspace 重构。

- [ ] **Step 5: 运行测试**

Run:

```powershell
npx.cmd vitest run src/app/pages/ami-agent/AmiAgentWorkspace.test.tsx
```

Expected:

```text
Test Files  1 passed
```

### Task 11: Ami Aura 终端渲染 V5 追问和记忆

**Files:**

- Modify: `packages/Ami-Aura-Lite-Kiosk/src/app/components/BlockRenderer.tsx`
- Modify: `packages/Ami-Aura-Lite-Kiosk/src/app/services/agentRuntimeService.ts`
- Modify: `packages/Ami-Aura-Lite-Kiosk/src/app/services/agentRuntimeService.test.ts`

- [ ] **Step 1: 终端 BlockRenderer 支持 clarification card**

在 `BlockRenderer.tsx` 支持 `clarification_card`。复用管理端视觉，但终端按钮更大：

```tsx
function ClarificationCardBlock({ block, onSelect }: { block: any; onSelect?: (value: string) => void }) {
  return (
    <div className="rounded-2xl border border-[#E6C7A8] bg-[#FFF7ED] p-4">
      <div className="text-base font-semibold text-[#7C3F12]">{block.title ?? '需要确认'}</div>
      <div className="mt-2 text-sm text-[#7C3F12]">{block.question}</div>
      <div className="mt-4 grid gap-2">
        {(block.options ?? []).map((option: any) => (
          <button
            key={option.value}
            className="rounded-xl border border-[#E6C7A8] bg-white px-4 py-3 text-left text-sm"
            onClick={() => onSelect?.(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 终端 runtime 追加 V5 追问选择**

在 `agentRuntimeService.ts` 中为 V5 append message 透传：

```ts
context: {
  ...context,
  architecture: 'agent_v5_business_ontology_agent',
  agentV5ClarificationSelection: selectedValue,
}
```

- [ ] **Step 3: 终端测试**

在 `agentRuntimeService.test.ts` 增加：

```ts
it('routes agent_v5 clarification selections to Agent V5 append API', async () => {
  const result = await appendAgentMessage({
    runtime: 'agent_v5',
    runId: 12,
    message: 'business_overview',
    context: { agentV5ClarificationSelection: 'business_overview' },
  });

  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/agent-v5/runs/12/messages'),
    expect.anything(),
  );
  expect(result).toBeDefined();
});
```

- [ ] **Step 4: 运行终端测试**

Run:

```powershell
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run test -- agentRuntimeService.test.ts
```

Expected:

```text
PASS src/app/services/agentRuntimeService.test.ts
```

### Task 12: P1 垂直 Adapter 拆分

**Files:**

- Create: files listed in Section 1.1 adapter list
- Modify: `packages/server-v2/src/agent-v5/agent-v5-orchestrator.service.ts`
- Modify: `packages/server-v2/src/agent-v5/agent-v5.module.ts`
- Modify: `packages/server-v2/src/agent-v5/ontology/business-ontology.registry.ts`

- [ ] **Step 1: 先建立 adapter 接口**

在 `agent-v5.types.ts` 添加：

```ts
export type AgentV5VerticalAdapterInput = {
  runId: number;
  message: string;
  actor: AgentActor;
  context?: Record<string, unknown>;
  route: AgentV5RouteDecision;
  memory: AgentV5MemorySnapshot;
};

export type AgentV5VerticalAdapter = {
  adapterCode: string;
  execute(input: AgentV5VerticalAdapterInput): Promise<AgentV5AdapterResult>;
};
```

- [ ] **Step 2: ReceptionAdapter 初版**

Create `agent-v5-reception.adapter.ts`:

```ts
import { Injectable } from '@nestjs/common';
import type { AgentV5AdapterResult, AgentV5VerticalAdapterInput } from '../agent-v5.types.js';

@Injectable()
export class AgentV5ReceptionAdapter {
  readonly adapterCode = 'reception';

  async execute(input: AgentV5VerticalAdapterInput): Promise<AgentV5AdapterResult> {
    return {
      status: 'success',
      title: '前台客户查询',
      summary: '已识别为前台客户查询。P1 将接入客户、预约和卡项实时服务。',
      evidence: {
        sources: ['AgentV5ReceptionAdapter'],
        domains: ['customer'],
        concepts: ['customer', 'reservation', 'customer_card'],
        filters: [input.message],
        sampleSize: 0,
        limitations: ['当前 adapter 初版只返回识别结果，后续接入实时客户服务。'],
      },
      renderedBlocks: [{
        kind: 'summary_text',
        title: '前台客户查询',
        content: '已命中前台客户查询 adapter。',
      }],
    };
  }
}
```

其他 adapter 以同样接口实现，但必须在各自文件中独立定义，不共用一个巨型 switch。

- [ ] **Step 3: Orchestrator 路由 adapter**

在 `runAdapter` 中新增：

```ts
case 'reception_lookup':
  return this.reception.execute(inputWithMemory);
case 'cashier_reconciliation':
  return this.cashier.execute(inputWithMemory);
case 'beautician_service':
  return this.beautician.execute(inputWithMemory);
case 'staff_performance':
  return this.staffPerformance.execute(inputWithMemory);
case 'marketing_growth':
  return this.marketing.execute(inputWithMemory);
```

- [ ] **Step 4: 单测每个 adapter 不调用旧 Agent 入口**

为每个 adapter 建立最低限度测试：

```ts
it('returns V5 adapter result without calling old agent entrypoints', async () => {
  const result = await adapter.execute(input);
  expect(result.evidence?.sources).toContain('AgentV5ReceptionAdapter');
  expect(JSON.stringify(result)).not.toContain('/agent-v4/runs');
});
```

- [ ] **Step 5: 运行 P1 adapter 测试**

Run:

```powershell
npm.cmd --prefix packages/server-v2 run test -- agent-v5-reception.adapter.spec.ts agent-v5-cashier.adapter.spec.ts agent-v5-finance.adapter.spec.ts --runInBand
```

Expected:

```text
PASS adapter specs
```

### Task 13: V5 评测统计补充 clarification 和 memory

**Files:**

- Modify: `packages/server-v2/prisma/agent-all-version-eval.ts`
- Modify: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v5-eval-analysis-report-2026-07-08.md`

- [ ] **Step 1: 评测结果增加字段**

在 V5 评测输出对象中增加：

```ts
clarificationTriggered: Boolean(result.renderedBlocks?.some((block) => block.kind === 'clarification_card')),
memoryUsed: JSON.stringify(result).includes('memoryUsed'),
adapter: result.route?.adapterCandidates?.[0] ?? 'unknown',
failureCode: result.failureDiagnosis?.code ?? null,
```

- [ ] **Step 2: 报告按 adapter 聚合**

在报告生成中增加：

```ts
const byAdapter = groupBy(results, (item) => item.adapter ?? 'unknown');
const clarificationRate = percent(results.filter((item) => item.clarificationTriggered).length, results.length);
const memoryRate = percent(results.filter((item) => item.memoryUsed).length, results.length);
```

- [ ] **Step 3: 运行 V5 评测**

Run:

```powershell
npm.cmd --prefix packages/server-v2 run agent:v5:eval
```

Expected:

```text
生成 agent-v5-eval-results-*.json
生成 agent-v5-eval-analysis-report-*.md
报告包含 adapter、clarificationTriggered、memoryUsed 字段
```

如果当前脚本没有 `agent:v5:eval` 命令，先记录为脚本缺口，不临时用手工脚本替代正式命令。

### Task 14: 全量验证

**Files:**

- No source changes unless tests reveal targeted defects.

- [ ] **Step 1: 后端定向测试**

Run:

```powershell
npm.cmd --prefix packages/server-v2 run test -- agent-v5-orchestrator.service.spec.ts agent-v5-semantic-router.service.spec.ts agent-v5-clarification.service.spec.ts agent-v5-memory.service.spec.ts agent-v5-evidence-pack.service.spec.ts agent-v5-governance-report.service.spec.ts --runInBand
```

Expected:

```text
PASS all listed suites
```

- [ ] **Step 2: 后端 build**

Run:

```powershell
npm.cmd --prefix packages/server-v2 run build
```

Expected:

```text
compiled successfully
```

- [ ] **Step 3: 前端 API 和治理中心测试**

Run:

```powershell
npx.cmd vitest run src/test/api.test.ts src/app/pages/system/AgentGovernanceCenter.test.tsx
```

Expected:

```text
PASS selected frontend suites
```

- [ ] **Step 4: 管理端 build**

Run:

```powershell
npm.cmd run build
```

Expected:

```text
build completed
```

- [ ] **Step 5: 终端定向测试**

Run:

```powershell
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
```

Expected:

```text
build completed
```

- [ ] **Step 6: 静态边界扫描**

Run:

```powershell
rg -n "/agent-v[1-4]/runs|AgentV[1-4].*Orchestrator" packages/server-v2/src/agent-v5 src/api/agentV5.ts src/api/real/agentV5.ts src/api/agentV5Governance.ts src/api/real/agentV5Governance.ts
```

Expected:

```text
No matches
```

## 4. 风险与处理

| 风险 | 表现 | 处理 |
| --- | --- | --- |
| 脏工作区冲突 | V5、治理中心、终端已有大量未提交改动 | 每个任务前跑 `git status --short --branch`，只改任务列出的文件 |
| 旧版本串联 | V5 误调用 V3/V4 run | Task 14 静态扫描和 orchestrator 单测必须通过 |
| 追问过多 | 用户简单问题也被追问 | clarification service 只在低置信度、实体缺失、高风险动作、多意图冲突触发 |
| 记忆污染事实 | 使用旧上下文回答实时问题 | memory service 只补上下文，adapter 必须实时查事实 |
| 治理中心页面过重 | 一个文件继续膨胀 | V5 专题拆到 `src/app/pages/system/agent-governance/*` |
| Adapter 拆分过早 | P0 被全业务 adapter 拖慢 | P0 只做骨架、追问、记忆、治理；P1 再拆垂直 adapter |

## 5. 提交建议

按以下批次提交，便于回滚：

1. `feat(agent-v5): add clarification and memory contracts`
2. `feat(agent-v5): wire clarification and run memory into orchestrator`
3. `feat(agent-v5): expose governance overview APIs`
4. `feat(web): add Agent V5 governance center panel`
5. `feat(kiosk): render Agent V5 clarification cards`
6. `feat(agent-v5): split vertical ontology adapters`
7. `test(agent-v5): add eval metrics for clarification and memory`

## 6. 完成定义

完成后必须满足：

- V5 独立 API、管理端、终端仍可用。
- V5 不递归调用 V1/V2/V3/V4 Agent 入口。
- 模糊问法能追问。
- 追问选择后继续当前 V5 run。
- 同一 run 内能继承明确实体。
- 事实型问题仍实时查数据。
- AI 治理中心能筛选和查看 V5。
- V5 run 详情能看到 route、adapter、clarification、memory、evidence、constraint、failure。
- 定向后端测试、前端测试、终端 build、主应用 build 通过，或清楚记录环境/既有脏改导致的阻塞。

## 7. 开发完成记录（2026-07-09）

### 7.1 已落地范围

- 后端 V5 保持独立入口 `/agent-v5/*` 和 `agent_v5` runtime，不新增 Prisma 表。
- 新增 V5 模糊问法追问服务：`AgentV5ClarificationService`。
  - 低置信度、多业务域、实体指代、高风险动作边界会返回 `clarification_card`。
  - 追问选项带 `agent-v5:clarification:*` actionId，前端和终端可继续同一 V5 run。
- 新增 V5 短期记忆服务：`AgentV5MemoryService`。
  - 保存 run 内 working memory、偏好和业务上下文。
  - 不保存完整手机号、身份证、聊天长文本等敏感原文。
  - 事实型回答仍由 adapter 实时查底层数据，记忆只用于上下文补全。
- 扩展 V5 Ontology Router。
  - 新增意图：`reception_lookup`、`cashier_reconciliation`、`beautician_service`、`staff_performance`、`marketing_growth`。
  - 追问选择通过 `agentV5ClarificationSelection` 显式覆盖路由。
  - 客户/商品/美容师实体可从问题或短期记忆中抽取。
- 拆分全业务垂直 OntologyAdapter。
  - `AgentV5ReceptionAdapter`：前台客户查询。
  - `AgentV5CashierAdapter`：收银核销复盘。
  - `AgentV5BeauticianAdapter`：美容师今日服务。
  - `AgentV5ScheduleAdapter`：预约与排班协同。
  - `AgentV5FinanceAdapter`：财务收入与毛利复盘。
  - `AgentV5InventorySupplyAdapter`：库存与供应承接风险。
  - `AgentV5StaffPerformanceAdapter`：员工业绩诊断。
  - `AgentV5MarketingAdapter`：营销增长与归因诊断。
- 新增 V5 治理报表服务：`AgentV5GovernanceReportService`。
  - 接口覆盖 overview、routes、adapters、clarifications、memory、failures、eval。
  - 数据来源为现有 `AgentRun.resultJson` 和 V5 ontology registry，不新增表。
- 管理端接入：
  - `src/api/real/agentV5.ts` 补齐 V5 governance API。
  - AI 治理中心 runtime 筛选增加 V4/V5。
  - V5 模式展示追问率、记忆使用率、完成率、adapter 覆盖、追问记录和 Top Intent。
  - Ami Agent 工作区支持 V5 追问选项选择后带 context 继续当前会话。
- Ami Aura Lite 终端接入：
  - 终端 V5 追问 action 通过 `agentV5ClarificationSelection` 继续发送到 V5。
  - 仍复用现有 `AuraResponseBlock` renderer，不新增终端专属协议。

### 7.2 边界确认

- V5 可复用底层 service，例如 V3 只读 Text-to-SQL service、MarketingService、Prisma 查询。
- V5 不递归调用 `/agent-v1/*`、`/agent-v2/*`、`/agent-v3/*`、`/agent-v4/*` 的 Agent run 入口。
- V5 不直接调用 `AgentV1/V2/V3/V4 Orchestrator`。
- V5 不自动发券、不群发、不改客户资产、不扣库存、不创建订单、不改排班；高风险动作仍走草稿或审批。

### 7.3 验证结果

已通过：

```powershell
npm.cmd --prefix packages/server-v2 run test -- agent-v5-orchestrator.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run test -- agent-v5-orchestrator.service.spec.ts customer-lifecycle-ontology.service.spec.ts agent-v3-orchestrator.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run build
npx.cmd vitest run src/test/api.test.ts src/app/pages/system/AgentGovernanceCenter.test.tsx
npm.cmd run build
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
```

边界扫描：

```powershell
rg -n "/agent-v[1-4]/runs|AgentV[1-4].*Orchestrator|agent-v[1-4].*runs" packages/server-v2/src/agent-v5 src/api/agentV5.ts src/api/real/agentV5.ts packages/Ami-Aura-Lite-Kiosk/src/app/services packages/Ami-Aura-Lite-Kiosk/src/app/AppContent.tsx
```

结果：只命中文档化的 `forbiddenLegacyEntry` 边界说明，没有发现 V5 直接调用旧版 Agent run API 或旧版 orchestrator。

备注：`packages/Ami-Aura-Lite-Kiosk` build 仍有既有 chunk size warning，不影响本次 V5 功能交付。
