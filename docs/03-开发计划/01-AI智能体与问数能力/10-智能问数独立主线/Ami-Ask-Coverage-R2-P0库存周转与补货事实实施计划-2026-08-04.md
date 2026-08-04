# Ami Ask Coverage R2 P0：库存周转与补货事实实施计划

- 日期：2026-08-04
- 分支：`codex/ami-ask-business-expansion-20260802`
- 目标：在现有 34 视图开发基线之外新增 `ask_data_inventory_turnover_view`，开放可被后台事实证明的库存周转、库存可用天数、积压、需求变化和未到货采购事实
- 产品边界：只提供事实和明确口径，不生成补货建议，不把 Ami Brain 的预测/建议能力并入 Ask

## 一、第一性原理校正

“库存周转与补货事实”不是一个单一指标。用户实际需要回答四类问题：

1. 当前还有多少库存，按历史速度还能用多久。
2. 哪些商品消耗慢、库存积压或长期没有动销。
3. 哪些商品近期需求增加、低于安全库存且没有在途采购。
4. 采购和批次是否能缓解短缺或产生临期积压。

当前后台事实足以支持前三类的大部分查询，但不能支持以下结论：

- 没有批次“开封时间”，不能回答“开封后很久没用完”。
- 没有经过治理的项目可服务次数口径，不能直接回答“仪器耗材还能做多少次”。
- 仅凭单个耗材低库存不能断言某项目“完全不能做”；需要 BOM 全量可用性和项目服务规则。
- “补货多少、何时补、优先补什么”属于建议，需要目标库存、采购周期、最小采购量和风险偏好，继续由 Ami Brain 或受控采购流程承接。

因此，本阶段新增的是“补货事实依据”，不是“自动补货建议”。

## 二、当前开发数据核验

门店 6 的只读核验结果：

| 事实 | 当前数据 |
|---|---:|
| 商品 | 46 |
| 批次 | 82 |
| 库存流水 | 560 |
| 采购单 | 5 个状态实例，其中 3 已收货、2 待供应商确认 |
| 90 天有出库商品 | 36 |
| 90 天出库量 | 2348.95 |
| 流水含 before/after 库存 | 560/560 |
| 正库存批次 | 71 |
| 有效期批次 | 57 |
| 待到货采购量 | 32 |

数据质量边界：

- `StockBatch.unitCost` 当前全部为空，成本事实使用 `Product.costPrice`，必须标记为商品档案成本，不冒充批次实际采购成本。
- 只有 213/560 流水关联批次，周转事实按商品汇总，不按批次计算标准周转率。
- 标准财务库存周转率需要销售成本和时间加权平均库存。本阶段开放“运营周转指标”，不标为会计库存周转率。

## 三、视图口径

新增 `ask_data_inventory_turnover_view`，每门店、每商品一行。

### 3.1 身份与当前快照

- `store_id`、`store_name`
- `product_id`、`product_name`、`sku`、`category_name`、`unit`
- `current_stock`、`safety_stock`
- `catalog_cost_price`、`current_stock_value`
- `nearest_expiry_date`、`positive_batch_count`

### 3.2 历史消耗与需求变化

- `outbound_quantity_30d`：最近 30 天所有负库存流水绝对值，不包含入库和正向调整。
- `outbound_quantity_previous_30d`：前一个 30 天窗口的负库存流水绝对值。
- `outbound_quantity_90d`：最近 90 天负库存流水绝对值。
- `avg_daily_outbound_30d`：30 天出库量 ÷ 30。
- `avg_daily_outbound_90d`：90 天出库量 ÷ 90。
- `demand_change_rate_30d`：最近 30 天与前 30 天出库量之差 ÷ 前 30 天出库量；分母为 0 时返回空值。
- `last_outbound_at`、`last_inbound_at`。

### 3.3 运营周转与库存覆盖

- `days_of_stock_30d`：当前库存 ÷ 最近 30 天日均出库；无消耗时返回空值，不返回 0。
- `event_weighted_avg_stock_30d`：最近 30 天库存事件的 `(before_stock + after_stock) / 2` 平均值。
- `operational_turnover_ratio_30d`：最近 30 天出库量 ÷ 事件加权平均库存；无有效平均库存时返回空值。
- `slow_moving_status`：
  - `no_outbound_90d`：当前有库存且 90 天无出库；
  - `low_turnover`：运营周转率低于治理阈值且当前有库存；
  - `normal`：其他情况。

回答必须披露：该周转率是库存事件加权的运营指标，不等同于财务会计库存周转率。

### 3.4 采购覆盖事实

- `open_procurement_quantity`：未完成采购明细的 `quantity - received_qty`，小于 0 时按 0。
- `open_procurement_order_count`。
- `expected_arrival_date`：未完成采购中的最近预计到货日。
- `replenishment_fact_status`：
  - `below_safety_no_open_procurement`
  - `below_safety_with_open_procurement`
  - `covered`

该状态只说明事实，不输出采购建议量。

## 四、15 道候选题的产品边界

### 4.1 本视图可支持

1. `manager-065`：有什么产品积压太久了。
2. `manager-071`：有没有产品快断货但还没采购的。
3. `manager-079`：库存的周转率怎么样。
4. `inventory-010`：有没有产品一直有但从来不用的。
5. `inventory-014`：服务用的一次性耗材还够用多久。
6. `inventory-018`：有没有产品一直在消耗但一直没有采购。
7. `inventory-020`：哪些产品的周转率最低。
8. `inventory-021`：帮我统计一下这季度每个产品的用量。
9. `inventory-022`：有没有最近需求突然增加的产品。
10. `inventory-035`：进货太多导致积压的产品有哪些。
11. `inventory-081`：我们每天大概消耗多少清洁类耗材。
12. `inventory-085`：这个月每日平均耗材费用是多少；成本必须标记为档案成本估算。

### 4.2 本阶段不得宣称支持

1. `manager-068`：有没有哪个项目因为缺耗材没法做——需要项目级 BOM 完整性和可服务次数口径。
2. `inventory-023`：理疗仪器耗材还够用多少次——需要项目/BOM 实体和标准单次用量。
3. `inventory-036`：产品开了之后很长时间还没用完——后台没有开封时间。
4. “生成补货建议/清单”——属于建议或写操作，不进入 Ask 自由 SQL。

上述问题继续标记为新视图/后台事实或 Brain 边界，不为提升覆盖率修改为假支持。

## 五、实施范围

1. 新增 Prisma migration，创建 `ask_data_inventory_turnover_view`。
2. Catalog 从 34 扩展为 35，新增字段策略、数据口径、权限和关键词。
3. 新增独立指标合同：库存可用天数、运营周转率、慢动销、需求变化、采购覆盖。
4. Query Plan 增加对应结果字段、排序、阈值和空值规则。
5. 只读角色授权模板增加新视图；生产仍需重新完成 35/35 最小权限验收。
6. 新增至少 10 道唯一 Gold，历史 34×10 和 Holdout v4 冻结结果不覆盖。
7. 新的 Coverage R2 发布集按 35×10 生成 350 题 Manifest，不能把历史 340/340 直接外推为 35 视图通过。
8. 更新权限矩阵管理员目录为 35；库存供应角色目录增加该视图，其他角色保持最小授权。
9. 浏览器验证周转口径、空值、估算成本提示和“无采购覆盖”状态。

## 六、迁移与回滚

- migration 只新增视图，不修改底表、不回填数据。
- 开发共享库通过 `prisma migrate deploy` 应用后验证视图存在、字段无敏感信息、所有行有 `store_id`。
- 功能回滚继续使用 `ASK_DATA_FREE_SQL_ENABLED=false`。
- 如仅需撤回 Coverage R2，可先从 Catalog 和语义合同移除该视图；数据库视图和授权保留，不执行破坏性 DROP。

## 七、验收标准

- migration 在隔离 PostgreSQL 完整执行。
- Catalog 35 项；新视图只对 `core:inventory:stock` 授权用户可见。
- 新视图至少 10 道唯一 Gold，真实 SQL 10/10。
- Coverage R2 350 题连续 E2E 达到最终回答正确率 ≥99%、Provider ≥99.5%、Gold 全链路 P95 ≤22 秒。
- 新库存周转题的 SQL、Guard、数据库和回答正确率分别报告。
- 周转率明确标记为运营口径；档案成本明确标记为估算，不冒充实际批次成本。
- “开封时长、项目完全不可做、自动补货建议”不得被错误路由为已支持事实。
- 权限、跨店、敏感字段、只读和两级回滚严重回归为 0。
- 生产专用只读重新完成 35/35 可读、0 底表可写、无 Schema CREATE 后，才能宣称该视图生产可用。

## 八、2026-08-04 实施结果

### 8.1 代码与数据能力

- 新增 migration：`packages/server-v2/prisma/migrations/20260804090000_ask_data_inventory_turnover/`。
- 新增 `ask_data_inventory_turnover_view`，Catalog 从 34 项扩展为 35 项。
- 新视图使用 `core:inventory:stock`；库存供应角色目录由 7 项扩展为 8 项，其他普通角色权限未扩大。
- 已接入库存可用天数、运营周转率、慢动销、需求变化和采购覆盖指标合同及 Query Plan。
- 只读授权模板、隔离 migration 校验、Catalog/权限/Guard/敏感字段测试已同步更新。
- 产品口径保持不变：周转率为库存事件加权运营指标，成本为商品档案成本估算，不输出自动补货建议。

### 8.2 Gold 与严格合同

Coverage R2 重新生成 Gold 和发布 Manifest，没有复用 340 题结论外推第 35 个视图：

| 证据 | 结果 |
|---|---|
| Gold checksum | `ca04d88919500dedacf4304d2159c7bfd5ecba31d8ac4b3c354f0d8e36ae16c3` |
| Source contract checksum | `72af5571e07ea7e3d005cd1f0e88464137d0bf3a9f26df64d934bc98cab9ff30` |
| Manifest checksum | `485f72a1df3b0f1be797153259f807a5c0b86f7bec7f5ee83ffb6aa33cdc4869` |
| 视图 / 发布题 | 35 / 350，每视图至少 10 题 |
| 离线语义评测 | 439/439，Route/Plan 精确合同匹配 100%，P95 0.800ms |
| 已知歧义 | 135/135，澄清保留率和槽位准确率 100% |

新增 `ask-data-gold-plan-match.ts` 后，Gold 不再只检查“包含预期指标/视图”，还会拒绝合同外语义指标、候选视图、Plan 指标和 Plan 视图。SQL 最终选择视图必须包含全部 `requiredViews`，且不得超出 `acceptableViews`。

同时修复 `BQ0058`、`BQ0068`、`BQ0078` 三个遗漏合同：这三题与 `BQ0048` 一样，必须同时使用客户储值余额与次卡资产两个视图，不能只用相邻单视图冒充完整回答。

### 8.3 连续真实 E2E

正式结果：

`docs/04-测试数据/Ami-Ask统一Gold题库-v2-Coverage-R2/Ami-Ask统一Gold发布级350题真实E2E-Coverage-R2-最终语义精确过滤后-2026-08-04.json`

| 指标 | 结果 |
|---|---:|
| 计划 / 完成 / 严格通过 | 350 / 350 / 350 |
| Provider / SQL Ready | 100% / 100% |
| Guard / 数据库执行 | 100% / 100% |
| Gold Plan | 100% |
| 回答 grounded / complete / correct | 100% / 100% / 100% |
| 合同外语义指标 / 选择视图 | 0 / 0 |
| 缺失必需视图 | 0 |
| 平均 / P50 / P95 | 8.898s / 7.263s / 19.685s |
| 无数据率 | 31.14% |
| 总运行时间 | 1,045.390s |
| 数据连接 | `development_admin` |

两个重点样本：

- `SUP-PROMO-002` 在同一完整运行中通过，耗时 16.277 秒，只选择 `promotion_offer` 指标和 `agent_v3_promotion_offer_view`，证明营销归因等相邻指标已被精确过滤。
- `BQ0128` 在同一完整运行中通过，但耗时 42.468 秒，经历 3 次 SQL 生成尝试，包含一次 Provider 不可用和一次 Guard 修复。总体 P95 达标不掩盖该单题长尾风险。

### 8.4 自动与权限验收

- Ask/只读内核 Jest：19 suites / 463 tests。
- 配置 5/5、API 合同 6/6、权限合同 3/3、Holdout 冻结/裁定 4/4、Gold 治理 19/19。
- 前端 Ask 11/11，后端 Ask typecheck/build、前端 typecheck/build 和 `git diff --check` 通过。
- 最新后端进程：`http://127.0.0.1:8084/api`，健康检查通过；为隔离 Ask 验收，使用 `BRAIN_RELEASE_PILOT_MODE=true` 跳过无关 Brain warmup。
- 真实权限矩阵 7/7：管理员 35 项，库存供应 8 项；跨店伪造 HTTP 403；查询与拒绝审计 12/12；管理员可见脱敏 SQL，普通角色不可见。

## 九、当前验收判定

已完成：代码、migration、35 项 Catalog、权限、语义合同、Query Plan、Gold、350 题连续真实 E2E、最新进程权限矩阵、跨店和审计。

尚未完成：

- 最新 35 项页面需要有登录态后补录浏览器证据，重点验证“覆盖目录 · 35 项”和 `no_outbound_90d` 的精确页面口径；历史 34 项页面报告不能替代该证据。
- Holdout v4 独立人工签署仍为 `pending`。
- 生产专用只读角色的 35/35 可读、0 底表可写、无 Schema CREATE，以及 `role-preflight:strict`、`readiness:strict`、`live-eval:strict` 尚未完成。
- 其余 Coverage R2 能力簇尚未实施，不能用本次 350/350 外推商品/项目毛利、折扣退款、供应商条款、客户级营销响应、员工效率或客户/预约联合快照。

产品结论：库存周转与补货事实已完成开发环境后端技术验收，但尚不能表述为完整 Coverage R2 完成或生产可用。
