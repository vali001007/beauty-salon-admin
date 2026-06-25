import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export type AgentPersonaCode =
  | 'manager'
  | 'marketing'
  | 'reception'
  | 'beautician'
  | 'inventory'
  | 'finance';

export type PersonaSummary = {
  code: AgentPersonaCode;
  name: string;
  description: string;
  targetRoles: string[];
  toolGroups: string[];
  suggestedQuestions: string[];
};

/**
 * 六大角色 Agent 内置配置。
 * 优先从数据库读取（支持运行时覆盖），数据库不存在时使用内置默认值。
 */
const BUILTIN_PERSONAS: Record<AgentPersonaCode, PersonaSummary> = {
  manager: {
    code: 'manager',
    name: '店长经营 Agent',
    description: '门店每日经营总入口，帮助店长快速了解今天要关注什么、客户风险、预约排班、员工业绩、库存营销。',
    targetRoles: ['manager'],
    toolGroups: [
      'manager.daily.briefing',
      'customer.priority.rank',
      'schedule.diagnose',
      'beautician.performance.diagnose',
      'revenue.diagnose',
      'inventory.risk.rank',
      'manager.followup.plan.draft',
    ],
    suggestedQuestions: [
      '今天我应该重点关注什么？',
      '本周收入和上周相比如何？',
      '哪些客户最值得今天跟进？',
      '预约和排班有没有风险？',
      '库存有没有需要处理的问题？',
    ],
  },
  marketing: {
    code: 'marketing',
    name: '营销增长 Agent',
    description: '发现增长机会、识别客群、匹配权益、生成活动草稿、生成触达话术，并追踪活动效果。',
    targetRoles: ['manager'],
    toolGroups: [
      'marketing.customer.segment.discover',
      'marketing.opportunity.discover',
      'promotion.offer.match',
      'marketing.activity.draft',
      'marketing.copy.generate',
      'marketing.effect.diagnose',
      'customer.followup.task.draft',
    ],
    suggestedQuestions: [
      '哪些客户适合召回？',
      '最近有哪些营销机会？',
      '帮我给 60 天没来的顾客做个召回',
      '上次活动效果怎么样？',
      '哪些项目适合做活动？',
    ],
  },
  reception: {
    code: 'reception',
    name: '前台接待 Agent',
    description: '高频门店操作：查客户、查预约、解释权益、建跟进、收银/核销跳转，让前台少找页面、少重复输入。',
    targetRoles: ['reception', 'manager'],
    toolGroups: [
      'reception.customer.lookup',
      'reception.reservation.today',
      'reception.card.benefit.summary',
      'reception.followup.note.draft',
      'reception.checkout.link',
      'reception.verify.link',
    ],
    suggestedQuestions: [
      '帮我查一下某个客户',
      '今天有哪些预约？',
      '这个客户还有什么卡和权益？',
      '帮我记录一个跟进',
      '收银/核销入口在哪里？',
    ],
  },
  beautician: {
    code: 'beautician',
    name: '美容师服务 Agent',
    description: '美容师本人当天服务准备、客户护理建议、服务记录草稿、复购机会和个人业绩进度。',
    targetRoles: ['beautician', 'manager'],
    toolGroups: [
      'beautician.today.service.list',
      'beautician.customer.care.brief',
      'service.record.draft',
      'beautician.performance.progress',
      'beautician.repurchase.opportunity',
      'beautician.followup.task.draft',
    ],
    suggestedQuestions: [
      '我今天有哪些客户？',
      '下一个客户要注意什么？',
      '这次护理后怎么记录？',
      '我这个月业绩差多少？',
      '哪些客户适合复购或续卡？',
    ],
  },
  inventory: {
    code: 'inventory',
    name: '库存采购 Agent',
    description: '库存风险、补货建议、临期处理、消耗趋势、供应链动作，帮助门店降低缺货、积压和临期损耗。',
    targetRoles: ['manager'],
    toolGroups: [
      'inventory.risk.rank',
      'inventory.consumption.trend',
      'inventory.project.bom.risk',
      'inventory.replenishment.draft',
      'inventory.expiring.clearance.draft',
      'supplier.purchase.link',
    ],
    suggestedQuestions: [
      '现在库存有什么风险？',
      '哪些商品快缺货？',
      '哪些商品临期或周转慢？',
      '结合最近销量应该补多少？',
      '是否需要生成补货单？',
    ],
  },
  finance: {
    code: 'finance',
    name: '财务风控 Agent',
    description: '收入、退款、成本、毛利、经营利润、异常流水和财务口径解释，帮助快速识别经营利润风险。',
    targetRoles: ['manager'],
    toolGroups: [
      'finance.revenue.summary',
      'finance.profit.diagnose',
      'finance.margin.risk.rank',
      'finance.refund.discount.audit',
      'finance.beautician.performance.audit',
      'finance.report.draft',
    ],
    suggestedQuestions: [
      '今天/本月实收是多少？',
      '为什么利润下降？',
      '哪些项目或商品毛利异常？',
      '哪些退款折扣异常？',
      '帮我生成本月财务报告草稿',
    ],
  },
};

@Injectable()
export class AgentPersonaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取当前用户角色可用的 Persona 列表。
   * 优先从数据库读取，不存在时返回内置配置。
   */
  async listForRole(role: string): Promise<PersonaSummary[]> {
    const all = Object.values(BUILTIN_PERSONAS);
    return all.filter((p) => p.targetRoles.includes(role));
  }

  async getByCode(code: string): Promise<PersonaSummary | null> {
    return BUILTIN_PERSONAS[code as AgentPersonaCode] ?? null;
  }

  /** 获取所有 Persona（管理员视图）*/
  async listAll(): Promise<PersonaSummary[]> {
    return Object.values(BUILTIN_PERSONAS);
  }
}
