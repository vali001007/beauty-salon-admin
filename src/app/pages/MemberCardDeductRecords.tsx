import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CreditCard, Download, Loader2, Plus, Search, Trash2, WalletCards } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/UI';
import { deductMemberCard, getMemberCardDeductRecordsPaginated, getMemberCardsPaginated } from '@/api/order';
import { getBeauticians } from '@/api/beautician';
import { getProducts } from '@/api/product';
import { getProjects } from '@/api/project';
import { usePagination } from '@/hooks/usePagination';
import { useStoreStore } from '@/stores/storeStore';
import { exportToExcel } from '@/utils/excel';
import type { Beautician, MemberCardAccount, MemberCardTransaction, Product, Project } from '@/types';
import type { ExportColumn } from '@/types/excel';

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

const EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'transactionNo', header: '流水号', width: 22 },
  { key: 'customerName', header: '客户', width: 14 },
  { key: 'customerPhone', header: '手机号', width: 16 },
  { key: 'storeName', header: '门店', width: 22 },
  { key: 'amount', header: '本金划扣', width: 14 },
  { key: 'giftAmount', header: '赠送划扣', width: 14 },
  { key: 'orderNo', header: '关联订单', width: 20 },
  { key: 'remark', header: '备注', width: 24 },
  { key: 'createdAt', header: '划扣时间', width: 20 },
];

function formatCurrency(value?: number | null) {
  return `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function getTotalDeduct(record: MemberCardTransaction) {
  return Number(record.amount || 0) + Number(record.giftAmount || 0);
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

export function MemberCardDeductRecords() {
  const [keyword, setKeyword] = useState('');
  const currentStoreId = useStoreStore((state) => state.currentStoreId);

  const [isDeductOpen, setIsDeductOpen] = useState(false);
  const [accountKeyword, setAccountKeyword] = useState('');
  const [accountOptions, setAccountOptions] = useState<MemberCardAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [beauticians, setBeauticians] = useState<Beautician[]>([]);
  const [deductItems, setDeductItems] = useState<MemberCardDeductDraftItem[]>([createDeductDraftItem()]);
  const [remark, setRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const filters = useMemo(
    () => ({
      keyword: keyword.trim() || undefined,
      storeId: currentStoreId ?? undefined,
    }),
    [currentStoreId, keyword],
  );

  const {
    data: records,
    total,
    page,
    pageSize,
    loading,
    setPage,
    setPageSize,
    refresh,
  } = usePagination<MemberCardTransaction>(getMemberCardDeductRecordsPaginated, filters);

  const selectedAccount = useMemo(
    () => accountOptions.find((account) => String(account.id) === selectedAccountId) ?? null,
    [accountOptions, selectedAccountId],
  );

  const selectedAccountStoreName = selectedAccount?.storeName?.trim();

  const selectableProjects = useMemo(
    () =>
      projects.filter(
        (project) =>
          project.status !== false &&
          (!selectedAccountStoreName || !project.storeName || project.storeName === selectedAccountStoreName),
      ),
    [projects, selectedAccountStoreName],
  );

  const selectableProducts = useMemo(
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

  const totalDeductAmount = useMemo(
    () => records.reduce((sum, record) => sum + getTotalDeduct(record), 0),
    [records],
  );

  const deductTotal = useMemo(
    () => deductItems.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0),
    [deductItems],
  );

  const loadAccounts = useCallback(
    async (searchKeyword = accountKeyword) => {
      setAccountsLoading(true);
      try {
        const response = await getMemberCardsPaginated({
          page: 1,
          pageSize: 100,
          keyword: searchKeyword.trim() || undefined,
          storeId: currentStoreId ?? undefined,
        });
        const items = response.items ?? response.data ?? [];
        setAccountOptions(items);
        if (!selectedAccountId && items.length > 0) {
          setSelectedAccountId(String(items[0].id));
        }
      } catch (error) {
        setAccountOptions([]);
        toast.error(error instanceof Error ? error.message : '会员卡数据加载失败');
      } finally {
        setAccountsLoading(false);
      }
    },
    [accountKeyword, currentStoreId, selectedAccountId],
  );

  const loadDeductOptions = useCallback(async () => {
    const [projectRows, productRows, beauticianRows] = await Promise.all([
      getProjects({ status: 'active', sellableOnly: true }).catch(() => {
        toast.error('项目数据加载失败，请稍后重试');
        return [] as Project[];
      }),
      getProducts({ status: 'active' }).catch(() => {
        toast.error('商品数据加载失败，请稍后重试');
        return [] as Product[];
      }),
      getBeauticians().catch(() => {
        toast.error('员工数据加载失败，请稍后重试');
        return [] as Beautician[];
      }),
    ]);
    setProjects(projectRows);
    setProducts(productRows);
    setBeauticians(beauticianRows);
  }, []);

  useEffect(() => {
    if (!isDeductOpen) return;
    void loadAccounts();
    void loadDeductOptions();
  }, [isDeductOpen, loadAccounts, loadDeductOptions]);

  const openDeductDialog = () => {
    setIsDeductOpen(true);
    setAccountKeyword('');
    setSelectedAccountId('');
    setDeductItems([createDeductDraftItem()]);
    setRemark('');
  };

  const closeDeductDialog = () => {
    if (submitting) return;
    setIsDeductOpen(false);
  };

  const updateDeductItem = (rowId: number, patch: Partial<MemberCardDeductDraftItem>) => {
    setDeductItems((prev) => prev.map((item) => (item.rowId === rowId ? { ...item, ...patch } : item)));
  };

  const addDeductItem = () => {
    setDeductItems((prev) => [...prev, createDeductDraftItem()]);
  };

  const removeDeductItem = (rowId: number) => {
    setDeductItems((prev) => (prev.length <= 1 ? prev : prev.filter((item) => item.rowId !== rowId)));
  };

  const handleDeductItemTypeChange = (rowId: number, itemType: DeductItemType) => {
    updateDeductItem(rowId, {
      itemType,
      itemId: '',
      name: '',
      unitPrice: 0,
    });
  };

  const handleDeductCatalogSelect = (rowId: number, itemType: DeductItemType, itemId: string) => {
    const source =
      itemType === 'project'
        ? selectableProjects.find((item) => String(item.id) === itemId)
        : selectableProducts.find((item) => String(item.id) === itemId);
    updateDeductItem(rowId, {
      itemId,
      name: source?.name ?? '',
      unitPrice:
        itemType === 'project'
          ? Number((source as Project | undefined)?.price ?? 0)
          : Number((source as Product | undefined)?.salePrice ?? (source as Product | undefined)?.retailPrice ?? 0),
    });
  };

  const handleDeductBeauticianSelect = (rowId: number, beauticianId: string) => {
    const beautician = selectableBeauticians.find((item) => String(item.id) === beauticianId);
    updateDeductItem(rowId, {
      beauticianId,
      beauticianName: beautician?.name ?? '',
    });
  };

  const submitDeduct = async () => {
    if (!selectedAccount) {
      toast.error('请先选择会员卡');
      return;
    }

    const invalidItem = deductItems.find(
      (item) => !item.itemId || !item.name || Number(item.quantity) <= 0 || Number(item.unitPrice) <= 0 || !item.beauticianId,
    );
    if (invalidItem) {
      toast.error('请完整填写划扣项目/商品、服务人员、次数/数量和单价');
      return;
    }

    const items = deductItems.map((item) => {
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);
      const subtotal = Number((quantity * unitPrice).toFixed(2));
      return {
        itemType: item.itemType,
        itemId: Number(item.itemId),
        name: item.name,
        quantity,
        unitPrice,
        subtotal,
        netAmount: subtotal,
        beauticianId: Number(item.beauticianId),
        beauticianName: item.beauticianName,
      };
    });

    const totalAmount = Number(items.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2));
    const availableTotal = Number(selectedAccount.availableBalance || 0) + Number(selectedAccount.giftBalance || 0);
    if (totalAmount <= 0) {
      toast.error('划扣金额必须大于 0');
      return;
    }
    if (totalAmount > availableTotal) {
      toast.error('划扣金额不能超过会员卡可用总余额');
      return;
    }

    setSubmitting(true);
    try {
      await deductMemberCard(selectedAccount.id, {
        amount: totalAmount,
        items,
        remark: remark.trim() || undefined,
      });
      toast.success('会员卡划扣成功，流水已更新');
      setIsDeductOpen(false);
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '会员卡划扣失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="text-sm text-gray-500">首页 / 订单管理 / 会员卡划扣记录</div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">会员卡划扣记录</h2>
          <p className="mt-1 text-sm text-gray-500">会员卡消费划扣流水，用于核对储值余额消费和服务人员提成来源。</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <CreditCard className="h-4 w-4" />
          当前页划扣合计 {formatCurrency(totalDeductAmount)}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            className="w-80 pl-9"
            placeholder="搜索流水号、客户、手机号、订单号、备注"
            value={keyword}
            onChange={(event) => {
              setKeyword(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button className="gap-2" onClick={openDeductDialog}>
            <Plus className="h-4 w-4" /> 划扣
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => exportToExcel(records, EXPORT_COLUMNS, '会员卡划扣记录')}>
            <Download className="h-4 w-4" /> 导出
          </Button>
          <div className="text-sm text-gray-500">共 {total} 条流水</div>
        </div>
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
                <TableHead>流水号</TableHead>
                <TableHead>客户</TableHead>
                <TableHead>门店</TableHead>
                <TableHead>划扣合计</TableHead>
                <TableHead>本金划扣</TableHead>
                <TableHead>赠送划扣</TableHead>
                <TableHead>余额变化</TableHead>
                <TableHead>关联订单</TableHead>
                <TableHead>备注</TableHead>
                <TableHead>划扣时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record) => (
                <TableRow key={record.id} className="hover:bg-blue-50/30">
                  <TableCell className="font-mono text-sm text-blue-600">{record.transactionNo}</TableCell>
                  <TableCell>
                    <div className="font-medium text-gray-800">{record.customerName || '-'}</div>
                    <div className="text-xs text-gray-500">{record.customerPhone || '-'}</div>
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">{record.storeName || '-'}</TableCell>
                  <TableCell className="font-semibold text-rose-600">{formatCurrency(getTotalDeduct(record))}</TableCell>
                  <TableCell>{formatCurrency(record.amount)}</TableCell>
                  <TableCell>{formatCurrency(record.giftAmount)}</TableCell>
                  <TableCell className="text-xs text-gray-600">
                    <div>
                      现金：{formatCurrency(record.cashBalanceBefore)} → {formatCurrency(record.cashBalanceAfter)}
                    </div>
                    <div>
                      赠送：{formatCurrency(record.giftBalanceBefore)} → {formatCurrency(record.giftBalanceAfter)}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm text-gray-600">{record.orderNo || '-'}</TableCell>
                  <TableCell className="max-w-56 truncate text-sm text-gray-600" title={record.remark || ''}>
                    {record.remark || '-'}
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">{record.createdAt}</TableCell>
                </TableRow>
              ))}
              {records.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="py-12 text-center text-gray-400">
                    暂无会员卡划扣流水。点击上方“划扣”后会自动进入这里。
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

      {isDeductOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90vh] w-full max-w-[980px] flex-col rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div className="flex items-center gap-2">
                <WalletCards className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold text-gray-900">会员卡划扣</h3>
              </div>
              <button className="text-xl text-gray-400 hover:text-gray-700" onClick={closeDeductDialog} disabled={submitting}>
                ×
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <section className="rounded-lg border border-gray-200 p-4">
                <div className="mb-3 text-sm font-semibold text-gray-900">选择会员卡</div>
                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input
                      className="pl-9"
                      placeholder="搜索会员编号、客户、手机号、流水号"
                      value={accountKeyword}
                      onChange={(event) => setAccountKeyword(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void loadAccounts(accountKeyword);
                        }
                      }}
                    />
                  </div>
                  <Button variant="outline" className="gap-2" onClick={() => loadAccounts(accountKeyword)} disabled={accountsLoading}>
                    {accountsLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                    搜索
                  </Button>
                </div>

                <select
                  className="mt-3 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring/40"
                  value={selectedAccountId}
                  onChange={(event) => {
                    setSelectedAccountId(event.target.value);
                    setDeductItems([createDeductDraftItem()]);
                  }}
                >
                  <option value="">请选择会员卡</option>
                  {accountOptions.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.userName} · {account.customerPhone || '无手机号'} · {account.accountNo} · 可用
                      {formatCurrency(Number(account.availableBalance || 0) + Number(account.giftBalance || 0))}
                    </option>
                  ))}
                </select>

                {selectedAccount && (
                  <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
                    <span className="font-medium text-gray-900">{selectedAccount.userName}</span>
                    <span className="mx-2">|</span>
                    门店 {selectedAccount.storeName || '-'}
                    <span className="mx-2">|</span>
                    本金 {formatCurrency(selectedAccount.availableBalance)}
                    <span className="mx-2">|</span>
                    赠送 {formatCurrency(selectedAccount.giftBalance)}
                  </div>
                )}
              </section>

              <section className="rounded-lg border border-gray-200 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">划扣明细</div>
                    <div className="mt-1 text-xs text-gray-500">选择商品/项目和服务人员，系统按明细合计执行会员卡划扣。</div>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addDeductItem}>
                    <Plus className="h-4 w-4" />
                    添加明细
                  </Button>
                </div>

                <div className="overflow-x-auto rounded-lg border border-border">
                  <div className="min-w-[860px]">
                    <div className="grid grid-cols-[110px_1.7fr_1.4fr_100px_120px_120px_56px] gap-2 bg-muted/40 px-3 py-2 text-sm font-medium text-muted-foreground">
                      <div>类型</div>
                      <div>项目/商品</div>
                      <div>服务人员</div>
                      <div>次数/数量</div>
                      <div>单价</div>
                      <div>小计</div>
                      <div />
                    </div>
                    <div className="divide-y divide-border">
                      {deductItems.map((item) => {
                        const catalogOptions = item.itemType === 'project' ? selectableProjects : selectableProducts;
                        const subtotal = Number(item.quantity || 0) * Number(item.unitPrice || 0);
                        return (
                          <div
                            key={item.rowId}
                            className="grid grid-cols-[110px_1.7fr_1.4fr_100px_120px_120px_56px] items-center gap-2 px-3 py-3"
                          >
                            <select
                              value={item.itemType}
                              onChange={(event) => handleDeductItemTypeChange(item.rowId, event.target.value as DeductItemType)}
                              className="h-10 rounded-lg border border-input bg-background px-2 text-sm"
                            >
                              <option value="project">项目</option>
                              <option value="product">商品</option>
                            </select>
                            <select
                              value={item.itemId}
                              onChange={(event) => handleDeductCatalogSelect(item.rowId, item.itemType, event.target.value)}
                              className="h-10 min-w-0 rounded-lg border border-input bg-background px-2 text-sm"
                            >
                              <option value="">{item.itemType === 'project' ? '请选择项目' : '请选择商品'}</option>
                              {catalogOptions.map((option) => (
                                <option key={option.id} value={option.id}>
                                  {option.name}
                                </option>
                              ))}
                            </select>
                            <select
                              value={item.beauticianId}
                              onChange={(event) => handleDeductBeauticianSelect(item.rowId, event.target.value)}
                              className="h-10 min-w-0 rounded-lg border border-input bg-background px-2 text-sm"
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
                              min="0.01"
                              step="1"
                              value={item.quantity}
                              onChange={(event) => updateDeductItem(item.rowId, { quantity: Math.max(0, Number(event.target.value || 0)) })}
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
                            <div className="rounded-lg bg-muted px-3 py-2 text-sm font-semibold text-foreground">
                              {formatCurrency(subtotal)}
                            </div>
                            <button
                              type="button"
                              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                              onClick={() => removeDeductItem(item.rowId)}
                              disabled={deductItems.length <= 1}
                              title="删除明细"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                  <div className="text-muted-foreground">
                    可用总余额{' '}
                    {selectedAccount
                      ? formatCurrency(Number(selectedAccount.availableBalance || 0) + Number(selectedAccount.giftBalance || 0))
                      : '-'}
                  </div>
                  <div className="text-base font-semibold text-gray-900">划扣合计 {formatCurrency(deductTotal)}</div>
                </div>
              </section>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-foreground">备注(选填)</span>
                <textarea
                  className="min-h-[88px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring/40"
                  placeholder="相关说明"
                  value={remark}
                  onChange={(event) => setRemark(event.target.value)}
                />
              </label>
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
              <Button variant="outline" onClick={closeDeductDialog} disabled={submitting}>
                取消
              </Button>
              <Button onClick={submitDeduct} disabled={submitting}>
                {submitting ? '提交中...' : '确认划扣'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
