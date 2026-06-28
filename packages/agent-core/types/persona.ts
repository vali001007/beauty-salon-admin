export type AgentPersonaCode = 'manager' | 'marketing' | 'reception' | 'beautician' | 'inventory' | 'finance';

export type AgentRole = 'manager' | 'reception' | 'beautician';

export interface AgentPersonaSummary {
  code: AgentPersonaCode;
  name: string;
  description: string;
  targetRoles: string[];
  toolGroups: string[];
  suggestedQuestions: string[];
}

export const BUILTIN_AGENT_PERSONAS: AgentPersonaSummary[] = [
  {
    code: 'manager',
    name: '店长经营 Agent',
    description: '门店每日经营总入口，帮助店长快速了解经营重点、客户风险、预约排班、员工业绩和库存营销。',
    targetRoles: ['manager'],
    toolGroups: ['经营分析', '客户洞察', '预约排班', '员工业绩', '库存风险'],
    suggestedQuestions: ['今天我应该重点关注什么？', '最近一个月运营有啥风险', '昨天有哪些消费客户？'],
  },
  {
    code: 'marketing',
    name: '营销增长 Agent',
    description: '围绕客户复购、召回、活动草案和转化效果，生成可执行的营销增长建议。',
    targetRoles: ['manager', 'reception'],
    toolGroups: ['客户召回', '活动策划', '文案生成', '效果复盘'],
    suggestedQuestions: ['哪些客户适合今天回访？', '帮我生成一个复购活动草案', '最近活动转化怎么样？'],
  },
  {
    code: 'reception',
    name: '前台接待 Agent',
    description: '面向前台接待、预约确认、客户到店、卡项查询和现场服务承接。',
    targetRoles: ['manager', 'reception'],
    toolGroups: ['预约接待', '客户查询', '卡项核对', '到店提醒'],
    suggestedQuestions: ['今天有哪些预约要确认？', '哪些客户到店前需要提醒？', '帮我查客户卡项状态'],
  },
  {
    code: 'beautician',
    name: '美容师服务 Agent',
    description: '辅助美容师查看今日服务、客户偏好、护理记录和复购承接建议。',
    targetRoles: ['beautician'],
    toolGroups: ['服务记录', '客户偏好', '护理建议', '复购承接'],
    suggestedQuestions: ['我今天有哪些服务？', '下一位客户有什么护理偏好？', '服务后怎么做复购承接？'],
  },
  {
    code: 'inventory',
    name: '库存采购 Agent',
    description: '围绕低库存、临期库存、补货建议和采购计划，帮助门店降低库存风险。',
    targetRoles: ['manager'],
    toolGroups: ['低库存', '临期库存', '采购建议', '供应商'],
    suggestedQuestions: ['近期有哪些临期库存产品？', '哪些商品需要补货？', '临期库存怎么处理？'],
  },
  {
    code: 'finance',
    name: '财务风控 Agent',
    description: '关注日结、退款、客单价、利润率、预收负债和经营异常。',
    targetRoles: ['manager'],
    toolGroups: ['日结对账', '退款异常', '利润分析', '预收负债'],
    suggestedQuestions: ['今天财务有什么异常？', '本月利润率为什么变化？', '最近退款是否偏高？'],
  },
];

export const PERSONA_ACCESS: Record<AgentRole, AgentPersonaCode[]> = {
  manager: ['manager', 'marketing', 'reception', 'inventory', 'finance'],
  reception: ['reception', 'marketing'],
  beautician: ['beautician'],
};
