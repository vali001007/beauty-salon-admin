import { useState, useEffect, useCallback } from 'react';
import { Search, RotateCcw, Edit, Plus, Loader2 } from 'lucide-react';
import { Input, Button, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/UI';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { beauticianSchema, type BeauticianFormData, type BeauticianFormInput } from '@/schemas/beautician';
import { getBeauticians, createBeautician, updateBeautician } from '@/api/beautician';
import { getUsers } from '@/api/user';
import { toast } from 'sonner';
import type { Beautician, SystemUser } from '@/types';

const USER_STORE_NAMES: Record<number, string> = {
  1: '凤仪阁美容养生会所',
  2: '心悦美容养生会所',
  3: '兰亭美容SPA馆',
  4: '心悦茗美容养生会所',
};

export function BeauticianManagement() {
  const [searchStoreId, setSearchStoreId] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [jumpToPage, setJumpToPage] = useState('');

  const [beauticians, setBeauticians] = useState<Beautician[]>([]);
  const [systemUsers, setSystemUsers] = useState<SystemUser[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editingBeautician, setEditingBeautician] = useState<Beautician | null>(null);

  const totalRecords = beauticians.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));

  const { register, handleSubmit, formState: { errors, isSubmitting }, reset, setValue } = useForm<BeauticianFormInput, unknown, BeauticianFormData>({
    resolver: zodResolver(beauticianSchema),
    defaultValues: {
      status: '在职',
      specialties: [],
      storeName: '心悦茗美容养生会所',
    },
  });

  const beauticianUsers = systemUsers.filter((user) => user.roles.includes('beautician') || user.primaryRole === 'beautician');

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
    getUsers()
      .then(setSystemUsers)
      .catch(() => toast.error('加载系统用户失败'));
  }, []);

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
    const storeName = USER_STORE_NAMES[user.storeIds[0]];
    if (storeName) setValue('storeName', storeName, { shouldValidate: true });
  };

  const onSubmit = async (data: BeauticianFormData) => {
    try {
      if (editingBeautician) {
        await updateBeautician(editingBeautician.id, data);
        toast.success('美容师更新成功');
      } else {
        await createBeautician(data);
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
    reset({ userId: undefined, name: '', phone: '', status: '在职', specialties: [], storeName: '心悦茗美容养生会所' });
    setShowDialog(true);
  };

  const handleOpenEdit = (beautician: Beautician) => {
    setEditingBeautician(beautician);
    reset({
      userId: beautician.userId,
      name: beautician.name,
      phone: beautician.phone,
      level: beautician.level,
      specialties: beautician.specialties,
      status: beautician.status,
      storeName: beautician.storeName,
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
          <Plus className="w-4 h-4" /> 新增
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
            <DialogTitle>{editingBeautician ? '编辑美容师' : '新增美容师'}</DialogTitle>
          </DialogHeader>
          <span id="beautician-dialog-description" className="sr-only">{editingBeautician ? '编辑美容师信息' : '创建新美容师'}</span>
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  姓名 <span className="text-red-500">*</span>
                </label>
                <select
                  className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md"
                  {...register('userId')}
                  onChange={(event) => handleSelectSystemUser(event.target.value)}
                >
                  <option value="">请选择系统用户</option>
                  {beauticianUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}（{user.username}）
                    </option>
                  ))}
                </select>
                <input type="hidden" {...register('name')} />
                {beauticianUsers.length === 0 && <p className="text-amber-600 text-xs mt-1">请先在系统管理-用户管理创建美容师角色用户</p>}
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
                  <option value="心悦茗美容养生会所">心悦茗美容养生会所</option>
                  <option value="凤仪阁美容养生会所">凤仪阁美容养生会所</option>
                </select>
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
                  {['面部护理', '身体养生', '中医养生', '仪器护理', '美甲', '美发'].map((specialty) => (
                    <label key={specialty} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        value={specialty}
                        className="rounded border-gray-300 specialty-checkbox"
                        onChange={(e) => {
                          const currentForm = document.querySelectorAll<HTMLInputElement>('.specialty-checkbox:checked');
                          const values: string[] = [];
                          currentForm.forEach(el => values.push(el.value));
                          if (e.target.checked && !values.includes(specialty)) {
                            values.push(specialty);
                          }
                          setValue('specialties', [...new Set(values)], { shouldValidate: true });
                        }}
                      />
                      {specialty}
                    </label>
                  ))}
                </div>
                {errors.specialties && <p className="text-red-500 text-xs mt-1">{errors.specialties.message}</p>}
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <Button type="button" variant="outline" onClick={handleCloseDialog}>取消</Button>
              <Button type="submit" disabled={isSubmitting}>
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
