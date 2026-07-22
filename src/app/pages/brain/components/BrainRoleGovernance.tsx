import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, RefreshCw, Save, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  createBrainRoleProfile,
  isBrainGovernanceReadCancelled,
  listBrainResourceVersions,
  listBrainRoleProfiles,
  updateBrainRoleProfile,
} from '@/api/brain';

interface ResourceRow {
  id?: number;
  resourceKey?: string;
  version?: number;
  status?: string;
  snapshot?: unknown;
  createdAt?: string;
}

interface RoleProfileRow {
  id?: number;
  roleKey: string;
  name: string;
  systemPrompt: string;
  allowedSkills: string[];
  dataScopeRules: Record<string, unknown>;
  knowledgePack: Record<string, unknown>;
  version: number;
  status: string;
  updatedAt: string;
}

const EMPTY_ROLE = {
  roleKey: 'store_manager',
  name: '店长经营 Agent',
  systemPrompt: '基于真实经营事实回答。',
  allowedSkills: [],
  dataScopeRules: { requiredPermissions: ['core:dashboard:view'] },
  knowledgePack: { domains: ['beauty_store_operations'] },
};

const DOMAIN_LABELS: Record<string, string> = {
  beauty_store_operations: '门店综合经营',
  store_operation: '门店经营',
  front_desk: '预约与前台',
  fulfillment: '服务履约',
  customer_service: '客户服务',
  customer: '客户与会员',
  finance: '财务与利润',
  inventory: '库存与采购',
  marketing: '营销与增长',
  sales: '销售与收银',
  staff: '员工与排班',
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function rowsFrom(response: unknown): ResourceRow[] {
  const items = record(response).items;
  return Array.isArray(items) ? (items as ResourceRow[]) : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function roleFromActive(item: ResourceRow): RoleProfileRow | null {
  const source = item as Record<string, unknown>;
  const roleKey = String(source.roleKey ?? '').trim();
  if (!roleKey) return null;
  return {
    id: typeof source.id === 'number' ? source.id : undefined,
    roleKey,
    name: String(source.name ?? roleKey),
    systemPrompt: String(source.systemPrompt ?? ''),
    allowedSkills: strings(source.allowedSkills),
    dataScopeRules: record(source.dataScopeRules),
    knowledgePack: record(source.knowledgePack),
    version: Number(source.version) || 1,
    status: source.enabled === false ? 'disabled' : 'active',
    updatedAt: String(source.updatedAt ?? source.createdAt ?? ''),
  };
}

function mergeRoleRows(versionItems: ResourceRow[], activeItems: ResourceRow[]): RoleProfileRow[] {
  const activeByKey = new Map(
    activeItems
      .map(roleFromActive)
      .filter((item): item is RoleProfileRow => Boolean(item))
      .map((item) => [item.roleKey, item]),
  );
  const latestVersionByKey = new Map<string, ResourceRow>();
  for (const item of versionItems) {
    const roleKey = String(item.resourceKey ?? record(item.snapshot).roleKey ?? '').trim();
    if (roleKey && !latestVersionByKey.has(roleKey)) latestVersionByKey.set(roleKey, item);
  }

  const roleKeys = new Set([...activeByKey.keys(), ...latestVersionByKey.keys()]);
  return [...roleKeys]
    .map((roleKey) => {
      const active = activeByKey.get(roleKey);
      const versionItem = latestVersionByKey.get(roleKey);
      if (!versionItem) return active!;
      const snapshot = record(versionItem.snapshot);
      return {
        id: versionItem.id,
        roleKey,
        name: String(snapshot.name ?? active?.name ?? roleKey),
        systemPrompt: String(snapshot.systemPrompt ?? active?.systemPrompt ?? ''),
        allowedSkills: strings(snapshot.allowedSkills ?? active?.allowedSkills),
        dataScopeRules: Object.prototype.hasOwnProperty.call(snapshot, 'dataScopeRules')
          ? record(snapshot.dataScopeRules)
          : active?.dataScopeRules ?? {},
        knowledgePack: Object.prototype.hasOwnProperty.call(snapshot, 'knowledgePack')
          ? record(snapshot.knowledgePack)
          : active?.knowledgePack ?? {},
        version: Number(versionItem.version) || active?.version || 1,
        status: String(versionItem.status ?? active?.status ?? '-'),
        updatedAt: String(versionItem.createdAt ?? active?.updatedAt ?? ''),
      };
    })
    .sort((left, right) => left.roleKey.localeCompare(right.roleKey));
}

function rolePayload(row: RoleProfileRow): Record<string, unknown> {
  return {
    roleKey: row.roleKey,
    name: row.name,
    systemPrompt: row.systemPrompt,
    allowedSkills: row.allowedSkills,
    dataScopeRules: row.dataScopeRules,
    knowledgePack: row.knowledgePack,
  };
}

function formatDate(value: string): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}

function statusLabel(status: string): string {
  return ({ active: '已发布', draft: '草稿', disabled: '已停用', archived: '已归档' } as Record<string, string>)[status] ?? status;
}

export function BrainRoleGovernance() {
  const [versions, setVersions] = useState<ResourceRow[]>([]);
  const [activeItems, setActiveItems] = useState<ResourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedRoleKey, setSelectedRoleKey] = useState<string | null>(null);
  const [editor, setEditor] = useState(JSON.stringify(EMPTY_ROLE, null, 2));
  const roles = useMemo(() => mergeRoleRows(versions, activeItems), [versions, activeItems]);

  async function load() {
    setLoading(true);
    setLoadError('');
    try {
      const versionResponse = await listBrainResourceVersions({
        resourceType: 'agent_profile',
        includeSnapshot: true,
        take: 100,
      });
      setVersions(rowsFrom(versionResponse));
      const activeResponse = await listBrainRoleProfiles();
      setActiveItems(rowsFrom(activeResponse));
    } catch (error) {
      if (isBrainGovernanceReadCancelled(error)) return;
      const message = error instanceof Error ? error.message : '角色配置加载失败';
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function configureRole(row: RoleProfileRow) {
    setSelectedRoleKey(row.roleKey);
    setEditor(JSON.stringify(rolePayload(row), null, 2));
  }

  function createRole() {
    setSelectedRoleKey(null);
    setEditor(JSON.stringify(EMPTY_ROLE, null, 2));
  }

  async function save() {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(editor) as Record<string, unknown>;
    } catch {
      toast.error('配置必须是有效 JSON');
      return;
    }
    const roleKey = String(payload.roleKey ?? '').trim();
    if (!roleKey) {
      toast.error('缺少 roleKey');
      return;
    }
    if (selectedRoleKey && roleKey !== selectedRoleKey) {
      toast.error('已有角色的 roleKey 不可修改');
      return;
    }

    setSaving(true);
    try {
      const exists = roles.some((role) => role.roleKey === roleKey);
      await (exists ? updateBrainRoleProfile(roleKey, payload) : createBrainRoleProfile(payload));
      toast.success('角色配置草稿版本已保存');
      setSelectedRoleKey(roleKey);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '角色配置保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">角色配置</h2>
          <p className="mt-1 text-sm text-muted-foreground">角色技能、业务领域和数据范围按版本发布，roleHint 不改变用户权限。</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm" onClick={createRole}>
            <Plus className="h-4 w-4" />
            新建角色
          </button>
          <button type="button" className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm" onClick={() => void load()}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </div>

      <div className="grid gap-6 py-5 2xl:grid-cols-[minmax(0,1fr)_440px]">
        <div className="min-w-0 overflow-x-auto rounded-md border border-border">
          {loadError ? (
            <div className="flex items-center justify-between gap-3 border-b border-border bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <span>{loadError}</span>
              <button type="button" className="shrink-0 underline" onClick={() => void load()} disabled={loading}>重试</button>
            </div>
          ) : null}
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">角色名称</th>
                <th className="px-3 py-2">业务领域范围</th>
                <th className="px-3 py-2">授权 Skills</th>
                <th className="px-3 py-2">版本/状态</th>
                <th className="px-3 py-2">更新时间</th>
                <th className="px-3 py-2 text-right">配置</th>
              </tr>
            </thead>
            <tbody>
              {roles.length ? roles.map((role) => {
                const domains = strings(role.knowledgePack.domains);
                const visibleSkills = role.allowedSkills.slice(0, 3);
                return (
                  <tr key={role.roleKey} className="border-t border-border align-top">
                    <td className="px-3 py-3">
                      <div className="font-medium text-foreground">{role.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{role.roleKey}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex max-w-56 flex-wrap gap-1.5">
                        {domains.length ? domains.map((domain) => (
                          <span key={domain} className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">{DOMAIN_LABELS[domain] ?? domain}</span>
                        )) : <span className="text-muted-foreground">未配置</span>}
                      </div>
                    </td>
                    <td className="px-3 py-3" title={role.allowedSkills.join(', ')}>
                      <div className="flex max-w-80 flex-wrap gap-1.5">
                        {visibleSkills.length ? visibleSkills.map((skill) => (
                          <span key={skill} className="rounded bg-muted px-2 py-1 font-mono text-xs text-foreground">{skill}</span>
                        )) : <span className="text-muted-foreground">未授权</span>}
                        {role.allowedSkills.length > visibleSkills.length ? (
                          <span className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">+{role.allowedSkills.length - visibleSkills.length}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div>v{role.version}</div>
                      <span className="mt-1 inline-flex rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">{statusLabel(role.status)}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">{formatDate(role.updatedAt)}</td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs hover:bg-muted"
                        aria-label={`配置${role.name}`}
                        onClick={() => configureRole(role)}
                      >
                        <Settings2 className="h-3.5 w-3.5" />
                        配置
                      </button>
                    </td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">{loading ? '加载中' : '尚无角色配置'}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <aside className="min-w-0 rounded-md border border-border p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Settings2 className="h-4 w-4" />
            {selectedRoleKey ? `配置角色 · ${selectedRoleKey}` : '新建角色配置'}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">保存后创建不可变草稿版本，不会直接覆盖已发布配置。</p>
          <label htmlFor="brain-role-config-editor" className="mt-4 block text-xs font-medium text-muted-foreground">角色配置 JSON</label>
          <textarea
            id="brain-role-config-editor"
            value={editor}
            onChange={(event) => setEditor(event.target.value)}
            className="mt-2 min-h-[400px] w-full rounded-md border border-input bg-background p-3 font-mono text-xs outline-none focus:border-primary"
          />
          <button
            type="button"
            className="mt-3 inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm text-primary-foreground disabled:opacity-60"
            onClick={() => void save()}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            保存新版本
          </button>
        </aside>
      </div>
    </section>
  );
}
