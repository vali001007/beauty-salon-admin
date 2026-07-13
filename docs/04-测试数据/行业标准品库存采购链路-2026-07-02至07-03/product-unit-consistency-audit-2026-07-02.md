# 产品规格/包装/库存单位一致性巡检报告

生成时间：2026-07-02T16:11:44.009Z

验收范围：Ami 全量演示门店（ID 6）

## 1. 汇总

| 检查项 | 数量 |
| --- | --- |
| 有效产品 | 46 |
| BOM 明细 | 69 |
| 库存流水 | 452 |
| 抽样商品销售明细 | 200 |
| 产品规格/包装字段缺失 | 0 |
| BOM 单位与规格单位不一致 | 1 |
| 库存流水单位缺失或不一致 | 255 |
| 商品销售单位口径待确认 | 200 |

### 1.1 销售口径证据汇总

| 检查项 | 数量 |
| --- | --- |
| 抽样商品销售明细 | 200 |
| 订单明细未固化单位 | 200 |
| 可关联销售出库流水的订单明细 | 45 |
| 未关联销售出库流水的订单明细 | 155 |
| 销售出库按包装单位落库 | 45 |
| 销售出库按规格单位落库 | 0 |
| 销售出库单位缺失/其他 | 0 |

### 1.2 库存流水单位关系 Top 20

| 流水类型 | 来源 | 单位关系 | 数量 |
| --- | --- | --- | --- |
| service_consume | project_order | 规格单位 | 89 |
| service_consume | card_usage | 规格单位 | 69 |
| service_consume | project_order | 包装单位 | 46 |
| sale_out | product_order | 包装单位 | 45 |
| inbound | seed_batch | 包装单位 | 40 |
| service_consumption | seed_demo | 包装单位 | 40 |
| stock_adjustment | seed_demo | 包装单位 | 40 |
| service_consume | card_usage | 包装单位 | 18 |
| inbound | purchase_order | 规格单位 | 17 |
| inventory_adjustment | inventory_negative_stock_repair | 规格单位 | 11 |
| inbound | purchase_order | 包装单位 | 10 |
| stocktake_gain | business_interface_acceptance | 规格单位 | 10 |
| inbound | stock_batch | 包装单位 | 6 |
| scrap_out | inventory_adjustment | 包装单位 | 6 |
| manual_outbound | inventory_adjustment | 包装单位 | 2 |
| transfer_out | transfer_order | 包装单位 | 2 |
| inbound | stock_batch | 规格单位 | 1 |

## 2. 产品字段缺失

未发现产品规格/包装字段缺失。

## 3. BOM 单位异常

| BOM项ID | 项目 | 产品 | SKU | BOM单位 | 产品规格单位 | 包装 | 建议 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 353 | 亮肤淡斑管理 | 日间防晒乳 | IND-6-STD-RETAIL-SUNSCREEN-001 | 支 | ml | 支 | 服务 BOM 建议使用产品规格单位；若确需按包装扣耗，应补包装换算规则。 |

## 4. 库存流水单位异常

| 流水ID | 类型 | 来源 | 产品 | SKU | 流水单位 | 规格单位 | 包装 | 建议 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 86 | inbound | seed_batch | 玻尿酸保湿精华 | AMI-DEMO-FULL-SKU-001 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 87 | inbound | seed_batch | 玻尿酸保湿精华 | AMI-DEMO-FULL-SKU-001 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 88 | service_consumption | seed_demo | 玻尿酸保湿精华 | AMI-DEMO-FULL-SKU-001 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 89 | stock_adjustment | seed_demo | 玻尿酸保湿精华 | AMI-DEMO-FULL-SKU-001 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 90 | service_consumption | seed_demo | 玻尿酸保湿精华 | AMI-DEMO-FULL-SKU-001 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 91 | stock_adjustment | seed_demo | 玻尿酸保湿精华 | AMI-DEMO-FULL-SKU-001 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 92 | inbound | seed_batch | 舒缓修护面膜 | AMI-DEMO-FULL-SKU-002 | 盒 | 片 | 盒 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 93 | inbound | seed_batch | 舒缓修护面膜 | AMI-DEMO-FULL-SKU-002 | 盒 | 片 | 盒 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 94 | service_consumption | seed_demo | 舒缓修护面膜 | AMI-DEMO-FULL-SKU-002 | 盒 | 片 | 盒 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 95 | stock_adjustment | seed_demo | 舒缓修护面膜 | AMI-DEMO-FULL-SKU-002 | 盒 | 片 | 盒 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 96 | service_consumption | seed_demo | 舒缓修护面膜 | AMI-DEMO-FULL-SKU-002 | 盒 | 片 | 盒 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 97 | stock_adjustment | seed_demo | 舒缓修护面膜 | AMI-DEMO-FULL-SKU-002 | 盒 | 片 | 盒 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 98 | inbound | seed_batch | 氨基酸洁面乳 | AMI-DEMO-FULL-SKU-003 | 支 | ml | 支 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 99 | inbound | seed_batch | 氨基酸洁面乳 | AMI-DEMO-FULL-SKU-003 | 支 | ml | 支 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 100 | service_consumption | seed_demo | 氨基酸洁面乳 | AMI-DEMO-FULL-SKU-003 | 支 | ml | 支 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 101 | stock_adjustment | seed_demo | 氨基酸洁面乳 | AMI-DEMO-FULL-SKU-003 | 支 | ml | 支 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 102 | service_consumption | seed_demo | 氨基酸洁面乳 | AMI-DEMO-FULL-SKU-003 | 支 | ml | 支 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 103 | stock_adjustment | seed_demo | 氨基酸洁面乳 | AMI-DEMO-FULL-SKU-003 | 支 | ml | 支 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 104 | inbound | seed_batch | 烟酰胺亮肤精华 | AMI-DEMO-FULL-SKU-004 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 105 | inbound | seed_batch | 烟酰胺亮肤精华 | AMI-DEMO-FULL-SKU-004 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 106 | service_consumption | seed_demo | 烟酰胺亮肤精华 | AMI-DEMO-FULL-SKU-004 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 107 | stock_adjustment | seed_demo | 烟酰胺亮肤精华 | AMI-DEMO-FULL-SKU-004 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 108 | service_consumption | seed_demo | 烟酰胺亮肤精华 | AMI-DEMO-FULL-SKU-004 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 109 | stock_adjustment | seed_demo | 烟酰胺亮肤精华 | AMI-DEMO-FULL-SKU-004 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 110 | inbound | seed_batch | 抗衰紧致眼霜 | AMI-DEMO-FULL-SKU-005 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 111 | inbound | seed_batch | 抗衰紧致眼霜 | AMI-DEMO-FULL-SKU-005 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 112 | service_consumption | seed_demo | 抗衰紧致眼霜 | AMI-DEMO-FULL-SKU-005 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 113 | stock_adjustment | seed_demo | 抗衰紧致眼霜 | AMI-DEMO-FULL-SKU-005 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 114 | service_consumption | seed_demo | 抗衰紧致眼霜 | AMI-DEMO-FULL-SKU-005 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 115 | stock_adjustment | seed_demo | 抗衰紧致眼霜 | AMI-DEMO-FULL-SKU-005 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 116 | inbound | seed_batch | 屏障修护乳 | AMI-DEMO-FULL-SKU-006 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 117 | inbound | seed_batch | 屏障修护乳 | AMI-DEMO-FULL-SKU-006 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 118 | service_consumption | seed_demo | 屏障修护乳 | AMI-DEMO-FULL-SKU-006 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 119 | stock_adjustment | seed_demo | 屏障修护乳 | AMI-DEMO-FULL-SKU-006 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 120 | service_consumption | seed_demo | 屏障修护乳 | AMI-DEMO-FULL-SKU-006 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 121 | stock_adjustment | seed_demo | 屏障修护乳 | AMI-DEMO-FULL-SKU-006 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 122 | inbound | seed_batch | 水氧护理耗材包 | AMI-DEMO-FULL-SKU-007 | 盒 | 套 | 盒 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 123 | inbound | seed_batch | 水氧护理耗材包 | AMI-DEMO-FULL-SKU-007 | 盒 | 套 | 盒 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 124 | service_consumption | seed_demo | 水氧护理耗材包 | AMI-DEMO-FULL-SKU-007 | 盒 | 套 | 盒 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 125 | stock_adjustment | seed_demo | 水氧护理耗材包 | AMI-DEMO-FULL-SKU-007 | 盒 | 套 | 盒 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 126 | service_consumption | seed_demo | 水氧护理耗材包 | AMI-DEMO-FULL-SKU-007 | 盒 | 套 | 盒 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 127 | stock_adjustment | seed_demo | 水氧护理耗材包 | AMI-DEMO-FULL-SKU-007 | 盒 | 套 | 盒 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 128 | inbound | seed_batch | 一次性护理巾 | AMI-DEMO-FULL-SKU-008 | 包 | 片 | 包 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 129 | inbound | seed_batch | 一次性护理巾 | AMI-DEMO-FULL-SKU-008 | 包 | 片 | 包 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 130 | service_consumption | seed_demo | 一次性护理巾 | AMI-DEMO-FULL-SKU-008 | 包 | 片 | 包 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 131 | stock_adjustment | seed_demo | 一次性护理巾 | AMI-DEMO-FULL-SKU-008 | 包 | 片 | 包 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 132 | service_consumption | seed_demo | 一次性护理巾 | AMI-DEMO-FULL-SKU-008 | 包 | 片 | 包 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 133 | stock_adjustment | seed_demo | 一次性护理巾 | AMI-DEMO-FULL-SKU-008 | 包 | 片 | 包 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 134 | inbound | seed_batch | 胶原蛋白面膜 | AMI-DEMO-FULL-SKU-009 | 盒 | 片 | 盒 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 135 | inbound | seed_batch | 胶原蛋白面膜 | AMI-DEMO-FULL-SKU-009 | 盒 | 片 | 盒 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 136 | service_consumption | seed_demo | 胶原蛋白面膜 | AMI-DEMO-FULL-SKU-009 | 盒 | 片 | 盒 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 137 | stock_adjustment | seed_demo | 胶原蛋白面膜 | AMI-DEMO-FULL-SKU-009 | 盒 | 片 | 盒 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 138 | service_consumption | seed_demo | 胶原蛋白面膜 | AMI-DEMO-FULL-SKU-009 | 盒 | 片 | 盒 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 139 | stock_adjustment | seed_demo | 胶原蛋白面膜 | AMI-DEMO-FULL-SKU-009 | 盒 | 片 | 盒 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 140 | inbound | seed_batch | 清透防晒乳 | AMI-DEMO-FULL-SKU-010 | 支 | ml | 支 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 141 | inbound | seed_batch | 清透防晒乳 | AMI-DEMO-FULL-SKU-010 | 支 | ml | 支 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 142 | service_consumption | seed_demo | 清透防晒乳 | AMI-DEMO-FULL-SKU-010 | 支 | ml | 支 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 143 | stock_adjustment | seed_demo | 清透防晒乳 | AMI-DEMO-FULL-SKU-010 | 支 | ml | 支 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 144 | service_consumption | seed_demo | 清透防晒乳 | AMI-DEMO-FULL-SKU-010 | 支 | ml | 支 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 145 | stock_adjustment | seed_demo | 清透防晒乳 | AMI-DEMO-FULL-SKU-010 | 支 | ml | 支 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 146 | inbound | seed_batch | 紧致颈霜 | AMI-DEMO-FULL-SKU-011 | 瓶 | g | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 147 | inbound | seed_batch | 紧致颈霜 | AMI-DEMO-FULL-SKU-011 | 瓶 | g | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 148 | service_consumption | seed_demo | 紧致颈霜 | AMI-DEMO-FULL-SKU-011 | 瓶 | g | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 149 | stock_adjustment | seed_demo | 紧致颈霜 | AMI-DEMO-FULL-SKU-011 | 瓶 | g | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 150 | service_consumption | seed_demo | 紧致颈霜 | AMI-DEMO-FULL-SKU-011 | 瓶 | g | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 151 | stock_adjustment | seed_demo | 紧致颈霜 | AMI-DEMO-FULL-SKU-011 | 瓶 | g | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 152 | inbound | seed_batch | 舒缓精油 | AMI-DEMO-FULL-SKU-012 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 153 | inbound | seed_batch | 舒缓精油 | AMI-DEMO-FULL-SKU-012 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 154 | service_consumption | seed_demo | 舒缓精油 | AMI-DEMO-FULL-SKU-012 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 155 | stock_adjustment | seed_demo | 舒缓精油 | AMI-DEMO-FULL-SKU-012 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 156 | service_consumption | seed_demo | 舒缓精油 | AMI-DEMO-FULL-SKU-012 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 157 | stock_adjustment | seed_demo | 舒缓精油 | AMI-DEMO-FULL-SKU-012 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 158 | inbound | seed_batch | 水润柔肤水 | AMI-DEMO-FULL-SKU-013 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 159 | inbound | seed_batch | 水润柔肤水 | AMI-DEMO-FULL-SKU-013 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 160 | service_consumption | seed_demo | 水润柔肤水 | AMI-DEMO-FULL-SKU-013 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 161 | stock_adjustment | seed_demo | 水润柔肤水 | AMI-DEMO-FULL-SKU-013 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 162 | service_consumption | seed_demo | 水润柔肤水 | AMI-DEMO-FULL-SKU-013 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 163 | stock_adjustment | seed_demo | 水润柔肤水 | AMI-DEMO-FULL-SKU-013 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 164 | inbound | seed_batch | 屏障安瓶精华 | AMI-DEMO-FULL-SKU-014 | 盒 | 支 | 盒 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 165 | inbound | seed_batch | 屏障安瓶精华 | AMI-DEMO-FULL-SKU-014 | 盒 | 支 | 盒 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 166 | service_consumption | seed_demo | 屏障安瓶精华 | AMI-DEMO-FULL-SKU-014 | 盒 | 支 | 盒 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 167 | stock_adjustment | seed_demo | 屏障安瓶精华 | AMI-DEMO-FULL-SKU-014 | 盒 | 支 | 盒 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 168 | service_consumption | seed_demo | 屏障安瓶精华 | AMI-DEMO-FULL-SKU-014 | 盒 | 支 | 盒 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 169 | stock_adjustment | seed_demo | 屏障安瓶精华 | AMI-DEMO-FULL-SKU-014 | 盒 | 支 | 盒 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 170 | inbound | seed_batch | 清洁棉片 | AMI-DEMO-FULL-SKU-015 | 盒 | 片 | 盒 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 171 | inbound | seed_batch | 清洁棉片 | AMI-DEMO-FULL-SKU-015 | 盒 | 片 | 盒 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 172 | service_consumption | seed_demo | 清洁棉片 | AMI-DEMO-FULL-SKU-015 | 盒 | 片 | 盒 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 173 | stock_adjustment | seed_demo | 清洁棉片 | AMI-DEMO-FULL-SKU-015 | 盒 | 片 | 盒 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 174 | service_consumption | seed_demo | 清洁棉片 | AMI-DEMO-FULL-SKU-015 | 盒 | 片 | 盒 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 175 | stock_adjustment | seed_demo | 清洁棉片 | AMI-DEMO-FULL-SKU-015 | 盒 | 片 | 盒 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 176 | inbound | seed_batch | 舒压按摩膏 | AMI-DEMO-FULL-SKU-016 | 瓶 | g | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 177 | inbound | seed_batch | 舒压按摩膏 | AMI-DEMO-FULL-SKU-016 | 瓶 | g | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 178 | service_consumption | seed_demo | 舒压按摩膏 | AMI-DEMO-FULL-SKU-016 | 瓶 | g | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 179 | stock_adjustment | seed_demo | 舒压按摩膏 | AMI-DEMO-FULL-SKU-016 | 瓶 | g | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 180 | service_consumption | seed_demo | 舒压按摩膏 | AMI-DEMO-FULL-SKU-016 | 瓶 | g | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 181 | stock_adjustment | seed_demo | 舒压按摩膏 | AMI-DEMO-FULL-SKU-016 | 瓶 | g | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 182 | inbound | seed_batch | 仪器导入凝胶 | AMI-DEMO-FULL-SKU-017 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 183 | inbound | seed_batch | 仪器导入凝胶 | AMI-DEMO-FULL-SKU-017 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 184 | service_consumption | seed_demo | 仪器导入凝胶 | AMI-DEMO-FULL-SKU-017 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 185 | stock_adjustment | seed_demo | 仪器导入凝胶 | AMI-DEMO-FULL-SKU-017 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 186 | service_consumption | seed_demo | 仪器导入凝胶 | AMI-DEMO-FULL-SKU-017 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 187 | stock_adjustment | seed_demo | 仪器导入凝胶 | AMI-DEMO-FULL-SKU-017 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 188 | inbound | seed_batch | 滋养手膜 | AMI-DEMO-FULL-SKU-018 | 盒 | 片 | 盒 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 189 | inbound | seed_batch | 滋养手膜 | AMI-DEMO-FULL-SKU-018 | 盒 | 片 | 盒 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 190 | service_consumption | seed_demo | 滋养手膜 | AMI-DEMO-FULL-SKU-018 | 盒 | 片 | 盒 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 191 | stock_adjustment | seed_demo | 滋养手膜 | AMI-DEMO-FULL-SKU-018 | 盒 | 片 | 盒 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 192 | service_consumption | seed_demo | 滋养手膜 | AMI-DEMO-FULL-SKU-018 | 盒 | 片 | 盒 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 193 | stock_adjustment | seed_demo | 滋养手膜 | AMI-DEMO-FULL-SKU-018 | 盒 | 片 | 盒 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 194 | inbound | seed_batch | 头皮养护精华 | AMI-DEMO-FULL-SKU-019 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 195 | inbound | seed_batch | 头皮养护精华 | AMI-DEMO-FULL-SKU-019 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 196 | service_consumption | seed_demo | 头皮养护精华 | AMI-DEMO-FULL-SKU-019 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 197 | stock_adjustment | seed_demo | 头皮养护精华 | AMI-DEMO-FULL-SKU-019 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 198 | service_consumption | seed_demo | 头皮养护精华 | AMI-DEMO-FULL-SKU-019 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 199 | stock_adjustment | seed_demo | 头皮养护精华 | AMI-DEMO-FULL-SKU-019 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 200 | inbound | seed_batch | 术后舒缓喷雾 | AMI-DEMO-FULL-SKU-020 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 201 | inbound | seed_batch | 术后舒缓喷雾 | AMI-DEMO-FULL-SKU-020 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 202 | service_consumption | seed_demo | 术后舒缓喷雾 | AMI-DEMO-FULL-SKU-020 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 203 | stock_adjustment | seed_demo | 术后舒缓喷雾 | AMI-DEMO-FULL-SKU-020 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 204 | service_consumption | seed_demo | 术后舒缓喷雾 | AMI-DEMO-FULL-SKU-020 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |
| 205 | stock_adjustment | seed_demo | 术后舒缓喷雾 | AMI-DEMO-FULL-SKU-020 | 瓶 | ml | 瓶 | 库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。 |

## 5. 商品销售单位口径待确认

| 订单明细ID | 订单ID | 产品 | SKU | 数量 | 订单单位 | 销售出库单位 | 销售出库关系 | 规格单位 | 包装 | 建议 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1221 | 1064 | 烟酰胺亮肤精华 | AMI-DEMO-FULL-SKU-004 | 10 |  | 瓶 | 包装单位 | ml | 瓶 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1220 | 1064 | 氨基酸洁面乳 | AMI-DEMO-FULL-SKU-003 | 10 |  | 支 | 包装单位 | ml | 支 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1219 | 1063 | 抗衰紧致眼霜 | AMI-DEMO-FULL-SKU-005 | 7 |  | 瓶 | 包装单位 | ml | 瓶 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1215 | 1060 | 抗衰紧致眼霜 | AMI-DEMO-FULL-SKU-005 | 6 |  | 瓶 | 包装单位 | ml | 瓶 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1212 | 1056 | 烟酰胺亮肤精华 | AMI-DEMO-FULL-SKU-004 | 1 |  | 瓶 | 包装单位 | ml | 瓶 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1210 | 1054 | 玻尿酸保湿精华 | AMI-DEMO-FULL-SKU-001 | 1 |  | 瓶 | 包装单位 | ml | 瓶 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1207 | 1051 | 抗衰紧致眼霜 | AMI-DEMO-FULL-SKU-005 | 1 |  | 瓶 | 包装单位 | ml | 瓶 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1205 | 1049 | 日间防晒乳 | IND-6-STD-RETAIL-SUNSCREEN-001 | 1 |  |  | 无销售出库流水 | ml | 支 | 商品销售建议明确按包装销售还是按规格库存扣减；当前记录缺少包装/换算证据。 |
| 1202 | 1046 | 抗衰紧致眼霜 | AMI-DEMO-FULL-SKU-005 | 1 |  | 瓶 | 包装单位 | ml | 瓶 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1200 | 1044 | 抗衰紧致眼霜 | AMI-DEMO-FULL-SKU-005 | 1 |  |  | 无销售出库流水 | ml | 瓶 | 商品销售建议明确按包装销售还是按规格库存扣减；当前记录缺少包装/换算证据。 |
| 1197 | 1041 | 玻尿酸保湿精华 | AMI-DEMO-FULL-SKU-001 | 1 |  | 瓶 | 包装单位 | ml | 瓶 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1194 | 1038 | 玻尿酸保湿精华 | AMI-DEMO-FULL-SKU-001 | 1 |  | 瓶 | 包装单位 | ml | 瓶 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1192 | 1036 | 玻尿酸保湿精华 | AMI-DEMO-FULL-SKU-001 | 1 |  | 瓶 | 包装单位 | ml | 瓶 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1188 | 1032 | 玻尿酸保湿精华 | AMI-DEMO-FULL-SKU-001 | 1 |  | 瓶 | 包装单位 | ml | 瓶 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1186 | 1030 | 玻尿酸保湿精华 | AMI-DEMO-FULL-SKU-001 | 1 |  | 瓶 | 包装单位 | ml | 瓶 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1182 | 1026 | 水氧护理耗材包 | AMI-DEMO-FULL-SKU-007 | 1 |  | 盒 | 包装单位 | 套 | 盒 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1180 | 1024 | 抗衰紧致眼霜 | AMI-DEMO-FULL-SKU-005 | 2 |  | 瓶 | 包装单位 | ml | 瓶 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1179 | 1023 | 屏障修护乳 | AMI-DEMO-FULL-SKU-006 | 1 |  | 瓶 | 包装单位 | ml | 瓶 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1176 | 1020 | 烟酰胺亮肤精华 | AMI-DEMO-FULL-SKU-004 | 1 |  | 瓶 | 包装单位 | ml | 瓶 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1174 | 1018 | 玻尿酸保湿精华 | AMI-DEMO-FULL-SKU-001 | 1 |  | 瓶 | 包装单位 | ml | 瓶 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1173 | 1017 | 玻尿酸保湿精华 | AMI-DEMO-FULL-SKU-001 | 1 |  | 瓶 | 包装单位 | ml | 瓶 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1171 | 1015 | 玻尿酸保湿精华 | AMI-DEMO-FULL-SKU-001 | 1 |  | 瓶 | 包装单位 | ml | 瓶 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1169 | 1013 | 玻尿酸保湿精华 | AMI-DEMO-FULL-SKU-001 | 1 |  | 瓶 | 包装单位 | ml | 瓶 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1166 | 1010 | 氨基酸洁面乳 | AMI-DEMO-FULL-SKU-003 | 1 |  | 支 | 包装单位 | ml | 支 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1165 | 1009 | 氨基酸洁面乳 | AMI-DEMO-FULL-SKU-003 | 1 |  | 支 | 包装单位 | ml | 支 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1163 | 1007 | 氨基酸洁面乳 | AMI-DEMO-FULL-SKU-003 | 1 |  | 支 | 包装单位 | ml | 支 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1161 | 1005 | 氨基酸洁面乳 | AMI-DEMO-FULL-SKU-003 | 1 |  | 支 | 包装单位 | ml | 支 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1158 | 1002 | 氨基酸洁面乳 | AMI-DEMO-FULL-SKU-003 | 1 |  | 支 | 包装单位 | ml | 支 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1156 | 1000 | 氨基酸洁面乳 | AMI-DEMO-FULL-SKU-003 | 1 |  | 支 | 包装单位 | ml | 支 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1155 | 999 | 氨基酸洁面乳 | AMI-DEMO-FULL-SKU-003 | 1 |  | 支 | 包装单位 | ml | 支 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1154 | 998 | 氨基酸洁面乳 | AMI-DEMO-FULL-SKU-003 | 1 |  | 支 | 包装单位 | ml | 支 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1150 | 994 | 玻尿酸保湿精华 | AMI-DEMO-FULL-SKU-001 | 1 |  | 瓶 | 包装单位 | ml | 瓶 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1149 | 993 | 玻尿酸保湿精华 | AMI-DEMO-FULL-SKU-001 | 1 |  | 瓶 | 包装单位 | ml | 瓶 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1141 | 985 | 氨基酸洁面乳 | AMI-DEMO-FULL-SKU-003 | 1 |  | 支 | 包装单位 | ml | 支 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1136 | 980 | 抗衰紧致眼霜 | AMI-DEMO-FULL-SKU-005 | 1 |  | 瓶 | 包装单位 | ml | 瓶 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1134 | 978 | 水氧护理耗材包 | AMI-DEMO-FULL-SKU-007 | 1 |  | 盒 | 包装单位 | 套 | 盒 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1131 | 975 | 氨基酸洁面乳 | AMI-DEMO-FULL-SKU-003 | 1 |  | 支 | 包装单位 | ml | 支 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1120 | 877 | 抗衰紧致眼霜 | AMI-DEMO-FULL-SKU-005 | 1 |  | 瓶 | 包装单位 | ml | 瓶 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1119 | 876 | 玻尿酸保湿精华 | AMI-DEMO-FULL-SKU-001 | 1 |  | 瓶 | 包装单位 | ml | 瓶 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1117 | 875 | 抗衰紧致眼霜 | AMI-DEMO-FULL-SKU-005 | 1 |  | 瓶 | 包装单位 | ml | 瓶 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1115 | 874 | 屏障修护乳 | AMI-DEMO-FULL-SKU-006 | 1 |  | 瓶 | 包装单位 | ml | 瓶 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1111 | 871 | 玻尿酸保湿精华 | AMI-DEMO-FULL-SKU-001 | 1 |  | 瓶 | 包装单位 | ml | 瓶 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1102 | 862 | 烟酰胺亮肤精华 | AMI-DEMO-FULL-SKU-004 | 1 |  | 瓶 | 包装单位 | ml | 瓶 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1099 | 860 | 玻尿酸保湿精华 | AMI-DEMO-FULL-SKU-001 | 1 |  |  | 无销售出库流水 | ml | 瓶 | 商品销售建议明确按包装销售还是按规格库存扣减；当前记录缺少包装/换算证据。 |
| 1097 | 858 | 氨基酸洁面乳 | AMI-DEMO-FULL-SKU-003 | 1 |  | 支 | 包装单位 | ml | 支 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1092 | 855 | 抗衰紧致眼霜 | AMI-DEMO-FULL-SKU-005 | 1 |  | 瓶 | 包装单位 | ml | 瓶 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1079 | 843 | 屏障修护乳 | AMI-DEMO-FULL-SKU-006 | 1 |  | 瓶 | 包装单位 | ml | 瓶 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1075 | 839 | 滋养手膜 | AMI-DEMO-FULL-SKU-018 | 1 |  |  | 无销售出库流水 | 片 | 盒 | 商品销售建议明确按包装销售还是按规格库存扣减；当前记录缺少包装/换算证据。 |
| 1074 | 838 | 术后舒缓喷雾 | AMI-DEMO-FULL-SKU-020 | 1 |  |  | 无销售出库流水 | ml | 瓶 | 商品销售建议明确按包装销售还是按规格库存扣减；当前记录缺少包装/换算证据。 |
| 1062 | 828 | 术后舒缓喷雾 | AMI-DEMO-FULL-SKU-020 | 1 |  |  | 无销售出库流水 | ml | 瓶 | 商品销售建议明确按包装销售还是按规格库存扣减；当前记录缺少包装/换算证据。 |
| 1055 | 822 | 舒缓修护面膜 | AMI-DEMO-FULL-SKU-002 | 1 |  | 盒 | 包装单位 | 片 | 盒 | 订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。 |
| 1053 | 821 | 术后舒缓喷雾 | AMI-DEMO-FULL-SKU-020 | 1 |  |  | 无销售出库流水 | ml | 瓶 | 商品销售建议明确按包装销售还是按规格库存扣减；当前记录缺少包装/换算证据。 |
| 1050 | 818 | 仪器导入凝胶 | AMI-DEMO-FULL-SKU-017 | 1 |  |  | 无销售出库流水 | ml | 瓶 | 商品销售建议明确按包装销售还是按规格库存扣减；当前记录缺少包装/换算证据。 |
| 1047 | 815 | 屏障安瓶精华 | AMI-DEMO-FULL-SKU-014 | 1 |  |  | 无销售出库流水 | 支 | 盒 | 商品销售建议明确按包装销售还是按规格库存扣减；当前记录缺少包装/换算证据。 |
| 1044 | 812 | 紧致颈霜 | AMI-DEMO-FULL-SKU-011 | 1 |  |  | 无销售出库流水 | g | 瓶 | 商品销售建议明确按包装销售还是按规格库存扣减；当前记录缺少包装/换算证据。 |
| 1041 | 809 | 一次性护理巾 | AMI-DEMO-FULL-SKU-008 | 1 |  |  | 无销售出库流水 | 片 | 包 | 商品销售建议明确按包装销售还是按规格库存扣减；当前记录缺少包装/换算证据。 |
| 1038 | 806 | 抗衰紧致眼霜 | AMI-DEMO-FULL-SKU-005 | 1 |  |  | 无销售出库流水 | ml | 瓶 | 商品销售建议明确按包装销售还是按规格库存扣减；当前记录缺少包装/换算证据。 |
| 1035 | 803 | 舒缓修护面膜 | AMI-DEMO-FULL-SKU-002 | 1 |  |  | 无销售出库流水 | 片 | 盒 | 商品销售建议明确按包装销售还是按规格库存扣减；当前记录缺少包装/换算证据。 |
| 1032 | 800 | 头皮养护精华 | AMI-DEMO-FULL-SKU-019 | 1 |  |  | 无销售出库流水 | ml | 瓶 | 商品销售建议明确按包装销售还是按规格库存扣减；当前记录缺少包装/换算证据。 |
| 1029 | 797 | 舒压按摩膏 | AMI-DEMO-FULL-SKU-016 | 1 |  |  | 无销售出库流水 | g | 瓶 | 商品销售建议明确按包装销售还是按规格库存扣减；当前记录缺少包装/换算证据。 |
| 1026 | 794 | 水润柔肤水 | AMI-DEMO-FULL-SKU-013 | 1 |  |  | 无销售出库流水 | ml | 瓶 | 商品销售建议明确按包装销售还是按规格库存扣减；当前记录缺少包装/换算证据。 |
| 1023 | 791 | 清透防晒乳 | AMI-DEMO-FULL-SKU-010 | 1 |  |  | 无销售出库流水 | ml | 支 | 商品销售建议明确按包装销售还是按规格库存扣减；当前记录缺少包装/换算证据。 |
| 1020 | 788 | 水氧护理耗材包 | AMI-DEMO-FULL-SKU-007 | 1 |  |  | 无销售出库流水 | 套 | 盒 | 商品销售建议明确按包装销售还是按规格库存扣减；当前记录缺少包装/换算证据。 |
| 1017 | 785 | 烟酰胺亮肤精华 | AMI-DEMO-FULL-SKU-004 | 1 |  |  | 无销售出库流水 | ml | 瓶 | 商品销售建议明确按包装销售还是按规格库存扣减；当前记录缺少包装/换算证据。 |
| 1014 | 782 | 玻尿酸保湿精华 | AMI-DEMO-FULL-SKU-001 | 1 |  |  | 无销售出库流水 | ml | 瓶 | 商品销售建议明确按包装销售还是按规格库存扣减；当前记录缺少包装/换算证据。 |
| 1011 | 779 | 滋养手膜 | AMI-DEMO-FULL-SKU-018 | 1 |  |  | 无销售出库流水 | 片 | 盒 | 商品销售建议明确按包装销售还是按规格库存扣减；当前记录缺少包装/换算证据。 |
| 1008 | 776 | 清洁棉片 | AMI-DEMO-FULL-SKU-015 | 1 |  |  | 无销售出库流水 | 片 | 盒 | 商品销售建议明确按包装销售还是按规格库存扣减；当前记录缺少包装/换算证据。 |
| 1005 | 773 | 舒缓精油 | AMI-DEMO-FULL-SKU-012 | 1 |  |  | 无销售出库流水 | ml | 瓶 | 商品销售建议明确按包装销售还是按规格库存扣减；当前记录缺少包装/换算证据。 |
| 1002 | 770 | 胶原蛋白面膜 | AMI-DEMO-FULL-SKU-009 | 1 |  |  | 无销售出库流水 | 片 | 盒 | 商品销售建议明确按包装销售还是按规格库存扣减；当前记录缺少包装/换算证据。 |
| 999 | 767 | 屏障修护乳 | AMI-DEMO-FULL-SKU-006 | 1 |  |  | 无销售出库流水 | ml | 瓶 | 商品销售建议明确按包装销售还是按规格库存扣减；当前记录缺少包装/换算证据。 |
| 996 | 764 | 氨基酸洁面乳 | AMI-DEMO-FULL-SKU-003 | 1 |  |  | 无销售出库流水 | ml | 支 | 商品销售建议明确按包装销售还是按规格库存扣减；当前记录缺少包装/换算证据。 |
| 993 | 761 | 术后舒缓喷雾 | AMI-DEMO-FULL-SKU-020 | 1 |  |  | 无销售出库流水 | ml | 瓶 | 商品销售建议明确按包装销售还是按规格库存扣减；当前记录缺少包装/换算证据。 |
| 990 | 758 | 仪器导入凝胶 | AMI-DEMO-FULL-SKU-017 | 1 |  |  | 无销售出库流水 | ml | 瓶 | 商品销售建议明确按包装销售还是按规格库存扣减；当前记录缺少包装/换算证据。 |
| 987 | 755 | 屏障安瓶精华 | AMI-DEMO-FULL-SKU-014 | 1 |  |  | 无销售出库流水 | 支 | 盒 | 商品销售建议明确按包装销售还是按规格库存扣减；当前记录缺少包装/换算证据。 |
| 984 | 752 | 紧致颈霜 | AMI-DEMO-FULL-SKU-011 | 1 |  |  | 无销售出库流水 | g | 瓶 | 商品销售建议明确按包装销售还是按规格库存扣减；当前记录缺少包装/换算证据。 |
| 981 | 749 | 一次性护理巾 | AMI-DEMO-FULL-SKU-008 | 1 |  |  | 无销售出库流水 | 片 | 包 | 商品销售建议明确按包装销售还是按规格库存扣减；当前记录缺少包装/换算证据。 |
| 978 | 746 | 抗衰紧致眼霜 | AMI-DEMO-FULL-SKU-005 | 1 |  |  | 无销售出库流水 | ml | 瓶 | 商品销售建议明确按包装销售还是按规格库存扣减；当前记录缺少包装/换算证据。 |
| 975 | 743 | 舒缓修护面膜 | AMI-DEMO-FULL-SKU-002 | 1 |  |  | 无销售出库流水 | 片 | 盒 | 商品销售建议明确按包装销售还是按规格库存扣减；当前记录缺少包装/换算证据。 |
| 972 | 740 | 头皮养护精华 | AMI-DEMO-FULL-SKU-019 | 1 |  |  | 无销售出库流水 | ml | 瓶 | 商品销售建议明确按包装销售还是按规格库存扣减；当前记录缺少包装/换算证据。 |
| 969 | 737 | 舒压按摩膏 | AMI-DEMO-FULL-SKU-016 | 1 |  |  | 无销售出库流水 | g | 瓶 | 商品销售建议明确按包装销售还是按规格库存扣减；当前记录缺少包装/换算证据。 |

## 6. 建议

- 短期保持库存主数量口径不变；服务扣耗新增写入带 product.specUnit，商品销售新增写入带 product.packageUnit。
- 商品销售页面文案使用包装，服务 BOM 和服务扣耗页面使用规格单位。
- 历史流水只输出异常清单，不自动批量修改。
- 新增商品订单写入已要求把 packageUnit 固化到 OrderItem.payload，形成可审计证据；历史订单不自动回填。
- 中期新增包装换算字段后，再决定是否把库存主数量切换为最小规格单位。
