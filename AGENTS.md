# AGENTS.md

This file provides concise guidance to Codex / coding agents when working in this repository.

## 协作规则

- 使用中文回复；面向产品经理沟通，把技术状态翻译成产品/交付影响。
- 用户习惯 vibe coding：默认主动推进、边做边解释；遇到关键取舍时给出清晰建议。
- 用户要求输出文档、方案或计划时，必须保存为本地文件，不要只在问答框回复。
- 执行任务必须一次到位：完成实现、必要验证和文档同步；如无法完成，明确说明原因和阻塞点。
- 不得自行批量删除文件；清理、迁移、删除 `dist/`、`outputs/`、历史原型目录、文档目录前必须先确认。
- 不要回滚用户已有改动；工作区可能是脏的，先读现状，再在最小范围内修改。
- 修改文件使用 `apply_patch`；查找优先用 `rg` / `rg --files`。
- 功能实现不能只看“能用”，还要关注真实数据加载体验；页面、终端或接口若出现加载慢、空白等待、重复请求、首屏阻塞，应同步处理或记录风险。

## 开工预检

- 每个新任务先看 `git status --short --branch`，确认当前分支、未提交改动和未跟踪文件。
- 将任务映射到文件、模块和业务链路；若会碰到未提交改动或共享核心链路，先提醒用户再改。
- 通常应串行处理的高风险区域：路由、权限、Prisma schema/migration、全局状态、共享 API/client、Kiosk 核心入口、大范围架构重构。
- 重点关注路径：
  - `src/app/routes.tsx`
  - `src/config/permissions.ts`
  - `src/api/client.ts`
  - `packages/server-v2/prisma/schema.prisma`
  - `packages/server-v2/prisma/migrations/*`
  - `packages/Ami-Aura-Lite-Kiosk/src/app/AppContent.tsx`
  - `packages/Ami-Aura-Lite-Kiosk/src/app/services/auraCoreService.ts`
  - `packages/Ami-Aura-Lite-Kiosk/src/app/microApps/runMicroApp.ts`

## AI Coding 对齐与完成标准

- 先区分任务类型：只读分析、文档/方案、代码实现、真实数据验证、Git/发布；用户只要文本、方案或清单时，不要擅自改文件。
- 用户需求先翻译成工程对象：路由/组件、API、service、schema/数据表、真实业务记录和验收口径。
- 不把“方案已写”“代码已改”“build 通过”“mock 正常”“脚本存在”误报为业务已完成；完成必须说明代码、接口、页面、数据、验证分别到哪一步。
- 遇到“是否一样/是否打通/是否合并”，必须按 `路由 -> 组件 -> API -> service -> schema/数据表 -> 真实数据` 核对，不按页面名、URL 或文案猜。
- 新增或调整 API 时，同步检查 `server-v2`、`src/api/real/*`、facade、导出、调用方、类型和必要测试，避免只改一端。
- 真实写库、远端修改、推送、PR、自动提交前必须获得用户明确授权；只读 verify 失败时，不要重复验证后宣称完成。
- 闭环任务优先核对真实来源表和最新业务记录；构建通过不等于 typecheck、测试和真实 verify 都通过。
- 最终回复默认给简短验收摘要：已完成、已验证、未验证/风险、建议下一步。

## Windows 与命令

- 本项目在 Windows 路径下开发，日常 Codex 编程优先使用 PowerShell 7：`pwsh`。
- 避免优先使用 Windows PowerShell 5.1：`powershell.exe`；除非必须兼容旧系统模块。
- 涉及中文搜索、中文输出、管道匹配时，优先使用 `pwsh` + UTF-8 环境。
- 搜索中文内容优先使用 `rg`，不要把 `Select-String` 作为第一选择。
- 在 PowerShell 下优先使用 `npm.cmd`，避免执行策略拦截 `npm.ps1`。
- 环境变量写法使用 PowerShell 格式：`$env:NAME="value"`。

## 核心命令

所有根项目命令默认在仓库根目录执行：

```powershell
npm.cmd run dev -- --host 127.0.0.1 --port 5173
npm.cmd run build
npm.cmd run test
npm.cmd run test:e2e
npm.cmd run lint

npm.cmd run dev:api
npm.cmd run check:api
npm.cmd run start:api

npm.cmd run dev:marketing-h5
npm.cmd run build:marketing-h5
npm.cmd run preview:marketing-h5
```

后端主线：

```powershell
Set-Location "packages/server-v2"
npm.cmd run dev
npm.cmd run build
npm.cmd run lint
npm.cmd run test
npm.cmd run db:generate
npm.cmd run db:migrate
npm.cmd run db:seed
```

Ami Aura Lite 智能终端：

```powershell
Set-Location "packages/Ami-Aura-Lite-Kiosk"
npm.cmd run dev -- --host 127.0.0.1 --port 5175
npm.cmd run build
```

Ami Glow 客户服务小程序：

```powershell
Set-Location "packages/Ami-Glow-MiniApp"
npm.cmd run typecheck
```

说明：Ami Glow 是原生微信小程序工程，没有 Vite/Web dev server；本地预览用微信开发者工具打开 `packages/Ami-Glow-MiniApp`。

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

- 管理端：React 18 + TypeScript + Vite 6，Tailwind CSS v4、MUI 7、shadcn/ui 风格组件共存。
- 后端：`packages/server-v2`，NestJS 11 + Prisma 7 + PostgreSQL。
- 路径别名：管理端 `@` 指向 `./src`，Vite 与 Vitest 均已配置。
- Prettier：分号、单引号、尾逗号、120 字符宽度、2 空格缩进。
- ESLint：Flat config，TypeScript + react-hooks；`no-console` 与未使用变量多为 warning。
- React Hooks 规则必须遵守。
- 不要移除 Vite 中的 React 插件和 Tailwind 插件；Figma Make 相关导入依赖它们。
- `assetsInclude` 不要加入 `.css`、`.ts`、`.tsx`。

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
- 权限三层管控：路由 `PermissionGuard` -> 菜单 `MENU_ITEMS.permission` -> `usePermission`。
- 权限码格式为 `平台:模块:动作`，如 `core:customer:view`；`super_admin` 拥有 `['*']`。
- 旧权限码通过 `LEGACY_PERMISSION_MAP` / `normalizePermissionCode()` 兼容，不要随意删除 legacy 映射。
- MUI 与 shadcn/ui 共存，改页面时优先延续该页面已有风格。
- 表单通常使用 react-hook-form + zodResolver，Schema 集中在 `src/schemas/`。
- 标准提交流程：调用 API -> 成功关闭弹窗并 `toast.success()`、刷新列表 -> 失败保留弹窗并展示错误。

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

- 优先参考：`docs/api-contract.md`、`docs/terminal-api.md`、`docs/marketing-trigger-rules-requirements.md`、`docs/production-plan.md`。
- 产品资料目录 `01-市场调研/`、`02-产品设计/`、`03-开发计划/`、`04-测试数据/`、`05-市场营销/` 对产品决策有价值，不要自行批量整理、改名或删除。
