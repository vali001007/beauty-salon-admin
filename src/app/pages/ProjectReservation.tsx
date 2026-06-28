import { useEffect, useState, useMemo } from 'react';
import { Search, RotateCcw, Loader2, Plus } from 'lucide-react';
import { Input, Button, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/UI';
import {
  cancelReservation,
  checkInReservation,
  confirmReservation,
  createReservation,
  getProjects,
  getReservationById,
  getReservationsPaginated,
  updateReservation,
} from '@/api/project';
import { getBeauticians } from '@/api/beautician';
import { usePagination } from '@/hooks/usePagination';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { toast } from 'sonner';
import { useStoreStore } from '@/stores/storeStore';
import { CustomerPicker } from '../components/CustomerPicker';
import type { Beautician, Customer, Project } from '@/types';

type ReservationStatus = 'pending' | 'confirmed' | 'checked_in' | 'completed' | 'cancelled' | 'no_show';

interface Reservation {
  id: string;
  storeName: string;
  userName: string;
  projectId?: number;
  projectName: string;
  beauticianId?: number;
  beauticianName: string;
  appointmentTime: string;
  status: ReservationStatus;
  createTime: string;
  customerPhone?: string;
  remark?: string;
}

interface ReservationFormState {
  customerId?: number;
  customerName: string;
  customerPhone: string;
  projectId?: number;
  projectName: string;
  beauticianId?: number;
  beauticianName: string;
  appointmentDate: string;
  timeSlot: string;
  remark: string;
}

const TIME_SLOTS = [
  { value: '08:00-09:00', label: '08:00~09:00', start: '08:00', end: '09:00' },
  { value: '09:00-10:00', label: '09:00~10:00', start: '09:00', end: '10:00' },
  { value: '10:00-11:00', label: '10:00~11:00', start: '10:00', end: '11:00' },
  { value: '11:00-12:00', label: '11:00~12:00', start: '11:00', end: '12:00' },
  { value: '12:00-13:00', label: '12:00~13:00', start: '12:00', end: '13:00' },
  { value: '13:00-14:00', label: '13:00~14:00', start: '13:00', end: '14:00' },
  { value: '14:00-15:00', label: '14:00~15:00', start: '14:00', end: '15:00' },
  { value: '15:00-16:00', label: '15:00~16:00', start: '15:00', end: '16:00' },
  { value: '16:00-17:00', label: '16:00~17:00', start: '16:00', end: '17:00' },
  { value: '17:00-18:00', label: '17:00~18:00', start: '17:00', end: '18:00' },
  { value: '18:00-19:00', label: '18:00~19:00', start: '18:00', end: '19:00' },
  { value: '19:00-20:00', label: '19:00~20:00', start: '19:00', end: '20:00' },
  { value: '20:00-21:00', label: '20:00~21:00', start: '20:00', end: '21:00' },
];

const toDatetimeLocalValue = (value?: string) => {
  if (!value) return '';
  return value.replace(' ', 'T').slice(0, 16);
};

const getProjectSelectValue = (reservation: Reservation, options: Project[]) => {
  const matchedById = reservation.projectId
    ? options.find((project) => project.id === reservation.projectId)
    : undefined;
  const matchedByName = options.find((project) => project.name === reservation.projectName);
  const selected = matchedById ?? matchedByName;
  if (!selected) return reservation.projectName;
  return selected.id ? String(selected.id) : selected.name;
};

const getBeauticianSelectValue = (reservation: Reservation, options: Beautician[]) => {
  const matchedById = reservation.beauticianId
    ? options.find((beautician) => beautician.id === reservation.beauticianId)
    : undefined;
  const matchedByName = options.find((beautician) => beautician.name === reservation.beauticianName);
  const selected = matchedById ?? matchedByName;
  if (!selected) return reservation.beauticianName || '';
  return selected.id ? String(selected.id) : selected.name;
};

const createEmptyReservationForm = (): ReservationFormState => ({
  customerId: undefined,
  customerName: '',
  customerPhone: '',
  projectId: undefined,
  projectName: '',
  beauticianId: undefined,
  beauticianName: '',
  appointmentDate: '',
  timeSlot: '',
  remark: '',
});

export function ProjectReservation() {
  const [searchUser, setSearchUser] = useState('');
  const [searchProject, setSearchProject] = useState('');
  const [searchBeautician, setSearchBeautician] = useState('');
  const [searchStatus, setSearchStatus] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [viewReservation, setViewReservation] = useState<Reservation | null>(null);
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<ReservationFormState>(() => createEmptyReservationForm());
  const [customerSearch, setCustomerSearch] = useState('');
  const [savingReservation, setSavingReservation] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [beauticians, setBeauticians] = useState<Beautician[]>([]);
  const [beauticiansLoading, setBeauticiansLoading] = useState(false);
  const currentStoreId = useStoreStore((state) => state.currentStoreId);
  const stores = useStoreStore((state) => state.stores);
  const loadStores = useStoreStore((state) => state.loadStores);
  const currentStoreName = useMemo(
    () => stores.find((store) => store.id === currentStoreId)?.name || '',
    [currentStoreId, stores],
  );

  const filters = useMemo(
    () => ({
      userName: searchUser || undefined,
      projectName: searchProject || undefined,
      beauticianName: searchBeautician || undefined,
      status: searchStatus || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    }),
    [searchUser, searchProject, searchBeautician, searchStatus, startDate, endDate],
  );
  const {
    data: reservations,
    total,
    page,
    pageSize,
    loading,
    setPage,
    setPageSize,
    refresh,
  } = usePagination<Reservation>(getReservationsPaginated, filters);
  const projectFilterOptions = useMemo(() => {
    const map = new Map<string, Project>();
    projects.forEach((project) => {
      if (!map.has(project.name)) map.set(project.name, project);
    });
    return Array.from(map.values());
  }, [projects]);
  const currentStoreProjects = useMemo(() => {
    if (!currentStoreName) return projects;
    const matched = projects.filter((project) => project.storeName === currentStoreName);
    return matched.length ? matched : projects;
  }, [currentStoreName, projects]);
  const currentStoreBeauticians = useMemo(() => {
    const activeBeauticians = beauticians.filter((beautician) => beautician.status !== '离职');
    if (!currentStoreName) return activeBeauticians;
    const matched = activeBeauticians.filter((beautician) => beautician.storeName === currentStoreName);
    return matched.length ? matched : activeBeauticians;
  }, [beauticians, currentStoreName]);
  const editingProjectOptions = useMemo(() => {
    if (!editingReservation) return [];
    const storeProjects = projects.filter((project) => project.storeName === editingReservation.storeName);
    const options = storeProjects.length ? storeProjects : projects;
    if (options.some((project) => project.name === editingReservation.projectName)) return options;
    return [
      {
        id: editingReservation.projectId ?? 0,
        name: editingReservation.projectName,
        type: '当前项目',
        duration: 0,
        price: 0,
        storeName: editingReservation.storeName,
        recommend: false,
        online: true,
        home: false,
        status: true,
        sort: 0,
      },
      ...options,
    ];
  }, [editingReservation, projects]);
  const editingBeauticianOptions = useMemo(() => {
    if (!editingReservation) return [];
    const activeBeauticians = beauticians.filter((beautician) => beautician.status !== '离职');
    const storeBeauticians = activeBeauticians.filter(
      (beautician) => beautician.storeName === editingReservation.storeName,
    );
    const options = storeBeauticians.length ? storeBeauticians : activeBeauticians;
    if (
      !editingReservation.beauticianName ||
      options.some((beautician) => beautician.name === editingReservation.beauticianName)
    ) {
      return options;
    }
    return [
      {
        id: editingReservation.beauticianId ?? 0,
        name: editingReservation.beauticianName,
        phone: '',
        level: '当前美容师',
        specialties: [],
        status: '在职' as const,
        storeName: editingReservation.storeName,
        joinDate: '',
        createdAt: '',
      },
      ...options,
    ];
  }, [beauticians, editingReservation]);

  useEffect(() => {
    if (!stores.length) {
      loadStores().catch(() => toast.error('门店列表加载失败，请稍后重试'));
    }
  }, [loadStores, stores.length]);

  useEffect(() => {
    let cancelled = false;
    setProjectsLoading(true);
    void getProjects()
      .then((items) => {
        if (!cancelled) setProjects(items.filter((project) => project.status));
      })
      .catch((error) => {
        if (!cancelled)
          toast.warning(error instanceof Error ? `项目数据加载失败：${error.message}` : '项目数据加载失败');
      })
      .finally(() => {
        if (!cancelled) setProjectsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setBeauticiansLoading(true);
    void getBeauticians()
      .then((items) => {
        if (!cancelled) setBeauticians(items);
      })
      .catch((error) => {
        if (!cancelled)
          toast.warning(error instanceof Error ? `美容师数据加载失败：${error.message}` : '美容师数据加载失败');
      })
      .finally(() => {
        if (!cancelled) setBeauticiansLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const getStatusConfig = (status: Reservation['status']) => {
    const configs = {
      pending: { text: '待确认', color: 'bg-orange-100 text-orange-700 border-orange-300' },
      confirmed: { text: '已确认', color: 'bg-blue-100 text-blue-700 border-blue-300' },
      checked_in: { text: '已到店', color: 'bg-purple-100 text-purple-700 border-purple-300' },
      completed: { text: '已完成', color: 'bg-green-100 text-green-700 border-green-300' },
      cancelled: { text: '已取消', color: 'bg-gray-100 text-gray-600 border-gray-300' },
      no_show: { text: '未到店', color: 'bg-red-50 text-red-700 border-red-200' },
    };
    return configs[status] ?? configs.pending;
  };

  const handleReset = () => {
    setSearchUser('');
    setSearchProject('');
    setSearchBeautician('');
    setSearchStatus('');
    setStartDate('');
    setEndDate('');
  };

  const handleOpenCreate = () => {
    if (!currentStoreId || !currentStoreName) {
      toast.warning('请先在顶部栏选择具体门店，再添加预约');
      return;
    }
    setCreateForm(createEmptyReservationForm());
    setCustomerSearch('');
    setIsCreateOpen(true);
  };

  const handleSelectCustomer = (selectedCustomer: Customer | null) => {
    setCreateForm((prev) => ({
      ...prev,
      customerId: selectedCustomer?.id,
      customerName: selectedCustomer?.name || '',
      customerPhone: selectedCustomer?.phone || '',
    }));
  };

  const handleCustomerSearchChange = (value: string) => {
    setCustomerSearch(value);
    const selectedLabel = createForm.customerName
      ? createForm.customerName
      : '';
    if (createForm.customerId && value !== selectedLabel) {
      setCreateForm((prev) => ({
        ...prev,
        customerId: undefined,
        customerName: '',
        customerPhone: '',
      }));
    }
  };

  const handleSelectProject = (projectId: string) => {
    const selectedProject = currentStoreProjects.find((project) => String(project.id) === projectId);
    setCreateForm((prev) => ({
      ...prev,
      projectId: selectedProject?.id,
      projectName: selectedProject?.name || '',
    }));
  };

  const handleSelectBeautician = (beauticianId: string) => {
    const selectedBeautician = currentStoreBeauticians.find((beautician) => String(beautician.id) === beauticianId);
    setCreateForm((prev) => ({
      ...prev,
      beauticianId: selectedBeautician?.id,
      beauticianName: selectedBeautician?.name || '',
    }));
  };

  const handleCreateReservation = async () => {
    if (!currentStoreId || !currentStoreName) {
      toast.warning('请先在顶部栏选择具体门店');
      return;
    }
    if (!createForm.customerId) {
      toast.warning('请选择预约客户');
      return;
    }
    if (!createForm.projectId) {
      toast.warning('请选择预约项目');
      return;
    }
    if (!createForm.appointmentDate) {
      toast.warning('请选择预约日期');
      return;
    }
    const selectedTimeSlot = TIME_SLOTS.find((slot) => slot.value === createForm.timeSlot);
    if (!selectedTimeSlot) {
      toast.warning('请选择预约时间段');
      return;
    }

    const appointmentTime = `${createForm.appointmentDate} ${selectedTimeSlot.start}:00`;

    try {
      setSavingReservation(true);
      await createReservation({
        storeId: currentStoreId,
        storeName: currentStoreName,
        customerId: createForm.customerId,
        customerName: createForm.customerName,
        customerPhone: createForm.customerPhone,
        projectId: createForm.projectId,
        projectName: createForm.projectName,
        beauticianId: createForm.beauticianId,
        beauticianName: createForm.beauticianName || undefined,
        date: appointmentTime,
        appointmentTime,
        startTime: selectedTimeSlot.start,
        endTime: selectedTimeSlot.end,
        status: 'pending',
        remark: createForm.remark,
      });
      toast.success('预约已添加');
      setIsCreateOpen(false);
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '预约添加失败');
    } finally {
      setSavingReservation(false);
    }
  };

  const runReservationAction = async (id: string, action: () => Promise<unknown>, successMessage: string) => {
    try {
      setActionLoadingId(id);
      await action();
      toast.success(successMessage);
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '预约操作失败');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleView = async (id: string) => {
    try {
      setActionLoadingId(id);
      const detail = await getReservationById(id);
      setViewReservation(detail);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '预约详情加载失败');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleEdit = async (reservation: Reservation) => {
    try {
      setActionLoadingId(reservation.id);
      const detail = await getReservationById(reservation.id);
      setEditingReservation(detail);
    } catch {
      setEditingReservation(reservation);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleConfirm = (id: string) => {
    void runReservationAction(id, () => confirmReservation(id), '预约已确认');
  };

  const handleCheckIn = (id: string) => {
    void runReservationAction(id, () => checkInReservation(id), '客户到店已记录');
  };

  const handleCancel = (id: string) => {
    const reason = window.prompt('请输入取消原因（可选）') || undefined;
    void runReservationAction(id, () => cancelReservation(id, reason), '预约已取消');
  };

  const handleSaveEdit = async () => {
    if (!editingReservation) return;
    try {
      setActionLoadingId(editingReservation.id);
      await updateReservation(editingReservation.id, {
        appointmentTime: editingReservation.appointmentTime,
        projectId: editingReservation.projectId,
        projectName: editingReservation.projectName,
        beauticianId: editingReservation.beauticianId,
        beauticianName: editingReservation.beauticianName,
        remark: editingReservation.remark,
      });
      toast.success('预约已修改');
      setEditingReservation(null);
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '预约修改失败');
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Search Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="grid grid-cols-3 gap-x-6 gap-y-5">
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
              {projectFilterOptions.map((project) => (
                <option key={`${project.storeName}-${project.id}`} value={project.name}>
                  {project.name}
                </option>
              ))}
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
              <option value="checked_in">已到店</option>
              <option value="completed">已完成</option>
              <option value="cancelled">已取消</option>
              <option value="no_show">未到店</option>
            </select>
          </div>

          {/* 预约时间 */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 whitespace-nowrap min-w-[70px]">预约时间</label>
            <div className="flex items-center gap-2 flex-1">
              <Input type="date" className="flex-1" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <span className="text-gray-400">至</span>
              <Input type="date" className="flex-1" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
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
          <Button className="gap-2 bg-[#1890ff] hover:bg-[#40a9ff]" onClick={handleOpenCreate}>
            <Plus className="w-4 h-4" /> 添加预约
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
                      <span
                        className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-md border ${statusConfig.color}`}
                      >
                        {statusConfig.text}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{reservation.createTime}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-3 text-sm">
                        <button
                          className="text-blue-500 hover:text-blue-600"
                          onClick={() => handleView(reservation.id)}
                          disabled={actionLoadingId === reservation.id}
                        >
                          查看
                        </button>
                        {!['completed', 'cancelled'].includes(reservation.status) && (
                          <button
                            className="text-gray-600 hover:text-gray-800"
                            onClick={() => void handleEdit(reservation)}
                            disabled={actionLoadingId === reservation.id}
                          >
                            修改
                          </button>
                        )}
                        {reservation.status === 'pending' && (
                          <button
                            className="text-green-500 hover:text-green-600"
                            onClick={() => handleConfirm(reservation.id)}
                            disabled={actionLoadingId === reservation.id}
                          >
                            确认
                          </button>
                        )}
                        {['pending', 'confirmed'].includes(reservation.status) && (
                          <button
                            className="text-purple-500 hover:text-purple-600"
                            onClick={() => handleCheckIn(reservation.id)}
                            disabled={actionLoadingId === reservation.id}
                          >
                            到店
                          </button>
                        )}
                        {['pending', 'confirmed', 'checked_in'].includes(reservation.status) && (
                          <button
                            className="text-red-500 hover:text-red-600"
                            onClick={() => handleCancel(reservation.id)}
                            disabled={actionLoadingId === reservation.id}
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
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="h-8 px-2 text-sm border border-gray-300 rounded"
            >
              <option value={10}>10条/页</option>
              <option value={20}>20条/页</option>
              <option value={50}>50条/页</option>
            </select>
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              上一页
            </Button>
            <span className="text-sm text-gray-600">
              {page} / {Math.ceil(total / pageSize) || 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= Math.ceil(total / pageSize)}
              onClick={() => setPage(page + 1)}
            >
              下一页
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={isCreateOpen} onOpenChange={(open) => !open && setIsCreateOpen(false)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>添加预约</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">
              当前门店：{currentStoreName || '请先在顶部栏选择门店'}
            </div>

            <CustomerPicker
              value={customerSearch}
              onValueChange={handleCustomerSearchChange}
              onSelect={handleSelectCustomer}
              selectedCustomerId={createForm.customerId}
              storeName={currentStoreName}
              label="客户"
              required
              placeholder="输入客户姓名或手机号搜索"
              disabled={!currentStoreName}
              emptyText="未找到匹配客户，请先到客户资料中建档。"
            />

            <div className="grid grid-cols-2 gap-4">
              <label className="block text-sm">
                <span className="mb-1 block text-gray-600">项目 *</span>
                <select
                  className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={createForm.projectId ? String(createForm.projectId) : ''}
                  onChange={(event) => handleSelectProject(event.target.value)}
                  disabled={projectsLoading}
                >
                  <option value="">{projectsLoading ? '项目加载中...' : '请选择项目'}</option>
                  {currentStoreProjects.map((project) => (
                    <option key={`${project.storeName}-${project.id}`} value={String(project.id)}>
                      {project.name}
                      {project.duration ? ` / ${project.duration}分钟` : ''}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-gray-600">美容师</span>
                <select
                  className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={createForm.beauticianId ? String(createForm.beauticianId) : ''}
                  onChange={(event) => handleSelectBeautician(event.target.value)}
                  disabled={beauticiansLoading}
                >
                  <option value="">{beauticiansLoading ? '美容师加载中...' : '待分配'}</option>
                  {currentStoreBeauticians.map((beautician) => (
                    <option key={`${beautician.storeName}-${beautician.id}`} value={String(beautician.id)}>
                      {beautician.name}
                      {beautician.level ? ` / ${beautician.level}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <label className="block text-sm">
                <span className="mb-1 block text-gray-600">预约日期 *</span>
                <Input
                  type="date"
                  value={createForm.appointmentDate}
                  onChange={(event) => setCreateForm({ ...createForm, appointmentDate: event.target.value })}
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-gray-600">时间段 *</span>
                <select
                  className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={createForm.timeSlot}
                  onChange={(event) => setCreateForm({ ...createForm, timeSlot: event.target.value })}
                >
                  <option value="">请选择时间段</option>
                  {TIME_SLOTS.map((slot) => (
                    <option key={slot.value} value={slot.value}>
                      {slot.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block text-sm">
              <span className="mb-1 block text-gray-600">备注</span>
              <textarea
                className="min-h-20 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={createForm.remark}
                onChange={(event) => setCreateForm({ ...createForm, remark: event.target.value })}
                placeholder="可填写客户诉求、到店注意事项等"
              />
            </label>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void handleCreateReservation()} disabled={savingReservation}>
              {savingReservation && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              保存预约
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewReservation} onOpenChange={(open) => !open && setViewReservation(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>预约详情</DialogTitle>
          </DialogHeader>
          {viewReservation && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">预约编号：</span>
                {viewReservation.id}
              </div>
              <div>
                <span className="text-gray-500">状态：</span>
                {getStatusConfig(viewReservation.status).text}
              </div>
              <div>
                <span className="text-gray-500">客户：</span>
                {viewReservation.userName}
              </div>
              <div>
                <span className="text-gray-500">手机号：</span>
                {viewReservation.customerPhone || '-'}
              </div>
              <div>
                <span className="text-gray-500">门店：</span>
                {viewReservation.storeName}
              </div>
              <div>
                <span className="text-gray-500">美容师：</span>
                {viewReservation.beauticianName}
              </div>
              <div>
                <span className="text-gray-500">项目：</span>
                {viewReservation.projectName}
              </div>
              <div>
                <span className="text-gray-500">预约时间：</span>
                {viewReservation.appointmentTime}
              </div>
              <div className="col-span-2">
                <span className="text-gray-500">备注：</span>
                {viewReservation.remark || '-'}
              </div>
            </div>
          )}
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setViewReservation(null)}>
              关闭
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingReservation} onOpenChange={(open) => !open && setEditingReservation(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>修改预约</DialogTitle>
          </DialogHeader>
          {editingReservation && (
            <div className="space-y-4">
              <label className="block text-sm">
                <span className="mb-1 block text-gray-600">预约时间</span>
                <Input
                  type="datetime-local"
                  value={toDatetimeLocalValue(editingReservation.appointmentTime)}
                  onChange={(event) =>
                    setEditingReservation({
                      ...editingReservation,
                      appointmentTime: event.target.value.replace('T', ' ') + ':00',
                    })
                  }
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-gray-600">项目</span>
                <select
                  className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={getProjectSelectValue(editingReservation, editingProjectOptions)}
                  onChange={(event) => {
                    const selectedProject = editingProjectOptions.find(
                      (project) => String(project.id) === event.target.value,
                    );
                    setEditingReservation({
                      ...editingReservation,
                      projectId: selectedProject?.id || undefined,
                      projectName: selectedProject?.name || event.target.value,
                    });
                  }}
                  disabled={projectsLoading}
                >
                  {projectsLoading ? (
                    <option value={editingReservation.projectName}>项目加载中...</option>
                  ) : (
                    editingProjectOptions.map((project) => (
                      <option
                        key={`${project.storeName}-${project.id}-${project.name}`}
                        value={project.id ? String(project.id) : project.name}
                      >
                        {project.name}
                        {project.storeName ? ` / ${project.storeName}` : ''}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-gray-600">美容师</span>
                <select
                  className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={getBeauticianSelectValue(editingReservation, editingBeauticianOptions)}
                  onChange={(event) => {
                    const selectedBeautician = editingBeauticianOptions.find(
                      (beautician) =>
                        String(beautician.id) === event.target.value || beautician.name === event.target.value,
                    );
                    setEditingReservation({
                      ...editingReservation,
                      beauticianId: selectedBeautician?.id || undefined,
                      beauticianName: selectedBeautician?.name || '',
                    });
                  }}
                  disabled={beauticiansLoading}
                >
                  <option value="">待分配</option>
                  {beauticiansLoading ? (
                    <option value={editingReservation.beauticianName}>美容师加载中...</option>
                  ) : (
                    editingBeauticianOptions.map((beautician) => (
                      <option
                        key={`${beautician.storeName}-${beautician.id}-${beautician.name}`}
                        value={beautician.id ? String(beautician.id) : beautician.name}
                      >
                        {beautician.name}
                        {beautician.level ? ` / ${beautician.level}` : ''}
                        {beautician.storeName ? ` / ${beautician.storeName}` : ''}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-gray-600">备注</span>
                <textarea
                  className="min-h-20 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={editingReservation.remark || ''}
                  onChange={(event) => setEditingReservation({ ...editingReservation, remark: event.target.value })}
                />
              </label>
            </div>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setEditingReservation(null)}>
              取消
            </Button>
            <Button
              onClick={() => void handleSaveEdit()}
              disabled={!editingReservation || actionLoadingId === editingReservation.id}
            >
              {actionLoadingId === editingReservation?.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              保存修改
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
