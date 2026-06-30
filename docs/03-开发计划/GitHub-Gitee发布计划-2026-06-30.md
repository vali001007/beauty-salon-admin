# GitHub 与 Gitee 发布计划

更新时间：2026-06-30

## 1. 当前结论

当前状态不适合直接发布。`main` 已同步 GitHub `origin/main`，最新提交是 `fc8816e8 fix(aura): repair auth before runtime agent calls`，且该提交对应 GitHub CI/CD 已全绿；但本地存在大批未提交开发改动，覆盖后端、管理端、Ami Aura Lite、Agent Core、文档与 Prisma migration。

建议本轮发布拆成两个动作：

1. GitHub：先把当前未提交开发整理成发布分支和 PR，CI 全绿后合并，再打新的预发布 tag。
2. Gitee：目标仓库改为 `https://gitee.com/cocobao/beauty-salon/tree/master/`，需要新增独立远端并发布到 `master`，不要复用当前指向 `cocobao/mradmin.git` 的 `gitee` 远端。

## 2. 当前仓库事实

- 本地路径：`D:\AI coding\beauty-salon-admin`
- 当前分支：`main`
- GitHub 远端：`origin -> git@github.com:vali001007/beauty-salon-admin.git`
- 现有 Gitee 远端：`gitee -> git@gitee.com:cocobao/mradmin.git`
- 目标 Gitee 仓库：`git@gitee.com:cocobao/beauty-salon.git`
- 目标 Gitee 页面：`https://gitee.com/cocobao/beauty-salon/tree/master/`
- 目标 Gitee 分支：`master`
- 最新 GitHub Release：`v0.9.0-rc.4`
- 最新 GitHub CI/CD：`fc8816e8` 对应 run `28319109635` 全部成功

## 3. 当前改动范围

本地 `git status` 显示约 256 个变更条目；已跟踪文件 diff 约 174 个文件，`18213` 行新增、`2508` 行删除。按目录粗分：

| 范围 | 数量 | 发布影响 |
| --- | ---: | --- |
| `packages/server-v2` | 113 | 后端主线、Prisma schema、migrations、Agent、库存、财务、排班等高风险核心 |
| `src` 管理端 | 77 | 管理端页面、API facade、权限、财务、库存、排班、Agent 工作台 |
| `docs` | 37 | 发布说明、验收报告、开发计划和测试数据 |
| `packages/Ami-Aura-Lite-Kiosk` | 23 | 终端 Agent、意图路由、微应用、渲染组件 |
| `packages/agent-core` | 4 | Agent block/result 类型与工具 |
| `AGENTS.md` | 1 | 协作规则变更 |

新增的 Prisma migration 包括：

- `20260628093000_commission_settlement_records`
- `20260629102000_product_sku_store_scope`
- `20260629153000_one_click_smart_scheduling`
- `20260630110000_gap_opportunity_v15`
- `20260630143000_project_care_cycle_course`

这些 migration 说明本次不是普通前端发布，必须按数据库变更发布处理。

## 4. Go / No-Go 判断

当前判断：No-Go，不能直接发布。

原因：

1. 本地有大量未提交改动，且包含 schema/migration。
2. 目标 Gitee 远端尚未配置到本仓库，当前 `gitee` 远端指向旧仓库 `cocobao/mradmin.git`。
3. `https://gitee.com/cocobao/beauty-salon.git` 只读探测在本机报 `getaddrinfo() thread failed to start`，但 SSH `git@gitee.com:cocobao/beauty-salon.git` 可访问。
4. Gitee `master/agent/product` 当前均指向 `04bb4cc`，需要先 fetch 后确认与 GitHub `main` 是否同源，不能盲目覆盖。
5. 新增 migration 是否已在目标数据库演练通过，需要单独验收。

进入 Go 的条件：

- 当前未提交改动按主题拆分并提交。
- 本地 `git diff --check` 通过。
- 后端 Prisma generate、build、test 通过。
- 管理端 lint、build、test 通过。
- Kiosk build 和关键测试通过。
- GitHub PR CI 全绿并合并到 `main`。
- Gitee 目标远端 fetch 成功，确认是否同源以及是否需要 `--force-with-lease`。
- 用户明确授权 GitHub push/PR/merge/tag/release 和 Gitee push。

## 5. GitHub 发布计划

### 阶段 1：冻结发布范围

建议本轮版本号使用 `v0.9.0-rc.5`，范围包含 2026-06-28 后的本地增量开发，但必须先确认以下内容是否全部进入本轮：

- Agent 评测、知识图谱、语义查询与回答契约增强。
- Ami Aura Lite 意图路由、终端微应用、Agent block 渲染增强。
- 库存 SKU 门店维度、库存扣减、验收脚本和真实数据报告。
- 财务模块、提成结算、收银对账和会员资产页面。
- 智能排班、空档机会、项目疗程周期。
- Prisma schema 与 5 个新增 migration。
- 相关文档和测试报告。

### 阶段 2：创建发布分支

```powershell
git switch main
git pull --ff-only origin main
git switch -c codex/release-v0.9.0-rc5
```

如当前工作区已有未提交改动，创建分支前不应重置或清理，直接在当前状态上创建发布分支即可。

### 阶段 3：分批提交

建议按 6 批提交，避免一个巨型提交难以审查和回滚：

1. `docs: add release planning and validation reports`
2. `feat(agent): expand answer contract eval and semantic capabilities`
3. `feat(aura): enhance terminal intent routing and agent rendering`
4. `feat(inventory): add sku store scope and stock readiness tooling`
5. `feat(finance): add reconciliation assets and commission settlement flows`
6. `feat(scheduling): add gap opportunity and smart scheduling maturity`

提交前排除：

- `.env`
- `.codex/`
- `node_modules/`
- `dist/`
- `coverage/`
- 本地日志、临时下载、压缩日志
- 不进入发布范围的 PPTX 或大文件

### 阶段 4：本地验证

最低验证命令：

```powershell
git diff --check
npm.cmd --prefix packages/server-v2 run db:generate
npm.cmd --prefix packages/server-v2 run build
npm.cmd --prefix packages/server-v2 run test
npm.cmd run lint
npm.cmd run build
npm.cmd run test
npm.cmd run check:api
npm.cmd run build --prefix packages/Ami-Aura-Lite-Kiosk
npx.cmd vitest run src/test/api.test.ts src/app/pages/ami-agent/components/AgentBlockRenderer.test.tsx
```

针对本次高风险改动，还建议补充：

```powershell
npx.cmd vitest run packages/Ami-Aura-Lite-Kiosk/src/app/microApps/runMicroApp.test.ts
npx.cmd vitest run packages/server-v2/src/inventory/inventory.service.spec.ts
npx.cmd vitest run packages/server-v2/src/commission/commission.service.spec.ts
npx.cmd vitest run packages/server-v2/src/scheduling/smart-scheduling.service.spec.ts
npx.cmd vitest run packages/server-v2/src/agent/agent-orchestrator.service.spec.ts
```

### 阶段 5：PR 与合并

```powershell
git push origin codex/release-v0.9.0-rc5
gh pr create --base main --head codex/release-v0.9.0-rc5 --title "v0.9.0-rc.5：Agent评测、库存财务与智能排班能力预发布" --body-file docs/03-开发计划/GitHub-Gitee发布计划-2026-06-30.md
```

PR 要求：

- GitHub CI 必须全绿：`frontend`、`backend`、`terminal-prototype`、`ami-semantic-agent`。
- 对 schema/migration 做单独说明。
- 如果生产数据库 migration 不自动执行，Release notes 必须写清楚需要人工授权。
- CI 全绿后再 Ready / squash merge。

### 阶段 6：Tag 与 GitHub Release

合并后在 `main` 最新提交上创建 tag：

```powershell
git switch main
git pull --ff-only origin main
git tag v0.9.0-rc.5
git push origin v0.9.0-rc.5
```

GitHub Release：

- Release title：`v0.9.0-rc.5 - Agent评测、库存财务与智能排班能力预发布`
- 标记：Pre-release
- Release notes 包含：
  - 核心能力
  - 数据库变更
  - 验证结果
  - 部署状态
  - 已知风险
  - 回滚方式

## 6. Gitee 发布计划

### 阶段 1：配置正确远端

当前 `gitee` 远端指向 `cocobao/mradmin.git`，不要用于本次发布。建议新增独立远端：

```powershell
git remote add gitee-beauty git@gitee.com:cocobao/beauty-salon.git
git fetch gitee-beauty --prune
git remote -v
```

如远端已存在则更新：

```powershell
git remote set-url gitee-beauty git@gitee.com:cocobao/beauty-salon.git
git fetch gitee-beauty --prune
```

验收：

- `gitee` 仍保留旧仓库，不误发。
- `gitee-beauty` 指向 `git@gitee.com:cocobao/beauty-salon.git`。
- 可看到 `gitee-beauty/master`。

### 阶段 2：确认分支关系

```powershell
git log --oneline --decorate --left-right --cherry-pick gitee-beauty/master...main --max-count=50
git merge-base gitee-beauty/master main
```

判断：

- 如果能找到共同祖先，优先正常合并或快进发布。
- 如果没有共同祖先，说明 Gitee `master` 与 GitHub `main` 不是同一历史，需要决定是保留 Gitee 历史合并，还是用 GitHub 代码覆盖 Gitee `master`。

### 阶段 3：建议发布策略

推荐策略：GitHub 先完成 `v0.9.0-rc.5`，再把合并后的 GitHub `main` 同步到 Gitee `master`。

常规同源推送：

```powershell
git switch main
git pull --ff-only origin main
git push gitee-beauty main:master
```

如果 Gitee `master` 与 GitHub `main` 不同源，必须单独确认后才可覆盖：

```powershell
git push --force-with-lease gitee-beauty main:master
```

不建议在当前大批未提交状态下直接推 Gitee。

### 阶段 4：Gitee 验收

发布后检查：

```powershell
git ls-remote --heads git@gitee.com:cocobao/beauty-salon.git master
git log --oneline --decorate -1
```

页面验收：

- 打开 `https://gitee.com/cocobao/beauty-salon/tree/master/`
- 确认最新提交等于 GitHub `main` 的发布提交。
- 确认不包含 `.env`、构建产物、日志、大文件。

## 7. 数据库发布与回滚

本次包含 Prisma migration，不能只按前端静态发布处理。

发布前：

```powershell
npm.cmd --prefix packages/server-v2 run db:generate
npm.cmd --prefix packages/server-v2 run build
npm.cmd --prefix packages/server-v2 run test
```

上线前必须确认：

- 目标数据库已备份。
- migration 执行方式明确。
- 是否允许真实写库已单独授权。
- 库存、财务、排班相关脚本是否只作为验收工具，不在生产自动执行。

回滚策略：

- 代码层：revert `v0.9.0-rc.5` 的 squash merge commit。
- Gitee 层：将 `master` 回推到上一个确认可用提交。
- Release 层：保留 tag 并标记 superseded，或删除 prerelease。
- 数据层：如 migration 已执行，必须按数据库备份或反向 migration 单独处理，不自动回滚真实数据。

## 8. 推荐下一步

建议下一步先执行“发布范围冻结 + 分批提交计划”，不要直接发布：

1. 确认当前 256 个变更是否全部进入 `v0.9.0-rc.5`。
2. 创建 `codex/release-v0.9.0-rc5`。
3. 按主题分批提交。
4. 跑本地验证。
5. 推 GitHub PR。
6. CI 全绿并合并后，再同步到 Gitee `cocobao/beauty-salon` 的 `master`。

在用户明确授权前，不执行 `git push`、PR 创建、tag、release 或 Gitee `master` 推送。
