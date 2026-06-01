import type { DashboardOverview } from '@/types/dashboard';

const storeProfiles: Record<number, { name: string; customers: number; income: number; lowStock: number; expiring: number; reservations: number; tasks: number }> = {
  1: { name: 'Ami 上海静安店', customers: 12, income: 45680, lowStock: 2, expiring: 1, reservations: 8, tasks: 3 },
  2: { name: 'Ami 上海徐汇店', customers: 12, income: 32860, lowStock: 1, expiring: 1, reservations: 7, tasks: 2 },
  3: { name: '凤仪阁美容养生会所', customers: 412, income: 38640, lowStock: 2, expiring: 0, reservations: 12, tasks: 5 },
  4: { name: '兰亭美容SPA馆', customers: 398, income: 29880, lowStock: 1, expiring: 0, reservations: 10, tasks: 4 },
  5: { name: '心悦芸美容养生会所', customers: 430, income: 42120, lowStock: 2, expiring: 0, reservations: 11, tasks: 4 },
};

export async function mockGetDashboardOverview(params?: { storeId?: number | null }): Promise<DashboardOverview> {
  const storeId = params?.storeId ?? null;
  const profile = storeId ? storeProfiles[storeId] : null;
  const aggregate = Object.values(storeProfiles).reduce(
    (sum, item) => ({
      customers: sum.customers + item.customers,
      income: sum.income + item.income,
      lowStock: sum.lowStock + item.lowStock,
      expiring: sum.expiring + item.expiring,
      reservations: sum.reservations + item.reservations,
      tasks: sum.tasks + item.tasks,
    }),
    { customers: 0, income: 0, lowStock: 0, expiring: 0, reservations: 0, tasks: 0 },
  );
  const data = profile ?? aggregate;
  const scopeName = profile?.name ?? '全部门店';
  const warningCount = data.lowStock + data.expiring;

  return {
    scope: { storeId, storeName: scopeName, mode: storeId ? 'store' : 'all' },
    metrics: [
      { key: 'customers', label: '总客户数', value: data.customers.toLocaleString('zh-CN'), hint: `本月新增 ${Math.max(8, Math.round(data.customers * 0.04))} 人`, tone: 'primary', path: '/customers/data' },
      { key: 'income', label: '今日收入', value: `¥${data.income.toLocaleString('zh-CN')}`, hint: '今日开卡/收银汇总', tone: 'rose', path: '/orders/products' },
      { key: 'inventory', label: '库存预警', value: String(warningCount), hint: `低库存 ${data.lowStock} / 临期 ${data.expiring}`, tone: 'amber', path: '/inventory/stock' },
      { key: 'campaigns', label: '进行中活动', value: '3', hint: storeId ? '全局活动，暂未绑定门店' : '全部门店活动', tone: 'slate', path: '/customer-marketing/activity-management' },
    ],
    priorities: [
      { key: 'inventory', title: warningCount > 0 ? `${warningCount} 个库存项需要处理` : '库存状态正常', detail: `${data.lowStock} 个商品低于安全库存，${data.expiring} 个批次 30 天内临期。`, tag: '库存', path: '/inventory/stock' },
      { key: 'reservation', title: `今日 ${data.reservations} 个预约待跟进`, detail: `还有 ${data.tasks} 个服务任务处于待服务或进行中。`, tag: '服务', path: '/stores/reservations' },
      { key: 'terminal', title: 'Ami Aura Lite 数据已同步', detail: `${scopeName} 的终端、预约、核销和收银数据已进入当前看板。`, tag: '终端', path: '/stores/reservations' },
    ],
    ai: {
      conclusion: warningCount > 0 ? '优先处理库存预警和今日服务任务。' : '当前经营状态平稳，可重点推进客户复购。',
      basis: `当前口径：${scopeName}；数据按门店选择动态切换。`,
      action: warningCount > 0 ? '查看库存预警' : '查看智能建议',
      path: warningCount > 0 ? '/inventory/stock' : '/customer-marketing/intelligent-recommendation',
    },
    generatedAt: new Date().toISOString(),
  };
}
