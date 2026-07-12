import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BrainRiskLevel, Prisma } from '@prisma/client';
import { BrainCognitionService, type BrainCognitionResult } from './cognition/brain-cognition.service.js';
import {
  BrainQuestionIntentService,
  type BrainQuestionIntentResult,
} from './cognition/brain-question-intent.service.js';
import type { BrainDateFilter, BrainDateRange } from './cognition/brain-time-range-parser.service.js';
import type { BrainRequestContext } from './context/brain-request-context.js';
import { BrainConversationContextService } from './context/brain-conversation-context.service.js';
import type { CreateBrainConversationDto, SendBrainMessageDto } from './dto/brain-chat.dto.js';
import { BrainTraceService } from './governance/brain-trace.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { BrainPermissionService } from './security/brain-permission.service.js';
import { BrainRedactionService } from './security/brain-redaction.service.js';
import { BrainRoleSkillPolicyService, type BrainRoleSkillKey } from './security/brain-role-skill-policy.service.js';
import { PromptInjectionGuardService } from './security/prompt-injection-guard.service.js';
import { BrainTimeRangeParserService } from './cognition/brain-time-range-parser.service.js';
import { BrainAnswerComposerService } from './semantic/brain-answer-composer.service.js';
import { BrainSemanticQueryEngineService } from './semantic/brain-semantic-query-engine.service.js';
import type { BrainDomainAnswer, BrainRoleIntentPlan } from './domain/brain-domain-adapter.types.js';
import { BrainDomainAdapterRegistryService } from './domain/brain-domain-adapter-registry.service.js';
import { BrainRoleIntentRouterService } from './domain/brain-role-intent-router.service.js';
import { BrainActionConfirmationService } from './skills/brain-action-confirmation.service.js';
import { BrainSkillRuntimeService } from './skills/brain-skill-runtime.service.js';
import { BrainMemoryService } from './memory/brain-memory.service.js';
import { BrainOrchestratorService } from './orchestrator/brain-orchestrator.service.js';
import { BrainTaskExecutorService } from './orchestrator/brain-task-executor.service.js';

type BrainChatStatus = 'completed' | 'failed';

interface BrainChatAnswer {
  status: BrainChatStatus;
  answer: string;
  citations: Array<{ sourceType: string; sourceId: string; label?: string; definition?: string }>;
  suggestedActions: unknown[];
  cognition?: BrainCognitionResult;
  routePlan?: BrainRoleIntentPlan;
  adapterKey?: string;
  grounding?: string;
  adapterMetadata?: Record<string, unknown>;
}

interface BrainAnswerReadyEvent {
  conversationId: number;
  runId: number;
  status: BrainChatStatus;
  answer: string;
  citations: BrainChatAnswer['citations'];
  suggestedActions: unknown[];
}

@Injectable()
export class BrainChatService {
  private readonly conversationAccessCache = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly cognition: BrainCognitionService,
    private readonly questionIntent: BrainQuestionIntentService,
    private readonly semanticEngine: BrainSemanticQueryEngineService,
    private readonly promptGuard: PromptInjectionGuardService,
    private readonly permissionService: BrainPermissionService,
    private readonly redactionService: BrainRedactionService,
    private readonly traceService: BrainTraceService,
    private readonly timeRangeParser: BrainTimeRangeParserService,
    private readonly answerComposer: BrainAnswerComposerService,
    private readonly skillRuntime: BrainSkillRuntimeService,
    private readonly roleSkillPolicy: BrainRoleSkillPolicyService,
    private readonly actionConfirmationService: BrainActionConfirmationService,
    private readonly roleIntentRouter?: BrainRoleIntentRouterService,
    private readonly domainAdapterRegistry?: BrainDomainAdapterRegistryService,
    private readonly conversationContext?: BrainConversationContextService,
    private readonly memoryService?: BrainMemoryService,
    private readonly orchestrator?: BrainOrchestratorService,
    private readonly taskExecutor?: BrainTaskExecutorService,
  ) {}

  async createConversation(context: BrainRequestContext, dto: CreateBrainConversationDto) {
    this.assertBaseAccess(context);
    const title = (dto.title?.trim() || '新会话').slice(0, 80);

    const conversation = await this.prisma.brainConversation.create({
      data: {
        storeId: context.storeId,
        userId: context.userId,
        title,
      },
    });
    this.rememberConversationAccess(context, conversation.id);
    return conversation;
  }

  async listConversations(context: BrainRequestContext) {
    this.assertBaseAccess(context);
    const where = { storeId: context.storeId, userId: context.userId, deletedAt: null };
    const [items, total] = await Promise.all([
      this.prisma.brainConversation.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
      this.prisma.brainConversation.count({ where }),
    ]);

    for (const conversation of items) this.rememberConversationAccess(context, conversation.id);
    return { items, total, storeId: context.storeId };
  }

  async sendMessage(
    context: BrainRequestContext,
    conversationId: number,
    dto: SendBrainMessageDto,
    options?: { onAnswerReady?: (event: BrainAnswerReadyEvent) => void },
  ) {
    this.assertBaseAccess(context);
    const inspection = this.promptGuard.inspectText(dto.message);
    if (!inspection.safe) {
      throw new ForbiddenException('输入包含绕过系统、权限或安全策略的指令，Ami Brain 已拦截。');
    }

    await this.ensureConversation(context, conversationId);

    const startedAt = Date.now();
    const createEnvelope = () => this.prisma.$transaction([
      this.prisma.brainMessage.create({
        data: {
          conversationId,
          role: 'user',
          content: dto.message,
          metadata: {
            requestId: context.requestId,
            timezone: dto.timezone ?? context.timezone,
            roleHint: dto.roleHint,
          } as Prisma.InputJsonValue,
        },
      }),
      this.prisma.brainRun.create({
        data: {
          conversationId,
          storeId: context.storeId,
          userId: context.userId,
          status: 'running',
          input: {
            message: dto.message,
            roleHint: dto.roleHint,
            timezone: dto.timezone ?? context.timezone,
            requestId: context.requestId,
          } as Prisma.InputJsonValue,
        },
      }),
    ]);
    let envelope: Awaited<ReturnType<typeof createEnvelope>>;
    try {
      envelope = await createEnvelope();
    } catch (error) {
      if (!this.isTransactionStartTimeout(error)) throw error;
      envelope = await createEnvelope();
    }
    const [, run] = envelope;

    let chatAnswer = await this.buildAnswer(context, conversationId, dto, run.id);
    if (this.memoryService && /(按我的习惯|照之前|照旧|默认方式|按之前)/.test(dto.message)) {
      try {
        const memories = await this.memoryService.retrieveRelevant({
          storeId: context.storeId,
          userId: context.userId,
          subjectPrefixes: ['user.preference.', 'store.preference.'],
        });
        const preferenceMemory = memories[0];
        if (preferenceMemory) {
          const content = preferenceMemory.content as Record<string, unknown>;
          const preference = String(content.preference ?? content.decision ?? '').trim();
          if (preference) {
            chatAnswer = {
              ...chatAnswer,
              answer: `${chatAnswer.answer}\n\n已参考你的偏好：${preference}。实时经营数值仍来自本次查询。`,
              citations: [
                ...chatAnswer.citations,
                {
                  sourceType: 'memory',
                  sourceId: String(preferenceMemory.id),
                  label: '用户偏好记忆',
                  definition: `更新时间 ${preferenceMemory.updatedAt.toISOString()}，置信度 ${preferenceMemory.confidence.toFixed(2)}`,
                },
              ],
            };
            await this.traceService.recordStep({
              runId: run.id,
              stepKey: 'memory_recall',
              layer: 'memory',
              input: { subjectPrefixes: ['user.preference.', 'store.preference.'] } as Prisma.InputJsonValue,
              output: { memoryIds: [preferenceMemory.id], usage: 'preference_only' } as Prisma.InputJsonValue,
              status: 'completed',
            });
          }
        }
      } catch (error) {
        await this.traceService.recordStep({
          runId: run.id,
          stepKey: 'memory_recall',
          layer: 'memory',
          status: 'failed',
          error: { message: this.errorMessage(error) } as Prisma.InputJsonValue,
        });
      }
    }
    options?.onAnswerReady?.({
      conversationId,
      runId: run.id,
      status: chatAnswer.status,
      answer: chatAnswer.answer,
      citations: chatAnswer.citations,
      suggestedActions: chatAnswer.suggestedActions,
    });
    const outputPayload = {
      answer: chatAnswer.answer,
      citations: chatAnswer.citations,
      suggestedActions: chatAnswer.suggestedActions,
      cognition: chatAnswer.cognition,
      routePlan: chatAnswer.routePlan,
      adapterKey: chatAnswer.adapterKey,
      grounding: chatAnswer.grounding,
      adapterMetadata: chatAnswer.adapterMetadata,
    };
    const output = this.toJsonValue(outputPayload);

    await this.prisma.brainRun.update({
      where: { id: run.id },
      data: {
        status: chatAnswer.status,
        output,
        latencyMs: Date.now() - startedAt,
        ...(chatAnswer.status === 'failed'
          ? { error: { message: chatAnswer.answer } as Prisma.InputJsonValue }
          : {}),
      },
    });
    await this.prisma.brainMessage.create({
      data: {
        conversationId,
        role: 'assistant',
        content: chatAnswer.answer,
        metadata: this.toJsonValue({
          runId: run.id,
          status: chatAnswer.status,
          citations: chatAnswer.citations,
          suggestedActions: chatAnswer.suggestedActions,
          routePlan: chatAnswer.routePlan,
          adapterKey: chatAnswer.adapterKey,
          grounding: chatAnswer.grounding,
          adapterMetadata: chatAnswer.adapterMetadata,
        }),
      },
    });
    await this.prisma.brainConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
    if (this.conversationContext) {
      try {
        await this.conversationContext.updateAfterRun({
          conversationId,
          runId: run.id,
          userId: context.userId,
          storeId: context.storeId,
          dto,
          cognition: chatAnswer.cognition,
          routePlan: chatAnswer.routePlan,
        });
      } catch (error) {
        await this.traceService.recordStep({
          runId: run.id,
          stepKey: 'conversation_context_write',
          layer: 'memory',
          status: 'failed',
          error: { message: this.errorMessage(error) } as Prisma.InputJsonValue,
        });
      }
    }
    if (this.memoryService) {
      try {
        const persistedMemories = await this.memoryService.persistCandidates({
          storeId: context.storeId,
          userId: context.userId,
          runId: run.id,
          text: dto.message,
        });
        if (persistedMemories.length) {
          await this.traceService.recordStep({
            runId: run.id,
            stepKey: 'memory_write',
            layer: 'memory',
            input: { candidateCount: persistedMemories.length } as Prisma.InputJsonValue,
            output: { memoryIds: persistedMemories.map((memory) => memory.id) } as Prisma.InputJsonValue,
            status: 'completed',
          });
        }
      } catch (error) {
        await this.traceService.recordStep({
          runId: run.id,
          stepKey: 'memory_write',
          layer: 'memory',
          status: 'failed',
          error: { message: this.errorMessage(error) } as Prisma.InputJsonValue,
        });
      }
    }

    return {
      conversationId,
      runId: run.id,
      status: chatAnswer.status,
      answer: chatAnswer.answer,
      citations: chatAnswer.citations,
      suggestedActions: chatAnswer.suggestedActions,
      contextStoreId: context.storeId,
    };
  }

  async listMessages(context: BrainRequestContext, conversationId: number) {
    this.assertBaseAccess(context);
    await this.ensureConversation(context, conversationId);
    const where = { conversationId };
    const [items, total] = await Promise.all([
      this.prisma.brainMessage.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        take: 200,
      }),
      this.prisma.brainMessage.count({ where }),
    ]);

    return { conversationId, items, total, storeId: context.storeId };
  }

  async listRunEvents(context: BrainRequestContext, runId: number) {
    this.assertBaseAccess(context);
    const run = await this.prisma.brainRun.findFirst({
      where: {
        id: runId,
        storeId: context.storeId,
        userId: context.userId,
      },
      select: { id: true },
    });

    if (!run) {
      throw new NotFoundException('运行记录不存在或不属于当前用户');
    }

    const events = await this.prisma.brainRunStep.findMany({
      where: { runId },
      orderBy: { createdAt: 'asc' },
    });

    return { runId, events, storeId: context.storeId };
  }

  async getRunContext(context: BrainRequestContext, runId: number) {
    this.assertBaseAccess(context);
    const run = await this.prisma.brainRun.findFirst({
      where: { id: runId, storeId: context.storeId, userId: context.userId },
      select: { id: true, conversationId: true, status: true },
    });
    if (!run || !run.conversationId) {
      throw new NotFoundException('运行记录不存在或不属于当前用户');
    }
    return { runId: run.id, conversationId: run.conversationId, status: run.status, storeId: context.storeId };
  }

  private async buildAnswer(
    context: BrainRequestContext,
    conversationId: number,
    inputDto: SendBrainMessageDto,
    runId: number,
  ): Promise<BrainChatAnswer> {
    const initialCognition = this.cognition.understand({ message: inputDto.message });
    const initialRuntimeIntent = this.questionIntent.classify(inputDto.message);
    let prepared: Awaited<ReturnType<BrainConversationContextService['prepareTurn']>> | undefined;
    if (this.conversationContext) {
      try {
        prepared = await this.conversationContext.prepareTurn({
          conversationId,
          dto: inputDto,
          cognition: initialCognition,
          runtimeIntent: initialRuntimeIntent,
        });
      } catch (error) {
        await this.traceService.recordStep({
          runId,
          stepKey: 'conversation_context_read',
          layer: 'memory',
          status: 'failed',
          error: { message: this.errorMessage(error) } as Prisma.InputJsonValue,
        });
      }
    }
    const dto = prepared?.dto ?? inputDto;
    const cognition = prepared?.cognition ?? initialCognition;
    const runtimeIntent = prepared?.runtimeIntent ?? initialRuntimeIntent;
    await this.traceService.recordStep({
      runId,
      stepKey: 'cognition',
      layer: 'cognition',
      input: { message: dto.message } as Prisma.InputJsonValue,
      output: cognition as unknown as Prisma.InputJsonValue,
      status: 'completed',
    });
    if (prepared && (prepared.inheritedSlots.length || prepared.corrections.length)) {
      await this.traceService.recordStep({
        runId,
        stepKey: 'conversation_context',
        layer: 'memory',
        input: this.toJsonValue({ message: inputDto.message, previous: prepared.previous }),
        output: this.toJsonValue({
          effectiveMessage: dto.message,
          inheritedSlots: prepared.inheritedSlots,
          corrections: prepared.corrections,
        }),
        status: 'completed',
      });
    }

    if (cognition.needsClarification && cognition.clarification) {
      return {
        status: 'completed',
        answer: cognition.clarification.question,
        citations: [],
        suggestedActions: cognition.clarification.options,
        cognition,
      };
    }

    const routePlan = this.roleIntentRouter?.route({
      message: dto.message,
      roleHint: dto.roleHint,
      runtimeIntent,
    });
    if (routePlan) {
      await this.traceService.recordStep({
        runId,
        stepKey: 'role_intent_route',
        layer: 'orchestration',
        input: this.toJsonValue({
          message: dto.message,
          roleHint: dto.roleHint,
          runtimeIntent,
        }),
        output: this.toJsonValue(routePlan),
        status: 'completed',
      });
    }
    const taskPlan = this.orchestrator?.createTaskPlan({
      message: dto.message,
      runtimeIntent,
      cognition,
      context,
    });
    if (taskPlan && this.taskExecutor) {
      await this.traceService.recordStep({
        runId,
        stepKey: 'supervisor_plan',
        layer: 'orchestration',
        input: this.toJsonValue({ message: dto.message, roleHint: dto.roleHint }),
        output: this.toJsonValue(taskPlan),
        status: 'completed',
      });
      const execution = await this.taskExecutor.execute({
        plan: taskPlan,
        context,
        dto,
        runId,
        cognition,
        runtimeIntent,
      });
      return {
        status: execution.status,
        answer: execution.answer,
        citations: execution.citations,
        suggestedActions: execution.suggestedActions,
        cognition,
        routePlan,
        grounding: 'db_skill',
        adapterMetadata: {
          supervisorPlan: taskPlan,
          taskResults: execution.results,
        },
      };
    }
    const metric = cognition.metrics[0] ?? runtimeIntent.expectedMetric;
    const domainAnswer = await this.tryDomainAdapterAnswer(context, dto, runId, cognition, runtimeIntent, routePlan);
    if (domainAnswer) return domainAnswer;
    if (routePlan?.unsupportedReason && (!metric || routePlan.reason !== 'no_supported_question_intent_detected')) {
      return this.unsupportedStructuredIntent(runtimeIntent, cognition, routePlan);
    }
    const skillAnswer = await this.tryRoleSkillAnswer(context, dto, runId, cognition, runtimeIntent);
    if (skillAnswer) return skillAnswer;

    if (!metric) {
      return {
        status: 'completed',
        answer:
          runtimeIntent.unsupportedAnswer ??
          '当前独立版 Ami Brain 已接入门店经营指标问答。请提问预约数、实收流水、复购率、毛利、会员卡负债、库存预警等已注册指标。',
        citations: [],
        suggestedActions: [],
        cognition,
        routePlan,
      };
    }

    if (runtimeIntent.intent === 'comparison' && metric === 'paid_revenue') {
      return this.answerPaidRevenueComparison(context, dto, runId, cognition, metric);
    }
    if (runtimeIntent.intent === 'ranking' && metric === 'paid_revenue') {
      return this.answerPaidRevenueRanking(context, dto, runId, cognition, metric);
    }
    if (!runtimeIntent.allowsScalarMetric) {
      return this.unsupportedStructuredIntent(runtimeIntent, cognition, routePlan);
    }

    const requiredPermission = this.semanticEngine.getRequiredPermission(metric);
    if (requiredPermission) {
      this.assertPermission(context, [requiredPermission]);
    }

    const timeRange = this.timeRangeParser.parse(dto.message);
    if (timeRange.requiresComparison) {
      return {
        status: 'completed',
        answer: `这个问题需要对比时间口径（${timeRange.range?.label ?? '对比时间'}）。当前独立版 Ami Brain 尚未接入对比计算，不会返回单期或全量数值。`,
        citations: [],
        suggestedActions: [],
        cognition,
        routePlan,
      };
    }
    if (timeRange.mentionedTime && timeRange.unsupportedExpressions.length > 0) {
      return {
        status: 'completed',
        answer: `时间范围「${timeRange.unsupportedExpressions.join('、')}」尚未支持解析，Ami Brain 不会退回全量历史数据。请改用今天、明天、昨天、本周、上周、本月、上月、本季度、上季度、今年或去年。`,
        citations: [],
        suggestedActions: [],
        cognition,
        routePlan,
      };
    }

    try {
      const queryResult = await this.semanticEngine.run({
        metrics: [metric],
        dimensions: cognition.dimensions,
        filters: timeRange.filters,
        storeId: context.storeId,
        permissions: context.permissions,
      });
      const rows = queryResult.rows as Array<Record<string, unknown>>;
      const firstRow = rows[0];
      const redactedRow = firstRow ? this.redactionService.redactRecord(firstRow, context.permissions) : {};
      const answer = this.answerComposer.compose({
        shape: 'scalar',
        label: queryResult.compiled.label,
        metric,
        valueField: queryResult.compiled.valueField,
        rows: [redactedRow],
      });

      await this.traceService.recordStep({
        runId,
        stepKey: 'semantic_query',
        layer: 'semantic',
        input: {
          metric,
          filters: this.serializeFilters(queryResult.compiled.filters),
        } as Prisma.InputJsonValue,
        output: {
          rows: [redactedRow],
          citations: queryResult.citations,
        } as Prisma.InputJsonValue,
        status: 'completed',
      });

      return {
        status: 'completed',
        answer,
        citations: queryResult.citations,
        suggestedActions: [],
        cognition,
        routePlan,
      };
    } catch (error) {
      const answer = this.toSafeQueryFailureAnswer(error);
      await this.traceService.recordStep({
        runId,
        stepKey: 'semantic_query',
        layer: 'semantic',
        input: { metric } as Prisma.InputJsonValue,
        status: 'failed',
        error: { message: this.errorMessage(error) } as Prisma.InputJsonValue,
      });

      return {
        status: 'failed',
        answer,
        citations: [],
        suggestedActions: [],
        cognition,
      };
    }
  }

  private async answerPaidRevenueComparison(
    context: BrainRequestContext,
    dto: SendBrainMessageDto,
    runId: number,
    cognition: BrainCognitionResult,
    metric: string,
  ): Promise<BrainChatAnswer> {
    const requiredPermission = this.semanticEngine.getRequiredPermission(metric);
    if (requiredPermission) this.assertPermission(context, [requiredPermission]);

    const timeRange = this.timeRangeParser.parse(dto.message);
    if (!timeRange.comparison) {
      return {
        status: 'completed',
        answer: `这个问题需要对比时间口径（${timeRange.range?.label ?? '对比时间'}）。当前独立版 Ami Brain 尚未接入该对比区间，不会返回单期或全量数值。`,
        citations: [],
        suggestedActions: [],
        cognition,
      };
    }

    try {
      const queryResult = await this.semanticEngine.run({
        metrics: [metric],
        dimensions: ['date'],
        filters: [
          this.rangeToDateFilter(timeRange.comparison.current),
          this.rangeToDateFilter(timeRange.comparison.previous, 'previous_date'),
        ],
        storeId: context.storeId,
        permissions: context.permissions,
        answerShape: 'comparison',
      });
      const rows = queryResult.rows as Array<Record<string, unknown>>;
      const answer = `${timeRange.comparison.current.label}对比${timeRange.comparison.previous.label}：${this.answerComposer.compose({
        shape: 'comparison',
        label: queryResult.compiled.label,
        metric,
        rows,
      })}`;
      const citations = queryResult.citations;

      await this.traceService.recordStep({
        runId,
        stepKey: 'semantic_query_comparison',
        layer: 'semantic',
        input: {
          metric,
          comparison: timeRange.comparison.label,
        } as Prisma.InputJsonValue,
        output: {
          rows,
          citations,
        } as Prisma.InputJsonValue,
        status: 'completed',
      });

      return { status: 'completed', answer, citations, suggestedActions: [], cognition };
    } catch (error) {
      return this.failedSemanticAnswer(error, runId, metric, cognition);
    }
  }

  private async answerPaidRevenueRanking(
    context: BrainRequestContext,
    dto: SendBrainMessageDto,
    runId: number,
    cognition: BrainCognitionResult,
    metric: string,
  ): Promise<BrainChatAnswer> {
    const requiredPermission = this.semanticEngine.getRequiredPermission(metric);
    if (requiredPermission) this.assertPermission(context, [requiredPermission]);

    const timeRange = this.timeRangeParser.parse(dto.message);
    if (timeRange.requiresComparison) {
      return {
        status: 'completed',
        answer: `这个问题需要对比排行口径（${timeRange.range?.label ?? '对比时间'}）。当前独立版 Ami Brain 尚未接入该组合口径，不会返回单期或全量数值。`,
        citations: [],
        suggestedActions: [],
        cognition,
      };
    }
    if (timeRange.mentionedTime && timeRange.unsupportedExpressions.length > 0) {
      return {
        status: 'completed',
        answer: `时间范围「${timeRange.unsupportedExpressions.join('、')}」尚未支持解析，Ami Brain 不会退回全量历史数据。`,
        citations: [],
        suggestedActions: [],
        cognition,
      };
    }

    try {
      const queryResult = await this.semanticEngine.run({
        metrics: [metric],
        dimensions: ['beautician'],
        filters: timeRange.filters,
        storeId: context.storeId,
        permissions: context.permissions,
        answerShape: 'ranking',
        groupBy: 'beautician',
        limit: 5,
      });
      const rows = (queryResult.rows as Array<Record<string, unknown>>).map((row) =>
        this.redactionService.redactRecord(row, context.permissions),
      );
      const answer = `员工业绩排行：\n${this.answerComposer.compose({
        shape: 'ranking',
        label: queryResult.compiled.label,
        metric,
        valueField: queryResult.compiled.valueField,
        rows,
      })}`;

      await this.traceService.recordStep({
        runId,
        stepKey: 'semantic_query_ranking',
        layer: 'semantic',
        input: {
          metric,
          filters: this.serializeFilters(queryResult.compiled.filters),
          groupBy: 'beautician',
        } as Prisma.InputJsonValue,
        output: {
          rows,
          citations: queryResult.citations,
        } as Prisma.InputJsonValue,
        status: 'completed',
      });

      return {
        status: 'completed',
        answer,
        citations: queryResult.citations,
        suggestedActions: [],
        cognition,
      };
    } catch (error) {
      return this.failedSemanticAnswer(error, runId, metric, cognition);
    }
  }

  private unsupportedStructuredIntent(
    runtimeIntent: BrainQuestionIntentResult,
    cognition: BrainCognitionResult,
    routePlan?: BrainRoleIntentPlan,
  ): BrainChatAnswer {
    return {
      status: 'completed',
      answer:
        routePlan?.unsupportedReason ??
        runtimeIntent.unsupportedAnswer ??
        '当前独立版 Ami Brain 尚未接入该问题所需的经营技能，不会用单个指标替代回答。',
      citations: [],
      suggestedActions: [],
      cognition,
      routePlan,
    };
  }

  private async tryDomainAdapterAnswer(
    context: BrainRequestContext,
    dto: SendBrainMessageDto,
    runId: number,
    cognition: BrainCognitionResult,
    runtimeIntent: BrainQuestionIntentResult,
    routePlan?: BrainRoleIntentPlan,
  ): Promise<BrainChatAnswer | undefined> {
    if (!routePlan?.adapterKey || !this.domainAdapterRegistry) return undefined;
    if (runtimeIntent.allowsScalarMetric) return undefined;
    const adapter = this.domainAdapterRegistry.resolve(routePlan);
    if (!adapter) return undefined;
    const requiredPermissions = routePlan.requiredPermissions.length > 0 ? routePlan.requiredPermissions : adapter.requiredPermissions;
    this.assertPermission(context, requiredPermissions);
    const answer = await adapter.execute({
      context,
      dto,
      runId,
      cognition,
      runtimeIntent,
      plan: routePlan,
    });
    if (!answer) return undefined;
    await this.recordDomainAdapterStep(runId, dto, routePlan, answer);
    return {
      status: answer.status,
      answer: answer.answer,
      citations: answer.citations,
      suggestedActions: answer.suggestedActions ?? [],
      cognition,
      routePlan,
      adapterKey: adapter.key,
      grounding: answer.grounding,
      adapterMetadata: answer.metadata,
    };
  }

  private async recordDomainAdapterStep(
    runId: number,
    dto: SendBrainMessageDto,
    routePlan: BrainRoleIntentPlan,
    answer: BrainDomainAnswer,
  ) {
    await this.traceService.recordStep({
      runId,
      stepKey: `domain_adapter_${routePlan.adapterKey}`,
      layer: 'skill',
      input: this.toJsonValue({
        message: dto.message,
        roleHint: dto.roleHint,
        routePlan,
      }),
      output: this.toJsonValue({
        answer: answer.answer,
        citations: answer.citations,
        suggestedActions: answer.suggestedActions ?? [],
        grounding: answer.grounding,
        metadata: answer.metadata,
      }),
      status: answer.status,
    });
  }

  private async tryRoleSkillAnswer(
    _context: BrainRequestContext,
    dto: SendBrainMessageDto,
    runId: number,
    cognition: BrainCognitionResult,
    runtimeIntent: BrainQuestionIntentResult,
  ): Promise<BrainChatAnswer | undefined> {
    if (runtimeIntent.allowsScalarMetric) return undefined;
    if (dto.roleHint === 'marketing' && this.shouldUseMarketingCampaignPlan(dto.message)) {
      this.assertRoleSkillAccess(_context, 'marketing_campaign_plan');
      const answer = this.skillRuntime.draftCampaignPlan({
        theme: /母亲节/.test(dto.message) ? '母亲节' : undefined,
      });
      return this.completedSkillAnswer({
        runId,
        stepKey: 'skill_marketing_campaign_plan',
        message: dto.message,
        roleHint: dto.roleHint,
        answer,
        citations: [{ sourceType: 'skill', sourceId: 'marketing_campaign_plan', label: '营销活动方案' }],
        cognition,
      });
    }

    if (dto.roleHint === 'marketing' && runtimeIntent.intent === 'draft') {
      this.assertRoleSkillAccess(_context, 'marketing_draft');
      const answer = /召回|沉默|没来/.test(dto.message)
        ? this.skillRuntime.draftCustomerRecall({})
        : this.skillRuntime.draftAppointmentReminder({});
      return this.completedSkillAnswer({
        runId,
        stepKey: 'skill_marketing_draft',
        message: dto.message,
        roleHint: dto.roleHint,
        answer,
        citations: [{ sourceType: 'skill', sourceId: 'marketing_draft_appointment_reminder', label: '预约提醒文案' }],
        cognition,
      });
    }

    const range = this.resolveSkillDateRange(dto.message);
    if (
      dto.roleHint === 'store_manager' &&
      /(店里情况.*总结|来个总结|异常情况|特别注意的风险|需要.*风险|需要.*注意|马上处理|紧急事项)/.test(dto.message)
    ) {
      this.assertRoleSkillAccess(_context, 'manager_daily_overview');
      const overview = await this.skillRuntime.buildManagerDailyOverview({
        storeId: _context.storeId,
        startDate: range.startDate,
        endDate: range.endDate,
      });
      const riskText = overview.riskItems.length > 0 ? `风险：${overview.riskItems.join('；')}。` : '风险：当前未发现明确预警。';
      return this.completedSkillAnswer({
        runId,
        stepKey: 'skill_manager_daily_overview',
        message: dto.message,
        roleHint: dto.roleHint,
        answer: `今日经营概览：实收流水 ${this.formatMoney(overview.revenue)}，预约 ${overview.appointmentCount} 个，活跃客户 ${overview.activeCustomerCount} 人，毛利率 ${this.formatPercent(overview.grossMarginRate)}。${riskText}`,
        citations: [{ sourceType: 'skill', sourceId: 'manager_daily_overview', label: '店长经营概览' }],
        cognition,
      });
    }

    if (dto.roleHint === 'receptionist' && this.shouldUseReceptionReservationSchedule(dto.message)) {
      this.assertRoleSkillAccess(_context, 'reception_reservation_schedule');
      const schedule = await this.skillRuntime.listReceptionReservations({
        storeId: _context.storeId,
        startDate: range.startDate,
        endDate: range.endDate,
      });
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
      return this.completedSkillAnswer({
        runId,
        stepKey: 'skill_reception_reservation_schedule',
        message: dto.message,
        roleHint: dto.roleHint,
        answer: `预约清单：共 ${schedule.count} 个。\n${lines}`,
        citations: [{ sourceType: 'skill', sourceId: 'reception_reservation_schedule', label: '前台预约清单' }],
        cognition,
      });
    }

    if (dto.roleHint === 'receptionist' && runtimeIntent.intent === 'action' && this.shouldUseReceptionReservationAction(dto.message)) {
      this.assertRoleSkillAccess(_context, 'reception_action_preview');
      const targetTime = this.extractTargetTimeLabel(dto.message);
      const preview = this.skillRuntime.previewReservationAction({
        actionType: /改约|改期|调整/.test(dto.message) ? 'reschedule_reservation' : 'create_reservation',
        targetTime,
      });
      const confirmation = await this.actionConfirmationService.createPreview({
        runId,
        userId: _context.userId,
        storeId: _context.storeId,
        skillKey: preview.actionType,
        riskLevel: preview.riskLevel as BrainRiskLevel,
        preview: preview as unknown as Prisma.InputJsonValue,
        payload: {
          message: dto.message,
          roleHint: dto.roleHint,
          targetTime,
        } as Prisma.InputJsonValue,
      });
      const persistedPreview = { ...preview, actionId: confirmation.actionId };
      return this.completedSkillAnswer({
        runId,
        stepKey: 'skill_reception_action_preview',
        message: dto.message,
        roleHint: dto.roleHint,
        answer: preview.summary,
        citations: [{ sourceType: 'skill', sourceId: 'reception_action_preview', label: '前台动作预览' }],
        suggestedActions: [persistedPreview],
        cognition,
      });
    }

    if ((dto.roleHint === 'inventory' || dto.roleHint === 'store_manager') && this.shouldUseInventoryDisposalAdvice(dto.message)) {
      this.assertRoleSkillAccess(_context, 'inventory_disposal_advice');
      const answer = this.skillRuntime.composeInventoryDisposalAdvice();
      return this.completedSkillAnswer({
        runId,
        stepKey: 'skill_inventory_disposal_advice',
        message: dto.message,
        roleHint: dto.roleHint,
        answer,
        citations: [{ sourceType: 'skill', sourceId: 'inventory_disposal_advice', label: '临期过期处理建议' }],
        cognition,
      });
    }

    if ((dto.roleHint === 'inventory' || dto.roleHint === 'store_manager') && this.shouldUseInventorySkill(dto.message)) {
      this.assertRoleSkillAccess(_context, 'inventory_risk_summary');
      const summary = await this.skillRuntime.buildInventoryRiskSummary({
        storeId: _context.storeId,
        expiringBefore: range.endDate,
      });
      if (this.shouldUseInventoryExpiryList(dto.message)) {
        const expiryLines =
          summary.expiringProducts.length > 0
            ? summary.expiringProducts
                .slice(0, 10)
                .map((item, index) => {
                  const expiryDate = item.expiryDate ? `，到期日 ${item.expiryDate}` : '';
                  return `${index + 1}. ${item.name}：剩余 ${item.stock}${expiryDate}，估算货值 ${this.formatMoney(item.estimatedValue)}。`;
                })
                .join('\n')
            : '当前没有命中临期或过期库存批次。';
        return this.completedSkillAnswer({
          runId,
          stepKey: 'skill_inventory_expiry_summary',
          message: dto.message,
          roleHint: dto.roleHint,
          answer: `临期/过期库存清单：\n${expiryLines}\n临期库存金额 ${this.formatMoney(summary.expiringStockValue)}。`,
          citations: [{ sourceType: 'skill', sourceId: 'inventory_risk_summary', label: '库存风险摘要' }],
          cognition,
        });
      }
      const lowStockLines =
        summary.lowStockProducts.length > 0
          ? summary.lowStockProducts
              .slice(0, 10)
              .map((item, index) => `${index + 1}. ${item.name}：当前 ${item.currentStock}，安全库存 ${item.safetyStock}。`)
              .join('\n')
          : '当前没有低于安全库存的产品。';
      return this.completedSkillAnswer({
        runId,
        stepKey: 'skill_inventory_risk_summary',
        message: dto.message,
        roleHint: dto.roleHint,
        answer: `低库存产品：\n${lowStockLines}\n临期库存金额 ${this.formatMoney(summary.expiringStockValue)}。${summary.suggestedAction}`,
        citations: [{ sourceType: 'skill', sourceId: 'inventory_risk_summary', label: '库存风险摘要' }],
        cognition,
      });
    }

    if ((dto.roleHint === 'finance' || dto.roleHint === 'store_manager') && this.shouldUseFinanceSkill(dto.message)) {
      this.assertRoleSkillAccess(_context, 'finance_risk_summary');
      const summary = await this.skillRuntime.buildFinanceRiskSummary({
        storeId: _context.storeId,
        startDate: range.startDate,
        endDate: range.endDate,
      });
      const riskText = summary.riskItems.length > 0 ? `风险：${summary.riskItems.join('；')}` : '风险：当前未发现明确财务预警。';
      const marginText =
        summary.grossMarginRate === undefined ? '毛利率暂无结算数据' : `毛利率 ${this.formatPercent(summary.grossMarginRate)}`;
      return this.completedSkillAnswer({
        runId,
        stepKey: 'skill_finance_risk_summary',
        message: dto.message,
        roleHint: dto.roleHint,
        answer: `财务风险摘要：退款 ${summary.refundCount} 笔，金额 ${this.formatMoney(summary.refundAmount)}；优惠 ${this.formatMoney(summary.discountAmount)}；${marginText}。${riskText}`,
        citations: [{ sourceType: 'skill', sourceId: 'finance_risk_summary', label: '财务风险摘要' }],
        cognition,
      });
    }

    if (dto.roleHint === 'beautician' && this.shouldUseBeauticianSkill(dto.message)) {
      if (this.shouldUseBeauticianCareAdvice(dto.message)) {
        this.assertRoleSkillAccess(_context, 'beautician_follow_up_advice');
        const answer = this.skillRuntime.composeBeauticianFollowUpAdvice({});
        return this.completedSkillAnswer({
          runId,
          stepKey: 'skill_beautician_follow_up',
          message: dto.message,
          roleHint: dto.roleHint,
          answer,
          citations: [{ sourceType: 'skill', sourceId: 'beautician_follow_up_advice', label: '美容师跟进建议' }],
          cognition,
        });
      }
      this.assertRoleSkillAccess(_context, 'beautician_service_summary');
      const summary = await this.skillRuntime.buildBeauticianServiceSummary({
        storeId: _context.storeId,
        userId: _context.userId,
        startDate: range.startDate,
        endDate: range.endDate,
      });
      const includeAttention = this.shouldIncludeBeauticianAttention(dto.message);
      const lines =
        summary.nextTasks.length > 0
          ? summary.nextTasks
              .slice(0, 10)
              .map((item, index) => {
                const attention =
                  includeAttention
                    ? `；注意事项：${
                        item.attentionItems?.length
                          ? item.attentionItems.join('；')
                          : '当前客户档案未记录过敏、皮肤状态或情绪备注'
                      }`
                    : '';
                return `${index + 1}. ${item.appointmentTime} ${item.customerName} - ${item.projectName}${attention}`;
              })
              .join('\n')
          : '今天没有已排服务。';
      return this.completedSkillAnswer({
        runId,
        stepKey: 'skill_beautician_service_summary',
        message: dto.message,
        roleHint: dto.roleHint,
        answer: `今日服务安排：共 ${summary.serviceCount} 个客人。\n${lines}`,
        citations: [{ sourceType: 'skill', sourceId: 'beautician_service_summary', label: '美容师今日服务安排' }],
        cognition,
      });
    }

    return undefined;
  }

  private shouldUseInventorySkill(message: string) {
    if (!/(库存|产品|货|耗材|sku|安全库存|缺货|断货|积压|周转|补货|采购|临期|过期|损耗|消耗)/i.test(message)) {
      return false;
    }
    if (/(积压|系列产品的库存|系列.*库存|精华液.*库存|防晒产品.*多少|洗面奶.*还剩)/.test(message)) {
      return false;
    }
    if (/(供应商|资质|报价|账期|到货|质检|物流|联系方式|交易记录|采购单|涨价)/.test(message)) {
      return /(补货|采购建议|采购.*清单|需要.*采购|马上采购|补什么货|要买什么)/.test(message);
    }
    return /(低于安全库存|安全库存|快没|快缺|缺货|断货|周转率最低|补货|补什么货|采购建议|采购.*清单|需要.*采购|要买什么|马上采购|哪些.*(产品|东西|货|耗材)|产品.*(库存|快过期|临期)|耗材.*消耗|临期|过期)/.test(
      message,
    );
  }

  private shouldUseInventoryDisposalAdvice(message: string) {
    return /(临期|过期|快过期).*(怎么|如何|处理|规定|办法|方案|消化|优惠|减少|合适)/.test(message);
  }

  private shouldUseInventoryExpiryList(message: string) {
    return /(快过期|临期|过期).*(产品|东西|货品|库存|数量|多少|损耗|损失金额)|(\d+天内.*过期)/.test(message);
  }

  private shouldUseReceptionReservationSchedule(message: string) {
    return /(所有.*预约.*列|预约.*清单|预约.*情况|下一个预约|下午.*预约|明天.*预约|预约.*是谁|预约.*几点|最后一个预约|今天.*预约.*列)/.test(
      message,
    );
  }

  private shouldUseReceptionReservationAction(message: string) {
    if (/(找一下|查一下|看看)/.test(message)) return false;
    return /(改约|改期|帮我约|预约到|安排.*预约|取消.*预约|提醒.*预约)/.test(message);
  }

  private shouldUseMarketingCampaignPlan(message: string) {
    if (/(响应.*客户|效果|花了多少钱|带来.*收入|核销|转化率|roi|投产|吸引力最大|渠道|客户质量|滥用|多少|比例)/i.test(message)) {
      return false;
    }
    return /(策划|促销|推广|活动主题|活动方案|做什么活动|专属活动|活动.*(怎么|设计|方案|主题|做什么|准备|拉动|有意义)|老带新|母亲节|国庆|夏天|沉睡客户|储值送赠品|新客.*礼包|vip.*活动|情人节|线上引流|赠品.*打折|不用打折|吸引客户)/i.test(
      message,
    );
  }

  private shouldUseFinanceSkill(message: string) {
    if (/(收了多少钱|营业额是多少|收入是多少|流水是多少|毛利率是多少|毛利是多少)/.test(message)) {
      return false;
    }
    if (/((如果|假设).*打.*折|打[一二三四五六七八九0-9].*折.*毛利|毛利还剩)/.test(message)) {
      return false;
    }
    if (/(长期未消耗|储值余额|预付款|应收账款|分期付款|挂账)/.test(message)) {
      return false;
    }
    return /(退款|折扣|优惠|核对|漏收|多收|异常|不正常|风险|合规|对不上|大额|毛利.*(下降|异常|原因|问题|低)|利润.*(下降|异常|原因|问题)|成本.*(上涨|异常|原因|问题))/.test(
      message,
    );
  }

  private shouldUseBeauticianSkill(message: string) {
    if (/(产品和耗材|培训|服务几个小时)/.test(message)) return false;
    if (/(记录|记一下|记了什么|查一下上次|建.*任务|提醒我|最新.*护理项目|最新.*项目)/.test(message)) return false;
    return /((今天|下一个|第一个|最后一个|下午|上午).*(客人|几点|项目|注意|安排|取消|提前|首次))|(我这周的排班)|(我今天.*空档)|(护理|跟进|建议|话术|怎么)/.test(
      message,
    );
  }

  private shouldUseBeauticianCareAdvice(message: string) {
    if (/(下一个|第一个|最后一个).*(客人|客户).*(过敏|注意|情绪|状态|关心)/.test(message)) return false;
    return /(跟进|护理建议|怎么|皮肤|保养|方案|调整|周期|护理后|下次|适合|重点|敏感|暗沉|色斑|过敏|压力大|状态差|怎么回答)/.test(
      message,
    );
  }

  private shouldIncludeBeauticianAttention(message: string) {
    return /(过敏|注意事项|注意|情绪|状态|特别关心|关心)/.test(message);
  }

  private async completedSkillAnswer(input: {
    runId: number;
    stepKey: string;
    message: string;
    roleHint?: string;
    answer: string;
    citations: Array<{ sourceType: string; sourceId: string; label?: string; definition?: string }>;
    suggestedActions?: unknown[];
    cognition: BrainCognitionResult;
  }): Promise<BrainChatAnswer> {
    await this.traceService.recordStep({
      runId: input.runId,
      stepKey: input.stepKey,
      layer: 'skill',
      input: { message: input.message, roleHint: input.roleHint } as Prisma.InputJsonValue,
      output: {
        answer: input.answer,
        citations: input.citations,
        suggestedActions: input.suggestedActions ?? [],
      } as Prisma.InputJsonValue,
      status: 'completed',
    });

    return {
      status: 'completed',
      answer: input.answer,
      citations: input.citations,
      suggestedActions: input.suggestedActions ?? [],
      cognition: input.cognition,
    };
  }

  private resolveSkillDateRange(message: string) {
    const parsed = this.timeRangeParser.parse(message);
    if (parsed.range) return parsed.range;
    const now = new Date();
    return {
      label: '今天',
      startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0),
      endDate: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999),
      granularity: 'day' as const,
    };
  }

  private extractTargetTimeLabel(message: string) {
    if (message.includes('明天下午')) return '明天下午';
    if (message.includes('明天上午')) return '明天上午';
    if (message.includes('明天')) return '明天';
    if (message.includes('下午')) return '今天下午';
    if (message.includes('上午')) return '今天上午';
    return undefined;
  }

  private formatMoney(value: number) {
    const normalizedValue = Number.isFinite(value) ? value : 0;
    return `${normalizedValue.toFixed(2)} 元`;
  }

  private formatPercent(value: number) {
    const normalizedValue = Number.isFinite(value) ? value : 0;
    return `${(normalizedValue * 100).toFixed(1)}%`;
  }

  private async failedSemanticAnswer(
    error: unknown,
    runId: number,
    metric: string,
    cognition: BrainCognitionResult,
  ): Promise<BrainChatAnswer> {
    const answer = this.toSafeQueryFailureAnswer(error);
    await this.traceService.recordStep({
      runId,
      stepKey: 'semantic_query',
      layer: 'semantic',
      input: { metric } as Prisma.InputJsonValue,
      status: 'failed',
      error: { message: this.errorMessage(error) } as Prisma.InputJsonValue,
    });

    return { status: 'failed', answer, citations: [], suggestedActions: [], cognition };
  }

  private rangeToDateFilter(range: BrainDateRange, field: BrainDateFilter['field'] = 'date'): BrainDateFilter {
    return {
      field,
      op: 'between',
      value: [range.startDate.toISOString(), range.endDate.toISOString()],
    };
  }

  private assertBaseAccess(context: BrainRequestContext) {
    const storeScope = this.permissionService.assertStoreScope(context.storeId, context.visibleStoreIds);
    if (!storeScope.allowed) {
      throw new ForbiddenException(storeScope.reason);
    }

    this.assertPermission(context, ['core:brain:use']);
  }

  private assertPermission(context: BrainRequestContext, requiredPermissions: string[]) {
    const result = this.permissionService.canUseSkill({
      userPermissions: context.permissions,
      userDeniedPermissions: context.deniedPermissions,
      requiredPermissions,
    });

    if (!result.allowed) {
      throw new ForbiddenException(result.reason);
    }
  }

  private assertRoleSkillAccess(context: BrainRequestContext, skillKey: BrainRoleSkillKey) {
    this.assertPermission(context, this.roleSkillPolicy.requiredPermissions(skillKey));
  }

  private async ensureConversation(context: BrainRequestContext, conversationId: number) {
    if (this.hasConversationAccess(context, conversationId)) {
      return { id: conversationId, storeId: context.storeId, userId: context.userId };
    }
    const conversation = await this.prisma.brainConversation.findFirst({
      where: {
        id: conversationId,
        storeId: context.storeId,
        userId: context.userId,
        deletedAt: null,
      },
    });

    if (!conversation) {
      throw new NotFoundException('会话不存在或不属于当前门店');
    }

    this.rememberConversationAccess(context, conversationId);
    return conversation;
  }

  private conversationAccessKey(context: BrainRequestContext, conversationId: number) {
    return `${context.storeId}:${context.userId}:${conversationId}`;
  }

  private hasConversationAccess(context: BrainRequestContext, conversationId: number) {
    const key = this.conversationAccessKey(context, conversationId);
    const expiresAt = this.conversationAccessCache.get(key) ?? 0;
    if (expiresAt > Date.now()) return true;
    this.conversationAccessCache.delete(key);
    return false;
  }

  private rememberConversationAccess(context: BrainRequestContext, conversationId: number) {
    if (this.conversationAccessCache.size > 1000) {
      const now = Date.now();
      for (const [key, expiresAt] of this.conversationAccessCache) {
        if (expiresAt <= now) this.conversationAccessCache.delete(key);
      }
    }
    this.conversationAccessCache.set(this.conversationAccessKey(context, conversationId), Date.now() + 5 * 60_000);
  }

  private isTransactionStartTimeout(error: unknown) {
    return this.errorMessage(error).includes('Unable to start a transaction in the given time');
  }

  private serializeFilters(filters: { storeId: number; startDate?: Date; endDate?: Date }) {
    return {
      storeId: filters.storeId,
      startDate: filters.startDate?.toISOString(),
      endDate: filters.endDate?.toISOString(),
    };
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private readMetricValue(row: Record<string, unknown>, field: string) {
    const raw = row[field];
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'bigint') return Number(raw);
    if (typeof raw === 'string') return Number(raw);
    if (raw && typeof raw === 'object' && 'toString' in raw) {
      return Number(raw.toString());
    }
    return 0;
  }

  private formatMetricValue(metric: string, value: number) {
    const normalizedValue = Number.isFinite(value) ? value : 0;
    if (metric.endsWith('_rate') || metric === 'repurchase_rate') {
      return `${(normalizedValue * 100).toFixed(1)}%`;
    }
    if (metric.includes('revenue') || metric.includes('margin') || metric.includes('liability') || metric.includes('value')) {
      return `${normalizedValue.toFixed(2)} 元`;
    }
    return String(Math.round(normalizedValue));
  }

  private toSafeQueryFailureAnswer(error: unknown) {
    const message = this.errorMessage(error);
    if (message === 'unsupported_metric_formula:card_liability_period') {
      return '次卡/储值负债是当前时点口径，暂不支持按本月/上月过滤；Ami Brain 不会用开卡时间代替负债期间口径。';
    }
    if (message.startsWith('unsupported_metric_formula:')) {
      const metric = message.replace('unsupported_metric_formula:', '');
      return `指标 ${metric} 尚未完成门店级真实口径接入，Ami Brain 不会用 0 或估算值代替。`;
    }
    if (message.startsWith('unsupported_metric:')) {
      const metric = message.replace('unsupported_metric:', '');
      return `指标 ${metric} 尚未注册，Ami Brain 不会编造回答。`;
    }
    if (message.startsWith('missing_permission:')) {
      const permission = message.replace('missing_permission:', '');
      return `当前账号缺少 ${permission} 权限，无法查询该指标。`;
    }
    if (error instanceof ForbiddenException) {
      return String(error.message);
    }
    return '本次查询未完成，Ami Brain 已停止返回不可信结果。';
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
