# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 常用命令

所有命令在项目根目录下执行：

```bash
# ─── 前端主应用（根目录） ───
npm run dev          # 启动开发服务器 http://localhost:5173
npm run build        # 生产构建（Vite）
npm run test         # 运行测试一次（Vitest）
npm run test:watch   # 监听模式
npm run test:coverage # 覆盖率报告（text + html）
npm run lint         # ESLint 检查 src/
npm run format       # Prettier 格式化 src/
npx vitest run src/test/api.test.ts  # 运行单个测试文件

# ─── 后端 API（packages/server-v2，NestJS 11 + Prisma 7） ───
cd packages/server-v2
npx tsc              # 编译（不要用 nest build，DTO 子目录有问题）
node dist/main.js    # 启动（端口 8080）
npm run dev          # nest start --watch（开发热重载）
npm run lint         # ESLint
npm run test         # Jest 单元测试
npm run test:e2e     # 端到端测试

# ─── Prisma 数据库命令（在 packages/server-v2 目录下） ───
npx prisma migrate dev     # 运行迁移
npx prisma migrate deploy  # 生产环境部署迁移
npx prisma db seed         # 执行种子数据
npx prisma generate        # 重新生成客户端
npx prisma studio          # 可视化数据库管理

# ─── 智能终端 Kiosk（packages/Ami Aura Lite Kiosk Prototype） ───
cd "packages/Ami Aura Lite Kiosk Prototype"
npm run dev          # Vite 开发服务器 http://127.0.0.1:5175
npm run build        # tsc --noEmit && vite build
npm run preview      # 预览构建产物 http://127.0.0.1:4175

# ─── 移动端应用（packages/app） ───
cd packages/app
npm run dev          # Vite 开发服务器
npm run build        # vite build
npm run preview      # 预览构建产物
```

> **Windows PowerShell 注意**：不支持 `&&` 连接符，需分开执行或用 `;`。环境变量用 `$env:VAR="value"` 设置。

**默认登录账号**：用户名 `admin`，密码 `11111111`（超级管理员，拥有所有权限 `['*']`）。

## 架构说明

### 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | React 18.3 + TypeScript + Vite 6.3.5 |
| 样式 | Tailwind CSS v4（`@tailwindcss/vite` 插件，CSS-based 配置）+ MUI 7 共存 |
| UI 组件 | shadcn/ui 风格（Radix UI 原语 + CVA 0.7 + tailwind-merge 3.2）+ lucide-react 图标 |
| 状态管理 | Zustand 5 |
| 表单校验 | react-hook-form 7 + zodResolver + Zod v4 |
| HTTP | Axios 1.x（`src/api/client.ts`） |
| 路由 | react-router v7（`createBrowserRouter`） |
| 图表 | Recharts 2 |
| 导入导出 | xlsx (SheetJS) |
| 通知 | Sonner |
| 富文本 | Tiptap 3 |
| 动画 | motion (Framer Motion 继任者) |
| 拖拽 | react-dnd + react-dnd-html5-backend |
| 其他 | react-day-picker, embla-carousel, cmdk, vaul, input-otp, canvas-confetti, next-themes |

### 路径别名

`@` → `./src`（vite.config.ts 和 vitest.config.ts 均已配置）。

### 代码风格

- **Prettier**：分号、单引号、尾逗号、120 字符宽度、2 空格缩进
- **ESLint**：Flat config（`eslint.config.js`），TypeScript + react-hooks 插件
  - `no-console` 警告（允许 `warn`/`error`）
  - `no-unused-vars` 关闭，`@typescript-eslint/no-unused-vars` 警告（`_` 前缀忽略）
  - `react-hooks/rules-of-hooks` 错误，`exhaustive-deps` 警告

### API 层 — Mock/Real 切换机制

每个 API 模块由三个文件组成：

- `src/api/mock/<模块>.ts` — Mock 实现（含 `src/api/mock/data/` 种子数据）
- `src/api/real/<模块>.ts` — 真实 HTTP 调用
- `src/api/<模块>.ts` — 切换文件

切换文件根据 `import.meta.env.VITE_API_MODE` 选择实现：

```ts
const isReal = import.meta.env.VITE_API_MODE === 'real';
export const getProducts = isReal ? realGetProducts : mockGetProducts;
```

`.env` 默认 `VITE_API_MODE=mock`（当前已切换为 `real`）。新增 API 模块时，需同时创建 mock 和 real 两份文件，再创建切换文件并在 `src/api/index.ts` 导出。

`src/api/client.ts` — Axios 实例：
- `baseURL` = `VITE_API_BASE_URL || '/api'`，15s 超时
- 请求拦截器自动附加 `Authorization: Bearer <token>`（从 localStorage）和 `X-Store-Id`（从 `storeStore.getState()`）
- 响应拦截器直接 `return response.data`（调用方拿到的是解包后的数据）
- 401 时清除 token 并跳转 `/login`
- 错误统一格式化为 `{ message, code, status, details }`，挂载为 `error.payload`

**API 模块列表**：product, inventory, customer, order, auth, scheduling, store, role, marketing, bom, beautician, project, projectType, card, user, beauticianLevel, terminal, recommendation, ai。

### 认证与权限

**三层权限管控**：路由（PermissionGuard）→ 菜单（MENU_ITEMS.permission）→ Hook（usePermission）。

- `src/stores/authStore.ts` — `token`（localStorage 持久化）、`user`（刷新后丢失，`loadUserInfo()` 重新加载，含 `permissions` 和 `deniedPermissions`）、`isAuthenticated`；login/logout 时自动调用 `normalizePermissions()`
- `src/app/components/AuthGuard.tsx` — 包裹所有受保护路由；token 存在但 user 为 null 时自动调用 `loadUserInfo()`（处理页面刷新）
- `src/app/components/PermissionGuard.tsx` — 包裹单个路由，接收 `permission` 属性；不匹配时渲染 `ForbiddenPage`
- `src/config/permissions.ts` — 完整权限体系：
  - `PERMISSION_CATALOG` — 权限目录，每个权限含 `code`、`name`、`type`（menu/operation）、`module`、`platform`（core/assist/terminal）、`description`、`legacyCodes`
  - `ROLE_PERMISSIONS` — 角色→权限数组映射；`super_admin` 拥有 `['*']`
  - 预置角色：`store_manager`（店长）、`beautician`（美容师）、`cashier`（收银）、`inventory_manager`（库存管理员）
  - 高级权限维度：`PlatformScopes`（平台范围）、`DataScopes`（数据范围，all/own_store/served_customers/self/none）、`FieldScopes`（字段可见性，visible/masked/hidden）、`ApprovalScopes`（审批权限）
  - `LEGACY_PERMISSION_MAP` / `normalizePermissionCode()` — 旧权限码自动映射到新码
- 权限字符串遵循 `平台:模块:动作` 格式（如 `core:customer:view`、`terminal:service:start`）

### 路由

`src/app/routes.tsx` 集中定义所有路由：

- 公开路由：`/login`、`/register`
- 受保护路由（嵌套在 `ProtectedLayout` = `AuthGuard > Layout` 下，每个子路由用 `PermissionGuard` 包裹）：
  - **仪表盘**：`/`、`/dashboard`
  - **客户管理**：`customers/data|profile|script`
  - **智能营销**：`customer-marketing/activity-management|activity-effect/:id|intelligent-recommendation|strategy-templates|effect-analysis`
  - **门店管理**：`stores/project-types|projects|beauticians|beautician-levels|scheduling|reservations`
  - **商品管理**：`goods/types|products|cards`
  - **订单管理**：`orders/products|card-orders|card-usage`
  - **库存管理**：`inventory/products|stock|purchase|expiry|transfer|consumption`
  - **系统设置**：`system/users|roles|permissions|stores`
- `errorElement = <RouteErrorPage />`
- 未匹配路由显示 404 Placeholder 页面

### 状态 Store（`src/stores/`）

- `authStore` — `token`、`user`、`isAuthenticated`、`login(req)`、`logout()`、`loadUserInfo()`、`setAuth(token, user)`
- `storeStore` — `currentStoreId`、`stores[]`、`setCurrentStore(id)`、`loadStores()`
- `themeStore` — 主题切换，持久化到 localStorage

### UI 组件

- `src/app/components/ui/`（~45 个文件）— shadcn/ui 风格基础组件：Button、Dialog、Table、Form、Select、DropdownMenu、Command、Sheet、Tabs、Tooltip 等；`utils.ts` 提供 `cn()`（clsx + tailwind-merge）；`use-mobile.ts` 响应式 hook
- `src/app/components/UI.tsx` — 聚合导出常用组件（Input、Button、Table 系列等）
- `src/app/components/Layout.tsx` — 侧边栏 + 顶栏布局；`MENU_ITEMS` 定义导航树，叶子节点带 `permission` 字段自动显隐；`cn()` 工具函数也定义在此
- `src/app/components/ImportDialog.tsx` — 通用导入流程：文件选择 → 解析 → 预览 → 确认
- `src/app/components/PasswordConfirmDialog.tsx` — 危险操作前的密码二次确认
- `src/app/components/StoreSwitcher.tsx` — 门店切换器
- MUI（`@mui/material`）与 shadcn/ui 共存，部分页面混用

### 表单模式

页面使用 react-hook-form + zodResolver。Schema 集中在 `src/schemas/<模块>.ts`（auth、beautician、card、customer、inventory、marketing、product、project、scheduling、system）。

标准提交流程：
1. 调用 API
2. 成功 → 关闭弹窗 + `toast.success()` + 刷新列表
3. 失败 → 保持弹窗 + 显示错误信息

### 通用 Hook

- `src/hooks/usePagination.ts` — 封装服务端分页：`page`、`pageSize`、`total`、`loading` 状态
- `src/hooks/usePermission.ts` — `usePermission(code)` 返回布尔值，判断当前用户是否有某权限

### 工具函数

- `src/utils/excel.ts` — `exportToExcel(data, columns, filename)`、`parseExcelFile(file, columns)`、`downloadTemplate(columns, sampleData, filename)`
- `src/utils/fieldMask.ts` — 字段脱敏（根据 FieldScopes 控制手机号/微信号等可见性）
- `src/utils/dataAccess.ts` — 数据权限访问控制
- `src/utils/customerSegmentation.ts` — 客户分群
- `src/utils/advancedAnalytics.ts` — 高级分析
- `src/utils/marketingAutomation.ts` — 营销自动化
- `src/utils/marketingRecommendation.ts` — 营销推荐

### 样式系统

- Tailwind CSS v4（CSS-based 配置，无 `tailwind.config.js`），通过 `@tailwindcss/vite` 插件集成
- 样式入口文件：`src/styles/index.css` → `tailwind.css` + `theme.css` + `fonts.css` + `tiptap.css`
- 组件变体使用 CVA + tailwind-merge（shadcn 模式）
- 主题切换：next-themes + Zustand themeStore
- MUI 组件与 Tailwind 共存（MUI 使用 Emotion 样式）

### 测试

- Vitest 4 + jsdom + @testing-library/react + @testing-library/user-event
- `globals: true`，setup 文件 `src/test/setup.ts`
- 测试文件位置：`src/**/*.{test,spec}.{ts,tsx}`
- 已有测试：`api.test.ts`、`auth-store.test.ts`、`permissions.test.ts`、`schema-excel.test.ts`
- 覆盖率排除：`src/test/**`、`src/types/**`、`*.d.ts`

### 部署

- Docker：`Dockerfile.app`（Vite 构建 + serve 端口 8080）+ `docker-compose.yml`
- Vercel：`vercel.json`
- nixpacks：`nixpacks.toml`

### monorepo 结构

项目含 `packages/` 子包：
- `packages/server-v2` — **当前使用的后端**（NestJS 11 + Prisma 7 + PostgreSQL），端口 8080
- `packages/app` — 移动端应用
- `packages/Ami Aura Lite Kiosk Prototype` — 智能终端（kiosk）主线应用

### 后端架构（packages/server-v2）

| 类别 | 技术 |
|------|------|
| 框架 | NestJS 11 + TypeScript |
| ORM | Prisma 7（driver adapter 模式，`@prisma/adapter-pg`） |
| 数据库 | Supabase PostgreSQL（ap-northeast-1） |
| 认证 | JWT（access 15m + refresh 7d）+ bcrypt |
| 文档 | Swagger（`/docs`） |

**Prisma 7 注意事项**：
- `schema.prisma` 的 datasource 块只有 `provider`，不含 `url`
- 数据库连接在 `prisma.config.ts` 中通过 `defineConfig({ datasource: { url } })` 配置
- PrismaService 使用 `PrismaPg` adapter 构造：`new PrismaPg({ connectionString })`
- 编译用 `npx tsc`（不要用 `nest build`，DTO 子目录编译有问题）

**开发模式**：
- 前端 `npm run dev`（Vite，端口 5173/5174）
- 后端在 `packages/server-v2` 下 `npx tsc && node dist/main.js`（端口 8080）
- Vite proxy 将 `/api` 请求转发到 `http://localhost:8080`，无需处理 CORS
- `.env` 设置 `VITE_API_MODE=real` + `VITE_API_BASE_URL=/api` 启用真实 API

### 关键约定

- **Mock 优先开发**：所有 API 模块同时维护 mock/real 两套实现，通过环境变量切换
- **路由集中管理**：所有路由在 `routes.tsx` 单文件定义（非文件系统路由）
- **权限码新旧兼容**：`LEGACY_PERMISSION_MAP` 自动映射旧码到新码
- **API 响应解包**：axios interceptor 已 `return response.data`，调用方直接拿业务数据
- **分页响应格式**：`{ items: T[] }`（兼容旧别名 `data`）
- **错误格式**：`{ message: string, code?: string, status?: number, details?: unknown }`
- **Vite 配置警告**：`assetsInclude` 不能包含 `.css`、`.tsx`、`.ts`；React + Tailwind 插件不可移除（Figma Make 依赖）
