import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Download, Eye, Loader2, Minus, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/UI';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { createProductOrder, getProductOrderProfit, getProductOrdersPaginated, refundProductOrder } from '@/api/order';
import { CustomerPicker } from '../components/CustomerPicker';
import { ProductCatalogPicker } from '../components/ProductCatalogPicker';
import {
  PRODUCT_ORDER_PAYMENT_METHOD_OPTIONS,
  PaymentMethodSelector,
  canUseMemberBalancePayment,
} from '../components/PaymentMethodSelector';
import { usePagination } from '@/hooks/usePagination';
import { useStoreStore } from '@/stores/storeStore';
import { useAuthStore } from '@/stores/authStore';
import { hasPermission } from '@/config/permissions';
import { exportToExcel } from '@/utils/excel';
import type { Customer, Product, ProductOrder, ProductOrderCreatePayload, ProductOrderItem, ProductOrderPaymentMethod, ProductOrderProfitDetail, ProductOrderStatus } from '@/types';
import type { ExportColumn } from '@/types/excel';

const ORDER_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'orderNo', header: '订单编号', width: 20 },
  { key: 'customerName', header: '客户', width: 12 },
  { key: 'customerPhone', header: '联系电话', width: 15 },
  { key: 'storeName', header: '门店', width: 20 },
  { key: 'itemSummary', header: '订单明细', width: 42 },
  { key: 'totalAmount', header: '订单金额', width: 12 },
  { key: 'paymentMethod', header: '支付方式', width: 12 },
  { key: 'status', header: '状态', width: 10 },
  { key: 'createdAt', header: '下单时间', width: 18 },
];

const STATUS_OPTIONS: Array<'全部' | ProductOrderStatus> = ['全部', '待付款', '已付款', '已完成', '已取消', '已退款'];
const CREATE_STATUS_OPTIONS: ProductOrderStatus[] = ['待付款', '已付款', '已完成'];

type DraftItem = {
  rowId: number;
  productId: string;
  productName: string;
  sku: string;
  categoryName: string;
  quantity: number;
  unitPrice: number;
};

type OrderFormState = {
  customerId?: number;
  customerName: string;
  customerPhone: string;
  storeId: string;
  status: ProductOrderStatus;
  paymentMethod: ProductOrderPaymentMethod;
  remark: string;
};

type DiscountFormState = {
  mode: 'none' | 'amount' | 'rate' | 'package_price';
  amount: string;
  rate: string;
  packagePrice: string;
};

type DiscountPreview = {
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  discountMode: 'none' | 'amount' | 'rate' | 'package_price';
  discountSource: 'order' | 'package' | 'manual';
  discountRate?: number;
  packagePrice?: number;
};

const DISCOUNT_MODE_OPTIONS: Array<{ value: DiscountFormState['mode']; label: string }> = [
  { value: 'none', label: '无优惠' },
  { value: 'amount', label: '优惠金额' },
  { value: 'rate', label: '折扣率' },
  { value: 'package_price', label: '套餐价' },
];

const createEmptyItem = (): DraftItem => ({
  rowId: Date.now() + Math.floor(Math.random() * 1000),
  productId: '',
  productName: '',
  sku: '',
  categoryName: '',
  quantity: 1,
  unitPrice: 0,
});

const createEmptyDiscount = (): DiscountFormState => ({
  mode: 'none',
  amount: '',
  rate: '',
  packagePrice: '',
});

function getDiscountPreview(totalAmount: number, discount: DiscountFormState): DiscountPreview {
  const grossAmount = Math.max(0, Number(totalAmount || 0));
  if (discount.mode === 'amount') {
    const discountAmount = Math.min(grossAmount, Math.max(0, Number(discount.amount) || 0));
    return {
      grossAmount,
      discountAmount,
      netAmount: Math.max(0, grossAmount - discountAmount),
      discountMode: 'amount' as const,
      discountSource: 'manual' as const,
    };
  }
  if (discount.mode === 'rate') {
    const discountRate = Math.min(1, Math.max(0, Number(discount.rate) || 0));
    const discountAmount = Number((grossAmount * (1 - discountRate)).toFixed(2));
    return {
      grossAmount,
      discountAmount,
      netAmount: Math.max(0, grossAmount - discountAmount),
      discountMode: 'rate' as const,
      discountRate,
      discountSource: 'manual' as const,
    };
  }
  if (discount.mode === 'package_price') {
    const packagePrice = Math.min(grossAmount, Math.max(0, Number(discount.packagePrice) || 0));
    const discountAmount = Math.max(0, grossAmount - packagePrice);
    return {
      grossAmount,
      discountAmount,
      netAmount: packagePrice,
      discountMode: 'package_price' as const,
      packagePrice,
      discountSource: 'package' as const,
    };
  }
  return {
    grossAmount,
    discountAmount: 0,
    netAmount: grossAmount,
    discountMode: 'none' as const,
    discountSource: 'order' as const,
  };
}

function formatCurrency(value: number) {
  return `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatPercent(value: number) {
  return `${(Number(value || 0) * 100).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
}

const PRODUCT_COST_SOURCE_LABELS: Record<string, string> = {
  order_snapshot: '订单成本快照',
  stock_movement: '出库确认',
  product_master: '商品档案成本',
  missing: '成本缺口',
  mixed: '多来源',
};

function getOrderItems(order: ProductOrder): ProductOrderItem[] {
  const items = Array.isArray(order.items) && order.items.length ? order.items : (order.orderItems ?? []).map((item) => ({
    id: item.id,
    itemId: item.itemId ?? undefined,
    itemType: item.itemType,
    productName: item.name,
    sku: '',
    quantity: Number(item.quantity),
    unitPrice: Number(item.unitPrice),
    subtotal: Number(item.subtotal),
    discount: Number(item.discount || 0),
    listAmount: item.listAmount === undefined ? undefined : Number(item.listAmount),
    totalDiscountAmount: item.totalDiscountAmount === undefined ? undefined : Number(item.totalDiscountAmount),
    netAmount: item.netAmount === undefined ? undefined : Number(item.netAmount),
    orderAllocatedDiscountAmount: item.orderAllocatedDiscountAmount === undefined ? undefined : Number(item.orderAllocatedDiscountAmount),
    itemDiscountAmount: item.itemDiscountAmount === undefined ? undefined : Number(item.itemDiscountAmount),
    payload: item.payload,
  }));
  return items;
}

function getOrderItemTypeLabel(item: ProductOrderItem) {
  const type = String(item.itemType ?? 'product').toLowerCase();
  const map: Record<string, string> = {
    product: '商品',
    goods: '商品',
    project: '项目',
    card: '卡项',
    recharge: '充值',
  };
  return map[type] ?? '其他';
}

function getProductItemName(item: ProductOrderItem) {
  return item.productName?.trim() || '未记录商品';
}

function getOrderItemAmount(item: ProductOrderItem) {
  return Number(item.netAmount ?? item.subtotal ?? Number(item.quantity || 0) * Number(item.unitPrice || 0));
}

function getOrderItemListAmount(item: ProductOrderItem) {
  return Number(item.listAmount ?? Number(item.quantity || 0) * Number(item.unitPrice || 0));
}

function getOrderItemDiscountAmount(item: ProductOrderItem) {
  return Number(item.totalDiscountAmount ?? item.discount ?? Math.max(0, getOrderItemListAmount(item) - getOrderItemAmount(item)));
}

function getOrderItemDirectDiscountAmount(item: ProductOrderItem) {
  return Number(item.itemDiscountAmount ?? 0);
}

function getOrderItemAllocatedDiscountAmount(item: ProductOrderItem) {
  return Number(item.orderAllocatedDiscountAmount ?? Math.max(0, getOrderItemDiscountAmount(item) - getOrderItemDirectDiscountAmount(item)));
}

function getOrderItemsAmount(items: ProductOrderItem[]) {
  return items.reduce((sum, item) => sum + getOrderItemAmount(item), 0);
}

function getDisplayOrderNo(order: ProductOrder) {
  return order.checkoutGroupNo || order.orderNo;
}

function getProductItemsSummary(items: ProductOrderItem[]) {
  return items.length
    ? items.map((item) => `${getOrderItemTypeLabel(item)}：${getProductItemName(item)} x${Number(item.quantity || 0)} ${formatCurrency(getOrderItemAmount(item))}`).join('；')
    : '未记录';
}

export function ProductOrderManagement() {
  const [statusFilter, setStatusFilter] = useState<'全部' | ProductOrderStatus>('全部');
  const [keyword, setKeyword] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<ProductOrder | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showProfit, setShowProfit] = useState(false);
  const [profitDetail, setProfitDetail] = useState<ProductOrderProfitDetail | null>(null);
  const [profitLoading, setProfitLoading] = useState(false);
  const [profitError, setProfitError] = useState('');
  const [refundSubmittingId, setRefundSubmittingId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState<OrderFormState>({
    customerId: undefined,
    customerName: '',
    customerPhone: '',
    storeId: '',
    status: '已完成',
    paymentMethod: '微信',
    remark: '',
  });
  const [draftItems, setDraftItems] = useState<DraftItem[]>([createEmptyItem()]);
  const [discountForm, setDiscountForm] = useState<DiscountFormState>(createEmptyDiscount());

  const currentStoreId = useStoreStore((state) => state.currentStoreId);
  const stores = useStoreStore((state) => state.stores);
  const loadStores = useStoreStore((state) => state.loadStores);
  const currentUser = useAuthStore((state) => state.user);

  useEffect(() => {
    if (!stores.length) {
      loadStores().catch(() => toast.error('门店列表加载失败，请稍后重试'));
    }
  }, [loadStores, stores.length]);

  const selectedOrderStore = useMemo(
    () => stores.find((store) => String(store.id) === form.storeId),
    [form.storeId, stores],
  );

  const filters = useMemo(
    () => ({
      status: statusFilter !== '全部' ? statusFilter : undefined,
      keyword: keyword || undefined,
      storeId: currentStoreId ?? undefined,
    }),
    [currentStoreId, keyword, statusFilter],
  );
  const {
    data: orders,
    total,
    page,
    pageSize,
    loading,
    setPage,
    setPageSize,
    refresh,
  } = usePagination<ProductOrder>(getProductOrdersPaginated, filters);

  const currentStoreName = useMemo(() => {
    if (!currentStoreId) return '全部门店';
    return stores.find((store) => store.id === currentStoreId)?.name || '当前门店';
  }, [currentStoreId, stores]);

  const totalAmount = useMemo(
    () => draftItems.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0),
    [draftItems],
  );
  const discountPreview = useMemo(() => getDiscountPreview(totalAmount, discountForm), [discountForm, totalAmount]);
  const canUseBalancePayment = useMemo(
    () => canUseMemberBalancePayment(selectedCustomer, discountPreview.netAmount),
    [discountPreview.netAmount, selectedCustomer],
  );

  const activeOrders = orders.filter((order) => !['已取消', '已退款'].includes(order.status));
  const completedCount = orders.filter((order) => order.status === '已完成').length;
  const pendingCount = orders.filter((order) => ['待付款', '已付款'].includes(order.status)).length;
  const activeAmount = activeOrders.reduce((sum, order) => sum + getOrderItemsAmount(getOrderItems(order)), 0);
  const canViewProductOrderProfit = useMemo(() => {
    const roles = currentUser?.roles ?? [];
    const permissions = currentUser?.permissions ?? [];
    const deniedPermissions = currentUser?.deniedPermissions ?? [];
    if (hasPermission(deniedPermissions, 'core:product-order-profit:view') || hasPermission(deniedPermissions, '*')) return false;
    return hasPermission(permissions, '*') || roles.includes('super_admin') || roles.includes('store_manager');
  }, [currentUser]);
  const canRefundOrder = useMemo(() => {
    const roles = currentUser?.roles ?? [];
    const permissions = currentUser?.permissions ?? [];
    const deniedPermissions = currentUser?.deniedPermissions ?? [];
    if (hasPermission(deniedPermissions, 'core:order:refund') || hasPermission(deniedPermissions, '*')) return false;
    return hasPermission(permissions, '*') || hasPermission(permissions, 'core:order:refund') || roles.includes('super_admin') || roles.includes('store_manager');
  }, [currentUser]);

  const getStatusColor = (status: ProductOrder['status']) => {
    switch (status) {
      case '待付款':
        return 'bg-yellow-100 text-yellow-700';
      case '已付款':
        return 'bg-blue-100 text-blue-700';
      case '已完成':
        return 'bg-green-100 text-green-700';
      case '已取消':
        return 'bg-gray-100 text-gray-600';
      case '已退款':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  const resetCreateForm = () => {
    const defaultStoreId = currentStoreId ?? stores[0]?.id ?? '';
    setForm({
      customerId: undefined,
      customerName: '',
      customerPhone: '',
      storeId: defaultStoreId ? String(defaultStoreId) : '',
      status: '已完成',
      paymentMethod: '微信',
      remark: '',
    });
    setCustomerSearch('');
    setSelectedCustomer(null);
    setDraftItems([createEmptyItem()]);
    setDiscountForm(createEmptyDiscount());
  };

  const handleOpenCreate = () => {
    resetCreateForm();
    setShowCreate(true);
  };

  const updateDraftItem = (rowId: number, patch: Partial<DraftItem>) => {
    setDraftItems((prev) => prev.map((item) => (item.rowId === rowId ? { ...item, ...patch } : item)));
  };

  const handleProductNameChange = (rowId: number, productName: string) => {
    setDraftItems((prev) =>
      prev.map((item) =>
        item.rowId === rowId
          ? {
              ...item,
              productId: '',
              productName,
              sku: item.productId ? '' : item.sku,
              categoryName: item.productId ? '' : item.categoryName,
            }
          : item,
      ),
    );
  };

  const handleProductSelect = (rowId: number, product: Product | null) => {
    if (!product) {
      updateDraftItem(rowId, { productId: '', productName: '', sku: '', categoryName: '' });
      return;
    }
    const unitPrice = Number(product.salePrice ?? product.retailPrice ?? 0);
    if (unitPrice <= 0) {
      toast.error('该商品档案未维护销售价，请先维护商品售价或手工录入单价');
    }
    updateDraftItem(rowId, {
      productId: String(product.id),
      productName: product.name,
      sku: product.sku,
      categoryName: product.categoryName,
      unitPrice,
    });
  };

  const changeItemQuantity = (rowId: number, delta: number) => {
    setDraftItems((prev) =>
      prev.map((item) => (item.rowId === rowId ? { ...item, quantity: Math.max(1, Number(item.quantity || 1) + delta) } : item)),
    );
  };

  const addDraftItem = () => {
    setDraftItems((prev) => [...prev, createEmptyItem()]);
  };

  const removeDraftItem = (rowId: number) => {
    setDraftItems((prev) => (prev.length <= 1 ? prev : prev.filter((item) => item.rowId !== rowId)));
  };

  const handleStoreChange = (storeId: string) => {
    setForm((prev) => ({
      ...prev,
      storeId,
      customerId: undefined,
      customerName: '',
      customerPhone: '',
    }));
    setCustomerSearch('');
  };

  const handleCustomerInputChange = (value: string) => {
    setCustomerSearch(value);
    setSelectedCustomer(null);
    setForm((prev) => ({
      ...prev,
      customerId: undefined,
      customerName: value,
      customerPhone: prev.customerId ? '' : prev.customerPhone,
      paymentMethod: prev.paymentMethod === '会员卡划扣' ? '微信' : prev.paymentMethod,
    }));
  };

  const handleSelectCustomer = (customer: Customer | null) => {
    setSelectedCustomer(customer);
    if (!customer) {
      setForm((prev) => ({
        ...prev,
        customerId: undefined,
        customerName: '',
        customerPhone: prev.customerId ? '' : prev.customerPhone,
        paymentMethod: prev.paymentMethod === '会员卡划扣' ? '微信' : prev.paymentMethod,
      }));
      return;
    }
    setForm((prev) => ({
      ...prev,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
    }));
  };

  const handleSubmitOrder = async () => {
    const selectedStore = stores.find((store) => String(store.id) === form.storeId);
    const normalizedItems = draftItems
      .map((item) => ({
        ...item,
        productName: item.productName.trim(),
        sku: item.sku.trim(),
        quantity: Number(item.quantity || 0),
        unitPrice: Number(item.unitPrice || 0),
      }))
      .filter((item) => item.productName && item.quantity > 0 && item.unitPrice >= 0);

    if (!form.customerName.trim()) {
      toast.error('请填写客户姓名');
      return;
    }
    if (!form.storeId) {
      toast.error('请选择订单门店');
      return;
    }
    if (!normalizedItems.length) {
      toast.error('请至少添加一条商品明细');
      return;
    }
    if (form.paymentMethod === '会员卡划扣' && !canUseBalancePayment) {
      toast.error('该客户会员余额不足，请更换支付方式');
      return;
    }

    const payload: ProductOrderCreatePayload = {
      customerId: form.customerId,
      customerName: form.customerName.trim(),
      customerPhone: form.customerPhone.trim(),
      storeId: Number(form.storeId),
      storeName: selectedStore?.name || currentStoreName,
      items: normalizedItems.map((item) => ({
        itemType: 'product',
        itemId: item.productId ? Number(item.productId) : undefined,
        productId: item.productId ? Number(item.productId) : undefined,
        productName: item.productName,
        name: item.productName,
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        listAmount: item.quantity * item.unitPrice,
        subtotal: item.quantity * item.unitPrice,
      })),
      totalAmount: discountPreview.netAmount,
      discountMode: discountPreview.discountMode,
      discountAmount: discountPreview.discountMode === 'amount' ? discountPreview.discountAmount : undefined,
      discountRate: discountPreview.discountRate,
      packagePrice: discountPreview.packagePrice,
      allocationMethod: 'price_ratio',
      discountSource: discountPreview.discountSource,
      status: form.status,
      paymentMethod: form.paymentMethod,
      paidAmount: ['已付款', '已完成'].includes(form.status) ? discountPreview.netAmount : 0,
      remark: form.remark.trim() || undefined,
      source: 'admin',
    };

    setSubmitting(true);
    try {
      await createProductOrder(payload);
      toast.success('商品订单已创建');
      setShowCreate(false);
      refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : '商品订单创建失败，请稍后重试';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleExport = () => {
    exportToExcel(
      orders.map((order) => {
        const items = getOrderItems(order);
        return {
          ...order,
          itemSummary: getProductItemsSummary(items),
          totalAmount: getOrderItemsAmount(items),
        };
      }),
      ORDER_EXPORT_COLUMNS,
      '商品订单报表',
    );
  };

  const handleOpenProfit = async (order: ProductOrder) => {
    setSelectedOrder(order);
    setShowProfit(true);
    setProfitDetail(null);
    setProfitError('');
    setProfitLoading(true);
    try {
      const detail = await getProductOrderProfit(order.id);
      setProfitDetail(detail);
    } catch (error) {
      const message = error instanceof Error ? error.message : '利润明细加载失败，请稍后重试';
      setProfitError(message);
      toast.error(message);
    } finally {
      setProfitLoading(false);
    }
  };

  const handleRefundOrder = async (order: ProductOrder) => {
    const refundableAmount = Number(order.netAmount ?? order.totalAmount ?? 0);
    if (refundableAmount <= 0) {
      toast.error('该订单没有可退款金额');
      return;
    }
    const amountText = window.prompt(`请输入退款金额，最大 ${formatCurrency(refundableAmount)}`, String(refundableAmount));
    if (amountText === null) return;
    const amount = Number(amountText);
    if (!Number.isFinite(amount) || amount <= 0 || amount > refundableAmount) {
      toast.error('退款金额必须大于 0，且不能超过订单实收金额');
      return;
    }
    const reason = window.prompt('请输入退款原因', '商品订单退款');
    if (reason === null) return;
    if (!window.confirm(`确认退款 ${formatCurrency(amount)}？退款后订单会进入已退款状态，并同步日结。`)) return;

    setRefundSubmittingId(order.id);
    try {
      await refundProductOrder(order.id, { amount, reason: reason.trim() || '商品订单退款' });
      toast.success('退款成功，已同步退款流水');
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '退款失败，请稍后重试');
    } finally {
      setRefundSubmittingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="text-sm text-gray-500">首页 / 订单管理 / 商品订单管理</div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">商品订单管理</h2>
          <p className="mt-1 text-sm text-gray-500">
            当前范围：{currentStoreName}；管理端开单与 Ami Aura Lite 收银单统一进入本列表。
          </p>
        </div>
        <Button className="gap-2" onClick={handleOpenCreate}>
          <Plus className="h-4 w-4" /> 新增商品订单
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              className="w-64 pl-9"
              placeholder="搜索订单号、客户、手机号"
              value={keyword}
              onChange={(event) => {
                setKeyword(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <select
            className="h-9 rounded-md border border-gray-300 px-3 text-sm"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as '全部' | ProductOrderStatus);
              setPage(1);
            }}
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={handleExport}>
            <Download className="h-4 w-4" /> 导出报表
          </Button>
          <div className="text-sm text-gray-500">共 {total} 条订单</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-lg bg-gradient-to-br from-blue-50 to-blue-100 p-4">
          <div className="mb-1 text-sm text-blue-600">总订单数</div>
          <div className="text-2xl font-bold text-blue-900">{total}</div>
        </div>
        <div className="rounded-lg bg-gradient-to-br from-green-50 to-green-100 p-4">
          <div className="mb-1 text-sm text-green-600">已完成</div>
          <div className="text-2xl font-bold text-green-900">{completedCount}</div>
        </div>
        <div className="rounded-lg bg-gradient-to-br from-yellow-50 to-yellow-100 p-4">
          <div className="mb-1 text-sm text-yellow-600">待处理</div>
          <div className="text-2xl font-bold text-yellow-900">{pendingCount}</div>
        </div>
        <div className="rounded-lg bg-gradient-to-br from-purple-50 to-purple-100 p-4">
          <div className="mb-1 text-sm text-purple-600">当前页金额</div>
          <div className="text-2xl font-bold text-purple-900">{formatCurrency(activeAmount)}</div>
        </div>
      </div>

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
              <TableHead>订单编号</TableHead>
              <TableHead>客户</TableHead>
              <TableHead>订单明细</TableHead>
              <TableHead>明细数</TableHead>
              <TableHead>订单金额</TableHead>
              <TableHead>支付方式</TableHead>
              <TableHead>门店</TableHead>
              <TableHead>来源</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>下单时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => {
              const items = getOrderItems(order);
              return (
                <TableRow key={order.id} className="hover:bg-blue-50/30">
                  <TableCell className="font-mono text-sm font-medium text-blue-600">
                    <div>{getDisplayOrderNo(order)}</div>
                    {order.checkoutGroupNo && order.checkoutGroupNo !== order.orderNo ? (
                      <div className="text-xs font-normal text-gray-400">分单 {order.orderNo}</div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-gray-800">{order.customerName || '散客'}</div>
                    <div className="text-xs text-gray-500">{order.customerPhone || '-'}</div>
                  </TableCell>
                  <TableCell className="min-w-44 max-w-64">
                    {items.length ? (
                      <div className="space-y-1">
                        {items.slice(0, 2).map((item, index) => {
                          const itemName = getProductItemName(item);
                          return (
                            <div key={`${item.id}-${index}`} className="flex items-center gap-2 text-sm">
                              <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">{getOrderItemTypeLabel(item)}</span>
                              <span className="truncate font-medium text-gray-800" title={itemName}>
                                {itemName}
                              </span>
                              <span className="shrink-0 text-xs text-gray-500">x{Number(item.quantity || 0)}</span>
                              <span className="shrink-0 text-xs font-medium text-gray-700">{formatCurrency(getOrderItemAmount(item))}</span>
                            </div>
                          );
                        })}
                        {items.length > 2 && (
                          <div className="text-xs text-gray-500">另 {items.length - 2} 项，点详情查看</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">未记录</span>
                    )}
                  </TableCell>
                  <TableCell>{items.length}</TableCell>
                  <TableCell className="font-medium text-gray-800">
                    <div>{formatCurrency(Number(order.netAmount ?? getOrderItemsAmount(items)))}</div>
                    {Number(order.totalDiscountAmount || 0) > 0 && (
                      <div className="text-xs font-normal text-amber-600">优惠 {formatCurrency(Number(order.totalDiscountAmount || 0))}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">{order.paymentMethod}</TableCell>
                  <TableCell className="text-sm text-gray-600">{order.storeName || '-'}</TableCell>
                  <TableCell className="text-sm text-gray-600">{order.source === 'terminal' ? 'Ami Aura Lite' : '管理端'}</TableCell>
                  <TableCell>
                    <span className={`inline-flex rounded px-2 py-1 text-xs font-medium ${getStatusColor(order.status)}`}>
                      {order.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">{order.createdAt}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-col items-end gap-1.5">
                      {canViewProductOrderProfit && (
                        <button
                          onClick={() => void handleOpenProfit(order)}
                          className="inline-flex items-center gap-1 text-sm text-emerald-600 hover:text-emerald-700"
                          title="查看商品订单利润明细"
                        >
                          <BarChart3 className="h-3.5 w-3.5" /> 利润
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setSelectedOrder(order);
                          setShowDetail(true);
                        }}
                        className="inline-flex items-center gap-1 text-sm text-blue-500 hover:text-blue-600"
                      >
                        <Eye className="h-3.5 w-3.5" /> 详情
                      </button>
                      {canRefundOrder && !['已取消', '已退款'].includes(order.status) && (
                        <button
                          onClick={() => void handleRefundOrder(order)}
                          disabled={refundSubmittingId === order.id}
                          className="inline-flex items-center gap-1 text-sm text-red-500 hover:text-red-600 disabled:text-gray-300"
                        >
                          <RotateCcw className="h-3.5 w-3.5" /> {refundSubmittingId === order.id ? '退款中' : '退款'}
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {orders.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="py-12 text-center text-gray-400">
                  暂无匹配的商品订单
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

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto" aria-describedby="create-order-desc">
          <DialogHeader>
            <DialogTitle>新增商品订单</DialogTitle>
            <DialogDescription id="create-order-desc">
              管理端手工开单会写入商品订单接口；Ami Aura Lite 收银继续通过终端收银接口写入同一订单列表。
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 grid grid-cols-1 gap-4 md:grid-cols-2">
            <CustomerPicker
              value={customerSearch}
              onValueChange={handleCustomerInputChange}
              onSelect={handleSelectCustomer}
              selectedCustomerId={form.customerId}
              storeName={selectedOrderStore?.name}
              label="客户姓名"
              required
              placeholder={form.storeId ? '搜索或选择该门店客户' : '请先选择订单门店'}
              disabled={!form.storeId}
              allowManualInput
            />
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-gray-700">手机号码</span>
              <Input
                value={form.customerPhone}
                onChange={(event) => setForm((prev) => ({ ...prev, customerPhone: event.target.value }))}
                placeholder="用于匹配客户档案"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-gray-700">订单门店 *</span>
              <select
                className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm"
                value={form.storeId}
                onChange={(event) => handleStoreChange(event.target.value)}
              >
                <option value="">请选择门店</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-gray-700">订单状态</span>
                <select
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm"
                  value={form.status}
                  onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as ProductOrderStatus }))}
                >
                  {CREATE_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-gray-700">支付方式</span>
                <PaymentMethodSelector<ProductOrderPaymentMethod>
                  value={form.paymentMethod}
                  onChange={(paymentMethod) => setForm((prev) => ({ ...prev, paymentMethod }))}
                  methods={PRODUCT_ORDER_PAYMENT_METHOD_OPTIONS as Array<{ value: ProductOrderPaymentMethod; label: string; requiresMemberBalance?: boolean }>}
                  customer={selectedCustomer}
                  amount={discountPreview.netAmount}
                  columnsClassName="grid-cols-2"
                />
              </label>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-gray-800">商品明细</h3>
                <p className="mt-1 text-xs text-gray-500">可从商品档案选择，也可手工录入临时商品。</p>
              </div>
              <Button variant="outline" size="sm" onClick={addDraftItem} className="gap-1">
                <Plus className="h-4 w-4" /> 添加商品
              </Button>
            </div>

            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-50/60">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-left">
                  <thead className="bg-white/80 text-xs font-medium text-gray-500">
                    <tr>
                      <th className="px-4 py-3">商品</th>
                      <th className="w-32 px-4 py-3">类型</th>
                      <th className="w-32 px-4 py-3">SKU</th>
                      <th className="w-32 px-4 py-3">数量</th>
                      <th className="w-32 px-4 py-3">单价</th>
                      <th className="w-28 px-4 py-3 text-right">小计</th>
                      <th className="w-16 px-4 py-3 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {draftItems.map((item) => {
                      const subtotal = Number(item.quantity || 0) * Number(item.unitPrice || 0);
                      return (
                        <tr key={item.rowId} className="bg-gray-50/60">
                          <td className="px-4 py-3">
                            <ProductCatalogPicker
                              value={item.productName}
                              onValueChange={(value) => handleProductNameChange(item.rowId, value)}
                              onSelect={(product) => handleProductSelect(item.rowId, product)}
                              selectedProductId={item.productId}
                              storeName={selectedOrderStore?.name}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1">
                              <span className="w-fit rounded-full bg-white px-2 py-0.5 text-xs font-medium text-blue-700">
                                {item.productId ? '商品' : '临时商品'}
                              </span>
                              <span className="truncate text-xs text-gray-500">{item.categoryName || '手工录入'}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Input
                              value={item.sku}
                              onChange={(event) => updateDraftItem(item.rowId, { sku: event.target.value })}
                              placeholder="SKU"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => changeItemQuantity(item.rowId, -1)}
                                className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white disabled:opacity-40"
                                disabled={item.quantity <= 1}
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <Input
                                type="number"
                                min={1}
                                value={item.quantity}
                                onChange={(event) => updateDraftItem(item.rowId, { quantity: Math.max(1, Number(event.target.value) || 1) })}
                                className="h-9 w-16 text-center"
                              />
                              <button
                                type="button"
                                onClick={() => changeItemQuantity(item.rowId, 1)}
                                className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Input
                              type="number"
                              min={0}
                              value={item.unitPrice}
                              onChange={(event) => updateDraftItem(item.rowId, { unitPrice: Math.max(0, Number(event.target.value) || 0) })}
                              className="h-9"
                            />
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">{formatCurrency(subtotal)}</td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => removeDraftItem(item.rowId)}
                              disabled={draftItems.length <= 1}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-rose-500 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                              aria-label="删除商品明细"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
                <span className="text-sm text-gray-500">小计</span>
                <span className="text-lg font-semibold text-gray-900">{formatCurrency(totalAmount)}</span>
              </div>
            </div>
          </div>

          <label className="mt-4 block space-y-1.5">
            <span className="text-sm font-medium text-gray-700">备注</span>
            <textarea
              className="min-h-20 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              value={form.remark}
              onChange={(event) => setForm((prev) => ({ ...prev, remark: event.target.value }))}
              placeholder="可记录导购说明、线下收款流水号或客户特殊要求"
            />
          </label>

          <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-gray-700">优惠方式</span>
                <select
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm"
                  value={discountForm.mode}
                  onChange={(event) =>
                    setDiscountForm((prev) => ({ ...prev, mode: event.target.value as DiscountFormState['mode'] }))
                  }
                >
                  {DISCOUNT_MODE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {discountForm.mode === 'amount' && (
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-gray-700">优惠金额</span>
                  <Input
                    type="number"
                    min={0}
                    value={discountForm.amount}
                    onChange={(event) => setDiscountForm((prev) => ({ ...prev, amount: event.target.value }))}
                    placeholder="例如 120"
                  />
                </label>
              )}
              {discountForm.mode === 'rate' && (
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-gray-700">折扣率</span>
                  <Input
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={discountForm.rate}
                    onChange={(event) => setDiscountForm((prev) => ({ ...prev, rate: event.target.value }))}
                    placeholder="0.8 表示八折"
                  />
                </label>
              )}
              {discountForm.mode === 'package_price' && (
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-gray-700">套餐成交价</span>
                  <Input
                    type="number"
                    min={0}
                    value={discountForm.packagePrice}
                    onChange={(event) => setDiscountForm((prev) => ({ ...prev, packagePrice: event.target.value }))}
                    placeholder="例如 680"
                  />
                </label>
              )}
              <div className="flex flex-col justify-end rounded-lg bg-white px-3 py-2">
                <span className="text-xs text-gray-500">本单优惠</span>
                <span className="text-lg font-semibold text-blue-700">{formatCurrency(discountPreview.discountAmount)}</span>
              </div>
              <div className="flex flex-col justify-end rounded-lg bg-white px-3 py-2">
                <span className="text-xs text-gray-500">应收净额</span>
                <span className="text-lg font-semibold text-gray-900">{formatCurrency(discountPreview.netAmount)}</span>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-4">
            <div>
              <div className="text-sm text-gray-500">原价小计</div>
              <div className="mt-1 text-2xl font-semibold text-blue-600">{formatCurrency(discountPreview.grossAmount)}</div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setShowCreate(false)} disabled={submitting}>
                取消
              </Button>
              <Button onClick={handleSubmitOrder} disabled={submitting} className="gap-2">
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                创建订单
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto" aria-describedby="order-detail-desc">
          <DialogHeader>
            <DialogTitle>订单详情</DialogTitle>
            <DialogDescription id="order-detail-desc">查看商品订单明细、收款状态和来源。</DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <div className="mt-4 space-y-6">
              <div className="grid grid-cols-1 gap-4 rounded-lg bg-gray-50 p-4 md:grid-cols-3">
                <div>
                  <div className="text-sm text-gray-600">订单编号</div>
                  <div className="mt-1 font-mono text-sm font-medium text-gray-800">{getDisplayOrderNo(selectedOrder)}</div>
                  {selectedOrder.checkoutGroupNo && selectedOrder.checkoutGroupNo !== selectedOrder.orderNo ? (
                    <div className="mt-0.5 text-xs text-gray-500">物理分单号：{selectedOrder.orderNo}</div>
                  ) : null}
                </div>
                <div>
                  <div className="text-sm text-gray-600">客户</div>
                  <div className="mt-1 font-medium text-gray-800">{selectedOrder.customerName || '散客'}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">联系电话</div>
                  <div className="mt-1 text-sm text-gray-800">{selectedOrder.customerPhone || '-'}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">门店</div>
                  <div className="mt-1 text-sm text-gray-800">{selectedOrder.storeName || '-'}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">支付方式</div>
                  <div className="mt-1 text-sm text-gray-800">{selectedOrder.paymentMethod}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">状态</div>
                  <div className="mt-1">
                    <span className={`inline-flex rounded px-2 py-1 text-xs font-medium ${getStatusColor(selectedOrder.status)}`}>
                      {selectedOrder.status}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">来源</div>
                  <div className="mt-1 text-sm text-gray-800">{selectedOrder.source === 'terminal' ? 'Ami Aura Lite' : '管理端'}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">下单时间</div>
                  <div className="mt-1 text-sm text-gray-800">{selectedOrder.createdAt}</div>
                </div>
                {selectedOrder.completedAt && (
                  <div>
                    <div className="text-sm text-gray-600">完成时间</div>
                    <div className="mt-1 text-sm text-gray-800">{selectedOrder.completedAt}</div>
                  </div>
                )}
              </div>

              {selectedOrder.memberBalanceDeduction && (
                <div className="grid gap-3 rounded-lg border border-blue-100 bg-blue-50/50 p-4 text-sm md:grid-cols-4">
                  <div>
                    <div className="text-gray-500">本金划扣</div>
                    <div className="mt-1 font-semibold text-gray-900">{formatCurrency(selectedOrder.memberBalanceDeduction.cashAmount)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">赠送划扣</div>
                    <div className="mt-1 font-semibold text-gray-900">{formatCurrency(selectedOrder.memberBalanceDeduction.giftAmount)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">划扣后现金余额</div>
                    <div className="mt-1 font-semibold text-gray-900">{formatCurrency(selectedOrder.memberBalanceDeduction.cashBalanceAfter)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">划扣后赠送余额</div>
                    <div className="mt-1 font-semibold text-gray-900">{formatCurrency(selectedOrder.memberBalanceDeduction.giftBalanceAfter)}</div>
                  </div>
                </div>
              )}

              <div>
                <h4 className="mb-3 font-medium text-gray-800">订单明细</h4>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50/80">
                      <TableHead>类型</TableHead>
                      <TableHead>明细名称</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>数量</TableHead>
                      <TableHead>单价</TableHead>
                      <TableHead className="text-right">原价</TableHead>
                      <TableHead className="text-right">单项优惠</TableHead>
                      <TableHead className="text-right">分摊优惠</TableHead>
                      <TableHead className="text-right">实收</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getOrderItems(selectedOrder).map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <span className="inline-flex rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">{getOrderItemTypeLabel(item)}</span>
                        </TableCell>
                        <TableCell className="font-medium text-gray-800">{item.productName}</TableCell>
                        <TableCell className="font-mono text-sm text-gray-600">{item.sku || '-'}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>{formatCurrency(item.unitPrice)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(getOrderItemListAmount(item))}</TableCell>
                        <TableCell className="text-right text-amber-600">{formatCurrency(getOrderItemDirectDiscountAmount(item))}</TableCell>
                        <TableCell className="text-right text-orange-600">{formatCurrency(getOrderItemAllocatedDiscountAmount(item))}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(getOrderItemAmount(item))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {selectedOrder.remark && (
                <div className="rounded-lg bg-gray-50 p-4">
                  <div className="text-sm text-gray-600">备注</div>
                  <div className="mt-1 text-sm text-gray-800">{selectedOrder.remark}</div>
                </div>
              )}

              <div className="flex justify-end border-t border-gray-200 pt-4">
                <div className="text-right">
                  <div className="text-sm text-gray-600">订单实收</div>
                  <div className="mt-1 text-2xl font-semibold text-blue-600">
                    {formatCurrency(Number(selectedOrder.netAmount ?? getOrderItemsAmount(getOrderItems(selectedOrder))))}
                  </div>
                  {Number(selectedOrder.totalDiscountAmount || 0) > 0 && (
                    <div className="mt-1 text-sm text-amber-600">
                      原价 {formatCurrency(Number(selectedOrder.listAmount || 0))}，优惠 {formatCurrency(Number(selectedOrder.totalDiscountAmount || 0))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showProfit} onOpenChange={setShowProfit}>
        <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto" aria-describedby="product-order-profit-desc">
          <DialogHeader>
            <DialogTitle>商品订单利润明细</DialogTitle>
            <DialogDescription id="product-order-profit-desc">
              逐单查看商品收入、商品成本、提成成本与毛利，成本优先引用订单成本快照。
            </DialogDescription>
          </DialogHeader>

          {profitLoading && (
            <div className="flex items-center justify-center py-16 text-gray-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin text-emerald-600" />
              正在加载利润明细...
            </div>
          )}

          {!profitLoading && profitError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{profitError}</div>
          )}

          {!profitLoading && !profitError && profitDetail && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-3 rounded-lg bg-gray-50 p-4 md:grid-cols-4">
                <div>
                  <div className="text-sm text-gray-600">订单编号</div>
                  <div className="mt-1 font-mono text-sm font-medium text-gray-800">{profitDetail.orderNo}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">客户</div>
                  <div className="mt-1 font-medium text-gray-800">{profitDetail.customerName || '散客'}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">门店</div>
                  <div className="mt-1 text-sm text-gray-800">{profitDetail.storeName || selectedOrder?.storeName || '-'}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">成本来源</div>
                  <div className="mt-1 text-sm font-medium text-gray-800">
                    {PRODUCT_COST_SOURCE_LABELS[profitDetail.costSource] ?? profitDetail.costSource}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                <div className="rounded-lg border border-gray-200 p-4">
                  <div className="text-sm text-gray-500">商品净收入</div>
                  <div className="mt-2 text-xl font-semibold text-gray-900">{formatCurrency(profitDetail.totalSalesAmount)}</div>
                  {profitDetail.discountAmount > 0 && (
                    <div className="mt-1 text-xs text-amber-600">优惠 {formatCurrency(profitDetail.discountAmount)}</div>
                  )}
                </div>
                <div className="rounded-lg border border-gray-200 p-4">
                  <div className="text-sm text-gray-500">商品成本</div>
                  <div className="mt-2 text-xl font-semibold text-gray-900">{formatCurrency(profitDetail.productCost)}</div>
                </div>
                <div className="rounded-lg border border-gray-200 p-4">
                  <div className="text-sm text-gray-500">提成成本</div>
                  <div className="mt-2 text-xl font-semibold text-gray-900">
                    {formatCurrency(profitDetail.commissionCost + profitDetail.unassignedCommissionCost)}
                  </div>
                  {profitDetail.unassignedCommissionCost > 0 && (
                    <div className="mt-1 text-xs text-amber-600">含未分配 {formatCurrency(profitDetail.unassignedCommissionCost)}</div>
                  )}
                </div>
                <div className="rounded-lg border border-gray-200 p-4">
                  <div className="text-sm text-gray-500">毛利</div>
                  <div className={`mt-2 text-xl font-semibold ${profitDetail.grossProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {formatCurrency(profitDetail.grossProfit)}
                  </div>
                </div>
                <div className="rounded-lg border border-gray-200 p-4">
                  <div className="text-sm text-gray-500">毛利率</div>
                  <div className={`mt-2 text-xl font-semibold ${profitDetail.grossMargin >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {formatPercent(profitDetail.grossMargin)}
                  </div>
                </div>
              </div>

              {profitDetail.missingReasons.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  <div className="text-sm font-medium text-amber-800">数据提示</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {profitDetail.missingReasons.map((reason) => (
                      <span key={reason} className="rounded-full bg-white px-2.5 py-1 text-xs text-amber-700 shadow-sm">
                        {reason}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h4 className="mb-3 font-medium text-gray-800">商品行毛利</h4>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50/80">
                      <TableHead>商品</TableHead>
                      <TableHead>数量</TableHead>
                      <TableHead className="text-right">收入</TableHead>
                      <TableHead className="text-right">单位成本</TableHead>
                      <TableHead className="text-right">商品成本</TableHead>
                      <TableHead className="text-right">提成</TableHead>
                      <TableHead className="text-right">毛利</TableHead>
                      <TableHead className="text-right">毛利率</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profitDetail.items.map((item) => (
                      <TableRow key={item.orderItemId}>
                        <TableCell>
                          <div className="font-medium text-gray-800">{item.productName}</div>
                          <div className="mt-1 text-xs text-gray-500">
                            {[item.sku, PRODUCT_COST_SOURCE_LABELS[item.costSource] ?? item.costSource].filter(Boolean).join(' / ')}
                          </div>
                          {item.missingReasons.length > 0 && (
                            <div className="mt-1 text-xs text-amber-600">{item.missingReasons.join('、')}</div>
                          )}
                        </TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.netSalesAmount)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.unitCost)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.productCost)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.commissionCost)}</TableCell>
                        <TableCell className={`text-right font-medium ${item.grossProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                          {formatCurrency(item.grossProfit)}
                        </TableCell>
                        <TableCell className={`text-right font-medium ${item.grossMargin >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                          {formatPercent(item.grossMargin)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div>
                  <h4 className="mb-3 font-medium text-gray-800">提成成本明细</h4>
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50/80">
                        <TableHead>商品/员工</TableHead>
                        <TableHead>规则</TableHead>
                        <TableHead className="text-right">基数</TableHead>
                        <TableHead className="text-right">提成</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {profitDetail.items.flatMap((item) =>
                        item.commissionRecords.map((record) => (
                          <TableRow key={`${item.orderItemId}-${record.id}`}>
                            <TableCell>
                              <div className="font-medium text-gray-800">{item.productName}</div>
                              <div className="text-xs text-gray-500">{record.staffUserName}</div>
                            </TableCell>
                            <TableCell className="text-sm text-gray-600">{record.ruleName || '-'}</TableCell>
                            <TableCell className="text-right">{formatCurrency(record.sourceAmount)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(record.amount)}</TableCell>
                          </TableRow>
                        )),
                      )}
                      {profitDetail.unassignedCommissionRecords.map((record) => (
                        <TableRow key={`unassigned-${record.id}`}>
                          <TableCell>
                            <div className="font-medium text-amber-700">未分配订单行</div>
                            <div className="text-xs text-gray-500">{record.staffUserName}</div>
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">{record.ruleName || '-'}</TableCell>
                          <TableCell className="text-right">{formatCurrency(record.sourceAmount)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(record.amount)}</TableCell>
                        </TableRow>
                      ))}
                      {profitDetail.items.every((item) => item.commissionRecords.length === 0) &&
                        profitDetail.unassignedCommissionRecords.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} className="py-8 text-center text-gray-400">
                              暂无提成成本明细
                            </TableCell>
                          </TableRow>
                        )}
                    </TableBody>
                  </Table>
                </div>

                <div>
                  <h4 className="mb-3 font-medium text-gray-800">商品出库扣减流水</h4>
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50/80">
                        <TableHead>商品</TableHead>
                        <TableHead>备注</TableHead>
                        <TableHead className="text-right">数量</TableHead>
                        <TableHead className="text-right">成本</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {profitDetail.stockMovements.map((movement) => (
                        <TableRow key={movement.id}>
                          <TableCell className="font-medium text-gray-800">{movement.productName}</TableCell>
                          <TableCell className="text-sm text-gray-600">{movement.remark || '-'}</TableCell>
                          <TableCell className="text-right">
                            {movement.quantity} {movement.unit || ''}
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(movement.costAmount)}</TableCell>
                        </TableRow>
                      ))}
                      {profitDetail.stockMovements.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="py-8 text-center text-gray-400">
                            暂无商品出库扣减流水
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
