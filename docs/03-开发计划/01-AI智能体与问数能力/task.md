# Agent 新一代架构详细开发计划 task

版本：v1.0
日期：2026-07-05
时区：Asia/Shanghai
来源方案：`docs/03-开发计划/01-AI智能体与问数能力/Agent新一代架构方案-知识图谱+LLM+全自动能力发布-2026-07-05.md`
目标：用“知识图谱 + LLM + Manifest + PolicyGateway + 通用查询引擎 + 治理中心”替代当前 V2 的 `CapabilityDecisionService` 正则规则、硬编码工具查询和手动发布流程。

---

## 0. 状态标记

- `[ ]` 未开始
- `[~]` 开发中
- `[x]` 已完成
- `[!]` 阻塞或需决策

---

## 1. 本次建设边界

### 1.1 产品目标

- [x] 普通门店用户继续只看到一个“智能体/问数”入口，不暴露知识图谱、Manifest、V1/V2 等技术概念。
- [x] 系统能理解长尾口语问法，例如“哪些客户买了次卡但一直不来用”“这个月人效怎么样”，不再靠人工追加正则。
- [x] 新增低风险只读能力后，可以由系统扫描、门禁、自动发布、Runtime 热加载。
- [x] 写入、删除、发券、下发等高风险能力必须被发布门禁和运行时策略拦截，不能自动执行。
- [x] Agent 治理中心能看清：用户问了什么、图谱如何理解、LLM 如何抽取、Manifest 如何匹配、工具查了什么、为什么失败、如何修复。

### 1.2 技术目标

- [x] 新增知识图谱自动生成子系统，源头来自 Prisma、Controller、Route、业务对象字典、语义词典和已发布 Manifest。
- [x] 新增 LLM 意图抽取服务，图谱提供结构化上下文，LLM 只输出 `StructuredIntent`。
- [x] 新增能力映射层，用 `StructuredIntent.candidateCapabilities` 匹配 Active Manifest。
- [x] 新增 Schema-Driven 通用查询引擎，用 `sourceModel`、FK 关系、字段策略和 `outputKinds` 动态构造查询。
- [x] 完整复用并强化 V2 的 `PolicyGateway`、`ContractValidator`、`EvidenceService`。
- [x] 新增自动发布流水线，支持 deploy hook、Cron、管理端手动触发。
- [x] 新增 Agent 治理模块，覆盖运行审计、知识图谱治理、能力治理、评测中心、可视化调试和健康监控。

### 1.3 明确不做

- [x] 不继续在 `AgentV2CapabilityDecisionService` 里追加 `isXxx` 正则。
- [x] 不把旧 `agent` 的 Planner、Compiler、旧工具注册表继续扩成主线。
- [x] 不允许管理员手写 SQL 作为能力发布方式。
- [x] 不让 LLM 直接决定是否有权限、是否可写入、是否可泄露字段。
- [x] 不把“LLM 识别正确”当作安全边界；安全只认 Manifest、PolicyGateway、字段策略和发布状态。

---

## 2. 当前基线与影响范围

### 2.1 已有基础

- [x] V1 后端入口：`packages/server-v2/src/agent`
- [x] V2 后端入口：`packages/server-v2/src/agent-v2`
- [x] V2 能力中心：`packages/server-v2/src/agent-v2/capability-center`
- [x] V2 Manifest 类型：`packages/server-v2/src/agent-v2/capability/agent-v2-capability.types.ts`
- [x] V2 静态 Manifest：`packages/server-v2/src/agent-v2/capability/agent-v2-capability-manifest.ts`
- [x] V2 当前正则决策服务：`packages/server-v2/src/agent-v2/capability/agent-v2-capability-decision.service.ts`
- [x] V2 工具层：`packages/server-v2/src/agent-v2/tools`
- [x] V2 PolicyGateway：`packages/server-v2/src/agent-v2/policy/agent-v2-policy-gateway.service.ts`
- [x] V2 ContractValidator：`packages/server-v2/src/agent-v2/contracts/agent-v2-answer-contract-validator.service.ts`
- [x] V1 知识层可迁移资产：`packages/server-v2/src/agent/knowledge`
- [x] 管理端 Agent 工作台：`src/app/pages/ami-agent/AmiAgentWorkspace.tsx`
- [x] 管理端能力中心：`src/app/pages/system/AgentCapabilityCenter.tsx`
- [x] 管理端审计页：`src/app/pages/system/AgentAuditPage.tsx`
- [x] 终端适配层：`packages/Ami-Aura-Lite-Kiosk/src/app/services/agentRuntimeService.ts`
- [x] 终端 Agent 适配：`packages/Ami-Aura-Lite-Kiosk/src/app/services/terminalAgentAdapter.ts`
- [x] Agent 评测题库与报告：`docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/`

### 2.2 高风险区域

- [x] Prisma schema 和 migration：新增治理表、图谱覆盖表、审计表会影响数据库迁移。
- [x] 后端 Agent 入口：`/api/agent/runs` 和 `/api/agent-v2/runs` 的路由策略会影响管理端、终端和 API 调用。
- [x] 能力发布链路：自动发布如果门禁不严，会让未验证能力进入 Runtime。
- [x] 权限和字段策略：必须确保敏感客户、财务、员工数据不会进入 LLM 上下文。
- [x] 管理端路由和权限：新增 `Agent 治理中心` 会触及菜单、权限、路由守卫。
- [x] Kiosk 终端：终端快捷操作仍保留，不应被新意图识别层误接管。

---

## 3. 总体里程碑

| 阶段 | 优先级 | 预计 | 目标 | 主要产物 | 验收口径 |
|---|---:|---:|---|---|---|
| M0 开工保护与基线冻结 | P0 | 0.5 天 | 避免脏工作区和旧链路混改 | 基线记录 | 知道当前 V1/V2/能力中心/评测状态 |
| M1 知识图谱自动生成 | P0 | 3 天 | 从源头生成图谱 | `knowledge-graph.generated.ts`、JSON、报告 | 无孤立核心对象，业务对象有模型映射 |
| M2 LLM 意图抽取 | P0 | 3 天 | 用图谱上下文 + LLM 输出结构化意图 | `IntentExtractionService` | P0 问法抽取稳定，降级可用 |
| M3 能力映射层 | P0 | 2 天 | 用 Manifest 匹配替代正则决策 | `CapabilityMappingService` | 不再由 `isXxx` 正则决定能力 |
| M4 通用查询引擎 | P0 | 4 天 | 用 schema-driven 工具替代硬编码查询 | `GenericQueryEngine` | 记录、指标、趋势、详情可动态取数 |
| M5 安全、证据和契约强化 | P0 | 2 天 | 运行时安全不依赖识别正确性 | Policy、Evidence、Contract 扩展 | 越权 0，高风险自动执行 0 |
| M6 自动发布流水线 | P0 | 2 天 | 代码变更自动生成候选并发布低风险能力 | `AutoPublishService` | 只读低风险可自动发布，高风险阻断 |
| M7 评测门禁改造 | P0 | 2 天 | 650 题 + P0 strict 门禁 | Eval run 和 CI 报告 | P0 正确率、一致性、互斥达标 |
| M8 治理后端 | P1 | 4 天 | 提供审计、图谱、能力、评测、调试 API | `AgentGovernanceController` | 治理 API 可查可追溯 |
| M9 治理前端 | P1 | 5 天 | 管理端可视化治理中心 | `AgentGovernance` 页面组 | 产品/研发能定位失败和缺口 |
| M10 可视化调试器 | P1 | 3 天 | 单问题链路回放和 Manifest 模拟 | Debug API + 页面 | 可复现一次运行的全链路 |
| M11 图谱可视化 | P2 | 3 天 | 节点/边浏览、焦点模式、路径查询 | 图谱组件 | 能看懂对象、字段、能力关系 |
| M12 灰度切换与旧规则退役 | P0 | 3 天 | 新架构稳定接管，旧正则退役 | 灰度策略、清理 PR | 可回滚，可审计，可退役 |

合计预计：约 33.5 天。建议按 6 个 Sprint 执行，每个 Sprint 都必须有可验收产物。

---

## 4. M0 开工保护与基线冻结

目标：先冻结当前真实状态，避免把已有 V2 能力中心、评测报告、终端适配和未提交文档混在一起误判。

### T0.1 工作区预检

- [x] 执行 `git status --short --branch`。
- [x] 记录当前分支、未跟踪文件、已修改文件、删除文件。
- [x] 标记本次会触碰的高风险文件：
  - [x] `packages/server-v2/prisma/schema.prisma`
  - [x] `packages/server-v2/src/agent-v2`
  - [x] `packages/server-v2/src/agent`
  - [x] `src/app/routes.tsx`
  - [x] `src/api/real/agentV2.ts`
  - [x] `src/api/real/agentCapabilityCenter.ts`
  - [x] `packages/Ami-Aura-Lite-Kiosk/src/app/services/*`
- [x] 如存在用户未提交改动且与本任务冲突，先告知影响范围再改。

验收：

- [x] 有一份本次开发前状态记录。
- [x] 明确哪些文件是本任务要改，哪些已有脏改只读避让。

### T0.2 现有 Agent 能力核对

- [x] 核对 V2 已发布 Manifest 数量、能力草稿数量、active 版本。
- [x] 核对 650 题评测报告最近一次结果。
- [x] 核对 `AgentV2ManifestProvider` 是否已从 DB active Manifest 加载。
- [x] 核对管理端能力中心是否可进入。
- [x] 核对 Kiosk 是否仍能选择或透传 `agent_v1 / agent_v2`。

验收：

- [x] 能回答“当前新架构是在替换什么、复用什么、不能破坏什么”。

进度记录（2026-07-06 05:50）：

- 已执行 `git status --short --branch`。当前分支为 `codex/local-save-2026-07-02-latest-dev...origin/codex/local-save-2026-07-02-latest-dev`；工作区存在大量 Agent V2、Kiosk、治理中心和文档相关本地改动，未做清理、回滚或远端提交。
- 本任务触碰范围集中在 Agent V2 图谱、意图、Manifest、能力中心、治理、通用查询、管理端治理页、Kiosk Agent 适配、评测报告和 `task.md`；对非目标脏改只读避让，没有执行 destructive git 操作。
- 当前图谱报告显示 active capability count=36，能力草稿报告 total=577；最近 strict eval gate 报告生成于 `2026-07-06 03:42:02 Asia/Shanghai`，650 题、P0 103 题，P0 gate 全部通过。
- `AgentV2ManifestProviderService` 已通过单测确认：可从 DB active Manifest 刷新，DB 不可用时继续使用上一版 active Manifest，避免 Runtime 全量不可用。
- 管理端治理中心和权限通过 `AgentGovernanceCenter.test.tsx` / `permissions.test.ts` 验证；Kiosk 仍支持 `agent_v1 / agent_v2`，并在 `agent_v2` 下透传 `architecture=kg_llm_agent`。
- 当前新架构替换的是“能力选择正则、硬编码工具查询、手动发布流程”；复用并强化的是 V2 Runtime、PolicyGateway、ContractValidator、工具注册、V1 知识资产和现有管理端/Kiosk入口；不能破坏的是普通 Agent 入口、终端收银/核销快捷操作、门店隔离、字段脱敏和高风险动作阻断。

---

## 5. M1 知识图谱自动生成子系统

目标：让图谱只从源码、数据模型、路由、权限和已发布能力生成，不从旧 V1/V2 手写规则倒灌。

### T1.1 图谱类型和数据结构

- [x] 新增目录：`packages/server-v2/src/agent-v2/knowledge-graph`
- [x] 定义节点类型：
  - [x] `Domain`
  - [x] `BusinessObject`
  - [x] `DataModel`
  - [x] `Field`
  - [x] `Capability`
  - [x] `ActionIntent`
  - [x] `Word`
- [x] 定义边类型：
  - [x] `BELONGS_TO`
  - [x] `COMPOSED_OF`
  - [x] `HAS_FIELD`
  - [x] `FK_RELATION`
  - [x] `SYNONYM_OF`
  - [x] `TRIGGERS`
  - [x] `SUPPORTS_ACTION`
  - [x] `EXCLUDES`
  - [x] `REQUIRES_PERM`
- [x] 定义图谱输出类型：
  - [x] `KnowledgeGraphSnapshot`
  - [x] `KnowledgeGraphNode`
  - [x] `KnowledgeGraphEdge`
  - [x] `KnowledgeGraphCoverageReport`
  - [x] `KnowledgeGraphGap`

验收：

- [x] 类型能覆盖方案中节点和边关系。
- [x] 图谱节点和边都有 `source`、`sourcePath`、`confidence`、`updatedAt`。

### T1.2 数据源解析器

- [x] Prisma 解析器：
  - [x] 读取 `packages/server-v2/prisma/schema.prisma`。
  - [x] 生成 `DataModel`、`Field`、`FK_RELATION`。
  - [x] 识别 `storeId`、金额、时间、状态、客户、员工、订单、库存等关键字段。
- [x] 业务对象解析器：
  - [x] 读取 `packages/server-v2/src/agent/knowledge/business-object.catalog.ts`。
  - [x] 生成 `BusinessObject`、`SYNONYM_OF`、`SUPPORTS_ACTION`。
  - [x] 迁移或规范 `displayFields`、`evidenceSourceModels`。
- [x] 语义词典解析器：
  - [x] 读取 `business-semantic-lexicon.ts`。
  - [x] 生成 `Word`、同义词、填充词、时间词、动作词。
- [x] Action Ontology 解析器：
  - [x] 生成 `lookup/list/summary/diagnose/analyze/compare/draft/get_link/print` 等动作意图。
- [x] Controller 解析器：
  - [x] 扫描 `packages/server-v2/src/**/*.controller.ts`。
  - [x] 生成接口、权限码和 DTO 来源。
- [x] 前端路由解析器：
  - [x] 扫描 `src/app/routes.tsx` 和菜单配置。
  - [x] 生成路由、权限码、页面对象映射。
- [x] Active Manifest 解析器：
  - [x] 从 DB active Manifest 和静态兜底 Manifest 读取 `triggerKeywords`、`negativeExamples`、`permissionCodes`。
  - [x] 生成 `TRIGGERS`、`EXCLUDES`、`REQUIRES_PERM`。

验收：

- [x] 能扫描 Prisma 模型、后端 Controller、前端路由、已发布 Manifest。
- [x] Controller 和 Route 权限来源能区分 `explicit`、`domain_inferred`、`missing`。

### T1.3 图谱生成 CLI

- [x] 新增脚本命令：`npm.cmd --prefix packages/server-v2 run kg:generate`
- [x] 输出文件：
  - [x] `packages/server-v2/src/agent-v2/knowledge-graph/generated/knowledge-graph.generated.ts`
  - [x] `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/knowledge-graph.json`
  - [x] `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/knowledge-graph-report.md`
- [x] 校验规则：
  - [x] 所有 `BusinessObject` 必须有 `COMPOSED_OF`。
  - [x] 关键业务模型不能孤立。
  - [x] 所有 active capability 必须能追溯到 `BusinessObject` 或 `DataModel`。
  - [x] 所有 `REQUIRES_PERM` 必须指向真实权限码或进入审核缺口。
  - [x] `EXCLUDES` 不允许出现自相矛盾闭环。

验收：

- [x] `kg:generate` 能在 Windows PowerShell 下运行。
- [x] 生成报告包含节点数、边数、覆盖率、缺口列表、冲突列表。
- [x] 失败时能明确指出具体模型、字段、能力或权限缺口。

### T1.4 LLM 离线增强

- [x] 新增每周增强脚本：`kg:enhance`
- [x] 输入：
  - [x] 业务对象和字段中文名。
  - [x] 用户高频 unsupported 问法。
  - [x] 评测失败题。
- [x] 输出：
  - [x] `llm_generated` 同义词候选。
  - [x] FK 关系中文业务含义候选。
  - [x] 需人工审核的图谱补充项。
- [x] 低置信度候选不直接进入 active 图谱，只进入治理中心审核。

验收：

- [x] LLM 增强不会覆盖 code_generated 来源。
- [x] 管理员能看到候选同义词来源和置信度。

进度记录（2026-07-06 05:20）：

- 新增 `packages/server-v2/prisma/agent-v2-knowledge-graph-enhance.ts`，并接入 `npm.cmd --prefix packages/server-v2 run kg:enhance`。
- 新增 `agent-v2:knowledge:weekly`，每周链路可串联 `kg:generate -> kg:enhance -> capability drafts -> eval gate`。
- `kg:enhance` 读取当前 `knowledge-graph.json`、业务对象/字段、FK 关系和 `agent-v2-eval-drafts.json` 中未覆盖/待确认问法，只输出候选文件，不写数据库、不覆盖 `code_generated` 图谱。
- 输出文件：
  - `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/knowledge-graph-enhancement-candidates.json`
  - `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/knowledge-graph-enhancement-candidates.md`
- 本轮生成结果：491 条未覆盖/待确认问法输入，15 条同义词候选，120 条 FK 业务含义候选，80 条人工审核治理项；所有候选状态均为 `review_required`，`activeGraphImpact=none_until_reviewed`。
- 已验证：`npm.cmd --prefix packages/server-v2 run kg:enhance` 通过。
- 已验证：`npm.cmd --prefix packages/server-v2 run build` 通过。

---

## 6. M2 LLM 意图抽取服务

目标：让 LLM 成为语义泛化的唯一抽取器，但只输出结构化意图，不直接决定执行和安全。

### T2.1 StructuredIntent 契约

- [x] 新增类型：
  - [x] `StructuredIntent`
  - [x] `IntentObjectHint`
  - [x] `IntentTimeIntent`
  - [x] `IntentExtractionTrace`
  - [x] `IntentExtractionFallbackTrace`
- [x] 必填字段：
  - [x] `objects`
  - [x] `domain`
  - [x] `action`
  - [x] `timeIntent`
  - [x] `keywords`
  - [x] `candidateCapabilities`
  - [x] `confidence`
  - [x] `needsClarification`
  - [x] `unsupportedReason`

验收：

- [x] LLM 输出 JSON 可被严格解析和标准化。
- [x] JSON 不合法时能进入一次修复或降级。

### T2.2 图谱预处理服务

- [x] 新增 `KnowledgeGraphIntentContextService`。
- [x] 能力：
  - [x] 去除填充词。
  - [x] 同义词展开。
  - [x] 对象定位。
  - [x] 领域提示。
  - [x] 互斥提醒。
  - [x] 候选能力摘要。
  - [x] 字段和时间意图提示。
- [x] 性能要求：
  - [x] 图谱预处理 P99 小于 10ms。
  - [x] 缓存 active graph snapshot。

验收：

- [x] “次卡”“疗程卡”“卡包”能定位到对应业务对象。
- [x] “已报废”和“快过期”能注入互斥提醒。

### T2.3 LLM 调用服务

- [x] 新增 `IntentExtractionService`。
- [x] 模型策略：
  - [x] 日常使用轻量模型。
  - [x] 低置信度、复杂问题、JSON 修复失败时升级模型重试。
- [x] Prompt 包含：
  - [x] 用户问题。
  - [x] 图谱上下文。
  - [x] Active Manifest 摘要。
  - [x] 互斥提醒。
  - [x] 输出 JSON schema。
- [x] 安全要求：
  - [x] 不把未授权原始业务数据放入 Prompt。
  - [x] 不把敏感字段值放入 Prompt。
  - [x] LLM key 只在后端或 AI Gateway，前端不持有模型 key。

验收：

- [x] “哪些客户买了次卡但最近一直不来用”输出 `card.package.inactive-customers.list` 候选。
- [x] “帮我报废这批过期面膜”输出 `draft`，不输出直接写入。
- [x] “这个月人效怎么样”能被抽取为经营/员工/财务相关指标或进入 unsupported 缺口。

### T2.4 LRU 缓存和降级

- [x] 新增 normalized question cache：
  - [x] LRU 500。
  - [x] TTL 5 分钟。
  - [x] key 包含问题、门店范围、角色、active manifest version。
- [x] 新增纯图谱降级：
  - [x] 同义词展开。
  - [x] triggerKeywords 匹配。
  - [x] 对象匹配。
  - [x] 动作匹配。
  - [x] 分数超过阈值才输出候选，否则 unsupported。

验收：

- [x] LLM 不可用时 P0 降级覆盖率达到方案指标。
- [x] 缓存命中不绕过权限和运行时 PolicyGateway。

---

## 7. M3 能力映射层

目标：把“用户在问什么”和“系统能做什么”拆开，最终能力选择只认 Active Manifest。

### T3.1 CapabilityMappingService

- [x] 新增 `AgentV2CapabilityMappingService`。
- [x] 输入：
  - [x] `StructuredIntent`
  - [x] Active Manifest 列表。
  - [x] actor / store / entrypoint。
- [x] 匹配流程：
  - [x] 读取 LLM 候选能力。
  - [x] 校验 Manifest 存在。
  - [x] 校验 `status=published` 且 `enabled=true`。
  - [x] 校验 `negativeExamples`。
  - [x] 校验 `outputKinds` 与用户问题形态。
  - [x] 输出 selected capability 或 unsupported。
- [x] 输出 trace：
  - [x] 候选列表。
  - [x] 排除原因。
  - [x] 最终选择原因。

验收：

- [x] LLM 猜出不存在的 capability 时不能执行。
- [x] Manifest disabled 能力不能被命中。
- [x] 负例命中时必须排除。

### T3.2 替换正则决策服务

- [x] 将 `AgentV2RuntimeService` 的能力选择切到：
  - [x] 图谱预处理。
  - [x] LLM 意图抽取。
  - [x] Manifest 映射。
- [x] 保留旧 `AgentV2CapabilityDecisionService` 作为短期 fallback 或测试对照。
- [x] 新增环境开关：
  - [x] `AGENT_INTENT_ENGINE=legacy_regex|kg_llm|shadow`
  - [x] `AGENT_INTENT_SHADOW_COMPARE=true|false`
  - [x] `AGENT_V2_GRAY_MODE=legacy_regex|shadow|kg_llm_preferred|kg_llm_only|legacy_retired`
- [x] shadow 模式下用户仍走旧结果，但记录新架构匹配结果。
- [x] 非生产环境无显式灰度配置时默认进入 `kg_llm_preferred`，保留旧链路回退。
- [x] 生产或未知环境无显式灰度配置时仍默认 `legacy_regex`，避免代码合并直接切生产流量。

验收：

- [x] `kg_llm` 模式不再进入 33 个 `isXxx` 正则。
- [x] `shadow` 模式不影响用户答案，但能生成对比审计。
- [x] 可一键回退到 legacy regex。

---

## 8. M4 Schema-Driven 通用查询引擎

目标：新增业务对象后，通过 Manifest 声明 `sourceModel` 和 `outputKinds` 即可查询，不为每个能力手写查询服务。

### T4.1 GenericQueryEngine 核心

- [x] 新增 `packages/server-v2/src/agent-v2/query-engine`
- [x] 新增 `GenericQueryEngineService`。
- [x] 支持：
  - [x] `record.query`
  - [x] `metric.query`
  - [x] `trend.query`
  - [x] `detail.query`
  - [x] `action.draft`
  - [x] `navigation.open`
- [x] 输入：
  - [x] Manifest executor。
  - [x] `sourceModels`。
  - [x] 图谱 FK 关系。
  - [x] 时间范围。
  - [x] store scope。
  - [x] actor 权限。
  - [x] field policies。
- [x] 输出：
  - [x] `items`
  - [x] `metrics`
  - [x] `chart`
  - [x] `actionDraft`
  - [x] `navigation`
  - [x] `evidence`

验收：

- [x] 能用 Manifest 查询列表、指标、趋势、详情。
- [x] 所有输出都包含 evidence。
- [x] 查询默认受 `storeId` 限制。

### T4.2 Prisma 动态查询构造

- [x] 从 `sourceModel` 确定主表。
- [x] 从图谱 `FK_RELATION` 找 join 路径。
- [x] 从 `displayFields` 生成 select 字段。
- [x] 从用户问题和时间词生成 where。
- [x] 从 Manifest 限定 orderBy、take、aggregation。
- [x] 限制最大行数，避免全表扫描。
- [x] 输出 query trace，供治理中心展示。

验收：

- [x] 没有明确 where 时使用安全默认范围。
- [x] 最大查询行数受配置限制。
- [x] 动态查询失败能给出 `needs_development` 或 `query_plan_failed`。

### T4.3 工具层迁移

- [x] 让现有 `agent-v2/tools` 逐步改为 GenericQueryEngine adapter。
- [x] 第一批迁移：
  - [x] 商品订单记录。
  - [x] 项目订单记录。
  - [x] 次卡订单记录。
  - [x] 次卡核销记录。
  - [x] 客户消费记录。
  - [x] 日结指标。
  - [x] 支付方式拆分。
  - [x] 库存报废记录。
  - [x] 库存临期风险。
- [x] 保留专用工具只处理确实复杂的业务逻辑，并在 Manifest 标记 `executor.type=custom_service`。

验收：

- [x] 第一批已迁移 P0 能力在通用引擎下通过原有单测。
- [x] 专用工具数量可统计，新增专用工具必须说明原因。

进度记录（2026-07-06 05:35）：

- 按“生产配置预留、当前本地闭环”完成 T4.3 专用工具治理标记：Manifest 新增 `executor.type=custom_service` 和 `customServiceReason`，运行时工具名仍保持 `business.metric.query` / `business.record.query`，不改变当前问数入口。
- 已标记复杂经营口径：库存健康、收银流水、员工提成/人效、商品/项目/整体毛利、次卡销售、支付手续费、优惠券核销、客户券状态、次卡余量、折扣风险、免费/付费次卡对比、财务风险诊断、多域摘要、提成成本优化等。
- `CapabilityCenter` 已能保留专用服务原因，缺少 `customServiceReason` 的 `custom_service` 会进入审核阻断；草稿列表统计新增 `byExecutorType` 和 `customServiceTotal`。
- `listAgentV2CustomServiceManifests()` 可统计专用服务清单；单测已锁定“专用服务必须有原因、通用查询能力不误标为专用服务”。
- 已验证：`npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/capability/agent-v2-capability-decision.service.spec.ts src/agent-v2/capability-center/agent-v2-capability-center.service.spec.ts --runInBand`，2 个测试套件、48 个用例通过。
- 已验证：`npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/query-engine/generic-query-engine.service.spec.ts src/agent-v2/tools/agent-v2-business-record-query.service.spec.ts src/agent-v2/tools/agent-v2-business-metric-query.service.spec.ts src/agent-v2/tools/agent-v2-business-trend-query.service.spec.ts src/agent-v2/tools/agent-v2-business-detail-query.service.spec.ts --runInBand`，5 个测试套件、51 个用例通过。
- 已验证：`npm.cmd --prefix packages/server-v2 run build` 通过。

进度记录（2026-07-06 05:56）：

- 已按当前代码证据同步 T4.1：`GenericQueryEngineService` 已支持 `record.query`、`metric.query`、`trend.query`、`detail.query`，并通过工具层 adapter 接入记录、指标、趋势和详情查询。
- 本轮新增缺门店上下文防御测试：`storeScope=required` 且运行时缺少 `storeId` 时不查库，返回 `query_plan_failed`，evidence 标记 `storeScope=required` / `storeId=missing`。
- T4.2 当时仍保留缺口：当前是 Manifest/queryKey 驱动的一批通用适配器，不是任意 Prisma model + 图谱 FK + displayFields 的完全自动查询构造；后续已补图谱 FK 动态路径、Manifest `queryPlan`、以及自动发布语义 queryKey 的动态记录执行，当前本地闭环见 05:42 和 07:55 记录。
- 已验证：`npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/query-engine/generic-query-engine.service.spec.ts src/agent-v2/tools/agent-v2-business-record-query.service.spec.ts src/agent-v2/tools/agent-v2-business-trend-query.service.spec.ts src/agent-v2/tools/agent-v2-business-detail-query.service.spec.ts --runInBand`，4 个测试套件、30 个用例通过。

进度记录（2026-07-06 05:15）：

- 本轮按“生产配置预留、当前本地闭环”继续补齐 T4.2 的保守动态查询能力，不配置生产 hook、Secrets、token 或生产环境变量。
- `GenericQueryEngineService` 新增显式 `generic.record.query` fallback：只有低风险、`auto_publish`、`business.record.query` 且 Manifest 明确声明 `queryKey=generic.record.query` 时才启用，不会让现有未迁移能力误走通用查询。
- 动态查询会从 `sourceModels[0]` 推导 Prisma delegate，从 Manifest 字段策略生成 `select`，按 `storeScope` 加门店过滤，未传时间条件时默认使用近 30 天安全范围，并输出 `queryTrace/sqlSummary`。
- 常见门店 FK 路径已做保守映射：如 `PaymentRecord -> order.storeId`、`RefundRecord -> order.storeId`、`CustomerCard -> customer.storeId`、`ConsumptionRecord -> customer.storeId`；任意图谱 FK join 仍不宣称完成。
- 找不到 Prisma delegate 时返回 `needs_development`，不回退成无约束查询。
- 已验证：`npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/query-engine/generic-query-engine.service.spec.ts src/agent-v2/tools/agent-v2-business-record-query.service.spec.ts src/agent-v2/tools/agent-v2-business-metric-query.service.spec.ts src/agent-v2/tools/agent-v2-business-trend-query.service.spec.ts src/agent-v2/tools/agent-v2-business-detail-query.service.spec.ts --runInBand`，5 个测试套件、51 个用例通过。
- 已验证：`npm.cmd --prefix packages/server-v2 run build` 通过。

进度记录（2026-07-06 05:42）：

- M4.2 动态查询继续补齐：`generic.record.query` 现在会从生成的知识图谱 `FK_RELATION` 推导门店过滤路径，例如 `OrderItem.order -> ProductOrder.store -> Store`，不再只依赖固定表名白名单。
- 当上游未传 `timeRange` 时，动态查询会从用户问题中的“今天/昨天/本周/本月/近 N 天”等时间词生成 where；没有明确时间时仍使用安全默认范围。
- Manifest 新增可选 `queryPlan`，动态查询会按 `dateField`、`orderBy`、`take` 和简单 `aggregation` 生成查询计划；返回的 `queryTrace` 会展示 `graphRelationPath`、`orderBy`、`aggregation` 和 SQL 摘要。
- 已新增 `OrderItem` 动态查询单测，验证图谱 FK 路径、口语时间词、Manifest 排序/行数/聚合同时生效；这是本地通用查询闭环，不涉及生产 hook、Secrets 或生产 DB。
- 已验证：`npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/query-engine/generic-query-engine.service.spec.ts --runInBand`，1 个测试套件、17 个用例通过。
- 已验证：`npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/query-engine/generic-query-engine.service.spec.ts src/agent-v2/tools/agent-v2-business-record-query.service.spec.ts src/agent-v2/tools/agent-v2-business-metric-query.service.spec.ts src/agent-v2/tools/agent-v2-business-trend-query.service.spec.ts src/agent-v2/tools/agent-v2-business-detail-query.service.spec.ts --runInBand`，5 个测试套件、52 个用例通过。
- 已验证：`npm.cmd --prefix packages/server-v2 run build` 通过。

进度记录（2026-07-06 05:27）：

- `AgentToolExecutionContext` 新增可选 `permissions`，主运行链路由 `AgentV2OrchestratorService` 从 `AgentActor.permissions` 透传到工具执行上下文。
- `GenericQueryEngine` 的 `queryTrace` 新增 `permissionCheck`，记录 Manifest 所需权限、actor 已覆盖权限、缺失权限、是否 `*` 通配和 allowed 判断。
- 通用查询 filters 同步追加权限摘要，例如 `permission=core:order:products`、`permission=*` 或 `permission_missing=...`，便于治理中心回放时解释查询权限输入。
- 已验证：`npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/query-engine/generic-query-engine.service.spec.ts src/agent-v2/tools/agent-v2-business-record-query.service.spec.ts src/agent-v2/tools/agent-v2-business-metric-query.service.spec.ts src/agent-v2/tools/agent-v2-business-trend-query.service.spec.ts src/agent-v2/tools/agent-v2-business-detail-query.service.spec.ts src/agent-v2/agent-v2-orchestrator.service.spec.ts --runInBand`，6 个测试套件、53 个用例通过。
- 已验证：`npm.cmd --prefix packages/server-v2 run build` 通过。

---

## 9. M5 安全、证据和契约强化

目标：即使意图识别错了，也不能越权、写入或泄露敏感字段。

### T5.1 PolicyGateway 扩展

- [x] `AgentV2PolicyGatewayService` 增加发布状态校验。
- [x] 角色准入：`actor.role` 必须匹配 `personaCodes`。
- [x] 权限准入：`actor.permissions` 必须覆盖 `permissionCodes`。
- [x] 门店隔离：`storeScope=required` 时必须有合法 `storeId`。
- [x] 风险拦截：
  - [x] `auto_publish` 只允许低风险只读或草稿。
  - [x] `approval_required` 必须生成审批或确认。
  - [x] `write_blocked` 运行时直接拒绝。
- [x] 字段策略：`allow/mask/deny` 在进入 LLM 和返回前都执行。

验收：

- [x] 没有财务权限不能看财务指标。
- [x] 没有当前门店 scope 不能查询门店数据。
- [x] 高风险写入不会因为 LLM 识别为查询而执行。

### T5.2 EvidenceService 标准化

- [x] 统一 evidence 字段：
  - [x] `sourceModels`
  - [x] `sourceApis`
  - [x] `filters`
  - [x] `timeRange`
  - [x] `storeScope`
  - [x] `fieldPolicyApplied`
  - [x] `sampleSize`
  - [x] `limitations`
  - [x] `queryTraceId`
- [x] 所有工具执行必须返回 evidence。
- [x] 输出 blocks 必须关联 evidence。

验收：

- [x] 数字、表格、图表都能追溯来源。
- [x] 没 evidence 的回答不能通过 contract。

### T5.3 ContractValidator 数据驱动

- [x] 按 `outputKinds` 校验：
  - [x] `table` 必须有 `items[]`。
  - [x] `kpi` 必须有 `metrics`。
  - [x] `chart` 必须有 `chart`。
  - [x] `action_card` 必须有 `actionDraft`。
  - [x] `evidence_panel` 必须有 evidence。
- [x] 形态不符时：
  - [x] 排除当前能力重试一次。
  - [x] 仍失败则拦截，记录 `contract_failed`。

验收：

- [x] 问“有哪些”不能只返回文字摘要。
- [x] 问“趋势”必须返回 chart 数据。
- [x] 问“帮我操作”只能返回草稿或审批，不直接执行。

进度记录（2026-07-06 06:45）：

- 本轮按“生产配置后置、当前本地闭环”执行，只补本地策略、证据和契约链路；未配置生产 API hook URL、GitHub Secrets、生产 token 或生产环境变量，也未执行生产 DB migration。
- `AgentV2PolicyGatewayService` 已补强 `auto_publish` 风险边界：高风险工具或疑似直接写入能力不会按自动发布执行；只读查询执行器不再因“退款/核销”等统计口径被误判为写入。
- `AgentEvidence`、`AgentV2PolicyGatewayService`、`AgentV2EvidenceService` 已统一补齐 `sourceModels/sourceApis/timeRange/storeScope/fieldPolicyApplied/queryTraceId` 等治理字段；缺 evidence 的工具结果会由 PolicyGateway 生成授权证据兜底。
- 新增 `AgentV2OrchestratorService` 契约失败测试：首次 contract 失败会携带 `agentV2ContractRetry.excludedCapabilityIds` 排除当前能力并重试；无法重试时返回拦截回答并记录 `contract_failed` 形态。
- 已验证：`npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/agent-v2-orchestrator.service.spec.ts src/agent-v2/policy/agent-v2-policy-gateway.service.spec.ts src/agent-v2/evidence/agent-v2-evidence.service.spec.ts src/agent-v2/contracts/agent-v2-answer-contract-validator.service.spec.ts --runInBand`，4 个测试套件、22 个用例通过。
- 已验证：`npm.cmd --prefix packages/server-v2 run build` 通过。

---

## 10. M6 全自动能力发布流水线

目标：管理端/后端变更后，低风险能力能自动进入候选、门禁、发布、热加载。

### T6.1 AutoPublishService

- [x] 新增 `AgentAutoPublishService`。
- [x] 触发来源：
  - [x] CI deploy hook。
  - [x] Cron 每日 03:00。
  - [x] 管理端手动触发。
- [x] 扫描模式：
  - [x] 全量扫描。
  - [x] git diff 增量扫描。
  - [x] hash 对比增量扫描。
- [x] 输出：
  - [x] 新增候选。
  - [x] 更新候选。
  - [x] 废弃候选。
  - [x] 自动发布数量。
  - [x] 阻断原因。

验收：

- [x] 同一能力重复扫描不会生成重复候选。
- [x] 管理端能看到每次 pipeline 日志。

### T6.2 自动分类规则

- [x] GET 查询接口默认进入 `auto_publish` 候选，但必须过权限、DTO、dry-run、字段策略和评测。
- [x] 导航跳转进入 `auto_publish` 候选。
- [x] 指标和诊断进入 `auto_publish` 候选。
- [x] 动作草稿进入 `approval_required`。
- [x] 写入、删除、发券、下发进入 `write_blocked`。
- [x] 无明确权限码进入 `needs_review`。
- [x] queryKey 未实现进入 `needs_development`。

验收：

- [x] 高风险接口不会自动发布。
- [x] 权限推断候选不会自动发布。

### T6.3 Runtime 热加载

- [x] Active Manifest 发布后生成新版本。
- [x] Runtime 监听 Manifest 版本变化或按 TTL 刷新。
- [x] 刷新失败时继续使用上一版 active Manifest。
- [x] 支持回滚版本。

验收：

- [x] 发布后无需重启即可命中新能力。
- [x] 回滚后 Runtime 使用旧版本。
- [x] Manifest 版本错误不会导致 Agent 全量不可用。

进度记录（2026-07-06 07:00）：

- 本轮只完成本地自动发布闭环：保留 deploy hook endpoint、guard、CI workflow 条件和环境变量位，但未配置生产 API hook URL、GitHub Secrets、生产 token，也未触发生产 hook。
- `AgentV2AutoPublishService` 已覆盖 manual / cron / deploy_hook 三类触发、full / git_diff / hash 三种扫描、pipeline 日志、候选导入、自动发布、发布后 smoke、阻断原因和 deprecated 候选计数。
- `AgentV2CapabilityCenterService` 已增加本地兜底自动分类：GET/查询/导航/指标默认 `auto_publish`，动作草稿进入 `approval_required`，写入/删除/发券/下发进入 `write_blocked`，缺权限进入 `needs_review`，缺 queryKey 进入 `needs_development`。
- `AgentV2ManifestProviderService` 已支持 TTL 后台刷新，发布/激活版本后刷新 active manifest，DB 刷新失败时继续使用上一版 active Manifest；工具层已改为优先读取 Active ManifestProvider，避免发布后不重启却找不到动态 Manifest 的问题。
- 已验证：`npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/capability-center/agent-v2-manifest-provider.service.spec.ts src/agent-v2/capability-center/agent-v2-auto-publish.service.spec.ts src/agent-v2/capability-center/agent-v2-capability-center.service.spec.ts src/agent-v2/capability-center/agent-v2-deploy-hook.guard.spec.ts src/agent-v2/tools/agent-v2-business-record-query.service.spec.ts --runInBand`，5 个测试套件、30 个用例通过。
- 已验证：`npm.cmd --prefix packages/server-v2 run build` 通过。

---

## 11. M7 评测门禁改造

目标：把 650 题题库从脚本报告升级为能力发布和架构替换的强门禁。

### T7.1 题库结构化

- [x] 解析 `agent-eval-questions.md`。
- [x] 为每题绑定：
  - [x] priority：P0/P1/P2/P3。
  - [x] expectedCapabilityId。
  - [x] expectedObjects。
  - [x] expectedOutputKinds。
  - [x] evidenceRequired。
  - [x] permissionProfile。
  - [x] unsupportedAllowed。

验收：

- [x] 650 题能在评测中心分页查看。
- [x] 每条题能追溯到能力、对象、输出形态和证据要求。

进度记录（2026-07-06 07:18）：

- `AgentV2GovernanceService.evalCases` 已合并 `AgentEvalCase` 持久题和 `agent-v2-eval-drafts.json` 草稿题，支持分页和 priority 过滤。
- 评测题统一补齐 `expectedObjects`、`expectedOutputKinds`、`evidenceRequired`、`permissionProfile`、`unsupportedAllowed`；老数据缺字段时按 capabilityId、permissionResult、failureCategory 做可解释派生，不需要生产配置。
- 手工新增/更新评测题也支持写入上述结构化字段，保存在 `AgentEvalCase.expectedOutcome`。
- 已验证：`npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/governance/agent-v2-governance.service.spec.ts --runInBand`，27 个用例通过。
- 已验证：`npm.cmd --prefix packages/server-v2 run build` 通过。

### T7.2 strict gate 指标

- [x] P0 正确率 >= 98%，103 题最多 2 题走降级。
- [x] P0 一致性 >= 97%，同一问题 5 次结果稳定。
- [x] 互斥正确率 = 100%。
- [x] LLM 降级覆盖 P0 >= 85%。
- [x] 延迟 P99 <= 800ms。
- [x] 缓存命中率 >= 50%。
- [x] 高风险自动执行 = 0。
- [x] 越权证据 = 0。

验收：

- [x] `agent-v2:eval-gate:strict` 能输出上述指标。
- [x] 任一 P0 阻断项失败时，自动发布失败。

### T7.3 CI 接入

- [x] 更新 `.github/workflows/agent-v2.yml`。
- [x] CI 步骤：
  - [x] `kg:generate`
  - [x] 图谱校验。
  - [x] 能力扫描。
  - [x] Manifest validate。
  - [x] Eval gate strict。
  - [x] 能力中心 DTO 校验单测。
  - [x] 旧正则 P0 差异归因。
  - [x] 旧正则退役本地预检。
  - [x] 旧正则依赖边界审计。
  - [x] 本地回滚演练。
  - [x] 生产配置预留 readiness 检查。
  - [x] 旧正则退役交接包。
  - [x] 本地完成度审计。
  - [x] 生产灰度 runbook。
  - [x] 生产证据契约检查。
  - [x] `server-v2` build。
- [x] PR 摘要输出：
  - [x] 新增能力。
  - [x] 自动发布数量。
  - [x] 阻断候选。
  - [x] P0 通过率。
  - [x] 旧正则依赖边界审计。
  - [x] 本地回滚演练。
  - [x] 生产配置预留 readiness。
  - [x] 旧正则退役交接包。
  - [x] 本地完成度审计。
  - [x] 生产灰度 runbook。

验收：

- [x] CI 失败能定位到具体能力、题目、权限或字段。

进度记录（2026-07-06 04:18）：

- 已在 `.github/workflows/agent-v2.yml` 补齐 `kg:generate:strict`、能力扫描、Manifest validate、strict eval gate、`server-v2` build 和 GitHub Step Summary。
- Step Summary 只读取本地生成报告，输出候选能力数、自动发布候选、阻断候选、P0 通过率、延迟、缓存命中率、越权证据和定位文件。
- 生产 auto-publish hook 保持条件触发：没有 `AGENT_V2_DEPLOY_HOOK_URL` 和 `AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN` 时不会执行；当前阶段只预留后续配置，不接生产。

进度记录（2026-07-06 07:05）：

- CI `Run Agent V2 unit tests` 已纳入 `agent-v2-capability-center.dto.spec.ts`，覆盖能力中心入口 DTO 的白名单、枚举、数字/布尔转换、deploy hook 边界和发布 payload 校验。
- CI strict eval 后新增 `agent-v2:legacy-diff-attribution`、`agent-v2:legacy-retirement-preflight:local`、`agent-v2:legacy-retirement-evidence`，把旧正则退役的本地安全门禁和生产证据契约纳入 Agent V2 Gate。
- GitHub Step Summary 新增 legacy retirement local preflight、retirement ready、production evidence blockers，并链接到 `agent-v2-legacy-retirement-preflight.json` 和 `agent-v2-legacy-retirement-production-evidence-check.json`。
- 生产 hook 仍保持条件触发；没有 `AGENT_V2_DEPLOY_HOOK_URL` / `AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN` 时不会执行，不影响当前本地闭环。

进度记录（2026-07-06 07:35）：

- 新增 `agent-v2:production-config-readiness` / `agent-v2:production-config-readiness:strict`，只读检查 `.env.example`、`.env.production.example`、GitHub workflow、deploy hook guard、灰度策略和治理保存门禁。
- CI 在生产证据契约检查前执行 production config readiness，GitHub Step Summary 新增 production config readiness 状态、阻塞数和报告定位。
- 该门禁只证明生产 URL/token/Secrets/env 的后续配置入口已安全预留；不会连接生产库、不会调用生产 API、不会触发 deploy hook，也不代表生产 shadow 或旧正则退役完成。

进度记录（2026-07-06 07:52）：

- 新增 `agent-v2:retirement-handoff` / `agent-v2:retirement-handoff:strict`，聚合 strict gate、差异归因、依赖审计、回滚演练、生产配置 readiness、退役预检和生产证据校验。
- CI 已接入该严格检查，GitHub Step Summary 新增 retirement handoff ready、本地就绪、生产就绪、阻塞数和报告定位。
- 交接包结论明确区分：`handoffReady=true`、`localReady=true`、`productionReady=false`；当前只代表本地交接就绪，不代表旧正则可删或生产可切 `legacy_retired`。

进度记录（2026-07-06 08:00）：

- 新增 `agent-v2:local-completion-audit` / `agent-v2:local-completion-audit:strict`，自动扫描本 `task.md` 的剩余未勾选项。
- 审计会读取 strict eval、差异归因、旧正则依赖审计、回滚演练、生产配置 readiness、退役预检、生产证据校验和退役交接包报告。
- CI 已接入该严格检查，GitHub Step Summary 新增 local completion audit、本地未收口项和报告定位。
- 当前审计结论：`localClosureReady=true`、`productionReady=false`、剩余未勾选项 31 个、本地未收口项 0 个；31 个均属于生产/真实流量/旧正则最终退役后置项。

进度记录（2026-07-06 08:08）：

- 新增 `agent-v2:production-rollout-plan` / `agent-v2:production-rollout-plan:strict`，生成生产灰度与旧正则退役 runbook。
- 新增报告：
  - `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-production-rollout-plan.json`
  - `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-production-rollout-plan.md`
- Runbook 阶段覆盖 D-1 本地基线、D0 生产配置、D1-D7 shadow 观察、D8 证据聚合、D8 证据校验、D9 旧正则退役审批。
- CI 已接入该严格检查，GitHub Step Summary 新增 production rollout runbook、production execution allowed 和报告定位。
- 当前 runbook 结论：`rolloutPlanReady=true`、`localPrerequisitesReady=true`、`productionExecutionAllowed=false`、`productionReady=false`、`productionStillBlocked=true`；当前只代表生产执行计划就绪，不代表可以直接执行生产或删除旧正则。

---

## 12. M8 Agent 治理后端

目标：提供治理中心所需 API，把运行审计、图谱治理、能力治理、评测和调试统一到 `/api/agent-governance`。

### T8.1 数据模型

- [x] 新增或扩展 Prisma model：
  - [x] `AgentRunAuditDetail`
  - [x] `AgentEvalRun`
  - [x] `AgentEvalCaseResult`
  - [x] `AgentKgSynonymOverride`（复用 `AgentKnowledgeGraphOverride`，`overrideType=synonym`）
  - [x] `AgentKgExcludeOverride`（复用 `AgentKnowledgeGraphOverride`，`overrideType=exclude`）
  - [x] `AgentAutoPublishLog`
  - [x] `AgentHealthMetric`
- [x] 如已有能力中心表，优先复用：
  - [x] `AgentCapabilityDraft`
  - [x] `AgentCapabilityManifestVersion`
  - [x] `AgentCapabilityManifestItem`
  - [x] `AgentCapabilityPublishRun`
  - [x] `AgentToolQueryKeyRegistry`

验收：

- [x] 每次 Agent run 都能保存图谱上下文、LLM 输入输出、能力映射、Policy、工具、契约、延迟分解。
- [x] 治理数据表有索引，支持按门店、时间、能力、状态查询。

### T8.2 运行审计 API

- [x] `GET /api/agent-governance/runs`
- [x] `GET /api/agent-governance/runs/:id/detail`
- [x] `GET /api/agent-governance/runs/stats`
- [x] `GET /api/agent-governance/runs/failures`
- [x] `GET /api/agent-governance/runs/uncovered-top`

验收：

- [x] 能看运行列表、单次详情、失败聚合、高频未覆盖问法。

### T8.3 知识图谱治理 API

- [x] `GET /api/agent-governance/knowledge-graph/summary`
- [x] `GET /api/agent-governance/knowledge-graph/nodes`
- [x] `GET /api/agent-governance/knowledge-graph/nodes/:id`
- [x] `GET /api/agent-governance/knowledge-graph/synonyms`
- [x] `POST /api/agent-governance/knowledge-graph/synonyms`
- [x] `DELETE /api/agent-governance/knowledge-graph/synonyms/:id`
- [x] `GET /api/agent-governance/knowledge-graph/excludes`
- [x] `POST /api/agent-governance/knowledge-graph/excludes`
- [x] `GET /api/agent-governance/knowledge-graph/gaps`
- [x] `GET /api/agent-governance/knowledge-graph/visualize`
- [x] `POST /api/agent-governance/knowledge-graph/path`

验收：

- [x] 管理员能维护人工同义词和互斥覆盖。
- [x] 新增覆盖不会直接污染 code_generated 图谱，必须进入下次生成合并。

### T8.4 能力治理 API

- [x] `GET /api/agent-governance/capabilities/health`
- [x] `GET /api/agent-governance/capabilities/heat-map`
- [x] `GET /api/agent-governance/auto-publish/logs`
- [x] `GET /api/agent-governance/auto-publish/logs/:id`
- [x] 复用或代理能力中心草案、发布、版本、dry-run、eval gate API。

验收：

- [x] 能看到 active 能力数、领域分布、命中热度、冷能力、契约失败率。

进度记录（2026-07-06 04:42）：

- 新增 `AgentRunAuditDetail`、`AgentEvalCaseResult`、`AgentAutoPublishLog`、`AgentHealthMetric` Prisma model 和本地 migration `20260706043000_agent_governance_observability`。
- 图谱同义词与互斥覆盖不再重复建表，统一复用 `AgentKnowledgeGraphOverride`，通过 `overrideType=synonym/exclude` 区分。
- `AgentV2OrchestratorService` 已在计划、等待审批、完成、契约失败、未命中能力时非阻断 upsert 审计详情；写入失败只记录 warning，不影响用户问答。
- 已验证：`prisma validate`、`db:generate`、`server-v2 build`、`agent-v2-governance.service.spec.ts` 全部通过。

### T8.5 评测和调试 API

- [x] `GET /api/agent-governance/eval/cases`
- [x] `POST /api/agent-governance/eval/cases`
- [x] `PATCH /api/agent-governance/eval/cases/:id`
- [x] `POST /api/agent-governance/eval/runs`
- [x] `POST /api/agent-governance/eval/runs/dry-run-batch`
- [x] `GET /api/agent-governance/eval/runs`
- [x] `GET /api/agent-governance/eval/runs/:id`
- [x] `GET /api/agent-governance/eval/runs/:id/failures`
- [x] `POST /api/agent-governance/eval/runs/:id/failures/replay`
- [x] `POST /api/agent-governance/eval/runs/:id/failures/replay` 支持 `toolReplay=true` 只读工具回放白名单。
- [x] `toolReplay=true` 时返回 `contractReplay`，包含基础 blocks、Contract 校验和 phaseOutputs。
- [x] `POST /api/agent-governance/debug/execute`
- [x] `POST /api/agent-governance/debug/compare`
- [x] `POST /api/agent-governance/debug/simulate-manifest`

验收：

- [x] 可单题调试、批量评测、失败回放、Manifest 模拟。
- [x] 治理中心评测历史可查看失败样例，并对单条失败执行 dry-run 回放。
- [x] 失败样例可选执行只读工具回放；仅允许低风险、无需审批、白名单工具，写入动作跳过。
- [x] 失败样例只读工具结果可进入基础 Contract 和 blocks 渲染回放。
- [x] debug 执行不写入生产业务数据。

---

## 13. M9 Agent 治理前端

目标：在管理端新增“系统设置 / Agent 治理中心”，让产品、测试、研发能看懂并处理 Agent 问题。

### T9.1 API 和类型

- [x] 新增 `src/types/agentGovernance.ts`
- [x] 新增 `src/api/agentGovernance.ts`
- [x] 新增 `src/api/real/agentGovernance.ts`
- [x] 从 `src/api/index.ts` 导出。

验收：

- [x] API facade、real API、类型定义一致。
- [x] 不新增 mock 作为真实业务兜底。

### T9.2 路由和权限

- [x] 新增路由：
  - [x] `/system/agent-governance`
  - [x] `/system/agent-governance/runs`
  - [x] `/system/agent-governance/runs/:id`
  - [x] `/system/agent-governance/knowledge-graph`
  - [x] `/system/agent-governance/knowledge-graph/visualize`
  - [x] `/system/agent-governance/knowledge-graph/synonyms`
  - [x] `/system/agent-governance/capabilities`
  - [x] `/system/agent-governance/auto-publish`
  - [x] `/system/agent-governance/eval`
  - [x] `/system/agent-governance/debug`
- [x] 新增权限码：
  - [x] `core:agent-governance:view`
  - [x] `core:agent-governance:manage`

验收：

- [x] `super_admin` 可见全部页面。
- [x] 无管理权限角色不可访问调试和同义词修改。

进度记录（2026-07-06 05:03）：

- 已在 `src/app/routes.tsx` 增加 Agent 治理中心子路由，全部复用 `AgentGovernanceCenter` 和 `core:agent-governance:view`。
- `AgentGovernanceCenter` 已支持按 URL 自动切换 tab，tab 切换会同步到对应子路径；`/runs/:id` 会直达运行审计并打开详情。
- 已验证：`AgentGovernanceCenter.test.tsx` 7 个用例通过，`npm.cmd run build` 通过。

### T9.3 页面组件

- [x] 治理中心首页：
  - [x] 运行量、成功率、P99、成本、缓存命中、P0 门禁状态。
  - [x] 高频失败、待审核能力、图谱缺口。
- [x] 运行审计：
  - [x] 列表筛选。
  - [x] 单次详情。
  - [x] 意图追溯。
  - [x] 工具执行链路。
  - [x] 证据包。
  - [x] 延迟分解。
- [x] 知识图谱治理：
  - [x] 图谱总览。
  - [x] 节点浏览。
  - [x] 同义词治理。
  - [x] 互斥关系。
  - [x] 缺口告警。
- [x] 能力治理：
  - [x] 候选池入口。
  - [x] Manifest 版本。
  - [x] 自动发布日志。
  - [x] queryKey 注册表。
  - [x] 能力健康看板。
- [x] 评测中心：
  - [x] 题库。
  - [x] 运行历史。
  - [x] 失败样例回放。
  - [x] 只读工具回放结果。
  - [x] 契约与渲染回放结果。
  - [x] CI 门禁状态。
- [x] 可视化调试：
  - [x] 实时问答调试。
  - [x] 对比模式。
  - [x] Manifest 模拟。

验收：

- [x] 首屏不能长时间空白，列表必须有 skeleton 或渐进加载。
- [x] 产品经理能从失败问法直接定位到“图谱缺口 / 能力缺失 / 权限拒绝 / 契约失败 / LLM 错误”。

进度记录（2026-07-06 05:16）：

- `GET /api/agent-governance/health` 已补 `cost` 成本观测汇总，优先读取运行审计中的 token / 字符 / 金额 trace。
- 治理中心总览已展示成本观测、待审核能力和图谱缺口；宽屏下右侧栏固定展示自动发布近况与治理待办。
- 已验证：`agent-v2-governance.service.spec.ts`、`AgentGovernanceCenter.test.tsx`、`server-v2 build`、管理端 `npm.cmd run build` 均通过。

进度记录（2026-07-06 05:24）：

- 治理中心 `能力治理` tab 已接入本地能力中心只读数据：候选池统计、当前/历史 Manifest 版本、QueryKey 注册表、能力健康分布和自动发布日志。
- 候选池入口保留跳转到 `/system/agent-capabilities`，支持继续做导入草稿、审核、dry-run、发布后 smoke；生产 API hook URL / token 不作为当前闭环依赖，后续生产域名稳定后再配置 GitHub Secrets / 后端环境变量。
- 已验证：`npx.cmd vitest run src/app/pages/system/AgentGovernanceCenter.test.tsx` 8 个用例通过，`npm.cmd run build` 通过。

进度记录（2026-07-06 05:35）：

- 运行审计详情已从原始 JSON 展示升级为结构化链路面板：运行链路摘要、意图追溯、Manifest 映射、Policy、工具执行链路、查询证据包、证据审计、契约渲染和延迟分解。
- 列表筛选保留 runNo / 用户问题关键词和状态筛选；单次详情支持从运行列表或 `/system/agent-governance/runs/:id` 直达。
- 已验证：`npx.cmd vitest run src/app/pages/system/AgentGovernanceCenter.test.tsx` 8 个用例通过，`npm.cmd run build` 通过。

进度记录（2026-07-06 05:42）：

- 运行审计列表和详情新增 `失败定位`：根据状态、错误、plan/result/evidence/replay 直接标注正常、图谱缺口、能力缺失、权限拒绝、契约失败、LLM 错误或待分析。
- 首屏和列表保持渐进加载：总览先展示指标容器与占位值，运行审计、图谱、能力治理、评测等列表在加载中显示对应空态文案，不出现长时间空白。
- 本地授权入口已验证：权限目录包含 `core:agent-governance:view/manage`，系统菜单有治理台和能力中心，路由使用 `core:agent-governance:view` 守卫；这不等同于生产给管理员授予权限，生产授权仍后置。
- 已验证：`npx.cmd vitest run src/app/pages/system/AgentGovernanceCenter.test.tsx` 8 个用例通过，`npm.cmd run build` 通过，`npx.cmd vitest run src/test/permissions.test.ts` 13 个用例通过。

---

## 14. M10 可视化调试器

目标：把一次问答拆成可复盘的链路，让研发不用翻日志也能判断问题在哪层。

### T10.1 调试执行链路

- [x] 输入问题、门店、角色、入口、Manifest 版本。
- [x] 展示：
  - [x] 图谱预处理结果。
  - [x] LLM Prompt。
  - [x] LLM Response。
  - [x] StructuredIntent。
  - [x] Manifest 候选和排除原因。
  - [x] Policy 决策。
  - [x] query plan / SQL 摘要。
  - [x] 工具返回。
  - [x] Contract 校验。
  - [x] 最终 blocks。

验收：

- [x] 调试链路不执行真实写入。
- [x] 敏感字段在调试页面同样脱敏。

### T10.2 对比模式

- [x] 支持对比：
  - [x] 不同 Manifest 版本。
  - [x] 有/无图谱上下文。
  - [x] legacy regex vs kg_llm。
  - [x] 单题 5 次一致性。
- [x] 输出差异：
  - [x] 命中能力差异。
  - [x] 输出形态差异。
  - [x] 证据差异。
  - [x] 延迟和成本差异。

验收：

- [x] 能判断“V2 新架构是否比旧正则更稳”。

### T10.3 Manifest 模拟

- [x] 临时启用/禁用能力。
- [x] 临时修改 triggerKeywords。
- [x] 临时修改 negativeExamples。
- [x] 临时修改 outputKinds。
- [x] 仅调试 session 生效，不污染 active Manifest。

验收：

- [x] 模拟有效后可跳转能力中心正式修改。

---

## 15. M11 图谱可视化

目标：让业务对象、数据模型、字段、能力、权限之间的关系可视化。

### T11.1 图谱组件

- [x] 使用 ECharts 或 D3 实现力导向图。
- [x] 节点按类型着色。
- [x] 边按类型样式区分。
- [x] 支持 2 跳焦点展开。
- [x] 支持节点搜索和过滤。
- [x] 支持起止节点最短路径查询。

验收：

- [x] 选择“Customer”能看到关联模型、字段、能力和权限。
- [x] 选择某个 capability 能看到它依赖的模型、字段、工具和权限。

### T11.2 图谱治理交互

- [x] 从图谱节点进入节点详情。
- [x] 从孤立节点创建缺口告警。
- [x] 从 Word 节点进入同义词治理。
- [x] 从 Capability 节点进入能力中心。

验收：

- [x] 图谱不是纯展示，能推动治理动作。

---

## 16. M12 灰度切换与旧规则退役

目标：新架构通过门禁和运行态验证后，逐步替换旧正则决策，最终删除旧规则服务。

### T12.1 灰度策略

- [x] 策略维度：
  - [x] 全局。
  - [x] 门店。
  - [x] persona。
  - [x] capabilityId。
  - [x] entrypoint：admin / kiosk / api / eval。
- [x] 模式：
  - [x] `legacy_regex`
  - [x] `shadow`
  - [x] `kg_llm_preferred`
  - [x] `kg_llm_only`
  - [x] `legacy_retired`
- [x] 每次命中记录策略和回退原因。

验收：

- [x] 可按门店开启 shadow。
- [x] 可按能力切到新架构优先。
- [x] 可回退旧正则。
- [x] 生产环境 `legacy_retired` 需要 `AGENT_V2_LEGACY_RETIREMENT_CONFIRMED=true`，未确认时自动降级到 `kg_llm_preferred` 保留旧链路回退。
- [x] 治理中心创建 `legacy_retired` 灰度规则也受同一生产确认门禁约束，避免配置层显示已退役但运行时实际降级。

### T12.2 终端与管理端接入

- [x] 管理端 `AmiAgentWorkspace` 默认使用统一入口。
- [x] 管理员 debug 模式可选择引擎。
- [x] Kiosk 快捷操作继续走原流程，不被问数意图识别接管。
- [x] Kiosk 自然语言问答可选择 `kg_llm_preferred`。
- [x] API 调用支持 entrypoint 标记。

验收：

- [x] 管理端和 Kiosk 均能看到 `architecture=kg_llm_agent` 或类似元信息。
- [x] 终端收银、核销等流程型快捷操作不回归。

### T12.3 删除旧 CapabilityDecisionService

- [x] 新增旧正则退役本地预检：
  - [x] 读取 `agent-v2-eval-gate-report.json`。
  - [x] 读取 `agent-v2-legacy-diff-attribution.json`。
  - [x] 预留读取 `agent-v2-legacy-retirement-production-evidence.json`。
  - [x] 输出 `agent-v2-legacy-retirement-preflight.json`。
  - [x] 输出 `agent-v2-legacy-retirement-preflight.md`。
  - [x] 区分本地工程门禁、退役安全门禁和生产证据门禁。
  - [x] 输出生产证据模板 `agent-v2-legacy-retirement-production-evidence.example.json`。
  - [x] 新增生产证据只读校验工具 `agent-v2:legacy-retirement-evidence`。
  - [x] 新增 AgentRun 审计表只读导出工具 `agent-v2:legacy-retirement-shadow-export`。
  - [x] 新增 shadow 审计导出聚合工具 `agent-v2:legacy-retirement-shadow-evidence`。
  - [x] 生产证据门禁要求真实生产来源、非零 shadow/灰度样本、非零有用率样本、LLM 延迟/失败率/成本观测和回滚验证；示例模板或零样本文件不能误放行。
  - [x] 退役预检自身校验 `source.environment=production`、观测窗口、导出人和生成时间，防止绕过生产证据校验器。
- [x] 完成 P0 KG-only vs legacy 差异归因：
  - [x] 输出 `agent-v2-legacy-diff-attribution.json`。
  - [x] 输出 `agent-v2-legacy-diff-attribution.md`。
  - [x] 54 条初始差异已收敛为 21 条，且均为 KG 命中期望、legacy 缺口。
  - [x] KG 待修差异为 0。
- [x] 完成旧正则依赖边界审计：
  - [x] 新增 `agent-v2:legacy-dependency-audit` / `agent-v2:legacy-dependency-audit:strict`。
  - [x] 输出 `agent-v2-legacy-dependency-audit.json`。
  - [x] 输出 `agent-v2-legacy-dependency-audit.md`。
  - [x] 审计 33 个旧 `isXxx` 谓词，限制不再扩张。
  - [x] 审计生产引用仅限 runtime、module 和旧 decision service 自身。
  - [x] 审计 `kg_llm_only` / `legacy_retired` 正式路径返回 KG decision，不返回旧正则 decision。
- [x] 完成本地回滚演练：
  - [x] 新增 `agent-v2:rollback-drill` / `agent-v2:rollback-drill:strict`。
  - [x] 输出 `agent-v2-rollback-drill.json`。
  - [x] 输出 `agent-v2-rollback-drill.md`。
  - [x] 演练生产默认回到 `legacy_regex`。
  - [x] 演练全局环境变量、环境灰度规则、治理表灰度规则均可回退旧链路。
  - [x] 演练 `refreshDbRules()` 后 Runtime 可从 `kg_llm_only` 刷新回 `legacy_regex`。
  - [x] 演练未确认 `legacy_retired` 自动降级，确认后才允许最终退役。
- [x] 完成旧正则退役交接包：
  - [x] 新增 `agent-v2:retirement-handoff` / `agent-v2:retirement-handoff:strict`。
  - [x] 输出 `agent-v2-retirement-handoff.json`。
  - [x] 输出 `agent-v2-retirement-handoff.md`。
  - [x] 聚合 strict gate、差异归因、依赖审计、回滚演练、生产配置 readiness、退役预检和生产证据校验。
  - [x] 明确 `handoffReady=true`、`localReady=true`、`productionReady=false`，避免把本地交接就绪误报为生产退役完成。
- [ ] 当满足退役条件后删除旧正则：
  - [ ] P0 strict gate 连续通过。
  - [ ] shadow 对比 7 天无重大回归。
  - [ ] 线上用户有用率不低于旧链路。
  - [ ] 高风险自动执行为 0。
  - [ ] 可回滚方案已验证。
- [ ] 删除或降级：
  - [ ] `AgentV2CapabilityDecisionService` 正则判断。
  - [ ] 对应过时测试。
  - [ ] 重复手写查询逻辑。
- [x] 保留：
  - [x] 静态 P0 Manifest 兜底。
  - [x] 回滚开关。
  - [x] 历史 run 审计兼容。
  - [x] 旧正则依赖边界审计报告。
  - [x] 本地回滚演练报告。
  - [x] 旧正则退役交接包。

验收：

- [ ] 旧 `isXxx` 规则不再参与正式能力选择。
- [x] 本地已审计：`kg_llm_only` / `legacy_retired` 正式路径不返回旧正则 decision；生产默认和旧正则删除仍以后续真实证据为准。
- [ ] 删除后 `server-v2` build、P0 eval、管理端 build 通过。

---

## 17. Sprint 执行建议

### Sprint 1：图谱与意图底座

- [x] M0 开工保护。
- [x] M1 图谱生成。
- [x] M2 LLM 意图抽取。
- [x] 产出图谱报告和首批 P0 问法抽取报告。

验收命令：

```powershell
npm.cmd --prefix packages/server-v2 run kg:generate
npm.cmd --prefix packages/server-v2 test -- knowledge-graph intent-extraction --runInBand
npm.cmd --prefix packages/server-v2 run build
```

### Sprint 2：能力映射与通用查询

- [x] M3 能力映射。
- [x] M4 GenericQueryEngine 第一批能力迁移。
- [x] M5 Policy/Evidence/Contract 强化。

验收命令：

```powershell
npm.cmd --prefix packages/server-v2 test -- agent-v2-runtime agent-v2-policy-gateway agent-v2-answer-contract-validator --runInBand
npm.cmd --prefix packages/server-v2 run agent-v2:eval-gate:strict
npm.cmd --prefix packages/server-v2 run build
```

### Sprint 3：自动发布和评测门禁

- [x] M6 AutoPublishService。
- [x] M7 Eval Gate strict。
- [x] CI 接入。
- [x] Runtime 热加载验证。

验收命令：

```powershell
npm.cmd --prefix packages/server-v2 run agent-v2:capability-drafts
npm.cmd --prefix packages/server-v2 run agent-v2:eval-gate:strict
npm.cmd --prefix packages/server-v2 run build
```

### Sprint 4：治理后端与审计

- [x] M8 治理后端。
- [x] 审计详情写入。
- [x] 图谱、能力、评测、调试 API。

验收命令：

```powershell
npm.cmd --prefix packages/server-v2 test -- agent-governance --runInBand
npm.cmd --prefix packages/server-v2 run build
npm.cmd run check:api
```

### Sprint 5：治理前端与可视化调试

- [x] M9 治理前端。
- [x] M10 可视化调试器。
- [x] 首屏加载和权限验证。

验收命令：

```powershell
npm.cmd run check:api
npm.cmd run build
npx.cmd vitest run src/app/pages/system
```

### Sprint 6：图谱可视化、灰度和旧规则退役

- [x] M11 图谱可视化。
- [x] M12 灰度策略。
- [ ] shadow 对比。
- [ ] 旧正则退役。

验收命令：

```powershell
npm.cmd --prefix packages/server-v2 run agent-v2:eval-gate:strict
npm.cmd --prefix packages/server-v2 run build
npm.cmd run build
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
```

---

## 18. 端到端验收场景

### 18.1 只读查询自动发布

- [x] 新增一个只读 Controller 或管理端页面。
- [x] 触发 auto-pipeline。
- [x] 候选能力进入能力治理。
- [x] 权限、DTO、queryKey、字段策略、评测全部通过。
- [x] 生成新 Manifest 版本。
- [x] Runtime 热加载。
- [x] 用户自然语言提问命中新能力。

验收结果：

- [x] 管理端治理中心能看到 pipeline 日志。
- [x] 运行审计能追溯图谱、LLM、Manifest、Policy、工具和 evidence。

### 18.2 高风险动作阻断

- [x] 用户问“帮我给所有沉睡客户发券”。
- [x] 意图抽取识别为动作/触达。
- [x] Manifest 分类为 `approval_required` 或 `write_blocked`。
- [x] PolicyGateway 阻断直接执行。
- [x] 输出审批草稿或拒绝说明。

验收结果：

- [x] 没有真实发券。
- [x] 审计中显示风险拦截原因。

### 18.3 图谱缺口修复

- [x] 用户问“这个月人效怎么样”。
- [x] 首次 unsupported。
- [x] 运行审计进入未覆盖高频。
- [x] 治理中心提示“人效”缺同义词或能力映射。
- [x] 管理员新增同义词覆盖。
- [x] 下次 `kg:generate` 合入。
- [x] 再次提问命中经营指标能力。

验收结果：

- [x] unsupported 能闭环成图谱治理或能力治理任务。
- [x] “这个月人效怎么样”已合入 KG，并命中 `finance.staff-efficiency.metric` 经营指标能力。

### 18.4 旧正则退役回归

- [ ] 开启 shadow 7 天。
- [x] 比较 legacy regex 和 kg_llm 的 P0 结果；已完成离线 P0 差异归因，生产 shadow 对比仍后置。
- [x] 新架构通过 P0 strict gate。
- [ ] 切到 `kg_llm_preferred`。
- [ ] 观察线上失败分类。
- [ ] 切到 `kg_llm_only`。
- [ ] 删除旧正则。

验收结果：

- [ ] 新架构稳定接管。
- [ ] 旧规则删除后仍可通过评测、构建和核心手动场景。

---

## 19. 完成标准

### 19.1 产品完成标准

- [x] 普通用户仍然只面对一个 Agent 入口。
- [x] 经营问数长尾口语覆盖明显提升。
- [x] 答错后能在治理中心定位原因和修复路径。
- [x] 管理员能看到自动发布日志、能力健康、图谱缺口、评测趋势。
- [x] 高风险动作必须审批或阻断，业务数据不会被误写。

### 19.2 技术完成标准

- [ ] 正式能力选择不再依赖 33 个 `isXxx` 正则。
- [x] 图谱由源头自动生成，并有报告和 CI 校验。
- [x] LLM 只输出结构化意图，不直接执行、不直接授权。
- [x] Active Manifest 决定系统能做什么。
- [x] PolicyGateway、字段策略、ContractValidator 和 EvidenceService 全链路生效。
- [x] GenericQueryEngine 支撑第一批 P0/P1 只读、指标、趋势、详情能力。
- [x] AutoPublishService 支持低风险能力自动发布和高风险阻断。
- [x] 650 题评测和 P0 strict gate 进入 CI。
- [x] 治理中心 API 和页面可用。
- [x] 管理端、Kiosk、API 的入口都有引擎版本和审计记录。

### 19.3 验证完成标准

- [x] `npm.cmd --prefix packages/server-v2 run kg:generate` 通过。
- [x] `npm.cmd --prefix packages/server-v2 run agent-v2:eval-gate:strict` 通过。
- [x] `npm.cmd --prefix packages/server-v2 run build` 通过。
- [x] `npm.cmd --prefix packages/server-v2 run agent-v2:local-completion-audit:strict` 通过，剩余未勾选项均已分类为生产/真实流量/旧正则最终退役后置项。
- [x] `npm.cmd run check:api` 通过。
- [x] `npm.cmd run build` 通过。
- [x] `npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build` 通过。
- [x] 管理端治理中心 smoke 通过。
- [x] Kiosk 自然语言问答 smoke 通过。
- [x] 高风险动作阻断 smoke 通过。

进度记录（2026-07-06 05:45）：

- Manifest 和 GenericQueryEngine 变更后已重新执行 `npm.cmd --prefix packages/server-v2 run kg:generate:strict`，生成时间 `2026-07-06 05:45:42 Asia/Shanghai`，结果为 blockers=0、warnings=4，并更新图谱产物。
- 图谱重生成后已复验：`npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/query-engine/generic-query-engine.service.spec.ts --runInBand`，1 个测试套件、17 个用例通过；`npm.cmd --prefix packages/server-v2 run build` 通过。
- 已补齐本地最终验证命令：`npm.cmd run check:api` 通过，内部执行 `packages/server-v2` build。
- 已验证：`npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build` 通过；Vite 输出 chunk size warning，但构建成功。
- 已复验：`npm.cmd run build` 通过，管理端治理中心相关 bundle 正常生成。

---

## 20. 风险与处理

| 风险 | 交付影响 | 处理方式 |
|---|---|---|
| 图谱生成源头不干净 | LLM 上下文错误，能力错配 | 图谱报告必须列出缺口，缺口不自动发布 |
| LLM JSON 不稳定 | 意图抽取失败 | schema 校验、修复重试、纯图谱降级 |
| 自动发布误放行 | 高风险业务事故 | 发布门禁 + PolicyGateway 双重阻断 |
| 动态 Prisma 查询过宽 | 慢查询或数据泄露 | 最大行数、字段策略、store scope、query dry-run |
| 治理中心太研发化 | 产品经理难定位问题 | 所有失败分类使用业务语言，并给处理建议 |
| 旧 V1/V2 入口兼容复杂 | 管理端或终端回归 | shadow 灰度，保留回滚开关，入口记录 engineVersion |
| 评测题与真实问题脱节 | 门禁不能代表线上质量 | 从运行审计高频失败一键生成 eval case |
| 工作区脏改多 | 容易混入无关变更 | 每阶段开工先 `git status`，只改任务相关文件 |

---

## 21. 第一批建议落地能力

优先选择“低风险、只读、证据清晰、现有 eval 覆盖”的能力作为新架构首批验证对象。

- [x] 财务日结指标。
- [x] 支付方式拆分。
- [x] 退款指标。
- [x] 商品订单记录。
- [x] 项目订单记录。
- [x] 次卡订单记录。
- [x] 次卡核销记录。
- [x] 客户消费记录。
- [x] 次卡沉睡客户。
- [x] 库存已发生报废记录。
- [x] 库存临期风险。
- [x] 营业额趋势。
- [x] 订单详情查询。
- [x] 跳转收银台。
- [x] 跳转次卡核销。

---

## 22. 最终交付清单

- [x] 知识图谱生成器、增强器、报告和 CI 校验。
- [x] LLM 意图抽取服务、缓存、降级和 trace。
- [x] Manifest 能力映射服务。
- [x] Schema-Driven 通用查询引擎。
- [x] PolicyGateway、EvidenceService、ContractValidator 强化。
- [x] AutoPublishService、发布日志、Manifest 热加载。
- [x] 650 题评测门禁和 CI strict gate。
- [x] Agent 治理后端 API。
- [x] Agent 治理前端页面。
- [x] 可视化调试器。
- [x] 图谱可视化。
- [x] 管理端、Kiosk、API 入口灰度策略。
- [ ] 旧 `CapabilityDecisionService` 正则退役。
- [x] 完整验证记录和阶段交付报告。

---

## 23. 本地闭环阶段交付报告（2026-07-06 05:45）

### 23.1 已本地完成

- 新架构底座：知识图谱生成、离线增强、LLM/KG 意图抽取、Manifest 能力映射、GenericQueryEngine、Policy/Evidence/Contract、AutoPublish、本地 eval gate、治理后端、治理前端、可视化调试、图谱可视化、灰度策略均已完成到可编译、可测试、可治理状态。
- M4 通用查询补齐：`generic.record.query` 支持从图谱 `FK_RELATION` 推导门店过滤路径，从用户时间词生成 where，并按 Manifest `queryPlan` 限定 `dateField/orderBy/take/aggregation`。
- 专用服务治理：复杂经营口径统一标记 `executor.type=custom_service`，并强制提供 `customServiceReason`；能力中心可统计 `customServiceTotal`。
- 旧正则增量治理：已移除本轮新增到 `AgentV2CapabilityDecisionService` 的发券/人效 `isXxx` 规则；发券阻断和员工人效继续由图谱、Manifest、能力映射和 `kg_llm` runtime 覆盖。
- 旧正则退役预检：新增 `agent-v2:legacy-diff-attribution`、`agent-v2:legacy-retirement-preflight` / `agent-v2:legacy-retirement-preflight:local`，产出本地差异归因和退役预检 JSON/Markdown；当前本地门禁和退役安全门禁通过，仅剩生产证据阻塞。
- 生产证据契约：退役预检已预留读取 `agent-v2-legacy-retirement-production-evidence.json`，并提供 `agent-v2-legacy-retirement-production-evidence.example.json` 模板；新增 `agent-v2:legacy-retirement-evidence` 只读校验工具，后续真实导出文件必须先通过来源、非零样本、LLM 观测和回滚校验后才可写为正式证据；当前未生成正式生产证据文件，不伪造生产 shadow、有用率、LLM 观测或回滚验证。
- Shadow 证据聚合：新增 `agent-v2:legacy-retirement-shadow-evidence` 只读工具，可从生产/准生产导出的 AgentRun、AgentRunAuditDetail、AgentToolCall、AgentFeedback JSON 聚合 candidate 证据；candidate 证据不会自动写成正式生产证据。
- 生产配置边界：当前只预留 deploy hook URL/token、GitHub Secrets、后端环境变量和生产 DB migration 入口，未写入生产配置、未触发生产 hook、未执行生产迁移；新增 production config readiness 本地门禁，持续验证这些预留入口不会误触发。

### 23.2 已验证命令

- `npm.cmd --prefix packages/server-v2 run kg:generate:strict`：通过，blockers=0，warnings=4。
- `npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/query-engine/generic-query-engine.service.spec.ts src/agent-v2/tools/agent-v2-business-record-query.service.spec.ts src/agent-v2/tools/agent-v2-business-metric-query.service.spec.ts src/agent-v2/tools/agent-v2-business-trend-query.service.spec.ts src/agent-v2/tools/agent-v2-business-detail-query.service.spec.ts --runInBand`：通过，5 个测试套件、52 个用例。
- `npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/capability/agent-v2-capability-decision.service.spec.ts src/agent-v2/capability-center/agent-v2-capability-center.service.spec.ts --runInBand`：通过，2 个测试套件、48 个用例。
- `npm.cmd --prefix packages/server-v2 run build`：通过。
- `npm.cmd run check:api`：通过。
- `npm.cmd run build`：通过。
- `npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build`：通过，存在 Vite chunk size warning，不影响构建结果。
- `npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/capability/agent-v2-capability-decision.service.spec.ts src/agent-v2/agent-v2-runtime.service.spec.ts src/agent-v2/intent/agent-v2-intent-extraction.service.spec.ts --runInBand`：通过，3 个测试套件、73 个用例；确认 legacy 未继续新增发券/人效正则，新 `kg_llm` 链路仍可识别。
- 删除新增 legacy 正则后复验：`npm.cmd --prefix packages/server-v2 run agent-v2:eval-gate:strict` 通过，650 题、P0 103 题、P0 未映射 0、P0 权限待审 0、P0 契约失败 0、P0 错路由风险 0；`npm.cmd --prefix packages/server-v2 run build` 通过。
- `npm.cmd --prefix packages/server-v2 run agent-v2:legacy-diff-attribution`：通过；P0 103 题中 KG-only 与 legacy 差异 21 条，21 条均为 KG 命中期望、legacy 缺口，KG 待修 0 条，`safeToRetireByAttribution=true`。
- `npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-preflight:local`：通过；本地退役前置门禁通过，`retirementReady=false`，本地退役安全阻塞 0，剩余阻塞项为生产 7 天 shadow、线上有用率、生产 LLM 观测和回滚验证；报告已指向生产证据模板，且确认正式生产证据文件尚不存在。
- `npm.cmd --prefix packages/server-v2 run agent-v2:production-config-readiness:strict`：通过；8 个生产配置预留门禁均通过，确认本地/生产 env 样例、GitHub Secrets 条件、deploy hook token guard、生产默认旧链路和 `legacy_retired` 确认开关均已预留到位。
- `npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-evidence`：通过脚本执行；校验结论 `pass=false`、阻塞项 7 个，表示当前没有正式生产证据文件，且不会自动写入正式证据。
- `npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-evidence -- --input docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-legacy-retirement-production-evidence.example.json`：通过脚本执行；校验结论 `pass=false`、阻塞项 3 个，确认示例模板的 0 shadow 样本、0 有用率样本、0ms LLM 延迟不会被误判为可退役证据。
- `npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/agent-v2-runtime.service.spec.ts src/agent-v2/intent/agent-v2-intent-extraction.service.spec.ts --runInBand`：通过，2 个测试套件、31 个用例。

### 23.3 尚不能本地完成

- 旧正则退役：需要 P0 strict gate 连续通过、7 天 shadow 无重大回归、线上用户有用率不低于旧链路、高风险自动执行为 0、回滚方案验证后才能删除。
- 当前预检结论：本地工程门禁和本地退役安全门禁均通过，但退役预检报告仍明确 `retirementReady=false`；旧正则不能仅凭本地 strict gate 和离线归因删除。
- 正式生产证据文件 `agent-v2-legacy-retirement-production-evidence.json` 尚未生成；后续生产 7 天 shadow 完成后，需先用 `agent-v2:legacy-retirement-evidence -- --input <真实导出文件>` 校验，再用 `--write-canonical` 写入正式证据并复跑退役预检。
- 生产自动发布 hook：本地 readiness 已确认预留入口完整；真正启用仍需要生产 API 域名、deploy token、GitHub Secrets / 后端环境变量、生产 DB migration 授权和管理员权限授予。
- 真实线上观测：真实生产 LLM Key、模型延迟、成本、失败率、线上 shadow 差异和用户有用率只能在生产配置与灰度后持续采集。
- 证据校验工具只做本地 JSON 校验和报告生成，不连接生产库、不调用生产 API；`--write-canonical` 只有在输入证据通过校验后才会写入正式证据文件。
- 历史进度记录中的未勾选缺口以本节当前状态为准：本地可闭环项已收口，生产/真实流量/授权项保留为后续上线阶段任务。

---

## 23. 实施进度记录

### 2026-07-05 18:17 Asia/Shanghai

本轮已完成 M0、M1，并推进 M2/M3 到可验证运行时开关；默认运行仍保留旧正则决策，避免在未完成完整评测和灰度前影响管理端和 Kiosk 终端。

#### 已完成

- [x] M0 工作区预检：
  - 当前分支：`codex/local-save-2026-07-02-latest-dev`。
  - 开工时仅有源方案文档和本 `task.md` 未跟踪，无已修改业务代码。
  - 本轮改动范围集中在 `packages/server-v2/src/agent-v2`、`packages/server-v2/prisma`、`packages/server-v2/package.json`、`.github/workflows/agent-v2.yml` 和图谱报告产物。
- [x] M1 知识图谱生成器：
  - 新增 `packages/server-v2/src/agent-v2/knowledge-graph/knowledge-graph.types.ts`。
  - 新增 `packages/server-v2/src/agent-v2/knowledge-graph/knowledge-graph-builder.ts`。
  - 新增 `packages/server-v2/prisma/agent-v2-knowledge-graph.ts`。
  - 新增 generated runtime snapshot：`packages/server-v2/src/agent-v2/knowledge-graph/generated/knowledge-graph.generated.ts`。
  - 新增图谱 JSON：`docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/knowledge-graph.json`。
  - 新增图谱报告：`docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/knowledge-graph-report.md`。
  - 新增命令：`kg:generate`、`kg:generate:strict`。
  - CI `Agent V2 Gate` 已增加 `kg:generate:strict`。
- [x] M2/M3 图谱意图与 Manifest 映射运行时接入：
  - 新增 `StructuredIntent`、图谱上下文、结构化意图抽取、Manifest 映射服务。
  - 新增测试：`packages/server-v2/src/agent-v2/intent/agent-v2-intent-extraction.service.spec.ts`。
  - 已注册到 `AgentV2Module`。
  - `AgentV2RuntimeService` 新增 `AGENT_INTENT_ENGINE=kg_llm|shadow|legacy_regex` 环境开关。
  - `legacy_regex` 仍为默认正式入口；`kg_llm` 可走图谱意图和 Manifest 映射；`shadow` 可计算新链路但继续返回旧链路决策。
  - 已覆盖“哪些客户买了次卡但最近一直不来用”规划到 `card.package.inactive-customers.list` 的 runtime 单测。
- [x] M4 GenericQueryEngine 第一批可运行切片：
  - 新增 `packages/server-v2/src/agent-v2/query-engine/generic-query-engine.types.ts`。
  - 新增 `packages/server-v2/src/agent-v2/query-engine/generic-query-engine.service.ts`。
  - 新增测试：`packages/server-v2/src/agent-v2/query-engine/generic-query-engine.service.spec.ts`。
  - 已支持 `record.query`、`trend.query`、`detail.query` 三类通用执行形态。
  - 第一批接入能力：`inventory.scrap.records.list`、`order.product.records.list`、`order.project.records.list`、`finance.revenue.trend`、`order.detail.lookup`。
  - `AgentV2BusinessRecordQueryService`、`AgentV2BusinessTrendQueryService`、`AgentV2BusinessDetailQueryService` 已接入 GenericQueryEngine adapter；未迁移能力继续走原专用服务回退。
  - 通用输出包含 `items`、`metrics`、`chart`、`detail`、`evidence`、`queryTrace`；默认按 `storeId`、时间范围、最大行数和 Manifest `fieldPolicies` 执行。
  - CI `Agent V2 Gate` 已补充新增 intent 与 query-engine 单测。
- [x] M5 安全、证据和契约第一轮强化：
  - `AgentV2PolicyGatewayService` 权限校验从“命中任一权限”收紧为“覆盖 Manifest 声明的全部 `permissionCodes`”，保留 `*` 超管能力。
  - 多域能力 `agent.multi-domain.summary` 已增加权限覆盖测试，避免只拿到财务/库存权限就读取客户、订单、门店等跨域数据。
  - `AgentV2AnswerContractValidatorService` 增加表格输出字段策略审计 warning：未经过 PolicyGateway 或缺少 `fieldPolicyApplied/evidencePolicyApplied` 时进入治理风险提示。
  - ContractValidator 增加 GenericQueryEngine `queryTrace` 的门店过滤 warning：通用查询 trace 无 `storeId` 时进入治理风险提示。
- [x] M6 自动发布流水线第一版：
  - 新增 `packages/server-v2/src/agent-v2/capability-center/agent-v2-auto-publish.service.ts`。
  - 新增测试：`packages/server-v2/src/agent-v2/capability-center/agent-v2-auto-publish.service.spec.ts`。
  - 复用现有能力中心 `importDrafts -> publish(mode=auto) -> dry-run -> eval gate -> Manifest refresh`，不绕过既有门禁。
  - 新增管理端手动触发 API：`POST /api/agent-v2/capability-center/auto-publish/run`。
  - 新增部署钩子 API：`POST /api/agent-v2/capability-center/auto-publish/deploy-hook`。
  - 新增流水线日志 API：`GET /api/agent-v2/capability-center/auto-publish/runs`、`GET /api/agent-v2/capability-center/auto-publish/runs/:id`。
  - 新增每日 03:00 Cron 入口；默认不执行，只有 `AGENT_V2_AUTO_PUBLISH_CRON=true` 时才真实触发。
  - `full` 扫描已可执行；`git_diff/hash` 当前先记录扫描意图并回退全量报告，待后续接入增量扫描。
  - CI `Agent V2 Gate` 已补充自动发布服务单测。
- [x] M7 评测门禁结构化指标第一版：
  - `packages/server-v2/prisma/agent-v2-eval-gate.ts` 已输出 `metrics` 字段。
  - 已补充 P0 正确率、P0 降级覆盖、P0 降级数量、互斥正确率、高风险自动发布、越权证据等结构化指标。
  - Markdown 报告 `agent-v2-eval-gate-report.md` 已新增“结构化指标”章节。
  - 延迟 P99、缓存命中率、P0 一致性当前标记为 `not_measured`，等待运行审计和多次采样数据接入，不伪造性能结论。
- [x] M8 Agent 治理后端聚合 API 第一版：
  - 新增 `packages/server-v2/src/agent-v2/governance/agent-v2-governance.service.ts`。
  - 新增 `packages/server-v2/src/agent-v2/governance/agent-v2-governance.controller.ts`。
  - 新增测试：`packages/server-v2/src/agent-v2/governance/agent-v2-governance.service.spec.ts`。
  - 新增聚合入口：`/api/agent-governance`。
  - 已覆盖运行审计列表/详情/统计/失败/未覆盖问法、知识图谱摘要/节点/缺口/可视化/path、能力健康/热力、自动发布日志、评测题/报告、debug execute/compare/simulate-manifest。
  - 本版不新增 Prisma migration；图谱治理 override、评测运行落库和健康指标仍复用现有表与生成报告。
  - CI `Agent V2 Gate` 已补充治理服务单测。
- [x] M9 Agent 治理前端页面第一版：
  - 新增类型：`src/types/agentGovernance.ts`。
  - 新增 API facade：`src/api/agentGovernance.ts`、`src/api/real/agentGovernance.ts`。
  - 新增页面：`src/app/pages/system/AgentGovernanceCenter.tsx`。
  - 新增路由：`/system/agent-governance`，权限沿用后端治理接口 `core:system:view`。
  - 侧边栏系统设置新增 `Agent 治理台`，与 `AI 审计`、`Agent 审计`、`Agent 能力中心` 形成治理闭环。
  - 权限目录补齐 `core:system:view`，避免治理台、审计页和能力中心出现“路由有权限码但角色管理不可配置”的断点。
  - 页面已覆盖总览、运行审计、知识图谱、能力与发布、评测门禁、单题调试六个工作区。
  - 本版只接只读治理和 dry-run 调试接口，不新增真实写入开关；图谱 override、评测运行落库和自动发布真实触发仍按后续 M10-M12 控制。
- [x] M10 可视化调试器第一版：
  - 新增灰度策略服务：`packages/server-v2/src/agent-v2/agent-v2-gray-strategy.service.ts`。
  - 支持 `legacy_regex`、`shadow`、`kg_llm_preferred`、`kg_llm_only`、`legacy_retired` 五种模式。
  - 支持调试上下文、`AGENT_V2_GRAY_RULES`、`AGENT_V2_GRAY_MODE`，并兼容旧 `AGENT_INTENT_ENGINE`。
  - Runtime 已记录 `agentV2GrayStrategy`、`engineVersion`、`finalEngine`、新旧命中能力和 fallback 原因。
  - `debug/execute` 支持按问题、角色、入口和灰度模式生成 dry-run 计划。
  - `debug/compare` 已一次性返回 legacy、shadow、kg preferred、kg only 对比结果和差异摘要。
  - `debug/simulate-manifest` 当前先支持调试 session 内灰度策略模拟，不修改 active Manifest。
  - 管理端单题调试页面已支持模式、角色、入口选择，并展示多模式命中差异。
- [x] M11 图谱可视化第一版：
  - 管理端知识图谱页已接入 `GET /api/agent-governance/knowledge-graph/visualize`。
  - 新增轻量 SVG 图谱预览，按节点类型区分颜色，支持点击节点进入详情。
  - 新增起点/终点节点 ID 路径查询，接入 `POST /api/agent-governance/knowledge-graph/path`。
  - 本版不引入 D3/ECharts 依赖；先保证节点浏览、关系预览、路径查询和详情联动可用。
- [x] M12 灰度切换第一版：
  - 默认正式入口仍为 `legacy_regex`，避免未完成线上 shadow 前直接切换。
  - `kg_llm_preferred` 会优先尝试新链路；新链路未命中、依赖缺失或工具未注册时回退旧正则并记录原因。
  - `kg_llm_only` 和 `legacy_retired` 不回退旧正则，可用于受控调试和后续门店灰度。
  - `shadow` 记录 KG 命中能力，但正式返回 legacy 决策，满足后续 7 天对比观测的基础。
  - 尚未真实删除 `AgentV2CapabilityDecisionService`；退役条件要求连续 strict gate、7 天 shadow 无重大回归、线上有用率和可回滚验证。

#### 已验证

```powershell
npm.cmd --prefix packages/server-v2 run kg:generate:strict
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/intent/agent-v2-intent-extraction.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/agent-v2-runtime.service.spec.ts src/agent-v2/capability-center/agent-v2-capability-center.service.spec.ts src/agent-v2/capability/agent-v2-capability-decision.service.spec.ts src/agent-v2/contracts/agent-v2-answer-contract-validator.service.spec.ts src/agent-v2/policy/agent-v2-policy-gateway.service.spec.ts src/agent-v2/tools/agent-v2-business-record-query.service.spec.ts src/agent-v2/tools/agent-v2-business-metric-query.service.spec.ts src/agent-v2/tools/agent-v2-business-trend-query.service.spec.ts src/agent-v2/tools/agent-v2-business-detail-query.service.spec.ts src/agent-v2/tools/agent-v2-business-action-draft.service.spec.ts src/agent-v2/tools/agent-v2-navigation.service.spec.ts src/agent-v2/intent/agent-v2-intent-extraction.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/query-engine/generic-query-engine.service.spec.ts src/agent-v2/tools/agent-v2-business-record-query.service.spec.ts src/agent-v2/tools/agent-v2-business-trend-query.service.spec.ts src/agent-v2/tools/agent-v2-business-detail-query.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/agent-v2-runtime.service.spec.ts src/agent-v2/intent/agent-v2-intent-extraction.service.spec.ts src/agent-v2/query-engine/generic-query-engine.service.spec.ts src/agent-v2/capability-center/agent-v2-capability-center.service.spec.ts src/agent-v2/capability/agent-v2-capability-decision.service.spec.ts src/agent-v2/contracts/agent-v2-answer-contract-validator.service.spec.ts src/agent-v2/policy/agent-v2-policy-gateway.service.spec.ts src/agent-v2/tools/agent-v2-business-record-query.service.spec.ts src/agent-v2/tools/agent-v2-business-metric-query.service.spec.ts src/agent-v2/tools/agent-v2-business-trend-query.service.spec.ts src/agent-v2/tools/agent-v2-business-detail-query.service.spec.ts src/agent-v2/tools/agent-v2-business-action-draft.service.spec.ts src/agent-v2/tools/agent-v2-navigation.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/capability-center/agent-v2-auto-publish.service.spec.ts src/agent-v2/capability-center/agent-v2-capability-center.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/agent-v2-runtime.service.spec.ts src/agent-v2/intent/agent-v2-intent-extraction.service.spec.ts src/agent-v2/query-engine/generic-query-engine.service.spec.ts src/agent-v2/capability-center/agent-v2-auto-publish.service.spec.ts src/agent-v2/capability-center/agent-v2-capability-center.service.spec.ts src/agent-v2/capability/agent-v2-capability-decision.service.spec.ts src/agent-v2/contracts/agent-v2-answer-contract-validator.service.spec.ts src/agent-v2/policy/agent-v2-policy-gateway.service.spec.ts src/agent-v2/tools/agent-v2-business-record-query.service.spec.ts src/agent-v2/tools/agent-v2-business-metric-query.service.spec.ts src/agent-v2/tools/agent-v2-business-trend-query.service.spec.ts src/agent-v2/tools/agent-v2-business-detail-query.service.spec.ts src/agent-v2/tools/agent-v2-business-action-draft.service.spec.ts src/agent-v2/tools/agent-v2-navigation.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/governance/agent-v2-governance.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/agent-v2-gray-strategy.service.spec.ts src/agent-v2/agent-v2-runtime.service.spec.ts src/agent-v2/governance/agent-v2-governance.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/agent-v2-gray-strategy.service.spec.ts src/agent-v2/agent-v2-runtime.service.spec.ts src/agent-v2/intent/agent-v2-intent-extraction.service.spec.ts src/agent-v2/query-engine/generic-query-engine.service.spec.ts src/agent-v2/governance/agent-v2-governance.service.spec.ts src/agent-v2/capability-center/agent-v2-auto-publish.service.spec.ts src/agent-v2/capability-center/agent-v2-capability-center.service.spec.ts src/agent-v2/capability/agent-v2-capability-decision.service.spec.ts src/agent-v2/contracts/agent-v2-answer-contract-validator.service.spec.ts src/agent-v2/policy/agent-v2-policy-gateway.service.spec.ts src/agent-v2/tools/agent-v2-business-record-query.service.spec.ts src/agent-v2/tools/agent-v2-business-metric-query.service.spec.ts src/agent-v2/tools/agent-v2-business-trend-query.service.spec.ts src/agent-v2/tools/agent-v2-business-detail-query.service.spec.ts src/agent-v2/tools/agent-v2-business-action-draft.service.spec.ts src/agent-v2/tools/agent-v2-navigation.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/agent-v2-runtime.service.spec.ts src/agent-v2/intent/agent-v2-intent-extraction.service.spec.ts src/agent-v2/query-engine/generic-query-engine.service.spec.ts src/agent-v2/governance/agent-v2-governance.service.spec.ts src/agent-v2/capability-center/agent-v2-auto-publish.service.spec.ts src/agent-v2/capability-center/agent-v2-capability-center.service.spec.ts src/agent-v2/capability/agent-v2-capability-decision.service.spec.ts src/agent-v2/contracts/agent-v2-answer-contract-validator.service.spec.ts src/agent-v2/policy/agent-v2-policy-gateway.service.spec.ts src/agent-v2/tools/agent-v2-business-record-query.service.spec.ts src/agent-v2/tools/agent-v2-business-metric-query.service.spec.ts src/agent-v2/tools/agent-v2-business-trend-query.service.spec.ts src/agent-v2/tools/agent-v2-business-detail-query.service.spec.ts src/agent-v2/tools/agent-v2-business-action-draft.service.spec.ts src/agent-v2/tools/agent-v2-navigation.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run agent-v2:capability-drafts
npm.cmd --prefix packages/server-v2 run agent-v2:eval-gate:strict
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/policy/agent-v2-policy-gateway.service.spec.ts src/agent-v2/contracts/agent-v2-answer-contract-validator.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run build
npx.cmd vitest run src/test/permissions.test.ts
npm.cmd run build
```

验证结果：

- `kg:generate:strict` 通过：3505 个节点、3908 条边、0 个阻断项、4 个提醒项。
- 图谱提醒项均为历史业务对象声明模型未出现在当前 Prisma：`CheckInRecord`、`BeauticianSchedule`、`OperationCost`、`Order`；当前作为 warning 进入治理报告，不阻断 CI。
- M2/M3 新增单测通过：1 个测试套件、6 个用例通过。
- M4 query-engine 与受影响工具定向测试通过：4 个测试套件、17 个用例通过。
- M5 PolicyGateway 与 ContractValidator 定向测试通过：2 个测试套件、16 个用例通过。
- M6 自动发布与能力中心定向测试通过：2 个测试套件、6 个用例通过。
- M8 治理后端聚合服务定向测试通过：1 个测试套件、4 个用例通过。
- M10 灰度策略、Runtime 和治理调试定向测试通过：3 个测试套件、24 个用例通过。
- Agent V2 workflow 定向单测通过：16 个测试套件、129 个用例通过。
- 能力草案生成通过：577 个能力草案、650 条评测草案。
- strict 评测门禁通过：650 题、P0 未映射 0、P0 权限待审 0、P0 契约失败 0、P0 错路由风险 0。
- Eval gate 结构化指标已生成：P0 正确率 100.0%、P0 降级覆盖 100.0%、互斥正确率 100.0%、高风险自动发布 0、越权证据 0；延迟和缓存指标仍为 `not_measured`。
- `server-v2` build 通过。
- 权限/菜单路由测试通过：1 个测试文件、12 个用例通过。
- 管理端 Vite build 通过，已生成 `AgentGovernanceCenter` 页面 chunk。

补充验证记录：

- `npx.cmd tsc --noEmit` 已执行；失败项均落在既有库存/商品/财务/Ami Agent 类型债，未出现本轮新增 `agentGovernance` 类型、API 或页面文件错误。

#### 剩余关键缺口

- [x] M2 已接入真实 LLM provider 调用链路；AI Gateway 可做结构化意图抽取，不可用时降级到 KG fallback，生产 Key/成本/失败率观测后置。
- [x] M3 本地/CI 默认已切换到 `kg_llm_preferred`，旧 `AgentV2CapabilityDecisionService` 仅作为回退、生产对照和退役前审计对象。
- [ ] M3 生产正式默认仍保持 `legacy_regex` 或治理表灰度控制；需 7 天 shadow、线上有用率、回滚验证和授权后才能改为生产默认接管。
- [x] M4 已补齐 `metric.query`、`navigation.open`、`action.draft` 和第一批 GenericQueryEngine/queryKey 适配；库存周转、未来消耗和项目 BOM 预测已在后续本地收口中补公式。
- [x] M5 已把 evidence、字段策略、trace 风险接入治理 API、运行审计详情、Policy/Contract 回放和脱敏展示。
- [x] M6 已接入 git diff/hash 增量扫描、部署钩子专用鉴权、管理端流水线日志和发布后 Runtime smoke；生产 URL/token 配置后置。
- [x] M7 已接入 runtime 评测执行、多次一致性采样、延迟 P99、缓存命中率和 strict gate 硬门禁。
- [x] M8 已新增图谱同义词/互斥 override 写入表、评测运行落库、治理健康指标和定时采样基础；生产定时写库配置后置。
- [x] M10/M11 已补齐真实 LLM Prompt/Response、SQL 摘要、工具返回、Contract 校验、最终 blocks、Policy 决策、图谱可视化和 Manifest 模拟本地闭环。
- [x] M12 已完成灰度策略第一版；旧正则真实退役仍需 7 天 shadow 对比、线上有用率、可回滚验证和用户授权后再删除。

### 2026-07-05 19:41 Asia/Shanghai

本轮继续补齐 M7 运行态评测、M8 治理健康指标和库存/临期 P0 问数断点。当前可以确认：离线 dry-run 门禁已经能真实调用 Runtime 规划层，不再只看静态草案；但线上 7 天 shadow、真实 LLM provider 和旧正则退役仍未完成，不能把“全自动退役旧链路”标记为最终完成。

#### 本轮已完成

- [x] M7 运行态评测采样：
  - `agent-v2-eval-gate.ts` 已接入 Runtime dry-run 采样。
  - P0 每题重复 5 次，输出 P0 运行时正确率、同题稳定性、规划延迟 P99、意图缓存命中率、KG-only 与 legacy_regex 选路差异率、`kg_llm_preferred` 回退旧链路率。
  - `AgentV2IntentExtractionService` 新增缓存统计 `getCacheStats()`，评测报告可直接看到缓存 hit/miss。
  - Markdown/JSON 报告不再把 P0 一致性、延迟 P99、缓存命中率标记为 `not_measured`。
- [x] P0 运行时错路由修复：
  - 新增正式 Manifest：`inventory.bom.consumption.records.records.list`，承接库存整体、库存金额、安全库存、周转、损耗率、补货清单等只读问数。
  - `inventory.expiring-risk.list` 从未注册工具 `inventory.risk.rank` 切到已注册的 `business.record.query`。
  - `AgentV2BusinessRecordQueryService` 新增库存状态查询和临期/缺货风险查询执行器，均返回证据包，不写库存、不自动促销。
  - KG 映射层增加库存临期、库存状态、退款问题的边界优先级，避免单题被多域摘要或相邻能力抢路由。
  - `kg_llm_preferred` 增加高置信旧链路冲突回退：KG 与 legacy 明显不一致且 legacy 高置信时，先回退并记录 `legacy_high_confidence_disagreement`。
  - KG 长短语模糊匹配收窄，降低“检查库存/生成月报”等多域样例误伤单一业务问题的风险。
- [x] M8 治理健康指标：
  - 新增 `GET /api/agent-governance/health`。
  - 后端健康指标覆盖运行数、成功率、run/tool P99、工具风险、审批、灰度策略、缓存命中、评测运行和风险计数。
  - 管理端 `AgentGovernanceCenter` 总览已展示 7 天运行数、成功率、P99、高风险自动执行、KG 回退旧链路、缓存命中率等交付指标。
- [x] 图谱与评测产物已重新生成：
  - 知识图谱已包含新增库存只读能力和临期风险执行器变更。
  - Eval gate 报告已包含运行时采样指标和 runtime mismatch 样例表。

#### 本轮验证结果

```powershell
npm.cmd --prefix packages/server-v2 run kg:generate:strict
npm.cmd --prefix packages/server-v2 run agent-v2:eval-gate:strict
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/agent-v2-runtime.service.spec.ts src/agent-v2/intent/agent-v2-intent-extraction.service.spec.ts src/agent-v2/tools/agent-v2-business-record-query.service.spec.ts src/agent-v2/governance/agent-v2-governance.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/agent-v2-gray-strategy.service.spec.ts src/agent-v2/agent-v2-runtime.service.spec.ts src/agent-v2/intent/agent-v2-intent-extraction.service.spec.ts src/agent-v2/query-engine/generic-query-engine.service.spec.ts src/agent-v2/governance/agent-v2-governance.service.spec.ts src/agent-v2/capability-center/agent-v2-auto-publish.service.spec.ts src/agent-v2/capability-center/agent-v2-capability-center.service.spec.ts src/agent-v2/capability/agent-v2-capability-decision.service.spec.ts src/agent-v2/contracts/agent-v2-answer-contract-validator.service.spec.ts src/agent-v2/policy/agent-v2-policy-gateway.service.spec.ts src/agent-v2/tools/agent-v2-business-record-query.service.spec.ts src/agent-v2/tools/agent-v2-business-metric-query.service.spec.ts src/agent-v2/tools/agent-v2-business-trend-query.service.spec.ts src/agent-v2/tools/agent-v2-business-detail-query.service.spec.ts src/agent-v2/tools/agent-v2-business-action-draft.service.spec.ts src/agent-v2/tools/agent-v2-navigation.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run build
npm.cmd run build
```

验证摘要：

- `kg:generate:strict` 通过：3524 个节点、3942 条边、0 个阻断项、4 个提醒项。
- `agent-v2:eval-gate:strict` 通过：650 题、P0 103 题、P0 未映射 0、P0 权限待审 0、P0 契约失败 0、P0 错路由风险 0。
- 运行态采样指标：P0 运行时正确率 100.0%（103/103）、P0 同题稳定性 100.0%（每题 5 次）、规划延迟 P99 5.55ms、意图缓存命中率 80.0%、KG-only 与 legacy_regex 选路差异率 52.43%、`kg_llm_preferred` 回退旧链路率 32.04%。
- Agent V2 新增定向测试通过：4 个测试套件、41 个用例通过。
- Agent V2 回归测试通过：16 个测试套件、133 个用例通过。
- `server-v2` build 通过。
- 管理端 Vite build 通过。

#### 更新后的剩余关键缺口

- [x] 真实 LLM provider 调用链路已接入后端 AI Gateway；本地仍保留 KG fallback，真实生产 Key、成本和失败率观测后置。
- [ ] P0 运行时采样已完成，但还不是线上真实流量评测；仍需把实际 AgentRun/ToolCall 的延迟、缓存、命中差异持续落库并按门店/入口看 7 天。
- [x] `kg_llm_preferred` 本地回退旧链路率已收敛为 0%；旧正则是否可删除仍取决于生产 7 天 shadow 和回滚证据。
- [x] KG-only 与 legacy_regex 的 P0 差异已完成离线归因：21 条差异均为 KG 命中期望、legacy 缺口，KG 待修 0；线上仍需 shadow 观察真实流量。
- [x] 临期/库存执行器已补齐库存周转率、未来消耗预测、项目 BOM 消耗预测和公式说明。
- [x] 图谱 override、评测运行落库、自动发布增量扫描、部署环境鉴权和完整链路回放已完成本地闭环。

### 2026-07-05 20:06 Asia/Shanghai 进度更新：真实 LLM 接入、增量发布和评测落库

本轮继续补齐 M2、M6、M7/M8 的关键工程缺口。当前可以确认：真实 Agent V2 Orchestrator 运行路径已能通过后端 AI Gateway 调用 LLM 做 `StructuredIntent` 抽取；LLM 不可用或 JSON 不合法时会自动降级到知识图谱 fallback，不影响权限、Manifest 映射和 PolicyGateway。评测、治理 dry-run 和离线门禁仍保留同步 KG 路径，避免离线任务依赖外部模型。

#### 本轮已完成

- [x] M2 真实 LLM provider 接入：
  - `AgentV2IntentExtractionService` 新增 `extractAsync()`，通过 `AiService.chat()` 调用后端 AI Gateway。
  - Prompt 只包含用户问题、图谱上下文、Active Manifest 摘要、互斥提醒和输出 schema，不把业务数据明细或敏感字段值放入 Prompt。
  - LLM 只输出 `StructuredIntent`，不决定权限、不执行工具、不生成业务结果。
  - JSON 不合法、AI Gateway 不可用或未注册时自动降级到 KG fallback，并在 trace 中记录 `llmFallbackReason`。
  - `AgentV2RuntimeService` 新增 `planAsync()`，真实 `AgentV2OrchestratorService` 已切换到异步规划；同步 `plan()` 保留给评测、治理调试和本地 fallback。
  - `AgentV2Module` 已接入 `AiModule`，模型 Key 仍只存在后端/AI Gateway，前端不持有模型 Key。
- [x] M6 自动发布增量扫描：
  - `git_diff` 模式不再只是记录意图，已按 Git 变更文件匹配候选草稿来源路径，只导入和发布命中的能力。
  - `hash` 模式已按候选能力指纹与 `AgentCapabilityDraft.scannerFingerprint` 比对，只导入和发布新增/变更能力。
  - 增量模式无命中时会写入 completed/skipped 日志，不导入、不发布、不生成无意义 Manifest 版本。
  - 增量发布会显式传入本次命中的 `capabilityIds`，避免扫描少量变化时误发布全量待发布草稿。
- [x] M7/M8 评测运行落库：
  - 复用既有 `AgentEvalRun` 表，不新增 Prisma schema/migration。
  - 新增治理接口：`GET /agent-governance/eval/runs/history` 查询评测历史。
  - 新增治理接口：`POST /agent-governance/eval/runs/import-latest` 将最新 strict gate 报告导入评测运行表。
  - 治理前端评测页新增“导入最新报告”和“评测运行历史”，后端仍用 `core:system:permissions` 控制写入。
- [x] M10 完整链路回放第一版：
  - `StructuredIntent` 已挂入新链路 `AgentV2CapabilityDecision`，治理调试可看到图谱/LLM 来源、cacheHit、候选能力、互斥提示和 fallback 原因。
  - `debug/execute` 返回 `replay.phases`，覆盖 intent extraction、Manifest mapping、policy boundary、tool plan、output contract 和 dry-run execution。
  - 运行审计详情返回 `replay.phases`，覆盖 planner、tool execution、contract/rendering 和 final answer。
  - 管理端运行详情弹窗新增“链路回放”区块，便于从一次运行反查失败阶段。
- [x] 总验收补强：
  - Kiosk 构建原先被根管理端商品/库存类型兼容问题阻断；已补 `Product.unit` 旧字段兼容、嵌套 `product.specUnit` API 类型和完整 `supplyMapping` 默认结构。
  - 修复后 Kiosk 构建通过，不改变终端业务入口和快捷操作流程。

#### 本轮验证

- Agent V2 重点回归通过：4 个测试文件、38 个用例通过。
- Agent V2 全量回归通过：16 个测试文件、141 个用例通过。
- `kg:generate:strict` 通过：3526 nodes、3943 edges、0 blockers、4 warnings。
- `agent-v2:eval-gate:strict` 通过：650 题、P0 103 题、P0 未映射 0、P0 权限待审 0、P0 契约失败 0、P0 错路由风险 0。
- `packages/server-v2` build 通过。
- `npm.cmd run check:api` 通过。
- 管理端 `npm.cmd run build` 通过。
- Kiosk `npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build` 通过，Vite 仍提示大 chunk 警告。

#### 更新后的剩余关键缺口

- [ ] 真实生产 LLM Key、模型延迟、成本和失败率尚未接入线上观测；本轮验证的是 AI Gateway 调用链路、mock/fake LLM 单测和不可用降级。
- [ ] 评测运行已可落库，但尚未自动从 CI/定时任务写入生产库；当前需要管理员或后续 automation 调用导入接口。
- [ ] `kg_llm_preferred` 仍需要 7 天真实 shadow 数据判断差异，旧正则暂不能删除。
- [x] KG-only 与 legacy_regex 差异已完成 P0 离线归因；真实线上差异仍需 7 天 shadow 分类观察。
- [x] 图谱 override 写入表、部署环境鉴权细分、完整链路回放中的真实 SQL 摘要已在后续本地收口中完成。
- [x] 临期/库存执行器已补齐库存周转率、未来消耗预测、项目 BOM 消耗预测和公式化指标。

### 2026-07-05 20:38 Asia/Shanghai 进度更新：图谱 override、部署钩子鉴权、SQL 回放和库存公式

本轮继续补齐上一轮列出的本地可完成缺口。当前可以确认：图谱人工覆盖已从“待做”推进为可持久化、可审计、可在治理中心维护；部署钩子与后台手动触发已拆分鉴权；GenericQueryEngine 的 queryTrace 已包含脱敏 SQL 摘要；库存健康执行器已输出周转率、未来消耗预测和项目 BOM 预测字段。

#### 本轮已完成

- [x] M8 图谱 override 写入表：
  - 新增 Prisma 模型 `AgentKnowledgeGraphOverride` 和 migration `20260705190000_agent_knowledge_graph_overrides`。
  - 新增治理接口：`GET/POST/DELETE /agent-governance/knowledge-graph/synonyms`。
  - 新增治理接口：`GET/POST/DELETE /agent-governance/knowledge-graph/excludes`。
  - 删除采用软删除 `status=deleted`，保留创建人、来源、置信度、payload 和下一次 `kg:generate` 合并线索。
  - 管理端治理中心知识图谱页新增“人工覆盖”区块，可新增同义词、互斥关系并查看最近覆盖记录。
- [x] M6 部署环境鉴权细分：
  - 管理员手动触发仍走 JWT + `core:system:permissions`。
  - `auto-publish/deploy-hook` 改为 `@Public()` + `AgentV2DeployHookGuard`，只接受 `AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN` 对应的 `x-agent-v2-deploy-token` / `x-deploy-token` / Bearer token。
  - 未配置 token 或 token 不匹配时直接拒绝，避免 CI/部署系统伪装后台用户。
- [x] M10 完整链路回放 SQL 摘要：
  - `GenericQueryTrace` 新增 `sqlSummary`，包含模型、操作、脱敏 where 条件、include/select/orderBy/take 和 `statementPreview`。
  - 运行审计 `tool_execution` 阶段自动抽取 `queryTraces` 和 `sqlSummaries`，治理中心可从一次真实 run 追溯“工具查了什么表、按什么条件查”。
  - SQL 摘要不包含客户、财务或订单参数值，只展示参数占位符，避免调试页面泄露业务明细。
- [x] M4 库存周转和未来消耗公式：
  - `inventory.bom.consumption.records.records.list` 现在读取近 30 天 StockMovement 消耗、未来 7 天 Reservation/ServiceTask 和 ProjectBomItem。
  - 每个商品输出 `consumed7Days`、`consumed30Days`、`dailyConsumption30Days`、`scheduledBomConsumption7Days`、`forecast7DaysConsumption`、`forecast30DaysConsumption`、`turnoverRate30Days`、`daysOfSupply`、`projectedShortage7Days`、`recommendedReplenishmentQty`。
  - 返回 `formula` / `formulaSummary`，明确周转率、可用天数和 7 天预测消耗的计算口径。
  - 仍保持只读，不自动创建采购、调拨、报废或审批单。

#### 本轮验证

- `npm.cmd --prefix packages/server-v2 run db:generate` 通过。
- Agent V2 定向回归通过：4 个测试文件、29 个用例通过。
- Agent V2 目录回归通过：17 个测试文件、145 个用例通过。
- `npm.cmd --prefix packages/server-v2 run kg:generate:strict` 通过：3548 nodes、3962 edges、0 blockers、4 warnings。
- `npm.cmd --prefix packages/server-v2 run agent-v2:eval-gate:strict` 通过：650 题、P0 103 题、P0 未映射 0、P0 权限待审 0、P0 契约失败 0、P0 错路由风险 0。
- `npm.cmd run check:api` 通过。
- 管理端 `npm.cmd run build` 通过。
- Kiosk `npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build` 通过，仍只有 Vite 大 chunk 警告。

#### 更新后的剩余关键缺口

- [ ] 真实生产 LLM Key、模型延迟、成本、失败率和失败样本仍需接入线上观测；本地只能证明 AI Gateway 调用链路、mock/fake LLM 单测和降级策略。
- [ ] 评测运行已可落库，deploy hook 已有服务 token，但 CI/定时任务写入生产库仍需真实部署环境配置 `AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN`、数据库连接和调度任务。
- [ ] `kg_llm_preferred` 仍需要 7 天真实 shadow 数据判断差异，旧正则暂不能删除。
- [x] KG-only 与 legacy_regex 差异已完成 P0 离线归因；真实线上差异仍需 7 天 shadow 分类观察。
- [x] 图谱 override 已接入 `kg:generate`：生成器会读取 active `AgentKnowledgeGraphOverride`，并在报告中展示人工覆盖采纳、跳过和冲突结果。

### 2026-07-05 20:45 Asia/Shanghai 最终本地收口：图谱 override 已接入生成器

本轮继续把 20:38 留下的最后一个本地工程缺口补齐。当前可以确认：图谱人工覆盖不再只是治理中心里的维护记录，`kg:generate` 已会读取 active `AgentKnowledgeGraphOverride`，把人工同义词合并为 `SYNONYM_OF`，把人工互斥关系合并为 `EXCLUDES`，并在 JSON/TS 产物和 Markdown 报告中输出人工覆盖采纳统计。无数据库或数据库不可用的本地/CI 场景会降级为空覆盖，不阻断图谱生成门禁。

#### 本轮补齐

- [x] `BuildAgentV2KnowledgeGraphInput` 新增 `manualOverrides` 输入，覆盖来源统一标记为 `manual_override`。
- [x] `kg:generate` 从 Prisma `AgentKnowledgeGraphOverride` 读取 `status=active` 的人工覆盖，最多合并最近 1000 条。
- [x] 人工同义词会生成 `Word` 节点和 `SYNONYM_OF` 边；人工互斥关系会生成 `EXCLUDES` 边。
- [x] 图谱报告新增人工覆盖统计和明细：总数、同义词数、互斥关系数、已采纳、跳过、冲突，以及每条覆盖的合并状态。
- [x] 新增 builder 单测，验证人工同义词和互斥关系确实进入生成图谱。

#### 最新验证结果

```powershell
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/knowledge-graph/knowledge-graph-builder.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run kg:generate:strict
npm.cmd --prefix packages/server-v2 run test -- src/agent-v2 --runInBand
npm.cmd run check:api
npm.cmd --prefix packages/server-v2 run agent-v2:eval-gate:strict
npm.cmd run build
```

验证摘要：

- 图谱 builder 新增单测通过：1 个测试文件、1 个用例通过。
- `kg:generate:strict` 通过：3548 nodes、3962 edges、0 blockers、4 warnings；当前本地 active override 为 0，所以报告统计为 0/0/0。
- Agent V2 目录回归通过：18 个测试文件、146 个用例通过。
- `check:api` 通过，`server-v2` build 正常。
- `agent-v2:eval-gate:strict` 通过：650 题、P0 103 题、P0 未映射 0、P0 权限待审 0、P0 契约失败 0、P0 错路由风险 0。
- 管理端 `npm.cmd run build` 通过。

#### 当前交付结论

- 本地可实现的 M2/M4/M6/M7/M8/M10/M12 关键工程项已完成到可编译、可测试、可生成、可治理的状态。
- 不能在本地直接标记为完成的事项，全部属于生产环境、真实流量或运营授权范畴：真实生产 LLM Key/成本/失败率观测、CI/定时任务写入生产库、7 天 shadow 对比、KG-only 与 legacy_regex 差异归因、旧正则最终退役授权。
- 旧正则仍不能删除；必须等 7 天 shadow 数据证明 `kg_llm_preferred` 的差异可控，并保留可回滚策略后再推进。

### 2026-07-05 20:53 Asia/Shanghai 进度更新：M11 图谱可视化治理动作

本轮继续推进 M11 的本地可完成项。当前可以确认：治理中心的知识图谱不再只是静态 SVG 预览，后端已支持围绕某个节点做 2 跳焦点展开，前端可以从节点列表或图谱预览进入节点详情，并把节点直接带入同义词、互斥关系和路径查询表单。

#### 本轮已完成

- [x] 图谱可视化 API 增强：
  - `GET /agent-governance/knowledge-graph/visualize` 支持 `focusId` 和 `depth`。
  - 未传 `focusId` 时仍按类型和数量返回全局预览。
  - 传入 `focusId` 时以后端图谱为准，按入边/出边做邻域展开，默认可支撑 2 跳焦点图。
  - 节点详情接口新增 `relatedNodes`，前端可以展示对端节点名称、类型和 ID，不再只看边 JSON。
- [x] 管理端图谱预览增强：
  - 新增前端依赖 `d3-force`，使用 D3 force simulation 计算节点布局，SVG 负责渲染和交互。
  - 图谱节点点击后自动聚焦并打开节点详情。
  - 焦点节点居中，邻接节点环形展开。
  - 边按 `COMPOSED_OF`、`FK_RELATION`、`SYNONYM_OF`、`EXCLUDES`、`REQUIRES_PERM` 等类型区分颜色和虚线样式。
  - 支持清除焦点，回到按类型筛选的全局预览。
- [x] 节点详情治理动作：
  - 节点详情展示节点摘要、关联边、关联节点和原始数据。
  - 关联节点可继续点击查看，形成可追溯的局部图谱浏览。
  - 支持一键把当前节点填入同义词目标、互斥来源、互斥目标、路径起点、路径终点。
  - 图谱治理动作仍走既有权限：只读查看为 `core:system:view`，新增/删除 override 为 `core:system:permissions`。

#### 本轮验证

```powershell
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/governance/agent-v2-governance.service.spec.ts --runInBand
npm.cmd run check:api
npm.cmd run build
```

验证摘要：

- 治理后端定向测试通过：1 个测试文件、11 个用例通过。
- 新增测试覆盖焦点图谱和节点详情 `relatedNodes`。
- `check:api` 通过，`server-v2` build 正常。
- 管理端 `npm.cmd run build` 通过，`AgentGovernanceCenter` chunk 正常产出；D3 force 依赖已被 Vite 打包。

#### 当前仍不能本地完成的事项

- 生产 LLM Key、模型成本、失败率和失败样本观测需要真实线上配置和流量。
- CI/定时任务写入生产库需要真实部署环境的 token、数据库连接和调度配置。
- 旧正则退役仍必须等待 7 天 shadow 对比、线上有用率和可回滚验证。

### 2026-07-05 21:08 Asia/Shanghai 进度更新：M12 管理端与 Kiosk 入口灰度接入

本轮继续推进 M12 的本地可完成项。当前可以确认：管理端 Agent 工作台和 Kiosk 自然语言问答都已能把 Agent V2 灰度模式透传到运行上下文，默认使用 `kg_llm_preferred`；后端返回的 `architecture` / `agentV2GrayStrategy` 会在管理端和 Kiosk 消息卡上展示为 KG+LLM/灰度策略标签，方便现场测试确认当前链路。Kiosk 的收银、核销、打印、充值等固定快捷流程仍按 FlowCard 原路径执行，不被问数意图接管。

#### 本轮已完成

- [x] 管理端 `AmiAgentWorkspace` 增加 Agent V2 灰度模式选择：`kg_llm_preferred`、`shadow`、`kg_llm_only`、`legacy_regex`、`legacy_retired`。
- [x] 管理端对话上下文在 V2 下写入 `agentV2GrayMode` 和 `architecture=kg_llm_agent`，消息区展示 KG+LLM、灰度模式和最终引擎。
- [x] Kiosk 顶部状态栏在 V2 下展示灰度模式切换，默认 `kg_llm_preferred`，切换后清空当前会话避免混用链路。
- [x] Kiosk `AppContent -> runMicroAppIntent -> terminalAgentAdapter -> agentRuntimeService` 链路透传 `agentEngine`、`agentV2GrayMode`、`architecture` 和 `entrypoint=terminal:kiosk`。
- [x] Kiosk Agent 消息卡展示后端返回的 `agent_v2_kg_llm` / `agentV2GrayStrategy.mode`，现场可直接看到是否命中新架构。
- [x] Kiosk 快捷操作保护已保留并回归：收银、核销等固定流程继续走 FlowCard，不被自然语言问数接管。

#### 本轮验证

```powershell
npx.cmd vitest run packages/Ami-Aura-Lite-Kiosk/src/app/microApps/runMicroApp.test.ts packages/Ami-Aura-Lite-Kiosk/src/app/components/AgentMessageItem.test.tsx
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
npm.cmd run build
npm.cmd run check:api
npx.cmd tsc --noEmit --pretty false
git diff --check
```

验证摘要：

- Kiosk 定向测试通过：2 个测试文件、49 个用例通过。
- 新增测试覆盖 Agent V2 `kg_llm_preferred` 灰度透传、`architecture=kg_llm_agent` 上下文、KG+LLM 消息徽标。
- 既有测试继续覆盖快捷入口保护：核销、收银等 quick action 不调用 Agent Runtime。
- Kiosk 构建通过，仍只有 Vite 大 chunk 警告。
- 管理端构建通过，`AmiAgentWorkspace` chunk 正常产出。
- `check:api` 通过，`server-v2` build 正常。
- `git diff --check` 无新增空白错误，仅提示 Windows 下 LF/CRLF 转换。
- 全量 `tsc --noEmit` 仍被既有类型问题阻断；本轮触碰的 `AmiAgentWorkspace.tsx` 类型错误已修复，剩余阻断集中在旧测试夹具、财务、商品、库存和 `AgentGovernanceCenter` 既有类型问题。

#### 当前仍不能本地完成的事项

- `kg_llm_preferred` 仍需要线上 7 天 shadow/优先模式数据对比，才能判断旧正则是否可退役。
- 门店/persona/capability 级灰度策略的生产启停仍需要配置中心或运维发布策略承接。
- 旧 `AgentV2CapabilityDecisionService` 正则链路尚不能删除；必须等线上有用率、失败率、成本、可回滚验证满足退役条件后再做删除 PR。

### 2026-07-05 21:18 Asia/Shanghai 进度更新：M12 灰度策略维度真正进入 Runtime

本轮继续补齐 T12.1。当前可以确认：灰度策略不再只是前端传 `agentV2GrayMode` 或全局环境变量，后端 `AgentV2GrayStrategyService` 已支持全局、门店、persona、capabilityId、entrypoint 组合规则；`AgentV2RuntimeService` 在存在 capability 级规则时，会先探测 legacy/KG 候选能力，再用候选 `capabilityId` 重算灰度策略。因此“按某个能力切到 `kg_llm_preferred`”已经能在 Runtime 自动生效，不需要管理端或 Kiosk 手动把 mode 写进 context。

#### 本轮已完成

- [x] 灰度服务支持候选 `capabilityIds` 列表，可匹配 legacy/KG 任一候选能力。
- [x] 灰度服务新增 capability 级规则检测，避免无 capability 规则时额外触发 KG 探测。
- [x] Runtime 灰度解析改为带缓存的 lazy decision：legacy/KG 探测最多各执行一次，后续正式选路复用结果。
- [x] 规则优先级保持按 `AGENT_V2_GRAY_RULES` 数组顺序确定；context 显式 mode 仍然最高优先级。
- [x] `agentV2GrayStrategy` 继续记录 `source`、`reason`、`matchedRule`、`kgSelectedCapabilityId`、`legacySelectedCapabilityId` 和 `fallbackReason`。

#### 本轮验证

```powershell
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/agent-v2-gray-strategy.service.spec.ts src/agent-v2/agent-v2-runtime.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run build
```

验证摘要：

- 灰度策略与 Runtime 定向测试通过：2 个测试文件、26 个用例通过。
- 新增测试覆盖 persona + capability 规则、规则顺序、无效规则降级到全局模式。
- 新增 Runtime 测试覆盖 capability 级 `AGENT_V2_GRAY_RULES` 自动切到 `kg_llm_preferred`，且无需前端 debug context。
- `server-v2` build 通过。

#### 当前仍不能本地完成的事项

- 门店/persona/capability 级灰度规则已从环境变量推进到治理配置表和治理 API；真实生产启停仍需要执行数据库迁移、配置操作授权和上线发布流程。
- 旧正则退役仍必须等待 7 天 shadow 对比、线上有用率、失败率、成本和可回滚验证。

### 2026-07-05 21:31 Asia/Shanghai 进度更新：M12 灰度规则治理配置落库

本轮继续补齐 T12.1 的生产可运营能力。当前可以确认：灰度策略不再只能依赖 `AGENT_V2_GRAY_RULES` 运维环境变量，后端已经新增 `agent_v2_gray_rules` 治理配置表、Prisma migration 和治理 API；Runtime 的异步执行路径会优先读取数据库中的 active 规则，再回退到环境变量规则和全局模式。因此“按门店、persona、entrypoint、capabilityId 动态切 shadow / kg_llm_preferred / kg_llm_only / legacy_retired”已经具备后端配置闭环。

#### 本轮已完成

- [x] 新增 Prisma 模型 `AgentV2GrayRule` 和迁移 `20260705212500_agent_v2_gray_rules`，字段覆盖模式、状态、优先级、门店、persona、角色、入口、能力、原因和审计人。
- [x] `AgentV2GrayStrategyService` 支持读取数据库 active 灰度规则，30 秒本地缓存，治理变更后可主动刷新。
- [x] 灰度解析优先级明确：context 显式模式最高，其次数据库治理规则，其次 `AGENT_V2_GRAY_RULES`，最后全局/旧环境变量兼容模式。
- [x] `AgentV2RuntimeService.planAsync` 接入异步灰度解析，能力级数据库规则能在正式运行时自动生效。
- [x] 新增治理 API：
  - `GET /agent-governance/gray-rules`
  - `POST /agent-governance/gray-rules`
  - `DELETE /agent-governance/gray-rules/:id`
- [x] 新增/删除灰度规则后刷新 Runtime 灰度缓存，避免等待 TTL 才生效。
- [x] 治理 API 权限沿用系统治理权限：查看为 `core:system:view`，新增/删除为 `core:system:permissions`。

#### 本轮验证

```powershell
npm.cmd --prefix packages/server-v2 run db:generate
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/agent-v2-gray-strategy.service.spec.ts src/agent-v2/agent-v2-runtime.service.spec.ts src/agent-v2/governance/agent-v2-governance.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run build
npm.cmd run check:api
git diff --check
```

验证摘要：

- Prisma Client 生成通过，新增 `AgentV2GrayRule` 类型可被服务层使用。
- 灰度策略、Runtime 和治理服务定向测试通过：3 个测试文件、41 个用例通过。
- 新增测试覆盖数据库规则优先于环境变量规则、异步 Runtime 命中数据库 capability 规则、治理端创建/删除规则后刷新 Runtime 缓存。
- `server-v2` build 通过，`check:api` 通过。
- `git diff --check` 无新增空白错误，仅提示 Windows 下 LF/CRLF 转换。

#### 当前仍不能本地完成的事项

- 数据库迁移尚未 apply 到真实环境；需要用户授权后在目标库执行迁移。
- 生产灰度规则的具体门店、角色、persona 和能力名单需要产品/运营确认，不应由开发默认写入真实库。
- 旧正则退役仍必须等待 7 天 shadow 对比、线上有用率、失败率、成本和可回滚验证。

### 2026-07-05 21:45 Asia/Shanghai 进度更新：M12 灰度规则进入管理端治理台

本轮继续把灰度规则从“后端可配置”推进到“产品/运营可操作”。当前可以确认：管理端 `AgentGovernanceCenter` 已新增“灰度规则”页签，运营可查看 active/deleted 规则、按状态和模式筛选、创建规则、软删除规则；新增/删除仍走后端治理 API，并触发 Runtime 灰度缓存刷新。

#### 本轮已完成

- [x] 前端类型补齐 `AgentV2GrayRule`、`AgentV2GrayMode`、`CreateAgentV2GrayRuleInput`。
- [x] 前端 API facade 新增：
  - `getAgentV2GrayRules`
  - `createAgentV2GrayRule`
  - `deleteAgentV2GrayRule`
- [x] 管理端治理台新增“灰度规则”页签。
- [x] 灰度规则列表展示优先级、规则名、灰度模式、命中范围、状态、更新时间和操作。
- [x] 新增规则表单支持门店 ID、persona、角色、entrypoint、capabilityId 和原因备注；逗号或换行输入会转成后端数组。
- [x] 删除动作调用后端软删除接口，不直接物理删除规则。
- [x] 页面状态文案改成产品可读口径：`active` 显示为“生效中”，`deleted` 显示为“已删除”。

#### 本轮验证

```powershell
npm.cmd run build
npm.cmd run check:api
git diff --check
```

验证摘要：

- 管理端 build 通过，`AgentGovernanceCenter` chunk 正常产出。
- `check:api` 通过，`server-v2` build 正常。
- `git diff --check` 无新增空白错误，仅提示 Windows 下 LF/CRLF 转换。

#### 当前仍不能本地完成的事项

- 灰度规则页面已具备操作能力，但真实保存到生产库仍需要先 apply `agent_v2_gray_rules` 迁移并使用具备 `core:agent-governance:manage` 的账号验证。
- 生产首批灰度规则名单需要产品/运营确认；开发侧不默认写入真实门店或能力名单。
- 旧正则退役仍必须等待 7 天 shadow 对比、线上有用率、失败率、成本和可回滚验证。

### 2026-07-05 21:46 Asia/Shanghai 进度更新：Agent 治理权限从系统权限拆分

本轮继续补齐 M9/T9.2 和 M1 图谱权限准确性。当前可以确认：Agent 治理台和能力中心不再复用 `core:system:view`，而是使用独立的 `core:agent-governance:view` / `core:agent-governance:manage`；普通门店角色不会默认看到治理中心，超级管理员仍通过 `*` 可见。后端治理 API 和能力中心 API 也已按只读/写入拆分权限，避免“有系统查看权限就能维护图谱、灰度规则或发布能力”。

#### 本轮已完成

- [x] 权限目录新增 `core:agent-governance:view` 和 `core:agent-governance:manage`。
- [x] `core:system:view` 的产品含义收窄为 AI 审计和 Agent 审计查看，不再覆盖 Agent 治理台和能力中心。
- [x] 管理端路由 `/system/agent-governance`、`/system/agent-capabilities` 改为 `core:agent-governance:view` 守卫。
- [x] 管理端菜单“Agent 治理台”“Agent 能力中心”改为专用治理查看权限。
- [x] 后端 `AgentV2GovernanceController` 读接口使用 `core:agent-governance:view`，图谱覆盖、灰度规则、评测导入等写接口使用 `core:agent-governance:manage`。
- [x] 后端 `AgentV2CapabilityCenterController` 读接口使用 `core:agent-governance:view`，草稿导入、审核、发布、版本激活、手动自动发布等写接口使用 `core:agent-governance:manage`。
- [x] 权限单测新增治理权限断言：`super_admin` 可见，`store_manager` 默认不可见且不可管理。
- [x] 修复 `kg:generate` 的 controller 权限提取逻辑：只读取当前 endpoint 的连续装饰器块，避免相邻接口权限污染。
- [x] 重新生成知识图谱产物，Agent 治理 route 和 endpoint 已关联到专用治理权限。

#### 本轮验证

```powershell
npx.cmd vitest run src/test/permissions.test.ts
npm.cmd --prefix packages/server-v2 run build
npm.cmd --prefix packages/server-v2 run kg:generate:strict
npm.cmd run check:api
npm.cmd run build
```

验证摘要：

- 权限单测通过：1 个测试文件、13 个用例通过。
- `server-v2` build 通过。
- `kg:generate:strict` 通过：3576 nodes、4109 edges、0 blockers、4 warnings。
- 针对性搜索确认旧错误边已消失：Agent 治理台和能力中心 route 不再指向 `core:system:view`，相关 GET/read endpoint 不再误连到 `core:agent-governance:manage`。
- `check:api` 通过。
- 管理端 build 通过。

#### 当前仍不能本地完成的事项

- 生产角色需要由管理员在权限管理里授予 `core:agent-governance:view/manage`；开发侧不默认给门店角色打开治理中心。
- 旧正则退役仍必须等待 7 天 shadow 对比、线上有用率、失败率、成本和可回滚验证。

### 2026-07-05 21:50 Asia/Shanghai 最终本地门禁复验

权限拆分、图谱重生成和管理端构建通过后，本轮补跑 650 题 strict 门禁，确认 Agent 治理权限从系统权限拆出没有造成 P0 能力错路由、权限待审或契约失败。

#### 本轮补充验证

```powershell
npm.cmd --prefix packages/server-v2 run agent-v2:eval-gate:strict
```

验证摘要：

- `agent-v2:eval-gate:strict` 通过：650 题、P0 103 题。
- P0 未映射 0、P0 权限待审 0、P0 契约失败 0、P0 错路由风险 0。
- 高风险自动发布 0。
- 当前仍有 50 条 inferred permission 候选，这是自动发布门禁报告中的待治理提示，不影响 strict gate 通过。

#### 仍需生产侧完成

- 执行并确认生产数据库迁移，尤其是 `agent_knowledge_graph_overrides` 与 `agent_v2_gray_rules`。
- 由管理员给目标账号授予 `core:agent-governance:view/manage`，再做管理端治理台真实账号 smoke。
- 配置生产 LLM Key、模型延迟/成本/失败率采集和 GitHub 提交触发 auto-publish 所需 token、数据库连接、部署平台环境变量。
- 运行 7 天 shadow/优先模式对比，完成 KG-only 与 legacy regex 差异归因；满足线上有用率、失败率和可回滚条件后，再授权删除旧正则链路。

### 2026-07-05 22:36 Asia/Shanghai 生产授权执行记录

用户已授权执行生产 DB migration、治理权限核对、生产 LLM/CI/定时任务环境配置。本轮已连接 `packages/server-v2/.env` 指向的 Supabase PostgreSQL 生产库执行 Prisma production migration，并补齐自动发布 hook 的代码配置入口。

#### 已执行

```powershell
npm.cmd run db:migrate:prod
npx.cmd prisma migrate status --schema prisma/schema.prisma
```

生产迁移结果：

- 已应用 `20260703170000_supply_legacy_migration_map`。
- 已应用 `20260705190000_agent_knowledge_graph_overrides`。
- 已应用 `20260705212500_agent_v2_gray_rules`。
- 复查结果：`Database schema is up to date!`
- 生产表存在性复查：
  - `SupplyLegacyMigrationMap` 已存在，当前 78 条记录。
  - `agent_knowledge_graph_overrides` 已存在，当前 0 条记录。
  - `agent_v2_gray_rules` 已存在，当前 0 条记录。

权限核对结果：

- `super_admin` 当前权限数组为 `*`，后端和前端权限判断均可覆盖 `core:agent-governance:view/manage`。
- `ami_demo_full_manager` 当前权限数组为 `*`，同样具备有效治理权限。
- 普通 `store_manager`、`beautician`、`cashier` 未授予 `core:agent-governance:view/manage`，符合“不默认给门店角色打开治理中心”的安全边界。
- 本轮未给普通门店角色写入治理权限，避免误开放图谱、灰度规则和能力发布入口。

生产 LLM 配置核对结果：

- `LLM_PROVIDER=deepseek` 已配置。
- `LLM_API_KEY` 已配置。
- `LLM_BASE_URL=https://api.deepseek.com`、`LLM_CHAT_PATH=/chat/completions`、`LLM_MODEL=deepseek-v4-flash`、`LLM_TIMEOUT_MS=30000` 已配置。

CI/auto-publish 配置入口：

- `.github/workflows/agent-v2.yml` 已新增 `workflow_dispatch`，每日 schedule 不作为当前常规发布路线。
- workflow 已新增生产 auto-publish deploy hook 步骤：非 PR、main/手动触发、且 GitHub Secrets 存在时才调用生产 hook。
- `.env.production.example` 与 `packages/server-v2/.env.example` 已补齐：
  - `AGENT_V2_DEPLOY_HOOK_URL`
  - `AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN`
  - `AGENT_V2_AUTO_PUBLISH_CRON`
  - `AGENT_V2_AUTO_PUBLISH_BASE_REF`
  - `AGENT_V2_GRAY_MODE`
  - `AGENT_V2_GRAY_RULES`

#### 仍需外部配置

- 当前 GitHub 仓库 secrets 为空，尚未配置 `AGENT_V2_DEPLOY_HOOK_URL` 和 `AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN`。
- 当前仓库和 `server-v2/.env` 没有线上 API 域名，不能可靠生成 deploy hook URL；需要补充真实生产 API 地址，例如 `https://api.example.com/api/agent-v2/capability-center/auto-publish/deploy-hook`。
- deploy token 必须同时配置到生产 API 环境变量 `AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN` 和 GitHub Secret `AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN`，两边一致后 hook 才能通过鉴权。
- 最新产品口径已在 2026-07-06 10:37 更新为“GitHub main 提交触发 auto-publish，平时不做定时发布”；因此生产后端 `AGENT_V2_AUTO_PUBLISH_CRON` 保持 `false`，workflow 不恢复常规 schedule。

### 2026-07-05 22:42 Asia/Shanghai 产品决策：生产 hook 预留，当前本地闭环

产品侧确认：`生产 API hook URL` 属于后续自动化运营配置，不作为当前 Agent 新架构产品开发和本地闭环验收的阻塞项。当前阶段先按“本地闭环 + 生产可配置入口预留”收口。

#### 当前有效边界

- 上一节“生产授权执行记录”仅作为当时一次性操作留痕，不构成后续自动重复执行生产 DB migration、写 GitHub Secrets、配置生产 token、触发生产 hook 或启用定时任务的默认授权。
- 自本节产品决策起，当前开发验收口径以“生产配置预留、当前本地闭环”为准；如需再次执行生产写库、生产环境变量配置、GitHub Secrets 写入、生产 hook 触发或旧正则删除，必须重新获得明确授权。
- `task.md` 的完成度审计仍以 `productionReady=false` 为准：生产 API hook、7 天 shadow、线上有用率、生产 LLM 观测、真实回滚验证和旧正则最终退役都不能因为历史配置核对记录而标记完成。

#### 当前闭环口径

- 代码与配置层已预留：
  - `.github/workflows/agent-v2.yml` 已支持 push、PR 和手动触发；最新口径为 GitHub main 提交触发 auto-publish，平时不启用每日 schedule。
  - `.env.production.example` 与 `packages/server-v2/.env.example` 已预留 `AGENT_V2_DEPLOY_HOOK_URL`、`AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN`、`AGENT_V2_AUTO_PUBLISH_CRON`、`AGENT_V2_AUTO_PUBLISH_BASE_REF`、`AGENT_V2_GRAY_MODE`、`AGENT_V2_GRAY_RULES`。
- 生产数据库已闭环：
  - migration 已应用，图谱 override 表和灰度规则表已存在。
- 权限已闭环：
  - `super_admin` 通过 `*` 可访问治理中心。
  - 普通门店角色未默认开放 `core:agent-governance:view/manage`。
- LLM 生产配置已核对：
  - 当前生产 `.env` 已配置 DeepSeek provider、API key、模型、base URL、chat path 和 timeout。
- 本地门禁已闭环：
  - `agent-v2:eval-gate:strict` 通过 650 题，P0 103 题无未映射、无权限待审、无契约失败、无错路由风险，高风险自动发布 0。

#### 后续配置项，不阻塞当前开发

- 等生产 API 域名稳定后，再设置 `AGENT_V2_DEPLOY_HOOK_URL`，格式为：
  - `https://<生产 API 域名>/api/agent-v2/capability-center/auto-publish/deploy-hook`
- 生成一次性 deploy token，并同步配置到：
  - 生产 API 环境变量：`AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN`
  - GitHub Secret：`AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN`
- 配置完成后，再跑一次 GitHub workflow 手动触发 smoke，确认自动发布 hook 能写入 `AgentCapabilityPublishRun` 日志。

#### 产品影响判断

- 不影响继续开发、测试、管理端治理台、Kiosk 灰度和手动发布。
- 只影响“GitHub main 提交自动触发生产 auto-publish”这一条运营自动化链路。
- 当前版本可以继续按本地闭环进入后续灰度和验收；旧正则退役仍需等待 7 天 shadow 数据和可回滚验证。

### 2026-07-05 22:50 Asia/Shanghai 本地 smoke 闭环补证

本轮按“生产 hook 预留，当前先本地闭环”的产品决策，继续补齐管理端治理中心、Kiosk 自然语言问答和高风险动作阻断三类 smoke 证据。

#### 已补齐

- 管理端治理中心 smoke：新增 `src/app/pages/system/AgentGovernanceCenter.test.tsx`，覆盖治理台概览加载、灰度规则 Tab 切换、灰度规则列表和新增规则表单占位提示。
- Kiosk 自然语言问答 smoke：复用并通过 `packages/Ami-Aura-Lite-Kiosk/src/app/microApps/runMicroApp.test.ts` 与 `packages/Ami-Aura-Lite-Kiosk/src/app/components/AgentMessageItem.test.tsx`，覆盖自然语言问答入口、微应用运行和 Agent 消息展示。
- 高风险动作阻断 smoke：通过 `packages/server-v2/src/agent-v2/policy/agent-v2-policy-gateway.service.spec.ts`、`packages/server-v2/src/agent-v2/agent-v2-runtime.service.spec.ts` 和 `packages/server-v2/src/agent/agent-safety-static.spec.ts`，覆盖策略网关、运行时阻断和静态安全规则。

#### 验证命令

```powershell
npx.cmd vitest run src/app/pages/system/AgentGovernanceCenter.test.tsx packages/Ami-Aura-Lite-Kiosk/src/app/microApps/runMicroApp.test.ts packages/Ami-Aura-Lite-Kiosk/src/app/components/AgentMessageItem.test.tsx

npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/policy/agent-v2-policy-gateway.service.spec.ts src/agent-v2/agent-v2-runtime.service.spec.ts src/agent/agent-safety-static.spec.ts --runInBand
```

验证结果：

- 管理端治理中心 + Kiosk smoke：3 个测试文件通过，50 个测试通过。
- 后端高风险阻断 smoke：3 个测试套件通过，33 个测试通过。

#### 交付边界

- 生产 API hook URL 与 deploy token 仍按后续配置项预留，不阻塞当前本地开发、测试、灰度和手动发布。
- 当前未写入 GitHub Secrets，未触发生产 deploy hook，避免在生产 API 域名未稳定前产生外部副作用。
- 旧正则退役仍必须等待 7 天 shadow 对比、线上有用率、失败率、成本和可回滚验证；本轮只完成本地闭环，不把旧链路删除标记为完成。

### 2026-07-05 22:58 Asia/Shanghai 图谱 override 合并报告增强

本轮继续补齐图谱治理闭环中的一个本地工程缺口：`kg:generate` 不再只统计人工覆盖数量，而是会对每条 active override 输出合并结果，区分 `adopted`、`skipped` 和 `conflict`。这让产品和研发能在报告里看到人工同义词/互斥关系是否真的进入图谱，或者因为节点不存在、字段不完整、关系类型不匹配而没有生效。

#### 本轮已完成

- [x] `KnowledgeGraphCoverageReport.manualOverrides` 增加 `adopted`、`skipped`、`conflicts` 和 `details`。
- [x] builder 合并前校验人工覆盖：
  - 同义词覆盖必须有 `value` 和有效 `targetNodeId`。
  - 互斥覆盖必须有有效 `sourceNodeId` 和 `targetNodeId`。
  - 节点不存在的覆盖不再生成无效边，改为进入 `conflict` 报告。
  - 关系类型或字段不完整的覆盖进入 `skipped` 报告。
- [x] `knowledge-graph-report.md` 新增“人工覆盖合并”段落，展示每条覆盖的状态和原因。
- [x] 新增单测覆盖正常采纳、节点冲突和字段缺失三类场景。

#### 本轮验证

```powershell
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/knowledge-graph/knowledge-graph-builder.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run kg:generate
npm.cmd --prefix packages/server-v2 run kg:generate:strict
```

验证结果：

- 图谱 builder 单测通过：1 个测试文件、2 个用例通过。
- `kg:generate` 与 `kg:generate:strict` 通过：3576 nodes、4109 edges、0 blockers、4 warnings。
- 当前 active override 为 0，生成报告展示：人工覆盖 0（已采纳 0、跳过 0、冲突 0），并输出“无人工覆盖”。
- 报告位置：`docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/knowledge-graph-report.md`。

#### 剩余边界

- 这一步完成的是本地生成器和报告闭环；生产库里有真实 active override 后，需要重新运行 `kg:generate` 才会看到实际采纳/冲突明细。
- 生产自动触发仍等待 `AGENT_V2_DEPLOY_HOOK_URL` 与 deploy token 配置。
- 旧正则退役仍必须等待 7 天 shadow、线上有用率、失败率、成本和可回滚验证。

### 2026-07-05 23:04 Asia/Shanghai M4 补齐：navigation.open Manifest 驱动

本轮继续推进 M4 通用执行层覆盖面。当前可以确认：`navigation.open` 不再只靠 `AgentV2NavigationService` 里的 capabilityId 硬编码分支，而是从已启用 Manifest 中读取 `executor.tool=navigation.open`、`executor.queryKey` 和 `sourceApis`，再生成终端动作或管理端路由导航。这意味着后续新增低风险导航入口时，主要改 Manifest 声明即可，不需要继续扩服务分支。

#### 本轮已完成

- [x] `AgentV2NavigationService` 从 `listAgentV2CapabilityManifests()` 构建导航目标表。
- [x] 支持通过 `capabilityId` 或 `queryKey` 命中导航能力。
- [x] 从 Manifest `sourceApis` 自动解析：
  - `operation.*` -> 终端微应用动作。
  - `/...` -> 管理端路由。
  - 同时存在时输出 `terminal_or_admin_route`。
- [x] 返回结果继续保留 `actionCommand`、`terminalActionCommand`、`adminRoute`、`writeScope=none`，兼容现有 Kiosk 和管理端消费。
- [x] evidence 记录 Manifest、sourceModels、权限码和“不直接写入业务数据”的限制说明。

#### 本轮验证

```powershell
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/tools/agent-v2-navigation.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/agent-v2-runtime.service.spec.ts src/agent-v2/tools/agent-v2-navigation.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run build
```

验证结果：

- 导航服务单测通过：1 个测试文件、4 个用例通过。
- Runtime + Navigation 回归通过：2 个测试文件、24 个用例通过。
- `server-v2` build 通过。

#### 剩余边界

- `metric.query` 已完成 Manifest/queryKey 驱动入口；复杂指标口径继续沿用专用算法，后续需要继续做真实数据校准和更多 GenericQueryEngine 聚合下沉。
- 生产自动触发仍等待 `AGENT_V2_DEPLOY_HOOK_URL` 与 deploy token 配置。
- 旧正则退役仍必须等待 7 天 shadow、线上有用率、失败率、成本和可回滚验证。

### 2026-07-05 23:14 Asia/Shanghai M4 补齐：metric.query Manifest/queryKey 驱动

本轮继续推进 M4 通用执行层覆盖面。当前可以确认：`business.metric.query` 不再只按 `capabilityId` 硬编码分支，而是先从已启用 Manifest 中解析 `executor.tool=business.metric.query`、`executor.queryKey`、`sourceModels`、`permissionCodes` 和 `boundaryNotes`，再按 `queryKey` 调用现有日结、支付方式、退款、毛利、优惠券、风险诊断等专用指标算法。这样既保留财务/经营复杂口径，又让 Runtime 的工具计划真正以 Manifest/queryKey 为入口。

#### 本轮已完成

- [x] `AgentV2BusinessMetricQueryService` 从 `listAgentV2CapabilityManifests()` 构建指标目标表。
- [x] 支持通过 `capabilityId` 或 `queryKey` 命中指标能力。
- [x] 现有专用指标算法改由 `executeMetricKey()` 统一分发，覆盖日结、支付方式、退款、员工提成、商品/项目毛利、整体毛利、次卡销售、渠道手续费、优惠券核销、折扣风险、财务风险、多域摘要和提成优化建议。
- [x] 返回数据补充 `metricManifest`，记录 capabilityId、queryKey、sourceModels 和 permissionCodes，方便治理中心回放和排障。
- [x] 对 Manifest 已声明但执行器未接入的指标，返回 `metric_query_executor_missing`，避免静默误报为可执行。

#### 本轮验证

```powershell
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/tools/agent-v2-business-metric-query.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/agent-v2-runtime.service.spec.ts src/agent-v2/tools/agent-v2-business-metric-query.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run build
```

验证结果：

- 指标服务单测通过：1 个测试文件、16 个用例通过。
- Runtime + Metric 回归通过：2 个测试文件、36 个用例通过。
- `server-v2` build 通过。

#### 剩余边界

- 指标入口已完成 Manifest/queryKey 驱动，但部分复杂业务口径仍需要继续用真实数据做校准，不能仅凭单测宣称线上准确。
- 生产自动触发仍等待 `AGENT_V2_DEPLOY_HOOK_URL` 与 deploy token 配置。
- 旧正则退役仍必须等待 7 天 shadow、线上有用率、失败率、成本和可回滚验证。

### 2026-07-05 23:08 Asia/Shanghai M4 补齐：action.draft Manifest 驱动

本轮继续推进 M4 通用执行层覆盖面。当前可以确认：`business.action.draft` 不再只按 `capabilityId=inventory.stock.operation.draft` 硬编码命中，而是从已启用 Manifest 中读取 `executor.tool=business.action.draft`、`executor.queryKey`、`sourceModels`、`permissionCodes` 和 `boundaryNotes`。库存操作草稿继续复用专业解析逻辑，未来新增动作草稿能力时可以先走 Manifest 通用草稿兜底，统一保证“不直接写入业务数据”。

#### 本轮已完成

- [x] `AgentV2BusinessActionDraftService` 从 `listAgentV2CapabilityManifests()` 构建动作草稿目标表。
- [x] 支持通过 `capabilityId` 或 `queryKey` 命中动作草稿能力。
- [x] `inventory.stock-operation-draft` 继续生成库存操作草稿，但 actionDraft 中补充 `capabilityId` 与 `queryKey`，方便治理追踪。
- [x] evidence 从 Manifest 读取 sourceModels、permissionCodes 和 boundaryNotes，继续明确“不直接写入 StockMovement”。
- [x] 对未来 Manifest 声明的动作草稿提供通用兜底：只生成 `approval_required` 草稿和审批动作，不执行写入。

#### 本轮验证

```powershell
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/tools/agent-v2-business-action-draft.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/agent-v2-runtime.service.spec.ts src/agent-v2/tools/agent-v2-business-action-draft.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run build
```

验证结果：

- 动作草稿服务单测通过：1 个测试文件、2 个用例通过。
- Runtime + ActionDraft 回归通过：2 个测试文件、22 个用例通过。
- `server-v2` build 通过。

#### 剩余边界

- `metric.query` 已在 23:14 补齐 Manifest/queryKey 驱动入口；后续仍需继续做真实数据校准和更多 GenericQueryEngine 聚合下沉。
- 生产自动触发仍等待 `AGENT_V2_DEPLOY_HOOK_URL` 与 deploy token 配置。
- 旧正则退役仍必须等待 7 天 shadow、线上有用率、失败率、成本和可回滚验证。

### 2026-07-05 23:22 Asia/Shanghai M4 补齐：支付方式拆分指标下沉 GenericQueryEngine

本轮继续响应“预留后续配置，当前先本地闭环”的要求，不把生产 API hook 当作当前阻塞项，而是继续补齐本地可验证的通用执行能力。当前可以确认：`finance.payment-method-breakdown.metric` 已从“Metric 专用服务直接查表”推进为“Manifest 命中后优先交给 `GenericQueryEngine` 执行”，并继续保留原专用算法作为兜底。产品交付上，这代表支付方式拆分已经具备统一的 query trace、SQL 摘要、字段策略和 evidence，可进入治理中心回放。

#### 本轮已完成

- [x] `GenericQueryEngineService` 支持 `finance.payment-method-breakdown.metric`。
- [x] 通用引擎按 `PaymentRecord.method` 聚合收款金额、支付笔数、订单数和最近收款时间。
- [x] 查询受 `order.storeId` 门店过滤限制，默认最多读取 2000 条支付流水，避免无边界全表扫描。
- [x] 返回 `queryTrace.engine=generic_query_engine`、`kind=metric.query`、`sourceModel=PaymentRecord`、`sqlSummary` 和字段策略列表。
- [x] `AgentV2BusinessMetricQueryService` 在 Manifest 能被通用引擎承接时优先委托 GenericQueryEngine；未迁移指标继续走现有专用算法。
- [x] 返回结果继续补充 `metricManifest`，方便治理中心按 capabilityId/queryKey/sourceModels/permissionCodes 回放。

#### 本轮验证

```powershell
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/query-engine/generic-query-engine.service.spec.ts src/agent-v2/tools/agent-v2-business-metric-query.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/agent-v2-runtime.service.spec.ts src/agent-v2/query-engine/generic-query-engine.service.spec.ts src/agent-v2/tools/agent-v2-business-metric-query.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run build
```

验证结果：

- GenericQueryEngine + Metric 服务单测通过：2 个测试文件、22 个用例通过。
- Runtime + GenericQueryEngine + Metric 回归通过：3 个测试文件、42 个用例通过。
- `server-v2` build 通过。

#### 剩余边界

- 本轮只完成支付方式拆分这一条指标的通用引擎下沉；日结、退款、毛利、提成、优惠券、风险诊断等复杂口径仍继续保留专用算法，后续按真实数据校准后逐步迁移。
- 生产自动触发按用户要求先预留配置，不影响本地闭环；后续等生产 API 域名稳定后再配置 `AGENT_V2_DEPLOY_HOOK_URL` 与 deploy token。
- 旧正则退役仍必须等待 7 天 shadow、线上有用率、失败率、成本和可回滚验证。

### 2026-07-05 23:27 Asia/Shanghai M4 补齐：财务 P0 指标通用引擎扩展

本轮在支付方式拆分基础上继续推进 M4 第一批财务指标下沉。当前可以确认：`finance.daily-settlement.metric`、`finance.payment-method-breakdown.metric`、`finance.refund.metric` 三条 P0 财务问数能力已可由 `GenericQueryEngine` 承接；Metric 专用服务保留为未迁移指标的兜底。这让日结、支付方式、退款三类常见经营问数具备统一的门店过滤、时间范围、字段策略、query trace、SQL 摘要和 evidence。

#### 本轮已完成

- [x] `GenericQueryEngineService` 支持 `finance.daily-settlement.metric`。
- [x] `GenericQueryEngineService` 支持 `finance.refund.metric`。
- [x] 日结指标按 `DailySettlement.settleDate` 和 `storeId` 查询，汇总实收、退款、净收、订单数和客户数。
- [x] 退款指标按 `RefundRecord.refundedAt/createdAt` 和 `order.storeId` 查询，汇总退款笔数、金额并对退款原因执行字段脱敏。
- [x] 三条财务指标都返回 `queryTrace.kind=metric.query`、`sqlSummary.sensitiveValuesRedacted=true`、Manifest 字段策略和 evidence 限制说明。
- [x] `AgentV2BusinessMetricQueryService` 自动优先使用通用引擎；尚未迁移的毛利、提成、优惠券、风险诊断等复杂指标继续走专用算法。

#### 本轮验证

```powershell
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/query-engine/generic-query-engine.service.spec.ts src/agent-v2/tools/agent-v2-business-metric-query.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/agent-v2-runtime.service.spec.ts src/agent-v2/query-engine/generic-query-engine.service.spec.ts src/agent-v2/tools/agent-v2-business-metric-query.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run build
```

验证结果：

- GenericQueryEngine + Metric 服务单测通过：2 个测试文件、24 个用例通过。
- Runtime + GenericQueryEngine + Metric 回归通过：3 个测试文件、44 个用例通过。
- `server-v2` build 通过。

#### 剩余边界

- 财务毛利、提成、优惠券、渠道手续费、风险诊断仍属于复杂业务口径，当前继续使用专用算法；后续迁移前需要按真实数据核对公式和字段来源。
- 生产自动触发继续按用户要求只预留配置，等生产 API 域名稳定后再配置 `AGENT_V2_DEPLOY_HOOK_URL` 与 deploy token。
- 旧正则退役仍必须等待 7 天 shadow、线上有用率、失败率、成本和可回滚验证。

### 2026-07-05 23:31 Asia/Shanghai M4 补齐：会员卡开卡与充值记录下沉 GenericQueryEngine

本轮继续推进 M4 记录类查询下沉。当前可以确认：`order.member-card.records.list` 已和商品订单、项目订单一样，进入 `GenericQueryEngine` 的 ProductOrder 通用记录适配器；这类“订单主表 + 明细 + 支付/退款”的低风险只读查询，后续新增时优先通过 Manifest/queryKey 和通用适配器承接，不再扩专用分支。

#### 本轮已完成

- [x] `GenericQueryEngineService` 支持 `order.member-card.records`。
- [x] 通用订单适配器按 `ProductOrder.orderKind in member_card_recharge/member_card_open/stored_value/recharge` 或 `OrderItem.itemType in member_card/member-card/stored_value/recharge` 查询。
- [x] 查询继续受 `storeId`、时间范围、limit 和 Manifest 字段策略约束。
- [x] 返回 `queryTrace.engine=generic_query_engine`、`queryKey=order.member-card.records`、`sourceModel=ProductOrder` 和 SQL 摘要。
- [x] `AgentV2BusinessRecordQueryService` 通过已有 GenericQueryEngine adapter 自动命中新能力，未迁移记录继续走专用服务。

#### 本轮验证

```powershell
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/query-engine/generic-query-engine.service.spec.ts src/agent-v2/tools/agent-v2-business-record-query.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/agent-v2-runtime.service.spec.ts src/agent-v2/query-engine/generic-query-engine.service.spec.ts src/agent-v2/tools/agent-v2-business-record-query.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run build
npm.cmd --prefix packages/server-v2 run agent-v2:eval-gate:strict
```

验证结果：

- GenericQueryEngine + Record 服务单测通过：2 个测试文件、21 个用例通过。
- Runtime + GenericQueryEngine + Record 回归通过：3 个测试文件、41 个用例通过。
- `server-v2` build 通过。

#### 剩余边界

- 次卡开卡订单、次卡核销、次卡沉睡客户、客户消费记录依赖 `CustomerCard`、`CardUsageRecord`、`ConsumptionRecord` 等专用业务口径，本轮不强行迁移。
- 生产自动触发继续按用户要求只预留配置，等生产 API 域名稳定后再配置 `AGENT_V2_DEPLOY_HOOK_URL` 与 deploy token。
- 旧正则退役仍必须等待 7 天 shadow、线上有用率、失败率、成本和可回滚验证。

### 2026-07-05 23:38 Asia/Shanghai M5 补齐：V2 EvidenceService 标准化

本轮继续推进 M5 安全、证据和契约强化。当前可以确认：Agent V2 不再只复用旧 `AgentEvidenceService.merge()` 的基础 source/filter/sample 合并，而是新增 `AgentV2EvidenceService`，在运行级 `evidenceJson` 中合并工具 evidence、字段策略审计、EvidencePolicy、GenericQueryEngine queryTrace 和脱敏 SQL 摘要。产品交付上，治理中心查看单次运行时，不只知道“数据来自哪里”，还可以看到“哪些字段被允许/脱敏/拒绝、工具查了什么、SQL 摘要是否脱敏”。

#### 本轮已完成

- [x] 新增 `packages/server-v2/src/agent-v2/evidence/agent-v2-evidence.service.ts`。
- [x] `AgentEvidence` 扩展可选字段：`fieldPolicy`、`evidencePolicy`、`queryTraces`、`sqlSummaries`。
- [x] `AgentV2OrchestratorService` 改用 `AgentV2EvidenceService.merge()` 写入运行级 `evidenceJson`。
- [x] `AgentV2Module` 注册并导出 V2 EvidenceService。
- [x] V2 证据汇总保留原 source/sourceTables/dateRange/metricDefinition/filters/sampleSize/limitations，同时补充字段策略和 query trace。
- [x] 无工具 evidence 时仍返回 undefined，不伪造业务证据；ContractValidator 继续负责阻断缺 evidence 的能力回答。

#### 本轮验证

```powershell
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/evidence/agent-v2-evidence.service.spec.ts src/agent-v2/policy/agent-v2-policy-gateway.service.spec.ts src/agent-v2/contracts/agent-v2-answer-contract-validator.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/evidence/agent-v2-evidence.service.spec.ts src/agent-v2/agent-v2-runtime.service.spec.ts src/agent-v2/query-engine/generic-query-engine.service.spec.ts src/agent-v2/tools/agent-v2-business-metric-query.service.spec.ts src/agent-v2/tools/agent-v2-business-record-query.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run build
```

验证结果：

- Evidence + Policy + Contract 单测通过：3 个测试文件、18 个用例通过。
- Evidence + Runtime + GenericQueryEngine + Metric + Record 回归通过：5 个测试文件、60 个用例通过。
- `server-v2` build 通过。

#### 剩余边界

- 治理中心运行详情已能从 `evidenceJson` / replay 中看到 queryTrace 和 SQL 摘要；后续还可以把字段策略摘要做成更结构化的前端卡片。
- 生产自动触发继续按用户要求只预留配置，等生产 API 域名稳定后再配置 `AGENT_V2_DEPLOY_HOOK_URL` 与 deploy token。
- 旧正则退役仍必须等待 7 天 shadow、线上有用率、失败率、成本和可回滚验证。

### 2026-07-05 23:43 Asia/Shanghai M8/M9 补齐：治理中心运行证据审计面板

本轮把上一轮新增的 V2 运行级 evidence 落到管理端可读界面。当前可以确认：`AgentGovernanceCenter` 的运行详情弹窗不再只展示原始 JSON，而是优先显示“证据审计”面板，产品经理可以直接看到来源表、样本量、过滤条件、字段策略、queryTrace 和 SQL 摘要；原始链路回放、运行、工具、消息和审批 JSON 仍保留给研发排障。

#### 本轮已完成

- [x] 新增 `EvidenceAuditPanel`，从 `run.evidenceJson` 和 replay 中抽取审计信息。
- [x] 结构化展示来源表、样本量、过滤条件、字段策略计数和脱敏/拒绝/丢弃字段。
- [x] 展示 GenericQueryEngine queryTrace：queryKey、kind、sourceModel、filters。
- [x] 展示脱敏 SQL 摘要 `statementPreview`，方便定位工具实际查询路径。
- [x] 保留原始 JSON 块，兼容深度排障。

#### 本轮验证

```powershell
npx.cmd vitest run src/app/pages/system/AgentGovernanceCenter.test.tsx
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/evidence/agent-v2-evidence.service.spec.ts src/agent-v2/policy/agent-v2-policy-gateway.service.spec.ts src/agent-v2/contracts/agent-v2-answer-contract-validator.service.spec.ts --runInBand
npm.cmd run build
```

验证结果：

- 治理中心前端单测通过：1 个测试文件、2 个用例通过。
- 后端 Evidence + Policy + Contract 回归通过：3 个测试文件、18 个用例通过。
- 管理端 `npm.cmd run build` 通过。

#### 剩余边界

- 运行详情已能结构化展示证据审计；后续仍需在真实线上流量里积累 7 天 shadow 数据，才能判断旧正则是否可退役。
- 生产自动触发继续按用户要求只预留配置，等生产 API 域名稳定后再配置 `AGENT_V2_DEPLOY_HOOK_URL` 与 deploy token。
- 旧正则退役仍必须等待 7 天 shadow、线上有用率、失败率、成本和可回滚验证。

### 2026-07-05 23:50 Asia/Shanghai M4 补齐：首批记录查询下沉 GenericQueryEngine

本轮继续按“生产 hook 预留，当前先本地闭环”的口径推进 M4 本地可完成项。当前可以确认：`inventory.expiring-risk.list`、`order.card-package.records.list`、`card.usage.records.list`、`card.package.inactive-customers.list`、`customer.consumption.records.list` 已从专用记录查询分支推进为 `GenericQueryEngine` 可承接的 Manifest/queryKey 能力；旧专用实现继续保留为 fallback，不影响现有入口。

#### 本轮已完成

- [x] `GenericQueryEngineService` 支持 `inventory.expiring-risk`、`order.card-package.records`、`card.usage.records`、`card.package.inactive-customers.list`、`customer.consumption.records`。
- [x] 通用引擎按 `Product.storeId`、`Product.currentStock/safetyStock` 和 `StockBatch.expiryDate` 查询库存临期、缺货和低库存风险。
- [x] 通用引擎按 `CustomerCard.customer.storeId` 和 `createdAt` 查询次卡开卡订单，并保留 sourceOrder、办理人员、金额和有效期字段。
- [x] 通用引擎按 `CardUsageRecord.storeId` 和 `verifiedAt` 查询次卡核销流水，默认按核销时间倒序。
- [x] 通用引擎按 `CustomerCard` 余次、状态、最近一次 `CardUsageRecord` 和沉睡阈值查询次卡沉睡客户。
- [x] 通用引擎按 `ConsumptionRecord.customer.storeId` 和 `consumeTime` 查询客户消费流水，保留消费类型、消费内容、支付方式、金额和活动字段。
- [x] 次卡核销查询包含客户、门店、操作人、美容师、终端设备和来源订单，用于区分“管理端核销”和“智能终端核销”。
- [x] 返回 `queryTrace.engine=generic_query_engine`、`kind=record.query`、`sourceModel=Product/CustomerCard/CardUsageRecord/ConsumptionRecord` 和脱敏 SQL 摘要。
- [x] Evidence 分别说明库存风险不是已发生报废、次卡开卡不等于核销服务流水、核销入口不能只看终端设备、沉睡名单不自动触达、客户消费记录缺失可能代表同步链路断点。
- [x] `AgentV2BusinessRecordQueryService` 在注入 GenericQueryEngine 时优先委托通用引擎；未注入或未迁移能力继续走原专用服务回退。

#### 本轮验证

```powershell
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/query-engine/generic-query-engine.service.spec.ts src/agent-v2/tools/agent-v2-business-record-query.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/agent-v2-runtime.service.spec.ts src/agent-v2/query-engine/generic-query-engine.service.spec.ts src/agent-v2/tools/agent-v2-business-record-query.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run build
npm.cmd --prefix packages/server-v2 run agent-v2:eval-gate:strict
```

验证结果：

- GenericQueryEngine + Record 服务单测通过：2 个测试文件、27 个用例通过。
- Runtime + GenericQueryEngine + Record 回归通过：3 个测试文件、47 个用例通过。
- `server-v2` build 通过。
- `agent-v2:eval-gate:strict` 通过：650 题、P0 103 题；P0 未映射 0、P0 权限待审 0、P0 契约失败 0、P0 错路由风险 0、高风险自动发布 0。

#### 剩余边界

- M4 第一批建议落地能力中的记录、指标、趋势、详情、导航已完成本地 GenericQueryEngine/Manifest 驱动闭环；更复杂的毛利、提成、优惠券、风控诊断等仍需按真实数据口径继续校准后迁移。
- 生产自动触发继续按用户要求只预留配置，等生产 API 域名稳定后再配置 `AGENT_V2_DEPLOY_HOOK_URL` 与 deploy token。
- 旧正则退役仍必须等待 7 天 shadow、线上有用率、失败率、成本和可回滚验证。

### 2026-07-06 00:20 Asia/Shanghai M8 补齐：评测运行详情和失败回放 API

本轮继续推进治理中心的“可定位问题”能力。当前可以确认：评测运行不再只能看到列表和最新门禁报告，后端已支持按运行 ID 查看完整评测结果，并从 `resultJson.samples/gates` 中抽取失败样例，供后续前端做失败回放和问题归因。

#### 本轮已完成

- [x] 新增 `GET /api/agent-governance/eval/runs/:id`。
- [x] 新增 `GET /api/agent-governance/eval/runs/:id/failures`。
- [x] `AgentV2GovernanceService` 支持从 `AgentEvalRun.resultJson` 解析 `summary`、`metrics`、`gates`、`samples`、失败门禁和失败样例。
- [x] 失败样例支持按 `category` 过滤和分页，覆盖 `p0Unmapped`、`p0PermissionNeedsReview`、`p0ContractNotPass`、`p0WrongRouteRisk`、`runtimeMismatches`、`runtimeUnstable` 等门禁失败来源。
- [x] 同步管理端 API 类型：`AgentGovernanceEvalRunDetail`、`AgentGovernanceEvalRunFailure`、`AgentGovernanceEvalRunFailureList`。

#### 本轮验证

```powershell
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/governance/agent-v2-governance.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run build
npm.cmd run build
```

验证结果：

- 治理服务单测通过：1 个测试文件、15 个用例通过。
- `server-v2` build 通过。
- 管理端 `npm.cmd run build` 通过。

#### 剩余边界

- 单次失败样例已支持 dry-run 回放到调试规划链路；如果后续要在治理中心一键执行真实只读工具，需要继续加受控的 read-only tool replay，不执行任何写入。
- 生产自动触发继续按用户要求只预留配置，等生产 API 域名稳定后再配置 `AGENT_V2_DEPLOY_HOOK_URL` 与 deploy token。
- 旧正则退役仍必须等待 7 天 shadow、线上有用率、失败率、成本和可回滚验证。

### 2026-07-06 00:42 Asia/Shanghai M8 补齐：评测题维护和手动运行 API

本轮按“预留后续配置，当前先本地闭环”继续收口治理中心。现在生产 API hook 仍保持后续配置项，不阻塞本地开发；本地侧已经可以维护手工评测题，并把当前最新 eval gate 报告作为一次手动评测运行持久化，方便灰度前后对比和问题追踪。

#### 本轮已完成

- [x] 新增 `POST /api/agent-governance/eval/cases`，支持写入手工评测题。
- [x] 新增 `PATCH /api/agent-governance/eval/cases/:id`，支持编辑手工评测题。
- [x] `GET /api/agent-governance/eval/cases` 升级为静态 650 题与 DB 手工题合并返回。
- [x] 新增 `POST /api/agent-governance/eval/runs`，将当前 `agent-v2-eval-gate-report.json` 作为一次手动评测运行写入 `AgentEvalRun`。
- [x] 同步管理端 API 类型和 Real facade：`AgentGovernanceEvalCaseInput`、`createAgentGovernanceEvalCase`、`updateAgentGovernanceEvalCase`、`createAgentGovernanceEvalRun`。

#### 本轮验证

```powershell
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/governance/agent-v2-governance.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run build
npm.cmd run build
```

验证结果：

- 治理服务单测通过：1 个测试文件、18 个用例通过。
- `server-v2` build 通过。
- 管理端 `npm.cmd run build` 通过。

#### 剩余边界

- `POST /api/agent-governance/eval/runs` 当前只负责把最新本地 gate 报告持久化为一次治理运行，不在 HTTP 请求内直接 shell 执行评测脚本；真正的 CI/定时触发仍走 workflow 或后端受控任务。
- 生产自动触发继续只预留配置，等生产 API 域名稳定后再配置 `AGENT_V2_DEPLOY_HOOK_URL` 与 deploy token。
- 旧正则退役仍必须等待 7 天 shadow、线上有用率、失败率、成本和可回滚验证。

### 2026-07-06 01:10 Asia/Shanghai M8 补齐：评测失败样例 dry-run 回放

本轮继续把治理中心的问题定位链路往本地闭环推进。现在评测运行里的失败样例不再只能列表查看，后端可以按 `category/index` 或 `failureId` 找到具体失败样例，并直接复用 Agent V2 调试规划链路做 dry-run 回放，返回预期能力、原失败实际能力、当前回放命中能力和诊断建议。

#### 本轮已完成

- [x] 新增 `POST /api/agent-governance/eval/runs/:id/failures/replay`。
- [x] 回放支持按 `failureId` 或 `category + index` 定位失败样例。
- [x] 回放只执行 `runtime.plan` dry-run，不执行真实工具、不执行写入动作。
- [x] 输出 `comparison`：`expectedCapabilityId`、`previousActualCapabilityId`、`replayCapabilityId`、是否已命中预期、是否与原失败路由不同。
- [x] 输出 `diagnosis`：可区分缺少预期元数据、仍未映射、路由已变化但未命中预期、仍错路由、已命中预期。
- [x] 同步管理端 API 类型和 Real facade：`AgentGovernanceEvalFailureReplayRequest`、`AgentGovernanceEvalFailureReplayResult`、`replayAgentGovernanceEvalRunFailure`。

#### 本轮验证

```powershell
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/governance/agent-v2-governance.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run build
npm.cmd run build
```

验证结果：

- 治理服务单测通过：1 个测试文件、19 个用例通过。
- `server-v2` build 通过。
- 管理端 `npm.cmd run build` 通过。

#### 剩余边界

- 当前失败回放是安全 dry-run，不执行真实只读工具；如果后续需要“读工具结果 + Contract 校验 + blocks 渲染”的完整回放，需要单独加 read-only tool replay 白名单。
- 生产自动触发继续只预留配置，等生产 API 域名稳定后再配置 `AGENT_V2_DEPLOY_HOOK_URL` 与 deploy token。
- 旧正则退役仍必须等待 7 天 shadow、线上有用率、失败率、成本和可回滚验证。

### 2026-07-06 01:35 Asia/Shanghai M9 补齐：治理中心失败样例回放入口

本轮把上一轮新增的失败样例 dry-run 回放 API 接入管理端治理中心。现在产品、测试和研发可以在“评测门禁 / 评测运行历史”里打开某次运行的失败样例，查看失败分类、预期能力、实际能力和原因，并对单条失败直接触发 dry-run 回放，页面会展示当前运行时命中能力、与原失败路由的差异和诊断建议。

#### 本轮已完成

- [x] 评测运行历史新增“失败样例”操作入口。
- [x] 新增“评测失败样例”弹窗，展示失败数量、运行状态、分数、失败分类和样例列表。
- [x] 单条失败样例支持 `Dry-run 回放`，调用 `POST /api/agent-governance/eval/runs/:id/failures/replay`。
- [x] 回放结果在弹窗内展示诊断建议、预期能力、原实际能力、当前回放能力和安全边界。
- [x] 回放结果同步写入“单题调试”结果状态，方便继续做对比和 Manifest 模拟。

#### 本轮验证

```powershell
npx.cmd vitest run src/app/pages/system/AgentGovernanceCenter.test.tsx
npm.cmd run build
```

验证结果：

- AgentGovernanceCenter 前端测试通过：1 个测试文件、3 个用例通过。
- 管理端 `npm.cmd run build` 通过。

#### 剩余边界

- 当前页面回放仍是安全 dry-run，不执行真实只读工具；完整“读工具结果 + Contract 校验 + blocks 渲染”回放需要后续加 read-only tool replay 白名单。
- 生产自动触发继续只预留配置，等生产 API 域名稳定后再配置 `AGENT_V2_DEPLOY_HOOK_URL` 与 deploy token。
- 旧正则退役仍必须等待 7 天 shadow、线上有用率、失败率、成本和可回滚验证。

### 2026-07-06 01:55 Asia/Shanghai M8/M9 补齐：治理中心批量 dry-run 评测

本轮继续补齐“评测中心可批量评测”的本地闭环。现在治理中心可以直接发起一批评测题的 dry-run 评测：后端读取当前题库，逐题调用 `runtime.plan` 生成规划结果，比较 `expectedCapabilityId` 与当前命中能力，并把本次批量结果写入 `AgentEvalRun`。这样批量评测、运行历史、失败样例列表和单条失败回放已经串成一条本地治理闭环。

#### 本轮已完成

- [x] 新增 `POST /api/agent-governance/eval/runs/dry-run-batch`。
- [x] 批量评测支持按 `priority`、`limit`、`role`、`entrypoint`、`grayMode` 发起。
- [x] 批量评测只执行 `runtime.plan` dry-run，不执行真实工具和写入动作。
- [x] 批量评测结果写入 `AgentEvalRun`，并输出 `summary`、`metrics`、`gates`、`samples.p0Unmapped`、`samples.p0WrongRouteRisk`、`samples.runtimeUnstable`。
- [x] 治理中心“评测门禁”新增 `批量 Dry-run` 按钮，执行后自动刷新评测运行历史。
- [x] 前端测试覆盖批量 dry-run 按钮、失败样例弹窗和单条回放链路。

#### 本轮验证

```powershell
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/governance/agent-v2-governance.service.spec.ts --runInBand
npx.cmd vitest run src/app/pages/system/AgentGovernanceCenter.test.tsx
npm.cmd --prefix packages/server-v2 run build
npm.cmd run build
```

验证结果：

- 治理服务单测通过：1 个测试文件、20 个用例通过。
- AgentGovernanceCenter 前端测试通过：1 个测试文件、3 个用例通过。
- `server-v2` build 通过。
- 管理端 `npm.cmd run build` 通过。

#### 剩余边界

- 批量 dry-run 评测不在 HTTP 请求内执行 shell 评测脚本，也不替代 CI strict gate；生产 CI/定时任务仍按 workflow 或受控后端任务执行。
- 批量 dry-run 当前只验证能力规划是否命中预期，不执行真实只读工具，不做 Contract 校验和 blocks 渲染；完整业务回放仍需 read-only tool replay 白名单。
- 生产自动触发继续只预留配置，等生产 API 域名稳定后再配置 `AGENT_V2_DEPLOY_HOOK_URL` 与 deploy token。
- 旧正则退役仍必须等待 7 天 shadow、线上有用率、失败率、成本和可回滚验证。

### 2026-07-06 02:25 Asia/Shanghai M8/M9 补齐：失败样例只读工具回放

本轮继续按“预留后续配置，当前先本地闭环”推进。现在评测中心已经形成更完整的本地排障闭环：批量 dry-run 生成运行记录，失败样例可打开列表，单条失败可先看规划命中，也可以显式触发只读工具回放，拿到真实查询工具返回结果。生产 API hook 仍只预留 URL/token 配置，不影响当前本地开发、测试和灰度。

#### 本轮已完成

- [x] `POST /api/agent-governance/eval/runs/:id/failures/replay` 新增 `toolReplay` 可选开关；默认仍是纯 dry-run，不执行工具。
- [x] 后端只读工具回放增加白名单：`business.record.query`、`business.metric.query`、`business.trend.query`、`business.detail.query`、`navigation.open`。
- [x] 回放前同时检查工具定义，只允许 `riskLevel=low` 且 `requiresApproval=false` 的工具执行。
- [x] `business.action.draft` 等草稿、审批、写入或非白名单工具会被跳过，并记录 `skipped.reason`。
- [x] 回放返回 `toolReplay`，包含 `requested`、`executed`、`allowedTools`、`skipped`、`results` 和安全说明。
- [x] 管理端“评测失败样例”弹窗新增 `只读工具回放` 按钮，结果区展示只读工具回放 JSON。
- [x] 前端类型和 API facade 同步支持 `toolReplay` 请求和返回结构。

#### 本轮验证

```powershell
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/governance/agent-v2-governance.service.spec.ts --runInBand
npx.cmd vitest run src/app/pages/system/AgentGovernanceCenter.test.tsx
npm.cmd --prefix packages/server-v2 run build
npm.cmd run build
```

验证结果：

- 治理服务单测通过：1 个测试文件、22 个用例通过。
- AgentGovernanceCenter 前端测试通过：1 个测试文件、3 个用例通过。
- `server-v2` build 通过。
- 管理端 `npm.cmd run build` 通过。

#### 剩余边界

- 只读工具回放已能拿到工具结果，但还没有把 Contract 校验、最终 answer blocks 渲染、LLM Prompt/Response 串成完整可视化回放。
- 批量 dry-run 仍只验证能力规划命中，不批量执行真实工具；避免 HTTP 请求里做大规模真实查询。
- 生产自动触发继续只预留配置，等生产 API 域名稳定后再配置 `AGENT_V2_DEPLOY_HOOK_URL` 与 deploy token。
- 旧正则退役仍必须等待 7 天 shadow、线上有用率、失败率、成本和可回滚验证。

### 2026-07-06 02:45 Asia/Shanghai M8/M9 补齐：只读回放的 Contract 与 blocks 校验

本轮继续把失败样例回放从“查得到工具结果”推进到“能判断工具结果是否满足输出契约”。现在单条失败样例开启 `只读工具回放` 后，后端会基于工具结果生成基础回答、summary/table/kpi/chart/evidence/action blocks，并调用 Agent V2 的 `validateAnswer` 做 Contract 校验；管理端同步展示 `契约与渲染回放` JSON。这个能力仍不创建真实 AgentRun，也不写业务数据。

#### 本轮已完成

- [x] `replayEvalRunFailure` 在 `toolReplay=true` 时追加 `contractReplay`。
- [x] `contractReplay` 包含 `answer`、`renderedBlocks`、`answerContract`、`phaseOutputs` 和状态说明。
- [x] 复用 Agent V2 `runtime.validateAnswer`，不新增另一套契约判断口径。
- [x] 基础 blocks 支持 `summary_text`、`table`、`kpi_card`、`chart`、`evidence_panel`、`data_gap`、`action_card`。
- [x] Contract 不通过时返回拦截提示和 `alert` block，避免把不可靠结论当成已通过。
- [x] 管理端失败样例弹窗展示 `契约与渲染回放`。
- [x] 前端类型和测试同步覆盖 `contractReplay`。

#### 本轮验证

```powershell
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/governance/agent-v2-governance.service.spec.ts --runInBand
npx.cmd vitest run src/app/pages/system/AgentGovernanceCenter.test.tsx
npm.cmd --prefix packages/server-v2 run build
npm.cmd run build
```

验证结果：

- 治理服务单测通过：1 个测试文件、22 个用例通过。
- AgentGovernanceCenter 前端测试通过：1 个测试文件、3 个用例通过。
- `server-v2` build 通过。
- 管理端 `npm.cmd run build` 通过。

#### 剩余边界

- 当前 `contractReplay` 是治理回放态，不创建真实 `AgentRun`、不记录消息和步骤；真实运行链路仍由 Agent V2 orchestrator 负责。
- 还没有把真实 LLM Prompt/Response 纳入可视化回放；当前回放答案来自工具摘要和基础 blocks。
- 批量 dry-run 仍只验证能力规划命中，不批量执行真实工具。
- 生产自动触发继续只预留配置，等生产 API 域名稳定后再配置 `AGENT_V2_DEPLOY_HOOK_URL` 与 deploy token。
- 旧正则退役仍必须等待 7 天 shadow、线上有用率、失败率、成本和可回滚验证。

### 2026-07-06 01:13 Asia/Shanghai M10 补齐：LLM Prompt/Response 可观测 trace

本轮继续补齐可视化调试器的“为什么这么理解”能力。现在 Agent V2 意图抽取在调用 AI Gateway 时，会生成可审计的 Prompt/Response trace：包含 system prompt、用户 payload 预览、图谱上下文数量、Active Manifest 数量、输出 schema keys、LLM 原始响应预览和 JSON 解析状态。治理中心单题调试接口改为 async plan，能在调试结果里返回 `intentTrace` 与 `llmTrace`，页面单独展示 `LLM Prompt / Response`。

#### 本轮已完成

- [x] `StructuredIntent.trace` 新增 `llmPrompt` 和 `llmResponse`。
- [x] `IntentExtractionService` 将 LLM prompt 构造拆成可审计对象，保留 prompt payload 预览和上下文数量。
- [x] LLM JSON 有效时记录 `parsed=true`、`parsedKeys` 和 response preview。
- [x] LLM 不可用或 JSON 无效时，降级到 KG fallback，同时保留 fallback reason、prompt trace 和 response preview。
- [x] `POST /api/agent-governance/debug/execute` 改用 async plan，能在 AI Gateway 已注册时走真实 LLM 意图抽取。
- [x] debug 返回新增 `intentTrace`、`llmTrace`；链路回放新增 `llm_prompt_response` phase。
- [x] 管理端单题调试结果新增 `LLM Prompt / Response` 独立区块。

#### 本轮验证

```powershell
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/intent/agent-v2-intent-extraction.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/governance/agent-v2-governance.service.spec.ts --runInBand
npx.cmd vitest run src/app/pages/system/AgentGovernanceCenter.test.tsx
npm.cmd --prefix packages/server-v2 run build
npm.cmd run build
```

验证结果：

- Intent extraction 单测通过：1 个测试文件、8 个用例通过。
- 治理服务单测通过：1 个测试文件、23 个用例通过。
- AgentGovernanceCenter 前端测试通过：1 个测试文件、3 个用例通过。
- `server-v2` build 通过。
- 管理端 `npm.cmd run build` 通过。

#### 剩余边界

- 本轮证明的是 Prompt/Response trace 的本地可观测能力；真实生产 LLM Key、模型成本、失败率和延迟观测仍需生产环境配置。
- debug/execute 已可走 async LLM 抽取；批量 dry-run 仍保持规划层同步执行，避免批量触发真实 LLM 和真实工具。
- 生产自动触发继续只预留配置，等生产 API 域名稳定后再配置 `AGENT_V2_DEPLOY_HOOK_URL` 与 deploy token。
- 旧正则退役仍必须等待 7 天 shadow、线上有用率、失败率、成本和可回滚验证。

### 2026-07-06 01:23 Asia/Shanghai M10 补齐：单题调试只读工具执行与 Contract/blocks 回放

本轮继续按“预留后续配置，当前先本地闭环”的口径推进。现在治理中心的 `单题调试` 不再只能看规划结果：产品、研发或实施可以显式点击 `只读工具执行`，后端会复用低风险只读白名单执行查询类工具，并把工具返回、基础回答、Contract 校验和最终 blocks 一起返回页面。这个能力仍是本地治理回放态，不创建真实 AgentRun，不执行草稿、审批或写入动作。

#### 本轮已完成

- [x] `POST /api/agent-governance/debug/execute` 支持 `toolReplay=true`。
- [x] 普通 `执行计划` 仍只生成 dry-run 规划，不默认执行工具。
- [x] 单题调试只执行低风险只读白名单工具：`business.record.query`、`business.metric.query`、`business.trend.query`、`business.detail.query`、`navigation.open`。
- [x] 非白名单、高风险、需要审批或写入类工具继续跳过。
- [x] 单题调试返回 `toolReplay`，可查看工具、入参、状态、摘要、数据、证据和 actions。
- [x] 单题调试返回 `contractReplay`，可查看基础回答、`renderedBlocks`、`answerContract` 和 `phaseOutputs`。
- [x] 管理端 `单题调试` 新增 `只读工具执行` 按钮，并单独展示 `只读工具执行`、`契约与最终 blocks`。
- [x] 前端类型和测试同步覆盖 `toolReplay`、`contractReplay` 和显式开关。

#### 本轮验证

```powershell
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/governance/agent-v2-governance.service.spec.ts --runInBand
npx.cmd vitest run src/app/pages/system/AgentGovernanceCenter.test.tsx
npm.cmd --prefix packages/server-v2 run build
npm.cmd run build
```

验证结果：

- 治理服务单测通过：1 个测试文件、24 个用例通过。
- AgentGovernanceCenter 前端测试通过：1 个测试文件、4 个用例通过。
- `server-v2` build 通过。
- 管理端 `npm.cmd run build` 通过。

#### 剩余边界

- 生产自动触发继续按用户要求只预留配置；等生产 API 域名稳定后再配置 `AGENT_V2_DEPLOY_HOOK_URL` 与 deploy token。
- 当前单题调试没有批量执行真实工具；批量 dry-run 仍保持规划层验证，避免大批量查询影响本地或生产环境。
- `query plan / SQL 摘要` 已在后续 M10 本地闭环中补成独立调试摘要区块。
- 调试页面敏感字段兜底脱敏已在后续 M10 本地闭环中补齐；运行期字段策略仍由 PolicyGateway、EvidenceService 和 ContractValidator 端到端约束。
- 旧正则退役仍必须等待 7 天 shadow、线上有用率、失败率、成本和可回滚验证。

### 2026-07-06 01:30 Asia/Shanghai M10 补齐：Query Plan / SQL 摘要独立展示

本轮继续补齐治理中心单题调试的可解释性。现在单题调试和失败样例只读回放在执行低风险只读工具后，会从工具返回里抽取 `queryTrace` 与 `sqlSummary`，生成独立的 `queryReplay`；管理端同步展示 `Query Plan / SQL 摘要` 面板，直接看到 queryKey、查询模型、过滤条件和脱敏 SQL 摘要，不再需要产品或研发翻完整 JSON 才能判断本次查询链路是否正确。

#### 本轮已完成

- [x] 后端 `debug/execute` 在 `toolReplay=true` 时返回 `queryReplay`。
- [x] 后端失败样例 `failures/replay` 在 `toolReplay=true` 时同步返回 `queryReplay`。
- [x] `queryReplay` 从只读工具结果的 `data.queryTrace`、`data.sqlSummary`、`evidence.queryTraces`、`evidence.sqlSummaries` 中抽取并去重。
- [x] 管理端新增 `Query Plan / SQL 摘要` 面板，展示 Trace/SQL 数量、queryKey、sourceModel、filters 和 `statementPreview`。
- [x] 失败样例弹窗同步展示 `Query Plan / SQL 回放`，和单题调试使用同一套结构化展示。
- [x] 前后端测试覆盖 queryReplay 返回、面板渲染和 SQL 摘要展示。

#### 本轮验证

```powershell
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/governance/agent-v2-governance.service.spec.ts --runInBand
npx.cmd vitest run src/app/pages/system/AgentGovernanceCenter.test.tsx
npm.cmd --prefix packages/server-v2 run build
npm.cmd run build
```

验证结果：

- 治理服务单测通过：1 个测试文件、24 个用例通过。
- AgentGovernanceCenter 前端测试通过：1 个测试文件、4 个用例通过。
- `server-v2` build 通过。
- 管理端 `npm.cmd run build` 通过。

#### 剩余边界

- `Query Plan / SQL 摘要` 依赖工具返回提供 `queryTrace/sqlSummary`；没有接入 GenericQueryEngine 的旧专用工具仍可能只展示工具返回，不展示 SQL。
- 敏感字段脱敏仍需继续以 PolicyGateway、EvidenceService 和 ContractValidator 的端到端验证收口。
- 生产自动触发继续按用户要求只预留配置；等生产 API 域名稳定后再配置 `AGENT_V2_DEPLOY_HOOK_URL` 与 deploy token。
- 旧正则退役仍必须等待 7 天 shadow、线上有用率、失败率、成本和可回滚验证。

### 2026-07-06 01:37 Asia/Shanghai M10 补齐：调试页面敏感字段脱敏

本轮继续补齐治理中心调试链路的安全验收。现在单题调试和失败样例只读回放在返回 `toolReplay`、`queryReplay`、`contractReplay` 前，后端会对手机号、token、openid、unionid、password、secret、证件、地址、邮箱等敏感字段做通用脱敏；管理端 JSON 展示层也新增兜底脱敏，Query 面板中的过滤条件和 SQL 文本同样会替换手机号。产品交付上，这代表治理台可以继续给产品、实施和研发做本地排障，不会因为旧专用工具或 mock 返回原始手机号而直接暴露到页面。

#### 本轮已完成

- [x] 后端治理回放返回前对只读工具结果 `summary/data/evidence/actions` 做敏感值清洗。
- [x] `contractReplay` 使用脱敏后的工具结果生成 answer 和 blocks，避免最终 blocks 泄露原始手机号。
- [x] 管理端 `JsonBlock` 默认对所有治理 JSON 做敏感字段兜底脱敏。
- [x] 管理端 Query Plan / SQL 面板对 filters 和 `statementPreview` 做手机号脱敏兜底。
- [x] 保留字段策略审计里的字段名，例如 `maskedFields/deniedFields/customerPhone`，不把“字段名”误处理为敏感值。
- [x] 前后端测试均覆盖“mock/旧工具返回原始手机号和 token，页面与回放结果只展示脱敏值”。

#### 本轮验证

```powershell
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/governance/agent-v2-governance.service.spec.ts --runInBand
npx.cmd vitest run src/app/pages/system/AgentGovernanceCenter.test.tsx
npm.cmd --prefix packages/server-v2 run build
npm.cmd run build
```

验证结果：

- 治理服务单测通过：1 个测试文件、24 个用例通过。
- AgentGovernanceCenter 前端测试通过：1 个测试文件、4 个用例通过。
- `server-v2` build 通过。
- 管理端 `npm.cmd run build` 通过。

#### 剩余边界

- 本轮完成的是治理调试页面的兜底脱敏；运行期字段策略仍继续由 PolicyGateway、EvidenceService 和 ContractValidator 负责端到端约束。
- `Policy 决策` 独立展示已在后续 M10 本地闭环中补齐。
- 生产自动触发继续按用户要求只预留配置；等生产 API 域名稳定后再配置 `AGENT_V2_DEPLOY_HOOK_URL` 与 deploy token。
- 旧正则退役仍必须等待 7 天 shadow、线上有用率、失败率、成本和可回滚验证。

### 2026-07-06 01:48 Asia/Shanghai M10 补齐：Policy 决策独立展示

本轮继续按“预留后续配置，当前先本地闭环”的产品边界推进。现在治理中心的单题调试和失败样例只读回放都会返回 `policyTrace`，管理端新增 `Policy 决策` 面板，把能力状态、发布策略、门店/角色/权限、工具角色、审批要求和字段策略集中展示出来。产品交付上，这代表一次问答被阻断、需要审批或允许执行时，不再只能翻后端日志判断原因，可以直接在治理台完成本地排障和灰度前验收。

#### 本轮已完成

- [x] 后端 `debug/execute` 返回 `policyTrace`，覆盖 capability、tool、actor、fieldPolicySummary 和 checks。
- [x] 失败样例 `failures/replay` 同步返回 `policyTrace`，并复用同一套策略检查结果。
- [x] `policy_boundary` 调试阶段从占位文本升级为结构化 Policy 决策数据。
- [x] 管理端新增 `Policy 决策` 面板，展示允许执行、需要确认、已阻断或不适用状态。
- [x] 单题调试和评测失败回放都展示 Policy 决策，和 LLM trace、Query Plan、工具返回、Contract 回放形成同一条本地闭环链路。
- [x] 前后端测试覆盖 Policy trace 返回、字段策略摘要和页面渲染。

#### 本轮验证

```powershell
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/governance/agent-v2-governance.service.spec.ts --runInBand
npx.cmd vitest run src/app/pages/system/AgentGovernanceCenter.test.tsx
npm.cmd --prefix packages/server-v2 run build
npm.cmd run build
```

验证结果：

- 治理服务单测通过：1 个测试文件、24 个用例通过。
- AgentGovernanceCenter 前端测试通过：1 个测试文件、4 个用例通过。
- `server-v2` build 通过。
- 管理端 `npm.cmd run build` 通过。

#### 剩余边界

- T10.1 的“输入问题、门店、角色、入口、Manifest 版本”和“图谱预处理结果”已在后续 M10 本地闭环中补齐。
- 生产自动触发继续按用户要求只预留配置；等生产 API 域名稳定后再配置 `AGENT_V2_DEPLOY_HOOK_URL` 与 deploy token。
- 本轮没有配置 GitHub Secrets、没有写生产环境变量、没有触发生产 API hook。
- 旧正则退役仍必须等待 7 天 shadow、线上有用率、失败率、成本和可回滚验证。

### 2026-07-06 01:58 Asia/Shanghai M10 收口：调试输入上下文和图谱预处理展示

本轮继续按“预留后续配置，当前先本地闭环”的口径推进。现在治理中心单题调试不再隐含门店和 Manifest 版本：页面可输入门店、角色、入口和灰度模式，后端返回 `debugContext`，明确本次问题、门店、角色、入口、灰度模式、active Manifest 版本和 dry-run 边界。同时，后端把运行时已有的 intent trace 整理为 `graphTrace`，管理端新增 `图谱预处理` 面板，展示归一化问题、对象提示、领域提示、候选能力、互斥提醒和图谱上下文计数。

产品交付上，这代表 T10.1 的调试执行链路已经可以在一个页面内回答“用户问了什么、在哪个门店/入口问、当前用哪个 Manifest、图谱先怎么理解、LLM 怎么抽取、Manifest 怎么匹配、Policy 为什么允许或阻断、工具查了什么、Contract/blocks 最后是什么”。本轮仍然只做本地 dry-run/只读回放，不执行真实写入。

#### 本轮已完成

- [x] 后端 `debug/execute` 返回 `debugContext`，包含问题、门店、角色、入口、灰度模式、active Manifest 版本和 dry-run 标记。
- [x] 后端 `debug/execute` 返回 `graphTrace`，把 intent trace 中的 normalizedQuestion、objectHints、domainHints、capabilityHints、exclusions 和图谱上下文计数整理成结构化调试数据。
- [x] `replay.phases` 新增 `debug_input` 和 `kg_preprocessing`，完整调试载荷也能按阶段回放输入上下文和图谱预处理。
- [x] 管理端单题调试新增 `storeId` 输入，并把门店带入调试请求。
- [x] 管理端新增 `调试输入` 面板，展示门店、角色、入口、灰度模式和 Manifest 版本。
- [x] 管理端新增 `图谱预处理` 面板，展示对象提示、领域提示、能力提示、互斥提醒和候选能力。
- [x] 评测失败样例回放同步展示调试输入和图谱预处理，方便从失败样例直接定位图谱缺口或能力映射问题。

#### 本轮验证

```powershell
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/governance/agent-v2-governance.service.spec.ts --runInBand
npx.cmd vitest run src/app/pages/system/AgentGovernanceCenter.test.tsx
```

验证结果：

- 治理服务单测通过：1 个测试文件、24 个用例通过。
- AgentGovernanceCenter 前端测试通过：1 个测试文件、4 个用例通过。

#### 剩余边界

- T10.1 已完成；T10.2 对比模式和 T10.3 Manifest 模拟已在后续 M10 本地闭环中补齐。
- Manifest 版本本轮展示的是当前 active 版本；不同 Manifest 版本对比和临时修改 Manifest 已在后续 M10 本地闭环中补齐。
- 生产自动触发继续按用户要求只预留配置；等生产 API 域名稳定后再配置 `AGENT_V2_DEPLOY_HOOK_URL` 与 deploy token。
- 本轮没有配置 GitHub Secrets、没有写生产环境变量、没有触发生产 API hook。
- 旧正则退役仍必须等待 7 天 shadow、线上有用率、失败率、成本和可回滚验证。

### 2026-07-06 02:08 Asia/Shanghai M10 补齐：对比模式本地 dry-run 摘要

本轮继续推进 T10.2 对比模式。现在治理中心点击 `对比` 后，后端会在同一个问题、门店、角色和入口下，对 `legacy_regex`、`shadow`、`kg_llm_preferred`、`kg_llm_only` 生成 dry-run 计划，并额外对 `kg_llm_preferred` 做 5 次一致性采样。管理端新增 `对比结论` 面板，直接展示 legacy regex 与 kg_llm 的命中能力、输出形态、证据来源、调试耗时和本地成本估算差异。

产品交付上，这让产品、研发和实施能在灰度前快速判断：新链路是不是和旧链路命中同一能力、是否改变输出形态、证据来源是否一致、5 次运行是否稳定。它仍然是本地 dry-run 判断，不能替代 7 天线上 shadow 和真实成本观测。

#### 本轮已完成

- [x] 后端 `debug/compare` 输出四种模式对比：`legacy_regex`、`shadow`、`kg_llm_preferred`、`kg_llm_only`。
- [x] 后端对 `kg_llm_preferred` 做单题 5 次 dry-run 一致性采样。
- [x] 后端输出结构化 `comparison`，包含 Manifest 版本、图谱上下文、legacy vs kg_llm、差异摘要、一致性和本地结论。
- [x] 差异摘要覆盖命中能力、最终引擎、输出形态、证据来源、调试耗时和 prompt/response 字符成本估算。
- [x] 管理端新增 `对比结论` 面板，展示 Manifest 版本、legacy regex、kg_llm、5 次一致性、命中/形态/证据/延迟成本差异和本地结论。
- [x] 前后端测试覆盖对比模式结构、5 次一致性和页面展示。

#### 本轮验证

```powershell
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/governance/agent-v2-governance.service.spec.ts --runInBand
npx.cmd vitest run src/app/pages/system/AgentGovernanceCenter.test.tsx
```

验证结果：

- 治理服务单测通过：1 个测试文件、25 个用例通过。
- AgentGovernanceCenter 前端测试通过：1 个测试文件、4 个用例通过。

#### 剩余边界

- T10.2 的“不同 Manifest 版本”已在后续 M10 本地闭环中补齐；当前 02:08 版本只展示 active/selected Manifest 版本和跨模式版本漂移。
- T10.3 Manifest 模拟仍需继续补齐临时启用/禁用、triggerKeywords、negativeExamples、outputKinds 修改。
- `延迟和成本差异` 当前是本地调试耗时和 prompt/response 字符估算，不代表生产 LLM 真实费用。
- 生产自动触发继续按用户要求只预留配置；等生产 API 域名稳定后再配置 `AGENT_V2_DEPLOY_HOOK_URL` 与 deploy token。
- 本轮没有配置 GitHub Secrets、没有写生产环境变量、没有触发生产 API hook。
- 旧正则退役仍必须等待 7 天 shadow、线上有用率、失败率、成本和可回滚验证。

### 2026-07-06 02:23 Asia/Shanghai M10 补齐：Manifest 模拟本地闭环

本轮继续按“预留后续配置，当前先本地闭环”的产品边界推进。现在治理中心单题调试页已经可以在不修改 active Manifest 的前提下，临时启用/禁用某个 capability，临时叠加 `triggerKeywords`、`negativeExamples` 和 `outputKinds`，并在调试结果里展示本次模拟是否命中、是否被排除、模拟后命中能力、变更字段和正式编辑入口。

产品交付上，这代表产品、研发和实施可以先在本地 dry-run 中验证“改这个能力会不会改善路由或输出形态”，验证有效后再跳转能力中心做正式修改；生产 API hook URL 和 deploy token 继续作为后续自动化运营配置预留，不影响当前开发、测试、灰度和手动发布。

#### 本轮已完成

- [x] 后端 `debug/simulate-manifest` 支持 session 级 Manifest overlay，不写草稿、不发布版本、不污染 active Manifest。
- [x] 支持临时启用/禁用能力；禁用或负例命中时，本次调试结果会显式排除目标能力并清空工具计划。
- [x] 支持临时修改 `triggerKeywords`，命中新触发词时可在本次 dry-run 中强制选择该能力。
- [x] 支持临时修改 `negativeExamples`，命中负例时可在本次 dry-run 中排除该能力。
- [x] 支持临时修改 `outputKinds`，模拟后输出契约会反映新的 `table/chart/evidence_panel` 等形态。
- [x] 管理端单题调试页新增 Manifest 模拟参数区和结果面板，展示 `仅本次调试`、模拟 effect、patch、命中状态和 `跳转能力中心` 入口。
- [x] 前后端类型和测试补齐 `simulation` 契约，避免只靠完整 JSON 排查。

#### 本轮验证

```powershell
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/governance/agent-v2-governance.service.spec.ts --runInBand
npx.cmd vitest run src/app/pages/system/AgentGovernanceCenter.test.tsx
npm.cmd --prefix packages/server-v2 run build
npm.cmd run build
```

验证结果：

- 治理服务单测通过：1 个测试文件、26 个用例通过。
- AgentGovernanceCenter 前端测试通过：1 个测试文件、4 个用例通过。
- `server-v2` build 通过。
- 管理端 `npm.cmd run build` 通过。

#### 剩余边界

- T10.3 已完成本地闭环；T10.2 的“不同 Manifest 版本”已在后续 M10 本地闭环中补齐。
- 本轮没有配置 GitHub Secrets、没有写生产环境变量、没有触发生产 API hook。
- 生产自动触发继续按后续配置项预留；等生产 API 域名稳定后再配置 `AGENT_V2_DEPLOY_HOOK_URL` 与 deploy token。
- 旧正则退役仍必须等待 7 天 shadow、线上有用率、失败率、成本和可回滚验证。

### 2026-07-06 02:35 Asia/Shanghai M10 收口：不同 Manifest 版本对比

本轮继续补齐 T10.2 最后一个缺口：治理中心单题调试的 `对比` 模式现在可以输入目标 Manifest 版本号，在不激活版本、不刷新 Runtime 全局 active Manifest 的前提下，读取指定 `AgentCapabilityManifestVersion` 快照，基于同一问题和同一 StructuredIntent 候选生成目标版本 dry-run 规划，并输出 active vs target 的差异摘要。

产品交付上，这让产品、研发和实施可以在发布或回滚前回答“如果切到某个历史/候选 Manifest 版本，这个问题的命中能力、输出形态、证据来源是否变化”。这仍是本地 dry-run 对比，不替代真实发布后的 7 天 shadow 和线上有用率/成本/失败率观察。

#### 本轮已完成

- [x] `AgentV2ManifestProviderService` 新增指定版本只读加载能力，支持 `active`、`builtin/static` 和数据库版本快照。
- [x] `debug/compare` 支持 `compareManifestVersion`，返回 `manifestVersionComparison`。
- [x] 目标版本对比不调用 `activateVersion`，不修改 active Manifest，不触发 Runtime 全局刷新。
- [x] 对比摘要覆盖 active/target 版本、目标版本可用性、命中能力差异、输出形态差异、证据来源差异、新增/移除能力数量。
- [x] 管理端单题调试页新增“目标 Manifest 版本”输入，点击 `对比` 时才传入后端。
- [x] 管理端 `对比结论` 面板新增 `Manifest 版本对比` 区块，直接展示 active vs target 结果。
- [x] T10.2 和 M10 可视化调试器本地闭环勾选完成。

#### 本轮验证

```powershell
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/governance/agent-v2-governance.service.spec.ts --runInBand
npx.cmd vitest run src/app/pages/system/AgentGovernanceCenter.test.tsx
npm.cmd --prefix packages/server-v2 run build
npm.cmd run build
```

验证结果：

- 治理服务单测通过：1 个测试文件、26 个用例通过。
- AgentGovernanceCenter 前端测试通过：1 个测试文件、4 个用例通过。
- `server-v2` build 通过。
- 管理端 `npm.cmd run build` 通过。

#### 剩余边界

- M10 已完成本地可验证闭环；生产侧仍需真实 7 天 shadow、线上有用率、失败率、成本和可回滚验证后，才能进入旧正则退役。
- 本轮没有配置 GitHub Secrets、没有写生产环境变量、没有触发生产 API hook。
- 生产自动触发继续按后续配置项预留；等生产 API 域名稳定后再配置 `AGENT_V2_DEPLOY_HOOK_URL` 与 deploy token。

### 2026-07-06 02:45 Asia/Shanghai M11 收口：图谱节点治理本地闭环

本轮按“生产 API hook / token 后续预留，当前先本地闭环”的口径补齐 M11。治理台知识图谱已形成可视化 + 节点治理动作闭环：D3 力导向图支持节点类型着色、边类型样式、2 跳焦点展开、节点搜索/过滤和起止节点路径查询；节点详情可以继续驱动治理，而不是只做展示。

本轮新增/确认：

- 从图谱节点或节点列表进入节点详情，节点详情保留关联边、关联节点和原始数据。
- 从孤立节点生成页面内“孤立节点待治理”缺口告警，并按节点 ID 定位缺口列表；该告警当前是本地治理提示，不写生产库。
- 从 Word 节点一键填入同义词治理表单：自动带入词值、推断目标节点，并补治理原因。
- 从 Capability 节点直接跳转 `/system/agent-capabilities?capabilityId=...`，进入能力中心做正式修改。
- M11 主清单和 Sprint 6 中的“图谱可视化”已按当前可验证能力勾选。

验证记录：

- `npx.cmd vitest run src/app/pages/system/AgentGovernanceCenter.test.tsx`：通过，5 个用例覆盖总览、运行审计、评测回放、单题调试、图谱节点治理动作。

边界说明：

- 本轮不配置生产 API hook URL、GitHub Secrets、生产 token 或后端生产环境变量。
- 后续如要把“孤立节点缺口”持久化为正式治理任务，可新增后端 gap 写入 API；当前版本先满足本地运营治理闭环。

### 2026-07-06 02:52 Asia/Shanghai T9.3 / 18.3 收口：未覆盖问法进入治理动作

本轮继续按“预留后续生产配置，当前先本地闭环”推进。治理台总览里的“高频未覆盖问法”不再只是失败聚合展示，已经可以把具体问题直接带入后续治理动作。

本轮新增/确认：

- 高频未覆盖问法卡片新增 `单题调试`：一键把原问题带入单题调试页，并把 entrypoint 标记为 `agent_governance_uncovered_debug`，方便复查图谱、Policy、工具和契约链路。
- 高频未覆盖问法卡片新增 `图谱治理`：自动推断治理词，例如“这个月人效怎么样”会推断为“人效”，进入知识图谱页后预填节点搜索、同义词值、治理原因，并生成页面内 `未覆盖问法待治理` 缺口提示。
- 高频未覆盖问法卡片新增 `能力治理`：直接跳转能力中心，适合确认是缺同义词、缺能力映射，还是需要新增 capability。
- 本地图谱缺口现在分为服务端生成缺口和页面内治理提示；重新加载图谱不会覆盖本地未覆盖问法治理提示。
- T9.3 的知识图谱治理、实时问答调试，以及 18.3 中“治理中心提示人效缺同义词或能力映射 / 管理员新增同义词覆盖 / unsupported 转治理任务”已按本地可验证能力勾选。

验证记录：

- `npx.cmd vitest run src/app/pages/system/AgentGovernanceCenter.test.tsx`：通过，6 个用例覆盖总览、未覆盖问法治理、运行审计、评测回放、单题调试、图谱节点治理动作。

边界说明：

- 本轮仍未配置生产 API hook URL、GitHub Secrets、生产 token 或生产环境变量。
- 18.3 中“首次真实 unsupported、下次 kg:generate 合入、再次提问命中经营指标能力”仍需后续用真实运行记录和图谱生成结果验证，当前不标记完成。

### 2026-07-06 03:09 Asia/Shanghai 18.2 收口：高风险发券动作本地阻断

本轮继续按“预留后续生产配置，当前先本地闭环”的口径补齐 18.2。用户问“帮我给所有沉睡客户发券”时，运行时会把它识别为高风险触达/发券动作，命中 `marketing.coupon.issue.blocked`，Manifest 发布策略为 `write_blocked`，PolicyGateway 在工具执行前阻断。

本轮新增/确认：

- 新增 `marketing.coupon.issue.blocked` Manifest：风险等级 `high`，输出 `action_card` + `evidence_panel`，但发布策略为 `write_blocked`。
- KG Mapping 增加发券动作边界规则：覆盖“发券 / 发优惠券 / 下发优惠券 / 给客户发券”等高风险触达表达。
- 旧本地决策器增加同一阻断能力兜底，避免非 KG 模式把发券误当普通优惠券问数。
- PolicyGateway 对该能力返回 `release_strategy: deny`，拒绝原因明确显示“当前不允许自动执行”。
- 治理台单题调试 dry-run 可看到阻断能力、字段策略、Policy 总状态 `deny` 和 `policy_boundary` 回放阶段。

验证记录：

```powershell
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/agent-v2-runtime.service.spec.ts src/agent-v2/policy/agent-v2-policy-gateway.service.spec.ts src/agent-v2/governance/agent-v2-governance.service.spec.ts --runInBand
```

验证结果：

- 后端定向测试通过：3 个测试套件、57 个用例通过。
- 覆盖运行时路由、Policy 阻断和治理台审计展示。

边界说明：

- 本轮没有真实发券，没有执行写库动作，没有配置生产 API hook URL、GitHub Secrets、生产 token 或生产环境变量。
- 后续如要开放真实发券，必须先补审批流、幂等校验、操作审计、回滚策略和生产环境开关；当前版本只做本地阻断闭环。

### 2026-07-06 03:18 Asia/Shanghai 18.1 补齐：自动发布后 Runtime smoke

本轮继续按“生产 hook 预留，当前先本地闭环”的口径补齐 18.1 中自动发布链路的本地可验证缺口。自动发布流水线现在可以在导入候选、发布 Manifest 版本后，按需执行发布后 Runtime smoke：刷新 active Manifest，再用代表问法 dry-run 规划并执行低风险工具，验证新发布能力是否真的被 Runtime 命中。

本轮新增/确认：

- `AgentV2CapabilityCenterService.publish` 返回 `publishedCapabilityIds`，供自动发布后续 smoke 定位本次发布能力。
- `publish(mode: 'auto', capabilityIds)` 现在仍会强制过滤 `releaseStrategy='auto_publish'`，避免增量自动发布把高风险或 `write_blocked` 候选发布出去。
- `AgentV2AutoPublishService.run` 支持 `postPublishSmoke`、`postPublishSmokeLimit`、`postPublishSmokeStoreId`。
- 自动发布结果写入 `postPublishSmoke` 和 `output.postPublishSmokePass`，管理端流水线日志可以直接看到 Runtime smoke 是否通过。
- 管理端手动触发和 deploy hook 请求体均可透传 smoke 开关；默认不执行，避免生产 hook 未稳定前产生额外运行负载。

验证记录：

```powershell
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/capability-center/agent-v2-auto-publish.service.spec.ts src/agent-v2/capability-center/agent-v2-capability-center.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run build
```

验证结果：

- 自动发布与能力中心定向测试通过：2 个测试套件、10 个用例通过。
- `server-v2` build 通过。

边界说明：

- 本轮没有触发生产 deploy hook。
- 18.1 中“新增真实只读 Controller / DTO 全量校验”已在后续 2026-07-06 06:45 本地收口中补齐；运行审计结构化追溯已在 2026-07-06 03:39 本地补齐。

### 2026-07-06 03:32 Asia/Shanghai 18.3 收口：员工人效问法本地闭环

本轮继续按“预留后续配置，当前先本地闭环”的产品边界推进。生产 API hook URL、GitHub Secrets、生产 token 和后端生产环境变量都不作为当前阻塞项；本地侧已把“这个月人效怎么样”从未覆盖问法补成可命中的经营指标能力。

本轮新增/确认：

- 新增 `finance.staff-efficiency.metric` Manifest，低风险只读、`auto_publish`、工具为 `business.metric.query`，覆盖“人效 / 员工人效 / 员工效率 / 员工表现 / 服务完成率”等问法。
- 新增 `StaffEfficiency` 业务对象和语义词典，来源模型包括 `Beautician`、`OrderItem`、`ProductOrder`、`CommissionRecord`、`Reservation`、`ServiceTask`、`CardUsageRecord`。
- KG Mapping 与 legacy fallback 都能把“这个月人效怎么样”命中 `finance.staff-efficiency.metric`，避免灰度模式切换时退回 unsupported。
- `AgentV2BusinessMetricQueryService` 增加员工人效执行器：按服务次数、完成服务任务、次卡核销、订单数、客户数、销售额、提成和预约完成率计算人效分，并返回 KPI、表格和 evidence。
- `kg:generate` 已重新生成图谱，本地生成产物包含 `StaffEfficiency` 对象、`finance.staff-efficiency.metric` 能力和相关 trigger。

验证记录：

```powershell
npm.cmd --prefix packages/server-v2 run kg:generate
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/tools/agent-v2-business-metric-query.service.spec.ts src/agent-v2/capability/agent-v2-capability-decision.service.spec.ts src/agent-v2/intent/agent-v2-intent-extraction.service.spec.ts src/agent-v2/agent-v2-runtime.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run build
```

验证结果：

- `kg:generate` 通过：节点 3606，边 4174，阻断项 0，保留既有 warning 4 个。
- 后端定向测试通过：4 个测试套件、91 个用例通过。
- `server-v2` build 通过。

边界说明：

- 本轮没有配置生产 API hook URL、GitHub Secrets、生产 token 或后端生产环境变量。
- 本轮没有触发生产 deploy hook，也没有写入真实业务数据；员工人效能力当前为只读本地闭环。

### 2026-07-06 03:39 Asia/Shanghai 18.1 / M8 补齐：运行审计结构化追溯

本轮继续按“预留后续配置，当前先本地闭环”的边界推进。生产 API hook、GitHub Secrets 和生产 token 仍只作为后续配置项；本地侧补齐治理中心运行详情的结构化 replay，让一次真实 Agent V2 run 不只展示原始 JSON，而是按阶段追溯图谱、LLM、Manifest、Policy、工具、Contract 和 evidence。

本轮新增/确认：

- 运行详情 replay 新增 `kg_preprocessing` 阶段：展示归一化问题、图谱对象/领域/能力提示、互斥提醒和候选意图。
- 新增 `llm_prompt_response` 阶段：展示持久化意图 trace 中的 LLM prompt/response 摘要、解析状态和 fallback 原因。
- 新增 `manifest_mapping` 阶段：展示选中 capability、发布策略、风险等级、sourceModels、权限码、outputKinds、requiredKinds、候选和排除项。
- 新增 `policy_boundary` 阶段：从持久化 tool step 抽取 Policy checks，集中展示能力状态、权限、发布策略和工具审批边界。
- 新增 `evidence_trace` 阶段：汇总运行级 evidence、字段策略、GenericQueryEngine queryTrace 和脱敏 SQL 摘要。

验证记录：

```powershell
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/governance/agent-v2-governance.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run build
```

验证结果：

- 治理服务定向测试通过：1 个测试套件、27 个用例通过。
- `server-v2` build 通过。

边界说明：

- 本轮没有配置生产 API hook URL、GitHub Secrets、生产 token 或后端生产环境变量。
- 本轮没有触发生产 deploy hook，也没有写入真实业务数据；只是增强已持久化运行审计的本地可读性。

### 2026-07-06 03:42 Asia/Shanghai M7 补齐：strict gate 指标纳入硬门禁

本轮继续按“预留后续配置，当前先本地闭环”的边界推进。生产 CI / auto-publish 仍等生产 API 域名、token 和 Secrets 稳定后再接；本地侧先把 strict gate 报告里的关键运行指标显式纳入门禁表，避免“报告里有指标，但 pass/fail 不看这些指标”。

本轮新增/确认：

- `agent-v2-eval-gate` 门禁表新增 `LLM 降级覆盖 P0`，阈值 `>= 85%`。
- 门禁表新增 `延迟 P99`，阈值 `<= 800ms`。
- 门禁表新增 `缓存命中率`，阈值 `>= 50%`。
- 门禁表新增 `越权证据`，阈值 `0 个`。
- 当前 strict gate 报告显示：P0 103/103 通过，5 次同题稳定性 100%，LLM 降级覆盖 100%，P99 6.35ms，缓存命中率 80%，高风险自动发布 0，越权证据 0。
- 能力发布链路已有发布前 eval gate：任一 P0 错路由、契约、权限或高风险自动发布阻断项失败时，自动发布流水线会标记 failed。

验证记录：

```powershell
npm.cmd --prefix packages/server-v2 run agent-v2:eval-gate:strict
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/capability-center/agent-v2-auto-publish.service.spec.ts src/agent-v2/capability-center/agent-v2-capability-center.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run build
```

验证结果：

- strict gate 通过：650 题，P0 103 题，`pass: true`。
- 自动发布与能力中心定向测试通过：2 个测试套件、10 个用例通过。
- `server-v2` build 通过。

边界说明：

- 本轮验证的是本地离线 runtime planning gate，不替代生产 7 天 shadow、线上失败率、有用率、模型成本和可回滚验证。
- 旧正则退役仍不能因为本地 strict gate 通过就直接删除，仍需 18.4 的生产观察与授权。

### 2026-07-06 05:10 Asia/Shanghai M1-M3 收口：本地闭环与后续配置预留

本轮继续按“预留后续配置，当前先本地闭环”的产品边界推进。生产 API hook URL、GitHub Secrets、生产 token 和生产环境变量仍不作为当前阻塞项；本地侧补齐并验证图谱生成、LLM 意图抽取、Manifest 能力映射和灰度开关兼容。

本轮新增/确认：

- M1 图谱生成器完成本地 strict 生成：`kg:generate:strict` 输出节点 3702、边 4268、阻断项 0、warning 4，并生成 TS snapshot、JSON 和报告。
- M2 意图抽取完成本地闭环：`StructuredIntent`、图谱预处理、AI Gateway 调用、JSON 解析失败降级、LRU 500 / TTL 5 分钟缓存均已接入 Runtime。
- M3 能力映射完成本地闭环：`AgentV2RuntimeService` 已支持图谱预处理、LLM 意图抽取、Manifest 映射，旧正则保留为 fallback / shadow 对照。
- 灰度开关预留并兼容：`AGENT_INTENT_ENGINE=kg_llm` 默认映射到 `kg_llm_preferred`，保留 legacy 回退；`AGENT_INTENT_SHADOW_COMPARE=true` 可开启本地影子对比；`AGENT_V2_GRAY_MODE` 仍是更明确的现代灰度开关。
- 环境样例已补齐 `AGENT_INTENT_ENGINE` 和 `AGENT_INTENT_SHADOW_COMPARE`，后续生产只需按域名、token、灰度名单配置，不需要再改本地开发代码。

验证记录：

```powershell
npm.cmd --prefix packages/server-v2 run kg:generate:strict
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/knowledge-graph/knowledge-graph-builder.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/agent-v2-gray-strategy.service.spec.ts src/agent-v2/agent-v2-runtime.service.spec.ts src/agent-v2/intent/agent-v2-intent-extraction.service.spec.ts src/agent-v2/capability/agent-v2-capability-decision.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run build
```

验证结果：

- 图谱生成 strict 通过：节点 3702，边 4268，阻断项 0，warning 4。
- 图谱 builder 定向测试通过：1 个测试套件、2 个用例通过。
- M2/M3 灰度、Runtime、意图抽取和能力决策定向测试通过：4 个测试套件、83 个用例通过。
- `server-v2` build 通过。

边界说明：

- 本轮没有配置生产 API hook URL、GitHub Secrets、生产 token 或后端生产环境变量。
- 本轮没有触发生产 deploy hook，没有执行生产 DB migration，没有写入真实业务数据。
- `kg:enhance` 每周 LLM 离线增强已在后续 05:20 记录中落地；候选仍需人工审核后才会合入 active graph。
- 旧正则真实退役仍必须等待 7 天 shadow 对比、线上有用率、失败率、成本和可回滚验证。

### 2026-07-06 06:25 Asia/Shanghai T12.3 收口：生产证据校验本地闭环

本轮继续按“预留后续配置，当前先本地闭环”的边界推进。生产 API hook URL、GitHub Secrets、生产 token、生产环境变量和生产 DB migration 都没有配置或执行；本地侧补齐旧正则退役前的生产证据校验工具，避免后续把模板或零样本文件误当成退役依据。

本轮新增/确认：

- 新增 `agent-v2:legacy-retirement-evidence`：只读取 JSON 文件并输出 `agent-v2-legacy-retirement-production-evidence-check.json/md`，不连接生产库、不调用生产 API。
- 新增 `agent-v2:legacy-retirement-evidence:strict`：用于后续 CI/上线前强校验，证据不足时返回非 0。
- `agent-v2:legacy-retirement-preflight` 的生产证据门禁收紧：必须有正式 `agent-v2-legacy-retirement-production-evidence.json`，且 shadow/灰度样本、有用率样本、LLM 延迟、成本观测、失败样本和回滚记录都真实有效。
- 示例模板 `agent-v2-legacy-retirement-production-evidence.example.json` 已被验证不会误通过：0 shadow 样本、0 有用率样本、0ms LLM 延迟会被阻塞。
- 旧正则删除仍保持后置：当前本地工程门禁和退役安全门禁通过，但生产证据门禁未通过，`retirementReady=false`。

验证记录：

```powershell
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-evidence
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-evidence -- --input docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-legacy-retirement-production-evidence.example.json
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-preflight:local
npm.cmd --prefix packages/server-v2 run build
```

验证结果：

- 正式生产证据校验：脚本执行通过，结论 `pass=false`，阻塞项 7 个，表示当前没有正式生产证据文件。
- 示例模板校验：脚本执行通过，结论 `pass=false`，阻塞项 3 个，确认模板/零样本不会误放行。
- 旧正则退役预检：本地工程门禁和退役安全门禁通过，生产证据阻塞 4 个，`retirementReady=false`。
- `server-v2` build 通过。

边界说明：

- 本轮没有写入正式 `agent-v2-legacy-retirement-production-evidence.json`。
- 后续只有拿到真实生产 7 天 shadow、有用率、LLM 观测和回滚验证导出后，才可以运行 `agent-v2:legacy-retirement-evidence -- --input <真实导出文件> --write-canonical` 写入正式证据。
- 旧正则仍不能删除；生产证据未通过前，继续保留 `legacy_regex`、`kg_llm_preferred` 回退和审计兼容。

### 2026-07-06 06:45 Asia/Shanghai 18.1 收口：能力中心 Controller/DTO 全量校验

本轮继续按“预留后续配置，当前先本地闭环”的边界推进。生产 API hook URL、GitHub Secrets、生产 token、生产环境变量和生产 DB migration 都没有配置或执行；本地侧把能力中心接口从 inline body/query 类型升级为运行时可校验 DTO，补齐 18.1 中“只读 Controller / DTO 全量校验”的遗留缺口。

本轮新增/确认：

- 新增 `AgentV2CapabilityCenter` DTO 契约，覆盖草稿列表、导入、更新、dry-run、发布后 smoke、eval gate、手动自动发布、deploy hook、流水线日志、审核、发布和 queryKey 列表入口。
- controller 已使用 DTO 类型承接 `@Query()` / `@Body()`，配合全局 `ValidationPipe` 做白名单、未知字段拒绝、枚举边界和数字/布尔转换。
- 手动自动发布 DTO 支持 `overwriteReviewed`；deploy hook DTO 不接受该字段，避免生产钩子绕过人工治理边界。
- 更新草稿时 `all` 只允许作为列表筛选值，不允许写入 status、riskLevel 或 releaseStrategy。
- 发布后 smoke 的 `storeId`、`question`、`postPublishSmokeLimit` 等参数已具备 DTO 级边界，非法输入会在执行 Runtime 或工具前被拒绝。

验证记录：

```powershell
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/capability-center/agent-v2-capability-center.dto.spec.ts src/agent-v2/capability-center/agent-v2-capability-center.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run build
```

验证结果：

- 能力中心 DTO + 服务定向测试通过：2 个测试套件、10 个用例通过。
- `server-v2` build 通过。

边界说明：

- 本轮没有触发 deploy hook，没有执行生产自动发布，也没有写入生产业务数据。
- 18.1 当前本地验收链路已覆盖接口 DTO 校验、能力治理服务、发布后 Runtime smoke 和运行审计追溯；生产自动触发仍按后续配置项预留。

### 2026-07-06 07:05 Asia/Shanghai T7.3 收口：CI 纳入退役预检和证据契约

本轮继续按“预留后续配置，当前先本地闭环”的边界推进。CI 侧新增的是本地报告生成与门禁展示，不配置生产 API hook URL、GitHub Secrets、生产 token 或生产环境变量，也不触发生产 deploy hook。

本轮新增/确认：

- Agent V2 CI 单测列表新增 `src/agent-v2/capability-center/agent-v2-capability-center.dto.spec.ts`，避免接口 DTO 校验回归。
- strict eval gate 后新增 `agent-v2:legacy-diff-attribution`，持续输出 P0 KG-only vs legacy 差异归因。
- strict eval gate 后新增 `agent-v2:legacy-retirement-preflight:local`，本地门禁失败会阻断 CI；生产证据缺失不会被误判为可退役。
- strict eval gate 后新增 `agent-v2:legacy-retirement-evidence`，持续生成生产证据契约检查报告；当前没有正式生产证据时结论仍为 `pass=false`，但脚本执行成功。
- GitHub Step Summary 展示 legacy retirement local preflight、retirement ready 和 production evidence blockers，方便灰度前判断“本地已过、生产未过”的真实状态。

验证记录：

```powershell
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/capability-center/agent-v2-capability-center.dto.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-diff-attribution
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-preflight:local
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-evidence
```

验证结果：

- 能力中心 DTO 单测通过：1 个测试套件、5 个用例通过。
- P0 差异归因通过：103 道 P0 中 21 条差异，21 条均为 KG 命中期望、legacy 缺口，KG 待修 0。
- 旧正则退役预检通过本地门禁：`localPreflightPass=true`、`retirementReady=false`、生产证据阻塞 4 个。
- 生产证据契约检查脚本执行通过：`pass=false`、阻塞项 7 个，确认当前仍没有正式生产证据文件。

边界说明：

- 本轮只增强 CI 本地门禁和报告，不改变默认运行模式，不切换到 `kg_llm_preferred` 或 `kg_llm_only`。
- 旧正则最终删除仍必须等待生产 7 天 shadow、线上有用率、生产 LLM 观测和回滚验证。

### 2026-07-06 07:25 Asia/Shanghai T12.3 收口：Shadow 审计证据聚合

本轮继续按“预留后续配置，当前先本地闭环”的边界推进。生产 API hook URL、GitHub Secrets、生产 token、生产环境变量和生产 DB migration 都没有配置或执行；本地侧补齐从真实运行审计导出到旧正则退役 candidate 证据的中间工具。

本轮新增/确认：

- 新增 `agent-v2:legacy-retirement-shadow-evidence`：只读取 JSON 导出，不连接生产库、不调用生产 API。
- 新增示例导出文件 `agent-v2-shadow-evidence-export.example.json`，覆盖 `runs`、`auditDetails`、`toolCalls`、`feedbacks`、`regressions`、`rollback`。
- 聚合脚本输出 `agent-v2-legacy-retirement-production-evidence.candidate.json`，以及 `agent-v2-legacy-retirement-shadow-evidence-aggregate.json/md`。
- 聚合口径明确：shadow 模式用户实际看到 legacy 结果，因此 shadow feedback 只计入 legacy 有用率，不计入 KG 有用率。
- Candidate 证据不会自动写入正式 `agent-v2-legacy-retirement-production-evidence.json`；仍必须再经过 `agent-v2:legacy-retirement-evidence -- --input <candidate>` 校验和人工确认。

验证记录：

```powershell
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-shadow-evidence -- --input docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-shadow-evidence-export.example.json
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-evidence -- --input docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-legacy-retirement-production-evidence.candidate.json
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-evidence
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-preflight:local
npm.cmd --prefix packages/server-v2 run build
```

验证结果：

- 示例 shadow 导出聚合执行通过：生成 candidate 证据，`passCandidate=false`、观察天数 1、总运行 3、shadow 1、`kg_llm_preferred` 1、有用率样本 3、LLM 有观测、回滚未验证。
- Candidate 证据校验执行通过但不放行：`pass=false`、阻塞项 2 个。
- 正式生产证据校验已恢复为无正式输入：`pass=false`、阻塞项 7 个。
- 旧正则退役预检：本地门禁和退役安全门禁通过，`retirementReady=false`，生产证据阻塞 4 个。
- `server-v2` build 通过。

边界说明：

- 本轮没有写入正式生产证据文件，没有连接生产数据库，也没有触发任何生产 hook。
- 后续生产侧只需要导出真实 7 天运行审计 JSON，即可先聚合 candidate，再走正式证据校验和退役预检。

### 2026-07-06 07:40 Asia/Shanghai 配置边界收口：schedule 移除，本地闭环优先

按“预留后续配置，当前先本地闭环”的产品边界，已把 Agent V2 workflow 的每日 schedule 从当前启用范围移除。当前只保留 push、PR 和 `workflow_dispatch` 手动触发；生产 auto-publish hook 仍要求 `AGENT_V2_DEPLOY_HOOK_URL` 与 `AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN` 两个 Secret 同时存在才会执行。

本轮确认：

- `AGENT_V2_DEPLOY_HOOK_URL` / `AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN` 继续只作为环境变量样例和后续 Secret 位预留。
- GitHub workflow 当前不再自动每日定时触发；2026-07-06 10:37 最新产品决策进一步明确为不恢复常规 schedule，改为 GitHub main 提交触发 auto-publish。
- 当前阶段不配置 GitHub Secrets、不写生产环境变量、不触发生产 hook、不执行生产 DB migration。

验证记录：

```powershell
rg -n "schedule|cron|workflow_dispatch|AGENT_V2_DEPLOY_HOOK_URL|AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN" ".github/workflows/agent-v2.yml" "docs/03-开发计划/01-AI智能体与问数能力/task.md"
git diff --check -- ".github/workflows/agent-v2.yml" "docs/03-开发计划/01-AI智能体与问数能力/task.md" ".env.production.example" "packages/server-v2/.env.example" "packages/server-v2/package.json"
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-evidence
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-preflight:local
```

验证结果：

- workflow 中已无 `schedule` 触发块，只保留 `workflow_dispatch` 和 Secret 条件 hook。
- `git diff --check` 仅提示 CRLF 行尾转换，没有空白错误。
- 正式生产证据校验仍不放行：`pass=false`、阻塞项 7 个。
- 旧正则退役预检保持本地门禁通过但退役未就绪：`localPreflightPass=true`、`retirementReady=false`、生产证据阻塞 4 个。

产品影响：

- 本地开发、测试、治理中心、手动 dry-run、候选能力审核和本地门禁不受影响。
- 生产定时自动发布不作为常规路线，避免在生产 API 域名和 token 未稳定前出现自动化运营副作用；后续 auto-publish 走 GitHub main 提交流水线。

### 2026-07-06 07:55 Asia/Shanghai T4.2 收口：自动发布语义 queryKey 进入通用记录查询

本轮继续按“预留后续配置，当前先本地闭环”的边界推进。生产 API hook、GitHub Secrets、生产 token、生产环境变量和生产 DB migration 都没有配置或执行；本地侧继续减少新增只读能力对专用 adapter 的依赖。

本轮新增/确认：

- `GenericQueryEngineService` 的动态记录查询不再只接受固定 `generic.record.query`。
- 只要 Manifest 满足低风险、`auto_publish`、`executor.type=business_record_query`、`tool=business.record.query`、存在 `sourceModels[0]` 和可展示字段策略，就可以用业务语义 queryKey 直接进入动态记录查询。
- 已有专用 queryKey 仍保持优先级，不改变库存、订单、退款、趋势等已验证口径。
- `custom_service` 能力不会被误纳入动态记录查询，复杂业务口径仍要求保留专用服务原因。
- 工具入口 `AgentV2BusinessRecordQueryService` 已验证：active ManifestProvider 热加载的新语义 queryKey，不需要重启或新增专用分支即可执行通用记录查询。

验证记录：

```powershell
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/query-engine/generic-query-engine.service.spec.ts src/agent-v2/tools/agent-v2-business-record-query.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run build
```

验证结果：

- GenericQueryEngine + BusinessRecordQueryService 定向测试通过：2 个测试套件、34 个用例通过。
- 新增用例覆盖自动发布语义 queryKey：`cashier.payment.records.auto` 可通过 `PaymentRecord -> ProductOrder.store` 的图谱 FK 路径自动加门店过滤，并按字段策略生成 `select`。
- `server-v2` build 通过。

产品影响：

- 后续新增低风险只读记录类能力时，不必为了每个能力新增固定 queryKey 白名单或专用 service 分支。
- 产品和实施可以继续在能力中心审核候选能力；只要 Manifest 声明数据源、字段策略和权限，低风险记录查询可先走本地通用引擎验证。
- 复杂指标、写入动作、审批动作仍不自动下沉，继续由专用服务和 PolicyGateway 控制。

### 2026-07-06 08:05 Asia/Shanghai T12.3 补齐：Shadow 证据 DB 只读导出器

本轮继续按“预留后续配置，当前先本地闭环”的边界推进。没有配置生产 API hook、GitHub Secrets、生产 token、生产环境变量，没有执行生产 DB migration，也没有读取生产库；本地侧补齐从 Agent 审计表到 shadow 证据 JSON 的只读导出入口。

本轮新增/确认：

- 新增 `agent-v2:legacy-retirement-shadow-export`。
- 默认执行会拒绝连接数据库，必须显式传 `--read-db` 才会读取 `AgentRun`、`AgentRunAuditDetail`、`AgentToolCall`、`AgentFeedback`。
- 支持 `--dry-run` 查看导出计划，不连接数据库、不写文件。
- 默认输出到 `agent-v2-shadow-evidence-export.json`，可以直接作为 `agent-v2:legacy-retirement-shadow-evidence` 的输入。
- 导出时只保留证据字段：运行模式、最终引擎、状态、LLM 是否观测、延迟/成本摘要、工具风险状态、评分/采纳等；不导出原始用户输入、反馈评论、tool args 和完整 LLM prompt/response。

验证记录：

```powershell
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-shadow-export -- --dry-run --days 7 --environment local
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-shadow-export -- --days 7 --environment local
```

验证结果：

- dry-run 通过：显示 7 天窗口、输出路径、`readDb=false`，未连接数据库、未写文件。
- 未传 `--read-db` 的正式执行被拒绝：`Refusing to read database without --read-db`，避免误读生产或本地真实库。

产品影响：

- 后续生产或准生产完成 7 天 shadow 后，不需要人工拼装证据文件；可以先显式授权只读导出，再用聚合器生成 candidate 证据。
- 当前仍不把 7 天 shadow、线上有用率、生产 LLM 观测或回滚验证标记为完成。

### 2026-07-06 08:12 Asia/Shanghai CI 补强：Shadow 导出器 dry-run 纳入 Agent V2 Gate

本轮继续按“生产配置预留，当前先本地闭环”的边界推进。CI 只新增 shadow 证据导出器的 dry-run 检查，不配置生产 API hook URL、GitHub Secrets、生产 token 或生产环境变量，也不读取数据库。

本轮新增/确认：

- `.github/workflows/agent-v2.yml` 在生产证据契约检查后新增 `Plan Agent V2 shadow evidence export`。
- CI 命令为 `npm run agent-v2:legacy-retirement-shadow-export -- --dry-run --days 7 --environment ci`。
- 该步骤只验证导出器命令、时间窗口、输出路径和默认拒绝连库边界；不生成正式证据，不连接生产库，不调用生产 API。

验证记录：

```powershell
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-shadow-export -- --dry-run --days 7 --environment ci
git diff --check -- ".github/workflows/agent-v2.yml" "packages/server-v2/package.json" "packages/server-v2/prisma/agent-v2-legacy-retirement-shadow-export.ts"
rg -n "schedule|Plan Agent V2 shadow evidence export|legacy-retirement-shadow-export|Trigger production Agent V2" ".github/workflows/agent-v2.yml"
```

验证结果：

- dry-run 通过，输出 `readDb=false`，不连接数据库、不写文件。
- `git diff --check` 仅 CRLF 提醒，没有空白错误。
- workflow 仍无 `schedule` 触发块；生产 auto-publish hook 仍保持 Secret 条件触发。

### 2026-07-06 07:08 Asia/Shanghai T12.3 补强：退役预检校验证据来源

本轮继续按“预留后续配置，当前先本地闭环”的边界推进。生产 API hook URL、GitHub Secrets、生产 token、生产环境变量和生产 DB migration 都没有配置或执行；本地侧只补强旧正则退役预检，防止后续有人绕过 `agent-v2:legacy-retirement-evidence`，直接放入 local/staging/模板证据文件导致误放行。

完成内容：

- `agent-v2:legacy-retirement-preflight` 新增 `production_source_integrity` 生产证据门禁。
- 退役预检现在要求正式证据包含 `source.environment=production`、`source.window`、`source.exportedBy` 和 `generatedAt`。
- 本地 dry-run、staging/local 导出、手工模板或缺失来源信息的证据，即使其它数值字段看起来满足，也不能让 `retirementReady` 变成 true。

验证命令：

```powershell
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-preflight:local
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-evidence
npm.cmd --prefix packages/server-v2 run build
```

验证结果：

- 旧正则退役预检脚本执行通过：`localPreflightPass=true`、`retirementReady=false`、`blockerCount=5`、`productionEvidenceBlockers=5`。
- 生产证据契约校验脚本执行通过：`pass=false`、`blockerCount=7`，确认当前没有正式生产证据文件。
- 后端构建通过。

交付边界：

- 当前本地开发、测试、灰度准备可以继续推进；生产 API hook URL / token 仍按后续配置项预留。
- 旧正则仍不能删除；必须等真实生产 7 天 shadow、线上有用率、生产 LLM 观测、回滚验证和生产来源证据都通过后，再进入退役授权。

### 2026-07-06 07:14 Asia/Shanghai M3 补强：本地/CI 默认进入新引擎

本轮继续按“预留后续配置，当前先本地闭环”的边界推进。生产 API hook URL、GitHub Secrets、生产 token、生产环境变量和生产 DB migration 都没有配置或执行；旧正则也没有删除。改动目标是把本地和 CI 的默认验收口径推进到 `kg_llm_preferred`，让日常开发、strict gate 和本地灰度验证更接近最终新架构接管，同时保留生产默认旧链路。

完成内容：

- `AgentV2GrayStrategyService` 新增统一默认策略：`NODE_ENV=development/test` 且没有 context、治理表、`AGENT_V2_GRAY_RULES`、`AGENT_V2_GRAY_MODE` 或旧 `AGENT_INTENT_ENGINE` 时，默认 `kg_llm_preferred`。
- 生产或未知环境无显式配置时仍默认 `legacy_regex`，避免代码合并后自动切生产正式流量。
- `AgentV2RuntimeService` 复用同一默认策略，避免 Runtime fallback 和灰度策略服务两处默认不一致。
- `packages/server-v2/.env.example` 的本地样例已改为 `AGENT_V2_GRAY_MODE=kg_llm_preferred`、`AGENT_INTENT_ENGINE=kg_llm`；`.env.production.example` 仍保持 `legacy_regex`。

验证命令：

```powershell
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/agent-v2-gray-strategy.service.spec.ts src/agent-v2/agent-v2-runtime.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run agent-v2:eval-gate:strict
npm.cmd --prefix packages/server-v2 run build
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-preflight:local
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-evidence
```

验证结果：

- 灰度策略与 Runtime 定向测试通过：2 个测试套件、33 个用例通过。
- strict eval gate 通过：650 题总样本、103 个 P0，P0 未映射/权限待审/契约失败/错路由均为 0，`pass=true`。
- 后端构建通过。
- 旧正则退役预检仍保持正确阻塞：`localPreflightPass=true`、`retirementReady=false`、`blockerCount=5`、`productionEvidenceBlockers=5`。
- 生产证据契约校验脚本执行通过但不放行：`pass=false`、`blockerCount=7`。

交付影响：

- 本地开发、CI 和治理中心调试默认更贴近新架构接管，不再把旧正则作为本地默认验收路径。
- 生产正式默认仍后置到 7 天 shadow、有用率、LLM 观测、回滚验证和授权；当前不能把旧 `isXxx` 正则删除或标记为生产退役完成。

### 2026-07-06 07:19 Asia/Shanghai T12.3 补强：旧正则删除前保留项纳入预检

本轮继续按“预留后续配置，当前先本地闭环”的边界推进。生产 API hook URL、GitHub Secrets、生产 token、生产环境变量和生产 DB migration 都没有配置或执行；旧正则仍未删除。本轮只把“未来删除旧正则时必须保留的安全能力”纳入本地退役预检。

完成内容：

- `agent-v2:legacy-retirement-preflight` 新增 `static_p0_manifest_fallback` 本地门禁：读取 P0 评测题的 `expectedCapabilityId`，确认所有 P0 能力都存在于静态 enabled Manifest。
- 新增 `rollback_switch_available` 本地门禁：确认 `legacy_regex`、`shadow`、`kg_llm_preferred`、`kg_llm_only`、`legacy_retired` 均可识别，且生产默认仍可回 `legacy_regex`。
- 新增 `historical_run_audit_compatibility` 本地门禁：确认运行链路仍保留 `persistPlan`、`recordStep`、`AgentRunAuditDetail`、strategy、capabilityMapping 和 toolTrace。
- 任务清单中“保留：静态 P0 Manifest 兜底、回滚开关、历史 run 审计兼容”已改为完成；“删除旧正则”和“旧 `isXxx` 不再参与正式能力选择”仍保持未完成。

验证命令：

```powershell
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-preflight:local
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-evidence
npm.cmd --prefix packages/server-v2 run build
```

验证结果：

- 旧正则退役预检脚本执行通过：`localPreflightPass=true`、`retirementReady=false`、`blockerCount=5`、`productionEvidenceBlockers=5`。
- 静态 P0 Manifest 兜底门禁通过：P0 能力 27 个，静态缺失 0 个。
- 回滚开关门禁通过：模式缺失 0，生产默认 `legacy_regex`，非生产默认 `kg_llm_preferred`。
- 历史 run 审计兼容门禁通过：`persistPlan`、`recordStep`、`AgentRunAuditDetail`、strategy、capabilityMapping、toolTrace 均存在。
- 生产证据契约校验脚本执行通过但不放行：`pass=false`、`blockerCount=7`。
- 后端构建通过。

交付影响：

- 后续进入旧正则删除 PR 前，不只看生产证据，也会自动检查“删旧链路后是否还有兜底、回滚和审计”。
- 当前仍不能删除 `AgentV2CapabilityDecisionService`；必须等待真实生产 7 天 shadow、线上有用率、生产 LLM 观测、回滚验证和授权。

### 2026-07-06 07:23 Asia/Shanghai T12.1/T12.3 补强：生产 legacy_retired 防误启

本轮继续按“预留后续配置，当前先本地闭环”的边界推进。没有配置生产 API hook URL、GitHub Secrets、生产 token 或生产环境变量，没有触发生产 hook，也没有执行生产 DB migration。改动目标是防止生产误把 `legacy_retired` 当作普通灰度模式启用，从而绕过 7 天 shadow、线上有用率和回滚验证。

完成内容：

- `AgentV2GrayStrategyService` 增加生产保护：`NODE_ENV=production` 且请求/DB 规则/环境变量命中 `legacy_retired` 时，如果没有 `AGENT_V2_LEGACY_RETIREMENT_CONFIRMED=true`，自动降级为 `kg_llm_preferred`。
- 降级后仍保留旧链路回退，不会直接进入不可回退的旧正则退役状态。
- `.env.production.example` 与 `packages/server-v2/.env.example` 新增 `AGENT_V2_LEGACY_RETIREMENT_CONFIRMED=false`，生产证据未通过前默认关闭。
- `agent-v2:legacy-retirement-preflight` 的回滚开关门禁补充验证：未确认 `legacy_retired` 会降级到 `kg_llm_preferred`，确认后才允许 `legacy_retired`。

验证命令：

```powershell
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/agent-v2-gray-strategy.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-preflight:local
npm.cmd --prefix packages/server-v2 run build
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-evidence
```

验证结果：

- 灰度策略单测通过：1 个测试套件、13 个用例通过。
- 新增测试覆盖：生产未确认时 `legacy_retired -> kg_llm_preferred`，显式确认后才允许 `legacy_retired`。
- 旧正则退役预检仍通过本地门禁且保持生产证据阻塞：`localPreflightPass=true`、`retirementReady=false`、`productionEvidenceBlockers=5`。
- 回滚开关门禁报告已显示：未确认 `legacy_retired -> kg_llm_preferred`，确认后 `-> legacy_retired`。
- 后端构建通过；生产证据契约校验仍不放行：`pass=false`、`blockerCount=7`。

交付影响：

- 后续生产配置即便误填 `legacy_retired`，也不会在缺少退役确认时直接切到不可回退状态。
- 旧正则最终退役仍必须等待真实生产证据和授权；本轮只是把误配置风险收进本地可验证保护。

### 2026-07-06 07:29 Asia/Shanghai T12.1 补强：治理中心灰度规则防误保存

本轮继续执行“预留后续配置，当前先本地闭环”。没有配置生产 API hook URL、GitHub Secrets、生产 token、生产环境变量，也没有触发生产 hook 或执行生产 DB migration。本轮只补齐治理中心保存灰度规则时的本地保护，避免未来生产配置阶段误把 `legacy_retired` 当普通模式发布。

完成内容：

- `AgentV2GovernanceService.createGrayRule` 新增 `legacy_retired` 保存门禁：`NODE_ENV=production` 且未设置 `AGENT_V2_LEGACY_RETIREMENT_CONFIRMED=true` 时，拒绝创建该灰度规则。
- 运行时已有的自动降级保护与治理中心保存保护保持一致：未确认时不会形成“配置看起来退役、实际运行仍降级”的产品认知偏差。
- 本地、测试环境以及 `legacy_regex`、`shadow`、`kg_llm_preferred`、`kg_llm_only` 的正常灰度保存不受影响。

验证命令：

```powershell
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/governance/agent-v2-governance.service.spec.ts src/agent-v2/agent-v2-gray-strategy.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-preflight:local
npm.cmd --prefix packages/server-v2 run build
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-evidence
```

验证结果：

- 治理中心与灰度策略定向测试通过：2 个测试套件、42 个用例通过。
- 新增测试覆盖：生产未确认时拒绝创建 `legacy_retired` 灰度规则，显式确认后允许创建。
- 旧正则退役本地预检继续通过并保持生产证据阻塞：`localPreflightPass=true`、`retirementReady=false`、`blockerCount=5`、`productionEvidenceBlockers=5`。
- 后端构建通过。
- 生产证据契约校验仍不放行：`pass=false`、`blockerCount=7`。

交付影响：

- 当前本地闭环可以继续推进开发、测试、灰度演练；后续只需在生产 API 域名稳定后补 URL/token/Secrets/环境变量。
- 旧正则最终退役仍未完成，必须等待真实生产 7 天 shadow、线上有用率、生产 LLM 观测、回滚验证和授权。

### 2026-07-06 07:35 Asia/Shanghai T7.3/M6 补强：生产配置预留 Readiness 门禁

本轮继续执行“预留后续配置，当前先本地闭环”。没有配置生产 API hook URL、GitHub Secrets、生产 token、生产环境变量，没有触发生产 hook，没有连接生产库，也没有执行生产 DB migration。本轮只把后续生产配置入口做成本地可验证门禁，避免未来 URL/token/Secrets 配置前发现 workflow 或后端 guard 缺口。

完成内容：

- 新增 `agent-v2:production-config-readiness` / `agent-v2:production-config-readiness:strict`。
- 新增报告：
  - `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-production-config-readiness.json`
  - `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-production-config-readiness.md`
- 门禁覆盖 8 项：本地 env 占位、生产 env 占位、GitHub Secrets 条件触发、workflow 无 schedule、hook payload、deploy hook token guard、生产默认旧链路、`legacy_retired` 显式确认开关。
- Agent V2 CI 已接入该严格检查，并在 Step Summary 输出 production config readiness 状态和报告定位。

验证命令：

```powershell
npm.cmd --prefix packages/server-v2 run agent-v2:production-config-readiness:strict
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-preflight:local
npm.cmd --prefix packages/server-v2 run build
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-evidence
```

验证结果：

- 生产配置预留 readiness 通过：`pass=true`、8 个门禁、0 个阻塞。
- 旧正则退役本地预检继续通过并保持生产证据阻塞：`localPreflightPass=true`、`retirementReady=false`、`blockerCount=5`、`productionEvidenceBlockers=5`。
- 后端构建通过。
- 生产证据契约校验仍不放行：`pass=false`、`blockerCount=7`。

交付影响：

- 后续生产 API 域名、deploy token、GitHub Secrets 和后端环境变量可以按已验证的预留入口配置，不会影响当前本地开发和 CI。
- 该门禁不代表生产已接入；旧正则退役仍必须等待真实 7 天 shadow、线上有用率、生产 LLM 观测、回滚验证和授权。

### 2026-07-06 07:41 Asia/Shanghai T12.3 补强：旧正则依赖边界审计

本轮继续执行“预留后续配置，当前先本地闭环”。没有删除旧正则，没有切生产默认，没有配置生产 API hook URL、GitHub Secrets、生产 token 或生产环境变量，没有触发生产 hook，也没有执行生产 DB migration。本轮只把“旧 `isXxx` 是否还参与正式能力选择”做成本地可审计门禁。

完成内容：

- 新增 `agent-v2:legacy-dependency-audit` / `agent-v2:legacy-dependency-audit:strict`。
- 新增报告：
  - `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-legacy-dependency-audit.json`
  - `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-legacy-dependency-audit.md`
- 门禁覆盖 9 项：旧 service 引用范围、旧 `isXxx` 谓词数量冻结、`kg_llm_only` / `legacy_retired` 正式 KG 路径、`kg_llm_preferred` 回退显式标记、shadow 对照标记、runtime 测试覆盖、离线回退率、差异归因和生产证据阻塞。
- Agent V2 CI 已接入该严格检查，并在 Step Summary 输出 legacy dependency audit 状态、旧谓词数量和报告定位。

验证命令：

```powershell
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-preflight:local
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-dependency-audit:strict
npm.cmd --prefix packages/server-v2 run build
npm.cmd --prefix packages/server-v2 run agent-v2:production-config-readiness:strict
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-evidence
```

验证结果：

- 旧正则依赖边界审计通过：`pass=true`、9 个门禁、0 个阻塞。
- 当前旧 `isXxx` 谓词数量为 33 个，审计门禁限制其不再继续扩张。
- 生产引用文件数为 3 个，仅限 `agent-v2-runtime.service.ts`、`agent-v2.module.ts` 和 `agent-v2-capability-decision.service.ts`。
- 离线 strict gate 中 `kg_llm_preferred` 回退旧链路率为 0：`0 / 515`。
- 旧正则退役本地预检继续通过并保持生产证据阻塞：`localPreflightPass=true`、`retirementReady=false`、`productionEvidenceBlockers=5`。
- 后端构建通过；生产配置 readiness 通过；生产证据契约校验仍不放行：`pass=false`、`blockerCount=7`。

交付影响：

- 本地层面已经能证明：旧正则被保留为 legacy/shadow/`kg_llm_preferred` 回退和退役前对照，不作为 `kg_llm_only` / `legacy_retired` 的正式选择路径。
- 旧正则仍不能删除；正式退役仍必须等待真实生产 7 天 shadow、线上有用率、生产 LLM 观测、回滚验证和授权。

### 2026-07-06 07:47 Asia/Shanghai T12.3 补强：本地回滚演练

本轮继续执行“预留后续配置，当前先本地闭环”。没有切生产默认，没有配置生产 API hook URL、GitHub Secrets、生产 token 或生产环境变量，没有触发生产 hook，没有连接生产库，也没有执行生产 DB migration。本轮只把“可回滚方案”中的本地可验证部分做成演练门禁；真实生产/准生产回滚验证仍保持未完成。

完成内容：

- 新增 `agent-v2:rollback-drill` / `agent-v2:rollback-drill:strict`。
- 新增报告：
  - `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-rollback-drill.json`
  - `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-rollback-drill.md`
- 门禁覆盖 10 项：生产默认旧链路、非生产默认新链路优先、生产 env 回滚基线、调试上下文回滚、全局环境变量回滚、环境规则按入口/能力回滚、治理表规则回滚、DB 规则刷新回滚、未确认 `legacy_retired` 防误启、确认后允许最终退役。
- Agent V2 CI 已接入该严格检查，并在 Step Summary 输出 rollback drill 状态、阻塞数和报告定位。

验证命令：

```powershell
npm.cmd --prefix packages/server-v2 run agent-v2:rollback-drill:strict
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-preflight:local
npm.cmd --prefix packages/server-v2 run build
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-evidence
```

验证结果：

- 本地回滚演练通过：`pass=true`、10 个门禁、0 个阻塞。
- 旧正则退役本地预检继续通过并保持生产证据阻塞：`localPreflightPass=true`、`retirementReady=false`、`blockerCount=5`、`productionEvidenceBlockers=5`。
- 后端构建通过。
- 生产证据契约校验仍不放行：`pass=false`、`blockerCount=7`。

交付影响：

- 当前已能本地证明：生产默认、全局开关、规则级开关、治理表规则和 Runtime 缓存刷新都具备回到旧链路的操作路径。
- 这仍不是生产回滚证据；旧正则删除前必须在生产或准生产完成真实回滚验证，并写入正式生产证据。

### 2026-07-06 07:52 Asia/Shanghai T12.3 补强：旧正则退役交接包

本轮继续执行“预留后续配置，当前先本地闭环”。没有配置生产 API hook URL、GitHub Secrets、生产 token 或生产环境变量，没有触发生产 hook，没有连接生产库，也没有执行生产 DB migration。本轮只把旧正则退役前的本地报告、门禁和生产缺口聚合成可交接包。

完成内容：

- 新增 `agent-v2:retirement-handoff` / `agent-v2:retirement-handoff:strict`。
- 新增报告：
  - `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-retirement-handoff.json`
  - `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-retirement-handoff.md`
- 交接包聚合 8 类来源：650 题 strict gate、KG-only 与 legacy 差异归因、旧正则依赖边界审计、本地回滚演练、生产配置 readiness、旧正则退役预检、生产证据校验、生产证据和 shadow 导出样例。
- Agent V2 CI 已接入该严格检查，并在 Step Summary 输出 retirement handoff ready、本地就绪、生产就绪、阻塞数和报告定位。

验证命令：

```powershell
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-dependency-audit:strict
npm.cmd --prefix packages/server-v2 run agent-v2:rollback-drill:strict
npm.cmd --prefix packages/server-v2 run agent-v2:production-config-readiness:strict
npm.cmd --prefix packages/server-v2 run agent-v2:retirement-handoff:strict
npm.cmd --prefix packages/server-v2 run build
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-evidence
```

验证结果：

- 旧正则依赖边界审计通过：`pass=true`、9 个门禁、0 个阻塞。
- 本地回滚演练通过：`pass=true`、10 个门禁、0 个阻塞。
- 生产配置预留 readiness 通过：`pass=true`、8 个门禁、0 个阻塞。
- 旧正则退役交接包通过本地交接：`handoffReady=true`、`localReady=true`、`productionReady=false`、8 个交接门禁、1 个阻塞。
- 后端构建通过。
- 生产证据契约校验仍不放行：`pass=false`、`blockerCount=7`。

交付影响：

- 当前本地交接包已就绪，可以进入生产/准生产证据采集阶段。
- 这不是生产退役完成；旧正则仍不能删除，也不能把生产切到 `legacy_retired`。
- 后续生产 API 域名、deploy token、GitHub Secrets、后端环境变量和调度任务按预留入口配置即可，不影响当前本地开发、测试和灰度。

### 2026-07-06 08:00 Asia/Shanghai 本地闭环收口：完成度审计门禁

本轮继续执行“预留后续配置，当前先本地闭环”。没有配置生产 API hook URL、GitHub Secrets、生产 token 或生产环境变量，没有触发生产 hook，没有连接生产库，也没有执行生产 DB migration。本轮只把 `task.md` 的剩余未完成项做成可重复审计，避免把本地未做完的任务误归到生产后置。

完成内容：

- 新增 `agent-v2:local-completion-audit` / `agent-v2:local-completion-audit:strict`。
- 新增报告：
  - `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-local-completion-audit.json`
  - `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-local-completion-audit.md`
- 审计覆盖 7 个门禁：剩余未勾选项分类、本地闭环口径、依赖报告齐备、strict eval 与旧正则依赖审计、回滚演练与生产配置 readiness、退役交接包状态、生产证据继续阻塞旧正则退役。
- Agent V2 CI 已接入该严格检查，并在 Step Summary 输出 local completion audit、本地未收口项、阻塞项和报告定位。

验证命令：

```powershell
npm.cmd --prefix packages/server-v2 run agent-v2:local-completion-audit:strict
```

验证结果：

- 本地完成度审计通过：`localClosureReady=true`、`productionReady=false`、7 个门禁、0 个阻塞。
- 当前 `task.md` 剩余 31 个未勾选项，其中本地未收口项为 0，31 个均被归类为生产/真实流量/旧正则最终退役后置项。
- 审计确认正式生产证据文件尚不存在，`productionEvidenceCheck pass=false`，旧正则最终退役继续阻塞。

交付影响：

- 产品交付上，当前可以把 Agent V2 本地开发闭环作为可审计状态继续进入灰度准备。
- 这仍不是生产完成；生产 API hook、deploy token、GitHub Secrets、生产 LLM 观测、7 天 shadow、线上有用率和真实回滚验证仍需后续生产阶段完成。

### 2026-07-06 08:04 Asia/Shanghai 本地验收复跑：核心门禁

本轮继续执行“预留后续配置，当前先本地闭环”。没有配置生产 API hook URL、GitHub Secrets、生产 token 或生产环境变量，没有触发生产 hook，没有连接生产库，也没有执行生产 DB migration。本轮只复跑本地核心验收门禁，确认前述本地闭环状态没有因后续报告和脚本接入回退。

验证命令：

```powershell
npm.cmd --prefix packages/server-v2 run agent-v2:eval-gate:strict
npm.cmd run check:api
npm.cmd run build
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
```

验证结果：

- Agent V2 strict eval 通过：650 题、P0 103 题、P0 未映射 0、P0 权限待审 0、P0 契约失败 0、P0 错路由风险 0、高风险自动发布 0、`pass=true`。
- API 契约检查通过：`npm.cmd run check:api` 触发 `packages/server-v2` build，构建通过。
- 管理端生产构建通过：`npm.cmd run build` 通过。
- Ami Aura Lite Kiosk 生产构建通过：`npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build` 通过；存在 Vite chunk size warning，仅为包体积提醒，不影响构建结果。

交付影响：

- 本地验收证据覆盖 Agent V2 后端门禁、server-v2 build、管理端构建和 Kiosk 终端构建。
- 旧正则最终退役仍未完成；生产 7 天 shadow、线上有用率、生产 LLM 观测、真实回滚验证和授权仍按后续生产阶段处理。

### 2026-07-06 08:08 Asia/Shanghai 生产阶段准备：灰度 Runbook

本轮继续执行“预留后续配置，当前先本地闭环”。没有配置生产 API hook URL、GitHub Secrets、生产 token 或生产环境变量，没有触发生产 hook，没有连接生产库，也没有执行生产 DB migration。本轮只把后续生产灰度、证据采集、回滚验证和旧正则退役审批生成可执行 runbook。

完成内容：

- 新增 `agent-v2:production-rollout-plan` / `agent-v2:production-rollout-plan:strict`。
- 新增报告：
  - `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-production-rollout-plan.json`
  - `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-production-rollout-plan.md`
- Runbook 明确 6 个阶段：
  - D-1 本地基线：strict eval、production config readiness、retirement handoff、local completion audit。
  - D0 生产配置：生产 API、Secrets、LLM 观测、治理权限和 DB migration 授权。
  - D1-D7 Shadow 观察：按门店、persona、entrypoint、capabilityId 小范围开启。
  - D8 证据聚合：从真实生产导出聚合 candidate 证据。
  - D8 证据校验：只读校验后，经确认再写正式生产证据。
  - D9 退役审批：通过 strict retirement preflight 后再删除旧正则。
- Agent V2 CI 已接入该严格检查，并在 Step Summary 输出 production rollout runbook 状态、production execution allowed 和报告定位。

验证命令：

```powershell
npm.cmd --prefix packages/server-v2 run agent-v2:production-rollout-plan:strict
```

验证结果：

- 生产 rollout runbook 通过：`rolloutPlanReady=true`、`localPrerequisitesReady=true`、`productionExecutionAllowed=false`、`productionReady=false`、`productionStillBlocked=true`。
- 当前缺少正式生产证据，`productionEvidenceExists=false`、`productionEvidenceBlockers=5`。

交付影响：

- 后续生产阶段已经有明确执行顺序、责任方、验收证据和命令入口，不需要再临时拼接 shadow 导出、证据聚合和旧正则退役步骤。
- 这仍不是生产执行授权；生产 API hook、Secrets、生产 LLM 观测、DB migration、7 天 shadow 和真实回滚验证仍需后续生产窗口明确授权。

### 2026-07-06 08:14 Asia/Shanghai 本地闭环口径校准：旧正则数量

本轮继续执行“预留后续配置，当前先本地闭环”。没有删除旧正则，没有配置生产 API hook URL、GitHub Secrets、生产 token 或生产环境变量，没有触发生产 hook，没有连接生产库，也没有执行生产 DB migration。本轮只校准任务文档里的旧正则数量口径。

完成内容：

- 复核 `agent-v2-legacy-dependency-audit` 当前报告，旧 `AgentV2CapabilityDecisionService` 中冻结的 `isXxx` 谓词数量为 33。
- 将任务文档中仍写为“32 个 `isXxx` 正则”的口径统一为“33 个 `isXxx` 正则”，避免后续旧正则退役清单少算一项。
- 该调整只修正文档口径；旧正则仍保留为 legacy/shadow/`kg_llm_preferred` 回退和退役前对照，不代表已经可删除。

验证命令：

```powershell
npm.cmd --prefix packages/server-v2 run agent-v2:local-completion-audit:strict
```

验证结果：

- 本地完成度审计继续通过：`localClosureReady=true`、`productionReady=false`、`localOpenUncheckedCount=0`。
- 旧正则最终退役仍需生产 7 天 shadow、线上有用率、生产 LLM 观测、真实回滚验证和授权。

### 2026-07-06 08:20 Asia/Shanghai 本地闭环边界校准：历史生产记录不等于后续授权

本轮继续执行“预留后续配置，当前先本地闭环”。没有配置生产 API hook URL、GitHub Secrets、生产 token 或生产环境变量，没有触发生产 hook，没有连接生产库，也没有执行生产 DB migration。本轮只补齐文档中的当前有效边界，避免历史生产记录被误读为后续默认授权。

完成内容：

- 在“产品决策：生产 hook 预留，当前本地闭环”下新增“当前有效边界”说明。
- 明确上一节“生产授权执行记录”仅作为当时一次性操作留痕，不构成后续自动重复执行生产 DB migration、写 GitHub Secrets、配置生产 token、触发生产 hook 或启用定时任务的默认授权。
- 明确如需再次执行生产写库、生产环境变量配置、GitHub Secrets 写入、生产 hook 触发或旧正则删除，必须重新获得明确授权。
- 明确 `task.md` 完成度审计仍以 `productionReady=false` 为准，不能因历史配置核对记录把生产 API hook、7 天 shadow、线上有用率、生产 LLM 观测、真实回滚验证或旧正则最终退役标记为完成。

验证命令：

```powershell
npm.cmd --prefix packages/server-v2 run agent-v2:local-completion-audit:strict
git diff --check -- "docs/03-开发计划/01-AI智能体与问数能力/task.md" "docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-local-completion-audit.json" "docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-local-completion-audit.md"
```

验证结果：

- 本地完成度审计继续通过：`localClosureReady=true`、`productionReady=false`、`localOpenUncheckedCount=0`。
- 差异检查无空白错误。
- 当前仍只代表本地开发与验收边界可审计；生产执行和旧正则最终退役继续后置到明确授权与真实生产证据。

### 2026-07-06 09:17 Asia/Shanghai D0 生产灰度配置：deploy token 已配置，hook URL 待域名（历史状态，09:56 已更新）

用户已授权执行 Agent V2 生产灰度配置：允许配置生产 API hook URL / deploy token / GitHub Secrets / 后端环境变量，并只读验证配置，不删除旧正则。本轮未删除旧正则，未触发生产 hook，未执行生产 DB migration。

已完成：

- 生成新的 `AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN`，并写入 GitHub Actions Secret：`AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN`。
- 将同一 token 写入本机后端环境文件 `packages/server-v2/.env`；该文件被 `packages/server-v2/.gitignore` 忽略，不进入 Git。
- 后端环境文件已补齐：
  - `AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN=present`
  - `AGENT_V2_AUTO_PUBLISH_CRON=false`
  - `AGENT_V2_AUTO_PUBLISH_BASE_REF=origin/main`
  - `AGENT_V2_GRAY_MODE=legacy_regex`
  - `AGENT_V2_LEGACY_RETIREMENT_CONFIRMED=false`
  - `AGENT_INTENT_ENGINE=legacy_regex`
- token 指纹：`f568081a8d177c5d`。该指纹仅用于核对“本机后端 env 与 GitHub Secret 同一轮生成”，不暴露 token 明文。

当时仍需提供（已在 2026-07-06 09:56 使用 Zeabur 后端域名补齐）：

- 生产 API 域名，用于配置 GitHub Secret：`AGENT_V2_DEPLOY_HOOK_URL`。
- 推荐格式：`https://<生产 API 域名>/api/agent-v2/capability-center/auto-publish/deploy-hook`。
- 当时 `AGENT_V2_DEPLOY_HOOK_URL=empty`，因此 GitHub workflow 的生产 hook 条件不满足，不会自动触发生产 auto-publish；09:56 更新后 URL Secret 已配置，但显式生产 hook 开关仍保持关闭。
- 如果真实生产后端不是直接读取本机 `packages/server-v2/.env`，还需要在部署平台同步设置 `AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN`、`AGENT_V2_AUTO_PUBLISH_CRON=false`、`AGENT_V2_GRAY_MODE=legacy_regex`、`AGENT_V2_LEGACY_RETIREMENT_CONFIRMED=false`。

只读验证：

```powershell
gh secret list --repo vali001007/beauty-salon-admin
npm.cmd --prefix packages/server-v2 run agent-v2:production-config-readiness:strict
npm.cmd --prefix packages/server-v2 run agent-v2:production-live-config-audit
```

验证结果：

- GitHub Secret 已存在：`AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN`。
- 后端 env 状态：deploy token present，hook URL empty，cron/baseRef/gray/retirement/intent 配置 present。
- 生产配置 readiness 仍通过：`pass=true`、8 个门禁、0 个阻塞。
- 新增 live 配置审计脚本：
  - `agent-v2:production-live-config-audit`
  - `agent-v2:production-live-config-audit:strict`
- 新增 live 配置审计报告：
  - `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-production-live-config-audit.json`
  - `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-production-live-config-audit.md`
- 当时 live 配置审计结果：`pass=false`、9 个门禁、1 个阻塞；8 个通过项证明 GitHub token Secret、后端 token、Cron 关闭、生产默认旧链路和旧正则退役锁均已就绪。
- 当时唯一阻塞项：`AGENT_V2_DEPLOY_HOOK_URL` GitHub Secret 尚未配置；当前最新状态见 09:56 段落，URL Secret 已配置，剩余阻塞为 Zeabur 后端同轮 token 环境变量未确认与 GitHub 生产 hook 开关关闭。
- 旧正则仍未退役；生产 API hook URL、7 天 shadow、线上有用率、生产 LLM 观测和真实回滚验证仍需后续阶段完成。

### 2026-07-06 09:56 Asia/Shanghai D0 生产灰度配置：Zeabur hook URL 已配置，生产触发仍关闭

用户补充后端部署平台：`https://ami-service.zeabur.app/`。本轮只读验证确认：

- `GET https://ami-service.zeabur.app/api/health` 返回 200，证明该域名是可访问的 server-v2 后端。
- 代码路由为 `app.setGlobalPrefix('api')` + `@Controller('agent-v2/capability-center')` + `@Post('auto-publish/deploy-hook')`，因此生产 hook URL 为：
  - `https://ami-service.zeabur.app/api/agent-v2/capability-center/auto-publish/deploy-hook`

已完成：

- GitHub Actions Secret 已配置：
  - `AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN`
  - `AGENT_V2_DEPLOY_HOOK_URL`
- GitHub Repository Variable 已配置：
  - `AGENT_V2_PRODUCTION_HOOK_ENABLED=false`
- 本机后端 env 已同步：
  - `AGENT_V2_DEPLOY_HOOK_URL=present`
  - `AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN=present`
  - `AGENT_V2_PRODUCTION_BACKEND_ENV_CONFIRMED=false`
  - `AGENT_V2_AUTO_PUBLISH_CRON=false`
  - `AGENT_V2_GRAY_MODE=legacy_regex`
  - `AGENT_V2_LEGACY_RETIREMENT_CONFIRMED=false`
  - `AGENT_INTENT_ENGINE=legacy_regex`
- GitHub workflow 已补显式生产开关：必须同时满足非 PR、main 或 workflow_dispatch、`AGENT_V2_PRODUCTION_HOOK_ENABLED == 'true'`、hook URL 非空、deploy token 非空，才会 POST 生产 hook。

只读验证：

```powershell
gh secret list --repo vali001007/beauty-salon-admin
gh variable list --repo vali001007/beauty-salon-admin
npm.cmd --prefix packages/server-v2 run agent-v2:production-config-readiness:strict
npm.cmd --prefix packages/server-v2 run agent-v2:production-live-config-audit
npm.cmd --prefix packages/server-v2 run agent-v2:production-rollout-plan:strict
npm.cmd --prefix packages/server-v2 run agent-v2:local-completion-audit:strict
```

验证结果：

- `agent-v2:production-config-readiness:strict`：通过；8 个门禁、0 个阻塞，确认显式生产开关、URL/token 条件、无 schedule、deploy hook guard、生产默认旧链路和旧正则退役锁均在位。
- `agent-v2:production-live-config-audit`：`pass=false`、15 个门禁、2 个阻塞；URL Secret、token Secret、本机后端 env、Zeabur health、Cron 关闭、legacy 默认均已通过。
- live 审计剩余阻塞：
  - Zeabur 后端同轮 token 环境变量尚未由部署平台确认，因此 `AGENT_V2_PRODUCTION_BACKEND_ENV_CONFIRMED=false`。
  - GitHub 生产 hook 开关保持关闭：`AGENT_V2_PRODUCTION_HOOK_ENABLED=false`。
- `productionHookTriggerReady=false`，本轮未触发生产 deploy hook，未执行生产 DB migration，未删除旧正则。
- `agent-v2:production-rollout-plan:strict`：通过；runbook 已接入 live 配置审计，当前推荐变为“Zeabur 后端确认同轮 deploy token 后，再打开 GitHub 生产 hook 开关”。
- `agent-v2:local-completion-audit:strict`：通过；`localClosureReady=true`、`productionReady=false`、`localOpenUncheckedCount=0`。

产品交付影响：

- 现在可以把 `https://ami-service.zeabur.app/` 作为 Agent V2 生产 hook 的后端 API 域名。
- Zeabur 的 GitHub 自动部署已经覆盖“代码同步、构建、服务重启”，不依赖 Agent V2 deploy hook；因此如果目标只是让后端部署最新代码，不需要再为了部署代码配置或打开该 hook。
- Agent V2 deploy hook 是另一层“自动化运营能力”：让 GitHub workflow 在代码变更后自动调用生产后端，执行能力治理数据 auto-publish。只有决定启用这层自动发布时，才需要在 Zeabur 后端环境变量中配置同轮 `AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN`，并在受控窗口把 GitHub Variable `AGENT_V2_PRODUCTION_HOOK_ENABLED` 改为 `true`。
- 当前建议保持 `AGENT_V2_PRODUCTION_HOOK_ENABLED=false`，先使用 Zeabur 自动部署代码 + 管理端治理中心手动发布/审计；等生产 shadow 和观测稳定后，再决定是否启用 GitHub workflow 自动触发 auto-publish。
- 旧正则仍保持生产默认和回退路径；7 天 shadow、线上有用率、生产 LLM 观测、真实回滚验证和旧正则删除授权仍是后续生产阶段任务。

### 2026-07-06 10:12 Asia/Shanghai D0 生产部署同步审计：Zeabur 在线，但当前本地改动尚未证明已部署

基于“Zeabur 云平台自动读取 GitHub 最新变更并自动部署”的产品边界，本轮补齐了生产部署同步审计，避免把“平台具备自动部署能力”误判为“当前本地 Agent V2 改动已经上线”。

已完成：

- `/api/health` 增加非敏感部署元信息：
  - `deployment.commit`
  - `deployment.branch`
  - `deployment.buildId`
  - `deployment.environment`
- 新增单测：`packages/server-v2/src/health/health.controller.spec.ts`，覆盖有/无部署环境变量两种情况。
- 新增只读审计脚本：
  - `agent-v2:production-deployment-sync-audit`
  - `agent-v2:production-deployment-sync-audit:strict`
- 新增报告：
  - `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-production-deployment-sync-audit.json`
  - `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-production-deployment-sync-audit.md`
- `agent-v2:production-rollout-plan:strict` 已接入该审计报告，把 Zeabur 部署同步状态纳入生产 runbook。

只读验证：

```powershell
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/health/health.controller.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run agent-v2:production-deployment-sync-audit
npm.cmd --prefix packages/server-v2 run agent-v2:production-rollout-plan:strict
```

验证结果：

- health 单测通过：1 个测试套件、2 个用例通过。
- Zeabur 生产 health 可达：`GET https://ami-service.zeabur.app/api/health` 返回 200。
- 当前生产 health 尚未返回 `deployment.commit`，因此只能证明 Zeabur 后端在线，不能证明生产运行的是哪一次 GitHub commit。
- 当前本地工作区仍有未提交/未跟踪改动，审计记录为 `localChangedEntryCount=141`；Zeabur 自动部署只会读取 GitHub 上的提交，本地未提交改动不会自动进入生产。
- 当前本地分支为 `codex/local-save-2026-07-02-latest-dev`；审计默认假设 Zeabur 跟踪 `main`，因此需要后续确认 Zeabur 跟踪分支，或将 Agent V2 变更合入 Zeabur 跟踪分支后再自动部署。
- 生产部署同步当前为 `deploymentSyncProven=false`；这不影响本地开发闭环，但意味着不能宣称当前 Agent V2 本地改动已经生产上线。

产品交付影响：

- Zeabur 自动部署能力本身已经足够，不需要 Agent V2 deploy hook 参与代码部署。
- 真正进入生产前，仍需要把当前本地改动提交、推送并合入 Zeabur 跟踪分支；Zeabur 自动部署完成后，再用新版 `/api/health` 的 `deployment.commit` 做只读确认。
- 在生产 commit 能被确认前，7 天 shadow、线上有用率、生产 LLM 观测、真实回滚验证和旧正则删除仍不能开始计入正式生产证据。

### 2026-07-06 10:18 Asia/Shanghai 本地交付门禁复验：后端、管理端、Kiosk 构建与核心单测通过

为避免把“审计脚本通过”误当成“本地实现可交付”，本轮补跑了更宽的构建和测试门禁。

验证命令：

```powershell
npm.cmd --prefix packages/server-v2 run build
npm.cmd run build
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/agent-v2-runtime.service.spec.ts src/agent-v2/intent/agent-v2-intent-extraction.service.spec.ts src/agent-v2/query-engine/generic-query-engine.service.spec.ts src/agent-v2/governance/agent-v2-governance.service.spec.ts src/agent-v2/capability-center/agent-v2-auto-publish.service.spec.ts src/agent-v2/capability-center/agent-v2-capability-center.dto.spec.ts src/agent-v2/capability-center/agent-v2-capability-center.service.spec.ts src/agent-v2/capability/agent-v2-capability-decision.service.spec.ts src/agent-v2/contracts/agent-v2-answer-contract-validator.service.spec.ts src/agent-v2/policy/agent-v2-policy-gateway.service.spec.ts src/agent-v2/tools/agent-v2-business-record-query.service.spec.ts src/agent-v2/tools/agent-v2-business-metric-query.service.spec.ts src/agent-v2/tools/agent-v2-business-trend-query.service.spec.ts src/agent-v2/tools/agent-v2-business-detail-query.service.spec.ts src/agent-v2/tools/agent-v2-business-action-draft.service.spec.ts src/agent-v2/tools/agent-v2-navigation.service.spec.ts src/health/health.controller.spec.ts --runInBand
npx.cmd vitest run src/app/pages/system/AgentGovernanceCenter.test.tsx src/test/permissions.test.ts
```

验证结果：

- `server-v2` 构建通过。
- 管理端主应用构建通过。
- Ami Aura Lite Kiosk 构建通过；仅有 Vite chunk size 警告，不影响产物生成。
- Agent V2 后端核心单测通过：17 个测试套件、198 个用例通过。
- 管理端 Agent Governance 与权限测试通过：2 个测试文件、21 个用例通过。

产品交付影响：

- 本地开发闭环不再只依赖文档或审计报告，已覆盖后端运行时、能力治理服务、能力中心、自动发布、权限策略、问数工具、health 元信息、管理端治理页面和 Kiosk 构建。
- 当前仍不能宣称生产完成；生产完成仍要求本地改动进入 GitHub 可部署提交、Zeabur 自动部署后 commit 可确认、生产 shadow/LLM/有用率/回滚证据齐备，并获得旧正则退役授权。

### 2026-07-06 10:31 Asia/Shanghai 发布前安全审计：无疑似 Secret，仍需整理提交/PR

为推进到 Zeabur 自动部署所需的 GitHub 提交边界，本轮新增发布前安全审计，检查当前改动是否可以进入提交/PR，以及是否有真实 token/env 泄露风险。

已完成：

- 新增只读审计脚本：
  - `agent-v2:release-readiness-audit`
  - `agent-v2:release-readiness-audit:strict`
- 新增报告：
  - `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-release-readiness-audit.json`
  - `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-release-readiness-audit.md`
- `agent-v2:production-rollout-plan:strict` 已接入发布前安全审计，把 `secretFindingCount` 和 `releaseReady` 纳入生产 runbook。

只读验证：

```powershell
npm.cmd --prefix packages/server-v2 run agent-v2:release-readiness-audit
npm.cmd --prefix packages/server-v2 run agent-v2:production-deployment-sync-audit
npm.cmd --prefix packages/server-v2 run agent-v2:production-rollout-plan:strict
```

验证结果：

- 发布前安全审计：`releaseReady=false`、6 个门禁、1 个阻塞。
- `secretFindingCount=0`，未发现可提交文件中的高风险 Secret；本机 `packages/server-v2/.env` 仍被 `.gitignore` 保护，不进入 GitHub。
- 当前仍有 `changedEntryCount=141` 个改动条目，尚未整理成 GitHub 可部署提交，因此 Zeabur 不会自动部署这批本地改动。
- rollout runbook 最新推荐：发布前安全审计已确认无疑似 Secret，但工作区尚未整理成 GitHub 可部署提交；需用户授权后提交/PR，再由 Zeabur 自动部署。

产品交付影响：

- 从安全角度看，当前 Agent V2 改动没有发现真实 token 泄露风险。
- 从上线角度看，下一步不再是继续配置 hook，而是获得 Git 提交/PR 授权，把当前 Agent V2 变更整理为 GitHub 可部署提交。
- 仍不触发生产 hook、不写生产库、不删除旧正则；旧正则退役继续等待生产 shadow、线上有用率、生产 LLM 观测和真实回滚证据。

### 2026-07-06 10:37 Asia/Shanghai 产品决策更新：auto-publish 跟随 GitHub 提交，不做定时发布

用户确认：Agent V2 的能力治理结果暂定为“每次提交 GitHub 后做自动化发布”，平时不做定时自动化发布。

已落地到本地配置口径：

- `.github/workflows/agent-v2.yml` 保持无 `schedule` 触发；生产 auto-publish hook 只允许非 PR、`main` push 或 `workflow_dispatch`，且必须满足显式生产开关、hook URL 和 deploy token。
- `push` 触发时默认使用 `git_diff` scanMode，避免每次提交都做全量扫描；手动触发仍可选择 `hash` / `git_diff` / `full`。
- `.env.production.example` 与 `packages/server-v2/.env.example` 明确 `AGENT_V2_AUTO_PUBLISH_CRON=false`，后端进程不做每日定时自动发布。
- `agent-v2:production-config-readiness` 新增/更新门禁，校验“GitHub 提交触发 + 无 schedule + 后端 Cron 关闭”的组合。
- `agent-v2:production-live-config-audit` 新增 live 审计门禁，确认生产策略不是定时发布，而是后续受控打开 GitHub main 提交触发。
- `agent-v2:production-rollout-plan` 的 D0 生产配置动作已更新：启用前先确认 Zeabur 后端同轮 deploy token，再打开 `AGENT_V2_PRODUCTION_HOOK_ENABLED=true` 并做 hook smoke；打开后每次 `main` push 通过 Agent V2 gate 都会尝试触发 auto-publish。

当前边界：

- 本轮未把 GitHub Variable `AGENT_V2_PRODUCTION_HOOK_ENABLED` 改为 `true`，因此不会因为这次文档/代码调整立即触发生产 hook。
- 本轮未触发生产 hook、未写生产库、未删除旧正则。
- 下一步真正启用“每次 GitHub 提交自动发布”前，仍需完成 Zeabur 后端同轮 token env 确认、GitHub 可部署提交/PR、hook smoke 和生产 shadow 观察。

验证命令：

```powershell
npm.cmd --prefix packages/server-v2 run agent-v2:production-config-readiness:strict
npm.cmd --prefix packages/server-v2 run agent-v2:production-live-config-audit
npm.cmd --prefix packages/server-v2 run agent-v2:release-readiness-audit
npm.cmd --prefix packages/server-v2 run agent-v2:production-rollout-plan:strict
npm.cmd --prefix packages/server-v2 run agent-v2:local-completion-audit:strict
```

验证结果：

- 生产配置 readiness 通过：`pass=true`、9 个门禁、0 个阻塞；新增门禁确认 workflow 有 push 入口、生产 hook 只在 `main` push 或手动触发后执行、push 默认 `git_diff`，且 workflow 无 `schedule`。
- live 配置审计：`pass=false`、16 个门禁、2 个阻塞；新增门禁确认 `AGENT_V2_AUTO_PUBLISH_CRON=false`、GitHub 提交触发策略通过。剩余阻塞仍是 Zeabur 后端同轮 token 未确认与生产 hook 开关未开。
- 发布前安全审计：`secretFindingCount=0`，但 `releaseReady=false`；当前仍有 141 个本地改动条目未整理成 GitHub 可部署提交。
- rollout runbook 继续通过：`rolloutPlanReady=true`、`productionExecutionAllowed=false`、`productionReady=false`。
- 本地完成度审计继续通过：`localClosureReady=true`、`localOpenUncheckedCount=0`，剩余 31 项仍全部归为生产/真实流量/旧正则最终退役后置项。

### 2026-07-06 10:52 Asia/Shanghai GitHub 发布交接包：158 个文件级改动已按批次归档

为继续推进 Zeabur 自动部署所需的 GitHub 提交边界，本轮新增只读 GitHub 发布交接包。该交接包不 stage、不 commit、不 push，只把当前 Agent V2 改动按发布批次、风险和验证命令整理出来，便于后续获得授权后直接提交/PR。

已完成：

- 新增脚本：
  - `packages/server-v2/prisma/agent-v2-github-release-handoff.ts`
- 新增 npm 命令：
  - `agent-v2:github-release-handoff`
  - `agent-v2:github-release-handoff:strict`
- 新增报告：
  - `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-github-release-handoff.json`
  - `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-github-release-handoff.md`
  - `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-github-pr-brief.md`
  - `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-github-stage-manifest.txt`
  - `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-github-stage-manifest.json`
- 发布交接包已接入 `agent-v2:production-rollout-plan:strict`，rollout 结论现在会展示 GitHub 发布交接是否就绪、发布批次数和是否仍需授权。
- 修复 `agent-v2:release-readiness-audit` 的 Git porcelain 路径解析，避免 `.env.production.example` 这类隐藏文件在 Secret 扫描中被误解析为 `env.production.example`。

当前发布批次：

- 发布控制、workflow 与环境样例：6 个文件。
- 后端 schema、migration 与审计脚本：22 个文件。
- Agent V2 后端运行时和治理服务：59 个文件。
- 管理端治理中心、API 与权限入口：15 个文件。
- Kiosk Agent 入口与终端适配：8 个文件。
- 开发计划、方案与测试证据：48 个文件。

验证命令：

```powershell
npm.cmd --prefix packages/server-v2 run agent-v2:release-readiness-audit
npm.cmd --prefix packages/server-v2 run agent-v2:github-release-handoff:strict
npm.cmd --prefix packages/server-v2 run agent-v2:production-deployment-sync-audit
npm.cmd --prefix packages/server-v2 run agent-v2:production-rollout-plan:strict
git diff --check -- packages/server-v2/prisma/agent-v2-github-release-handoff.ts packages/server-v2/prisma/agent-v2-release-readiness-audit.ts packages/server-v2/prisma/agent-v2-production-rollout-plan.ts packages/server-v2/package.json "docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-github-release-handoff.json" "docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-github-release-handoff.md" "docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-release-readiness-audit.json" "docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-release-readiness-audit.md"
```

验证结果：

- 发布前安全审计：`secretFindingCount=0`，`changedEntryCount=158`；仍因未获得 stage/commit/PR 授权而 `releaseReady=false`。
- GitHub 发布交接包：`handoffReady=true`、7 个门禁、0 个阻塞、6 个发布批次；158 个文件级改动全部进入批次，未分组文件为 0。
- 生产部署同步审计：`deploymentSyncProven=false`、`localChangedEntryCount=158`；Zeabur 后端在线，但当前生产 health 尚不能返回 commit。
- rollout runbook：`rolloutPlanReady=true`、`githubReleaseHandoffReady=true`、`githubReleaseBatchCount=6`、`githubReleaseAuthorizationRequired=true`。
- 差异检查无空白错误；仅有已有 CRLF 行尾转换提示。

当前边界：

- 本轮没有执行 `git add`、`git commit`、`git push` 或 PR。
- 本轮没有触发生产 hook、没有写生产库、没有删除旧正则。
- 下一步如需让 Zeabur 自动部署这批 Agent V2 改动，需要用户明确授权后按交接包进入 stage/commit/PR 流程。

### 2026-07-06 11:01 Asia/Shanghai PR Brief：授权后 PR 文案与验证清单已预生成

为减少后续提交/PR 授权后的人工整理，本轮继续扩展 GitHub 发布交接包，自动生成 PR brief：

- 新增文件：
  - `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-github-pr-brief.md`
- PR brief 包含：
  - 建议 PR 标题：`feat(agent-v2): complete knowledge graph llm governance rollout`
  - Summary：Agent V2 知识图谱、LLM 意图、Manifest 映射、通用查询、治理中心、GitHub 提交触发 auto-publish 预留、生产证据链。
  - Release Batches：6 个发布批次、文件数量、目的和风险。
  - Validation checklist：后端 readiness、release audit、Prisma generate、local completion、rollout、后端单测、后端 build、管理端测试、管理端 build、Kiosk build、GitHub release handoff。
  - Production Boundary：本 PR 不应直接打开生产 hook；`AGENT_V2_PRODUCTION_HOOK_ENABLED=false` 和 `AGENT_V2_LEGACY_RETIREMENT_CONFIRMED=false` 继续保持。

验证命令：

```powershell
npm.cmd --prefix packages/server-v2 run agent-v2:release-readiness-audit
npm.cmd --prefix packages/server-v2 run agent-v2:github-release-handoff:strict
npm.cmd --prefix packages/server-v2 run agent-v2:production-deployment-sync-audit
npm.cmd --prefix packages/server-v2 run agent-v2:production-rollout-plan:strict
```

验证结果：

- 发布前安全审计：`changedEntryCount=158`、`secretFindingCount=0`。
- GitHub 发布交接包：`handoffReady=true`、`releaseBatchCount=6`、`authorizationRequired=true`。
- 生产部署同步审计：`localChangedEntryCount=158`、`deploymentSyncProven=false`。
- rollout runbook：`githubReleaseHandoffReady=true`、`githubReleaseBatchCount=6`、`githubReleaseAuthorizationRequired=true`。
- 当前仍未执行 `git add`、`git commit`、`git push`、PR、生产 hook 或旧正则删除。

### 2026-07-06 11:06 Asia/Shanghai Stage Manifest：授权后 staging 文件清单已生成并通过 dry-run

为降低授权后 `git add` 手工挑文件风险，本轮继续扩展 GitHub 发布交接包，自动生成 stage manifest。该 manifest 只是文件清单，不会自动执行 `git add`。

新增文件：

- `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-github-stage-manifest.txt`
- `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-github-stage-manifest.json`

授权后可使用的 staging 命令：

```powershell
git add --pathspec-from-file "docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-github-stage-manifest.txt"
```

本轮校准：

- `agent-v2:release-readiness-audit`、`agent-v2:github-release-handoff` 和 `agent-v2:production-deployment-sync-audit` 已统一改为 `git status --porcelain=v1 -uall` 口径，避免未跟踪目录被算成 1 条、实际 `git add` 时展开成多个文件。
- `agent-v2:github-release-handoff` 新增 stage dry-run 门禁：执行 `git add --dry-run --pathspec-from-file ...`，但不实际 stage。

验证结果：

- Stage manifest 文件数：158。
- GitHub 发布交接包文件数：158。
- Manifest 覆盖率：158/158，未分组文件 0。
- Stage dry-run：158/158，通过。
- `agent-v2:github-release-handoff:strict` 通过：`handoffReady=true`、`stageManifestReady=true`、`stageDryRunReady=true`。
- `agent-v2:production-rollout-plan:strict` 通过：`localChangedEntryCount=158`、`releaseChangedEntryCount=158`、`githubReleaseHandoffReady=true`。

当前边界：

- 本轮仍未执行 `git add`，只是生成授权后可复用的 pathspec 文件。
- 生产 hook、生产写库、旧正则删除和 Zeabur 配置变更仍需明确授权。

### 2026-07-06 11:37 Asia/Shanghai 合并后 Zeabur 部署验收器：只读证明目标提交是否已上线

为继续推进“GitHub 提交后由 Zeabur 自动部署”的产品边界，本轮新增合并后部署验收器。它不负责发布代码，也不触发 Agent V2 deploy hook；它只在代码合入 GitHub 后，用只读证据判断 Zeabur 是否已经运行目标提交。

新增脚本与报告：

- `packages/server-v2/prisma/agent-v2-post-merge-deploy-verify.ts`
- `npm.cmd --prefix packages/server-v2 run agent-v2:post-merge-deploy-verify`
- `npm.cmd --prefix packages/server-v2 run agent-v2:post-merge-deploy-verify:strict`
- `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-post-merge-deploy-verify.json`
- `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-post-merge-deploy-verify.md`

验收器检查项：

- 当前工作区是否已是合并后的干净 GitHub 提交。
- `origin/main` 或 `AGENT_V2_POST_MERGE_TARGET_COMMIT` 是否能解析目标提交。
- GitHub 最近一次 `Agent V2 Gate` 是否对目标提交成功。
- Zeabur 生产 `/api/health` 是否可达。
- 生产 health 是否暴露非敏感 `deployment.commit`。
- 生产 `deployment.commit` 是否匹配目标提交。
- 生产 auto-publish 策略是否仍是 GitHub 提交触发、无 schedule、后端 Cron 关闭。
- 生产 hook 开关状态是否可审计。

rollout runbook 接入：

- `agent-v2-production-rollout-plan` 已读取 `agent-v2-post-merge-deploy-verify.json`。
- runbook 摘要新增：
  - 合并后 Zeabur 验收是否接入。
  - 验收器是否就绪。
  - 合并后生产是否已验证。
  - 目标提交与生产 commit。
  - 验收阻塞项数量。
- D-1 本地基线命令新增 `agent-v2:post-merge-deploy-verify`，用于授权提交/PR 后的只读复验。

验证命令：

```powershell
npm.cmd --prefix packages/server-v2 run agent-v2:post-merge-deploy-verify
npm.cmd --prefix packages/server-v2 run agent-v2:release-readiness-audit
npm.cmd --prefix packages/server-v2 run agent-v2:production-deployment-sync-audit
npm.cmd --prefix packages/server-v2 run agent-v2:github-release-handoff:strict
npm.cmd --prefix packages/server-v2 run agent-v2:production-rollout-plan:strict
```

验证结果：

- 发布后验收器：`verifierReady=true`、`postMergeProductionVerified=false`、12 个门禁、5 个阻塞。
- 当前目标提交：`origin/main=a84af6bf5cd3f3056bbca9f063e71347d3b1bf90`。
- 当前本地分支仍是 `codex/local-save-2026-07-02-latest-dev`，本地 HEAD 为 `d01f836fbbb4be8b674c4b3dceb5663bf844400d`，不是合并后的 `main`。
- 本地改动条目已刷新为 161；这批 Agent V2 变更尚未 stage/commit/PR，因此 Zeabur 不会自动部署。
- Zeabur 生产 health 可达，但仍未返回 `deployment.commit`，所以不能证明生产已运行目标提交。
- GitHub 最近 `Agent V2 Gate` 尚未只读确认为目标提交成功；该项需在 GitHub 合入/推送后复验。
- 发布前安全审计：`changedEntryCount=161`、`secretFindingCount=0`。
- GitHub 发布交接包：`handoffReady=true`、`stageDryRunReady=true`、`stageDryRunEntryCount=161`、`stageDryRunExpectedCount=161`。
- rollout runbook：`rolloutPlanReady=true`、`postMergeDeployVerifyPresent=true`、`postMergeVerifierReady=true`、`postMergeProductionVerified=false`。

当前边界：

- 本轮没有执行 `git add`、`git commit`、`git push` 或创建 PR。
- 本轮没有触发生产 hook，没有写生产库，没有改 Zeabur 环境变量，没有删除旧正则。
- 下一步仍是获得 Git 提交/PR 授权后，把 161 个文件级改动合入 GitHub；Zeabur 自动部署完成后，再运行 `agent-v2:post-merge-deploy-verify:strict` 作为生产上线证据。

### 2026-07-06 11:47 Asia/Shanghai 本地完成度审计扩展：发布交接和 Zeabur 验收纳入总门禁

为避免“本地完成度审计只看 task.md 未勾选项、但漏看 GitHub 发布和 Zeabur 上线边界”，本轮扩展 `agent-v2-local-completion-audit`，把发布前安全审计、GitHub 发布交接包、生产 live 配置审计、生产部署同步、rollout runbook 和合并后部署验收器纳入同一个本地闭环总门禁。

新增总门禁：

- GitHub 提交/PR 交接已准备好但仍需授权：
  - `releaseSecretFindings=0`
  - `githubReleaseHandoff.handoffReady=true`
  - `stageDryRunReady=true`
  - `authorizationRequired=true`
- Zeabur 部署和生产 hook 状态未被误报为完成：
  - `rolloutPlanReady=true`
  - `postMergeVerifierReady=true`
  - `postMergeProductionVerified=false`
  - `deploymentSyncProven=false`
  - `productionHealthReady=true`
  - `productionHookTriggerReady=false`

验证命令：

```powershell
npm.cmd --prefix packages/server-v2 run agent-v2:release-readiness-audit
npm.cmd --prefix packages/server-v2 run agent-v2:production-deployment-sync-audit
npm.cmd --prefix packages/server-v2 run agent-v2:github-release-handoff:strict
npm.cmd --prefix packages/server-v2 run agent-v2:post-merge-deploy-verify
npm.cmd --prefix packages/server-v2 run agent-v2:local-completion-audit:strict
npm.cmd --prefix packages/server-v2 run agent-v2:production-rollout-plan:strict
```

验证结果：

- 发布前安全审计：`changedEntryCount=161`、`secretFindingCount=0`。
- GitHub 发布交接包：`handoffReady=true`、`stageDryRunReady=true`、`stageDryRunEntryCount=161`、`stageDryRunExpectedCount=161`。
- 合并后 Zeabur 验收器：`verifierReady=true`、`postMergeProductionVerified=false`、5 个阻塞。
- 本地完成度审计：`localClosureReady=true`、门禁从 7 个扩展到 9 个、`blockerCount=0`、`localOpenUncheckedCount=0`。
- 生产 rollout runbook：`rolloutPlanReady=true`、`localPrerequisitesReady=true`、`productionExecutionAllowed=false`、`postMergeVerifierReady=true`、`postMergeProductionVerified=false`。

当前边界：

- 本轮仍未执行 `git add`、`git commit`、`git push` 或 PR。
- 本轮没有触发生产 hook、没有写生产库、没有改 Zeabur 环境变量、没有删除旧正则。
- 本地闭环总门禁现在同时覆盖开发完成度、发布交接、Zeabur 上线证明边界和旧正则退役边界；剩余阻塞集中在 GitHub 合入、Zeabur 真实部署 commit、生产 shadow/LLM/有用率/回滚证据和旧正则退役授权。
