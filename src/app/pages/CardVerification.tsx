import { useMemo, useState } from 'react';
import { BarChart3, CalendarClock, CreditCard, Loader2, RotateCcw, Search, UserRound } from 'lucide-react';
import { getCardUsageProfit, getCardUsageRecordsPaginated } from '@/api/card';
import type { CardUsageProfitDetail } from '@/api/real/card';
import { hasPermission } from '@/config/permissions';
import { usePagination } from '@/hooks/usePagination';
import { useAuthStore } from '@/stores/authStore';
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/UI';
import { Badge } from '../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';

interface CardUsageRecord {
  id: number;
  customerId?: number;
  customerName?: string;
  userName?: string;
  customerPhone?: string;
  storeName?: string;
  customerCardId?: number;
  cardId?: number;
  cardName?: string;
  cardStatus?: string;
  cardTotalTimes?: number;
  totalTimes?: number;
  beforeRemainingTimes?: number;
  remainingTimes?: number;
  cardRemainingTimes?: number;
  projectName?: string;
  times?: number;
  usedTimes?: number;
  consumedTimes?: number;
  cardPrice?: number;
  unitValue?: number;
  consumedValue?: number;
  expiryDate?: string;
  openedAt?: string;
  verifiedAt?: string;
  usageTime?: string;
  beauticianId?: number;
  beauticianName?: string;
  operationPermission?: string;
  operatorId?: number;
  operatorName?: string;
  deviceId?: number;
  deviceName?: string;
  deviceCode?: string;
  deviceModel?: string;
  orderTime?: string;
}

const CARD_STATUS_LABELS: Record<string, string> = {
  active: '可用',
  expired: '已过期',
  used_up: '已用完',
  voided: '已作废',
  inactive: '停用',
  unknown: '未记录',
};

function padDatePart(value: number) {
  return String(value).padStart(2, '0');
}

function formatLocalDateTime(date: Date) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())} ${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}:${padDatePart(date.getSeconds())}`;
}

function formatDateTime(value?: string) {
  if (!value) return '-';
  const text = String(value);
  const shouldParseAsInstant = text.includes('T') || /(?:Z|[+-]\d{2}:?\d{2})$/.test(text);
  if (shouldParseAsInstant) {
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) return formatLocalDateTime(date);
  }
  return text.replace('T', ' ').slice(0, 19);
}

function formatDate(value?: string) {
  if (!value) return '-';
  return value.replace('T', ' ').slice(0, 10);
}

function formatMoney(value?: number, options?: { dashIfZero?: boolean }) {
  const amount = Number(value ?? 0);
  if ((options?.dashIfZero ?? true) && amount === 0) return '-';
  const prefix = amount < 0 ? '-¥' : '¥';
  return `${prefix}${Math.abs(amount).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(value?: number) {
  return `${(Number(value ?? 0) * 100).toFixed(1)}%`;
}

function getMaterialCostSourceLabel(source?: string) {
  if (source === 'actual_stock_movement') return '按实际耗材流水扣减';
  if (source === 'standard_bom') return '按 BOM 标准扣减';
  return '耗材成本缺失';
}

function getCustomerName(record: CardUsageRecord) {
  return record.customerName || record.userName || '未知客户';
}

function getConsumedTimes(record: CardUsageRecord) {
  return Number(record.times ?? record.consumedTimes ?? record.usedTimes ?? 0);
}

function getTotalTimes(record: CardUsageRecord) {
  return Number(record.cardTotalTimes ?? record.totalTimes ?? 0);
}

function getRemainingTimes(record: CardUsageRecord) {
  return Number(record.remainingTimes ?? record.cardRemainingTimes ?? 0);
}

function statusTone(status?: string) {
  if (status === 'active') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'expired' || status === 'used_up' || status === 'voided') return 'border-red-200 bg-red-50 text-red-700';
  return 'border-gray-200 bg-gray-50 text-gray-600';
}

export function CardVerification() {
  const [draftCardName, setDraftCardName] = useState('');
  const [draftUserName, setDraftUserName] = useState('');
  const [draftProjectName, setDraftProjectName] = useState('');
  const [filters, setFilters] = useState<{ cardName?: string; userName?: string; projectName?: string }>({});
  const [selected, setSelected] = useState<CardUsageRecord | null>(null);
  const [profitRecord, setProfitRecord] = useState<CardUsageRecord | null>(null);
  const [profitDetail, setProfitDetail] = useState<CardUsageProfitDetail | null>(null);
  const [profitLoading, setProfitLoading] = useState(false);
  const [profitError, setProfitError] = useState('');
  const currentUser = useAuthStore((state) => state.user);

  const queryFilters = useMemo(() => filters, [filters]);
  const { data: records, total, page, pageSize, loading, setPage, setPageSize } = usePagination<CardUsageRecord>(
    getCardUsageRecordsPaginated,
    queryFilters,
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canViewCardUsageProfit = useMemo(() => {
    const roles = currentUser?.roles ?? [];
    const permissions = currentUser?.permissions ?? [];
    const deniedPermissions = currentUser?.deniedPermissions ?? [];
    if (hasPermission(deniedPermissions, 'core:card-order-profit:view') || hasPermission(deniedPermissions, '*')) return false;
    return hasPermission(permissions, '*') || roles.includes('super_admin') || roles.includes('store_manager');
  }, [currentUser]);

  const handleSearch = () => {
    setFilters({
      cardName: draftCardName.trim() || undefined,
      userName: draftUserName.trim() || undefined,
      projectName: draftProjectName.trim() || undefined,
    });
    setPage(1);
  };

  const handleReset = () => {
    setDraftCardName('');
    setDraftUserName('');
    setDraftProjectName('');
    setFilters({});
    setPage(1);
  };

  const handleOpenProfit = async (record: CardUsageRecord) => {
    setProfitRecord(record);
    setProfitDetail(null);
    setProfitError('');
    setProfitLoading(true);
    try {
      const detail = await getCardUsageProfit(record.id);
      setProfitDetail(detail);
    } catch (error) {
      setProfitError(error instanceof Error ? error.message : '利润明细加载失败，请稍后重试');
    } finally {
      setProfitLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="text-sm text-gray-500">首页 / 订单管理 / 次卡核销管理</div>

      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_1fr_auto_auto]">
          <label className="text-sm text-gray-600">
            次卡名称
            <Input
              placeholder="请输入次卡名称"
              className="mt-1"
              value={draftCardName}
              onChange={(event) => setDraftCardName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleSearch();
              }}
            />
          </label>
          <label className="text-sm text-gray-600">
            用户名称/手机号
            <Input
              placeholder="请输入用户名称或手机号"
              className="mt-1"
              value={draftUserName}
              onChange={(event) => setDraftUserName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleSearch();
              }}
            />
          </label>
          <label className="text-sm text-gray-600">
            使用项目
            <Input
              placeholder="请输入项目名称"
              className="mt-1"
              value={draftProjectName}
              onChange={(event) => setDraftProjectName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleSearch();
              }}
            />
          </label>
          <Button className="mt-6 gap-2" onClick={handleSearch}>
            <Search className="h-4 w-4" />
            搜索
          </Button>
          <Button variant="outline" className="mt-6 gap-2" onClick={handleReset}>
            <RotateCcw className="h-4 w-4" />
            重置
          </Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50/80">
            <TableHead>流水号</TableHead>
            <TableHead>客户名称</TableHead>
            <TableHead>次卡名称</TableHead>
            <TableHead>所属门店</TableHead>
            <TableHead>使用项目</TableHead>
            <TableHead>本次核销</TableHead>
            <TableHead>剩余次数</TableHead>
            <TableHead>核销人/终端</TableHead>
            <TableHead>核销时间</TableHead>
            <TableHead>卡状态</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={11} className="h-40 text-center text-gray-500">
                <Loader2 className="mr-2 inline h-5 w-5 animate-spin text-blue-500" />
                正在加载次卡核销记录...
              </TableCell>
            </TableRow>
          ) : records.length === 0 ? (
            <TableRow>
              <TableCell colSpan={11} className="h-40 text-center text-gray-500">
                暂无次卡核销记录，请调整筛选条件
              </TableCell>
            </TableRow>
          ) : (
            records.map((record) => {
              const consumedTimes = getConsumedTimes(record);
              const remainingTimes = getRemainingTimes(record);
              const totalTimes = getTotalTimes(record);
              return (
                <TableRow key={record.id} className="hover:bg-blue-50/30">
                  <TableCell className="font-medium text-blue-600">{record.id}</TableCell>
                  <TableCell>
                    <div className="font-medium text-gray-800">{getCustomerName(record)}</div>
                    <div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                      <UserRound className="h-3.5 w-3.5" />
                      {record.customerPhone || '-'}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium text-gray-800">{record.cardName || '-'}</TableCell>
                  <TableCell>{record.storeName || '-'}</TableCell>
                  <TableCell className="max-w-[180px] whitespace-normal">{record.projectName || '-'}</TableCell>
                  <TableCell>
                    <div className="font-medium text-gray-800">{consumedTimes} 次</div>
                    <div className="mt-1 text-xs text-gray-500">权益估值 {formatMoney(record.consumedValue)}</div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-gray-800">
                      {remainingTimes} / {totalTimes || '-'} 次
                    </div>
                    <div className="mt-1 text-xs text-gray-500">核销前 {record.beforeRemainingTimes ?? '-'} 次</div>
                  </TableCell>
                  <TableCell>
                    <div>{record.operatorName || record.beauticianName || record.operationPermission || '无操作人记录'}</div>
                    <div className="mt-1 text-xs text-gray-500">{record.deviceName || record.deviceCode || '无终端记录'}</div>
                  </TableCell>
                  <TableCell>{formatDateTime(record.verifiedAt || record.usageTime)}</TableCell>
                  <TableCell>
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${statusTone(record.cardStatus)}`}>
                      {CARD_STATUS_LABELS[record.cardStatus || 'unknown'] ?? record.cardStatus}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setSelected(record)}>
                        详情
                      </Button>
                      {canViewCardUsageProfit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1 text-emerald-600 hover:text-emerald-700"
                          onClick={() => void handleOpenProfit(record)}
                        >
                          <BarChart3 className="h-3.5 w-3.5" />
                          利润
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

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
            {page} / {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            下一页
          </Button>
        </div>
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-[820px]">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>次卡核销详情</DialogTitle>
                <DialogDescription>
                  记录编号 #{selected.id}，核销时间 {formatDateTime(selected.verifiedAt || selected.usageTime)}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3 md:grid-cols-3">
                <SummaryTile icon={<CreditCard className="h-4 w-4" />} label="次卡" value={selected.cardName || '-'} />
                <SummaryTile icon={<UserRound className="h-4 w-4" />} label="客户" value={getCustomerName(selected)} />
                <SummaryTile icon={<CalendarClock className="h-4 w-4" />} label="本次核销" value={`${getConsumedTimes(selected)} 次`} />
              </div>

              <DetailSection title="客户与门店">
                <InfoGrid
                  items={[
                    ['客户ID', selected.customerId ?? '-'],
                    ['客户姓名', getCustomerName(selected)],
                    ['手机号', selected.customerPhone || '-'],
                    ['所属门店', selected.storeName || '-'],
                  ]}
                />
              </DetailSection>

              <DetailSection title="卡项与权益">
                <InfoGrid
                  items={[
                    ['客户卡ID', selected.customerCardId ?? '-'],
                    ['卡项ID', selected.cardId ?? '-'],
                    ['次卡名称', selected.cardName || '-'],
                    ['卡状态', CARD_STATUS_LABELS[selected.cardStatus || 'unknown'] ?? selected.cardStatus ?? '-'],
                    ['总次数', `${getTotalTimes(selected) || '-'} 次`],
                    ['核销前剩余', `${selected.beforeRemainingTimes ?? '-'} 次`],
                    ['本次核销', `${getConsumedTimes(selected)} 次`],
                    ['核销后剩余', `${getRemainingTimes(selected)} 次`],
                    ['开卡时间', formatDateTime(selected.openedAt || selected.orderTime)],
                    ['有效期至', formatDate(selected.expiryDate)],
                    ['卡项金额', formatMoney(selected.cardPrice)],
                    ['单次权益估值', formatMoney(selected.unitValue)],
                  ]}
                />
              </DetailSection>

              <DetailSection title="服务与操作">
                <InfoGrid
                  items={[
                    ['使用项目', selected.projectName || '-'],
                    ['核销人员', selected.operatorName || selected.beauticianName || selected.operationPermission || '-'],
                    ['美容师ID', selected.beauticianId ?? '-'],
                    ['核销终端', selected.deviceName || '-'],
                    ['终端编号', selected.deviceCode || '-'],
                    ['终端型号', selected.deviceModel || '-'],
                    ['设备ID', selected.deviceId ?? '-'],
                    ['核销时间', formatDateTime(selected.verifiedAt || selected.usageTime)],
                  ]}
                />
              </DetailSection>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(profitRecord)} onOpenChange={(open) => !open && setProfitRecord(null)}>
        <DialogContent className="sm:max-w-[980px]">
          <DialogHeader>
            <DialogTitle>次卡核销利润</DialogTitle>
            <DialogDescription>
              {profitRecord
                ? `核销记录 #${profitRecord.id}，项目 ${profitRecord.projectName || '-'}，核销时间 ${formatDateTime(profitRecord.verifiedAt || profitRecord.usageTime)}`
                : '查看单次核销的项目收入、耗材成本、提成成本和项目毛利。'}
            </DialogDescription>
          </DialogHeader>

          {profitLoading ? (
            <div className="flex h-40 items-center justify-center text-gray-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin text-blue-500" />
              正在加载利润明细...
            </div>
          ) : profitError ? (
            <div className="rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-600">{profitError}</div>
          ) : profitDetail ? (
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-5">
                <ProfitMetric label="确认收入" value={formatMoney(profitDetail.recognizedAmount, { dashIfZero: false })} />
                <ProfitMetric
                  label="耗材成本"
                  value={formatMoney(profitDetail.materialCost, { dashIfZero: false })}
                  helper={getMaterialCostSourceLabel(profitDetail.materialCostSource)}
                />
                <ProfitMetric label="提成成本" value={formatMoney(profitDetail.commissionCost, { dashIfZero: false })} />
                <ProfitMetric label="项目成本" value={formatMoney(profitDetail.projectCost, { dashIfZero: false })} />
                <ProfitMetric
                  label="项目毛利"
                  value={formatMoney(profitDetail.projectGrossProfit, { dashIfZero: false })}
                  helper={`毛利率 ${formatPercent(profitDetail.projectGrossMargin)}`}
                  emphasize={profitDetail.projectGrossProfit >= 0}
                />
              </div>

              {profitDetail.missingReasons.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  数据缺口：{profitDetail.missingReasons.join('、')}
                </div>
              )}

              <DetailSection title="核销基础信息">
                <InfoGrid
                  items={[
                    ['来源订单', profitDetail.sourceOrderNo || profitDetail.sourceOrderId || '-'],
                    ['客户', profitDetail.customerName || '-'],
                    ['次卡', profitDetail.cardName || '-'],
                    ['门店', profitDetail.storeName || '-'],
                    ['项目', profitDetail.projectName || '-'],
                    ['本次核销', `${profitDetail.times} 次`],
                    ['服务员工', profitDetail.operatorName || profitDetail.beauticianName || '-'],
                    ['核销时间', formatDateTime(profitDetail.verifiedAt)],
                  ]}
                />
              </DetailSection>

              <DetailSection title="耗材成本明细">
                <div className="overflow-hidden rounded-lg border border-gray-100">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left text-gray-500">
                      <tr>
                        <th className="px-4 py-2">商品</th>
                        <th className="px-4 py-2">用量</th>
                        <th className="px-4 py-2">成本单价</th>
                        <th className="px-4 py-2">成本小计</th>
                        <th className="px-4 py-2">发生时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profitDetail.materialMovements.length ? (
                        profitDetail.materialMovements.map((movement) => (
                          <tr key={movement.id} className="border-t border-gray-100">
                            <td className="px-4 py-3">{movement.productName}</td>
                            <td className="px-4 py-3">
                              {movement.quantity} {movement.unit || ''}
                            </td>
                            <td className="px-4 py-3">{formatMoney(movement.costPrice, { dashIfZero: false })}</td>
                            <td className="px-4 py-3 font-medium">{formatMoney(movement.costAmount, { dashIfZero: false })}</td>
                            <td className="px-4 py-3 text-gray-500">{formatDateTime(movement.occurredAt)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="px-4 py-8 text-center text-gray-400" colSpan={5}>
                            暂无实际耗材流水，当前按 BOM 标准成本或标记缺口
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="text-xs text-gray-500">
                  标准 BOM 成本 {formatMoney(profitDetail.standardMaterialCost, { dashIfZero: false })}；实际耗材成本{' '}
                  {formatMoney(profitDetail.actualMaterialCost, { dashIfZero: false })}。
                </div>
              </DetailSection>

              <DetailSection title="提成成本明细">
                <div className="overflow-hidden rounded-lg border border-gray-100">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left text-gray-500">
                      <tr>
                        <th className="px-4 py-2">员工</th>
                        <th className="px-4 py-2">规则</th>
                        <th className="px-4 py-2">计算基数</th>
                        <th className="px-4 py-2">比例</th>
                        <th className="px-4 py-2">提成</th>
                        <th className="px-4 py-2">状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profitDetail.commissionRecords.length ? (
                        profitDetail.commissionRecords.map((commission) => (
                          <tr key={commission.id} className="border-t border-gray-100">
                            <td className="px-4 py-3">{commission.staffUserName}</td>
                            <td className="px-4 py-3">{commission.ruleName || '-'}</td>
                            <td className="px-4 py-3">{formatMoney(commission.sourceAmount, { dashIfZero: false })}</td>
                            <td className="px-4 py-3">{formatPercent(commission.rate)}</td>
                            <td className="px-4 py-3 font-medium">{formatMoney(commission.amount, { dashIfZero: false })}</td>
                            <td className="px-4 py-3 text-gray-500">{commission.status}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="px-4 py-8 text-center text-gray-400" colSpan={6}>
                            暂无项目提成记录
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </DetailSection>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
      <div className="flex items-center gap-2 text-xs text-gray-500">
        {icon}
        {label}
      </div>
      <div className="mt-2 font-medium text-gray-900">{value}</div>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Badge variant="secondary">{title}</Badge>
      </div>
      {children}
    </section>
  );
}

function ProfitMetric({
  label,
  value,
  helper,
  emphasize,
}: {
  label: string;
  value: string;
  helper?: string;
  emphasize?: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-2 text-lg font-semibold ${emphasize === undefined ? 'text-gray-900' : emphasize ? 'text-emerald-700' : 'text-red-600'}`}>
        {value}
      </div>
      {helper && <div className="mt-1 text-xs text-gray-500">{helper}</div>}
    </div>
  );
}

function InfoGrid({ items }: { items: Array<[string, React.ReactNode]> }) {
  return (
    <div className="grid gap-x-4 gap-y-3 md:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[112px_1fr] gap-3 text-sm">
          <div className="text-gray-500">{label}</div>
          <div className="min-w-0 break-words text-gray-800">{value}</div>
        </div>
      ))}
    </div>
  );
}
