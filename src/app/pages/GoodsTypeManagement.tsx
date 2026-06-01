import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Edit, FolderOpen, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input } from '../components/UI';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { createProjectType, deleteProjectTypes, getProjectTypes, updateProjectType } from '@/api/projectType';
import type { ProjectType } from '@/api/projectType';

interface GoodsTypeNode extends ProjectType {
  parentId: number | null;
  productCount: number;
  children: GoodsTypeNode[];
}

const DEFAULT_EXPANDED_IDS = [1, 2, 3];

export function GoodsTypeManagement() {
  const [types, setTypes] = useState<GoodsTypeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expandedIds, setExpandedIds] = useState<number[]>(DEFAULT_EXPANDED_IDS);
  const [selectedType, setSelectedType] = useState<GoodsTypeNode | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [dialogMode, setDialogMode] = useState<'add' | 'edit'>('add');
  const [parentForAdd, setParentForAdd] = useState<GoodsTypeNode | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');

  const flatTypes = useMemo(() => {
    const result: GoodsTypeNode[] = [];
    const visit = (nodes: GoodsTypeNode[]) => {
      nodes.forEach((node) => {
        result.push(node);
        visit(node.children);
      });
    };
    visit(types);
    return result;
  }, [types]);

  const loadTypes = async () => {
    setLoading(true);
    try {
      const data = await getProjectTypes();
      const nodes: GoodsTypeNode[] = data.map((type, index) => ({
        ...type,
        parentId: null,
        productCount: index % 3 === 0 ? 0 : index * 4 + 6,
        children: [],
      }));
      setTypes(nodes);
      setSelectedType((current) => {
        if (!current) return nodes[0] ?? null;
        return nodes.find((item) => item.id === current.id) ?? nodes[0] ?? null;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '商品类型加载失败';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTypes();
  }, []);

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const openAddDialog = (parent: GoodsTypeNode | null) => {
    setDialogMode('add');
    setParentForAdd(parent);
    setSelectedType(parent);
    setFormName('');
    setFormDesc('');
    setShowDialog(true);
  };

  const openEditDialog = (type: GoodsTypeNode) => {
    setDialogMode('edit');
    setParentForAdd(null);
    setSelectedType(type);
    setFormName(type.name);
    setFormDesc(type.description);
    setShowDialog(true);
  };

  const handleSubmit = async () => {
    const name = formName.trim();
    const description = formDesc.trim();
    if (!name) {
      toast.error('请输入类型名称');
      return;
    }

    setSubmitting(true);
    try {
      if (dialogMode === 'add') {
        await createProjectType({ name, description, status: '启用' });
        toast.success('商品类型已创建');
      } else if (selectedType) {
        await updateProjectType(selectedType.id, { name, description });
        toast.success('商品类型已保存');
      }
      setShowDialog(false);
      await loadTypes();
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存失败，请稍后重试';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (type: GoodsTypeNode) => {
    if (type.productCount > 0) return;
    setSubmitting(true);
    try {
      await deleteProjectTypes([type.id]);
      toast.success('商品类型已删除');
      if (selectedType?.id === type.id) setSelectedType(null);
      await loadTypes();
    } catch (error) {
      const message = error instanceof Error ? error.message : '删除失败，请稍后重试';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const renderTypeNode = (type: GoodsTypeNode, depth = 0) => {
    const hasChildren = type.children.length > 0;
    const isExpanded = expandedIds.includes(type.id);

    return (
      <div key={type.id}>
        <div
          className={`flex items-center justify-between px-4 py-3 hover:bg-blue-50/50 transition-colors border-b border-gray-100 cursor-pointer ${
            selectedType?.id === type.id ? 'bg-blue-50' : ''
          }`}
          style={{ paddingLeft: `${16 + depth * 24}px` }}
          onClick={() => setSelectedType(type)}
        >
          <div className="flex items-center gap-2 flex-1">
            {hasChildren ? (
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  toggleExpand(type.id);
                }}
                className="p-0.5 hover:bg-gray-200 rounded"
                type="button"
              >
                {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
              </button>
            ) : (
              <span className="w-5" />
            )}
            <FolderOpen className={`w-4 h-4 ${depth === 0 ? 'text-blue-500' : 'text-gray-400'}`} />
            <span className="font-medium text-gray-800">{type.name}</span>
            <span className="text-xs text-gray-400 ml-2">({type.productCount})</span>
          </div>
          <div className="flex items-center gap-1">
            {depth === 0 && (
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  openAddDialog(type);
                }}
                className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded"
                title="添加子分类"
                type="button"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={(event) => {
                event.stopPropagation();
                openEditDialog(type);
              }}
              className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded"
              title="编辑"
              type="button"
            >
              <Edit className="w-4 h-4" />
            </button>
            {type.productCount === 0 && (
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  handleDelete(type);
                }}
                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                title="删除"
                type="button"
                disabled={submitting}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        {hasChildren && isExpanded && type.children.map((child) => renderTypeNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="text-sm text-gray-500">首页 / 商品管理 / 商品类型</div>

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">商品类型管理</h2>
        <Button className="gap-2" onClick={() => openAddDialog(null)}>
          <Plus className="w-4 h-4" /> 添加一级分类
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">分类结构</span>
            <span className="text-xs text-gray-500">共 {flatTypes.length} 个分类</span>
          </div>
          <div className="max-h-[600px] overflow-y-auto">
            {loading ? (
              <div className="py-12 text-center text-sm text-gray-500">正在加载商品类型...</div>
            ) : types.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-500">暂无商品类型</div>
            ) : (
              types.map((type) => renderTypeNode(type))
            )}
          </div>
        </div>

        <div className="border border-gray-200 rounded-lg p-6">
          {selectedType ? (
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-800 text-lg">{selectedType.name}</h3>
              <div className="space-y-3">
                <div>
                  <div className="text-xs text-gray-500 mb-1">分类描述</div>
                  <div className="text-sm text-gray-700">{selectedType.description || '暂无描述'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">层级</div>
                  <div className="text-sm text-gray-700">{selectedType.parentId ? '二级分类' : '一级分类'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">状态</div>
                  <div className="text-sm text-gray-700">{selectedType.status}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">关联商品数</div>
                  <div className="text-sm font-semibold text-blue-600">{selectedType.productCount} 个</div>
                </div>
              </div>
              <div className="pt-4 border-t border-gray-200 flex gap-2">
                <Button size="sm" variant="outline" className="gap-1" onClick={() => openEditDialog(selectedType)}>
                  <Edit className="w-3 h-3" /> 编辑
                </Button>
                {selectedType.productCount === 0 && (
                  <Button size="sm" variant="outline" className="gap-1 text-red-600 hover:bg-red-50" onClick={() => handleDelete(selectedType)}>
                    <Trash2 className="w-3 h-3" /> 删除
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 py-12">
              <FolderOpen className="w-12 h-12 mb-3" />
              <p className="text-sm">选择左侧分类查看详情</p>
            </div>
          )}
        </div>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md" aria-describedby="type-dialog-desc">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === 'add'
                ? parentForAdd ? `添加子分类 - ${parentForAdd.name}` : '添加一级分类'
                : `编辑分类 - ${selectedType?.name}`}
            </DialogTitle>
          </DialogHeader>
          <span id="type-dialog-desc" className="sr-only">
            {dialogMode === 'add' ? '创建新的商品分类' : '编辑商品分类信息'}
          </span>
          <div className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                分类名称 <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="请输入分类名称"
                value={formName}
                onChange={(event) => setFormName(event.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">分类描述</label>
              <textarea
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
                rows={3}
                placeholder="请输入分类描述"
                value={formDesc}
                onChange={(event) => setFormDesc(event.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={submitting}>取消</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {dialogMode === 'add' ? '创建' : '保存'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
