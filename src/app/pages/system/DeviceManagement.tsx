import { useCallback, useMemo, useState } from 'react';
import { Copy, Loader2, Plus, RefreshCw, Search, Trash2, Wifi, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import {
  deleteTerminalDevice,
  getTerminalDevicesPaginated,
  provisionTerminalDevice,
  updateTerminalDevice,
} from '@/api/terminal';
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/UI';
import { Badge } from '@/app/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/app/components/ui/dialog';
import { usePagination } from '@/hooks/usePagination';
import { useStoreStore } from '@/stores/storeStore';
import type {
  TerminalDevice,
  TerminalDeviceProvisionRequest,
  TerminalDeviceProvisionResponse,
  TerminalDeviceStatus,
} from '@/types/terminal';

const statusLabels: Record<TerminalDeviceStatus, string> = {
  online: '在线',
  offline: '离线',
  unactivated: '未激活',
  disabled: '已禁用',
  pending_unbind: '待解绑',
};

const statusClass: Record<TerminalDeviceStatus, string> = {
  online: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  offline: 'bg-gray-100 text-gray-600 border-gray-200',
  unactivated: 'bg-blue-50 text-blue-700 border-blue-100',
  disabled: 'bg-rose-50 text-rose-600 border-rose-100',
  pending_unbind: 'bg-amber-50 text-amber-700 border-amber-100',
};

const emptyForm: TerminalDeviceProvisionRequest = {
  name: '',
  model: 'Ami Aura Lite',
  appVersion: '1.0.0',
  firmwareVersion: '1.0.0',
};

function isOffline(lastOnlineAt?: string) {
  if (!lastOnlineAt) return true;
  const last = new Date(lastOnlineAt).getTime();
  return Number.isNaN(last) || Date.now() - last > 5 * 60 * 1000;
}

function formatTime(value?: string) {
  if (!value) return '未上线';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

export function DeviceManagement() {
  const currentStoreId = useStoreStore((state) => state.currentStoreId);
  const [keyword, setKeyword] = useState('');
  const [appliedKeyword, setAppliedKeyword] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState<TerminalDeviceProvisionRequest>(emptyForm);
  const [createdDevice, setCreatedDevice] = useState<TerminalDeviceProvisionResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [operatingId, setOperatingId] = useState<number | null>(null);

  const filters = useMemo(
    () => ({
      keyword: appliedKeyword || undefined,
      storeId: currentStoreId || undefined,
    }),
    [appliedKeyword, currentStoreId],
  );

  const { data, total, page, pageSize, loading, setPage, refresh } = usePagination<TerminalDevice>(
    getTerminalDevicesPaginated,
    filters,
  );

  const openCreate = () => {
    setForm({ ...emptyForm, storeId: currentStoreId || undefined });
    setCreatedDevice(null);
    setShowDialog(true);
  };

  const submit = async () => {
    setSaving(true);
    try {
      const device = await provisionTerminalDevice({
        ...form,
        storeId: form.storeId || currentStoreId || undefined,
        name: form.name?.trim() || undefined,
        deviceCode: form.deviceCode?.trim() || undefined,
        activationCode: form.activationCode?.trim() || undefined,
      });
      setCreatedDevice(device);
      toast.success('终端设备已创建');
      await refresh();
    } catch (error: any) {
      toast.error(error?.message || '创建设备失败');
    } finally {
      setSaving(false);
    }
  };

  const copyText = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label}已复制`);
    } catch {
      toast.error('复制失败');
    }
  }, []);

  const markDisabled = async (device: TerminalDevice) => {
    setOperatingId(device.id);
    try {
      await updateTerminalDevice(device.id, { status: 'disabled' });
      toast.success('设备已禁用');
      await refresh();
    } catch (error: any) {
      toast.error(error?.message || '禁用设备失败');
    } finally {
      setOperatingId(null);
    }
  };

  const remove = async (device: TerminalDevice) => {
    if (!window.confirm(`确定删除设备 ${device.deviceCode}？删除后需要重新预置才能使用。`)) return;
    setOperatingId(device.id);
    try {
      await deleteTerminalDevice(device.id);
      toast.success('设备已删除');
      await refresh();
    } catch (error: any) {
      toast.error(error?.message || '删除设备失败');
    } finally {
      setOperatingId(null);
    }
  };

  const onlineCount = data.filter((item) => item.status === 'online' && !isOffline(item.lastOnlineAt)).length;
  const inactiveCount = data.filter((item) => isOffline(item.lastOnlineAt) || item.status === 'offline' || item.status === 'unactivated').length;

  return (
    <div className="flex flex-col gap-6">
      <div className="text-sm text-gray-500">首页 / 系统设置 / 终端设备</div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">终端设备</h2>
          <p className="mt-1 text-sm text-gray-500">预置 Ami Aura Lite 设备，查看激活与在线状态。</p>
        </div>
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          添加设备
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm text-gray-500">当前列表设备</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">{total}</div>
        </div>
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
          <div className="flex items-center gap-2 text-sm text-emerald-700">
            <Wifi className="h-4 w-4" />
            在线设备
          </div>
          <div className="mt-2 text-2xl font-semibold text-emerald-800">{onlineCount}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <WifiOff className="h-4 w-4" />
            离线/超时
          </div>
          <div className="mt-2 text-2xl font-semibold text-gray-800">{inactiveCount}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索设备编码、名称、型号"
            className="pl-9"
          />
        </div>
        <Button variant="outline" onClick={() => setAppliedKeyword(keyword.trim())}>
          筛选
        </Button>
        <Button variant="outline" className="gap-2" onClick={() => void refresh()}>
          <RefreshCw className="h-4 w-4" />
          刷新
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>设备</TableHead>
            <TableHead>门店</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>外设</TableHead>
            <TableHead>版本</TableHead>
            <TableHead>最近在线</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={7} className="py-10 text-center text-gray-500">
                <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                正在加载设备
              </TableCell>
            </TableRow>
          ) : data.length ? (
            data.map((device) => {
              const effectiveStatus: TerminalDeviceStatus =
                device.status === 'online' && isOffline(device.lastOnlineAt) ? 'offline' : device.status;
              return (
                <TableRow key={device.id}>
                  <TableCell>
                    <div className="font-medium text-gray-900">{device.name}</div>
                    <div className="mt-1 text-xs text-gray-500">{device.deviceCode}</div>
                  </TableCell>
                  <TableCell>{device.storeName || '-'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusClass[effectiveStatus]}>
                      {statusLabels[effectiveStatus]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="grid gap-1 text-xs text-gray-600">
                      <span>打印机：{device.printerStatus || 'unknown'}</span>
                      <span>扫码器：{device.scannerStatus || 'unknown'}</span>
                      <span>摄像头：{device.cameraStatus || 'unknown'}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{device.appVersion || '-'}</div>
                    <div className="text-xs text-gray-500">{device.firmwareVersion || '-'}</div>
                  </TableCell>
                  <TableCell>{formatTime(device.lastOnlineAt)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={operatingId === device.id || device.status === 'disabled'}
                        onClick={() => void markDisabled(device)}
                      >
                        禁用
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600"
                        disabled={operatingId === device.id}
                        onClick={() => void remove(device)}
                      >
                        {operatingId === device.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          ) : (
            <TableRow>
              <TableCell colSpan={7} className="py-10 text-center text-gray-500">
                暂无终端设备
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <div className="flex items-center justify-end gap-3 text-sm text-gray-500">
        <span>
          第 {page} 页 / 共 {Math.max(1, Math.ceil(total / pageSize))} 页
        </span>
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          上一页
        </Button>
        <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage(page + 1)}>
          下一页
        </Button>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-xl" aria-describedby="device-dialog-desc">
          <DialogHeader>
            <DialogTitle>添加终端设备</DialogTitle>
          </DialogHeader>
          <span id="device-dialog-desc" className="sr-only">预置新的 Ami Aura Lite 终端设备。</span>
          <div className="grid gap-4">
            <label className="grid gap-1.5 text-sm font-medium text-gray-700">
              设备名称
              <Input value={form.name ?? ''} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-gray-700">
                设备编码
                <Input
                  value={form.deviceCode ?? ''}
                  onChange={(event) => setForm((prev) => ({ ...prev, deviceCode: event.target.value }))}
                  placeholder="留空自动生成"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-gray-700">
                激活码
                <Input
                  value={form.activationCode ?? ''}
                  onChange={(event) => setForm((prev) => ({ ...prev, activationCode: event.target.value }))}
                  placeholder="留空自动生成"
                />
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="grid gap-1.5 text-sm font-medium text-gray-700">
                型号
                <Input value={form.model ?? ''} onChange={(event) => setForm((prev) => ({ ...prev, model: event.target.value }))} />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-gray-700">
                App 版本
                <Input
                  value={form.appVersion ?? ''}
                  onChange={(event) => setForm((prev) => ({ ...prev, appVersion: event.target.value }))}
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-gray-700">
                固件版本
                <Input
                  value={form.firmwareVersion ?? ''}
                  onChange={(event) => setForm((prev) => ({ ...prev, firmwareVersion: event.target.value }))}
                />
              </label>
            </div>

            {createdDevice ? (
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4 text-sm">
                <div className="mb-3 font-medium text-emerald-800">设备已创建，请在终端输入以下信息激活。</div>
                <div className="grid gap-2">
                  <button
                    type="button"
                    onClick={() => void copyText(createdDevice.deviceCode, '设备编码')}
                    className="flex items-center justify-between rounded-md bg-white px-3 py-2 text-left"
                  >
                    <span>设备编码：{createdDevice.deviceCode}</span>
                    <Copy className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyText(createdDevice.activationCode, '激活码')}
                    className="flex items-center justify-between rounded-md bg-white px-3 py-2 text-left"
                  >
                    <span>激活码：{createdDevice.activationCode}</span>
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <div className="mt-5 flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              关闭
            </Button>
            <Button onClick={() => void submit()} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              创建
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
