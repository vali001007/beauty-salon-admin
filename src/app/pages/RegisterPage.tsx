import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input } from '../components/UI';
import { registerSchema, type RegisterFormData } from '@/schemas/auth';
import { register as registerApi } from '@/api/auth';
import { useAuthStore } from '@/stores/authStore';

export function RegisterPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: { username: '', name: '', phone: '', password: '', confirmPassword: '' },
  });

  const onSubmit = async (data: RegisterFormData) => {
    setServerError('');
    try {
      const res = await registerApi({
        username: data.username,
        name: data.name,
        phone: data.phone,
        password: data.password,
      });
      setAuth(res.token, res.user);
      toast.success('注册成功');
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      const msg = err?.message || '注册失败，请重试';
      setServerError(msg);
      toast.error(msg);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-10 text-foreground">
      <div className="w-full max-w-[460px]">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground shadow-sm">
            Ami
          </div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            美业智能运营账号
          </div>
          <h1 className="text-2xl font-semibold text-foreground">创建 Ami_Core 账号</h1>
          <p className="mt-2 text-sm text-muted-foreground">用于进入门店经营、客户洞察和智能营销工作台。</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
          {serverError && (
            <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label htmlFor="reg-username" className="mb-1.5 block text-sm font-medium text-foreground/80">
                用户名
              </label>
              <Input id="reg-username" type="text" autoComplete="username" placeholder="请输入用户名" {...register('username')} />
              {errors.username && <p className="mt-1 text-xs text-destructive">{errors.username.message}</p>}
            </div>

            <div>
              <label htmlFor="reg-name" className="mb-1.5 block text-sm font-medium text-foreground/80">
                姓名
              </label>
              <Input id="reg-name" type="text" placeholder="请输入真实姓名" {...register('name')} />
              {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div>
              <label htmlFor="reg-phone" className="mb-1.5 block text-sm font-medium text-foreground/80">
                手机号
              </label>
              <Input id="reg-phone" type="tel" autoComplete="tel" placeholder="请输入手机号" {...register('phone')} />
              {errors.phone && <p className="mt-1 text-xs text-destructive">{errors.phone.message}</p>}
            </div>

            <div>
              <label htmlFor="reg-password" className="mb-1.5 block text-sm font-medium text-foreground/80">
                密码
              </label>
              <Input
                id="reg-password"
                type="password"
                autoComplete="new-password"
                placeholder="请输入密码（至少 6 位）"
                {...register('password')}
              />
              {errors.password && <p className="mt-1 text-xs text-destructive">{errors.password.message}</p>}
            </div>

            <div>
              <label htmlFor="reg-confirm" className="mb-1.5 block text-sm font-medium text-foreground/80">
                确认密码
              </label>
              <Input
                id="reg-confirm"
                type="password"
                autoComplete="new-password"
                placeholder="请再次输入密码"
                {...register('confirmPassword')}
              />
              {errors.confirmPassword && <p className="mt-1 text-xs text-destructive">{errors.confirmPassword.message}</p>}
            </div>

            <Button type="submit" disabled={isSubmitting} className="h-10 w-full gap-2">
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSubmitting ? '注册中...' : '注册'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            已有账号？
            <Link to="/login" className="ml-1 font-medium text-primary hover:opacity-80">
              去登录
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
