import { useEffect, useState } from 'react';
import { ArchiveRestore, Edit3, History, Loader2, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  correctBrainMemory,
  deleteBrainMemory,
  listBrainMemories,
  listBrainMemoryRevisions,
  restoreBrainMemory,
} from '@/api/brain';
import type { BrainMemoryRecord, BrainMemoryRevision } from '@/types/brain';

function dateText(value?: string | null) {
  if (!value) return '长期有效';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('zh-CN');
}

export function BrainMemoryGovernance() {
  const [items, setItems] = useState<BrainMemoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editing, setEditing] = useState<BrainMemoryRecord | null>(null);
  const [content, setContent] = useState('');
  const [historyItem, setHistoryItem] = useState<BrainMemoryRecord | null>(null);
  const [revisions, setRevisions] = useState<BrainMemoryRevision[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const response = await listBrainMemories();
      setItems(response.items);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '记忆列表加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveCorrection() {
    if (!editing) return;
    let nextContent: Record<string, unknown>;
    try {
      nextContent = JSON.parse(content) as Record<string, unknown>;
    } catch {
      toast.error('记忆内容必须是有效 JSON');
      return;
    }
    setBusyId(editing.id);
    try {
      await correctBrainMemory(editing.id, { content: nextContent, reason: 'governance_console_correction' });
      setEditing(null);
      toast.success('记忆已纠正，旧版本已失效');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '记忆纠正失败');
    } finally {
      setBusyId(null);
    }
  }

  async function toggleDeleted(item: BrainMemoryRecord) {
    setBusyId(item.id);
    try {
      if (item.deletedAt) {
        await restoreBrainMemory(item.id);
        toast.success('记忆已恢复');
      } else {
        await deleteBrainMemory(item.id, 'governance_console_delete');
        toast.success('记忆已删除');
      }
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '记忆状态更新失败');
    } finally {
      setBusyId(null);
    }
  }

  async function openHistory(item: BrainMemoryRecord) {
    setHistoryItem(item);
    setHistoryLoading(true);
    try {
      const response = await listBrainMemoryRevisions(item.id);
      setRevisions(response.items);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '记忆版本记录加载失败');
      setHistoryItem(null);
    } finally {
      setHistoryLoading(false);
    }
  }

  return (
    <section className="border-t border-border pt-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">记忆治理</h2>
          <p className="mt-1 text-sm text-muted-foreground">管理偏好、决策和稳定画像；实时经营数值不会写入长期记忆。</p>
        </div>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm text-foreground"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {loading && items.length === 0 ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载记忆
        </div>
      ) : items.length === 0 ? (
        <div className="py-8 text-sm text-muted-foreground">当前门店还没有可治理记忆。</div>
      ) : (
        <div className="mt-4 overflow-x-auto border border-border">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">类型 / 主体</th>
                <th className="px-3 py-2 font-medium">内容</th>
                <th className="px-3 py-2 font-medium">置信度</th>
                <th className="px-3 py-2 font-medium">来源</th>
                <th className="px-3 py-2 font-medium">有效期</th>
                <th className="px-3 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className={`border-t border-border ${item.deletedAt ? 'opacity-55' : ''}`}>
                  <td className="px-3 py-3 align-top">
                    <div className="font-medium text-foreground">{item.type}</div>
                    <div className="mt-1 max-w-48 break-all text-xs text-muted-foreground">{item.subjectKey}</div>
                  </td>
                  <td className="max-w-md px-3 py-3 align-top text-xs leading-5 text-muted-foreground">
                    <pre className="whitespace-pre-wrap break-words font-sans">{JSON.stringify(item.content, null, 2)}</pre>
                  </td>
                  <td className="px-3 py-3 align-top">{Math.round(item.confidence * 100)}%</td>
                  <td className="px-3 py-3 align-top text-xs text-muted-foreground">Run #{item.sourceRunId ?? '-'}</td>
                  <td className="px-3 py-3 align-top text-xs text-muted-foreground">{dateText(item.expiresAt)}</td>
                  <td className="px-3 py-3 align-top">
                    <div className="flex gap-1">
                      {!item.deletedAt ? (
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-foreground"
                          title="纠正记忆"
                          onClick={() => {
                            setEditing(item);
                            setContent(JSON.stringify(item.content, null, 2));
                          }}
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-foreground"
                        title="查看版本记录"
                        onClick={() => void openHistory(item)}
                      >
                        <History className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-foreground disabled:opacity-60"
                        title={item.deletedAt ? '恢复记忆' : '删除记忆'}
                        onClick={() => void toggleDeleted(item)}
                        disabled={busyId === item.id}
                      >
                        {busyId === item.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : item.deletedAt ? (
                          <ArchiveRestore className="h-3.5 w-3.5" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-md border border-border bg-background p-5 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-foreground">纠正记忆</h3>
                <p className="mt-1 text-xs text-muted-foreground">{editing.subjectKey}</p>
              </div>
              <button type="button" className="text-muted-foreground" onClick={() => setEditing(null)} title="关闭">
                <X className="h-5 w-5" />
              </button>
            </div>
            <textarea
              className="mt-4 min-h-64 w-full rounded-md border border-input bg-background p-3 font-mono text-sm outline-none focus:border-primary"
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="h-9 rounded-md border border-border px-4 text-sm" onClick={() => setEditing(null)}>
                取消
              </button>
              <button
                type="button"
                className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm text-primary-foreground disabled:opacity-60"
                onClick={() => void saveCorrection()}
                disabled={busyId === editing.id}
              >
                {busyId === editing.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                保存纠正
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {historyItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-md border border-border bg-background p-5 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-foreground">记忆版本记录</h3>
                <p className="mt-1 text-xs text-muted-foreground">{historyItem.subjectKey}</p>
              </div>
              <button type="button" className="text-muted-foreground" onClick={() => setHistoryItem(null)} title="关闭">
                <X className="h-5 w-5" />
              </button>
            </div>
            {historyLoading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                加载版本记录
              </div>
            ) : revisions.length === 0 ? (
              <div className="py-8 text-sm text-muted-foreground">当前记忆还没有纠正、删除或恢复记录。</div>
            ) : (
              <div className="mt-4 divide-y divide-border border border-border">
                {revisions.map((revision) => (
                  <div key={revision.id} className="p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-foreground">{revision.revisionType}</span>
                      <span className="text-xs text-muted-foreground">{dateText(revision.createdAt)}</span>
                    </div>
                    {revision.reason ? <p className="mt-2 text-xs text-muted-foreground">原因：{revision.reason}</p> : null}
                    <pre className="mt-2 whitespace-pre-wrap break-words bg-muted/40 p-2 text-xs text-muted-foreground">
                      {JSON.stringify(revision.nextContent ?? revision.previousContent ?? {}, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
