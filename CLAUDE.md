# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 常用命令

所有命令在 `beauty_salon/beauty_salon/beauty salon/` 目录下执行：

```bash
npm run dev          # 启动开发服务器 http://localhost:5173
npm run build        # 生产构建（Vite）
npm run test         # 运行测试一次（Vitest）
npm run test:watch   # 监听模式
npm run lint         # ESLint 检查 src/
npm run format       # Prettier 格式化 src/
```

**默认登录账号**：用户名 `admin`，密码 `11111111`（超级管理员，拥有所有权限）。

## 架构说明

### 技术栈
React 18 + TypeScript + Vite、Tailwind CSS v4、Radix UI 原子组件、Zustand 状态管理、react-hook-form + Zod 表单校验、Axios、Recharts 图表、xlsx (SheetJS) 导入导出、react-router v7。

### API 层 — Mock/Real 切换机制
每个 API 模块由三个文件组成：`src/api/mock/<模块>.ts`、`src/api/real/<模块>.ts` 以及 `src/api/<模块>.ts`。切换文件根据 `import.meta.env.VITE_API_MODE` 选择实现：

```ts
const isReal = import.meta.env.VITE_API_MODE === 'real';
export const getProducts = isReal ? realGetProducts : mockGetProducts;
```

`.env` 默认 `VITE_API_MODE=mock`。新增 API 模块时，需同时创建 mock 和 real 两份文件，再创建切换文件并在 `src/api/index.ts` 导出。

### 认证与权限
- `src/stores/authStore.ts` — Zustand store：`token`（持久化到 localStorage）、`user`（刷新后丢失，由 `loadUserInfo()` 重新加载）、`isAuthenticated`
- `src/app/components/AuthGuard.tsx` — 包裹所有受保护路由；当 token 存在但 `user` 为 null 时自动调用 `loadUserInfo()`（处理刷新页面场景）
- `src/app/components/PermissionGuard.tsx` — 包裹单个路由，接收 `permission` 属性；权限不匹配时渲染 `ForbiddenPage`
- `src/config/permissions.ts` — `ROLE_PERMISSIONS` 将角色 key 映射到权限数组；`super_admin` 拥有 `['*']`
- `src/api/client.ts` — Axios 实例，自动附加 `Authorization: Bearer <token>` 和 `X-Store-Id`（从 `storeStore` 取）；遇到 401 自动跳转 `/login`

### 路由
`src/app/routes.tsx` 集中定义所有路由。公开路由：`/login`、`/register`。其余路由全部嵌套在 `<ProtectedLayout>`（AuthGuard + Layout）下，且每个子路由都用 `<PermissionGuard permission="...">` 包裹。权限字符串遵循 `模块:动作` 格式（如 `customer:view`、`inventory:stock`）。

### 状态 Store（`src/stores/`）
- `authStore` — token、user、login/logout/loadUserInfo/setAuth
- `storeStore` — currentStoreId、stores 列表、setCurrentStore/loadStores
- `themeStore` — 主题切换，持久化到 localStorage

### 通用 Hook 与工具
- `src/hooks/usePagination.ts` — 封装服务端分页表格的 page/pageSize/total/loading 状态
- `src/hooks/usePermission.ts` — 接收权限编码返回布尔值
- `src/utils/excel.ts` — `exportToExcel`、`parseExcelFile`、`downloadTemplate`（基于 xlsx/SheetJS）
- `src/app/components/ImportDialog.tsx` — 通用文件→解析→预览→确认 的导入流程组件
- `src/app/components/PasswordConfirmDialog.tsx` — 通用密码验证弹窗（用于删除等危险操作前的二次确认）

### 表单模式
页面使用 react-hook-form + zodResolver，Schema 集中在 `src/schemas/<模块>.ts`。提交流程：调用 API → 成功则关闭弹窗 + 显示 Sonner Toast + 刷新列表；失败则保持弹窗 + 显示错误信息。

### 侧边栏菜单
`src/app/components/Layout.tsx` 中的 `MENU_ITEMS` 数组定义导航。每个叶子节点带 `permission` 字段；当 `user.permissions` 不包含该权限（且不含 `*`）时，菜单项自动过滤隐藏。
