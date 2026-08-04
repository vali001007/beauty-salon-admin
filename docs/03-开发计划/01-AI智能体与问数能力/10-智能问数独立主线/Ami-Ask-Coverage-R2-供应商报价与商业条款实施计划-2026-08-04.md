# Ami Ask Coverage R2：供应商报价与商业条款实施计划

- 日期：2026-08-04
- 分支：`codex/ami-ask-business-expansion-20260802`
- 目标：新增门店级、只读、已审批的供应商报价与商业条款语义视图，安全回答报价、MOQ、账期、交期和同商品供应商价格比较
- 产品边界：只回答已审批报价事实，不开放供应商联系方式、资质文件、审核人、驳回原因或采购建议；不把“低价”等同于“性价比最好”

## 一、优先级校正

原优化方案将商品/项目毛利、折扣退款列为 P0，将供应商条款列为 P1。当前真实数据核验后，不应机械按标签开工：

- 门店 6 有 670 笔订单、715 条订单明细、46 个商品成本、20 个项目 BOM，毛利数据基础存在。
- 但 42 笔成功退款中只有 2 笔存在 `RefundItem` 明细，无法将绝大多数退款准确冲减到商品或项目；服务耗材流水只有部分记录带成本金额。若现在宣称“实际商品/项目毛利”，会把估算分摊冒充真实成本。
- 折扣退款有 137 笔折扣订单和 42 笔成功退款，但退款操作人只有 1 笔，员工退款率和授权治理事实不完整。
- 供应商报价有 25 条 `active + approved` 数据，全部映射到门店 6 的商品，覆盖 3 个供应商、25 个 SKU；4 个商品存在多供应商报价，可真实比较价格。

因此本轮先建设“供应商报价与商业条款”这一数据完备能力簇。商品/项目毛利和折扣退款继续保留为高优先级，但必须先完成退款分摊与成本来源治理，不能为了遵守形式优先级牺牲准确率。

## 二、可回答与不可回答边界

### 2.1 当前可以安全回答

1. 每个供应商最近一次已审批报价。
2. 指定商品在不同供应商之间的当前报价比较。
3. 各商品或品类的最低采购量要求。
4. 供应商账期和结算方式。
5. 已审批报价的含税状态、预计交付天数和库存状态。
6. 同一门店商品是否存在更低的已审批供应商报价。
7. 当前门店首选供应商映射及报价差额。

### 2.2 必须澄清或拒绝扩大结论

- “哪个供应商性价比最好”：必须说明比较标准是价格、交期还是二者组合；当前没有质量评分，禁止把最低价表述为性价比最好。
- “原材料价格有没有上涨趋势”：同 SKU 当前只有单次报价，不能用不同供应商横截面冒充时间趋势；没有至少两个时间点时回答“缺少历史报价序列”。
- “应该换哪个供应商”：属于采购建议，Ask 只列出同商品报价和差额，由用户或 Ami Brain 在受控流程中决策。
- 供应商资质是否可靠、合同风险、退换货条款：当前结构化事实不足或涉及资质文件，不进入本视图。

## 三、语义视图设计

新增 `ask_data_supplier_quote_terms_view`，每门店、每商品、每个已审批报价一行。

### 3.1 门店与商品身份

- `store_id`、`store_name`
- `product_id`、`product_name`、`product_sku`、`category_name`、`product_unit`
- `supply_sku_id`、`supply_sku_name`、`brand`、`spec`、`supply_unit`

### 3.2 供应商与报价

- `supplier_id`、`supplier_name`
- `quote_id`、`quote_price`、`tax_included`
- `minimum_order_quantity`、`lead_days`
- `stock_status`、`available_stock`
- `valid_from`、`valid_to`、`quote_created_at`、`quote_updated_at`
- `is_current_valid`

### 3.3 商业条款与门店映射

- `settlement_mode`、`payment_terms`
- `is_preferred_supplier`
- `alternative_supplier_count`
- `lowest_current_quote_price`
- `price_difference_from_lowest`
- `price_premium_rate`
- `current_price_rank`

只读取：

- `SupplyCatalogMapping.mappingStatus = 'active'`
- `SupplyQuote.status = 'active'`
- `SupplyQuote.auditStatus = 'approved'`
- 未软删除的供应商、SKU 和报价

门店范围由 `SupplyCatalogMapping.storeId` 注入；不得用报价的空 `storeScope` 推断全店可见。

## 四、权限、Catalog 与语义合同

- 权限：`core:supply:view`。
- Catalog 从 35 扩展为 36 项。
- 新增指标合同：
  - `supplier_latest_quote`
  - `supplier_price_comparison`
  - `supplier_minimum_order_quantity`
  - `supplier_payment_terms`
  - `supplier_lead_time`
- “供应商采购金额/采购次数/平均实际交付天数”继续路由 `agent_v3_supplier_performance_view`。
- “采购单/采购明细”继续路由 `agent_v3_purchase_procurement_view`。
- “报价/账期/MOQ/当前交期”才路由新视图，避免三个供应商领域视图互抢。

SQL Prompt 固定披露：报价是已审批供应链报价，不等于最终成交采购价；最低价不代表质量或综合性价比最好。

## 五、Gold 与发布证据

1. 新增至少 10 道唯一 Gold，覆盖最新报价、价格比较、MOQ、账期、交期、首选映射和更低报价差额。
2. Coverage R2 从 35×10 扩展为 36×10，共 360 道新 Manifest。
3. 严格 Route/Plan 合同禁止夹带供应商采购表现或采购明细指标。
4. 新视图 10 道真实 SQL 必须全部执行；无历史序列和性价比歧义作为边界题单独验证。
5. 360 题连续、不拼接真实 E2E 需达到：Provider ≥99.5%、数据库执行 ≥99%、最终回答正确率 ≥99%、P95 ≤22 秒。

## 六、迁移、回滚与验证

- 新增 Prisma migration，只创建视图，不改底表、不回填数据。
- 更新只读授权模板和隔离 migration 验收目标为 36 个视图。
- 开发环境使用 `development_admin` 验证真实功能，并明确标注不等于生产最小权限。
- 生产专用只读需重新完成 36/36 可读、0 底表可写、无 Schema CREATE 和 strict 三项门禁。
- 功能回滚：关闭 `ASK_DATA_FREE_SQL_ENABLED`；若仅撤回该能力，先从 Catalog 和语义合同移除，数据库视图保留，不执行破坏性 DROP。

## 七、完成标准

- migration、Catalog 36 项、权限、字段策略、语义合同、Query Plan 和 Prompt 全部完成。
- 10 道新视图真实 SQL、360 题连续真实 E2E、7 角色权限矩阵、跨店 403、审计、两级回滚通过。
- 浏览器显示“覆盖目录 · 36 项”，供应链角色可见新目录，未授权角色不可见。
- 页面回答明确区分报价、实际采购价、最低价和综合性价比。
- 不支持的价格趋势、质量评价、供应商建议和资质判断不被误判为已支持。
- 未完成独立人工签署和生产只读验收前，不宣称完整 Coverage R2 或生产可用。

## 八、2026-08-04 实施与最终技术验收

本节记录实际开发结果，并替代前文的“待实施”状态；生产与独立人工门禁仍按前文保留。

### 8.1 实施结果

- 新增 `ask_data_supplier_quote_terms_view`，只读取门店映射下 `active + approved` 的报价与商业条款。
- 增加价格排名修正 migration，使同商品报价排名、最低已审批价和价差使用同一当前有效集合。
- Catalog 为 36 项，库存供应角色可见 9 项，新能力仍使用 `core:supply:view`。
- 语义合同、Query Plan、SQL Prompt、字段白名单、只读授权模板、隔离 migration 验收和 Gold 治理已同步到 36 视图。
- 回答固定披露“已审批供应链报价不等于最终采购成交价”；“最低价”不外推为质量或综合性价比。

### 8.2 36 视图 Gold 与连续真实 E2E

最终连续、不拼接原始结果：

`docs/04-测试数据/Ami-Ask统一Gold题库-v4-Coverage-R2-反馈名单轻量化/Ami-Ask统一Gold发布级360题连续真实E2E-Provider熔断恢复与供应商回答披露最终版-2026-08-04.json`

| 指标 | 结果 |
|---|---:|
| Gold checksum | `0408329b6020537b3d5145d057d250d3a6987474fcea41b6de5f2d34d10b312e` |
| Source contract checksum | `9c29dacad0a3400079acbdefdcc0551fa4c00e81cd3016342e76cd8d573a2c52` |
| Manifest checksum | `c8ad3f376b236f38898045f104ea4b6a6c802bd30e5b4949576ccf3e7f217cd2` |
| 视图 / 题目 | 36 / 360 |
| 完成 / 严格通过 | 360 / 360 |
| Provider / SQL Ready | 100% / 100% |
| Guard / 数据库执行 | 100% / 100% |
| Gold Plan / 最终回答正确 | 100% / 100% |
| 平均 / P50 / P95 | 8.494s / 6.960s / 18.979s |
| 无数据率 | 30.28% |
| 连接边界 | `development_admin` |

新视图 10 道发布题全部通过，平均 8.621 秒，无数据率为 0。这证明当前开发库的报价、MOQ、账期、交期、首选映射和同商品价差链路可真实执行。

此前完整运行曾有两题在 SQL 生成前因 Provider 尾部预算与熔断恢复不足失败。修复后，`manager-004` 和 `BQ0128` 均在同一最终 360 题运行中通过，分别使用 `gpt-5.6-sol` fallback 完成；最终 Provider 可用率恢复为 100%。主备模型仍位于同一网关，不表述为网关级独立灾备。

### 8.3 权限、浏览器和回滚

- 7/7 真实角色通过；管理员/财务/营销/库存供应/店务排班/客户服务/仅看板目录分别为 36/8/5/9/5/3/0。
- 跨店伪造为 HTTP 403，审计 12/12 落库，管理员可见脱敏 SQL，普通角色隐藏。
- 浏览器显示“覆盖目录 · 36 项”；供应商降本问题返回 9 条当前有效报价，玻尿酸保湿精华的已审批报价包含 12 和 168，最低价 12，价差 156。
- 页面和回答同时披露：已审批报价不等于最终采购成交价；最低价不代表质量或综合性价比；结果不构成更换供应商建议。
- 关闭语义路由后旧选择器接管；关闭自由 SQL 后固定模板接管，两级回滚均通过。

### 8.4 产品结论

供应商报价与商业条款能力已完成开发环境技术验收。当前仍不能宣称生产可用：生产专用只读连接尚未完成 36/36 可读、0 底表可写、无 Schema CREATE 与 strict 三项门禁；Holdout v4 的独立人工签署仍为 `pending`。
