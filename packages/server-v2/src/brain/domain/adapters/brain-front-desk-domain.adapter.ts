import { Injectable, Optional } from '@nestjs/common';
import { BrainRiskLevel, Prisma } from '@prisma/client';
import type { BrainDateRange } from '../../cognition/brain-time-range-parser.service.js';
import { BrainTimeRangeParserService } from '../../cognition/brain-time-range-parser.service.js';
import { BrainActionConfirmationService } from '../../skills/brain-action-confirmation.service.js';
import { BrainSkillRuntimeService } from '../../skills/brain-skill-runtime.service.js';
import type { BrainDomainAdapter, BrainDomainAdapterExecution, BrainDomainAnswer } from '../brain-domain-adapter.types.js';
import { BrainActionTargetResolverService } from '../brain-action-target-resolver.service.js';
import { defaultBrainDateRange } from '../brain-domain-formatters.js';
import { BrainCustomerFactResolverService } from '../brain-customer-fact-resolver.service.js';

@Injectable()
export class BrainFrontDeskDomainAdapter implements BrainDomainAdapter {
  readonly key = 'front_desk' as const;
  readonly role = 'receptionist' as const;
  readonly requiredPermissions = ['core:store:reservations'];

  constructor(
    private readonly skillRuntime: BrainSkillRuntimeService,
    private readonly timeRangeParser: BrainTimeRangeParserService,
    private readonly actionConfirmationService: BrainActionConfirmationService,
    private readonly customerFacts: BrainCustomerFactResolverService,
    @Optional() private readonly actionTargets?: BrainActionTargetResolverService,
  ) {}

  canHandle(plan: BrainDomainAdapterExecution['plan']) {
    return plan.adapterKey === this.key;
  }

  async execute(input: BrainDomainAdapterExecution): Promise<BrainDomainAnswer | undefined> {
    if (input.plan.capabilityKey === 'reservation_action_preview') return this.previewAction(input);
    const message = input.dto.message;
    if (/(超时服务|超时.*(?:预约|下一个)|影响.*下一个预约)/.test(message)) {
      const range = this.resolveRange(message);
      const analysis = await this.skillRuntime.buildReceptionServiceOverrunAnalysis({
        storeId: input.context.storeId,
        startDate: range.startDate,
        endDate: range.endDate,
        timezone: input.context.timezone,
      });
      const lines = analysis.items.length
        ? analysis.items
            .map((item, index) => {
              const impact = item.impactedReservation
                ? `，影响 ${item.impactedReservation.startTime} ${item.impactedReservation.customerName} - ${item.impactedReservation.projectName}`
                : '，未发现与下一预约时间重叠';
              return `${index + 1}. ${item.beauticianName}为${item.customerName}执行${item.projectName}，计划 ${item.plannedEnd} 结束，实际 ${item.actualEnd} 结束，超时 ${item.overrunMinutes} 分钟${impact}。`;
            })
            .join('\n')
        : '当前时间范围没有发现服务超时记录。';
      return {
        status: 'completed',
        answer: `${range.label}服务超时分析：超时 ${analysis.overrunCount} 个，其中影响后续预约 ${analysis.impactedCount} 个。\n${lines}`,
        citations: [{ sourceType: 'skill', sourceId: 'front_desk_service_overrun_analysis', label: '服务超时与预约影响分析' }],
        grounding: 'db_skill',
        metadata: { adapterKey: this.key, rangeLabel: range.label },
      };
    }
    if (this.isReservationOperations(message)) {
      const range = this.resolveRange(message);
      const snapshot = await this.skillRuntime.buildReceptionOperationsSnapshot({
        storeId: input.context.storeId,
        startDate: range.startDate,
        endDate: range.endDate,
      });
      const pendingLines = snapshot.pendingCustomers.length
        ? snapshot.pendingCustomers.map((item, index) => `${index + 1}. ${item.startTime} ${item.customerName} - ${item.projectName}（${item.status}）`).join('\n')
        : '当前没有待到店客户。';
      const resourceLines = snapshot.resources.length
        ? snapshot.resources.map((item, index) => `${index + 1}. ${item.name}（${item.type}）：${item.booked ? '已占用' : '当前未占用'}`).join('\n')
        : '门店尚未配置床位/房间资源。';
      const staffLines = snapshot.staff.length
        ? snapshot.staff
            .map((item, index) => {
              const status = item.onTimeOff ? '请假/不在岗' : item.inService ? `服务中${item.nextAvailableAt ? `，预计 ${item.nextAvailableAt} 后可接单` : ''}` : '可接新单';
              return `${index + 1}. ${item.name}：${status}，本时段预约 ${item.appointmentCount} 个。`;
            })
            .join('\n')
        : '门店没有启用中的美容师资料。';
      if (/(临时来了没预约|临时到店)/.test(message)) {
        const availableStaff = snapshot.staff.filter((item) => item.available);
        const availableResources = snapshot.resources.filter((item) => !item.booked);
        const staffText = availableStaff.length ? availableStaff.map((item) => item.name).join('、') : '没有空闲美容师';
        const resourceText = snapshot.resources.length
          ? availableResources.length
            ? availableResources.map((item) => item.name).join('、')
            : '没有空闲床位/房间'
          : '门店未配置床位/房间资源';
        const canArrange = availableStaff.length > 0 && (snapshot.resources.length === 0 || availableResources.length > 0);
        return {
          status: 'completed',
          answer: `临时到店安排判断：${canArrange ? '当前具备初步接待条件' : '当前资源不足，不能直接承诺安排'}。可接单美容师：${staffText}；可用资源：${resourceText}。安排前还需确认客户项目、预计时长和禁忌信息。`,
          citations: [{ sourceType: 'skill', sourceId: 'front_desk_walk_in_availability', label: '临时到店资源可用性' }],
          grounding: 'db_skill',
          metadata: { adapterKey: this.key, rangeLabel: range.label },
        };
      }
      if (/(可能爽约|需要提前联系)/.test(message)) {
        const riskLines = snapshot.pendingCustomers.length
          ? snapshot.pendingCustomers
              .map((item, index) => `${index + 1}. ${item.startTime} ${item.customerName} - ${item.projectName}（${item.status}），建议到店前确认。`)
              .join('\n')
          : '当前没有待到店预约。';
        return {
          status: 'completed',
          answer: `待确认/需提前联系预约：\n${riskLines}\n说明：当前依据是预约未到店状态，不把它冒充机器学习爽约概率。`,
          citations: [{ sourceType: 'skill', sourceId: 'front_desk_no_show_risk_list', label: '待到店预约联系清单' }],
          grounding: 'db_skill',
          metadata: { adapterKey: this.key, rangeLabel: range.label },
        };
      }
      if (/所有到店客人|到店客人.*基本信息/.test(message)) {
        const arrivedLines = snapshot.arrivedCustomers.length
          ? snapshot.arrivedCustomers
              .map((item, index) => `${index + 1}. ${item.startTime} ${item.customerName} - ${item.projectName}（${item.status}）`)
              .join('\n')
          : '当前没有已到店客户。';
        return {
          status: 'completed',
          answer: `${range.label}到店客户：共 ${snapshot.arrivedCustomers.length} 人。\n${arrivedLines}`,
          citations: [{ sourceType: 'skill', sourceId: 'front_desk_operations_snapshot', label: '到店客户清单' }],
          grounding: 'db_skill',
          metadata: { adapterKey: this.key, rangeLabel: range.label },
        };
      }
      return {
        status: 'completed',
        answer: `${range.label}前台运营：有效预约 ${snapshot.total} 个，已到店/服务中 ${snapshot.checkedIn} 个，待到店 ${snapshot.pendingArrival} 个，爽约 ${snapshot.noShow} 个，取消 ${snapshot.cancelled} 个；到店率 ${(snapshot.arrivalRate * 100).toFixed(1)}%，爽约率 ${(snapshot.noShowRate * 100).toFixed(1)}%。\n待到店名单：\n${pendingLines}\n员工状态：\n${staffLines}\n资源状态：\n${resourceLines}`,
        citations: [{ sourceType: 'skill', sourceId: 'front_desk_operations_snapshot', label: '预约到店与资源状态' }],
        grounding: 'db_skill',
        metadata: { adapterKey: this.key, rangeLabel: range.label },
      };
    }
    if (this.isCatalogLookup(message)) {
      const catalog = await this.skillRuntime.buildReceptionCatalogSnapshot({ storeId: input.context.storeId, now: new Date() });
      const cardLines = catalog.cards.length
        ? catalog.cards.map((card, index) => `${index + 1}. ${card.name}：${card.totalTimes} 次，${card.price.toFixed(2)} 元，有效 ${card.validDays} 天。`).join('\n')
        : '当前门店没有启用中的卡项套餐。';
      const promotionLines = catalog.promotions.length
        ? catalog.promotions.map((promotion, index) => `${index + 1}. ${promotion.name}：${promotion.discountText}${promotion.endAt ? `，截止 ${promotion.endAt}` : ''}。`).join('\n')
        : '当前门店没有生效中的优惠活动。';
      return {
        status: 'completed',
        answer: `前台可售卡项：\n${cardLines}\n当前优惠活动：\n${promotionLines}`,
        citations: [{ sourceType: 'skill', sourceId: 'front_desk_catalog_snapshot', label: '前台卡项与优惠目录' }],
        grounding: 'db_skill',
        metadata: { adapterKey: this.key },
      };
    }
    if (this.isServiceAdvice(message)) {
      return {
        status: 'completed' as const,
        answer: this.composeServiceAdvice(message),
        citations: [{ sourceType: 'skill', sourceId: 'front_desk_service_advice', label: '前台接待建议' }],
        grounding: 'template_skill' as const,
        metadata: { adapterKey: this.key },
      };
    }
    if (input.plan.intent === 'action' || /(改约|改期|帮我约|预约到|安排.*预约|取消.*预约|收银|结账|核销)/.test(message)) {
      return this.previewAction(input);
    }
    if (this.isCustomerLookup(message)) {
      const answer = await this.customerFacts.answerExactCustomerQuestion({
        storeId: input.context.storeId,
        message,
        permissions: input.context.permissions,
      });
      return {
        status: 'completed',
        answer,
        citations: [{ sourceType: 'skill', sourceId: 'front_desk_customer_exact_lookup', label: '前台客户精确查询' }],
        grounding: 'db_skill',
        metadata: { adapterKey: this.key },
      };
    }
    const range = this.resolveRange(message);
    const schedule = await this.skillRuntime.listReceptionReservations({
      storeId: input.context.storeId,
      startDate: range.startDate,
      endDate: range.endDate,
    });
    const beauticianName = Array.from(new Set(schedule.reservations.map((item) => item.beauticianName).filter(Boolean))).find((name) =>
      message.includes(name as string),
    );
    if (beauticianName && /预约安排|预约情况/.test(message)) {
      const rows = schedule.reservations.filter((item) => item.beauticianName === beauticianName);
      const lines = rows.length
        ? rows.map((item, index) => `${index + 1}. ${item.startTime} ${item.customerName} - ${item.projectName}`).join('\n')
        : `${range.label}没有找到${beauticianName}的预约。`;
      return {
        status: 'completed',
        answer: `${beauticianName}预约清单：共 ${rows.length} 个。\n${lines}`,
        citations: [{ sourceType: 'skill', sourceId: 'front_desk_reservation_schedule', label: '美容师预约清单' }],
        grounding: 'db_skill',
        metadata: { adapterKey: this.key, rangeLabel: range.label, beauticianName },
      };
    }
    if (/面部.*身体|身体.*面部/.test(message)) {
      const faceCount = schedule.reservations.filter((item) => /面部|皮肤|脸|补水|清洁|祛痘|美白/.test(`${item.projectTypeName ?? ''}${item.projectName}`)).length;
      const bodyCount = schedule.reservations.filter((item) => /身体|背部|肩颈|按摩|塑形|胸|腹/.test(`${item.projectTypeName ?? ''}${item.projectName}`)).length;
      return {
        status: 'completed',
        answer: `${range.label}预约项目分类：面部 ${faceCount} 个，身体 ${bodyCount} 个，其他/未分类 ${Math.max(0, schedule.count - faceCount - bodyCount)} 个。`,
        citations: [{ sourceType: 'skill', sourceId: 'front_desk_reservation_schedule', label: '前台预约项目分类' }],
        grounding: 'db_skill',
        metadata: { adapterKey: this.key, rangeLabel: range.label },
      };
    }
    if (/预约最多|预约密度|哪几天.*预约|哪里有空位/.test(message)) {
      const byDate = new Map<string, number>();
      for (const item of schedule.reservations) byDate.set(item.date, (byDate.get(item.date) ?? 0) + 1);
      const lines = [...byDate.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .map(([date, count], index) => `${index + 1}. ${date}：${count} 个`)
        .join('\n');
      return {
        status: 'completed',
        answer: `预约密度排行：\n${lines || '当前时间范围没有预约。'}`,
        citations: [{ sourceType: 'skill', sourceId: 'front_desk_reservation_schedule', label: '前台预约密度' }],
        grounding: 'db_skill',
        metadata: { adapterKey: this.key, rangeLabel: range.label },
      };
    }
    if (/特别准备|准备物品|准备什么/.test(message)) {
      const lines = schedule.reservations.length
        ? schedule.reservations
            .map((item, index) => `${index + 1}. ${item.startTime} ${item.customerName} - ${item.projectName}：${item.remark || '未记录特殊准备事项'}。`)
            .join('\n')
        : '当前时间范围没有预约。';
      return {
        status: 'completed',
        answer: `预约准备清单：\n${lines}`,
        citations: [{ sourceType: 'skill', sourceId: 'front_desk_reservation_schedule', label: '前台预约准备清单' }],
        grounding: 'db_skill',
        metadata: { adapterKey: this.key, rangeLabel: range.label },
      };
    }
    if (/(在忙|空着|空档|空余|排班|床位)/.test(message)) {
      const busyNames = Array.from(new Set(schedule.reservations.map((item) => item.beauticianName).filter(Boolean)));
      const busyLine = busyNames.length ? busyNames.join('、') : '当前预约清单未显示忙碌美容师';
      return {
        status: 'completed' as const,
        answer: `员工忙闲看板：\n1. 忙碌：${busyLine}。\n2. 可排空档：P4 已接入预约占用事实，完整排班/床位空档计算进入 P5。\n3. 当前预约数：${schedule.count} 个。`,
        citations: [{ sourceType: 'skill', sourceId: 'front_desk_staff_schedule_summary', label: '前台忙闲看板' }],
        grounding: 'db_skill' as const,
        metadata: { adapterKey: this.key, rangeLabel: range.label },
      };
    }

    const lines =
      schedule.reservations.length > 0
        ? schedule.reservations
            .slice(0, 10)
            .map((item, index) => {
              const beautician = item.beauticianName ? `，${item.beauticianName}` : '';
              return `${index + 1}. ${item.startTime} ${item.customerName} - ${item.projectName}${beautician}`;
            })
            .join('\n')
        : '当前时间范围内没有预约。';
    return {
      status: 'completed' as const,
      answer: `预约清单：共 ${schedule.count} 个。\n${lines}`,
      citations: [{ sourceType: 'skill', sourceId: 'front_desk_reservation_schedule', label: '前台预约清单' }],
      grounding: 'db_skill' as const,
      metadata: { adapterKey: this.key, rangeLabel: range.label },
    };
  }

  private async previewAction(input: BrainDomainAdapterExecution): Promise<BrainDomainAnswer> {
    const message = input.dto.message;
    if (/核销|次卡|收银|结账/.test(message)) {
      const operation = /核销|次卡/.test(message) ? '次卡核销' : '收银结账';
      return {
        status: 'completed',
        answer: `${operation}尚未开放 Ami Brain 真实执行。请在现有${operation}页面选择客户和业务明细；当前不会生成不可执行的确认按钮。`,
        citations: [],
        suggestedActions: [],
        grounding: 'none',
        metadata: { adapterKey: this.key, unsupportedReason: 'capability_not_open' },
      };
    }
    if (!this.actionTargets) return this.actionClarification('动作目标解析服务未就绪，请稍后重试。');

    const actionType = /取消.*预约/.test(message)
      ? 'cancel_reservation'
      : /改约|改期|改到|调整/.test(message)
        ? 'reschedule_reservation'
        : 'create_reservation';
    let payload: Record<string, unknown>;
    let summary: string;
    let impactItems: Array<{ objectType: string; objectId: string; label: string }>;
    if (actionType === 'create_reservation') {
      const [customer, project] = await Promise.all([
        this.actionTargets.resolveCustomer({ storeId: input.context.storeId, message }),
        this.actionTargets.resolveProject({ storeId: input.context.storeId, message }),
      ]);
      if (!customer.ok) return this.actionClarification(customer.message);
      if (!project.ok) return this.actionClarification(project.message);
      const appointmentTime = this.actionTargets.resolveAppointmentTime(message);
      if (!appointmentTime) return this.actionClarification('请提供具体预约日期和时间，例如“明天下午 3 点”；仅写“明天下午”不会自动猜测时刻。');
      payload = {
        customerId: customer.value.id,
        projectId: project.value.id,
        appointmentTime: appointmentTime.toISOString(),
        duration: project.value.duration,
        remark: `Ami Brain 创建：${message}`,
      };
      summary = `创建预约：${customer.value.name}，${project.value.name}，${appointmentTime.toLocaleString('zh-CN', { hour12: false })}`;
      impactItems = [{ objectType: 'customer', objectId: String(customer.value.id), label: customer.value.name }];
    } else {
      const reservation = await this.actionTargets.resolveReservation({ storeId: input.context.storeId, message });
      if (!reservation.ok) return this.actionClarification(reservation.message);
      payload = { reservationId: reservation.value.id, reason: `Ami Brain ${actionType === 'cancel_reservation' ? '取消' : '改期'}：${message}` };
      if (actionType === 'reschedule_reservation') {
        const appointmentTime = this.actionTargets.resolveAppointmentTime(message);
        if (!appointmentTime) return this.actionClarification('请提供改约后的具体日期和时间，例如“明天下午 3 点”。');
        payload.appointmentTime = appointmentTime.toISOString();
        summary = `改期预约：${reservation.value.customerName}的${reservation.value.projectName}改至 ${appointmentTime.toLocaleString('zh-CN', { hour12: false })}`;
      } else {
        summary = `取消预约：${reservation.value.customerName}的${reservation.value.projectName}（原时间 ${reservation.value.appointmentTime.replace('T', ' ')}）`;
      }
      impactItems = [{ objectType: 'reservation', objectId: String(reservation.value.id), label: summary }];
    }
    const preview = {
      actionId: `preview_${actionType}`,
      actionType,
      riskLevel: actionType === 'create_reservation' ? 'medium' : 'high',
      requiresConfirmation: true,
      summary,
      impactItems,
    };
    const confirmation = await this.actionConfirmationService.createPreview({
      runId: input.runId,
      userId: input.context.userId,
      storeId: input.context.storeId,
      skillKey: preview.actionType,
      planId: input.plan.executionPlanId,
      riskLevel: preview.riskLevel as BrainRiskLevel,
      preview: preview as unknown as Prisma.InputJsonValue,
      payload: {
        ...payload,
        sourceMessage: message,
        roleHint: input.dto.roleHint,
      } as Prisma.InputJsonValue,
    });
    const persistedPreview = { ...preview, actionId: confirmation.actionId };
    return {
      status: 'completed' as const,
      answer: preview.summary,
      citations: [{ sourceType: 'skill', sourceId: 'front_desk_action_preview', label: '前台动作预览' }],
      suggestedActions: [persistedPreview],
      grounding: 'preview_action' as const,
      metadata: { adapterKey: this.key },
    };
  }

  private actionClarification(answer: string): BrainDomainAnswer {
    return {
      status: 'completed',
      answer,
      citations: [],
      suggestedActions: [],
      grounding: 'none',
      metadata: { adapterKey: this.key, unsupportedReason: 'action_target_requires_clarification' },
    };
  }

  private resolveRange(message: string): BrainDateRange {
    const parsed = this.timeRangeParser.parse(message);
    return parsed.range ?? defaultBrainDateRange();
  }

  private extractTargetTimeLabel(message: string) {
    if (message.includes('明天下午')) return '明天下午';
    if (message.includes('明天上午')) return '明天上午';
    if (message.includes('明天')) return '明天';
    if (message.includes('下午')) return '今天下午';
    if (message.includes('上午')) return '今天上午';
    return undefined;
  }

  private isServiceAdvice(message: string) {
    return /(洗手间|怎么回应|怎么处理|怎么操作|开发票|发票|收据|投诉|礼品卡|解释一下|效果不好|新项目|等待时间|补偿|安抚|新客人.*介绍|新客.*介绍|停车指引|门店位置)/.test(message);
  }

  private isCustomerLookup(message: string) {
    if (/(升级会员|消费满多少|会员规则)/.test(message)) return false;
    if (/(预约情况|预约安排|预约密度|预约最多|赵美容师|李美容师|哪个美容师)/.test(message)) return false;
    return /(这个客人|这个客户|这位客人|她上次|她的皮肤|她喜欢|手机尾号|会员等级|消费记录|储值余额|办过卡|标签和备注|叫[\u4e00-\u9fa5]{2,4})/.test(message) ||
      this.hasAnchoredCustomerReservation(message);
  }

  private hasAnchoredCustomerReservation(message: string) {
    const prefix = message.match(/^([\u4e00-\u9fa5]{2,4})的预约/)?.[1];
    return Boolean(prefix && !/(今天|明天|昨天|不是|这个|那个|所有|本周|上周|下周)/.test(prefix));
  }

  private isCatalogLookup(message: string) {
    return /(充值套餐|卡项套餐|办卡套餐|有哪些卡|优惠活动|最近.*活动)/.test(message);
  }

  private isReservationOperations(message: string) {
    return /(还没来|未到店|爽约|取消了|临时取消|到店|(?:还有|当前|现在|几个).*在店|客人.*在店|临时来了没预约|临时到店|空余.*床位|空闲.*床位|床位.*空|预约确认|预约.*改期|待到店|在忙|可以接新单|没到岗|带朋友.*同时安排|哪个时段可以加客)/.test(message);
  }

  private composeServiceAdvice(message: string) {
    if (/退款|退卡/.test(message)) {
      return '退款/退卡处理建议：\n1. 先核对订单、付款、已履约次数、赠送权益和退款原因。\n2. 不在前台口头承诺退款金额，提交店长或财务按合同和审批权限复核。\n3. 当前只提供流程指引，不能直接退款或冲销。';
    }
    if (/换一个美容师|更换美容师/.test(message)) {
      return '更换美容师建议：\n1. 先确认客户更换原因和期望，不评价原服务人员。\n2. 查看新美容师技能、空档和项目匹配度后给出可选时间。\n3. 客户确认后再生成改约预览，不直接修改预约。';
    }
    if (/新项目|适合她吗/.test(message)) {
      return '新项目咨询建议：\n1. 先了解客户目标、既往项目、过敏和当前状态。\n2. 安排专业评估后再推荐项目，不由前台直接承诺效果。\n3. 说明价格、时长、禁忌和护理周期，客户确认后再预约。';
    }
    if (/等待时间|补偿|安抚/.test(message)) {
      return '等待过久安抚建议：\n1. 先向客户说明预计等待时间并真诚致歉。\n2. 可提供饮品、调整预约顺序或改约选择。\n3. 涉及赠送、折扣或补偿金额时必须由店长按权限确认，前台不直接承诺。';
    }
    if (/新客人.*介绍|新客.*介绍/.test(message)) {
      return '新客接待建议：\n1. 先确认本次需求、时间和禁忌，不直接推高价项目。\n2. 安排专业评估后介绍 1-2 个匹配项目，并说明价格、时长和注意事项。\n3. 客户确认前不创建订单或核销权益。';
    }
    if (/停车指引|门店位置/.test(message)) {
      return '门店位置与停车信息需要读取门店已配置地址和停车说明；当前未确认配置内容时不编造路线。请前台核对门店资料后发送。';
    }
    if (/投诉/.test(message)) {
      return '前台投诉接待建议：\n1. 先确认客户感受并记录诉求，不在前台争辩责任。\n2. 复核消费、预约和服务记录后交由店长或当班负责人跟进。\n3. 给客户明确反馈时间，避免现场继续升级。';
    }
    if (/发票/.test(message)) {
      return '发票接待操作建议：\n1. 先核对客户订单、付款方式和开票抬头。\n2. 需要补充税号、邮箱或手机号时由客户确认后再提交。\n3. 当前 P4 只提供操作指引，不直接创建发票。';
    }
    if (/礼品卡/.test(message)) {
      return '礼品卡解释话术：\n1. 先说明礼品卡适用项目、有效期和是否可叠加优惠。\n2. 使用前由前台核验卡状态和余额。\n3. 如客户不确定项目，先安排顾问确认需求再核销。';
    }
    if (/效果不好/.test(message)) {
      return '项目效果异议回应建议：\n1. 先感谢客户反馈并确认具体不满意点。\n2. 查看上次项目、服务备注和护理周期，不现场承诺疗效。\n3. 安排美容师或店长复核后给出补救或跟进方案。';
    }
    if (/洗手间/.test(message)) {
      return '现场接待建议：\n1. 先清楚指引洗手间位置。\n2. 不直接推销项目，先询问客户时间和需求。\n3. 若客户愿意了解项目，再安排顾问查看档案并推荐。';
    }
    return '前台接待建议：\n1. 先确认客户诉求和身份。\n2. 再查看预约、消费或会员记录。\n3. 涉及金额、权益或争议时转交店长确认。';
  }
}
