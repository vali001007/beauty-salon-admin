# AGENTS.md

This file provides concise guidance to Codex / coding agents when working in this repository.

## 协作与权限边界

- 遵守全局 AGENTS.md 的中文沟通、vibe coding、文档落盘、一次到位和禁止批量删除规则。
- 工作区可能存在用户未提交改动；先读现状，只在当前任务范围内增量修改，不清理、回滚或覆盖无关改动。
- 必要重构可以做，但需说明影响范围、风险和验证方式；阶段性完成后主动建议是否提交。
- 功能实现不能只看“能用”，还要关注真实数据加载体验；页面、终端或接口若出现加载慢、空白等待、重复请求、首屏阻塞，应同步处理或记录风险。
- 本仓库是“一个统一后端 + 多个独立客户端”的松散多应用仓库，不是 npm workspaces；跨包修改前先确认依赖方向、独立构建和部署边界。
- 涉及真实写库、远端修改、commit、push、PR、合并、tag、release 和生产发布等外部状态变更，必须先获得用户明确授权；已获授权后可在授权范围内连续执行，不重复询问。

## 任务分级执行规则

- L0 轻量任务：只涉及问答、只读解释、文案微调、单文件小改、样式微调、无业务链路变化。可不做全链路排查；只需最小范围读取/修改，最终简短说明改了什么。若未改代码，不必跑测试。
- L1 常规任务：涉及一个页面、一个 API facade、一个表单、一个局部交互或一个明确 bug。需检查直接相关文件和调用方，按风险跑定向测试或构建，最终说明已验证和未验证项。
- L2 闭环任务：涉及营销、库存、订单、收银、终端、AI、权限、真实数据、跨前后端链路，或用户追问“是否打通/是否一样/是否完成”。必须按业务链路核对路由、组件、API、service、schema/数据表和真实数据，并做必要验证。
- L3 高风险任务：涉及 Prisma schema/migration、认证权限、API client、全局状态、发布/Git、批量数据、真实写库、跨包重构或删除/迁移文件。必须先说明范围、风险和验证方式，外部状态变更遵守统一权限边界。
- 若用户明确要求“详细分析/完整验证/全部开发完成”，即使任务看似较小，也按更高等级执行。
- 若任务等级不确定，先按较低等级启动；一旦发现跨模块、真实数据或共享链路影响，立即升级执行等级并告知用户。

## 任务合同与验收
- L1 任务开工前简要明确目标、修改范围和验证方式。
- L2/L3 任务开工前必须明确：目标、对象、排除项、交付物、代码/接口/页面/数据/交付五层验收标准和外部操作权限；不适用项可直接标记“不适用”。
- L2/L3 最终回复按五层报告已完成、已验证和未验证项；L0/L1 保持简短。

## 开工预检与 WIP 限制
- L2/L3 任务先看 `git status --short --branch`，识别当前分支、未提交改动、未跟踪文件和共享链路风险；会碰到用户未提交改动或高风险共享链路时，先提醒用户再改。
- 整个仓库最多同时推进 2 个进入代码实现、真实验证或发布阶段的一级业务目标；同一工作区原则上只承载 1 个一级目标。
- WIP 按当前活跃任务计算，不按工作区既有未提交文件所覆盖的历史业务域计算。
- 开始第 3 个一级目标前，必须先完成、冻结或转移现有目标。现有工作区跨域严重时可继续只读分析；代码实现应使用不冲突的独立 worktree，或先完成当前目标收口。

## 分支与提交边界
- L2/L3 任务原则上一个一级业务目标对应一个 `codex/*` 分支；与当前未提交改动冲突时使用独立 worktree。L0/L1 小改在不碰到其他未提交改动时可沿用当前分支。
- 提交按可独立解释、验证和回滚的业务闭环拆分；不将不同业务域、生成产物和无关文档混入同一提交。
- 只使用显式 `git add <paths>` 控制范围；提交前必须查看 `git diff --cached --name-only` 和对应定向验证结果。
- GitHub 是主发布源：`origin` 指向 GitHub，`main` 跟踪 `origin/main`；Gitee 仅作额外同步远端，`gitee` 固定使用 `https://gitee.com/cocobao/beauty-salon.git`。
- 功能分支使用 `git push origin <branch>`；只有用户明确授权发布 `main` 时，才执行 `git push origin main`。不从功能开发工作区直接向 `main` 推送未经审查的改动。

## 长任务上下文控制
- 长任务上下文已明显拥挤时，在完成当前原子步骤后新建任务；只携带已验证结论、目标文件、未完成项和必要命令，不复制完整工具输出、历史日志或无关上下文。

## AI Coding 对齐与完成标准

- 先区分任务类型：只读分析、文档/方案、代码实现、真实数据验证、Git/发布；用户明确要求文档、方案、计划或清单时必须落盘，普通问答和只读解释不创建文件。
- 用户需求先翻译成工程对象：路由/组件、API、service、schema/数据表、真实业务记录和验收口径。
- 不把“方案已写”“代码已改”“build 通过”“mock 正常”“脚本存在”误报为业务已完成。
- 遇到“是否一样/是否打通/是否合并”，按任务分级核对对象边界；
- L2/L3 必须查清路由、组件、API、service、schema/数据表和真实数据，不按页面名、URL 或文案猜。
- 新增或调整 API 时，同步检查 `server-v2`、`src/api/real/*`、facade、导出、调用方、类型和必要测试，避免只改一端。
- 只读 verify 失败时，不重复执行后宣称完成；L2/L3 优先核对真实来源表和最新业务记录，构建通过不等于 typecheck、测试和真实 verify 都通过。

## 项目入口

- `src/`：管理端主应用。
- `packages/server-v2`：NestJS + Prisma + PostgreSQL 主线后端，是各客户端共享的业务 API、数据、权限和 AI Gateway。
- `packages/Ami-Aura-Lite-Kiosk`：Ami Aura Lite 智能终端主线。
- `packages/Ami-Glow-H5`：Ami Glow 客户服务 H5，覆盖登录、首页、项目、预约、测肤、会员与消费记录等客户服务场景。
- `packages/Ami-Glow-MiniApp`：Ami Glow 客户服务小程序。
- `packages/marketing-h5`：公开营销活动 H5，负责活动页渲染、分享、留资、埋点和转化，不等同于 Ami Glow 客户服务端。
- `packages/app`：独立移动端 AI 助手 Web App/MVP，不是管理后台，也不是 Ami Aura Lite 终端主线。
- `packages/agent-core`：共享 AI 对话类型、Persona、反馈上下文和结构化消息渲染能力，当前主要由 Ami Aura Lite 复用。
- `docs/`：API 契约、终端接口、生产计划、开发计划等文档。
- `outputs/` 与中文产品资料目录：谨慎改动，不要当作可清理废文件。

各子项目保留独立依赖锁、构建和部署边界。详细命令、运行、预览和部署参考见：`docs/03-开发计划/09-Git发布与项目治理/AGENTS补充参考信息.md`。

## 技术与代码风格

- 管理端为 React + TypeScript + Vite；后端主线为 `packages/server-v2`，NestJS + Prisma + PostgreSQL。
- 管理端路径别名 `@` 指向 `./src`；改动时遵守现有 Prettier、ESLint 和 React Hooks 规则。
- MUI、Tailwind、shadcn/ui 共存，改页面时延续当前页面风格。
- 不要移除 Vite React/Tailwind 插件；`assetsInclude` 不要加入 `.css`、`.ts`、`.tsx`。
- 子项目不是统一 workspace：新增依赖时只修改实际消费该依赖的 `package.json` 与对应 lockfile，不要默认同步到全部子包。

## API 与数据约定

- 管理端运行时 API 统一走 Real 主线：`server-v2` + `src/api/real/*`。
- Kiosk、Ami Glow H5、营销 H5、MiniApp 和 `packages/app` 的真实业务数据也必须来自 `server-v2`；不得在客户端新建第二套业务事实源。
- 不再采用本地 mock 补齐新增业务；mock 仅保留给单测、离线样例或历史结构对照。
- 新增业务优先顺序：`packages/server-v2` schema/service/controller -> `src/api/real/*` -> `src/api/*.ts` 门面 -> `src/api/index.ts` 导出。
- `src/api/client.ts` 响应拦截器已返回 `response.data`；调用方不要重复 `.data.data`。
- 分页响应优先使用 `{ items, total?, page?, pageSize? }`，兼容旧字段 `{ data }`。
- 错误统一使用 `{ message, code?, status?, details? }`，并挂到 `error.payload`。
- `baseURL = VITE_API_BASE_URL || '/api'`；请求自动附加 `Authorization` 与 `X-Store-Id`。
- 本地管理端通常通过 Vite `/api` 代理到 `http://localhost:8080`。

## 路由、权限与 UI

- 路由集中定义在 `src/app/routes.tsx`，不是文件系统路由。
- 权限链路为：路由 `PermissionGuard` -> 菜单权限 -> `usePermission`。
- 权限码格式为 `平台:模块:动作`；`super_admin` 拥有 `['*']`。
- 旧权限码兼容映射不要随意删除。
- 表单通常使用 react-hook-form + zodResolver；成功后关闭弹窗、提示并刷新，失败时保留弹窗并展示错误。

## 终端与 AI

- Terminal 相关入口：`src/api/terminal.ts`、`src/api/real/terminal.ts`、`packages/server-v2/src/terminal`、`packages/Ami-Aura-Lite-Kiosk`、`docs/terminal-api.md`。
- AI 相关入口：`src/api/ai.ts`、`src/api/real/ai.ts`、`packages/server-v2/src/ai`、`packages/server-v2/src/brain`、`packages/server-v2/src/semantic-data`、`packages/agent-core`、`packages/app/src/api/claude.ts`。
- 前端不保存模型 Key；管理端、终端、移动/助手端均应通过 `server-v2` 调用 AI Gateway。
- 移动/助手端应走 Agent Gateway 或 `/api/ai/*`，不要再接入旧 `/v1/messages`。
- Ami Brain 相关任务必须区分“代码能力、能力目录/语义定义、治理发布状态、真实数据库状态”；扫描脚本存在或单测通过不等于能力已经发布并可供生产运行。

## Agent 与核心模块版本治理
- 统一版本决策记录固定为 `docs/03-开发计划/01-AI智能体与问数能力/Agent与核心模块版本决策记录.md`；首次触发新增版本任务时创建，不得另起平行登记文件。
- 新建 Agent/核心模块版本前，必须更新统一版本决策记录，写明定位、主入口、替代对象、兼容边界、发布门禁和旧版处置。
- 旧版必须标记为保留、冻结、迁移中或待退役；路由、菜单、API、评测和产品文档中的主线命名必须与决策记录一致。
- 删除、数据迁移、主线切换和真实发布遵守统一权限边界。

## 验证要求

- 改动后按风险选择验证，不要只说“理论上可用”。
- 涉及登录、权限、API client、mock/real 边界、Terminal、AI Gateway 的改动，至少跑对应单测或手动验证核心流程。
- ErrorBoundary 测试会主动抛错，控制台出现测试错误日志不一定代表失败，以 Vitest 汇总为准。
- 常用验证命令见 `docs/03-开发计划/09-Git发布与项目治理/AGENTS补充参考信息.md`；执行前以当前 `package.json` 和实际脚本为准。

## 文档
- 产品资料目录 `01-市场调研/`、`02-产品设计/`、`03-开发计划/`、`04-测试数据/`、`05-市场营销/` 对产品决策有价值，不要自行批量整理、改名或删除。
