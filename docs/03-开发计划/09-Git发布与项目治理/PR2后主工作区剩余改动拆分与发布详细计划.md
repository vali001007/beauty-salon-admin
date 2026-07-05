# PR2 后主工作区剩余改动拆分与发布详细计划

更新时间：2026-06-18

适用仓库：`D:\AI coding\beauty-salon-admin`

当前状态：

- 当前分支：`codex/pr3-agent-semantic-query`
- 当前 HEAD：`22cb2a0`
- 当前 `origin/main`：`22cb2a0`
- PR #2：`PR2: 营销推荐与权益资产闭环`
- PR #2 地址：https://github.com/vali001007/beauty-salon-admin/pull/2
- PR #2 状态：已 Ready，并已 squash 合并到 `main`
- PR #2 merge commit：`22cb2a0a65daddd91389ead7b0d87270ac3ecfc8`
- 主工作区仍存在大量未提交改动，主要属于 PR3 / PR4 / PR5 / 纯文档后续范围，不能直接 `git add .`
- 暂存区当前应保持为空；每次分拣前后都要用 `git diff --cached --name-only` 复核
- 本地仍保留 stash 记录，不能在未确认前删除：
  - `stash@{0}: On codex/pr3-agent-semantic-query: wip-after-pr2-merge-before-pr3-base-refresh`
  - `stash@{1}: On codex/pr2-marketing-promotion-loop: wip-after-pr2-before-pr3-split`

## 1. 总体原则

本轮目标不是继续把所有本地改动塞进 PR2，而是先把 PR2 收口，然后把剩余改动拆成独立可审查、可回滚、可验证的 PR。

硬性约束：

- 不使用 `git add .`
- 不批量删除文件
- 不回滚用户已有改动
- 每个 PR 只包含一个业务闭环
- 每次提交前必须执行：

```powershell
git diff --cached --name-only
git diff --cached --stat
```

建议顺序：

```text
阶段 0：PR2 Ready 与合并
阶段 1：创建 PR3 Agent / 语义查询中枢
阶段 2：创建 PR4 Kiosk 快捷功能与终端支撑
阶段 3：创建 PR5 marketing-h5 与活动页共享渲染
阶段 4：创建文档/市场资料 PR 或合并到对应业务 PR
阶段 5：发布 v0.8.0-rc.1 候选
```

## 2. 阶段 0：PR2 Ready 与合并

### 2.1 当前判断

PR2 已完成收口：

- GitHub CI 在合并前已通过
- merge state 为 `CLEAN`
- 本地干净临时 worktree 已完成验证：
  - `npm.cmd run test`：99/99 通过
  - `npm.cmd run build`：通过
  - `packages/server-v2 npm.cmd run build`：通过
  - PR2 后端定向测试：48/48 通过
- 数据库 seed dry-run / verify 的本地失败原因是数据库连接 `ECONNREFUSED`，属于环境前置条件，已写入 PR 描述
- PR2 已通过 GitHub API squash merge 到 `main`

### 2.2 执行动作

已完成：

```text
PR #2 Ready
PR #2 squash merge
main / origin/main 前进到 22cb2a0
```

### 2.3 合并后遗留动作

仍需在后续发布收口时确认：

```powershell
git ls-remote --heads origin codex/pr2-marketing-promotion-loop
```

如果远端 PR2 分支仍存在，且确认不再需要，可清理：

```powershell
git push origin --delete codex/pr2-marketing-promotion-loop
```

不要删除本地 stash；它们是 PR2 合并后恢复工作区时的保险副本。

## 3. 阶段 1：PR3 Agent / 语义查询中枢

### 3.1 目标

把 Ami 经营 Agent、语义查询、业务问数能力从当前大工作区中拆出来，形成独立架构型 PR。

产品目标：

- 支持经营类自然语言问数
- 结果有数据来源、证据和安全边界
- Agent 不绕过业务权限
- 后续可承接老板问数、经营建议、自动分析

### 3.2 预计范围

后端：

```text
packages/server-v2/prisma/migrations/20260616170000_agent_runtime/
packages/server-v2/src/agent/**
packages/server-v2/src/business-query/**
packages/server-v2/src/semantic-data/**
packages/server-v2/src/semantic-query/**
packages/server-v2/src/semantic-sql/**
packages/server-v2/src/terminal/terminal-role-access.ts
packages/server-v2/src/terminal/terminal-role-access.spec.ts
packages/server-v2/src/app.module.ts
packages/server-v2/prisma/schema.prisma
```

前端：

```text
src/api/agent.ts
src/api/businessQuery.ts
src/api/real/agent.ts
src/api/real/businessQuery.ts
src/api/index.ts
src/app/pages/system/AgentAuditPage.tsx
src/app/routes.tsx
src/app/components/Layout.tsx
src/types/agent.ts
src/types/businessQuery.ts
src/types/index.ts
src/test/api.test.ts
```

脚本与 CI：

```text
scripts/check-ami-query-hub.mjs
scripts/check-ami-semantic-agent.mjs
package.json
.github/workflows/ci.yml
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

### 3.3 需要特别拆分的交叉文件

以下文件包含多业务线改动，不能整文件无脑加入：

```text
package.json
packages/server-v2/prisma/schema.prisma
packages/server-v2/src/app.module.ts
src/api/index.ts
src/types/index.ts
src/test/api.test.ts
.github/workflows/ci.yml
src/app/components/Layout.tsx
```

处理方式：

- `schema.prisma` 只暂存 Agent Runtime 相关 model / enum / relation
- `package.json` 只暂存 Agent / query hub 检查脚本
- `api.test.ts` 只暂存 Agent Gateway facade 测试，不带营销已进入 PR2 的内容
- `Layout.tsx` 只暂存 `Agent 审计` 菜单项，不带营销菜单调整
- `.github/workflows/ci.yml` 只在本地 Agent / Query Hub 门禁通过后再纳入

当前不纳入 PR3 的文件：

```text
packages/app/src/api/claude.ts
packages/server-v2/prisma/seed-mvp.ts
packages/server-v2/src/main.ts
AGENTS.md
packages/Ami-Aura-Lite-Kiosk/**
packages/marketing-h5/**
src/shared/**
src/app/pages/CreateMarketing.tsx
src/app/pages/MarketingActivityEffect.tsx
src/app/pages/MarketingPageManagement.tsx
src/app/components/ActivityMiniPage.tsx
src/app/components/MarketingPageGeneratorDialog.tsx
```

说明：

- `packages/app/src/api/claude.ts` 虽然方向上接近 Agent Gateway，但不在本轮 PR3 的主计划范围内；除非后续验证证明它是必需依赖，否则留到单独 PR。
- `terminal-role-access.ts` 被 `business-query` 与 `agent` 控制器直接引用，因此本轮要作为 PR3 的最小后端依赖纳入。
- `check:ami-semantic-agent` 当前脚本会调用 Kiosk focused tests / build / E2E；如果 PR3 不纳入 Kiosk 改动，应先把 PR3 CI 拆成纯后端 Agent + 管理端 API 门禁，Kiosk 门禁移动到 PR4。

### 3.4 建议提交拆分

提交 1：

```text
feat(query): add semantic business query services
```

范围：

```text
packages/server-v2/src/semantic-data/**
packages/server-v2/src/semantic-query/**
packages/server-v2/src/semantic-sql/**
packages/server-v2/src/business-query/**
packages/server-v2/src/terminal/terminal-role-access.ts
packages/server-v2/src/terminal/terminal-role-access.spec.ts
```

提交 2：

```text
feat(agent): add guarded business agent orchestration
```

范围：

```text
packages/server-v2/prisma/migrations/20260616170000_agent_runtime/
packages/server-v2/prisma/schema.prisma
packages/server-v2/src/agent/**
packages/server-v2/src/app.module.ts
```

提交 3：

```text
feat(admin): add agent audit and business query clients
```

范围：

```text
src/api/agent.ts
src/api/businessQuery.ts
src/api/real/agent.ts
src/api/real/businessQuery.ts
src/api/index.ts
src/types/agent.ts
src/types/businessQuery.ts
src/types/index.ts
src/app/pages/system/AgentAuditPage.tsx
src/app/routes.tsx
src/app/components/Layout.tsx
```

提交 4：

```text
test: add agent facade and query guard checks
```

范围：

```text
src/test/api.test.ts
packages/server-v2/src/agent/**/*.spec.ts
packages/server-v2/src/business-query/**/*.spec.ts
packages/server-v2/src/semantic-query/**/*.spec.ts
packages/server-v2/src/semantic-sql/**/*.spec.ts
packages/server-v2/src/semantic-data/**/*.spec.ts
scripts/check-ami-query-hub.mjs
package.json
```

提交 5：

```text
ci: add query and agent validation gates
```

范围：

```text
.github/workflows/ci.yml
```

前置条件：

- 先确认 PR3 不依赖 Kiosk 未提交改动
- 如 `check:ami-semantic-agent` 仍强依赖 Kiosk，应调整为 PR3 专用脚本，或推迟到 PR4

提交 6：

```text
docs: add Ami business query and agent architecture plans
```

### 3.5 验证命令

PR3 最小本地验证：

```powershell
npm.cmd run check:api
npm.cmd run build
npm.cmd run test
npm.cmd run check:ami-query-hub

Set-Location "packages/server-v2"
npm.cmd run build
npm.cmd run test -- --runInBand
```

如果 `check:ami-semantic-agent` 被保留在 PR3，则必须先修正脚本范围，避免它要求 PR4 Kiosk 文件已经进入 PR3。修正后再跑：

```powershell
npm.cmd run check:ami-semantic-agent
```

建议用独立 worktree 验证 PR3 已提交内容，避免当前主工作区未提交 PR4 / PR5 文件污染结果：

```powershell
git worktree add --detach "D:\AI coding\beauty-salon-admin-pr3-verify" HEAD
Set-Location "D:\AI coding\beauty-salon-admin-pr3-verify"
npm.cmd run test
npm.cmd run build
npm.cmd run check:api
npm.cmd run check:ami-query-hub
```

### 3.6 Go / No-Go

可以开 PR3：

- Agent / semantic / business-query 文件范围独立
- 本地 check 脚本通过
- 后端 build/test 通过
- Agent 输出有权限、证据和查询限制说明

不能开 PR3：

- 混入 Kiosk 角色看板大改
- 混入 marketing-h5 共享渲染器
- Text-to-SQL 缺少白名单和权限边界
- CI 脚本要求未纳入 PR3 的 Kiosk 文件

## 4. 阶段 2：PR4 Kiosk 快捷功能与终端支撑

### 4.1 目标

把 Ami Aura Lite 的快捷命令、角色看板、经营结果、终端权限和端侧 E2E 独立成终端 PR。

产品目标：

- 店长、前台、美容师角色看板更贴近岗位任务
- 智能命令栏能触发高频动作
- 经营结果可以进入具体业务动作
- 终端权限、角色和管理端用户体系一致

### 4.2 预计范围

Kiosk：

```text
packages/Ami-Aura-Lite-Kiosk/src/app/AppContent.tsx
packages/Ami-Aura-Lite-Kiosk/src/app/components/RoleDashboards.tsx
packages/Ami-Aura-Lite-Kiosk/src/app/components/RoleDashboards.business-result.test.tsx
packages/Ami-Aura-Lite-Kiosk/src/app/components/SmartCommandBar.tsx
packages/Ami-Aura-Lite-Kiosk/src/app/components/SmartCommandBar.test.tsx
packages/Ami-Aura-Lite-Kiosk/src/app/components/TopStatusBar.tsx
packages/Ami-Aura-Lite-Kiosk/src/app/intent/**
packages/Ami-Aura-Lite-Kiosk/src/app/microApps/**
packages/Ami-Aura-Lite-Kiosk/src/app/services/auraCoreService.ts
packages/Ami-Aura-Lite-Kiosk/src/app/services/auraCoreService.auth.test.ts
packages/Ami-Aura-Lite-Kiosk/src/app/services/conversationPersistence.test.ts
packages/Ami-Aura-Lite-Kiosk/src/app/types.ts
packages/Ami-Aura-Lite-Kiosk/e2e/**
playwright.kiosk.config.ts
```

后端终端支撑：

```text
packages/server-v2/src/terminal/**
packages/server-v2/src/beauticians/beauticians.service.ts
packages/server-v2/src/terminal/terminal-role-access.ts
packages/server-v2/src/terminal/terminal-role-access.spec.ts
src/types/terminal.ts
src/types/aura.ts
src/config/aura.ts
```

管理端配套：

```text
src/app/pages/BeauticianManagement.tsx
src/api/real/beautician.ts
src/schemas/beautician.ts
```

文档：

```text
docs/03-开发计划/Ami_Aura_Lite_快捷功能与管理端匹配清单.md
```

### 4.3 需要特别拆分的交叉文件

```text
packages/server-v2/src/customer-app/**
packages/server-v2/prisma/schema.prisma
src/types/terminal.ts
src/test/api.test.ts
package.json
```

说明：

- customer-app 中如果只与 Kiosk 无关，应留给后续或已在 PR2 处理
- `src/types/terminal.ts` 只纳入终端 DTO / 任务字段
- `package.json` 只纳入 Kiosk E2E 或终端检查命令

### 4.4 建议提交拆分

提交 1：

```text
feat(kiosk): add action commands and intent routing
```

提交 2：

```text
feat(kiosk): enhance role dashboards with business results
```

提交 3：

```text
feat(api): support terminal role access and follow-up actions
```

提交 4：

```text
test(kiosk): cover command bar and role dashboard workflows
```

提交 5：

```text
docs: add kiosk admin matching checklist
```

### 4.5 验证命令

```powershell
Set-Location "packages/Ami-Aura-Lite-Kiosk"
npm.cmd run build
```

如 E2E 依赖已完整：

```powershell
npx.cmd playwright test -c playwright.kiosk.config.ts
```

后端支撑：

```powershell
Set-Location "packages/server-v2"
npm.cmd run build
npm.cmd run test -- terminal
```

根项目保护性验证：

```powershell
npm.cmd run test
npm.cmd run build
```

### 4.6 Go / No-Go

可以开 PR4：

- Kiosk build 通过
- 终端后端 build/test 通过
- 角色权限逻辑有测试
- E2E 能启动或明确记录未启用原因

不能开 PR4：

- 快捷入口指向不存在或未授权的管理端页面
- 角色看板只展示，无下一步动作
- 终端权限和管理端用户角色不一致

## 5. 阶段 3：PR5 marketing-h5 与活动页共享渲染

### 5.1 目标

把管理端活动预览、活动效果页、公开 marketing-h5 页面收敛到同一套渲染数据结构，避免“后台看起来一套，用户打开另一套”。

产品目标：

- 管理端预览和公开 H5 表现一致
- 已发布页面可访问，未发布页面不可公开读取
- 活动页、推广页、效果页跳转关系清晰
- 留资、浏览、点击、归因数据能回流

### 5.2 预计范围

```text
packages/marketing-h5/**
src/shared/**
src/app/components/ActivityMiniPage.tsx
src/app/components/MarketingPageGeneratorDialog.tsx
src/app/pages/MarketingActivityEffect.tsx
src/app/pages/MarketingPageManagement.tsx
packages/server-v2/src/marketing-pages/**
```

### 5.3 需要特别拆分的交叉文件

```text
src/app/pages/CreateMarketing.tsx
packages/server-v2/prisma/seed-mvp.ts
packages/server-v2/src/main.ts
```

处理建议：

- `CreateMarketing.tsx` 如果是活动页生成入口，纳入 PR5；如果是营销创建流程重构，单独确认
- `seed-mvp.ts` 当前改动较大，必须先区分 H5 示例数据、供应链数据、其他 demo 数据
- `main.ts` 如果只是 H5 CORS / 静态资源相关，可纳入；否则留给单独基础设施 PR

### 5.4 建议提交拆分

提交 1：

```text
feat(marketing-h5): add shared marketing page renderer
```

提交 2：

```text
feat(admin): align activity preview and effect page rendering
```

提交 3：

```text
feat(api): support published marketing page rendering data
```

提交 4：

```text
test: cover marketing page rendering and publication rules
```

### 5.5 验证命令

```powershell
npm.cmd run build
npm.cmd run build:marketing-h5
npm.cmd run test

Set-Location "packages/server-v2"
npm.cmd run build
npm.cmd run test -- marketing-pages
```

如要运行态验收：

```powershell
npm.cmd run dev -- --host 127.0.0.1 --port 5173
npm.cmd run dev:marketing-h5
```

验收地址：

```text
管理端：http://127.0.0.1:5173
营销 H5：http://127.0.0.1:5177
```

### 5.6 Go / No-Go

可以开 PR5：

- 管理端预览与公开 H5 使用同一渲染协议
- build:marketing-h5 通过
- 发布/未发布读取规则清楚
- 效果页能展示真实页面事件或明确 fallback

不能开 PR5：

- H5 只是静态 mock，没有读取发布页数据
- 管理端预览与公开页仍是两套结构
- 未发布页面可被公开访问

## 6. 阶段 4：文档与市场资料 PR

### 6.1 目标

把当前新增的市场调研、产品方案和开发计划文档整理成可审查资料，不混入业务代码。

### 6.2 预计范围

```text
docs/01-市场调研/美容院成本与盈利明细调研报告-2026-06-18.md
docs/02-产品设计/智能推荐卡片信息层级优化方案.md
docs/02-产品设计/美容院经营利润看板需求文档.md
docs/03-开发计划/经营利润一级模块详细开发计划.md
```

以及未归入 PR3 / PR4 / PR5 的纯文档。

### 6.3 建议提交

```text
docs: add next-stage product and market research plans
```

### 6.4 验收要求

- 文档清楚区分“已实现”和“方案”
- 市场调研类内容对外发布前补来源
- 不把调研结论包装成已上线能力

## 7. 阶段 5：v0.8.0-rc.1 发布候选

### 7.1 发布前置

必须满足：

- PR2 已合并
- PR3 / PR4 / PR5 至少按产品验收目标完成，或明确标记延期
- `main` CI 全部通过
- 数据库 migrations 可执行
- 管理端、后端、Kiosk、marketing-h5 构建通过
- 工作区剩余改动为空，或全部转移到明确后续分支

### 7.2 发布验证命令

```powershell
npm.cmd run test
npm.cmd run build
npm.cmd run check:api
npm.cmd run build:marketing-h5

Set-Location "packages/server-v2"
npm.cmd run build
npm.cmd run test -- --runInBand

Set-Location "..\\Ami-Aura-Lite-Kiosk"
npm.cmd run build
```

数据库：

```powershell
Set-Location "packages/server-v2"
npm.cmd run db:migrate:prod
npm.cmd run db:seed:promotion-assets:verify
```

### 7.3 发布建议

建议版本：

```text
v0.8.0-rc.1
```

建议 release note 结构：

```text
新增：营销推荐与权益资产闭环
新增：经营 Agent / 问数中枢
新增：Ami Aura Lite 快捷功能与角色看板
新增：营销 H5 共享渲染
变更：数据库 migration 与 seed
风险：数据库 seed 需要真实连接环境执行 verify
```

## 8. 临时验证目录处理

当前曾创建过临时验证 worktree：

```text
D:\AI coding\beauty-salon-admin-pr2-verify
```

用途：

- 隔离主工作区未提交改动
- 只验证 PR2 已提交内容
- 复用主仓库 node_modules，避免重复安装依赖

PR2 合并后可以清理，但必须先确认它是 Git worktree：

```powershell
git worktree list
```

安全移除方式：

```powershell
git worktree remove "D:\AI coding\beauty-salon-admin-pr2-verify"
```

不要直接批量删除目录。

## 9. 下一步最小动作

当前 PR2 已合并，下一步最小动作是创建 PR3 的独立提交栈：

```powershell
git diff --cached --name-only
npm.cmd run check:ami-query-hub
npm.cmd run check:ami-semantic-agent
```

PR3 提交完成并验证通过后：

```powershell
git push -u origin codex/pr3-agent-semantic-query
gh pr create --draft --base main --head codex/pr3-agent-semantic-query
```

PR3 Draft 创建后，再继续 PR4 Kiosk 快捷功能与终端支撑拆分。
