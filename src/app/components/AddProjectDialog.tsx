import React, { useState, useEffect } from 'react';
import {
  X,
  Upload,
  Plus,
  Minus,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Sparkles,
  Loader2,
  Trash2,
} from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextAlign } from '@tiptap/extension-text-align';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import {
  adoptIndustryServiceTemplateAsProject,
  getIndustryServiceTemplateBom,
  getIndustryServiceTemplates,
} from '@/api/industry';
import {
  createCommissionRule,
  deleteCommissionRule,
  getCommissionRules,
  updateCommissionRule,
  type CommissionRule,
} from '@/api/commission';
import { createProject, setProjectBom, updateProject } from '@/api/project';
import { getProjectTypes, type ProjectType } from '@/api/projectType';
import { getProducts } from '@/api/product';
import { getUsers } from '@/api/user';
import { toast } from 'sonner';
import type { IndustryProjectBomTemplate, IndustryServiceTemplate, Product, Project } from '@/types';
import type { SystemUser } from '@/types/user';
import '../../styles/tiptap.css';

interface AddProjectDialogProps {
  open: boolean;
  onClose: () => void;
  initialProject?: Project | null;
}

type DialogStep = 'basic' | 'bom' | 'commission';
type CommissionCalcBase = 'total' | 'service_fee' | 'profit';
type CommissionDraftStatus = 'active' | 'disabled';
type IndustryProductMappingMode = 'auto' | 'manual';

type BomDraftItem = {
  rowId: string;
  productId: number | '';
  productName: string;
  sku: string;
  standardQty: number;
  unit: string;
  unitCost: number;
};

type CommissionDraftRule = {
  rowId: string;
  ruleId?: number;
  sourceRuleId?: number;
  sourceRuleName?: string;
  userIds: number[];
  name: string;
  rate: number;
  fixedAmount: number | '';
  calcBase: CommissionCalcBase;
  priority: number;
  status: CommissionDraftStatus;
};

function createInitialFormData(project?: Project | null) {
  return {
    name: project?.name ?? '',
    type: project?.type ?? '',
    duration: project?.duration ?? 60,
    price: project?.price ?? 0,
    discountPrice: 0,
    sortOrder: project?.sort ?? 0,
    onlineDisplay: project?.online ?? false,
    isRecommended: project?.recommend ?? false,
    isHomePage: project?.home ?? false,
    summary: project?.description ?? '',
    headerImage: null as File | null,
    detailImages: [] as File[],
  };
}

function formatCurrency(value: number) {
  return `¥${Number(value || 0).toFixed(2)}`;
}

function formatIndustryPriceRange(template?: IndustryServiceTemplate) {
  if (!template) return '';
  const min = template.referencePriceMin;
  const max = template.referencePriceMax;
  if (min == null && max == null) return '未配置参考价';
  if (min != null && max != null) return `${formatCurrency(min)} - ${formatCurrency(max)}`;
  return formatCurrency(Number(min ?? max));
}

function formatIndustryDuration(template?: IndustryServiceTemplate) {
  if (!template) return '';
  const min = template.recommendedDurationMin;
  const max = template.recommendedDurationMax;
  if (min == null && max == null) return '未配置时长';
  if (min != null && max != null) return `${min}-${max} 分钟`;
  return `${min ?? max} 分钟`;
}

function formatPercent(value?: number) {
  return `${Math.round(Number(value ?? 0) * 10000) / 100}%`;
}

function getBomItemCost(item: BomDraftItem) {
  return Number(item.unitCost || 0) * Number(item.standardQty || 0);
}

function createDraftRowId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createBlankCommissionDraft(projectName?: string): CommissionDraftRule {
  return {
    rowId: createDraftRowId(),
    userIds: [],
    name: projectName ? `${projectName} 提成` : '项目提成',
    rate: 0.08,
    fixedAmount: '',
    calcBase: 'total',
    priority: 0,
    status: 'active',
  };
}

function createCommissionDraftFromRule(rule: CommissionRule, projectName?: string): CommissionDraftRule {
  return {
    rowId: createDraftRowId(),
    sourceRuleId: rule.id,
    sourceRuleName: rule.name,
    userIds: rule.userId ? [Number(rule.userId)] : [],
    name: projectName ? `${projectName} - ${rule.name}` : rule.name,
    rate: Number(rule.rate ?? 0),
    fixedAmount: rule.fixedAmount === undefined || rule.fixedAmount === null ? '' : Number(rule.fixedAmount),
    calcBase: (rule.calcBase as CommissionCalcBase) || 'total',
    priority: Math.max(Number(rule.priority ?? 0), 1),
    status: 'active',
  };
}

function createCommissionDraftRules(project: Project | null | undefined, rules: CommissionRule[]): CommissionDraftRule[] {
  if (!project?.id) return [];
  return rules
    .filter(
      (rule) =>
        rule.type === 'project' &&
        rule.targetType === 'specific' &&
        Number(rule.targetId) === Number(project.id) &&
        rule.status !== 'archived',
    )
    .map((rule) => ({
      rowId: `rule-${rule.id}`,
      ruleId: rule.id,
      sourceRuleId: rule.id,
      sourceRuleName: rule.name,
      userIds: rule.userId ? [Number(rule.userId)] : [],
      name: rule.name,
      rate: Number(rule.rate ?? 0),
      fixedAmount: rule.fixedAmount === undefined || rule.fixedAmount === null ? '' : Number(rule.fixedAmount),
      calcBase: (rule.calcBase as CommissionCalcBase) || 'total',
      priority: Number(rule.priority ?? 0),
      status: rule.status === 'disabled' ? 'disabled' : 'active',
    }));
}

const calcBaseLabels: Record<CommissionCalcBase, string> = {
  total: '订单金额',
  service_fee: '服务金额',
  profit: '毛利',
};

function getCommissionUserName(rule: CommissionRule) {
  return rule.user?.name || rule.user?.username || `员工 ${rule.userId ?? '-'}`;
}

function getStaffUserName(user: SystemUser) {
  return user.name || user.username || `员工 ${user.id}`;
}

function getSelectedStaffNames(userIds: number[], users: SystemUser[]) {
  if (userIds.length === 0) return '请选择员工';
  const nameMap = new Map(users.map((user) => [Number(user.id), getStaffUserName(user)]));
  return userIds.map((id) => nameMap.get(Number(id)) ?? `员工 ${id}`).join('、');
}

function getDraftSourceLabel(draft: CommissionDraftRule) {
  if (draft.ruleId) return '项目专属';
  if (draft.sourceRuleId) return '引用规则';
  return '自定义';
}

function getRuleTargetLabel(rule: CommissionRule, projectTypes: ProjectType[]) {
  if (rule.targetType === 'all') return '全部项目';
  if (rule.targetType === 'category') {
    const typeName = projectTypes.find((type) => Number(type.id) === Number(rule.targetId))?.name;
    return typeName ? `项目类型：${typeName}` : `项目类型 #${rule.targetId ?? '-'}`;
  }
  return `指定项目 #${rule.targetId ?? '-'}`;
}

function isRuleAppliedByDefault(rule: CommissionRule, projectId?: number, projectTypeId?: number) {
  if (rule.type !== 'project' || rule.status !== 'active') return false;
  if (rule.targetType === 'all') return true;
  if (rule.targetType === 'category') {
    return Boolean(projectTypeId && Number(rule.targetId) === Number(projectTypeId));
  }
  if (rule.targetType === 'specific') {
    return Boolean(projectId && Number(rule.targetId) === Number(projectId));
  }
  return false;
}

function createBomDraftItems(project?: Project | null, products: Product[] = []): BomDraftItem[] {
  return (project?.bom ?? []).map((item, index) => ({
    rowId: `${item.id ?? item.productId ?? index}-${index}`,
    productId: item.productId ?? '',
    productName: item.productName ?? '',
    sku: item.sku ?? '',
    standardQty: Number(item.standardQty ?? 1),
    unit: item.unit || '件',
    unitCost: Number(
      item.costPrice ??
        products.find((product) => product.id === item.productId || product.sku === item.sku)?.costPrice ??
        0,
    ),
  }));
}

export function AddProjectDialog({ open, onClose, initialProject }: AddProjectDialogProps) {
  const [projectTypeList, setProjectTypeList] = useState<ProjectType[]>([]);
  const [productList, setProductList] = useState<Product[]>([]);
  const [staffUsers, setStaffUsers] = useState<SystemUser[]>([]);
  const [projectCommissionRules, setProjectCommissionRules] = useState<CommissionRule[]>([]);
  const [industryTemplates, setIndustryTemplates] = useState<IndustryServiceTemplate[]>([]);
  const [selectedIndustryTemplateId, setSelectedIndustryTemplateId] = useState('');
  const [selectedIndustryBomTemplate, setSelectedIndustryBomTemplate] = useState<IndustryProjectBomTemplate | null>(null);
  const [industryProductMappingMode, setIndustryProductMappingMode] = useState<IndustryProductMappingMode>('auto');
  const [industryProductMappings, setIndustryProductMappings] = useState<Record<number, string>>({});
  const [productsLoading, setProductsLoading] = useState(false);
  const [industryTemplatesLoading, setIndustryTemplatesLoading] = useState(false);
  const [industryBomLoading, setIndustryBomLoading] = useState(false);
  const [commissionLoading, setCommissionLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState<DialogStep>('basic');
  const [formData, setFormData] = useState(createInitialFormData);
  const [bomItems, setBomItems] = useState<BomDraftItem[]>([]);
  const [commissionDrafts, setCommissionDrafts] = useState<CommissionDraftRule[]>([]);
  const [removedCommissionRuleIds, setRemovedCommissionRuleIds] = useState<number[]>([]);
  const [selectedCommissionRuleId, setSelectedCommissionRuleId] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);
  const [isAdoptingIndustryTemplate, setIsAdoptingIndustryTemplate] = useState(false);

  useEffect(() => {
    if (open) {
      setCurrentStep('basic');
      setFormData(createInitialFormData(initialProject));
      setBomItems(createBomDraftItems(initialProject));
      setCommissionDrafts([]);
      setRemovedCommissionRuleIds([]);
      setSelectedCommissionRuleId('');
      setSelectedIndustryTemplateId('');
      setSelectedIndustryBomTemplate(null);
      setIndustryProductMappingMode('auto');
      setIndustryProductMappings({});
      getProjectTypes()
        .then((types) => setProjectTypeList(types.filter((t) => t.status === '启用')))
        .catch(() => {});
      if (!initialProject) {
        setIndustryTemplatesLoading(true);
        getIndustryServiceTemplates({ status: 'published' })
          .then((templates) => setIndustryTemplates(templates))
          .catch(() => toast.error('行业服务模板加载失败，暂不能快速创建项目'))
          .finally(() => setIndustryTemplatesLoading(false));
      } else {
        setIndustryTemplates([]);
      }
      setProductsLoading(true);
      getProducts()
        .then((products) => {
          setProductList(products);
          setBomItems(createBomDraftItems(initialProject, products));
        })
        .catch(() => toast.error('商品列表加载失败，BOM 商品暂不可选'))
        .finally(() => setProductsLoading(false));
      setCommissionLoading(true);
      Promise.all([
        getCommissionRules({ page: 1, pageSize: 500, type: 'project' }),
        getUsers(),
      ])
        .then(([rulePage, users]) => {
          const rules = rulePage.items;
          setProjectCommissionRules(rules);
          setStaffUsers(users.filter((user) => user.status === '启用'));
          setCommissionDrafts(createCommissionDraftRules(initialProject, rules));
        })
        .catch(() => toast.error('提成规则或员工列表加载失败，提成配置暂不可维护'))
        .finally(() => setCommissionLoading(false));
    }
  }, [initialProject, open]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Color,
      TextStyle,
    ],
    content: '<p>请输入项目详情...</p>',
  });

  useEffect(() => {
    if (open) {
      editor?.commands.setContent(initialProject?.description || '<p>请输入项目详情...</p>');
    }
  }, [editor, initialProject, open]);

  useEffect(() => {
    if (!open || initialProject || !selectedIndustryTemplateId) {
      setSelectedIndustryBomTemplate(null);
      setIndustryProductMappingMode('auto');
      setIndustryProductMappings({});
      return;
    }

    let cancelled = false;
    setIndustryBomLoading(true);
    setSelectedIndustryBomTemplate(null);
    setIndustryProductMappings({});
    getIndustryServiceTemplateBom(Number(selectedIndustryTemplateId))
      .then((bomTemplate) => {
        if (!cancelled) {
          setSelectedIndustryBomTemplate(bomTemplate);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSelectedIndustryBomTemplate(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIndustryBomLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [initialProject, open, selectedIndustryTemplateId]);

  const handleNumberChange = (field: 'duration' | 'price' | 'discountPrice' | 'sortOrder', delta: number) => {
    setFormData(prev => ({
      ...prev,
      [field]: Math.max(0, prev[field] + delta)
    }));
  };

  const handleHeaderImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFormData(prev => ({ ...prev, headerImage: e.target.files![0] }));
    }
  };

  const handleDetailImagesUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFormData(prev => ({ ...prev, detailImages: [...prev.detailImages, ...newFiles] }));
    }
  };

  const removeDetailImage = (index: number) => {
    setFormData(prev => ({
      ...prev,
      detailImages: prev.detailImages.filter((_, i) => i !== index)
    }));
  };

  const handleAddBomItem = () => {
    setBomItems((prev) => [
      ...prev,
      {
        rowId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        productId: '',
        productName: '',
        sku: '',
        standardQty: 1,
        unit: '件',
        unitCost: 0,
      },
    ]);
  };

  const handleRemoveBomItem = (rowId: string) => {
    setBomItems((prev) => prev.filter((item) => item.rowId !== rowId));
  };

  const handleBomProductChange = (rowId: string, productIdValue: string) => {
    const productId = Number(productIdValue);
    const product = productList.find((item) => item.id === productId);
    setBomItems((prev) =>
      prev.map((item) =>
        item.rowId === rowId
          ? {
              ...item,
              productId: product?.id ?? '',
              productName: product?.name ?? '',
              sku: product?.sku ?? '',
              unit: product?.unit ?? item.unit,
              unitCost: Number(product?.costPrice ?? 0),
            }
          : item,
      ),
    );
  };

  const handleBomQtyChange = (rowId: string, value: number) => {
    setBomItems((prev) =>
      prev.map((item) =>
        item.rowId === rowId
          ? {
              ...item,
              standardQty: Math.max(0.01, value || 0),
            }
          : item,
      ),
    );
  };

  const handleBomUnitChange = (rowId: string, unit: string) => {
    setBomItems((prev) => prev.map((item) => (item.rowId === rowId ? { ...item, unit } : item)));
  };

  const handleAddCommissionDraft = () => {
    setCommissionDrafts((prev) => [...prev, createBlankCommissionDraft(formData.name.trim())]);
  };

  const handleAddConfiguredCommissionRule = (rule?: CommissionRule) => {
    const selectedRule =
      rule ?? projectCommissionRules.find((item) => Number(item.id) === Number(selectedCommissionRuleId));
    if (!selectedRule) {
      toast.error('请选择要关联的提成规则');
      return;
    }
    if (commissionDrafts.some((draft) => Number(draft.sourceRuleId) === Number(selectedRule.id))) {
      toast.error('该规则已添加为项目专属规则');
      return;
    }
    setCommissionDrafts((prev) => [...prev, createCommissionDraftFromRule(selectedRule, formData.name.trim())]);
    setSelectedCommissionRuleId('');
  };

  const handleRemoveCommissionDraft = (rowId: string) => {
    const draft = commissionDrafts.find((item) => item.rowId === rowId);
    if (draft?.ruleId) {
      setRemovedCommissionRuleIds((prev) => (prev.includes(draft.ruleId!) ? prev : [...prev, draft.ruleId!]));
    }
    setCommissionDrafts((prev) => prev.filter((item) => item.rowId !== rowId));
  };

  const updateCommissionDraft = <K extends keyof CommissionDraftRule>(
    rowId: string,
    field: K,
    value: CommissionDraftRule[K],
  ) => {
    setCommissionDrafts((prev) => prev.map((item) => (item.rowId === rowId ? { ...item, [field]: value } : item)));
  };

  const toggleCommissionDraftUser = (rowId: string, userId: number) => {
    setCommissionDrafts((prev) =>
      prev.map((item) => {
        if (item.rowId !== rowId) return item;
        const existed = item.userIds.includes(userId);
        return {
          ...item,
          userIds: existed ? item.userIds.filter((id) => id !== userId) : [...item.userIds, userId],
        };
      }),
    );
  };

  const bomTotalCost = bomItems.reduce((total, item) => total + getBomItemCost(item), 0);
  const selectedProjectTypeId = projectTypeList.find((type) => type.name === formData.type)?.id;
  const enabledProjectCommissionRules = projectCommissionRules.filter(
    (rule) => rule.type === 'project' && rule.status === 'active',
  );
  const recommendedCommissionRules = enabledProjectCommissionRules.filter(
    (rule) =>
      isRuleAppliedByDefault(rule, initialProject?.id, selectedProjectTypeId) &&
      !(rule.targetType === 'specific' && Number(rule.targetId) === Number(initialProject?.id)),
  );
  const availableConfiguredCommissionRules = enabledProjectCommissionRules.filter(
    (rule) =>
      !(rule.targetType === 'specific' && Number(rule.targetId) === Number(initialProject?.id)) &&
      !commissionDrafts.some((draft) => Number(draft.sourceRuleId) === Number(rule.id)),
  );
  const commissionDetailCount = commissionDrafts.length;
  const selectedIndustryTemplate = industryTemplates.find(
    (template) => String(template.id) === selectedIndustryTemplateId,
  );
  const industryBomItems = selectedIndustryBomTemplate?.items ?? [];
  const requiresIndustryProductMapping = industryProductMappingMode === 'manual' && industryBomItems.length > 0;
  const industryMappingIncomplete =
    requiresIndustryProductMapping && industryBomItems.some((item) => !industryProductMappings[item.productTemplateId]);
  const industryAdoptDisabled =
    !selectedIndustryTemplate ||
    industryTemplatesLoading ||
    industryBomLoading ||
    isAdoptingIndustryTemplate ||
    industryMappingIncomplete;

  const validateBasicInfo = () => {
    if (!formData.name.trim()) {
      toast.error('项目名称不能为空');
      return false;
    }
    if (!formData.type) {
      toast.error('请选择项目类型');
      return false;
    }
    return true;
  };

  const validateBomInfo = () => {
    if (bomItems.some((item) => !item.productId)) {
      toast.error('BOM 明细中存在未选择商品的行，请补充或删除');
      return false;
    }
    return true;
  };

  const validateCommissionInfo = () => {
    for (const draft of commissionDrafts) {
      if (draft.userIds.length === 0) {
        toast.error('提成配置中存在未选择员工的规则，请补充或删除');
        return false;
      }
      const fixedAmount = draft.fixedAmount === '' ? undefined : Number(draft.fixedAmount);
      if ((fixedAmount === undefined || fixedAmount <= 0) && Number(draft.rate || 0) <= 0) {
        toast.error('提成比例需大于 0，或填写固定提成金额');
        return false;
      }
    }
    return true;
  };

  const handleIndustryProductMappingChange = (productTemplateId: number, productId: string) => {
    setIndustryProductMappings((prev) => ({
      ...prev,
      [productTemplateId]: productId,
    }));
  };

  const handleNextStep = () => {
    if (!validateBasicInfo()) return;
    setCurrentStep('bom');
  };

  const handleNextFromBom = () => {
    if (!validateBasicInfo() || !validateBomInfo()) return;
    setCurrentStep('commission');
  };

  const handleStepClick = (step: DialogStep) => {
    if (step === 'basic') {
      setCurrentStep('basic');
      return;
    }
    if (!validateBasicInfo()) return;
    if (step === 'bom') {
      setCurrentStep('bom');
      return;
    }
    if (!validateBomInfo()) return;
    setCurrentStep('commission');
  };

  const handlePrimaryAction = () => {
    if (currentStep === 'basic') {
      handleNextStep();
      return;
    }
    if (currentStep === 'bom') {
      handleNextFromBom();
      return;
    }
    void handleSubmit();
  };

  const persistCommissionRules = async (project: Project) => {
    for (const ruleId of removedCommissionRuleIds) {
      await deleteCommissionRule(ruleId);
    }
    for (const draft of commissionDrafts) {
      for (const [index, userId] of draft.userIds.entries()) {
        const payload: Partial<CommissionRule> = {
          name: draft.name.trim() || `${project.name} 提成`,
          type: 'project',
          targetType: 'specific',
          targetId: project.id,
          userId,
          rate: Number(draft.rate || 0),
          fixedAmount: draft.fixedAmount === '' ? undefined : Number(draft.fixedAmount),
          calcBase: draft.calcBase,
          priority: Number(draft.priority || 0),
          status: draft.status,
        };
        if (draft.ruleId && index === 0) {
          await updateCommissionRule(draft.ruleId, payload);
        } else {
          await createCommissionRule(payload);
        }
      }
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!validateBasicInfo()) {
      return;
    }
    if (!validateBomInfo() || !validateCommissionInfo()) {
      return;
    }
    const validBomItems = bomItems.filter((item) => item.productId);
    setIsSubmittingForm(true);
    try {
      const payload = {
        name: formData.name,
        type: formData.type || '面部护理',
        description: formData.summary,
        duration: formData.duration || 60,
        price: formData.price,
        storeName: initialProject?.storeName || 'Ami 全量演示门店',
        recommend: formData.isRecommended,
        online: formData.onlineDisplay,
        home: formData.isHomePage,
        status: initialProject?.status ?? true,
        sort: formData.sortOrder,
      };
      const project = initialProject
        ? await updateProject(initialProject.id, payload)
        : await createProject(payload);
      await setProjectBom(
        project.id,
        validBomItems.map((item) => ({
          productId: Number(item.productId),
          standardQty: item.standardQty,
          unit: item.unit || '件',
        })),
      );
      await persistCommissionRules(project);
      toast.success(initialProject ? '项目、BOM 与提成配置更新成功' : '项目、BOM 与提成配置创建成功');
      onClose();
    } catch (err: any) {
      toast.error(err?.message || (initialProject ? '更新项目失败' : '创建项目失败'));
    } finally {
      setIsSubmittingForm(false);
    }
  };

  const handleAdoptIndustryTemplate = async () => {
    if (!selectedIndustryTemplate) {
      toast.error('请选择行业服务项目模板');
      return;
    }
    if (industryMappingIncomplete) {
      toast.error('请先为行业 BOM 中的每个标准品映射本地商品/耗品');
      return;
    }
    setIsAdoptingIndustryTemplate(true);
    try {
      const productMappings = requiresIndustryProductMapping
        ? industryBomItems.map((item) => ({
            productTemplateId: item.productTemplateId,
            productId: Number(industryProductMappings[item.productTemplateId]),
          }))
        : undefined;
      const result = await adoptIndustryServiceTemplateAsProject(selectedIndustryTemplate.id, {
        adoptBom: true,
        createMissingProducts: !requiresIndustryProductMapping,
        productMappings,
      });
      const bomCount = result.project.bom?.length ?? 0;
      toast.success(`已创建项目「${result.project.name}」，同步 ${bomCount} 条 BOM`);
      onClose();
    } catch (err: any) {
      toast.error(err?.message || '采用行业模板失败');
    } finally {
      setIsAdoptingIndustryTemplate(false);
    }
  };

  const handleAIGenerate = () => {
    setIsGenerating(true);

    // 模拟AI生成内容
    setTimeout(() => {
      const aiContent = `
        <h2 style="text-align: center;">🌸 ${formData.name || '美容项目'} - 专业护理体验 🌸</h2>

        <h3>✨ 项目介绍</h3>
        <p>${formData.name || '本项目'}采用先进的美容技术和优质产品，为您提供专业、舒适的护理体验。通过精心设计的护理流程，让您在放松身心的同时，获得显著的美容效果。</p>

        <h3>💎 核心功效</h3>
        <ul>
          <li><strong>深层滋养</strong> - 为肌肤补充充足水分和营养</li>
          <li><strong>提亮肤色</strong> - 改善暗沉，焕发自然光彩</li>
          <li><strong>紧致提升</strong> - 增强肌肤弹性，淡化细纹</li>
          <li><strong>舒缓修护</strong> - 缓解压力，改善肌肤状态</li>
        </ul>

        <h3>👥 适用人群</h3>
        <p>适合希望改善肌肤状态、追求高品质护理体验的所有爱美人士。特别推荐给工作压力大、肌肤缺水、需要深层护理的顾客。</p>

        <h3>💰 特惠价格</h3>
        <p style="text-align: center; font-size: 18px;">
          <span style="text-decoration: line-through; color: #999;">原价 ¥${formData.price > 0 ? formData.price : 'XXX'}</span>
          <strong style="color: #ff4d4f; font-size: 24px;"> 现价 ¥${formData.discountPrice > 0 ? formData.discountPrice : formData.price > 0 ? formData.price : 'XXX'}</strong>
        </p>

        <p style="text-align: center; color: #1890ff;"><em>✨ 限时优惠，欢迎预约体验！✨</em></p>
      `;

      editor?.commands.setContent(aiContent);
      setIsGenerating(false);
    }, 1500);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">{initialProject ? '编辑项目' : '添加项目'}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (currentStep === 'basic') {
                handleNextStep();
                return;
              }
              if (currentStep === 'bom') {
                handleNextFromBom();
                return;
              }
              void handleSubmit();
            }}
            className="space-y-6"
          >
            <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              <button
                type="button"
                onClick={() => handleStepClick('basic')}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  currentStep === 'basic' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:bg-white'
                }`}
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-xs text-blue-600">
                  1
                </span>
                基本信息
              </button>
              <div className="h-px flex-1 bg-gray-200" />
              <button
                type="button"
                onClick={() => handleStepClick('bom')}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  currentStep === 'bom' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:bg-white'
                }`}
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-xs text-blue-600">
                  2
                </span>
                BOM 配置
              </button>
              <div className="h-px flex-1 bg-gray-200" />
              <button
                type="button"
                onClick={() => handleStepClick('commission')}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  currentStep === 'commission' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:bg-white'
                }`}
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-xs text-blue-600">
                  3
                </span>
                提成配置
              </button>
            </div>
            {currentStep === 'basic' && (
              <>
            {!initialProject && (
              <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-blue-900">行业模板快速创建</h3>
                    <p className="mt-1 text-xs text-blue-700">采用后会创建门店项目，并同步行业 BOM 中的本地商品/耗品。</p>
                  </div>
                  <Sparkles className="h-5 w-5 text-blue-500" />
                </div>
                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                  <select
                    value={selectedIndustryTemplateId}
                    onChange={(event) => setSelectedIndustryTemplateId(event.target.value)}
                    disabled={industryTemplatesLoading || isAdoptingIndustryTemplate}
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
                  <button
                    type="button"
                    onClick={handleAdoptIndustryTemplate}
                    disabled={industryAdoptDisabled}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                  >
                    {isAdoptingIndustryTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    采用模板
                  </button>
                </div>
                {selectedIndustryTemplate && (
                  <div className="mt-3 grid gap-3 text-xs text-blue-900 md:grid-cols-4">
                    <div>
                      <div className="text-blue-500">参考售价</div>
                      <div className="mt-1 font-medium">{formatIndustryPriceRange(selectedIndustryTemplate)}</div>
                    </div>
                    <div>
                      <div className="text-blue-500">建议时长</div>
                      <div className="mt-1 font-medium">{formatIndustryDuration(selectedIndustryTemplate)}</div>
                    </div>
                    <div>
                      <div className="text-blue-500">BOM 状态</div>
                      <div className="mt-1 font-medium">
                        {selectedIndustryTemplate.bomTemplates?.length ? '可同步 BOM' : '暂无已发布 BOM'}
                      </div>
                    </div>
                    <div>
                      <div className="text-blue-500">模板版本</div>
                      <div className="mt-1 font-medium">v{selectedIndustryTemplate.version}</div>
                    </div>
                  </div>
                )}
                {selectedIndustryTemplate && (
                  <div className="mt-4 space-y-3 border-t border-blue-100 pt-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs font-medium text-blue-900">
                        {industryBomLoading
                          ? '正在加载 BOM 明细...'
                          : industryBomItems.length
                            ? `BOM 明细 ${industryBomItems.length} 项`
                            : '暂无可同步 BOM 明细'}
                      </div>
                      {industryBomItems.length > 0 && (
                        <div className="inline-flex rounded-lg border border-blue-200 bg-white p-1 text-xs">
                          <button
                            type="button"
                            onClick={() => setIndustryProductMappingMode('auto')}
                            className={`rounded-md px-3 py-1.5 transition-colors ${
                              industryProductMappingMode === 'auto'
                                ? 'bg-blue-600 text-white'
                                : 'text-blue-700 hover:bg-blue-50'
                            }`}
                          >
                            自动创建缺失商品
                          </button>
                          <button
                            type="button"
                            onClick={() => setIndustryProductMappingMode('manual')}
                            className={`rounded-md px-3 py-1.5 transition-colors ${
                              industryProductMappingMode === 'manual'
                                ? 'bg-blue-600 text-white'
                                : 'text-blue-700 hover:bg-blue-50'
                            }`}
                          >
                            映射已有商品
                          </button>
                        </div>
                      )}
                    </div>
                    {industryBomItems.length > 0 && (
                      <div className="overflow-hidden rounded-lg border border-blue-100 bg-white">
                        <div className="grid grid-cols-[1.3fr_0.6fr_0.7fr_1.2fr] gap-3 border-b border-blue-100 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700">
                          <div>标准品/耗品</div>
                          <div>标准用量</div>
                          <div>参考成本</div>
                          <div>本地商品映射</div>
                        </div>
                        {industryBomItems.map((item) => {
                          const productTemplate = item.productTemplate;
                          const referenceCost =
                            productTemplate?.referenceCostMin != null || productTemplate?.referenceCostMax != null
                              ? formatIndustryPriceRange({
                                  referencePriceMin: productTemplate?.referenceCostMin,
                                  referencePriceMax: productTemplate?.referenceCostMax,
                                } as IndustryServiceTemplate)
                              : '未配置';
                          return (
                            <div
                              key={item.id}
                              className="grid grid-cols-[1.3fr_0.6fr_0.7fr_1.2fr] gap-3 border-b border-blue-50 px-3 py-2 text-xs text-gray-700 last:border-b-0"
                            >
                              <div>
                                <div className="font-medium text-gray-900">{productTemplate?.name ?? `标准品 #${item.productTemplateId}`}</div>
                                <div className="mt-0.5 text-gray-500">
                                  {[productTemplate?.category, productTemplate?.recommendedSpec].filter(Boolean).join(' / ') || '未配置规格'}
                                </div>
                              </div>
                              <div className="text-gray-900">
                                {item.standardQty} {item.unit}
                              </div>
                              <div className="text-gray-900">{referenceCost}</div>
                              <div>
                                {industryProductMappingMode === 'manual' ? (
                                  <select
                                    value={industryProductMappings[item.productTemplateId] ?? ''}
                                    onChange={(event) =>
                                      handleIndustryProductMappingChange(item.productTemplateId, event.target.value)
                                    }
                                    disabled={productsLoading || isAdoptingIndustryTemplate}
                                    className="h-9 w-full rounded-lg border border-blue-200 bg-white px-2 text-xs text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-gray-100"
                                  >
                                    <option value="">
                                      {productsLoading ? '正在加载商品...' : '选择本地商品/耗品'}
                                    </option>
                                    {productList.map((product) => (
                                      <option key={product.id} value={product.id}>
                                        {product.name} {product.sku ? `(${product.sku})` : ''}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="inline-flex min-h-9 items-center rounded-lg bg-blue-50 px-2 text-blue-700">
                                    采用时自动创建或复用行业标准品
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {industryMappingIncomplete && (
                      <p className="text-xs text-red-600">手动映射模式下，每个 BOM 标准品都需要选择一个本地商品/耗品。</p>
                    )}
                  </div>
                )}
              </div>
            )}
            {/* Basic Info Grid */}
            <div className="grid grid-cols-2 gap-6">
              {/* Project Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  项目名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="请输入项目名称"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              {/* Project Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  项目类型 <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">请选择项目类型</option>
                  {projectTypeList.map((t) => (
                    <option key={t.id} value={t.name}>{t.name}</option>
                  ))}
                </select>
              </div>

              {/* Duration */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">项目时长（分钟）</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleNumberChange('duration', -5)}
                    className="w-8 h-9 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <Minus className="w-4 h-4 text-gray-600" />
                  </button>
                  <input
                    type="number"
                    min={1}
                    value={formData.duration}
                    onChange={(e) => setFormData(prev => ({ ...prev, duration: Math.max(1, Number(e.target.value) || 1) }))}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center"
                  />
                  <button
                    type="button"
                    onClick={() => handleNumberChange('duration', 5)}
                    className="w-8 h-9 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <Plus className="w-4 h-4 text-gray-600" />
                  </button>
                </div>
              </div>

              {/* Price */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">价格</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleNumberChange('price', -10)}
                    className="w-8 h-9 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <Minus className="w-4 h-4 text-gray-600" />
                  </button>
                  <input
                    type="number"
                    value={formData.price}
                    onChange={(e) => setFormData(prev => ({ ...prev, price: Number(e.target.value) }))}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center"
                  />
                  <button
                    type="button"
                    onClick={() => handleNumberChange('price', 10)}
                    className="w-8 h-9 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <Plus className="w-4 h-4 text-gray-600" />
                  </button>
                </div>
              </div>

              {/* Discount Price */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">优惠价格</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleNumberChange('discountPrice', -10)}
                    className="w-8 h-9 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <Minus className="w-4 h-4 text-gray-600" />
                  </button>
                  <input
                    type="number"
                    value={formData.discountPrice}
                    onChange={(e) => setFormData(prev => ({ ...prev, discountPrice: Number(e.target.value) }))}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center"
                  />
                  <button
                    type="button"
                    onClick={() => handleNumberChange('discountPrice', 10)}
                    className="w-8 h-9 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <Plus className="w-4 h-4 text-gray-600" />
                  </button>
                </div>
              </div>

              {/* Sort Order */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">排序号</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleNumberChange('sortOrder', -1)}
                    className="w-8 h-9 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <Minus className="w-4 h-4 text-gray-600" />
                  </button>
                  <input
                    type="number"
                    value={formData.sortOrder}
                    onChange={(e) => setFormData(prev => ({ ...prev, sortOrder: Number(e.target.value) }))}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center"
                  />
                  <button
                    type="button"
                    onClick={() => handleNumberChange('sortOrder', 1)}
                    className="w-8 h-9 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <Plus className="w-4 h-4 text-gray-600" />
                  </button>
                </div>
              </div>
            </div>

            {/* Checkboxes */}
            <div className="flex items-center gap-8">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.onlineDisplay}
                  onChange={(e) => setFormData(prev => ({ ...prev, onlineDisplay: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">线上展示</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isRecommended}
                  onChange={(e) => setFormData(prev => ({ ...prev, isRecommended: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">是否推荐</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isHomePage}
                  onChange={(e) => setFormData(prev => ({ ...prev, isHomePage: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">是否首页展示</span>
              </label>
            </div>

            {/* Project Summary */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">项目简介</label>
              <textarea
                value={formData.summary}
                onChange={(e) => setFormData(prev => ({ ...prev, summary: e.target.value }))}
                placeholder="请输入项目简介"
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>

            {/* Header Image Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">封面</label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 hover:border-blue-500 transition-colors">
                <input
                  type="file"
                  id="headerImage"
                  accept="image/*"
                  onChange={handleHeaderImageUpload}
                  className="hidden"
                />
                <label
                  htmlFor="headerImage"
                  className="flex flex-col items-center justify-center cursor-pointer"
                >
                  {formData.headerImage ? (
                    <div className="text-center">
                      <div className="mb-2 text-sm text-gray-600">
                        已选择: {formData.headerImage.name}
                      </div>
                      <div className="text-xs text-gray-500">点击重新选择</div>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-10 h-10 text-gray-400 mb-3" />
                      <div className="text-sm text-gray-600 mb-1">点击或拖拽上传图片</div>
                      <div className="text-xs text-gray-500">支持 JPG、PNG 格式</div>
                    </>
                  )}
                </label>
              </div>
            </div>

            {/* Project Details (Rich Text Editor) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">项目详情</label>
                <button
                  type="button"
                  onClick={handleAIGenerate}
                  disabled={isGenerating}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  <Sparkles className="w-4 h-4" />
                  {isGenerating ? '生成中...' : 'AI生成按钮'}
                </button>
              </div>
              <div className="border border-gray-300 rounded-lg overflow-hidden">
                {/* Toolbar */}
                <div className="bg-gray-50 border-b border-gray-300 px-3 py-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => editor?.chain().focus().toggleBold().run()}
                    className={`p-2 rounded hover:bg-gray-200 transition-colors ${
                      editor?.isActive('bold') ? 'bg-gray-300' : ''
                    }`}
                  >
                    <Bold className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => editor?.chain().focus().toggleItalic().run()}
                    className={`p-2 rounded hover:bg-gray-200 transition-colors ${
                      editor?.isActive('italic') ? 'bg-gray-300' : ''
                    }`}
                  >
                    <Italic className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => editor?.chain().focus().toggleUnderline?.().run()}
                    className="p-2 rounded hover:bg-gray-200 transition-colors"
                  >
                    <Underline className="w-4 h-4" />
                  </button>
                  <div className="w-px h-6 bg-gray-300 mx-2" />
                  <button
                    type="button"
                    onClick={() => editor?.chain().focus().setTextAlign('left').run()}
                    className={`p-2 rounded hover:bg-gray-200 transition-colors ${
                      editor?.isActive({ textAlign: 'left' }) ? 'bg-gray-300' : ''
                    }`}
                  >
                    <AlignLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => editor?.chain().focus().setTextAlign('center').run()}
                    className={`p-2 rounded hover:bg-gray-200 transition-colors ${
                      editor?.isActive({ textAlign: 'center' }) ? 'bg-gray-300' : ''
                    }`}
                  >
                    <AlignCenter className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => editor?.chain().focus().setTextAlign('right').run()}
                    className={`p-2 rounded hover:bg-gray-200 transition-colors ${
                      editor?.isActive({ textAlign: 'right' }) ? 'bg-gray-300' : ''
                    }`}
                  >
                    <AlignRight className="w-4 h-4" />
                  </button>
                </div>
                {/* Editor */}
                <EditorContent editor={editor} className="prose max-w-none" />
              </div>
            </div>

            {/* Detail Images Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">详情图</label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 hover:border-blue-500 transition-colors">
                <input
                  type="file"
                  id="detailImages"
                  accept="image/*"
                  multiple
                  onChange={handleDetailImagesUpload}
                  className="hidden"
                />
                <label
                  htmlFor="detailImages"
                  className="flex flex-col items-center justify-center cursor-pointer"
                >
                  <Upload className="w-10 h-10 text-gray-400 mb-3" />
                  <div className="text-sm text-gray-600 mb-1">点击或拖拽上传多张图片</div>
                  <div className="text-xs text-gray-500">支持 JPG、PNG 格式，可选择多张</div>
                </label>
              </div>
              {/* Preview Detail Images */}
              {formData.detailImages.length > 0 && (
                <div className="mt-4 grid grid-cols-4 gap-4">
                  {formData.detailImages.map((file, index) => (
                    <div key={index} className="relative group">
                      <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                        <img
                          src={URL.createObjectURL(file)}
                          alt={`详情图 ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeDetailImage(index)}
                        className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <div className="mt-1 text-xs text-gray-500 text-center truncate">
                        {file.name}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
              </>
            )}

            {currentStep === 'bom' && (
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-base font-semibold text-gray-800">项目标准耗材 BOM</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      配置项目服务时默认消耗的商品/耗材，后续可用于服务消耗、库存扣减和成本核算。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddBomItem}
                    disabled={productsLoading || productList.length === 0}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-medium text-blue-600 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                    添加耗材
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                    <div className="text-xs text-gray-500">BOM 产品数</div>
                    <div className="mt-1 text-lg font-semibold text-gray-900">{bomItems.length}</div>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                    <div className="text-xs text-gray-500">BOM 总成本</div>
                    <div className="mt-1 text-lg font-semibold text-emerald-700">{formatCurrency(bomTotalCost)}</div>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                    <div className="text-xs text-gray-500">成本来源</div>
                    <div className="mt-1 text-sm font-medium text-gray-800">商品档案成本价</div>
                  </div>
                </div>

                {productsLoading && (
                  <div className="flex items-center justify-center rounded-lg border border-gray-200 py-8 text-sm text-gray-500">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin text-blue-500" />
                    正在加载商品耗材...
                  </div>
                )}

                {!productsLoading && productList.length === 0 && (
                  <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
                    暂无可选商品。可先保存项目，待商品资料完善后再维护 BOM。
                  </div>
                )}

                {!productsLoading && productList.length > 0 && bomItems.length === 0 && (
                  <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
                    暂未配置耗材，保存后该项目不会自动扣减库存。
                  </div>
                )}

                {!productsLoading && bomItems.length > 0 && (
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full min-w-[920px] text-sm">
                      <thead className="bg-gray-50 text-left text-gray-600">
                        <tr>
                          <th className="px-4 py-3 font-medium">商品/耗材</th>
                          <th className="px-4 py-3 font-medium">SKU</th>
                          <th className="w-32 px-4 py-3 font-medium">标准用量</th>
                          <th className="w-28 px-4 py-3 font-medium">单位</th>
                          <th className="w-28 px-4 py-3 font-medium">产品单价</th>
                          <th className="w-28 px-4 py-3 font-medium">成本小计</th>
                          <th className="w-16 px-4 py-3 text-right font-medium">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {bomItems.map((item) => (
                          <tr key={item.rowId} className="bg-white">
                            <td className="px-4 py-3">
                              <select
                                value={item.productId}
                                onChange={(event) => handleBomProductChange(item.rowId, event.target.value)}
                                className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                              >
                                <option value="">请选择商品/耗材</option>
                                {productList.map((product) => (
                                  <option key={product.id} value={product.id}>
                                    {product.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-4 py-3 text-gray-600">{item.sku || '-'}</td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={item.standardQty}
                                onChange={(event) => handleBomQtyChange(item.rowId, Number(event.target.value))}
                                className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                value={item.unit}
                                onChange={(event) => handleBomUnitChange(item.rowId, event.target.value)}
                                className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                              />
                            </td>
                            <td className="px-4 py-3 font-medium text-gray-700">{formatCurrency(item.unitCost)}</td>
                            <td className="px-4 py-3 font-semibold text-emerald-700">
                              {formatCurrency(getBomItemCost(item))}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleRemoveBomItem(item.rowId)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-500 hover:bg-red-50"
                                aria-label="删除耗材"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {currentStep === 'commission' && (
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-base font-semibold text-gray-800">项目提成配置</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      提成规则模块中的已启用规则仅作为推荐配置；当前项目可主动引用已配置规则，也可自定义项目专属规则。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddCommissionDraft}
                    disabled={commissionLoading || staffUsers.length === 0}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-medium text-blue-600 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                    自定义提成
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                    <div className="text-xs text-gray-500">推荐规则</div>
                    <div className="mt-1 text-lg font-semibold text-gray-900">{recommendedCommissionRules.length}</div>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                    <div className="text-xs text-gray-500">已选项目规则</div>
                    <div className="mt-1 text-lg font-semibold text-gray-900">{commissionDrafts.length}</div>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                    <div className="text-xs text-gray-500">可选配置规则</div>
                    <div className="mt-1 text-lg font-semibold text-gray-900">{availableConfiguredCommissionRules.length}</div>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                    <label className="flex-1 space-y-1 text-sm">
                      <span className="font-medium text-gray-700">从已配置规则添加</span>
                      <select
                        value={selectedCommissionRuleId}
                        onChange={(event) => setSelectedCommissionRuleId(event.target.value)}
                        disabled={commissionLoading || availableConfiguredCommissionRules.length === 0}
                        className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <option value="">请选择已启用的项目提成规则</option>
                        {availableConfiguredCommissionRules.map((rule) => (
                          <option key={rule.id} value={rule.id}>
                            {rule.name} / {getRuleTargetLabel(rule, projectTypeList)} / {getCommissionUserName(rule)} /{' '}
                            {rule.fixedAmount ? formatCurrency(Number(rule.fixedAmount)) : formatPercent(rule.rate)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleAddConfiguredCommissionRule()}
                        disabled={!selectedCommissionRuleId}
                        className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-medium text-blue-600 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Plus className="h-4 w-4" />
                        引用规则
                      </button>
                      <button
                        type="button"
                        onClick={handleAddCommissionDraft}
                        disabled={commissionLoading || staffUsers.length === 0}
                        className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Plus className="h-4 w-4" />
                        自定义规则
                      </button>
                    </div>
                  </div>
                </div>

                {commissionLoading && (
                  <div className="flex items-center justify-center rounded-lg border border-gray-200 py-8 text-sm text-gray-500">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin text-blue-500" />
                    正在加载提成规则...
                  </div>
                )}

                {!commissionLoading && staffUsers.length === 0 && (
                  <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
                    暂无可选员工。推荐规则仍会展示；如需引用或自定义项目规则，请先在系统管理-用户管理中维护门店员工。
                  </div>
                )}

                {!commissionLoading && recommendedCommissionRules.length > 0 && (
                  <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-gray-800">推荐提成规则</h4>
                      <span className="text-xs text-gray-500">来自【提成规则】模块，仅推荐，添加后才进入当前项目</span>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      {recommendedCommissionRules.map((rule) => {
                        const added = commissionDrafts.some((draft) => Number(draft.sourceRuleId) === Number(rule.id));
                        return (
                          <div key={rule.id} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate font-medium text-gray-800">{rule.name}</div>
                                <div className="mt-1 text-xs text-gray-500">
                                  {getRuleTargetLabel(rule, projectTypeList)} · {getCommissionUserName(rule)} ·{' '}
                                  {rule.fixedAmount ? formatCurrency(Number(rule.fixedAmount)) : formatPercent(rule.rate)}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleAddConfiguredCommissionRule(rule)}
                                disabled={added || staffUsers.length === 0}
                                className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-gray-400"
                              >
                                {added ? '已添加' : '添加'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {!commissionLoading && commissionDetailCount === 0 && (
                  <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
                    当前项目暂未选择提成规则。可从推荐或已配置规则中添加，也可以直接自定义规则。
                  </div>
                )}

                {!commissionLoading && commissionDetailCount > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-gray-800">当前项目已选提成规则明细</h4>
                      <span className="text-xs text-gray-500">已选规则可编辑或删除，推荐规则不会强制使用</span>
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                      <table className="w-full min-w-[1280px] text-sm">
                        <thead className="bg-gray-50 text-left text-gray-600">
                          <tr>
                            <th className="w-28 px-4 py-3 font-medium">来源</th>
                            <th className="w-36 px-4 py-3 font-medium">适用范围</th>
                            <th className="w-64 px-4 py-3 font-medium">适用员工</th>
                            <th className="px-4 py-3 font-medium">规则名称</th>
                            <th className="w-28 px-4 py-3 font-medium">比例</th>
                            <th className="w-28 px-4 py-3 font-medium">固定金额</th>
                            <th className="w-32 px-4 py-3 font-medium">计算基数</th>
                            <th className="w-24 px-4 py-3 font-medium">优先级</th>
                            <th className="w-24 px-4 py-3 font-medium">状态</th>
                            <th className="w-16 px-4 py-3 text-right font-medium">操作</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {commissionDrafts.map((draft) => (
                            <tr key={draft.rowId} className="bg-white">
                              <td className="px-4 py-3">
                                <div className="text-xs font-medium text-blue-700">{getDraftSourceLabel(draft)}</div>
                                {draft.sourceRuleName && (
                                  <div className="mt-1 max-w-[120px] truncate text-xs text-gray-400">{draft.sourceRuleName}</div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-gray-600">指定项目</td>
                              <td className="px-4 py-3">
                                <div className="rounded-lg border border-gray-300 bg-white p-2">
                                  <div
                                    className="mb-2 truncate text-xs text-gray-500"
                                    title={getSelectedStaffNames(draft.userIds, staffUsers)}
                                  >
                                    已选 {draft.userIds.length} 人：{getSelectedStaffNames(draft.userIds, staffUsers)}
                                  </div>
                                  <div className="max-h-28 space-y-1 overflow-y-auto pr-1">
                                    {staffUsers.map((user) => {
                                      const userId = Number(user.id);
                                      return (
                                        <label key={user.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-blue-50">
                                          <input
                                            type="checkbox"
                                            checked={draft.userIds.includes(userId)}
                                            onChange={() => toggleCommissionDraftUser(draft.rowId, userId)}
                                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                          />
                                          <span className="truncate text-sm text-gray-700">{getStaffUserName(user)}</span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  value={draft.name}
                                  onChange={(event) => updateCommissionDraft(draft.rowId, 'name', event.target.value)}
                                  className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.001"
                                  value={draft.rate}
                                  onChange={(event) => updateCommissionDraft(draft.rowId, 'rate', Math.max(0, Number(event.target.value) || 0))}
                                  className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  placeholder="按比例"
                                  value={draft.fixedAmount}
                                  onChange={(event) =>
                                    updateCommissionDraft(
                                      draft.rowId,
                                      'fixedAmount',
                                      event.target.value === '' ? '' : Math.max(0, Number(event.target.value) || 0),
                                    )
                                  }
                                  className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <select
                                  value={draft.calcBase}
                                  onChange={(event) => updateCommissionDraft(draft.rowId, 'calcBase', event.target.value as CommissionCalcBase)}
                                  className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                                >
                                  <option value="total">订单金额</option>
                                  <option value="service_fee">服务金额</option>
                                  <option value="profit">毛利</option>
                                </select>
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="number"
                                  value={draft.priority}
                                  onChange={(event) => updateCommissionDraft(draft.rowId, 'priority', Number(event.target.value) || 0)}
                                  className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <select
                                  value={draft.status}
                                  onChange={(event) => updateCommissionDraft(draft.rowId, 'status', event.target.value as CommissionDraftStatus)}
                                  className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                                >
                                  <option value="active">启用</option>
                                  <option value="disabled">停用</option>
                                </select>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveCommissionDraft(draft.rowId)}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-500 hover:bg-red-50"
                                  aria-label="删除提成规则"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

              </div>
            )}
          </form>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
          >
            取消
          </button>
          {currentStep !== 'basic' && (
            <button
              type="button"
              onClick={() => setCurrentStep(currentStep === 'commission' ? 'bom' : 'basic')}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
            >
              上一步
            </button>
          )}
          <button
            onClick={handlePrimaryAction}
            disabled={isSubmittingForm}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSubmittingForm && <Loader2 className="w-4 h-4 animate-spin" />}
            {currentStep === 'commission' ? '确定' : '下一步'}
          </button>
        </div>
      </div>
    </div>
  );
}
