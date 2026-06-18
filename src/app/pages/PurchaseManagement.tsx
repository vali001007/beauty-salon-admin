import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { CheckCircle, XCircle, ShoppingCart, Sparkles, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button, Table, TableHeader, TableRow, TableHead, TableBody, TableCell, Input } from '../components/UI';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { purchaseOrderSchema, type PurchaseOrderFormData } from '@/schemas/inventory';
import { getReplenishmentSuggestions, getPurchaseOrdersPaginated, createPurchaseOrder } from '@/api/inventory';
import { usePagination } from '@/hooks/usePagination';
import { useStoreStore } from '@/stores/storeStore';
import { toast } from 'sonner';
import type { ReplenishmentSuggestion, PurchaseOrder } from '@/types';

type PurchaseOrderDraft = PurchaseOrderFormData & {
  totalAmount: number;
  marketAmount: number;
  savingAmount: number;
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

export function PurchaseManagement() {
  const [activeTab, setActiveTab] = useState<'suggestions' | 'orders'>('suggestions');
  const [suggestions, setSuggestions] = useState<(ReplenishmentSuggestion & { checked: boolean })[]>([]);
  const [showOrderDetail, setShowOrderDetail] = useState(false);
  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);
  const [isGeneratingOrders, setIsGeneratingOrders] = useState(false);
  const [generatedExpectedDate, setGeneratedExpectedDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return date.toISOString().split('T')[0];
  });
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const { currentStoreId, stores } = useStoreStore();
  const currentStoreName = useMemo(() => {
    if (!currentStoreId) return '全部门店';
    return stores.find((store) => store.id === currentStoreId)?.name || '全部门店';
  }, [currentStoreId, stores]);

  const ordersFilters = useMemo(() => ({}), []);
  const { data: orders, total: ordersTotal, page: ordersPage, pageSize: ordersPageSize, loading: ordersLoading, setPage: setOrdersPage, setPageSize: setOrdersPageSize, refresh: refreshOrders } = usePagination<PurchaseOrder>(getPurchaseOrdersPaginated, ordersFilters);

  const { register, handleSubmit, formState: { errors, isSubmitting }, reset, control } = useForm<PurchaseOrderFormData>({
    resolver: zodResolver(purchaseOrderSchema),
    defaultValues: {
      items: [{ productName: '', sku: '', quantity: 1, unitPrice: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

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
      const existing = groups.get(suggestion.supplier) ?? {
        supplier: suggestion.supplier,
        storeName: currentStoreName,
        expectedDate: generatedExpectedDate,
        items: [],
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
      existing.totalAmount += itemAmount;
      existing.marketAmount += itemAmount / OFFICIAL_SUPPLY_DISCOUNT_RATE;
      existing.savingAmount += getSavingAmount(itemAmount);
      groups.set(suggestion.supplier, existing);
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
    setShowGenerateConfirm(true);
  };

  const handleConfirmGenerateOrders = async () => {
    if (orderDrafts.length === 0) {
      toast.error('没有可生成的采购明细');
      return;
    }
    setIsGeneratingOrders(true);
    try {
      await Promise.all(orderDrafts.map((draft) => createPurchaseOrder({
        supplier: draft.supplier,
        storeName: draft.storeName,
        expectedDate: draft.expectedDate,
        items: draft.items,
      })));
      toast.success(`已生成 ${orderDrafts.length} 张采购订单，合计 ¥${selectedTotal.toLocaleString()}`);
      setShowGenerateConfirm(false);
      setSuggestions(prev => prev.map(item => item.checked ? { ...item, checked: false } : item));
      setActiveTab('orders');
      setOrdersPage(1);
      refreshOrders();
    } catch (err: any) {
      toast.error(err?.message || '生成采购订单失败');
    } finally {
      setIsGeneratingOrders(false);
    }
  };

  const handleViewOrder = (order: PurchaseOrder) => {
    setSelectedOrder(order);
    setShowOrderDetail(true);
  };

  const onCreateOrderSubmit = async (data: PurchaseOrderFormData) => {
    try {
      await createPurchaseOrder(data);
      toast.success('采购订单创建成功');
      setShowCreateOrder(false);
      reset();
      refreshOrders();
    } catch (err: any) {
      toast.error(err?.message || '创建采购订单失败');
    }
  };

  const handleCloseCreateOrder = () => {
    setShowCreateOrder(false);
    reset();
  };

  const getStatusColor = (status: PurchaseOrder['status']) => {
    switch (status) {
      case '草稿': return 'bg-gray-100 text-gray-700';
      case '待审核': return 'bg-blue-100 text-blue-700';
      case '已审核': return 'bg-green-100 text-green-700';
      case '已下单': return 'bg-purple-100 text-purple-700';
      case '已收货': return 'bg-teal-100 text-teal-700';
      case '已取消': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-600';
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
          <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center text-white shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-700">
                <strong>AI预测基于近90天数据，置信度85%</strong>
              </p>
              <p className="text-xs text-gray-600 mt-1">
                系统已分析销售趋势、季节性因素和库存周转率，为您推荐最优补货方案
              </p>
            </div>
          </div>

          {/* Selection Summary */}
          {selectedCount > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
              <span className="text-sm text-blue-700">
                已选择 <strong>{selectedCount}</strong> 个产品，预计生成 <strong>{orderDrafts.length}</strong> 张采购订单，预估总金额 <strong>¥{selectedTotal.toLocaleString()}</strong>
              </span>
              <Button onClick={handleGenerateOrder} className="gap-2">
                <ShoppingCart className="w-4 h-4" /> 生成采购订单
              </Button>
            </div>
          )}

          {/* Suggestions Table */}
          <Table>
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
                <TableHead>产品名称</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>当前库存</TableHead>
                <TableHead>预测需求(7天)</TableHead>
                <TableHead>安全库存</TableHead>
                <TableHead>在途数量</TableHead>
                <TableHead>建议补货量</TableHead>
                <TableHead>供应商</TableHead>
                <TableHead>预估金额</TableHead>
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
                  <TableCell className="font-medium text-gray-800">{item.productName}</TableCell>
                  <TableCell className="font-mono text-sm text-gray-600">{item.sku}</TableCell>
                  <TableCell className={item.currentStock < item.safetyStock ? 'text-red-600 font-medium' : ''}>
                    {item.currentStock}
                  </TableCell>
                  <TableCell className="text-blue-600 font-medium">{item.forecast7Days}</TableCell>
                  <TableCell>{item.safetyStock}</TableCell>
                  <TableCell className="text-gray-600">{item.inTransit}</TableCell>
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
                  <TableCell className="text-sm text-gray-600">{item.supplier}</TableCell>
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
              <ShoppingCart className="w-4 h-4" /> 生成采购订单
            </Button>
          </div>
        </>
      )}

      {/* Purchase Orders Tab */}
      {activeTab === 'orders' && (
        <>
          <div className="flex items-center justify-end">
            <Button className="gap-2" onClick={() => setShowCreateOrder(true)}>
              <ShoppingCart className="w-4 h-4" /> 新建采购订单
            </Button>
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
                <TableHead>采购明细</TableHead>
                <TableHead>供应商</TableHead>
                <TableHead>门店</TableHead>
                <TableHead>产品数</TableHead>
                <TableHead>总金额</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>创建日期</TableHead>
                <TableHead>预计交货日期</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id} className="hover:bg-blue-50/30">
                  <TableCell className="font-mono text-sm text-blue-600 font-medium">
                    {order.orderNo}
                  </TableCell>
                  <TableCell className="min-w-[180px] max-w-[260px]">
                    {getPurchaseOrderItemLabels(order).length ? (
                      <div className="space-y-1">
                        {getPurchaseOrderItemLabels(order).map((label) => (
                          <div key={`${order.orderNo}-${label}`} className="text-sm text-gray-700">
                            {label}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">暂无明细（共 {order.productCount} 个产品）</span>
                    )}
                  </TableCell>
                  <TableCell>{order.supplier}</TableCell>
                  <TableCell>{order.storeName}</TableCell>
                  <TableCell>{order.productCount}</TableCell>
                  <TableCell className="font-medium text-gray-800">
                    ¥{order.totalAmount.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${getStatusColor(order.status)}`}>
                      {order.status}
                    </span>
                  </TableCell>
                  <TableCell>{order.createDate}</TableCell>
                  <TableCell>{order.expectedDate}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleViewOrder(order)}
                        className="text-blue-500 hover:text-blue-600 text-sm"
                      >
                        详情
                      </button>
                      {order.status === '待审核' && (
                        <>
                          <span className="text-gray-300">|</span>
                          <button className="text-green-500 hover:text-green-600 text-sm">
                            审核
                          </button>
                        </>
                      )}
                      {order.status === '已下单' && (
                        <>
                          <span className="text-gray-300">|</span>
                          <button className="text-purple-500 hover:text-purple-600 text-sm">
                            收货
                          </button>
                        </>
                      )}
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

      {/* Order Detail Dialog */}
      <Dialog open={showOrderDetail} onOpenChange={setShowOrderDetail}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" aria-describedby="order-detail-description">
          <DialogHeader>
            <DialogTitle>采购订单详情</DialogTitle>
          </DialogHeader>
          <span id="order-detail-description" className="sr-only">查看采购订单详细信息</span>
          
          {selectedOrder && (
            <div className="space-y-6 mt-4">
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
                  <div className="font-medium text-gray-800 mt-1">{selectedOrder.supplier}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">门店</div>
                  <div className="font-medium text-gray-800 mt-1">{selectedOrder.storeName}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">状态</div>
                  <div className="mt-1">
                    <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${getStatusColor(selectedOrder.status)}`}>
                      {selectedOrder.status}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">创建时间</div>
                  <div className="text-sm text-gray-800 mt-1">{selectedOrder.createDate}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">创建人</div>
                  <div className="text-sm text-gray-800 mt-1">张管理员</div>
                </div>
              </div>

              {/* Product Detail */}
              <div>
                <h4 className="font-medium text-gray-800 mb-3">产品明细</h4>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50/80">
                      <TableHead>产品名称</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>数量</TableHead>
                      <TableHead>单价</TableHead>
                      <TableHead className="text-right">小计</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedOrder.items?.length ? (
                      selectedOrder.items.map((item) => (
                        <TableRow key={`${selectedOrder.orderNo}-${item.sku}`}>
                          <TableCell>{item.productName}</TableCell>
                          <TableCell className="font-mono text-sm">{item.sku}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>¥{item.unitPrice.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-medium">¥{item.subtotal.toLocaleString()}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-sm text-gray-500">
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
                  <div className="text-sm text-gray-600">合计金额</div>
                  <div className="text-2xl font-semibold text-blue-600 mt-1">
                    ¥{selectedOrder.totalAmount.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                {selectedOrder.status === '草稿' && (
                  <Button className="gap-2">
                    <CheckCircle className="w-4 h-4" /> 提交审核
                  </Button>
                )}
                {selectedOrder.status === '待审核' && (
                  <>
                    <Button variant="outline" className="gap-2">
                      <XCircle className="w-4 h-4" /> 驳回
                    </Button>
                    <Button className="gap-2">
                      <CheckCircle className="w-4 h-4" /> 通过
                    </Button>
                  </>
                )}
                {selectedOrder.status === '已审核' && (
                  <Button className="gap-2">
                    <ShoppingCart className="w-4 h-4" /> 标记下单
                  </Button>
                )}
                {selectedOrder.status === '已下单' && (
                  <Button className="gap-2">
                    <CheckCircle className="w-4 h-4" /> 确认收货
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Purchase Order Dialog */}
      <Dialog open={showCreateOrder} onOpenChange={handleCloseCreateOrder}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" aria-describedby="create-order-description">
          <DialogHeader>
            <DialogTitle>新建采购订单</DialogTitle>
          </DialogHeader>
          <span id="create-order-description" className="sr-only">创建新的采购订单</span>
          <form onSubmit={handleSubmit(onCreateOrderSubmit)}>
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    供应商 <span className="text-red-500">*</span>
                  </label>
                  <Input placeholder="请输入供应商" {...register('supplier')} />
                  {errors.supplier && <p className="text-red-500 text-xs mt-1">{errors.supplier.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    门店 <span className="text-red-500">*</span>
                  </label>
                  <select
                    className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md"
                    {...register('storeName')}
                  >
                    <option value="">请选择门店</option>
                    <option value="心悦美容养生会所">心悦美容养生会所</option>
                    <option value="凤仪阁美容养生会所">凤仪阁美容养生会所</option>
                  </select>
                  {errors.storeName && <p className="text-red-500 text-xs mt-1">{errors.storeName.message}</p>}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  预计到货日期 <span className="text-red-500">*</span>
                </label>
                <Input type="date" {...register('expectedDate')} />
                {errors.expectedDate && <p className="text-red-500 text-xs mt-1">{errors.expectedDate.message}</p>}
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    采购明细 <span className="text-red-500">*</span>
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => append({ productName: '', sku: '', quantity: 1, unitPrice: 0 })}
                  >
                    <Plus className="w-3 h-3" /> 添加
                  </Button>
                </div>
                {errors.items?.root && <p className="text-red-500 text-xs mb-2">{errors.items.root.message}</p>}
                
                <div className="space-y-3">
                  {fields.map((field, index) => (
                    <div key={field.id} className="grid grid-cols-12 gap-2 items-start border border-gray-200 rounded-lg p-3">
                      <div className="col-span-3">
                        <label className="block text-xs text-gray-500 mb-1">产品名称</label>
                        <Input
                          placeholder="产品名称"
                          {...register(`items.${index}.productName`)}
                        />
                        {errors.items?.[index]?.productName && (
                          <p className="text-red-500 text-xs mt-1">{errors.items[index].productName?.message}</p>
                        )}
                      </div>
                      <div className="col-span-3">
                        <label className="block text-xs text-gray-500 mb-1">SKU</label>
                        <Input
                          placeholder="SKU"
                          {...register(`items.${index}.sku`)}
                        />
                        {errors.items?.[index]?.sku && (
                          <p className="text-red-500 text-xs mt-1">{errors.items[index].sku?.message}</p>
                        )}
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs text-gray-500 mb-1">数量</label>
                        <Input
                          type="number"
                          placeholder="数量"
                          {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                        />
                        {errors.items?.[index]?.quantity && (
                          <p className="text-red-500 text-xs mt-1">{errors.items[index].quantity?.message}</p>
                        )}
                      </div>
                      <div className="col-span-3">
                        <label className="block text-xs text-gray-500 mb-1">单价</label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="单价"
                          {...register(`items.${index}.unitPrice`, { valueAsNumber: true })}
                        />
                        {errors.items?.[index]?.unitPrice && (
                          <p className="text-red-500 text-xs mt-1">{errors.items[index].unitPrice?.message}</p>
                        )}
                      </div>
                      <div className="col-span-1 flex items-end pb-1">
                        {fields.length > 1 && (
                          <button
                            type="button"
                            onClick={() => remove(index)}
                            className="text-red-400 hover:text-red-600 p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <Button type="button" variant="outline" onClick={handleCloseCreateOrder}>
                取消
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                创建订单
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
