import { useEffect, useMemo, useState } from 'react';
import { Plus, Sparkles, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { Button, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/UI';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { transferSchema, type TransferFormData } from '@/schemas/inventory';
import { createTransfer, getStockItems, getTransferOrdersPaginated, getTransferSuggestions } from '@/api/inventory';
import { useStoreStore } from '@/stores/storeStore';
import type { StockItem, TransferOrder, TransferSuggestion } from '@/types';
import { toast } from 'sonner';

interface StockComparison {
  productId?: number;
  productName: string;
  sku: string;
  categoryName?: string;
  store1: number;
  store2: number;
  store1Status: StockItem['status'] | '无商品';
  store2Status: StockItem['status'] | '无商品';
  store1Item?: StockItem;
  store2Item?: StockItem;
}

const TRANSFER_DEFAULT_VALUES: TransferFormData = {
  fromStoreId: 0,
  toStoreId: 0,
  items: [{ productId: 0, quantity: 1 }],
  reason: '',
  status: 'pending',
};

export function StoreTransfer() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'comparison' | 'transfer'>('comparison');
  const [selectedStores, setSelectedStores] = useState<[number, number]>([0, 1]);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [transfers, setTransfers] = useState<TransferOrder[]>([]);
  const [transferSuggestions, setTransferSuggestions] = useState<TransferSuggestion[]>([]);
  const [transferLoading, setTransferLoading] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonItems, setComparisonItems] = useState<StockComparison[]>([]);
  const [comparisonKeyword, setComparisonKeyword] = useState('');
  const [comparisonCategory, setComparisonCategory] = useState('全部分类');
  const [comparisonStatus, setComparisonStatus] = useState('全部状态');
  const [availableProducts, setAvailableProducts] = useState<StockItem[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const { stores, currentStoreId, loadStores } = useStoreStore();

  const storeOptions = stores;
  const firstStore = storeOptions[selectedStores[0]];
  const secondStore = storeOptions[selectedStores[1]];

  const defaultFromStoreId = useMemo(() => currentStoreId ?? storeOptions[0]?.id ?? 0, [currentStoreId, storeOptions]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setValue,
    watch,
  } = useForm<TransferFormData>({
    resolver: zodResolver(transferSchema),
    defaultValues: TRANSFER_DEFAULT_VALUES,
  });

  const watchedFromStoreId = watch('fromStoreId');

  const loadTransfers = async () => {
    setTransferLoading(true);
    try {
      const response = await getTransferOrdersPaginated({ page: 1, pageSize: 50 });
      setTransfers(response.items);
    } catch (err: any) {
      toast.error(err?.message || '加载调拨单失败');
      setTransfers([]);
    } finally {
      setTransferLoading(false);
    }
  };

  const loadTransferSuggestions = async () => {
    setSuggestionsLoading(true);
    try {
      const items = await getTransferSuggestions();
      setTransferSuggestions(items);
    } catch (err: any) {
      toast.error(err?.message || '加载调拨建议失败');
      setTransferSuggestions([]);
    } finally {
      setSuggestionsLoading(false);
    }
  };

  useEffect(() => {
    void loadStores();
    void loadTransfers();
    void loadTransferSuggestions();
  }, [loadStores]);

  useEffect(() => {
    if (storeOptions.length >= 2 && (!firstStore || !secondStore)) {
      setSelectedStores([0, 1]);
    }
  }, [firstStore, secondStore, storeOptions.length]);

  useEffect(() => {
    if (firstStore?.id && secondStore?.id && firstStore.id === secondStore.id) {
      const nextIndex = storeOptions.findIndex((store) => store.id !== firstStore.id);
      if (nextIndex >= 0) setSelectedStores([selectedStores[0], nextIndex]);
    }
  }, [firstStore?.id, secondStore?.id, selectedStores, storeOptions]);

  useEffect(() => {
    if (activeTab !== 'comparison' || !firstStore?.id || !secondStore?.id || firstStore.id === secondStore.id) {
      setComparisonItems([]);
      return;
    }

    let cancelled = false;
    setComparisonLoading(true);
    Promise.all([
      getStockItems({ storeId: firstStore.id }),
      getStockItems({ storeId: secondStore.id }),
    ])
      .then(([firstItems, secondItems]) => {
        if (cancelled) return;
        const bySku = new Map<string, { first?: StockItem; second?: StockItem }>();
        firstItems.forEach((item) => {
          if (!item.sku) return;
          bySku.set(item.sku, { ...(bySku.get(item.sku) ?? {}), first: item });
        });
        secondItems.forEach((item) => {
          if (!item.sku) return;
          bySku.set(item.sku, { ...(bySku.get(item.sku) ?? {}), second: item });
        });
        const nextItems = Array.from(bySku.entries())
          .map(([sku, pair]) => {
            const source = pair.first ?? pair.second;
            return {
              productId: pair.first?.id,
              productName: source?.productName ?? '',
              sku,
              categoryName: source?.categoryName,
              store1: pair.first?.currentStock ?? 0,
              store2: pair.second?.currentStock ?? 0,
              store1Status: pair.first?.status ?? '无商品',
              store2Status: pair.second?.status ?? '无商品',
              store1Item: pair.first,
              store2Item: pair.second,
            } satisfies StockComparison;
          })
          .sort((a, b) => a.productName.localeCompare(b.productName, 'zh-CN'));
        setComparisonItems(nextItems);
      })
      .catch((err: any) => {
        if (!cancelled) {
          toast.error(err?.message || '加载库存对比失败');
          setComparisonItems([]);
        }
      })
      .finally(() => {
        if (!cancelled) setComparisonLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, firstStore?.id, secondStore?.id]);

  const comparisonCategories = useMemo(() => {
    const categories = new Set(comparisonItems.map((item) => item.categoryName).filter(Boolean));
    return ['全部分类', ...Array.from(categories) as string[]];
  }, [comparisonItems]);

  const filteredComparisonItems = useMemo(() => {
    const keyword = comparisonKeyword.trim().toLowerCase();
    return comparisonItems.filter((item) => {
      const matchesKeyword = !keyword
        || item.productName.toLowerCase().includes(keyword)
        || item.sku.toLowerCase().includes(keyword);
      const matchesCategory = comparisonCategory === '全部分类' || item.categoryName === comparisonCategory;
      const matchesStatus = comparisonStatus === '全部状态'
        || item.store1Status === comparisonStatus
        || item.store2Status === comparisonStatus;
      return matchesKeyword && matchesCategory && matchesStatus;
    });
  }, [comparisonCategory, comparisonItems, comparisonKeyword, comparisonStatus]);

  useEffect(() => {
    if (searchParams.get('source') !== 'expiry' || !storeOptions.length) return;
    const fromStoreId = Number(searchParams.get('fromStoreId') || defaultFromStoreId);
    const toStoreId = storeOptions.find((store) => store.id !== fromStoreId)?.id ?? 0;
    reset({
      ...TRANSFER_DEFAULT_VALUES,
      fromStoreId,
      toStoreId,
      reason: searchParams.get('reason') || '临期库存调拨',
    });
    setActiveTab('transfer');
    setShowTransferDialog(true);
  }, [defaultFromStoreId, reset, searchParams, storeOptions]);

  useEffect(() => {
    const storeId = Number(watchedFromStoreId);
    if (!showTransferDialog || !storeId) {
      setAvailableProducts([]);
      return;
    }

    let cancelled = false;
    setProductsLoading(true);
    getStockItems({ storeId })
      .then((items) => {
        if (!cancelled) setAvailableProducts(items.filter((item) => item.currentStock > 0));
      })
      .catch((err: any) => {
        if (!cancelled) {
          toast.error(err?.message || '加载调出门店库存失败');
          setAvailableProducts([]);
        }
      })
      .finally(() => {
        if (!cancelled) setProductsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [showTransferDialog, watchedFromStoreId]);

  useEffect(() => {
    if (searchParams.get('source') !== 'expiry' || !showTransferDialog || productsLoading) return;
    const productId = Number(searchParams.get('productId') || 0);
    const quantity = Math.max(1, Number(searchParams.get('quantity') || 1));
    if (productId) setValue('items.0.productId', productId);
    setValue('items.0.quantity', quantity);
    setSearchParams({}, { replace: true });
  }, [productsLoading, searchParams, setSearchParams, setValue, showTransferDialog]);

  const handleOpenTransferDialog = () => {
    reset({
      ...TRANSFER_DEFAULT_VALUES,
      fromStoreId: defaultFromStoreId,
      toStoreId: storeOptions.find((store) => store.id !== defaultFromStoreId)?.id ?? 0,
    });
    setShowTransferDialog(true);
  };

  const onSubmit = async (data: TransferFormData) => {
    try {
      await createTransfer(data);
      toast.success('调拨申请创建成功');
      await loadTransfers();
      setShowTransferDialog(false);
    } catch (err: any) {
      toast.error(err?.message || '创建调拨申请失败');
    }
  };

  const getStockStatusColor = (status: StockComparison['store1Status']) => {
    switch (status) {
      case '正常':
        return 'bg-green-100 text-green-700';
      case '低库存':
        return 'bg-orange-100 text-orange-700';
      case '缺货':
        return 'bg-red-100 text-red-700';
      case '积压':
        return 'bg-purple-100 text-purple-700';
      case '无商品':
        return 'bg-gray-100 text-gray-500';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  const handleCreateTransferFromComparison = (item: StockComparison) => {
    const fromFirstStore = item.store1 >= item.store2;
    const fromStore = fromFirstStore ? firstStore : secondStore;
    const toStore = fromFirstStore ? secondStore : firstStore;
    const fromItem = fromFirstStore ? item.store1Item : item.store2Item;
    if (!fromStore?.id || !toStore?.id || !fromItem?.id) {
      toast.error('缺少可调拨商品，无法生成调拨草稿');
      return;
    }
    const diff = Math.abs(item.store1 - item.store2);
    reset({
      ...TRANSFER_DEFAULT_VALUES,
      fromStoreId: fromStore.id,
      toStoreId: toStore.id,
      items: [{ productId: fromItem.id, quantity: Math.max(1, Math.floor(diff / 2) || 1) }],
      reason: `${item.productName} 两店库存差异调拨`,
    });
    setActiveTab('transfer');
    setShowTransferDialog(true);
  };

  const handleAcceptTransferSuggestion = (suggestion: TransferSuggestion) => {
    reset({
      ...TRANSFER_DEFAULT_VALUES,
      fromStoreId: suggestion.fromStoreId,
      toStoreId: suggestion.toStoreId,
      items: [{ productId: suggestion.productId, quantity: Math.max(1, suggestion.suggestedQty) }],
      reason: suggestion.reason,
    });
    setActiveTab('transfer');
    setShowTransferDialog(true);
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
      <div className="text-sm text-gray-500">
        首页 / 库存管理 / 门店库存与调拨
      </div>

      <h2 className="text-xl font-semibold text-gray-800">门店库存与调拨</h2>

      <div className="relative">
        <div className="flex items-center gap-4 overflow-x-auto pb-4">
          {storeOptions.map((store) => (
            <div
              key={store.id}
              className="min-w-[280px] bg-white border border-gray-200 rounded-lg p-5 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-800">{store.name}</h3>
                  <p className="text-xs text-gray-500 mt-1">{store.address || store.city || '-'}</p>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  store.mode === '集中'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-purple-100 text-purple-700'
                }`}>
                  {store.mode || '独立'}采购
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <div className="text-xs text-gray-500">SKU数</div>
                  <div className="font-semibold text-gray-800">{store.skuCount ?? 0}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">库存总值</div>
                  <div className="font-semibold text-gray-800">¥{((store.totalValue ?? 0) / 1000).toFixed(1)}K</div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500">健康度</span>
                  <span className={`text-sm font-semibold ${
                    (store.healthScore ?? 0) >= 90
                      ? 'text-green-600'
                      : (store.healthScore ?? 0) >= 80
                      ? 'text-blue-600'
                      : 'text-orange-600'
                  }`}>
                    {store.healthScore ?? 0}分
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      (store.healthScore ?? 0) >= 90
                        ? 'bg-green-500'
                        : (store.healthScore ?? 0) >= 80
                        ? 'bg-blue-500'
                        : 'bg-orange-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, store.healthScore ?? 0))}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
          {!storeOptions.length && (
            <div className="text-sm text-gray-500">暂无可用门店</div>
          )}
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

      {activeTab === 'comparison' && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">对比门店:</span>
              <select
                className="h-9 px-3 text-sm border border-gray-300 rounded-md"
                value={selectedStores[0]}
                onChange={(e) => setSelectedStores([parseInt(e.target.value, 10), selectedStores[1]])}
              >
                {storeOptions.map((store, index) => (
                  <option key={store.id} value={index}>{store.name}</option>
                ))}
              </select>
              <span className="text-gray-400">vs</span>
              <select
                className="h-9 px-3 text-sm border border-gray-300 rounded-md"
                value={selectedStores[1]}
                onChange={(e) => setSelectedStores([selectedStores[0], parseInt(e.target.value, 10)])}
              >
                {storeOptions.map((store, index) => (
                  <option key={store.id} value={index}>{store.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <input
                className="h-9 w-48 rounded-md border border-gray-300 px-3 text-sm"
                placeholder="搜索 SKU / 商品"
                value={comparisonKeyword}
                onChange={(event) => setComparisonKeyword(event.target.value)}
              />
              <select
                className="h-9 px-3 text-sm border border-gray-300 rounded-md"
                value={comparisonCategory}
                onChange={(event) => setComparisonCategory(event.target.value)}
              >
                {comparisonCategories.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
              <select
                className="h-9 px-3 text-sm border border-gray-300 rounded-md"
                value={comparisonStatus}
                onChange={(event) => setComparisonStatus(event.target.value)}
              >
                <option>全部状态</option>
                <option>正常</option>
                <option>低库存</option>
                <option>缺货</option>
                <option>积压</option>
                <option>无商品</option>
              </select>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/80">
                <TableHead>产品名称</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead colSpan={2} className="text-center border-r border-gray-200">
                  {firstStore?.name ?? '门店 A'}
                </TableHead>
                <TableHead colSpan={2} className="text-center">
                  {secondStore?.name ?? '门店 B'}
                </TableHead>
              </TableRow>
              <TableRow className="bg-gray-50/80">
                <TableHead></TableHead>
                <TableHead></TableHead>
                <TableHead className="text-center">库存</TableHead>
                <TableHead className="text-center border-r border-gray-200">状态</TableHead>
                <TableHead className="text-center">库存</TableHead>
                <TableHead className="text-center">状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredComparisonItems.map((item) => (
                <TableRow key={item.sku} className="hover:bg-blue-50/30">
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
                  <TableCell className="text-right">
                    <button className="text-blue-500 hover:text-blue-600 text-sm" onClick={() => handleCreateTransferFromComparison(item)}>
                      调拨
                    </button>
                  </TableCell>
                </TableRow>
              ))}
              {comparisonLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-gray-500 py-8">
                    库存矩阵加载中...
                  </TableCell>
                </TableRow>
              )}
              {!comparisonLoading && storeOptions.length < 2 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-gray-500 py-8">
                    暂无可对比的多门店数据
                  </TableCell>
                </TableRow>
              )}
              {!comparisonLoading && storeOptions.length >= 2 && filteredComparisonItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-gray-500 py-8">
                    当前筛选下暂无真实库存对比数据
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </>
      )}

      {activeTab === 'transfer' && (
        <>
          <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center text-white shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-gray-800">AI调拨建议</h3>
            </div>

            <div className="space-y-3">
              {suggestionsLoading && (
                <div className="bg-white rounded-lg p-4 text-sm text-gray-500">调拨建议加载中...</div>
              )}
              {!suggestionsLoading && transferSuggestions.length === 0 && (
                <div className="bg-white rounded-lg p-4 text-sm text-gray-500">
                  暂无真实调拨建议。只有同 SKU 同时满足“目标门店低于安全库存、来源门店高于安全库存 4 倍”时才生成建议。
                </div>
              )}
              {!suggestionsLoading && transferSuggestions.map((suggestion) => (
                <div key={suggestion.id} className="bg-white rounded-lg border border-purple-100 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-medium text-gray-800">{suggestion.productName}</div>
                      <div className="mt-1 text-xs text-gray-500">
                          {suggestion.fromStoreName} → {suggestion.toStoreName} / {suggestion.sku}
                      </div>
                      <div className="mt-2 text-sm text-gray-600">{suggestion.reason}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-500">建议调拨</div>
                      <div className="text-lg font-semibold text-purple-700">{suggestion.suggestedQty}{suggestion.unit ?? ''}</div>
                      <button className="mt-2 text-sm text-blue-600 hover:text-blue-700" onClick={() => handleAcceptTransferSuggestion(suggestion)}>
                        采纳为草稿
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

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
                  <TableCell>{transfer.fromStore || '-'}</TableCell>
                  <TableCell>{transfer.toStore || '-'}</TableCell>
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
              {!transferLoading && transfers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-gray-500 py-8">
                    暂无调拨单
                  </TableCell>
                </TableRow>
              )}
              {transferLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-gray-500 py-8">
                    调拨单加载中...
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </>
      )}

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
                <select className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md" {...register('fromStoreId', { valueAsNumber: true })}>
                  <option value={0}>请选择</option>
                  {storeOptions.map((store) => (
                    <option key={store.id} value={store.id}>{store.name}</option>
                  ))}
                </select>
                {errors.fromStoreId && <p className="text-red-500 text-xs mt-1">{errors.fromStoreId.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  调入门店 <span className="text-red-500">*</span>
                </label>
                <select className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md" {...register('toStoreId', { valueAsNumber: true })}>
                  <option value={0}>请选择</option>
                  {storeOptions.map((store) => (
                    <option key={store.id} value={store.id}>{store.name}</option>
                  ))}
                </select>
                {errors.toStoreId && <p className="text-red-500 text-xs mt-1">{errors.toStoreId.message}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                调拨产品 <span className="text-red-500">*</span>
              </label>
              <select className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md" {...register('items.0.productId', { valueAsNumber: true })}>
                <option value={0}>{productsLoading ? '加载中...' : '请选择产品'}</option>
                {availableProducts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.productName} ({item.sku}) / 可用 {item.availableStock}
                  </option>
                ))}
              </select>
              {errors.items?.[0]?.productId && <p className="text-red-500 text-xs mt-1">{errors.items[0].productId.message}</p>}
              {!productsLoading && watchedFromStoreId > 0 && availableProducts.length === 0 && (
                <p className="text-gray-500 text-xs mt-1">当前调出门店暂无可调拨库存</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                调拨数量 <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min={1}
                className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md"
                {...register('items.0.quantity', { valueAsNumber: true })}
              />
              {errors.items?.[0]?.quantity && <p className="text-red-500 text-xs mt-1">{errors.items[0].quantity.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                创建方式 <span className="text-red-500">*</span>
              </label>
              <select className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md" {...register('status')}>
                <option value="pending">仅创建调拨申请，不改库存</option>
                <option value="completed">创建并完成调拨，立即调整两店库存</option>
              </select>
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
            <Button type="submit" disabled={isSubmitting || productsLoading}>
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
