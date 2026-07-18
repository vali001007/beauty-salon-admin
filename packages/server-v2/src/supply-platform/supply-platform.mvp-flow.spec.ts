import { SupplyPlatformService } from './supply-platform.service.js';

describe('SupplyPlatform MVP flow', () => {
  it('runs supplier listing to quote, replenishment order, accept, ship, receive and settlement in one service flow', async () => {
    const state = {
      suppliers: [{ id: 8, name: 'Ami Supply', deletedAt: null, platformFeeRate: 0.02, rebateRate: 0.05 }],
      stores: [{ id: 3, name: 'Ami Demo', deletedAt: null }],
      skus: [] as any[],
      quotes: [] as any[],
      orders: [] as any[],
      shipments: [] as any[],
      shipmentItems: [] as any[],
      products: [{ id: 101, storeId: 3, name: 'Repair Mask', currentStock: 2, unit: 'box', deletedAt: null }],
      stockBatches: [] as any[],
      stockMovements: [] as any[],
      receipts: [] as any[],
      settlements: [] as any[],
      orderItems: [] as any[],
    };
    const nextId = (() => {
      let id = 1000;
      return () => ++id;
    })();
    const matchWhere = (item: any, where: any = {}) =>
      Object.entries(where).every(([key, value]) => {
        if (value === undefined) return true;
        if (value && typeof value === 'object' && 'in' in value)
          return (value as { in: unknown[] }).in.includes(item[key]);
        if (value && typeof value === 'object' && 'gte' in value) return item[key] >= (value as { gte: any }).gte;
        if (value && typeof value === 'object' && 'lt' in value) return item[key] < (value as { lt: any }).lt;
        return item[key] === value;
      });
    const prisma: any = {
      $transaction: async (input: any) => (Array.isArray(input) ? Promise.all(input) : input(prisma)),
      $executeRaw: jest.fn(async () => 0),
      $queryRaw: jest.fn(async () => []),
      supplySupplier: {
        findFirst: jest.fn(async ({ where }: any) => state.suppliers.find((item) => matchWhere(item, where))),
      },
      store: {
        findFirst: jest.fn(async ({ where }: any) => state.stores.find((item) => matchWhere(item, where))),
      },
      supplySku: {
        findFirst: jest.fn(async ({ where }: any) => state.skus.find((item) => matchWhere(item, where))),
        findMany: jest.fn(async ({ where }: any) => state.skus.filter((item) => matchWhere(item, where))),
        create: jest.fn(async ({ data }: any) => {
          const item = {
            id: nextId(),
            deletedAt: null,
            ...data,
            supplier: state.suppliers.find((supplier) => supplier.id === data.supplierId),
          };
          state.skus.push(item);
          return item;
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const item = state.skus.find((target) => target.id === where.id);
          Object.assign(item, data);
          return item;
        }),
      },
      supplyQuote: {
        findFirst: jest.fn(async ({ where }: any) => state.quotes.find((item) => matchWhere(item, where))),
        findMany: jest.fn(async ({ where }: any) => state.quotes.filter((item) => matchWhere(item, where))),
        create: jest.fn(async ({ data }: any) => {
          const item = { id: nextId(), deletedAt: null, ...data };
          state.quotes.push(item);
          return item;
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const item = state.quotes.find((target) => target.id === where.id);
          Object.assign(item, data);
          return item;
        }),
      },
      procurementOrder: {
        create: jest.fn(async ({ data }: any) => {
          const items = data.items.create.map((item: any) => ({
            id: nextId(),
            orderId: undefined,
            receivedQty: 0,
            ...item,
          }));
          const order = {
            id: nextId(),
            ...data,
            items,
            shipments: [],
            supplier: state.suppliers.find((supplier) => supplier.id === data.supplierId),
            store: state.stores.find((store) => store.id === data.storeId),
          };
          order.items.forEach((item: any) => {
            item.orderId = order.id;
            item.supplySku = state.skus.find((sku) => sku.id === item.supplySkuId);
          });
          state.orderItems.push(...order.items);
          state.orders.push(order);
          return order;
        }),
        findUnique: jest.fn(async ({ where }: any) =>
          state.orders.find((item) =>
            where.id !== undefined ? item.id === where.id : item.idempotencyKey === where.idempotencyKey,
          ),
        ),
        update: jest.fn(async ({ where, data }: any) => {
          const item = state.orders.find((target) => target.id === where.id);
          Object.assign(item, data);
          return item;
        }),
        findMany: jest.fn(async ({ where }: any) => state.orders.filter((item) => matchWhere(item, where))),
      },
      procurementReceipt: {
        findUnique: jest.fn(async ({ where }: any) =>
          state.receipts.find((item) => item.idempotencyKey === where.idempotencyKey),
        ),
        create: jest.fn(async ({ data }: any) => {
          const item = { id: nextId(), ...data };
          state.receipts.push(item);
          return item;
        }),
      },
      supplierShipment: {
        create: jest.fn(async ({ data }: any) => {
          const shipment = {
            id: nextId(),
            ...data,
            status: 'shipped',
            items: data.items.create.map((item: any) => ({
              id: nextId(),
              shipmentId: undefined,
              receivedQty: 0,
              ...item,
            })),
          };
          shipment.items.forEach((item: any) => {
            item.shipmentId = shipment.id;
            item.orderItem = state.orderItems.find((orderItem) => orderItem.id === item.orderItemId);
            item.supplySku = state.skus.find((sku) => sku.id === item.supplySkuId);
          });
          state.shipments.push(shipment);
          state.shipmentItems.push(...shipment.items);
          const order = state.orders.find((item) => item.id === data.orderId);
          order.shipments = [shipment];
          return shipment;
        }),
      },
      product: {
        findFirst: jest.fn(async ({ where }: any) => state.products.find((item) => matchWhere(item, where))),
        update: jest.fn(async ({ where, data }: any) => {
          const item = state.products.find((target) => target.id === where.id);
          if (!item) throw new Error(`Product ${where.id} not found`);
          if (data.currentStock?.increment) item.currentStock += data.currentStock.increment;
          return item;
        }),
      },
      stockBatch: {
        create: jest.fn(async ({ data }: any) => {
          const item = { id: nextId(), ...data };
          state.stockBatches.push(item);
          return item;
        }),
      },
      stockMovement: {
        create: jest.fn(async ({ data }: any) => {
          const item = { id: nextId(), ...data };
          state.stockMovements.push(item);
          return item;
        }),
      },
      supplierShipmentItem: {
        update: jest.fn(async ({ where, data }: any) => {
          const item = state.shipmentItems.find((target) => target.id === where.id);
          if (data.receivedQty?.increment) item.receivedQty += data.receivedQty.increment;
          return item;
        }),
      },
      procurementOrderItem: {
        update: jest.fn(async ({ where, data }: any) => {
          const item = state.orderItems.find((target) => target.id === where.id);
          if (data.receivedQty?.increment) item.receivedQty += data.receivedQty.increment;
          return item;
        }),
        findMany: jest.fn(async ({ where }: any) => state.orderItems.filter((item) => item.orderId === where.orderId)),
      },
      supplySettlement: {
        upsert: jest.fn(async ({ where, create, update }: any) => {
          const existing = state.settlements.find(
            (item) =>
              item.supplierId === where.supplierId_settleMonth.supplierId &&
              item.settleMonth === where.supplierId_settleMonth.settleMonth,
          );
          if (existing) {
            Object.assign(existing, update);
            return existing;
          }
          const item = { id: nextId(), ...create };
          state.settlements.push(item);
          return item;
        }),
      },
    };

    const service = new SupplyPlatformService(prisma);
    const supplierActor = { id: 91, permissions: ['core:supply:supplier'], supplySupplierId: 8 };
    const managerActor = { id: 1, permissions: ['core:supply:manage'] };

    const sku = await service.createSku({ supplierId: 8, name: 'Repair Mask', unit: 'box' } as any, supplierActor);
    await service.auditSku(sku.id, { auditStatus: 'approved', status: 'active' } as any, managerActor);
    const quote = await service.createQuote(
      { supplySkuId: sku.id, price: 12, moq: 10, stockStatus: 'available' } as any,
      supplierActor,
    );
    await service.auditQuote(quote.id, { auditStatus: 'approved', status: 'active' } as any, managerActor);

    const order = await service.createOrder({
      idempotencyKey: 'mvp-order-1',
      storeId: 3,
      supplierId: 8,
      sourceType: 'replenishment',
      items: [{ productId: 101, supplySkuId: sku.id, quoteId: quote.id, quantity: 3 }],
    } as any);
    await service.updateOrderStatus(order.id, { status: 'accepted' } as any, supplierActor);
    const shipment = await service.createShipment(
      order.id,
      { items: [{ orderItemId: order.items[0].id, supplySkuId: sku.id, shippedQty: 10, batchNo: 'B-MVP' }] } as any,
      supplierActor,
    );
    const receipt = await service.receiveOrder(order.id, {
      idempotencyKey: 'mvp-receipt-1',
      items: [{ shipmentItemId: shipment.items[0].id, productId: 101, receivedQty: 10 }],
    } as any);
    const settlement = await service.generateSettlement({
      supplierId: 8,
      settleMonth: new Date().toISOString().slice(0, 7),
    } as any);

    expect(order.totalAmount).toBe(120);
    expect(state.orders[0].status).toBe('received');
    expect(receipt).toEqual(expect.objectContaining({ affectedStoreId: 3 }));
    expect(state.products[0].currentStock).toBe(12);
    expect(state.receipts).toHaveLength(1);
    expect(state.stockMovements[0]).toEqual(
      expect.objectContaining({
        productId: 101,
        movementType: 'purchase_inbound',
        sourceType: 'supply_platform_order',
        sourceId: order.id,
        sourceNo: order.orderNo,
      }),
    );
    expect(settlement.items[0]).toEqual(expect.objectContaining({ supplierId: 8, orderCount: 1, totalAmount: 120 }));
  });
});
