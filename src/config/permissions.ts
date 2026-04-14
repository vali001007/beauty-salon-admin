/**
 * 预置角色权限映射
 */
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: ['*'],

  store_manager: [
    'dashboard:view',
    // 客户管理
    'customer:view', 'customer:profile', 'customer:script',
    // 智能营销
    'marketing:view', 'marketing:recommend', 'marketing:template', 'marketing:analytics',
    // 门店管理
    'store:project-types', 'store:projects', 'store:beauticians', 'store:beautician-levels',
    'store:scheduling', 'store:reservations',
    // 商品管理
    'goods:types', 'goods:products', 'goods:cards',
    // 订单管理
    'order:products', 'order:card-orders', 'order:card-usage',
    // 库存管理
    'inventory:products', 'inventory:stock', 'inventory:purchase',
    'inventory:expiry', 'inventory:transfer', 'inventory:consumption',
  ],

  beautician: [
    'dashboard:view',
    'store:scheduling',
    'store:reservations',
  ],

  cashier: [
    'dashboard:view',
    'order:products',
    'order:card-orders',
    'order:card-usage',
  ],

  inventory_manager: [
    'dashboard:view',
    'inventory:products',
    'inventory:stock',
    'inventory:purchase',
    'inventory:expiry',
    'inventory:transfer',
    'inventory:consumption',
  ],
};
