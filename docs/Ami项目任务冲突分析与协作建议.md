# Ami 项目任务冲突分析与协作建议

分析时间：2026-06-07  
项目路径：`D:\AI coding\beauty-salon-admin`  
当前分支：`codex/ami-aura-lite-kiosk`  
对比基线：`main`

## 1. 当前结论

当前 Ami 项目最主要的冲突风险来自两层：

1. 当前分支已经不是一个小功能分支，而是一个大集成分支。它相对 `main` 涉及 629 个文件，覆盖管理端、后端、Terminal、Kiosk、marketing-h5、权限、路由、API、Prisma、依赖和文档。
2. 当前工作区还有未提交改动，集中在 `packages/Ami-Aura-Lite-Kiosk`，正在做 Terminal/Kiosk 数据加载缓存、预取、后台刷新和缓存失效。这类改动会和任何“终端业务流程”“角色首页”“门店切换”“预约/收银/核销/客户/库存数据刷新”的任务发生冲突。

因此，后续不建议在同一个工作区同时推进多个 Codex 任务。尤其是管理端、后端、Kiosk、Terminal 数据协议这几条线，应该按任务域串行或使用独立 worktree/分支。

## 2. 当前未提交改动的冲突点

当前未提交改动文件：

- `packages/Ami-Aura-Lite-Kiosk/src/app/AppContent.tsx`
- `packages/Ami-Aura-Lite-Kiosk/src/app/microApps/microAppTypes.ts`
- `packages/Ami-Aura-Lite-Kiosk/src/app/microApps/runMicroApp.ts`
- `packages/Ami-Aura-Lite-Kiosk/src/app/services/auraCoreService.ts`
- `packages/Ami-Aura-Lite-Kiosk/src/app/services/terminalQueryClient.ts`
- `docs/管理平台数据加载性能优化建议方案.md`

这组改动本质上是一项“Terminal/Kiosk 数据加载性能优化”任务，主要内容包括：

- 新增终端查询缓存 `terminalQueryClient`
- 给 micro app 运行结果增加缓存元信息和后台刷新结果
- 对 manager、beautician、reception、cashier、verify 等动作做预取
- 在门店切换时清理查询缓存
- 在预约、收银、核销、客户、排班、库存等业务动作后做精细化缓存失效

### 高冲突任务

这些任务如果并行推进，容易直接覆盖或逻辑冲突：

- Kiosk 角色首页优化
  - 冲突文件：`AppContent.tsx`、`runMicroApp.ts`、`RoleDashboards.tsx`、`auraCoreService.ts`
  - 原因：当前任务已经改变首页加载、预取、消息刷新和角色数据读取方式。

- Kiosk 指令/意图识别优化
  - 冲突文件：`runMicroApp.ts`、`microAppTypes.ts`、`intentRouter.ts`、`commandRegistry.ts`
  - 原因：当前任务把部分 action 接入缓存分发，如果另一任务同时改 action 映射或返回结构，容易出现“指令能识别但渲染/刷新错位”。

- Terminal 预约、收银、核销、开卡、充值、客户建档流程
  - 冲突文件：`auraCoreService.ts`、`runMicroApp.ts`、各 flow card 组件
  - 原因：当前任务新增了业务动作后的缓存失效规则，另一任务如果改业务写入流程但没有同步失效策略，会出现页面显示旧数据。

- 门店切换、角色切换、设备登录
  - 冲突文件：`AppContent.tsx`、`auraCoreService.ts`、`terminalQueryClient.ts`
  - 原因：缓存 key 已经按门店隔离，切换流程必须保持清缓存和重新预取，否则会串门店数据。

- Terminal 后端接口字段调整
  - 冲突文件：`src/api/terminal.ts`、`src/api/real/terminal.ts`、`src/types/terminal.ts`、`packages/server-v2/src/terminal/*`、`auraCoreService.ts`
  - 原因：Kiosk 当前缓存的是接口结果。如果字段、分页、响应格式变化，需要同步修改缓存 key、TTL、失效范围和渲染组件。

### 中冲突任务

这些任务可并行，但必须明确边界：

- 只改 Kiosk 某个展示卡片样式
  - 可以并行，但不要改数据加载、props 类型和 action 分发。

- 新增独立 micro app
  - 可以并行，但需要先约定 action 名、返回 payload 类型、是否需要缓存、缓存失效时机。

- 只写 Terminal/Kiosk 文档
  - 可以并行，但文档必须以当前分支为基准，不要引用旧目录 `packages/Ami Aura Lite Kiosk Prototype`。

### 低冲突任务

这些任务基本不影响当前未提交改动：

- 纯营销 H5 页面视觉调整
- 独立产品文档补充
- 不触碰接口契约的静态文案调整
- 不修改公共组件和 API 的单页面小改动

## 3. 当前集成分支中的大任务域冲突

当前 `codex/ami-aura-lite-kiosk` 分支相对 `main` 覆盖面很大，主要任务域如下。

### 3.1 后端 server-v2 与 Prisma

涉及范围：

- `packages/server-v2`
- `packages/server-v2/prisma/schema.prisma`
- `packages/server-v2/prisma/migrations/*`
- `packages/server-v2/src/terminal/*`
- `packages/server-v2/src/marketing-pages/*`
- `packages/server-v2/src/ai/*`
- `packages/server-v2/src/orders/*`
- `packages/server-v2/src/customers/*`
- `packages/server-v2/src/marketing/*`

冲突风险：

- 数据库 schema 和迁移不可随意并行改。
- Terminal、营销页、订单、客户、AI 网关都已经接入后端主线。
- 如果另一个任务也新增表、改字段、改 DTO，后续合并时容易出现迁移顺序冲突、字段不一致、前后端类型不匹配。

建议：

- 数据库/后端任务串行。
- 每次只允许一个任务修改 `schema.prisma` 和 migrations。
- 新增业务接口时，先定义接口契约，再改后端，再改前端调用。

### 3.2 管理端 API 与真实后端切换

涉及范围：

- `src/api/*`
- `src/api/real/*`
- `src/api/mock/*`
- `src/api/client.ts`
- `src/types/*`

冲突风险：

- 项目已经从 mock/real 双模式转向 real 主线。
- 如果后续任务继续按旧 mock 模式补接口，会造成重复维护。
- `client.ts` 已统一响应解包、鉴权、门店 ID、错误格式，不能被单任务随意改。

建议：

- API 任务和页面任务不要同时改同一个业务模块。
- 新业务优先改 `server-v2` 和 `src/api/real/*`。
- mock 只用于测试样例和离线 fixture，不作为新业务主线。

### 3.3 管理端页面、路由、权限

涉及范围：

- `src/app/routes.tsx`
- `src/app/components/Layout.tsx`
- `src/config/permissions.ts`
- `src/app/pages/*`
- `src/hooks/usePermission.ts`

冲突风险：

- 路由、菜单、权限码是全局共享入口。
- 多个任务同时新增页面或菜单，最容易在 `routes.tsx`、`Layout.tsx`、`permissions.ts` 上产生冲突。
- 权限码如果重复或命名不一致，会导致页面能进但按钮不可用，或菜单隐藏。

建议：

- 新页面任务必须同时说明：路由、菜单位置、权限码、角色可见性。
- 多个页面任务可以并行，但最后由一个“路由权限收口任务”统一合并。
- 权限调整不要和页面视觉调整混在同一个任务里。

### 3.4 Kiosk / Ami Aura Lite

涉及范围：

- `packages/Ami-Aura-Lite-Kiosk`
- `packages/Ami-Aura-Lite-Kiosk/src/app/AppContent.tsx`
- `packages/Ami-Aura-Lite-Kiosk/src/app/services/auraCoreService.ts`
- `packages/Ami-Aura-Lite-Kiosk/src/app/microApps/runMicroApp.ts`
- `packages/Ami-Aura-Lite-Kiosk/src/app/components/*`
- `packages/Ami-Aura-Lite-Kiosk/src/app/types.ts`

冲突风险：

- 当前 Kiosk 是独立主线，但依赖管理端类型、Terminal API 和后端数据。
- `AppContent.tsx` 和 `auraCoreService.ts` 是超高冲突文件，很多任务都会想改。
- 当前未提交性能优化正在改缓存、预取、刷新和失效策略，不适合与业务流程改造并行。

建议：

- 先完成并提交当前性能优化任务。
- 后续 Kiosk 任务按“意图识别”“数据服务”“组件展示”“业务写入流程”拆开。
- 任何业务写入流程都必须补充对应缓存失效规则。

### 3.5 marketing-h5 与营销页生成器

涉及范围：

- `packages/marketing-h5`
- `src/app/components/MarketingPageGeneratorDialog.tsx`
- `src/app/pages/MarketingPageManagement.tsx`
- `src/utils/marketingPageGenerator.ts`
- `src/api/marketingPage.ts`
- `packages/server-v2/src/marketing-pages/*`

冲突风险：

- marketing-h5 是独立包，但依赖后端 marketing-pages。
- 如果一边改生成器，一边改落地页接口，会出现生成数据结构与 H5 渲染不一致。

建议：

- 生成器、H5 渲染、后端保存发布接口三者不要拆成三个并行任务，除非先冻结 schema。
- 视觉优化可以独立做，但不要改 tracking、attribution、publish payload。

## 4. 推荐的后续任务排期

### 第一优先级：先收口当前未提交改动

当前未提交改动已经触碰 Kiosk 核心加载链路，建议先做完：

1. 跑 `packages/Ami-Aura-Lite-Kiosk npm run build`
2. 验证角色首页、门店切换、预约、收银、核销至少一个核心流程
3. 检查 `terminalQueryClient.ts` 中文文案编码是否正常
4. 提交当前性能优化任务

在这之前，不建议开启新的 Kiosk/Terminal 并行任务。

### 第二优先级：合并或冻结当前大集成分支

当前分支相对 `main` 已经累计太多内容。后续每多开一个任务，都会把冲突继续放大。

建议选择一种策略：

- 策略 A：把 `codex/ami-aura-lite-kiosk` 作为新的集成基线，后续所有任务都从它切分支。
- 策略 B：把该分支拆成几个可验证 PR/提交域：后端、管理端、Kiosk、marketing-h5、文档。
- 策略 C：如果暂时不合并，就冻结 `main` 上同领域开发，避免双线演进。

产品推进上，推荐策略 A：先把当前分支当作事实基线，后续 Codex 任务都从它继续。

### 第三优先级：按任务域开线程

推荐并行组合：

- 可并行：
  - 文档/产品方案
  - marketing-h5 纯视觉
  - 管理端单个页面样式
  - 不改 API 的文案和空状态优化

- 谨慎并行：
  - 管理端页面功能 + 后端接口
  - Kiosk 展示组件 + Kiosk 数据服务
  - 营销页生成器 + H5 渲染

- 不建议并行：
  - Prisma schema/migration
  - `src/api/client.ts`
  - `src/app/routes.tsx`
  - `src/config/permissions.ts`
  - `packages/Ami-Aura-Lite-Kiosk/src/app/AppContent.tsx`
  - `packages/Ami-Aura-Lite-Kiosk/src/app/services/auraCoreService.ts`
  - `packages/Ami-Aura-Lite-Kiosk/src/app/microApps/runMicroApp.ts`

## 5. 给 Codex 下任务时的建议模板

### 5.1 普通页面任务

请基于当前分支最新代码，只修改【页面/模块名】相关文件。不要修改路由、权限、API client、数据库 schema、Kiosk 目录。开始前先检查 git status，保留已有未提交改动。

### 5.2 后端接口任务

请只处理【业务模块】的后端接口和对应前端 real API。涉及 Prisma schema/migration 时先列出变更点，不要同时改管理端页面视觉和 Kiosk。完成后运行后端 build/test，并说明影响到的前端接口。

### 5.3 Kiosk/Terminal 任务

请只处理 `packages/Ami-Aura-Lite-Kiosk` 内的【具体流程/组件】。不要改 `src/api/client.ts`、管理端路由、权限和 Prisma schema。如需改 Terminal API，先列出字段契约。涉及写入动作时必须同步缓存失效规则。

### 5.4 文档/方案任务

请输出完整文档并保存到项目 `docs/` 目录。不要修改代码、依赖、构建配置和历史资料目录。

## 6. 冲突预警清单

后续只要任务描述中出现这些关键词，就应默认高风险，需要先确认边界：

- 数据库
- Prisma
- migration
- 权限
- 路由
- 菜单
- API client
- mock/real
- Terminal API
- Kiosk 首页
- Ami Aura Lite
- 门店切换
- 角色切换
- 收银
- 核销
- 预约
- 客户建档
- 营销页发布
- AI Gateway

## 7. 一句话建议

当前 Ami 项目已经进入“大集成分支 + Kiosk 核心性能改造未提交”的状态。后续最稳的方式是：先收口并提交当前 Kiosk 性能优化，再把 `codex/ami-aura-lite-kiosk` 定为新的任务基线；之后按后端、管理端、Kiosk、marketing-h5、文档分域开任务，任何涉及全局入口、数据库、API 契约和 Kiosk 数据服务的任务都串行推进。
