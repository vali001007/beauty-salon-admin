# 次卡主数据归并实施计划

> 日期：2026-07-13  
> 对应设计：`docs/superpowers/specs/2026-07-13-card-master-deduplication-design.md`  
> 范围：只处理次卡主数据重复、关联引用迁移和新增/编辑防重，不调整持卡人权益、核销金额和历史价格快照。

## 目标与确认映射

本次把四组重复次卡归并到已经确认的规范主数据：

| 重复卡 ID | 规范卡 ID | 名称             | 处理原则                                    |
| --------- | --------- | ---------------- | ------------------------------------------- |
| 12        | 2         | 补水护理 10 次卡 | 迁移引用后删除 12                           |
| 13        | 3         | 敏感修护 8 次卡  | 迁移引用后删除 13                           |
| 15        | 5         | 抗衰管理 6 次卡  | 迁移引用后删除 15                           |
| 16        | 6         | 综合养护 20 次卡 | 保留 ID 6 的项目次数配置，迁移引用后删除 16 |

ID 17 为库存验收测试卡，不参与归并。

## 完成口径

- 次卡主表从 10 条收敛到 6 条，保留 ID `2、3、5、6、14、17`。
- `CustomerCard.cardId`、`CardUsageRecord.cardId`、次卡类 `OrderItem.itemId` 全部指向规范卡。
- 订单项目快照只替换 JSON 中等于旧卡 ID 的 `cardId/itemId` 标识，不修改成交价、折扣、次数等历史字段。
- `CustomerCard.pricingSnapshot`、`CardUsageRecord.pricingSnapshot` 完整保留。
- 归并前后持卡实例数、购买次数、剩余次数、实付金额、核销次数、核销收入和订单净额守恒。
- 新增或编辑次卡时，同一门店范围内规范化后同名返回 HTTP 409；全局卡和门店卡分别管理。
- 脚本默认只审计；只有显式传入 `--apply --yes` 才写库，并在写库前输出本地备份文件。

## Task 1：新增主数据防重测试

**文件：**

- 修改：`packages/server-v2/src/cards/cards.service.spec.ts`
- 修改：`packages/server-v2/src/cards/cards.service.ts`

**RED：**

1. 增加创建次卡测试：同一 `storeId` 下，名称经过 trim、连续空格压缩和大小写归一后命中已有卡，预期抛出 `ConflictException`，且不调用 `card.create`。
2. 增加更新次卡测试：查询冲突时排除当前 ID；改成其他已存在名称时返回 409。
3. 增加门店边界测试：全局卡与门店专属卡同名不互相阻断，不同门店同名不互相阻断。
4. 运行：

```powershell
npm.cmd --prefix packages/server-v2 test -- cards.service.spec.ts --runInBand
```

测试必须先失败，失败原因应为尚未执行重复名称查询或未抛出 409。

**GREEN：**

1. 在 `CardsService` 中加入名称规范化与同门店范围冲突检查。
2. `create` 在写入前检查；`update` 根据合并后的 name/storeId 检查并排除自身。
3. 冲突信息返回已有卡 ID 和名称，页面沿用现有错误提示直接展示。

## Task 2：新增归并核心的单元测试

**文件：**

- 新增：`packages/server-v2/src/cards/card-master-deduplication.ts`
- 新增：`packages/server-v2/src/cards/card-master-deduplication.spec.ts`

**RED：**

1. 测试固定映射只包含 `12→2、13→3、15→5、16→6`，ID 17 不在映射中。
2. 测试 JSON 标识替换：递归替换数值或数字字符串形式的 `cardId/itemId`，不修改价格、次数及其他 ID 字段。
3. 测试审计分类：缺少源卡/目标卡、源目标门店范围不一致、名称不一致进入 `blocked`；ID 16 项目配置差异作为已批准例外记录为 warning。
4. 测试事务迁移顺序：持卡实例、核销记录和次卡订单项完成迁移并确认旧引用为 0 后才删除旧主数据。
5. 测试归并前后关键数量与金额不守恒时事务抛错。

运行：

```powershell
npm.cmd --prefix packages/server-v2 test -- card-master-deduplication.spec.ts --runInBand
```

**GREEN：**

1. 实现可复用的归并映射、名称规范化、JSON 标识迁移和守恒比较函数。
2. 实现 `auditCardMasterDeduplication`，输出每组卡的配置差异、引用数量和金额摘要。
3. 实现 `applyCardMasterDeduplication`，在单一 Prisma 事务内完成迁移、旧引用检查、删除和守恒校验。

## Task 3：实现默认 dry-run 的治理脚本

**文件：**

- 新增：`packages/server-v2/prisma/card-master-deduplication.ts`
- 修改：`packages/server-v2/package.json`

**实现：**

1. 默认执行审计并以 JSON 输出 `ready/manual_review/blocked`、每组引用和守恒基线。
2. 只有同时传入 `--apply --yes` 才允许调用事务归并。
3. 写库前在 `outputs/card-master-deduplication/` 生成带时间戳的 JSON 备份，包含源卡/目标卡、持卡实例、核销记录和次卡订单项；不读取或修改客户姓名等无关信息。
4. apply 后再次审计并输出剩余旧引用、保留卡 ID 和守恒结果。
5. 增加 npm 命令：

```json
{
  "card-master:dedupe": "ts-node --esm prisma/card-master-deduplication.ts"
}
```

## Task 4：准备数据库最终唯一约束

**文件：**

- 新增：`packages/server-v2/prisma/migrations/20260713143000_card_scope_normalized_name_unique/migration.sql`

**实现：**

增加表达式唯一索引：门店范围使用 `COALESCE(storeId, 0)`，名称使用 trim、连续空白压缩和 lower 后的值。

该 migration 只在真实重复数据完成归并后才可部署。当前仓库存在其他未部署 migration，本任务不得直接运行全量 `prisma migrate deploy`，避免把财务中心或 Ami Brain 的未授权 schema 一并写入数据库。交付时明确标记该数据库约束为“代码已准备、待独立迁移窗口执行”；运行时先由服务层 409 门禁阻断新重复数据。

## Task 5：定向验证代码

依次运行：

```powershell
npm.cmd --prefix packages/server-v2 test -- cards.service.spec.ts card-master-deduplication.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run build
git diff --check -- packages/server-v2/src/cards packages/server-v2/prisma/card-master-deduplication.ts packages/server-v2/prisma/migrations/20260713143000_card_scope_normalized_name_unique packages/server-v2/package.json docs/superpowers
```

若全量后端 build 被工作区中其他未提交模块阻断，必须保留定向测试结果，并把无关阻断文件和错误原文单独列出，不把它误报为本任务失败。

## Task 6：执行真实归并与 live verify

用户已经确认四组映射并要求按计划开发，因此允许执行本次映射范围内的数据归并；不授权其他数据库迁移、财务回填或 Ami Brain 数据写入。

1. 先运行 dry-run：

```powershell
npm.cmd --prefix packages/server-v2 run card-master:dedupe
```

2. 只有 dry-run 为 ready、备份成功且不存在 blocked 项时执行：

```powershell
npm.cmd --prefix packages/server-v2 run card-master:dedupe -- --apply --yes
```

3. apply 后直接查询真实数据库并确认：

- `Card` 不再存在 `12、13、15、16`；
- `CustomerCard`、`CardUsageRecord` 和次卡订单项对旧 ID 的引用均为 0；
- 保留卡 ID 为 `2、3、5、6、14、17`；
- 守恒指标全部相等；
- ID 6 的项目配置仍为 `8+6+6=20`；
- ID 17 未被修改。

4. 不执行 commit、push、PR 或全量 migrate deploy，等待用户另行授权。

## 实施结果（2026-07-13）

- 代码已完成：同门店范围名称规范化防重、HTTP 409 提示、dry-run、自动备份、事务归并、守恒校验和幂等重复执行。
- 真实归并已完成：旧卡 `12、13、15、16` 已删除，规范卡 `2、3、5、6` 保留；ID 17 未修改。
- 旧引用已清零：`CustomerCard=0`、`CardUsageRecord=0`、次卡类 `OrderItem=0`。
- 归并前后守恒：292 张持卡实例、3204 总次数、2612 剩余次数、实付 1,106,140 元；38 条核销、核销 14,751 元；17 条订单项、净额 60,840 元。
- ID 6 项目配置保持为 `8+6+6=20`。
- 本地备份：`outputs/card-master-deduplication/card-master-backup-2026-07-13T07-25-58-884Z.json`。
- 验证通过：次卡定向测试 12/12、`server-v2` build、归并后 dry-run 状态 `already_applied`。
- 数据库表达式唯一索引 migration 已准备，但未执行；原因是当前仓库存在其他待部署 migration，不能在本任务内运行全量 `migrate deploy`。
