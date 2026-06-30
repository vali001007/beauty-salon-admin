import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { CheckCircle, PackageCheck, ShoppingCart, Sparkles, Loader2 } from 'lucide-react';
import { Button, Table, TableHeader, TableRow, TableHead, TableBody, TableCell, Input } from '../components/UI';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { purchaseOrderSchema, type PurchaseOrderFormData } from '@/schemas/inventory';
import {
  getReplenishmentSuggestions,
  getPurchaseOrdersPaginated,
  createPurchaseOrder,
  updatePurchaseOrderStatus,
  receivePurchaseOrder,
  getStockMovements,
} from '@/api/inventory';
import { createProcurementOrder, getProcurementOrder, getProcurementOrders, receiveProcurementOrder } from '@/api/supplyPlatform';
import { usePagination } from '@/hooks/usePagination';
import { useStoreStore } from '@/stores/storeStore';
import { toast } from 'sonner';
import type { ReplenishmentSuggestion, PurchaseOrder, StockMovement } from '@/types';
import type { ProcurementOrder, ProcurementOrderStatus } from '@/types/supplyPlatform';
import type { PaginatedResponse, PaginationParams } from '@/types/pagination';

type PurchaseOrderDraft = PurchaseOrderFormData & {
  supplierId?: number;
  totalAmount: number;
  marketAmount: number;
  savingAmount: number;
  platformItems: Array<{
    productId: number;
    supplySkuId: number;
    quoteId?: number;
    quantity: number;
    unitPrice: number;
    sku: string;
  }>;
};

type UnifiedPurchaseOrder = {
  id: string;
  source: 'platform' | 'manual';
  orderNo: string;
  itemLabels: string[];
  supplierName: string;
  sourceLabel: string;
  amount: number;
  receivedSummary: string;
  statusLabel: string;
  statusClass: string;
  createdAt?: string;
  expectedDate?: string;
  platformOrder?: ProcurementOrder;
  manualOrder?: PurchaseOrder;
};

const OFFICIAL_SUPPLY_DISCOUNT_RATE = 0.8;

function getSuggestionUnitPrice(suggestion: ReplenishmentSuggestion) {
  if (suggestion.suggestedQty <= 0 || suggestion.estimatedAmount <= 0) return 0;
  return Math.round((suggestion.estimatedAmount / suggestion.suggestedQty) * 100) / 100;
}

function getSuggestionAmount(suggestion: ReplenishmentSuggestion) {
  return Math.round(getSuggestionUnitPrice(suggestion) * suggestion.suggestedQty * 100) / 100;
}

function getMarketPrice(officialPrice: number) {
  return Math.round((officialPrice / OFFICIAL_SUPPLY_DISCOUNT_RATE) * 100) / 100;
}

function getSavingAmount(officialAmount: number) {
  return Math.round((officialAmount / OFFICIAL_SUPPLY_DISCOUNT_RATE - officialAmount) * 100) / 100;
}

function getPurchaseOrderItemLabels(order: PurchaseOrder) {
  return order.items?.map((item) => `${item.productName} × ${item.quantity}`) ?? [];
}

const procurementStatusLabels: Record<ProcurementOrderStatus, string> = {
  pending_supplier_confirm: '待供应商确认',
  accepted: '已接单',
  rejected: '已拒单',
  shipped: '已发货',
  partial_received: '部分收货',
  received: '已收货',
  settlement_pending: '待结算',
  settled: '已结算',
  cancelled: '已取消',
};

function getProcurementStatusLabel(status: string) {
  return procurementStatusLabels[status as ProcurementOrderStatus] ?? status;
}

function getProcurementStatusColor(status: string) {
  if (['received', 'settlement_pending', 'settled'].includes(status)) return 'bg-emerald-100 text-emerald-700';
  if (status === 'shipped' || status === 'partial_received') return 'bg-blue-100 text-blue-700';
  if (status === 'rejected' || status === 'cancelled') return 'bg-red-100 text-red-700';
  if (status === 'accepted') return 'bg-purple-100 text-purple-700';
  return 'bg-amber-100 text-amber-700';
}

function formatDate(value?: string | null) {
  return value ? String(value).slice(0, 10) : '-';
}

function getProcurementItemLabels(order: ProcurementOrder) {
  return order.items.map((item) => `${item.supplySku?.name || `SKU#${item.supplySkuId}`} × ${item.quantity}`);
}

function getManualPurchaseStatusColor(status: PurchaseOrder['status']) {
  if (status === '已收货') return 'bg-emerald-100 text-emerald-700';
  if (status === '部分收货') return 'bg-blue-100 text-blue-700';
  if (status === '已下单' || status === '已审核') return 'bg-blue-100 text-blue-700';
  if (status === '已取消') return 'bg-gray-100 text-gray-600';
  if (status === '待审核') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-700';
}

function toUnifiedPlatformOrder(order: ProcurementOrder): UnifiedPurchaseOrder {
  const totalQty = order.items.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
  const receivedQty = order.items.reduce((sum, item) => sum + Number(item.receivedQty ?? 0), 0);
  return {
    id: `platform-${order.id}`,
    source: 'platform',
    orderNo: order.orderNo,
    itemLabels: getProcurementItemLabels(order),
    supplierName: order.supplier?.name || `供应商 #${order.supplierId}`,
    sourceLabel: order.sourceType === 'replenishment' ? '智能补货-平台供货' : order.sourceType || '平台采购',
    amount: Number(order.netAmount ?? order.totalAmount ?? 0),
    receivedSummary: `${receivedQty}/${totalQty}`,
    statusLabel: getProcurementStatusLabel(order.status),
    statusClass: getProcurementStatusColor(order.status),
    createdAt: order.createdAt,
    expectedDate: order.expectedArrivalDate ?? undefined,
    platformOrder: order,
  };
}

function toUnifiedManualOrder(order: PurchaseOrder): UnifiedPurchaseOrder {
  const totalQty = order.items?.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0) ?? 0;
  const receivedQty = order.items?.reduce((sum, item) => sum + Number(item.receivedQty ?? 0), 0) ?? (order.status === '已收货' ? totalQty : 0);
  return {
    id: `manual-${order.id}`,
    source: 'manual',
    orderNo: order.orderNo,
    itemLabels: getPurchaseOrderItemLabels(order),
    supplierName: order.supplier || '手动采购',
    sourceLabel: '智能补货-手动采购',
    amount: Number(order.totalAmount ?? 0),
    receivedSummary: `${receivedQty}/${totalQty}`,
    statusLabel: order.status,
    statusClass: getManualPurchaseStatusColor(order.status),
    createdAt: order.createDate,
    expectedDate: order.expectedDate,
    manualOrder: order,
  };
}

function getOrderTime(value?: string) {
  const time = new Date(value ?? '').getTime();
  return Number.isFinite(time) ? time : 0;
}

async function getUnifiedPurchaseOrders(params: PaginationParams & { storeId?: number }): Promise<PaginatedResponse<UnifiedPurchaseOrder>> {
  const page = Number(params.page ?? 1);
  const pageSize = Number(params.pageSize ?? 10);
  const fetchSize = page * pageSize;
  const [platformOrders, manualOrders] = await Promise.all([
    getProcurementOrders({ ...params, page: 1, pageSize: fetchSize }),
    getPurchaseOrdersPaginated({ page: 1, pageSize: fetchSize }),
  ]);
  const combined = [
    ...(platformOrders.items ?? []).map(toUnifiedPlatformOrder),
    ...(manualOrders.items ?? []).map(toUnifiedManualOrder),
  ].sort((a, b) => getOrderTime(b.createdAt) - getOrderTime(a.createdAt));
  const start = (page - 1) * pageSize;
  const items = combined.slice(start, start + pageSize);
  return {
    items,
    data: items,
    total: Number(platformOrders.total ?? 0) + Number(manualOrders.total ?? 0),
    page,
    pageSize,
  };
}

export function PurchaseManagement() {
  const [activeTab, setActiveTab] = useState<'suggestions' | 'orders'>('suggestions');
  const [suggestions, setSuggestions] = useState<(ReplenishmentSuggestion & { checked: boolean })[]>([]);
  const [showOrderDetail, setShowOrderDetail] = useState(false);
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);
  const [isGeneratingOrders, setIsGeneratingOrders] = useState(false);
  const [isReceivingOrder, setIsReceivingOrder] = useState(false);
  const [loadingOrderDetail, setLoadingOrderDetail] = useState(false);
  const [generatedExpectedDate, setGeneratedExpectedDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return date.toISOString().split('T')[0];
  });
  const [selectedOrder, setSelectedOrder] = useState<ProcurementOrder | null>(null);
  const [selectedManualOrder, setSelectedManualOrder] = useState<PurchaseOrder | null>(null);
  const [showManualOrderDetail, setShowManualOrderDetail] = useState(false);
  const [manualReceiveQty, setManualReceiveQty] = useState<Record<string, number>>({});
  const [isUpdatingManualOrder, setIsUpdatingManualOrder] = useState(false);
  const [isReceivingManualOrder, setIsReceivingManualOrder] = useState(false);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [loadingStockMovements, setLoadingStockMovements] = useState(false);
  const { currentStoreId, stores } = useStoreStore();
  const currentStoreName = useMemo(() => {
    if (!currentStoreId) return '全部门店';
    return stores.find((store) => store.id === currentStoreId)?.name || '全部门店';
  }, [currentStoreId, stores]);

  const ordersFilters = useMemo(() => ({ storeId: currentStoreId ?? undefined }), [currentStoreId]);
  const { data: orders, total: ordersTotal, page: ordersPage, pageSize: ordersPageSize, loading: ordersLoading, setPage: setOrdersPage, setPageSize: setOrdersPageSize, refresh: refreshOrders } = usePagination<UnifiedPurchaseOrder>(getUnifiedPurchaseOrders, ordersFilters);

  const loadData = useCallback(async () => {
    try {
      const suggestionsData = await getReplenishmentSuggestions();
      setSuggestions(suggestionsData.map(s => ({ ...s, checked: false })));
    } catch {
      toast.error('加载数据失败');
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleSuggestion = (id: number) => {
    setSuggestions(prev =>
      prev.map(item =>
        item.id === id ? { ...item, checked: !item.checked } : item
      )
    );
  };

  const toggleAll = (checked: boolean) => {
    setSuggestions(prev => prev.map(item => ({ ...item, checked })));
  };

  const selectedSuggestions = useMemo(() => suggestions.filter(s => s.checked), [suggestions]);
  const selectedCount = selectedSuggestions.length;
  const selectedTotal = selectedSuggestions.reduce((sum, s) => sum + getSuggestionAmount(s), 0);
  const selectedMarketTotal = Math.round((selectedTotal / OFFICIAL_SUPPLY_DISCOUNT_RATE) * 100) / 100;
  const selectedSavingTotal = Math.max(0, Math.round((selectedMarketTotal - selectedTotal) * 100) / 100);
  const orderDrafts = useMemo<PurchaseOrderDraft[]>(() => {
    const groups = new Map<string, PurchaseOrderDraft>();
    selectedSuggestions.forEach((suggestion) => {
      const unitPrice = getSuggestionUnitPrice(suggestion);
      if (suggestion.suggestedQty <= 0 || unitPrice <= 0) return;
      const groupKey = suggestion.supplierId ? `platform-${suggestion.supplierId}` : `manual-${suggestion.supplier}`;
      const existing = groups.get(groupKey) ?? {
        supplier: suggestion.supplier,
        supplierId: suggestion.supplierId,
        storeName: currentStoreName,
        expectedDate: generatedExpectedDate,
        items: [],
        platformItems: [],
        totalAmount: 0,
        marketAmount: 0,
        savingAmount: 0,
      };
      const itemAmount = getSuggestionAmount(suggestion);
      existing.items.push({
        productName: suggestion.productName,
        sku: suggestion.sku,
        quantity: suggestion.suggestedQty,
        unitPrice,
      });
      if (suggestion.supplySkuId && suggestion.supplierId) {
        existing.platformItems.push({
          productId: suggestion.productId ?? suggestion.id,
          supplySkuId: suggestion.supplySkuId,
          quoteId: suggestion.quoteId,
          quantity: suggestion.suggestedQty,
          unitPrice,
          sku: suggestion.sku,
        });
      }
      existing.totalAmount += itemAmount;
      existing.marketAmount += itemAmount / OFFICIAL_SUPPLY_DISCOUNT_RATE;
      existing.savingAmount += getSavingAmount(itemAmount);
      groups.set(groupKey, existing);
    });
    return Array.from(groups.values()).map((draft) => ({
      ...draft,
      totalAmount: Math.round(draft.totalAmount * 100) / 100,
      marketAmount: Math.round(draft.marketAmount * 100) / 100,
      savingAmount: Math.round(draft.savingAmount * 100) / 100,
    }));
  }, [currentStoreName, generatedExpectedDate, selectedSuggestions]);

  const handleGenerateOrder = () => {
    const selected = selectedSuggestions;
    if (selected.length === 0) {
      toast.error('请至少选择一个产品');
      return;
    }
    if (selected.some((item) => item.suggestedQty <= 0 || getSuggestionUnitPrice(item) <= 0)) {
      toast.error('已选产品中存在补货量或预估金额为 0 的项目，请调整后再生成');
      return;
    }
    if (selected.some((item) => !item.supplySkuId || !item.supplierId)) {
      toast.warning('部分商品暂无平台供货，将生成历史手动采购单兜底');
    }
    setShowGenerateConfirm(true);
  };

  const handleConfirmGenerateOrders = async () => {
    if (orderDrafts.length === 0) {
      toast.error('没有可生成的采购明细');
      return;
    }
    setIsGeneratingOrders(true);
    try {
      const platformDrafts = orderDrafts.filter((draft) => draft.supplierId && draft.platformItems.length > 0);
      const manualDrafts = orderDrafts
        .map((draft) => ({
          ...draft,
          items: draft.items.filter((item) => !draft.platformItems.some((platformItem) => platformItem.sku === item.sku)),
        }))
        .filter((draft) => draft.items.length > 0);
      await Promise.all([
        ...platformDrafts.map((draft) => createProcurementOrder({
          storeId: currentStoreId ?? 1,
          supplierId: draft.supplierId!,
          expectedArrivalDate: draft.expectedDate,
          sourceType: 'replenishment',
          items: draft.platformItems.map((item) => ({
            productId: item.productId,
            supplySkuId: item.supplySkuId,
            quoteId: item.quoteId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
        })),
        ...manualDrafts.map((draft) => createPurchaseOrder({
          supplier: draft.supplier,
          storeId: currentStoreId ?? 1,
          storeName: draft.storeName,
          expectedDate: draft.expectedDate,
          items: draft.items,
        })),
      ]);
      toast.success(`已生成 ${platformDrafts.length} 张平台供货订单、${manualDrafts.length} 张手动采购单，合计 ¥${selectedTotal.toLocaleString()}`);
      setShowGenerateConfirm(false);
      setSuggestions(prev => prev.map(item => item.checked ? { ...item, checked: false } : item));
      setActiveTab('orders');
      setOrdersPage(1);
      refreshOrders();
    } catch (err: any) {
      toast.error(err?.message || '生成平台供货订单失败');
    } finally {
      setIsGeneratingOrders(false);
    }
  };

  const handleViewOrder = async (order: ProcurementOrder) => {
    setSelectedOrder(order);
    setStockMovements([]);
    setShowOrderDetail(true);
    setLoadingOrderDetail(true);
    try {
      const detail = await getProcurementOrder(order.id);
      setSelectedOrder(detail);
      await loadOrderStockMovements(detail.id);
    } catch (err: any) {
      toast.error(err?.message || '平台订单详情加载失败');
    } finally {
      setLoadingOrderDetail(false);
    }
  };

  const handleViewUnifiedOrder = async (order: UnifiedPurchaseOrder) => {
    if (order.source === 'platform' && order.platformOrder) {
      await handleViewOrder(order.platformOrder);
      return;
    }
    if (order.manualOrder) {
      setSelectedManualOrder(order.manualOrder);
      setManualReceiveQty(Object.fromEntries((order.manualOrder.items ?? []).map((item) => [
        item.sku,
        Math.max(0, Number(item.quantity ?? 0) - Number(item.receivedQty ?? 0)),
      ])));
      setShowManualOrderDetail(true);
    }
  };

  const handleManualStatusChange = async (status: PurchaseOrder['status']) => {
    if (!selectedManualOrder) return;
    if (status === '已取消' && !window.confirm(`确认取消手动采购单 ${selectedManualOrder.orderNo}？`)) return;
    setIsUpdatingManualOrder(true);
    try {
      const updated = await updatePurchaseOrderStatus(selectedManualOrder.id, status);
      setSelectedManualOrder(updated);
      setManualReceiveQty(Object.fromEntries((updated.items ?? []).map((item) => [
        item.sku,
        Math.max(0, Number(item.quantity ?? 0) - Number(item.receivedQty ?? 0)),
      ])));
      refreshOrders();
      toast.success(`手动采购单已更新为${updated.status}`);
    } catch (err: any) {
      toast.error(err?.message || '手动采购单状态更新失败');
    } finally {
      setIsUpdatingManualOrder(false);
    }
  };

  const handleReceiveManualOrder = async () => {
    if (!selectedManualOrder) return;
    const items = (selectedManualOrder.items ?? [])
      .map((item) => ({
        sku: item.sku,
        receivedQty: Math.min(
          Math.max(0, Number(manualReceiveQty[item.sku] ?? 0)),
          Math.max(0, Number(item.quantity ?? 0) - Number(item.receivedQty ?? 0)),
        ),
      }))
      .filter((item) => item.receivedQty > 0);
    if (!items.length) {
      toast.error('请填写本次收货数量');
      return;
    }
    if (!window.confirm(`确认本次收货 ${items.reduce((sum, item) => sum + item.receivedQty, 0)} 件？确认后将立即增加库存并写入采购入库流水。`)) return;

    setIsReceivingManualOrder(true);
    try {
      const updated = await receivePurchaseOrder(selectedManualOrder.id, {
        items,
        remark: '采购管理手动采购单收货入库',
      });
      setSelectedManualOrder(updated);
      setManualReceiveQty(Object.fromEntries((updated.items ?? []).map((item) => [
        item.sku,
        Math.max(0, Number(item.quantity ?? 0) - Number(item.receivedQty ?? 0)),
      ])));
      refreshOrders();
      toast.success('手动采购单收货入库完成');
    } catch (err: any) {
      toast.error(err?.message || '手动采购单收货失败');
    } finally {
      setIsReceivingManualOrder(false);
    }
  };

  const loadOrderStockMovements = async (orderId: number) => {
    setLoadingStockMovements(true);
    try {
      const result = await getStockMovements({
        page: 1,
        pageSize: 50,
        sourceType: 'supply_platform_order',
        sourceId: orderId,
      });
      setStockMovements(result.items);
    } catch (err: any) {
      toast.error(err?.message || '库存流水追溯加载失败');
    } finally {
      setLoadingStockMovements(false);
    }
  };

  const receivableShipmentItems = useMemo(() => {
    if (!selectedOrder?.shipments?.length) return [];
    return selectedOrder.shipments.flatMap((shipment) =>
      (shipment.items ?? [])
        .filter((item) => item.shippedQty - item.receivedQty > 0)
        .map((item) => ({
          shipment,
          item,
          orderItem: selectedOrder.items.find((target) => target.id === item.orderItemId),
        })),
    );
  }, [selectedOrder]);

  const handleReceiveSelectedOrder = async () => {
    if (!selectedOrder) return;
    if (receivableShipmentItems.length === 0) {
      toast.error('当前平台订单没有可收货的发货明细');
      return;
    }
    setIsReceivingOrder(true);
    try {
      const updated = await receiveProcurementOrder(selectedOrder.id, {
        items: receivableShipmentItems.map(({ item, orderItem }) => ({
          shipmentItemId: item.id,
          productId: orderItem?.productId ?? undefined,
          receivedQty: item.shippedQty - item.receivedQty,
        })),
        remark: '门店采购管理确认收货',
      });
      toast.success('收货入库完成，库存批次和流水已同步');
      setSelectedOrder(updated);
      await loadOrderStockMovements(selectedOrder.id);
      refreshOrders();
    } catch (err: any) {
      toast.error(err?.message || '平台订单收货失败');
    } finally {
      setIsReceivingOrder(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <div className="text-sm text-gray-500">
        首页 / 库存管理 / 采购管理
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-4 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('suggestions')}
          className={`px-4 py-3 text-sm font-medium transition-colors relative ${
            activeTab === 'suggestions'
              ? 'text-blue-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          补货建议
          {activeTab === 'suggestions' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('orders')}
          className={`px-4 py-3 text-sm font-medium transition-colors relative ${
            activeTab === 'orders'
              ? 'text-blue-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          采购订单
          {activeTab === 'orders' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
          )}
        </button>
      </div>

      {/* Replenishment Suggestions Tab */}
      {activeTab === 'suggestions' && (
        <>
          {/* AI Tip */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-700">
                <strong>智能补货建议：基于当前库存、安全库存、平台供货报价和在途订单生成</strong>
              </p>
              <p className="text-xs text-gray-600 mt-1">
                有平台 SKU 的商品会生成供应链平台采购订单；暂无平台供货的商品仅作为手动采购单兜底。
              </p>
            </div>
          </div>

          {/* Selection Summary */}
          {selectedCount > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
              <span className="text-sm text-blue-700">
                已选择 <strong>{selectedCount}</strong> 个产品，预计生成 <strong>{orderDrafts.length}</strong> 张供货/采购单，预估总金额 <strong>¥{selectedTotal.toLocaleString()}</strong>
              </span>
              <Button onClick={handleGenerateOrder} className="gap-2">
                <ShoppingCart className="w-4 h-4" /> 生成平台供货订单
              </Button>
            </div>
          )}

          {/* Suggestions Table */}
          <Table className="min-w-[1120px] table-fixed">
            <TableHeader>
              <TableRow className="bg-gray-50/80">
                <TableHead className="w-12">
                  <input
                    type="checkbox"
                    className="w-4 h-4"
                    checked={selectedCount === suggestions.length && suggestions.length > 0}
                    onChange={(e) => toggleAll(e.target.checked)}
                  />
                </TableHead>
                <TableHead className="w-[220px]">产品名称</TableHead>
                <TableHead className="w-[170px]">SKU</TableHead>
                <TableHead className="w-[90px]">当前库存</TableHead>
                <TableHead className="w-[100px]">预测需求</TableHead>
                <TableHead className="w-[90px]">安全库存</TableHead>
                <TableHead className="w-[100px]">在途数量</TableHead>
                <TableHead className="w-[120px]">建议补货量</TableHead>
                <TableHead className="w-[150px]">供货来源</TableHead>
                <TableHead className="w-[100px]">预估金额</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suggestions.map((item) => (
                <TableRow key={item.id} className="hover:bg-blue-50/30">
                  <TableCell>
                    <input
                      type="checkbox"
                      className="w-4 h-4"
                      checked={item.checked}
                      onChange={() => toggleSuggestion(item.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium text-gray-800" title={item.reason || item.productName}>
                    <div className="whitespace-normal break-words leading-5">{item.productName}</div>
                  </TableCell>
                  <TableCell className="font-mono text-sm text-gray-600">{item.sku}</TableCell>
                  <TableCell className={item.currentStock < item.safetyStock ? 'text-red-600 font-medium' : ''}>
                    {item.currentStock}
                  </TableCell>
                  <TableCell className="text-blue-600 font-medium">
                    <div>{item.forecast7Days} / 7天</div>
                    <div className="text-xs font-normal text-gray-500">{item.forecast30Days ?? 0} / 30天</div>
                  </TableCell>
                  <TableCell>{item.safetyStock}</TableCell>
                  <TableCell className="text-gray-600">
                    <div>{item.inTransit}</div>
                    {(item.platformInTransit || item.manualInTransit) ? (
                      <div className="text-xs text-gray-400">
                        平台 {item.platformInTransit ?? 0} / 手动 {item.manualInTransit ?? 0}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <input
                      type="number"
                      min={0}
                      className="w-20 px-2 py-1 text-sm border border-gray-300 rounded"
                      value={item.suggestedQty}
                      onChange={(e) => {
                        const newQty = parseInt(e.target.value) || 0;
                        setSuggestions(prev =>
                          prev.map(s =>
                            s.id === item.id ? { ...s, suggestedQty: newQty } : s
                          )
                        );
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">
                    <div>{item.supplier}</div>
                    <div className="text-xs text-gray-400">
                      {item.supplySkuId ? `平台SKU ${item.supplySkuId} · ${item.leadDays ?? '-'}天` : '手动采购兜底'}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium text-gray-800">
                    ¥{getSuggestionAmount(item).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Bottom Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                className="w-4 h-4"
                checked={selectedCount === suggestions.length && suggestions.length > 0}
                onChange={(e) => toggleAll(e.target.checked)}
              />
              <span className="text-sm text-gray-600">全选</span>
            </div>
            <Button onClick={handleGenerateOrder} disabled={selectedCount === 0} className="gap-2">
              <ShoppingCart className="w-4 h-4" /> 生成平台供货订单
            </Button>
          </div>
        </>
      )}

      {/* Purchase Orders Tab */}
      {activeTab === 'orders' && (
        <>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            采购订单列表已合并平台供货订单和历史手动采购单；平台订单可继续查状态和收货入库，手动采购单状态流转将在下一阶段补齐。
          </div>

          {ordersLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              <span className="ml-2 text-gray-500">加载中...</span>
            </div>
          )}
          {!ordersLoading && (
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/80">
                <TableHead>订单编号</TableHead>
                <TableHead>供货明细</TableHead>
                <TableHead>供应商</TableHead>
                <TableHead>订单来源</TableHead>
                <TableHead>总金额</TableHead>
                <TableHead>收货进度</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>创建日期</TableHead>
                <TableHead>预计交货日期</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-10 text-center text-sm text-gray-500">
                    暂无采购订单，可先从补货建议生成。
                  </TableCell>
                </TableRow>
              ) : orders.map((order) => (
                <TableRow key={order.id} className="hover:bg-blue-50/30">
                  <TableCell className="font-mono text-sm text-blue-600 font-medium">
                    {order.orderNo}
                  </TableCell>
                  <TableCell className="min-w-[180px] max-w-[260px]">
                    {order.itemLabels.length ? (
                      <div className="space-y-1">
                        {order.itemLabels.map((label) => (
                          <div key={`${order.orderNo}-${label}`} className="text-sm text-gray-700">
                            {label}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">暂无明细</span>
                    )}
                  </TableCell>
                  <TableCell>{order.supplierName}</TableCell>
                  <TableCell>
                    <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                      order.source === 'platform' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {order.sourceLabel}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium text-gray-800">
                    ¥{order.amount.toLocaleString()}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-gray-700">{order.receivedSummary}</TableCell>
                  <TableCell>
                    <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${order.statusClass}`}>
                      {order.statusLabel}
                    </span>
                  </TableCell>
                  <TableCell>{formatDate(order.createdAt)}</TableCell>
                  <TableCell>{formatDate(order.expectedDate)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => void handleViewUnifiedOrder(order)}
                        className="text-blue-500 hover:text-blue-600 text-sm"
                      >
                        详情
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          )}

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <div className="text-sm text-gray-600">共 {ordersTotal} 条</div>
            <div className="flex items-center gap-2">
              <select value={ordersPageSize} onChange={(e) => setOrdersPageSize(Number(e.target.value))} className="h-8 px-2 text-sm border border-gray-300 rounded">
                <option value={10}>10条/页</option>
                <option value={20}>20条/页</option>
                <option value={50}>50条/页</option>
              </select>
              <Button variant="outline" size="sm" disabled={ordersPage <= 1} onClick={() => setOrdersPage(ordersPage - 1)}>上一页</Button>
              <span className="text-sm text-gray-600">{ordersPage} / {Math.ceil(ordersTotal / ordersPageSize) || 1}</span>
              <Button variant="outline" size="sm" disabled={ordersPage >= Math.ceil(ordersTotal / ordersPageSize)} onClick={() => setOrdersPage(ordersPage + 1)}>下一页</Button>
            </div>
          </div>
        </>
      )}

      {/* Generate Purchase Orders Dialog */}
      <Dialog open={showGenerateConfirm} onOpenChange={setShowGenerateConfirm}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" aria-describedby="generate-order-description">
          <DialogHeader>
            <DialogTitle>确认生成采购订单</DialogTitle>
          </DialogHeader>
          <span id="generate-order-description" className="sr-only">根据选中的补货建议生成采购订单</span>

          <div className="space-y-5 mt-4">
            <div className="grid grid-cols-4 gap-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
              <div>
                <div className="text-xs text-blue-600">选中产品</div>
                <div className="mt-1 text-lg font-semibold text-blue-900">{selectedCount} 个</div>
              </div>
              <div>
                <div className="text-xs text-blue-600">生成订单</div>
                <div className="mt-1 text-lg font-semibold text-blue-900">{orderDrafts.length} 张</div>
              </div>
              <div>
                <div className="text-xs text-blue-600">官方采购价</div>
                <div className="mt-1 text-lg font-semibold text-blue-900">¥{selectedTotal.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs text-blue-600">较市场价节省</div>
                <div className="mt-1 text-lg font-semibold text-emerald-700">¥{selectedSavingTotal.toLocaleString()}</div>
              </div>
            </div>

            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-medium text-emerald-900">Ami 官方供应链专属优惠：按市场价 8 折采购</div>
                  <div className="mt-1 text-sm text-emerald-700">
                    当前清单市场价约 ¥{selectedMarketTotal.toLocaleString()}，官方采购价 ¥{selectedTotal.toLocaleString()}，预计为门店节省 ¥{selectedSavingTotal.toLocaleString()}。
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">官方 8 折</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">采购门店</label>
                <Input value={currentStoreName} disabled />
                <p className="mt-1 text-xs text-gray-500">按当前顶部门店筛选上下文生成，全部门店模式下生成总部集中采购单。</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">预计到货日期</label>
                <Input
                  type="date"
                  value={generatedExpectedDate}
                  onChange={(event) => setGeneratedExpectedDate(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-4">
              {orderDrafts.map((draft) => (
                <div key={draft.supplier} className="rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3">
                    <div>
                      <div className="font-medium text-gray-900">{draft.supplier}</div>
                      <div className="mt-0.5 text-xs text-gray-500">{draft.storeName} · 预计 {draft.expectedDate} 到货 · 官方供应链 8 折价</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-500">{draft.items.length} 个产品</div>
                      <div className="font-semibold text-blue-600">¥{draft.totalAmount.toLocaleString()}</div>
                      <div className="text-xs text-emerald-600">已省 ¥{draft.savingAmount.toLocaleString()}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 border-b border-gray-200 bg-emerald-50/60 px-4 py-2 text-xs">
                    <span className="text-gray-600">市场价：<strong className="text-gray-800">¥{draft.marketAmount.toLocaleString()}</strong></span>
                    <span className="text-gray-600">官方价：<strong className="text-emerald-700">¥{draft.totalAmount.toLocaleString()}</strong></span>
                    <span className="text-gray-600">优惠：<strong className="text-emerald-700">8 折，节省 ¥{draft.savingAmount.toLocaleString()}</strong></span>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-white">
                        <TableHead>产品名称</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>采购数量</TableHead>
                        <TableHead>市场单价</TableHead>
                        <TableHead>官方8折价</TableHead>
                        <TableHead>节省</TableHead>
                        <TableHead className="text-right">小计</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {draft.items.map((item) => (
                        <TableRow key={`${draft.supplier}-${item.sku}`}>
                          <TableCell>{item.productName}</TableCell>
                          <TableCell className="font-mono text-sm text-gray-600">{item.sku}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell className="text-gray-500 line-through">¥{getMarketPrice(item.unitPrice).toLocaleString()}</TableCell>
                          <TableCell className="font-medium text-emerald-700">¥{item.unitPrice.toLocaleString()}</TableCell>
                          <TableCell className="text-emerald-700">¥{getSavingAmount(item.quantity * item.unitPrice).toLocaleString()}</TableCell>
                          <TableCell className="text-right font-medium">¥{(item.quantity * item.unitPrice).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              系统会按供应商自动拆单，并保留官方供应链 8 折采购价。生成后订单状态为“草稿”，可在采购订单列表中继续审核、下单和收货。
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
              <Button type="button" variant="outline" onClick={() => setShowGenerateConfirm(false)} disabled={isGeneratingOrders}>
                取消
              </Button>
              <Button type="button" onClick={handleConfirmGenerateOrders} disabled={isGeneratingOrders || orderDrafts.length === 0 || !generatedExpectedDate}>
                {isGeneratingOrders && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                确认生成采购订单
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manual Purchase Order Detail Dialog */}
      <Dialog open={showManualOrderDetail} onOpenChange={setShowManualOrderDetail}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" aria-describedby="manual-order-detail-description">
          <DialogHeader>
            <DialogTitle>手动采购单详情</DialogTitle>
          </DialogHeader>
          <span id="manual-order-detail-description" className="sr-only">查看历史手动采购单详细信息</span>

          {selectedManualOrder && (
            <div className="space-y-6 mt-4">
              <div className="bg-gray-50 rounded-lg p-4 grid grid-cols-3 gap-4">
                <div>
                  <div className="text-sm text-gray-600">订单编号</div>
                  <div className="font-mono text-sm font-medium text-gray-800 mt-1">
                    {selectedManualOrder.orderNo}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">供应商</div>
                  <div className="font-medium text-gray-800 mt-1">{selectedManualOrder.supplier}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">采购门店</div>
                  <div className="font-medium text-gray-800 mt-1">{selectedManualOrder.storeName}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">状态</div>
                  <div className="mt-1">
                    <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${getManualPurchaseStatusColor(selectedManualOrder.status)}`}>
                      {selectedManualOrder.status}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">创建日期</div>
                  <div className="text-sm text-gray-800 mt-1">{formatDate(selectedManualOrder.createDate)}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">预计到货</div>
                  <div className="text-sm text-gray-800 mt-1">{formatDate(selectedManualOrder.expectedDate)}</div>
                </div>
              </div>

              <div>
                <h4 className="font-medium text-gray-800 mb-3">采购明细</h4>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50/80">
                      <TableHead>产品名称</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>数量</TableHead>
                      <TableHead>已收</TableHead>
                      <TableHead>本次收货</TableHead>
                      <TableHead>单价</TableHead>
                      <TableHead className="text-right">小计</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedManualOrder.items?.length ? (
                      selectedManualOrder.items.map((item) => (
                        <TableRow key={`${selectedManualOrder.orderNo}-${item.sku}`}>
                          <TableCell>{item.productName}</TableCell>
                          <TableCell className="font-mono text-sm">{item.sku}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>{item.receivedQty ?? 0}</TableCell>
                          <TableCell>
                            {['已下单', '部分收货'].includes(selectedManualOrder.status) ? (
                              <Input
                                type="number"
                                min={0}
                                max={Math.max(0, Number(item.quantity ?? 0) - Number(item.receivedQty ?? 0))}
                                className="h-8 w-24"
                                value={manualReceiveQty[item.sku] ?? 0}
                                onChange={(event) => setManualReceiveQty((prev) => ({
                                  ...prev,
                                  [item.sku]: Number(event.target.value) || 0,
                                }))}
                              />
                            ) : (
                              <span className="text-sm text-gray-400">-</span>
                            )}
                          </TableCell>
                          <TableCell>¥{item.unitPrice.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-medium">¥{item.subtotal.toLocaleString()}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-sm text-gray-500">
                          暂无采购明细
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="border-t border-gray-200 pt-4 flex justify-between gap-4">
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  手动采购单按“提交审核 → 审核通过 → 确认下单 → 收货入库”流转；收货会创建批次、增加库存并写入采购入库流水。
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-600">采购金额</div>
                  <div className="text-2xl font-semibold text-blue-600 mt-1">
                    ¥{selectedManualOrder.totalAmount.toLocaleString()}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-3 border-t border-gray-200 pt-4">
                {selectedManualOrder.status === '草稿' && (
                  <Button variant="outline" onClick={() => void handleManualStatusChange('待审核')} disabled={isUpdatingManualOrder}>
                    提交审核
                  </Button>
                )}
                {selectedManualOrder.status === '待审核' && (
                  <Button variant="outline" onClick={() => void handleManualStatusChange('已审核')} disabled={isUpdatingManualOrder}>
                    审核通过
                  </Button>
                )}
                {selectedManualOrder.status === '已审核' && (
                  <Button variant="outline" onClick={() => void handleManualStatusChange('已下单')} disabled={isUpdatingManualOrder}>
                    确认下单
                  </Button>
                )}
                {!['已取消', '已收货'].includes(selectedManualOrder.status) && (
                  <Button variant="outline" onClick={() => void handleManualStatusChange('已取消')} disabled={isUpdatingManualOrder || isReceivingManualOrder}>
                    取消采购单
                  </Button>
                )}
                {['已下单', '部分收货'].includes(selectedManualOrder.status) && (
                  <Button onClick={() => void handleReceiveManualOrder()} disabled={isReceivingManualOrder || isUpdatingManualOrder}>
                    {isReceivingManualOrder && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    收货入库
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Order Detail Dialog */}
      <Dialog open={showOrderDetail} onOpenChange={setShowOrderDetail}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" aria-describedby="order-detail-description">
          <DialogHeader>
            <DialogTitle>采购订单详情</DialogTitle>
          </DialogHeader>
          <span id="order-detail-description" className="sr-only">查看采购订单详细信息</span>

          {selectedOrder && (
            <div className="space-y-6 mt-4">
              {loadingOrderDetail ? (
                <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-700">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在拉取平台订单详情
                </div>
              ) : null}
              {/* Order Info */}
              <div className="bg-gray-50 rounded-lg p-4 grid grid-cols-3 gap-4">
                <div>
                  <div className="text-sm text-gray-600">订单编号</div>
                  <div className="font-mono text-sm font-medium text-gray-800 mt-1">
                    {selectedOrder.orderNo}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">供应商</div>
                  <div className="font-medium text-gray-800 mt-1">{selectedOrder.supplier?.name || `供应商 #${selectedOrder.supplierId}`}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">来源</div>
                  <div className="font-medium text-gray-800 mt-1">{selectedOrder.sourceType === 'replenishment' ? '智能补货' : selectedOrder.sourceType}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">状态</div>
                  <div className="mt-1">
                    <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${getProcurementStatusColor(selectedOrder.status)}`}>
                      {getProcurementStatusLabel(selectedOrder.status)}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">创建时间</div>
                  <div className="text-sm text-gray-800 mt-1">{formatDate(selectedOrder.createdAt)}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">预计到货</div>
                  <div className="text-sm text-gray-800 mt-1">{formatDate(selectedOrder.expectedArrivalDate)}</div>
                </div>
              </div>

              {/* Product Detail */}
              <div>
                <h4 className="font-medium text-gray-800 mb-3">产品明细</h4>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50/80">
                      <TableHead>产品名称</TableHead>
                      <TableHead>平台 SKU</TableHead>
                      <TableHead>数量</TableHead>
                      <TableHead>已收</TableHead>
                      <TableHead>单价</TableHead>
                      <TableHead className="text-right">小计</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedOrder.items?.length ? (
                      selectedOrder.items.map((item) => (
                        <TableRow key={`${selectedOrder.orderNo}-${item.id}`}>
                          <TableCell>{item.supplySku?.name || `本地商品 #${item.productId ?? '-'}`}</TableCell>
                          <TableCell className="font-mono text-sm">{item.supplySkuId}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>{item.receivedQty}</TableCell>
                          <TableCell>¥{item.unitPrice.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-medium">¥{item.subtotal.toLocaleString()}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-sm text-gray-500">
                          暂无采购明细
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Total */}
              <div className="border-t border-gray-200 pt-4 flex justify-end">
                <div className="text-right">
                  <div className="text-sm text-gray-600">应付金额</div>
                  <div className="text-2xl font-semibold text-blue-600 mt-1">
                    ¥{selectedOrder.netAmount.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <Button variant="outline" onClick={() => refreshOrders()}>
                  刷新状态
                </Button>
                {receivableShipmentItems.length > 0 ? (
                  <Button className="gap-2" onClick={handleReceiveSelectedOrder} disabled={isReceivingOrder}>
                    {isReceivingOrder ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageCheck className="w-4 h-4" />}
                    确认收货入库
                  </Button>
                ) : (
                  <Button disabled className="gap-2">
                    <CheckCircle className="w-4 h-4" />
                    暂无待收货明细
                  </Button>
                )}
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="font-medium text-gray-800">库存入库追溯</h4>
                  <Button variant="outline" size="sm" onClick={() => void loadOrderStockMovements(selectedOrder.id)} disabled={loadingStockMovements}>
                    {loadingStockMovements ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    刷新流水
                  </Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50/80">
                      <TableHead>流水号</TableHead>
                      <TableHead>商品</TableHead>
                      <TableHead>批次</TableHead>
                      <TableHead>数量</TableHead>
                      <TableHead>来源</TableHead>
                      <TableHead>发生时间</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stockMovements.length ? (
                      stockMovements.map((movement) => (
                        <TableRow key={movement.id}>
                          <TableCell className="font-mono text-sm">{movement.movementNo}</TableCell>
                          <TableCell>{movement.productName || `商品 #${movement.productId}`}</TableCell>
                          <TableCell>{movement.batchNo || '-'}</TableCell>
                          <TableCell>{movement.quantity} {movement.unit || ''}</TableCell>
                          <TableCell>
                            <div className="text-sm">{movement.sourceNo || selectedOrder.orderNo}</div>
                            <div className="text-xs text-gray-500">{movement.sourceType || 'supply_platform_order'}</div>
                          </TableCell>
                          <TableCell>{formatDate(movement.occurredAt || movement.createdAt)}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-sm text-gray-500">
                          {loadingStockMovements ? '正在加载库存流水...' : '暂无库存流水。完成收货入库后会按平台订单号追溯。'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
