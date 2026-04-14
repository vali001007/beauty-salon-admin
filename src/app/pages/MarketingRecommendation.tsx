import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Sparkles, TrendingUp, Users, Calendar, Target, ArrowRight, RefreshCw, Plus, Zap, ChevronDown, ChevronUp } from 'lucide-react';
import { CreateActivityDialog } from '../components/CreateActivityDialog';
import rawCustomers from '@/api/mock/data/customers.json';
import rawConsumptionRecords from '@/api/mock/data/consumption-records.json';
import rawHealthProfiles from '@/api/mock/data/health-profiles.json';
import type { Customer } from '@/types';
import { generateRecommendations, type Recommendation, type UrgencyLevel } from '@/utils/marketingRecommendation';

const customers: Customer[] = (rawCustomers as any[]).map((c) => ({ ...c, tags: c.tags || [] }));
const consumptionRecords = rawConsumptionRecords as any[];
const healthProfiles = rawHealthProfiles as any[];

export function MarketingRecommendation() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | UrgencyLevel>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createDialogInitialData, setCreateDialogInitialData] = useState<Record<string, string> | undefined>(undefined);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedEvidence, setExpandedEvidence] = useState<Set<number>>(new Set());

  const recommendations = useMemo(
    () => generateRecommendations(customers, consumptionRecords, healthProfiles),
    [refreshKey]
  );

  const filters = [
    { id: 'all' as const, label: '全部', count: recommendations.length },
    { id: 'urgent' as const, label: '🔴 紧急', count: recommendations.filter((r) => r.urgency === 'urgent').length },
    { id: 'recommended' as const, label: '🟡 推荐', count: recommendations.filter((r) => r.urgency === 'recommended').length },
    { id: 'opportunity' as const, label: '🟢 机会', count: recommendations.filter((r) => r.urgency === 'opportunity').length },
  ];

  const filtered = activeFilter === 'all' ? recommendations : recommendations.filter((r) => r.urgency === activeFilter);

  const handleRefresh = () => {
    setIsLoading(true);
    setTimeout(() => { setRefreshKey((k) => k + 1); setIsLoading(false); }, 1200);
  };

  const toggleEvidence = (id: number) => {
    setExpandedEvidence((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const urgencyBorder = (u: UrgencyLevel) => u === 'urgent' ? 'border-l-4 border-l-red-500' : u === 'recommended' ? 'border-l-4 border-l-yellow-400' : 'border-l-4 border-l-green-400';
  const sourceLabel = (s: Recommendation['source']) => {
    switch (s) {
      case 'churn': return { text: '流失预警', color: 'bg-red-100 text-red-700' };
      case 'association': return { text: '关联分析', color: 'bg-blue-100 text-blue-700' };
      case 'ltv': return { text: 'LTV驱动', color: 'bg-purple-100 text-purple-700' };
      default: return { text: '策略推荐', color: 'bg-gray-100 text-gray-700' };
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">智能推荐</h1>
          <p className="text-sm text-gray-500 mt-1">基于 {customers.length} 位客户数据，综合 RFM分群、关联规则、流失预警、LTV预测 四大算法智能推荐</p>
        </div>
        <div className="flex gap-3">
          <button onClick={handleRefresh} disabled={isLoading}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> {isLoading ? '分析中...' : '刷新推荐'}
          </button>
          <button onClick={() => { setCreateDialogInitialData(undefined); setShowCreateDialog(true); }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2">
            <Plus className="w-4 h-4" /> 创建活动
          </button>
        </div>
      </div>

      {/* 紧急度筛选 */}
      <div className="flex gap-3 mb-6">
        {filters.map((f) => (
          <button key={f.id} onClick={() => setActiveFilter(f.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeFilter === f.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {/* 推荐列表 */}
      <div className="flex-1 overflow-auto">
        <div className="space-y-4">
          {filtered.map((rec) => {
            const sl = sourceLabel(rec.source);
            const isExpanded = expandedEvidence.has(rec.id);
            return (
              <div key={rec.id} className={`border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow ${urgencyBorder(rec.urgency)}`}>
                <div className="flex gap-5 p-5">
                  {/* 左侧海报 */}
                  <div className="w-40 h-40 shrink-0 rounded-lg overflow-hidden">
                    <img src={rec.image} alt={rec.title} className="w-full h-full object-cover" />
                  </div>

                  {/* 右侧内容 */}
                  <div className="flex-1 min-w-0">
                    {/* 标题行 */}
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium">{rec.urgencyLabel}</span>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${sl.color}`}>{sl.text}</span>
                          {rec.tags.filter((t) => !['紧急', '流失预警', '交叉销售', 'LTV驱动'].includes(t)).slice(0, 2).map((tag, i) => (
                            <span key={i} className={`px-2 py-0.5 rounded text-xs font-medium ${tag === 'AI推荐' ? 'bg-yellow-100 text-yellow-700' : tag.includes('高') ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{tag}</span>
                          ))}
                        </div>
                        <h3 className="text-base font-semibold text-gray-900">{rec.title}</h3>
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <div className="text-xs text-gray-500">匹配度</div>
                        <div className={`text-xl font-bold ${rec.matchScore >= 85 ? 'text-green-600' : rec.matchScore >= 65 ? 'text-blue-600' : 'text-orange-500'}`}>{rec.matchScore}%</div>
                      </div>
                    </div>

                    {/* AI原因 */}
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-2.5 mb-3">
                      <div className="flex items-start gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
                        <p className="text-sm text-blue-800">{rec.reason}</p>
                      </div>
                    </div>

                    {/* 关键指标 */}
                    <div className="flex items-center gap-5 mb-3 text-sm">
                      <span className="flex items-center gap-1 text-gray-600"><Users className="w-3.5 h-3.5" /> {rec.targetCustomers}</span>
                      <span className="flex items-center gap-1 text-green-600 font-medium"><TrendingUp className="w-3.5 h-3.5" /> {rec.expectedRevenue}</span>
                      <span className="flex items-center gap-1 text-gray-500"><Calendar className="w-3.5 h-3.5" /> {rec.duration}</span>
                    </div>

                    {/* 数据依据（可折叠） */}
                    {rec.dataEvidence && rec.dataEvidence.length > 0 && (
                      <div className="mb-3">
                        <button onClick={() => toggleEvidence(rec.id)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          数据依据
                        </button>
                        {isExpanded && (
                          <div className="mt-2 bg-gray-50 rounded-lg p-3 space-y-1">
                            {rec.dataEvidence.map((e, i) => (
                              <div key={i} className="text-xs text-gray-600 flex items-center gap-2">
                                <span className="w-1 h-1 bg-gray-400 rounded-full shrink-0" />
                                {e}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 操作按钮 */}
                    <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                      <span className="flex-1 text-xs text-gray-400">{rec.discount}</span>
                      {rec.preferAutoRule && rec.triggerType && (
                        <button onClick={() => {
                          const params = new URLSearchParams({
                            name: rec.title, desc: rec.reason, trigger: rec.triggerType!,
                            actions: JSON.stringify([{ type: 'coupon', value: rec.discount }]),
                            channels: 'sms,miniapp',
                            autoGenerate: 'true',
                          });
                          navigate(`/customer-marketing/strategy-templates?${params.toString()}`);
                        }} className="px-4 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-1.5 text-xs">
                          <Zap className="w-3.5 h-3.5" /> 创建自动规则
                        </button>
                      )}
                      <button onClick={() => {
                        setCreateDialogInitialData({
                          title: rec.title, description: rec.reason, targetCustomers: rec.targetCustomers,
                          discount: rec.discount, strategy: rec.strategy, image: rec.image,
                          category: rec.category, duration: rec.duration,
                        });
                        setShowCreateDialog(true);
                      }} className={`px-4 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 text-xs ${rec.preferAutoRule ? 'border border-blue-500 text-blue-600 hover:bg-blue-50' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                        创建活动 <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <CreateActivityDialog open={showCreateDialog} onClose={() => setShowCreateDialog(false)} initialData={createDialogInitialData} />
    </div>
  );
}
