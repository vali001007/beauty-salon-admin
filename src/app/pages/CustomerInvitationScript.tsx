import React, { useState } from 'react';
import { Clipboard, Eye, Loader2, Save, Send, Sparkles, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { generateCustomerInvitationScript } from '@/api/ai';
import { getInvitationCandidates, saveAutomationStrategyDraft } from '@/api/marketing';
import type { CustomerInvitationScriptRequest } from '@/types/ai';
import type { InvitationCandidate } from '@/types/marketing';
import { Button, Input } from '../components/UI';

type ScriptType = 'project' | 'promotion' | 'custom' | null;

type GeneratedCustomer = InvitationCandidate & {
  id: number;
  script: string;
};

interface Message {
  role: 'ai' | 'user';
  content: string;
  customers?: GeneratedCustomer[];
}

const initialMessages: Message[] = [
  { role: 'ai', content: '你好，我可以基于真实客户数据和 AI Gateway 生成客户邀约话术。' },
];

function getErrorMessage(error: unknown) {
  const payload = (error as { payload?: { message?: string }; message?: string })?.payload;
  return payload?.message || (error as Error)?.message || '生成失败，请确认后端服务、AI 配置和当前门店数据是否正常。';
}

export function CustomerInvitationScript() {
  const [selectedType, setSelectedType] = useState<ScriptType>(null);
  const [showFormPanel, setShowFormPanel] = useState(false);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [isTyping, setIsTyping] = useState(false);
  const [userInput, setUserInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [actionSubmitting, setActionSubmitting] = useState<Record<string, boolean>>({});

  const [projectForm, setProjectForm] = useState({
    projectName: '',
    targetAudience: '',
    originalPrice: '',
    discountPrice: '',
    discount: '',
    promotionTime: '',
  });

  const [promotionForm, setPromotionForm] = useState({
    activityName: '',
    activityType: '',
    targetAudience: '',
    discountInfo: '',
    activityTime: '',
    participationRules: '',
  });

  const [customForm, setCustomForm] = useState({
    customerName: '',
    projectService: '',
    invitationReason: '',
    preferredTime: '',
    specialOffer: '',
  });

  const handleTypeChange = (type: ScriptType) => {
    setSelectedType(type);
    setShowFormPanel(true);
    setError('');
  };

  const buildPayload = (): CustomerInvitationScriptRequest => {
    if (selectedType === 'project') {
      return {
        scenario: 'project',
        projectName: projectForm.projectName,
        targetAudience: projectForm.targetAudience,
        offer: [
          projectForm.discountPrice ? `优惠价 ${projectForm.discountPrice} 元` : '',
          projectForm.discount ? `折扣 ${projectForm.discount}` : '',
          projectForm.promotionTime ? `推广日期 ${projectForm.promotionTime}` : '',
        ].filter(Boolean).join('，'),
        channel: 'wechat',
      };
    }

    if (selectedType === 'promotion') {
      return {
        scenario: 'promotion',
        activityName: promotionForm.activityName,
        promotionName: promotionForm.activityName,
        targetAudience: promotionForm.targetAudience,
        offer: [
          promotionForm.activityType,
          promotionForm.discountInfo,
          promotionForm.activityTime ? `活动日期 ${promotionForm.activityTime}` : '',
          promotionForm.participationRules,
        ].filter(Boolean).join('，'),
        channel: 'wechat',
      };
    }

    return {
      scenario: 'custom',
      customerName: customForm.customerName,
      projectName: customForm.projectService,
      invitationReason: customForm.invitationReason,
      preferredTime: customForm.preferredTime,
      specialOffer: customForm.specialOffer,
      offer: customForm.specialOffer,
      channel: 'wechat',
    };
  };

  const handleSubmit = async () => {
    if (!selectedType) {
      setError('请先选择项目推广、促销活动或定制邀约。');
      return;
    }

    const payload = buildPayload();
    const prompt = [
      selectedType === 'project' ? '项目推广' : selectedType === 'promotion' ? '促销活动' : '定制邀约',
      payload.customerName ? `客户：${payload.customerName}` : '',
      payload.projectName ? `项目：${payload.projectName}` : '',
      payload.activityName ? `活动：${payload.activityName}` : '',
      payload.offer ? `权益：${payload.offer}` : '',
    ].filter(Boolean).join(' / ');

    setMessages((prev) => [...prev, { role: 'user', content: prompt }]);
    setIsTyping(true);
    setError('');

    try {
      const result = await generateCustomerInvitationScript(payload);
      setMessages((prev) => [...prev, { role: 'ai', content: result.text }]);
    } catch (currentError) {
      const message = getErrorMessage(currentError);
      setError(message);
      setMessages((prev) => [...prev, { role: 'ai', content: message }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleOneClickGenerate = async () => {
    setIsGenerating(true);
    setIsTyping(true);
    setError('');

    try {
      const response = await getInvitationCandidates({ limit: 10 });
      if (!response.items.length) {
        throw new Error(response.emptyReason || '当前门店暂无可邀约客户，请先运行客户预测或补充客户消费数据。');
      }

      const customers = await Promise.all(
        response.items.map(async (candidate, index) => {
          const result = await generateCustomerInvitationScript({
            scenario: 'custom',
            customerId: candidate.customerId,
            customerName: candidate.customerName,
            skinType: candidate.skinType,
            lastVisit: candidate.lastVisitDate,
            projectName: candidate.preferredProjectNames[0],
            invitationReason: candidate.reason,
            evidence: candidate.evidence,
            channel: 'wechat',
          });

          return {
            ...candidate,
            id: candidate.customerId || index + 1,
            script: result.text,
          };
        }),
      );

      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          content: `已基于${response.source === 'prediction' ? '最新客户预测' : '真实客户档案'}生成 ${customers.length} 位客户邀约话术。`,
          customers,
        },
      ]);
    } catch (currentError) {
      const message = getErrorMessage(currentError);
      setError(message);
      setMessages((prev) => [...prev, { role: 'ai', content: message }]);
    } finally {
      setIsGenerating(false);
      setIsTyping(false);
    }
  };

  const handleFreeTextGenerate = async () => {
    const content = userInput.trim();
    if (!content) return;

    setUserInput('');
    setMessages((prev) => [...prev, { role: 'user', content }]);
    setIsTyping(true);
    setError('');

    try {
      const result = await generateCustomerInvitationScript({
        scenario: 'custom',
        invitationReason: content,
        channel: 'wechat',
      });
      setMessages((prev) => [...prev, { role: 'ai', content: result.text }]);
    } catch (currentError) {
      const message = getErrorMessage(currentError);
      setError(message);
      setMessages((prev) => [...prev, { role: 'ai', content: message }]);
    } finally {
      setIsTyping(false);
    }
  };

  const copyScript = async (script: string) => {
    try {
      await navigator.clipboard.writeText(script);
      toast.success('话术已复制');
    } catch {
      toast.error('复制失败，请手动选中文案复制');
    }
  };

  const openCustomerProfile = (customerId: number) => {
    window.location.href = `/customers/profile?customerId=${customerId}`;
  };

  const saveDraft = async (customer: GeneratedCustomer) => {
    const key = String(customer.customerId);
    setActionSubmitting((prev) => ({ ...prev, [key]: true }));
    try {
      await saveAutomationStrategyDraft({
        name: `${customer.customerName}邀约跟进`,
        description: customer.reason,
        executionType: 'manual',
        source: 'manual',
        schedule: { type: 'date_range' },
        triggerRules: [
          {
            type: 'member_level',
            parameterSource: 'customized',
            params: { customerId: customer.customerId },
          },
        ],
        ruleRelation: 'AND',
        actions: [
          {
            type: 'wechat',
            channel: 'wechat',
            value: customer.script,
            contentTemplate: customer.script,
          },
        ],
      });
      toast.success('营销策略草稿已保存');
    } catch (currentError) {
      toast.error(getErrorMessage(currentError));
    } finally {
      setActionSubmitting((prev) => ({ ...prev, [key]: false }));
    }
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <div className="relative flex flex-1 flex-col overflow-hidden rounded-t-lg border border-gray-100 bg-gray-50/50 shadow-sm">
        <div className="z-10 shrink-0 border-b border-gray-100 bg-white p-4 font-medium text-gray-800 shadow-sm">
          客户邀约助手
        </div>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={`flex items-start gap-4 ${message.role === 'user' ? 'justify-end' : ''}`}>
              {message.role === 'ai' && (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-500 text-sm font-medium text-white shadow-sm">
                  AI
                </div>
              )}
              <div className={message.role === 'ai' ? 'max-w-[85%]' : 'max-w-[80%]'}>
                <div
                  className={`whitespace-pre-line rounded-2xl px-5 py-3 text-[15px] leading-relaxed shadow-sm ${
                    message.role === 'ai'
                      ? 'rounded-tl-none border border-gray-100 bg-white text-gray-700'
                      : 'rounded-tr-none bg-blue-500 text-white'
                  }`}
                >
                  {message.content}
                </div>

                {message.customers && message.customers.length > 0 && (
                  <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-white">
                    <div className="border-b border-gray-200 bg-gray-50 p-3">
                      <div className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-purple-600" />
                        <h3 className="text-sm font-semibold text-gray-800">真实候选客户动作卡</h3>
                        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                          {message.customers.length}人
                        </span>
                      </div>
                    </div>

                    <div className="max-h-[500px] divide-y divide-gray-200 overflow-y-auto">
                      {message.customers.map((customer, customerIndex) => (
                        <div key={customer.customerId} className="p-4 transition-colors hover:bg-gray-50">
                          <div className="flex items-start gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-500 text-sm font-semibold text-white">
                              {customerIndex + 1}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="mb-1 flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-gray-900">{customer.customerName}</span>
                                {customer.memberLevel && (
                                  <span className="rounded bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
                                    {customer.memberLevel}
                                  </span>
                                )}
                                <span className="text-xs text-gray-500">
                                  {[customer.skinType, customer.preferredProjectNames.join('、')].filter(Boolean).join(' · ')}
                                </span>
                              </div>
                              <p className="mb-2 text-xs text-gray-600">推荐理由：{customer.reason}</p>
                              {customer.evidence.length > 0 && (
                                <div className="mb-2 flex flex-wrap gap-1">
                                  {customer.evidence.map((item) => (
                                    <span key={item} className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                                      {item}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                                <div className="mb-2 flex items-center justify-between">
                                  <span className="text-xs font-medium text-gray-700">邀约话术</span>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => copyScript(customer.script)}
                                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                                    >
                                      <Clipboard className="h-3.5 w-3.5" /> 复制
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openCustomerProfile(customer.customerId)}
                                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                                    >
                                      <Eye className="h-3.5 w-3.5" /> 画像
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => saveDraft(customer)}
                                      disabled={Boolean(actionSubmitting[String(customer.customerId)])}
                                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-60"
                                    >
                                      {actionSubmitting[String(customer.customerId)] ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <Save className="h-3.5 w-3.5" />
                                      )}
                                      草稿
                                    </button>
                                  </div>
                                </div>
                                <p className="whitespace-pre-line text-xs leading-relaxed text-gray-700">{customer.script}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {message.role === 'user' && (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-400 text-sm font-medium text-white shadow-sm">
                  我
                </div>
              )}
            </div>
          ))}

          {isTyping && (
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-500 text-sm font-medium text-white shadow-sm">
                AI
              </div>
              <div className="flex items-center gap-1 rounded-2xl rounded-tl-none border border-gray-100 bg-white px-5 py-3 text-lg text-gray-700 shadow-sm">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: '0ms' }} />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: '150ms' }} />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {showFormPanel ? (
        <div className="relative shrink-0 rounded-b-lg border border-t-0 border-gray-200 bg-white p-6 shadow-sm">
          <button
            type="button"
            onClick={() => setShowFormPanel(false)}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="mb-6 flex items-center gap-3">
            {(['project', 'promotion', 'custom'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => handleTypeChange(type)}
                className={`rounded-lg px-6 py-2 text-sm font-medium transition-all ${
                  selectedType === type ? 'bg-blue-500 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {type === 'project' ? '项目推广' : type === 'promotion' ? '促销活动' : '定制邀约'}
              </button>
            ))}
          </div>

          {selectedType === 'project' && (
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-800">项目推广</h3>
              <div className="grid grid-cols-2 gap-x-12 gap-y-6">
                <label className="flex flex-col gap-2 text-sm font-medium text-gray-700">
                  项目名称
                  <select
                    value={projectForm.projectName}
                    onChange={(event) => setProjectForm((prev) => ({ ...prev, projectName: event.target.value }))}
                    className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">请选择项目名称</option>
                    <option value="巨补水">巨补水</option>
                    <option value="古方灸">古方灸</option>
                    <option value="欧蜜丽养盘">欧蜜丽养盘</option>
                    <option value="泡澡">泡澡</option>
                  </select>
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-gray-700">
                  适用人群
                  <Input value={projectForm.targetAudience} onChange={(event) => setProjectForm((prev) => ({ ...prev, targetAudience: event.target.value }))} />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-gray-700">
                  原价格
                  <Input type="number" value={projectForm.originalPrice} onChange={(event) => setProjectForm((prev) => ({ ...prev, originalPrice: event.target.value }))} />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-gray-700">
                  优惠价格
                  <Input type="number" value={projectForm.discountPrice} onChange={(event) => setProjectForm((prev) => ({ ...prev, discountPrice: event.target.value }))} />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-gray-700">
                  优惠折扣
                  <Input value={projectForm.discount} onChange={(event) => setProjectForm((prev) => ({ ...prev, discount: event.target.value }))} />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-gray-700">
                  推广时间
                  <Input type="date" value={projectForm.promotionTime} onChange={(event) => setProjectForm((prev) => ({ ...prev, promotionTime: event.target.value }))} />
                </label>
              </div>
            </div>
          )}

          {selectedType === 'promotion' && (
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-800">促销活动</h3>
              <div className="grid grid-cols-2 gap-x-12 gap-y-6">
                <label className="flex flex-col gap-2 text-sm font-medium text-gray-700">
                  活动名称
                  <Input value={promotionForm.activityName} onChange={(event) => setPromotionForm((prev) => ({ ...prev, activityName: event.target.value }))} />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-gray-700">
                  活动类型
                  <select
                    value={promotionForm.activityType}
                    onChange={(event) => setPromotionForm((prev) => ({ ...prev, activityType: event.target.value }))}
                    className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">请选择活动类型</option>
                    <option value="限时折扣">限时折扣</option>
                    <option value="满减优惠">满减优惠</option>
                    <option value="买赠活动">买赠活动</option>
                    <option value="会员专享">会员专享</option>
                  </select>
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-gray-700">
                  适用人群
                  <Input value={promotionForm.targetAudience} onChange={(event) => setPromotionForm((prev) => ({ ...prev, targetAudience: event.target.value }))} />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-gray-700">
                  优惠信息
                  <Input value={promotionForm.discountInfo} onChange={(event) => setPromotionForm((prev) => ({ ...prev, discountInfo: event.target.value }))} />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-gray-700">
                  活动时间
                  <Input type="date" value={promotionForm.activityTime} onChange={(event) => setPromotionForm((prev) => ({ ...prev, activityTime: event.target.value }))} />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-gray-700">
                  参与规则
                  <Input value={promotionForm.participationRules} onChange={(event) => setPromotionForm((prev) => ({ ...prev, participationRules: event.target.value }))} />
                </label>
              </div>
            </div>
          )}

          {selectedType === 'custom' && (
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-800">定制邀约</h3>
              <div className="grid grid-cols-2 gap-x-12 gap-y-6">
                <label className="flex flex-col gap-2 text-sm font-medium text-gray-700">
                  客户姓名
                  <Input value={customForm.customerName} onChange={(event) => setCustomForm((prev) => ({ ...prev, customerName: event.target.value }))} />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-gray-700">
                  项目/服务
                  <Input value={customForm.projectService} onChange={(event) => setCustomForm((prev) => ({ ...prev, projectService: event.target.value }))} />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-gray-700">
                  邀约理由
                  <Input value={customForm.invitationReason} onChange={(event) => setCustomForm((prev) => ({ ...prev, invitationReason: event.target.value }))} />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-gray-700">
                  建议时间
                  <Input type="datetime-local" value={customForm.preferredTime} onChange={(event) => setCustomForm((prev) => ({ ...prev, preferredTime: event.target.value }))} />
                </label>
                <label className="col-span-2 flex flex-col gap-2 text-sm font-medium text-gray-700">
                  专属优惠
                  <Input value={customForm.specialOffer} onChange={(event) => setCustomForm((prev) => ({ ...prev, specialOffer: event.target.value }))} />
                </label>
              </div>
            </div>
          )}

          {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

          <div className="mt-6 flex items-center justify-end gap-3 border-t border-gray-200 pt-6">
            <Button onClick={handleSubmit} disabled={isTyping} className="gap-2 bg-blue-600 hover:bg-blue-700">
              {isTyping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              生成文案
            </Button>
          </div>
        </div>
      ) : (
        <div className="shrink-0 rounded-b-lg border border-t-0 border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleOneClickGenerate}
              disabled={isGenerating}
              className="flex items-center gap-2 rounded-lg bg-purple-600 px-6 py-3 text-sm font-medium text-white shadow-md transition-all hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              一键生成
            </button>
            <button type="button" onClick={() => handleTypeChange('project')} className="rounded-lg bg-blue-500 px-6 py-3 text-sm font-medium text-white shadow-sm transition-all hover:bg-blue-600">
              项目推广
            </button>
            <button type="button" onClick={() => handleTypeChange('promotion')} className="rounded-lg bg-blue-500 px-6 py-3 text-sm font-medium text-white shadow-sm transition-all hover:bg-blue-600">
              促销活动
            </button>
            <button type="button" onClick={() => handleTypeChange('custom')} className="rounded-lg bg-blue-500 px-6 py-3 text-sm font-medium text-white shadow-sm transition-all hover:bg-blue-600">
              定制邀约
            </button>
          </div>

          {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

          <div className="flex items-center gap-3">
            <Input
              placeholder="输入邀约需求..."
              className="h-11 flex-1 border-gray-300"
              value={userInput}
              onChange={(event) => setUserInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleFreeTextGenerate();
              }}
            />
            <Button onClick={handleFreeTextGenerate} disabled={isTyping || !userInput.trim()} className="h-11 gap-2 bg-blue-600 px-6 hover:bg-blue-700">
              {isTyping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              发送
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
