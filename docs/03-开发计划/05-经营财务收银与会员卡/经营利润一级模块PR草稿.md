# 经营利润一级模块 PR 草稿

更新时间：2026-06-20
建议 PR 状态：Draft，待业务确认包、readiness 和页面验收完成后再转 Ready
分支：`codex/operation-profit-phase0`

---

## 标题

新增经营利润一级模块：利润看板、商品/项目毛利、履约风险、人效与成本配置

---

## 变更范围

- 管理端新增“经营利润”一级模块和 6 个子页面：
  - 利润看板
  - 商品毛利
  - 项目毛利
  - 会员卡履约
  - 员工人效
  - 成本配置
- 后端新增经营利润 API：
  - `GET /operation-profit/overview`
  - `GET /operation-profit/product-margins`
  - `GET /operation-profit/project-margins`
  - `GET /operation-profit/prepaid-liabilities`
  - `GET /operation-profit/beautician-performance`
  - `GET/POST/PATCH/DELETE /operation-costs`
- 新增 `OperatingCost` 经营成本模型、成本配置服务和权限门禁。
- 商品毛利接入商品订单、商品成本快照/商品档案成本、商品提成记录。
- 项目毛利接入项目订单、项目 BOM、可归因实耗、项目提成记录。
- 总览毛利统一扣减经营收入相关的商品/项目提成，不混入办卡、充值等非经营收入提成。
- 扩展提成规则和提成记录，支持系统用户维度的指定员工规则与月结归集。
- 会员卡充值/扣减/客户办卡增加操作人追踪，保证履约和卡项记录能追溯处理人。
- 新增只读审计、readiness、成本 seed、服务人归属候选、美容师账号绑定候选、员工账号创建确认/写回、业务确认包统一预检、正式确认 JSON 草稿生成、确认后只读 dry-run 编排、服务人写回 dry-run、毛利抽样复算脚本。
- readiness 增加 `commission_rule_coverage`，抽样复算增加 `missing_commission_rule`，用于区分“提成规则未覆盖”和“已有规则但历史提成记录待回填”。

---

## 核心口径

商品毛利：

```text
商品毛利 = 商品净收入 - 商品成本 - 商品提成成本
```

商品成本优先级：

```text
订单明细成本快照 > 库存销售出库确认 > 商品档案成本 > 缺成本
```

项目毛利：

```text
项目毛利 = 项目净收入 - 耗材成本 - 项目提成成本
```

项目耗材成本优先级：

```text
可归因实际耗材出库 > 项目 BOM 标准成本 > 缺 BOM/缺实耗提示
```

退款口径：

```text
商品/项目订单收入均按已完成退款比例分摊后取净收入
```

---

## 权限

| 角色 | 预期 |
| --- | --- |
| `super_admin` | 可查看经营利润全部页面，可维护成本 |
| `store_manager` | 可查看经营利润，成本配置只读 |
| `inventory_manager` | 仅默认保留项目毛利入口 |
| `cashier` / `beautician` | MVP 默认不展示经营利润入口 |

后端成本配置权限：

| 接口 | 权限 |
| --- | --- |
| `GET /operation-costs` | `core:operation-cost:view` |
| `POST/PATCH/DELETE /operation-costs` | `core:operation-cost:manage` |
| `POST /operation-costs/copy-from-previous-month` | `core:operation-cost:manage` |

---

## 已验证

```powershell
npm.cmd run check:operation-profit:full
npm.cmd --prefix packages/server-v2 test -- orders
npm.cmd --prefix packages/server-v2 test -- commission
npm.cmd --prefix packages/server-v2 test -- terminal
npm.cmd --prefix packages/server-v2 test -- cards
npm.cmd --prefix packages/server-v2 run db:generate
```

最新结果：

- 经营利润后端定向测试：4 个 suite、26 个测试通过，覆盖商品/项目退款净收入、商品毛利退款后亏损筛选、商品/项目提成订单明细回挂、项目毛利状态筛选分页、员工人效提成扣减和成本配置复制/跨月保护。
- 订单、提成、终端、卡项上游链路定向测试通过。
- 前端权限/API facade 测试通过，并已覆盖经营利润菜单、权限目录和受保护路由一致性。
- 经营利润前端集合测试通过：7 个文件、35 个测试，覆盖总览、商品/项目毛利、成本配置、履约风险、员工人效、Real API 路径、权限和商品/项目毛利翻页。
- `npm.cmd run check:operation-profit` 发布前静态门禁通过后，可证明必需 migration、脚本入口、路由、菜单、权限、API 导出、12 个 readiness 检查项和交付文档没有缺项。
- 已新增根级一键工程门禁 `npm.cmd run check:operation-profit:full`，串行执行 `check:operation-profit`、经营利润前端集合测试、经营利润 Prisma 脚本 TypeScript 检查、经营利润后端定向测试、前后端构建和 `git diff --check` 空白检查；后端测试使用 Jest `--runInBand`，避免 Windows worker `spawn EPERM` 影响提交前复验。
- 前后端构建已纳入 `check:operation-profit:full`，其中 `check:operation-profit:build` 会同时执行 `npm.cmd --prefix packages/server-v2 run build` 和 `npm.cmd run build`。
- 最新工作区 `npm.cmd run check:operation-profit:full` 已再次通过：静态、前端 7 文件/35 测试、脚本 TypeScript、后端 4 suite/26 测试、前后端构建和 `git diff --check` 均通过；仅有 Windows CRLF warning。
- 浏览器预检：无登录态访问 6 个经营利润 URL 均会正常重定向到 `/login`，登录页 DOM 已渲染；本轮使用 `http://127.0.0.1:5174` 复核时每个路由有 1 条预期 `Unauthorized from loadUserInfo`，来源为未登录态读取用户信息被鉴权拒绝，不是经营利润页面崩溃。完整 6 页操作验收待 readiness 至少 `conditional` 后使用授权账号执行。
- readiness 只读检查可运行；当前目标库 6 条必需 migration 已 applied，仍因历史服务人归属缺口返回 `blocked`。
- readiness 已纳入 6 条发布必需 migration 检查，新增第 6 条为 `20260619131500_operation_profit_query_indexes`，用于 `ProductOrder(storeId, createdAt)` 月度订单查询组合索引。
- readiness 已单独核验关键查询索引 `ProductOrder_storeId_createdAt_idx` 是否实际存在，避免仅凭 migration 记录误判页面性能前置已满足。
- readiness 已纳入 `commission_rule_coverage`，能在缺提成记录时继续判断有效商品/项目提成规则是否覆盖对应明细。
- 成本 seed dry-run 可运行，并会在缺 `OperatingCost` 表时返回 `migration_required`，不会误写成本。
- 毛利抽样复算脚本可运行，最新真实库复验读取到 43 个订单、9 条商品样本和 20 条项目样本；当前 `readySamples=0`、`samplesWithGaps=29`，说明真实样本仍缺提成、服务人归属、项目实耗和项目档案，不能作为业务验收通过证据；脚本会在缺提成记录时输出 `missing_commission_rule`，并会用 `missing_project_master`/`projectMasterGapItems` 区分项目档案缺失和普通 BOM 缺失。
- 已新增迁移前只读脚本烟测记录：`docs/04-测试数据/经营利润迁移前只读脚本烟测记录.md`，覆盖 readiness、audit、cost-seed、assignee-audit、assignee-backfill、backfill、sample-reconcile 的 read-only/dry-run 结果；当前记录证明脚本可运行且阻断合理，但目标库仍处于 `blocked`。
- 已完成目标库真实迁移和部分写库记录：`docs/04-测试数据/经营利润真实迁移与写库执行记录.md`，当前 6 条发布必需 migration 已 applied，`storeId=6`、`2026-06` 经营成本已写入 6 条、总额 55000，已写回 2 条服务人归属并创建 2 条项目提成记录。
- 用户授权真实写库后，已复跑当前可安全执行的提成回填 apply；因剩余 33 条商品/项目明细缺服务人，本次 `createdCommissionRecords=0`，三类 pending 候选写回脚本均按预期拦截未业务确认记录。
- 已新增剩余服务人归属确认材料：`docs/04-测试数据/经营利润剩余服务人归属候选确认清单.md`、`docs/04-测试数据/operation-profit-assignee-candidates.pending.json` 和 `docs/04-测试数据/operation-profit-assignee-manual-review.pending.json`；`operation-profit:assignee-audit` 已直接输出 `candidateDraft` 与 `manualReviewDraft`。当前仍有 33 条商品/项目明细缺服务人，其中 9 条有候选但待业务确认，24 条暂无候选需人工查证并补处理结论；服务人写回脚本已支持直接消费人工查证 JSON 中的 `resolution=assign` 项。
- 已新增美容师账号绑定确认材料：`operation-profit:beautician-user-audit`、`operation-profit:beautician-user-backfill`、`docs/04-测试数据/经营利润美容师账号绑定候选确认清单.md` 和 `docs/04-测试数据/operation-profit-beautician-user-bindings.pending.json`。当前 9 条服务人候选涉及 5 位美容师，其中 3 位缺系统账号绑定，影响 4 条候选后续员工维度提成归集。
- 已新增业务确认包统一预检：`operation-profit:confirmation-audit` 和 `docs/04-测试数据/经营利润业务确认包执行清单.md`，用于在任何 apply 前统一检查服务人候选归属、服务人无候选人工查证、账号绑定、员工账号创建、项目档案修复 JSON 是否已完成业务确认并满足门店、账号、项目、处理结论和日期范围约束；预检支持 `--summaryOnly`，用于快速判断确认包是否过期、是否能进入 dry-run。
- 已新增业务确认包填报和正式 JSON 草稿链路：`operation-profit:confirmation-workbook` 生成业务填报单，`operation-profit:confirmation-template` 生成 5 个 `.draft.json` 正式确认草稿，覆盖服务人候选、无候选服务人、账号绑定、员工账号创建和项目档案处理；当前填报单 39 条确认动作全部仍为 `pending_business_confirmation`，草稿中的 `TODO_REAL_BUSINESS_CONFIRMER`、`TODO_assign_or_historical_exception_or_ignore_non_margin`、`TODO_REQUIRED_IF_ASSIGN` 不会被统一预检误放行。
- 已新增确认后只读 dry-run 编排：`operation-profit:confirmed-dry-run --summaryOnly` 先执行 `operation-profit:confirmation-audit --requireReady`，确认包不通过时输出 `blocked_by_confirmation_gate` 并跳过员工账号创建、账号绑定、服务人归属、项目档案和提成回填 dry-run，避免在业务确认不完整时形成误导性写库计划；当前脚本要求显式传入 4 个核心正式确认 JSON，存在员工账号创建时还必须同步传 `--staffUserFile=<员工账号创建正式确认JSON>`，漏传任一核心文件会直接失败，不再回退 pending 默认文件。
- 收到再次真实写库授权后，已用 5 个确认草稿复跑写库前硬门禁：`confirmationReady=false`、`writeGate.applyAllowed=false`、`blocked_by_business_confirmation`，当前仍有 39 条未确认动作、24 条缺处理结论、4 条缺员工账号主体。授权已具备，但业务确认包未完成前不能执行任何 `--apply --yes`。
- 已新增确认后真实写库手册：`docs/04-测试数据/经营利润业务确认后真实写库手册.md`，要求先通过 `confirmationReady=true`、`writeGate.applyAllowed=true` 和 `status=dry_run_complete`，再按“员工账号创建 -> 账号绑定 -> 服务人候选 -> 无候选服务人 -> 项目档案 -> 提成回填”的顺序执行单项 `--apply --yes --storeId=6`。
- readiness 已支持确认包感知模式：默认保留真实库原始缺口，传入 `--assigneeManualReviewFile=<服务人无候选确认JSON>` 后，可把已确认的历史异常/非毛利项从服务人 fail 和提成 warn 中剔除，并通过 `confirmedExceptionGaps` 留痕。
- 已新增项目 BOM/项目身份缺口确认材料：`operation-profit:bom-audit`、`operation-profit:project-master-backfill`、`docs/04-测试数据/经营利润项目BOM缺口确认清单.md`、`docs/04-测试数据/operation-profit-project-master-candidates.pending.json` 和 `docs/04-测试数据/operation-profit-project-master-historical-exception.example.json`。当前 3 条异常项目明细均指向不存在的项目 ID 101，且同 ID 命中商品“术后舒缓喷雾”；readiness 已将其归为 `project_master_data` warn，项目存在的明细 BOM 为 pass，不能直接补 BOM，需要先确认真实项目身份。确认结果可选择 `repair_project` 写回真实项目，或 `historical_exception` 保留历史异常。
- 项目毛利页面已按后端口径修正耗材成本汇总：优先用实际耗材流水，缺实耗时回退 BOM 标准成本；表格同时展示“实耗金额 / BOM 标准金额”和实际扣减来源，便于页面验收时解释项目毛利为什么采用当前耗材成本。
- 商品/项目毛利页面已补前端分页控件：统一 `pageSize=100`，筛选切换回到第 1 页，汇总卡标明“当前页”口径；组件测试和 `check:operation-profit` 已覆盖翻页参数，以及翻到第 2 页后切换状态筛选必须回到 `page=1`，避免真实门店数据超过 100 条后页面漏看后续商品或筛选误判为空。
- 抽样复算已同步项目档案缺口摘要：`projectMasterGapItems=3`，缺口样本为订单 `POMQ9C1NIU`、`POMQ9BTF20`、`POMQ9BJ8AF` 的明细 1089/1088/1087，均标记 `missing_project_master` + `missing_bom`。
- 提交前差异清单已准备：`docs/03-开发计划/经营利润一级模块提交前差异清单.md`，用于解释经营利润主链路、订单/提成/卡项/终端上游闭环文件，以及 `AGENTS.md` 是否纳入本 PR 的确认点。

---

## 发布前置

本 PR 上线或试点前必须先执行 6 条发布必需 migration：

| 顺序 | Migration |
| --- | --- |
| 1 | `20260619093000_operation_profit` |
| 2 | `20260619110000_commission_rule_user` |
| 3 | `20260619113000_commission_staff_user` |
| 4 | `20260619121500_member_card_operator` |
| 5 | `20260619124500_customer_card_operator` |
| 6 | `20260619131500_operation_profit_query_indexes` |

执行后必须复跑：

```powershell
npm.cmd --prefix packages/server-v2 run operation-profit:readiness -- --storeId=6 --periodMonth=2026-06 --from=2026-06-01 --to=2026-06-30
```

readiness 至少达到 `conditional` 后，才能进入 6 个页面的业务验收。

---

## 已知阻塞

- 当前目标库 6 条发布必需 migration 已 applied，经营成本已录入；readiness 仍为 `blocked`，原因是历史商品/项目订单仍有服务人归属缺口。
- 商品/项目历史订单仍存在 33 条服务人归属缺口和对应提成记录缺口，不能直接作为完整毛利验收。
- 服务人候选中还有 3 位美容师缺系统账号主体；周宁需确认账号绑定，韩雨、许诺需确认员工账号创建或补绑定，否则部分提成无法稳定进入员工人效。
- 项目档案仍有 3 条历史缺口，需要修复历史项目身份或标记历史异常后再解释这 3 条项目毛利。
- 当前毛利抽样复算只能证明脚本能输出公式和缺口，不能证明业务验收通过。
- 页面浏览器逐页验收需要在业务确认包完成、readiness 至少达到 `conditional` 后执行。
- PR 当前建议保持 Draft；只有业务确认包通过、确认后 dry-run 完成、真实写库复验和 6 页登录态业务验收完成后，才能转 Ready。

---

## 关联文档

- `docs/02-产品设计/美容院经营利润看板需求文档.md`
- `docs/03-开发计划/经营利润一级模块详细开发计划.md`
- `docs/03-开发计划/经营利润一级模块下一步详细计划.md`
- `docs/03-开发计划/经营利润一级模块阶段0口径冻结与开发准备.md`
- `docs/03-开发计划/经营利润一级模块提交前差异清单.md`
- `docs/03-开发计划/经营利润一级模块发布迁移与验收清单.md`
- `docs/04-测试数据/经营利润迁移前只读脚本烟测记录.md`
- `docs/04-测试数据/经营利润真实迁移与写库执行记录.md`
- `docs/04-测试数据/经营利润当前验收阻断快照.md`
- `docs/04-测试数据/经营利润页面技术预检记录.md`
- `docs/04-测试数据/经营利润业务确认包执行清单.md`
- `docs/04-测试数据/经营利润业务确认后真实写库手册.md`
- `docs/04-测试数据/经营利润业务确认包填报单.md`
- `docs/04-测试数据/经营利润剩余服务人归属候选确认清单.md`
- `docs/04-测试数据/经营利润美容师账号绑定候选确认清单.md`
- `docs/04-测试数据/经营利润项目BOM缺口确认清单.md`
- `docs/04-测试数据/operation-profit-assignee-candidates.pending.json`
- `docs/04-测试数据/operation-profit-assignee-manual-review.pending.json`
- `docs/04-测试数据/operation-profit-beautician-user-bindings.pending.json`
- `docs/04-测试数据/operation-profit-staff-user-create.pending.json`
- `docs/04-测试数据/operation-profit-confirmation-drafts/operation-profit-assignee-confirmed.draft.json`
- `docs/04-测试数据/operation-profit-confirmation-drafts/operation-profit-assignee-manual-review-confirmed.draft.json`
- `docs/04-测试数据/operation-profit-confirmation-drafts/operation-profit-beautician-user-bindings-confirmed.draft.json`
- `docs/04-测试数据/operation-profit-confirmation-drafts/operation-profit-staff-user-create-confirmed.draft.json`
- `docs/04-测试数据/operation-profit-confirmation-drafts/operation-profit-project-master-confirmed.draft.json`
- `docs/04-测试数据/operation-profit-project-master-candidates.pending.json`
- `docs/04-测试数据/经营利润毛利抽样复算验收记录.md`
