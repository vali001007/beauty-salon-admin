import { z } from 'zod';

export const marketingActivitySchema = z.object({
  title: z.string().min(1, '活动标题不能为空'),
  activityType: z.string().min(1, '请选择活动类型'),
  description: z.string().min(1, '活动描述不能为空'),
  startDate: z.string().min(1, '请选择开始日期'),
  endDate: z.string().min(1, '请选择结束日期'),
  targetCustomers: z.string().optional(),
  targetSegment: z.string().optional(),
  targetSkinType: z.string().optional(),
  targetSpecialTags: z.array(z.string()).optional(),
  discountType: z.string().min(1, '请选择优惠类型'),
  discountValue: z.string().min(1, '请填写优惠内容'),
  discount: z.string().optional(),
  budget: z.string().optional(),
  targetParticipants: z.string().optional(),
  targetRevenue: z.string().optional(),
  channels: z.array(z.string()).optional(),
  maxUsagePerPerson: z.string().optional(),
  minSpend: z.string().optional(),
  stackable: z.union([z.boolean(), z.string()]).optional().transform((v) => v === true || v === 'true'),
  image: z.string().optional(),
});

export type MarketingActivityFormData = z.infer<typeof marketingActivitySchema>;
