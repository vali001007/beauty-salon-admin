# 本地 Mock 退役改造详细计划

生成日期：2026-06-09

## 结论

建议推进“本地 Mock 退役”，但不要直接删除 `src/api/mock/**`。当前管理端运行时 API 已固定走 `real`，真正需要处理的是少量页面、旧 seed 脚本和历史 mock 模块仍引用本地大样本 JSON。正确做法是先断开运行时和 seed 对 `src/api/mock/data/*.json` 的依赖，再清理大 JSON，最后把历史 mock API 归档为测试夹具或删除。

本次改造目标是让项目只维护一套可信数据源：远端演示库中的 `Ami 全量演示门店`。本地不再维护另一套客户、消费记录、健康档案大样本数据。

## 当前现状

### 已完成基础

- `src/api/mode.ts` 已固定为 `real`，`VITE_API_MODE` 不再控制管理端运行时 API。
- `src/api/*.ts` 门面多数已直接导出 `src/api/real/*`。
- 远端演示库已清理为单门店口径，只保留 `Ami 全量演示门店`。
- `src/api/mock/README.md` 已明确 mock 仅作为历史样例和夹具，不再作为新增业务主线。

### 仍存在的本地大样本数据

| 文件 | 大小 | 当前用途 | 退役建议 |
| --- | ---: | --- | --- |
| `src/api/mock/data/customers.json` | 约 997KB | 客户画像、mock customer、mock marketing、mock recommendation、旧 seed | 改为 real API 和 seed 生成器后删除 |
| `src/api/mock/data/consumption-records.json` | 约 1.5MB | 客户画像、mock customer、mock marketing、mock recommendation、mock terminal、旧 seed | 改为 real API 和 seed 生成器后删除 |
| `src/api/mock/data/health-profiles.json` | 约 266KB | 客户画像、mock customer、mock marketing、mock recommendation、mock terminal、旧 seed | 改为 real API 和 seed 生成器后删除 |

### 精确引用点

运行时页面直接引用：

- `src/app/pages/UserProfile.tsx`
  - `@/api/mock/data/customers.json`
  - `@/api/mock/data/health-profiles.json`
  - `@/api/mock/data/consumption-records.json`

历史 mock API 引用：

- `src/api/mock/customer.ts`
- `src/api/mock/marketing.ts`
- `src/api/mock/recommendation.ts`
- `src/api/mock/terminal.ts`

旧 seed 脚本引用：

- `packages/server-v2/prisma/seed.ts`
- `packages/server-v2/prisma/seed-mvp.ts`

相关但不作为主线处理：

- `packages/app/vendor-src/**` 仍存在旧 mock 入口，这是 vendor 源码隔离区，不建议和管理端主线退役混在同一批改。
- 历史文档中仍有 `VITE_API_MODE=mock|real` 的旧设计描述，后续可做文档口径修订，但不阻塞本次工程改造。

## 改造目标

1. 管理端页面不再直接 import `src/api/mock/data/*.json`。
2. `packages/server-v2` seed 不再读取前端 mock JSON。
3. `src/api/mock/data/*.json` 可以在确认无引用后删除。
4. 历史 mock API 不再引用大 JSON；保留时只能作为轻量字段样例或测试 fixture。
5. 单测继续稳定，但测试逻辑不再依赖 `VITE_API_MODE=mock` 的真实切换能力。
6. 生产、演示、联调都使用 `server-v2` + Ami 全量演示门店数据。

## 非目标

- 不在本次改造里重建一套新的本地 mock 数据平台。
- 不恢复 `VITE_API_MODE` 双模式运行时切换。
- 不批量删除历史文档、原型、vendor 源码。
- 不直接删除 `src/api/mock/**` 整个目录，除非后续确认测试、文档和历史对照都不需要。
- 不影响 `Ami 全量演示门店` 远端演示数据。

## 推荐方案

采用“三段式退役”：

1. 运行时退役：先改 `UserProfile.tsx`，让客户画像完全基于 real API 返回的数据计算。
2. Seed 退役：改造 `seed.ts` 和 `seed-mvp.ts`，让它们使用内置生成器或复用 `seed-demo-full-store.ts` 的生成逻辑，不再读取前端 JSON。
3. 文件退役：确认引用为 0 后，删除 `src/api/mock/data/*.json`，并将历史 mock API 改成轻量 fixture 或移入测试专用目录。

这样做的好处是每一步都可独立验证，不会因为一次删除大 JSON 而同时打断页面、测试和 seed。

## 阶段 1：客户画像页切 real API

### 需要改的文件

- `src/app/pages/UserProfile.tsx`
- `src/api/customer.ts`
- `src/api/real/customer.ts`
- `packages/server-v2/src/customers/customers.controller.ts`
- `packages/server-v2/src/customers/customers.service.ts`

### 当前问题

`UserProfile.tsx` 直接在模块顶层 import 三个 JSON，并用 `computeSegmentStats`、`computeSkinStats`、`computeBehaviorProfiles`、`computeChurnScores`、`computeLTVPredictions` 在前端全量计算。这带来三个问题：

- 页面首屏被大 JSON 绑定，本地和远端数据天然分裂。
- 数据口径不随门店切换变化。
- 客户画像与真实客户、真实消费记录、真实健康档案不一致。

### 改造方式

优先方案：新增客户画像聚合 API，由后端计算后返回页面所需结构。

建议新增接口：

```text
GET /api/customers/profile-analytics
```

返回结构建议：

```ts
interface CustomerProfileAnalytics {
  generatedAt: string;
  storeId?: number;
  totalCustomers: number;
  segmentStats: SegmentStats[];
  skinStats: SkinStats[];
  behaviorProfiles: BehaviorProfile[];
  predictionRows: CustomerPredictionRow[];
}
```

前端页面改为：

- 页面加载时调用 `getCustomerProfileAnalytics()`。
- 保留当前 tabs、筛选、分页和跳转策略。
- `miniapp` tab 继续调用现有 `getCustomerMiniappBehaviorAnalysis()`。
- 失败时展示空态和错误提示，不回退到 mock JSON。

后端计算建议：

- 复用现有 `CustomersService.findAll()`、`getAllConsumptionRecords()`、`getAllHealthProfiles()` 的查询思路。
- 将 `src/utils/customerSegmentation.ts` 和 `src/utils/advancedAnalytics.ts` 中的纯计算逻辑迁移或复制到 `server-v2` 侧的 customer analytics helper。
- 日期基准不要继续使用硬编码 `2026-04-11`，应使用当前日期或请求参数 `baseDate`，演示环境可默认 `2026-06-01`。

### 验收标准

- `UserProfile.tsx` 不再出现 `@/api/mock/data`。
- 用户画像页能在 `Ami 全量演示门店` 下显示客户细分、肌质画像、消费画像、预测视角。
- 切换门店后画像数据按当前 `X-Store-Id` 变化。
- 后端接口响应时间可接受；如全量计算超过 2 秒，后续再加分页或缓存。

## 阶段 2：营销、推荐、终端 mock 大 JSON 断依赖

### 需要改的文件

- `src/api/mock/customer.ts`
- `src/api/mock/marketing.ts`
- `src/api/mock/recommendation.ts`
- `src/api/mock/terminal.ts`
- `src/api/mock/README.md`

### 改造策略

这些文件当前不属于管理端运行时主线，但它们引用大 JSON 会阻止删除 `src/api/mock/data/*.json`。建议按用途拆分：

- `src/api/mock/customer.ts`：如果测试还需要，改成 3 到 5 条内联轻量样例，不再读取大 JSON。
- `src/api/mock/marketing.ts`：保留策略、活动、效果相关的轻量样例；涉及客户分群的计算改为固定返回少量样例。
- `src/api/mock/recommendation.ts`：如果没有测试引用，优先归档或删除；如保留，改成固定 5 条推荐样例。
- `src/api/mock/terminal.ts`：只保留终端接口结构样例，不再读取消费记录和健康档案大 JSON。

### 验收标准

- `rg '@/api/mock/data|./data/customers.json|./data/consumption-records.json|./data/health-profiles.json' src` 返回 0。
- `src/api/mock/README.md` 更新为“历史轻量 fixture，不维护大样本演示数据”。
- 单测不因 mock 模块调整失败。

## 阶段 3：Seed 脚本退役前端 JSON

### 需要改的文件

- `packages/server-v2/prisma/seed.ts`
- `packages/server-v2/prisma/seed-mvp.ts`
- 可选新增：`packages/server-v2/prisma/seed-generators/customer-generator.ts`

### 当前问题

`seed.ts` 和 `seed-mvp.ts` 通过 `readMockJson()` 读取前端目录下的客户、消费记录、健康档案 JSON。这样后端 seed 依赖前端 mock 文件，导致数据所有权混乱。

### 改造方式

推荐做法：

1. 从 `seed-demo-full-store.ts` 抽出客户、消费记录、健康档案生成器。
2. `seed.ts` 和 `seed-mvp.ts` 改为调用生成器，而不是读 `src/api/mock/data/*.json`。
3. 所有生成数据加明确前缀或门店归属，避免再次污染多门店环境。
4. 保留 dry-run 能力，输出计划写入数量。

可选更激进做法：

- 废弃 `seed.ts` 和 `seed-mvp.ts` 作为历史脚本，只保留 `seed-demo-full-store.ts` 作为演示数据主入口。
- `package.json` 中 `db:seed` 指向新的演示门店 seed 或明确标注旧脚本不再维护。

### 验收标准

- `packages/server-v2/prisma/seed.ts` 不再出现 `readMockJson('src/api/mock/data/...')`。
- `packages/server-v2/prisma/seed-mvp.ts` 不再出现 `readMockJson('src/api/mock/data/...')`。
- `npm.cmd --prefix packages/server-v2 run db:seed:demo-full:dry-run` 可运行。
- 如继续保留 `db:seed` 或 `db:seed:mvp:dry-run`，对应命令也必须通过。

## 阶段 4：删除大 JSON 数据文件

### 删除对象

仅在前 3 阶段验收通过后，删除：

- `src/api/mock/data/customers.json`
- `src/api/mock/data/consumption-records.json`
- `src/api/mock/data/health-profiles.json`

是否删除 `src/api/mock/data/` 空目录，取决于后续是否仍保留 README 或轻量 fixture。按当前目标，建议删除空目录，但保留 `src/api/mock/README.md`。

### 删除前检查

必须执行：

```powershell
rg -n "api/mock/data|customers\\.json|consumption-records\\.json|health-profiles\\.json" src packages/server-v2
```

预期结果：

```text
无结果
```

注意：根据项目约定，不得未经授权批量删除文件。删除这 3 个文件前需要再次向用户确认，或在任务请求中明确授权。

## 阶段 5：测试和文档口径收敛

### 测试调整

需要关注：

- `src/test/api.test.ts`
  - 保留“即使设置 `VITE_API_MODE=mock`，运行时仍走 real”的测试。
  - 删除或改写任何期待 mock API 被选中的测试。
- `packages/server-v2/src/customers/customers.service.spec.ts`
  - 补客户画像聚合 API 的服务层测试。
- 如新增 `profile-analytics` 接口，补 controller/service 测试。

建议执行：

```powershell
npm.cmd run test
npm.cmd --prefix packages/server-v2 run test
npm.cmd --prefix packages/server-v2 run build
npm.cmd run build
```

如时间有限，最低验收：

```powershell
npx vitest run src/test/api.test.ts
npm.cmd --prefix packages/server-v2 run build
```

### 文档调整

需要更新：

- `src/api/mock/README.md`
- `docs/api-contract.md`
- `docs/02-产品设计/Admin Panel/Admin Panel-requirements.md`
- `docs/02-产品设计/Admin Panel/Admin Panel-design.md`
- `docs/数据现状分析-主数据清单-数据流程图-数据图谱.md`

文档口径建议：

- 管理端运行时不再支持 mock/real 双模式切换。
- 演示数据来自远端 `Ami 全量演示门店`。
- 本地 mock 只作为历史字段样例或单测 fixture，不作为业务数据源。

## 风险与处理

| 风险 | 影响 | 处理 |
| --- | --- | --- |
| 客户画像后端聚合接口响应慢 | 用户画像页加载变慢 | 先做接口聚合，后续按页签拆接口或加缓存 |
| 前端算法迁移到后端后口径变化 | 画像数值与旧页面不同 | 在文档中明确口径切换为真实库数据，保留一次对照验收 |
| 旧 seed 脚本仍被某些流程使用 | 删除 JSON 后 seed 失败 | 先改 seed，再删 JSON |
| 历史 mock API 被未发现的测试引用 | 单测失败 | 删除前先跑 `rg` 和核心测试 |
| 文档仍写 mock/real 双模式 | 团队认知混乱 | 工程改完后做文档口径修订 |

## 建议排期

### Day 1：运行时断依赖

- 新增 `GET /customers/profile-analytics`。
- `UserProfile.tsx` 改用 real API。
- 跑管理端构建和客户画像页手动验收。

### Day 2：Seed 与 mock API 断依赖

- 抽取或新增 seed 生成器。
- 改 `seed.ts`、`seed-mvp.ts`。
- mock API 改轻量 fixture 或归档。
- 跑后端 build 和 seed dry-run。

### Day 3：删除大 JSON 与文档收敛

- 确认引用为 0。
- 经用户确认后删除 3 个大 JSON。
- 更新 mock README 和 API 契约文档。
- 跑完整测试和构建。

## 任务拆解

| 优先级 | 任务 | 文件 | 验收 |
| --- | --- | --- | --- |
| P0 | 新增客户画像聚合 API | `packages/server-v2/src/customers/*` | 返回客户细分、肌质、消费画像、预测数据 |
| P0 | 用户画像页切 real API | `src/app/pages/UserProfile.tsx`、`src/api/customer.ts`、`src/api/real/customer.ts` | 页面无 mock JSON import |
| P0 | seed 脚本改生成器 | `packages/server-v2/prisma/seed.ts`、`seed-mvp.ts` | 不再读取前端 mock JSON |
| P1 | 历史 mock API 轻量化 | `src/api/mock/*.ts` | 不再 import `./data/*.json` |
| P1 | 删除 3 个大 JSON | `src/api/mock/data/*.json` | `rg` 无引用，构建通过 |
| P1 | 更新 mock README | `src/api/mock/README.md` | 明确 mock 已退役为 fixture |
| P2 | 修订历史文档 mock/real 口径 | `docs/**/*.md` | 不再把 `VITE_API_MODE=mock` 写成当前运行时方案 |

## 最终验收清单

- `rg -n "api/mock/data|customers\\.json|consumption-records\\.json|health-profiles\\.json" src packages/server-v2` 无结果。
- `UserProfile.tsx` 首屏不加载本地 JSON。
- `src/api/mode.ts` 仍固定为 real。
- `npm.cmd run build` 通过。
- `npm.cmd run test` 通过。
- `npm.cmd --prefix packages/server-v2 run build` 通过。
- `npm.cmd --prefix packages/server-v2 run test` 通过。
- `db:seed:demo-full:dry-run` 通过。
- 演示环境只依赖 `Ami 全量演示门店`。

## 推荐决策

建议立刻启动阶段 1 和阶段 2，但阶段 4 的实际删除动作需要单独确认。这样可以先把数据口径统一到真实后端，同时保留删除前的安全阀，符合“不要维护本地和生产两套数据”的目标，也避免因为直接删文件影响 seed 和测试。

## 2026-06-09 执行结果

- 已新增 `GET /api/customers/profile-analytics`，客户画像页改为调用真实后端聚合结果，不再 import `src/api/mock/data/*.json`。
- 已新增 `src/api/mock/fixtures.ts`，历史 mock API 改为使用少量轻量 fixture，不再读取本地大样本 JSON。
- 已将 `packages/server-v2/prisma/seed.ts` 改为主线演示门店 seed 入口，`seed-mvp.ts` 不再读取前端 mock JSON。
- 已删除 3 个本地大样本 JSON：`customers.json`、`consumption-records.json`、`health-profiles.json`。
- 已更新 `src/api/mock/README.md`，明确本地 mock 只作为轻量字段夹具和历史离线样例，不再维护演示大样本数据。
- 已通过阶段性验证：引用搜索为 0、前端 TypeScript 检查通过、`packages/server-v2` build 通过。完整测试和构建结果以最终验收命令输出为准。
