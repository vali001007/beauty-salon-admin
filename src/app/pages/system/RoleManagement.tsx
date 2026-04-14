import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit, Trash2, Shield, Users, Loader2 } from 'lucide-react';
import { Button } from '../../components/UI';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { roleSchema, type RoleFormData } from '@/schemas/system';
import { getRoles, createRole, updateRole } from '@/api/role';
import { toast } from 'sonner';
import type { Role } from '@/types';

const PERMISSION_GROUPS = [
  { group: '仪表盘', permissions: ['dashboard:view'] },
  { group: '客户管理', permissions: ['customer:view', 'customer:create', 'customer:edit', 'customer:delete', 'customer:export'] },
  { group: '智能营销', permissions: ['marketing:view', 'marketing:create', 'marketing:edit', 'marketing:delete'] },
  { group: '门店管理', permissions: ['store:view', 'store:project:manage', 'store:beautician:manage', 'store:schedule:manage', 'store:reservation:manage'] },
  { group: '商品管理', permissions: ['goods:view', 'goods:create', 'goods:edit', 'goods:delete'] },
  { group: '订单管理', permissions: ['order:view', 'order:create', 'order:edit', 'order:refund'] },
  { group: '库存管理', permissions: ['inventory:view', 'inventory:inbound', 'inventory:outbound', 'inventory:purchase', 'inventory:transfer'] },
  { group: '系统设置', permissions: ['system:user:manage', 'system:role:manage', 'system:store:manage', 'system:log:view'] },
];

const LABEL_MAP: Record<string, string> = {
  view: '查看', create: '新增', edit: '编辑', delete: '删除', export: '导出',
  manage: '管理', inbound: '入库', outbound: '出库', purchase: '采购',
  transfer: '调拨', refund: '退款',
};

export function RoleManagement() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [dialogMode, setDialogMode] = useState<'add' | 'edit'>('add');

  const { register, handleSubmit, formState: { errors, isSubmitting }, reset, setValue, watch } = useForm<RoleFormData>({
    resolver: zodResolver(roleSchema),
    defaultValues: { permissions: [] },
  });

  const watchedPermissions = watch('permissions');

  const loadRoles = useCallback(async () => {
    try {
      const data = await getRoles();
      setRoles(data);
      if (data.length > 0 && !selectedRole) setSelectedRole(data[0]);
    } catch {
      toast.error('加载角色列表失败');
    }
  }, []);

  useEffect(() => { loadRoles(); }, [loadRoles]);

  const handleAdd = () => {
    setDialogMode('add');
    reset({ name: '', code: '', description: '', permissions: [] });
    setShowDialog(true);
  };

  const handleEdit = (role: Role) => {
    setDialogMode('edit');
    setSelectedRole(role);
    reset({
      name: role.name,
      code: role.code,
      description: role.description,
      permissions: role.permissions,
    });
    setShowDialog(true);
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    reset();
  };

  const onSubmit = async (data: RoleFormData) => {
    try {
      if (dialogMode === 'edit' && selectedRole) {
        await updateRole(selectedRole.id, {
          name: data.name,
          code: data.code,
          description: data.description,
          permissions: data.permissions,
        });
        toast.success('角色更新成功');
      } else {
        await createRole({
          name: data.name,
          code: data.code,
          description: data.description,
          permissions: data.permissions,
          isSystem: false,
          userCount: 0,
        });
        toast.success('角色创建成功');
      }
      handleCloseDialog();
      loadRoles();
    } catch (err: any) {
      toast.error(err?.message || (dialogMode === 'edit' ? '更新角色失败' : '创建角色失败'));
    }
  };

  const handlePermissionToggle = (perm: string) => {
    const current = watchedPermissions || [];
    const next = current.includes(perm) ? current.filter((p: string) => p !== perm) : [...current, perm];
    setValue('permissions', next, { shouldValidate: true });
  };

  const handleGroupToggle = (groupPerms: string[]) => {
    const current = watchedPermissions || [];
    const allChecked = groupPerms.every((p) => current.includes(p));
    const next = allChecked
      ? current.filter((p: string) => !groupPerms.includes(p))
      : [...new Set([...current, ...groupPerms])];
    setValue('permissions', next, { shouldValidate: true });
  };

  const getRoleColor = (code: string) => {
    switch (code) {
      case 'super_admin': return 'from-red-500 to-pink-500';
      case 'store_manager': return 'from-blue-500 to-indigo-500';
      case 'cashier': return 'from-green-500 to-emerald-500';
      case 'beautician': return 'from-purple-500 to-violet-500';
      default: return 'from-gray-500 to-slate-500';
    }
  };

  const displayRole = selectedRole || roles[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="text-sm text-gray-500">首页 / 系统设置 / 角色管理</div>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">角色管理</h2>
        <Button className="gap-2" onClick={handleAdd}><Plus className="w-4 h-4" /> 新增角色</Button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* 左侧角色列表 */}
        <div className="col-span-1 space-y-3">
          {roles.map((role) => (
            <div
              key={role.id}
              onClick={() => setSelectedRole(role)}
              className={`border rounded-lg p-4 cursor-pointer transition-all ${displayRole?.id === role.id ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${getRoleColor(role.code)} flex items-center justify-center`}>
                    <Shield className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <div className="font-medium text-gray-800">{role.name}</div>
                    <div className="text-xs text-gray-500">{role.code}</div>
                  </div>
                </div>
                {role.isSystem && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">系统</span>}
              </div>
              <div className="text-sm text-gray-600 mb-2">{role.description}</div>
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <Users className="w-3 h-3" /> {role.userCount} 个用户
              </div>
            </div>
          ))}
        </div>

        {/* 右侧权限详情 */}
        {displayRole && (
          <div className="col-span-2 border border-gray-200 rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
              <div>
                <h3 className="font-semibold text-gray-800">{displayRole.name}</h3>
                <p className="text-sm text-gray-500 mt-1">{displayRole.description}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="gap-1" onClick={() => handleEdit(displayRole)}>
                  <Edit className="w-3 h-3" /> 编辑
                </Button>
                {!displayRole.isSystem && (
                  <Button size="sm" variant="outline" className="gap-1 text-red-600 hover:bg-red-50">
                    <Trash2 className="w-3 h-3" /> 删除
                  </Button>
                )}
              </div>
            </div>
            <div className="p-6">
              <h4 className="text-sm font-medium text-gray-700 mb-4">权限配置</h4>
              <div className="space-y-4">
                {PERMISSION_GROUPS.map((group) => {
                  const groupPerms = group.permissions;
                  const activeCount = groupPerms.filter(p => displayRole.permissions.includes(p)).length;
                  const allActive = activeCount === groupPerms.length;
                  return (
                    <div key={group.group} className="border border-gray-100 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-800">{group.group}</span>
                          <span className="text-xs text-gray-400">({activeCount}/{groupPerms.length})</span>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded ${allActive ? 'bg-green-100 text-green-700' : activeCount > 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>
                          {allActive ? '全部权限' : activeCount > 0 ? '部分权限' : '无权限'}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {groupPerms.map((perm) => {
                          const active = displayRole.permissions.includes(perm);
                          const label = perm.split(':').pop() || perm;
                          return (
                            <span key={perm} className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${active ? 'bg-blue-100 text-blue-700' : 'bg-gray-50 text-gray-400 line-through'}`}>
                              {LABEL_MAP[label] || label}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 新增/编辑弹窗 */}
      <Dialog open={showDialog} onOpenChange={handleCloseDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" aria-describedby="role-dialog-desc">
          <DialogHeader><DialogTitle>{dialogMode === 'add' ? '新增角色' : `编辑角色 — ${selectedRole?.name}`}</DialogTitle></DialogHeader>
          <span id="role-dialog-desc" className="sr-only">{dialogMode === 'add' ? '创建新角色并配置权限' : '编辑角色权限配置'}</span>
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">角色名称 <span className="text-red-500">*</span></label>
                  <input className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md" placeholder="请输入角色名称" {...register('name')} />
                  {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">角色编码 <span className="text-red-500">*</span></label>
                  <input className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md" placeholder="如 store_admin" {...register('code')} />
                  {errors.code && <p className="text-red-500 text-xs mt-1">{errors.code.message}</p>}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">描述 <span className="text-red-500">*</span></label>
                <textarea className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md" rows={2} placeholder="请输入角色描述" {...register('description')} />
                {errors.description && <p className="text-red-500 text-xs mt-1">{errors.description.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">权限配置 <span className="text-red-500">*</span></label>
                {errors.permissions && <p className="text-red-500 text-xs mb-2">{errors.permissions.message}</p>}
                {PERMISSION_GROUPS.map((group) => {
                  const allChecked = group.permissions.every((p) => watchedPermissions?.includes(p));
                  return (
                    <div key={group.group} className="mb-3 border border-gray-100 rounded-lg p-3">
                      <label className="flex items-center gap-2 mb-2 cursor-pointer">
                        <input
                          type="checkbox"
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                          checked={allChecked}
                          onChange={() => handleGroupToggle(group.permissions)}
                        />
                        <span className="text-sm font-medium text-gray-800">{group.group}</span>
                      </label>
                      <div className="flex flex-wrap gap-3 pl-6">
                        {group.permissions.map((perm) => {
                          const label = perm.split(':').pop() || perm;
                          return (
                            <label key={perm} className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded"
                                checked={watchedPermissions?.includes(perm) || false}
                                onChange={() => handlePermissionToggle(perm)}
                              />
                              <span className="text-xs text-gray-700">{LABEL_MAP[label] || label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
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
