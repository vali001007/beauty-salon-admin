# 经营利润项目 BOM 缺口确认清单

生成日期：2026-06-20
目标门店：`storeId=6`，Ami 全量演示门店
统计周期：2026-06-01 至 2026-06-30
数据来源：真实 Supabase 目标库，只读审计

---

## 1. 审计命令

```powershell
npm.cmd --prefix packages/server-v2 run operation-profit:bom-audit -- --storeId=6 --from=2026-06-01 --to=2026-06-30
```

该脚本只读，不会创建或更新 `ProjectBomItem`。

---

## 2. 当前结论

```text
missingBomItems=3
missingProjectCount=1
missingProjectsWithTemplateCandidates=1
candidateTemplateProjectCount=5
relatedStockMovementCount=0
```

这 3 条不是普通“项目有档案但没配 BOM”，而是订单明细 `itemType=project` 的 `itemId=101` 在项目表找不到对应项目。

进一步诊断：

```text
identity.status=project_not_found
identity.reason=项目 ID 101 在项目表不存在，但商品表存在同 ID 商品：术后舒缓喷雾
sameIdProduct=术后舒缓喷雾 / SKU AMI-DEMO-FULL-SKU-020 / 成本 82 / 零售价 178
```

产品影响：

- 项目毛利不能把这 3 条订单误认为“有项目但暂缺耗材”，因为项目档案本身不存在。
- 不能直接给项目 `101` 补 BOM；当前项目表没有这个项目，直接写 `ProjectBomItem(projectId=101)` 会失败或写到错误对象。
- 这 3 条历史项目订单应先确认真实项目名称，再决定是修历史订单明细的 `itemId/name`，还是标记为历史异常数据。

---

## 3. 缺口订单明细

| 订单号 | 订单明细 ID | 订单 ID | 客户 | 订单时间 | itemType | itemId | 页面名称 | 收入 | 当前问题 |
| --- | ---: | ---: | --- | --- | --- | ---: | --- | ---: | --- |
| `POMQ9BJ8AF` | 1087 | 851 | 李伟明 | 2026-06-11 09:51 | project | 101 | `??????` | 398 | 项目 ID 不存在，且同 ID 是商品“术后舒缓喷雾” |
| `POMQ9BTF20` | 1088 | 852 | 李伟明 | 2026-06-11 09:59 | project | 101 | `??????` | 398 | 项目 ID 不存在，且同 ID 是商品“术后舒缓喷雾” |
| `POMQ9C1NIU` | 1089 | 853 | 客户名异常 | 2026-06-11 10:06 | project | 101 | `??????` | 398 | 项目 ID 不存在，且同 ID 是商品“术后舒缓喷雾” |

合计项目收入：1194。

---

## 4. 可参考但不能自动套用的 BOM 模板

脚本基于项目价格接近度和已有 BOM 输出了 5 个参考模板。由于缺口项目没有真实项目档案和项目分类，这些模板只能作为业务确认线索，不能自动写入。

| 参考项目 ID | 参考项目 | 类型 | 价格 | 估算耗材成本 | 参考分 | 参考原因 |
| ---: | --- | --- | ---: | ---: | ---: | --- |
| 79 | 季节屏障养护 | 面部护理 | 428 | 2154 | 55 | 价格差异 7.5%，项目启用中，已有 BOM |
| 74 | 水氧清洁焕肤 | 仪器护理 | 368 | 2024 | 55 | 价格差异 7.5%，项目启用中，已有 BOM |
| 73 | 敏感肌舒缓修护 | 面部护理 | 398 | 1002 | 55 | 价格相同，项目启用中，已有 BOM |
| 86 | 精华导入护理 | 仪器护理 | 458 | 1736 | 45 | 价格差异 15.1%，项目启用中，已有 BOM |
| 84 | 头皮舒缓养护 | 头皮护理 | 338 | 1176 | 45 | 价格差异 15.1%，项目启用中，已有 BOM |

最像价格口径的参考项目是 `73 敏感肌舒缓修护`，价格同为 398，BOM 如下：

| 商品 ID | 商品 | SKU | 标准用量 | 单位 | 成本单价 | 估算成本 |
| ---: | --- | --- | ---: | --- | ---: | ---: |
| 83 | 舒缓修护面膜 | `AMI-DEMO-FULL-SKU-002` | 1 | 盒 | 86 | 86 |
| 87 | 屏障修护乳 | `AMI-DEMO-FULL-SKU-006` | 4 | 瓶 | 136 | 544 |
| 95 | 屏障安瓶精华 | `AMI-DEMO-FULL-SKU-014` | 2 | 盒 | 186 | 372 |

该模板估算耗材成本为 1002，高于单次收入 398。如果业务确认这 3 条确实是该类项目，项目毛利会显示亏损或异常，需要进一步核对 BOM 标准用量是否代表“单次用量”。

---

## 5. 需要业务确认的问题

请业务在下面 3 个选项中选择一种，不建议直接执行数据库写入：

| 选项 | 处理方式 | 是否写库 | 影响 |
| --- | --- | --- | --- |
| A | 确认这 3 条订单真实对应已有项目，例如 `73 敏感肌舒缓修护` | 是，需修历史 `OrderItem.itemId/name` 并再跑提成/BOM 复验 | 项目毛利可以进入正常 BOM 估算或实耗归因 |
| B | 确认这 3 条订单对应一个历史项目，但当前项目档案已缺失 | 是，需先补项目档案和标准 BOM，再修历史订单明细 | 项目毛利可以解释，但需要补业务主数据 |
| C | 确认为历史异常订单，不修主数据 | 否 | 项目毛利继续标记 `missing_bom` / `project_not_found`，不作为项目经营判断样本 |

当前确认状态：

```text
confirmedBy=pending_business_confirmation
resolution=pending_business_confirmation
```

---

## 6. 候选修复 JSON 和 dry-run

已输出候选文件：

```text
docs/04-测试数据/operation-profit-project-master-candidates.pending.json
```

候选方案是把 3 条历史异常项目订单明细暂按 `73 敏感肌舒缓修护` 作为目标项目，因为该项目价格同为 398 且已有 BOM。该方案只是候选，不代表业务确认。

业务确认时必须在候选 JSON 里选择一种 `resolution`：

| resolution | 含义 | 是否进入 `project-master-backfill` |
| --- | --- | --- |
| `repair_project` | 确认修历史订单明细到目标项目，例如 `73 敏感肌舒缓修护` | 是 |
| `historical_exception` | 确认项目身份无法追溯，保留历史异常，不修 `OrderItem.itemId/name` | 否 |

已另存历史异常示例：

```text
docs/04-测试数据/operation-profit-project-master-historical-exception.example.json
```

dry-run 命令：

```powershell
npm.cmd --prefix packages/server-v2 run operation-profit:project-master-backfill -- --storeId=6 --from=2026-06-01 --to=2026-06-30 --file=docs/04-测试数据/operation-profit-project-master-candidates.pending.json
```

安全边界：

- 默认只 dry-run，不写库。
- 真正写库必须同时传 `--apply --yes --storeId=6`。
- `confirmedBy=pending_business_confirmation` 时，即使误传 `--apply --yes`，脚本也会跳过并输出 `skippedUnconfirmedBusinessApproval`。
- `resolution=historical_exception` 的记录不会进入 `project-master-backfill` 写回计划。
- 写库前必须由业务确认真实项目身份；不能只因为价格相同就修历史订单。

---

## 7. 下一步执行建议

1. 业务先确认 3 条 `itemId=101` 的真实项目身份。
2. 如果选择 A 或 B，设置 `resolution=repair_project` 并先输出 dry-run 修复计划，不直接写库。
3. 如果选择 C，设置 `resolution=historical_exception`，只进入统一确认预检，不执行项目档案写回。
4. 修复历史订单明细或补项目档案/BOM 后，重跑：

```powershell
npm.cmd --prefix packages/server-v2 run operation-profit:bom-audit -- --storeId=6 --from=2026-06-01 --to=2026-06-30
npm.cmd --prefix packages/server-v2 run operation-profit:readiness -- --storeId=6 --periodMonth=2026-06 --from=2026-06-01 --to=2026-06-30
```

5. 若选择历史异常，`project_master_data` 可继续为 warn，但必须在确认包和页面验收记录中说明这 3 条不作为项目经营判断样本。
