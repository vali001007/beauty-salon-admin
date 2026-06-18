# Ami_Core 生产化计划

## 背景与目标

将当前 mock 优先的演示系统升级为正式可用的生产系统。涵盖三大端：Core 管理后台、AI 网关、智能终端 Aura Lite。

**关键决策**：
- 后端：基于 NestJS 重建（替代现有 Express 内存骨架）
- 国际化：引入 i18n 预留多语言
- 部署：云平台 PaaS（Vercel 前端 + 容器化后端 + 云数据库）
- 范围：全量上线（Core + AI + Terminal）

---

## 当前状态评估

| 维度 | 完成度 | 说明 |
|------|--------|------|
| 前端 UI | 95% | 30+ 页面全部有实质功能，无占位页 |
| 后端 API | 骨架 | 120+ 路由定义，但全部内存数据，无持久化 |
| 认证安全 | 0% | 硬编码 token，无密码哈希，无 JWT |
| 数据库 | 0% | Prisma schema 已设计（27 模型），从未连库/迁移 |
| 测试 | 40% | 仅 API mock 层测试，无组件/e2e 测试 |
| CI/CD | 0% | 无任何自动化流水线 |
| i18n | 0% | 全部硬编码中文 |
| 终端 Aura Lite | 主线原型 | packages/Ami-Aura-Lite-Kiosk 作为当前 kiosk 应用主线 |

---

## 阶段规划

### 第一阶段：基础设施与后端重建（4-5 周）

#### 1.1 NestJS 后端搭建（第 1-2 周）

**目标**：以 `packages/server-v2` 作为唯一后端主线，接入 PostgreSQL，实现核心 CRUD、AI Gateway 与兼容入口。

**技术选型**：
- 框架：NestJS 11 + TypeScript
- ORM：Prisma 7（复用现有 schema.prisma 的 27 个模型）
- 数据库：PostgreSQL 16（云托管）
- 缓存：Redis（会话、限流、AI 调用计数）
- 认证：Passport + JWT（access token + refresh token）
- 校验：class-validator + class-transformer（或 Zod）
- 文档：Swagger/OpenAPI 自动生成
- 日志：Pino（结构化日志）

**模块划分**（按 NestJS Module 组织）：

```
packages/server-v2/
├── src/
│   ├── app.module.ts
│   ├── main.ts
│   ├── common/              # 通用：guards, interceptors, filters, pipes
│   │   ├── guards/auth.guard.ts, roles.guard.ts, permissions.guard.ts
│   │   ├── interceptors/logging.interceptor.ts, transform.interceptor.ts
│   │   ├── filters/http-exception.filter.ts
│   │   ├── pipes/validation.pipe.ts
│   │   └── decorators/permissions.decorator.ts, current-user.decorator.ts
│   ├── auth/                # 认证模块
│   ├── users/               # 用户管理
│   ├── roles/               # 角色与权限
│   ├── stores/              # 门店管理
│   ├── customers/           # 客户管理（含画像、消费记录、健康档案）
│   ├── products/            # 商品管理（含分类）
│   ├── projects/            # 项目管理（含项目类型、BOM）
│   ├── beauticians/         # 美容师管理（含等级）
│   ├── orders/              # 订单管理（商品订单、次卡开卡、核销）
│   ├── cards/               # 次卡管理
│   ├── inventory/           # 库存管理（库存、采购、调拨、过期、消耗）
│   ├── scheduling/          # 排班管理
│   ├── reservations/        # 预约管理
│   ├── marketing/           # 营销管理（活动、自动化策略、推荐）
│   ├── ai/                  # AI 网关（chat、generate、recommend）
│   ├── terminal/            # 终端 API（设备、服务任务、收银、皮肤检测）
│   └── prisma/              # Prisma service
├── prisma/
│   ├── schema.prisma        # 从现有迁移过来
│   ├── migrations/
│   └── seed.ts
├── test/                    # e2e 测试
├── Dockerfile
└── package.json
```

**认证体系**：
- 密码：bcrypt 哈希（salt rounds = 12）
- Token：JWT access token（15min）+ refresh token（7d，存 Redis）
- 终端设备：设备码 + 激活码认证，独立 token 体系
- 权限：复用前端 `PERMISSION_CATALOG` 和 `ROLE_PERMISSIONS` 定义，后端强制校验
- 数据范围：基于 `DataScopes` 在查询层自动过滤（own_store/served_customers/self）

**API 响应格式**（与前端约定一致）：
```typescript
// 成功 - 列表
{ items: T[], total: number, page: number, pageSize: number }

// 成功 - 单条
T

// 错误
{ message: string, code: string, status: number, details?: unknown }
```

#### 1.2 数据库与迁移（第 1 周，与 1.1 并行）

- 基于现有 `prisma/schema.prisma` 生成初始迁移
- 补充索引（按查询模式：customer.phone, customer.storeName, product.sku, order.status+createdAt 等）
- 补充软删除字段（`deletedAt`）到需要的模型
- 编写 seed 脚本（基于现有 `prisma/seed.js` 扩展，含完整测试数据）
- 设置 Redis 连接（会话、限流、缓存）

#### 1.3 CI/CD 搭建（第 2 周）

**GitHub Actions 流水线**：
```yaml
# .github/workflows/ci.yml
- lint (ESLint frontend + backend)
- typecheck (tsc --noEmit)
- test:unit (Vitest frontend + Jest backend)
- test:e2e (Playwright)
- build (Vite frontend + NestJS backend)
- deploy:staging (auto on push to develop)
- deploy:production (manual trigger on main)
```

**部署架构**：
- 前端：Vercel（自动部署，利用现有 vercel.json）
- 后端：Railway / Render / Fly.io（容器化 NestJS）
- 数据库：Supabase PostgreSQL 或 Neon
- Redis：Upstash Redis
- 文件存储：Cloudflare R2 或 AWS S3（图片、导入文件）

#### 1.4 核心模块实现（第 2-4 周）

按优先级实现后端模块（每个模块含 CRUD + 分页 + 校验 + 权限）：

**P0 — 系统运转基础**（第 2 周）：
1. `auth` — 登录/注册/刷新/登出/获取用户信息
2. `users` — 用户 CRUD + 密码重置
3. `roles` — 角色 CRUD + 权限分配
4. `stores` — 门店 CRUD

**P1 — 核心业务**（第 3 周）：
5. `customers` — 客户 CRUD + 导入导出 + 消费记录 + 健康档案
6. `products` — 商品 CRUD + 分类管理 + 导入导出
7. `projects` — 项目 CRUD + 项目类型 + BOM
8. `beauticians` — 美容师 CRUD + 等级管理
9. `cards` — 次卡 CRUD + 开卡 + 核销

**P2 — 运营模块**（第 4 周）：
10. `orders` — 商品订单 CRUD + 退款
11. `inventory` — 库存/采购/调拨/过期/消耗 全流程
12. `scheduling` — 排班 CRUD
13. `reservations` — 预约 CRUD + 签到

**P3 — 智能模块**（第 4-5 周）：
14. `marketing` — 活动 CRUD + 自动化策略 + 触发规则引擎 + 执行记录
15. `ai` — AI 网关（Claude API 集成 + 审计日志 + 限流 + 降级）

---

### 第二阶段：前端生产化改造（3-4 周）

#### 2.1 i18n 国际化（第 5-6 周）

**方案**：react-i18next + i18next

**实施步骤**：
1. 安装 `react-i18next`、`i18next`、`i18next-browser-languagedetector`
2. 创建 `src/i18n/` 目录：
   ```
   src/i18n/
   ├── index.ts          # i18n 初始化配置
   ├── locales/
   │   ├── zh-CN/
   │   │   ├── common.json    # 通用（按钮、状态、操作）
   │   │   ├── menu.json      # 菜单导航
   │   │   ├── customer.json  # 客户模块
   │   │   ├── product.json   # 商品模块
   │   │   ├── order.json     # 订单模块
   │   │   ├── marketing.json # 营销模块
   │   │   └── system.json    # 系统设置
   │   └── en/
   │       └── (同结构，后续填充)
   ```
3. 逐模块抽取硬编码文案（优先 Layout 菜单 → 通用组件 → 各页面）
4. 在 `App.tsx` 初始化 i18n provider
5. 语言切换器加入 Layout 顶栏

**工作量估算**：约 2000+ 条文案需抽取，建议按模块分批进行。

#### 2.2 错误处理与 UX 增强（第 5 周）

1. **全局错误边界**：
   - 创建 `src/app/components/ErrorBoundary.tsx`
   - 包裹在 `App.tsx` 最外层
   - 提供「重试」和「返回首页」操作

2. **空状态组件**：
   - 创建 `src/app/components/ui/empty-state.tsx`
   - 所有表格/列表页在数据为空时显示友好提示

3. **网络错误处理**：
   - API client 增加重试逻辑（axios-retry，3 次指数退避）
   - 离线检测 + 提示
   - 超时友好提示

4. **加载状态统一**：
   - 页面级 skeleton loading
   - 按钮提交时 disabled + spinner

5. **修复已知问题**：
   - CustomerData.tsx 中的乱码错误消息
   - Dashboard 硬编码指标改为 API 驱动

#### 2.3 前端 API 层补全（第 6 周）

将 `src/api/real/` 中不完整的模块补全，确保 `VITE_API_MODE=real` 时所有功能正常：

| 模块 | 缺失操作 | 需补充 |
|------|----------|--------|
| order | 创建/修改/删除 | createOrder, updateOrder, deleteOrder |
| inventory | 删除/取消 | cancelPurchaseOrder, cancelTransfer |
| scheduling | 分页/单条操作 | getSchedulePaginated, createSlot, deleteSlot |
| user | 删除/密码重置 | deleteUser, resetPassword |
| role | 删除 | deleteRole |
| store | 删除/分页 | deleteStore, getStoresPaginated |
| beautician | 删除/分页 | deleteBeautician, getBeauticiansPaginated |
| card | 删除/使用创建 | deleteCard, createCardUsage |
| project | 删除 | deleteProject |
| bom | 写操作 | createBom, updateBom, deleteBom |
| recommendation | CRUD | createRecommendation, updateRecommendation, deleteRecommendation |

#### 2.4 性能优化（第 6 周）

1. **路由懒加载**：所有页面组件改为 `React.lazy()` + `Suspense`
2. **代码分割**：Vite 配置 `manualChunks`（vendor/ui/charts 分包）
3. **Bundle 优化**：目标从 828KB gzipped 降至 <400KB
4. **图片优化**：接入 CDN + WebP 格式

#### 2.5 安全加固（第 6 周）

1. Token 存储从 localStorage 迁移到 httpOnly cookie（需后端配合 Set-Cookie）
2. CSRF token 机制
3. CSP 头配置（Vercel headers）
4. 敏感操作二次验证（已有 PasswordConfirmDialog，确保覆盖所有危险操作）

---

### 第三阶段：智能终端 Aura Lite（2-3 周）

#### 3.1 终端前端开发（第 7-8 周）

基于 `packages/Ami-Aura-Lite-Kiosk/` 主线，开发完整的 kiosk 应用：

**核心页面**：
- 设备登录/激活
- 店长驾驶舱（经营数据概览）
- 前台接待（客户搜索、预约签到、收银开单）
- 美容师视图（服务任务列表、开始/完成服务、皮肤检测记录）
- 次卡核销
- 库存查看

**技术方案**：
- 复用 admin 的 UI 组件库（shadcn/ui）
- 独立路由和状态管理
- 设备心跳机制（每 60s 上报状态）
- 离线缓存（关键数据本地存储，网络恢复后同步）

#### 3.2 终端后端 API（第 7 周，与 3.1 并行）

在 NestJS 后端的 `terminal` 模块实现 54 个终端 API 端点（参照 docs/terminal-api.md）：
- 设备管理（登录/心跳/解绑）
- 客户操作（搜索/快速建档/摘要）
- 服务任务（列表/开始/完成/取消）
- 次卡核销（预览/确认）
- 收银/办卡/充值
- 皮肤检测
- 预约管理

---

### 第四阶段：AI 网关正式化（1-2 周）

#### 4.1 LLM 集成（第 8-9 周）

**架构**：
```
前端 → NestJS AI Module → Provider Adapter → Claude API / 备选 LLM
                        ↓
                   Redis (限流/缓存)
                        ↓
                   PostgreSQL (审计日志)
```

**功能**：
- 接入 Claude API（Anthropic SDK）
- Provider 抽象层（支持切换 Claude/OpenAI/本地模型）
- 场景化 prompt 管理（邀约话术、营销文案、客户摘要、皮肤分析等）
- 限流：每用户/每设备/每日额度（Redis 计数）
- 成本控制：每日预算上限，超限降级为缓存响应
- 审计日志：所有 AI 调用记录入库（provider、model、token 用量、耗时）
- 安全：输出过滤（敏感信息脱敏）、输入校验

#### 4.2 AI 功能清单

| 场景 | 端点 | 说明 |
|------|------|------|
| 智能对话 | POST /api/ai/chat/messages | 通用助手对话 |
| 邀约话术 | POST /api/ai/generate/customer-invitation-script | 基于客户画像生成邀约话术 |
| 营销文案 | POST /api/ai/generate/marketing-copy | 多渠道营销文案生成 |
| 活动变体 | POST /api/ai/generate/campaign-variants | A/B 测试变体生成 |
| 客户摘要 | POST /api/ai/generate/customer-summary | 客户数据智能摘要 |
| 服务记录摘要 | POST /api/ai/generate/service-note-summary | 服务记录智能总结 |
| 皮肤分析 | POST /api/ai/generate/skin-test-explanation | 皮肤检测结果解读 |
| 服务建议 | POST /api/ai/generate/terminal-service-advice | 终端服务建议 |
| 下一步行动 | POST /api/ai/recommend/next-best-action | NBA 推荐 |
| 审计日志 | GET /api/ai/audit-logs/paginated | AI 调用审计 |

---

### 第五阶段：测试与质量保障（2 周，贯穿各阶段）

#### 5.1 后端测试

- 单元测试：Jest + NestJS Testing（每个 service 覆盖核心逻辑）
- 集成测试：Supertest（每个 controller 的 API 端点）
- 数据库测试：使用 testcontainers 或独立测试库
- 目标覆盖率：>80%

#### 5.2 前端测试

- 组件测试：React Testing Library（关键组件：LoginPage、CustomerData、Layout）
- Hook 测试：renderHook（usePagination、usePermission）
- 集成测试：关键流程（登录 → 创建客户 → 导出）
- E2E 测试：Playwright（5-10 个核心场景）
- 目标覆盖率：>70%

#### 5.3 质量检查清单

- [ ] TypeScript strict mode（修复 96 处 `any`）
- [ ] 添加 `tsconfig.json`（当前缺失）
- [ ] 修复 TypeScript 版本（^6.0.2 → ^5.7.2）
- [ ] ESLint 零警告
- [ ] 无 console.log 残留
- [ ] 所有表单有完整校验
- [ ] 所有删除操作有确认弹窗
- [ ] 所有列表有空状态
- [ ] 所有异步操作有 loading 状态
- [ ] 响应式适配（移动端基本可用）

---

### 第六阶段：部署与运维（1 周）

#### 6.1 部署架构

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Vercel    │     │  Railway /   │     │  Supabase   │
│  (Frontend) │────▶│  Render      │────▶│ PostgreSQL  │
│             │     │  (NestJS)    │     │             │
└─────────────┘     └──────────────┘     └─────────────┘
                           │
                    ┌──────┴──────┐
                    │   Upstash   │
                    │   Redis     │
                    └─────────────┘
```

#### 6.2 环境配置

```env
# 后端
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=...
JWT_REFRESH_SECRET=...
LLM_PROVIDER=claude
LLM_API_KEY=...
LLM_DAILY_BUDGET=50  # USD
CORS_ORIGINS=https://your-domain.vercel.app

# 前端
VITE_API_MODE=real
VITE_API_BASE_URL=https://api.your-domain.com/api
```

#### 6.3 监控与告警

- 应用监控：Sentry（前端 + 后端错误追踪）
- 性能监控：Vercel Analytics（前端）+ 自定义 metrics（后端）
- 日志聚合：Railway/Render 内置日志 或 Axiom
- 告警：关键错误率 > 1% 时通知

#### 6.4 备份与恢复

- 数据库：每日自动备份（Supabase 内置）
- 代码：Git 分支策略（main → staging → feature branches）

---

## 时间线总览

| 周次 | 阶段 | 交付物 |
|------|------|--------|
| 1-2 | 后端搭建 | NestJS 项目骨架 + DB 迁移 + 认证模块 + CI/CD |
| 3 | 核心业务 | 客户/商品/项目/美容师/次卡 API |
| 4 | 运营模块 | 订单/库存/排班/预约 API |
| 4-5 | 智能模块 | 营销自动化 + AI 网关 |
| 5-6 | 前端改造 | i18n + 错误处理 + API 补全 + 性能优化 + 安全加固 |
| 7-8 | 终端开发 | Aura Lite 完整 kiosk 应用 |
| 8-9 | AI 正式化 | Claude API 集成 + 限流 + 审计 |
| 9-10 | 测试 | 前后端测试 + E2E + 质量修复 |
| 10 | 部署 | 生产环境部署 + 监控 + 文档 |

**总计：约 10 周**（单人全职），可通过并行开发缩短至 7-8 周。

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Prisma schema 与实际业务不匹配 | 迁移返工 | 第 1 周先 review schema，与业务逻辑对照 |
| AI 调用成本超预期 | 预算超支 | 设置每日硬上限 + 缓存高频请求 + 降级策略 |
| 前端 real API 切换后大量 bug | 上线延迟 | 逐模块切换，每切一个跑完整回归 |
| 终端离线场景复杂 | 数据不一致 | 明确离线边界，仅缓存只读数据，写操作必须在线 |
| i18n 抽取工作量大 | 进度拖延 | 先抽取通用 + 菜单，各页面按优先级分批 |

---

## 立即可开始的第一步

1. 创建 `packages/server-v2/` NestJS 项目
2. 迁移 Prisma schema + 生成初始迁移
3. 实现 auth 模块（注册/登录/JWT/刷新）
4. 搭建 GitHub Actions CI
5. 前端添加 `tsconfig.json` + 修复 TypeScript 版本
