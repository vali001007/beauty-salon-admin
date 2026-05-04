import React, { useState, useMemo } from 'react';
import { Search, Plus, Upload, Download, Edit, Eye, Ban, ChevronRight, ChevronDown, Settings, Image as ImageIcon, Loader2, FileDown } from 'lucide-react';
import { Input, Button, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/UI';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { ImportDialog } from '../components/ImportDialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { productSchema, type ProductFormData } from '@/schemas/product';
import { getProductsPaginated, createProduct, getCategories, importProducts } from '@/api/product';
import { usePagination } from '@/hooks/usePagination';
import { exportToExcel, downloadTemplate } from '@/utils/excel';
import { toast } from 'sonner';
import type { Product, Category } from '@/types';
import type { ExportColumn } from '@/types/excel';

const PRODUCT_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'name', header: '产品名称', width: 20 },
  { key: 'sku', header: 'SKU编码', width: 18 },
  { key: 'brand', header: '品牌', width: 15 },
  { key: 'spec', header: '规格', width: 12 },
  { key: 'unit', header: '单位', width: 8 },
  { key: 'costPrice', header: '成本价', width: 10 },
  { key: 'retailPrice', header: '零售价', width: 10 },
  { key: 'shelfLife', header: '保质期(天)', width: 12 },
  { key: 'supplier', header: '供应商', width: 20 },
  { key: 'status', header: '状态', width: 8 },
];

const PRODUCT_IMPORT_COLUMNS: ExportColumn[] = [
  { key: 'name', header: '产品名称', width: 20 },
  { key: 'brand', header: '品牌', width: 15 },
  { key: 'spec', header: '规格', width: 12 },
  { key: 'unit', header: '单位', width: 8 },
  { key: 'costPrice', header: '成本价', width: 10 },
  { key: 'retailPrice', header: '零售价', width: 10 },
  { key: 'shelfLife', header: '保质期(天)', width: 12 },
  { key: 'supplier', header: '供应商', width: 20 },
];

const PRODUCT_IMPORT_SAMPLE = [
  { name: '示例产品', brand: '示例品牌', spec: '30ml', unit: '瓶', costPrice: 100, retailPrice: 200, shelfLife: 730, supplier: '示例供应商' },
];

const CATEGORIES_UI = [
  {
    id: 'skincare',
    name: '护肤品',
    children: [
      { id: 'cleanser', name: '洁面' },
      { id: 'essence', name: '精华' },
      { id: 'cream', name: '面霜' },
      { id: 'mask', name: '面膜' },
      { id: 'sunscreen', name: '防晒' },
    ],
  },
  {
    id: 'haircare',
    name: '美发产品',
    children: [
      { id: 'shampoo', name: '洗发' },
      { id: 'conditioner', name: '护发' },
      { id: 'styling', name: '造型' },
    ],
  },
  {
    id: 'nailcare',
    name: '美甲产品',
    children: [
      { id: 'polish', name: '指甲油' },
      { id: 'gel', name: '甲油胶' },
      { id: 'tools', name: '美甲工具' },
    ],
  },
  {
    id: 'equipment',
    name: '仪器耗材',
    children: [
      { id: 'consumables', name: '一次性耗材' },
      { id: 'parts', name: '仪器配件' },
    ],
  },
  {
    id: 'daily',
    name: '日用消耗品',
    children: [
      { id: 'towel', name: '毛巾类' },
      { id: 'disposable', name: '一次性用品' },
    ],
  },
];

export function ProductManagement() {
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['skincare', 'haircare', 'nailcare', 'equipment', 'daily']);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);

  const filters = useMemo(() => ({ keyword: searchKeyword || undefined }), [searchKeyword]);
  const { data: products, total, page, pageSize, loading, setPage, setPageSize, refresh } = usePagination<Product>(getProductsPaginated, filters);

  const { register, handleSubmit, formState: { errors, isSubmitting }, reset, setValue } = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      unit: '瓶',
    },
  });

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev =>
      prev.includes(categoryId)
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  const onSubmit = async (data: ProductFormData) => {
    try {
      await createProduct({
        ...data,
        categoryName: '',
        status: '在售',
      });
      toast.success('产品创建成功');
      setShowAddDialog(false);
      reset();
      refresh();
    } catch (err: any) {
      toast.error(err?.message || '创建产品失败');
    }
  };

  const handleCloseDialog = () => {
    setShowAddDialog(false);
    reset();
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <div className="text-sm text-gray-500">
        首页 / 库存管理 / 产品管理
      </div>

      {/* Top Action Bar */}
      <div className="flex items-center justify-between">
        <Input
          placeholder="搜索产品名称、SKU、品牌"
          className="w-96"
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
        />
        <div className="flex items-center gap-3">
          <Button variant="outline" className="gap-2" onClick={() => setShowImportDialog(true)}>
            <Upload className="w-4 h-4" /> 批量导入
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => downloadTemplate(PRODUCT_IMPORT_COLUMNS, '产品导入模板', PRODUCT_IMPORT_SAMPLE)}>
            <FileDown className="w-4 h-4" /> 下载模板
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => exportToExcel(products, PRODUCT_EXPORT_COLUMNS, '产品数据')}>
            <Download className="w-4 h-4" /> 导出
          </Button>
          <Button className="gap-2" onClick={() => setShowAddDialog(true)}>
            <Plus className="w-4 h-4" /> 添加产品
          </Button>
        </div>
      </div>

      {/* Main Content: Category Tree + Product Table */}
      <div className="flex gap-6">
        {/* Left: Category Tree */}
        <div className="w-60 shrink-0 bg-white border border-gray-200 rounded-lg p-4">
          <div className="font-semibold text-gray-800 mb-4">产品分类</div>
          <div className="space-y-1">
            {CATEGORIES_UI.map((category) => (
              <div key={category.id}>
                <button
                  onClick={() => toggleCategory(category.id)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-gray-100 transition-colors text-sm"
                >
                  <span className="font-medium text-gray-700">{category.name}</span>
                  {expandedCategories.includes(category.id) ? (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  )}
                </button>
                {expandedCategories.includes(category.id) && category.children && (
                  <div className="ml-4 mt-1 space-y-1">
                    {category.children.map((child) => (
                      <button
                        key={child.id}
                        onClick={() => setSelectedCategory(child.id)}
                        className={`w-full text-left px-3 py-1.5 rounded text-sm transition-colors ${
                          selectedCategory === child.id
                            ? 'bg-blue-50 text-blue-600'
                            : 'text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {child.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <button className="w-full mt-4 pt-4 border-t border-gray-200 text-sm text-blue-500 hover:text-blue-600 flex items-center gap-1">
            <Settings className="w-4 h-4" /> 管理分类
          </button>
        </div>

        {/* Right: Product Table */}
        <div className="flex-1 bg-white border border-gray-200 rounded-lg overflow-hidden">
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
                <TableHead className="w-20">缩略图</TableHead>
                <TableHead>产品名称</TableHead>
                <TableHead>SKU编码</TableHead>
                <TableHead>品牌</TableHead>
                <TableHead>规格</TableHead>
                <TableHead>单位</TableHead>
                <TableHead>成本价</TableHead>
                <TableHead>零售价</TableHead>
                <TableHead>保质期</TableHead>
                <TableHead>供应商</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <TableRow key={product.id} className="hover:bg-blue-50/30">
                  <TableCell>
                    <div className="w-12 h-12 bg-gradient-to-br from-pink-100 to-purple-100 rounded flex items-center justify-center">
                      <ImageIcon className="w-6 h-6 text-gray-400" />
                    </div>
                  </TableCell>
                  <TableCell className="font-medium text-gray-800">{product.name}</TableCell>
                  <TableCell className="font-mono text-sm text-gray-600">{product.sku}</TableCell>
                  <TableCell>{product.brand}</TableCell>
                  <TableCell>{product.spec}</TableCell>
                  <TableCell>{product.unit}</TableCell>
                  <TableCell className="text-gray-700">¥{product.costPrice}</TableCell>
                  <TableCell className="font-medium text-gray-800">¥{product.retailPrice}</TableCell>
                  <TableCell>{product.shelfLife}天</TableCell>
                  <TableCell className="text-sm text-gray-600">{product.supplier}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                        product.status === '在售'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {product.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button className="text-blue-500 hover:text-blue-600 text-sm">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button className="text-gray-500 hover:text-gray-600 text-sm">
                        <Eye className="w-4 h-4" />
                      </button>
                      {product.status === '在售' && (
                        <button className="text-orange-500 hover:text-orange-600 text-sm">
                          <Ban className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          )}
          
          {/* Pagination */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
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
      </div>

      {/* Add Product Dialog */}
      <Dialog open={showAddDialog} onOpenChange={handleCloseDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby="add-product-description">
          <DialogHeader>
            <DialogTitle>添加产品</DialogTitle>
          </DialogHeader>
          <span id="add-product-description" className="sr-only">添加新产品到产品库</span>
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SKU编码 <span className="text-gray-400">(自动生成)</span>
                </label>
                <Input value="SK-LO-000006" disabled className="bg-gray-50" />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  产品名称 <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder="请输入产品名称"
                  {...register('name')}
                />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  品牌 <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder="请输入品牌"
                  {...register('brand')}
                />
                {errors.brand && <p className="text-red-500 text-xs mt-1">{errors.brand.message}</p>}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  规格 <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder="如：30ml、10片/盒"
                  {...register('spec')}
                />
                {errors.spec && <p className="text-red-500 text-xs mt-1">{errors.spec.message}</p>}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  单位 <span className="text-red-500">*</span>
                </label>
                <select
                  className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md"
                  {...register('unit')}
                >
                  <option value="瓶">瓶</option>
                  <option value="盒">盒</option>
                  <option value="支">支</option>
                  <option value="个">个</option>
                  <option value="套">套</option>
                </select>
                {errors.unit && <p className="text-red-500 text-xs mt-1">{errors.unit.message}</p>}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  成本价 <span className="text-red-500">*</span>
                </label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  {...register('costPrice', { valueAsNumber: true })}
                />
                {errors.costPrice && <p className="text-red-500 text-xs mt-1">{errors.costPrice.message}</p>}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  零售价 <span className="text-red-500">*</span>
                </label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  {...register('retailPrice', { valueAsNumber: true })}
                />
                {errors.retailPrice && <p className="text-red-500 text-xs mt-1">{errors.retailPrice.message}</p>}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  保质期天数 <span className="text-red-500">*</span>
                </label>
                <Input
                  type="number"
                  placeholder="如：1080"
                  {...register('shelfLife', { valueAsNumber: true })}
                />
                {errors.shelfLife && <p className="text-red-500 text-xs mt-1">{errors.shelfLife.message}</p>}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  分类 <span className="text-red-500">*</span>
                </label>
                <select
                  className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md"
                  {...register('categoryId', { valueAsNumber: true })}
                >
                  <option value={0}>请选择分类</option>
                  <option value={12}>护肤品 - 精华</option>
                  <option value={14}>护肤品 - 面膜</option>
                  <option value={21}>美发产品 - 洗发</option>
                  <option value={31}>美甲产品 - 甲油胶</option>
                </select>
                {errors.categoryId && <p className="text-red-500 text-xs mt-1">{errors.categoryId.message}</p>}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  供应商 <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder="搜索供应商"
                  {...register('supplier')}
                />
                {errors.supplier && <p className="text-red-500 text-xs mt-1">{errors.supplier.message}</p>}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  最小采购量 <span className="text-red-500">*</span>
                </label>
                <Input
                  type="number"
                  placeholder="如：10"
                  {...register('minPurchaseQty', { valueAsNumber: true })}
                />
                {errors.minPurchaseQty && <p className="text-red-500 text-xs mt-1">{errors.minPurchaseQty.message}</p>}
              </div>
              
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">产品图片</label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors cursor-pointer">
                  <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-600">点击上传或拖拽图片到此处</p>
                  <p className="text-xs text-gray-400 mt-1">支持JPG、PNG格式，大小不超过2MB</p>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                取消
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                确认添加
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <ImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        title="批量导入产品"
        columns={PRODUCT_IMPORT_COLUMNS}
        requiredColumns={['产品名称', '品牌', '规格', '单位', '成本价', '零售价', '供应商']}
        onImport={importProducts}
        onSuccess={refresh}
      />
    </div>
  );
}