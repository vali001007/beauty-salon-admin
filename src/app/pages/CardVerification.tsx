import React, { useState, useMemo } from 'react';
import { Search, RotateCcw, Loader2 } from 'lucide-react';
import { Input, Button, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/UI';
import { getCardUsageRecordsPaginated } from '@/api/card';
import { usePagination } from '@/hooks/usePagination';

interface CardUsageRecord {
  id: number;
  cardName: string;
  userName: string;
  storeName: string;
  projectName: string;
  usedTimes: number;
  consumedTimes: number;
  usageTime: string;
  operationPermission: string;
  orderTime: string;
}

export function CardVerification() {
  const [searchCardName, setSearchCardName] = useState('');
  const [searchUserName, setSearchUserName] = useState('');

  const filters = useMemo(() => ({
    cardName: searchCardName || undefined,
    userName: searchUserName || undefined,
  }), [searchCardName, searchUserName]);
  const { data: records, total, page, pageSize, loading, setPage, setPageSize } = usePagination<CardUsageRecord>(getCardUsageRecordsPaginated, filters);

  const handleReset = () => {
    setSearchCardName('');
    setSearchUserName('');
  };

  const handleSearch = () => {
    setSearchCardName(searchCardName.trim());
    setSearchUserName(searchUserName.trim());
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <div className="text-sm text-gray-500">
        首页 / 订单管理 / 次卡核销管理
      </div>

      {/* Search Section */}
      <div className="flex items-center gap-4">
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
          <label className="text-sm text-gray-600 whitespace-nowrap">用户名称</label>
          <Input 
            placeholder="请输入用户名称" 
            className="w-48" 
            value={searchUserName}
            onChange={(e) => setSearchUserName(e.target.value)}
          />
        </div>
        <Button className="gap-2" onClick={handleSearch}>
          <Search className="w-4 h-4" /> 搜索
        </Button>
        <Button variant="outline" className="gap-2" onClick={handleReset}>
          <RotateCcw className="w-4 h-4" /> 重置
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
            <TableHead>次卡名称</TableHead>
            <TableHead>用户名称</TableHead>
            <TableHead>所属门店</TableHead>
            <TableHead>使用项目</TableHead>
            <TableHead>使用次数</TableHead>
            <TableHead>消耗次数</TableHead>
            <TableHead>使用时间</TableHead>
            <TableHead>操作权限</TableHead>
            <TableHead>下单时间</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record) => (
            <TableRow key={record.id} className="hover:bg-blue-50/30">
              <TableCell className="font-medium text-gray-700">{record.cardName}</TableCell>
              <TableCell>{record.userName}</TableCell>
              <TableCell>{record.storeName}</TableCell>
              <TableCell>{record.projectName}</TableCell>
              <TableCell>{record.usedTimes}</TableCell>
              <TableCell>{record.consumedTimes}</TableCell>
              <TableCell>{record.usageTime}</TableCell>
              <TableCell>{record.operationPermission}</TableCell>
              <TableCell>{record.orderTime}</TableCell>
              <TableCell className="text-right">
                <button className="text-blue-500 hover:text-blue-600 text-sm">
                  详情
                </button>
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
  );
}
