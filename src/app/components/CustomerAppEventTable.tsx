import { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Search } from 'lucide-react';
import { getAmiGlowEvents } from '@/api/customerApp';
import { usePagination } from '@/hooks/usePagination';
import { useAuthStore } from '@/stores/authStore';
import { useStoreStore } from '@/stores/storeStore';
import type { AmiGlowEvent } from '@/types/customer-app';
import type { ExportColumn } from '@/types/excel';
import { exportToExcel } from '@/utils/excel';
import { formatScopedValue } from '@/utils/fieldMask';
import {
  CUSTOMER_APP_CHANNEL_OPTIONS,
  CUSTOMER_APP_EVENT_TYPE_OPTIONS,
  CUSTOMER_APP_TARGET_TYPE_OPTIONS,
  formatCustomerAppChannel,
  formatCustomerAppEventTime,
  formatCustomerAppEventType,
  formatCustomerAppTarget,
  formatCustomerAppTargetType,
  getCustomerAppEventMetadataSummary,
} from '@/utils/customerAppEventDictionary';
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './UI';

type CustomerAppEventTableMode = 'customerDetail' | 'customerInsight' | 'marketingAsset';

type EventFilters = {
  storeId?: number | null;
  customerId?: number;
  eventType?: string;
  channel?: string;
  targetType?: string;
  targetId?: string;
  source?: string;
  keyword?: string;
  startDate?: string;
  endDate?: string;
};

type CustomerAppEventTableProps = {
  mode: CustomerAppEventTableMode;
  defaultFilters?: EventFilters;
  initialKeyword?: string;
  exportFileName?: string;
};

const customerColumns: ExportColumn[] = [
  { key: 'customerName', header: '客户', width: 16 },
  { key: 'customerPhone', header: '手机号', width: 16 },
  { key: 'storeName', header: '门店', width: 18 },
  { key: 'eventType', header: '行为类型', width: 16 },
  { key: 'target', header: '模块/目标', width: 18 },
  { key: 'channel', header: '渠道', width: 12 },
  { key: 'sessionId', header: '会话 ID', width: 20 },
  { key: 'openid', header: 'OpenID', width: 20 },
  { key: 'occurredAt', header: '行为时间', width: 20 },
  { key: 'detail', header: '扩展信息', width: 30 },
];

const marketingColumns: ExportColumn[] = [
  { key: 'eventType', header: '事件', width: 16 },
  { key: 'targetType', header: '营销对象类型', width: 16 },
  { key: 'targetId', header: '营销对象 ID', width: 16 },
  { key: 'customerName', header: '客户', width: 16 },
  { key: 'customerPhone', header: '手机号', width: 16 },
  { key: 'channel', header: '渠道', width: 12 },
  { key: 'storeName', header: '门店', width: 18 },
  { key: 'sessionId', header: '会话 ID', width: 20 },
  { key: 'occurredAt', header: '发生时间', width: 20 },
];

export function CustomerAppEventTable({
  mode,
  defaultFilters,
  initialKeyword = '',
  exportFileName,
}: CustomerAppEventTableProps) {
  const fieldScopes = useAuthStore((state) => state.user?.fieldScopes);
  const currentStoreId = useStoreStore((state) => state.currentStoreId);
  const isCustomerMode = mode === 'customerDetail' || mode === 'customerInsight';
  const defaultStoreId = defaultFilters?.storeId;
  const defaultCustomerId = defaultFilters?.customerId;
  const defaultTargetId = defaultFilters?.targetId ?? '';
  const defaultSource = defaultFilters?.source;
  const [keywordInput, setKeywordInput] = useState(initialKeyword);
  const [keyword, setKeyword] = useState(initialKeyword);
  const [eventType, setEventType] = useState(defaultFilters?.eventType ?? '');
  const [channel, setChannel] = useState(defaultFilters?.channel ?? '');
  const [targetType, setTargetType] = useState(defaultFilters?.targetType ?? '');
  const [targetId, setTargetId] = useState(defaultTargetId);
  const [startDate, setStartDate] = useState(defaultFilters?.startDate ?? '');
  const [endDate, setEndDate] = useState(defaultFilters?.endDate ?? '');

  const filters = useMemo(
    () => ({
      storeId: defaultStoreId ?? currentStoreId,
      customerId: defaultCustomerId,
      targetId: targetId.trim() || undefined,
      source: defaultSource,
      eventType: eventType || undefined,
      channel: channel || undefined,
      targetType: targetType || undefined,
      keyword: keyword.trim() || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    }),
    [channel, currentStoreId, defaultCustomerId, defaultSource, defaultStoreId, endDate, eventType, keyword, startDate, targetId, targetType],
  );

  const {
    data: events,
    total,
    page,
    pageSize,
    loading,
    error,
    setPage,
    setPageSize,
    refresh,
  } = usePagination(getAmiGlowEvents, filters);

  useEffect(() => {
    setKeywordInput(initialKeyword);
    setKeyword(initialKeyword);
    setPage(1);
  }, [initialKeyword, setPage]);

  const handleSearch = () => {
    setKeyword(keywordInput);
    setPage(1);
  };

  const eventToExportRow = (event: AmiGlowEvent) => ({
    customerName: event.customerName ?? event.nickname ?? '未绑定客户',
    customerPhone: event.customerPhone ?? '',
    storeName: event.storeName ?? '',
    eventType: formatCustomerAppEventType(event.eventType),
    target: formatCustomerAppTarget(event),
    targetType: formatCustomerAppTargetType(event.targetType),
    targetId: event.targetId ?? '',
    channel: formatCustomerAppChannel(event.channel),
    sessionId: event.sessionId ?? '',
    openid: event.openid ?? '',
    occurredAt: formatCustomerAppEventTime(event.occurredAt),
    detail: getCustomerAppEventMetadataSummary(event.metadataJson),
  });

  const handleExport = () => {
    exportToExcel(
      events.map(eventToExportRow),
      isCustomerMode ? customerColumns : marketingColumns,
      exportFileName ?? (isCustomerMode ? '小程序行为明细' : '营销行为事件'),
    );
  };

  const totalPages = Math.ceil(total / pageSize) || 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            className="w-72 pl-9"
            placeholder="搜索客户、手机号、openid、会话或目标 ID"
            value={keywordInput}
            onChange={(event) => setKeywordInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleSearch();
            }}
          />
        </div>
        <select
          className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm"
          value={eventType}
          onChange={(event) => {
            setEventType(event.target.value);
            setPage(1);
          }}
        >
          {CUSTOMER_APP_EVENT_TYPE_OPTIONS.map((item) => (
            <option key={item.value || 'all'} value={item.value}>{item.label}</option>
          ))}
        </select>
        <select
          className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm"
          value={channel}
          onChange={(event) => {
            setChannel(event.target.value);
            setPage(1);
          }}
        >
          {CUSTOMER_APP_CHANNEL_OPTIONS.map((item) => (
            <option key={item.value || 'all'} value={item.value}>{item.label}</option>
          ))}
        </select>
        {mode === 'marketingAsset' && (
          <>
            <select
              className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm"
              value={targetType}
              onChange={(event) => {
                setTargetType(event.target.value);
                setPage(1);
              }}
            >
              {CUSTOMER_APP_TARGET_TYPE_OPTIONS.map((item) => (
                <option key={item.value || 'all'} value={item.value}>{item.label}</option>
              ))}
            </select>
            <Input
              className="w-40"
              placeholder="营销对象 ID"
              value={targetId}
              onChange={(event) => {
                setTargetId(event.target.value);
                setPage(1);
              }}
            />
          </>
        )}
        <Input type="date" className="w-40" value={startDate} onChange={(event) => { setStartDate(event.target.value); setPage(1); }} />
        <Input type="date" className="w-40" value={endDate} onChange={(event) => { setEndDate(event.target.value); setPage(1); }} />
        <Button className="gap-2" onClick={handleSearch}>
          <Search className="h-4 w-4" />
          搜索
        </Button>
        <Button variant="outline" className="gap-2" onClick={refresh}>
          刷新
        </Button>
        <Button variant="outline" className="gap-2" onClick={handleExport}>
          <Download className="h-4 w-4" />
          导出
        </Button>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        {error ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-gray-500">
            <span>行为事件加载失败：{error}</span>
            <Button variant="outline" size="sm" onClick={refresh}>
              重新加载
            </Button>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-12 text-gray-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin text-blue-500" />
            正在加载{isCustomerMode ? '小程序行为明细' : '营销行为事件'}...
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/80">
                {isCustomerMode ? (
                  <>
                    <TableHead>客户</TableHead>
                    <TableHead>手机号</TableHead>
                    <TableHead>门店</TableHead>
                    <TableHead>行为类型</TableHead>
                    <TableHead>模块/目标</TableHead>
                    <TableHead>渠道</TableHead>
                    <TableHead>会话</TableHead>
                    <TableHead>行为时间</TableHead>
                    <TableHead>扩展信息</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead>事件</TableHead>
                    <TableHead>营销对象</TableHead>
                    <TableHead>客户</TableHead>
                    <TableHead>渠道</TableHead>
                    <TableHead>门店</TableHead>
                    <TableHead>发生时间</TableHead>
                    <TableHead>会话</TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                isCustomerMode ? (
                  <TableRow key={event.id} className="hover:bg-blue-50/30">
                    <TableCell className="font-medium text-gray-700">
                      {event.customerName ?? event.nickname ?? '未绑定客户'}
                    </TableCell>
                    <TableCell>{formatScopedValue(event.customerPhone ?? '', fieldScopes?.customerPhone ?? 'visible', 'phone') || '-'}</TableCell>
                    <TableCell>{event.storeName || '-'}</TableCell>
                    <TableCell>
                      <span className="rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                        {formatCustomerAppEventType(event.eventType)}
                      </span>
                    </TableCell>
                    <TableCell>{formatCustomerAppTarget(event)}</TableCell>
                    <TableCell>{formatCustomerAppChannel(event.channel)}</TableCell>
                    <TableCell className="max-w-[140px] truncate" title={event.sessionId ?? event.openid ?? ''}>
                      {event.sessionId ?? event.openid ?? '-'}
                    </TableCell>
                    <TableCell>{formatCustomerAppEventTime(event.occurredAt)}</TableCell>
                    <TableCell className="max-w-[220px] truncate" title={getCustomerAppEventMetadataSummary(event.metadataJson)}>
                      {getCustomerAppEventMetadataSummary(event.metadataJson)}
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow key={event.id} className="hover:bg-blue-50/30">
                    <TableCell>
                      <div className="font-medium text-gray-900">{formatCustomerAppEventType(event.eventType)}</div>
                      <div className="mt-1 font-mono text-xs text-gray-500">{event.eventType}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-gray-900">{formatCustomerAppTargetType(event.targetType)}</div>
                      <div className="mt-1 font-mono text-xs text-gray-500">{event.targetId || '-'}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-gray-900">{event.customerName || event.nickname || '游客'}</div>
                      <div className="mt-1 text-xs text-gray-500">{event.customerPhone || event.openid || '-'}</div>
                    </TableCell>
                    <TableCell>{formatCustomerAppChannel(event.channel)}</TableCell>
                    <TableCell>{event.storeName || `门店 #${event.storeId}`}</TableCell>
                    <TableCell>{formatCustomerAppEventTime(event.occurredAt)}</TableCell>
                    <TableCell className="font-mono text-xs text-gray-500">{event.sessionId?.slice(0, 18) || '-'}</TableCell>
                  </TableRow>
                )
              ))}
              {events.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isCustomerMode ? 9 : 7} className="py-12 text-center text-gray-400">
                    暂无{isCustomerMode ? '小程序行为明细' : '营销行为事件'}。
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
        <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
          <div className="text-sm text-gray-600">共 {total} 条</div>
          <div className="flex items-center gap-2">
            <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="h-8 rounded border border-gray-300 px-2 text-sm">
              <option value={10}>10条/页</option>
              <option value={20}>20条/页</option>
              <option value={50}>50条/页</option>
            </select>
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button>
            <span className="text-sm text-gray-600">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>下一页</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
