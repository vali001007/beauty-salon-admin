# 洞悉美业·智能体开发任务清单 tasks

版本：v2.0
日期：2026-06-26
适用范围：洞悉美业·新一代门店运营智能体、Ami_Aura 智能终端升级、管理端 `/ami-agent` 工作台、`packages/server-v2/src/agent` 后端 Agent Runtime。

---

## 0. 当前总览

| 阶段 | 状态 | 产品/交付说明 |
| --- | --- | --- |
| 阶段 0：基线冻结与开发准备 | 已完成 | 当前主线改动已提交归档，后续开发基于 `codex/amiagent` 分支继续 |
| 阶段 1：AI 优先意图层 + 结构化输出 | 已完成 | Kiosk 文本/语音输入改为 AI 优先，已接入上下文和 `AuraResponseBlock` 输出 |
| 阶段 2：独立 Agent 工作台 + 店长/前台 Agent | 基础完成 | `/ami-agent` 入口、Persona、权限、迁移、店长/前台工具已完成 |
| 阶段 3：营销增长 Agent | 已完成 | 客群发现、机会卡、活动草稿确认流、权益匹配、话术生成、效果复盘、营销专属前端组件、活动草稿增强、eval 和端到端验收已完成；自动化触达留作阶段 7 |
| 阶段 4：美容师服务 Agent + 库存采购 Agent | 已完成 | 美容师服务 Agent 首批能力、库存采购 Agent 后端工具、前端专属卡片和真实登录态端到端验收已完成 |
| 阶段 5：财务风控 Agent | 已完成 | T5.1-T5.8 已完成收入汇总、利润诊断、毛利风险排行、退款折扣审计、绩效审计、报告草稿、字段权限脱敏和真实登录态 E2E |
| 阶段 6：记忆、归档、观测评估 | 已完成 | AgentMemory、AgentDailyArchive、反馈质量报表 API、Persona eval 扩展和 `/ami-agent` 右侧记忆/质量面板已完成；`20260626123000_agent_memory_archive` 已应用，真实登录态写入 E2E 已通过 |
| 阶段 7：自动化执行引擎 | 已完成 | Agent 自动化定义、运行、效果三模型、草稿、手动预演、定时扫描、事件/阈值评估、审批恢复、失败熔断、效果归因、10 个内置触发器和 `/ami-agent` 自动化中心入口已完成；`20260626160000_agent_automation_engine` 已应用，真实登录态写入 E2E 已通过 |

当前产品完成度判断：

- 基础底座完成度：约 93%。
- 可演示产品完成度：约 90%。
- 完整运营闭环完成度：约 68%。
- 当前可对外演示边界：管理端 `/ami-agent` 可展示六大 Persona、店长/前台基础问答、营销客群/机会/权益匹配/话术变体/活动草稿/审批确认/权益成本估算/客群明细/草稿编辑入口/效果漏斗复盘、美容师服务首批问答、库存采购专属卡片、财务收入/利润/退款折扣/报告草稿问答、阶段 6 记忆/归档/质量面板、阶段 7 自动化触发器/草稿/预演/审批/归因运行态闭环。
- 当前不可对外承诺边界：外部客户自动触达、活动正式发布、自动化对真实业务对象的生产写入、记忆自动注入对话和跨渠道完整效果归因闭环尚未完成。

### 0.0 本次更新结论

- [x] 已按当前代码和验证结果重新整理任务清单。
- [x] 已保留所有后续开发项的空勾选框，方便继续逐项打钩。
- [x] 已确认阶段 0-5 可按已完成/基础完成状态管理。
- [x] 已完成：阶段 6 数据库迁移和运行态写入 E2E，记忆创建、归档生成和质量报表链路已可验收。
- [x] 已完成：T6.4 Persona eval 扩展收敛，六大 Persona 每个至少 5 个核心问法，`agent-eval` 已通过。
- [x] 已完成：T3.4.1 活动草稿编辑体验增强，支持权益成本估算、客群明细展开和保存草稿后的编辑入口联动。
- [x] 已完成：阶段 7 代码级能力，T7.1-T7.12 已通过定向验证和构建验证。
- [x] 已完成：阶段 6/7 迁移前优雅降级，未应用新表迁移时 `/ami-agent` 右侧面板可空态加载，不再因缺表直接 500。
- [x] 已完成：阶段 6/7 迁移待处理状态前端可见化，右侧面板可区分“暂无数据”和“数据库表待迁移”。
- [x] 已完成：阶段 6/7 只读迁移就绪检查，新增 `/agent/schema-readiness` 和前端“迁移就绪”状态提示。
- [x] 已完成：阶段 6/7 迁移未就绪交互保护，未迁移时禁用“生成今日归档”和“自动化手动预演”。
- [x] 已完成：阶段 6/7 迁移就绪检查增强，校验所需数据表和 `_prisma_migrations` 迁移记录双条件。
- [x] 已完成：阶段 6/7 迁移缺口前端明细展示，`/ami-agent` 可直接看到待应用迁移和缺失数据表。
- [x] 已完成：阶段 6/7 只读迁移验收脚本，新增 `agent:schema-readiness` 和 `agent:schema-readiness:allow-pending`。
- [x] 已完成：阶段 6/7 运行态 readiness 脚本，新增 `agent:runtime-readiness` 和 `agent:runtime-readiness:allow-pending`。
- [x] 已完成：阶段 6/7 API E2E 验收脚本，新增 `agent:api-e2e` 和 `agent:api-e2e:allow-missing-auth`。
- [x] 已完成：阶段 6/7 迁移后验收清单脚本，新增 `agent:verification-plan`，可输出迁移授权后关闭 T6.7/T7.13 的命令顺序、必需环境变量和验收门槛。
- [x] 已完成：阶段 6/7 迁移文件静态审计脚本，新增 `agent:migration-audit`，可在写库前确认待应用 SQL 包含预期 Agent 表、主键、索引和唯一约束。
- [x] 已完成：阶段 6/7 一键只读预检脚本，新增 `agent:preflight`，串联迁移文件审计、schema readiness、runtime readiness、API E2E 跳过检查和验收清单。
- [x] 已完成：阶段 6/7 迁移后严格验收脚本，新增 `agent:post-migration-verify`，用于迁移应用后严格关闭 T6.7/T7.13。
- [x] 已完成：阶段 6/7 迁移后严格验收环境预检，`agent:post-migration-verify` 会在缺少 `AGENT_E2E_TOKEN` 或 `AGENT_E2E_STORE_ID` 时提前失败并输出缺项。
- [x] 已完成：阶段 6/7 API E2E 覆盖清单增强，`agent:api-e2e` 在缺登录参数跳过时也会输出读路径/写路径覆盖的接口和对应 T6.7/T7.13 任务。
- [x] 已完成：阶段 6/7 迁移后严格验收计划覆盖清单增强，`agent:post-migration-verify:plan` 会输出 API E2E 读路径/写路径覆盖范围和对应任务。
- [x] 已完成：阶段 6/7 API E2E 覆盖口径单一来源，新增 `agent-e2e-coverage.ts`，`agent:api-e2e` 和 `agent:post-migration-verify:plan` 共用同一份读/写接口清单。
- [x] 已完成：阶段 6/7 API E2E 覆盖清单审计脚本，新增 `agent:e2e-coverage:audit`，可检查关键接口、任务归属和重复 key。
- [x] 已完成：阶段 6/7 一键只读预检增强，`agent:preflight` 已纳入 `agent:e2e-coverage:audit`，迁移前可一键检查 API E2E 覆盖口径。
- [x] 已完成：阶段 6/7 一键只读预检严格验收计划增强，`agent:preflight` 已纳入 `agent:post-migration-verify:plan`，迁移前可同时查看严格验收步骤和登录态缺项。
- [x] 已完成：阶段 6/7 API E2E 登录态解析增强，`agent:api-e2e` 支持 `AGENT_E2E_TOKEN + AGENT_E2E_STORE_ID` 或 `AGENT_E2E_USERNAME + AGENT_E2E_PASSWORD` 自动登录两种验收方式。
- [x] 已完成：后端构建阻塞修复，会员卡充值流程返回真实 `balanceTransaction`，避免 `orders.service.ts` 构建失败。
- [x] 已完成：阶段 6/7 完成度审计脚本，新增 `agent:completion-audit`，可只读检查 T6.7/T7.13/P1-3/P1-4/P2-3/P2-4 是否具备打钩证据。
- [x] 已完成：阶段 6/7 一键只读预检完成度审计增强，`agent:preflight` 已纳入 `agent:completion-audit`，防止剩余任务被提前标记完成。
- [x] 已完成：阶段 6/7 完成度审计分组增强，`agent:completion-audit` 可分别判断阶段 6 记忆归档和阶段 7 自动化执行引擎的迁移就绪状态，支持后续分阶段打钩。
- [x] 已完成：阶段 6/7 任务关闭模板增强，`agent:completion-audit` 会输出每个关闭阶段的命令、证据、真实任务打钩行和验证记录模板。
- [x] 已完成：阶段 7 自动化运行态 E2E 覆盖增强，`agent:api-e2e -- --include-write --yes` 写路径将覆盖草稿、手动运行、待审批、审批通过/拒绝、恢复、归因、到期扫描和事件评估。
- [x] 已完成：阶段 7 自动化运行态 E2E 断言增强，写路径不只检查接口成功，还会断言草稿状态、待审批数量、审批通过/拒绝结果、归因状态和扫描/评估计数字段。
- [x] 已完成：阶段 6 记忆归档运行态 E2E 断言增强，写路径会创建并读回记忆、生成并读回每日归档，并校验质量报表 KPI 字段。
- [x] 已完成：阶段 6/7 两条数据库迁移已应用到目标库，Prisma Client 已重新生成，后端已重建并重启到新 `dist/main.js`。
- [x] 已完成：阶段 6/7 迁移后严格验收通过，`agent:post-migration-verify -- --include-write --yes` 已覆盖 schema、runtime、API 读路径和真实写路径。

### 0.0.1 当前完成/未完成状态

| 分类 | 当前状态 | 说明 |
| --- | --- | --- |
| 已完成 | 阶段 0-7、T6.1-T6.7、T7.1-T7.13、P1-3、P1-4、P2-3、P2-4 | 已完成代码、接口、前端入口、数据库迁移、运行态 readiness 和真实登录态写入 E2E，可作为当前演示能力边界。 |
| 仍需后续增强 | 记忆自动注入、外部客户触达、活动正式发布、生产业务对象写入 | 当前自动化仍以安全预演、审批和归因记录为主，不直接触达客户或修改核心业务对象。 |
| 未完成 | 暂无本清单内阻塞项 | 后续新增需求继续追加空勾选框。 |
| 后续预留 | 暂无 | 本轮 P1/P2 收口项已完成。 |

### 0.1 打钩口径

- `[x]` 表示代码、接口或文档已落地，并至少完成一次对应范围验证。
- `[ ]` 表示后续开发预留任务，不应在产品演示或销售材料中承诺已完成。
- “基础完成”表示主链路可用，但仍可能缺少图表、编辑、评估、E2E 或真实业务闭环。
- “部分完成”表示核心后端能力已落地，但前端体验或验收链路仍未闭环。

### 0.2 最新完成快照

- [x] 店长/前台/营销高频自然语言命中能力已补强。
- [x] 营销机会可渲染为专属 `opportunity_card`。
- [x] 营销活动草稿进入人工确认流，支持 `approve:<id>` / `reject:<id>`。
- [x] 审批通过后仅创建 `draft` 状态营销活动，不自动发布、不自动触达客户。
- [x] 营销效果漏斗图已支持专属展示。
- [x] 营销话术变体已支持复制和继续优化。
- [x] 活动草稿已支持编辑客群、权益、发送时间、话术，并随审批参数真实写入 draft 活动。
- [x] 活动草稿已增强：生成前展示权益成本估算和客群明细，保存后提供“查看活动草稿/继续完善活动”入口，并可定位到活动管理页。
- [x] 营销 Agent eval 和端到端验收用例已补。
- [x] 阶段 3 真实端到端验收已执行。
- [x] 美容师服务 Agent 首批工具已完成：今日服务客户、客户护理摘要、业绩进度、复购续卡机会。
- [x] 美容师本人范围和自然语言命中已进入单测与 Agent eval。
- [x] 库存采购 Agent 首批后端工具已完成：消耗趋势、项目 BOM 风险、补货采购草稿、临期处理草稿、供应商采购链接。
- [x] 库存采购 Agent 自然语言命中和 eval 已补。
- [x] 美容师权限隔离测试已补：本人范围、他人美容师 ID 覆盖拦截、未绑定账号不回退全店数据。
- [x] 美容师护理建议安全规则已补：统一响应安全层会过滤医疗化和夸大疗效表述。
- [x] 库存采购 Agent 前端卡片已补：库存项卡、临期处理卡、供应商采购卡可由 `AuraResponseBlock` 渲染。
- [x] 财务风控 Agent 首批工具已完成：收入汇总、利润诊断、毛利风险排行，均接入 Planner、工具注册、Agent eval 和 Orchestrator 槽位校验。
- [x] 财务风控 Agent 审计与报告工具已完成：退款折扣审计、美容师绩效审计、财务报告草稿；报告草稿可渲染为 `document_preview`。
- [x] 财务字段权限和脱敏专项已补：财务报告草稿正文、summary、结构化字段均纳入字段范围治理，缺少订单权限时不能执行财务报告草稿。
- [x] 阶段 4 真实运行态端到端复验已完成：库存问答负库存可用天数不再显示负数，多轮追问无 500；美容师服务 Agent 页面问答无 500。
- [x] 阶段 6 代码级底座已启动：新增 AgentMemory、AgentDailyArchive 模型和迁移 SQL，新增记忆/归档/质量报表 API，`/ami-agent` 右侧面板可展示门店记忆、每日归档和 7 日质量 KPI。
- [x] 阶段 7 代码级能力已完成：新增 AgentAutomationDefinition、AgentAutomationRun、AgentAutomationEffect 模型和迁移 SQL；后端支持 10 个内置触发器、自动化草稿、手动预演、定时扫描、事件/阈值评估、审批恢复、失败熔断、效果归因；`/ami-agent` 右侧面板新增自动化中心入口。
- [x] 阶段 6/7 迁移前保护已完成：记忆、归档和自动化列表接口在新表未应用时返回空态和迁移待处理标记；生成归档可返回未持久化预览；自动化写入类接口返回明确迁移待处理错误。
- [x] 阶段 6/7 迁移待处理状态已前端可见：`/ami-agent` 会在右侧面板展示记忆表、归档表、自动化表待迁移提示，避免把迁移前空态误判为无数据。
- [x] 阶段 6/7 迁移就绪状态已可验证：新增只读 API 检查 `agent_memories`、`agent_daily_archives`、`agent_automation_definitions`、`agent_automation_runs`、`agent_automation_effects` 是否存在，并在 `/ami-agent` 显示记忆归档/自动化两组就绪状态。
- [x] 阶段 6/7 迁移前交互保护已完成：当 schema-readiness 明确返回未就绪时，`/ami-agent` 会禁用“生成今日归档”和“自动化手动预演”，避免用户触发不可持久化或必然失败的动作。
- [x] 阶段 6/7 迁移就绪检查增强完成：`/agent/schema-readiness` 同时检查目标表存在和 `_prisma_migrations.finished_at` 迁移记录，避免只靠表存在误判可验收。
- [x] 阶段 6/7 迁移缺口明细已前端可见：`/ami-agent` 迁移就绪卡可展示待应用 migration 名称和缺失表名，便于迁移授权后快速对照。
- [x] 阶段 6/7 迁移验收脚本已补：`packages/server-v2` 可通过 `npm.cmd run agent:schema-readiness` 做严格只读验收，也可通过 `npm.cmd run agent:schema-readiness:allow-pending` 在未迁移状态下打印缺口。
- [x] 阶段 6/7 运行态 readiness 脚本已补：`packages/server-v2` 可通过 `npm.cmd run agent:runtime-readiness` 在迁移后只读探测 5 张 Agent 新表是否可查询，作为真实登录态 E2E 前的 smoke gate。
- [x] 阶段 6/7 API E2E 验收脚本已补：`packages/server-v2` 可通过 `npm.cmd run agent:api-e2e` 在提供登录 token 和门店 ID 后跑 Agent API 读路径；传 `--include-write --yes` 后可跑记忆、归档、自动化草稿写路径。
- [x] 阶段 6/7 迁移后验收清单脚本已补：`packages/server-v2` 可通过 `npm.cmd run agent:verification-plan` 查看迁移授权后命令顺序、缺失登录参数和 T6.7/T7.13 打钩门槛。
- [x] 阶段 6/7 迁移文件静态审计脚本已补：`packages/server-v2` 可通过 `npm.cmd run agent:migration-audit` 在不连接数据库的情况下检查两个待应用 migration SQL 是否包含预期表、主键、索引和唯一约束。
- [x] 阶段 6/7 一键只读预检脚本已补：`packages/server-v2` 可通过 `npm.cmd run agent:preflight` 串行执行迁移文件审计、schema readiness、runtime readiness、API E2E 跳过检查和验收清单输出。
- [x] 阶段 6/7 迁移后严格验收脚本已补：`packages/server-v2` 可通过 `npm.cmd run agent:post-migration-verify` 在迁移后串行执行严格 schema readiness、runtime readiness 和登录态 API E2E；如需验证写路径，必须显式追加 `-- --include-write --yes`。
- [x] 阶段 6/7 迁移后严格验收环境预检已补：`agent:post-migration-verify:plan` 可显示 `AGENT_E2E_TOKEN`、`AGENT_E2E_STORE_ID` 是否已配置；严格模式缺参时会提前失败，避免在迁移后验收中途才发现登录态上下文缺失。
- [x] 阶段 6/7 API E2E 覆盖清单已增强：`agent:api-e2e` 会输出读路径 8 个接口和写路径 3 个接口的覆盖范围，并标注对应 T6.7/T7.13，方便迁移后验收逐项对照。
- [x] 阶段 6/7 迁移后严格验收计划覆盖清单已增强：`agent:post-migration-verify:plan` 会同步展示读路径 8 个接口、写路径 3 个接口和写路径开启参数，迁移前即可确认验收覆盖范围。
- [x] 阶段 6/7 API E2E 覆盖口径单一来源已完成：`agent:api-e2e` 与 `agent:post-migration-verify:plan` 均引用 `agent-e2e-coverage.ts`，避免后续接口覆盖口径漂移。
- [x] 阶段 6/7 API E2E 覆盖清单审计已完成：`agent:e2e-coverage:audit` 可校验读路径 8 个接口、写路径 3 个接口、T6.7/T7.13 任务覆盖和重复 key，防止后续验收脚本漏覆盖。
- [x] 阶段 6/7 一键只读预检增强已完成：`agent:preflight` 已串联 `agent:e2e-coverage:audit`，迁移前一个命令可同时看到 API 覆盖口径是否完整。
- [x] 阶段 6/7 一键只读预检严格验收计划增强已完成：`agent:preflight` 已串联 `agent:post-migration-verify:plan`，迁移前一个命令可同时看到严格验收步骤、登录态环境变量状态和 API 覆盖范围。
- [x] 阶段 6/7 API E2E 登录态解析增强已完成：`agent:api-e2e` 可继续使用 `AGENT_E2E_TOKEN + AGENT_E2E_STORE_ID`，也可在未传 token 时使用 `AGENT_E2E_USERNAME + AGENT_E2E_PASSWORD` 自动调用 `/auth/login` 获取 token，并从登录用户门店列表推导 `storeId`。
- [x] 后端构建阻塞已修复：会员卡充值流程创建余额交易记录时保留 `balanceTransaction` 返回值，`balanceTransactionId` 可继续用于返回结果和后续验收。
- [x] 阶段 6/7 完成度审计已完成：`agent:completion-audit` 会读取任务清单和 schema readiness，确认剩余 T6.7/T7.13/P1-3/P1-4/P2-3/P2-4 是否仍处于正确未完成状态，并输出对应关闭门槛。
- [x] 阶段 6/7 一键只读预检完成度审计增强已完成：`agent:preflight` 已串联 `agent:completion-audit`，迁移前即可发现任务清单被错误提前打钩的问题。
- [x] 阶段 6/7 完成度审计分组增强已完成：`agent:completion-audit` 会按 `memory_archive` 和 `automation_engine` 分别输出 `groupReady`、`readyToClose`、`blockedByMigration` 和 `pendingRuntimeE2e`，便于后续单独关闭 P1-3 或 P2-3。
- [x] 阶段 6/7 任务关闭模板已完成：`agent:completion-audit` 的 `closurePlan` 会输出每个关闭阶段的 `commands`、`requiredEvidence`、`markdownPatchTemplate` 和 `validationLogTemplate`，迁移后可按模板更新任务清单。
- [x] 阶段 7 自动化运行态 E2E 覆盖增强已完成：`agent:e2e-coverage:audit` 目前确认读路径 8 个、写路径 11 个，其中 T7.13 覆盖 13 个读写检查点，覆盖自动化中心主要运行态接口。
- [x] 阶段 7 自动化运行态 E2E 断言增强已完成：`agent:api-e2e` 会校验自动化草稿必须为 `draft`、手动运行必须进入 `waiting_approval`、待审批列表必须出现记录、审批通过后为 `completed`、拒绝后为 `cancelled`、归因记录为 `attributed`，并校验到期扫描和事件评估返回数值字段。
- [x] 阶段 6 记忆归档运行态 E2E 断言增强已完成：`agent:api-e2e` 会校验记忆状态、记忆类型、Persona，创建后从记忆列表读回；每日归档生成后必须为 `generated` 并能从归档列表读回；质量报表必须返回 `runCount` 和 `successRate` 数值字段。

### 0.3 后续开发跟踪总表

| 优先级 | 任务 | 当前状态 | 打钩条件 |
| --- | --- | --- | --- |
| 已完成 | T4.14 阶段 4 端到端验收 | 已完成 | 已在 `/ami-agent` 完成美容师服务 Agent、库存采购 Agent 真实登录态问答，多轮追问无 500，负库存显示不再为负天数 |
| 已完成 | T5.1-T5.3 财务风控 Agent 首批工具 | 已完成 | 已完成收入汇总、利润诊断、毛利风险排行工具、Planner 命中、单测、eval 和结构化输出 |
| 已完成 | T5.4-T5.6 财务审计和报告草稿 | 已完成 | 已完成退款折扣审计、员工绩效审计、报告草稿、Planner 命中、单测、eval 和文档预览输出 |
| 已完成 | T5.7 财务字段权限和脱敏测试 | 已完成 | 已完成财务报告草稿正文脱敏、summary 脱敏、结构化字段脱敏和账号权限边界 eval |
| 已完成 | T5.8 阶段 5 端到端验收 | 已完成 | 已完成 `/ami-agent` 财务风控 Agent 真实登录态端到端验收，报告草稿可渲染为文档预览并带证据来源 |
| 已完成 | T3.4.1 活动草稿编辑体验增强 | 已完成 | 已补齐权益成本估算、客群明细展开、保存草稿后的查看/继续完善入口，并通过 `agent-orchestrator`、TypeScript 和前端 build 验证 |
| P1 | T6.1-T6.7 记忆、归档、观测评估 | 已完成 | T6.1-T6.7 已完成，数据库迁移已应用，记忆创建、每日归档和质量报表真实写入 E2E 已通过 |
| P1 | T7.1-T7.13 自动化执行引擎 | 已完成 | T7.1-T7.13 已完成，数据库迁移已应用，自动化草稿、运行、审批、恢复、归因、扫描和事件评估真实写入 E2E 已通过 |

---

## 1. 阶段 0：基线冻结与开发准备

- [x] T0.1 提交当前工作区积压改动
  - 已提交经营利润模块、权限优化、工作台多角色配置等改动。
- [x] T0.2 盘点现有 Agent 工具目录
  - 已确认后端 `AgentToolRegistryService` 已有工具和新增工具注册情况。
- [x] T0.3 输出六大 Agent 权限矩阵
  - 已在 Persona 配置和权限入口中落地基础角色边界。
- [x] T0.4 输出数据模型改动清单
  - 已新增 `AgentPersona`、`AgentRenderedBlock`、`AgentFeedback`，并扩展 `AgentRun.personaCode`。

---

## 2. 阶段 1：AI 优先意图层 + 结构化输出

- [x] T1.1 重写 `intentRouter.ts`，实现 AI 优先
  - 文本/语音输入走 `parseAiIntentFallback`，快捷操作和系统命令保留规则路径。
- [x] T1.2 新增 `conversationContext.ts`
  - 支持最近 6 轮上下文、活跃实体、代词解析。
- [x] T1.3 改造 `AppContent.tsx` 集成对话上下文
  - 命令执行时传入上下文，角色/门店切换时重置上下文。
- [x] T1.4 定义 `AuraResponseBlock` 类型
  - 前后端已同步支持 text、kpi_card、table、chart、customer_card、confirm_action、alert、follow_up_chips、document_preview、evidence_panel。
- [x] T1.5 新增 `BlockRenderer.tsx`
  - Kiosk 侧结构化 Block 渲染器已完成。
- [x] T1.6 新增 `FollowUpChips.tsx`
  - 支持最多 3 个关联问题。
- [x] T1.7 新增 `KpiCard.tsx`
  - 支持 KPI 大数字和趋势提示。
- [x] T1.8 角色登录自动首屏推送
  - 已在 Kiosk 角色首页加载链路中接入。
- [x] T1.9 后端 `AgentRunResult` 增加 `renderedBlocks`
  - `AgentOrchestratorService` 已自动构建 blocks 和 follow-up suggestions。
- [x] T1.10 阶段 1 验证与测试
  - 前端 169/169、后端 492/492、前后端 typecheck/build 已通过。

---

## 3. 阶段 2：独立 Agent 工作台 + 店长/前台 Agent

- [x] T2.1 新增 `AgentPersona` Prisma 模型
  - 已完成。
- [x] T2.2 新增 `AgentRenderedBlock` Prisma 模型
  - 已完成。
- [x] T2.3 新增 `AgentFeedback` Prisma 模型
  - 已完成。
- [x] T2.4 新增 `AgentRun.personaCode`
  - 已完成。
- [x] T2.5 新增并应用 Prisma migration
  - 已创建 `20260625000000_add_agent_persona_rendered_block_feedback`。
  - 数据库已同步，`prisma migrate status` 显示 up to date。
- [x] T2.6 新增 `AgentPersonaService`
  - 六大 Persona 内置配置已完成。
- [x] T2.7 新增 Persona API
  - `GET /agent/personas`
  - `GET /agent/personas/:code`
- [x] T2.8 新增 Feedback API
  - `POST /agent/runs/:id/feedback`
- [x] T2.9 新增管理端 `/ami-agent` 路由
  - 已注册到 `src/app/routes.tsx`。
- [x] T2.10 新增管理端 AI 智能体菜单入口
  - `Layout.tsx` 已加入“AI 智能体”。
- [x] T2.11 新增 `core:agent:view` 权限
  - 已加入权限目录和店长角色默认权限。
- [x] T2.12 新增 `AmiAgentWorkspace`
  - 三栏布局已完成：Persona 列表、对话区、任务画布。
- [x] T2.13 新增管理端 `AgentBlockRenderer`
  - 支持 KPI、表格、图表、确认动作、证据面板等基础渲染。
- [x] T2.14 实现 `manager.daily.briefing`
  - 已完成今日经营简报。
- [x] T2.15 实现 `reception.customer.lookup`
  - 已支持姓名/手机号查询与脱敏。
- [x] T2.16 实现 `reception.reservation.today`
  - 已支持今日预约列表。
- [x] T2.17 实现 `reception.card.benefit.summary`
  - 已支持客户卡项权益摘要。
- [x] T2.18 阶段 2 验证
  - 后端测试、前端构建已通过。

---

## 4. 阶段 3：营销增长 Agent

### 4.1 已完成

- [x] T3.1 实现 `marketing.customer.segment.discover`
  - 已支持沉睡客户、高价值客户、新客未转化等客群发现。
- [x] T3.2 强化 `marketing.opportunity.discover`
  - 已支持营销 Agent 机会卡，包含机会类型、匹配分、推荐活动、库存/销量/客户/临期/毛利信号、风险提醒和后续动作。
- [x] T3.3 实现 `promotion.offer.match`
  - 已支持读取可用权益并给出活动动作建议。
- [x] T3.4 强化 `marketing.activity.draft`
  - 已支持活动草稿预览卡、目标客群、推荐权益、话术预览、推荐商品、确认/拒绝动作；审批通过后仍只创建 draft 状态活动，不自动发布。
- [x] T3.5 实现 `marketing.copy.generate`
  - 已支持生成 3 条营销话术变体。
- [x] T3.6 实现 `marketing.effect.diagnose`
  - 已支持触达、转化、收入效果复盘。

### 4.2 已完成

- [x] T3.4.1 继续细化活动草稿编辑体验
  - 已完成基础草稿预览、确认/拒绝动作、发送时间编辑、话术编辑，并可随审批参数写入 draft 活动。
  - 已补齐权益成本估算、客群明细展开和保存草稿后的编辑入口联动。
  - 保存成功后，Agent 会返回活动草稿卡，并提供“查看活动草稿”和“继续完善活动”动作；继续完善可跳转活动管理页并定位对应活动。

### 4.3 已完成

- [x] T3.7 新增 `AgentFunnelChart`
  - 用于营销效果漏斗：触达 -> 打开/响应 -> 预约 -> 核销 -> 收入。
- [x] T3.8 新增 `AgentCopyVariants`
  - 用于话术变体并排展示、选择、继续优化。
- [x] T3.9 营销活动草稿前端编辑组件
  - 支持修改客群、权益、发送时间、话术。
- [x] T3.10 活动草稿确认后创建正式活动/任务
  - 已打通管理端确认审批 -> 执行 `marketing.activity.draft` -> 创建 `draft` 状态营销活动；不会自动发布或触达客户。
- [x] T3.11 Planner/Capability 映射补强
  - 已补强自然语言稳定命中新工具，覆盖店长、前台和营销高频问法。
- [x] T3.12 营销 Agent Eval 用例
  - 至少覆盖：沉睡召回、权益匹配、话术生成、活动草稿、效果复盘。
- [x] T3.13 阶段 3 端到端验收
  - 验收链路：客群发现 -> 权益匹配 -> 话术生成 -> 活动草稿 -> 人工确认。
  - 当前状态：已在本地浏览器 `/ami-agent` 完成 E2E-3.1 至 E2E-3.6 验收。

---

## 5. 阶段 4：美容师服务 Agent + 库存采购 Agent

### 5.1 美容师服务 Agent

- [x] T4.1 实现 `beautician.today.service.list`
  - 已支持美容师/店长查询今日服务任务与未取消预约，返回客户、项目、时间、状态和服务准备建议。
- [x] T4.2 实现 `beautician.customer.care.brief`
  - 已支持基于下一条待服务任务生成客户护理准备摘要，包含客户标签、肤况档案、卡项、近90天核销、项目 BOM 和服务步骤提醒。
- [x] T4.3 实现 `service.record.draft` 强化版
  - 已支持根据今日待服务任务和项目 BOM 生成服务记录草稿建议，不提交正式服务记录。
- [x] T4.4 实现 `beautician.performance.progress`
  - 已支持美容师本人本月业绩、服务、提成和目标差额进度；底层复用员工表现评分口径。
- [x] T4.5 实现 `beautician.repurchase.opportunity`
  - 已支持基于近期服务客户、次卡核销、卡项剩余次数和到期窗口，推荐复购/续卡/回访机会；不自动创建任务、不触达客户。
- [x] T4.6 美容师权限隔离测试
  - 美容师只能看本人客户、预约、业绩。
  - 当前状态：已完成后端单测覆盖本人服务客户、本人业绩范围、传入他人美容师 ID 不越权、未绑定美容师档案不回退查询全店数据；真实登录态角色 E2E 并入 T4.14。
- [x] T4.7 禁止医疗化/夸大疗效建议的安全规则
  - 当前状态：客户护理摘要已明确“不构成医疗诊断”，统一响应安全层已过滤“治疗/治愈/根治/保证见效/诊断为”等医疗化或夸大疗效表述，并补专项测试。

### 5.2 库存采购 Agent

- [x] T4.8 实现 `inventory.consumption.trend`
  - 已支持按 `StockMovement` 负数库存流水聚合商品消耗数量、消耗成本、日均消耗、预计可用天数和风险等级；只读分析，不改库存。
- [x] T4.9 实现 `inventory.project.bom.risk`
  - 已支持结合项目服务量、项目 BOM 标准用量、商品当前库存和安全库存，推算项目耗材 14 天保障缺口。
- [x] T4.10 强化 `inventory.replenishment.draft`
  - 已验证可根据低库存/安全库存生成补货采购草稿，需人工确认；不会自动创建正式采购或改库存。
- [x] T4.11 实现 `inventory.expiring.clearance.draft`
  - 已支持基于临期批次、零售价、成本价生成临期处理草稿建议；不自动调价、不发布活动、不触达客户。
- [x] T4.12 实现 `supplier.purchase.link`
  - 已支持按商品供应商映射返回供应商、供货价、起订量、交期和采购建议；不自动创建采购单。
- [x] T4.13 库存 Agent 前端卡片
  - 已新增 `inventory_item_card` 与 `supplier_purchase_card` 结构化输出和管理端渲染；库存风险、消耗趋势、项目 BOM 风险、临期处理、补货采购和供应商采购链接均可输出专属卡片或通用表格。
- [x] T4.14 阶段 4 端到端验收
  - 当前状态：Planner -> Tool -> Orchestrator -> AuraResponseBlock -> 管理端页面真实登录态链路已验证。
  - 最新验收：已用系统管理员登录态在 `/ami-agent` 切换“库存采购 Agent”并发起“近30天耗材消耗趋势”真实问答，页面能返回库存消耗卡、明细表、证据来源和动作按钮；负库存商品显示“预计可用 0 天”，不再出现负可用天数。
  - 多轮复验：库存追问“这些风险里先看最紧急的3个”不再出现 500；美容师服务 Agent 问答可返回今日服务/预约客户和准备动作，无 Internal server error。

---

## 6. 阶段 5：财务风控 Agent

- [x] T5.1 实现 `finance.revenue.summary`
  - 已支持店长查询收入汇总、订单数、客单价和上一周期变化；输出财务收入汇总标题、KPI 卡和证据来源。
- [x] T5.2 实现 `finance.profit.diagnose`
  - 可复用经营利润模块能力。
  - 已复用财务毛利诊断口径，覆盖净收入、耗材成本、提成成本、毛利和毛利率，并输出利润诊断 KPI。
- [x] T5.3 实现 `finance.margin.risk.rank`
  - 可复用项目/商品毛利分析。
  - 已基于低毛利项目/商品生成风险排行，包含风险等级、毛利率、成本、收入和可执行建议。
- [x] T5.4 实现 `finance.refund.discount.audit`
  - 已支持退款金额、退款占订单比例、手工优惠、高折扣订单审计，输出风险线索、KPI、证据来源和只读建议。
- [x] T5.5 实现 `finance.beautician.performance.audit`
  - 可复用员工人效模块。
  - 已复用员工表现排行口径，识别提成占比偏高、服务记录完整率低、预约完成率低等绩效财务风险。
- [x] T5.6 实现 `finance.report.draft`
  - 日报、周报、月报草稿。
  - 已支持组合收入、利润毛利、退款折扣、绩效审计生成财务报告草稿，并通过 `document_preview` 在工作台预览。
- [x] T5.7 财务字段权限和脱敏测试
  - 已补财务报告草稿权限与脱敏 eval：缺少 `core:order:view` 不能执行，字段范围开启时识别成本、毛利、净收入、提成等敏感字段。
  - 已补 Orchestrator 测试：`document_preview` 正文中的毛利、净收入、提成文本会按字段权限脱敏或隐藏。
- [x] T5.8 阶段 5 端到端验收
  - 当前状态：已用系统管理员登录态在 `/ami-agent` 切换“财务风控 Agent”，真实发送“帮我生成本月财务报告草稿”，页面返回财务报告草稿、文档预览、KPI 和证据来源，无 Internal server error。
  - API 复验：真实登录 + CSRF + `X-Store-Id=6` 下，收入汇总、退款折扣审计、财务报告草稿均返回 completed，并可输出 KPI/table/document_preview/evidence_panel。

---

## 7. 阶段 6：记忆、归档、观测评估

- [x] T6.1 实现 `AgentMemory` 模型和服务
  - 已新增 `AgentMemory` Prisma 模型、SQL migration 和 `AgentMemoryService`，支持门店级 Persona 记忆列表与手工创建；暂未自动注入 Planner/回复上下文。
- [x] T6.2 实现 `AgentDailyArchive` 模型和服务
  - 已新增 `AgentDailyArchive` Prisma 模型、SQL migration 和每日归档生成能力，按门店/Persona 聚合 Agent Run、反馈和工具调用。
- [x] T6.3 强化 `AgentFeedback` 使用
  - 已保留既有反馈 API，并新增质量报表聚合：反馈量、采纳率、负反馈、成功率、工具耗时和改进建议。
- [x] T6.4 扩展 Agent Eval
  - 目标：每个 Persona 至少 5 个核心问题。
  - 当前状态：已完成 Persona 核心问题矩阵扩展，覆盖店长经营、营销增长、前台接待、美容师服务、库存采购、财务风控。
  - 验收结果：`agent-eval` 定向单测 5/5 通过，默认矩阵全绿；新增店长/前台工具运行态安全 fixture，确保结构化回答不泄漏内部字段。
- [x] T6.5 新增 Agent 记忆面板
  - 已在 `/ami-agent` 右侧加入“运营记忆”面板，展示当前 Persona 门店记忆、最近归档，并支持生成今日归档。
- [x] T6.6 新增 Agent 运行质量报表
  - 已在 `/ami-agent` 右侧面板展示 7 日运行数、成功率、反馈量、采纳率和质量建议。
- [x] T6.7 阶段 6 验收
  - 已应用数据库 migration，并在真实登录态 API E2E 验证记忆列表、创建记忆、生成今日归档、归档读回、质量报表 KPI 字段。
  - 验收证据：`npm.cmd run agent:post-migration-verify -- --include-write --yes` 通过，`create-memory id=1`，`generate-archive id=1/status=generated`。

---

## 8. 阶段 7：全新自动化执行引擎

- [x] T7.1 新增 `AgentAutomationDefinition`
  - 已新增 Agent 自动化定义模型、索引和迁移 SQL；用于沉淀跨 Persona 的自动化草稿、触发条件、动作计划和审批策略。
- [x] T7.2 新增 `AgentAutomationRun`
  - 已新增 Agent 自动化运行模型、索引和迁移 SQL；用于记录手动/后续定时/事件触发的运行日志。
- [x] T7.3 新增 `AgentAutomationEffect`
  - 已新增 Agent 自动化效果模型、索引和迁移 SQL；当前可记录手动预演和待审批效果，后续承接归因指标。
- [x] T7.4 实现自动化草稿生成 API
  - 已新增 `POST /agent/automations/drafts`，支持按目标、Persona、触发器、动作计划生成 `draft` 状态 Agent 自动化。
- [x] T7.5 实现手动触发执行
  - 已新增 `POST /agent/automations/:id/run`，支持手动预演并写入运行日志；中高风险动作进入 `waiting_approval`，不直接外部触达客户。
- [x] T7.6 实现定时触发
  - 已新增 `POST /agent/automations/due/run`，可扫描 `enabled` 状态且到期的 Agent 自动化，并以安全预演方式写入运行日志。
- [x] T7.7 实现事件/阈值触发
  - 已新增 `POST /agent/automations/events/evaluate`，支持按事件类型、指标阈值和触发配置匹配自动化定义，并生成安全运行记录。
- [x] T7.8 实现审批中断
  - 已新增 `GET /agent/automations/pending-approvals`、`POST /agent/automations/runs/:id/approve`、`POST /agent/automations/runs/:id/reject`；中高风险运行可停在 `waiting_approval`，确认后记录审批效果，拒绝后不继续执行。
- [x] T7.9 实现失败恢复和暂停熔断
  - 已新增 `POST /agent/automations/:id/recover`；连续失败达到阈值会暂停自动化并记录 `fuse_paused` 效果，未达到阈值时创建安全恢复预演。
- [x] T7.10 实现效果归因
  - 已新增 `POST /agent/automations/effects/attribute`，可记录自动化归因效果，不直接修改订单、客户、财务或营销活动业务数据。
- [x] T7.11 新增前端自动化中心
  - 已在 `/ami-agent` 右侧面板新增“自动化中心”，展示内置触发器数量、当前 Persona 自动化草稿、最近运行，并支持手动预演按钮。
- [x] T7.12 实现 10 个内置触发器
  - [x] 沉睡客户
  - [x] 高价值客户到店
  - [x] 疗程消耗
  - [x] 库存缺货
  - [x] 临期库存
  - [x] 活动低转化
  - [x] 员工异常
  - [x] 预约异常
  - [x] 财务异常
  - [x] 投诉差评
- [x] T7.13 阶段 7 验收
  - 已应用 `20260626160000_agent_automation_engine` 数据库迁移，并在真实登录态 API E2E 验证触发器加载、草稿创建、手动预演、定时扫描、事件评估、审批确认/拒绝、失败恢复、效果归因、运行日志和效果记录。
  - 验收证据：`npm.cmd run agent:post-migration-verify -- --include-write --yes` 通过，自动化草稿 `id=1/status=draft`，审批通过 `approved=true`，审批拒绝 `approved=false`，恢复 `retry_scheduled`，归因记录 `id=6`。

---

## 9. 当前最高优先级待办

下一轮建议优先做以下事项，已完成项保留打钩，未完成项继续作为后续开发入口：

- [x] P0-1 复验并关闭 T4.14 阶段 4 运行态问题
  - 已在真实登录态 `/ami-agent` 复验库存问答、多轮追问、美容师服务 Agent；负库存可用天数不再为负数，多轮追问无 500。
- [x] P0-2 开发 T5.1 `finance.revenue.summary`
  - 交付目标：店长可用自然语言查询今日/本周/本月收入汇总、实收、退款、客单价、订单数和同比/环比变化。
- [x] P0-3 开发 T5.2 `finance.profit.diagnose`
  - 交付目标：复用经营利润模块，解释利润/毛利/成本/提成变化原因，输出关键驱动因素和可操作建议。
- [x] P0-4 开发 T5.3 `finance.margin.risk.rank`
  - 交付目标：输出项目/商品/客户维度的低毛利或亏损风险排行，给店长提供调价、停促、替换耗材等建议。
- [x] P0-5 开发 T5.4-T5.6 财务审计和报告草稿
  - 交付目标：覆盖退款折扣异常、员工绩效异常、日报/周报/月报草稿。
- [x] P0-6 完成 T5.8 财务风控 Agent 端到端验收
  - 已完成 `/ami-agent` 财务风控 Agent 真实登录态 E2E；报告草稿可在页面文档预览中展示，后端 eval 和 Orchestrator 测试已覆盖财务字段权限与脱敏。
- [x] P1-1 启动阶段 6 记忆、归档和质量评估
  - 已完成模型、服务、API 和前端面板的代码级底座；真实运行态验收继续保留在 T6.7。
- [x] P1-2 收敛 T6.4 Persona eval 扩展
  - 交付目标：六大 Persona 每个至少 5 个核心问法，`agent-eval` 默认矩阵全绿。
  - 当前状态：已补齐店长/前台工具 eval 注册表和运行态 fixture，已收敛不稳定样例；`agent-eval` 5/5 通过。
- [x] P1-3 应用阶段 6 记忆归档数据库迁移
  - 交付目标：目标库具备 `agent_memories`、`agent_daily_archives` 两张表。
  - 当前状态：已在用户明确授权后通过 `npm.cmd run db:migrate:prod` 应用，`agent:schema-readiness` 和 `agent:runtime-readiness` 均显示 ready。
- [x] P1-4 完成阶段 6 运行态 E2E
  - 交付目标：真实登录态 `/ami-agent` 可加载质量报表、查看记忆、生成今日归档、刷新后数据仍可见。
  - 当前状态：已通过真实登录态 API E2E 写入验收，覆盖记忆创建、列表读回、今日归档生成和质量 KPI。
- [x] P2-1 继续 T3.4.1 活动草稿编辑增强
  - 交付目标：补齐权益成本估算、客群明细展开、保存草稿后的编辑入口联动。
  - 当前状态：已完成，并通过后端定向单测、根项目 TypeScript 和前端生产构建验证。
- [x] P2-2 启动阶段 7 自动化执行引擎
  - 交付目标：先完成自动化定义模型、人工确认中断和运行日志，再扩展定时/事件触发。
  - 当前状态：T7.1-T7.12 已代码级完成；模型、迁移 SQL、草稿 API、手动预演 API、定时/事件触发 API、审批确认/拒绝 API、失败熔断、效果归因、10 个内置触发器和前端自动化中心已完成。
- [x] P2-3 应用阶段 7 自动化执行引擎数据库迁移
  - 交付目标：目标库具备 `agent_automation_definitions`、`agent_automation_runs`、`agent_automation_effects` 三张表。
  - 当前状态：已在用户明确授权后通过 `npm.cmd run db:migrate:prod` 应用，`agent:schema-readiness` 和 `agent:runtime-readiness` 均显示 ready。
- [x] P2-4 完成阶段 7 运行态 E2E
  - 交付目标：真实登录态 `/ami-agent` 可加载触发器、创建自动化草稿、执行手动预演、查看运行日志、处理审批、记录效果归因，并刷新后数据仍可见。
  - 当前状态：已通过真实登录态 API E2E 写入验收，覆盖触发器、草稿、手动运行、待审批、审批通过/拒绝、恢复、归因、到期扫描和事件评估。

### 9.0 已关闭的历史 P0

- [x] 历史 P0-1 补 Planner/Capability 映射，确保自然语言稳定命中新工具
- [x] 历史 P0-2 强化 `marketing.opportunity.discover` 为营销 Agent 机会卡
- [x] 历史 P0-3 强化 `marketing.activity.draft` 为完整活动草稿确认流
- [x] 历史 P0-4 新增营销 Agent 前端专属组件（漏斗图、话术变体、草稿编辑组件）
- [x] 历史 P0-5 增加营销 Agent eval 和端到端验收用例

### 9.1 历史 P0-4 已完成拆分

- [x] P0-4.1 新增 `AgentFunnelChart`
  - 交付目标：营销效果复盘不再只显示数字/普通图表，而是显示“触达 -> 响应 -> 预约 -> 核销 -> 收入”的漏斗。
  - 验收口径：`marketing.effect.diagnose` 返回后，工作台能直接看到漏斗转化和关键掉点。
- [x] P0-4.2 新增 `AgentCopyVariants`
  - 交付目标：3 条话术变体并排展示，支持选择、复制、继续优化。
  - 验收口径：`marketing.copy.generate` 返回后，用户不用复制整段文本，可直接操作某一条话术。
- [x] P0-4.3 新增营销活动草稿编辑组件
  - 交付目标：活动发布前可编辑客群、权益、发送时间、话术。
  - 验收口径：用户确认前可以改关键字段，确认后仍只生成 `draft` 状态活动。
- [x] P0-4.4 补前端类型、API 门面和渲染组件测试/构建验证
  - 验收口径：根项目 `npx.cmd tsc --noEmit`、`npm.cmd run build` 通过。

### 9.2 历史 P0-5 已完成验收拆分

- [x] P0-5.1 增加营销 Agent eval 样例
  - 覆盖沉睡召回、权益匹配、话术生成、活动草稿、效果复盘。
- [x] P0-5.2 增加 Planner 命中率回归测试
  - 防止“话术生成”被误路由到“机会发现”，防止“权益匹配”被营销机会抢走。
- [x] P0-5.3 增加端到端验收脚本或手工验收记录
  - 链路：客群发现 -> 权益匹配 -> 话术生成 -> 活动草稿 -> 人工确认 -> 生成 draft 活动。
- [x] P0-5.4 更新本任务清单验证记录
  - 每完成一个可验收节点，在第 11 节追加日期、命令和结果。

### 9.3 阶段 3 端到端手工验收用例（已执行）

- [x] E2E-3.1 客群发现
  - 输入：`帮我找一批沉睡客户做召回`
  - 期望：命中 `marketing.customer.segment.discover`，返回沉睡/流失/高价值等客群摘要，不创建任务、不触达客户。
  - 结果：通过，返回 4 类可运营客群、925 位可运营客户，页面未出现自动发送/触达。
- [x] E2E-3.2 权益匹配
  - 输入：`给沉睡客户匹配适合的优惠券`
  - 期望：命中 `promotion.offer.match`，展示可用权益和毛利保护提示。
  - 结果：通过，展示 20 个可用权益，并包含成本/毛利风险信息。
- [x] E2E-3.3 话术生成
  - 输入：`帮我生成沉睡客户召回短信话术`
  - 期望：命中 `marketing.copy.generate`，展示 3 条话术变体，支持复制和继续优化。
  - 结果：通过，展示 3 条话术变体、复制按钮和继续优化入口。
- [x] E2E-3.4 活动草稿
  - 前置：上一轮存在营销机会上下文。
  - 输入：`帮我生成活动草稿`
  - 期望：进入 `waiting_approval`，展示可编辑活动草稿卡，可修改标题、客群、权益、发送时间和话术。
  - 结果：通过；无机会卡上下文时会先澄清，有商品机会卡上下文后进入可编辑草稿确认流。
- [x] E2E-3.5 人工确认
  - 操作：点击“确认创建草稿”。
  - 期望：审批通过后执行 `marketing.activity.draft`，创建 `draft` 状态营销活动；不自动发布、不自动触达客户。
  - 结果：通过；最新 `MarketingActivity id=15` 为 `status=draft`、`publishStatus=null`、`publishedAt=null`。
- [x] E2E-3.6 效果复盘
  - 输入：`上次营销活动转化效果怎么样`
  - 期望：命中 `marketing.effect.diagnose`，展示营销效果漏斗和证据来源；若无触达记录，明确返回无数据，不编造结果。
  - 结果：通过，展示触达、响应、预约、核销/转化、收入贡献漏斗，并带 `营销自动化触达` 数据来源。

---

## 10. 已知风险和注意事项

- 当前工具“已实现”不等于用户自然语言一定覆盖所有表达；T6.4 已覆盖六大 Persona 每类至少 5 个核心问法，但后续新增工具仍需继续扩展 eval。
- 当前 `AgentRenderedBlock` 模型已建，但运行结果主要通过接口返回，任务画布历史落库仍未完成。
- 当前营销活动仍偏草稿/建议，审批通过后只创建 `draft` 状态活动；正式发布、触达和效果回流闭环尚未打通。
- 自动化执行引擎已完成运行态闭环验收，但当前能力定位仍是“安全预演 + 人工审批 + 归因记录”，不是无人值守自动触达。
- 当前 Agent 自动化的“手动触发”是安全预演/运行日志能力，中高风险动作只进入 `waiting_approval`，不会自动触达客户、自动采购、自动调价或自动改财务数据。
- 阶段 7 已完成定时扫描、事件/阈值评估、审批恢复、失败熔断和效果归因运行态 E2E；但当前仍以安全预演、审批和归因记录为主，不应承诺已自动触达外部客户或自动修改核心业务对象。
- 阶段 6 `AgentMemory`、`AgentDailyArchive` 已完成数据库迁移和真实写入验收；下一步增强重点是把高价值记忆自动注入 Planner/回复上下文。
- 当前已补迁移前优雅降级；迁移后已通过严格写入 E2E，后续仍需在生产部署流程中保持 `prisma migrate deploy -> prisma generate -> build/restart -> post-migration-verify` 的顺序。
- T4.14 已关闭负库存可用天数和多轮追问 500 问题；但“库存风险追问 Top 3”当前仍会路由到通用经营异常提醒，后续阶段 6 记忆/上下文可继续优化为更精细的同主题追问。
- 当前工作区存在非 Agent 主线改动：`docs/02-产品设计/财务管理-提成规则统一配置改造方案.md`、`packages/server-v2/src/commission/commission.service.ts`、`src/app/components/AddProjectDialog.tsx`、`src/app/pages/finance/CommissionRules.tsx`，提交前需确认是否纳入本次变更。
- 当前工作区存在未跟踪目录：`.codex/`，通常不应纳入业务提交。

---

## 11. 最近验证记录

最近已确认：

- 后端测试：492/492 通过
- 前端测试：169/169 通过
- 前端 build：通过
- Prisma migration status：当前数据库 schema 已是最新状态，`20260626123000_agent_memory_archive`、`20260626160000_agent_automation_engine` 已应用。
- 2026-06-26：`agent-planner` 定向单测已重新验证，用于确认店长/前台/营销新增路由稳定命中。
- 2026-06-26：`agent-orchestrator` 定向单测已重新验证，用于确认 `marketing.opportunity.discover` 可渲染为营销机会卡。
- 2026-06-26：前端 `npm.cmd run build` 通过，用于确认 `opportunity_card` 前端类型和渲染组件可编译。
- 2026-06-26：根项目 `npx.cmd tsc --noEmit` 通过，用于确认 Agent 工作台角色解析、`opportunity_card` 类型和 API 测试类型调用一致。
- 2026-06-26：`npx.cmd vitest run src/test/api.test.ts` 通过，API 门面测试 11/11。
- 2026-06-26：`packages/server-v2` 后端 `npm.cmd run build` 通过。
- 2026-06-26：`agent-orchestrator` 定向单测已重新验证，用于确认 `marketing.activity.draft` 等待审批时可返回活动草稿卡，并支持 `approve:<id>` / `reject:<id>`。
- 2026-06-26：前端 `npm.cmd run build` 通过，用于确认管理端 `/ami-agent` 审批动作和 `activity_draft_card` 渲染可编译。
- 2026-06-26：`agent-orchestrator` 定向单测通过 16/16，用于确认营销机会卡、话术变体、营销漏斗图和活动草稿审批覆盖参数。
- 2026-06-26：`agent-tool-registry` 定向单测通过 36/36，用于确认营销活动草稿创建时可接收编辑后的标题、客群、权益、话术和发送时间。
- 2026-06-26：根项目 `npx.cmd tsc --noEmit` 通过，用于确认新增 `copy_variants`、`funnel` 图表和审批 payload 类型一致。
- 2026-06-26：根项目 `npm.cmd run build` 通过，用于确认管理端 `/ami-agent` 营销专属组件可生产构建。
- 2026-06-26：`packages/server-v2` 后端 `npm.cmd run build` 通过。
- 2026-06-26：`npx.cmd vitest run src/test/api.test.ts` 通过，API 门面测试 11/11。
- 2026-06-26：`agent-planner` 定向单测通过 25/25，用于确认营销新工具、客户优先名单和旧转化诊断路由不互相抢占。
- 2026-06-26：`agent-eval` 定向单测通过 5/5，默认 Agent eval 矩阵全绿；已覆盖沉睡召回、权益匹配、话术生成、活动草稿、效果复盘。
- 2026-06-26：`agent-orchestrator` 定向单测通过 16/16，用于确认营销 block 输出和审批参数覆盖未回归。
- 2026-06-26：`agent-tool-registry` 定向单测通过 36/36，用于确认营销工具真实执行层未回归。
- 2026-06-26：根项目 `npx.cmd tsc --noEmit`、`npx.cmd vitest run src/test/api.test.ts`、`npm.cmd run build` 均通过。
- 2026-06-26：`packages/server-v2` 后端 `npm.cmd run build` 通过。
- 2026-06-26：本地浏览器 `/ami-agent` 阶段 3 端到端验收通过，覆盖客群发现、权益匹配、话术生成、机会卡、活动草稿、人工确认和效果复盘。
- 2026-06-26：数据库确认最新营销活动 `id=15` 为 `status=draft`、`publishStatus=null`、`publishedAt=null`，确认审批只创建草稿，不自动发布或触达。
- 2026-06-26：阶段 4 美容师服务 Agent 首批后端工具完成，新增 `beautician.today.service.list`、`beautician.customer.care.brief`、`beautician.performance.progress`、`beautician.repurchase.opportunity`。
- 2026-06-26：`agent-planner` 定向单测通过 29/29，用于确认美容师今日客户、护理摘要、业绩进度、复购续卡自然语言稳定命中新工具，且不抢占店长员工排行。
- 2026-06-26：`agent-tool-registry` 定向单测通过 40/40，用于确认美容师首批工具只读/草稿边界、本人范围、护理摘要安全提示和复购机会不自动创建跟进任务。
- 2026-06-26：`agent-eval` 定向单测通过 5/5，默认 Agent eval 矩阵全绿，并已覆盖美容师服务 Agent 首批 4 个核心场景。
- 2026-06-26：`packages/server-v2` 后端 `npm.cmd run build` 通过。
- 2026-06-26：阶段 4 库存采购 Agent 首批后端工具完成，新增 `inventory.consumption.trend`、`inventory.project.bom.risk`、`inventory.expiring.clearance.draft`、`supplier.purchase.link`，并复验 `inventory.replenishment.draft`。
- 2026-06-26：`agent-planner` 定向单测通过 33/33，用于确认库存消耗趋势、项目 BOM 风险、临期处理草稿、供应商采购链接自然语言稳定命中，且不抢占项目毛利和供应链履约诊断。
- 2026-06-26：`agent-tool-registry` 定向单测通过 44/44，用于确认库存采购工具只读/草稿边界，不自动创建采购单、不自动调价、不发布活动、不改库存。
- 2026-06-26：`agent-eval` 定向单测通过 5/5，默认 Agent eval 矩阵全绿，并已覆盖库存采购 Agent 首批 4 个核心场景。
- 2026-06-26：`packages/server-v2` 后端 `npm.cmd run build` 通过。
- 2026-06-26：阶段 4 美容师权限隔离与安全规则补强完成：美容师传入他人 `beauticianId` 不越权，未绑定美容师档案不查询全店数据；统一响应安全层会过滤医疗化和夸大疗效表述。
- 2026-06-26：阶段 4 库存采购 Agent 前端卡片完成，新增 `inventory_item_card`、`supplier_purchase_card`，并修复临期/供应商工具 `consumedSlots` 回写契约，避免 orchestrator 真实链路拦截。
- 2026-06-26：`agent-tool-registry` 定向单测通过 46/46，用于确认美容师权限隔离、库存采购工具边界和既有工具未回归。
- 2026-06-26：`agent-response-safety` 定向单测通过 5/5，用于确认内部字段显示治理和医疗化/夸大疗效安全规则。
- 2026-06-26：`agent-orchestrator` 定向单测通过 18/18，用于确认库存卡片、供应商采购卡和工具槽位验收链路。
- 2026-06-26：`agent-planner` 定向单测通过 33/33，`agent-eval` 定向单测通过 5/5。
- 2026-06-26：根项目 `npm.cmd run build` 通过，`packages/server-v2` 后端 `npm.cmd run build` 通过。
- 2026-06-26：本地管理端 `/dashboard` HTTP 200；后端 `/api/agent/tools` 可响应但当前请求无登录态返回 401，真实登录态 `/ami-agent` 阶段 4 浏览器 E2E 尚未打钩。
- 2026-06-26：使用当前 in-app browser 登录态进入 `/ami-agent`，切换“库存采购 Agent”，真实发送“近30天耗材消耗趋势怎么样，有没有需要补货的风险？”；页面返回库存消耗趋势卡、表格、证据来源和“生成补货采购草稿/查看库存风险”动作，未出现前端控制台错误。
- 2026-06-26：阶段 4 浏览器 E2E 发现运行态缺陷：负库存商品显示“预计可用 -30 天”，多轮追问出现 500。已修复代码级负库存规则：可用天数下限为 0、负库存直接高风险、补货建议量补足到安全库存；同时管理端 Agent 错误提示改为业务化文案，不再裸露 `Request failed with status code 500`。
- 2026-06-26：负库存修复后 `agent-tool-registry` 46/46、`agent-orchestrator` 18/18、`packages/server-v2 npm.cmd run build`、根项目 `npm.cmd run build` 均通过；当时运行态疑似未加载最新后端代码，后续已完成浏览器复验并关闭 T4.14。
- 2026-06-26：阶段 5 财务风控 Agent 首批工具完成，新增 `finance.revenue.summary`、`finance.profit.diagnose`、`finance.margin.risk.rank`；旧 `revenue.diagnose`、`finance.margin.diagnose` 保留兼容。
- 2026-06-26：`agent-planner` 定向单测通过 36/36，用于确认收入汇总、利润诊断、毛利风险排行自然语言稳定命中，且不抢占普通收入诊断、普通毛利诊断和项目毛利诊断。
- 2026-06-26：`agent-tool-registry` 定向单测通过 49/49，用于确认阶段 5 三个新工具可执行、只读、带证据，收入/利润输出 KPI，毛利风险输出排行和建议。
- 2026-06-26：`agent-eval` 定向单测通过 5/5，默认 Agent eval 矩阵 383 个用例全绿；已拆分财务毛利诊断、利润诊断、毛利风险排行三类问法。
- 2026-06-26：`agent-orchestrator` 定向单测通过 18/18，用于确认新财务工具不会被槽位验收拦截，并可进入结构化 Block 构建链路。
- 2026-06-26：`packages/server-v2 npm.cmd run build` 通过。
- 2026-06-26：阶段 5 财务审计与报告草稿工具完成，新增 `finance.refund.discount.audit`、`finance.beautician.performance.audit`、`finance.report.draft`；旧 `order.refund.diagnose`、`staff.performance.rank` 保留兼容。
- 2026-06-26：`agent-planner` 定向单测通过 39/39，用于确认退款折扣审计、绩效审计、财务报告草稿自然语言稳定命中，且不抢占纯退款异常诊断。
- 2026-06-26：`agent-tool-registry` 定向单测通过 52/52，用于确认 T5.4-T5.6 三个新工具可执行、只读、带证据，报告草稿不写库。
- 2026-06-26：`agent-eval` 定向单测通过 5/5，默认 Agent eval 矩阵 419 个用例全绿；已覆盖退款折扣审计、绩效审计、财务报告草稿矩阵问法。
- 2026-06-26：`agent-orchestrator` 定向单测通过 19/19，用于确认 `finance.report.draft` 可渲染为 `document_preview`，并通过槽位校验。
- 2026-06-26：`packages/server-v2 npm.cmd run build` 通过。
- 2026-06-26：阶段 5 财务字段权限和脱敏专项完成，`AgentFieldScopeSanitizerService` 已扩展到文档正文、原因、建议、预览等文本字段，防止财务报告草稿正文泄漏毛利、净收入、提成等敏感信息。
- 2026-06-26：`agent-orchestrator` 定向单测通过 20/20，用于确认 `finance.report.draft` 的 `document_preview` 正文在 `customerProfit=masked`、`staffCommission=hidden` 时会脱敏/隐藏。
- 2026-06-26：`agent-eval` 定向单测通过 5/5，默认 Agent eval 矩阵 421 个用例全绿；已覆盖财务报告草稿账号权限边界和字段范围保护。
- 2026-06-26：`packages/server-v2 npm.cmd run build` 通过。
- 2026-06-26：修复美容师未绑定账号保护分支的槽位回写问题，`beautician.today.service.list` 与 `beautician.repurchase.opportunity` 在不回退全店数据时也会返回 `consumedSlots`，避免真实运行态被 Orchestrator 判定失败。
- 2026-06-26：`agent-tool-registry` 定向单测通过 53/53，用于确认美容师未绑定账号不越权、不查询全店数据，并且回写 `timeRange`、`limit` 槽位。
- 2026-06-26：真实登录 + CSRF + `X-Store-Id=6` API E2E 通过：库存消耗趋势 completed，库存多轮追问 completed，美容师今日服务 completed，财务收入汇总 completed，退款折扣审计 completed，财务报告草稿 completed；未出现 Internal server error。
- 2026-06-26：本地浏览器 `/ami-agent` 阶段 4 运行态复验通过：库存采购 Agent 返回库存消耗卡、明细表、证据来源和动作按钮；负库存显示“预计可用 0 天”；多轮追问无 500；美容师服务 Agent 返回今日服务/预约客户，无 500。
- 2026-06-26：本地浏览器 `/ami-agent` 阶段 5 运行态复验通过：财务风控 Agent 返回本月财务经营报告草稿、`document_preview` 文档预览、KPI 和证据来源；浏览器控制台无 error。
- 2026-06-26：`agent-orchestrator` 定向单测通过 20/20，`packages/server-v2 npm.cmd run build` 通过，用于确认槽位校验、文档预览、字段脱敏和后端编译未回归。
- 2026-06-26：阶段 6 记忆/归档/质量报表代码级底座完成，新增 `AgentMemory`、`AgentDailyArchive` Prisma 模型和 `20260626123000_agent_memory_archive` migration SQL。
- 2026-06-26：新增 `AgentMemoryService`、`AgentObservabilityService`，新增 API：`GET/POST /agent/memories`、`GET /agent/daily-archives`、`POST /agent/daily-archives/generate`、`GET /agent/quality-report`。
- 2026-06-26：管理端 `/ami-agent` 新增右侧“运营记忆”面板，展示当前 Persona 记忆、最近归档、7 日运行质量 KPI，并支持生成今日归档。
- 2026-06-26：`agent-memory` 定向单测通过 2/2，`agent-observability` 定向单测通过 1/1，`agent.controller` 定向单测通过 8/8。
- 2026-06-26：`packages/server-v2 npm.cmd run build` 通过，`npx.cmd prisma validate --schema prisma/schema.prisma` 通过，根项目 `npm.cmd run build` 通过。
- 2026-06-26：`npx.cmd vitest run src/test/api.test.ts` 通过，API 门面测试 11/11。
- 2026-06-26：根项目 `npx.cmd tsc --noEmit` 最新复跑通过；此前 `src/app/pages/finance/CommissionRules.tsx` 的 `targetType` 类型阻塞已解除。
- 2026-06-26：T6.4 Persona eval 扩展完成：已补齐 `manager.daily.briefing`、`reception.customer.lookup`、`reception.reservation.today`、`reception.card.benefit.summary` 的 eval 工具注册和运行态安全 fixture，并收敛六大 Persona 核心问法矩阵。
- 2026-06-26：`packages/server-v2` 执行 `npm.cmd test -- --runInBand --testPathPattern=agent-eval` 通过，5/5；默认 Agent eval 矩阵全绿。
- 2026-06-26：根项目 `npx.cmd tsc --noEmit` 通过。
- 2026-06-26：`packages/server-v2 npm.cmd run build` 通过。
- 2026-06-26：只读执行 `npx.cmd prisma migrate status --schema prisma/schema.prisma`，当时 53 个 migration 中 `20260626123000_agent_memory_archive` 尚未应用；T6.7 真实运行态验收需先获得数据库迁移授权。
- 2026-06-26：阶段 6 运行态 E2E 尚未执行；原因是新增表需要先应用数据库 migration，避免在未授权情况下直接写真实数据库。
- 2026-06-26：T3.4.1 活动草稿编辑体验增强完成：活动草稿确认前可展示权益成本估算和客群明细，保存 draft 后返回活动草稿卡，并提供“查看活动草稿/继续完善活动”入口。
- 2026-06-26：`packages/server-v2` 执行 `npm.cmd test -- --runInBand --testPathPattern=agent-orchestrator` 通过，20/20；用于确认活动草稿待审批卡、权益成本估算、客群明细和保存后动作未回归。
- 2026-06-26：根项目 `npx.cmd tsc --noEmit` 通过，用于确认 Agent Block 类型、活动草稿卡字段和营销活动页定位参数类型一致。
- 2026-06-26：根项目 `npm.cmd run build` 通过，用于确认 `/ami-agent` 活动草稿增强和活动管理页 `focusActivityId` 定位能力可生产构建。
- 2026-06-26：阶段 7 Agent 自动化执行引擎代码级底座完成：新增 `AgentAutomationDefinition`、`AgentAutomationRun`、`AgentAutomationEffect` Prisma 模型和 `20260626160000_agent_automation_engine` migration SQL。
- 2026-06-26：新增 `AgentAutomationService`，新增 API：`GET /agent/automations/triggers`、`GET /agent/automations`、`POST /agent/automations/drafts`、`GET /agent/automations/runs`、`GET /agent/automations/effects`、`POST /agent/automations/:id/run`。
- 2026-06-26：阶段 7 已内置 10 个触发器：沉睡客户、高价值客户到店、疗程消耗、库存缺货、临期库存、活动低转化、员工异常、预约异常、财务异常、投诉差评。
- 2026-06-26：管理端 `/ami-agent` 右侧面板新增“自动化中心”，可展示触发器数量、当前 Persona 自动化草稿、最近运行，并支持手动预演按钮。
- 2026-06-26：`packages/server-v2` 执行 `npm.cmd test -- --runInBand --testPathPattern=agent-automation` 通过，4/4；用于确认 10 个触发器、草稿生成、高风险待审批和跨门店保护。
- 2026-06-26：`packages/server-v2` 执行 `npm.cmd test -- --runInBand --testPathPattern=agent.controller` 通过，10/10；用于确认自动化草稿和手动预演 API 传入当前门店/用户上下文。
- 2026-06-26：`packages/server-v2` 执行 `npx.cmd prisma validate --schema prisma/schema.prisma` 通过。
- 2026-06-26：根项目 `npx.cmd tsc --noEmit` 通过。
- 2026-06-26：`packages/server-v2 npm.cmd run build` 通过。
- 2026-06-26：根项目 `npm.cmd run build` 通过。
- 2026-06-26：只读执行 `npx.cmd prisma migrate status --schema prisma/schema.prisma`，当前 54 个 migration 中 `20260626123000_agent_memory_archive`、`20260626160000_agent_automation_engine` 尚未应用；T6.7 和 T7.13 真实运行态验收需先获得数据库迁移授权。
- 2026-06-26：阶段 7 自动化执行引擎补齐 T7.6-T7.10 代码级能力：新增到期扫描、事件/阈值评估、待审批列表、审批确认/拒绝、失败恢复/暂停熔断、效果归因 API。
- 2026-06-26：`packages/server-v2` 执行 `npm.cmd test -- --runInBand --testPathPattern=agent-automation` 通过，9/9；用于确认定时触发安全预演、事件/阈值触发、高风险审批、连续失败熔断和归因记录。
- 2026-06-26：`packages/server-v2` 执行 `npm.cmd test -- --runInBand --testPathPattern=agent.controller` 通过，14/14；用于确认新增自动化 API 均使用当前门店/用户上下文。
- 2026-06-26：根项目 `npx.cmd tsc --noEmit` 通过，用于确认自动化 API 类型、运行结果类型和前端门面一致。
- 2026-06-26：`packages/server-v2` 执行 `npx.cmd prisma validate --schema prisma/schema.prisma` 通过。
- 2026-06-26：`packages/server-v2 npm.cmd run build` 通过。
- 2026-06-26：根项目 `npm.cmd run build` 通过。
- 2026-06-26：阶段 6/7 迁移前优雅降级完成：`AgentMemoryService` 和 `AgentAutomationService` 已识别 `P2021/P2022`、缺表和 delegate 未生成场景，列表类接口返回空态，写入类接口返回明确迁移待处理错误。
- 2026-06-26：`packages/server-v2` 执行 `npm.cmd test -- --runInBand --testPathPattern=agent-memory` 通过，4/4；用于确认记忆列表缺表空态和每日归档未迁移预览。
- 2026-06-26：`packages/server-v2` 执行 `npm.cmd test -- --runInBand --testPathPattern=agent-automation` 通过，12/12；用于确认自动化缺表空态、到期扫描迁移待处理空结果和草稿写入迁移待处理错误。
- 2026-06-26：`packages/server-v2` 执行 `npm.cmd test -- --runInBand --testPathPattern=agent.controller` 通过，14/14。
- 2026-06-26：根项目 `npx.cmd tsc --noEmit` 通过。
- 2026-06-26：`packages/server-v2` 执行 `npx.cmd prisma validate --schema prisma/schema.prisma` 通过。
- 2026-06-26：`packages/server-v2 npm.cmd run build` 通过。
- 2026-06-26：`/ami-agent` 迁移待处理状态前端可见化完成，分页响应类型新增 `migrationPending/reason`；右侧面板可展示记忆表、归档表、自动化表待迁移提示。
- 2026-06-26：根项目 `npx.cmd tsc --noEmit` 通过，根项目 `npm.cmd run build` 通过；`git diff --check` 对本次触达文件无空白错误。
- 2026-06-26：阶段 6/7 只读迁移就绪检查完成：新增 `AgentSchemaReadinessService` 和 `GET /agent/schema-readiness`，可返回缺失表、对应迁移和整体 ready 状态；`/ami-agent` 右侧面板新增“迁移就绪”状态。
- 2026-06-26：`packages/server-v2` 执行 `npm.cmd test -- --runInBand --testPathPattern=agent-schema-readiness` 通过，2/2；`npm.cmd test -- --runInBand --testPathPattern=agent.controller` 通过，15/15。
- 2026-06-26：根项目 `npx.cmd tsc --noEmit` 通过；`packages/server-v2 npm.cmd run build` 通过；根项目 `npm.cmd run build` 通过；`git diff --check` 对本次触达文件无空白错误。
- 2026-06-26：只读执行 `npx.cmd prisma migrate status --schema prisma/schema.prisma`，确认 `20260626123000_agent_memory_archive`、`20260626160000_agent_automation_engine` 仍未应用；命令因存在待应用迁移返回非 0，T6.7/T7.13 继续保持未完成。
- 2026-06-26：`/ami-agent` 迁移未就绪交互保护完成，schema-readiness 明确返回未就绪时，“生成今日归档”按钮显示待迁移并禁用，自动化手动预演按钮禁用并提示需先迁移。
- 2026-06-26：根项目 `npx.cmd tsc --noEmit` 通过；根项目 `npm.cmd run build` 通过；`git diff --check` 对本次触达文件无空白错误。
- 2026-06-26：`/agent/schema-readiness` 增强为表结构和 `_prisma_migrations` 记录双检查；前端“迁移就绪”卡可显示“表待迁移”或“迁移未记录”，作为 T6.7/T7.13 运行态验收前置依据。
- 2026-06-26：`packages/server-v2` 执行 `npm.cmd test -- --runInBand --testPathPattern=agent-schema-readiness` 通过，3/3；`npm.cmd test -- --runInBand --testPathPattern=agent.controller` 通过，15/15。
- 2026-06-26：根项目 `npx.cmd tsc --noEmit` 通过；`packages/server-v2 npm.cmd run build` 通过；根项目 `npm.cmd run build` 通过；`git diff --check` 对本次触达文件无空白错误。
- 2026-06-26：`/ami-agent` 迁移缺口明细展示完成，迁移就绪卡可直接展示待应用 migration 名称和缺失表名，减少实施/验收时反复切换命令行确认。
- 2026-06-26：根项目 `npx.cmd tsc --noEmit` 通过；根项目 `npm.cmd run build` 通过；`git diff --check` 对本次触达文件无空白错误。
- 2026-06-26：新增只读验收脚本 `packages/server-v2/prisma/agent-schema-readiness.ts`，并接入 `npm.cmd run agent:schema-readiness` / `npm.cmd run agent:schema-readiness:allow-pending`。
- 2026-06-26：执行 `npm.cmd run agent:schema-readiness:allow-pending` 通过，当前输出 `ready=false`，缺失 5 张 Agent 表和 2 条 migration：`20260626123000_agent_memory_archive`、`20260626160000_agent_automation_engine`。
- 2026-06-26：根项目 `npx.cmd tsc --noEmit` 通过；`packages/server-v2 npm.cmd run build` 通过；`agent-schema-readiness` 单测 3/3 通过；`git diff --check` 对本次触达文件无空白错误。
- 2026-06-26：新增运行态 readiness 脚本 `packages/server-v2/prisma/agent-runtime-readiness.ts`，并接入 `npm.cmd run agent:runtime-readiness` / `npm.cmd run agent:runtime-readiness:allow-pending`。
- 2026-06-26：执行 `npm.cmd run agent:runtime-readiness:allow-pending` 通过，当前因 `ready=false` 停在 schema pending，未执行 5 张 Agent 新表只读探测；迁移后可作为 T6.7/T7.13 E2E 前置 smoke。
- 2026-06-26：根项目 `npx.cmd tsc --noEmit` 通过；`packages/server-v2 npm.cmd run build` 通过；`git diff --check` 对本次触达文件无空白错误。
- 2026-06-26：新增 API E2E 验收脚本 `packages/server-v2/prisma/agent-api-e2e.ts`，并接入 `npm.cmd run agent:api-e2e` / `npm.cmd run agent:api-e2e:allow-missing-auth`。
- 2026-06-26：执行 `npm.cmd run agent:api-e2e:allow-missing-auth` 通过，当前因缺少登录 token 和门店 ID 按预期跳过；迁移后传入 `AGENT_E2E_TOKEN` 和 `AGENT_E2E_STORE_ID` 可跑 API 读路径，显式 `--include-write --yes` 后可跑写路径。
- 2026-06-26：根项目 `npx.cmd tsc --noEmit` 通过；`packages/server-v2 npm.cmd run build` 通过；`git diff --check` 对本次触达文件无空白错误。
- 2026-06-26：复跑 `npm.cmd run agent:schema-readiness:allow-pending` 通过，当前 `ready=false`；仍缺失 `agent_memories`、`agent_daily_archives`、`agent_automation_definitions`、`agent_automation_runs`、`agent_automation_effects` 五张表，以及 `20260626123000_agent_memory_archive`、`20260626160000_agent_automation_engine` 两条迁移记录。
- 2026-06-26：复跑 `npm.cmd run agent:runtime-readiness:allow-pending` 通过，当前因 schema 未就绪按预期停在迁移前置检查，尚未进入五张 Agent 新表的只读 count 探测。
- 2026-06-26：复跑 `npm.cmd run agent:api-e2e:allow-missing-auth` 通过，当前因未提供 `AGENT_E2E_TOKEN` 和 `AGENT_E2E_STORE_ID` 按预期跳过；T6.7/T7.13 仍保留未完成，等待迁移授权和真实登录态验收。
- 2026-06-26：新增迁移后验收清单脚本 `packages/server-v2/prisma/agent-verification-plan.ts`，并接入 `npm.cmd run agent:verification-plan`；该命令不写库，只输出迁移授权后命令顺序、缺失登录参数和 T6.7/T7.13 打钩门槛。
- 2026-06-26：执行 `npm.cmd run agent:verification-plan` 通过，当前提示 `AGENT_E2E_TOKEN`、`AGENT_E2E_STORE_ID` 缺失，并明确写入类 API E2E 需要显式 `--include-write --yes`。
- 2026-06-26：根项目 `npx.cmd tsc --noEmit` 通过；`packages/server-v2 npm.cmd run build` 通过。
- 2026-06-26：新增迁移文件静态审计脚本 `packages/server-v2/prisma/agent-migration-audit.ts`，并接入 `npm.cmd run agent:migration-audit`；该命令不连接数据库，只检查阶段 6/7 migration SQL 是否包含预期表、主键、索引和唯一约束。
- 2026-06-26：执行 `npm.cmd run agent:migration-audit` 通过，确认 `20260626123000_agent_memory_archive` 和 `20260626160000_agent_automation_engine` 两个迁移文件静态结构完整。
- 2026-06-26：根项目 `npx.cmd tsc --noEmit` 通过；`packages/server-v2 npm.cmd run build` 通过。
- 2026-06-26：新增一键只读预检脚本 `packages/server-v2/prisma/agent-preflight.ts`，并接入 `npm.cmd run agent:preflight`；该命令串联 `agent:migration-audit`、`agent:schema-readiness:allow-pending`、`agent:runtime-readiness:allow-pending`、`agent:api-e2e:allow-missing-auth` 和 `agent:verification-plan`。
- 2026-06-26：执行 `npm.cmd run agent:preflight` 通过，预检流程 `passed=true`；当前 schema readiness 仍显示 5 张 Agent 新表和 2 条 migration 未应用，API E2E 因缺少 `AGENT_E2E_TOKEN`、`AGENT_E2E_STORE_ID` 按预期跳过。
- 2026-06-26：根项目 `npx.cmd tsc --noEmit` 通过；`packages/server-v2 npm.cmd run build` 通过。
- 2026-06-26：新增迁移后严格验收脚本 `packages/server-v2/prisma/agent-post-migration-verify.ts`，并接入 `npm.cmd run agent:post-migration-verify` / `npm.cmd run agent:post-migration-verify:plan`；严格模式用于迁移应用后关闭 T6.7/T7.13，写路径验证必须显式 `-- --include-write --yes`。
- 2026-06-26：执行 `npm.cmd run agent:post-migration-verify:plan` 通过；当前仅验证脚本计划输出，未执行严格模式，因为数据库仍未应用阶段 6/7 两条 migration。
- 2026-06-26：根项目 `npx.cmd tsc --noEmit` 通过；`packages/server-v2 npm.cmd run build` 通过。
- 2026-06-26：`agent:post-migration-verify` 增加登录态 E2E 环境变量前置校验；严格模式会先检查 `AGENT_E2E_TOKEN`、`AGENT_E2E_STORE_ID`，缺失时返回 `missing_runtime_env`，不再继续跑 schema/runtime/API 链路。
- 2026-06-26：执行 `npm.cmd run agent:post-migration-verify:plan` 通过，当前显示 `AGENT_E2E_TOKEN=missing`、`AGENT_E2E_STORE_ID=missing`；执行 `npm.cmd run agent:post-migration-verify` 按预期快速失败并列出缺失环境变量。
- 2026-06-26：根项目 `npx.cmd tsc --noEmit` 通过；`packages/server-v2 npm.cmd run build` 通过。
- 2026-06-26：`agent:api-e2e` 增强覆盖清单输出；缺少登录参数并使用 `--allow-missing-auth` 时，会同步输出读路径 8 个接口、写路径 3 个接口，以及每个接口对应的 T6.7/T7.13 验收任务。
- 2026-06-26：执行 `npm.cmd run agent:api-e2e:allow-missing-auth` 通过，当前按预期跳过并输出覆盖清单；执行 `npm.cmd run agent:preflight` 通过，预检输出已包含 API E2E 覆盖范围。
- 2026-06-26：根项目 `npx.cmd tsc --noEmit` 通过；`packages/server-v2 npm.cmd run build` 通过。
- 2026-06-26：`agent:post-migration-verify:plan` 增强 API 覆盖范围输出；plan 输出现包含读路径 8 个接口、写路径开启参数和对应 T6.7/T7.13 任务，严格验收前即可确认覆盖口径。
- 2026-06-26：执行 `npm.cmd run agent:post-migration-verify:plan` 通过，输出包含 `apiCoverage.readChecks` 和 `writeChecksAvailableWith=--include-write --yes`。
- 2026-06-26：根项目 `npx.cmd tsc --noEmit` 通过；`packages/server-v2 npm.cmd run build` 通过。
- 2026-06-26：新增共享覆盖清单 `packages/server-v2/prisma/agent-e2e-coverage.ts`，`agent:api-e2e` 和 `agent:post-migration-verify:plan` 均改为引用同一份 T6.7/T7.13 读/写接口清单。
- 2026-06-26：执行 `npm.cmd run agent:api-e2e:allow-missing-auth` 通过，执行 `npm.cmd run agent:post-migration-verify:plan` 通过，两者输出的 API 覆盖清单保持一致。
- 2026-06-26：修复 `packages/server-v2/src/cards/cards.service.ts` 构建阻塞：卡项核销记录 `projectName` 改用已校验的 `matchedProjectName` 兜底，避免 Prisma 必填字符串收到 `undefined`。
- 2026-06-26：`packages/server-v2 npm.cmd run build` 通过；根项目 `npx.cmd tsc --noEmit` 通过；`packages/server-v2 npm.cmd test -- --runInBand --testPathPattern=cards.service` 通过 5/5。
- 2026-06-26：新增覆盖清单审计脚本 `packages/server-v2/prisma/agent-e2e-coverage-audit.ts`，并接入 `npm.cmd run agent:e2e-coverage:audit`；该命令不连 API、不连数据库，只校验 T6.7/T7.13 读写接口覆盖清单结构。
- 2026-06-26：执行 `npm.cmd run agent:e2e-coverage:audit` 通过，确认读路径 8 个、写路径 3 个、T6.7/T7.13 均有覆盖且无重复 key；执行 `npm.cmd run agent:preflight` 通过。
- 2026-06-26：根项目 `npx.cmd tsc --noEmit` 通过；`packages/server-v2 npm.cmd run build` 通过。
- 2026-06-26：`agent:preflight` 纳入 `agent:e2e-coverage:audit`，迁移前一键预检会在 API E2E 缺参跳过前先确认覆盖清单完整。
- 2026-06-26：执行 `npm.cmd run agent:preflight` 通过，summary 包含 `e2e-coverage-audit` 且结果为 `ok=true`。
- 2026-06-26：根项目 `npx.cmd tsc --noEmit` 通过；`packages/server-v2 npm.cmd run build` 通过。
- 2026-06-26：`agent:preflight` 纳入 `agent:post-migration-verify:plan`，迁移前一键预检会同步展示严格验收步骤、`AGENT_E2E_TOKEN`/`AGENT_E2E_STORE_ID` 状态和 API 覆盖范围。
- 2026-06-26：执行 `npm.cmd run agent:preflight` 通过，summary 包含 `post-migration-verify-plan` 且结果为 `ok=true`。
- 2026-06-26：根项目 `npx.cmd tsc --noEmit` 通过；`packages/server-v2 npm.cmd run build` 通过。
- 2026-06-26：`agent:api-e2e` 增强登录态解析，迁移后验收可继续使用 `AGENT_E2E_TOKEN + AGENT_E2E_STORE_ID`，也可使用 `AGENT_E2E_USERNAME + AGENT_E2E_PASSWORD` 自动登录；若登录返回门店列表，可自动推导 `storeId`。
- 2026-06-26：执行 `npm.cmd run agent:api-e2e:allow-missing-auth` 通过，当前无 token/账号密码时按预期跳过并输出两种登录态配置方式；执行 `npm.cmd run agent:post-migration-verify:plan` 和 `npm.cmd run agent:verification-plan` 通过，输出已包含账号密码自动登录方案。
- 2026-06-26：修复 `packages/server-v2/src/orders/orders.service.ts` 构建阻塞：会员卡充值流程创建余额交易记录时保留 `balanceTransaction` 返回值，避免返回 `balanceTransactionId` 时引用未声明变量。
- 2026-06-26：`packages/server-v2 npm.cmd run build` 通过；根项目 `npx.cmd tsc --noEmit` 通过；`packages/server-v2 npm.cmd test -- --runInBand --testPathPattern=orders.service` 通过 17/17；`npm.cmd run agent:preflight` 通过。
- 2026-06-26：执行 `npm.cmd run agent:post-migration-verify` 在未配置 token/账号密码时按预期失败，输出 `missing_runtime_env` 和两种登录态配置方式；严格 T6.7/T7.13 验收仍需迁移授权和真实登录态。
- 2026-06-26：新增 `packages/server-v2/prisma/agent-completion-audit.ts`，并接入 `npm.cmd run agent:completion-audit`；该命令只读检查任务清单中 T6.7/T7.13/P1-3/P1-4/P2-3/P2-4 是否具备打钩证据。
- 2026-06-26：执行 `npm.cmd run agent:completion-audit` 通过，确认剩余 6 个关键任务行均保持未打钩；schema readiness 仍显示 5 张 Agent 表和 2 条 migration 未就绪。
- 2026-06-26：`agent:preflight` 纳入 `agent:completion-audit`，迁移前一键预检会同时检查任务清单打钩状态是否与真实 readiness 一致；复跑 `npm.cmd run agent:preflight` 通过，completion audit 显示最新 `checked=193`、`unchecked=8`。
- 2026-06-26：根项目 `npx.cmd tsc --noEmit` 通过；`packages/server-v2 npm.cmd run build` 通过。
- 2026-06-26：`agent:completion-audit` 增强为阶段分组审计，分别输出 `memory_archive` 与 `automation_engine` 的 `groupReady`、`readyToClose`、`blockedByMigration`、`pendingRuntimeE2e`，支持后续阶段 6/7 分别应用迁移、分别打钩。
- 2026-06-26：执行 `npm.cmd run agent:completion-audit` 通过，当前 `readyToClose=[]`、`blockedByMigration=[T6.7,T7.13,P1-3,P1-4,P2-3,P2-4]`；执行 `npm.cmd run agent:preflight` 通过；根项目 `npx.cmd tsc --noEmit` 通过。
- 2026-06-26：`agent:completion-audit` 增强 `closurePlan` 输出，按迁移阶段和运行态 E2E 阶段生成关闭命令、中文证据清单、真实任务打钩行和验证记录模板。
- 2026-06-26：执行 `npm.cmd run agent:completion-audit` 通过，`closurePlan` 已可输出 `P1-3`、`P2-3`、`T6.7/P1-4`、`T7.13/P2-4` 四组后续关闭模板；当前仍因 migration 未应用保持 blocked。
- 2026-06-26：阶段 7 自动化写路径 E2E 覆盖增强，`agent:api-e2e -- --include-write --yes` 将在创建自动化草稿后继续覆盖手动运行、待审批列表、审批通过、审批拒绝、恢复预演、效果归因、到期扫描和事件评估。
- 2026-06-26：执行 `npm.cmd run agent:e2e-coverage:audit` 通过，确认读路径 8 个、写路径 11 个，T7.13 覆盖 13 个检查点；执行 `npm.cmd run agent:api-e2e:allow-missing-auth` 通过，缺登录态时仍可输出完整覆盖清单。
- 2026-06-26：修正 `agent:post-migration-verify:plan -- --include-write` 计划模式，查看写路径覆盖计划不再要求 `--yes`；实际执行写路径仍必须使用 `--include-write --yes`。
- 2026-06-26：执行 `npm.cmd run agent:post-migration-verify:plan -- --include-write` 通过，输出写路径 11 个检查点和迁移后严格验收命令顺序。
- 2026-06-26：阶段 7 自动化写路径 E2E 断言增强，`agent:api-e2e` 会在迁移后验证草稿、运行、待审批、审批通过/拒绝、恢复、归因、到期扫描和事件评估的关键响应字段，不再只以 HTTP 成功作为通过依据。
- 2026-06-26：执行 `npm.cmd run agent:api-e2e:allow-missing-auth` 通过；执行 `npm.cmd run agent:preflight` 通过；根项目 `npx.cmd tsc --noEmit` 通过。当前仍因缺少 migration 和登录态未执行真实写路径。
- 2026-06-26：阶段 6 记忆归档写路径 E2E 断言增强，`agent:api-e2e` 会在迁移后验证记忆创建字段、记忆列表读回、每日归档生成状态、归档列表读回和质量报表 KPI 数值字段。
- 2026-06-26：阶段 6/7 代码级定向单测复验通过：`npm.cmd test -- agent-memory.service.spec.ts agent-observability.service.spec.ts agent-schema-readiness.service.spec.ts agent-automation.service.spec.ts --runInBand`，4 个测试套件、20 个用例全部通过；T6.7/T7.13 仍需等待数据库迁移和真实登录态 E2E 后才能打钩。
- 2026-06-26：阶段 6/7 迁移后验收脚本支持分组关闭：`agent:schema-readiness`、`agent:runtime-readiness`、`agent:api-e2e`、`agent:post-migration-verify` 支持 `--group=memory_archive|automation_engine|all`；后续可分别关闭 P1-3/T6.7/P1-4 和 P2-3/T7.13/P2-4，不必等待两组迁移同时完成。
- 2026-06-26：阶段 6/7 分组验收 npm 别名已补：`agent:schema-readiness:memory`、`agent:runtime-readiness:memory`、`agent:post-migration-verify:memory(:plan)` 对应阶段 6；`agent:schema-readiness:automation`、`agent:runtime-readiness:automation`、`agent:post-migration-verify:automation(:plan)` 对应阶段 7。写路径 E2E 仍需在严格验收命令后显式追加 `-- --include-write --yes`。
- 2026-06-26：用户已明确授权执行真实数据库迁移；执行 `npm.cmd run db:migrate:prod` 成功应用 `20260626123000_agent_memory_archive` 和 `20260626160000_agent_automation_engine`，`npx.cmd prisma migrate status --schema prisma/schema.prisma` 确认 Database schema is up to date。
- 2026-06-26：执行 `npm.cmd run db:generate` 重新生成 Prisma Client，确认 `agentMemory`、`agentDailyArchive`、`agentAutomationDefinition` 等 delegate 已存在；执行 `npm.cmd run build` 重建后端，并重启本地 8080 后端到新 `dist/main.js`。
- 2026-06-26：执行 `npm.cmd run agent:schema-readiness` 通过，阶段 6/7 两组迁移均 `ready=true`，无缺失表、无缺失 migration；执行 `npm.cmd run agent:runtime-readiness` 通过，5 张 Agent 新表均可查询。
- 2026-06-26：执行 `AGENT_E2E_USERNAME=admin AGENT_E2E_PASSWORD=11111111 npm.cmd run agent:post-migration-verify -- --include-write --yes` 通过，覆盖 migration audit、schema readiness、runtime readiness、API 读路径和真实写路径；T6.7/P1-4 与 T7.13/P2-4 关闭。
- 2026-06-26：严格写入 E2E 证据：阶段 6 创建记忆 `id=1`、生成每日归档 `id=1/status=generated`；阶段 7 创建自动化草稿 `id=1/status=draft`，手动运行进入审批，审批通过 `approved=true`，审批拒绝 `approved=false`，恢复状态 `retry_scheduled`，归因记录 `id=6`。

后续每完成一个阶段，建议在本节追加日期和验证命令结果。
