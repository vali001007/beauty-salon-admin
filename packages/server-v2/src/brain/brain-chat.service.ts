import { ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { BrainRiskLevel, Prisma } from '@prisma/client';
import {
  AVERAGE_ORDER_VALUE_QUESTION_PATTERN,
  MATERIAL_COST_RATE_QUESTION_PATTERN,
  STAFF_COMPLAINT_QUESTION_PATTERN,
  STAFF_REVENUE_QUESTION_PATTERN,
} from '../semantic-data/ami-core-business-semantic-contracts.js';
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
import { BRAIN_SEMANTIC_ANSWER_SHAPES, BRAIN_SEMANTIC_INTENTS } from './cognition/brain-semantic-intent.types.js';
import type { BrainDefinitionRef, BrainSemanticIntent } from './cognition/brain-semantic-intent.types.js';
import type {
  BusinessDefinitionBase,
  ProductionReadyBusinessDefinitionSnapshot,
} from './cognition/business-definition-snapshot.types.js';
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
  resolveBrainDomainRole,
  type BrainRoleRuntimeContext,
} from './role/brain-role-context-builder.service.js';
import type {
  BrainModelConversationCorrection,
  BrainModelPendingClarification,
} from './context/brain-conversation-context.service.js';
import {
  BrainResultReferenceService,
  isBrainModelResultSet,
  type BrainModelResultSet,
} from './context/brain-result-reference.service.js';
import { BrainReleaseService } from './governance/brain-release.service.js';
import { BusinessSemanticEvidenceService } from '../semantic-data/business-semantic-evidence.service.js';
import { matchBrainCapabilityBoundary } from './capability/brain-capability-boundary.registry.js';

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
  modelContextPendingClarification?: BrainModelPendingClarification;
  modelContextResultSets?: BrainModelResultSet[];
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
    private readonly resultReferenceService: BrainResultReferenceService,
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
        status: this.isEvaluationContext(context) ? 'evaluation' : 'active',
      },
    });
    this.rememberConversationAccess(context, conversation.id);
    return conversation;
  }

  async listConversations(context: BrainRequestContext) {
    this.assertBaseAccess(context);
    const where = { storeId: context.storeId, userId: context.userId, status: 'active', deletedAt: null };
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

  private isEvaluationContext(context: BrainRequestContext): boolean {
    return context.governanceEvalReleaseId !== undefined || context.governanceEvalReleaseSnapshot !== undefined;
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
    if (chatAnswer.status === 'completed' && chatAnswer.modelContextIntent) {
      const resultSets = this.resultReferenceService.buildResultSets({
        runId: run.id,
        capabilityKey: chatAnswer.modelMetadata?.capabilityKey ?? undefined,
        capabilityVersion: chatAnswer.modelMetadata?.capabilityVersion ?? undefined,
        intent: chatAnswer.modelContextIntent,
        adapterMetadata: chatAnswer.adapterMetadata,
      });
      if (resultSets.length) {
        chatAnswer = {
          ...chatAnswer,
          adapterMetadata: { ...(chatAnswer.adapterMetadata ?? {}), resultSets },
          modelContextResultSets: resultSets,
        };
        await this.recordModelTrace({
          runId: run.id,
          stepKey: 'model_result_reference_write',
          layer: 'memory',
          status: 'completed',
          output: this.toJsonValue({
            resultSets: resultSets.map((set) => ({
              setId: set.setId,
              outputKey: set.outputKey,
              entityType: set.entityType,
              status: set.status,
              count: set.count,
              itemCount: set.items.length,
            })),
          }),
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
    await this.createAssistantMessageWithRetry({
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
      if (chatAnswer.status === 'completed' && chatAnswer.modelContextIntent) {
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
            resultSets: chatAnswer.modelContextResultSets,
            pendingClarification: chatAnswer.modelContextPendingClarification,
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
      const releaseSnapshot = await this.loadReleaseOntologySnapshot(releaseRuntime.capabilityCandidates);
      let prepared: Awaited<ReturnType<BrainConversationContextService['prepareModelTurn']>> | undefined;
      if (this.conversationContext) {
        try {
          prepared = await this.conversationContext.prepareModelTurn({
            conversationId,
            dto: inputDto,
            snapshot: releaseSnapshot,
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
        snapshot: releaseSnapshot,
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
        suggestedActions: [],
        blocks: [
          {
            kind: 'clarification',
            question: cognition.clarification.question,
            options: cognition.clarification.options.map((option) => ({
              id: option.id,
              label: option.label,
              value: option.value,
            })),
          },
        ],
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
    return Boolean(runtime?.cognitionMode === 'model' && runtime.plannerMode === 'model' && runtime.singleToolFastPath);
  }

  private async resolveReleaseRuntime(context: BrainRequestContext): Promise<{
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
      const mode =
        resolved.mode === 'rules' || resolved.mode === 'shadow' || resolved.mode === 'model' ? resolved.mode : 'rules';
      return {
        mode,
        capabilityCandidates: resolved.capabilityCandidates,
      };
    } catch (error) {
      if (context.governanceEvalReleaseId !== undefined) throw error;
      return { mode: 'rules' };
    }
  }

  private async loadReleaseOntologySnapshot(
    capabilityCandidates?: readonly BrainCapabilityCandidate[],
  ): Promise<ProductionReadyBusinessDefinitionSnapshot | null> {
    const productionSnapshot = this.ontologyRuntime?.getSnapshot() ?? null;
    if (capabilityCandidates === undefined || !this.ontologyRuntime) {
      return productionSnapshot;
    }

    const definitionVersionIds = [
      ...new Set(
        capabilityCandidates.flatMap((candidate) => {
          if (!Array.isArray(candidate.definitionRefs)) return [];
          return candidate.definitionRefs.flatMap((ref) => {
            if (!ref || typeof ref !== 'object' || Array.isArray(ref)) return [];
            const versionId = Number((ref as Record<string, unknown>).versionId);
            return Number.isInteger(versionId) && versionId > 0 ? [versionId] : [];
          });
        }),
      ),
    ];

    try {
      return await this.ontologyRuntime.loadEvaluationSnapshot(definitionVersionIds);
    } catch {
      return null;
    }
  }

  private async buildModelSingleToolAnswer(input: {
    context: BrainRequestContext;
    dto: SendBrainMessageDto;
    runId: number;
    deadlineAt: number;
    conversationSlots: object;
    capabilityCandidates?: readonly BrainCapabilityCandidate[];
    snapshot?: ProductionReadyBusinessDefinitionSnapshot | null;
  }): Promise<BrainChatAnswer> {
    let modelMetadata = this.modelMetadata('prepare');
    const currentBackendGap = this.resolveCurrentBackendFactGap(input.dto.message);
    if (currentBackendGap) {
      await this.recordModelTrace({
        runId: input.runId,
        stepKey: 'current_backend_fact_gap',
        layer: 'governance',
        input: { question: input.dto.message } as Prisma.InputJsonValue,
        output: {
          unsupportedReason: currentBackendGap.unsupportedReason,
          scope: 'current_management_backend',
        } as Prisma.InputJsonValue,
        status: 'completed',
      });
      return {
        status: 'completed',
        answer: currentBackendGap.answer,
        citations: [],
        suggestedActions: [],
        blocks: [{ kind: 'limitations', items: [currentBackendGap.answer] }],
        grounding: 'none',
        adapterMetadata: {
          unsupportedReason: currentBackendGap.unsupportedReason,
          scope: 'current_management_backend',
          completion: { status: 'complete', missingCriteria: [], recoverable: false },
        },
        modelMetadata,
      };
    }
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
    let snapshot = input.snapshot ?? this.ontologyRuntime!.getSnapshot();
    if (!snapshot && input.capabilityCandidates === undefined) {
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
    const modelRequestContext = this.withBrainRole(input.context, roleContext?.role);

    let cards: readonly BrainCapabilityCard[];
    try {
      cards =
        input.capabilityCandidates === undefined
          ? await this.capabilityCatalog!.listEnabledCapabilities()
          : await this.capabilityCatalog!.listEnabledCapabilities(input.capabilityCandidates);
      if (roleContext) cards = this.roleContextBuilder!.filterCapabilities(roleContext, input.context, cards);
      if (input.capabilityCandidates !== undefined && !input.snapshot) {
        const definitionVersionIds = [
          ...new Set(cards.flatMap((card) => (card.definitionRefs ?? []).map((ref) => ref.versionId))),
        ];
        snapshot = await this.ontologyRuntime!.loadEvaluationSnapshot(definitionVersionIds);
      }
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
      conversationSlots: this.withModelCatalogMetadata(
        this.modelConversationSlots(input.conversationSlots),
        snapshot,
        cards,
      ),
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
          return [
            {
              definitionType: definitionType as 'entity' | 'relation' | 'metric' | 'dimension',
              definitionKey: ref.definitionKey,
              definitionVersion: ref.version,
              definitionFingerprint: ref.definitionFingerprint,
              sourceFingerprint: ref.sourceFingerprint,
            },
          ];
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
      const failureCode =
        compilation.errorCode === 'PROVIDER_AUTH_FAILED' ? 'PROVIDER_AUTH_FAILED' : 'MODEL_INTENT_UNAVAILABLE';
      await this.recordModelFailure({
        runId: input.runId,
        stepKey: 'model_intent_compile',
        layer: 'cognition',
        stage: 'compile',
        code: failureCode,
        diagnosticCode: compilation.errorCode,
      });
      return this.modelFailure(failureCode, this.modelMetadata('compile'));
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
      output: this.toJsonValue({
        status: compilation.status,
        provider: compilation.provider,
        model: compilation.model,
        semanticIntent: this.modelIntentTraceSummary(compilation.intent),
      }),
      status: 'completed',
    });

    let enrichedIntent = this.normalizePendingClarificationResolution({
      intent: this.normalizeExactCustomerFactIntent({
        intent: this.normalizeConversationEntityInheritance({
          intent: this.normalizeUnboundReferenceIntent({
              intent: this.normalizeGovernedCapabilityContractIntent({
                intent: this.normalizeGovernedCapabilityExampleIntent({
                intent: this.normalizeGovernedReadOnlyPreviewIntent({
                  intent: this.normalizeReadOnlyQuestionIntent({
                    intent: this.normalizeModelClarificationIntent(
                      this.enrichModelEntityRefs(compilation.intent, snapshot),
                      input.dto.message,
                    ),
                    question: input.dto.message,
                    cards,
                  }),
                  question: input.dto.message,
                  cards,
                }),
                question: input.dto.message,
                cards,
                snapshot,
              }),
              question: input.dto.message,
              cards,
            }),
            question: input.dto.message,
            conversationSlots: compilerInput.conversationSlots,
          }),
          question: input.dto.message,
          conversationSlots: compilerInput.conversationSlots,
        }),
        question: input.dto.message,
      }),
      conversationSlots: compilerInput.conversationSlots,
      question: input.dto.message,
    });
    enrichedIntent = this.normalizeConversationContinuationIntent({
      intent: enrichedIntent,
      question: input.dto.message,
      conversationSlots: compilerInput.conversationSlots,
      cards,
    });
    enrichedIntent = this.normalizeQuestionPeriodTimeIntent({
      intent: enrichedIntent,
      question: input.dto.message,
      timezone: this.normalizeShadowTimezone(input.dto.timezone ?? input.context.timezone),
    });
    enrichedIntent = this.normalizeConversationResultReferenceIntent({
      intent: enrichedIntent,
      question: input.dto.message,
      conversationSlots: compilerInput.conversationSlots,
    });
    await this.recordModelTrace({
      runId: input.runId,
      stepKey: 'model_intent_normalized',
      layer: 'cognition',
      output: this.toJsonValue({
        status: 'completed',
        semanticIntent: this.modelIntentTraceSummary(enrichedIntent),
      }),
      status: 'completed',
    });
    const governedValidationScope = {
      domains: [...new Set(cards.flatMap((card) => card.domains))],
      definitionRefs: cards.flatMap((card) => card.definitionRefs),
      rankingContracts: cards
        .filter((card) => card.intents.includes('ranking'))
        .map((card) => ({ capabilityKey: card.key, domains: [...card.domains] })),
    };
    let validation: ReturnType<BrainSemanticIntentValidatorService['validate']>;
    try {
      validation = this.semanticIntentValidator!.validate(enrichedIntent, governedValidationScope, snapshot);
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
        let repairedIntent = this.normalizePendingClarificationResolution({
          intent: this.normalizeExactCustomerFactIntent({
            intent: this.normalizeConversationEntityInheritance({
              intent: this.normalizeUnboundReferenceIntent({
                intent: this.normalizeGovernedCapabilityContractIntent({
                  intent: this.normalizeGovernedCapabilityExampleIntent({
                    intent: this.normalizeGovernedReadOnlyPreviewIntent({
                      intent: this.normalizeReadOnlyQuestionIntent({
                        intent: this.normalizeModelClarificationIntent(
                          this.enrichModelEntityRefs(repairCompilation.intent, snapshot),
                          input.dto.message,
                        ),
                        question: input.dto.message,
                        cards,
                      }),
                      question: input.dto.message,
                      cards,
                    }),
                    question: input.dto.message,
                    cards,
                    snapshot,
                  }),
                  question: input.dto.message,
                  cards,
                }),
                question: input.dto.message,
                conversationSlots: compilerInput.conversationSlots,
              }),
              question: input.dto.message,
              conversationSlots: compilerInput.conversationSlots,
            }),
            question: input.dto.message,
          }),
          conversationSlots: compilerInput.conversationSlots,
          question: input.dto.message,
        });
        repairedIntent = this.normalizeConversationContinuationIntent({
          intent: repairedIntent,
          question: input.dto.message,
          conversationSlots: compilerInput.conversationSlots,
          cards,
        });
        repairedIntent = this.normalizeConversationResultReferenceIntent({
          intent: repairedIntent,
          question: input.dto.message,
          conversationSlots: compilerInput.conversationSlots,
        });
        const repairedValidation = this.semanticIntentValidator!.validate(repairedIntent, governedValidationScope, snapshot);
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
            issueCodes:
              repairedValidation.status === 'valid' ? [] : repairedValidation.issues.map((issue) => issue.code),
          }),
          status: repairedValidation.status === 'valid' ? 'completed' : 'failed',
        });
      }
    }
    const genericAmbiguity = this.answerFromGenericQuestionAmbiguity({
      intent: validation.intent,
      question: input.dto.message,
      modelMetadata,
    });
    if (genericAmbiguity) {
      await this.recordModelTrace({
        runId: input.runId,
        stepKey: 'generic_objective_clarification',
        layer: 'cognition',
        status: 'completed',
        output: this.toJsonValue({ code: 'GENERIC_OBJECTIVE_CLARIFICATION_REQUIRED' }),
      });
      return genericAmbiguity;
    }

    const capabilityBoundary = matchBrainCapabilityBoundary(input.dto.message);
    if (capabilityBoundary) {
      await this.recordModelTrace({
        runId: input.runId,
        stepKey: 'capability_boundary_decision',
        layer: 'planning',
        status: 'completed',
        output: this.toJsonValue({
          code: capabilityBoundary.code,
          boundaryStatus: capabilityBoundary.status,
        }),
      });
      return {
        status: 'completed',
        answer: `${capabilityBoundary.reason} Ami Brain 不会用相近指标、概览数据或推测结果替代。`,
        citations: [],
        suggestedActions: [],
        blocks: [{ kind: 'limitations', items: [capabilityBoundary.reason] }],
        grounding: 'none',
        adapterMetadata: {
          unsupportedReason: capabilityBoundary.code,
          boundaryStatus: capabilityBoundary.status,
          completion: { status: 'complete', missingCriteria: [], recoverable: false },
        },
        modelContextIntent: validation.intent,
        modelMetadata,
      };
    }
    if (validation.status === 'clarification_required') {
      const clarificationMetadata = this.modelMetadata('validate', modelMetadata);
      const question =
        validation.clarification.questions[0] ?? this.safeModelFailureAnswer('MODEL_INTENT_CLARIFICATION_REQUIRED');
      const options = this.modelClarificationOptions(validation.clarification.ambiguities);
      const pendingClarification: BrainModelPendingClarification = {
        missingSlots: [...validation.clarification.missingSlots],
        questions: [...validation.clarification.questions],
        ambiguities: validation.clarification.ambiguities.map((ambiguity) => ({
          ...ambiguity,
          candidates: [...ambiguity.candidates],
        })),
      };
      await this.recordModelTrace({
        runId: input.runId,
        stepKey: 'model_intent_validation',
        layer: 'cognition',
        output: { status: 'clarification_required', stage: 'validate', code: 'MODEL_INTENT_CLARIFICATION_REQUIRED' },
        status: 'completed',
      });
      return {
        status: 'completed',
        answer: question,
        citations: [],
        suggestedActions: [],
        blocks: [{ kind: 'clarification', question, options }],
        grounding: 'none',
        adapterMetadata: {
          clarification: pendingClarification,
          completion: {
            status: 'partial',
            missingCriteria: [...validation.clarification.missingSlots],
            recoverable: true,
          },
        },
        modelContextIntent: validation.intent,
        modelContextPendingClarification: pendingClarification,
        modelMetadata: clarificationMetadata,
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

    const semanticClarification = this.answerFromSemanticClarificationIntent({
      intent: validation.intent,
      modelMetadata,
    });
    if (semanticClarification) {
      await this.recordModelTrace({
        runId: input.runId,
        stepKey: 'model_semantic_clarification',
        layer: 'cognition',
        status: 'completed',
        output: this.toJsonValue({
          code: 'SEMANTIC_CLARIFICATION_REQUIRED',
          missingSlots: semanticClarification.modelContextPendingClarification?.missingSlots ?? [],
        }),
      });
      return semanticClarification;
    }

    const resultReferenceDecision = this.answerFromConversationResultReference({
      intent: validation.intent,
      question: input.dto.message,
      conversationSlots: compilerInput.conversationSlots,
      cards,
      modelMetadata,
    });
    if (resultReferenceDecision) {
      await this.recordModelTrace({
        runId: input.runId,
        stepKey: 'model_result_reference_decision',
        layer: 'planning',
        status: 'completed',
        output: this.toJsonValue({
          code:
            resultReferenceDecision.adapterMetadata?.unsupportedReason ??
            resultReferenceDecision.adapterMetadata?.decisionCode ??
            'RESULT_REFERENCE_DECISION',
          resultRef: resultReferenceDecision.adapterMetadata?.resolvedResultRef ?? null,
        }),
      });
      return resultReferenceDecision;
    }

    const actionClarification = this.answerFromUnsafeActionAmbiguity({
      intent: validation.intent,
      question: input.dto.message,
      modelMetadata,
    });
    if (actionClarification) {
      await this.recordModelTrace({
        runId: input.runId,
        stepKey: 'model_action_slot_clarification',
        layer: 'planning',
        status: 'completed',
        output: this.toJsonValue({
          code: actionClarification.adapterMetadata?.decisionCode ?? 'ACTION_SLOT_CLARIFICATION',
          missingSlots: actionClarification.modelContextPendingClarification?.missingSlots ?? [],
        }),
      });
      return actionClarification;
    }

    const unresolvedRequirements = findUnresolvedBusinessDefinitionRequirements(validation.intent, input.dto.message);
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
    const pendingCapabilityCard = this.resolvePendingClarificationCapability(
      compilerInput.conversationSlots,
      validation.intent,
      cards,
    );
    const customerFactsCard = this.findDeterministicCustomerFactsCard(input.dto.message, validation.intent, cards);
    const deterministicCapabilityCard = governedExampleCard ?? pendingCapabilityCard ?? customerFactsCard;
    if (validation.intent.intent === 'workflow' && !deterministicCapabilityCard) {
      return this.buildModelSupervisorAnswer({
        context: modelRequestContext,
        dto: input.dto,
        runId: input.runId,
        intent: validation.intent,
        cards,
        modelMetadata,
        roleContext,
        deadlineAt: input.deadlineAt,
      });
    }

    const retrieval: ReturnType<BrainCapabilityRetrieverService['retrieve']> = deterministicCapabilityCard
      ? {
          status: 'selected',
          selected: deterministicCapabilityCard,
          topK: [
            {
              card: deterministicCapabilityCard,
              score: 1,
              matchedFields: [
                governedExampleCard
                  ? 'examples'
                  : pendingCapabilityCard
                    ? 'pending_clarification'
                    : 'customer_identity',
              ],
            },
          ],
          confidence: 1,
          margin: 1,
          reason: governedExampleCard
            ? 'governed_example_selected'
            : pendingCapabilityCard
              ? 'pending_clarification_capability_reused'
              : 'specific_customer_fact_selected',
        }
      : this.capabilityRetriever!.retrieve({
          intent: validation.intent,
          question: input.dto.message,
          context: modelRequestContext,
          cards,
          readOnlyOnly: validation.intent.intent !== 'action',
          maxRisk: validation.intent.intent === 'action' ? 'high' : 'low',
        });
    await this.recordModelTrace({
      runId: input.runId,
      stepKey: 'capability_retrieval',
      layer: 'planning',
      output: this.toJsonValue({
        status: retrieval.status,
        stage: 'retrieve',
        code:
          retrieval.status === 'selected'
            ? 'CAPABILITY_SELECTED'
            : `CAPABILITY_RETRIEVAL_${retrieval.status.toUpperCase()}`,
        confidence: retrieval.confidence,
        margin: retrieval.margin,
        capabilityKey: retrieval.selected?.key ?? null,
        capabilityVersion: retrieval.selected?.version ?? null,
      }),
      status: retrieval.status === 'selected' ? 'completed' : 'failed',
    });
    if (retrieval.status === 'clarify' && retrieval.topK.length > 0) {
      return this.buildModelSupervisorAnswer({
        context: modelRequestContext,
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
    if (retrieval.status === 'none' && ['diagnosis', 'recommendation'].includes(validation.intent.intent)) {
      return this.buildModelSupervisorAnswer({
        context: modelRequestContext,
        dto: input.dto,
        runId: input.runId,
        intent: validation.intent,
        cards,
        modelMetadata,
        roleContext,
        deadlineAt: input.deadlineAt,
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
    const capabilityGovernedIntent = this.normalizeReadOnlyPreviewCapabilityIntent(validation.intent, retrieval.selected);
    if (capabilityGovernedIntent !== validation.intent) {
      validation = { ...validation, intent: capabilityGovernedIntent };
    }
    const contractMismatches = findCapabilityContractMissingDefinitions(
      validation.intent,
      retrieval.selected,
      input.dto.message,
      {
        exactGovernedExample:
          governedExampleCard?.key === retrieval.selected.key || customerFactsCard?.key === retrieval.selected.key,
      },
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
      !deterministicCapabilityCard &&
      !this.canUseSingleCapabilityFastPath(retrieval.selected, validation.intent)
    ) {
      return this.buildModelSupervisorAnswer({
        context: modelRequestContext,
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
          ? {
              status: planning.status,
              stage: 'plan',
              code: 'MODEL_PLAN_READY',
              planId: planning.plan.planId,
              nodeCount: planning.plan.nodes.length,
            }
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
      plan = this.executionPlanValidator!.validate({ plan: planning.plan, cards, context: modelRequestContext });
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
    const card = cards.find(
      (candidate) => candidate.key === node.capabilityKey && candidate.version === node.capabilityVersion,
    );
    if (!card) return this.modelFailure('MODEL_PLAN_INVALID', modelMetadata);

    try {
      const budgetState = this.executionBudget!.start(plan);
      this.executionPlanValidator!.revalidateNodeExecution({ node, card, context: modelRequestContext });
      this.executionBudget!.assertCanStartNode(budgetState, card);
      const execution = await this.capabilityExecutorRegistry!.execute({
        card,
        context: modelRequestContext,
        runId: input.runId,
        planId: plan.planId,
        question: input.dto.message,
        answerShape: validation.intent.answerShape,
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
      const executionClarification = this.modelPendingClarification(execution.metadata?.clarification);
      const executionTimeRange = this.modelExecutionTimeRange(execution.metadata);
      const executionIntent = executionClarification
        ? {
            ...validation.intent,
            missingSlots: [...new Set([...validation.intent.missingSlots, ...executionClarification.missingSlots])],
            ambiguities: executionClarification.ambiguities,
          }
        : validation.intent;
      await this.recordModelTrace({
        runId: input.runId,
        stepKey: 'model_answer_compose',
        layer: 'response',
        output: this.toJsonValue({ capabilityKey: card.key, capabilityVersion: card.version, planId: plan.planId }),
        status: 'completed',
      });
      const grounded =
        execution.grounding === 'none'
          ? undefined
          : this.groundedAnswerComposer?.composeDomainAnswer(execution, validation.intent);
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
          completion: executionClarification
            ? { status: 'partial', missingCriteria: [...executionClarification.missingSlots], recoverable: true }
            : { status: 'complete', missingCriteria: [], recoverable: false },
          ...(executionTimeRange ? { timeRange: executionTimeRange } : {}),
        },
        modelMetadata: executionMetadata,
        modelContextIntent: executionIntent,
        ...(executionClarification ? { modelContextPendingClarification: executionClarification } : {}),
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
    return validation.issues.every(
      (issue) => issue.code !== 'UNTRUSTED_SECURITY_SCOPE' && issue.code !== 'ENTITY_CONFLICT',
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
    const hasOrderedRankingCue =
      /(?:最好|最多|最少|最高|最低|最快|最慢|排行|排名|top\s*\d*)/i.test(input.question) ||
      /(?:各|每个).*(?:项目|员工|美容师|产品|商品).*(?:毛利|利润|成本|收入|营收|业绩|销售|消耗)/.test(input.question);
    const unorderedListIntent =
      input.intent.intent === 'ranking' &&
      input.intent.metrics.length === 0 &&
      input.intent.orderBy.length === 0 &&
      !hasOrderedRankingCue &&
      matched.intents.includes('query');
    const orderedRankingIntent =
      ['query', 'trend', 'ranking'].includes(input.intent.intent) &&
      hasOrderedRankingCue &&
      matched.intents.includes('ranking');
    const diagnosisIntent =
      input.intent.intent === 'query' &&
      /(?:问题|原因).*(?:在哪|是什么)|为什么/.test(input.question) &&
      matched.intents.includes('diagnosis');
    const paymentBreakdownIntent =
      /(?:现金|微信|支付宝|储值|银行卡).*(?:各多少|分别多少|怎么分|占比)|(?:各多少|分别多少).*(?:现金|微信|支付宝|储值|银行卡)/.test(
        input.question,
      ) && matched.key === 'finance_payment_breakdown';
    const paymentMethodScalarIntent =
      matched.key === 'finance_payment_breakdown' &&
      /(?:现金|微信|支付宝|储值|余额|银行卡|刷卡)/.test(input.question) &&
      /(?:多少|几笔|笔数|金额|收了|消费)/.test(input.question) &&
      !/(?:各|分别|占比|怎么分)/.test(input.question);
    const productMarginRankingIntent =
      /(?:产品|商品|货品).*(?:毛利率|利润率).*(?:最高|最低|排行|排名)|(?:最高|最低|排行|排名).*(?:产品|商品|货品).*(?:毛利率|利润率)/.test(
        input.question,
      ) && matched.key === 'finance_risk_overview';
    const inventoryDisposalGuidanceIntent =
      matched.key === 'inventory_operations_overview' &&
      /(?:一般|通常|平时).*(?:临期|快过期|过期).*(?:怎么|如何|处理)|(?:临期|快过期|过期).*(?:(?:一般|通常).*)?(?:怎么|如何|处理|规定|办法)/.test(
        input.question,
      );
    const sensitiveCareGuidanceIntent =
      matched.key === 'beautician_service_overview' &&
      /(?:皮肤|肤质).*(?:敏感|易敏)|(?:敏感|易敏).*(?:护理方案|项目|护理).*(?:安全|合适)/.test(
        input.question,
      );
    const storedBalanceRiskIntent =
      matched.key === 'finance_risk_overview' &&
      /(?:储值卡|会员余额|储值余额).*(?:余额总计|总余额|合计多少|总计多少).*(?:撑住|都来消费|集中消费)|(?:客户都来消费).*(?:撑住|储值)/.test(
        input.question,
      );
    const staffAvailabilityIntent =
      matched.key === 'front_desk_operations_overview' &&
      /(?:美容师|员工|技师).*(?:在忙|忙吗|还要多久|什么时候空|可接待)/.test(input.question);
    const pendingArrivalListIntent =
      matched.key === 'front_desk_operations_overview' &&
      /(?:预约|客人|客户).*(?:还没到|没到|未到店|待到店)|(?:还没到|没到|未到店|待到店).*(?:预约|客人|客户)/.test(
        input.question,
      );
    const projectIncomeShareIntent =
      matched.key === 'project_margin_analysis' &&
      /(?:各|每个).*(?:项目).*(?:收入|营收).*(?:占比|比例)|(?:项目).*(?:收入|营收).*(?:占比|比例)/.test(
        input.question,
      );
    const cardPackageSalesIntent =
      matched.key === 'finance_risk_overview' &&
      /(?:次卡|套餐卡).*(?:销售|开卡).*(?:金额|多少)|(?:次卡|套餐卡).*(?:卖了多少)/.test(input.question);
    const discountAmountAndRateIntent =
      matched.key === 'finance_risk_overview' &&
      /(?:折扣|优惠).*(?:总金额|金额).*(?:折扣率)|(?:折扣率).*(?:折扣|优惠).*(?:总金额|金额)/.test(
        input.question,
      );
    const refundComparisonIntent =
      matched.key === 'finance_risk_overview' &&
      /(?:退款|退货).*(?:上月|上个月|上一月).*(?:增加|减少|差多少|相比|对比)|(?:本月|这个月).*(?:退款|退货).*(?:上月|上个月).*(?:增加|减少|差多少|相比|对比)/.test(
        input.question,
      );
    const revenueForecastIntent =
      matched.key === 'store_operations_overview' &&
      /(?:预测|预估|预计).*(?:下个季度|下季度|未来季度).*(?:营业额|营收|收入)|(?:下个季度|下季度|未来季度).*(?:营业额|营收|收入).*(?:预测|预估|预计)/.test(
        input.question,
      );
    const customerAttentionListIntent =
      matched.key === 'beautician_service_overview' &&
      /(?:哪个|哪些|有没有).*(?:客人|客户).*(?:难服务|需要注意|注意事项)|(?:客人|客户).*(?:难服务|需要注意|注意事项)/.test(
        input.question,
      );
    const marketingStrategyId = matched.key === 'marketing_strategy_execute_preview'
      ? input.question.match(/(?:营销|触达)策略\s*[#：:]?\s*(\d+)/)?.[1]
      : undefined;
    const normalizedEntities = input.intent.entities.map((entity) =>
      marketingStrategyId && entity.entityType === 'marketing_strategy' && !entity.entityKey
        ? { ...entity, entityKey: marketingStrategyId }
        : entity,
    );
    const entities = marketingStrategyId && !normalizedEntities.some((entity) => entity.entityType === 'marketing_strategy')
      ? [
          ...normalizedEntities,
          {
            entityType: 'marketing_strategy',
            entityKey: marketingStrategyId,
            mention: `营销策略 ${marketingStrategyId}`,
            source: 'user' as const,
            confidence: 1,
          },
        ]
      : normalizedEntities;
    const inferredDimensionKeys = new Set(inferQuestionDimensionDefinitions(input.question));
    const governedDimensions = (matched.definitionRefs ?? [])
      .filter((ref) => inferredDimensionKeys.has(ref.definitionKey))
      .map((ref) => definitionRefFromCard(ref, 'dimension'));
    const supportedDefinitionKeys = new Set((matched.definitionRefs ?? []).map((ref) => ref.definitionKey));
    const supportedInputDimensions = input.intent.dimensions.filter((dimension) =>
      supportedDefinitionKeys.has(dimension.definitionKey),
    );
    const snapshotCustomerNameDimension = customerAttentionListIntent
      ? input.snapshot.dimensions
          .filter((definition) => definition.definitionKey === 'dimension.customerName')
          .map((definition) => this.modelDefinitionRef('dimension', definition))
      : [];
    const dimensions = [
      ...new Map(
        [...supportedInputDimensions, ...governedDimensions, ...snapshotCustomerNameDimension].map((dimension) => [
          dimension.definitionKey,
          dimension,
        ]),
      ).values(),
    ];
    let governedMetrics = inferGovernedQuestionMetricKeys(input.question)
      .flatMap((definitionKey) => (matched.definitionRefs ?? []).filter((ref) => ref.definitionKey === definitionKey))
      .map((ref) => definitionRefFromCard(ref, 'metric'));
    if (paymentMethodScalarIntent && governedMetrics.length === 0) {
      governedMetrics = (matched.definitionRefs ?? [])
        .filter((ref) => ref.definitionKey === 'metric.paid_amount')
        .map((ref) => definitionRefFromCard(ref, 'metric'));
    }
    if (discountAmountAndRateIntent) {
      governedMetrics = (matched.definitionRefs ?? [])
        .filter((ref) => ref.definitionKey === 'metric.discount_amount')
        .map((ref) => definitionRefFromCard(ref, 'metric'));
    }
    if (refundComparisonIntent) {
      governedMetrics = (matched.definitionRefs ?? [])
        .filter((ref) => ref.definitionKey === 'metric.refund_amount')
        .map((ref) => definitionRefFromCard(ref, 'metric'));
    }
    const metrics =
      projectIncomeShareIntent || storedBalanceRiskIntent || staffAvailabilityIntent || pendingArrivalListIntent || cardPackageSalesIntent
        ? []
        : governedMetrics.length
          ? governedMetrics
          : input.intent.metrics;
    const orderBy =
      governedMetrics.length &&
      (input.intent.intent === 'ranking' || orderedRankingIntent || productMarginRankingIntent)
        ? [{ definitionRef: governedMetrics[0]!, direction: 'desc' as const }]
        : input.intent.orderBy;
    return {
      ...input.intent,
      ...(unorderedListIntent ? { intent: 'query' as const, answerShape: 'list' as const } : {}),
      ...(orderedRankingIntent ? { intent: 'ranking' as const, answerShape: 'ranking' as const } : {}),
      ...(diagnosisIntent ? { intent: 'diagnosis' as const, answerShape: 'diagnosis' as const } : {}),
      ...(paymentBreakdownIntent ? { intent: 'query' as const, answerShape: 'list' as const } : {}),
      ...(paymentMethodScalarIntent ? { intent: 'query' as const, answerShape: 'scalar' as const } : {}),
      ...(productMarginRankingIntent ? { intent: 'ranking' as const, answerShape: 'ranking' as const } : {}),
      ...(projectIncomeShareIntent ? { intent: 'ranking' as const, answerShape: 'ranking' as const } : {}),
      ...(inventoryDisposalGuidanceIntent
        ? { intent: 'recommendation' as const, answerShape: 'diagnosis' as const }
        : {}),
      ...(sensitiveCareGuidanceIntent
        ? { intent: 'recommendation' as const, answerShape: 'diagnosis' as const }
        : {}),
      ...(storedBalanceRiskIntent ? { intent: 'diagnosis' as const, answerShape: 'diagnosis' as const } : {}),
      ...(cardPackageSalesIntent || discountAmountAndRateIntent
        ? { intent: 'query' as const, answerShape: 'scalar' as const }
        : {}),
      ...(refundComparisonIntent ? { intent: 'comparison' as const, answerShape: 'comparison' as const } : {}),
      ...(revenueForecastIntent ? { intent: 'diagnosis' as const, answerShape: 'diagnosis' as const } : {}),
      ...(customerAttentionListIntent ? { intent: 'query' as const, answerShape: 'list' as const } : {}),
      ...(staffAvailabilityIntent || pendingArrivalListIntent
        ? { intent: 'query' as const, answerShape: 'list' as const }
        : {}),
      domains: !matched.readOnly ? [...matched.domains] : [...new Set([...modelDomains, ...cardDomains])],
      entities,
      metrics,
      dimensions:
        storedBalanceRiskIntent || staffAvailabilityIntent || pendingArrivalListIntent || cardPackageSalesIntent
          ? []
          : dimensions,
      orderBy,
      filters: [],
      ambiguities: [],
      missingSlots: [],
    };
  }

  private normalizeReadOnlyQuestionIntent(input: {
    intent: BrainSemanticIntent;
    question: string;
    cards: readonly BrainCapabilityCard[];
  }): BrainSemanticIntent {
    const explicitSideEffect = this.hasExplicitSideEffectRequest(input.question);
    if (input.intent.intent !== 'action' && explicitSideEffect) {
      return {
        ...input.intent,
        intent: 'action',
        answerShape: 'action_preview',
        successCriteria: [...input.intent.successCriteria, '生成待确认操作预览，用户确认前不发送消息或写入业务数据'],
        assumptions: [
          ...input.intent.assumptions,
          '用户明确要求发送或执行，按受控动作处理，不把动作请求降级为普通文案。',
        ],
      };
    }
    if (input.intent.intent !== 'action' || explicitSideEffect) return input.intent;
    const candidates = input.cards
      .filter(
        (card) =>
          card.readOnly &&
          !card.sideEffect &&
          card.intents.some((intent) => ['query', 'recommendation', 'diagnosis'].includes(intent)),
      )
      .map((card) => ({ card, score: this.governedCapabilitySemanticScore(input.question, card) }))
      .sort((left, right) => right.score - left.score || left.card.key.localeCompare(right.card.key));
    const matched = candidates[0];
    if (!matched || matched.score < 0.25) return input.intent;

    const asksForRecommendation = /可以|能否|能不能|是否|应该|建议|合适|怎么办|怎么处理/.test(input.question);
    const nextIntent =
      asksForRecommendation && matched.card.intents.includes('recommendation')
        ? 'recommendation'
        : matched.card.intents.includes('query')
          ? 'query'
          : matched.card.intents.includes('recommendation')
            ? 'recommendation'
            : 'diagnosis';
    return {
      ...input.intent,
      intent: nextIntent,
      answerShape: nextIntent === 'query' ? 'list' : 'diagnosis',
      ambiguities: input.intent.ambiguities.filter((item) => item.slot !== 'actionTarget'),
      missingSlots: input.intent.missingSlots.filter((slot) => slot !== 'actionTarget'),
      successCriteria: [
        `使用只读能力 ${matched.card.key} 返回可审计的${nextIntent === 'query' ? '查询结果' : '经营建议'}`,
      ],
      assumptions: [...input.intent.assumptions, '当前问题未请求系统执行副作用，按只读查询或建议处理。'],
    };
  }

  private normalizeGovernedReadOnlyPreviewIntent(input: {
    intent: BrainSemanticIntent;
    question: string;
    cards: readonly BrainCapabilityCard[];
  }): BrainSemanticIntent {
    if (!['action', 'draft', 'recommendation', 'workflow'].includes(input.intent.intent)) return input.intent;
    const matched = input.cards
      .filter(
        (card) =>
          card.readOnly &&
          !card.sideEffect &&
          card.intents.includes('workflow') &&
          input.intent.domains.some((domain) => card.domains.includes(domain)) &&
          (card.grounding === 'preview_action' || card.key.endsWith('_preview')),
      )
      .map((card) => ({ card, score: this.governedCapabilitySemanticScore(input.question, card) }))
      .sort((left, right) => right.score - left.score || left.card.key.localeCompare(right.card.key))[0];
    if (!matched || matched.score < 0.15) return input.intent;
    return this.normalizeReadOnlyPreviewCapabilityIntent(input.intent, matched.card);
  }

  private hasExplicitSideEffectRequest(question: string) {
    const normalized = question.trim();
    return (
      /^(?:(?:帮我|请|直接|立即|马上|替我|给我|能不能|可以|是否可以)\s*)?(?:再\s*)?(?:创建|新建|修改|更新|改约|取消预约|核销|扣次|退款|发送|群发|发放|发布|保存|记录|提交|下单|采购|安排预约|完成服务|开始服务|结束服务|(?:加|安排|插入|塞)(?:一个|一位)?(?:客人|客户))/.test(
        normalized,
      ) || /^(?:给|向).{0,20}发(?:个|一条)?.{0,12}(?:通知|消息|短信)/.test(normalized)
    );
  }

  private modelIntentTraceSummary(intent: BrainSemanticIntent) {
    return {
      schemaVersion: intent.schemaVersion,
      intent: intent.intent,
      answerShape: intent.answerShape,
      domains: [...intent.domains],
      metricKeys: intent.metrics.map((item) => item.definitionKey),
      dimensionKeys: intent.dimensions.map((item) => item.definitionKey),
      entityTypes: intent.entities.map((item) => item.entityType),
      missingSlots: [...intent.missingSlots],
      ambiguities: intent.ambiguities.map((item) => ({ slot: item.slot, reason: item.reason })),
    };
  }

  private normalizeGovernedCapabilityContractIntent(input: {
    intent: BrainSemanticIntent;
    question: string;
    cards: readonly BrainCapabilityCard[];
  }): BrainSemanticIntent {
    input = {
      ...input,
      intent: this.enrichGovernedQuestionMetricIntent(input.intent, input.question, input.cards),
    };
    if (input.intent.intent === 'workflow') return this.normalizeGovernedWorkflowIntent(input);
    const requestedSlots = new Set([
      ...input.intent.missingSlots.map((slot) => slot.trim().toLowerCase()),
      ...input.intent.ambiguities.map((ambiguity) => ambiguity.slot.trim().toLowerCase()),
    ]);
    const requestedDefinitionKeys = new Set([
      ...input.intent.metrics.map((metric) => metric.definitionKey),
      ...input.intent.dimensions.map((dimension) => dimension.definitionKey),
      ...input.intent.entities.flatMap((entity) =>
        entity.definitionRef ? [entity.definitionRef.definitionKey] : [],
      ),
    ]);
    const contractMayResolveModelExpansion =
      ['action', 'draft', 'recommendation', 'diagnosis'].includes(input.intent.intent) ||
      requestedDefinitionKeys.size > 0;
    if (
      (!requestedSlots.size && !contractMayResolveModelExpansion) ||
      this.hasProtectedCapabilityClarification(input.intent)
    ) {
      return input.intent;
    }
    const isAction = input.intent.intent === 'action';
    const isDraft = input.intent.intent === 'draft';
    const candidates = input.cards
      .filter(
        (card) =>
          (isAction
            ? !card.readOnly && card.sideEffect && card.requiresConfirmation && card.intents.includes('action')
            : card.readOnly) &&
          (isAction
            ? input.intent.domains.every((domain) => card.domains.includes(domain))
            : input.intent.domains.some((domain) => card.domains.includes(domain))) &&
          (card.intents.includes(input.intent.intent) ||
            (input.intent.intent === 'ranking' && card.intents.includes('query'))),
      )
      .map((card) => {
        const supportedDefinitions = new Set((card.definitionRefs ?? []).map((ref) => ref.definitionKey));
        const supportedRequestedCount = [...requestedDefinitionKeys].filter((definitionKey) =>
          supportedDefinitions.has(definitionKey),
        ).length;
        return {
          card,
          score: this.governedCapabilitySemanticScore(input.question, card),
          supportedDomainCount: input.intent.domains.filter((domain) => card.domains.includes(domain)).length,
          unsupportedDomainCount: input.intent.domains.filter((domain) => !card.domains.includes(domain)).length,
          supportedRequestedCount,
          unsupportedRequestedCount: requestedDefinitionKeys.size - supportedRequestedCount,
          intentBreadth: card.intents.length,
        };
      })
      .sort((left, right) => right.score - left.score || left.card.key.localeCompare(right.card.key));
    const definitionCandidates =
      requestedDefinitionKeys.size > 0
        ? [...candidates].sort(
            (left, right) =>
              right.supportedRequestedCount - left.supportedRequestedCount ||
              left.unsupportedRequestedCount - right.unsupportedRequestedCount ||
              left.intentBreadth - right.intentBreadth ||
              right.score - left.score ||
              left.card.key.localeCompare(right.card.key),
          )
        : [];
    const definitionMatched =
      definitionCandidates[0]?.supportedRequestedCount > 0 &&
      (!definitionCandidates[1] ||
        definitionCandidates[0].supportedRequestedCount !== definitionCandidates[1].supportedRequestedCount ||
        definitionCandidates[0].unsupportedRequestedCount !== definitionCandidates[1].unsupportedRequestedCount ||
        definitionCandidates[0].intentBreadth !== definitionCandidates[1].intentBreadth)
        ? definitionCandidates[0]
        : undefined;
    const specificityCandidates = ['recommendation', 'diagnosis'].includes(input.intent.intent)
      ? [...candidates].sort(
          (left, right) =>
            left.intentBreadth - right.intentBreadth ||
            right.score - left.score ||
            left.card.key.localeCompare(right.card.key),
        )
      : [];
    const specificityMatched =
      specificityCandidates[0] &&
      (!specificityCandidates[1] || specificityCandidates[0].intentBreadth < specificityCandidates[1].intentBreadth)
        ? specificityCandidates[0]
        : undefined;
    const domainCandidates = [...candidates].sort(
      (left, right) =>
        right.supportedDomainCount - left.supportedDomainCount ||
        left.unsupportedDomainCount - right.unsupportedDomainCount ||
        right.score - left.score ||
        left.intentBreadth - right.intentBreadth ||
        left.card.key.localeCompare(right.card.key),
    );
    const domainMatched =
      domainCandidates[0] &&
      domainCandidates[0].supportedDomainCount > 0 &&
      (!domainCandidates[1] ||
        domainCandidates[0].supportedDomainCount > domainCandidates[1].supportedDomainCount ||
        domainCandidates[0].unsupportedDomainCount < domainCandidates[1].unsupportedDomainCount)
        ? domainCandidates[0]
        : undefined;
    const matched = definitionMatched ?? domainMatched ?? specificityMatched ?? candidates[0];
    const margin = matched ? matched.score - (candidates.find((candidate) => candidate !== matched)?.score ?? 0) : 0;
    const governedSingleIntentCapability = (isAction || isDraft) && candidates.length === 1;
    if (
      !matched ||
      (!governedSingleIntentCapability &&
        !definitionMatched &&
        !domainMatched &&
        !specificityMatched &&
        (matched.score < 0.68 || (matched.score < 0.82 && margin < 0.08)))
    )
      return input.intent;

    const supportedDefinitions = new Set((matched.card.definitionRefs ?? []).map((ref) => ref.definitionKey));
    const supportedInputDomains = input.intent.domains.filter((domain) => matched.card.domains.includes(domain));
    const supportedInputMetrics = input.intent.metrics.filter((metric) =>
      supportedDefinitions.has(metric.definitionKey),
    );
    const inferredMetrics = inferGovernedQuestionMetricKeys(input.question)
      .flatMap((definitionKey) =>
        (matched.card.definitionRefs ?? []).filter((ref) => ref.definitionKey === definitionKey),
      )
      .map((ref) => definitionRefFromCard(ref, 'metric'));
    const metrics = supportedInputMetrics.length > 0 ? supportedInputMetrics : inferredMetrics;
    const removedMetricKeys = new Set(
      input.intent.metrics
        .filter((metric) => !supportedDefinitions.has(metric.definitionKey))
        .map((metric) => metric.definitionKey),
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
    const supportedInputDimensions = input.intent.dimensions.filter((dimension) =>
      supportedDefinitions.has(dimension.definitionKey),
    );
    const dimensions =
      supportedInputDimensions.length > 0
        ? supportedInputDimensions
        : ['list', 'ranking'].includes(input.intent.answerShape)
          ? governedDimensions
          : supportedInputDimensions;
    const entities = [...input.intent.entities]
      .sort((left, right) => right.confidence - left.confidence)
      .filter((entity, index, values) => {
        const mention = this.normalizeGovernedExampleText(entity.mention);
        return (
          values.findIndex((candidate) => this.normalizeGovernedExampleText(candidate.mention) === mention) === index
        );
      });
    const explicitRankingCue =
      /(?:排行|排名|最好|最多|最少|最高|最低|第一|top\s*\d*)/i.test(input.question) ||
      /(?:各|每个).*(?:项目|员工|美容师|产品|商品).*(?:毛利|利润|成本|收入|营收|业绩|销售|消耗)/.test(input.question);
    const implicitRankingContract =
      input.intent.intent === 'ranking' &&
      matched.card.intents.includes('ranking') &&
      (metrics.length > 0 || orderBy.length > 0 || explicitRankingCue);
    const unorderedList =
      input.intent.intent === 'ranking' && metrics.length === 0 && orderBy.length === 0 && !implicitRankingContract;
    return {
      ...input.intent,
      ...(unorderedList ? { intent: 'query' as const, answerShape: 'list' as const } : {}),
      domains: supportedInputDomains.length ? supportedInputDomains : [...matched.card.domains],
      metrics,
      dimensions,
      entities,
      orderBy,
      ambiguities: [],
      missingSlots: [],
      assumptions: [...input.intent.assumptions, `能力 ${matched.card.key} 将采用并披露已治理的默认分析口径。`],
    };
  }

  private enrichGovernedQuestionMetricIntent(
    intent: BrainSemanticIntent,
    question: string,
    cards: readonly BrainCapabilityCard[],
  ): BrainSemanticIntent {
    const existing = new Map(intent.metrics.map((metric) => [metric.definitionKey, metric]));
    for (const definitionKey of inferGovernedQuestionMetricKeys(question)) {
      if (existing.has(definitionKey)) continue;
      const candidates = [
        ...new Map(
          cards
            .flatMap((card) => card.definitionRefs)
            .filter((ref) => ref.definitionKey === definitionKey)
            .map((ref) => [
              `${ref.definitionKey}:${ref.version}:${ref.definitionFingerprint}:${ref.sourceFingerprint}`,
              ref,
            ]),
        ).values(),
      ];
      if (candidates.length !== 1) continue;
      existing.set(definitionKey, definitionRefFromCard(candidates[0]!, 'metric'));
    }
    return existing.size === intent.metrics.length ? intent : { ...intent, metrics: [...existing.values()] };
  }

  private normalizeModelClarificationIntent(intent: BrainSemanticIntent, question: string): BrainSemanticIntent {
    const governedCustomerAttentionLookup =
      /(?:哪个|哪些|有没有).*(?:客人|客户).*(?:难服务|需要注意|注意事项)|(?:客人|客户).*(?:难服务|需要注意|注意事项)/.test(
        question,
      );
    if (governedCustomerAttentionLookup) {
      return {
        ...intent,
        intent: 'query',
        entities: [],
        answerShape: 'list',
        ambiguities: [],
        missingSlots: [],
        successCriteria: [
          '仅返回预约客户档案中已记录的过敏、肤质、皮肤状态、服务备注和特殊要求，不给客户贴主观标签',
        ],
        assumptions: [
          ...intent.assumptions,
          '“难服务”按治理规则改写为可审计的客户注意事项查询，不要求用户确认内部改写。',
        ],
      };
    }
    const vagueTransactionLookup =
      /(?:某笔|这笔|一笔).*(?:交易|支付|收款).*(?:完整流水|流水|明细)|(?:完整流水|交易流水).*(?:某笔|这笔|一笔)/.test(
        question,
      ) && !/(?:订单号|交易号|支付单号|流水号|order|payment)[\s:#：-]*[A-Za-z0-9-]{4,}/i.test(question);
    if (vagueTransactionLookup) {
      return {
        ...intent,
        domains: [],
        intent: 'clarify',
        entities: [],
        metrics: [],
        dimensions: [],
        filters: [],
        orderBy: [],
        answerShape: 'clarification',
        ambiguities: [{ slot: 'entity', reason: '缺少可唯一定位交易的订单号、交易号或支付单号', candidates: [] }],
        missingSlots: ['entity'],
        assumptions: [...intent.assumptions, '完整交易流水必须先唯一定位交易，不能用全店财务概览替代。'],
      };
    }
    if (/(?:生成|做|出).*(?:完整).*(?:年度|全年).*(?:运营|经营).*(?:报告|总结)|(?:完整).*(?:年度|全年).*(?:运营|经营).*(?:报告|总结)/.test(question)) {
      return {
        ...intent,
        domains: [],
        intent: 'clarify',
        entities: [],
        metrics: [],
        dimensions: [],
        filters: [],
        orderBy: [],
        answerShape: 'clarification',
        ambiguities: [
          {
            slot: 'objective',
            reason: '完整年度运营报告需要先确认年度、经营范围、对比基准和输出重点',
            candidates: ['年度经营总览', '财务与利润', '客户与营销', '员工与服务', '库存与采购'],
          },
        ],
        missingSlots: ['objective'],
        assumptions: [...intent.assumptions, '复杂年度报告必须先确认范围，不能用单期门店概览冒充完整报告。'],
      };
    }
    if (intent.intent !== 'clarify') return intent;
    const allowedSlots = new Set([
      'objective',
      'entity',
      'metric',
      'dimension',
      'timeRange',
      'comparisonTarget',
      'comparisonEntities',
      'orderBy',
      'actionTarget',
      'successCriteria',
    ]);
    const missingSlots = [
      ...intent.missingSlots.filter((slot) => allowedSlots.has(slot)),
      ...intent.ambiguities.map((ambiguity) => ambiguity.slot).filter((slot) => allowedSlots.has(slot)),
    ];
    return {
      ...intent,
      domains: [],
      entities: intent.entities.filter((entity) => Boolean(entity.definitionRef)),
      answerShape: 'clarification',
      missingSlots: [...new Set(missingSlots.length ? missingSlots : ['objective'])],
    };
  }

  private normalizeConversationContinuationIntent(input: {
    intent: BrainSemanticIntent;
    question: string;
    conversationSlots: Record<string, unknown>;
    cards: readonly BrainCapabilityCard[];
  }): BrainSemanticIntent {
    const presentationNormalized = this.normalizeConversationPresentationIntent(input);
    return this.normalizeConversationTimeIntent({
      intent: presentationNormalized,
      conversationSlots: input.conversationSlots,
    });
  }

  private normalizeConversationPresentationIntent(input: {
    intent: BrainSemanticIntent;
    question: string;
    conversationSlots: Record<string, unknown>;
    cards: readonly BrainCapabilityCard[];
  }): BrainSemanticIntent {
    if (!/(?:不要表格.*(?:文字|说)|用文字说|简单说|说重点|简洁一点|太复杂)/.test(input.question)) {
      return input.intent;
    }
    const modelContext = this.modelContextRecord(input.conversationSlots.modelContext);
    const previousIntent = BRAIN_SEMANTIC_INTENTS.includes(modelContext.intent as never)
      ? (modelContext.intent as BrainSemanticIntent['intent'])
      : undefined;
    const previousAnswerShape = BRAIN_SEMANTIC_ANSWER_SHAPES.includes(modelContext.answerShape as never)
      ? (modelContext.answerShape as BrainSemanticIntent['answerShape'])
      : undefined;
    if (!previousIntent || !previousAnswerShape || typeof modelContext.objective !== 'string') return input.intent;

    const capability = this.modelContextRecord(modelContext.capability);
    const card =
      typeof capability.key === 'string'
        ? input.cards.find((candidate) => candidate.key === capability.key)
        : undefined;
    const metrics = Array.isArray(modelContext.metrics)
      ? modelContext.metrics.filter((value): value is BrainSemanticIntent['metrics'][number] =>
          Boolean(value && typeof value === 'object'),
        )
      : [];
    const dimensions = Array.isArray(modelContext.dimensions)
      ? modelContext.dimensions.filter((value): value is BrainSemanticIntent['dimensions'][number] =>
          Boolean(value && typeof value === 'object'),
        )
      : [];
    const entities = Array.isArray(modelContext.entities)
      ? modelContext.entities.filter((value): value is BrainSemanticIntent['entities'][number] =>
          Boolean(value && typeof value === 'object'),
        )
      : [];
    const timeRange = this.modelContextTimeRange(modelContext.timeRange);
    return {
      ...input.intent,
      objective: modelContext.objective,
      domains: card?.domains.length ? [...card.domains] : input.intent.domains,
      intent: previousIntent,
      answerShape: previousAnswerShape,
      metrics: metrics.map((value) => ({ ...value })),
      dimensions: dimensions.map((value) => ({ ...value })),
      entities: entities.map((value) => ({
        ...value,
        source: 'conversation',
        ...(value.definitionRef ? { definitionRef: { ...value.definitionRef } } : {}),
      })),
      ...(timeRange ? { timeRange } : {}),
      ambiguities: [],
      missingSlots: [],
      assumptions: [
        ...input.intent.assumptions,
        /简单说|说重点|简洁一点|太复杂/.test(input.question)
          ? '沿用上一轮业务目标，仅调整为简洁重点表达。'
          : '沿用上一轮业务目标，以文本叙述表达结构化结果。',
      ],
      successCriteria: [...input.intent.successCriteria, '保持上一轮事实口径和范围，不因表达方式变化而改写查询目标'],
    };
  }

  private normalizeConversationTimeIntent(input: {
    intent: BrainSemanticIntent;
    conversationSlots: Record<string, unknown>;
  }): BrainSemanticIntent {
    const directives = this.modelContextRecord(input.conversationSlots.turnDirectives);
    const replace = this.modelContextRecord(directives.replace);
    const replacement = this.modelContextTimeRange(replace.timeRange);
    if (replacement) return { ...input.intent, timeRange: replacement };

    const inherit = Array.isArray(directives.inherit) ? directives.inherit : [];
    if (!inherit.includes('timeRange')) return input.intent;
    const modelContext = this.modelContextRecord(input.conversationSlots.modelContext);
    const inherited = this.modelContextTimeRange(modelContext.timeRange);
    return inherited ? { ...input.intent, timeRange: inherited } : input.intent;
  }

  private normalizeQuestionPeriodTimeIntent(input: {
    intent: BrainSemanticIntent;
    question: string;
    timezone: 'Asia/Shanghai' | 'UTC';
  }): BrainSemanticIntent {
    if (!/(?:最近|过去|近)\s*[一二三四五六七八九十\d]{1,3}\s*(?:天|个月|年)/.test(input.question)) {
      return input.intent;
    }
    const parsed = this.timeRangeParser.parse(input.question);
    if (!parsed.range || parsed.requiresComparison || parsed.unsupportedExpressions.length > 0) return input.intent;
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: input.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return {
      ...input.intent,
      timeRange: {
        label: parsed.range.label,
        startDate: formatter.format(parsed.range.startDate),
        endDate: formatter.format(parsed.range.endDate),
        timezone: input.timezone,
      },
      missingSlots: input.intent.missingSlots.filter((slot) => slot !== 'timeRange'),
    };
  }

  private normalizeUnboundReferenceIntent(input: {
    intent: BrainSemanticIntent;
    question: string;
    conversationSlots: Record<string, unknown>;
  }): BrainSemanticIntent {
    const hasUnboundReference =
      /(?:这个|那个)(?:数据|情况|指标|报表|问题|结果|方案|对象|记录)/.test(input.question) ||
      /(?:帮我看看|处理一下|分析一下)?(?:这个|那个)(?:[，。？！?]|$)/.test(input.question) ||
      /(?:按|照)?(?:之前|刚才|上面|前面)(?:的)?(?:那个|这个|数据|结果|方案|口径|操作)/.test(input.question);
    if (!hasUnboundReference || this.hasModelReferenceContext(input.conversationSlots)) return input.intent;
    const missingSlot = /数据|指标|报表|记录/.test(input.question) ? 'entity' : 'objective';
    const reason = '指代内容未绑定到当前会话中的业务对象、指标、报表或上一轮结果。';
    return {
      ...input.intent,
      domains: [],
      entities: [],
      metrics: [],
      dimensions: [],
      orderBy: [],
      missingSlots: [...new Set([...input.intent.missingSlots, missingSlot])],
      ambiguities: [
        ...input.intent.ambiguities.filter((ambiguity) => ambiguity.slot !== missingSlot),
        { slot: missingSlot, reason, candidates: [] },
      ],
      assumptions: input.intent.assumptions.filter((assumption) => !assumption.startsWith('能力 ')),
      confidence: Math.min(input.intent.confidence, 0.55),
    };
  }

  private hasModelReferenceContext(conversationSlots: Record<string, unknown>): boolean {
    const modelContext = this.modelContextRecord(conversationSlots.modelContext);
    if (typeof modelContext.objective === 'string' && modelContext.objective.trim()) return true;
    if (modelContext.capability && typeof modelContext.capability === 'object') return true;
    for (const key of ['definitionRefs', 'entities', 'metrics', 'dimensions']) {
      if (Array.isArray(modelContext[key]) && modelContext[key].length > 0) return true;
    }
    return false;
  }

  private normalizeConversationEntityInheritance(input: {
    intent: BrainSemanticIntent;
    question: string;
    conversationSlots: Record<string, unknown>;
  }): BrainSemanticIntent {
    if (!/(?:她|他|这个客人|这个客户|这位客人|这位客户)/.test(input.question)) return input.intent;
    const directives = this.modelContextRecord(input.conversationSlots.turnDirectives);
    const inherit = Array.isArray(directives.inherit) ? directives.inherit : [];
    const doNotInherit = Array.isArray(directives.doNotInherit) ? directives.doNotInherit : [];
    if (!inherit.includes('entities') || doNotInherit.includes('entities')) return input.intent;
    if (
      input.intent.entities.some((entity) => entity.entityType === 'customer' && this.isSpecificModelEntity(entity))
    ) {
      return input.intent;
    }

    const modelContext = this.modelContextRecord(input.conversationSlots.modelContext);
    const previousEntities = Array.isArray(modelContext.entities)
      ? modelContext.entities.filter((entity): entity is BrainSemanticIntent['entities'][number] =>
          Boolean(entity && typeof entity === 'object' && !Array.isArray(entity)),
        )
      : [];
    const customer = previousEntities.find(
      (entity) =>
        entity.entityType === 'customer' &&
        entity.definitionRef?.definitionKey === 'entity.customer' &&
        this.isSpecificModelEntity(entity),
    );
    if (!customer) return input.intent;

    return {
      ...input.intent,
      entities: [
        ...input.intent.entities.filter(
          (entity) => entity.entityType !== 'customer' || this.isSpecificModelEntity(entity),
        ),
        {
          ...customer,
          source: 'conversation',
          confidence: Math.max(0.95, customer.confidence),
          ...(customer.definitionRef ? { definitionRef: { ...customer.definitionRef } } : {}),
        },
      ],
      missingSlots: input.intent.missingSlots.filter((slot) => slot !== 'entity'),
      ambiguities: input.intent.ambiguities.filter((ambiguity) => ambiguity.slot !== 'entity'),
      assumptions: [...input.intent.assumptions, `客户身份沿用上一轮已确认对象：${customer.mention}。`],
    };
  }

  private normalizeConversationResultReferenceIntent(input: {
    intent: BrainSemanticIntent;
    question: string;
    conversationSlots: Record<string, unknown>;
  }): BrainSemanticIntent {
    if (!this.resultReferenceService.isFollowUpReferenceQuestion(input.question)) return input.intent;
    const resultSets = this.modelContextResultSets(input.conversationSlots);
    const resolved = this.resultReferenceService.resolveReference({
      question: input.question,
      resultSets,
    });
    if (!resolved?.reference) return input.intent;
    const entity = this.resultReferenceService.toConversationEntity(resolved.reference);
    if (!entity) return input.intent;
    const alreadyResolved = input.intent.entities.some(
      (candidate) =>
        candidate.entityType === entity.entityType &&
        candidate.entityKey === entity.entityKey &&
        this.isSpecificModelEntity(candidate),
    );
    if (alreadyResolved) return input.intent;
    return {
      ...input.intent,
      entities: [
        ...input.intent.entities.filter(
          (candidate) => candidate.entityType !== entity.entityType || this.isSpecificModelEntity(candidate),
        ),
        entity,
      ],
      missingSlots: input.intent.missingSlots.filter((slot) => slot !== 'entity' && slot !== 'actionTarget'),
      ambiguities: input.intent.ambiguities.filter(
        (ambiguity) => ambiguity.slot !== 'entity' && ambiguity.slot !== 'actionTarget',
      ),
      assumptions: [
        ...input.intent.assumptions,
        `对象来自上轮受控结果引用 ${resolved.reference.refId}：${resolved.reference.mention}。`,
      ],
    };
  }

  private answerFromConversationResultReference(input: {
    intent: BrainSemanticIntent;
    question: string;
    conversationSlots: Record<string, unknown>;
    cards: readonly BrainCapabilityCard[];
    modelMetadata: BrainModelMetadata;
  }): BrainChatAnswer | undefined {
    if (!this.resultReferenceService.isFollowUpReferenceQuestion(input.question)) return undefined;
    const resultSets = this.modelContextResultSets(input.conversationSlots);
    const resolved = this.resultReferenceService.resolveReference({
      question: input.question,
      resultSets,
    });
    if (!resolved) return undefined;

    if (
      resolved.set.status === 'empty' &&
      resolved.set.entityType === 'customer' &&
      /(?:(?:其中|这些|预约).*(?:(?:vip|高等级).*(?:几个|多少|数量)|(?:几个|多少|数量).*(?:vip|高等级))|(?:vip|高等级).*(?:几个|多少|数量)|(?:几个|多少|数量).*(?:vip|高等级))/i.test(
        input.question,
      )
    ) {
      const answer =
        '上一轮查询结果中没有预约客户，因此其中 VIP 客户数量确定为 0。这个结论来自空集合，不依赖 VIP 等级映射；当预约列表不为空时，仍需管理端发布统一 VIP 等级规则后才能分类。';
      return {
        status: 'completed',
        answer,
        citations: [
          {
            sourceType: 'brain_run',
            sourceId: String(resolved.set.sourceRunId),
            label: '上轮预约客户查询结果',
          },
        ],
        suggestedActions: [],
        blocks: [
          {
            kind: 'kpi',
            items: [{ label: '预约中的 VIP 客户', value: '0 人' }],
            citationIds: [String(resolved.set.sourceRunId)],
          },
          { kind: 'limitations', items: ['非空预约集合仍需统一 VIP 等级映射后才能分类。'] },
        ],
        grounding: 'db_skill',
        adapterMetadata: {
          decisionCode: 'empty_customer_set_vip_count_zero',
          sourceResultSet: resolved.set,
          completion: { status: 'complete', missingCriteria: [], recoverable: false },
        },
        modelMetadata: input.modelMetadata,
        modelContextIntent: input.intent,
        modelContextResultSets: resultSets,
      };
    }

    if (
      resolved.set.status === 'empty' &&
      resolved.set.entityType === 'product' &&
      /(?:活动|促销|搭配|消化|处理|推荐)/.test(input.question)
    ) {
      const answer =
        '上一轮查询确认当前范围没有临期产品，因此现在不需要为临期库存设计消化活动。Ami Brain 不会拿普通库存或低库存商品冒充临期商品。后续出现临期批次时，可再基于商品、到期日、库存价值和毛利约束生成活动草稿。';
      return {
        status: 'completed',
        answer,
        citations: [
          {
            sourceType: 'brain_run',
            sourceId: String(resolved.set.sourceRunId),
            label: '上轮临期库存查询结果',
          },
        ],
        suggestedActions: [],
        blocks: [
          { kind: 'text', text: answer, citationIds: [String(resolved.set.sourceRunId)] },
          { kind: 'limitations', items: ['当前临期商品集合为空，本轮没有生成活动草稿、发布活动或发送消息。'] },
        ],
        grounding: 'db_skill',
        adapterMetadata: {
          decisionCode: 'expiring_inventory_empty_no_campaign_needed',
          sourceResultSet: resolved.set,
          completion: { status: 'complete', missingCriteria: [], recoverable: false },
        },
        modelMetadata: input.modelMetadata,
        modelContextIntent: input.intent,
        modelContextResultSets: resultSets,
      };
    }

    if (
      input.intent.intent === 'action' &&
      resolved.set.entityType === 'customer' &&
      /(?:给|向).*(?:她们|他们|这些客户|这批客户|客户).*(?:发|发送|群发).*(?:召回|消息|短信)|(?:群发|发送).*(?:召回|消息|短信).*(?:她们|他们|这些客户|这批客户)/.test(
        input.question,
      )
    ) {
      const answer = `已识别你指的是上轮查询得到的客户集合，当前结果引用包含 ${resolved.set.count} 位已展示客户。现有营销执行平台不支持把任意查询结果直接作为群发对象；必须先形成受治理客群或启用营销策略，再进入发送审批和回执链路。本轮没有发送消息。`;
      return {
        status: 'completed',
        answer,
        citations: [
          {
            sourceType: 'brain_result_ref',
            sourceId: resolved.set.setId,
            label: '上轮客户查询结果集',
          },
        ],
        suggestedActions: [],
        blocks: [
          { kind: 'text', text: answer, citationIds: [resolved.set.setId] },
          {
            kind: 'limitations',
            items: ['缺少任意查询客群到营销发送任务的受治理转换合同，本轮没有创建触达草稿或发送任务。'],
          },
        ],
        grounding: 'db_skill',
        adapterMetadata: {
          unsupportedReason: 'arbitrary_result_set_bulk_touch_not_available',
          sourceResultSet: resolved.set,
          completion: { status: 'complete', missingCriteria: [], recoverable: false },
        },
        modelMetadata: input.modelMetadata,
        modelContextIntent: input.intent,
        modelContextResultSets: resultSets,
      };
    }

    if (
      input.intent.intent === 'action' &&
      resolved.reference?.entityType === 'beautician' &&
      /(?:发|发送).*(?:鼓励|通知|消息)|(?:鼓励|通知|消息).*(?:发|发送)/.test(input.question)
    ) {
      const answer = `已确认你指的是上轮排行中的 ${resolved.reference.mention}。当前管理端和后端没有员工内部通知或消息发送业务能力，因此 Ami Brain 不能生成可执行通知预览，也没有发送任何消息。`;
      return {
        status: 'completed',
        answer,
        citations: [
          {
            sourceType: 'brain_result_ref',
            sourceId: resolved.reference.refId,
            label: `上轮排行结果：${resolved.reference.mention}`,
          },
        ],
        suggestedActions: [],
        blocks: [
          { kind: 'text', text: answer, citationIds: [resolved.reference.refId] },
          { kind: 'limitations', items: ['缺少员工消息发送业务对象、发送接口和送达回执，本轮只完成对象解析。'] },
        ],
        grounding: 'db_skill',
        adapterMetadata: {
          unsupportedReason: 'employee_notification_action_not_available',
          resolvedResultRef: resolved.reference,
          sourceResultSet: resolved.set,
          completion: { status: 'complete', missingCriteria: [], recoverable: false },
        },
        modelMetadata: input.modelMetadata,
        modelContextIntent: input.intent,
        modelContextResultSets: resultSets,
      };
    }
    return undefined;
  }

  private answerFromUnsafeActionAmbiguity(input: {
    intent: BrainSemanticIntent;
    question: string;
    modelMetadata: BrainModelMetadata;
  }): BrainChatAnswer | undefined {
    if (!['action', 'workflow'].includes(input.intent.intent)) return undefined;
    const requestsGapInsertion = /(?:加|安排|塞|插入).*(?:客人|客户)|(?:客人|客户).*(?:加|安排|塞|插入)/.test(
      input.question,
    );
    if (!requestsGapInsertion) return undefined;

    const hasSpecificCustomer = input.intent.entities.some(
      (entity) => this.isModelEntityType(entity.entityType, 'customer') && this.isSpecificModelEntity(entity),
    );
    const hasSpecificTargetTime = /(?:\d{1,2}\s*[:：]\s*\d{2}|上午|下午|晚上|晚间)\s*\d{0,2}/.test(input.question);
    const hasSpecificProject = input.intent.entities.some(
      (entity) => this.isModelEntityType(entity.entityType, 'project') && this.isSpecificModelEntity(entity),
    );
    if (hasSpecificCustomer && hasSpecificTargetTime && hasSpecificProject) return undefined;

    const missingSlots = [
      ...(!hasSpecificCustomer ? ['customer'] : []),
      ...(!hasSpecificProject ? ['project'] : []),
      ...(!hasSpecificTargetTime ? ['targetTime'] : []),
    ];
    const question = '可以先生成加客预览，但需要你确认客户、服务项目和目标空档时段。请先补充这三项中的缺失信息。';
    const pendingClarification: BrainModelPendingClarification = {
      missingSlots,
      questions: [question],
      ambiguities: missingSlots.map((slot) => ({
        slot,
        reason: `${slot} 尚未绑定到明确业务对象`,
        candidates: [],
      })),
    };
    const clarifiedIntent: BrainSemanticIntent = {
      ...input.intent,
      answerShape: 'clarification',
      missingSlots: [...new Set([...input.intent.missingSlots, ...missingSlots])],
      ambiguities: [
        ...input.intent.ambiguities,
        ...pendingClarification.ambiguities.filter(
          (ambiguity) => !input.intent.ambiguities.some((current) => current.slot === ambiguity.slot),
        ),
      ],
    };
    return {
      status: 'completed',
      answer: question,
      citations: [],
      suggestedActions: [],
      blocks: [
        {
          kind: 'clarification',
          question,
          options: [
            { id: 'provide_customer', label: '指定客户', value: 'provide_customer' },
            { id: 'provide_project', label: '指定项目', value: 'provide_project' },
            { id: 'provide_target_time', label: '指定空档时段', value: 'provide_target_time' },
          ],
        },
      ],
      grounding: 'none',
      adapterMetadata: {
        decisionCode: 'reservation_gap_add_customer_clarification_required',
        completion: { status: 'partial', missingCriteria: missingSlots, recoverable: true },
      },
      modelMetadata: input.modelMetadata,
      modelContextIntent: clarifiedIntent,
      modelContextPendingClarification: pendingClarification,
    };
  }

  private answerFromSemanticClarificationIntent(input: {
    intent: BrainSemanticIntent;
    modelMetadata: BrainModelMetadata;
  }): BrainChatAnswer | undefined {
    if (input.intent.intent !== 'clarify') return undefined;
    const ambiguities = input.intent.ambiguities.map((ambiguity) => ({
      ...ambiguity,
      candidates: [...ambiguity.candidates],
    }));
    const missingSlots = [...new Set(input.intent.missingSlots.length ? input.intent.missingSlots : ['objective'])];
    const reason = ambiguities[0]?.reason?.trim();
    const question = reason
      ? `需要先确认：${reason.replace(/[。！？!?]+$/u, '')}。请补充后我再继续。`
      : '请补充你想检查的业务范围、对象或时间，我再继续。';
    const options = this.modelClarificationOptions(ambiguities);
    const pendingClarification: BrainModelPendingClarification = {
      missingSlots,
      questions: [question],
      ambiguities,
    };
    return {
      status: 'completed',
      answer: question,
      citations: [],
      suggestedActions: [],
      blocks: [{ kind: 'clarification', question, options }],
      grounding: 'none',
      adapterMetadata: {
        decisionCode: 'semantic_clarification_required',
        clarification: pendingClarification,
        completion: { status: 'partial', missingCriteria: missingSlots, recoverable: true },
      },
      modelContextIntent: input.intent,
      modelContextPendingClarification: pendingClarification,
      modelMetadata: input.modelMetadata,
    };
  }

  private answerFromGenericQuestionAmbiguity(input: {
    intent: BrainSemanticIntent;
    question: string;
    modelMetadata: BrainModelMetadata;
  }): BrainChatAnswer | undefined {
    const normalized = input.question.trim().replace(/[\s？?。！!]+/g, '');
    if (!['有什么问题吗', '有什么问题', '有问题吗'].includes(normalized)) return undefined;

    const question =
      '为了准确处理，请补充要检查的业务范围：门店经营、财务、库存、预约现场、客户经营或员工运营。';
    const options = [
      { id: 'objective:store_operations', label: '门店经营风险', value: { slot: 'objective', candidate: '门店经营风险' } },
      { id: 'objective:finance_risk', label: '财务与退款风险', value: { slot: 'objective', candidate: '财务与退款风险' } },
      { id: 'objective:inventory_risk', label: '库存风险', value: { slot: 'objective', candidate: '库存风险' } },
    ];
    const pendingClarification: BrainModelPendingClarification = {
      missingSlots: ['objective'],
      questions: [question],
      ambiguities: [
        {
          slot: 'objective',
          reason: '问题未指明业务域、对象或时间范围',
          candidates: options.map((option) => option.label),
        },
      ],
    };
    const clarifiedIntent: BrainSemanticIntent = {
      ...input.intent,
      intent: 'clarify',
      answerShape: 'clarification',
      domains: [],
      metrics: [],
      dimensions: [],
      orderBy: [],
      missingSlots: ['objective'],
      ambiguities: pendingClarification.ambiguities,
    };
    return {
      status: 'completed',
      answer: question,
      citations: [],
      suggestedActions: [],
      blocks: [{ kind: 'clarification', question, options }],
      grounding: 'none',
      adapterMetadata: {
        decisionCode: 'generic_objective_clarification_required',
        completion: { status: 'partial', missingCriteria: ['objective'], recoverable: true },
      },
      modelContextIntent: clarifiedIntent,
      modelContextPendingClarification: pendingClarification,
      modelMetadata: input.modelMetadata,
    };
  }

  private modelContextResultSets(conversationSlots: Record<string, unknown>): BrainModelResultSet[] {
    const modelContext = this.modelContextRecord(conversationSlots.modelContext);
    if (!Array.isArray(modelContext.resultSets)) return [];
    return modelContext.resultSets.filter((set): set is BrainModelResultSet => isBrainModelResultSet(set));
  }

  private normalizeExactCustomerFactIntent(input: {
    intent: BrainSemanticIntent;
    question: string;
  }): BrainSemanticIntent {
    if (!this.isSpecificCustomerFactQuestion(input.question, input.intent)) return input.intent;
    const phoneTail = input.question.match(/(?:尾号|手机尾号|手机号后四位|手机后四位)[^0-9]*(\d{4})/)?.[1];
    return {
      ...input.intent,
      domains: ['customer'],
      intent: 'query',
      answerShape: 'list',
      entities: input.intent.entities.map((entity) =>
        phoneTail &&
        entity.entityType === 'customer' &&
        this.isSpecificModelEntity(entity) &&
        !/(?:尾号|后四位)[^0-9]*\d{4}/.test(entity.mention)
          ? { ...entity, mention: `${entity.mention}（手机号后四位${phoneTail}）` }
          : entity,
      ),
      metrics: [],
      dimensions: [],
      orderBy: [],
      missingSlots: input.intent.missingSlots.filter((slot) => slot !== 'entity' && slot !== 'customerIdentity'),
      ambiguities: input.intent.ambiguities.filter(
        (ambiguity) => ambiguity.slot !== 'entity' && ambiguity.slot !== 'customerIdentity',
      ),
    };
  }

  private normalizePendingClarificationResolution(input: {
    intent: BrainSemanticIntent;
    conversationSlots: Record<string, unknown>;
    question: string;
  }): BrainSemanticIntent {
    const directives = this.modelContextRecord(input.conversationSlots.turnDirectives);
    const resolvesPending = directives.mode === 'resolve_pending_or_new';
    const pendingSlots = Array.isArray(directives.pendingSlots)
      ? directives.pendingSlots.filter((slot): slot is string => typeof slot === 'string')
      : [];
    const modelContext = this.modelContextRecord(input.conversationSlots.modelContext);
    const suppliesCustomerIdentity =
      pendingSlots.includes('entity') &&
      (input.intent.entities.some((entity) => entity.entityType === 'customer' && this.isSpecificModelEntity(entity)) ||
        /(?:尾号|手机尾号|手机号后四位|手机后四位)[^0-9]*\d{4}/.test(input.question));
    if (
      resolvesPending &&
      suppliesCustomerIdentity &&
      ['query', 'diagnosis', 'recommendation'].includes(String(modelContext.intent)) &&
      this.isCustomerIdentityOnlyReply(input.question) &&
      !this.isExplicitPendingObjectiveAbandonment(input.question)
    ) {
      return {
        ...input.intent,
        objective: typeof modelContext.objective === 'string' ? modelContext.objective : input.intent.objective,
        domains: input.intent.domains.length ? input.intent.domains : ['customer'],
        intent: modelContext.intent as BrainSemanticIntent['intent'],
        answerShape: BRAIN_SEMANTIC_ANSWER_SHAPES.includes(modelContext.answerShape as never)
          ? (modelContext.answerShape as BrainSemanticIntent['answerShape'])
          : 'list',
        missingSlots: input.intent.missingSlots.filter((slot) => slot !== 'entity'),
        ambiguities: input.intent.ambiguities.filter((ambiguity) => ambiguity.slot !== 'entity'),
        successCriteria: input.intent.successCriteria.length
          ? input.intent.successCriteria
          : ['返回当前门店内唯一客户的可审计事实'],
      };
    }
    if (
      resolvesPending &&
      pendingSlots.some((slot) => slot === 'actionTarget' || slot === 'entity') &&
      ['action', 'workflow'].includes(String(modelContext.intent)) &&
      (input.intent.entities.some((entity) => this.isSpecificModelEntity(entity)) ||
        /(?:尾号|手机尾号|手机号后四位|手机后四位)[^0-9]*\d{4}/.test(input.question)) &&
      !this.isExplicitPendingObjectiveAbandonment(input.question)
    ) {
      return {
        ...input.intent,
        objective:
          typeof modelContext.objective === 'string'
            ? `${modelContext.objective}；补充要求：${input.intent.objective}`
            : input.intent.objective,
        intent: modelContext.intent as BrainSemanticIntent['intent'],
        answerShape: 'action_preview',
        missingSlots: input.intent.missingSlots.filter((slot) => slot !== 'actionTarget' && slot !== 'entity'),
        ambiguities: input.intent.ambiguities.filter(
          (ambiguity) => ambiguity.slot !== 'actionTarget' && ambiguity.slot !== 'entity',
        ),
        successCriteria: [...input.intent.successCriteria, '生成待确认操作预览，用户确认前不执行真实业务写入'],
      };
    }

    const resolve = this.modelContextRecord(directives.resolve);
    const comparisonTarget = this.modelContextTimeRange(resolve.comparisonTarget);
    if (input.intent.intent !== 'comparison' || !comparisonTarget) return input.intent;
    const currentRange = this.modelContextTimeRange(modelContext.timeRange) ?? input.intent.timeRange;
    if (!currentRange) return input.intent;
    return {
      ...input.intent,
      timeRange: currentRange,
      comparisonTarget: { type: 'time', timeRange: comparisonTarget },
      missingSlots: input.intent.missingSlots.filter((slot) => slot !== 'comparisonTarget'),
      ambiguities: input.intent.ambiguities.filter((ambiguity) => ambiguity.slot !== 'comparisonTarget'),
    };
  }

  private isSpecificModelEntity(entity: BrainSemanticIntent['entities'][number]) {
    const mention = entity.mention.trim();
    if (!entity.definitionRef || !mention) return false;
    const normalizedMention = mention.toLocaleLowerCase('en-US').replace(/[\s_-]+/g, '');
    if (
      /^(?:customer|customers|member|members|staff|employee|employees|beautician|beauticians|product|products|project|projects|reservation|reservations|appointment|appointments|order|orders|payment|payments)$/.test(
        normalizedMention,
      )
    ) {
      return false;
    }
    if (
      /^(?:(?:今天|明天|下午|上午|当前|刚才)的?)?(?:(?:下一个|上一个|第一个|最后一个|这个|那个|这位)的?)?(?:客户|顾客|客人|老客|新客|会员|客群|人群|员工|美容师|商品|产品|项目|预约|她|他)$/.test(
        mention,
      )
    ) {
      return false;
    }
    if (
      /^(?:(?:今天|明天|下午|上午|当前|刚才)的?)?(?:预约|到店|待到店)(?:客户|顾客|客人|会员)(?:名单|人群|客群)?$/.test(
        mention,
      )
    ) {
      return false;
    }
    if (entity.entityKey && entity.entityKey !== entity.entityType) return true;
    return true;
  }

  private isModelEntityType(actual: string, expected: 'customer' | 'project') {
    const normalized = actual.trim().toLowerCase();
    if (expected === 'customer') return ['customer', 'member', 'client'].includes(normalized);
    return ['project', 'service'].includes(normalized);
  }

  private isExplicitPendingObjectiveAbandonment(question: string) {
    return /^(算了|不用了|取消|换个|另外)|(?:改看|改成|不要|不用).*(?:跟进|任务|预览)/.test(question.trim());
  }

  private isCustomerIdentityOnlyReply(question: string) {
    const normalized = question
      .trim()
      .replace(/^(?:客户|顾客|目标客户)(?:是|叫|为)?/u, '')
      .replace(/(?:手机|手机号)?(?:尾号|后四位)(?:是|为)?[^0-9]*\d{4}/gu, '')
      .replace(/[\s，,。.!！、；;：:]/gu, '');
    return (
      /^[\u4e00-\u9fa5·]{2,10}$/u.test(normalized) &&
      !/(?:查|看|消费|预约|卡|余额|来源|渠道|标签|备注|服务|项目|过敏|皮肤|推荐|提醒|跟进)/u.test(normalized)
    );
  }

  private modelContextRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  }

  private modelPendingClarification(value: unknown): BrainModelPendingClarification | undefined {
    const clarification = this.modelContextRecord(value);
    const missingSlots = Array.isArray(clarification.missingSlots)
      ? clarification.missingSlots.filter((slot): slot is string => typeof slot === 'string' && Boolean(slot.trim()))
      : [];
    const questions = Array.isArray(clarification.questions)
      ? clarification.questions.filter(
          (question): question is string => typeof question === 'string' && Boolean(question.trim()),
        )
      : [];
    const ambiguities = Array.isArray(clarification.ambiguities)
      ? clarification.ambiguities.flatMap((value) => {
          const ambiguity = this.modelContextRecord(value);
          if (typeof ambiguity.slot !== 'string' || typeof ambiguity.reason !== 'string') return [];
          const candidates = Array.isArray(ambiguity.candidates)
            ? ambiguity.candidates.filter((candidate): candidate is string => typeof candidate === 'string')
            : [];
          return [{ slot: ambiguity.slot, reason: ambiguity.reason, candidates }];
        })
      : [];
    if (!missingSlots.length || !questions.length) return undefined;
    return { missingSlots, questions, ambiguities };
  }

  private resolvePendingClarificationCapability(
    conversationSlots: Record<string, unknown>,
    intent: BrainSemanticIntent,
    cards: readonly BrainCapabilityCard[],
  ): BrainCapabilityCard | undefined {
    const directives = this.modelContextRecord(conversationSlots.turnDirectives);
    if (directives.mode !== 'resolve_pending_or_new' || !Array.isArray(directives.pendingSlots)) return undefined;
    const modelContext = this.modelContextRecord(conversationSlots.modelContext);
    const capability = this.modelContextRecord(modelContext.capability);
    if (typeof capability.key !== 'string' || !Number.isInteger(capability.version)) return undefined;
    return cards.find(
      (card) =>
        card.key === capability.key &&
        card.version === capability.version &&
        card.intents.includes(intent.intent) &&
        (intent.intent === 'action' ? !card.readOnly && card.sideEffect : card.readOnly),
    );
  }

  private modelContextTimeRange(value: unknown): BrainSemanticIntent['timeRange'] | undefined {
    const range = this.modelContextRecord(value);
    if (typeof range.label !== 'string' || (range.timezone !== 'Asia/Shanghai' && range.timezone !== 'UTC')) {
      return undefined;
    }
    const optionalString = (candidate: unknown) =>
      typeof candidate === 'string' && candidate.trim() ? candidate : undefined;
    return {
      ...(optionalString(range.preset) ? { preset: optionalString(range.preset) } : {}),
      ...(optionalString(range.startDate) ? { startDate: optionalString(range.startDate) } : {}),
      ...(optionalString(range.endDate) ? { endDate: optionalString(range.endDate) } : {}),
      label: range.label,
      timezone: range.timezone,
    };
  }

  private modelClarificationOptions(ambiguities: readonly BrainSemanticIntent['ambiguities'][number][]) {
    return ambiguities.flatMap((ambiguity) =>
      ambiguity.candidates.map((candidate, index) => ({
        id: `${ambiguity.slot}:${index + 1}`,
        label: candidate,
        value: { slot: ambiguity.slot, candidate },
      })),
    );
  }

  private normalizeGovernedWorkflowIntent(input: {
    intent: BrainSemanticIntent;
    question: string;
    cards: readonly BrainCapabilityCard[];
  }): BrainSemanticIntent {
    if (input.intent.intent !== 'workflow' || this.hasProtectedCapabilityClarification(input.intent)) {
      return input.intent;
    }
    const requestedDefinitions = new Set(
      input.intent.entities
        .map((entity) => entity.definitionRef?.definitionKey)
        .filter((value): value is string => Boolean(value)),
    );
    const cards = input.cards.filter(
      (card) =>
        card.intents.includes('workflow') &&
        card.sideEffect &&
        card.requiresConfirmation &&
        card.idempotency === 'required' &&
        card.grounding === 'preview_action',
    );
    const matched = cards
      .filter((card) =>
        [...requestedDefinitions].every((definitionKey) =>
          card.definitionRefs.some((definition) => definition.definitionKey === definitionKey),
        ),
      )
      .map((card) => ({ card, score: this.governedCapabilitySemanticScore(input.question, card) }))
      .sort((left, right) => right.score - left.score || left.card.key.localeCompare(right.card.key))[0];
    if (!matched || matched.score < 0.45) return input.intent;

    const entities = [...input.intent.entities]
      .sort((left, right) => right.confidence - left.confidence)
      .filter((entity, index, values) => {
        const mention = this.normalizeGovernedExampleText(entity.mention);
        return (
          values.findIndex((candidate) => this.normalizeGovernedExampleText(candidate.mention) === mention) === index
        );
      });

    return {
      ...input.intent,
      entities,
      answerShape: 'action_preview',
      ambiguities: [],
      missingSlots: [],
      assumptions: [
        ...input.intent.assumptions,
        `能力 ${matched.card.key} 将使用管理端已发布的空档、候选评分和冷却期规则自动生成最优待确认方案。`,
        '自动选择只产生预览，用户确认前不创建任务、不发送消息、不修改预约。',
      ],
    };
  }

  private hasProtectedCapabilityClarification(intent: BrainSemanticIntent): boolean {
    if (intent.ambiguities.some((ambiguity) => /越权|跨门店|权限|安全|冲突/.test(ambiguity.reason))) return true;
    const protectedAmbiguitySlots = intent.ambiguities
      .filter((ambiguity) => !this.isGovernedBusinessDefinitionAmbiguity(ambiguity.reason))
      .map((ambiguity) => ambiguity.slot);
    return [...intent.missingSlots, ...protectedAmbiguitySlots].some((slot) => {
      const normalized = slot.toLocaleLowerCase('zh-CN').replace(/[\s._-]+/g, '');
      if (/(?:permission|store|securityscope|confirmation|门店|权限|安全范围|确认授权)/.test(normalized)) return true;
      return (
        !['action', 'draft'].includes(intent.intent) &&
        /(?:entity|identity|customername|customerid|phone|recipient|具体客户|客户姓名|客户身份|手机号|接收人)/.test(
          normalized,
        )
      );
    });
  }

  private isGovernedBusinessDefinitionAmbiguity(reason: string) {
    return /(?:业务定义|统一口径|口径|阈值|映射|分类规则|等级规则)/.test(reason);
  }

  private governedCapabilitySemanticScore(question: string, card: BrainCapabilityCard): number {
    const candidates = [card.name, card.description, ...(card.examples ?? []), ...(card.synonyms ?? [])];
    const positive = candidates.reduce(
      (best, candidate) => Math.max(best, this.governedTextSimilarity(question, candidate)),
      0,
    );
    const negative = (card.negativeExamples ?? []).reduce(
      (best, candidate) => Math.max(best, this.governedTextSimilarity(question, candidate)),
      0,
    );
    return Math.max(0, positive - 0.65 * negative);
  }

  private governedTextSimilarity(leftValue: string, rightValue: string): number {
    const left = this.normalizeGovernedExampleText(leftValue);
    const right = this.normalizeGovernedExampleText(rightValue);
    if (!left || !right) return 0;
    if (left === right) return 1;
    if (left.includes(right) || right.includes(left)) {
      return Math.min(1, 0.75 + 0.25 * (Math.min(left.length, right.length) / Math.max(left.length, right.length)));
    }
    const leftPairs = new Set(
      Array.from({ length: Math.max(0, left.length - 1) }, (_, index) => left.slice(index, index + 2)),
    );
    const rightPairs = new Set(
      Array.from({ length: Math.max(0, right.length - 1) }, (_, index) => right.slice(index, index + 2)),
    );
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
    if (/(?:美容师|员工|技师).*(?:在忙|忙吗|还要多久|什么时候空|可接待)/.test(question)) {
      const frontDeskCard = cards.find(
        (card) => card.key === 'front_desk_operations_overview' && card.readOnly && card.intents.includes('query'),
      );
      if (frontDeskCard) return frontDeskCard;
    }
    if (
      /(?:现金|微信|支付宝|银行卡|刷卡|储值|会员余额)/.test(question) &&
      /(?:收款|收了|消费|支付|几笔|笔数|金额|多少)/.test(question) &&
      !/(?:负债|剩余余额|还有多少余额|储值卡余额|储值余额总计|会员余额总计|客户都来消费|集中消费)/.test(question)
    ) {
      const paymentCard = cards.find(
        (card) => card.key === 'finance_payment_breakdown' && card.readOnly && card.intents.includes('query'),
      );
      if (paymentCard) return paymentCard;
    }
    const normalizedQuestion = this.normalizeGovernedExampleText(question);
    return cards.find((card) =>
      (card.examples ?? []).some((example) => this.normalizeGovernedExampleText(example) === normalizedQuestion),
    );
  }

  private findDeterministicCustomerFactsCard(
    question: string,
    intent: BrainSemanticIntent,
    cards: readonly BrainCapabilityCard[],
  ): BrainCapabilityCard | undefined {
    if (!this.isSpecificCustomerFactQuestion(question, intent)) return undefined;
    return cards.find(
      (card) => card.key === 'customer_facts' && card.readOnly && !card.sideEffect && card.intents.includes('query'),
    );
  }

  private isSpecificCustomerFactQuestion(question: string, intent: BrainSemanticIntent) {
    if (/(?:预约).*(?:几点|时间|安排|改期|取消|确认)|(?:几点|时间|安排).*(?:预约)/.test(question)) {
      return false;
    }
    const hasIdentity =
      intent.entities.some((entity) => entity.entityType === 'customer' && this.isSpecificModelEntity(entity)) ||
      /(?:尾号|手机尾号|手机号后四位|手机后四位)[^0-9]*\d{4}/.test(question);
    if (!hasIdentity) return false;
    return /(?:上次来|最近来|到店|消费|会员等级|办过卡|卡项|还有多少次|余额|来源|渠道|标签|备注|上次做|最近服务|服务记录|做的什么项目|过敏|皮肤|注意事项)/.test(
      question,
    );
  }

  private shouldUseModelSupervisor(intent: BrainSemanticIntent) {
    // Domains are retrieval signals, not a proxy for the number of execution steps.
    // A single governed capability can legitimately cover several related domains.
    return (
      intent.intent === 'workflow' ||
      (['diagnosis', 'recommendation', 'action'].includes(intent.intent) && intent.successCriteria.length > 1)
    );
  }

  private canUseSingleCapabilityFastPath(card: BrainCapabilityCard, intent: BrainSemanticIntent) {
    if (intent.intent === 'workflow') return false;
    if (intent.intent === 'action') {
      return (
        !card.readOnly &&
        card.sideEffect &&
        card.requiresConfirmation &&
        card.idempotency === 'required' &&
        card.grounding === 'preview_action' &&
        card.intents.includes('action') &&
        intent.domains.every((domain) => card.domains.includes(domain))
      );
    }
    if (!card.readOnly || card.sideEffect) return false;
    const intentCompatible =
      card.intents.includes(intent.intent) ||
      (intent.intent === 'recommendation' && card.intents.includes('diagnosis'));
    return intentCompatible && intent.domains.every((domain) => card.domains.includes(domain));
  }

  private normalizeReadOnlyPreviewCapabilityIntent(intent: BrainSemanticIntent, card: BrainCapabilityCard): BrainSemanticIntent {
    if (
      (card.grounding !== 'preview_action' && !card.key.endsWith('_preview')) ||
      !card.readOnly ||
      card.sideEffect ||
      !card.intents.includes('workflow') ||
      !['action', 'recommendation', 'draft', 'workflow'].includes(intent.intent)
    ) {
      return intent;
    }
    if (intent.intent === 'draft' || intent.intent === 'action') return intent;
    return {
      ...intent,
      intent: 'recommendation',
      answerShape: 'diagnosis',
      assumptions: [
        ...intent.assumptions,
        `能力 ${card.key} 只有只读规则建议合同，不生成不可执行的确认动作。`,
      ],
    };
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
    const topK =
      input.topK ??
      this.capabilityRetriever.retrieveTopKForSupervisor({
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
      const failureCode = ['PROVIDER_UNAVAILABLE', 'PROVIDER_AUTH_FAILED'].includes(planning.errorCode)
        ? planning.errorCode
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
    const completed = execution.observations.filter((item) => item.status === 'completed');
    const noSuccessfulExecution =
      completed.length === 0 && execution.observations.some((item) => item.status === 'failed');
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
          errorCode: item.errorCode ?? null,
        })),
      }),
      status: execution.status === 'rejected' || noSuccessfulExecution ? 'failed' : 'completed',
    });

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
    const executionTimeRange = this.modelExecutionTimeRange(
      ...execution.observations.map((observation) => observation.data?.metadata),
    );
    return {
      status: execution.status === 'rejected' || noSuccessfulExecution ? 'failed' : 'completed',
      answer: grounded?.answer ?? fallbackAnswer,
      citations: grounded?.citations ?? citations,
      suggestedActions: grounded?.suggestedActions ?? suggestedActions,
      blocks: grounded?.blocks ?? blocks,
      grounding: completed.some((item) => item.grounding === 'preview_action')
        ? 'preview_action'
        : completed.length > 0
          ? 'db_skill'
          : 'none',
      adapterMetadata: {
        supervisorPlan: execution.plan,
        observations: execution.observations,
        completion: execution.completion,
        ...(executionTimeRange ? { timeRange: executionTimeRange } : {}),
      },
      modelMetadata:
        execution.status === 'rejected'
          ? { ...metadata, failureCode: 'MODEL_EXECUTION_REJECTED' }
          : noSuccessfulExecution
            ? { ...metadata, failureCode: 'MODEL_EXECUTION_FAILED' }
            : metadata,
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

  private modelExecutionTimeRange(...sources: unknown[]): Record<string, unknown> | undefined {
    for (const source of sources) {
      if (!source || typeof source !== 'object' || Array.isArray(source)) continue;
      const timeRange = (source as Record<string, unknown>).timeRange;
      if (!timeRange || typeof timeRange !== 'object' || Array.isArray(timeRange)) continue;
      const value = timeRange as Record<string, unknown>;
      if (
        typeof value.startDate === 'string' &&
        typeof value.endExclusive === 'string' &&
        value.boundary === '[start,end)' &&
        typeof value.timezone === 'string'
      ) {
        return { ...value };
      }
    }
    return undefined;
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
      PROVIDER_AUTH_FAILED: '模型服务鉴权配置无效，本次未执行查询，请联系管理员修复模型配置。',
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
        ? {
            error: {
              stage: input.stage,
              code: input.code,
              errorClass: this.modelErrorClass(input.error),
            } as Prisma.InputJsonValue,
          }
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
    const prefix = error.message
      .split(':', 1)[0]!
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]+/g, '_');
    return prefix && prefix.length <= 80 ? prefix : undefined;
  }

  private enrichModelEntityRefs(
    intent: BrainSemanticIntent,
    snapshot: ProductionReadyBusinessDefinitionSnapshot,
  ): BrainSemanticIntent {
    const resolver = this.ontologyRuntime?.resolveEntityAlias;
    if (typeof resolver !== 'function') return intent;
    let changed = false;
    const entities = intent.entities.map((entity) => {
      if (entity.definitionRef) return entity;
      const resolution = resolver.call(this.ontologyRuntime, entity.mention || entity.entityType, snapshot);
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
      resultSets?: unknown;
      pendingClarification?: unknown;
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
        resultSets: snapshot.resultSets,
        pendingClarification: snapshot.pendingClarification,
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
      const refs =
        correction.slot === 'metrics' ? intent.metrics : correction.slot === 'dimensions' ? intent.dimensions : [];
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
    return context.roles?.map((role) => resolveBrainDomainRole(role)).find((role): role is BrainDomainRole => Boolean(role))
      ?? 'store_manager';
  }

  private withBrainRole(context: BrainRequestContext, role?: BrainDomainRole): BrainRequestContext {
    if (!role || context.roles?.includes(role)) return context;
    return { ...context, roles: [...(context.roles ?? []), role] };
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

  private resolveCurrentBackendFactGap(question: string): { unsupportedReason: string; answer: string } | undefined {
    if (
      /(?:员工|美容师)[^。！？]{0,30}(?:没有授权|未经授权|未授权)[^。！？]{0,20}(?:优惠|折扣)|(?:优惠|折扣)[^。！？]{0,30}(?:没有授权|未经授权|未授权)/.test(
        question,
      )
    ) {
      return {
        unsupportedReason: 'discount_authorization_audit_not_available',
        answer:
          '当前管理端和后台只有订单优惠金额，没有优惠授权规则、审批记录、实际操作人和例外事件事实，无法判断员工是否未经授权给予额外优惠。Ami Brain 不会用员工排行或全店优惠总额替代授权审计。',
      };
    }
    if (
      /(?:店里|门店)?[^。！？]{0,10}设备[^。！？]{0,20}(?:问题|故障|异常)|设备[^。！？]{0,20}(?:最近|有没有)[^。！？]{0,20}(?:问题|故障|异常)/.test(
        question,
      )
    ) {
      return {
        unsupportedReason: 'equipment_status_fact_not_available',
        answer:
          '当前管理端和后台没有设备台账、巡检、保养、故障和维修状态事实，无法判断门店设备是否存在问题。Ami Brain 不会用库存、预约或经营异常替代设备状态。',
      };
    }
    if (
      /(?:储值卡|会员卡)[^。！？]{0,20}(?:提现|套现)[^。！？]{0,20}(?:风险|异常|高不高)|(?:提现|套现)[^。！？]{0,20}(?:储值卡|会员卡)/.test(
        question,
      )
    ) {
      return {
        unsupportedReason: 'stored_value_withdrawal_audit_not_available',
        answer:
          '当前管理端和后台没有储值提现申请、审批、打款和异常规则事实，无法评估储值卡提现或套现风险。Ami Brain 不会用会员卡负债或普通余额交易替代提现审计。',
      };
    }
    if (/(?:美容师|员工)[^。！？]{0,20}客户流失率|客户流失率[^。！？]{0,20}(?:美容师|员工)/.test(question)) {
      return {
        unsupportedReason: 'staff_customer_churn_attribution_not_available',
        answer:
          '当前管理端和后台没有按美容师归属的客户留存基线、流失事件和归因事实，无法判断某位美容师的客户流失率是否异常。Ami Brain 不会用员工表现分、服务量或复购人数替代客户流失率。',
      };
    }
    if (
      !/(?:下一个|第一个|最后一个|这个|这位).*(?:客人|客户).*(?:过敏|注意事项)/.test(question) &&
      /(?:服务事故|皮肤过敏)[^。！？]{0,20}(?:情况|有没有|最近)|(?:有没有|最近)[^。！？]{0,30}(?:服务事故|皮肤过敏)/.test(
        question,
      )
    ) {
      return {
        unsupportedReason: 'service_incident_fact_not_available',
        answer:
          '当前管理端和后台没有服务事故、皮肤过敏事件、处置过程和责任归因事实，无法统计或判断近期是否发生相关情况。Ami Brain 不会用客户过敏档案、服务备注或投诉数据替代事故记录。',
      };
    }
    if (
      /(?:员工|美容师)[^。！？]{0,20}离职[^。！？]{0,20}(?:带走|流失)[^。！？]{0,10}客户|离职[^。！？]{0,20}(?:带走|流失)[^。！？]{0,10}客户/.test(
        question,
      )
    ) {
      return {
        unsupportedReason: 'staff_departure_customer_risk_not_available',
        answer:
          '当前管理端和后台没有员工离职流程、客户归属历史、客户转移和离职后流失证据，无法判断员工离职带走客户的风险。Ami Brain 不会用员工排行、当前客户归属或复购人数替代离职风险。',
      };
    }
    if (/消防[^。！？]{0,20}(?:检查|安全|隐患)|(?:检查|隐患)[^。！？]{0,20}消防/.test(question)) {
      return {
        unsupportedReason: 'fire_safety_inspection_fact_not_available',
        answer:
          '当前管理端和后台没有消防检查计划、检查记录、隐患、整改和到期提醒事实，无法判断本店是否需要执行或补做消防安全检查。Ami Brain 不会用财务、库存或经营风险替代消防安全结论。',
      };
    }
    return undefined;
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

  private async createAssistantMessageWithRetry(
    input: Parameters<PrismaService['brainMessage']['create']>[0],
  ) {
    try {
      return await this.prisma.brainMessage.create(input);
    } catch (error) {
      if (!this.isTransientAssistantPersistenceError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
      return this.prisma.brainMessage.create(input);
    }
  }

  private isTransientAssistantPersistenceError(error: unknown) {
    return /rollback cannot be executed on an expired transaction|transaction api error|unable to start a transaction in the given time/i.test(
      this.errorMessage(error),
    );
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
  card: Pick<BrainCapabilityCard, 'definitionRefs' | 'domains'> &
    Partial<Pick<BrainCapabilityCard, 'grounding'>> & { key?: string },
  question = '',
  options: { exactGovernedExample?: boolean } = {},
): string[] {
  if (options.exactGovernedExample) return [];
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
  if (intent.intent === 'draft' || intent.intent === 'action') return [];
  if (intent.intent === 'diagnosis' && card.grounding === 'domain_service') return [];
  return [
    ...new Set(
      requested.filter((item) => {
        if (declared.includes(normalizeDefinitionKey(item))) return false;
        const requiredDomains = definitionDomains(item);
        return requiredDomains.length > 0 && !requiredDomains.some((domain) => domains.includes(domain));
      }),
    ),
  ];
}

export function findUnresolvedBusinessDefinitionRequirements(intent: BrainSemanticIntent, question: string): string[] {
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

function inferGovernedQuestionMetricKeys(question: string): string[] {
  const metrics: string[] = [];
  if (AVERAGE_ORDER_VALUE_QUESTION_PATTERN.test(question)) {
    metrics.push('metric.average_order_value');
  }
  if (MATERIAL_COST_RATE_QUESTION_PATTERN.test(question)) {
    metrics.push('metric.material_cost_rate');
  }
  if (
    /(?:美容师|员工|谁).*(?:接|服务).*(?:客户|客人).*(?:最多|几个|排行)|(?:客户|客人).*(?:最多|几个).*(?:美容师|员工|谁)/.test(
      question,
    )
  ) {
    metrics.push('metric.staff_unique_customer_count');
  }
  if (/(?:美容师|员工).*(?:服务次数|做了几次)|服务次数.*(?:美容师|员工)/.test(question)) {
    metrics.push('metric.staff_service_count');
  }
  if (/提成/.test(question)) metrics.push('metric.staff_commission_amount');
  if (STAFF_REVENUE_QUESTION_PATTERN.test(question)) {
    metrics.push('metric.staff_service_revenue');
  }
  if (/(?:员工|美容师|所有员工|谁).*(?:表现|综合评分)|(?:表现|综合评分).*(?:员工|美容师|谁)/.test(question)) {
    metrics.push('metric.staff_performance_score');
  }
  if (STAFF_COMPLAINT_QUESTION_PATTERN.test(question)) {
    metrics.push('metric.staff_customer_complaint_count', 'metric.customer_feedback_collection_coverage_rate');
  } else if (/(?:投诉|客诉|差评|不满|负面反馈)/.test(question)) {
    metrics.push('metric.customer_complaint_count', 'metric.customer_feedback_collection_coverage_rate');
  }
  if (/(?:满意度|满意评价|服务评分|星级|评分)/.test(question)) {
    metrics.push('metric.customer_average_satisfaction_rating', 'metric.customer_feedback_collection_coverage_rate');
  }
  if (/(?:新客.*(?:转化|成交|首单)|(?:转化|成交|首单).*新客)/.test(question)) {
    metrics.push(
      'metric.new_customer_count',
      'metric.new_customer_conversion_count',
      'metric.new_customer_conversion_rate',
    );
  }
  if (/(?:产品|商品).*(?:销售额|销售金额)|(?:销售额|销售金额).*(?:产品|商品)/.test(question)) {
    metrics.push('metric.product_sales_amount');
  }
  if (/(?:产品|商品|货品).*(?:毛利率|利润率)|(?:毛利率|利润率).*(?:产品|商品|货品)/.test(question)) {
    metrics.push('metric.product_gross_margin_rate');
  }
  if (/(?:产品|商品|货品).*(?:低于成本|亏本)|(?:低于成本|亏本).*(?:产品|商品|货品)/.test(question)) {
    metrics.push('metric.product_below_cost_sale_count');
  }
  if (
    /(?:现金|微信|支付宝|储值|银行卡).*(?:收了多少|各多少|分别多少|怎么分|占比)|(?:支付方式|收款渠道).*(?:拆分|构成|怎么分)/.test(
      question,
    )
  ) {
    metrics.push('metric.paid_amount');
  }
  if (
    /(?:耗材|物料|产品|商品).*(?:消耗|用量|出库).*(?:最快|最多|排行|排名)|(?:消耗|用量|出库).*(?:最快|最多).*(?:耗材|物料|产品|商品)/.test(
      question,
    )
  ) {
    metrics.push('metric.inventory_consumption_quantity');
  }
  return [...new Set(metrics)];
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
  if (/新客/.test(question) && /(?:渠道|来源)/.test(question)) definitions.push('dimension.customerSource');
  if (/(?:现金|微信|支付宝|储值|银行卡|支付方式|收款渠道)/.test(question)) definitions.push('dimension.paymentMethod');
  if (/(?:项目|套餐|护理)/.test(question)) definitions.push('dimension.projectName');
  if (/(?:产品|商品|货品|耗材|物料)/.test(question)) definitions.push('dimension.productName');
  if (/(?:员工|美容师|技师)/.test(question)) definitions.push('dimension.beauticianName');
  if (/(?:客户|客人|会员)/.test(question)) definitions.push('dimension.customerName');
  return definitions;
}

function normalizeDefinitionKey(value: string) {
  return value
    .toLowerCase()
    .replace(/^(?:metric|dimension|entity)\./, '')
    .replace(/[._-]/g, '');
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
