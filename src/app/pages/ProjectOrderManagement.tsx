import { useEffect, useMemo, useState } from 'react';
import { Download, Eye, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { createProjectOrder, getProjectOrdersPaginated } from '@/api/order';
import { getCustomers } from '@/api/customer';
import { getProjects } from '@/api/project';
import { usePagination } from '@/hooks/usePagination';
import { useStoreStore } from '@/stores/storeStore';
import { exportToExcel } from '@/utils/excel';
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/UI';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import type {
  Customer,
  ProductOrder,
  ProductOrderCreatePayload,
  ProductOrderItem,
  ProductOrderPaymentMethod,
  ProductOrderStatus,
  Project,
} from '@/types';
import type { ExportColumn } from '@/types/excel';

const ORDER_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'orderNo', header: '订单编号', width: 20 },
  { key: 'customerName', header: '客户', width: 12 },
  { key: 'customerPhone', header: '联系电话', width: 15 },
  { key: 'storeName', header: '门店', width: 20 },
  { key: 'totalAmount', header: '总金额', width: 12 },
  { key: 'paymentMethod', header: '支付方式', width: 12 },
  { key: 'status', header: '状态', width: 10 },
  { key: 'createdAt', header: '下单时间', width: 18 },
];

const STATUS_OPTIONS: Array<'全部' | ProductOrderStatus> = ['全部', '待付款', '已付款', '已完成', '已取消', '已退款'];
const CREATE_STATUS_OPTIONS: ProductOrderStatus[] = ['待付款', '已付款', '已完成'];
const PAYMENT_METHODS: ProductOrderPaymentMethod[] = ['微信', '支付宝', '现金', '银行卡', '会员卡划扣'];

type DraftProjectItem = {
  rowId: number;
  projectId: string;
  projectName: string;
  projectType: string;
  duration: number;
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

const createEmptyItem = (): DraftProjectItem => ({
  rowId: Date.now() + Math.floor(Math.random() * 1000),
  projectId: '',
  projectName: '',
  projectType: '',
  duration: 60,
  quantity: 1,
  unitPrice: 0,
});

function formatCurrency(value: number) {
  return `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function getOrderItems(order: ProductOrder): ProductOrderItem[] {
  if (Array.isArray(order.items) && order.items.length) return order.items.filter((item) => item.itemType === 'project');
  return (order.orderItems ?? [])
    .filter((item) => item.itemType === 'project')
    .map((item) => ({
      id: item.id,
      itemId: item.itemId ?? undefined,
      itemType: item.itemType,
      productName: item.name,
      sku: '',
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      subtotal: Number(item.subtotal),
      discount: Number(item.discount || 0),
      payload: item.payload,
    }));
}

export function ProjectOrderManagement() {
  const [statusFilter, setStatusFilter] = useState<'全部' | ProductOrderStatus>('全部');
  const [keyword, setKeyword] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<ProductOrder | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerOptions, setShowCustomerOptions] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [form, setForm] = useState<OrderFormState>({
    customerId: undefined,
    customerName: '',
    customerPhone: '',
    storeId: '',
    status: '已完成',
    paymentMethod: '微信',
    remark: '',
  });
  const [draftItems, setDraftItems] = useState<DraftProjectItem[]>([createEmptyItem()]);

  const currentStoreId = useStoreStore((state) => state.currentStoreId);
  const stores = useStoreStore((state) => state.stores);
  const loadStores = useStoreStore((state) => state.loadStores);

  useEffect(() => {
    if (!stores.length) {
      loadStores().catch(() => toast.error('门店列表加载失败，请稍后重试'));
    }
  }, [loadStores, stores.length]);

  useEffect(() => {
    setLoadingProjects(true);
    getProjects()
      .then((items) => setProjects(items.filter((project) => project.status)))
      .catch(() => toast.error('项目列表加载失败，请稍后重试'))
      .finally(() => setLoadingProjects(false));
  }, []);

  const selectedOrderStore = useMemo(() => stores.find((store) => String(store.id) === form.storeId), [form.storeId, stores]);

  const selectableProjects = useMemo(() => {
    if (!selectedOrderStore) return [];
    return projects.filter((project) => project.storeName === selectedOrderStore.name);
  }, [projects, selectedOrderStore]);

  useEffect(() => {
    if (!showCreate || !selectedOrderStore) {
      setCustomers([]);
      setLoadingCustomers(false);
      return;
    }

    let ignore = false;
    const timer = window.setTimeout(() => {
      setLoadingCustomers(true);
      getCustomers({
        storeName: selectedOrderStore.name,
        keyword: customerSearch.trim() || undefined,
      })
        .then((list) => {
          if (!ignore) setCustomers(list.slice(0, 20));
        })
        .catch(() => {
          if (!ignore) toast.error('客户数据加载失败，可先手工录入客户信息');
        })
        .finally(() => {
          if (!ignore) setLoadingCustomers(false);
        });
    }, 200);

    return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, [customerSearch, selectedOrderStore, showCreate]);

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
  } = usePagination<ProductOrder>(getProjectOrdersPaginated, filters);

  const currentStoreName = useMemo(() => {
    if (!currentStoreId) return '全部门店';
    return stores.find((store) => store.id === currentStoreId)?.name || '当前门店';
  }, [currentStoreId, stores]);

  const totalAmount = useMemo(
    () => draftItems.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0),
    [draftItems],
  );

  const activeOrders = orders.filter((order) => !['已取消', '已退款'].includes(order.status));
  const completedCount = orders.filter((order) => order.status === '已完成').length;
  const pendingCount = orders.filter((order) => ['待付款', '已付款'].includes(order.status)).length;
  const activeAmount = activeOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);

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
    setShowCustomerOptions(false);
    setDraftItems([createEmptyItem()]);
  };

  const handleOpenCreate = () => {
    resetCreateForm();
    setShowCreate(true);
  };

  const updateDraftItem = (rowId: number, patch: Partial<DraftProjectItem>) => {
    setDraftItems((prev) => prev.map((item) => (item.rowId === rowId ? { ...item, ...patch } : item)));
  };

  const handleProjectSelect = (rowId: number, projectId: string) => {
    const project = selectableProjects.find((item) => String(item.id) === projectId);
    if (!project) {
      updateDraftItem(rowId, { projectId, projectName: '', projectType: '', duration: 60, unitPrice: 0 });
      return;
    }
    updateDraftItem(rowId, {
      projectId,
      projectName: project.name,
      projectType: project.type,
      duration: Number(project.duration || 60),
      unitPrice: Number(project.price || 0),
    });
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
    setCustomers([]);
    setShowCustomerOptions(false);
    setDraftItems([createEmptyItem()]);
  };

  const handleCustomerInputChange = (value: string) => {
    setCustomerSearch(value);
    setForm((prev) => ({
      ...prev,
      customerId: undefined,
      customerName: value,
      customerPhone: prev.customerId ? '' : prev.customerPhone,
    }));
    setShowCustomerOptions(true);
  };

  const handleSelectCustomer = (customer: Customer) => {
    setForm((prev) => ({
      ...prev,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
    }));
    setCustomerSearch(customer.name);
    setShowCustomerOptions(false);
  };

  const handleSubmitOrder = async () => {
    const selectedStore = stores.find((store) => String(store.id) === form.storeId);
    const normalizedItems = draftItems
      .map((item) => ({
        ...item,
        projectName: item.projectName.trim(),
        projectType: item.projectType.trim(),
        quantity: Number(item.quantity || 0),
        unitPrice: Number(item.unitPrice || 0),
        duration: Number(item.duration || 0),
      }))
      .filter((item) => item.projectName && item.quantity > 0 && item.unitPrice >= 0);

    if (!form.customerName.trim()) {
      toast.error('请填写客户姓名');
      return;
    }
    if (!form.storeId) {
      toast.error('请选择订单门店');
      return;
    }
    if (!normalizedItems.length) {
      toast.error('请至少添加一条项目明细');
      return;
    }

    const payload: ProductOrderCreatePayload = {
      customerId: form.customerId,
      customerName: form.customerName.trim(),
      customerPhone: form.customerPhone.trim(),
      storeId: Number(form.storeId),
      storeName: selectedStore?.name || currentStoreName,
      items: normalizedItems.map((item) => ({
        itemType: 'project',
        itemId: item.projectId ? Number(item.projectId) : undefined,
        productName: item.projectName,
        name: item.projectName,
        sku: item.projectType,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.quantity * item.unitPrice,
        payload: {
          projectId: item.projectId ? Number(item.projectId) : undefined,
          projectName: item.projectName,
          projectType: item.projectType,
          duration: item.duration,
        },
      })),
      totalAmount,
      status: form.status,
      paymentMethod: form.paymentMethod,
      paidAmount: ['已付款', '已完成'].includes(form.status) ? totalAmount : 0,
      remark: form.remark.trim() || undefined,
      source: 'admin',
    };

    setSubmitting(true);
    try {
      await createProjectOrder(payload);
      toast.success('项目订单已创建');
      setShowCreate(false);
      refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : '项目订单创建失败，请稍后重试';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleExport = () => {
    exportToExcel(orders, ORDER_EXPORT_COLUMNS, '项目订单报表');
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="text-sm text-gray-500">首页 / 订单管理 / 项目订单管理</div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">项目订单管理</h2>
          <p className="mt-1 text-sm text-gray-500">
            当前范围：{currentStoreName}；管理端项目开单与 Ami Aura Lite 服务收银统一进入本列表。
          </p>
        </div>
        <Button className="gap-2" onClick={handleOpenCreate}>
          <Plus className="h-4 w-4" /> 新增项目订单
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
              <TableHead>门店</TableHead>
              <TableHead>项目数</TableHead>
              <TableHead>总金额</TableHead>
              <TableHead>支付方式</TableHead>
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
                  <TableCell className="font-mono text-sm font-medium text-blue-600">{order.orderNo}</TableCell>
                  <TableCell>
                    <div className="font-medium text-gray-800">{order.customerName || '散客'}</div>
                    <div className="text-xs text-gray-500">{order.customerPhone || '-'}</div>
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">{order.storeName || '-'}</TableCell>
                  <TableCell>{items.length}</TableCell>
                  <TableCell className="font-medium text-gray-800">{formatCurrency(order.totalAmount)}</TableCell>
                  <TableCell className="text-sm text-gray-600">{order.paymentMethod}</TableCell>
                  <TableCell className="text-sm text-gray-600">{order.source === 'terminal' ? 'Ami Aura Lite' : '管理端'}</TableCell>
                  <TableCell>
                    <span className={`inline-flex rounded px-2 py-1 text-xs font-medium ${getStatusColor(order.status)}`}>
                      {order.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">{order.createdAt}</TableCell>
                  <TableCell className="text-right">
                    <button
                      onClick={() => {
                        setSelectedOrder(order);
                        setShowDetail(true);
                      }}
                      className="inline-flex items-center gap-1 text-sm text-blue-500 hover:text-blue-600"
                    >
                      <Eye className="h-3.5 w-3.5" /> 详情
                    </button>
                  </TableCell>
                </TableRow>
              );
            })}
            {orders.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="py-12 text-center text-gray-400">
                  暂无匹配的项目订单
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
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto" aria-describedby="create-project-order-desc">
          <DialogHeader>
            <DialogTitle>新增项目订单</DialogTitle>
            <DialogDescription id="create-project-order-desc">
              项目订单会写入 real 后端 `/orders/project`，并以项目明细进入统一订单与收银记录。
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="relative space-y-1.5">
              <span className="text-sm font-medium text-gray-700">客户姓名 *</span>
              <Input
                value={customerSearch}
                onChange={(event) => handleCustomerInputChange(event.target.value)}
                onFocus={() => setShowCustomerOptions(true)}
                onBlur={() => window.setTimeout(() => setShowCustomerOptions(false), 120)}
                placeholder={form.storeId ? '搜索或选择该门店客户' : '请先选择订单门店'}
                disabled={!form.storeId}
              />
              {showCustomerOptions && form.storeId && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                  {loadingCustomers && (
                    <div className="flex items-center gap-2 px-3 py-3 text-sm text-gray-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      正在加载客户...
                    </div>
                  )}
                  {!loadingCustomers && customers.length > 0 && (
                    <div className="py-1">
                      {customers.map((customer) => (
                        <button
                          key={customer.id}
                          type="button"
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-blue-50"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            handleSelectCustomer(customer);
                          }}
                        >
                          <span>
                            <span className="font-medium text-gray-800">{customer.name}</span>
                            <span className="ml-2 text-xs text-gray-500">{customer.memberLevel}</span>
                          </span>
                          <span className="text-xs text-gray-500">{customer.phone}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {!loadingCustomers && customers.length === 0 && (
                    <div className="px-3 py-3 text-sm text-gray-500">未找到该门店客户，可继续手工录入新客户姓名。</div>
                  )}
                </div>
              )}
            </label>
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
                <select
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm"
                  value={form.paymentMethod}
                  onChange={(event) => setForm((prev) => ({ ...prev, paymentMethod: event.target.value as ProductOrderPaymentMethod }))}
                >
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-gray-800">项目明细</h3>
                <p className="mt-1 text-xs text-gray-500">项目来源于当前订单门店已配置项目。</p>
              </div>
              <Button variant="outline" size="sm" onClick={addDraftItem} className="gap-1">
                <Plus className="h-4 w-4" /> 添加项目
              </Button>
            </div>

            <div className="rounded-xl border border-gray-200">
              <div className="grid grid-cols-[1.5fr_1.3fr_0.8fr_0.8fr_0.9fr_0.9fr_48px] gap-2 border-b bg-gray-50 px-3 py-2 text-xs font-medium text-gray-500">
                <span>项目档案</span>
                <span>项目名称</span>
                <span>类型</span>
                <span>数量</span>
                <span>单价</span>
                <span>小计</span>
                <span />
              </div>
              <div className="divide-y divide-gray-100">
                {draftItems.map((item) => {
                  const subtotal = Number(item.quantity || 0) * Number(item.unitPrice || 0);
                  return (
                    <div
                      key={item.rowId}
                      className="grid grid-cols-[1.5fr_1.3fr_0.8fr_0.8fr_0.9fr_0.9fr_48px] gap-2 px-3 py-3"
                    >
                      <select
                        className="h-10 min-w-0 rounded-lg border border-gray-300 bg-white px-2 text-sm"
                        value={item.projectId}
                        onChange={(event) => handleProjectSelect(item.rowId, event.target.value)}
                        disabled={loadingProjects || !form.storeId}
                      >
                        <option value="">
                          {loadingProjects ? '加载项目中...' : form.storeId ? '请选择项目' : '请先选择门店'}
                        </option>
                        {selectableProjects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name} / {project.type}
                          </option>
                        ))}
                      </select>
                      <Input
                        value={item.projectName}
                        onChange={(event) => updateDraftItem(item.rowId, { projectName: event.target.value })}
                        placeholder="项目名称"
                      />
                      <Input
                        value={item.projectType}
                        onChange={(event) => updateDraftItem(item.rowId, { projectType: event.target.value })}
                        placeholder="类型"
                      />
                      <Input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(event) => updateDraftItem(item.rowId, { quantity: Number(event.target.value) })}
                      />
                      <Input
                        type="number"
                        min={0}
                        value={item.unitPrice}
                        onChange={(event) => updateDraftItem(item.rowId, { unitPrice: Number(event.target.value) })}
                      />
                      <div className="flex h-10 items-center rounded-lg bg-gray-50 px-3 text-sm font-medium text-gray-800">
                        {formatCurrency(subtotal)}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeDraftItem(item.rowId)}
                        disabled={draftItems.length <= 1}
                        className="flex h-10 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="删除项目明细"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <label className="mt-4 block space-y-1.5">
            <span className="text-sm font-medium text-gray-700">备注</span>
            <textarea
              className="min-h-20 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              value={form.remark}
              onChange={(event) => setForm((prev) => ({ ...prev, remark: event.target.value }))}
              placeholder="可记录服务顾问、线下收款流水号或客户特殊要求"
            />
          </label>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-4">
            <div>
              <div className="text-sm text-gray-500">订单总金额</div>
              <div className="mt-1 text-2xl font-semibold text-blue-600">{formatCurrency(totalAmount)}</div>
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
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto" aria-describedby="project-order-detail-desc">
          <DialogHeader>
            <DialogTitle>项目订单详情</DialogTitle>
            <DialogDescription id="project-order-detail-desc">查看项目订单明细、收款状态和来源。</DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <div className="mt-4 space-y-6">
              <div className="grid grid-cols-1 gap-4 rounded-lg bg-gray-50 p-4 md:grid-cols-3">
                <div>
                  <div className="text-sm text-gray-600">订单编号</div>
                  <div className="mt-1 font-mono text-sm font-medium text-gray-800">{selectedOrder.orderNo}</div>
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

              <div>
                <h4 className="mb-3 font-medium text-gray-800">项目明细</h4>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50/80">
                      <TableHead>项目名称</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>数量</TableHead>
                      <TableHead>单价</TableHead>
                      <TableHead className="text-right">小计</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getOrderItems(selectedOrder).map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium text-gray-800">{item.productName}</TableCell>
                        <TableCell className="text-sm text-gray-600">{item.sku || '-'}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>{formatCurrency(item.unitPrice)}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(item.subtotal)}</TableCell>
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
                  <div className="text-sm text-gray-600">订单总额</div>
                  <div className="mt-1 text-2xl font-semibold text-blue-600">{formatCurrency(selectedOrder.totalAmount)}</div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
