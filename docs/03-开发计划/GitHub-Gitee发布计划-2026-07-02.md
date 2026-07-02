# GitHub 与 Gitee 发布计划

更新时间：2026-07-02

## 1. 当前结论

当前不适合直接打 tag 或发布 Release。

原因是本地 `main` 已经同步到 GitHub/Gitee 的 `v0.9.0-rc.5` 发布提交，但工作区又产生了一批新的未提交开发改动，覆盖会员卡划扣、组合支付、退款恢复、库存采购入库、财务结算、Ami Aura 终端收银和管理端页面。

建议下一轮版本使用 `v0.9.0-rc.6`，作为 GitHub Pre-release，并在 GitHub 主线通过 CI/CD 后同步到 Gitee：

- GitHub：主发布源，走分支、PR、CI、合并、tag、Pre-release。
- Gitee：同步源，目标仓库为 `https://gitee.com/cocobao/beauty-salon/tree/master/`，在 GitHub 发布完成后同步 `master`。

## 2. 当前仓库事实

- 本地路径：`D:\AI coding\beauty-salon-admin`
- 当前分支：`main`
- 当前主线提交：`c6da153d v0.9.0-rc.5: Ami Agent semantic and business capability prerelease`
- 当前最新 tag：`v0.9.0-rc.5`
- GitHub 远端：`origin -> git@github.com:vali001007/beauty-salon-admin.git`
- Gitee 目标远端：`gitee-beauty -> git@gitee.com:cocobao/beauty-salon.git`
- Gitee 目标页面：`https://gitee.com/cocobao/beauty-salon/tree/master/`
- 当前本地工作区：未提交，约 34 个已跟踪文件变更，约 1470 行新增、145 行删除，另有 2 个未跟踪文档。

## 3. 本轮候选发布范围

### 会员卡与收银

- 会员卡划扣从单一金额扩展为可按项目/商品明细划扣。
- 会员卡本金和赠送金按比例分摊扣减，不再简单按赠送金优先或单一余额处理。
- 订单退款时按原划扣结构恢复会员卡本金/赠送余额。
- 终端收银支持会员余额不足时的组合支付，由会员余额加其他支付方式共同完成订单。
- 后端增加组合支付金额校验，避免前端传入的支付拆分与订单实收金额不一致。

### 库存与采购

- 采购入库支持通过 `productId`、SKU、商品名称匹配库存商品。
- 商品名称匹配只在门店内唯一时生效，避免同名商品误入库。
- 库存批次补充成本价、总金额和供应商信息。
- 管理端库存与采购页面同步展示和传递新增字段。

### 财务与经营分析

- 日结、提成、经营利润和预收负债分析同步适配会员余额划扣、组合支付和退款恢复。
- 订单类型补充会员余额划扣明细，便于前端页面展示和财务核对。

### Ami Aura 终端

- 终端收银流程增强会员余额可用性判断。
- 会员余额可部分支付时，终端自动生成组合支付结构。
- 终端支付摘要与后端 DTO 同步扩展，减少终端和后端口径不一致。

### 文档

- 新增 Agent 能力完成任务文档。
- 新增会员卡划扣本金/赠送金按比例分摊改进方案。
- 新增本发布计划和版本变更说明。

## 4. Go / No-Go 判断

当前判断：No-Go，不能直接发布。

进入 Go 的条件：

1. 基于当前未提交改动创建发布分支。
2. 将代码和文档按主题分批提交。
3. 本地关键验证通过。
4. GitHub PR CI 全部通过。
5. 合并到 `main` 后 GitHub 主线 CI/CD 完成。
6. 确认生产部署状态，尤其是此前 `deploy-production` 可能因 Vercel secret 缺失导致实际部署跳过的问题。
7. GitHub Release 创建完成后，再同步 Gitee `master`。

## 5. GitHub 发布计划

### 阶段 1：冻结版本号与分支

建议版本号：

```powershell
v0.9.0-rc.6
```

建议发布分支：

```powershell
codex/release-v0.9.0-rc6
```

操作：

```powershell
git status --short --branch
git switch main
git switch -c codex/release-v0.9.0-rc6
```

注意：当前工作区有未提交改动，不要执行 `git reset --hard` 或清理命令。

### 阶段 2：分批提交

建议提交批次：

1. `feat(member-card): add proportional balance deduction and refund restore`
2. `feat(terminal): support member balance split payments`
3. `feat(inventory): improve purchase receiving product matching`
4. `feat(finance): align settlement profit and commission metrics`
5. `docs(release): add rc6 release plan and changelog`

提交时排除：

- `.env`
- `.codex/`
- `node_modules/`
- `dist/`
- `coverage/`
- 运行日志和临时文件
- PPTX、大文件、本地下载文件

### 阶段 3：本地验证

最低验证命令：

```powershell
git diff --check
npm.cmd --prefix packages/server-v2 run db:generate
npm.cmd --prefix packages/server-v2 run build
npm.cmd --prefix packages/server-v2 run test
npm.cmd run lint
npm.cmd run build
npm.cmd run test
npm.cmd run build --prefix packages/Ami-Aura-Lite-Kiosk
```

建议追加定向验证：

```powershell
npm.cmd --prefix packages/server-v2 run test -- --runInBand src/orders/orders.service.spec.ts src/inventory/inventory.service.spec.ts
npx.cmd vitest run src/test/api.test.ts
```

业务验收场景：

1. 会员卡余额足够时，订单全额会员卡划扣。
2. 会员卡余额不足时，终端组合支付成功。
3. 会员卡本金/赠送金按比例扣减，金额精确到分。
4. 订单退款后，本金/赠送金按原结构恢复。
5. 采购入库按 `productId` 命中商品。
6. SKU 命中商品。
7. 商品名称唯一时命中商品；不唯一时拒绝自动入库。
8. 库存批次能记录成本价、总金额和供应商。
9. 日结、提成、经营利润、预收负债页面口径一致。

### 阶段 4：创建 PR

推送分支：

```powershell
git push origin codex/release-v0.9.0-rc6
```

PR 标题：

```text
v0.9.0-rc.6：会员卡划扣分摊、组合支付与采购入库能力预发布
```

PR 说明需要包含：

- 发布范围
- 核心变更
- 本地验证结果
- CI 要求
- 部署影响
- 回滚方式

必过检查：

- frontend
- backend
- terminal-prototype
- ami-semantic-agent
- deploy-production 或主线部署任务

### 阶段 5：合并与 GitHub Release

CI 全绿后执行 squash merge 到 `main`。

合并后：

```powershell
git switch main
git pull --ff-only origin main
git tag v0.9.0-rc.6
git push origin v0.9.0-rc.6
```

创建 GitHub Pre-release：

- Tag：`v0.9.0-rc.6`
- Title：`v0.9.0-rc.6 - 会员卡划扣分摊、组合支付与采购入库能力预发布`
- 勾选：`Set as a pre-release`
- Release notes：使用 `docs/03-开发计划/版本变更说明.md`

## 6. Gitee 发布计划

Gitee 只在 GitHub 主线发布成功后同步，不作为主发布源。

### 阶段 1：只读检查

```powershell
git status --short --branch
git remote -v
git branch -vv
git ls-remote --heads gitee-beauty master dev_hhm_from_github_main
git ls-remote --tags gitee-beauty v0.9.0-rc.6
```

### 阶段 2：同步 master

如果 Gitee `master` 与 GitHub `main` 可快进：

```powershell
git push gitee-beauty main:master
```

如果 Gitee `master` 需要覆盖，必须再次获得明确授权后使用：

```powershell
git push gitee-beauty main:master --force-with-lease
```

同步保留分支：

```powershell
git push gitee-beauty main:dev_hhm_from_github_main --force-with-lease
```

同步 tag：

```powershell
git push gitee-beauty v0.9.0-rc.6
```

### 阶段 3：发布后核对

```powershell
git ls-remote --heads gitee-beauty master dev_hhm_from_github_main
git ls-remote --tags gitee-beauty v0.9.0-rc.6
```

验收标准：

- Gitee `master` 指向 GitHub `main` 最新合并提交。
- Gitee `dev_hhm_from_github_main` 与 `master` 保持一致。
- Gitee tag `v0.9.0-rc.6` 指向同一发布提交。
- 页面 `https://gitee.com/cocobao/beauty-salon/tree/master/` 能看到最新代码。

## 7. 风险与处理

| 风险 | 影响 | 处理 |
| --- | --- | --- |
| 会员卡本金/赠送金分摊错误 | 直接影响财务口径 | 用分级单测覆盖满额、部分支付、退款恢复、四舍五入余数 |
| 组合支付金额不一致 | 订单实收和支付记录不一致 | 后端强校验支付拆分总额等于订单实收 |
| 采购入库名称误匹配 | 库存批次进入错误商品 | 名称匹配只允许门店内唯一商品 |
| 财务报表口径漂移 | 日结、提成、经营利润不一致 | 发布前做同一订单在多个页面的口径核对 |
| Gitee master 覆盖风险 | 覆盖 Gitee 上的独立提交 | 先 `ls-remote` 记录旧 SHA，必要时只用 `--force-with-lease` |
| 生产部署实际未执行 | GitHub 显示成功但线上未更新 | 检查部署日志和线上版本，不只看 CI 绿色 |

## 8. 回滚方式

GitHub：

1. 找到 `v0.9.0-rc.6` 对应 squash merge commit。
2. 创建 revert PR。
3. CI 通过后合并。
4. 在 Release notes 标记 `v0.9.0-rc.6` 已被 superseded。

Gitee：

1. 找到发布前 `master` 的旧 SHA。
2. 获得授权后执行：

```powershell
git push gitee-beauty <old-sha>:master --force-with-lease
```

数据：

- 本轮计划不自动执行真实写库脚本。
- 如涉及生产数据库修复或数据回填，必须单独形成脚本、备份方案和授权。

## 9. 建议下一步

建议下一步直接进入 `v0.9.0-rc.6` 发布分支整理：

1. 创建 `codex/release-v0.9.0-rc6`。
2. 分批提交当前未提交改动。
3. 先跑后端订单、库存相关定向测试。
4. 再跑全量 build/test。
5. 通过后创建 GitHub PR。
