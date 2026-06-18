import { useMemo, useState } from 'react';
import { Calendar, CheckCircle, MapPin, Phone, Share2 } from 'lucide-react';
import type { ActivityPageSchema, ActivityPageSection } from '../../types/ai';

export interface MarketingLeadFormInput {
  name?: string;
  phone: string;
  message?: string;
  intentType: 'consult' | 'book';
}

interface MarketingPageRendererProps {
  schema: ActivityPageSchema;
  title?: string;
  shareDescription?: string | null;
  leadFormId?: string;
  embedded?: boolean;
  onCtaClick?: (ctaAction: ActivityPageSchema['cta']['action']) => void;
  onShare?: () => void | Promise<void>;
  onLeadSubmit?: (input: MarketingLeadFormInput) => void | Promise<void>;
}

const pageBg = '#f5f5f4';
const defaultPrimary = '#db2777';

function formatPrice(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '';
  return `¥${Math.round(value).toLocaleString('zh-CN')}`;
}

function getHero(schema: ActivityPageSchema) {
  return schema.sections.find((section): section is Extract<ActivityPageSection, { type: 'hero' }> => section.type === 'hero');
}

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        margin: '12px 14px 0',
        border: '1px solid #f1f5f9',
        borderRadius: 14,
        background: '#fff',
        padding: 16,
        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.04)',
      }}
    >
      {title && <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: '#111827' }}>{title}</h2>}
      {children}
    </section>
  );
}

const mutedStyle = {
  color: '#6b7280',
  fontSize: 13,
  lineHeight: 1.6,
} as const;

const benefitTitleStyle = {
  fontSize: 14,
  fontWeight: 700,
  color: '#111827',
} as const;

function renderSection(section: ActivityPageSection, primaryColor: string) {
  switch (section.type) {
    case 'hero':
      return null;
    case 'offer':
      return (
        <Section key={section.type} title={section.title}>
          <div style={{ borderRadius: 12, background: '#fff7ed', padding: 14 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: primaryColor }}>{section.offer}</div>
            {section.description && <p style={mutedStyle}>{section.description}</p>}
            {(section.validFrom || section.validTo) && (
              <p style={{ ...mutedStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Calendar size={14} /> {section.validFrom || '即日起'} 至 {section.validTo || '活动结束'}
              </p>
            )}
            {section.highlights?.length ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                {section.highlights.map((item) => (
                  <span key={item} style={{ borderRadius: 999, background: '#f3f4f6', padding: '5px 10px', color: '#4b5563', fontSize: 12 }}>
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
            <div key={item.title} style={{ display: 'grid', gridTemplateColumns: '10px 1fr', gap: 10, padding: '10px 0' }}>
              <span style={{ marginTop: 7, height: 8, width: 8, borderRadius: 999, background: primaryColor }} />
              <div>
                <div style={benefitTitleStyle}>{item.title}</div>
                <div style={mutedStyle}>{item.description}</div>
              </div>
            </div>
          ))}
        </Section>
      );
    case 'project_recommendation':
      return (
        <Section key={section.type} title={section.title}>
          {section.items.map((item) => (
            <div key={item.name} style={{ borderRadius: 12, border: '1px solid #f3f4f6', padding: 13, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={benefitTitleStyle}>{item.name}</div>
                  {item.description && <div style={mutedStyle}>{item.description}</div>}
                  {item.reason && <div style={mutedStyle}>{item.reason}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  {item.originalPrice && <div style={{ color: '#9ca3af', fontSize: 12, textDecoration: 'line-through' }}>{formatPrice(item.originalPrice)}</div>}
                  {item.activityPrice && <div style={{ whiteSpace: 'nowrap', fontWeight: 800, color: primaryColor }}>{formatPrice(item.activityPrice)}</div>}
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
            <div key={item.name} style={{ borderRadius: 12, border: '1px solid #f3f4f6', padding: 13, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={benefitTitleStyle}>{item.name}</div>
                  {item.category && <div style={mutedStyle}>{item.category}</div>}
                  {item.description && <div style={mutedStyle}>{item.description}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  {item.originalPrice && <div style={{ color: '#9ca3af', fontSize: 12, textDecoration: 'line-through' }}>{formatPrice(item.originalPrice)}</div>}
                  {item.activityPrice && <div style={{ whiteSpace: 'nowrap', fontWeight: 800, color: primaryColor }}>{formatPrice(item.activityPrice)}</div>}
                </div>
              </div>
            </div>
          ))}
        </Section>
      );
    case 'skin_care_advice':
      return (
        <Section key={section.type} title={section.title}>
          <p style={mutedStyle}>{section.advice}</p>
          {section.tags?.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {section.tags.map((tag) => (
                <span key={tag} style={{ borderRadius: 999, background: '#f3f4f6', padding: '5px 10px', color: '#4b5563', fontSize: 12 }}>
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
          <p style={mutedStyle}>{section.note}</p>
          {section.consultantName && <div style={mutedStyle}>{section.consultantName}</div>}
        </Section>
      );
    case 'faq':
      return (
        <Section key={section.type} title={section.title}>
          {section.items.map((item) => (
            <div key={item.question} style={{ padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
              <div style={benefitTitleStyle}>{item.question}</div>
              <div style={mutedStyle}>{item.answer}</div>
            </div>
          ))}
        </Section>
      );
    case 'notice':
      return (
        <Section key={section.type} title={section.title}>
          <ul style={{ ...mutedStyle, margin: 0, paddingLeft: 18 }}>
            {section.items.map((item) => (
              <li key={item} style={{ margin: '7px 0' }}>{item}</li>
            ))}
          </ul>
        </Section>
      );
    case 'store_info':
      return (
        <Section key={section.type} title={section.title}>
          <div style={benefitTitleStyle}>{section.storeName}</div>
          {section.address && (
            <div style={{ ...mutedStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
              <MapPin size={14} /> {section.address}
            </div>
          )}
          {section.phone && (
            <a href={`tel:${section.phone}`} style={{ ...mutedStyle, display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
              <Phone size={14} /> {section.phone}
            </a>
          )}
        </Section>
      );
    default:
      return null;
  }
}

function LeadForm({
  ctaAction,
  primaryColor,
  formId,
  formElementId,
  onLeadSubmit,
}: {
  ctaAction: ActivityPageSchema['cta']['action'];
  primaryColor: string;
  formId?: string;
  formElementId?: string;
  onLeadSubmit?: (input: MarketingLeadFormInput) => void | Promise<void>;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const intentType = ctaAction === 'book' ? 'book' : 'consult';
  const formTitle = ctaAction === 'book' ? '预约到店' : ctaAction === 'claim_coupon' ? '领取权益' : '联系顾问';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onLeadSubmit?.({ name, phone, message, intentType });
      setSubmitted(true);
    } catch (error) {
      alert(error instanceof Error ? error.message : '提交失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div id={formId}>
      <Section title={formTitle}>
        {submitted ? (
          <div style={{ borderRadius: 12, background: '#fff7ed', padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 20, fontWeight: 800, color: primaryColor }}>
              <CheckCircle size={20} /> 已提交
            </div>
            <p style={mutedStyle}>门店会尽快与你确认权益和到店安排。</p>
          </div>
        ) : (
          <form id={formElementId} style={{ display: 'grid', gap: 10 }} onSubmit={submit}>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="姓名（可选）" style={inputStyle} />
            <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="手机号" required style={inputStyle} />
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="想咨询的内容或期望到店时间"
              style={{ ...inputStyle, minHeight: 78, resize: 'vertical' }}
            />
            {submitting && <div style={{ ...mutedStyle, color: primaryColor }}>提交中...</div>}
          </form>
        )}
      </Section>
    </div>
  );
}

const inputStyle = {
  width: '100%',
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  padding: '11px 12px',
  outline: 'none',
} as const;

const primaryButtonStyle = {
  border: 0,
  borderRadius: 999,
  padding: '13px 18px',
  fontWeight: 700,
  cursor: 'pointer',
  color: '#fff',
} as const;

export function MarketingPageRenderer({
  schema,
  title,
  shareDescription,
  leadFormId = 'lead-form',
  embedded = false,
  onCtaClick,
  onShare,
  onLeadSubmit,
}: MarketingPageRendererProps) {
  const hero = getHero(schema);
  const primaryColor = schema.theme.primaryColor || defaultPrimary;
  const sections = useMemo(() => schema.sections.filter((section) => section.type !== 'hero'), [schema.sections]);
  const leadFormElementId = `${leadFormId}-fields`;

  const handleCta = () => {
    onCtaClick?.(schema.cta.action);
    const form = document.getElementById(leadFormElementId);
    if (form instanceof HTMLFormElement) {
      form.requestSubmit();
      return;
    }
    document.getElementById(leadFormId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (schema.safety.blocked) {
    return (
      <div style={{ display: 'grid', minHeight: embedded ? '100%' : '100vh', placeItems: 'center', padding: 24, textAlign: 'center' }}>
        <div style={{ maxWidth: 360, borderRadius: 18, background: '#fff', padding: 24, boxShadow: '0 18px 60px rgba(15, 23, 42, 0.08)' }}>
          <h2>页面暂不可访问</h2>
          <p style={mutedStyle}>该页面正在审核或已被暂停展示。</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: embedded ? '100%' : '100vh', background: pageBg }}>
      <main
        style={{
          margin: '0 auto',
          maxWidth: embedded ? 'none' : 480,
          minHeight: embedded ? '100%' : '100vh',
          background: '#fff',
          boxShadow: embedded ? 'none' : '0 18px 60px rgba(15, 23, 42, 0.08)',
        }}
      >
        <section style={{ position: 'relative', minHeight: 320, overflow: 'hidden', background: primaryColor, color: '#fff' }}>
          {hero?.imageUrl && (
            <img src={hero.imageUrl} alt="" style={{ position: 'absolute', inset: 0, height: '100%', width: '100%', objectFit: 'cover', opacity: 0.28 }} />
          )}
          <div
            style={{
              position: 'relative',
              zIndex: 1,
              display: 'flex',
              minHeight: 320,
              flexDirection: 'column',
              justifyContent: 'flex-end',
              padding: '28px 22px',
              background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.08), rgba(15, 23, 42, 0.62))',
            }}
          >
            <span style={{ alignSelf: 'flex-start', borderRadius: 999, background: 'rgba(255,255,255,0.2)', padding: '6px 12px', fontSize: 12, backdropFilter: 'blur(8px)' }}>
              {hero?.badge || '限时活动'}
            </span>
            <h1 style={{ margin: '14px 0 0', fontSize: 31, lineHeight: 1.12, letterSpacing: 0 }}>{hero?.title || schema.title || title}</h1>
            <p style={{ margin: '12px 0 0', color: 'rgba(255,255,255,0.9)', fontSize: 14, lineHeight: 1.7 }}>
              {hero?.description || hero?.subtitle || schema.subtitle || shareDescription}
            </p>
          </div>
        </section>

        {sections.length ? (
          sections.map((section) => renderSection(section, primaryColor))
        ) : (
          <Section title="活动说明">
            <p style={mutedStyle}>{schema.subtitle || shareDescription || '提交联系方式后，门店会尽快与你确认活动权益和到店安排。'}</p>
          </Section>
        )}

        <LeadForm
          formId={leadFormId}
          formElementId={leadFormElementId}
          ctaAction={schema.cta.action}
          primaryColor={primaryColor}
          onLeadSubmit={onLeadSubmit}
        />

        <div
          style={{
            position: 'sticky',
            bottom: 0,
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: 10,
            borderTop: '1px solid #f1f5f9',
            background: 'rgba(255,255,255,0.96)',
            padding: '12px 14px',
            backdropFilter: 'blur(10px)',
          }}
        >
          <button type="button" onClick={handleCta} style={{ ...primaryButtonStyle, background: primaryColor }}>
            {schema.cta.text}
          </button>
          <button
            type="button"
            onClick={() => void onShare?.()}
            aria-label="分享"
            style={{ border: 0, borderRadius: 999, padding: '13px 18px', fontWeight: 700, cursor: 'pointer', background: '#f3f4f6', color: '#374151' }}
          >
            <Share2 size={18} />
          </button>
        </div>
      </main>
    </div>
  );
}
