import { z } from 'zod';

export const customerSchema = z.object({
  name: z.string().min(1, '客户名称不能为空'),
  storeName: z.string().optional(),
  email: z.string().email('请输入有效的邮箱').optional().or(z.literal('')),
  phone: z.string().regex(/^1[3-9]\d{9}$/, '请输入有效的手机号码').optional().or(z.literal('')),
  landline: z.string().optional(),
  wechat: z.string().optional(),
  gender: z.enum(['男', '女'], { error: '请选择性别' }),
  maritalStatus: z.enum(['未知', '已婚', '未婚']).optional(),
  birthday: z.string().optional(),
  age: z.number().int().min(0).max(150).optional(),
  height: z.number().min(0).max(300).optional(),
  weight: z.number().min(0).max(500).optional(),
  occupation: z.string().optional(),
  workplace: z.string().optional(),
  address: z.string().optional(),
  hasAllergy: z.enum(['无', '有']).optional(),
  hasSurgery: z.enum(['无', '有']).optional(),
  skinCondition: z.string().optional(),
  totalSpent: z.number().min(0).optional(),
  memberLevel: z.string().optional(),
  source: z.string().optional(),
  lastVisitDate: z.string().optional(),
  tags: z.array(z.string()).optional(),
  remark: z.string().optional(),
});

export type CustomerFormData = z.infer<typeof customerSchema>;
