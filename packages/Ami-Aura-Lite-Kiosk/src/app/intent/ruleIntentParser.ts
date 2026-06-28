import type { AuraAction } from '../../../../../src/types/aura';
import type { Role, RoleDefinition } from '../types';
import { getCommandByAction } from './commandRegistry';
import type { AuraCommandSource, AuraResolvedIntent } from './intentTypes';
import { buildSlots, extractCustomerKeyword, normalizeCommandText } from './slotUtils';

function buildResolvedIntent(params: {
  action: AuraResolvedIntent['action'];
  role: Role;
  source: AuraCommandSource;
  command: string;
  confidence?: number;
  showUserCommand?: boolean;
  loadingLabel?: string;
  deniedReason?: string;
}): AuraResolvedIntent {
  const actionText = params.action ?? '';
  const commandDefinition = actionText ? getCommandByAction(actionText) : undefined;
  const slots = buildSlots(params.command);

  if (actionText.startsWith('customer:')) {
    slots.customerName = actionText.slice('customer:'.length) || extractCustomerKeyword(params.command);
    return {
      name: 'customer.search',
      role: params.role,
      action: params.action,
      source: params.source,
      confidence: params.confidence ?? 0.86,
      slots,
      missingSlots: slots.customerName ? [] : ['customerName'],
      riskLevel: 'none',
      requiresConfirmation: false,
      showUserCommand: params.showUserCommand ?? true,
      loadingLabel: params.loadingLabel ?? '正在调取客户档案',
      deniedReason: params.deniedReason,
    };
  }

  if (actionText.startsWith('appointment:')) {
    const [, operation, idText] = actionText.split(':');
    const appointmentId = Number(idText);
    const intentMap = {
      confirm: 'appointment.confirm',
      reschedule: 'appointment.reschedule',
      cancel: 'appointment.cancel',
      checkin: 'appointment.check_in',
    } as const;
    return {
      name: intentMap[operation as keyof typeof intentMap] ?? 'appointment.today.view',
      role: params.role,
      action: params.action,
      source: params.source,
      confidence: params.confidence ?? 1,
      slots: { ...slots, appointmentId },
      missingSlots: appointmentId ? [] : ['appointmentId'],
      riskLevel: operation === 'cancel' || operation === 'reschedule' ? 'medium' : 'low',
      requiresConfirmation: operation === 'cancel' || operation === 'reschedule',
      showUserCommand: params.showUserCommand ?? false,
      loadingLabel: params.loadingLabel ?? '正在处理预约',
      deniedReason: params.deniedReason,
    };
  }

  return {
    name: commandDefinition?.intent ?? 'unknown.clarify',
    role: params.role,
    action: params.action,
    source: params.source,
    confidence: params.confidence ?? (commandDefinition ? 0.95 : 0.3),
    slots,
    missingSlots: [],
    riskLevel: commandDefinition?.riskLevel ?? 'none',
    requiresConfirmation: commandDefinition?.requiresConfirmation ?? false,
    showUserCommand: params.showUserCommand ?? true,
    loadingLabel: params.loadingLabel ?? commandDefinition?.loadingLabel ?? '正在处理指令',
    deniedReason: params.deniedReason,
  };
}

function isActionAllowed(action: string, definition: RoleDefinition) {
  if (action.startsWith('customer:') || action.startsWith('appointment:')) return true;
  return (definition.availableActions as string[]).includes(action);
}

function withPermissionCheck(
  action: AuraResolvedIntent['action'],
  role: Role,
  definition: RoleDefinition,
  command: string,
  source: AuraCommandSource,
  showUserCommand: boolean,
) {
  if (action && !isActionAllowed(action, definition)) {
    return buildResolvedIntent({
      action: null,
      role,
      source,
      command,
      showUserCommand,
      deniedReason: `当前角色「${definition.title}」无权执行该操作。`,
      loadingLabel: '正在检查权限',
      confidence: 1,
    });
  }

  return buildResolvedIntent({ action, role, source, command, showUserCommand });
}

function isTextInputSource(source: AuraCommandSource) {
  return source === 'text' || source === 'voice';
}

function isTypedTextSource(source: AuraCommandSource) {
  return source === 'text';
}

function isNaturalLanguageSource(source: AuraCommandSource) {
  return source === 'text' || source === 'voice';
}

export function isExactQuickActionCommand(command: string, definition: RoleDefinition) {
  const text = normalizeCommandText(command);
  if (!text) return false;
  if ((definition.availableActions as string[]).includes(text)) return true;
  return definition.quickActions.some(
    (item) => text === normalizeCommandText(item.action) || text === normalizeCommandText(item.label),
  );
}

const RULE_KEYWORDS: Array<{ action: AuraAction; roles?: Role[]; keywords: string[] }> = [
  {
    action: 'manager.dashboard',
    roles: ['manager'],
    keywords: [
      '经营',
      '报表',
      '概览',
      '今日经营',
      '今天怎么样',
      '业绩',
      '营业额',
      '收入',
      '数据',
      '店里怎么样',
      '情况',
    ],
  },
  {
    action: 'manager.staff',
    roles: ['manager'],
    keywords: ['员工', '排班', '绩效', '人员', '今天谁在', '谁上班', '美容师', '忙不忙', '人手'],
  },
  {
    action: 'manager.customers',
    roles: ['manager'],
    keywords: ['流失', '增长', '高价值', '没来', '很久没到店', '沉睡', '回访', '客户情况', '会员情况', '老客'],
  },
  {
    action: 'manager.inventory',
    roles: ['manager'],
    keywords: ['库存', '补货', '临期', '缺货', '快用完', '过期', '库存预警', '耗材', '产品不够'],
  },
  {
    action: 'beautician.schedule',
    roles: ['beautician'],
    keywords: ['我今天做什么', '我的预约', '今天安排', '我排了什么', '我的排班', '今天服务谁'],
  },
  {
    action: 'beautician.commission',
    roles: ['beautician'],
    keywords: ['我的提成', '提成', '今天提成', '今日提成', '本月提成', '这个月提成', '佣金', '收入明细'],
  },
  {
    action: 'beautician.record',
    roles: ['beautician'],
    keywords: [
      '写记录',
      '补记录',
      '服务记录',
      '护理记录',
      '记录一下',
      '完成服务',
      '服务做完',
      '结束服务',
      '做完了',
      '服务结束',
    ],
  },
  {
    action: 'beautician.customer',
    roles: ['beautician'],
    keywords: ['我的客户', '客户档案', '皮肤', '肤况', '上次做什么', '上次做了什么', '服务历史', '过敏', '禁忌'],
  },
  {
    action: 'beautician.advice',
    roles: ['beautician'],
    keywords: ['护理建议', '适合做什么护理', '推荐什么', '适合做', '怎么护理', '下次做什么', '护理方案'],
  },
  {
    action: 'reception.appointments',
    roles: ['reception', 'manager'],
    keywords: ['预约', '有没有预约', '今天来几个', '排了什么', '到店', '今日预约', '确认预约', '爽约'],
  },
  {
    action: 'operation.verify',
    keywords: ['核销', '扣次', '消次', '次卡使用', '用卡', '划次'],
  },
  {
    action: 'operation.register',
    keywords: ['登记', '新增客户', '新客户', '没有档案', '建档', '录客户', '建个档'],
  },
  {
    action: 'operation.cashier',
    keywords: ['收银', '开单', '买单', '结算', '多少钱', '付款', '支付', '收费'],
  },
  {
    action: 'operation.card',
    keywords: ['办卡', '开卡', '买卡', '办张', '买张', '办张卡', '开一张', '开一张卡'],
  },
  {
    action: 'operation.recharge',
    keywords: ['充值', '充钱', '储值', '充会员卡', '余额充值'],
  },
  {
    action: 'operation.print',
    keywords: ['打印', '小票', '补打', '打票'],
  },
  {
    action: 'operation.service-complete',
    keywords: ['完成服务', '服务做完', '结束服务', '做完了', '服务结束'],
  },
];

function hasAnyKeyword(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function matchKeywordRule(text: string, role: Role) {
  return RULE_KEYWORDS.find((rule) => (!rule.roles || rule.roles.includes(role)) && hasAnyKeyword(text, rule.keywords));
}

function isLocalDirectCommand(text: string, role: Role) {
  if (/收银|开单|买单|结算|付款|收费|核销|扣次|消次|办卡|开卡|充值|登记|新增客户|录客户|打印|小票/.test(text)) {
    return true;
  }
  if (/确认预约|取消预约|改约|改期/.test(text)) return true;
  if (isAppointmentWorkbenchCommand(text, role)) return true;
  if (role === 'beautician') {
    return /我的预约|我的排班|我的提成|提成|佣金|服务记录|护理记录|护理建议|推荐什么护理|适合做什么护理|怎么护理|我的客户/.test(text);
  }
  return false;
}

function isAppointmentWorkbenchCommand(text: string, role: Role) {
  if (role === 'beautician') return /我的预约|我的排班|我今天做什么|今天服务谁/.test(text);
  if (!/预约|爽约|排了什么项目|今天来几个/.test(text)) return false;
  if (/预约.*(趋势|分析|统计|排行|排名|完成率|确认率|到店率|未到率|爽约率|原因|为什么|增长|下降|同比|环比|预测|风险|建议)/.test(text)) {
    return false;
  }
  return /今天|今日|明天|明日|有没有|看|看看|查|查询|排了什么|来几个|确认预约|取消预约|改约|改期|爽约/.test(text);
}

function isBusinessQueryCommand(text: string, role: Role) {
  const isKpiShorthandQuery = isBusinessKpiShorthandQuery(text);
  const hasQueryVerb =
    /查|查询|看|看看|分析|统计|列出|排行|排名|对比|哪些|哪个|什么|有没有|多少|几个|几位|几笔|几单|来几个|几|谁|怎么样|情况|趋势|增长|下降|预警|不足|到期|表现|业绩|最多|最少|高频|失败|异常|问题|忙不忙|做什么/.test(text);
  const hasAdvancedQueryVerb =
    /建议|复盘|机会|毛利|成本|异常|风险|最值得|优先|重点|跟进|回访|邀约|唤醒|复购|沉睡|高价值|名单|适合|推荐|优秀|较好|做得好|服务质量|成交|贡献/.test(text);
  const isContextFollowUp = /这些|上述|上面|它们|他们|该批|这批/.test(text) && /商品|产品|库存|客户|顾客|会员|买/.test(text);
  const hasTopN = /前\d+|top\d+|\d+(个|位|条|名|款|项|件|种)/i.test(text);
  const hasCustomerOperationIntent = /最值得|优先|重点|跟进|回访|邀约|唤醒|复购|沉睡|流失|高价值|很久没到店|名单/.test(text);
  const hasStaffPerformanceIntent =
    /员工|店员|顾问|美容师|人员/.test(text) && /表现|业绩|绩效|提成|服务质量|优秀|较好|做得好|成交|销售|贡献|排行|排名/.test(text);
  const hasBeauticianSelfPerformanceIntent =
    role === 'beautician' && /我|本人|自己/.test(text) && /表现|业绩|绩效|服务质量|服务完成|成交|销售|贡献|复购/.test(text);
  const hasDomain =
    /商品|产品|项目|客户|顾客|会员|老客|新客|流失|排班|预约|订单|收入|营收|营业额|流水|业绩|收银|收款|结账|支付|次卡|卡项|会员卡|财务|库存|缺货|临期|营销|活动|员工|人员|美容师|顾问|提成|佣金|门店|店里|上班|多店|自动化|补货|供应链|采购|经营|小程序|渠道|推广页|终端|设备|会话|对话|打印机|扫码器|摄像头|售后|退款|服务质量|皮肤|肤况|护理|服务/.test(
      text,
    );
  const isReadOnlyQuestion =
    hasQueryVerb || /今天|今日|昨天|昨日|本周|这周|下周|本月|这个月|上月|最近|近期|近\d+天/.test(text);
  const isWriteCommand =
    /创建|新增|删除|修改|收银|开单|买单|结算|付款|收费|核销|办卡|充值|登记|确认|取消|改期|打印|启用/.test(text) ||
    (text.includes('支付') && !text.includes('支付方式'));
  return (
    isKpiShorthandQuery ||
    (isContextFollowUp ||
      hasStaffPerformanceIntent ||
      hasBeauticianSelfPerformanceIntent ||
      ((hasQueryVerb || hasAdvancedQueryVerb || hasTopN || hasCustomerOperationIntent) && hasDomain)) &&
    !(isWriteCommand && !isReadOnlyQuestion)
  );
}

function isBusinessKpiShorthandQuery(text: string) {
  const hasKpiMetric = /收入|营收|营业额|流水|实收|收款|客单价|订单数/.test(text);
  if (!hasKpiMetric) return false;
  if (/为什么|原因|归因|下降|异常|诊断|复盘|风险|建议|生成|创建|收银|开单|买单|结算|付款|收费|核销|办卡|充值|登记|确认|取消|改期|打印/.test(text)) {
    return false;
  }
  const hasTimeRange = /今天|今日|昨天|昨日|本周|这周|上周|上星期|本月|这个月|当月|上月|最近|近期|近\d+天|最近\d+天/.test(text);
  const isMetricOnly = /^(?:今天|今日|昨天|昨日|本周|这周|上周|上星期|本月|这个月|当月|上月|最近|近期|近\d+天|最近\d+天)?(?:收入|营收|营业额|流水|实收|收款|客单价|订单数)$/.test(text);
  return hasTimeRange || isMetricOnly;
}

function shouldRouteToAgent(text: string, role: Role, source: AuraCommandSource) {
  if (isLocalDirectCommand(text, role) && !(isNaturalLanguageSource(source) && isBusinessQueryCommand(text, role))) return false;
  if (/^(查|查询|搜索|找|看看|看一下|帮我查|帮我看)/.test(text) && isCustomerLookupCommand(text)) return false;
  return isBusinessQueryCommand(text, role);
}

function isAgentDraftCommand(text: string) {
  const hasDraftVerb = /生成|创建|新增|安排|下发/.test(text);
  const hasFollowUpDraft = /跟进任务|客户跟进|顾客跟进|邀约任务|回访任务|唤醒任务|生成邀约/.test(text);
  const hasReplenishmentDraft = /补货草稿|采购草稿|采购单|补货单|生成补货|创建补货|生成采购|创建采购/.test(text);
  const hasMarketingDraft = /活动草稿|营销草稿|生成活动|创建活动/.test(text);
  const hasServiceRecordDraft = /服务记录草稿|护理记录草稿|生成服务记录|生成护理记录|补服务记录|补护理记录/.test(text);
  return hasDraftVerb && (hasFollowUpDraft || hasReplenishmentDraft || hasMarketingDraft || hasServiceRecordDraft);
}

function isAgentSchedulingPreviewCommand(text: string) {
  return /排班优化|优化.*排班|智能排班|排班建议|排班预览|生成排班/.test(text) && /排班|预约|人手|美容师|班表/.test(text);
}

const CUSTOMER_LOOKUP_OFF_TOPIC =
  /天气|新闻|股票|基金|写诗|作文|作业|笑话|编程|代码|翻译|历史人物|政治|体育|游戏|做饭|菜谱|旅游|星座|彩票|电影|电视剧/;
const CUSTOMER_LOOKUP_BUSINESS_BLOCK =
  /业绩|经营|收入|营收|营业额|库存|商品|产品|订单|排班|预约|提成|财务|营销|活动|报表|概览|低库存|临期|沉睡|老客|流失|增长|高价值|最值得|优先|重点|跟进|回访|邀约|唤醒|复购|名单|前\d+|top\d+|风险|机会|建议|适合|推荐/;

function isCustomerLookupCommand(text: string) {
  if (CUSTOMER_LOOKUP_OFF_TOPIC.test(text)) return false;
  if (CUSTOMER_LOOKUP_BUSINESS_BLOCK.test(text)) return false;
  if (text.includes('客户') || text.includes('会员')) return true;
  return /^(查|查询|搜索|找|看看|看一下|帮我查|帮我看)/.test(text);
}

export function parseRuleIntent(command: string, role: Role, definition: RoleDefinition, source: AuraCommandSource) {
  const text = normalizeCommandText(command);

  if (!text) {
    return withPermissionCheck(
      definition.availableActions[0] ?? 'reception.appointments',
      role,
      definition,
      command,
      source,
      false,
    );
  }

  if (isTextInputSource(source) && isExactQuickActionCommand(command, definition)) {
    return buildResolvedIntent({
      action: null,
      role,
      source,
      command,
      showUserCommand: true,
      loadingLabel: '正在理解指令',
      confidence: 0.35,
    });
  }

  if (!isTextInputSource(source) && (definition.availableActions as string[]).includes(text)) {
    return withPermissionCheck(text as AuraAction, role, definition, command, source, false);
  }

  if (text.startsWith('appointment:')) {
    return withPermissionCheck(text as `appointment:${string}:${number}`, role, definition, command, source, false);
  }

  if (isAgentDraftCommand(text) || isAgentSchedulingPreviewCommand(text)) {
    return withPermissionCheck('business.query', role, definition, command, source, true);
  }

  if (/多店|多门店|门店对比|门店排名/.test(text) && isBusinessQueryCommand(text, role)) {
    return withPermissionCheck('business.query', role, definition, command, source, true);
  }

  if (shouldRouteToAgent(text, role, source)) {
    return withPermissionCheck('business.query', role, definition, command, source, true);
  }

  if (/^(查|查询|搜索|找|看看|看一下|帮我查|帮我看)/.test(text) && isCustomerLookupCommand(text)) {
    const keyword = extractCustomerKeyword(text) ?? text;
    return withPermissionCheck(`customer:${keyword}`, role, definition, command, source, true);
  }

  if (!isLocalDirectCommand(text, role) && isBusinessQueryCommand(text, role)) {
    return withPermissionCheck('business.query', role, definition, command, source, true);
  }

  if (isNaturalLanguageSource(source)) {
    return buildResolvedIntent({
      action: null,
      role,
      source,
      command,
      showUserCommand: true,
      loadingLabel: '正在理解指令',
      confidence: 0.35,
    });
  }

  const quickMatch = definition.quickActions.find(
    (item) => text === normalizeCommandText(item.label) || text.includes(normalizeCommandText(item.label)),
  );
  if (!isTextInputSource(source) && quickMatch) {
    return withPermissionCheck(quickMatch.action, role, definition, command, source, false);
  }

  const keywordRule = matchKeywordRule(text, role);
  if (keywordRule) {
    return withPermissionCheck(keywordRule.action, role, definition, command, source, true);
  }

  if (text.includes('经营') || text.includes('报表') || text.includes('概览') || text.includes('今日经营')) {
    return withPermissionCheck('manager.dashboard', role, definition, command, source, true);
  }
  if (text.includes('员工') || text.includes('排班') || text.includes('绩效')) {
    return withPermissionCheck('manager.staff', role, definition, command, source, true);
  }
  if (text.includes('流失') || text.includes('增长') || text.includes('高价值')) {
    return withPermissionCheck('manager.customers', role, definition, command, source, true);
  }
  if (text.includes('库存') || text.includes('补货') || text.includes('临期')) {
    return withPermissionCheck('manager.inventory', role, definition, command, source, true);
  }

  if (text.includes('预约')) {
    return withPermissionCheck(
      role === 'beautician' ? 'beautician.schedule' : 'reception.appointments',
      role,
      definition,
      command,
      source,
      true,
    );
  }
  if (role === 'beautician' && (text.includes('提成') || text.includes('佣金'))) {
    return withPermissionCheck('beautician.commission', role, definition, command, source, true);
  }
  if (text.includes('核销')) return withPermissionCheck('operation.verify', role, definition, command, source, true);
  if (text.includes('登记') || text.includes('新增客户'))
    return withPermissionCheck('operation.register', role, definition, command, source, true);
  if (text.includes('收银') || text.includes('开单'))
    return withPermissionCheck('operation.cashier', role, definition, command, source, true);
  if (text.includes('办卡') || text.includes('开卡'))
    return withPermissionCheck('operation.card', role, definition, command, source, true);
  if (text.includes('充值')) return withPermissionCheck('operation.recharge', role, definition, command, source, true);
  if (text.includes('打印')) return withPermissionCheck('operation.print', role, definition, command, source, true);
  if (
    role === 'beautician' &&
    (text.includes('完成服务') ||
      text.includes('服务做完') ||
      text.includes('结束服务') ||
      text.includes('做完了') ||
      text.includes('服务结束'))
  ) {
    return withPermissionCheck('beautician.record', role, definition, command, source, true);
  }
  if (text.includes('客户档案') || text.includes('皮肤') || text.includes('服务记录')) {
    return withPermissionCheck('beautician.customer', role, definition, command, source, true);
  }
  if (text.includes('护理建议') || text.includes('适合做什么护理')) {
    return withPermissionCheck('beautician.advice', role, definition, command, source, true);
  }
  if (isCustomerLookupCommand(text)) {
    const keyword = extractCustomerKeyword(text) ?? text;
    return withPermissionCheck(`customer:${keyword}`, role, definition, command, source, true);
  }
  return buildResolvedIntent({
    action: null,
    role,
    source,
    command,
    showUserCommand: true,
    loadingLabel: '正在理解指令',
    confidence: 0.35,
  });
}

export function parseQuickActionIntent(command: string, role: Role, definition: RoleDefinition) {
  const text = normalizeCommandText(command);
  const quickMatch = definition.quickActions.find(
    (item) => text === normalizeCommandText(item.action) || text === normalizeCommandText(item.label),
  );

  if ((definition.availableActions as string[]).includes(text)) {
    return withPermissionCheck(text as AuraAction, role, definition, command, 'quick_action', false);
  }

  if (quickMatch) {
    return withPermissionCheck(quickMatch.action, role, definition, command, 'quick_action', false);
  }

  if (text.startsWith('appointment:')) {
    return withPermissionCheck(text as `appointment:${string}:${number}`, role, definition, command, 'quick_action', false);
  }

  if (text.startsWith('customer:')) {
    return withPermissionCheck(text as `customer:${string}`, role, definition, command, 'quick_action', false);
  }

  return buildResolvedIntent({
    action: null,
    role,
    source: 'quick_action',
    command,
    showUserCommand: false,
    loadingLabel: '无法识别快捷操作',
    confidence: 0.2,
  });
}
