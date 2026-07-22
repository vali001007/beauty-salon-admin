import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force';
import { Bug, Maximize2, Minus, Plus, RefreshCw, Search } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { getBrainSemanticGraph, isBrainGovernanceReadCancelled } from '@/api/brain';
import type { BrainSemanticGraphEdge, BrainSemanticGraphNode, BrainSemanticGraphResponse } from '@/types/brain';

type GraphKind = BrainSemanticGraphNode['kind'];
type SimulationNode = BrainSemanticGraphNode & SimulationNodeDatum;
type SimulationEdge = BrainSemanticGraphEdge & SimulationLinkDatum<SimulationNode>;

const WIDTH = 1180;
const HEIGHT = 650;
const KIND_CONFIG: Record<GraphKind, { label: string; color: string }> = {
  entity: { label: '实体', color: '#0f766e' },
  relation: { label: '关系', color: '#7c3aed' },
  metric: { label: '指标', color: '#d97706' },
  table: { label: '数据表', color: '#475569' },
};

export function BrainSemanticGraph() {
  const navigate = useNavigate();
  const [graph, setGraph] = useState<BrainSemanticGraphResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [visibleKinds, setVisibleKinds] = useState<Set<GraphKind>>(new Set(['entity', 'relation', 'metric', 'table']));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
  const panRef = useRef<{ pointerX: number; pointerY: number; startX: number; startY: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await getBrainSemanticGraph();
      setGraph(response);
      setSelectedId((current) => current && response.nodes.some((node) => node.id === current) ? current : null);
    } catch (error) {
      if (isBrainGovernanceReadCancelled(error)) return;
      const message = error instanceof Error ? error.message : '语义图谱加载失败';
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    if (!graph) return { nodes: [] as BrainSemanticGraphNode[], edges: [] as BrainSemanticGraphEdge[] };
    const keyword = search.trim().toLocaleLowerCase('zh-CN');
    const nodes = graph.nodes.filter((node) => visibleKinds.has(node.kind) && (!keyword || [node.label, node.key, node.description, ...node.dataTables, ...node.fuzzyTerms].some((value) => value.toLocaleLowerCase('zh-CN').includes(keyword))));
    const ids = new Set(nodes.map((node) => node.id));
    return { nodes, edges: graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)) };
  }, [graph, search, visibleKinds]);

  const layout = useMemo(() => createLayout(filtered.nodes, filtered.edges), [filtered]);
  const selected = graph?.nodes.find((node) => node.id === selectedId) ?? null;
  const connectedIds = useMemo(() => {
    if (!selectedId || !graph) return new Set<string>();
    const ids = new Set<string>([selectedId]);
    graph.edges.forEach((edge) => {
      if (edge.source === selectedId) ids.add(edge.target);
      if (edge.target === selectedId) ids.add(edge.source);
    });
    return ids;
  }, [graph, selectedId]);

  function toggleKind(kind: GraphKind) {
    setVisibleKinds((current) => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind); else next.add(kind);
      return next;
    });
  }

  function zoom(delta: number) {
    setViewport((current) => ({ ...current, scale: Math.max(0.45, Math.min(2.5, current.scale + delta)) }));
  }

  function resetViewport() {
    setViewport({ x: 0, y: 0, scale: 1 });
  }

  function debugNode(node: BrainSemanticGraphNode) {
    const question = `请对语义图谱节点“${node.label}”（${node.key}）执行一次只读调试，说明它关联的实体、关系、指标和数据表。`;
    navigate(`/brain?question=${encodeURIComponent(question)}&debugSemanticGraph=${encodeURIComponent(node.id)}`);
  }

  return (
    <section className="min-w-0">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div><h2 className="text-base font-semibold">语义图谱</h2><p className="mt-1 text-sm text-muted-foreground">展示已发布实体、关系、指标与真实数据模型之间的连接；没有声明来源的数据不会生成连线。</p></div>
        <button type="button" className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm disabled:opacity-60" onClick={() => void load()} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新</button>
      </header>

      {graph ? <div className="grid gap-3 py-4 sm:grid-cols-3 xl:grid-cols-5"><Stat label="实体" value={graph.summary.entities} color={KIND_CONFIG.entity.color} /><Stat label="关系" value={graph.summary.relations} color={KIND_CONFIG.relation.color} /><Stat label="指标" value={graph.summary.metrics} color={KIND_CONFIG.metric.color} /><Stat label="数据表" value={graph.summary.tables} color={KIND_CONFIG.table.color} /><Stat label="连接" value={graph.summary.edges} color="#2563eb" /></div> : null}

      <div className="flex flex-wrap items-center gap-3 border-y border-border py-3">
        <label className="relative min-w-64 flex-1"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索节点、语义词或数据表" className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm" /></label>
        {(Object.keys(KIND_CONFIG) as GraphKind[]).map((kind) => <button key={kind} type="button" className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs ${visibleKinds.has(kind) ? 'border-current' : 'border-border text-muted-foreground opacity-50'}`} style={visibleKinds.has(kind) ? { color: KIND_CONFIG[kind].color } : undefined} onClick={() => toggleKind(kind)}><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: KIND_CONFIG[kind].color }} />{KIND_CONFIG[kind].label}</button>)}
      </div>

      {loadError ? <div className="mt-4 flex items-center justify-between border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"><span>{loadError}</span><button type="button" className="underline" onClick={() => void load()}>重试</button></div> : null}

      <div className="grid min-w-0 gap-4 py-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="relative min-h-[620px] min-w-0 overflow-hidden rounded-lg border border-border bg-[radial-gradient(circle_at_center,_hsl(var(--muted))_1px,_transparent_1px)] [background-size:20px_20px]">
          <div className="absolute right-3 top-3 z-10 flex rounded-md border border-border bg-background shadow-sm"><button type="button" aria-label="缩小" className="p-2 hover:bg-muted" onClick={() => zoom(-0.15)}><Minus className="h-4 w-4" /></button><button type="button" aria-label="重置视图" className="border-x border-border p-2 hover:bg-muted" onClick={resetViewport}><Maximize2 className="h-4 w-4" /></button><button type="button" aria-label="放大" className="p-2 hover:bg-muted" onClick={() => zoom(0.15)}><Plus className="h-4 w-4" /></button></div>
          {layout.nodes.length ? <svg role="img" aria-label="Ami Brain 语义图谱" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-[620px] w-full cursor-grab touch-none active:cursor-grabbing" onWheel={(event) => { event.preventDefault(); zoom(event.deltaY > 0 ? -0.08 : 0.08); }} onPointerDown={(event) => { panRef.current = { pointerX: event.clientX, pointerY: event.clientY, startX: viewport.x, startY: viewport.y }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (!panRef.current) return; setViewport((current) => ({ ...current, x: panRef.current!.startX + event.clientX - panRef.current!.pointerX, y: panRef.current!.startY + event.clientY - panRef.current!.pointerY })); }} onPointerUp={() => { panRef.current = null; }}>
            <defs><marker id="semantic-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" /></marker></defs>
            <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}>
              {layout.edges.map((edge) => { const source = edge.source as SimulationNode; const target = edge.target as SimulationNode; const highlighted = selectedId ? source.id === selectedId || target.id === selectedId : false; return <line key={edge.id} x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke={highlighted ? '#2563eb' : '#94a3b8'} strokeWidth={highlighted ? 2.5 : 1.2} strokeOpacity={selectedId && !highlighted ? 0.18 : 0.65} strokeDasharray={edge.kind === 'backed_by' ? '5 4' : undefined} markerEnd="url(#semantic-arrow)" />; })}
              {layout.nodes.map((node) => <GraphNode key={node.id} node={node} selected={selectedId === node.id} dimmed={Boolean(selectedId && !connectedIds.has(node.id))} onSelect={() => setSelectedId(node.id)} />)}
            </g>
          </svg> : <div className="flex h-[620px] items-center justify-center text-sm text-muted-foreground">{loading ? '正在构建语义图谱' : '当前筛选下没有节点'}</div>}
        </div>

        <aside className="rounded-lg border border-border p-4">
          {selected ? <><div className="flex items-start justify-between gap-3"><div><span className="rounded-full px-2 py-0.5 text-xs text-white" style={{ backgroundColor: KIND_CONFIG[selected.kind].color }}>{KIND_CONFIG[selected.kind].label}</span><h3 className="mt-2 font-semibold">{selected.label}</h3><p className="mt-1 break-all font-mono text-xs text-muted-foreground">{selected.key}</p></div>{selected.version ? <span className="text-xs text-muted-foreground">v{selected.version}</span> : null}</div><p className="mt-4 text-sm leading-6 text-muted-foreground">{selected.description || '暂无语义说明'}</p><Detail label="关联数据表" values={selected.dataTables} /><Detail label="模糊词条" values={selected.fuzzyTerms} /><button type="button" className="mt-5 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-border text-sm hover:bg-muted" onClick={() => debugNode(selected)}><Bug className="h-4 w-4" />调试此节点</button></> : <div className="flex min-h-48 flex-col items-center justify-center text-center text-sm text-muted-foreground"><p>点击图谱节点查看详情</p><p className="mt-2 text-xs">选中节点后会高亮直接关联关系</p></div>}
        </aside>
      </div>
    </section>
  );
}

function createLayout(nodes: BrainSemanticGraphNode[], edges: BrainSemanticGraphEdge[]) {
  const simulationNodes: SimulationNode[] = nodes.map((node) => ({ ...node }));
  const simulationEdges: SimulationEdge[] = edges.map((edge) => ({ ...edge }));
  const simulation = forceSimulation(simulationNodes).force('link', forceLink<SimulationNode, SimulationEdge>(simulationEdges).id((node) => node.id).distance((edge) => edge.kind === 'backed_by' ? 80 : 125).strength(0.8)).force('charge', forceManyBody().strength(-360)).force('center', forceCenter(WIDTH / 2, HEIGHT / 2)).force('collision', forceCollide<SimulationNode>().radius((node) => node.kind === 'metric' ? 46 : 35));
  for (let index = 0; index < 220; index += 1) simulation.tick();
  simulation.stop();
  simulationNodes.forEach((node) => { node.x = Math.max(45, Math.min(WIDTH - 45, node.x ?? WIDTH / 2)); node.y = Math.max(35, Math.min(HEIGHT - 35, node.y ?? HEIGHT / 2)); });
  return { nodes: simulationNodes, edges: simulationEdges };
}

function GraphNode({ node, selected, dimmed, onSelect }: { node: SimulationNode; selected: boolean; dimmed: boolean; onSelect: () => void }) {
  const color = KIND_CONFIG[node.kind].color;
  const label = node.label.length > 12 ? `${node.label.slice(0, 12)}…` : node.label;
  const shape = node.kind === 'relation' ? <path d="M 0 -22 L 32 0 L 0 22 L -32 0 Z" fill={color} /> : node.kind === 'metric' ? <rect x="-42" y="-22" width="84" height="44" rx="12" fill={color} /> : node.kind === 'table' ? <rect x="-34" y="-20" width="68" height="40" rx="4" fill={color} /> : <circle r="25" fill={color} />;
  return <g role="button" tabIndex={0} aria-label={`${KIND_CONFIG[node.kind].label}：${node.label}`} transform={`translate(${node.x} ${node.y})`} className="cursor-pointer outline-none" opacity={dimmed ? 0.2 : 1} onPointerDown={(event) => event.stopPropagation()} onClick={onSelect} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelect(); }}><g stroke={selected ? '#2563eb' : '#ffffff'} strokeWidth={selected ? 5 : 2}>{shape}</g><text y={node.kind === 'entity' ? 42 : 38} textAnchor="middle" className="select-none fill-foreground text-[12px] font-medium">{label}</text></g>;
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) { return <div className="rounded-lg border border-border p-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div></div>; }
function Detail({ label, values }: { label: string; values: string[] }) { return <div className="mt-4"><h4 className="text-xs font-medium text-muted-foreground">{label}</h4><div className="mt-2 flex flex-wrap gap-1">{values.length ? values.map((value) => <span key={value} className="rounded bg-muted px-2 py-1 text-xs">{value}</span>) : <span className="text-xs text-muted-foreground">暂无</span>}</div></div>; }
