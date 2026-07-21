# Ami Aura Lite / Terminal API

## Overview

This document covers the terminal-facing API surface for Ami Aura Lite. The Core side keeps using:

- `Authorization: Bearer <token>`
- `X-Store-Id: <storeId>`
- `PaginatedResponse<T>` with `items / data / total / page / pageSize`
- Unified error payload: `{ message, code?, status?, details? }`

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| POST | `/terminal/devices/login` | Device login |
| GET | `/terminal/devices/info` | Current device profile |
| POST | `/terminal/devices/heartbeat` | Heartbeat |
| POST | `/terminal/devices/unbind` | Request unbind |
| GET | `/terminal/devices/paginated` | Device list |
| PUT | `/terminal/devices/{id}` | Update device |
| POST | `/terminal/devices/{id}/disable` | Disable device |
| POST | `/terminal/devices/{id}/unbind/approve` | Approve unbind |
| GET | `/terminal/bootstrap` | Bootstrap payload for device startup |
| GET | `/terminal/sync/catalog` | Incremental catalog sync |
| GET | `/terminal/config` | Terminal config |
| GET | `/terminal/dashboard/stats` | Store dashboard stats |
| GET | `/terminal/dashboard/role` | Role dashboard payload |
| GET | `/terminal/customers/search` | Search customers |
| POST | `/terminal/customers/quick-create` | Quick customer creation through `CustomersService.create` |
| GET | `/terminal/customers/{id}/summary` | Customer summary |
| GET | `/terminal/customers/{id}/cards` | Customer cards |
| GET | `/terminal/customers/{id}/recommendations` | Recommendations for customer |
| GET | `/customers/{id}/health-profile` | Health profile |
| PUT | `/customers/{id}/health-profile` | Update health profile |
| GET | `/customers/{id}/consumption-records/paginated` | Customer consumption records |
| GET | `/customers/{id}/behavior-profile` | Customer behavior profile |
| GET | `/terminal/tasks` | Service tasks |
| GET | `/terminal/tasks/{id}` | Service task detail |
| POST | `/terminal/tasks` | Create service task |
| PATCH | `/terminal/tasks/{id}/start` | Start service |
| PATCH | `/terminal/tasks/{id}/complete` | Complete service and write service consumption stock movements |
| PATCH | `/terminal/tasks/{id}/cancel` | Cancel service |
| GET | `/terminal/reservations/today` | Today's reservations for the bound store |
| POST | `/terminal/reservations` | Create reservation |
| PUT | `/terminal/reservations/{id}` | Update reservation time, beautician, status, or remark |
| PATCH | `/terminal/reservations/{id}/confirm` | Confirm reservation |
| PATCH | `/terminal/reservations/{id}/check-in` | Mark customer arrived |
| PATCH | `/terminal/reservations/{id}/cancel` | Cancel reservation with optional reason |
| POST | `/terminal/cards/verify` | Card usage preview |
| POST | `/terminal/cards/consume` | Card usage verify through `CardsService.verifyCardUsage` |
| POST | `/terminal/cashier/checkout` | Create cashier order through `OrdersService.createProductOrder`; terminal keeps shift guard and split-order response |
| POST | `/terminal/cashier-orders/{id}/complete-payment` | Complete payment and write payment record |
| POST | `/terminal/card-orders` | Create card order, customer card, order item, payment record, and attribution |
| POST | `/terminal/recharge-orders` | Create recharge order through `OrdersService.createRechargeOrder` |
| POST | `/terminal/print-jobs` | Create persisted print job |
| GET | `/terminal/print-jobs/{id}` | Get persisted print job |
| GET | `/terminal/card-usage-records/paginated` | Card usage history |
| GET | `/terminal/projects/{id}/bom` | Project BOM |
| GET | `/terminal/inventory/stock` | Inventory check |
| POST | `/terminal/consumption-records` | Consumption submission and stock movements |
| POST | `/terminal/skin-tests` | Create skin test |
| GET | `/terminal/skin-tests` | Skin test list |
| GET | `/terminal/skin-tests/{id}` | Skin test detail |
| POST | `/terminal/skin-tests/{id}/bind-customer` | Bind skin test to customer |
| GET | `/terminal/skin-tests/{id}/recommendations` | Recommendations from skin test |
| POST | `/terminal/recommendation-events` | Persisted recommendation feedback event |
| GET | `/terminal/promotions/available` | Available persisted promotions, with default fallback |

## Notes

- Terminal mock data should reuse the same customer, project, card, BOM, and inventory sources as Core.
- Service completion should accept `consumptionItems` inline to avoid dual-write mismatch between terminal and Core.
- Cashier, card usage, recharge, quick customer creation, recommendation feedback, promotion, and print job flows now write structured backend tables instead of relying only on JSON snapshots or temporary objects.
- Terminal and management endpoints keep separate authentication, but shared business facts are written by the same Core services: `CardsService.verifyCardUsage`, `CustomersService.create`, `OrdersService.createRechargeOrder`, and `OrdersService.createProductOrder`.
- Product sales and service consumption create `StockMovement` rows so inventory can be audited by source type and source id.
- Marketing attribution is delegated to the shared `MarketingAttributionService`, which selects one last-touch primary source across valid automation touches and marketing-page leads. Terminal no longer keeps a local attribution fallback, so the same order cannot be attributed by a different terminal-only rule.
- The terminal API is intentionally shaped so it can later move behind a separate terminal service without changing the client contract.

## Cashier Discount Allocation

`POST /terminal/cashier/checkout` supports the same order-level discount allocation contract as the management order APIs.

Request fields:

| Field | Description |
| --- | --- |
| `discountMode` | `none`, `amount`, `rate`, `package_price`, or `manual` |
| `discountAmount` | Order discount amount for `amount` mode |
| `discountRate` | Discount rate for `rate` mode, for example `0.8` means 20% off |
| `packagePrice` | Final package deal price for `package_price` mode |
| `allocationMethod` | `price_ratio` by default |
| `discountSource` | `order`, `package`, `promotion`, `coupon`, or `manual` |
| `items[].listAmount` | Original line amount, defaults to `quantity * unitPrice` |
| `items[].isGift` | Gift line, net revenue is zero and it is excluded from order discount allocation |

Response fields include `listAmount`, `itemDiscountAmount`, `orderDiscountAmount`, `totalDiscountAmount`, `netAmount`, `discountSource`, `allocationMethod`, and the same line-level fields on `items[]`. Cashier receipts should display original amount, discount, and paid amount from these values.
# Kiosk 退款闭环补充（2026-07-12）

- Kiosk 退款入口按 `checkoutGroupNo` 聚合展示，但最终退款落到真实订单和订单明细。
- 可退金额、可退数量和库存追溯状态统一读取订单退款预览，不再使用订单原始 `netAmount`。
- 退款必须选择“仅退款”或“退款退货”；项目退款退货表示冲销原服务耗材，不撤销服务事实。

# 智能推荐终端跟进与真实投递补充（2026-07-13）

终端跟进任务支持以下推荐闭环字段：

| Field | Description |
| --- | --- |
| `recommendationInstanceId` | 稳定推荐实例 ID，展示、采纳、执行和复盘共用 |
| `adoptionId` | 统一采纳记录 ID |
| `sourceRecommendationKey` | 幂等来源键；自动投递使用 `delivery-job:{id}` |
| `source` | `recommendation` 或 `marketing_automation` |
| `triggerType` | 推荐或自动策略触发类型 |

真实投递规则：

- 自动策略启用时不创建终端任务。
- 调度先生成 `pending` execution、`queued` touch 和 delivery job，Worker 再创建终端任务。
- 只有 `TerminalFollowUpTask` 创建或命中同一投递任务幂等记录后，touch 才进入 `delivered`。
- 终端侧直接触发自动策略也必须先创建真实 `TerminalFollowUpTask`；任务创建失败时 touch 进入 `failed` 并记录错误，禁止直接写 `reached` 或增加 reachedCount。
- 短信、微信未配置时返回 `channel_not_configured` 并进入死信，不伪造成功。
- 临时网络错误按 1、5、20 分钟重试，最多三次重试；租约过期后自动回到队列。
- 历史 `reached` 不再作为订单归因依据；只有 `sent/delivered/opened/clicked/converted` 可归因。
- 推荐直接创建的终端任务和自动投递任务都会保留推荐实例、采纳、客户和权益来源，完成预约或成交后写入实际转化事实。
- 管理端“营销工作台”由 workspace 模式决定下发接口：灰度门店调用推荐实例统一 adoption；非灰度门店继续调用旧 `/marketing/recommendations/{id}/follow-up-tasks`，但该旧入口已在服务端转发统一采纳服务，不再直接创建孤立任务。部分客户失败返回 `partial_failed`，全部失败返回 `failed`，同时返回创建、去重和失败明细；负责人角色、用户和美容师分配继续透传。全部门店完成 V2 切换并满足 14 天零调用门禁后，旧入口才允许删除。
