type StockDeductionSource = {
  type: string;
  id?: number;
  no?: string | null;
  remark?: string;
};

export type StockDeductionItem = {
  productId: number;
  quantity: number;
  batchId?: number;
  unit?: string;
  remark?: string;
};

type DeductStockItemsParams = {
  storeId: number;
  movementType: string;
  source: StockDeductionSource;
  items: StockDeductionItem[];
  operatorId?: number;
};

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : 0;
}

function toNonNegativeStock(value: unknown): number {
  return Math.max(0, toNumber(value));
}

function createStockMovementNo(prefix = 'SM') {
  return `${prefix}${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function buildShortageRemark(baseRemark: string | undefined, requestedQty: number, appliedQty: number) {
  const remark = baseRemark || '库存自动扣减';
  if (appliedQty >= requestedQty) return remark;
  return `${remark}；库存不足：本次申请 ${requestedQty}，实际扣减 ${appliedQty}，不足 ${requestedQty - appliedQty}`;
}

function appendNoBatchRemark(remark: string) {
  return remark.includes('无批次') ? remark : `${remark}；无可用批次，仅扣减商品主库存`;
}

function isOutboundMovement(movementType: string) {
  return movementType.endsWith('_out') || movementType.includes('consume');
}

function resolveMovementCost(product: any, quantity: number, batch?: any) {
  const batchUnitCost = toNumber(batch?.unitCost);
  if (batch && batchUnitCost > 0) {
    return {
      unitCost: batchUnitCost,
      costAmount: batchUnitCost * Math.abs(quantity),
      costSource: 'batch_snapshot',
    };
  }
  const productUnitCost = toNumber(product?.costPrice);
  if (productUnitCost > 0) {
    return {
      unitCost: productUnitCost,
      costAmount: productUnitCost * Math.abs(quantity),
      costSource: 'product_master_estimate',
    };
  }
  return {
    unitCost: 0,
    costAmount: 0,
    costSource: 'missing_cost',
  };
}

async function createStockMovement(
  tx: any,
  params: {
    storeId: number;
    product: any;
    batchId?: number;
    movementType: string;
    quantity: number;
    beforeStock: number;
    afterStock: number;
    source: StockDeductionSource;
    unit?: string;
    remark: string;
    operatorId?: number;
    unitCost?: number;
    costAmount?: number;
    costSource?: string;
  },
) {
  return tx.stockMovement.create({
    data: {
      storeId: params.storeId,
      productId: params.product.id,
      batchId: params.batchId,
      movementNo: createStockMovementNo('SM'),
      movementType: params.movementType,
      quantity: params.quantity,
      beforeStock: params.beforeStock,
      afterStock: params.afterStock,
      unit: params.unit ?? params.product.specUnit ?? params.product.unit,
      unitCost: params.unitCost,
      costAmount: params.costAmount,
      costSource: params.costSource,
      sourceType: params.source.type,
      sourceId: params.source.id,
      sourceNo: params.source.no ?? undefined,
      operatorId: params.operatorId,
      remark: params.remark,
    },
  });
}

export async function deductStockItem(tx: any, params: Omit<DeductStockItemsParams, 'items'> & { item: StockDeductionItem }) {
  const requestedQty = toNumber(params.item.quantity);
  const productId = Number(params.item.productId);
  if (!params.storeId || !productId || requestedQty <= 0) return [];

  const product = await tx.product.findFirst({
    where: { id: productId, storeId: params.storeId, deletedAt: null },
  });
  if (!product) return [];

  const outbound = isOutboundMovement(params.movementType);
  const beforeStock = toNonNegativeStock(product.currentStock);
  const appliedTotal = outbound ? Math.min(beforeStock, requestedQty) : requestedQty;
  if (outbound && appliedTotal <= 0) {
    if (toNumber(product.currentStock) < 0) {
      await tx.product.update({ where: { id: product.id }, data: { currentStock: 0 } });
    }
    return [];
  }

  const baseRemark = buildShortageRemark(params.item.remark ?? params.source.remark, requestedQty, appliedTotal);
  const movements = [];
  let remainingToApply = appliedTotal;
  let runningBeforeStock = beforeStock;

  if (outbound) {
    const stockBatchDelegate = tx.stockBatch;
    const batches = stockBatchDelegate?.findMany
      ? params.item.batchId
        ? await stockBatchDelegate.findMany({
            where: { id: Number(params.item.batchId), productId: product.id, stock: { gt: 0 } },
            orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
          })
        : await stockBatchDelegate.findMany({
            where: { productId: product.id, stock: { gt: 0 } },
            orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
          })
      : [];

    for (const batch of batches) {
      if (remainingToApply <= 0) break;
      const beforeBatchStock = toNonNegativeStock(batch.stock);
      const batchAppliedQty = Math.min(beforeBatchStock, remainingToApply);
      if (batchAppliedQty <= 0) continue;
      remainingToApply -= batchAppliedQty;
      const afterStock = runningBeforeStock - batchAppliedQty;
      if (stockBatchDelegate?.update) {
        await stockBatchDelegate.update({
          where: { id: batch.id },
          data: { stock: Math.max(0, beforeBatchStock - batchAppliedQty) },
        });
      }
      const cost = resolveMovementCost(product, batchAppliedQty, batch);
      movements.push(await createStockMovement(tx, {
        storeId: params.storeId,
        product,
        batchId: batch.id,
        movementType: params.movementType,
        quantity: -batchAppliedQty,
        beforeStock: runningBeforeStock,
        afterStock,
        source: params.source,
        unit: params.item.unit,
        operatorId: params.operatorId,
        ...cost,
        remark: baseRemark,
      }));
      runningBeforeStock = afterStock;
    }
  }

  if (remainingToApply > 0) {
    const signedQuantity = outbound ? -remainingToApply : remainingToApply;
    const afterStock = outbound ? runningBeforeStock - remainingToApply : runningBeforeStock + remainingToApply;
    const cost = resolveMovementCost(product, remainingToApply);
    movements.push(await createStockMovement(tx, {
      storeId: params.storeId,
      product,
      movementType: params.movementType,
      quantity: signedQuantity,
      beforeStock: runningBeforeStock,
      afterStock,
      source: params.source,
      unit: params.item.unit,
      operatorId: params.operatorId,
      ...cost,
      remark: outbound ? appendNoBatchRemark(baseRemark) : baseRemark,
    }));
    runningBeforeStock = afterStock;
  }

  await tx.product.update({
    where: { id: product.id },
    data: { currentStock: Math.max(0, runningBeforeStock) },
  });

  return movements;
}

export async function deductStockItems(tx: any, params: DeductStockItemsParams) {
  const items = params.items
    .map((item) => ({
      ...item,
      productId: Number(item.productId),
      quantity: toNumber(item.quantity),
    }))
    .filter((item) => item.productId > 0 && item.quantity > 0);
  if (!params.storeId || !params.movementType || !params.source.type || !items.length) return [];

  if (params.source.id && tx.stockMovement?.findFirst) {
    const existed = await tx.stockMovement.findFirst({
      where: {
        sourceType: params.source.type,
        sourceId: params.source.id,
        movementType: params.movementType,
      },
      select: { id: true },
    });
    if (existed) return [];
  }

  const movements = [];
  for (const item of items) {
    movements.push(...await deductStockItem(tx, { ...params, item }));
  }
  return movements;
}
