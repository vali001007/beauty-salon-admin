/* global HTMLCanvasElement, HTMLVideoElement, MediaStream, FileReader */
import { useCallback, useEffect, useState, useMemo, useRef, type ChangeEvent } from 'react';
import { useSearchParams } from 'react-router';
import { Search, Plus, Trash2, Upload, Eye, Loader2, Download, FileDown, Edit2, Camera, Sparkles, RefreshCw } from 'lucide-react';
import { Input, Button, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/UI';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { ImportDialog } from '../components/ImportDialog';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { customerSchema, type CustomerFormData } from '@/schemas/customer';
import {
  getCustomers,
  getCustomersPaginated,
  getCustomerCardPortraits,
  createCustomer,
  updateCustomer,
  importCustomers,
  deleteCustomers,
  getCustomerConsumptionRecordsPaginated,
  getCustomerHealthProfiles,
  getCustomerProfile,
  updateCustomerHealthProfile,
} from '@/api/customer';
import { analyzeSkinPhoto } from '@/api/ai';
import { usePagination } from '@/hooks/usePagination';
import { exportToExcel, downloadTemplate } from '@/utils/excel';
import { toast } from 'sonner';
import type { Customer, CustomerCardPortrait, CustomerCreatePayload, CustomerConsumptionRecord, CustomerHealthProfile, CustomerProfile } from '@/types';
import type { SkinPhotoAnalyzeResult } from '@/types/ai';
import type { ExportColumn } from '@/types/excel';
import { PasswordConfirmDialog } from '../components/PasswordConfirmDialog';
import { useAuthStore } from '@/stores/authStore';
import { useStoreStore } from '@/stores/storeStore';
import { formatScopedValue } from '@/utils/fieldMask';
import { CustomerAppEventTable } from '../components/CustomerAppEventTable';
import { formatBusinessDate } from '@/utils/businessTime';

const CUSTOMER_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'name', header: '客户名称', width: 15 },
  { key: 'storeName', header: '所属门店', width: 20 },
  { key: 'email', header: '邮箱', width: 20 },
  { key: 'phone', header: '手机号码', width: 15 },
  { key: 'landline', header: '座机号', width: 15 },
  { key: 'wechat', header: '微信号', width: 15 },
  { key: 'gender', header: '性别', width: 8 },
  { key: 'maritalStatus', header: '婚姻状态', width: 10 },
  { key: 'birthday', header: '出生日期', width: 12 },
  { key: 'age', header: '年龄', width: 8 },
  { key: 'height', header: '身高(cm)', width: 10 },
  { key: 'weight', header: '体重(kg)', width: 10 },
  { key: 'occupation', header: '职业', width: 12 },
  { key: 'workplace', header: '工作单位', width: 15 },
  { key: 'address', header: '家庭地址', width: 25 },
  { key: 'hasAllergy', header: '过敏史', width: 8 },
  { key: 'hasSurgery', header: '整形或微创', width: 12 },
  { key: 'skinCondition', header: '皮肤状况', width: 15 },
  { key: 'totalSpent', header: '总消费金额', width: 12 },
  { key: 'memberLevel', header: '客户等级', width: 12 },
  { key: 'source', header: '客户来源', width: 10 },
  { key: 'lastVisitDate', header: '最后到店时间', width: 15 },
  { key: 'remark', header: '备注', width: 20 },
];

const CUSTOMER_IMPORT_COLUMNS: ExportColumn[] = [
  { key: 'name', header: '客户名称', width: 15 },
  { key: 'storeName', header: '所属门店', width: 20 },
  { key: 'email', header: '邮箱', width: 20 },
  { key: 'phone', header: '手机号码', width: 15 },
  { key: 'wechat', header: '微信号', width: 15 },
  { key: 'gender', header: '性别', width: 8 },
  { key: 'maritalStatus', header: '婚姻状态', width: 10 },
  { key: 'birthday', header: '出生日期', width: 12 },
  { key: 'age', header: '年龄', width: 8 },
  { key: 'occupation', header: '职业', width: 12 },
  { key: 'workplace', header: '工作单位', width: 15 },
  { key: 'address', header: '家庭地址', width: 25 },
  { key: 'hasAllergy', header: '过敏史', width: 8 },
  { key: 'hasSurgery', header: '整形或微创', width: 12 },
  { key: 'skinCondition', header: '皮肤状况', width: 15 },
  { key: 'memberLevel', header: '客户等级', width: 12 },
  { key: 'source', header: '客户来源', width: 10 },
  { key: 'remark', header: '备注', width: 20 },
];

const CUSTOMER_IMPORT_SAMPLE = [
  { name: '示例客户', storeName: '心悦芸美容养生会所', email: '', phone: '13800138000', wechat: '', gender: '女', maritalStatus: '未知', birthday: '1996-01-01', age: 30, occupation: '', workplace: '', address: '', hasAllergy: '无', hasSurgery: '无', skinCondition: '', memberLevel: '无', source: '门店', remark: '' },
];

const CUSTOMER_DATA_TABS = ['base', 'spend', 'health', 'cards', 'miniapp', 'profile'] as const;
type CustomerDataTab = (typeof CUSTOMER_DATA_TABS)[number];
const CUSTOMER_DATA_TAB_ORDER: CustomerDataTab[] = ['base', 'spend', 'health', 'cards', 'miniapp', 'profile'];

const getCustomerDataTabFromQuery = (tab: string | null): CustomerDataTab =>
  CUSTOMER_DATA_TABS.includes(tab as CustomerDataTab) ? (tab as CustomerDataTab) : 'base';

const formatCurrency = (value?: number | null) =>
  `¥${Number(value ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const getCardStatusLabel = (status?: string) => {
  const key = String(status ?? '');
  if (key === 'active') return '可用';
  if (key === 'expired') return '过期';
  if (key === 'voided' || key === 'cancelled') return '已退卡';
  if (key === 'used_up') return '已用完';
  return key || '-';
};

const getCardStatusClassName = (status?: string) => {
  const key = String(status ?? '');
  if (key === 'active') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (key === 'expired') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (key === 'voided' || key === 'cancelled') return 'border-red-200 bg-red-50 text-red-600';
  return 'border-gray-200 bg-gray-50 text-gray-600';
};

const cleanHealthText = (value?: string | null) => (value && value !== '-' ? value : '');

const formatHealthDate = (value?: string | null) => {
  if (!value || value === '-') return formatBusinessDate(new Date());
  return value.includes('T') ? formatBusinessDate(value) : value;
};

const PROFILE_REASON_TYPE_LABELS: Record<string, string> = {
  churn: '流失风险',
  repurchase: '预约/复购意愿',
  marketing_response: '活动响应',
  response: '活动响应',
  ltv: '预计消费价值',
};

const PROFILE_REASON_IMPACT_LABELS: Record<string, string> = {
  positive: '有利信号',
  negative: '需关注',
  neutral: '参考信号',
};

const localizeProfileTerm = (value?: string | number | null) =>
  String(value ?? '')
    .replace(/\bmarketing_response\b/gi, '活动响应')
    .replace(/\brepurchase\b/gi, '预约/复购意愿')
    .replace(/\bresponse\b/gi, '活动响应')
    .replace(/\bchurn\b/gi, '流失风险')
    .replace(/\bLTV\b/g, '预计消费价值')
    .replace(/\bltv\b/gi, '预计消费价值')
    .replace(/\bpositive\b/gi, '有利信号')
    .replace(/\bnegative\b/gi, '需关注')
    .replace(/\bneutral\b/gi, '参考信号');

const formatProfileReasonTitle = (type?: string, label?: string) => {
  const typeKey = String(type ?? '').trim();
  const title = PROFILE_REASON_TYPE_LABELS[typeKey] ?? localizeProfileTerm(typeKey || '判断依据');
  const rawLabel = localizeProfileTerm(label).trim();
  if (!rawLabel || rawLabel === '-') return title;

  if (typeKey === 'churn' && /^-\d+/.test(rawLabel)) {
    return `${title}：风险降低 ${rawLabel.replace('-', '').replace(/分$/, '')} 分`;
  }
  if (typeKey === 'churn' && /^[+]?\d+/.test(rawLabel)) {
    return `${title}：风险 ${rawLabel.replace('+', '').replace(/分$/, '')} 分`;
  }
  if ((typeKey === 'repurchase' || typeKey === 'marketing_response' || typeKey === 'response') && /^\d+/.test(rawLabel)) {
    return `${title}：${rawLabel.replace(/分$/, '')} 分`;
  }
  return `${title}：${rawLabel}`;
};

const formatProfileReasonImpact = (impact?: string) => {
  const key = String(impact ?? '').trim();
  return PROFILE_REASON_IMPACT_LABELS[key] ?? localizeProfileTerm(key || '参考信号');
};

export function CustomerData() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<CustomerDataTab>(getCustomerDataTabFromQuery(searchParams.get('tab')));
  const fieldScopes = useAuthStore((state) => state.user?.fieldScopes);
  const currentStoreId = useStoreStore((state) => state.currentStoreId);
  const stores = useStoreStore((state) => state.stores);
  const currentStoreName = useMemo(
    () => stores.find((store) => store.id === currentStoreId)?.name,
    [currentStoreId, stores],
  );
  const defaultStoreId = currentStoreId ?? stores[0]?.id;

  const defaultStoreName = currentStoreName ?? stores[0]?.name ?? '心悦美容养生会所';

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [customerNameInput, setCustomerNameInput] = useState('');
  const [customerPhoneInput, setCustomerPhoneInput] = useState('');
  const [customerNameFilter, setCustomerNameFilter] = useState('');
  const [customerPhoneFilter, setCustomerPhoneFilter] = useState('');
  const [showPwdConfirm, setShowPwdConfirm] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<number[]>([]);
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [spendRecords, setSpendRecords] = useState<CustomerConsumptionRecord[]>([]);
  const [healthProfiles, setHealthProfiles] = useState<CustomerHealthProfile[]>([]);
  const [spendLoading, setSpendLoading] = useState(false);
  const [healthLoading, setHealthLoading] = useState(false);
  const [spendError, setSpendError] = useState<string | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [profileCustomerId, setProfileCustomerId] = useState<number | ''>('');
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab(getCustomerDataTabFromQuery(searchParams.get('tab')));
    const customerId = Number(searchParams.get('customerId'));
    if (Number.isFinite(customerId) && customerId > 0) setProfileCustomerId(customerId);
  }, [searchParams]);
  const [insightReloadKey, setInsightReloadKey] = useState(0);

  // Pagination for consumption records
  const [spendPage, setSpendPage] = useState(1);
  const [spendPageSize, setSpendPageSize] = useState(10);
  const [spendSearchInput, setSpendSearchInput] = useState('');
  const [spendSearchKeyword, setSpendSearchKeyword] = useState('');
  const [spendTotal, setSpendTotal] = useState(0);
  const spendData = spendRecords;

  // Pagination for health profiles - merged with all customers
  const [healthPage, setHealthPage] = useState(1);
  const [healthPageSize, setHealthPageSize] = useState(10);
  const [healthSearch, setHealthSearch] = useState('');
  const [healthSkinFilter, setHealthSkinFilter] = useState('');
  const [editingHealth, setEditingHealth] = useState<any>(null);
  const [showHealthEditDialog, setShowHealthEditDialog] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const skinPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const [showSkinAiDialog, setShowSkinAiDialog] = useState(false);
  const [skinAiCustomerId, setSkinAiCustomerId] = useState<number | ''>('');
  const [skinAiCustomerKeyword, setSkinAiCustomerKeyword] = useState('');
  const [skinAiPhoto, setSkinAiPhoto] = useState('');
  const [skinAiResult, setSkinAiResult] = useState<SkinPhotoAnalyzeResult | null>(null);
  const [skinAiCameraError, setSkinAiCameraError] = useState<string | null>(null);
  const [skinAiAnalyzing, setSkinAiAnalyzing] = useState(false);
  const [skinAiSaving, setSkinAiSaving] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    let cancelled = false;

    setHealthLoading(true);
    setHealthError(null);
    setHealthProfiles([]);
    setAllCustomers([]);

    const loadInsights = () => {
      void getCustomerHealthProfiles()
        .then((profiles) => {
          if (!cancelled) {
            setHealthProfiles(profiles);
            setHealthError(null);
          }
        })
        .catch((error) => {
          if (!cancelled) {
            const message = error instanceof Error ? error.message : '肌肤档案加载失败';
            setHealthError(message);
            toast.error(message);
          }
        })
        .finally(() => {
          if (!cancelled) setHealthLoading(false);
        });

      void getCustomers({ storeName: currentStoreName })
        .then((customersData) => {
          if (!cancelled) setAllCustomers(customersData.map((customer) => ({ ...customer, tags: customer.tags || [] })));
        })
        .catch((error) => {
          if (!cancelled) toast.warning(error instanceof Error ? `客户基础信息加载较慢：${error.message}` : '客户基础信息加载较慢');
        });
    };
    void loadInsights();
    return () => {
      cancelled = true;
    };
  }, [currentStoreId, currentStoreName, insightReloadKey]);

  useEffect(() => {
    let cancelled = false;
    setSpendLoading(true);
    setSpendError(null);

    void getCustomerConsumptionRecordsPaginated({
      page: spendPage,
      pageSize: spendPageSize,
      keyword: spendSearchKeyword.trim() || undefined,
    })
      .then((result) => {
        if (!cancelled) {
          setSpendRecords(result.items ?? result.data ?? []);
          setSpendTotal(result.total ?? 0);
          setSpendError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : '消费记录加载失败';
          setSpendError(message);
          setSpendRecords([]);
          setSpendTotal(0);
          toast.error(message);
        }
      })
      .finally(() => {
        if (!cancelled) setSpendLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [spendPage, spendPageSize, spendSearchKeyword, currentStoreId, insightReloadKey]);

  // Build health profile map by customerId
  const healthProfileMap = useMemo(() => {
    const map = new Map<number, any>();
    for (const p of healthProfiles) map.set(p.customerId, p);
    return map;
  }, [healthProfiles]);

  // Merge all customers with health profiles
  const allHealthRows = useMemo(() => {
    if (!allCustomers.length) {
      return healthProfiles.map((hp: any) => ({
        customerId: hp.customerId,
        name: hp.name,
        photo: hp.photo || '',
        skinType: hp.skinType || '-',
        skinStatus: hp.skinStatus || '-',
        mainProblems: hp.mainProblems || '-',
        allergyHistory: hp.allergyHistory || '-',
        goals: hp.goals || '-',
        recommendedCare: hp.recommendedCare || '-',
        instrument: hp.instrument || '-',
        lastCheck: hp.lastCheck || '-',
      }));
    }

    return allCustomers.map((c: any) => {
      const hp = healthProfileMap.get(c.id);
      return {
        customerId: c.id,
        name: c.name,
        photo: hp?.photo || '',
        skinType: hp?.skinType || '-',
        skinStatus: hp?.skinStatus || '-',
        mainProblems: hp?.mainProblems || '-',
        allergyHistory: hp?.allergyHistory || (c.hasAllergy === '有' ? '有' : '-'),
        goals: hp?.goals || '-',
        recommendedCare: hp?.recommendedCare || '-',
        instrument: hp?.instrument || '-',
        lastCheck: hp?.lastCheck || '-',
      };
    });
  }, [allCustomers, healthProfileMap, healthProfiles]);

  const filteredHealthRows = useMemo(() => {
    let rows = allHealthRows;
    if (healthSearch) {
      const kw = healthSearch.toLowerCase();
      rows = rows.filter((r) => r.name.toLowerCase().includes(kw));
    }
    if (healthSkinFilter) {
      rows = rows.filter((r) => r.skinType === healthSkinFilter);
    }
    return rows;
  }, [allHealthRows, healthSearch, healthSkinFilter]);

  const healthTotal = filteredHealthRows.length;
  const healthData = filteredHealthRows.slice((healthPage - 1) * healthPageSize, healthPage * healthPageSize);
  const skinAiCustomerOptions = useMemo(() => {
    const keyword = skinAiCustomerKeyword.trim().toLowerCase();
    return allCustomers
      .filter((customer) => {
        if (!keyword) return true;
        return (
          customer.name.toLowerCase().includes(keyword) ||
          customer.phone.includes(keyword) ||
          customer.storeName?.toLowerCase().includes(keyword)
        );
      })
      .slice(0, 30);
  }, [allCustomers, skinAiCustomerKeyword]);
  const selectedSkinAiCustomer = useMemo(
    () => allCustomers.find((customer) => customer.id === Number(skinAiCustomerId)),
    [allCustomers, skinAiCustomerId],
  );

  useEffect(() => {
    if (!profileCustomerId) {
      setCustomerProfile(null);
      setProfileError(null);
      return;
    }
    let cancelled = false;
    setProfileLoading(true);
    setProfileError(null);
    void getCustomerProfile(Number(profileCustomerId))
      .then((profile) => {
        if (!cancelled) setCustomerProfile(profile);
      })
      .catch((error) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : '客户画像加载失败';
          setProfileError(message);
          setCustomerProfile(null);
        }
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profileCustomerId]);

  const profileReasons = useMemo(() => {
    const reasons = customerProfile?.prediction?.reasonJson;
    return Array.isArray(reasons) ? reasons : [];
  }, [customerProfile]);

  const profileActions = useMemo(() => {
    const value = customerProfile?.prediction?.recommendedActionsJson;
    if (Array.isArray(value)) return value.map((item) => String(item));
    if (typeof value === 'string') return [value];
    if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).map((item) => String(item));
    return [];
  }, [customerProfile]);

  const filters = useMemo(
    () => ({
      storeName: currentStoreName,
      name: customerNameFilter.trim() || undefined,
      phone: customerPhoneFilter.trim() || undefined,
    }),
    [currentStoreName, customerNameFilter, customerPhoneFilter],
  );
  const { data: customers, total, page, pageSize, loading, setPage, setPageSize, refresh } = usePagination<Customer>(getCustomersPaginated, filters);
  const fetchCustomerCardPortraits = useCallback(
    (params: Parameters<typeof getCustomerCardPortraits>[0]) => {
      if (activeTab !== 'cards') {
        return Promise.resolve({
          items: [],
          data: [],
          total: 0,
          page: params.page ?? 1,
          pageSize: params.pageSize ?? 10,
        });
      }
      return getCustomerCardPortraits(params);
    },
    [activeTab],
  );
  const {
    data: cardPortraits,
    total: cardPortraitTotal,
    page: cardPortraitPage,
    pageSize: cardPortraitPageSize,
    loading: cardPortraitLoading,
    error: cardPortraitError,
    setPage: setCardPortraitPage,
    setPageSize: setCardPortraitPageSize,
    refresh: refreshCardPortraits,
  } = usePagination<CustomerCardPortrait>(fetchCustomerCardPortraits, filters);

  const handleCustomerSearch = () => {
    setCustomerNameFilter(customerNameInput.trim());
    setCustomerPhoneFilter(customerPhoneInput.trim());
    setSelectedIds([]);
    setPage(1);
    setCardPortraitPage(1);
  };

  useEffect(() => {
    setSelectedIds([]);
    setPage(1);
    setCardPortraitPage(1);
    setSpendPage(1);
    setHealthPage(1);
  }, [currentStoreId, setCardPortraitPage, setPage]);

  useEffect(() => {
    if (!spendSearchInput.trim() && spendSearchKeyword) {
      setSpendSearchKeyword('');
      setSpendPage(1);
    }
  }, [spendSearchInput, spendSearchKeyword]);

  useEffect(() => {
    if (!customerNameInput.trim() && customerNameFilter) {
      setCustomerNameFilter('');
      setSelectedIds([]);
      setPage(1);
      setCardPortraitPage(1);
    }
    if (!customerPhoneInput.trim() && customerPhoneFilter) {
      setCustomerPhoneFilter('');
      setSelectedIds([]);
      setPage(1);
      setCardPortraitPage(1);
    }
  }, [customerNameInput, customerNameFilter, customerPhoneInput, customerPhoneFilter, setCardPortraitPage, setPage]);

  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
      void videoRef.current.play().catch(() => undefined);
    }
  }, [cameraStream]);

  useEffect(() => {
    return () => {
      cameraStream?.getTracks().forEach((track) => track.stop());
    };
  }, [cameraStream]);

  const { register, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema) as Resolver<CustomerFormData>,
    defaultValues: {
      gender: '女',
      maritalStatus: '未知',
      hasAllergy: '无',
      hasSurgery: '无',
      skinType: '',
      memberLevel: '无',
      source: '',
      tags: [],
    },
  });

  const buildCustomerPayload = (data: CustomerFormData): CustomerCreatePayload => {
    const { storeName: _storeName, ...payload } = data;
    const cleaned = Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== '' && !Number.isNaN(value)),
    ) as Partial<CustomerCreatePayload>;
    return {
      ...cleaned,
      name: data.name,
      gender: data.gender,
      storeId: defaultStoreId,
      phone: data.phone ?? '',
      source: data.source ?? '',
      memberLevel: data.memberLevel ?? '无',
      tags: data.tags ?? [],
    };
  };

  const onSubmit = async (data: CustomerFormData) => {
    try {
      if (!defaultStoreId) {
        toast.error('请先选择或创建门店');
        return;
      }
      const payload = buildCustomerPayload(data);
      if (editingCustomer) {
        await updateCustomer(editingCustomer.id, payload);
        toast.success('客户更新成功');
      } else {
        await createCustomer(payload);
        toast.success('客户创建成功');
      }
      handleCloseDialog();
      refresh();
    } catch (err: any) {
      toast.error(err?.message || (editingCustomer ? '更新客户失败' : '创建客户失败'));
    }
  };

  const handleOpenAdd = () => {
    setEditingCustomer(null);
    reset({
      gender: '女',
      maritalStatus: '未知',
      hasAllergy: '无',
      hasSurgery: '无',
      skinType: '',
      memberLevel: '无',
      source: '',
      tags: [],
      storeName: defaultStoreName,
    });
    setShowAddDialog(true);
  };

  const handleOpenEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    reset({
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      landline: customer.landline,
      wechat: customer.wechat,
      gender: customer.gender,
      maritalStatus: customer.maritalStatus ?? '未知',
      birthday: customer.birthday,
      age: customer.age,
      height: customer.height,
      weight: customer.weight,
      occupation: customer.occupation,
      workplace: customer.workplace,
      address: customer.address,
      hasAllergy: customer.hasAllergy ?? '无',
      hasSurgery: customer.hasSurgery ?? '无',
      skinType: customer.skinType,
      skinCondition: customer.skinCondition,
      totalSpent: customer.totalSpent,
      lastVisitDate: customer.lastVisitDate,
      memberLevel: customer.memberLevel,
      tags: customer.tags,
      source: customer.source,
      storeName: customer.storeName,
      remark: customer.remark,
    });
    setShowAddDialog(true);
  };

  const handleOpenProfile = (customer: Customer) => {
    setProfileCustomerId(customer.id);
    setActiveTab('profile');
  };

  const handleCloseDialog = () => {
    setShowAddDialog(false);
    setEditingCustomer(null);
    reset();
  };

  const handleBatchDelete = () => {
    if (selectedIds.length === 0) return;
    setPendingDeleteIds(selectedIds);
    setShowPwdConfirm(true);
  };

  const handleDeleteOne = (id: number) => {
    setPendingDeleteIds([id]);
    setShowPwdConfirm(true);
  };

  const executeDelete = async () => {
    await deleteCustomers(pendingDeleteIds);
    toast.success(`已删除 ${pendingDeleteIds.length} 条客户`);
    setSelectedIds((prev) => prev.filter((id) => !pendingDeleteIds.includes(id)));
    setPendingDeleteIds([]);
    refresh();
  };

  const toggleSelectAll = () => {
    setSelectedIds(selectedIds.length === customers.length ? [] : customers.map((c) => c.id));
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
  };

  const stopSkinCamera = () => {
    setCameraStream((stream) => {
      stream?.getTracks().forEach((track) => track.stop());
      return null;
    });
  };

  const startSkinCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setSkinAiCameraError('当前浏览器不支持摄像头调用，请上传照片检测。');
      return false;
    }

    try {
      setSkinAiCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 } },
        audio: false,
      });
      setCameraStream(stream);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : '无法访问摄像头';
      setSkinAiCameraError(`摄像头打开失败：${message}`);
      toast.error('摄像头打开失败，请检查浏览器权限或上传照片检测');
      return false;
    }
  };

  const handleOpenSkinAiDialog = () => {
    const firstId = selectedIds[0] ?? filteredHealthRows[0]?.customerId ?? allCustomers[0]?.id ?? '';
    setSkinAiCustomerId(firstId);
    setSkinAiCustomerKeyword('');
    setSkinAiPhoto('');
    setSkinAiResult(null);
    setSkinAiCameraError(null);
    setShowSkinAiDialog(true);
    void startSkinCamera();
  };

  const handleCloseSkinAiDialog = (open: boolean) => {
    setShowSkinAiDialog(open);
    if (!open) {
      stopSkinCamera();
      setSkinAiPhoto('');
      setSkinAiResult(null);
      setSkinAiCameraError(null);
      setSkinAiAnalyzing(false);
      setSkinAiSaving(false);
    }
  };

  const captureSkinPhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) {
      toast.error('摄像头画面未就绪');
      return;
    }
    const width = video.videoWidth || 720;
    const height = video.videoHeight || 540;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(video, 0, 0, width, height);
    setSkinAiPhoto(canvas.toDataURL('image/jpeg', 0.86));
    setSkinAiResult(null);
    toast.success('照片已采集，可以开始 AI 检测');
  };

  const compressSkinPhoto = (dataUrl: string) =>
    new Promise<string>((resolve, reject) => {
      const image = document.createElement('img');
      image.onload = () => {
        const maxSide = 1280;
        const sourceWidth = image.naturalWidth || image.width;
        const sourceHeight = image.naturalHeight || image.height;
        const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
        const width = Math.max(1, Math.round(sourceWidth * scale));
        const height = Math.max(1, Math.round(sourceHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) {
          reject(new Error('无法处理照片'));
          return;
        }
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      image.onerror = () => reject(new Error('照片读取失败'));
      image.src = dataUrl;
    });

  const handleCaptureSkinPhoto = async () => {
    if (!cameraStream) {
      const opened = await startSkinCamera();
      if (opened) {
        toast.info('摄像头已打开，请确认画面后再次点击拍照');
      }
      return;
    }
    captureSkinPhoto();
  };

  const handleUploadSkinPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('请上传 JPG、PNG 等图片文件');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) {
        toast.error('照片读取失败，请重新上传');
        return;
      }
      try {
        const compressed = await compressSkinPhoto(result);
        stopSkinCamera();
        setSkinAiPhoto(compressed);
        setSkinAiResult(null);
        setSkinAiCameraError(null);
        toast.success('照片已上传并压缩，可以开始 AI 检测');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '照片处理失败，请重新上传');
      }
    };
    reader.onerror = () => {
      toast.error('照片读取失败，请重新上传');
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteSkinPhoto = () => {
    setSkinAiPhoto('');
    setSkinAiResult(null);
    setSkinAiCameraError(null);
    if (skinPhotoInputRef.current) {
      skinPhotoInputRef.current.value = '';
    }
  };

  const handleAnalyzeSkinPhoto = async () => {
    if (!skinAiCustomerId || !selectedSkinAiCustomer) {
      toast.error('请先选择要录入档案的客户');
      return;
    }
    if (!skinAiPhoto) {
      toast.error('请先拍照或上传照片');
      return;
    }

    try {
      setSkinAiAnalyzing(true);
      const result = await analyzeSkinPhoto({
        customerId: Number(skinAiCustomerId),
        customerName: selectedSkinAiCustomer.name,
        storeName: currentStoreName,
        imageDataUrl: skinAiPhoto,
        capturedAt: new Date().toISOString(),
      });
      setSkinAiResult(result);
      toast.success('AI 肤质检测完成');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'AI 肤质检测失败');
    } finally {
      setSkinAiAnalyzing(false);
    }
  };

  const applyHealthProfileToState = (
    customerId: number,
    data: Partial<CustomerHealthProfile>,
    customerName?: string,
  ) => {
    setHealthProfiles((prev) => {
      const existing = prev.find((profile) => profile.customerId === customerId);
      const nextProfile: CustomerHealthProfile = {
        id: data.id ?? existing?.id ?? Date.now(),
        customerId,
        name: data.name ?? existing?.name ?? customerName ?? selectedSkinAiCustomer?.name ?? '',
        photo: data.photo ?? existing?.photo ?? '',
        skinType: data.skinType ?? existing?.skinType ?? '未检测',
        skinStatus: data.skinStatus ?? existing?.skinStatus ?? '',
        mainProblems: data.mainProblems ?? existing?.mainProblems ?? '',
        allergyHistory: data.allergyHistory ?? existing?.allergyHistory ?? '',
        goals: data.goals ?? existing?.goals ?? '',
        recommendedCare: data.recommendedCare ?? existing?.recommendedCare ?? '',
        instrument: data.instrument ?? existing?.instrument ?? '',
        lastCheck: formatHealthDate(data.lastCheck ?? existing?.lastCheck),
      };
      return existing
        ? prev.map((profile) => (profile.customerId === customerId ? nextProfile : profile))
        : [nextProfile, ...prev];
    });
  };

  const handleSaveSkinAiResult = async () => {
    if (!skinAiResult || !skinAiCustomerId || !selectedSkinAiCustomer) return;

    try {
      setSkinAiSaving(true);
      const payload = {
        photo: skinAiPhoto,
        skinType: skinAiResult.skinType,
        skinStatus: skinAiResult.skinStatus,
        mainProblems: skinAiResult.mainProblems,
        allergyHistory: skinAiResult.allergyHistory || selectedSkinAiCustomer.hasAllergy || '',
        goals: skinAiResult.goals,
        recommendedCare: skinAiResult.recommendedCare,
        instrument: skinAiResult.instrument,
        lastCheck: formatHealthDate(skinAiResult.capturedAt),
      };
      const saved = await updateCustomerHealthProfile(Number(skinAiCustomerId), payload);
      applyHealthProfileToState(Number(skinAiCustomerId), { ...payload, id: saved.id }, selectedSkinAiCustomer.name);
      toast.success('AI 检测结果已录入肌肤档案');
      handleCloseSkinAiDialog(false);
      setHealthPage(1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '肌肤档案录入失败');
    } finally {
      setSkinAiSaving(false);
    }
  };

  const handleSaveHealthEdit = async () => {
    if (!editingHealth) return;

    try {
      const payload = {
        photo: cleanHealthText(editingHealth.photo),
        skinType: cleanHealthText(editingHealth.skinType) || '未检测',
        skinStatus: cleanHealthText(editingHealth.skinStatus),
        mainProblems: cleanHealthText(editingHealth.mainProblems),
        allergyHistory: cleanHealthText(editingHealth.allergyHistory),
        goals: cleanHealthText(editingHealth.goals),
        recommendedCare: cleanHealthText(editingHealth.recommendedCare),
        instrument: cleanHealthText(editingHealth.instrument),
        lastCheck: formatHealthDate(editingHealth.lastCheck),
      };
      const saved = await updateCustomerHealthProfile(editingHealth.customerId, payload);
      applyHealthProfileToState(editingHealth.customerId, { ...payload, id: saved.id }, editingHealth.name);
      toast.success('肌肤档案已更新');
      setShowHealthEditDialog(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '肌肤档案更新失败');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-gray-800 border-b border-gray-100 pb-4">客户画像数据管理</h1>

      {/* Tabs */}
      <div className="flex gap-8 border-b border-gray-200">
        {[
          { id: 'base', label: '基础信息' },
          { id: 'spend', label: '消费记录' },
          { id: 'health', label: '肌肤档案' },
          { id: 'cards', label: '卡项画像' },
          { id: 'profile', label: '客户画像' },
          { id: 'miniapp', label: '小程序行为' },
        ].sort((left, right) =>
          CUSTOMER_DATA_TAB_ORDER.indexOf(left.id as CustomerDataTab) -
          CUSTOMER_DATA_TAB_ORDER.indexOf(right.id as CustomerDataTab)
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              const nextTab = tab.id as CustomerDataTab;
              setActiveTab(nextTab);
              if (nextTab === 'base') {
                setSearchParams({});
              } else if (nextTab === 'profile' && profileCustomerId) {
                setSearchParams({ tab: nextTab, customerId: String(profileCustomerId) });
              } else {
                setSearchParams({ tab: nextTab });
              }
            }}
            className={`pb-3 px-1 text-sm font-medium transition-colors relative ${
              activeTab === tab.id ? 'text-blue-500' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.id === 'miniapp' ? '小程序行为明细' : tab.label}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-500" />
            )}
          </button>
        ))}
      </div>

      {/* Base Info Tab */}
      {activeTab === 'base' && (
        <>
          {/* Filters */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 whitespace-nowrap">客户名称</label>
              <Input
                placeholder="请输入客户名称"
                className="w-48"
                value={customerNameInput}
                onChange={(event) => setCustomerNameInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleCustomerSearch();
                }}
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 whitespace-nowrap">手机号码</label>
              <Input
                placeholder="请输入手机号码"
                className="w-48"
                value={customerPhoneInput}
                onChange={(event) => setCustomerPhoneInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleCustomerSearch();
                }}
              />
            </div>
            <Button className="gap-2" onClick={handleCustomerSearch}>
              <Search className="w-4 h-4" /> 搜索
            </Button>
            <Button variant="default" className="gap-2 bg-[#1890ff]" onClick={handleOpenAdd}>
              <Plus className="w-4 h-4" /> 新增客户
            </Button>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="danger" className="gap-2 bg-red-400 hover:bg-red-500" disabled={selectedIds.length === 0} onClick={handleBatchDelete}>
              <Trash2 className="w-4 h-4" /> 批量删除
            </Button>
            <Button variant="success" className="gap-2 bg-green-500 hover:bg-green-600" onClick={() => setShowImportDialog(true)}>
              <Upload className="w-4 h-4" /> 批量导入
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => downloadTemplate(CUSTOMER_IMPORT_COLUMNS, '客户导入模板', CUSTOMER_IMPORT_SAMPLE)}>
              <FileDown className="w-4 h-4" /> 下载模板
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => exportToExcel(customers, CUSTOMER_EXPORT_COLUMNS, '客户数据')}>
              <Download className="w-4 h-4" /> 导出
            </Button>
          </div>

          {/* Table */}
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
                <TableHead className="w-12 text-center">
                  <input type="checkbox" className="rounded border-gray-300" checked={selectedIds.length === customers.length && customers.length > 0} onChange={toggleSelectAll} />
                </TableHead>
                <TableHead>客户名称</TableHead>
                <TableHead>所属门店</TableHead>
                <TableHead>年龄</TableHead>
                <TableHead>手机号码</TableHead>
                <TableHead>性别</TableHead>
                <TableHead>会员等级</TableHead>
                <TableHead>累计消费</TableHead>
                <TableHead>客户来源</TableHead>
                <TableHead>最后到店时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => (
                <TableRow key={customer.id} className="hover:bg-blue-50/30">
                  <TableCell className="text-center">
                    <input type="checkbox" className="rounded border-gray-300" checked={selectedIds.includes(customer.id)} onChange={() => toggleSelect(customer.id)} />
                  </TableCell>
                  <TableCell className="font-medium text-gray-700">{customer.name}</TableCell>
                  <TableCell className="min-w-[140px] text-gray-600">{customer.storeName || '-'}</TableCell>
                  <TableCell>{customer.age ?? '-'}</TableCell>
                  <TableCell>{formatScopedValue(customer.phone, fieldScopes?.customerPhone ?? 'visible', 'phone')}</TableCell>
                  <TableCell>{customer.gender}</TableCell>
                  <TableCell>{customer.memberLevel}</TableCell>
                  <TableCell>{fieldScopes?.customerProfit === 'hidden' ? '-' : `¥${customer.totalSpent}`}</TableCell>
                  <TableCell>{customer.source}</TableCell>
                  <TableCell>{customer.lastVisitDate}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-3 text-sm">
                      <button className="flex items-center gap-1 text-emerald-600 hover:text-emerald-700" onClick={() => handleOpenProfile(customer)}>
                        <Sparkles className="w-4 h-4" /> 画像
                      </button>
                      <button className="flex items-center gap-1 text-blue-500 hover:text-blue-600" onClick={() => handleOpenEdit(customer)}>
                        <Eye className="w-4 h-4" /> 编辑
                      </button>
                      <button className="flex items-center gap-1 text-red-400 hover:text-red-500" onClick={() => handleDeleteOne(customer.id)}>
                        <Trash2 className="w-4 h-4" /> 删除
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          )}

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
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
        </>
      )}

      {/* Consumption Records Tab */}
      {activeTab === 'spend' && (
        <>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 whitespace-nowrap">用户名称</label>
              <Input
                placeholder="请输入用户名称"
                className="w-48"
                value={spendSearchInput}
                onChange={(event) => setSpendSearchInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    setSpendSearchKeyword(spendSearchInput);
                    setSpendPage(1);
                  }
                }}
              />
            </div>
            <Button
              className="gap-2"
              onClick={() => {
                setSpendSearchKeyword(spendSearchInput);
                setSpendPage(1);
              }}
            >
              <Search className="w-4 h-4" /> 搜索
            </Button>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="danger" className="gap-2 bg-red-400 hover:bg-red-500">
              <Trash2 className="w-4 h-4" /> 批量删除
            </Button>
            <Button variant="success" className="gap-2 bg-green-500 hover:bg-green-600">
              <Upload className="w-4 h-4" /> 批量导入
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => downloadTemplate(
              [{ key: 'userName', header: '用户名称', width: 15 }, { key: 'consumeType', header: '消费类型', width: 12 }, { key: 'consumeContent', header: '消费内容', width: 20 }, { key: 'payMethod', header: '支付方式', width: 10 }, { key: 'amount', header: '消费金额', width: 12 }, { key: 'campaign', header: '关联营销活动', width: 15 }, { key: 'consumeTime', header: '消费时间', width: 18 }],
              '消费记录导入模板',
              [{ userName: '张小美', consumeType: '服务消费', consumeContent: '深层清洁护理', payMethod: '微信支付', amount: '¥588.00', campaign: '春季活动', consumeTime: '2024-03-15 14:30' }]
            )}>
              <FileDown className="w-4 h-4" /> 下载模板
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => exportToExcel(
              spendRecords,
              [{ key: 'userName', header: '用户名称', width: 15 }, { key: 'consumeType', header: '消费类型', width: 12 }, { key: 'consumeContent', header: '消费内容', width: 20 }, { key: 'payMethod', header: '支付方式', width: 10 }, { key: 'amount', header: '消费金额', width: 12 }, { key: 'campaign', header: '关联营销活动', width: 15 }, { key: 'consumeTime', header: '消费时间', width: 18 }],
              '消费记录'
            )}>
              <Download className="w-4 h-4" /> 导出
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/80">
                <TableHead className="w-12 text-center">
                  <input type="checkbox" className="rounded border-gray-300" />
                </TableHead>
                <TableHead>用户名称</TableHead>
                <TableHead>消费类型</TableHead>
                <TableHead>消费内容</TableHead>
                <TableHead>支付方式</TableHead>
                <TableHead>消费金额</TableHead>
                <TableHead>关联营销活动</TableHead>
                <TableHead>消费时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {spendLoading && spendData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-gray-500">
                    正在加载消费记录...
                  </TableCell>
                </TableRow>
              ) : spendError ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center">
                    <div className="flex flex-col items-center gap-3 text-gray-500">
                      <span>消费记录加载失败：{spendError}</span>
                      <Button variant="outline" size="sm" onClick={() => setInsightReloadKey((key) => key + 1)}>
                        重试加载
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : spendData.length ? spendData.map((record: any) => (
                <TableRow key={record.id} className="hover:bg-blue-50/30">
                  <TableCell className="text-center">
                    <input type="checkbox" className="rounded border-gray-300" />
                  </TableCell>
                  <TableCell className="font-medium text-gray-700">{record.userName}</TableCell>
                  <TableCell>{record.consumeType}</TableCell>
                  <TableCell>{record.consumeContent}</TableCell>
                  <TableCell>{record.payMethod}</TableCell>
                  <TableCell className="font-medium text-gray-800">{record.amount}</TableCell>
                  <TableCell>{record.campaign}</TableCell>
                  <TableCell>{record.consumeTime}</TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-gray-500">
                    {spendSearchKeyword ? '没有匹配的消费记录' : '暂无消费记录'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <div className="text-sm text-gray-600">共 {spendTotal} 条</div>
            <div className="flex items-center gap-2">
              <select value={spendPageSize} onChange={(e) => { setSpendPageSize(Number(e.target.value)); setSpendPage(1); }} className="h-8 px-2 text-sm border border-gray-300 rounded">
                <option value={10}>10条/页</option>
                <option value={20}>20条/页</option>
                <option value={50}>50条/页</option>
              </select>
              <Button variant="outline" size="sm" disabled={spendPage <= 1} onClick={() => setSpendPage(spendPage - 1)}>上一页</Button>
              <span className="text-sm text-gray-600">{spendPage} / {Math.ceil(spendTotal / spendPageSize) || 1}</span>
              <Button variant="outline" size="sm" disabled={spendPage >= Math.ceil(spendTotal / spendPageSize)} onClick={() => setSpendPage(spendPage + 1)}>下一页</Button>
            </div>
          </div>
        </>
      )}

      {/* Health Profile Tab */}
      {activeTab === 'health' && (
        <>
          {/* Search & Filter */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 whitespace-nowrap">用户姓名</label>
              <Input placeholder="请输入用户姓名" className="w-48" value={healthSearch} onChange={(e) => { setHealthSearch(e.target.value); setHealthPage(1); }} />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 whitespace-nowrap">肌肤类型</label>
              <select className="h-9 w-36 px-3 text-sm border border-gray-300 rounded-md" value={healthSkinFilter} onChange={(e) => { setHealthSkinFilter(e.target.value); setHealthPage(1); }}>
                <option value="">全部</option>
                <option value="干性">干性</option>
                <option value="油性">油性</option>
                <option value="混干">混干</option>
                <option value="混油">混油</option>
                <option value="中性">中性</option>
                <option value="敏感">敏感</option>
                <option value="-">未检测</option>
              </select>
            </div>
            <Button className="gap-2" onClick={() => setHealthPage(1)}>
              <Search className="w-4 h-4" /> 搜索
            </Button>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="danger" className="gap-2 bg-red-400 hover:bg-red-500">
              <Trash2 className="w-4 h-4" /> 批量删除
            </Button>
            <Button className="gap-2 bg-[#1890ff] hover:bg-[#1677d2]" onClick={handleOpenSkinAiDialog}>
              <Camera className="w-4 h-4" /> AI肤质检测
            </Button>
            <Button variant="success" className="gap-2 bg-green-500 hover:bg-green-600">
              <Upload className="w-4 h-4" /> 批量导入
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => downloadTemplate(
              [{ key: 'name', header: '用户姓名', width: 15 }, { key: 'skinType', header: '肌肤类型', width: 10 }, { key: 'skinStatus', header: '肌肤状态', width: 15 }, { key: 'mainProblems', header: '主要问题', width: 20 }, { key: 'allergyHistory', header: '过敏史', width: 10 }, { key: 'goals', header: '改善目标', width: 15 }, { key: 'recommendedCare', header: '推荐护理', width: 15 }, { key: 'instrument', header: '检测仪器', width: 15 }, { key: 'lastCheck', header: '最近检查时间', width: 15 }],
              '肌肤档案导入模板',
              [{ name: '张小美', skinType: '混干', skinStatus: '皮肤薄', mainProblems: 'T区出油', allergyHistory: '没有', goals: '补水保湿', recommendedCare: '补水保湿', instrument: '面部皮肤检测器', lastCheck: '2025-05-09' }]
            )}>
              <FileDown className="w-4 h-4" /> 下载模板
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => exportToExcel(
              filteredHealthRows,
              [{ key: 'name', header: '用户姓名', width: 15 }, { key: 'skinType', header: '肌肤类型', width: 10 }, { key: 'skinStatus', header: '肌肤状态', width: 15 }, { key: 'mainProblems', header: '主要问题', width: 20 }, { key: 'allergyHistory', header: '过敏史', width: 10 }, { key: 'goals', header: '改善目标', width: 15 }, { key: 'recommendedCare', header: '推荐护理', width: 15 }, { key: 'instrument', header: '检测仪器', width: 15 }, { key: 'lastCheck', header: '最近检查时间', width: 15 }],
              '肌肤档案'
            )}>
              <Download className="w-4 h-4" /> 导出
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/80">
                <TableHead className="w-12 text-center"><input type="checkbox" className="rounded border-gray-300" /></TableHead>
                <TableHead>用户姓名</TableHead>
                <TableHead>肌肤类型</TableHead>
                <TableHead>肌肤状态</TableHead>
                <TableHead>主要问题</TableHead>
                <TableHead>过敏史</TableHead>
                <TableHead>改善目标</TableHead>
                <TableHead>推荐护理</TableHead>
                <TableHead>检测仪器</TableHead>
                <TableHead>最近检查时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {healthLoading && healthData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="py-10 text-center text-gray-500">
                    正在加载肌肤档案...
                  </TableCell>
                </TableRow>
              ) : healthError ? (
                <TableRow>
                  <TableCell colSpan={11} className="py-10 text-center">
                    <div className="flex flex-col items-center gap-3 text-gray-500">
                      <span>肌肤档案加载失败：{healthError}</span>
                      <Button variant="outline" size="sm" onClick={() => setInsightReloadKey((key) => key + 1)}>
                        重试加载
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : healthData.length ? healthData.map((row: any) => (
                <TableRow key={row.customerId} className="hover:bg-blue-50/30">
                  <TableCell className="text-center"><input type="checkbox" className="rounded border-gray-300" /></TableCell>
                  <TableCell className="font-medium text-gray-700">{row.name}</TableCell>
                  <TableCell><span className={row.skinType === '-' ? 'text-gray-400' : 'text-gray-700'}>{row.skinType}</span></TableCell>
                  <TableCell><span className={row.skinStatus === '-' ? 'text-gray-400' : 'text-gray-700'}>{row.skinStatus}</span></TableCell>
                  <TableCell className="max-w-[120px] truncate"><span className={row.mainProblems === '-' ? 'text-gray-400' : 'text-gray-700'}>{row.mainProblems}</span></TableCell>
                  <TableCell><span className={row.allergyHistory === '-' ? 'text-gray-400' : 'text-gray-700'}>{row.allergyHistory}</span></TableCell>
                  <TableCell><span className={row.goals === '-' ? 'text-gray-400' : 'text-gray-700'}>{row.goals}</span></TableCell>
                  <TableCell><span className={row.recommendedCare === '-' ? 'text-gray-400' : 'text-gray-700'}>{row.recommendedCare}</span></TableCell>
                  <TableCell><span className={row.instrument === '-' ? 'text-gray-400' : 'text-gray-700'}>{row.instrument}</span></TableCell>
                  <TableCell><span className={row.lastCheck === '-' ? 'text-gray-400' : 'text-gray-700'}>{row.lastCheck}</span></TableCell>
                  <TableCell className="text-right">
                    <button className="flex items-center gap-1 text-blue-500 hover:text-blue-600 text-sm" onClick={() => { setEditingHealth(row); setShowHealthEditDialog(true); }}>
                      <Edit2 className="w-4 h-4" /> 编辑
                    </button>
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={11} className="py-10 text-center text-gray-500">
                    暂无肌肤档案
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <div className="text-sm text-gray-600">共 {healthTotal} 条</div>
            <div className="flex items-center gap-2">
              <select value={healthPageSize} onChange={(e) => { setHealthPageSize(Number(e.target.value)); setHealthPage(1); }} className="h-8 px-2 text-sm border border-gray-300 rounded">
                <option value={10}>10条/页</option>
                <option value={20}>20条/页</option>
                <option value={50}>50条/页</option>
              </select>
              <Button variant="outline" size="sm" disabled={healthPage <= 1} onClick={() => setHealthPage(healthPage - 1)}>上一页</Button>
              <span className="text-sm text-gray-600">{healthPage} / {Math.ceil(healthTotal / healthPageSize) || 1}</span>
              <Button variant="outline" size="sm" disabled={healthPage >= Math.ceil(healthTotal / healthPageSize)} onClick={() => setHealthPage(healthPage + 1)}>下一页</Button>
            </div>
          </div>
        </>
      )}

      {activeTab === 'cards' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 whitespace-nowrap">客户名称</label>
              <Input
                placeholder="请输入客户名称"
                className="w-48"
                value={customerNameInput}
                onChange={(event) => setCustomerNameInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleCustomerSearch();
                }}
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 whitespace-nowrap">手机号码</label>
              <Input
                placeholder="请输入手机号码"
                className="w-48"
                value={customerPhoneInput}
                onChange={(event) => setCustomerPhoneInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleCustomerSearch();
                }}
              />
            </div>
            <Button className="gap-2" onClick={handleCustomerSearch}>
              <Search className="w-4 h-4" /> 搜索
            </Button>
            <Button variant="outline" className="gap-2" onClick={refreshCardPortraits}>
              <RefreshCw className={`w-4 h-4 ${cardPortraitLoading ? 'animate-spin' : ''}`} /> 刷新
            </Button>
          </div>

          <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-4 py-3 text-sm text-emerald-800">
            卡项画像按客户展示已购次卡和当前门店可售但未购卡项，用于卡项插秧、复购推荐和权益补齐。
          </div>

          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/80">
                <TableHead className="min-w-[170px]">客户</TableHead>
                <TableHead className="min-w-[260px]">已购卡项</TableHead>
                <TableHead className="min-w-[260px]">未购卡项</TableHead>
                <TableHead className="min-w-[180px]">插秧建议</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cardPortraitLoading && cardPortraits.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-gray-500">
                    正在加载卡项画像...
                  </TableCell>
                </TableRow>
              ) : cardPortraitError ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center">
                    <div className="flex flex-col items-center gap-3 text-gray-500">
                      <span>卡项画像加载失败：{cardPortraitError}</span>
                      <Button variant="outline" size="sm" onClick={refreshCardPortraits}>
                        重试加载
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : cardPortraits.length ? cardPortraits.map((row) => {
                const activeCards = row.purchasedCards.filter((card) => card.status === 'active');
                const lowRemainingCards = activeCards.filter((card) => card.remainingTimes <= Math.max(1, Math.ceil(card.totalTimes * 0.2)));
                return (
                  <TableRow key={row.customerId} className="align-top hover:bg-blue-50/30">
                    <TableCell>
                      <div className="font-medium text-gray-800">{row.customerName}</div>
                      <div className="mt-1 text-xs text-gray-500">{formatScopedValue(row.customerPhone, fieldScopes?.customerPhone ?? 'visible', 'phone')}</div>
                      <div className="mt-1 text-xs text-gray-500">{row.storeName || '-'}</div>
                    </TableCell>
                    <TableCell>
                      {row.purchasedCards.length ? (
                        <div className="space-y-2">
                          {row.purchasedCards.slice(0, 4).map((card) => (
                            <div key={card.customerCardId} className="rounded-lg border border-gray-100 bg-white p-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-gray-800">{card.cardName}</span>
                                <span className={`rounded-full border px-2 py-0.5 text-xs ${getCardStatusClassName(card.status)}`}>
                                  {getCardStatusLabel(card.status)}
                                </span>
                              </div>
                              <div className="mt-1 text-xs text-gray-500">
                                剩余 {card.remainingTimes}/{card.totalTimes} 次；实收 {formatCurrency(card.paidAmount)}
                              </div>
                              <div className="mt-1 text-xs text-gray-400">到期 {card.expireTime || '-'}</div>
                            </div>
                          ))}
                          {row.purchasedCards.length > 4 && (
                            <div className="text-xs text-gray-500">另有 {row.purchasedCards.length - 4} 张已购卡项</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">暂无已购卡项</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.missingCards.length ? (
                        <div className="flex flex-wrap gap-2">
                          {row.missingCards.slice(0, 8).map((card) => (
                            <span key={card.cardId} className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs text-amber-700">
                              {card.cardName} · {card.totalTimes}次 · {formatCurrency(card.price)}
                            </span>
                          ))}
                          {row.missingCards.length > 8 && (
                            <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-500">
                              +{row.missingCards.length - 8}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-emerald-600">当前可售卡项已覆盖</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 text-sm">
                        <div className="font-medium text-gray-800">
                          已购 {row.purchasedCount}，未购 {row.missingCount}
                        </div>
                        {lowRemainingCards.length ? (
                          <div className="text-amber-700">优先跟进：{lowRemainingCards.map((card) => card.cardName).slice(0, 2).join('、')} 剩余次数偏低</div>
                        ) : row.missingCards.length ? (
                          <div className="text-emerald-700">可推荐：{row.missingCards.slice(0, 2).map((card) => card.cardName).join('、')}</div>
                        ) : (
                          <div className="text-gray-500">维持权益服务和核销提醒</div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              }) : (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-gray-500">
                    暂无客户卡项画像
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <div className="text-sm text-gray-600">共 {cardPortraitTotal} 条</div>
            <div className="flex items-center gap-2">
              <select value={cardPortraitPageSize} onChange={(e) => setCardPortraitPageSize(Number(e.target.value))} className="h-8 px-2 text-sm border border-gray-300 rounded">
                <option value={10}>10条/页</option>
                <option value={20}>20条/页</option>
                <option value={50}>50条/页</option>
              </select>
              <Button variant="outline" size="sm" disabled={cardPortraitPage <= 1} onClick={() => setCardPortraitPage(cardPortraitPage - 1)}>上一页</Button>
              <span className="text-sm text-gray-600">{cardPortraitPage} / {Math.ceil(cardPortraitTotal / cardPortraitPageSize) || 1}</span>
              <Button variant="outline" size="sm" disabled={cardPortraitPage >= Math.ceil(cardPortraitTotal / cardPortraitPageSize)} onClick={() => setCardPortraitPage(cardPortraitPage + 1)}>下一页</Button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'miniapp' && (
        <CustomerAppEventTable
          mode="customerDetail"
          defaultFilters={{ storeId: currentStoreId }}
          initialKeyword={searchParams.get('keyword') ?? ''}
          exportFileName="小程序行为明细"
        />
      )}

      {activeTab === 'profile' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
            <div>
              <div className="text-sm font-semibold text-emerald-900">客户画像与预测</div>
              <div className="text-xs text-emerald-700">统一读取健康档案、消费、卡项、预测快照、触达和推荐反馈。</div>
            </div>
            <select
              className="ml-auto h-9 min-w-[220px] rounded-md border border-emerald-200 bg-white px-3 text-sm"
              value={profileCustomerId}
              onChange={(event) => {
                const nextCustomerId = event.target.value ? Number(event.target.value) : '';
                setProfileCustomerId(nextCustomerId);
                if (nextCustomerId) {
                  setSearchParams({ tab: 'profile', customerId: String(nextCustomerId) });
                } else {
                  setSearchParams({ tab: 'profile' });
                }
              }}
            >
              <option value="">选择客户</option>
              {allCustomers.map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.name} {customer.phone ? `(${customer.phone})` : ''}</option>
              ))}
            </select>
          </div>

          {profileLoading && (
            <div className="flex items-center justify-center rounded-xl border border-gray-100 bg-white py-12">
              <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
              <span className="ml-2 text-sm text-gray-500">画像加载中...</span>
            </div>
          )}

          {!profileLoading && profileError && (
            <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">{profileError}</div>
          )}

          {!profileLoading && !customerProfile && !profileError && (
            <div className="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
              请选择一个客户查看画像、预测分和推荐闭环数据。
            </div>
          )}

          {!profileLoading && customerProfile && (
            <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-5">
                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">{customerProfile.basic.name}</h2>
                      <p className="mt-1 text-sm text-gray-500">
                        {customerProfile.basic.memberLevel || '普通客户'} · 到店 {customerProfile.basic.visitCount} 次 · 累计 ¥{Number(customerProfile.basic.totalSpent ?? 0).toLocaleString()}
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                      {customerProfile.prediction?.ltvTier ?? '暂无预测'}
                    </span>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      { label: '流失风险', value: customerProfile.prediction?.churnScore ?? 0, hint: customerProfile.prediction?.churnLevel ?? '-' },
                      { label: '近期预约/复购意愿', value: customerProfile.prediction?.repurchase30dScore ?? 0, hint: '适合护理周期提醒' },
                      { label: '活动响应', value: customerProfile.prediction?.marketingResponseScore ?? 0, hint: '参与活动可能性' },
                      {
                        label: '半年预计消费',
                        value: Math.min(100, Math.round(Number(customerProfile.prediction?.ltv6m ?? 0) / 100)),
                        displayValue: `¥${Number(customerProfile.prediction?.ltv6m ?? 0).toLocaleString()}`,
                        hint: '预计金额',
                      },
                    ].map((item) => (
                      <div key={item.label} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                        <div className="flex items-center justify-between text-xs text-gray-500"><span>{item.label}</span><span>{item.hint}</span></div>
                        <div className="mt-2 h-2 rounded-full bg-gray-200">
                          <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${Math.min(100, Math.max(0, Number(item.value)))}%` }} />
                        </div>
                        <div className="mt-2 text-xl font-semibold text-gray-900">{item.displayValue ?? item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-900">预测原因</h3>
                  <div className="mt-3 space-y-3">
                    {profileReasons.length ? profileReasons.map((reason, index) => (
                      <div key={`${reason.type ?? 'reason'}-${index}`} className="rounded-xl bg-gray-50 p-3">
                        <div className="flex items-center justify-between text-sm font-medium text-gray-800">
                          <span>{formatProfileReasonTitle(reason.type, reason.label)}</span>
                          <span className="text-xs text-gray-500">{formatProfileReasonImpact(reason.impact)}</span>
                        </div>
                        <p className="mt-1 text-sm text-gray-600">{localizeProfileTerm(reason.detail ?? '-')}</p>
                      </div>
                    )) : <div className="text-sm text-gray-500">暂无预测原因，需先运行营销预测。</div>}
                  </div>
                </div>

                <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">生命周期与下一步机会</h3>
                      <p className="mt-1 text-xs text-gray-500">来自客户全生命周期服务营销小本体，当前只生成建议和草稿。</p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                      {customerProfile.lifecycle?.snapshot?.lifecycleStageLabel ?? '待计算'}
                    </span>
                  </div>
                  {customerProfile.lifecycle ? (
                    <div className="mt-4 space-y-4">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl bg-emerald-50 p-3">
                          <div className="text-xs text-emerald-700">LTV层级</div>
                          <div className="mt-1 text-lg font-semibold text-emerald-900">{customerProfile.lifecycle.snapshot?.ltvTier ?? '-'}</div>
                        </div>
                        <div className="rounded-xl bg-amber-50 p-3">
                          <div className="text-xs text-amber-700">流失风险</div>
                          <div className="mt-1 text-lg font-semibold text-amber-900">{customerProfile.lifecycle.snapshot?.churnRiskLevel ?? '-'}</div>
                        </div>
                        <div className="rounded-xl bg-blue-50 p-3">
                          <div className="text-xs text-blue-700">触达疲劳</div>
                          <div className="mt-1 text-lg font-semibold text-blue-900">{Math.round((customerProfile.lifecycle.snapshot?.touchFatigueScore ?? 0) * 100)}%</div>
                        </div>
                      </div>
                      <div>
                        <div className="mb-2 text-xs font-medium text-gray-500">服务周期与承接状态</div>
                        <div className="space-y-2">
                          {customerProfile.lifecycle.serviceCycles?.length ? customerProfile.lifecycle.serviceCycles.slice(0, 3).map((cycle) => (
                            <div key={cycle.id} className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                              <div className="font-medium">项目 #{cycle.projectId ?? '-'} · {cycle.cycleDays} 天周期</div>
                              <div className="mt-1 text-xs text-emerald-700">上次服务 {cycle.lastServiceAt?.slice(0, 10) ?? '-'}，下次建议 {cycle.nextDueAt?.slice(0, 10) ?? '-'}</div>
                            </div>
                          )) : <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">暂无服务周期，需有项目服务、划卡或预约记录后生成。</div>}
                          {customerProfile.lifecycle.opportunities?.some((item) => item.fulfillment) ? (
                            <div className="flex flex-wrap gap-2 text-xs">
                              {customerProfile.lifecycle.opportunities.filter((item) => item.fulfillment).slice(0, 3).map((opportunity) => (
                                <span key={`fulfillment-${opportunity.id}`} className={`rounded-full px-3 py-1 font-medium ${opportunity.fulfillment?.inventoryReady && opportunity.fulfillment?.capacityReady ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                  {opportunity.opportunityTypeLabel} · 库存{opportunity.fulfillment?.inventoryReady ? '可承接' : '有风险'} · 产能{opportunity.fulfillment?.capacityReady ? '可承接' : '有风险'}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div>
                        <div className="mb-2 text-xs font-medium text-gray-500">当前机会</div>
                        <div className="flex flex-wrap gap-2">
                          {customerProfile.lifecycle.opportunities.length ? customerProfile.lifecycle.opportunities.map((opportunity) => (
                            <span key={opportunity.id} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                              {opportunity.opportunityTypeLabel} · {opportunity.priority} · {opportunity.score}分
                            </span>
                          )) : <span className="text-sm text-gray-500">暂无下一步机会</span>}
                        </div>
                      </div>
                      <div>
                        <div className="mb-2 text-xs font-medium text-gray-500">关键证据</div>
                        <div className="space-y-1 text-sm text-gray-600">
                          {customerProfile.lifecycle.snapshot?.evidence.length ? customerProfile.lifecycle.snapshot.evidence.slice(0, 4).map((item, index) => (
                            <div key={`${item}-${index}`} className="rounded-lg bg-gray-50 px-3 py-2">{item}</div>
                          )) : <div className="text-gray-500">暂无生命周期证据</div>}
                        </div>
                      </div>
                      <div>
                        <div className="mb-2 text-xs font-medium text-gray-500">归因事件</div>
                        <div className="space-y-1 text-sm text-gray-600">
                          {customerProfile.lifecycle.attributionEvents?.length ? customerProfile.lifecycle.attributionEvents.slice(0, 4).map((event) => (
                            <div key={event.id} className="rounded-lg bg-gray-50 px-3 py-2">
                              {event.eventType} · {event.sourceType} · {event.occurredAt?.slice(0, 16).replace('T', ' ') ?? '-'}
                            </div>
                          )) : <div className="text-gray-500">暂无归因事件，触达、预约、核销或订单产生后会沉淀证据链。</div>}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
                      暂无生命周期证据，运行营销预测或重建生命周期小本体后会自动生成。
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-5">
                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-900">推荐动作</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {profileActions.length ? profileActions.map((action, index) => (
                      <span key={`${action}-${index}`} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">{action}</span>
                    )) : <span className="text-sm text-gray-500">暂无推荐动作</span>}
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-900">健康与消费摘要</h3>
                  <div className="mt-3 space-y-2 text-sm text-gray-600">
                    <div>肤质：{customerProfile.health?.skinType ?? customerProfile.basic.skinType ?? '-'}</div>
                    <div>诉求：{customerProfile.health?.goals ?? customerProfile.health?.mainProblems ?? '-'}</div>
                    <div>最近到店：{customerProfile.consumption.lastVisitDays ?? '-'} 天前</div>
                    <div>客单均值：¥{Number(customerProfile.consumption.avgSpentPerVisit ?? 0).toLocaleString()}</div>
                    <div>有效卡项：{customerProfile.cards.activeCards.length} 张，到期预警 {customerProfile.cards.expiringCards.length} 张</div>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-900">触达与反馈</h3>
                  <div className="mt-3 space-y-3 text-sm text-gray-600">
                    <div>
                      <div className="mb-1 font-medium text-gray-800">最近营销触达</div>
                      {customerProfile.touchHistory.length ? customerProfile.touchHistory.slice(0, 3).map((touch: any) => (
                        <div key={touch.id} className="rounded-lg bg-gray-50 px-3 py-2">{touch.channel ?? 'channel'} · {touch.status ?? '-'} · {touch.touchedAt ?? '-'}</div>
                      )) : <div className="text-gray-500">暂无触达记录</div>}
                    </div>
                    <div>
                      <div className="mb-1 font-medium text-gray-800">推荐反馈</div>
                      {customerProfile.recommendationEvents.length ? customerProfile.recommendationEvents.slice(0, 3).map((event: any) => (
                        <div key={event.id} className="rounded-lg bg-gray-50 px-3 py-2">{event.eventType ?? '-'} · #{event.recommendationId ?? '-'} · {event.createdAt ?? '-'}</div>
                      )) : <div className="text-gray-500">暂无推荐反馈</div>}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {/* Health Edit Dialog */}
      <Dialog open={showHealthEditDialog} onOpenChange={setShowHealthEditDialog}>
        <DialogContent className="max-w-lg" aria-describedby="health-edit-desc">
          <DialogHeader><DialogTitle>编辑肌肤档案 — {editingHealth?.name}</DialogTitle></DialogHeader>
          <span id="health-edit-desc" className="sr-only">编辑客户肌肤档案信息</span>
          {editingHealth && (
            <div className="space-y-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">肌肤类型</label>
                <select className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md" value={editingHealth.skinType === '-' ? '' : editingHealth.skinType} onChange={(e) => setEditingHealth({ ...editingHealth, skinType: e.target.value || '-' })}>
                  <option value="">未检测</option>
                  <option value="干性">干性</option><option value="油性">油性</option><option value="混干">混干</option>
                  <option value="混油">混油</option><option value="中性">中性</option><option value="敏感">敏感</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">肌肤状态</label>
                <Input value={editingHealth.skinStatus === '-' ? '' : editingHealth.skinStatus} onChange={(e) => setEditingHealth({ ...editingHealth, skinStatus: e.target.value || '-' })} placeholder="如：皮肤薄、偏干缺水" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">主要问题</label>
                <Input value={editingHealth.mainProblems === '-' ? '' : editingHealth.mainProblems} onChange={(e) => setEditingHealth({ ...editingHealth, mainProblems: e.target.value || '-' })} placeholder="如：T区出油, 毛孔粗大" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">过敏史</label>
                <Input value={editingHealth.allergyHistory === '-' ? '' : editingHealth.allergyHistory} onChange={(e) => setEditingHealth({ ...editingHealth, allergyHistory: e.target.value || '-' })} placeholder="如：没有 / 花粉过敏" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">改善目标</label>
                <Input value={editingHealth.goals === '-' ? '' : editingHealth.goals} onChange={(e) => setEditingHealth({ ...editingHealth, goals: e.target.value || '-' })} placeholder="如：补水保湿, 美白提亮" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">推荐护理</label>
                <Input value={editingHealth.recommendedCare === '-' ? '' : editingHealth.recommendedCare} onChange={(e) => setEditingHealth({ ...editingHealth, recommendedCare: e.target.value || '-' })} placeholder="如：补水保湿+光子嫩肤" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">检测仪器</label>
                <Input value={editingHealth.instrument === '-' ? '' : editingHealth.instrument} onChange={(e) => setEditingHealth({ ...editingHealth, instrument: e.target.value || '-' })} placeholder="如：VISIA皮肤分析仪" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">最近检查时间</label>
                <Input type="date" value={editingHealth.lastCheck === '-' ? '' : editingHealth.lastCheck} onChange={(e) => setEditingHealth({ ...editingHealth, lastCheck: e.target.value || '-' })} />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setShowHealthEditDialog(false)}>取消</Button>
                <Button onClick={handleSaveHealthEdit}>保存</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showSkinAiDialog} onOpenChange={handleCloseSkinAiDialog}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto" aria-describedby="skin-ai-desc">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-500" />
              AI肤质检测
            </DialogTitle>
          </DialogHeader>
          <span id="skin-ai-desc" className="sr-only">通过拍照或上传照片，使用 AI 生成客户肌肤档案</span>

          <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5 mt-4">
            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 p-4 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">选择客户</label>
                  <Input
                    placeholder="搜索姓名、手机号或门店"
                    value={skinAiCustomerKeyword}
                    onChange={(event) => setSkinAiCustomerKeyword(event.target.value)}
                    className="mb-2"
                  />
                  <select
                    className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md"
                    value={skinAiCustomerId}
                    onChange={(event) => {
                      setSkinAiCustomerId(event.target.value ? Number(event.target.value) : '');
                      setSkinAiResult(null);
                    }}
                  >
                    <option value="">请选择客户</option>
                    {skinAiCustomerOptions.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name} / {customer.phone} / {customer.storeName || '未分配门店'}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedSkinAiCustomer && (
                  <div className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">
                    将录入到：{selectedSkinAiCustomer.name}，所属门店：{selectedSkinAiCustomer.storeName || currentStoreName || '-'}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-gray-200 p-4 space-y-3">
                <div className="font-medium text-sm text-gray-700">照片采集</div>
                <div className="aspect-[4/3] overflow-hidden rounded-lg bg-gray-900 flex items-center justify-center">
                  {skinAiPhoto ? (
                    <img src={skinAiPhoto} alt="肤质检测照片" className="h-full w-full object-cover" />
                  ) : (
                    <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
                  )}
                </div>
                <canvas ref={canvasRef} className="hidden" />
                <input
                  ref={skinPhotoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleUploadSkinPhoto}
                />
                {skinAiCameraError && (
                  <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    {skinAiCameraError}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" className="gap-2" onClick={() => void handleCaptureSkinPhoto()}>
                    <Camera className="h-4 w-4" />
                    拍照
                  </Button>
                  <Button type="button" variant="outline" className="gap-2" onClick={() => skinPhotoInputRef.current?.click()}>
                    <Upload className="h-4 w-4" />
                    上传照片
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    onClick={handleDeleteSkinPhoto}
                    disabled={!skinAiPhoto && !skinAiResult}
                  >
                    <Trash2 className="h-4 w-4" />
                    删除
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="font-medium text-gray-800">AI检测结果</div>
                    <p className="text-sm text-gray-500 mt-1">拍照或上传照片后点击检测，结果确认后会写入客户肌肤档案。</p>
                  </div>
                  <Button
                    className="gap-2"
                    onClick={handleAnalyzeSkinPhoto}
                    disabled={skinAiAnalyzing || !skinAiPhoto || !skinAiCustomerId}
                  >
                    {skinAiAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    开始AI检测
                  </Button>
                </div>

                {!skinAiResult ? (
                  <div className="mt-6 flex h-52 items-center justify-center rounded-lg bg-gray-50 text-sm text-gray-500">
                    暂无检测结果
                  </div>
                ) : (
                  <div className="mt-5 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-blue-50 p-3">
                        <div className="text-xs text-blue-600">肤质类型</div>
                        <div className="mt-1 text-lg font-semibold text-blue-800">{skinAiResult.skinType}</div>
                      </div>
                      <div className="rounded-lg bg-green-50 p-3">
                        <div className="text-xs text-green-600">AI置信度</div>
                        <div className="mt-1 text-lg font-semibold text-green-800">
                          {Math.round(skinAiResult.confidence * 100)}%
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-lg border border-gray-200 p-3">
                        <div className="text-gray-500">肌肤状态</div>
                        <div className="mt-1 text-gray-800">{skinAiResult.skinStatus}</div>
                      </div>
                      <div className="rounded-lg border border-gray-200 p-3">
                        <div className="text-gray-500">主要问题</div>
                        <div className="mt-1 text-gray-800">{skinAiResult.mainProblems}</div>
                      </div>
                      <div className="rounded-lg border border-gray-200 p-3">
                        <div className="text-gray-500">改善目标</div>
                        <div className="mt-1 text-gray-800">{skinAiResult.goals}</div>
                      </div>
                      <div className="rounded-lg border border-gray-200 p-3">
                        <div className="text-gray-500">推荐护理</div>
                        <div className="mt-1 text-gray-800">{skinAiResult.recommendedCare}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs">
                      {Object.entries(skinAiResult.metrics).map(([key, value]) => (
                        <div key={key} className="rounded-md bg-gray-50 p-2">
                          <div className="text-gray-500">
                            {key === 'moisture' ? '水分' : key === 'oil' ? '油脂' : key === 'elasticity' ? '弹性' : key === 'sensitivity' ? '敏感' : key === 'pore' ? '毛孔' : '色沉'}
                          </div>
                          <div className="mt-1 font-semibold text-gray-800">{value}</div>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                      {skinAiResult.explanation}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => handleCloseSkinAiDialog(false)}>
                  取消
                </Button>
                <Button onClick={handleSaveSkinAiResult} disabled={!skinAiResult || skinAiSaving}>
                  {skinAiSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  录入肌肤档案
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Customer Dialog */}
      <Dialog open={showAddDialog} onOpenChange={handleCloseDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" aria-describedby="customer-dialog-description">
          <DialogHeader>
            <DialogTitle>{editingCustomer ? '编辑客户' : '新增客户'}</DialogTitle>
          </DialogHeader>
          <span id="customer-dialog-description" className="sr-only">{editingCustomer ? '编辑客户信息' : '创建新客户'}</span>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 mt-4">
            {/* Row 1: Name + Store */}
            <div className="grid grid-cols-2 gap-6">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right"><span className="text-red-500">*</span> 客户名称</label>
                <div className="flex-1">
                  <Input placeholder="请输入客户名称" {...register('name')} />
                  {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right">所属门店</label>
                <select className="flex-1 h-9 px-3 text-sm border border-gray-300 rounded-md" {...register('storeName')}>
                  {stores.length === 0 && <option value={defaultStoreName}>{defaultStoreName}</option>}
                  {stores.map((store) => (
                    <option key={store.id} value={store.name}>{store.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Row 2: Email + Phone */}
            <div className="grid grid-cols-2 gap-6">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right">邮箱</label>
                <div className="flex-1">
                  <Input placeholder="请输入邮箱" {...register('email')} />
                  {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right">手机号码</label>
                <div className="flex-1">
                  <Input placeholder="请输入手机号码" {...register('phone')} />
                  {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
                </div>
              </div>
            </div>

            {/* Row 3: Landline + WeChat */}
            <div className="grid grid-cols-2 gap-6">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right">座机号</label>
                <Input placeholder="请输入座机号" className="flex-1" {...register('landline')} />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right">微信号</label>
                <Input placeholder="请输入微信号" className="flex-1" {...register('wechat')} />
              </div>
            </div>

            {/* Row 4: Gender + Marital Status */}
            <div className="grid grid-cols-2 gap-6">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right"><span className="text-red-500">*</span> 性别</label>
                <div className="flex-1 flex items-center gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" value="男" {...register('gender')} className="text-blue-500" />
                    <span className="text-sm">男</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" value="女" {...register('gender')} className="text-blue-500" />
                    <span className="text-sm text-blue-500">女</span>
                  </label>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right">婚姻状态</label>
                <div className="flex-1 flex items-center gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" value="未知" {...register('maritalStatus')} className="text-blue-500" />
                    <span className="text-sm text-blue-500">未知</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" value="已婚" {...register('maritalStatus')} className="text-blue-500" />
                    <span className="text-sm">已婚</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" value="未婚" {...register('maritalStatus')} className="text-blue-500" />
                    <span className="text-sm">未婚</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Row 5: Birthday + Age */}
            <div className="grid grid-cols-2 gap-6">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right">出生日期</label>
                <Input type="date" className="flex-1" {...register('birthday')} />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right">年龄</label>
                <Input type="number" placeholder="请输入年龄" className="flex-1" {...register('age', { valueAsNumber: true })} />
              </div>
            </div>

            {/* Row 6: Height + Weight */}
            <div className="grid grid-cols-2 gap-6">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right">身高(cm)</label>
                <Input type="number" placeholder="请输入身高" className="flex-1" {...register('height', { valueAsNumber: true })} />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right">体重(kg)</label>
                <Input type="number" placeholder="请输入体重" className="flex-1" {...register('weight', { valueAsNumber: true })} />
              </div>
            </div>

            {/* Row 7: Occupation + Workplace */}
            <div className="grid grid-cols-2 gap-6">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right">职业</label>
                <Input placeholder="请输入职业" className="flex-1" {...register('occupation')} />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right">工作单位</label>
                <Input placeholder="请输入工作单位" className="flex-1" {...register('workplace')} />
              </div>
            </div>

            {/* Row 8: Address (full width) */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right">家庭地址</label>
              <Input placeholder="请输入家庭地址" className="flex-1" {...register('address')} />
            </div>

            {/* Row 9: Allergy */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right">过敏史</label>
              <div className="flex-1 flex items-center gap-4">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" value="无" {...register('hasAllergy')} className="text-blue-500" />
                  <span className="text-sm text-blue-500">无</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" value="有" {...register('hasAllergy')} className="text-blue-500" />
                  <span className="text-sm">有</span>
                </label>
              </div>
            </div>

            {/* Row 10: Surgery */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right">有无整形或微创治疗</label>
              <div className="flex-1 flex items-center gap-4">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" value="无" {...register('hasSurgery')} className="text-blue-500" />
                  <span className="text-sm text-blue-500">无</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" value="有" {...register('hasSurgery')} className="text-blue-500" />
                  <span className="text-sm">有</span>
                </label>
              </div>
            </div>

            {/* Row 11: Skin */}
            <div className="grid grid-cols-[1fr_2fr] gap-6">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right">肤质类型</label>
                <select className="flex-1 h-9 px-3 text-sm border border-gray-300 rounded-md" {...register('skinType')}>
                  <option value="">请选择肤质</option>
                  <option value="干性肌肤">干性肌肤</option>
                  <option value="油性肌肤">油性肌肤</option>
                  <option value="敏感肌肤">敏感肌肤</option>
                  <option value="混合肌肤">混合肌肤</option>
                  <option value="中性肌肤">中性肌肤</option>
                </select>
              </div>
              <div className="flex items-start gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right mt-2">皮肤状况</label>
                <textarea placeholder="请输入皮肤状况" rows={2} className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-500" {...register('skinCondition')} />
              </div>
            </div>

            {/* Row 12: Total Spent */}
            <div className="grid grid-cols-2 gap-6">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right">总消费金额</label>
                <Input type="number" placeholder="0" className="flex-1" {...register('totalSpent', { valueAsNumber: true })} />
              </div>
            </div>

            {/* Row 13: Member Level + Source */}
            <div className="grid grid-cols-2 gap-6">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right">客户等级</label>
                <select className="flex-1 h-9 px-3 text-sm border border-gray-300 rounded-md" {...register('memberLevel')}>
                  <option value="无">无</option>
                  <option value="普通会员">普通会员</option>
                  <option value="银卡会员">银卡会员</option>
                  <option value="金卡会员">金卡会员</option>
                  <option value="钻石会员">钻石会员</option>
                </select>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right">客户来源</label>
                <select className="flex-1 h-9 px-3 text-sm border border-gray-300 rounded-md" {...register('source')}>
                  <option value="">请选择客户来源</option>
                  <option value="门店">门店</option>
                  <option value="推荐">推荐</option>
                  <option value="线上">线上</option>
                  <option value="活动">活动</option>
                </select>
              </div>
            </div>

            {/* Row 14: Last Visit Date */}
            <div className="grid grid-cols-2 gap-6">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right">最后到店时间</label>
                <Input type="datetime-local" className="flex-1" {...register('lastVisitDate')} />
              </div>
            </div>

            {/* Row 15: Remark */}
            <div className="flex items-start gap-3">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap w-24 text-right mt-2">备注</label>
              <textarea placeholder="请输入备注" rows={3} className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-blue-500" {...register('remark')} />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={handleCloseDialog}>取消</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-[#1890ff]">
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingCustomer ? '保存' : '创建'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <ImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        title="批量导入客户"
        columns={CUSTOMER_IMPORT_COLUMNS}
        requiredColumns={['客户姓名', '手机号码']}
        onImport={importCustomers}
        onSuccess={refresh}
      />

      <PasswordConfirmDialog
        open={showPwdConfirm}
        onOpenChange={setShowPwdConfirm}
        description={`即将删除 ${pendingDeleteIds.length} 条客户数据，此操作不可撤销，请输入账号密码确认身份`}
        onConfirm={executeDelete}
      />
    </div>
  );
}
