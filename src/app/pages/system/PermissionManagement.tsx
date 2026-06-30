import { useMemo, useState } from 'react';
import { Filter, KeyRound, MonitorSmartphone, Shield, Smartphone, Terminal } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/UI';
import type { PermissionPlatform, PermissionType } from '@/types';
import { PERMISSION_CATALOG, PLATFORMS } from '@/config/permissions';

const PLATFORM_LABELS: Record<PermissionPlatform, string> = {
  core: 'Ami_Core',
  assist: 'Ami_Assist',
  terminal: 'Ami Aura Lite',
};

const TYPE_LABELS: Record<PermissionType, string> = {
  menu: '菜单',
  operation: '操作',
  action: '动作',
  api: '接口',
};

const PLATFORM_ICONS: Record<PermissionPlatform, typeof Shield> = {
  core: MonitorSmartphone,
  assist: Smartphone,
  terminal: Terminal,
};

export function PermissionManagement() {
  const [platformFilter, setPlatformFilter] = useState<'all' | PermissionPlatform>('all');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<'all' | PermissionType>('all');

  const modules = useMemo(() => Array.from(new Set(PERMISSION_CATALOG.map((item) => item.module))), []);

  const filteredPermissions = useMemo(() => {
    return PERMISSION_CATALOG.filter((permission) => {
      if (platformFilter !== 'all' && permission.platform !== platformFilter) return false;
      if (moduleFilter !== 'all' && permission.module !== moduleFilter) return false;
      if (typeFilter !== 'all' && permission.type !== typeFilter) return false;
      return true;
    });
  }, [moduleFilter, platformFilter, typeFilter]);

  const stats = useMemo(() => {
    return {
      total: PERMISSION_CATALOG.length,
      menu: PERMISSION_CATALOG.filter((permission) => permission.type === 'menu').length,
      operation: PERMISSION_CATALOG.filter((permission) => permission.type === 'operation').length,
      action: PERMISSION_CATALOG.filter((permission) => permission.type === 'action').length,
      api: PERMISSION_CATALOG.filter((permission) => permission.type === 'api').length,
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="text-sm text-gray-500">首页 / 系统设置 / 权限管理</div>
      <div>
        <h2 className="text-xl font-semibold text-gray-800">统一权限目录</h2>
        <p className="text-sm text-gray-500 mt-1">所有平台、菜单、操作、接口权限都从这里出发，角色管理页只消费同一份目录。</p>
      </div>

      <div className="grid grid-cols-5 gap-4">
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-500">权限总数</div>
          <div className="text-2xl font-semibold text-gray-900 mt-1">{stats.total}</div>
        </div>
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-500">菜单权限</div>
          <div className="text-2xl font-semibold text-blue-700 mt-1">{stats.menu}</div>
        </div>
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-500">操作权限</div>
          <div className="text-2xl font-semibold text-green-700 mt-1">{stats.operation}</div>
        </div>
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-500">动作权限</div>
          <div className="text-2xl font-semibold text-amber-700 mt-1">{stats.action}</div>
        </div>
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-500">接口权限</div>
          <div className="text-2xl font-semibold text-purple-700 mt-1">{stats.api}</div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Filter className="w-4 h-4 text-gray-400" />
        <select className="h-9 px-3 text-sm border border-gray-300 rounded-md" value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value as 'all' | PermissionPlatform)}>
          <option value="all">全部平台</option>
          {PLATFORMS.map((platform) => (
            <option key={platform} value={platform}>{PLATFORM_LABELS[platform]}</option>
          ))}
        </select>
        <select className="h-9 px-3 text-sm border border-gray-300 rounded-md" value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)}>
          <option value="all">全部模块</option>
          {modules.map((module) => (
            <option key={module} value={module}>{module}</option>
          ))}
        </select>
        <select className="h-9 px-3 text-sm border border-gray-300 rounded-md" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as 'all' | PermissionType)}>
          <option value="all">全部类型</option>
          <option value="menu">菜单</option>
          <option value="operation">操作</option>
          <option value="action">动作</option>
          <option value="api">接口</option>
        </select>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>平台</TableHead>
            <TableHead>模块</TableHead>
            <TableHead>权限名称</TableHead>
            <TableHead>权限编码</TableHead>
            <TableHead>类型</TableHead>
            <TableHead>旧编码兼容</TableHead>
            <TableHead>说明</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredPermissions.map((permission) => {
            const Icon = PLATFORM_ICONS[permission.platform];
            return (
              <TableRow key={permission.code}>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5 text-sm">
                    <Icon className="w-4 h-4 text-gray-500" />
                    {PLATFORM_LABELS[permission.platform]}
                  </span>
                </TableCell>
                <TableCell className="text-gray-700">{permission.module}</TableCell>
                <TableCell className="font-medium text-gray-900">{permission.name}</TableCell>
                <TableCell>
                  <span className="font-mono text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">{permission.code}</span>
                </TableCell>
                <TableCell>
                  <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">{TYPE_LABELS[permission.type]}</span>
                </TableCell>
                <TableCell>
                  {permission.legacyCodes?.length ? (
                    <div className="flex flex-wrap gap-1">
                      {permission.legacyCodes.map((legacyCode) => (
                        <span key={legacyCode} className="font-mono text-[11px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">
                          {legacyCode}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </TableCell>
                <TableCell className="text-gray-600">{permission.description}</TableCell>
              </TableRow>
            );
          })}
          {filteredPermissions.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-gray-400 py-10">
                <KeyRound className="w-8 h-8 mx-auto mb-2" />
                没有匹配的权限项
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
