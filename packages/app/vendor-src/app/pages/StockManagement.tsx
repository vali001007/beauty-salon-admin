import React, { useState, useMemo } from 'react';
import { Search, PackagePlus, PackageMinus, ClipboardList, Settings, X, Loader2, Download } from 'lucide-react';
import { Input, Button, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/UI';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { inboundSchema, type InboundFormData } from '@/schemas/inventory';
import { getStockItemsPaginated, createInbound } from '@/api/inventory';
import { usePagination } from '@/hooks/usePagination';
import { exportToExcel } from '@/utils/excel';
import { toast } from 'sonner';
import type { StockItem as StockItemType } from '@/types';
import type { ExportColumn } from '@/types/excel';

const STOCK_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'productName', header: '产品名称', width: 20 },
  { key: 'sku', header: 'SKU', width: 18 },
  { key: 'currentStock', header: '当前库存', width: 10 },
  { key: 'reserved', header: '已预留', width: 10 },
  { key: 'availableStock', header: '可用库存', width: 10 },
  { key: 'safetyStock', header: '安全库存', width: 10 },
  { key: 'maxStock', header: '最大库存', width: 10 },
  { key: 'status', header: '状态', width: 10 },
  { key: 'lastInboundDate', header: '最近入库日期', width: 15 },
];

interface Batch {
  id: number;
  batchNo: string;
  inboundQty: number;
  availableQty: number;
  productionDate: string;
  expiryDate: string;
  status: '正常' | '临期' | '过期';
  inboundDate: string;
}

const MOCK_BATCHES: Batch[] = [
  { id: 1, batchNo: 'B-2026-03-20-001', inboundQty: 50, availableQty: 35, productionDate: '2025-12-15', expiryDate: '2028-12-15', status: '正常', inboundDate: '2026-03-20' },
  { id: 2, batchNo: 'B-2026-02-10-002', inboundQty: 40, availableQty: 30, productionDate: '2025-10-20', expiryDate: '2028-10-20', status: '正常', inboundDate: '2026-02-10' },
  { id: 3, batchNo: 'B-2026-01-15-003', inboundQty: 30, availableQty: 20, productionDate: '2025-08-10', expiryDate: '2028-08-10', status: '正常', inboundDate: '2026-01-15' },
];

export function StockManagement() {
  const [selectedStore, setSelectedStore] = useState('全部');
  const [selectedCategory, setSelectedCategory] = useState('全部');
  const [selectedStatus, setSelectedStatus] = useState('全部');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [showBatchPanel, setShowBatchPanel] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<StockItemType | null>(null);
  const [showInboundDialog, setShowInboundDialog] = useState(false);
  const [showOutboundDialog, setShowOutboundDialog] = useState(false);

  const filters = useMemo(() => ({
    status: selectedStatus !== '全部' ? selectedStatus : undefined,
    keyword: searchKeyword || undefined,
  }), [selectedStatus, searchKeyword]);
  const { data: stocks, total, page, pageSize, loading, setPage, setPageSize, refresh } = usePagination<StockItemType>(getStockItemsPaginated, filters);

  const { register, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm<InboundFormData>({
    resolver: zodResolver(inboundSchema),
    defaultValues: {
      batchNo: `B-${new Date().toISOString().split('T')[0]}-${String(Math.floor(Math.random() * 999)).padStart(3, '0')}`,
    },
  });

  const getStatusColor = (status: StockItemType['status']) => {
    switch (status) {
      case '正常': return 'bg-green-100 text-green-700';
      case '低库存': return 'bg-orange-100 text-orange-700';
      case '积压': return 'bg-blue-100 text-blue-700';
      case '缺货': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const getBatchStatusColor = (status: Batch['status']) => {
    switch (status) {
      case '正常': return 'bg-green-100 text-green-700';
      case '临期': return 'bg-orange-100 text-orange-700';
      case '过期': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const handleViewBatch = (product: StockItemType) => {
    setSelectedProduct(product);
    setShowBatchPanel(true);
  };

  const onInboundSubmit = async (data: InboundFormData) => {
    try {
      await createInbound(data);
      toast.success('入库成功');
      setShowInboundDialog(false);
      reset();
      refresh();
    } catch (err: any) {
      toast.error(err?.message || '入库操作失败');
    }
  };

  const handleCloseInbound = () => {
    setShowInboundDialog(false);
    reset();
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <div className="text-sm text-gray-500">
        首页 / 库存管理 / 库存管理
      </div>

      {/* Filter Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <select
            className="h-9 px-3 text-sm border border-gray-300 rounded-md"
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value)}
          >
            <option>全部门店</option>
            <option>心悦美容养生会所</option>
            <option>凤仪阁美容养生会所</option>
          </select>
          
          <select
            className="h-9 px-3 text-sm border border-gray-300 rounded-md"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <option>全部分类</option>
            <option>护肤品</option>
            <option>美发产品</option>
            <option>美甲产品</option>
          </select>
          
          <select
            className="h-9 px-3 text-sm border border-gray-300 rounded-md"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
          >
            <option>全部状态</option>
            <option>正常</option>
            <option>低库存</option>
            <option>积压</option>
            <option>缺货</option>
          </select>
          
          <Input
            placeholder="搜索产品"
            className="w-64"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
          />
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => exportToExcel(stocks, STOCK_EXPORT_COLUMNS, '库存报表')}>
            <Download className="w-4 h-4" /> 导出报表
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => setShowOutboundDialog(true)}>
            <PackageMinus className="w-4 h-4" /> 出库
          </Button>
          <Button variant="outline" className="gap-2">
            <ClipboardList className="w-4 h-4" /> 盘点
          </Button>
          <Button className="gap-2" onClick={() => setShowInboundDialog(true)}>
            <PackagePlus className="w-4 h-4" /> 入库
          </Button>
        </div>
      </div>

      {/* Stock Table */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          <span className="ml-2 text-gray-500">加载中...</span>
        </div>
      )}
      {!loading && (
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50/80">
            <TableHead>产品名称</TableHead>
            <TableHead>SKU</TableHead>
            <TableHead>当前库存</TableHead>
            <TableHead>已预留</TableHead>
            <TableHead>可用库存</TableHead>
            <TableHead>安全库存</TableHead>
            <TableHead>最大库存</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>最近入库日期</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {stocks.map((stock) => (
            <TableRow key={stock.id} className="hover:bg-blue-50/30">
              <TableCell className="font-medium text-gray-800">{stock.productName}</TableCell>
              <TableCell className="font-mono text-sm text-gray-600">{stock.sku}</TableCell>
              <TableCell className="font-medium">{stock.currentStock}</TableCell>
              <TableCell className="text-gray-600">{stock.reserved}</TableCell>
              <TableCell className="font-medium text-blue-600">{stock.availableStock}</TableCell>
              <TableCell className="text-gray-600">{stock.safetyStock}</TableCell>
              <TableCell className="text-gray-600">{stock.maxStock}</TableCell>
              <TableCell>
                <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${getStatusColor(stock.status)}`}>
                  {stock.status}
                </span>
              </TableCell>
              <TableCell className="text-gray-600">{stock.lastInboundDate}</TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => handleViewBatch(stock)}
                    className="text-blue-500 hover:text-blue-600 text-sm"
                  >
                    查看批次
                  </button>
                  <span className="text-gray-300">|</span>
                  <button className="text-gray-500 hover:text-gray-600 text-sm">
                    <Settings className="w-4 h-4" />
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
        <div className="text-sm text-gray-600">共 {total} 条</div>
        <div className="flex items-center gap-2">
          <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="h-8 px-2 text-sm border border-gray-300 rounded">
            <option value={10}>10条/页</option>
            <option value={20}>20条/页</option>
            <option value={50}>50条/页</option>
          </select>
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button>
          <span className="text-sm text-gray-600">{page} / {Math.ceil(total / pageSize) || 1}</span>
          <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage(page + 1)}>下一页</Button>
        </div>
      </div>

      {/* Batch Detail Side Panel */}
      {showBatchPanel && selectedProduct && (
        <div className="fixed inset-0 z-50 bg-black/20" onClick={() => setShowBatchPanel(false)}>
          <div
            className="absolute right-0 top-0 bottom-0 w-[600px] bg-white shadow-2xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">批次详情</h3>
              <button
                onClick={() => setShowBatchPanel(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Product Info Card */}
            <div className="p-6 bg-gradient-to-r from-blue-50 to-purple-50 border-b border-gray-200">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-600">产品名称</div>
                  <div className="font-semibold text-gray-800 mt-1">{selectedProduct.productName}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">SKU</div>
                  <div className="font-mono text-sm text-gray-800 mt-1">{selectedProduct.sku}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">当前库存</div>
                  <div className="font-semibold text-blue-600 mt-1">{selectedProduct.currentStock}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">可用库存</div>
                  <div className="font-semibold text-green-600 mt-1">{selectedProduct.availableStock}</div>
                </div>
              </div>
            </div>
            
            {/* Batch Table */}
            <div className="p-6">
              <h4 className="font-medium text-gray-800 mb-4">批次列表（FIFO排序）</h4>
              <div className="space-y-3">
                {MOCK_BATCHES.map((batch) => (
                  <div key={batch.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="font-mono text-sm font-medium text-gray-800">{batch.batchNo}</div>
                        <div className="text-xs text-gray-500 mt-1">入库日期: {batch.inboundDate}</div>
                      </div>
                      <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${getBatchStatusColor(batch.status)}`}>
                        {batch.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <div className="text-gray-500 text-xs">入库量</div>
                        <div className="font-medium text-gray-700">{batch.inboundQty}</div>
                      </div>
                      <div>
                        <div className="text-gray-500 text-xs">可用量</div>
                        <div className="font-medium text-blue-600">{batch.availableQty}</div>
                      </div>
                      <div>
                        <div className="text-gray-500 text-xs">生产日期</div>
                        <div className="text-gray-700">{batch.productionDate}</div>
                      </div>
                      <div className="col-span-3">
                        <div className="text-gray-500 text-xs">过期日期</div>
                        <div className="text-gray-700">{batch.expiryDate}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Inbound Dialog */}
      <Dialog open={showInboundDialog} onOpenChange={handleCloseInbound}>
        <DialogContent className="max-w-xl" aria-describedby="inbound-description">
          <DialogHeader>
            <DialogTitle>产品入库</DialogTitle>
          </DialogHeader>
          <span id="inbound-description" className="sr-only">记录产品入库信息</span>
          <form onSubmit={handleSubmit(onInboundSubmit)}>
            <div className="space-y-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  选择产品 <span className="text-red-500">*</span>
                </label>
                <select
                  className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md"
                  {...register('productId', { valueAsNumber: true })}
                >
                  <option value={0}>请选择产品</option>
                  {stocks.map((s) => (
                    <option key={s.id} value={s.id}>{s.productName} ({s.sku})</option>
                  ))}
                </select>
                {errors.productId && <p className="text-red-500 text-xs mt-1">{errors.productId.message}</p>}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  入库数量 <span className="text-red-500">*</span>
                </label>
                <Input
                  type="number"
                  placeholder="请输入入库数量"
                  {...register('quantity', { valueAsNumber: true })}
                />
                {errors.quantity && <p className="text-red-500 text-xs mt-1">{errors.quantity.message}</p>}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  批次号 <span className="text-red-500">*</span>
                </label>
                <Input
                  {...register('batchNo')}
                  disabled
                  className="bg-gray-50"
                />
                <p className="text-xs text-gray-500 mt-1">系统自动生成</p>
                {errors.batchNo && <p className="text-red-500 text-xs mt-1">{errors.batchNo.message}</p>}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    生产日期 <span className="text-red-500">*</span>
                  </label>
                  <Input type="date" {...register('productionDate')} />
                  {errors.productionDate && <p className="text-red-500 text-xs mt-1">{errors.productionDate.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    过期日期 <span className="text-red-500">*</span>
                  </label>
                  <Input type="date" {...register('expiryDate')} />
                  <p className="text-xs text-gray-500 mt-1">根据保质期自动计算</p>
                  {errors.expiryDate && <p className="text-red-500 text-xs mt-1">{errors.expiryDate.message}</p>}
                </div>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <Button type="button" variant="outline" onClick={handleCloseInbound}>
                取消
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                确认入库
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Outbound Dialog */}
      <Dialog open={showOutboundDialog} onOpenChange={setShowOutboundDialog}>
        <DialogContent className="max-w-xl" aria-describedby="outbound-description">
          <DialogHeader>
            <DialogTitle>产品出库</DialogTitle>
          </DialogHeader>
          <span id="outbound-description" className="sr-only">记录产品出库信息</span>
          <div className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                选择产品 <span className="text-red-500">*</span>
              </label>
              <Input placeholder="搜索产品名称或SKU" />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                出库数量 <span className="text-red-500">*</span>
              </label>
              <Input type="number" placeholder="请输入出库数量" />
              <p className="text-xs text-gray-500 mt-1">可用库存: 70</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                出库类型 <span className="text-red-500">*</span>
              </label>
              <select className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md">
                <option>服务消耗</option>
                <option>客户销售</option>
                <option>调拨</option>
                <option>报废</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
              <textarea
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
                rows={3}
                placeholder="请输入出库备注"
              />
            </div>
          </div>
          
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="outline" onClick={() => setShowOutboundDialog(false)}>
              取消
            </Button>
            <Button>确认出库</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}