# Ami Glow H5 版本部署与 API 说明

日期：2026-07-04
关联应用：`packages/Ami-Glow-H5`
关联计划：`docs/03-开发计划/Ami_Glow_H5版本详细开发计划-2026-07-04.md`

## 1. 应用定位

`packages/Ami-Glow-H5` 是 Ami Glow 客户服务 H5，不是营销落地页渲染器。

| 应用 | 定位 | 后端入口 |
| --- | --- | --- |
| `packages/Ami-Glow-H5` | 客户服务 H5：预约、我的权益、消费记录、AI 测肤 | `/api/customer-app/*` |
| `packages/Ami-Glow-MiniApp` | 微信小程序客户服务端 | `/api/customer-app/*` |
| `packages/marketing-h5` | 公开营销活动页 | `/api/public/marketing/pages/*` |

## 2. 本地运行

启动后端：

```powershell
npm.cmd run dev:api
```

启动 H5：

```powershell
npm.cmd run dev:ami-glow-h5
```

访问：

```text
http://127.0.0.1:5178/
```

带门店和渠道参数：

```text
http://127.0.0.1:5178/?storeId=6&channel=h5&qrcode=store
```

## 3. 构建与预览

构建：

```powershell
npm.cmd run build:ami-glow-h5
```

预览：

```powershell
npm.cmd run preview:ami-glow-h5
```

默认预览地址：

```text
http://127.0.0.1:4178/
```

## 4. 环境变量

H5 包已提供：

```text
packages/Ami-Glow-H5/.env.example
```

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `/api` | H5 请求 API 的前缀 |
| `VITE_API_PROXY_TARGET` | `http://localhost:8080` | 本地 Vite 代理目标 |
| `VITE_APP_BASE` | `/` | 静态部署子路径，例如 `/ami-glow/` |

建议生产环境优先同域部署：

```text
https://h5.example.com/ami-glow/      -> H5 静态文件
https://h5.example.com/api/*          -> server-v2 API
```

如果 H5 和 API 不同域，后端网关必须允许 H5 域名的 CORS，并保留 `Authorization`、`X-Store-Id` 请求头。

## 5. API 复用清单

H5 当前复用 `customer-app` 主线接口：

| 模块 | Method | Path | H5 使用场景 |
| --- | --- | --- | --- |
| 身份 | `POST` | `/customer-app/auth/h5-guest` | H5 游客 token，使用稳定 `sessionId` |
| 身份 | `POST` | `/customer-app/auth/wechat-login` | 微信小程序登录；H5 不再依赖该开发态 code 机制 |
| 身份 | `POST` | `/customer-app/auth/bind-phone` | 手机号绑定客户 |
| 身份 | `GET` | `/customer-app/me` | 登录态恢复、我的页客户信息 |
| 首页 | `GET` | `/customer-app/home` | 首页门店、Banner、推荐项目 |
| 项目 | `GET` | `/customer-app/projects` | 预约页项目列表 |
| 项目 | `GET` | `/customer-app/projects/:id` | 项目详情 |
| 预约 | `GET` | `/customer-app/projects/:id/available-beauticians` | 预约弹层美容师 |
| 预约 | `GET` | `/customer-app/reservations/availability` | 预约弹层可约时段 |
| 预约 | `POST` | `/customer-app/reservations` | 创建预约 |
| 我的 | `GET` | `/customer-app/me/reservations` | 我的预约 |
| 我的 | `POST` | `/customer-app/me/reservations/:id/cancel` | 取消预约 |
| 我的 | `GET` | `/customer-app/me/cards` | 我的次卡 |
| 我的 | `GET` | `/customer-app/me/consumption-records` | 消费记录 |
| 我的 | `GET` | `/customer-app/me/member-card` | 会员卡 |
| 权益 | `POST` | `/customer-app/promotions/:id/claim` | 领取权益 |
| 测肤 | `POST` | `/customer-app/skin-tests/analyze` | AI 测肤 |
| 测肤 | `GET` | `/customer-app/skin-tests/:id` | 测肤报告 |
| 测肤 | `GET` | `/customer-app/skin-tests/:id/recommendations` | 测肤推荐项目 |
| 埋点 | `POST` | `/customer-app/events` | H5 行为事件 |

## 6. H5 身份策略

当前 H5 使用独立游客登录接口：

```text
POST /customer-app/auth/h5-guest
body.sessionId = <local session id>
```

该接口会创建或更新 `CustomerAppIdentity`，`source=ami_glow_h5`，返回客户侧 token。H5 再调用：

```text
POST /customer-app/auth/bind-phone
```

产品影响：

1. 一期不依赖公众号网页 OAuth，也能完成手机号绑定、预约和我的服务查询。
2. H5 不再复用微信登录开发态 code，身份边界比原 MVP 方案更清晰。
3. 后续生产若要求真实微信身份，可在 `h5-guest` 之后叠加 `wechat-oauth-login`，并接公众号/开放平台配置。
4. H5 已兼容读取微信内置浏览器回传的 `code/state`，当前仅作为 tracking/后续 OAuth 预留，不阻塞 P0。

后端验收：

```powershell
npm.cmd --prefix packages/server-v2 run test -- customer-app.service.spec.ts --runInBand
```

## 7. 渠道与埋点

H5 读取 URL 参数：

| 参数 | 作用 |
| --- | --- |
| `storeId` | 门店上下文 |
| `channel` | 渠道，如 `h5`、`wechat_h5`、`sms`、`qrcode` |
| `campaignId` / `utm_campaign` | 活动归因 |
| `promotionId` | 权益活动 |
| `staffId` | 员工分享 |
| `utm_source` / `utm_medium` | 标准 UTM |

已上报事件：

| 场景 | eventType |
| --- | --- |
| 首页浏览 | `h5_view_home` |
| Banner 点击 | `h5_click_banner` |
| 项目详情浏览 | `h5_view_project` |
| 点击预约 | `h5_click_book` |
| 预约成功 | `h5_reservation_success` |
| 预约失败 | `h5_booking_failed` |
| 权益领取 | `h5_promotion_claim` |
| 我的页浏览 | `h5_view_mine` |
| 测肤开始 | `h5_skin_test_start` |
| 测肤完成 | `h5_skin_test_complete` |
| 测肤推荐点击 | `h5_click_recommendation` |

H5 事件写入规则：

| 字段 | H5 默认值 |
| --- | --- |
| `source` | `ami_glow_h5` |
| `channel` | URL `channel` 参数，否则普通浏览器 `h5`、微信内置浏览器 `wechat_h5` |
| `sessionId` | H5 本地会话 ID |

管理端事件查询已支持按 `source` 过滤，因此可以区分 `ami_glow` 小程序事件和 `ami_glow_h5` H5 事件。

会产生真实行为事件的业务动作也保留 H5 来源：

| 动作 | 后端事件 | H5 来源 |
| --- | --- | --- |
| 创建预约 | `miniapp_reservation_success` | `ami_glow_h5` |
| 预约关联活动 | `promotion_reserved` | `ami_glow_h5` |
| 领取权益 | `promotion_claimed` | `ami_glow_h5` |

预约管理承接：H5 创建预约时会把 `来源：Ami Glow H5`、`渠道`、`Campaign`、`员工ID`、`活动ID` 和 `幂等键` 写入预约备注；管理端项目预约列表会从这些信息推断并展示“来源”标签。

## 8. 验收命令

构建验收：

```powershell
npm.cmd run build:ami-glow-h5
```

只读浏览器冒烟：

```powershell
npm.cmd run check:ami-glow-h5
```

mock 全流程冒烟：

```powershell
npm.cmd run check:ami-glow-h5:mock-flow
```

只读冒烟说明：

1. 默认检查 `http://127.0.0.1:5178`。
2. 可用 `AMI_GLOW_H5_URL` 指定地址。
3. 脚本会拦截 `/api/customer-app/events`，避免只读冒烟写行为事件表。
4. 脚本会检查首页、预约、我的、工具和项目详情，不提交预约、不绑定手机号、不上传测肤图。

mock 全流程冒烟说明：

1. 默认检查 `http://127.0.0.1:5178`。
2. 会拦截所有 `/api/customer-app/*` 请求，使用固定 mock 数据。
3. 会真实操作 H5 页面上的手机号绑定、预约弹层、我的服务页、测肤上传和报告页。
4. 不会调用真实后端，不会写客户、预约、权益、测肤或事件数据。

指定地址示例：

```powershell
$env:AMI_GLOW_H5_URL='http://127.0.0.1:4178'; npm.cmd run check:ami-glow-h5
```

真实写库预约验收必须先获得明确授权，并提供测试门店、项目和手机号：

```powershell
$env:AMI_GLOW_H5_ALLOW_WRITES='1'
$env:AMI_GLOW_H5_URL='http://127.0.0.1:5178'
$env:AMI_GLOW_H5_STORE_ID='<测试门店ID>'
$env:AMI_GLOW_H5_PROJECT_ID='<可预约项目ID>'
$env:AMI_GLOW_H5_PHONE='<测试手机号>'
$env:AMI_GLOW_H5_NAME='H5 真实联调客户'
npm.cmd run check:ami-glow-h5:real-write
```

未设置 `AMI_GLOW_H5_ALLOW_WRITES=1` 时，脚本会直接失败退出，不会写客户、预约或事件数据。

## 9. 真实写库联调门禁

以下动作会写真实业务数据，需要测试门店和明确授权：

| 动作 | 写入影响 |
| --- | --- |
| 手机号绑定 | 可能创建或更新客户、CustomerAppIdentity |
| 创建预约 | 写入 Reservation，并产生 `miniapp_reservation_success`；H5 会传 `source=ami_glow_h5`、`campaignId`、`promotionId`、`staffId` |
| 取消预约 | 更新 Reservation 状态 |
| 领取权益 | 写入 CustomerAppEvent，可能增加权益发放计数；H5 会传 `source=ami_glow_h5` |
| AI 测肤 | 写入测肤报告/客户健康档案，可能调用 AI Gateway |

建议真实联调前确认：

1. 测试门店 `storeId`。
2. 测试手机号。
3. 可预约项目 ID。
4. 是否允许产生并保留测试预约。
5. 是否允许测试测肤图片写入。

## 10. 发布注意事项

1. HTML 不长缓存，静态 assets 可按 hash 长缓存。
2. 如果部署在子路径，必须设置 `VITE_APP_BASE`。
3. 生产 H5 不应暴露 AI Key、管理端 JWT 或后端内部配置。
4. 图片域名必须能被手机浏览器访问。
5. 微信内置浏览器上线前必须真机验证拍照、上传、拨号、返回路径。
6. 若后续接微信网页 OAuth，需要配置授权回调域名并明确隐私协议入口。
