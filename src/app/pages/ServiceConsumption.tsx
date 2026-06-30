import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Calendar, ChevronDown, ChevronRight, Edit, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/UI';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { getBomConsumptionRecords, getBomForecast, getBomList, updateBom } from '@/api/bom';
import { getIndustryServiceTemplateBom, getIndustryServiceTemplates } from '@/api/industry';
import { getProducts } from '@/api/product';
import type { Product } from '@/types';
import type { BOMItem, ConsumptionRecord, ForecastItem, Service } from '@/types/bom';
import type { IndustryProjectBomItemTemplate, IndustryProjectBomTemplate, IndustryServiceTemplate } from '@/types/industry';

type BomDraftItem = {
  rowId: number;
  productId: string;
  productName: string;
  sku: string;
  standardQty: number;
  unit: string;
  unitCost: number;
};

const createEmptyBomDraftItem = (): BomDraftItem => ({
  rowId: Date.now() + Math.floor(Math.random() * 1000),
  productId: '',
  productName: '',
  sku: '',
  standardQty: 1,
  unit: '',
  unitCost: 0,
});

function toBomDraftItem(item: BOMItem, products: Product[]): BomDraftItem {
  const matchedProduct = products.find((product) => (
    (item.productId && product.id === item.productId) ||
    (item.sku && product.sku === item.sku)
  ));
  return {
    rowId: item.id || Date.now() + Math.floor(Math.random() * 1000),
    productId: item.productId ? String(item.productId) : matchedProduct ? String(matchedProduct.id) : '',
    productName: item.productName,
    sku: item.sku,
    standardQty: Number(item.standardQty || 1),
    unit: item.unit || matchedProduct?.unit || '',
    unitCost: Number(item.costPrice ?? matchedProduct?.costPrice ?? 0),
  };
}

function formatCurrency(value: number) {
  return `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function getBomItemCost(item: BomDraftItem) {
  return Number(item.unitCost || 0) * Number(item.standardQty || 0);
}

function getBomCompleteness(items: BOMItem[]) {
  if (!items.length) {
    return {
      label: '未配置',
      detail: '不会自动扣耗材，也无法形成 BOM 标准成本',
      className: 'border-amber-200 bg-amber-50 text-amber-700',
    };
  }
  if (items.some((item) => item.productStatus === '停售' || item.productStatus === 'offline' || item.productStatus === 'inactive' || !item.productName)) {
    return {
      label: '商品已下架',
      detail: 'BOM 中存在停售或无效耗材，服务扣减前需要替换',
      className: 'border-red-200 bg-red-50 text-red-700',
    };
  }
  if (items.some((item) => Number(item.costPrice ?? 0) <= 0)) {
    return {
      label: '缺成本',
      detail: 'BOM 已配置，但耗材成本缺失会影响项目毛利',
      className: 'border-orange-200 bg-orange-50 text-orange-700',
    };
  }
  return {
    label: '已配置',
    detail: '可用于自动扣耗材和项目毛利核算',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  };
}

function formatReferenceCost(item: IndustryProjectBomItemTemplate) {
  const min = item.productTemplate?.referenceCostMin;
  const max = item.productTemplate?.referenceCostMax;
  if (min == null && max == null) return '未配置';
  if (min != null && max != null) return `${formatCurrency(min)}-${formatCurrency(max)}`;
  return formatCurrency(Number(min ?? max ?? 0));
}

function findMatchedProduct(templateItem: IndustryProjectBomItemTemplate, products: Product[]) {
  const template = templateItem.productTemplate;
  const names = [template?.name, ...(template?.aliases ?? [])]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  const standardCode = template?.standardProductCode ? String(template.standardProductCode).toLowerCase() : '';
  return products.find((product) => {
    const productName = String(product.name ?? '').toLowerCase();
    const sku = String(product.sku ?? '').toLowerCase();
    const nameMatched = names.some((name) => productName.includes(name) || name.includes(productName));
    const skuMatched = Boolean(standardCode && sku === standardCode);
    return skuMatched || nameMatched;
  });
}

function toBomDraftItemFromIndustryTemplate(item: IndustryProjectBomItemTemplate, products: Product[]): BomDraftItem {
  const matchedProduct = findMatchedProduct(item, products);
  const template = item.productTemplate;
  const referenceCostMin = Number(template?.referenceCostMin ?? 0);
  const referenceCostMax = Number(template?.referenceCostMax ?? referenceCostMin);
  const referenceCost = referenceCostMin || referenceCostMax ? (referenceCostMin + referenceCostMax) / 2 : 0;
  return {
    rowId: Date.now() + item.id,
    productId: matchedProduct ? String(matchedProduct.id) : '',
    productName: matchedProduct?.name ?? template?.name ?? `标准耗材 #${item.productTemplateId}`,
    sku: matchedProduct?.sku ?? template?.standardProductCode ?? '',
    standardQty: Number(item.standardQty || 1),
    unit: item.unit || matchedProduct?.unit || template?.unit || '件',
    unitCost: Number(matchedProduct?.costPrice ?? referenceCost),
  };
}

export function ServiceConsumption() {
  const [activeTab, setActiveTab] = useState<'bom' | 'consumption' | 'forecast'>('bom');
  const [services, setServices] = useState<Service[]>([]);
  const [consumption, setConsumption] = useState<ConsumptionRecord[]>([]);
  const [forecast, setForecast] = useState<ForecastItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedServices, setExpandedServices] = useState<number[]>([]);
  const [showEditBOMDialog, setShowEditBOMDialog] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [bomDraftItems, setBomDraftItems] = useState<BomDraftItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [savingBom, setSavingBom] = useState(false);
  const [filterAbnormal, setFilterAbnormal] = useState(false);
  const [industryTemplates, setIndustryTemplates] = useState<IndustryServiceTemplate[]>([]);
  const [industryTemplatesLoading, setIndustryTemplatesLoading] = useState(false);
  const [industryBomLoading, setIndustryBomLoading] = useState(false);
  const [selectedIndustryTemplateId, setSelectedIndustryTemplateId] = useState('');
  const [selectedIndustryBomTemplate, setSelectedIndustryBomTemplate] = useState<IndustryProjectBomTemplate | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [serviceResult, consumptionResult, forecastResult] = await Promise.allSettled([
        getBomList(),
        getBomConsumptionRecords(),
        getBomForecast(),
      ]);

      const failedModules: string[] = [];
      if (serviceResult.status === 'fulfilled') {
        setServices(serviceResult.value);
        setExpandedServices((current) => current.length > 0 ? current : serviceResult.value.slice(0, 1).map((item) => item.id));
      } else {
        failedModules.push('BOM管理');
      }

      if (consumptionResult.status === 'fulfilled') {
        setConsumption(consumptionResult.value);
      } else {
        failedModules.push('项目耗材消耗');
      }

      if (forecastResult.status === 'fulfilled') {
        setForecast(forecastResult.value);
      } else {
        failedModules.push('库存预估');
      }

      if (failedModules.length) {
        toast.error(`${failedModules.join('、')}数据加载失败`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '服务消耗数据加载失败';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const toggleService = (serviceId: number) => {
    setExpandedServices((prev) =>
      prev.includes(serviceId)
        ? prev.filter((id) => id !== serviceId)
        : [...prev, serviceId],
    );
  };

  const ensureProductsLoaded = async () => {
    if (products.length || productsLoading) return products;
    setProductsLoading(true);
    try {
      const productList = await getProducts();
      setProducts(productList);
      return productList;
    } catch (error) {
      const message = error instanceof Error ? error.message : '商品列表加载失败，暂时无法编辑 BOM';
      toast.error(message);
      return [];
    } finally {
      setProductsLoading(false);
    }
  };

  const ensureIndustryTemplatesLoaded = async () => {
    if (industryTemplates.length || industryTemplatesLoading) return;
    setIndustryTemplatesLoading(true);
    try {
      const templates = await getIndustryServiceTemplates({ status: 'published' });
      setIndustryTemplates(templates);
    } catch {
      toast.error('行业项目耗品模板加载失败，暂不能导入标准 BOM');
    } finally {
      setIndustryTemplatesLoading(false);
    }
  };

  const handleEditBOM = async (service: Service) => {
    setSelectedService(service);
    setBomDraftItems(service.bom.map((item) => toBomDraftItem(item, products)));
    setSelectedIndustryTemplateId('');
    setSelectedIndustryBomTemplate(null);
    setShowEditBOMDialog(true);
    void ensureIndustryTemplatesLoaded();
    const productList = await ensureProductsLoaded();
    if (productList.length) {
      setBomDraftItems(service.bom.map((item) => toBomDraftItem(item, productList)));
    }
  };

  useEffect(() => {
    if (!showEditBOMDialog || !selectedIndustryTemplateId) {
      setSelectedIndustryBomTemplate(null);
      return;
    }

    let cancelled = false;
    setIndustryBomLoading(true);
    setSelectedIndustryBomTemplate(null);
    getIndustryServiceTemplateBom(Number(selectedIndustryTemplateId))
      .then((template) => {
        if (!cancelled) setSelectedIndustryBomTemplate(template);
      })
      .catch(() => {
        if (!cancelled) toast.error('行业 BOM 明细加载失败');
      })
      .finally(() => {
        if (!cancelled) setIndustryBomLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedIndustryTemplateId, showEditBOMDialog]);

  const handleAddBomItem = () => {
    setBomDraftItems((current) => [...current, createEmptyBomDraftItem()]);
  };

  const handleRemoveBomItem = (rowId: number) => {
    setBomDraftItems((current) => current.filter((item) => item.rowId !== rowId));
  };

  const updateBomDraftItem = (rowId: number, patch: Partial<BomDraftItem>) => {
    setBomDraftItems((current) => current.map((item) => item.rowId === rowId ? { ...item, ...patch } : item));
  };

  const handleSelectBomProduct = (rowId: number, productId: string) => {
    const product = products.find((item) => String(item.id) === productId);
    updateBomDraftItem(rowId, {
      productId,
      productName: product?.name ?? '',
      sku: product?.sku ?? '',
      unit: product?.unit ?? '',
      unitCost: Number(product?.costPrice ?? 0),
    });
  };

  const handleImportIndustryBom = async () => {
    const items = selectedIndustryBomTemplate?.items ?? [];
    if (!selectedIndustryTemplateId) {
      toast.error('请先选择行业项目耗品模板');
      return;
    }
    if (!items.length) {
      toast.error('所选模板暂无可导入的 BOM 明细');
      return;
    }
    if (bomDraftItems.length > 0 && !window.confirm('导入行业模板会覆盖当前 BOM 草稿，确认继续？')) {
      return;
    }
    const productList = await ensureProductsLoaded();
    const draftItems = items.map((item) => toBomDraftItemFromIndustryTemplate(item, productList));
    setBomDraftItems(draftItems);
    const unmappedCount = draftItems.filter((item) => !item.productId).length;
    if (unmappedCount > 0) {
      toast.warning(`已导入模板，仍有 ${unmappedCount} 个标准耗材需要映射本地商品`);
    } else {
      toast.success(`已导入 ${draftItems.length} 条行业 BOM 明细`);
    }
  };

  const handleSaveBom = async () => {
    if (!selectedService) return;

    const normalizedItems = bomDraftItems.map((item) => ({
      ...item,
      productId: item.productId.trim(),
      standardQty: Number(item.standardQty || 0),
    }));

    if (normalizedItems.some((item) => !item.productId)) {
      toast.error('请选择完整的 BOM 产品');
      return;
    }
    if (normalizedItems.some((item) => item.standardQty <= 0)) {
      toast.error('标准用量必须大于 0');
      return;
    }
    const productIds = normalizedItems.map((item) => item.productId);
    if (new Set(productIds).size !== productIds.length) {
      toast.error('同一产品只需要配置一次，请合并用量');
      return;
    }

    setSavingBom(true);
    try {
      const updatedService = await updateBom(selectedService.id, {
        bom: normalizedItems.map((item) => ({
          productId: Number(item.productId),
          productName: item.productName,
          sku: item.sku,
          standardQty: item.standardQty,
          unit: item.unit,
        })),
      });
      setServices((current) => current.map((service) => service.id === updatedService.id ? updatedService : service));
      setSelectedService(updatedService);
      setBomDraftItems(updatedService.bom.map((item) => toBomDraftItem(item, products)));
      setShowEditBOMDialog(false);
      window.dispatchEvent(new window.CustomEvent('project-bom-updated', { detail: { projectId: updatedService.id } }));
      toast.success('BOM 已保存');
      await loadData();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'BOM 保存失败，请稍后重试';
      toast.error(message);
    } finally {
      setSavingBom(false);
    }
  };

  const filteredConsumption = useMemo(
    () => filterAbnormal ? consumption.filter((record) => record.isAbnormal) : consumption,
    [consumption, filterAbnormal],
  );
  const serviceEmployeeOptions = useMemo(
    () => Array.from(new Set(consumption.map((record) => record.serviceEmployee ?? record.beautician).filter(Boolean))),
    [consumption],
  );

  const totalAppointments = Math.max(38, Math.round(consumption.length * 8.5));
  const bomTotalCost = useMemo(
    () => bomDraftItems.reduce((total, item) => total + getBomItemCost(item), 0),
    [bomDraftItems],
  );
  const selectedIndustryTemplate = useMemo(
    () => industryTemplates.find((template) => String(template.id) === selectedIndustryTemplateId),
    [industryTemplates, selectedIndustryTemplateId],
  );
  const industryBomItems = selectedIndustryBomTemplate?.items ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="text-sm text-gray-500">
        首页 / 库存管理 / 服务消耗与BOM
      </div>

      <h2 className="text-xl font-semibold text-gray-800">服务消耗与BOM</h2>

      <div className="flex items-center gap-4 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('bom')}
          className={`px-4 py-3 text-sm font-medium transition-colors relative ${
            activeTab === 'bom' ? 'text-blue-600' : 'text-gray-600 hover:text-gray-800'
          }`}
          type="button"
        >
          BOM管理
          {activeTab === 'bom' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
        <button
          onClick={() => setActiveTab('consumption')}
          className={`px-4 py-3 text-sm font-medium transition-colors relative ${
            activeTab === 'consumption' ? 'text-blue-600' : 'text-gray-600 hover:text-gray-800'
          }`}
          type="button"
        >
          项目耗材消耗
          {activeTab === 'consumption' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
        <button
          onClick={() => setActiveTab('forecast')}
          className={`px-4 py-3 text-sm font-medium transition-colors relative ${
            activeTab === 'forecast' ? 'text-blue-600' : 'text-gray-600 hover:text-gray-800'
          }`}
          type="button"
        >
          库存预估
          {activeTab === 'forecast' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
      </div>

      {loading && <div className="py-10 text-center text-sm text-gray-500">正在加载服务消耗数据...</div>}

      {!loading && activeTab === 'bom' && (
        <div className="space-y-3">
          {services.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">暂无 BOM 数据</div>
          ) : (
            services.map((service) => (
              <div key={service.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between p-4 hover:bg-gray-50 cursor-pointer" onClick={() => toggleService(service.id)}>
                  <div className="flex items-center gap-3 flex-1">
                    {expandedServices.includes(service.id) ? (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    )}
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-gray-800">{service.name}</h3>
                        <span className="text-sm text-gray-500">{service.duration}分钟</span>
                        <span className="text-sm font-medium text-blue-600">¥{service.price}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">BOM产品数: {service.bomCount}</div>
                      <div className="mt-2">
                        {(() => {
                          const completeness = getBomCompleteness(service.bom);
                          return (
                            <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${completeness.className}`}>
                              {completeness.label}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleEditBOM(service);
                    }}
                  >
                    <Edit className="w-3 h-3" /> 编辑BOM
                  </Button>
                </div>

                {expandedServices.includes(service.id) && (
                  <div className="border-t border-gray-200 bg-gray-50 p-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">BOM明细</h4>
                    {service.bom.length === 0 ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        当前项目未配置 BOM，服务完成后不会自动扣减耗材，项目毛利也会显示 BOM 缺口。
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-white">
                            <TableHead>产品名称</TableHead>
                            <TableHead>SKU</TableHead>
                            <TableHead>标准用量</TableHead>
                            <TableHead>单位</TableHead>
                            <TableHead>状态</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {service.bom.map((item) => (
                            <TableRow key={item.id} className="bg-white">
                              <TableCell className="font-medium text-gray-800">{item.productName}</TableCell>
                              <TableCell className="font-mono text-sm text-gray-600">{item.sku}</TableCell>
                              <TableCell className="font-medium text-blue-600">{item.standardQty}</TableCell>
                              <TableCell className="text-gray-600">{item.unit}</TableCell>
                              <TableCell className="text-sm text-gray-600">{item.productStatus ?? '在售'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {!loading && activeTab === 'consumption' && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Input type="date" className="w-40" />
              <span className="text-gray-400">至</span>
              <Input type="date" className="w-40" />
              <select className="h-9 px-3 text-sm border border-gray-300 rounded-md">
                <option>全部门店</option>
                <option>心悦美容养生会所</option>
                <option>凤仪阁美容养生会所</option>
              </select>
              <select className="h-9 px-3 text-sm border border-gray-300 rounded-md">
                <option>全部服务员工</option>
                {serviceEmployeeOptions.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="abnormal"
                className="w-4 h-4"
                checked={filterAbnormal}
                onChange={(event) => setFilterAbnormal(event.target.checked)}
              />
              <label htmlFor="abnormal" className="text-sm text-gray-700">仅显示异常</label>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/80">
                <TableHead>日期</TableHead>
                <TableHead>订单编号</TableHead>
                <TableHead>服务项目</TableHead>
                <TableHead>客户</TableHead>
                <TableHead>服务员工</TableHead>
                <TableHead>门店</TableHead>
                <TableHead>产品</TableHead>
                <TableHead>标准用量</TableHead>
                <TableHead>实际用量</TableHead>
                <TableHead>偏差%</TableHead>
                <TableHead>异常</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredConsumption.map((record) => (
                <TableRow key={record.id} className={`hover:bg-blue-50/30 ${Math.abs(record.deviation) > 20 ? 'bg-red-50' : ''}`}>
                  <TableCell>{record.date}</TableCell>
                  <TableCell className="font-mono text-sm text-gray-600">{record.orderNo || '-'}</TableCell>
                  <TableCell className="font-medium text-gray-800">{record.serviceName}</TableCell>
                  <TableCell>{record.customerName}</TableCell>
                  <TableCell>{record.serviceEmployee ?? record.beautician}</TableCell>
                  <TableCell className="text-sm text-gray-600">{record.storeName}</TableCell>
                  <TableCell>{record.productName}</TableCell>
                  <TableCell className="text-gray-600">{record.standardQty}</TableCell>
                  <TableCell className="font-medium">{record.actualQty}</TableCell>
                  <TableCell>
                    <span className={`font-semibold ${Math.abs(record.deviation) > 20 ? 'text-red-600' : 'text-gray-700'}`}>
                      {record.deviation > 0 ? '+' : ''}{record.deviation.toFixed(1)}%
                    </span>
                  </TableCell>
                  <TableCell>
                    {record.isAbnormal && (
                      <span className="inline-flex px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-700">
                        异常
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {filteredConsumption.length === 0 && <div className="py-10 text-center text-sm text-gray-500">暂无消耗记录</div>}
        </>
      )}

      {!loading && activeTab === 'forecast' && (
        <>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-3">
            <Calendar className="w-5 h-5 text-blue-600" />
            <p className="text-sm text-blue-700">
              <strong>基于未来7天共 {totalAppointments} 个预约计算</strong>
            </p>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/80">
                <TableHead>产品名称</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>预计消耗</TableHead>
                <TableHead>当前库存</TableHead>
                <TableHead>缺口量</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {forecast.map((item) => (
                <TableRow key={item.sku} className={`hover:bg-blue-50/30 ${item.shortage > 0 ? 'bg-orange-50' : ''}`}>
                  <TableCell className="font-medium text-gray-800">{item.productName}</TableCell>
                  <TableCell className="font-mono text-sm text-gray-600">{item.sku}</TableCell>
                  <TableCell>
                    <div className="font-medium text-blue-600">{item.forecastConsumption}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      预约 {item.scheduledConsumption ?? 0} / 日均 {item.recentDailyConsumption ?? 0}
                    </div>
                  </TableCell>
                  <TableCell className={item.shortage > 0 ? 'text-orange-600 font-medium' : ''}>
                    {item.currentStock}
                  </TableCell>
                  <TableCell>
                    {item.shortage > 0 ? (
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                        <span className="font-semibold text-red-600">{item.shortage}</span>
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {item.shortage > 0 && (
                      <Button size="sm" variant="outline" className="text-blue-600">
                        补货建议
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {forecast.length === 0 && <div className="py-10 text-center text-sm text-gray-500">暂无库存预估</div>}
        </>
      )}

      <Dialog open={showEditBOMDialog} onOpenChange={setShowEditBOMDialog}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto" aria-describedby="edit-bom-description">
          <DialogHeader>
            <DialogTitle>编辑BOM - {selectedService?.name}</DialogTitle>
          </DialogHeader>
          <span id="edit-bom-description" className="sr-only">编辑服务项目的物料清单</span>

          {selectedService && (
            <div className="space-y-4 mt-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-gray-600">服务时长</div>
                    <div className="font-medium text-gray-800 mt-1">{selectedService.duration}分钟</div>
                  </div>
                  <div>
                    <div className="text-gray-600">服务价格</div>
                    <div className="font-medium text-gray-800 mt-1">¥{selectedService.price}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">BOM产品数</div>
                    <div className="font-medium text-gray-800 mt-1">{bomDraftItems.length}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">BOM总成本</div>
                    <div className="font-medium text-gray-800 mt-1">{formatCurrency(bomTotalCost)}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-blue-900">从行业项目耗品标准库导入</h4>
                    <p className="mt-1 text-xs text-blue-700">适合新项目快速套用标准耗材；未匹配到本地商品的行需要手动选择后才能保存。</p>
                  </div>
                  <Sparkles className="h-5 w-5 text-blue-500" />
                </div>
                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                  <select
                    value={selectedIndustryTemplateId}
                    onChange={(event) => setSelectedIndustryTemplateId(event.target.value)}
                    disabled={industryTemplatesLoading || industryBomLoading || savingBom}
                    className="h-10 w-full rounded-lg border border-blue-200 bg-white px-3 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-gray-100"
                  >
                    <option value="">
                      {industryTemplatesLoading ? '正在加载行业模板...' : '选择已发布行业服务模板'}
                    </option>
                    {industryTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.category} / {template.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="outline"
                    className="gap-2 border-blue-200 text-blue-700 hover:bg-blue-100"
                    onClick={handleImportIndustryBom}
                    disabled={!selectedIndustryTemplateId || industryTemplatesLoading || industryBomLoading || savingBom}
                  >
                    {industryBomLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    导入模板
                  </Button>
                </div>
                {selectedIndustryTemplate && (
                  <div className="mt-3 grid gap-3 text-xs text-blue-900 md:grid-cols-3">
                    <div>
                      <div className="text-blue-500">模板</div>
                      <div className="mt-1 font-medium">{selectedIndustryTemplate.name}</div>
                    </div>
                    <div>
                      <div className="text-blue-500">BOM 明细</div>
                      <div className="mt-1 font-medium">
                        {industryBomLoading ? '加载中' : `${industryBomItems.length} 项`}
                      </div>
                    </div>
                    <div>
                      <div className="text-blue-500">模板版本</div>
                      <div className="mt-1 font-medium">v{selectedIndustryTemplate.version}</div>
                    </div>
                  </div>
                )}
                {industryBomItems.length > 0 && (
                  <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-blue-100 bg-white">
                    {industryBomItems.map((item) => (
                      <div key={item.id} className="grid grid-cols-[1.4fr_0.7fr_0.7fr] gap-3 border-b border-blue-50 px-3 py-2 text-xs last:border-b-0">
                        <div>
                          <div className="font-medium text-gray-900">{item.productTemplate?.name ?? `标准耗材 #${item.productTemplateId}`}</div>
                          <div className="mt-0.5 text-gray-500">
                            {[item.productTemplate?.category, item.productTemplate?.recommendedSpec].filter(Boolean).join(' / ') || '未配置规格'}
                          </div>
                        </div>
                        <div className="text-gray-700">{item.standardQty} {item.unit}</div>
                        <div className="text-gray-700">{formatReferenceCost(item)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-gray-800">产品明细</h4>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={handleAddBomItem}
                    disabled={productsLoading || savingBom}
                  >
                    <Plus className="w-3 h-3" /> 添加产品
                  </Button>
                </div>

                <div className="space-y-2">
                  {bomDraftItems.map((item) => (
                    <div key={item.rowId} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1 grid grid-cols-[1.5fr_1fr_0.8fr_0.8fr_0.9fr] gap-3">
                        <div>
                          <div className="text-xs text-gray-500 mb-1">产品名称</div>
                          <select
                            className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-sm"
                            value={item.productId}
                            onChange={(event) => handleSelectBomProduct(item.rowId, event.target.value)}
                            disabled={productsLoading || savingBom}
                          >
                            <option value="">{productsLoading ? '加载产品中...' : '请选择产品'}</option>
                            {products.map((product) => (
                              <option key={product.id} value={product.id}>
                                {product.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1">SKU</div>
                          <div className="text-sm font-mono text-gray-600">{item.sku}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1">标准用量</div>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              className="w-20 h-8 text-sm"
                              min={0.01}
                              step="0.01"
                              value={item.standardQty}
                              onChange={(event) => updateBomDraftItem(item.rowId, { standardQty: Number(event.target.value) })}
                              disabled={savingBom}
                            />
                            <span className="text-sm text-gray-600">{item.unit}</span>
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1">产品单价</div>
                          <div className="text-sm font-medium text-gray-800">{formatCurrency(item.unitCost)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1">成本小计</div>
                          <div className="text-sm font-semibold text-emerald-700">{formatCurrency(getBomItemCost(item))}</div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 hover:bg-red-50"
                        onClick={() => handleRemoveBomItem(item.rowId)}
                        disabled={savingBom}
                        aria-label="删除 BOM 产品"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> 删除
                      </Button>
                    </div>
                  ))}
                  {bomDraftItems.length === 0 && (
                    <div className="rounded-lg border border-dashed border-gray-300 py-8 text-center text-sm text-gray-500">
                      当前项目未配置 BOM，点击“添加产品”维护耗材清单。
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 mt-6">
            <Button variant="outline" onClick={() => setShowEditBOMDialog(false)}>
              取消
            </Button>
            <Button onClick={handleSaveBom} disabled={savingBom || productsLoading}>
              {savingBom ? '保存中...' : '保存修改'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
