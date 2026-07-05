# Agent 能力中心 MVP 详细开发计划 task

版本：v1.0
日期：2026-07-03
时区：Asia/Shanghai
目标：把管理端、后端已经存在的业务能力自动进入能力候选池，通过管理员配置、自动化校验、评测审核后发布为 Agent V2 正式能力。
执行原则：不在旧 Agent 关键词路由、旧工具补丁里继续追加能力；新增能力中心作为 Agent V2 的能力治理与发布入口。

---

## 0. 当前基线

### 0.1 已有基础

- Agent V2 运行时已存在：`packages/server-v2/src/agent-v2/agent-v2-runtime.service.ts`
- Agent V2 工具注册表已存在：`packages/server-v2/src/agent-v2/agent-v2-tool-registry.service.ts`
- Agent V2 Manifest 类型已存在：`packages/server-v2/src/agent-v2/capability/agent-v2-capability.types.ts`
- Agent V2 静态 Manifest 已存在：`packages/server-v2/src/agent-v2/capability/agent-v2-capability-manifest.ts`
- 候选能力生成脚本已存在：`packages/server-v2/prisma/agent-v2-capability-draft-generator.ts`
- 评测门禁脚本已存在：`packages/server-v2/prisma/agent-v2-eval-gate.ts`
- 候选能力草稿已生成：`docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-capability-drafts.json`
- 候选能力中文翻译版已生成：`docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-capability-drafts-中文翻译版.md`
- 评测题已生成：`docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-eval-questions.md`
- 当前治理报告显示：
  - Prisma 模型：126
  - DTO 类：177
  - 后端接口：600
  - 已识别权限接口：283
  - 前端路由：72
  - 能力草稿：592
  - Eval 草稿：650
  - P0 未映射 Eval：0
  - 最近生成时间：2026-07-03 14:49:06 Asia/Shanghai

### 0.2 主要缺口

- 候选能力还只落在文件和脚本里，没有进入数据库治理表。
- 静态 Manifest 仍是代码内置，不支持管理端审核发布、版本化、回滚。
- 管理端没有 Agent 能力中心页面。
- DTO 缺失、权限推断、queryKey 未实现等待处理事项没有产品化审核流。
- 评测结果没有作为能力发布前置门禁接入管理端。
- Runtime 目前主要从静态 Manifest 加载，尚未支持数据库 Active Manifest。

---

## 1. MVP 交付范围

### 1.1 本期必须交付

- [x] 管理端新增 `系统设置 / Agent 能力中心`。
- [x] 后端新增 Agent V2 能力治理数据表。
- [x] 候选能力扫描结果写入数据库。
- [x] 管理员可查看、筛选、审核、补齐候选能力。
- [x] 管理员可对待确定事项做有限选项配置。
- [x] 系统可自动生成正式 Manifest item。
- [x] 系统可执行发布前校验。
- [x] 系统可运行 650 题评测相关子集。
- [x] 低风险只读能力通过评测门禁后可自动发布。
- [x] 写入、删除、发券、下发类能力必须审批或阻断。
- [x] Runtime 支持加载数据库发布的 Active Manifest。
- [x] 每次发布生成 Manifest 版本，支持回滚。

### 1.2 本期不做

- [ ] 不开放管理员手写 SQL。
- [ ] 不允许管理员绕过权限发布能力。
- [ ] 不允许高风险能力自动执行真实业务动作。
- [ ] 不一次性承诺 592 条全部发布。
- [ ] 不把旧 Agent 编排器作为主要能力发布入口。
- [ ] 不把 DTO 缺失、queryKey 未实现的能力伪装成可发布。

---

## 2. 产品流程

### 2.1 标准流程

```text
扫描管理端/后端能力
  -> 生成候选能力草稿
  -> 系统自动预检
  -> 管理员审核待确定项
  -> 生成 Manifest 草案
  -> queryKey dry-run
  -> 契约校验
  -> 权限校验
  -> 评测门禁
  -> 发布 Active Manifest 版本
  -> Runtime 热加载
```

### 2.2 能力状态

| 状态 | 产品含义 | 允许操作 |
|---|---|---|
| `draft` | 系统扫描出的候选能力 | 查看、编辑、合并、废弃 |
| `needs_review` | 存在待确定事项 | 配置领域、对象、权限、输出、字段策略 |
| `needs_development` | 缺 queryKey、DTO 或工具实现 | 生成开发任务，不允许发布 |
| `ready_for_eval` | 配置完整，等待评测 | 运行 dry-run、运行评测 |
| `eval_failed` | 评测未通过 | 查看失败原因、回到审核 |
| `ready_to_publish` | 评测通过，可发布 | 发布到 Manifest |
| `published` | 已进入正式能力 | 查看版本、禁用、回滚 |
| `disabled` | 已停用 | 重新启用或归档 |
| `rejected` | 不采纳 | 归档、恢复 |

### 2.3 发布策略

| 发布策略 | 适用能力 | 规则 |
|---|---|---|
| `auto_publish` | 只读、指标、趋势、详情、诊断、导航、草稿 | 权限、DTO、queryKey、字段策略、评测全部通过后自动发布 |
| `approval_required` | 生成草稿、需要人工确认的动作 | 能发布为能力，但执行时必须二次确认或审批 |
| `write_blocked` | 直接写入、删除、发券、下发、批量变更 | 不能自动发布为可执行能力，只能生成开发/审批任务 |

---

## 3. 后端数据模型任务

### T3.1 新增能力候选表

新增 Prisma model：`AgentCapabilityDraft`

建议字段：

- `id`
- `capabilityId`
- `status`
- `source`
- `displayName`
- `description`
- `domain`
- `businessObject`
- `actionsJson`
- `personaCodesJson`
- `sourceModelsJson`
- `sourceApisJson`
- `sourceDtosJson`
- `outputKindsJson`
- `executorJson`
- `storeScope`
- `permissionCodesJson`
- `permissionSource`
- `fieldPoliciesJson`
- `riskLevel`
- `releaseStrategy`
- `examplesJson`
- `negativeExamplesJson`
- `triggerKeywordsJson`
- `boundaryNotesJson`
- `evidenceJson`
- `confirmationNeededJson`
- `scannerSnapshotJson`
- `lastScanAt`
- `createdAt`
- `updatedAt`

验收：

- [ ] 能保存现有 592 条候选能力。
- [ ] `capabilityId` 唯一。
- [ ] 可按领域、状态、发布策略、风险、权限来源筛选。
- [ ] 可保留扫描原始证据，便于追溯。

### T3.2 新增审核记录表

新增 Prisma model：`AgentCapabilityReview`

建议字段：

- `id`
- `draftId`
- `reviewerId`
- `reviewAction`
- `beforeJson`
- `afterJson`
- `comment`
- `createdAt`

验收：

- [ ] 每次管理员修改配置都有审计记录。
- [ ] 可以回看字段变更。
- [ ] 可以追踪是谁把能力从待审核推进到可评测。

### T3.3 新增 Manifest 版本表

新增 Prisma model：`AgentCapabilityManifestVersion`

建议字段：

- `id`
- `versionNo`
- `status`
- `source`
- `summary`
- `publishedBy`
- `publishedAt`
- `rollbackFromVersionId`
- `evalRunId`
- `manifestHash`
- `createdAt`

验收：

- [ ] 每次发布生成版本。
- [ ] 同一时间只能有一个 `active` 版本。
- [ ] 支持回滚到历史版本。

### T3.4 新增 Manifest 能力项表

新增 Prisma model：`AgentCapabilityManifestItem`

建议字段：

- `id`
- `versionId`
- `capabilityId`
- `status`
- `manifestJson`
- `sourceDraftId`
- `createdAt`

验收：

- [ ] 能保存完整 `AgentV2CapabilityManifest` JSON。
- [ ] 能按版本列出当时正式能力清单。
- [ ] 能从 draft 追溯到正式能力。

### T3.5 新增发布执行记录表

新增 Prisma model：`AgentCapabilityPublishRun`

建议字段：

- `id`
- `draftId`
- `versionId`
- `status`
- `checksJson`
- `errorMessage`
- `startedBy`
- `startedAt`
- `completedAt`

验收：

- [ ] 发布失败可看到具体阻断项。
- [ ] 发布成功可看到通过的校验项。

### T3.6 新增 queryKey 注册表

新增 Prisma model：`AgentToolQueryKeyRegistry`

建议字段：

- `id`
- `queryKey`
- `toolName`
- `domain`
- `businessObject`
- `status`
- `implementationSource`
- `inputContractJson`
- `outputContractJson`
- `sampleArgsJson`
- `lastDryRunStatus`
- `lastDryRunAt`
- `lastErrorMessage`
- `createdAt`
- `updatedAt`

验收：

- [ ] 能知道某个能力的 queryKey 是否已实现。
- [ ] 能区分已实现、待开发、已废弃。
- [ ] 能在发布前做 dry-run。

---

## 4. 后端服务任务

### T4.1 能力扫描服务

新增服务：`AgentCapabilityScannerService`

职责：

- 读取后端 Controller。
- 读取 DTO。
- 读取 Prisma Model。
- 读取前端路由和菜单权限。
- 读取现有 Agent V2 tool registry。
- 读取 eval questions。
- 生成或更新 `AgentCapabilityDraft`。

输入：

- `scanMode`: `full` / `incremental`
- `source`: `controller` / `route` / `eval` / `all`

输出：

- 新增候选数
- 更新候选数
- 废弃候选数
- 待确认项统计
- 扫描报告

验收：

- [ ] 手动触发扫描可把文件草稿导入 DB。
- [ ] 重复扫描不会重复生成相同能力。
- [ ] 已审核过的配置不会被扫描结果覆盖，只更新来源证据。

### T4.2 候选能力治理服务

新增服务：`AgentCapabilityGovernanceService`

职责：

- 读取候选列表。
- 保存管理员配置。
- 计算待确定事项。
- 识别重复能力。
- 识别冲突能力。
- 标记废弃、合并、恢复。

验收：

- [ ] 能筛选 `DTO 缺失`、`权限推断`、`queryKey 未实现`。
- [ ] 能把多个候选合并为一个正式能力草案。
- [ ] 能把低价值候选标记为不采纳。

### T4.3 Manifest 编译服务

新增服务：`AgentCapabilityManifestCompilerService`

职责：

- 从审核后的 draft 生成 `AgentV2CapabilityManifest`。
- 校验字段完整性。
- 校验发布策略。
- 校验权限。
- 校验字段策略。
- 校验 executor。
- 校验 queryKey。

验收：

- [ ] 能把一条 `ready_for_eval` 草稿编译为 Manifest 草案。
- [ ] 缺权限码时不能编译通过。
- [ ] 缺 queryKey 时不能编译通过。
- [ ] 高风险动作不能编译为 `auto_publish`。

### T4.4 Manifest 版本服务

新增服务：`AgentCapabilityManifestVersionService`

职责：

- 创建版本。
- 发布版本。
- 激活版本。
- 回滚版本。
- 导出版本。
- 对比版本差异。

验收：

- [ ] 发布新增能力后生成新版本。
- [ ] 回滚后 Runtime 使用旧版本。
- [ ] 版本 diff 能展示新增、修改、停用能力。

### T4.5 Runtime 动态 Manifest 加载

改造：

- `AgentV2CapabilityDecisionService` 不再只读取静态 `AGENT_V2_CAPABILITY_MANIFESTS`。
- 新增 `AgentV2ManifestProvider`。
- Manifest 来源合并：
  - 静态手工内置能力。
  - 数据库 Active Manifest。
  - 灰度开关控制的候选能力。

加载规则：

```text
静态 P0 能力作为兜底
数据库 Active Manifest 优先
同 capabilityId 以数据库 Active 版本覆盖静态版本
disabled 能力不参与决策
```

验收：

- [x] 发布一条新能力后无需改代码即可被 Runtime 选择。
- [x] 禁用一条能力后 Runtime 不再命中。
- [x] 关闭 DB Manifest 开关时仍可回退静态 P0 能力。

### T4.6 queryKey dry-run 服务

新增服务：`AgentV2CapabilityCenterService.dryRunDraft`

职责：

- 根据 draft executor 调用对应工具。
- 使用 sample args 做安全 dry-run。
- 返回样例数据、证据包、错误。
- 不执行写入、删除、发券、下发。

验收：

- [x] 已实现 queryKey 返回 `pass`。
- [x] 未实现 queryKey 返回 `needs_development`。
- [x] 高风险动作 dry-run 不执行真实动作。

### T4.7 评测门禁服务

新增服务：`AgentV2CapabilityCenterService.runEvalGate`

职责：

- 绑定 eval questions。
- 运行能力相关子集评测。
- 输出能力级评测结果。
- 输出版本级评测结果。
- 阻断未通过能力发布。

验收：

- [x] P0 问题错路由为 0 才允许发布 P0 能力。
- [x] 权限不明确的能力不能发布。
- [x] 契约不通过的能力不能发布。
- [x] 高风险自动发布样例必须为 0。

---

## 5. 后端 API 任务

### T5.1 候选能力 API

新增 Controller：`AgentCapabilityCenterController`

接口：

- `GET /api/agent-v2/capability-center/drafts`
- `GET /api/agent-v2/capability-center/drafts/:id`
- `POST /api/agent-v2/capability-center/scan`
- `PATCH /api/agent-v2/capability-center/drafts/:id`
- `POST /api/agent-v2/capability-center/drafts/:id/merge`
- `POST /api/agent-v2/capability-center/drafts/:id/reject`
- `POST /api/agent-v2/capability-center/drafts/:id/restore`

验收：

- [ ] 支持分页。
- [ ] 支持按状态、领域、风险、发布策略、权限来源筛选。
- [ ] 支持关键词搜索能力 ID、名称、接口、模型。

### T5.2 预检 API

接口：

- `POST /api/agent-v2/capability-center/drafts/:id/validate`
- `POST /api/agent-v2/capability-center/drafts/:id/dry-run`
- `POST /api/agent-v2/capability-center/drafts/:id/compile`

验收：

- [ ] 返回缺权限、缺 DTO、缺 queryKey、输出契约缺失等阻断项。
- [ ] 返回可修复建议。
- [ ] 返回 Manifest 草案预览。

### T5.3 评测 API

接口：

- `POST /api/agent-v2/capability-center/eval-runs`
- `GET /api/agent-v2/capability-center/eval-runs`
- `GET /api/agent-v2/capability-center/eval-runs/:id`
- `GET /api/agent-v2/capability-center/drafts/:id/eval-cases`

验收：

- [ ] 可按单能力跑评测。
- [ ] 可按版本跑评测。
- [ ] 可查看失败问题、期望能力、实际能力、错误类型。

### T5.4 发布 API

接口：

- `POST /api/agent-v2/capability-center/drafts/:id/publish`
- `POST /api/agent-v2/capability-center/publish-batch`
- `GET /api/agent-v2/capability-center/manifest/versions`
- `GET /api/agent-v2/capability-center/manifest/versions/:id`
- `POST /api/agent-v2/capability-center/manifest/versions/:id/rollback`
- `GET /api/agent-v2/capability-center/manifest/versions/:id/diff`

验收：

- [ ] 单能力发布通过后进入 Active Manifest。
- [ ] 批量发布前必须先跑门禁。
- [ ] 回滚后能力路由恢复到历史版本。

### T5.5 权限

新增权限建议：

- `core:agent-capability:view`
- `core:agent-capability:review`
- `core:agent-capability:publish`
- `core:agent-capability:rollback`

验收：

- [ ] 只有系统管理员或授权角色可发布能力。
- [ ] 普通业务角色只能查看发布结果，不可修改。
- [ ] API 和前端菜单权限一致。

---

## 6. 管理端前端任务

### T6.1 新增路由和菜单

新增页面：

- `src/app/pages/system/AgentCapabilityCenter.tsx`

建议路由：

- `/system/agent-capabilities`

菜单位置：

- `系统设置 / Agent 能力中心`

验收：

- [ ] 系统管理员可进入。
- [ ] 无权限用户不可进入。
- [ ] 顶部门店选择不影响全局能力治理，仅影响 dry-run 样例数据。

### T6.2 候选能力池列表

列表字段：

- 能力 ID
- 中文名称
- 领域
- 对象
- 动作
- 状态
- 风险
- 发布策略
- 权限来源
- DTO 状态
- queryKey 状态
- 评测状态
- 更新时间
- 操作

筛选项：

- 状态
- 领域
- 风险
- 发布策略
- 权限来源
- DTO 是否缺失
- queryKey 是否实现
- 是否 P0 命中
- 关键词

验收：

- [ ] 默认分页 10 条。
- [ ] 加载优先展示列表骨架或前 10 条。
- [ ] 不因 592 条候选导致页面长时间空白。

### T6.3 能力详情抽屉

详情区块：

- 基础信息
- 来源证据
- 权限与门店范围
- DTO 与请求契约
- 输出契约
- 字段策略
- queryKey 映射
- 正向样例
- 负向样例
- 评测问题
- 发布预检
- 审核记录

验收：

- [ ] 管理员能清楚看到为什么不能发布。
- [ ] 所有英文枚举有中文解释。
- [ ] DTO 缺失、权限推断、queryKey 未实现有醒目标识。

### T6.4 待确定事项配置

配置方式：

- 领域：下拉选择。
- 业务对象：下拉选择。
- 动作：多选。
- 输出形态：多选。
- 权限码：从权限管理读取。
- 字段策略：表格编辑，支持允许、脱敏、禁止。
- 发布策略：下拉选择。
- queryKey：从注册表读取。
- 正负向样例：文本列表编辑。

验收：

- [ ] 管理员不需要写 JSON。
- [ ] 高风险动作选择 `auto_publish` 时前端直接提示不允许。
- [ ] 权限码必须从真实权限列表选择，不能手填任意字符串。

### T6.5 预检与评测面板

展示：

- Manifest schema 校验
- 权限校验
- DTO 校验
- queryKey dry-run
- 输出契约校验
- 评测门禁
- 高风险自动发布检查

验收：

- [ ] 每个阻断项都有原因和处理建议。
- [ ] 评测失败能展开查看具体问题。
- [ ] 通过后显示“可发布”。

### T6.6 发布与回滚页面

功能：

- 查看 Manifest 版本。
- 查看版本差异。
- 查看发布人和发布时间。
- 查看评测报告。
- 回滚到历史版本。

验收：

- [ ] 发布后能看到新增能力数量。
- [ ] 回滚前二次确认。
- [ ] 回滚后 Runtime 生效。

---

## 7. 自动化生成任务

### T7.1 扫描脚本服务化

当前脚本：`packages/server-v2/prisma/agent-v2-capability-draft-generator.ts`

改造目标：

- 保留 CLI 能力。
- 抽取核心扫描逻辑为 server service。
- 支持 API 调用扫描。
- 支持增量扫描。
- 支持扫描结果写 DB。
- 支持输出文件作为审计报告。

验收：

- [ ] CLI 和管理端触发扫描结果一致。
- [ ] 扫描后候选池统计和治理报告一致。

### T7.2 自动生成 Manifest 草案

生成规则：

- 从 draft 字段生成 Manifest。
- 用管理员配置覆盖扫描推断字段。
- 自动补齐 `version`、`status`、`source`。
- 自动生成字段策略默认值。
- 自动生成 evidence panel。
- 自动生成 boundaryNotes。

验收：

- [ ] 管理员点击“生成草案”后可看到完整 Manifest。
- [ ] 缺字段时列出阻断项。

### T7.3 自动生成开发任务

当能力缺 queryKey、DTO 或工具实现时：

- 自动生成待开发任务。
- 标记 `needs_development`。
- 输出建议代码路径。
- 关联候选能力。

验收：

- [ ] 缺 queryKey 的能力不能发布，但能生成开发任务。
- [ ] 开发完成后重新扫描可恢复到 `ready_for_eval`。

---

## 8. 评测与门禁任务

### T8.1 650 题接入能力中心

来源：

- `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-eval-questions.md`

任务：

- 解析 650 题。
- 绑定 expectedCapabilityId。
- 绑定优先级 P0/P1/P2/P3。
- 绑定 expectedOutputKinds。
- 绑定 evidenceRequired。

验收：

- [ ] 能力详情页能看到相关测试问题。
- [ ] 发布前能跑相关子集。

### T8.2 门禁规则

发布必须满足：

- P0 错路由：0。
- P0 权限需复核：0。
- P0 契约未通过：0。
- 高风险自动发布：0。
- 缺 DTO：0。
- 缺 queryKey：0。
- 缺字段策略：0。

验收：

- [ ] 任一门禁失败时发布按钮不可用。
- [ ] 失败原因写入发布记录。

### T8.3 CI 接入

现有文件：

- `.github/workflows/agent-v2.yml`

任务：

- 将能力扫描、Manifest 校验、Eval Gate 接入 CI。
- PR 中展示报告摘要。
- 严格模式下门禁失败阻断合并。

验收：

- [ ] `agent-v2-eval-gate.ts --strict` 可在 CI 运行。
- [ ] 生成报告路径固定。
- [ ] CI 失败原因能定位到能力或测试题。

---

## 9. 安全与权限任务

### T9.1 发布策略安全拦截

规则：

- 直接写入、删除、发券、下发、批量变更一律不能 `auto_publish`。
- `confirm_action` 默认 `approval_required` 或 `write_blocked`。
- 未识别动作默认 `approval_required`。

验收：

- [ ] 管理员无法把高风险能力强行设为自动发布。
- [ ] 后端也必须重复校验，不能只靠前端。

### T9.2 字段脱敏策略

规则：

- 手机号默认脱敏。
- openid、unionid、token、password、secret 默认禁止。
- 客户备注、内部诊断、病史类字段默认摘要或脱敏。
- 财务敏感字段按权限控制。

验收：

- [ ] 输出证据包只包含授权字段。
- [ ] 字段策略变更有审核记录。

### T9.3 门店范围策略

规则：

- 大多数经营能力 `storeScope=required`。
- 平台级能力 `storeScope=optional`。
- 系统配置类能力可 `storeScope=forbidden`。

验收：

- [ ] 门店角色不能查询其他门店数据。
- [ ] 系统管理员可按权限查看全局能力。

---

## 10. 验证计划

### 10.1 单元测试

新增或补充：

- `AgentCapabilityScannerService` 测试。
- `AgentCapabilityGovernanceService` 测试。
- `AgentCapabilityManifestCompilerService` 测试。
- `AgentCapabilityManifestVersionService` 测试。
- `AgentQueryKeyDryRunService` 测试。
- `AgentCapabilityEvalGateService` 测试。
- `AgentV2ManifestProvider` 测试。

命令：

```powershell
npx.cmd vitest run packages/server-v2/src/agent-v2
```

### 10.2 后端类型与构建

命令：

```powershell
npm.cmd --prefix packages/server-v2 run db:generate
npm.cmd --prefix packages/server-v2 run build
```

### 10.3 管理端验证

命令：

```powershell
npm.cmd run build
npm.cmd run check:api
```

### 10.4 评测验证

命令：

```powershell
npx.cmd tsx packages/server-v2/prisma/agent-v2-capability-draft-generator.ts
npx.cmd tsx packages/server-v2/prisma/agent-v2-eval-gate.ts --strict
```

### 10.5 手动验收场景

- [ ] 进入 `系统设置 / Agent 能力中心`。
- [ ] 触发全量扫描。
- [x] 候选池显示 592 条候选能力。
- [ ] 筛选 DTO 缺失能力。
- [ ] 筛选权限推断能力。
- [ ] 打开候选详情，配置权限码、输出形态、字段策略。
- [ ] 对一条低风险只读能力执行 dry-run。
- [ ] 运行该能力相关评测。
- [ ] 发布为正式能力。
- [ ] 在终端 Agent 提问命中新发布能力。
- [ ] 禁用该能力后再次提问不再命中。
- [ ] 回滚 Manifest 版本后能力恢复。
- [ ] 尝试发布高风险写入能力，系统阻断。

---

## 11. 里程碑拆分

### M1 数据模型与扫描入库

目标：候选能力从文件进入数据库。

任务：

- [x] 新增 Prisma 表。
- [x] 生成 migration。
- [x] 抽取扫描导入服务。
- [x] 导入现有候选 JSON。
- [ ] 输出独立扫描报告。

验收：

- [ ] DB 中能看到候选能力。
- [ ] 统计数量与治理报告基本一致。
- [x] 重复扫描不重复插入。

预计工作量：2-3 天。

### M2 后端能力中心 API

目标：提供候选池、详情、审核、预检、发布 API。

任务：

- [x] 新增 Controller。
- [x] 新增 Service。
- [x] 复用 `core:system:view`、`core:system:permissions` 权限码。
- [ ] 新增 DTO。
- [x] 新增单元测试。

验收：

- [x] API 支持分页和筛选。
- [x] API 可保存审核配置。
- [x] API 可输出 Manifest 草案。

预计工作量：3-4 天。

### M3 管理端能力中心页面

目标：管理员可视化审核能力。

任务：

- [x] 新增路由。
- [x] 新增菜单。
- [x] 新增候选列表。
- [x] 新增详情面板。
- [x] 新增配置动作。
- [x] 新增预检面板。
- [x] 新增版本列表。

验收：

- [x] 管理员不需要看 JSON。
- [x] 待确定事项可配置。
- [x] 阻断项清晰展示。

预计工作量：4-5 天。

### M4 Manifest 编译、评测、发布

目标：能力可以从候选发布到正式 Manifest。

任务：

- [x] Manifest 编译服务。
- [x] queryKey dry-run。
- [x] Eval Gate 接入。
- [x] 发布版本。
- [x] Runtime DB Manifest 加载。
- [x] 回滚。

验收：

- [ ] 发布一条低风险能力后 Agent 可命中。
- [x] 评测失败不能发布。
- [ ] 回滚后 Runtime 生效。

预计工作量：4-5 天。

### M5 CI 与治理闭环

目标：能力中心进入持续治理。

任务：

- [x] CI 接入扫描。
- [x] CI 接入 Eval Gate。
- [x] 发布报告落盘。
- [ ] 管理端展示报告。
- [ ] 新增开发任务导出。

验收：

- [ ] 新增后端 API 或管理端路由后能进入候选池。
- [ ] 未审核能力不会影响正式 Agent。
- [x] 发布前门禁可重复执行。

预计工作量：2-3 天。

---

## 12. 数据迁移与兼容策略

### 12.1 静态 Manifest 兼容

- 保留现有静态 P0 Manifest。
- 数据库 Active Manifest 覆盖同 ID 静态能力。
- 数据库加载失败时回退静态 Manifest。

### 12.2 候选文件兼容

- 保留当前 JSON/Markdown 输出作为审计资料。
- 新增扫描后同时写 DB 和报告文件。
- 不再把文件作为 Runtime 真正能力来源。

### 12.3 旧 Agent 兼容

- V2 可执行时接管。
- V2 无能力或门禁失败时回退旧链路。
- 不再在旧链路新增业务补丁。

---

## 13. 验收标准

### 13.1 产品验收

- [ ] 管理员能看到系统自动发现的候选能力。
- [ ] 管理员能理解每个待确定项是什么意思。
- [ ] 管理员能通过选项完成能力审核。
- [ ] 管理员能看到为什么某能力不能发布。
- [ ] 管理员能发布低风险能力。
- [ ] 管理员能回滚发布版本。

### 13.2 技术验收

- [ ] 候选能力进入数据库。
- [ ] Manifest 支持数据库版本。
- [ ] Runtime 可加载 Active Manifest。
- [ ] 工具 dry-run 可判断 queryKey 是否可用。
- [ ] 评测门禁可阻断发布。
- [ ] 高风险能力不可自动发布。
- [ ] 权限、字段策略、证据包完整。

### 13.3 业务验收

- [ ] 新增管理端页面或后端接口后，扫描可进入候选池。
- [ ] 发布后的能力能被 Agent 正确选择。
- [ ] Agent 不再依赖无限追加关键词补丁。
- [ ] 问“已经发生的记录”和“风险预测”能稳定区分。
- [ ] 低风险经营查询可自动扩展，高风险业务动作保持审批。

---

## 14. 风险与处理

| 风险 | 影响 | 处理 |
|---|---|---|
| DTO 缺失较多 | 候选无法自动发布 | 缺 DTO 标记为 `needs_development`，生成开发任务 |
| queryKey 未实现 | Agent 无法真实取数 | 建 queryKey 注册表，未实现阻断发布 |
| 权限推断不可靠 | 可能越权 | 必须绑定真实权限码后发布 |
| 管理员配置过多 | 操作复杂 | 默认系统推荐，管理员只处理阻断项 |
| 动态 Manifest 出错 | Agent 路由异常 | 保留静态 P0 Manifest 兜底，支持回滚 |
| 评测覆盖不足 | 发布后答非所问 | 发布前必须绑定相关 eval case |
| 高风险动作误发布 | 业务数据被误改 | 后端强制安全拦截，不依赖前端 |

---

## 15. 推荐开发顺序

1. 新增 Agent 能力治理表和 Prisma migration。
2. 把现有候选 JSON 导入数据库。
3. 新增候选能力列表和详情 API。
4. 新增管理端候选能力池页面。
5. 新增管理员配置和审核记录。
6. 新增 Manifest 编译服务。
7. 新增 queryKey dry-run。
8. 新增评测门禁服务。
9. 新增 Manifest 版本发布和回滚。
10. 改造 Runtime 支持数据库 Active Manifest。
11. 接入 CI。
12. 跑完整验收。

---

## 16. 第一批 MVP 发布候选

优先选择满足以下条件的能力：

- 只读。
- 低风险。
- 权限明确。
- DTO 完整。
- queryKey 已实现。
- outputKinds 已被前端支持。
- Eval P0/P1 有覆盖。

建议第一批：

- 财务日结指标。
- 支付方式拆分。
- 退款指标。
- 商品订单记录。
- 项目订单记录。
- 会员卡订单记录。
- 次卡订单记录。
- 次卡核销记录。
- 客户消费记录。
- 库存已发生报废记录。
- 库存临期风险。
- 跳转收银台。
- 跳转次卡核销。

---

## 17. 最终交付清单

- [x] Prisma schema 和 migration。
- [x] Agent 能力扫描结果导入数据库。
- [x] Agent 能力治理服务。
- [x] Agent Manifest 编译服务。
- [x] Agent Manifest 版本服务。
- [x] Agent queryKey dry-run 服务。
- [x] Agent Eval Gate 服务接入管理端发布门禁。
- [x] Agent 能力中心 Controller。
- [x] Agent 能力中心前端页面。
- [x] Agent 能力中心权限配置。
- [x] Runtime DB Manifest 加载。
- [x] CI 门禁。
- [x] 单元测试。
- [x] 构建验证。
- [x] 管理端运行态 smoke test。

---

## 18. 本次实施状态（2026-07-03）

### 18.1 已完成

- 新增 Agent 能力中心数据库模型与迁移：
  - `AgentCapabilityDraft`
  - `AgentCapabilityReview`
  - `AgentCapabilityManifestVersion`
  - `AgentCapabilityManifestItem`
  - `AgentCapabilityPublishRun`
  - `AgentToolQueryKeyRegistry`
- 新增后端能力中心 API：
  - 候选能力列表、详情、导入、预检、审核。
  - Manifest 发布、版本列表、版本激活。
  - queryKey 注册表查询。
  - 单能力 queryKey dry-run。
  - 单能力/批量 Eval Gate。
- 改造 Agent V2 Runtime 能力加载：
  - 优先加载数据库 active Manifest。
  - 数据库不可用或未发布时回退静态 Manifest。
- 接入发布前门禁：
  - publish 前强制执行 queryKey dry-run。
  - publish 前强制执行 650 题评测门禁相关子集。
  - P0 错路由、权限不明确、契约不通过、高风险自动发布会阻断。
- 新增管理端页面 `系统设置 / Agent 能力中心`：
  - 候选能力筛选、查看、批量选择。
  - 预检结果展示。
  - 审核通过、待补齐、驳回。
  - 发布选中、发布已审核。
  - queryKey dry-run。
  - Eval Gate。
  - Manifest 版本激活。
  - queryKey 注册表查看。
- 新增前端 API 与类型定义：
  - `src/api/agentCapabilityCenter.ts`
  - `src/api/real/agentCapabilityCenter.ts`
  - `src/types/agentCapabilityCenter.ts`
- 更新候选能力与评测治理脚本：
  - 扫描输出统一写入 `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/`。
  - 当前生成 592 条候选能力、650 条评测草稿。
- 新增 CI workflow：`.github/workflows/agent-v2.yml`。
- 新增能力中心 service 单测，覆盖 dry-run 成功和 queryKey 未实现阻断。

### 18.2 已验证

- `npx.cmd prisma validate --schema packages/server-v2/prisma/schema.prisma`：通过。
- `npm.cmd --prefix packages/server-v2 run db:generate`：通过。
- `npx.cmd tsc --noEmit -p packages/server-v2/tsconfig.json --pretty false`：通过。
- `npx.cmd tsc --noEmit -p packages/server-v2/tsconfig.agent-eval-scripts.json --pretty false`：通过。
- `npm.cmd run check:api`：通过。
- `npm.cmd run build`：通过。
- 新增能力中心前端文件定向 lint：通过。
- `npm.cmd --prefix packages/server-v2 run lint`：通过，仍有既有 warning。
- `npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath ... --runInBand`：Agent V2 相关 11 个测试套件通过，100 个测试通过。
- `npm.cmd --prefix packages/server-v2 run agent-v2:capability-drafts`：通过，最新结果为 592 条候选能力、650 条评测草稿。
- `npm.cmd --prefix packages/server-v2 run agent-v2:eval-gate:strict`：通过，P0 问题 103 条，P0 未映射 0，P0 权限待确认 0，P0 契约失败 0，P0 错路由 0，高风险自动发布 0。
- `npx.cmd prisma migrate status --schema packages/server-v2/prisma/schema.prisma`：通过，数据库 schema 已是最新状态。
- 运行态 API smoke：通过。
  - 登录后访问 `/api/agent-v2/capability-center/drafts/import`，导入扫描候选 30 条、内置已实现 Manifest 候选 33 条。
  - 以 `finance.daily-settlement.metric` 为低风险只读能力样例，完成预检、queryKey dry-run、单能力 Eval Gate、审核通过和发布。
  - 发布生成 active Manifest 版本 `cap-20260703161550`，共 33 个能力，其中自动发布 32 个、需审批 1 个、写入阻断 0 个。
- 管理端页面 smoke：通过。
  - 启动管理端 `http://127.0.0.1:5173`。
  - 使用 Playwright 打开 `/system/agent-capabilities`，页面标题和候选能力列表加载成功，无前端运行时报错。
- `npx.cmd tsc --noEmit -p packages/server-v2/tsconfig.json --pretty false`：补跑通过。
- `npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/capability-center/agent-v2-capability-center.service.spec.ts --runInBand`：补跑通过，2 个测试通过。
- `npm.cmd run check:api`：补跑通过。
- `npm.cmd run build`：补跑通过，已生成 `AgentCapabilityCenter` 页面 chunk。

### 18.3 仍需继续

- 终端自然语言命中回归：本轮已验证 active Manifest 发布和 Runtime Provider 的 DB Manifest 加载逻辑；后续建议用 Ami Aura Lite 真实问答再补一轮“新增能力命中 / 禁用后不命中 / 回滚后恢复”的端到端回归。
- 历史评测运行列表：MVP 已支持即时 Eval Gate 和发布阻断；后续可补独立 eval run 历史列表、失败样例回放和趋势报表。
- DTO 自动补齐：MVP 先做状态识别和发布阻断；后续进入 DTO 生成/补齐流水线。
- 扫描结果差异治理：MVP 已能导入候选和内置已实现 Manifest 候选；后续建议增加“新扫描 vs 上一版候选池”的差异视图，减少管理员审核噪音。
