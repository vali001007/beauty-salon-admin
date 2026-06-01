import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { BarChart3, BrainCircuit, Loader2, Sparkles, Store, UsersRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input } from '../components/UI';
import { loginSchema, type LoginFormData } from '@/schemas/auth';
import { useAuthStore } from '@/stores/authStore';

const highlights = [
  { icon: UsersRound, label: '客户洞察', value: '画像分层' },
  { icon: BrainCircuit, label: '智能营销', value: '策略推荐' },
  { icon: BarChart3, label: '经营中枢', value: '实时看板' },
];

export function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [serverError, setServerError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof LoginFormData, string>>>({});
  const [formValues, setFormValues] = useState<LoginFormData>({ username: '', password: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setServerError('');
    setFieldErrors({});

    const parsed = loginSchema.safeParse(formValues);
    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        username: errors.username?.[0],
        password: errors.password?.[0],
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await login(parsed.data);
      toast.success('登录成功');
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      const msg = err?.message || '登录失败，请重试';
      setServerError(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen lg:grid-cols-[1.08fr_0.92fr]">
        <section className="hidden border-r border-border bg-sidebar px-12 py-10 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground shadow-sm">
              Ami
            </div>
            <div>
              <div className="text-lg font-semibold tracking-wide text-foreground">Ami_Core</div>
              <div className="text-xs text-muted-foreground">Beauty Intelligence Platform</div>
            </div>
          </div>

          <div className="max-w-xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-sm text-foreground/80 shadow-sm">
              <Sparkles className="h-4 w-4 text-primary" />
              客户画像分析 / 智能营销 / 多门店运营
            </div>
            <h1 className="text-5xl font-semibold leading-tight text-foreground">
              让每一次到店，
              <br />
              都成为可运营的增长信号
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-muted-foreground">
              Ami_Core 汇聚客户、订单、库存、项目与营销数据，为美业门店提供客户洞察、精准触达和经营决策能力。
            </p>
          </div>

          <div className="grid max-w-2xl grid-cols-3 gap-4">
            {highlights.map((item) => (
              <div key={item.label} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <item.icon className="mb-4 h-5 w-5 text-primary" />
                <div className="text-sm text-muted-foreground">{item.label}</div>
                <div className="mt-1 text-lg font-semibold text-foreground">{item.value}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="flex items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-[430px]">
            <div className="mb-8 lg:hidden">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground shadow-sm">
                Ami
              </div>
              <h1 className="text-3xl font-semibold text-foreground">Ami_Core</h1>
              <p className="mt-2 text-sm text-muted-foreground">客户洞察与智能营销中枢</p>
            </div>

            <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
              <div className="mb-8">
                <div className="mb-3 hidden h-12 w-12 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground shadow-sm lg:flex">
                  Ami
                </div>
                <h2 className="text-2xl font-semibold text-foreground">登录 Ami_Core</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  进入客户洞察、门店运营与智能营销工作台。
                </p>
              </div>

              {serverError && (
                <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                  {serverError}
                </div>
              )}

              <form onSubmit={onSubmit} className="space-y-5">
                <div>
                  <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-foreground/80">
                    用户名
                  </label>
                  <Input
                    id="username"
                    type="text"
                    autoComplete="username"
                    placeholder="请输入用户名"
                    name="username"
                    value={formValues.username}
                    onChange={(event) => setFormValues((values) => ({ ...values, username: event.target.value }))}
                  />
                  {fieldErrors.username && <p className="mt-1 text-xs text-destructive">{fieldErrors.username}</p>}
                </div>

                <div>
                  <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-foreground/80">
                    密码
                  </label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="请输入密码"
                    name="password"
                    value={formValues.password}
                    onChange={(event) => setFormValues((values) => ({ ...values, password: event.target.value }))}
                  />
                  {fieldErrors.password && <p className="mt-1 text-xs text-destructive">{fieldErrors.password}</p>}
                </div>

                <Button type="submit" disabled={isSubmitting} className="h-10 w-full gap-2">
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isSubmitting ? '登录中...' : '登录'}
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                还没有账号？
                <Link to="/register" className="ml-1 font-medium text-primary hover:opacity-80">
                  去注册
                </Link>
              </p>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Store className="h-3.5 w-3.5" />
                Ami Aura Lite 门店终端
              </span>
              <span>Ami_Core 经营中枢</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
