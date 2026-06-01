import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Search, Plus, RotateCcw, X, Minus, Loader2 } from 'lucide-react';
import { Input, Button, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/UI';
import { getCards, getCardOrdersPaginated } from '@/api/card';
import { usePagination } from '@/hooks/usePagination';
import type { Card } from '@/types/card';

interface CardOrder {
  id: string;
  cardName: string;
  userName: string;
  actualPrice: number;
  status: 'active' | 'expired' | 'voided';
  purchaseTime: string;
  expireTime: string;
}

interface ProjectItem {
  id: number;
  name: string;
  totalCount: number;
  usedCount: number;
  remainCount: number;
  remark: string;
}

function toProjectItems(card?: Card): ProjectItem[] {
  return (card?.projects ?? []).map((project, index) => {
    const totalCount = Number(project.timesPerCard ?? 0);
    return {
      id: index + 1,
      name: project.projectName,
      totalCount,
      usedCount: 0,
      remainCount: totalCount,
      remark: '',
    };
  });
}

function formatDatetimeLocal(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getExpireTime(startTime: string, validDays?: number): string {
  if (!startTime || !validDays) return '';
  const date = new Date(startTime);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + validDays);
  return formatDatetimeLocal(date);
}

export function CardOrderManagement() {
  const [searchUserName, setSearchUserName] = useState('');
  const [searchCardName, setSearchCardName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const filters = useMemo(() => ({
    userName: searchUserName || undefined,
    cardName: searchCardName || undefined,
  }), [searchUserName, searchCardName]);
  const { data: orders, total, page, pageSize, loading, setPage, setPageSize } = usePagination<CardOrder>(getCardOrdersPaginated, filters);
  const [cards, setCards] = useState<Card[]>([]);
  const [cardsLoading, setCardsLoading] = useState(false);

  // Dialog form state
  const [formData, setFormData] = useState({
    cardId: '',
    cardPrice: 0,
    discount: 100,
    discountPrice: 0,
    userName: '',
    storeName: '',
    startTime: '',
    expireTime: '',
    paymentMethod: 'full' as 'full' | 'installment',
  });
  const [projectItems, setProjectItems] = useState<ProjectItem[]>([]);
  const [additionalItems, setAdditionalItems] = useState<ProjectItem[]>([]);
  const [nextAdditionalId, setNextAdditionalId] = useState(1);

  // 赠送项目-添加预设项目下拉
  const [showPresetPicker, setShowPresetPicker] = useState(false);
  const [presetPickerPos, setPresetPickerPos] = useState({ top: 0, left: 0 });
  const presetBtnRef = useRef<HTMLDivElement>(null);
  const selectedCard = useMemo(
    () => cards.find(card => String(card.id) === formData.cardId),
    [cards, formData.cardId],
  );
  const selectedCardProjectItems = useMemo(() => toProjectItems(selectedCard), [selectedCard]);

  useEffect(() => {
    let mounted = true;
    setCardsLoading(true);
    getCards()
      .then((items) => {
        if (!mounted) return;
        const enabledCards = items.filter(card => card.status !== '下架');
        setCards(enabledCards);
      })
      .catch(() => {
        if (mounted) setCards([]);
      })
      .finally(() => {
        if (mounted) setCardsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  // 次卡消费弹窗 state
  const [isConsumeDialogOpen, setIsConsumeDialogOpen] = useState(false);
  const [, setConsumeOrderId] = useState<string | null>(null);
  const [consumeProject, setConsumeProject] = useState('');
  const [consumeCount, setConsumeCount] = useState(1);

  // Mock project data for consumption
  const MOCK_CONSUME_PROJECTS = [
    { name: '膏方灸', totalCount: 20, usedCount: 17, remainCount: 3 },
    { name: '面部护理', totalCount: 30, usedCount: 12, remainCount: 18 },
    { name: '身体护理', totalCount: 15, usedCount: 10, remainCount: 5 },
  ];

  const selectedConsumeProject = MOCK_CONSUME_PROJECTS.find(p => p.name === consumeProject);

  const handleOpenConsumeDialog = (orderId: string) => {
    setConsumeOrderId(orderId);
    setConsumeProject(MOCK_CONSUME_PROJECTS[0].name);
    setConsumeCount(1);
    setIsConsumeDialogOpen(true);
  };

  const handleCloseConsumeDialog = () => {
    setIsConsumeDialogOpen(false);
    setConsumeOrderId(null);
  };

  const handleConsumeSubmit = () => {
    setIsConsumeDialogOpen(false);
  };

  const getStatusConfig = (status: CardOrder['status']) => {
    const configs = {
      active: { text: '已激活', color: 'bg-green-100 text-green-700 border-green-300' },
      expired: { text: '已过期', color: 'bg-gray-100 text-gray-600 border-gray-300' },
      voided: { text: '已作废', color: 'bg-red-100 text-red-700 border-red-300' },
    };
    return configs[status];
  };

  const handleVoid = (orderId: string) => {
    void orderId;
  };

  const handleReset = () => {
    setSearchUserName('');
    setSearchCardName('');
    setStartDate('');
    setEndDate('');
  };

  const handleOpenDialog = () => {
    const startTime = formatDatetimeLocal(new Date());
    setFormData({
      cardId: '',
      cardPrice: 0,
      discount: 100,
      discountPrice: 0,
      userName: '',
      storeName: '',
      startTime,
      expireTime: '',
      paymentMethod: 'full',
    });
    setProjectItems([]);
    setAdditionalItems([]);
    setNextAdditionalId(1);
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setShowPresetPicker(false);
  };

  const handleSubmit = () => {
    setIsDialogOpen(false);
  };

  const handleCardChange = (cardId: string) => {
    const card = cards.find(item => String(item.id) === cardId);
    const price = card?.price ?? 0;
    const discountPrice = Number((price * formData.discount / 100).toFixed(2));
    const expireTime = card ? getExpireTime(formData.startTime, card.validDays) : '';
    setFormData(prev => ({
      ...prev,
      cardId,
      cardPrice: price,
      discountPrice,
      expireTime,
      storeName: card?.storeName && card.storeName !== '全部门店' ? card.storeName : prev.storeName,
    }));
    setProjectItems(toProjectItems(card));
    setAdditionalItems([]);
    setNextAdditionalId(1);
    setShowPresetPicker(false);
  };

  const handleAddAdditional = () => {
    setAdditionalItems(prev => [...prev, { id: nextAdditionalId, name: '', totalCount: 0, usedCount: 0, remainCount: 0, remark: '' }]);
    setNextAdditionalId(prev => prev + 1);
  };

  const handleRemoveAdditional = (id: number) => {
    setAdditionalItems(prev => prev.filter(item => item.id !== id));
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Search Section */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 whitespace-nowrap">用户名称</label>
          <Input
            placeholder="请输入用户名称"
            className="w-48"
            value={searchUserName}
            onChange={(e) => setSearchUserName(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 whitespace-nowrap">次卡名称</label>
          <Input
            placeholder="请输入次卡名称"
            className="w-48"
            value={searchCardName}
            onChange={(e) => setSearchCardName(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 whitespace-nowrap">购买日期</label>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              className="w-40"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              placeholder="开始日期"
            />
            <span className="text-gray-400">至</span>
            <Input
              type="date"
              className="w-40"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              placeholder="结束日期"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button className="gap-2">
          <Search className="w-4 h-4" /> 搜索
        </Button>
        <Button variant="outline" className="gap-2" onClick={handleReset}>
          <RotateCcw className="w-4 h-4" /> 重置
        </Button>
        <Button className="gap-2 bg-[#1890ff] hover:bg-[#40a9ff]" onClick={handleOpenDialog}>
          <Plus className="w-4 h-4" /> 新增
        </Button>
      </div>

      {/* Table */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          <span className="ml-2 text-gray-500">加载中...</span>
        </div>
      )}
      {!loading && (
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50/80">
            <TableHead>订单编号</TableHead>
            <TableHead>次卡</TableHead>
            <TableHead>用户</TableHead>
            <TableHead>实际售价(元)</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>购买时间</TableHead>
            <TableHead>过期时间</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => {
            const statusConfig = getStatusConfig(order.status);
            return (
              <TableRow key={order.id} className="hover:bg-blue-50/30">
                <TableCell>{order.id}</TableCell>
                <TableCell className="font-medium text-gray-700">{order.cardName}</TableCell>
                <TableCell>{order.userName}</TableCell>
                <TableCell>{order.actualPrice.toFixed(2)}</TableCell>
                <TableCell>
                  <span className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-md border ${statusConfig.color}`}>
                    {statusConfig.text}
                  </span>
                </TableCell>
                <TableCell>{order.purchaseTime}</TableCell>
                <TableCell>{order.expireTime}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-3 text-sm">
                    <button className="text-blue-500 hover:text-blue-600">查看</button>
                    <button className="text-blue-500 hover:text-blue-600">编辑</button>
                    <button className="text-blue-500 hover:text-blue-600" onClick={() => handleOpenConsumeDialog(order.id)}>次卡核销</button>
                    {order.status !== 'voided' && (
                      <button className="text-red-500 hover:text-red-600" onClick={() => handleVoid(order.id)}>作废</button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
        <div className="text-sm text-gray-600">共 {total} 条</div>
        <div className="flex items-center gap-2">
          <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="h-8 px-2 text-sm border border-gray-300 rounded">
            <option value={10}>10条/页</option>
            <option value={20}>20条/页</option>
            <option value={50}>50条/页</option>
          </select>
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button>
          <span className="text-sm text-gray-600">{page} / {Math.ceil(total / pageSize) || 1}</span>
          <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage(page + 1)}>下一页</Button>
        </div>
      </div>

      {/* New Card Order Dialog */}
      {isDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-[900px] max-h-[90vh] overflow-y-auto">
            {/* Dialog Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-lg font-medium">新增次卡订单</h2>
              <button
                onClick={handleCloseDialog}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Dialog Body */}
            <div className="p-6 space-y-6">
              {/* Row 1: Card & Price */}
              <div className="grid grid-cols-2 gap-6">
                <div className="flex items-center gap-2">
                  <span className="text-red-500">*</span>
                  <label className="text-sm text-gray-700 whitespace-nowrap min-w-[70px]">次卡</label>
                  <select
                    className="flex-1 h-9 px-3 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.cardId}
                    onChange={(e) => handleCardChange(e.target.value)}
                    disabled={cardsLoading}
                  >
                    <option value="">{cardsLoading ? '次卡加载中...' : '请选择卡片'}</option>
                    {cards.map(card => (
                      <option key={card.id} value={String(card.id)}>
                        {card.name}{card.storeName ? `（${card.storeName}）` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-700 whitespace-nowrap min-w-[70px]">次卡价格</label>
                  <span className="text-sm text-gray-800">¥ {formData.cardPrice.toFixed(2)}</span>
                  {!formData.cardId && <span className="text-xs text-gray-400">（请先选择次卡）</span>}
                </div>
              </div>

              {/* Row 1.5: Discount & Discount Price */}
              <div className="grid grid-cols-2 gap-6">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-700 whitespace-nowrap min-w-[70px]">优惠折扣</label>
                  <div className="flex items-center gap-2 flex-1">
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      max="100"
                      className="w-24 h-9 text-center"
                      value={formData.discount}
                      onChange={(e) => {
                        const disc = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
                        const price = parseFloat((formData.cardPrice * disc / 100).toFixed(2));
                        setFormData({ ...formData, discount: disc, discountPrice: price });
                      }}
                    />
                    <span className="text-sm text-gray-500">%</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-700 whitespace-nowrap min-w-[70px]">优惠价格</label>
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-sm text-gray-500">¥</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      className="w-32 h-9 text-center"
                      value={formData.discountPrice.toFixed(2)}
                      onChange={(e) => {
                        const price = Math.max(0, parseFloat(e.target.value) || 0);
                        const disc = formData.cardPrice > 0 ? parseFloat((price / formData.cardPrice * 100).toFixed(2)) : 0;
                        setFormData({ ...formData, discountPrice: price, discount: Math.min(100, disc) });
                      }}
                    />
                    <span className="text-xs text-gray-400">（客户实付价格）</span>
                  </div>
                </div>
              </div>

              {/* Row 2: User & Store */}
              <div className="grid grid-cols-2 gap-6">
                <div className="flex items-center gap-2">
                  <span className="text-red-500">*</span>
                  <label className="text-sm text-gray-700 whitespace-nowrap min-w-[70px]">用户名称</label>
                  <select
                    className="flex-1 h-9 px-3 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.userName}
                    onChange={(e) => setFormData({ ...formData, userName: e.target.value })}
                  >
                    <option value="">请选择客户</option>
                    <option value="陈洁蓉">陈洁蓉</option>
                    <option value="陈爱琴">陈爱琴</option>
                    <option value="楮倩">楮倩</option>
                    <option value="陈茶娟（阿慧）">陈茶娟（阿慧）</option>
                    <option value="陈途">陈途</option>
                    <option value="释团梅">释团梅</option>
                    <option value="陈吉">陈吉</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-red-500">*</span>
                  <label className="text-sm text-gray-700 whitespace-nowrap min-w-[70px]">所属门店</label>
                  <select
                    className="flex-1 h-9 px-3 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.storeName}
                    onChange={(e) => setFormData({ ...formData, storeName: e.target.value })}
                  >
                    <option value="">请选择所属门店</option>
                    <option value="凤仪阁美容养生会所">凤仪阁美容养生会所</option>
                    <option value="心悦美容养生会所">心悦美容养生会所</option>
                  </select>
                </div>
              </div>

              {/* Row 3: Start Time & Expire Time */}
              <div className="grid grid-cols-2 gap-6">
                <div className="flex items-center gap-2">
                  <span className="text-red-500">*</span>
                  <label className="text-sm text-gray-700 whitespace-nowrap min-w-[70px]">启动时间</label>
                  <div className="flex-1 relative">
                    <Input
                      type="datetime-local"
                      className="w-full"
                      value={formData.startTime}
                      onChange={(e) => {
                        const startTime = e.target.value;
                        setFormData({
                          ...formData,
                          startTime,
                          expireTime: selectedCard ? getExpireTime(startTime, selectedCard.validDays) : formData.expireTime,
                        });
                      }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-red-500">*</span>
                  <label className="text-sm text-gray-700 whitespace-nowrap min-w-[70px]">过期时间</label>
                  <div className="flex-1 relative">
                    <Input
                      type="datetime-local"
                      className="w-full"
                      value={formData.expireTime}
                      onChange={(e) => setFormData({ ...formData, expireTime: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Payment Info Section */}
              <div className="border border-gray-200 rounded-lg p-6">
                <h3 className="text-sm font-medium text-gray-800 mb-4">付款信息</h3>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-700 whitespace-nowrap min-w-[70px]">付款方式</label>
                  <div className="flex items-center gap-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="full"
                        checked={formData.paymentMethod === 'full'}
                        onChange={() => setFormData({ ...formData, paymentMethod: 'full' })}
                        className="w-4 h-4 text-blue-500 border-gray-300 focus:ring-blue-500"
                      />
                      <span className={`text-sm ${formData.paymentMethod === 'full' ? 'text-blue-500' : 'text-gray-600'}`}>全款</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="installment"
                        checked={formData.paymentMethod === 'installment'}
                        onChange={() => setFormData({ ...formData, paymentMethod: 'installment' })}
                        className="w-4 h-4 text-blue-500 border-gray-300 focus:ring-blue-500"
                      />
                      <span className={`text-sm ${formData.paymentMethod === 'installment' ? 'text-blue-500' : 'text-gray-600'}`}>分期</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Project Details Section */}
              <div className="border border-gray-200 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-gray-800">项目明细</h3>
                  <span className="text-xs text-gray-400">由次卡管理预设，不可更改</span>
                </div>
                <div className="border border-gray-200 rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-4 py-2.5 font-medium text-gray-600">项目</th>
                        <th className="text-left px-4 py-2.5 font-medium text-gray-600">总次数</th>
                        <th className="text-left px-4 py-2.5 font-medium text-gray-600">备注</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projectItems.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="text-center py-8 text-gray-400">
                            {formData.cardId ? '该次卡暂无预设项目' : '请先选择次卡'}
                          </td>
                        </tr>
                      ) : (
                        projectItems.map((item) => (
                          <tr key={item.id} className="border-b border-gray-200 last:border-b-0">
                            <td className="px-4 py-2.5">
                              <span className="text-sm text-gray-800">{item.name}</span>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="text-sm text-gray-800">{item.totalCount}</span>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="text-sm text-gray-800">{item.remark}</span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Additional Projects Section */}
              <div className="border border-gray-200 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-medium text-gray-800">赠送项目</h3>
                    <div className="relative" ref={presetBtnRef}>
                      <Button
                        className="gap-1 bg-[#4096ff] hover:bg-[#69b1ff] rounded-full px-5"
                        size="sm"
                        onClick={() => {
                          if (!formData.cardId) return;
                          const rect = presetBtnRef.current?.getBoundingClientRect();
                          if (rect) {
                            setPresetPickerPos({ top: rect.bottom + 4, left: rect.left });
                          }
                          setShowPresetPicker(prev => !prev);
                        }}
                        disabled={!formData.cardId}
                      >
                        添加项目
                      </Button>
                      {showPresetPicker && formData.cardId && (
                        <>
                          <div className="fixed inset-0 z-[60]" onClick={() => setShowPresetPicker(false)} />
                          <div
                            className="fixed bg-white border border-gray-200 rounded-md shadow-lg z-[70] min-w-[200px] py-1"
                            style={{ top: presetPickerPos.top, left: presetPickerPos.left }}
                          >
                            {selectedCardProjectItems.map((preset) => {
                              const alreadyAdded = additionalItems.some(a => a.name === preset.name);
                              return (
                                <button
                                  key={preset.name}
                                  className={`w-full text-left px-4 py-2 text-sm hover:bg-blue-50 flex items-center justify-between ${alreadyAdded ? 'text-gray-400' : 'text-gray-700'}`}
                                  disabled={alreadyAdded}
                                  onClick={() => {
                                    setAdditionalItems(prev => [...prev, {
                                      id: nextAdditionalId,
                                      name: preset.name,
                                      totalCount: preset.totalCount,
                                      usedCount: 0,
                                      remainCount: preset.totalCount,
                                      remark: '',
                                    }]);
                                    setNextAdditionalId(prev => prev + 1);
                                    setShowPresetPicker(false);
                                  }}
                                >
                                  <span>{preset.name}</span>
                                  {alreadyAdded && <span className="text-xs text-gray-400">已添加</span>}
                                </button>
                            );
                            })}
                            {selectedCardProjectItems.length === 0 && (
                              <div className="px-4 py-3 text-sm text-gray-400 text-center">暂无预设项目</div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <Button
                    className="gap-1 bg-[#30c213] hover:bg-[#52d639] rounded-full px-5"
                    size="sm"
                    onClick={handleAddAdditional}
                  >
                    自定义项目
                  </Button>
                </div>
                <div className="border border-gray-200 rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-4 py-2.5 font-medium text-gray-600">项目名称</th>
                        <th className="text-left px-4 py-2.5 font-medium text-gray-600">总次数</th>
                        <th className="text-left px-4 py-2.5 font-medium text-gray-600">备注</th>
                        <th className="text-left px-4 py-2.5 font-medium text-gray-600">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {additionalItems.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center py-8 text-gray-400">暂无数据</td>
                        </tr>
                      ) : (
                        additionalItems.map((item) => (
                          <tr key={item.id} className="border-b border-gray-200 last:border-b-0">
                            <td className="px-4 py-2">
                              <Input
                                className="w-full h-8"
                                placeholder="请输入项目名称"
                                value={item.name}
                                onChange={(e) => {
                                  setAdditionalItems(prev => prev.map(p => p.id === item.id ? { ...p, name: e.target.value } : p));
                                }}
                              />
                            </td>
                            <td className="px-4 py-2">
                              <Input
                                type="number"
                                className="w-20 h-8"
                                value={item.totalCount}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  setAdditionalItems(prev => prev.map(p => p.id === item.id ? { ...p, totalCount: val, remainCount: val - p.usedCount } : p));
                                }}
                              />
                            </td>
                            <td className="px-4 py-2">
                              <Input
                                type="number"
                                className="w-20 h-8"
                                value={item.usedCount}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  setAdditionalItems(prev => prev.map(p => p.id === item.id ? { ...p, usedCount: val, remainCount: p.totalCount - val } : p));
                                }}
                              />
                            </td>
                            <td className="px-4 py-2">
                              <span className="text-sm text-gray-600">{item.totalCount - item.usedCount}</span>
                            </td>
                            <td className="px-4 py-2">
                              <Input
                                className="w-full h-8"
                                placeholder="请输入备注"
                                value={item.remark}
                                onChange={(e) => {
                                  setAdditionalItems(prev => prev.map(p => p.id === item.id ? { ...p, remark: e.target.value } : p));
                                }}
                              />
                            </td>
                            <td className="px-4 py-2">
                              <button
                                className="text-red-500 hover:text-red-600 text-sm"
                                onClick={() => handleRemoveAdditional(item.id)}
                              >
                                删除
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Custom Projects Section */}
              
            </div>

            {/* Dialog Footer */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
              <Button variant="outline" onClick={handleCloseDialog}>
                取消
              </Button>
              <Button className="bg-[#1890ff] hover:bg-[#40a9ff]" onClick={handleSubmit}>
                确定
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Card Consume Dialog */}
      {isConsumeDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-[500px]">
            {/* Dialog Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-lg font-medium">次卡消费</h2>
              <button
                onClick={handleCloseConsumeDialog}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Dialog Body */}
            <div className="p-6 space-y-7">
              {/* 消费项目 */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-0.5 min-w-[80px] justify-end">
                  <span className="text-red-500 text-sm">*</span>
                  <label className="text-sm text-gray-800 font-medium">消费项目</label>
                </div>
                <select
                  className="flex-1 h-10 px-3 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  value={consumeProject}
                  onChange={(e) => setConsumeProject(e.target.value)}
                >
                  <option value="">请选择项目</option>
                  {MOCK_CONSUME_PROJECTS.map(project => (
                    <option key={project.name} value={project.name}>
                      {project.name}（剩余 {project.remainCount} 次）
                    </option>
                  ))}
                </select>
              </div>

              {/* 消费次数 */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-0.5 min-w-[80px] justify-end">
                    <span className="text-red-500 text-sm">*</span>
                    <label className="text-sm text-gray-800 font-medium">消费次数</label>
                  </div>
                  <div className="flex items-center">
                    <button
                      className="w-9 h-10 border border-gray-300 rounded-l-md flex items-center justify-center hover:bg-gray-50 text-gray-500 bg-gray-50"
                      onClick={() => setConsumeCount(Math.max(1, consumeCount - 1))}
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <Input
                      type="number"
                      className="w-20 h-10 rounded-none border-x-0 text-center"
                      value={consumeCount}
                      onChange={(e) => setConsumeCount(Math.max(1, parseInt(e.target.value) || 1))}
                    />
                    <button
                      className="w-9 h-10 border border-gray-300 rounded-r-md flex items-center justify-center hover:bg-gray-50 text-gray-500 bg-gray-50"
                      onClick={() => {
                        const max = selectedConsumeProject?.remainCount ?? 99;
                        setConsumeCount(Math.min(max, consumeCount + 1));
                      }}
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {selectedConsumeProject && (
                  <div className="ml-[92px] text-sm text-gray-500">
                    已消费：{selectedConsumeProject.usedCount} 次；可用剩余：{selectedConsumeProject.remainCount} 次
                  </div>
                )}
              </div>

              {/* 操作顾问 */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-0.5 min-w-[80px] justify-end">
                  <span className="text-red-500 text-sm">*</span>
                  <label className="text-sm text-gray-800 font-medium">操作顾问</label>
                </div>
                <Input
                  className="flex-1 h-10 bg-gray-50 text-gray-500"
                  value="超级管理员"
                  disabled
                  readOnly
                />
              </div>
            </div>

            {/* Dialog Footer */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
              <Button variant="outline" onClick={handleCloseConsumeDialog}>
                取 消
              </Button>
              <Button className="bg-[#1890ff] hover:bg-[#40a9ff]" onClick={handleConsumeSubmit}>
                确 定
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
