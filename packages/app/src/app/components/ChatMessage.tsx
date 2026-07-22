import { ReactNode } from 'react'
import type { BusinessResult } from '../../api/claude'
import type { BrainActionPreview, BrainResponseBlock } from '../../api/brain'

interface ChatMessageProps {
  type: 'ai' | 'user' | 'system'
  content?: string
  children?: ReactNode
  businessResult?: BusinessResult | null
  blocks?: BrainResponseBlock[]
  onClarificationSelect?: (label: string, value: unknown) => void
  onConfirmAction?: (action: BrainActionPreview) => void
  onRejectAction?: (action: BrainActionPreview) => void
}

function MarkdownText({ content }: { content: string }) {
  const blocks = content.split(/\n\s*\n/g).filter(Boolean)

  return (
    <div className="space-y-3">
      {blocks.map((block, index) => {
        const trimmed = block.trim()
        if (/^#{1,3}\s/.test(trimmed)) {
          const level = (trimmed.match(/^#{1,3}/)?.[0].length ?? 1) as 1 | 2 | 3
          const text = trimmed.replace(/^#{1,3}\s*/, '')
          const Tag = (`h${Math.min(level + 2, 4)}` as 'h3' | 'h4')
          return <Tag key={index} className={level === 1 ? 'text-base font-semibold text-gray-900' : 'text-sm font-semibold text-gray-900'}>{text}</Tag>
        }

        if (/^\s*[-*]\s/m.test(trimmed)) {
          return (
            <ul key={index} className="space-y-1 pl-4 text-sm text-gray-700 list-disc">
              {trimmed.split('\n').map((line, i) => (
                <li key={i}>{line.replace(/^\s*[-*]\s*/, '')}</li>
              ))}
            </ul>
          )
        }

        if (trimmed.includes('|') && trimmed.includes('---')) {
          const lines = trimmed.split('\n').filter((line) => line.includes('|'))
          const rows = lines
            .filter((line) => !/^\s*\|?\s*-{3,}/.test(line))
            .map((line) => line.split('|').map((cell) => cell.trim()).filter(Boolean))
          if (rows.length > 0) {
            const [header, ...body] = rows
            return (
              <div key={index} className="overflow-x-auto">
                <table className="min-w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                  <thead className="bg-gray-50">
                    <tr>
                      {header.map((cell, i) => (
                        <th key={i} className="text-left px-3 py-2 border-b border-gray-200 font-medium text-gray-700 whitespace-nowrap">
                          {cell}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {body.map((row, r) => (
                      <tr key={r} className="odd:bg-white even:bg-gray-50">
                        {row.map((cell, c) => (
                          <td key={c} className="px-3 py-2 border-b border-gray-100 text-gray-700 whitespace-nowrap">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        }

        return (
          <p key={index} className="text-sm leading-6 text-gray-800 whitespace-pre-wrap">
            {trimmed
              .replace(/\*\*(.+?)\*\*/g, (_, text) => `__${text}__`)
              .split(/(__.+?__)/g)
              .map((part, i) =>
                part.startsWith('__') && part.endsWith('__') ? (
                  <strong key={i} className="font-semibold text-gray-900">
                    {part.slice(2, -2)}
                  </strong>
                ) : (
                  <span key={i}>{part}</span>
                ),
              )}
          </p>
        )
      })}
    </div>
  )
}

function BusinessCard({ businessResult }: { businessResult: BusinessResult }) {
  if (businessResult.type === 'daily_report') {
    return (
      <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/70 p-3">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-blue-900">今日经营报表</div>
            <div className="text-[11px] text-blue-700">生成时间：{new Date(businessResult.generatedAt).toLocaleString('zh-CN')}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {businessResult.rows.map((row) => (
            <div key={row.name} className="rounded-lg bg-white px-3 py-2 shadow-sm">
              <div className="text-[11px] text-gray-500">{row.name}</div>
              <div className="text-sm font-semibold text-gray-900">{row.value}</div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (businessResult.type === 'customers') {
    return (
      <div className="mt-3 space-y-2">
        <div className="text-xs text-gray-500">共 {businessResult.total} 位客户，展示前 {businessResult.records.length} 位</div>
        {businessResult.records.length > 0 ? businessResult.records.map((item) => (
          <div key={item.id} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-gray-900">{item.name}</div>
                <div className="text-xs text-gray-500">{item.phone ?? '无手机号'} · {item.memberLevel ?? '无等级'} · {item.storeName ?? '未知门店'}</div>
              </div>
              <div className="rounded-full bg-amber-50 px-2 py-1 text-[11px] text-amber-700">沉睡 {item.riskDays ?? '-'} 天</div>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-gray-600">
              <div>消费 {item.totalSpent ?? 0}</div>
              <div>到店 {item.visitCount ?? 0} 次</div>
              <div>最近 {item.lastVisitDate ?? '未知'}</div>
            </div>
            {item.tags?.length ? <div className="mt-2 flex flex-wrap gap-1">{item.tags.map((tag) => <span key={tag} className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">{tag}</span>)}</div> : null}
          </div>
        )) : <div className="rounded-xl border border-dashed border-gray-200 bg-white p-4 text-sm text-gray-500">暂无数据</div>}
      </div>
    )
  }

  if (businessResult.type === 'inventory_alert') {
    return (
      <div className="mt-3 space-y-3">
        <div className="rounded-xl border border-red-100 bg-red-50 p-3">
          <div className="text-sm font-semibold text-red-900">低库存</div>
          <div className="mt-2 space-y-2">
            {businessResult.lowStock.length > 0 ? businessResult.lowStock.map((item) => (
              <div key={item.id} className="rounded-lg bg-white px-3 py-2 text-sm shadow-sm">
                <div className="font-medium text-gray-900">{item.productName ?? item.name}</div>
                <div className="text-xs text-gray-500">当前 {item.currentStock ?? 0} · 安全 {item.safetyStock ?? item.minStock ?? 0} · {item.status ?? '未知'}</div>
              </div>
            )) : <div className="text-sm text-gray-500">暂无低库存</div>}
          </div>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
          <div className="text-sm font-semibold text-amber-900">临期商品</div>
          <div className="mt-2 space-y-2">
            {businessResult.expiring.length > 0 ? businessResult.expiring.map((item) => (
              <div key={item.id} className="rounded-lg bg-white px-3 py-2 text-sm shadow-sm">
                <div className="font-medium text-gray-900">{item.productName}</div>
                <div className="text-xs text-gray-500">剩余 {item.remainingDays ?? '-'} 天 · 库存 {item.stock ?? 0} · 建议 {item.suggestion ?? '暂无'}</div>
              </div>
            )) : <div className="text-sm text-gray-500">暂无临期商品</div>}
          </div>
        </div>
      </div>
    )
  }

  if (businessResult.type === 'stock') {
    return (
      <div className="mt-3 space-y-2">
        {businessResult.records.map((item) => (
          <div key={item.id} className="rounded-xl border border-gray-200 bg-white p-3 text-sm shadow-sm">
            <div className="font-medium text-gray-900">{item.productName ?? item.name}</div>
            <div className="text-xs text-gray-500">库存 {item.currentStock ?? 0} · 安全 {item.safetyStock ?? item.minStock ?? 0} · {item.status ?? '未知'}</div>
          </div>
        ))}
      </div>
    )
  }

  return null
}

export function ChatMessage({
  type,
  content,
  children,
  businessResult,
  blocks = [],
  onClarificationSelect,
  onConfirmAction,
  onRejectAction,
}: ChatMessageProps) {
  const renderableBlocks = blocks.filter(isSupportedBrainBlock)
  if (type === 'system') {
    return (
      <div className="flex justify-center py-2">
        <span className="text-xs text-gray-400">{content}</span>
      </div>
    )
  }

  if (type === 'ai') {
    return (
      <div className="flex gap-2 items-start">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-[#C9956C] to-[#2D1B69] flex items-center justify-center text-white text-xs font-medium">
          AI
        </div>
        <div className="flex-1 max-w-[80%]">
          <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-none p-3 shadow-sm">
            {renderableBlocks.length ? (
              <AssistantBlocks
                blocks={renderableBlocks}
                onClarificationSelect={onClarificationSelect}
                onConfirmAction={onConfirmAction}
                onRejectAction={onRejectAction}
              />
            ) : content && <MarkdownText content={content} />}
            {businessResult ? <BusinessCard businessResult={businessResult} /> : null}
            {children}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-2 items-start justify-end">
      <div className="flex-1 max-w-[80%] flex justify-end">
        <div className="bg-gradient-to-r from-[#C9956C] to-[#B8845A] rounded-2xl rounded-tr-none p-3 shadow-sm">
          {content && <p className="text-sm text-white whitespace-pre-wrap">{content}</p>}
          {children}
        </div>
      </div>
    </div>
  )
}

function AssistantBlocks({
  blocks,
  onClarificationSelect,
  onConfirmAction,
  onRejectAction,
}: {
  blocks: BrainResponseBlock[]
  onClarificationSelect?: (label: string, value: unknown) => void
  onConfirmAction?: (action: BrainActionPreview) => void
  onRejectAction?: (action: BrainActionPreview) => void
}) {
  return <div className="space-y-3">{blocks.map((block, index) => {
    if (block.kind === 'text') return <p key={index} className="whitespace-pre-wrap text-sm leading-6 text-gray-800">{block.text}</p>
    if (block.kind === 'kpi') return (
      <div key={index} className="grid grid-cols-2 gap-2">
        {block.items.map((item) => (
          <div key={`${item.label}:${item.value}`} className="border-l-2 border-amber-500 pl-2">
            <div className="text-xs text-gray-500">{item.label}</div>
            <div className="break-words font-semibold text-gray-900">{item.value}</div>
            {item.hint ? <div className="text-[11px] text-gray-500">{item.hint}</div> : null}
          </div>
        ))}
      </div>
    )
    if (block.kind === 'ranking' || block.kind === 'table') return <MobileDataTable key={index} block={block} />
    if (block.kind === 'chart') return <MobileChart key={index} block={block} />
    if (block.kind === 'comparison') return (
      <div key={index} className="divide-y divide-gray-100 border border-gray-200">
        {block.items.map((item) => (
          <div key={item.label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 p-2 text-xs">
            <span className="font-medium text-gray-800">{item.label}</span>
            <span className="text-right text-gray-700">{item.current}</span>
            <span className="text-gray-500">上期 {item.previous}</span>
            <span className="text-right font-medium text-gray-800">{item.delta ?? '-'}</span>
          </div>
        ))}
      </div>
    )
    if (block.kind === 'diagnosis') return (
      <div key={index} className="space-y-2">
        {block.findings.map((finding) => (
          <div key={`${finding.title}:${finding.detail}`} className={`border-l-2 pl-3 text-sm ${finding.severity === 'critical' ? 'border-red-500 text-red-800' : finding.severity === 'warning' ? 'border-amber-500 text-amber-800' : 'border-blue-500 text-gray-700'}`}>
            <div className="font-medium">{finding.title}</div>
            <div className="mt-0.5 text-xs leading-5 opacity-90">{finding.detail}</div>
          </div>
        ))}
      </div>
    )
    if (block.kind === 'clarification') return (
      <div key={index} className="border-l-2 border-amber-500 pl-3">
        <div className="text-sm text-gray-800">{block.question}</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {block.options.map((option) => (
            <button
              key={option.id}
              type="button"
              className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900"
              onClick={() => onClarificationSelect?.(option.label, option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    )
    if (block.kind === 'action_preview') return (
      <div key={index} className="space-y-2">
        {block.actions.map((action) => (
          <div key={action.actionId} className="border border-amber-200 bg-amber-50 p-3">
            <div className="text-sm font-medium text-amber-900">待确认：{action.actionType ?? action.skillKey ?? '经营动作'}</div>
            <div className="mt-1 text-xs leading-5 text-amber-800">{action.summary}</div>
            {action.requiresConfirmation ? (
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="rounded-md bg-amber-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                  onClick={() => onConfirmAction?.(action)}
                  disabled={!onConfirmAction}
                >
                  确认执行
                </button>
                <button
                  type="button"
                  className="rounded-md border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-amber-900 disabled:opacity-50"
                  onClick={() => onRejectAction?.(action)}
                  disabled={!onRejectAction}
                >
                  拒绝
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    )
    if (block.kind === 'limitations') return <div key={index} className="border-l-2 border-amber-500 pl-3 text-sm text-amber-700">未完成：{block.items.join('；')}</div>
    if (block.kind === 'evidence') return (
      <div key={index} className="border-t border-gray-100 pt-2 text-xs leading-5 text-gray-500">
        数据依据：{block.citations.map((citation) => citation.label ?? citation.sourceId).join('、')}
      </div>
    )
    return null
  })}</div>
}

function MobileDataTable({ block }: { block: Extract<BrainResponseBlock, { kind: 'ranking' | 'table' }> }) {
  const columns = block.columns.length ? block.columns : Object.keys(block.rows[0] ?? {})
  return (
    <div className="overflow-x-auto">
      <div className="mb-1 text-xs font-medium text-gray-500">{block.kind === 'ranking' ? '排行结果' : '明细结果'}</div>
      <table className="min-w-full text-xs">
        <thead><tr>{columns.map((column) => <th key={column} className="whitespace-nowrap border-b px-2 py-1 text-left font-medium text-gray-600">{column}</th>)}</tr></thead>
        <tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{columns.map((column) => <td key={column} className="max-w-40 break-words border-b px-2 py-1.5 text-gray-700">{formatBlockValue(row[column])}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

function MobileChart({ block }: { block: Extract<BrainResponseBlock, { kind: 'chart' }> }) {
  const valueKey = block.yKeys[0]
  const values = block.rows.map((row) => Number(row[valueKey])).filter(Number.isFinite)
  const max = Math.max(...values, 0)
  if (!valueKey || !block.rows.length || max <= 0) return <div className="text-sm text-gray-500">暂无可绘制数据。</div>
  return (
    <div className="space-y-2" aria-label={block.chartType === 'line' ? '趋势数据图' : '柱状数据图'}>
      {block.rows.slice(0, 12).map((row, index) => {
        const value = Number(row[valueKey])
        const width = Number.isFinite(value) ? Math.max(2, Math.round((value / max) * 100)) : 0
        return (
          <div key={`${formatBlockValue(row[block.xKey])}:${index}`} className="grid grid-cols-[4.5rem_minmax(5rem,1fr)_auto] items-center gap-2 text-xs">
            <span className="truncate text-gray-500">{formatBlockValue(row[block.xKey])}</span>
            <span className="h-2 overflow-hidden bg-gray-100"><span className="block h-full bg-emerald-700" style={{ width: `${width}%` }} /></span>
            <span className="font-medium text-gray-700">{formatBlockValue(row[valueKey])}</span>
          </div>
        )
      })}
    </div>
  )
}

function formatBlockValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function isSupportedBrainBlock(value: unknown): value is BrainResponseBlock {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const kind = (value as { kind?: unknown }).kind
  return typeof kind === 'string' && [
    'text',
    'kpi',
    'ranking',
    'table',
    'chart',
    'comparison',
    'diagnosis',
    'clarification',
    'action_preview',
    'limitations',
    'evidence',
  ].includes(kind)
}
