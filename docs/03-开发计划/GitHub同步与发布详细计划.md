# GitHub 同步与发布详细计划

更新时间：2026-06-15

适用分支：`codex/ami-aura-lite-kiosk`

## 1. 当前状态判断

### 1.1 Git 状态

- 当前分支：`codex/ami-aura-lite-kiosk`
- 远端跟踪分支：`origin/codex/ami-aura-lite-kiosk`
- 本地 HEAD 与远端 HEAD：已同步，ahead/behind 为 `0/0`
- 当前 HEAD：`e0c88bd`
- 当前分支相对 `main`：已有 14 个提交
- 当前分支在 GitHub 上：暂无打开的 PR

### 1.2 工作区风险

当前工作区不适合直接发布，也不适合直接 `git add .` 后整体提交。

已观察到的主要风险：

- 已跟踪文件修改较多，横跨管理端、后端、终端、文档、API、类型定义和 Prisma schema。
- 存在 3 个已跟踪 mock 数据文件删除，需要确认是否属于“本地 mock 退役”范围。
- 未跟踪文件较多，包含新文档、新模块、新 migration、小程序目录、测试文件和生成产物。
- `packages/server-v2/coverage/` 存在未跟踪覆盖率文件，属于生成产物，不应进入 GitHub。
- Git 输出存在大量 LF/CRLF 提示，说明提交前需要控制格式噪音，避免无关换行改动扩大审查范围。

### 1.3 产品交付判断

当前更像“阶段性大集成分支”，不是“可直接生产发布版本”。

推荐结论：

- 可以同步到 GitHub 分支。
- 应通过 Draft PR 做集成验收。
- 暂不建议直接合并 `main`。
- 暂不建议直接打正式 release。

## 2. 总体策略

采用“先固化分支、再拆提交、再开 Draft PR、再验证、最后合并/发版”的策略。

目标不是一次性把所有内容推成一个大提交，而是把当前项目状态整理成可审查、可回滚、可验证的阶段成果。

## 3. 执行阶段

## 阶段 0：冻结当前工作区范围

目标：避免在整理 Git 状态时继续混入新业务开发。

执行要求：

- 暂停新增业务功能。
- 不批量删除文件。
- 不回滚现有改动。
- 不使用 `git add .`。
- 所有提交按业务边界选择文件。
- 如发现不确定文件，先保留，不清理。

建议命令：

```powershell
git status --short --branch
git diff --stat
git diff --name-status
```

交付结果：

- 明确哪些改动属于本轮集成。
- 明确哪些改动属于生成产物或临时文件。
- 明确哪些删除需要产品确认。

## 阶段 1：排除不应提交内容

目标：先把明显不该进入 GitHub 的内容隔离出来。

重点处理：

- `packages/server-v2/coverage/`
- 各子包可能生成的 `dist/`
- 本地环境文件
- 临时日志、缓存、IDE 产物

建议补充 `.gitignore`：

```gitignore
coverage/
**/coverage/
```

注意：

- 只修改忽略规则，不直接批量删除 coverage 目录。
- 如确实需要删除本地 coverage 文件，应先获得用户授权。

验收标准：

- `git status --short` 中不再出现 coverage 产物。
- 未跟踪文件列表只保留真实业务文件、文档、测试和 migration。

## 阶段 2：确认删除文件是否合理

目标：避免误删历史 mock 数据或演示数据。

当前需要确认的删除：

```text
src/api/mock/data/consumption-records.json
src/api/mock/data/customers.json
src/api/mock/data/health-profiles.json
```

判断口径：

- 如果这些删除属于“本地 mock 退役”计划，则可以保留删除并在提交信息中说明。
- 如果只是临时误删，应恢复或重新纳入后续处理。
- 如果数据已迁移到轻量 fixture，需要在对应文档或 README 中说明替代位置。

验收标准：

- 每个删除文件都有明确原因。
- 删除影响已被测试或构建覆盖。

## 阶段 3：按主题拆分提交

目标：把大工作区拆成可审查、可回滚的提交。

建议拆分为 7 组提交。

### 提交 1：协作与文档更新

范围：

- `AGENTS.md`
- `CLAUDE.md`
- `docs/**`

排除：

- 临时导出文件
- 大体积非必要二进制资料
- 与本轮发布无关的历史归档

建议提交信息：

```text
docs: update project collaboration and integration plans
```

验收：

- 文档路径合理。
- 没有误提交临时文件。

### 提交 2：后端数据模型与 migrations

范围：

- `packages/server-v2/prisma/schema.prisma`
- `packages/server-v2/prisma/migrations/**`
- `packages/server-v2/prisma/seed*.ts`
- 新增业务模块依赖的 DTO、module、service、controller

建议提交信息：

```text
feat(api): add backend models and service modules for current integration
```

验证命令：

```powershell
Set-Location "packages/server-v2"
npm.cmd run build
npm.cmd run test
```

验收：

- Prisma schema 与 migration 能对应。
- seed 脚本无明显类型错误。
- 后端测试通过。

### 提交 3：前端 API 与类型定义

范围：

- `src/api/**`
- `src/types/**`
- `src/schemas/**`
- `src/utils/**`

建议提交信息：

```text
feat(admin): wire real APIs and shared types
```

验证命令：

```powershell
npm.cmd run test
npm.cmd run build
```

重点检查：

- 门面 API 是否已导出。
- `src/api/index.ts` 是否同步。
- 调用方是否重复 `.data.data`。
- 分页结构是否使用 `{ items }` 或兼容 `{ data }`。

### 提交 4：管理端页面与权限菜单

范围：

- `src/app/pages/**`
- `src/app/components/**`
- `src/app/routes.tsx`
- `src/config/permissions.ts`
- `src/i18n/**`

建议提交信息：

```text
feat(admin): add management workflows and navigation entries
```

验证命令：

```powershell
npm.cmd run lint
npm.cmd run test
npm.cmd run build
```

重点检查：

- 菜单权限与路由权限一致。
- 新页面在超级管理员账号下可访问。
- 没有仅前端展示、后端接口缺失的空闭环。

### 提交 5：Ami Aura Lite 智能终端

范围：

- `packages/Ami-Aura-Lite-Kiosk/src/**`
- `packages/Ami-Aura-Lite-Kiosk/scripts/**`
- `packages/Ami-Aura-Lite-Kiosk/package.json`
- `packages/Ami-Aura-Lite-Kiosk/vite.config.ts`

建议提交信息：

```text
feat(kiosk): enhance Ami Aura Lite terminal workflows
```

验证命令：

```powershell
Set-Location "packages/Ami-Aura-Lite-Kiosk"
npm.cmd run build
```

重点检查：

- 意图解析测试是否覆盖核心命令。
- 终端服务记录、收银、核销、跟进任务流程是否能闭环。
- 如浏览器验证卡在初始化态，需要在 PR 中说明以 build/test 为主要证据。

### 提交 6：Ami Glow 小程序

范围：

- `packages/Ami-Glow-MiniApp/**`
- 相关 `docs/02-产品设计/Ami_Glow/**`
- 相关 `docs/03-开发计划/Ami_Glow_客户服务小程序详细开发计划.md`

建议提交信息：

```text
feat(miniapp): add Ami Glow customer service mini app
```

验证命令：

```powershell
Set-Location "packages/Ami-Glow-MiniApp"
npm.cmd install
npm.cmd run typecheck
```

验收：

- TypeScript 检查通过。
- 微信开发者工具导入路径清楚。
- 本轮未联调真实接口的能力在 PR 中标记清楚。

### 提交 7：测试与工程配置

范围：

- `eslint.config.js`
- `package.json`
- 各子包 `package.json`
- 新增测试文件
- CI 或脚本调整

建议提交信息：

```text
test: add integration coverage and project checks
```

验证命令：

```powershell
npm.cmd run lint
npm.cmd run test
npm.cmd run build
npm.cmd run check:api
```

验收：

- 根项目测试通过。
- 后端测试通过。
- 终端构建通过。
- 无生成产物被提交。

## 阶段 4：推送分支并创建 Draft PR

目标：把当前阶段成果同步到 GitHub，但保留“未正式发布”的状态。

建议命令：

```powershell
git push origin codex/ami-aura-lite-kiosk
gh pr create --draft --base main --head codex/ami-aura-lite-kiosk --title "Ami Aura Lite integration and admin workflow updates" --body-file docs/03-开发计划/GitHub同步与发布详细计划.md
```

PR 建议状态：

- 先创建 Draft PR。
- PR 描述中标明：当前为集成验收，不是生产发布。
- PR 中列出本地验证命令与结果。
- PR 中列出未验证项和已知风险。

## 阶段 5：合并前验证

目标：把 Draft PR 转为 Ready 前完成最小可靠验证。

必须完成：

```powershell
npm.cmd run lint
npm.cmd run test
npm.cmd run build
npm.cmd run check:api
```

后端补充：

```powershell
Set-Location "packages/server-v2"
npm.cmd run build
npm.cmd run test
```

终端补充：

```powershell
Set-Location "packages/Ami-Aura-Lite-Kiosk"
npm.cmd run build
```

小程序补充：

```powershell
Set-Location "packages/Ami-Glow-MiniApp"
npm.cmd run typecheck
```

建议手动验收：

- 管理端登录：`admin / 11111111`
- 仪表盘与工作台是否可打开
- 智能营销推荐页面是否能加载真实接口
- 项目、客户、排班、库存、订单入口是否无明显空白
- Ami Aura Lite 终端是否能完成核心入口加载
- Swagger `/docs` 是否能打开

## 阶段 6：合并策略

推荐使用 Squash merge 或保留主题提交两种方式之一。

### 方案 A：Squash merge

适用场景：

- 希望 `main` 历史保持简洁。
- PR 审查结果只需要一个阶段性集成点。

建议 squash message：

```text
feat: integrate Ami Aura Lite and admin business workflows
```

### 方案 B：保留主题提交

适用场景：

- 希望保留文档、后端、前端、终端、小程序的独立演进记录。
- 后续可能按模块回滚或 cherry-pick。

建议：

- 每个提交保持单一主题。
- 合并前 rebase 到最新 `main`。
- 避免把修复提交、临时提交、格式化提交混入主历史。

当前推荐：

- 如果提交拆分做得足够清楚，优先使用方案 B。
- 如果整理后仍然较碎，使用方案 A。

## 阶段 7：发布策略

当前不建议直接发布正式版本。

建议分三步：

### 7.1 集成预览版本

目标：

- 内部验收。
- 产品经理确认流程完整性。
- 技术侧确认构建、测试、迁移风险。

建议 tag：

```text
v0.8.0-rc.1
```

前置条件：

- Draft PR 通过本地验证。
- PR 转为 Ready。
- `main` 合并完成。

### 7.2 演示版本

目标：

- 给业务方或演示环境使用。
- 不承诺生产稳定性。

建议 tag：

```text
v0.8.0-demo.1
```

前置条件：

- 演示数据 seed 跑通。
- 管理端和终端核心链路可演示。
- 明确哪些功能仍是 MVP。

### 7.3 正式发布版本

目标：

- 可部署到稳定环境。

建议 tag：

```text
v0.8.0
```

前置条件：

- 数据库 migration 可在目标环境执行。
- 回滚方案明确。
- 环境变量清单完整。
- 核心路径完成手动验收。
- 没有高风险未跟踪文件或生成物进入仓库。

## 4. 风险清单

| 风险 | 影响 | 建议 |
| --- | --- | --- |
| 工作区改动过大 | 审查困难、回滚困难 | 按主题拆提交 |
| coverage 产物未忽略 | 仓库污染、PR 噪音 | 补 `.gitignore`，不提交 coverage |
| mock 数据删除未确认 | 单测或离线样例可能失效 | 先确认删除原因 |
| Prisma migration 多 | 数据库升级风险 | 后端 build/test + migration 核对 |
| 管理端、终端、后端同时变更 | 联调风险高 | Draft PR 集成验收 |
| LF/CRLF 提示多 | 无关 diff 变大 | 避免全量格式化 |
| 新小程序目录未验证 | 可能提交半成品 | 单独提交并跑 typecheck |

## 5. 推荐执行顺序

1. 补 `.gitignore`，排除 coverage。
2. 确认 3 个 mock JSON 删除是否属于计划内退役。
3. 按文档、后端、API 类型、管理端、终端、小程序、测试配置拆分提交。
4. 每组提交前用 `git diff --cached --stat` 复核。
5. 每组提交后跑对应最小验证。
6. 全部提交完成后跑完整验证。
7. 推送 `codex/ami-aura-lite-kiosk`。
8. 创建 Draft PR 到 `main`。
9. 在 PR 中记录验证结果和未验证项。
10. 验收通过后转 Ready。
11. 合并到 `main`。
12. 根据验收级别打 `rc`、`demo` 或正式 tag。

## 6. 本轮建议的最小可执行闭环

如果只做最小同步，不做正式发版，建议完成以下动作：

```powershell
# 1. 查看状态
git status --short --branch

# 2. 只暂存忽略规则和本计划文档
git add .gitignore docs/03-开发计划/GitHub同步与发布详细计划.md
git commit -m "docs: add GitHub sync and release plan"

# 3. 后续按模块继续拆提交
git add <module files>
git commit -m "<type(scope): message>"

# 4. 推送分支
git push origin codex/ami-aura-lite-kiosk

# 5. 创建 Draft PR
gh pr create --draft --base main --head codex/ami-aura-lite-kiosk
```

注意：

- 第 2 步中的 `.gitignore` 只有在实际补充 coverage 忽略规则后再执行。
- 如果暂时不改 `.gitignore`，可以只提交本计划文档。
- 后续业务文件提交必须逐组选择文件，不使用 `git add .`。

## 7. Go / No-Go 标准

### 可以同步到 GitHub 分支

满足任一条件即可：

- 至少完成文档计划提交。
- 或已完成第一批主题提交。

### 可以创建 Draft PR

需要满足：

- coverage 等生成产物未进入暂存区。
- 删除文件已有说明。
- 至少能说明当前验证状态。

### 可以转 Ready PR

需要满足：

- 根项目 build/test/lint/check:api 通过。
- 后端 build/test 通过。
- 终端 build 通过。
- 小程序如纳入 PR，typecheck 通过。
- PR 描述列出已知风险。

### 可以合并 main

需要满足：

- Ready PR 通过。
- 无阻塞级验证失败。
- migration 风险已说明。
- 产品侧确认本轮范围。

### 可以正式发布

需要满足：

- 已从 `main` 打 tag。
- 环境变量与部署配置完整。
- 数据库升级与回滚路径明确。
- 管理端、后端、终端核心链路完成验收。

## 8. 建议结论

当前最优策略是：

```text
整理本地改动 -> 拆主题提交 -> push 当前分支 -> 开 Draft PR -> 完整验证 -> 再决定是否合并 main 和打 tag
```

当前不建议：

- 直接 `git add .`
- 直接合并 `main`
- 直接发正式 release
- 批量删除未跟踪文件
- 把 coverage、dist、临时产物提交到 GitHub

