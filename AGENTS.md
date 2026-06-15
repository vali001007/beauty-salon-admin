# AGENTS.md

This file provides guidance to Codex / coding agents when working in this repository.

## 协作约定

- 使用中文回复，面向产品经理沟通，尽量把技术状态翻译成产品/交付影响。
- 用户习惯 vibe coding：默认主动推进、边做边解释；遇到关键取舍时给出清晰建议。
- 不得自行批量删除文件；尤其当前仓库有大量文档、原型、子包和未提交改动，任何清理类动作都必须先确认。
- 不要回滚用户已有改动；工作区可能是脏的，先读现状，再在最小范围内修改。
- 修改文件使用 `apply_patch`；查找优先用 `rg` / `rg --files`。
- 本项目在 Windows 路径下开发，默认 shell 是 PowerShell。不要假设 bash 可用；环境变量可用 `$env:NAME="value"`。

## 当前状态快照

截至 2026-06-10，本仓库处在较大的集成分支状态：

- 当前分支：`codex/ami-aura-lite-kiosk`，终端主线为 `packages/Ami-Aura-Lite-Kiosk`
- 主应用 `npm run build` 已通过。
- `npm run check:api` 指向 `packages/server-v2` 构建检查。
- `npm run test` 已通过：65/65 通过。Vitest 默认强制 `VITE_API_MODE=mock`，避免本地 `.env real` 干扰单测。
- `npm run test:e2e` 已通过：5/5 通过，登录成功断言以实际 `/dashboard` 为准。
- `npx tsc --noEmit -p tsconfig.json`、`npm run lint` 已通过。
- `packages/server-v2` 的 `npm run build`、`npm run test`、`npm run lint` 已通过；lint 仍有少量未使用变量 warning，不阻塞。
- `packages/Ami-Aura-Lite-Kiosk npm run build` 是当前主线终端构建；5175 端口用于 Ami Aura Lite 智能终端。
- 根项目已提供 `dev:marketing-h5`、`build:marketing-h5`、`preview:marketing-h5`，对应 `packages/marketing-h5`；开发端口默认 5176。
- 构建仍存在大 chunk 警告，主要是客户健康档案、消耗记录等数据/页面包体偏大，不阻塞构建，但后续可优化懒加载和拆包。
- 根目录有若干中文文档从单文件迁移到 `01-市场调研/`、`02-产品设计/`、`03-开发计划/`、`04-测试数据/`、`05-市场营销/` 等目录的迹象。不要把这些当作可随手清理的废文件。

## 常用命令

### 本地运行

本项目在 Windows + PowerShell 环境下开发时，优先使用 `npm.cmd`，避免 PowerShell 执行策略拦截 `npm.ps1`。

管理端：

```powershell
npm.cmd run dev -- --host 127.0.0.1 --port 5173
```

访问地址：

```text
http://127.0.0.1:5173
```

后端 API：

```powershell
npm.cmd run dev:api
```

默认 API 地址：

```text
http://localhost:8080/api
http://localhost:8080/docs
```

Ami Aura Lite 智能终端：

```powershell
Set-Location "packages/Ami-Aura-Lite-Kiosk"
npm.cmd run dev -- --host 127.0.0.1 --port 5175
```

访问地址：

```text
http://127.0.0.1:5175
```

Ami Glow 客户服务小程序：

```powershell
Set-Location "packages/Ami-Glow-MiniApp"
npm.cmd install
npm.cmd run typecheck
```

看到下面这种输出且没有报错，表示 TypeScript 检查已通过；它不会启动服务，也不会输出访问地址：

```text
> ami-glow-miniapp@0.1.0 typecheck
> tsc --noEmit -p tsconfig.json
```

本地预览方式：

1. 安装并打开微信开发者工具。
2. 在启动页选择“小程序”，然后选择“导入项目”。如果已经在工具内，可从项目列表或菜单进入“导入项目”。
3. 项目目录选择：

```text
D:\AI coding\beauty-salon-admin\packages\Ami-Glow-MiniApp
```

4. 不要选择里面的 `miniprogram` 子目录；`project.config.json` 已配置 `miniprogramRoot: "miniprogram/"`，工具会自动识别小程序源码目录。
5. AppID 使用当前配置里的 `touristappid`，或在没有正式小程序 AppID 时选择“测试号/无 AppID”模式；有正式 AppID 后再替换为真实 AppID。
6. 项目名称填写 `Ami-Glow-MiniApp`，云开发不启用。
7. 点击“导入/确定”后，进入开发者工具主界面，点击顶部“编译”。
8. 左侧模拟器能看到 Ami Glow 页面即表示本地预览成功；如果需要联调真实接口，先在仓库根目录执行 `npm.cmd run dev:api` 启动后端 API。

常见处理：

- 如果提示域名、HTTPS 或证书校验问题：在微信开发者工具“详情/本地设置”里勾选不校验合法域名相关选项，仅用于本地调试。
- 如果导入后找不到页面：确认导入的是 `packages/Ami-Glow-MiniApp`，不是仓库根目录，也不是 `miniprogram` 子目录。
- 如果模拟器空白并报 `module 'components/.../index.js' is not defined`：确认 `project.config.json` 里的 `setting.useCompilerPlugins` 包含 `typescript`，并在微信开发者工具里重新编译；必要时关闭并重新打开项目，让工具重新读取配置。
- 如果只是看到 `tsc --noEmit -p tsconfig.json` 输出且无报错：这是 `typecheck` 检查通过，不代表已经打开预览，需要继续用微信开发者工具导入项目。

说明：Ami Glow 是原生微信小程序工程，当前没有 Vite/Web dev server；`npm.cmd run typecheck` 只用于本地代码检查，实际页面预览在微信开发者工具里编译运行。

常用本地组合：先启动后端 API，再启动管理端；管理端默认通过 Vite `/api` 代理访问 `http://localhost:8080`。Ami Glow 小程序需要联调接口时，也先启动后端 API。

所有根项目命令在仓库根目录执行：

```bash
npm run dev           # 启动管理端 Vite 开发服务器，默认 http://localhost:5173
npm run build         # 生产构建
npm run test          # Vitest 单元测试
npm run test:watch    # Vitest 监听模式
npm run test:coverage # 覆盖率报告
npm run test:e2e      # Playwright E2E
npm run lint          # ESLint 检查 src/
npm run format        # Prettier 格式化 src/

npm run dev:api       # 启动 packages/server-v2 开发模式
npm run start:api     # 启动 packages/server-v2 生产模式
npm run check:api     # 构建检查 packages/server-v2
npm run dev:marketing-h5     # 启动营销 H5，默认 http://127.0.0.1:5176
npm run build:marketing-h5   # 构建营销 H5
npm run preview:marketing-h5 # 预览营销 H5，默认 http://127.0.0.1:4176

npx vitest run src/test/api.test.ts
npx vitest run src/test/auth-store.test.ts
```

后端主线 `packages/server-v2`：

```bash
cd packages/server-v2
npm run dev           # NestJS watch
npm run build         # nest build
npm run start:prod    # node dist/main
npm run lint
npm run test
npm run test:e2e

npm run db:generate
npm run db:migrate
npm run db:migrate:prod
npm run db:seed
npm run db:studio
```

智能终端主线 `packages/Ami-Aura-Lite-Kiosk`：

```bash
cd "packages/Ami-Aura-Lite-Kiosk"
npm run dev           # http://127.0.0.1:5175
npm run build         # tsc --noEmit && vite build
```

Ami Glow 客户服务小程序 `packages/Ami-Glow-MiniApp`：

```bash
cd "packages/Ami-Glow-MiniApp"
npm run typecheck     # TypeScript 检查；无报错即通过，不会启动预览服务
# 本地预览：用微信开发者工具打开 packages/Ami-Glow-MiniApp
```

移动/助手端 `packages/app`：

```bash
cd packages/app
npm run dev
npm run build
npm run preview
```

默认登录账号：

- 用户名：`admin`
- 密码：`11111111`
- 角色：超级管理员，拥有 `['*']` 权限

## 项目结构

```text
src/                         # 管理端主应用
packages/server-v2           # NestJS + Prisma 主线后端、AI Gateway、旧 /v1/messages 兼容入口
packages/Ami-Aura-Lite-Kiosk # Ami Aura Lite 智能终端 kiosk 主线
packages/Ami-Glow-MiniApp    # Ami Glow 客户服务小程序
packages/marketing-h5        # 营销 H5 子应用
packages/app                 # 移动/AI 助手端应用
docs/                        # API 契约、终端接口、生产计划等文档
e2e/                         # Playwright 用例
outputs/                     # 生成产物/演示输出，谨慎改动
01-市场调研/ ... 05-市场营销/ # 产品、市场、开发、测试资料目录
```

`packages/Ami-Aura-Lite-Kiosk/` 是当前 Ami Aura Lite 终端主线；废弃轻量终端包已退役，不再作为开发目标。

## 技术栈

| 类别 | 技术 |
| --- | --- |
| 管理端框架 | React 18.3 + TypeScript + Vite 6.3.5 |
| 样式 | Tailwind CSS v4（`@tailwindcss/vite`，CSS-based 配置）+ MUI 7 共存 |
| UI | shadcn/ui 风格（Radix UI + CVA + tailwind-merge）+ lucide-react |
| 状态管理 | Zustand 5 |
| 表单校验 | react-hook-form + zodResolver + Zod v4 |
| HTTP | Axios 1.x |
| 路由 | react-router v7 `createBrowserRouter` |
| 图表 | Recharts 2 |
| 导入导出 | xlsx / SheetJS |
| 通知 | Sonner |
| 富文本 | Tiptap 3 |
| 动画 | motion |
| 拖拽 | react-dnd + react-dnd-html5-backend |
| 后端 v2 | NestJS 11 + Prisma 7 + PostgreSQL |

路径别名：

- 管理端 `@` 指向 `./src`
- Vite 与 Vitest 均已配置该别名

## 代码风格

- Prettier：分号、单引号、尾逗号、120 字符宽度、2 空格缩进。
- ESLint：Flat config，TypeScript + react-hooks。
- `no-console` 为 warning，允许 `console.warn` / `console.error`。
- `@typescript-eslint/no-unused-vars` 为 warning，`_` 前缀忽略。
- React Hooks 规则必须遵守。
- 不要移除 Vite 中的 React 插件和 Tailwind 插件，Figma Make 相关导入依赖它们。
- `assetsInclude` 不要加入 `.css`、`.ts`、`.tsx`。

## API 层约定

管理端运行时 API 当前统一走 Real 主线，不再采用 `VITE_API_MODE` 在 mock/real 之间动态切换：

```text
src/api/real/<module>.ts  # 真实 HTTP 实现
src/api/<module>.ts       # 门面文件，直接导出 real 实现
src/api/mock/             # 历史 mock 样例与轻量 fixture
```

当前约定：

- `src/api/mode.ts` 固定为 `real`，`VITE_API_MODE` 不再控制管理端运行时 API 模式。
- `src/api/mock/fixtures.ts` 只保留少量字段样例；本地大样本 JSON 已退役，不再作为页面或 `server-v2` seed 数据来源。
- `src/api/mock/*.ts` 作为历史测试/离线样例暂时保留，方便对照字段结构；新增业务不要求同步实现一份 mock API。
- 新增业务、页面联调或接口补齐必须走 `server-v2` + `src/api/real/*` 主线，不再采用本地 mock 的方式补项目能力或绕过后端实现。

新增 API 模块时优先顺序：

- 在 `packages/server-v2` 实现 schema、service、controller。
- 在 `src/api/real/*` 实现前端 HTTP 调用。
- 在 `src/api/*.ts` 门面直接导出 real 实现。
- 在 `src/api/index.ts` 导出。
- 保持分页、错误、响应解包格式一致。
- 只有单测或离线样例明确需要固定样例数据时，才补充轻量 fixture；不要再新增本地大样本 JSON。

当前 API 模块包括：

`product`、`inventory`、`customer`、`order`、`auth`、`scheduling`、`store`、`role`、`marketing`、`bom`、`beautician`、`project`、`projectType`、`card`、`user`、`beauticianLevel`、`terminal`、`recommendation`、`ai`。

`src/api/client.ts` 约定：

- `baseURL = VITE_API_BASE_URL || '/api'`
- 请求自动附加 `Authorization: Bearer <token>` 与 `X-Store-Id`
- 响应拦截器返回 `response.data`，调用方拿到的是业务数据
- 401 清 token 并跳转 `/login`
- 错误统一为 `{ message, code?, status?, details? }`，挂到 `error.payload`

分页响应优先使用：

```ts
{ items: T[], total?: number, page?: number, pageSize?: number }
```

兼容旧字段 `data`，但新代码优先写 `items`。

## 后端与代理

`packages/server-v2` 是主线数据库后端：

- NestJS 11 + TypeScript
- Prisma 7，使用 driver adapter 模式
- PostgreSQL / Supabase 方向
- JWT 认证，access token + refresh token
- Swagger 文档默认 `/docs`
- 模块包括 auth、users、roles、stores、customers、products、inventory、orders、projects、reservations、scheduling、beauticians、cards、marketing、terminal、ai 等

Prisma 7 注意事项：

- `schema.prisma` 的 datasource 通常只保留 `provider`。
- 数据库 URL 通过 `prisma.config.ts` / 环境变量注入。
- PrismaService 使用 `@prisma/adapter-pg`。

旧轻量网关目录已退役，不再作为运行、部署或新增开发目标。AI Gateway 已收口到 `packages/server-v2/src/ai`：

- 根目录 `npm run dev:api`、`npm run start:api` 指向 `packages/server-v2`。
- 管理端和终端不保存大模型 Key，只通过 `server-v2` 调用 AI Gateway。
- 旧 `/v1/messages` 兼容入口由 `server-v2` 公开保留，避免破坏现有移动/助手端调用。

本地 real 模式常见组合：

```bash
VITE_API_MODE=real
VITE_API_BASE_URL=/api
```

Vite dev server 已把 `/api` 代理到 `http://localhost:8080`。

## 认证与权限

三层权限管控：

```text
路由 PermissionGuard -> 菜单 MENU_ITEMS.permission -> Hook usePermission
```

关键文件：

- `src/stores/authStore.ts`：token、user、login、logout、loadUserInfo、setAuth。
- `src/app/components/AuthGuard.tsx`：保护登录态，刷新后自动加载用户信息。
- `src/app/components/PermissionGuard.tsx`：保护单个路由，无权限时渲染 `ForbiddenPage`。
- `src/config/permissions.ts`：权限目录、角色权限、旧权限码兼容、高级权限维度。

权限码格式：

```text
平台:模块:动作
```

示例：

- `core:customer:view`
- `core:marketing:create`
- `terminal:service:start`

`super_admin` 拥有 `['*']`。旧权限码通过 `LEGACY_PERMISSION_MAP` / `normalizePermissionCode()` 兼容。

## 路由

集中定义在 `src/app/routes.tsx`，不是文件系统路由。

公开路由：

- `/login`
- `/register`

受保护路由嵌套在 `ProtectedLayout = AuthGuard > Layout` 下：

- 仪表盘：`/`、`/dashboard`
- 客户管理：`customers/data`、`customers/profile`、`customers/script`
- 智能营销：`customer-marketing/activity-management`、`activity-effect/:id`、`intelligent-recommendation`、`strategy-templates`、`effect-analysis`
- 门店管理：`stores/project-types`、`projects`、`beauticians`、`beautician-levels`、`scheduling`、`reservations`
- 商品管理：`goods/types`、`goods/products`、`goods/cards`
- 订单管理：`orders/products`、`orders/card-orders`、`orders/card-usage`
- 库存管理：`inventory/products`、`inventory/stock`、`inventory/purchase`、`inventory/expiry`、`inventory/transfer`、`inventory/consumption`
- 系统设置：`system/users`、`system/roles`、`system/permissions`、`system/stores`

路由错误页使用 `RouteErrorPage`，未匹配路由显示 404。

## Store 与 Hook

状态 Store：

- `authStore`：认证、用户、权限。
- `storeStore`：当前门店与门店列表。
- `themeStore`：主题切换和持久化。

通用 Hook：

- `src/hooks/usePagination.ts`：服务端分页状态。
- `src/hooks/usePermission.ts`：判断当前用户是否有指定权限。

## UI 与样式

- 基础组件在 `src/app/components/ui/`，采用 shadcn/ui 风格。
- `src/app/components/UI.tsx` 聚合导出常用组件。
- `src/app/components/Layout.tsx` 定义侧边栏、顶栏、菜单树和权限显隐。
- `ImportDialog` 用于通用导入流程：文件选择 -> 解析 -> 预览 -> 确认。
- `PasswordConfirmDialog` 用于危险操作二次确认。
- `StoreSwitcher` 用于门店切换。
- MUI 与 shadcn/ui 共存，改页面时优先延续该页面已有风格。

样式入口：

```text
src/styles/index.css -> tailwind.css + theme.css + fonts.css + tiptap.css
```

Tailwind v4 使用 CSS-based 配置，没有 `tailwind.config.js`。

## 表单模式

页面表单通常使用 react-hook-form + zodResolver。

Schema 集中在：

```text
src/schemas/
```

标准提交流程：

1. 调用 API。
2. 成功：关闭弹窗、`toast.success()`、刷新列表。
3. 失败：保留弹窗并展示错误信息。

## 测试

测试栈：

- Vitest 4 + jsdom
- Testing Library + user-event
- Playwright E2E
- Jest 用于 `packages/server-v2`

测试文件：

```text
src/**/*.{test,spec}.{ts,tsx}
e2e/*.spec.ts
packages/server-v2/**/*.spec.ts
```

当前重要提醒：

- 根项目 `npm run test` 当前已通过，测试环境会固定 mock 模式。
- 涉及 API mock/auth store 异步流程时，仍建议优先跑 `npx vitest run src/test/api.test.ts` 与 `npx vitest run src/test/auth-store.test.ts`。
- ErrorBoundary 测试会主动抛错，控制台出现测试错误日志不一定代表该用例失败，要以 Vitest 汇总为准。

## 终端与 AI

Ami Aura Lite / Terminal 相关文件：

- 管理端 API：`src/api/terminal.ts`、`src/api/mock/terminal.ts`、`src/api/real/terminal.ts`
- 终端应用：`packages/Ami-Aura-Lite-Kiosk`
- 后端 v2：`packages/server-v2/src/terminal`
- 文档：`docs/terminal-api.md`

终端核心场景：

- 设备登录与门店绑定
- 顾客识别 / 快速建档
- 预约与今日任务
- 服务任务
- 次卡核销
- 收银结账
- 皮肤检测
- 推荐闭环

AI 相关文件：

- 管理端 API：`src/api/ai.ts`、`src/api/mock/ai.ts`、`src/api/real/ai.ts`
- 后端 v2：`packages/server-v2/src/ai`
- 旧 Claude 兼容入口：`packages/server-v2/src/ai/legacy-messages.controller.ts`
- 移动/助手端：`packages/app/src/api/claude.ts`

AI 约束：

- 前端不保存模型 Key。
- mock 模式必须返回稳定结构，便于演示和测试。
- real 模式经服务端转发，错误格式保持统一。

## 文档

优先参考：

- `docs/api-contract.md`
- `docs/terminal-api.md`
- `docs/marketing-trigger-rules-requirements.md`
- `docs/production-plan.md`

产品资料目录：

- `01-市场调研/`
- `02-产品设计/`
- `03-开发计划/`
- `04-测试数据/`
- `05-市场营销/`

这些目录对产品决策有价值，不要自行批量整理、改名或删除。

## 部署

已有部署相关文件：

- `Dockerfile.app`：管理端静态构建 + `serve`，端口 8080。
- `docker-compose.yml`
- `vercel.json`
- `nixpacks.toml`
- `packages/server-v2/Dockerfile`
- `packages/server-v2/railway.toml`

管理端 Docker 示例：

```bash
docker build -f Dockerfile.app -t ami-core-admin .
docker run --rm -p 8080:8080 ami-core-admin
```

## 关键约定

- API 以 `server-v2` + `src/api/real/*` 为主线；不要再默认要求 mock/real 双写，避免长期双维护。
- 不再采用本地 mock 的方式补齐新增业务；mock 仅保留给单测、离线样例或历史结构对照。
- 所有路由集中在 `src/app/routes.tsx`。
- 权限码要保持新旧兼容，不要随意删除 legacy 映射。
- API 调用方默认拿到已解包数据，不要重复 `.data.data`。
- 分页优先使用 `{ items }`，兼容 `{ data }`。
- 错误统一使用 `{ message, code?, status?, details? }`。
- 不要移除 React + Tailwind Vite 插件。
- 不要在未确认的情况下修改或清理 `dist/`、`outputs/`、历史原型目录、文档目录。
- 涉及登录、权限、API client、mock/real 切换、Terminal、AI Gateway 的改动，至少跑对应单测或手动验证核心流程。
