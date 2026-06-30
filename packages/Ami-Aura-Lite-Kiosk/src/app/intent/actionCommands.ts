import type { OperationResultData } from '../types';

export type AgentApprovalActionDecision = 'approve' | 'reject';

export interface AgentApprovalAction {
  approvalId: number;
  decision: AgentApprovalActionDecision;
}

export function parseAgentApprovalAction(action: string): AgentApprovalAction | null {
  const approveMatch = /^approve:(\d+)$/.exec(action);
  if (approveMatch) return { approvalId: Number(approveMatch[1]), decision: 'approve' };

  const rejectMatch = /^(?:reject:(\d+)|approve:(\d+):cancel)$/.exec(action);
  if (rejectMatch) return { approvalId: Number(rejectMatch[1] ?? rejectMatch[2]), decision: 'reject' };

  return null;
}

export function businessQueryActionToCommand(action: string) {
  if (action.startsWith('product:')) return '查看这个商品详情';
  if (action.startsWith('marketing:draft:product:')) return '给这些商品创建营销活动草稿';
  if (action === 'business-query:order_revenue_analysis') return '今天订单收入怎么样';
  if (action === 'business-query:inventory_alert') return '哪些商品库存不足';
  if (action === 'business-query:finance_today_transaction_list') return '列出今天所有收银、核销、办卡订单列表，支持打印操作';
  if (action === 'business-query:business_overview') return '今天经营概览';
  if (action === 'marketing:effects') return '最近活动转化怎么样';
  if (action === 'automation:summary') return '自动化执行复盘';
  if (action === 'purchase:draft:context') return '根据这些商品生成补货单草稿';
  if (action === 'inventory.expiring.consume_plan.draft') return '根据临期库存生成消耗计划';
  if (action === 'print:today_transactions') return '打印今天交易订单清单';
  if (action === 'business-query:project_material_margin') return '项目耗材毛利';
  if (action === 'scheduling:open') return '今天排班占用率怎么样';
  if (action === 'orders:open') return '今天订单收入怎么样';
  if (action === 'finance:open') return '今日实收和费用';
  return action;
}

export function agentActionToCommand(action: string) {
  if (parseAgentApprovalAction(action)) return action;
  if (action === 'agent:tool:marketing.activity.draft') return '帮我生成活动草稿';
  if (action === 'agent:tool:marketing.opportunity.discover') return '发现营销机会';
  if (action === 'agent:tool:customer.followup.task.draft') return '帮我生成客户跟进任务';
  if (action === 'agent:tool:inventory.replenishment.draft') return '根据低库存生成补货采购草稿';
  if (action === 'agent:tool:scheduling.optimization.preview') return '生成排班优化预览';
  if (action === 'terminal:followup-tasks') return 'manager.customers';
  if (action === 'customers:data') return 'manager.customers';
  if (action.startsWith('inventory:purchase-order:')) return action;
  if (action === 'inventory:stock') return 'manager.inventory';
  if (action === 'beautician.record') return 'beautician.record';
  if (action === 'beautician.schedule') return 'beautician.schedule';
  if (action === 'scheduling:open' || action.startsWith('scheduling:preview:')) return action;
  if (action.startsWith('product:')) return '查看这个商品详情';
  return businessQueryActionToCommand(action);
}

export function isInternalActionCode(action: string) {
  return /^[a-z][a-z0-9-]*(?::[a-z0-9-]+)+$/i.test(action);
}

function buildManagementLinkResult(params: {
  title: string;
  subtitle: string;
  description: string;
  nextSteps: string[];
  status?: OperationResultData['status'];
}): OperationResultData {
  return {
    title: params.title,
    subtitle: params.subtitle,
    status: params.status ?? 'success',
    description: params.description,
    nextSteps: params.nextSteps,
  };
}

export function resolveTerminalActionResult(action: string): OperationResultData | null {
  const marketingEditMatch = /^marketing:activity:edit:(\d+)$/.exec(action);
  if (marketingEditMatch) {
    return buildManagementLinkResult({
      title: '活动草稿已生成',
      subtitle: `营销活动 #${marketingEditMatch[1]}`,
      description: '这是“继续完善活动”的管理端动作。终端已拦截内部动作码，不会把它发送给智能问答。',
      nextSteps: ['到管理端打开营销活动', '补充活动规则、适用客户和触达文案', '确认无误后再发布'],
    });
  }

  const marketingViewMatch = /^marketing:activity:(\d+)$/.exec(action);
  if (marketingViewMatch) {
    return buildManagementLinkResult({
      title: '活动草稿已生成',
      subtitle: `营销活动 #${marketingViewMatch[1]}`,
      description: '活动草稿已在管理端生成。终端不会把内部动作码显示为用户输入，请到管理端继续查看或发布。',
      nextSteps: ['到管理端打开营销活动', '核对活动商品、权益和客户范围', '确认后发布活动'],
    });
  }

  const purchaseOrderMatch = /^inventory:purchase-order:(\d+)$/.exec(action);
  if (purchaseOrderMatch) {
    return buildManagementLinkResult({
      title: '采购草稿已生成',
      subtitle: `采购单 #${purchaseOrderMatch[1]}`,
      description: '采购草稿需要在管理端库存采购模块继续确认。终端已拦截内部动作码，不会触发智能问答。',
      nextSteps: ['到管理端打开采购单', '核对供应商、数量和金额', '确认后提交采购流程'],
    });
  }

  const schedulePreviewMatch = /^scheduling:preview:(\d+)$/.exec(action);
  if (schedulePreviewMatch) {
    return buildManagementLinkResult({
      title: '排班优化预览已生成',
      subtitle: `预览 #${schedulePreviewMatch[1]}`,
      description: '排班预览需要在管理端排班模块确认发布。终端不会把内部动作码作为用户消息发送。',
      nextSteps: ['到管理端打开排班管理', '检查美容师时段和预约冲突', '确认后发布排班'],
    });
  }

  const managementPageActions: Record<string, string> = {
    'projects:open': '项目管理',
    'orders:card-usage:open': '次卡核销明细',
    'customers:cards:open': '客户卡项',
    'finance:daily-settlement:open': '日结报表',
  };
  const pageName = managementPageActions[action];
  if (pageName) {
    return buildManagementLinkResult({
      title: '请到管理端查看',
      subtitle: pageName,
      status: 'warning',
      description: `“${pageName}”属于管理端页面动作，当前终端不会把内部动作码发送给智能问答。`,
      nextSteps: [`到管理端打开${pageName}`, '按页面权限继续处理', '需要终端原生支持时再补充对应能力'],
    });
  }

  return null;
}

export function buildUnsupportedInternalActionResult(): OperationResultData {
  return {
    title: '该动作暂不能在终端直接打开',
    subtitle: '已拦截内部动作码',
    status: 'warning',
    description: '这是系统内部动作，不是用户输入内容。终端已停止把它发送给智能问答，避免生成不相关回复。',
    nextSteps: ['在管理端对应模块继续处理', '或补充终端原生动作能力', '不要将内部动作码展示给门店用户'],
  };
}
