# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 协作约定

- 使用中文回复，面向产品经理沟通，尽量把技术状态翻译成产品/交付影响。
- 用户习惯 vibe coding：默认主动推进、边做边解释；遇到关键取舍时给出清晰建议。
- 不得自行批量删除文件；尤其当前仓库有大量文档、原型、子包和未提交改动，任何清理类动作都必须先确认。
- 不要回滚用户已有改动；工作区可能是脏的，先读现状，再在最小范围内修改。

## 常用命令

所有根项目命令在仓库根目录执行：

```bash
npm run dev           # 启动管理端 Vite 开发服务器，默认 http://localhost:5173
npm run build         # 生产构建
npm run test          # Vitest 单元测试（65 个，强制 mock 模式）
npm run test:watch    # Vitest 监听模式
npm run test:coverage # 覆盖率报告（text + html）
npm run test:e2e      # Playwright E2E（5 个）
npm run lint          # ESLint 检查 src/
npm run format        # Prettier 格式化 src/
npx vitest run src/test/api.test.ts   # 单个测试文件

npm run dev:full      # 并行启动 api + web（concurrently）
npm run dev:api       # 启动 packages/server-v2 开发模式
npm run start:api     # 启动 packages/server-v2 生产模式
npm run check:api     # 构建检查 packages/server-v2

npm run db:seed:promotion-assets:verify # 校验权益资产种子数据是否完整
npm run db:studio:v2       # Prisma Studio 可视化
```

后端主线 `packages/server-v2`：

```bash
cd packages/server-v2
npm run dev           # NestJS --watch 热重载
npx tsc              # 编译（不要用 nest build，DTO 子目录有问题）
node dist/main.js    # 启动，端口 8080
npm run lint
npm run test
npm run test:e2e

npm run db:generate  # npx prisma generate
npm run db:migrate   # npx prisma migrate dev
npm run db:seed      # npx prisma db seed
npm run db:studio    # npx prisma studio
```

智能终端 `packages/Ami-Aura-Lite-Kiosk`：

```bash
cd "packages/Ami-Aura-Lite-Kiosk"
npm run dev           # Vite 开发服务器 http://127.0.0.1:5175
npm run build         # tsc --noEmit && vite build
npm run typecheck     # tsc --noEmit
```

移动/助手端 `packages/app`：

```bash
cd packages/app
npm run dev
npm run build
npm run preview
```

**默认登录账号**：用户名 `admin`，密码 `11111111`（超级管理员，拥有 `['*']` 权限）。

## 项目结构

```
src/                          # 管理端主应用（React 18 + Vite）
packages/server-v2/           # NestJS 11 主线后端 + AI Gateway，端口 8080
packages/Ami-Aura-Lite-Kiosk/  # 意图驱动智能终端，端口 5175
packages/app/                 # 移动/AI 助手端
packages/marketing-h5/        # 营销 H5 落地页
docs/                         # API 契约、终端接口、生产计划等文档
e2e/                          # Playwright 用例
01-市场调研/ ... 05-市场营销/  # 产品、市场、开发、测试资料目录（勿随意改动）
```

`packages/Ami-Aura-Lite-Kiosk/` 是当前 Ami Aura Lite 终端主线，其他终端包已退役。

## 架构说明

### 管理端（`src/`）

React 18.3 + TypeScript + Vite 6.3.5，路径别名 `@` → `./src`。

**技术栈**：Tailwind CSS v4（CSS-based 配置，无 `tailwind.config.js`）+ MUI 7 共存；shadcn/ui 风格组件（Radix UI + CVA + tailwind-merge）；Zustand 5 状态管理；react-hook-form + zodResolver + Zod v4 表单校验；react-router v7（`createBrowserRouter`）；Axios 1.x；Recharts 2；Tiptap 3 富文本；motion 动画；xlsx 导入导出；Sonner 通知；Playwright E2E。

**路由**：集中在 `src/app/routes.tsx`（非文件系统路由）。公开路由 `/login`、`/register`；受保护路由全部嵌套在 `ProtectedLayout = AuthGuard > Layout` 下，每个子路由用 `PermissionGuard` 包裹。

**API 层**：

```
src/api/real/<module>.ts   # 真实 HTTP 调用（当前主线）
src/api/<module>.ts        # 门面文件，直接导出 real 实现
src/api/mock/              # 历史 mock，可做演示 fixture；新业务不要求双写
src/api/mode.ts            # 固定 real，VITE_API_MODE 不再控制运行时
```

新增业务、页面联调或接口补齐必须走 `server-v2` + `src/api/real/*` 主线，不再采用本地 mock 的方式补项目能力或绕过后端实现。`src/api/mock/*` 仅保留给单测、离线样例或历史结构对照。

`src/api/client.ts` 关键行为：
- `baseURL = VITE_API_BASE_URL || '/api'`，Vite dev server 将 `/api` 代理到 `http://localhost:8080`
- 请求自动附加 `Authorization: Bearer <token>` 和 `X-Store-Id`
- 响应拦截器 `return response.data`（调用方直接拿业务数据，不要写 `.data.data`）
- 401 清 token 并跳转 `/login`
- 错误统一为 `{ message, code?, status?, details? }`，挂到 `error.payload`

分页响应格式：`{ items: T[], total?, page?, pageSize? }`，兼容旧字段 `data`，新代码用 `items`。

**权限系统**（三层）：路由 `PermissionGuard` → 菜单 `MENU_ITEMS.permission` → Hook `usePermission`

- `src/config/permissions.ts`：`PERMISSION_CATALOG`、`ROLE_PERMISSIONS`、`LEGACY_PERMISSION_MAP`、`normalizePermissionCode()`
- 权限码格式：`平台:模块:动作`，如 `core:customer:view`、`terminal:service:start`
- `super_admin` 拥有 `['*']`；旧权限码通过 `LEGACY_PERMISSION_MAP` 自动兼容
- `src/stores/authStore.ts`：token（localStorage 持久化）、user（刷新后用 `loadUserInfo()` 重新加载，含 `permissions`）

**Store**：`authStore`（认证/用户/权限）、`storeStore`（当前门店列表）、`themeStore`（主题持久化）

**通用 Hook**：`usePagination`（服务端分页状态）、`usePermission(code)`（权限判断）

**表单模式**：react-hook-form + zodResolver，Schema 集中在 `src/schemas/`。成功 → 关闭弹窗 + `toast.success()` + 刷新列表；失败 → 保留弹窗并展示错误。

**样式**：入口 `src/styles/index.css` → `tailwind.css + theme.css + fonts.css + tiptap.css`；组件变体使用 CVA + tailwind-merge；MUI 与 Tailwind 共存时延续该页面已有风格。

### 后端（`packages/server-v2/`）

NestJS 11 + Prisma 7 + PostgreSQL（Supabase），JWT 认证（access 15m + refresh 7d），Swagger 文档 `/docs`，端口 8080，CSRF 中间件全局生效。

**模块清单**（`app.module.ts`）：`Auth`、`Users`、`Roles`、`Stores`、`Customers`、`Products`、`Orders`、`Cards`、`Beauticians`、`Projects`、`Inventory`、`Scheduling`、`Reservations`、`Marketing`、`MarketingPages`、`Ai`、`Terminal`、`Dashboard`、`Bom`、`Health`、`OperationProfit`（含 `OperationCosts` 子控制器）、`Agent`（含 `business-task` 编译器和 `capabilities` 注册表）、`SemanticQuery`、`SemanticSql`。

**Prisma 7 注意事项**：
- `schema.prisma` 的 datasource 只有 `provider`，不含 `url`
- 数据库连接通过 `prisma.config.ts`（`defineConfig({ datasource: { url } })`）注入
- PrismaService 使用 `@prisma/adapter-pg` 构造
- 编译用 `npx tsc`（不要用 `nest build`，DTO 子目录有问题）

**AI Gateway**（`packages/server-v2/src/ai`）：所有 AI 调用统一走此模块，前端和终端均不保存模型 Key。移动/助手端通过 Agent Gateway 或 `/api/ai/*` 接入，不再保留旧 `/v1/messages` 兼容入口。

### Ami Aura Lite Kiosk（`packages/Ami-Aura-Lite-Kiosk/`）

意图驱动的角色化智能终端，端口 5175。终端应用与管理端共享部分类型，通过相对路径跨包引用 `../../../../src/types/` 和 `../../../../src/config/aura`。

**核心架构**：

```
AppContent.tsx          # 顶层容器：会话状态、消息列表、意图调度
  ├── intent/           # 意图解析层
  │   ├── intentRouter.ts      # 优先规则解析，fallback AI 解析
  │   ├── ruleIntentParser.ts  # 关键词/规则匹配
  │   ├── aiIntentParser.ts    # LLM fallback 意图解析
  │   ├── commandRegistry.ts   # 角色可用动作注册表
  │   └── intentTypes.ts       # AuraResolvedIntent、AuraIntentName 等类型
  ├── microApps/        # 业务执行层
  │   ├── runMicroApp.ts       # 按 action 分发到各业务服务
  │   └── microAppTypes.ts     # AuraPayload（各 kind 的 union type）
  ├── services/
  │   └── auraCoreService.ts   # 所有终端 API 调用（直接调用 src/api）
  └── components/       # 卡片式 UI（每个场景一张 FlowCard）
```

**意图流程**：用户输入（SmartCommandBar）→ `resolveCommandIntent()`（规则优先 → AI fallback）→ `runMicroAppIntent(intent)`（按 action 分发）→ 返回 `{ messages, aiSummary }`（渲染到消息流）。

**角色系统**：`AuraRole`（manager/reception/beautician 等），角色决定可用意图和快捷操作，权限定义在 `src/config/aura.ts`（`AURA_ROLE_PERMISSIONS`、`AURA_ROLE_DATA_SCOPES`）。

**业务场景**（`MessageType`）：`dashboard`（角色仪表盘）、`cardVerification`（次卡核销）、`cashier`（收银）、`cardOpening`（开卡）、`registration`（建档）、`recharge`（充值）、`automation`（营销自动化草稿）、`automationSummary`（今日执行摘要）、`ai`（AI 问答）。

### 经营利润模块（`src/app/pages/operation-profit/`）

当前已实现页面（均有对应后端接口）：

| 页面文件 | 路由 | 权限码 |
|---|---|---|
| `OperationProfitOverview.tsx` | `/operation-profit/overview` | `core:operation-profit:view` |
| `ProductMarginAnalysis.tsx` | `/operation-profit/product-margins` | `core:product-margin:view` |
| `ProjectMarginAnalysis.tsx` | `/operation-profit/project-margins` | `core:project-margin:view` |
| `PrepaidLiabilityAnalysis.tsx` | `/operation-profit/prepaid-liabilities` | `core:prepaid-liability:view` |
| `BeauticianPerformance.tsx` | `/operation-profit/beautician-performance` | `core:beautician-performance:view` |
| `OperationCostSettings.tsx` | `/operation-profit/costs` | `core:operation-cost:view` |

**次卡履约**（路由 `/operation-profit/card-liabilities`）菜单已上线，页面实现尚缺。

**共享工具函数** 在 `utils.tsx`（`money`, `compactMoney`, `missingReasonLabels`, `DateRangeFilters`, `LoadingBlock`, `EmptyBlock`, `StatusBadge`, `PageHeader` 等）。

后端对应：`packages/server-v2/src/operation-profit/`，包含 `OperationProfitService`（1300+ 行）和 `OperationCostsService`，API 前端入口 `src/api/real/operationProfit.ts`。

### Agent 模块（`packages/server-v2/src/agent/`）

六大角色 Agent 基础框架已搭建，包含：
- `AgentOrchestratorService` - 多步骤任务编排
- `AgentPlannerService` - 任务规划
- `AgentPolicyService` - 策略执行
- `BusinessTaskCompilerService` + `BusinessTaskLlmCompilerService` - 业务任务编译
- `AgentCapabilityCandidateService` - 能力候选匹配
- `AgentFieldScopeSanitizerService` - 字段权限过滤
- `AgentResponseSafetyService` - 响应安全检查
- `AgentEvalService` + `agent-eval.cases.ts` - 能力评测

终端应用（`packages/Ami-Aura-Lite-Kiosk`）已具备登录页，处于 `codex/amiagent` 分支。

## 关键约定

- 所有路由集中在 `src/app/routes.tsx`，不要分散到其他文件。
- API 以 `server-v2` + `src/api/real/*` 为主线；不要默认要求 mock/real 双写。
- 不再采用本地 mock 的方式补齐新增业务；mock 仅保留给单测、离线样例或历史结构对照。
- 权限码保持新旧兼容，不要删除 `LEGACY_PERMISSION_MAP` 中的映射。
- 不要移除 Vite 中的 React 插件和 Tailwind 插件（Figma Make 相关导入依赖）。
- `assetsInclude` 不能包含 `.css`、`.ts`、`.tsx`。
- 涉及登录、权限、API client、Terminal、AI Gateway 的改动，至少跑对应单测或手动验证核心流程。
- 不要在未确认的情况下修改或清理 `dist/`、`outputs/`、历史原型目录、文档目录。

## 代码风格

- Prettier：分号、单引号、尾逗号、120 字符宽度、2 空格缩进。
- ESLint Flat config：`no-console` 警告（允许 `warn`/`error`）；`@typescript-eslint/no-unused-vars` 警告（`_` 前缀忽略）；react-hooks 规则严格。

## 测试

- Vitest 4 + jsdom + Testing Library；`globals: true`；`src/test/setup.ts` 初始化。
- 根项目 `npm run test` 强制 `VITE_API_MODE=mock`，避免本地 `.env real` 干扰单测。
- `packages/server-v2` 使用 Jest 单元测试 + E2E。
- ErrorBoundary 测试会主动抛错，控制台出现错误日志不代表用例失败，以 Vitest 汇总为准。

## 参考文档

- `docs/api-contract.md`
- `docs/terminal-api.md`
- `docs/marketing-trigger-rules-requirements.md`
- `docs/03-开发计划/production-plan.md`
- `docs/02-产品设计/Ami_Agent_新一代美业门店运营智能体产品需求文档.md`（Agent 六角色产品需求）
- `docs/02-产品设计/Ami_Agent_六大角色Agent详细开发计划.md`（Agent 开发计划）
- `docs/02-产品设计/财务管理-经营利润主要数据来源断点详细改造方案.md`（经营利润数据改造）
- `docs/02-产品设计/财务管理-提成规则统一配置改造方案.md`（提成规则改造）

## 部署

- `Dockerfile.app`：管理端静态构建 + serve，端口 8080
- `packages/server-v2/Dockerfile` + `railway.toml`
- `docker-compose.yml`、`vercel.json`、`nixpacks.toml`
