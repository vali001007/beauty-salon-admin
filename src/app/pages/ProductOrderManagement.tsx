import React, { useState, useMemo } from 'react';
import { Eye, Search, Loader2, Download } from 'lucide-react';
import { Button, Input, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/UI';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { getProductOrdersPaginated } from '@/api/order';
import { usePagination } from '@/hooks/usePagination';
import { exportToExcel } from '@/utils/excel';
import type { ProductOrder } from '@/types';
import type { ExportColumn } from '@/types/excel';

const ORDER_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'orderNo', header: '订单编号', width: 20 },
  { key: 'customerName', header: '客户', width: 12 },
  { key: 'customerPhone', header: '联系电话', width: 15 },
  { key: 'storeName', header: '门店', width: 20 },
  { key: 'totalAmount', header: '总金额', width: 12 },
  { key: 'paymentMethod', header: '支付方式', width: 12 },
  { key: 'status', header: '状态', width: 10 },
  { key: 'createdAt', header: '下单时间', width: 18 },
];

const STATUS_OPTIONS = ['全部', '待付款', '已付款', '已完成', '已取消', '已退款'];

export function ProductOrderManagement() {
  const [statusFilter, setStatusFilter] = useState('全部');
  const [keyword, setKeyword] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<ProductOrder | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const filters = useMemo(() => ({
    status: statusFilter !== '全部' ? statusFilter : undefined,
    keyword: keyword || undefined,
  }), [statusFilter, keyword]);
  const { data: filteredOrders, total, page, pageSize, loading, setPage, setPageSize } = usePagination<ProductOrder>(getProductOrdersPaginated, filters);

  const getStatusColor = (status: ProductOrder['status']) => {
    switch (status) {
      case '待付款': return 'bg-yellow-100 text-yellow-700';
      case '已付款': return 'bg-blue-100 text-blue-700';
      case '已完成': return 'bg-green-100 text-green-700';
      case '已取消': return 'bg-gray-100 text-gray-600';
      case '已退款': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const handleViewDetail = (order: ProductOrder) => {
    setSelectedOrder(order);
    setShowDetail(true);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="text-sm text-gray-500">首页 / 订单管理 / 商品订单管理</div>
      <h2 className="text-xl font-semibold text-gray-800">商品订单管理</h2>

      {/* Filters */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              className="pl-9 w-64"
              placeholder="搜索订单号、客户姓名"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>
          <select
            className="h-9 px-3 text-sm border border-gray-300 rounded-md"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select className="h-9 px-3 text-sm border border-gray-300 rounded-md">
            <option>全部门店</option>
            <option>心悦美容养生会所</option>
            <option>凤仪阁美容养生会所</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => exportToExcel(filteredOrders, ORDER_EXPORT_COLUMNS, '订单报表')}>
            <Download className="w-4 h-4" /> 导出报表
          </Button>
          <div className="text-sm text-gray-500">
            共 {filteredOrders.length} 条订单
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
          <div className="text-sm text-blue-600 mb-1">总订单数</div>
          <div className="text-2xl font-bold text-blue-900">{total}</div>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4">
          <div className="text-sm text-green-600 mb-1">已完成</div>
          <div className="text-2xl font-bold text-green-900">{filteredOrders.filter(o => o.status === '已完成').length}</div>
        </div>
        <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-4">
          <div className="text-sm text-yellow-600 mb-1">待处理</div>
          <div className="text-2xl font-bold text-yellow-900">{filteredOrders.filter(o => o.status === '待付款' || o.status === '已付款').length}</div>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4">
          <div className="text-sm text-purple-600 mb-1">总金额</div>
          <div className="text-2xl font-bold text-purple-900">
            ¥{filteredOrders.filter(o => o.status !== '已取消' && o.status !== '已退款').reduce((s, o) => s + o.totalAmount, 0).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Orders Table */}
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
            <TableHead>客户</TableHead>
            <TableHead>门店</TableHead>
            <TableHead>商品数</TableHead>
            <TableHead>总金额</TableHead>
            <TableHead>支付方式</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>下单时间</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredOrders.map((order) => (
            <TableRow key={order.id} className="hover:bg-blue-50/30">
              <TableCell className="font-mono text-sm text-blue-600 font-medium">{order.orderNo}</TableCell>
              <TableCell>
                <div className="font-medium text-gray-800">{order.customerName}</div>
                <div className="text-xs text-gray-500">{order.customerPhone}</div>
              </TableCell>
              <TableCell className="text-sm text-gray-600">{order.storeName}</TableCell>
              <TableCell>{order.items.length}</TableCell>
              <TableCell className="font-medium text-gray-800">¥{order.totalAmount.toLocaleString()}</TableCell>
              <TableCell className="text-sm text-gray-600">{order.paymentMethod}</TableCell>
              <TableCell>
                <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${getStatusColor(order.status)}`}>
                  {order.status}
                </span>
              </TableCell>
              <TableCell className="text-sm text-gray-600">{order.createdAt}</TableCell>
              <TableCell className="text-right">
                <button
                  onClick={() => handleViewDetail(order)}
                  className="text-blue-500 hover:text-blue-600 text-sm inline-flex items-center gap-1"
                >
                  <Eye className="w-3.5 h-3.5" /> 详情
                </button>
              </TableCell>
            </TableRow>
          ))}
          {filteredOrders.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="text-center py-12 text-gray-400">
                暂无匹配的订单数据
              </TableCell>
            </TableRow>
          )}
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

      {/* Order Detail Dialog */}
      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" aria-describedby="order-detail-desc">
          <DialogHeader>
            <DialogTitle>订单详情</DialogTitle>
          </DialogHeader>
          <span id="order-detail-desc" className="sr-only">查看商品订单详细信息</span>

          {selectedOrder && (
            <div className="space-y-6 mt-4">
              <div className="bg-gray-50 rounded-lg p-4 grid grid-cols-3 gap-4">
                <div>
                  <div className="text-sm text-gray-600">订单编号</div>
                  <div className="font-mono text-sm font-medium text-gray-800 mt-1">{selectedOrder.orderNo}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">客户</div>
                  <div className="font-medium text-gray-800 mt-1">{selectedOrder.customerName}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">联系电话</div>
                  <div className="text-sm text-gray-800 mt-1">{selectedOrder.customerPhone}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">门店</div>
                  <div className="text-sm text-gray-800 mt-1">{selectedOrder.storeName}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">支付方式</div>
                  <div className="text-sm text-gray-800 mt-1">{selectedOrder.paymentMethod}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">状态</div>
                  <div className="mt-1">
                    <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${getStatusColor(selectedOrder.status)}`}>
                      {selectedOrder.status}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">下单时间</div>
                  <div className="text-sm text-gray-800 mt-1">{selectedOrder.createdAt}</div>
                </div>
                {selectedOrder.completedAt && (
                  <div>
                    <div className="text-sm text-gray-600">完成时间</div>
                    <div className="text-sm text-gray-800 mt-1">{selectedOrder.completedAt}</div>
                  </div>
                )}
              </div>

              <div>
                <h4 className="font-medium text-gray-800 mb-3">商品明细</h4>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50/80">
                      <TableHead>商品名称</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>数量</TableHead>
                      <TableHead>单价</TableHead>
                      <TableHead className="text-right">小计</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedOrder.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium text-gray-800">{item.productName}</TableCell>
                        <TableCell className="font-mono text-sm text-gray-600">{item.sku}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>¥{item.unitPrice.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-medium">¥{item.subtotal.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="border-t border-gray-200 pt-4 flex justify-end">
                <div className="text-right">
                  <div className="text-sm text-gray-600">订单总额</div>
                  <div className="text-2xl font-semibold text-blue-600 mt-1">
                    ¥{selectedOrder.totalAmount.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
