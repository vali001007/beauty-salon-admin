import { Injectable } from '@nestjs/common';
import type { AgentActor, AgentPlan } from './agent.types.js';
import { AgentToolRegistryService } from './agent-tool-registry.service.js';
import type { BusinessTask } from './business-task/business-task.types.js';
import { BusinessTaskCompilerService } from './business-task/business-task-compiler.service.js';
import type { AmiBusinessSkillOutputContract } from './skills/index.js';

@Injectable()
export class AgentPlannerService {
  constructor(
    private readonly toolRegistry: AgentToolRegistryService,
    private readonly businessTaskCompiler: BusinessTaskCompilerService,
  ) {}

  async plan(input: { message: string; actor: AgentActor; context?: Record<string, unknown> }): Promise<AgentPlan> {
    const text = this.normalize(input.message);
    const tools = this.toolRegistry.list();
    const compiled = await this.businessTaskCompiler.compile({
      message: input.message,
      role: input.actor.role,
      context: input.context,
    });
    const businessTask = compiled.task;
    const semanticSqlCandidate = compiled.semanticSqlCandidate;

    if (this.isHighRiskDirectAction(text)) {
      return {
        intentType: 'clarify',
        goal: '拦截高风险正式执行动作',
        toolPlan: [],
        confidence: 0.9,
        clarificationNeeded: true,
        clarificationQuestion: this.buildHighRiskDirectActionQuestion(text),
        businessTask,
        semanticSqlCandidate,
      };
    }

    if (this.isFinanceReportDraftRequest(text)) {
      if (!this.canUseTool('finance.report.draft', input.actor.role)) {
        return this.buildRoleDeniedPlan('finance.report.draft', businessTask, semanticSqlCandidate);
      }
      return {
        intentType: 'analysis_and_recommendation',
        goal: '生成财务报告草稿',
        toolPlan: [
          {
            tool: 'finance.report.draft',
            args: {
              question: input.message,
              timeRange: businessTask.timeRange?.preset ?? 'this_month',
            },
          },
        ],
        confidence: 0.88,
        clarificationNeeded: false,
        businessTask,
        semanticSqlCandidate,
        capabilityPlan: {
          capabilityId: 'finance_report_draft',
          reason: '命中财务日报、周报或月报草稿意图，生成只读报告预览。',
        },
        outputContract: this.outputContract(['kpi', 'table', 'action_card', 'evidence_panel'], ['kpi', 'table', 'action_card', 'evidence_panel']),
      };
    }

    if (this.isFinanceRefundDiscountAuditRequest(text)) {
      if (!this.canUseTool('finance.refund.discount.audit', input.actor.role)) {
        return this.buildRoleDeniedPlan('finance.refund.discount.audit', businessTask, semanticSqlCandidate);
      }
      return {
        intentType: 'analysis_and_recommendation',
        goal: '审计退款和折扣风险',
        toolPlan: [
          {
            tool: 'finance.refund.discount.audit',
            args: {
              question: input.message,
              timeRange: businessTask.timeRange?.preset ?? 'last_30_days',
              limit: this.detectCustomerListLimit(text),
            },
          },
        ],
        confidence: 0.87,
        clarificationNeeded: false,
        executionPath: 'deep',
        businessTask,
        semanticSqlCandidate,
        capabilityPlan: {
          capabilityId: 'finance_refund_discount_audit',
          reason: '命中退款、折扣、手工优惠或财务审计风险意图。',
        },
      };
    }

    if (this.isFinanceBeauticianPerformanceAuditRequest(text)) {
      if (!this.canUseTool('finance.beautician.performance.audit', input.actor.role)) {
        return this.buildRoleDeniedPlan('finance.beautician.performance.audit', businessTask, semanticSqlCandidate);
      }
      return {
        intentType: 'analysis_and_recommendation',
        goal: '审计美容师绩效和提成风险',
        toolPlan: [
          {
            tool: 'finance.beautician.performance.audit',
            args: {
              question: input.message,
              timeRange: businessTask.timeRange?.preset ?? 'last_30_days',
              limit: this.detectCustomerListLimit(text),
            },
          },
        ],
        confidence: 0.87,
        clarificationNeeded: false,
        executionPath: 'deep',
        businessTask,
        semanticSqlCandidate,
        capabilityPlan: {
          capabilityId: 'finance_beautician_performance_audit',
          reason: '命中美容师绩效、提成、人效或服务记录财务审计意图。',
        },
      };
    }

    if (this.isFinanceMarginRiskRankRequest(text)) {
      if (!this.canUseTool('finance.margin.risk.rank', input.actor.role)) {
        return this.buildRoleDeniedPlan('finance.margin.risk.rank', businessTask, semanticSqlCandidate);
      }
      return {
        intentType: 'analysis_and_recommendation',
        goal: '查询毛利风险排行',
        toolPlan: [
          {
            tool: 'finance.margin.risk.rank',
            args: {
              question: input.message,
              timeRange: businessTask.timeRange?.preset ?? 'last_30_days',
              limit: this.detectCustomerListLimit(text),
            },
          },
        ],
        confidence: 0.88,
        clarificationNeeded: false,
        businessTask,
        semanticSqlCandidate,
        capabilityPlan: {
          capabilityId: 'finance_margin_risk_rank',
          reason: '命中低毛利、亏损或毛利风险排行意图，按项目/商品输出风险列表和处理建议。',
        },
        outputContract: this.outputContract(['kpi', 'table', 'evidence_panel'], ['kpi', 'table', 'action_card', 'evidence_panel']),
      };
    }

    if (this.isFinanceProfitDiagnoseRequest(text)) {
      if (!this.canUseTool('finance.profit.diagnose', input.actor.role)) {
        return this.buildRoleDeniedPlan('finance.profit.diagnose', businessTask, semanticSqlCandidate);
      }
      return {
        intentType: 'analysis_and_recommendation',
        goal: '诊断利润和毛利变化',
        toolPlan: [
          {
            tool: 'finance.revenue.summary',
            args: {
              question: input.message,
              timeRange: businessTask.timeRange?.preset ?? 'last_30_days',
            },
          },
          {
            tool: 'finance.profit.diagnose',
            args: {
              question: input.message,
              timeRange: businessTask.timeRange?.preset ?? 'last_30_days',
              limit: this.detectCustomerListLimit(text),
            },
          },
          {
            tool: 'finance.refund.discount.audit',
            args: {
              question: input.message,
              timeRange: businessTask.timeRange?.preset ?? 'last_30_days',
              limit: this.detectCustomerListLimit(text),
            },
          },
          {
            tool: 'finance.beautician.performance.audit',
            args: {
              question: input.message,
              timeRange: businessTask.timeRange?.preset ?? 'last_30_days',
              limit: this.detectCustomerListLimit(text),
            },
          },
        ],
        confidence: 0.87,
        clarificationNeeded: false,
        executionPath: 'deep',
        progressNotice: `正在分析${businessTask.timeRange?.label ?? '近30天'}的收入、利润成本、退款折扣和员工绩效风险。`,
        businessTask,
        semanticSqlCandidate,
        capabilityPlan: {
          capabilityId: 'finance_profit_diagnosis',
          reason: '命中利润、毛利、成本或提成变化诊断意图，复用经营利润口径输出原因和建议。',
        },
        skillPlan: {
          skillId: 'finance.profit.risk',
          capabilityId: 'finance_profit_diagnosis',
          confidence: 0.87,
          reason: '命中 P1 Skill「利润风险诊断」：组合收入、毛利、退款折扣和员工绩效风险给出诊断结论。',
          outputContract: {
            requiredKinds: ['kpi', 'table', 'evidence'],
            preferredKinds: ['kpi', 'table', 'evidence'],
            evidenceRequired: true,
            maxFollowUps: 3,
          },
        },
      };
    }

    if (this.isFinanceRevenueSummaryRequest(text)) {
      if (!this.canUseTool('finance.revenue.summary', input.actor.role)) {
        return this.buildRoleDeniedPlan('finance.revenue.summary', businessTask, semanticSqlCandidate);
      }
      return {
        intentType: 'analysis_and_recommendation',
        goal: '汇总财务收入',
        toolPlan: [
          {
            tool: 'finance.revenue.summary',
            args: {
              question: input.message,
              timeRange: businessTask.timeRange?.preset ?? 'today',
            },
          },
        ],
        confidence: 0.87,
        clarificationNeeded: false,
        executionPath: 'fast',
        businessTask,
        semanticSqlCandidate,
        capabilityPlan: {
          capabilityId: 'finance_revenue_summary',
          reason: '命中收入汇总、营收概览或实收流水查询意图，输出财务口径收入概览。',
        },
        outputContract: this.outputContract(['kpi', 'table', 'chart', 'evidence_panel']),
      };
    }

    if (this.isManagerDailyBriefingRequest(text)) {
      if (!this.canUseTool('manager.daily.briefing', input.actor.role)) {
        return this.buildRoleDeniedPlan('manager.daily.briefing', businessTask, semanticSqlCandidate);
      }
      return {
        intentType: 'analysis_and_recommendation',
        goal: '生成门店今日经营简报',
        toolPlan: [
          {
            tool: 'manager.daily.briefing',
            args: {
              question: input.message,
              timeRange: 'today',
            },
          },
        ],
        confidence: 0.88,
        clarificationNeeded: false,
        businessTask,
        semanticSqlCandidate,
        capabilityPlan: {
          capabilityId: 'manager_daily_briefing',
          reason: '命中店长今日重点关注与经营简报意图。',
        },
      };
    }

    if (input.actor.role !== 'beautician' && this.isReceptionReservationTodayRequest(text)) {
      if (!this.canUseTool('reception.reservation.today', input.actor.role)) {
        return this.buildRoleDeniedPlan('reception.reservation.today', businessTask, semanticSqlCandidate);
      }
      return {
        intentType: 'query',
        goal: '查询今日预约与待确认预约',
        toolPlan: [
          {
            tool: 'reception.reservation.today',
            args: {
              question: input.message,
              timeRange: 'today',
            },
          },
        ],
        confidence: 0.88,
        clarificationNeeded: false,
        executionPath: 'fast',
        businessTask,
        semanticSqlCandidate,
        capabilityPlan: {
          capabilityId: 'reception_reservation_today',
          reason: '命中前台查看今日预约意图。',
        },
        outputContract: this.outputContract(['table', 'evidence_panel'], ['kpi', 'table', 'action_card', 'evidence_panel']),
      };
    }

    if (input.actor.role !== 'beautician' && this.isReceptionCardBenefitSummaryRequest(text)) {
      if (!this.canUseTool('reception.card.benefit.summary', input.actor.role)) {
        return this.buildRoleDeniedPlan('reception.card.benefit.summary', businessTask, semanticSqlCandidate);
      }
      const customerContextArgs = this.buildCustomerContextArgs(businessTask);
      return {
        intentType: 'query',
        goal: '查询客户卡项与权益概况',
        toolPlan: [
          {
            tool: 'reception.card.benefit.summary',
            args: {
              question: input.message,
              customerQuery: String(customerContextArgs.customerName ?? customerContextArgs.customerId ?? this.extractCustomerQuery(input.message)),
              ...customerContextArgs,
            },
          },
        ],
        confidence: 0.87,
        clarificationNeeded: false,
        businessTask,
        semanticSqlCandidate,
        capabilityPlan: {
          capabilityId: 'reception_card_benefit_summary',
          reason: '命中前台卡项权益查询意图。',
        },
        outputContract: this.outputContract(['table', 'evidence_panel'], ['kpi', 'table', 'action_card', 'evidence_panel']),
      };
    }

    if (input.actor.role !== 'beautician' && this.isReceptionCashierQueryRequest(text)) {
      if (!this.canUseTool('business.query.ask', input.actor.role)) {
        return this.buildRoleDeniedPlan('business.query.ask', businessTask, semanticSqlCandidate);
      }
      return {
        intentType: 'query',
        goal: '查询前台收银与支付明细',
        toolPlan: [
          {
            tool: 'business.query.ask',
            args: {
              question: input.message,
              context: input.context,
              businessTask,
            },
          },
        ],
        confidence: 0.84,
        clarificationNeeded: false,
        executionPath: 'fast',
        businessTask,
        semanticSqlCandidate,
        capabilityPlan: {
          capabilityId: 'business_query',
          reason: '命中前台收银、支付方式、收款记录或结算明细查询意图，走受控经营问数。',
        },
        outputContract: this.outputContract(['evidence_panel'], ['kpi', 'table', 'evidence_panel']),
      };
    }

    if (input.actor.role !== 'beautician' && this.isReceptionOnsiteProjectGuidanceRequest(text)) {
      if (!this.canUseTool('project.diagnose', input.actor.role)) {
        return this.buildRoleDeniedPlan('project.diagnose', businessTask, semanticSqlCandidate);
      }
      return {
        intentType: 'query',
        goal: '查询前台可推荐项目',
        toolPlan: [
          {
            tool: 'project.diagnose',
            args: {
              question: input.message,
              timeRange: 'last_30_days',
              limit: 10,
            },
          },
        ],
        confidence: 0.82,
        clarificationNeeded: false,
        businessTask,
        semanticSqlCandidate,
        capabilityPlan: {
          capabilityId: 'project_business_diagnosis',
          reason: '命中前台现场接待中的项目推荐、加项目或服务内容咨询。',
        },
        outputContract: this.outputContract(['table', 'evidence_panel'], ['kpi', 'table', 'action_card', 'evidence_panel']),
      };
    }

    if (input.actor.role !== 'beautician' && this.isReceptionProductGuidanceRequest(text)) {
      if (!this.canUseTool('product.sales.rank', input.actor.role)) {
        return this.buildRoleDeniedPlan('product.sales.rank', businessTask, semanticSqlCandidate);
      }
      return {
        intentType: 'query',
        goal: '查询前台可售商品',
        toolPlan: [
          {
            tool: 'product.sales.rank',
            args: {
              question: input.message,
              timeRange: 'last_30_days',
              limit: 10,
            },
          },
        ],
        confidence: 0.82,
        clarificationNeeded: false,
        businessTask,
        semanticSqlCandidate,
        capabilityPlan: {
          capabilityId: 'product_sales_ranking',
          reason: '命中前台现场接待中的可售产品、带走商品或产品推荐咨询。',
        },
        outputContract: this.outputContract(['table', 'evidence_panel'], ['kpi', 'table', 'action_card', 'evidence_panel']),
      };
    }

    if (input.actor.role !== 'beautician' && this.isReceptionCustomerLookupRequest(text)) {
      if (!this.canUseTool('reception.customer.lookup', input.actor.role)) {
        return this.buildRoleDeniedPlan('reception.customer.lookup', businessTask, semanticSqlCandidate);
      }
      return {
        intentType: 'query',
        goal: '查询前台客户资料',
        toolPlan: [
          {
            tool: 'reception.customer.lookup',
            args: {
              question: input.message,
              query: this.extractCustomerQuery(input.message),
            },
          },
        ],
        confidence: 0.9,
        clarificationNeeded: false,
        executionPath: 'fast',
        businessTask,
        semanticSqlCandidate,
        capabilityPlan: {
          capabilityId: 'reception_customer_lookup',
          reason: '命中前台查客户资料意图。',
        },
        outputContract: this.outputContract(['evidence_panel'], ['table', 'action_card', 'evidence_panel']),
      };
    }

    if (this.isCustomerFollowUpDraftRequest(text)) {
      if (!this.canUseTool('customer.followup.task.draft', input.actor.role)) {
        return this.buildRoleDeniedPlan('customer.followup.task.draft', businessTask, semanticSqlCandidate);
      }
      return {
        intentType: 'draft',
        goal: '生成客户跟进任务草稿',
        toolPlan: [
          {
            tool: 'customer.followup.task.draft',
            args: {
              question: input.message,
              target: this.detectFollowUpTarget(text),
              limit: 10,
              channel: 'phone',
            },
          },
        ],
        confidence: 0.82,
        clarificationNeeded: false,
        businessTask,
        semanticSqlCandidate,
        capabilityPlan: {
          capabilityId: 'customer_followup_task_draft',
          reason: '用户请求生成客户跟进任务，属于中风险草稿能力。',
        },
      };
    }

    if (this.isInventoryRiskQueryRequest(text)) {
      if (!this.canUseTool('inventory.risk.rank', input.actor.role)) {
        return this.buildRoleDeniedPlan('inventory.risk.rank', businessTask, semanticSqlCandidate);
      }
      return {
        intentType: 'analysis_and_recommendation',
        goal: '查询库存风险与安全库存',
        toolPlan: [{ tool: 'inventory.risk.rank', args: { question: input.message, timeRange: businessTask.timeRange?.preset ?? 'today', limit: 20 } }],
        confidence: 0.84,
        clarificationNeeded: false,
        businessTask,
        semanticSqlCandidate,
        capabilityPlan: {
          capabilityId: 'inventory_supply_risk',
          reason: '命中库存供应风险、安全库存、库存货值或低效库存查询意图。',
        },
        outputContract: this.outputContract(['table', 'evidence_panel'], ['kpi', 'table', 'chart', 'action_card', 'evidence_panel']),
      };
    }

    if (this.isSupplyChainDiagnoseRequest(text)) {
      if (!this.canUseTool('supply_chain.diagnose', input.actor.role)) {
        return this.buildRoleDeniedPlan('supply_chain.diagnose', businessTask, semanticSqlCandidate);
      }
      return {
        intentType: 'query',
        goal: '诊断采购供应链与供应商协同',
        toolPlan: [{ tool: 'supply_chain.diagnose', args: { question: input.message, timeRange: businessTask.timeRange?.preset ?? 'last_30_days', limit: 10 } }],
        confidence: 0.82,
        clarificationNeeded: false,
        businessTask,
        semanticSqlCandidate,
        capabilityPlan: {
          capabilityId: 'supplier_performance_diagnosis',
          reason: '命中采购计划、供应商价格、交期、询价、质检或物流协同查询意图。',
        },
        outputContract: this.outputContract(['evidence_panel'], ['kpi', 'table', 'chart', 'action_card', 'evidence_panel']),
      };
    }

    if (this.isInventoryReplenishmentDraftRequest(text)) {
      if (!this.canUseTool('inventory.replenishment.draft', input.actor.role)) {
        return this.buildRoleDeniedPlan('inventory.replenishment.draft', businessTask, semanticSqlCandidate);
      }
      return {
        intentType: 'draft',
        goal: '生成库存补货采购草稿',
        toolPlan: [
          {
            tool: 'inventory.replenishment.draft',
            args: {
              question: input.message,
              limit: 10,
            },
          },
        ],
        confidence: 0.84,
        clarificationNeeded: false,
        businessTask,
        semanticSqlCandidate,
        capabilityPlan: {
          capabilityId: 'inventory_supply_risk',
          reason: '命中库存供应风险 Skill 的补货采购草稿场景，需人工审批后才创建采购草稿。',
        },
        skillPlan: {
          skillId: 'inventory.supply.risk',
          capabilityId: 'inventory_supply_risk',
          confidence: 0.84,
          reason: '命中 P1 Skill「库存供应风险诊断」：明确请求生成补货采购草稿。',
          outputContract: {
            requiredKinds: ['table', 'evidence'],
            preferredKinds: ['kpi', 'table', 'action_card', 'evidence'],
            evidenceRequired: true,
            maxFollowUps: 3,
          },
        },
      };
    }

    if (this.isInventoryConsumptionTrendRequest(text)) {
      if (!this.canUseTool('inventory.consumption.trend', input.actor.role)) {
        return this.buildRoleDeniedPlan('inventory.consumption.trend', businessTask, semanticSqlCandidate);
      }
      return {
        intentType: 'analysis_and_recommendation',
        goal: '分析库存消耗趋势',
        toolPlan: [{ tool: 'inventory.consumption.trend', args: { question: input.message, timeRange: 'last_30_days', limit: 10 } }],
        confidence: 0.86,
        clarificationNeeded: false,
        businessTask,
        semanticSqlCandidate,
        capabilityPlan: {
          capabilityId: 'inventory_consumption_trend',
          reason: '命中库存出库、耗材消耗和可用天数趋势分析意图。',
        },
        outputContract: this.outputContract(['evidence_panel'], ['kpi', 'table', 'chart', 'action_card', 'evidence_panel']),
      };
    }

    if (this.isProjectBomRiskRequest(text)) {
      if (!this.canUseTool('inventory.project.bom.risk', input.actor.role)) {
        return this.buildRoleDeniedPlan('inventory.project.bom.risk', businessTask, semanticSqlCandidate);
      }
      return {
        intentType: 'analysis_and_recommendation',
        goal: '诊断项目耗材 BOM 风险',
        toolPlan: [{ tool: 'inventory.project.bom.risk', args: { question: input.message, timeRange: 'last_30_days', limit: 10 } }],
        confidence: 0.86,
        clarificationNeeded: false,
        businessTask,
        semanticSqlCandidate,
        capabilityPlan: {
          capabilityId: 'inventory_project_bom_risk',
          reason: '命中项目耗材、BOM 和服务消耗保障风险意图。',
        },
        outputContract: this.outputContract(['table', 'evidence_panel'], ['kpi', 'table', 'action_card', 'evidence_panel']),
      };
    }

    if (this.isExpiringClearanceDraftRequest(text)) {
      if (!this.canUseTool('inventory.expiring.clearance.draft', input.actor.role)) {
        return this.buildRoleDeniedPlan('inventory.expiring.clearance.draft', businessTask, semanticSqlCandidate);
      }
      return {
        intentType: 'analysis_and_recommendation',
        goal: '生成临期库存处理草稿',
        toolPlan: [{ tool: 'inventory.expiring.clearance.draft', args: { question: input.message, horizonDays: 90, limit: 10 } }],
        confidence: 0.86,
        clarificationNeeded: false,
        businessTask,
        semanticSqlCandidate,
        capabilityPlan: {
          capabilityId: 'inventory_expiring_clearance_draft',
          reason: '命中临期库存、处理草稿和清库存建议意图。',
        },
        outputContract: this.outputContract(['evidence_panel'], ['kpi', 'table', 'action_card', 'evidence_panel']),
      };
    }

    if (this.isSupplierPurchaseLinkRequest(text)) {
      if (!this.canUseTool('supplier.purchase.link', input.actor.role)) {
        return this.buildRoleDeniedPlan('supplier.purchase.link', businessTask, semanticSqlCandidate);
      }
      return {
        intentType: 'analysis_and_recommendation',
        goal: '查询供应商采购链接',
        toolPlan: [{ tool: 'supplier.purchase.link', args: { question: input.message, limit: 10 } }],
        confidence: 0.84,
        clarificationNeeded: false,
        businessTask,
        semanticSqlCandidate,
        capabilityPlan: {
          capabilityId: 'supplier_purchase_link',
          reason: '命中供应商、采购链接、供货价或交期查询意图。',
        },
        outputContract: this.outputContract(['evidence_panel'], ['table', 'action_card', 'evidence_panel']),
      };
    }

    if (this.isBeauticianTodayServiceListRequest(text)) {
      if (!this.canUseTool('beautician.today.service.list', input.actor.role)) {
        return this.buildRoleDeniedPlan('beautician.today.service.list', businessTask, semanticSqlCandidate);
      }
      return {
        intentType: 'query',
        goal: '查询美容师今日服务客户',
        toolPlan: [
          {
            tool: 'beautician.today.service.list',
            args: {
              question: input.message,
              timeRange: 'today',
              limit: 10,
            },
          },
        ],
        confidence: 0.88,
        clarificationNeeded: false,
        businessTask,
        semanticSqlCandidate,
        capabilityPlan: {
          capabilityId: 'beautician_today_service_list',
          reason: '命中美容师今日客户和服务安排查询意图。',
        },
      };
    }

    if (input.actor.role === 'beautician' && this.isBeauticianCustomerCareBriefRequest(text)) {
      if (!this.canUseTool('beautician.customer.care.brief', input.actor.role)) {
        return this.buildRoleDeniedPlan('beautician.customer.care.brief', businessTask, semanticSqlCandidate);
      }
      return {
        intentType: 'analysis_and_recommendation',
        goal: '生成美容师客户护理摘要',
        toolPlan: [
          {
            tool: 'beautician.customer.care.brief',
            args: {
              question: input.message,
            },
          },
        ],
        confidence: 0.86,
        clarificationNeeded: false,
        businessTask,
        semanticSqlCandidate,
        capabilityPlan: {
          capabilityId: 'beautician_customer_care_brief',
          reason: '命中美容师下一个客户护理准备意图。',
        },
      };
    }

    if (this.isBeauticianPerformanceProgressRequest(text, input.actor.role)) {
      if (!this.canUseTool('beautician.performance.progress', input.actor.role)) {
        return this.buildRoleDeniedPlan('beautician.performance.progress', businessTask, semanticSqlCandidate);
      }
      return {
        intentType: 'analysis_and_recommendation',
        goal: '查询美容师本月业绩进度',
        toolPlan: [
          {
            tool: 'beautician.performance.progress',
            args: {
              question: input.message,
              timeRange: 'this_month',
              targetAmount: this.detectMoneyAmount(text),
            },
          },
        ],
        confidence: 0.87,
        clarificationNeeded: false,
        businessTask,
        semanticSqlCandidate,
        capabilityPlan: {
          capabilityId: 'beautician_performance_progress',
          reason: '命中美容师本人业绩、服务和提成进度查询意图。',
        },
        outputContract: this.outputContract(['kpi', 'table', 'evidence_panel'], ['kpi', 'table', 'action_card', 'evidence_panel']),
      };
    }

    if (this.isBeauticianRepurchaseOpportunityRequest(text, input.actor.role)) {
      if (!this.canUseTool('beautician.repurchase.opportunity', input.actor.role)) {
        return this.buildRoleDeniedPlan('beautician.repurchase.opportunity', businessTask, semanticSqlCandidate);
      }
      return {
        intentType: 'analysis_and_recommendation',
        goal: '推荐美容师服务客户复购续卡机会',
        toolPlan: [
          {
            tool: 'beautician.repurchase.opportunity',
            args: {
              question: input.message,
              timeRange: 'last_30_days',
              limit: 10,
            },
          },
        ],
        confidence: 0.86,
        clarificationNeeded: false,
        businessTask,
        semanticSqlCandidate,
        capabilityPlan: {
          capabilityId: 'beautician_repurchase_opportunity',
          reason: '命中美容师客户复购、续卡或服务后回访机会意图。',
        },
      };
    }

    if (this.isServiceRecordDraftRequest(text)) {
      if (!this.canUseTool('service.record.draft', input.actor.role)) {
        return this.buildRoleDeniedPlan('service.record.draft', businessTask, semanticSqlCandidate);
      }
      return {
        intentType: 'draft',
        goal: '生成服务记录草稿建议',
        toolPlan: [
          {
            tool: 'service.record.draft',
            args: {
              question: input.message,
              limit: 5,
            },
          },
        ],
        confidence: 0.82,
        clarificationNeeded: false,
        businessTask,
        semanticSqlCandidate,
      };
    }

    if (this.isSchedulingOptimizationRequest(text)) {
      if (!this.canUseTool('scheduling.optimization.preview', input.actor.role)) {
        return this.buildRoleDeniedPlan('scheduling.optimization.preview', businessTask, semanticSqlCandidate);
      }
      return {
        intentType: 'analysis_and_recommendation',
        goal: '生成智能排班优化预览',
        toolPlan: [
          {
            tool: 'scheduling.optimization.preview',
            args: {
              question: input.message,
              weekStart: this.detectWeekStart(text),
              mode: /当前|本周/.test(text) ? 'optimize_current' : 'copy_last_week_optimize',
              objective: /公平|均衡/.test(text) ? 'fairness' : /人手|少排|节省/.test(text) ? 'reduce_staff' : 'cover_reservations',
            },
          },
        ],
        confidence: 0.84,
        clarificationNeeded: false,
        businessTask,
        semanticSqlCandidate,
      };
    }

    if (this.isCustomerPriorityListRequest(text)) {
      const priorityPlan = this.planCustomerPriorityRecommendation(input.message, businessTask, input.actor.role, semanticSqlCandidate);
      if (priorityPlan) return priorityPlan;
      if (!this.canUseTool('customer.priority.rank', input.actor.role)) {
        return this.buildRoleDeniedPlan('customer.priority.rank', businessTask, semanticSqlCandidate);
      }
      return {
        intentType: 'analysis_and_recommendation',
        goal: '推荐优先跟进客户',
        toolPlan: [
          {
            tool: 'customer.priority.rank',
            args: {
              question: input.message,
              businessTask,
              limit: this.detectCustomerListLimit(text),
              timeRange: businessTask.timeRange?.preset ?? 'today',
              filters: businessTask.filters,
            },
          },
        ],
        confidence: Math.max(0.84, businessTask.confidence),
        clarificationNeeded: false,
        businessTask,
        semanticSqlCandidate,
        capabilityPlan: {
          capabilityId: 'customer_priority_recommendation',
          reason: '命中客户优先跟进推荐能力，按流失风险、复购机会、客户价值和近期跟进状态生成客户名单。',
        },
      };
    }

    if (this.isMarketingCustomerSegmentDiscoveryRequest(text)) {
      if (!this.canUseTool('marketing.customer.segment.discover', input.actor.role)) {
        return this.buildRoleDeniedPlan('marketing.customer.segment.discover', businessTask, semanticSqlCandidate);
      }
      return {
        intentType: 'analysis_and_recommendation',
        goal: '发现适合营销召回的客户分群',
        toolPlan: [
          {
            tool: 'marketing.customer.segment.discover',
            args: {
              question: input.message,
              segment: this.detectMarketingSegment(text),
              dateRange: 'last_90_days',
              limit: 20,
            },
          },
        ],
        confidence: 0.87,
        clarificationNeeded: false,
        businessTask,
        semanticSqlCandidate,
        capabilityPlan: {
          capabilityId: 'marketing_customer_segment_discover',
          reason: '命中营销客户分群发现意图。',
        },
      };
    }

    if (this.isPromotionOfferMatchRequest(text)) {
      if (!this.canUseTool('promotion.offer.match', input.actor.role)) {
        return this.buildRoleDeniedPlan('promotion.offer.match', businessTask, semanticSqlCandidate);
      }
      return {
        intentType: 'analysis_and_recommendation',
        goal: '匹配适合的营销权益与优惠方案',
        toolPlan: [
          {
            tool: 'promotion.offer.match',
            args: {
              question: input.message,
              segment: this.detectMarketingSegment(text),
              offerHint: this.detectOfferHint(text),
            },
          },
        ],
        confidence: 0.86,
        clarificationNeeded: false,
        businessTask,
        semanticSqlCandidate,
        capabilityPlan: {
          capabilityId: 'promotion_offer_match',
          reason: '命中营销优惠匹配意图。',
        },
      };
    }

    if (this.isMarketingCopyGenerateRequest(text)) {
      if (!this.canUseTool('marketing.copy.generate', input.actor.role)) {
        return this.buildRoleDeniedPlan('marketing.copy.generate', businessTask, semanticSqlCandidate);
      }
      return {
        intentType: 'draft',
        goal: '生成营销文案与触达话术',
        toolPlan: [
          {
            tool: 'marketing.copy.generate',
            args: {
              question: input.message,
              segment: this.detectMarketingSegment(text),
              tone: /温和|关怀|唤醒/.test(text) ? 'warm' : /强促|催单|冲刺/.test(text) ? 'conversion' : 'balanced',
            },
          },
        ],
        confidence: 0.88,
        clarificationNeeded: false,
        businessTask,
        semanticSqlCandidate,
        capabilityPlan: {
          capabilityId: 'marketing_copy_generate',
          reason: '命中营销文案生成意图。',
        },
        outputContract: this.outputContract(['action_card', 'table', 'evidence_panel'], ['action_card', 'table', 'evidence_panel'], true),
      };
    }

    if (this.isMarketingEffectRequest(text)) {
      if (!this.canUseTool('marketing.effect.diagnose', input.actor.role)) {
        return this.buildRoleDeniedPlan('marketing.effect.diagnose', businessTask, semanticSqlCandidate);
      }
      return {
        intentType: 'analysis_and_recommendation',
        goal: '诊断营销活动效果',
        toolPlan: [
          {
            tool: 'marketing.effect.diagnose',
            args: {
              question: input.message,
              dateRange: this.detectMarketingTimeRange(text) ?? 'last_30_days',
              filters: businessTask.filters,
              ...(businessTask.filters?.activityId !== undefined ? { activityId: businessTask.filters.activityId } : {}),
              ...(businessTask.filters?.activityTitle !== undefined ? { activityTitle: businessTask.filters.activityTitle } : {}),
            },
          },
        ],
        confidence: 0.89,
        clarificationNeeded: false,
        businessTask,
        semanticSqlCandidate,
        capabilityPlan: {
          capabilityId: 'marketing_effect_diagnosis',
          reason: '命中营销效果复盘意图。',
        },
        outputContract: this.outputContract(['kpi', 'table', 'chart', 'evidence_panel']),
      };
    }

    if (this.isMarketingOpportunity(text)) {
      if (!this.canUseTool('marketing.opportunity.discover', input.actor.role)) {
        return this.buildRoleDeniedPlan('marketing.opportunity.discover', businessTask, semanticSqlCandidate);
      }
      return {
        intentType: 'analysis_and_recommendation',
        goal: '发现适合做营销活动的商品、项目或客户机会',
        toolPlan: [
          {
            tool: 'marketing.opportunity.discover',
            args: {
              question: input.message,
              targetType: this.detectOpportunityTarget(text),
              dateRange: 'last_30_days',
              limit: 10,
              signals: ['stock', 'sales', 'expiry', 'margin', 'customerFit'],
            },
          },
        ],
        confidence: 0.86,
        clarificationNeeded: false,
        businessTask,
        semanticSqlCandidate,
        capabilityPlan: {
          capabilityId: 'marketing_opportunity_discovery',
          reason: '商品/项目/客户活动机会问题命中营销机会发现能力。',
        },
        outputContract: this.outputContract(['kpi', 'table', 'action_card', 'evidence_panel']),
      };
    }

    const priorityPlan = this.planCustomerPriorityRecommendation(input.message, businessTask, input.actor.role, semanticSqlCandidate);
    if (priorityPlan) {
      return {
        ...priorityPlan,
        businessTask,
        semanticSqlCandidate,
      };
    }

    if (this.isMarketingRecallActivityDraftRequest(text)) {
      if (!this.canUseTool('marketing.activity.draft', input.actor.role)) {
        return this.buildRoleDeniedPlan('marketing.activity.draft', businessTask, semanticSqlCandidate);
      }
      const recallDraft = this.buildMarketingRecallActivityDraftArgs(input.message, businessTask);
      return {
        intentType: 'draft',
        goal: '生成客户召回营销活动草稿',
        toolPlan: [
          {
            tool: 'marketing.activity.draft',
            args: recallDraft,
          },
        ],
        confidence: 0.86,
        clarificationNeeded: false,
        executionPath: 'deep',
        businessTask,
        semanticSqlCandidate,
        capabilityPlan: {
          capabilityId: 'marketing_growth_execution',
          reason: '命中客户召回活动草稿意图，生成活动预览并等待人工确认，不直接发布或触达客户。',
        },
        skillPlan: {
          skillId: 'marketing.growth.execution',
          capabilityId: 'marketing_growth_execution',
          confidence: 0.86,
          reason: '命中 P1 Skill「营销增长执行」：根据召回目标生成营销活动草稿和确认卡。',
          outputContract: {
            requiredKinds: ['action_card', 'table', 'evidence_panel'],
            preferredKinds: ['action_card', 'table', 'evidence_panel'],
            evidenceRequired: true,
            approvalRequired: true,
            maxFollowUps: 3,
          },
        },
        outputContract: this.outputContract(['action_card', 'table', 'evidence_panel'], ['action_card', 'table', 'evidence_panel'], true),
      };
    }

    if (this.isDraftRequest(text)) {
      const hasPreviousOpportunity = this.hasPreviousOpportunity(input.context);
      if (hasPreviousOpportunity && !this.canUseTool('marketing.activity.draft', input.actor.role)) {
        return this.buildRoleDeniedPlan('marketing.activity.draft', businessTask, semanticSqlCandidate);
      }
      return {
        intentType: hasPreviousOpportunity ? 'draft' : 'clarify',
        goal: '根据上一轮机会结果生成营销活动草稿',
        toolPlan: hasPreviousOpportunity
          ? [{ tool: 'marketing.activity.draft', args: { question: input.message, context: input.context } }]
          : [],
        confidence: hasPreviousOpportunity ? 0.82 : 0.58,
        clarificationNeeded: !hasPreviousOpportunity,
        clarificationQuestion: hasPreviousOpportunity
          ? null
          : '请先说明要基于哪些商品、项目或客户生成活动草稿，或先询问“有哪些商品适合做活动”。',
        businessTask,
        semanticSqlCandidate,
      };
    }

    const clarificationPlan = this.planClarificationFromCompiledTask(compiled);
    if (clarificationPlan) return clarificationPlan;

    const compiledPlan = this.planFromCompiledTask(compiled);
    if (compiledPlan) return compiledPlan;

    if (this.isBusinessQuestion(text) || businessTask.domain !== 'unknown') {
      return {
        intentType: 'query',
        goal: '执行受控经营问数',
        toolPlan: [
          {
            tool: 'business.query.ask',
            args: { question: input.message, context: input.context },
          },
        ],
        confidence: 0.76,
        clarificationNeeded: false,
        businessTask,
        semanticSqlCandidate,
        capabilityPlan: {
          capabilityId: semanticSqlCandidate.fallbackCapability ?? 'business_query',
          reason: '未命中专用 P0 能力，回退到受控经营问数能力。',
        },
      };
    }

    return {
      intentType: 'clarify',
      goal: '澄清用户想执行的经营任务',
      toolPlan: [],
      confidence: 0.3,
      clarificationNeeded: true,
      clarificationQuestion: `请说明要处理的经营任务，例如：${tools
        .slice(0, 3)
        .map((tool) => tool.description)
        .join('、')}。`,
      businessTask,
      semanticSqlCandidate,
    };
  }

  private canUseTool(toolName: string, role: AgentActor['role']) {
    const tool = this.findTool(toolName);
    if (!tool) return false;
    if (!tool.allowedRoles) return true;
    return tool.allowedRoles.includes(role);
  }

  private buildRoleDeniedPlan(toolName: string, businessTask: BusinessTask, semanticSqlCandidate: unknown): AgentPlan {
    const tool = this.findTool(toolName);
    return {
      intentType: 'clarify',
      goal: '角色权限不足',
      toolPlan: [],
      confidence: 0.9,
      clarificationNeeded: true,
      clarificationQuestion: `当前账号角色不能使用「${tool?.description ?? '该经营查询'}」能力，请切换有权限账号或由店长处理。`,
      businessTask,
      semanticSqlCandidate,
    };
  }

  private findTool(toolName: string) {
    const registry = this.toolRegistry as unknown as {
      get?: (name: string) => { description?: string; allowedRoles?: AgentActor['role'][] } | undefined;
      list?: () => Array<{ name: string; description?: string; allowedRoles?: AgentActor['role'][] }>;
    };
    if (typeof registry.get === 'function') return registry.get(toolName);
    return registry.list?.().find((tool) => tool.name === toolName);
  }

  private outputContract(
    requiredKinds: AmiBusinessSkillOutputContract['requiredKinds'],
    preferredKinds: AmiBusinessSkillOutputContract['preferredKinds'] = requiredKinds,
    approvalRequired = false,
  ): AmiBusinessSkillOutputContract {
    return {
      requiredKinds,
      preferredKinds,
      evidenceRequired: requiredKinds.includes('evidence_panel') || requiredKinds.includes('evidence'),
      approvalRequired,
      maxFollowUps: approvalRequired ? 1 : 3,
    };
  }

  private normalize(value: string) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '');
  }

  private planCustomerPriorityRecommendation(
    message: string,
    task: BusinessTask,
    role: AgentActor['role'],
    semanticSqlCandidate?: unknown,
  ): AgentPlan | null {
    if (task.domain !== 'customer') return null;
    if (!task.metrics.includes('follow_up_priority_score')) return null;
    if (task.taskType !== 'recommendation' && task.taskType !== 'ranking') return null;
    if (!this.canUseTool('customer.priority.rank', role)) {
      return this.buildRoleDeniedPlan('customer.priority.rank', task, undefined);
    }

    const limit = Math.min(Math.max(Number(task.limit) || 10, 1), 50);
    return {
      intentType: 'analysis_and_recommendation',
      goal: '推荐优先跟进客户',
      toolPlan: [
        {
          tool: 'customer.priority.rank',
          args: {
            question: message,
            businessTask: task,
            limit,
            timeRange: task.timeRange?.preset ?? 'today',
            filters: task.filters,
          },
        },
      ],
      confidence: Math.max(0.84, task.confidence),
      clarificationNeeded: false,
      executionPath: this.executionPathForCapability('customer_priority_recommendation'),
      businessTask: task,
      semanticSqlCandidate,
      capabilityPlan: {
        capabilityId: 'customer_priority_recommendation',
        reason: '命中客户优先跟进推荐能力，按流失风险、复购机会、客户价值和近期跟进状态生成客户名单。',
      },
      outputContract: this.outputContract(['table', 'action_card', 'evidence_panel'], ['kpi', 'table', 'action_card', 'evidence_panel']),
    };
  }

  private planFromCompiledTask(compiled: Awaited<ReturnType<BusinessTaskCompilerService['compile']>>): AgentPlan | null {
    const capability = compiled.capabilityMatches[0];
    const skill = compiled.skillMatches?.[0];
    if (!capability) return null;
    if (capability.capabilityId === 'business_query' && this.isMarketingOpportunity(this.normalize(compiled.task.objective))) {
      return null;
    }
    const goalByCapability: Record<string, string> = {
      customer_priority_recommendation: '推荐优先跟进客户',
      revenue_diagnosis: '诊断收入变化',
      order_revenue_analysis: '查询营收订单 KPI',
      order_customer_consumption_list: '查询消费客户清单',
      product_sales_ranking: '查询商品销量排行',
      inventory_supply_risk: '诊断库存供应风险',
      inventory_risk_ranking: '查询库存风险排行',
      reservation_schedule_diagnosis: '诊断预约排班',
      project_business_diagnosis: '诊断项目经营',
      card_member_business_diagnosis: '诊断卡项/会员卡经营',
      finance_margin_diagnosis: '诊断财务毛利',
      staff_performance_ranking: '查询员工表现排行',
      supplier_performance_diagnosis: '诊断供应链采购',
      marketing_conversion_diagnosis: '诊断营销转化',
      promotion_effect_analysis: '分析权益活动效果',
      automation_execution_diagnosis: '复盘自动化执行',
      customer_app_funnel_analysis: '分析客户小程序和渠道漏斗',
      terminal_health_diagnosis: '诊断终端设备与对话',
      refund_risk_diagnosis: '诊断售后退款',
      service_quality_diagnosis: '诊断服务质量',
      store_comparison_diagnosis: '诊断门店对比',
      business_query: '执行受控经营问数',
    };
    const goal = goalByCapability[capability.capabilityId];
    if (!goal) return null;
    if (capability.capabilityId === 'business_query' && compiled.task.domain === 'unknown') return null;
    const analysisCapabilities = new Set(
      Object.keys(goalByCapability).filter((id) => !['business_query', 'order_customer_consumption_list', 'order_revenue_analysis'].includes(id)),
    );

    return {
      intentType: analysisCapabilities.has(capability.capabilityId) ? 'analysis_and_recommendation' : 'query',
      goal,
      toolPlan: capability.toolPlan,
      confidence: Math.max(0.76, compiled.validation.confidence),
      clarificationNeeded: false,
      executionPath: this.executionPathForCapability(capability.capabilityId),
      businessTask: compiled.task,
      semanticSqlCandidate: compiled.semanticSqlCandidate,
      capabilityPlan: {
        capabilityId: capability.capabilityId,
        reason: capability.reason,
      },
      outputContract: skill?.outputContract ?? this.deriveOutputContract(compiled.task),
      skillPlan: skill
        ? {
            skillId: skill.skillId,
            capabilityId: skill.capabilityId,
            confidence: skill.confidence,
            reason: skill.reason,
            outputContract: skill.outputContract,
          }
        : undefined,
    };
  }

  private deriveOutputContract(task: BusinessTask): AmiBusinessSkillOutputContract {
    if (task.outputIntent === 'show_table' || task.outputMode === 'table' || task.outputMode === 'ranked_list') {
      return {
        requiredKinds: ['table', 'evidence_panel'],
        preferredKinds: ['kpi', 'table', 'evidence_panel'],
        minItems: 0,
        evidenceRequired: true,
        maxFollowUps: 3,
      };
    }
    if (task.outputIntent === 'show_kpi' || task.outputMode === 'card') {
      return {
        requiredKinds: ['kpi', 'evidence_panel'],
        preferredKinds: ['kpi', 'table', 'evidence_panel'],
        evidenceRequired: true,
        maxFollowUps: 3,
      };
    }
    if (task.outputIntent === 'show_chart') {
      return {
        requiredKinds: ['chart', 'evidence_panel'],
        preferredKinds: ['chart', 'table', 'evidence_panel'],
        evidenceRequired: true,
        maxFollowUps: 3,
      };
    }
    if (task.outputIntent === 'confirm_action' || task.outputIntent === 'draft_document' || task.outputMode === 'draft' || task.outputMode === 'workflow') {
      return {
        requiredKinds: ['action_card', 'evidence_panel'],
        preferredKinds: ['action_card', 'evidence_panel'],
        evidenceRequired: true,
        approvalRequired: task.requiresApproval,
        maxFollowUps: 1,
      };
    }
    return {
      requiredKinds: ['text'],
      preferredKinds: ['text', 'evidence_panel'],
      evidenceRequired: false,
      maxFollowUps: 3,
    };
  }

  private executionPathForCapability(capabilityId: string): AgentPlan['executionPath'] {
    const fastPathCapabilities = new Set([
      'order_customer_consumption_list',
      'order_revenue_analysis',
      'revenue_diagnosis',
      'finance_revenue_summary',
      'reservation_schedule_diagnosis',
      'inventory_supply_risk',
      'inventory_risk_ranking',
      'staff_performance_ranking',
      'customer_priority_recommendation',
    ]);
    return fastPathCapabilities.has(capabilityId) ? 'fast' : 'deep';
  }

  private planClarificationFromCompiledTask(
    compiled: Awaited<ReturnType<BusinessTaskCompilerService['compile']>>,
  ): AgentPlan | null {
    if (compiled.validation.valid) return null;
    const task = compiled.task;
    if (task.domain !== 'unknown' && !task.requiresApproval && task.riskLevel !== 'high') {
      return null;
    }
    return {
      intentType: 'clarify',
      goal: '澄清用户想执行的经营任务',
      toolPlan: [],
      confidence: Math.max(0.3, compiled.validation.confidence),
      clarificationNeeded: true,
      clarificationQuestion:
        compiled.validation.clarificationQuestion ??
        '请补充一个最关键条件，例如业务领域、时间范围、客户范围或要看的指标。',
      businessTask: compiled.task,
      semanticSqlCandidate: compiled.semanticSqlCandidate,
    };
  }

  private isMarketingOpportunity(text: string) {
    const hasMarketingIntent = /活动|营销|促销|权益|优惠|推一下|推广|清一清|清库存|搭售|满赠|邀约|推/.test(text);
    const hasOpportunityVerb = /适合|可以|哪些|哪个|推荐|建议|机会|做|搞|推/.test(text);
    const hasTarget = /商品|产品|项目|护理|服务|疗程|客户|会员|库存|东西|品/.test(text);
    return hasMarketingIntent && hasOpportunityVerb && hasTarget;
  }

  private isFinanceRevenueSummaryRequest(text: string) {
    if (/客户名单|客户清单|哪些客户|消费客户|流水客户/.test(text)) return false;
    if (/会员.*储值|储值.*余额|会员卡.*余额/.test(text)) return false;
    const hasRevenueDomain = /收入|营收|营业额|流水|实收|收款|订单金额|预付|预付款|应收账款|储值|分期付款|挂账|重复收费|双计费|多了还是少了|漏收|多收/.test(text);
    const hasSummaryIntent = /汇总|概览|总览|看板|统计|小结|实收|漏收|多收|多了还是少了|预付|预付款|应收账款|分期付款|挂账|重复收费|双计费|有没有|记录|需要处理|关注/.test(text);
    const hasProfitIntent = /利润|毛利|成本|亏损|提成/.test(text);
    const hasRiskRankIntent = /排行|排名|风险|最低|最高|亏损项|低毛利/.test(text);
    return hasRevenueDomain && hasSummaryIntent && !hasProfitIntent && !hasRiskRankIntent;
  }

  private isFinanceRefundDiscountAuditRequest(text: string) {
    const hasAuditIntent = /审计|稽核|复核|风控|检查|财务|超权限|合规|违规|规定范围|审批流程|私自|不入账|可疑|重复收费|双计费/.test(text);
    const hasRiskIntent = /异常|风险|高折扣|高退款|纠纷|处理时间|大额异常/.test(text);
    const hasDiscount = /折扣|优惠|打折|免单|赠送|手工优惠|手动优惠|优惠金额|折让/.test(text);
    const hasRefund = /退款|退费/.test(text);
    const hasCashierRisk = /收款|收费/.test(text) && /私自|不入账|重复|双计费|异常|风险/.test(text);
    if (hasRefund && !hasDiscount && !hasCashierRisk && !hasAuditIntent && !/财务|审计|稽核|折扣|手工|优惠|权限|合规|违规/.test(text)) return false;
    return (hasDiscount || hasRefund || hasCashierRisk) && (hasAuditIntent || hasRiskIntent);
  }

  private isFinanceBeauticianPerformanceAuditRequest(text: string) {
    const hasAuditIntent = /审计|稽核|复核|风控|异常|风险|检查/.test(text);
    const hasStaffDomain = /美容师|员工|技师|顾问|人效|绩效|提成|服务记录/.test(text);
    const hasFinanceSignal = /提成|绩效|人效|财务|销售|服务记录|完成率/.test(text);
    return hasAuditIntent && hasStaffDomain && hasFinanceSignal;
  }

  private isFinanceReportDraftRequest(text: string) {
    const hasFinanceDomain = /财务|收入|利润|毛利|经营/.test(text);
    const hasReportIntent = /报告|报表|日报|周报|月报|经营报告|财务简报/.test(text);
    const hasDraftIntent = /草稿|生成|起草|写|出一份|做一份|什么时候要出|需要什么数据/.test(text);
    return hasFinanceDomain && hasReportIntent && hasDraftIntent;
  }

  private isFinanceProfitDiagnoseRequest(text: string) {
    const hasProfitDomain = /利润|盈利|净收入|成本|耗材成本|提成成本|房租水电|预算|支出/.test(text);
    const hasDiagnosisIntent = /诊断|分析|原因|为什么|下降|上升|变化|影响|怎么样|情况|趋势|高吗|高不高|算一下|花了多少|控制空间|超出预算/.test(text);
    const hasProjectOnlyIntent = /项目耗材|项目毛利|服务项目/.test(text);
    const hasRiskRankIntent = /排行|排名|风险最高|风险最低|哪些.*(低|亏)|低毛利/.test(text);
    return hasProfitDomain && hasDiagnosisIntent && !hasProjectOnlyIntent && !hasRiskRankIntent;
  }

  private isFinanceMarginRiskRankRequest(text: string) {
    const hasMarginDomain = /毛利|利润|亏损|成本/.test(text);
    const hasRiskIntent = /风险|排行|排名|最低|最高|低毛利|亏损项|拖累|异常|控制空间|在亏损/.test(text);
    const hasTarget = /项目|商品|产品|服务|护理|品项|哪些|哪个/.test(text);
    const hasBomIntent = /BOM|bom|耗材保障|标准用量|够不够/.test(text);
    const hasProjectOnlyIntent = /项目毛利|项目.*毛利|服务项目|护理服务/.test(text) && !/商品|产品|品项/.test(text);
    return hasMarginDomain && hasRiskIntent && hasTarget && !hasBomIntent && !hasProjectOnlyIntent;
  }

  private isManagerDailyBriefingRequest(text: string) {
    const hasTodayFocus = /今天|今日|本日/.test(text);
    const hasBriefingIntent = /重点|简报|经营概览|概览|门店情况|经营情况|关注|待办|日报|今日安排/.test(text);
    const hasRevenueOnlyIntent = /收入|营收|营业额|流水|利润|毛利/.test(text);
    return hasTodayFocus && hasBriefingIntent && !hasRevenueOnlyIntent;
  }

  private isReceptionCustomerLookupRequest(text: string) {
    if (/这个活动|该活动|这场活动|上次那个活动|上一个活动/.test(text)) return false;
    if (this.isMarketingOpportunity(text) || this.isPromotionOfferMatchRequest(text) || this.isCustomerPriorityListRequest(text)) return false;
    if (/(搞|做|设计|活动|营销).{0,8}会员权益|会员权益.{0,8}(活动|营销|适合|搞)/.test(text)) return false;
    if (/营销|转化|roi|投入回报|免费体验|活动吸引|进店.*活动|自动识别|自动升级|自动触发|规则|供应商|理论耗材|实际差|储值卡余额总计|复购机会/.test(text)) return false;
    const hasLookupIntent =
      /查客户|查询客户|客户资料|客户信息|客户档案|会员资料|会员信息|查一下|快速看一下|看一下|找一下|上次|之前|办过卡|会员等级|权益|剩余|备注|标签|欠款|退款记录|活动|推荐过|固定的习惯|不满|家人也来过|反映的问题/.test(text);
    const hasCustomerMarker = /客户|客人|顾客|会员|手机号|电话|姓名|资料|信息|她|他|这位|这个/.test(text);
    return hasLookupIntent && hasCustomerMarker;
  }

  private isReceptionReservationTodayRequest(text: string) {
    const hasTimeScope = /今天|今日|本日|明天|明日|本周|这周|下午|上午|现在|临时/.test(text);
    if (/预约排班|排班.*风险|风险.*排班|邀约|回访|跟进/.test(text)) return false;
    const hasReservationIntent = /预约|到店|待确认|未确认|没有确认|排期|排班|改期|空档|空位|加客|通知到位|找不到记录|排得特别满|同时安排/.test(text);
    const hasQueryIntent = /查看|查询|看看|有哪些|什么|有没有|几个|几点|哪天|哪个|帮我|确认|能不能|可以吗|需要|能/.test(text);
    const hasNamedReservation = /预约.*(几点|做什么|项目)|(.{2,4})的预约/.test(text);
    const hasReservationAnomaly = /预约.{0,8}(没确认|没有确认|未确认|找不到记录|超过.{0,4}没有确认)|临时来了没预约|没预约.*安排|排得特别满|哪个时段可以加客|同时安排/.test(text);
    return (hasTimeScope || hasNamedReservation || hasReservationAnomaly || /待确认|未确认|改期|空档|空位/.test(text)) && hasReservationIntent && hasQueryIntent;
  }

  private isReceptionCardBenefitSummaryRequest(text: string) {
    if (/适合发.*优惠券|发什么优惠券|优惠券.*适合/.test(text)) return false;
    if (this.isPromotionOfferMatchRequest(text)) return false;
    if (/自动升级|规则|储值卡余额总计|客户都来消费|财务|现金流/.test(text)) return false;
    const hasCardIntent = /卡项权益|还有什么卡|卡还有|卡里还有|还有什么次卡|还剩多少次|剩余次数|可用次数|未核销.*优惠券|优惠券|会员折扣|预存|储值卡|次卡有效期|办过卡|升级会员|核销界面|用次卡|退卡|礼品卡/.test(text);
    const hasCustomerIntent = /客户|客人|顾客|会员|手机号|电话|姓名|张三|李四|王五|这个客户|这位客户|这个客人|这位客人|他|她/.test(text);
    const hasWholeShopIntent = /哪些|排行|全部|整体|门店|全店/.test(text);
    return hasCardIntent && (hasCustomerIntent || /核销界面|用次卡|退卡|礼品卡/.test(text)) && !hasWholeShopIntent;
  }

  private isReceptionCashierQueryRequest(text: string) {
    if (/财务|利润|毛利|现金流|经营报告|月报|周报/.test(text)) return false;
    const hasCashierIntent = /支付方式|微信|支付宝|现金|收款记录|收款明细|第一笔收款|已经收了多少钱|收了多少钱|收款多少|这笔单子|结算|买单|收银/.test(text);
    const hasOrderContext = /今天|今日|昨天|昨日|上周|本周|这笔|单子|客人|客户|她|他|产品|项目|储值卡消费/.test(text);
    return hasCashierIntent && hasOrderContext;
  }

  private isReceptionOnsiteProjectGuidanceRequest(text: string) {
    if (/营销|活动|促销|供应商|库存|财务|利润|毛利/.test(text)) return false;
    const hasProjectIntent = /推荐什么项目|什么项目|能做的项目|介绍什么|临时加项目|加项目|改变服务内容|服务内容|做面部|做身体/.test(text);
    const hasReceptionContext = /客人|客户|顾客|新客|现场|今天来了|她|他|洗手间|等待/.test(text);
    return hasProjectIntent && hasReceptionContext;
  }

  private isReceptionProductGuidanceRequest(text: string) {
    if (/营销|活动|促销|供应商|库存|财务|利润|毛利/.test(text)) return false;
    const hasProductIntent = /产品可以卖|有什么产品|买产品带走|可售产品|推荐产品|卖什么产品/.test(text);
    const hasReceptionContext = /客人|客户|顾客|现场|她|他|现在|我们/.test(text);
    return hasProductIntent && hasReceptionContext;
  }

  private isMarketingCustomerSegmentDiscoveryRequest(text: string) {
    const hasSegmentIntent = /沉睡|流失|消失|未到店|没来|召回|唤醒|回访|新客|未转化|高价值|复购|生日|分层|消费金额|优惠敏感|打折才来|基础项目|没升单|办了卡|还没预约|响应/.test(text);
    const hasAudienceIntent = /客户|顾客|客人|会员|人群|客群|名单/.test(text);
    const hasDiscoveryIntent = /找|筛|发现|盘一盘|看看|哪些|哪个|分群|做|安排|帮我|回访|召回|唤醒/.test(text);
    const hasCopyIntent = /短信|话术|文案|朋友圈|海报文案|私域文案|群发文案|消息|模板|祝福|欢迎词|脚本|通知/.test(text);
    return hasSegmentIntent && hasAudienceIntent && hasDiscoveryIntent && !hasCopyIntent && !this.isCustomerPriorityListRequest(text);
  }

  private isCustomerPriorityListRequest(text: string) {
    const hasCount =
      /(?:top|前)(\d+|[一二三四五六七八九十]+)/i.test(text) ||
      /(\d+|[一二三四五六七八九十]+)(个|位|名).{0,8}(客户|顾客|会员|老客|VIP)|((客户|顾客|会员|老客|VIP).{0,8}(\d+|[一二三四五六七八九十]+)(个|位|名))/i.test(text);
    const hasListIntent = /哪些|谁|哪几位|哪几个|名单|清单|排行|排名|列出|看一下/.test(text);
    const hasPriorityIntent = /优先|最值得|重点|紧急|该回访|回访|邀约|跟进|唤醒|召回|回流|复购|续卡|护理周期|再次到店/.test(text);
    const hasCustomerDomain = /客户|顾客|会员|老客|VIP|沉睡|流失|服务客户|护理客户/.test(text);
    return (hasCount || hasListIntent) && hasPriorityIntent && hasCustomerDomain;
  }

  private detectCustomerListLimit(text: string) {
    const match = text.match(/(\d+|[一二三四五六七八九十]+)(个|位|名)?/);
    if (!match) return 10;
    const raw = match[1];
    const digit = Number(raw);
    if (Number.isFinite(digit) && digit > 0) return Math.min(Math.max(digit, 1), 50);
    const chineseMap: Record<string, number> = {
      一: 1,
      二: 2,
      三: 3,
      四: 4,
      五: 5,
      六: 6,
      七: 7,
      八: 8,
      九: 9,
      十: 10,
    };
    if (raw === '十') return 10;
    if (raw.endsWith('十')) return Math.min((chineseMap[raw[0]] ?? 1) * 10, 50);
    if (raw.includes('十')) {
      const [tens, ones] = raw.split('十');
      return Math.min(((chineseMap[tens] ?? 1) * 10) + (chineseMap[ones] ?? 0), 50);
    }
    return chineseMap[raw] ?? 10;
  }

  private isPromotionOfferMatchRequest(text: string) {
    const hasOfferIntent = /优惠券|折扣|礼包|券|赠品|满减|买赠|优惠方案/.test(text);
    const hasMatchIntent = /匹配|推荐|适合|用什么|发什么|怎么配|选什么|配什么/.test(text);
    return hasOfferIntent && hasMatchIntent;
  }

  private isMarketingCopyGenerateRequest(text: string) {
    const hasCopyIntent = /话术|文案|短信|朋友圈|海报文案|私域文案|群发文案|消息|模板|祝福|欢迎词|脚本|通知|私信|感谢消息/.test(text);
    const hasGenerateIntent = /生成|写|起草|准备|改写|优化|帮我写|帮我生成|给.*写|发给/.test(text);
    return hasCopyIntent && hasGenerateIntent;
  }

  private isMarketingEffectRequest(text: string) {
    const hasEffectIntent = /效果|复盘|转化|核销|ROI|成交|触达|打开率|到店率/.test(text);
    const hasMarketingDomain = /活动|营销|优惠券|短信|朋友圈|私域|促销|权益/.test(text);
    const hasQueryIntent = /怎么样|如何|怎么样了|表现|结果/.test(text);
    const isPromotionEffect = /权益|优惠券|券|满减|折扣|优惠码/.test(text);
    return hasEffectIntent && hasMarketingDomain && hasQueryIntent && !isPromotionEffect;
  }

  private isHighRiskDirectAction(text: string) {
    const isReadOnlyCashierQuery =
      /查|查询|看|看看|明细|记录|多少|几笔|第一笔|方式|微信|支付宝|现金|有没有|异常|风险|不入账|可疑|重复|双计费/.test(text) &&
      /收款|收银|支付|单子|订单|结算/.test(text) &&
      !/确认收银|确认收款|直接收款|直接扣款|扣款|收款给|发起收款/.test(text);
    if (isReadOnlyCashierQuery) return false;
    const hasDirectAction = /发布|上线|群发|发送|推送|下发|自动发|发给|给.*(?:客户|会员).*发|扣款|收款|直接退款|发起退款|确认退款|退款给|直接核销|帮.*核销|确认核销|核销次卡|划扣|确认收银|改排班|删除/.test(text);
    const hasSensitiveDomain = /活动|客户|会员|短信|微信|小程序|订单|次卡|会员卡|余额|排班|预约|库存|收银|支付|扣款|收款/.test(text);
    return hasDirectAction && hasSensitiveDomain;
  }

  private buildHighRiskDirectActionQuestion(text: string) {
    if (/优惠券|权益|券|短信|微信|群发|发送|自动发|客户|会员/.test(text)) {
      return '该请求涉及正式触达客户，Agent 不能直接执行；请确认客户范围和是否先生成草稿预览？';
    }
    if (/退款|退费/.test(text)) {
      return '该请求涉及真实退款，Agent 不能直接执行；请确认订单范围和是否先生成退款核对清单？';
    }
    if (/核销|次卡|划扣/.test(text)) {
      return '该请求涉及真实核销或划扣，Agent 不能直接执行；请确认客户和卡项范围并先生成核对清单？';
    }
    if (/收银|收款|扣款|支付/.test(text)) {
      return '该请求涉及真实收银或扣款，Agent 不能直接执行；请确认订单范围并先生成收银核对清单？';
    }
    return '该请求涉及正式发布、批量触达、收银、核销或退款等高风险动作，Agent 不能直接执行；请确认操作范围并先生成草稿预览？';
  }

  private isCustomerFollowUpDraftRequest(text: string) {
    const hasTaskIntent = /跟进任务|邀约任务|回访任务|唤醒任务|创建跟进|生成跟进|安排跟进|生成邀约|设置.*提醒|提醒.*联系|下个月.*联系/.test(text);
    const hasCustomerDomain = /客户|客人|顾客|会员|流失|复购|邀约|回访|唤醒|沉睡/.test(text);
    return hasTaskIntent && hasCustomerDomain;
  }

  private detectFollowUpTarget(text: string) {
    if (/流失|沉睡|唤醒/.test(text)) return 'churn';
    if (/复购|补货|周期/.test(text)) return 'repurchase';
    if (/活动|营销|响应|邀约/.test(text)) return 'marketing_response';
    return 'mixed';
  }

  private isInventoryReplenishmentDraftRequest(text: string) {
    const hasDraftIntent = /补货草稿|采购草稿|生成补货|创建补货|生成采购|创建采购|补货建议草稿/.test(text);
    const hasInventoryDomain = /库存|商品|产品|补货|采购/.test(text);
    return hasDraftIntent && hasInventoryDomain;
  }

  private isInventoryRiskQueryRequest(text: string) {
    if (/供应商|采购计划|询价单|价格|账期|物流|下单|到货|供货|质检/.test(text)) return false;
    if (/哪家|分店|门店/.test(text)) return false;
    if (/补货草稿|采购草稿|生成补货|创建补货|生成采购|创建采购|补货建议草稿/.test(text)) return false;
    const hasRiskIntent = /低于安全库存|安全库存线|安全库存|低库存|缺货|仓库里有多少货|值多少钱|货值|一直有但从来不用|很长时间还没用完|需求突然增加|损耗金额|损耗多少|成本控制空间|过期.*损耗|变质/.test(text);
    const hasInventoryDomain = /库存|商品|产品|货|货品|仓库|耗材|护肤品|原材料|一次性耗材/.test(text);
    return hasRiskIntent && hasInventoryDomain;
  }

  private isInventoryConsumptionTrendRequest(text: string) {
    const hasTrendIntent = /趋势|消耗|耗材消耗|出库|进出库|用量|用了多少|还剩多少|消耗最快|可用几天|还能用几天|够用多久|够用吗|接待量增加|每个月.*损耗|损耗多少|货值/.test(text);
    const hasInventoryDomain = /库存|商品|产品|耗材|物料|洗面奶|补水精华|货|货值|一次性耗材/.test(text);
    return hasTrendIntent && hasInventoryDomain;
  }

  private isProjectBomRiskRequest(text: string) {
    const hasBomIntent = /BOM|bom|耗材保障|项目耗材|耗材风险|标准用量|项目用量/.test(text);
    const hasProjectDomain = /项目|护理|服务|疗程|耗材/.test(text);
    const hasInventoryRiskIntent = /BOM|bom|保障|风险|缺口|库存|够不够|不够|用量|消耗/.test(text);
    const hasMarginIntent = /毛利|利润|成本高|盈利|收入/.test(text);
    return hasBomIntent && hasProjectDomain && hasInventoryRiskIntent && !hasMarginIntent;
  }

  private isExpiringClearanceDraftRequest(text: string) {
    const hasExpiryIntent = /临期|快过期|即将过期|过期风险|清库存|消化库存|过期|保存不当|变质/.test(text);
    const hasDraftOrAdvice = /处理|草稿|方案|建议|怎么做|清一清|活动|损失金额|损耗|规定|有没有/.test(text);
    return hasExpiryIntent && hasDraftOrAdvice;
  }

  private isSupplierPurchaseLinkRequest(text: string) {
    const hasSupplierDomain = /供应商|供货商|采购链接|采购渠道|供货价|起订量|交期|从哪买|找谁采购/.test(text);
    const hasPurchaseIntent = /采购|补货|链接|价格|交期|供应/.test(text);
    const hasProductPurchaseContext = /低库存|商品|产品|耗材|物料|补货|采购链接|供货价|起订量|从哪买|找谁采购/.test(text);
    return hasSupplierDomain && hasPurchaseIntent && hasProductPurchaseContext;
  }

  private isSupplyChainDiagnoseRequest(text: string) {
    const hasSupplyDomain = /供应商|供货商|采购|询价|价格|账期|原材料|备货|进口|物流|下单|到货|质检|新品|交易记录/.test(text);
    const hasSupplyIntent = /计划|比较|优惠|替代|上涨|趋势|多备|核对|数量|价格|什么时候能到|影响不影响|提前多少天|联系方式|整理|记录|要不要/.test(text);
    return hasSupplyDomain && hasSupplyIntent;
  }

  private isServiceRecordDraftRequest(text: string) {
    const hasDraftIntent = /服务记录草稿|护理记录草稿|生成服务记录|生成护理记录|补服务记录|补护理记录|记录一下|记一下|怎么记录|服务时长|具体操作步骤|仪器参数|特殊需求|皮肤状态有明显变化/.test(text);
    const hasServiceDomain = /服务|护理|记录|美容师|客人|客户|仪器|皮肤/.test(text);
    return hasDraftIntent && hasServiceDomain;
  }

  private isBeauticianTodayServiceListRequest(text: string) {
    const hasTimeScope = /今天|今日|本日|当天|本周|这周|下午|上午|现在/.test(text);
    const hasCustomerOrService = /客户|客人|顾客|会员|服务|护理|预约|到店|空档|空位|排班|安排|培训|耗材|产品/.test(text);
    const hasSelfOrBeautician = /我|本人|美容师|我的|下一个|下个|最后一个/.test(text) || (/安排/.test(text) && /美容师|我的|我|服务客户/.test(text));
    const hasQueryIntent = /有哪些|什么|查看|看看|查|安排|列表|几点|多久|几个小时|空档|结束|取消|排班|怎样/.test(text);
    return hasTimeScope && hasCustomerOrService && hasSelfOrBeautician && hasQueryIntent;
  }

  private isBeauticianCustomerCareBriefRequest(text: string) {
    const hasNextCustomer = /下一个客户|下一位客户|下个客户|下一个客人|下一位客人|下个客人|这个客户|这位客户|这个客人|这位客人|客户要注意|客人要注意|护理前|服务前|她|他|客人|客户/.test(text);
    const hasCareIntent = /注意|提醒|护理建议|护理摘要|准备|禁忌|过敏|肤况|护理要点|服务要点|上次做|特殊要求|疗程|保养|怎么建议|怎么回答|抗老|升级|推荐项目|出油|色斑|敏感|暗沉|护理方案|护理重点|怎么调整|怎么介绍|沟通|送客/.test(text);
    return hasNextCustomer && hasCareIntent;
  }

  private isBeauticianPerformanceProgressRequest(text: string, role: AgentActor['role']) {
    const hasRankingIntent = /排行|排名|前\d+|前[一二三四五六七八九十]+|哪些|哪个|员工/.test(text);
    const hasSelfOrStaff = /我|我的|本人/.test(text) || (role === 'beautician' && /美容师/.test(text) && !hasRankingIntent);
    const hasPerformance = /业绩|表现|提成|销售额|服务数|服务次数|服务完成|服务质量|成交|完成率|目标|差多少|进度|绩效|贡献/.test(text);
    const hasTimeOrProgress = /今天|今日|本周|近7天|本月|这个月|月度|近30天|近一个月|最近|进度|差多少|目标|怎么样|情况|趋势|分析/.test(text);
    return hasSelfOrStaff && hasPerformance && hasTimeOrProgress;
  }

  private isBeauticianRepurchaseOpportunityRequest(text: string, role: AgentActor['role']) {
    const hasCustomerDomain = /客户|客人|顾客|会员|老客|卡项|次卡/.test(text);
    const hasOpportunity = /复购|续卡|回访|下次护理|再次到店|护理周期|适合跟进|适合邀约|推荐|升级|项目/.test(text);
    const hasBeauticianScope = role === 'beautician' || /我|我的|美容师|技师|我的客户|我服务/.test(text);
    return hasCustomerDomain && hasOpportunity && hasBeauticianScope;
  }

  private detectMoneyAmount(text: string) {
    const match = text.match(/(?:目标|业绩|做到|完成)?\s*(\d+(?:\.\d+)?)\s*(万|w|k|千|元)?/i);
    if (!match) return undefined;
    const hasMoneyContext = /目标|差多少|还差|做到|完成/.test(text) || Boolean(match[2]);
    if (!hasMoneyContext) return undefined;
    const raw = Number(match[1]);
    if (!Number.isFinite(raw) || raw <= 0) return undefined;
    const unit = match[2]?.toLowerCase();
    if (unit === '万' || unit === 'w') return raw * 10_000;
    if (unit === '千' || unit === 'k') return raw * 1_000;
    return raw;
  }

  private isSchedulingOptimizationRequest(text: string) {
    const hasSchedulingIntent = /优化|智能|生成|建议|预览/.test(text) && /排班/.test(text);
    const hasSchedulingDomain = /排班|预约|人手|美容师|班表/.test(text);
    return hasSchedulingIntent && hasSchedulingDomain;
  }

  private detectWeekStart(text: string) {
    if (/下周|下星期/.test(text)) return 'next_week';
    if (/本周|这周|当前/.test(text)) return 'this_week';
    return undefined;
  }

  private detectOpportunityTarget(text: string) {
    if (/项目|护理|服务|疗程/.test(text)) return 'project';
    if (/商品|产品|库存|东西|品/.test(text)) return 'product';
    if (/客户|会员|顾客/.test(text)) return 'customer';
    return 'product';
  }

  private extractCustomerQuery(message: string) {
    const text = String(message || '').trim();
    const phoneMatch = text.match(/1\d{10}/);
    if (phoneMatch) return phoneMatch[0];
    const candidates = text
      .replace(/查客户|查询客户|客户资料|客户信息|客户档案|会员资料|会员信息|查一下|查|客户|会员|资料|信息|档案|还有什么卡项权益|还有什么卡项|还有什么卡|卡项权益|权益|剩余次数|还剩|可用次数|预约|今天有哪些预约|今日有哪些预约|今日预约|今天预约/g, ' ')
      .trim();
    return candidates || text;
  }

  private buildCustomerContextArgs(task: BusinessTask | undefined): Record<string, unknown> {
    const filters = task?.filters ?? {};
    const customerId = filters.customerId;
    const customerName = filters.customerName;
    const phoneMasked = filters.phoneMasked;
    return {
      ...(customerId !== undefined && customerId !== null && customerId !== '' ? { customerId } : {}),
      ...(customerName !== undefined && customerName !== null && customerName !== '' ? { customerName } : {}),
      ...(phoneMasked !== undefined && phoneMasked !== null && phoneMasked !== '' ? { phoneMasked } : {}),
    };
  }

  private detectMarketingSegment(text: string) {
    if (/沉睡|流失|没来|未到店|唤醒|召回/.test(text)) return 'churn';
    if (/新客|未转化|首单/.test(text)) return 'new_customer';
    if (/高价值|高客单|大单/.test(text)) return 'vip';
    if (/复购|回购|回访/.test(text)) return 'repurchase';
    return 'mixed';
  }

  private detectOfferHint(text: string) {
    if (/优惠券|券/.test(text)) return 'coupon';
    if (/折扣/.test(text)) return 'discount';
    if (/赠品|礼包/.test(text)) return 'gift';
    if (/权益|会员/.test(text)) return 'membership_benefit';
    return 'mixed';
  }

  private detectMarketingTimeRange(text: string) {
    if (/近7天|7天/.test(text)) return 'last_7_days';
    if (/近30天|30天|上月|上个月/.test(text)) return 'last_30_days';
    if (/近90天|90天/.test(text)) return 'last_90_days';
    return undefined;
  }

  private isDraftRequest(text: string) {
    return /草稿|生成活动|创建活动|新建活动|做个活动|活动方案/.test(text);
  }

  private isMarketingRecallActivityDraftRequest(text: string) {
    const hasDraftIntent = /生成|创建|新建|做个|做一场|策划|设计|方案|怎么设计|做什么活动|活动方案|活动草稿|召回活动/.test(text);
    const hasMarketingDomain = /活动|营销|促销|权益|优惠券|券|礼包|私域|短信|老带新|三周年|周年|引流|朋友圈|新客/.test(text);
    const hasTarget = /召回|沉睡|流失|唤醒|未到店|没来|老客|回店|回流|老带新|新客|三周年|周年|朋友圈|引流|提前预约|不用打折|销售下滑|欢迎礼包/.test(text);
    return hasDraftIntent && (hasMarketingDomain || /召回活动/.test(text)) && hasTarget;
  }

  private buildMarketingRecallActivityDraftArgs(message: string, businessTask: BusinessTask) {
    const targetAudience = /高价值|VIP|大客户/.test(message)
      ? '60 天未到店高价值客户'
      : /沉睡/.test(message)
        ? '60 天未到店沉睡客户'
        : '60 天未到店流失风险客户';
    const offerSummary = /券|优惠券/.test(message)
      ? '回店护理券'
      : /折扣/.test(message)
        ? '回店专属折扣'
        : '回店护理权益';
    const title = /沉睡/.test(message)
      ? '沉睡客户召回活动'
      : /老客/.test(message)
        ? '老客回店召回活动'
        : '流失客户召回活动';
    return {
      question: message,
      businessTask,
      title,
      targetAudience,
      offerSummary,
      copyPreview: `亲爱的会员，最近店里为您准备了${offerSummary}，可预约一次肤况复测和护理建议。名额有限，您看这两天哪天方便到店？`,
      scheduleHint: '建议审批通过后保存为草稿，由运营确认客户名单和发送时间',
      items: [
        {
          name: title,
          productName: title,
          opportunityType: '客户召回',
          suggestedCampaign: offerSummary,
          fitScore: 82,
          customerCount: 60,
          reason: `${targetAudience}存在回店承接机会，适合先生成草稿并人工确认名单。`,
          riskWarnings: ['正式发布前需确认客户名单、权益成本和触达时间。'],
        },
      ],
    };
  }

  private isBusinessQuestion(text: string) {
    return /经营|收入|营收|营业额|流水|订单|商品|产品|项目|客户|会员|排班|预约|库存|补货|临期|次卡|会员卡|财务|营销|活动|权益|优惠券|自动化|门店|多店|异常|风险|预警|毛利|成本|采购|供应链|供应商|小程序|渠道|终端|设备|退款|售后|服务质量/.test(
      text,
    );
  }

  private hasPreviousOpportunity(context?: Record<string, unknown>) {
    if (!context) return false;
    const text = JSON.stringify(context);
    return /marketing\.opportunity\.discover|商品活动机会|productId|opportunity/i.test(text);
  }
}
