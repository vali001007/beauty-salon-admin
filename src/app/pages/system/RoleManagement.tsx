import { useEffect, useMemo, useState } from 'react';
import { Edit, Loader2, Plus, Shield, Users } from 'lucide-react';
import { Button, Input } from '../../components/UI';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import type { ApprovalScopeValue, DataScopeValue, FieldScopeValue, PermissionPlatform, Role } from '@/types';
import { createRole, getRoles, updateRole } from '@/api/role';
import {
  createDefaultRole,
  DEFAULT_APPROVAL_SCOPES,
  DEFAULT_DATA_SCOPES,
  DEFAULT_FIELD_SCOPES,
  DEFAULT_PLATFORM_SCOPES,
  PERMISSION_CATALOG,
  normalizePermissions,
} from '@/config/permissions';
import { toast } from 'sonner';

const PLATFORM_LABELS: Record<PermissionPlatform, string> = {
  core: 'Ami_Core',
  assist: 'Ami_Assist',
  terminal: 'Ami Aura Lite',
};

const DATA_SCOPE_LABELS: Record<DataScopeValue, string> = {
  all: '全部数据',
  assigned_stores: '指定门店',
  own_store: '所属门店',
  own_team: '所属团队',
  self: '仅本人',
  assigned_customers: '分配客户',
  served_customers: '服务客户',
  current_device: '当前设备',
  none: '无数据',
};

const FIELD_SCOPE_LABELS: Record<FieldScopeValue, string> = {
  visible: '可见',
  masked: '脱敏',
  hidden: '隐藏',
};

const APPROVAL_SCOPE_LABELS: Record<ApprovalScopeValue, string> = {
  none: '无权限',
  request: '发起申请',
  approve: '直接审批',
  approve_limited: '限额审批',
};

const DATA_SCOPE_OPTIONS = Object.keys(DATA_SCOPE_LABELS) as DataScopeValue[];
const FIELD_SCOPE_OPTIONS = Object.keys(FIELD_SCOPE_LABELS) as FieldScopeValue[];
const APPROVAL_SCOPE_OPTIONS = Object.keys(APPROVAL_SCOPE_LABELS) as ApprovalScopeValue[];

const DATA_SCOPE_NAMES: Record<keyof Role['dataScopes'], string> = {
  store: '门店',
  customer: '客户',
  order: '订单',
  booking: '预约',
  inventory: '库存',
  report: '报表',
  device: '设备',
};

const FIELD_SCOPE_NAMES: Record<keyof Role['fieldScopes'], string> = {
  customerPhone: '客户手机号',
  customerWechat: '客户微信',
  customerBalance: '储值/余额',
  customerCost: '成本价',
  customerProfit: '利润/消费金额',
  customerPrivateNote: '私密备注',
  customerRemark: '普通备注',
  staffCommission: '员工提成',
};

const APPROVAL_SCOPE_NAMES: Record<keyof Role['approvalScopes'], string> = {
  refund: '退款',
  discount: '折扣',
  priceChange: '改价',
  deleteCustomer: '删除客户',
  exportCustomer: '导出客户',
  inventoryAdjustment: '库存调整',
  deviceUnbind: '设备解绑',
};

function createBlankRole(): Role {
  return {
    ...createDefaultRole('custom_role', '自定义角色', '按业务场景配置权限', false, 0),
    id: 0,
    code: `custom_${Date.now()}`,
    permissions: [],
    platformScopes: { core: true, assist: false, terminal: false },
    dataScopes: {
      store: 'own_store',
      customer: 'own_store',
      order: 'own_store',
      booking: 'own_store',
      inventory: 'none',
      report: 'self',
      device: 'none',
    },
    fieldScopes: {
      customerPhone: 'masked',
      customerWechat: 'masked',
      customerBalance: 'hidden',
      customerCost: 'hidden',
      customerProfit: 'hidden',
      customerPrivateNote: 'hidden',
      customerRemark: 'visible',
      staffCommission: 'hidden',
    },
    approvalScopes: {
      refund: 'request',
      discount: 'request',
      priceChange: 'none',
      deleteCustomer: 'none',
      exportCustomer: 'none',
      inventoryAdjustment: 'none',
      deviceUnbind: 'none',
    },
  };
}

export function RoleManagement() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [activeSection, setActiveSection] = useState<'permissions' | 'data' | 'fields' | 'approval'>('permissions');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? roles[0] ?? null;

  const groupedPermissions = useMemo(() => {
    return PERMISSION_CATALOG.reduce<Record<string, typeof PERMISSION_CATALOG>>((acc, permission) => {
      const key = `${PLATFORM_LABELS[permission.platform]} / ${permission.module}`;
      acc[key] = acc[key] ?? [];
      acc[key].push(permission);
      return acc;
    }, {});
  }, []);

  const loadRoles = async () => {
    setLoading(true);
    try {
      const data = await getRoles();
      setRoles(data);
      setSelectedRoleId((current) => current ?? data[0]?.id ?? null);
    } catch {
      toast.error('加载角色失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoles();
  }, []);

  const openAddDialog = () => setEditingRole(createBlankRole());
  const openEditDialog = (role: Role) => setEditingRole({ ...role });
  const closeDialog = () => setEditingRole(null);

  const patchEditingRole = (patch: Partial<Role>) => {
    setEditingRole((current) => (current ? { ...current, ...patch } : current));
  };

  const togglePermission = (code: string) => {
    if (!editingRole) return;
    const permissions = normalizePermissions(editingRole.permissions);
    const next = permissions.includes(code)
      ? permissions.filter((permission) => permission !== code)
      : [...permissions, code];
    patchEditingRole({ permissions: next });
  };

  const togglePlatform = (platform: PermissionPlatform) => {
    if (!editingRole) return;
    patchEditingRole({
      platformScopes: {
        ...editingRole.platformScopes,
        [platform]: !editingRole.platformScopes[platform],
      },
    });
  };

  const saveRole = async () => {
    if (!editingRole) return;
    if (!editingRole.name.trim() || !editingRole.code.trim()) {
      toast.error('角色名称和编码不能为空');
      return;
    }

    setSaving(true);
    try {
      const { id: _id, ...rest } = editingRole;
      void _id;
      const payload = {
        ...rest,
        permissions: normalizePermissions(editingRole.permissions),
      };
      const saved = editingRole.id
        ? await updateRole(editingRole.id, payload)
        : await createRole({
            ...payload,
            isSystem: false,
            userCount: 0,
          });
      setSelectedRoleId(saved.id);
      await loadRoles();
      closeDialog();
      toast.success(editingRole.id ? '角色已更新' : '角色已创建');
    } catch (err: any) {
      toast.error(err?.message || '保存角色失败');
    } finally {
      setSaving(false);
    }
  };

  const resetToTemplate = (roleCode: keyof typeof DEFAULT_DATA_SCOPES) => {
    if (!editingRole) return;
    patchEditingRole({
      platformScopes: DEFAULT_PLATFORM_SCOPES[roleCode],
      dataScopes: DEFAULT_DATA_SCOPES[roleCode],
      fieldScopes: DEFAULT_FIELD_SCOPES[roleCode],
      approvalScopes: DEFAULT_APPROVAL_SCOPES[roleCode],
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="text-sm text-gray-500">首页 / 系统设置 / 角色管理</div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">角色与权限中心</h2>
          <p className="text-sm text-gray-500 mt-1">统一配置 Ami_Core、Ami_Assist、Ami Aura Lite 的角色、数据、字段和审批权限。</p>
        </div>
        <Button className="gap-2" onClick={openAddDialog}><Plus className="w-4 h-4" /> 新增角色</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-500">
          <Loader2 className="w-5 h-5 mr-2 animate-spin" /> 加载中...
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-4 space-y-3">
            {roles.map((role) => (
              <button
                key={role.id}
                onClick={() => setSelectedRoleId(role.id)}
                className={`w-full text-left border rounded-lg p-4 transition-all ${
                  selectedRole?.id === role.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                      <Shield className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{role.name}</div>
                      <div className="font-mono text-xs text-gray-500 mt-0.5">{role.code}</div>
                    </div>
                  </div>
                  {role.isSystem && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">系统</span>}
                </div>
                <p className="text-sm text-gray-600 mt-3 line-clamp-2">{role.description}</p>
                <div className="flex items-center gap-4 text-xs text-gray-500 mt-3">
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" />{role.userCount} 人</span>
                  <span>{role.permissions.includes('*') ? '全部权限' : `${role.permissions.length} 个权限点`}</span>
                </div>
              </button>
            ))}
          </div>

          {selectedRole && (
            <div className="col-span-8 border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{selectedRole.name}</h3>
                  <p className="text-sm text-gray-500 mt-1">{selectedRole.description}</p>
                </div>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => openEditDialog(selectedRole)}>
                  <Edit className="w-3.5 h-3.5" /> 编辑
                </Button>
              </div>

              <div className="p-6 space-y-6">
                <div className="grid grid-cols-3 gap-3">
                  {(Object.keys(PLATFORM_LABELS) as PermissionPlatform[]).map((platform) => (
                    <div key={platform} className={`border rounded-lg p-3 ${selectedRole.platformScopes[platform] ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}>
                      <div className="text-sm font-medium text-gray-900">{PLATFORM_LABELS[platform]}</div>
                      <div className="text-xs text-gray-500 mt-1">{selectedRole.platformScopes[platform] ? '已授权' : '未授权'}</div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  {[
                    ['permissions', '菜单/操作权限'],
                    ['data', '数据权限'],
                    ['fields', '字段权限'],
                    ['approval', '审批权限'],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setActiveSection(key as typeof activeSection)}
                      className={`px-3 py-1.5 rounded-md text-sm ${
                        activeSection === key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {activeSection === 'permissions' && (
                  <div className="space-y-4">
                    {Object.entries(groupedPermissions).map(([group, permissions]) => {
                      const selectedCount = selectedRole.permissions.includes('*')
                        ? permissions.length
                        : permissions.filter((permission) => selectedRole.permissions.includes(permission.code)).length;
                      return (
                        <div key={group} className="border border-gray-100 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="font-medium text-gray-800">{group}</div>
                            <span className="text-xs text-gray-500">{selectedCount}/{permissions.length}</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {permissions.map((permission) => {
                              const enabled = selectedRole.permissions.includes('*') || selectedRole.permissions.includes(permission.code);
                              return (
                                <span key={permission.code} className={`px-2 py-1 rounded text-xs ${enabled ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>
                                  {permission.name}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {activeSection === 'data' && (
                  <div className="grid grid-cols-2 gap-3">
                    {(Object.keys(DATA_SCOPE_NAMES) as Array<keyof Role['dataScopes']>).map((key) => (
                      <div key={key} className="border border-gray-100 rounded-lg p-3">
                        <div className="text-xs text-gray-500 mb-1">{DATA_SCOPE_NAMES[key]}</div>
                        <div className="text-sm font-medium text-gray-900">{DATA_SCOPE_LABELS[selectedRole.dataScopes[key]]}</div>
                      </div>
                    ))}
                  </div>
                )}

                {activeSection === 'fields' && (
                  <div className="grid grid-cols-2 gap-3">
                    {(Object.keys(FIELD_SCOPE_NAMES) as Array<keyof Role['fieldScopes']>).map((key) => (
                      <div key={key} className="border border-gray-100 rounded-lg p-3">
                        <div className="text-xs text-gray-500 mb-1">{FIELD_SCOPE_NAMES[key]}</div>
                        <div className="text-sm font-medium text-gray-900">{FIELD_SCOPE_LABELS[selectedRole.fieldScopes[key]]}</div>
                      </div>
                    ))}
                  </div>
                )}

                {activeSection === 'approval' && (
                  <div className="grid grid-cols-2 gap-3">
                    {(Object.keys(APPROVAL_SCOPE_NAMES) as Array<keyof Role['approvalScopes']>).map((key) => (
                      <div key={key} className="border border-gray-100 rounded-lg p-3">
                        <div className="text-xs text-gray-500 mb-1">{APPROVAL_SCOPE_NAMES[key]}</div>
                        <div className="text-sm font-medium text-gray-900">{APPROVAL_SCOPE_LABELS[selectedRole.approvalScopes[key]]}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog open={!!editingRole} onOpenChange={(open) => !open && closeDialog()}>
        {editingRole && (
          <DialogContent className="max-w-5xl max-h-[88vh] overflow-y-auto" aria-describedby="role-permission-dialog-desc">
            <DialogHeader>
              <DialogTitle>{editingRole.id ? `编辑角色 - ${editingRole.name}` : '新增角色'}</DialogTitle>
            </DialogHeader>
            <span id="role-permission-dialog-desc" className="sr-only">配置角色基础信息、平台、权限、数据范围、字段权限和审批权限。</span>

            <div className="space-y-6 mt-4">
              <div className="grid grid-cols-3 gap-4">
                <label className="space-y-1">
                  <span className="text-sm font-medium text-gray-700">角色名称</span>
                  <Input value={editingRole.name} onChange={(event) => patchEditingRole({ name: event.target.value })} />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium text-gray-700">角色编码</span>
                  <Input value={editingRole.code} onChange={(event) => patchEditingRole({ code: event.target.value })} disabled={editingRole.isSystem} />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium text-gray-700">快速套用</span>
                  <select className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md" onChange={(event) => event.target.value && resetToTemplate(event.target.value as keyof typeof DEFAULT_DATA_SCOPES)} defaultValue="">
                    <option value="">选择角色模板</option>
                    <option value="store_manager">店长</option>
                    <option value="cashier">前台/收银</option>
                    <option value="beautician">美容师</option>
                    <option value="inventory_manager">库存管理员</option>
                  </select>
                </label>
              </div>

              <label className="space-y-1 block">
                <span className="text-sm font-medium text-gray-700">描述</span>
                <textarea className="w-full min-h-20 px-3 py-2 text-sm border border-gray-300 rounded-md" value={editingRole.description} onChange={(event) => patchEditingRole({ description: event.target.value })} />
              </label>

              <div>
                <div className="text-sm font-medium text-gray-700 mb-2">适用平台</div>
                <div className="grid grid-cols-3 gap-3">
                  {(Object.keys(PLATFORM_LABELS) as PermissionPlatform[]).map((platform) => (
                    <label key={platform} className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 cursor-pointer">
                      <input type="checkbox" checked={editingRole.platformScopes[platform]} onChange={() => togglePlatform(platform)} />
                      <span className="text-sm">{PLATFORM_LABELS[platform]}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-sm font-medium text-gray-700 mb-3">菜单 / 操作 / API 权限</div>
                <div className="space-y-3">
                  {Object.entries(groupedPermissions).map(([group, permissions]) => (
                    <div key={group} className="border border-gray-100 rounded-lg p-3">
                      <div className="text-sm font-medium text-gray-800 mb-2">{group}</div>
                      <div className="grid grid-cols-2 gap-2">
                        {permissions.map((permission) => (
                          <label key={permission.code} className="flex items-start gap-2 cursor-pointer text-sm">
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={editingRole.permissions.includes('*') || editingRole.permissions.includes(permission.code)}
                              disabled={editingRole.permissions.includes('*')}
                              onChange={() => togglePermission(permission.code)}
                            />
                            <span>
                              <span className="font-medium text-gray-800">{permission.name}</span>
                              <span className="block font-mono text-xs text-gray-400">{permission.code}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-2">数据权限</div>
                  <div className="space-y-2">
                    {(Object.keys(DATA_SCOPE_NAMES) as Array<keyof Role['dataScopes']>).map((key) => (
                      <label key={key} className="grid grid-cols-2 gap-2 items-center text-sm">
                        <span className="text-gray-600">{DATA_SCOPE_NAMES[key]}</span>
                        <select className="h-8 px-2 border border-gray-300 rounded-md" value={editingRole.dataScopes[key]} onChange={(event) => patchEditingRole({ dataScopes: { ...editingRole.dataScopes, [key]: event.target.value as DataScopeValue } })}>
                          {DATA_SCOPE_OPTIONS.map((scope) => <option key={scope} value={scope}>{DATA_SCOPE_LABELS[scope]}</option>)}
                        </select>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-2">字段权限</div>
                  <div className="space-y-2">
                    {(Object.keys(FIELD_SCOPE_NAMES) as Array<keyof Role['fieldScopes']>).map((key) => (
                      <label key={key} className="grid grid-cols-2 gap-2 items-center text-sm">
                        <span className="text-gray-600">{FIELD_SCOPE_NAMES[key]}</span>
                        <select className="h-8 px-2 border border-gray-300 rounded-md" value={editingRole.fieldScopes[key]} onChange={(event) => patchEditingRole({ fieldScopes: { ...editingRole.fieldScopes, [key]: event.target.value as FieldScopeValue } })}>
                          {FIELD_SCOPE_OPTIONS.map((scope) => <option key={scope} value={scope}>{FIELD_SCOPE_LABELS[scope]}</option>)}
                        </select>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-2">审批权限</div>
                  <div className="space-y-2">
                    {(Object.keys(APPROVAL_SCOPE_NAMES) as Array<keyof Role['approvalScopes']>).map((key) => (
                      <label key={key} className="grid grid-cols-2 gap-2 items-center text-sm">
                        <span className="text-gray-600">{APPROVAL_SCOPE_NAMES[key]}</span>
                        <select className="h-8 px-2 border border-gray-300 rounded-md" value={editingRole.approvalScopes[key]} onChange={(event) => patchEditingRole({ approvalScopes: { ...editingRole.approvalScopes, [key]: event.target.value as ApprovalScopeValue } })}>
                          {APPROVAL_SCOPE_OPTIONS.map((scope) => <option key={scope} value={scope}>{APPROVAL_SCOPE_LABELS[scope]}</option>)}
                        </select>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <Button type="button" variant="outline" onClick={closeDialog}>取消</Button>
              <Button type="button" onClick={saveRole} disabled={saving}>
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
