# 美业行业数据平台 MVP 需求文档

版本：v1.0
日期：2026-06-20
产品暂定名：Ami Industry Data Platform
关联文档：

- `docs/02-产品设计/美容行业数据库与知识库建设方案.md`
- `docs/02-产品设计/美业行业数据与供应链平台需求文档.md`
- `docs/02-产品设计/美业行业数据与供应链平台MVP方案.md`
- `docs/02-产品设计/行业数据平台与供应链平台拆分对比方案.md`

## 1. 最新结论

首期优先建设 **美业行业数据平台**，暂不把供应链平台纳入 MVP。

MVP 的目标不是先做供应商、报价、采购履约，而是先沉淀一套能被 Ami_Core 管理端直接调用的行业标准配置资产，包括：

1. 成熟服务项目模板。
2. 项目标准 BOM。
3. 标准商品/耗品模板。
4. 岗位与薪酬参考模板。
5. 服务 SOP、禁忌、卫生安全知识库。
6. 行业参考价、参考成本、参考时长、参考毛利口径。
7. 预留未来供应链平台对接接口。

模板数量不以“固定录入多少个”为验收标准。首版应基于市场上成熟、常见、可经营、可标准化的美业项目、商品、耗品、岗位来建立一套可用模板库。验收重点是覆盖主流经营场景，并且模板能被 Ami_Core 直接采用生成项目、商品、BOM 和配置参考。

## 2. 产品定位

### 2.1 一句话定位

Ami Industry Data Platform 是 Ami 产品体系的行业配置底座，为 Ami_Core 提供可调用、可审核、可版本化的美业项目、BOM、商品耗品、薪酬、SOP 和知识数据。

### 2.2 与供应链平台的关系

| 平台 | MVP 是否建设 | 说明 |
| --- | --- | --- |
| 行业数据平台 | 是 | 首期建设，提供行业模板、项目 BOM、标准商品/耗品、知识库 |
| 供应链平台 | 否 | 首期不建设供应商、SKU、报价、采购、履约；仅预留接口和映射字段 |
| Ami_Core | 是，作为接入方 | 从行业数据平台采用模板，并落地为门店自己的项目、商品、BOM、岗位配置 |

行业数据平台回答：

```text
这个美业项目标准上应该怎么配置？
需要哪些耗品？
大概服务多久？
参考价格和成本区间是什么？
适合什么人群？
有哪些服务步骤和注意事项？
```

未来供应链平台回答：

```text
这些标准耗品现在从哪个供应商买？
多少钱？
是否有货？
多久发货？
采购单状态是什么？
```

## 3. MVP 建设目标

### 3.1 业务目标

1. 降低 Ami_Core 新门店初始化成本，让店长不再从空白表单开始配置项目和商品。
2. 让项目配置天然带有 BOM、标准耗材成本、服务时长、SOP 和注意事项。
3. 为经营利润、库存扣耗、终端服务建议、AI 推荐提供可信的行业数据基础。
4. 为未来供应链平台打好标准品和 BOM 映射基础。

### 3.2 产品目标

1. 行业数据平台可独立维护模板、审核、发布、版本管理。
2. Ami_Core 可通过 API 查询并采用行业模板。
3. 采用后，Ami_Core 保存门店自己的项目、商品和 BOM 快照。
4. 行业模板后续更新不自动覆盖门店配置，需由门店或总部确认升级。
5. 平台内所有行业数据都需要记录来源、审核状态、版本和适用范围。

## 4. MVP 不做什么

| 暂不做 | 原因 |
| --- | --- |
| 供应商管理 | 属于未来供应链平台 |
| 供应链 SKU 管理 | 首期只做标准商品/耗品，不做供应商 SKU |
| 实时报价 | 首期只做参考成本区间，不做供应商报价 |
| 采购需求/采购单 | 属于未来供应链平台 |
| 发货、收货、售后、对账 | 属于供应链履约，不进入行业数据 MVP |
| 自动爬取平台商品价格 | 授权、稳定性和合规风险较高，首期先做人工审核数据和可追溯来源 |
| 医疗美容诊疗知识 | 首期只覆盖生活美容和门店经营场景 |
| 面向外部客户售卖数据订阅 | 首期先服务 Ami_Core 内部接入 |

## 5. 模板覆盖原则

### 5.1 不按固定数量验收

首版不再限定“50 个项目、100 个耗品、10 个岗位”。原因是：

1. 美业项目因城市、门店定位、品牌定位差异较大，固定数量容易造成录入一批低价值模板。
2. 有些品类模板数量不多但经营价值高，例如补水、修护、清洁、抗衰。
3. 有些耗品数量多但标准化价值低，不能为了凑数量牺牲质量。
4. MVP 的核心是让管理端能接入配置，而不是堆数据量。

### 5.2 成熟模板入库标准

一个行业模板进入 MVP，需要满足以下条件：

| 标准 | 说明 |
| --- | --- |
| 市场成熟 | 多数生活美容门店或连锁门店常见 |
| 可经营 | 能作为门店项目、商品、卡项或耗品配置落地 |
| 可标准化 | 能抽象出名称、分类、时长、价格区间、BOM 或 SOP |
| 可解释 | 能说明适用人群、禁忌、服务价值和配置原因 |
| 可维护 | 后续能被运营人员持续更新和版本管理 |
| 可被 Ami_Core 采用 | 能直接生成 Ami_Core 项目、商品、BOM 或岗位参考 |

### 5.3 首版覆盖方向

首版应优先覆盖以下成熟经营方向：

#### 服务项目方向

| 大类 | 成熟项目示例 |
| --- | --- |
| 基础面部护理 | 基础清洁、深层清洁、补水护理、舒缓修护、屏障修护 |
| 功效面部护理 | 抗衰紧致、淡斑提亮、控油祛痘、敏感肌护理、眼部护理、颈部护理 |
| 仪器护理 | 小气泡清洁、导入护理、射频紧致、光电辅助护理、冷热喷护理 |
| 身体护理 | 肩颈舒压、背部疏通、身体精油护理、腹部护理、腿部护理 |
| 头皮护理 | 头皮清洁、头皮舒缓、头皮养护、控油护理 |
| 美睫美甲 | 基础美睫、睫毛护理、基础美甲、甲油胶、手足护理 |
| 到店检测 | 皮肤检测、头皮检测、护理评估 |

具体是否入库，由行业数据运营根据目标门店类型、市场成熟度和可标准化程度确认。

#### 商品/耗品方向

| 大类 | 成熟模板示例 |
| --- | --- |
| 院装护肤耗品 | 洁面、爽肤水、精华、面霜、乳液、按摩膏、软膜粉、冻膜、修护面膜 |
| 功效护理产品 | 补水、修护、抗衰、控油、提亮、舒敏相关院装产品 |
| 一次性耗材 | 棉片、面巾、头套、床单、手套、口罩、纱布、棉签 |
| 消毒清洁用品 | 酒精、消毒液、器械消毒用品、环境清洁用品 |
| 仪器耗材 | 探头套、导入头、滤芯、护理仪耗材 |
| 美睫美甲耗材 | 睫毛、胶水、卸胶剂、甲油胶、底胶、封层、打磨工具 |
| 零售商品 | 居家洁面、面膜、精华、面霜、防晒、头皮护理产品 |

#### 岗位与薪酬方向

| 大类 | 成熟岗位示例 |
| --- | --- |
| 服务岗位 | 美容师、美发师、美甲师、美睫师、头疗师 |
| 销售岗位 | 美容顾问、销售顾问、咨询顾问 |
| 门店运营 | 前台、店长、店助、运营督导 |
| 培训管理 | 培训师、技术老师 |

岗位模板需包含职责、能力等级、薪酬结构参考、提成/手工费参考口径。

## 6. 核心功能需求

### 6.1 数据源与证据管理

| 编号 | 需求 | 优先级 |
| --- | --- | --- |
| IDP-001 | 支持维护行业数据来源，包括官方标准、行业调研、品牌手册、公开资料、门店脱敏数据、人工运营录入 | P0 |
| IDP-002 | 每个来源记录来源类型、授权方式、可信等级、适用范围、更新时间、负责人 | P0 |
| IDP-003 | 支持上传证据文件或链接，如 PDF、Excel、网页、图片、访谈记录 | P0 |
| IDP-004 | 数据源支持状态：草稿、可用、暂停、过期、废弃 | P1 |

### 6.2 服务项目模板库

| 编号 | 需求 | 优先级 |
| --- | --- | --- |
| IDP-010 | 支持维护服务项目模板，包含名称、别名、分类、适用门店类型、建议时长、建议价格区间 | P0 |
| IDP-011 | 支持维护适用人群、禁忌、护理目标、服务卖点、推荐频次 | P0 |
| IDP-012 | 支持关联项目 BOM 模板 | P0 |
| IDP-013 | 支持关联 SOP、卫生安全、销售话术等知识条目 | P0 |
| IDP-014 | 支持模板审核、发布、下线、版本管理 | P0 |
| IDP-015 | 支持 Ami_Core 查询并采用项目模板 | P0 |

### 6.3 项目 BOM 模板库

项目 BOM 是行业数据平台 MVP 的核心能力。

| 编号 | 需求 | 优先级 |
| --- | --- | --- |
| IDP-020 | 支持为服务项目模板维护标准 BOM | P0 |
| IDP-021 | BOM 项从标准商品/耗品模板中选择，不直接绑定供应商 SKU | P0 |
| IDP-022 | BOM 项支持标准用量、单位、损耗率、是否必需、是否计入成本、服务步骤 | P0 |
| IDP-023 | BOM 自动计算标准成本区间 | P0 |
| IDP-024 | 支持替代品组，例如同类面膜、同类精华、同类一次性耗材 | P1 |
| IDP-025 | 支持 BOM 版本管理，发布后被 Ami_Core 采用 | P0 |
| IDP-026 | 支持预留供应链映射字段，如 `standardProductId`、`futureSupplyMappingKey`，但 MVP 不接供应链 SKU | P0 |

### 6.4 标准商品/耗品模板库

| 编号 | 需求 | 优先级 |
| --- | --- | --- |
| IDP-030 | 支持维护标准商品/耗品模板，包含名称、分类、规格、单位、使用场景、参考成本区间 | P0 |
| IDP-031 | 支持区分院装耗品、零售商品、一次性耗材、仪器耗材、消毒用品、美睫美甲耗材 | P0 |
| IDP-032 | 支持单位换算和包装规格，如 ml、g、片、盒、支、套 | P0 |
| IDP-033 | 支持被项目 BOM 引用，并展示引用项目 | P0 |
| IDP-034 | 支持 Ami_Core 采用为本地商品/耗品 | P0 |
| IDP-035 | 预留未来供应链平台映射字段，如 `standardProductCode`、`supplyCategoryCode`、`preferredSpecKey` | P0 |

### 6.5 岗位薪酬模板库

| 编号 | 需求 | 优先级 |
| --- | --- | --- |
| IDP-040 | 支持维护岗位模板，包含岗位名称、职责、适用门店类型、能力等级 | P0 |
| IDP-041 | 支持维护底薪区间、提成区间、手工费区间、绩效指标建议 | P0 |
| IDP-042 | 支持按城市等级、门店定位、员工等级配置参考范围 | P1 |
| IDP-043 | 支持 Ami_Core 员工/岗位配置页调用展示 | P0 |

### 6.6 知识库

| 编号 | 需求 | 优先级 |
| --- | --- | --- |
| IDP-050 | 支持维护服务 SOP、禁忌提醒、卫生安全、产品知识、销售话术、培训知识 | P0 |
| IDP-051 | 知识条目支持关联项目、商品/耗品、岗位、终端场景 | P0 |
| IDP-052 | 支持审核发布，AI 和终端只能调用已发布知识 | P0 |
| IDP-053 | 支持知识版本、有效期和来源记录 | P1 |

### 6.7 发布与采用

| 编号 | 需求 | 优先级 |
| --- | --- | --- |
| IDP-060 | 行业模板需经过草稿、待审核、已发布、已下线状态 | P0 |
| IDP-061 | 发布后生成版本号 | P0 |
| IDP-062 | Ami_Core 采用模板时，行业平台记录采用方、门店、时间、采用版本 | P0 |
| IDP-063 | Ami_Core 采用后保存本地快照，不随行业模板自动变更 | P0 |
| IDP-064 | 行业模板更新后，可通知 Ami_Core 有新版本可升级 | P1 |

## 7. Ami_Core 接入需求

### 7.1 管理端项目配置

1. 项目管理增加“从行业模板创建”入口。
2. 支持按分类、关键词、适用门店类型筛选模板。
3. 项目模板详情展示建议价、建议时长、标准 BOM 成本、适用人群、禁忌、SOP 摘要。
4. 店长采用后，生成 Ami_Core 本地 `Project`。
5. 同步生成 Ami_Core 本地 `ProjectBomItem`。
6. 店长可调整价格、时长、BOM 用量和商品映射。

### 7.2 管理端商品/耗品配置

1. 商品管理增加“从行业标准品创建”入口。
2. 支持按分类、使用场景、关键词筛选标准商品/耗品。
3. 采用后生成 Ami_Core 本地 `Product`。
4. 商品详情展示被哪些项目 BOM 引用。
5. 暂不展示供应商报价；只展示参考成本区间。

### 7.3 服务消耗与 BOM

1. 服务完成时可读取门店项目 BOM，生成默认耗材清单。
2. 美容师或店长确认实际耗材后，写入 Ami_Core 库存扣减。
3. 没有实际耗材记录时，经营利润按 BOM 标准成本估算。
4. 缺 BOM 时明确提示，不得默认按 0 成本计算。

### 7.4 员工与薪酬配置

1. 员工岗位配置页可查看行业岗位模板。
2. 支持查看底薪、提成、手工费、绩效目标参考。
3. 采用后仍由门店自行确认，不自动生成工资。

### 7.5 AI 与终端

1. AI Gateway 可调用已发布项目模板、SOP、禁忌、商品/耗品知识。
2. Ami Aura Lite 可展示服务准备清单、BOM 耗材、服务步骤、注意事项。
3. AI 输出需要区分“行业知识库引用”和“模型生成内容”。

## 8. 预留未来供应链平台接口

MVP 不建设供应链平台，但行业数据平台的数据结构和 API 需预留未来对接能力。

### 8.1 标准品映射预留

标准商品/耗品模板需预留：

```text
standardProductCode
supplyCategoryCode
preferredSpecKey
externalMappingKey
futureSupplyMappingStatus
```

说明：

- `standardProductCode`：行业标准品编码。
- `supplyCategoryCode`：未来供应链平台类目编码。
- `preferredSpecKey`：规格映射键，例如 `mask_powder_500g`。
- `externalMappingKey`：未来外部系统映射键。
- `futureSupplyMappingStatus`：未映射、待映射、已映射、映射异常。

### 8.2 项目 BOM 预留

BOM 项需预留：

```text
standardProductId
substituteGroupCode
allowSubstitute
futureSupplyRequired
futureSupplyMappingKey
```

### 8.3 未来 API 预留

首期可以先定义接口契约，但返回空供应链字段或占位状态：

| Method | Path | MVP 行为 |
| --- | --- | --- |
| GET | `/industry/product-templates/{id}/supply-mappings` | 返回预留映射状态，不返回真实 SKU |
| GET | `/industry/bom-items/{id}/supply-candidates` | 返回 `not_connected`，提示未来供应链平台接入 |
| POST | `/industry/supply-mapping-requests` | 记录映射需求，暂不触发采购 |

未来供应链平台上线后，再由供应链平台实现：

```text
GET /supply/skus
GET /supply/quotes
POST /procurement/requisitions
GET /procurement/requisitions/{id}
```

## 9. API 清单

### 9.1 行业数据平台 API

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/industry/service-templates` | 查询服务项目模板 |
| GET | `/industry/service-templates/{id}` | 查询服务项目模板详情 |
| GET | `/industry/service-templates/{id}/bom` | 查询项目 BOM 模板 |
| GET | `/industry/product-templates` | 查询标准商品/耗品模板 |
| GET | `/industry/product-templates/{id}` | 查询标准商品/耗品详情 |
| GET | `/industry/salary-benchmarks` | 查询岗位薪酬模板 |
| GET | `/industry/knowledge/items` | 查询已发布知识条目 |
| POST | `/industry/adoptions` | Ami_Core 回传采用记录 |
| GET | `/industry/template-updates` | Ami_Core 查询可升级模板版本 |

### 9.2 Ami_Core 采用后的落地对象

| 行业数据平台对象 | Ami_Core 对象 | 说明 |
| --- | --- | --- |
| `IndustryServiceTemplate` | `Project` | 生成门店项目 |
| `IndustryProjectBomTemplate` | `ProjectBomItem` | 生成门店项目 BOM 快照 |
| `IndustryProductTemplate` | `Product` | 生成门店商品/耗品 |
| `IndustrySalaryBenchmark` | 员工/岗位配置参考 | 只做参考，不自动生成工资 |
| `IndustryKnowledgeItem` | AI / 终端调用 | 只调用已发布内容 |

## 10. 数据模型建议

### 10.1 行业服务项目模板

```text
IndustryServiceTemplate
- id
- code
- name
- aliases
- category
- subCategory
- targetStoreTypes
- recommendedDurationMin
- recommendedDurationMax
- referencePriceMin
- referencePriceMax
- targetCustomers
- contraindications
- recommendedFrequency
- sellingPoints
- status
- version
- sourceId
- publishedAt
```

### 10.2 项目 BOM 模板

```text
IndustryProjectBomTemplate
- id
- serviceTemplateId
- version
- totalCostMin
- totalCostMax
- status
- sourceId
- publishedAt

IndustryProjectBomItemTemplate
- id
- bomTemplateId
- productTemplateId
- itemRole
- standardQty
- unit
- lossRate
- required
- costIncluded
- serviceStep
- allowSubstitute
- substituteGroupCode
- futureSupplyRequired
- futureSupplyMappingKey
```

### 10.3 标准商品/耗品模板

```text
IndustryProductTemplate
- id
- standardProductCode
- name
- aliases
- category
- subCategory
- productType
- recommendedSpec
- unit
- packageUnit
- referenceCostMin
- referenceCostMax
- referenceRetailPriceMin
- referenceRetailPriceMax
- applicableServiceCategories
- supplyCategoryCode
- preferredSpecKey
- futureSupplyMappingStatus
- status
- version
```

### 10.4 知识条目

```text
IndustryKnowledgeItem
- id
- domain
- title
- content
- structuredPayload
- tags
- applicableServiceTemplateIds
- applicableProductTemplateIds
- applicableRoles
- sourceId
- reviewStatus
- version
- effectiveFrom
- effectiveTo
```

## 11. 页面范围

### 11.1 行业数据平台后台

| 页面 | MVP 功能 |
| --- | --- |
| 数据源管理 | 来源、证据、可信等级、适用范围 |
| 服务项目模板 | 模板列表、详情、编辑、审核、发布 |
| 项目 BOM 模板 | BOM 编辑、标准成本、替代品组、版本发布 |
| 标准商品/耗品 | 标准品列表、规格、成本区间、BOM 引用关系 |
| 岗位薪酬模板 | 岗位、等级、薪酬结构、适用范围 |
| 知识库 | SOP、禁忌、卫生、话术、审核发布 |
| 采用记录 | 查看哪些 Ami_Core 门店采用了哪些模板版本 |
| 供应链预留映射 | 查看标准品未来供应链映射状态，占位即可 |

### 11.2 Ami_Core 管理端改造

| 页面 | MVP 改造 |
| --- | --- |
| 项目管理 | 从行业模板创建项目，采用 BOM |
| 项目编辑弹窗 | 显示行业参考价、参考时长、BOM 标准成本 |
| 商品管理 | 从行业标准品创建商品/耗品 |
| 服务消耗与 BOM | 按项目 BOM 生成默认消耗清单 |
| 经营利润 | 使用 BOM 标准成本估算，展示缺 BOM/缺实耗 |
| 员工配置 | 展示行业岗位薪酬参考 |
| 终端服务 | 展示服务准备清单和 SOP |

## 12. 验收标准

### 12.1 模板质量验收

1. 首版模板覆盖主流生活美容门店的成熟经营场景。
2. 每个服务项目模板必须具备分类、名称、建议时长、参考价、适用人群、禁忌、SOP 摘要。
3. 纳入首版的服务项目模板原则上应配置项目 BOM；暂无法标准化 BOM 的项目需标记原因。
4. 每个 BOM 项必须关联标准商品/耗品模板。
5. 标准商品/耗品模板必须具备分类、规格、单位、参考成本区间。
6. 岗位模板必须具备职责、等级、薪酬结构参考。
7. 知识条目必须具备来源、审核状态和适用范围。

### 12.2 Ami_Core 接入验收

1. Ami_Core 可查询行业服务项目模板。
2. Ami_Core 可查看项目模板详情和 BOM。
3. Ami_Core 可采用项目模板生成本地项目。
4. Ami_Core 可采用 BOM 生成本地 `ProjectBomItem`。
5. Ami_Core 可从标准商品/耗品模板生成本地 `Product`。
6. 项目毛利可读取本地 BOM 标准成本。
7. 服务完成可按本地 BOM 生成默认耗材清单。
8. 缺 BOM、缺成本、缺实耗时有明确数据质量提示。

### 12.3 供应链预留验收

1. 标准商品/耗品具备未来供应链映射编码字段。
2. BOM 项具备未来供应链映射键和替代品组字段。
3. Ami_Core 调用供应链预留接口时不会报错，能得到 `not_connected` 或 `not_mapped` 状态。
4. 文档中明确未来供应链平台接入的 API 路径和数据映射关系。

## 13. 里程碑

### M1：行业模板数据结构和后台

目标：行业数据平台可维护和发布模板。

交付：

- 数据源管理。
- 服务项目模板。
- 标准商品/耗品模板。
- 项目 BOM 模板。
- 审核发布和版本管理。

### M2：成熟市场模板首版录入

目标：形成一套可被管理端采用的首版行业模板包。

交付：

- 成熟服务项目模板包。
- 项目 BOM 模板包。
- 标准商品/耗品模板包。
- 岗位薪酬模板包。
- SOP、禁忌、卫生安全知识包。

验收方式不按固定数量，而按“是否覆盖主流生活美容门店初始化配置所需的核心场景”评审。

### M3：Ami_Core 接入

目标：行业模板进入 Ami_Core 配置流程。

交付：

- 管理端从行业模板创建项目。
- 管理端从标准品创建商品/耗品。
- 项目 BOM 同步到 Ami_Core。
- 项目毛利和服务消耗可使用 BOM。

### M4：供应链接口预留

目标：为未来供应链平台接入减少返工。

交付：

- 标准品编码。
- BOM 供应链映射键。
- 供应链候选查询占位接口。
- 映射需求记录接口。

## 14. 风险与应对

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| 模板质量不稳定 | 管理端采用后配置价值低 | 设置成熟模板入库标准和审核流程 |
| 过早追求数量 | 数据堆积但不可用 | 验收改为场景覆盖和可采用质量 |
| BOM 过细导致维护成本高 | 运营难以维护 | 首版只做标准耗材，不做每个品牌的供应商 SKU |
| 行业模板与门店实际差异 | 店长不愿采用 | 采用后允许门店调整，并保存门店快照 |
| 供应链未来接入返工 | 后续对接成本高 | 首版预留标准品编码、映射键、替代品组 |
| AI 使用未审核知识 | 输出不稳定或有合规风险 | AI 只调用已发布知识，保留来源和版本 |

## 15. 最终建议

行业数据平台 MVP 的第一优先级是“可被 Ami_Core 采用的成熟行业配置资产”，不是供应链交易，也不是固定数量的数据录入。

推荐的首版闭环是：

```text
成熟市场项目模板
-> 项目标准 BOM
-> 标准商品/耗品模板
-> SOP/禁忌/卫生知识
-> Ami_Core 采用项目、商品和 BOM
-> 服务扣耗、经营利润、AI/终端建议
-> 预留未来供应链映射
```

只要这个闭环跑通，后续供应链平台上线时，就可以基于标准商品/耗品和 BOM 快速接入供应商 SKU、报价和采购履约。
