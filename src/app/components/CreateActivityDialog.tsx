import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import {
  Target, Users, Calendar, Sparkles, Save, ShoppingBag,
  Smartphone, X, Download, Loader2, Tag, DollarSign, Megaphone, Settings
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { marketingActivitySchema, type MarketingActivityFormData } from '@/schemas/marketing';
import { createMarketingActivity } from '@/api/marketing';
import { getProjects } from '@/api/project';
import { toast } from 'sonner';
import { ActivityMiniPage, type ActivityPageData } from './ActivityMiniPage';
import rawCustomers from '@/api/mock/data/customers.json';
import rawHealthProfiles from '@/api/mock/data/health-profiles.json';
import type { Customer } from '@/types';
import { classifyCustomer, classifySkin } from '@/utils/customerSegmentation';

interface CreateActivityDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialData?: {
    title?: string;
    description?: string;
    targetCustomers?: string;
    discount?: string;
    strategy?: string;
    image?: string;
    category?: string;
    duration?: string;
  };
}

const ACTIVITY_TYPES = [
  { value: '折扣促销', label: '折扣促销', desc: '全场或指定项目打折' },
  { value: '满减活动', label: '满减活动', desc: '消费满额立减' },
  { value: '拼团活动', label: '拼团活动', desc: '多人成团享优惠' },
  { value: '储值赠送', label: '储值赠送', desc: '充值送额度或礼品' },
  { value: '体验价', label: '体验价', desc: '新项目/新客体验特价' },
  { value: '老带新', label: '老带新', desc: '推荐新客双方获益' },
  { value: '生日特权', label: '生日特权', desc: '生日月专属优惠' },
  { value: '节日活动', label: '节日活动', desc: '节假日主题促销' },
];

const DISCOUNT_TYPES = [
  { value: '折扣', label: '折扣（如8折）' },
  { value: '满减', label: '满减（如满500减100）' },
  { value: '赠品', label: '赠品（如赠送面膜）' },
  { value: '积分', label: '积分（如双倍积分）' },
  { value: '体验价', label: '体验价（如99元体验）' },
  { value: '返现', label: '返现（如推荐返50元）' },
];

const TARGET_SEGMENTS = [
  { value: '', label: '全部' },
  { value: '高价值客户', label: '高价值' },
  { value: '潜在价值客户', label: '潜在价值' },
  { value: '稳定客户', label: '稳定' },
  { value: '流失风险客户', label: '流失风险' },
  { value: '新客户', label: '新客户' },
];

const TARGET_SKIN_TYPES = [
  { value: '', label: '全部' },
  { value: '干性肌肤', label: '干性' },
  { value: '油性肌肤', label: '油性' },
  { value: '敏感肌肤', label: '敏感' },
  { value: '混合肌肤', label: '混合' },
  { value: '中性肌肤', label: '中性' },
];

const TARGET_SPECIAL_TAGS = [
  { value: '活跃会员', label: '活跃会员' },
  { value: '本月生日', label: '本月生日' },
  { value: 'VIP客户', label: 'VIP客户' },
];

// Pre-compute customer classifications
const allCustomers: Customer[] = (rawCustomers as any[]).map((c) => ({ ...c, tags: c.tags || [] }));
const hpMap = new Map<number, any>();
for (const p of (rawHealthProfiles as any[])) hpMap.set(p.customerId, p);

const customerClassifications = allCustomers.map((c) => ({
  id: c.id,
  segment: classifyCustomer(c).segment,
  skinType: classifySkin(c, hpMap.get(c.id)),
  isActive: c.visitCount > 5 && c.lastVisitDate >= '2026-01-01',
  isBirthday: c.birthday ? parseInt(c.birthday.slice(5, 7)) === new Date().getMonth() + 1 : false,
  isVIP: c.memberLevel === '金卡会员' || c.memberLevel === '钻石会员',
}));

function countMatchingCustomers(segment: string, skinType: string, specialTags: string[]): number {
  return customerClassifications.filter((c) => {
    if (segment && c.segment !== segment) return false;
    if (skinType && c.skinType !== skinType) return false;
    for (const tag of specialTags) {
      if (tag === '活跃会员' && !c.isActive) return false;
      if (tag === '本月生日' && !c.isBirthday) return false;
      if (tag === 'VIP客户' && !c.isVIP) return false;
    }
    return true;
  }).length;
}

const CHANNELS = [
  { value: '短信', label: '短信通知', icon: '📱' },
  { value: '微信公众号', label: '微信公众号', icon: '💬' },
  { value: '小程序推送', label: '小程序推送', icon: '📲' },
  { value: '朋友圈广告', label: '朋友圈广告', icon: '📢' },
  { value: '门店海报', label: '门店海报/立牌', icon: '🖼️' },
  { value: '社群', label: '客户社群', icon: '👥' },
];

export function CreateActivityDialog({ open, onClose, onSuccess, initialData }: CreateActivityDialogProps) {
  const [selectedProjects, setSelectedProjects] = useState<number[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>(['短信', '小程序推送']);
  const [projectList, setProjectList] = useState<Array<{ id: number; name: string; type: string; price: number }>>([]);
  const [targetSegment, setTargetSegment] = useState('');
  const [targetSkinType, setTargetSkinType] = useState('');
  const [targetSpecialTags, setTargetSpecialTags] = useState<string[]>([]);

  const [isGeneratingCopy, setIsGeneratingCopy] = useState(false);
  const [isGeneratingPosters, setIsGeneratingPosters] = useState(false);
  const [generatedPosters, setGeneratedPosters] = useState<Array<{ id: number; backgroundColor: string; imageUrl: string; titleColor: string }>>([]);
  const [selectedPoster, setSelectedPoster] = useState<number | null>(null);
  const [showMiniPreview, setShowMiniPreview] = useState(false);

  const { register, handleSubmit: rhfHandleSubmit, formState: { errors, isSubmitting }, reset, setValue, watch } = useForm<MarketingActivityFormData>({
    resolver: zodResolver(marketingActivitySchema),
    defaultValues: {
      title: '', activityType: '折扣促销', description: '', startDate: '2026-04-01', endDate: '2026-05-01',
      targetCustomers: '', discountType: '折扣', discountValue: '', discount: '', budget: '', targetParticipants: '',
      targetRevenue: '', channels: [], maxUsagePerPerson: '1', minSpend: '', stackable: false, image: '',
    },
  });

  const watchedTitle = watch('title');
  const watchedDescription = watch('description');
  const watchedDiscountValue = watch('discountValue');
  const watchedStartDate = watch('startDate');
  const watchedEndDate = watch('endDate');

  // Load projects from API
  useEffect(() => {
    if (open) {
      getProjects().then((list) => setProjectList(list.map((p: any) => ({ id: p.id, name: p.name, type: p.type, price: p.price })))).catch(() => {});
    }
  }, [open]);

  // Reset form when dialog opens with new initialData
  useEffect(() => {
    if (open) {
      const discountStr = initialData?.discount || '';
      let discountType = '折扣';
      if (discountStr.includes('满') && discountStr.includes('减')) discountType = '满减';
      else if (discountStr.includes('赠') || discountStr.includes('礼')) discountType = '赠品';
      else if (discountStr.includes('积分')) discountType = '积分';
      else if (discountStr.includes('体验') || discountStr.includes('99元')) discountType = '体验价';
      else if (discountStr.includes('返')) discountType = '返现';

      // Auto-map activity type from recommendation category
      let activityType = '折扣促销';
      const cat = initialData?.category || '';
      if (cat.includes('wake') || cat.includes('churn')) activityType = '折扣促销';
      else if (cat.includes('cross-sell')) activityType = '满减活动';
      else if (cat.includes('viral')) activityType = '拼团活动';
      else if (cat.includes('member-care') || cat.includes('ltv')) activityType = '生日特权';
      else if (cat.includes('seasonal')) activityType = '节日活动';

      // Auto-map target customer segment from targetCustomers text
      let autoSegment = '';
      let autoSkinType = '';
      const tc = initialData?.targetCustomers || '';
      if (tc.includes('高价值') || tc.includes('铂金')) autoSegment = '高价值客户';
      else if (tc.includes('潜在')) autoSegment = '潜在价值客户';
      else if (tc.includes('流失') || tc.includes('沉睡')) autoSegment = '流失风险客户';
      else if (tc.includes('新客')) autoSegment = '新客户';
      else if (tc.includes('稳定')) autoSegment = '稳定客户';
      if (tc.includes('敏感')) autoSkinType = '敏感肌肤';
      else if (tc.includes('干性')) autoSkinType = '干性肌肤';
      else if (tc.includes('油性')) autoSkinType = '油性肌肤';
      else if (tc.includes('混合')) autoSkinType = '混合肌肤';

      // Auto-set dates (today + 30 days)
      const today = new Date();
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + 30);
      const startStr = today.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];

      reset({
        title: initialData?.title || '', activityType, description: initialData?.description || '',
        startDate: startStr, endDate: endStr, targetCustomers: tc,
        targetSegment: '', targetSkinType: '', targetSpecialTags: [],
        discountType, discountValue: discountStr, discount: discountStr, budget: '', targetParticipants: '',
        targetRevenue: '', channels: [], maxUsagePerPerson: '1', minSpend: '', stackable: false, image: '',
      });
      setSelectedChannels(['短信', '小程序推送']);
      setTargetSegment(autoSegment);
      setTargetSkinType(autoSkinType);
      setTargetSpecialTags(tc.includes('VIP') ? ['VIP客户'] : []);
    }
  }, [open, initialData]);

  const products = [
    { id: 1, name: '玻尿酸精华液', price: 280, category: '护肤品' },
    { id: 2, name: '修复面膜套装', price: 180, category: '护肤品' },
    { id: 3, name: '美白精华', price: 350, category: '护肤品' },
    { id: 4, name: '眼霜套装', price: 220, category: '护肤品' },
    { id: 5, name: '防晒喷雾', price: 150, category: '护肤品' },
  ];

  const toggleChannel = (ch: string) => {
    setSelectedChannels((prev) => prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]);
  };

  const handleGenerateCopy = () => {
    setIsGeneratingCopy(true);
    setTimeout(() => {
      const projNames = projectList.filter((p) => selectedProjects.includes(p.id)).map((p) => p.name).join('、');
      const prodNames = products.filter((p) => selectedProducts.includes(p.id)).map((p) => p.name).join('、');
      let text = watchedTitle ? `${watchedTitle}，` : '';
      if (projNames) text += `精选${projNames}等美容项目，`;
      if (prodNames) text += `搭配${prodNames}等优质产品，`;
      text += watchedDiscountValue ? `现享${watchedDiscountValue}！` : '限时优惠，不容错过！';
      text += `活动期间${watchedStartDate}至${watchedEndDate}，为您打造专属美丽方案。赶快预约体验，让美丽触手可及！`;
      setValue('description', text);
      setIsGeneratingCopy(false);
    }, 1500);
  };

  const onSubmit = async (data: MarketingActivityFormData) => {
    const parts: string[] = [];
    if (targetSegment) parts.push(targetSegment);
    if (targetSkinType) parts.push(targetSkinType);
    parts.push(...targetSpecialTags);
    const targetLabel = parts.length > 0 ? parts.join(' + ') : '全部客户';

    try {
      await createMarketingActivity({
        title: data.title,
        description: data.description,
        image: currentPoster?.imageUrl || '',
        status: '即将开始',
        participants: 0,
        conversion: '0%',
        startDate: data.startDate,
        endDate: data.endDate,
        targetCustomers: targetLabel,
        discount: data.discountValue || '',
        source: '手动创建',
        posterBg: currentPoster?.backgroundColor,
        posterImage: currentPoster?.imageUrl,
        posterTitleColor: currentPoster?.titleColor,
      });
      toast.success('活动发布成功');
      onClose();
      onSuccess?.();
    } catch (err: any) {
      toast.error(err?.message || '发布活动失败');
    }
  };

  const handleSaveDraft = () => { toast.success('活动已保存为草稿'); onClose(); };

  const handleGeneratePosters = () => {
    setIsGeneratingPosters(true);
    setTimeout(() => {
      setGeneratedPosters([
        { id: 1, backgroundColor: '#FF6B9D', imageUrl: 'https://images.unsplash.com/photo-1611169035510-f9af52e6dbe2?w=600', titleColor: '#FFFFFF' },
        { id: 2, backgroundColor: '#6B5CE7', imageUrl: 'https://images.unsplash.com/photo-1527632911563-ee5b6d53465b?w=600', titleColor: '#FFFFFF' },
        { id: 3, backgroundColor: '#10B981', imageUrl: 'https://images.unsplash.com/photo-1531299244174-d247dd4e5a66?w=600', titleColor: '#FFFFFF' },
      ]);
      setSelectedPoster(1);
      setIsGeneratingPosters(false);
    }, 2000);
  };

  const currentPoster = selectedPoster ? generatedPosters.find((p) => p.id === selectedPoster) : null;
  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" aria-describedby="create-activity-desc">
          <DialogHeader><DialogTitle>创建营销活动</DialogTitle></DialogHeader>
          <span id="create-activity-desc" className="sr-only">设置活动信息并生成营销海报</span>

          <form onSubmit={rhfHandleSubmit(onSubmit, (errors) => {
            const firstError = Object.values(errors)[0];
            if (firstError?.message) toast.error(String(firstError.message));
          })}>
          <div className="space-y-6 mt-2">
            {/* 基础信息 */}
            <div className="border border-gray-200 rounded-lg p-5">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2"><Target className="w-5 h-5 text-blue-600" /> 基础信息</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">活动名称 *</label>
                    <input type="text" {...register('title')} className={inputCls} placeholder="请输入活动名称" />
                    {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">活动类型 *</label>
                    <select {...register('activityType')} className={inputCls}>
                      {ACTIVITY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label} — {t.desc}</option>)}
                    </select>
                    {errors.activityType && <p className="text-red-500 text-xs mt-1">{errors.activityType.message}</p>}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">目标客户群 *</label>
                  {/* 客户细分 */}
                  <div className="mb-3">
                    <div className="text-xs text-gray-500 mb-2">客户细分</div>
                    <div className="flex flex-wrap gap-2">
                      {TARGET_SEGMENTS.map((s) => (
                        <button key={s.value} type="button" onClick={() => setTargetSegment(s.value)}
                          className={`px-3 py-1.5 rounded-full text-sm transition-colors ${targetSegment === s.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* 肌肤类型 */}
                  <div className="mb-3">
                    <div className="text-xs text-gray-500 mb-2">肌肤类型</div>
                    <div className="flex flex-wrap gap-2">
                      {TARGET_SKIN_TYPES.map((s) => (
                        <button key={s.value} type="button" onClick={() => setTargetSkinType(s.value)}
                          className={`px-3 py-1.5 rounded-full text-sm transition-colors ${targetSkinType === s.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* 特殊标签 */}
                  <div className="mb-3">
                    <div className="text-xs text-gray-500 mb-2">特殊标签（可多选）</div>
                    <div className="flex flex-wrap gap-2">
                      {TARGET_SPECIAL_TAGS.map((s) => (
                        <button key={s.value} type="button" onClick={() => setTargetSpecialTags((prev) => prev.includes(s.value) ? prev.filter((t) => t !== s.value) : [...prev, s.value])}
                          className={`px-3 py-1.5 rounded-full text-sm transition-colors ${targetSpecialTags.includes(s.value) ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* 实时客户数量 */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-600" />
                    <span className="text-sm text-blue-800">
                      符合条件的客户：<span className="font-semibold">{countMatchingCustomers(targetSegment, targetSkinType, targetSpecialTags)}</span> 人
                      {!targetSegment && !targetSkinType && targetSpecialTags.length === 0 && <span className="text-blue-500 ml-1">（全部客户）</span>}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">开始时间 *</label>
                    <input type="date" {...register('startDate')} className={inputCls} />
                    {errors.startDate && <p className="text-red-500 text-xs mt-1">{errors.startDate.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">结束时间 *</label>
                    <input type="date" {...register('endDate')} className={inputCls} />
                    {errors.endDate && <p className="text-red-500 text-xs mt-1">{errors.endDate.message}</p>}
                  </div>
                </div>
              </div>
            </div>

            {/* 优惠设置 */}
            <div className="border border-gray-200 rounded-lg p-5">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2"><Tag className="w-5 h-5 text-blue-600" /> 优惠设置</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">优惠类型 *</label>
                    <select {...register('discountType')} className={inputCls}>
                      {DISCOUNT_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">优惠内容 *</label>
                    <input type="text" {...register('discountValue')} className={inputCls} placeholder="如：8折、满500减100、赠送面膜" />
                    {errors.discountValue && <p className="text-red-500 text-xs mt-1">{errors.discountValue.message}</p>}
                  </div>
                </div>

                {/* 参与项目 - 从API加载 */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-medium text-gray-700">参与项目</label>
                    <span className="text-xs text-blue-600">已选 {selectedProjects.length} 项</span>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-3 max-h-40 overflow-y-auto">
                    {projectList.length === 0 && <div className="text-sm text-gray-400 text-center py-2">暂无项目数据</div>}
                    {projectList.map((p) => (
                      <label key={p.id} className="flex items-center gap-3 p-1.5 hover:bg-gray-50 rounded cursor-pointer">
                        <input type="checkbox" checked={selectedProjects.includes(p.id)} onChange={() => setSelectedProjects((prev) => prev.includes(p.id) ? prev.filter((i) => i !== p.id) : [...prev, p.id])} className="w-4 h-4 text-blue-600 border-gray-300 rounded" />
                        <div className="flex-1"><span className="text-sm text-gray-900">{p.name}</span><span className="text-xs text-gray-500 ml-2">{p.type}</span></div>
                        <span className="text-sm font-medium text-blue-600">¥{p.price}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* 参与商品 */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-medium text-gray-700">参与商品</label>
                    <span className="text-xs text-blue-600">已选 {selectedProducts.length} 项</span>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-3 max-h-40 overflow-y-auto">
                    {products.map((p) => (
                      <label key={p.id} className="flex items-center gap-3 p-1.5 hover:bg-gray-50 rounded cursor-pointer">
                        <input type="checkbox" checked={selectedProducts.includes(p.id)} onChange={() => setSelectedProducts((prev) => prev.includes(p.id) ? prev.filter((i) => i !== p.id) : [...prev, p.id])} className="w-4 h-4 text-blue-600 border-gray-300 rounded" />
                        <div className="flex-1"><span className="text-sm text-gray-900">{p.name}</span><span className="text-xs text-gray-500 ml-2">{p.category}</span></div>
                        <span className="text-sm font-medium text-blue-600">¥{p.price}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 活动规则 */}
            <div className="border border-gray-200 rounded-lg p-5">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2"><Settings className="w-5 h-5 text-blue-600" /> 活动规则</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">每人限用次数</label>
                  <select {...register('maxUsagePerPerson')} className={inputCls}>
                    <option value="1">1次</option><option value="2">2次</option><option value="3">3次</option><option value="不限">不限</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">最低消费门槛</label>
                  <input type="text" {...register('minSpend')} className={inputCls} placeholder="如：300元（留空则无门槛）" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">是否可叠加</label>
                  <div className="flex items-center gap-4 h-[38px]">
                    <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" value="false" {...register('stackable')} defaultChecked className="text-blue-500" /><span className="text-sm">不可叠加</span></label>
                    <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" value="true" {...register('stackable')} className="text-blue-500" /><span className="text-sm">可叠加</span></label>
                  </div>
                </div>
              </div>
            </div>

            {/* 预算与目标 */}
            <div className="border border-gray-200 rounded-lg p-5">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2"><DollarSign className="w-5 h-5 text-blue-600" /> 预算与目标</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">活动预算</label>
                  <input type="text" {...register('budget')} className={inputCls} placeholder="如：50000元" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">目标参与人数</label>
                  <input type="text" {...register('targetParticipants')} className={inputCls} placeholder="如：200人" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">目标营收</label>
                  <input type="text" {...register('targetRevenue')} className={inputCls} placeholder="如：100000元" />
                </div>
              </div>
            </div>

            {/* 推送渠道 */}
            <div className="border border-gray-200 rounded-lg p-5">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2"><Megaphone className="w-5 h-5 text-blue-600" /> 推送渠道</h3>
              <div className="grid grid-cols-3 gap-3">
                {CHANNELS.map((ch) => (
                  <label key={ch.value} onClick={() => toggleChannel(ch.value)}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selectedChannels.includes(ch.value) ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <span className="text-xl">{ch.icon}</span>
                    <div>
                      <div className="text-sm font-medium text-gray-900">{ch.label}</div>
                    </div>
                    <input type="checkbox" checked={selectedChannels.includes(ch.value)} readOnly className="ml-auto w-4 h-4 text-blue-600 rounded" />
                  </label>
                ))}
              </div>
            </div>

            {/* 活动文案 */}
            <div className="border border-gray-200 rounded-lg p-5">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2"><Users className="w-5 h-5 text-blue-600" /> 活动文案</h3>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-gray-700">活动描述 *</label>
                  <button type="button" onClick={handleGenerateCopy} disabled={isGeneratingCopy}
                    className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1.5 text-xs disabled:bg-blue-400">
                    {isGeneratingCopy ? <><div className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" /> 生成中</> : <><Sparkles className="w-3.5 h-3.5" /> AI 生成</>}
                  </button>
                </div>
                <textarea {...register('description')} rows={3} className={inputCls} placeholder="请输入活动描述" />
                {errors.description && <p className="text-red-500 text-xs mt-1">{errors.description.message}</p>}
              </div>
            </div>

            {/* 活动海报 */}
            <div className="border border-gray-200 rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Sparkles className="w-5 h-5 text-yellow-500" /> 活动海报</h3>
                <button type="button" onClick={handleGeneratePosters} disabled={isGeneratingPosters}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm disabled:bg-blue-400">
                  {isGeneratingPosters ? <><div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> 生成中...</> : <><Sparkles className="w-4 h-4" /> 生成海报</>}
                </button>
              </div>
              {generatedPosters.length > 0 ? (
                <div className="grid grid-cols-3 gap-4">
                  {generatedPosters.map((poster) => (
                    <div key={poster.id} className={`relative rounded-lg overflow-hidden shadow-lg cursor-pointer transition-all ${selectedPoster === poster.id ? 'ring-4 ring-blue-600 scale-105' : 'hover:scale-[1.02]'}`}
                      onClick={() => setSelectedPoster(poster.id)} style={{ backgroundColor: poster.backgroundColor }}>
                      <div className="aspect-[3/4] relative">
                        <img src={poster.imageUrl} alt={`海报 ${poster.id}`} className="w-full h-full object-cover opacity-40" />
                        <div className="absolute inset-0 flex flex-col justify-between p-3">
                          <div><div className="font-bold text-sm" style={{ color: poster.titleColor }}>{watchedTitle || '活动名称'}</div><div className="text-xs opacity-90 mt-1 line-clamp-2" style={{ color: poster.titleColor }}>{watchedDescription || '活动描述'}</div></div>
                          <div className="bg-white/20 backdrop-blur-sm rounded p-2"><div className="text-xs opacity-90" style={{ color: poster.titleColor }}>优惠内容</div><div className="font-bold text-xs" style={{ color: poster.titleColor }}>{watchedDiscountValue || '优惠信息'}</div></div>
                        </div>
                        {selectedPoster === poster.id && <div className="absolute top-2 right-2 bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">✓</div>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center"><Sparkles className="w-10 h-10 text-gray-400 mx-auto mb-2" /><p className="text-gray-500 text-sm">点击"生成海报"按钮，AI 将为您生成 3 种风格的营销海报</p></div>
              )}
              {selectedPoster && (
                <div className="flex gap-2 mt-4 pt-4 border-t border-gray-200">
                  <button type="button" onClick={() => setShowMiniPreview(true)} className="flex-1 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 text-sm"><Smartphone className="w-4 h-4" /> 小程序预览</button>
                  <button type="button" className="flex-1 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 text-sm"><Download className="w-4 h-4" /> 下载海报</button>
                </div>
              )}
            </div>

            {/* 底部操作 */}
            <div className="flex justify-end gap-3 pt-2 border-t border-gray-200">
              <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm">取消</button>
              <button type="button" onClick={() => setShowMiniPreview(true)} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 text-sm"><Smartphone className="w-4 h-4" /> 小程序预览</button>
              <button type="button" onClick={handleSaveDraft} className="px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors flex items-center gap-2 text-sm"><Save className="w-4 h-4" /> 保存草稿</button>
              <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm flex items-center gap-2 disabled:bg-blue-400">
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />} 发布活动
              </button>
            </div>
          </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* 小程序预览 */}
      {showMiniPreview && (
        <ActivityMiniPage
          data={{
            title: watchedTitle || '活动名称',
            description: watchedDescription || '暂无活动描述',
            discount: watchedDiscountValue || '优惠信息',
            startDate: watchedStartDate,
            endDate: watchedEndDate,
            targetCustomers: '',
            posterBg: currentPoster?.backgroundColor,
            posterImage: currentPoster?.imageUrl,
            posterTitleColor: currentPoster?.titleColor,
            projects: projectList.filter((p) => selectedProjects.includes(p.id)).map((p) => ({ name: p.name, price: p.price, type: p.type })),
            products: products.filter((p) => selectedProducts.includes(p.id)).map((p) => ({ name: p.name, price: p.price, category: p.category })),
            storeName: '心悦芸美容养生会所',
            storePhone: '0571-88888888',
            layout: 'classic',
          }}
          onClose={() => setShowMiniPreview(false)}
        />
      )}
    </>
  );
}
