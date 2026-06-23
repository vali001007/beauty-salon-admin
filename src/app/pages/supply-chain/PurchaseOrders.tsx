import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  PackageCheck,
  PackagePlus,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  confirmSupplierOrder,
  createSupplierOrder,
  getSupplier,
  getSupplierOrder,
  getSupplierOrdersPaginated,
  getSuppliersPaginated,
  receiveSupplierOrder,
  settleSupplierOrder,
  updateSupplierOrderStatus,
} from '@/api/supply-chain';
import { getProductsPaginated } from '@/api/product';
import { usePermission } from '@/hooks/usePermission';
import { useStoreStore } from '@/stores/storeStore';
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/UI';
import { Badge } from '../../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Textarea } from '../../components/ui/textarea';
import type {
  Product,
  ReceiveSupplierOrderPayload,
  Supplier,
  SupplierOrder,
  SupplierOrderPayloadItem,
  SupplierOrderStatus,
} from '@/types';
import { formatBusinessDate } from '@/utils/businessTime';

type OrderDraftItem = SupplierOrderPayloadItem & {
  key: string;
  moq?: number | null;
};

type ReceiveDraftItem = ReceiveSupplierOrderPayload['items'][number] & {
  key: string;
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
  approved: { label: '确认下单', next: 'ordered', icon: PackageCheck },
};

const statusOptions: Array<SupplierOrderStatus | 'all'> = [
  'all',
  'draft',
  'pending',
  'approved',
  'ordered',
  'partial_received',
  'received',
  'settled',
  'cancelled',
];

function createDraftItem(productId = 0, quantity = 1, unitPrice = 0, moq?: number | null): OrderDraftItem {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    productId,
    quantity,
    unitPrice,
    moq,
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

function money(value?: number | null) {
  return `¥${Number(value ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function percent(value?: number | null) {
  return `${(Number(value ?? 0) * 100).toFixed(1)}%`;
}

function dateText(value?: string | null) {
  if (!value) return '-';
  return formatBusinessDate(value) || String(value).slice(0, 10);
}

function getStatusVariant(status: SupplierOrderStatus) {
  if (status === 'cancelled') return 'destructive' as const;
  if (status === 'received' || status === 'settled') return 'default' as const;
  if (status === 'partial_received' || status === 'ordered') return 'outline' as const;
  return 'secondary' as const;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function PurchaseOrders() {
  const canManageSupply = usePermission('core:supply:manage');
  const currentStoreId = useStoreStore((state) => state.currentStoreId);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<SupplierOrderStatus | 'all'>('all');
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [supplierDetail, setSupplierDetail] = useState<Supplier | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<SupplierOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingRefs, setLoadingRefs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [supplierId, setSupplierId] = useState(0);
  const [orderItems, setOrderItems] = useState<OrderDraftItem[]>([createDraftItem()]);
  const [receiveItems, setReceiveItems] = useState<ReceiveDraftItem[]>([]);
  const [receiveRemark, setReceiveRemark] = useState('');

  const supplierMap = useMemo(() => new Map(suppliers.map((supplier) => [supplier.id, supplier])), [suppliers]);
  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const linkedProductMap = useMemo(
    () => new Map((supplierDetail?.products ?? []).map((link) => [link.productId, link])),
    [supplierDetail],
  );
  const productOptions = useMemo(() => {
    if (!supplierDetail?.products?.length) return products;
    const linkedProductIds = new Set(supplierDetail.products.map((link) => link.productId));
    return products.filter((product) => linkedProductIds.has(product.id));
  }, [products, supplierDetail]);

  const orderTotal = useMemo(
    () => orderItems.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0),
    [orderItems],
  );
  const selectedSupplier = supplierId ? supplierMap.get(supplierId) : null;
  const estimatedPlatformFee = orderTotal * 0.02;
  const estimatedRebate = orderTotal * Number(selectedSupplier?.rebateRate ?? supplierDetail?.rebateRate ?? 0);
  const estimatedNet = Math.max(0, orderTotal - estimatedRebate);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const page = await getSupplierOrdersPaginated({
        page: 1,
        pageSize: 80,
        keyword: keyword.trim() || undefined,
        status: status === 'all' ? undefined : status,
        storeId: currentStoreId ?? undefined,
      });
      setOrders(page.items);
      setSelectedOrder((current) => {
        if (!current) return current;
        return page.items.find((item) => item.id === current.id) ?? current;
      });
    } catch (error) {
      toast.error(getErrorMessage(error, '采购订单加载失败'));
    } finally {
      setLoading(false);
    }
  }, [currentStoreId, keyword, status]);

  const loadReferences = useCallback(async () => {
    setLoadingRefs(true);
    try {
      const [supplierPage, productPage] = await Promise.all([
        getSuppliersPaginated({ page: 1, pageSize: 200, status: 'active', storeId: currentStoreId ?? undefined }),
        getProductsPaginated({ page: 1, pageSize: 200 }),
      ]);
      setSuppliers(supplierPage.items);
      setProducts(productPage.items);
    } catch (error) {
      toast.error(getErrorMessage(error, '供应商或商品资料加载失败'));
    } finally {
      setLoadingRefs(false);
    }
  }, [currentStoreId]);

  useEffect(() => {
    void loadReferences();
  }, [loadReferences]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const refreshOrder = async (orderId: number) => {
    const latest = await getSupplierOrder(orderId);
    setSelectedOrder(latest);
    setOrders((current) => current.map((item) => (item.id === latest.id ? latest : item)));
    setReceiveItems(
      latest.items
        .filter((item) => item.quantity - item.receivedQty > 0)
        .map((item) => createReceiveDraftItem(item.id, item.productId, item.quantity - item.receivedQty)),
    );
    return latest;
  };

  const selectOrder = async (order: SupplierOrder) => {
    try {
      await refreshOrder(order.id);
    } catch (error) {
      toast.error(getErrorMessage(error, '采购订单详情加载失败'));
    }
  };

  const hydrateSupplierDetail = async (nextSupplierId: number) => {
    setSupplierId(nextSupplierId);
    if (!nextSupplierId) {
      setSupplierDetail(null);
      setOrderItems([createDraftItem()]);
      return;
    }

    try {
      const detail = await getSupplier(nextSupplierId);
      setSupplierDetail(detail);
      const firstLink = detail.products?.[0];
      if (firstLink) {
        setOrderItems([createDraftItem(firstLink.productId, Math.max(1, firstLink.moq ?? 1), firstLink.supplyPrice, firstLink.moq)]);
      } else {
        setOrderItems([createDraftItem()]);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, '供应商商品关联加载失败'));
      setSupplierDetail(null);
    }
  };

  const openCreateDialog = () => {
    if (!canManageSupply) {
      toast.error('当前账号没有创建采购单的权限');
      return;
    }
    const firstSupplierId = suppliers[0]?.id ?? 0;
    setOrderDialogOpen(true);
    setOrderItems([createDraftItem()]);
    void hydrateSupplierDetail(firstSupplierId);
  };

  const updateOrderItem = (key: string, patch: Partial<OrderDraftItem>) => {
    setOrderItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  };

  const changeOrderItemProduct = (key: string, productId: number) => {
    const link = linkedProductMap.get(productId);
    const product = productMap.get(productId);
    updateOrderItem(key, {
      productId,
      quantity: Math.max(1, link?.moq ?? 1),
      unitPrice: Number(link?.supplyPrice ?? product?.costPrice ?? 0),
      moq: link?.moq ?? null,
    });
  };

  const addOrderItem = () => {
    const firstLink = supplierDetail?.products?.find((link) => !orderItems.some((item) => item.productId === link.productId));
    setOrderItems((current) => [
      ...current,
      firstLink ? createDraftItem(firstLink.productId, Math.max(1, firstLink.moq ?? 1), firstLink.supplyPrice, firstLink.moq) : createDraftItem(),
    ]);
  };

  const removeOrderItem = (key: string) => {
    setOrderItems((current) => (current.length > 1 ? current.filter((item) => item.key !== key) : current));
  };

  const createOrder = async () => {
    if (!canManageSupply) {
      toast.error('当前账号没有创建采购单的权限');
      return;
    }
    const supplier = supplierId ? supplierMap.get(supplierId) : null;
    const storeId = supplier?.storeId ?? currentStoreId ?? undefined;
    if (!supplierId || !supplier) {
      toast.error('请选择供应商');
      return;
    }
    if (!storeId) {
      toast.error('请先在门店切换器中选择采购门店，或选择已绑定门店的供应商');
      return;
    }

    const payloadItems = orderItems
      .map((item) => ({
        productId: Number(item.productId),
        quantity: Math.max(1, Math.floor(Number(item.quantity || 0))),
        unitPrice: Number(item.unitPrice || 0),
      }))
      .filter((item) => item.productId > 0 && item.quantity > 0);
    if (payloadItems.length === 0) {
      toast.error('请至少选择一条采购商品');
      return;
    }

    setSaving(true);
    try {
      const created = await createSupplierOrder({
        supplierId,
        storeId,
        status: 'draft',
        items: payloadItems,
      });
      toast.success('采购单已创建');
      setOrderDialogOpen(false);
      setOrders((current) => [created, ...current]);
      await refreshOrder(created.id);
    } catch (error) {
      toast.error(getErrorMessage(error, '创建采购单失败'));
    } finally {
      setSaving(false);
    }
  };

  const advanceOrderStatus = async (order: SupplierOrder) => {
    if (!canManageSupply) {
      toast.error('当前账号没有管理采购单的权限');
      return;
    }
    const action = nextStatusActions[order.status];
    if (!action && order.status !== 'pending') return;
    try {
      const updated = order.status === 'pending' ? await confirmSupplierOrder(order.id) : await updateSupplierOrderStatus(order.id, action!.next);
      toast.success(order.status === 'pending' ? '采购单已审核通过' : '采购单状态已更新');
      setOrders((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedOrder(updated);
    } catch (error) {
      toast.error(getErrorMessage(error, '采购单状态更新失败'));
    }
  };

  const cancelOrder = async (order: SupplierOrder) => {
    if (!canManageSupply) {
      toast.error('当前账号没有取消采购单的权限');
      return;
    }
    if (!window.confirm(`确认取消采购单 ${order.orderNo}？`)) return;
    try {
      const updated = await updateSupplierOrderStatus(order.id, 'cancelled');
      toast.success('采购单已取消');
      setOrders((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedOrder(updated);
    } catch (error) {
      toast.error(getErrorMessage(error, '取消采购单失败'));
    }
  };

  const settleOrder = async (order: SupplierOrder) => {
    if (!canManageSupply) {
      toast.error('当前账号没有结算采购单的权限');
      return;
    }
    try {
      const updated = await settleSupplierOrder(order.id);
      toast.success('采购单已标记结算');
      setOrders((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedOrder(updated);
    } catch (error) {
      toast.error(getErrorMessage(error, '采购单结算失败'));
    }
  };

  const receiveOrder = async () => {
    if (!selectedOrder) return;
    if (!canManageSupply) {
      toast.error('当前账号没有收货入库的权限');
      return;
    }
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
      setOrders((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedOrder(updated);
      setReceiveRemark('');
      setReceiveItems(
        updated.items
          .filter((item) => item.quantity - item.receivedQty > 0)
          .map((item) => createReceiveDraftItem(item.id, item.productId, item.quantity - item.receivedQty)),
      );
    } catch (error) {
      toast.error(getErrorMessage(error, '收货入库失败'));
    } finally {
      setReceiving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">采购订单</h1>
          <p className="mt-1 text-sm text-muted-foreground">按供应商创建采购单，跟踪审核、下单、收货入库和结算状态。</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={loadOrders} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            刷新
          </Button>
          {canManageSupply ? (
            <Button className="gap-2" onClick={openCreateDialog} disabled={loadingRefs || suppliers.length === 0}>
              <PackagePlus className="h-4 w-4" />
              新建采购单
            </Button>
          ) : null}
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-4">
        <div className="rounded-md border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">采购总额</div>
          <div className="mt-2 text-xl font-semibold">{money(orders.reduce((sum, order) => sum + order.totalAmount, 0))}</div>
        </div>
        <div className="rounded-md border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">待收货数量</div>
          <div className="mt-2 text-xl font-semibold">
            {orders.reduce((sum, order) => sum + Math.max(0, order.totalQuantity - order.receivedQuantity), 0)}
          </div>
        </div>
        <div className="rounded-md border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">平台收益</div>
          <div className="mt-2 text-xl font-semibold">{money(orders.reduce((sum, order) => sum + order.platformRevenue, 0))}</div>
        </div>
        <div className="rounded-md border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">待处理单数</div>
          <div className="mt-2 text-xl font-semibold">
            {orders.filter((order) => !['cancelled', 'received', 'settled'].includes(order.status)).length}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex w-full flex-wrap gap-2 md:w-auto">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="搜索采购单号或供应商"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void loadOrders();
              }}
            />
          </div>
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={status}
            onChange={(event) => setStatus(event.target.value as SupplierOrderStatus | 'all')}
          >
            {statusOptions.map((value) => (
              <option key={value} value={value}>
                {value === 'all' ? '全部状态' : orderStatusLabels[value]}
              </option>
            ))}
          </select>
        </div>
        <Button variant="outline" onClick={loadOrders} disabled={loading}>
          查询
        </Button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
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
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                  加载中
                </TableCell>
              </TableRow>
            ) : orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  暂无采购订单
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order) => (
                <TableRow key={order.id} className={selectedOrder?.id === order.id ? 'bg-primary/5' : undefined}>
                  <TableCell>
                    <button type="button" className="text-left" onClick={() => void selectOrder(order)}>
                      <div className="font-medium">{order.orderNo}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{dateText(order.orderedAt ?? order.createdAt)}</div>
                    </button>
                  </TableCell>
                  <TableCell>{order.supplierName}</TableCell>
                  <TableCell>{order.storeName}</TableCell>
                  <TableCell>
                    <div>{money(order.netAmount)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">原价 {money(order.totalAmount)}</div>
                  </TableCell>
                  <TableCell>
                    {order.receivedQuantity}/{order.totalQuantity}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusVariant(order.status)}>{orderStatusLabels[order.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => void selectOrder(order)}>
                      详情
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

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
                  <XCircle className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="rounded-md bg-muted/40 p-3">
                  <div className="text-muted-foreground">采购金额</div>
                  <div className="mt-1 font-medium">{money(selectedOrder.totalAmount)}</div>
                </div>
                <div className="rounded-md bg-muted/40 p-3">
                  <div className="text-muted-foreground">返利</div>
                  <div className="mt-1 font-medium">{money(selectedOrder.rebateAmount)}</div>
                </div>
                <div className="rounded-md bg-muted/40 p-3">
                  <div className="text-muted-foreground">应付</div>
                  <div className="mt-1 font-medium">{money(selectedOrder.netAmount)}</div>
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
                          <div>{money(item.subtotal)}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {item.quantity} x {money(item.unitPrice)}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        已收 {item.receivedQty} / 待收 {Math.max(0, item.quantity - item.receivedQty)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {canManageSupply ? (
                <div className="flex flex-wrap gap-2">
                  {selectedOrder.status === 'pending' || nextStatusActions[selectedOrder.status] ? (
                    <Button onClick={() => void advanceOrderStatus(selectedOrder)} className="gap-2">
                      {(() => {
                        const Icon = selectedOrder.status === 'pending' ? CheckCircle2 : (nextStatusActions[selectedOrder.status]?.icon ?? CheckCircle2);
                        return <Icon className="h-4 w-4" />;
                      })()}
                      {selectedOrder.status === 'pending' ? '审核通过' : nextStatusActions[selectedOrder.status]?.label}
                    </Button>
                  ) : null}
                  {selectedOrder.status === 'received' ? (
                    <Button variant="outline" onClick={() => void settleOrder(selectedOrder)}>
                      标记结算
                    </Button>
                  ) : null}
                  {!['cancelled', 'settled', 'received'].includes(selectedOrder.status) ? (
                    <Button variant="danger" onClick={() => void cancelOrder(selectedOrder)}>
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
                    <div className="rounded-md bg-muted/40 px-3 py-4 text-center text-sm text-muted-foreground">
                      当前采购单没有待收明细
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {receiveItems.map((item) => {
                        const orderItem = selectedOrder.items.find((target) => target.id === item.orderItemId);
                        const maxQty = orderItem ? Math.max(0, orderItem.quantity - orderItem.receivedQty) : 0;
                        return (
                          <div key={item.key} className="rounded-md bg-muted/35 p-3">
                            <div className="mb-2 text-sm font-medium">{orderItem?.productName ?? '采购明细'}</div>
                            <div className="grid gap-2 md:grid-cols-2">
                              <label className="space-y-1">
                                <span className="text-xs text-muted-foreground">本次收货</span>
                                <Input
                                  type="number"
                                  min={0}
                                  max={maxQty}
                                  value={item.receivedQty}
                                  onChange={(event) =>
                                    setReceiveItems((current) =>
                                      current.map((target) =>
                                        target.key === item.key ? { ...target, receivedQty: Number(event.target.value) } : target,
                                      ),
                                    )
                                  }
                                />
                              </label>
                              <label className="space-y-1">
                                <span className="text-xs text-muted-foreground">批次号</span>
                                <Input
                                  placeholder="留空自动生成"
                                  value={item.batchNo ?? ''}
                                  onChange={(event) =>
                                    setReceiveItems((current) =>
                                      current.map((target) =>
                                        target.key === item.key ? { ...target, batchNo: event.target.value } : target,
                                      ),
                                    )
                                  }
                                />
                              </label>
                              <label className="space-y-1">
                                <span className="text-xs text-muted-foreground">生产日期</span>
                                <Input
                                  type="date"
                                  value={item.productionDate ?? ''}
                                  onChange={(event) =>
                                    setReceiveItems((current) =>
                                      current.map((target) =>
                                        target.key === item.key ? { ...target, productionDate: event.target.value } : target,
                                      ),
                                    )
                                  }
                                />
                              </label>
                              <label className="space-y-1">
                                <span className="text-xs text-muted-foreground">到期日期</span>
                                <Input
                                  type="date"
                                  value={item.expiryDate ?? ''}
                                  onChange={(event) =>
                                    setReceiveItems((current) =>
                                      current.map((target) =>
                                        target.key === item.key ? { ...target, expiryDate: event.target.value } : target,
                                      ),
                                    )
                                  }
                                />
                              </label>
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">最多可收 {maxQty}</div>
                          </div>
                        );
                      })}
                      <Textarea placeholder="收货备注" value={receiveRemark} onChange={(event) => setReceiveRemark(event.target.value)} />
                      <Button className="w-full gap-2" onClick={() => void receiveOrder()} disabled={receiving}>
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
              选择左侧采购单查看明细、推进状态或收货入库
            </div>
          )}
        </aside>
      </div>

      <Dialog open={orderDialogOpen} onOpenChange={setOrderDialogOpen}>
        <DialogContent className="max-w-4xl" aria-describedby="purchase-order-dialog-desc">
          <DialogHeader>
            <DialogTitle>新建采购单</DialogTitle>
          </DialogHeader>
          <span id="purchase-order-dialog-desc" className="sr-only">
            选择供应商和商品后创建采购单，系统会按供应商关联价、MOQ、返利和平台费估算金额。
          </span>

          <div className="grid gap-5">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px_180px]">
              <label className="space-y-1.5">
                <span className="text-sm font-medium">供应商</span>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={supplierId}
                  onChange={(event) => void hydrateSupplierDetail(Number(event.target.value))}
                >
                  <option value={0}>请选择供应商</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="rounded-md bg-muted/40 p-3 text-sm">
                <div className="text-muted-foreground">返利比例</div>
                <div className="mt-1 font-medium">{percent(selectedSupplier?.rebateRate ?? supplierDetail?.rebateRate ?? 0)}</div>
              </div>
              <div className="rounded-md bg-muted/40 p-3 text-sm">
                <div className="text-muted-foreground">关联商品</div>
                <div className="mt-1 font-medium">{supplierDetail?.products?.length ?? 0} 个</div>
              </div>
            </div>

            <div className="rounded-md border border-border">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <div className="text-sm font-medium">采购明细</div>
                <Button type="button" variant="outline" size="sm" className="gap-2" onClick={addOrderItem}>
                  <Plus className="h-4 w-4" />
                  添加商品
                </Button>
              </div>
              <div className="divide-y divide-border">
                {orderItems.map((item) => {
                  const product = productMap.get(item.productId);
                  return (
                    <div key={item.key} className="grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_120px_140px_120px_40px]">
                      <label className="space-y-1.5">
                        <span className="text-xs text-muted-foreground">商品</span>
                        <select
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          value={item.productId}
                          onChange={(event) => changeOrderItemProduct(item.key, Number(event.target.value))}
                        >
                          <option value={0}>请选择商品</option>
                          {productOptions.map((option) => {
                            const link = linkedProductMap.get(option.id);
                            return (
                              <option key={option.id} value={option.id}>
                                {option.name} {link ? ` / MOQ ${link.moq ?? 1} / ${money(link.supplyPrice)}` : ''}
                              </option>
                            );
                          })}
                        </select>
                        {product ? (
                          <div className="text-xs text-muted-foreground">
                            {product.sku || '-'} / 当前成本 {money(product.costPrice)}
                          </div>
                        ) : null}
                      </label>
                      <label className="space-y-1.5">
                        <span className="text-xs text-muted-foreground">数量</span>
                        <Input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(event) => updateOrderItem(item.key, { quantity: Number(event.target.value) })}
                        />
                        <div className="text-xs text-muted-foreground">MOQ {item.moq ?? '-'}</div>
                      </label>
                      <label className="space-y-1.5">
                        <span className="text-xs text-muted-foreground">单价</span>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={item.unitPrice ?? 0}
                          onChange={(event) => updateOrderItem(item.key, { unitPrice: Number(event.target.value) })}
                        />
                      </label>
                      <div className="space-y-1.5">
                        <span className="text-xs text-muted-foreground">小计</span>
                        <div className="flex h-10 items-center rounded-md bg-muted/40 px-3 text-sm font-medium">
                          {money(Number(item.quantity || 0) * Number(item.unitPrice || 0))}
                        </div>
                      </div>
                      <div className="flex items-end">
                        <Button variant="ghost" size="icon" onClick={() => removeOrderItem(item.key)} aria-label="移除商品">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-md bg-muted/40 p-3 text-sm">
                <div className="text-muted-foreground">采购原价</div>
                <div className="mt-1 font-medium">{money(orderTotal)}</div>
              </div>
              <div className="rounded-md bg-muted/40 p-3 text-sm">
                <div className="text-muted-foreground">预计返利</div>
                <div className="mt-1 font-medium">{money(estimatedRebate)}</div>
              </div>
              <div className="rounded-md bg-muted/40 p-3 text-sm">
                <div className="text-muted-foreground">预计平台费</div>
                <div className="mt-1 font-medium">{money(estimatedPlatformFee)}</div>
              </div>
              <div className="rounded-md bg-muted/40 p-3 text-sm">
                <div className="text-muted-foreground">预计应付</div>
                <div className="mt-1 font-medium">{money(estimatedNet)}</div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOrderDialogOpen(false)}>
                取消
              </Button>
              <Button className="gap-2" onClick={() => void createOrder()} disabled={saving || !supplierId}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
                创建采购单
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
