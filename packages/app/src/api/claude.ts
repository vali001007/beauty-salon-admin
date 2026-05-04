import { executeTool } from './toolExecutor'

export type Role = 'receptionist' | 'manager' | 'beautician'

const ROLE_SYSTEM_PROMPTS: Record<Role, string> = {
  receptionist: `你是美业门店的智能助手，当前用户角色是前台/收银员。
你可以帮助用户：核销次卡、查询预约、开单收银、办理会员卡、查询客户信息、查看今日订单。
当系统提供了查询数据时，请基于这些真实数据回复用户，不要编造数据。
回复要简洁，用表格或列表展示数据。遇到需要确认的操作要先展示确认信息。
用中文回复，语气亲切专业。`,

  manager: `你是美业门店的智能助手，当前用户角色是店长。
你可以帮助用户：查看经营报表、营业额分析、预约管理、客户管理、营销活动、库存预警、业绩排名。
当系统提供了查询数据时，请基于这些真实数据回复用户，不要编造数据。数据量大时做摘要分析。
回复数据时要结构清晰，关键指标突出显示。
用中文回复，语气专业简洁。`,

  beautician: `你是美业门店的智能助手，当前用户角色是美容师。
你可以帮助用户：查看排班、查看预约、确认客户到店、查看客户档案、查看项目BOM。
当系统提供了查询数据时，请基于这些真实数据回复用户，不要编造数据。
用中文回复，语气亲切。`,
}

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

// 生产环境指向后端代理（VITE_PROXY_URL），本地开发回退到 aicodewith 代理
const API_URL = (import.meta.env.VITE_PROXY_URL || 'https://api.aicodewith.com') + '/v1/messages'

interface IntentRule {
  keywords: string[]
  tools: { name: string; input: Record<string, unknown> }[]
  label: string
}

const INTENT_RULES: IntentRule[] = [
  { keywords: ['客户', '流失', '会员', '顾客'], tools: [{ name: 'get_customers', input: {} }], label: '客户信息' },
  { keywords: ['订单', '收银', '营业额', '销售'], tools: [{ name: 'get_product_orders', input: {} }], label: '订单数据' },
  { keywords: ['库存', '缺货', '补货'], tools: [{ name: 'get_stock_items', input: {} }], label: '库存数据' },
  { keywords: ['过期', '临期'], tools: [{ name: 'get_expiring_products', input: {} }], label: '临期产品' },
  { keywords: ['补货建议'], tools: [{ name: 'get_replenishment_suggestions', input: {} }], label: '补货建议' },
  { keywords: ['预警'], tools: [{ name: 'get_stock_items', input: { status: '低库存' } }, { name: 'get_expiring_products', input: {} }], label: '库存预警' },
  { keywords: ['产品', '项目', '服务项目'], tools: [{ name: 'get_products', input: {} }], label: '产品列表' },
  { keywords: ['次卡', '会员卡', '卡'], tools: [{ name: 'get_cards', input: {} }], label: '卡项信息' },
  { keywords: ['排班', '班次', '值班'], tools: [{ name: 'get_beauticians', input: {} }], label: '排班信息' },
  { keywords: ['美容师', '技师', '员工'], tools: [{ name: 'get_beauticians', input: {} }], label: '美容师列表' },
  { keywords: ['营销', '活动', '促销', '优惠'], tools: [{ name: 'get_marketing_activities', input: {} }], label: '营销活动' },
  { keywords: ['BOM', '物料', '耗材'], tools: [{ name: 'get_bom_list', input: {} }], label: '物料清单' },
]

const SUMMARY_FIELDS: Record<string, string[]> = {
  get_customers: ['id', 'name', 'phone', 'memberLevel', 'totalSpent', 'visitCount', 'lastVisitDate', 'tags', 'skinCondition', 'storeName'],
  get_product_orders: ['id', 'customerName', 'totalAmount', 'status', 'createdAt', 'items'],
  get_stock_items: ['id', 'name', 'currentStock', 'minStock', 'status', 'expiryDate'],
  get_products: ['id', 'name', 'category', 'price', 'status'],
  get_beauticians: ['id', 'name', 'level', 'specialties', 'status'],
}

const MAX_RECORDS = 20

function summarizeData(toolName: string, rawJson: string): string {
  try {
    const data = JSON.parse(rawJson)
    const arr = Array.isArray(data) ? data : data?.data ?? data?.list ?? [data]
    const fields = SUMMARY_FIELDS[toolName]
    const limited = arr.slice(0, MAX_RECORDS)
    const slim = fields
      ? limited.map((item: Record<string, unknown>) => {
          const picked: Record<string, unknown> = {}
          for (const f of fields) { if (item[f] !== undefined) picked[f] = item[f] }
          return picked
        })
      : limited
    const summary = JSON.stringify(slim, null, 2)
    const totalNote = arr.length > MAX_RECORDS ? `\n(共 ${arr.length} 条记录，以上为前 ${MAX_RECORDS} 条)` : `\n(共 ${arr.length} 条记录)`
    return summary + totalNote
  } catch {
    return rawJson.slice(0, 3000)
  }
}

async function prefetchData(message: string): Promise<{ label: string; data: string } | null> {
  const lower = message.toLowerCase()
  const matched = INTENT_RULES.find((rule) => rule.keywords.some((kw) => lower.includes(kw)))
  if (!matched) return null

  const parts: string[] = []
  for (const tool of matched.tools) {
    const raw = await executeTool(tool.name, tool.input)
    parts.push(summarizeData(tool.name, raw))
  }
  return { label: matched.label, data: parts.join('\n\n') }
}

export async function sendMessage(
  userRole: Role,
  history: Message[],
  userMessage: string,
  onChunk: (chunk: string) => void,
  onToolCall?: (toolName: string) => void,
): Promise<Message[]> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  // 本地开发时需要 key（直连或 aicodewith 代理），生产环境 key 在后端代理中，前端传空字符串即可
  const authHeader = apiKey ? `Bearer ${apiKey}` : 'Bearer proxy'

  const prefetched = await prefetchData(userMessage)
  if (prefetched) onToolCall?.(prefetched.label)

  const enrichedMessage = prefetched
    ? `${userMessage}\n\n[系统已查询到以下${prefetched.label}，请基于这些真实数据回复]\n${prefetched.data}`
    : userMessage

  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: enrichedMessage },
  ]

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: ROLE_SYSTEM_PROMPTS[userRole],
      messages,
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error((err as { error?: { message?: string } }).error?.message ?? `HTTP ${response.status}`)
  }

  const result = await response.json()
  const text = (result.content ?? [])
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('')

  onChunk(text)
  return [
    { role: 'user', content: userMessage },
    { role: 'assistant', content: text },
  ]
}
