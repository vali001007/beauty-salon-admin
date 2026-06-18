import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MarketingPageRenderer, type MarketingLeadFormInput } from '../../../src/shared/marketing/MarketingPageRenderer';
import {
  getPublicMarketingPage,
  getSessionId,
  getSlugFromLocation,
  recordMarketingPageEvent,
  submitMarketingLead,
} from './api';
import type { ActivityPageSchema, PublicMarketingPage } from './types';
import './styles.css';

function normalizeSchema(page: PublicMarketingPage): ActivityPageSchema {
  const source = page.pageSchema as Partial<ActivityPageSchema> | undefined;
  const sections = Array.isArray(source?.sections) ? source.sections : [];
  return {
    schemaVersion: '1.0',
    title: source?.title || page.title || '营销活动',
    subtitle: source?.subtitle || page.shareDescription || '',
    audienceLabel: source?.audienceLabel || '门店会员',
    theme: {
      tone: source?.theme?.tone || 'warm',
      primaryColor: source?.theme?.primaryColor || '#db2777',
      backgroundColor: source?.theme?.backgroundColor || '#f5f5f4',
    },
    sections,
    cta: {
      text: source?.cta?.text || '联系顾问',
      action: source?.cta?.action || 'contact_consultant',
    },
    safety: {
      customerFacing: source?.safety?.customerFacing ?? true,
      blocked: source?.safety?.blocked ?? false,
      reasons: Array.isArray(source?.safety?.reasons) ? source.safety.reasons : [],
    },
  };
}

function MarketingPage({ page }: { page: PublicMarketingPage }) {
  const schema = normalizeSchema(page);
  const slug = page.slug;

  useEffect(() => {
    document.title = page.shareTitle || page.title;
  }, [page.shareTitle, page.title]);

  const handleCta = (ctaAction: ActivityPageSchema['cta']['action']) => {
    recordMarketingPageEvent(slug, 'click_cta', { ctaAction });
    if (ctaAction === 'claim_coupon') {
      recordMarketingPageEvent(slug, 'coupon_claim', { ctaAction });
    }
  };

  const handleShare = async () => {
    recordMarketingPageEvent(slug, 'share', { shareTarget: 'copy_link' });
    await navigator.clipboard?.writeText(window.location.href);
    alert('链接已复制');
  };

  const handleLeadSubmit = async (input: MarketingLeadFormInput) => {
    await submitMarketingLead(slug, input);
  };

  return (
    <MarketingPageRenderer
      schema={schema}
      title={page.title}
      shareDescription={page.shareDescription}
      onCtaClick={handleCta}
      onShare={handleShare}
      onLeadSubmit={handleLeadSubmit}
    />
  );
}

function App() {
  const [page, setPage] = useState<PublicMarketingPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const slug = getSlugFromLocation();

  useEffect(() => {
    getSessionId();
    if (!slug) {
      setError('缺少页面地址');
      setLoading(false);
      return;
    }
    getPublicMarketingPage(slug)
      .then((data) => {
        setPage(data);
        recordMarketingPageEvent(slug, 'view');
      })
      .catch((err) => setError(err instanceof Error ? err.message : '页面暂不可访问'))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="state">
        <div className="state-card">页面加载中...</div>
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="state">
        <div className="state-card">
          <h2>页面暂不可访问</h2>
          <p className="muted">{error || '页面不存在或已下线'}</p>
        </div>
      </div>
    );
  }

  return <MarketingPage page={page} />;
}

createRoot(document.getElementById('root')!).render(<App />);
