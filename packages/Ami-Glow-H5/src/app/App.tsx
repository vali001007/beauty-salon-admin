import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Bell,
  CalendarDays,
  ChevronRight,
  Clock,
  Home,
  Loader2,
  MapPin,
  Phone,
  Search,
  Sparkles,
  UserRound,
  WalletCards,
} from 'lucide-react';
import { Link, NavLink, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  analyzeSkin,
  bindPhone,
  cancelReservation,
  claimPromotion,
  createReservation,
  getAvailability,
  getAvailableBeauticians,
  getContact,
  getConsumptionRecords,
  getHome,
  getMemberCard,
  getNotifications,
  getMyCards,
  getMyReservations,
  getProjectDetail,
  getProjects,
  getSkinRecommendations,
  getSkinReport,
  h5GuestLogin,
  openNotification,
  trackEvent,
} from '../services/customerApp';
import { ApiError } from '../services/request';
import { useSession } from '../stores/session';
import type {
  AvailabilitySlot,
  BeauticianItem,
  HomeData,
  MarketingNotification,
  MarketingNotificationPage,
  Paginated,
  ProjectItem,
  ReservationItem,
  SkinReport,
} from '../types/customer-app';
import { displayDate, displayMoney, nextDays } from '../utils/date';
import { fileToDataUrl } from '../utils/image';

type LoadState<T> = {
  data?: T;
  loading: boolean;
  error?: string;
};

function getErrorMessage(error: unknown, fallback = '操作失败，请稍后再试') {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return fallback;
}

function PageShell({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="app-shell">
      <header className="top-bar">
        <div>
          <span className="eyebrow">Ami Glow</span>
          <h1>{title}</h1>
        </div>
        {action}
      </header>
      <main className="page-content">{children}</main>
      <BottomNav />
    </div>
  );
}

function BottomNav() {
  const items = [
    { to: '/', label: '首页', icon: Home },
    { to: '/booking', label: '预约', icon: CalendarDays },
    { to: '/tools', label: '工具', icon: Sparkles },
    { to: '/mine', label: '我的', icon: UserRound },
  ];
  return (
    <nav className="bottom-nav" aria-label="Ami Glow navigation">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Icon size={20} />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

function StateBlock({ title, description, loading }: { title: string; description?: string; loading?: boolean }) {
  return (
    <div className="state-card">
      {loading ? <Loader2 className="spin" size={24} /> : null}
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
    </div>
  );
}

function ProjectCard({ project, compact = false, onClick }: { project: ProjectItem; compact?: boolean; onClick?: () => void }) {
  return (
    <Link to={`/projects/${project.id}?storeId=${project.storeId}`} className={`project-card ${compact ? 'compact' : ''}`} onClick={onClick}>
      <div className="project-image">
        {project.image ? <img src={project.image} alt={project.name} loading="lazy" /> : <Sparkles size={28} />}
      </div>
      <div className="project-info">
        <div className="row-between">
          <strong>{project.name}</strong>
          {project.typeName ? <span className="tag">{project.typeName}</span> : null}
        </div>
        <p>{project.description || '专业护理项目，可在线预约到店体验。'}</p>
        <div className="meta-row">
          <span>{displayMoney(project.memberPrice ?? project.price)}</span>
          <span>{project.duration || 60} 分钟</span>
          <span>{project.canBook ? '可预约' : '暂不可约'}</span>
        </div>
      </div>
    </Link>
  );
}

function AuthModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone?: () => void }) {
  const session = useSession();
  const [phone, setPhone] = useState(session.customer?.phone || '');
  const [name, setName] = useState(session.customer?.name || '');
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (!/^1\d{10}$/.test(phone.trim())) {
      setError('请输入 11 位手机号');
      return;
    }
    if (!agree) {
      setError('请先确认授权绑定手机号用于预约和会员查询');
      return;
    }
    setSubmitting(true);
    try {
      if (!session.token) {
        const guest = await h5GuestLogin(session.storeId);
        session.applyAuth(guest);
      }
      const response = await bindPhone({ phone: phone.trim(), name: name.trim() || undefined, storeId: session.storeId });
      session.applyAuth(response);
      onDone?.();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, '绑定失败，请稍后再试'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <form className="modal-panel" onSubmit={handleSubmit}>
        <div className="row-between">
          <div>
            <span className="eyebrow">身份绑定</span>
            <h2>绑定手机号</h2>
          </div>
          <button type="button" className="text-button" onClick={onClose}>
            关闭
          </button>
        </div>
        <label>
          手机号
          <input value={phone} inputMode="tel" maxLength={11} onChange={(event) => setPhone(event.target.value)} placeholder="请输入手机号" />
        </label>
        <label>
          姓名
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="可选，便于门店识别" />
        </label>
        <label className="check-row">
          <input type="checkbox" checked={agree} onChange={(event) => setAgree(event.target.checked)} />
          <span>同意门店使用手机号匹配会员权益、预约和消费记录。</span>
        </label>
        {error ? <p className="error-text">{error}</p> : null}
        <button className="primary-button" disabled={submitting}>
          {submitting ? '绑定中...' : '确认绑定'}
        </button>
      </form>
    </div>
  );
}

function useHomeData() {
  const session = useSession();
  const [state, setState] = useState<LoadState<HomeData>>({ loading: true });

  useEffect(() => {
    let active = true;
    setState({ loading: true });
    getHome({ storeId: session.storeId, channel: session.tracking.channel })
      .then((data) => {
        if (!active) return;
        session.setStoreId(data.store.id);
        setState({ data, loading: false });
        trackEvent({
          eventType: 'h5_view_home',
          storeId: data.store.id,
          sessionId: session.sessionId,
          channel: session.tracking.channel,
          targetType: 'home',
          targetId: data.store.id,
          payload: session.tracking,
        });
      })
      .catch((err) => active && setState({ loading: false, error: getErrorMessage(err, '首页暂不可访问') }));
    return () => {
      active = false;
    };
  }, [session.storeId, session.tracking, session.sessionId, session.setStoreId]);

  return state;
}

function HomePage() {
  const { data, loading, error } = useHomeData();
  const navigate = useNavigate();

  const openBanner = (banner: HomeData['banners'][number]) => {
    trackEvent({
      eventType: 'h5_click_banner',
      storeId: data?.store.id,
      channel: 'h5',
      targetType: banner.targetType,
      targetId: banner.targetId,
      payload: { title: banner.title },
    });
    if (banner.path) {
      navigate(banner.path);
      return;
    }
    if (banner.targetType === 'project') navigate(`/projects/${banner.targetId}?storeId=${data?.store.id || ''}`);
    else if (banner.targetType === 'promotion') navigate(`/booking?promotionId=${banner.targetId}`);
  };

  return (
    <PageShell title="客户服务 H5" action={data?.store.phone ? <a className="icon-button" href={`tel:${data.store.phone}`}><Phone size={18} /></a> : null}>
      {loading ? <StateBlock loading title="首页加载中" description="正在读取门店服务和推荐项目" /> : null}
      {error ? <StateBlock title="首页暂不可访问" description={error} /> : null}
      {data ? (
        <>
          <section className="hero-panel">
            <div>
              <span className="eyebrow">{data.store.city || '门店服务'}</span>
              <h2>{data.store.name}</h2>
              <p>{data.store.address || '专业美容护理、预约服务与会员权益查询。'}</p>
            </div>
            <Link className="secondary-button" to="/booking">
              立即预约
            </Link>
          </section>

          {data.banners.length ? (
            <section className="banner-strip">
              {data.banners.map((banner) => (
                <button key={banner.id} className="banner-card" onClick={() => openBanner(banner)}>
                  {banner.image ? <img src={banner.image} alt="" loading="lazy" /> : null}
                  <span>{banner.tag || '推荐'}</span>
                  <strong>{banner.title}</strong>
                  <p>{banner.subtitle || '点击查看详情'}</p>
                </button>
              ))}
            </section>
          ) : null}

          <section className="section-block">
            <div className="row-between">
              <h2>推荐项目</h2>
              <Link to="/booking" className="text-link">
                全部 <ChevronRight size={16} />
              </Link>
            </div>
            <div className="list-stack">
              {data.recommendedProjects.length ? (
                data.recommendedProjects.map((project) => <ProjectCard key={project.id} project={project} />)
              ) : (
                <StateBlock title="暂无推荐项目" description="门店配置后会在这里展示。" />
              )}
            </div>
          </section>

          <section className="quick-grid">
            <Link to="/mine/reservations">
              <CalendarDays size={20} />
              <span>我的预约</span>
            </Link>
            <Link to="/mine/cards">
              <WalletCards size={20} />
              <span>我的次卡</span>
            </Link>
            <Link to="/tools">
              <Sparkles size={20} />
              <span>AI 测肤</span>
            </Link>
          </section>
        </>
      ) : null}
    </PageShell>
  );
}

function BookingPage() {
  const session = useSession();
  const [searchParams] = useSearchParams();
  const [keyword, setKeyword] = useState('');
  const [state, setState] = useState<LoadState<Paginated<ProjectItem>>>({ loading: true });

  useEffect(() => {
    let active = true;
    setState({ loading: true });
    async function loadProjects() {
      try {
        let storeId = session.storeId;
        if (!storeId) {
          const home = await getHome({ channel: session.tracking.channel });
          storeId = home.store.id;
          session.setStoreId(storeId);
        }
        const data = await getProjects({ storeId, keyword, page: 1, pageSize: 20 });
        if (active) setState({ data, loading: false });
      } catch (err) {
        if (active) setState({ loading: false, error: getErrorMessage(err, '项目列表暂不可访问') });
      }
    }
    void loadProjects();
    return () => {
      active = false;
    };
  }, [session.storeId, session.tracking.channel, session.setStoreId, keyword]);

  useEffect(() => {
    const promotionId = searchParams.get('promotionId');
    if (promotionId) {
      trackEvent({
        eventType: 'h5_view_promotion_booking',
        storeId: session.storeId,
        sessionId: session.sessionId,
        channel: session.tracking.channel,
        targetType: 'promotion',
        targetId: promotionId,
      });
    }
  }, [searchParams, session.storeId, session.sessionId, session.tracking.channel]);

  return (
    <PageShell title="预约服务">
      <label className="search-box">
        <Search size={18} />
        <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索项目名称、护理类型" />
      </label>
      {state.loading ? <StateBlock loading title="项目加载中" /> : null}
      {state.error ? <StateBlock title="项目暂不可访问" description={state.error} /> : null}
      <div className="list-stack">
        {state.data?.items.length ? (
          state.data.items.map((project) => <ProjectCard key={project.id} project={project} />)
        ) : !state.loading ? (
          <StateBlock title="暂无可预约项目" description="可换个关键词，或联系门店顾问。" />
        ) : null}
      </div>
    </PageShell>
  );
}

function ProjectDetailPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const session = useSession();
  const [state, setState] = useState<LoadState<ProjectItem>>({ loading: true });
  const [bookingOpen, setBookingOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const storeId = Number(searchParams.get('storeId')) || session.storeId;
  const projectId = Number(id);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    setState({ loading: true });
    getProjectDetail(projectId, storeId)
      .then((data) => {
        if (!active) return;
        setState({ data, loading: false });
        session.setStoreId(data.storeId);
        trackEvent({
          eventType: 'h5_view_project',
          storeId: data.storeId,
          sessionId: session.sessionId,
          channel: session.tracking.channel,
          targetType: 'project',
          targetId: data.id,
          payload: { projectName: data.name },
        });
      })
      .catch((err) => active && setState({ loading: false, error: getErrorMessage(err, '项目详情暂不可访问') }));
    return () => {
      active = false;
    };
  }, [projectId, storeId, session.sessionId, session.tracking.channel, session.setStoreId]);

  const handleBook = () => {
    trackEvent({
      eventType: 'h5_click_book',
      storeId: state.data?.storeId,
      sessionId: session.sessionId,
      channel: session.tracking.channel,
      targetType: 'project',
      targetId: projectId,
      payload: { projectName: state.data?.name },
    });
    if (!session.customer) {
      setAuthOpen(true);
      return;
    }
    setBookingOpen(true);
  };

  const handleClaim = async (promotionId: number) => {
    if (!session.customer) {
      setAuthOpen(true);
      return;
    }
    try {
      await claimPromotion(promotionId, {
        storeId: state.data?.storeId,
        channel: 'h5_project_detail',
        source: 'ami_glow_h5',
        sessionId: session.sessionId,
      });
      trackEvent({
        eventType: 'h5_promotion_claim',
        storeId: state.data?.storeId,
        sessionId: session.sessionId,
        channel: session.tracking.channel,
        targetType: 'promotion',
        targetId: promotionId,
        payload: { projectId },
      });
      window.alert('权益已领取，可预约时向门店顾问出示');
    } catch (err) {
      window.alert(getErrorMessage(err, '领取失败'));
    }
  };

  return (
    <PageShell title="项目详情">
      {state.loading ? <StateBlock loading title="项目加载中" /> : null}
      {state.error ? <StateBlock title="项目暂不可访问" description={state.error} /> : null}
      {state.data ? (
        <>
          <section className="detail-hero">
            {state.data.image ? <img src={state.data.image} alt={state.data.name} /> : <Sparkles size={42} />}
          </section>
          <section className="section-block">
            <div className="row-between">
              <div>
                <span className="eyebrow">{state.data.typeName || '护理项目'}</span>
                <h2>{state.data.name}</h2>
              </div>
              <strong className="price-text">{displayMoney(state.data.memberPrice ?? state.data.price)}</strong>
            </div>
            <p>{state.data.description || state.data.details?.description || '专业顾问将根据到店状态提供护理建议。'}</p>
            <div className="meta-row">
              <span>
                <Clock size={14} /> {state.data.duration || 60} 分钟
              </span>
              <span>{state.data.canBook ? '支持在线预约' : '暂不可约'}</span>
            </div>
          </section>

          {state.data.promotions?.length ? (
            <section className="section-block">
              <h2>可领权益</h2>
              <div className="list-stack">
                {state.data.promotions.map((promotion) => (
                  <div className="coupon-card" key={promotion.id}>
                    <div>
                      <strong>{promotion.name || promotion.title}</strong>
                      <p>{promotion.discountText || promotion.description || '到店服务可咨询使用规则'}</p>
                    </div>
                    <button className="secondary-button" onClick={() => handleClaim(promotion.id)}>
                      领取
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="section-block">
            <h2>护理说明</h2>
            <div className="chip-list">
              {(state.data.details?.suitableFor || ['日常护理', '肤质管理', '到店咨询']).map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
            <ol className="flow-list">
              {(state.data.details?.serviceFlow || ['顾问沟通', '皮肤状态确认', '项目护理', '护理建议']).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </section>

          <div className="sticky-action">
            <button className="primary-button" onClick={handleBook} disabled={!state.data.canBook}>
              立即预约
            </button>
          </div>

          <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onDone={() => setBookingOpen(true)} />
          <ReservationSheet project={state.data} open={bookingOpen} onClose={() => setBookingOpen(false)} />
        </>
      ) : null}
    </PageShell>
  );
}

function ReservationSheet({ project, open, onClose }: { project: ProjectItem; open: boolean; onClose: () => void }) {
  const session = useSession();
  const navigate = useNavigate();
  const days = useMemo(() => nextDays(7), []);
  const [beauticians, setBeauticians] = useState<BeauticianItem[]>([]);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [beauticianId, setBeauticianId] = useState<number | undefined>();
  const [date, setDate] = useState(days[0].value);
  const [slot, setSlot] = useState<AvailabilitySlot | undefined>();
  const [remark, setRemark] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    getAvailableBeauticians(project.id, project.storeId)
      .then(setBeauticians)
      .catch(() => setBeauticians([]));
  }, [open, project.id, project.storeId]);

  useEffect(() => {
    if (!open) return;
    setSlot(undefined);
    getAvailability({ storeId: project.storeId, projectId: project.id, beauticianId, date })
      .then((data) => setSlots(data.slots))
      .catch((err) => {
        setSlots([]);
        setError(getErrorMessage(err, '可预约时段加载失败'));
      });
  }, [open, project.storeId, project.id, beauticianId, date]);

  if (!open) return null;

  const submit = async () => {
    if (!slot) {
      setError('请选择预约时段');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const reservation = await createReservation({
        storeId: project.storeId,
        projectId: project.id,
        beauticianId,
        date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        customerName: session.customer?.name,
        customerPhone: session.customer?.phone,
        remark,
        channel: 'h5_project_detail',
        source: 'ami_glow_h5',
        campaignId: session.tracking.campaignId,
        staffId: session.tracking.staffId,
        promotionId: session.tracking.promotionId,
      });
      trackEvent({
        eventType: 'h5_reservation_success',
        storeId: project.storeId,
        sessionId: session.sessionId,
        channel: session.tracking.channel,
        targetType: 'reservation',
        targetId: reservation.id,
        payload: { projectId: project.id, promotionId: session.tracking.promotionId },
      });
      onClose();
      navigate('/mine/reservations');
    } catch (err) {
      trackEvent({
        eventType: 'h5_booking_failed',
        storeId: project.storeId,
        sessionId: session.sessionId,
        channel: session.tracking.channel,
        targetType: 'project',
        targetId: project.id,
        payload: { message: getErrorMessage(err, '预约失败') },
      });
      setError(getErrorMessage(err, '预约失败，请重新选择时段'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-panel reservation-panel">
        <div className="row-between">
          <div>
            <span className="eyebrow">预约确认</span>
            <h2>{project.name}</h2>
          </div>
          <button type="button" className="text-button" onClick={onClose}>
            关闭
          </button>
        </div>
        <section>
          <h3>选择美容师</h3>
          <div className="chip-list">
            <button className={!beauticianId ? 'selected' : ''} onClick={() => setBeauticianId(undefined)}>
              到店分配
            </button>
            {beauticians.map((item) => (
              <button key={item.id} className={beauticianId === item.id ? 'selected' : ''} onClick={() => setBeauticianId(item.id)}>
                {item.name}
              </button>
            ))}
          </div>
        </section>
        <section>
          <h3>选择日期</h3>
          <div className="date-row">
            {days.map((item) => (
              <button key={item.value} className={date === item.value ? 'selected' : ''} onClick={() => setDate(item.value)}>
                <span>{item.label}</span>
                <small>{item.weekday}</small>
              </button>
            ))}
          </div>
        </section>
        <section>
          <h3>选择时段</h3>
          <div className="slot-grid">
            {slots.length ? (
              slots.map((item) => (
                <button
                  key={`${item.startTime}-${item.endTime}`}
                  className={slot?.startTime === item.startTime ? 'selected' : ''}
                  disabled={!item.available}
                  onClick={() => setSlot(item)}
                  title={item.reason}
                >
                  {item.startTime}
                </button>
              ))
            ) : (
              <p className="muted">暂无可预约时段</p>
            )}
          </div>
        </section>
        <label>
          备注
          <textarea value={remark} onChange={(event) => setRemark(event.target.value)} placeholder="肤质情况、偏好美容师或其他说明" />
        </label>
        {error ? <p className="error-text">{error}</p> : null}
        <button className="primary-button" onClick={submit} disabled={loading}>
          {loading ? '提交中...' : '确认预约'}
        </button>
      </div>
    </div>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const [authOpen, setAuthOpen] = useState(false);
  if (!session.customer) {
    return (
      <div className="list-stack">
        <StateBlock title="需要先绑定手机号" description="绑定后即可查看预约、次卡、消费记录和会员权益。" />
        <button className="primary-button" onClick={() => setAuthOpen(true)}>
          立即绑定
        </button>
        <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      </div>
    );
  }
  return <>{children}</>;
}

function MinePage() {
  const session = useSession();
  const [authOpen, setAuthOpen] = useState(false);
  useEffect(() => {
    trackEvent({
      eventType: 'h5_view_mine',
      storeId: session.storeId,
      sessionId: session.sessionId,
      channel: session.tracking.channel,
      targetType: 'mine',
    });
  }, [session.storeId, session.sessionId, session.tracking.channel]);
  return (
    <PageShell title="我的">
      <section className="profile-card">
        <div className="avatar">{session.customer?.name?.slice(0, 1) || 'A'}</div>
        <div>
          <span className="eyebrow">{session.customer ? session.customer.memberLevel : '未绑定'}</span>
          <h2>{session.customer?.name || '绑定手机号查看会员服务'}</h2>
          <p>{session.customer?.phone || '预约、权益、消费记录会与手机号关联。'}</p>
        </div>
        {!session.customer ? (
          <button className="secondary-button" onClick={() => setAuthOpen(true)}>
            绑定
          </button>
        ) : null}
      </section>
      <section className="menu-list">
        <Link to="/mine/reservations">
          <CalendarDays size={20} />
          <span>我的预约</span>
          <ChevronRight size={16} />
        </Link>
        <Link to="/mine/cards">
          <WalletCards size={20} />
          <span>我的次卡</span>
          <ChevronRight size={16} />
        </Link>
        <Link to="/mine/consumption-records">
          <Clock size={20} />
          <span>消费记录</span>
          <ChevronRight size={16} />
        </Link>
        <Link to="/mine/member-card">
          <UserRound size={20} />
          <span>会员卡</span>
          <ChevronRight size={16} />
        </Link>
        <Link to="/mine/notifications">
          <Bell size={20} />
          <span>站内通知</span>
          <ChevronRight size={16} />
        </Link>
      </section>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </PageShell>
  );
}

function NotificationsPage() {
  const session = useSession();
  const [state, setState] = useState<LoadState<MarketingNotificationPage>>({ loading: Boolean(session.customer) });

  const load = () => {
    if (!session.customer) {
      setState({ loading: false });
      return;
    }
    setState((current) => ({ ...current, loading: true, error: undefined }));
    getNotifications({ page: 1, pageSize: 20 })
      .then((data) => setState({ data, loading: false }))
      .catch((err) => setState({ loading: false, error: getErrorMessage(err, '站内通知加载失败') }));
  };

  useEffect(load, [session.customer?.id]);

  const handleOpen = async (notification: MarketingNotification) => {
    if (notification.status !== 'delivered') return;
    try {
      const opened = await openNotification(notification.id);
      setState((current) => current.data ? {
        ...current,
        data: {
          ...current.data,
          unreadCount: Math.max(0, current.data.unreadCount - 1),
          items: current.data.items.map((item) => item.id === opened.id ? opened : item),
        },
      } : current);
    } catch (err) {
      window.alert(getErrorMessage(err, '通知状态更新失败'));
    }
  };

  return (
    <PageShell title="站内通知">
      <AuthGate>
        {state.data ? <p className="muted">未读 {state.data.unreadCount} 条</p> : null}
        {state.loading ? <StateBlock loading title="通知加载中" /> : null}
        {state.error ? <StateBlock title="通知暂不可访问" description={state.error} /> : null}
        <div className="list-stack">
          {state.data?.items.length ? (
            state.data.items.map((notification) => (
              <button
                type="button"
                className={`service-card notification-card ${notification.status === 'delivered' ? 'unread' : 'read'}`}
                key={notification.id}
                onClick={() => handleOpen(notification)}
              >
                <div className="row-between">
                  <strong>{notification.title}</strong>
                  <span className="tag">{notification.status === 'delivered' ? '未读' : '已读'}</span>
                </div>
                <p>{notification.content}</p>
                <small>{displayDate(notification.deliveredAt || notification.createdAt)}</small>
              </button>
            ))
          ) : !state.loading ? (
            <StateBlock title="暂无站内通知" description="护理提醒和会员权益消息会显示在这里。" />
          ) : null}
        </div>
      </AuthGate>
    </PageShell>
  );
}

function MyReservationsPage() {
  const [state, setState] = useState<LoadState<Paginated<ReservationItem>>>({ loading: true });

  const load = () => {
    setState({ loading: true });
    getMyReservations({ page: 1, pageSize: 20 })
      .then((data) => setState({ data, loading: false }))
      .catch((err) => setState({ loading: false, error: getErrorMessage(err, '预约记录加载失败') }));
  };

  useEffect(load, []);

  const handleCancel = async (id: number) => {
    if (!window.confirm('确认取消这条预约？')) return;
    try {
      await cancelReservation(id, '客户 H5 自助取消');
      load();
    } catch (err) {
      window.alert(getErrorMessage(err, '取消失败'));
    }
  };

  return (
    <PageShell title="我的预约">
      <AuthGate>
        {state.loading ? <StateBlock loading title="预约加载中" /> : null}
        {state.error ? <StateBlock title="预约暂不可访问" description={state.error} /> : null}
        <div className="list-stack">
          {state.data?.items.length ? (
            state.data.items.map((item) => (
              <article className="service-card" key={item.id}>
                <div className="row-between">
                  <strong>{item.projectName || `预约 #${item.id}`}</strong>
                  <span className="tag">{item.status}</span>
                </div>
                <p>
                  {displayDate(item.date)} {item.startTime}
                  {item.endTime ? `-${item.endTime}` : ''}
                </p>
                <p>{item.beauticianName || '到店分配美容师'}</p>
                {['pending', 'confirmed'].includes(item.status) ? (
                  <button className="secondary-button" onClick={() => handleCancel(item.id)}>
                    取消预约
                  </button>
                ) : null}
              </article>
            ))
          ) : !state.loading ? (
            <StateBlock title="暂无预约" description="从项目详情选择时间后，预约会显示在这里。" />
          ) : null}
        </div>
      </AuthGate>
    </PageShell>
  );
}

function CardsPage() {
  const [state, setState] = useState<LoadState<any[]>>({ loading: true });
  useEffect(() => {
    getMyCards()
      .then((data) => setState({ data, loading: false }))
      .catch((err) => setState({ loading: false, error: getErrorMessage(err, '次卡加载失败') }));
  }, []);
  return (
    <PageShell title="我的次卡">
      <AuthGate>
        {state.loading ? <StateBlock loading title="次卡加载中" /> : null}
        {state.error ? <StateBlock title="次卡暂不可访问" description={state.error} /> : null}
        <div className="list-stack">
          {state.data?.length ? (
            state.data.map((card, index) => (
              <article className="service-card" key={card.id || index}>
                <strong>{card.cardName || card.name || '护理次卡'}</strong>
                <p>剩余 {card.remainingTimes ?? card.remainingCount ?? '-'} 次</p>
                <p>{card.expireAt || card.validUntil ? `有效期至 ${displayDate(card.expireAt || card.validUntil)}` : '请以门店记录为准'}</p>
              </article>
            ))
          ) : !state.loading ? (
            <StateBlock title="暂无次卡" description="购买或领取后会显示在这里。" />
          ) : null}
        </div>
      </AuthGate>
    </PageShell>
  );
}

function ConsumptionRecordsPage() {
  const [state, setState] = useState<LoadState<Paginated<any>>>({ loading: true });
  useEffect(() => {
    getConsumptionRecords({ page: 1, pageSize: 20 })
      .then((data) => setState({ data, loading: false }))
      .catch((err) => setState({ loading: false, error: getErrorMessage(err, '消费记录加载失败') }));
  }, []);
  return (
    <PageShell title="消费记录">
      <AuthGate>
        {state.loading ? <StateBlock loading title="记录加载中" /> : null}
        {state.error ? <StateBlock title="记录暂不可访问" description={state.error} /> : null}
        <div className="list-stack">
          {state.data?.items.length ? (
            state.data.items.map((record, index) => (
              <article className="service-card" key={record.id || index}>
                <div className="row-between">
                  <strong>{record.projectName || record.productName || record.name || '消费记录'}</strong>
                  <span>{displayMoney(record.amount ?? record.totalAmount)}</span>
                </div>
                <p>{displayDate(record.createdAt || record.paidAt || record.date)}</p>
              </article>
            ))
          ) : !state.loading ? (
            <StateBlock title="暂无消费记录" description="到店服务或购买后会同步到这里。" />
          ) : null}
        </div>
      </AuthGate>
    </PageShell>
  );
}

function MemberCardPage() {
  const [state, setState] = useState<LoadState<any>>({ loading: true });
  useEffect(() => {
    getMemberCard()
      .then((data) => setState({ data, loading: false }))
      .catch((err) => setState({ loading: false, error: getErrorMessage(err, '会员卡加载失败') }));
  }, []);
  const card = state.data;
  return (
    <PageShell title="会员卡">
      <AuthGate>
        {state.loading ? <StateBlock loading title="会员卡加载中" /> : null}
        {state.error ? <StateBlock title="会员卡暂不可访问" description={state.error} /> : null}
        {card ? (
          <section className="member-card">
            <span className="eyebrow">{card.memberLevel || card.levelName || '会员'}</span>
            <h2>{card.customerName || card.name || 'Ami Glow 会员'}</h2>
            <p>余额：{displayMoney(card.balance ?? card.amount ?? 0)}</p>
            <p>{card.benefits || card.description || '到店可享受门店会员权益。'}</p>
          </section>
        ) : !state.loading ? (
          <StateBlock title="暂无会员卡信息" description="绑定后可查看余额和权益。" />
        ) : null}
      </AuthGate>
    </PageShell>
  );
}

function ToolsPage() {
  const session = useSession();
  const [contact, setContact] = useState<{ phone?: string; address?: string; businessHours?: string } | null>(null);
  useEffect(() => {
    getContact(session.storeId).then(setContact).catch(() => setContact(null));
  }, [session.storeId]);
  return (
    <PageShell title="工具">
      <section className="tool-card">
        <Sparkles size={28} />
        <div>
          <h2>AI 测肤</h2>
          <p>上传当前皮肤照片，生成护理建议和推荐项目。</p>
        </div>
        <Link className="primary-button" to="/skin-test">
          开始
        </Link>
      </section>
      <section className="menu-list">
        <a href={contact?.phone ? `tel:${contact.phone}` : '#'} onClick={(event) => !contact?.phone && event.preventDefault()}>
          <Phone size={20} />
          <span>联系门店顾问</span>
          <ChevronRight size={16} />
        </a>
        <Link to="/booking">
          <CalendarDays size={20} />
          <span>预约护理项目</span>
          <ChevronRight size={16} />
        </Link>
        <Link to={session.customer ? '/mine/cards' : '/mine'}>
          <WalletCards size={20} />
          <span>查看会员权益</span>
          <ChevronRight size={16} />
        </Link>
      </section>
    </PageShell>
  );
}

function SkinTestPage() {
  const session = useSession();
  const navigate = useNavigate();
  const [authOpen, setAuthOpen] = useState(false);
  const [preview, setPreview] = useState('');
  const [imageData, setImageData] = useState('');
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFile = async (file?: File) => {
    setError('');
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setError('图片超过 8MB，请重新选择');
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setPreview(dataUrl);
      setImageData(dataUrl);
    } catch (err) {
      setError(getErrorMessage(err, '图片处理失败'));
    }
  };

  const submit = async () => {
    if (!session.customer) {
      setAuthOpen(true);
      return;
    }
    if (!imageData) {
      setError('请先上传皮肤照片');
      return;
    }
    if (!agree) {
      setError('请先确认测肤授权和免责声明');
      return;
    }
    setLoading(true);
    setError('');
    try {
      trackEvent({
        eventType: 'h5_skin_test_start',
        storeId: session.storeId,
        sessionId: session.sessionId,
        channel: session.tracking.channel,
        targetType: 'skin_test',
      });
      const report = await analyzeSkin(imageData);
      navigate(`/skin-reports/${report.id}`);
    } catch (err) {
      setError(getErrorMessage(err, '测肤分析失败，请稍后再试'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell title="AI 测肤">
      <section className="section-block">
        <h2>上传皮肤照片</h2>
        <p>建议在自然光下拍摄正脸或局部皮肤，照片仅用于本次护理建议。</p>
        <label className="upload-box">
          {preview ? <img src={preview} alt="测肤预览" /> : <span>点击拍照或选择图片</span>}
          <input type="file" accept="image/*" capture="environment" onChange={(event) => handleFile(event.target.files?.[0])} />
        </label>
        <label className="check-row">
          <input type="checkbox" checked={agree} onChange={(event) => setAgree(event.target.checked)} />
          <span>我确认测肤结果仅供美容护理参考，不构成医疗诊断。</span>
        </label>
        {error ? <p className="error-text">{error}</p> : null}
        <button className="primary-button" onClick={submit} disabled={loading}>
          {loading ? '分析中...' : '生成测肤报告'}
        </button>
      </section>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </PageShell>
  );
}

function SkinReportPage() {
  const { id } = useParams();
  const session = useSession();
  const [state, setState] = useState<LoadState<SkinReport>>({ loading: true });
  const [recommendations, setRecommendations] = useState<ProjectItem[]>([]);

  useEffect(() => {
    const reportId = Number(id);
    if (!reportId) return;
    getSkinReport(reportId)
      .then((data) => {
        setState({ data, loading: false });
        trackEvent({
          eventType: 'h5_skin_test_complete',
          storeId: session.storeId,
          sessionId: session.sessionId,
          channel: session.tracking.channel,
          targetType: 'skin_test',
          targetId: reportId,
        });
      })
      .catch((err) => setState({ loading: false, error: getErrorMessage(err, '测肤报告加载失败') }));
    getSkinRecommendations(reportId).then(setRecommendations).catch(() => setRecommendations([]));
  }, [id, session.storeId, session.sessionId, session.tracking.channel]);

  return (
    <PageShell title="测肤报告">
      {state.loading ? <StateBlock loading title="报告加载中" /> : null}
      {state.error ? <StateBlock title="报告暂不可访问" description={state.error} /> : null}
      {state.data ? (
        <>
          <section className="score-panel">
            <span className="eyebrow">综合评分</span>
            <strong>{state.data.overallScore ?? '--'}</strong>
            <p>{state.data.skinType} {state.data.skinStatus || ''}</p>
          </section>
          <section className="section-block">
            <h2>主要问题</h2>
            <p>{state.data.mainProblems || state.data.explanation || '暂未发现明显问题，建议保持规律护理。'}</p>
            <h2>护理建议</h2>
            <p>{state.data.advice || state.data.recommendationText || '建议结合门店顾问建议选择护理项目。'}</p>
          </section>
          <section className="section-block">
            <div className="row-between">
              <h2>推荐项目</h2>
              <Link to="/booking" className="text-link">
                更多
              </Link>
            </div>
            <div className="list-stack">
              {recommendations.length ? (
                recommendations.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    compact
                    onClick={() =>
                      trackEvent({
                        eventType: 'h5_click_recommendation',
                        storeId: session.storeId,
                        sessionId: session.sessionId,
                        channel: session.tracking.channel,
                        targetType: 'project',
                        targetId: project.id,
                        payload: { reportId: id },
                      })
                    }
                  />
                ))
              ) : (
                <StateBlock title="暂无推荐项目" description="可到项目列表查看可预约护理。" />
              )}
            </div>
          </section>
        </>
      ) : null}
    </PageShell>
  );
}

function LoginPage() {
  const navigate = useNavigate();
  const session = useSession();
  const [authOpen, setAuthOpen] = useState(true);

  return (
    <PageShell title="登录绑定">
      <section className="section-block">
        <span className="eyebrow">{session.tracking.inWechat ? '微信内访问' : 'H5 登录'}</span>
        <h2>绑定手机号</h2>
        <p>绑定后可查看预约、次卡、消费记录和会员权益，也可以继续完成项目预约。</p>
        <button className="primary-button" onClick={() => setAuthOpen(true)}>
          绑定手机号
        </button>
      </section>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onDone={() => navigate('/mine')} />
    </PageShell>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/home" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/booking" element={<BookingPage />} />
      <Route path="/projects/:id" element={<ProjectDetailPage />} />
      <Route path="/mine" element={<MinePage />} />
      <Route path="/mine/reservations" element={<MyReservationsPage />} />
      <Route path="/mine/cards" element={<CardsPage />} />
      <Route path="/mine/consumption-records" element={<ConsumptionRecordsPage />} />
      <Route path="/mine/member-card" element={<MemberCardPage />} />
      <Route path="/mine/notifications" element={<NotificationsPage />} />
      <Route path="/tools" element={<ToolsPage />} />
      <Route path="/skin-test" element={<SkinTestPage />} />
      <Route path="/skin-reports/:id" element={<SkinReportPage />} />
      <Route path="*" element={<HomePage />} />
    </Routes>
  );
}
