import { z } from 'zod';

export const inboundSchema = z.object({
  productId: z.number().int().positive('请选择产品'),
  batchNo: z.string().min(1, '批次号不能为空'),
  quantity: z.number().int().positive('入库数量必须为正整数'),
  unitCost: z.number().min(0, '成本单价不能小于 0').optional(),
  totalAmount: z.number().min(0, '订单总价不能小于 0').optional(),
  supplier: z.string().optional(),
  productionDate: z.string().min(1, '请选择生产日期'),
  expiryDate: z.string().min(1, '请选择过期日期'),
});

export type InboundFormData = z.infer<typeof inboundSchema>;

export const inventoryAdjustmentSchema = z.object({
  productId: z.number().int().positive('请选择产品'),
  batchId: z.preprocess(
    (value) => {
      const numberValue = Number(value);
      return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : undefined;
    },
    z.number().int().positive().optional(),
  ),
  adjustmentType: z.enum(['manual_outbound', 'scrap_out', 'stocktake_loss', 'stocktake_gain', 'manual_correction']),
  quantity: z.number().positive('调整数量必须大于 0'),
  remark: z.string().optional(),
});

export type InventoryAdjustmentFormData = z.infer<typeof inventoryAdjustmentSchema>;
export type InventoryAdjustmentFormInput = z.input<typeof inventoryAdjustmentSchema>;

export const stocktakeSchema = z.object({
  productId: z.number().int().positive('请选择盘点产品'),
  actualStock: z.number().min(0, '实盘数量不能小于 0'),
  remark: z.string().optional(),
});

export type StocktakeFormData = z.infer<typeof stocktakeSchema>;

export const purchaseOrderSchema = z.object({
  supplier: z.string().min(1, '供应商不能为空'),
  storeId: z.number().int().positive('请选择门店').optional(),
  storeName: z.string().min(1, '请选择门店'),
  expectedDate: z.string().min(1, '请选择预计到货日期'),
  items: z.array(
    z.object({
      productId: z.number().int().positive('请选择产品').optional(),
      productName: z.string().min(1, '产品名称不能为空'),
      sku: z.string().min(1, 'SKU 不能为空'),
      quantity: z.number().int().positive('采购数量必须为正整数'),
      unitPrice: z.number().positive('单价必须大于 0'),
    })
  ).min(1, '至少添加一个采购项'),
});

export type PurchaseOrderFormData = z.infer<typeof purchaseOrderSchema>;

export const transferSchema = z.object({
  fromStoreId: z.number().int().positive('请选择调出门店'),
  toStoreId: z.number().int().positive('请选择调入门店'),
  items: z.array(z.object({
    productId: z.number().int().positive('请选择调拨产品'),
    quantity: z.number().int().positive('调拨数量必须为正整数'),
  })).min(1, '至少添加一个调拨产品'),
  reason: z.string().min(1, '调拨原因不能为空'),
  status: z.enum(['pending', 'completed']).optional(),
  applyStock: z.boolean().optional(),
}).refine((data) => data.fromStoreId !== data.toStoreId, {
  message: '调入门店不能与调出门店相同',
  path: ['toStoreId'],
});

export type TransferFormData = z.infer<typeof transferSchema>;
