import React, { useEffect, useMemo, useState } from 'react';
import { CreditCard, Gift, Loader2, Minus, MinusCircle, Plus, ReceiptText, RotateCcw, Search, Trash2, WalletCards } from 'lucide-react';
import { toast } from 'sonner';
import { isRealApi } from '@/api/mode';
import {
  deductMemberCard,
  getMemberCardsPaginated,
  getMemberCardTransactions,
  giftMemberCard,
  openMemberCard,
  rechargeMemberCard,
  refundMemberCard,
} from '@/api/order';
import { getBeauticians } from '@/api/beautician';
import { getProducts } from '@/api/product';
import { getProjects } from '@/api/project';
import { getStores } from '@/api/store';
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/UI';
import { CustomerPicker } from '../components/CustomerPicker';
import { PaymentMethodSelector, type PaymentMethodOption } from '../components/PaymentMethodSelector';
import { usePagination } from '@/hooks/usePagination';
import { useStoreStore } from '@/stores/storeStore';
import type { Beautician, Customer, MemberCardAccount, MemberCardTransaction, Product, Project, Store } from '@/types';

type FormMode = 'open' | 'recharge' | 'gift' | 'deduct' | 'refund';
type DeductItemType = 'project' | 'product';
type MemberCardDeductDraftItem = {
  rowId: number;
  itemType: DeductItemType;
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  beauticianId: string;
  beauticianName: string;
};

const PAYMENT_METHODS: PaymentMethodOption[] = [
  { value: 'cash', label: '现金支付' },
  { value: 'wechat', label: '微信支付' },
  { value: 'alipay', label: '支付宝' },
  { value: 'bank_card', label: '银行卡' },
];

const DEMO_STORES = [
  { id: 1, name: 'Ami 总店' },
  { id: 2, name: 'Ami 东区店' },
  { id: 3, name: 'Ami 西区店' },
];

const DEMO_CUSTOMERS = [
  { id: 1007, name: '阿明', phone: '13800001007' },
  { id: 1006, name: '李四', phone: '13800001006' },
  { id: 1005, name: '李鹏祖', phone: '13800001005' },
  { id: 1004, name: '范蓉蓉', phone: '13800001004' },
  { id: 1003, name: '洪琦', phone: '13800001003' },
  { id: 1002, name: '沈燕', phone: '13800001002' },
  { id: 1001, name: '张三', phone: '13800001001' },
];

const DEMO_GIFT_PROJECTS = ['深层补水护理', '敏感肌舒缓修护', '肩颈放松护理'];

const initialForm = {
  customerId: '',
  rechargeAmount: '0.00',
  giftAmount: '0.00',
  giftProjects: [] as string[],
  deductItems: [] as MemberCardDeductDraftItem[],
  paymentMethod: 'cash',
  remark: '',
};

function formatCurrency(value: number) {
  return `¥${Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
}

function parseAmount(value: string) {
  return Math.max(0, Number(value || 0));
}

function dateText(value?: string) {
  return value ? value.slice(0, 10) : '-';
}

function paymentMethodText(value?: string) {
  return PAYMENT_METHODS.find((item) => item.value === value)?.label ?? value ?? '-';
}

function transactionTypeText(value?: string) {
  const labels: Record<string, string> = {
    open: '开卡',
    recharge: '充值',
    gift: '赠送',
    deduct: '划扣',
    refund: '退款',
  };
  return value ? (labels[value] ?? value) : '-';
}

function AmountStepper({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const step = (delta: number) => {
    const next = Math.max(0, parseAmount(value) + delta);
    onChange(next.toFixed(2));
  };

  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-foreground">
        {required && <span className="mr-1 text-destructive">*</span>}
        {label}
      </span>
      <div className="flex h-11 overflow-hidden rounded-lg border border-input bg-background shadow-sm">
        <button
          type="button"
          className="flex w-12 items-center justify-center border-r border-input bg-muted/50 text-muted-foreground hover:bg-muted"
          onClick={() => step(-10)}
        >
          <Minus className="h-4 w-4" />
        </button>
        <Input
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-full flex-1 rounded-none border-0 bg-background text-center text-base shadow-none focus-visible:ring-0"
        />
        <button
          type="button"
          className="flex w-12 items-center justify-center border-l border-input bg-muted/50 text-muted-foreground hover:bg-muted"
          onClick={() => step(10)}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </label>
  );
}

function uniqueProjectNames(projects: string[]) {
  return Array.from(new Set(projects.map((project) => project.trim()).filter(Boolean)));
}

function createDeductDraftItem(itemType: DeductItemType = 'project'): MemberCardDeductDraftItem {
  return {
    rowId: Date.now() + Math.floor(Math.random() * 1000),
    itemType,
    itemId: '',
    name: '',
    quantity: 1,
    unitPrice: 0,
    beauticianId: '',
    beauticianName: '',
  };
}

function GiftProjectPicker({
  projects,
  selectedProjects,
  onChange,
}: {
  projects: string[];
  selectedProjects: string[];
  onChange: (projects: string[]) => void;
}) {
  const [draftRows, setDraftRows] = useState<string[]>([]);
  const selectedSet = useMemo(() => new Set(selectedProjects), [selectedProjects]);
  const hasAvailableProject = projects.some((project) => !selectedSet.has(project));

  const rows = useMemo(
    () => [
      ...selectedProjects.map((project) => ({ key: `selected-${project}`, project, draft: false })),
      ...draftRows.map((key) => ({ key, project: '', draft: true })),
    ],
    [draftRows, selectedProjects],
  );

  const addRow = () => {
    if (!hasAvailableProject) return;
    setDraftRows((prev) => [...prev, `gift-project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`]);
  };

  const removeRow = (row: { key: string; project: string; draft: boolean }) => {
    if (row.draft) {
      setDraftRows((prev) => prev.filter((key) => key !== row.key));
      return;
    }
    onChange(selectedProjects.filter((project) => project !== row.project));
  };

  const updateRow = (row: { key: string; project: string; draft: boolean }, nextProject: string) => {
    if (row.draft) {
      setDraftRows((prev) => prev.filter((key) => key !== row.key));
      if (nextProject) onChange(uniqueProjectNames([...selectedProjects, nextProject]));
      return;
    }
    if (!nextProject) {
      onChange(selectedProjects.filter((project) => project !== row.project));
      return;
    }
    onChange(uniqueProjectNames(selectedProjects.map((project) => (project === row.project ? nextProject : project))));
  };

  const renderOptions = (currentProject: string) => {
    const unavailable = new Set(selectedProjects.filter((project) => project !== currentProject));
    return projects
      .filter((project) => project === currentProject || !unavailable.has(project))
      .map((project) => (
        <option key={project} value={project}>
          {project}
        </option>
      ));
  };

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">赠送项目</div>
          <div className="mt-1 text-xs text-muted-foreground">可添加多个项目，与智能终端充值保持一致。</div>
        </div>
        <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addRow} disabled={!hasAvailableProject}>
          <Plus className="h-4 w-4" />
          添加项目
        </Button>
      </div>
      {projects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-background px-3 py-4 text-center text-sm text-muted-foreground">
          暂无可选项目，请先在项目管理维护已启用项目。
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-background px-3 py-4 text-center text-sm text-muted-foreground">
          暂未选择赠送项目。
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.key} className="flex items-center gap-2">
              <select
                value={row.project}
                onChange={(event) => updateRow(row, event.target.value)}
                className="h-10 flex-1 rounded-lg border border-input bg-background px-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring/40"
              >
                <option value="">请选择赠送项目</option>
                {renderOptions(row.project)}
              </select>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border text-destructive hover:bg-destructive/10"
                onClick={() => removeRow(row)}
                title="删除赠送项目"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 text-right text-xs text-muted-foreground">已选 {selectedProjects.length} 项</div>
    </div>
  );
}

export function MemberCardManagement() {
  const currentStoreId = useStoreStore((state) => state.currentStoreId);
  const globalStores = useStoreStore((state) => state.stores);
  const loadGlobalStores = useStoreStore((state) => state.loadStores);
  const [keywordInput, setKeywordInput] = useState('');
  const [storeInput, setStoreInput] = useState('');
  const [filters, setFilters] = useState<{ keyword?: string; storeId?: number }>({});
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [beauticians, setBeauticians] = useState<Beautician[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>('open');
  const [selectedAccount, setSelectedAccount] = useState<MemberCardAccount | null>(null);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [detailAccount, setDetailAccount] = useState<MemberCardAccount | null>(null);
  const [transactions, setTransactions] = useState<MemberCardTransaction[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const stableFilters = useMemo(() => filters, [filters]);
  const { data: accounts, total, page, pageSize, loading, setPage, setPageSize, refresh } =
    usePagination<MemberCardAccount>(getMemberCardsPaginated, stableFilters);

  useEffect(() => {
    void loadGlobalStores();
    getStores()
      .then(setStores)
      .catch(() => {
        setStores([]);
        toast.error('门店数据加载失败，请稍后重试');
      });
    getProjects()
      .then(setProjects)
      .catch(() => {
        setProjects([]);
        toast.error('项目数据加载失败，请稍后重试');
      });
    getProducts({ status: 'active' })
      .then(setProducts)
      .catch(() => {
        setProducts([]);
        toast.error('商品数据加载失败，请稍后重试');
      });
    getBeauticians()
      .then(setBeauticians)
      .catch(() => {
        setBeauticians([]);
        toast.error('员工数据加载失败，请稍后重试');
      });
  }, [loadGlobalStores]);

  const storeOptions = useMemo(
    () => (isRealApi ? stores.map((store) => ({ id: store.id, name: store.name })) : DEMO_STORES),
    [stores],
  );
  const customerOptions = useMemo(
    () => (isRealApi ? [] : DEMO_CUSTOMERS),
    [],
  );
  const giftProjectOptions = useMemo(
    () =>
      isRealApi
        ? uniqueProjectNames(projects.filter((project) => project.status !== false).map((project) => project.name))
        : DEMO_GIFT_PROJECTS,
    [projects],
  );
  const selectedAccountStoreName = selectedAccount?.storeName?.trim();
  const selectableDeductProjects = useMemo(
    () =>
      projects.filter(
        (project) =>
          project.status !== false &&
          (!selectedAccountStoreName || !project.storeName || project.storeName === selectedAccountStoreName),
      ),
    [projects, selectedAccountStoreName],
  );
  const selectableDeductProducts = useMemo(
    () =>
      products.filter(
        (product) =>
          product.status !== '停售' &&
          (!selectedAccountStoreName || !product.storeName || product.storeName === selectedAccountStoreName),
      ),
    [products, selectedAccountStoreName],
  );
  const selectableBeauticians = useMemo(
    () =>
      beauticians.filter(
        (beautician) =>
          beautician.status === '在职' &&
          (!selectedAccountStoreName || !beautician.storeName || beautician.storeName === selectedAccountStoreName),
      ),
    [beauticians, selectedAccountStoreName],
  );
  const currentStore = useMemo(() => {
    if (!currentStoreId) return null;
    return (
      globalStores.find((store) => store.id === currentStoreId) ??
      stores.find((store) => store.id === currentStoreId) ??
      null
    );
  }, [currentStoreId, globalStores, stores]);

  const openForm = (mode: FormMode, account?: MemberCardAccount) => {
    setIsFormOpen(true);
    setFormMode(mode);
    setSelectedAccount(account ?? null);
    setForm({
      ...initialForm,
      customerId: account ? String(account.customerId) : '',
      deductItems: mode === 'deduct' ? [createDeductDraftItem()] : [],
    });
    setCustomerSearch('');
    setSelectedCustomer(null);
  };

  const updateDeductItem = (rowId: number, patch: Partial<MemberCardDeductDraftItem>) => {
    setForm((prev) => ({
      ...prev,
      deductItems: prev.deductItems.map((item) => (item.rowId === rowId ? { ...item, ...patch } : item)),
    }));
  };

  const addDeductItem = () => {
    setForm((prev) => ({ ...prev, deductItems: [...prev.deductItems, createDeductDraftItem()] }));
  };

  const removeDeductItem = (rowId: number) => {
    setForm((prev) => ({
      ...prev,
      deductItems: prev.deductItems.length <= 1 ? prev.deductItems : prev.deductItems.filter((item) => item.rowId !== rowId),
    }));
  };

  const handleDeductItemTypeChange = (rowId: number, itemType: DeductItemType) => {
    updateDeductItem(rowId, { itemType, itemId: '', name: '', unitPrice: 0 });
  };

  const handleDeductCatalogSelect = (rowId: number, itemId: string) => {
    const current = form.deductItems.find((item) => item.rowId === rowId);
    if (!current) return;
    if (!itemId) {
      updateDeductItem(rowId, { itemId: '', name: '', unitPrice: 0 });
      return;
    }
    if (current.itemType === 'project') {
      const project = selectableDeductProjects.find((item) => String(item.id) === itemId);
      updateDeductItem(rowId, {
        itemId,
        name: project?.name ?? '',
        unitPrice: Number(project?.price ?? 0),
      });
      return;
    }
    const product = selectableDeductProducts.find((item) => String(item.id) === itemId);
    updateDeductItem(rowId, {
      itemId,
      name: product?.name ?? '',
      unitPrice: Number(product?.salePrice ?? product?.retailPrice ?? 0),
    });
  };

  const handleDeductBeauticianSelect = (rowId: number, beauticianId: string) => {
    const beautician = selectableBeauticians.find((item) => String(item.id) === beauticianId);
    updateDeductItem(rowId, { beauticianId, beauticianName: beautician?.name ?? '' });
  };

  const deductTotal = useMemo(
    () =>
      form.deductItems.reduce(
        (sum, item) => sum + Math.max(0, Number(item.quantity || 0)) * Math.max(0, Number(item.unitPrice || 0)),
        0,
      ),
    [form.deductItems],
  );

  const closeForm = () => {
    setIsFormOpen(false);
    setSelectedAccount(null);
    setForm(initialForm);
    setCustomerSearch('');
    setSelectedCustomer(null);
  };

  const submitForm = async () => {
    const rechargeAmount = parseAmount(form.rechargeAmount);
    const giftAmount = parseAmount(form.giftAmount);
    const formCustomer = isRealApi
      ? selectedCustomer
      : customerOptions.find((item) => item.id === Number(form.customerId));

    try {
      setSubmitting(true);
      if (formMode === 'open') {
        if (!currentStoreId || !currentStore) throw new Error('请先在顶部标题栏选择具体门店');
        if (!formCustomer) throw new Error('请选择客户');
        if (rechargeAmount <= 0) throw new Error('充值金额必须大于 0');
        await openMemberCard({
          storeId: currentStore.id,
          storeName: currentStore.name,
          customerId: formCustomer.id,
          customerName: formCustomer.name,
          customerPhone: formCustomer.phone,
          rechargeAmount,
          giftAmount,
          giftProjects: form.giftProjects,
          paymentMethod: form.paymentMethod,
          remark: form.remark,
        });
        toast.success('会员卡开卡成功');
      } else if (formMode === 'recharge' && selectedAccount) {
        if (rechargeAmount <= 0) throw new Error('充值金额必须大于 0');
        await rechargeMemberCard(selectedAccount.id, {
          rechargeAmount,
          giftAmount,
          giftProjects: form.giftProjects,
          paymentMethod: form.paymentMethod,
          remark: form.remark,
        });
        toast.success('充值成功');
      } else if (formMode === 'gift' && selectedAccount) {
        if (giftAmount <= 0) throw new Error('赠送金额必须大于 0');
        await giftMemberCard(selectedAccount.id, { giftAmount, remark: form.remark });
        toast.success('赠送成功');
      } else if (formMode === 'deduct' && selectedAccount) {
        const validItems = form.deductItems
          .map((item) => {
            const quantity = Math.max(0, Number(item.quantity || 0));
            const unitPrice = Math.max(0, Number(item.unitPrice || 0));
            const subtotal = Math.round(quantity * unitPrice * 100) / 100;
            return {
              itemType: item.itemType,
              itemId: item.itemId ? Number(item.itemId) : undefined,
              name: item.name.trim(),
              quantity,
              unitPrice,
              subtotal,
              netAmount: subtotal,
              beauticianId: Number(item.beauticianId || 0),
              beauticianName: item.beauticianName,
            };
          })
          .filter((item) => item.name && item.quantity > 0 && item.unitPrice >= 0);
        if (!validItems.length) throw new Error('请添加至少一项划扣项目或商品');
        if (validItems.some((item) => !item.beauticianId)) throw new Error('每条划扣明细都需要选择服务人员');
        const totalAmount = Math.round(validItems.reduce((sum, item) => sum + item.subtotal, 0) * 100) / 100;
        if (totalAmount <= 0) throw new Error('划扣明细金额必须大于 0');
        await deductMemberCard(selectedAccount.id, { amount: totalAmount, items: validItems, remark: form.remark });
        toast.success('划扣成功');
      } else if (formMode === 'refund' && selectedAccount) {
        if (rechargeAmount <= 0) throw new Error('退款金额必须大于 0');
        if (rechargeAmount > Number(selectedAccount.availableBalance ?? 0)) throw new Error('退款金额不能大于储值现金余额');
        await refundMemberCard(selectedAccount.id, {
          amount: rechargeAmount,
          paymentMethod: form.paymentMethod,
          remark: form.remark,
        });
        toast.success('退款成功');
      }
      closeForm();
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '操作失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  const applySearch = () => {
    setFilters({
      keyword: keywordInput.trim() || undefined,
      storeId: storeInput ? Number(storeInput) : undefined,
    });
    setPage(1);
  };

  const resetSearch = () => {
    setKeywordInput('');
    setStoreInput('');
    setFilters({});
    setPage(1);
  };

  const openDetail = async (account: MemberCardAccount) => {
    setDetailAccount(account);
    setDetailLoading(true);
    try {
      setTransactions(await getMemberCardTransactions(account.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '明细加载失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const formTitle =
    formMode === 'open'
      ? '会员开卡'
      : formMode === 'recharge'
        ? '会员卡充值'
        : formMode === 'gift'
          ? '赠送余额'
          : formMode === 'deduct'
            ? '会员卡划扣'
            : '会员卡退款';

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">关键词</span>
            <Input
              value={keywordInput}
              onChange={(event) => setKeywordInput(event.target.value)}
              placeholder="会员编号/用户/手机/订单号/流水号"
              className="w-56"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">所属门店</span>
            <select
              value={storeInput}
              onChange={(event) => setStoreInput(event.target.value)}
              className="h-10 w-44 rounded-lg border border-input bg-background px-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring/40"
            >
              <option value="">全部门店</option>
              {storeOptions.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </div>
          <Button className="gap-2" onClick={applySearch}>
            <Search className="h-4 w-4" />
            搜索
          </Button>
          <Button variant="outline" className="gap-2" onClick={resetSearch}>
            <RotateCcw className="h-4 w-4" />
            重置
          </Button>
        </div>
        <Button className="gap-2 bg-[#1890ff] hover:bg-[#40a9ff]" onClick={() => openForm('open')}>
          <Plus className="h-4 w-4" />
          新增开卡
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-primary" />
          正在加载会员卡...
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>编号</TableHead>
              <TableHead>用户名</TableHead>
              <TableHead>累计充值</TableHead>
              <TableHead>累计消费</TableHead>
              <TableHead>可用余额</TableHead>
              <TableHead>赠送余额</TableHead>
              <TableHead>办理人员</TableHead>
              <TableHead>最近流水</TableHead>
              <TableHead>备注</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((account) => (
              <TableRow key={account.id}>
                <TableCell className="font-medium text-foreground/80">{account.accountNo}</TableCell>
                <TableCell>{account.userName}</TableCell>
                <TableCell>{formatCurrency(account.totalRecharge)}</TableCell>
                <TableCell>{formatCurrency(account.totalConsumed)}</TableCell>
                <TableCell className="font-medium">{formatCurrency(account.availableBalance)}</TableCell>
                <TableCell>{formatCurrency(account.giftBalance)}</TableCell>
                <TableCell>{account.handlerName || '-'}</TableCell>
                <TableCell>
                  <div className="max-w-[170px] space-y-1 text-xs">
                    <div className="font-medium text-foreground/80">{account.lastOrderNo || account.lastTransactionNo || '-'}</div>
                    {account.lastTransactionNo && (
                      <div className="truncate text-muted-foreground" title={account.lastTransactionNo}>
                        {transactionTypeText(account.lastTransactionType)}
                        {account.lastTransactionAmount !== undefined ? ` · ${formatCurrency(account.lastTransactionAmount)}` : ''}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="block max-w-[150px] truncate" title={account.remark}>
                    {account.remark || '-'}
                  </span>
                </TableCell>
                <TableCell>{dateText(account.createdAt)}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-3 whitespace-nowrap text-sm">
                    <button className="inline-flex items-center gap-1 text-[#1890ff] hover:text-[#096dd9]" onClick={() => openForm('recharge', account)}>
                      <CreditCard className="h-4 w-4" />
                      充值
                    </button>
                    <button className="inline-flex items-center gap-1 text-[#52c41a] hover:text-[#389e0d]" onClick={() => openForm('gift', account)}>
                      <Gift className="h-4 w-4" />
                      赠送
                    </button>
                    <button className="inline-flex items-center gap-1 text-[#ff4d4f] hover:text-[#cf1322]" onClick={() => openForm('deduct', account)}>
                      <MinusCircle className="h-4 w-4" />
                      划扣
                    </button>
                    <button
                      className="inline-flex items-center gap-1 text-red-500 hover:text-red-600 disabled:text-gray-300"
                      onClick={() => openForm('refund', account)}
                      disabled={Number(account.availableBalance ?? 0) <= 0}
                    >
                      <RotateCcw className="h-4 w-4" />
                      退款
                    </button>
                    <button className="inline-flex items-center gap-1 text-[#fa8c16] hover:text-[#d46b08]" onClick={() => openDetail(account)}>
                      <ReceiptText className="h-4 w-4" />
                      明细
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {accounts.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="py-12 text-center text-muted-foreground">
                  暂无会员卡数据
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <div className="flex items-center justify-between border-t border-border px-1 pt-3">
        <div className="text-sm text-muted-foreground">共 {total} 条</div>
        <div className="flex items-center gap-2">
          <select
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
            className="h-8 rounded border border-input bg-background px-2 text-sm"
          >
            <option value={10}>10条/页</option>
            <option value={20}>20条/页</option>
            <option value={50}>50条/页</option>
          </select>
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            上一页
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {Math.ceil(total / pageSize) || 1}
          </span>
          <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage(page + 1)}>
            下一页
          </Button>
        </div>
      </div>

      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <div className={`w-full rounded-lg border border-border bg-card shadow-[0_24px_80px_rgba(15,23,42,0.18)] ${formMode === 'deduct' ? 'max-w-[960px]' : 'max-w-[560px]'}`}>
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div className="flex items-center gap-2 text-base font-semibold">
                <WalletCards className="h-5 w-5 text-primary" />
                {formTitle}
              </div>
              <button className="rounded-md p-1 text-muted-foreground hover:bg-muted" onClick={closeForm}>
                ×
              </button>
            </div>
            <div className="space-y-5 px-6 py-5">
              {formMode === 'open' ? (
                <>
                  {isRealApi ? (
                    <CustomerPicker
                      value={customerSearch}
                      onValueChange={(value) => {
                        setCustomerSearch(value);
                        if (form.customerId) {
                          setSelectedCustomer(null);
                          setForm((prev) => ({ ...prev, customerId: '' }));
                        }
                      }}
                      onSelect={(customer) => {
                        setSelectedCustomer(customer);
                        setForm((prev) => ({ ...prev, customerId: customer ? String(customer.id) : '' }));
                      }}
                      selectedCustomerId={form.customerId}
                      storeName={currentStore?.name}
                      label="选择用户"
                      required
                      placeholder="输入客户姓名或手机号搜索"
                      emptyText="未找到客户，请先到客户资料中建档。"
                    />
                  ) : (
                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-foreground">
                        <span className="mr-1 text-destructive">*</span>选择用户
                      </span>
                      <select
                        value={form.customerId}
                        onChange={(event) => setForm((prev) => ({ ...prev, customerId: event.target.value }))}
                        className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring/40"
                      >
                        <option value="">请选择客户</option>
                        {customerOptions.map((customer) => (
                          <option key={customer.id} value={customer.id}>
                            {customer.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </>
              ) : (
                <div className="rounded-lg border border-border bg-muted/25 p-4">
                  <div className="text-sm font-medium text-foreground">{selectedAccount?.userName}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    编号 {selectedAccount?.accountNo} · 可用余额 {formatCurrency(selectedAccount?.availableBalance ?? 0)} · 赠送余额{' '}
                    {formatCurrency(selectedAccount?.giftBalance ?? 0)}
                  </div>
                </div>
              )}

              {(formMode === 'open' || formMode === 'recharge' || formMode === 'refund') && (
                <AmountStepper
                  label={formMode === 'refund' ? '退款金额(元)' : '充值金额(元)'}
                  value={form.rechargeAmount}
                  onChange={(value) => setForm((prev) => ({ ...prev, rechargeAmount: value }))}
                  required
                />
              )}

              {formMode === 'deduct' && (
                <div className="rounded-lg border border-border bg-muted/20 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground">划扣明细</div>
                      <div className="mt-1 text-xs text-muted-foreground">选择商品/项目和服务人员，系统按明细合计执行会员卡划扣。</div>
                    </div>
                    <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addDeductItem}>
                      <Plus className="h-4 w-4" />
                      添加明细
                    </Button>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-border bg-background">
                    <div className="grid min-w-[850px] grid-cols-[92px_1.25fr_1fr_82px_100px_116px_42px] gap-2 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                      <span>类型</span>
                      <span>项目/商品</span>
                      <span>服务人员</span>
                      <span>次数/数量</span>
                      <span>单价</span>
                      <span>小计</span>
                      <span />
                    </div>
                    <div className="divide-y divide-border">
                      {form.deductItems.map((item) => {
                        const subtotal = Math.max(0, Number(item.quantity || 0)) * Math.max(0, Number(item.unitPrice || 0));
                        const catalogOptions = item.itemType === 'project' ? selectableDeductProjects : selectableDeductProducts;
                        return (
                          <div key={item.rowId} className="grid min-w-[850px] grid-cols-[92px_1.25fr_1fr_82px_100px_116px_42px] gap-2 px-3 py-3">
                            <select
                              value={item.itemType}
                              onChange={(event) => handleDeductItemTypeChange(item.rowId, event.target.value as DeductItemType)}
                              className="h-10 rounded-lg border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                            >
                              <option value="project">项目</option>
                              <option value="product">商品</option>
                            </select>
                            <select
                              value={item.itemId}
                              onChange={(event) => handleDeductCatalogSelect(item.rowId, event.target.value)}
                              className="h-10 min-w-0 rounded-lg border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                            >
                              <option value="">{item.itemType === 'project' ? '请选择项目' : '请选择商品'}</option>
                              {catalogOptions.map((catalogItem) => (
                                <option key={catalogItem.id} value={catalogItem.id}>
                                  {catalogItem.name}
                                </option>
                              ))}
                            </select>
                            <select
                              value={item.beauticianId}
                              onChange={(event) => handleDeductBeauticianSelect(item.rowId, event.target.value)}
                              className="h-10 min-w-0 rounded-lg border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                            >
                              <option value="">请选择服务人员</option>
                              {selectableBeauticians.map((beautician) => (
                                <option key={beautician.id} value={beautician.id}>
                                  {beautician.name}
                                </option>
                              ))}
                            </select>
                            <Input
                              type="number"
                              min="1"
                              step="1"
                              value={item.quantity}
                              onChange={(event) => updateDeductItem(item.rowId, { quantity: Math.max(1, Number(event.target.value || 1)) })}
                              className="h-10"
                            />
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.unitPrice}
                              onChange={(event) => updateDeductItem(item.rowId, { unitPrice: Math.max(0, Number(event.target.value || 0)) })}
                              className="h-10"
                            />
                            <div className="flex h-10 items-center rounded-lg bg-muted/60 px-3 text-sm font-semibold text-foreground">
                              {formatCurrency(subtotal)}
                            </div>
                            <button
                              type="button"
                              onClick={() => removeDeductItem(item.rowId)}
                              disabled={form.deductItems.length <= 1}
                              className="flex h-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                              title="删除明细"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <div className="text-muted-foreground">
                      可用总余额 {formatCurrency((selectedAccount?.availableBalance ?? 0) + (selectedAccount?.giftBalance ?? 0))}
                    </div>
                    <div className="font-semibold text-foreground">
                      划扣合计 {formatCurrency(deductTotal)}
                    </div>
                  </div>
                </div>
              )}

              {(formMode === 'open' || formMode === 'recharge' || formMode === 'gift') && (
                <AmountStepper
                  label={formMode === 'gift' ? '赠送金额(元)' : '赠送金额(元)(选填)'}
                  value={form.giftAmount}
                  onChange={(value) => setForm((prev) => ({ ...prev, giftAmount: value }))}
                  required={formMode === 'gift'}
                />
              )}

              {(formMode === 'open' || formMode === 'recharge') && (
                <GiftProjectPicker
                  projects={giftProjectOptions}
                  selectedProjects={form.giftProjects}
                  onChange={(giftProjects) => setForm((prev) => ({ ...prev, giftProjects }))}
                />
              )}

              {(formMode === 'open' || formMode === 'recharge' || formMode === 'refund') && (
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-foreground">{formMode === 'refund' ? '退款方式' : '支付方式'}</span>
                  <PaymentMethodSelector<string>
                    value={form.paymentMethod}
                    onChange={(paymentMethod) => setForm((prev) => ({ ...prev, paymentMethod }))}
                    methods={PAYMENT_METHODS}
                    columnsClassName="grid-cols-2 sm:grid-cols-4"
                    activeClassName="border-primary bg-primary/10 text-primary"
                    inactiveClassName="border-input bg-background text-foreground hover:bg-muted"
                  />
                </label>
              )}

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-foreground">备注(选填)</span>
                <textarea
                  value={form.remark}
                  onChange={(event) => setForm((prev) => ({ ...prev, remark: event.target.value }))}
                  placeholder="相关说明"
                  className="min-h-[82px] w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring/40"
                />
              </label>
            </div>
            <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
              <Button variant="outline" onClick={closeForm}>
                取消
              </Button>
              <Button className="min-w-24 bg-[#1890ff] hover:bg-[#40a9ff]" onClick={submitForm} disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                确定
              </Button>
            </div>
          </div>
        </div>
      )}

      {detailAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-[760px] rounded-lg border border-border bg-card shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <div className="text-base font-semibold">会员卡明细</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {detailAccount.accountNo} · {detailAccount.userName}
                </div>
              </div>
              <button className="rounded-md p-1 text-muted-foreground hover:bg-muted" onClick={() => setDetailAccount(null)}>
                ×
              </button>
            </div>
            <div className="max-h-[60vh] overflow-auto p-6">
              {detailLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin text-primary" />
                  正在加载明细...
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>订单号</TableHead>
                      <TableHead>流水号</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>金额</TableHead>
                      <TableHead>赠送</TableHead>
                      <TableHead>支付方式</TableHead>
                      <TableHead>备注</TableHead>
                      <TableHead>时间</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((transaction) => (
                      <TableRow key={transaction.id}>
                        <TableCell>{transaction.orderNo || '-'}</TableCell>
                        <TableCell>{transaction.transactionNo}</TableCell>
                        <TableCell>{transaction.typeLabel}</TableCell>
                        <TableCell>{formatCurrency(transaction.amount)}</TableCell>
                        <TableCell>{formatCurrency(transaction.giftAmount)}</TableCell>
                        <TableCell>{paymentMethodText(transaction.paymentMethod)}</TableCell>
                        <TableCell>{transaction.remark || '-'}</TableCell>
                        <TableCell>{transaction.createdAt}</TableCell>
                      </TableRow>
                    ))}
                    {transactions.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                          暂无流水明细
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </div>
            <div className="flex justify-end border-t border-border px-6 py-4">
              <Button variant="outline" onClick={() => setDetailAccount(null)}>
                关闭
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
