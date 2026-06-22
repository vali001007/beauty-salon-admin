import React, { useEffect, useMemo, useState } from 'react';
import { BadgePercent, CreditCard, Loader2, PackageCheck, PackageX, Search, Smartphone, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/UI';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { MarketingPageGeneratorDialog, type MarketingPageGeneratorSource } from '../components/MarketingPageGeneratorDialog';
import { getProductsPaginated, updateProduct } from '@/api/product';
import { createProductOrder } from '@/api/order';
import { getCustomers } from '@/api/customer';
import { usePagination } from '@/hooks/usePagination';
import { useStoreStore } from '@/stores/storeStore';
import type { Customer, Product, ProductOrderPaymentMethod } from '@/types';

type SaleForm = {
  salePrice: number;
  discountRate: number;
  discountLabel: string;
  salesDescription: string;
};

type CashierForm = {
  customerId?: number;
  customerName: string;
  customerPhone: string;
  quantity: number;
  paymentMethod: ProductOrderPaymentMethod;
};

const PAYMENT_METHODS: ProductOrderPaymentMethod[] = ['微信', '支付宝', '现金', '银行卡', '会员卡划扣'];

function formatCurrency(value?: number | null) {
  return `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function getEffectivePrice(product: Product) {
  return Number(product.salePrice ?? product.retailPrice ?? 0);
}

function getDiscountRate(product: Product) {
  if (product.discountRate) return Number(product.discountRate);
  const retailPrice = Number(product.retailPrice || 0);
  const salePrice = getEffectivePrice(product);
  if (!retailPrice || salePrice >= retailPrice) return 10;
  return Math.round((salePrice / retailPrice) * 100) / 10;
}

function getStoreName(product: Product, stores: Array<{ id: number; name: string }>) {
  return product.storeName || stores.find((store) => store.id === product.storeId)?.name || '当前门店';
}

export function GoodsProductManagement() {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');
  const [publishUpdatingId, setPublishUpdatingId] = useState<number | null>(null);
  const [saleProduct, setSaleProduct] = useState<Product | null>(null);
  const [saleForm, setSaleForm] = useState<SaleForm>({
    salePrice: 0,
    discountRate: 10,
    discountLabel: '',
    salesDescription: '',
  });
  const [savingSale, setSavingSale] = useState(false);
  const [cashierProduct, setCashierProduct] = useState<Product | null>(null);
  const [cashierForm, setCashierForm] = useState<CashierForm>({
    customerName: '散客',
    customerPhone: '',
    quantity: 1,
    paymentMethod: '微信',
  });
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [submittingCashier, setSubmittingCashier] = useState(false);
  const [marketingPageSource, setMarketingPageSource] = useState<MarketingPageGeneratorSource | null>(null);

  const currentStoreId = useStoreStore((state) => state.currentStoreId);
  const stores = useStoreStore((state) => state.stores);
  const loadStores = useStoreStore((state) => state.loadStores);

  useEffect(() => {
    if (!stores.length) {
      loadStores().catch(() => toast.error('门店列表加载失败，请稍后重试'));
    }
  }, [loadStores, stores.length]);

  const filters = useMemo(
    () => ({
      keyword: keyword.trim() || undefined,
      status: 'active',
    }),
    [keyword],
  );

  const {
    data: products,
    total,
    page,
    pageSize,
    loading,
    setPage,
    setPageSize,
    refresh,
  } = usePagination<Product>(getProductsPaginated, filters);

  useEffect(() => {
    if (!cashierProduct) {
      setCustomers([]);
      return;
    }

    const timer = window.setTimeout(() => {
      setLoadingCustomers(true);
      const storeName = getStoreName(cashierProduct, stores);
      getCustomers({
        storeName: storeName === '当前门店' ? undefined : storeName,
        keyword: customerSearch.trim() || undefined,
      })
        .then((list) => setCustomers(list.slice(0, 12)))
        .catch(() => toast.error('客户列表加载失败，可按散客收银'))
        .finally(() => setLoadingCustomers(false));
    }, 200);

    return () => window.clearTimeout(timer);
  }, [cashierProduct, customerSearch, stores]);

  const openSaleDialog = (product: Product) => {
    setSaleProduct(product);
    setSaleForm({
      salePrice: getEffectivePrice(product),
      discountRate: getDiscountRate(product),
      discountLabel: product.discountLabel || '',
      salesDescription: product.salesDescription || '',
    });
  };

  const openMarketingPageGenerator = (product: Product) => {
    setMarketingPageSource({
      type: 'product',
      item: product,
      storeName: getStoreName(product, stores),
    });
  };

  const saveSaleInfo = async () => {
    if (!saleProduct) return;
    if (saleForm.salePrice <= 0) {
      toast.error('优惠价必须大于 0');
      return;
    }
    if (saleForm.discountRate <= 0 || saleForm.discountRate > 10) {
      toast.error('折扣需填写 0-10 之间的数字');
      return;
    }

    setSavingSale(true);
    try {
      await updateProduct(saleProduct.id, {
        salePrice: saleForm.salePrice,
        discountRate: saleForm.discountRate,
        discountLabel: saleForm.discountLabel.trim() || null,
        salesDescription: saleForm.salesDescription.trim() || null,
      });
      toast.success('销售信息已保存');
      setSaleProduct(null);
      refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : '销售信息保存失败';
      toast.error(message);
    } finally {
      setSavingSale(false);
    }
  };

  const toggleMiniappPublish = async (product: Product) => {
    const nextStatus = product.miniappStatus === 'published' ? 'unpublished' : 'published';
    setPublishUpdatingId(product.id);
    try {
      await updateProduct(product.id, {
        miniappStatus: nextStatus,
        miniappPublishedAt: nextStatus === 'published' ? new Date().toISOString() : null,
      });
      toast.success(nextStatus === 'published' ? '商品已上架到小程序' : '商品已从小程序下架');
      refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : '小程序展示状态更新失败';
      toast.error(message);
    } finally {
      setPublishUpdatingId(null);
    }
  };

  const openCashierDialog = (product: Product) => {
    setCashierProduct(product);
    setCashierForm({
      customerId: undefined,
      customerName: '散客',
      customerPhone: '',
      quantity: 1,
      paymentMethod: '微信',
    });
    setCustomerSearch('');
  };

  const selectCustomer = (customer: Customer) => {
    setCashierForm((prev) => ({
      ...prev,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
    }));
    setCustomerSearch(customer.name);
  };

  const submitCashier = async () => {
    if (!cashierProduct) return;
    const quantity = Number(cashierForm.quantity || 0);
    if (quantity <= 0) {
      toast.error('收银数量必须大于 0');
      return;
    }

    const unitPrice = getEffectivePrice(cashierProduct);
    const subtotal = unitPrice * quantity;
    const storeId = cashierProduct.storeId ?? currentStoreId ?? undefined;
    const storeName = getStoreName(cashierProduct, stores);

    setSubmittingCashier(true);
    try {
      await createProductOrder({
        customerId: cashierForm.customerId,
        customerName: cashierForm.customerName.trim() || '散客',
        customerPhone: cashierForm.customerPhone.trim(),
        storeId,
        storeName,
        items: [
          {
            itemType: 'product',
            itemId: cashierProduct.id,
            productId: cashierProduct.id,
            productName: cashierProduct.name,
            name: cashierProduct.name,
            sku: cashierProduct.sku,
            quantity,
            unitPrice,
            subtotal,
            discount: Math.max(0, Number(cashierProduct.retailPrice || 0) * quantity - subtotal),
          },
        ],
        totalAmount: subtotal,
        status: '已完成',
        paymentMethod: cashierForm.paymentMethod,
        paidAmount: subtotal,
        source: 'admin',
        remark: '商品管理快捷收银',
      });
      toast.success('收银订单已创建');
      setCashierProduct(null);
      navigate('/orders/products');
    } catch (error) {
      const message = error instanceof Error ? error.message : '收银失败，请稍后重试';
      toast.error(message);
    } finally {
      setSubmittingCashier(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="text-sm text-gray-500">首页 / 商品管理 / 商品管理</div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">商品管理</h2>
          <p className="mt-1 text-sm text-gray-500">
            仅展示产品管理中状态为“在售”的产品；这里维护小程序展示、优惠价和门店收银。
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">
          <Smartphone className="h-4 w-4" />
          小程序商品来自在售产品
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            className="w-80 pl-9"
            placeholder="搜索商品名称、SKU、品牌"
            value={keyword}
            onChange={(event) => {
              setKeyword(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="text-sm text-gray-500">共 {total} 个可售商品</div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            <span className="ml-2 text-gray-500">加载中...</span>
          </div>
        )}

        {!loading && (
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/80">
                <TableHead>商品</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>分类</TableHead>
                <TableHead>产品零售价</TableHead>
                <TableHead>小程序优惠价</TableHead>
                <TableHead>折扣</TableHead>
                <TableHead>小程序展示</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => {
                const published = product.miniappStatus === 'published';
                return (
                  <TableRow key={product.id} className="hover:bg-blue-50/30">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded bg-gradient-to-br from-pink-100 to-purple-100 text-gray-400">
                          {product.image ? (
                            <img src={product.image} alt={product.name} className="h-full w-full rounded object-cover" />
                          ) : (
                            <PackageCheck className="h-5 w-5" />
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-gray-800">{product.name}</div>
                          <div className="text-xs text-gray-500">{product.brand || '-'} / {product.spec || '-'}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-gray-600">{product.sku}</TableCell>
                    <TableCell className="text-sm text-gray-600">{product.categoryName || '-'}</TableCell>
                    <TableCell className="text-gray-700">{formatCurrency(product.retailPrice)}</TableCell>
                    <TableCell className="font-semibold text-rose-600">{formatCurrency(getEffectivePrice(product))}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700">
                        <BadgePercent className="h-3.5 w-3.5" />
                        {product.discountLabel || `${getDiscountRate(product)} 折`}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex rounded px-2 py-1 text-xs font-medium ${
                          published ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {published ? '已上架小程序' : '未上架'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button variant="outline" size="sm" className="gap-1" onClick={() => openSaleDialog(product)}>
                          <BadgePercent className="h-3.5 w-3.5" /> 编辑销售信息
                        </Button>
                        <Button variant="outline" size="sm" className="gap-1" onClick={() => openMarketingPageGenerator(product)}>
                          <Sparkles className="h-3.5 w-3.5" /> 生成推广页
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          onClick={() => toggleMiniappPublish(product)}
                          disabled={publishUpdatingId === product.id}
                        >
                          {publishUpdatingId === product.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : published ? (
                            <PackageX className="h-3.5 w-3.5" />
                          ) : (
                            <Smartphone className="h-3.5 w-3.5" />
                          )}
                          {published ? '下架' : '上架'}
                        </Button>
                        <Button size="sm" className="gap-1" onClick={() => openCashierDialog(product)}>
                          <CreditCard className="h-3.5 w-3.5" /> 收银
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {products.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-gray-400">
                    暂无在售商品。请先到库存管理 / 产品管理中将产品状态设为在售。
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}

        <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
          <div className="text-sm text-gray-600">共 {total} 条</div>
          <div className="flex items-center gap-2">
            <select
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
              className="h-8 rounded border border-gray-300 px-2 text-sm"
            >
              <option value={10}>10条/页</option>
              <option value={20}>20条/页</option>
              <option value={50}>50条/页</option>
            </select>
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              上一页
            </Button>
            <span className="text-sm text-gray-600">
              {page} / {Math.ceil(total / pageSize) || 1}
            </span>
            <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage(page + 1)}>
              下一页
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={Boolean(saleProduct)} onOpenChange={(open) => !open && setSaleProduct(null)}>
        <DialogContent className="max-w-xl" aria-describedby="sale-info-desc">
          <DialogHeader>
            <DialogTitle>编辑销售信息</DialogTitle>
            <DialogDescription id="sale-info-desc">
              配置小程序展示价格、折扣标签和销售说明，不影响产品管理中的成本、采购和基础档案。
            </DialogDescription>
          </DialogHeader>
          {saleProduct && (
            <div className="mt-4 space-y-4">
              <div className="rounded-lg bg-gray-50 p-3">
                <div className="font-medium text-gray-800">{saleProduct.name}</div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                  <span>产品零售价：{formatCurrency(saleProduct.retailPrice)}</span>
                  <span>成本价：{formatCurrency(saleProduct.costPrice)}</span>
                  <span>SKU：{saleProduct.sku}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-gray-700">小程序优惠价 *</span>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={saleForm.salePrice}
                    onChange={(event) => setSaleForm((prev) => ({ ...prev, salePrice: Number(event.target.value) }))}
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-gray-700">折扣</span>
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    step="0.1"
                    value={saleForm.discountRate}
                    onChange={(event) => setSaleForm((prev) => ({ ...prev, discountRate: Number(event.target.value) }))}
                  />
                </label>
              </div>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-gray-700">优惠标签</span>
                <Input
                  value={saleForm.discountLabel}
                  onChange={(event) => setSaleForm((prev) => ({ ...prev, discountLabel: event.target.value }))}
                  placeholder="如：新客专享 / 第二件 8 折 / 限时体验价"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-gray-700">销售说明</span>
                <textarea
                  className="min-h-24 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  value={saleForm.salesDescription}
                  onChange={(event) => setSaleForm((prev) => ({ ...prev, salesDescription: event.target.value }))}
                  placeholder="用于小程序商品详情页展示，例如适用肤质、推荐搭配、到店核销说明。"
                />
              </label>
              <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
                <Button variant="outline" onClick={() => setSaleProduct(null)} disabled={savingSale}>
                  取消
                </Button>
                <Button onClick={saveSaleInfo} disabled={savingSale} className="gap-2">
                  {savingSale && <Loader2 className="h-4 w-4 animate-spin" />}
                  保存
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(cashierProduct)} onOpenChange={(open) => !open && setCashierProduct(null)}>
        <DialogContent className="max-w-2xl" aria-describedby="cashier-desc">
          <DialogHeader>
            <DialogTitle>商品收银</DialogTitle>
            <DialogDescription id="cashier-desc">
              从商品管理快捷创建商品订单，订单会进入订单管理 / 商品订单管理，并与 Ami Aura Lite 收银口径一致。
            </DialogDescription>
          </DialogHeader>
          {cashierProduct && (
            <div className="mt-4 space-y-5">
              <div className="rounded-lg bg-gray-50 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-medium text-gray-800">{cashierProduct.name}</div>
                    <div className="mt-1 text-sm text-gray-500">{cashierProduct.sku}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-500">收银单价</div>
                    <div className="text-lg font-semibold text-rose-600">{formatCurrency(getEffectivePrice(cashierProduct))}</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-gray-700">客户</span>
                  <Input
                    value={customerSearch || cashierForm.customerName}
                    onChange={(event) => {
                      setCustomerSearch(event.target.value);
                      setCashierForm((prev) => ({
                        ...prev,
                        customerId: undefined,
                        customerName: event.target.value || '散客',
                      }));
                    }}
                    placeholder="搜索客户，留空则按散客收银"
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-gray-700">手机号</span>
                  <Input
                    value={cashierForm.customerPhone}
                    onChange={(event) => setCashierForm((prev) => ({ ...prev, customerPhone: event.target.value }))}
                    placeholder="可选"
                  />
                </label>
              </div>

              <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200">
                {loadingCustomers && (
                  <div className="flex items-center gap-2 px-3 py-3 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    正在加载客户...
                  </div>
                )}
                {!loadingCustomers && customers.map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-blue-50"
                    onClick={() => selectCustomer(customer)}
                  >
                    <span className="font-medium text-gray-800">{customer.name}</span>
                    <span className="text-xs text-gray-500">{customer.phone}</span>
                  </button>
                ))}
                {!loadingCustomers && customers.length === 0 && (
                  <div className="px-3 py-3 text-sm text-gray-500">未匹配客户，可继续按散客收银。</div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-gray-700">数量</span>
                  <Input
                    type="number"
                    min={1}
                    value={cashierForm.quantity}
                    onChange={(event) => setCashierForm((prev) => ({ ...prev, quantity: Number(event.target.value) }))}
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-gray-700">支付方式</span>
                  <select
                    className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm"
                    value={cashierForm.paymentMethod}
                    onChange={(event) =>
                      setCashierForm((prev) => ({ ...prev, paymentMethod: event.target.value as ProductOrderPaymentMethod }))
                    }
                  >
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-4">
                <div>
                  <div className="text-sm text-gray-500">应收金额</div>
                  <div className="mt-1 text-2xl font-semibold text-rose-600">
                    {formatCurrency(getEffectivePrice(cashierProduct) * Number(cashierForm.quantity || 0))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => setCashierProduct(null)} disabled={submittingCashier}>
                    取消
                  </Button>
                  <Button onClick={submitCashier} disabled={submittingCashier} className="gap-2">
                    {submittingCashier && <Loader2 className="h-4 w-4 animate-spin" />}
                    确认收银
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <MarketingPageGeneratorDialog
        source={marketingPageSource}
        onClose={() => setMarketingPageSource(null)}
        onPublished={refresh}
      />
    </div>
  );
}
