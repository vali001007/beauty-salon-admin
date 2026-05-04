import type { Role } from './claude'

interface ToolParam {
  type: string
  description: string
  enum?: string[]
}

export interface ToolDef {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, ToolParam>
    required?: string[]
  }
}

const ALL_TOOLS: ToolDef[] = [
  {
    name: 'get_customers',
    description: '查询客户列表，可按关键词或会员等级筛选',
    input_schema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '搜索关键词（姓名/手机号）' },
        memberLevel: { type: 'string', description: '会员等级筛选' },
      },
    },
  },
  {
    name: 'get_customer_by_id',
    description: '根据 ID 查询单个客户详情',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: '客户 ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_product_orders',
    description: '查询产品订单列表，可按状态或关键词筛选',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: '订单状态' },
        keyword: { type: 'string', description: '搜索关键词' },
      },
    },
  },
  {
    name: 'get_cards',
    description: '查询所有次卡/会员卡列表',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_products',
    description: '查询产品列表，可按分类、状态、关键词筛选',
    input_schema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '搜索关键词' },
        status: { type: 'string', description: '产品状态' },
      },
    },
  },
  {
    name: 'get_stock_items',
    description: '查询库存列表，可按状态筛选（正常/低库存/积压/缺货）',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: '库存状态', enum: ['正常', '低库存', '积压', '缺货'] },
        keyword: { type: 'string', description: '搜索关键词' },
      },
    },
  },
  {
    name: 'get_expiring_products',
    description: '查询即将过期的产品列表',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_replenishment_suggestions',
    description: '获取补货建议',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_beauticians',
    description: '查询美容师列表',
    input_schema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '搜索关键词' },
      },
    },
  },
  {
    name: 'get_schedule',
    description: '查询美容师排班表',
    input_schema: {
      type: 'object',
      properties: {
        beauticianId: { type: 'number', description: '美容师 ID' },
        weekStart: { type: 'string', description: '周起始日期 (YYYY-MM-DD)' },
      },
      required: ['beauticianId', 'weekStart'],
    },
  },
  {
    name: 'get_marketing_activities',
    description: '查询营销活动列表',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_bom_list',
    description: '查询项目 BOM（物料清单）列表',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_bom_consumption',
    description: '查询某个项目的物料消耗记录',
    input_schema: {
      type: 'object',
      properties: {
        bomId: { type: 'number', description: '项目 BOM ID' },
      },
      required: ['bomId'],
    },
  },
]

const ROLE_TOOL_NAMES: Record<Role, string[]> = {
  receptionist: [
    'get_customers', 'get_customer_by_id', 'get_product_orders',
    'get_cards', 'get_products',
  ],
  manager: [
    'get_customers', 'get_customer_by_id', 'get_product_orders',
    'get_cards', 'get_products', 'get_stock_items', 'get_expiring_products',
    'get_replenishment_suggestions', 'get_beauticians', 'get_schedule',
    'get_marketing_activities',
  ],
  beautician: [
    'get_schedule', 'get_customer_by_id', 'get_beauticians',
    'get_bom_list', 'get_bom_consumption',
  ],
}

export function getToolsForRole(role: Role): ToolDef[] {
  const names = ROLE_TOOL_NAMES[role]
  return ALL_TOOLS.filter((t) => names.includes(t.name))
}