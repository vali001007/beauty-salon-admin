import React from 'react';
import { useNavigate } from 'react-router';
import { 
  Users, TrendingUp, ShoppingBag, Calendar, 
  ArrowUpRight, ArrowDownRight, DollarSign, 
  Target, Megaphone, Package, Activity
} from 'lucide-react';

export function Dashboard() {
  const navigate = useNavigate();

  // 统计数据
  const stats = [
    {
      title: '总客户数',
      value: '2,847',
      change: '+12.5%',
      isIncrease: true,
      icon: Users,
      color: 'blue',
      bgColor: 'bg-blue-50',
      iconColor: 'text-blue-600',
      path: '/customers/data'
    },
    {
      title: '本月新增客户',
      value: '156',
      change: '+8.3%',
      isIncrease: true,
      icon: Users,
      color: 'green',
      bgColor: 'bg-green-50',
      iconColor: 'text-green-600',
      path: '/customers/data'
    },
    {
      title: '今日收入',
      value: '¥45,680',
      change: '+15.2%',
      isIncrease: true,
      icon: DollarSign,
      color: 'purple',
      bgColor: 'bg-purple-50',
      iconColor: 'text-purple-600',
      path: '/orders/products'
    },
    {
      title: '本月总收入',
      value: '¥892,340',
      change: '+22.8%',
      isIncrease: true,
      icon: TrendingUp,
      color: 'orange',
      bgColor: 'bg-orange-50',
      iconColor: 'text-orange-600',
      path: '/orders/products'
    },
  ];

  // 营销活动数据
  const marketingStats = [
    {
      title: '进行中活动',
      value: '3',
      icon: Megaphone,
      bgColor: 'bg-blue-100',
      iconColor: 'text-blue-600',
    },
    {
      title: '总参与人数',
      value: '479',
      icon: Target,
      bgColor: 'bg-green-100',
      iconColor: 'text-green-600',
    },
    {
      title: '平均转化率',
      value: '28.7%',
      icon: Activity,
      bgColor: 'bg-purple-100',
      iconColor: 'text-purple-600',
    },
  ];

  // 近期活动
  const recentActivities = [
    {
      id: 1,
      title: '春季焕肤套餐',
      status: '进行中',
      participants: 156,
      conversion: '23%',
      statusColor: 'bg-green-100 text-green-700'
    },
    {
      id: 2,
      title: '会员生日专享',
      status: '进行中',
      participants: 89,
      conversion: '45%',
      statusColor: 'bg-green-100 text-green-700'
    },
    {
      id: 3,
      title: '好友推荐计划',
      status: '进行中',
      participants: 234,
      conversion: '18%',
      statusColor: 'bg-green-100 text-green-700'
    },
  ];

  // 订单统计
  const orderStats = [
    { label: '今日订单', value: '45', icon: ShoppingBag },
    { label: '待处理', value: '8', icon: Package },
    { label: '今日预约', value: '32', icon: Calendar },
  ];

  // 热门商品
  const topProducts = [
    { name: '玻尿酸精华液', sales: 89, revenue: '¥12,450' },
    { name: '美白面膜套装', sales: 67, revenue: '¥9,850' },
    { name: '补水修护套餐', sales: 52, revenue: '¥8,320' },
    { name: '深层清洁护理', sales: 45, revenue: '¥6,750' },
  ];

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">仪表盘</h1>
        <p className="text-sm text-gray-500 mt-1">欢迎回来，查看您的业务概况</p>
      </div>

      {/* 核心统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => (
          <div
            key={index}
            onClick={() => navigate(stat.path)}
            className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow cursor-pointer"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`w-12 h-12 ${stat.bgColor} rounded-lg flex items-center justify-center`}>
                <stat.icon className={`w-6 h-6 ${stat.iconColor}`} />
              </div>
              <div className={`flex items-center gap-1 text-sm font-medium ${
                stat.isIncrease ? 'text-green-600' : 'text-red-600'
              }`}>
                {stat.isIncrease ? (
                  <ArrowUpRight className="w-4 h-4" />
                ) : (
                  <ArrowDownRight className="w-4 h-4" />
                )}
                {stat.change}
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900 mb-1">{stat.value}</div>
            <div className="text-sm text-gray-500">{stat.title}</div>
          </div>
        ))}
      </div>

      {/* 营销活动和订单统计 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 营销活动统计 */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">营销活动概况</h2>
            <button
              onClick={() => navigate('/customer-marketing/activity-management')}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              查看全部 →
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6">
            {marketingStats.map((item, index) => (
              <div key={index} className="text-center">
                <div className={`w-12 h-12 ${item.bgColor} rounded-lg flex items-center justify-center mx-auto mb-3`}>
                  <item.icon className={`w-6 h-6 ${item.iconColor}`} />
                </div>
                <div className="text-2xl font-bold text-gray-900 mb-1">{item.value}</div>
                <div className="text-sm text-gray-500">{item.title}</div>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-700 mb-3">近期活动</h3>
            {recentActivities.map((activity) => (
              <div
                key={activity.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900">{activity.title}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${activity.statusColor}`}>
                      {activity.status}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500">参与人数: {activity.participants}人</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold text-green-600">{activity.conversion}</div>
                  <div className="text-xs text-gray-500">转化率</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 订单统计 */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">订单统计</h2>
          </div>

          <div className="space-y-4">
            {orderStats.map((item, index) => (
              <div key={index} className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
                    <item.icon className="w-5 h-5 text-blue-600" />
                  </div>
                  <span className="text-sm font-medium text-gray-700">{item.label}</span>
                </div>
                <span className="text-2xl font-bold text-gray-900">{item.value}</span>
              </div>
            ))}
          </div>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <button
              onClick={() => navigate('/orders/products')}
              className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              查看订单详情
            </button>
          </div>
        </div>
      </div>

      {/* 热门商品 */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">热门商品</h2>
          <button
            onClick={() => navigate('/goods/products')}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            查看全部 →
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {topProducts.map((product, index) => (
            <div
              key={index}
              className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-semibold">
                  {index + 1}
                </div>
                <Package className="w-5 h-5 text-gray-400" />
              </div>
              <h3 className="font-medium text-gray-900 mb-2 line-clamp-2">{product.name}</h3>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">销量: {product.sales}</span>
                <span className="font-semibold text-blue-600">{product.revenue}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 快捷操作 */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg p-6 text-white">
        <h2 className="text-lg font-semibold mb-4">快捷操作</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button
            onClick={() => navigate('/customers/data')}
            className="bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-lg p-4 transition-colors text-left"
          >
            <Users className="w-6 h-6 mb-2" />
            <div className="font-medium">客户管理</div>
          </button>
          <button
            onClick={() => navigate('/customer-marketing/strategy-templates')}
            className="bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-lg p-4 transition-colors text-left"
          >
            <Megaphone className="w-6 h-6 mb-2" />
            <div className="font-medium">创建营销活动</div>
          </button>
          <button
            onClick={() => navigate('/stores/reservations')}
            className="bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-lg p-4 transition-colors text-left"
          >
            <Calendar className="w-6 h-6 mb-2" />
            <div className="font-medium">项目预约</div>
          </button>
          <button
            onClick={() => navigate('/inventory/stock')}
            className="bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-lg p-4 transition-colors text-left"
          >
            <Package className="w-6 h-6 mb-2" />
            <div className="font-medium">库存管理</div>
          </button>
        </div>
      </div>
    </div>
  );
}