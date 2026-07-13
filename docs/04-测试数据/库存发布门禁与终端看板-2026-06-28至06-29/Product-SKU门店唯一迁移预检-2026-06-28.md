# Product SKU 门店唯一迁移预检

生成时间：2026-06-29T03:22:30.882Z
结论：可执行 migration

## 1. 当前索引状态

| 索引 | 状态 |
| --- | --- |
| Product_sku_key（全局唯一） | 不存在 |
| Product_storeId_sku_key（门店内唯一） | 存在 |
| Prisma migration：20260629102000_product_sku_store_scope | 已应用 / Mon Jun 29 2026 11:21:57 GMT+0800 (中国标准时间) |

## 2. 同门店重复 SKU 检查

未发现同一门店重复 SKU。

## 3. 跨门店同 SKU 现状

当前没有跨门店复用 SKU 的商品；迁移后可创建调拨验收样本。

## 4. 执行建议

- 如果同门店重复 SKU 为 0，则 `20260629102000_product_sku_store_scope` 可从数据一致性角度执行。
- 如果 `Product_sku_key` 仍存在且 `Product_storeId_sku_key` 不存在，说明真实库尚未应用迁移，跨门店同 SKU 调拨样本仍会被阻塞。
- 发布前不仅要索引切换成功，还需要 `_prisma_migrations` 中存在 `20260629102000_product_sku_store_scope` 的成功记录，避免手工改库但迁移状态不同步。
- 本脚本只读，不会执行 migration，也不会修改商品数据。
