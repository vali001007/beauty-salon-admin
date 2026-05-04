import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, RotateCcw, Plus, Edit2, Trash2, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Input, Button, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/UI';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { getBeauticianLevels, createBeauticianLevel, updateBeauticianLevel, deleteBeauticianLevels, type BeauticianLevel } from '@/api/beauticianLevel';
import { toast } from 'sonner';

export function BeauticianLevelSettings() {
  // Search input (uncommitted) vs applied filters (committed by 搜索 button)
  const [searchInput, setSearchInput] = useState('');
  const [statusInput, setStatusInput] = useState<'all' | '可用' | '停用'>('all');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [appliedStatus, setAppliedStatus] = useState<'all' | '可用' | '停用'>('all');

  const [levels, setLevels] = useState<BeauticianLevel[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [jumpToPage, setJumpToPage] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BeauticianLevel | null>(null);
  const [formName, setFormName] = useState('');
  const [formStatus, setFormStatus] = useState<'可用' | '停用'>('可用');
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const data = await getBeauticianLevels();
      setLevels(data);
    } catch {
      toast.error('加载等级数据失败');
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = useMemo(() => {
    return levels.filter((l) => {
      if (appliedSearch && !l.name.includes(appliedSearch)) return false;
      if (appliedStatus !== 'all' && l.status !== appliedStatus) return false;
      return true;
    });
  }, [levels, appliedSearch, appliedStatus]);

  const totalRecords = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const pagedData = useMemo(
    () => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filtered, currentPage, pageSize],
  );

  // Reset page when filters/pageSize change
  useEffect(() => { setCurrentPage(1); }, [appliedSearch, appliedStatus, pageSize]);

  const handleSearch = () => {
    setAppliedSearch(searchInput.trim());
    setAppliedStatus(statusInput);
  };

  const handleReset = () => {
    setSearchInput('');
    setStatusInput('all');
    setAppliedSearch('');
    setAppliedStatus('all');
  };

  const openCreate = () => {
    setEditing(null);
    setFormName('');
    setFormStatus('可用');
    setDialogOpen(true);
  };

  const openEdit = (l: BeauticianLevel) => {
    setEditing(l);
    setFormName(l.name);
    setFormStatus(l.status);
    setDialogOpen(true);
  };

  const handleEditFromTopBar = () => {
    if (selectedIds.length !== 1) {
      toast.info('请只选择一条记录进行修改');
      return;
    }
    const target = levels.find((l) => l.id === selectedIds[0]);
    if (target) openEdit(target);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      toast.error('等级名称不能为空');
      return;
    }
    setSubmitting(true);
    try {
      if (editing) {
        await updateBeauticianLevel(editing.id, { name: formName.trim(), status: formStatus });
        toast.success('更新成功');
      } else {
        await createBeauticianLevel({ name: formName.trim(), status: formStatus });
        toast.success('创建成功');
      }
      setDialogOpen(false);
      loadData();
    } catch (err: any) {
      toast.error(err?.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    try {
      await deleteBeauticianLevels(selectedIds);
      toast.success(`已删除 ${selectedIds.length} 项`);
      setSelectedIds([]);
      loadData();
    } catch {
      toast.error('删除失败');
    }
  };

  const handleDeleteOne = async (id: number) => {
    try {
      await deleteBeauticianLevels([id]);
      toast.success('删除成功');
      setSelectedIds((prev) => prev.filter((i) => i !== id));
      loadData();
    } catch {
      toast.error('删除失败');
    }
  };

  const toggleSelectAll = () => {
    setSelectedIds(selectedIds.length === pagedData.length ? [] : pagedData.map((l) => l.id));
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
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
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyPress={(e) => { if (e.key === 'Enter') handleSearch(); }}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 whitespace-nowrap">状态</label>
          <select
            className="h-9 px-3 rounded-md border border-gray-300 bg-white text-sm w-32"
            value={statusInput}
            onChange={(e) => setStatusInput(e.target.value as 'all' | '可用' | '停用')}
          >
            <option value="all">全部</option>
            <option value="可用">可用</option>
            <option value="停用">停用</option>
          </select>
        </div>
        <Button className="gap-2 bg-[#1890ff]" onClick={handleSearch}>
          <Search className="w-4 h-4" /> 搜索
        </Button>
        <Button variant="outline" className="gap-2" onClick={handleReset}>
          <RotateCcw className="w-4 h-4" /> 重置
        </Button>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button variant="default" className="gap-2 bg-[#1890ff]" onClick={openCreate}>
          <Plus className="w-4 h-4" /> 新增
        </Button>
        <Button
          variant="default"
          className="gap-2 bg-green-500 hover:bg-green-600"
          disabled={selectedIds.length === 0}
          onClick={handleEditFromTopBar}
        >
          <Edit2 className="w-4 h-4" /> 修改
        </Button>
        <Button
          variant="danger"
          className="gap-2 bg-red-400 hover:bg-red-500"
          disabled={selectedIds.length === 0}
          onClick={handleBatchDelete}
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
                checked={pagedData.length > 0 && selectedIds.length === pagedData.length}
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
          {pagedData.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-gray-400 py-8">暂无数据</TableCell>
            </TableRow>
          ) : pagedData.map((level) => (
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
                  <button className="text-blue-500 hover:text-blue-600" onClick={() => openEdit(level)}>
                    修改
                  </button>
                  <button className="text-red-400 hover:text-red-500" onClick={() => handleDeleteOne(level.id)}>
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
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>

          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setCurrentPage(p)}
              className={`px-3 py-1.5 text-sm rounded transition-colors ${
                currentPage === p
                  ? 'bg-blue-500 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-300'
              }`}
            >
              {p}
            </button>
          ))}

          <Button
            variant="outline"
            className="px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
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
              onKeyPress={(e) => { if (e.key === 'Enter') handleJumpToPage(); }}
            />
            <span className="text-sm text-gray-600">页</span>
          </div>
        </div>
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md" aria-describedby="bl-dialog-desc">
          <DialogHeader>
            <DialogTitle>{editing ? '编辑美容师等级' : '新增美容师等级'}</DialogTitle>
          </DialogHeader>
          <span id="bl-dialog-desc" className="sr-only">{editing ? '编辑美容师等级信息' : '创建新的美容师等级'}</span>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">等级名称 <span className="text-red-500">*</span></label>
              <Input placeholder="请输入等级名称" value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">状态</label>
              <select
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value as '可用' | '停用')}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="可用">可用</option>
                <option value="停用">停用</option>
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editing ? '保存' : '确认添加'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
