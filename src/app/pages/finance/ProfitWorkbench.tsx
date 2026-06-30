import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Package, RefreshCcw, Settings, ShoppingBag, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import {
  getOperationProfitOverview,
  getProductMargins,
  getProjectMargins,
  type MissingCostReason,
  type OperationProfitOverview as OperationProfitOverviewData,
  type ProductMarginRow,
  type ProjectMarginRow,
} from '@/api/operationProfit';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Button } from '../../components/UI';
import { usePermission } from '@/hooks/usePermission';
import { useStoreStore } from '@/stores/storeStore';
import { OperationCostSettings } from '../operation-profit/OperationCostSettings';
import { OperationProfitOverview } from '../operation-profit/OperationProfitOverview';
import { ProductMarginAnalysis } from '../operation-profit/ProductMarginAnalysis';
import { ProjectMarginAnalysis } from '../operation-profit/ProjectMarginAnalysis';
import { dataQualityLabels, missingReasonLabels, money, monthStartText, statusTone, StatusBadge, todayText } from '../operation-profit/utils';

type ProfitTab = 'overview' | 'products' | 'projects' | 'costs' | 'gaps';

type GapItem = {
  key: string;
  source: 'overview' | 'product' | 'project';
  title: string;
  detail: string;
  reason: MissingCostReason;
  amount?: number;
  targetTab: ProfitTab;
};

function reasonTarget(reason: MissingCostReason, canManageCosts: boolean): ProfitTab {
  if (reason === 'missing_cost') return canManageCosts ? 'costs' : 'products';
  if (reason === 'missing_actual_consumption') return canManageCosts ? 'costs' : 'projects';
  if (reason === 'missing_bom' || reason === 'missing_project_master') return 'projects';
  return 'gaps';
}

function buildGapItems(overview: OperationProfitOverviewData | null, products: ProductMarginRow[], projects: ProjectMarginRow[], canManageCosts: boolean) {
  const items: GapItem[] = [];
  for (const reason of overview?.dataQuality.missingCostReasons ?? []) {
    items.push({
      key: `overview-${reason}`,
      source: 'overview',
      title: missingReasonLabels[reason] ?? reason,
      detail: overview?.dataQuality.detail || '经营利润口径存在数据缺口，请先补齐后再判断利润。',
      reason,
      targetTab: reasonTarget(reason, canManageCosts),
    });
  }
  for (const row of products) {
    for (const reason of row.missingCostReasons ?? []) {
      items.push({
        key: `product-${row.productId}-${reason}`,
        source: 'product',
        title: row.productName,
        detail: `${missingReasonLabels[reason] ?? reason}；净收入 ${money(row.netSalesAmount)}，当前毛利 ${money(row.grossProfit)}。`,
        reason,
        amount: row.grossProfit,
        targetTab: reason === 'missing_cost' && canManageCosts ? 'costs' : 'products',
      });
    }
  }
  for (const row of projects) {
    for (const reason of row.missingCostReasons ?? []) {
      items.push({
        key: `project-${row.projectId}-${reason}`,
        source: 'project',
        title: row.projectName,
        detail: `${missingReasonLabels[reason] ?? reason}；服务收入 ${money(row.serviceIncome)}，贡献毛利 ${money(row.contributionProfit)}。`,
        reason,
        amount: row.contributionProfit,
        targetTab: reason === 'missing_commission' ? 'gaps' : reasonTarget(reason, canManageCosts),
      });
    }
  }
  return items;
}

function DataGapPane({ onNavigate, canManageCosts }: { onNavigate: (tab: ProfitTab) => void; canManageCosts: boolean }) {
  const currentStoreId = useStoreStore((state) => state.currentStoreId);
  const [overview, setOverview] = useState<OperationProfitOverviewData | null>(null);
  const [products, setProducts] = useState<ProductMarginRow[]>([]);
  const [projects, setProjects] = useState<ProjectMarginRow[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { storeId: currentStoreId ?? undefined, from: monthStartText(), to: todayText() };
      const [overviewData, productPage, projectPage] = await Promise.all([
        getOperationProfitOverview(params),
        getProductMargins({ ...params, page: 1, pageSize: 100, status: 'cost_missing' }),
        getProjectMargins({ ...params, page: 1, pageSize: 100, status: 'cost_missing' }),
      ]);
      setOverview(overviewData);
      setProducts(productPage.items);
      setProjects(projectPage.items);
    } catch (error: any) {
      toast.error(error?.message || '加载利润数据缺口失败');
    } finally {
      setLoading(false);
    }
  }, [currentStoreId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const gapItems = useMemo(() => buildGapItems(overview, products, projects, canManageCosts), [canManageCosts, overview, products, projects]);
  const productCostGap = gapItems.filter((item) => item.reason === 'missing_cost').length;
  const bomGap = gapItems.filter((item) => item.reason === 'missing_bom' || item.reason === 'missing_project_master').length;
  const materialGap = gapItems.filter((item) => item.reason === 'missing_actual_consumption').length;
  const commissionGap = gapItems.filter((item) => item.reason === 'missing_commission').length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-foreground">数据缺口</div>
          <p className="mt-1 text-sm text-muted-foreground">汇总利润总览、商品毛利、项目毛利里的成本、BOM、耗材和提成缺口。</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => void loadData()} disabled={loading}>
          <RefreshCcw className="h-4 w-4" /> 刷新
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <GapMetric label="缺商品/经营成本" value={productCostGap} onClick={() => onNavigate(canManageCosts ? 'costs' : 'products')} />
        <GapMetric label="缺项目 BOM" value={bomGap} onClick={() => onNavigate('projects')} />
        <GapMetric label="缺实际耗材" value={materialGap} onClick={() => onNavigate(canManageCosts ? 'costs' : 'projects')} />
        <GapMetric label="缺提成记录" value={commissionGap} onClick={() => onNavigate('gaps')} />
      </div>

      {overview ? (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm text-muted-foreground">利润可信度</div>
              <div className="mt-1 font-medium text-foreground">{dataQualityLabels[overview.dataQuality.status]}</div>
            </div>
            <StatusBadge tone={statusTone(overview.dataQuality.status)}>{dataQualityLabels[overview.dataQuality.status]}</StatusBadge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{overview.dataQuality.detail}</p>
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-card">
        <div className="grid grid-cols-[1.2fr_1.6fr_0.8fr_0.8fr] gap-3 border-b border-border bg-muted/40 px-4 py-3 text-xs font-medium text-muted-foreground">
          <div>对象</div>
          <div>缺口说明</div>
          <div>来源</div>
          <div className="text-right">处理</div>
        </div>
        {gapItems.length ? (
          gapItems.map((item) => (
            <div key={item.key} className="grid grid-cols-[1.2fr_1.6fr_0.8fr_0.8fr] items-center gap-3 border-b border-border px-4 py-3 text-sm last:border-0">
              <div>
                <div className="font-medium text-foreground">{item.title}</div>
                <div className="mt-1 text-xs text-muted-foreground">{missingReasonLabels[item.reason] ?? item.reason}</div>
              </div>
              <div className="text-muted-foreground">{item.detail}</div>
              <div>
                <StatusBadge tone={item.source === 'product' ? 'border-blue-200 bg-blue-50 text-blue-700' : item.source === 'project' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}>
                  {item.source === 'product' ? '商品毛利' : item.source === 'project' ? '项目毛利' : '利润总览'}
                </StatusBadge>
              </div>
              <div className="text-right">
                <Button size="sm" variant="outline" className="gap-1" onClick={() => onNavigate(item.targetTab)}>
                  定位 <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))
        ) : (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            {loading ? '正在读取数据缺口...' : '当前筛选周期暂未发现成本、BOM、耗材或提成缺口。'}
          </div>
        )}
      </div>
    </div>
  );
}

function GapMetric({ label, value, onClick }: { label: string; value: number; onClick: () => void }) {
  return (
    <button type="button" className="rounded-lg border border-border bg-card p-4 text-left hover:bg-muted/40" onClick={onClick}>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
    </button>
  );
}

export function ProfitWorkbench() {
  const [tab, setTab] = useState<ProfitTab>('overview');
  const canManageCosts = usePermission('core:operation-cost:view');

  return (
    <div className="flex flex-col gap-6">
      <Tabs value={tab} onValueChange={(value) => setTab(value as ProfitTab)} className="gap-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="overview" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            利润总览
          </TabsTrigger>
          <TabsTrigger value="products" className="gap-2">
            <ShoppingBag className="h-4 w-4" />
            商品毛利
          </TabsTrigger>
          <TabsTrigger value="projects" className="gap-2">
            <Package className="h-4 w-4" />
            项目毛利
          </TabsTrigger>
          {canManageCosts ? (
            <TabsTrigger value="costs" className="gap-2">
              <Settings className="h-4 w-4" />
              成本配置
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="gaps" className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            数据缺口
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">{tab === 'overview' ? <OperationProfitOverview /> : null}</TabsContent>
        <TabsContent value="products">{tab === 'products' ? <ProductMarginAnalysis /> : null}</TabsContent>
        <TabsContent value="projects">{tab === 'projects' ? <ProjectMarginAnalysis /> : null}</TabsContent>
        {canManageCosts ? <TabsContent value="costs">{tab === 'costs' ? <OperationCostSettings /> : null}</TabsContent> : null}
        <TabsContent value="gaps">{tab === 'gaps' ? <DataGapPane onNavigate={setTab} canManageCosts={canManageCosts} /> : null}</TabsContent>
      </Tabs>
    </div>
  );
}
