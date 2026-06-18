import { z } from 'zod';

export const userSchema = z.object({
  username: z.string().min(1, '用户名不能为空'),
  name: z.string().min(1, '姓名不能为空'),
  phone: z.string().regex(/^1[3-9]\d{9}$/, '请输入有效的手机号码'),
  email: z.string().email('请输入有效的邮箱地址').optional().or(z.literal('')),
  primaryRole: z.string().min(1, '请选择主角色'),
  roles: z.array(z.string()).min(1, '至少分配一个角色'),
  extraPermissions: z.array(z.string()).default([]),
  deniedPermissions: z.array(z.string()).default([]),
  storeIds: z.array(z.number()).min(0, '门店范围不能为空'),
  password: z.string().min(6, '密码至少 6 位').optional(),
});

export type UserFormData = z.infer<typeof userSchema>;

export const roleSchema = z.object({
  name: z.string().min(1, '角色名称不能为空'),
  code: z.string().min(1, '角色编码不能为空'),
  description: z.string().min(1, '角色描述不能为空'),
  permissions: z.array(z.string()).min(1, '至少分配一个权限'),
});

export type RoleFormData = z.infer<typeof roleSchema>;

export const storeSchema = z.object({
  name: z.string().min(1, '门店名称不能为空'),
  address: z.string().min(1, '门店地址不能为空'),
  mode: z.enum(['集中', '独立'], { error: '请选择管理模式' }),
  shiftRequired: z.boolean().default(true),
});

export type StoreFormData = z.infer<typeof storeSchema>;
