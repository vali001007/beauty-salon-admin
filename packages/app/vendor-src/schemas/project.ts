import { z } from 'zod';

export const projectSchema = z.object({
  name: z.string().min(1, '项目名称不能为空'),
  duration: z.number().int().positive('服务时长必须为正整数'),
  price: z.number().positive('价格必须大于 0'),
  bom: z.array(
    z.object({
      productName: z.string().min(1, '产品名称不能为空'),
      sku: z.string().min(1, 'SKU 不能为空'),
      standardQty: z.number().positive('标准用量必须大于 0'),
      unit: z.string().min(1, '单位不能为空'),
    })
  ).optional(),
});

export type ProjectFormData = z.infer<typeof projectSchema>;
