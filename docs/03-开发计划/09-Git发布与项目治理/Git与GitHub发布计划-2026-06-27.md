# Git 与 GitHub 发布计划 - 2026-06-27

## 1. 当前结论

当前不建议直接发布到 `main`。本地分支 `codex/amiagent` 已经包含 8 个本地提交，并叠加了大量未提交改动，范围覆盖 Ami Agent、提成规则、库存、终端收银/开卡、API 契约和产品/开发文档，属于高风险跨模块发布。

推荐路径是：先做发布前整理与验证，再分批提交到 `codex/amiagent`，推送分支后创建 Draft PR，CI 与人工审查通过后再转 Ready 并合并。

## 2. 当前 Git / GitHub 状态

- 当前本地分支：`codex/amiagent`
- 当前 GitHub 远端分支：仅 `main`
- 当前打开 PR：无
- 当前本地分支未设置 upstream
- `git fetch --prune origin` 当前失败：本仓库配置了 `http.proxy=http://127.0.0.1:14228`，但执行时代理服务未连接
- GitHub API 可访问，说明 GitHub 账号与仓库权限正常
- 当前已有本地提交相对 `main` 超前 8 个
- 当前未提交改动：约 58 个已修改文件、32 个未跟踪文件
- 当前必须排除提交的本地文件：`.codex/config.toml`

## 3. 发布范围拆解

### 3.1 已有本地提交

当前 `codex/amiagent` 相对 `main` 已有 8 个提交：

1. `docs: 归档产品设计文档，新增 Ami_Agent 需求文档 v2.0`
2. `feat: 经营利润模块、工作台多角色配置、权限优化`
3. `feat(aura): 阶段1 - AI优先意图层、对话上下文、AuraResponseBlock输出协议`
4. `feat(agent): 后端 AgentOrchestratorService 自动构建 renderedBlocks`
5. `feat(agent): 阶段2 - AgentPersona、AI智能体工作台前端入口`
6. `feat(agent): register new tools for manager/reception/marketing Agent personas`
7. `feat(agent): implement 8 new tool methods for manager/reception/marketing Agent`
8. `fix: add prisma migration for agent_persona, rendered_block, feedback tables`

### 3.2 本次未提交增量

未提交增量建议按以下发布主题拆分：

1. 文档与契约同步
   - 产品设计文档
   - API 契约
   - 终端 API 文档
   - 智能体开发任务清单与接口收敛文档

2. Prisma schema / migration / 发布验证脚本
   - `commission_rule_assignments`
   - `agent_memory_archive`
   - `agent_automation_engine`
   - Agent preflight、schema readiness、runtime readiness、post migration verify、API e2e 等脚本
   - 负库存修复与业务接口收敛验证脚本

3. Agent 后端能力
   - planner / orchestrator / tool registry / eval / response safety
   - automation、memory、observability、schema readiness
   - controller、module、types 与对应单测

4. 业务后端收敛
   - 提成规则与适用对象
   - 卡项、订单、库存、终端服务逻辑
   - 相关 DTO 与单测

5. 管理端前端
   - Ami Agent 工作台
   - Agent block renderer
   - 提成规则配置页
   - 卡项/订单/营销策略相关 API 与类型

6. Ami Aura Lite 终端
   - 开卡、验卡、收银流转卡片
   - `auraCoreService`
   - 终端类型与余额抵扣辅助逻辑

## 4. 不进入本次发布的内容

以下内容不应进入 Git 提交：

- `.codex/config.toml`：本地 Codex 运行配置
- 本地 `.env` / `.env.local`
- 本地代理配置
- 已决定不推送的 PPTX 文件
- `node_modules/`、`dist/`、日志、测试输出、运行缓存

## 5. 发布前置条件

### 5.1 恢复 Git 网络

当前仓库 Git 代理配置为：

```powershell
git config --local http.proxy http://127.0.0.1:14228
git config --local https.proxy http://127.0.0.1:14228
```

发布前必须先启动本地代理，或临时取消代理。推荐保持代理开启后执行：

```powershell
git fetch --prune origin
git status --short --branch
```

成功标准：

- `git fetch --prune origin` 成功
- GitHub 远端仍只有 `main`
- 本地 `codex/amiagent` 基于最新 `origin/main` 整理

### 5.2 清理提交边界

提交前执行：

```powershell
git status --short
git diff --check
git ls-files --others --exclude-standard
```

处理要求：

- `.codex/config.toml` 不提交
- 确认新增文档确实属于本次 Ami Agent / 终端 / 提成发布范围
- 确认迁移脚本与 Prisma schema 一致
- 确认没有误带本地运行产物

## 6. 建议提交计划

建议在 `codex/amiagent` 上做 6 个增量提交。

### Commit 1 - 文档与契约

建议提交信息：

```text
docs(agent): record ami agent release scope and interface contracts
```

范围：

- 产品需求文档
- API 契约文档
- 终端 API 文档
- 智能体开发任务清单
- 终端业务接口收敛文档

验收：

- 文档路径正确
- 不包含本地临时配置
- 文档口径与代码改动主题一致

### Commit 2 - Prisma 与发布验证脚本

建议提交信息：

```text
feat(agent): add memory automation schema and release verification scripts
```

范围：

- Prisma schema
- Agent memory / automation migrations
- Commission assignment migration
- Agent preflight、readiness、post migration verify、API e2e 脚本
- 业务接口收敛与库存修复脚本

验收：

```powershell
npm.cmd --prefix packages/server-v2 run db:generate
npm.cmd --prefix packages/server-v2 run agent:schema-readiness
npm.cmd --prefix packages/server-v2 run agent:runtime-readiness
```

如依赖真实数据库，先用 plan / dry-run / audit 模式，不直接写生产库。

### Commit 3 - Agent 后端核心能力

建议提交信息：

```text
feat(agent): extend planner orchestration memory and automation services
```

范围：

- Agent planner
- Orchestrator
- Tool registry
- Eval
- Safety
- Automation / memory / observability / schema readiness services
- Controller / module / types

验收：

```powershell
npm.cmd --prefix packages/server-v2 test -- agent --runInBand
npm.cmd --prefix packages/server-v2 run build
```

### Commit 4 - 业务后端联动

建议提交信息：

```text
feat(business): align commission inventory card order and terminal flows
```

范围：

- Commission controller / service / DTO / tests
- Cards service
- Orders service
- Inventory service
- Terminal service / DTO / tests

验收：

```powershell
npm.cmd --prefix packages/server-v2 test -- commission cards orders inventory terminal --runInBand
npm.cmd --prefix packages/server-v2 run build
```

### Commit 5 - 管理端前端与 API facade

建议提交信息：

```text
feat(admin): wire ami agent workspace commission and business facades
```

范围：

- `src/api/real/agent.ts`
- `src/api/real/commission.ts`
- `src/api/real/card.ts`
- `src/api/real/inventory.ts`
- `AmiAgentWorkspace`
- `AgentBlockRenderer`
- `CommissionRules`
- 卡项、订单、营销策略相关页面
- 类型与 API 测试

验收：

```powershell
npx.cmd vitest run src/test/api.test.ts
npm.cmd run build
```

### Commit 6 - Ami Aura Lite 终端联动

建议提交信息：

```text
feat(kiosk): align aura card cashier and balance deduction flows
```

范围：

- 终端开卡、验卡、收银卡片
- `auraCoreService`
- `memberBalanceDeduct`
- 终端类型与相关测试

验收：

```powershell
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
npm.cmd run test:e2e:kiosk
```

如 e2e 环境未就绪，至少记录未验证原因，并执行可运行的定向单测。

## 7. 发布验证矩阵

发布前建议至少完成以下验证：

| 层级 | 命令 | 通过标准 |
| --- | --- | --- |
| Git 基础 | `git diff --check` | 无 whitespace error |
| Prisma | `npm.cmd --prefix packages/server-v2 run db:generate` | Prisma Client 生成成功 |
| 后端构建 | `npm.cmd --prefix packages/server-v2 run build` | 构建成功 |
| Agent 单测 | `npm.cmd --prefix packages/server-v2 test -- agent --runInBand` | 通过 |
| 业务后端单测 | `npm.cmd --prefix packages/server-v2 test -- commission cards orders inventory terminal --runInBand` | 通过 |
| 管理端 API | `npx.cmd vitest run src/test/api.test.ts` | 通过 |
| 管理端构建 | `npm.cmd run build` | 通过 |
| 终端构建 | `npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build` | 通过 |
| 终端 E2E | `npm.cmd run test:e2e:kiosk` | 通过或记录环境阻塞 |
| Agent readiness | `npm.cmd --prefix packages/server-v2 run agent:schema-readiness` / `agent:runtime-readiness` | 通过或明确 pending 项 |

## 8. GitHub 发布流程

### 8.1 推送分支

验证通过后执行：

```powershell
git push -u origin codex/amiagent
```

### 8.2 创建 Draft PR

建议 PR 标题：

```text
Ami Agent 智能体、提成规则与终端业务接口收敛发布
```

建议 PR 类型：Draft PR。

PR 描述必须包含：

- 发布范围
- 迁移清单
- 验证命令与结果
- 真实数据库脚本是否执行
- 未验证项与风险
- 回滚方案

### 8.3 PR 审查重点

审查重点：

- Prisma migration 是否可重复、可部署
- Agent 输出是否有字段范围与安全收敛
- 提成规则适用对象是否会影响既有结算
- 库存负数修复是否会改变历史数据口径
- 终端收银、开卡、验卡是否兼容旧流程
- 前端是否仍走 Real API，不新增运行时 mock
- `.codex/config.toml` 等本地配置是否未进入 PR

### 8.4 转 Ready 与合并

满足以下条件后转 Ready：

- CI 全部通过
- 发布验证矩阵完成
- 迁移执行策略明确
- 未验证项可以接受或已补齐

建议合并方式：

```text
Squash and merge
```

合并后：

```powershell
git checkout main
git fetch --prune origin
git reset --hard origin/main
git branch -d codex/amiagent
```

如果分支仍需继续开发，则保留本地分支，但必须重新基于 `main` 创建下一阶段分支。

## 9. 数据库与生产发布策略

本次涉及 Prisma migration 与真实业务数据脚本，不能把“代码合并”视为“生产完成”。

建议分三步：

1. 本地 / 开发库
   - `db:generate`
   - `db:migrate`
   - readiness / audit 脚本

2. Staging
   - `db:migrate:prod`
   - Agent readiness
   - 终端核心流程手工验证
   - 提成规则样例验证

3. Production
   - 先备份数据库
   - 执行 `db:migrate:prod`
   - 只执行明确授权的修复 / backfill 脚本
   - 发布后观察 Agent 调用、终端收银、提成结算、库存流水

## 10. 回滚方案

代码回滚：

- GitHub PR 使用 squash merge 后，可通过 revert merge commit 回滚
- 若未合并，只关闭 PR 并删除远端分支

数据库回滚：

- Prisma migration 默认没有自动 down migration
- 生产执行前必须先做数据库备份
- 对涉及数据修复的脚本，必须保留 dry-run / audit 输出
- 真实写库脚本需要单独授权

## 11. 建议下一步

建议下一步不要直接 push，而是先做发布前整理：

1. 启动本地代理，确保 `git fetch --prune origin` 成功
2. 排除 `.codex/config.toml`
3. 按 6 个提交批次 staging
4. 执行发布验证矩阵
5. 生成 PR 描述
6. 获得授权后推送 `codex/amiagent` 并创建 Draft PR
