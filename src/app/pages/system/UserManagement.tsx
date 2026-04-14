import { useState, useMemo } from 'react';
import { Plus, Search, Shield, Loader2 } from 'lucide-react';
import { Button, Input, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../../components/UI';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { userSchema, type UserFormData } from '@/schemas/system';
import { getUsersPaginated, createUser, updateUser } from '@/api/user';
import { usePagination } from '@/hooks/usePagination';
import { toast } from 'sonner';
import type { SystemUser } from '@/types';

const ROLES = ['超级管理员', '门店管理员', '收银员', '美容师', '库存管理员'];
const STORES = [
  { id: 1, name: '心悦美容养生会所' },
  { id: 2, name: '凤仪阁美容养生会所' },
  { id: 3, name: '雅韵美容会所' },
];

export function UserManagement() {
  const [keyword, setKeyword] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [dialogMode, setDialogMode] = useState<'add' | 'edit'>('add');
  const [selectedUser, setSelectedUser] = useState<SystemUser | null>(null);

  const filters = useMemo(() => ({}), []);
  const { data: users, total, page, pageSize, loading, setPage, setPageSize, refresh } = usePagination<SystemUser>(getUsersPaginated, filters);

  const { register, handleSubmit, formState: { errors, isSubmitting }, reset, setValue, watch } = useForm<UserFormData>({
    resolver: zodResolver(userSchema),
    defaultValues: { roles: [], storeIds: [] },
  });

  const filtered = users.filter((u) => {
    if (keyword && !u.name.includes(keyword) && !u.username.includes(keyword) && !u.phone.includes(keyword)) return false;
    if (roleFilter && !u.roles.includes(roleFilter)) return false;
    if (statusFilter && u.status !== statusFilter) return false;
    return true;
  });

  const handleAdd = () => {
    setDialogMode('add');
    setSelectedUser(null);
    reset({ username: '', name: '', phone: '', email: '', roles: [], storeIds: [], password: '' });
    setShowDialog(true);
  };

  const handleEdit = (user: SystemUser) => {
    setDialogMode('edit');
    setSelectedUser(user);
    reset({
      username: user.username,
      name: user.name,
      phone: user.phone,
      email: user.email,
      roles: user.roles,
      storeIds: user.storeIds,
    });
    setShowDialog(true);
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setSelectedUser(null);
    reset();
  };

  const onSubmit = async (data: UserFormData) => {
    try {
      if (dialogMode === 'edit' && selectedUser) {
        await updateUser(selectedUser.id, {
          username: data.username,
          name: data.name,
          phone: data.phone,
          email: data.email || '',
          roles: data.roles,
          storeIds: data.storeIds,
        });
        toast.success('用户更新成功');
      } else {
        await createUser({
          username: data.username,
          name: data.name,
          phone: data.phone,
          email: data.email || '',
          roles: data.roles,
          storeIds: data.storeIds,
        });
        toast.success('用户创建成功');
      }
      handleCloseDialog();
      refresh();
    } catch (err: any) {
      toast.error(err?.message || (dialogMode === 'edit' ? '更新用户失败' : '创建用户失败'));
    }
  };

  const watchedRoles = watch('roles');
  const watchedStoreIds = watch('storeIds');

  const handleRoleToggle = (role: string) => {
    const current = watchedRoles || [];
    const next = current.includes(role) ? current.filter((r: string) => r !== role) : [...current, role];
    setValue('roles', next, { shouldValidate: true });
  };

  const handleStoreToggle = (storeId: number) => {
    const current = watchedStoreIds || [];
    const next = current.includes(storeId) ? current.filter((id: number) => id !== storeId) : [...current, storeId];
    setValue('storeIds', next, { shouldValidate: true });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="text-sm text-gray-500">首页 / 系统设置 / 用户管理</div>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">用户管理</h2>
        <Button className="gap-2" onClick={handleAdd}><Plus className="w-4 h-4" /> 新增用户</Button>
      </div>

      {/* 统计 */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
          <div className="text-sm text-blue-600 mb-1">总用户数</div>
          <div className="text-2xl font-bold text-blue-900">{users.length}</div>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4">
          <div className="text-sm text-green-600 mb-1">已启用</div>
          <div className="text-2xl font-bold text-green-900">{users.filter(u => u.status === '启用').length}</div>
        </div>
        <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4">
          <div className="text-sm text-orange-600 mb-1">已禁用</div>
          <div className="text-2xl font-bold text-orange-900">{users.filter(u => u.status === '禁用').length}</div>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4">
          <div className="text-sm text-purple-600 mb-1">角色数</div>
          <div className="text-2xl font-bold text-purple-900">{ROLES.length}</div>
        </div>
      </div>

      {/* 筛选 */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input className="pl-9" placeholder="搜索用户名、姓名、手机号" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        </div>
        <select className="h-9 px-3 text-sm border border-gray-300 rounded-md" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">全部角色</option>
          {ROLES.map(r => <option key={r}>{r}</option>)}
        </select>
        <select className="h-9 px-3 text-sm border border-gray-300 rounded-md" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">全部状态</option>
          <option>启用</option>
          <option>禁用</option>
        </select>
      </div>

      {/* 表格 */}
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
            <TableHead>用户名</TableHead>
            <TableHead>姓名</TableHead>
            <TableHead>手机号</TableHead>
            <TableHead>角色</TableHead>
            <TableHead>所属门店</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>最后登录</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((user) => (
            <TableRow key={user.id} className="hover:bg-blue-50/30">
              <TableCell className="font-mono text-sm text-gray-700">{user.username}</TableCell>
              <TableCell className="font-medium text-gray-800">{user.name}</TableCell>
              <TableCell className="text-gray-600">{user.phone}</TableCell>
              <TableCell>
                {user.roles.map((role: string) => (
                  <span key={role} className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium mr-1 ${
                    role === '超级管理员' ? 'bg-red-100 text-red-700' :
                    role === '门店管理员' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    <Shield className="w-3 h-3" />{role}
                  </span>
                ))}
              </TableCell>
              <TableCell className="text-sm text-gray-600">
                {user.storeIds.length === 0 ? '全部门店' : user.storeIds.map((id: number) => STORES.find(s => s.id === id)?.name).filter(Boolean).join(', ')}
              </TableCell>
              <TableCell>
                <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${user.status === '启用' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {user.status}
                </span>
              </TableCell>
              <TableCell className="text-sm text-gray-500">{user.lastLogin}</TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <button onClick={() => handleEdit(user)} className="text-blue-500 hover:text-blue-600 text-sm">编辑</button>
                  {!user.roles.includes('超级管理员') && (<><span className="text-gray-300">|</span><button className="text-red-500 hover:text-red-600 text-sm">删除</button></>)}
                </div>
              </TableCell>
            </TableRow>
          ))}
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

      {/* 新增/编辑弹窗 */}
      <Dialog open={showDialog} onOpenChange={handleCloseDialog}>
        <DialogContent className="max-w-lg" aria-describedby="user-dialog-desc">
          <DialogHeader><DialogTitle>{dialogMode === 'add' ? '新增用户' : `编辑用户 — ${selectedUser?.name}`}</DialogTitle></DialogHeader>
          <span id="user-dialog-desc" className="sr-only">{dialogMode === 'add' ? '创建新系统用户' : '编辑系统用户信息'}</span>
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">用户名 <span className="text-red-500">*</span></label>
                  <Input placeholder="请输入用户名" {...register('username')} />
                  {errors.username && <p className="text-red-500 text-xs mt-1">{errors.username.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">姓名 <span className="text-red-500">*</span></label>
                  <Input placeholder="请输入姓名" {...register('name')} />
                  {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">手机号 <span className="text-red-500">*</span></label>
                  <Input placeholder="请输入手机号" {...register('phone')} />
                  {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
                  <Input placeholder="请输入邮箱" {...register('email')} />
                  {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
                </div>
              </div>
              {dialogMode === 'add' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">初始密码 <span className="text-red-500">*</span></label>
                  <Input type="password" placeholder="请输入初始密码（至少6位）" {...register('password')} />
                  {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">角色 <span className="text-red-500">*</span></label>
                <div className="flex flex-wrap gap-2">
                  {ROLES.map((role) => (
                    <label key={role} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded"
                        checked={watchedRoles?.includes(role) || false}
                        onChange={() => handleRoleToggle(role)}
                      />
                      <span className="text-sm text-gray-700">{role}</span>
                    </label>
                  ))}
                </div>
                {errors.roles && <p className="text-red-500 text-xs mt-1">{errors.roles.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">所属门店 <span className="text-red-500">*</span></label>
                <div className="flex flex-wrap gap-2">
                  {STORES.map((store) => (
                    <label key={store.id} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded"
                        checked={watchedStoreIds?.includes(store.id) || false}
                        onChange={() => handleStoreToggle(store.id)}
                      />
                      <span className="text-sm text-gray-700">{store.name}</span>
                    </label>
                  ))}
                </div>
                {errors.storeIds && <p className="text-red-500 text-xs mt-1">{errors.storeIds.message}</p>}
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button type="button" variant="outline" onClick={handleCloseDialog}>取消</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {dialogMode === 'add' ? '创建' : '保存'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
