import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Plus, Eye, Users, Calendar, TrendingUp, Target, Tag, Clock, DollarSign, BarChart3, Smartphone } from 'lucide-react';
import { CreateActivityDialog } from '../components/CreateActivityDialog';
import { ActivityMiniPage, type ActivityPageData } from '../components/ActivityMiniPage';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { getMarketingActivities } from '@/api/marketing';
import { toast } from 'sonner';
import type { MarketingActivity } from '@/types';

export function MarketingStrategy() {
  const navigate = useNavigate();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<MarketingActivity | null>(null);
  const [activityStatusFilter, setActivityStatusFilter] = useState('进行中');
  const [activities, setActivities] = useState<MarketingActivity[]>([]);
  const [activityPageData, setActivityPageData] = useState<ActivityPageData | null>(null);

  const loadActivities = useCallback(async () => {
    try {
      const data = await getMarketingActivities();
      setActivities(data);
    } catch {
      toast.error('加载营销活动列表失败');
    }
  }, []);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  const filteredActivities = activities.filter(a => a.status === activityStatusFilter);

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case '进行中': return 'bg-green-500 text-white';
      case '即将开始': return 'bg-yellow-500 text-white';
      case '已结束': return 'bg-gray-400 text-white';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="text-sm text-gray-500">首页 / 智能营销 / 活动管理</div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">活动管理</h1>
          <p className="text-sm text-gray-500 mt-1">创建和管理营销活动，追踪活动效果</p>
        </div>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> 创建活动
        </button>
      </div>

      {/* 状态筛选标签 */}
      <div className="flex items-center gap-2">
        {(['进行中', '即将开始', '已结束', '草稿'] as const).map((status) => {
          const count = activities.filter(a => a.status === status).length;
          return (
            <button
              key={status}
              onClick={() => setActivityStatusFilter(status)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activityStatusFilter === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {status} ({count})
            </button>
          );
        })}
      </div>

      {/* 活动卡片网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredActivities.map((activity) => (
          <div key={activity.id} className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
            <div className="relative h-48" style={{ backgroundColor: activity.posterBg || '#6366f1' }}>
              {(activity.posterImage || activity.image) ? (
                <img src={activity.posterImage || activity.image} alt="" className="w-full h-full object-cover opacity-40" />
              ) : null}
              <div className="absolute inset-0 flex flex-col justify-between p-5">
                <div>
                  <div className="inline-block px-2 py-0.5 bg-white/20 backdrop-blur-sm rounded text-white text-xs">{activity.discount}</div>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white" style={{ color: activity.posterTitleColor || '#FFFFFF' }}>{activity.title}</h3>
                  <p className="text-sm mt-1 line-clamp-1" style={{ color: activity.posterTitleColor || '#FFFFFF', opacity: 0.8 }}>{activity.description}</p>
                </div>
              </div>
              <div className="absolute top-3 right-3">
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusBadgeColor(activity.status)}`}>
                  {activity.status}
                </span>
              </div>
            </div>
            <div className="p-5">
              <p className="text-sm text-gray-600 mb-4">{activity.description}</p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="flex items-center gap-2 text-sm">
                  <Users className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">参与: {activity.participants}人</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <TrendingUp className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">转化: {activity.conversion}</span>
                </div>
                <div className="flex items-center gap-2 text-sm col-span-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">{activity.startDate} 至 {activity.endDate}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-gray-500">目标客户:</span>
                <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded text-xs">{activity.targetCustomers}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setSelectedActivity(activity);
                    setShowDetailDialog(true);
                  }}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                >
                  <Eye className="w-4 h-4" /> 查看详情
                </button>
                <button
                  onClick={() => {
                    setActivityPageData({
                      title: activity.title,
                      description: activity.description,
                      discount: activity.discount,
                      startDate: activity.startDate,
                      endDate: activity.endDate,
                      targetCustomers: activity.targetCustomers,
                      posterBg: activity.posterBg,
                      posterImage: activity.posterImage || activity.image,
                      posterTitleColor: activity.posterTitleColor,
                      layout: activity.posterBg ? 'classic' : (['classic', 'modern', 'elegant', 'vibrant'] as const)[activity.id % 4],
                      storeName: '心悦芸美容养生会所',
                      storePhone: '0571-88888888',
                    });
                  }}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                >
                  <Smartphone className="w-4 h-4" /> 查看活动页
                </button>
                <button
                  onClick={() => navigate(`/customer-marketing/activity-effect/${activity.id}`)}
                  className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                >
                  <TrendingUp className="w-4 h-4" /> 查看效果
                </button>
              </div>
            </div>
          </div>
        ))}
        {filteredActivities.length === 0 && (
          <div className="col-span-2 flex flex-col items-center justify-center py-16 text-gray-400">
            <Calendar className="w-12 h-12 mb-3" />
            <p className="text-sm">暂无{activityStatusFilter}的活动</p>
          </div>
        )}
      </div>

      {/* 活动详情弹窗 */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" aria-describedby="activity-detail-desc">
          <DialogHeader><DialogTitle>活动详情</DialogTitle></DialogHeader>
          <span id="activity-detail-desc" className="sr-only">查看营销活动详细信息</span>
          {selectedActivity && (
            <div className="space-y-6 mt-2">
              <div className="relative rounded-lg overflow-hidden h-56">
                <img src={selectedActivity.image} alt={selectedActivity.title} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-4 left-5 right-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusBadgeColor(selectedActivity.status)}`}>{selectedActivity.status}</span>
                  </div>
                  <h2 className="text-2xl font-bold text-white">{selectedActivity.title}</h2>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <Users className="w-5 h-5 text-blue-600 mx-auto mb-1" />
                  <div className="text-xl font-bold text-blue-900">{selectedActivity.participants}</div>
                  <div className="text-xs text-blue-600">参与人数</div>
                </div>
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <TrendingUp className="w-5 h-5 text-green-600 mx-auto mb-1" />
                  <div className="text-xl font-bold text-green-900">{selectedActivity.conversion}</div>
                  <div className="text-xs text-green-600">转化率</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-4 text-center">
                  <DollarSign className="w-5 h-5 text-purple-600 mx-auto mb-1" />
                  <div className="text-xl font-bold text-purple-900">¥{(selectedActivity.participants * 380).toLocaleString()}</div>
                  <div className="text-xs text-purple-600">预估营收</div>
                </div>
                <div className="bg-orange-50 rounded-lg p-4 text-center">
                  <BarChart3 className="w-5 h-5 text-orange-600 mx-auto mb-1" />
                  <div className="text-xl font-bold text-orange-900">¥{(selectedActivity.participants * 45).toLocaleString()}</div>
                  <div className="text-xs text-orange-600">投入成本</div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-5 space-y-4">
                <div>
                  <div className="text-xs text-gray-500 mb-1">活动描述</div>
                  <div className="text-sm text-gray-800">{selectedActivity.description}</div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <div>
                      <div className="text-xs text-gray-500">活动时间</div>
                      <div className="text-sm text-gray-800">{selectedActivity.startDate} 至 {selectedActivity.endDate}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-gray-400" />
                    <div>
                      <div className="text-xs text-gray-500">目标客户</div>
                      <div className="text-sm text-gray-800">{selectedActivity.targetCustomers}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-gray-400" />
                    <div>
                      <div className="text-xs text-gray-500">优惠内容</div>
                      <div className="text-sm font-medium text-blue-600">{selectedActivity.discount}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <div>
                      <div className="text-xs text-gray-500">活动状态</div>
                      <div className="text-sm text-gray-800">
                        {selectedActivity.status === '进行中'
                          ? `进行中（剩余 ${Math.max(0, Math.ceil((new Date(selectedActivity.endDate).getTime() - Date.now()) / 86400000))} 天）`
                          : selectedActivity.status}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-3">参与趋势（近7天）</h4>
                <div className="flex items-end gap-2 h-24">
                  {[65, 42, 78, 55, 90, 68, 85].map((val, idx) => (
                    <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full bg-blue-100 rounded-t relative" style={{ height: `${val}%` }}>
                        <div className="absolute inset-0 bg-blue-500 rounded-t" />
                      </div>
                      <span className="text-[10px] text-gray-400">{['一', '二', '三', '四', '五', '六', '日'][idx]}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-3">最近参与客户</h4>
                <div className="space-y-2">
                  {[
                    { name: '张女士', time: '2026-03-31 14:20', amount: '¥680' },
                    { name: '王女士', time: '2026-03-31 11:05', amount: '¥520' },
                    { name: '李女士', time: '2026-03-30 16:30', amount: '¥890' },
                    { name: '赵女士', time: '2026-03-30 10:15', amount: '¥350' },
                    { name: '刘女士', time: '2026-03-29 15:40', amount: '¥720' },
                  ].map((customer, idx) => (
                    <div key={idx} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-sm font-medium">{customer.name[0]}</div>
                        <div>
                          <div className="text-sm font-medium text-gray-800">{customer.name}</div>
                          <div className="text-xs text-gray-500">{customer.time}</div>
                        </div>
                      </div>
                      <div className="text-sm font-medium text-blue-600">{customer.amount}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => { setShowDetailDialog(false); navigate(`/customer-marketing/activity-effect/${selectedActivity.id}`); }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm"
                >
                  <TrendingUp className="w-4 h-4" /> 查看效果分析
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <CreateActivityDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onSuccess={loadActivities}
      />

      {/* 活动页面预览 */}
      {activityPageData && (
        <ActivityMiniPage data={activityPageData} onClose={() => setActivityPageData(null)} />
      )}
    </div>
  );
}
