import { useEffect, useState, type ComponentType } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { BarChart3, Gift, MousePointerClick, PanelTop, Smartphone } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { MarketingPageManagement } from './MarketingPageManagement';
import { PromotionManagement } from './PromotionManagement';
import { AmiGlowManagement } from './AmiGlowManagement';
import { CustomerAppEventTable } from '../components/CustomerAppEventTable';
import { useStoreStore } from '@/stores/storeStore';

type AssetTab = 'pages' | 'promotions' | 'glow' | 'events';

const assetTabs: Array<{ value: AssetTab; label: string; description: string; icon: ComponentType<{ className?: string }> }> = [
  { value: 'pages', label: '推广页', description: '落地页、活动页与传播链接', icon: PanelTop },
  { value: 'promotions', label: '优惠权益', description: '门店可发放的权益与折扣', icon: Gift },
  { value: 'glow', label: '小程序展示', description: 'Ami Glow 首页展示配置', icon: Smartphone },
  { value: 'events', label: '数据明细', description: '客户浏览、点击与预约行为', icon: MousePointerClick },
];

const effectFilterByTab: Record<AssetTab, string> = {
  pages: 'page',
  promotions: 'promotion',
  glow: 'glow',
  events: 'glow',
};

function isAssetTab(value: string | null): value is AssetTab {
  return value === 'pages' || value === 'promotions' || value === 'glow' || value === 'events';
}

export function MarketingAssets() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentStoreId = useStoreStore((state) => state.currentStoreId);
  const requestedTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<AssetTab>(isAssetTab(requestedTab) ? requestedTab : 'pages');

  useEffect(() => {
    if (isAssetTab(requestedTab)) {
      setActiveTab(requestedTab);
    }
  }, [requestedTab]);

  const handleTabChange = (value: string) => {
    const nextTab = isAssetTab(value) ? value : 'pages';
    const params = new URLSearchParams(searchParams);
    params.set('tab', nextTab);
    setActiveTab(nextTab);
    setSearchParams(params, { replace: true });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm text-gray-500">首页 / 智能营销 / 推广资产</div>
          <h1 className="mt-2 text-2xl font-semibold text-gray-900">推广资产</h1>
          <p className="mt-1 text-sm text-gray-500">
            统一管理推广页、优惠权益、小程序展示和客户行为数据，供自动触达、活动投放和数据复盘复用。
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate(`/customer-marketing/effect-analysis?objectType=${effectFilterByTab[activeTab]}`)}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
        >
          <BarChart3 className="h-4 w-4" />
          查看该类数据复盘
        </button>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-xl border border-gray-200 bg-white p-1">
          {assetTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="min-w-[168px] justify-start gap-2 px-4 py-3 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700"
              >
                <Icon className="h-4 w-4" />
                <span className="flex flex-col items-start">
                  <span className="text-sm font-medium">{tab.label}</span>
                  <span className="text-xs font-normal text-gray-500">{tab.description}</span>
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="pages" className="rounded-xl border border-gray-200 bg-white p-4">
          {activeTab === 'pages' && <MarketingPageManagement embedded />}
        </TabsContent>
        <TabsContent value="promotions" className="rounded-xl border border-gray-200 bg-white p-4">
          {activeTab === 'promotions' && <PromotionManagement embedded />}
        </TabsContent>
        <TabsContent value="glow" className="rounded-xl border border-gray-200 bg-white p-4">
          {activeTab === 'glow' && <AmiGlowManagement embedded section="configs" />}
        </TabsContent>
        <TabsContent value="events" className="rounded-xl border border-gray-200 bg-white p-4">
          {activeTab === 'events' && (
            <CustomerAppEventTable
              mode="marketingAsset"
              defaultFilters={{ storeId: currentStoreId, source: 'ami_glow' }}
              exportFileName="推广数据明细"
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
