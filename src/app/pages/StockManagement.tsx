import React, { useEffect, useMemo, useState } from 'react';
import { PackagePlus, PackageMinus, ClipboardList, Settings, X, Loader2, Download } from 'lucide-react';
import { Input, Button, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/UI';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  inboundSchema,
  inventoryAdjustmentSchema,
  stocktakeSchema,
  type InboundFormData,
  type InventoryAdjustmentFormData,
  type InventoryAdjustmentFormInput,
  type StocktakeFormData,
} from '@/schemas/inventory';
import { getBatches, getStockItemsPaginated, createInbound, createInventoryAdjustment, getStockMovements } from '@/api/inventory';
import { getCategories } from '@/api/product';
import { usePagination } from '@/hooks/usePagination';
import { usePermission } from '@/hooks/usePermission';
import { useStoreStore } from '@/stores/storeStore';
import { exportToExcel } from '@/utils/excel';
import { toast } from 'sonner';
import type { Batch as BatchType, Category, StockItem as StockItemType, StockMovement } from '@/types';
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

function createBatchNo() {
  return `B-${new Date().toISOString().split('T')[0]}-${String(Math.floor(Math.random() * 999)).padStart(3, '0')}`;
}

function createInboundDefaultValues(): Partial<InboundFormData> {
  return {
    productId: 0,
    batchNo: createBatchNo(),
    quantity: 1,
    unitCost: 0,
    totalAmount: 0,
    supplier: '',
  };
}

function flattenCategories(categories: Category[]): Category[] {
  return categories.flatMap((category) => [category, ...flattenCategories(category.children ?? [])]);
}

function formatDate(value?: string | Date | null) {
  if (!value) return '-';
  return String(value).slice(0, 10);
}

function formatDateTime(value?: string | Date | null) {
  if (!value) return '-';
  return String(value).replace('T', ' ').slice(0, 16);
}

function formatMovementType(type?: string | null) {
  const labels: Record<string, string> = {
    inbound: '入库',
    purchase_inbound: '采购入库',
    manual_outbound: '手工出库',
    scrap_out: '报废出库',
    stocktake_gain: '盘点盘盈',
    stocktake_loss: '盘点盘亏',
    manual_correction: '手工修正',
    transfer_in: '调拨入库',
    transfer_out: '调拨出库',
    service_consume: '服务消耗',
    product_sale_out: '商品销售出库',
  };
  return labels[String(type ?? '')] ?? String(type ?? '-');
}

export function StockManagement() {
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('全部');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [showBatchPanel, setShowBatchPanel] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<StockItemType | null>(null);
  const [showInboundDialog, setShowInboundDialog] = useState(false);
  const [showOutboundDialog, setShowOutboundDialog] = useState(false);
  const [showStocktakeDialog, setShowStocktakeDialog] = useState(false);
  const [batches, setBatches] = useState<BatchType[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [stockMovementsLoading, setStockMovementsLoading] = useState(false);
  const [outboundBatches, setOutboundBatches] = useState<BatchType[]>([]);
  const [outboundBatchesLoading, setOutboundBatchesLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const { currentStoreId, stores, loadStores } = useStoreStore();
  const canCreateInbound = usePermission('core:inventory:purchase');
  const canCreateAdjustment = usePermission('core:inventory:adjustment');
  const canConfirmStocktake = usePermission('core:inventory:stocktake');
  const flatCategories = useMemo(() => flattenCategories(categories), [categories]);

  const filters = useMemo(() => ({
    storeId: selectedStoreId ? Number(selectedStoreId) : currentStoreId ?? undefined,
    categoryId: selectedCategoryId ? Number(selectedCategoryId) : undefined,
    status: selectedStatus !== '全部' ? selectedStatus : undefined,
    keyword: searchKeyword || undefined,
  }), [currentStoreId, searchKeyword, selectedCategoryId, selectedStatus, selectedStoreId]);
  const { data: stocks, total, page, pageSize, loading, setPage, setPageSize, refresh } = usePagination<StockItemType>(getStockItemsPaginated, filters);

  const { register, handleSubmit, formState: { errors, isSubmitting }, reset, watch, setValue } = useForm<InboundFormData>({
    resolver: zodResolver(inboundSchema),
    defaultValues: createInboundDefaultValues(),
  });
  const inboundProductId = watch('productId');
  const inboundQuantity = watch('quantity');
  const inboundUnitCost = watch('unitCost');
  const selectedInboundProduct = stocks.find((stock) => stock.id === Number(inboundProductId));
  const inboundTotalAmount = useMemo(() => {
    const quantity = Number(inboundQuantity);
    const unitCost = Number(inboundUnitCost);
    if (!Number.isFinite(quantity) || !Number.isFinite(unitCost)) return 0;
    return Math.round(quantity * unitCost * 100) / 100;
  }, [inboundQuantity, inboundUnitCost]);
  const {
    register: registerOutbound,
    handleSubmit: handleSubmitOutbound,
    formState: { errors: outboundErrors, isSubmitting: outboundSubmitting },
    reset: resetOutbound,
    watch: watchOutbound,
  } = useForm<InventoryAdjustmentFormInput, unknown, InventoryAdjustmentFormData>({
    resolver: zodResolver(inventoryAdjustmentSchema),
    defaultValues: {
      productId: 0,
      batchId: undefined,
      adjustmentType: 'manual_outbound',
      quantity: 1,
      remark: '',
    },
  });
  const outboundProductId = watchOutbound('productId');
  const selectedOutboundProduct = stocks.find((stock) => stock.id === Number(outboundProductId));
  const {
    register: registerStocktake,
    handleSubmit: handleSubmitStocktake,
    formState: { errors: stocktakeErrors, isSubmitting: stocktakeSubmitting },
    reset: resetStocktake,
    watch: watchStocktake,
    setValue: setStocktakeValue,
  } = useForm<StocktakeFormData>({
    resolver: zodResolver(stocktakeSchema),
    defaultValues: {
      productId: 0,
      actualStock: 0,
      remark: '',
    },
  });
  const stocktakeProductId = watchStocktake('productId');
  const stocktakeActualStock = watchStocktake('actualStock');
  const selectedStocktakeProduct = stocks.find((stock) => stock.id === Number(stocktakeProductId));
  const stocktakeBookStock = selectedStocktakeProduct?.currentStock ?? 0;
  const normalizedStocktakeActual = Number.isFinite(Number(stocktakeActualStock)) ? Number(stocktakeActualStock) : 0;
  const stocktakeDiff = normalizedStocktakeActual - stocktakeBookStock;
  const stocktakeDiffAmount = stocktakeDiff * Number(selectedStocktakeProduct?.costPrice ?? 0);

  useEffect(() => {
    if (!selectedInboundProduct) {
      setValue('unitCost', 0);
      setValue('supplier', '');
      return;
    }
    setValue('unitCost', Number(selectedInboundProduct.costPrice ?? 0), { shouldValidate: true });
    setValue('supplier', selectedInboundProduct.supplier ?? '');
  }, [selectedInboundProduct, setValue]);

  useEffect(() => {
    setValue('totalAmount', inboundTotalAmount, { shouldValidate: true });
  }, [inboundTotalAmount, setValue]);

  useEffect(() => {
    if (!stores.length) {
      void loadStores().catch(() => toast.error('门店列表加载失败'));
    }
  }, [loadStores, stores.length]);

  useEffect(() => {
    let cancelled = false;
    setCategoriesLoading(true);
    getCategories()
      .then((items) => {
        if (!cancelled) setCategories(items);
      })
      .catch(() => {
        if (!cancelled) toast.error('商品分类加载失败');
      })
      .finally(() => {
        if (!cancelled) setCategoriesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!showOutboundDialog || !outboundProductId) {
      setOutboundBatches([]);
      return;
    }
    let cancelled = false;
    setOutboundBatchesLoading(true);
    getBatches(Number(outboundProductId))
      .then((items) => {
        if (!cancelled) setOutboundBatches(items.filter((item) => Number(item.availableQty ?? 0) > 0));
      })
      .catch(() => {
        if (!cancelled) {
          setOutboundBatches([]);
          toast.error('出库批次加载失败');
        }
      })
      .finally(() => {
        if (!cancelled) setOutboundBatchesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [outboundProductId, showOutboundDialog]);

  useEffect(() => {
    if (showStocktakeDialog && selectedStocktakeProduct) {
      setStocktakeValue('actualStock', selectedStocktakeProduct.currentStock);
    }
  }, [selectedStocktakeProduct, setStocktakeValue, showStocktakeDialog]);

  const getStatusColor = (status: StockItemType['status']) => {
    switch (status) {
      case '正常': return 'bg-green-100 text-green-700';
      case '低库存': return 'bg-orange-100 text-orange-700';
      case '积压': return 'bg-blue-100 text-blue-700';
      case '缺货': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const getBatchStatusColor = (status: BatchType['status']) => {
    switch (status) {
      case '正常': return 'bg-green-100 text-green-700';
      case '临期': return 'bg-orange-100 text-orange-700';
      case '已过期': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const loadProductBatches = async (productId: number) => {
    setBatchesLoading(true);
    try {
      const items = await getBatches(productId);
      setBatches(items);
    } catch (error) {
      setBatches([]);
      toast.error(error instanceof Error ? `批次加载失败：${error.message}` : '批次加载失败');
    } finally {
      setBatchesLoading(false);
    }
  };

  const loadProductMovements = async (productId: number) => {
    setStockMovementsLoading(true);
    try {
      const result = await getStockMovements({ productId, page: 1, pageSize: 20 });
      setStockMovements(result.items);
    } catch (error) {
      setStockMovements([]);
      toast.error(error instanceof Error ? `库存流水加载失败：${error.message}` : '库存流水加载失败');
    } finally {
      setStockMovementsLoading(false);
    }
  };

  const handleViewBatch = async (product: StockItemType) => {
    setSelectedProduct(product);
    setBatches([]);
    setStockMovements([]);
    setShowBatchPanel(true);
    await Promise.all([loadProductBatches(product.id), loadProductMovements(product.id)]);
  };

  const onInboundSubmit = async (data: InboundFormData) => {
    try {
      await createInbound(data);
      toast.success('入库成功');
      setShowInboundDialog(false);
      reset(createInboundDefaultValues());
      refresh();
      if (selectedProduct?.id === data.productId) {
        await Promise.all([loadProductBatches(data.productId), loadProductMovements(data.productId)]);
      }
    } catch (err: any) {
      toast.error(err?.message || '入库操作失败');
    }
  };

  const handleCloseInbound = () => {
    setShowInboundDialog(false);
    reset(createInboundDefaultValues());
  };

  const handleCloseOutbound = () => {
    setShowOutboundDialog(false);
    resetOutbound({
      productId: 0,
      batchId: undefined,
      adjustmentType: 'manual_outbound',
      quantity: 1,
      remark: '',
    });
    setOutboundBatches([]);
  };

  const handleCloseStocktake = () => {
    setShowStocktakeDialog(false);
    resetStocktake({
      productId: 0,
      actualStock: 0,
      remark: '',
    });
  };

  const onOutboundSubmit = async (data: InventoryAdjustmentFormData) => {
    try {
      await createInventoryAdjustment(data);
      toast.success('出库已完成，库存流水已同步');
      handleCloseOutbound();
      refresh();
      if (selectedProduct?.id === data.productId) {
        await Promise.all([loadProductBatches(data.productId), loadProductMovements(data.productId)]);
      }
    } catch (err: any) {
      toast.error(err?.message || '出库操作失败');
    }
  };

  const onStocktakeSubmit = async (data: StocktakeFormData) => {
    const product = stocks.find((stock) => stock.id === Number(data.productId));
    if (!product) {
      toast.error('请选择盘点产品');
      return;
    }

    const bookStock = Number(product.currentStock ?? 0);
    const actualStock = Number(data.actualStock ?? 0);
    const diff = actualStock - bookStock;
    if (diff === 0) {
      toast.info('实盘数量与账面一致，无需生成库存调整');
      return;
    }

    const actionText = diff > 0 ? '盘盈' : '盘亏';
    const confirmed = window.confirm(`确认${actionText} ${Math.abs(diff)}？确认后将立即调整正式库存并写入盘点流水。`);
    if (!confirmed) return;

    const diffAmount = diff * Number(product.costPrice ?? 0);
    const remark = [
      `盘点任务：${actionText}`,
      `账面 ${bookStock}`,
      `实盘 ${actualStock}`,
      `差异 ${diff}`,
      `差异金额 ${diffAmount.toFixed(2)}`,
      data.remark,
    ].filter(Boolean).join('；');

    try {
      await createInventoryAdjustment({
        productId: data.productId,
        adjustmentType: diff > 0 ? 'stocktake_gain' : 'stocktake_loss',
        quantity: Math.abs(diff),
        remark,
      });
      toast.success('盘点确认成功，库存和流水已同步');
      handleCloseStocktake();
      refresh();
      if (selectedProduct?.id === data.productId) {
        await Promise.all([loadProductBatches(data.productId), loadProductMovements(data.productId)]);
      }
    } catch (err: any) {
      toast.error(err?.message || '盘点确认失败');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <div className="text-sm text-muted-foreground">
        首页 / 库存管理 / 库存管理
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <select
            className="h-10 min-w-36 rounded-lg border border-border bg-input-background px-3 text-sm shadow-sm outline-none transition focus:border-ring focus:ring-3 focus:ring-ring/20"
            value={selectedStoreId}
            onChange={(e) => setSelectedStoreId(e.target.value)}
          >
            <option value="">全部门店</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>{store.name}</option>
            ))}
          </select>
          
          <select
            className="h-10 min-w-32 rounded-lg border border-border bg-input-background px-3 text-sm shadow-sm outline-none transition focus:border-ring focus:ring-3 focus:ring-ring/20"
            value={selectedCategoryId}
            onChange={(e) => setSelectedCategoryId(e.target.value)}
            disabled={categoriesLoading}
          >
            <option value="">{categoriesLoading ? '分类加载中...' : '全部分类'}</option>
            {flatCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.parentId ? `-- ${category.name}` : category.name}
              </option>
            ))}
          </select>
          
          <select
            className="h-10 min-w-32 rounded-lg border border-border bg-input-background px-3 text-sm shadow-sm outline-none transition focus:border-ring focus:ring-3 focus:ring-ring/20"
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
            className="min-w-48 flex-1 xl:max-w-72"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
          />
        </div>
        
        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <Button variant="outline" className="gap-2" onClick={() => exportToExcel(stocks, STOCK_EXPORT_COLUMNS, '库存报表')}>
            <Download className="w-4 h-4" /> 导出报表
          </Button>
          {canCreateAdjustment && (
            <Button variant="outline" className="gap-2" onClick={() => setShowOutboundDialog(true)}>
              <PackageMinus className="w-4 h-4" /> 出库
            </Button>
          )}
          {canConfirmStocktake && (
            <Button variant="outline" className="gap-2" onClick={() => setShowStocktakeDialog(true)}>
              <ClipboardList className="w-4 h-4" /> 盘点
            </Button>
          )}
          {canCreateInbound && (
            <Button className="gap-2" onClick={() => setShowInboundDialog(true)}>
              <PackagePlus className="w-4 h-4" /> 入库
            </Button>
          )}
        </div>
      </div>

      {/* Stock Table */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">加载中...</span>
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
                {batchesLoading && (
                  <div className="flex items-center justify-center py-8 text-sm text-gray-500">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    正在加载真实批次...
                  </div>
                )}
                {!batchesLoading && batches.length === 0 && (
                  <div className="rounded-lg border border-dashed border-gray-300 py-8 text-center text-sm text-gray-500">
                    当前商品暂无批次记录。
                  </div>
                )}
                {!batchesLoading && batches.map((batch) => (
                  <div key={batch.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="font-mono text-sm font-medium text-gray-800">{batch.batchNo}</div>
                        <div className="text-xs text-gray-500 mt-1">入库日期: {formatDate(batch.inboundDate)}</div>
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
                        <div className="text-gray-700">{formatDate(batch.productionDate)}</div>
                      </div>
                      <div className="col-span-3">
                        <div className="text-gray-500 text-xs">过期日期</div>
                        <div className="text-gray-700">{formatDate(batch.expiryDate)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-gray-200 p-6">
              <div className="mb-4 flex items-center justify-between">
                <h4 className="font-medium text-gray-800">库存流水追溯</h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void loadProductMovements(selectedProduct.id)}
                  disabled={stockMovementsLoading}
                >
                  {stockMovementsLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  刷新流水
                </Button>
              </div>
              {stockMovementsLoading && (
                <div className="flex items-center justify-center py-8 text-sm text-gray-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  正在加载真实库存流水...
                </div>
              )}
              {!stockMovementsLoading && stockMovements.length === 0 && (
                <div className="rounded-lg border border-dashed border-gray-300 py-8 text-center text-sm text-gray-500">
                  当前商品暂无库存流水。
                </div>
              )}
              {!stockMovementsLoading && stockMovements.length > 0 && (
                <div className="space-y-3">
                  {stockMovements.map((movement) => (
                    <div key={movement.id} className="rounded-lg border border-gray-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-gray-800">{formatMovementType(movement.movementType)}</div>
                          <div className="mt-1 font-mono text-xs text-gray-500">{movement.movementNo}</div>
                        </div>
                        <div className={`text-sm font-semibold ${movement.quantity >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {movement.quantity > 0 ? '+' : ''}{movement.quantity} {movement.unit || ''}
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <div className="text-xs text-gray-500">库存变化</div>
                          <div className="text-gray-700">{movement.beforeStock ?? '-'} → {movement.afterStock ?? '-'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">批次</div>
                          <div className="text-gray-700">{movement.batchNo || '-'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">来源</div>
                          <div className="text-gray-700">{movement.sourceNo || movement.sourceType || '-'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">操作人</div>
                          <div className="text-gray-700">{movement.operatorName || '-'}</div>
                        </div>
                        <div className="col-span-2">
                          <div className="text-xs text-gray-500">时间 / 备注</div>
                          <div className="text-gray-700">{formatDateTime(movement.occurredAt || movement.createdAt)}{movement.remark ? `；${movement.remark}` : ''}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">成本单价</label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="自动读取商品成本价"
                    {...register('unitCost', { valueAsNumber: true })}
                  />
                  <p className="text-xs text-gray-500 mt-1">选择产品后自动填入，可按本次入库成本修正</p>
                  {errors.unitCost && <p className="text-red-500 text-xs mt-1">{errors.unitCost.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">订单总价</label>
                  <Input
                    value={inboundTotalAmount.toFixed(2)}
                    readOnly
                    className="bg-gray-50"
                  />
                  <p className="text-xs text-gray-500 mt-1">按入库数量 x 成本单价自动计算</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">供应商</label>
                <Input
                  placeholder="选择产品后自动带出供应商"
                  {...register('supplier')}
                />
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
      <Dialog open={showOutboundDialog} onOpenChange={(open) => open ? setShowOutboundDialog(true) : handleCloseOutbound()}>
        <DialogContent className="max-w-xl" aria-describedby="outbound-description">
          <DialogHeader>
            <DialogTitle>产品出库</DialogTitle>
          </DialogHeader>
          <span id="outbound-description" className="sr-only">记录产品出库信息</span>
          <form onSubmit={handleSubmitOutbound(onOutboundSubmit)}>
            <div className="space-y-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  选择产品 <span className="text-red-500">*</span>
                </label>
                <select
                  className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md"
                  {...registerOutbound('productId', { valueAsNumber: true })}
                >
                  <option value={0}>请选择产品</option>
                  {stocks.map((stock) => (
                    <option key={stock.id} value={stock.id}>
                      {stock.productName} ({stock.sku})
                    </option>
                  ))}
                </select>
                {outboundErrors.productId && <p className="text-red-500 text-xs mt-1">{outboundErrors.productId.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">出库批次</label>
                <select
                  className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md"
                  disabled={!outboundProductId || outboundBatchesLoading}
                  {...registerOutbound('batchId', { valueAsNumber: true })}
                >
                  <option value={0}>
                    {outboundBatchesLoading ? '批次加载中...' : '不指定批次'}
                  </option>
                  {outboundBatches.map((batch) => (
                    <option key={batch.id} value={batch.id}>
                      {batch.batchNo} / 可用 {batch.availableQty} / 到期 {formatDate(batch.expiryDate)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  出库数量 <span className="text-red-500">*</span>
                </label>
                <Input
                  type="number"
                  min={0.01}
                  step="0.01"
                  placeholder="请输入出库数量"
                  {...registerOutbound('quantity', { valueAsNumber: true })}
                />
                <p className="text-xs text-gray-500 mt-1">可用库存: {selectedOutboundProduct?.availableStock ?? '-'}</p>
                {outboundErrors.quantity && <p className="text-red-500 text-xs mt-1">{outboundErrors.quantity.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  出库类型 <span className="text-red-500">*</span>
                </label>
                <select
                  className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md"
                  {...registerOutbound('adjustmentType')}
                >
                  <option value="manual_outbound">手工出库</option>
                  <option value="scrap_out">报废出库</option>
                </select>
                {outboundErrors.adjustmentType && <p className="text-red-500 text-xs mt-1">{outboundErrors.adjustmentType.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
                <textarea
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
                  rows={3}
                  placeholder="请输入出库备注"
                  {...registerOutbound('remark')}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <Button type="button" variant="outline" onClick={handleCloseOutbound}>
                取消
              </Button>
              <Button type="submit" disabled={outboundSubmitting}>
                {outboundSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                确认出库
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Stocktake Dialog */}
      <Dialog open={showStocktakeDialog} onOpenChange={(open) => open ? setShowStocktakeDialog(true) : handleCloseStocktake()}>
        <DialogContent className="max-w-xl" aria-describedby="stocktake-description">
          <DialogHeader>
            <DialogTitle>创建盘点任务</DialogTitle>
          </DialogHeader>
          <span id="stocktake-description" className="sr-only">录入实盘数量并确认盘盈盘亏</span>
          <form onSubmit={handleSubmitStocktake(onStocktakeSubmit)}>
            <div className="space-y-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  盘点产品 <span className="text-red-500">*</span>
                </label>
                <select
                  className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md"
                  {...registerStocktake('productId', { valueAsNumber: true })}
                >
                  <option value={0}>请选择产品</option>
                  {stocks.map((stock) => (
                    <option key={stock.id} value={stock.id}>
                      {stock.productName} ({stock.sku})
                    </option>
                  ))}
                </select>
                {stocktakeErrors.productId && <p className="text-red-500 text-xs mt-1">{stocktakeErrors.productId.message}</p>}
              </div>

              <div className="grid grid-cols-3 gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
                <div>
                  <div className="text-xs text-gray-500">账面数量</div>
                  <div className="font-semibold text-gray-800">{selectedStocktakeProduct ? stocktakeBookStock : '-'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">单位成本</div>
                  <div className="font-semibold text-gray-800">
                    {selectedStocktakeProduct ? `¥${Number(selectedStocktakeProduct.costPrice ?? 0).toFixed(2)}` : '-'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">库存状态</div>
                  <div className="font-semibold text-gray-800">{selectedStocktakeProduct?.status ?? '-'}</div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  实盘数量 <span className="text-red-500">*</span>
                </label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="请输入实盘数量"
                  {...registerStocktake('actualStock', { valueAsNumber: true })}
                />
                {stocktakeErrors.actualStock && <p className="text-red-500 text-xs mt-1">{stocktakeErrors.actualStock.message}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm">
                <div>
                  <div className="text-xs text-blue-600">差异数量</div>
                  <div className={`font-semibold ${stocktakeDiff < 0 ? 'text-red-600' : stocktakeDiff > 0 ? 'text-green-600' : 'text-gray-700'}`}>
                    {selectedStocktakeProduct ? stocktakeDiff : '-'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-blue-600">差异金额</div>
                  <div className={`font-semibold ${stocktakeDiffAmount < 0 ? 'text-red-600' : stocktakeDiffAmount > 0 ? 'text-green-600' : 'text-gray-700'}`}>
                    {selectedStocktakeProduct ? `¥${stocktakeDiffAmount.toFixed(2)}` : '-'}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">差异原因</label>
                <textarea
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
                  rows={3}
                  placeholder="请输入盘点差异原因或备注"
                  {...registerStocktake('remark')}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <Button type="button" variant="outline" onClick={handleCloseStocktake}>
                取消
              </Button>
              <Button type="submit" disabled={stocktakeSubmitting}>
                {stocktakeSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                确认盘点
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
