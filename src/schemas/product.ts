import { z } from 'zod';

export const productSchema = z.object({
  name: z.string().min(1, '产品名称不能为空'),
  brand: z.string().min(1, '品牌不能为空'),
  specQuantity: z.number().positive('规格数量必须大于 0'),
  specUnit: z.string().min(1, '请选择规格单位'),
  packageUnit: z.enum(['瓶', '盒', '支', '个', '套', '包'], { error: '请选择包装' }),
  costPrice: z.number().positive('成本价必须大于 0'),
  retailPrice: z.number().positive('零售价必须大于 0'),
  shelfLife: z.number().int().positive('保质期必须为正整数'),
  categoryId: z.number().int().positive('请选择分类'),
  supplier: z.string().min(1, '供应商不能为空'),
  minPurchaseQty: z.number().int().positive('最小采购量必须为正整数'),
});

export type ProductFormData = z.infer<typeof productSchema>;
