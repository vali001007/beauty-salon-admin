# 测试门店-Ami 大样本模拟数据写入计划

## Summary
- 在当前 `packages/server-v2/.env` 指向的数据库中创建/刷新 `测试门店-Ami`。
- 新增确定性 seed 脚本生成大样本模拟数据，禁止用大模型批量生成数据。
- 执行写入后保存分析报告到 `04-测试数据/测试门店-Ami模拟数据写入分析报告.md`。
- 重跑策略按你选择的“门店内刷新”：只清理并重建 `测试门店-Ami` 相关数据，不影响其他门店。

## Key Changes
- 新增 `packages/server-v2/prisma/seed-test-store-ami.ts`：
  - 支持 `--dry-run`、`--apply`、`--yes`。
  - 默认 dry-run；真实写入必须显式 `--apply --yes`。
  - 使用固定 seed 的伪随机生成器、固定业务前缀 `TEST-AMI-*`、现有 mock JSON 样本分布生成数据。
  - 不使用大模型生成任何批量数据。
- 新增脚本命令：
  - `packages/server-v2`: `db:seed:test-store-ami:dry-run`、`db:seed:test-store-ami`
  - 根目录同步增加同名便捷脚本。
- 门店刷新安全规则：
  - 仅允许操作门店名精确等于 `测试门店-Ami` 的门店。
  - 首次运行创建门店；重跑时保留 Store 记录，删除该门店下的脚本数据后重建。
  - 删除范围按 `storeId`、测试业务键前缀、测试用户名前缀限定；脚本发现将影响其他门店时立即停止。
- 大样本目标数据：
  - 客户 1,240、消费记录 5,353、健康档案 673。
  - 商品 8、库存批次 16、库存流水约 96、采购单 4、调拨单 2。
  - 项目 8、BOM 约 24、美容师 12、排班约 168。
  - 预约约 240、服务任务约 180、皮肤检测约 160。
  - 卡项 5、客户卡约 260、核销约 180、余额账户约 300。
  - 订单约 360、订单明细约 520、支付 360、退款约 36。
  - 终端设备 3、促销 5、打印任务 60、推荐反馈 180。
  - 预测快照 1,240、营销策略 3、执行 6、触达 300、归因 80。
- 报告输出：
  - 脚本输出 JSON 运行结果，包含 before/after counts、created/deleted/skipped、异常与告警。
  - 生成 Markdown 报告，覆盖数据生成情况、写入情况、写入中发现的数据问题、数据库可改进点。

## Public Interfaces / Types
- 不新增或修改业务 API。
- 不修改 Prisma schema 或数据库结构。
- 新增 NPM seed 脚本作为开发/测试数据入口。
- 报告文件固定保存到 `04-测试数据/测试门店-Ami模拟数据写入分析报告.md`。

## Test Plan
- 只读预检：
  - `npm --prefix packages/server-v2 run db:seed:test-store-ami:dry-run`
  - 确认将删除/创建的数量只作用于 `测试门店-Ami`。
- 写入执行：
  - `npm --prefix packages/server-v2 run db:seed:test-store-ami`
  - 写入后查询该门店各模块数量，并确认 admin 拥有该门店访问权限。
- 验证：
  - `cd packages/server-v2 && npm run build`
  - `cd packages/server-v2 && npm run test`
  - `cd packages/server-v2 && npm run lint`
  - `npm run build`
  - `npm run test`
- 人工验收：
  - 管理端切换到 `测试门店-Ami` 后，客户、库存、订单、卡项、预约、终端、营销推荐页面均有数据。
  - 报告中的 before/after 数量与数据库查询一致。

## Assumptions
- 写入目标使用当前 `packages/server-v2/.env` 的 `DATABASE_URL`。
- 允许刷新 `测试门店-Ami` 内的脚本数据，但不清理其他门店、历史文档、outputs 或无关数据。
- 全局基础字典如角色、卡项、项目类型、商品分类采用 upsert/skip，不做全局删除。
