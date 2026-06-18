import React, { useMemo, useState } from 'react';
import { CreditCard, Download, Loader2, Search } from 'lucide-react';
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/UI';
import { getMemberCardDeductRecordsPaginated } from '@/api/order';
import { usePagination } from '@/hooks/usePagination';
import { useStoreStore } from '@/stores/storeStore';
import { exportToExcel } from '@/utils/excel';
import type { MemberCardTransaction } from '@/types';
import type { ExportColumn } from '@/types/excel';

const EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'transactionNo', header: '流水号', width: 22 },
  { key: 'customerName', header: '客户', width: 14 },
  { key: 'customerPhone', header: '手机号', width: 16 },
  { key: 'storeName', header: '门店', width: 22 },
  { key: 'amount', header: '现金余额划扣', width: 14 },
  { key: 'giftAmount', header: '赠送余额划扣', width: 14 },
  { key: 'orderNo', header: '关联订单', width: 20 },
  { key: 'remark', header: '备注', width: 24 },
  { key: 'createdAt', header: '划扣时间', width: 20 },
];

function formatCurrency(value: number) {
  return `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function getTotalDeduct(record: MemberCardTransaction) {
  return Number(record.amount || 0) + Number(record.giftAmount || 0);
}

export function MemberCardDeductRecords() {
  const [keyword, setKeyword] = useState('');
  const currentStoreId = useStoreStore((state) => state.currentStoreId);

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
  } = usePagination<MemberCardTransaction>(getMemberCardDeductRecordsPaginated, filters);

  const totalDeductAmount = useMemo(
    () => records.reduce((sum, record) => sum + getTotalDeduct(record), 0),
    [records],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="text-sm text-gray-500">首页 / 订单管理 / 会员卡划扣记录</div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">会员卡划扣记录</h2>
          <p className="mt-1 text-sm text-gray-500">
            数据来源于会员卡管理中的“划扣”操作，用于核对储值会员卡消费流水。
          </p>
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
                <TableHead>现金余额</TableHead>
                <TableHead>赠送余额</TableHead>
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
                    <div>现金：{formatCurrency(record.cashBalanceBefore)} → {formatCurrency(record.cashBalanceAfter)}</div>
                    <div>赠送：{formatCurrency(record.giftBalanceBefore)} → {formatCurrency(record.giftBalanceAfter)}</div>
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
                    暂无会员卡划扣流水。完成会员卡“划扣”操作后会自动进入这里。
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
    </div>
  );
}
