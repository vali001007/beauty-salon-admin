import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, PackageCheck, PackagePlus, RefreshCcw, Send, Truck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  auditSupplyQuote,
  auditSupplySku,
  createSupplierQualification,
  createSupplierShipment,
  createSupplyQuote,
  createSupplySku,
  createSupplySupplier,
  generateSupplySettlement,
  getProcurementOrders,
  getSupplyQuotes,
  getSupplySettlements,
  getSupplySkus,
  getSupplySuppliers,
  updateProcurementOrderStatus,
} from '@/api/supplyPlatform';
import type { ProcurementOrder, SupplyQuote, SupplySettlement, SupplySku, SupplySupplier } from '@/types/supplyPlatform';
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/UI';
import { Badge } from '../../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { useAuthStore } from '@/stores/authStore';

type PlatformTab = 'suppliers' | 'skus' | 'quotes' | 'orders' | 'settlements';
type AuditTarget = { kind: 'sku'; item: SupplySku } | { kind: 'quote'; item: SupplyQuote };

const auditLabels: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
};

const orderStatusLabels: Record<string, string> = {
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

function money(value?: number | null) {
  return `¥${Number(value ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateText(value?: string | null) {
  return value ? String(value).slice(0, 10) : '-';
}

function statusVariant(status?: string | null) {
  if (status === 'approved' || status === 'active' || status === 'received' || status === 'settled') return 'default' as const;
  if (status === 'rejected' || status === 'disabled' || status === 'cancelled') return 'destructive' as const;
  return 'secondary' as const;
}

function parseLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function SupplyPlatformMvp() {
  const currentUser = useAuthStore((state) => state.user);
  const boundSupplierId = currentUser?.supplySupplierId ?? null;
  const isSupplierAccount = Boolean(boundSupplierId);
  const canManageSupply = Boolean(currentUser?.permissions?.includes('*') || currentUser?.permissions?.includes('core:supply:manage'));
  const [activeTab, setActiveTab] = useState<PlatformTab>('suppliers');
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplySupplier[]>([]);
  const [skus, setSkus] = useState<SupplySku[]>([]);
  const [quotes, setQuotes] = useState<SupplyQuote[]>([]);
  const [orders, setOrders] = useState<ProcurementOrder[]>([]);
  const [settlements, setSettlements] = useState<SupplySettlement[]>([]);
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [qualificationDialogOpen, setQualificationDialogOpen] = useState(false);
  const [skuDialogOpen, setSkuDialogOpen] = useState(false);
  const [quoteDialogOpen, setQuoteDialogOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<AuditTarget | null>(null);
  const [shipmentOrder, setShipmentOrder] = useState<ProcurementOrder | null>(null);
  const [saving, setSaving] = useState(false);
  const [supplierForm, setSupplierForm] = useState({ name: '', companyName: '', contactName: '', phone: '', paymentTerms: '月结30天' });
  const [qualificationForm, setQualificationForm] = useState({ supplierId: 0, type: '营业执照', fileUrl: '', fileName: '', expiresAt: '' });
  const [skuForm, setSkuForm] = useState({ supplierId: 0, name: '', brand: '', spec: '', unit: '件', imageUrls: '', qualificationUrls: '', description: '' });
  const [quoteForm, setQuoteForm] = useState({ supplySkuId: 0, price: 0, moq: 1, leadDays: 3, availableStock: 0 });
  const [rejectReason, setRejectReason] = useState('');
  const [settleMonth, setSettleMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const supplierMap = useMemo(() => new Map(suppliers.map((item) => [item.id, item])), [suppliers]);
  const skuMap = useMemo(() => new Map(skus.map((item) => [item.id, item])), [skus]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const supplierParams = boundSupplierId ? { page: 1, pageSize: 100, supplierId: boundSupplierId } : { page: 1, pageSize: 100 };
      const [supplierPage, skuPage, quotePage, orderPage, settlementPage] = await Promise.all([
        getSupplySuppliers({ page: 1, pageSize: 100 }),
        getSupplySkus(supplierParams),
        getSupplyQuotes(supplierParams),
        getProcurementOrders(supplierParams),
        getSupplySettlements(supplierParams),
      ]);
      setSuppliers(supplierPage.items);
      setSkus(skuPage.items);
      setQuotes(quotePage.items);
      setOrders(orderPage.items);
      setSettlements(settlementPage.items);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '供应链平台数据加载失败');
    } finally {
      setLoading(false);
    }
  }, [boundSupplierId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const submitSupplier = async () => {
    if (isSupplierAccount) {
      toast.error('供应商账号不能新增供应商，请由平台运营创建并绑定账号');
      return;
    }
    if (!supplierForm.name.trim()) {
      toast.error('请填写供应商名称');
      return;
    }
    setSaving(true);
    try {
      await createSupplySupplier(supplierForm);
      toast.success('供应商已创建');
      setSupplierDialogOpen(false);
      setSupplierForm({ name: '', companyName: '', contactName: '', phone: '', paymentTerms: '月结30天' });
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '创建供应商失败');
    } finally {
      setSaving(false);
    }
  };

  const submitSku = async () => {
    const supplierId = boundSupplierId ?? skuForm.supplierId;
    if (!supplierId || !skuForm.name.trim()) {
      toast.error(isSupplierAccount ? '请填写商品名称' : '请选择供应商并填写商品名称');
      return;
    }
    setSaving(true);
    try {
      const { imageUrls, qualificationUrls, ...payload } = skuForm;
      await createSupplySku({
        ...payload,
        supplierId,
        images: parseLines(imageUrls),
        qualificationFiles: parseLines(qualificationUrls),
      });
      toast.success('供应链商品已提交审核');
      setSkuDialogOpen(false);
      setSkuForm({ supplierId: boundSupplierId ?? 0, name: '', brand: '', spec: '', unit: '件', imageUrls: '', qualificationUrls: '', description: '' });
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '提交商品失败');
    } finally {
      setSaving(false);
    }
  };

  const submitQualification = async () => {
    const supplierId = boundSupplierId ?? qualificationForm.supplierId;
    if (!supplierId || !qualificationForm.type.trim() || !qualificationForm.fileUrl.trim()) {
      toast.error(isSupplierAccount ? '请填写资质类型和文件地址' : '请选择供应商并填写资质类型和文件地址');
      return;
    }
    setSaving(true);
    try {
      await createSupplierQualification({
        supplierId,
        type: qualificationForm.type.trim(),
        fileUrl: qualificationForm.fileUrl.trim(),
        fileName: qualificationForm.fileName.trim() || undefined,
        expiresAt: qualificationForm.expiresAt || undefined,
      });
      toast.success('供应商资质已提交');
      setQualificationDialogOpen(false);
      setQualificationForm({ supplierId: boundSupplierId ?? 0, type: '营业执照', fileUrl: '', fileName: '', expiresAt: '' });
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '提交资质失败');
    } finally {
      setSaving(false);
    }
  };

  const submitQuote = async () => {
    if (!quoteForm.supplySkuId || Number(quoteForm.price) <= 0) {
      toast.error('请选择商品并填写供货价');
      return;
    }
    const sku = skuMap.get(Number(quoteForm.supplySkuId));
    setSaving(true);
    try {
      await createSupplyQuote({
        ...quoteForm,
        supplierId: sku?.supplierId,
        price: Number(quoteForm.price),
        moq: Number(quoteForm.moq || 1),
        leadDays: Number(quoteForm.leadDays || 0),
        availableStock: Number(quoteForm.availableStock || 0),
        stockStatus: 'available',
      });
      toast.success('报价已提交审核');
      setQuoteDialogOpen(false);
      setQuoteForm({ supplySkuId: 0, price: 0, moq: 1, leadDays: 3, availableStock: 0 });
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '提交报价失败');
    } finally {
      setSaving(false);
    }
  };

  const approveSku = async (item: SupplySku) => {
    try {
      await auditSupplySku(item.id, { auditStatus: 'approved', status: 'active' });
      toast.success('商品已审核通过');
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '商品审核失败');
    }
  };

  const approveQuote = async (item: SupplyQuote) => {
    try {
      await auditSupplyQuote(item.id, { auditStatus: 'approved', status: 'active' });
      toast.success('报价已审核通过');
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '报价审核失败');
    }
  };

  const openRejectDialog = (target: AuditTarget) => {
    setRejectTarget(target);
    setRejectReason(target.item.rejectReason ?? '');
  };

  const submitReject = async () => {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) {
      toast.error('请填写驳回原因');
      return;
    }
    setSaving(true);
    try {
      if (rejectTarget.kind === 'sku') {
        await auditSupplySku(rejectTarget.item.id, { auditStatus: 'rejected', status: 'draft', rejectReason: rejectReason.trim() });
      } else {
        await auditSupplyQuote(rejectTarget.item.id, { auditStatus: 'rejected', status: 'draft', rejectReason: rejectReason.trim() });
      }
      toast.success('已驳回并记录原因');
      setRejectTarget(null);
      setRejectReason('');
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '驳回失败');
    } finally {
      setSaving(false);
    }
  };

  const updateOrderStatus = async (order: ProcurementOrder, status: 'accepted' | 'rejected') => {
    try {
      await updateProcurementOrderStatus(order.id, status);
      toast.success(status === 'accepted' ? '采购单已接单' : '采购单已拒单');
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '采购单状态更新失败');
    }
  };

  const submitShipment = async () => {
    if (!shipmentOrder) return;
    const items = shipmentOrder.items.filter((item) => item.quantity - item.receivedQty > 0);
    if (items.length === 0) {
      toast.error('当前订单没有待发货明细');
      return;
    }
    setSaving(true);
    try {
      await createSupplierShipment(shipmentOrder.id, {
        shippedAt: new Date().toISOString(),
        items: items.map((item) => ({
          orderItemId: item.id,
          supplySkuId: item.supplySkuId,
          shippedQty: item.quantity - item.receivedQty,
          batchNo: `AUTO-${shipmentOrder.orderNo}-${item.id}`,
        })),
      });
      toast.success('供应商发货已提交');
      setShipmentOrder(null);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '提交发货失败');
    } finally {
      setSaving(false);
    }
  };

  const submitSettlement = async () => {
    if (!settleMonth) {
      toast.error('请选择结算月份');
      return;
    }
    setSaving(true);
    try {
      await generateSupplySettlement({ settleMonth });
      toast.success('供应商月结已生成');
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '生成结算失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">供应链平台 MVP</h1>
          <p className="mt-1 text-sm text-muted-foreground">供应商自助上架、报价、履约、收货联动和供应商月结的最小闭环。</p>
          {isSupplierAccount ? (
            <p className="mt-1 text-xs text-muted-foreground">当前供应商：{currentUser?.supplySupplierName || `#${boundSupplierId}`}</p>
          ) : null}
        </div>
        <Button variant="outline" className="gap-2" onClick={loadData} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          刷新
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as PlatformTab)} className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 bg-gray-100 p-1 md:grid-cols-5">
          <TabsTrigger value="suppliers">供应商</TabsTrigger>
          <TabsTrigger value="skus">商品上架</TabsTrigger>
          <TabsTrigger value="quotes">报价审核</TabsTrigger>
          <TabsTrigger value="orders">履约发货</TabsTrigger>
          <TabsTrigger value="settlements">结算</TabsTrigger>
        </TabsList>

        <TabsContent value="suppliers" className="space-y-3">
          <div className="flex justify-end">
            <div className="flex flex-wrap justify-end gap-2">
              {canManageSupply ? (
                <Button className="gap-2" onClick={() => setSupplierDialogOpen(true)}>
                  <PackagePlus className="h-4 w-4" />
                  新增供应商
                </Button>
              ) : null}
              <Button variant="outline" className="gap-2" onClick={() => setQualificationDialogOpen(true)}>
                <Send className="h-4 w-4" />
                提交资质
              </Button>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>供应商</TableHead>
                <TableHead>联系人</TableHead>
                <TableHead>账期</TableHead>
                <TableHead>资质</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="font-medium">{item.name}</div>
                    <div className="text-xs text-muted-foreground">{item.companyName || '-'}</div>
                  </TableCell>
                  <TableCell>{item.contactName || item.phone || '-'}</TableCell>
                  <TableCell>{item.paymentTerms || '-'}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(item.qualificationStatus)}>{item.qualificationStatus || 'pending'}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(item.status)}>{item.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="skus" className="space-y-3">
          <div className="flex justify-end">
            <Button className="gap-2" onClick={() => setSkuDialogOpen(true)}>
              <PackagePlus className="h-4 w-4" />
              提交商品
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>商品</TableHead>
                <TableHead>供应商</TableHead>
                <TableHead>规格</TableHead>
                <TableHead>审核</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {skus.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="font-medium">{item.name}</div>
                    <div className="text-xs text-muted-foreground">{item.brand || '-'}</div>
                    {item.rejectReason ? <div className="mt-1 text-xs text-destructive">驳回：{item.rejectReason}</div> : null}
                  </TableCell>
                  <TableCell>{item.supplier?.name || supplierMap.get(item.supplierId)?.name || '-'}</TableCell>
                  <TableCell>{item.spec || '-'} / {item.unit || '-'}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(item.auditStatus)}>{auditLabels[item.auditStatus] || item.auditStatus}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {canManageSupply && item.auditStatus !== 'approved' ? (
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" className="gap-2" onClick={() => approveSku(item)}>
                          <CheckCircle2 className="h-4 w-4" />
                          通过
                        </Button>
                        <Button size="sm" variant="outline" className="gap-2 text-destructive" onClick={() => openRejectDialog({ kind: 'sku', item })}>
                          <XCircle className="h-4 w-4" />
                          驳回
                        </Button>
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="quotes" className="space-y-3">
          <div className="flex justify-end">
            <Button className="gap-2" onClick={() => setQuoteDialogOpen(true)}>
              <Send className="h-4 w-4" />
              提交报价
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>商品</TableHead>
                <TableHead>供应商</TableHead>
                <TableHead>价格</TableHead>
                <TableHead>MOQ/交期</TableHead>
                <TableHead>审核</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotes.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div>{item.sku?.name || skuMap.get(item.supplySkuId)?.name || `SKU#${item.supplySkuId}`}</div>
                    {item.rejectReason ? <div className="mt-1 text-xs text-destructive">驳回：{item.rejectReason}</div> : null}
                  </TableCell>
                  <TableCell>{item.supplier?.name || supplierMap.get(item.supplierId)?.name || '-'}</TableCell>
                  <TableCell className="font-medium">{money(item.price)}</TableCell>
                  <TableCell>{item.moq} / {item.leadDays ?? '-'} 天</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(item.auditStatus)}>{auditLabels[item.auditStatus] || item.auditStatus}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {canManageSupply && item.auditStatus !== 'approved' ? (
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" className="gap-2" onClick={() => approveQuote(item)}>
                          <CheckCircle2 className="h-4 w-4" />
                          通过
                        </Button>
                        <Button size="sm" variant="outline" className="gap-2 text-destructive" onClick={() => openRejectDialog({ kind: 'quote', item })}>
                          <XCircle className="h-4 w-4" />
                          驳回
                        </Button>
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="orders" className="space-y-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>订单</TableHead>
                <TableHead>供应商</TableHead>
                <TableHead>明细数</TableHead>
                <TableHead>金额</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="font-mono text-sm font-medium">{item.orderNo}</div>
                    <div className="text-xs text-muted-foreground">{dateText(item.expectedArrivalDate)}</div>
                  </TableCell>
                  <TableCell>{item.supplier?.name || supplierMap.get(item.supplierId)?.name || '-'}</TableCell>
                  <TableCell>{item.items.length}</TableCell>
                  <TableCell className="font-medium">{money(item.netAmount)}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(item.status)}>{orderStatusLabels[item.status] || item.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {item.status === 'pending_supplier_confirm' ? (
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" className="gap-2" onClick={() => void updateOrderStatus(item, 'accepted')}>
                          <CheckCircle2 className="h-4 w-4" />
                          接单
                        </Button>
                        <Button size="sm" variant="outline" className="gap-2 text-destructive" onClick={() => void updateOrderStatus(item, 'rejected')}>
                          <XCircle className="h-4 w-4" />
                          拒单
                        </Button>
                      </div>
                    ) : item.status === 'accepted' ? (
                      <Button size="sm" variant="outline" className="gap-2" onClick={() => setShipmentOrder(item)}>
                        <Truck className="h-4 w-4" />
                        发货
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="settlements" className="space-y-3">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {canManageSupply ? (
              <>
                <Input type="month" className="w-44" value={settleMonth} onChange={(event) => setSettleMonth(event.target.value)} />
                <Button className="gap-2" onClick={submitSettlement} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
                  生成月结
                </Button>
              </>
            ) : null}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>月份</TableHead>
                <TableHead>供应商</TableHead>
                <TableHead>订单数</TableHead>
                <TableHead>采购额</TableHead>
                <TableHead>平台费</TableHead>
                <TableHead>应付</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settlements.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.settleMonth}</TableCell>
                  <TableCell>{item.supplier?.name || supplierMap.get(item.supplierId)?.name || '-'}</TableCell>
                  <TableCell>{item.orderCount}</TableCell>
                  <TableCell>{money(item.totalAmount)}</TableCell>
                  <TableCell>{money(item.platformFee)}</TableCell>
                  <TableCell className="font-medium">{money(item.netPayable)}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(item.status)}>{item.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>

      <Dialog open={supplierDialogOpen} onOpenChange={setSupplierDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>新增供应商</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <Input placeholder="供应商名称" value={supplierForm.name} onChange={(event) => setSupplierForm((prev) => ({ ...prev, name: event.target.value }))} />
            <Input placeholder="公司名称" value={supplierForm.companyName} onChange={(event) => setSupplierForm((prev) => ({ ...prev, companyName: event.target.value }))} />
            <Input placeholder="联系人" value={supplierForm.contactName} onChange={(event) => setSupplierForm((prev) => ({ ...prev, contactName: event.target.value }))} />
            <Input placeholder="联系电话" value={supplierForm.phone} onChange={(event) => setSupplierForm((prev) => ({ ...prev, phone: event.target.value }))} />
            <Input placeholder="账期" value={supplierForm.paymentTerms} onChange={(event) => setSupplierForm((prev) => ({ ...prev, paymentTerms: event.target.value }))} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSupplierDialogOpen(false)}>取消</Button>
            <Button onClick={submitSupplier} disabled={saving}>保存</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={qualificationDialogOpen} onOpenChange={setQualificationDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>提交供应商资质</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            {isSupplierAccount ? (
              <Input value={currentUser?.supplySupplierName || `供应商 #${boundSupplierId}`} disabled />
            ) : (
              <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={qualificationForm.supplierId} onChange={(event) => setQualificationForm((prev) => ({ ...prev, supplierId: Number(event.target.value) }))}>
                <option value={0}>选择供应商</option>
                {suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            )}
            <Input placeholder="资质类型" value={qualificationForm.type} onChange={(event) => setQualificationForm((prev) => ({ ...prev, type: event.target.value }))} />
            <Input placeholder="文件名称" value={qualificationForm.fileName} onChange={(event) => setQualificationForm((prev) => ({ ...prev, fileName: event.target.value }))} />
            <Input type="date" value={qualificationForm.expiresAt} onChange={(event) => setQualificationForm((prev) => ({ ...prev, expiresAt: event.target.value }))} />
            <Input className="md:col-span-2" placeholder="文件 URL" value={qualificationForm.fileUrl} onChange={(event) => setQualificationForm((prev) => ({ ...prev, fileUrl: event.target.value }))} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setQualificationDialogOpen(false)}>取消</Button>
            <Button onClick={submitQualification} disabled={saving}>提交</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={skuDialogOpen} onOpenChange={setSkuDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>供应商提交商品</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            {isSupplierAccount ? (
              <Input value={currentUser?.supplySupplierName || `供应商 #${boundSupplierId}`} disabled />
            ) : (
              <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={skuForm.supplierId} onChange={(event) => setSkuForm((prev) => ({ ...prev, supplierId: Number(event.target.value) }))}>
                <option value={0}>选择供应商</option>
                {suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            )}
            <Input placeholder="商品名称" value={skuForm.name} onChange={(event) => setSkuForm((prev) => ({ ...prev, name: event.target.value }))} />
            <Input placeholder="品牌" value={skuForm.brand} onChange={(event) => setSkuForm((prev) => ({ ...prev, brand: event.target.value }))} />
            <Input placeholder="规格" value={skuForm.spec} onChange={(event) => setSkuForm((prev) => ({ ...prev, spec: event.target.value }))} />
            <Input placeholder="单位" value={skuForm.unit} onChange={(event) => setSkuForm((prev) => ({ ...prev, unit: event.target.value }))} />
            <textarea className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm md:col-span-2" placeholder="商品图片 URL，每行一个" value={skuForm.imageUrls} onChange={(event) => setSkuForm((prev) => ({ ...prev, imageUrls: event.target.value }))} />
            <textarea className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm md:col-span-2" placeholder="商品资质文件 URL，每行一个" value={skuForm.qualificationUrls} onChange={(event) => setSkuForm((prev) => ({ ...prev, qualificationUrls: event.target.value }))} />
            <Input placeholder="说明" value={skuForm.description} onChange={(event) => setSkuForm((prev) => ({ ...prev, description: event.target.value }))} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSkuDialogOpen(false)}>取消</Button>
            <Button onClick={submitSku} disabled={saving}>提交</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(rejectTarget)} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{rejectTarget?.kind === 'sku' ? '驳回商品' : '驳回报价'}</DialogTitle>
          </DialogHeader>
          <textarea className="min-h-28 rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="填写驳回原因，供应商会在列表中看到" value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRejectTarget(null)}>取消</Button>
            <Button variant="danger" onClick={submitReject} disabled={saving}>确认驳回</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={quoteDialogOpen} onOpenChange={setQuoteDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>供应商提交报价</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={quoteForm.supplySkuId} onChange={(event) => setQuoteForm((prev) => ({ ...prev, supplySkuId: Number(event.target.value) }))}>
              <option value={0}>选择已上架商品</option>
              {skus.filter((item) => item.auditStatus === 'approved').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <Input type="number" min={0} step="0.01" placeholder="供货价" value={quoteForm.price} onChange={(event) => setQuoteForm((prev) => ({ ...prev, price: Number(event.target.value) }))} />
            <Input type="number" min={1} placeholder="MOQ" value={quoteForm.moq} onChange={(event) => setQuoteForm((prev) => ({ ...prev, moq: Number(event.target.value) }))} />
            <Input type="number" min={0} placeholder="交期天数" value={quoteForm.leadDays} onChange={(event) => setQuoteForm((prev) => ({ ...prev, leadDays: Number(event.target.value) }))} />
            <Input type="number" min={0} placeholder="可供库存" value={quoteForm.availableStock} onChange={(event) => setQuoteForm((prev) => ({ ...prev, availableStock: Number(event.target.value) }))} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setQuoteDialogOpen(false)}>取消</Button>
            <Button onClick={submitQuote} disabled={saving}>提交</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(shipmentOrder)} onOpenChange={(open) => !open && setShipmentOrder(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>供应商发货</DialogTitle>
          </DialogHeader>
          {shipmentOrder ? (
            <div className="space-y-3">
              <div className="rounded-md bg-muted/40 p-3 text-sm">
                {shipmentOrder.orderNo} / {shipmentOrder.supplier?.name || supplierMap.get(shipmentOrder.supplierId)?.name || '-'}
              </div>
              <div className="divide-y rounded-md border">
                {shipmentOrder.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 text-sm">
                    <span>{item.supplySku?.name || `SKU#${item.supplySkuId}`}</span>
                    <span>待发 {Math.max(0, item.quantity - item.receivedQty)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShipmentOrder(null)}>取消</Button>
                <Button className="gap-2" onClick={submitShipment} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                  确认发货
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
