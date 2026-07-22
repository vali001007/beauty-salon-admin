import {
  CARD_MASTER_MERGE_MAP,
  applyCardMasterDeduplication,
  replaceCardIdentifiers,
} from './card-master-deduplication';

describe('card master deduplication', () => {
  it('contains only the approved merge mappings', () => {
    expect(CARD_MASTER_MERGE_MAP).toEqual([
      { sourceId: 12, targetId: 2 },
      { sourceId: 13, targetId: 3 },
      { sourceId: 15, targetId: 5 },
      { sourceId: 16, targetId: 6, allowProjectMismatch: true },
    ]);
    expect(CARD_MASTER_MERGE_MAP.some((mapping) => mapping.sourceId === 17)).toBe(false);
  });

  it('replaces only matching cardId and itemId fields in JSON snapshots', () => {
    expect(
      replaceCardIdentifiers(
        {
          cardId: 16,
          itemId: '16',
          projectId: 16,
          amount: 5980,
          nested: [{ cardId: 16, itemId: 99, totalTimes: 20 }],
        },
        16,
        6,
      ),
    ).toEqual({
      cardId: 6,
      itemId: '6',
      projectId: 16,
      amount: 5980,
      nested: [{ cardId: 6, itemId: 99, totalTimes: 20 }],
    });
  });

  it('moves references before deleting the duplicate card and preserves totals', async () => {
    const events: string[] = [];
    const cards = new Map([
      [12, { id: 12, name: '补水护理 10 次卡', storeId: null, totalTimes: 10, price: 2680, projects: [] }],
      [2, { id: 2, name: '补水护理 10 次卡', storeId: null, totalTimes: 10, price: 2680, projects: [] }],
    ]);
    const customerCards = [{ id: 101, cardId: 12, totalTimes: 10, remainingTimes: 7, paidAmount: 2680 }];
    const usageRecords = [{ id: 201, cardId: 12, times: 3, recognizedAmount: 804 }];
    const orderItems = [{ id: 301, itemType: 'card', itemId: 12, netAmount: 2680, payload: { cardId: 12 } }];

    const tx: any = {
      card: {
        findMany: jest.fn(async ({ where }: any) =>
          [...cards.values()].filter((card) => where.id.in.includes(card.id)),
        ),
        delete: jest.fn(async ({ where }: any) => {
          events.push(`delete:${where.id}`);
          cards.delete(where.id);
        }),
      },
      customerCard: {
        findMany: jest.fn(async ({ where }: any) =>
          customerCards.filter((row) => where.cardId.in.includes(row.cardId)),
        ),
        updateMany: jest.fn(async ({ where, data }: any) => {
          events.push('customerCard:update');
          customerCards
            .filter((row) => row.cardId === where.cardId)
            .forEach((row) => {
              row.cardId = data.cardId;
            });
        }),
        count: jest.fn(async ({ where }: any) => customerCards.filter((row) => row.cardId === where.cardId).length),
      },
      cardUsageRecord: {
        findMany: jest.fn(async ({ where }: any) => usageRecords.filter((row) => where.cardId.in.includes(row.cardId))),
        updateMany: jest.fn(async ({ where, data }: any) => {
          events.push('usage:update');
          usageRecords
            .filter((row) => row.cardId === where.cardId)
            .forEach((row) => {
              row.cardId = data.cardId;
            });
        }),
        count: jest.fn(async ({ where }: any) => usageRecords.filter((row) => row.cardId === where.cardId).length),
      },
      orderItem: {
        findMany: jest.fn(async ({ where }: any) => {
          const ids = Array.isArray(where.itemId?.in) ? where.itemId.in : [where.itemId];
          return orderItems.filter((row) => ids.includes(row.itemId));
        }),
        update: jest.fn(async ({ where, data }: any) => {
          events.push('orderItem:update');
          Object.assign(orderItems.find((row) => row.id === where.id)!, data);
        }),
        count: jest.fn(
          async ({ where }: any) =>
            orderItems.filter((row) => row.itemId === where.itemId && where.itemType.in.includes(row.itemType)).length,
        ),
      },
    };
    const prisma: any = { $transaction: jest.fn((callback: any) => callback(tx)) };

    await applyCardMasterDeduplication(prisma, [{ sourceId: 12, targetId: 2 }]);

    expect(events).toEqual(['customerCard:update', 'usage:update', 'orderItem:update', 'delete:12']);
    expect(customerCards[0].cardId).toBe(2);
    expect(usageRecords[0].cardId).toBe(2);
    expect(orderItems[0]).toMatchObject({ itemId: 2, netAmount: 2680, payload: { cardId: 2 } });

    await expect(applyCardMasterDeduplication(prisma, [{ sourceId: 12, targetId: 2 }])).resolves.toEqual(
      expect.objectContaining({ status: 'already_applied' }),
    );
    expect(tx.card.delete).toHaveBeenCalledTimes(1);
  });
});
