import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().min(1, '用户名不能为空'),
  password: z.string().min(6, '密码至少 6 位'),
});

export type LoginFormData = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    username: z.string().min(2, '用户名至少 2 个字符'),
    name: z.string().min(1, '姓名不能为空'),
    phone: z.string().regex(/^1[3-9]\d{9}$/, '请输入有效的手机号'),
    password: z.string().min(6, '密码至少 6 位'),
    confirmPassword: z.string().min(1, '请确认密码'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: '两次密码不一致',
    path: ['confirmPassword'],
  });

export type RegisterFormData = z.infer<typeof registerSchema>;
