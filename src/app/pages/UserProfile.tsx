import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Sparkles, Droplets, Flame, AlertCircle, Layers, Heart } from 'lucide-react';
import rawCustomers from '@/api/mock/data/customers.json';
import rawHealthProfiles from '@/api/mock/data/health-profiles.json';
import rawConsumptionRecords from '@/api/mock/data/consumption-records.json';
import type { Customer } from '@/types';
import {
  computeSegmentStats, computeSkinStats, computeBehaviorProfiles,
  AI_RECOMMENDATIONS, SKIN_AI_RECOMMENDATIONS, SKIN_SERVICES,
  type SegmentType,
} from '@/utils/customerSegmentation';
import { computeChurnScores, computeLTVPredictions } from '@/utils/advancedAnalytics';

const customers: Customer[] = (rawCustomers as any[]).map((c) => ({ ...c, tags: c.tags || [] }));
const healthProfiles = rawHealthProfiles as any[];
const consumptionRecords = rawConsumptionRecords as any[];

const SEGMENT_INDICATORS: Record<SegmentType, string> = {
  '高价值客户': 'bg-green-500', '潜在价值客户': 'bg-blue-500', '稳定客户': 'bg-purple-500',
  '流失风险客户': 'bg-red-500', '新客户': 'bg-yellow-500',
};

const SKIN_ICONS: Record<string, React.ReactNode> = {
  '干性肌肤': <Droplets className="w-5 h-5" />, '油性肌肤': <Flame className="w-5 h-5" />,
  '敏感肌肤': <AlertCircle className="w-5 h-5" />, '混合肌肤': <Layers className="w-5 h-5" />,
  '中性肌肤': <Heart className="w-5 h-5" />,
};
const SKIN_COLORS: Record<string, { text: string; indicator: string }> = {
  '干性肌肤': { text: 'text-orange-600', indicator: 'bg-orange-500' },
  '油性肌肤': { text: 'text-yellow-600', indicator: 'bg-yellow-500' },
  '敏感肌肤': { text: 'text-red-600', indicator: 'bg-red-500' },
  '混合肌肤': { text: 'text-green-600', indicator: 'bg-green-500' },
  '中性肌肤': { text: 'text-pink-600', indicator: 'bg-pink-500' },
};

const LEVEL_COLORS: Record<string, string> = {
  '高价值客户': 'bg-purple-100 text-purple-700', '潜在价值客户': 'bg-blue-100 text-blue-600',
  '稳定客户': 'bg-green-100 text-green-700', '流失风险客户': 'bg-red-100 text-red-600',
  '新客户': 'bg-yellow-100 text-yellow-700',
};

export function UserProfile() {
  const [activeTab, setActiveTab] = useState<'segment' | 'skin' | 'behavior' | 'prediction'>('segment');
  const navigate = useNavigate();

  const segmentStats = useMemo(() => computeSegmentStats(customers), []);
  const skinStats = useMemo(() => computeSkinStats(customers, healthProfiles), []);
  const behaviorProfiles = useMemo(() => computeBehaviorProfiles(customers, consumptionRecords, healthProfiles), []);
  const predictionRows = useMemo(() => {
    const churnScores = computeChurnScores(customers, consumptionRecords);
    const ltvPredictions = computeLTVPredictions(customers, consumptionRecords);
    return customers.map((customer) => {
      const churn = churnScores.find((item) => item.customerId === customer.id);
      const ltv = ltvPredictions.find((item) => item.customerId === customer.id);
      const repurchase30dScore = Math.max(5, Math.min(95, 78 - (churn?.churnProbability || 20) + (customer.visitCount > 8 ? 12 : 0)));
      const marketingResponseScore = Math.max(5, Math.min(95, Math.round(repurchase30dScore * 0.65 + (customer.totalSpent > 10000 ? 18 : 8))));
      return {
        customer,
        churnScore: churn?.churnProbability || 20,
        churnLevel: churn?.riskLevel || '低',
        repurchase30dScore,
        marketingResponseScore,
        ltvTier: ltv?.ltvTier || '青铜',
        ltv12m: ltv?.predictedLTV12M || 0,
        reasons: [
          churn?.factors?.[0] || '暂无明显流失风险',
          `30天复购概率 ${repurchase30dScore} 分`,
          `预计12个月价值 ¥${(ltv?.predictedLTV12M || 0).toLocaleString()}`,
        ],
      };
    }).sort((a, b) => b.churnScore - a.churnScore);
  }, []);
  const [behaviorPage, setBehaviorPage] = useState(1);
  const [behaviorPageSize, setBehaviorPageSize] = useState(50);
  const [behaviorSegmentFilter, setBehaviorSegmentFilter] = useState('');
  const [behaviorSkinFilter, setBehaviorSkinFilter] = useState('');

  const filteredBehaviorProfiles = useMemo(() => {
    let list = behaviorProfiles;
    if (behaviorSegmentFilter) list = list.filter((b) => b.segment === behaviorSegmentFilter);
    if (behaviorSkinFilter) list = list.filter((b) => b.skinType === behaviorSkinFilter);
    return list;
  }, [behaviorProfiles, behaviorSegmentFilter, behaviorSkinFilter]);

  const behaviorTotal = filteredBehaviorProfiles.length;
  const behaviorData = filteredBehaviorProfiles.slice((behaviorPage - 1) * behaviorPageSize, behaviorPage * behaviorPageSize);

  const handleViewSegmentDetail = (segment: string) => {
    setBehaviorSegmentFilter(segment);
    setBehaviorSkinFilter('');
    setBehaviorPage(1);
    setActiveTab('behavior');
  };

  const handleViewSkinDetail = (skinType: string) => {
    setBehaviorSkinFilter(skinType);
    setBehaviorSegmentFilter('');
    setBehaviorPage(1);
    setActiveTab('behavior');
  };

  // Strategy templates for each segment
  const SEGMENT_STRATEGY: Record<string, { name: string; desc: string; trigger: string; actions: { type: string; value: string }[] }> = {
    '高价值客户': { name: 'VIP专享护理套餐', desc: '针对高消费高忠诚度客户，推出高端定制护理服务，提升客单价和满意度', trigger: 'consumption', actions: [{ type: 'discount', value: 'VIP专属9折' }, { type: 'gift', value: '季度护肤礼包' }] },
    '潜在价值客户': { name: '青春焕颜体验计划', desc: '针对年轻活跃客户群体，推出性价比高的护理体验套餐，促进消费升级', trigger: 'visit_frequency', actions: [{ type: 'coupon', value: '满500减100' }, { type: 'push', value: '新品体验推荐' }] },
    '稳定客户': { name: '老友回馈感恩活动', desc: '利用忠诚度营销，开展口碑传播和老带新活动，提升客户粘性', trigger: 'member_level', actions: [{ type: 'coupon', value: '老带新各得100元券' }, { type: 'points', value: '双倍积分' }] },
    '流失风险客户': { name: '挽回专属优惠', desc: '通过个性化服务和专属优惠重新激活长期未到店客户', trigger: 'dormant', actions: [{ type: 'coupon', value: '回归专享满300减80' }, { type: 'sms', value: '个性化唤醒短信' }] },
    '新客户': { name: '新客专享试用礼', desc: '低门槛体验活动提升新客转化和留存，建立首次消费信任', trigger: 'new_customer', actions: [{ type: 'coupon', value: '首单立减50' }, { type: 'push', value: '新人专属体验推荐' }] },
  };

  const SKIN_STRATEGY: Record<string, { name: string; desc: string; trigger: string; actions: { type: string; value: string }[] }> = {
    '干性肌肤': { name: '水润保湿护理季', desc: '针对干性肌肤缺水问题，推荐深度补水护理方案，搭配保湿产品套装', trigger: 'seasonal', actions: [{ type: 'coupon', value: '补水套餐立减200' }, { type: 'gift', value: '保湿精华试用装' }] },
    '油性肌肤': { name: '清爽控油焕肤计划', desc: '年轻油性肌肤群体，推出性价比高的控油清洁套餐', trigger: 'product_interest', actions: [{ type: 'coupon', value: '控油套餐8折' }, { type: 'push', value: '控油护肤指南' }] },
    '敏感肌肤': { name: '温和舒缓修护计划', desc: '高消费意愿群体，推荐温和无刺激的专业修护方案', trigger: 'product_interest', actions: [{ type: 'discount', value: '敏感肌专属9折' }, { type: 'gift', value: '修护面膜体验装' }] },
    '混合肌肤': { name: '精准分区护理套餐', desc: '最大肌肤群体，推出针对性分区护理解决方案', trigger: 'visit_frequency', actions: [{ type: 'coupon', value: '分区护理满500减80' }, { type: 'push', value: '分区护理科普推送' }] },
    '中性肌肤': { name: '轻奢养护体验', desc: '肤质优良群体，推荐预防性护理和高端体验项目', trigger: 'member_level', actions: [{ type: 'coupon', value: '养护体验套餐立减100' }, { type: 'points', value: '双倍积分' }] },
  };

  const goToStrategy = (template: { name: string; desc: string; trigger: string; actions: { type: string; value: string }[] }) => {
    const params = new URLSearchParams({
      name: template.name,
      desc: template.desc,
      trigger: template.trigger,
      actions: JSON.stringify(template.actions),
    });
    navigate(`/customer-marketing/strategy-templates?${params.toString()}`);
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 mb-2">用户画像</h1>
        <p className="text-sm text-gray-500">基于 {customers.length} 位客户数据自动分析，实时计算客户画像</p>
      </div>

      <div className="flex gap-4 bg-gray-100 p-1 rounded-lg">
        {([['segment', '客户细分'], ['skin', '肌质画像'], ['behavior', '消费画像'], ['prediction', '预测视角']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`flex-1 py-3 px-6 rounded-lg transition-all ${activeTab === key ? 'bg-white text-gray-800 shadow-sm font-medium' : 'text-gray-600 hover:text-gray-800'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* 客户细分 */}
      {activeTab === 'segment' && (
        <div className="grid grid-cols-2 gap-6">
          {segmentStats.map((seg) => {
            const rec = AI_RECOMMENDATIONS[seg.segment];
            return (
              <div key={seg.segment} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-medium text-gray-800">{seg.segment}</h3>
                  <div className={`w-3 h-3 rounded-full ${SEGMENT_INDICATORS[seg.segment]}`} />
                </div>
                <div className="grid grid-cols-2 gap-6 mb-6">
                  <div><div className="text-3xl font-semibold text-gray-800 mb-1">{seg.customerCount}</div><div className="text-sm text-gray-500">客户数量</div></div>
                  <div><div className="text-3xl font-semibold text-gray-800 mb-1">{seg.percentage}</div><div className="text-sm text-gray-500">占比</div></div>
                  <div><div className="text-lg font-medium text-gray-800 mb-1">{seg.avgSpend}</div><div className="text-sm text-gray-500">平均消费</div></div>
                  <div><div className="text-lg font-medium text-gray-800 mb-1">{seg.totalSpend}</div><div className="text-sm text-gray-500">消费总额</div></div>
                </div>
                <div className="mb-6"><div className="text-2xl font-semibold text-orange-500 mb-1">{seg.spendContribution}</div><div className="text-sm text-gray-500">消费总额占比</div></div>
                <div className="mb-6">
                  <div className="text-sm text-gray-600 mb-3">特征标签：</div>
                  <div className="flex flex-wrap gap-2">
                    {seg.characteristics.map((c, i) => <span key={i} className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-full">{c}</span>)}
                  </div>
                </div>
                <div className="bg-purple-50 rounded-xl p-4 mb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-4 h-4 text-purple-600" />
                    <span className="text-sm font-medium text-purple-900">AI营销推荐</span>
                    <span className="ml-auto px-2 py-0.5 bg-purple-200 text-purple-700 text-xs rounded-full">推荐度: {rec.confidence}</span>
                  </div>
                  <h4 className="text-base font-medium text-purple-900 mb-2">{rec.title}</h4>
                  <p className="text-sm text-purple-700">{rec.description}</p>
                </div>
                <button onClick={() => goToStrategy(SEGMENT_STRATEGY[seg.segment])} className="w-full py-3 bg-gradient-to-r from-purple-600 to-purple-500 text-white font-medium rounded-lg hover:from-purple-700 hover:to-purple-600 transition-all shadow-md">
                  立即制定营销策略
                </button>
                <button onClick={() => handleViewSegmentDetail(seg.segment)}
                  className="w-full mt-3 py-2 text-gray-600 text-sm hover:text-gray-800 transition-colors">
                  查看详情 →
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* 肌质画像 */}
      {activeTab === 'skin' && (
        <div className="grid grid-cols-2 gap-6">
          {skinStats.map((skin) => {
            const rec = SKIN_AI_RECOMMENDATIONS[skin.skinType] || { confidence: '80%', title: '通用护理', description: '推荐基础护理方案' };
            const services = SKIN_SERVICES[skin.skinType] || [];
            const colors = SKIN_COLORS[skin.skinType] || { text: 'text-gray-600', indicator: 'bg-gray-500' };
            return (
              <div key={skin.skinType} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 relative">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <span className={colors.text}>{SKIN_ICONS[skin.skinType]}</span>
                    <h3 className="text-lg font-medium text-gray-800">{skin.skinType}</h3>
                  </div>
                  <div className={`w-3 h-3 rounded-full ${colors.indicator}`} />
                </div>
                <div className="grid grid-cols-2 gap-6 mb-6">
                  <div><div className="text-3xl font-semibold text-gray-800 mb-1">{skin.customerCount}</div><div className="text-sm text-gray-500">客户数量</div></div>
                  <div><div className="text-3xl font-semibold text-gray-800 mb-1">{skin.percentage}</div><div className="text-sm text-gray-500">占比</div></div>
                  <div><div className="text-lg font-medium text-gray-800 mb-1">{skin.avgSpend}</div><div className="text-sm text-gray-500">平均消费</div></div>
                  <div><div className="text-lg font-medium text-gray-800 mb-1">{skin.avgAge}</div><div className="text-sm text-gray-500">平均年龄</div></div>
                </div>
                <div className="grid grid-cols-2 gap-6 mb-6">
                  <div><div className="text-lg font-medium text-gray-800 mb-1">{skin.totalSpend}</div><div className="text-sm text-gray-500">消费总额</div></div>
                  <div><div className="text-2xl font-semibold text-orange-500 mb-1">{skin.spendContribution}</div><div className="text-sm text-gray-500">消费总额占比</div></div>
                </div>
                <div className="mb-4">
                  <div className="text-sm text-gray-600 mb-3">肤质特征：</div>
                  <div className="flex flex-wrap gap-2">{skin.skinFeatures.map((f, i) => <span key={i} className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-full">{f}</span>)}</div>
                </div>
                <div className="mb-6">
                  <div className="text-sm text-gray-600 mb-3">偏好服务：</div>
                  <div className="flex flex-wrap gap-2">{services.map((s, i) => <span key={i} className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-full">{s}</span>)}</div>
                </div>
                <div className="bg-blue-50 rounded-xl p-4 mb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-900">AI肤质营销推荐</span>
                    <span className="ml-auto px-2 py-0.5 bg-blue-200 text-blue-700 text-xs rounded-full">推荐度: {rec.confidence}</span>
                  </div>
                  <h4 className="text-base font-medium text-blue-900 mb-2">{rec.title}</h4>
                  <p className="text-sm text-blue-700">{rec.description}</p>
                </div>
                <button onClick={() => goToStrategy(SKIN_STRATEGY[skin.skinType] || SKIN_STRATEGY['中性肌肤'])} className="w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-all shadow-md">制定肤质专属营销策略</button>
                <button onClick={() => handleViewSkinDetail(skin.skinType)}
                  className="w-full mt-3 py-2 text-gray-600 text-sm hover:text-gray-800 transition-colors">
                  查看详情 →
                </button>
                <div className="absolute top-4 right-4 px-3 py-1 bg-black text-white text-sm rounded-full">增长趋势 {skin.trend}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* 消费画像 */}
      {activeTab === 'behavior' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-800">客户消费行为详情</h3>
            <div className="flex items-center gap-3">
              <select value={behaviorSegmentFilter} onChange={(e) => { setBehaviorSegmentFilter(e.target.value); setBehaviorPage(1); }} className="h-8 px-2 text-sm border border-gray-300 rounded">
                <option value="">全部分类</option>
                <option value="高价值客户">高价值客户</option>
                <option value="潜在价值客户">潜在价值客户</option>
                <option value="稳定客户">稳定客户</option>
                <option value="流失风险客户">流失风险客户</option>
                <option value="新客户">新客户</option>
              </select>
              <select value={behaviorSkinFilter} onChange={(e) => { setBehaviorSkinFilter(e.target.value); setBehaviorPage(1); }} className="h-8 px-2 text-sm border border-gray-300 rounded">
                <option value="">全部肌肤</option>
                <option value="干性肌肤">干性肌肤</option>
                <option value="油性肌肤">油性肌肤</option>
                <option value="敏感肌肤">敏感肌肤</option>
                <option value="混合肌肤">混合肌肤</option>
                <option value="中性肌肤">中性肌肤</option>
                <option value="未分类">未分类</option>
              </select>
              <span className="text-sm text-gray-500">共 {behaviorTotal} 位客户</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-600">客户</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-600">消费等级</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-600">肌肤类型</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-600">到店频次</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-600">平均消费</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-600">偏好服务</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-600">促销敏感度</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-600">复购率</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-600">忠诚度</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-600">季节趋势</th>
                </tr>
              </thead>
              <tbody>
                {behaviorData.map((b) => (
                  <tr key={b.customerId} className="border-b border-gray-100 hover:bg-blue-50/30">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">👩</span>
                        <span className="font-medium text-gray-800">{b.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-3 py-1 text-sm rounded-full ${LEVEL_COLORS[b.segment] || 'bg-gray-100 text-gray-700'}`}>{b.segment}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-3 py-1 text-sm rounded-full ${b.skinType === '未分类' ? 'bg-gray-100 text-gray-500' : 'bg-blue-50 text-blue-700'}`}>{b.skinType}</span>
                    </td>
                    <td className="px-6 py-4 text-gray-700">{b.visitFrequency}</td>
                    <td className="px-6 py-4 text-gray-700">{b.avgSpend}</td>
                    <td className="px-6 py-4 text-gray-700">{b.preferredService}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-700">{b.promotionSensitivity}</span>
                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden w-20">
                          <div className="h-full bg-gray-800 rounded-full" style={{ width: b.promotionSensitivity }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-700">{b.repurchaseRate}</span>
                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden w-20">
                          <div className="h-full bg-gray-800 rounded-full" style={{ width: b.repurchaseRate }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-700">{b.loyalty}</span>
                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden w-20">
                          <div className="h-full bg-gray-800 rounded-full" style={{ width: b.loyalty }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-700 whitespace-nowrap">{b.seasonalTrend}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
            <div className="text-sm text-gray-600">共 {behaviorTotal} 条</div>
            <div className="flex items-center gap-2">
              <select value={behaviorPageSize} onChange={(e) => { setBehaviorPageSize(Number(e.target.value)); setBehaviorPage(1); }} className="h-8 px-2 text-sm border border-gray-300 rounded">
                <option value={10}>10条/页</option>
                <option value={20}>20条/页</option>
                <option value={50}>50条/页</option>
              </select>
              <button disabled={behaviorPage <= 1} onClick={() => setBehaviorPage(behaviorPage - 1)} className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-50">上一页</button>
              <span className="text-sm text-gray-600">{behaviorPage} / {Math.ceil(behaviorTotal / behaviorPageSize) || 1}</span>
              <button disabled={behaviorPage >= Math.ceil(behaviorTotal / behaviorPageSize)} onClick={() => setBehaviorPage(behaviorPage + 1)} className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-50">下一页</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'prediction' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div>
              <h3 className="text-lg font-medium text-gray-800">客户预测视角</h3>
              <p className="mt-1 text-sm text-gray-500">模型版本 rules-v1；展示流失风险、30天复购概率、营销响应分和 LTV 分层。</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-600">客户</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-600">流失风险</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-600">30天复购</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-600">营销响应</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-600">LTV层级</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-600">原因</th>
                </tr>
              </thead>
              <tbody>
                {predictionRows.slice(0, 50).map((row) => (
                  <tr key={row.customer.id} className="border-b border-gray-100 hover:bg-blue-50/30">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-800">{row.customer.name}</div>
                      <div className="text-xs text-gray-400">{row.customer.memberLevel}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`rounded px-2 py-1 text-sm ${row.churnLevel === '极高' || row.churnLevel === '高' ? 'bg-red-50 text-red-700' : row.churnLevel === '中' ? 'bg-yellow-50 text-yellow-700' : 'bg-green-50 text-green-700'}`}>
                        {row.churnScore} / {row.churnLevel}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-700">{row.repurchase30dScore}分</td>
                    <td className="px-6 py-4 text-gray-700">{row.marketingResponseScore}分</td>
                    <td className="px-6 py-4">
                      <span className="rounded bg-purple-50 px-2 py-1 text-sm text-purple-700">{row.ltvTier}</span>
                      <div className="mt-1 text-xs text-gray-400">¥{row.ltv12m.toLocaleString()}</div>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-600">{row.reasons.join('；')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
