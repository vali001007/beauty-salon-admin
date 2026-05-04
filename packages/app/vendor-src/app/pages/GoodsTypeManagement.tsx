import React, { useState } from 'react';
import { Plus, Edit, Trash2, ChevronRight, ChevronDown, FolderOpen } from 'lucide-react';
import { Button, Input } from '../components/UI';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';

interface GoodsType {
  id: number;
  name: string;
  parentId: number | null;
  description: string;
  productCount: number;
  children: GoodsType[];
}

const MOCK_TYPES: GoodsType[] = [
  {
    id: 1, name: '护肤品', parentId: null, description: '面部及身体护肤类产品', productCount: 45,
    children: [
      { id: 11, name: '洁面', parentId: 1, description: '洁面乳、洗面奶等', productCount: 8, children: [] },
      { id: 12, name: '精华', parentId: 1, description: '精华液、精华水等', productCount: 12, children: [] },
      { id: 13, name: '面霜', parentId: 1, description: '面霜、乳液等', productCount: 10, children: [] },
      { id: 14, name: '面膜', parentId: 1, description: '贴片面膜、涂抹面膜等', productCount: 9, children: [] },
      { id: 15, name: '防晒', parentId: 1, description: '防晒霜、防晒喷雾等', productCount: 6, children: [] },
    ],
  },
  {
    id: 2, name: '美发产品', parentId: null, description: '洗护发及造型类产品', productCount: 28,
    children: [
      { id: 21, name: '洗发水', parentId: 2, description: '各类洗发产品', productCount: 10, children: [] },
      { id: 22, name: '护发素', parentId: 2, description: '护发素、发膜等', productCount: 8, children: [] },
      { id: 23, name: '造型产品', parentId: 2, description: '发蜡、发胶等', productCount: 10, children: [] },
    ],
  },
  {
    id: 3, name: '美甲产品', parentId: null, description: '美甲相关产品及工具', productCount: 18,
    children: [
      { id: 31, name: '甲油', parentId: 3, description: '指甲油、甲油胶等', productCount: 12, children: [] },
      { id: 32, name: '美甲工具', parentId: 3, description: '锉刀、光疗灯等', productCount: 6, children: [] },
    ],
  },
  { id: 4, name: '仪器耗材', parentId: null, description: '美容仪器配套耗材', productCount: 15, children: [] },
  { id: 5, name: '日用消耗品', parentId: null, description: '一次性用品、清洁用品等', productCount: 22, children: [] },
];

export function GoodsTypeManagement() {
  const [types] = useState(MOCK_TYPES);
  const [expandedIds, setExpandedIds] = useState<number[]>([1, 2, 3]);
  const [selectedType, setSelectedType] = useState<GoodsType | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [dialogMode, setDialogMode] = useState<'add' | 'edit'>('add');
  const [parentForAdd, setParentForAdd] = useState<GoodsType | null>(null);

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const handleAdd = (parent: GoodsType | null) => {
    setDialogMode('add');
    setParentForAdd(parent);
    setShowDialog(true);
  };

  const handleEdit = (type: GoodsType) => {
    setDialogMode('edit');
    setSelectedType(type);
    setShowDialog(true);
  };

  const renderTypeNode = (type: GoodsType, depth: number = 0) => {
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
                onClick={(e) => { e.stopPropagation(); toggleExpand(type.id); }}
                className="p-0.5 hover:bg-gray-200 rounded"
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
                onClick={(e) => { e.stopPropagation(); handleAdd(type); }}
                className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded"
                title="添加子分类"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); handleEdit(type); }}
              className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded"
              title="编辑"
            >
              <Edit className="w-4 h-4" />
            </button>
            {type.productCount === 0 && (
              <button
                onClick={(e) => e.stopPropagation()}
                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                title="删除"
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
        <Button className="gap-2" onClick={() => handleAdd(null)}>
          <Plus className="w-4 h-4" /> 添加一级分类
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left: Category Tree */}
        <div className="col-span-2 border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">分类结构</span>
            <span className="text-xs text-gray-500">共 {types.length} 个一级分类</span>
          </div>
          <div className="max-h-[600px] overflow-y-auto">
            {types.map((type) => renderTypeNode(type))}
          </div>
        </div>

        {/* Right: Detail Panel */}
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
                  <div className="text-xs text-gray-500 mb-1">关联商品数</div>
                  <div className="text-sm font-semibold text-blue-600">{selectedType.productCount} 个</div>
                </div>
                {selectedType.children.length > 0 && (
                  <div>
                    <div className="text-xs text-gray-500 mb-1">子分类数</div>
                    <div className="text-sm text-gray-700">{selectedType.children.length} 个</div>
                  </div>
                )}
              </div>
              <div className="pt-4 border-t border-gray-200 flex gap-2">
                <Button size="sm" variant="outline" className="gap-1" onClick={() => handleEdit(selectedType)}>
                  <Edit className="w-3 h-3" /> 编辑
                </Button>
                {selectedType.productCount === 0 && (
                  <Button size="sm" variant="outline" className="gap-1 text-red-600 hover:bg-red-50">
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

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md" aria-describedby="type-dialog-desc">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === 'add'
                ? parentForAdd ? `添加子分类 — ${parentForAdd.name}` : '添加一级分类'
                : `编辑分类 — ${selectedType?.name}`}
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
                defaultValue={dialogMode === 'edit' ? selectedType?.name : ''}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">分类描述</label>
              <textarea
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
                rows={3}
                placeholder="请输入分类描述"
                defaultValue={dialogMode === 'edit' ? selectedType?.description : ''}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="outline" onClick={() => setShowDialog(false)}>取消</Button>
            <Button onClick={() => setShowDialog(false)}>
              {dialogMode === 'add' ? '创建' : '保存'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
