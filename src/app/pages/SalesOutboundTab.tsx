import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2, PackageMinus } from 'lucide-react';
import { toast } from 'sonner';
import { getStockMovements } from '@/api/inventory';
import type { StockMovement } from '@/types';
import { Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/UI';

type SalesOutboundTabProps = {
  active: boolean;
};

function toDateKey(value: string) {
  return value ? value.slice(0, 10) : '';
}

function formatDateTime(value: string) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

function displayValue(value: unknown) {
  return value === null || value === undefined || value === '' ? '--' : String(value);
}

export function SalesOutboundTab({ active }: SalesOutboundTabProps) {
  const requestedRef = useRef(false);
  const mountedRef = useRef(true);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [keyword, setKeyword] = useState('');
  const [storeName, setStoreName] = useState('');

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!active || requestedRef.current) return;
    requestedRef.current = true;
    setLoading(true);
    setError('');
    getStockMovements({ movementType: 'sale_out', page: 1, pageSize: 100 })
      .then((result) => {
        if (mountedRef.current) setMovements(result.items ?? []);
      })
      .catch(() => {
        if (!mountedRef.current) return;
        setError('销售出库数据加载失败');
        toast.error('销售出库数据加载失败');
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });
  }, [active]);

  const storeOptions = useMemo(
    () => [...new Set(movements.map((movement) => movement.storeName).filter(Boolean) as string[])].sort(),
    [movements],
  );

  const filteredMovements = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLocaleLowerCase('zh-CN');
    return movements.filter((movement) => {
      const date = toDateKey(movement.occurredAt || movement.createdAt);
      if (startDate && date < startDate) return false;
      if (endDate && date > endDate) return false;
      if (storeName && movement.storeName !== storeName) return false;
      if (!normalizedKeyword) return true;
      return [movement.productName, movement.sku, movement.sourceNo]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase('zh-CN').includes(normalizedKeyword));
    });
  }, [endDate, keyword, movements, startDate, storeName]);

  const totalQuantity = useMemo(
    () => filteredMovements.reduce((total, movement) => total + Math.abs(Number(movement.quantity || 0)), 0),
    [filteredMovements],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" /> 正在加载销售出库数据...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 py-10 text-sm text-red-700">
        <AlertTriangle className="h-4 w-4" /> {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            type="date"
            className="w-40"
            aria-label="销售出库开始日期"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
          <span className="text-gray-400">至</span>
          <Input
            type="date"
            className="w-40"
            aria-label="销售出库结束日期"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
          <Input
            className="w-52"
            aria-label="销售出库商品关键词"
            placeholder="商品名称 / SKU / 单号"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <select
            className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm"
            aria-label="销售出库门店"
            value={storeName}
            onChange={(event) => setStoreName(event.target.value)}
          >
            <option value="">全部门店</option>
            {storeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-700">
          <PackageMinus className="h-4 w-4" />共 {filteredMovements.length} 条销售出库，出库数量 {totalQuantity}
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50/80">
            <TableHead>出库时间</TableHead>
            <TableHead>销售单号</TableHead>
            <TableHead>商品</TableHead>
            <TableHead>SKU</TableHead>
            <TableHead>出库数量</TableHead>
            <TableHead>出库前库存</TableHead>
            <TableHead>出库后库存</TableHead>
            <TableHead>门店</TableHead>
            <TableHead>操作人</TableHead>
            <TableHead>备注</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredMovements.map((movement) => (
            <TableRow key={movement.id} className="hover:bg-blue-50/30">
              <TableCell className="whitespace-nowrap">
                {formatDateTime(movement.occurredAt || movement.createdAt)}
              </TableCell>
              <TableCell className="font-mono text-sm text-gray-600">{displayValue(movement.sourceNo)}</TableCell>
              <TableCell className="font-medium text-gray-800">{displayValue(movement.productName)}</TableCell>
              <TableCell className="font-mono text-sm text-gray-600">{displayValue(movement.sku)}</TableCell>
              <TableCell className="font-semibold text-blue-600">
                {Math.abs(Number(movement.quantity || 0))} {movement.unit ?? ''}
              </TableCell>
              <TableCell>{displayValue(movement.beforeStock)}</TableCell>
              <TableCell>{displayValue(movement.afterStock)}</TableCell>
              <TableCell>{displayValue(movement.storeName)}</TableCell>
              <TableCell>{displayValue(movement.operatorName)}</TableCell>
              <TableCell className="max-w-56 text-sm text-gray-600">{displayValue(movement.remark)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {filteredMovements.length === 0 && (
        <div className="py-10 text-center text-sm text-gray-500">暂无销售出库记录</div>
      )}
    </div>
  );
}
