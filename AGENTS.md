# AGENTS.md

This file provides concise guidance to Codex / coding agents when working in this repository.

## 协作规则

- 遵守全局 AGENTS.md 的中文沟通、vibe coding、文档落盘、一次到位和禁止批量删除规则。
- 本仓库额外要求：工作区可能是脏的，先读现状，识别未提交改动和共享链路，再在当前任务范围内修改。
- 必要重构可以做，但需说明影响范围、风险和验证方式；阶段性完成时主动提醒用户是否需要提交、推送或发起 PR 审查。
- 功能实现不能只看“能用”，还要关注真实数据加载体验；页面、终端或接口若出现加载慢、空白等待、重复请求、首屏阻塞，应同步处理或记录风险。

## 开工预检

- 每个新任务先看 `git status --short --branch`，识别当前分支、未提交改动、未跟踪文件和共享链路风险。
- 若会碰到用户未提交改动或高风险共享链路，先提醒用户再改。
- 高风险区域包括：路由、权限、API client、Prisma schema/migration、全局状态、Kiosk 核心入口、跨包重构。

## 任务分级执行规则

- L0 轻量任务：只涉及问答、只读解释、文案微调、单文件小改、样式微调、无业务链路变化。可不做全链路排查；只需最小范围读取/修改，最终简短说明改了什么。若未改代码，不必跑测试。
- L1 常规任务：涉及一个页面、一个 API facade、一个表单、一个局部交互或一个明确 bug。需检查直接相关文件和调用方，按风险跑定向测试或构建，最终说明已验证和未验证项。
- L2 闭环任务：涉及营销、库存、订单、收银、终端、AI、权限、真实数据、跨前后端链路，或用户追问“是否打通/是否一样/是否完成”。必须按业务链路核对路由、组件、API、service、schema/数据表和真实数据，并做必要验证。
- L3 高风险任务：涉及 Prisma schema/migration、认证权限、API client、全局状态、发布/Git、批量数据、真实写库、跨包重构或删除/迁移文件。必须先说明范围、风险、验证方式；涉及真实写库、远端修改、推送、PR、自动提交前必须获得用户明确授权。
- 若用户明确要求“详细分析/完整验证/全部开发完成”，即使任务看似较小，也按更高等级执行。
- 若任务等级不确定，先按较低等级启动；一旦发现跨模块、真实数据或共享链路影响，立即升级执行等级并告知用户。

## AI Coding 对齐与完成标准

- 先区分任务类型：只读分析、文档/方案、代码实现、真实数据验证、Git/发布；用户只要文本、方案或清单时，不要擅自改文件。
- 用户需求先翻译成工程对象：路由/组件、API、service、schema/数据表、真实业务记录和验收口径。
- 不把“方案已写”“代码已改”“build 通过”“mock 正常”“脚本存在”误报为业务已完成；L1 及以上任务需说明代码、接口、页面、数据、验证分别到哪一步。
- 遇到“是否一样/是否打通/是否合并”，按任务分级核对对象边界；
- L2/L3 必须查清路由、组件、API、service、schema/数据表和真实数据，不按页面名、URL 或文案猜。
- 新增或调整 API 时，同步检查 `server-v2`、`src/api/real/*`、facade、导出、调用方、类型和必要测试，避免只改一端。
- 推送、PR、自动提交前必须获得用户明确授权；只读 verify 失败时，不要重复验证后宣称完成。
- L2/L3 闭环任务优先核对真实来源表和最新业务记录；构建通过不等于 typecheck、测试和真实 verify 都通过。
- 最终回复默认给简短验收摘要：已完成、已验证、未验证/风险、建议下一步。


## 核心命令

根项目常用：

```powershell
npm.cmd run dev -- --host 127.0.0.1 --port 5173
npm.cmd run build
npm.cmd run test
npm.cmd run lint
npm.cmd run check:api
npm.cmd run dev:api
```

子项目常用：

```powershell
Set-Location "packages/server-v2"; npm.cmd run test; npm.cmd run build
Set-Location "packages/Ami-Aura-Lite-Kiosk"; npm.cmd run build
Set-Location "packages/Ami-Glow-MiniApp"; npm.cmd run typecheck
```

更多运行、预览和部署细节见：`docs/03-开发计划/AGENTS补充参考信息.md`。

## 项目入口

- `src/`：管理端主应用。
- `packages/server-v2`：NestJS + Prisma 主线后端、AI Gateway。
- `packages/Ami-Aura-Lite-Kiosk`：Ami Aura Lite 智能终端主线。
- `packages/Ami-Glow-MiniApp`：Ami Glow 客户服务小程序。
- `packages/marketing-h5`：营销 H5 子应用。
- `packages/app`：移动/AI 助手端应用。
- `docs/`：API 契约、终端接口、生产计划、开发计划等文档。
- `outputs/` 与中文产品资料目录：谨慎改动，不要当作可清理废文件。

详细运行、预览和部署参考见：`docs/03-开发计划/AGENTS补充参考信息.md`。

## 技术与代码风格

- 管理端为 React + TypeScript + Vite；后端主线为 `packages/server-v2`，NestJS + Prisma + PostgreSQL。
- 管理端路径别名 `@` 指向 `./src`；改动时遵守现有 Prettier、ESLint 和 React Hooks 规则。
- MUI、Tailwind、shadcn/ui 共存，改页面时延续当前页面风格。
- 不要移除 Vite React/Tailwind 插件；`assetsInclude` 不要加入 `.css`、`.ts`、`.tsx`。

## API 与数据约定

- 管理端运行时 API 统一走 Real 主线：`server-v2` + `src/api/real/*`。
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
- AI 相关入口：`src/api/ai.ts`、`src/api/real/ai.ts`、`packages/server-v2/src/ai`、`packages/app/src/api/claude.ts`。
- 前端不保存模型 Key；管理端、终端、移动/助手端均应通过 `server-v2` 调用 AI Gateway。
- 移动/助手端应走 Agent Gateway 或 `/api/ai/*`，不要再接入旧 `/v1/messages`。

## 验证要求

- 改动后按风险选择验证，不要只说“理论上可用”。
- 涉及登录、权限、API client、mock/real 边界、Terminal、AI Gateway 的改动，至少跑对应单测或手动验证核心流程。
- 常用定向验证：

```powershell
npx.cmd vitest run src/test/api.test.ts
npx.cmd vitest run src/test/auth-store.test.ts
npm.cmd run check:api
npm.cmd run test:e2e:kiosk
```

- ErrorBoundary 测试会主动抛错，控制台出现测试错误日志不一定代表失败，以 Vitest 汇总为准。

## 文档

- 优先参考：`docs/api-contract.md`、`docs/terminal-api.md`、`docs/marketing-trigger-rules-requirements.md`、`docs/03-开发计划/production-plan.md`。
- 产品资料目录 `01-市场调研/`、`02-产品设计/`、`03-开发计划/`、`04-测试数据/`、`05-市场营销/` 对产品决策有价值，不要自行批量整理、改名或删除。
