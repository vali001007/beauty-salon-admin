import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { 
  Users, Eye, MousePointerClick, 
  DollarSign, Target, ArrowLeft,
  BarChart3, PieChart, Activity
} from 'lucide-react';

export function MarketingActivityEffect() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [timeRange, setTimeRange] = useState('7days');

  // 模拟根据ID获取不同的活动数据
  const getActivityData = (activityId: string) => {
    const activitiesData: Record<string, any> = {
      '1': {
        name: '春季焕肤套餐',
        status: '进行中',
        startDate: '2026-03-15',
        endDate: '2026-04-15',
        overview: {
          views: 2456,
          clicks: 892,
          participants: 156,
          conversion: 23,
          revenue: 45600
        },
        dailyTrend: [
          { date: '03-19', views: 234, clicks: 89, participants: 12 },
          { date: '03-20', views: 267, clicks: 95, participants: 15 },
          { date: '03-21', views: 289, clicks: 102, participants: 18 },
          { date: '03-22', views: 312, clicks: 118, participants: 20 },
          { date: '03-23', views: 298, clicks: 106, participants: 16 },
          { date: '03-24', views: 334, clicks: 125, participants: 22 },
          { date: '03-25', views: 356, clicks: 134, participants: 24 }
        ],
        customerSegments: [
          { segment: '新客户', count: 45, percentage: 29 },
          { segment: '老客户', count: 78, percentage: 50 },
          { segment: '沉睡客户', count: 33, percentage: 21 }
        ],
        topChannels: [
          { channel: '微信朋友圈', views: 1234, conversion: 28 },
          { channel: '微信公众号', views: 789, conversion: 22 },
          { channel: '短信推送', views: 433, conversion: 18 }
        ]
      },
      '2': {
        name: '会员生日专享',
        status: '进行中',
        startDate: '2026-03-01',
        endDate: '2026-12-31',
        overview: {
          views: 3200,
          clicks: 1450,
          participants: 89,
          conversion: 45,
          revenue: 67800
        },
        dailyTrend: [
          { date: '03-19', views: 320, clicks: 145, participants: 10 },
          { date: '03-20', views: 340, clicks: 155, participants: 12 },
          { date: '03-21', views: 380, clicks: 170, participants: 14 },
          { date: '03-22', views: 410, clicks: 185, participants: 15 },
          { date: '03-23', views: 390, clicks: 175, participants: 13 },
          { date: '03-24', views: 430, clicks: 195, participants: 16 },
          { date: '03-25', views: 460, clicks: 210, participants: 18 }
        ],
        customerSegments: [
          { segment: '新客户', count: 12, percentage: 13 },
          { segment: '老客户', count: 68, percentage: 76 },
          { segment: '沉睡客户', count: 9, percentage: 11 }
        ],
        topChannels: [
          { channel: '短信推送', views: 1800, conversion: 52 },
          { channel: '微信公众号', views: 980, conversion: 38 },
          { channel: '微信朋友圈', views: 420, conversion: 25 }
        ]
      },
      '3': {
        name: '好友推荐计划',
        status: '进行中',
        startDate: '2026-02-20',
        endDate: '2026-05-20',
        overview: {
          views: 4800,
          clicks: 1680,
          participants: 234,
          conversion: 18,
          revenue: 89400
        },
        dailyTrend: [
          { date: '03-19', views: 480, clicks: 168, participants: 28 },
          { date: '03-20', views: 520, clicks: 182, participants: 32 },
          { date: '03-21', views: 560, clicks: 196, participants: 35 },
          { date: '03-22', views: 590, clicks: 206, participants: 38 },
          { date: '03-23', views: 570, clicks: 200, participants: 34 },
          { date: '03-24', views: 610, clicks: 214, participants: 40 },
          { date: '03-25', views: 650, clicks: 228, participants: 45 }
        ],
        customerSegments: [
          { segment: '新客户', count: 102, percentage: 44 },
          { segment: '老客户', count: 98, percentage: 42 },
          { segment: '沉睡客户', count: 34, percentage: 14 }
        ],
        topChannels: [
          { channel: '微信朋友圈', views: 2400, conversion: 22 },
          { channel: '好友分享', views: 1680, conversion: 28 },
          { channel: '微信公众号', views: 720, conversion: 15 }
        ]
      },
      '4': {
        name: '夏季美白计划',
        status: '即将开始',
        startDate: '2026-04-01',
        endDate: '2026-06-30',
        overview: {
          views: 890,
          clicks: 234,
          participants: 0,
          conversion: 0,
          revenue: 0
        },
        dailyTrend: [
          { date: '03-19', views: 89, clicks: 23, participants: 0 },
          { date: '03-20', views: 95, clicks: 25, participants: 0 },
          { date: '03-21', views: 112, clicks: 29, participants: 0 },
          { date: '03-22', views: 128, clicks: 33, participants: 0 },
          { date: '03-23', views: 134, clicks: 35, participants: 0 },
          { date: '03-24', views: 145, clicks: 38, participants: 0 },
          { date: '03-25', views: 187, clicks: 51, participants: 0 }
        ],
        customerSegments: [
          { segment: '新客户', count: 0, percentage: 0 },
          { segment: '老客户', count: 0, percentage: 0 },
          { segment: '沉睡客户', count: 0, percentage: 0 }
        ],
        topChannels: [
          { channel: '微信朋友圈', views: 534, conversion: 0 },
          { channel: '微信公众号', views: 267, conversion: 0 },
          { channel: '短信推送', views: 89, conversion: 0 }
        ]
      }
    };

    return activitiesData[activityId] || activitiesData['1'];
  };

  const activityData = getActivityData(id || '1');

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <button
            onClick={() => navigate(-1 as any)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            返回
          </button>
          <h1 className="text-xl font-semibold text-gray-900">{activityData.name}</h1>
          <div className="flex items-center gap-3 mt-2">
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
              activityData.status === '进行中' 
                ? 'bg-green-100 text-green-700' 
                : 'bg-yellow-100 text-yellow-700'
            }`}>
              {activityData.status}
            </span>
            <span className="text-sm text-gray-500">
              {activityData.startDate} 至 {activityData.endDate}
            </span>
          </div>
        </div>
        <div className="flex gap-3">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="7days">最近7天</option>
            <option value="30days">最近30天</option>
            <option value="all">全部时间</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="space-y-6">
          {/* 核心指标卡片 */}
          <div className="grid grid-cols-5 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <Eye className="w-5 h-5 text-blue-600" />
                <span className="text-xs text-green-600 font-medium">+12.5%</span>
              </div>
              <div className="text-2xl font-bold text-blue-900 mb-1">
                {activityData.overview.views.toLocaleString()}
              </div>
              <div className="text-sm text-blue-600">浏览量</div>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <MousePointerClick className="w-5 h-5 text-purple-600" />
                <span className="text-xs text-green-600 font-medium">+8.3%</span>
              </div>
              <div className="text-2xl font-bold text-purple-900 mb-1">
                {activityData.overview.clicks.toLocaleString()}
              </div>
              <div className="text-sm text-purple-600">点击量</div>
            </div>

            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <Users className="w-5 h-5 text-green-600" />
                <span className="text-xs text-green-600 font-medium">+15.2%</span>
              </div>
              <div className="text-2xl font-bold text-green-900 mb-1">
                {activityData.overview.participants}
              </div>
              <div className="text-sm text-green-600">参与人数</div>
            </div>

            <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <Target className="w-5 h-5 text-orange-600" />
                <span className={`text-xs font-medium ${
                  activityData.overview.conversion > 0 
                    ? 'text-green-600' 
                    : 'text-gray-500'
                }`}>
                  {activityData.overview.conversion > 0 ? '+2.1%' : '--'}
                </span>
              </div>
              <div className="text-2xl font-bold text-orange-900 mb-1">
                {activityData.overview.conversion}%
              </div>
              <div className="text-sm text-orange-600">转化率</div>
            </div>

            <div className="bg-gradient-to-br from-pink-50 to-pink-100 rounded-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <DollarSign className="w-5 h-5 text-pink-600" />
                <span className={`text-xs font-medium ${
                  activityData.overview.revenue > 0 
                    ? 'text-green-600' 
                    : 'text-gray-500'
                }`}>
                  {activityData.overview.revenue > 0 ? '+18.7%' : '--'}
                </span>
              </div>
              <div className="text-2xl font-bold text-pink-900 mb-1">
                ¥{activityData.overview.revenue > 0 
                  ? (activityData.overview.revenue / 1000).toFixed(1) + 'K'
                  : '0'}
              </div>
              <div className="text-sm text-pink-600">营收</div>
            </div>
          </div>

          {/* 趋势图表 */}
          <div className="border border-gray-200 rounded-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-600" />
                数据趋势
              </h3>
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                  <span className="text-gray-600">浏览量</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                  <span className="text-gray-600">点击量</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-gray-600">参与人数</span>
                </div>
              </div>
            </div>
            
            {/* 简易柱状图 */}
            <div className="h-64 flex items-end justify-between gap-2">
              {activityData.dailyTrend.map((day: any, index: number) => (
                <div key={index} className="flex-1 flex flex-col items-center gap-2">
                  <div className="w-full flex items-end justify-center gap-1 h-48">
                    <div
                      className="flex-1 bg-blue-400 rounded-t hover:bg-blue-500 transition-colors cursor-pointer"
                      style={{ height: `${(day.views / 700) * 100}%` }}
                      title={`浏览: ${day.views}`}
                    ></div>
                    <div
                      className="flex-1 bg-purple-400 rounded-t hover:bg-purple-500 transition-colors cursor-pointer"
                      style={{ height: `${(day.clicks / 250) * 100}%` }}
                      title={`点击: ${day.clicks}`}
                    ></div>
                    <div
                      className="flex-1 bg-green-400 rounded-t hover:bg-green-500 transition-colors cursor-pointer"
                      style={{ height: `${(day.participants / 50) * 100}%` }}
                      title={`参与: ${day.participants}`}
                    ></div>
                  </div>
                  <div className="text-xs text-gray-500">{day.date}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* 客户分布 */}
            <div className="border border-gray-200 rounded-lg p-6">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <PieChart className="w-5 h-5 text-blue-600" />
                客户分布
              </h3>
              {activityData.overview.participants > 0 ? (
                <div className="space-y-4">
                  {activityData.customerSegments.map((segment: any, index: number) => (
                    <div key={index}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-600">{segment.segment}</span>
                        <span className="text-sm font-medium text-gray-900">{segment.count}人</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${
                            index === 0 ? 'bg-blue-500' : index === 1 ? 'bg-green-500' : 'bg-orange-500'
                          }`}
                          style={{ width: `${segment.percentage}%` }}
                        ></div>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">{segment.percentage}%</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-32 text-gray-400">
                  暂无客户数据
                </div>
              )}
            </div>

            {/* 渠道效果 */}
            <div className="border border-gray-200 rounded-lg p-6">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-600" />
                渠道效果
              </h3>
              <div className="space-y-4">
                {activityData.topChannels.map((channel: any, index: number) => (
                  <div key={index} className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-900">{channel.channel}</span>
                      <span className={`text-sm font-medium ${
                        channel.conversion > 0 ? 'text-green-600' : 'text-gray-400'
                      }`}>
                        {channel.conversion > 0 ? `${channel.conversion}%` : '--'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Eye className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-600">{channel.views.toLocaleString()} 次浏览</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
