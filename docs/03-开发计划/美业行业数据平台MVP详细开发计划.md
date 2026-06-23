# 美业行业数据平台 MVP 详细开发计划

更新时间：2026-06-21
依据文档：`docs/02-产品设计/美业行业数据平台MVP需求文档.md`
适用范围：Ami_Core 管理端、`packages/server-v2` 后端、Ami Aura Lite 终端、AI Gateway、经营利润与服务消耗链路

## 0. 实施进度快照

更新时间：2026-06-21 05:55

| 阶段 | 当前状态 | 已落地内容 | 下一步 |
| --- | --- | --- | --- |
| 阶段 0：口径冻结 | 已完成 | 冻结“先行业数据、后供应链”的 MVP 边界；确认 `/industry/*` 域名、`Industry*` 模型前缀、`core:industry:*` 权限码 | 后续如新增供应链平台，只通过预留接口扩展 |
| 阶段 1：后端行业数据底座 | 已完成基础版 | 已新增 Prisma 模型、迁移、`IndustryModule`、基础 CRUD/发布/占位映射接口、行业 MVP dry-run 种子脚本 | 补充真实写库种子验收和 CRUD 单测覆盖 |
| 阶段 2：管理端行业数据后台 | 已完成可维护版 | 已新增 `src/types/industry.ts`、`src/api/real/industry.ts`、`src/api/industry.ts`、行业数据平台工作台页面、路由、菜单和权限目录；工作台已支持服务模板、标准品、BOM、知识、薪酬、数据源的新增/编辑/保存/发布 | 后续继续优化详情抽屉、审核流体验和更细的数据源证据管理 |
| 阶段 3：Ami_Core 采用流程 | 进行中 | 已新增服务模板采用项目事务接口、标准品采用商品事务接口；项目新增弹窗已支持选择行业服务模板并一键创建项目、商品/耗品和 BOM，且支持 BOM 标准品手动映射已有本地商品；产品档案页已支持从行业标准品创建本地产品；提成规则页已支持行业薪酬参考带入 | 继续补更完整的模板筛选、适用人群/禁忌/SOP 预览和真实写库验收 |
| 阶段 4：联动验收与供应链预留 | 部分完成 | 供应链映射占位接口与前端“未接入”展示已预留 | 做服务扣耗、经营利润、终端/AI 读取行业模板采用结果的联动验收 |

已验证：

- `packages/server-v2`：`npm run db:generate`、`npx prisma validate`、`npm run build`、`npm run db:seed:industry-mvp:dry-run`、`npm run test`、`npm run lint`。
- 管理端：`npm.cmd run build`、`npm.cmd run test -- src/test/permissions.test.ts src/test/api.test.ts`。

## 1. 项目目标

本计划用于落地 **Ami Industry Data Platform / 美业行业数据平台 MVP**。

首期不建设供应链平台，不做供应商、SKU、报价、采购履约。开发重点是沉淀一套能被 Ami_Core 管理端直接采用的行业标准配置资产：

1. 成熟服务项目模板。
2. 项目标准 BOM 模板。
3. 标准商品/耗品模板。
4. 岗位与薪酬参考模板。
5. 服务 SOP、禁忌、卫生安全、销售话术等知识库。
6. 供应链平台未来对接所需的标准品编码、映射状态和占位接口。

最终产品效果：

- 平台运营可维护、审核、发布行业模板。
- 店长可在 Ami_Core 从行业模板创建门店项目、商品/耗品和项目 BOM。
- 项目 BOM 可继续服务于服务扣耗、经营利润、Ami Aura Lite 服务准备清单和 AI 推荐。
- 未来供应链平台上线时，可基于行业标准品和 BOM 映射供应商 SKU、报价和采购履约。

## 2. 当前基础判断

当前仓库已有一部分可复用基础：

| 基础能力 | 现状 | 本次使用方式 |
| --- | --- | --- |
| 门店项目 | `Project` 已有名称、分类、价格、时长、图片、状态 | 行业项目模板采用后生成本地 `Project` |
| 项目 BOM | `ProjectBomItem` 已有 `projectId/productId/standardQty/unit` | 行业 BOM 采用后生成本地 BOM 快照 |
| 商品/耗品 | `Product` 已有 SKU、名称、品牌、规格、单位、成本价、零售价、库存 | 行业标准品采用后生成本地 `Product` |
| 服务消耗与 BOM 页面 | 管理端已有 `/inventory/consumption` 菜单 | 后续展示行业模板采用后的 BOM 与实际消耗 |
| 项目编辑弹窗 | `AddProjectDialog` 已支持 BOM 配置 | 增加“从行业模板带入 BOM”和行业参考展示 |
| 经营利润 | 已按实耗优先、BOM 估算、缺 BOM 提示设计 | 行业 BOM 能提升项目毛利可用性 |
| AI/Agent 工具 | 已能读取 `ProjectBomItem` 参与建议 | 后续增加行业知识库引用 |

需要新增的主能力：

- 行业模板主数据和版本管理。
- 行业数据源和证据管理。
- 行业知识库。
- Ami_Core 采用记录。
- 管理端行业数据平台后台页面。
- Ami_Core 从行业模板采用项目、商品、BOM 的流程。

## 3. 总体策略

### 3.1 开发原则

| 原则 | 说明 |
| --- | --- |
| 先行业数据，后供应链 | MVP 不做真实供应商 SKU 和报价，只预留映射字段 |
| 先后台维护，后智能推荐 | 先让模板可维护、可审核、可采用，再做更复杂推荐 |
| 采用后保存快照 | 行业模板更新不自动覆盖门店项目、商品和 BOM |
| 不按固定数量验收 | 按成熟市场场景覆盖和能否被 Ami_Core 采用验收 |
| API 先稳定口径 | `/industry/*` 接口独立成域，避免后续供应链接入时重命名 |
| 与现有主线兼容 | 不破坏 `Project`、`Product`、`ProjectBomItem` 当前使用方式 |

### 3.2 推荐交付节奏

建议按 6 周推进，分 4 个阶段：

| 阶段 | 周期 | 目标 | 核心交付 |
| --- | --- | --- | --- |
| 阶段 0 | 第 0.5 周 | 口径冻结和开发准备 | 字段口径、权限、菜单、种子数据范围确认 |
| 阶段 1 | 第 1-2 周 | 后端行业数据底座 | Prisma 模型、迁移、基础 CRUD、发布状态、种子数据 |
| 阶段 2 | 第 3-4 周 | 管理端行业数据后台 | 行业模板、BOM、标准品、知识库维护页面 |
| 阶段 3 | 第 5 周 | Ami_Core 采用流程 | 从行业模板创建项目、商品和 BOM |
| 阶段 4 | 第 6 周 | 联动验收和预留接口 | 服务扣耗/利润验证、AI/终端读取、供应链占位接口、回归测试 |

## 4. 阶段 0：口径冻结与开发准备

周期：0.5 周
优先级：P0
目标：避免进入开发后反复改领域边界。

### 4.1 产品口径确认

| 任务 | 说明 | 产物 |
| --- | --- | --- |
| 确认行业数据平台范围 | 明确首期只做行业模板、BOM、标准品、薪酬、知识库 | 范围确认 |
| 确认供应链不进 MVP | 供应商、SKU、报价、采购全部排除，只保留映射字段 | 不做清单 |
| 确认成熟模板入库标准 | 按成熟市场场景覆盖，不按固定数量验收 | 模板入库标准 |
| 确认 Ami_Core 采用规则 | 采用后生成门店本地快照，不自动同步覆盖 | 采用规则 |
| 确认权限角色 | 平台运营、数据审核、店长、系统管理员 | 权限矩阵 |

### 4.2 技术准备

| 任务 | 涉及文件 | 说明 |
| --- | --- | --- |
| 确认模型命名 | `packages/server-v2/prisma/schema.prisma` | 使用 `Industry*` 前缀 |
| 确认 API 路由 | `packages/server-v2/src/industry` | 使用 `/industry/*` |
| 确认前端目录 | `src/app/pages`、`src/api/real` | 新增行业数据页面和 API 门面 |
| 确认菜单位置 | `src/app/components/Layout.tsx` | 建议新增“行业数据平台”一级菜单，仅管理员/总部运营可见 |
| 确认权限码 | `src/config/permissions.ts` | 建议新增 `core:industry:*` 权限 |

### 4.3 阶段验收

- 产品确认首期不包含供应链交易。
- 技术确认模型、API、菜单、权限命名。
- 明确哪些页面是行业平台后台，哪些是 Ami_Core 采用入口。

## 5. 阶段 1：后端行业数据底座

周期：第 1-2 周
优先级：P0
目标：完成行业数据平台的数据库、服务层、API 和基础种子数据。

### 5.1 Prisma 模型新增

建议新增模型：

| 模型 | 作用 |
| --- | --- |
| `IndustryDataSource` | 行业数据来源和证据归属 |
| `IndustryEvidence` | 来源附件、链接、文件、截图等证据 |
| `IndustryServiceTemplate` | 服务项目模板 |
| `IndustryProjectBomTemplate` | 项目 BOM 模板版本 |
| `IndustryProjectBomItemTemplate` | 项目 BOM 明细 |
| `IndustryProductTemplate` | 标准商品/耗品模板 |
| `IndustrySalaryBenchmark` | 岗位薪酬参考 |
| `IndustryKnowledgeItem` | SOP、禁忌、卫生、话术、培训知识 |
| `IndustryAdoptionRecord` | Ami_Core 采用记录 |
| `IndustrySupplyMappingRequest` | 未来供应链映射需求占位 |

### 5.2 枚举和状态字段

建议用字符串字段先实现，降低 Prisma enum 迁移成本。首期约定：

```text
templateStatus: draft | pending_review | published | offline
reviewStatus: draft | pending_review | approved | rejected | offline
sourceType: official | research | brand_manual | public_reference | store_aggregate | manual
confidenceLevel: high | medium | low
productType: professional_consumable | retail_product | disposable | instrument_consumable | disinfectant | nail_lash_consumable
knowledgeDomain: service_sop | contraindication | hygiene | product_knowledge | sales_script | training
futureSupplyMappingStatus: not_connected | not_mapped | mapping_requested | mapped | mapping_error
```

### 5.3 关键字段设计

#### IndustryServiceTemplate

```text
code
name
aliases Json?
category
subCategory
targetStoreTypes Json?
recommendedDurationMin
recommendedDurationMax
referencePriceMin
referencePriceMax
targetCustomers Json?
contraindications Json?
recommendedFrequency
sellingPoints Json?
status
version
sourceId
publishedAt
```

#### IndustryProductTemplate

```text
standardProductCode
name
aliases Json?
category
subCategory
productType
recommendedSpec
unit
packageUnit
referenceCostMin
referenceCostMax
referenceRetailPriceMin
referenceRetailPriceMax
applicableServiceCategories Json?
supplyCategoryCode
preferredSpecKey
externalMappingKey
futureSupplyMappingStatus
status
version
```

#### IndustryProjectBomItemTemplate

```text
bomTemplateId
productTemplateId
itemRole
standardQty
unit
lossRate
required
costIncluded
serviceStep
allowSubstitute
substituteGroupCode
futureSupplyRequired
futureSupplyMappingKey
```

### 5.4 后端模块结构

建议新增：

```text
packages/server-v2/src/industry/
  industry.module.ts
  industry-data-source.controller.ts
  industry-data-source.service.ts
  industry-service-template.controller.ts
  industry-service-template.service.ts
  industry-product-template.controller.ts
  industry-product-template.service.ts
  industry-bom-template.controller.ts
  industry-bom-template.service.ts
  industry-knowledge.controller.ts
  industry-knowledge.service.ts
  industry-salary.controller.ts
  industry-salary.service.ts
  industry-adoption.controller.ts
  industry-adoption.service.ts
  dto/
```

### 5.5 API 清单

#### 后台维护接口

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/industry/data-sources` | 数据源列表 |
| POST | `/industry/data-sources` | 新增数据源 |
| PATCH | `/industry/data-sources/{id}` | 更新数据源 |
| GET | `/industry/service-templates/paginated` | 服务模板分页 |
| POST | `/industry/service-templates` | 新建服务模板 |
| PATCH | `/industry/service-templates/{id}` | 更新服务模板 |
| POST | `/industry/service-templates/{id}/submit-review` | 提交审核 |
| POST | `/industry/service-templates/{id}/publish` | 发布模板 |
| POST | `/industry/service-templates/{id}/offline` | 下线模板 |
| GET | `/industry/product-templates/paginated` | 标准品分页 |
| POST | `/industry/product-templates` | 新建标准品 |
| PATCH | `/industry/product-templates/{id}` | 更新标准品 |
| GET | `/industry/bom-templates/{serviceTemplateId}` | 查询服务模板 BOM |
| PUT | `/industry/bom-templates/{serviceTemplateId}` | 保存 BOM 模板 |
| GET | `/industry/knowledge/items/paginated` | 知识库分页 |
| POST | `/industry/knowledge/items` | 新建知识条目 |
| PATCH | `/industry/knowledge/items/{id}` | 更新知识条目 |
| GET | `/industry/salary-benchmarks/paginated` | 薪酬模板分页 |
| POST | `/industry/salary-benchmarks` | 新建薪酬模板 |

#### Ami_Core 采用接口

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/industry/service-templates` | 查询已发布服务模板 |
| GET | `/industry/service-templates/{id}` | 查询模板详情 |
| GET | `/industry/service-templates/{id}/bom` | 查询已发布 BOM |
| POST | `/industry/service-templates/{id}/adopt-project` | 采用服务模板，事务创建门店项目、项目 BOM 和采用记录；支持自动创建/复用商品，也支持 `productMappings` 手动映射已有商品 |
| GET | `/industry/product-templates` | 查询已发布标准商品/耗品 |
| GET | `/industry/product-templates/{id}` | 查询标准品详情 |
| POST | `/industry/product-templates/{id}/adopt-product` | 采用标准品，事务创建门店本地商品/耗品和采用记录 |
| GET | `/industry/salary-benchmarks` | 查询岗位薪酬参考 |
| GET | `/industry/knowledge/items` | 查询已发布知识 |
| POST | `/industry/adoptions` | 记录采用 |
| GET | `/industry/template-updates` | 查询可升级模板 |

#### 供应链预留接口

| Method | Path | MVP 行为 |
| --- | --- | --- |
| GET | `/industry/product-templates/{id}/supply-mappings` | 返回 `not_connected` 或预留映射状态 |
| GET | `/industry/bom-items/{id}/supply-candidates` | 返回 `not_connected`，不返回 SKU |
| POST | `/industry/supply-mapping-requests` | 记录未来映射需求，不触发采购 |

### 5.6 种子数据与导入

建议新增：

```text
packages/server-v2/prisma/seed-industry-mvp.ts
```

种子数据要求：

- 使用成熟市场方向作为首版模板包，不用固定数量作为脚本限制。
- 至少覆盖基础面护、功效面护、仪器护理、身体护理、头皮护理、美睫美甲、到店检测等方向。
- 每个纳入首版的服务模板原则上配置 BOM；无法标准化的模板需写明 `bomUnavailableReason`。
- 标准品必须能被 BOM 引用。
- 知识条目必须已发布或可审核。
- 支持 dry-run 和真实写入。
- 重复执行时按 `code` / `standardProductCode` upsert，不制造重复数据。

### 5.7 阶段验收

- Prisma migration 成功。
- `packages/server-v2 npm run build` 通过。
- 行业数据基础 CRUD 单测通过。
- 种子脚本 dry-run 和真实写入通过。
- 已发布服务模板能通过 `/industry/service-templates` 查询。
- 已发布 BOM 能通过 `/industry/service-templates/{id}/bom` 查询。

## 6. 阶段 2：管理端行业数据后台

周期：第 3-4 周
优先级：P0
目标：让运营人员能维护、审核、发布行业模板。

### 6.1 前端 API 层

建议新增：

```text
src/api/real/industry.ts
src/api/industry.ts
src/types/industry.ts
```

需要包含：

- 数据源类型。
- 服务项目模板类型。
- 项目 BOM 模板类型。
- 标准商品/耗品模板类型。
- 薪酬模板类型。
- 知识条目类型。
- 采用记录类型。

### 6.2 菜单与权限

建议新增一级菜单：`行业数据平台`

子菜单：

| 菜单 | 路由 | 权限 |
| --- | --- | --- |
| 数据源管理 | `/industry/data-sources` | `core:industry:data-source` |
| 服务项目模板 | `/industry/service-templates` | `core:industry:service-template` |
| 项目 BOM 模板 | `/industry/bom-templates` | `core:industry:bom-template` |
| 标准商品/耗品 | `/industry/product-templates` | `core:industry:product-template` |
| 岗位薪酬模板 | `/industry/salary-benchmarks` | `core:industry:salary` |
| 知识库 | `/industry/knowledge` | `core:industry:knowledge` |
| 采用记录 | `/industry/adoptions` | `core:industry:adoption` |
| 供应链预留映射 | `/industry/supply-mappings` | `core:industry:supply-mapping` |

权限建议：

- `super_admin` 拥有全部权限。
- 门店店长默认不进入行业数据平台后台，只在项目/商品/员工配置页使用行业模板。
- 后续可增加总部运营或行业数据运营角色。

### 6.3 页面开发任务

#### 数据源管理页

| 任务 | 说明 |
| --- | --- |
| 列表 | 展示来源类型、名称、可信等级、负责人、更新时间、状态 |
| 新增/编辑 | 维护来源类型、授权方式、适用范围、备注 |
| 证据管理 | MVP 可先支持链接和文本说明，文件上传可 P1 |
| 状态管理 | 草稿、可用、暂停、过期、废弃 |

#### 服务项目模板页

| 任务 | 说明 |
| --- | --- |
| 列表筛选 | 分类、状态、关键词、适用门店类型 |
| 详情抽屉 | 展示价格区间、时长、适用人群、禁忌、SOP、BOM 摘要 |
| 新增/编辑 | 表单维护基础信息 |
| 审核发布 | 提交审核、发布、下线 |
| 版本提示 | 展示当前版本和发布时间 |

#### 项目 BOM 模板页

| 任务 | 说明 |
| --- | --- |
| 按项目筛选 | 选择服务模板后编辑 BOM |
| BOM 明细表 | 标准品、用量、单位、损耗率、是否必需、是否计入成本 |
| 成本预估 | 根据标准品参考成本区间计算总成本区间 |
| 替代品组 | MVP 可先支持字段录入，复杂推荐放 P1 |
| 发布版本 | 保存后可随服务模板一起发布 |

#### 标准商品/耗品页

| 任务 | 说明 |
| --- | --- |
| 列表筛选 | 分类、类型、关键词、映射状态 |
| 新增/编辑 | 名称、规格、单位、成本区间、零售价区间 |
| BOM 引用 | 展示被哪些项目 BOM 引用 |
| 供应链预留 | 展示 `futureSupplyMappingStatus`，但不展示供应商 SKU |

#### 岗位薪酬模板页

| 任务 | 说明 |
| --- | --- |
| 列表 | 岗位、等级、门店类型、薪酬区间 |
| 编辑 | 职责、能力等级、底薪、提成、手工费、绩效建议 |
| 状态 | 草稿、发布、下线 |

#### 知识库页

| 任务 | 说明 |
| --- | --- |
| 列表 | 领域、标题、关联项目/商品/岗位、状态 |
| 编辑 | 正文、结构化字段、标签、适用范围 |
| 审核发布 | 只有已发布知识供 AI/终端调用 |
| 版本 | 记录版本和有效期 |

### 6.4 阶段验收

- 管理端可完成服务模板、标准品、BOM、知识条目的新增、编辑、发布。
- 发布后的模板能被采用接口查询到。
- 未发布内容不会出现在 Ami_Core 采用入口。
- 管理端路由权限生效。
- `npm run build` 通过。

## 7. 阶段 3：Ami_Core 采用流程

周期：第 5 周
优先级：P0
目标：让行业数据平台进入管理端配置流程。

### 7.1 从行业模板创建项目

涉及位置：

```text
src/app/pages/ProjectManagement.tsx
src/app/components/AddProjectDialog.tsx
src/api/real/project.ts
src/api/real/industry.ts
packages/server-v2/src/projects
packages/server-v2/src/industry
```

开发任务：

| 任务 | 说明 |
| --- | --- |
| 新增入口 | 项目新增弹窗已加入“行业模板快速创建”入口 |
| 模板选择弹窗 | 入口版支持选择已发布服务模板；后续补分类、关键词、适用门店类型筛选 |
| 模板详情预览 | 入口版展示建议价、时长、BOM 状态、版本和 BOM 明细；后续补适用人群、禁忌、SOP |
| 采用确认 | 已通过 `/industry/service-templates/{id}/adopt-project` 创建本地 `Project` |
| BOM 同步 | 已由后端事务同步创建本地 `ProjectBomItem` |
| 商品缺失处理 | 已支持两种方式：默认按行业标准品自动创建/复用本地 `Product`；也可在项目新增弹窗逐行把 BOM 标准品映射到已有本地商品/耗品 |
| 采用记录 | 已由后端事务写入 `IndustryAdoptionRecord`，前端不再单独补写 |

关键规则：

1. 行业模板价格只作为默认值，店长可修改。
2. 本地 `Project` 创建成功后再写 BOM。
3. 行业 BOM 标准品不直接等同本地商品，必须映射或创建本地 `Product`。
4. 采用失败不能留下半成品；后端建议使用事务或前端补偿提示。

### 7.2 从标准品创建商品/耗品

涉及位置：

```text
src/app/pages/ProductManagement.tsx 或现有商品/库存产品页
src/api/real/product.ts
src/api/real/industry.ts
packages/server-v2/src/products
```

开发任务：

| 任务 | 说明 |
| --- | --- |
| 新增入口 | 产品档案页已增加“从行业标准品创建” |
| 标准品选择 | 入口版支持选择已发布标准品；后续补分类、类型、关键词筛选 |
| 字段映射 | 已通过 `/industry/product-templates/{id}/adopt-product` 将标准品名称、规格、单位、参考成本、参考零售价映射到 `Product` |
| SKU 生成 | 已由后端按门店和行业标准品编码生成本地 SKU |
| 来源记录 | 已由后端写入 `IndustryAdoptionRecord`，不在 `Product` 表新增来源字段 |

### 7.3 项目 BOM 本地快照

本地 `ProjectBomItem` 当前字段较少：

```text
projectId
productId
standardQty
unit
```

MVP 可先写入这四项。若需要保留更多行业来源，建议新增字段或旁路记录：

```text
industryBomTemplateId?
industryBomItemTemplateId?
industryProductTemplateId?
lossRate?
required?
costIncluded?
serviceStep?
```

建议首期新增来源字段，避免后续无法追踪模板采用关系。

### 7.4 薪酬模板接入

开发任务：

| 任务 | 说明 |
| --- | --- |
| 员工/岗位配置入口 | 提成规则页已增加“行业薪酬参考”入口 |
| 参考抽屉 | 入口版展示岗位、等级、底薪区间、提成区间、服务费区间和版本 |
| 采用方式 | MVP 不自动创建工资表；当前支持将建议提成率带入新增提成规则，并写入 `IndustryAdoptionRecord.payload` |

### 7.5 阶段验收

- 店长可从行业模板创建项目。
- 创建项目时可同步创建本地 BOM。
- BOM 标准品可创建或映射为本地商品。
- 项目编辑弹窗能看到同步后的 BOM。
- 行业平台有采用记录。
- 行业薪酬模板可作为提成规则参考被记录采用。
- 行业模板更新不自动覆盖本地项目。

## 8. 阶段 4：联动验收与供应链预留

周期：第 6 周
优先级：P0/P1
目标：确认行业数据进入经营闭环，并为未来供应链平台留接口。

### 8.1 服务消耗联动

验证范围：

- Ami Aura Lite 或管理端完成服务时，能读取本地项目 BOM。
- 默认耗材清单来自本地 `ProjectBomItem`。
- 用户确认实际耗材后写入 `StockMovement`。
- 未确认实际耗材时，利润模块按 BOM 标准成本估算。

### 8.2 经营利润联动

验证范围：

- 项目毛利能读取行业模板采用后的本地 BOM。
- 有实耗时使用实耗成本。
- 无实耗时使用 BOM 标准成本。
- 缺 BOM 时展示 `missing_bom`，不能按 0 成本静默计算。

### 8.3 AI 与终端联动

开发任务：

| 任务 | 说明 |
| --- | --- |
| AI 知识查询 | AI Gateway 只调用已发布知识 |
| 终端服务准备 | 终端服务详情展示 BOM 耗材清单 |
| 来源标识 | AI 输出区分行业知识库引用和模型生成内容 |
| 安全边界 | 禁忌、卫生安全不允许被模型自由改写成相反建议 |

### 8.4 供应链占位接口

开发任务：

| 接口 | 行为 |
| --- | --- |
| `/industry/product-templates/{id}/supply-mappings` | 返回标准品映射状态 |
| `/industry/bom-items/{id}/supply-candidates` | 返回 `not_connected` |
| `/industry/supply-mapping-requests` | 记录映射需求 |

前端展示：

- 标准品详情页显示“供应链未接入”。
- BOM 明细可显示“未来可映射供应链 SKU”。
- 不展示虚假的供应商、价格和库存。

### 8.5 阶段验收

- 行业模板采用后的项目能进入服务扣耗和利润计算。
- AI/终端能读取已发布知识或 BOM 清单。
- 供应链预留接口可调用且不会误导用户已经有真实报价。
- 根项目 `npm run build`、`npm run test` 通过。
- `packages/server-v2 npm run build`、`npm run test` 通过。

## 9. 数据迁移与兼容策略

### 9.1 新增表不影响现有业务

所有 `Industry*` 表为新增表，不直接替换现有 `Project`、`Product`、`ProjectBomItem`。

现有项目、商品、BOM 继续正常使用。只有用户主动采用行业模板时，才生成本地数据。

### 9.2 行业来源追踪

建议在本地采用对象上保留来源：

| 本地对象 | 建议来源字段 |
| --- | --- |
| `Project` | `industryServiceTemplateId`、`industryTemplateVersion` |
| `ProjectBomItem` | `industryBomItemTemplateId`、`industryProductTemplateId` |
| `Product` | `industryProductTemplateId`、`standardProductCode` |

如果不希望本轮改动现有模型，可用 `IndustryAdoptionRecord.payload` 记录映射关系，但长期不如字段可查。

### 9.3 历史数据不自动回填

MVP 不要求把历史项目自动匹配行业模板。可后续做“智能匹配行业模板”工具。

## 10. 测试计划

### 10.1 后端单测

建议覆盖：

| 模块 | 用例 |
| --- | --- |
| 服务模板 | 创建、更新、发布、下线、只查询已发布 |
| BOM 模板 | 保存 BOM、成本区间计算、标准品引用校验 |
| 标准品 | 创建、分类筛选、映射状态返回 |
| 知识库 | 未发布不可被 AI 查询，已发布可查询 |
| 采用记录 | 记录门店、模板版本、采用对象 |
| 供应链占位 | 返回 `not_connected`，不会返回假 SKU |

### 10.2 前端单测/组件测试

建议覆盖：

- 行业模板列表筛选。
- 项目模板详情展示。
- BOM 成本区间展示。
- 从行业模板创建项目的确认流程。
- 标准品创建商品表单映射。

### 10.3 集成测试

核心链路：

```text
发布行业服务模板
-> 发布项目 BOM
-> Ami_Core 查询模板
-> 采用生成 Project
-> 采用生成 Product / ProjectBomItem
-> 服务消耗读取 BOM
-> 经营利润读取 BOM 成本
```

### 10.4 E2E 建议

新增 Playwright 用例：

1. 管理员进入行业数据平台，发布一个服务模板。
2. 店长进入项目管理，从行业模板创建项目。
3. 打开项目编辑弹窗，确认 BOM 已带入。
4. 打开服务消耗与 BOM 页面，确认项目 BOM 可见。

### 10.5 必跑命令

根项目：

```bash
npm run build
npm run test
npm run lint
```

后端：

```bash
cd packages/server-v2
npm run build
npm run test
npm run lint
```

关键改动后补充：

```bash
npx vitest run src/test/api.test.ts
npx vitest run src/test/auth-store.test.ts
```

## 11. 验收标准

### 11.1 产品验收

1. 行业数据平台能维护服务模板、标准品、BOM、薪酬和知识。
2. 模板数量不作为硬性验收，但首版模板必须覆盖主流生活美容门店初始化配置场景。
3. 每个可采用服务模板必须具备建议价、建议时长、适用人群、禁忌和 SOP 摘要。
4. 纳入首版的服务模板原则上必须配置 BOM；不能配置的需标记原因。
5. 每个 BOM 项必须引用标准商品/耗品模板。
6. Ami_Core 能采用模板生成本地项目、商品和 BOM。
7. 采用后的门店项目可调整，不被行业模板自动覆盖。
8. 服务扣耗、经营利润、AI/终端建议能读取采用后的本地 BOM 或知识。

### 11.2 技术验收

1. 新增模型迁移可执行。
2. API 权限、门店隔离和发布状态过滤正确。
3. 未发布模板不会出现在采用接口。
4. 采用流程失败不会产生半成品数据。
5. 供应链占位接口返回清晰状态，不伪造真实报价。
6. 构建、单测、lint 通过。

## 12. 风险与应对

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| 模板质量低 | 店长不愿采用 | 设置成熟模板入库标准和审核流程 |
| BOM 过细 | 运营维护成本高 | 首版只做标准耗材，不做品牌 SKU |
| 标准品和本地商品映射复杂 | 采用流程卡住 | 提供“创建新商品”和“映射已有商品”两种方式 |
| 行业模板更新影响门店历史数据 | 利润和服务记录口径混乱 | 采用后保存本地快照，不自动覆盖 |
| 供应链预留误导用户 | 用户以为已有真实采购能力 | UI 明确展示“供应链未接入” |
| AI 引用未审核知识 | 话术和建议不稳定 | AI 仅查询已发布知识 |
| 新增菜单过重 | 店长使用复杂 | 行业数据后台仅给管理员/运营，店长只在业务页面看到采用入口 |

## 13. 文件改动清单建议

### 13.1 后端

```text
packages/server-v2/prisma/schema.prisma
packages/server-v2/prisma/migrations/*
packages/server-v2/prisma/seed-industry-mvp.ts
packages/server-v2/src/app.module.ts
packages/server-v2/src/industry/**
packages/server-v2/src/projects/**
packages/server-v2/src/products/**
packages/server-v2/src/terminal/**
packages/server-v2/src/ai/**
```

### 13.2 管理端

```text
src/api/industry.ts
src/api/real/industry.ts
src/api/index.ts
src/types/industry.ts
src/app/routes.tsx
src/app/components/Layout.tsx
src/config/permissions.ts
src/app/pages/IndustryDataSources.tsx
src/app/pages/IndustryServiceTemplates.tsx
src/app/pages/IndustryBomTemplates.tsx
src/app/pages/IndustryProductTemplates.tsx
src/app/pages/IndustrySalaryBenchmarks.tsx
src/app/pages/IndustryKnowledge.tsx
src/app/pages/IndustryAdoptions.tsx
src/app/components/AddProjectDialog.tsx
src/app/pages/ProjectManagement.tsx
```

### 13.3 文档

```text
docs/api-contract.md
docs/terminal-api.md
docs/02-产品设计/美业行业数据平台MVP需求文档.md
docs/03-开发计划/美业行业数据平台MVP详细开发计划.md
docs/04-测试数据/行业数据平台MVP验收记录.md
```

## 14. 推荐开发顺序

1. 先建 Prisma 模型和种子数据。
2. 再做后端只读查询接口。
3. 再做后台维护 CRUD 和发布。
4. 再做管理端行业数据后台。
5. 再做 Ami_Core 采用项目和 BOM。
6. 再做服务扣耗、利润、AI/终端联动验证。
7. 最后补供应链占位接口和验收文档。

不要先做复杂页面，也不要先接供应链。首版成功标准是行业模板能真实进入 Ami_Core 的项目、商品、BOM 和经营数据链路。

## 15. 2026-06-21 执行状态更新

本轮已按本计划完成阶段 4 的代码链路验收，交付状态如下：

| 范围 | 状态 | 说明 |
| --- | --- | --- |
| 行业模板采用 | 已完成 | 服务模板可事务创建本地 `Project`、`Product`、`ProjectBomItem` 和 `IndustryAdoptionRecord`，并支持 BOM 标准品手动映射已有商品 |
| 项目 BOM 进入服务扣耗 | 已验证 | 项目订单 paid 后按本地 `ProjectBomItem` 生成 `StockMovement`，不直接依赖行业模板表 |
| 项目 BOM 进入经营利润 | 已验证 | 经营利润优先使用实际耗材流水，无实耗时回退本地 BOM，缺 BOM 时返回 `missing_bom` |
| 终端服务准备 | 已验证 | `TerminalService.getProjectBom(projectId)` 从本地项目 BOM 返回耗材清单，供 Ami Aura Lite 服务准备使用 |
| AI 已发布知识读取 | 已完成 | `AiService.generateTerminalServiceAdvice` 已接入 `IndustryService.findKnowledgeItems(..., true)`，只读取已审核行业知识作为上下文 |
| 行业种子 dry-run | 已验证 | 种子数据自检通过：产品模板 7、服务模板 3、BOM 明细 11、薪酬模板 2、知识条目 3 |
| 真实写库 | 待授权 | 当前数据库尚未应用行业平台迁移，`db:seed:industry-mvp:verify` 返回 `migration_required`；需要确认目标库后执行迁移和真实种子写入 |

本轮新增验证命令：

```powershell
Set-Location "D:\AI coding\beauty-salon-admin\packages\server-v2"
npm.cmd run test -- src/industry/industry.service.spec.ts
npm.cmd run test -- src/orders/orders.service.spec.ts
npm.cmd run test -- src/operation-profit/operation-profit.service.spec.ts
npm.cmd run test -- src/terminal/terminal.service.spec.ts
npm.cmd run test -- src/ai/ai.service.spec.ts
npm.cmd run db:seed:industry-mvp:dry-run
npm.cmd run db:seed:industry-mvp:verify
```

真实库收口需要单独授权执行：

```powershell
Set-Location "D:\AI coding\beauty-salon-admin\packages\server-v2"
npm.cmd run db:migrate
npm.cmd run db:seed:industry-mvp
npm.cmd run db:seed:industry-mvp:verify
```
