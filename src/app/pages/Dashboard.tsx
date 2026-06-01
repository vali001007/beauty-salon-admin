import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  CreditCard,
  FileText,
  HeartPulse,
  LayoutDashboard,
  Megaphone,
  PackageCheck,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '../components/UI';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { resolveAuraRole } from '@/config/aura';
import { getDashboardOverview } from '@/api/dashboard';
import { useAuthStore } from '@/stores/authStore';
import { useStoreStore } from '@/stores/storeStore';
import type { AuraRole } from '@/types/aura';
import type { DashboardOverview } from '@/types/dashboard';

type Metric = {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  tone: 'primary' | 'rose' | 'amber' | 'slate';
  path: string;
};

type Priority = {
  title: string;
  detail: string;
  tag: string;
  icon: LucideIcon;
  path: string;
};

type QuickAction = {
  label: string;
  path: string;
  icon: LucideIcon;
};

const toneClass: Record<Metric['tone'], string> = {
  primary: 'bg-primary/10 text-primary',
  rose: 'bg-rose-100 text-rose-700',
  amber: 'bg-amber-100 text-amber-700',
  slate: 'bg-muted text-muted-foreground',
};

const metricIcons: Record<string, LucideIcon> = {
  customers: Users,
  income: TrendingUp,
  inventory: PackageCheck,
  campaigns: Megaphone,
};

const priorityIcons: Record<string, LucideIcon> = {
  inventory: AlertTriangle,
  reservation: CalendarCheck,
  terminal: CheckCircle2,
  service: HeartPulse,
  growth: Sparkles,
};

const roleLabels: Record<AuraRole, string> = {
  manager: '店长',
  reception: '前台',
  beautician: '美容师',
};

const workspaceConfig: Record<
  AuraRole,
  {
    title: string;
    subtitle: string;
    metrics: Metric[];
    priorities: Priority[];
    quickActions: QuickAction[];
    ai: { conclusion: string; basis: string; action: string; path: string };
  }
> = {
  manager: {
    title: '店长经营驾驶舱',
    subtitle: '先看经营、风险和员工，再处理门店协同。',
    metrics: [
      { label: '总客户数', value: '2,847', hint: '本月新增 156 人', icon: Users, tone: 'primary', path: '/customers/data' },
      { label: '今日收入', value: '¥45,680', hint: '较昨日 +15.2%', icon: TrendingUp, tone: 'rose', path: '/orders/products' },
      { label: '库存预警', value: '7', hint: '低库存 5 / 临期 2', icon: PackageCheck, tone: 'amber', path: '/inventory/stock' },
      { label: '进行中活动', value: '3', hint: '平均转化 28.7%', icon: Megaphone, tone: 'slate', path: '/customer-marketing/activity-management' },
    ],
    priorities: [
      { title: '低库存产品需要确认补货', detail: '补水面膜、眼霜低于安全库存。', tag: '库存', icon: AlertTriangle, path: '/inventory/purchase' },
      { title: '高价值客户建议二次触达', detail: 'AI 识别 42 位高 LTV 客户进入复购窗口。', tag: '增长', icon: Sparkles, path: '/customer-marketing/intelligent-recommendation' },
      { title: '美容师排班需补位', detail: '周末晚间档预约量高，建议提前调班。', tag: '协同', icon: CalendarCheck, path: '/stores/scheduling' },
    ],
    quickActions: [
      { label: '客户增长', path: '/customers/profile', icon: Users },
      { label: '智能营销', path: '/customer-marketing/intelligent-recommendation', icon: Sparkles },
      { label: '库存管理', path: '/inventory/stock', icon: PackageCheck },
      { label: '员工排班', path: '/stores/scheduling', icon: CalendarCheck },
    ],
    ai: {
      conclusion: '本周优先处理补货和高价值客户复购。',
      basis: '依据近 90 天消耗、预约排期和客户分层数据，库存与复购窗口同时进入敏感区。',
      action: '查看智能建议',
      path: '/customer-marketing/intelligent-recommendation',
    },
  },
  reception: {
    title: '前台接待工作台',
    subtitle: '围绕预约、核销、登记和收银快速处理。',
    metrics: [
      { label: '今日预约', value: '32', hint: '待确认 6 单', icon: CalendarCheck, tone: 'primary', path: '/stores/reservations' },
      { label: '待核销', value: '8', hint: '次卡 / 活动权益', icon: CheckCircle2, tone: 'amber', path: '/orders/card-usage' },
      { label: '今日收银', value: '¥18,920', hint: '已完成 21 单', icon: CreditCard, tone: 'rose', path: '/orders/products' },
      { label: '新增登记', value: '14', hint: '新客来源需补全', icon: UserPlus, tone: 'slate', path: '/customers/data' },
    ],
    priorities: [
      { title: '预约到店前确认', detail: '下午 14:00-16:00 有 6 位客户待确认。', tag: '预约', icon: CalendarCheck, path: '/stores/reservations' },
      { title: '核销后补服务记录', detail: '3 笔次卡核销缺少服务备注。', tag: '核销', icon: FileText, path: '/orders/card-usage' },
      { title: '收银单待打印', detail: '今日还有 2 单需要补打小票。', tag: '收银', icon: CreditCard, path: '/orders/products' },
    ],
    quickActions: [
      { label: '项目预约', path: '/stores/reservations', icon: CalendarCheck },
      { label: '客户登记', path: '/customers/data', icon: UserPlus },
      { label: '次卡核销', path: '/orders/card-usage', icon: CheckCircle2 },
      { label: '收银订单', path: '/orders/products', icon: CreditCard },
    ],
    ai: {
      conclusion: '今天的接待高峰集中在下午，建议优先确认预约。',
      basis: 'Ami Aura Lite 已同步预约、核销和收银数据，待确认客户集中在 14:00 后。',
      action: '进入预约处理',
      path: '/stores/reservations',
    },
  },
  beautician: {
    title: '美容师服务工作台',
    subtitle: '只看自己的排班、客户和服务动作。',
    metrics: [
      { label: '我的预约', value: '9', hint: '下一位 30 分钟后到店', icon: CalendarCheck, tone: 'primary', path: '/stores/scheduling' },
      { label: '待完成服务', value: '3', hint: '需补护理记录', icon: HeartPulse, tone: 'rose', path: '/orders/card-usage' },
      { label: '客户档案', value: '68', hint: '近期服务客户', icon: Users, tone: 'slate', path: '/customers/profile' },
      { label: '护理建议', value: '12', hint: '可用于复访邀约', icon: Sparkles, tone: 'amber', path: '/customers/script' },
    ],
    priorities: [
      { title: '补全护理记录', detail: '3 位客户缺少项目反馈和护理建议。', tag: '记录', icon: FileText, path: '/orders/card-usage' },
      { title: '查看下一位客户档案', detail: '敏感肌客户到店前建议确认禁忌项。', tag: '客户', icon: Users, path: '/customers/profile' },
      { title: '服务完成后提醒前台核销', detail: '减少漏核销和手工追单。', tag: '协作', icon: CheckCircle2, path: '/orders/card-usage' },
    ],
    quickActions: [
      { label: '我的排班', path: '/stores/scheduling', icon: CalendarCheck },
      { label: '客户档案', path: '/customers/profile', icon: Users },
      { label: '服务记录', path: '/orders/card-usage', icon: FileText },
      { label: '护理建议', path: '/customers/script', icon: HeartPulse },
    ],
    ai: {
      conclusion: '下一位客户建议主推温和修护方案。',
      basis: '结合历史服务记录、肌肤档案和近期到店周期，客户处于复购和修护窗口。',
      action: '查看客户画像',
      path: '/customers/profile',
    },
  },
};

export function Dashboard() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const currentStoreId = useStoreStore((state) => state.currentStoreId);
  const role = resolveAuraRole(user);
  const workspace = useMemo(() => workspaceConfig[role], [role]);
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [isLoadingOverview, setIsLoadingOverview] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    setIsLoadingOverview(true);
    setOverviewError(null);

    getDashboardOverview({ storeId: currentStoreId })
      .then((data) => {
        if (!ignore) setOverview(data);
      })
      .catch((error) => {
        if (!ignore) setOverviewError(error instanceof Error ? error.message : '仪表盘数据加载失败');
      })
      .finally(() => {
        if (!ignore) setIsLoadingOverview(false);
      });

    return () => {
      ignore = true;
    };
  }, [currentStoreId]);

  const metrics = useMemo<Metric[]>(() => {
    if (!overview?.metrics?.length) return workspace.metrics;
    return overview.metrics.map((metric) => ({
      ...metric,
      icon: metricIcons[metric.key] ?? LayoutDashboard,
    }));
  }, [overview, workspace.metrics]);

  const priorities = useMemo<Priority[]>(() => {
    if (!overview?.priorities?.length) return workspace.priorities;
    return overview.priorities.map((item) => ({
      ...item,
      icon: priorityIcons[item.key] ?? AlertTriangle,
    }));
  }, [overview, workspace.priorities]);

  const ai = overview?.ai ?? workspace.ai;
  const scopeName = overview?.scope.storeName ?? (currentStoreId ? '当前门店' : '全部门店');

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant="default">当前角色：{roleLabels[role]}</Badge>
              <Badge variant="outline">数据来源 Ami_Core</Badge>
              <Badge variant="outline">当前口径：{scopeName}</Badge>
              {isLoadingOverview && <Badge variant="secondary">数据刷新中</Badge>}
              {overviewError && <Badge variant="destructive">显示默认样例</Badge>}
            </div>
            <h1 className="text-2xl font-semibold text-foreground">{workspace.title}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {user?.name ? `${user.name}，` : ''}
              {workspace.subtitle}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-background/70 px-4 py-3 text-sm text-muted-foreground">
            <div className="font-medium text-foreground">Ami Aura Lite 已接入</div>
            <div className="mt-1">门店终端、预约、核销和收银数据已同步。</div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <button
            key={metric.label}
            type="button"
            onClick={() => navigate(metric.path)}
            className="rounded-xl border border-border bg-card p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${toneClass[metric.tone]}`}>
                <metric.icon className="h-5 w-5" />
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-semibold text-foreground">{metric.value}</div>
            <div className="mt-1 text-sm font-medium text-foreground/80">{metric.label}</div>
            <div className="mt-2 text-xs text-muted-foreground">{metric.hint}</div>
          </button>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LayoutDashboard className="h-5 w-5 text-primary" />
              今日优先处理
            </CardTitle>
            <CardDescription>按角色和门店数据排序，只展示最需要先看的事项。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {priorities.map((item) => (
              <button
                key={item.title}
                type="button"
                onClick={() => navigate(item.path)}
                className="flex w-full items-start gap-4 rounded-lg border border-border bg-background/50 p-4 text-left transition hover:bg-accent/50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <item.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{item.title}</span>
                    <Badge variant="secondary">{item.tag}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
                </div>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Ami 参考
            </CardTitle>
            <CardDescription>结论、依据和动作保持同屏可见。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-primary/15 bg-primary/5 p-4">
              <div className="text-xs font-medium text-primary">结论</div>
              <div className="mt-1 font-medium text-foreground">{ai.conclusion}</div>
              <div className="mt-4 text-xs font-medium text-primary">依据</div>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{ai.basis}</p>
              <Button className="mt-5 w-full gap-2" onClick={() => navigate(ai.path)}>
                {ai.action}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {workspace.quickActions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={() => navigate(action.path)}
            className="rounded-xl border border-border bg-card p-4 text-left shadow-sm transition hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            <action.icon className="mb-4 h-5 w-5 text-primary" />
            <div className="font-medium text-foreground">{action.label}</div>
            <div className="mt-1 text-xs text-muted-foreground">快速进入</div>
          </button>
        ))}
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">门店运行状态</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              网络、打印机、扫码器和终端同步状态正常，适合继续处理前台和经营任务。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">网络正常</Badge>
            <Badge variant="outline">打印机在线</Badge>
            <Badge variant="outline">扫码器在线</Badge>
            <Badge variant="outline">数据同步正常</Badge>
          </div>
        </div>
      </section>
    </div>
  );
}
