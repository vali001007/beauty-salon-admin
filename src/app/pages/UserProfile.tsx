import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Sparkles, Droplets, Flame, AlertCircle, Layers, Heart, Smartphone, MousePointer, CalendarCheck, TrendingUp } from 'lucide-react';
import {
  getCustomerMiniappBehaviorAnalysis,
  getCustomerProfileAnalyticsOverview,
  getCustomerProfileBehaviorAnalytics,
  getCustomerProfilePredictionAnalytics,
  getCustomerProfileSegmentAnalytics,
  getCustomerProfileSkinAnalytics,
} from '@/api/customer';
import { useStoreStore } from '@/stores/storeStore';
import type { CustomerMiniappBehaviorAnalysis, CustomerProfileAnalytics } from '@/types';
import {
  AI_RECOMMENDATIONS, SKIN_AI_RECOMMENDATIONS, SKIN_SERVICES,
} from '@/utils/customerSegmentation';

const SEGMENT_INDICATORS: Record<string, string> = {
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
  const [activeTab, setActiveTab] = useState<'segment' | 'skin' | 'behavior' | 'miniapp' | 'prediction'>('segment');
  const navigate = useNavigate();
  const currentStoreId = useStoreStore((state) => state.currentStoreId);
  const [analytics, setAnalytics] = useState<CustomerProfileAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState('');
  const [loadedSections, setLoadedSections] = useState<Record<string, boolean>>({});
  const [sectionLoading, setSectionLoading] = useState('');
  const [sectionError, setSectionError] = useState('');
  const [miniappAnalysis, setMiniappAnalysis] = useState<CustomerMiniappBehaviorAnalysis | null>(null);
  const [miniappLoading, setMiniappLoading] = useState(false);
  const [miniappError, setMiniappError] = useState('');

  const segmentStats = analytics?.segmentStats ?? [];
  const skinStats = analytics?.skinStats ?? [];
  const behaviorProfiles = analytics?.behaviorProfiles ?? [];
  const predictionRows = analytics?.predictionRows ?? [];
  const totalCustomers = analytics?.totalCustomers ?? 0;
  const [behaviorPage, setBehaviorPage] = useState(1);
  const [behaviorPageSize, setBehaviorPageSize] = useState(10);
  const [behaviorTotal, setBehaviorTotal] = useState(0);
  const [behaviorSegmentFilter, setBehaviorSegmentFilter] = useState('');
  const [behaviorSkinFilter, setBehaviorSkinFilter] = useState('');
  const [predictionPage, setPredictionPage] = useState(1);
  const [predictionPageSize, setPredictionPageSize] = useState(10);
  const [predictionTotal, setPredictionTotal] = useState(0);
  const behaviorData = behaviorProfiles;

  useEffect(() => {
    let cancelled = false;
    const loadAnalytics = async () => {
      setAnalyticsLoading(true);
      setAnalyticsError('');
      try {
        const result = await getCustomerProfileAnalyticsOverview();
        if (!cancelled) {
          setAnalytics({
            ...result,
            segmentStats: [],
            skinStats: [],
            behaviorProfiles: [],
            predictionRows: [],
          });
        }
      } catch {
        if (!cancelled) setAnalyticsError('\u5ba2\u6237\u753b\u50cf\u6982\u89c8\u52a0\u8f7d\u5931\u8d25\uff0c\u8bf7\u786e\u8ba4\u540e\u7aef\u670d\u52a1\u3001\u767b\u5f55\u72b6\u6001\u548c\u5ba2\u6237\u753b\u50cf\u6743\u9650\u6b63\u5e38\u3002');
      } finally {
        if (!cancelled) setAnalyticsLoading(false);
      }
    };

    setAnalytics(null);
    setLoadedSections({});
    setSectionError('');
    setSectionLoading('');
    setBehaviorPage(1);
    setBehaviorTotal(0);
    setPredictionPage(1);
    setPredictionTotal(0);
    void loadAnalytics();
    return () => {
      cancelled = true;
    };
  }, [currentStoreId]);

  useEffect(() => {
    setLoadedSections({});
    setSectionError('');
    setMiniappAnalysis(null);
    setMiniappError('');
  }, [currentStoreId]);

  useEffect(() => {
    if (analyticsLoading) return;
    let cancelled = false;

    const mergeAnalytics = (partial: Partial<CustomerProfileAnalytics>) => {
      setAnalytics((previous) => ({
        generatedAt: partial.generatedAt ?? previous?.generatedAt ?? '',
        storeId: partial.storeId ?? previous?.storeId,
        totalCustomers: partial.totalCustomers ?? previous?.totalCustomers ?? 0,
        segmentStats: partial.segmentStats ?? previous?.segmentStats ?? [],
        skinStats: partial.skinStats ?? previous?.skinStats ?? [],
        behaviorProfiles: partial.behaviorProfiles ?? previous?.behaviorProfiles ?? [],
        predictionRows: partial.predictionRows ?? previous?.predictionRows ?? [],
      }));
    };

    const loadSection = async () => {
      setSectionError('');
      try {
        if (activeTab === 'segment') {
          if (loadedSections.segment) return;
          setSectionLoading('segment');
          const result = await getCustomerProfileSegmentAnalytics();
          if (!cancelled) {
            mergeAnalytics(result);
            setLoadedSections((prev) => ({ ...prev, segment: true }));
          }
        } else if (activeTab === 'skin') {
          if (loadedSections.skin) return;
          setSectionLoading('skin');
          const result = await getCustomerProfileSkinAnalytics();
          if (!cancelled) {
            mergeAnalytics(result);
            setLoadedSections((prev) => ({ ...prev, skin: true }));
          }
        } else if (activeTab === 'behavior') {
          setSectionLoading('behavior');
          const result = await getCustomerProfileBehaviorAnalytics({
            page: behaviorPage,
            pageSize: behaviorPageSize,
            segment: behaviorSegmentFilter || undefined,
            skinType: behaviorSkinFilter || undefined,
          });
          if (!cancelled) {
            mergeAnalytics({
              generatedAt: result.generatedAt,
              storeId: result.storeId,
              totalCustomers: result.totalCustomers,
              behaviorProfiles: result.items ?? result.data ?? [],
            });
            setBehaviorTotal(result.total);
          }
        } else if (activeTab === 'prediction') {
          setSectionLoading('prediction');
          const result = await getCustomerProfilePredictionAnalytics({
            page: predictionPage,
            pageSize: predictionPageSize,
          });
          if (!cancelled) {
            mergeAnalytics({
              generatedAt: result.generatedAt,
              storeId: result.storeId,
              totalCustomers: result.totalCustomers,
              predictionRows: result.items ?? result.data ?? [],
            });
            setPredictionTotal(result.total);
          }
        }
      } catch {
        if (!cancelled) setSectionError('当前页签数据加载失败，请稍后重试。');
      } finally {
        if (!cancelled) setSectionLoading('');
      }
    };

    void loadSection();
    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    analyticsLoading,
    loadedSections.segment,
    loadedSections.skin,
    behaviorPage,
    behaviorPageSize,
    behaviorSegmentFilter,
    behaviorSkinFilter,
    predictionPage,
    predictionPageSize,
  ]);

  useEffect(() => {
    if (activeTab !== 'miniapp' || miniappAnalysis || miniappLoading) return;
    const loadMiniappAnalysis = async () => {
      setMiniappLoading(true);
      setMiniappError('');
      try {
        setMiniappAnalysis(await getCustomerMiniappBehaviorAnalysis());
      } catch {
        setMiniappError('小程序行为分析加载失败，请确认后端服务和客户画像权限正常。');
      } finally {
        setMiniappLoading(false);
      }
    };
    void loadMiniappAnalysis();
  }, [activeTab, miniappAnalysis, miniappLoading]);

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
    navigate(`/customer-marketing/automation?${params.toString()}`);
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 mb-2">用户画像</h1>
        <p className="text-sm text-gray-500">
          基于 {totalCustomers} 位真实客户数据自动分析，数据来自当前门店的 Core 业务记录
          {analytics?.generatedAt ? `，生成时间：${analytics.generatedAt}` : ''}
        </p>
      </div>

      {analyticsLoading && (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          正在加载客户画像分析...
        </div>
      )}

      {analyticsError && (
        <div className="rounded-xl border border-red-100 bg-red-50 p-5 text-sm text-red-700">
          {analyticsError}
        </div>
      )}

      <div className="flex gap-4 bg-gray-100 p-1 rounded-lg">
        {([['segment', '客户细分'], ['skin', '肌质画像'], ['behavior', '消费画像'], ['miniapp', '小程序行为'], ['prediction', '预测视角']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`flex-1 py-3 px-6 rounded-lg transition-all ${activeTab === key ? 'bg-white text-gray-800 shadow-sm font-medium' : 'text-gray-600 hover:text-gray-800'}`}>
            {key === 'miniapp' ? '小程序行为分析' : label}
          </button>
        ))}
      </div>

      {sectionLoading === activeTab && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-center text-sm text-blue-700">
          正在加载当前页签数据...
        </div>
      )}

      {sectionError && (
        <div className="rounded-xl border border-red-100 bg-red-50 p-5 text-sm text-red-700">
          {sectionError}
        </div>
      )}

      {/* 客户细分 */}
      {activeTab === 'segment' && (
        <div className="grid grid-cols-2 gap-6">
          {segmentStats.map((seg) => {
            const rec = AI_RECOMMENDATIONS[seg.segment as keyof typeof AI_RECOMMENDATIONS] ?? AI_RECOMMENDATIONS['稳定客户'];
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

      {activeTab === 'miniapp' && (
        <div className="space-y-6">
          {miniappLoading && (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
              正在加载小程序行为分析...
            </div>
          )}
          {miniappError && (
            <div className="rounded-xl border border-red-100 bg-red-50 p-5 text-sm text-red-700">
              {miniappError}
            </div>
          )}
          {miniappAnalysis && (
            <>
              <div className="grid grid-cols-4 gap-4">
                <MiniappMetricCard
                  title="可触达客户"
                  value={`${miniappAnalysis.summary.boundCustomers} / ${miniappAnalysis.summary.totalCustomers}`}
                  hint="手机号或微信可用于小程序会员绑定"
                  icon={<Smartphone className="h-5 w-5 text-blue-600" />}
                />
                <MiniappMetricCard
                  title="30天活跃客户"
                  value={miniappAnalysis.summary.activeCustomers30d}
                  hint={`7天活跃 ${miniappAnalysis.summary.activeCustomers7d} 位`}
                  icon={<MousePointer className="h-5 w-5 text-green-600" />}
                />
                <MiniappMetricCard
                  title="预约意向行为"
                  value={miniappAnalysis.summary.reservationIntentCount}
                  hint="预约提交、到店确认等行为合计"
                  icon={<CalendarCheck className="h-5 w-5 text-purple-600" />}
                />
                <MiniappMetricCard
                  title="平均互动评分"
                  value={miniappAnalysis.summary.avgEngagementScore}
                  hint={`数据源：${miniappAnalysis.summary.dataSource === 'miniapp_events' ? '小程序埋点' : 'Core真实记录推导'}`}
                  icon={<TrendingUp className="h-5 w-5 text-orange-600" />}
                />
              </div>

              <div className="grid grid-cols-[1.05fr_0.95fr] gap-6">
                <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                  <div className="mb-4">
                    <h3 className="text-lg font-medium text-gray-800">小程序转化漏斗</h3>
                    <p className="mt-1 text-sm text-gray-500">先按 Core 真实业务记录推导，未来接入小程序埋点后可直接替换数据源。</p>
                  </div>
                  <div className="space-y-3">
                    {miniappAnalysis.funnel.map((item) => (
                      <div key={item.stage}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="font-medium text-gray-700">{item.stage}</span>
                          <span className="text-gray-500">{item.count} 位 / {item.rate}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                          <div className="h-full rounded-full bg-blue-600" style={{ width: item.rate }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                  <div className="mb-4">
                    <h3 className="text-lg font-medium text-gray-800">入口模块表现</h3>
                    <p className="mt-1 text-sm text-gray-500">用于指导小程序首页、活动页、预约页和会员权益页的埋点设计。</p>
                  </div>
                  <div className="space-y-3">
                    {miniappAnalysis.entryModules.map((module) => (
                      <div key={module.name} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-800">{module.name}</span>
                          <span className="text-sm text-gray-500">{module.eventCount} 次行为</span>
                        </div>
                        <div className="mt-1 text-xs text-gray-500">覆盖 {module.customerCount} 位客户</div>
                        <div className="mt-2 text-xs text-gray-600">{module.conversionHint}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                {miniappAnalysis.segments.map((segment) => (
                  <div key={segment.label} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="text-sm font-medium text-gray-800">{segment.label}</div>
                    <div className="mt-3 text-3xl font-semibold text-gray-900">{segment.customerCount}</div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-500">
                      <div>活跃率 <span className="font-medium text-gray-700">{segment.activeRate}</span></div>
                      <div>转化率 <span className="font-medium text-gray-700">{segment.conversionRate}</span></div>
                      <div className="col-span-2">均分 <span className="font-medium text-gray-700">{segment.avgScore}</span></div>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-gray-600">{segment.suggestion}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-gray-200 p-6">
                  <div>
                    <h3 className="text-lg font-medium text-gray-800">客户小程序行为明细</h3>
                    <p className="mt-1 text-sm text-gray-500">展示互动评分最高的客户，帮助门店判断谁更适合推送预约、权益或顾问跟进。</p>
                  </div>
                  <span className="text-sm text-gray-500">生成时间：{miniappAnalysis.summary.generatedAt}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="px-6 py-4 text-left text-sm font-medium text-gray-600">客户</th>
                        <th className="px-6 py-4 text-left text-sm font-medium text-gray-600">状态</th>
                        <th className="px-6 py-4 text-left text-sm font-medium text-gray-600">互动评分</th>
                        <th className="px-6 py-4 text-left text-sm font-medium text-gray-600">预约/订单</th>
                        <th className="px-6 py-4 text-left text-sm font-medium text-gray-600">营销触达</th>
                        <th className="px-6 py-4 text-left text-sm font-medium text-gray-600">最近活跃</th>
                        <th className="px-6 py-4 text-left text-sm font-medium text-gray-600">建议动作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {miniappAnalysis.customers.map((customer) => (
                        <tr key={customer.customerId} className="border-b border-gray-100 hover:bg-blue-50/30">
                          <td className="px-6 py-4">
                            <div className="font-medium text-gray-800">{customer.name}</div>
                            <div className="text-xs text-gray-400">{customer.phone || '未留手机号'} · {customer.storeName}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`rounded px-2 py-1 text-sm ${customer.miniappStatus === '高活跃' ? 'bg-green-50 text-green-700' : customer.miniappStatus === '有意向' ? 'bg-blue-50 text-blue-700' : customer.miniappStatus === '待绑定' ? 'bg-yellow-50 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>
                              {customer.miniappStatus}
                            </span>
                            <div className="mt-1 text-xs text-gray-400">意向 {customer.intentLevel}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-medium text-gray-800">{customer.engagementScore}</div>
                            <div className="mt-1 h-2 w-24 overflow-hidden rounded-full bg-gray-100">
                              <div className="h-full rounded-full bg-gray-800" style={{ width: `${customer.engagementScore}%` }} />
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-700">{customer.reservationCount} / {customer.orderCount}</td>
                          <td className="px-6 py-4 text-sm text-gray-700">{customer.marketingTouchCount} 次</td>
                          <td className="px-6 py-4 text-sm text-gray-700">{customer.lastActiveAt || '-'}</td>
                          <td className="max-w-72 px-6 py-4 text-sm text-gray-600">
                            <div>{customer.nextAction}</div>
                            <button
                              type="button"
                              className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-700"
                              onClick={() => navigate(`/customers/data?tab=miniapp&keyword=${encodeURIComponent(customer.phone || customer.name)}`)}
                            >
                              查看行为明细
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-6">
                <h3 className="text-base font-medium text-blue-900">未来客户服务端小程序埋点契约</h3>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {miniappAnalysis.eventContract.map((field) => (
                    <div key={field.field} className="rounded-lg border border-blue-100 bg-white p-3">
                      <div className="flex items-center justify-between">
                        <code className="text-sm font-medium text-blue-800">{field.field}</code>
                        <span className={`rounded px-2 py-0.5 text-xs ${field.required ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
                          {field.required ? '必填' : '可选'}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-gray-600">{field.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
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
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-600">生命周期</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-600">机会</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-600">原因</th>
                </tr>
              </thead>
              <tbody>
                {predictionRows.map((row) => (
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
                    <td className="px-6 py-4">
                      {row.lifecycleStageLabel ? (
                        <span className="rounded bg-emerald-50 px-2 py-1 text-sm text-emerald-700">{row.lifecycleStageLabel}</span>
                      ) : (
                        <span className="text-xs text-gray-400">待计算</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex max-w-[220px] flex-wrap gap-1">
                        {row.opportunityTypeLabels?.length ? row.opportunityTypeLabels.slice(0, 3).map((label) => (
                          <span key={label} className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">{label}</span>
                        )) : <span className="text-xs text-gray-400">暂无机会</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-600">
                      {[...row.reasons, ...(row.topLifecycleEvidence ?? [])].filter(Boolean).slice(0, 5).join('；')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
            <div className="text-sm text-gray-600">共 {predictionTotal} 条</div>
            <div className="flex items-center gap-2">
              <select
                value={predictionPageSize}
                onChange={(e) => {
                  setPredictionPageSize(Number(e.target.value));
                  setPredictionPage(1);
                }}
                className="h-8 px-2 text-sm border border-gray-300 rounded"
              >
                <option value={10}>10条/页</option>
                <option value={20}>20条/页</option>
                <option value={50}>50条/页</option>
              </select>
              <button
                disabled={predictionPage <= 1}
                onClick={() => setPredictionPage(predictionPage - 1)}
                className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-50"
              >
                上一页
              </button>
              <span className="text-sm text-gray-600">
                {predictionPage} / {Math.ceil(predictionTotal / predictionPageSize) || 1}
              </span>
              <button
                disabled={predictionPage >= Math.ceil(predictionTotal / predictionPageSize)}
                onClick={() => setPredictionPage(predictionPage + 1)}
                className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-50"
              >
                下一页
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniappMetricCard({
  title,
  value,
  hint,
  icon,
}: {
  title: string;
  value: number | string;
  hint: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">{title}</span>
        {icon}
      </div>
      <div className="mt-3 text-2xl font-semibold text-gray-900">{value}</div>
      <div className="mt-1 text-xs text-gray-500">{hint}</div>
    </div>
  );
}
