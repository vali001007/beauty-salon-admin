import { z } from 'zod';

export const schedulingSchema = z.object({
  beauticianId: z.number().int().positive('请选择美容师'),
  date: z.string().min(1, '请选择日期'),
  slots: z.array(
    z.object({
      time: z.string().min(1, '时间不能为空'),
      period: z.enum(['上午', '下午'], { error: '请选择时段' }),
      available: z.boolean(),
    })
  ).min(1, '至少设置一个时段'),
});

export type SchedulingFormData = z.infer<typeof schedulingSchema>;
