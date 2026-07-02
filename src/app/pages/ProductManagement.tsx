import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Upload, Download, Edit, Eye, Ban, Image as ImageIcon, Loader2, FileDown, CircleCheck, Sparkles } from 'lucide-react';
import { Input, Button, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/UI';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { ImportDialog } from '../components/ImportDialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { productSchema, type ProductFormData } from '@/schemas/product';
import { getCategories, getProductsPaginated, createProduct, updateProduct, importProducts } from '@/api/product';
import { adoptIndustryProductTemplateAsProduct, getIndustryProductTemplates } from '@/api/industry';
import { usePagination } from '@/hooks/usePagination';
import { exportToExcel, downloadTemplate } from '@/utils/excel';
import { toast } from 'sonner';
import type { Category, IndustryProductTemplate, Product } from '@/types';
import type { ExportColumn } from '@/types/excel';

const PRODUCT_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'name', header: '产品名称', width: 20 },
  { key: 'sku', header: 'SKU编码', width: 18 },
  { key: 'brand', header: '品牌', width: 15 },
  { key: 'spec', header: '规格', width: 12 },
  { key: 'packageUnit', header: '包装', width: 8 },
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
  { key: 'packageUnit', header: '包装', width: 8 },
  { key: 'costPrice', header: '成本价', width: 10 },
  { key: 'retailPrice', header: '零售价', width: 10 },
  { key: 'shelfLife', header: '保质期(天)', width: 12 },
  { key: 'supplier', header: '供应商', width: 20 },
];

const PRODUCT_IMPORT_SAMPLE = [
  { name: '示例产品', brand: '示例品牌', spec: '30ml', packageUnit: '瓶', costPrice: 100, retailPrice: 200, shelfLife: 730, supplier: '示例供应商' },
];

const SPEC_UNIT_OPTIONS = ['ml', 'g', '片', '支', '个', '套', '包'];

function parseProductSpec(spec?: string | null) {
  const value = String(spec ?? '').trim();
  const match = value.match(/^(\d+(?:\.\d+)?)\s*([^\d\s/]+)(?:\/.*)?$/);
  if (!match) {
    return { specQuantity: 1, specUnit: value || 'ml' };
  }
  return { specQuantity: Number(match[1]), specUnit: match[2] || 'ml' };
}

function formatSpecQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : String(value).replace(/\.?0+$/, '');
}

function buildProductSpec(quantity: number, unit: string) {
  return `${formatSpecQuantity(quantity)}${unit.trim()}`;
}

function getIndustrySourceLabel(product: Product) {
  const source = product.industrySource;
  if (!source) return { text: '手工创建', className: 'bg-gray-100 text-gray-600' };
  if (source.adoptionStatus && source.adoptionStatus !== 'active') {
    return { text: '映射失效', className: 'bg-red-100 text-red-700' };
  }
  return { text: '行业标准品', className: 'bg-blue-100 text-blue-700' };
}

function getSupplyMappingLabel(product: Product) {
  const status = product.supplyMapping?.availabilityStatus ?? 'not_mapped';
  if (status === 'available') return { text: '可采购', className: 'bg-green-100 text-green-700' };
  if (status === 'mapped_no_quote') return { text: '报价缺失', className: 'bg-amber-100 text-amber-700' };
  if (status === 'quote_unavailable') return { text: '报价不可用', className: 'bg-orange-100 text-orange-700' };
  return { text: '未映射', className: 'bg-gray-100 text-gray-600' };
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toISOString().slice(0, 10);
}

function formatMoneyRange(min?: number | null, max?: number | null) {
  if (min == null && max == null) return '未配置';
  if (min != null && max != null) return `¥${Number(min).toFixed(2)} - ¥${Number(max).toFixed(2)}`;
  return `¥${Number(min ?? max).toFixed(2)}`;
}

function flattenCategories(categories: Category[]): Category[] {
  return categories.flatMap((category) => [category, ...flattenCategories(category.children ?? [])]);
}

export function ProductManagement() {
  const [searchKeyword, setSearchKeyword] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showIndustryAdoptionDialog, setShowIndustryAdoptionDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<number | null>(null);
  const [industryProductTemplates, setIndustryProductTemplates] = useState<IndustryProductTemplate[]>([]);
  const [industryTemplatesLoading, setIndustryTemplatesLoading] = useState(false);
  const [selectedIndustryProductTemplateId, setSelectedIndustryProductTemplateId] = useState('');
  const [isAdoptingIndustryProduct, setIsAdoptingIndustryProduct] = useState(false);

  const filters = useMemo(
    () => ({ keyword: searchKeyword || undefined, categoryId: selectedCategory ?? undefined }),
    [searchKeyword, selectedCategory],
  );
  const { data: products, total, page, pageSize, loading, setPage, setPageSize, refresh } = usePagination<Product>(getProductsPaginated, filters);
  const flatCategories = useMemo(() => flattenCategories(categories), [categories]);
  const selectedIndustryProductTemplate = industryProductTemplates.find(
    (template) => String(template.id) === selectedIndustryProductTemplateId,
  );

  const { register, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      specQuantity: 30,
      specUnit: 'ml',
      packageUnit: '瓶',
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
      const { specQuantity, specUnit, ...rest } = data;
      const payload = {
        ...rest,
        spec: buildProductSpec(specQuantity, specUnit),
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
    reset({ specQuantity: 30, specUnit: 'ml', packageUnit: '瓶' } as Partial<ProductFormData>);
  };

  const openCreateDialog = () => {
    setEditingProduct(null);
    reset({ specQuantity: 30, specUnit: 'ml', packageUnit: '瓶' } as Partial<ProductFormData>);
    setShowAddDialog(true);
  };

  const openIndustryAdoptionDialog = () => {
    setSelectedIndustryProductTemplateId('');
    setShowIndustryAdoptionDialog(true);
    setIndustryTemplatesLoading(true);
    getIndustryProductTemplates({ status: 'published' })
      .then((templates) => setIndustryProductTemplates(templates))
      .catch((error) => toast.error(error instanceof Error ? error.message : '行业标准品加载失败'))
      .finally(() => setIndustryTemplatesLoading(false));
  };

  const openEditDialog = (product: Product) => {
    const parsedSpec = parseProductSpec(product.spec);
    setEditingProduct(product);
    reset({
      name: product.name,
      brand: product.brand,
      specQuantity: product.specQuantity ?? parsedSpec.specQuantity,
      specUnit: product.specUnit ?? parsedSpec.specUnit,
      packageUnit: product.packageUnit ?? '瓶',
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

  const handleImportProductRows = (rows: Record<string, any>[]) =>
    importProducts(rows.map((row) => ({ ...row, 包装: row['包装'] ?? row['单位'], 单位: row['单位'] ?? row['包装'] })));

  const handleAdoptIndustryProduct = async () => {
    if (!selectedIndustryProductTemplate) {
      toast.error('请选择行业标准品');
      return;
    }
    setIsAdoptingIndustryProduct(true);
    try {
      await adoptIndustryProductTemplateAsProduct(selectedIndustryProductTemplate.id, {
        categoryName: selectedIndustryProductTemplate.category,
      });
      toast.success(`已从行业标准品创建「${selectedIndustryProductTemplate.name}」`);
      setShowIndustryAdoptionDialog(false);
      refresh();
    } catch (error: any) {
      toast.error(error?.message || '采用行业标准品失败');
    } finally {
      setIsAdoptingIndustryProduct(false);
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
          <Button variant="outline" className="gap-2 border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100" onClick={openIndustryAdoptionDialog}>
            <Sparkles className="w-4 h-4" /> 从行业标准品创建
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
                <TableHead>来源</TableHead>
                <TableHead>品牌</TableHead>
                <TableHead>规格</TableHead>
                <TableHead>包装</TableHead>
                <TableHead>成本价</TableHead>
                <TableHead>零售价</TableHead>
                <TableHead>保质期</TableHead>
                <TableHead>供应商</TableHead>
                <TableHead>供货状态</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <TableRow key={product.id} className="hover:bg-blue-50/30">
                  {(() => {
                    const sourceLabel = getIndustrySourceLabel(product);
                    const mappingLabel = getSupplyMappingLabel(product);
                    return (
                    <>
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
                  <TableCell>
                    <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${sourceLabel.className}`}>
                      {sourceLabel.text}
                    </span>
                  </TableCell>
                  <TableCell>{product.brand}</TableCell>
                  <TableCell>{product.spec}</TableCell>
                  <TableCell>{product.packageUnit || '-'}</TableCell>
                  <TableCell className="text-gray-700">¥{product.costPrice}</TableCell>
                  <TableCell className="font-medium text-gray-800">¥{product.retailPrice}</TableCell>
                  <TableCell>{product.shelfLife}天</TableCell>
                  <TableCell className="text-sm text-gray-600">{product.supplier}</TableCell>
                  <TableCell>
                    <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${mappingLabel.className}`}>
                      {mappingLabel.text}
                    </span>
                  </TableCell>
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
                    </>
                    );
                  })()}
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
                <div className="grid grid-cols-[1fr_120px] gap-2">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="如：30"
                    {...register('specQuantity', { valueAsNumber: true })}
                  />
                  <select
                    className="h-9 w-full rounded-md border border-gray-300 px-3 text-sm"
                    {...register('specUnit')}
                  >
                    {SPEC_UNIT_OPTIONS.map((unit) => (
                      <option key={unit} value={unit}>{unit}</option>
                    ))}
                  </select>
                </div>
                {(errors.specQuantity || errors.specUnit) && (
                  <p className="text-red-500 text-xs mt-1">{errors.specQuantity?.message || errors.specUnit?.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  包装 <span className="text-red-500">*</span>
                </label>
                <select
                  className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md"
                  {...register('packageUnit')}
                >
                  <option value="瓶">瓶</option>
                  <option value="盒">盒</option>
                  <option value="支">支</option>
                  <option value="个">个</option>
                  <option value="套">套</option>
                  <option value="包">包</option>
                </select>
                {errors.packageUnit && <p className="text-red-500 text-xs mt-1">{errors.packageUnit.message}</p>}
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

              <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-4 text-sm">
                <div>
                  <div className="text-gray-500">来源</div>
                  <div className="mt-1 font-medium text-gray-800">{getIndustrySourceLabel(viewingProduct).text}</div>
                </div>
                <div>
                  <div className="text-gray-500">来源标准编码</div>
                  <div className="mt-1 font-medium text-gray-800">{viewingProduct.industrySource?.standardProductCode || '-'}</div>
                </div>
                <div>
                  <div className="text-gray-500">来源模板</div>
                  <div className="mt-1 font-medium text-gray-800">{viewingProduct.industrySource?.templateName || '-'}</div>
                </div>
                <div>
                  <div className="text-gray-500">采用时间</div>
                  <div className="mt-1 font-medium text-gray-800">{formatDate(viewingProduct.industrySource?.adoptedAt)}</div>
                </div>
                <div>
                  <div className="text-gray-500">供应链映射</div>
                  <div className="mt-1 font-medium text-gray-800">{getSupplyMappingLabel(viewingProduct).text}</div>
                </div>
                <div>
                  <div className="text-gray-500">供应链 SKU</div>
                  <div className="mt-1 font-medium text-gray-800">{viewingProduct.supplyMapping?.supplySkuId || '-'}</div>
                </div>
                <div>
                  <div className="text-gray-500">平台供应商</div>
                  <div className="mt-1 font-medium text-gray-800">{viewingProduct.supplyMapping?.supplierName || '-'}</div>
                </div>
                <div>
                  <div className="text-gray-500">最近报价</div>
                  <div className="mt-1 font-medium text-gray-800">
                    {viewingProduct.supplyMapping?.latestQuotePrice != null ? `¥${viewingProduct.supplyMapping.latestQuotePrice}` : '-'}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500">起订量</div>
                  <div className="mt-1 font-medium text-gray-800">{viewingProduct.supplyMapping?.moq ?? '-'}</div>
                </div>
                <div>
                  <div className="text-gray-500">交期</div>
                  <div className="mt-1 font-medium text-gray-800">
                    {viewingProduct.supplyMapping?.leadDays != null ? `${viewingProduct.supplyMapping.leadDays} 天` : '-'}
                  </div>
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
                  <div className="text-gray-500">包装</div>
                  <div className="mt-1 font-medium text-gray-800">{viewingProduct.packageUnit || '-'}</div>
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

      <Dialog open={showIndustryAdoptionDialog} onOpenChange={setShowIndustryAdoptionDialog}>
        <DialogContent className="max-w-2xl" aria-describedby="industry-product-adoption-description">
          <DialogHeader>
            <DialogTitle>从行业标准品创建产品</DialogTitle>
          </DialogHeader>
          <p id="industry-product-adoption-description" className="text-sm text-gray-500">
            采用后会创建门店本地产品档案，用于库存、BOM、扣耗和成本核算；未来供应链映射仍保持未接入状态。
          </p>
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">行业标准品</label>
              <select
                value={selectedIndustryProductTemplateId}
                onChange={(event) => setSelectedIndustryProductTemplateId(event.target.value)}
                disabled={industryTemplatesLoading || isAdoptingIndustryProduct}
                className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-gray-100"
              >
                <option value="">{industryTemplatesLoading ? '正在加载行业标准品...' : '请选择已发布标准品'}</option>
                {industryProductTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.category} / {template.name} / {template.recommendedSpec || '-'}
                  </option>
                ))}
              </select>
            </div>
            {selectedIndustryProductTemplate && (
              <div className="grid gap-3 rounded-lg border border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-950 md:grid-cols-2">
                <div>
                  <div className="text-xs text-blue-500">标准编码</div>
                  <div className="mt-1 font-medium">{selectedIndustryProductTemplate.standardProductCode}</div>
                </div>
                <div>
                  <div className="text-xs text-blue-500">分类 / 类型</div>
                  <div className="mt-1 font-medium">
                    {selectedIndustryProductTemplate.category} / {selectedIndustryProductTemplate.productType}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-blue-500">建议规格</div>
                  <div className="mt-1 font-medium">{selectedIndustryProductTemplate.recommendedSpec || '-'}</div>
                </div>
                <div>
                  <div className="text-xs text-blue-500">单位</div>
                  <div className="mt-1 font-medium">{selectedIndustryProductTemplate.unit || '-'}</div>
                </div>
                <div>
                  <div className="text-xs text-blue-500">参考成本</div>
                  <div className="mt-1 font-medium">
                    {formatMoneyRange(selectedIndustryProductTemplate.referenceCostMin, selectedIndustryProductTemplate.referenceCostMax)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-blue-500">参考零售价</div>
                  <div className="mt-1 font-medium">
                    {formatMoneyRange(selectedIndustryProductTemplate.referenceRetailPriceMin, selectedIndustryProductTemplate.referenceRetailPriceMax)}
                  </div>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowIndustryAdoptionDialog(false)}
                disabled={isAdoptingIndustryProduct}
              >
                取消
              </Button>
              <Button
                type="button"
                className="gap-2"
                onClick={handleAdoptIndustryProduct}
                disabled={!selectedIndustryProductTemplate || industryTemplatesLoading || isAdoptingIndustryProduct}
              >
                {isAdoptingIndustryProduct ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                采用并创建产品
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <ImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        title="批量导入产品"
        columns={PRODUCT_IMPORT_COLUMNS}
        requiredColumns={['产品名称', '品牌', '规格', '包装', '成本价', '零售价', '供应商']}
        onImport={handleImportProductRows}
        onSuccess={refresh}
      />
    </div>
  );
}
