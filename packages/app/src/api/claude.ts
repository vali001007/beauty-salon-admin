import {
  getCustomers,
  getProductOrders,
  getStockItems,
  getExpiringProducts,
  getReplenishmentSuggestions,
  getBeauticians,
  getMarketingActivities,
  getBomList,
  getCards,
  getProducts,
} from '@/api'
import { executeTool } from './toolExecutor'

export type Role = 'receptionist' | 'manager' | 'beautician'

const ROLE_SYSTEM_PROMPTS: Record<Role, string> = {
  receptionist: `你是美业门店的智能助手，当前用户角色是前台/收银员。
你可以帮助用户：核销次卡、查询预约、开单收银、办理会员卡、查询客户信息、查看今日订单。
当系统提供了查询数据时，请基于这些真实数据回复用户，不要编造数据。
回复要简洁，尽量用短段落和要点列表。不要使用 Markdown 表格作为主要展示。
如果系统已经提供了结构化数据，只做简短总结，不要重复输出大表格。
遇到需要确认的操作要先展示确认信息。
用中文回复，语气亲切专业。`,

  manager: `你是美业门店的智能助手，当前用户角色是店长。
你可以帮助用户：查看经营报表、营业额分析、预约管理、客户管理、营销活动、库存预警、业绩排名。
当系统提供了查询数据时，请基于这些真实数据回复用户，不要编造数据。数据量大时做摘要分析。
回复数据时要结构清晰，关键指标突出显示。不要使用 Markdown 表格作为主要展示。
如果系统已经展示了经营报表、客户卡片或库存卡片，你只需补充简短分析和建议。
用中文回复，语气专业简洁。`,

  beautician: `你是美业门店的智能助手，当前用户角色是美容师。
你可以帮助用户：查看排班、查看预约、确认客户到店、查看客户档案、查看项目BOM。
当系统提供了查询数据时，请基于这些真实数据回复用户，不要编造数据。
不要使用 Markdown 表格作为主要展示。
用中文回复，语气亲切。`,
}

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

export type BusinessResult =
  | { type: 'daily_report'; label: string; generatedAt: string; rows: ReportRow[] }
  | { type: 'customers'; label: string; generatedAt: string; total: number; records: CustomerSummary[] }
  | { type: 'inventory_alert'; label: string; generatedAt: string; lowStock: StockSummary[]; expiring: ExpiringSummary[] }
  | { type: 'stock'; label: string; generatedAt: string; total: number; records: StockSummary[] }

const configuredProxyBase = (import.meta.env.VITE_PROXY_URL || import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '')
const proxyBase = configuredProxyBase.endsWith('/api') ? configuredProxyBase.slice(0, -4) : configuredProxyBase
const API_URL = proxyBase + '/v1/messages'

interface IntentRule {
  keywords: string[]
  tools: { name: string; input: Record<string, unknown> }[]
  label: string
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

const INTENT_RULES: IntentRule[] = [
  { keywords: ['今日经营报表', '经营报表', '今日报表', '经营概览', '营业额', '今日营业额', '报表', '今日经营情况', '店里情况', '店里情况怎么样'], tools: [], label: '经营报表' },
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

async function buildDailyReport(): Promise<Extract<BusinessResult, { type: 'daily_report' }>> {
  const [customers, orders, stock, expiring, replenish, beauticians, marketing, bomList, cards, products] = await Promise.all([
    getCustomers(),
    getProductOrders(),
    getStockItems(),
    getExpiringProducts(),
    getReplenishmentSuggestions(),
    getBeauticians(),
    getMarketingActivities(),
    getBomList(),
    getCards(),
    getProducts(),
  ])

  const todayKey = new Date().toISOString().slice(0, 10)
  const todayOrders = orders.filter((o: { createdAt?: string }) => String(o.createdAt ?? '').includes(todayKey))
  const totalRevenue = orders.reduce((sum: number, o: { totalAmount?: number }) => sum + Number(o.totalAmount ?? 0), 0)
  const lowStockCount = stock.filter((s: { status?: string }) => s.status === '低库存').length
  const activeMarketing = marketing.filter((m: { status?: string }) => String(m.status ?? '').includes('进行')).length

  const rows: ReportRow[] = [
    { name: '客户总数', value: customers.length },
    { name: '订单总数', value: orders.length },
    { name: '今日订单', value: todayOrders.length },
    { name: '累计营业额', value: `￥${totalRevenue.toLocaleString('zh-CN')}` },
    { name: '库存预警', value: lowStockCount },
    { name: '临期商品', value: expiring.length },
    { name: '补货建议', value: replenish.length },
    { name: '美容师人数', value: beauticians.length },
    { name: '进行中营销活动', value: activeMarketing },
    { name: 'BOM 项目数', value: bomList.length },
    { name: '卡项数量', value: cards.length },
    { name: '商品数量', value: products.length },
  ]

  return {
    type: 'daily_report',
    label: '经营报表',
    generatedAt: new Date().toISOString(),
    rows,
  }
}

const SUMMARY_FIELDS: Record<string, string[]> = {
  get_customers: ['id', 'name', 'phone', 'memberLevel', 'totalSpent', 'visitCount', 'lastVisitDate', 'tags', 'skinCondition', 'storeName'],
  get_product_orders: ['id', 'customerName', 'totalAmount', 'status', 'createdAt', 'items'],
  get_stock_items: ['id', 'name', 'currentStock', 'minStock', 'status', 'expiryDate'],
  get_products: ['id', 'name', 'category', 'price', 'status'],
  get_beauticians: ['id', 'name', 'level', 'specialties', 'status'],
}

const MAX_RECORDS = 20

function parseToolResult(rawJson: string): unknown[] {
  const data = JSON.parse(rawJson)
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.data)) return data.data
  if (Array.isArray(data?.list)) return data.list
  return data ? [data] : []
}

function daysSince(date?: string): number | null {
  if (!date) return null
  const time = new Date(date).getTime()
  if (Number.isNaN(time)) return null
  return Math.max(0, Math.floor((Date.now() - time) / 86400000))
}

function pickCustomers(rawJson: string): CustomerSummary[] {
  return parseToolResult(rawJson)
    .map((item) => item as Record<string, unknown>)
    .map((item) => ({
      id: Number(item.id),
      name: String(item.name ?? ''),
      phone: item.phone ? String(item.phone) : undefined,
      memberLevel: item.memberLevel ? String(item.memberLevel) : undefined,
      totalSpent: Number(item.totalSpent ?? 0),
      visitCount: Number(item.visitCount ?? 0),
      lastVisitDate: item.lastVisitDate ? String(item.lastVisitDate) : undefined,
      tags: Array.isArray(item.tags) ? item.tags.map(String) : undefined,
      storeName: item.storeName ? String(item.storeName) : undefined,
      riskDays: daysSince(item.lastVisitDate ? String(item.lastVisitDate) : undefined),
    }))
    .sort((a, b) => (b.riskDays ?? -1) - (a.riskDays ?? -1))
    .slice(0, 8)
}

function pickStock(rawJson: string): StockSummary[] {
  return parseToolResult(rawJson)
    .map((item) => item as Record<string, unknown>)
    .map((item) => ({
      id: Number(item.id),
      productName: item.productName ? String(item.productName) : undefined,
      name: item.name ? String(item.name) : undefined,
      sku: item.sku ? String(item.sku) : undefined,
      currentStock: Number(item.currentStock ?? 0),
      availableStock: Number(item.availableStock ?? 0),
      safetyStock: Number(item.safetyStock ?? item.minStock ?? 0),
      minStock: Number(item.minStock ?? item.safetyStock ?? 0),
      status: item.status ? String(item.status) : undefined,
      storeName: item.storeName ? String(item.storeName) : undefined,
    }))
}

function pickExpiring(rawJson: string): ExpiringSummary[] {
  return parseToolResult(rawJson)
    .map((item) => item as Record<string, unknown>)
    .map((item) => ({
      id: Number(item.id),
      productName: item.productName ? String(item.productName) : undefined,
      sku: item.sku ? String(item.sku) : undefined,
      remainingDays: Number(item.remainingDays ?? 0),
      stock: Number(item.stock ?? 0),
      urgency: item.urgency ? String(item.urgency) : undefined,
      suggestion: item.suggestion ? String(item.suggestion) : undefined,
      storeName: item.storeName ? String(item.storeName) : undefined,
    }))
    .sort((a, b) => (a.remainingDays ?? 0) - (b.remainingDays ?? 0))
    .slice(0, 8)
}

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

async function prefetchData(message: string): Promise<{ label: string; data: string; result?: BusinessResult } | null> {
  const lower = message.toLowerCase()
  const matched = INTENT_RULES.find((rule) => rule.keywords.some((kw) => lower.includes(kw)))
  if (!matched) return null

  if (matched.label === '经营报表') {
    const report = await buildDailyReport()
    return { label: matched.label, data: JSON.stringify(report, null, 2), result: report }
  }

  const parts: string[] = []
  let result: BusinessResult | undefined
  for (const tool of matched.tools) {
    const raw = await executeTool(tool.name, tool.input)
    if (!result && tool.name === 'get_customers') {
      const records = pickCustomers(raw)
      result = {
        type: 'customers',
        label: matched.label,
        generatedAt: new Date().toISOString(),
        total: parseToolResult(raw).length,
        records,
      }
    }
    if (!result && tool.name === 'get_stock_items' && matched.label === '库存数据') {
      const records = pickStock(raw).slice(0, 8)
      result = {
        type: 'stock',
        label: matched.label,
        generatedAt: new Date().toISOString(),
        total: parseToolResult(raw).length,
        records,
      }
    }
    parts.push(summarizeData(tool.name, raw))
  }

  if (matched.label === '库存预警') {
    const [stockRaw, expiringRaw] = await Promise.all([
      executeTool('get_stock_items', {}),
      executeTool('get_expiring_products', {}),
    ])
    result = {
      type: 'inventory_alert',
      label: matched.label,
      generatedAt: new Date().toISOString(),
      lowStock: pickStock(stockRaw).filter((item) => item.status === '低库存' || item.status === '缺货').slice(0, 8),
      expiring: pickExpiring(expiringRaw),
    }
  }

  return { label: matched.label, data: parts.join('\n\n'), result }
}

export async function sendMessage(
  userRole: Role,
  history: Message[],
  userMessage: string,
  onChunk: (chunk: string) => void,
  onToolCall?: (toolName: string) => void,
  onBusinessResult?: (result: BusinessResult) => void,
): Promise<Message[]> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  // 本地开发时需要 key（直连或 aicodewith 代理），生产环境 key 在后端代理中，前端传空字符串即可
  const authHeader = apiKey ? `Bearer ${apiKey}` : 'Bearer proxy'

  const prefetched = await prefetchData(userMessage)
  if (prefetched) onToolCall?.(prefetched.label)
  if (prefetched?.result) onBusinessResult?.(prefetched.result)

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
