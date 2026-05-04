import { z } from 'zod';

export const inboundSchema = z.object({
  productId: z.number().int().positive('请选择产品'),
  batchNo: z.string().min(1, '批次号不能为空'),
  quantity: z.number().int().positive('入库数量必须为正整数'),
  productionDate: z.string().min(1, '请选择生产日期'),
  expiryDate: z.string().min(1, '请选择过期日期'),
});

export type InboundFormData = z.infer<typeof inboundSchema>;

export const purchaseOrderSchema = z.object({
  supplier: z.string().min(1, '供应商不能为空'),
  storeName: z.string().min(1, '请选择门店'),
  expectedDate: z.string().min(1, '请选择预计到货日期'),
  items: z.array(
    z.object({
      productName: z.string().min(1, '产品名称不能为空'),
      sku: z.string().min(1, 'SKU 不能为空'),
      quantity: z.number().int().positive('采购数量必须为正整数'),
      unitPrice: z.number().positive('单价必须大于 0'),
    })
  ).min(1, '至少添加一个采购项'),
});

export type PurchaseOrderFormData = z.infer<typeof purchaseOrderSchema>;

export const transferSchema = z.object({
  fromStore: z.string().min(1, '请选择调出门店'),
  toStore: z.string().min(1, '请选择调入门店'),
  productName: z.string().min(1, '请选择调拨产品'),
  quantity: z.number().int().positive('调拨数量必须为正整数'),
  reason: z.string().min(1, '调拨原因不能为空'),
});

export type TransferFormData = z.infer<typeof transferSchema>;
