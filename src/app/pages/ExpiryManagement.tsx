import React, { useEffect, useState, useMemo } from 'react';
import { AlertTriangle, TrendingDown, DollarSign, Package, Loader2, Download } from 'lucide-react';
import { Button, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/UI';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { createInventoryAdjustment, getExpiringProductsPaginated, getExpirySummary, getStockMovements } from '@/api/inventory';
import { usePagination } from '@/hooks/usePagination';
import { exportToExcel } from '@/utils/excel';
import type { ExportColumn } from '@/types/excel';
import type { ExpiringProduct, ExpirySummary, StockMovement } from '@/types';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

const EXPIRY_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'urgency', header: '紧急程度', width: 10 },
  { key: 'productName', header: '产品名称', width: 20 },
  { key: 'sku', header: 'SKU', width: 18 },
  { key: 'batchNo', header: '批次号', width: 20 },
  { key: 'remainingDays', header: '剩余天数', width: 10 },
  { key: 'stock', header: '库存量', width: 10 },
  { key: 'costAmount', header: '成本金额', width: 12 },
  { key: 'storeName', header: '门店', width: 20 },
  { key: 'suggestion', header: '建议处置', width: 10 },
];

const PERIOD_OPTIONS = [
  { value: '60d', label: '未来60天' },
  { value: '90d', label: '未来90天' },
  { value: '180d', label: '未来180天' },
];

const STATUS_TABS = [
  { value: 'pending', label: '待处理' },
  { value: 'scrapped', label: '已报废' },
] as const;

const SCRAPPED_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'occurredAt', header: '报废时间', width: 18 },
  { key: 'productName', header: '产品名称', width: 20 },
  { key: 'sku', header: 'SKU', width: 18 },
  { key: 'batchNo', header: '批次号', width: 20 },
  { key: 'quantity', header: '报废数量', width: 10 },
  { key: 'beforeStock', header: '报废前库存', width: 12 },
  { key: 'afterStock', header: '报废后库存', width: 12 },
  { key: 'storeName', header: '门店', width: 20 },
  { key: 'operatorName', header: '操作人', width: 14 },
  { key: 'remark', header: '备注', width: 28 },
];

const EMPTY_EXPIRY_SUMMARY: ExpirySummary = {
  period: '60d',
  windowDays: 60,
  expiringBatchCount: 0,
  urgentBatchCount: 0,
  expiredBatchCount: 0,
  expiringCostAmount: 0,
  scrappedAmount: 0,
  wastageTrend: [],
  categoryWastage: [],
};

function formatCurrency(value?: number) {
  return `¥${Number(value || 0).toLocaleString('zh-CN')}`;
}

function formatDateTime(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ExpiryManagement() {
  const navigate = useNavigate();
  const [selectedPeriod, setSelectedPeriod] = useState('60d');
  const [activeTab, setActiveTab] = useState<(typeof STATUS_TABS)[number]['value']>('pending');
  const [summary, setSummary] = useState<ExpirySummary>(EMPTY_EXPIRY_SUMMARY);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryRefreshKey, setSummaryRefreshKey] = useState(0);
  const [selectedProduct, setSelectedProduct] = useState<ExpiringProduct | null>(null);
  const [selectedAction, setSelectedAction] = useState<ExpiringProduct['suggestion']>('促销');
  const [actionQty, setActionQty] = useState(1);
  const [actionRemark, setActionRemark] = useState('');
  const [processingAction, setProcessingAction] = useState(false);

  const filters = useMemo(() => ({ period: selectedPeriod }), [selectedPeriod]);
  const { data: expiringProducts, total, page, pageSize, loading, setPage, setPageSize, refresh } = usePagination<ExpiringProduct>(getExpiringProductsPaginated, filters);
  const scrapFilters = useMemo(() => ({ movementType: 'scrap_out' }), []);
  const {
    data: scrappedMovements,
    total: scrappedTotal,
    page: scrappedPage,
    pageSize: scrappedPageSize,
    loading: scrappedLoading,
    setPage: setScrappedPage,
    setPageSize: setScrappedPageSize,
    refresh: refreshScrapped,
  } = usePagination<StockMovement>(getStockMovements, scrapFilters);

  useEffect(() => {
    setPage(1);
  }, [selectedPeriod, setPage]);

  useEffect(() => {
    if (activeTab === 'pending') {
      setPage(1);
    } else {
      setScrappedPage(1);
    }
  }, [activeTab, setPage, setScrappedPage]);

  useEffect(() => {
    let cancelled = false;
    setSummaryLoading(true);
    getExpirySummary({ period: selectedPeriod })
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch(() => {
        if (!cancelled) setSummary(EMPTY_EXPIRY_SUMMARY);
      })
      .finally(() => {
        if (!cancelled) setSummaryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPeriod, summaryRefreshKey]);

  const getUrgencyColor = (urgency: ExpiringProduct['urgency']) => {
    switch (urgency) {
      case '临期':
        return 'bg-orange-100 text-orange-700 border-l-4 border-orange-500';
      case '紧急':
        return 'bg-red-100 text-red-700 border-l-4 border-red-500';
      case '已过期':
        return 'bg-red-200 text-red-900 border-l-4 border-red-700';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  const getSuggestionColor = (suggestion: ExpiringProduct['suggestion']) => {
    switch (suggestion) {
      case '促销':
        return 'bg-blue-100 text-blue-700';
      case '调拨':
        return 'bg-purple-100 text-purple-700';
      case '报废':
        return 'bg-gray-100 text-gray-700';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  const maxWastage = Math.max(1, ...summary.wastageTrend.map(d => d.amount));
  const selectedPeriodLabel = PERIOD_OPTIONS.find((option) => option.value === selectedPeriod)?.label ?? '未来60天';

  const openActionDialog = (product: ExpiringProduct) => {
    setSelectedProduct(product);
    setSelectedAction(product.suggestion);
    setActionQty(Math.max(1, Number(product.stock || 1)));
    setActionRemark(`${product.productName} ${product.batchNo} 临期处理`);
  };

  const closeActionDialog = () => {
    if (processingAction) return;
    setSelectedProduct(null);
  };

  const handleCreatePromotionDraft = (product: ExpiringProduct) => {
    const params = new URLSearchParams({
      name: `${product.productName}临期消化触达`,
      desc: `${product.productName} 批次 ${product.batchNo} 剩余 ${product.remainingDays} 天到期，建议生成待确认营销触达草稿。`,
      trigger: 'product_expiry_clearance',
      targetAudience: '近期购买过同类护理或适合该商品的会员',
      offer: product.suggestion === '促销' ? '临期专属权益/项目搭赠' : '顾问确认后定向推荐',
      strategyText: `${product.productName} 库存 ${product.stock}${product.unit ?? ''}，临期成本 ${formatCurrency(product.costAmount)}，活动库存上限不得超过当前批次可用库存。`,
      sourceSignals: JSON.stringify(['临期库存', product.urgency, product.batchNo]),
      recommendedItems: JSON.stringify([product.productName]),
      channels: 'miniapp,store',
      actions: JSON.stringify([
        { type: 'coupon', value: '临期护理搭赠权益' },
        { type: 'advisor_task', value: '顾问一对一确认适配客户' },
      ]),
    });
    navigate(`/customer-marketing/automation?${params.toString()}`);
  };

  const handleCreateTransferDraft = (product: ExpiringProduct) => {
    const params = new URLSearchParams({
      source: 'expiry',
      productId: String(product.productId ?? ''),
      batchId: String(product.id),
      fromStoreId: String(product.storeId ?? ''),
      quantity: String(Math.max(1, Number(product.stock || 1))),
      reason: `${product.productName} 批次 ${product.batchNo} 临期调拨`,
    });
    navigate(`/inventory/transfer?${params.toString()}`);
  };

  const handleProcessAction = async () => {
    if (!selectedProduct) return;
    if (selectedAction === '促销') {
      handleCreatePromotionDraft(selectedProduct);
      setSelectedProduct(null);
      return;
    }
    if (selectedAction === '调拨') {
      handleCreateTransferDraft(selectedProduct);
      setSelectedProduct(null);
      return;
    }
    if (!selectedProduct.productId) {
      toast.error('缺少商品 ID，无法报废出库');
      return;
    }
    const quantity = Math.min(Math.max(1, Number(actionQty || 1)), Number(selectedProduct.stock || 0));
    if (!window.confirm(`确认报废 ${selectedProduct.productName} 批次 ${selectedProduct.batchNo} 的 ${quantity}${selectedProduct.unit ?? ''}？该操作会直接扣减批次库存。`)) return;
    setProcessingAction(true);
    try {
      await createInventoryAdjustment({
        productId: selectedProduct.productId,
        batchId: selectedProduct.id,
        adjustmentType: 'scrap_out',
        quantity,
        remark: actionRemark,
      });
      toast.success('报废出库已完成，损耗统计将同步刷新');
      setSelectedProduct(null);
      refresh();
      refreshScrapped();
      setSummaryRefreshKey((value) => value + 1);
    } catch (err: any) {
      toast.error(err?.message || '报废出库失败');
    } finally {
      setProcessingAction(false);
    }
  };

  const handleExport = () => {
    if (activeTab === 'pending') {
      exportToExcel(expiringProducts, EXPIRY_EXPORT_COLUMNS, '待处理临期产品报表');
      return;
    }
    const exportRows = scrappedMovements.map((movement) => ({
      ...movement,
      occurredAt: formatDateTime(movement.occurredAt || movement.createdAt),
      quantity: Math.abs(Number(movement.quantity || 0)),
    }));
    exportToExcel(exportRows, SCRAPPED_EXPORT_COLUMNS, '已报废库存流水报表');
  };

  const listTitle = activeTab === 'pending' ? '临期产品列表' : '已报废列表';
  const currentTotal = activeTab === 'pending' ? total : scrappedTotal;
  const currentPage = activeTab === 'pending' ? page : scrappedPage;
  const currentPageSize = activeTab === 'pending' ? pageSize : scrappedPageSize;
  const currentTotalPages = Math.ceil(currentTotal / currentPageSize) || 1;
  const currentLoading = activeTab === 'pending' ? loading : scrappedLoading;
  const changePage = activeTab === 'pending' ? setPage : setScrappedPage;
  const changePageSize = activeTab === 'pending' ? setPageSize : setScrappedPageSize;

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <div className="text-sm text-gray-500">
        首页 / 库存管理 / 过期管理
      </div>

      <h2 className="text-xl font-semibold text-gray-800">过期管理</h2>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-gradient-to-br from-orange-50 to-orange-100 border-l-4 border-orange-500 rounded-lg p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-700 font-medium">临期批次</div>
            <AlertTriangle className="w-5 h-5 text-orange-500" />
          </div>
          <div className="text-3xl font-semibold text-orange-600 mb-1">{summaryLoading ? '-' : summary.expiringBatchCount}</div>
          <div className="text-xs text-gray-600">剩余31-{summary.windowDays}天</div>
        </div>

        <div className="bg-gradient-to-br from-red-50 to-red-100 border-l-4 border-red-500 rounded-lg p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-700 font-medium">紧急处理</div>
            <Package className="w-5 h-5 text-red-500" />
          </div>
          <div className="text-3xl font-semibold text-red-600 mb-1">{summaryLoading ? '-' : summary.urgentBatchCount}</div>
          <div className="text-xs text-gray-600">剩余少于30天</div>
        </div>

        <div className="bg-gradient-to-br from-gray-50 to-gray-100 border-l-4 border-gray-500 rounded-lg p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-700 font-medium">已过期批次</div>
            <AlertTriangle className="w-5 h-5 text-gray-500" />
          </div>
          <div className="text-3xl font-semibold text-gray-700 mb-1">{summaryLoading ? '-' : summary.expiredBatchCount}</div>
          <div className="text-xs text-gray-600">需优先下架/报废</div>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-l-4 border-blue-500 rounded-lg p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-700 font-medium">临期成本</div>
            <DollarSign className="w-5 h-5 text-blue-500" />
          </div>
          <div className="text-2xl font-semibold text-blue-600 mb-1">{summaryLoading ? '-' : formatCurrency(summary.expiringCostAmount)}</div>
          <div className="text-xs text-gray-600">{selectedPeriodLabel}内未过期库存</div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 border-l-4 border-purple-500 rounded-lg p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-700 font-medium">已报废金额</div>
            <TrendingDown className="w-5 h-5 text-purple-500" />
          </div>
          <div className="text-2xl font-semibold text-purple-600 mb-1">{summaryLoading ? '-' : formatCurrency(summary.scrappedAmount)}</div>
          <div className="text-xs text-gray-600">按真实报废流水</div>
        </div>
      </div>

      {/* Expiring Products Table */}
      <div>
        <div className="mb-4 space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold text-gray-800">{listTitle}</h3>
              <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-1">
                {STATUS_TABS.map((tab) => {
                  const isActive = activeTab === tab.value;
                  const count = tab.value === 'pending' ? total : scrappedTotal;
                  return (
                    <button
                      key={tab.value}
                      type="button"
                      className={`h-8 min-w-[92px] rounded px-3 text-sm font-medium transition ${
                        isActive
                          ? 'bg-white text-primary shadow-sm'
                          : 'text-gray-600 hover:bg-white hover:text-gray-900'
                      }`}
                      onClick={() => setActiveTab(tab.value)}
                    >
                      {tab.label}
                      <span className="ml-1 text-xs text-gray-500">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" className="gap-2" onClick={handleExport}>
              <Download className="w-4 h-4" /> 导出报表
              </Button>
              {activeTab === 'pending' && (
                <select
                  className="h-9 px-3 text-sm border border-gray-300 rounded-md"
                  value={selectedPeriod}
                  onChange={(e) => setSelectedPeriod(e.target.value)}
                >
                  {PERIOD_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>

        {currentLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            <span className="ml-2 text-gray-500">加载中...</span>
          </div>
        )}
        {!currentLoading && activeTab === 'pending' && (
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/80">
              <TableHead>紧急程度</TableHead>
              <TableHead>产品名称</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>批次号</TableHead>
              <TableHead>剩余天数</TableHead>
              <TableHead>库存量</TableHead>
              <TableHead>成本金额</TableHead>
              <TableHead>门店</TableHead>
              <TableHead>建议处置</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expiringProducts.map((product) => (
              <TableRow key={product.id} className={`hover:bg-gray-50 ${getUrgencyColor(product.urgency)}`}>
                <TableCell>
                  <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                    product.urgency === '临期'
                      ? 'bg-orange-100 text-orange-700'
                      : product.urgency === '紧急'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-red-200 text-red-900'
                  }`}>
                    {product.urgency}
                    {product.urgency === '临期' && ' (30-60天)'}
                    {product.urgency === '紧急' && ' (<30天)'}
                  </span>
                </TableCell>
                <TableCell className="font-medium text-gray-800">{product.productName}</TableCell>
                <TableCell className="font-mono text-sm text-gray-600">{product.sku}</TableCell>
                <TableCell className="font-mono text-sm text-gray-600">{product.batchNo}</TableCell>
                <TableCell>
                  <span className={`font-semibold ${
                    product.remainingDays < 0
                      ? 'text-red-700'
                      : product.remainingDays < 30
                      ? 'text-red-600'
                      : 'text-orange-600'
                  }`}>
                    {product.remainingDays < 0 ? `已过期${Math.abs(product.remainingDays)}天` : `${product.remainingDays}天`}
                  </span>
                </TableCell>
                <TableCell>{product.stock}</TableCell>
                <TableCell className="font-medium text-gray-700">
                  {formatCurrency(product.costAmount)}
                </TableCell>
                <TableCell className="text-sm text-gray-600">{product.storeName}</TableCell>
                <TableCell>
                  <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${getSuggestionColor(product.suggestion)}`}>
                    {product.suggestion}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => openActionDialog(product)}>
                    处理
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        )}
        {!currentLoading && activeTab === 'scrapped' && (
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/80">
              <TableHead>报废时间</TableHead>
              <TableHead>产品名称</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>批次号</TableHead>
              <TableHead>报废数量</TableHead>
              <TableHead>库存变化</TableHead>
              <TableHead>门店</TableHead>
              <TableHead>操作人</TableHead>
              <TableHead>备注</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {scrappedMovements.map((movement) => (
              <TableRow key={movement.id} className="hover:bg-gray-50">
                <TableCell className="text-sm text-gray-600">{formatDateTime(movement.occurredAt || movement.createdAt)}</TableCell>
                <TableCell className="font-medium text-gray-800">{movement.productName || '-'}</TableCell>
                <TableCell className="font-mono text-sm text-gray-600">{movement.sku || '-'}</TableCell>
                <TableCell className="font-mono text-sm text-gray-600">{movement.batchNo || '-'}</TableCell>
                <TableCell className="font-semibold text-red-600">
                  {Math.abs(Number(movement.quantity || 0))}
                  {movement.unit ?? ''}
                </TableCell>
                <TableCell className="text-sm text-gray-600">
                  {movement.beforeStock ?? '-'} → {movement.afterStock ?? '-'}
                </TableCell>
                <TableCell className="text-sm text-gray-600">{movement.storeName || '-'}</TableCell>
                <TableCell className="text-sm text-gray-600">{movement.operatorName || '-'}</TableCell>
                <TableCell className="max-w-[240px] truncate text-sm text-gray-600" title={movement.remark || ''}>
                  {movement.remark || '-'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        )}
        {!currentLoading && currentTotal === 0 && (
          <div className="rounded-md border border-dashed border-gray-200 py-10 text-center text-sm text-gray-500">
            {activeTab === 'pending' ? '当前周期暂无待处理临期批次' : '当前暂无已报废记录'}
          </div>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
          <div className="text-sm text-gray-600">共 {currentTotal} 条</div>
          <div className="flex items-center gap-2">
            <select value={currentPageSize} onChange={(e) => changePageSize(Number(e.target.value))} className="h-8 px-2 text-sm border border-gray-300 rounded">
              <option value={10}>10条/页</option>
              <option value={20}>20条/页</option>
              <option value={50}>50条/页</option>
            </select>
            <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => changePage(currentPage - 1)}>上一页</Button>
            <span className="text-sm text-gray-600">{currentPage} / {currentTotalPages}</span>
            <Button variant="outline" size="sm" disabled={currentPage >= currentTotalPages} onClick={() => changePage(currentPage + 1)}>下一页</Button>
          </div>
        </div>
      </div>

      {/* Wastage Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Wastage Trend Chart */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="font-semibold text-gray-800 mb-4">报废金额趋势</h3>
          <div className="space-y-3">
            {summary.wastageTrend.length === 0 && (
              <div className="text-sm text-gray-500 py-6 text-center">当前周期暂无报废流水</div>
            )}
            {summary.wastageTrend.map((data) => (
              <div key={data.month} className="flex items-center gap-3">
                <div className="w-20 text-sm text-gray-600">{data.month}</div>
                <div className="flex-1 h-8 bg-gray-100 rounded-lg overflow-hidden relative">
                  <div
                    className="h-full bg-gradient-to-r from-red-400 to-red-500 rounded-lg transition-all"
                    style={{ width: `${(data.amount / maxWastage) * 100}%` }}
                  />
                  <div className="absolute inset-0 flex items-center px-3 text-xs font-medium text-white">
                    {formatCurrency(data.amount)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Category Wastage Pie Chart */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="font-semibold text-gray-800 mb-4">按品类损耗占比</h3>
          <div className="space-y-4">
            {summary.categoryWastage.length === 0 && (
              <div className="text-sm text-gray-500 py-6 text-center">当前周期暂无品类损耗</div>
            )}
            {summary.categoryWastage.map((item, index) => (
              <div key={index}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-700 font-medium">{item.category}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">{formatCurrency(item.amount)}</span>
                    <span className="text-sm font-semibold text-blue-600">{item.percentage}%</span>
                  </div>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      index === 0
                        ? 'bg-blue-500'
                        : index === 1
                        ? 'bg-purple-500'
                        : index === 2
                        ? 'bg-pink-500'
                        : 'bg-orange-500'
                    }`}
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <h4 className="text-sm font-semibold text-gray-800 mb-3">损耗率超标类别</h4>
            <div className="space-y-2">
              {summary.categoryWastage.filter((item) => item.percentage >= 20).length === 0 && (
                <div className="text-sm text-gray-500 p-2 bg-gray-50 border border-gray-200 rounded">暂无占比超 20% 的损耗品类</div>
              )}
              {summary.categoryWastage.filter((item) => item.percentage >= 20).map((item) => (
                <div key={item.category} className="flex items-center justify-between p-2 bg-red-50 border border-red-200 rounded">
                  <span className="text-sm text-gray-700">{item.category}</span>
                  <span className="text-sm font-semibold text-red-600">损耗占比 {item.percentage}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={Boolean(selectedProduct)} onOpenChange={(open) => { if (!open) closeActionDialog(); }}>
        <DialogContent className="max-w-lg" aria-describedby="expiry-action-description">
          <DialogHeader>
            <DialogTitle>处理临期批次</DialogTitle>
          </DialogHeader>
          <div id="expiry-action-description" className="sr-only">选择促销、调拨或报废动作处理临期库存</div>
          {selectedProduct && (
            <div className="space-y-4">
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
                <div className="font-medium text-gray-900">{selectedProduct.productName}</div>
                <div className="mt-1 text-gray-600">批次 {selectedProduct.batchNo} / 库存 {selectedProduct.stock}{selectedProduct.unit ?? ''} / {selectedProduct.remainingDays < 0 ? `已过期${Math.abs(selectedProduct.remainingDays)}天` : `剩余${selectedProduct.remainingDays}天`}</div>
                <div className="mt-1 text-gray-600">成本金额 {formatCurrency(selectedProduct.costAmount)} / 门店 {selectedProduct.storeName || '-'}</div>
              </div>

              <label className="block text-sm text-gray-700">
                处理方式
                <select
                  className="mt-1 h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm"
                  value={selectedAction}
                  onChange={(event) => setSelectedAction(event.target.value as ExpiringProduct['suggestion'])}
                >
                  <option value="促销">生成营销触达草稿</option>
                  <option value="调拨">生成调拨申请草稿</option>
                  <option value="报废">报废出库</option>
                </select>
              </label>

              {selectedAction === '报废' && (
                <label className="block text-sm text-gray-700">
                  报废数量
                  <input
                    type="number"
                    min={1}
                    max={selectedProduct.stock}
                    className="mt-1 h-9 w-full rounded-md border border-gray-300 px-3 text-sm"
                    value={actionQty}
                    onChange={(event) => setActionQty(Number(event.target.value))}
                  />
                </label>
              )}

              <label className="block text-sm text-gray-700">
                处理备注
                <textarea
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  rows={3}
                  value={actionRemark}
                  onChange={(event) => setActionRemark(event.target.value)}
                />
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={closeActionDialog} disabled={processingAction}>取消</Button>
                <Button onClick={handleProcessAction} disabled={processingAction}>
                  {processingAction ? '处理中...' : selectedAction === '促销' ? '打开草稿' : selectedAction === '调拨' ? '去调拨' : '确认报废'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
