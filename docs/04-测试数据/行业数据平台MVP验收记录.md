# 行业数据平台 MVP 验收记录

更新时间：2026-06-21

## 1. 验收结论

当前已完成行业数据平台 MVP 的可运行闭环：

- 行业数据独立后端域 `/industry/*` 已建立。
- 行业服务模板、标准商品/耗品、项目 BOM、知识库、薪酬、数据源、采用记录和供应链预留模型已建立。
- Ami_Core 管理端已有行业数据平台入口，可查看并维护模板、BOM、知识、薪酬、数据源，且可查看采用记录和供应链预留状态。
- 项目新增弹窗可从行业服务模板创建本地项目、商品/耗品和项目 BOM，并支持 BOM 标准品自动创建或手动映射已有本地商品。
- 产品档案页可从行业标准品创建本地商品/耗品。
- 提成规则页可引用行业薪酬参考。
- 供应链平台未进入本期实现，只保留映射键、映射状态和占位接口。

结论：MVP 核心链路和管理端运营维护入口已通过代码级和构建级验收；真实写库种子验收、服务扣耗/经营利润/终端/AI 的联动验收属于下一轮增强。

## 2. 产品验收

| 验收项 | 结果 | 说明 |
| --- | --- | --- |
| 行业数据平台能维护服务模板、标准品、BOM、薪酬和知识 | 通过 | 后端已提供 CRUD/发布接口；管理端工作台已支持服务模板、标准品、BOM、知识、薪酬、数据源的新增、编辑、保存和发布 |
| 模板数量不作为硬性验收 | 通过 | 已按“成熟市场场景覆盖”作为口径，种子脚本不再以固定数量作为验收口径 |
| 可采用服务模板具备建议价、建议时长、适用人群、禁忌和 SOP 摘要 | 部分通过 | 数据模型和种子入口已支持；管理端采用预览当前展示建议价、时长、BOM、版本和 BOM 明细，适用人群/禁忌/SOP 预览待补 |
| 纳入首版的服务模板原则上配置 BOM | 通过 | 行业 BOM 模型、保存/发布接口和 Ami_Core 采用链路已建立 |
| 每个 BOM 项引用标准商品/耗品模板 | 通过 | `IndustryProjectBomItemTemplate.productTemplateId` 已作为标准品引用 |
| Ami_Core 能采用模板生成本地项目、商品和 BOM | 通过 | `/industry/service-templates/{id}/adopt-project` 事务创建本地 `Project`、`Product`、`ProjectBomItem` 和采用记录 |
| 采用后的门店项目可调整，不被行业模板自动覆盖 | 通过 | 采用后保存本地快照，行业模板更新不自动覆盖门店项目 |
| 服务扣耗、经营利润、AI/终端建议读取采用后的本地 BOM 或知识 | 部分通过 | 采用结果写入现有 `ProjectBomItem`；服务扣耗/利润/终端/AI 的真实联动验收待下一轮 |

## 3. 技术验收

| 验收项 | 结果 | 说明 |
| --- | --- | --- |
| 新增模型迁移可执行 | 通过 | 已新增 `20260621033000_industry_data_platform` 迁移 |
| API 权限、门店隔离和发布状态过滤正确 | 通过 | Controller 已挂 `core:industry:*`、门店项目/商品权限和已发布过滤 |
| 未发布模板不会出现在采用接口 | 通过 | 采用列表按已发布模板查询，服务端采用前也校验模板状态 |
| 采用流程失败不会产生半成品数据 | 通过 | 服务模板采用项目和 BOM 使用后端事务 |
| 供应链占位接口返回清晰状态 | 通过 | 供应链映射接口返回 `not_connected`，不伪造供应商 SKU、报价或采购能力 |
| 构建、单测、lint 通过 | 通过 | 管理端构建、定向测试、lint、`check:api` 与 supply-platform 定向测试已通过；lint 仅剩既有 warning |

## 4. 本轮验证命令

```powershell
Set-Location "D:\AI coding\beauty-salon-admin\packages\server-v2"
npm.cmd run build
npm.cmd run test
npm.cmd run test -- src/supply-platform/supply-platform.service.spec.ts

Set-Location "D:\AI coding\beauty-salon-admin"
npm.cmd run build
npm.cmd run test -- src/test/permissions.test.ts src/test/api.test.ts
npm.cmd run lint
npm.cmd run check:api
git diff --check -- docs/api-contract.md "docs/03-开发计划/美业行业数据平台MVP详细开发计划.md" packages/server-v2/src/industry/dto/industry.dto.ts packages/server-v2/src/industry/industry.service.ts src/app/components/AddProjectDialog.tsx src/types/industry.ts
```

## 5. 待下一轮增强

| 优先级 | 事项 | 交付影响 |
| --- | --- | --- |
| P0 | 服务扣耗、经营利润、终端/AI 读取采用后项目 BOM 的真实数据验收 | 证明行业 BOM 不只创建成功，还进入经营闭环 |
| P0 | 行业 MVP 种子脚本真实写库验收 | 验证初始化行业模板能落入本地数据库并被管理端采用 |
| P1 | 项目模板采用预览补适用人群、禁忌、SOP 摘要 | 店长采用前判断更充分 |
| P1 | 模板筛选增强 | 提升大模板量下的运营效率 |

## 6. 2026-06-21 补充验收结果

本轮已按开发计划补齐行业数据平台 MVP 的 P0 联动验收。当前结论调整为：**代码链路、管理端采用、BOM 扣耗、经营利润、终端服务准备、AI 已发布知识读取均已通过测试验证；真实数据库初始化还需要先执行行业平台迁移，再执行种子写库。**

| 验收项 | 结果 | 证据 |
| --- | --- | --- |
| 行业模板采用生成本地项目、商品和 BOM | 通过 | `packages/server-v2/src/industry/industry.service.spec.ts` 已覆盖自动创建商品和手动映射已有商品两种采用方式 |
| 项目订单服务扣耗读取本地 BOM | 通过 | `packages/server-v2/src/orders/orders.service.spec.ts` 已覆盖 paid 项目订单按 `ProjectBomItem` 写入 `StockMovement` |
| 经营利润读取本地 BOM 和实耗流水 | 通过 | `packages/server-v2/src/operation-profit/operation-profit.service.spec.ts` 已覆盖 `missing_bom`、BOM 估算和实际耗材流水归因 |
| 终端服务准备读取本地 BOM | 通过 | `packages/server-v2/src/terminal/terminal.service.spec.ts` 已新增 `returns project BOM items for service preparation` |
| AI Gateway 只读取已发布行业知识 | 通过 | `packages/server-v2/src/ai/ai.service.spec.ts` 已新增用例，确认终端服务建议调用 `IndustryService.findKnowledgeItems(..., true)` |
| 行业 MVP 种子数据自检 | 通过 | `npm.cmd run db:seed:industry-mvp:dry-run` 返回产品模板 7、服务模板 3、BOM 明细 11、薪酬模板 2、知识条目 3，重复编码和缺失 BOM 引用均为 0 |
| 真实数据库行业表验收 | 待授权执行 | `npm.cmd run db:seed:industry-mvp:verify` 返回 `migration_required`，当前库缺少 `public.IndustryDataSource` 表；需先执行 Prisma 迁移后再真实写入种子 |

本轮新增/补充验证命令：

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

真实写库收口步骤：

```powershell
Set-Location "D:\AI coding\beauty-salon-admin\packages\server-v2"
npm.cmd run db:migrate
npm.cmd run db:seed:industry-mvp
npm.cmd run db:seed:industry-mvp:verify
```

说明：以上三条会改动本地数据库结构和数据，需在确认目标数据库后执行。

## 7. 2026-06-21 行业成熟标准模板包真实录入结果

已按“服务模板、BOM 模板、标准商品/耗品、薪酬模板、知识库先按行业成熟标准录入一套”的要求完成真实写库。本次录入不是固定 50/100 数量口径，而是按生活美容门店首期可配置场景覆盖：基础面护、功效面护、仪器护理、身体护理、头皮护理、美睫、美甲、一次性卫生耗材、零售搭配商品、服务 SOP、禁忌、卫生安全、销售话术和岗位薪酬。

| 数据对象 | 已录入数量 | 说明 |
| --- | ---: | --- |
| 服务项目模板 | 12 | 覆盖补水、敏感修护、小气泡、亮肤、射频、痘肌、肩颈、背部、芳疗、头皮、美睫、美甲 |
| 项目 BOM 模板 | 12 | 每个服务模板均已配置已发布 BOM |
| BOM 明细 | 53 | 每个 BOM 明细均引用标准商品/耗品模板 |
| 标准商品/耗品 | 24 | 覆盖院装护肤耗品、仪器耗材、头皮耗品、美睫美甲耗材、一次性耗材、零售护肤商品 |
| 岗位薪酬模板 | 6 | 覆盖美容师、高级美容师、美容顾问、店长、前台/收银、美睫美甲师 |
| 服务知识库 | 13 | 覆盖 SOP、禁忌、卫生安全、产品知识、销售话术、培训要点 |

真实执行命令：

```powershell
Set-Location "D:\AI coding\beauty-salon-admin\packages\server-v2"
npm.cmd run db:migrate:prod
npm.cmd run db:seed:industry-mvp
npm.cmd run db:seed:industry-mvp:verify
```

写库验收结果：

```json
{
  "dataSourceReady": true,
  "productTemplates": 24,
  "serviceTemplates": 12,
  "publishedBomTemplates": 12,
  "bomItems": 53,
  "salaryBenchmarks": 6,
  "knowledgeItems": 13
}
```

补充验证：

```powershell
npm.cmd run db:seed:industry-mvp:dry-run
npm.cmd run build
npm.cmd run test -- src/industry/industry.service.spec.ts
npm.cmd run test -- src/ai/ai.service.spec.ts
```

说明：当前目标库为 `packages/server-v2/.env` 中 `DATABASE_URL` 指向的 PostgreSQL。管理端页面如果仍显示 0，优先刷新页面或确认当前后端服务连接的是同一个数据库。

## 8. 2026-06-21 管理端服务消耗与 BOM 数据修正

已按管理端 `http://localhost:5173/inventory/consumption` 的真实数据源核对。该页面调用 `/bom/services`，后端当前读取所有未删除的本地 `Project` 和 `ProjectBomItem`，不是直接读取行业平台模板。只看截图会漏项；本次按接口真实返回范围处理。

页面当前项目数量：15 个，全部属于 `Ami 全量演示门店`。

| 项目 | 更新后 BOM 数 |
| --- | ---: |
| 精华导入护理 | 4 |
| 全身精油 SPA | 3 |
| 头皮舒缓养护 | 4 |
| 手部细嫩护理 | 4 |
| 眼周紧致护理 | 4 |
| 晒后舒缓修护 | 4 |
| 胶原焕活提拉 | 4 |
| 季节屏障养护 | 4 |
| 小气泡清洁护理 | 4 |
| 肩颈舒压养护 | 2 |
| 紧致抗衰护理 | 4 |
| 亮肤淡斑管理 | 4 |
| 水氧清洁焕肤 | 4 |
| 敏感肌舒缓修护 | 4 |
| 深层补水护理 | 5 |

本次修正动作：

- 在行业数据平台补齐这些项目的已发布服务模板和已发布 BOM 模板。
- 行业标准品扩展到 34 个，服务模板扩展到 24 个，行业 BOM 明细扩展到 100 条。
- 新增同步脚本 `packages/server-v2/prisma/sync-industry-bom-to-core.ts`。
- 将行业平台对应模板下发到本地 `Project` 和 `ProjectBomItem`，覆盖原先不准确的本地 BOM。
- 本次没有新增页面项目，更新现有 15 个项目；本地 BOM 从每项 3 条的示例数据改为按行业模板生成，共 58 条。

真实执行命令：

```powershell
Set-Location "D:\AI coding\beauty-salon-admin\packages\server-v2"
npm.cmd run db:seed:industry-mvp
npm.cmd run industry-bom:sync:dry-run -- --store-name="Ami 全量演示门店"
npm.cmd run industry-bom:sync -- --store-name="Ami 全量演示门店"
npm.cmd run industry-bom:sync:verify -- --store-name="Ami 全量演示门店"
```

写库结果：

```json
{
  "projectsCreated": 0,
  "projectsUpdated": 15,
  "bomItemsWritten": 58,
  "productsCreated": 24,
  "productsReused": 34
}
```

同步验收结果：

```json
{
  "templates": 15,
  "complete": true,
  "totalBomItems": 58
}
```

补充验证：

```powershell
npm.cmd run db:seed:industry-mvp:verify
npm.cmd run test -- src/bom/bom.service.spec.ts
```

说明：页面刷新后应显示 15 个项目，并按上述 BOM 数显示。若页面仍显示旧数据，优先重启 `server-v2` 或确认当前前端代理访问的后端连接的是同一个 `DATABASE_URL`。
