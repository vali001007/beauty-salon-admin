import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Eye, CheckCircle, XCircle, ShoppingCart, Sparkles, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button, Table, TableHeader, TableRow, TableHead, TableBody, TableCell, Input } from '../components/UI';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { purchaseOrderSchema, type PurchaseOrderFormData } from '@/schemas/inventory';
import { getReplenishmentSuggestions, getPurchaseOrdersPaginated, createPurchaseOrder } from '@/api/inventory';
import { usePagination } from '@/hooks/usePagination';
import { toast } from 'sonner';
import type { ReplenishmentSuggestion, PurchaseOrder } from '@/types';

export function PurchaseManagement() {
  const [activeTab, setActiveTab] = useState<'suggestions' | 'orders'>('suggestions');
  const [suggestions, setSuggestions] = useState<(ReplenishmentSuggestion & { checked: boolean })[]>([]);
  const [showOrderDetail, setShowOrderDetail] = useState(false);
  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);

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

  const selectedCount = suggestions.filter(s => s.checked).length;
  const selectedTotal = suggestions
    .filter(s => s.checked)
    .reduce((sum, s) => sum + s.estimatedAmount, 0);

  const handleGenerateOrder = () => {
    const selected = suggestions.filter(s => s.checked);
    if (selected.length === 0) {
      toast.error('请至少选择一个产品');
      return;
    }
    toast.success(`已生成 ${selectedCount} 个产品的采购订单，总金额 ¥${selectedTotal.toLocaleString()}`);
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
                已选择 <strong>{selectedCount}</strong> 个产品，预估总金额 <strong>¥{selectedTotal.toLocaleString()}</strong>
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
                    ¥{item.estimatedAmount.toLocaleString()}
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
                    <TableRow>
                      <TableCell>玻尿酸精华液</TableCell>
                      <TableCell className="font-mono text-sm">SK-LO-000001</TableCell>
                      <TableCell>50</TableCell>
                      <TableCell>¥480</TableCell>
                      <TableCell className="text-right font-medium">¥24,000</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>补水面膜</TableCell>
                      <TableCell className="font-mono text-sm">SK-LO-000002</TableCell>
                      <TableCell>20</TableCell>
                      <TableCell>¥220</TableCell>
                      <TableCell className="text-right font-medium">¥4,400</TableCell>
                    </TableRow>
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