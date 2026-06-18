# PR3 合并后主工作区剩余改动拆分与发布详细计划

更新时间：2026-06-19

适用仓库：`D:\AI coding\beauty-salon-admin`

执行状态补充：

- PR4 `Kiosk 快捷功能与终端支撑` 已完成本地 worktree 验证、GitHub CI，并已 squash 合并。
- PR5 `marketing-h5 与活动页共享渲染` 已完成本地 worktree 验证、GitHub CI，并已 squash 合并。
- PR6 `经营利润与推荐优化产品文档` 已完成 GitHub CI，并已 squash 合并。
- 本文保留为 PR3 合并后拆分执行的过程计划与范围依据；继续执行时以最新 `git status --short --branch`、`origin/main` 和打开 PR 状态为准。

## 1. 当前状态结论

当前主工作区仍然保留大量未提交改动，不能直接 `git add .`，也不应该一次性合并到同一个 PR。

截至本计划输出时：

- 当前分支：`codex/pr4-kiosk-terminal-support`
- 当前分支状态：相对 `origin/main` 已 ahead 2
- 当前最近主线：`1c24f12 PR3: Ami 经营 Agent 与语义查询中枢 (#3)`
- PR #1：已合并
- PR #2：已合并
- PR #3：已合并
- 当前分支已有 PR4 提交：
  - `9011639 feat(kiosk): add business agent commands and result cards`
  - `7857c0c feat(terminal): support role access and follow-up actions`
- 当前暂存区必须继续保持可控；提交前必须复核 `git diff --cached --name-only`
- 当前仍保留 stash 保险副本：
  - `stash@{0}: On codex/pr3-agent-semantic-query: wip-after-pr2-merge-before-pr3-base-refresh`
  - `stash@{1}: On codex/pr2-marketing-promotion-loop: wip-after-pr2-before-pr3-split`

本轮剩余工作应拆成：

```text
PR4：Ami Aura Lite Kiosk 快捷功能、终端支撑、Kiosk E2E、匹配清单
PR5：marketing-h5 与管理端活动页共享渲染、发布页读取规则、营销页后端
PR6：经营利润/调研/产品方案等纯文档
PR7 或单独技术 PR：移动端 Claude API 收敛、AGENTS 协作说明、demo seed 脚本等非主链路改动
发布：v0.8.0-rc.1 候选验证与 Release Note
```

## 2. 为什么要使用独立验证文件夹

独立文件夹不是创建一个新项目，也不是复制一套代码长期维护。

它的作用是 Git worktree：在同一个仓库、同一个远端、同一套提交历史下，临时检出一个干净的验证目录，只验证某个 PR 已提交内容。

使用原因：

- 主工作区当前有 PR5、文档、seed、协作说明等未提交改动，会污染 PR4 验证结果。
- 如果直接在主工作区跑 build/test，通过结果不能证明 PR4 分支本身可合并。
- 独立 worktree 可以复用主仓库依赖目录，避免重新安装依赖。
- 验证完成后可通过 `git worktree remove` 安全移除，不需要手动批量删除目录。

建议保留的命名：

```text
D:\AI coding\beauty-salon-admin-pr4-verify
```

注意：

- 不要用资源管理器直接删除 worktree。
- 不要把独立验证目录当成新业务工作目录继续开发。
- 删除前先执行 `git worktree list` 确认它是 worktree。

## 3. 当前剩余文件归属

### 3.1 PR4：Kiosk 快捷功能与终端支撑

已提交到当前 PR4 分支的范围：

```text
packages/Ami-Aura-Lite-Kiosk/src/app/**
packages/server-v2/src/terminal/**
packages/server-v2/src/beauticians/beauticians.service.ts
src/api/real/beautician.ts
src/app/pages/BeauticianManagement.tsx
src/config/aura.ts
src/schemas/beautician.ts
src/types/aura.ts
src/types/terminal.ts
```

仍需纳入 PR4 的范围：

```text
playwright.kiosk.config.ts
packages/Ami-Aura-Lite-Kiosk/e2e/business-agent.spec.ts
docs/03-开发计划/Ami_Aura_Lite_快捷功能与管理端匹配清单.md
package.json 中的 test:e2e:kiosk 脚本
```

`package.json` 当前有两行改动，其中只有这一行属于 PR4：

```json
"test:e2e:kiosk": "playwright test -c playwright.kiosk.config.ts"
```

这一行不属于 PR4，应留给后续 seed/demo PR：

```json
"db:seed:demo:dry-run": "npm --prefix packages/server-v2 run db:seed:mvp:dry-run"
```

### 3.2 PR5：marketing-h5 与活动页共享渲染

建议纳入 PR5 的范围：

```text
packages/marketing-h5/package.json
packages/marketing-h5/src/main.tsx
packages/marketing-h5/vite.config.ts
packages/server-v2/src/main.ts
packages/server-v2/src/marketing-pages/marketing-pages.service.ts
packages/server-v2/src/marketing-pages/marketing-pages.service.spec.ts
src/shared/**
src/app/components/ActivityMiniPage.tsx
src/app/components/MarketingPageGeneratorDialog.tsx
src/app/pages/CreateMarketing.tsx
src/app/pages/MarketingActivityEffect.tsx
src/app/pages/MarketingPageManagement.tsx
src/app/components/Layout.tsx 中营销页面入口相关改动
```

PR5 的产品目标：

- 管理端活动预览、活动效果页、公开 H5 使用同一套渲染协议。
- 已发布页面允许公开读取，未发布页面不可公开读取。
- 管理端创建活动后能生成或关联可公开访问的营销页。
- 浏览、点击、留资等事件能进入后端统计口径。

### 3.3 PR6：经营利润与产品资料文档

建议单独作为纯文档 PR：

```text
docs/01-市场调研/美容院成本与盈利明细调研报告-2026-06-18.md
docs/02-产品设计/智能推荐卡片信息层级优化方案.md
docs/02-产品设计/美容院经营利润看板需求文档.md
docs/03-开发计划/经营利润一级模块详细开发计划.md
```

处理原则：

- 文档要明确区分“已实现能力”和“规划能力”。
- 市场调研类文档如果准备对外使用，需要补来源或标注调研假设。
- 不和 PR5 代码混在一起，避免审查时业务代码和产品资料互相干扰。

### 3.4 PR7 或单独技术 PR：非当前主链路改动

建议暂缓、单独确认的范围：

```text
AGENTS.md
packages/app/src/api/claude.ts
packages/server-v2/prisma/seed-mvp.ts
package.json 中的 db:seed:demo:dry-run 脚本
```

原因：

- `AGENTS.md` 属于协作规则，不应该混入 Kiosk 或 marketing-h5 功能 PR。
- `packages/app/src/api/claude.ts` 可能涉及移动/助手端 AI Gateway 收敛，应单独验证兼容性。
- `seed-mvp.ts` 改动较大，可能同时影响 demo 数据、经营利润、营销页样例，不适合夹在 PR4 或 PR5 中。

## 4. PR4 执行计划

### 4.1 目标

把当前 Kiosk 快捷命令、角色看板、终端权限、跟进任务、业务结果卡片和 Kiosk E2E 验证完整收口成一个可审查 PR。

### 4.2 提交拆分

当前已有两个提交，不需要重写历史：

```text
9011639 feat(kiosk): add business agent commands and result cards
7857c0c feat(terminal): support role access and follow-up actions
```

还需要新增两个提交：

提交 3：

```text
test(kiosk): add business agent browser eval
```

只纳入：

```text
playwright.kiosk.config.ts
packages/Ami-Aura-Lite-Kiosk/e2e/business-agent.spec.ts
package.json 中的 test:e2e:kiosk
```

提交 4：

```text
docs: add kiosk admin matching checklist
```

只纳入：

```text
docs/03-开发计划/Ami_Aura_Lite_快捷功能与管理端匹配清单.md
```

### 4.3 暂存前检查

每次暂存前执行：

```powershell
git status --short --branch
git diff --cached --name-only
```

暂存 `package.json` 时必须只保留 `test:e2e:kiosk`，不能把 `db:seed:demo:dry-run` 带入 PR4。

暂存后必须执行：

```powershell
git diff --cached --name-only
git diff --cached -- package.json
git diff --cached --stat
```

### 4.4 PR4 本地验证

建议在独立 worktree 验证：

```powershell
git worktree add --detach "D:\AI coding\beauty-salon-admin-pr4-verify" HEAD
Set-Location "D:\AI coding\beauty-salon-admin-pr4-verify"
```

如果需要复用依赖，可创建目录联接：

```powershell
cmd /c mklink /J "D:\AI coding\beauty-salon-admin-pr4-verify\node_modules" "D:\AI coding\beauty-salon-admin\node_modules"
cmd /c mklink /J "D:\AI coding\beauty-salon-admin-pr4-verify\packages\server-v2\node_modules" "D:\AI coding\beauty-salon-admin\packages\server-v2\node_modules"
cmd /c mklink /J "D:\AI coding\beauty-salon-admin-pr4-verify\packages\Ami-Aura-Lite-Kiosk\node_modules" "D:\AI coding\beauty-salon-admin\packages\Ami-Aura-Lite-Kiosk\node_modules"
```

根项目验证：

```powershell
npm.cmd run test
npm.cmd run build
npm.cmd run check:api
npm.cmd run lint
```

后端终端验证：

```powershell
Set-Location "packages/server-v2"
npm.cmd run build
npm.cmd run test -- terminal
```

Kiosk 验证：

```powershell
Set-Location "..\Ami-Aura-Lite-Kiosk"
npm.cmd run build
npm.cmd exec -- vitest run src/app/components/RoleDashboards.business-result.test.tsx src/app/components/SmartCommandBar.test.tsx src/app/intent/actionCommands.test.ts src/app/intent/aiIntentParser.test.ts src/app/intent/ruleIntentParser.test.ts src/app/microApps/runMicroApp.test.ts src/app/services/auraCoreService.auth.test.ts src/app/services/conversationPersistence.test.ts
```

Kiosk E2E：

```powershell
Set-Location "D:\AI coding\beauty-salon-admin-pr4-verify"
npm.cmd run test:e2e:kiosk -- --reporter=line
```

### 4.5 PR4 GitHub 流程

本地验证通过后：

```powershell
git push -u origin codex/pr4-kiosk-terminal-support
gh pr create --draft --base main --head codex/pr4-kiosk-terminal-support --title "PR4: Kiosk 快捷功能与终端支撑"
```

PR 描述必须包含：

- 功能范围
- 不包含范围：marketing-h5、经营利润文档、seed demo、移动端 Claude API
- 本地验证结果
- Kiosk E2E 是否通过；如未通过，写明环境前置条件

GitHub CI 全部通过后：

```powershell
gh pr ready <PR_NUMBER>
gh pr merge <PR_NUMBER> --squash --delete-branch
git fetch origin
```

### 4.6 PR4 Go / No-Go

可以 Ready：

- Kiosk build 通过
- 后端 terminal 测试通过
- 根项目 test/build/check:api 通过
- Kiosk E2E 通过，或失败原因是明确的浏览器/环境依赖且已写入 PR
- PR 中没有混入 PR5 或文档资料范围

不能 Ready：

- `package.json` 混入 `db:seed:demo:dry-run`
- marketing-h5 文件进入 PR4
- Kiosk 快捷入口指向不存在页面
- 终端角色权限无法和管理端用户绑定
- E2E 证明核心链路不可用

## 5. PR5 执行计划

### 5.1 前置条件

PR5 必须在 PR4 合并后，从最新 `origin/main` 新建分支：

```powershell
git fetch origin
git switch -c codex/pr5-marketing-h5-shared-renderer origin/main
```

如果主工作区还保留未提交改动，不要强行切换；应先确认：

```powershell
git status --short --branch
```

必要时用临时 stash 保护未提交改动：

```powershell
git stash push -u -m "wip-after-pr4-before-pr5-split"
```

恢复时只恢复需要进入 PR5 的文件，不能把 PR6/PR7 文件一并带入。

### 5.2 产品目标

PR5 要解决的是“管理端看到的活动页”和“用户打开的营销 H5”不一致的问题。

目标验收：

- 管理端活动页预览和公开 H5 使用同一渲染组件或同一数据协议。
- 发布页接口只返回已发布页面。
- 未发布页面公开访问返回明确错误或不可访问状态。
- 效果页能基于真实 pageId/activityId 展示浏览、点击、留资等数据。
- 生成活动页后，运营人员能拿到可复制的公开链接。

### 5.3 提交拆分

提交 1：

```text
feat(marketing-h5): use shared marketing page renderer
```

范围：

```text
packages/marketing-h5/package.json
packages/marketing-h5/src/main.tsx
packages/marketing-h5/vite.config.ts
src/shared/**
```

提交 2：

```text
feat(admin): align marketing preview and effect pages
```

范围：

```text
src/app/components/ActivityMiniPage.tsx
src/app/components/MarketingPageGeneratorDialog.tsx
src/app/pages/CreateMarketing.tsx
src/app/pages/MarketingActivityEffect.tsx
src/app/pages/MarketingPageManagement.tsx
src/app/components/Layout.tsx 中营销页面入口相关改动
```

提交 3：

```text
feat(api): expose published marketing page data
```

范围：

```text
packages/server-v2/src/main.ts
packages/server-v2/src/marketing-pages/marketing-pages.service.ts
packages/server-v2/src/marketing-pages/marketing-pages.service.spec.ts
```

提交 4：

```text
test(marketing): cover published page rendering rules
```

如已有测试改动不足，需要补充：

```text
packages/server-v2/src/marketing-pages/marketing-pages.service.spec.ts
src/shared/**/*.test.ts
```

### 5.4 PR5 验证

```powershell
npm.cmd run test
npm.cmd run build
npm.cmd run build:marketing-h5
npm.cmd run check:api
```

后端：

```powershell
Set-Location "packages/server-v2"
npm.cmd run build
npm.cmd run test -- marketing-pages
```

运行态验收：

```powershell
npm.cmd run dev -- --host 127.0.0.1 --port 5173
npm.cmd run dev:marketing-h5
npm.cmd run dev:api
```

重点验收路径：

```text
管理端：http://127.0.0.1:5173
营销 H5：http://127.0.0.1:5177
后端 API：http://localhost:8080/api
Swagger：http://localhost:8080/docs
```

### 5.5 PR5 Go / No-Go

可以 Ready：

- `build:marketing-h5` 通过
- 管理端 build 通过
- 后端 marketing-pages 测试通过
- 已发布和未发布读取规则都有测试
- 管理端预览和 H5 渲染口径一致

不能 Ready：

- H5 仍是静态 mock
- 公开页面可读取未发布内容
- 管理端和 H5 两套渲染结构继续分叉
- 活动效果页无法定位真实 pageId/activityId

## 6. PR6 文档执行计划

### 6.1 目标

把当前经营利润、智能推荐信息层级和市场调研类资料整理成独立文档 PR，不和功能代码混发。

### 6.2 提交

```text
docs: add operating profit and recommendation planning docs
```

范围：

```text
docs/01-市场调研/美容院成本与盈利明细调研报告-2026-06-18.md
docs/02-产品设计/智能推荐卡片信息层级优化方案.md
docs/02-产品设计/美容院经营利润看板需求文档.md
docs/03-开发计划/经营利润一级模块详细开发计划.md
```

### 6.3 验收

- 文档标题、日期、适用范围明确。
- 没有把规划写成已上线功能。
- 对后续开发有清楚的模块、数据、页面、接口拆分。

## 7. PR7 技术债与协作规则执行计划

### 7.1 候选范围

```text
AGENTS.md
packages/app/src/api/claude.ts
packages/server-v2/prisma/seed-mvp.ts
package.json 中的 db:seed:demo:dry-run
```

### 7.2 拆分建议

不要把 PR7 做成一个大杂烩。

建议再拆：

```text
PR7A：docs/process 更新 AGENTS.md
PR7B：fix(app): route Claude API through server gateway
PR7C：chore(seed): add demo seed dry-run support
```

### 7.3 验收

AGENTS：

```powershell
git diff -- AGENTS.md
```

移动端 Claude API：

```powershell
Set-Location "packages/app"
npm.cmd run build
```

seed dry-run：

```powershell
npm.cmd run db:seed:demo:dry-run
```

如果数据库连接不可用，必须在 PR 描述中说明环境前置条件。

## 8. 发布候选计划

### 8.1 发布前置

只有满足以下条件，才建议发布 `v0.8.0-rc.1`：

- PR4 已合并
- PR5 已合并
- PR6 文档已合并或明确延期
- PR7 技术债已合并或明确延期
- `origin/main` CI 全部通过
- 主工作区无未归属改动
- 数据库 migration / seed 验证状态明确

### 8.2 发布验证命令

```powershell
npm.cmd run test
npm.cmd run build
npm.cmd run check:api
npm.cmd run build:marketing-h5
```

后端：

```powershell
Set-Location "packages/server-v2"
npm.cmd run build
npm.cmd run test -- --runInBand
```

Kiosk：

```powershell
Set-Location "..\Ami-Aura-Lite-Kiosk"
npm.cmd run build
```

如数据库环境可用：

```powershell
Set-Location "..\server-v2"
npm.cmd run db:migrate:prod
npm.cmd run db:seed:promotion-assets:verify
npm.cmd run db:seed:demo:dry-run
```

### 8.3 Release Note 建议结构

```text
版本：v0.8.0-rc.1

新增：
- 营销推荐与权益资产闭环
- Ami 经营 Agent 与语义查询中枢
- Ami Aura Lite Kiosk 快捷命令、角色看板与终端跟进任务
- marketing-h5 与管理端活动页共享渲染

优化：
- 终端角色权限与管理端用户体系对齐
- 营销活动效果页与公开页面数据口径收敛

文档：
- 经营利润看板需求
- 智能推荐卡片信息层级优化
- 美容院成本与盈利调研

风险：
- 数据库 seed / migration 需要真实连接环境复验
- marketing-h5 公开访问需要确认生产域名和 CORS
- Kiosk E2E 依赖浏览器运行环境
```

## 9. 下一步最小执行清单

下一步只做 PR4，不碰 PR5/PR6/PR7：

```powershell
git status --short --branch
git diff --cached --name-only
```

然后完成 PR4 剩余提交：

```text
1. 暂存 playwright.kiosk.config.ts
2. 暂存 packages/Ami-Aura-Lite-Kiosk/e2e/business-agent.spec.ts
3. 从 package.json 中只暂存 test:e2e:kiosk
4. 提交 test(kiosk): add business agent browser eval
5. 暂存 Ami_Aura_Lite_快捷功能与管理端匹配清单.md
6. 提交 docs: add kiosk admin matching checklist
7. 创建 PR4 独立验证 worktree
8. 跑 PR4 验证命令
9. 推送 PR4 分支
10. 创建 Draft PR4
11. CI 通过后转 Ready 并 squash 合并
```

执行过程中禁止：

```text
git add .
批量删除目录
清理 stash
把 marketing-h5 或 seed-mvp 混入 PR4
```

