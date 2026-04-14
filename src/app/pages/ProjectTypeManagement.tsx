import React, { useState, useEffect, useCallback } from 'react';
import { Search, Plus, Trash2, Edit2, Loader2 } from 'lucide-react';
import { Input, Button, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/UI';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { getProjectTypes, createProjectType, updateProjectType, deleteProjectTypes, type ProjectType } from '@/api/projectType';
import { toast } from 'sonner';

export function ProjectTypeManagement() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [projectTypes, setProjectTypes] = useState<ProjectType[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<ProjectType | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formStatus, setFormStatus] = useState<'启用' | '停用'>('启用');
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const data = await getProjectTypes();
      setProjectTypes(data);
    } catch {
      toast.error('加载项目类型失败');
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = searchTerm
    ? projectTypes.filter((t) => t.name.includes(searchTerm))
    : projectTypes;

  const openCreate = () => {
    setEditingType(null);
    setFormName('');
    setFormDesc('');
    setFormStatus('启用');
    setDialogOpen(true);
  };

  const openEdit = (t: ProjectType) => {
    setEditingType(t);
    setFormName(t.name);
    setFormDesc(t.description);
    setFormStatus(t.status);
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) { toast.error('类型名称不能为空'); return; }
    setSubmitting(true);
    try {
      if (editingType) {
        await updateProjectType(editingType.id, { name: formName, description: formDesc, status: formStatus });
        toast.success('更新成功');
      } else {
        await createProjectType({ name: formName, description: formDesc, status: formStatus });
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
      await deleteProjectTypes(selectedIds);
      toast.success(`已删除 ${selectedIds.length} 项`);
      setSelectedIds([]);
      loadData();
    } catch { toast.error('删除失败'); }
  };

  const handleDeleteOne = async (id: number) => {
    try {
      await deleteProjectTypes([id]);
      toast.success('删除成功');
      loadData();
    } catch { toast.error('删除失败'); }
  };

  const toggleSelectAll = () => {
    setSelectedIds(selectedIds.length === filtered.length ? [] : filtered.map((t) => t.id));
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-gray-800 border-b border-gray-100 pb-4">项目类型管理</h1>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 whitespace-nowrap">类型名称</label>
            <Input placeholder="请输入类型名称" className="w-64" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <Button className="gap-2"><Search className="w-4 h-4" /> 搜索</Button>
        </div>
        <Button variant="default" className="gap-2 bg-[#1890ff]" onClick={openCreate}>
          <Plus className="w-4 h-4" /> 新增类型
        </Button>
      </div>

      <div className="flex gap-2">
        <Button variant="danger" className="gap-2 bg-red-400 hover:bg-red-500" disabled={selectedIds.length === 0} onClick={handleBatchDelete}>
          <Trash2 className="w-4 h-4" /> 批量删除
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50/80">
            <TableHead className="w-12 text-center">
              <input type="checkbox" className="rounded border-gray-300" checked={selectedIds.length === filtered.length && filtered.length > 0} onChange={toggleSelectAll} />
            </TableHead>
            <TableHead>类型名称</TableHead>
            <TableHead>类型说明</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>创建时间</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((type) => (
            <TableRow key={type.id} className="hover:bg-blue-50/30">
              <TableCell className="text-center">
                <input type="checkbox" className="rounded border-gray-300" checked={selectedIds.includes(type.id)} onChange={() => toggleSelect(type.id)} />
              </TableCell>
              <TableCell className="font-medium text-gray-700">{type.name}</TableCell>
              <TableCell className="text-gray-600">{type.description}</TableCell>
              <TableCell>
                <span className={`inline-flex px-2 py-1 text-xs rounded-full ${type.status === '启用' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                  {type.status}
                </span>
              </TableCell>
              <TableCell className="text-gray-600">{type.createTime}</TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-3 text-sm">
                  <button className="flex items-center gap-1 text-blue-500 hover:text-blue-600" onClick={() => openEdit(type)}>
                    <Edit2 className="w-4 h-4" /> 编辑
                  </button>
                  <button className="flex items-center gap-1 text-red-400 hover:text-red-500" onClick={() => handleDeleteOne(type.id)}>
                    <Trash2 className="w-4 h-4" /> 删除
                  </button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
        <div className="text-sm text-gray-600">
          共 {filtered.length} 条记录
          {selectedIds.length > 0 && <span className="ml-4 text-blue-600">已选择 {selectedIds.length} 项</span>}
        </div>
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md" aria-describedby="pt-dialog-desc">
          <DialogHeader>
            <DialogTitle>{editingType ? '编辑项目类型' : '新增项目类型'}</DialogTitle>
          </DialogHeader>
          <span id="pt-dialog-desc" className="sr-only">{editingType ? '编辑项目类型信息' : '创建新的项目类型'}</span>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">类型名称 <span className="text-red-500">*</span></label>
              <Input placeholder="请输入类型名称" value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">类型说明</label>
              <textarea
                placeholder="请输入类型说明"
                rows={3}
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">状态</label>
              <select
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value as '启用' | '停用')}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="启用">启用</option>
                <option value="停用">停用</option>
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingType ? '保存' : '确认添加'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
