import { z } from 'zod';

const requiredString = (message: string) =>
  z.string().trim().min(1, message);

export const loginSchema = z.object({
  username: requiredString('请输入用户名'),
  password: requiredString('请输入密码').pipe(z.string().min(6, '密码至少 6 位')),
});

export type LoginFormData = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    username: requiredString('请输入用户名').pipe(z.string().min(2, '用户名至少 2 个字符')),
    name: requiredString('请输入姓名'),
    phone: requiredString('请输入手机号').pipe(z.string().regex(/^1[3-9]\d{9}$/, '请输入有效的手机号')),
    password: requiredString('请输入密码').pipe(z.string().min(6, '密码至少 6 位')),
    confirmPassword: requiredString('请确认密码'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: '两次密码不一致',
    path: ['confirmPassword'],
  });

export type RegisterFormData = z.infer<typeof registerSchema>;
