import React, { useState } from 'react';
import { Send, X, Sparkles, Users } from 'lucide-react';
import { Button, Input } from '../components/UI';

type ScriptType = 'project' | 'promotion' | 'custom' | null;

interface GeneratedCustomer {
  id: number;
  name: string;
  level: string;
  skinType: string;
  preference: string;
  script: string;
  reason: string;
}

interface Message {
  role: 'ai' | 'user';
  content: string;
  customers?: GeneratedCustomer[]; // 新增：用于存储客户列表
}

export function CustomerInvitationScript() {
  const [selectedType, setSelectedType] = useState<ScriptType>(null);
  const [showFormPanel, setShowFormPanel] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', content: '嗨，你好呀！我能为你打造专属美业的精准营销文案。' },
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const [userInput, setUserInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // 项目推广表单
  const [projectForm, setProjectForm] = useState({
    projectName: '',
    targetAudience: '',
    originalPrice: '',
    discountPrice: '',
    discount: '',
    promotionTime: '',
  });

  // 促销活动表单
  const [promotionForm, setPromotionForm] = useState({
    activityName: '',
    activityType: '',
    targetAudience: '',
    discountInfo: '',
    activityTime: '',
    participationRules: '',
  });

  // 定制邀约表单
  const [customForm, setCustomForm] = useState({
    customerName: '',
    projectService: '',
    invitationReason: '',
    preferredTime: '',
    specialOffer: '',
  });

  const handleTypeChange = (type: ScriptType) => {
    setSelectedType(type);
    setShowFormPanel(true);
  };

  const handleSubmit = () => {
    let prompt = '';
    
    if (selectedType === 'project') {
      prompt = `请为${projectForm.projectName}生成一条项目推广文案，适用人群：${projectForm.targetAudience}，原价格：${projectForm.originalPrice}，优惠价格：${projectForm.discountPrice}`;
    } else if (selectedType === 'promotion') {
      prompt = `请生成一条促销活动文案，活动名称：${promotionForm.activityName}，活动类型：${promotionForm.activityType}，优惠信息：${promotionForm.discountInfo}`;
    } else if (selectedType === 'custom') {
      prompt = `请为${customForm.customerName}生成定制邀约文案，项目/服务：${customForm.projectService}，邀约理由：${customForm.invitationReason}`;
    }

    // 添加用户消息
    setMessages(prev => [...prev, { role: 'user', content: prompt }]);
    setIsTyping(true);

    // 模拟AI回复
    setTimeout(() => {
      let aiResponse = '';
      
      if (selectedType === 'project') {
        aiResponse = `🌸 【${projectForm.projectName || '美容项目'}】限时特惠来袭！\n\n亲爱的${projectForm.targetAudience || '顾客'}朋友们，\n\n我们精心为您准备了${projectForm.projectName || '专业护理项目'}！\n\n💎 原价：¥${projectForm.originalPrice || 'XXX'}\n✨ 现价：¥${projectForm.discountPrice || 'XXX'}\n🎉 优惠${projectForm.discount || 'XX'}%！\n\n📅 活动时间：${projectForm.promotionTime || '限时优惠'}\n\n快来预约体验吧！名额有限，先到先得！💖`;
      } else if (selectedType === 'promotion') {
        aiResponse = `🎊 【${promotionForm.activityName || '限时活动'}】震撼来袭！\n\n✨ 活动类型：${promotionForm.activityType || '特惠活动'}\n👥 适用人群：${promotionForm.targetAudience || '所有会员'}\n💰 优惠内容：${promotionForm.discountInfo || '超值优惠'}\n⏰ 活动时间：${promotionForm.activityTime || '即日起'}\n📋 参与规则：${promotionForm.participationRules || '详询门店'}\n\n机会难得，赶快行动吧！🌟`;
      } else if (selectedType === 'custom') {
        aiResponse = `💌 亲爱的${customForm.customerName || '顾客'}：\n\n您好！特别为您推荐${customForm.projectService || '优质服务'}。\n\n💎 推荐理由：${customForm.invitationReason || '专为您定制'}\n⏰ 建议时间：${customForm.preferredTime || '随时欢迎'}\n🎁 专属优惠：${customForm.specialOffer || '会员专享'}\n\n期待与您的再次相遇！✨`;
      }
      
      setMessages(prev => [...prev, { role: 'ai', content: aiResponse }]);
      setIsTyping(false);
    }, 1500);
  };

  // 一键生成最值得邀约的10位客户的话术
  const handleOneClickGenerate = () => {
    setIsGenerating(true);

    // 模拟AI分析和生成过程
    setTimeout(() => {
      const mockCustomers: GeneratedCustomer[] = [
        {
          id: 1,
          name: '王雅婷',
          level: 'VIP',
          skinType: '干性肌肤',
          preference: '补水保湿项目',
          reason: '近30天未到店，历史消费金额高，偏好补水类项目',
          script: '💎 亲爱的王雅婷女士：\n\n好久不见！特别为您推荐我们的【巨补水】项目，专为干性肌肤打造。\n\n🌸 您专属优惠：VIP会员8折，原价680元，现价仅需544元\n⏰ 建议时间：本周三下午2点（您常选的时段）\n🎁 额外赠送：价值180元的补水面膜一盒\n\n期待与您的再次相遇！✨'
        },
        {
          id: 2,
          name: '李晓慧',
          level: '白金会员',
          skinType: '混合性肌肤',
          preference: '养生护理',
          reason: '生日即将到来，高价值客户，喜欢养生类项目',
          script: '🎂 亲爱的李晓慧女士：\n\n生日快乐！我们为您准备了特别的生日礼物 - 【古方灸】养生套餐。\n\n💝 生日专享：全场项目7.5折+积分双倍\n✨ 推荐理由：根据您的体质，古方灸能帮助调理气血\n📅 有效期至：本月底\n\n让我们一起庆祝这个特别的日子！💖'
        },
        {
          id: 3,
          name: '张美琳',
          level: '钻石会员',
          skinType: '敏感肌肤',
          preference: '温和护理',
          reason: '高频次到店客户，上次体验满意度高',
          script: '🌟 亲爱的张美琳女士：\n\n感谢您一直以来的支持！为您推荐升级版【欧蜜丽养盘】项目。\n\n💎 钻石会员特权：首次体验6.8折\n🎯 适合您的原因：温和配方，特别适合敏感肌\n⏰ 预留专属时段：每周五上午10点\n\n您的美丽，我们用心守护！✨'
        },
        {
          id: 4,
          name: '陈婷婷',
          level: 'VIP',
          skinType: '油性肌肤',
          preference: '深层清洁',
          reason: '消费潜力大，最近咨询过清洁类项目',
          script: '✨ 亲爱的陈婷婷女士：\n\n您咨的深层清洁项目新品上市啦！特别推荐【净颜焕肤】套餐。\n\n🌿 专为油性肌肤设计，深层清洁+控油平衡\n💰 新品特惠：原价880元，现价仅需688元\n🎁 前10名预约赠送：控油精华一瓶\n\n让肌肤重现清透光彩！💫'
        },
        {
          id: 5,
          name: '刘欣怡',
          level: '白金会员',
          skinType: '干性肌肤',
          preference: '抗衰老护理',
          reason: '年龄段匹配，消费能力强，关注抗衰',
          script: '💎 亲爱的刘欣怡女士：\n\n为您量身定制【逆龄紧致】护理方案，对抗岁月痕迹。\n\n✨ 项目亮点：胶原蛋白导入+RF射频提拉\n💝 白金会员专享：买3次送1次，赠送价值300元眼部护理\n📅 黄金护理期：建议每周一次，持续4周见效\n\n让时光为您驻足！🌹'
        },
        {
          id: 6,
          name: '赵雨涵',
          level: 'VIP',
          skinType: '中性肌肤',
          preference: '放松SPA',
          reason: '工作压力大，喜欢放松类项目，复购率高',
          script: '🌸 亲爱的赵雨涵女士：\n\n为您准备了舒压放松【泡澡+全身SPA】套餐，释放压力。\n\n🛁 套餐包含：香薰泡澡45分钟+精油按摩60分钟\n💆 特别赠送：肩颈理疗+养生茶\n⏰ 建议时间：周下午，给自己一个放松的理由\n\n工作再忙，也要好好爱自己！💖'
        },
        {
          id: 7,
          name: '孙雅静',
          level: '钻石会员',
          skinType: '混合性肌肤',
          preference: '美白淡斑',
          reason: '夏季即将来临，历史数据显示偏好美白项目',
          script: '☀️ 亲爱的孙雅静女士：\n\n夏日将至，提前为您准备【美白透亮】护理方案。\n\n🌟 项目特点：VC导入+光子嫩肤，美白淡斑双效合一\n💎 钻石特权：疗程套餐8折，5次仅需3200元\n🎁 早鸟福利：本周预约赠送防晒隔离霜\n\n白皙透亮，从现在开始！✨'
        },
        {
          id: 8,
          name: '周梦瑶',
          level: 'VIP',
          skinType: '干性肌肤',
          preference: '补水+按摩',
          reason: '新晋VIP，需要培养忠诚度，消费频次待提升',
          script: '💝 亲爱的周梦瑶女士：\n\n恭喜您成为VIP会员！特别为您推荐【水润焕颜】升级套餐。\n\n✨ VIP专属礼遇：首次体验立减200元\n🌊 项目包含：巨补水+面部淋巴引流按摩\n📱 会员福利：推荐好友享双人优惠\n\n感谢信任，让我们一起变美！🌸'
        },
        {
          id: 9,
          name: '吴诗涵',
          level: '白金会员',
          skinType: '敏感肌肤',
          preference: '舒缓修复',
          reason: '换季期间，敏感肌��户需要特殊护理',
          script: '🌿 亲爱的吴诗涵女士：\n\n换季时节，为您的敏感肌准备了【舒缓修复】专护方案。\n\n💚 温和配方：植物精萃+益生菌修复\n🎯 针对问题：泛红、干燥、屏障受损\n💝 白金会员价：原价780元，会员价624元\n\n守护您的脆弱肌肤，重建健康屏障！✨'
        },
        {
          id: 10,
          name: '郑雅欣',
          level: '钻石会员',
          skinType: '油性肌肤',
          preference: '深层护理',
          reason: '高价值客户，长期未体验新项目，需要激活',
          script: '👑 亲爱的郑雅欣女士：\n\n钻石会员专属邀请！全新【深层净化+光彩焕肤】旗舰套餐。\n\n✨ 黑科技加持：小气泡清洁+水光精华导入\n💎 尊享权益：钻石会员终身价，买5送2\n🎁 限时赠送：价值500元的家居护肤套装\n\n期待为您带来全新的护肤体验！🌟'
        }
      ];

      const summaryMessage: Message = {
        role: 'ai',
        content: `✨ 已为您智能生成10位最值得邀约的客户话术！\n\n基于用户画像分析，这些客户具有以下特点：\n\n📊 筛选维度：\n• 消费能力：VIP及以上等级\n• 活跃度：近期未到店或高频客户\n• 个性化：匹配肌肤类型和偏好项目\n• 时机：生��、换季、新品上市等\n\n💡 建议：请查看下方详细话术列表，可直接复制发送给客户。`,
        customers: mockCustomers
      };
      
      setMessages(prev => [...prev, summaryMessage]);
      setIsGenerating(false);
    }, 2000);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex-1 flex flex-col bg-gray-50/50 border border-gray-100 rounded-t-lg shadow-sm overflow-hidden relative">
        {/* Chat Header */}
        <div className="p-4 bg-white font-medium text-gray-800 border-b border-gray-100 shrink-0 shadow-sm z-10">
          客户邀约助手
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 flex flex-col">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex items-start gap-4 ${
                message.role === 'user' ? 'justify-end' : ''
              }`}
            >
              {message.role === 'ai' && (
                <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white shrink-0 shadow-sm text-sm font-medium">
                  AI
                </div>
              )}
              <div className={`${message.role === 'ai' ? 'max-w-[85%]' : 'max-w-[80%]'}`}>
                <div
                  className={`px-5 py-3 rounded-2xl shadow-sm text-[15px] leading-relaxed whitespace-pre-line ${
                    message.role === 'ai'
                      ? 'bg-white text-gray-700 rounded-tl-none border border-gray-100'
                      : 'bg-blue-500 text-white rounded-tr-none'
                  }`}
                >
                  {message.content}
                </div>
                
                {/* Customer List Display */}
                {message.customers && message.customers.length > 0 && (
                  <div className="mt-3 border border-gray-200 rounded-lg bg-white overflow-hidden">
                    <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-3 border-b border-gray-200">
                      <div className="flex items-center gap-2">
                        <Users className="w-5 h-5 text-purple-600" />
                        <h3 className="font-semibold text-gray-800 text-sm">最值得邀约的客户列表</h3>
                        <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                          {message.customers.length}人
                        </span>
                      </div>
                    </div>
                    
                    <div className="max-h-[500px] overflow-y-auto divide-y divide-gray-200">
                      {message.customers.map((customer, customerIndex) => (
                        <div key={customer.id} className="p-4 hover:bg-gray-50 transition-colors">
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center text-white font-semibold text-sm shrink-0">
                              {customerIndex + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="font-semibold text-gray-900">{customer.name}</span>
                                <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs font-medium">
                                  {customer.level}
                                </span>
                                <span className="text-xs text-gray-500">
                                  {customer.skinType} · {customer.preference}
                                </span>
                              </div>
                              <p className="text-xs text-gray-600 mb-2">
                                💡 推荐理由：{customer.reason}
                              </p>
                              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-medium text-gray-700">邀约话术</span>
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(customer.script);
                                      alert('话术已复制到剪贴板！');
                                    }}
                                    className="text-xs text-blue-600 hover:text-blue-700 font-medium hover:underline"
                                  >
                                    复制话术
                                  </button>
                                </div>
                                <p className="text-xs text-gray-700 whitespace-pre-line leading-relaxed">
                                  {customer.script}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {message.role === 'user' && (
                <div className="w-10 h-10 rounded-full bg-blue-400 flex items-center justify-center text-white shrink-0 shadow-sm text-sm font-medium">
                  我
                </div>
              )}
            </div>
          ))}

          {/* AI Typing Indicator */}
          {isTyping && (
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white shrink-0 shadow-sm text-sm font-medium">
                AI
              </div>
              <div className="bg-white px-5 py-3 rounded-2xl rounded-tl-none shadow-sm text-gray-700 text-lg border border-gray-100 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Form Panel (Bottom) */}
      {showFormPanel ? (
        <div className="bg-white border border-gray-200 border-t-0 rounded-b-lg p-6 shadow-sm shrink-0 relative">
          {/* Close Button */}
          <button
            onClick={() => setShowFormPanel(false)}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Quick Type Selector */}
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={() => handleTypeChange('project')}
              className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedType === 'project'
                  ? 'bg-blue-500 text-white shadow-md'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              项目推广
            </button>
            <button
              onClick={() => handleTypeChange('promotion')}
              className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedType === 'promotion'
                  ? 'bg-blue-500 text-white shadow-md'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              促销活动
            </button>
            <button
              onClick={() => handleTypeChange('custom')}
              className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedType === 'custom'
                  ? 'bg-blue-500 text-white shadow-md'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              定制邀约
            </button>
          </div>

          {/* 项目推广表单 */}
          {selectedType === 'project' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-800">项目推广</h3>
              </div>

              <div className="grid grid-cols-2 gap-x-12 gap-y-6">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-700">项目名称</label>
                  <select
                    value={projectForm.projectName}
                    onChange={(e) => setProjectForm(prev => ({ ...prev, projectName: e.target.value }))}
                    className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">请选择项目名称</option>
                    <option value="巨补水">巨补水</option>
                    <option value="古方灸">古方灸</option>
                    <option value="欧蜜丽养盘">欧蜜丽养盘</option>
                    <option value="泡澡">泡澡</option>
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-700">适用人群</label>
                  <Input
                    placeholder="请输入适用人群"
                    className="h-10 border-gray-300"
                    value={projectForm.targetAudience}
                    onChange={(e) => setProjectForm(prev => ({ ...prev, targetAudience: e.target.value }))}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-700">原价格</label>
                  <div className="flex">
                    <span className="flex items-center justify-center px-4 border border-r-0 border-gray-300 bg-gray-50 text-gray-500 rounded-l-md select-none">¥</span>
                    <Input
                      type="number"
                      placeholder="0.00"
                      className="rounded-none h-10 border-gray-300 text-right pr-4 focus:ring-0 focus:border-blue-500 z-10"
                      value={projectForm.originalPrice}
                      onChange={(e) => setProjectForm(prev => ({ ...prev, originalPrice: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-700">优惠价格</label>
                  <div className="flex">
                    <span className="flex items-center justify-center px-4 border border-r-0 border-gray-300 bg-gray-50 text-gray-500 rounded-l-md select-none">¥</span>
                    <Input
                      type="number"
                      placeholder="0.00"
                      className="rounded-none h-10 border-gray-300 text-right pr-4 focus:ring-0 focus:border-blue-500 z-10"
                      value={projectForm.discountPrice}
                      onChange={(e) => setProjectForm(prev => ({ ...prev, discountPrice: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-700">优惠折扣</label>
                  <Input
                    placeholder="请输入优惠折扣"
                    className="h-10 border-gray-300"
                    value={projectForm.discount}
                    onChange={(e) => setProjectForm(prev => ({ ...prev, discount: e.target.value }))}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-700">推广时间</label>
                  <Input
                    type="date"
                    className="h-10 border-gray-300"
                    value={projectForm.promotionTime}
                    onChange={(e) => setProjectForm(prev => ({ ...prev, promotionTime: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 促销活动表单 */}
          {selectedType === 'promotion' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-800">促销活动</h3>
              </div>

              <div className="grid grid-cols-2 gap-x-12 gap-y-6">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-700">活动名称</label>
                  <Input
                    placeholder="请输入活动名称"
                    className="h-10 border-gray-300"
                    value={promotionForm.activityName}
                    onChange={(e) => setPromotionForm(prev => ({ ...prev, activityName: e.target.value }))}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-700">活动类型</label>
                  <select
                    value={promotionForm.activityType}
                    onChange={(e) => setPromotionForm(prev => ({ ...prev, activityType: e.target.value }))}
                    className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">请选择活动类型</option>
                    <option value="限时折扣">限时折扣</option>
                    <option value="满减优惠">满减优惠</option>
                    <option value="买赠活动">买赠活动</option>
                    <option value="会员专享">会员专享</option>
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-700">适用人群</label>
                  <Input
                    placeholder="请输入适用人群"
                    className="h-10 border-gray-300"
                    value={promotionForm.targetAudience}
                    onChange={(e) => setPromotionForm(prev => ({ ...prev, targetAudience: e.target.value }))}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-700">优惠信息</label>
                  <Input
                    placeholder="请输入优惠信息"
                    className="h-10 border-gray-300"
                    value={promotionForm.discountInfo}
                    onChange={(e) => setPromotionForm(prev => ({ ...prev, discountInfo: e.target.value }))}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-700">活动时间</label>
                  <Input
                    type="date"
                    className="h-10 border-gray-300"
                    value={promotionForm.activityTime}
                    onChange={(e) => setPromotionForm(prev => ({ ...prev, activityTime: e.target.value }))}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-700">参与规则</label>
                  <Input
                    placeholder="请输入参与规则"
                    className="h-10 border-gray-300"
                    value={promotionForm.participationRules}
                    onChange={(e) => setPromotionForm(prev => ({ ...prev, participationRules: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 定制邀约表单 */}
          {selectedType === 'custom' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-800">定制邀约</h3>
              </div>

              <div className="grid grid-cols-2 gap-x-12 gap-y-6">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-700">客户姓名</label>
                  <Input
                    placeholder="请输入客户姓名"
                    className="h-10 border-gray-300"
                    value={customForm.customerName}
                    onChange={(e) => setCustomForm(prev => ({ ...prev, customerName: e.target.value }))}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-700">项目/服务</label>
                  <Input
                    placeholder="请输入项目或服务"
                    className="h-10 border-gray-300"
                    value={customForm.projectService}
                    onChange={(e) => setCustomForm(prev => ({ ...prev, projectService: e.target.value }))}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-700">邀约理由</label>
                  <Input
                    placeholder="请输入邀约理由"
                    className="h-10 border-gray-300"
                    value={customForm.invitationReason}
                    onChange={(e) => setCustomForm(prev => ({ ...prev, invitationReason: e.target.value }))}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-700">建议时间</label>
                  <Input
                    type="datetime-local"
                    className="h-10 border-gray-300"
                    value={customForm.preferredTime}
                    onChange={(e) => setCustomForm(prev => ({ ...prev, preferredTime: e.target.value }))}
                  />
                </div>

                <div className="flex flex-col gap-2 col-span-2">
                  <label className="text-sm font-medium text-gray-700">专属优惠</label>
                  <Input
                    placeholder="请输入专属优惠内容"
                    className="h-10 border-gray-300"
                    value={customForm.specialOffer}
                    onChange={(e) => setCustomForm(prev => ({ ...prev, specialOffer: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <div className="flex items-center justify-end gap-3 mt-6 pt-6 border-t border-gray-200">
            <Button onClick={handleSubmit} className="gap-2 bg-blue-600 hover:bg-blue-700">
              <Send className="w-4 h-4" /> 生成文案
            </Button>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 border-t-0 rounded-b-lg p-6 shadow-sm shrink-0">
          {/* Quick Action Buttons */}
          <div className="flex items-center justify-center gap-3 mb-4">
            <button
              onClick={handleOneClickGenerate}
              disabled={isGenerating}
              className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg text-sm font-medium hover:from-purple-600 hover:to-pink-600 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isGenerating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  一键生成
                </>
              )}
            </button>
            <button
              onClick={() => handleTypeChange('project')}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-all shadow-sm"
            >
              项目推广
            </button>
            <button
              onClick={() => handleTypeChange('promotion')}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-all shadow-sm"
            >
              促销活动
            </button>
            <button
              onClick={() => handleTypeChange('custom')}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-all shadow-sm"
            >
              定制邀约
            </button>
          </div>

          {/* Input Area */}
          <div className="flex items-center gap-3">
            <Input
              placeholder="输入您的需求..."
              className="flex-1 h-11 border-gray-300"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && userInput.trim()) {
                  setMessages(prev => [...prev, { role: 'user', content: userInput }]);
                  setUserInput('');
                }
              }}
            />
            <Button 
              onClick={() => {
                if (userInput.trim()) {
                  setMessages(prev => [...prev, { role: 'user', content: userInput }]);
                  setUserInput('');
                }
              }}
              className="h-11 px-6 gap-2 bg-blue-600 hover:bg-blue-700"
            >
              <Send className="w-4 h-4" />
              发送
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}