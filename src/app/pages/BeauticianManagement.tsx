import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, RotateCcw, Edit, Plus, Loader2 } from 'lucide-react';
import { Input, Button, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/UI';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { beauticianSchema, type BeauticianFormData, type BeauticianFormInput } from '@/schemas/beautician';
import { getBeauticians, createBeautician, updateBeautician } from '@/api/beautician';
import { getProjects } from '@/api/project';
import { getUsers } from '@/api/user';
import { useStoreStore } from '@/stores/storeStore';
import { toast } from 'sonner';
import type { Beautician, Project, SystemUser } from '@/types';

export function BeauticianManagement() {
  const stores = useStoreStore((state) => state.stores);
  const currentStoreId = useStoreStore((state) => state.currentStoreId);
  const loadStores = useStoreStore((state) => state.loadStores);
  const [searchStoreId, setSearchStoreId] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [jumpToPage, setJumpToPage] = useState('');

  const [beauticians, setBeauticians] = useState<Beautician[]>([]);
  const [systemUsers, setSystemUsers] = useState<SystemUser[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editingBeautician, setEditingBeautician] = useState<Beautician | null>(null);

  const totalRecords = beauticians.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));

  const { register, handleSubmit, formState: { errors, isSubmitting }, reset, setValue, control } = useForm<BeauticianFormInput, unknown, BeauticianFormData>({
    resolver: zodResolver(beauticianSchema),
    defaultValues: {
      status: '在职',
      specialties: [],
      storeName: '',
    },
  });
  const selectedStoreName = useWatch({ control, name: 'storeName' });
  const watchedSpecialties = useWatch({ control, name: 'specialties' });
  const selectedSpecialties = useMemo(() => watchedSpecialties ?? [], [watchedSpecialties]);

  const availableStores = useMemo(
    () => stores.filter((store) => store.status !== 'inactive' && store.status !== 'disabled'),
    [stores],
  );

  const defaultStoreName = useMemo(() => {
    const currentStore = currentStoreId ? availableStores.find((store) => store.id === currentStoreId) : undefined;
    return currentStore?.name || availableStores[0]?.name || '';
  }, [availableStores, currentStoreId]);

  const projectSpecialtyOptions = useMemo(() => {
    const activeProjects = projects.filter((project) => project.status);
    const scopedProjects = selectedStoreName
      ? activeProjects.filter((project) => !project.storeName || project.storeName === selectedStoreName)
      : activeProjects;
    return [...new Set(scopedProjects.map((project) => project.name).filter(Boolean))];
  }, [projects, selectedStoreName]);

  const boundUserIds = useMemo(
    () =>
      new Set(
        beauticians
          .map((beautician) => beautician.userId)
          .filter((userId): userId is number => Boolean(userId) && userId !== editingBeautician?.userId),
      ),
    [beauticians, editingBeautician?.userId],
  );

  const beauticianUsers = useMemo(
    () =>
      systemUsers.filter(
        (user) =>
          user.status !== '禁用' &&
          (user.roles.includes('beautician') || user.primaryRole === 'beautician') &&
          !boundUserIds.has(user.id),
      ),
    [boundUserIds, systemUsers],
  );

  const systemUserRegistration = register('userId');

  const loadBeauticians = useCallback(async () => {
    try {
      const data = await getBeauticians();
      setBeauticians(data);
    } catch {
      toast.error('加载美容师列表失败');
    }
  }, []);

  useEffect(() => {
    loadBeauticians();
  }, [loadBeauticians]);

  useEffect(() => {
    loadStores().catch(() => toast.error('加载门店列表失败'));
  }, [loadStores]);

  useEffect(() => {
    getUsers()
      .then(setSystemUsers)
      .catch(() => toast.error('加载系统用户失败'));
  }, []);

  useEffect(() => {
    getProjects()
      .then(setProjects)
      .catch(() => toast.error('加载项目列表失败'));
  }, []);

  useEffect(() => {
    if (!showDialog || editingBeautician || !defaultStoreName) return;
    setValue('storeName', defaultStoreName, { shouldValidate: true });
  }, [defaultStoreName, editingBeautician, setValue, showDialog]);

  useEffect(() => {
    if (!showDialog || projects.length === 0) return;
    const allowed = new Set(projectSpecialtyOptions);
    const nextSpecialties = selectedSpecialties.filter((item) => allowed.has(item));
    if (nextSpecialties.length !== selectedSpecialties.length) {
      setValue('specialties', nextSpecialties, { shouldValidate: true });
    }
  }, [projectSpecialtyOptions, projects.length, selectedSpecialties, setValue, showDialog]);

  const handleSelectSystemUser = (userId: string) => {
    if (!userId) {
      setValue('userId', undefined);
      setValue('name', '', { shouldValidate: true });
      setValue('phone', '', { shouldValidate: true });
      return;
    }
    const user = systemUsers.find((item) => item.id === Number(userId));
    if (!user) return;
    setValue('userId', user.id, { shouldValidate: true });
    setValue('name', user.name, { shouldValidate: true });
    setValue('phone', user.phone, { shouldValidate: true });
    const matchedStore = availableStores.find((store) => user.storeIds.includes(store.id));
    setValue('storeName', matchedStore?.name || defaultStoreName, { shouldValidate: true });
  };

  const onSubmit = async (data: BeauticianFormData) => {
    const selectedUser = systemUsers.find((item) => item.id === Number(data.userId));
    if (!selectedUser) {
      toast.error('请选择系统管理-用户管理中的美容师角色用户');
      return;
    }

    const payload = {
      ...data,
      userId: selectedUser.id,
      name: selectedUser.name,
      phone: selectedUser.phone,
    };

    try {
      if (editingBeautician) {
        await updateBeautician(editingBeautician.id, payload);
        toast.success('美容师更新成功');
      } else {
        await createBeautician(payload);
        toast.success('美容师创建成功');
      }
      handleCloseDialog();
      loadBeauticians();
    } catch (err: any) {
      toast.error(err?.message || (editingBeautician ? '更新美容师失败' : '创建美容师失败'));
    }
  };

  const handleOpenAdd = () => {
    setEditingBeautician(null);
    reset({ userId: undefined, name: '', phone: '', status: '在职', specialties: [], storeName: defaultStoreName });
    setShowDialog(true);
  };

  const handleOpenEdit = (beautician: Beautician) => {
    setEditingBeautician(beautician);
    const storeName = availableStores.some((store) => store.name === beautician.storeName)
      ? beautician.storeName
      : defaultStoreName;
    reset({
      userId: beautician.userId,
      name: beautician.name,
      phone: beautician.phone,
      level: beautician.level,
      specialties: beautician.specialties,
      status: beautician.status,
      storeName,
      joinDate: beautician.joinDate,
    });
    setShowDialog(true);
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setEditingBeautician(null);
    reset();
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === beauticians.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(beauticians.map(b => b.id));
    }
  };

  const toggleSelect = (id: number) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(selectedId => selectedId !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleReset = () => {
    setSearchStoreId('');
  };

  const toggleSpecialty = (projectName: string, checked: boolean) => {
    const nextValues = checked
      ? [...selectedSpecialties, projectName]
      : selectedSpecialties.filter((item) => item !== projectName);
    setValue('specialties', [...new Set(nextValues)], { shouldValidate: true });
  };

  const handleJumpToPage = () => {
    const pageNum = parseInt(jumpToPage);
    if (pageNum >= 1 && pageNum <= totalPages) {
      setCurrentPage(pageNum);
      setJumpToPage('');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <span>首页</span>
        <span>/</span>
        <span>门店管理</span>
        <span>/</span>
        <span className="text-gray-800">美容师管理</span>
      </div>

      <h1 className="text-xl font-semibold text-gray-800 border-b border-gray-100 pb-4">美容师管理</h1>

      {/* Search Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 whitespace-nowrap">门店ID</label>
          <Input
            placeholder="请输入门店ID"
            className="w-48"
            value={searchStoreId}
            onChange={(e) => setSearchStoreId(e.target.value)}
          />
        </div>
        <Button className="gap-2 bg-[#1890ff]">
          <Search className="w-4 h-4" /> 搜索
        </Button>
        <Button variant="outline" className="gap-2" onClick={handleReset}>
          <RotateCcw className="w-4 h-4" /> 重置
        </Button>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button variant="default" className="gap-2 bg-[#1890ff]" onClick={handleOpenAdd}>
          <Plus className="w-4 h-4" /> 从用户添加
        </Button>
        <Button variant="default" className="gap-2 bg-[#1890ff]">
          <Edit className="w-4 h-4" /> 编辑
        </Button>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50/80">
            <TableHead className="w-12 text-center">
              <input
                type="checkbox"
                className="rounded border-gray-300"
                checked={selectedIds.length === beauticians.length && beauticians.length > 0}
                onChange={toggleSelectAll}
              />
            </TableHead>
            <TableHead>ID</TableHead>
            <TableHead>美容师</TableHead>
            <TableHead>手机号</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>美容师等级</TableHead>
            <TableHead>所属门店</TableHead>
            <TableHead>入职日期</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {beauticians.map((beautician) => (
            <TableRow key={beautician.id} className="hover:bg-blue-50/30">
              <TableCell className="text-center">
                <input
                  type="checkbox"
                  className="rounded border-gray-300"
                  checked={selectedIds.includes(beautician.id)}
                  onChange={() => toggleSelect(beautician.id)}
                />
              </TableCell>
              <TableCell className="font-medium text-gray-700">{beautician.id}</TableCell>
              <TableCell>{beautician.name}</TableCell>
              <TableCell>{beautician.phone}</TableCell>
              <TableCell>
                <span className={`inline-flex px-3 py-1 text-sm rounded ${
                  beautician.status === '在职'
                    ? 'bg-green-100 text-green-700'
                    : beautician.status === '休假'
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {beautician.status}
                </span>
              </TableCell>
              <TableCell>{beautician.level}</TableCell>
              <TableCell>{beautician.storeName}</TableCell>
              <TableCell className="text-gray-600">{beautician.joinDate}</TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-3 text-sm">
                  <button className="text-blue-500 hover:text-blue-600" onClick={() => handleOpenEdit(beautician)}>
                    编辑
                  </button>
                  <button className="text-blue-500 hover:text-blue-600">
                    设置等级
                  </button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Pagination */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">共 {totalRecords} 条</span>
          <select
            className="h-9 px-3 rounded-md border border-gray-300 bg-white text-sm"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
          >
            <option value={10}>10条/页</option>
            <option value={20}>20条/页</option>
            <option value={50}>50条/页</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} className="px-3 py-1.5 text-sm rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed">&lt;</button>
          <button onClick={() => setCurrentPage(1)} className={`px-3 py-1.5 text-sm rounded transition-colors ${currentPage === 1 ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-300'}`}>1</button>
          <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} className="px-3 py-1.5 text-sm rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed">&gt;</button>
          <div className="flex items-center gap-2 ml-2">
            <span className="text-sm text-gray-600">前往</span>
            <Input type="number" className="w-16 text-center" value={jumpToPage} onChange={(e) => setJumpToPage(e.target.value)} onKeyPress={(e) => { if (e.key === 'Enter') handleJumpToPage(); }} />
            <span className="text-sm text-gray-600">页</span>
          </div>
        </div>
      </div>

      {/* Add/Edit Beautician Dialog */}
      <Dialog open={showDialog} onOpenChange={handleCloseDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" aria-describedby="beautician-dialog-description">
          <DialogHeader>
            <DialogTitle>{editingBeautician ? '编辑美容师' : '从系统用户添加美容师'}</DialogTitle>
          </DialogHeader>
          <span id="beautician-dialog-description" className="sr-only">{editingBeautician ? '编辑美容师信息' : '从系统管理-用户管理中选择美容师角色用户创建美容师档案'}</span>
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  系统用户 <span className="text-red-500">*</span>
                </label>
                <select
                  className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md"
                  {...systemUserRegistration}
                  onChange={(event) => {
                    systemUserRegistration.onChange(event);
                    handleSelectSystemUser(event.target.value);
                  }}
                >
                  <option value="">请选择系统用户</option>
                  {beauticianUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}（{user.username}）
                    </option>
                  ))}
                </select>
                {beauticianUsers.length === 0 && <p className="text-amber-600 text-xs mt-1">请先在系统管理-用户管理创建未绑定的美容师角色用户</p>}
                {errors.userId && <p className="text-red-500 text-xs mt-1">{errors.userId.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  姓名 <span className="text-red-500">*</span>
                </label>
                <Input placeholder="选择系统用户后自动带出" {...register('name')} readOnly />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  手机号码 <span className="text-red-500">*</span>
                </label>
                <Input placeholder="选择系统用户后自动带出" {...register('phone')} readOnly />
                {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  技师等级 <span className="text-red-500">*</span>
                </label>
                <select className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md" {...register('level')}>
                  <option value="">请选择等级</option>
                  <option value="初级美容师">初级美容师</option>
                  <option value="中级美容师">中级美容师</option>
                  <option value="高级美容师">高级美容师</option>
                  <option value="店长顾问">店长顾问</option>
                </select>
                {errors.level && <p className="text-red-500 text-xs mt-1">{errors.level.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  状态 <span className="text-red-500">*</span>
                </label>
                <select className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md" {...register('status')}>
                  <option value="在职">在职</option>
                  <option value="休假">休假</option>
                  <option value="离职">离职</option>
                </select>
                {errors.status && <p className="text-red-500 text-xs mt-1">{errors.status.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  所属门店 <span className="text-red-500">*</span>
                </label>
                <select className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md" {...register('storeName')}>
                  <option value="">请选择门店</option>
                  {availableStores.map((store) => (
                    <option key={store.id} value={store.name}>
                      {store.name}
                    </option>
                  ))}
                </select>
                {availableStores.length === 0 && <p className="text-amber-600 text-xs mt-1">暂无可用门店，请先检查门店管理</p>}
                {errors.storeName && <p className="text-red-500 text-xs mt-1">{errors.storeName.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  入职日期 <span className="text-red-500">*</span>
                </label>
                <Input type="date" {...register('joinDate')} />
                {errors.joinDate && <p className="text-red-500 text-xs mt-1">{errors.joinDate.message}</p>}
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  专长 <span className="text-red-500">*</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {projectSpecialtyOptions.map((projectName) => (
                    <label key={projectName} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        value={projectName}
                        checked={selectedSpecialties.includes(projectName)}
                        className="rounded border-gray-300"
                        onChange={(e) => toggleSpecialty(projectName, e.target.checked)}
                      />
                      {projectName}
                    </label>
                  ))}
                </div>
                {projectSpecialtyOptions.length === 0 && (
                  <p className="text-amber-600 text-xs mt-1">当前门店暂无可绑定项目，请先在项目管理中新增项目</p>
                )}
                {errors.specialties && <p className="text-red-500 text-xs mt-1">{errors.specialties.message}</p>}
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <Button type="button" variant="outline" onClick={handleCloseDialog}>取消</Button>
              <Button
                type="submit"
                disabled={isSubmitting || beauticianUsers.length === 0 || availableStores.length === 0 || projectSpecialtyOptions.length === 0}
              >
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingBeautician ? '保存' : '确认添加'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
