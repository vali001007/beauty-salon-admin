import React, { useState } from 'react';
import { Plus, Sparkles, TrendingUp, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/UI';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { transferSchema, type TransferFormData } from '@/schemas/inventory';
import { createTransfer } from '@/api/inventory';
import { toast } from 'sonner';

interface Store {
  id: number;
  name: string;
  address: string;
  skuCount: number;
  totalValue: number;
  healthScore: number;
  mode: '集中' | '独立';
}

interface StockComparison {
  productName: string;
  sku: string;
  store1: number;
  store2: number;
  store1Status: '正常' | '偏低' | '缺货';
  store2Status: '正常' | '偏低' | '缺货';
}

interface TransferSuggestion {
  id: number;
  fromStore: string;
  toStore: string;
  productName: string;
  suggestedQty: number;
  reason: string;
}

interface TransferOrder {
  id: number;
  orderNo: string;
  fromStore: string;
  toStore: string;
  productCount: number;
  status: '待确认' | '运输中' | '已完成' | '已取消';
}

const MOCK_STORES: Store[] = [
  { id: 1, name: '心悦美容养生会所', address: '北京市朝阳区', skuCount: 156, totalValue: 285600, healthScore: 92, mode: '集中' },
  { id: 2, name: '凤仪阁美容养生会所', address: '北京市海淀区', skuCount: 142, totalValue: 268400, healthScore: 88, mode: '集中' },
  { id: 3, name: '雅韵美容会所', address: '北京市东城区', skuCount: 128, totalValue: 195200, healthScore: 75, mode: '独立' },
];

const MOCK_COMPARISONS: StockComparison[] = [
  { productName: '玻尿酸精华液', sku: 'SK-LO-000001', store1: 85, store2: 12, store1Status: '正常', store2Status: '偏低' },
  { productName: '补水面膜', sku: 'SK-LO-000002', store1: 18, store2: 68, store1Status: '偏低', store2Status: '正常' },
  { productName: '美白精华', sku: 'SK-LO-000003', store1: 5, store2: 3, store1Status: '缺货', store2Status: '缺货' },
  { productName: '修护洗发水', sku: 'SK-LO-000004', store1: 280, store2: 45, store1Status: '正常', store2Status: '正常' },
];

const MOCK_SUGGESTIONS: TransferSuggestion[] = [
  { id: 1, fromStore: '心悦美容养生会所', toStore: '凤仪阁美容养生会所', productName: '玻尿酸精华液', suggestedQty: 30, reason: '目标门店库存不足，来源门店库存充足' },
  { id: 2, fromStore: '凤仪阁美容养生会所', toStore: '心悦美容养生会所', productName: '补水面膜', suggestedQty: 25, reason: '目标门店即将缺货，来源门店积压' },
];

const MOCK_TRANSFERS: TransferOrder[] = [
  { id: 1, orderNo: 'TF-2026-03-001', fromStore: '心悦美容养生会所', toStore: '凤仪阁美容养生会所', productCount: 3, status: '运输中' },
  { id: 2, orderNo: 'TF-2026-03-002', fromStore: '凤仪阁美容养生会所', toStore: '雅韵美容会所', productCount: 5, status: '待确认' },
  { id: 3, orderNo: 'TF-2026-03-003', fromStore: '心悦美容养生会所', toStore: '雅韵美容会所', productCount: 2, status: '已完成' },
];

export function StoreTransfer() {
  const [activeTab, setActiveTab] = useState<'comparison' | 'transfer'>('comparison');
  const [selectedStores, setSelectedStores] = useState([0, 1]);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [transfers, setTransfers] = useState(MOCK_TRANSFERS);

  const { register, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm<TransferFormData>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      fromStore: '',
      toStore: '',
      productName: '',
      quantity: 1,
      reason: '',
    },
  });

  const handleOpenTransferDialog = () => {
    reset({ fromStore: '', toStore: '', productName: '', quantity: 1, reason: '' });
    setShowTransferDialog(true);
  };

  const onSubmit = async (data: TransferFormData) => {
    try {
      const result = await createTransfer(data);
      toast.success('调拨申请创建成功');
      setTransfers(prev => [{ ...result, id: result.id, orderNo: result.orderNo, fromStore: result.fromStore, toStore: result.toStore, productCount: result.productCount, status: result.status }, ...prev]);
      setShowTransferDialog(false);
    } catch (err: any) {
      toast.error(err?.message || '创建调拨申请失败');
    }
  };

  const getStockStatusColor = (status: StockComparison['store1Status']) => {
    switch (status) {
      case '正常':
        return 'bg-green-100 text-green-700';
      case '偏低':
        return 'bg-orange-100 text-orange-700';
      case '缺货':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  const getTransferStatusColor = (status: TransferOrder['status']) => {
    switch (status) {
      case '待确认':
        return 'bg-blue-100 text-blue-700';
      case '运输中':
        return 'bg-purple-100 text-purple-700';
      case '已完成':
        return 'bg-green-100 text-green-700';
      case '已取消':
        return 'bg-gray-100 text-gray-600';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <div className="text-sm text-gray-500">
        首页 / 库存管理 / 门店库存与调拨
      </div>

      <h2 className="text-xl font-semibold text-gray-800">门店库存与调拨</h2>

      {/* Store Cards */}
      <div className="relative">
        <div className="flex items-center gap-4 overflow-x-auto pb-4">
          {MOCK_STORES.map((store) => (
            <div
              key={store.id}
              className="min-w-[280px] bg-white border border-gray-200 rounded-lg p-5 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-800">{store.name}</h3>
                  <p className="text-xs text-gray-500 mt-1">{store.address}</p>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  store.mode === '集中'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-purple-100 text-purple-700'
                }`}>
                  {store.mode}采购
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <div className="text-xs text-gray-500">SKU数</div>
                  <div className="font-semibold text-gray-800">{store.skuCount}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">库存总值</div>
                  <div className="font-semibold text-gray-800">¥{(store.totalValue / 1000).toFixed(1)}K</div>
                </div>
              </div>
              
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500">健康度</span>
                  <span className={`text-sm font-semibold ${
                    store.healthScore >= 90
                      ? 'text-green-600'
                      : store.healthScore >= 80
                      ? 'text-blue-600'
                      : 'text-orange-600'
                  }`}>
                    {store.healthScore}分
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      store.healthScore >= 90
                        ? 'bg-green-500'
                        : store.healthScore >= 80
                        ? 'bg-blue-500'
                        : 'bg-orange-500'
                    }`}
                    style={{ width: `${store.healthScore}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
        
        <div className="absolute right-0 top-1/2 -translate-y-1/2 flex gap-2">
          <button className="w-8 h-8 bg-white border border-gray-300 rounded-full flex items-center justify-center hover:bg-gray-50">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button className="w-8 h-8 bg-white border border-gray-300 rounded-full flex items-center justify-center hover:bg-gray-50">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-4 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('comparison')}
          className={`px-4 py-3 text-sm font-medium transition-colors relative ${
            activeTab === 'comparison'
              ? 'text-blue-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          库存对比
          {activeTab === 'comparison' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('transfer')}
          className={`px-4 py-3 text-sm font-medium transition-colors relative ${
            activeTab === 'transfer'
              ? 'text-blue-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          调拨管理
          {activeTab === 'transfer' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
          )}
        </button>
      </div>

      {/* Stock Comparison Tab */}
      {activeTab === 'comparison' && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">对比门店:</span>
              <select
                className="h-9 px-3 text-sm border border-gray-300 rounded-md"
                value={selectedStores[0]}
                onChange={(e) => setSelectedStores([parseInt(e.target.value), selectedStores[1]])}
              >
                {MOCK_STORES.map((store, index) => (
                  <option key={store.id} value={index}>{store.name}</option>
                ))}
              </select>
              <span className="text-gray-400">vs</span>
              <select
                className="h-9 px-3 text-sm border border-gray-300 rounded-md"
                value={selectedStores[1]}
                onChange={(e) => setSelectedStores([selectedStores[0], parseInt(e.target.value)])}
              >
                {MOCK_STORES.map((store, index) => (
                  <option key={store.id} value={index}>{store.name}</option>
                ))}
              </select>
            </div>
            
            <select className="h-9 px-3 text-sm border border-gray-300 rounded-md">
              <option>全部分类</option>
              <option>护肤品</option>
              <option>美发产品</option>
            </select>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/80">
                <TableHead>产品名称</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead colSpan={2} className="text-center border-r border-gray-200">
                  {MOCK_STORES[selectedStores[0]].name}
                </TableHead>
                <TableHead colSpan={2} className="text-center">
                  {MOCK_STORES[selectedStores[1]].name}
                </TableHead>
              </TableRow>
              <TableRow className="bg-gray-50/80">
                <TableHead></TableHead>
                <TableHead></TableHead>
                <TableHead className="text-center">库存</TableHead>
                <TableHead className="text-center border-r border-gray-200">状态</TableHead>
                <TableHead className="text-center">库存</TableHead>
                <TableHead className="text-center">状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {MOCK_COMPARISONS.map((item, index) => (
                <TableRow key={index} className="hover:bg-blue-50/30">
                  <TableCell className="font-medium text-gray-800">{item.productName}</TableCell>
                  <TableCell className="font-mono text-sm text-gray-600">{item.sku}</TableCell>
                  <TableCell className="text-center font-medium">{item.store1}</TableCell>
                  <TableCell className="text-center border-r border-gray-200">
                    <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${getStockStatusColor(item.store1Status)}`}>
                      {item.store1Status}
                    </span>
                  </TableCell>
                  <TableCell className="text-center font-medium">{item.store2}</TableCell>
                  <TableCell className="text-center">
                    <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${getStockStatusColor(item.store2Status)}`}>
                      {item.store2Status}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      {/* Transfer Management Tab */}
      {activeTab === 'transfer' && (
        <>
          {/* AI Suggestions */}
          <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center text-white shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-gray-800">AI调拨建议</h3>
            </div>
            
            <div className="space-y-3">
              {MOCK_SUGGESTIONS.map((suggestion) => (
                <div key={suggestion.id} className="bg-white rounded-lg p-4 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-gray-800">{suggestion.productName}</span>
                      <span className="text-gray-400">•</span>
                      <span className="text-sm text-gray-600">建议调拨 {suggestion.suggestedQty} 件</span>
                    </div>
                    <div className="text-sm text-gray-600 mb-2">
                      {suggestion.fromStore} → {suggestion.toStore}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <TrendingUp className="w-3 h-3" />
                      {suggestion.reason}
                    </div>
                  </div>
                  <Button size="sm">
                    采纳
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Transfer Orders */}
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">调拨单列表</h3>
            <Button className="gap-2" onClick={handleOpenTransferDialog}>
              <Plus className="w-4 h-4" /> 发起调拨
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/80">
                <TableHead>调拨单号</TableHead>
                <TableHead>调出门店</TableHead>
                <TableHead>调入门店</TableHead>
                <TableHead>产品数</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfers.map((transfer) => (
                <TableRow key={transfer.id} className="hover:bg-blue-50/30">
                  <TableCell className="font-mono text-sm text-blue-600 font-medium">
                    {transfer.orderNo}
                  </TableCell>
                  <TableCell>{transfer.fromStore}</TableCell>
                  <TableCell>{transfer.toStore}</TableCell>
                  <TableCell>{transfer.productCount}</TableCell>
                  <TableCell>
                    <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${getTransferStatusColor(transfer.status)}`}>
                      {transfer.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <button className="text-blue-500 hover:text-blue-600 text-sm">
                      详情
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      {/* Transfer Dialog */}
      <Dialog open={showTransferDialog} onOpenChange={setShowTransferDialog}>
        <DialogContent className="max-w-2xl" aria-describedby="transfer-description">
          <DialogHeader>
            <DialogTitle>发起调拨</DialogTitle>
          </DialogHeader>
          <span id="transfer-description" className="sr-only">创建门店间产品调拨</span>
          
          <form onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  调出门店 <span className="text-red-500">*</span>
                </label>
                <select className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md" {...register('fromStore')}>
                  <option value="">请选择</option>
                  {MOCK_STORES.map((store) => (
                    <option key={store.id} value={store.name}>{store.name}</option>
                  ))}
                </select>
                {errors.fromStore && <p className="text-red-500 text-xs mt-1">{errors.fromStore.message}</p>}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  调入门店 <span className="text-red-500">*</span>
                </label>
                <select className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md" {...register('toStore')}>
                  <option value="">请选择</option>
                  {MOCK_STORES.map((store) => (
                    <option key={store.id} value={store.name}>{store.name}</option>
                  ))}
                </select>
                {errors.toStore && <p className="text-red-500 text-xs mt-1">{errors.toStore.message}</p>}
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                调拨产品 <span className="text-red-500">*</span>
              </label>
              <select className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md" {...register('productName')}>
                <option value="">请选择产品</option>
                {MOCK_COMPARISONS.map((item, idx) => (
                  <option key={idx} value={item.productName}>{item.productName} ({item.sku})</option>
                ))}
              </select>
              {errors.productName && <p className="text-red-500 text-xs mt-1">{errors.productName.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                调拨数量 <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md"
                {...register('quantity', { valueAsNumber: true })}
              />
              {errors.quantity && <p className="text-red-500 text-xs mt-1">{errors.quantity.message}</p>}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                调拨原因 <span className="text-red-500">*</span>
              </label>
              <textarea
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
                rows={3}
                placeholder="请输入调拨原因"
                {...register('reason')}
              />
              {errors.reason && <p className="text-red-500 text-xs mt-1">{errors.reason.message}</p>}
            </div>
          </div>
          
          <div className="flex justify-end gap-3 mt-6">
            <Button type="button" variant="outline" onClick={() => setShowTransferDialog(false)}>
              取消
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              确认调拨
            </Button>
          </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}