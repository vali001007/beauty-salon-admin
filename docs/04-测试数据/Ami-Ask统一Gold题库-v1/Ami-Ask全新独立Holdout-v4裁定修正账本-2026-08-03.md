# Ami Ask 全新独立 Holdout v4 裁定修正账本

- 冻结合同 checksum：`9e978450a214ae62b8b715be3e71f1835b0b14279bc0847be0fba310450b4b5f`
- 首次未见结果 checksum：`ae38af897383893e3cdf95f9bb6784cf4e21da482e2e9861de52f5b6485eee4c`
- 裁定账本 checksum：`62da14891c3dce719e8216a78cb381f3f1df7480c4fcb1c1089f9d2fceb3d98b`
- 裁定后合同 checksum：`19d96ed4bdb00a0d58a9edc6826f7114fc470582c90e6d4e29366c8504ddff35`
- 不修改冻结合同，不覆盖首次未见结果；裁定只以只追加账本应用。
- Codex 产品与技术裁定已完成；独立人工签字仍为 pending。

## 裁定明细

| 序号 | 合同 | 类型 | 原因 |
|---|---|---|---|
| V4-ADJ-V4-B008 | `ask_holdout_v4:V4-B008` | boundary_not_clarification | 该问题是内容生成边界，应分流 Ami Brain，不应被 Ask 误认为指标比较澄清。 |
| V4-ADJ-V4-B014 | `ask_holdout_v4:V4-B014` | readonly_operation_boundary | 该问题是资金审批写操作，Ask 应直接拒绝或分流受控业务流程，不应先追问对象。 |
| V4-ADJ-V4-C006 | `ask_holdout_v4:V4-C006` | relative_year_is_resolved | “今年中秋”已明确相对年份，不应再追问四位年份。 |
| V4-ADJ-V4-C046 | `ask_holdout_v4:V4-C046` | governed_bom_threshold | BOM 偏差异常已有绝对偏差超过 20% 的治理阈值，只需补充项目身份。 |
| V4-ADJ-V4-Q001 | `ask_holdout_v4:V4-Q001` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
| V4-ADJ-V4-Q002 | `ask_holdout_v4:V4-Q002` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
| V4-ADJ-V4-Q003 | `ask_holdout_v4:V4-Q003` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
| V4-ADJ-V4-Q004 | `ask_holdout_v4:V4-Q004` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
| V4-ADJ-V4-Q005 | `ask_holdout_v4:V4-Q005` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
| V4-ADJ-V4-Q006 | `ask_holdout_v4:V4-Q006` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
| V4-ADJ-V4-Q009 | `ask_holdout_v4:V4-Q009` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
| V4-ADJ-V4-Q010 | `ask_holdout_v4:V4-Q010` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
| V4-ADJ-V4-Q013 | `ask_holdout_v4:V4-Q013` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
| V4-ADJ-V4-Q014 | `ask_holdout_v4:V4-Q014` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
| V4-ADJ-V4-Q016 | `ask_holdout_v4:V4-Q016` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
| V4-ADJ-V4-Q019 | `ask_holdout_v4:V4-Q019` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
| V4-ADJ-V4-Q022 | `ask_holdout_v4:V4-Q022` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
| V4-ADJ-V4-Q024 | `ask_holdout_v4:V4-Q024` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
| V4-ADJ-V4-Q026 | `ask_holdout_v4:V4-Q026` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
| V4-ADJ-V4-Q029 | `ask_holdout_v4:V4-Q029` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
| V4-ADJ-V4-Q030 | `ask_holdout_v4:V4-Q030` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
| V4-ADJ-V4-Q034 | `ask_holdout_v4:V4-Q034` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
| V4-ADJ-V4-Q035 | `ask_holdout_v4:V4-Q035` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
| V4-ADJ-V4-Q036 | `ask_holdout_v4:V4-Q036` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
| V4-ADJ-V4-Q038 | `ask_holdout_v4:V4-Q038` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
| V4-ADJ-V4-Q040 | `ask_holdout_v4:V4-Q040` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
| V4-ADJ-V4-Q045 | `ask_holdout_v4:V4-Q045` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
| V4-ADJ-V4-Q046 | `ask_holdout_v4:V4-Q046` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
| V4-ADJ-V4-Q048 | `ask_holdout_v4:V4-Q048` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
| V4-ADJ-V4-Q051 | `ask_holdout_v4:V4-Q051` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
| V4-ADJ-V4-Q054 | `ask_holdout_v4:V4-Q054` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
| V4-ADJ-V4-Q055 | `ask_holdout_v4:V4-Q055` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
| V4-ADJ-V4-Q057 | `ask_holdout_v4:V4-Q057` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
| V4-ADJ-V4-Q060 | `ask_holdout_v4:V4-Q060` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
| V4-ADJ-V4-Q062 | `ask_holdout_v4:V4-Q062` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
| V4-ADJ-V4-Q064 | `ask_holdout_v4:V4-Q064` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
| V4-ADJ-V4-Q065 | `ask_holdout_v4:V4-Q065` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
| V4-ADJ-V4-Q066 | `ask_holdout_v4:V4-Q066` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
| V4-ADJ-V4-Q068 | `ask_holdout_v4:V4-Q068` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
| V4-ADJ-V4-Q069 | `ask_holdout_v4:V4-Q069` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
| V4-ADJ-V4-Q070 | `ask_holdout_v4:V4-Q070` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
| V4-ADJ-V4-Q071 | `ask_holdout_v4:V4-Q071` | semantic_output_contract+governed_composite_metric | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。；“用了多少，还剩多少”是已治理的库存用量与结存复合指标，不应裂成两个基础指标。 |
| V4-ADJ-V4-Q073 | `ask_holdout_v4:V4-Q073` | single_view_fact_completeness | 客户档案摘要视图已同时提供未到店天数、价值档位和流失风险，强制关联生命周期视图会增加不必要的复杂度。 |
| V4-ADJ-V4-Q074 | `ask_holdout_v4:V4-Q074` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
| V4-ADJ-V4-Q076 | `ask_holdout_v4:V4-Q076` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
| V4-ADJ-V4-Q078 | `ask_holdout_v4:V4-Q078` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
| V4-ADJ-V4-Q079 | `ask_holdout_v4:V4-Q079` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
| V4-ADJ-V4-Q080 | `ask_holdout_v4:V4-Q080` | semantic_output_contract | 冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。 |
