import { useCallback, useEffect, useState } from 'react';
import { Bug, FileClock, Loader2, Plus, Power, RefreshCw, Save, X } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  createBrainSkill,
  isBrainGovernanceReadCancelled,
  listBrainSkills,
  listBrainSkillGovernanceHistory,
  listBrainSkillGovernanceSummaries,
  setBrainPublishedSkillEnabled,
  updateBrainSkill,
} from '@/api/brain';
import { usePermission } from '@/hooks/usePermission';
import type { BrainSkillGovernanceHistoryItem, BrainSkillGovernanceSummary } from '@/types/brain';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';

const newSkillExample = {
  skillKey: 'new_skill',
  name: '新技能',
  description: '说明该技能解决的业务问题和适用范围',
  type: 'analysis',
  inputSchema: {},
  outputSchema: {},
  permissions: ['core:brain:use'],
  riskLevel: 'low',
};

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function definitionKeys(value: unknown, prefix: 'entity.' | 'metric.'): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const definitionKey = (item as Record<string, unknown>).definitionKey;
    return typeof definitionKey === 'string' && definitionKey.startsWith(prefix)
      ? [definitionKey.slice(prefix.length)]
      : [];
  }))];
}

export function BrainSkillGovernance() {
  const navigate = useNavigate();
  const canManage = usePermission('core:brain-governance:manage');
  const [items, setItems] = useState<BrainSkillGovernanceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [historySkill, setHistorySkill] = useState<BrainSkillGovernanceSummary | null>(null);
  const [historyItems, setHistoryItems] = useState<BrainSkillGovernanceHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editor, setEditor] = useState(JSON.stringify(newSkillExample, null, 2));

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [versionResponse, registryResponse] = await Promise.all([
        listBrainSkillGovernanceSummaries({ take: 100 }),
        listBrainSkills({ summary: true }),
      ]);
      const governed = (versionResponse.items ?? []).map((item) => ({
        ...item,
        managed: true,
        domains: stringList(item.domains),
        entities: stringList(item.entities),
        metrics: stringList(item.metrics),
      }));
      const governedKeys = new Set(governed.map((item) => item.skillKey));
      const legacy = (registryResponse.items ?? [])
        .filter((item) => !governedKeys.has(item.skillKey))
        .map<BrainSkillGovernanceSummary>((item) => ({
          versionId: item.id,
          skillId: item.id,
          skillKey: item.skillKey,
          name: item.name,
          description: item.description ?? '',
          version: item.version,
          status: item.enabled ? 'active' : 'disabled',
          updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date(0).toISOString(),
          activeVersionId: null,
          activeVersion: item.version,
          enabled: item.enabled,
          historyCount: 1,
          managed: false,
          domains: stringList(item.domains),
          entities: definitionKeys(item.definitionRefs, 'entity.'),
          metrics: definitionKeys(item.definitionRefs, 'metric.'),
        }));
      setItems([...governed, ...legacy].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)));
    } catch (error) {
      if (isBrainGovernanceReadCancelled(error)) return;
      const message = error instanceof Error ? error.message : '技能列表加载失败';
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openHistory(item: BrainSkillGovernanceSummary) {
    setHistorySkill(item);
    setHistoryItems([]);
    if (!item.managed) {
      setHistoryLoading(false);
      setHistoryItems([{
        versionId: item.versionId,
        skillId: item.skillId,
        skillKey: item.skillKey,
        name: item.name,
        description: item.description,
        version: item.version,
        status: item.status,
        enabled: item.enabled,
        type: null,
        riskLevel: null,
        permissions: null,
        updatedAt: item.updatedAt,
        activatedAt: null,
        archivedAt: null,
      }]);
      return;
    }
    setHistoryLoading(true);
    try {
      const response = await listBrainSkillGovernanceHistory(item.skillKey, { take: 100 });
      setHistoryItems(response.items ?? []);
    } catch (error) {
      if (!isBrainGovernanceReadCancelled(error)) {
        toast.error(error instanceof Error ? error.message : '历史版本加载失败');
      }
    } finally {
      setHistoryLoading(false);
    }
  }

  function debugSkill(item: BrainSkillGovernanceSummary) {
    const question = `请对技能“${item.name}”（${item.skillKey}）执行一次只读调试，并说明是否命中该技能。`;
    navigate(`/brain?question=${encodeURIComponent(question)}&debugSkill=${encodeURIComponent(item.skillKey)}`);
  }

  async function toggleSkill(item: BrainSkillGovernanceSummary) {
    if (!canManage || !item.managed || !item.activeVersionId) return;
    const nextEnabled = !item.enabled;
    const confirmed = window.confirm(
      nextEnabled
        ? `确认启用“${item.name}”的生效版本 v${item.activeVersion ?? item.version}？`
        : `确认停用“${item.name}”？停用后 Ami Brain 不再选择该技能。`,
    );
    if (!confirmed) return;
    setTogglingKey(item.skillKey);
    try {
      await setBrainPublishedSkillEnabled(item.skillKey, nextEnabled);
      toast.success(nextEnabled ? '技能已启用' : '技能已停用');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '技能启停失败');
    } finally {
      setTogglingKey(null);
    }
  }

  async function saveDraft() {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(editor) as Record<string, unknown>;
    } catch {
      toast.error('配置必须是有效 JSON');
      return;
    }
    const skillKey = String(payload.skillKey ?? '').trim();
    if (!skillKey) {
      toast.error('缺少 skillKey');
      return;
    }
    setSaving(true);
    try {
      const exists = items.some((item) => item.skillKey === skillKey);
      await (exists ? updateBrainSkill(skillKey, payload) : createBrainSkill(payload));
      toast.success('技能草稿版本已保存');
      await load();
      setCreateOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '技能草稿保存失败');
    } finally {
      setSaving(false);
    }
  }

  function openCreateDialog() {
    setEditor(JSON.stringify(newSkillExample, null, 2));
    setCreateOpen(true);
  }

  return (
    <section className="min-w-0">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div>
          <h2 className="text-base font-semibold">技能注册</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            查看技能当前版本与运行状态；草稿必须通过发布中心，启停只作用于已发布的生效版本。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm text-primary-foreground disabled:opacity-60"
            onClick={openCreateDialog}
            disabled={!canManage}
            title={!canManage ? '当前账号没有技能管理权限' : undefined}
          >
            <Plus className="h-4 w-4" />
            创建 Skill
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm disabled:opacity-60"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </header>

      <div className="min-w-0 py-5">
        <div className="min-w-0">
          {loadError ? (
            <div className="mb-3 flex items-center justify-between gap-3 border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <span>{loadError}</span>
              <button type="button" className="underline" onClick={() => void load()}>重试</button>
            </div>
          ) : null}
          <div className="min-w-0 overflow-x-auto border border-border">
            <table className="w-full min-w-[1480px] text-left text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">技能 ID</th>
                  <th className="px-3 py-2">名称</th>
                  <th className="px-3 py-2">版本</th>
                  <th className="px-3 py-2">技能说明</th>
                  <th className="px-3 py-2">涉及领域</th>
                  <th className="px-3 py-2">实体</th>
                  <th className="px-3 py-2">指标</th>
                  <th className="px-3 py-2">更新时间</th>
                  <th className="px-3 py-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.length ? items.map((item) => (
                  <tr key={item.skillKey} className="border-t border-border align-top">
                    <td className="px-3 py-3 font-mono text-xs">
                      <div>{item.skillId ?? item.versionId}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">版本记录 #{item.versionId}</div>
                    </td>
                    <td className="max-w-52 px-3 py-3">
                      <div className="font-medium text-foreground">{item.name}</div>
                      <div className="mt-1 break-all text-xs text-muted-foreground">{item.skillKey}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-medium">v{item.version}</div>
                      <div className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs ${statusClass(item.status)}`}>
                        {statusLabel(item.status)}
                      </div>
                      {item.activeVersion && item.activeVersion !== item.version ? (
                        <div className="mt-1 text-xs text-muted-foreground">生效 v{item.activeVersion}</div>
                      ) : null}
                    </td>
                    <td className="max-w-sm px-3 py-3 text-sm leading-6 text-muted-foreground">
                      {item.description || '暂无技能说明'}
                    </td>
                    <td className="max-w-48 px-3 py-3"><SemanticTags values={item.domains} /></td>
                    <td className="max-w-52 px-3 py-3"><SemanticTags values={item.entities} mono /></td>
                    <td className="max-w-60 px-3 py-3"><SemanticTags values={item.metrics} mono /></td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">
                      {formatDateTime(item.updatedAt)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs hover:bg-muted"
                          onClick={() => void openHistory(item)}
                        >
                          <FileClock className="h-3.5 w-3.5" />
                          历史版本 ({item.historyCount})
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs hover:bg-muted"
                          onClick={() => debugSkill(item)}
                        >
                          <Bug className="h-3.5 w-3.5" />
                          调试
                        </button>
                        <button
                          type="button"
                          className={`inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs disabled:cursor-not-allowed disabled:opacity-50 ${
                            item.enabled ? 'border-destructive/40 text-destructive' : 'border-emerald-300 text-emerald-700'
                          }`}
                          disabled={!canManage || !item.managed || !item.activeVersionId || togglingKey === item.skillKey}
                          title={!item.managed ? '历史技能尚未进入 Ami Brain 版本治理，请先创建并发布治理版本' : !item.activeVersionId ? '当前没有已发布生效版本，请先完成发布' : !canManage ? '当前账号没有技能管理权限' : undefined}
                          onClick={() => void toggleSkill(item)}
                        >
                          {togglingKey === item.skillKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
                          {!item.managed ? '未纳管' : !item.activeVersionId ? '待发布' : item.enabled ? '停用' : '启用'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={9} className="px-3 py-10 text-center text-muted-foreground">
                      {loading ? '加载中' : '暂无技能版本'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      <Dialog open={createOpen} onOpenChange={(open) => !saving && setCreateOpen(open)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>创建 Skill 草稿版本</DialogTitle>
            <DialogDescription>
              填写新的 skillKey 会创建技能；填写已有 skillKey 会创建下一草稿版本，不会覆盖当前生效版本。
            </DialogDescription>
          </DialogHeader>
          <label htmlFor="brain-skill-editor" className="text-sm font-medium">Skill 配置 JSON</label>
          <textarea
            id="brain-skill-editor"
            value={editor}
            onChange={(event) => setEditor(event.target.value)}
            className="min-h-[420px] w-full rounded-md border border-input bg-background p-3 font-mono text-xs outline-none focus:border-primary"
          />
          <DialogFooter>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-md border border-border px-4 text-sm"
              onClick={() => setCreateOpen(false)}
              disabled={saving}
            >
              取消
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm text-primary-foreground disabled:opacity-60"
              onClick={() => void saveDraft()}
              disabled={saving || !canManage}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存新版本
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {historySkill ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="skill-history-title"
            className="max-h-[85vh] w-full max-w-5xl overflow-hidden rounded-xl border border-border bg-background shadow-xl"
          >
            <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <h3 id="skill-history-title" className="font-semibold">{historySkill.name} · 历史版本</h3>
                <p className="mt-1 text-xs text-muted-foreground">{historySkill.skillKey}</p>
              </div>
              <button
                type="button"
                aria-label="关闭历史版本"
                className="rounded-md p-2 hover:bg-muted"
                onClick={() => setHistorySkill(null)}
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="max-h-[68vh] overflow-auto p-5">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr><th className="px-3 py-2">技能 ID</th><th className="px-3 py-2">版本</th><th className="px-3 py-2">状态</th><th className="px-3 py-2">名称/说明</th><th className="px-3 py-2">类型/风险</th><th className="px-3 py-2">更新时间</th></tr>
                </thead>
                <tbody>
                  {historyItems.length ? historyItems.map((item) => (
                    <tr key={item.versionId} className="border-t border-border align-top">
                      <td className="px-3 py-3 font-mono text-xs"><div>{item.skillId ?? item.versionId}</div><div className="mt-1 text-[11px] text-muted-foreground">版本记录 #{item.versionId}</div></td>
                      <td className="px-3 py-3 font-medium">v{item.version}</td>
                      <td className="px-3 py-3"><span className={`rounded-full border px-2 py-0.5 text-xs ${statusClass(item.status)}`}>{statusLabel(item.status)}</span></td>
                      <td className="max-w-sm px-3 py-3"><div className="font-medium">{item.name}</div><div className="mt-1 text-xs leading-5 text-muted-foreground">{item.description || '暂无技能说明'}</div></td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">{item.type ?? '-'}<br />{item.riskLevel ?? '-'}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">{formatDateTime(item.updatedAt)}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">{historyLoading ? '加载历史版本' : '暂无历史版本'}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function SemanticTags({ values = [], mono = false }: { values?: string[]; mono?: boolean }) {
  const visible = values.slice(0, 2);
  if (!visible.length) return <span className="text-xs text-muted-foreground">未关联</span>;
  return (
    <div className="flex flex-wrap gap-1.5" title={values.join(', ')}>
      {visible.map((value) => (
        <span key={value} className={`rounded bg-muted px-2 py-1 text-xs text-foreground ${mono ? 'font-mono' : ''}`}>{value}</span>
      ))}
      {values.length > visible.length ? <span className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">+{values.length - visible.length}</span> : null}
    </div>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function statusLabel(status: string) {
  return ({ draft: '草稿', active: '已发布', disabled: '已停用', archived: '已归档' } as Record<string, string>)[status] ?? status;
}

function statusClass(status: string) {
  if (status === 'active') return 'border-emerald-300 text-emerald-700';
  if (status === 'draft') return 'border-amber-300 text-amber-700';
  if (status === 'disabled') return 'border-slate-300 text-slate-600';
  return 'border-border text-muted-foreground';
}
