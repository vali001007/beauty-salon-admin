import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { TrendingUp, Users, Target, DollarSign, ArrowUpRight, Activity, Zap } from 'lucide-react';
import { getMarketingActivities, getStrategyEffects, type StrategyEffectSummary } from '@/api/marketing';
import type { MarketingActivity } from '@/types';

type FilterType = 'all' | 'activity' | 'auto';

interface UnifiedItem {
  id: string;
  name: string;
  type: 'activity' | 'auto';
  typeLabel: string;
  status: string;
  participants: number;
  conversionLabel: string;
  revenue: string;
  revenueNum: number;
  dateRange: string;
  activityId?: number;
}

export function MarketingAnalytics() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterType>('all');
  const [activities, setActivities] = useState<MarketingActivity[]>([]);
  const [strategies, setStrategies] = useState<StrategyEffectSummary[]>([]);

  const loadData = useCallback(async () => {
    const [acts, strats] = await Promise.all([getMarketingActivities(), getStrategyEffects()]);
    setActivities(acts);
    setStrategies(strats);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Unify data
  const unifiedList: UnifiedItem[] = [
    ...activities.map((a): UnifiedItem => ({
      id: `act-${a.id}`, name: a.title, type: 'activity', typeLabel: '🎯 营销活动',
      status: a.status, participants: a.participants, conversionLabel: `转化 ${a.conversion}`,
      revenue: `¥${(a.participants * 380).toLocaleString()}`, revenueNum: a.participants * 380,
      dateRange: `${a.startDate} 至 ${a.endDate}`, activityId: a.id,
    })),
    ...strategies.filter((s) => s.status !== '草稿').map((s): UnifiedItem => ({
      id: `auto-${s.id}`, name: s.name, type: 'auto', typeLabel: '⚡ 自动营销',
      status: s.status, participants: s.reachedCount, conversionLabel: `核销 ${s.couponUsedRate}`,
      revenue: s.revenue >= 10000 ? `¥${(s.revenue / 10000).toFixed(1)}万` : `¥${s.revenue.toLocaleString()}`,
      revenueNum: s.revenue, dateRange: `上次执行 ${s.lastExecuted}`,
    })),
  ].sort((a, b) => b.revenueNum - a.revenueNum);

  const filtered = filter === 'all' ? unifiedList : unifiedList.filter((i) => i.type === (filter === 'activity' ? 'activity' : 'auto'));

  // Summary stats
  const totalActions = activities.length + strategies.filter((s) => s.status === '启用').length;
  const totalReached = activities.reduce((s, a) => s + a.participants, 0) + strategies.reduce((s, st) => s + st.reachedCount, 0);
  const totalRevenue = unifiedList.reduce((s, i) => s + i.revenueNum, 0);
  const avgROI = totalRevenue > 0 ? (totalRevenue / (totalActions * 5000)).toFixed(1) : '0';

  const stats = [
    { title: '总营销动作', value: String(totalActions), icon: Activity, bgColor: 'bg-gradient-to-br from-blue-500 to-blue-600', change: `${activities.length}活动 + ${strategies.filter((s) => s.status === '启用').length}规则` },
    { title: '总触达人数', value: totalReached.toLocaleString(), icon: Users, bgColor: 'bg-gradient-to-br from-green-500 to-green-600', change: '+15.2%' },
    { title: '总营收贡献', value: totalRevenue >= 10000 ? `¥${(totalRevenue / 10000).toFixed(1)}万` : `¥${totalRevenue.toLocaleString()}`, icon: DollarSign, bgColor: 'bg-gradient-to-br from-purple-500 to-purple-600', change: '+22.8%' },
    { title: '综合ROI', value: `${avgROI}x`, icon: TrendingUp, bgColor: 'bg-gradient-to-br from-orange-500 to-orange-600', change: '+0.8' },
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">营销效果分析</h1>
        <p className="text-sm text-gray-500 mt-1">统一查看营销活动和自动营销规则的效果数据</p>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="space-y-6">
          {/* 统计卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map((stat, index) => (
              <div key={index} className={`${stat.bgColor} text-white rounded-lg p-6 shadow-lg`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center"><stat.icon className="w-6 h-6" /></div>
                  <div className="flex items-center gap-1 text-sm font-medium bg-white/20 px-2 py-1 rounded">
                    <ArrowUpRight className="w-4 h-4" />{stat.change}
                  </div>
                </div>
                <div className="text-3xl font-bold mb-1">{stat.value}</div>
                <div className="text-sm opacity-90">{stat.title}</div>
              </div>
            ))}
          </div>

          {/* 标签切换 */}
          <div className="flex items-center gap-3">
            {([
              { id: 'all' as FilterType, label: '全部', count: unifiedList.length },
              { id: 'activity' as FilterType, label: '🎯 营销活动', count: unifiedList.filter((i) => i.type === 'activity').length },
              { id: 'auto' as FilterType, label: '⚡ 自动营销', count: unifiedList.filter((i) => i.type === 'auto').length },
            ]).map((tab) => (
              <button key={tab.id} onClick={() => setFilter(tab.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === tab.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          {/* 统一列表 */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="divide-y divide-gray-200">
              {filtered.map((item) => (
                <div key={item.id}
                  className="p-5 hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => {
                    if (item.type === 'activity' && item.activityId) {
                      navigate(`/customer-marketing/activity-effect/${item.activityId}`);
                    }
                  }}>
                  <div className="flex items-center gap-5">
                    {/* 类型图标 */}
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0 ${item.type === 'activity' ? 'bg-blue-500' : 'bg-purple-500'}`}>
                      {item.type === 'activity' ? <Target className="w-5 h-5" /> : <Zap className="w-5 h-5" />}
                    </div>

                    {/* 信息 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900">{item.name}</h3>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${item.type === 'activity' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                          {item.typeLabel}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs ${item.status === '启用' || item.status === '进行中' ? 'bg-green-100 text-green-700' : item.status === '即将开始' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>
                          {item.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span className="flex items-center gap-1"><Users className="w-4 h-4" /> {item.participants}人{item.type === 'activity' ? '参与' : '触达'}</span>
                        <span className="flex items-center gap-1"><Activity className="w-4 h-4" /> {item.dateRange}</span>
                      </div>
                    </div>

                    {/* 数据指标 */}
                    <div className="flex items-center gap-8 shrink-0">
                      <div className="text-right">
                        <div className="text-sm text-gray-500 mb-1">{item.type === 'activity' ? '转化率' : '核销率'}</div>
                        <div className="text-lg font-bold text-green-600">{item.conversionLabel.replace(/转化|核销/, '').trim()}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-gray-500 mb-1">营收</div>
                        <div className="text-lg font-bold text-blue-600">{item.revenue}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="p-12 text-center text-gray-400">暂无数据</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
