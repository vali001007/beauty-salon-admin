import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, Link } from 'react-router';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
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

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none transition focus:border-pink-500 focus:ring-2 focus:ring-pink-200';

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-pink-500 text-2xl font-bold text-white">
            美
          </div>
          <h1 className="text-2xl font-semibold text-gray-800">注册账号</h1>
          <p className="text-sm text-gray-500">创建您的美业管理平台账号</p>
        </div>

        {serverError && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">{serverError}</div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label htmlFor="reg-username" className="mb-1 block text-sm font-medium text-gray-700">用户名</label>
            <input id="reg-username" type="text" autoComplete="username" placeholder="请输入用户名" {...register('username')} className={inputClass} />
            {errors.username && <p className="mt-1 text-xs text-red-500">{errors.username.message}</p>}
          </div>

          <div>
            <label htmlFor="reg-name" className="mb-1 block text-sm font-medium text-gray-700">姓名</label>
            <input id="reg-name" type="text" placeholder="请输入真实姓名" {...register('name')} className={inputClass} />
            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
          </div>

          <div>
            <label htmlFor="reg-phone" className="mb-1 block text-sm font-medium text-gray-700">手机号</label>
            <input id="reg-phone" type="tel" autoComplete="tel" placeholder="请输入手机号" {...register('phone')} className={inputClass} />
            {errors.phone && <p className="mt-1 text-xs text-red-500">{errors.phone.message}</p>}
          </div>

          <div>
            <label htmlFor="reg-password" className="mb-1 block text-sm font-medium text-gray-700">密码</label>
            <input id="reg-password" type="password" autoComplete="new-password" placeholder="请输入密码（至少6位）" {...register('password')} className={inputClass} />
            {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>}
          </div>

          <div>
            <label htmlFor="reg-confirm" className="mb-1 block text-sm font-medium text-gray-700">确认密码</label>
            <input id="reg-confirm" type="password" autoComplete="new-password" placeholder="请再次输入密码" {...register('confirmPassword')} className={inputClass} />
            {errors.confirmPassword && <p className="mt-1 text-xs text-red-500">{errors.confirmPassword.message}</p>}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-pink-500 py-2.5 text-sm font-medium text-white transition hover:bg-pink-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSubmitting ? '注册中...' : '注 册'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          已有账号？
          <Link to="/login" className="ml-1 font-medium text-pink-500 hover:text-pink-600">
            去登录
          </Link>
        </p>
      </div>
    </div>
  );
}
