export const BRAIN_AGENT_CARDS = [
  { roleKey: 'store_manager', name: '店长 Agent', skills: ['diagnose_business', 'summarize_actions'] },
  { roleKey: 'receptionist', name: '前台 Agent', skills: ['query_reservation', 'preview_reservation_action', 'query_cashier'] },
  { roleKey: 'beautician', name: '美容师 Agent', skills: ['query_service_task', 'query_personal_performance'] },
  { roleKey: 'marketing', name: '营销 Agent', skills: ['query_lifecycle', 'recommend_campaign', 'preview_marketing_task'] },
  { roleKey: 'finance', name: '财务 Agent', skills: ['query_revenue', 'query_margin', 'query_commission'] },
  { roleKey: 'inventory', name: '库存 Agent', skills: ['query_stock', 'inspect_expiry', 'preview_replenishment'] },
  { roleKey: 'customer_service', name: '客服 Agent', skills: ['query_followup', 'recommend_care_script'] },
] as const;

export type BrainAgentRoleKey = (typeof BRAIN_AGENT_CARDS)[number]['roleKey'];
