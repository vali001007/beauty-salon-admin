import React, { useState, useEffect } from 'react';
import {
  Plus, Edit, Trash2, Eye, Copy, Play, Pause, Search,
  Calendar, Clock, Gift, Sun, Heart, UserCheck, ShoppingBag,
  TrendingDown, Sparkles, Filter, ChevronDown, ChevronRight, Users, Target, Zap, Loader2, Share2
} from 'lucide-react';
import { Button, Input, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/UI';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { createStrategy, saveStrategyDraft } from '@/api/marketing';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router';

// --- 触发规则类型 ---
type TriggerType =
  | 'last_visit'       // 最近消费时间
  | 'birthday'         // 生日
  | 'holiday'          // 节假日
  | 'seasonal'         // 季节性护肤
  | 'care_cycle'       // 护理周期到期
  | 'card_expiry'      // 卡项即将到期
  | 'consumption'      // 消费金额
  | 'visit_frequency'  // 到店频率
  | 'visit_gap'        // 消费间隔异常
  | 'service_interest' // 项目/服务偏好
  | 'dormant'          // 沉睡客户唤醒
  | 'member_level'     // 会员等级
  | 'new_customer'     // 新客户
  | 'skin_type'        // 肌肤类型
  | 'age_range';       // 年龄段

interface TriggerRule {
  type: TriggerType;
  label: string;
  icon: React.ReactNode;
  params: Record<string, string | number>;
}

interface ActionConfig {
  type: 'coupon' | 'discount' | 'gift' | 'points' | 'sms' | 'push';
  label: string;
  value: string;
}

interface EffectStats {
  triggerCount: number;       // 本月触发次数
  totalTriggerCount: number;  // 累计触发次数
  reachedCount: number;       // 触达人数
  couponUsedRate: string;     // 核销率
  returnRate: string;         // 回店率
  revenue: number;            // 带来营收
  cost: number;               // 投入成本
  dailyTrend: number[];       // 近7天触发趋势
}

interface Strategy {
  id: number;
  name: string;
  description: string;
  triggerRules: TriggerRule[];
  actions: ActionConfig[];
  targetCount: number;
  status: '启用' | '停用' | '草稿';
  executionType: '自动' | '手动';
  executionTime: string;
  lastExecuted: string;
  createdAt: string;
  effect?: EffectStats;
}

// --- 可选触发规则定义 ---
const TRIGGER_OPTIONS: { type: TriggerType; label: string; icon: React.ReactNode; description: string; category: string }[] = [
  { type: 'birthday', label: '生日关怀', icon: <Gift className="w-4 h-4" />, description: '在客户生日前后自动触发关怀营销', category: '时间触发' },
  { type: 'holiday', label: '节假日营销', icon: <Calendar className="w-4 h-4" />, description: '在指定节假日自动触发营销活动', category: '时间触发' },
  { type: 'seasonal', label: '季节性护肤', icon: <Sun className="w-4 h-4" />, description: '根据季节变化推荐对应护肤方案', category: '时间触发' },
  { type: 'care_cycle', label: '护理周期到期', icon: <Clock className="w-4 h-4" />, description: '上次护理后N天自动提醒预约下一次', category: '时间触发' },
  { type: 'card_expiry', label: '卡项即将到期', icon: <Calendar className="w-4 h-4" />, description: '次卡/套餐到期前N天提醒使用或续费', category: '时间触发' },
  { type: 'last_visit', label: '最近消费时间', icon: <Clock className="w-4 h-4" />, description: '根据客户最后一次到店消费的时间间隔触发', category: '行为触发' },
  { type: 'consumption', label: '消费金额', icon: <ShoppingBag className="w-4 h-4" />, description: '根据客户累计或单次消费金额触发', category: '行为触发' },
  { type: 'visit_frequency', label: '到店频率', icon: <TrendingDown className="w-4 h-4" />, description: '根据客户到店频率变化触发', category: '行为触发' },
  { type: 'visit_gap', label: '消费间隔异常', icon: <Zap className="w-4 h-4" />, description: '到店间隔超过客户平均值的2倍时触发', category: '行为触发' },
  { type: 'service_interest', label: '项目/服务偏好', icon: <Heart className="w-4 h-4" />, description: '根据客户历史消费偏好推荐相关护理项目', category: '行为触发' },
  { type: 'dormant', label: '沉睡客户唤醒', icon: <Zap className="w-4 h-4" />, description: '长期未到店的客户自动唤醒', category: '行为触发' },
  { type: 'member_level', label: '会员等级', icon: <UserCheck className="w-4 h-4" />, description: '针对特定会员等级的客户触发', category: '属性触发' },
  { type: 'new_customer', label: '新客户引导', icon: <Users className="w-4 h-4" />, description: '新注册客户自动触发引导营销', category: '属性触发' },
  { type: 'skin_type', label: '肌肤类型', icon: <Heart className="w-4 h-4" />, description: '按肌肤分类触发（干性/油性/敏感/混合/中性）', category: '属性触发' },
  { type: 'age_range', label: '年龄段', icon: <Users className="w-4 h-4" />, description: '按年龄区间触发（如25-35岁抗初老）', category: '属性触发' },
];

const HOLIDAYS = ['元旦', '春节', '情人节', '三八妇女节', '母亲节', '七夕', '中秋节', '国庆节', '双十一', '圣诞节'];
const SEASONS = ['春季（3-5月）', '夏季（6-8月）', '秋季（9-11月）', '冬季（12-2月）'];

// --- Mock 策略数据 ---
const MOCK_STRATEGIES: Strategy[] = [
  {
    id: 1, name: '沉睡客户唤醒计划', description: '针对30天以上未到店的客户，发送专属优惠券唤醒',
    triggerRules: [
      { type: 'last_visit', label: '最近消费时间', icon: <Clock className="w-4 h-4" />, params: { operator: '大于', days: 30 } },
      { type: 'member_level', label: '会员等级', icon: <UserCheck className="w-4 h-4" />, params: { level: '银卡及以上' } },
    ],
    actions: [
      { type: 'coupon', label: '优惠券', value: '满500减100' },
      { type: 'sms', label: '短信通知', value: '个性化唤醒短信' },
    ],
    targetCount: 156, status: '启用', executionType: '自动', executionTime: '每周一 09:00',
    lastExecuted: '2026-03-31', createdAt: '2026-02-15',
    effect: { triggerCount: 48, totalTriggerCount: 312, reachedCount: 156, couponUsedRate: '32%', returnRate: '28%', revenue: 45600, cost: 8200, dailyTrend: [8, 6, 9, 5, 7, 6, 7] },
  },
  {
    id: 2, name: '生日专属关怀', description: '生日当月自动发送祝福和专属折扣',
    triggerRules: [
      { type: 'birthday', label: '生日关怀', icon: <Gift className="w-4 h-4" />, params: { timing: '生日前7天' } },
    ],
    actions: [
      { type: 'discount', label: '折扣', value: '生日月全场8折' },
      { type: 'gift', label: '赠品', value: '精美生日礼盒' },
      { type: 'points', label: '积分', value: '双倍积分' },
      { type: 'sms', label: '短信通知', value: '生日祝福短信' },
    ],
    targetCount: 78, status: '启用', executionType: '自动', executionTime: '每日 08:00 检查',
    lastExecuted: '2026-03-31', createdAt: '2026-01-01',
    effect: { triggerCount: 78, totalTriggerCount: 890, reachedCount: 78, couponUsedRate: '58%', returnRate: '55%', revenue: 62400, cost: 5600, dailyTrend: [12, 10, 15, 8, 11, 9, 13] },
  },
  {
    id: 3, name: '春季焕肤推荐', description: '春季换季期间推荐敏感肌护理方案',
    triggerRules: [
      { type: 'seasonal', label: '季节性护肤', icon: <Sun className="w-4 h-4" />, params: { season: '春季（3-5月）' } },
      { type: 'service_interest' as TriggerType, label: '项目/服务偏好', icon: <Heart className="w-4 h-4" />, params: { category: '敏感肌护理' } },
    ],
    actions: [
      { type: 'coupon', label: '优惠券', value: '春季护理套餐立减200' },
      { type: 'push', label: '推送通知', value: '换季护肤指南推送' },
    ],
    targetCount: 230, status: '启用', executionType: '自动', executionTime: '3月1日-5月31日',
    lastExecuted: '2026-03-25', createdAt: '2026-02-28',
    effect: { triggerCount: 65, totalTriggerCount: 230, reachedCount: 230, couponUsedRate: '38%', returnRate: '35%', revenue: 89200, cost: 12000, dailyTrend: [10, 8, 12, 9, 11, 7, 8] },
  },
  {
    id: 4, name: '高消费客户维护', description: '累计消费超过2万的VIP客户专属服务',
    triggerRules: [
      { type: 'consumption', label: '消费金额', icon: <ShoppingBag className="w-4 h-4" />, params: { operator: '大于', amount: 20000, period: '累计' } },
    ],
    actions: [
      { type: 'discount', label: '折扣', value: 'VIP专属9折' },
      { type: 'gift', label: '赠品', value: '季度护肤礼包' },
    ],
    targetCount: 45, status: '启用', executionType: '手动', executionTime: '每季度执行',
    lastExecuted: '2026-03-15', createdAt: '2025-12-01',
    effect: { triggerCount: 15, totalTriggerCount: 180, reachedCount: 45, couponUsedRate: '65%', returnRate: '62%', revenue: 128000, cost: 9500, dailyTrend: [3, 2, 4, 1, 2, 2, 1] },
  },
  {
    id: 5, name: '母亲节感恩活动', description: '母亲节期间推出亲子护理套餐',
    triggerRules: [
      { type: 'holiday', label: '节假日营销', icon: <Calendar className="w-4 h-4" />, params: { holiday: '母亲节' } },
    ],
    actions: [
      { type: 'coupon', label: '优惠券', value: '亲子套餐立减300' },
      { type: 'sms', label: '短信通知', value: '母亲节活动通知' },
    ],
    targetCount: 0, status: '草稿', executionType: '自动', executionTime: '5月1日-5月12日',
    lastExecuted: '-', createdAt: '2026-03-28',
  },
  {
    id: 6, name: '新客首次体验', description: '新注册客户7天内未消费自动推送体验券',
    triggerRules: [
      { type: 'new_customer', label: '新客户引导', icon: <Users className="w-4 h-4" />, params: { withinDays: 7 } },
    ],
    actions: [
      { type: 'coupon', label: '优惠券', value: '首单立减50' },
      { type: 'push', label: '推送通知', value: '新人专属体验推荐' },
    ],
    targetCount: 34, status: '停用', executionType: '自动', executionTime: '注册后第3天',
    lastExecuted: '2026-03-20', createdAt: '2025-10-01',
    effect: { triggerCount: 0, totalTriggerCount: 156, reachedCount: 34, couponUsedRate: '22%', returnRate: '18%', revenue: 12800, cost: 3200, dailyTrend: [0, 0, 0, 0, 0, 0, 0] },
  },
];

export function CreateMarketing() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [strategies, setStrategies] = useState(MOCK_STRATEGIES);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('全部');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);
  const [dialogMode, setDialogMode] = useState<'add' | 'edit'>('add');
  const [wizardStep, setWizardStep] = useState(1); // 1=规则, 2=文案通知, 3=确认

  // 创建表单状态
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formExecType, setFormExecType] = useState<'自动' | '手动'>('自动');
  const [formExecTime, setFormExecTime] = useState('');
  const [selectedTriggers, setSelectedTriggers] = useState<TriggerType[]>([]);
  const [triggerParams, setTriggerParams] = useState<Record<string, Record<string, string>>>({});
  const [formActions, setFormActions] = useState<{ type: string; value: string }[]>([]);
  const [formNotifyChannels, setFormNotifyChannels] = useState<string[]>([]);
  const [channelContents, setChannelContents] = useState<Record<string, string>>({});
  const [generatingChannel, setGeneratingChannel] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'info' | 'copywriting' | 'edit'>('info');
  const [showTriggerPicker, setShowTriggerPicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-open create dialog from URL params (from 客户画像/智能推荐 linkage)
  useEffect(() => {
    const autoName = searchParams.get('name');
    const autoDesc = searchParams.get('desc');
    const autoTrigger = searchParams.get('trigger') as TriggerType | null;
    const autoActions = searchParams.get('actions');
    const autoChannels = searchParams.get('channels');
    const autoGenerate = searchParams.get('autoGenerate') === 'true';
    if (autoName) {
      setDialogMode('add');
      setFormName(autoName);
      setFormDesc(autoDesc || '');
      setFormExecType('自动');
      setFormExecTime('每日 09:00 检查');
      setSelectedTriggers(autoTrigger ? [autoTrigger] : []);
      const actions = autoActions ? JSON.parse(autoActions) : [];
      setFormActions(actions);
      const channels = autoChannels ? autoChannels.split(',') : ['sms', 'miniapp'];
      setFormNotifyChannels(channels);
      setChannelContents({});

      if (autoGenerate) {
        // Auto-jump to step 2 and generate all channel content
        setWizardStep(2);
        const actionText = actions.map((a: any) => a.value).join('、') || '专属优惠';
        const ruleName = autoName;
        const genContent: Record<string, string> = {};
        for (const ch of channels) {
          switch (ch) {
            case 'sms': genContent[ch] = `【心悦芸】亲爱的{客户名}，${ruleName}来啦！${actionText}，限时15天，点击预约→ mini.beauty.com/r 回T退订`; break;
            case 'miniapp': genContent[ch] = `🌸 ${ruleName}\n${actionText}，限时特惠！\n点击查看详情，立即预约体验 →`; break;
            case 'wechat': genContent[ch] = `✨ ${ruleName}\n\n亲爱的会员，${actionText}的专属福利！\n\n⏰ 限时优惠，名额有限\n📍 心悦芸美容养生会所`; break;
            case 'group': genContent[ch] = `姐妹们～ ${ruleName}开始啦 🎉\n${actionText}！名额有限先到先得哦～ 💕`; break;
            case 'store': genContent[ch] = `【话术】"X姐您好，${ruleName}，${actionText}。特别适合您，要不要帮您预约？"`; break;
            case 'moments': genContent[ch] = `${ruleName} | ${actionText}\n📍 心悦芸美容养生会所 🔥 限时特惠`; break;
          }
        }
        setChannelContents(genContent);
      } else {
        setWizardStep(1);
      }

      setShowCreateDialog(true);
      setSearchParams({}, { replace: true });
    }
  }, []);

  const filtered = strategies.filter((s) => {
    if (keyword && !s.name.includes(keyword) && !s.description.includes(keyword)) return false;
    if (statusFilter !== '全部' && s.status !== statusFilter) return false;
    return true;
  });

  const activeCount = strategies.filter(s => s.status === '启用').length;
  const totalTarget = strategies.filter(s => s.status === '启用').reduce((sum, s) => sum + s.targetCount, 0);

  const getStatusColor = (status: Strategy['status']) => {
    switch (status) {
      case '启用': return 'bg-green-100 text-green-700';
      case '停用': return 'bg-gray-100 text-gray-500';
      case '草稿': return 'bg-yellow-100 text-yellow-700';
    }
  };

  const getActionColor = (type: string) => {
    switch (type) {
      case 'coupon': return 'bg-blue-100 text-blue-700';
      case 'discount': return 'bg-purple-100 text-purple-700';
      case 'gift': return 'bg-pink-100 text-pink-700';
      case 'points': return 'bg-orange-100 text-orange-700';
      case 'sms': return 'bg-green-100 text-green-700';
      case 'push': return 'bg-indigo-100 text-indigo-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const handleCreate = () => {
    setDialogMode('add');
    setWizardStep(1);
    setFormName(''); setFormDesc(''); setFormExecType('自动'); setFormExecTime('');
    setSelectedTriggers([]); setTriggerParams({}); setFormActions([]); setFormNotifyChannels([]);
    setChannelContents({});
    setShowCreateDialog(true);
  };

  const handleEdit = (s: Strategy) => {
    setDialogMode('edit');
    setFormName(s.name); setFormDesc(s.description); setFormExecType(s.executionType as '自动' | '手动'); setFormExecTime(s.executionTime);
    setSelectedTriggers(s.triggerRules.map(r => r.type));
    setFormActions(s.actions.map(a => ({ type: a.type, value: a.value })));
    setSelectedStrategy(s);
    setShowCreateDialog(true);
  };

  const handleViewDetail = (s: Strategy) => { setSelectedStrategy(s); setShowDetailDialog(true); };

  const toggleTrigger = (type: TriggerType) => {
    setSelectedTriggers(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  };

  const addAction = () => { setFormActions(prev => [...prev, { type: 'coupon', value: '' }]); };
  const removeAction = (idx: number) => { setFormActions(prev => prev.filter((_, i) => i !== idx)); };

  const handleToggleStatus = (s: Strategy) => {
    setStrategies(prev => prev.map(item => item.id === s.id ? { ...item, status: item.status === '启用' ? '停用' : '启用' } : item));
    toast.success(s.status === '启用' ? '策略已停用' : '策略已启用');
  };

  const handleDelete = (s: Strategy) => {
    setStrategies(prev => prev.filter(item => item.id !== s.id));
    toast.success('策略已删除');
  };

  const handleCopy = (s: Strategy) => {
    setDialogMode('add');
    setFormName(`${s.name}（副本）`);
    setFormDesc(s.description);
    setFormExecType(s.executionType as '自动' | '手动');
    setFormExecTime(s.executionTime);
    setSelectedTriggers(s.triggerRules.map(r => r.type));
    setFormActions(s.actions.map(a => ({ type: a.type, value: a.value })));
    setFormNotifyChannels([]);
    setChannelContents({});
    setSelectedStrategy(null);
    setShowCreateDialog(true);
  };

  // AI 渠道文案生成
  const generateChannelContent = (channel: string) => {
    setGeneratingChannel(channel);
    const actionText = formActions.map((a) => a.value).join('、') || '专属优惠';
    const ruleName = formName || '营销活动';
    setTimeout(() => {
      let content = '';
      switch (channel) {
        case 'sms':
          content = `【心悦芸】亲爱的{客户名}，${ruleName}来啦！${actionText}，限时15天，点击预约→ mini.beauty.com/r 回T退订`;
          break;
        case 'miniapp':
          content = `🌸 ${ruleName}\n${actionText}，限时特惠！\n点击查看详情，立即预约体验 →`;
          break;
        case 'wechat':
          content = `✨ ${ruleName}\n\n亲爱的会员，我们为您精心准备了${actionText}的专属福利！\n\n🎁 活动亮点：\n• ${actionText}\n• 专业美容师一对一服务\n• 进口高端产品\n\n⏰ 限时优惠，名额有限\n📍 心悦芸美容养生会所\n\n点击下方按钮立即预约 ↓`;
          break;
        case 'group':
          content = `姐妹们～ ${ruleName}开始啦 🎉\n${actionText}！\n名额有限先到先得哦～\n需要的姐妹私聊我预约时间 💕`;
          break;
        case 'store':
          content = `【美容师话术】\n"X姐您好，最近我们门店推出了${ruleName}，${actionText}。根据您上次的护理情况，这个活动特别适合您，要不要帮您预约一下？"`;
          break;
        case 'moments':
          content = `${ruleName} | ${actionText}\n📍 心悦芸美容养生会所\n🔥 限时特惠，点击了解详情`;
          break;
      }
      setChannelContents((prev) => ({ ...prev, [channel]: content }));
      setGeneratingChannel(null);
    }, 1000);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="text-sm text-gray-500">首页 / 智能营销 / 自动营销</div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">自动营销</h2>
          <p className="text-sm text-gray-500 mt-1">创建和管理自动化营销规则，基于客户行为和时间规则自动触发发券和通知</p>
        </div>
        <Button className="gap-2" onClick={handleCreate}><Plus className="w-4 h-4" /> 创建规则</Button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
          <div className="text-sm text-blue-600 mb-1">规则总数</div>
          <div className="text-2xl font-bold text-blue-900">{strategies.length}</div>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4">
          <div className="text-sm text-green-600 mb-1">运行中</div>
          <div className="text-2xl font-bold text-green-900">{activeCount}</div>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4">
          <div className="text-sm text-purple-600 mb-1">覆盖客户</div>
          <div className="text-2xl font-bold text-purple-900">{totalTarget}</div>
        </div>
        <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4">
          <div className="text-sm text-orange-600 mb-1">本月触发次数</div>
          <div className="text-2xl font-bold text-orange-900">328</div>
        </div>
      </div>

      {/* 状态标签栏 + 搜索 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {(['全部', '启用', '停用', '草稿'] as const).map((status) => {
            const count = status === '全部' ? strategies.length : strategies.filter(s => s.status === status).length;
            return (
              <button key={status} onClick={() => setStatusFilter(status)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${statusFilter === status ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {status} ({count})
              </button>
            );
          })}
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input className="pl-9" placeholder="搜索策略名称" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        </div>
      </div>

      {/* 策略列表 */}
      <div className="space-y-4">
        {filtered.map((strategy) => (
          <div key={strategy.id} className="border border-gray-200 rounded-lg p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-gray-800 text-lg">{strategy.name}</h3>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(strategy.status)}`}>{strategy.status}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${strategy.executionType === '自动' ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-600'}`}>
                    {strategy.executionType}执行
                  </span>
                </div>
                <p className="text-sm text-gray-500">{strategy.description}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-4">
                <Button size="sm" variant="outline" className="gap-1" onClick={() => { setSelectedStrategy(strategy); setDetailTab('info'); setShowDetailDialog(true); }}><Eye className="w-3 h-3" /> 管理</Button>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => { navigator.clipboard?.writeText(`https://mini.beauty-salon.com/rule/${strategy.id}`); toast.success('分享链接已复制'); }}><Share2 className="w-3 h-3" /> 分享</Button>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => handleToggleStatus(strategy)}>
                  {strategy.status === '启用' ? <><Pause className="w-3 h-3" /> 停用</> : <><Play className="w-3 h-3" /> 启用</>}
                </Button>
                <Button size="sm" variant="outline" className="gap-1 text-red-500 hover:text-red-600 hover:border-red-300" onClick={() => handleDelete(strategy)}><Trash2 className="w-3 h-3" /> 删除</Button>
              </div>
            </div>

            {/* 触发规则 */}
            <div className="mb-3">
              <div className="text-xs text-gray-500 mb-2">触发规则</div>
              <div className="flex flex-wrap gap-2">
                {strategy.triggerRules.map((rule, idx) => (
                  <span key={idx} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                    {rule.icon}
                    <span className="font-medium">{rule.label}</span>
                    <span className="text-blue-500">
                      {Object.values(rule.params).join(' ')}
                    </span>
                  </span>
                ))}
              </div>
            </div>

            {/* 执行动作 */}
            <div className="mb-3">
              <div className="text-xs text-gray-500 mb-2">执行动作</div>
              <div className="flex flex-wrap gap-2">
                {strategy.actions.map((action, idx) => (
                  <span key={idx} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${getActionColor(action.type)}`}>
                    {action.label}：{action.value}
                  </span>
                ))}
              </div>
            </div>

            {/* 底部数据 */}
            <div className="flex items-center gap-6 pt-3 border-t border-gray-100 text-sm text-gray-500">
              <span className="flex items-center gap-1"><Target className="w-3.5 h-3.5" /> 触达 {strategy.effect?.reachedCount || strategy.targetCount} 人</span>
              <span className="flex items-center gap-1"><TrendingDown className="w-3.5 h-3.5" /> 核销率 {strategy.effect?.couponUsedRate || '-'}</span>
              <span className="flex items-center gap-1"><TrendingDown className="w-3.5 h-3.5" /> 回店率 {strategy.effect?.returnRate || '-'}</span>
              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {strategy.executionTime}</span>
              <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> 上次执行 {strategy.lastExecuted}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ===== 创建规则向导 ===== */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" aria-describedby="strategy-create-desc">
          <DialogHeader>
            <DialogTitle>创建自动营销规则</DialogTitle>
          </DialogHeader>
          <span id="strategy-create-desc" className="sr-only">分步创建自动营销规则</span>

          {/* 进度条 */}
          <div className="flex items-center gap-2 mb-6">
            {[{ step: 1, label: '定义规则' }, { step: 2, label: '文案与通知' }, { step: 3, label: '确认启用' }].map((s, i) => (
              <div key={s.step} className="flex items-center flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium shrink-0 ${wizardStep >= s.step ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>{s.step}</div>
                <span className={`ml-2 text-sm ${wizardStep >= s.step ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>{s.label}</span>
                {i < 2 && <div className={`flex-1 h-0.5 mx-3 ${wizardStep > s.step ? 'bg-blue-600' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>

          {/* 步骤1: 定义规则 */}
          {wizardStep === 1 && (
            <div className="space-y-5">
              <div className="border border-gray-200 rounded-lg p-5">
                <h4 className="font-medium text-gray-800 mb-3 flex items-center gap-2"><Target className="w-4 h-4 text-blue-600" /> 基础信息</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">规则名称 <span className="text-red-500">*</span></label>
                    <Input placeholder="如：沉睡客户唤醒计划" value={formName} onChange={(e) => setFormName(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">规则描述</label>
                    <textarea className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md" rows={2} placeholder="描述规则的目标和预期效果" value={formDesc} onChange={(e) => setFormDesc(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">执行方式</label>
                      <select className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md" value={formExecType} onChange={(e) => setFormExecType(e.target.value as '自动' | '手动')}>
                        <option value="自动">自动执行</option><option value="手动">手动执行</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">执行时间</label>
                      <Input placeholder="如：每周一 09:00" value={formExecTime} onChange={(e) => setFormExecTime(e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>

              {/* 触发规则 */}
              <div className="border border-gray-200 rounded-lg p-5">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-gray-800 flex items-center gap-2"><Filter className="w-4 h-4 text-blue-600" /> 触发规则</h4>
                </div>
                {selectedTriggers.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {selectedTriggers.map((type) => {
                      const opt = TRIGGER_OPTIONS.find(o => o.type === type)!;
                      return (
                        <div key={type} className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2">
                          {opt.icon}<span className="font-medium text-blue-800 text-sm">{opt.label}</span>
                          <button onClick={() => toggleTrigger(type)} className="ml-auto text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <button onClick={() => setShowTriggerPicker(!showTriggerPicker)} className="w-full border-2 border-dashed border-gray-300 rounded-lg p-3 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors flex items-center justify-center gap-2">
                  <Plus className="w-4 h-4" /> 添加触发规则
                </button>
                {showTriggerPicker && (
                  <div className="mt-3 border border-gray-200 rounded-lg p-4 bg-gray-50">
                    {['时间触发', '行为触发', '属性触发'].map(cat => (
                      <div key={cat} className="mb-3">
                        <div className="text-xs text-gray-500 mb-2">{cat}</div>
                        <div className="grid grid-cols-2 gap-2">
                          {TRIGGER_OPTIONS.filter(o => o.category === cat).map(opt => (
                            <button key={opt.type} onClick={() => { toggleTrigger(opt.type); setShowTriggerPicker(false); }} disabled={selectedTriggers.includes(opt.type)}
                              className={`flex items-center gap-2 p-2 rounded-lg border text-left text-sm ${selectedTriggers.includes(opt.type) ? 'border-blue-300 bg-blue-50 opacity-50' : 'border-gray-200 bg-white hover:border-blue-300'}`}>
                              {opt.icon}<div><div className="font-medium">{opt.label}</div><div className="text-xs text-gray-500">{opt.description}</div></div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 营销动作 */}
              <div className="border border-gray-200 rounded-lg p-5">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-gray-800 flex items-center gap-2"><Zap className="w-4 h-4 text-blue-600" /> 营销动作</h4>
                  <button onClick={addAction} className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> 添加</button>
                </div>
                {formActions.length === 0 && <div className="text-center py-4 text-gray-400 text-sm">请添加营销动作</div>}
                <div className="space-y-2">
                  {formActions.map((action, idx) => (
                    <div key={idx} className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                      <select className="h-9 px-3 text-sm border border-gray-300 rounded-md" value={action.type} onChange={(e) => { const next = [...formActions]; next[idx].type = e.target.value; setFormActions(next); }}>
                        <option value="coupon">优惠券</option><option value="discount">折扣</option><option value="gift">赠品</option><option value="points">积分奖励</option><option value="experience">体验价</option><option value="recharge">储值赠送</option>
                      </select>
                      <Input className="flex-1" placeholder="如：满500减100" value={action.value} onChange={(e) => { const next = [...formActions]; next[idx].value = e.target.value; setFormActions(next); }} />
                      <button onClick={() => removeAction(idx)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>取消</Button>
                <Button onClick={() => { if (!formName.trim()) { toast.error('请输入规则名称'); return; } setWizardStep(2); }}>下一步 →</Button>
              </div>
            </div>
          )}

          {/* 步骤2: 文案与通知 */}
          {wizardStep === 2 && (
            <div className="space-y-5">
              <div className="border border-gray-200 rounded-lg p-5">
                <h4 className="font-medium text-gray-800 mb-3">🤖 自动触达渠道</h4>
                <p className="text-xs text-gray-500 mb-3">系统自动发送，配置文案后即可生效</p>
                <div className="space-y-3">
                  {[
                    { value: 'sms', label: '📱 短信通知', hint: '70字以内', rows: 3 },
                    { value: 'miniapp', label: '📲 小程序推送', hint: '标题+内容', rows: 3 },
                    { value: 'wechat', label: '💬 公众号模板消息', hint: '模板参数', rows: 3 },
                  ].map((ch) => (
                    <div key={ch.value} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <label className="flex items-center gap-2 cursor-pointer" onClick={() => setFormNotifyChannels((prev) => prev.includes(ch.value) ? prev.filter((c) => c !== ch.value) : [...prev, ch.value])}>
                          <input type="checkbox" checked={formNotifyChannels.includes(ch.value)} readOnly className="w-4 h-4 text-purple-600 rounded" />
                          <span className="text-sm font-medium text-gray-900">{ch.label}</span>
                          <span className="text-xs text-gray-400">{ch.hint}</span>
                        </label>
                        {formNotifyChannels.includes(ch.value) && (
                          <button type="button" onClick={() => generateChannelContent(ch.value)} disabled={generatingChannel === ch.value}
                            className="text-xs text-purple-600 hover:text-purple-700 flex items-center gap-1 disabled:opacity-50">
                            {generatingChannel === ch.value ? <><Sparkles className="w-3 h-3 animate-spin" /> 生成中</> : <><Sparkles className="w-3 h-3" /> AI生成</>}
                          </button>
                        )}
                      </div>
                      {formNotifyChannels.includes(ch.value) && (
                        <textarea rows={ch.rows} value={channelContents[ch.value] || ''} onChange={(e) => setChannelContents((prev) => ({ ...prev, [ch.value]: e.target.value }))}
                          placeholder={`请输入${ch.label.slice(2)}文案，或点击AI生成`}
                          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg p-5">
                <h4 className="font-medium text-gray-800 mb-3">👤 人工待办渠道</h4>
                <p className="text-xs text-gray-500 mb-3">生成待办任务提醒运营人员执行</p>
                <div className="space-y-3">
                  {[
                    { value: 'group', label: '👥 社群通知', hint: '口语化', rows: 3 },
                    { value: 'store', label: '🏪 门店话术', hint: '美容师话术', rows: 3 },
                    { value: 'moments', label: '📢 朋友圈广告', hint: '广告文案', rows: 2 },
                  ].map((ch) => (
                    <div key={ch.value} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <label className="flex items-center gap-2 cursor-pointer" onClick={() => setFormNotifyChannels((prev) => prev.includes(ch.value) ? prev.filter((c) => c !== ch.value) : [...prev, ch.value])}>
                          <input type="checkbox" checked={formNotifyChannels.includes(ch.value)} readOnly className="w-4 h-4 text-orange-500 rounded" />
                          <span className="text-sm font-medium text-gray-900">{ch.label}</span>
                          <span className="text-xs text-gray-400">{ch.hint}</span>
                        </label>
                        {formNotifyChannels.includes(ch.value) && (
                          <button type="button" onClick={() => generateChannelContent(ch.value)} disabled={generatingChannel === ch.value}
                            className="text-xs text-purple-600 hover:text-purple-700 flex items-center gap-1 disabled:opacity-50">
                            {generatingChannel === ch.value ? <><Sparkles className="w-3 h-3 animate-spin" /> 生成中</> : <><Sparkles className="w-3 h-3" /> AI生成</>}
                          </button>
                        )}
                      </div>
                      {formNotifyChannels.includes(ch.value) && (
                        <textarea rows={ch.rows} value={channelContents[ch.value] || ''} onChange={(e) => setChannelContents((prev) => ({ ...prev, [ch.value]: e.target.value }))}
                          placeholder={`请输入${ch.label.slice(2)}文案，或点击AI生成`}
                          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400 resize-none" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setWizardStep(1)}>← 上一步</Button>
                <Button onClick={() => setWizardStep(3)}>下一步 →</Button>
              </div>
            </div>
          )}

          {/* 步骤3: 确认启用 */}
          {wizardStep === 3 && (
            <div className="space-y-5">
              <div className="bg-gray-50 rounded-lg p-5 space-y-4">
                <h4 className="font-medium text-gray-800">规则摘要</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-gray-500">规则名称：</span><span className="font-medium text-gray-900">{formName}</span></div>
                  <div><span className="text-gray-500">执行方式：</span><span className="text-gray-900">{formExecType}执行</span></div>
                  <div><span className="text-gray-500">执行时间：</span><span className="text-gray-900">{formExecTime || '未设置'}</span></div>
                </div>
                <div>
                  <span className="text-sm text-gray-500">触发规则：</span>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {selectedTriggers.map((t) => { const opt = TRIGGER_OPTIONS.find(o => o.type === t); return <span key={t} className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">{opt?.label || t}</span>; })}
                    {selectedTriggers.length === 0 && <span className="text-xs text-gray-400">未设置</span>}
                  </div>
                </div>
                <div>
                  <span className="text-sm text-gray-500">营销动作：</span>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {formActions.map((a, i) => <span key={i} className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">{a.value || a.type}</span>)}
                    {formActions.length === 0 && <span className="text-xs text-gray-400">未设置</span>}
                  </div>
                </div>
                <div>
                  <span className="text-sm text-gray-500">通知渠道：</span>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {formNotifyChannels.map((ch) => {
                      const labels: Record<string, string> = { sms: '📱短信', miniapp: '📲小程序', wechat: '💬公众号', group: '👥社群', store: '🏪门店', moments: '📢朋友圈' };
                      const hasContent = !!channelContents[ch];
                      return <span key={ch} className={`px-2 py-1 rounded text-xs ${hasContent ? 'bg-purple-100 text-purple-700' : 'bg-yellow-100 text-yellow-700'}`}>{labels[ch] || ch} {hasContent ? '✓' : '(未配文案)'}</span>;
                    })}
                    {formNotifyChannels.length === 0 && <span className="text-xs text-gray-400">未设置</span>}
                  </div>
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setWizardStep(2)}>← 上一步</Button>
                <div className="flex gap-3">
                  <Button variant="outline" disabled={isSubmitting} onClick={async () => {
                    setIsSubmitting(true);
                    try { await saveStrategyDraft({ name: formName, description: formDesc, executionType: formExecType, executionTime: formExecTime }); toast.success('已保存为草稿'); setShowCreateDialog(false); } catch { toast.error('保存失败'); } finally { setIsSubmitting(false); }
                  }}>保存草稿</Button>
                  <Button disabled={isSubmitting} onClick={async () => {
                    setIsSubmitting(true);
                    try { await createStrategy({ name: formName, description: formDesc, executionType: formExecType, executionTime: formExecTime }); toast.success('规则已创建并启用'); setShowCreateDialog(false); } catch { toast.error('创建失败'); } finally { setIsSubmitting(false); }
                  }}>
                    {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} 创建并启用
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== 规则详情弹窗 ===== */}
      <Dialog open={showDetailDialog} onOpenChange={(v) => { setShowDetailDialog(v); if (!v) setDetailTab('info'); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" aria-describedby="strategy-detail-desc">
          <DialogHeader><DialogTitle>规则详情</DialogTitle></DialogHeader>
          <span id="strategy-detail-desc" className="sr-only">查看自动营销规则详细信息</span>
          {selectedStrategy && (
            <div className="mt-2">
              {/* Tab 切换 */}
              <div className="flex gap-4 border-b border-gray-200 mb-5">
                {[{ id: 'info' as const, label: '规则信息' }, { id: 'copywriting' as const, label: '文案配置' }].map((tab) => (
                  <button key={tab.id} onClick={() => setDetailTab(tab.id)}
                    className={`pb-3 px-1 text-sm font-medium transition-colors relative ${detailTab === tab.id ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
                    {tab.label}
                    {detailTab === tab.id && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600" />}
                  </button>
                ))}
              </div>

              {/* 规则信息 Tab */}
              {detailTab === 'info' && (
                <div className="space-y-5">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-gray-800">{selectedStrategy.name}</h3>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(selectedStrategy.status)}`}>{selectedStrategy.status}</span>
                  </div>
                  <p className="text-sm text-gray-600">{selectedStrategy.description}</p>
                  <div className="bg-gray-50 rounded-lg p-4 grid grid-cols-2 gap-4">
                    <div><div className="text-xs text-gray-500">执行方式</div><div className="text-sm font-medium text-gray-800 mt-1">{selectedStrategy.executionType}执行</div></div>
                    <div><div className="text-xs text-gray-500">执行时间</div><div className="text-sm text-gray-800 mt-1">{selectedStrategy.executionTime}</div></div>
                    <div><div className="text-xs text-gray-500">覆盖客户</div><div className="text-sm font-semibold text-blue-600 mt-1">{selectedStrategy.targetCount} 人</div></div>
                    <div><div className="text-xs text-gray-500">上次执行</div><div className="text-sm text-gray-800 mt-1">{selectedStrategy.lastExecuted}</div></div>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">触发规则</h4>
                    <div className="space-y-2">
                      {selectedStrategy.triggerRules.map((rule, idx) => (
                        <div key={idx} className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5">
                          {rule.icon}<span className="font-medium text-blue-800">{rule.label}</span><span className="text-blue-600">{Object.values(rule.params).join(' ')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">营销动作</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedStrategy.actions.map((action, idx) => (
                        <span key={idx} className={`inline-flex px-3 py-1.5 rounded-full text-sm font-medium ${getActionColor(action.type)}`}>{action.label}：{action.value}</span>
                      ))}
                    </div>
                  </div>
                  {selectedStrategy.effect && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-3">效果数据</h4>
                      <div className="grid grid-cols-4 gap-3 mb-4">
                        <div className="bg-blue-50 rounded-lg p-3 text-center"><div className="text-xl font-bold text-blue-900">{selectedStrategy.effect.triggerCount}</div><div className="text-xs text-blue-600">本月触发</div></div>
                        <div className="bg-green-50 rounded-lg p-3 text-center"><div className="text-xl font-bold text-green-900">{selectedStrategy.effect.reachedCount}</div><div className="text-xs text-green-600">触达人数</div></div>
                        <div className="bg-purple-50 rounded-lg p-3 text-center"><div className="text-xl font-bold text-purple-900">{selectedStrategy.effect.couponUsedRate}</div><div className="text-xs text-purple-600">核销率</div></div>
                        <div className="bg-orange-50 rounded-lg p-3 text-center"><div className="text-xl font-bold text-orange-900">¥{selectedStrategy.effect.revenue.toLocaleString()}</div><div className="text-xs text-orange-600">带来营收</div></div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between"><span className="text-sm text-gray-600">回店率</span><span className="text-sm font-semibold text-gray-900">{selectedStrategy.effect.returnRate}</span></div>
                        <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between"><span className="text-sm text-gray-600">ROI</span><span className="text-sm font-semibold text-gray-900">{selectedStrategy.effect.cost > 0 ? `${(selectedStrategy.effect.revenue / selectedStrategy.effect.cost).toFixed(1)}x` : '-'}</span></div>
                      </div>
                      <div><div className="text-xs text-gray-500 mb-2">近7天触发趋势</div><div className="flex items-end gap-1.5 h-16">{selectedStrategy.effect.dailyTrend.map((val, idx) => { const max = Math.max(...selectedStrategy.effect!.dailyTrend, 1); return (<div key={idx} className="flex-1 flex flex-col items-center gap-1"><div className="w-full bg-blue-500 rounded-t" style={{ height: `${(val / max) * 100}%`, minHeight: val > 0 ? '4px' : '0' }} /><span className="text-[10px] text-gray-400">{['一', '二', '三', '四', '五', '六', '日'][idx]}</span></div>); })}</div></div>
                    </div>
                  )}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-3">最近执行记录</h4>
                    <div className="space-y-2">
                      {[
                        { time: '2026-04-11 09:00', action: '自动发送优惠券', target: '张雅文等3位客户', result: '成功' },
                        { time: '2026-04-10 09:00', action: '自动发送短信通知', target: '李美琪等5位客户', result: '成功' },
                        { time: '2026-04-09 09:00', action: '自动发送优惠券', target: '王思涵等2位客户', result: '成功' },
                        { time: '2026-04-08 09:00', action: '自动发送优惠券', target: '陈诗语等4位客户', result: '部分失败' },
                      ].map((record, idx) => (
                        <div key={idx} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg text-sm">
                          <span className="text-gray-500">{record.time}</span><span className="text-gray-700">{record.action}</span><span className="text-gray-600">{record.target}</span>
                          <span className={record.result === '成功' ? 'text-green-600' : 'text-orange-500'}>{record.result}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 文案配置 Tab */}
              {detailTab === 'copywriting' && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-500">为每个通知渠道配置推送文案，自动渠道配置完成后即可自动发送</p>
                  {[
                    { value: 'sms', label: '📱 短信通知', group: 'auto', hint: '70字以内，含品牌签名和退订提示', rows: 3 },
                    { value: 'miniapp', label: '📲 小程序推送', group: 'auto', hint: '标题20字+内容50字', rows: 3 },
                    { value: 'wechat', label: '💬 公众号模板消息', group: 'auto', hint: '模板消息参数', rows: 3 },
                    { value: 'group', label: '👥 社群通知', group: 'manual', hint: '口语化，200字以内', rows: 3 },
                    { value: 'store', label: '🏪 门店话术', group: 'manual', hint: '美容师沟通话术', rows: 3 },
                    { value: 'moments', label: '📢 朋友圈广告', group: 'manual', hint: '广告文案', rows: 2 },
                  ].map((ch) => (
                    <div key={ch.value} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">{ch.label}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${ch.group === 'auto' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'}`}>
                            {ch.group === 'auto' ? '自动发送' : '人工执行'}
                          </span>
                        </div>
                        <button type="button" onClick={() => generateChannelContent(ch.value)} disabled={generatingChannel === ch.value}
                          className="text-xs text-purple-600 hover:text-purple-700 flex items-center gap-1 disabled:opacity-50">
                          {generatingChannel === ch.value ? <><Sparkles className="w-3 h-3 animate-spin" /> 生成中...</> : <><Sparkles className="w-3 h-3" /> AI生成文案</>}
                        </button>
                      </div>
                      <textarea
                        rows={ch.rows}
                        value={channelContents[ch.value] || ''}
                        onChange={(e) => setChannelContents((prev) => ({ ...prev, [ch.value]: e.target.value }))}
                        placeholder={ch.hint}
                        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
                      />
                      {ch.value === 'sms' && channelContents[ch.value] && (
                        <div className={`mt-1 text-xs ${channelContents[ch.value].length > 70 ? 'text-red-500' : 'text-gray-400'}`}>{channelContents[ch.value].length}/70字</div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 mt-5">
                {selectedStrategy.status === '启用' ? (
                  <Button variant="outline" className="gap-1"><Pause className="w-4 h-4" /> 停用规则</Button>
                ) : (
                  <Button className="gap-1"><Play className="w-4 h-4" /> 启用规则</Button>
                )}
                <Button variant="outline" className="gap-1" onClick={() => { setShowDetailDialog(false); handleEdit(selectedStrategy); }}>
                  <Edit className="w-4 h-4" /> 编辑
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
