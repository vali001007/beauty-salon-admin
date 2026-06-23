import { useCallback, useEffect, useMemo, useState, type ElementType } from 'react';
import { BookOpen, CheckCircle2, Database, Edit, FileText, Loader2, Package, Plus, RefreshCw, Save, Sparkles, Trash2, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/UI';
import {
  createIndustryDataSource,
  createIndustryKnowledgeItem,
  createIndustryProductTemplate,
  createIndustrySalaryBenchmark,
  createIndustryServiceTemplate,
  getIndustryAdoptions,
  getIndustryDataSources,
  getIndustryKnowledgeItems,
  getIndustryBomTemplate,
  getIndustryProductTemplatesPaginated,
  getIndustrySalaryBenchmarks,
  getIndustryServiceTemplatesPaginated,
  publishIndustryBomTemplate,
  publishIndustryProductTemplate,
  publishIndustryServiceTemplate,
  saveIndustryBomTemplate,
  updateIndustryDataSource,
  updateIndustryKnowledgeItem,
  updateIndustryProductTemplate,
  updateIndustrySalaryBenchmark,
  updateIndustryServiceTemplate,
} from '@/api/industry';
import type {
  IndustryAdoptionRecord,
  IndustryBomItemPayload,
  IndustryBomPayload,
  IndustryDataSource,
  IndustryDataSourcePayload,
  IndustryKnowledgeItem,
  IndustryKnowledgePayload,
  IndustryProductTemplate,
  IndustryProductTemplatePayload,
  IndustrySalaryBenchmark,
  IndustrySalaryPayload,
  IndustryServiceTemplate,
  IndustryServiceTemplatePayload,
} from '@/types';

type IndustryTab = 'services' | 'products' | 'bom' | 'knowledge' | 'salary' | 'sources' | 'adoptions' | 'supply';
type EditorKind = 'service' | 'product' | 'bom' | 'knowledge' | 'salary' | 'source';

type IndustryDataPlatformProps = {
  defaultTab?: IndustryTab;
};

type EditorState = {
  kind: EditorKind;
  mode: 'create' | 'edit';
  id?: number;
  title: string;
};

type FormDraft = Record<string, string>;

type BomItemDraft = {
  rowId: string;
  productTemplateId: string;
  itemRole: string;
  standardQty: string;
  unit: string;
  lossRate: string;
  required: boolean;
  costIncluded: boolean;
  serviceStep: string;
  allowSubstitute: boolean;
  substituteGroupCode: string;
  futureSupplyRequired: boolean;
  futureSupplyMappingKey: string;
};

const statusLabels: Record<string, string> = {
  draft: '草稿',
  pending_review: '待审核',
  published: '已发布',
  offline: '已下线',
  approved: '已发布',
  rejected: '已驳回',
  not_connected: '未接供应链',
  not_mapped: '未映射',
  mapping_requested: '待映射',
  mapped: '已映射',
  mapping_error: '映射异常',
  available: '可用',
};

const domainLabels: Record<string, string> = {
  service_sop: '服务 SOP',
  contraindication: '禁忌提醒',
  hygiene: '卫生安全',
  product_knowledge: '产品知识',
  sales_script: '销售话术',
  training: '培训知识',
};

const inputClass =
  'h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100';
const textareaClass =
  'min-h-24 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100';

function formatMoneyRange(min?: number | null, max?: number | null) {
  if (min == null && max == null) return '-';
  if (min != null && max != null) return `¥${min.toFixed(2)} - ¥${max.toFixed(2)}`;
  return `¥${Number(min ?? max).toFixed(2)}`;
}

function formatDuration(template: IndustryServiceTemplate) {
  const min = template.recommendedDurationMin;
  const max = template.recommendedDurationMax;
  if (min == null && max == null) return '-';
  if (min != null && max != null) return `${min}-${max} 分钟`;
  return `${min ?? max} 分钟`;
}

function statusBadge(status?: string | null) {
  const value = status || 'draft';
  const isGood = value === 'published' || value === 'approved' || value === 'available' || value === 'mapped';
  const isMuted = value === 'draft' || value === 'not_connected' || value === 'not_mapped';
  return (
    <Badge variant={isGood ? 'default' : isMuted ? 'secondary' : 'outline'} className="whitespace-nowrap">
      {statusLabels[value] ?? value}
    </Badge>
  );
}

function sectionTitle(icon: ElementType, title: string, description: string) {
  const Icon = icon;
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
    </div>
  );
}

function splitList(value?: string | string[] | null) {
  if (Array.isArray(value)) return value.join('、');
  return value ?? '';
}

function parseList(value?: string) {
  return (value ?? '')
    .split(/[,，、\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function numberOrUndefined(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const numberValue = Number(trimmed);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function cleanPayload<T extends Record<string, unknown>>(payload: T) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== ''),
  ) as Partial<T>;
}

function rowId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyBomItemDraft(): BomItemDraft {
  return {
    rowId: rowId(),
    productTemplateId: '',
    itemRole: 'main_material',
    standardQty: '1',
    unit: '件',
    lossRate: '0',
    required: true,
    costIncluded: true,
    serviceStep: '',
    allowSubstitute: false,
    substituteGroupCode: '',
    futureSupplyRequired: false,
    futureSupplyMappingKey: '',
  };
}

function makeServiceDraft(item?: IndustryServiceTemplate): FormDraft {
  return {
    code: item?.code ?? '',
    name: item?.name ?? '',
    category: item?.category ?? '',
    subCategory: item?.subCategory ?? '',
    recommendedDurationMin: item?.recommendedDurationMin?.toString() ?? '',
    recommendedDurationMax: item?.recommendedDurationMax?.toString() ?? '',
    referencePriceMin: item?.referencePriceMin?.toString() ?? '',
    referencePriceMax: item?.referencePriceMax?.toString() ?? '',
    targetCustomers: splitList(item?.targetCustomers),
    contraindications: splitList(item?.contraindications),
    sellingPoints: splitList(item?.sellingPoints),
    recommendedFrequency: item?.recommendedFrequency ?? '',
    bomUnavailableReason: item?.bomUnavailableReason ?? '',
    sourceId: item?.bomTemplates?.[0]?.sourceId?.toString() ?? '',
    status: item?.status ?? 'draft',
  };
}

function makeProductDraft(item?: IndustryProductTemplate): FormDraft {
  return {
    standardProductCode: item?.standardProductCode ?? '',
    name: item?.name ?? '',
    category: item?.category ?? '',
    subCategory: item?.subCategory ?? '',
    productType: item?.productType ?? 'consumable',
    recommendedSpec: item?.recommendedSpec ?? '',
    unit: item?.unit ?? '件',
    packageUnit: item?.packageUnit ?? '',
    referenceCostMin: item?.referenceCostMin?.toString() ?? '',
    referenceCostMax: item?.referenceCostMax?.toString() ?? '',
    referenceRetailPriceMin: item?.referenceRetailPriceMin?.toString() ?? '',
    referenceRetailPriceMax: item?.referenceRetailPriceMax?.toString() ?? '',
    applicableServiceCategories: splitList(item?.applicableServiceCategories),
    supplyCategoryCode: item?.supplyCategoryCode ?? '',
    preferredSpecKey: item?.preferredSpecKey ?? '',
    externalMappingKey: item?.externalMappingKey ?? '',
    futureSupplyMappingStatus: item?.futureSupplyMappingStatus ?? 'not_connected',
    status: item?.status ?? 'draft',
  };
}

function makeKnowledgeDraft(item?: IndustryKnowledgeItem): FormDraft {
  return {
    domain: item?.domain ?? 'service_sop',
    title: item?.title ?? '',
    content: item?.content ?? '',
    tags: splitList(item?.tags),
    applicableServiceTemplateIds: splitList(item?.applicableServiceTemplateIds?.map(String)),
    applicableProductTemplateIds: splitList(item?.applicableProductTemplateIds?.map(String)),
    applicableRoles: splitList(item?.applicableRoles),
    sourceId: item?.sourceId?.toString() ?? '',
    reviewStatus: item?.reviewStatus ?? 'draft',
  };
}

function makeSalaryDraft(item?: IndustrySalaryBenchmark): FormDraft {
  return {
    jobRole: item?.jobRole ?? '',
    roleCategory: item?.roleCategory ?? '',
    employeeLevel: item?.employeeLevel ?? '',
    targetStoreTypes: splitList(item?.targetStoreTypes),
    cityTier: item?.cityTier ?? '',
    baseSalaryMin: item?.baseSalaryMin?.toString() ?? '',
    baseSalaryMax: item?.baseSalaryMax?.toString() ?? '',
    commissionRateMin: item?.commissionRateMin != null ? String(item.commissionRateMin * 100) : '',
    commissionRateMax: item?.commissionRateMax != null ? String(item.commissionRateMax * 100) : '',
    serviceFeeMin: item?.serviceFeeMin?.toString() ?? '',
    serviceFeeMax: item?.serviceFeeMax?.toString() ?? '',
    responsibilities: splitList(item?.responsibilities),
    capabilityRequirements: splitList(item?.capabilityRequirements),
    status: item?.status ?? 'draft',
  };
}

function makeSourceDraft(item?: IndustryDataSource): FormDraft {
  return {
    name: item?.name ?? '',
    sourceType: item?.sourceType ?? 'manual_research',
    licenseType: item?.licenseType ?? '',
    confidenceLevel: item?.confidenceLevel ?? 'medium',
    applicableScope: item?.applicableScope ?? '',
    ownerName: item?.ownerName ?? '',
    sourceUrl: item?.sourceUrl ?? '',
    notes: item?.notes ?? '',
    status: item?.status ?? 'available',
  };
}

function makeBomDraft(service: IndustryServiceTemplate): { draft: FormDraft; items: BomItemDraft[] } {
  const bom = service.bomTemplates?.[0];
  return {
    draft: {
      serviceTemplateId: String(service.id),
      status: bom?.status ?? 'draft',
      sourceId: bom?.sourceId?.toString() ?? '',
    },
    items:
      bom?.items?.map((item) => ({
        rowId: String(item.id ?? rowId()),
        productTemplateId: String(item.productTemplateId),
        itemRole: item.itemRole || 'main_material',
        standardQty: String(item.standardQty ?? 1),
        unit: item.unit || item.productTemplate?.unit || '件',
        lossRate: String(item.lossRate ?? 0),
        required: item.required !== false,
        costIncluded: item.costIncluded !== false,
        serviceStep: item.serviceStep ?? '',
        allowSubstitute: Boolean(item.allowSubstitute),
        substituteGroupCode: item.substituteGroupCode ?? '',
        futureSupplyRequired: Boolean(item.futureSupplyRequired),
        futureSupplyMappingKey: item.futureSupplyMappingKey ?? '',
      })) ?? [emptyBomItemDraft()],
  };
}

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-medium text-gray-700">
      <span>
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function IndustryDataPlatform({ defaultTab = 'services' }: IndustryDataPlatformProps) {
  const [activeTab, setActiveTab] = useState<IndustryTab>(defaultTab);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [draft, setDraft] = useState<FormDraft>({});
  const [bomItemsDraft, setBomItemsDraft] = useState<BomItemDraft[]>([]);
  const [services, setServices] = useState<IndustryServiceTemplate[]>([]);
  const [products, setProducts] = useState<IndustryProductTemplate[]>([]);
  const [knowledge, setKnowledge] = useState<IndustryKnowledgeItem[]>([]);
  const [salary, setSalary] = useState<IndustrySalaryBenchmark[]>([]);
  const [sources, setSources] = useState<IndustryDataSource[]>([]);
  const [adoptions, setAdoptions] = useState<IndustryAdoptionRecord[]>([]);

  const summary = useMemo(() => {
    const publishedServices = services.filter((item) => item.status === 'published').length;
    const bomReady = services.filter((item) => (item.bomTemplates?.[0]?.items?.length ?? 0) > 0).length;
    const publishedProducts = products.filter((item) => item.status === 'published').length;
    return [
      { label: '已发布项目模板', value: publishedServices },
      { label: '已配置 BOM 项目', value: bomReady },
      { label: '已发布标准品', value: publishedProducts },
      { label: '已发布知识', value: knowledge.filter((item) => item.reviewStatus === 'approved').length },
    ];
  }, [knowledge, products, services]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page: 1, pageSize: 50, keyword: keyword || undefined };
      const [serviceResult, productResult, knowledgeResult, salaryResult, sourceResult, adoptionResult] = await Promise.all([
        getIndustryServiceTemplatesPaginated(params),
        getIndustryProductTemplatesPaginated(params),
        getIndustryKnowledgeItems(params),
        getIndustrySalaryBenchmarks(params),
        getIndustryDataSources(params),
        getIndustryAdoptions({ page: 1, pageSize: 30 }),
      ]);
      setServices(serviceResult.items);
      setProducts(productResult.items);
      setKnowledge(knowledgeResult.items);
      setSalary(salaryResult.items);
      setSources(sourceResult.items);
      setAdoptions(adoptionResult.items);
    } catch (err: any) {
      toast.error(err?.message || '行业数据加载失败');
    } finally {
      setLoading(false);
    }
  }, [keyword]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updateDraft = (field: string, value: string) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const closeEditor = () => {
    setEditor(null);
    setDraft({});
    setBomItemsDraft([]);
  };

  const openServiceEditor = (item?: IndustryServiceTemplate) => {
    setActiveTab('services');
    setEditor({ kind: 'service', mode: item ? 'edit' : 'create', id: item?.id, title: item ? '编辑服务项目模板' : '新增服务项目模板' });
    setDraft(makeServiceDraft(item));
    setBomItemsDraft([]);
  };

  const openProductEditor = (item?: IndustryProductTemplate) => {
    setActiveTab('products');
    setEditor({ kind: 'product', mode: item ? 'edit' : 'create', id: item?.id, title: item ? '编辑标准商品/耗品' : '新增标准商品/耗品' });
    setDraft(makeProductDraft(item));
    setBomItemsDraft([]);
  };

  const openKnowledgeEditor = (item?: IndustryKnowledgeItem) => {
    setActiveTab('knowledge');
    setEditor({ kind: 'knowledge', mode: item ? 'edit' : 'create', id: item?.id, title: item ? '编辑行业知识' : '新增行业知识' });
    setDraft(makeKnowledgeDraft(item));
    setBomItemsDraft([]);
  };

  const openSalaryEditor = (item?: IndustrySalaryBenchmark) => {
    setActiveTab('salary');
    setEditor({ kind: 'salary', mode: item ? 'edit' : 'create', id: item?.id, title: item ? '编辑岗位薪酬模板' : '新增岗位薪酬模板' });
    setDraft(makeSalaryDraft(item));
    setBomItemsDraft([]);
  };

  const openSourceEditor = (item?: IndustryDataSource) => {
    setActiveTab('sources');
    setEditor({ kind: 'source', mode: item ? 'edit' : 'create', id: item?.id, title: item ? '编辑行业数据源' : '新增行业数据源' });
    setDraft(makeSourceDraft(item));
    setBomItemsDraft([]);
  };

  const openBomEditor = async (service: IndustryServiceTemplate) => {
    let bomDraft = makeBomDraft(service);
    if (service.bomTemplates?.[0]) {
      try {
        const bom = await getIndustryBomTemplate(service.id);
        bomDraft = makeBomDraft({ ...service, bomTemplates: [bom] });
      } catch (err: any) {
        toast.error(err?.message || 'BOM 明细加载失败');
      }
    }
    setActiveTab('bom');
    setEditor({ kind: 'bom', mode: service.bomTemplates?.[0] ? 'edit' : 'create', id: service.id, title: `维护 BOM：${service.name}` });
    setDraft(bomDraft.draft);
    setBomItemsDraft(bomDraft.items);
  };

  const requireDraft = (fields: string[]) => {
    const missing = fields.find((field) => !draft[field]?.trim());
    if (missing) {
      toast.error('请先补齐必填字段');
      return false;
    }
    return true;
  };

  const handlePublishService = async (id: number) => {
    try {
      await publishIndustryServiceTemplate(id);
      toast.success('服务模板已发布');
      loadData();
    } catch (err: any) {
      toast.error(err?.message || '发布服务模板失败');
    }
  };

  const handlePublishProduct = async (id: number) => {
    try {
      await publishIndustryProductTemplate(id);
      toast.success('标准商品/耗品已发布');
      loadData();
    } catch (err: any) {
      toast.error(err?.message || '发布标准商品/耗品失败');
    }
  };

  const handlePublishBom = async (serviceTemplateId: number) => {
    try {
      await publishIndustryBomTemplate(serviceTemplateId);
      toast.success('BOM 模板已发布');
      loadData();
    } catch (err: any) {
      toast.error(err?.message || '发布 BOM 模板失败');
    }
  };

  const handleSaveEditor = async () => {
    if (!editor) return;
    setSaving(true);
    try {
      if (editor.kind === 'service') {
        if (!requireDraft(['code', 'name', 'category'])) return;
        const payload = cleanPayload<IndustryServiceTemplatePayload>({
          code: draft.code?.trim(),
          name: draft.name?.trim(),
          category: draft.category?.trim(),
          subCategory: draft.subCategory?.trim(),
          recommendedDurationMin: numberOrUndefined(draft.recommendedDurationMin),
          recommendedDurationMax: numberOrUndefined(draft.recommendedDurationMax),
          referencePriceMin: numberOrUndefined(draft.referencePriceMin),
          referencePriceMax: numberOrUndefined(draft.referencePriceMax),
          targetCustomers: parseList(draft.targetCustomers),
          contraindications: parseList(draft.contraindications),
          sellingPoints: parseList(draft.sellingPoints),
          recommendedFrequency: draft.recommendedFrequency?.trim(),
          bomUnavailableReason: draft.bomUnavailableReason?.trim(),
          status: draft.status || 'draft',
          sourceId: numberOrUndefined(draft.sourceId),
        });
        editor.mode === 'edit' && editor.id
          ? await updateIndustryServiceTemplate(editor.id, payload)
          : await createIndustryServiceTemplate(payload);
      }

      if (editor.kind === 'product') {
        if (!requireDraft(['standardProductCode', 'name', 'category', 'productType'])) return;
        const payload = cleanPayload<IndustryProductTemplatePayload>({
          standardProductCode: draft.standardProductCode?.trim(),
          name: draft.name?.trim(),
          category: draft.category?.trim(),
          subCategory: draft.subCategory?.trim(),
          productType: draft.productType || 'consumable',
          recommendedSpec: draft.recommendedSpec?.trim(),
          unit: draft.unit?.trim(),
          packageUnit: draft.packageUnit?.trim(),
          referenceCostMin: numberOrUndefined(draft.referenceCostMin),
          referenceCostMax: numberOrUndefined(draft.referenceCostMax),
          referenceRetailPriceMin: numberOrUndefined(draft.referenceRetailPriceMin),
          referenceRetailPriceMax: numberOrUndefined(draft.referenceRetailPriceMax),
          applicableServiceCategories: parseList(draft.applicableServiceCategories),
          supplyCategoryCode: draft.supplyCategoryCode?.trim(),
          preferredSpecKey: draft.preferredSpecKey?.trim(),
          externalMappingKey: draft.externalMappingKey?.trim(),
          futureSupplyMappingStatus: draft.futureSupplyMappingStatus || 'not_connected',
          status: draft.status || 'draft',
        });
        editor.mode === 'edit' && editor.id
          ? await updateIndustryProductTemplate(editor.id, payload)
          : await createIndustryProductTemplate(payload);
      }

      if (editor.kind === 'knowledge') {
        if (!requireDraft(['domain', 'title', 'content'])) return;
        const payload = cleanPayload<IndustryKnowledgePayload>({
          domain: draft.domain || 'service_sop',
          title: draft.title?.trim(),
          content: draft.content?.trim(),
          tags: parseList(draft.tags),
          applicableServiceTemplateIds: parseList(draft.applicableServiceTemplateIds).map(Number).filter(Number.isFinite),
          applicableProductTemplateIds: parseList(draft.applicableProductTemplateIds).map(Number).filter(Number.isFinite),
          applicableRoles: parseList(draft.applicableRoles),
          sourceId: numberOrUndefined(draft.sourceId),
          reviewStatus: draft.reviewStatus || 'draft',
        });
        editor.mode === 'edit' && editor.id
          ? await updateIndustryKnowledgeItem(editor.id, payload)
          : await createIndustryKnowledgeItem(payload);
      }

      if (editor.kind === 'salary') {
        if (!requireDraft(['jobRole'])) return;
        const payload = cleanPayload<IndustrySalaryPayload>({
          jobRole: draft.jobRole?.trim(),
          roleCategory: draft.roleCategory?.trim(),
          employeeLevel: draft.employeeLevel?.trim(),
          targetStoreTypes: parseList(draft.targetStoreTypes),
          cityTier: draft.cityTier?.trim(),
          baseSalaryMin: numberOrUndefined(draft.baseSalaryMin),
          baseSalaryMax: numberOrUndefined(draft.baseSalaryMax),
          commissionRateMin: numberOrUndefined(draft.commissionRateMin) != null ? Number(draft.commissionRateMin) / 100 : undefined,
          commissionRateMax: numberOrUndefined(draft.commissionRateMax) != null ? Number(draft.commissionRateMax) / 100 : undefined,
          serviceFeeMin: numberOrUndefined(draft.serviceFeeMin),
          serviceFeeMax: numberOrUndefined(draft.serviceFeeMax),
          responsibilities: parseList(draft.responsibilities),
          capabilityRequirements: parseList(draft.capabilityRequirements),
          status: draft.status || 'draft',
        });
        editor.mode === 'edit' && editor.id
          ? await updateIndustrySalaryBenchmark(editor.id, payload)
          : await createIndustrySalaryBenchmark(payload);
      }

      if (editor.kind === 'source') {
        if (!requireDraft(['name', 'sourceType', 'confidenceLevel'])) return;
        const payload = cleanPayload<IndustryDataSourcePayload>({
          name: draft.name?.trim(),
          sourceType: draft.sourceType?.trim(),
          licenseType: draft.licenseType?.trim(),
          confidenceLevel: draft.confidenceLevel?.trim(),
          applicableScope: draft.applicableScope?.trim(),
          ownerName: draft.ownerName?.trim(),
          sourceUrl: draft.sourceUrl?.trim(),
          notes: draft.notes?.trim(),
          status: draft.status || 'available',
        });
        editor.mode === 'edit' && editor.id
          ? await updateIndustryDataSource(editor.id, payload)
          : await createIndustryDataSource(payload);
      }

      if (editor.kind === 'bom') {
        const serviceTemplateId = Number(draft.serviceTemplateId || editor.id);
        if (!serviceTemplateId) {
          toast.error('请选择服务项目模板');
          return;
        }
        if (bomItemsDraft.some((item) => !item.productTemplateId || !item.standardQty || !item.unit)) {
          toast.error('BOM 明细需要选择标准品、标准用量和单位');
          return;
        }
        const payload: IndustryBomPayload = {
          status: draft.status || 'draft',
          sourceId: numberOrUndefined(draft.sourceId),
          items: bomItemsDraft.map<IndustryBomItemPayload>((item) => ({
            productTemplateId: Number(item.productTemplateId),
            itemRole: item.itemRole || 'main_material',
            standardQty: Number(item.standardQty),
            unit: item.unit || '件',
            lossRate: numberOrUndefined(item.lossRate) ?? 0,
            required: item.required,
            costIncluded: item.costIncluded,
            serviceStep: item.serviceStep || undefined,
            allowSubstitute: item.allowSubstitute,
            substituteGroupCode: item.substituteGroupCode || undefined,
            futureSupplyRequired: item.futureSupplyRequired,
            futureSupplyMappingKey: item.futureSupplyMappingKey || undefined,
          })),
        };
        await saveIndustryBomTemplate(serviceTemplateId, payload);
      }

      toast.success('行业数据已保存');
      closeEditor();
      loadData();
    } catch (err: any) {
      toast.error(err?.message || '保存行业数据失败');
    } finally {
      setSaving(false);
    }
  };

  const updateBomItem = <K extends keyof BomItemDraft>(rowIdValue: string, field: K, value: BomItemDraft[K]) => {
    setBomItemsDraft((prev) => prev.map((item) => (item.rowId === rowIdValue ? { ...item, [field]: value } : item)));
  };

  const renderEditor = () => {
    if (!editor) return null;
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-end gap-3 border-b border-gray-100 pb-4">
          <div className="flex gap-2">
            <Button variant="outline" onClick={closeEditor} disabled={saving} className="gap-2">
              <X className="h-4 w-4" />
              取消
            </Button>
            <Button onClick={handleSaveEditor} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存
            </Button>
          </div>
        </div>

        {editor.kind === 'service' && (
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="模板编码" required><Input value={draft.code || ''} onChange={(e) => updateDraft('code', e.target.value)} /></Field>
            <Field label="项目名称" required><Input value={draft.name || ''} onChange={(e) => updateDraft('name', e.target.value)} /></Field>
            <Field label="状态"><select className={inputClass} value={draft.status || 'draft'} onChange={(e) => updateDraft('status', e.target.value)}><option value="draft">草稿</option><option value="pending_review">待审核</option><option value="published">已发布</option><option value="offline">已下线</option></select></Field>
            <Field label="大类" required><Input value={draft.category || ''} onChange={(e) => updateDraft('category', e.target.value)} /></Field>
            <Field label="细分类"><Input value={draft.subCategory || ''} onChange={(e) => updateDraft('subCategory', e.target.value)} /></Field>
            <Field label="建议频次"><Input value={draft.recommendedFrequency || ''} onChange={(e) => updateDraft('recommendedFrequency', e.target.value)} /></Field>
            <Field label="最短时长"><Input type="number" value={draft.recommendedDurationMin || ''} onChange={(e) => updateDraft('recommendedDurationMin', e.target.value)} /></Field>
            <Field label="最长时长"><Input type="number" value={draft.recommendedDurationMax || ''} onChange={(e) => updateDraft('recommendedDurationMax', e.target.value)} /></Field>
            <Field label="数据源 ID"><Input type="number" value={draft.sourceId || ''} onChange={(e) => updateDraft('sourceId', e.target.value)} /></Field>
            <Field label="参考价下限"><Input type="number" value={draft.referencePriceMin || ''} onChange={(e) => updateDraft('referencePriceMin', e.target.value)} /></Field>
            <Field label="参考价上限"><Input type="number" value={draft.referencePriceMax || ''} onChange={(e) => updateDraft('referencePriceMax', e.target.value)} /></Field>
            <Field label="无法配置 BOM 原因"><Input value={draft.bomUnavailableReason || ''} onChange={(e) => updateDraft('bomUnavailableReason', e.target.value)} /></Field>
            <Field label="适用人群"><textarea className={textareaClass} value={draft.targetCustomers || ''} onChange={(e) => updateDraft('targetCustomers', e.target.value)} /></Field>
            <Field label="禁忌提醒"><textarea className={textareaClass} value={draft.contraindications || ''} onChange={(e) => updateDraft('contraindications', e.target.value)} /></Field>
            <Field label="核心卖点"><textarea className={textareaClass} value={draft.sellingPoints || ''} onChange={(e) => updateDraft('sellingPoints', e.target.value)} /></Field>
          </div>
        )}

        {editor.kind === 'product' && (
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="标准品编码" required><Input value={draft.standardProductCode || ''} onChange={(e) => updateDraft('standardProductCode', e.target.value)} /></Field>
            <Field label="名称" required><Input value={draft.name || ''} onChange={(e) => updateDraft('name', e.target.value)} /></Field>
            <Field label="状态"><select className={inputClass} value={draft.status || 'draft'} onChange={(e) => updateDraft('status', e.target.value)}><option value="draft">草稿</option><option value="published">已发布</option><option value="offline">已下线</option></select></Field>
            <Field label="分类" required><Input value={draft.category || ''} onChange={(e) => updateDraft('category', e.target.value)} /></Field>
            <Field label="细分类"><Input value={draft.subCategory || ''} onChange={(e) => updateDraft('subCategory', e.target.value)} /></Field>
            <Field label="类型" required><select className={inputClass} value={draft.productType || 'consumable'} onChange={(e) => updateDraft('productType', e.target.value)}><option value="consumable">耗品</option><option value="retail">零售商品</option><option value="tool">工具</option></select></Field>
            <Field label="推荐规格"><Input value={draft.recommendedSpec || ''} onChange={(e) => updateDraft('recommendedSpec', e.target.value)} /></Field>
            <Field label="单位"><Input value={draft.unit || ''} onChange={(e) => updateDraft('unit', e.target.value)} /></Field>
            <Field label="包装单位"><Input value={draft.packageUnit || ''} onChange={(e) => updateDraft('packageUnit', e.target.value)} /></Field>
            <Field label="参考成本下限"><Input type="number" value={draft.referenceCostMin || ''} onChange={(e) => updateDraft('referenceCostMin', e.target.value)} /></Field>
            <Field label="参考成本上限"><Input type="number" value={draft.referenceCostMax || ''} onChange={(e) => updateDraft('referenceCostMax', e.target.value)} /></Field>
            <Field label="供应链映射状态"><select className={inputClass} value={draft.futureSupplyMappingStatus || 'not_connected'} onChange={(e) => updateDraft('futureSupplyMappingStatus', e.target.value)}><option value="not_connected">未接供应链</option><option value="not_mapped">未映射</option><option value="mapping_requested">待映射</option><option value="mapped">已映射</option><option value="mapping_error">映射异常</option></select></Field>
            <Field label="参考零售价下限"><Input type="number" value={draft.referenceRetailPriceMin || ''} onChange={(e) => updateDraft('referenceRetailPriceMin', e.target.value)} /></Field>
            <Field label="参考零售价上限"><Input type="number" value={draft.referenceRetailPriceMax || ''} onChange={(e) => updateDraft('referenceRetailPriceMax', e.target.value)} /></Field>
            <Field label="适用服务类目"><Input value={draft.applicableServiceCategories || ''} onChange={(e) => updateDraft('applicableServiceCategories', e.target.value)} /></Field>
            <Field label="供应链类目"><Input value={draft.supplyCategoryCode || ''} onChange={(e) => updateDraft('supplyCategoryCode', e.target.value)} /></Field>
            <Field label="规格映射键"><Input value={draft.preferredSpecKey || ''} onChange={(e) => updateDraft('preferredSpecKey', e.target.value)} /></Field>
            <Field label="外部映射键"><Input value={draft.externalMappingKey || ''} onChange={(e) => updateDraft('externalMappingKey', e.target.value)} /></Field>
          </div>
        )}

        {editor.kind === 'bom' && (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="服务模板"><select className={inputClass} value={draft.serviceTemplateId || ''} onChange={(e) => updateDraft('serviceTemplateId', e.target.value)}>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></Field>
              <Field label="BOM 状态"><select className={inputClass} value={draft.status || 'draft'} onChange={(e) => updateDraft('status', e.target.value)}><option value="draft">草稿</option><option value="published">已发布</option><option value="offline">已下线</option></select></Field>
              <Field label="数据源 ID"><Input type="number" value={draft.sourceId || ''} onChange={(e) => updateDraft('sourceId', e.target.value)} /></Field>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-900">BOM 明细</div>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => setBomItemsDraft((prev) => [...prev, emptyBomItemDraft()])}>
                  <Plus className="h-4 w-4" />
                  添加明细
                </Button>
              </div>
              {bomItemsDraft.map((item) => (
                <div key={item.rowId} className="grid gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3 md:grid-cols-[1.4fr_0.7fr_0.6fr_0.7fr_1fr_auto]">
                  <select className={inputClass} value={item.productTemplateId} onChange={(e) => updateBomItem(item.rowId, 'productTemplateId', e.target.value)}>
                    <option value="">选择标准品</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} / {product.standardProductCode}
                      </option>
                    ))}
                  </select>
                  <Input type="number" value={item.standardQty} onChange={(e) => updateBomItem(item.rowId, 'standardQty', e.target.value)} placeholder="标准用量" />
                  <Input value={item.unit} onChange={(e) => updateBomItem(item.rowId, 'unit', e.target.value)} placeholder="单位" />
                  <Input type="number" value={item.lossRate} onChange={(e) => updateBomItem(item.rowId, 'lossRate', e.target.value)} placeholder="损耗率" />
                  <Input value={item.serviceStep} onChange={(e) => updateBomItem(item.rowId, 'serviceStep', e.target.value)} placeholder="服务步骤" />
                  <button
                    type="button"
                    onClick={() => setBomItemsDraft((prev) => prev.filter((draftItem) => draftItem.rowId !== item.rowId))}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-red-100 bg-white text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <label className="flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={item.required} onChange={(e) => updateBomItem(item.rowId, 'required', e.target.checked)} />必需</label>
                  <label className="flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={item.costIncluded} onChange={(e) => updateBomItem(item.rowId, 'costIncluded', e.target.checked)} />计入成本</label>
                  <label className="flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={item.allowSubstitute} onChange={(e) => updateBomItem(item.rowId, 'allowSubstitute', e.target.checked)} />允许替代</label>
                  <Input value={item.substituteGroupCode} onChange={(e) => updateBomItem(item.rowId, 'substituteGroupCode', e.target.value)} placeholder="替代组" />
                  <label className="flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={item.futureSupplyRequired} onChange={(e) => updateBomItem(item.rowId, 'futureSupplyRequired', e.target.checked)} />需供应链映射</label>
                  <Input value={item.futureSupplyMappingKey} onChange={(e) => updateBomItem(item.rowId, 'futureSupplyMappingKey', e.target.value)} placeholder="供应链映射键" />
                </div>
              ))}
            </div>
          </div>
        )}

        {editor.kind === 'knowledge' && (
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="领域" required><select className={inputClass} value={draft.domain || 'service_sop'} onChange={(e) => updateDraft('domain', e.target.value)}>{Object.entries(domainLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="状态"><select className={inputClass} value={draft.reviewStatus || 'draft'} onChange={(e) => updateDraft('reviewStatus', e.target.value)}><option value="draft">草稿</option><option value="pending_review">待审核</option><option value="approved">已发布</option><option value="rejected">已驳回</option><option value="offline">已下线</option></select></Field>
            <Field label="标题" required><Input value={draft.title || ''} onChange={(e) => updateDraft('title', e.target.value)} /></Field>
            <Field label="标签"><Input value={draft.tags || ''} onChange={(e) => updateDraft('tags', e.target.value)} /></Field>
            <Field label="适用服务模板 ID"><Input value={draft.applicableServiceTemplateIds || ''} onChange={(e) => updateDraft('applicableServiceTemplateIds', e.target.value)} /></Field>
            <Field label="适用标准品 ID"><Input value={draft.applicableProductTemplateIds || ''} onChange={(e) => updateDraft('applicableProductTemplateIds', e.target.value)} /></Field>
            <Field label="适用角色"><Input value={draft.applicableRoles || ''} onChange={(e) => updateDraft('applicableRoles', e.target.value)} /></Field>
            <Field label="数据源 ID"><Input type="number" value={draft.sourceId || ''} onChange={(e) => updateDraft('sourceId', e.target.value)} /></Field>
            <div className="md:col-span-2"><Field label="内容" required><textarea className={textareaClass} value={draft.content || ''} onChange={(e) => updateDraft('content', e.target.value)} /></Field></div>
          </div>
        )}

        {editor.kind === 'salary' && (
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="岗位" required><Input value={draft.jobRole || ''} onChange={(e) => updateDraft('jobRole', e.target.value)} /></Field>
            <Field label="角色分类"><Input value={draft.roleCategory || ''} onChange={(e) => updateDraft('roleCategory', e.target.value)} /></Field>
            <Field label="等级"><Input value={draft.employeeLevel || ''} onChange={(e) => updateDraft('employeeLevel', e.target.value)} /></Field>
            <Field label="适用门店类型"><Input value={draft.targetStoreTypes || ''} onChange={(e) => updateDraft('targetStoreTypes', e.target.value)} /></Field>
            <Field label="城市层级"><Input value={draft.cityTier || ''} onChange={(e) => updateDraft('cityTier', e.target.value)} /></Field>
            <Field label="状态"><select className={inputClass} value={draft.status || 'draft'} onChange={(e) => updateDraft('status', e.target.value)}><option value="draft">草稿</option><option value="published">已发布</option><option value="offline">已下线</option></select></Field>
            <Field label="底薪下限"><Input type="number" value={draft.baseSalaryMin || ''} onChange={(e) => updateDraft('baseSalaryMin', e.target.value)} /></Field>
            <Field label="底薪上限"><Input type="number" value={draft.baseSalaryMax || ''} onChange={(e) => updateDraft('baseSalaryMax', e.target.value)} /></Field>
            <Field label="单次服务费下限"><Input type="number" value={draft.serviceFeeMin || ''} onChange={(e) => updateDraft('serviceFeeMin', e.target.value)} /></Field>
            <Field label="单次服务费上限"><Input type="number" value={draft.serviceFeeMax || ''} onChange={(e) => updateDraft('serviceFeeMax', e.target.value)} /></Field>
            <Field label="提成比例下限(%)"><Input type="number" value={draft.commissionRateMin || ''} onChange={(e) => updateDraft('commissionRateMin', e.target.value)} /></Field>
            <Field label="提成比例上限(%)"><Input type="number" value={draft.commissionRateMax || ''} onChange={(e) => updateDraft('commissionRateMax', e.target.value)} /></Field>
            <Field label="职责"><textarea className={textareaClass} value={draft.responsibilities || ''} onChange={(e) => updateDraft('responsibilities', e.target.value)} /></Field>
            <Field label="能力要求"><textarea className={textareaClass} value={draft.capabilityRequirements || ''} onChange={(e) => updateDraft('capabilityRequirements', e.target.value)} /></Field>
          </div>
        )}

        {editor.kind === 'source' && (
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="来源名称" required><Input value={draft.name || ''} onChange={(e) => updateDraft('name', e.target.value)} /></Field>
            <Field label="来源类型" required><Input value={draft.sourceType || ''} onChange={(e) => updateDraft('sourceType', e.target.value)} /></Field>
            <Field label="可信等级" required><select className={inputClass} value={draft.confidenceLevel || 'medium'} onChange={(e) => updateDraft('confidenceLevel', e.target.value)}><option value="high">高</option><option value="medium">中</option><option value="low">低</option></select></Field>
            <Field label="授权类型"><Input value={draft.licenseType || ''} onChange={(e) => updateDraft('licenseType', e.target.value)} /></Field>
            <Field label="适用范围"><Input value={draft.applicableScope || ''} onChange={(e) => updateDraft('applicableScope', e.target.value)} /></Field>
            <Field label="负责人"><Input value={draft.ownerName || ''} onChange={(e) => updateDraft('ownerName', e.target.value)} /></Field>
            <Field label="来源链接"><Input value={draft.sourceUrl || ''} onChange={(e) => updateDraft('sourceUrl', e.target.value)} /></Field>
            <Field label="状态"><select className={inputClass} value={draft.status || 'available'} onChange={(e) => updateDraft('status', e.target.value)}><option value="available">可用</option><option value="draft">草稿</option><option value="offline">已下线</option></select></Field>
            <Field label="备注"><textarea className={textareaClass} value={draft.notes || ''} onChange={(e) => updateDraft('notes', e.target.value)} /></Field>
          </div>
        )}
      </div>
    );
  };

  const renderEditorDialog = () => (
    <Dialog open={Boolean(editor)} onOpenChange={(open) => {
      if (!open && !saving) closeEditor();
    }}>
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editor?.title || '维护行业数据'}</DialogTitle>
          <DialogDescription>
            保存后立即写入行业数据平台，发布后才会进入 Ami_Core 采用列表。
          </DialogDescription>
        </DialogHeader>
        {renderEditor()}
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">行业数据平台</h1>
            <p className="mt-1 text-sm text-gray-500">
              维护可被 Ami_Core 采用的服务项目、标准 BOM、标准商品/耗品、薪酬和知识库。首期不接真实供应商报价。
            </p>
          </div>
          <Button variant="outline" className="gap-2" onClick={loadData} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            刷新
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          {summary.map((item) => (
            <div key={item.label} className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
              <div className="text-2xl font-semibold text-gray-900">{item.value}</div>
              <div className="mt-1 text-sm text-gray-500">{item.label}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索模板、标准品、知识或数据源"
            className="w-80"
          />
          <Button onClick={loadData} className="gap-2">
            <Sparkles className="h-4 w-4" />
            查询
          </Button>
        </div>
      </div>

      {renderEditorDialog()}

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as IndustryTab)} className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 bg-gray-100 p-1 md:grid-cols-4 lg:grid-cols-8">
          <TabsTrigger value="services">服务模板</TabsTrigger>
          <TabsTrigger value="products">标准品</TabsTrigger>
          <TabsTrigger value="bom">项目 BOM</TabsTrigger>
          <TabsTrigger value="knowledge">知识库</TabsTrigger>
          <TabsTrigger value="salary">薪酬</TabsTrigger>
          <TabsTrigger value="sources">数据源</TabsTrigger>
          <TabsTrigger value="adoptions">采用记录</TabsTrigger>
          <TabsTrigger value="supply">供应链预留</TabsTrigger>
        </TabsList>

        <TabsContent value="services" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {sectionTitle(Database, '服务项目模板', '成熟市场项目模板，供 Ami_Core 项目管理采用。')}
            <Button className="gap-2" onClick={() => openServiceEditor()}>
              <Plus className="h-4 w-4" />
              新增服务模板
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>模板</TableHead>
                <TableHead>分类</TableHead>
                <TableHead>建议时长</TableHead>
                <TableHead>参考价</TableHead>
                <TableHead>BOM</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="font-medium">{item.name}</div>
                    <div className="text-xs text-gray-500">{item.code}</div>
                  </TableCell>
                  <TableCell>{item.category}{item.subCategory ? ` / ${item.subCategory}` : ''}</TableCell>
                  <TableCell>{formatDuration(item)}</TableCell>
                  <TableCell>{formatMoneyRange(item.referencePriceMin, item.referencePriceMax)}</TableCell>
                  <TableCell>{item.bomTemplates?.[0]?.items?.length ?? 0} 项</TableCell>
                  <TableCell>{statusBadge(item.status)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => openServiceEditor(item)}>
                        <Edit className="h-4 w-4" />
                        编辑
                      </Button>
                      {item.status !== 'published' && (
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => handlePublishService(item.id)}>
                          <CheckCircle2 className="h-4 w-4" />
                          发布
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="products" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {sectionTitle(Package, '标准商品/耗品', '标准品只做行业配置，不绑定供应商 SKU 和实时报价。')}
            <Button className="gap-2" onClick={() => openProductEditor()}>
              <Plus className="h-4 w-4" />
              新增标准品
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>标准品</TableHead>
                <TableHead>分类</TableHead>
                <TableHead>规格/单位</TableHead>
                <TableHead>参考成本</TableHead>
                <TableHead>供应链映射</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="font-medium">{item.name}</div>
                    <div className="text-xs text-gray-500">{item.standardProductCode}</div>
                  </TableCell>
                  <TableCell>{item.category}{item.subCategory ? ` / ${item.subCategory}` : ''}</TableCell>
                  <TableCell>{item.recommendedSpec || '-'} / {item.unit || '-'}</TableCell>
                  <TableCell>{formatMoneyRange(item.referenceCostMin, item.referenceCostMax)}</TableCell>
                  <TableCell>{statusBadge(item.futureSupplyMappingStatus)}</TableCell>
                  <TableCell>{statusBadge(item.status)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => openProductEditor(item)}>
                        <Edit className="h-4 w-4" />
                        编辑
                      </Button>
                      {item.status !== 'published' && (
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => handlePublishProduct(item.id)}>
                          <CheckCircle2 className="h-4 w-4" />
                          发布
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="bom" className="space-y-4">
          {sectionTitle(FileText, '项目 BOM 模板', '标准 BOM 用于门店项目快照、服务扣耗和经营利润估算。')}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>服务项目</TableHead>
                <TableHead>BOM 成本区间</TableHead>
                <TableHead>明细</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((service) => {
                const bom = service.bomTemplates?.[0];
                return (
                  <TableRow key={service.id}>
                    <TableCell>
                      <div className="font-medium">{service.name}</div>
                      <div className="text-xs text-gray-500">{service.category}</div>
                    </TableCell>
                    <TableCell>{bom ? formatMoneyRange(bom.totalCostMin, bom.totalCostMax) : service.bomUnavailableReason || '未配置'}</TableCell>
                    <TableCell>
                      <div className="max-w-xl text-sm text-gray-600">
                        {(bom?.items ?? []).slice(0, 4).map((item) => (
                          <span key={item.id} className="mr-3 inline-block">
                            {item.productTemplate?.name || item.productTemplateId} x {item.standardQty}{item.unit}
                          </span>
                        ))}
                        {(bom?.items?.length ?? 0) > 4 ? '...' : ''}
                      </div>
                    </TableCell>
                    <TableCell>{bom ? statusBadge(bom.status) : statusBadge('draft')}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => openBomEditor(service)}>
                          <Edit className="h-4 w-4" />
                          维护
                        </Button>
                        {bom && bom.status !== 'published' && (
                          <Button size="sm" variant="outline" className="gap-1" onClick={() => handlePublishBom(service.id)}>
                            <CheckCircle2 className="h-4 w-4" />
                            发布
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="knowledge" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {sectionTitle(BookOpen, '行业知识库', '已发布知识可供 AI Gateway 和 Ami Aura Lite 调用。')}
            <Button className="gap-2" onClick={() => openKnowledgeEditor()}>
              <Plus className="h-4 w-4" />
              新增知识
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>标题</TableHead>
                <TableHead>领域</TableHead>
                <TableHead>标签</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {knowledge.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="font-medium">{item.title}</div>
                    <div className="line-clamp-1 text-xs text-gray-500">{item.content}</div>
                  </TableCell>
                  <TableCell>{domainLabels[item.domain] ?? item.domain}</TableCell>
                  <TableCell>{item.tags?.join('、') || '-'}</TableCell>
                  <TableCell>{statusBadge(item.reviewStatus)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => openKnowledgeEditor(item)}>
                      <Edit className="h-4 w-4" />
                      编辑
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="salary" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {sectionTitle(Users, '岗位薪酬模板', '薪酬模板只做配置参考，不自动生成工资。')}
            <Button className="gap-2" onClick={() => openSalaryEditor()}>
              <Plus className="h-4 w-4" />
              新增薪酬模板
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>岗位</TableHead>
                <TableHead>等级</TableHead>
                <TableHead>底薪参考</TableHead>
                <TableHead>提成参考</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {salary.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="font-medium">{item.jobRole}</div>
                    <div className="text-xs text-gray-500">{item.roleCategory || '-'}</div>
                  </TableCell>
                  <TableCell>{item.employeeLevel || '-'}</TableCell>
                  <TableCell>{formatMoneyRange(item.baseSalaryMin, item.baseSalaryMax)}</TableCell>
                  <TableCell>
                    {item.commissionRateMin != null || item.commissionRateMax != null
                      ? `${((item.commissionRateMin ?? 0) * 100).toFixed(1)}% - ${((item.commissionRateMax ?? 0) * 100).toFixed(1)}%`
                      : '-'}
                  </TableCell>
                  <TableCell>{statusBadge(item.status)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => openSalaryEditor(item)}>
                      <Edit className="h-4 w-4" />
                      编辑
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="sources" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {sectionTitle(Database, '数据源管理', '记录模板来源、可信等级和授权口径。')}
            <Button className="gap-2" onClick={() => openSourceEditor()}>
              <Plus className="h-4 w-4" />
              新增数据源
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>来源</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>可信等级</TableHead>
                <TableHead>负责人</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="font-medium">{item.name}</div>
                    <div className="text-xs text-gray-500">{item.applicableScope || '-'}</div>
                  </TableCell>
                  <TableCell>{item.sourceType}</TableCell>
                  <TableCell>{item.confidenceLevel}</TableCell>
                  <TableCell>{item.ownerName || '-'}</TableCell>
                  <TableCell>{statusBadge(item.status)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => openSourceEditor(item)}>
                      <Edit className="h-4 w-4" />
                      编辑
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="adoptions" className="space-y-4">
          {sectionTitle(CheckCircle2, '采用记录', '记录 Ami_Core 门店采用了哪些行业模板版本。')}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>采用类型</TableHead>
                <TableHead>模板</TableHead>
                <TableHead>门店</TableHead>
                <TableHead>本地对象</TableHead>
                <TableHead>时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {adoptions.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.adoptionType}</TableCell>
                  <TableCell>{item.serviceTemplate?.name || item.serviceTemplateId || item.productTemplateId || '-'}</TableCell>
                  <TableCell>{item.storeId || '-'}</TableCell>
                  <TableCell>{item.localProjectId ? `项目 ${item.localProjectId}` : item.localProductId ? `商品 ${item.localProductId}` : '-'}</TableCell>
                  <TableCell>{item.createdAt ? item.createdAt.slice(0, 10) : '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="supply" className="space-y-4">
          {sectionTitle(Package, '供应链预留映射', '首期只保留未来映射键，不展示真实供应商、SKU、报价和库存。')}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>标准品</TableHead>
                <TableHead>供应链类目</TableHead>
                <TableHead>规格映射键</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="font-medium">{item.name}</div>
                    <div className="text-xs text-gray-500">{item.standardProductCode}</div>
                  </TableCell>
                  <TableCell>{item.supplyCategoryCode || '-'}</TableCell>
                  <TableCell>{item.preferredSpecKey || '-'}</TableCell>
                  <TableCell>{statusBadge(item.futureSupplyMappingStatus)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function IndustryServiceTemplates() {
  return <IndustryDataPlatform defaultTab="services" />;
}

export function IndustryProductTemplates() {
  return <IndustryDataPlatform defaultTab="products" />;
}

export function IndustryBomTemplates() {
  return <IndustryDataPlatform defaultTab="bom" />;
}

export function IndustryKnowledge() {
  return <IndustryDataPlatform defaultTab="knowledge" />;
}

export function IndustrySalaryBenchmarks() {
  return <IndustryDataPlatform defaultTab="salary" />;
}

export function IndustryDataSources() {
  return <IndustryDataPlatform defaultTab="sources" />;
}

export function IndustryAdoptions() {
  return <IndustryDataPlatform defaultTab="adoptions" />;
}

export function IndustrySupplyMappings() {
  return <IndustryDataPlatform defaultTab="supply" />;
}
