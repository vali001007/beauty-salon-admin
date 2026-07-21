export type CardMasterMergeMapping = {
  sourceId: number;
  targetId: number;
  allowProjectMismatch?: boolean;
};

export const CARD_MASTER_MERGE_MAP: CardMasterMergeMapping[] = [
  { sourceId: 12, targetId: 2 },
  { sourceId: 13, targetId: 3 },
  { sourceId: 15, targetId: 5 },
  { sourceId: 16, targetId: 6, allowProjectMismatch: true },
];

export const CARD_ORDER_ITEM_TYPES = ['card', 'card_sale', 'customer_card', 'member_card'];

export function normalizeCardMasterName(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('zh-CN');
}

function isMatchingIdentifier(value: unknown, sourceId: number) {
  return value === sourceId || (typeof value === 'string' && value.trim() === String(sourceId));
}

export function replaceCardIdentifiers(value: unknown, sourceId: number, targetId: number, key?: string): unknown {
  if ((key === 'cardId' || key === 'itemId') && isMatchingIdentifier(value, sourceId)) {
    return typeof value === 'string' ? String(targetId) : targetId;
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceCardIdentifiers(item, sourceId, targetId));
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        entryKey,
        replaceCardIdentifiers(entryValue, sourceId, targetId, entryKey),
      ]),
    );
  }
  return value;
}

const toNumber = (value: unknown) => Number(value ?? 0);
const sum = (rows: any[], field: string) => rows.reduce((total, row) => total + toNumber(row[field]), 0);
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export type CardMergeSnapshot = {
  cards: any[];
  customerCards: any[];
  usageRecords: any[];
  orderItems: any[];
};

export async function collectCardMergeSnapshot(
  client: any,
  mappings: CardMasterMergeMapping[] = CARD_MASTER_MERGE_MAP,
): Promise<CardMergeSnapshot> {
  const ids = [...new Set(mappings.flatMap(({ sourceId, targetId }) => [sourceId, targetId]))];
  const [cards, customerCards, usageRecords, orderItems] = await Promise.all([
    client.card.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' } }),
    client.customerCard.findMany({
      where: { cardId: { in: ids } },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        customerId: true,
        cardId: true,
        totalTimes: true,
        remainingTimes: true,
        paidAmount: true,
        discountAmount: true,
        giftTimes: true,
      },
    }),
    client.cardUsageRecord.findMany({
      where: { cardId: { in: ids } },
      orderBy: { id: 'asc' },
      select: { id: true, customerCardId: true, customerId: true, cardId: true, times: true, recognizedAmount: true },
    }),
    client.orderItem.findMany({
      where: { itemType: { in: CARD_ORDER_ITEM_TYPES }, itemId: { in: ids } },
      orderBy: { id: 'asc' },
      select: { id: true, orderId: true, itemType: true, itemId: true, netAmount: true, payload: true },
    }),
  ]);
  return { cards, customerCards, usageRecords, orderItems };
}

function buildConservation(snapshot: Omit<CardMergeSnapshot, 'cards'>) {
  return {
    customerCards: {
      count: snapshot.customerCards.length,
      totalTimes: sum(snapshot.customerCards, 'totalTimes'),
      remainingTimes: sum(snapshot.customerCards, 'remainingTimes'),
      paidAmount: roundMoney(sum(snapshot.customerCards, 'paidAmount')),
      discountAmount: roundMoney(sum(snapshot.customerCards, 'discountAmount')),
      giftTimes: sum(snapshot.customerCards, 'giftTimes'),
    },
    usageRecords: {
      count: snapshot.usageRecords.length,
      times: sum(snapshot.usageRecords, 'times'),
      recognizedAmount: roundMoney(sum(snapshot.usageRecords, 'recognizedAmount')),
    },
    orderItems: {
      count: snapshot.orderItems.length,
      netAmount: roundMoney(sum(snapshot.orderItems, 'netAmount')),
    },
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, canonicalize(entryValue)]),
    );
  }
  return value ?? null;
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export async function auditCardMasterDeduplication(
  client: any,
  mappings: CardMasterMergeMapping[] = CARD_MASTER_MERGE_MAP,
) {
  const snapshot = await collectCardMergeSnapshot(client, mappings);
  const cardsById = new Map(snapshot.cards.map((card) => [card.id, card]));
  const groups = mappings.map((mapping) => {
    const source = cardsById.get(mapping.sourceId);
    const target = cardsById.get(mapping.targetId);
    const blockers: string[] = [];
    const warnings: string[] = [];
    const alreadyApplied = !source && Boolean(target);
    if (!source && !target) blockers.push('source_card_missing');
    if (!target) blockers.push('target_card_missing');
    if (source && target) {
      if (normalizeCardMasterName(source.name) !== normalizeCardMasterName(target.name)) blockers.push('name_mismatch');
      if ((source.storeId ?? null) !== (target.storeId ?? null)) blockers.push('store_scope_mismatch');
      if (stableJson(source.projects) !== stableJson(target.projects)) {
        if (mapping.allowProjectMismatch) warnings.push('approved_project_mismatch_keep_target');
        else blockers.push('projects_mismatch');
      }
    }
    const customerCards = snapshot.customerCards.filter((row) => row.cardId === mapping.sourceId);
    const usageRecords = snapshot.usageRecords.filter((row) => row.cardId === mapping.sourceId);
    const orderItems = snapshot.orderItems.filter((row) => row.itemId === mapping.sourceId);
    return {
      ...mapping,
      source,
      target,
      status: alreadyApplied
        ? 'already_applied'
        : blockers.length
          ? 'blocked'
          : warnings.length
            ? 'manual_review'
            : 'ready',
      blockers,
      warnings,
      references: buildConservation({ customerCards, usageRecords, orderItems }),
    };
  });
  return {
    mode: 'dry-run/read-only',
    status: groups.some((group) => group.status === 'blocked')
      ? 'blocked'
      : groups.some((group) => group.status === 'manual_review')
        ? 'manual_review'
        : groups.every((group) => group.status === 'already_applied')
          ? 'already_applied'
          : 'ready',
    groups,
    conservation: buildConservation(snapshot),
    snapshot,
  };
}

function assertConservation(before: unknown, after: unknown) {
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error(`次卡归并守恒校验失败：before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
  }
}

async function collectReferences(client: any, ids: number[]) {
  const [customerCards, usageRecords, orderItems] = await Promise.all([
    client.customerCard.findMany({
      where: { cardId: { in: ids } },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        cardId: true,
        totalTimes: true,
        remainingTimes: true,
        paidAmount: true,
        discountAmount: true,
        giftTimes: true,
      },
    }),
    client.cardUsageRecord.findMany({
      where: { cardId: { in: ids } },
      orderBy: { id: 'asc' },
      select: { id: true, cardId: true, times: true, recognizedAmount: true },
    }),
    client.orderItem.findMany({
      where: { itemType: { in: CARD_ORDER_ITEM_TYPES }, itemId: { in: ids } },
      orderBy: { id: 'asc' },
      select: { id: true, itemType: true, itemId: true, netAmount: true, payload: true },
    }),
  ]);
  return { customerCards, usageRecords, orderItems };
}

export async function applyCardMasterDeduplication(
  prisma: any,
  mappings: CardMasterMergeMapping[] = CARD_MASTER_MERGE_MAP,
) {
  return prisma.$transaction(async (tx: any) => {
    const audit = await auditCardMasterDeduplication(tx, mappings);
    if (audit.groups.some((group) => group.blockers.length)) {
      throw new Error(
        `次卡归并被阻断：${JSON.stringify(audit.groups.map((group) => ({ sourceId: group.sourceId, blockers: group.blockers })))}`,
      );
    }
    const before = audit.conservation;
    const activeMappings = mappings.filter((mapping) => {
      const group = audit.groups.find(
        (item) => item.sourceId === mapping.sourceId && item.targetId === mapping.targetId,
      );
      return group?.status !== 'already_applied';
    });
    if (!activeMappings.length) {
      return { status: 'already_applied', mappings, conservation: before };
    }

    for (const mapping of activeMappings) {
      await tx.customerCard.updateMany({ where: { cardId: mapping.sourceId }, data: { cardId: mapping.targetId } });
      await tx.cardUsageRecord.updateMany({ where: { cardId: mapping.sourceId }, data: { cardId: mapping.targetId } });
      const orderItems = await tx.orderItem.findMany({
        where: { itemType: { in: CARD_ORDER_ITEM_TYPES }, itemId: mapping.sourceId },
        orderBy: { id: 'asc' },
      });
      for (const orderItem of orderItems) {
        await tx.orderItem.update({
          where: { id: orderItem.id },
          data: {
            itemId: mapping.targetId,
            payload: replaceCardIdentifiers(orderItem.payload, mapping.sourceId, mapping.targetId),
          },
        });
      }

      const [customerCardRefs, usageRefs, orderItemRefs] = await Promise.all([
        tx.customerCard.count({ where: { cardId: mapping.sourceId } }),
        tx.cardUsageRecord.count({ where: { cardId: mapping.sourceId } }),
        tx.orderItem.count({ where: { itemType: { in: CARD_ORDER_ITEM_TYPES }, itemId: mapping.sourceId } }),
      ]);
      if (customerCardRefs || usageRefs || orderItemRefs) {
        throw new Error(`旧次卡 #${mapping.sourceId} 仍有引用，禁止删除`);
      }
      await tx.card.delete({ where: { id: mapping.sourceId } });
    }

    const targetIds = [...new Set(mappings.map((mapping) => mapping.targetId))];
    const afterReferences = await collectReferences(tx, targetIds);
    const after = buildConservation(afterReferences);
    assertConservation(before, after);
    return { status: 'applied', mappings, conservation: after };
  });
}
