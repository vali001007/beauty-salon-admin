# Ami Ask Coverage R2 P0 商品与项目经营毛利实施计划

- 日期：2026-08-04
- 分支：`codex/ami-ask-business-expansion-20260802`
- 范围：Ami Ask 独立自由 SQL、语义路由、Query Plan、只读权限、Gold 与真实 E2E
- 边界：不引入 Ami Brain Runtime、Ontology、Release、Registry 或评测体系

## 一、产品目标

新增 Ask 专用语义视图 `ask_data_item_margin_view`，将商品销售、项目销售、次卡核销、实际耗材、BOM 标准耗材和退款冲减收敛为同一可审计事件口径。

本能力回答的是“商品/项目贡献毛利”：

```text
贡献毛利 = 已识别净收入 - 可归属商品成本/耗材成本
```

不包含员工提成、租金、水电和其他经营费用，不得表述为已确认月结经营利润。

## 二、已核实的事实基础

共享开发库当前有：

- 商品订单明细 320 条，319 条能匹配非零商品档案成本。
- 商品出库关联 59 条，其中 10 条带流水成本；其余需使用实际出库数量×商品档案成本或直接使用商品档案成本估算。
- 项目订单明细 356 条，353 条有 BOM，49 条存在实际耗材流水。
- 次卡核销 257 条，253 条有 BOM，30 条存在实际耗材流水。
- BOM 81 条，所有 BOM 商品都有档案成本。
- 成功退款 42 笔（当前门店范围），其中仅 2 笔有 `RefundItem`，其余 40 笔只有订单级退款。

因此不能将所有成本标成“实际成本”。每行必须返回成本口径和估算标识。

## 三、语义视图设计

### 3.1 事件粒度

每行是一个可聚合的经济事件：

- `order_sale`：商品或项目订单明细的已识别收入。
- `card_redemption`：次卡核销已确认收入。
- `refund`：成功退款在退款时间形成负收入。

退款有明细时按 `RefundItem` 归属；无明细时按原订单各明细净额占比分摊，并标记 `refund_basis=order_proportional_allocation`。

### 3.2 成本优先级

商品：

1. 出库流水 `costAmount`。
2. 出库数量×流水/Batch/商品档案单位成本。
3. 无出库关联时，销售数量×商品档案成本。

项目：

1. 已记录的实际 `service_consume/service_consumption` 成本。
2. 实际流水未覆盖的 BOM 商品，使用标准用量×商品档案成本补齐。
3. 无实际流水时使用整体 BOM 标准成本估算。
4. 无 BOM 且无实际流水时返回 `cost_missing`，不伪造毛利。

### 3.3 开放字段

- 门店、事件 ID/类型/时间。
- 商品/项目类型、ID、名称、SKU/项目类型。
- 数量、净收入、退款、可归属成本、贡献毛利、贡献毛利率。
- `revenue_basis`、`cost_basis`、`refund_basis`、`is_estimated_cost`、`cost_completeness`。

不开放客户、手机号、订单备注、退款原因原文或内部 JSON。

## 四、Ask 集成

- Catalog 从 36 个扩展到 37 个视图，权限为 `core:operation-profit:view`。
- 新增独立指标合同：商品/项目贡献毛利、项目可归属耗材成本、低于成本销售。
- “项目毛利”不再路由到旧 `agent_v3_project_service_sales_view` 的零耗材估算字段。
- Query Plan 固定使用 `SUM(net_revenue)`、`SUM(attributed_cost)` 和两者派生的贡献毛利/毛利率；商品与项目比较按 `item_type` 分组。
- 低毛利或亏损问题必须显式筛选贡献毛利/毛利率，不使用目录售价代替。
- 回答必须披露“贡献毛利、不含提成和经营费用”，并在存在估算成本时提示成本来源。

## 五、Gold、权限和验收

- 新增 10 道不重复查询合同，覆盖商品、项目、次卡核销、退款冲减、低毛利、亏损、排行、趋势和类型比较。
- Gold 从 450 道查询合同扩展到 460 道；发布 Manifest 为 37×10=370 题。
- 新视图 10/10 实际 SQL，然后完整连续复跑 370 题，不拼接历史结果。
- 更新只读授权为 37/37，保持 0 底表可写、无 Schema CREATE。
- 财务权限角色新增该视图；无 `core:operation-profit:view` 角色不得在目录或候选中看到。
- 共享开发库使用 `development_admin` 验证；生产只读 37/37 仍是独立发布门禁。

## 六、完成标准

1. migration 可在隔离 PostgreSQL 和共享开发库幂等执行。
2. 37 个视图全部有 `store_id`，新视图无敏感字段。
3. 三类新指标语义路由、Query Plan、Guard 和回答口径测试通过。
4. 新能力 10/10 真实 E2E，370/370 发布复跑达到既有门禁。
5. 管理端覆盖审计中对应问题从 `existing_facts_new_view` 转为可直接回答，但替代品建议、定价建议和原因归因仍保持 Brain/事实边界。
6. 优化方案和经营扩容验收记录更新当前口径。

## 七、2026-08-04 实施与验收结果

### 7.1 数据库与能力接入

- 新增 migration：`20260804170000_ask_data_item_margin`。
- 共享开发库预检为 `applied`，migration checksum 匹配，无失败 migration；Ami Brain migration 状态保持不变。
- Catalog 已扩展为 37 个视图；`ask_data_item_margin_view` 具有 `store_id`，未开放客户、手机号、订单备注、退款原文或内部 JSON。
- 开发管理员连接实测 37/37 视图可读，新视图返回真实商品与项目贡献毛利数据。

### 7.2 Gold、语义与真实 E2E

- Gold：460 道查询合同 + 584 道边界合同，37/37 视图均不少于 10 道。
- Gold checksum：`c9ddb6309d38f1fb00f728dd63e949fe4dc7e44682d45134e149270bb573cefa`。
- Source contract checksum：`aac9765b519655b257e5f6059062b9bc7ec877111fbf490910f2b799c29b8eb0`。
- 发布 Manifest checksum：`2507e35e2ef0267d7c27a3b960a5de3d0a940d965a915ac771b759cb586d97c7`。
- 离线语义与 Query Plan：460/460；已知歧义 136/136；无理由澄清率 0；语义路由 P95 0.975ms。
- 新能力 10/10 严格通过。370 题同一 Manifest 连续真实 E2E 为 370/370，Provider、SQL Ready、Guard、数据库执行、Gold Plan 和最终回答均为 100%。
- 稳定性恢复版的平均 / P50 / P95 为 12.214s / 9.263s / 31.080s。准确率门禁已通过，但 P95 暂未达到 22s 性能门禁；该运行时同机还有 Ami Brain 发布评测共享同一模型网关，原始结果保留，另行进行无并发干扰的完整性能复测。

### 7.3 权限、管理端与产品口径

- 7/7 真实角色权限矩阵通过；管理员目录 37，财务目录 9，跨店伪造 HTTP 403，查询与拒绝审计 12/12。
- 管理端页面显示“覆盖目录 · 37 项”。真实问题“本月商品和项目谁的贡献毛利更高”返回：项目 656.82 元，商品 130 元。
- 页面明确披露：贡献毛利不含员工提成、房租、水电等经营费用，不等于已确认月结利润；成本使用商品档案或 BOM 标准成本时必须披露估算性。
- 管理员可展开脱敏 SQL 和语义路由摘要；客户服务角色仅看到 3 项客户目录，授权查询成功，不展示 SQL 或内部路由信息。
- 最新管理端事实审计为直接可回答 96/234，安全可开放上限 135/234，边界或事实不完整 99/234。

### 7.4 自动验证与未完成边界

- Ask/只读内核：20 suites / 532 tests；配置合同 5/5；API 合同 6/6；权限合同 4/4；Gold 治理 28/28；前端 Ask 11/11。
- Ask 专项 typecheck、后端 build、前端 typecheck/build 和 `git diff --check` 均通过。
- 当前证据使用 `development_admin`。本地尚未配置专用只读 URL 和密码，生产 37/37 可读、0 底表可写、无 Schema CREATE 以及 strict readiness/live eval 仍未完成。
- Holdout v4 独立人工签署仍为 `pending`。
