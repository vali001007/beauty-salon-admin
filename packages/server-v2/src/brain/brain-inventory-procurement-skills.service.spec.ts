import { BrainInventorySkillsService } from './skills/brain-inventory-skills.service.js';

describe('BrainInventorySkillsService procurement analysis', () => {
  it('combines safety stock, minimum purchase quantity and supplier quotes', async () => {
    const prisma = {
      product: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, name: '补水精华', currentStock: 2, safetyStock: 5, minPurchaseQty: 8 },
        ]),
      },
      supplyCatalogMapping: {
        findMany: jest.fn().mockResolvedValue([
          {
            productId: 1,
            supplySku: {
              quotes: [
                { price: 20, moq: 5, leadDays: 3, supplier: { name: '供应商A', qualificationStatus: 'approved' } },
              ],
            },
          },
        ]),
      },
      procurementOrder: { findMany: jest.fn().mockResolvedValue([]) },
      procurementOrderItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            quantity: 5,
            subtotal: 100,
            order: {
              orderNo: 'PO-1',
              status: 'received',
              createdAt: new Date('2026-07-03T00:00:00.000Z'),
              supplier: { name: '供应商A' },
            },
            product: { name: '补水精华', category: { name: '精华安瓶' } },
          },
        ]),
      },
      supplySupplier: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 1, name: '供应商A', status: 'active', qualificationStatus: 'approved' }]),
      },
    };
    const service = new BrainInventorySkillsService(prisma as never);

    const result = await service.buildProcurementAnalysis({ storeId: 6, keyword: '补水' });

    expect(result.suggestions[0]).toMatchObject({
      productName: '补水精华',
      suggestedQty: 8,
      supplierName: '供应商A',
      unitPrice: 20,
      estimatedCost: 160,
      leadDays: 3,
    });
    expect(result.suppliers[0]).toMatchObject({ supplierName: '供应商A', quoteCount: 1 });
    expect(result.orderItems?.[0]).toMatchObject({
      orderNo: 'PO-1',
      supplierName: '供应商A',
      productName: '补水精华',
      categoryName: '精华安瓶',
      amount: 100,
    });
  });

  it('does not recommend healthy stock only because a minimum purchase quantity exists', async () => {
    const prisma = {
      product: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, name: '补水精华', currentStock: 20, safetyStock: 5, minPurchaseQty: 8 },
        ]),
      },
      supplyCatalogMapping: {
        findMany: jest.fn().mockResolvedValue([{
          productId: 1,
          supplySku: { quotes: [{ price: 20, moq: 5, leadDays: 3, supplier: { name: '供应商A', qualificationStatus: 'approved' } }] },
        }]),
      },
      procurementOrder: { findMany: jest.fn().mockResolvedValue([]) },
      procurementOrderItem: { findMany: jest.fn().mockResolvedValue([]) },
      supplySupplier: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 1, name: '供应商A', status: 'active', qualificationStatus: 'approved' }]),
      },
    };
    const service = new BrainInventorySkillsService(prisma as never);

    const result = await service.buildProcurementAnalysis({ storeId: 6 });

    expect(result.suggestions).toEqual([]);
  });
});
