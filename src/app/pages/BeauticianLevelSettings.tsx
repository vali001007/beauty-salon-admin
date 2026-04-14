import React, { useState } from 'react';
import { Search, RotateCcw, Plus, Edit2, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Input, Button, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/UI';

interface BeauticianLevel {
  id: number;
  name: string;
  status: '可用' | '停用';
  createTime: string;
}

const MOCK_LEVELS: BeauticianLevel[] = [
  { id: 1, name: '资深美容师', status: '可用', createTime: '2026/01/07 10:23:03' },
  { id: 2, name: '见习员工', status: '可用', createTime: '2025/11/25 15:42:43' },
  { id: 3, name: '店长顾问', status: '可用', createTime: '2025/10/20 14:39:08' },
  { id: 4, name: '高级美容师', status: '可用', createTime: '2025/10/16 20:54:32' },
  { id: 5, name: '中级美容师', status: '可用', createTime: '2025/10/16 20:54:26' },
  { id: 6, name: '初级美容师', status: '可用', createTime: '2025/10/16 20:31:58' },
];

export function BeauticianLevelSettings() {
  const [searchName, setSearchName] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [jumpToPage, setJumpToPage] = useState('');

  const totalRecords = MOCK_LEVELS.length;
  const totalPages = Math.ceil(totalRecords / pageSize);

  const toggleSelectAll = () => {
    if (selectedIds.length === MOCK_LEVELS.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(MOCK_LEVELS.map(level => level.id));
    }
  };

  const toggleSelect = (id: number) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(selectedId => selectedId !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleReset = () => {
    setSearchName('');
    setStatusFilter('all');
  };

  const handleJumpToPage = () => {
    const pageNum = parseInt(jumpToPage);
    if (pageNum >= 1 && pageNum <= totalPages) {
      setCurrentPage(pageNum);
      setJumpToPage('');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-gray-800 border-b border-gray-100 pb-4">美容师等级设置</h1>

      {/* Search Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 whitespace-nowrap">等级名称</label>
          <Input 
            placeholder="请输入等级名称" 
            className="w-64"
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 whitespace-nowrap">状态</label>
          <select 
            className="h-9 px-3 rounded-md border border-gray-300 bg-white text-sm w-32"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">全部</option>
            <option value="可用">可用</option>
            <option value="停用">停用</option>
          </select>
        </div>
        <Button className="gap-2 bg-[#1890ff]">
          <Search className="w-4 h-4" /> 搜索
        </Button>
        <Button variant="outline" className="gap-2" onClick={handleReset}>
          <RotateCcw className="w-4 h-4" /> 重置
        </Button>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button variant="default" className="gap-2 bg-[#1890ff]">
          <Plus className="w-4 h-4" /> 新增
        </Button>
        <Button 
          variant="default" 
          className="gap-2 bg-green-500 hover:bg-green-600"
          disabled={selectedIds.length === 0}
        >
          <Edit2 className="w-4 h-4" /> 修改
        </Button>
        <Button 
          variant="danger" 
          className="gap-2 bg-red-400 hover:bg-red-500"
          disabled={selectedIds.length === 0}
        >
          <Trash2 className="w-4 h-4" /> 删除
        </Button>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50/80">
            <TableHead className="w-12 text-center">
              <input 
                type="checkbox" 
                className="rounded border-gray-300"
                checked={selectedIds.length === MOCK_LEVELS.length && MOCK_LEVELS.length > 0}
                onChange={toggleSelectAll}
              />
            </TableHead>
            <TableHead>等级名称</TableHead>
            <TableHead>使用状态</TableHead>
            <TableHead>创建时间</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {MOCK_LEVELS.map((level) => (
            <TableRow key={level.id} className="hover:bg-blue-50/30">
              <TableCell className="text-center">
                <input 
                  type="checkbox" 
                  className="rounded border-gray-300"
                  checked={selectedIds.includes(level.id)}
                  onChange={() => toggleSelect(level.id)}
                />
              </TableCell>
              <TableCell className="font-medium text-gray-700">{level.name}</TableCell>
              <TableCell>
                <span className={`inline-flex px-3 py-1 text-sm rounded ${
                  level.status === '可用' 
                    ? 'bg-green-100 text-green-700' 
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {level.status}
                </span>
              </TableCell>
              <TableCell className="text-gray-600">{level.createTime}</TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-3 text-sm">
                  <button className="text-blue-500 hover:text-blue-600">
                    修改
                  </button>
                  <button className="text-red-400 hover:text-red-500">
                    删除
                  </button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Pagination */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">共 {totalRecords} 条</span>
          <div className="flex items-center gap-2">
            <select 
              className="h-9 px-3 rounded-md border border-gray-300 bg-white text-sm"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
            >
              <option value={10}>10条/页</option>
              <option value={20}>20条/页</option>
              <option value={50}>50条/页</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>

          <button
            onClick={() => setCurrentPage(1)}
            className={`px-3 py-1.5 text-sm rounded transition-colors ${
              currentPage === 1
                ? 'bg-blue-500 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-300'
            }`}
          >
            1
          </button>

          <Button
            variant="outline"
            className="px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>

          <div className="flex items-center gap-2 ml-2">
            <span className="text-sm text-gray-600">前往</span>
            <Input 
              type="number"
              className="w-16 text-center"
              value={jumpToPage}
              onChange={(e) => setJumpToPage(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleJumpToPage();
                }
              }}
            />
            <span className="text-sm text-gray-600">页</span>
          </div>
        </div>
      </div>
    </div>
  );
}
