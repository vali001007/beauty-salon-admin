import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Search, Shield } from 'lucide-react';
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/UI';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import type { Store, SystemUser, SystemUserCreateInput, SystemUserUpdateInput } from '@/types';
import { createUser, getUsersPaginated, updateUser } from '@/api/user';
import { getStores } from '@/api/store';
import { usePagination } from '@/hooks/usePagination';
import { toast } from 'sonner';
import {
  DEFAULT_APPROVAL_SCOPES,
  DEFAULT_DATA_SCOPES,
  DEFAULT_FIELD_SCOPES,
  DEFAULT_PLATFORM_SCOPES,
  ROLE_PERMISSIONS,
  normalizePermissions,
} from '@/config/permissions';

const ROLE_OPTIONS = [
  { code: 'super_admin', name: '超级管理员' },
  { code: 'store_manager', name: '店长' },
  { code: 'cashier', name: '前台/收银' },
  { code: 'beautician', name: '美容师' },
  { code: 'inventory_manager', name: '库存管理员' },
];

interface UserDraft {
  id?: number;
  username: string;
  password: string;
  name: string;
  phone: string;
  email: string;
  primaryRole: string;
  roles: string[];
  storeIds: number[];
  extraPermissionsText: string;
  deniedPermissionsText: string;
}

const createUserDraft = (stores: Store[]): UserDraft => ({
  username: '',
  password: '',
  name: '',
  phone: '',
  email: '',
  primaryRole: 'store_manager',
  roles: ['store_manager'],
  storeIds: stores[0] ? [stores[0].id] : [],
  extraPermissionsText: '',
  deniedPermissionsText: '',
});

const toText = (permissions?: string[]) => (permissions ?? []).join(', ');
const fromText = (text: string) => normalizePermissions(text.split(',').map((item) => item.trim()).filter(Boolean));

export function UserManagement() {
  const [keyword, setKeyword] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [draft, setDraft] = useState<UserDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [stores, setStores] = useState<Store[]>([]);
  const [storesLoading, setStoresLoading] = useState(false);

  const filters = useMemo(() => ({}), []);
  const { data: users, total, page, pageSize, loading, setPage, setPageSize, refresh } = usePagination<SystemUser>(getUsersPaginated, filters);
  const storeNameById = useMemo(() => new Map(stores.map((store) => [store.id, store.name])), [stores]);

  useEffect(() => {
    let active = true;
    setStoresLoading(true);
    getStores()
      .then((items) => {
        if (active) {
          setStores(items);
        }
      })
      .catch((err: any) => {
        if (active) {
          toast.error(err?.message || '加载门店列表失败');
        }
      })
      .finally(() => {
        if (active) {
          setStoresLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const filteredUsers = users.filter((user) => {
    const searchHit =
      !keyword ||
      user.name.includes(keyword) ||
      user.username.includes(keyword) ||
      user.phone.includes(keyword);
    const roleHit = !roleFilter || user.roles.includes(roleFilter) || user.primaryRole === roleFilter;
    return searchHit && roleHit;
  });

  const normalizeStoreIds = (storeIds: number[]) => {
    if (!stores.length) return storeIds;
    return storeIds.filter((id) => storeNameById.has(id));
  };

  const formatStoreScope = (storeIds: number[]) => {
    if (!storeIds.length) return '全部门店';
    return storeIds.map((id) => storeNameById.get(id) ?? `未匹配门店（ID ${id}）`).join('、');
  };

  const openAddDialog = () => setDraft(createUserDraft(stores));

  const openEditDialog = (user: SystemUser) => {
    setDraft({
      id: user.id,
      username: user.username,
      password: '',
      name: user.name,
      phone: user.phone,
      email: user.email,
      primaryRole: user.primaryRole ?? user.roles[0] ?? 'store_manager',
      roles: user.roles,
      storeIds: normalizeStoreIds(user.storeIds ?? []),
      extraPermissionsText: toText(user.extraPermissions),
      deniedPermissionsText: toText(user.deniedPermissions),
    });
  };

  const patchDraft = (patch: Partial<UserDraft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  };

  const toggleRole = (roleCode: string) => {
    if (!draft) return;
    const roles = draft.roles.includes(roleCode)
      ? draft.roles.filter((role) => role !== roleCode)
      : [...draft.roles, roleCode];
    patchDraft({
      roles: roles.length ? roles : [draft.primaryRole],
      primaryRole: roles.includes(draft.primaryRole) ? draft.primaryRole : roles[0] ?? draft.primaryRole,
    });
  };

  const toggleStore = (storeId: number) => {
    if (!draft) return;
    const storeIds = draft.storeIds.includes(storeId)
      ? draft.storeIds.filter((id) => id !== storeId)
      : [...draft.storeIds, storeId];
    patchDraft({ storeIds });
  };

  const saveUser = async () => {
    if (!draft) return;
    if (!draft.username.trim() || !draft.name.trim() || !draft.phone.trim()) {
      toast.error('用户名、姓名和手机号不能为空');
      return;
    }
    if (!draft.id && draft.password.trim().length < 6) {
      toast.error('新增用户必须设置至少 6 位初始密码');
      return;
    }

    const primaryRole = draft.primaryRole || draft.roles[0] || 'store_manager';
    const selectedStoreIds = normalizeStoreIds(draft.storeIds);
    if (primaryRole !== 'super_admin') {
      if (storesLoading) {
        toast.error('门店列表仍在加载，请稍后再保存');
        return;
      }
      if (!stores.length) {
        toast.error('当前没有可用门店，请先创建门店后再分配用户范围');
        return;
      }
      if (!selectedStoreIds.length) {
        toast.error('非超级管理员请至少选择一个门店范围');
        return;
      }
    }

    const rolePermissions = draft.roles.flatMap((role) => ROLE_PERMISSIONS[role] ?? []);
    const extraPermissions = fromText(draft.extraPermissionsText);
    const deniedPermissions = fromText(draft.deniedPermissionsText);
    const payload: SystemUserUpdateInput = {
      username: draft.username,
      name: draft.name,
      phone: draft.phone,
      email: draft.email,
      primaryRole,
      roles: draft.roles,
      extraPermissions: normalizePermissions([...rolePermissions, ...extraPermissions]),
      deniedPermissions,
      storeIds: selectedStoreIds,
      platformScopes: DEFAULT_PLATFORM_SCOPES[primaryRole] ?? { core: true, assist: false, terminal: false },
      dataScopes: DEFAULT_DATA_SCOPES[primaryRole] ?? DEFAULT_DATA_SCOPES.store_manager,
      fieldScopes: DEFAULT_FIELD_SCOPES[primaryRole] ?? DEFAULT_FIELD_SCOPES.store_manager,
      approvalScopes: DEFAULT_APPROVAL_SCOPES[primaryRole] ?? DEFAULT_APPROVAL_SCOPES.store_manager,
    };

    setSaving(true);
    try {
      if (draft.id) {
        await updateUser(draft.id, payload);
        toast.success('用户已更新');
      } else {
        await createUser({ ...payload, password: draft.password.trim() } as SystemUserCreateInput);
        toast.success('用户已创建');
      }
      setDraft(null);
      refresh();
    } catch (err: any) {
      toast.error(err?.message || '保存用户失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="text-sm text-gray-500">首页 / 系统设置 / 用户管理</div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">用户授权管理</h2>
          <p className="text-sm text-gray-500 mt-1">支持主角色、兼任角色、门店范围、额外授权和禁止权限。</p>
        </div>
        <Button className="gap-2" onClick={openAddDialog}><Plus className="w-4 h-4" /> 新增用户</Button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-500">用户数</div>
          <div className="text-2xl font-semibold text-gray-900 mt-1">{users.length}</div>
        </div>
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-500">启用</div>
          <div className="text-2xl font-semibold text-green-700 mt-1">{users.filter((user) => user.status === '启用').length}</div>
        </div>
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-500">禁用</div>
          <div className="text-2xl font-semibold text-gray-700 mt-1">{users.filter((user) => user.status === '禁用').length}</div>
        </div>
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-500">角色模板</div>
          <div className="text-2xl font-semibold text-blue-700 mt-1">{ROLE_OPTIONS.length}</div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input className="pl-9" placeholder="搜索姓名、用户名、手机号" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
        </div>
        <select className="h-9 px-3 text-sm border border-gray-300 rounded-md" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
          <option value="">全部角色</option>
          {ROLE_OPTIONS.map((role) => <option key={role.code} value={role.code}>{role.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-500">
          <Loader2 className="w-5 h-5 mr-2 animate-spin" /> 加载中...
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>用户名</TableHead>
              <TableHead>姓名</TableHead>
              <TableHead>手机号</TableHead>
              <TableHead>主角色</TableHead>
              <TableHead>兼任角色</TableHead>
              <TableHead>门店范围</TableHead>
              <TableHead>例外授权</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-mono text-sm">{user.username}</TableCell>
                <TableCell className="font-medium text-gray-900">{user.name}</TableCell>
                <TableCell>{user.phone}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-blue-50 text-blue-700">
                    <Shield className="w-3 h-3" />{ROLE_OPTIONS.find((role) => role.code === user.primaryRole)?.name ?? user.primaryRole}
                  </span>
                </TableCell>
                <TableCell className="text-sm text-gray-600">
                  {user.roles.map((role) => ROLE_OPTIONS.find((item) => item.code === role)?.name ?? role).join('、')}
                </TableCell>
                <TableCell className="text-sm text-gray-600">
                  {storesLoading ? '门店加载中...' : formatStoreScope(user.storeIds ?? [])}
                </TableCell>
                <TableCell className="text-xs text-gray-500">
                  +{user.extraPermissions?.length ?? 0} / -{user.deniedPermissions?.length ?? 0}
                </TableCell>
                <TableCell>
                  <span className={`px-2 py-1 rounded text-xs ${user.status === '启用' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {user.status}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <button className="text-blue-600 hover:text-blue-700 text-sm" onClick={() => openEditDialog(user)}>编辑</button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
        <div className="text-sm text-gray-600">共 {total} 条</div>
        <div className="flex items-center gap-2">
          <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="h-8 px-2 text-sm border border-gray-300 rounded">
            <option value={10}>10 条/页</option>
            <option value={20}>20 条/页</option>
            <option value={50}>50 条/页</option>
          </select>
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button>
          <span className="text-sm text-gray-600">{page} / {Math.ceil(total / pageSize) || 1}</span>
          <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage(page + 1)}>下一页</Button>
        </div>
      </div>

      <Dialog open={!!draft} onOpenChange={(open) => !open && setDraft(null)}>
        {draft && (
          <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto" aria-describedby="user-auth-dialog-desc">
            <DialogHeader>
              <DialogTitle>{draft.id ? `编辑用户 - ${draft.name}` : '新增用户'}</DialogTitle>
            </DialogHeader>
            <span id="user-auth-dialog-desc" className="sr-only">配置用户主角色、兼任角色、门店范围和例外权限。</span>

            <div className="space-y-5 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <label className="space-y-1">
                  <span className="text-sm font-medium text-gray-700">用户名</span>
                  <Input value={draft.username} onChange={(event) => patchDraft({ username: event.target.value })} />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium text-gray-700">姓名</span>
                  <Input value={draft.name} onChange={(event) => patchDraft({ name: event.target.value })} />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium text-gray-700">手机号</span>
                  <Input value={draft.phone} onChange={(event) => patchDraft({ phone: event.target.value })} />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium text-gray-700">邮箱</span>
                  <Input value={draft.email} onChange={(event) => patchDraft({ email: event.target.value })} />
                </label>
                {!draft.id && (
                  <label className="space-y-1">
                    <span className="text-sm font-medium text-gray-700">初始密码</span>
                    <Input type="password" value={draft.password} onChange={(event) => patchDraft({ password: event.target.value })} />
                  </label>
                )}
              </div>

              <div>
                <div className="text-sm font-medium text-gray-700 mb-2">主角色</div>
                <select
                  className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md"
                  value={draft.primaryRole}
                  onChange={(event) => patchDraft({ primaryRole: event.target.value, roles: Array.from(new Set([event.target.value, ...draft.roles])) })}
                >
                  {ROLE_OPTIONS.map((role) => <option key={role.code} value={role.code}>{role.name}</option>)}
                </select>
              </div>

              <div>
                <div className="text-sm font-medium text-gray-700 mb-2">兼任角色</div>
                <div className="grid grid-cols-3 gap-2">
                  {ROLE_OPTIONS.map((role) => (
                    <label key={role.code} className="flex items-center gap-2 border border-gray-200 rounded-md px-3 py-2 text-sm">
                      <input type="checkbox" checked={draft.roles.includes(role.code)} onChange={() => toggleRole(role.code)} />
                      {role.name}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-sm font-medium text-gray-700 mb-2">门店范围</div>
                {storesLoading ? (
                  <div className="flex items-center text-sm text-gray-500 py-2">
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> 正在加载门店...
                  </div>
                ) : stores.length ? (
                  <div className="grid grid-cols-3 gap-2">
                    {stores.map((store) => (
                      <label key={store.id} className="flex items-center gap-2 border border-gray-200 rounded-md px-3 py-2 text-sm">
                        <input type="checkbox" checked={draft.storeIds.includes(store.id)} onChange={() => toggleStore(store.id)} />
                        {store.name}
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-gray-200 px-3 py-2 text-sm text-gray-500">
                    暂无可用门店，请先在门店管理中创建门店。
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-1">超级管理员可不勾选门店，表示全部门店。</p>
              </div>

              <label className="space-y-1 block">
                <span className="text-sm font-medium text-gray-700">额外授权</span>
                <textarea className="w-full min-h-20 px-3 py-2 text-sm border border-gray-300 rounded-md font-mono" value={draft.extraPermissionsText} onChange={(event) => patchDraft({ extraPermissionsText: event.target.value })} placeholder="用英文逗号分隔，例如 core:customer:export, assist:chat:reply" />
              </label>

              <label className="space-y-1 block">
                <span className="text-sm font-medium text-gray-700">禁止权限</span>
                <textarea className="w-full min-h-20 px-3 py-2 text-sm border border-gray-300 rounded-md font-mono" value={draft.deniedPermissionsText} onChange={(event) => patchDraft({ deniedPermissionsText: event.target.value })} placeholder="用英文逗号分隔，优先级高于角色授权" />
              </label>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <Button variant="outline" onClick={() => setDraft(null)}>取消</Button>
              <Button onClick={saveUser} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                保存
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
