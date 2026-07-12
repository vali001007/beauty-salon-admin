import { createBrainConversation, sendBrainMessage, type BrainChatResponse, type BrainRoleKey } from '@/api'
import { useAuthStore } from '@/stores/authStore'
import { useStoreStore } from '@/stores/storeStore'

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

function mapRole(role: Role): BrainRoleKey {
  return role === 'manager' ? 'store_manager' : role
}

function conversationStorageKey(role: Role) {
  const userId = useAuthStore.getState().user?.id ?? 0
  const storeId = useStoreStore.getState().currentStoreId ?? 0
  return `ami-brain:mobile:${userId}:${storeId}:${role}`
}

async function createAndRememberConversation(role: Role) {
  const conversation = await createBrainConversation('移动经营助手')
  window.localStorage.setItem(conversationStorageKey(role), String(conversation.id))
  return conversation.id
}

async function resolveConversation(role: Role) {
  const cached = Number(window.localStorage.getItem(conversationStorageKey(role)))
  return Number.isInteger(cached) && cached > 0 ? cached : createAndRememberConversation(role)
}

function formatBrainAnswer(result: BrainChatResponse) {
  const lines = [result.answer]
  if (result.citations.length) {
    lines.push('')
    lines.push(`数据依据：${result.citations.map((item) => item.label ?? item.sourceId).join('、')}`)
  }
  if (result.suggestedActions.length) {
    lines.push('')
    lines.push(...result.suggestedActions.map((action) => `待确认动作：${action.summary}（${action.riskLevel}）`))
  }
  if (result.clarification) {
    lines.push('')
    lines.push(result.clarification.question)
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
  void history
  onToolCall?.('Ami Brain')
  let conversationId = await resolveConversation(userRole)
  let result: BrainChatResponse
  try {
    result = await sendBrainMessage(conversationId, {
      message: userMessage,
      roleHint: mapRole(userRole),
      timezone: 'Asia/Shanghai',
    })
  } catch (error) {
    const status = (error as Error & { payload?: { status?: number } }).payload?.status
    if (status !== 404) throw error
    conversationId = await createAndRememberConversation(userRole)
    result = await sendBrainMessage(conversationId, {
      message: userMessage,
      roleHint: mapRole(userRole),
      timezone: 'Asia/Shanghai',
    })
  }

  const text = formatBrainAnswer(result)
  onChunk(text)

  return [
    { role: 'user', content: userMessage },
    { role: 'assistant', content: text },
  ]
}
