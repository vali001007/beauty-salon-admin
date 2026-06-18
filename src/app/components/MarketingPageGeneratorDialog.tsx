import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Loader2, Megaphone, Smartphone, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { generateActivityPage } from '@/api/ai';
import { createMarketingPage, publishMarketingPage } from '@/api/marketingPage';
import { buildMarketingPageUrl, normalizeMarketingShareUrl } from '@/config/marketingAssets';
import type { ActivityPageSchema, GenerateActivityPageRequest, GenerateActivityPageResult, Product, Project } from '@/types';
import {
  buildMarketingPagePayloadFromPageDraft,
  buildProductMarketingPageDraft,
  buildProjectMarketingPageDraft,
  type MarketingPageDraft,
} from '@/utils/marketingPageGenerator';
import { Button, Input } from './UI';
import { ActivityMiniPage, type ActivityPageData } from './ActivityMiniPage';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';

export type MarketingPageGeneratorSource =
  | { type: 'product'; item: Product; storeName?: string; storePhone?: string; storeAddress?: string }
  | { type: 'project'; item: Project; storeName?: string; storePhone?: string; storeAddress?: string };

interface MarketingPageGeneratorDialogProps {
  source: MarketingPageGeneratorSource | null;
  onClose: () => void;
  onPublished?: () => void;
}

type GeneratorForm = {
  title: string;
  offer: string;
  targetCustomers: string;
  description: string;
};

function buildDraftFromSource(source: MarketingPageGeneratorSource, form: Partial<GeneratorForm>, aiGenerationId: string) {
  const options = {
    ...form,
    storeName: source.storeName,
    storePhone: source.storePhone,
    storeAddress: source.storeAddress,
    aiGenerationId,
  };
  return source.type === 'product'
    ? buildProductMarketingPageDraft(source.item, options)
    : buildProjectMarketingPageDraft(source.item, options);
}

function buildPreviewData(draft: MarketingPageDraft): ActivityPageData {
  return {
    title: draft.title,
    description: draft.description,
    discount: draft.offer,
    startDate: draft.startDate,
    endDate: draft.endDate,
    targetCustomers: draft.targetCustomers,
    posterBg: draft.posterBg,
    posterImage: draft.posterImage,
    posterTitleColor: '#FFFFFF',
    projects:
      draft.sourceType === 'project'
        ? draft.recommendedItems.map((item) => ({
            name: item.name,
            price: item.activityPrice ?? item.price ?? 0,
            type: item.category,
          }))
        : undefined,
    products:
      draft.sourceType === 'product'
        ? draft.recommendedItems.map((item) => ({
            name: item.name,
            price: item.activityPrice ?? item.price ?? 0,
            category: item.category,
          }))
        : undefined,
    storeName: draft.storeName,
    storePhone: draft.storePhone,
    layout: draft.sourceType === 'project' ? 'modern' : 'classic',
    pageSchema: draft.pageSchema,
    aiGenerationId: draft.aiGenerationId,
  };
}

function getOfferFromSchema(schema: ActivityPageSchema) {
  return schema.sections.find((section): section is Extract<ActivityPageSchema['sections'][number], { type: 'offer' }> => section.type === 'offer')?.offer;
}

function getDescriptionFromSchema(schema: ActivityPageSchema) {
  const hero = schema.sections.find((section): section is Extract<ActivityPageSchema['sections'][number], { type: 'hero' }> => section.type === 'hero');
  return schema.subtitle || hero?.description || hero?.subtitle || '';
}

function buildFormFromSchema(schema: ActivityPageSchema, previous: GeneratorForm): GeneratorForm {
  return {
    title: schema.title || previous.title,
    offer: getOfferFromSchema(schema) || previous.offer,
    targetCustomers: schema.audienceLabel || previous.targetCustomers,
    description: getDescriptionFromSchema(schema) || previous.description,
  };
}

function applyFormToPageSchema(schema: ActivityPageSchema, form: GeneratorForm): ActivityPageSchema {
  const title = form.title.trim() || schema.title;
  const description = form.description.trim() || schema.subtitle;
  const audienceLabel = form.targetCustomers.trim() || schema.audienceLabel;
  const offer = form.offer.trim();

  return {
    ...schema,
    title,
    subtitle: description,
    audienceLabel,
    sections: schema.sections.map((section) => {
      if (section.type === 'hero') {
        return { ...section, title, description };
      }
      if (section.type === 'offer') {
        return { ...section, offer: offer || section.offer };
      }
      return section;
    }),
  };
}

function getAiPageSchema(result: GenerateActivityPageResult | null, selectedVariantIndex: number) {
  if (!result) return null;
  return result.pageVariants?.[selectedVariantIndex]?.pageSchema ?? result.pageSchema ?? null;
}

export function MarketingPageGeneratorDialog({ source, onClose, onPublished }: MarketingPageGeneratorDialogProps) {
  const [form, setForm] = useState<GeneratorForm>({
    title: '',
    offer: '',
    targetCustomers: '',
    description: '',
  });
  const [aiGenerationId, setAiGenerationId] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiResult, setAiResult] = useState<GenerateActivityPageResult | null>(null);
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);

  useEffect(() => {
    if (!source) return;
    const nextGenerationId = `${source.type}-page-${source.item.id}-${Date.now()}`;
    const draft = buildDraftFromSource(source, {}, nextGenerationId);
    setAiGenerationId(nextGenerationId);
    setForm({
      title: draft.title,
      offer: draft.offer,
      targetCustomers: draft.targetCustomers,
      description: draft.description,
    });
    setShowPreview(false);
    setPublishedUrl('');
    setCopied(false);
    setAiResult(null);
    setSelectedVariantIndex(0);
  }, [source]);

  const draft = useMemo(() => {
    if (!source || !aiGenerationId) return null;
    return buildDraftFromSource(source, form, aiGenerationId);
  }, [aiGenerationId, form, source]);

  const aiPageSchema = useMemo(() => getAiPageSchema(aiResult, selectedVariantIndex), [aiResult, selectedVariantIndex]);
  const currentPageSchema = useMemo(() => {
    if (!draft) return null;
    return applyFormToPageSchema(aiPageSchema ?? draft.pageSchema, form);
  }, [aiPageSchema, draft, form]);
  const effectiveDraft = useMemo(() => {
    if (!draft || !currentPageSchema) return null;
    return {
      ...draft,
      pageSchema: currentPageSchema,
      aiGenerationId: aiResult?.id ?? draft.aiGenerationId,
    };
  }, [aiResult?.id, currentPageSchema, draft]);
  const previewData = useMemo(() => {
    if (!effectiveDraft) return null;
    return {
      ...buildPreviewData(effectiveDraft),
      layout: aiPageSchema ? 'modern' as const : effectiveDraft.sourceType === 'project' ? 'modern' as const : 'classic' as const,
    };
  }, [aiPageSchema, effectiveDraft]);

  if (!source || !draft || !effectiveDraft || !previewData || !currentPageSchema) return null;

  const sourceTitle = source.type === 'product' ? '商品推广页' : '项目预约页';
  const sourceMeta =
    source.type === 'product'
      ? `${source.item.categoryName || '商品'} / ${source.item.brand || '门店优选'} / ${source.item.spec || '-'}`
      : `${source.item.type || '护理项目'} / ${source.item.duration || 60} 分钟 / ¥${Number(source.item.price || 0)}`;

  const updateForm = (key: keyof GeneratorForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleAiGenerate = async () => {
    if (!source || !draft || isAiGenerating) return;
    setIsAiGenerating(true);
    try {
      const request: GenerateActivityPageRequest = {
        campaignName: form.title || source.item.name,
        targetAudience: form.targetCustomers || '门店会员',
        offer: form.offer || '到店享专属护理建议',
        projectNames: source.type === 'project' ? [source.item.name] : undefined,
        productNames: source.type === 'product' ? [source.item.name] : undefined,
        startDate: draft.startDate,
        endDate: draft.endDate,
        storeName: source.storeName || draft.storeName,
        storePhone: source.storePhone || draft.storePhone,
        storeAddress: source.storeAddress,
      };
      const result = await generateActivityPage(request);
      const nextSchema = getAiPageSchema(result, 0);
      if (!nextSchema || result.safety?.blocked || nextSchema.safety?.blocked) {
        throw new Error(result.safety?.reasons?.[0] || nextSchema?.safety?.reasons?.[0] || 'AI 页面方案未通过安全检查');
      }
      setAiResult(result);
      setSelectedVariantIndex(0);
      setForm((prev) => buildFormFromSchema(nextSchema, prev));
      toast.success('AI 已生成页面方案');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI 生成失败，请稍后重试';
      toast.error(message);
    } finally {
      setIsAiGenerating(false);
    }
  };

  const handleSelectVariant = (index: number) => {
    const nextSchema = getAiPageSchema(aiResult, index);
    if (!nextSchema) return;
    setSelectedVariantIndex(index);
    setForm((prev) => buildFormFromSchema(nextSchema, prev));
  };

  const handlePublish = async () => {
    if (!effectiveDraft) return;
    setIsPublishing(true);
    try {
      const page = await createMarketingPage(buildMarketingPagePayloadFromPageDraft(effectiveDraft));
      const publishedPage = await publishMarketingPage(page.id);
      const url = normalizeMarketingShareUrl(publishedPage.shareUrl) || buildMarketingPageUrl(publishedPage.slug);
      setPublishedUrl(url);
      toast.success(`${effectiveDraft.sourceLabel}推广页已发布到小程序/H5`);
      onPublished?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : '推广页发布失败，请稍后重试';
      toast.error(message);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleCopyUrl = () => {
    if (!publishedUrl) return;
    navigator.clipboard?.writeText(publishedUrl);
    setCopied(true);
    toast.success('推广链接已复制');
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <>
      <Dialog open={Boolean(source)} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-5xl" aria-describedby="marketing-page-generator-desc">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-600" />
              生成{sourceTitle}
            </DialogTitle>
            <DialogDescription id="marketing-page-generator-desc">
              从当前商品或项目自动生成营销 H5/小程序页面草稿，确认后可发布为独立营销页面。
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white">
                    {source.item.image ? (
                      <img src={source.item.image} alt={source.item.name} className="h-full w-full object-cover" />
                    ) : (
                      <Megaphone className="h-6 w-6 text-gray-400" />
                    )}
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">{sourceTitle}</div>
                    <div className="font-semibold text-gray-900">{source.item.name}</div>
                  </div>
                </div>
                <div className="space-y-2 text-sm text-gray-600">
                  <div>{sourceMeta}</div>
                  <div>门店：{effectiveDraft.storeName}</div>
                  <div>默认周期：{effectiveDraft.startDate} 至 {effectiveDraft.endDate}</div>
                </div>
              </div>

              <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
                <div className="font-medium">本轮开发说明</div>
                <p className="mt-2 leading-relaxed">
                  当前会发布为独立 MarketingPage，页面会进入营销页面库，并生成可复制的 H5/小程序分享链接。
                </p>
              </div>

              {publishedUrl && (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-700">
                    <Check className="h-4 w-4" />
                    已发布
                  </div>
                  <div className="truncate text-xs text-emerald-700">{publishedUrl}</div>
                  <Button variant="outline" size="sm" className="mt-3 gap-1 bg-white" onClick={handleCopyUrl}>
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? '已复制' : '复制链接'}
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-gray-700">页面标题</span>
                  <Input value={form.title} onChange={(event) => updateForm('title', event.target.value)} />
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-gray-700">权益/价格表达</span>
                  <Input value={form.offer} onChange={(event) => updateForm('offer', event.target.value)} />
                </label>
              </div>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-gray-700">目标人群</span>
                <Input value={form.targetCustomers} onChange={(event) => updateForm('targetCustomers', event.target.value)} />
              </label>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-gray-700">页面描述</span>
                <textarea
                  className="min-h-28 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500"
                  value={form.description}
                  onChange={(event) => updateForm('description', event.target.value)}
                />
              </label>

              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="mb-3 text-sm font-medium text-gray-800">将生成的页面模块</div>
                <div className="flex flex-wrap gap-2">
                  {currentPageSchema.sections.map((section) => (
                    <span key={`${section.type}-${section.title ?? ''}`} className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
                      {section.title || section.type}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-purple-100 bg-purple-50 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-purple-900">AI 页面方案</div>
                    <div className="text-xs text-purple-700">用后端 AI 生成更适合客户浏览的页面结构，失败时仍可用本地草稿。</div>
                  </div>
                  <Button variant="outline" size="sm" className="gap-2 bg-white" onClick={handleAiGenerate} disabled={isAiGenerating}>
                    {isAiGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {isAiGenerating ? '生成中' : 'AI 生成'}
                  </Button>
                </div>
                {aiResult?.pageVariants && aiResult.pageVariants.length > 1 && (
                  <div className="flex flex-wrap gap-2">
                    {aiResult.pageVariants.map((variant, index) => (
                      <Button
                        key={variant.id}
                        size="sm"
                        variant={index === selectedVariantIndex ? 'default' : 'outline'}
                        onClick={() => handleSelectVariant(index)}
                      >
                        {variant.name}
                      </Button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4">
                <Button variant="outline" onClick={onClose} disabled={isPublishing}>
                  取消
                </Button>
                <Button variant="outline" className="gap-2" onClick={() => setShowPreview(true)}>
                  <Smartphone className="h-4 w-4" />
                  手机预览
                </Button>
                <Button className="gap-2" onClick={handlePublish} disabled={isPublishing || currentPageSchema.safety.blocked}>
                  {isPublishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  发布推广页
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {showPreview && (
        <ActivityMiniPage
          data={previewData}
          onClose={() => setShowPreview(false)}
          publishActionLabel="发布推广页"
          onPublish={handlePublish}
          isPublishing={isPublishing}
        />
      )}
    </>
  );
}
