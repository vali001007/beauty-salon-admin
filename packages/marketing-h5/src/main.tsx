import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Calendar, CheckCircle, MapPin, Phone, Share2 } from 'lucide-react';
import {
  getPublicMarketingPage,
  getSessionId,
  getSlugFromLocation,
  recordMarketingPageEvent,
  submitMarketingLead,
} from './api';
import type { ActivityPageSchema, ActivityPageSection, PublicMarketingPage } from './types';
import './styles.css';

function formatPrice(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '';
  return `¥${Math.round(value).toLocaleString('zh-CN')}`;
}

function getHero(schema: ActivityPageSchema) {
  return schema.sections.find((section): section is Extract<ActivityPageSection, { type: 'hero' }> => section.type === 'hero');
}

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

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="section">
      {title && <h2 className="section-title">{title}</h2>}
      {children}
    </section>
  );
}

function renderSection(section: ActivityPageSection) {
  switch (section.type) {
    case 'hero':
      return null;
    case 'offer':
      return (
        <Section key={section.type} title={section.title}>
          <div className="offer-card">
            <div className="offer-main">{section.offer}</div>
            {section.description && <p className="muted">{section.description}</p>}
            {(section.validFrom || section.validTo) && (
              <p className="muted">
                <Calendar size={14} /> {section.validFrom || '即日起'} 至 {section.validTo || '活动结束'}
              </p>
            )}
            {section.highlights?.length ? (
              <div className="chip-row">
                {section.highlights.map((item) => (
                  <span className="chip" key={item}>
                    {item}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </Section>
      );
    case 'benefits':
      return (
        <Section key={section.type} title={section.title}>
          {section.items.map((item) => (
            <div className="benefit" key={item.title}>
              <span className="benefit-dot" />
              <div>
                <div className="benefit-title">{item.title}</div>
                <div className="muted">{item.description}</div>
              </div>
            </div>
          ))}
        </Section>
      );
    case 'project_recommendation':
      return (
        <Section key={section.type} title={section.title}>
          {section.items.map((item) => (
            <div className="item-card" key={item.name}>
              <div className="item-row">
                <div>
                  <div className="benefit-title">{item.name}</div>
                  {item.description && <div className="muted">{item.description}</div>}
                  {item.reason && <div className="muted">{item.reason}</div>}
                </div>
                <div>
                  {item.originalPrice && <div className="line-through">{formatPrice(item.originalPrice)}</div>}
                  {item.activityPrice && <div className="price">{formatPrice(item.activityPrice)}</div>}
                </div>
              </div>
            </div>
          ))}
        </Section>
      );
    case 'product_recommendation':
      return (
        <Section key={section.type} title={section.title}>
          {section.items.map((item) => (
            <div className="item-card" key={item.name}>
              <div className="item-row">
                <div>
                  <div className="benefit-title">{item.name}</div>
                  {item.category && <div className="muted">{item.category}</div>}
                  {item.description && <div className="muted">{item.description}</div>}
                </div>
                <div>
                  {item.originalPrice && <div className="line-through">{formatPrice(item.originalPrice)}</div>}
                  {item.activityPrice && <div className="price">{formatPrice(item.activityPrice)}</div>}
                </div>
              </div>
            </div>
          ))}
        </Section>
      );
    case 'skin_care_advice':
      return (
        <Section key={section.type} title={section.title}>
          <p className="muted">{section.advice}</p>
          {section.tags?.length ? (
            <div className="chip-row">
              {section.tags.map((tag) => (
                <span className="chip" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </Section>
      );
    case 'consultant_note':
      return (
        <Section key={section.type} title={section.title}>
          <p className="muted">{section.note}</p>
          {section.consultantName && <div className="muted">{section.consultantName}</div>}
        </Section>
      );
    case 'faq':
      return (
        <Section key={section.type} title={section.title}>
          {section.items.map((item) => (
            <div className="faq-item" key={item.question}>
              <div className="faq-question">{item.question}</div>
              <div className="muted">{item.answer}</div>
            </div>
          ))}
        </Section>
      );
    case 'notice':
      return (
        <Section key={section.type} title={section.title}>
          <ul className="notice-list muted">
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Section>
      );
    case 'store_info':
      return (
        <Section key={section.type} title={section.title}>
          <div className="benefit-title">{section.storeName}</div>
          {section.address && (
            <div className="muted">
              <MapPin size={14} /> {section.address}
            </div>
          )}
          {section.phone && (
            <a className="muted" href={`tel:${section.phone}`}>
              <Phone size={14} /> {section.phone}
            </a>
          )}
        </Section>
      );
    default:
      return null;
  }
}

function LeadForm({ slug, ctaAction }: { slug: string; ctaAction: ActivityPageSchema['cta']['action'] }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const intentType = ctaAction === 'book' ? 'book' : 'consult';
  const formTitle = ctaAction === 'book' ? '预约到店' : ctaAction === 'claim_coupon' ? '领取权益' : '联系顾问';
  const submitText =
    ctaAction === 'book' ? '提交预约意向' : ctaAction === 'claim_coupon' ? '提交领取信息' : '提交咨询';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await submitMarketingLead(slug, { name, phone, message, intentType });
      setSubmitted(true);
    } catch (error) {
      alert(error instanceof Error ? error.message : '提交失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Section title={formTitle}>
      {submitted ? (
        <div className="offer-card">
          <div className="offer-main">
            <CheckCircle size={20} /> 已提交
          </div>
          <p className="muted">门店会尽快与你确认权益和到店安排。</p>
        </div>
      ) : (
        <form className="lead-form" onSubmit={submit}>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="姓名（可选）" />
          <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="手机号" required />
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="想咨询的内容或期望到店时间" />
          <button className="primary-btn" type="submit" disabled={submitting}>
            {submitting ? '提交中...' : submitText}
          </button>
        </form>
      )}
    </Section>
  );
}

function MarketingPage({ page }: { page: PublicMarketingPage }) {
  const schema = useMemo(() => normalizeSchema(page), [page]);
  const hero = getHero(schema);
  const slug = page.slug;
  const primaryColor = schema.theme.primaryColor || '#db2777';
  const sections = useMemo(() => schema.sections.filter((section) => section.type !== 'hero'), [schema.sections]);

  useEffect(() => {
    document.title = page.shareTitle || page.title;
  }, [page.shareTitle, page.title]);

  const handleCta = () => {
    recordMarketingPageEvent(slug, 'click_cta', { ctaAction: schema.cta.action });
    if (schema.cta.action === 'claim_coupon') {
      recordMarketingPageEvent(slug, 'coupon_claim', { ctaAction: schema.cta.action });
    }
    document.getElementById('lead-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleShare = async () => {
    recordMarketingPageEvent(slug, 'share', { shareTarget: 'copy_link' });
    await navigator.clipboard?.writeText(window.location.href);
    alert('链接已复制');
  };

  if (schema.safety.blocked) {
    return (
      <div className="state">
        <div className="state-card">
          <h2>页面暂不可访问</h2>
          <p className="muted">该页面正在审核或已被暂停展示。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <main className="page">
        <section className="hero" style={{ backgroundColor: primaryColor }}>
          {hero?.imageUrl && <img className="hero-image" src={hero.imageUrl} alt="" />}
          <div className="hero-content">
            <span className="badge">{hero?.badge || '限时活动'}</span>
            <h1>{hero?.title || schema.title}</h1>
            <p>{hero?.description || hero?.subtitle || schema.subtitle}</p>
          </div>
        </section>

        {sections.length ? (
          sections.map(renderSection)
        ) : (
          <Section title="活动说明">
            <p className="muted">{schema.subtitle || page.shareDescription || '提交联系方式后，门店会尽快与你确认活动权益和到店安排。'}</p>
          </Section>
        )}

        <div id="lead-form">
          <LeadForm slug={slug} ctaAction={schema.cta.action} />
        </div>

        <div className="sticky-cta">
          <button className="primary-btn" type="button" onClick={handleCta}>
            {schema.cta.text}
          </button>
          <button className="secondary-btn" type="button" onClick={handleShare} aria-label="分享">
            <Share2 size={18} />
          </button>
        </div>
      </main>
    </div>
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
