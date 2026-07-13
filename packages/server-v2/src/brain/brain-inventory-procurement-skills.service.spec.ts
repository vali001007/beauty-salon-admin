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
  });
});
