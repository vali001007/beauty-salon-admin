import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  Edit2,
  Loader2,
  PackageCheck,
  PackagePlus,
  Plus,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/UI';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Textarea } from '../../components/ui/textarea';
import {
  createSupplier,
  createSupplierOrder,
  deleteSupplier,
  getSupplier,
  getSupplierOrder,
  getSupplierOrdersPaginated,
  getSuppliersPaginated,
  linkSupplierProduct,
  receiveSupplierOrder,
  unlinkSupplierProduct,
  updateSupplier,
  updateSupplierOrderStatus,
} from '@/api/supply-chain';
import { getProductsPaginated } from '@/api/product';
import { usePermission } from '@/hooks/usePermission';
import { useStoreStore } from '@/stores/storeStore';
import type {
  Product,
  ProductSupplierPayload,
  ReceiveSupplierOrderPayload,
  Supplier,
  SupplierOrder,
  SupplierOrderPayload,
  SupplierOrderPayloadItem,
  SupplierOrderStatus,
  SupplierPayload,
} from '@/types';
import { formatBusinessDate } from '@/utils/businessTime';

const emptySupplierForm: SupplierPayload = {
  name: '',
  contactName: '',
  phone: '',
  email: '',
  address: '',
  category: 'skincare',
  rebateRate: 0,
  paymentTerms: '月结30天',
  status: 'active',
};

const emptyProductForm: ProductSupplierPayload = {
  productId: 0,
  supplyPrice: 0,
  moq: null,
  leadDays: null,
  isPrimary: false,
};

const categoryLabels: Record<string, string> = {
  skincare: '护肤品',
  instrument: '仪器',
  consumable: '耗材',
  equipment: '设备',
  other: '其他',
};

const supplierStatusLabels: Record<string, string> = {
  active: '合作中',
  disabled: '暂停',
  archived: '已归档',
};

const orderStatusLabels: Record<SupplierOrderStatus, string> = {
  draft: '草稿',
  pending: '待审核',
  approved: '已审核',
  ordered: '已下单',
  partial_received: '部分收货',
  received: '已收货',
  cancelled: '已取消',
  settled: '已结算',
};

const nextStatusActions: Partial<Record<SupplierOrderStatus, { label: string; next: SupplierOrderStatus; icon: typeof CheckCircle2 }>> = {
  draft: { label: '提交审核', next: 'pending', icon: ClipboardCheck },
  pending: { label: '审核通过', next: 'approved', icon: CheckCircle2 },
  approved: { label: '确认下单', next: 'ordered', icon: PackageCheck },
};

type OrderDraftItem = SupplierOrderPayloadItem & {
  key: string;
};

type ReceiveDraftItem = ReceiveSupplierOrderPayload['items'][number] & {
  key: string;
};

function formatMoney(value?: number | null) {
  return `¥${Number(value ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(value?: number | null) {
  return `${(Number(value ?? 0) * 100).toFixed(1)}%`;
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  return formatBusinessDate(value) || value.slice(0, 10);
}

function getStatusVariant(status: SupplierOrderStatus) {
  if (status === 'cancelled') return 'destructive' as const;
  if (status === 'received' || status === 'settled') return 'default' as const;
  if (status === 'partial_received' || status === 'ordered') return 'outline' as const;
  return 'secondary' as const;
}

function createDraftItem(productId = 0, quantity = 1, unitPrice = 0): OrderDraftItem {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    productId,
    quantity,
    unitPrice,
  };
}

function createReceiveDraftItem(orderItemId: number, productId: number, receivedQty: number): ReceiveDraftItem {
  return {
    key: `${orderItemId}-${Date.now()}`,
    orderItemId,
    productId,
    receivedQty,
    batchNo: '',
    productionDate: '',
    expiryDate: '',
  };
}

export function SupplierManagement({ defaultTab = 'suppliers' }: { defaultTab?: 'suppliers' | 'orders' } = {}) {
  const canManageSupply = usePermission('core:supply:manage');
  const currentStoreId = useStoreStore((state) => state.currentStoreId);
  const [keyword, setKeyword] = useState('');
  const [orderKeyword, setOrderKeyword] = useState('');
  const [orderStatus, setOrderStatus] = useState<SupplierOrderStatus | 'all'>('all');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openSupplierDialog, setOpenSupplierDialog] = useState(false);
  const [openOrderDialog, setOpenOrderDialog] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<SupplierPayload>(emptySupplierForm);
  const [detail, setDetail] = useState<Supplier | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<SupplierOrder | null>(null);
  const [productForm, setProductForm] = useState<ProductSupplierPayload>(emptyProductForm);
  const [linking, setLinking] = useState(false);
  const [orderSupplierId, setOrderSupplierId] = useState(0);
  const [orderItems, setOrderItems] = useState<OrderDraftItem[]>([createDraftItem()]);
  const [platformFee, setPlatformFee] = useState(0);
  const [rebateAmount, setRebateAmount] = useState(0);
  const [receiveItems, setReceiveItems] = useState<ReceiveDraftItem[]>([]);
  const [receiveRemark, setReceiveRemark] = useState('');
  const [receiving, setReceiving] = useState(false);

  const productOptions = useMemo(() => {
    const linked = new Set(detail?.products?.map((item) => item.productId) ?? []);
    return products.filter((product) => !linked.has(product.id));
  }, [detail?.products, products]);

  const selectedOrderSupplier = useMemo(
    () => suppliers.find((supplier) => supplier.id === orderSupplierId),
    [orderSupplierId, suppliers],
  );

  const orderProductOptions = useMemo(() => {
    const linkedProducts = selectedOrderSupplier?.products ?? [];
    if (linkedProducts.length > 0) {
      return linkedProducts.map((item) => ({
        productId: item.productId,
        name: item.productName,
        sku: item.sku ?? '',
        unit: products.find((product) => product.id === item.productId)?.specUnit ?? '',
        price: Number(item.supplyPrice ?? 0),
        moq: item.moq ?? products.find((product) => product.id === item.productId)?.minPurchaseQty ?? null,
      }));
    }
    return products.map((product) => ({
      productId: product.id,
      name: product.name,
      sku: product.sku,
      unit: product.specUnit ?? '',
      price: Number(product.costPrice ?? 0),
      moq: product.minPurchaseQty ?? null,
    }));
  }, [products, selectedOrderSupplier?.products]);

  const orderTotal = useMemo(
    () => orderItems.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0),
    [orderItems],
  );

  const orderNetAmount = Math.max(0, orderTotal + Number(platformFee || 0) - Number(rebateAmount || 0));

  const loadSuppliers = useCallback(async () => {
    setLoadingSuppliers(true);
    try {
      const page = await getSuppliersPaginated({
        page: 1,
        pageSize: 100,
        keyword: keyword.trim() || undefined,
        storeId: currentStoreId ?? null,
      });
      setSuppliers(page.items);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '供应商列表加载失败');
    } finally {
      setLoadingSuppliers(false);
    }
  }, [currentStoreId, keyword]);

  const loadOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const page = await getSupplierOrdersPaginated({
        page: 1,
        pageSize: 100,
        keyword: orderKeyword.trim() || undefined,
        status: orderStatus === 'all' ? undefined : orderStatus,
        storeId: currentStoreId ?? null,
      });
      setOrders(page.items);
      setSelectedOrder((prev) => (prev ? (page.items.find((item) => item.id === prev.id) ?? prev) : prev));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '采购单列表加载失败');
    } finally {
      setLoadingOrders(false);
    }
  }, [currentStoreId, orderKeyword, orderStatus]);

  const loadProducts = async () => {
    try {
      const page = await getProductsPaginated({ page: 1, pageSize: 300, status: 'active' });
      setProducts(page.items);
    } catch {
      toast.error('产品列表加载失败，暂时无法关联产品或创建采购单');
    }
  };

  useEffect(() => {
    void loadSuppliers();
    void loadOrders();
  }, [loadOrders, loadSuppliers]);

  useEffect(() => {
    void loadProducts();
  }, []);

  const mergeSupplierDetail = (item: Supplier) => {
    setDetail((prev) => (prev?.id === item.id ? item : prev));
    setSuppliers((prev) => {
      const exists = prev.some((supplier) => supplier.id === item.id);
      if (!exists) return [item, ...prev];
      return prev.map((supplier) => (supplier.id === item.id ? { ...supplier, ...item } : supplier));
    });
  };

  const refreshDetail = async (supplierId: number) => {
    const item = await getSupplier(supplierId);
    setDetail(item);
    setProductForm(emptyProductForm);
    mergeSupplierDetail(item);
  };

  const ensureSupplierProductsLoaded = async (supplierId: number) => {
    if (!supplierId) return;
    const cached = suppliers.find((supplier) => supplier.id === supplierId);
    if (cached?.products) return;
    try {
      const item = await getSupplier(supplierId);
      mergeSupplierDetail(item);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '供应商商品关联加载失败，暂时无法自动带入 MOQ');
    }
  };

  const openCreateSupplier = () => {
    if (!canManageSupply) {
      toast.error('当前账号没有新建供应商的权限');
      return;
    }
    setEditing(null);
    setForm({ ...emptySupplierForm, storeId: currentStoreId ?? null });
    setOpenSupplierDialog(true);
  };

  const openEditSupplier = (item: Supplier) => {
    if (!canManageSupply) {
      toast.error('当前账号没有编辑供应商的权限');
      return;
    }
    setEditing(item);
    setForm({
      storeId: item.storeId ?? currentStoreId ?? null,
      name: item.name,
      contactName: item.contactName ?? '',
      phone: item.phone ?? '',
      email: item.email ?? '',
      address: item.address ?? '',
      category: item.category || 'other',
      rebateRate: item.rebateRate ?? 0,
      paymentTerms: item.paymentTerms ?? '',
      status: item.status,
    });
    setOpenSupplierDialog(true);
  };

  const saveSupplier = async () => {
    if (!canManageSupply) {
      toast.error('当前账号没有保存供应商的权限');
      return;
    }
    if (!form.name.trim()) {
      toast.error('请填写供应商名称');
      return;
    }
    const detailId = detail?.id;
    const editingId = editing?.id;
    setSaving(true);
    try {
      const payload = {
        ...form,
        storeId: form.storeId ?? currentStoreId ?? null,
        rebateRate: Number(form.rebateRate ?? 0),
      };
      if (editing) {
        await updateSupplier(editing.id, payload);
        toast.success('供应商已更新');
      } else {
        await createSupplier(payload);
        toast.success('供应商已创建');
      }
      setOpenSupplierDialog(false);
      await loadSuppliers();
      if (detailId && detailId === editingId) await refreshDetail(detailId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存供应商失败');
    } finally {
      setSaving(false);
    }
  };

  const removeSupplier = async (item: Supplier) => {
    if (!canManageSupply) {
      toast.error('当前账号没有归档供应商的权限');
      return;
    }
    try {
      await deleteSupplier(item.id);
      toast.success('供应商已归档');
      if (detail?.id === item.id) setDetail(null);
      await loadSuppliers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '归档供应商失败');
    }
  };

  const selectSupplierDetail = async (item: Supplier) => {
    try {
      await refreshDetail(item.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '供应商详情加载失败');
    }
  };

  const linkProduct = async () => {
    if (!canManageSupply) {
      toast.error('当前账号没有维护供应商产品关联的权限');
      return;
    }
    if (!detail) return;
    if (!productForm.productId) {
      toast.error('请选择产品');
      return;
    }
    setLinking(true);
    try {
      await linkSupplierProduct(detail.id, {
        ...productForm,
        supplyPrice: Number(productForm.supplyPrice ?? 0),
        moq: productForm.moq ? Number(productForm.moq) : null,
        leadDays: productForm.leadDays ? Number(productForm.leadDays) : null,
      });
      toast.success('产品已关联');
      await refreshDetail(detail.id);
      await loadSuppliers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '关联产品失败');
    } finally {
      setLinking(false);
    }
  };

  const unlinkProduct = async (productId: number) => {
    if (!canManageSupply) {
      toast.error('当前账号没有移除供应商产品关联的权限');
      return;
    }
    if (!detail) return;
    try {
      await unlinkSupplierProduct(detail.id, productId);
      toast.success('产品关联已移除');
      await refreshDetail(detail.id);
      await loadSuppliers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '移除产品关联失败');
    }
  };

  const markPrimary = async (productId: number) => {
    if (!canManageSupply) {
      toast.error('当前账号没有设置主供应商的权限');
      return;
    }
    if (!detail) return;
    const relation = detail.products?.find((item) => item.productId === productId);
    if (!relation) return;
    try {
      await linkSupplierProduct(detail.id, {
        productId,
        supplyPrice: relation.supplyPrice,
        moq: relation.moq,
        leadDays: relation.leadDays,
        isPrimary: true,
      });
      toast.success('已设为主供应商');
      await refreshDetail(detail.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '设置主供应商失败');
    }
  };

  const openCreateOrder = () => {
    if (!canManageSupply) {
      toast.error('当前账号没有新建采购单的权限');
      return;
    }
    const firstSupplier = suppliers.find((item) => item.status === 'active') ?? suppliers[0];
    setOrderSupplierId(firstSupplier?.id ?? 0);
    setOrderItems([createDraftItem()]);
    setPlatformFee(0);
    setRebateAmount(0);
    setOpenOrderDialog(true);
    if (firstSupplier?.id) void ensureSupplierProductsLoaded(firstSupplier.id);
  };

  const updateOrderItem = (key: string, patch: Partial<OrderDraftItem>) => {
    setOrderItems((prev) =>
      prev.map((item) => {
        if (item.key !== key) return item;
        const next = { ...item, ...patch };
        if (patch.productId !== undefined) {
          const option = orderProductOptions.find((product) => product.productId === patch.productId);
          next.unitPrice = option?.price ?? 0;
          next.quantity = Math.max(1, Number(option?.moq ?? next.quantity ?? 1));
        }
        return next;
      }),
    );
  };

  const saveOrder = async () => {
    if (!canManageSupply) {
      toast.error('当前账号没有创建采购单的权限');
      return;
    }
    if (!orderSupplierId) {
      toast.error('请选择供应商');
      return;
    }
    const validItems = orderItems
      .filter((item) => item.productId && Number(item.quantity) > 0)
      .map((item) => ({
        productId: Number(item.productId),
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice ?? 0),
      }));
    const belowMoqItem = orderItems.find((item) => {
      if (!item.productId) return false;
      const option = orderProductOptions.find((product) => product.productId === Number(item.productId));
      const moq = Number(option?.moq ?? 0);
      return moq > 0 && Number(item.quantity) < moq;
    });
    if (belowMoqItem) {
      const option = orderProductOptions.find((product) => product.productId === Number(belowMoqItem.productId));
      toast.error(`${option?.name ?? '采购商品'} 起订量为 ${option?.moq}，请调整数量`);
      return;
    }
    if (validItems.length === 0) {
      toast.error('请至少添加一条采购明细');
      return;
    }
    setSaving(true);
    try {
      const payload: SupplierOrderPayload = {
        storeId: currentStoreId ?? null,
        supplierId: orderSupplierId,
        status: 'draft',
        platformFee: Number(platformFee || 0),
        rebateAmount: Number(rebateAmount || 0),
        items: validItems,
      };
      const created = await createSupplierOrder(payload);
      toast.success('采购单已创建');
      setOpenOrderDialog(false);
      setSelectedOrder(created);
      await loadOrders();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '创建采购单失败');
    } finally {
      setSaving(false);
    }
  };

  const selectOrder = async (order: SupplierOrder) => {
    try {
      const latest = await getSupplierOrder(order.id);
      setSelectedOrder(latest);
      setReceiveItems(
        latest.items
          .filter((item) => item.quantity - item.receivedQty > 0)
          .map((item) => createReceiveDraftItem(item.id, item.productId, item.quantity - item.receivedQty)),
      );
      setReceiveRemark('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '采购单详情加载失败');
    }
  };

  const advanceOrderStatus = async (order: SupplierOrder) => {
    if (!canManageSupply) {
      toast.error('当前账号没有推进采购单状态的权限');
      return;
    }
    const action = nextStatusActions[order.status];
    if (!action) return;
    try {
      const updated = await updateSupplierOrderStatus(order.id, action.next);
      toast.success(`采购单已更新为${orderStatusLabels[action.next]}`);
      setSelectedOrder(updated);
      await loadOrders();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '状态更新失败');
    }
  };

  const cancelOrder = async (order: SupplierOrder) => {
    if (!canManageSupply) {
      toast.error('当前账号没有取消采购单的权限');
      return;
    }
    try {
      const updated = await updateSupplierOrderStatus(order.id, 'cancelled');
      toast.success('采购单已取消');
      setSelectedOrder(updated);
      await loadOrders();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '取消采购单失败');
    }
  };

  const receiveOrder = async () => {
    if (!canManageSupply) {
      toast.error('当前账号没有收货入库的权限');
      return;
    }
    if (!selectedOrder) return;
    const validItems = receiveItems
      .filter((item) => item.orderItemId && Number(item.receivedQty) > 0)
      .map((item) => ({
        orderItemId: item.orderItemId,
        productId: item.productId,
        receivedQty: Number(item.receivedQty),
        batchNo: item.batchNo?.trim() || undefined,
        productionDate: item.productionDate || undefined,
        expiryDate: item.expiryDate || undefined,
      }));
    if (validItems.length === 0) {
      toast.error('请填写本次收货数量');
      return;
    }
    setReceiving(true);
    try {
      const updated = await receiveSupplierOrder(selectedOrder.id, {
        items: validItems,
        remark: receiveRemark.trim() || undefined,
      });
      toast.success('收货入库已完成，库存已同步增加');
      setSelectedOrder(updated);
      setReceiveItems(
        updated.items
          .filter((item) => item.quantity - item.receivedQty > 0)
          .map((item) => createReceiveDraftItem(item.id, item.productId, item.quantity - item.receivedQty)),
      );
      await loadOrders();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '收货入库失败');
    } finally {
      setReceiving(false);
    }
  };

  return (
    <div className="flex min-h-[680px] flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">供应链管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">维护供应商、供货价、采购单流转和采购入库。</p>
        </div>
      </div>

      <Tabs defaultValue={defaultTab} className="gap-5">
        <TabsList>
          <TabsTrigger value="suppliers">供应商</TabsTrigger>
          <TabsTrigger value="orders">采购订单</TabsTrigger>
        </TabsList>

        <TabsContent value="suppliers" className="mt-0">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
            <section className="flex min-w-0 flex-col gap-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="relative w-full max-w-sm">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="搜索供应商、联系人、电话"
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void loadSuppliers();
                    }}
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={loadSuppliers} disabled={loadingSuppliers}>
                    {loadingSuppliers ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    查询
                  </Button>
                  {canManageSupply ? (
                    <Button onClick={openCreateSupplier} className="gap-2">
                      <Plus className="h-4 w-4" />
                      新建供应商
                    </Button>
                  ) : null}
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>供应商</TableHead>
                    <TableHead>分类</TableHead>
                    <TableHead>联系人</TableHead>
                    <TableHead>返点</TableHead>
                    <TableHead>关联产品</TableHead>
                    <TableHead>状态</TableHead>
                    {canManageSupply ? <TableHead className="text-right">操作</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingSuppliers ? (
                    <TableRow>
                      <TableCell colSpan={canManageSupply ? 7 : 6} className="py-10 text-center text-muted-foreground">
                        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                        加载中
                      </TableCell>
                    </TableRow>
                  ) : suppliers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={canManageSupply ? 7 : 6} className="py-10 text-center text-muted-foreground">
                        暂无供应商
                      </TableCell>
                    </TableRow>
                  ) : (
                    suppliers.map((item) => (
                      <TableRow key={item.id} className={detail?.id === item.id ? 'bg-primary/5' : undefined}>
                        <TableCell>
                          <button type="button" className="text-left" onClick={() => selectSupplierDetail(item)}>
                            <div className="font-medium text-foreground">{item.name}</div>
                            <div className="mt-1 text-xs text-muted-foreground">{item.storeName || '全部门店'}</div>
                          </button>
                        </TableCell>
                        <TableCell>{categoryLabels[item.category || 'other'] ?? item.category ?? '-'}</TableCell>
                        <TableCell>
                          <div>{item.contactName || '-'}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{item.phone || item.email || '-'}</div>
                        </TableCell>
                        <TableCell>{formatPercent(item.rebateRate)}</TableCell>
                        <TableCell>{item.productCount ?? 0}</TableCell>
                        <TableCell>
                          <Badge variant={item.status === 'active' ? 'default' : 'secondary'}>
                            {supplierStatusLabels[item.status] ?? item.status}
                          </Badge>
                        </TableCell>
                        {canManageSupply ? (
                          <TableCell className="text-right">
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={() => openEditSupplier(item)} className="gap-1">
                                <Edit2 className="h-3.5 w-3.5" />
                                编辑
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => removeSupplier(item)} className="gap-1 text-red-600">
                                <Trash2 className="h-3.5 w-3.5" />
                                归档
                              </Button>
                            </div>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </section>

            <aside className="min-w-0 rounded-lg border border-border bg-card p-4">
              {detail ? (
                <div className="flex h-full flex-col gap-4">
                  <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
                    <div>
                      <h2 className="text-lg font-semibold">{detail.name}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">{detail.paymentTerms || '未配置账期'}</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setDetail(null)} aria-label="关闭供应商详情">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-md bg-muted/40 p-3">
                      <div className="text-muted-foreground">联系人</div>
                      <div className="mt-1 font-medium">{detail.contactName || '-'}</div>
                    </div>
                    <div className="rounded-md bg-muted/40 p-3">
                      <div className="text-muted-foreground">返点比例</div>
                      <div className="mt-1 font-medium">{formatPercent(detail.rebateRate)}</div>
                    </div>
                  </div>

                  {canManageSupply ? (
                    <div className="rounded-md border border-border p-3">
                      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                        <PackagePlus className="h-4 w-4" />
                        关联产品
                      </div>
                      <div className="space-y-2">
                        <select
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          value={productForm.productId}
                          onChange={(event) => {
                            const productId = Number(event.target.value);
                            const product = products.find((item) => item.id === productId);
                            setProductForm((prev) => ({
                              ...prev,
                              productId,
                              supplyPrice: product ? Number(product.costPrice || 0) : prev.supplyPrice,
                            }));
                          }}
                        >
                          <option value={0}>选择产品</option>
                          {productOptions.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.name} / {product.sku}
                            </option>
                          ))}
                        </select>
                        <div className="grid grid-cols-3 gap-2">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            placeholder="供货价"
                            value={productForm.supplyPrice ?? 0}
                            onChange={(event) => setProductForm((prev) => ({ ...prev, supplyPrice: Number(event.target.value) }))}
                          />
                          <Input
                            type="number"
                            min={0}
                            placeholder="MOQ"
                            value={productForm.moq ?? ''}
                            onChange={(event) => setProductForm((prev) => ({ ...prev, moq: event.target.value ? Number(event.target.value) : null }))}
                          />
                          <Input
                            type="number"
                            min={0}
                            placeholder="交期天"
                            value={productForm.leadDays ?? ''}
                            onChange={(event) => setProductForm((prev) => ({ ...prev, leadDays: event.target.value ? Number(event.target.value) : null }))}
                          />
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={Boolean(productForm.isPrimary)}
                            onChange={(event) => setProductForm((prev) => ({ ...prev, isPrimary: event.target.checked }))}
                          />
                          设为该产品主供应商
                        </label>
                        <Button className="w-full gap-2" onClick={linkProduct} disabled={linking}>
                          {linking ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
                          添加关联
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border">
                    {(detail.products ?? []).length === 0 ? (
                      <div className="py-8 text-center text-sm text-muted-foreground">暂未关联产品</div>
                    ) : (
                      <div className="divide-y divide-border">
                        {(detail.products ?? []).map((item) => (
                          <div key={item.id} className="p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="font-medium">{item.productName}</div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {item.sku || '-'} / {item.categoryName || '-'}
                                </div>
                              </div>
                              {item.isPrimary ? (
                                <Badge className="gap-1">
                                  <Star className="h-3 w-3" />
                                  主供
                                </Badge>
                              ) : canManageSupply ? (
                                <Button variant="ghost" size="sm" onClick={() => markPrimary(item.productId)} className="gap-1">
                                  <Star className="h-3.5 w-3.5" />
                                  设主供
                                </Button>
                              ) : null}
                            </div>
                            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                              <div>
                                <div className="text-muted-foreground">供货价</div>
                                <div className="mt-1 font-medium">{formatMoney(item.supplyPrice)}</div>
                              </div>
                              <div>
                                <div className="text-muted-foreground">MOQ</div>
                                <div className="mt-1 font-medium">{item.moq ?? '-'}</div>
                              </div>
                              <div>
                                <div className="text-muted-foreground">交期</div>
                                <div className="mt-1 font-medium">{item.leadDays ? `${item.leadDays} 天` : '-'}</div>
                              </div>
                            </div>
                            {canManageSupply ? (
                              <div className="mt-3 flex justify-end">
                                <Button variant="ghost" size="sm" onClick={() => unlinkProduct(item.productId)} className="gap-1 text-red-600">
                                  <Trash2 className="h-3.5 w-3.5" />
                                  移除
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex h-full min-h-[420px] items-center justify-center text-center text-sm text-muted-foreground">
                  {canManageSupply ? '选择左侧供应商查看并维护产品关联' : '选择左侧供应商查看产品关联'}
                </div>
              )}
            </aside>
          </div>
        </TabsContent>

        <TabsContent value="orders" className="mt-0">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_460px]">
            <section className="flex min-w-0 flex-col gap-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex w-full flex-wrap gap-2 md:w-auto">
                  <div className="relative w-full max-w-sm">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="搜索采购单号或供应商"
                      value={orderKeyword}
                      onChange={(event) => setOrderKeyword(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void loadOrders();
                      }}
                    />
                  </div>
                  <select
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={orderStatus}
                    onChange={(event) => setOrderStatus(event.target.value as SupplierOrderStatus | 'all')}
                  >
                    <option value="all">全部状态</option>
                    {Object.entries(orderStatusLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={loadOrders} disabled={loadingOrders}>
                    {loadingOrders ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    查询
                  </Button>
                  {canManageSupply ? (
                    <Button onClick={openCreateOrder} className="gap-2">
                      <Plus className="h-4 w-4" />
                      新建采购单
                    </Button>
                  ) : null}
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>采购单</TableHead>
                    <TableHead>供应商</TableHead>
                    <TableHead>门店</TableHead>
                    <TableHead>金额</TableHead>
                    <TableHead>收货</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingOrders ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                        加载中
                      </TableCell>
                    </TableRow>
                  ) : orders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                        暂无采购单
                      </TableCell>
                    </TableRow>
                  ) : (
                    orders.map((order) => (
                      <TableRow key={order.id} className={selectedOrder?.id === order.id ? 'bg-primary/5' : undefined}>
                        <TableCell>
                          <button type="button" className="text-left" onClick={() => selectOrder(order)}>
                            <div className="font-medium">{order.orderNo}</div>
                            <div className="mt-1 text-xs text-muted-foreground">{formatDate(order.orderedAt)}</div>
                          </button>
                        </TableCell>
                        <TableCell>{order.supplierName}</TableCell>
                        <TableCell>{order.storeName}</TableCell>
                        <TableCell>
                          <div>{formatMoney(order.netAmount)}</div>
                          <div className="mt-1 text-xs text-muted-foreground">原价 {formatMoney(order.totalAmount)}</div>
                        </TableCell>
                        <TableCell>
                          {order.receivedQuantity}/{order.totalQuantity}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusVariant(order.status)}>{orderStatusLabels[order.status]}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => selectOrder(order)}>
                            详情
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </section>

            <aside className="min-w-0 rounded-lg border border-border bg-card p-4">
              {selectedOrder ? (
                <div className="flex h-full flex-col gap-4">
                  <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold">{selectedOrder.orderNo}</h2>
                        <Badge variant={getStatusVariant(selectedOrder.status)}>{orderStatusLabels[selectedOrder.status]}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {selectedOrder.supplierName} / {selectedOrder.storeName}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setSelectedOrder(null)} aria-label="关闭采购单详情">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div className="rounded-md bg-muted/40 p-3">
                      <div className="text-muted-foreground">采购金额</div>
                      <div className="mt-1 font-medium">{formatMoney(selectedOrder.totalAmount)}</div>
                    </div>
                    <div className="rounded-md bg-muted/40 p-3">
                      <div className="text-muted-foreground">返点/优惠</div>
                      <div className="mt-1 font-medium">{formatMoney(selectedOrder.rebateAmount)}</div>
                    </div>
                    <div className="rounded-md bg-muted/40 p-3">
                      <div className="text-muted-foreground">应付金额</div>
                      <div className="mt-1 font-medium">{formatMoney(selectedOrder.netAmount)}</div>
                    </div>
                  </div>

                  <div className="rounded-md border border-border">
                    <div className="border-b border-border px-3 py-2 text-sm font-medium">采购明细</div>
                    <div className="divide-y divide-border">
                      {selectedOrder.items.map((item) => (
                        <div key={item.id} className="p-3 text-sm">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-medium">{item.productName}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {item.sku || '-'} / {item.unit || '-'}
                              </div>
                            </div>
                            <div className="text-right">
                              <div>{formatMoney(item.subtotal)}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {item.quantity} x {formatMoney(item.unitPrice)}
                              </div>
                            </div>
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">
                            已收 {item.receivedQty} / 未收 {Math.max(0, item.quantity - item.receivedQty)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {canManageSupply ? (
                    <div className="flex flex-wrap gap-2">
                      {nextStatusActions[selectedOrder.status] ? (
                        <Button onClick={() => advanceOrderStatus(selectedOrder)} className="gap-2">
                          {(() => {
                            const Icon = nextStatusActions[selectedOrder.status]?.icon ?? CheckCircle2;
                            return <Icon className="h-4 w-4" />;
                          })()}
                          {nextStatusActions[selectedOrder.status]?.label}
                        </Button>
                      ) : null}
                      {!['cancelled', 'settled', 'received'].includes(selectedOrder.status) ? (
                        <Button variant="outline" onClick={() => cancelOrder(selectedOrder)} className="text-red-600">
                          取消采购单
                        </Button>
                      ) : null}
                    </div>
                  ) : null}

                  {canManageSupply && !['cancelled', 'settled', 'received'].includes(selectedOrder.status) ? (
                    <div className="rounded-md border border-border p-3">
                      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                        <PackageCheck className="h-4 w-4" />
                        收货入库
                      </div>
                      {receiveItems.length === 0 ? (
                        <div className="rounded-md bg-muted/40 px-3 py-4 text-center text-sm text-muted-foreground">当前采购单没有待收明细</div>
                      ) : (
                        <div className="space-y-3">
                          {receiveItems.map((item) => {
                            const orderItem = selectedOrder.items.find((target) => target.id === item.orderItemId);
                            const maxQty = orderItem ? Math.max(0, orderItem.quantity - orderItem.receivedQty) : 0;
                            return (
                              <div key={item.key} className="rounded-md bg-muted/35 p-3">
                                <div className="mb-2 text-sm font-medium">{orderItem?.productName ?? '采购明细'}</div>
                                <div className="grid gap-2 md:grid-cols-2">
                                  <Input
                                    type="number"
                                    min={0}
                                    max={maxQty}
                                    value={item.receivedQty}
                                    onChange={(event) =>
                                      setReceiveItems((prev) =>
                                        prev.map((target) =>
                                          target.key === item.key ? { ...target, receivedQty: Number(event.target.value) } : target,
                                        ),
                                      )
                                    }
                                  />
                                  <Input
                                    placeholder="批次号，留空自动生成"
                                    value={item.batchNo ?? ''}
                                    onChange={(event) =>
                                      setReceiveItems((prev) =>
                                        prev.map((target) =>
                                          target.key === item.key ? { ...target, batchNo: event.target.value } : target,
                                        ),
                                      )
                                    }
                                  />
                                  <Input
                                    type="date"
                                    value={item.productionDate ?? ''}
                                    onChange={(event) =>
                                      setReceiveItems((prev) =>
                                        prev.map((target) =>
                                          target.key === item.key ? { ...target, productionDate: event.target.value } : target,
                                        ),
                                      )
                                    }
                                  />
                                  <Input
                                    type="date"
                                    value={item.expiryDate ?? ''}
                                    onChange={(event) =>
                                      setReceiveItems((prev) =>
                                        prev.map((target) =>
                                          target.key === item.key ? { ...target, expiryDate: event.target.value } : target,
                                        ),
                                      )
                                    }
                                  />
                                </div>
                                <div className="mt-2 text-xs text-muted-foreground">最多可收 {maxQty}</div>
                              </div>
                            );
                          })}
                          <Textarea
                            placeholder="收货备注"
                            value={receiveRemark}
                            onChange={(event) => setReceiveRemark(event.target.value)}
                          />
                          <Button className="w-full gap-2" onClick={receiveOrder} disabled={receiving}>
                            {receiving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
                            确认收货并入库
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="flex h-full min-h-[520px] items-center justify-center text-center text-sm text-muted-foreground">
                  {canManageSupply ? '选择左侧采购单查看明细、推进状态或收货入库' : '选择左侧采购单查看明细'}
                </div>
              )}
            </aside>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={openSupplierDialog} onOpenChange={setOpenSupplierDialog}>
        <DialogContent className="max-w-2xl" aria-describedby="supplier-dialog-desc">
          <DialogHeader>
            <DialogTitle>{editing ? '编辑供应商' : '新建供应商'}</DialogTitle>
          </DialogHeader>
          <span id="supplier-dialog-desc" className="sr-only">
            维护供应商基础资料、返点比例和账期。
          </span>
          <div className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-sm font-medium">供应商名称 *</span>
                <Input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium">分类</span>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.category ?? 'other'}
                  onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
                >
                  {Object.entries(categoryLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-sm font-medium">联系人</span>
                <Input value={form.contactName ?? ''} onChange={(event) => setForm((prev) => ({ ...prev, contactName: event.target.value }))} />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium">电话</span>
                <Input value={form.phone ?? ''} onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))} />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-sm font-medium">邮箱</span>
                <Input value={form.email ?? ''} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium">状态</span>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.status ?? 'active'}
                  onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as Supplier['status'] }))}
                >
                  <option value="active">合作中</option>
                  <option value="disabled">暂停</option>
                </select>
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-sm font-medium">返点比例</span>
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step="0.01"
                  value={form.rebateRate ?? 0}
                  onChange={(event) => setForm((prev) => ({ ...prev, rebateRate: Number(event.target.value) }))}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium">账期</span>
                <Input value={form.paymentTerms ?? ''} onChange={(event) => setForm((prev) => ({ ...prev, paymentTerms: event.target.value }))} />
              </label>
            </div>
            <label className="space-y-1.5">
              <span className="text-sm font-medium">地址</span>
              <Input value={form.address ?? ''} onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))} />
            </label>
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="outline" onClick={() => setOpenSupplierDialog(false)} disabled={saving}>
                取消
              </Button>
              <Button onClick={saveSupplier} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                保存
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openOrderDialog} onOpenChange={setOpenOrderDialog}>
        <DialogContent className="max-w-4xl" aria-describedby="order-dialog-desc">
          <DialogHeader>
            <DialogTitle>新建采购单</DialogTitle>
          </DialogHeader>
          <span id="order-dialog-desc" className="sr-only">
            选择供应商、采购产品和数量，生成供应链采购单。
          </span>
          <div className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-3">
              <label className="space-y-1.5 md:col-span-2">
                <span className="text-sm font-medium">供应商 *</span>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={orderSupplierId}
                  onChange={(event) => {
                    const supplierId = Number(event.target.value);
                    setOrderSupplierId(supplierId);
                    setOrderItems([createDraftItem()]);
                    if (supplierId) void ensureSupplierProductsLoaded(supplierId);
                  }}
                >
                  <option value={0}>选择供应商</option>
                  {suppliers
                    .filter((supplier) => supplier.status !== 'archived')
                    .map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium">采购门店</span>
                <Input value={currentStoreId ? `当前门店 #${currentStoreId}` : '全部门店/总部'} disabled />
              </label>
            </div>

            <div className="rounded-md border border-border">
              <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                <div className="text-sm font-medium">采购明细</div>
                <Button variant="outline" size="sm" onClick={() => setOrderItems((prev) => [...prev, createDraftItem()])} className="gap-1">
                  <Plus className="h-3.5 w-3.5" />
                  添加行
                </Button>
              </div>
              <div className="divide-y divide-border">
                {orderItems.map((item, index) => (
                  <div key={item.key} className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_120px_140px_120px_44px]">
                    <select
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={item.productId}
                      onChange={(event) => updateOrderItem(item.key, { productId: Number(event.target.value) })}
                    >
                      <option value={0}>选择产品</option>
                      {orderProductOptions.map((product) => (
                        <option key={product.productId} value={product.productId}>
                          {product.name} / {product.sku}
                        </option>
                      ))}
                    </select>
                    <Input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(event) => updateOrderItem(item.key, { quantity: Number(event.target.value) })}
                    />
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={item.unitPrice ?? 0}
                      onChange={(event) => updateOrderItem(item.key, { unitPrice: Number(event.target.value) })}
                    />
                    <div className="flex h-10 items-center rounded-md bg-muted/40 px-3 text-sm font-medium">
                      {formatMoney(Number(item.quantity || 0) * Number(item.unitPrice || 0))}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setOrderItems((prev) => (prev.length === 1 ? [createDraftItem()] : prev.filter((target) => target.key !== item.key)))}
                      aria-label={`删除第 ${index + 1} 行`}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="space-y-1.5">
                <span className="text-sm font-medium">平台服务费</span>
                <Input type="number" min={0} step="0.01" value={platformFee} onChange={(event) => setPlatformFee(Number(event.target.value))} />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium">返点/优惠</span>
                <Input type="number" min={0} step="0.01" value={rebateAmount} onChange={(event) => setRebateAmount(Number(event.target.value))} />
              </label>
              <div className="rounded-md bg-muted/40 p-3">
                <div className="text-sm text-muted-foreground">应付金额</div>
                <div className="mt-1 text-lg font-semibold">{formatMoney(orderNetAmount)}</div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="outline" onClick={() => setOpenOrderDialog(false)} disabled={saving}>
                取消
              </Button>
              <Button onClick={saveOrder} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                创建采购单
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
