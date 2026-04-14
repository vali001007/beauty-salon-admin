import { useState } from 'react';
import { Calendar, MapPin, Gift, Phone, ChevronRight, X, Share2, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

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
}

interface ActivityMiniPageProps {
  data: ActivityPageData;
  onClose: () => void;
  showSharePanel?: boolean;
}

const LAYOUT_STYLES = {
  classic: { headerBg: 'bg-gradient-to-br from-pink-500 to-rose-600', accent: 'text-pink-600', btn: 'bg-pink-500 hover:bg-pink-600', btnRing: 'ring-pink-200' },
  modern: { headerBg: 'bg-gradient-to-br from-blue-500 to-indigo-600', accent: 'text-blue-600', btn: 'bg-blue-500 hover:bg-blue-600', btnRing: 'ring-blue-200' },
  elegant: { headerBg: 'bg-gradient-to-br from-amber-600 to-yellow-700', accent: 'text-amber-700', btn: 'bg-amber-600 hover:bg-amber-700', btnRing: 'ring-amber-200' },
  vibrant: { headerBg: 'bg-gradient-to-br from-purple-500 to-fuchsia-600', accent: 'text-purple-600', btn: 'bg-purple-500 hover:bg-purple-600', btnRing: 'ring-purple-200' },
};

export function ActivityMiniPage({ data, onClose, showSharePanel = false }: ActivityMiniPageProps) {
  const [showBooking, setShowBooking] = useState(false);
  const [booked, setBooked] = useState(false);
  const [showShare, setShowShare] = useState(showSharePanel);
  const [copied, setCopied] = useState(false);
  const style = LAYOUT_STYLES[data.layout] || LAYOUT_STYLES.classic;

  const handleBook = () => {
    setShowBooking(true);
    setTimeout(() => { setShowBooking(false); setBooked(true); toast.success('预约成功！门店将尽快与您联系'); }, 1500);
  };

  const handleCopyLink = () => {
    navigator.clipboard?.writeText(`https://mini.beauty-salon.com/activity/${Date.now()}`);
    setCopied(true);
    toast.success('链接已复制');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-white flex flex-col items-center justify-center z-[60]">
      <div className="relative">
        {/* Phone frame */}
        <div className="w-[375px] bg-white rounded-[36px] shadow-2xl overflow-hidden border-[12px] border-gray-900 flex flex-col">
          {/* Status bar */}
          <div className="h-6 bg-white flex items-center justify-between px-6 text-xs shrink-0">
            <span>9:41</span>
            <div className="w-4 h-3 border border-gray-400 rounded-sm"><div className="w-2 h-full bg-gray-400" /></div>
          </div>

          {/* Content */}
          <div className="flex-1 bg-gray-50 overflow-y-auto" style={{ height: '607px' }}>
            {/* Nav bar */}
            <div className="bg-white px-4 py-3 flex items-center justify-between shadow-sm sticky top-0 z-10">
              <button onClick={onClose} className="text-gray-600"><X className="w-5 h-5" /></button>
              <span className="font-medium text-gray-900">活动详情</span>
              <button onClick={() => setShowShare(true)} className="text-gray-600"><Share2 className="w-5 h-5" /></button>
            </div>

            {/* Hero section */}
            <div className={`relative w-full aspect-[16/10] ${data.posterBg ? '' : style.headerBg}`} style={data.posterBg ? { backgroundColor: data.posterBg } : undefined}>
              {data.posterImage && <img src={data.posterImage} alt="" className="w-full h-full object-cover opacity-30" />}
              <div className="absolute inset-0 flex flex-col justify-between p-5">
                <div>
                  <div className="inline-block px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-white text-xs mb-3">限时活动</div>
                  <h1 className="text-2xl font-bold leading-tight" style={{ color: data.posterTitleColor || '#FFFFFF' }}>{data.title || '活动名称'}</h1>
                </div>
                <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3">
                  <div className="text-xs mb-1" style={{ color: data.posterTitleColor || '#FFFFFF', opacity: 0.8 }}>专属优惠</div>
                  <div className="text-lg font-bold" style={{ color: data.posterTitleColor || '#FFFFFF' }}>{data.discount || '优惠信息'}</div>
                </div>
              </div>
            </div>

            {/* Time & Location */}
            <div className="bg-white mx-4 -mt-4 rounded-xl p-4 shadow-sm relative z-[1]">
              <div className="flex items-center gap-3 mb-3">
                <Calendar className={`w-4 h-4 ${style.accent}`} />
                <div>
                  <div className="text-xs text-gray-500">活动时间</div>
                  <div className="text-sm font-medium text-gray-900">{data.startDate} 至 {data.endDate}</div>
                </div>
              </div>
              {data.storeName && (
                <div className="flex items-center gap-3">
                  <MapPin className={`w-4 h-4 ${style.accent}`} />
                  <div>
                    <div className="text-xs text-gray-500">活动门店</div>
                    <div className="text-sm font-medium text-gray-900">{data.storeName}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Description */}
            <div className="bg-white mx-4 mt-3 rounded-xl p-4 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <Gift className={`w-4 h-4 ${style.accent}`} /> 活动详情
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">{data.description || '暂无活动描述'}</p>
            </div>

            {/* Projects */}
            {data.projects && data.projects.length > 0 && (
              <div className="bg-white mx-4 mt-3 rounded-xl p-4 shadow-sm">
                <h3 className="font-semibold text-gray-900 mb-3">参与项目</h3>
                {data.projects.map((p, i) => (
                  <div key={i} className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{p.name}</div>
                      {p.type && <div className="text-xs text-gray-500">{p.type}</div>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${style.accent}`}>¥{p.price}</span>
                      <ChevronRight className="w-4 h-4 text-gray-300" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Products */}
            {data.products && data.products.length > 0 && (
              <div className="bg-white mx-4 mt-3 rounded-xl p-4 shadow-sm">
                <h3 className="font-semibold text-gray-900 mb-3">推荐商品</h3>
                <div className="grid grid-cols-2 gap-3">
                  {data.products.map((p, i) => (
                    <div key={i} className="bg-gray-50 rounded-lg p-3">
                      <div className="text-sm font-medium text-gray-900">{p.name}</div>
                      <div className={`text-sm font-bold ${style.accent} mt-1`}>¥{p.price}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Store info */}
            {data.storePhone && (
              <div className="bg-white mx-4 mt-3 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Phone className={`w-4 h-4 ${style.accent}`} />
                    <span className="text-sm text-gray-700">咨询电话</span>
                  </div>
                  <a href={`tel:${data.storePhone}`} className={`text-sm font-medium ${style.accent}`}>{data.storePhone}</a>
                </div>
              </div>
            )}

            {/* Spacer for bottom button */}
            <div className="h-4" />
          </div>

          {/* Fixed bottom button - inside phone frame */}
          <div className="shrink-0 bg-white border-t border-gray-200 p-4">
            {booked ? (
              <div className="w-full py-3 bg-green-500 text-white rounded-full font-medium text-center flex items-center justify-center gap-2">
                <Check className="w-5 h-5" /> 已预约，门店将联系您
              </div>
            ) : (
              <button onClick={handleBook} disabled={showBooking}
                className={`w-full py-3 ${style.btn} text-white rounded-full font-medium shadow-lg ring-4 ${style.btnRing} transition-all ${showBooking ? 'opacity-70' : 'active:scale-95'}`}>
                {showBooking ? '预约中...' : '立即预约参与'}
              </button>
            )}
          </div>
        </div>

        {/* Bottom actions */}
        <div className="flex items-center gap-3 mt-6">
          <button onClick={() => setShowShare(true)} className="px-6 py-2.5 text-blue-600 bg-white border border-blue-300 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors shadow-sm flex items-center gap-2">
            <Share2 className="w-4 h-4" /> 分享
          </button>
          <button type="button" onClick={onClose} className="px-8 py-2.5 text-blue-600 bg-white border border-blue-300 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors shadow-sm">
            返回
          </button>
        </div>
      </div>

      {/* Share panel overlay */}
      {showShare && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-[70]" onClick={() => setShowShare(false)}>
          <div className="w-[375px] bg-white rounded-t-2xl p-6 mb-0" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 mb-4 text-center">分享活动</h3>
            <div className="grid grid-cols-4 gap-4 mb-6">
              {[
                { icon: '💬', label: '微信好友' },
                { icon: '📱', label: '朋友圈' },
                { icon: '📋', label: '复制链接' },
                { icon: '📷', label: '保存海报' },
              ].map((item, i) => (
                <button key={i} onClick={i === 2 ? handleCopyLink : () => toast.success(`已分享到${item.label}`)}
                  className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center text-2xl">{item.icon}</div>
                  <span className="text-xs text-gray-600">{item.label}</span>
                </button>
              ))}
            </div>
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">活动链接</span>
                <button onClick={handleCopyLink} className="text-xs text-blue-600 flex items-center gap-1">
                  {copied ? <><Check className="w-3 h-3" /> 已复制</> : <><Copy className="w-3 h-3" /> 复制</>}
                </button>
              </div>
              <div className="text-xs text-gray-400 truncate">https://mini.beauty-salon.com/activity/{Date.now()}</div>
            </div>
            <button onClick={() => setShowShare(false)} className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-medium">取消</button>
          </div>
        </div>
      )}
    </div>
  );
}
