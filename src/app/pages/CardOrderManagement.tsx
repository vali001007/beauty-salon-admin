import React, { useState, useMemo, useEffect } from 'react';
import { BarChart3, Search, Plus, RotateCcw, X, Minus, Loader2 } from 'lucide-react';
import { Input, Button, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/UI';
import {
  createCardOrder,
  createCardUsage,
  getCardOrderById,
  getCardOrderProfit,
  getSaleCards,
  getCardOrdersPaginated,
  updateCardOrder,
  voidCardOrder,
} from '@/api/card';
import { getUsers } from '@/api/user';
import { getBeauticians } from '@/api/beautician';
import { getProjects } from '@/api/project';
import { CustomerPicker } from '../components/CustomerPicker';
import {
  CARD_ORDER_PAYMENT_METHOD_OPTIONS,
  PaymentMethodSelector,
  canUseMemberBalancePayment,
} from '../components/PaymentMethodSelector';
import { usePagination } from '@/hooks/usePagination';
import { useStoreStore } from '@/stores/storeStore';
import { useAuthStore } from '@/stores/authStore';
import { hasPermission } from '@/config/permissions';
import type { Card } from '@/types/card';
import type { Beautician, Customer, Project, Store } from '@/types';
import type { SystemUser } from '@/types/user';
import type { CardOrderProfitDetail } from '@/api/real/card';
import { toast } from 'sonner';

interface CardOrder {
  id: string;
  customerId?: number;
  customerCardId?: number;
  sourceOrderId?: number;
  sourceOrderNo?: string;
  sourceOrderItemId?: number;
  cardId?: number;
  cardName: string;
  userName: string;
  customerPhone?: string;
  handlerId?: number;
  handlerName?: string;
  totalTimes?: number;
  remainingTimes?: number;
  cardProjects?: ConsumeProject[];
  actualPrice: number;
  listAmount?: number;
  discountAmount?: number;
  refundAmount?: number;
  recognizedAmount?: number;
  status: 'active' | 'expired' | 'voided';
  purchaseTime: string;
  expireTime: string;
  paymentMethod?: string;
  remark?: string;
  storeId?: number;
  storeName?: string;
}

interface ConsumeProject {
  projectName: string;
  totalCount: number;
  usedCount: number;
  remainCount: number;
}

interface ProjectItem {
  id: number;
  name: string;
  totalCount: number;
  usedCount: number;
  remainCount: number;
  remark: string;
}

type CardOrderPaymentMethod = '微信' | '支付宝' | '银行卡' | '现金' | '会员余额';

function toProjectItems(card?: Card): ProjectItem[] {
  return (card?.projects ?? []).map((project, index) => {
    const totalCount = Number(project.timesPerCard ?? 0);
    return {
      id: index + 1,
      name: project.projectName,
      totalCount,
      usedCount: 0,
      remainCount: totalCount,
      remark: '',
    };
  });
}

function formatDatetimeLocal(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getExpireTime(startTime: string, validDays?: number): string {
  if (!startTime || !validDays) return '';
  const date = new Date(startTime);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + validDays);
  return formatDatetimeLocal(date);
}

function formatCurrency(value?: number): string {
  return `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(value?: number): string {
  return `${(Number(value || 0) * 100).toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`;
}

function getMaterialCostSourceLabel(source?: string): string {
  if (source === 'actual_stock_movement') return '实耗';
  if (source === 'standard_bom') return 'BOM估算';
  if (source === 'missing') return '缺失';
  return source || '-';
}

const USER_ROLE_LABELS: Record<string, string> = {
  super_admin: '系统管理员',
  store_manager: '店长',
  manager: '店长',
  reception: '前台',
  cashier: '收银',
  consultant: '顾问',
  beautician: '美容师',
};

function getSalesUserName(user: SystemUser): string {
  return user.name || user.username || `员工 ${user.id}`;
}

function getSalesUserRoleLabel(user: SystemUser): string {
  const labels = (user.roles ?? [])
    .map((role) => USER_ROLE_LABELS[role] ?? role)
    .filter(Boolean);
  return Array.from(new Set(labels)).join(' / ');
}

function toDatetimeInput(value?: string): string {
  if (!value) return '';
  return value.replace(' ', 'T').slice(0, 16);
}

export function CardOrderManagement() {
  const currentStoreId = useStoreStore((state) => state.currentStoreId);
  const stores = useStoreStore((state) => state.stores);
  const loadStores = useStoreStore((state) => state.loadStores);
  const [searchUserName, setSearchUserName] = useState('');
  const [searchCardName, setSearchCardName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const filters = useMemo(() => ({
    userName: searchUserName || undefined,
    cardName: searchCardName || undefined,
  }), [searchUserName, searchCardName]);
  const { data: orders, total, page, pageSize, loading, setPage, setPageSize, refresh } = usePagination<CardOrder>(getCardOrdersPaginated, filters);
  const [cards, setCards] = useState<Card[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [salesUsers, setSalesUsers] = useState<SystemUser[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [salesUsersLoading, setSalesUsersLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const currentUser = useAuthStore((state) => state.user);
  const [selectedOrder, setSelectedOrder] = useState<CardOrder | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editForm, setEditForm] = useState({ expireTime: '', status: 'active' as 'active' | 'expired', remark: '' });
  const [voidSubmittingId, setVoidSubmittingId] = useState<string | null>(null);
  const [isProfitOpen, setIsProfitOpen] = useState(false);
  const [profitDetail, setProfitDetail] = useState<CardOrderProfitDetail | null>(null);
  const [profitLoading, setProfitLoading] = useState(false);
  const [profitError, setProfitError] = useState('');

  // Dialog form state
  const [formData, setFormData] = useState({
    cardId: '',
    cardPrice: 0,
    discountAmount: 0,
    customerId: '',
    operatorId: '',
    userName: '',
    storeId: '',
    startTime: '',
    expireTime: '',
    giftProjects: [] as string[],
    paymentMethod: '微信' as CardOrderPaymentMethod,
  });
  const [projectItems, setProjectItems] = useState<ProjectItem[]>([]);
  const selectedCard = useMemo(
    () => cards.find(card => String(card.id) === formData.cardId),
    [cards, formData.cardId],
  );
  const availableGiftProjects = useMemo(() => {
    const names = projects
      .filter((project) => project.status !== false)
      .map((project) => project.name)
      .filter(Boolean);
    return Array.from(new Set(names));
  }, [projects]);
  const receivableAmount = useMemo(
    () => Math.max(0, Number((formData.cardPrice - formData.discountAmount).toFixed(2))),
    [formData.cardPrice, formData.discountAmount],
  );
  const canUseBalancePayment = useMemo(
    () => canUseMemberBalancePayment(selectedCustomer, receivableAmount),
    [receivableAmount, selectedCustomer],
  );
  const availableStores = useMemo(
    () => stores.filter(store => store.status !== 'inactive' && store.status !== 'disabled'),
    [stores],
  );
  const selectedStore = useMemo(
    () => availableStores.find(store => String(store.id) === formData.storeId),
    [availableStores, formData.storeId],
  );
  const selectableSalesUsers = useMemo(() => {
    const storeId = Number(formData.storeId) || undefined;
    return salesUsers.filter((user) => {
      if (user.status !== '启用') return false;
      if (!storeId) return true;
      const roles = user.roles ?? [];
      return (
        !user.storeIds?.length ||
        user.storeIds.includes(storeId) ||
        roles.includes('super_admin') ||
        roles.includes('store_manager')
      );
    });
  }, [formData.storeId, salesUsers]);
  const canViewCardOrderProfit = useMemo(() => {
    const roles = currentUser?.roles ?? [];
    const permissions = currentUser?.permissions ?? [];
    const deniedPermissions = currentUser?.deniedPermissions ?? [];
    if (hasPermission(deniedPermissions, 'core:card-order-profit:view') || hasPermission(deniedPermissions, '*')) return false;
    return hasPermission(permissions, '*') || roles.includes('super_admin') || roles.includes('store_manager');
  }, [currentUser]);

  useEffect(() => {
    if (!isDialogOpen) return;
    let mounted = true;
    const storeId = Number(formData.storeId) || currentStoreId || undefined;
    setCardsLoading(true);
    getSaleCards(storeId ? { storeId } : undefined)
      .then((items) => {
        if (!mounted) return;
        setCards(items);
        setFormData((prev) =>
          prev.cardId && !items.some((card) => String(card.id) === prev.cardId)
            ? { ...prev, cardId: '', cardPrice: 0, discountAmount: 0, expireTime: '', giftProjects: [] }
            : prev,
        );
      })
      .catch(() => {
        if (mounted) setCards([]);
      })
      .finally(() => {
        if (mounted) setCardsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [currentStoreId, formData.storeId, isDialogOpen]);

  useEffect(() => {
    if (!stores.length) {
      void loadStores();
    }
  }, [loadStores, stores.length]);

  useEffect(() => {
    let mounted = true;
    setSalesUsersLoading(true);
    getUsers()
      .then((items) => {
        if (mounted) setSalesUsers(items.filter((user) => user.status === '启用'));
      })
      .catch(() => {
        if (mounted) {
          setSalesUsers([]);
          toast.error('销售人员加载失败，请稍后重试');
        }
      })
      .finally(() => {
        if (mounted) setSalesUsersLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isDialogOpen) return;
    let mounted = true;
    getProjects()
      .then((items) => {
        if (mounted) setProjects(items);
      })
      .catch(() => {
        if (mounted) {
          setProjects([]);
          toast.error('赠送项目加载失败，请稍后重试');
        }
      });

    return () => {
      mounted = false;
    };
  }, [isDialogOpen]);

  useEffect(() => {
    if (!formData.operatorId) return;
    if (!selectableSalesUsers.some((user) => String(user.id) === formData.operatorId)) {
      setFormData((prev) => ({ ...prev, operatorId: '' }));
    }
  }, [formData.operatorId, selectableSalesUsers]);

  // 次卡消费弹窗 state
  const [isConsumeDialogOpen, setIsConsumeDialogOpen] = useState(false);
  const [consumeOrder, setConsumeOrder] = useState<CardOrder | null>(null);
  const [consumeProject, setConsumeProject] = useState('');
  const [consumeCount, setConsumeCount] = useState(1);
  const [consumeBeauticianId, setConsumeBeauticianId] = useState('');
  const [consumeBeauticians, setConsumeBeauticians] = useState<Beautician[]>([]);
  const [consumeBeauticiansLoading, setConsumeBeauticiansLoading] = useState(false);
  const [consumeSubmitting, setConsumeSubmitting] = useState(false);

  const consumeProjects = consumeOrder?.cardProjects ?? [];
  const selectedConsumeProject = consumeProjects.find(project => project.projectName === consumeProject);
  const selectedConsumeBeautician = consumeBeauticians.find((beautician) => String(beautician.id) === consumeBeauticianId);

  const handleOpenConsumeDialog = (order: CardOrder) => {
    const availableProjects = order.cardProjects?.filter(project => project.remainCount > 0) ?? [];
    setConsumeOrder(order);
    setConsumeProject(availableProjects[0]?.projectName ?? order.cardProjects?.[0]?.projectName ?? '');
    setConsumeCount(1);
    setConsumeBeauticianId('');
    setIsConsumeDialogOpen(true);
  };

  const handleCloseConsumeDialog = () => {
    setIsConsumeDialogOpen(false);
    setConsumeOrder(null);
    setConsumeProject('');
    setConsumeCount(1);
    setConsumeBeauticianId('');
  };

  useEffect(() => {
    if (!isConsumeDialogOpen) return;
    let mounted = true;
    setConsumeBeauticiansLoading(true);
    getBeauticians({ storeName: consumeOrder?.storeName })
      .then((items) => {
        if (!mounted) return;
        setConsumeBeauticians(items.filter((item) => item.status === '在职'));
      })
      .catch(() => {
        if (!mounted) return;
        setConsumeBeauticians([]);
        toast.error('服务人员加载失败，请稍后重试');
      })
      .finally(() => {
        if (mounted) setConsumeBeauticiansLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [consumeOrder?.storeName, isConsumeDialogOpen]);

  const handleConsumeSubmit = async () => {
    if (!consumeOrder) return;
    if (!consumeProject || !selectedConsumeProject) {
      toast.error('请选择当前次卡包含的消费项目');
      return;
    }
    if (consumeCount > selectedConsumeProject.remainCount) {
      toast.error('消费次数不能超过该项目剩余次数');
      return;
    }
    if (!selectedConsumeBeautician) {
      toast.error(consumeBeauticians.length ? '请选择服务人员，用于本次核销提成归属' : '当前没有可选服务人员，请先维护美容师档案后再核销');
      return;
    }

    setConsumeSubmitting(true);
    try {
      await createCardUsage({
        cardOrderId: consumeOrder.customerCardId ?? consumeOrder.id,
        customerCardId: consumeOrder.customerCardId,
        customerId: consumeOrder.customerId,
        cardName: consumeOrder.cardName,
        projectName: consumeProject,
        consumedTimes: consumeCount,
        beauticianId: selectedConsumeBeautician.id,
      });
      toast.success('次卡核销成功');
      handleCloseConsumeDialog();
      refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : '次卡核销失败，请稍后重试';
      toast.error(message);
    } finally {
      setConsumeSubmitting(false);
    }
  };

  const getStatusConfig = (status: CardOrder['status']) => {
    const configs = {
      active: { text: '已激活', color: 'bg-green-100 text-green-700 border-green-300' },
      expired: { text: '已过期', color: 'bg-gray-100 text-gray-600 border-gray-300' },
      voided: { text: '已作废', color: 'bg-red-100 text-red-700 border-red-300' },
    };
    return configs[status];
  };

  const loadCardOrderDetail = async (order: CardOrder) => {
    setDetailLoading(true);
    try {
      const detail = await getCardOrderById(order.customerCardId ?? order.id);
      setSelectedOrder(detail);
      return detail as CardOrder;
    } catch (error) {
      const message = error instanceof Error ? error.message : '次卡详情加载失败，请稍后重试';
      toast.error(message);
      setSelectedOrder(order);
      return order;
    } finally {
      setDetailLoading(false);
    }
  };

  const handleOpenDetail = (order: CardOrder) => {
    setSelectedOrder(order);
    setIsDetailOpen(true);
    void loadCardOrderDetail(order);
  };

  const handleOpenEdit = (order: CardOrder) => {
    setSelectedOrder(order);
    setEditForm({
      expireTime: toDatetimeInput(order.expireTime),
      status: order.status === 'expired' ? 'expired' : 'active',
      remark: order.remark ?? '',
    });
    setIsEditOpen(true);
    void loadCardOrderDetail(order).then((detail) => {
      setEditForm({
        expireTime: toDatetimeInput(detail.expireTime),
        status: detail.status === 'expired' ? 'expired' : 'active',
        remark: detail.remark ?? '',
      });
    });
  };

  const handleEditSubmit = async () => {
    if (!selectedOrder) return;
    if (!editForm.expireTime) {
      toast.error('请选择过期时间');
      return;
    }
    setEditSubmitting(true);
    try {
      await updateCardOrder(selectedOrder.customerCardId ?? selectedOrder.id, {
        expireTime: editForm.expireTime,
        status: editForm.status,
        remark: editForm.remark,
      });
      toast.success('次卡订单已更新');
      setIsEditOpen(false);
      setSelectedOrder(null);
      refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : '次卡订单更新失败，请稍后重试';
      toast.error(message);
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleVoid = async (order: CardOrder) => {
    const confirmed = window.confirm(`确认作废并退卡「${order.cardName}」？系统会按未履约金额写入退款记录，并清空剩余次数。`);
    if (!confirmed) return;
    setVoidSubmittingId(order.id);
    try {
      const result = await voidCardOrder(order.customerCardId ?? order.id, { reason: '管理端次卡退卡作废' });
      toast.success(`次卡已作废${result.refundAmount ? `，退款 ${formatCurrency(result.refundAmount)}` : ''}`);
      refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : '次卡作废失败，请稍后重试';
      toast.error(message);
    } finally {
      setVoidSubmittingId(null);
    }
  };

  const handleOpenProfit = async (order: CardOrder) => {
    setSelectedOrder(order);
    setProfitDetail(null);
    setProfitError('');
    setIsProfitOpen(true);
    setProfitLoading(true);
    try {
      const detail = await getCardOrderProfit(order.customerCardId ?? order.id);
      setProfitDetail(detail);
    } catch (error) {
      const message = error instanceof Error ? error.message : '利润明细加载失败，请稍后重试';
      setProfitError(message);
    } finally {
      setProfitLoading(false);
    }
  };

  const handleReset = () => {
    setSearchUserName('');
    setSearchCardName('');
    setStartDate('');
    setEndDate('');
  };

  const handleOpenDialog = () => {
    const startTime = formatDatetimeLocal(new Date());
    setFormData({
      cardId: '',
      cardPrice: 0,
      discountAmount: 0,
      customerId: '',
      operatorId: '',
      userName: '',
      storeId: currentStoreId ? String(currentStoreId) : '',
      startTime,
      expireTime: '',
      giftProjects: [],
      paymentMethod: '微信',
    });
    setCustomerSearch('');
    setSelectedCustomer(null);
    setProjectItems([]);
    setIsDialogOpen(true);
  };

  const handleCustomerSearchChange = (value: string) => {
    setCustomerSearch(value);
    if (formData.customerId) {
      setSelectedCustomer(null);
      setFormData((prev) => ({
        ...prev,
        customerId: '',
        userName: '',
        paymentMethod: prev.paymentMethod === '会员余额' ? '微信' : prev.paymentMethod,
      }));
    }
  };

  const handleSelectCustomer = (customer: Customer | null) => {
    setSelectedCustomer(customer);
    setFormData((prev) => ({
      ...prev,
      customerId: customer ? String(customer.id) : '',
      userName: customer?.name ?? '',
      storeId: customer?.storeId ? String(customer.storeId) : prev.storeId,
    }));
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
  };

  const handleSubmit = async () => {
    if (!formData.cardId) {
      toast.error('请选择次卡');
      return;
    }
    if (!formData.userName.trim()) {
      toast.error('请选择客户');
      return;
    }
    if (!formData.customerId || !selectedCustomer) {
      toast.error('请选择真实客户');
      return;
    }
    if (!formData.storeId || !selectedStore) {
      toast.error('请选择所属门店');
      return;
    }
    if (!formData.expireTime) {
      toast.error('请选择过期时间');
      return;
    }
    if (formData.paymentMethod === '会员余额' && !canUseBalancePayment) {
      toast.error('该客户会员余额不足，请更换支付方式');
      return;
    }

    setSubmitting(true);
    try {
      const totalTimes = selectedCard?.totalTimes ?? projectItems.reduce((sum, item) => sum + item.totalCount, 0);
      await createCardOrder({
        cardId: Number(formData.cardId),
        customerId: selectedCustomer.id,
        operatorId: formData.operatorId ? Number(formData.operatorId) : undefined,
        userId: selectedCustomer.id,
        userName: selectedCustomer.name,
        customerName: selectedCustomer.name,
        storeId: selectedStore.id,
        storeName: selectedStore.name,
        cardName: selectedCard?.name ?? '',
        amount: receivableAmount,
        actualPrice: receivableAmount,
        discountAmount: formData.discountAmount,
        giftProjects: formData.giftProjects,
        paymentMethod: formData.paymentMethod,
        remark: formData.giftProjects.length ? `赠送项目：${formData.giftProjects.join('、')}` : 'Ami Core 管理端办卡',
        totalTimes,
        remainingTimes: totalTimes,
        expireTime: formData.expireTime,
      });
      toast.success('次卡开卡成功');
      setIsDialogOpen(false);
      refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : '次卡开卡失败，请稍后重试';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCardChange = (cardId: string) => {
    const card = cards.find(item => String(item.id) === cardId);
    const price = card?.price ?? 0;
    const expireTime = card ? getExpireTime(formData.startTime, card.validDays) : '';
    setFormData(prev => ({
      ...prev,
      cardId,
      cardPrice: price,
      discountAmount: 0,
      expireTime,
      storeId: card?.storeId ? String(card.storeId) : prev.storeId,
      giftProjects: [],
    }));
    setProjectItems(toProjectItems(card));
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Search Section */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 whitespace-nowrap">用户名称</label>
          <Input
            placeholder="请输入用户名称"
            className="w-48"
            value={searchUserName}
            onChange={(e) => setSearchUserName(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 whitespace-nowrap">次卡名称</label>
          <Input
            placeholder="请输入次卡名称"
            className="w-48"
            value={searchCardName}
            onChange={(e) => setSearchCardName(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 whitespace-nowrap">购买日期</label>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              className="w-40"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              placeholder="开始日期"
            />
            <span className="text-gray-400">至</span>
            <Input
              type="date"
              className="w-40"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              placeholder="结束日期"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button className="gap-2">
          <Search className="w-4 h-4" /> 搜索
        </Button>
        <Button variant="outline" className="gap-2" onClick={handleReset}>
          <RotateCcw className="w-4 h-4" /> 重置
        </Button>
        <Button className="gap-2 bg-[#1890ff] hover:bg-[#40a9ff]" onClick={handleOpenDialog}>
          <Plus className="w-4 h-4" /> 新增
        </Button>
      </div>

      {/* Table */}
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
            <TableHead>订单编号</TableHead>
            <TableHead>次卡</TableHead>
            <TableHead>用户</TableHead>
            <TableHead>实际售价(元)</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>购买时间</TableHead>
            <TableHead>过期时间</TableHead>
            <TableHead>办理人员</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => {
            const statusConfig = getStatusConfig(order.status);
            return (
              <TableRow key={order.id} className="hover:bg-blue-50/30">
                <TableCell>{order.id}</TableCell>
                <TableCell className="font-medium text-gray-700">{order.cardName}</TableCell>
                <TableCell>{order.userName}</TableCell>
                <TableCell>{order.actualPrice.toFixed(2)}</TableCell>
                <TableCell>
                  <span className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-md border ${statusConfig.color}`}>
                    {statusConfig.text}
                  </span>
                </TableCell>
                <TableCell>{order.purchaseTime}</TableCell>
                <TableCell>{order.expireTime}</TableCell>
                <TableCell>{order.handlerName || '-'}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-3 text-sm">
                    <button className="text-blue-500 hover:text-blue-600" onClick={() => handleOpenDetail(order)}>查看</button>
                    <button
                      className="text-blue-500 hover:text-blue-600 disabled:text-gray-300"
                      onClick={() => handleOpenEdit(order)}
                      disabled={order.status === 'voided'}
                    >
                      编辑
                    </button>
                    <button
                      className="text-blue-500 hover:text-blue-600 disabled:text-gray-300"
                      onClick={() => handleOpenConsumeDialog(order)}
                      disabled={order.status !== 'active' || (order.remainingTimes ?? 0) <= 0}
                    >
                      次卡核销
                    </button>
                    {canViewCardOrderProfit && (
                      <button className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700" onClick={() => handleOpenProfit(order)}>
                        <BarChart3 className="h-3.5 w-3.5" /> 利润
                      </button>
                    )}
                    {order.status !== 'voided' && (
                      <button
                        className="text-red-500 hover:text-red-600 disabled:text-gray-300"
                        onClick={() => void handleVoid(order)}
                        disabled={voidSubmittingId === order.id}
                      >
                        {voidSubmittingId === order.id ? '处理中' : '作废'}
                      </button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
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

      {/* New Card Order Dialog */}
      {isDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-[900px] max-h-[90vh] overflow-y-auto">
            {/* Dialog Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-lg font-medium">次卡开卡</h2>
              <button
                onClick={handleCloseDialog}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Dialog Body */}
            <div className="p-6 space-y-6">
              {/* Row 1: Card & Price */}
              <div className="grid grid-cols-2 gap-6">
                <div className="flex items-center gap-2">
                  <span className="text-red-500">*</span>
                  <label className="text-sm text-gray-700 whitespace-nowrap min-w-[70px]">次卡</label>
                  <select
                    className="flex-1 h-9 px-3 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.cardId}
                    onChange={(e) => handleCardChange(e.target.value)}
                    disabled={cardsLoading}
                  >
                    <option value="">{cardsLoading ? '次卡加载中...' : '请选择卡片'}</option>
                    {cards.map(card => (
                      <option key={card.id} value={String(card.id)}>
                        {card.name}{card.storeName ? `（${card.storeName}）` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-700 whitespace-nowrap min-w-[70px]">次卡价格</label>
                  <span className="text-sm text-gray-800">¥ {formData.cardPrice.toFixed(2)}</span>
                  {!formData.cardId && <span className="text-xs text-gray-400">（请先选择次卡）</span>}
                </div>
              </div>

              {/* Row 1.5: Discount & Receivable */}
              <div className="grid grid-cols-2 gap-6">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-700 whitespace-nowrap min-w-[70px]">优惠金额</label>
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-sm text-gray-500">¥</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max={formData.cardPrice}
                      className="w-32 h-9 text-center"
                      value={formData.discountAmount.toFixed(2)}
                      onChange={(e) => {
                        const discountAmount = Math.min(formData.cardPrice, Math.max(0, parseFloat(e.target.value) || 0));
                        setFormData({ ...formData, discountAmount });
                      }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-700 whitespace-nowrap min-w-[70px]">实收金额</label>
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-sm font-semibold text-gray-900">{formatCurrency(receivableAmount)}</span>
                    <span className="text-xs text-gray-400">（客户实付价格）</span>
                  </div>
                </div>
              </div>

              {/* Row 2: User & Store */}
              <div className="grid grid-cols-2 gap-6">
                <div className="flex items-start gap-2">
                  <span className="pt-8 text-red-500">*</span>
                  <CustomerPicker
                    value={customerSearch}
                    onValueChange={handleCustomerSearchChange}
                    onSelect={handleSelectCustomer}
                    selectedCustomerId={formData.customerId}
                    storeName={selectedStore?.name}
                    label="客户"
                    required={false}
                    placeholder="输入客户姓名或手机号搜索"
                    emptyText="未找到客户，请先到客户资料中建档。"
                    className="flex-1"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-red-500">*</span>
                  <label className="text-sm text-gray-700 whitespace-nowrap min-w-[70px]">所属门店</label>
                  <select
                    className="flex-1 h-9 px-3 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.storeId}
                    onChange={(e) => setFormData({ ...formData, storeId: e.target.value })}
                  >
                    <option value="">请选择所属门店</option>
                    {availableStores.map((store) => (
                      <option key={store.id} value={String(store.id)}>
                        {store.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 3: Start Time & Expire Time */}
              <div className="grid grid-cols-2 gap-6">
                <div className="flex items-center gap-2">
                  <span className="text-red-500">*</span>
                  <label className="text-sm text-gray-700 whitespace-nowrap min-w-[70px]">启动时间</label>
                  <div className="flex-1 relative">
                    <Input
                      type="datetime-local"
                      className="w-full"
                      value={formData.startTime}
                      onChange={(e) => {
                        const startTime = e.target.value;
                        setFormData({
                          ...formData,
                          startTime,
                          expireTime: selectedCard ? getExpireTime(startTime, selectedCard.validDays) : formData.expireTime,
                        });
                      }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-red-500">*</span>
                  <label className="text-sm text-gray-700 whitespace-nowrap min-w-[70px]">过期时间</label>
                  <div className="flex-1 relative">
                    <Input
                      type="datetime-local"
                      className="w-full"
                      value={formData.expireTime}
                      onChange={(e) => setFormData({ ...formData, expireTime: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Payment Info Section */}
              <div className="border border-gray-200 rounded-lg p-6">
                <h3 className="text-sm font-medium text-gray-800 mb-4">付款信息</h3>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-700 whitespace-nowrap min-w-[70px]">支付方式</label>
                  <PaymentMethodSelector<CardOrderPaymentMethod>
                    value={formData.paymentMethod}
                    onChange={(paymentMethod) => setFormData({ ...formData, paymentMethod })}
                    methods={CARD_ORDER_PAYMENT_METHOD_OPTIONS as Array<{ value: CardOrderPaymentMethod; label: string; requiresMemberBalance?: boolean }>}
                    customer={selectedCustomer}
                    amount={receivableAmount}
                    columnsClassName="flex-1 grid-cols-2 sm:grid-cols-5"
                    buttonClassName="min-h-9 rounded-md"
                  />
                </div>
              </div>

              {/* Project Details Section */}
              <div className="border border-gray-200 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-gray-800">项目明细</h3>
                  <span className="text-xs text-gray-400">由次卡管理预设，不可更改</span>
                </div>
                <div className="border border-gray-200 rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-4 py-2.5 font-medium text-gray-600">项目</th>
                        <th className="text-left px-4 py-2.5 font-medium text-gray-600">总次数</th>
                        <th className="text-left px-4 py-2.5 font-medium text-gray-600">备注</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projectItems.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="text-center py-8 text-gray-400">
                            {formData.cardId ? '该次卡暂无预设项目' : '请先选择次卡'}
                          </td>
                        </tr>
                      ) : (
                        projectItems.map((item) => (
                          <tr key={item.id} className="border-b border-gray-200 last:border-b-0">
                            <td className="px-4 py-2.5">
                              <span className="text-sm text-gray-800">{item.name}</span>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="text-sm text-gray-800">{item.totalCount}</span>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="text-sm text-gray-800">{item.remark}</span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Additional Projects Section */}
              <div className="border border-gray-200 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-gray-800">赠送项目</h3>
                  <Button
                    className="gap-1 bg-[#2D1B69] hover:bg-[#3b2684] rounded-full px-5"
                    size="sm"
                    onClick={() => setFormData((prev) => ({ ...prev, giftProjects: [...prev.giftProjects, ''] }))}
                    disabled={!availableGiftProjects.length}
                  >
                    添加明细
                  </Button>
                </div>
                <div className="border border-gray-200 rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-4 py-2.5 font-medium text-gray-600">项目</th>
                        <th className="text-right px-4 py-2.5 font-medium text-gray-600">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.giftProjects.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="text-center py-8 text-gray-400">
                            {availableGiftProjects.length ? '暂无赠送明细' : '管理端暂无已启用项目'}
                          </td>
                        </tr>
                      ) : (
                        formData.giftProjects.map((projectName, index) => (
                          <tr key={`${index}-${projectName}`} className="border-b border-gray-200 last:border-b-0">
                            <td className="px-4 py-2.5">
                              <select
                                className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={projectName}
                                onChange={(e) => {
                                  const next = [...formData.giftProjects];
                                  next[index] = e.target.value;
                                  setFormData({ ...formData, giftProjects: Array.from(new Set(next.filter(Boolean))) });
                                }}
                              >
                                <option value="">请选择赠送项目</option>
                                {availableGiftProjects
                                  .filter((project) => project === projectName || !formData.giftProjects.includes(project))
                                  .map((project) => (
                                    <option key={project} value={project}>{project}</option>
                                  ))}
                              </select>
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <button
                                className="text-red-500 hover:text-red-600 text-sm"
                                onClick={() => {
                                  setFormData({
                                    ...formData,
                                    giftProjects: formData.giftProjects.filter((_, targetIndex) => targetIndex !== index),
                                  });
                                }}
                              >
                                删除
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg p-6">
                <h3 className="text-sm font-medium text-gray-800 mb-4">销售人员</h3>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-700 whitespace-nowrap min-w-[70px]">销售人员</label>
                  <select
                    className="flex-1 h-9 px-3 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.operatorId}
                    onChange={(e) => setFormData({ ...formData, operatorId: e.target.value })}
                    disabled={salesUsersLoading}
                  >
                    <option value="">{salesUsersLoading ? '销售人员加载中...' : '不指定销售人员'}</option>
                    {selectableSalesUsers.map((user) => {
                      const roleLabel = getSalesUserRoleLabel(user);
                      return (
                        <option key={user.id} value={String(user.id)}>
                          {getSalesUserName(user)}{roleLabel ? ` · ${roleLabel}` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div className="mt-2 text-xs text-gray-400">可为空；选择后将作为次卡订单的办理/销售归属。</div>
              </div>

              {/* Custom Projects Section */}

            </div>

            {/* Dialog Footer */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
              <Button variant="outline" onClick={handleCloseDialog}>
                取消
              </Button>
              <Button className="bg-[#1890ff] hover:bg-[#40a9ff]" onClick={handleSubmit} disabled={submitting}>
                {submitting ? '提交中...' : '确定'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Card Detail Dialog */}
      {isDetailOpen && selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-[760px] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-medium">次卡订单详情</h2>
                <p className="mt-1 text-sm text-gray-500">来源订单：{selectedOrder.sourceOrderNo || selectedOrder.id}</p>
              </div>
              <button
                onClick={() => {
                  setIsDetailOpen(false);
                  setSelectedOrder(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-5">
              {detailLoading && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> 正在刷新详情...
                </div>
              )}
              <div className="grid grid-cols-3 gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
                <div>
                  <div className="text-gray-500">客户</div>
                  <div className="mt-1 font-medium text-gray-900">{selectedOrder.userName}</div>
                  <div className="text-xs text-gray-500">{selectedOrder.customerPhone || '-'}</div>
                </div>
                <div>
                  <div className="text-gray-500">次卡</div>
                  <div className="mt-1 font-medium text-gray-900">{selectedOrder.cardName}</div>
                  <div className="text-xs text-gray-500">{selectedOrder.remainingTimes ?? 0} / {selectedOrder.totalTimes ?? 0} 次</div>
                </div>
                <div>
                  <div className="text-gray-500">实收金额</div>
                  <div className="mt-1 font-medium text-gray-900">{formatCurrency(selectedOrder.actualPrice)}</div>
                  <div className="text-xs text-gray-500">优惠 {formatCurrency(selectedOrder.discountAmount)}</div>
                </div>
                <div>
                  <div className="text-gray-500">状态</div>
                  <div className="mt-1 font-medium text-gray-900">{getStatusConfig(selectedOrder.status).text}</div>
                </div>
                <div>
                  <div className="text-gray-500">购买时间</div>
                  <div className="mt-1 font-medium text-gray-900">{selectedOrder.purchaseTime || '-'}</div>
                </div>
                <div>
                  <div className="text-gray-500">过期时间</div>
                  <div className="mt-1 font-medium text-gray-900">{selectedOrder.expireTime || '-'}</div>
                </div>
              </div>

              <div>
                <h3 className="mb-3 text-sm font-medium text-gray-800">项目核销进度</h3>
                <div className="overflow-hidden rounded-lg border border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium">项目</th>
                        <th className="px-4 py-3 text-left font-medium">总次数</th>
                        <th className="px-4 py-3 text-left font-medium">已核销</th>
                        <th className="px-4 py-3 text-left font-medium">剩余</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedOrder.cardProjects ?? []).map((project) => (
                        <tr key={project.projectName} className="border-t border-gray-100">
                          <td className="px-4 py-3">{project.projectName}</td>
                          <td className="px-4 py-3">{project.totalCount}</td>
                          <td className="px-4 py-3">{project.usedCount}</td>
                          <td className="px-4 py-3">{project.remainCount}</td>
                        </tr>
                      ))}
                      {(!selectedOrder.cardProjects || selectedOrder.cardProjects.length === 0) && (
                        <tr>
                          <td className="px-4 py-8 text-center text-gray-400" colSpan={4}>暂无项目明细</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              {selectedOrder.remark && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                  备注：{selectedOrder.remark}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
              <Button
                variant="outline"
                onClick={() => {
                  setIsDetailOpen(false);
                  setSelectedOrder(null);
                }}
              >
                关闭
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Card Edit Dialog */}
      {isEditOpen && selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-[560px]">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-medium">编辑次卡订单</h2>
                <p className="mt-1 text-sm text-gray-500">{selectedOrder.cardName} · {selectedOrder.userName}</p>
              </div>
              <button
                onClick={() => setIsEditOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                次数、卡种和实收金额已进入核销和利润链路，编辑页不支持改写历史金额。
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">状态</label>
                <select
                  className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm"
                  value={editForm.status}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, status: event.target.value as 'active' | 'expired' }))}
                >
                  <option value="active">已激活</option>
                  <option value="expired">已过期</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">过期时间</label>
                <Input
                  type="datetime-local"
                  value={editForm.expireTime}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, expireTime: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">备注</label>
                <textarea
                  className="min-h-[88px] w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={editForm.remark}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, remark: event.target.value }))}
                  placeholder="记录调整原因"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
              <Button variant="outline" onClick={() => setIsEditOpen(false)}>取消</Button>
              <Button className="bg-[#1890ff] hover:bg-[#40a9ff]" onClick={handleEditSubmit} disabled={editSubmitting}>
                {editSubmitting ? '保存中...' : '保存'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Card Profit Dialog */}
      {isProfitOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-[1000px] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-medium">次卡订单利润明细</h2>
                <p className="mt-1 text-sm text-gray-500">
                  开卡销售利润只统计次卡销售收入、退款和开卡提成；项目核销产生的耗材和服务提成归属到项目毛利。
                </p>
              </div>
              <button
                onClick={() => {
                  setIsProfitOpen(false);
                  setProfitDetail(null);
                  setProfitError('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              {profitLoading && (
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> 正在加载利润明细...
                </div>
              )}
              {!profitLoading && profitError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{profitError}</div>
              )}
              {!profitLoading && !profitError && profitDetail && (
                <>
                  <div className="grid grid-cols-4 gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
                    <div>
                      <div className="text-gray-500">来源订单</div>
                      <div className="mt-1 font-mono font-medium text-gray-900">{profitDetail.sourceOrderNo || selectedOrder?.id || '-'}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">客户</div>
                      <div className="mt-1 font-medium text-gray-900">{profitDetail.customerName || '-'}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">次卡</div>
                      <div className="mt-1 font-medium text-gray-900">{profitDetail.cardName}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">门店</div>
                      <div className="mt-1 font-medium text-gray-900">{profitDetail.storeName || '-'}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-5 gap-3">
                    <div className="rounded-lg border border-gray-200 p-4">
                      <div className="text-xs text-gray-500">实收收入</div>
                      <div className="mt-2 text-lg font-semibold text-gray-900">{formatCurrency(profitDetail.netSalesAmount)}</div>
                      <div className="mt-1 text-xs text-gray-500">
                        原价 {formatCurrency(profitDetail.listAmount)}；优惠 {formatCurrency(profitDetail.discountAmount)}；退款 {formatCurrency(profitDetail.refundAmount)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-gray-200 p-4">
                      <div className="text-xs text-gray-500">已履约收入</div>
                      <div className="mt-2 text-lg font-semibold text-gray-900">{formatCurrency(profitDetail.recognizedAmount)}</div>
                      <div className="mt-1 text-xs text-gray-500">核销后确认</div>
                    </div>
                    <div className="rounded-lg border border-gray-200 p-4">
                      <div className="text-xs text-gray-500">剩余负债</div>
                      <div className="mt-2 text-lg font-semibold text-gray-900">{formatCurrency(profitDetail.remainingLiability)}</div>
                      <div className="mt-1 text-xs text-gray-500">未履约权益</div>
                    </div>
                    <div className="rounded-lg border border-gray-200 p-4">
                      <div className="text-xs text-gray-500">开卡提成</div>
                      <div className="mt-2 text-lg font-semibold text-gray-900">{formatCurrency(profitDetail.totalCost)}</div>
                      <div className="mt-1 text-xs text-gray-500">已分摊 {formatCurrency(profitDetail.recognizedCommissionCost)}</div>
                    </div>
                    <div className="rounded-lg border border-gray-200 p-4">
                      <div className="text-xs text-gray-500">已履约毛利</div>
                      <div className={`mt-2 text-lg font-semibold ${profitDetail.recognizedGrossProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                        {formatCurrency(profitDetail.recognizedGrossProfit)}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">毛利率 {formatPercent(profitDetail.recognizedGrossMargin)}</div>
                    </div>
                  </div>

                  {profitDetail.missingReasons.length > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                      数据缺口：{profitDetail.missingReasons.join('、')}
                    </div>
                  )}

                  <div>
                    <h3 className="mb-3 text-sm font-medium text-gray-800">开卡提成</h3>
                    <div className="overflow-hidden rounded-lg border border-gray-200">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-600">
                          <tr>
                            <th className="px-4 py-3 text-left font-medium">员工</th>
                            <th className="px-4 py-3 text-left font-medium">规则</th>
                            <th className="px-4 py-3 text-right font-medium">计算基数</th>
                            <th className="px-4 py-3 text-right font-medium">比例</th>
                            <th className="px-4 py-3 text-right font-medium">提成</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...profitDetail.saleCommissionRecords, ...profitDetail.unassignedCommissionRecords].map((record) => (
                            <tr key={record.id} className="border-t border-gray-100">
                              <td className="px-4 py-3">{record.staffUserName}</td>
                              <td className="px-4 py-3">{record.ruleName || '-'}</td>
                              <td className="px-4 py-3 text-right">{formatCurrency(record.sourceAmount)}</td>
                              <td className="px-4 py-3 text-right">{formatPercent(record.rate)}</td>
                              <td className="px-4 py-3 text-right">{formatCurrency(record.amount)}</td>
                            </tr>
                          ))}
                          {profitDetail.saleCommissionRecords.length === 0 && profitDetail.unassignedCommissionRecords.length === 0 && (
                            <tr>
                              <td className="px-4 py-8 text-center text-gray-400" colSpan={5}>暂无开卡提成记录</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-3 text-sm font-medium text-gray-800">核销履约记录</h3>
                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                      <table className="min-w-[1050px] w-full text-sm">
                        <thead className="bg-gray-50 text-gray-600">
                          <tr>
                            <th className="px-4 py-3 text-left font-medium">项目</th>
                            <th className="px-4 py-3 text-right font-medium">次数</th>
                            <th className="px-4 py-3 text-right font-medium">单次确认收入</th>
                            <th className="px-4 py-3 text-right font-medium">确认收入</th>
                            <th className="px-4 py-3 text-right font-medium">耗材成本</th>
                            <th className="px-4 py-3 text-right font-medium">提成成本</th>
                            <th className="px-4 py-3 text-right font-medium">项目成本</th>
                            <th className="px-4 py-3 text-right font-medium">项目毛利</th>
                            <th className="px-4 py-3 text-right font-medium">毛利率</th>
                            <th className="px-4 py-3 text-left font-medium">核销时间</th>
                          </tr>
                        </thead>
                        <tbody>
                          {profitDetail.usageRecords.map((record) => (
                            <tr key={record.id} className="border-t border-gray-100">
                              <td className="px-4 py-3">{record.projectName}</td>
                              <td className="px-4 py-3 text-right">{record.times}</td>
                              <td className="px-4 py-3 text-right">{formatCurrency(record.recognizedUnitValue)}</td>
                              <td className="px-4 py-3 text-right">{formatCurrency(record.recognizedAmount)}</td>
                              <td className="px-4 py-3 text-right">
                                <div>{formatCurrency(record.materialCost)}</div>
                                <div className={`text-xs ${record.materialCostSource === 'missing' ? 'text-amber-600' : 'text-gray-400'}`}>
                                  {getMaterialCostSourceLabel(record.materialCostSource)}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right">{formatCurrency(record.commissionCost)}</td>
                              <td className="px-4 py-3 text-right">{formatCurrency(record.projectCost)}</td>
                              <td className={`px-4 py-3 text-right font-medium ${record.projectGrossProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                {formatCurrency(record.projectGrossProfit)}
                              </td>
                              <td className={`px-4 py-3 text-right ${record.projectGrossMargin >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                {formatPercent(record.projectGrossMargin)}
                              </td>
                              <td className="px-4 py-3">{record.verifiedAt ? String(record.verifiedAt).replace('T', ' ').slice(0, 19) : '-'}</td>
                            </tr>
                          ))}
                          {profitDetail.usageRecords.length === 0 && (
                            <tr>
                              <td className="px-4 py-8 text-center text-gray-400" colSpan={10}>暂无核销履约记录</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Card Consume Dialog */}
      {isConsumeDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-[500px]">
            {/* Dialog Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-lg font-medium">次卡消费</h2>
              <button
                onClick={handleCloseConsumeDialog}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Dialog Body */}
            <div className="p-6 space-y-7">
              {consumeOrder && (
                <div className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                  <div className="font-medium">{consumeOrder.cardName}</div>
                  <div className="mt-1 text-xs text-blue-700">
                    客户：{consumeOrder.userName}{consumeOrder.customerPhone ? ` · ${consumeOrder.customerPhone}` : ''}；整卡剩余：
                    {consumeOrder.remainingTimes ?? '-'} / {consumeOrder.totalTimes ?? '-'} 次
                  </div>
                </div>
              )}

              {/* 消费项目 */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-0.5 min-w-[80px] justify-end">
                  <span className="text-red-500 text-sm">*</span>
                  <label className="text-sm text-gray-800 font-medium">消费项目</label>
                </div>
                <select
                  className="flex-1 h-10 px-3 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  value={consumeProject}
                  onChange={(e) => setConsumeProject(e.target.value)}
                >
                  <option value="">请选择项目</option>
                  {consumeProjects.map(project => (
                    <option key={project.projectName} value={project.projectName} disabled={project.remainCount <= 0}>
                      {project.projectName}（剩余 {project.remainCount} 次）
                    </option>
                  ))}
                </select>
              </div>
              {consumeProjects.length === 0 && (
                <div className="ml-[92px] rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  当前次卡没有配置可核销项目，请先在次卡管理中维护项目明细。
                </div>
              )}

              {/* 消费次数 */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-0.5 min-w-[80px] justify-end">
                    <span className="text-red-500 text-sm">*</span>
                    <label className="text-sm text-gray-800 font-medium">消费次数</label>
                  </div>
                  <div className="flex items-center">
                    <button
                      className="w-9 h-10 border border-gray-300 rounded-l-md flex items-center justify-center hover:bg-gray-50 text-gray-500 bg-gray-50"
                      onClick={() => setConsumeCount(Math.max(1, consumeCount - 1))}
                      disabled={!selectedConsumeProject}
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <Input
                      type="number"
                      className="w-20 h-10 rounded-none border-x-0 text-center"
                      value={consumeCount}
                      min={1}
                      max={selectedConsumeProject?.remainCount ?? 1}
                      onChange={(e) => {
                        const max = selectedConsumeProject?.remainCount ?? 1;
                        setConsumeCount(Math.min(max, Math.max(1, parseInt(e.target.value) || 1)));
                      }}
                      disabled={!selectedConsumeProject}
                    />
                    <button
                      className="w-9 h-10 border border-gray-300 rounded-r-md flex items-center justify-center hover:bg-gray-50 text-gray-500 bg-gray-50"
                      onClick={() => {
                        const max = selectedConsumeProject?.remainCount ?? 1;
                        setConsumeCount(Math.min(max, consumeCount + 1));
                      }}
                      disabled={!selectedConsumeProject}
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {selectedConsumeProject && (
                  <div className="ml-[92px] text-sm text-gray-500">
                    本卡项目总次数：{selectedConsumeProject.totalCount} 次；已核销：{selectedConsumeProject.usedCount} 次；可用剩余：
                    {selectedConsumeProject.remainCount} 次
                  </div>
                )}
              </div>

              {/* 服务人员 */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-0.5 min-w-[80px] justify-end">
                  <span className="text-red-500 text-sm">*</span>
                  <label className="text-sm text-gray-800 font-medium">服务人员</label>
                </div>
                <select
                  className="flex-1 h-10 px-3 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-50 disabled:text-gray-400"
                  value={consumeBeauticianId}
                  onChange={(event) => setConsumeBeauticianId(event.target.value)}
                  disabled={consumeBeauticiansLoading || consumeBeauticians.length === 0}
                >
                  <option value="">
                    {consumeBeauticiansLoading ? '服务人员加载中...' : consumeBeauticians.length ? '请选择服务人员' : '暂无可选服务人员'}
                  </option>
                  {consumeBeauticians.map((beautician) => (
                    <option key={beautician.id} value={String(beautician.id)}>
                      {beautician.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="ml-[92px] text-xs text-gray-500">本次核销将按所选服务人员计算项目提成。</div>

              {/* 操作顾问 */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-0.5 min-w-[80px] justify-end">
                  <span className="text-red-500 text-sm">*</span>
                  <label className="text-sm text-gray-800 font-medium">操作顾问</label>
                </div>
                <Input
                  className="flex-1 h-10 bg-gray-50 text-gray-500"
                  value={currentUser?.name || currentUser?.username || '当前登录用户'}
                  disabled
                  readOnly
                />
              </div>
            </div>

            {/* Dialog Footer */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
              <Button variant="outline" onClick={handleCloseConsumeDialog}>
                取 消
              </Button>
              <Button
                className="bg-[#1890ff] hover:bg-[#40a9ff]"
                onClick={handleConsumeSubmit}
                disabled={
                  consumeSubmitting ||
                  !selectedConsumeProject ||
                  !selectedConsumeBeautician ||
                  consumeCount > (selectedConsumeProject?.remainCount ?? 0)
                }
              >
                {consumeSubmitting ? '提交中...' : '确 定'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
