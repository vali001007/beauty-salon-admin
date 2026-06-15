import { z } from 'zod';

const optionalNumber = (schema: z.ZodNumber) =>
  z.preprocess((value) => (value === '' || Number.isNaN(value) ? undefined : value), schema.optional());

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
  age: optionalNumber(z.number().int().min(0).max(150)),
  height: optionalNumber(z.number().min(0).max(300)),
  weight: optionalNumber(z.number().min(0).max(500)),
  occupation: z.string().optional(),
  workplace: z.string().optional(),
  address: z.string().optional(),
  hasAllergy: z.enum(['无', '有']).optional(),
  hasSurgery: z.enum(['无', '有']).optional(),
  skinType: z.string().optional(),
  skinCondition: z.string().optional(),
  totalSpent: optionalNumber(z.number().min(0)),
  memberLevel: z.string().optional(),
  source: z.string().optional(),
  lastVisitDate: z.string().optional(),
  tags: z.array(z.string()).optional(),
  remark: z.string().optional(),
});

export type CustomerFormData = z.infer<typeof customerSchema>;
