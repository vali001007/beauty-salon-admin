import type { AuraAction } from '../../../../../src/types/aura';
import type { AuraIntentName, AuraRiskLevel } from './intentTypes';

interface CommandDefinition {
  intent: AuraIntentName;
  action: AuraAction;
  label: string;
  loadingLabel: string;
  riskLevel: AuraRiskLevel;
  requiresConfirmation: boolean;
  writeAction?: boolean;
}

export const COMMAND_REGISTRY: CommandDefinition[] = [
  {
    intent: 'manager.dashboard.view',
    action: 'manager.dashboard',
    label: '经营',
    loadingLabel: '正在加载经营驾驶舱',
    riskLevel: 'none',
    requiresConfirmation: false,
  },
  {
    intent: 'manager.staff.view',
    action: 'manager.staff',
    label: '排班',
    loadingLabel: '正在查询员工排班',
    riskLevel: 'none',
    requiresConfirmation: false,
  },
  {
    intent: 'manager.customer_growth.view',
    action: 'manager.customers',
    label: '客户增长',
    loadingLabel: '正在筛选客户增长和流失风险',
    riskLevel: 'none',
    requiresConfirmation: false,
  },
  {
    intent: 'manager.inventory.view',
    action: 'manager.inventory',
    label: '库存',
    loadingLabel: '正在查询库存预警',
    riskLevel: 'none',
    requiresConfirmation: false,
  },
  {
    intent: 'customer.followup.view',
    action: 'customer.followup',
    label: '客户跟进',
    loadingLabel: '正在查询客户跟进任务',
    riskLevel: 'none',
    requiresConfirmation: false,
  },
  {
    intent: 'business_query.ask',
    action: 'business.query',
    label: '问数',
    loadingLabel: '正在查询 Ami_Core 运营数据',
    riskLevel: 'none',
    requiresConfirmation: false,
  },
  {
    intent: 'appointment.today.view',
    action: 'reception.appointments',
    label: '预约',
    loadingLabel: '正在查询今日预约',
    riskLevel: 'none',
    requiresConfirmation: false,
  },
  {
    intent: 'card.consume',
    action: 'operation.verify',
    label: '核销',
    loadingLabel: '正在准备次卡核销',
    riskLevel: 'medium',
    requiresConfirmation: true,
    writeAction: true,
  },
  {
    intent: 'customer.quick_create',
    action: 'operation.register',
    label: '登记',
    loadingLabel: '正在准备客户登记',
    riskLevel: 'medium',
    requiresConfirmation: true,
    writeAction: true,
  },
  {
    intent: 'cashier.checkout',
    action: 'operation.cashier',
    label: '收银',
    loadingLabel: '正在准备收银开单',
    riskLevel: 'high',
    requiresConfirmation: true,
    writeAction: true,
  },
  {
    intent: 'card_order.create',
    action: 'operation.card',
    label: '办卡',
    loadingLabel: '正在准备办卡开单',
    riskLevel: 'high',
    requiresConfirmation: true,
    writeAction: true,
  },
  {
    intent: 'recharge.create',
    action: 'operation.recharge',
    label: '充值',
    loadingLabel: '正在准备会员充值',
    riskLevel: 'high',
    requiresConfirmation: true,
    writeAction: true,
  },
  {
    intent: 'print.receipt',
    action: 'operation.print',
    label: '打印',
    loadingLabel: '正在准备打印任务',
    riskLevel: 'low',
    requiresConfirmation: false,
  },
  {
    intent: 'service_task.complete',
    action: 'operation.service-complete',
    label: '服务记录',
    loadingLabel: '正在准备服务记录',
    riskLevel: 'medium',
    requiresConfirmation: true,
    writeAction: true,
  },
  {
    intent: 'beautician.schedule.view',
    action: 'beautician.schedule',
    label: '我的预约',
    loadingLabel: '正在查询我的预约',
    riskLevel: 'none',
    requiresConfirmation: false,
  },
  {
    intent: 'beautician.commission.view',
    action: 'beautician.commission',
    label: '我的提成',
    loadingLabel: '正在查询我的提成',
    riskLevel: 'none',
    requiresConfirmation: false,
  },
  {
    intent: 'beautician.customer.view',
    action: 'beautician.customer',
    label: '我的客户',
    loadingLabel: '正在查询我的客户',
    riskLevel: 'none',
    requiresConfirmation: false,
  },
  {
    intent: 'service_record.create',
    action: 'beautician.record',
    label: '服务记录',
    loadingLabel: '正在准备服务记录',
    riskLevel: 'medium',
    requiresConfirmation: true,
    writeAction: true,
  },
  {
    intent: 'care_advice.generate',
    action: 'beautician.advice',
    label: '护理建议',
    loadingLabel: '正在生成护理建议',
    riskLevel: 'low',
    requiresConfirmation: false,
  },
];

export const COMMAND_BY_ACTION = new Map(COMMAND_REGISTRY.map((item) => [item.action, item]));
export const COMMAND_BY_INTENT = new Map(COMMAND_REGISTRY.map((item) => [item.intent, item]));

export function getCommandByAction(action: string) {
  return COMMAND_BY_ACTION.get(action as AuraAction);
}
