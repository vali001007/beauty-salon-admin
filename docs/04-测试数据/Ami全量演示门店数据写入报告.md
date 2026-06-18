# Ami 全量演示门店数据写入报告

执行时间：2026-06-01T13:22:54.636Z
模式：apply
门店：Ami 全量演示门店
前缀：AMI-DEMO-FULL
随机种子：ami-demo-full-2026-06-01

## 数量统计

| 模块 | 写入前 | 删除/刷新 | 新建 | 写入后 |
| --- | ---: | ---: | ---: | ---: |
| stores | 1 | 1 | 0 | 1 |
| users | 8 | 8 | 8 | 8 |
| customers | 1240 | 1240 | 1240 | 1240 |
| consumptionRecords | 7038 | 7038 | 6913 | 6913 |
| healthProfiles | 812 | 812 | 807 | 807 |
| products | 20 | 20 | 20 | 20 |
| stockBatches | 40 | 40 | 40 | 40 |
| stockMovements | 40 | 40 | 120 | 120 |
| purchaseOrders | 4 | 4 | 4 | 4 |
| transferOrders | 1 | 1 | 1 | 1 |
| projects | 15 | 15 | 15 | 15 |
| projectBomItems | 45 | 45 | 45 | 45 |
| beauticians | 12 | 12 | 12 | 12 |
| schedules | 168 | 168 | 168 | 168 |
| reservations | 360 | 360 | 360 | 360 |
| terminalDevices | 3 | 3 | 3 | 3 |
| serviceTasks | 220 | 220 | 220 | 220 |
| skinTests | 180 | 180 | 180 | 180 |
| cards | 5 | 5 | 5 | 5 |
| customerCards | 320 | 320 | 320 | 320 |
| cardUsageRecords | 180 | 180 | 180 | 180 |
| balanceAccounts | 320 | 320 | 320 | 320 |
| balanceTransactions | 384 | 384 | 420 | 420 |
| productOrders | 400 | 400 | 400 | 400 |
| orderItems | 520 | 520 | 520 | 520 |
| paymentRecords | 400 | 400 | 400 | 400 |
| refundRecords | 36 | 36 | 36 | 36 |
| promotions | 5 | 5 | 5 | 5 |
| printJobs | 60 | 60 | 60 | 60 |
| predictionRuns | 1 | 1 | 1 | 1 |
| predictionSnapshots | 1240 | 1240 | 1240 | 1240 |
| marketingStrategies | 3 | 3 | 3 | 3 |
| marketingExecutions | 6 | 6 | 6 | 6 |
| marketingTouches | 300 | 300 | 300 | 300 |
| marketingAttributions | 80 | 80 | 80 | 80 |
| recommendationEvents | 220 | 220 | 220 | 220 |
| imageAssets | 0 | 0 | 0 | 0 |

## 图片资产

图片资产清单：`docs\04-测试数据\Ami全量演示门店图片资产清单.md`
Manifest：`public\demo-assets\ami-demo-full\asset-manifest.json`

## Warnings

- 内置 `$imagegen` 工具当前不可用；已按计划尝试 imagegen CLI fallback，但当前 `OPENAI_API_KEY` 被接口返回 401，35 个图片文件仍未生成；manifest 已写入待生成提示词。

## 验证记录

| 验证项 | 结果 | 说明 |
| --- | --- | --- |
| `npm --prefix packages/server-v2 run db:generate` | 通过 | Prisma Client 已按新增 `image` 字段重新生成 |
| `npm --prefix packages/server-v2 run db:migrate:prod` | 通过 | 当前数据库无待应用 migration |
| `npm --prefix packages/server-v2 run db:seed:demo-full:dry-run` | 通过 | dry-run 仅规划刷新 `Ami 全量演示门店` 与 `AMI-DEMO-FULL` 前缀数据 |
| `npm --prefix packages/server-v2 run lint` | 通过 | 0 error，存在 8 个既有 unused warning |
| `npm --prefix packages/server-v2 run build` | 通过 | NestJS 构建通过 |
| `npm --prefix packages/server-v2 run test` | 通过 | 6 suites / 53 tests passed |
| `npm run lint` | 通过 | 管理端 ESLint 通过 |
| `npm run build` | 通过 | Vite 构建通过，仍有既有大 chunk warning |
| `npm run test` | 通过 | 8 files / 69 tests passed；ErrorBoundary 用例会打印预期错误日志 |
| `npm run test:e2e` | 通过 | 5/5 passed；当前 Playwright 配置为 mock 模式 |
| `packages/Ami-Aura-Lite-Kiosk npm run build` | 通过 | 终端主线构建通过，仍有既有大 chunk warning |
| 真实 API 抽样 | 通过 | `Ami 全量演示门店` 可读：客户 1240、商品 20、库存 20、项目 15、预约 360、商品订单 400 |
| 真实页面抽样 | 部分通过 | 登录后可切换 `Ami 全量演示门店`，仪表盘、客户、商品、库存、项目、预约、订单、营销推荐页面可读；商品/项目图片路径已渲染，但 PNG 文件缺失导致图片未加载 |
| Ami Aura Lite 终端抽样 | 通过 | 终端页可切换 `Ami 全量演示门店`，首页显示客户 1240、门店订单 364、预约待处理 3、员工排班 8，未发现 4xx/5xx API 错误 |

## JSON

```json
{
  "mode": "apply",
  "storeName": "Ami 全量演示门店",
  "prefix": "AMI-DEMO-FULL",
  "seed": "ami-demo-full-2026-06-01",
  "beforeCounts": {
    "imageAssets": 0,
    "stores": 1,
    "users": 8,
    "customers": 1240,
    "consumptionRecords": 7038,
    "healthProfiles": 812,
    "products": 20,
    "stockBatches": 40,
    "stockMovements": 40,
    "purchaseOrders": 4,
    "transferOrders": 1,
    "projects": 15,
    "projectBomItems": 45,
    "beauticians": 12,
    "schedules": 168,
    "reservations": 360,
    "terminalDevices": 3,
    "serviceTasks": 220,
    "skinTests": 180,
    "cards": 5,
    "customerCards": 320,
    "cardUsageRecords": 180,
    "balanceAccounts": 320,
    "balanceTransactions": 384,
    "productOrders": 400,
    "orderItems": 520,
    "paymentRecords": 400,
    "refundRecords": 36,
    "promotions": 5,
    "printJobs": 60,
    "predictionRuns": 1,
    "predictionSnapshots": 1240,
    "marketingStrategies": 3,
    "marketingExecutions": 6,
    "marketingTouches": 300,
    "marketingAttributions": 80,
    "recommendationEvents": 220
  },
  "plannedCounts": {
    "stores": 1,
    "users": 8,
    "customers": 1240,
    "consumptionRecords": 5300,
    "healthProfiles": 740,
    "products": 20,
    "stockBatches": 40,
    "stockMovements": 120,
    "purchaseOrders": 4,
    "transferOrders": 1,
    "projects": 15,
    "projectBomItems": 45,
    "beauticians": 12,
    "schedules": 168,
    "reservations": 360,
    "terminalDevices": 3,
    "serviceTasks": 220,
    "skinTests": 180,
    "cards": 5,
    "customerCards": 320,
    "cardUsageRecords": 180,
    "balanceAccounts": 320,
    "balanceTransactions": 420,
    "productOrders": 400,
    "orderItems": 520,
    "paymentRecords": 400,
    "refundRecords": 36,
    "promotions": 5,
    "printJobs": 60,
    "predictionRuns": 1,
    "predictionSnapshots": 1240,
    "marketingStrategies": 3,
    "marketingExecutions": 6,
    "marketingTouches": 300,
    "marketingAttributions": 80,
    "recommendationEvents": 220,
    "imageAssets": 35
  },
  "deletedCounts": {
    "imageAssets": 0,
    "stores": 1,
    "users": 8,
    "customers": 1240,
    "consumptionRecords": 7038,
    "healthProfiles": 812,
    "products": 20,
    "stockBatches": 40,
    "stockMovements": 40,
    "purchaseOrders": 4,
    "transferOrders": 1,
    "projects": 15,
    "projectBomItems": 45,
    "beauticians": 12,
    "schedules": 168,
    "reservations": 360,
    "terminalDevices": 3,
    "serviceTasks": 220,
    "skinTests": 180,
    "cards": 5,
    "customerCards": 320,
    "cardUsageRecords": 180,
    "balanceAccounts": 320,
    "balanceTransactions": 384,
    "productOrders": 400,
    "orderItems": 520,
    "paymentRecords": 400,
    "refundRecords": 36,
    "promotions": 5,
    "printJobs": 60,
    "predictionRuns": 1,
    "predictionSnapshots": 1240,
    "marketingStrategies": 3,
    "marketingExecutions": 6,
    "marketingTouches": 300,
    "marketingAttributions": 80,
    "recommendationEvents": 220
  },
  "createdCounts": {
    "imageAssets": 0,
    "users": 8,
    "beauticians": 12,
    "schedules": 168,
    "products": 20,
    "stockBatches": 40,
    "stockMovements": 120,
    "purchaseOrders": 4,
    "transferOrders": 1,
    "projects": 15,
    "projectBomItems": 45,
    "customers": 1240,
    "healthProfiles": 807,
    "consumptionRecords": 6913,
    "cards": 5,
    "customerCards": 320,
    "balanceAccounts": 320,
    "balanceTransactions": 420,
    "terminalDevices": 3,
    "reservations": 360,
    "serviceTasks": 220,
    "skinTests": 180,
    "productOrders": 400,
    "orderItems": 520,
    "paymentRecords": 400,
    "refundRecords": 36,
    "cardUsageRecords": 180,
    "promotions": 5,
    "printJobs": 60,
    "predictionRuns": 1,
    "predictionSnapshots": 1240,
    "marketingStrategies": 3,
    "marketingExecutions": 6,
    "marketingTouches": 300,
    "marketingAttributions": 80,
    "recommendationEvents": 220
  },
  "afterCounts": {
    "imageAssets": 0,
    "stores": 1,
    "users": 8,
    "customers": 1240,
    "consumptionRecords": 6913,
    "healthProfiles": 807,
    "products": 20,
    "stockBatches": 40,
    "stockMovements": 120,
    "purchaseOrders": 4,
    "transferOrders": 1,
    "projects": 15,
    "projectBomItems": 45,
    "beauticians": 12,
    "schedules": 168,
    "reservations": 360,
    "terminalDevices": 3,
    "serviceTasks": 220,
    "skinTests": 180,
    "cards": 5,
    "customerCards": 320,
    "cardUsageRecords": 180,
    "balanceAccounts": 320,
    "balanceTransactions": 420,
    "productOrders": 400,
    "orderItems": 520,
    "paymentRecords": 400,
    "refundRecords": 36,
    "promotions": 5,
    "printJobs": 60,
    "predictionRuns": 1,
    "predictionSnapshots": 1240,
    "marketingStrategies": 3,
    "marketingExecutions": 6,
    "marketingTouches": 300,
    "marketingAttributions": 80,
    "recommendationEvents": 220
  },
  "warnings": [
    "内置 `$imagegen` 工具当前不可用；已按计划尝试 imagegen CLI fallback，但当前 `OPENAI_API_KEY` 被接口返回 401，35 个图片文件仍未生成；manifest 已写入待生成提示词。"
  ]
}
```
