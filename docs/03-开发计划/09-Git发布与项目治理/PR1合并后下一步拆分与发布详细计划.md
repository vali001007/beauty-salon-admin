# PR1 合并后下一步拆分与发布详细计划

更新时间：2026-06-18

适用仓库：`D:\AI coding\beauty-salon-admin`

当前基线：

- PR #1：`Ami Aura Lite integration and admin workflow updates`
- PR 状态：已合并到 `main`
- Merge commit：`89dd155`
- 当前本地分支：`codex/ami-aura-lite-kiosk`
- 当前本地 HEAD：`7fc39cf`
- 当前分支与远端 feature 分支：ahead/behind 为 `0/0`
- 当前工作区：仍存在 6 月 18 日的一批未提交业务改动

## 1. 当前状态判断

### 1.1 已完成事项

PR #1 已完成以下闭环：

- Draft PR 转 Ready。
- CI 路径修复。
- `frontend`、`backend`、`terminal-prototype` GitHub Actions 全部通过。
- PR #1 已合并到 `main`。

这意味着 6 月 15 日那批阶段性集成成果已经进入主线。

### 1.2 当前未提交改动规模

当前工作区还有一批未提交改动：

- 已修改文件：约 86 个
- 未跟踪文件：约 115 个
- 主要目录：
  - `packages/`
  - `src/`
  - `docs/`
  - `scripts/`
  - `.github/`

这批改动不应直接 `git add .` 后提交，也不建议继续压入已经合并的 PR #1 语境中。

### 1.3 当前风险

| 风险 | 影响 | 处理建议 |
| --- | --- | --- |
| 本地改动横跨多条业务线 | PR 审查困难，回滚困难 | 拆成多轮 PR |
| Agent / 语义查询 / 营销推荐 / Kiosk 同时变更 | 验证矩阵复杂 | 按业务闭环拆分 |
| `.github/workflows/ci.yml` 仍有未提交新 job | 可能改变 CI 门禁 | 单独评估，不混入业务提交 |
| Prisma schema 与 migrations 有新变化 | 数据库升级风险 | 单独提交并跑后端验证 |
| `packages/Ami-Aura-Lite-Kiosk` 改动多 | 容易和已合并主线产生语义冲突 | 单独 Kiosk PR |
| `marketing-h5` 与活动预览共享渲染变更 | 影响公开营销页 | 单独 H5/营销页 PR |

## 2. 总体策略

下一阶段采用“三轮 PR + 每轮独立验证”的方式推进。

推荐顺序：

```text
PR2：营销推荐与权益资产闭环
PR3：Ami 经营 Agent / 语义查询中枢
PR4：Kiosk 快捷功能、经营结果与端侧交互增强
```

原因：

- 营销权益闭环最贴近当前管理端业务价值，可以先落主线。
- Agent / 语义查询属于架构型能力，涉及模块多，应独立审查。
- Kiosk 端改动多且有 E2E/端侧验证要求，适合最后单独验证。

## 3. 开工前统一要求

执行任何提交前，先做以下检查：

```powershell
git status --short --branch
git diff --stat
git diff --cached --stat
```

约束：

- 不使用 `git add .`。
- 不批量删除文件。
- 每次提交前用 `git diff --cached --name-only` 检查暂存区。
- 每轮 PR 只包含一个业务主题。
- 每轮 PR 都必须有本地验证结果。
- 如果 `.github/workflows/ci.yml` 变更不是当前 PR 主题，先不要提交。

## 4. PR2：营销推荐与权益资产闭环

### 4.1 目标

把“精准营销推荐 + 权益资产库 + 活动承接”的业务闭环先独立进入主线。

产品目标：

- 推荐卡不只是展示，而是能承接权益、活动、跟进动作。
- 管理端能看清推荐原因、可用权益、预计收益和下一步动作。
- 后端能保存必要快照，减少推荐结果不稳定或无法追溯的问题。

### 4.2 预计范围

后端：

```text
packages/server-v2/prisma/schema.prisma
packages/server-v2/prisma/migrations/20260615143000_promotion_asset_library/
packages/server-v2/prisma/migrations/20260616093000_marketing_activity_promotion_link/
packages/server-v2/prisma/migrations/20260616133000_marketing_recommendation_snapshot/
packages/server-v2/prisma/seed-promotion-assets.ts
packages/server-v2/prisma/seed-promotion-assets-runner.ts
packages/server-v2/src/marketing/**
packages/server-v2/src/promotions/**
packages/server-v2/src/customer-app/**
```

前端：

```text
src/api/marketing.ts
src/api/promotion.ts
src/api/real/marketing.ts
src/api/real/promotion.ts
src/api/real/recommendation.ts
src/app/pages/MarketingRecommendation.tsx
src/app/pages/MarketingStrategy.tsx
src/app/pages/MarketingWorkbench.tsx
src/app/pages/PromotionManagement.tsx
src/app/components/MarketingEffectDetailDialog.tsx
src/types/marketing.ts
src/types/promotion.ts
src/utils/marketingRecommendation.ts
src/config/marketingAssets.ts
src/config/marketingAssets.test.ts
```

文档：

```text
docs/02-产品设计/美容行业成熟热门权益资产库清单.md
docs/03-开发计划/精准营销推荐与权益匹配详细开发计划.md
docs/03-开发计划/客户画像驱动权益资产库营销闭环详细开发计划.md
```

### 4.3 建议提交拆分

提交 1：权益资产模型与 seed

```text
feat(api): add promotion asset library models and seed data
```

提交 2：营销推荐快照与权益匹配

```text
feat(marketing): enrich recommendations with promotion asset matching
```

提交 3：管理端推荐卡和权益承接

```text
feat(admin): connect recommendation cards to promotion actions
```

提交 4：测试与文档

```text
test: cover promotion matching and marketing recommendation snapshots
```

### 4.4 验证命令

```powershell
npm.cmd run test
npm.cmd run build
npm.cmd run check:api

Set-Location "packages/server-v2"
npm.cmd run build
npm.cmd run test -- --runInBand
```

如涉及 seed：

```powershell
Set-Location "packages/server-v2"
npm.cmd run db:generate
```

### 4.5 Go / No-Go

可以开 PR2：

- 营销推荐、权益、活动承接相关改动已拆清。
- 后端测试通过。
- 管理端构建通过。
- migration 风险已在 PR 描述中说明。

不能开 PR2：

- 混入 Agent / Kiosk / H5 大量无关改动。
- seed 脚本无法解释数据来源。
- 推荐结果只能展示，不能承接动作。

## 5. PR3：Ami 经营 Agent 与语义查询中枢

### 5.1 目标

把经营问答、语义查询、Agent 编排从“功能尝试”整理成可审查的后端能力层。

产品目标：

- 支持经营类自然语言问题。
- 查询结果有解释、证据和权限边界。
- Agent 不直接绕过业务权限或裸查数据库。
- 为后续“老板问数”“运营建议”“自动分析”打基础。

### 5.2 预计范围

后端：

```text
packages/server-v2/prisma/migrations/20260616170000_agent_runtime/
packages/server-v2/src/agent/**
packages/server-v2/src/business-query/**
packages/server-v2/src/semantic-data/**
packages/server-v2/src/semantic-query/**
packages/server-v2/src/semantic-sql/**
packages/server-v2/src/app.module.ts
packages/server-v2/package.json
```

前端：

```text
src/api/agent.ts
src/api/businessQuery.ts
src/api/real/agent.ts
src/api/real/businessQuery.ts
src/app/pages/system/AgentAuditPage.tsx
src/types/agent.ts
src/types/businessQuery.ts
src/shared/**
```

脚本：

```text
scripts/check-ami-query-hub.mjs
scripts/check-ami-semantic-agent.mjs
```

文档：

```text
docs/02-产品设计/Ami_AI问数与运营数据查询需求文档.md
docs/02-产品设计/Ami智能问答Text-to-SQL方案对比分析.md
docs/02-产品设计/Ami智能问答架构方案比选.md
docs/02-产品设计/Ami经营Agent编排平台技术方案.md
docs/02-产品设计/Ami经营语义中枢与智能问答重构方案.md
docs/03-开发计划/Ami智能问答全领域覆盖矩阵.md
docs/03-开发计划/Ami智能问答查询中枢合并基线清单.md
docs/03-开发计划/Ami智能问答查询中枢合并重构详细开发计划.md
docs/03-开发计划/Ami经营Agent详细开发计划.md
docs/03-开发计划/Ami经营语义中枢详细开发计划.md
```

### 5.3 建议提交拆分

提交 1：语义数据与查询服务

```text
feat(api): add semantic data and business query services
```

提交 2：Agent 编排与安全策略

```text
feat(agent): add guarded business agent orchestration
```

提交 3：管理端审计与 API 接入

```text
feat(admin): add agent audit and business query clients
```

提交 4：检查脚本与文档

```text
test: add semantic query and agent guard checks
```

### 5.4 验证命令

```powershell
npm.cmd run check:api
npm.cmd run build
npm.cmd run test

Set-Location "packages/server-v2"
npm.cmd run build
npm.cmd run test -- --runInBand
```

如脚本已接入根命令：

```powershell
npm.cmd run check:ami-query-hub
npm.cmd run check:ami-semantic-agent
```

### 5.5 特别风险

- Text-to-SQL 不能默认直连生产数据库裸执行。
- 必须保留字段白名单、权限范围和查询成本限制。
- Agent 输出必须包含证据或数据来源，避免经营建议不可追溯。
- 不建议和营销权益 PR 混在一起。

## 6. PR4：Kiosk 快捷功能与经营结果展示

### 6.1 目标

把 Ami Aura Lite 终端的快捷功能、角色看板、经营结果、智能命令栏整理成独立端侧 PR。

产品目标：

- 终端命令能覆盖高频门店操作。
- 角色看板展示更贴近岗位任务。
- 经营结果不只是提示，而是能进入具体动作。
- 与管理端已有模块保持匹配，不制造孤岛入口。

### 6.2 预计范围

Kiosk：

```text
packages/Ami-Aura-Lite-Kiosk/src/app/AppContent.tsx
packages/Ami-Aura-Lite-Kiosk/src/app/components/RoleDashboards.tsx
packages/Ami-Aura-Lite-Kiosk/src/app/components/SmartCommandBar.tsx
packages/Ami-Aura-Lite-Kiosk/src/app/components/TopStatusBar.tsx
packages/Ami-Aura-Lite-Kiosk/src/app/intent/**
packages/Ami-Aura-Lite-Kiosk/src/app/microApps/**
packages/Ami-Aura-Lite-Kiosk/src/app/services/auraCoreService.ts
packages/Ami-Aura-Lite-Kiosk/src/app/types.ts
packages/Ami-Aura-Lite-Kiosk/e2e/**
playwright.kiosk.config.ts
```

后端终端支撑：

```text
packages/server-v2/src/terminal/**
packages/server-v2/src/beauticians/beauticians.service.ts
packages/server-v2/src/customer-app/**
```

文档：

```text
docs/03-开发计划/Ami_Aura_Lite_快捷功能与管理端匹配清单.md
```

### 6.3 建议提交拆分

提交 1：命令与意图增强

```text
feat(kiosk): add action commands and intent routing
```

提交 2：角色看板和经营结果展示

```text
feat(kiosk): enhance role dashboards with business results
```

提交 3：后端终端支撑

```text
feat(api): support terminal role access and follow-up actions
```

提交 4：Kiosk E2E 与文档

```text
test(kiosk): cover command bar and role dashboard workflows
```

### 6.4 验证命令

```powershell
Set-Location "packages/Ami-Aura-Lite-Kiosk"
npm.cmd run build
```

如果 E2E 配置完整：

```powershell
npx.cmd playwright test -c playwright.kiosk.config.ts
```

后端支撑验证：

```powershell
Set-Location "packages/server-v2"
npm.cmd run build
npm.cmd run test -- terminal
```

### 6.5 特别风险

- 不要让 Kiosk 快捷入口指向管理端不存在或未授权的功能。
- 角色看板不要只做展示，要有下一步动作入口。
- E2E 需要明确 dev server、端口和登录/设备态。

## 7. PR5：marketing-h5 与活动页共享渲染

### 7.1 目标

如果当前 `marketing-h5` 和活动预览页改动较完整，应单独拆一轮 PR，确保管理端预览与发布后的 H5 页面视觉和内容结构一致。

### 7.2 预计范围

```text
packages/marketing-h5/**
src/app/components/ActivityMiniPage.tsx
src/app/components/MarketingPageGeneratorDialog.tsx
src/app/pages/MarketingActivityEffect.tsx
src/app/pages/MarketingPageManagement.tsx
src/shared/**
packages/server-v2/src/marketing-pages/**
```

### 7.3 验证命令

```powershell
npm.cmd run build
npm.cmd run build:marketing-h5
```

如需要运行态验证：

```powershell
npm.cmd run dev
npm.cmd run dev:marketing-h5
```

验收重点：

- 管理端预览与公开 H5 使用同一套渲染数据结构。
- 未发布页面不能被公开读取。
- 发布后页面、预览页面、活动效果页的跳转关系清楚。

## 8. 文档与市场资料处理

当前新增了多份产品和市场文档，建议单独提交，不和代码混在一起。

范围：

```text
docs/01-市场调研/美容院成本与盈利明细调研报告-2026-06-18.md
docs/02-产品设计/*.md
docs/03-开发计划/*.md
```

建议提交：

```text
docs: add next-stage product plans and market research
```

要求：

- 文档可以先于代码进入 PR，但要注明哪些是方案，哪些已实现。
- 不要把调研结论包装成已落地能力。
- 若文档引用外部趋势或市场数据，后续对外发布前需要补来源。

## 9. CI 处理建议

当前 `.github/workflows/ci.yml` 本地还有未提交变更，包括新增 `ami-semantic-agent` job。

建议：

- 不要把新增 CI job 混入 PR2。
- 如果确实要接入 `ami-semantic-agent`，单独做 PR 或放入 PR3。
- 接入前先本地确认：

```powershell
npm.cmd run check:ami-semantic-agent
```

以及确认 GitHub Actions 环境具备：

- 根依赖安装
- `packages/server-v2` 依赖安装
- `packages/Ami-Aura-Lite-Kiosk` 依赖安装
- Playwright Chromium 安装
- 测试数据库或 mock 策略

## 10. 推荐时间线

### Day 1：PR2 营销权益闭环

- 梳理权益资产与营销推荐相关文件。
- 暂存并提交 PR2。
- 跑后端测试、根构建、根测试。
- 创建 Draft PR2。

### Day 2：PR2 修复与合并

- 根据 CI 结果修复。
- 产品确认推荐卡动作闭环。
- Ready PR2。
- 合并 PR2。

### Day 3：PR3 Agent / 语义查询

- 拆 Agent、business-query、semantic-*。
- 跑后端完整测试。
- 接入或延后 `ami-semantic-agent` CI。
- 创建 Draft PR3。

### Day 4：PR4 Kiosk

- 拆端侧命令、角色看板、E2E。
- 跑 Kiosk build。
- 跑必要端侧测试。
- 创建 Draft PR4。

### Day 5：PR5 H5 渲染一致性与收尾

- 拆 marketing-h5 / shared renderer。
- 验证管理端预览与公开页一致。
- 处理文档 PR。
- 评估是否打 `v0.8.0-rc.1`。

## 11. 发布建议

当前不建议直接正式发布。

推荐发布节奏：

```text
PR2 合并后：可做营销权益闭环内部验收
PR3 合并后：可做 Agent/问数能力技术验收
PR4 合并后：可做 Kiosk 端业务验收
PR5 合并后：可考虑 v0.8.0-rc.1
```

正式 release 需要满足：

- `main` 全部 CI 通过。
- 数据库 migrations 可执行。
- 后端、管理端、Kiosk、小程序各自构建通过。
- 核心业务链路完成产品验收。
- 未提交工作区清空或转移到明确后续分支。

## 12. 下一步最小动作

建议现在执行以下最小动作：

```powershell
# 1. 确认当前工作区
git status --short --branch

# 2. 先只整理文档提交，或直接开始 PR2 文件分组
git diff --stat

# 3. 查看营销权益相关改动
git diff -- packages/server-v2/src/marketing packages/server-v2/src/promotions src/app/pages/MarketingRecommendation.tsx src/app/pages/PromotionManagement.tsx

# 4. 暂存 PR2 相关文件，禁止 git add .
git add <PR2相关文件>

# 5. 提交前复核
git diff --cached --stat
git diff --cached --name-only
```

推荐优先选择：

```text
先做 PR2：营销推荐与权益资产闭环
```

这是当前最有业务交付价值、也最适合从本地大改动中拆出来的第一轮 PR。
