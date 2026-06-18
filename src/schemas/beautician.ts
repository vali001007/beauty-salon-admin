import { z } from 'zod';

export const beauticianSchema = z.object({
  userId: z.coerce.number().int().positive('请选择系统管理-用户管理中的美容师角色用户'),
  name: z.string().min(1, '美容师姓名不能为空'),
  phone: z.string().regex(/^1[3-9]\d{9}$/, '请输入有效的手机号码'),
  level: z.string().min(1, '请选择技师等级'),
  specialties: z.array(z.string()).min(1, '至少选择一项专长'),
  status: z.enum(['在职', '休假', '离职'], { error: '请选择状态' }),
  storeName: z.string().min(1, '请选择所属门店'),
  joinDate: z.string().min(1, '请选择入职日期'),
});

export type BeauticianFormData = z.infer<typeof beauticianSchema>;
export type BeauticianFormInput = z.input<typeof beauticianSchema>;
