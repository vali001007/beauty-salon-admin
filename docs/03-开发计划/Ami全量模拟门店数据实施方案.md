# Ami 全量模拟门店数据实施方案

更新时间：2026-06-01

## 1. 目标

新建一个独立的模拟门店，并批量生成一批新的全量模拟数据，用于后台管理端、Ami Aura Lite 终端、AI 推荐与营销闭环的测试和演示。

建议门店名称：`Ami 全量演示门店`

建议数据前缀：`AMI-DEMO-FULL-*`

核心交付目标：

- 新增一个可在管理端门店切换器中选择的模拟门店。
- 生成覆盖“人、货、客、场、钱、营销、终端”的全链路数据。
- 数据可重复生成，默认只做 dry-run，真实写入必须显式确认。
- 重跑时只刷新该模拟门店和脚本自有前缀数据，不影响其他真实门店、历史文档、outputs 或无关数据。
- 执行后输出数据写入报告，便于产品演示前确认数据量和页面覆盖情况。

## 2. 当前仓库判断

仓库已有 `docs/03-开发计划/测试门店-Ami 大样本模拟数据写入计划.md`，但当前代码中尚未落地对应 `packages/server-v2/prisma/seed-test-store-ami.ts`，`packages/server-v2/package.json` 也尚未配置专用 seed 命令。

现有可复用基础：

- Prisma schema 已覆盖门店、用户、客户、健康档案、消费、商品、库存、项目、BOM、美容师、排班、预约、卡项、订单、余额、终端、服务任务、皮肤检测、推荐、营销自动化、打印任务等模型。
- 前端 `src/types/product.ts` 和 `src/types/project.ts` 已预留 `image?: string` 字段，但当前 Prisma `Product` / `Project` 模型尚未看到对应图片字段，实施时需要补齐图片存储与接口返回。
- `packages/server-v2/prisma/seed-mvp.ts` 已有一部分经营闭环数据生成逻辑，可复用生成思路，但需要改造成“单门店隔离 + 可刷新 + 全量报告”的专用脚本。
- `docs/04-测试数据/模拟数据/客户数据/generate-customers.js` 已有客户、消费记录、肌肤档案三类数据的生成逻辑，可作为本次客户域数据生成器的基础。
- `src/api/mock/data/customers.json`、`consumption-records.json`、`health-profiles.json` 可作为字段分布参考，但本次应生成新的演示数据，不直接原样导入旧 mock 数据。

## 3. 实施策略

采用“后端真实数据库 seed”为主，不只改前端 mock。

原因：

- 管理端 real 模式、Ami Aura Lite 终端和 AI Gateway 都依赖 `packages/server-v2`。
- 只改 `src/api/mock` 会导致演示数据和真实联调数据断层。
- 用 Prisma seed 可以同时验证数据库关系、分页接口、门店隔离、权限和终端流程。

不建议用大模型批量生成数据。批量数据采用固定 seed 的伪随机生成器和业务模板生成，保证每次重跑可复现、可排查、可验收。

## 4. 客户生成脚本复用方案

`docs/04-测试数据/模拟数据/客户数据/generate-customers.js` 可以复用，但建议作为“客户域生成算法来源”，不直接原样作为数据库写入脚本。

可直接复用的内容：

- 客户基础画像分布：95% 女性、22-55 岁为主、25-40 岁为核心客群。
- 会员等级金字塔分布：无、普通会员、银卡会员、金卡会员、钻石会员。
- 客户来源权重：朋友介绍、门店、小红书、抖音、美团/大众点评、线上广告、活动等。
- 年龄段标签和肤质逻辑：年轻客群偏痘痘、出油、控油需求；成熟客群偏抗衰、干纹、淡斑、紧致需求。
- 消费记录生成逻辑：服务消费、产品消费、套餐消费、充值消费，并按会员等级拉开金额区间。
- 健康档案生成逻辑：肤质、肤况、主诉问题、过敏史、护理目标、推荐护理、检测仪器。
- 现有输出结构：`customers.json`、`consumption-records.json`、`health-profiles.json`，与 Prisma 的 `Customer`、`ConsumptionRecord`、`CustomerHealthProfile` 字段比较接近。

需要改造的点：

- 单门店隔离：原脚本内置 3 个杭州门店，本次要统一映射到 `Ami 全量演示门店`，避免生成数据散落到旧门店。
- 固定随机种子：原脚本使用 `Math.random()`，每次结果不同；正式 seed 要替换为固定 seed 的伪随机函数，保证重跑可复现。
- ID 重映射：原脚本客户 ID 从 1 开始，不能直接作为数据库主键写入；写库时应让数据库自增，再维护 oldId -> newId 映射。
- 日期基准：原脚本里有 2026-04-11 的固定“当前日期”逻辑，正式脚本应改为配置化基准日期，默认使用执行日或固定演示日期。
- 运行兼容：仓库根目录 `package.json` 是 `"type": "module"`，该脚本目前是 CommonJS 写法，直接用 `node generate-customers.js` 可能遇到 ESM/CJS 兼容问题；建议抽成 TypeScript/ESM helper，或改成 `.cjs` 兼容入口。
- 写入保护：原脚本只生成 JSON 文件，不处理数据库清理、门店范围校验、唯一前缀、dry-run 和报告输出；这些必须由新的 `seed-demo-full-store.ts` 负责。

建议落地方式：

1. 在 `packages/server-v2/prisma/seed-demo-full-store.ts` 中复用该脚本的数据池和分布规则，改造成可传入 `count`、`storeName`、`seed`、`baseDate` 的客户生成函数。
2. 生成客户域临时对象后，由 seed 脚本写入 `Customer`、`ConsumptionRecord`、`CustomerHealthProfile`，并维护客户 ID 映射。
3. 继续保留原 `generate-customers.js` 作为测试数据资产，不直接修改或删除；若需要长期复用，再新增一个共享生成器文件，避免破坏现有 JSON 生成流程。
4. 首次 dry-run 报告中单独输出客户生成统计：客户数、女性占比、平均年龄、会员分布、消费记录数、健康档案数。

## 5. 项目与商品图片资产方案

项目和商品必须有图片，用于管理端列表、详情、导入演示、终端推荐和营销素材展示。本次图片资产使用 `$imagegen` 生成，不使用外链占位图作为主数据图片。

### 5.1 图片生成方式

- 使用 `$imagegen` 的默认内置图片生成能力生成位图资产。
- 每个商品、每个项目各生成 1 张主图；商品建议 20-30 张，项目建议 15-20 张。
- 图片生成后必须移动或复制到当前项目工作区，不能只保留在 `$CODEX_HOME/generated_images`。
- 不默认使用 CLI fallback；除非后续明确要求 CLI/API 路径或原生透明背景，否则按内置生成流程执行。
- 本批图片不需要透明背景，优先生成可直接用于卡片和详情页的方图或横图。

建议保存目录：

```text
public/demo-assets/ami-demo-full/products/
public/demo-assets/ami-demo-full/projects/
docs/04-测试数据/Ami全量演示门店图片资产清单.md
```

建议命名：

```text
ami-demo-full-product-<sku-slug>.png
ami-demo-full-project-<project-slug>.png
```

### 5.2 图片风格规范

商品图片：

- 类型：产品摄影 / 电商主图。
- 画幅：建议 `1024x1024` 方图。
- 风格：干净、轻奢、专业护肤品牌质感。
- 内容：瓶、盒、软管、护理耗材包等真实可售卖产品形态。
- 背景：浅色专业摄影背景，可有柔和阴影，但不要出现品牌 Logo、水印、促销文字。
- 禁止：文字错误、乱码、明显医疗械字号暗示、夸大功效、真人肖像抢占主体。

项目图片：

- 类型：美容护理服务场景 / 项目展示图。
- 画幅：建议 `1536x1024` 横图，便于详情页和营销素材复用。
- 风格：真实门店护理场景、干净卫生、轻奢但不过度医美化。
- 内容：补水护理、清洁护理、敏感修护、肩颈舒压、仪器护理、抗衰紧致等服务场景。
- 人物：可出现局部手部和背影，避免清晰可识别正脸，降低肖像和隐私风险。
- 禁止：血腥、侵入式医疗画面、夸张术前术后对比、文字水印。

### 5.3 Prompt 模板

商品主图 Prompt 模板：

```text
Use case: product-mockup
Asset type: product catalog image for a beauty salon admin system
Primary request: create a clean product photo for "<商品名称>"
Subject: <商品形态，例如 skincare serum bottle / facial mask box / disposable care towel pack>
Style/medium: premium ecommerce product photography
Composition/framing: centered square composition, full product visible, generous padding
Lighting/mood: soft studio lighting, clean professional beauty brand feel
Color palette: warm white, soft champagne, muted pastel accents
Materials/textures: realistic bottle, box, label surface, cosmetic packaging texture
Constraints: no readable brand logo, no watermark, no promotional text, no medical claims
Avoid: distorted packaging, extra products, hands, faces, cluttered background
```

项目主图 Prompt 模板：

```text
Use case: photorealistic-natural
Asset type: beauty service project image for a salon admin system
Primary request: create a realistic beauty salon service scene for "<项目名称>"
Scene/backdrop: clean modern beauty salon treatment room
Subject: <项目场景，例如 hydrating facial care / pore cleansing / shoulder and neck relaxation / skincare device treatment>
Style/medium: photorealistic editorial service photography
Composition/framing: horizontal composition, service action visible, no identifiable face
Lighting/mood: soft natural spa lighting, professional and hygienic
Color palette: warm white, muted rose, light wood, clean neutral tones
Constraints: no readable text, no watermark, avoid identifiable faces, no invasive medical procedure
Avoid: hospital surgery feel, exaggerated before-after results, messy tools, dark atmosphere
```

### 5.4 图片与数据的绑定

推荐技术方案：在 Prisma `Product` 和 `Project` 模型补充 `image String?` 字段，并通过 seed 写入 `/demo-assets/ami-demo-full/...` 路径。

需要同步处理：

- `packages/server-v2/prisma/schema.prisma` 增加 `Product.image`、`Project.image`。
- 新增 Prisma migration。
- `packages/server-v2/src/products`、`packages/server-v2/src/projects` 返回 `image` 字段。
- `src/api/real/product.ts`、`src/api/real/project.ts` 已有 `item.image` 映射方向，实施时验证真实接口能拿到该字段。
- mock 数据也同步补 `image`，避免 mock/real 体验不一致。
- seed 报告输出图片资产数量、缺失图片列表、数据库图片引用路径。

如果暂时不改数据库结构，备选方案是新增图片 manifest：

```text
docs/04-测试数据/Ami全量演示门店图片资产清单.md
public/demo-assets/ami-demo-full/asset-manifest.json
```

但备选方案只能解决资产管理，页面和 API 仍需要额外映射；因此正式实施推荐补数据库字段。

### 5.5 图片验收标准

- 每个演示商品和项目都有可访问图片路径。
- 图片文件在 workspace 内，前端构建后可通过 `/demo-assets/ami-demo-full/...` 访问。
- 图片与名称匹配，例如补水护理不是肩颈场景，面膜产品不是精华瓶。
- 图片无水印、无乱码文字、无明显品牌侵权。
- 管理端商品列表、项目列表、详情页和终端推荐卡片均能展示图片。
- 写入报告中包含图片资产清单和缺图项，缺图项必须为 0。

## 6. 拟新增或修改文件

新增：

- `packages/server-v2/prisma/seed-demo-full-store.ts`
- `docs/04-测试数据/Ami全量演示门店数据写入报告.md`
- `docs/04-测试数据/Ami全量演示门店图片资产清单.md`
- `public/demo-assets/ami-demo-full/products/*.png`
- `public/demo-assets/ami-demo-full/projects/*.png`
- `public/demo-assets/ami-demo-full/asset-manifest.json`

修改：

- `packages/server-v2/package.json`
- 根目录 `package.json`
- `packages/server-v2/prisma/schema.prisma`
- `src/api/mock/product.ts`
- `src/api/mock/project.ts`

可能新增：

- `packages/server-v2/prisma/migrations/<timestamp>_product_project_images/migration.sql`

建议新增命令：

```bash
npm --prefix packages/server-v2 run db:seed:demo-full:dry-run
npm --prefix packages/server-v2 run db:seed:demo-full
npm run db:seed:demo-full:dry-run
npm run db:seed:demo-full
```

命令语义：

- `dry-run`：只统计、预览将创建/刷新的数据，不写入数据库。
- `db:seed:demo-full`：内部执行 `--apply --yes`，真实写入数据库。

## 7. 数据范围与目标量级

| 模块 | 目标数据 | 建议量级 | 说明 |
| --- | --- | ---: | --- |
| 门店 | Store | 1 | `Ami 全量演示门店` |
| 用户权限 | 店长、前台、美容师用户、admin 门店授权 | 8-12 | admin 自动关联新门店 |
| 客户 | Customer | 1,000-1,240 | 覆盖新客、会员、沉睡、高价值客户 |
| 客户档案 | 健康档案、肤质、标签、过敏史 | 650-750 | 支撑客户画像和推荐 |
| 消费记录 | ConsumptionRecord | 5,000+ | 支撑客户分层、复购、LTV |
| 商品 | Product + 图片 | 20-30 | 护肤品、耗材、仪器耗材、日用品，每个商品 1 张 `$imagegen` 主图 |
| 库存 | 批次、流水、采购、调拨 | 150+ | 覆盖低库存、临期、入库、出库 |
| 项目 | Project、ProjectType、BOM + 图片 | 15-20 | 面护、身体、仪器、抗衰、修护，每个项目 1 张 `$imagegen` 主图 |
| 员工 | Beautician、等级、排班 | 12-16 人，14-30 天排班 | 支撑预约、服务任务 |
| 预约 | Reservation | 300-500 | 覆盖待确认、已到店、完成、爽约 |
| 终端 | TerminalDevice、ServiceTask、SkinTest | 3-5 台设备，200+ 服务任务 | 支撑 Ami Aura Lite 演示 |
| 卡项 | Card、CustomerCard、CardUsageRecord | 5-8 种卡，300+ 客户卡 | 支撑开卡、核销、剩余次数 |
| 余额 | CustomerBalanceAccount、Transaction | 300+ | 支撑充值、赠金、余额支付 |
| 订单 | ProductOrder、OrderItem、Payment、Refund | 400+ 订单 | 覆盖项目、商品、卡项、退款 |
| 营销 | 策略、执行、触达、归因 | 3-5 策略，300+ 触达 | 支撑营销效果分析 |
| 推荐 | RecommendationEvent、PredictionSnapshot | 1,000+ 快照，200+ 反馈 | 支撑智能推荐闭环 |
| 打印/促销 | PrintJob、Promotion | 60+ 打印，5+ 活动 | 支撑终端小票和活动查询 |

## 8. 数据生成依赖顺序

脚本按以下顺序生成，避免外键和业务闭环断裂：

1. 预检数据库连接、Prisma Client、目标门店是否存在。
2. 创建或更新目标门店 `Ami 全量演示门店`。
3. 给 `admin` 用户补充该门店访问关系。
4. 创建或复用角色、项目类型、商品分类、美容师等级等基础字典。
5. 使用 `$imagegen` 生成商品和项目主图，保存到 `public/demo-assets/ami-demo-full/` 并生成资产清单。
6. 生成商品、写入商品图片路径、库存批次、库存流水、采购单、调拨单。
7. 生成项目、写入项目图片路径、项目 BOM、服务价格和时长。
8. 生成美容师、门店员工用户和未来 14-30 天排班。
9. 复用 `generate-customers.js` 的分布规则，生成客户主档、健康档案、消费记录、标签、会员等级，并统一映射到 `Ami 全量演示门店`。
10. 生成客户卡、余额账户、余额流水。
11. 生成预约、服务任务、皮肤检测、卡项核销。
12. 生成订单、订单明细、支付、退款、库存消耗流水。
13. 生成终端设备、促销、打印任务、推荐反馈。
14. 生成预测快照、营销自动化策略、执行、触达、归因。
15. 输出 before/after 统计、图片资产清单和 Markdown 写入报告。

## 9. 安全边界

必须遵守以下规则：

- 默认执行 dry-run，不写数据库。
- 真实写入必须带 `--apply --yes`。
- 脚本只允许操作门店名精确等于 `Ami 全量演示门店` 的门店数据。
- 所有可唯一识别的数据必须带 `AMI-DEMO-FULL-*` 前缀，例如 SKU、订单号、支付号、设备号、任务号、流水号。
- 重跑时只刷新该门店内数据，以及全局表中带 `AMI-DEMO-FULL-*` 前缀的脚本数据。
- 不得删除其他门店数据。
- 不得批量删除文档、outputs、历史原型目录或无关文件。
- 全局字典表如 `Card`、`Category`、`ProjectType`、`BeauticianLevel` 采用 upsert 或精确前缀清理，不做全表清空。
- `PurchaseOrder`、`MarketingAutomationStrategy` 等无 storeId 的全局表，只能按唯一业务前缀处理。
- 复用 `generate-customers.js` 时，只复用生成规则和临时 JSON/对象，不允许它绕过 seed 脚本直接写数据库。
- `$imagegen` 生成出的项目内资产必须保存为新增文件，不覆盖现有图片素材；如需重跑，使用同名资产前先确认是否允许替换，或生成带版本号的新文件。

## 10. 脚本设计要点

`seed-demo-full-store.ts` 建议包含以下能力：

- 参数解析：`--dry-run`、`--apply`、`--yes`、`--store-name`、`--seed`。
- 固定随机数生成器：默认 seed 固定，便于复现。
- 数据模板池：客户姓名、城市、来源渠道、肤质、标签优先复用 `generate-customers.js`，项目、商品、营销文案使用 seed 脚本内的本地模板数组。
- 图片资产清单：项目和商品生成前确定 slug、文件名、提示词和目标路径；写库时只写最终 workspace 内可访问路径。
- 批量写入：客户、消费记录、预测快照等大表用 chunk 分批写入，避免单次事务过大。
- 关系映射：保留 customerId、projectId、productId、beauticianId、deviceId 映射，确保订单、任务、营销归因能串起来。
- 统计报告：记录 beforeCounts、plannedCounts、createdCounts、deletedCounts、skippedCounts、afterCounts、warnings。
- 异常保护：如果发现待删除数据超出目标门店或目标前缀，立即停止。
- 报告输出：写入 `docs/04-测试数据/Ami全量演示门店数据写入报告.md`。

## 11. 验证计划

技术验证：

```bash
npm --prefix packages/server-v2 run db:seed:demo-full:dry-run
npm --prefix packages/server-v2 run db:seed:demo-full
npm --prefix packages/server-v2 run build
npm --prefix packages/server-v2 run test
npm run build
npm run test
```

图片验证：

- 检查 `public/demo-assets/ami-demo-full/products/` 商品主图数量等于商品数量。
- 检查 `public/demo-assets/ami-demo-full/projects/` 项目主图数量等于项目数量。
- 抽查图片是否和商品/项目名称匹配，且无水印、无乱码文字、无明显侵权品牌。
- 启动管理端后确认商品列表、项目列表、终端推荐卡片能显示图片。

页面验收：

- 登录账号 `admin / 11111111`。
- 门店切换器可选择 `Ami 全量演示门店`。
- 仪表盘能看到该门店经营数据。
- 客户数据、客户画像、邀约话术页面有可筛选客户。
- 商品、库存、采购、临期、调拨、消耗页面有数据。
- 项目、项目类型、美容师、排班、预约页面有数据。
- 商品订单、卡项订单、核销页面有数据。
- 智能推荐、营销策略、活动效果、效果分析页面有数据。
- Ami Aura Lite 终端可登录或切换到该门店，并看到今日任务、客户识别、核销、收银、皮肤检测、推荐闭环数据。

数据验收：

- 报告中的 afterCounts 与数据库查询一致。
- 客户统计应接近 `generate-customers.js` 的业务分布：女性约 95%，主力年龄集中在 25-40 岁，会员等级呈普通多、钻石少的金字塔结构。
- 图片资产清单中的商品/项目缺图数为 0。
- 其他门店客户数、订单数、库存数不被刷新脚本影响。
- 重跑 `dry-run` 不产生写入。
- 重跑真实写入后，目标门店数据量稳定，不出现重复订单号、重复 SKU、重复设备号。

## 12. 交付物

第一阶段交付：

- 全量模拟门店 seed 脚本。
- `$imagegen` 生成的商品图片和项目图片。
- 图片资产清单与图片提示词记录。
- 根目录和后端目录 NPM 命令。
- dry-run 输出。
- 首次真实写入报告。

第二阶段交付：

- 页面走查记录。
- 数据覆盖缺口清单。
- 如发现页面字段依赖缺失，补充 seed 字段或修正接口返回。

## 13. 建议排期

| 阶段 | 内容 | 预计耗时 |
| --- | --- | ---: |
| 方案确认 | 确认门店名、数据量级、是否写入当前 `.env` 数据库 | 0.5 小时 |
| 图片资产生成 | 使用 `$imagegen` 生成商品和项目主图、保存资产、建立清单 | 1-3 小时 |
| 脚本开发 | 新增 seed 脚本、数据模板、清理保护、报告输出 | 4-6 小时 |
| 技术验证 | dry-run、真实写入、构建和测试 | 1-2 小时 |
| 产品验收 | 管理端和终端核心页面走查 | 1-2 小时 |
| 修正补数 | 根据页面缺口补充字段或数据关系 | 1-3 小时 |

## 14. 需要产品确认的点

建议默认采用以下选择：

- 门店名称：`Ami 全量演示门店`
- 数据规模：标准演示包，约 1,000-1,240 名客户。
- 图片策略：每个商品和项目各 1 张 `$imagegen` 主图，统一轻奢美业风格。
- 写入目标：当前 `packages/server-v2/.env` 指向的数据库。
- 重跑策略：允许刷新该模拟门店内脚本数据，不影响其他门店。

确认后即可进入脚本开发和首次 dry-run。
