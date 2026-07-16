import { ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
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
import { BrainUntrustedActionClaimGuardService } from './security/brain-untrusted-action-claim-guard.service.js';
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
import { BrainCognitionShadowService } from './cognition/brain-cognition-shadow.service.js';
import type { BrainDomainRole } from './domain/brain-domain-adapter.types.js';
import { BrainRuntimeConfigService } from './config/brain-runtime-config.service.js';
import { BrainSemanticIntentCompilerService } from './cognition/brain-semantic-intent-compiler.service.js';
import { BrainSemanticIntentValidatorService } from './cognition/brain-semantic-intent-validator.service.js';
import { BrainOntologyRuntimeService } from './cognition/brain-ontology-runtime.service.js';
import type { BrainDefinitionRef, BrainSemanticIntent } from './cognition/brain-semantic-intent.types.js';
import type { BusinessDefinitionBase, ProductionReadyBusinessDefinitionSnapshot } from './cognition/business-definition-snapshot.types.js';
import { BrainCapabilityCatalogService } from './capability/brain-capability-catalog.service.js';
import type { BrainCapabilityCandidate, BrainCapabilityCard } from './capability/brain-capability.types.js';
import {
  BrainCapabilityRetrieverService,
  type BrainCapabilityRankedCandidate,
} from './capability/brain-capability-retriever.service.js';
import { BrainSingleStepPlannerService } from './planning/brain-single-step-planner.service.js';
import { BrainExecutionPlanValidatorService } from './planning/brain-execution-plan-validator.service.js';
import { BrainCapabilityExecutorRegistryService } from './capability/brain-capability-executor.registry.js';
import { BrainExecutionBudgetService } from './execution/brain-execution-budget.service.js';
import { BrainBoundedExecutorService } from './execution/brain-bounded-executor.service.js';
import { BrainGroundedAnswerComposerService } from './response/brain-grounded-answer-composer.service.js';
import {
  BrainRoleContextBuilderService,
  type BrainRoleRuntimeContext,
} from './role/brain-role-context-builder.service.js';
import type { BrainModelConversationCorrection } from './context/brain-conversation-context.service.js';
import { BrainReleaseService } from './governance/brain-release.service.js';
import { BusinessSemanticEvidenceService } from '../semantic-data/business-semantic-evidence.service.js';

type BrainChatStatus = 'completed' | 'failed';
type BrainModelStage = 'prepare' | 'compile' | 'validate' | 'retrieve' | 'plan' | 'execute';

interface BrainModelMetadata {
  cognitionMode: 'model';
  modelStage: BrainModelStage;
  failureCode: string | null;
  intentSchemaVersion: BrainSemanticIntent['schemaVersion'] | null;
  capabilityKey: string | null;
  capabilityVersion: number | null;
  planId: string | null;
  model: string | null;
  provider: string | null;
}

interface BrainChatAnswer {
  status: BrainChatStatus;
  answer: string;
  citations: Array<{ sourceType: string; sourceId: string; label?: string; definition?: string }>;
  suggestedActions: unknown[];
  blocks?: BrainDomainAnswer['blocks'];
  cognition?: BrainCognitionResult;
  routePlan?: BrainRoleIntentPlan;
  adapterKey?: string;
  grounding?: string;
  adapterMetadata?: Record<string, unknown>;
  modelMetadata?: BrainModelMetadata;
  modelContextIntent?: BrainSemanticIntent;
  modelContextCorrections?: BrainModelConversationCorrection[];
}

interface BrainAnswerReadyEvent {
  conversationId: number;
  runId: number;
  status: BrainChatStatus;
  answer: string;
  citations: BrainChatAnswer['citations'];
  suggestedActions: unknown[];
  blocks?: BrainDomainAnswer['blocks'];
  [key: string]: unknown;
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
    private readonly shadowCognition?: BrainCognitionShadowService,
    private readonly runtimeConfig?: BrainRuntimeConfigService,
    private readonly semanticIntentCompiler?: BrainSemanticIntentCompilerService,
    private readonly semanticIntentValidator?: BrainSemanticIntentValidatorService,
    private readonly ontologyRuntime?: BrainOntologyRuntimeService,
    private readonly capabilityCatalog?: BrainCapabilityCatalogService,
    private readonly capabilityRetriever?: BrainCapabilityRetrieverService,
    private readonly singleStepPlanner?: BrainSingleStepPlannerService,
    private readonly executionPlanValidator?: BrainExecutionPlanValidatorService,
    private readonly executionBudget?: BrainExecutionBudgetService,
    private readonly capabilityExecutorRegistry?: BrainCapabilityExecutorRegistryService,
    private readonly boundedExecutor?: BrainBoundedExecutorService,
    private readonly groundedAnswerComposer?: BrainGroundedAnswerComposerService,
    private readonly roleContextBuilder?: BrainRoleContextBuilderService,
    private readonly releaseService?: BrainReleaseService,
    @Optional() private readonly semanticEvidence?: BusinessSemanticEvidenceService,
    @Optional() private readonly untrustedActionClaimGuard?: BrainUntrustedActionClaimGuardService,
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
    const actionClaimInspection = this.untrustedActionClaimGuard?.inspectText(dto.message);
    if (actionClaimInspection && !actionClaimInspection.safe) {
      throw new ForbiddenException('聊天文本不能充当操作确认凭证，请先查看动作预览，再通过预览卡片确认。');
    }

    await this.ensureConversation(context, conversationId);

    const startedAt = Date.now();
    const createEnvelope = () =>
      this.prisma.$transaction([
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

    let chatAnswer: BrainChatAnswer;
    try {
      chatAnswer = await this.buildAnswer(context, conversationId, dto, run.id);
    } catch (error) {
      const message = this.errorMessage(error);
      try {
        await this.prisma.brainRun.update({
          where: { id: run.id },
          data: {
            status: 'failed',
            latencyMs: Date.now() - startedAt,
            error: { message } as Prisma.InputJsonValue,
          },
        });
      } catch {
        // Preserve the original runtime failure for the caller.
      }
      throw error;
    }
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
    const responseEnvelope = {
      conversationId,
      runId: run.id,
      status: chatAnswer.status,
      answer: chatAnswer.answer,
      citations: chatAnswer.citations,
      suggestedActions: chatAnswer.suggestedActions,
      blocks: chatAnswer.blocks ?? [],
      ...(chatAnswer.cognition ? { cognition: chatAnswer.cognition } : {}),
      ...(chatAnswer.routePlan ? { routePlan: chatAnswer.routePlan } : {}),
      ...(chatAnswer.adapterKey ? { adapterKey: chatAnswer.adapterKey } : {}),
      ...(chatAnswer.grounding ? { grounding: chatAnswer.grounding } : {}),
      ...(chatAnswer.adapterMetadata ? { adapterMetadata: chatAnswer.adapterMetadata } : {}),
      ...(chatAnswer.modelContextIntent ? { semanticIntent: chatAnswer.modelContextIntent } : {}),
      ...chatAnswer.modelMetadata,
      contextStoreId: context.storeId,
    };
    const output = this.toJsonValue(responseEnvelope);

    await this.prisma.brainRun.update({
      where: { id: run.id },
      data: {
        status: chatAnswer.status,
        output,
        latencyMs: Date.now() - startedAt,
        ...(chatAnswer.status === 'failed' ? { error: { message: chatAnswer.answer } as Prisma.InputJsonValue } : {}),
      },
    });
    await this.prisma.brainMessage.create({
      data: {
        conversationId,
        role: 'assistant',
        content: chatAnswer.answer,
        metadata: output,
      },
    });
    await this.prisma.brainConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
    if (chatAnswer.status === 'completed' && chatAnswer.modelContextIntent && this.semanticEvidence) {
      try {
        const captured = await this.semanticEvidence.captureModelSuccess({
          runId: run.id,
          storeId: context.storeId,
          userId: context.userId,
          question: dto.message,
          intent: chatAnswer.modelContextIntent,
          corrections: this.semanticEvidenceCorrections(
            chatAnswer.modelContextIntent,
            chatAnswer.modelContextCorrections ?? [],
          ),
        });
        await this.recordSemanticEvidenceTrace({
          runId: run.id,
          status: 'completed',
          output: { capturedCount: captured.capturedCount },
        });
      } catch (error) {
        await this.recordSemanticEvidenceTrace({
          runId: run.id,
          status: 'failed',
          error: { message: this.errorMessage(error) },
        });
      }
    }
    if (this.conversationContext) {
      if (chatAnswer.modelContextIntent) {
        try {
          await this.conversationContext.updateAfterModelRun({
            conversationId,
            runId: run.id,
            userId: context.userId,
            storeId: context.storeId,
            intent: chatAnswer.modelContextIntent,
            ...(chatAnswer.modelMetadata?.capabilityKey && chatAnswer.modelMetadata.capabilityVersion
              ? {
                  capability: {
                    key: chatAnswer.modelMetadata.capabilityKey,
                    version: chatAnswer.modelMetadata.capabilityVersion,
                  },
                }
              : {}),
            corrections: chatAnswer.modelContextCorrections ?? [],
          });
        } catch (error) {
          await this.traceService.recordStep({
            runId: run.id,
            stepKey: 'model_conversation_context_write',
            layer: 'memory',
            status: 'failed',
            error: { message: this.errorMessage(error) } as Prisma.InputJsonValue,
          });
        }
      } else if (!chatAnswer.modelMetadata) {
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
    }
    options?.onAnswerReady?.(responseEnvelope);
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

    return responseEnvelope;
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
    const releaseRuntime = await this.resolveReleaseRuntime(context);
    const releaseMode = releaseRuntime.mode;
    if (this.isModelSingleToolPathEnabled(releaseMode)) {
      const deadlineAt = Date.now() + this.runtimeConfig!.runtime.totalTimeoutMs;
      let prepared: Awaited<ReturnType<BrainConversationContextService['prepareModelTurn']>> | undefined;
      if (this.conversationContext) {
        try {
          prepared = await this.conversationContext.prepareModelTurn({
            conversationId,
            dto: inputDto,
            snapshot: this.ontologyRuntime?.getSnapshot() ?? null,
          });
          if (prepared.rejectionCode) {
            await this.traceService.recordStep({
              runId,
              stepKey: 'model_conversation_context_rejected',
              layer: 'memory',
              status: 'completed',
              output: { code: prepared.rejectionCode } as Prisma.InputJsonValue,
            });
          }
        } catch (error) {
          await this.traceService.recordStep({
            runId,
            stepKey: 'model_conversation_context_read',
            layer: 'memory',
            status: 'failed',
            error: { message: this.errorMessage(error) } as Prisma.InputJsonValue,
          });
        }
      }
      const answer = await this.buildModelSingleToolAnswer({
        context,
        dto: inputDto,
        runId,
        deadlineAt,
        conversationSlots: {
          ...(prepared?.previous ?? {}),
          ...(prepared?.directives ? { turnDirectives: prepared.directives } : {}),
        },
        capabilityCandidates: releaseRuntime.capabilityCandidates,
      });
      return {
        ...answer,
        ...(prepared?.directives?.corrections.length
          ? { modelContextCorrections: prepared.directives.corrections }
          : {}),
      };
    }

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

    const routePlan = this.roleIntentRouter?.route({
      message: dto.message,
      roleHint: dto.roleHint,
      runtimeIntent,
    });
    await this.traceService.recordStep({
      runId,
      stepKey: 'cognition_rules',
      layer: 'cognition',
      input: { message: dto.message } as Prisma.InputJsonValue,
      output: this.toJsonValue({
        raw: cognition,
        domain: routePlan ? [routePlan.domain] : [],
        intent: routePlan?.intent ?? cognition.intent.key,
        metric: [...new Set(cognition.metrics)].sort(),
        dimension: [...new Set(cognition.dimensions)].sort(),
        entity: [...new Set(cognition.entities.map((entity) => entity.entityKey))].sort(),
        time: this.readShadowRuleTime(prepared?.previous),
        answerShape: routePlan?.answerShape ?? null,
        confidence: routePlan?.confidence ?? cognition.intent.confidence,
      }),
      status: 'completed',
    });
    try {
      this.shadowCognition?.observe({
        runId,
        requestId: context.requestId,
        userId: context.userId,
        storeId: context.storeId,
        question: inputDto.message,
        timezone: this.normalizeShadowTimezone(inputDto.timezone ?? context.timezone),
        role: routePlan?.role ?? this.normalizeShadowRole(dto.roleHint),
        conversationSlots: prepared?.previous ?? {},
        rules: { cognition, routePlan },
        force: releaseMode === 'shadow',
      });
    } catch {
      // Shadow cognition is observability-only and cannot affect the rules response.
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

  private isModelSingleToolPathEnabled(releaseMode?: 'rules' | 'shadow' | 'model'): boolean {
    if (releaseMode) return releaseMode === 'model';
    const runtime = this.runtimeConfig?.runtime;
    return Boolean(
      runtime?.cognitionMode === 'model' &&
        runtime.plannerMode === 'model' &&
        runtime.singleToolFastPath,
    );
  }

  private async resolveReleaseRuntime(
    context: BrainRequestContext,
  ): Promise<{
    mode?: 'rules' | 'shadow' | 'model';
    capabilityCandidates?: readonly BrainCapabilityCandidate[];
  }> {
    if (context.governanceEvalReleaseSnapshot) {
      return {
        mode: context.governanceEvalReleaseSnapshot.mode,
        capabilityCandidates: context.governanceEvalReleaseSnapshot.capabilityCandidates,
      };
    }
    if (!this.releaseService) return {};
    try {
      const resolved = await this.releaseService.resolveRuntimeMode({
        storeId: context.storeId,
        userId: context.userId,
        roleKey: this.modelRoleFromContext(context),
        evaluationReleaseId: context.governanceEvalReleaseId,
      });
      const mode = resolved.mode === 'rules' || resolved.mode === 'shadow' || resolved.mode === 'model'
        ? resolved.mode
        : 'rules';
      return {
        mode,
        capabilityCandidates: resolved.capabilityCandidates,
      };
    } catch (error) {
      if (context.governanceEvalReleaseId !== undefined) throw error;
      return { mode: 'rules' };
    }
  }

  private async buildModelSingleToolAnswer(input: {
    context: BrainRequestContext;
    dto: SendBrainMessageDto;
    runId: number;
    deadlineAt: number;
    conversationSlots: object;
    capabilityCandidates?: readonly BrainCapabilityCandidate[];
  }): Promise<BrainChatAnswer> {
    let modelMetadata = this.modelMetadata('prepare');
    if (
      !this.semanticIntentCompiler ||
      !this.semanticIntentValidator ||
      !this.ontologyRuntime ||
      !this.capabilityCatalog ||
      !this.capabilityRetriever ||
      !this.singleStepPlanner ||
      !this.executionPlanValidator ||
      !this.executionBudget ||
      !this.capabilityExecutorRegistry
    ) {
      await this.recordModelFailure({
        runId: input.runId,
        stepKey: 'model_intent_compile',
        layer: 'cognition',
        stage: 'prepare',
        code: 'MODEL_PIPELINE_UNAVAILABLE',
      });
      return this.modelFailure('MODEL_PIPELINE_UNAVAILABLE', modelMetadata);
    }
    const snapshot = this.ontologyRuntime!.getSnapshot();
    if (!snapshot) {
      await this.recordModelFailure({
        runId: input.runId,
        stepKey: 'model_intent_compile',
        layer: 'cognition',
        stage: 'prepare',
        code: 'MODEL_SNAPSHOT_UNAVAILABLE',
      });
      return this.modelFailure('MODEL_SNAPSHOT_UNAVAILABLE', modelMetadata);
    }

    let roleContext: BrainRoleRuntimeContext | undefined;
    if (this.roleContextBuilder) {
      try {
        roleContext = await this.roleContextBuilder.build({ context: input.context, roleHint: input.dto.roleHint });
      } catch (error) {
        await this.recordModelFailure({
          runId: input.runId,
          stepKey: 'model_role_context',
          layer: 'planning',
          stage: 'prepare',
          code: 'MODEL_ROLE_PROFILE_UNAVAILABLE',
          error,
        });
        return this.modelFailure('MODEL_ROLE_PROFILE_UNAVAILABLE', modelMetadata);
      }
    }

    let cards: readonly BrainCapabilityCard[];
    try {
      cards = input.capabilityCandidates === undefined
        ? await this.capabilityCatalog!.listEnabledCapabilities()
        : await this.capabilityCatalog!.listEnabledCapabilities(input.capabilityCandidates);
      if (roleContext) cards = this.roleContextBuilder!.filterCapabilities(roleContext, input.context, cards);
    } catch (error) {
      await this.recordModelFailure({
        runId: input.runId,
        stepKey: 'capability_retrieval',
        layer: 'planning',
        stage: 'retrieve',
        code: 'MODEL_CATALOG_UNAVAILABLE',
        diagnosticCode: this.modelDiagnosticCode(error),
        error,
      });
      return this.modelFailure('MODEL_CATALOG_UNAVAILABLE', this.modelMetadata('retrieve'));
    }
    if (!cards.length) {
      return this.modelFailure('MODEL_ROLE_CAPABILITY_NONE', this.modelMetadata('retrieve'));
    }

    const compilerInput = {
      question: input.dto.message,
      deadlineAt: input.deadlineAt,
      audit: { userId: input.context.userId, storeId: input.context.storeId },
      timezone: this.normalizeShadowTimezone(input.dto.timezone ?? input.context.timezone),
      role: roleContext?.role ?? this.modelRoleFromContext(input.context),
      roleContext,
      conversationSlots: this.withModelCatalogMetadata(this.modelConversationSlots(input.conversationSlots), snapshot, cards),
      ontologySnapshot: snapshot,
      ontologyCandidates: this.modelOntologyCandidates(snapshot),
      metricRefs: snapshot.metrics.map((metric) => this.modelDefinitionRef('metric', metric)),
      dimensionRefs: snapshot.dimensions.map((dimension) => this.modelDefinitionRef('dimension', dimension)),
      capabilitySummaries: cards.map((card) => ({
        key: card.key,
        name: card.name,
        description: card.description,
        domains: [...card.domains],
        intents: [...card.intents],
        examples: Array.isArray(card.examples) ? [...card.examples] : [],
        readOnly: card.readOnly,
        definitionRefs: (card.definitionRefs ?? []).flatMap((ref) => {
          const definitionType = ref.definitionKey.split('.')[0];
          if (!['entity', 'relation', 'metric', 'dimension'].includes(definitionType)) return [];
          return [{
            definitionType: definitionType as 'entity' | 'relation' | 'metric' | 'dimension',
            definitionKey: ref.definitionKey,
            definitionVersion: ref.version,
            definitionFingerprint: ref.definitionFingerprint,
            sourceFingerprint: ref.sourceFingerprint,
          }];
        }),
      })),
    };
    let compilation: Awaited<ReturnType<BrainSemanticIntentCompilerService['compile']>>;
    try {
      compilation = await this.semanticIntentCompiler!.compile(compilerInput);
    } catch (error) {
      await this.recordModelFailure({
        runId: input.runId,
        stepKey: 'model_intent_compile',
        layer: 'cognition',
        stage: 'compile',
        code: 'MODEL_INTENT_UNAVAILABLE',
        error,
      });
      return this.modelFailure('MODEL_INTENT_UNAVAILABLE', this.modelMetadata('compile'));
    }
    if (compilation.status !== 'completed') {
      await this.recordModelFailure({
        runId: input.runId,
        stepKey: 'model_intent_compile',
        layer: 'cognition',
        stage: 'compile',
        code: 'MODEL_INTENT_UNAVAILABLE',
        diagnosticCode: compilation.errorCode,
      });
      return this.modelFailure('MODEL_INTENT_UNAVAILABLE', this.modelMetadata('compile'));
    }
    modelMetadata = this.modelMetadata('compile', {
      provider: compilation.provider,
      model: compilation.model,
      intentSchemaVersion: compilation.intent.schemaVersion,
    });
    await this.recordModelTrace({
      runId: input.runId,
      stepKey: 'model_intent_compile',
      layer: 'cognition',
      input: this.toJsonValue({ snapshotFingerprint: snapshot.fingerprint, catalogCount: cards.length }),
      output: this.toJsonValue({ status: compilation.status, provider: compilation.provider, model: compilation.model }),
      status: 'completed',
    });

    let enrichedIntent = this.normalizeGovernedCapabilityContractIntent({
      intent: this.normalizeGovernedCapabilityExampleIntent({
        intent: this.enrichModelEntityRefs(compilation.intent),
        question: input.dto.message,
        cards,
        snapshot,
      }),
      question: input.dto.message,
      cards,
    });
    let validation: ReturnType<BrainSemanticIntentValidatorService['validate']>;
    try {
      validation = this.semanticIntentValidator!.validate(enrichedIntent);
    } catch (error) {
      await this.recordModelFailure({
        runId: input.runId,
        stepKey: 'model_intent_validation',
        layer: 'cognition',
        stage: 'validate',
        code: 'MODEL_INTENT_INVALID',
        error,
      });
      return this.modelFailure('MODEL_INTENT_INVALID', this.modelMetadata('validate', modelMetadata));
    }
    if (validation.status !== 'valid' && this.shouldRepairModelIntent(validation)) {
      await this.recordModelTrace({
        runId: input.runId,
        stepKey: 'model_intent_validation_retry',
        layer: 'cognition',
        input: this.toJsonValue({
          issueCodes: validation.issues.map((issue) => issue.code),
          issueSlots: validation.issues.map((issue) => issue.slot).filter(Boolean),
        }),
        output: { status: 'retrying', stage: 'validate', code: 'MODEL_INTENT_REPAIR' },
        status: 'completed',
      });
      const repairCompilation = await this.semanticIntentCompiler!.compile({
        ...compilerInput,
        repairFeedback: {
          previousIntent: enrichedIntent,
          issues: validation.issues.map((issue) => ({
            code: issue.code,
            ...(issue.slot ? { slot: issue.slot } : {}),
            message: issue.message,
          })),
        },
      });
      if (repairCompilation.status === 'completed') {
        const repairedIntent = this.normalizeGovernedCapabilityContractIntent({
          intent: this.normalizeGovernedCapabilityExampleIntent({
            intent: this.enrichModelEntityRefs(repairCompilation.intent),
            question: input.dto.message,
            cards,
            snapshot,
          }),
          question: input.dto.message,
          cards,
        });
        const repairedValidation = this.semanticIntentValidator!.validate(repairedIntent);
        compilation = repairCompilation;
        enrichedIntent = repairedIntent;
        validation = repairedValidation;
        modelMetadata = this.modelMetadata('compile', {
          provider: repairCompilation.provider,
          model: repairCompilation.model,
          intentSchemaVersion: repairCompilation.intent.schemaVersion,
        });
        await this.recordModelTrace({
          runId: input.runId,
          stepKey: 'model_intent_validation_retry_result',
          layer: 'cognition',
          output: this.toJsonValue({
            status: repairedValidation.status,
            stage: 'validate',
            code: repairedValidation.status === 'valid' ? 'MODEL_INTENT_REPAIRED' : 'MODEL_INTENT_REPAIR_INCOMPLETE',
            issueCodes: repairedValidation.status === 'valid'
              ? []
              : repairedValidation.issues.map((issue) => issue.code),
          }),
          status: repairedValidation.status === 'valid' ? 'completed' : 'failed',
        });
      }
    }
    if (validation.status === 'clarification_required') {
      const clarificationMetadata = this.modelMetadata('validate', modelMetadata);
      await this.recordModelTrace({
        runId: input.runId,
        stepKey: 'model_intent_validation',
        layer: 'cognition',
        output: { status: 'clarification_required', stage: 'validate', code: 'MODEL_INTENT_CLARIFICATION_REQUIRED' },
        status: 'completed',
      });
      return {
        status: 'completed',
        answer: this.safeModelFailureAnswer('MODEL_INTENT_CLARIFICATION_REQUIRED'),
        citations: [],
        suggestedActions: validation.clarification.missingSlots,
        modelContextIntent: validation.intent,
        modelMetadata: { ...clarificationMetadata, failureCode: 'MODEL_INTENT_CLARIFICATION_REQUIRED' },
      };
    }
    if (validation.status !== 'valid') {
      await this.recordModelFailure({
        runId: input.runId,
        stepKey: 'model_intent_validation',
        layer: 'cognition',
        stage: 'validate',
        code: 'MODEL_INTENT_INVALID',
        diagnosticCode: validation.issues[0]?.code,
      });
      return this.modelFailure('MODEL_INTENT_INVALID', this.modelMetadata('validate', modelMetadata));
    }
    modelMetadata = this.modelMetadata('validate', modelMetadata);

    const unresolvedRequirements = findUnresolvedBusinessDefinitionRequirements(
      validation.intent,
      input.dto.message,
    );
    if (unresolvedRequirements.length > 0) {
      await this.recordModelFailure({
        runId: input.runId,
        stepKey: 'model_intent_validation',
        layer: 'cognition',
        stage: 'validate',
        code: 'CAPABILITY_CONTRACT_MISMATCH',
        diagnosticCode: `MISSING_${unresolvedRequirements[0]!.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()}`,
      });
      return this.modelFailure(
        'CAPABILITY_CONTRACT_MISMATCH',
        this.modelMetadata('validate', modelMetadata),
        validation.intent,
      );
    }

    const governedExampleCard = this.findGovernedCapabilityExampleCard(input.dto.message, cards);
    if (validation.intent.intent === 'workflow' && !governedExampleCard) {
      return this.buildModelSupervisorAnswer({
        context: input.context,
        dto: input.dto,
        runId: input.runId,
        intent: validation.intent,
        cards,
        modelMetadata,
        roleContext,
        deadlineAt: input.deadlineAt,
      });
    }

    const retrieval: ReturnType<BrainCapabilityRetrieverService['retrieve']> = governedExampleCard
      ? {
          status: 'selected',
          selected: governedExampleCard,
          topK: [{ card: governedExampleCard, score: 1, matchedFields: ['examples'] }],
          confidence: 1,
          margin: 1,
          reason: 'governed_example_selected',
        }
      : this.capabilityRetriever!.retrieve({
          intent: validation.intent,
          question: input.dto.message,
          context: input.context,
          cards,
        });
    await this.recordModelTrace({
      runId: input.runId,
      stepKey: 'capability_retrieval',
      layer: 'planning',
      output: this.toJsonValue({
        status: retrieval.status,
        stage: 'retrieve',
        code: retrieval.status === 'selected' ? 'CAPABILITY_SELECTED' : `CAPABILITY_RETRIEVAL_${retrieval.status.toUpperCase()}`,
        confidence: retrieval.confidence,
        margin: retrieval.margin,
        capabilityKey: retrieval.selected?.key ?? null,
        capabilityVersion: retrieval.selected?.version ?? null,
      }),
      status: retrieval.status === 'selected' ? 'completed' : 'failed',
    });
    if (retrieval.status === 'clarify' && retrieval.topK.length > 0) {
      return this.buildModelSupervisorAnswer({
        context: input.context,
        dto: input.dto,
        runId: input.runId,
        intent: validation.intent,
        cards,
        modelMetadata,
        roleContext,
        deadlineAt: input.deadlineAt,
        topK: retrieval.topK,
      });
    }
    if (retrieval.status !== 'selected' || !retrieval.selected) {
      const failureCode = retrieval.status === 'clarify' ? 'CAPABILITY_RETRIEVAL_CLARIFY' : 'CAPABILITY_RETRIEVAL_NONE';
      await this.recordModelFailure({
        runId: input.runId,
        stepKey: 'capability_retrieval',
        layer: 'planning',
        stage: 'retrieve',
        code: failureCode,
      });
      return this.modelFailure(failureCode, this.modelMetadata('retrieve', modelMetadata), validation.intent);
    }
    const contractMismatches = findCapabilityContractMissingDefinitions(
      validation.intent,
      retrieval.selected,
      input.dto.message,
    );
    if (contractMismatches.length > 0) {
      await this.recordModelFailure({
        runId: input.runId,
        stepKey: 'capability_retrieval',
        layer: 'planning',
        stage: 'retrieve',
        code: 'CAPABILITY_CONTRACT_MISMATCH',
        diagnosticCode: `MISSING_${contractMismatches[0]!.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()}`,
      });
      return this.modelFailure(
        'CAPABILITY_CONTRACT_MISMATCH',
        this.modelMetadata('retrieve', modelMetadata),
        validation.intent,
      );
    }
    if (
      this.shouldUseModelSupervisor(validation.intent) &&
      !governedExampleCard &&
      !this.canUseSingleCapabilityFastPath(retrieval.selected, validation.intent)
    ) {
      return this.buildModelSupervisorAnswer({
        context: input.context,
        dto: input.dto,
        runId: input.runId,
        intent: validation.intent,
        cards,
        modelMetadata,
        roleContext,
        deadlineAt: input.deadlineAt,
        topK: retrieval.topK,
      });
    }
    modelMetadata = this.modelMetadata('retrieve', {
      ...modelMetadata,
      capabilityKey: retrieval.selected.key,
      capabilityVersion: retrieval.selected.version,
    });

    const planning = this.singleStepPlanner!.plan({ intent: validation.intent, retrieval });
    await this.recordModelTrace({
      runId: input.runId,
      stepKey: 'single_step_plan',
      layer: 'planning',
      output: this.toJsonValue(
        planning.status === 'planned'
          ? { status: planning.status, stage: 'plan', code: 'MODEL_PLAN_READY', planId: planning.plan.planId, nodeCount: planning.plan.nodes.length }
          : { status: planning.status, stage: 'plan', code: 'MODEL_PLAN_UNAVAILABLE' },
      ),
      status: planning.status === 'planned' ? 'completed' : 'failed',
    });
    if (planning.status !== 'planned') {
      await this.recordModelFailure({
        runId: input.runId,
        stepKey: 'single_step_plan',
        layer: 'planning',
        stage: 'plan',
        code: 'MODEL_PLAN_UNAVAILABLE',
      });
      return this.modelFailure('MODEL_PLAN_UNAVAILABLE', this.modelMetadata('plan', modelMetadata));
    }
    modelMetadata = this.modelMetadata('plan', { ...modelMetadata, planId: planning.plan.planId });

    let plan: ReturnType<BrainExecutionPlanValidatorService['validate']>;
    try {
      plan = this.executionPlanValidator!.validate({ plan: planning.plan, cards, context: input.context });
    } catch (error) {
      await this.recordModelFailure({
        runId: input.runId,
        stepKey: 'single_step_plan',
        layer: 'planning',
        stage: 'plan',
        code: 'MODEL_PLAN_INVALID',
        diagnosticCode: this.modelDiagnosticCode(error),
        error,
      });
      return this.modelFailure('MODEL_PLAN_INVALID', modelMetadata);
    }
    const node = plan.nodes[0];
    if (!node) return this.modelFailure('MODEL_PLAN_INVALID', modelMetadata);
    const card = cards.find((candidate) => candidate.key === node.capabilityKey && candidate.version === node.capabilityVersion);
    if (!card) return this.modelFailure('MODEL_PLAN_INVALID', modelMetadata);

    try {
      const budgetState = this.executionBudget!.start(plan);
      this.executionPlanValidator!.revalidateNodeExecution({ node, card, context: input.context });
      this.executionBudget!.assertCanStartNode(budgetState, card);
      const execution = await this.capabilityExecutorRegistry!.execute({
        card,
        context: input.context,
        runId: input.runId,
        planId: plan.planId,
        question: input.dto.message,
        args: node.args,
      });
      await this.recordModelTrace({
        runId: input.runId,
        stepKey: 'capability_execution',
        layer: 'execution',
        output: this.toJsonValue({
          capabilityKey: card.key,
          capabilityVersion: card.version,
          status: execution.status,
          grounding: execution.grounding,
        }),
        status: execution.status === 'completed' ? 'completed' : 'failed',
      });
      const executionMetadata = this.modelMetadata('execute', {
        ...modelMetadata,
        capabilityKey: card.key,
        capabilityVersion: card.version,
      });
      if (execution.status !== 'completed') {
        await this.recordModelFailure({
          runId: input.runId,
          stepKey: 'capability_execution',
          layer: 'execution',
          stage: 'execute',
          code: 'CAPABILITY_EXECUTION_FAILED',
        });
        return this.modelFailure('CAPABILITY_EXECUTION_FAILED', executionMetadata);
      }
      await this.recordModelTrace({
        runId: input.runId,
        stepKey: 'model_answer_compose',
        layer: 'response',
        output: this.toJsonValue({ capabilityKey: card.key, capabilityVersion: card.version, planId: plan.planId }),
        status: 'completed',
      });
      const grounded = this.groundedAnswerComposer?.composeDomainAnswer(execution);
      return {
        status: 'completed',
        answer: grounded?.answer ?? execution.answer,
        citations: grounded?.citations ?? execution.citations,
        suggestedActions: grounded?.suggestedActions ?? execution.suggestedActions ?? [],
        blocks: grounded?.blocks ?? execution.blocks,
        grounding: execution.grounding,
        adapterMetadata: {
          ...(execution.metadata ?? {}),
          executionPlan: plan,
          observations: [
            {
              capabilityKey: card.key,
              capabilityVersion: card.version,
              status: execution.status,
              grounding: execution.grounding,
              citationCount: execution.citations.length,
            },
          ],
          completion: { status: 'complete', missingCriteria: [], recoverable: false },
        },
        modelMetadata: executionMetadata,
        modelContextIntent: validation.intent,
      };
    } catch (error) {
      await this.recordModelFailure({
        runId: input.runId,
        stepKey: 'capability_execution',
        layer: 'execution',
        stage: 'execute',
        code: 'CAPABILITY_EXECUTION_FAILED',
        diagnosticCode: this.modelDiagnosticCode(error),
        error,
      });
      return this.modelFailure(
        'CAPABILITY_EXECUTION_FAILED',
        this.modelMetadata('execute', { ...modelMetadata, capabilityKey: card.key, capabilityVersion: card.version }),
      );
    }
  }

  private shouldRepairModelIntent(
    validation: Exclude<ReturnType<BrainSemanticIntentValidatorService['validate']>, { status: 'valid' }>,
  ): boolean {
    if (validation.issues.length === 0) return false;
    return validation.issues.every((issue) =>
      issue.code !== 'UNTRUSTED_SECURITY_SCOPE' && issue.code !== 'ENTITY_CONFLICT',
    );
  }

  private normalizeGovernedCapabilityExampleIntent(input: {
    intent: BrainSemanticIntent;
    question: string;
    cards: readonly BrainCapabilityCard[];
    snapshot: ProductionReadyBusinessDefinitionSnapshot;
  }): BrainSemanticIntent {
    const matched = this.findGovernedCapabilityExampleCard(input.question, input.cards);
    if (!matched) return input.intent;
    const activeDomains = new Set([
      ...input.snapshot.entities.map((definition) => definition.domain),
      ...input.snapshot.metrics.map((definition) => definition.domain),
      ...input.snapshot.dimensions.map((definition) => definition.domain),
    ]);
    const modelDomains = input.intent.domains.filter((domain) => activeDomains.has(domain));
    const cardDomains = matched.domains.filter((domain) => activeDomains.has(domain));
    const unorderedListIntent =
      input.intent.intent === 'ranking' &&
      input.intent.metrics.length === 0 &&
      input.intent.orderBy.length === 0 &&
      matched.intents.includes('query');
    const inferredDimensionKeys = new Set(inferQuestionDimensionDefinitions(input.question));
    const governedDimensions = (matched.definitionRefs ?? [])
      .filter((ref) => inferredDimensionKeys.has(ref.definitionKey))
      .map((ref) => definitionRefFromCard(ref, 'dimension'));
    const inferredMetricKey = inferGovernedQuestionMetricKey(input.question);
    const governedMetric = inferredMetricKey
      ? (matched.definitionRefs ?? []).find((ref) => ref.definitionKey === inferredMetricKey)
      : undefined;
    const metrics = governedMetric ? [definitionRefFromCard(governedMetric, 'metric')] : input.intent.metrics;
    const orderBy = governedMetric && input.intent.intent === 'ranking'
      ? [{ definitionRef: definitionRefFromCard(governedMetric, 'metric'), direction: 'desc' as const }]
      : input.intent.orderBy;
    return {
      ...input.intent,
      ...(unorderedListIntent ? { intent: 'query' as const, answerShape: 'list' as const } : {}),
      domains: modelDomains.length ? modelDomains : cardDomains,
      metrics,
      dimensions: input.intent.dimensions.length > 0 ? input.intent.dimensions : governedDimensions,
      orderBy,
      filters: [],
      ambiguities: [],
      missingSlots: [],
    };
  }

  private normalizeGovernedCapabilityContractIntent(input: {
    intent: BrainSemanticIntent;
    question: string;
    cards: readonly BrainCapabilityCard[];
  }): BrainSemanticIntent {
    const requestedSlots = new Set([
      ...input.intent.missingSlots.map((slot) => slot.trim().toLowerCase()),
      ...input.intent.ambiguities.map((ambiguity) => ambiguity.slot.trim().toLowerCase()),
    ]);
    if (!requestedSlots.size || [...requestedSlots].some((slot) => this.isProtectedCapabilityClarificationSlot(slot))) {
      return input.intent;
    }
    const candidates = input.cards
      .filter((card) =>
        card.readOnly &&
        card.grounding === 'domain_service' &&
        input.intent.domains.some((domain) => card.domains.includes(domain)) &&
        (card.intents.includes(input.intent.intent) || (input.intent.intent === 'ranking' && card.intents.includes('query'))),
      )
      .map((card) => ({ card, score: this.governedCapabilitySemanticScore(input.question, card) }))
      .sort((left, right) => right.score - left.score || left.card.key.localeCompare(right.card.key));
    const matched = candidates[0];
    const margin = matched ? matched.score - (candidates[1]?.score ?? 0) : 0;
    if (!matched || matched.score < 0.68 || (matched.score < 0.82 && margin < 0.08)) return input.intent;

    const supportedDefinitions = new Set((matched.card.definitionRefs ?? []).map((ref) => ref.definitionKey));
    const metrics = input.intent.metrics.filter((metric) => supportedDefinitions.has(metric.definitionKey));
    const removedMetricKeys = new Set(
      input.intent.metrics.filter((metric) => !supportedDefinitions.has(metric.definitionKey)).map((metric) => metric.definitionKey),
    );
    const orderBy = input.intent.orderBy.filter((item) => !removedMetricKeys.has(item.definitionRef.definitionKey));
    const governedDimensions = (matched.card.definitionRefs ?? [])
      .filter((ref) => ref.definitionKey.startsWith('dimension.'))
      .map((ref) => ({
        definitionType: 'dimension' as const,
        definitionKey: ref.definitionKey,
        definitionVersion: ref.version,
        definitionFingerprint: ref.definitionFingerprint,
        sourceFingerprint: ref.sourceFingerprint,
      }));
    const dimensions = input.intent.dimensions.length > 0
      ? input.intent.dimensions
      : ['list', 'ranking'].includes(input.intent.answerShape)
        ? governedDimensions
        : input.intent.dimensions;
    const unorderedList = input.intent.intent === 'ranking' && metrics.length === 0 && orderBy.length === 0;
    return {
      ...input.intent,
      ...(unorderedList ? { intent: 'query' as const, answerShape: 'list' as const } : {}),
      metrics,
      dimensions,
      orderBy,
      ambiguities: [],
      missingSlots: [],
      assumptions: [
        ...input.intent.assumptions,
        `能力 ${matched.card.key} 将采用并披露已治理的默认分析口径。`,
      ],
    };
  }

  private isProtectedCapabilityClarificationSlot(slot: string): boolean {
    const normalized = slot.toLocaleLowerCase('zh-CN').replace(/[\s._-]+/g, '');
    return /(?:entity|identity|customername|customerid|phone|actiontarget|permission|store|confirmation|recipient|具体客户|客户姓名|客户身份|手机号|操作对象|执行对象|门店|权限|确认对象|接收人)/.test(normalized);
  }

  private governedCapabilitySemanticScore(question: string, card: BrainCapabilityCard): number {
    const candidates = [card.name, card.description, ...(card.examples ?? []), ...(card.synonyms ?? [])];
    return candidates.reduce(
      (best, candidate) => Math.max(best, this.governedTextSimilarity(question, candidate)),
      0,
    );
  }

  private governedTextSimilarity(leftValue: string, rightValue: string): number {
    const left = this.normalizeGovernedExampleText(leftValue);
    const right = this.normalizeGovernedExampleText(rightValue);
    if (!left || !right) return 0;
    if (left === right) return 1;
    if (left.includes(right) || right.includes(left)) {
      return Math.min(1, 0.75 + 0.25 * (Math.min(left.length, right.length) / Math.max(left.length, right.length)));
    }
    const leftPairs = new Set(Array.from({ length: Math.max(0, left.length - 1) }, (_, index) => left.slice(index, index + 2)));
    const rightPairs = new Set(Array.from({ length: Math.max(0, right.length - 1) }, (_, index) => right.slice(index, index + 2)));
    if (!leftPairs.size || !rightPairs.size) return 0;
    let overlap = 0;
    for (const pair of leftPairs) if (rightPairs.has(pair)) overlap += 1;
    return (2 * overlap) / (leftPairs.size + rightPairs.size);
  }

  private normalizeGovernedExampleText(value: string): string {
    return value.toLocaleLowerCase('zh-CN').replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
  }

  private findGovernedCapabilityExampleCard(
    question: string,
    cards: readonly BrainCapabilityCard[],
  ): BrainCapabilityCard | undefined {
    const normalizedQuestion = this.normalizeGovernedExampleText(question);
    return cards.find((card) =>
      (card.examples ?? []).some((example) =>
        this.normalizeGovernedExampleText(example) === normalizedQuestion,
      ),
    );
  }

  private shouldUseModelSupervisor(intent: BrainSemanticIntent) {
    return (
      intent.intent === 'workflow' ||
      intent.domains.length > 1 ||
      (['diagnosis', 'recommendation', 'action'].includes(intent.intent) && intent.successCriteria.length > 1)
    );
  }

  private canUseSingleCapabilityFastPath(card: BrainCapabilityCard, intent: BrainSemanticIntent) {
    if (!card.readOnly || card.sideEffect || intent.intent === 'workflow' || intent.intent === 'action') return false;
    const intentCompatible = card.intents.includes(intent.intent) ||
      (intent.intent === 'recommendation' && card.intents.includes('diagnosis'));
    return intentCompatible && intent.domains.every((domain) => card.domains.includes(domain));
  }

  private async buildModelSupervisorAnswer(input: {
    context: BrainRequestContext;
    dto: SendBrainMessageDto;
    runId: number;
    intent: BrainSemanticIntent;
    cards: readonly BrainCapabilityCard[];
    modelMetadata: BrainModelMetadata;
    roleContext?: BrainRoleRuntimeContext;
    deadlineAt: number;
    topK?: readonly BrainCapabilityRankedCandidate[];
  }): Promise<BrainChatAnswer> {
    if (!this.orchestrator || !this.boundedExecutor || !this.capabilityRetriever) {
      return this.modelFailure('MODEL_SUPERVISOR_UNAVAILABLE', this.modelMetadata('plan', input.modelMetadata));
    }
    const topK = input.topK ?? this.capabilityRetriever.retrieveTopKForSupervisor({
      intent: input.intent,
      question: input.dto.message,
      context: input.context,
      cards: input.cards,
      maxRisk: 'high',
    });
    if (!topK.length) {
      return this.modelFailure('CAPABILITY_RETRIEVAL_NONE', this.modelMetadata('retrieve', input.modelMetadata));
    }
    const planning = await this.orchestrator.createModelExecutionPlan({
      question: input.dto.message,
      intent: input.intent,
      topK,
      audit: { userId: input.context.userId, storeId: input.context.storeId },
      roleContext: input.roleContext,
      deadlineAt: input.deadlineAt,
    });
    await this.recordModelTrace({
      runId: input.runId,
      stepKey: 'supervisor_model_plan',
      layer: 'planning',
      output: this.toJsonValue(
        planning.status === 'planned'
          ? {
              status: 'planned',
              planId: planning.plan.planId,
              nodeCount: planning.plan.nodes.length,
              plan: planning.plan,
              candidateCapabilities: topK.map((candidate) => ({
                key: candidate.card.key,
                version: candidate.card.version,
                name: candidate.card.name,
                score: candidate.score,
                matchedFields: candidate.matchedFields,
                domains: candidate.card.domains,
                intents: candidate.card.intents,
                riskLevel: candidate.card.riskLevel,
              })),
            }
          : {
              status: 'unavailable',
              code: planning.errorCode,
              ...(planning.errorCode === 'PLAN_POLICY_INVALID' ? { diagnosticCode: planning.reason } : {}),
            },
      ),
      status: planning.status === 'planned' ? 'completed' : 'failed',
    });
    if (planning.status !== 'planned') {
      const failureCode = planning.errorCode === 'PROVIDER_UNAVAILABLE'
        ? 'PROVIDER_UNAVAILABLE'
        : 'MODEL_SUPERVISOR_PLAN_UNAVAILABLE';
      return this.modelFailure(failureCode, this.modelMetadata('plan', input.modelMetadata));
    }
    const execution = await this.boundedExecutor.execute({
      plan: planning.plan,
      topK,
      context: input.context,
      runId: input.runId,
      question: input.dto.message,
      intent: input.intent,
    });
    await this.recordModelTrace({
      runId: input.runId,
      stepKey: 'bounded_dag_execution',
      layer: 'execution',
      output: this.toJsonValue({
        status: execution.status,
        planId: execution.plan.planId,
        replanCount: execution.replanCount,
        completion: execution.completion,
        observations: execution.observations.map((item) => ({
          nodeId: item.nodeId,
          capabilityKey: item.capabilityKey,
          capabilityVersion: item.capabilityVersion,
          status: item.status,
          grounding: item.grounding,
          citationCount: item.citations.length,
        })),
      }),
      status: execution.status === 'rejected' ? 'failed' : 'completed',
    });

    const completed = execution.observations.filter((item) => item.status === 'completed');
    const grounded = this.groundedAnswerComposer?.compose({
      observations: execution.observations,
      completion: execution.completion,
    });
    const summaries = completed.map((item) => item.summary.trim()).filter(Boolean);
    const limitations = execution.completion.missingCriteria;
    const fallbackAnswer = [
      summaries.join('\n\n') || '当前复合任务没有产生可用结果。',
      ...(limitations.length ? [`未完成范围：${limitations.join('；')}。`] : []),
    ].join('\n\n');
    const citations = completed.flatMap((item) => [...item.citations]);
    const suggestedActions = completed.flatMap((item) =>
      Array.isArray(item.data.suggestedActions) ? item.data.suggestedActions : [],
    );
    const blocks = completed.flatMap((item) =>
      Array.isArray(item.data.blocks) ? item.data.blocks : [],
    ) as NonNullable<BrainDomainAnswer['blocks']>;
    const metadata = this.modelMetadata('execute', {
      ...input.modelMetadata,
      planId: execution.plan.planId,
      provider: planning.provider,
      model: planning.model,
    });
    return {
      status: execution.status === 'rejected' ? 'failed' : 'completed',
      answer: grounded?.answer ?? fallbackAnswer,
      citations: grounded?.citations ?? citations,
      suggestedActions: grounded?.suggestedActions ?? suggestedActions,
      blocks: grounded?.blocks ?? blocks,
      grounding: completed.some((item) => item.grounding === 'preview_action') ? 'preview_action' : 'db_skill',
      adapterMetadata: {
        supervisorPlan: execution.plan,
        observations: execution.observations,
        completion: execution.completion,
      },
      modelMetadata: execution.status === 'rejected' ? { ...metadata, failureCode: 'MODEL_EXECUTION_REJECTED' } : metadata,
      modelContextIntent: input.intent,
    };
  }

  private modelMetadata(stage: BrainModelStage, values: Partial<BrainModelMetadata> = {}): BrainModelMetadata {
    const defaults: BrainModelMetadata = {
      cognitionMode: 'model',
      modelStage: stage,
      failureCode: null,
      intentSchemaVersion: null,
      capabilityKey: null,
      capabilityVersion: null,
      planId: null,
      model: null,
      provider: null,
    };
    return {
      ...defaults,
      ...values,
      cognitionMode: 'model',
      modelStage: stage,
    };
  }

  private modelFailure(
    code: string,
    metadata: BrainModelMetadata,
    modelContextIntent?: BrainSemanticIntent,
  ): BrainChatAnswer {
    return {
      status: 'failed',
      answer: this.safeModelFailureAnswer(code),
      citations: [],
      suggestedActions: [],
      ...(modelContextIntent ? { modelContextIntent } : {}),
      modelMetadata: { ...metadata, failureCode: code },
    };
  }

  private safeModelFailureAnswer(code: string): string {
    const messages: Record<string, string> = {
      MODEL_PIPELINE_UNAVAILABLE: '模型能力暂不可用，本次未执行查询。',
      MODEL_SNAPSHOT_UNAVAILABLE: '业务定义暂不可用，本次未执行查询。',
      MODEL_CATALOG_UNAVAILABLE: '可用能力目录暂不可用，本次未执行查询。',
      MODEL_ROLE_PROFILE_UNAVAILABLE: '当前角色配置未发布，本次未执行查询。',
      MODEL_ROLE_CAPABILITY_NONE: '当前角色没有可执行的已发布能力，本次未执行查询。',
      MODEL_INTENT_UNAVAILABLE: '当前无法理解该问题，请换一种清晰表述后重试。',
      MODEL_INTENT_INVALID: '当前问题未通过业务定义校验，请补充业务对象、指标或时间范围。',
      MODEL_INTENT_CLARIFICATION_REQUIRED: '请补充业务对象、指标或时间范围。',
      CAPABILITY_RETRIEVAL_NONE: '未找到可执行的已发布能力，请补充业务对象、指标或时间范围。',
      CAPABILITY_RETRIEVAL_CLARIFY: '能力匹配存在歧义，请补充业务对象、指标或时间范围。',
      CAPABILITY_CONTRACT_MISMATCH: '当前已发布能力缺少该问题需要的业务对象或分析维度，本次不执行泛化查询。',
      MODEL_PLAN_UNAVAILABLE: '当前暂无法生成执行计划，本次未执行查询。',
      MODEL_PLAN_INVALID: '当前执行计划未通过校验，本次未执行查询。',
      MODEL_SUPERVISOR_UNAVAILABLE: '复合任务规划能力暂不可用，本次未执行查询。',
      MODEL_SUPERVISOR_PLAN_UNAVAILABLE: '当前无法生成受控复合计划，本次未执行查询。',
      PROVIDER_UNAVAILABLE: '模型服务暂不可用，本次未执行查询，请稍后重试。',
      CAPABILITY_EXECUTION_FAILED: '当前无法完成查询，请稍后重试。',
    };
    return messages[code] ?? '当前无法完成查询，请稍后重试。';
  }

  private async recordModelFailure(input: {
    runId: number;
    stepKey: string;
    layer: Parameters<BrainTraceService['recordStep']>[0]['layer'];
    stage: BrainModelStage;
    code: string;
    diagnosticCode?: string;
    error?: unknown;
  }): Promise<void> {
    await this.recordModelTrace({
      runId: input.runId,
      stepKey: input.stepKey,
      layer: input.layer,
      output: {
        status: 'failed',
        stage: input.stage,
        code: input.code,
        ...(input.diagnosticCode && /^[A-Z0-9_]+$/.test(input.diagnosticCode)
          ? { diagnosticCode: input.diagnosticCode }
          : {}),
      },
      status: 'failed',
      ...(input.error
        ? { error: { stage: input.stage, code: input.code, errorClass: this.modelErrorClass(input.error) } as Prisma.InputJsonValue }
        : {}),
    });
  }

  private modelErrorClass(error: unknown): 'forbidden' | 'internal' | 'unknown' {
    if (error instanceof ForbiddenException) return 'forbidden';
    if (error instanceof Error) return 'internal';
    return 'unknown';
  }

  private modelDiagnosticCode(error: unknown): string | undefined {
    if (!(error instanceof Error) || !error.message) return undefined;
    const prefix = error.message.split(':', 1)[0]!.trim().toUpperCase().replace(/[^A-Z0-9_]+/g, '_');
    return prefix && prefix.length <= 80 ? prefix : undefined;
  }

  private enrichModelEntityRefs(intent: BrainSemanticIntent): BrainSemanticIntent {
    const resolver = this.ontologyRuntime?.resolveEntityAlias;
    if (typeof resolver !== 'function') return intent;
    let changed = false;
    const entities = intent.entities.map((entity) => {
      if (entity.definitionRef) return entity;
      const resolution = resolver.call(this.ontologyRuntime, entity.mention || entity.entityType);
      if (resolution.status !== 'resolved' || resolution.matchType !== 'exact' || resolution.refs.length !== 1) {
        return entity;
      }
      changed = true;
      return {
        ...entity,
        entityKey: entity.entityKey ?? resolution.entity.entityKey,
        definitionRef: resolution.refs[0] as BrainSemanticIntent['entities'][number]['definitionRef'],
      };
    });
    return changed ? { ...intent, entities } : intent;
  }

  private async recordModelTrace(input: Parameters<BrainTraceService['recordStep']>[0]): Promise<void> {
    try {
      await this.traceService.recordStep(input);
    } catch {
      // Trace persistence is observability-only and cannot alter the governed execution decision.
    }
  }

  private withModelCatalogMetadata(
    slots: object,
    snapshot: ProductionReadyBusinessDefinitionSnapshot,
    cards: readonly BrainCapabilityCard[],
  ): Record<string, unknown> {
    return {
      ...Object.fromEntries(Object.entries(slots)),
      metadata: {
        businessDefinitionSnapshotFingerprint: snapshot.fingerprint,
        publishedCapabilityCount: cards.length,
      },
    };
  }

  private modelConversationSlots(slots: object): Record<string, unknown> {
    const snapshot = slots as {
      version?: unknown;
      definitionRefs?: unknown;
      entities?: unknown;
      intent?: unknown;
      answerShape?: unknown;
      timeRange?: unknown;
      objective?: unknown;
      metrics?: unknown;
      dimensions?: unknown;
      capability?: unknown;
      lastCorrections?: unknown;
      turnDirectives?: unknown;
      updatedAt?: unknown;
    };
    if (snapshot.version !== 1) return {};
    return {
      modelContext: {
        version: snapshot.version,
        objective: snapshot.objective,
        definitionRefs: snapshot.definitionRefs,
        metrics: snapshot.metrics,
        dimensions: snapshot.dimensions,
        entities: snapshot.entities,
        intent: snapshot.intent,
        answerShape: snapshot.answerShape,
        timeRange: snapshot.timeRange,
        capability: snapshot.capability,
        lastCorrections: snapshot.lastCorrections,
        updatedAt: snapshot.updatedAt,
      },
      ...(snapshot.turnDirectives ? { turnDirectives: snapshot.turnDirectives } : {}),
    };
  }

  private modelOntologyCandidates(snapshot: ProductionReadyBusinessDefinitionSnapshot) {
    return [
      ...snapshot.entities.map((entity) => ({
        definitionRef: this.modelDefinitionRef('entity', entity),
        name: entity.name,
        domain: entity.domain,
        aliases: [...entity.aliases],
        entityKey: entity.entityKey,
      })),
      ...snapshot.relations.map((relation) => ({
        definitionRef: this.modelDefinitionRef('relation', relation),
        name: relation.name,
        fromEntityKey: relation.fromEntityKey,
        toEntityKey: relation.toEntityKey,
      })),
    ];
  }

  private modelDefinitionRef<T extends 'entity' | 'relation' | 'metric' | 'dimension'>(
    definitionType: T,
    definition: BusinessDefinitionBase,
  ): BrainDefinitionRef<T> {
    return {
      definitionType,
      definitionKey: definition.definitionKey,
      definitionVersion: definition.version,
      definitionFingerprint: definition.definitionFingerprint,
      sourceFingerprint: definition.sourceFingerprint,
    };
  }

  private semanticEvidenceCorrections(
    intent: BrainSemanticIntent,
    corrections: BrainModelConversationCorrection[],
  ): Array<{
    sourceType: string;
    definitionType: string;
    definitionKey: string;
    definitionVersion: number;
    definitionFingerprint: string;
    sourceFingerprint?: string;
    alias: string;
    confidence: number;
  }> {
    const result: Array<{
      sourceType: string;
      definitionType: string;
      definitionKey: string;
      definitionVersion: number;
      definitionFingerprint: string;
      sourceFingerprint?: string;
      alias: string;
      confidence: number;
    }> = [];
    for (const correction of corrections) {
      if (!correction.next?.trim()) continue;
      if (correction.slot === 'entities') {
        const entities = intent.entities.filter((entity) => entity.definitionRef);
        const selected =
          entities.find((entity) => entity.mention.trim() === correction.next.trim()) ??
          (entities.length === 1 ? entities[0] : undefined);
        if (!selected?.definitionRef) continue;
        result.push({
          sourceType: 'conversation_correction',
          ...selected.definitionRef,
          alias: correction.next,
          confidence: 0.99,
        });
        continue;
      }
      const refs = correction.slot === 'metrics' ? intent.metrics : correction.slot === 'dimensions' ? intent.dimensions : [];
      if (refs.length !== 1) continue;
      result.push({
        sourceType: 'conversation_correction',
        ...refs[0],
        alias: correction.next,
        confidence: 0.99,
      });
    }
    return result;
  }

  private async recordSemanticEvidenceTrace(input: {
    runId: number;
    status: 'completed' | 'failed';
    output?: Record<string, unknown>;
    error?: Record<string, unknown>;
  }) {
    try {
      await this.traceService.recordStep({
        runId: input.runId,
        stepKey: 'business_semantic_evidence_capture',
        layer: 'semantic',
        status: input.status,
        ...(input.output ? { output: input.output as Prisma.InputJsonValue } : {}),
        ...(input.error ? { error: input.error as Prisma.InputJsonValue } : {}),
      });
    } catch {
      // Evidence trace is observability-only and cannot alter the answer.
    }
  }

  private normalizeShadowTimezone(timezone: string): 'Asia/Shanghai' | 'UTC' {
    return timezone === 'UTC' ? 'UTC' : 'Asia/Shanghai';
  }

  private readShadowRuleTime(previous: unknown): unknown {
    if (!previous || typeof previous !== 'object' || Array.isArray(previous)) return null;
    return (previous as Record<string, unknown>).timeRange ?? null;
  }

  private normalizeShadowRole(roleHint?: string): BrainDomainRole {
    const roles: BrainDomainRole[] = [
      'store_manager',
      'receptionist',
      'marketing',
      'beautician',
      'inventory',
      'finance',
      'customer_service',
    ];
    return roles.includes(roleHint as BrainDomainRole) ? (roleHint as BrainDomainRole) : 'store_manager';
  }

  private modelRoleFromContext(context: BrainRequestContext): BrainDomainRole {
    const roles: BrainDomainRole[] = [
      'store_manager',
      'receptionist',
      'marketing',
      'beautician',
      'inventory',
      'finance',
      'customer_service',
    ];
    return roles.find((role) => context.roles?.includes(role)) ?? 'store_manager';
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
      const answer = `${timeRange.comparison.current.label}对比${timeRange.comparison.previous.label}：${this.answerComposer.compose(
        {
          shape: 'comparison',
          label: queryResult.compiled.label,
          metric,
          rows,
        },
      )}`;
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
    const requiredPermissions =
      routePlan.requiredPermissions.length > 0 ? routePlan.requiredPermissions : adapter.requiredPermissions;
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
      blocks: answer.blocks,
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
        blocks: answer.blocks,
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
      const riskText =
        overview.riskItems.length > 0 ? `风险：${overview.riskItems.join('；')}。` : '风险：当前未发现明确预警。';
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

    if (
      dto.roleHint === 'receptionist' &&
      runtimeIntent.intent === 'action' &&
      this.shouldUseReceptionReservationAction(dto.message)
    ) {
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

    if (
      (dto.roleHint === 'inventory' || dto.roleHint === 'store_manager') &&
      this.shouldUseInventoryDisposalAdvice(dto.message)
    ) {
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

    if (
      (dto.roleHint === 'inventory' || dto.roleHint === 'store_manager') &&
      this.shouldUseInventorySkill(dto.message)
    ) {
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
              .map(
                (item, index) =>
                  `${index + 1}. ${item.name}：当前 ${item.currentStock}，安全库存 ${item.safetyStock}。`,
              )
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
      const riskText =
        summary.riskItems.length > 0 ? `风险：${summary.riskItems.join('；')}` : '风险：当前未发现明确财务预警。';
      const marginText =
        summary.grossMarginRate === undefined
          ? '毛利率暂无结算数据'
          : `毛利率 ${this.formatPercent(summary.grossMarginRate)}`;
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
                const attention = includeAttention
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
    if (
      /(响应.*客户|效果|花了多少钱|带来.*收入|核销|转化率|roi|投产|吸引力最大|渠道|客户质量|滥用|多少|比例)/i.test(
        message,
      )
    ) {
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
    if (
      metric.includes('revenue') ||
      metric.includes('margin') ||
      metric.includes('liability') ||
      metric.includes('value')
    ) {
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

export function findCapabilityContractMissingDefinitions(
  intent: BrainSemanticIntent,
  card: Pick<BrainCapabilityCard, 'definitionRefs' | 'domains'> & { key?: string },
  question = '',
): string[] {
  const declared = Array.isArray(card.definitionRefs)
    ? card.definitionRefs.map((item) => normalizeDefinitionKey(item.definitionKey))
    : [];
  const domains = [
    ...(Array.isArray(card.domains) ? card.domains.map((item) => item.toLowerCase()) : []),
    ...capabilityKeyDomains(card.key),
  ];
  const requested = [
    ...(intent.dimensions ?? []).map((item) => item.definitionKey),
    ...inferQuestionDimensionDefinitions(question),
  ].filter((item): item is string => Boolean(item));
  return [...new Set(requested.filter((item) => {
    if (declared.includes(normalizeDefinitionKey(item))) return false;
    const requiredDomains = definitionDomains(item);
    return requiredDomains.length > 0 && !requiredDomains.some((domain) => domains.includes(domain));
  }))];
}

export function findUnresolvedBusinessDefinitionRequirements(
  intent: BrainSemanticIntent,
  question: string,
): string[] {
  if (
    /(?:产品|商品|货品).*(?:低于成本|毛利率|毛利)|(?:低于成本|毛利率|毛利).*(?:产品|商品|货品)/.test(question) &&
    !intent.metrics.some((metric) => {
      const key = normalizeDefinitionKey(metric.definitionKey);
      return key.includes('product') && (key.includes('margin') || key.includes('cost'));
    })
  ) {
    return ['metric.product_margin'];
  }
  return [];
}

function definitionRefFromCard<T extends 'metric' | 'dimension'>(
  ref: BrainCapabilityCard['definitionRefs'][number],
  definitionType: T,
): BrainDefinitionRef<T> {
  return {
    definitionType,
    definitionKey: ref.definitionKey,
    definitionVersion: ref.version,
    definitionFingerprint: ref.definitionFingerprint,
    sourceFingerprint: ref.sourceFingerprint,
  };
}

function inferGovernedQuestionMetricKey(question: string): string | undefined {
  if (/(?:美容师|员工|谁).*(?:接|服务).*(?:客户|客人).*(?:最多|几个|排行)|(?:客户|客人).*(?:最多|几个).*(?:美容师|员工|谁)/.test(question)) {
    return 'metric.staff_unique_customer_count';
  }
  if (/(?:美容师|员工).*(?:服务次数|做了几次)|服务次数.*(?:美容师|员工)/.test(question)) {
    return 'metric.staff_service_count';
  }
  return undefined;
}

function capabilityKeyDomains(capabilityKey?: string): string[] {
  if (!capabilityKey) return [];
  const domains: string[] = [];
  if (capabilityKey.includes('customer')) domains.push('customer');
  if (capabilityKey.includes('project')) domains.push('project');
  if (capabilityKey.includes('product')) domains.push('product');
  if (capabilityKey.includes('inventory')) domains.push('inventory', 'product');
  if (capabilityKey.includes('staff') || capabilityKey.includes('beautician')) domains.push('staff', 'beautician');
  if (capabilityKey.includes('finance') || capabilityKey.includes('payment')) domains.push('finance', 'payment');
  if (capabilityKey.includes('marketing')) domains.push('marketing');
  if (capabilityKey.includes('store_operations')) domains.push('project', 'staff', 'beautician', 'payment');
  if (capabilityKey.includes('beautician_service')) domains.push('customer', 'project', 'reservation');
  if (capabilityKey.includes('front_desk') || capabilityKey.includes('reservation')) {
    domains.push('customer', 'staff', 'beautician', 'reservation', 'project');
  }
  return domains;
}

function inferQuestionDimensionDefinitions(question: string): string[] {
  const definitions: string[] = [];
  if (/(?:项目|套餐|护理)/.test(question)) definitions.push('dimension.projectName');
  if (/(?:产品|商品|货品)/.test(question)) definitions.push('dimension.productName');
  if (/(?:员工|美容师|技师)/.test(question)) definitions.push('dimension.beauticianName');
  if (/(?:客户|客人|会员)/.test(question)) definitions.push('dimension.customerName');
  return definitions;
}

function normalizeDefinitionKey(value: string) {
  return value.toLowerCase().replace(/^(?:metric|dimension|entity)\./, '').replace(/[._-]/g, '');
}

function definitionDomains(definitionKey: string): string[] {
  const key = normalizeDefinitionKey(definitionKey);
  if (key.includes('customer')) return ['customer'];
  if (key.includes('project')) return ['project'];
  if (key.includes('product')) return ['product', 'inventory'];
  if (key.includes('beautician') || key.includes('staff')) return ['staff', 'beautician'];
  if (key.includes('payment')) return ['finance', 'payment'];
  if (key.includes('cost')) return ['finance', 'operating_cost'];
  if (key.includes('marketing') || key.includes('campaign')) return ['marketing'];
  return [];
}
