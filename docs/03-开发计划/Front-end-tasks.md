# 实施计划：美业管理平台前端功能完善

## 概述

将美业管理平台从静态 UI 原型升级为完整可交互业务系统。按照依赖关系排列：先搭建基础设施（类型、Store、API 层切换），再实现认证和权限，然后完善各业务模块的表单提交和分页，最后实现导入导出和主题切换。

## 任务

- [x] 1. 基础设施搭建：类型定义与 Zustand Store
  - [x] 1.1 创建认证、权限、分页、导入导出相关类型定义
    - 创建 `src/types/auth.ts`，定义 `LoginRequest`、`LoginResponse`、`AuthUser` 接口
    - 创建 `src/types/permission.ts`，定义 `Role`、`Permission` 接口
    - 创建 `src/types/pagination.ts`，定义 `PaginatedResponse<T>`、`PaginationParams` 接口
    - 创建 `src/types/excel.ts`，定义 `ImportResult`、`ImportError`、`ExportColumn` 接口
    - 更新 `src/types/index.ts` 导出新增类型
    - _需求: 1.2, 6.2, 6.3, 7.3, 10.1_

  - [x] 1.2 创建 Zustand 全局状态 Store
    - 创建 `src/stores/authStore.ts`，包含 `token`、`user`、`permissions`、`roles` 状态及 `login`、`logout`、`loadUserInfo` 方法
    - 创建 `src/stores/storeStore.ts`，包含 `currentStoreId`、`stores` 状态及 `setCurrentStore`、`loadStores` 方法
    - 创建 `src/stores/themeStore.ts`，包含 `theme` 状态及 `toggleTheme` 方法，初始化读取 localStorage
    - _需求: 1.2, 8.3, 8.4, 9.3, 10.1_

  - [ ]* 1.3 编写 authStore 属性测试
    - **Property 2: 登录成功后存储完整认证状态**
    - **验证: 需求 1.2, 10.1**

  - [ ]* 1.4 编写 themeStore 属性测试
    - **Property 12: 主题切换 Round-Trip**
    - **验证: 需求 8.2, 8.3**

- [x] 2. API 层重构：Mock/Real 模式切换机制
  - [x] 2.1 实现 API 层 Mock/Real 切换架构
    - 创建 `src/api/mock/` 目录，将现有 API 文件中的 Mock 数据和实现迁移到对应的 mock 文件（如 `src/api/mock/product.ts`）
    - 创建 `src/api/real/` 目录，为每个模块创建真实 API 调用实现（如 `src/api/real/product.ts`），使用 apiClient
    - 重构 `src/api/product.ts`、`src/api/customer.ts`、`src/api/inventory.ts`、`src/api/order.ts`，通过 `VITE_API_MODE` 环境变量切换 mock/real 实现
    - 创建 `.env` 文件，设置 `VITE_API_MODE=mock` 默认值
    - _需求: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [x] 2.2 新增业务 API 模块
    - 创建 `src/api/auth.ts`（含 mock/real）— 登录、登出、获取用户信息
    - 创建 `src/api/scheduling.ts`（含 mock/real）— 排班查询、保存
    - 创建 `src/api/store.ts`（含 mock/real）— 门店列表、门店 CRUD
    - 创建 `src/api/role.ts`（含 mock/real）— 角色列表、权限配置
    - 创建 `src/api/marketing.ts`（含 mock/real）— 营销活动 CRUD
    - 创建 `src/api/bom.ts`（含 mock/real）— BOM 管理、消耗记录
    - 更新 `src/api/index.ts` 导出所有新增模块
    - _需求: 11.4, 11.7_

  - [ ]* 2.3 编写 API 模式切换属性测试
    - **Property 16: API 模式切换一致性**
    - **验证: 需求 11.1, 11.2, 11.3, 11.5**

- [x] 3. 检查点 - 确保基础设施完整
  - 确保所有测试通过，如有疑问请询问用户。

- [x] 4. 用户登录与认证
  - [x] 4.1 创建登录页面和 Zod Schema
    - 创建 `src/schemas/auth.ts`，定义 `loginSchema`（用户名非空、密码最少 6 位）
    - 创建 `src/app/pages/LoginPage.tsx`，使用 react-hook-form + zodResolver 绑定表单校验
    - 实现登录按钮加载状态、错误提示、成功后重定向到 `/dashboard`
    - _需求: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [ ]* 4.2 编写登录表单 Schema 属性测试
    - **Property 1: 登录表单 Schema 校验**
    - **验证: 需求 1.5**

  - [x] 4.3 创建 AuthGuard 路由守卫组件
    - 创建 `src/app/components/AuthGuard.tsx`，检查 authStore 中的 token
    - 无 token 时重定向到 `/login`；已登录访问 `/login` 时重定向到 `/dashboard`
    - _需求: 2.1, 2.2, 2.3_

  - [x] 4.4 更新路由配置和 Axios 拦截器
    - 修改 `src/app/routes.tsx`，注册 `/login` 路由，用 AuthGuard 包裹受保护路由
    - 修改 `src/api/client.ts`，增强 JWT 拦截器：自动附加 Bearer Token、处理 401 响应清除 token 并重定向
    - 在 Layout 顶部栏添加登出按钮，调用 `authStore.logout()`
    - _需求: 1.7, 1.8, 2.4, 2.5_

  - [ ]* 4.5 编写路由守卫属性测试
    - **Property 3: 路由守卫拦截未认证访问**
    - **验证: 需求 2.1, 2.2**

  - [ ]* 4.6 编写 JWT 拦截器属性测试
    - **Property 4: JWT 拦截器自动附加 Bearer Token**
    - **Property 5: JWT 拦截器处理 401 响应**
    - **验证: 需求 2.4, 2.5**

- [x] 5. 冗余文件清理
  - [x] 5.1 删除 AIScript.tsx 并验证无残留引用
    - 删除 `src/app/pages/AIScript.tsx`
    - 全局搜索确认无任何文件导入或引用 AIScript
    - 确认 `CustomerInvitationScript.tsx` 是 `/customers/script` 路由的唯一实现
    - _需求: 3.1, 3.2, 3.3_

- [x] 6. RBAC 权限控制
  - [x] 6.1 创建权限守卫和 usePermission Hook
    - 创建 `src/app/components/PermissionGuard.tsx`，检查用户权限列表，无权限渲染 403 页面
    - 创建 `src/app/pages/ForbiddenPage.tsx`，403 无权限提示页面
    - 创建 `src/hooks/usePermission.ts`，接受权限编码返回布尔值
    - _需求: 10.3, 10.4, 10.5_

  - [x] 6.2 实现动态侧边栏菜单和路由权限
    - 修改 `src/app/components/Layout.tsx`，根据用户权限列表过滤 MENU_ITEMS，隐藏无权限菜单项
    - 在路由配置中集成 PermissionGuard，为每个路由定义所需权限编码
    - 定义预置角色权限映射：超级管理员、门店管理员、美容师、收银员、库存管理员
    - _需求: 10.2, 10.3, 10.6_

  - [ ]* 6.3 编写权限控制属性测试
    - **Property 15: 权限控制访问**
    - **验证: 需求 10.2, 10.3, 10.4**

- [x] 7. 门店切换器
  - [x] 7.1 实现 StoreSwitcher 组件
    - 创建 `src/app/components/StoreSwitcher.tsx`，使用 Radix Select 组件
    - 从 storeApi 获取用户可访问门店列表，超级管理员显示"全部门店"选项
    - 门店管理员仅显示所属门店
    - _需求: 9.1, 9.2, 9.6, 9.7_

  - [x] 7.2 集成门店切换到 Layout 和 API 层
    - 修改 `src/app/components/Layout.tsx` 顶部栏，在面包屑旁添加 StoreSwitcher
    - 修改 `src/api/client.ts`，在请求拦截器中自动附加 `X-Store-Id` 请求头
    - 门店变更时触发当前页面数据刷新
    - _需求: 9.3, 9.4, 9.5_

  - [ ]* 7.3 编写门店切换器属性测试
    - **Property 13: 门店选择更新全局状态与 API 请求**
    - **Property 14: 门店切换器按角色过滤**
    - **验证: 需求 9.3, 9.5, 9.7**

- [x] 8. 检查点 - 确保认证、权限、门店切换功能完整
  - 确保所有测试通过，如有疑问请询问用户。

- [x] 9. Zod Schema 定义与通用 Hook
  - [x] 9.1 创建各业务模块的 Zod Schema
    - 创建 `src/schemas/product.ts` — 产品表单校验
    - 创建 `src/schemas/customer.ts` — 客户表单校验
    - 创建 `src/schemas/beautician.ts` — 美容师表单校验
    - 创建 `src/schemas/project.ts` — 项目表单校验
    - 创建 `src/schemas/card.ts` — 次卡表单校验
    - 创建 `src/schemas/inventory.ts` — 库存入库、采购、调拨表单校验
    - 创建 `src/schemas/scheduling.ts` — 排班表单校验
    - 创建 `src/schemas/marketing.ts` — 营销活动表单校验
    - 创建 `src/schemas/system.ts` — 用户管理、角色管理、门店管理表单校验
    - _需求: 4.1, 4.2_

  - [ ]* 9.2 编写 Zod Schema 属性测试
    - **Property 6: Zod Schema 校验正确性**
    - **验证: 需求 4.2, 4.3**

  - [x] 9.3 创建 usePagination 通用 Hook
    - 创建 `src/hooks/usePagination.ts`，封装分页状态管理（page、pageSize、total、loading）
    - 支持翻页、修改每页条数（自动重置到第 1 页）、刷新
    - _需求: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 9.4 编写 usePagination 属性测试
    - **Property 9: 分页请求与响应契约**
    - **验证: 需求 6.2, 6.3, 6.5**

- [x] 10. 表单弹窗提交逻辑实现
  - [x] 10.1 产品管理、库存入库、采购订单表单提交
    - 修改 `ProductManagement.tsx`，集成 react-hook-form + Zod Schema + API 调用
    - 修改 `StockManagement.tsx`，实现入库表单提交逻辑
    - 修改 `PurchaseManagement.tsx`，实现采购订单表单提交逻辑
    - 实现提交成功关闭弹窗 + Toast 通知 + 刷新列表，失败保持弹窗 + 错误提示
    - _需求: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 10.2 客户管理、美容师管理、项目管理表单提交
    - 修改 `CustomerData.tsx`，实现客户创建/编辑表单提交
    - 修改 `BeauticianManagement.tsx`，实现美容师创建/编辑表单提交
    - 修改 `ProjectManagement.tsx`，实现项目创建/编辑表单提交
    - _需求: 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 10.3 次卡管理、门店调拨、营销活动表单提交
    - 修改 `CardManagement.tsx`，实现次卡创建/编辑表单提交
    - 修改 `StoreTransfer.tsx`，实现调拨申请表单提交
    - 修改 `MarketingStrategy.tsx` / `CreateMarketing.tsx`，实现营销活动创建/编辑表单提交
    - _需求: 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 10.4 系统管理模块表单提交
    - 修改 `system/UserManagement.tsx`，实现用户创建/编辑表单提交
    - 修改 `system/RoleManagement.tsx`，实现角色创建/编辑及权限配置表单提交
    - 修改 `system/StoreSettings.tsx`，实现门店创建/编辑表单提交
    - _需求: 4.3, 4.4, 4.5, 4.6, 4.7_

- [x] 11. 排班管理功能增强
  - [x] 11.1 实现排班时段点击切换和保存逻辑
    - 修改 `Scheduling.tsx`，实现时段单元格点击切换可预约/不可预约状态（绿色/灰色）
    - 实现保存按钮调用排班 API 提交变更数据
    - 保存成功显示 Toast 通知，失败回滚 UI 状态并显示错误
    - 切换美容师 Tab 或周视图时从 API 加载对应排班数据
    - _需求: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 11.2 编写排班时段切换属性测试
    - **Property 7: 排班时段点击切换**
    - **验证: 需求 5.1**

  - [ ]* 11.3 编写排班保存失败回滚属性测试
    - **Property 8: 排班保存失败回滚**
    - **验证: 需求 5.4**

- [x] 12. 服务端分页集成
  - [x] 12.1 为数据表格页面集成服务端分页
    - 修改 `CustomerData.tsx`，使用 usePagination Hook 替换本地数据
    - 修改 `ProductManagement.tsx`，集成服务端分页
    - 修改 `StockManagement.tsx`，集成服务端分页
    - 修改 `PurchaseManagement.tsx`，集成服务端分页
    - 修改 `ProductOrderManagement.tsx`，集成服务端分页
    - 修改 `CardOrderManagement.tsx`，集成服务端分页
    - 修改 `CardVerification.tsx`，集成服务端分页
    - 修改 `ProjectReservation.tsx`，集成服务端分页
    - 修改 `ExpiryManagement.tsx`，集成服务端分页
    - 修改 `system/UserManagement.tsx`，集成服务端分页
    - 每个页面添加加载状态指示器
    - _需求: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

- [x] 13. 检查点 - 确保表单提交和分页功能完整
  - 确保所有测试通过，如有疑问请询问用户。

- [x] 14. 数据导入导出
  - [x] 14.1 创建 Excel 工具模块和 ImportDialog 组件
    - 安装 `xlsx`（SheetJS）依赖
    - 创建 `src/utils/excel.ts`，实现 `exportToExcel`、`parseExcelFile`、`downloadTemplate` 函数
    - 创建 `src/app/components/ImportDialog.tsx`，实现文件选择 → 解析预览 → 错误标记 → 确认导入流程
    - _需求: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ]* 14.2 编写 Excel 导入导出属性测试
    - **Property 10: Excel 导出/导入 Round-Trip**
    - **Property 11: 导入数据校验标记无效行**
    - **验证: 需求 7.3, 7.4, 7.6**

  - [x] 14.3 集成导入导出到业务页面
    - 修改 `ProductManagement.tsx`，添加产品批量导入按钮和导入模板下载
    - 修改 `CustomerData.tsx`，添加客户批量导入按钮和导入模板下载
    - 修改 `StockManagement.tsx`，添加库存报表导出按钮
    - 修改 `ProductOrderManagement.tsx`，添加订单报表导出按钮
    - 修改 `CustomerData.tsx`，添加客户数据导出按钮
    - 修改 `ExpiryManagement.tsx`，添加过期损耗报表导出按钮
    - _需求: 7.6, 7.7, 7.8, 7.9_


- [x] 16. 最终检查点 - 确保所有功能完整
  - 确保所有测试通过，如有疑问请询问用户。

## 备注

- 标记 `*` 的任务为可选任务，可跳过以加速 MVP 交付
- 每个任务引用了具体的需求编号以确保可追溯性
- 检查点任务用于阶段性验证，确保增量开发的正确性
- 属性测试验证通用正确性属性，单元测试验证具体示例和边界情况
- 实施语言：TypeScript（与设计文档一致）
