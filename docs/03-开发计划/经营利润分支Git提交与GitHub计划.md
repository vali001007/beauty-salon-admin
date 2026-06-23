# 经营利润分支 Git 提交与 GitHub 推进计划

更新时间：2026-06-22
适用分支：`codex/operation-profit-phase0`
当前建议：先整理为主题提交，再推送当前分支并创建 Draft PR；暂不直接合并 `main` 或正式发布。

---

## 1. 当前仓库状态

### 1.1 Git / GitHub 状态

- 当前分支：`codex/operation-profit-phase0`
- 当前 HEAD：`6c465d6c chore(release): retire demo seed gate`
- 当前 HEAD 与 `origin/main` 一致，工作区改动尚未提交。
- 当前分支没有 upstream。
- 远端没有 `origin/codex/operation-profit-phase0` 分支。
- GitHub 当前没有打开的 PR。
- 远端仓库：`git@github.com:vali001007/beauty-salon-admin.git`

交付影响：这批改动还停留在本地大集成状态，GitHub 上没有审查入口，也没有 CI/PR 记录可追踪。下一步不能直接 `git add .`，应先按业务边界拆提交。

### 1.2 工作区规模

当前已跟踪文件变更约 132 个，`git diff --stat` 显示约：

- 新增：9433 行
- 删除：1821 行

未跟踪文件较多，覆盖：

- 经营利润模块页面、API、类型、后端模块、迁移和脚本。
- 终端客户选择、服务员工归属和操作人上下文。
- 行业数据平台、供应平台 MVP 后端/前端/API/类型/迁移。
- 经营利润业务确认包、验收记录、只读/写库手册和 pending JSON。
- 产品设计、开发计划、市场营销资料和产品手册迁移。

交付影响：这是 L3 级发布整理任务，涉及 Prisma migration、真实数据修复脚本、终端链路、管理端路由权限和大量文档。GitHub 计划必须保留 Draft PR 和分阶段验证，不建议直接 Ready 或 release。

### 1.3 已发现的关键风险

| 风险 | 产品/交付影响 | 处理建议 |
| --- | --- | --- |
| 工作区过大 | PR 审查困难，回滚困难 | 拆成主题提交；必要时拆 PR |
| Prisma schema 同时包含经营利润、行业平台、供应平台 | 数据库发布风险叠加 | migration 按模块解释，PR 中列出必需执行顺序 |
| 真实数据确认包仍有 pending/TODO | 经营利润不能宣称业务验收通过 | Draft PR 明确为技术集成，业务确认包完成后再转 Ready |
| `AGENTS.md` 是协作规则变更 | 容易和业务功能混审 | 单独提交，PR 描述中说明是否纳入本轮 |
| 产品手册从 `docs/02-产品设计` 删除，又在 `docs/05-市场营销` 出现 | 可能是资料归档迁移，也可能是误删 | 作为“营销资料归档”单独提交，提交前复核路径 |
| LF/CRLF warning 很多 | 可能产生格式噪音 | 避免全量格式化；提交前跑 `git diff --check` |
| 当前没有 upstream | 推送后才有 GitHub 审查入口 | 提交完成后执行 `git push -u origin codex/operation-profit-phase0` |

---

## 2. 当前业务范围判断

当前分支不是单一功能，而是三组业务一起推进：

1. 经营利润一级模块：利润看板、商品/项目毛利、会员卡履约、员工人效、成本配置、真实数据确认包和发布门禁。
2. 上游闭环：订单、提成、卡项、终端服务员工/操作人追踪，保证后续新订单能支撑毛利与人效。
3. 行业数据平台与供应平台 MVP：行业模板、BOM 模板、供应商/报价/采购链路、管理端入口和权限。

推荐产品口径：

- “经营利润”可以作为主 PR 标题。
- “行业数据平台 + 供应平台 MVP”建议在 PR 描述中标成同分支的扩展范围，或拆为第二个 Draft PR。
- 当前不能标成“经营利润已完成业务验收”，只能标成“技术链路与验收工具已完成，真实业务验收仍受确认包阻断”。

---

## 3. 推荐提交拆分

> 原则：按业务闭环拆，不按文件夹机械拆；每次提交前用 `git diff --cached --stat` 复核暂存范围。

### 提交 1：协作规则收口

建议 message：

```text
docs: refine project agent collaboration rules
```

范围：

- `AGENTS.md`

说明：

- 只放协作规则变化。
- 不混入经营利润代码，便于以后单独调整。

### 提交 2：经营利润产品、开发和验收文档

建议 message：

```text
docs(operation-profit): document scope readiness and release gates
```

范围：

- `docs/02-产品设计/美容院经营利润看板需求文档.md`
- `docs/03-开发计划/经营利润一级模块*.md`
- `docs/04-测试数据/经营利润*.md`
- `docs/04-测试数据/operation-profit-*.json`
- `docs/04-测试数据/operation-profit-confirmation-drafts/**`
- 本文件

说明：

- 这组提交解释“为什么不能直接 Ready”：readiness 仍受服务人归属、提成记录、项目身份确认阻断。
- pending/draft JSON 必须保留 pending/TODO 保护，不作为真实写库确认。

### 提交 3：经营利润数据模型、迁移和发布门禁

建议 message：

```text
feat(operation-profit): add schema migrations and release checks
```

范围：

- `packages/server-v2/prisma/schema.prisma` 中经营利润相关字段和模型。
- `packages/server-v2/prisma/migrations/20260619093000_operation_profit/`
- `packages/server-v2/prisma/migrations/20260619110000_commission_rule_user/`
- `packages/server-v2/prisma/migrations/20260619113000_commission_staff_user/`
- `packages/server-v2/prisma/migrations/20260619121500_member_card_operator/`
- `packages/server-v2/prisma/migrations/20260619124500_customer_card_operator/`
- `packages/server-v2/prisma/migrations/20260619131500_operation_profit_query_indexes/`
- `packages/server-v2/tsconfig.operation-profit-scripts.json`
- `scripts/check-operation-profit-release.mjs`
- `package.json`
- `packages/server-v2/package.json`

说明：

- 这是数据库和发布门禁核心提交。
- 如果 `schema.prisma` 已同时包含行业/供应平台模型，提交时要么只暂存经营利润相关 hunk，要么把行业/供应平台拆到后续提交。

### 提交 4：经营利润后端 API、脚本和单测

建议 message：

```text
feat(operation-profit): add backend APIs and readiness tooling
```

范围：

- `packages/server-v2/src/operation-profit/**`
- `packages/server-v2/prisma/operation-profit-*.ts`
- `packages/server-v2/src/app.module.ts` 中 `OperationProfitModule` 注册。
- 经营利润相关后端测试。

说明：

- 覆盖经营利润聚合、成本配置、readiness、审计、确认包、dry-run、抽样复算。
- PR 描述要说明脚本默认只读/dry-run，真实写库必须二次授权。

### 提交 5：订单、提成、卡项和终端上游闭环

建议 message：

```text
feat(operation-profit): track operators and assignees across orders and terminal
```

范围：

- `packages/server-v2/src/orders/**`
- `packages/server-v2/src/commission/**`
- `packages/server-v2/src/cards/**`
- `packages/server-v2/src/terminal/**`
- `packages/server-v2/src/customers/**`
- `packages/server-v2/src/bom/**`
- 相关 DTO、测试、业务查询服务。

说明：

- 这组不是“附带优化”，它决定商品/项目毛利和员工人效能否从新订单开始闭环。
- 需要在 PR 中解释：历史订单仍需要确认包修复，新订单链路已补服务人/操作人归属。

### 提交 6：管理端经营利润页面、权限、API 和类型

建议 message：

```text
feat(admin): add operation profit views and permissions
```

范围：

- `src/app/pages/operation-profit/**`
- `src/api/operationProfit.ts`
- `src/api/real/operationProfit.ts`
- `src/api/real/operationProfit.test.ts`
- `src/types/operationProfit.ts`
- `src/app/routes.tsx` 中经营利润路由。
- `src/app/components/Layout.tsx` 中经营利润菜单分组。
- `src/config/permissions.ts` 中经营利润权限。
- `src/test/api.test.ts`
- `src/test/permissions.test.ts`

说明：

- 页面只能宣称“技术可访问、接口接通、空态/错误态/分页覆盖”。
- 真实业务数字验收要等 readiness 至少 `conditional`。

### 提交 7：终端客户选择、服务员工归属和操作人上下文

建议 message：

```text
feat(kiosk): require customer and assignee context for cashier flows
```

范围：

- `packages/Ami-Aura-Lite-Kiosk/src/app/**`
- `src/api/terminal.ts`
- `src/api/real/terminal.ts`
- `src/types/terminal.ts`
- `docs/terminal-api.md`

说明：

- 这组保障终端开单、核销、办卡、充值不再产生缺操作人/缺服务人的新数据。
- 与经营利润强相关，但建议独立提交，便于终端单独回归。

### 提交 8：行业数据平台 MVP

建议 message：

```text
feat(industry): add industry data platform MVP
```

范围：

- `packages/server-v2/src/industry/**`
- `src/app/pages/IndustryDataPlatform.tsx`
- `src/api/industry.ts`
- `src/api/real/industry.ts`
- `src/types/industry.ts`
- `packages/server-v2/prisma/seed-industry-mvp.ts`
- `packages/server-v2/prisma/sync-industry-bom-to-core.ts`
- 行业数据平台相关 migration、权限和路由 hunk。
- 行业数据平台产品/开发文档。

说明：

- 这组和经营利润有“项目 BOM 成本来源”的关系，但产品上是另一个平台能力。
- 如果 PR 过大，建议单独拆为第二个 Draft PR。

### 提交 9：供应平台 MVP

建议 message：

```text
feat(supply-platform): add supplier catalog and procurement MVP
```

范围：

- `packages/server-v2/src/supply-platform/**`
- `src/app/pages/supply-platform/**`
- `src/api/supplyPlatform.ts`
- `src/api/real/supplyPlatform.ts`
- `src/types/supplyPlatform.ts`
- `packages/server-v2/prisma/supply-platform-*.ts`
- 供应平台相关 migration、权限和路由 hunk。
- 供应平台产品/开发文档。

说明：

- 这组不建议和经营利润主链路混成一个 commit。
- 如果继续放在同一 PR，要在 PR 描述中标记为“同分支扩展范围，独立验收”。

### 提交 10：业务页面联动、项目档案和产品资料归档

建议 message：

```text
feat(admin): connect project and product workflows to profit context
```

范围：

- `src/app/components/AddProjectDialog.tsx`
- `src/app/pages/ProjectOrderManagement.tsx`
- `src/app/pages/ProductOrderManagement.tsx`
- `src/app/pages/ServiceConsumption.tsx`
- `src/app/pages/ProductManagement.tsx`
- `src/app/pages/GoodsProductManagement.tsx`
- `src/app/pages/finance/**`
- 产品手册从 `docs/02-产品设计` 到 `docs/05-市场营销` 的归档移动。

说明：

- 这里有多个页面联动，提交前要复核 diff，避免把行业/供应平台页面混进来。
- 产品手册删除/新增要确认为“资料归档迁移”，不是误删。

### 提交 11：API 契约、通用类型和测试补齐

建议 message：

```text
test: add API and permission coverage for profit and platform modules
```

范围：

- `docs/api-contract.md`
- `src/api/index.ts`
- `src/types/index.ts`
- `src/types/order.ts`
- `src/types/project.ts`
- `src/types/bom.ts`
- `src/types/user.ts`
- `src/utils/businessTime.ts`
- `packages/server-v2/src/common/utils/**`
- 其他跨模块测试和工具函数。

说明：

- 作为最后一个“收口提交”。
- 提交前跑完整门禁，确认没有漏导出、权限路由不一致或 API facade 缺口。

---

## 4. GitHub PR 方案

### 方案 A：一个 Draft PR，保留主题提交

适用：希望先把本地大集成完整同步到 GitHub，后续在一个 PR 中评审。

PR 标题建议：

```text
新增经营利润一级模块与行业/供应平台 MVP 集成
```

优点：

- 快速形成远端备份和审查入口。
- 能展示完整集成链路。

风险：

- PR 很大，经营利润、行业平台、供应平台会互相影响审查。
- 后续如果只想合并经营利润，拆分成本较高。

### 方案 B：拆成两个 Draft PR

推荐。

PR 1：经营利润与终端/订单上游闭环

```text
新增经营利润一级模块：利润看板、商品/项目毛利、履约风险、人效与成本配置
```

包含提交 1-7、10-11 中与经营利润直接相关部分。

PR 2：行业数据平台与供应平台 MVP

```text
新增行业数据平台与供应平台 MVP
```

包含提交 8-9，以及行业/供应平台相关文档、权限、路由、schema hunk。

优点：

- 产品验收边界清晰。
- 经营利润可以先进入 Draft 审查，行业/供应平台不阻塞主线。
- 后续回滚和延期更容易。

代价：

- 需要更细的 hunk 暂存和可能的新分支拆分。
- `schema.prisma`、`routes.tsx`、`permissions.ts` 需要谨慎分离。

### 方案 C：三个 Draft PR

适用：希望进一步降低风险。

- PR 1：协作规则和文档收口。
- PR 2：经营利润主链路。
- PR 3：行业数据平台 + 供应平台 MVP。

当前不优先推荐，因为会增加 PR 管理成本；除非你希望先快速提交文档和协作规则。

---

## 5. 推荐执行顺序

1. 冻结当前工作区，不再混入新功能。
2. 按提交 1-11 逐组暂存，不使用 `git add .`。
3. 每组暂存后执行：

```powershell
git diff --cached --stat
git diff --cached --name-status
```

4. 每组提交前确认没有生成产物、临时文件、错误删除。
5. 经营利润主链路完成后跑：

```powershell
npm.cmd run check:operation-profit
npm.cmd run check:operation-profit:frontend
npm.cmd --prefix packages/server-v2 run operation-profit:scripts:typecheck
npm.cmd --prefix packages/server-v2 test -- operation-profit --runInBand
npm.cmd run check:operation-profit:build
npm.cmd run check:operation-profit:whitespace
```

6. 终端提交完成后跑：

```powershell
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
```

7. 行业/供应平台提交完成后跑：

```powershell
npm.cmd --prefix packages/server-v2 run build
npm.cmd run build
```

8. 全部提交完成后跑：

```powershell
npm.cmd run check:operation-profit:full
npm.cmd run test
npm.cmd run build
npm.cmd run check:api
```

9. 用户授权后推送：

```powershell
git push -u origin codex/operation-profit-phase0
```

10. 用户授权后创建 Draft PR：

```powershell
gh pr create --draft --base main --head codex/operation-profit-phase0 --title "新增经营利润一级模块：利润看板、商品/项目毛利、履约风险、人效与成本配置" --body-file "docs/03-开发计划/经营利润一级模块PR草稿.md"
```

如果选择方案 B，先基于提交边界拆出第二分支，再分别开 PR。

---

## 6. Draft PR 描述必须写清楚

PR 中必须避免误报“业务已完成”。建议写清：

- 已完成：经营利润代码链路、管理端页面、API facade、后端聚合、readiness/确认包/dry-run 脚本、发布门禁。
- 已完成：终端/订单新数据的服务人和操作人链路补齐。
- 已完成：目标库 6 条经营利润相关 migration 曾在本地记录中 applied，经营成本已写入测试数据。
- 未完成：历史服务人归属、提成记录、项目身份仍需业务确认。
- 未完成：页面登录态 6 页真实业务验收需要 readiness 至少 `conditional` 后执行。
- 阻断原因：确认包仍有 pending/TODO，不能执行真实写库 apply。
- 发布状态：Draft，仅用于集成验收，不建议生产发布。

---

## 7. Go / No-Go 标准

### 可以提交本地 Git

- 每个提交能解释业务边界。
- 暂存区无明显生成产物。
- 删除文件有原因。
- `git diff --cached --check` 不报错。

### 可以推送 GitHub 分支

- 本地提交已拆分完成。
- 工作区没有未解释的大量未跟踪文件。
- 至少跑过经营利润静态门禁或记录未跑原因。

### 可以创建 Draft PR

- PR 描述写清已验证和未验证项。
- migration 风险写清。
- readiness 阻断写清。
- 不把 Draft PR 表述为正式上线版本。

### 可以转 Ready PR

- `check:operation-profit:full` 通过。
- 根项目 `test/build/check:api` 通过，或失败项有明确非阻塞解释。
- 终端 build 通过。
- 行业/供应平台如果纳入同 PR，后端和管理端构建通过。
- 业务确认包通过统一预检，或 PR 明确不包含真实业务验收。

### 可以合并 main

- Ready PR 通过。
- migration 执行顺序、目标环境和回退方案已确认。
- 产品侧确认本轮范围。
- 没有阻塞级真实数据风险。

### 可以正式发布

- 合并到 `main` 后从 `main` 打 tag。
- 目标库 migration 和备份策略明确。
- 经营利润 readiness 至少达到 `conditional`。
- 6 个经营利润页面完成登录态业务验收。
- 真实写库脚本只在确认包通过且用户授权后执行。

---

## 8. 当前建议结论

建议采用方案 B：

```text
先拆经营利润 + 终端/订单上游闭环 Draft PR；
再拆行业数据平台 + 供应平台 MVP Draft PR；
协作规则和资料归档保持独立提交。
```

当前不建议：

- 直接 `git add .`
- 直接推送未拆分大提交
- 直接开 Ready PR
- 直接合并 `main`
- 直接正式发布
- 把 pending/TODO 确认包当作真实业务确认

下一步如果获得授权，可以按本计划开始逐组暂存、提交、验证、推送并创建 Draft PR。
