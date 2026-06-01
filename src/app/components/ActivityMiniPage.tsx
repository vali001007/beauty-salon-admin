import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Calendar,
  Check,
  ChevronRight,
  Copy,
  Gift,
  HelpCircle,
  MapPin,
  MessageCircle,
  Phone,
  Share2,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { buildMarketingActivityUrl } from '@/config/marketingAssets';
import type { ActivityPageSchema, ActivityPageSection } from '@/types/ai';

export interface ActivityPageData {
  title: string;
  description: string;
  discount: string;
  startDate: string;
  endDate: string;
  targetCustomers: string;
  posterBg?: string;
  posterImage?: string;
  posterTitleColor?: string;
  projects?: Array<{ name: string; price: number; type?: string }>;
  products?: Array<{ name: string; price: number; category?: string }>;
  storeName?: string;
  storePhone?: string;
  layout: 'classic' | 'modern' | 'elegant' | 'vibrant';
  pageSchema?: ActivityPageSchema;
  aiGenerationId?: string;
}

interface ActivityMiniPageProps {
  data: ActivityPageData;
  onClose: () => void;
  showSharePanel?: boolean;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  publishActionLabel?: string;
  onPublish?: () => void | Promise<void>;
  isPublishing?: boolean;
}

const LAYOUT_STYLES = {
  classic: {
    headerBg: 'bg-gradient-to-br from-pink-500 to-rose-600',
    accent: 'text-pink-600',
    border: 'border-pink-100',
    softBg: 'bg-pink-50',
    btn: 'bg-pink-500 hover:bg-pink-600',
    btnRing: 'ring-pink-200',
  },
  modern: {
    headerBg: 'bg-gradient-to-br from-blue-500 to-indigo-600',
    accent: 'text-blue-600',
    border: 'border-blue-100',
    softBg: 'bg-blue-50',
    btn: 'bg-blue-500 hover:bg-blue-600',
    btnRing: 'ring-blue-200',
  },
  elegant: {
    headerBg: 'bg-gradient-to-br from-amber-600 to-yellow-700',
    accent: 'text-amber-700',
    border: 'border-amber-100',
    softBg: 'bg-amber-50',
    btn: 'bg-amber-600 hover:bg-amber-700',
    btnRing: 'ring-amber-200',
  },
  vibrant: {
    headerBg: 'bg-gradient-to-br from-purple-500 to-fuchsia-600',
    accent: 'text-purple-600',
    border: 'border-purple-100',
    softBg: 'bg-purple-50',
    btn: 'bg-purple-500 hover:bg-purple-600',
    btnRing: 'ring-purple-200',
  },
};

const SECTION_ICONS: Record<string, typeof Gift> = {
  offer: Gift,
  benefits: ShieldCheck,
  project_recommendation: Sparkles,
  product_recommendation: Gift,
  skin_care_advice: Sparkles,
  consultant_note: MessageCircle,
  faq: HelpCircle,
  notice: ShieldCheck,
  store_info: MapPin,
};

function formatPrice(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '';
  return `¥${Math.round(value).toLocaleString('zh-CN')}`;
}

function getHeroSection(schema?: ActivityPageSchema) {
  return schema?.sections.find((section) => section.type === 'hero');
}

function SectionCard({
  title,
  type,
  children,
  style,
}: {
  title?: string;
  type: ActivityPageSection['type'];
  children: ReactNode;
  style: (typeof LAYOUT_STYLES)['classic'];
}) {
  const Icon = SECTION_ICONS[type] || Gift;
  return (
    <div className={`mx-4 mt-3 rounded-xl border ${style.border} bg-white p-4 shadow-sm`}>
      {title && (
        <h3 className="mb-3 flex items-center gap-2 font-semibold text-gray-900">
          <Icon className={`h-4 w-4 ${style.accent}`} />
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}

function renderSchemaSection(section: ActivityPageSection, style: (typeof LAYOUT_STYLES)['classic']) {
  switch (section.type) {
    case 'hero':
      return null;
    case 'offer':
      return (
        <SectionCard key={section.type} title={section.title} type={section.type} style={style}>
          <div className={`rounded-lg ${style.softBg} p-3`}>
            <div className={`text-lg font-bold ${style.accent}`}>{section.offer}</div>
            {section.description && <p className="mt-2 text-sm leading-relaxed text-gray-600">{section.description}</p>}
          </div>
          {(section.validFrom || section.validTo) && (
            <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
              <Calendar className="h-3.5 w-3.5" />
              {section.validFrom || '即日起'} 至 {section.validTo || '活动结束'}
            </div>
          )}
          {section.highlights?.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {section.highlights.map((item) => (
                <span key={item} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">
                  {item}
                </span>
              ))}
            </div>
          ) : null}
        </SectionCard>
      );
    case 'benefits':
      return (
        <SectionCard key={section.type} title={section.title} type={section.type} style={style}>
          <div className="space-y-3">
            {section.items.map((item) => (
              <div key={item.title} className="flex gap-3">
                <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${style.btn.split(' ')[0]}`} />
                <div>
                  <div className="text-sm font-medium text-gray-900">{item.title}</div>
                  <div className="mt-0.5 text-xs leading-relaxed text-gray-500">{item.description}</div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      );
    case 'project_recommendation':
      return (
        <SectionCard key={section.type} title={section.title} type={section.type} style={style}>
          <div className="space-y-2">
            {section.items.map((item) => (
              <div key={item.name} className="rounded-lg border border-gray-100 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{item.name}</div>
                    {item.description && <div className="mt-1 text-xs leading-relaxed text-gray-500">{item.description}</div>}
                    {item.reason && <div className={`mt-2 text-xs ${style.accent}`}>{item.reason}</div>}
                  </div>
                  <div className="shrink-0 text-right">
                    {item.originalPrice && (
                      <div className="text-xs text-gray-400 line-through">{formatPrice(item.originalPrice)}</div>
                    )}
                    {item.activityPrice && <div className={`text-sm font-bold ${style.accent}`}>{formatPrice(item.activityPrice)}</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      );
    case 'product_recommendation':
      return (
        <SectionCard key={section.type} title={section.title} type={section.type} style={style}>
          <div className="grid grid-cols-2 gap-3">
            {section.items.map((item) => (
              <div key={item.name} className="rounded-lg bg-gray-50 p-3">
                <div className="text-sm font-medium text-gray-900">{item.name}</div>
                {item.category && <div className="mt-1 text-xs text-gray-400">{item.category}</div>}
                {item.description && <div className="mt-1 text-xs leading-relaxed text-gray-500">{item.description}</div>}
                {item.activityPrice && <div className={`mt-2 text-sm font-bold ${style.accent}`}>{formatPrice(item.activityPrice)}</div>}
              </div>
            ))}
          </div>
        </SectionCard>
      );
    case 'skin_care_advice':
      return (
        <SectionCard key={section.type} title={section.title} type={section.type} style={style}>
          <p className="text-sm leading-relaxed text-gray-600">{section.advice}</p>
          {section.tags?.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {section.tags.map((tag) => (
                <span key={tag} className={`rounded-full ${style.softBg} px-2.5 py-1 text-xs ${style.accent}`}>
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </SectionCard>
      );
    case 'consultant_note':
      return (
        <SectionCard key={section.type} title={section.title} type={section.type} style={style}>
          <p className="text-sm leading-relaxed text-gray-600">{section.note}</p>
          {section.consultantName && <div className="mt-3 text-xs text-gray-400">{section.consultantName}</div>}
        </SectionCard>
      );
    case 'faq':
      return (
        <SectionCard key={section.type} title={section.title} type={section.type} style={style}>
          <div className="space-y-3">
            {section.items.map((item) => (
              <div key={item.question}>
                <div className="text-sm font-medium text-gray-900">{item.question}</div>
                <div className="mt-1 text-xs leading-relaxed text-gray-500">{item.answer}</div>
              </div>
            ))}
          </div>
        </SectionCard>
      );
    case 'notice':
      return (
        <SectionCard key={section.type} title={section.title} type={section.type} style={style}>
          <ul className="space-y-2 text-xs leading-relaxed text-gray-500">
            {section.items.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gray-400" />
                {item}
              </li>
            ))}
          </ul>
        </SectionCard>
      );
    case 'store_info':
      return (
        <SectionCard key={section.type} title={section.title} type={section.type} style={style}>
          <div className="space-y-2 text-sm text-gray-700">
            <div className="font-medium text-gray-900">{section.storeName}</div>
            {section.address && <div className="flex gap-2 text-xs text-gray-500"><MapPin className="h-3.5 w-3.5" />{section.address}</div>}
            {section.phone && (
              <a href={`tel:${section.phone}`} className={`flex items-center gap-2 text-xs font-medium ${style.accent}`}>
                <Phone className="h-3.5 w-3.5" />
                {section.phone}
              </a>
            )}
          </div>
        </SectionCard>
      );
    default:
      return null;
  }
}

export function ActivityMiniPage({
  data,
  onClose,
  showSharePanel = false,
  primaryActionLabel,
  onPrimaryAction,
  publishActionLabel,
  onPublish,
  isPublishing = false,
}: ActivityMiniPageProps) {
  const [showBooking, setShowBooking] = useState(false);
  const [booked, setBooked] = useState(false);
  const [showShare, setShowShare] = useState(showSharePanel);
  const [copied, setCopied] = useState(false);
  const style = LAYOUT_STYLES[data.layout] || LAYOUT_STYLES.classic;
  const schema = data.pageSchema;
  const hero = getHeroSection(schema);
  const ctaText = schema?.cta?.text || '立即预约参与';
  const heroTitle = hero?.title || schema?.title || data.title || '活动名称';
  const heroSubtitle = hero?.subtitle || schema?.subtitle;
  const heroDescription = hero?.description || data.description;
  const primaryColor = schema?.theme?.primaryColor;

  const schemaSections = useMemo(
    () => schema?.sections.filter((section) => section.type !== 'hero').map((section) => renderSchemaSection(section, style)),
    [schema?.sections, style],
  );

  const handleBook = () => {
    setShowBooking(true);
    setTimeout(() => {
      setShowBooking(false);
      setBooked(true);
      toast.success('预约成功，门店将尽快与你联系');
    }, 800);
  };

  const handleCopyLink = () => {
    navigator.clipboard?.writeText(buildMarketingActivityUrl(data.aiGenerationId || Date.now()));
    setCopied(true);
    toast.success('链接已复制');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-hidden bg-white p-4">
      <div className="relative flex h-full w-full flex-col items-center justify-center gap-4 lg:flex-row lg:gap-6">
        <div className="flex h-[min(844px,calc(100vh-136px))] w-[390px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-[46px] border-[10px] border-gray-950 bg-white shadow-2xl lg:h-[min(844px,calc(100vh-32px))]">
          <div className="relative flex h-11 shrink-0 items-center justify-between bg-white px-7 text-xs font-semibold text-gray-900">
            <span>9:41</span>
            <div className="absolute left-1/2 top-2 h-6 w-28 -translate-x-1/2 rounded-full bg-gray-950" />
            <div className="w-4 rounded-sm border border-gray-400">
              <div className="h-3 w-2 bg-gray-400" />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-gray-50">
            <div className="sticky top-0 z-10 flex items-center justify-between bg-white px-4 py-3 shadow-sm">
              <button type="button" onClick={onClose} className="text-gray-600">
                <X className="h-5 w-5" />
              </button>
              <span className="font-medium text-gray-900">活动详情</span>
              <button type="button" onClick={() => setShowShare(true)} className="text-gray-600">
                <Share2 className="h-5 w-5" />
              </button>
            </div>

            <div
              className={`relative aspect-[16/10] w-full ${data.posterBg || primaryColor ? '' : style.headerBg}`}
              style={data.posterBg || primaryColor ? { backgroundColor: data.posterBg || primaryColor } : undefined}
            >
              {data.posterImage && <img src={data.posterImage} alt="" className="h-full w-full object-cover opacity-30" />}
              <div className="absolute inset-0 flex flex-col justify-between p-5">
                <div>
                  <div className="mb-3 inline-block rounded-full bg-white/20 px-3 py-1 text-xs text-white backdrop-blur-sm">
                    {hero?.badge || '限时活动'}
                  </div>
                  <h1 className="text-2xl font-bold leading-tight" style={{ color: data.posterTitleColor || '#FFFFFF' }}>
                    {heroTitle}
                  </h1>
                  {heroSubtitle && (
                    <p className="mt-2 text-sm leading-relaxed text-white/90">
                      {heroSubtitle}
                    </p>
                  )}
                </div>
                <div className="rounded-xl bg-white/20 p-3 backdrop-blur-sm">
                  <div className="mb-1 text-xs text-white/80">专属优惠</div>
                  <div className="text-lg font-bold text-white">{data.discount || '优惠信息'}</div>
                </div>
              </div>
            </div>

            {schema ? (
              schemaSections
            ) : (
              <>
                <div className="relative z-[1] mx-4 -mt-4 rounded-xl bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center gap-3">
                    <Calendar className={`h-4 w-4 ${style.accent}`} />
                    <div>
                      <div className="text-xs text-gray-500">活动时间</div>
                      <div className="text-sm font-medium text-gray-900">
                        {data.startDate} 至 {data.endDate}
                      </div>
                    </div>
                  </div>
                  {data.storeName && (
                    <div className="flex items-center gap-3">
                      <MapPin className={`h-4 w-4 ${style.accent}`} />
                      <div>
                        <div className="text-xs text-gray-500">活动门店</div>
                        <div className="text-sm font-medium text-gray-900">{data.storeName}</div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mx-4 mt-3 rounded-xl bg-white p-4 shadow-sm">
                  <h3 className="mb-2 flex items-center gap-2 font-semibold text-gray-900">
                    <Gift className={`h-4 w-4 ${style.accent}`} /> 活动详情
                  </h3>
                  <p className="text-sm leading-relaxed text-gray-600">{heroDescription || '暂无活动描述'}</p>
                </div>

                {data.projects?.length ? (
                  <div className="mx-4 mt-3 rounded-xl bg-white p-4 shadow-sm">
                    <h3 className="mb-3 font-semibold text-gray-900">参与项目</h3>
                    {data.projects.map((project) => (
                      <div key={project.name} className="flex items-center justify-between border-b border-gray-100 py-2.5 last:border-0">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{project.name}</div>
                          {project.type && <div className="text-xs text-gray-500">{project.type}</div>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-bold ${style.accent}`}>{formatPrice(project.price)}</span>
                          <ChevronRight className="h-4 w-4 text-gray-300" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {data.products?.length ? (
                  <div className="mx-4 mt-3 rounded-xl bg-white p-4 shadow-sm">
                    <h3 className="mb-3 font-semibold text-gray-900">推荐商品</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {data.products.map((product) => (
                        <div key={product.name} className="rounded-lg bg-gray-50 p-3">
                          <div className="text-sm font-medium text-gray-900">{product.name}</div>
                          <div className={`mt-1 text-sm font-bold ${style.accent}`}>{formatPrice(product.price)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            )}

            <div className="h-4" />
          </div>

          <div className="shrink-0 border-t border-gray-200 bg-white p-4">
            {booked ? (
              <div className="flex w-full items-center justify-center gap-2 rounded-full bg-green-500 py-3 font-medium text-white">
                <Check className="h-5 w-5" /> 已预约，门店将联系你
              </div>
            ) : (
              <button
                type="button"
                onClick={handleBook}
                disabled={showBooking}
                className={`w-full rounded-full py-3 font-medium text-white shadow-lg ring-4 ${style.btn} ${style.btnRing} transition-all ${showBooking ? 'opacity-70' : 'active:scale-95'}`}
              >
                {showBooking ? '预约中...' : ctaText}
              </button>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-row flex-wrap items-center justify-center gap-3 lg:flex-col lg:items-stretch">
          {onPublish && (
            <button
              type="button"
              onClick={() => void onPublish()}
              disabled={isPublishing || schema?.safety?.blocked}
              className="rounded-lg bg-emerald-600 px-8 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-60"
            >
              {isPublishing ? '发布中...' : publishActionLabel || '发布到小程序'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowShare(true)}
            className="flex items-center gap-2 rounded-lg border border-blue-300 bg-white px-6 py-2.5 text-sm font-medium text-blue-600 shadow-sm transition-colors hover:bg-blue-50"
          >
            <Share2 className="h-4 w-4" /> 分享
          </button>
          {onPrimaryAction && (
            <button
              type="button"
              onClick={onPrimaryAction}
              className="rounded-lg bg-blue-600 px-8 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              {primaryActionLabel || '调整配置'}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-blue-300 bg-white px-8 py-2.5 text-sm font-medium text-blue-600 shadow-sm transition-colors hover:bg-blue-50"
          >
            返回
          </button>
        </div>
      </div>

      {showShare && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40" onClick={() => setShowShare(false)}>
          <div className="mb-0 w-[375px] rounded-t-2xl bg-white p-6" onClick={(event) => event.stopPropagation()}>
            <h3 className="mb-4 text-center font-semibold text-gray-900">分享活动</h3>
            <div className="mb-6 grid grid-cols-4 gap-4">
              {[
                { icon: '微', label: '微信好友' },
                { icon: '圈', label: '朋友圈' },
                { icon: '链', label: '复制链接' },
                { icon: '图', label: '保存海报' },
              ].map((item, index) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={index === 2 ? handleCopyLink : () => toast.success(`已分享到${item.label}`)}
                  className="flex flex-col items-center gap-2"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-base font-semibold text-gray-700">
                    {item.icon}
                  </div>
                  <span className="text-xs text-gray-600">{item.label}</span>
                </button>
              ))}
            </div>
            <div className="mb-4 rounded-xl bg-gray-50 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-gray-600">活动链接</span>
                <button type="button" onClick={handleCopyLink} className="flex items-center gap-1 text-xs text-blue-600">
                  {copied ? (
                    <>
                      <Check className="h-3 w-3" /> 已复制
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" /> 复制
                    </>
                  )}
                </button>
              </div>
              <div className="truncate text-xs text-gray-400">{buildMarketingActivityUrl(data.aiGenerationId || Date.now())}</div>
            </div>
            <button type="button" onClick={() => setShowShare(false)} className="w-full rounded-xl bg-gray-100 py-3 font-medium text-gray-700">
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
