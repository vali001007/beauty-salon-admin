import { useEffect, useState } from 'react';
import { FilePlus2, Loader2, RefreshCw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { listBrainResourceVersions } from '@/api/brain';

interface ResourceRow {
  id?: number;
  version?: number;
  status?: string;
  [key: string]: unknown;
}

interface BrainResourceGovernancePanelProps {
  title: string;
  description: string;
  resourceType: string;
  keyField: string;
  example: Record<string, unknown>;
  loadActive: () => Promise<unknown>;
  createResource: (payload: Record<string, unknown>) => Promise<unknown>;
  updateResource: (key: string, payload: Record<string, unknown>) => Promise<unknown>;
}

function rowsFrom(response: unknown): ResourceRow[] {
  if (!response || typeof response !== 'object') return [];
  const items = (response as { items?: unknown }).items;
  return Array.isArray(items) ? (items as ResourceRow[]) : [];
}

export function BrainResourceGovernancePanel({
  title,
  description,
  resourceType,
  keyField,
  example,
  loadActive,
  createResource,
  updateResource,
}: BrainResourceGovernancePanelProps) {
  const [activeItems, setActiveItems] = useState<ResourceRow[]>([]);
  const [versions, setVersions] = useState<ResourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState(JSON.stringify(example, null, 2));

  async function load() {
    setLoading(true);
    try {
      const [active, versionResponse] = await Promise.all([loadActive(), listBrainResourceVersions({ resourceType })]);
      setActiveItems(rowsFrom(active));
      setVersions(rowsFrom(versionResponse));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `${title}加载失败`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [resourceType]);

  async function save() {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(editor) as Record<string, unknown>;
    } catch {
      toast.error('配置必须是有效 JSON');
      return;
    }
    const key = String(payload[keyField] ?? '').trim();
    if (!key) {
      toast.error(`缺少 ${keyField}`);
      return;
    }
    setSaving(true);
    try {
      const exists = activeItems.some((item) => String(item[keyField] ?? '') === key) || versions.some((item) => String(item.resourceKey ?? '') === key);
      await (exists ? updateResource(key, payload) : createResource(payload));
      toast.success(`${title}草稿版本已保存`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `${title}保存失败`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <button type="button" className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm" onClick={() => void load()}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      <div className="grid gap-6 py-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 overflow-x-auto border border-border">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr><th className="px-3 py-2">资源</th><th className="px-3 py-2">版本</th><th className="px-3 py-2">状态</th><th className="px-3 py-2">更新时间/快照</th></tr>
            </thead>
            <tbody>
              {versions.length ? versions.map((item) => (
                <tr key={String(item.id)} className="border-t border-border">
                  <td className="px-3 py-3 font-medium">{String(item.resourceKey ?? item[keyField] ?? '-')}</td>
                  <td className="px-3 py-3">v{String(item.version ?? '-')}</td>
                  <td className="px-3 py-3">{String(item.status ?? '-')}</td>
                  <td className="max-w-md px-3 py-3 text-xs text-muted-foreground"><pre className="line-clamp-3 whitespace-pre-wrap font-sans">{JSON.stringify(item.snapshot ?? item)}</pre></td>
                </tr>
              )) : (
                <tr><td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">{loading ? '加载中' : '尚无治理版本'}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="border-l border-border pl-0 xl:pl-5">
          <div className="flex items-center gap-2 text-sm font-medium"><FilePlus2 className="h-4 w-4" />新建不可变草稿版本</div>
          <textarea value={editor} onChange={(event) => setEditor(event.target.value)} className="mt-3 min-h-[360px] w-full rounded-md border border-input bg-background p-3 font-mono text-xs outline-none focus:border-primary" />
          <button type="button" className="mt-3 inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm text-primary-foreground disabled:opacity-60" onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            保存新版本
          </button>
        </div>
      </div>
    </section>
  );
}
