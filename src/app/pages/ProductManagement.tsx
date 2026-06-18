import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Upload, Download, Edit, Eye, Ban, Image as ImageIcon, Loader2, FileDown, CircleCheck } from 'lucide-react';
import { Input, Button, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/UI';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { ImportDialog } from '../components/ImportDialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { productSchema, type ProductFormData } from '@/schemas/product';
import { getCategories, getProductsPaginated, createProduct, updateProduct, importProducts } from '@/api/product';
import { usePagination } from '@/hooks/usePagination';
import { exportToExcel, downloadTemplate } from '@/utils/excel';
import { toast } from 'sonner';
import type { Category, Product } from '@/types';
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

function flattenCategories(categories: Category[]): Category[] {
  return categories.flatMap((category) => [category, ...flattenCategories(category.children ?? [])]);
}

export function ProductManagement() {
  const [searchKeyword, setSearchKeyword] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<number | null>(null);

  const filters = useMemo(
    () => ({ keyword: searchKeyword || undefined, categoryId: selectedCategory ?? undefined }),
    [searchKeyword, selectedCategory],
  );
  const { data: products, total, page, pageSize, loading, setPage, setPageSize, refresh } = usePagination<Product>(getProductsPaginated, filters);
  const flatCategories = useMemo(() => flattenCategories(categories), [categories]);

  const { register, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      unit: '瓶',
    },
  });

  useEffect(() => {
    let ignore = false;
    const loadCategories = async () => {
      setCategoriesLoading(true);
      try {
        const data = await getCategories();
        if (ignore) return;
        setCategories(data);
      } catch (error) {
        const message = error instanceof Error ? error.message : '商品分类加载失败';
        toast.error(message);
      } finally {
        if (!ignore) setCategoriesLoading(false);
      }
    };
    loadCategories();
    return () => {
      ignore = true;
    };
  }, []);

  const onSubmit = async (data: ProductFormData) => {
    try {
      const category = flatCategories.find((item) => item.id === data.categoryId);
      const payload = {
        ...data,
        categoryName: category?.name ?? '',
        status: editingProduct?.status ?? '在售',
      } as Omit<Product, 'id' | 'sku'>;

      if (editingProduct) {
        await updateProduct(editingProduct.id, payload);
        toast.success('产品已保存');
      } else {
        await createProduct(payload);
        toast.success('产品创建成功');
      }
      handleCloseDialog();
      refresh();
    } catch (err: any) {
      toast.error(err?.message || (editingProduct ? '保存产品失败' : '创建产品失败'));
    }
  };

  const handleCloseDialog = () => {
    setShowAddDialog(false);
    setEditingProduct(null);
    reset({ unit: '瓶' } as Partial<ProductFormData>);
  };

  const openCreateDialog = () => {
    setEditingProduct(null);
    reset({ unit: '瓶' } as Partial<ProductFormData>);
    setShowAddDialog(true);
  };

  const openEditDialog = (product: Product) => {
    setEditingProduct(product);
    reset({
      name: product.name,
      brand: product.brand,
      spec: product.spec,
      unit: product.unit,
      costPrice: product.costPrice,
      retailPrice: product.retailPrice,
      shelfLife: product.shelfLife,
      categoryId: product.categoryId,
      supplier: product.supplier,
      minPurchaseQty: product.minPurchaseQty,
    });
  };

  const handleToggleSaleStatus = async (product: Product) => {
    const nextStatus: Product['status'] = product.status === '在售' ? '停售' : '在售';
    setUpdatingStatusId(product.id);
    try {
      await updateProduct(product.id, { status: nextStatus });
      toast.success(nextStatus === '在售' ? '产品已上架销售' : '产品已停售');
      refresh();
    } catch (err: any) {
      toast.error(err?.message || '更新售卖状态失败');
    } finally {
      setUpdatingStatusId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <div className="text-sm text-gray-500">
        首页 / 库存管理 / 产品管理
      </div>

      {/* Top Action Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-1 items-center gap-3 min-w-0">
          <Input
            placeholder="搜索产品名称、SKU、品牌"
            className="max-w-md flex-1"
            value={searchKeyword}
            onChange={(e) => {
              setSearchKeyword(e.target.value);
              setPage(1);
            }}
          />
          <select
            className="h-10 w-52 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 shadow-sm outline-none transition-colors focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-400"
            value={selectedCategory ?? ''}
            disabled={categoriesLoading}
            onChange={(event) => {
              const value = event.target.value;
              setSelectedCategory(value ? Number(value) : null);
              setPage(1);
            }}
          >
            <option value="">{categoriesLoading ? '分类加载中...' : '全部分类'}</option>
            {flatCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.parentId ? `-- ${category.name}` : category.name}
              </option>
            ))}
          </select>
        </div>
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
          <Button className="gap-2" onClick={openCreateDialog}>
            <Plus className="w-4 h-4" /> 添加产品
          </Button>
        </div>
      </div>

      {/* Product Table */}
      <div>
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
                    <div className="w-12 h-12 bg-gradient-to-br from-pink-100 to-purple-100 rounded overflow-hidden flex items-center justify-center">
                      {product.image ? (
                        <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
                      ) : (
                        <ImageIcon className="w-6 h-6 text-gray-400" />
                      )}
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
                      <button
                        className="text-blue-500 hover:text-blue-600 text-sm"
                        onClick={() => openEditDialog(product)}
                        title="编辑"
                        type="button"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        className="text-gray-500 hover:text-gray-600 text-sm"
                        onClick={() => setViewingProduct(product)}
                        title="查看"
                        type="button"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        className={`text-sm disabled:opacity-50 ${
                          product.status === '在售'
                            ? 'text-orange-500 hover:text-orange-600'
                            : 'text-green-600 hover:text-green-700'
                        }`}
                        onClick={() => handleToggleSaleStatus(product)}
                        title={product.status === '在售' ? '停售' : '上架销售'}
                        type="button"
                        disabled={updatingStatusId === product.id}
                      >
                        {updatingStatusId === product.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : product.status === '在售' ? (
                          <Ban className="w-4 h-4" />
                        ) : (
                          <CircleCheck className="w-4 h-4" />
                        )}
                      </button>
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

      {/* Add / Edit Product Dialog */}
      <Dialog open={showAddDialog || Boolean(editingProduct)} onOpenChange={(open) => !open && handleCloseDialog()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby="add-product-description">
          <DialogHeader>
            <DialogTitle>{editingProduct ? '编辑产品' : '添加产品'}</DialogTitle>
          </DialogHeader>
          <span id="add-product-description" className="sr-only">{editingProduct ? '编辑产品资料' : '添加新产品到产品库'}</span>
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SKU编码 <span className="text-gray-400">(自动生成)</span>
                </label>
                <Input value={editingProduct?.sku ?? '保存后自动生成'} disabled className="bg-gray-50" />
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
                  {flatCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.parentId ? `-- ${category.name}` : category.name}
                    </option>
                  ))}
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
                {editingProduct ? '保存修改' : '确认添加'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Product Detail Dialog */}
      <Dialog open={Boolean(viewingProduct)} onOpenChange={(open) => !open && setViewingProduct(null)}>
        <DialogContent className="max-w-xl" aria-describedby="view-product-description">
          <DialogHeader>
            <DialogTitle>产品详情</DialogTitle>
          </DialogHeader>
          <span id="view-product-description" className="sr-only">查看产品资料</span>
          {viewingProduct && (
            <div className="mt-4 space-y-5">
              <div className="flex items-start gap-4">
                <div className="w-20 h-20 bg-gradient-to-br from-pink-100 to-purple-100 rounded overflow-hidden flex items-center justify-center shrink-0">
                  {viewingProduct.image ? (
                    <img src={viewingProduct.image} alt={viewingProduct.name} className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-gray-400" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-lg font-semibold text-gray-900">{viewingProduct.name}</div>
                  <div className="mt-1 text-sm text-gray-500">{viewingProduct.sku}</div>
                  <span
                    className={`mt-3 inline-flex px-2 py-1 rounded text-xs font-medium ${
                      viewingProduct.status === '在售' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {viewingProduct.status}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-gray-500">分类</div>
                  <div className="mt-1 font-medium text-gray-800">{viewingProduct.categoryName || '-'}</div>
                </div>
                <div>
                  <div className="text-gray-500">品牌</div>
                  <div className="mt-1 font-medium text-gray-800">{viewingProduct.brand || '-'}</div>
                </div>
                <div>
                  <div className="text-gray-500">规格</div>
                  <div className="mt-1 font-medium text-gray-800">{viewingProduct.spec || '-'}</div>
                </div>
                <div>
                  <div className="text-gray-500">单位</div>
                  <div className="mt-1 font-medium text-gray-800">{viewingProduct.unit || '-'}</div>
                </div>
                <div>
                  <div className="text-gray-500">成本价</div>
                  <div className="mt-1 font-medium text-gray-800">¥{viewingProduct.costPrice}</div>
                </div>
                <div>
                  <div className="text-gray-500">零售价</div>
                  <div className="mt-1 font-medium text-gray-800">¥{viewingProduct.retailPrice}</div>
                </div>
                <div>
                  <div className="text-gray-500">保质期</div>
                  <div className="mt-1 font-medium text-gray-800">{viewingProduct.shelfLife} 天</div>
                </div>
                <div>
                  <div className="text-gray-500">最小采购量</div>
                  <div className="mt-1 font-medium text-gray-800">{viewingProduct.minPurchaseQty}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-gray-500">供应商</div>
                  <div className="mt-1 font-medium text-gray-800">{viewingProduct.supplier || '-'}</div>
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
                <Button type="button" variant="outline" onClick={() => setViewingProduct(null)}>
                  关闭
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    const product = viewingProduct;
                    setViewingProduct(null);
                    openEditDialog(product);
                  }}
                >
                  编辑
                </Button>
              </div>
            </div>
          )}
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
