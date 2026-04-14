import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, Link } from 'react-router';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { loginSchema, type LoginFormData } from '@/schemas/auth';
import { useAuthStore } from '@/stores/authStore';

export function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  });

  const onSubmit = async (data: LoginFormData) => {
    setServerError('');
    try {
      await login(data);
      toast.success('登录成功');
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      const msg = err?.message || '登录失败，请重试';
      setServerError(msg);
      toast.error(msg);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg">
        {/* Logo / Title */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-pink-500 text-2xl font-bold text-white">
            美
          </div>
          <h1 className="text-2xl font-semibold text-gray-800">美业管理平台</h1>
          <p className="text-sm text-gray-500">请登录您的账号</p>
        </div>

        {/* Server Error */}
        {serverError && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Username */}
          <div>
            <label htmlFor="username" className="mb-1 block text-sm font-medium text-gray-700">
              用户名
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              placeholder="请输入用户名"
              {...register('username')}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none transition focus:border-pink-500 focus:ring-2 focus:ring-pink-200"
            />
            {errors.username && (
              <p className="mt-1 text-xs text-red-500">{errors.username.message}</p>
            )}
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700">
              密码
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="请输入密码"
              {...register('password')}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none transition focus:border-pink-500 focus:ring-2 focus:ring-pink-200"
            />
            {errors.password && (
              <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-pink-500 py-2.5 text-sm font-medium text-white transition hover:bg-pink-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSubmitting ? '登录中...' : '登 录'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          还没有账号？
          <Link to="/register" className="ml-1 font-medium text-pink-500 hover:text-pink-600">
            去注册
          </Link>
        </p>
      </div>
    </div>
  );
}
