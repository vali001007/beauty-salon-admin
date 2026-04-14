import React, { useState, useMemo } from 'react';
import { Search, RotateCcw, Loader2 } from 'lucide-react';
import { Input, Button, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/UI';
import { getReservationsPaginated } from '@/api/project';
import { usePagination } from '@/hooks/usePagination';

interface Reservation {
  id: string;
  storeName: string;
  userName: string;
  projectName: string;
  beauticianName: string;
  appointmentTime: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  createTime: string;
}

export function ProjectReservation() {
  const [searchStore, setSearchStore] = useState('');
  const [searchUser, setSearchUser] = useState('');
  const [searchProject, setSearchProject] = useState('');
  const [searchBeautician, setSearchBeautician] = useState('');
  const [searchStatus, setSearchStatus] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const filters = useMemo(() => ({
    storeName: searchStore || undefined,
    userName: searchUser || undefined,
    projectName: searchProject || undefined,
    status: searchStatus || undefined,
  }), [searchStore, searchUser, searchProject, searchStatus]);
  const { data: reservations, total, page, pageSize, loading, setPage, setPageSize } = usePagination<Reservation>(getReservationsPaginated, filters);

  const getStatusConfig = (status: Reservation['status']) => {
    const configs = {
      pending: { text: '待确认', color: 'bg-orange-100 text-orange-700 border-orange-300' },
      confirmed: { text: '已确认', color: 'bg-blue-100 text-blue-700 border-blue-300' },
      completed: { text: '已完成', color: 'bg-green-100 text-green-700 border-green-300' },
      cancelled: { text: '已取消', color: 'bg-gray-100 text-gray-600 border-gray-300' },
    };
    return configs[status];
  };

  const handleReset = () => {
    setSearchStore('');
    setSearchUser('');
    setSearchProject('');
    setSearchBeautician('');
    setSearchStatus('');
    setStartDate('');
    setEndDate('');
  };

  const handleView = (id: string) => {
    console.log('查看预约详情:', id);
  };

  const handleConfirm = (id: string) => {
    console.log('确认预约:', id);
  };

  const handleCancel = (id: string) => {
    console.log('取消预约:', id);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Search Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="grid grid-cols-3 gap-x-6 gap-y-5">
          {/* 门店 */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 whitespace-nowrap min-w-[70px]">门店</label>
            <select
              className="flex-1 h-10 px-3 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              value={searchStore}
              onChange={(e) => setSearchStore(e.target.value)}
            >
              <option value="">请选择门店</option>
              <option value="凤仪阁美容养生会所">凤仪阁美容养生会所</option>
              <option value="心悦美容养生会所">心悦美容养生会所</option>
            </select>
          </div>

          {/* 用户 */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 whitespace-nowrap min-w-[70px]">用户</label>
            <Input
              placeholder="请输入用户名称"
              className="flex-1"
              value={searchUser}
              onChange={(e) => setSearchUser(e.target.value)}
            />
          </div>

          {/* 项目 */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 whitespace-nowrap min-w-[70px]">项目</label>
            <select
              className="flex-1 h-10 px-3 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              value={searchProject}
              onChange={(e) => setSearchProject(e.target.value)}
            >
              <option value="">请选择项目</option>
              <option value="面部护理（巨补水）">面部护理（巨补水）</option>
              <option value="膏方灸">膏方灸</option>
              <option value="古方灸">古方灸</option>
              <option value="欧蜜丽养盘">欧蜜丽养盘</option>
              <option value="泡澡">泡澡</option>
              <option value="能量屋">能量屋</option>
              <option value="负氧离子舱">负氧离子舱</option>
              <option value="八戒享秀仪器">八戒享秀仪器</option>
            </select>
          </div>

          {/* 美容师 */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 whitespace-nowrap min-w-[70px]">美容师</label>
            <Input
              placeholder="请输入美容师姓名"
              className="flex-1"
              value={searchBeautician}
              onChange={(e) => setSearchBeautician(e.target.value)}
            />
          </div>

          {/* 预约状态 */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 whitespace-nowrap min-w-[70px]">预约状态</label>
            <select
              className="flex-1 h-10 px-3 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              value={searchStatus}
              onChange={(e) => setSearchStatus(e.target.value)}
            >
              <option value="">全部状态</option>
              <option value="pending">待确认</option>
              <option value="confirmed">已确认</option>
              <option value="completed">已完成</option>
              <option value="cancelled">已取消</option>
            </select>
          </div>

          {/* 预约时间 */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 whitespace-nowrap min-w-[70px]">预约时间</label>
            <div className="flex items-center gap-2 flex-1">
              <Input
                type="date"
                className="flex-1"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <span className="text-gray-400">至</span>
              <Input
                type="date"
                className="flex-1"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-3 mt-6">
          <Button className="gap-2">
            <Search className="w-4 h-4" /> 搜索
          </Button>
          <Button variant="outline" className="gap-2" onClick={handleReset}>
            <RotateCcw className="w-4 h-4" /> 重置
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
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
              <TableHead>预约编号</TableHead>
              <TableHead>门店</TableHead>
              <TableHead>用户</TableHead>
              <TableHead>项目</TableHead>
              <TableHead>美容师</TableHead>
              <TableHead>预约时间</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reservations.map((reservation) => {
              const statusConfig = getStatusConfig(reservation.status);
              return (
                <TableRow key={reservation.id} className="hover:bg-blue-50/30">
                  <TableCell>{reservation.id}</TableCell>
                  <TableCell className="max-w-[150px]">
                    <div className="truncate" title={reservation.storeName}>
                      {reservation.storeName}
                    </div>
                  </TableCell>
                  <TableCell>{reservation.userName}</TableCell>
                  <TableCell>{reservation.projectName}</TableCell>
                  <TableCell>{reservation.beauticianName}</TableCell>
                  <TableCell className="whitespace-nowrap">{reservation.appointmentTime}</TableCell>
                  <TableCell>
                    <span className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-md border ${statusConfig.color}`}>
                      {statusConfig.text}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{reservation.createTime}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-3 text-sm">
                      <button
                        className="text-blue-500 hover:text-blue-600"
                        onClick={() => handleView(reservation.id)}
                      >
                        查看
                      </button>
                      {reservation.status === 'pending' && (
                        <>
                          <button
                            className="text-green-500 hover:text-green-600"
                            onClick={() => handleConfirm(reservation.id)}
                          >
                            确认
                          </button>
                          <button
                            className="text-red-500 hover:text-red-600"
                            onClick={() => handleCancel(reservation.id)}
                          >
                            取消
                          </button>
                        </>
                      )}
                      {reservation.status === 'confirmed' && (
                        <button
                          className="text-red-500 hover:text-red-600"
                          onClick={() => handleCancel(reservation.id)}
                        >
                          取消
                        </button>
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
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
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
      </div>
    </div>
  );
}
