import { createAgentRun } from '@/api'
import type { AgentRunResult, AgentToolResult } from '@/types/agent'

export type Role = 'receptionist' | 'manager' | 'beautician'

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ReportRow {
  name: string
  value: string | number
}

interface CustomerSummary {
  id: number
  name: string
  phone?: string
  memberLevel?: string
  totalSpent?: number
  visitCount?: number
  lastVisitDate?: string
  tags?: string[]
  storeName?: string
  riskDays?: number | null
}

interface StockSummary {
  id: number
  productName?: string
  name?: string
  sku?: string
  currentStock?: number
  availableStock?: number
  safetyStock?: number
  minStock?: number
  status?: string
  storeName?: string
}

interface ExpiringSummary {
  id: number
  productName?: string
  sku?: string
  remainingDays?: number
  stock?: number
  urgency?: string
  suggestion?: string
  storeName?: string
}

export type BusinessResult =
  | { type: 'daily_report'; label: string; generatedAt: string; rows: ReportRow[] }
  | { type: 'customers'; label: string; generatedAt: string; total: number; records: CustomerSummary[] }
  | { type: 'inventory_alert'; label: string; generatedAt: string; lowStock: StockSummary[]; expiring: ExpiringSummary[] }
  | { type: 'stock'; label: string; generatedAt: string; total: number; records: StockSummary[] }

function mapRole(role: Role) {
  return role === 'receptionist' ? 'reception' : role
}

function getToolLabel(result: AgentRunResult) {
  const tool = result.plan?.toolPlan?.[0]?.tool
  if (tool === 'marketing.opportunity.discover') return '商品活动机会'
  if (tool === 'business.query.ask') return '经营问数'
  if (tool === 'marketing.activity.draft') return '活动草稿审批'
  return result.plan?.goal ?? '经营 Agent'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function getToolItems(toolResult: AgentToolResult) {
  const data = isRecord(toolResult.data) ? toolResult.data : undefined
  const items = data?.items
  return Array.isArray(items) ? items.filter(isRecord) : []
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2)
  if (Array.isArray(value)) return value.map(String).join('、')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function formatToolResult(result: AgentToolResult) {
  const items = getToolItems(result)
  const lines = [`### ${result.title}`, result.summary]

  if (items.length) {
    lines.push('')
    lines.push(
      ...items.slice(0, 5).map((item, index) => {
        const title = String(item.productName ?? item.customerName ?? item.projectName ?? `结果 ${index + 1}`)
        const fields = [
          ['机会', item.opportunityType],
          ['匹配分', item.fitScore],
          ['库存', item.currentStock],
          ['近30天销量', item.salesQuantity],
          ['临期库存', item.expiringStock],
          ['毛利率', item.marginRateText],
          ['建议活动', item.suggestedCampaign],
        ]
          .filter(([, value]) => value !== undefined && value !== null && value !== '')
          .map(([label, value]) => `${label}：${formatValue(value)}`)
          .join('；')
        const reason = item.reason ? `。依据：${String(item.reason)}` : ''
        return `${index + 1}. ${title}${fields ? `：${fields}` : ''}${reason}`
      }),
    )
  }

  if (result.evidence) {
    lines.push('')
    lines.push(`数据依据：${result.evidence.source.join('、') || '未执行数据查询'}；口径：${result.evidence.metricDefinition}`)
    if (result.evidence.dateRange) lines.push(`统计周期：${result.evidence.dateRange}`)
  }

  return lines.join('\n')
}

function formatAgentAnswer(result: AgentRunResult) {
  const lines = [result.answer]
  if (result.toolResults.length) {
    lines.push('')
    lines.push(...result.toolResults.map(formatToolResult))
  }
  if (result.approval) {
    lines.push('')
    lines.push(`当前进入人工确认：${result.approval.toolName}，风险等级 ${result.approval.riskLevel}，审批 #${result.approval.id}。`)
  }
  if (result.actions.length) {
    lines.push('')
    lines.push(`可继续操作：${result.actions.map((item) => item.label).join('、')}`)
  }
  return lines.join('\n')
}

export async function sendMessage(
  userRole: Role,
  history: Message[],
  userMessage: string,
  onChunk: (chunk: string) => void,
  onToolCall?: (toolName: string) => void,
  _onBusinessResult?: (result: BusinessResult) => void,
): Promise<Message[]> {
  const previousMessages = history.slice(-6)
  const result = await createAgentRun({
    message: userMessage,
    role: mapRole(userRole),
    entrypoint: 'web_app',
    context: previousMessages.length ? { previousMessages } : undefined,
  })

  onToolCall?.(getToolLabel(result))
  const text = formatAgentAnswer(result)
  onChunk(text)

  return [
    { role: 'user', content: userMessage },
    { role: 'assistant', content: text },
  ]
}
