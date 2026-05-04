import { z } from 'zod';

export const cardSchema = z.object({
  name: z.string().min(1, '次卡名称不能为空'),
  type: z.string().min(1, '请选择次卡类型'),
  totalTimes: z.number().int().positive('总次数必须为正整数'),
  price: z.number().positive('价格必须大于 0'),
  validDays: z.number().int().positive('有效天数必须为正整数'),
  projects: z.array(
    z.object({
      projectName: z.string().min(1, '项目名称不能为空'),
      timesPerCard: z.number().int().positive('每卡次数必须为正整数'),
    })
  ).min(1, '至少关联一个项目'),
});

export type CardFormData = z.infer<typeof cardSchema>;
