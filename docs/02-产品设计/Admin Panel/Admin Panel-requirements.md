# 需求文档：美业管理平台前端功能完善

## 简介

本需求文档针对美业管理平台（Beauty Salon Management Platform）前端的全面功能完善。当前项目已完成 33 个功能页面的静态 UI 搭建，全部使用 Mock 数据，但缺少登录认证、表单提交逻辑、服务端分页、权限控制、数据导入导出、暗色主题切换、门店切换等关键功能。本文档定义了将静态 UI 原型升级为完整可交互业务系统所需的全部前端需求。

## 术语表

- **Platform（平台）**: 美业管理平台前端应用，基于 React 18 + TypeScript + Vite 6 + Tailwind CSS 4 + shadcn/ui 构建
- **Auth_Module（认证模块）**: 负责用户登录、Token 管理、路由守卫的前端认证子系统
- **Login_Page（登录页面）**: 用户输入凭证进行身份验证的独立页面组件
- **Route_Guard（路由守卫）**: 拦截未认证用户访问受保护路由并重定向至登录页的机制
- **JWT_Interceptor（JWT 拦截器）**: Axios 请求拦截器，自动附加 Authorization 头并处理 Token 过期
- **API_Layer（API 层）**: `src/api/` 目录下按模块封装的 API 请求函数集合
- **Mock_Mode（Mock 模式）**: API 函数返回本地 Mock 数据的运行模式
- **Real_Mode（真实模式）**: API 函数调用后端 REST API 的运行模式
- **Form_Dialog（表单弹窗）**: 用于创建、编辑业务数据的模态对话框组件
- **Zod_Schema（Zod 校验模式）**: 使用 Zod 库定义的表单数据验证规则
- **Toast_Notification（Toast 通知）**: 使用 Sonner 库显示的操作成功/失败提示消息
- **Server_Pagination（服务端分页）**: 通过 API 参数（page、pageSize）从服务端获取分页数据的机制
- **RBAC（基于角色的访问控制）**: 根据用户角色（超级管理员、门店管理员、美容师、收银员、库存管理员）控制功能访问权限的机制
- **Store_Switcher（门店切换器）**: 顶部栏中用于切换当前操作门店的下拉选择组件
- **Theme_Switcher（主题切换器）**: 用于在亮色/暗色主题之间切换的 UI 控件
- **Excel_Import（Excel 导入）**: 通过上传 Excel 文件批量导入业务数据的功能
- **Excel_Export（Excel 导出）**: 将表格数据导出为 Excel/CSV 文件的功能
- **Scheduling_Page（排班页面）**: 美容师工作排班管理页面（Scheduling.tsx）
- **AIScript_File（AIScript 文件）**: `src/app/pages/AIScript.tsx`，一个未被路由引用的冗余文件

---

## 需求

### 需求 1：用户登录与认证

**用户故事：** 作为平台用户，我希望通过登录页面进行身份验证，以便安全地访问系统功能。

#### 验收标准

1. THE Platform SHALL 提供一个独立的 Login_Page 组件，包含用户名输入框、密码输入框和登录按钮
2. WHEN 用户提交有效的用户名和密码时，THE Auth_Module SHALL 调用登录 API 并将返回的 JWT Token 存储到 localStorage
3. WHEN 登录成功时，THE Platform SHALL 将用户重定向到仪表盘页面（/dashboard）
4. IF 登录凭证无效，THEN THE Login_Page SHALL 显示明确的错误提示信息（如"用户名或密码错误"）
5. WHEN 用户提交登录表单时，THE Login_Page SHALL 使用 Zod_Schema 验证用户名（非空）和密码（非空、最少 6 位）
6. THE Login_Page SHALL 在登录请求进行中时禁用提交按钮并显示加载状态
7. WHEN 用户点击登出按钮时，THE Auth_Module SHALL 清除 localStorage 中的 Token 并重定向到 Login_Page
8. THE Platform SHALL 在路由配置中注册 `/login` 路径指向 Login_Page

### 需求 2：路由守卫与 Token 管理

**用户故事：** 作为系统管理员，我希望未登录用户无法访问系统内部页面，以保障数据安全。

#### 验收标准

1. THE Route_Guard SHALL 在每次路由导航前检查 localStorage 中是否存在有效的 JWT Token
2. WHEN 用户未持有有效 Token 访问受保护路由时，THE Route_Guard SHALL 将用户重定向到 `/login` 页面
3. WHEN 用户已持有有效 Token 访问 `/login` 页面时，THE Route_Guard SHALL 将用户重定向到 `/dashboard` 页面
4. WHEN JWT_Interceptor 收到 HTTP 401 响应时，THE Auth_Module SHALL 清除本地 Token 并将用户重定向到 `/login` 页面
5. THE JWT_Interceptor SHALL 在每个 API 请求的 Authorization 头中自动附加 `Bearer {token}` 格式的 Token

### 需求 3：冗余文件清理

**用户故事：** 作为开发者，我希望项目中不存在未使用的冗余文件，以保持代码库整洁。

#### 验收标准

1. THE Platform SHALL 删除 AIScript_File（`src/app/pages/AIScript.tsx`），因为该文件未被路由配置引用
2. THE Platform SHALL 确认 CustomerInvitationScript.tsx 是 `/customers/script` 路由的唯一实现组件
3. THE Platform SHALL 确保删除 AIScript_File 后不存在对该文件的任何导入引用

### 需求 4：表单弹窗提交逻辑

**用户故事：** 作为操作人员，我希望弹窗表单在提交时执行数据校验并调用 API，以便真正地创建或更新业务数据。

#### 验收标准

1. THE Platform SHALL 为所有 Form_Dialog 组件集成 react-hook-form 和 Zod_Schema 进行表单数据校验
2. WHEN 用户提交表单数据不符合 Zod_Schema 规则时，THE Form_Dialog SHALL 在对应字段下方显示具体的校验错误信息
3. WHEN 用户提交有效的表单数据时，THE Form_Dialog SHALL 调用对应的 API_Layer 函数发送创建或更新请求
4. WHEN API 请求成功时，THE Form_Dialog SHALL 关闭弹窗、刷新父页面数据列表，并通过 Toast_Notification 显示成功消息（如"创建成功"）
5. IF API 请求失败，THEN THE Form_Dialog SHALL 保持弹窗打开状态，并通过 Toast_Notification 显示失败消息（包含错误原因）
6. THE Form_Dialog SHALL 在 API 请求进行中时禁用提交按钮并显示加载状态，防止重复提交
7. THE Platform SHALL 为以下业务模块的弹窗表单实现完整提交逻辑：产品管理、库存入库、采购订单、门店调拨、客户管理、美容师管理、项目管理、次卡管理、排班管理、营销活动、系统用户管理、角色管理、门店管理

### 需求 5：排班管理功能增强

**用户故事：** 作为门店管理员，我希望在排班页面上点击时段来切换可用/不可用状态并保存排班数据，以便管理美容师的工作安排。

#### 验收标准

1. WHEN 用户点击排班日历中的某个时段单元格时，THE Scheduling_Page SHALL 切换该时段的状态（可预约 ↔ 不可预约），并即时更新 UI 颜色标识（绿色/灰色）
2. WHEN 用户修改排班数据后点击保存按钮时，THE Scheduling_Page SHALL 调用排班 API 提交变更数据
3. WHEN 排班数据保存成功时，THE Scheduling_Page SHALL 通过 Toast_Notification 显示"排班保存成功"
4. IF 排班数据保存失败，THEN THE Scheduling_Page SHALL 通过 Toast_Notification 显示错误信息并回滚 UI 状态
5. WHEN 用户切换美容师 Tab 或切换周视图时，THE Scheduling_Page SHALL 从 API 加载对应美容师和时间范围的排班数据

### 需求 6：服务端分页

**用户故事：** 作为操作人员，我希望数据表格支持服务端分页，以便在大数据量下高效浏览数据。

#### 验收标准

1. THE Platform SHALL 为所有数据表格组件实现服务端分页，通过 API 参数（page、pageSize）获取分页数据
2. THE API_Layer SHALL 在分页请求中传递 page（当前页码，从 1 开始）和 pageSize（每页条数，默认 10）参数
3. THE API_Layer SHALL 从分页响应中解析 total（总记录数）字段，用于计算总页数
4. WHEN 用户点击分页控件的页码或翻页按钮时，THE Platform SHALL 发起新的 API 请求获取对应页的数据
5. WHEN 用户修改每页显示条数时，THE Platform SHALL 重置到第 1 页并发起新的 API 请求
6. WHILE 分页数据加载中，THE Platform SHALL 在表格区域显示加载状态指示器
7. THE Platform SHALL 为以下页面实现服务端分页：客户数据、产品管理、库存管理、采购订单、商品订单、次卡开卡、次卡核销、项目预约、过期管理、用户管理

### 需求 7：数据导入导出

**用户故事：** 作为门店管理员，我希望能够通过 Excel 文件批量导入数据和导出报表，以提高数据管理效率。

#### 验收标准

1. THE Platform SHALL 引入 SheetJS（xlsx）库作为 Excel 文件处理依赖
2. WHEN 用户点击导入按钮时，THE Platform SHALL 打开文件选择对话框，仅允许选择 .xlsx 和 .xls 格式文件
3. WHEN 用户选择有效的 Excel 文件后，THE Platform SHALL 解析文件内容、校验数据格式，并显示预览确认界面
4. IF 导入文件包含格式错误的数据行，THEN THE Platform SHALL 在预览界面中标记错误行并显示具体错误原因
5. WHEN 用户确认导入时，THE Platform SHALL 调用批量导入 API 并通过 Toast_Notification 显示导入结果（成功 N 条，失败 M 条）
6. WHEN 用户点击导出按钮时，THE Platform SHALL 将当前表格数据（含筛选条件）导出为 .xlsx 文件并触发浏览器下载
7. THE Platform SHALL 为以下业务模块提供导入功能：产品批量导入、客户批量导入
8. THE Platform SHALL 为以下业务模块提供导出功能：库存报表、订单报表、客户数据、过期损耗报表
9. THE Platform SHALL 提供可下载的导入模板文件，模板中包含字段说明和示例数据

### 需求 8：暗色主题切换

**用户故事：** 作为平台用户，我希望能够在亮色和暗色主题之间切换，以适应不同的使用环境和个人偏好。

#### 验收标准

1. THE Platform SHALL 在顶部栏的用户信息区域旁提供 Theme_Switcher 按钮（太阳/月亮图标）
2. WHEN 用户点击 Theme_Switcher 时，THE Platform SHALL 在 `<html>` 元素上切换 `dark` CSS 类
3. THE Platform SHALL 将用户的主题偏好持久化存储到 localStorage，键名为 `theme`
4. WHEN 用户首次访问平台时，THE Platform SHALL 读取 localStorage 中的主题偏好；若无存储值，则默认使用亮色主题
5. THE Platform SHALL 确保所有 33 个功能页面在暗色主题下的文字、背景、边框、卡片、表格、弹窗等元素均使用 CSS 变量定义的暗色值正确渲染
6. THE Platform SHALL 确保侧边栏导航在暗色主题下保持可读性和视觉一致性

### 需求 9：门店切换器

**用户故事：** 作为多门店管理者，我希望在顶部栏快速切换当前操作门店，以便管理不同门店的数据。

#### 验收标准

1. THE Platform SHALL 在顶部栏左侧区域（面包屑导航旁）显示 Store_Switcher 下拉选择组件
2. THE Store_Switcher SHALL 从 API 获取当前用户有权限访问的门店列表
3. WHEN 用户选择不同门店时，THE Platform SHALL 将选中的门店 ID 存储到全局状态（Zustand store）
4. WHEN 当前门店变更时，THE Platform SHALL 自动刷新当前页面的数据，使用新门店 ID 作为 API 请求参数
5. THE JWT_Interceptor SHALL 在每个 API 请求中自动附加当前门店 ID 作为请求头（如 `X-Store-Id`）或查询参数
6. WHILE 用户角色为超级管理员时，THE Store_Switcher SHALL 显示"全部门店"选项，允许查看跨门店汇总数据
7. WHILE 用户角色为门店管理员时，THE Store_Switcher SHALL 仅显示该用户所属的门店

### 需求 10：RBAC 权限控制

**用户故事：** 作为系统管理员，我希望不同角色的用户只能访问其权限范围内的功能，以保障系统安全和数据隔离。

#### 验收标准

1. THE Auth_Module SHALL 在登录成功后从 API 获取当前用户的角色信息和权限列表，并存储到 Zustand 全局状态
2. THE Platform SHALL 根据当前用户的权限列表动态生成侧边栏菜单，隐藏无权限的菜单项
3. WHEN 用户通过 URL 直接访问无权限的路由时，THE Route_Guard SHALL 将用户重定向到 403 无权限提示页面
4. THE Platform SHALL 提供 `usePermission` Hook，接受权限编码参数，返回布尔值表示当前用户是否拥有该权限
5. THE Platform SHALL 使用 `usePermission` Hook 控制页面内操作按钮（如创建、编辑、删除、导出）的显示/隐藏
6. THE Platform SHALL 支持以下预置角色的权限配置：超级管理员（全部权限）、门店管理员（本店运营权限）、美容师（查看排班和预约）、收银员（订单和核销权限）、库存管理员（库存和采购权限）

### 需求 11：API 层 Mock/真实模式切换

**用户故事：** 作为开发者，我希望 API 层能够通过环境变量在 Mock 数据和真实后端 API 之间无缝切换，以便在无后端环境下继续前端开发。

#### 验收标准

1. THE Platform SHALL 通过环境变量 `VITE_API_MODE`（值为 `mock` 或 `real`）控制 API_Layer 的运行模式
2. WHILE VITE_API_MODE 为 `mock` 时，THE API_Layer SHALL 返回本地 Mock 数据，行为与当前实现一致
3. WHILE VITE_API_MODE 为 `real` 时，THE API_Layer SHALL 通过 Axios apiClient 调用后端 REST API
4. THE API_Layer SHALL 为每个 API 模块（product、inventory、customer、order 及新增模块）同时维护 Mock 实现和真实 API 调用实现
5. THE Platform SHALL 确保 Mock 模式和真实模式下 API 函数的签名（参数和返回类型）完全一致
6. WHEN VITE_API_MODE 环境变量未设置时，THE Platform SHALL 默认使用 `mock` 模式
7. THE Platform SHALL 为新增的业务模块（认证、排班、门店、角色权限、营销、BOM 消耗等）补充对应的 API 模块文件
