# 美业管理平台 — 开发计划

## 当前状态评估

项目目前处于「前端 UI 原型」阶段：25 个页面已完成静态 UI 搭建，全部使用组件内 Mock 数据，无后端 API、无状态管理、无测试、无权限体系。两个页面（商品类型、商品订单管理）仍为占位页。

---

## 阶段一：前端工程化基础（预计 1 周）

目标：建立可持续开发的工程基础设施。

### 1.1 状态管理引入
- 引入 Zustand 或 React Query 作为全局状态管理方案
- 将各页面散落的 Mock 数据抽离到独立的 `src/data/` 或 `src/stores/` 目录
- 定义统一的数据模型层 `src/types/`，整合当前分散在各页面的 TypeScript interface

### 1.2 API 层抽象
- 创建 `src/api/` 目录，按模块封装 API 请求函数（customer、inventory、order、marketing 等）
- 引入 Axios 或使用 fetch 封装统一的请求/响应拦截器
- 定义 API 基础配置（baseURL、超时、错误处理）
- 当前阶段 API 函数内部仍返回 Mock 数据，但接口签名与后端契约一致

### 1.3 测试框架搭建
- 引入 Vitest + React Testing Library
- 为通用组件（UI.tsx、Layout.tsx）编写基础单元测试
- 配置测试覆盖率报告

### 1.4 代码质量工具
- 引入 ESLint + Prettier，统一代码风格
- 配置 Husky + lint-staged，提交前自动检查
- 补充 `tsconfig.json` 严格模式配置

### 1.5 补全占位页面
- 实现「商品类型」页面（/goods/types）：分类树 + CRUD
- 实现「商品订单管理」页面（/orders/products）：订单列表 + 筛选 + 详情弹窗

---

## 阶段二：后端 API 设计与对接（预计 3-4 周）

目标：设计后端服务并逐模块替换 Mock 数据为真实 API 调用。

### 2.1 后端技术选型（建议）
- 运行时：Node.js（NestJS / Express）或 Java（Spring Boot）
- 数据库：PostgreSQL（关系型主库）+ Redis（缓存/会话）
- ORM：Prisma（Node.js）或 MyBatis-Plus（Java）
- 认证：JWT + Refresh Token

### 2.2 数据库设计
按业务域划分核心表：

| 域 | 核心表 |
|----|--------|
| 用户与权限 | users、roles、permissions、user_roles |
| 客户 | customers、customer_tags、customer_consumption_records |
| 门店 | stores、beauticians、beautician_levels、schedules |
| 商品 | product_categories、products、cards、card_projects |
| 订单 | product_orders、order_items、reservations、card_orders、card_usages |
| 库存 | stock_items、stock_batches、purchase_orders、purchase_order_items |
| 调拨 | transfer_orders、transfer_order_items |
| BOM | service_bom、service_bom_items、consumption_records |
| 营销 | marketing_activities、marketing_templates、marketing_recommendations |

### 2.3 API 对接优先级

第一批（核心数据流）：
1. 用户认证（登录/登出/Token 刷新）
2. 产品管理 CRUD + 分类管理
3. 库存管理（库存查询、入库、出库、批次）
4. 客户数据列表 + 搜索筛选

第二批（业务流程）：
5. 采购管理（补货建议、采购订单全流程）
6. 过期管理（临期预警、损耗统计）
7. 门店调拨（库存对比、调拨单）
8. 服务消耗与 BOM

第三批（高级功能）：
9. 排班管理
10. 订单管理（商品订单、预约、次卡）
11. 智能营销（活动管理、效果分析）
12. 仪表盘数据聚合接口
13. 客户画像 + 智能邀约

---

## 阶段三：权限与多门店体系（预计 2 周）

目标：实现 RBAC 权限控制和多门店数据隔离。

### 3.1 认证系统
- 登录页面开发（账号密码 + 验证码）
- JWT Token 管理（存储、自动刷新、过期跳转）
- 路由守卫：未登录重定向到登录页

### 3.2 权限控制
- 定义角色：超级管理员、门店管理员、美容师、收银员
- 前端路由级权限：根据角色动态生成可访问菜单
- 按钮级权限：操作按钮根据权限显示/隐藏
- 侧边栏菜单根据当前用户角色动态渲染

### 3.3 多门店数据隔离
- 顶部栏增加门店切换器
- API 请求自动携带当前门店 ID
- 超级管理员可查看所有门店数据，门店管理员仅看本店

---

## 阶段四：交互完善与体验优化（预计 2 周）

目标：将静态 UI 升级为完整可交互的业务系统。

### 4.1 表单验证与提交
- 所有弹窗表单接入 react-hook-form + zod 校验
- 添加产品、入库、采购订单、调拨等表单的完整验证逻辑
- 提交成功/失败的 Toast 通知（Sonner）

### 4.2 表格功能增强
- 服务端分页、排序、筛选
- 列宽可调整、列显隐配置
- 批量操作（批量删除、批量导出）
- 空状态、加载状态、错误状态的 UI 处理

### 4.3 数据导入导出
- Excel 导入（产品批量导入、客户批量导入）
- Excel/CSV 导出（库存报表、订单报表、损耗报表）
- 引入 xlsx 或 SheetJS 库

### 4.4 暗色主题
- 实现主题切换入口（顶部栏设置按钮）
- 验证所有页面在暗色模式下的显示效果
- CSS 变量已就绪，主要工作是组件适配

### 4.5 响应式适配
- 侧边栏移动端折叠为抽屉
- 表格在小屏幕下横向滚动或切换为卡片视图
- 统计卡片自适应网格

---

## 阶段五：智能功能实现（预计 2-3 周）

目标：落地 AI 相关功能，从展示型 UI 变为真实可用。

### 5.1 AI 补货建议
- 基于历史销售数据的时间序列预测（可用 Prophet 或简单移动平均）
- 考虑季节性、促销活动等因素
- 置信度计算与展示

### 5.2 AI 调拨建议
- 基于各门店库存水位和销售速率的智能匹配算法
- 运输成本和时效的考量
- 建议采纳后自动生成调拨单

### 5.3 智能营销推荐
- 客户分群（RFM 模型）
- 基于客户画像的营销策略匹配
- 活动效果预测

### 5.4 智能邀约话术
- 接入 LLM API（如 OpenAI / Claude）
- 根据客户消费记录和偏好生成个性化话术
- 多轮对话优化

---

## 阶段六：测试与上线准备（预计 2 周）

### 6.1 测试
- 核心业务流程 E2E 测试（Playwright 或 Cypress）
- 关键路径：登录 → 产品管理 → 入库 → 采购 → 调拨
- API 接口测试
- 性能测试（大数据量表格渲染、并发请求）

### 6.2 部署
- Docker 容器化
- CI/CD 流水线（GitHub Actions / GitLab CI）
- 环境配置：开发 / 测试 / 生产
- 静态资源 CDN 部署

### 6.3 监控与日志
- 前端错误监控（Sentry）
- API 请求日志
- 用户行为埋点（关键操作追踪）

### 6.4 文档
- 补全 `guidelines/Guidelines.md` 设计规范
- API 接口文档（Swagger / OpenAPI）
- 用户操作手册

---

## 里程碑总览

| 阶段 | 内容 | 预计周期 | 交付物 |
|------|------|----------|--------|
| 一 | 前端工程化基础 | 1 周 | 状态管理、API 层、测试框架、占位页补全 |
| 二 | 后端 API 设计与对接 | 3-4 周 | 数据库、RESTful API、前后端联调完成 |
| 三 | 权限与多门店体系 | 2 周 | 登录、RBAC、门店切换 |
| 四 | 交互完善与体验优化 | 2 周 | 表单验证、分页、导入导出、暗色主题 |
| 五 | 智能功能实现 | 2-3 周 | AI 补货、AI 调拨、智能营销、智能邀约 |
| 六 | 测试与上线准备 | 2 周 | E2E 测试、CI/CD、监控、文档 |

总计预估：12-14 周（约 3-3.5 个月），按 2-3 人前端 + 1-2 人后端团队配置。

---

## 技术风险与建议

1. Mock 数据与真实数据结构差异：建议尽早与后端确认 API 契约，避免大面积返工
2. 库存模块复杂度高：批次 FIFO、安全库存、多门店调拨涉及较多业务规则，建议优先编写业务逻辑单元测试
3. AI 功能依赖数据积累：初期可用规则引擎替代机器学习模型，待数据量充足后再升级
4. 性能瓶颈预判：库存对比矩阵（多门店 × 多产品）可能数据量大，需考虑虚拟滚动或分页加载
5. 依赖版本：当前 React 18 为 peerDependency 且标记 optional，正式开发前应固定为 dependency
