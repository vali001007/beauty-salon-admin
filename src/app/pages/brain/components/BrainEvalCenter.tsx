import { useEffect, useState } from 'react';
import { Loader2, Play, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { createBrainEvalRun, getBrainEvalRun, listBrainEvalRuns } from '@/api/brain';

interface EvalRun {
  id: number;
  releaseId?: number | null;
  roleKey?: string | null;
  status: string;
  caseCount: number;
  passedCount: number;
  failedCount: number;
  summary?: Record<string, unknown>;
  createdAt: string;
}

function itemsFrom(response: unknown) {
  const items = response && typeof response === 'object' ? (response as { items?: unknown }).items : undefined;
  return Array.isArray(items) ? (items as EvalRun[]) : [];
}

export function BrainEvalCenter() {
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [releaseId, setReleaseId] = useState('');
  const [roleKey, setRoleKey] = useState('');
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);

  async function load() {
    setLoading(true);
    try { setRuns(itemsFrom(await listBrainEvalRuns())); }
    catch (error) { toast.error(error instanceof Error ? error.message : '评测列表加载失败'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function start() {
    setStarting(true);
    try {
      await createBrainEvalRun({
        releaseId: releaseId ? Number(releaseId) : undefined,
        roleKey: roleKey || undefined,
        modelVersion: 'ami-brain-governed',
      });
      toast.success('评测已进入异步队列');
      await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : '评测启动失败'); }
    finally { setStarting(false); }
  }

  async function openDetail(id: number) {
    try { setDetail(await getBrainEvalRun(id) as Record<string, unknown>); }
    catch (error) { toast.error(error instanceof Error ? error.message : '评测详情加载失败'); }
  }

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <div><h2 className="text-base font-semibold">评测中心</h2><p className="mt-1 text-sm text-muted-foreground">确定性 grader 与 LLM Judge 分开保存；空结果不能进入发布。</p></div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted-foreground">发布 ID<input value={releaseId} onChange={(event) => setReleaseId(event.target.value)} className="mt-1 block h-9 w-28 rounded-md border border-input bg-background px-2 text-sm" /></label>
          <label className="text-xs text-muted-foreground">角色<input value={roleKey} onChange={(event) => setRoleKey(event.target.value)} placeholder="全部" className="mt-1 block h-9 w-36 rounded-md border border-input bg-background px-2 text-sm" /></label>
          <button type="button" className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm text-primary-foreground disabled:opacity-60" onClick={() => void start()} disabled={starting}>{starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}发起评测</button>
          <button type="button" title="刷新" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border" onClick={() => void load()}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto border border-border">
        <table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-3 py-2">运行</th><th className="px-3 py-2">状态</th><th className="px-3 py-2">通过</th><th className="px-3 py-2">失败</th><th className="px-3 py-2">发布/角色</th><th className="px-3 py-2">操作</th></tr></thead>
          <tbody>{runs.length ? runs.map((run) => <tr key={run.id} className="border-t border-border"><td className="px-3 py-3">#{run.id}<div className="text-xs text-muted-foreground">{new Date(run.createdAt).toLocaleString('zh-CN')}</div></td><td className="px-3 py-3">{run.status}</td><td className="px-3 py-3">{run.passedCount}/{run.caseCount}</td><td className="px-3 py-3">{run.failedCount}</td><td className="px-3 py-3 text-xs">Release #{run.releaseId ?? '-'}<br />{run.roleKey ?? '全部角色'}</td><td className="px-3 py-3"><button type="button" className="h-8 rounded-md border border-border px-3 text-xs" onClick={() => void openDetail(run.id)}>逐题结果</button></td></tr>) : <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">{loading ? '加载中' : '暂无评测运行'}</td></tr>}</tbody>
        </table>
      </div>
      {detail ? <div className="mt-5 border-t border-border pt-4"><h3 className="text-sm font-medium">逐题结果</h3><pre className="mt-3 max-h-[480px] overflow-auto whitespace-pre-wrap rounded-md bg-muted p-4 text-xs">{JSON.stringify(detail, null, 2)}</pre></div> : null}
    </section>
  );
}
