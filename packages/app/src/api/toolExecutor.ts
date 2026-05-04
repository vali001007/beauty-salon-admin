import {
  getCustomers, getCustomerById,
  getProductOrders,
  getCards,
  getProducts,
  getStockItems, getExpiringProducts, getReplenishmentSuggestions,
  getBeauticians,
  getSchedule,
  getMarketingActivities,
  getBomList, getBomConsumption,
} from '@/api'

type Input = Record<string, unknown>

export async function executeTool(name: string, input: Input): Promise<string> {
  try {
    const result = await dispatch(name, input)
    return JSON.stringify(result, null, 2)
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : '操作失败' })
  }
}

async function dispatch(name: string, input: Input): Promise<unknown> {
  switch (name) {
    case 'get_customers':
      return getCustomers(input as { keyword?: string; memberLevel?: string })
    case 'get_customer_by_id':
      return getCustomerById(input.id as number)
    case 'get_product_orders':
      return getProductOrders(input as { status?: string; keyword?: string })
    case 'get_cards':
      return getCards()
    case 'get_products':
      return getProducts(input as { keyword?: string; status?: string })
    case 'get_stock_items':
      return getStockItems(input as { status?: string; keyword?: string })
    case 'get_expiring_products':
      return getExpiringProducts()
    case 'get_replenishment_suggestions':
      return getReplenishmentSuggestions()
    case 'get_beauticians':
      return getBeauticians(input as { keyword?: string })
    case 'get_schedule':
      return getSchedule(input as { beauticianId: number; weekStart: string })
    case 'get_marketing_activities':
      return getMarketingActivities()
    case 'get_bom_list':
      return getBomList()
    case 'get_bom_consumption':
      return getBomConsumption(input.bomId as number)
    default:
      return { error: `未知工具: ${name}` }
  }
}
