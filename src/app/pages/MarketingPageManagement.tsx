import { useEffect, useMemo, useRef, useState, type ElementRef } from 'react';
import { useNavigate } from 'react-router';
import QRCode from 'qrcode';
import {
  BarChart3,
  Check,
  Copy,
  Download,
  Eye,
  ExternalLink,
  Loader2,
  PauseCircle,
  PlayCircle,
  QrCode,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  duplicateMarketingPage,
  getMarketingPageAttribution,
  getMarketingPageEvents,
  getMarketingPageEffects,
  getMarketingPageLeads,
  getMarketingPagesPaginated,
  offlineMarketingPage,
  publishMarketingPage,
} from '@/api/marketingPage';
import { buildMarketingPageUrl, normalizeMarketingShareUrl } from '@/config/marketingAssets';
import { usePagination } from '@/hooks/usePagination';
import type {
  MarketingPage,
  MarketingPageAttributionSummary,
  MarketingPageEffects,
  MarketingPageEvent,
  MarketingPageLead,
} from '@/types/marketing-page';
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/UI';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';

const SOURCE_LABELS: Record<string, string> = {
  product: '商品',
  project: '项目',
  activity: '活动',
  card: '卡项',
  package: '套餐',
  recommendation: '智能推荐',
  store_topic: '门店专题',
};

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  published: '已发布',
  offline: '已下线',
};

const CHANNEL_OPTIONS = [
  { value: 'wechat_group', label: '微信群' },
  { value: 'moments', label: '朋友圈' },
  { value: 'sms', label: '短信' },
  { value: 'poster', label: '门店海报' },
  { value: 'staff_share', label: '顾问分享' },
] as const;

const CHANNEL_LABELS = Object.fromEntries(CHANNEL_OPTIONS.map((item) => [item.value, item.label]));

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function formatMoney(value?: number | null) {
  return `¥${Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;
}

function getPageUrl(page: MarketingPage) {
  return normalizeMarketingShareUrl(page.shareUrl) || buildMarketingPageUrl(page.slug);
}

function getPageSubtitle(page: MarketingPage) {
  const subtitle = page.shareTitle || page.shareDescription;
  if (!subtitle || subtitle.trim() === page.title.trim()) return 'H5/小程序推广页';
  return subtitle;
}

export function MarketingPageManagement({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('all');
  const [sourceType, setSourceType] = useState('all');
  const [operatingId, setOperatingId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [effectPage, setEffectPage] = useState<MarketingPage | null>(null);
  const [effects, setEffects] = useState<MarketingPageEffects | null>(null);
  const [effectEvents, setEffectEvents] = useState<MarketingPageEvent[]>([]);
  const [effectLeads, setEffectLeads] = useState<MarketingPageLead[]>([]);
  const [effectAttribution, setEffectAttribution] = useState<MarketingPageAttributionSummary | null>(null);
  const [loadingEffects, setLoadingEffects] = useState(false);
  const [channelPage, setChannelPage] = useState<MarketingPage | null>(null);
  const [channel, setChannel] = useState('wechat_group');
  const [staffId, setStaffId] = useState('');
  const [qrReady, setQrReady] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const qrCanvasRef = useRef<ElementRef<'canvas'> | null>(null);

  const filters = useMemo(
    () => ({
      keyword: keyword.trim() || undefined,
      status,
      sourceType,
    }),
    [keyword, sourceType, status],
  );

  const {
    data: pages,
    total,
    page,
    pageSize,
    loading,
    setPage,
    setPageSize,
    refresh,
  } = usePagination<MarketingPage>(getMarketingPagesPaginated, filters);

  const copyUrl = async (item: MarketingPage) => {
    const url = getPageUrl(item);
    await navigator.clipboard?.writeText(url);
    setCopiedId(item.id);
    toast.success('页面链接已复制');
    window.setTimeout(() => setCopiedId(null), 1800);
  };

  const toggleStatus = async (item: MarketingPage) => {
    setOperatingId(item.id);
    try {
      if (item.status === 'published') {
        await offlineMarketingPage(item.id);
        toast.success('页面已下线');
      } else {
        await publishMarketingPage(item.id);
        toast.success('页面已发布');
      }
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '页面状态更新失败');
    } finally {
      setOperatingId(null);
    }
  };

  const duplicatePage = async (item: MarketingPage) => {
    setOperatingId(item.id);
    try {
      await duplicateMarketingPage(item.id);
      toast.success('页面副本已创建');
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '复制页面失败');
    } finally {
      setOperatingId(null);
    }
  };

  const openEffects = async (item: MarketingPage) => {
    setEffectPage(item);
    setLoadingEffects(true);
    setEffects(null);
    setEffectEvents([]);
    setEffectLeads([]);
    setEffectAttribution(null);
    try {
      const [nextEffects, nextEvents, nextLeads, nextAttribution] = await Promise.all([
        getMarketingPageEffects(item.id),
        getMarketingPageEvents(item.id),
        getMarketingPageLeads(item.id),
        getMarketingPageAttribution(item.id),
      ]);
      setEffects(nextEffects);
      setEffectEvents(nextEvents.slice(0, 8));
      setEffectLeads(nextLeads.slice(0, 8));
      setEffectAttribution(nextAttribution);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '效果数据加载失败');
    } finally {
      setLoadingEffects(false);
    }
  };

  const channelUrl = channelPage
    ? buildMarketingPageUrl(channelPage.slug, {
        channel,
        staffId: staffId || undefined,
        utm_source: channel.startsWith('wechat') || channel === 'moments' ? 'wechat' : channel,
        utm_medium: channel,
        utm_campaign: `marketing-page-${channelPage.id}`,
      })
    : '';

  useEffect(() => {
    if (!channelPage || !channelUrl || !qrCanvasRef.current) {
      setQrReady(false);
      return;
    }

    let cancelled = false;
    setQrReady(false);
    setQrError(null);
    QRCode.toCanvas(
      qrCanvasRef.current,
      channelUrl,
      {
        width: 220,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#111827',
          light: '#FFFFFF',
        },
      },
      (error) => {
        if (cancelled) return;
        if (error) {
          setQrError('二维码生成失败，请复制链接后重试');
          return;
        }
        setQrReady(true);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [channelPage, channelUrl]);

  const downloadChannelQrCode = () => {
    const canvas = qrCanvasRef.current;
    if (!channelPage || !canvas || !qrReady) {
      toast.error('二维码还在生成，请稍后重试');
      return;
    }

    canvas.toBlob((blob) => {
      if (!blob) {
        toast.error('二维码下载失败，请复制链接后重试');
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${channelPage.slug}-${channel}-qr.png`;
      link.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  return (
    <div className="flex flex-col gap-6">
      {!embedded && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm text-gray-500">首页 / 智能营销 / 营销页面</div>
            <h2 className="mt-2 text-xl font-semibold text-gray-800">营销页面</h2>
            <p className="mt-1 text-sm text-gray-500">统一管理商品、项目、活动生成的 H5/小程序推广页，支持链接分发和基础效果统计。</p>
          </div>
          <Button variant="outline" className="gap-2" onClick={refresh}>
            <RefreshCw className="h-4 w-4" />
            刷新
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            className="w-80 pl-9"
            placeholder="搜索标题、来源 ID"
            value={keyword}
            onChange={(event) => {
              setKeyword(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="all">全部状态</option>
          <option value="draft">草稿</option>
          <option value="published">已发布</option>
          <option value="offline">已下线</option>
        </select>
        <select
          className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm"
          value={sourceType}
          onChange={(event) => {
            setSourceType(event.target.value);
            setPage(1);
          }}
        >
          <option value="all">全部来源</option>
          <option value="product">商品</option>
          <option value="project">项目</option>
          <option value="activity">活动</option>
          <option value="recommendation">智能推荐</option>
        </select>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin text-blue-500" />
            正在加载营销页面...
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/80">
                <TableHead>推广页</TableHead>
                <TableHead>来源</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>访问</TableHead>
                <TableHead>成交</TableHead>
                <TableHead>发布</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pages.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                        <Sparkles className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{item.title}</div>
                        <div className="mt-1 text-xs text-gray-500">{getPageSubtitle(item)}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">
                      {SOURCE_LABELS[item.sourceType] || item.sourceType}
                      {item.sourceId ? ` #${item.sourceId}` : ''}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`rounded px-2 py-1 text-xs font-medium ${
                        item.status === 'published'
                          ? 'bg-green-100 text-green-700'
                          : item.status === 'offline'
                            ? 'bg-gray-100 text-gray-600'
                            : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {STATUS_LABELS[item.status] || item.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="min-w-32 space-y-1 text-xs text-gray-600">
                      <div>浏览 {item.effectSummary?.pv ?? 0} / 访客 {item.effectSummary?.uv ?? 0}</div>
                      <div>线索 {item.effectSummary?.leadCount ?? 0} · 预约 {item.effectSummary?.bookingCount ?? 0}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="min-w-20 space-y-1 text-xs text-gray-600">
                      <div className="font-medium text-emerald-700">{formatMoney(item.effectSummary?.attributedRevenue)}</div>
                      <div>订单 {item.effectSummary?.attributionCount ?? 0}</div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">{formatDate(item.publishedAt)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        title="复制链接"
                        aria-label="复制链接"
                        onClick={() => copyUrl(item)}
                      >
                        {copiedId === item.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        title="打开推广页"
                        aria-label="打开推广页"
                        onClick={() => window.open(getPageUrl(item), '_blank')}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        title="生成渠道链接"
                        aria-label="生成渠道链接"
                        onClick={() => setChannelPage(item)}
                      >
                        <QrCode className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        title="数据复盘"
                        aria-label="数据复盘"
                        onClick={() => navigate(`/customer-marketing/effect-analysis?objectType=page&objectId=${item.id}`)}
                      >
                        <BarChart3 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        title="查看明细"
                        aria-label="查看明细"
                        onClick={() => openEffects(item)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        disabled={operatingId === item.id}
                        title={item.status === 'published' ? '下线' : '发布'}
                        aria-label={item.status === 'published' ? '下线' : '发布'}
                        onClick={() => toggleStatus(item)}
                      >
                        {operatingId === item.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : item.status === 'published' ? (
                          <PauseCircle className="h-3.5 w-3.5" />
                        ) : (
                          <PlayCircle className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        disabled={operatingId === item.id}
                        title="复制页面"
                        aria-label="复制页面"
                        onClick={() => duplicatePage(item)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {pages.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-gray-400">
                    暂无营销页面。可先从商品管理或项目管理生成推广页。
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}

        <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
          <div className="text-sm text-gray-600">共 {total} 条</div>
          <div className="flex items-center gap-2">
            <select
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
              className="h-8 rounded border border-gray-300 px-2 text-sm"
            >
              <option value={10}>10条/页</option>
              <option value={20}>20条/页</option>
              <option value={50}>50条/页</option>
            </select>
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              上一页
            </Button>
            <span className="text-sm text-gray-600">
              {page} / {Math.ceil(total / pageSize) || 1}
            </span>
            <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage(page + 1)}>
              下一页
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={Boolean(effectPage)} onOpenChange={(open) => !open && setEffectPage(null)}>
        <DialogContent className="max-w-3xl" aria-describedby="marketing-page-effects-desc">
          <DialogHeader>
            <DialogTitle>页面效果</DialogTitle>
            <DialogDescription id="marketing-page-effects-desc">{effectPage?.title}</DialogDescription>
          </DialogHeader>
          {loadingEffects ? (
            <div className="flex items-center justify-center py-10 text-gray-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              正在加载效果数据...
            </div>
          ) : effects ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
                {[
                  ['PV', effects.pv],
                  ['UV', effects.uv],
                  ['分享', effects.shareCount],
                  ['点击', effects.ctaClickCount],
                  ['线索', effects.leadCount],
                  ['预约', effects.bookingCount],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-gray-50 p-3 text-center">
                    <div className="text-xs text-gray-500">{label}</div>
                    <div className="mt-1 text-lg font-semibold text-gray-900">{value}</div>
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
                <div className="mb-3 text-sm font-medium text-emerald-800">归因收入（30天窗口）</div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <div className="text-2xl font-semibold text-emerald-700">
                      {formatMoney(effectAttribution?.totalRevenue ?? effects.attributedRevenue)}
                    </div>
                    <div className="mt-1 text-xs text-emerald-700/80">归因总收入</div>
                  </div>
                  <div>
                    <div className="text-2xl font-semibold text-gray-900">
                      {effectAttribution?.attributionCount ?? effects.attributionCount ?? 0}
                    </div>
                    <div className="mt-1 text-xs text-emerald-700/80">转化订单数</div>
                  </div>
                  <div>
                    <div className="text-2xl font-semibold text-gray-900">
                      {formatMoney(effectAttribution?.averageOrderValue)}
                    </div>
                    <div className="mt-1 text-xs text-emerald-700/80">平均客单价</div>
                  </div>
                </div>
              </div>
              <div>
                <div className="mb-2 text-sm font-medium text-gray-800">渠道分布</div>
                <div className="rounded-lg border border-gray-200">
                  {effects.channelStats.length ? (
                    effects.channelStats.map((item) => (
                      <div key={item.channel} className="grid grid-cols-5 border-b border-gray-100 px-3 py-2 text-sm last:border-0">
                        <span className="font-medium text-gray-800">{item.channel}</span>
                        <span>PV {item.pv}</span>
                        <span>UV {item.uv}</span>
                        <span>线索 {item.leadCount}</span>
                        <span>预约 {item.bookingCount}</span>
                      </div>
                    ))
                  ) : (
                    <div className="px-3 py-8 text-center text-sm text-gray-400">暂无渠道数据</div>
                  )}
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-2 text-sm font-medium text-gray-800">最近线索</div>
                  <div className="rounded-lg border border-gray-200">
                    {effectLeads.length ? (
                      effectLeads.map((item) => (
                        <div key={item.id} className="border-b border-gray-100 px-3 py-2 text-sm last:border-0">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium text-gray-900">{item.name || '未留姓名'}</span>
                            <span className="text-xs text-gray-500">{formatDate(item.createdAt)}</span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                            <span>{item.phone}</span>
                            <span>{item.intentType === 'book' ? '预约' : '咨询'}</span>
                            <span>{item.channel || 'direct'}</span>
                            {item.staffId ? <span>顾问 #{item.staffId}</span> : null}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="px-3 py-8 text-center text-sm text-gray-400">暂无线索</div>
                    )}
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-sm font-medium text-gray-800">最近事件</div>
                  <div className="rounded-lg border border-gray-200">
                    {effectEvents.length ? (
                      effectEvents.map((item) => (
                        <div key={item.id} className="border-b border-gray-100 px-3 py-2 text-sm last:border-0">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium text-gray-900">{item.eventType}</span>
                            <span className="text-xs text-gray-500">{formatDate(item.occurredAt)}</span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                            <span>{item.channel || 'direct'}</span>
                            {item.staffId ? <span>顾问 #{item.staffId}</span> : null}
                            {item.sessionId ? <span>会话 {item.sessionId.slice(0, 8)}</span> : null}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="px-3 py-8 text-center text-sm text-gray-400">暂无事件</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(channelPage)} onOpenChange={(open) => !open && setChannelPage(null)}>
        <DialogContent className="max-w-xl" aria-describedby="marketing-page-channel-desc">
          <DialogHeader>
            <DialogTitle>渠道链接</DialogTitle>
            <DialogDescription id="marketing-page-channel-desc">
              为不同投放渠道生成带参数的链接，复制后可用于二维码工具、社群、短信或门店海报。
            </DialogDescription>
          </DialogHeader>
          {channelPage && (
            <div className="space-y-4">
              <div className="rounded-lg bg-gray-50 p-3">
                <div className="font-medium text-gray-900">{channelPage.title}</div>
                <div className="mt-1 text-xs text-gray-500">推广页链接已自动生成，可直接复制或下载二维码。</div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-gray-700">渠道</span>
                  <select
                    value={channel}
                    onChange={(event) => setChannel(event.target.value)}
                    className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm"
                  >
                    {CHANNEL_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-gray-700">员工/顾问 ID</span>
                  <Input value={staffId} onChange={(event) => setStaffId(event.target.value)} placeholder="可选" />
                </label>
              </div>
              <div className="grid gap-4 md:grid-cols-[240px_1fr]">
                <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
                  <div className="mx-auto flex h-[220px] w-[220px] items-center justify-center rounded bg-white">
                    <canvas ref={qrCanvasRef} width={220} height={220} aria-label="渠道二维码" />
                  </div>
                  <div className="mt-3 text-sm font-medium text-gray-800">{CHANNEL_LABELS[channel] || channel}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    {qrError || (qrReady ? '可直接扫码访问投放页' : '正在生成二维码...')}
                  </div>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-3">
                  <div className="mb-2 text-sm font-medium text-gray-700">投放链接</div>
                  <div className="break-all rounded bg-gray-50 p-3 font-mono text-xs text-gray-600">{channelUrl}</div>
                  <div className="mt-3 rounded bg-blue-50 p-3 text-xs leading-5 text-blue-700">
                    二维码已写入渠道、顾问和 UTM 参数，扫码数据会进入页面效果里的渠道分布。
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => copyUrl({ ...channelPage, shareUrl: channelUrl })}>
                  复制链接
                </Button>
                <Button className="gap-2" onClick={downloadChannelQrCode}>
                  <Download className="h-4 w-4" />
                  下载二维码 PNG
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
