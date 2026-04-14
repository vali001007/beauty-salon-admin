import React, { useState, useMemo } from 'react';
import { AlertTriangle, TrendingDown, DollarSign, Package, Loader2, Download } from 'lucide-react';
import { Button, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/UI';
import { getExpiringProductsPaginated } from '@/api/inventory';
import { usePagination } from '@/hooks/usePagination';
import { exportToExcel } from '@/utils/excel';
import type { ExportColumn } from '@/types/excel';

const EXPIRY_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'urgency', header: '紧急程度', width: 10 },
  { key: 'productName', header: '产品名称', width: 20 },
  { key: 'sku', header: 'SKU', width: 18 },
  { key: 'batchNo', header: '批次号', width: 20 },
  { key: 'remainingDays', header: '剩余天数', width: 10 },
  { key: 'stock', header: '库存量', width: 10 },
  { key: 'costAmount', header: '成本金额', width: 12 },
  { key: 'storeName', header: '门店', width: 20 },
  { key: 'suggestion', header: '建议处置', width: 10 },
];

interface ExpiringProduct {
  id: number;
  urgency: '临期' | '紧急' | '已过期';
  productName: string;
  sku: string;
  batchNo: string;
  remainingDays: number;
  stock: number;
  costAmount: number;
  storeName: string;
  suggestion: '促销' | '调拨' | '报废';
}

const WASTAGE_DATA = [
  { month: '2025-10', amount: 12500 },
  { month: '2025-11', amount: 15800 },
  { month: '2025-12', amount: 18200 },
  { month: '2026-01', amount: 14600 },
  { month: '2026-02', amount: 13400 },
  { month: '2026-03', amount: 16800 },
];

const CATEGORY_WASTAGE = [
  { category: '护肤品', percentage: 42, amount: 16800 },
  { category: '美发产品', percentage: 28, amount: 11200 },
  { category: '美甲产品', percentage: 18, amount: 7200 },
  { category: '仪器耗材', percentage: 12, amount: 4800 },
];

export function ExpiryManagement() {
  const [selectedPeriod, setSelectedPeriod] = useState('本月');

  const filters = useMemo(() => ({}), []);
  const { data: expiringProducts, total, page, pageSize, loading, setPage, setPageSize } = usePagination<ExpiringProduct>(getExpiringProductsPaginated, filters);

  const getUrgencyColor = (urgency: ExpiringProduct['urgency']) => {
    switch (urgency) {
      case '临期':
        return 'bg-orange-100 text-orange-700 border-l-4 border-orange-500';
      case '紧急':
        return 'bg-red-100 text-red-700 border-l-4 border-red-500';
      case '已过期':
        return 'bg-red-200 text-red-900 border-l-4 border-red-700';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  const getSuggestionColor = (suggestion: ExpiringProduct['suggestion']) => {
    switch (suggestion) {
      case '促销':
        return 'bg-blue-100 text-blue-700';
      case '调拨':
        return 'bg-purple-100 text-purple-700';
      case '报废':
        return 'bg-gray-100 text-gray-700';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  const maxWastage = Math.max(...WASTAGE_DATA.map(d => d.amount));

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <div className="text-sm text-gray-500">
        首页 / 库存管理 / 过期管理
      </div>

      <h2 className="text-xl font-semibold text-gray-800">过期管理</h2>

      {/* Statistics Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-orange-50 to-orange-100 border-l-4 border-orange-500 rounded-lg p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-700 font-medium">临期预警数</div>
            <AlertTriangle className="w-5 h-5 text-orange-500" />
          </div>
          <div className="text-3xl font-semibold text-orange-600 mb-1">23</div>
          <div className="text-xs text-gray-600">剩余30-60天</div>
        </div>

        <div className="bg-gradient-to-br from-red-50 to-red-100 border-l-4 border-red-500 rounded-lg p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-700 font-medium">紧急处理数</div>
            <Package className="w-5 h-5 text-red-500" />
          </div>
          <div className="text-3xl font-semibold text-red-600 mb-1">15</div>
          <div className="text-xs text-gray-600">剩余少于30天</div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 border-l-4 border-purple-500 rounded-lg p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-700 font-medium">本月损耗金额</div>
            <DollarSign className="w-5 h-5 text-purple-500" />
          </div>
          <div className="text-3xl font-semibold text-purple-600 mb-1">¥16,800</div>
          <div className="flex items-center text-xs text-red-600 mt-1">
            <TrendingDown className="w-3 h-3 mr-1" />
            较上月增长 25.4%
          </div>
        </div>
      </div>

      {/* Expiring Products Table */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800">临期产品列表</h3>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={() => exportToExcel(expiringProducts, EXPIRY_EXPORT_COLUMNS, '过期损耗报表')}>
              <Download className="w-4 h-4" /> 导出报表
            </Button>
            <select
              className="h-9 px-3 text-sm border border-gray-300 rounded-md"
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
            >
              <option>本月</option>
              <option>近3个月</option>
              <option>近6个月</option>
            </select>
          </div>
        </div>

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
              <TableHead>紧急程度</TableHead>
              <TableHead>产品名称</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>批次号</TableHead>
              <TableHead>剩余天数</TableHead>
              <TableHead>库存量</TableHead>
              <TableHead>成本金额</TableHead>
              <TableHead>门店</TableHead>
              <TableHead>建议处置</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expiringProducts.map((product) => (
              <TableRow key={product.id} className={`hover:bg-gray-50 ${getUrgencyColor(product.urgency)}`}>
                <TableCell>
                  <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                    product.urgency === '临期'
                      ? 'bg-orange-100 text-orange-700'
                      : product.urgency === '紧急'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-red-200 text-red-900'
                  }`}>
                    {product.urgency}
                    {product.urgency === '临期' && ' (30-60天)'}
                    {product.urgency === '紧急' && ' (<30天)'}
                  </span>
                </TableCell>
                <TableCell className="font-medium text-gray-800">{product.productName}</TableCell>
                <TableCell className="font-mono text-sm text-gray-600">{product.sku}</TableCell>
                <TableCell className="font-mono text-sm text-gray-600">{product.batchNo}</TableCell>
                <TableCell>
                  <span className={`font-semibold ${
                    product.remainingDays < 0
                      ? 'text-red-700'
                      : product.remainingDays < 30
                      ? 'text-red-600'
                      : 'text-orange-600'
                  }`}>
                    {product.remainingDays < 0 ? `已过期${Math.abs(product.remainingDays)}天` : `${product.remainingDays}天`}
                  </span>
                </TableCell>
                <TableCell>{product.stock}</TableCell>
                <TableCell className="font-medium text-gray-700">
                  ¥{product.costAmount.toLocaleString()}
                </TableCell>
                <TableCell className="text-sm text-gray-600">{product.storeName}</TableCell>
                <TableCell>
                  <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${getSuggestionColor(product.suggestion)}`}>
                    {product.suggestion}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline">
                    处理
                  </Button>
                </TableCell>
              </TableRow>
            ))}
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
      </div>

      {/* Wastage Analysis */}
      <div className="grid grid-cols-2 gap-6">
        {/* Wastage Trend Chart */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="font-semibold text-gray-800 mb-4">近6月损耗金额趋势</h3>
          <div className="space-y-3">
            {WASTAGE_DATA.map((data, index) => (
              <div key={index} className="flex items-center gap-3">
                <div className="w-20 text-sm text-gray-600">{data.month}</div>
                <div className="flex-1 h-8 bg-gray-100 rounded-lg overflow-hidden relative">
                  <div
                    className="h-full bg-gradient-to-r from-red-400 to-red-500 rounded-lg transition-all"
                    style={{ width: `${(data.amount / maxWastage) * 100}%` }}
                  />
                  <div className="absolute inset-0 flex items-center px-3 text-xs font-medium text-white">
                    ¥{data.amount.toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Category Wastage Pie Chart */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="font-semibold text-gray-800 mb-4">按品类损耗占比</h3>
          <div className="space-y-4">
            {CATEGORY_WASTAGE.map((item, index) => (
              <div key={index}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-700 font-medium">{item.category}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">¥{item.amount.toLocaleString()}</span>
                    <span className="text-sm font-semibold text-blue-600">{item.percentage}%</span>
                  </div>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      index === 0
                        ? 'bg-blue-500'
                        : index === 1
                        ? 'bg-purple-500'
                        : index === 2
                        ? 'bg-pink-500'
                        : 'bg-orange-500'
                    }`}
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <h4 className="text-sm font-semibold text-gray-800 mb-3">损耗率超标类别</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2 bg-red-50 border border-red-200 rounded">
                <span className="text-sm text-gray-700">护肤品</span>
                <span className="text-sm font-semibold text-red-600">连续3月 &gt;5%</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-red-50 border border-red-200 rounded">
                <span className="text-sm text-gray-700">美发产品</span>
                <span className="text-sm font-semibold text-red-600">连续3月 &gt;5%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
