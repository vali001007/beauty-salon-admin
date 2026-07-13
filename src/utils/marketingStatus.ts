import type { MarketingActivityStatus } from '@/types/marketing';

const aliases: Record<string, MarketingActivityStatus> = {
  draft: 'draft', '草稿': 'draft',
  scheduled: 'scheduled', '即将开始': 'scheduled',
  active: 'active', '进行中': 'active',
  ended: 'ended', '已结束': 'ended',
  cancelled: 'cancelled', '已取消': 'cancelled',
};

const labels: Record<MarketingActivityStatus, string> = {
  draft: '草稿', scheduled: '即将开始', active: '进行中', ended: '已结束', cancelled: '已取消',
};

export function normalizeMarketingActivityStatus(status: string): MarketingActivityStatus {
  return aliases[status] ?? 'draft';
}

export function getMarketingActivityStatusLabel(status: string) {
  return labels[normalizeMarketingActivityStatus(status)];
}
