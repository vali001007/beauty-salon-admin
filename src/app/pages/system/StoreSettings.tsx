import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit, MapPin, Phone, Clock, Users, Package, TrendingUp, Eye, Loader2 } from 'lucide-react';
import { Button, Input } from '../../components/UI';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { storeSchema, type StoreFormData } from '@/schemas/system';
import { getStores, createStore, updateStore } from '@/api/store';
import { toast } from 'sonner';
import type { Store } from '@/types';

export function StoreSettings() {
  const [stores, setStores] = useState<Store[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [dialogMode, setDialogMode] = useState<'add' | 'edit'>('add');
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm<StoreFormData>({
    resolver: zodResolver(storeSchema),
  });

  const loadStores = useCallback(async () => {
    try {
      const data = await getStores();
      setStores(data);
    } catch {
      toast.error('加载门店列表失败');
    }
  }, []);

  useEffect(() => { loadStores(); }, [loadStores]);

  const handleAdd = () => {
    setDialogMode('add');
    setSelectedStore(null);
    reset({ name: '', address: '', mode: '集中' });
    setShowDialog(true);
  };

  const handleEdit = (store: Store) => {
    setDialogMode('edit');
    setSelectedStore(store);
    reset({ name: store.name, address: store.address, mode: store.mode });
    setShowDialog(true);
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setSelectedStore(null);
    reset();
  };

  const onSubmit = async (data: StoreFormData) => {
    try {
      if (dialogMode === 'edit' && selectedStore) {
        await updateStore(selectedStore.id, {
          name: data.name,
          address: data.address,
          mode: data.mode,
        });
        toast.success('门店更新成功');
      } else {
        await createStore({
          name: data.name,
          address: data.address,
          mode: data.mode,
          skuCount: 0,
          totalValue: 0,
          healthScore: 0,
        });
        toast.success('门店创建成功');
      }
      handleCloseDialog();
      loadStores();
    } catch (err: any) {
      toast.error(err?.message || (dialogMode === 'edit' ? '更新门店失败' : '创建门店失败'));
    }
  };

  const handleViewDetail = (store: Store) => { setSelectedStore(store); setShowDetail(true); };

  const getStatusColor = (mode: Store['mode']) => {
    return mode === '集中' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700';
  };

  const totalEmployees = stores.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="text-sm text-gray-500">首页 / 系统设置 / 门店管理</div>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">门店管理</h2>
        <Button className="gap-2" onClick={handleAdd}><Plus className="w-4 h-4" /> 新增门店</Button>
      </div>

      {/* 统计 */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
          <div className="text-sm text-blue-600 mb-1">门店总数</div>
          <div className="text-2xl font-bold text-blue-900">{stores.length}</div>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4">
          <div className="text-sm text-green-600 mb-1">集中采购</div>
          <div className="text-2xl font-bold text-green-900">{stores.filter(s => s.mode === '集中').length}</div>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4">
          <div className="text-sm text-purple-600 mb-1">独立采购</div>
          <div className="text-2xl font-bold text-purple-900">{stores.filter(s => s.mode === '独立').length}</div>
        </div>
        <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4">
          <div className="text-sm text-orange-600 mb-1">总SKU</div>
          <div className="text-2xl font-bold text-orange-900">{stores.reduce((s, st) => s + st.skuCount, 0)}</div>
        </div>
      </div>

      {/* 门店卡片 */}
      <div className="grid grid-cols-2 gap-6">
        {stores.map((store) => (
          <div key={store.id} className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition-shadow">
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-800 text-lg">{store.name}</h3>
                  </div>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(store.mode)}`}>
                  {store.mode}采购
                </span>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                  <span className="truncate">{store.address}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 p-3 bg-gray-50 rounded-lg mb-4">
                <div className="text-center">
                  <div className="text-xs text-gray-500 mb-1">SKU</div>
                  <div className="font-semibold text-gray-800">{store.skuCount}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500 mb-1">库存价值</div>
                  <div className="font-semibold text-blue-600">¥{(store.totalValue / 10000).toFixed(1)}万</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500 mb-1">健康度</div>
                  <div className="font-semibold text-green-600">{store.healthScore}%</div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => handleViewDetail(store)}>
                  <Eye className="w-3 h-3" /> 详情
                </Button>
                <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => handleEdit(store)}>
                  <Edit className="w-3 h-3" /> 编辑
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 新增/编辑弹窗 */}
      <Dialog open={showDialog} onOpenChange={handleCloseDialog}>
        <DialogContent className="max-w-lg" aria-describedby="store-dialog-desc">
          <DialogHeader><DialogTitle>{dialogMode === 'add' ? '新增门店' : `编辑门店 — ${selectedStore?.name}`}</DialogTitle></DialogHeader>
          <span id="store-dialog-desc" className="sr-only">{dialogMode === 'add' ? '创建新门店' : '编辑门店信息'}</span>
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="space-y-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">门店名称 <span className="text-red-500">*</span></label>
                <Input placeholder="请输入门店名称" {...register('name')} />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">门店地址 <span className="text-red-500">*</span></label>
                <Input placeholder="请输入详细地址" {...register('address')} />
                {errors.address && <p className="text-red-500 text-xs mt-1">{errors.address.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">采购模式 <span className="text-red-500">*</span></label>
                <select className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md" {...register('mode')}>
                  <option value="集中">集中采购</option>
                  <option value="独立">独立采购</option>
                </select>
                {errors.mode && <p className="text-red-500 text-xs mt-1">{errors.mode.message}</p>}
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button type="button" variant="outline" onClick={handleCloseDialog}>取消</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {dialogMode === 'add' ? '创建' : '保存'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* 详情弹窗 */}
      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-w-2xl" aria-describedby="store-detail-desc">
          <DialogHeader><DialogTitle>门店详情</DialogTitle></DialogHeader>
          <span id="store-detail-desc" className="sr-only">查看门店详细信息</span>
          {selectedStore && (
            <div className="space-y-6 mt-4">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold text-gray-800">{selectedStore.name}</h3>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(selectedStore.mode)}`}>{selectedStore.mode}采购</span>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 grid grid-cols-2 gap-4">
                <div><div className="text-sm text-gray-500">门店地址</div><div className="text-sm text-gray-800 mt-1">{selectedStore.address}</div></div>
                <div><div className="text-sm text-gray-500">采购模式</div><div className="text-sm text-gray-800 mt-1">{selectedStore.mode}采购</div></div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <Package className="w-6 h-6 text-blue-600 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-blue-900">{selectedStore.skuCount}</div>
                  <div className="text-xs text-blue-600">SKU 数</div>
                </div>
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <TrendingUp className="w-6 h-6 text-green-600 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-green-900">¥{(selectedStore.totalValue / 10000).toFixed(1)}万</div>
                  <div className="text-xs text-green-600">库存价值</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-4 text-center">
                  <Users className="w-6 h-6 text-purple-600 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-purple-900">{selectedStore.healthScore}%</div>
                  <div className="text-xs text-purple-600">健康度</div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
