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
| POST | `/terminal/customers/quick-create` | Quick customer creation |
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
| POST | `/terminal/cards/consume` | Card usage verify |
| POST | `/terminal/cashier/checkout` | Create cashier order, order items, payment record, consumption record, and product sale stock movements |
| POST | `/terminal/cashier-orders/{id}/complete-payment` | Complete payment and write payment record |
| POST | `/terminal/card-orders` | Create card order, customer card, order item, payment record, and attribution |
| POST | `/terminal/recharge-orders` | Create recharge order, order item, payment record, consumption record, and attribution |
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
- Cashier, card order, recharge, recommendation feedback, promotion, and print job flows now write structured backend tables instead of relying only on JSON snapshots or temporary objects.
- Product sales and service consumption create `StockMovement` rows so inventory can be audited by source type and source id.
- Marketing attribution uses the latest valid automation touch in the attribution window and links the touch to the resulting order revenue.
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
