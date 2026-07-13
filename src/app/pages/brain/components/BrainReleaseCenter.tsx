import { useEffect, useState } from 'react';
import { Loader2, RefreshCw, Rocket, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { activateBrainRelease, createBrainRelease, listBrainReleases, listBrainResourceVersions, rollbackBrainRelease } from '@/api/brain';

interface Version { id: number; resourceType: string; resourceKey: string; version: number; status: string }
interface Release { id: number; releaseKey: string; scope: string; status: string; items?: unknown[]; createdAt: string }
function itemsFrom<T>(response: unknown) { const items = response && typeof response === 'object' ? (response as { items?: unknown }).items : undefined; return Array.isArray(items) ? items as T[] : []; }

export function BrainReleaseCenter() {
  const [versions, setVersions] = useState<Version[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [releaseKey, setReleaseKey] = useState('');
  const [scope, setScope] = useState('global');
  const [scopeValue, setScopeValue] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [versionResponse, releaseResponse] = await Promise.all([listBrainResourceVersions({ status: 'draft' }), listBrainReleases()]);
      setVersions(itemsFrom<Version>(versionResponse));
      setReleases(itemsFrom<Release>(releaseResponse));
    } catch (error) { toast.error(error instanceof Error ? error.message : '发布数据加载失败'); }
  }
  useEffect(() => { void load(); }, []);

  async function create() {
    if (!releaseKey.trim() || !selected.length) { toast.error('请填写发布标识并选择资源版本'); return; }
    const rollout = scope === 'store' ? { storeIds: scopeValue.split(',').map(Number).filter(Boolean) } : scope === 'role' ? { roleKeys: scopeValue.split(',').map((v) => v.trim()).filter(Boolean) } : scope === 'percentage' ? { userPercentage: Number(scopeValue) } : {};
    setBusy(true);
    try { await createBrainRelease({ releaseKey, scope, rollout, resourceVersionIds: selected }); toast.success('发布草稿已创建'); setSelected([]); await load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : '发布草稿创建失败'); }
    finally { setBusy(false); }
  }

  async function activate(id: number) { setBusy(true); try { await activateBrainRelease(id); toast.success('发布已激活'); await load(); } catch (error) { toast.error(error instanceof Error ? error.message : '发布门禁未通过'); } finally { setBusy(false); } }
  async function rollback(id: number) { setBusy(true); try { await rollbackBrainRelease(id, 'governance_console_rollback'); toast.success('已回滚到上一稳定版本'); await load(); } catch (error) { toast.error(error instanceof Error ? error.message : '回滚失败'); } finally { setBusy(false); } }

  return <section>
    <div className="border-b border-border pb-4"><h2 className="text-base font-semibold">发布与回滚</h2><p className="mt-1 text-sm text-muted-foreground">发布必须包含资源版本并通过关联评测；支持全局、门店、角色和用户比例灰度。</p></div>
    <div className="grid gap-6 py-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="overflow-x-auto border border-border"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-3 py-2">发布</th><th className="px-3 py-2">范围</th><th className="px-3 py-2">状态</th><th className="px-3 py-2">资源</th><th className="px-3 py-2">操作</th></tr></thead><tbody>{releases.length ? releases.map((release) => <tr key={release.id} className="border-t border-border"><td className="px-3 py-3 font-medium">{release.releaseKey}<div className="text-xs text-muted-foreground">#{release.id}</div></td><td className="px-3 py-3">{release.scope}</td><td className="px-3 py-3">{release.status}</td><td className="px-3 py-3">{release.items?.length ?? 0}</td><td className="px-3 py-3"><div className="flex gap-1">{release.status === 'draft' ? <button title="激活" type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border" onClick={() => void activate(release.id)} disabled={busy}><Rocket className="h-4 w-4" /></button> : null}{release.status === 'active' ? <button title="回滚" type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border" onClick={() => void rollback(release.id)} disabled={busy}><RotateCcw className="h-4 w-4" /></button> : null}</div></td></tr>) : <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">暂无发布</td></tr>}</tbody></table></div>
      <div className="border-l border-border pl-0 xl:pl-5"><h3 className="text-sm font-medium">创建发布草稿</h3><input value={releaseKey} onChange={(e) => setReleaseKey(e.target.value)} placeholder="release-key" className="mt-3 h-9 w-full rounded-md border border-input bg-background px-3 text-sm" /><div className="mt-3 flex gap-2"><select value={scope} onChange={(e) => setScope(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm"><option value="global">全局</option><option value="store">门店</option><option value="role">角色</option><option value="percentage">比例</option></select>{scope !== 'global' ? <input value={scopeValue} onChange={(e) => setScopeValue(e.target.value)} placeholder={scope === 'percentage' ? '百分比' : '逗号分隔'} className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm" /> : null}</div><div className="mt-4 max-h-64 overflow-auto border border-border">{versions.map((version) => <label key={version.id} className="flex items-start gap-2 border-b border-border px-3 py-2 text-xs last:border-b-0"><input type="checkbox" checked={selected.includes(version.id)} onChange={(e) => setSelected((current) => e.target.checked ? [...current, version.id] : current.filter((id) => id !== version.id))} /><span>{version.resourceType} / {version.resourceKey} v{version.version}</span></label>)}</div><button type="button" className="mt-3 inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm text-primary-foreground disabled:opacity-60" onClick={() => void create()} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}创建草稿</button><button type="button" title="刷新" className="ml-2 inline-flex h-9 w-9 items-center justify-center rounded-md border border-border" onClick={() => void load()}><RefreshCw className="h-4 w-4" /></button></div>
    </div>
  </section>;
}
