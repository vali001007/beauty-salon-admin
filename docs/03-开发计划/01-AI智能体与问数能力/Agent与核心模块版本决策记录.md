# Agent 与核心模块版本决策记录

> 本文件是 Agent 与核心模块版本定位、主入口、兼容边界和退役状态的唯一决策记录。

## 2026-08-04：Ami Brain 治理策略与运行版本采用独立编号体系

### 决策

- 治理策略和运行版本不再共用数据库 Release ID 作为用户版本号。
- 治理策略使用 `GP-{三位序号}`，例如 `GP-003 · Query Only V1 强制治理策略`。
- 运行产品使用 `RT-{三位序号}`，例如 `RT-001 · Query Only V1`。
- 同一运行产品的灰度阶段使用 `RT-001-SHADOW/C05/C20/C50/FULL`，不得显示为五个独立产品版本。
- 评测证据版本使用 `EV-*`；Eval Run 是评测运行记录，不属于 GP 或 RT 版本线。
- 历史未迁移运行对象使用 `LEGACY-RT-{数据库ID}`；数据库 `#ID` 仅在审计详情和故障排查中显示。
- 三条编号线使用独立计数器，新增 GP 不推动 RT/EV 序号，新增 RT 不推动 GP/EV 序号。
- 对象类型与前缀必须一致：治理策略只能是 GP，运行产品只能是 RT，评测快照只能是 EV；不一致时服务端拒绝复用，数据库约束拒绝写入。
- Rollout Sequence ID、Release ID、Eval Run ID 均不得作为新产品编号；未编号对象显示“编号待分配”，禁止使用 `LEGACY-RTS-{sequenceId}`。
- 用户主界面分别使用“治理策略（GP）”“运行版本（RT）”“评测版本/评测运行（EV / Eval Run）”，`Release` 仅保留在底层技术字段、API 兼容和审计语境中。

### 后续编号与命名红线

| 变更对象 | 新编号示例 | 不得联动变更 |
| --- | --- | --- |
| 只调整治理准入、禁止边界或证据要求 | `GP-004` | `RT-001` 和当前 `EV-*` 保持不变 |
| 只调整线上能力目录、运行画像或兼容合同 | `RT-002` | 当前 `GP-*` 和 `EV-*` 保持不变 |
| 只新增评测题集、口径或证据快照 | `EV-002` | 当前 `GP-*` 和 `RT-*` 保持不变 |
| 同一运行版本从 Shadow 晋级到 Full | `RT-001-SHADOW` → `RT-001-FULL` | 不创建 `RT-002`，不改变 GP/EV 编号 |

- 面向用户只称“治理策略”“运行版本”“评测版本/评测运行”，禁止使用“当前 Release”同时指代 GP 和 RT。
- 编号只表示各自版本线内的顺序；`GP-004` 与 `RT-004` 没有必然绑定关系。
- GP 与 RT 可在一次 Transition 中组合切换，但组合切换不改变它们是两个独立产品对象。

### 当前目标组合

| 对象 | 产品身份 | 状态 |
| --- | --- | --- |
| 当前旧治理策略 | `GP-002 · Legacy Shadow Policy` / 内部 #436 | 尚未退役 |
| 当前旧运行 | `LEGACY-RT-452 · Governance Shadow Runtime` | 尚未被取代 |
| 新治理策略 | `GP-003 · Query Only V1 强制治理策略` | 代码已支持，数据库尚未创建/发布 |
| 新运行版本 | `RT-001 · Query Only V1` | 代码已支持，数据库尚未创建/激活 |

### 切换边界

- GP-003 和 RT-001 必须通过同一 `BrainGovernanceTransition` 组合切换；禁止只发布策略后由用户自行判断 Runtime 是否已接入。
- 任一步骤失败时补偿恢复旧治理策略和旧运行；旧快照只标记退役/被取代，不物理删除。
- 目标 Supabase 已应用版本身份与 Transition migration，但尚未创建/发布 GP-003，尚未创建/激活 RT-001，也未退役 #436/#452。

### 主入口

- 版本身份：`packages/server-v2/src/brain/governance/brain-release-identity.service.ts`
- 切换编排：`packages/server-v2/src/brain/governance/brain-governance-transition.service.ts`
- 治理工作台：`src/app/pages/brain/components/BrainGovernanceWorkbench.tsx`
- 运行发布：`src/app/pages/brain/components/BrainRolloutSequencePage.tsx`
- 详细方案：`docs/03-开发计划/01-AI智能体与问数能力/07-Ami-Brain-当前主线/Ami-Brain-旧治理策略退役与新策略启用详细开发方案-2026-08-04.md`

## 2026-07-21：Ami Aura Lite 智能终端统一接入 Ami Brain

### 决策

- Ami Brain 是 Ami Aura Lite 智能终端唯一智能运行时。
- 终端自由问答、多轮追问、动作确认、动作拒绝和回答反馈统一走 `server-v2` Brain 接口。
- Agent V1、V2、V3、V4、V5 从智能终端退役，不再提供版本切换、运行时调用或失败降级。
- Ami Brain 请求失败时终端明确提示重试，不切换到历史 Agent 或旧 AI 问答。

### 主入口

- 客户端：`packages/Ami-Aura-Lite-Kiosk/src/app/services/agentRuntimeService.ts`
- 终端适配：`packages/Ami-Aura-Lite-Kiosk/src/app/services/terminalAgentAdapter.ts`
- 服务端：`packages/server-v2/src/brain/brain.controller.ts`

### 替代对象与状态

| 对象 | 智能终端状态 | 处置 |
| --- | --- | --- |
| Agent V1 | 已退役 | 删除终端入口和调用链，不再降级 |
| Agent V2 | 已退役 | 删除终端入口和调用链，不再降级 |
| Agent V3 | 已退役 | 删除终端入口和调用链，不再降级 |
| Agent V4 | 已退役 | 删除终端入口和调用链，不再降级 |
| Agent V5 | 已退役 | 删除终端入口和调用链，不再降级 |
| Ami Brain | 主线 | 智能终端唯一智能运行时 |

### 兼容边界

- 管理后台历史 Agent 工作台不在本次改造范围内。
- `server-v2` 中 V1–V5 历史 API 暂时冻结保留，供终端之外的既有消费者迁移；不得重新接回智能终端。
- 历史终端会话数据不删除。智能终端只展示带 `runtime: ami_brain` 来源标识的新会话，旧会话继续保留在数据库。
- 收银、预约、核销、办卡、充值、服务记录等确定性业务流程继续调用统一业务 API，不经过历史 Agent。

### 发布门禁

- 终端页面不存在 V1–V5 切换入口或本地版本状态。
- 终端生产代码不存在 V1–V5 创建、追问、审批和旧 AI 兜底调用。
- Ami Brain 失败后只显示错误和重试提示，不产生第二条智能请求。
- 新终端会话写入 `runtime: ami_brain`，历史面板过滤无来源标识的旧记录。
- 终端定向测试、类型检查、无 mock 检查和独立构建全部通过后，才允许进入发布流程。

### 旧版后续处置

- 当前阶段：V1–V5 在智能终端侧已退役，在管理后台和服务端标记为冻结保留。
- 后续删除服务端历史模块前，必须完成消费者扫描、真实数据审计和独立删除方案，并重新获得删除及发布授权。

## 2026-07-22：Ami Brain 当前账号恢复模型驱动核心只读 Canary

### 决策

- 当前门店 6、当前操作账号 1 定向切换到模型驱动 Release #396：`ami-brain-core-readonly-20260722-user1-model`。
- 本次只恢复 10 项核心只读能力，不进行全量用户发布，也不启用采购、核销、营销执行等动作能力。
- 其他账号继续使用现有 rules 基线，避免在基础错题完成修复前扩大影响面。

### 核心能力

- `customer_facts`
- `finance_payment_breakdown`
- `front_desk_operations_overview`
- `inventory_operations_overview`
- `manager_staff_overview`
- `order_revenue_analysis`
- `product_sales_ranking`
- `project_service_ranking`
- `staff_performance_ranking`
- `store_operations_overview`

### 发布门禁与结果

- 评测证据发布：Release #395 `ami-brain-core-readonly-20260722-eval`。
- 评测运行：Eval Run #103，31/31 通过，失败 0，模型供应商不可用 0。
- 能力覆盖、安全边界、跨门店、权限、提示注入和时间范围门禁全部通过。
- 当前账号运行时解析结果：`mode=model`、`releaseId=396`、能力候选数 10；34 个语义版本引用成功加载为 56 条定义快照。

### 回滚边界

- Release #396 仅作用于用户 1 / 门店 6；发现假成功、错误时间范围、越权或模型不可用时，立即回滚到 Release #3 rules 基线。
- 本次 Canary 通过不代表 650 题或全量能力已经达到发布标准；全量切换必须重新完成当前错题集、同义改写、650 题和真实生产路径门禁。

## 2026-07-15：门店经营指标核心模块 v1

| 项目 | 决策 |
| --- | --- |
| 模块 | `store-metrics` v1 |
| 定位 | 门店经营指标的统一事实、计算、质量、快照和目标服务 |
| 主入口 | `GET /api/store-metrics/overview`、管理端 `/store-operations/metrics` |
| 替代对象 | 店长首页独立收入聚合；Ami Brain 独立经营目标读取 |
| 兼容边界 | `BrainStoreOperatingTarget` 仅保留为旧数据迁移来源；新目标写入 `StoreMetricTarget` |
| 发布门禁 | Prisma 校验、迁移空库验证、后端/前端测试与构建、12 项人工复算；远端迁移单独授权 |
| 旧版处置 | 冻结旧目标写入口；旧历史关系只读推断并标记 `estimated`，不自动回填 |
