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
import {
  extractSpecificCustomerNameFromQuestion,
  isSpecificCustomerProjectRecommendationQuestion,
  isSpecificCustomerReadOnlyQuestion,
} from './domain/brain-customer-identity.js';
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
import { BrainIntentCompletenessPolicyService } from './cognition/brain-intent-completeness-policy.service.js';
import { BrainOntologyRuntimeService } from './cognition/brain-ontology-runtime.service.js';
import { BRAIN_SEMANTIC_ANSWER_SHAPES, BRAIN_SEMANTIC_INTENTS } from './cognition/brain-semantic-intent.types.js';
import type {
  BrainDefinitionRef,
  BrainSemanticEntityReference,
  BrainSemanticIntent,
} from './cognition/brain-semantic-intent.types.js';
import type {
  BusinessActionDefinitionSnapshot,
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
import { extractBrainReleaseDefinitionVersionIds } from './governance/brain-release-definition-versions.js';
import { createReleaseFingerprint } from './governance/brain-capability-regeneration-fingerprint.js';
import { BusinessSemanticEvidenceService } from '../semantic-data/business-semantic-evidence.service.js';
import { matchBrainCapabilityBoundary } from './capability/brain-capability-boundary.registry.js';
import type {
  BrainActionExecutionProvenance,
  BrainActionReleaseIdentity,
} from './cognition/brain-action-execution-provenance.types.js';
import { createBrainActionExecutionParticipants } from './cognition/business-action-participant-profile.js';
import { createBrainActionSituationContext } from './cognition/brain-action-situation-context.js';
import type { AiStructuredOutputResult } from '../ai/ai.service.js';

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
  modelRouting: AiStructuredOutputResult<unknown>['routing'] | null;
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

interface BrainCapabilityCatalogPreloadResult {
  readonly cards?: readonly BrainCapabilityCard[];
  readonly error?: unknown;
  readonly latencyMs: number;
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
    @Optional() private readonly intentCompleteness?: BrainIntentCompletenessPolicyService,
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

  async listConversations(context: BrainRequestContext, input: { page?: number; pageSize?: number } = {}) {
    this.assertBaseAccess(context);
    const page = Math.max(1, Math.trunc(Number(input.page) || 1));
    const pageSize = Math.min(50, Math.max(1, Math.trunc(Number(input.pageSize) || 10)));
    const where = { storeId: context.storeId, userId: context.userId, status: 'active', deletedAt: null };
    const [items, total] = await Promise.all([
      this.prisma.brainConversation.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.brainConversation.count({ where }),
    ]);

    for (const conversation of items) this.rememberConversationAccess(context, conversation.id);
    return { items, total, page, pageSize, storeId: context.storeId };
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
    const requestContext: BrainRequestContext = {
      ...context,
      conversationId,
      timezone: dto.timezone ?? context.timezone,
    };

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
              requestChannel: context.requestChannel,
              deviceIdHash: context.deviceIdHash,
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

    let chatAnswer: BrainChatAnswer | undefined;
    const standaloneMemoryInstruction = this.memoryService && this.isStandaloneMemoryInstruction(dto.message);
    const productProfile = await this.resolveResponseProductProfile(requestContext);
    if (standaloneMemoryInstruction) {
      try {
        const memoryInstruction = await this.memoryService!.applyUserInstruction({
          storeId: context.storeId,
          userId: context.userId,
          runId: run.id,
          text: dto.message,
          allowStoreScope: this.canManageStoreMemory(context),
        });
        if (memoryInstruction.handled && memoryInstruction.message) {
          const memoryCitations = this.memoryInstructionCitations(memoryInstruction.memories, run.id);
          chatAnswer = {
            status: 'completed',
            answer: memoryInstruction.message,
            citations: memoryCitations,
            suggestedActions: [],
            blocks: [{ kind: 'text', text: memoryInstruction.message }],
            grounding: 'governed_memory',
            adapterMetadata: {
              memoryInstruction: {
                action: memoryInstruction.action,
                memoryIds: memoryInstruction.memories.map((memory) => memory.id),
              },
            },
          };
          await this.recordMemoryInstructionTrace(
            run.id,
            memoryInstruction.action,
            memoryInstruction.memories.map((memory) => memory.id),
          );
        }
      } catch (error) {
        await this.traceService.recordStep({
          runId: run.id,
          stepKey: 'memory_instruction',
          layer: 'memory',
          status: 'failed',
          error: { message: this.errorMessage(error) } as Prisma.InputJsonValue,
        });
      }
    }
    if (!chatAnswer && !productProfile.actionsEnabled && this.hasExplicitSideEffectRequest(dto.message)) {
      chatAnswer = this.buildActionExecutionDisabledAnswer(productProfile);
      await this.recordModelTrace({
        runId: run.id,
        stepKey: 'action_execution_policy',
        layer: 'governance',
        status: 'completed',
        output: this.toJsonValue({
          decision: 'denied',
          reason: 'brain_action_execution_disabled_by_release_profile',
          productProfile: productProfile.productProfile,
          actionExecutionPolicy: productProfile.actionExecutionPolicy,
          previewCreated: false,
          confirmationCreated: false,
          retryCreated: false,
          businessStateChanged: false,
        }),
      });
    }
    if (!chatAnswer) {
      try {
        chatAnswer = await this.buildAnswer(requestContext, conversationId, dto, run.id);
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
        conversationId,
        userId: context.userId,
        storeId: context.storeId,
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
    if (this.memoryService && !standaloneMemoryInstruction && chatAnswer.status === 'completed') {
      try {
        const memoryInstruction = await this.memoryService.applyUserInstruction({
          storeId: context.storeId,
          userId: context.userId,
          runId: run.id,
          text: dto.message,
          allowStoreScope: this.canManageStoreMemory(context),
        });
        if (memoryInstruction.handled && memoryInstruction.message) {
          const memoryCitations = this.memoryInstructionCitations(memoryInstruction.memories, run.id);
          chatAnswer = {
            ...chatAnswer,
            answer: `${chatAnswer.answer}\n\n${memoryInstruction.message}`,
            citations: [...chatAnswer.citations, ...memoryCitations],
            adapterMetadata: {
              ...(chatAnswer.adapterMetadata ?? {}),
              memoryInstruction: {
                action: memoryInstruction.action,
                memoryIds: memoryInstruction.memories.map((memory) => memory.id),
              },
            },
          };
          await this.recordMemoryInstructionTrace(
            run.id,
            memoryInstruction.action,
            memoryInstruction.memories.map((memory) => memory.id),
          );
        }
      } catch (error) {
        await this.traceService.recordStep({
          runId: run.id,
          stepKey: 'memory_instruction',
          layer: 'memory',
          status: 'failed',
          error: { message: this.errorMessage(error) } as Prisma.InputJsonValue,
        });
      }
    }
    const responseSuggestedActions = productProfile.actionsEnabled ? chatAnswer.suggestedActions : [];
    const responseBlocks = productProfile.actionsEnabled
      ? (chatAnswer.blocks ?? [])
      : (chatAnswer.blocks ?? []).filter((block) => block.kind !== 'action_preview');
    const responseEnvelope = {
      conversationId,
      runId: run.id,
      status: chatAnswer.status,
      answer: chatAnswer.answer,
      citations: chatAnswer.citations,
      suggestedActions: responseSuggestedActions,
      blocks: responseBlocks,
      productProfile: productProfile.productProfile,
      actionsEnabled: productProfile.actionsEnabled,
      actionExecutionPolicy: productProfile.actionExecutionPolicy,
      allowedCapabilityManifest: productProfile.allowedCapabilityManifest,
      productProfileFingerprint: productProfile.productProfileFingerprint,
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

    const responsePersistenceStartedAt = Date.now();
    const brainRunWriteStartedAt = Date.now();
    await this.prisma.brainRun.update({
      where: { id: run.id },
      data: {
        status: chatAnswer.status,
        output,
        latencyMs: Date.now() - startedAt,
        ...(chatAnswer.status === 'failed' ? { error: { message: chatAnswer.answer } as Prisma.InputJsonValue } : {}),
      },
    });
    const brainRunWriteMs = Date.now() - brainRunWriteStartedAt;
    const assistantMessageWriteStartedAt = Date.now();
    await this.createAssistantMessageWithRetry({
      data: {
        conversationId,
        role: 'assistant',
        content: chatAnswer.answer,
        metadata: output,
      },
    });
    const assistantMessageWriteMs = Date.now() - assistantMessageWriteStartedAt;
    const answerReadyAt = Date.now();
    options?.onAnswerReady?.(responseEnvelope);
    await this.recordModelTrace({
      runId: run.id,
      stepKey: 'response_persistence',
      layer: 'response',
      status: 'completed',
      latencyMs: answerReadyAt - responsePersistenceStartedAt,
      output: this.toJsonValue({
        timingScope: 'outside_brain_run',
        phaseLatencyMs: {
          brainRunWriteMs,
          assistantMessageWriteMs,
        },
      }),
    });
    try {
      const conversationTouchStartedAt = Date.now();
      await this.prisma.brainConversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });
      await this.recordModelTrace({
        runId: run.id,
        stepKey: 'conversation_touch_after_answer',
        layer: 'memory',
        status: 'completed',
        latencyMs: Date.now() - conversationTouchStartedAt,
        output: this.toJsonValue({ timingScope: 'outside_brain_run' }),
      });
    } catch (error) {
      await this.recordModelTrace({
        runId: run.id,
        stepKey: 'conversation_touch_after_answer',
        layer: 'memory',
        status: 'failed',
        error: { message: this.errorMessage(error) } as Prisma.InputJsonValue,
        output: this.toJsonValue({ timingScope: 'outside_brain_run' }),
      });
    }
    if (chatAnswer.status === 'completed' && chatAnswer.modelContextIntent && this.semanticEvidence) {
      const semanticEvidenceStartedAt = Date.now();
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
          latencyMs: Date.now() - semanticEvidenceStartedAt,
          output: { capturedCount: captured.capturedCount },
        });
      } catch (error) {
        await this.recordSemanticEvidenceTrace({
          runId: run.id,
          status: 'failed',
          latencyMs: Date.now() - semanticEvidenceStartedAt,
          error: { message: this.errorMessage(error) },
        });
      }
    }
    if (this.conversationContext) {
      if (chatAnswer.status === 'completed' && chatAnswer.modelContextIntent) {
        try {
          const contextCapability = this.modelContextCapabilityForCompletedAnswer(chatAnswer);
          const updated = await this.conversationContext.updateAfterModelRun({
            conversationId,
            runId: run.id,
            userId: context.userId,
            storeId: context.storeId,
            intent: chatAnswer.modelContextIntent,
            ...(contextCapability
              ? { capability: { key: contextCapability.key, version: contextCapability.version } }
              : {}),
            corrections: chatAnswer.modelContextCorrections ?? [],
            resultSets: chatAnswer.modelContextResultSets,
            pendingClarification: chatAnswer.modelContextPendingClarification,
          });
          await this.recordModelTrace({
            runId: run.id,
            stepKey: 'model_conversation_context_write',
            layer: 'memory',
            status: updated ? 'completed' : 'failed',
            output: this.toJsonValue({
              persisted: Boolean(updated),
              metricCount: chatAnswer.modelContextIntent.metrics.length,
              capabilityKey: contextCapability?.key ?? null,
              capabilityVersion: contextCapability?.version ?? null,
              capabilitySource: contextCapability?.source ?? null,
              pendingClarification: Boolean(chatAnswer.modelContextPendingClarification),
            }),
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
    const releaseRuntimeStartedAt = Date.now();
    let releaseRuntime: Awaited<ReturnType<BrainChatService['resolveReleaseRuntime']>>;
    try {
      releaseRuntime = await this.resolveReleaseRuntime(context);
    } catch (error) {
      await this.recordModelTrace({
        runId,
        stepKey: 'release_runtime_selection',
        layer: 'governance',
        status: 'failed',
        latencyMs: Date.now() - releaseRuntimeStartedAt,
        error: this.toJsonValue({ message: this.errorMessage(error) }),
      });
      throw error;
    }
    await this.recordModelTrace({
      runId,
      stepKey: 'release_runtime_selection',
      layer: 'governance',
      status: releaseRuntime.failureCode ? 'failed' : 'completed',
      latencyMs: Date.now() - releaseRuntimeStartedAt,
      output: this.toJsonValue({
        mode: releaseRuntime.mode ?? null,
        releaseId: releaseRuntime.releaseIdentity?.releaseId ?? null,
        releaseKey: releaseRuntime.releaseKey ?? null,
        releaseFingerprint: releaseRuntime.releaseIdentity?.releaseFingerprint ?? null,
        capabilityCandidateCount: releaseRuntime.capabilityCandidates?.length ?? null,
        productProfile: releaseRuntime.productProfile ?? null,
        evaluationIdentity: releaseRuntime.evaluationIdentity ?? null,
        governancePolicyReleaseId: releaseRuntime.governancePolicy?.releaseId ?? null,
        governancePolicyMode: releaseRuntime.governancePolicy?.mode ?? null,
        governancePolicyWouldBlockCount: releaseRuntime.governancePolicy?.blockedCapabilityKeys.length ?? null,
        runtimeProductIdentity: releaseRuntime.productIdentity ?? null,
        governancePolicyIdentity: releaseRuntime.governancePolicyIdentity ?? null,
        governanceTransitionStatus: releaseRuntime.governanceTransitionStatus ?? null,
        governanceTransitionStep: releaseRuntime.governanceTransitionStep ?? null,
        failureCode: releaseRuntime.failureCode ?? null,
      }),
    });
    const releaseMode = releaseRuntime.mode;
    if (releaseRuntime.failureCode) {
      await this.recordModelFailure({
        runId,
        stepKey: 'production_runtime_baseline',
        layer: 'governance',
        stage: 'prepare',
        code: releaseRuntime.failureCode,
      });
      return this.modelFailure(releaseRuntime.failureCode, this.modelMetadata('prepare'));
    }
    if (this.isModelSingleToolPathEnabled(releaseMode)) {
      if (this.conversationContext && this.isGenericObjectiveQuestion(inputDto.message)) {
        const genericContextStartedAt = Date.now();
        try {
          const genericPrepared = await this.conversationContext.prepareModelTurn({
            conversationId,
            dto: inputDto,
          });
          await this.recordModelTrace({
            runId,
            stepKey: 'generic_objective_context_preflight',
            layer: 'memory',
            status: 'completed',
            latencyMs: Date.now() - genericContextStartedAt,
            output: this.toJsonValue({ hasPreviousContext: Boolean(genericPrepared.previous) }),
          });
          if (!genericPrepared.previous) {
            const genericObjectiveClarification = this.answerFromGenericQuestionAmbiguity({
              question: inputDto.message,
              modelMetadata: this.modelMetadata('prepare'),
            });
            if (genericObjectiveClarification) {
              await this.recordModelTrace({
                runId,
                stepKey: 'generic_objective_clarification_preflight',
                layer: 'cognition',
                status: 'completed',
                output: this.toJsonValue({ code: 'GENERIC_OBJECTIVE_CLARIFICATION_REQUIRED' }),
              });
              return genericObjectiveClarification;
            }
          }
        } catch (error) {
          await this.recordModelTrace({
            runId,
            stepKey: 'generic_objective_context_preflight',
            layer: 'memory',
            status: 'failed',
            latencyMs: Date.now() - genericContextStartedAt,
            error: { message: this.errorMessage(error) } as Prisma.InputJsonValue,
          });
        }
      }
      const deadlineAt = Date.now() + this.runtimeConfig!.runtime.totalTimeoutMs;
      const capabilityCatalogPreload =
        releaseRuntime.capabilityCandidates !== undefined && this.capabilityCatalog
          ? this.preloadCapabilityCatalog(releaseRuntime.capabilityCandidates)
          : undefined;
      const releaseSnapshotStartedAt = Date.now();
      const releaseSnapshot = await this.loadReleaseOntologySnapshot(releaseRuntime.capabilityCandidates);
      await this.recordModelTrace({
        runId,
        stepKey: 'release_ontology_snapshot_load',
        layer: 'governance',
        status: releaseSnapshot ? 'completed' : 'failed',
        latencyMs: Date.now() - releaseSnapshotStartedAt,
        output: this.toJsonValue({
          fingerprint: releaseSnapshot?.fingerprint ?? null,
          capabilityCandidateCount: releaseRuntime.capabilityCandidates?.length ?? null,
        }),
      });
      let prepared: Awaited<ReturnType<BrainConversationContextService['prepareModelTurn']>> | undefined;
      let modelConversationContextReadSucceeded = false;
      if (this.conversationContext) {
        const conversationContextStartedAt = Date.now();
        try {
          prepared = await this.conversationContext.prepareModelTurn({
            conversationId,
            dto: inputDto,
            snapshot: releaseSnapshot,
          });
          modelConversationContextReadSucceeded = true;
          await this.recordModelTrace({
            runId,
            stepKey: 'model_conversation_context_read',
            layer: 'memory',
            status: 'completed',
            latencyMs: Date.now() - conversationContextStartedAt,
            output: this.toJsonValue(this.modelConversationContextReadTrace(prepared)),
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
            latencyMs: Date.now() - conversationContextStartedAt,
            error: { message: this.errorMessage(error) } as Prisma.InputJsonValue,
          });
        }
      }
      if (modelConversationContextReadSucceeded && !prepared?.previous) {
        const genericObjectiveClarification = this.answerFromGenericQuestionAmbiguity({
          question: inputDto.message,
          modelMetadata: this.modelMetadata('prepare'),
        });
        if (genericObjectiveClarification) {
          await this.recordModelTrace({
            runId,
            stepKey: 'generic_objective_clarification_preflight',
            layer: 'cognition',
            status: 'completed',
            output: this.toJsonValue({ code: 'GENERIC_OBJECTIVE_CLARIFICATION_REQUIRED' }),
          });
          return genericObjectiveClarification;
        }
      }
      const longTermMemory = await this.loadLongTermMemorySlots({ context, question: inputDto.message, runId });
      const answer = await this.buildModelSingleToolAnswer({
        context,
        dto: inputDto,
        runId,
        conversationId,
        deadlineAt,
        conversationSlots: {
          ...(prepared?.previous ?? {}),
          ...(prepared?.directives ? { turnDirectives: prepared.directives } : {}),
          ...(longTermMemory.length
            ? {
                longTermMemory: {
                  policy: 'explicit_preferences_and_decisions_only',
                  priority: 'user_correction_over_store_default_over_model_inference',
                  items: longTermMemory,
                },
              }
            : {}),
        },
        capabilityCandidates: releaseRuntime.capabilityCandidates,
        capabilityCatalogPreload,
        snapshot: releaseSnapshot,
        releaseIdentity: releaseRuntime.releaseIdentity,
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
      const conversationContextStartedAt = Date.now();
      try {
        prepared = await this.conversationContext.prepareTurn({
          conversationId,
          dto: inputDto,
          cognition: initialCognition,
          runtimeIntent: initialRuntimeIntent,
        });
        await this.traceService.recordStep({
          runId,
          stepKey: 'conversation_context_read',
          layer: 'memory',
          status: 'completed',
          latencyMs: Date.now() - conversationContextStartedAt,
          output: this.toJsonValue({
            inheritedSlotCount: prepared.inheritedSlots.length,
            correctionCount: prepared.corrections.length,
          }),
        });
      } catch (error) {
        await this.traceService.recordStep({
          runId,
          stepKey: 'conversation_context_read',
          layer: 'memory',
          status: 'failed',
          latencyMs: Date.now() - conversationContextStartedAt,
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
    if (runtime?.runtimeSource === 'database') return false;
    return Boolean(runtime?.cognitionMode === 'model' && runtime.plannerMode === 'model' && runtime.singleToolFastPath);
  }

  private async resolveResponseProductProfile(context: BrainRequestContext): Promise<{
    productProfile: string | null;
    actionsEnabled: boolean;
    actionExecutionPolicy: string | null;
    allowedCapabilityManifest: string | null;
    productProfileFingerprint: string | null;
  }> {
    const evaluationProfile = context.governanceEvalReleaseSnapshot?.productProfile;
    if (evaluationProfile) {
      return {
        productProfile: evaluationProfile.productProfile,
        actionsEnabled: evaluationProfile.actionsEnabled,
        actionExecutionPolicy: evaluationProfile.actionExecutionPolicy,
        allowedCapabilityManifest: evaluationProfile.allowedCapabilityManifest,
        productProfileFingerprint: evaluationProfile.productProfileFingerprint,
      };
    }
    if (!this.releaseService || typeof this.releaseService.resolveActionExecutionPolicy !== 'function') {
      return {
        productProfile: null,
        actionsEnabled: true,
        actionExecutionPolicy: null,
        allowedCapabilityManifest: null,
        productProfileFingerprint: null,
      };
    }
    try {
      const policy = await this.releaseService.resolveActionExecutionPolicy({
        storeId: context.storeId,
        userId: context.userId,
        roleKey: this.modelRoleFromContext(context),
      });
      return {
        productProfile: policy.currentProfile.productProfile,
        actionsEnabled: policy.allowed,
        actionExecutionPolicy: policy.currentProfile.actionExecutionPolicy,
        allowedCapabilityManifest: policy.currentProfile.allowedCapabilityManifest,
        productProfileFingerprint: policy.currentProfile.productProfileFingerprint,
      };
    } catch {
      return {
        productProfile: null,
        actionsEnabled: false,
        actionExecutionPolicy: 'deny_on_policy_unavailable',
        allowedCapabilityManifest: null,
        productProfileFingerprint: null,
      };
    }
  }

  private async resolveReleaseRuntime(context: BrainRequestContext): Promise<{
    mode?: 'rules' | 'shadow' | 'model';
    releaseKey?: string;
    capabilityCandidates?: readonly BrainCapabilityCandidate[];
    releaseIdentity?: BrainActionReleaseIdentity;
    governancePolicy?: {
      releaseId: number;
      mode: 'shadow' | 'enforced';
      blockedCapabilityKeys: readonly string[];
    };
    productIdentity?: {
      family: string;
      code: string;
      stageCode: string | null;
      name: string;
      internalReleaseId: number | null;
    } | null;
    governancePolicyIdentity?: {
      family: string;
      code: string;
      stageCode: string | null;
      name: string;
      internalReleaseId: number | null;
    } | null;
    governanceTransitionStatus?: string | null;
    governanceTransitionStep?: string | null;
    productProfile?: {
      productProfile: string | null;
      actionsEnabled: boolean;
      actionExecutionPolicy: string | null;
      allowedCapabilityManifest: string | null;
      allowedCapabilityCount: number | null;
      sideEffectCapabilityCount: number | null;
      productProfileFingerprint: string | null;
    };
    evaluationIdentity?: {
      family: string;
      code: string;
      stageCode: string | null;
      name: string;
      internalReleaseId: number | null;
    };
    failureCode?: 'PRODUCTION_BASELINE_UNAVAILABLE' | 'PRODUCTION_BASELINE_INVALID';
  }> {
    if (context.governanceEvalReleaseSnapshot) {
      return {
        mode: context.governanceEvalReleaseSnapshot.mode,
        releaseKey: context.governanceEvalReleaseSnapshot.releaseKey,
        capabilityCandidates: context.governanceEvalReleaseSnapshot.capabilityCandidates,
        releaseIdentity: {
          releaseId: context.governanceEvalReleaseSnapshot.releaseId,
          releaseFingerprint: context.governanceEvalReleaseSnapshot.releaseFingerprint,
        },
        productProfile: context.governanceEvalReleaseSnapshot.productProfile,
        evaluationIdentity: context.governanceEvalReleaseSnapshot.evaluationIdentity,
      };
    }
    if (!this.releaseService) {
      return this.runtimeConfig?.runtime.runtimeSource === 'database'
        ? { failureCode: 'PRODUCTION_BASELINE_UNAVAILABLE' }
        : {};
    }
    try {
      const resolved = await this.releaseService.resolveRuntimeMode({
        storeId: context.storeId,
        userId: context.userId,
        roleKey: this.modelRoleFromContext(context),
        evaluationReleaseId: context.governanceEvalReleaseId,
      });
      const mode =
        resolved.mode === 'rules' || resolved.mode === 'shadow' || resolved.mode === 'model'
          ? resolved.mode
          : undefined;
      if (!resolved.release || !mode) return { failureCode: 'PRODUCTION_BASELINE_UNAVAILABLE' };
      if (mode === 'rules') return { failureCode: 'PRODUCTION_BASELINE_INVALID' };
      if (!resolved.capabilityCandidates?.length) return { failureCode: 'PRODUCTION_BASELINE_INVALID' };
      const releaseIdentity = this.releaseIdentityFromRuntime(resolved);
      return {
        mode,
        releaseKey: resolved.release.releaseKey,
        capabilityCandidates: resolved.capabilityCandidates,
        ...(releaseIdentity ? { releaseIdentity } : {}),
        ...(resolved.governancePolicy ? { governancePolicy: resolved.governancePolicy } : {}),
        productProfile: resolved.productProfile,
        productIdentity: resolved.productIdentity ?? null,
        governancePolicyIdentity: resolved.governancePolicyIdentity ?? null,
        governanceTransitionStatus: resolved.governanceTransitionStatus ?? null,
        governanceTransitionStep: resolved.governanceTransitionStep ?? null,
      };
    } catch (error) {
      if (context.governanceEvalReleaseId !== undefined) throw error;
      return { failureCode: 'PRODUCTION_BASELINE_UNAVAILABLE' };
    }
  }

  private async loadReleaseOntologySnapshot(
    capabilityCandidates?: readonly BrainCapabilityCandidate[],
  ): Promise<ProductionReadyBusinessDefinitionSnapshot | null> {
    const productionSnapshot = this.ontologyRuntime?.getSnapshot() ?? null;
    if (capabilityCandidates === undefined || !this.ontologyRuntime) {
      return productionSnapshot;
    }

    const definitionVersionIds = extractBrainReleaseDefinitionVersionIds(capabilityCandidates);

    try {
      return await this.ontologyRuntime.loadEvaluationSnapshot(definitionVersionIds);
    } catch {
      return null;
    }
  }

  private releaseIdentityFromRuntime(value: unknown): BrainActionReleaseIdentity | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const runtime = value as Record<string, unknown>;
    const frozen = runtime.releaseSnapshot;
    if (frozen && typeof frozen === 'object' && !Array.isArray(frozen)) {
      const snapshot = frozen as Record<string, unknown>;
      if (
        Number.isInteger(snapshot.releaseId) &&
        typeof snapshot.releaseFingerprint === 'string' &&
        /^[a-f0-9]{64}$/u.test(snapshot.releaseFingerprint)
      ) {
        return {
          releaseId: snapshot.releaseId as number,
          releaseFingerprint: snapshot.releaseFingerprint,
        };
      }
    }
    const releaseValue = runtime.release;
    if (!releaseValue || typeof releaseValue !== 'object' || Array.isArray(releaseValue)) return undefined;
    const release = releaseValue as Record<string, unknown>;
    if (!Number.isInteger(release.id) || !Array.isArray(release.items) || release.items.length === 0) return undefined;
    try {
      return {
        releaseId: release.id as number,
        releaseFingerprint: createReleaseFingerprint(release.items as never, release.rollout),
      };
    } catch {
      return undefined;
    }
  }

  private actionExecutionProvenance(
    intent: BrainSemanticIntent,
    action: BusinessActionDefinitionSnapshot,
    card: BrainCapabilityCard,
    snapshot: ProductionReadyBusinessDefinitionSnapshot,
    context: BrainRequestContext,
    runId: number,
    conversationId: number,
    qualifiedRole: BrainDomainRole,
    resultSets: readonly BrainModelResultSet[],
    release?: BrainActionReleaseIdentity,
  ): BrainActionExecutionProvenance {
    if (!intent.actionRef) throw new Error('action_execution_provenance_ref_missing');
    const binding = action.capabilityBindings.find(
      (candidate) =>
        candidate.enabled && candidate.bindingMode === 'preview_and_execute' && candidate.capabilityKey === card.key,
    );
    if (!binding) throw new Error('action_execution_provenance_binding_missing');
    const gatewayActionKey = binding.gatewayActionKey?.trim() || card.key;
    const resultReferenceIds = [
      ...new Set(
        (intent.actionSlots ?? [])
          .map((slot) => slot.resultReferenceId?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const informationArtifacts = resultReferenceIds.map((refId) => {
      const artifact = this.resultReferenceService.createInformationArtifact({
        refId,
        resultSets,
        scope: { conversationId, userId: context.userId, storeId: context.storeId },
        profileFingerprint: action.informationArtifact.fingerprint,
      });
      if (!artifact) throw new Error(`action_information_artifact_unavailable:${refId}`);
      return artifact;
    });
    const situationContext = createBrainActionSituationContext({
      profileFingerprint: action.situationContext.fingerprint,
      runId,
      conversationId,
      context,
      qualifiedRole,
    });
    const governedProfiles = action.participantProfile && action.relationProfile;
    const participants = governedProfiles
      ? createBrainActionExecutionParticipants({
          profile: action.participantProfile!,
          userId: context.userId,
          storeId: context.storeId,
          businessDate: situationContext.businessDate,
          gatewayActionKey,
          actionSlots: intent.actionSlots ?? [],
        })
      : undefined;
    return {
      schemaVersion: action.institutionalEffect ? '1.2' : governedProfiles ? '1.1' : '1.0',
      actionRef: { ...intent.actionRef },
      actionBindingFingerprint: action.bindingFingerprint,
      actionSituationContextProfileFingerprint: action.situationContext.fingerprint,
      actionModalityPolicyFingerprint: action.modalityPolicy.fingerprint,
      actionInformationArtifactProfileFingerprint: action.informationArtifact.fingerprint,
      actionSideEffectInvariantProfileFingerprint: action.sideEffectInvariant.fingerprint,
      ...(governedProfiles
        ? {
            actionParticipantProfileFingerprint: action.participantProfile!.fingerprint,
            actionRelationProfileFingerprint: action.relationProfile!.fingerprint,
            ...(action.institutionalEffect
              ? { actionInstitutionalEffectProfileFingerprint: action.institutionalEffect.fingerprint }
              : {}),
          }
        : {}),
      ontologySnapshotFingerprint: snapshot.fingerprint,
      situationContext,
      informationArtifacts,
      ...(participants ? { participants } : {}),
      capability: {
        key: card.key,
        version: card.version,
        sourceFingerprint: card.sourceFingerprint,
      },
      gatewayActionKey,
      ...(release ? { release: { ...release } } : {}),
    };
  }

  private async preloadCapabilityCatalog(
    capabilityCandidates: readonly BrainCapabilityCandidate[],
  ): Promise<BrainCapabilityCatalogPreloadResult> {
    const startedAt = Date.now();
    try {
      return {
        cards: await this.capabilityCatalog!.listEnabledCapabilities(capabilityCandidates),
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      return { error, latencyMs: Date.now() - startedAt };
    }
  }

  private async buildModelSingleToolAnswer(input: {
    context: BrainRequestContext;
    dto: SendBrainMessageDto;
    runId: number;
    conversationId: number;
    deadlineAt: number;
    conversationSlots: object;
    capabilityCandidates?: readonly BrainCapabilityCandidate[];
    capabilityCatalogPreload?: Promise<BrainCapabilityCatalogPreloadResult>;
    snapshot?: ProductionReadyBusinessDefinitionSnapshot | null;
    releaseIdentity?: BrainActionReleaseIdentity;
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
        status: 'failed',
        answer: currentBackendGap.answer,
        citations: [],
        suggestedActions: [],
        blocks: [{ kind: 'limitations', items: [currentBackendGap.answer] }],
        grounding: 'none',
        adapterMetadata: {
          unsupportedReason: currentBackendGap.unsupportedReason,
          scope: 'current_management_backend',
          completion: {
            status: 'incomplete',
            missingCriteria: [currentBackendGap.unsupportedReason],
            recoverable: false,
          },
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
      const roleContextStartedAt = Date.now();
      try {
        roleContext = await this.roleContextBuilder.build({ context: input.context, roleHint: input.dto.roleHint });
        await this.recordModelTrace({
          runId: input.runId,
          stepKey: 'model_role_context',
          layer: 'planning',
          status: 'completed',
          latencyMs: Date.now() - roleContextStartedAt,
          output: this.toJsonValue({ role: roleContext?.role ?? null }),
        });
      } catch (error) {
        await this.recordModelFailure({
          runId: input.runId,
          stepKey: 'model_role_context',
          layer: 'planning',
          stage: 'prepare',
          code: 'MODEL_ROLE_PROFILE_UNAVAILABLE',
          latencyMs: Date.now() - roleContextStartedAt,
          error,
        });
        return this.modelFailure('MODEL_ROLE_PROFILE_UNAVAILABLE', modelMetadata);
      }
    }
    const modelRequestContext = this.withBrainRole(input.context, roleContext?.role);

    let cards: readonly BrainCapabilityCard[];
    const capabilityCatalogWaitStartedAt = Date.now();
    try {
      const preloaded = input.capabilityCatalogPreload ? await input.capabilityCatalogPreload : undefined;
      if (preloaded?.error) throw preloaded.error;
      const catalogLoadStartedAt = Date.now();
      cards =
        preloaded?.cards ??
        (input.capabilityCandidates === undefined
          ? await this.capabilityCatalog!.listEnabledCapabilities()
          : await this.capabilityCatalog!.listEnabledCapabilities(input.capabilityCandidates));
      const catalogLoadLatencyMs = preloaded?.latencyMs ?? Date.now() - catalogLoadStartedAt;
      if (roleContext) cards = this.roleContextBuilder!.filterCapabilities(roleContext, input.context, cards);
      if (input.capabilityCandidates !== undefined && !input.snapshot) {
        const definitionVersionIds = [
          ...new Set(cards.flatMap((card) => (card.definitionRefs ?? []).map((ref) => ref.versionId))),
        ];
        snapshot = await this.ontologyRuntime!.loadEvaluationSnapshot(definitionVersionIds);
      }
      await this.recordModelTrace({
        runId: input.runId,
        stepKey: 'capability_catalog_snapshot',
        layer: 'planning',
        status: 'completed',
        latencyMs: Date.now() - capabilityCatalogWaitStartedAt,
        output: this.toJsonValue({
          capabilityCount: cards.length,
          capabilityKeys: cards.map((card) => card.key).sort(),
          semanticSnapshotFingerprint: snapshot?.fingerprint ?? null,
          decisionOrder: 'catalog_before_intent',
          preloadStartedBeforeOntologySnapshot: Boolean(input.capabilityCatalogPreload),
          phaseLatencyMs: { capabilityCatalogLoad: catalogLoadLatencyMs },
        }),
      });
    } catch (error) {
      await this.recordModelFailure({
        runId: input.runId,
        stepKey: 'capability_retrieval',
        layer: 'planning',
        stage: 'retrieve',
        code: 'MODEL_CATALOG_UNAVAILABLE',
        diagnosticCode: this.modelDiagnosticCode(error),
        latencyMs: Date.now() - capabilityCatalogWaitStartedAt,
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
    const catalogDiscoveryStartedAt = Date.now();
    const catalogDiscovery = this.capabilityRetriever!.discover({
      question: input.dto.message,
      context: modelRequestContext,
      cards,
      maxRisk: 'high',
    });
    await this.recordModelTrace({
      runId: input.runId,
      stepKey: 'capability_catalog_discovery',
      layer: 'planning',
      status: 'completed',
      latencyMs: Date.now() - catalogDiscoveryStartedAt,
      output: this.toJsonValue({
        status: catalogDiscovery.status,
        selectedCapabilityKey: catalogDiscovery.selected?.key ?? null,
        confidence: catalogDiscovery.confidence,
        margin: catalogDiscovery.margin,
        reason: catalogDiscovery.reason,
        topK: catalogDiscovery.topK.map((candidate) => ({
          capabilityKey: candidate.card.key,
          score: candidate.score,
          matchedFields: candidate.matchedFields,
        })),
      }),
    });

    const verifiedConversationSlots = await this.verifyConversationResultReferenceSlots({
      conversationId: input.conversationId,
      runId: input.runId,
      context: input.context,
      conversationSlots: this.modelConversationSlots(input.conversationSlots),
    });
    const referencePreflight = this.answerFromConversationReferencePreflight({
      question: input.dto.message,
      conversationSlots: verifiedConversationSlots,
      modelMetadata,
    });
    if (referencePreflight) {
      await this.recordModelTrace({
        runId: input.runId,
        stepKey: 'model_result_reference_preflight',
        layer: 'memory',
        status: 'completed',
        output: this.toJsonValue({
          decisionCode: referencePreflight.adapterMetadata?.decisionCode ?? 'RESULT_REFERENCE_PREFLIGHT',
        }),
      });
      return referencePreflight;
    }
    const controlledReferenceAnswer = await this.answerFromVerifiedConversationReferenceCapability({
      question: input.dto.message,
      conversationSlots: verifiedConversationSlots,
      cards,
      context: modelRequestContext,
      runId: input.runId,
      modelMetadata,
    });
    if (controlledReferenceAnswer) {
      await this.recordModelTrace({
        runId: input.runId,
        stepKey: 'verified_result_reference_capability',
        layer: 'execution',
        status: controlledReferenceAnswer.status === 'completed' ? 'completed' : 'failed',
        output: this.toJsonValue({
          capabilityKey: controlledReferenceAnswer.modelMetadata?.capabilityKey ?? null,
          resultRef: controlledReferenceAnswer.adapterMetadata?.resolvedResultRef ?? null,
        }),
      });
      return controlledReferenceAnswer;
    }
    const compilerConversationSlots = this.resultReferenceService.projectConversationSlotsForCompiler(
      input.dto.message,
      verifiedConversationSlots,
    );
    const continuationCapability = this.modelContinuationCapabilityCard(cards, compilerConversationSlots);
    const compilerCards = this.modelCompilerCapabilityCards(
      cards,
      catalogDiscovery.topK,
      catalogDiscovery.selected,
      continuationCapability,
      input.dto.message,
    );
    const compilerInput = {
      question: input.dto.message,
      deadlineAt: input.deadlineAt,
      audit: { userId: input.context.userId, storeId: input.context.storeId },
      timezone: this.normalizeShadowTimezone(input.dto.timezone ?? input.context.timezone),
      role: roleContext?.role ?? this.modelRoleFromContext(input.context),
      roleContext,
      conversationSlots: this.withModelCatalogMetadata(compilerConversationSlots, snapshot, cards),
      ontologySnapshot: snapshot,
      ontologyCandidates: this.modelOntologyCandidates(snapshot),
      metricRefs: snapshot.metrics.map((metric) => this.modelDefinitionRef('metric', metric)),
      dimensionRefs: snapshot.dimensions.map((dimension) => this.modelDefinitionRef('dimension', dimension)),
      capabilitySummaries: compilerCards.map((card) => ({
        key: card.key,
        name: card.name,
        description: card.description,
        domains: [...card.domains],
        intents: [...card.intents],
        examples: Array.isArray(card.examples) ? [...card.examples] : [],
        readOnly: card.readOnly,
        sideEffect: card.sideEffect,
        requiresConfirmation: card.requiresConfirmation,
        riskLevel: card.riskLevel,
        idempotency: card.idempotency,
        grounding: card.grounding,
        definitionRefs: (card.definitionRefs ?? []).flatMap((ref) => {
          const definitionType = ref.definitionKey.split('.')[0];
          if (!['entity', 'relation', 'metric', 'dimension', 'action'].includes(definitionType)) return [];
          return [
            {
              definitionType: definitionType as 'entity' | 'relation' | 'metric' | 'dimension' | 'action',
              definitionKey: ref.definitionKey,
              definitionVersion: ref.version,
              definitionFingerprint: ref.definitionFingerprint,
              sourceFingerprint: ref.sourceFingerprint,
            },
          ];
        }),
      })),
      rankedCapabilityKeys: catalogDiscovery.topK.map((candidate) => candidate.card.key),
      ...(catalogDiscovery.status === 'selected' && catalogDiscovery.selected
        ? { preferredCapabilityKey: catalogDiscovery.selected.key }
        : {}),
    };
    let compilation: Awaited<ReturnType<BrainSemanticIntentCompilerService['compile']>>;
    const compilationStartedAt = Date.now();
    try {
      compilation = await this.semanticIntentCompiler!.compile(compilerInput);
    } catch (error) {
      await this.recordModelFailure({
        runId: input.runId,
        stepKey: 'model_intent_compile',
        layer: 'cognition',
        stage: 'compile',
        code: 'MODEL_INTENT_UNAVAILABLE',
        latencyMs: Date.now() - compilationStartedAt,
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
        latencyMs: Date.now() - compilationStartedAt,
      });
      return this.modelFailure(failureCode, this.modelMetadata('compile'));
    }
    modelMetadata = this.modelMetadata('compile', {
      provider: compilation.provider,
      model: compilation.model,
      modelRouting: compilation.routing ?? null,
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
        routing: compilation.routing ?? null,
        selectedCapabilityKey: compilation.selectedCapabilityKey ?? null,
        semanticIntent: this.modelIntentTraceSummary(compilation.intent),
      }),
      status: 'completed',
      latencyMs: Date.now() - compilationStartedAt,
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
                      this.normalizeExplicitActionTargetIntent({
                        intent: this.enrichModelEntityRefs(compilation.intent, snapshot),
                        question: input.dto.message,
                      }),
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
    enrichedIntent = await this.enrichStoreScopedNamedEntityRefs({
      intent: enrichedIntent,
      question: input.dto.message,
      context: input.context,
      snapshot,
    });
    enrichedIntent = this.normalizeConversationResultReferenceIntent({
      intent: enrichedIntent,
      question: input.dto.message,
      conversationSlots: compilerInput.conversationSlots,
      scope: {
        conversationId: input.conversationId,
        userId: input.context.userId,
        storeId: input.context.storeId,
      },
    });
    enrichedIntent =
      this.intentCompleteness?.assess({
        intent: enrichedIntent,
        question: input.dto.message,
        snapshot,
        catalogAmbiguous: catalogDiscovery.status === 'clarify',
        conversationSlots: compilerInput.conversationSlots,
      }) ?? enrichedIntent;
    enrichedIntent = this.normalizeCustomerAnalyticsDefaults({
      intent: enrichedIntent,
      question: input.dto.message,
    });
    enrichedIntent = this.normalizeManagerStaffReleaseCoreAfterCompleteness({
      intent: enrichedIntent,
      question: input.dto.message,
      cards,
      timezone: this.normalizeShadowTimezone(input.dto.timezone ?? input.context.timezone),
    });
    enrichedIntent = this.normalizeExactGovernedCapabilityAfterCompleteness({
      intent: enrichedIntent,
      question: input.dto.message,
      cards,
      snapshot,
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
    const validationStartedAt = Date.now();
    try {
      validation = this.semanticIntentValidator!.validate(enrichedIntent, governedValidationScope, snapshot);
    } catch (error) {
      await this.recordModelFailure({
        runId: input.runId,
        stepKey: 'model_intent_validation',
        layer: 'cognition',
        stage: 'validate',
        code: 'MODEL_INTENT_INVALID',
        latencyMs: Date.now() - validationStartedAt,
        error,
      });
      return this.modelFailure('MODEL_INTENT_INVALID', this.modelMetadata('validate', modelMetadata));
    }
    if (
      enrichedIntent.intent !== 'clarify' &&
      validation.status !== 'valid' &&
      this.shouldRepairModelIntent(validation)
    ) {
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
                          this.normalizeExplicitActionTargetIntent({
                            intent: this.enrichModelEntityRefs(repairCompilation.intent, snapshot),
                            question: input.dto.message,
                          }),
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
        repairedIntent = await this.enrichStoreScopedNamedEntityRefs({
          intent: repairedIntent,
          question: input.dto.message,
          context: input.context,
          snapshot,
        });
        repairedIntent = this.normalizeConversationResultReferenceIntent({
          intent: repairedIntent,
          question: input.dto.message,
          conversationSlots: compilerInput.conversationSlots,
          scope: {
            conversationId: input.conversationId,
            userId: input.context.userId,
            storeId: input.context.storeId,
          },
        });
        repairedIntent =
          this.intentCompleteness?.assess({
            intent: repairedIntent,
            question: input.dto.message,
            snapshot,
            catalogAmbiguous: catalogDiscovery.status === 'clarify',
            conversationSlots: compilerInput.conversationSlots,
          }) ?? repairedIntent;
        repairedIntent = this.normalizeExactGovernedCapabilityAfterCompleteness({
          intent: repairedIntent,
          question: input.dto.message,
          cards,
          snapshot,
        });
        const repairedValidation = this.semanticIntentValidator!.validate(
          repairedIntent,
          governedValidationScope,
          snapshot,
        );
        compilation = repairCompilation;
        enrichedIntent = repairedIntent;
        validation = repairedValidation;
        modelMetadata = this.modelMetadata('compile', {
          provider: repairCompilation.provider,
          model: repairCompilation.model,
          modelRouting: repairCompilation.routing ?? null,
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
        status: 'failed',
        answer: `${capabilityBoundary.reason} Ami Brain 不会用相近指标、概览数据或推测结果替代。`,
        citations: [],
        suggestedActions: [],
        blocks: [{ kind: 'limitations', items: [capabilityBoundary.reason] }],
        grounding: 'none',
        adapterMetadata: {
          unsupportedReason: capabilityBoundary.code,
          boundaryStatus: capabilityBoundary.status,
          completion: { status: 'incomplete', missingCriteria: [capabilityBoundary.code], recoverable: false },
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
        latencyMs: Date.now() - validationStartedAt,
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
        latencyMs: Date.now() - validationStartedAt,
      });
      return this.modelFailure('MODEL_INTENT_INVALID', this.modelMetadata('validate', modelMetadata));
    }
    modelMetadata = this.modelMetadata('validate', modelMetadata);
    await this.recordModelTrace({
      runId: input.runId,
      stepKey: 'model_intent_validation',
      layer: 'cognition',
      output: { status: 'valid', stage: 'validate', code: 'MODEL_INTENT_VALID' },
      status: 'completed',
      latencyMs: Date.now() - validationStartedAt,
    });

    const negatedActionAnswer = this.answerFromNegatedActionIntent({
      intent: validation.intent,
      snapshot,
      modelMetadata,
    });
    if (negatedActionAnswer) {
      await this.recordModelTrace({
        runId: input.runId,
        stepKey: 'model_negated_action_noop',
        layer: 'planning',
        status: 'completed',
        output: this.toJsonValue({
          code: 'NEGATED_ACTION_NOOP',
          actionKey: validation.intent.actionRef?.definitionKey ?? null,
          actionPolarity: validation.intent.actionPolarity ?? null,
          negatedActionKeys: validation.intent.negatedActionRefs?.map((ref) => ref.definitionKey) ?? [],
          businessStateChanged: false,
          executionStatus: 'not_executed',
        }),
      });
      return negatedActionAnswer;
    }

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
        latencyMs: Date.now() - validationStartedAt,
      });
      return this.modelFailure(
        'CAPABILITY_CONTRACT_MISMATCH',
        this.modelMetadata('validate', modelMetadata),
        validation.intent,
      );
    }

    const governedExampleCard = this.findGovernedCapabilityExampleCard(input.dto.message, cards);
    const reservationProjectRankingCard = this.findReservationProjectRankingCapabilityCard(validation.intent, cards);
    const managerStaffDirectoryCard = this.findManagerStaffDirectoryCapabilityCard(
      input.dto.message,
      validation.intent,
      cards,
    );
    const pendingCapabilityCard = this.resolvePendingClarificationCapability(
      compilerInput.conversationSlots,
      validation.intent,
      cards,
    );
    const customerFactsCard = this.findDeterministicCustomerFactsCard(input.dto.message, validation.intent, cards);
    const projectCatalogCard = this.findProjectCatalogCapabilityCard(input.dto.message, validation.intent, cards);
    const modelSelectedDeliveryCard = this.resolveModelSelectedDeliveryCapability({
      selectedCapabilityKey: compilation.selectedCapabilityKey,
      intent: validation.intent,
      question: input.dto.message,
      cards,
      catalogTopK: catalogDiscovery.topK,
    });
    const deterministicCapabilityCard =
      validation.intent.intent === 'action'
        ? undefined
        : (reservationProjectRankingCard ??
          managerStaffDirectoryCard ??
          governedExampleCard ??
          pendingCapabilityCard ??
          continuationCapability ??
          customerFactsCard ??
          projectCatalogCard ??
          modelSelectedDeliveryCard);
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

    const actionDefinition = validation.intent.actionRef
      ? snapshot.actions.find(
          (action) =>
            action.definitionKey === validation.intent.actionRef!.definitionKey &&
            action.version === validation.intent.actionRef!.definitionVersion &&
            action.definitionFingerprint === validation.intent.actionRef!.definitionFingerprint &&
            action.sourceFingerprint === validation.intent.actionRef!.sourceFingerprint,
        )
      : undefined;
    const capabilityRetrievalStartedAt = Date.now();
    const rawRetrieval: ReturnType<BrainCapabilityRetrieverService['retrieve']> = deterministicCapabilityCard
      ? {
          status: 'selected',
          selected: deterministicCapabilityCard,
          topK: [
            {
              card: deterministicCapabilityCard,
              score: 1,
              matchedFields: [
                reservationProjectRankingCard
                  ? 'reservation_project_ranking_contract'
                  : managerStaffDirectoryCard
                    ? 'manager_staff_directory_contract'
                    : governedExampleCard
                      ? 'examples'
                      : pendingCapabilityCard
                        ? 'pending_clarification'
                        : continuationCapability
                          ? 'conversation_continuation'
                          : customerFactsCard
                            ? 'customer_identity'
                            : modelSelectedDeliveryCard
                              ? 'model_delivery_contract'
                              : 'retrieval',
              ],
            },
          ],
          confidence: 1,
          margin: 1,
          reason: reservationProjectRankingCard
            ? 'reservation_project_ranking_contract_selected'
            : managerStaffDirectoryCard
              ? 'manager_staff_directory_contract_selected'
              : governedExampleCard
                ? 'governed_example_selected'
                : pendingCapabilityCard
                  ? 'pending_clarification_capability_reused'
                  : continuationCapability
                    ? 'conversation_continuation_capability_reused'
                    : customerFactsCard
                      ? 'specific_customer_fact_selected'
                      : modelSelectedDeliveryCard
                        ? 'model_delivery_contract_selected'
                        : 'capability_retrieval_result',
        }
      : this.capabilityRetriever!.retrieve({
          intent: validation.intent,
          question: input.dto.message,
          context: modelRequestContext,
          cards,
          readOnlyOnly: validation.intent.intent !== 'action',
          maxRisk: validation.intent.intent === 'action' ? 'high' : 'low',
          actionDefinition,
        });
    const retrieval = rawRetrieval;
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
        reason: controlledCapabilityRetrievalReason(retrieval.reason),
        capabilityKey: retrieval.selected?.key ?? null,
        capabilityVersion: retrieval.selected?.version ?? null,
        actionRef: validation.intent.actionRef ?? null,
        actionBindingFingerprint: actionDefinition?.bindingFingerprint ?? null,
      }),
      status: retrieval.status === 'selected' ? 'completed' : 'failed',
      latencyMs: Date.now() - capabilityRetrievalStartedAt,
    });
    if (retrieval.status === 'clarify' && retrieval.topK.length > 0 && validation.intent.intent !== 'action') {
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
    const capabilityGovernedIntent = this.normalizeReadOnlyPreviewCapabilityIntent(
      this.normalizeReservationProjectRankingCapabilityIntent(validation.intent, retrieval.selected),
      retrieval.selected,
    );
    const managerStaffGovernedIntent = this.normalizeManagerStaffDirectoryCapabilityIntent(
      capabilityGovernedIntent,
      retrieval.selected,
      input.dto.message,
    );
    if (managerStaffGovernedIntent !== validation.intent) {
      validation = { ...validation, intent: managerStaffGovernedIntent };
    }
    const contractMismatches = findCapabilityContractMissingDefinitions(
      validation.intent,
      retrieval.selected,
      input.dto.message,
      {
        exactGovernedExample:
          governedExampleCard?.key === retrieval.selected.key ||
          customerFactsCard?.key === retrieval.selected.key ||
          managerStaffDirectoryCard?.key === retrieval.selected.key,
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

    const planningStartedAt = Date.now();
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
      latencyMs: Date.now() - planningStartedAt,
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
    const planValidationStartedAt = Date.now();
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
        latencyMs: Date.now() - planValidationStartedAt,
        error,
      });
      return this.modelFailure('MODEL_PLAN_INVALID', modelMetadata);
    }
    const node = plan.nodes[0];
    if (!node) {
      await this.recordModelFailure({
        runId: input.runId,
        stepKey: 'single_step_plan_validation',
        layer: 'planning',
        stage: 'plan',
        code: 'MODEL_PLAN_INVALID',
        diagnosticCode: 'PLAN_NODE_MISSING',
        latencyMs: Date.now() - planValidationStartedAt,
      });
      return this.modelFailure('MODEL_PLAN_INVALID', modelMetadata);
    }
    const card = cards.find(
      (candidate) => candidate.key === node.capabilityKey && candidate.version === node.capabilityVersion,
    );
    if (!card) {
      await this.recordModelFailure({
        runId: input.runId,
        stepKey: 'single_step_plan_validation',
        layer: 'planning',
        stage: 'plan',
        code: 'MODEL_PLAN_INVALID',
        diagnosticCode: 'PLAN_CAPABILITY_MISSING',
        latencyMs: Date.now() - planValidationStartedAt,
      });
      return this.modelFailure('MODEL_PLAN_INVALID', modelMetadata);
    }
    await this.recordModelTrace({
      runId: input.runId,
      stepKey: 'single_step_plan_validation',
      layer: 'planning',
      status: 'completed',
      latencyMs: Date.now() - planValidationStartedAt,
      output: this.toJsonValue({ planId: plan.planId, nodeCount: plan.nodes.length }),
    });

    const capabilityExecutionStartedAt = Date.now();
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
        ...(actionDefinition
          ? {
              actionProvenance: this.actionExecutionProvenance(
                validation.intent,
                actionDefinition,
                card,
                snapshot,
                input.context,
                input.runId,
                input.conversationId,
                roleContext?.role ?? this.modelRoleFromContext(input.context),
                this.modelContextResultSets(compilerInput.conversationSlots),
                input.releaseIdentity,
              ),
            }
          : {}),
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
          executionDeduplication: execution.metadata?.executionDeduplication ?? null,
        }),
        status: execution.status === 'completed' ? 'completed' : 'failed',
        latencyMs: Date.now() - capabilityExecutionStartedAt,
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
      const answerCompositionStartedAt = Date.now();
      const grounded =
        execution.grounding === 'none'
          ? undefined
          : this.groundedAnswerComposer?.composeDomainAnswer(execution, validation.intent);
      await this.recordModelTrace({
        runId: input.runId,
        stepKey: 'model_answer_compose',
        layer: 'response',
        output: this.toJsonValue({ capabilityKey: card.key, capabilityVersion: card.version, planId: plan.planId }),
        status: 'completed',
        latencyMs: Date.now() - answerCompositionStartedAt,
      });
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
        diagnosticDetail: this.modelDiagnosticDetail(error),
        latencyMs: Date.now() - capabilityExecutionStartedAt,
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
      /(?:皮肤|肤质).*(?:敏感|易敏)|(?:敏感|易敏).*(?:护理方案|项目|护理).*(?:安全|合适)/.test(input.question);
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
      /(?:各|每个).*(?:项目).*(?:收入|营收).*(?:占比|比例)|(?:项目).*(?:收入|营收).*(?:占比|比例)/.test(input.question);
    const cardPackageSalesIntent =
      matched.key === 'finance_risk_overview' &&
      /(?:次卡|套餐卡).*(?:销售|开卡).*(?:金额|多少)|(?:次卡|套餐卡).*(?:卖了多少)/.test(input.question);
    const discountAmountAndRateIntent =
      matched.key === 'finance_risk_overview' &&
      /(?:折扣|优惠).*(?:总金额|金额).*(?:折扣率)|(?:折扣率).*(?:折扣|优惠).*(?:总金额|金额)/.test(input.question);
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
    const marketingStrategyId =
      matched.key === 'marketing_strategy_execute_preview'
        ? input.question.match(/(?:营销|触达)策略\s*[#：:]?\s*(\d+)/)?.[1]
        : undefined;
    const normalizedEntities = input.intent.entities.map((entity) =>
      marketingStrategyId && entity.entityType === 'marketing_strategy' && !entity.entityKey
        ? { ...entity, entityKey: marketingStrategyId }
        : entity,
    );
    const entities =
      marketingStrategyId && !normalizedEntities.some((entity) => entity.entityType === 'marketing_strategy')
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
    const supportedFilterDefinitionKeys = new Set(
      (matched.definitionRefs ?? [])
        .filter((ref) => matched.key === 'customer_facts' && ref.definitionKey === 'dimension.customerLevel')
        .map((ref) => ref.definitionKey),
    );
    const filters = input.intent.filters.filter(
      (filter) =>
        filter.fieldRef.definitionType === 'dimension' &&
        supportedFilterDefinitionKeys.has(filter.fieldRef.definitionKey),
    );
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
      projectIncomeShareIntent ||
      storedBalanceRiskIntent ||
      staffAvailabilityIntent ||
      pendingArrivalListIntent ||
      cardPackageSalesIntent
        ? []
        : governedMetrics.length
          ? governedMetrics
          : input.intent.metrics;
    const orderBy =
      governedMetrics.length &&
      (input.intent.intent === 'ranking' || orderedRankingIntent || productMarginRankingIntent)
        ? [{ definitionRef: governedMetrics[0]!, direction: 'desc' as const }]
        : input.intent.orderBy;
    const actionDefinitionMissing = input.intent.intent === 'action' && !input.intent.actionRef;
    return {
      ...input.intent,
      ...(actionDefinitionMissing
        ? { schemaVersion: '1.1' as const, actionPolarity: input.intent.actionPolarity ?? ('affirmative' as const) }
        : {}),
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
      ...(sensitiveCareGuidanceIntent ? { intent: 'recommendation' as const, answerShape: 'diagnosis' as const } : {}),
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
      filters,
      ambiguities: [],
      missingSlots: actionDefinitionMissing ? ['actionDefinition'] : [],
    };
  }

  private normalizeExactGovernedCapabilityAfterCompleteness(input: {
    intent: BrainSemanticIntent;
    question: string;
    cards: readonly BrainCapabilityCard[];
    snapshot: ProductionReadyBusinessDefinitionSnapshot;
  }): BrainSemanticIntent {
    if (!this.findExactGovernedCapabilityExampleCard(input.question, input.cards)) return input.intent;
    const normalized = this.normalizeGovernedCapabilityExampleIntent(input);
    const preservedMissingSlots = input.intent.missingSlots.filter(
      (slot) => slot.trim().toLocaleLowerCase('zh-CN') !== 'metric',
    );
    const preservedAmbiguities = input.intent.ambiguities.filter(
      (ambiguity) => ambiguity.slot.trim().toLocaleLowerCase('zh-CN') !== 'metric',
    );
    return {
      ...normalized,
      missingSlots: [...new Set([...normalized.missingSlots, ...preservedMissingSlots])],
      ambiguities: preservedAmbiguities,
    };
  }

  private normalizeReadOnlyQuestionIntent(input: {
    intent: BrainSemanticIntent;
    question: string;
    cards: readonly BrainCapabilityCard[];
  }): BrainSemanticIntent {
    const paymentBreakdownQuestion =
      input.cards.some((card) => card.key === 'finance_payment_breakdown') &&
      /(?:支付方式|收款渠道)/.test(input.question) &&
      /(?:拆分|分别|各种|怎么分|各多少)/.test(input.question);
    if (paymentBreakdownQuestion) {
      input = {
        ...input,
        intent: {
          ...input.intent,
          intent: 'query',
          answerShape: 'list',
          ambiguities: input.intent.ambiguities.filter((item) => item.slot !== 'comparisonTarget'),
          missingSlots: input.intent.missingSlots.filter((slot) => slot !== 'comparisonTarget'),
        },
      };
    }
    const explicitSideEffect = this.hasExplicitSideEffectRequest(input.question);
    if (input.intent.intent !== 'action' && explicitSideEffect) {
      return {
        ...input.intent,
        schemaVersion: '1.1',
        intent: 'action',
        answerShape: 'action_preview',
        actionPolarity: input.intent.actionPolarity ?? 'affirmative',
        missingSlots: input.intent.actionRef
          ? input.intent.missingSlots
          : [...new Set([...input.intent.missingSlots, 'actionDefinition'])],
        successCriteria: [...input.intent.successCriteria, '生成待确认操作预览，用户确认前不发送消息或写入业务数据'],
        assumptions: [
          ...input.intent.assumptions,
          '用户明确要求发送或执行，按受控动作处理，不把动作请求降级为普通文案。',
        ],
      };
    }
    if (input.intent.intent !== 'action' || explicitSideEffect) {
      return input.intent;
    }
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
      ) ||
      /^(?:帮我|请|替我|给我|能不能|可以|是否可以)\s*(?:约|预约)(?:一下|一个|一位)?/.test(normalized) ||
      /^(?:给|向).{0,20}发(?:个|一条)?.{0,12}(?:通知|消息|短信)/.test(normalized) ||
      /^(?:(?:帮我|请|直接|立即|马上|替我|给我|能不能|可以|是否可以)\s*)?(?:把|将).{1,48}(?:改到|改成|取消|提交)/.test(
        normalized,
      ) ||
      /^(?:(?:帮我|请|直接|立即|马上|替我|给我|能不能|可以|是否可以)\s*)?(?:把|将).{1,64}(?:升到|降到|设为|设置为|调价|上架|下架|发布|修改|更新|加上|添加|移除|删除|安排|配置)/.test(
        normalized,
      ) ||
      /^(?:给|为).{1,48}(?:加个|加上|添加|设置|安排|调价|配置|创建|新建|更新|修改|发布|上架|下架)/.test(normalized) ||
      /^(?:帮|替).{1,48}(?:创建|新建|修改|更新|改约|取消|核销|扣次|退款|发送|发布|保存|记录|提交|安排|配置|调价|上架|下架)/.test(
        normalized,
      ) ||
      /^(?:(?:帮我|请|直接|立即|马上|替我|给我)\s*)?(?:发布|上架|下架|配置|调价|排班|智能排班|一键智能排)/.test(
        normalized,
      ) ||
      /^(?:(?:帮我|请|直接|立即|马上|替我|给我)\s*)?(?:启动|执行|运行).{0,48}(?:策略|任务|流程|触达|方案)/.test(
        normalized,
      ) ||
      /^(?:(?:帮我|请|替我|给我)\s*)?(?:生成|准备|创建).{0,48}(?:预览|待确认.{0,12}(?:任务|操作|方案)|确认方案)/.test(
        normalized,
      ) ||
      /^(?:给|为).{0,24}(?:准备|生成|创建).{0,32}(?:预览|待确认.{0,12}(?:任务|操作|方案)|确认方案|预约方案)/.test(
        normalized,
      ) ||
      /^(?:先)?预览.{0,48}(?:取消|完成|核销|划扣|预约|触达|任务|策略)/.test(normalized) ||
      /^(?:先)?预览.{0,48}(?:排班|调班|休假|上下架|调价|配置|方案)/.test(normalized)
    );
  }

  private buildActionExecutionDisabledAnswer(productProfile: {
    productProfile: string | null;
    actionExecutionPolicy: string | null;
  }): BrainChatAnswer {
    const answer =
      '当前运行版本只支持查询与分析，动作执行已关闭。本次未生成动作预览，未进入确认或重试，也未写入任何业务数据；如需变更，请在对应业务页面由有权限的用户完成。';
    return {
      status: 'completed',
      answer,
      citations: [],
      suggestedActions: [],
      blocks: [{ kind: 'limitations', items: [answer] }],
      grounding: 'none',
      adapterMetadata: {
        decisionCode: 'action_execution_denied_by_product_profile',
        reason: 'brain_action_execution_disabled_by_release_profile',
        productProfile: productProfile.productProfile,
        actionExecutionPolicy: productProfile.actionExecutionPolicy,
        previewCreated: false,
        confirmationCreated: false,
        retryCreated: false,
        businessStateChanged: false,
        completion: { status: 'complete', missingCriteria: [], recoverable: false },
      },
    };
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
      actionKey: intent.actionRef?.definitionKey ?? null,
      actionPolarity: intent.actionPolarity ?? null,
      actionModality: intent.actionModality ?? null,
      negatedActionKeys: intent.negatedActionRefs?.map((item) => item.definitionKey) ?? [],
      missingSlots: [...intent.missingSlots],
      ambiguities: intent.ambiguities.map((item) => ({ slot: item.slot, reason: item.reason })),
    };
  }

  private answerFromNegatedActionIntent(input: {
    intent: BrainSemanticIntent;
    snapshot: ProductionReadyBusinessDefinitionSnapshot;
    modelMetadata: BrainModelMetadata;
  }): BrainChatAnswer | undefined {
    if (input.intent.intent !== 'action' || input.intent.actionPolarity !== 'negated' || !input.intent.actionRef) {
      return undefined;
    }
    const action = input.snapshot.actions.find(
      (candidate) =>
        candidate.definitionKey === input.intent.actionRef!.definitionKey &&
        candidate.version === input.intent.actionRef!.definitionVersion &&
        candidate.definitionFingerprint === input.intent.actionRef!.definitionFingerprint &&
        candidate.sourceFingerprint === input.intent.actionRef!.sourceFingerprint,
    );
    const actionLabel = action?.name?.trim() || input.intent.actionRef.definitionKey;
    const answer = `已识别到你明确否定了“${actionLabel}”。本次未生成动作预览、未进入确认或执行，业务状态未改变。`;
    return {
      status: 'completed',
      answer,
      citations: [],
      suggestedActions: [],
      blocks: [{ kind: 'text', text: answer }],
      grounding: 'none',
      adapterMetadata: {
        decisionCode: 'negated_action_noop',
        businessStateChanged: false,
        executionStatus: 'not_executed',
        actionRef: { ...input.intent.actionRef },
        actionPolarity: input.intent.actionPolarity,
        completion: { status: 'complete', missingCriteria: [], recoverable: false },
      },
      modelContextIntent: input.intent,
      modelMetadata: input.modelMetadata,
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
    const inventorySpecificCard =
      input.intent.intent === 'action'
        ? undefined
        : this.findInventorySpecificCapabilityCard(input.question, input.cards);
    if (input.intent.intent === 'workflow') return this.normalizeGovernedWorkflowIntent(input);
    if (inventorySpecificCard) {
      const inventoryIntent = this.inventorySpecificIntent(input.question, inventorySpecificCard);
      input = {
        ...input,
        intent: {
          ...input.intent,
          intent: inventoryIntent.intent,
          answerShape: inventoryIntent.answerShape,
          domains: [...new Set([...input.intent.domains, ...inventorySpecificCard.domains])],
        },
      };
    }
    const requestedSlots = new Set([
      ...input.intent.missingSlots.map((slot) => slot.trim().toLowerCase()),
      ...input.intent.ambiguities.map((ambiguity) => ambiguity.slot.trim().toLowerCase()),
    ]);
    const requestedDefinitionKeys = new Set([
      ...input.intent.metrics.map((metric) => metric.definitionKey),
      ...input.intent.dimensions.map((dimension) => dimension.definitionKey),
      ...input.intent.entities.flatMap((entity) => (entity.definitionRef ? [entity.definitionRef.definitionKey] : [])),
    ]);
    const contractMayResolveModelExpansion =
      ['action', 'draft', 'recommendation', 'diagnosis'].includes(input.intent.intent) ||
      Boolean(inventorySpecificCard) ||
      requestedDefinitionKeys.size > 0;
    const hasExactGovernedExample = Boolean(this.findGovernedCapabilityExampleCard(input.question, input.cards));
    if (
      (!requestedSlots.size && !contractMayResolveModelExpansion && !hasExactGovernedExample) ||
      this.hasProtectedCapabilityClarification(input.intent)
    ) {
      return input.intent;
    }
    const isAction = input.intent.intent === 'action';
    const isDraft = input.intent.intent === 'draft';
    const candidates = input.cards
      .filter(
        (card) =>
          (!inventorySpecificCard || card.key === inventorySpecificCard.key) &&
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
    const financeStaffCommissionCompositionMatched = input.intent.metrics.some((metric) =>
      isFinanceStaffCommissionCompositionMetricDefinitionKey(metric.definitionKey),
    )
      ? candidates.find((candidate) => candidate.card.key === 'finance_risk_overview')
      : undefined;
    const matched =
      financeStaffCommissionCompositionMatched ??
      definitionMatched ??
      domainMatched ??
      specificityMatched ??
      candidates[0];
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
    const preserveFinanceOrderProfitMetrics =
      matched.card.key === 'finance_risk_overview' &&
      input.intent.metrics.some((metric) => isFinanceOrderProfitMetricDefinitionKey(metric.definitionKey));
    const preserveFinanceStaffCommissionCompositionMetrics =
      matched.card.key === 'finance_risk_overview' &&
      input.intent.metrics.some((metric) =>
        isFinanceStaffCommissionCompositionMetricDefinitionKey(metric.definitionKey),
      );
    const metrics =
      supportedInputMetrics.length > 0
        ? supportedInputMetrics
        : preserveFinanceOrderProfitMetrics || preserveFinanceStaffCommissionCompositionMetrics
          ? input.intent.metrics
          : inferredMetrics;
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
        : preserveFinanceStaffCommissionCompositionMetrics
          ? input.intent.dimensions
          : ['list', 'ranking'].includes(input.intent.answerShape)
            ? governedDimensions
            : supportedInputDimensions;
    const governedEntities = (matched.card.definitionRefs ?? [])
      .filter((ref) => ref.definitionKey.startsWith('entity.'))
      .map((ref) => ({
        entityType: ref.definitionKey.slice('entity.'.length),
        mention: ref.definitionKey.slice('entity.'.length),
        source: 'system' as const,
        confidence: 1,
        definitionRef: definitionRefFromCard(ref, 'entity'),
      }));
    const entities = [
      ...input.intent.entities,
      ...(input.intent.entities.length === 0 &&
      ['list', 'ranking'].includes(input.intent.answerShape) &&
      !preserveFinanceStaffCommissionCompositionMetrics
        ? governedEntities
        : []),
    ]
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
    const actionDefinitionMissing = isAction && !input.intent.actionRef;
    return {
      ...input.intent,
      ...(actionDefinitionMissing
        ? { schemaVersion: '1.1' as const, actionPolarity: input.intent.actionPolarity ?? ('affirmative' as const) }
        : {}),
      ...(unorderedList ? { intent: 'query' as const, answerShape: 'list' as const } : {}),
      domains: supportedInputDomains.length ? supportedInputDomains : [...matched.card.domains],
      metrics,
      dimensions,
      entities,
      orderBy,
      ambiguities: [],
      missingSlots: actionDefinitionMissing ? ['actionDefinition'] : [],
      assumptions: [...input.intent.assumptions, `能力 ${matched.card.key} 将采用并披露已治理的默认分析口径。`],
    };
  }

  private inventorySpecificIntent(
    question: string,
    card: BrainCapabilityCard,
  ): { intent: BrainSemanticIntent['intent']; answerShape: BrainSemanticIntent['answerShape'] } {
    if (card.key === 'inventory_risk_ranking') {
      return /(?:排行|排名|最高|最紧急|优先|top\s*\d*)/i.test(question)
        ? { intent: 'ranking', answerShape: 'ranking' }
        : { intent: 'query', answerShape: 'list' };
    }
    if (card.key === 'inventory_procurement_advice') {
      return /(?:建议|应该|怎么|如何|安排|清单|补多少|买多少|采购多少|要买什么|补什么货)/.test(question)
        ? { intent: 'recommendation', answerShape: 'list' }
        : { intent: 'query', answerShape: 'list' };
    }
    return { intent: 'query', answerShape: 'list' };
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
            .flatMap((card) => card.definitionRefs ?? [])
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
        successCriteria: ['仅返回预约客户档案中已记录的过敏、肤质、皮肤状态、服务备注和特殊要求，不给客户贴主观标签'],
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
    if (
      /(?:生成|做|出).*(?:完整).*(?:年度|全年).*(?:运营|经营).*(?:报告|总结)|(?:完整).*(?:年度|全年).*(?:运营|经营).*(?:报告|总结)/.test(
        question,
      )
    ) {
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

  private normalizeCustomerAnalyticsDefaults(input: {
    intent: BrainSemanticIntent;
    question: string;
  }): BrainSemanticIntent {
    const customerCohortComparison =
      /(?:新客|新客户).*(?:老客|老客户).*(?:消费|实收|金额).*(?:对比|比较)|(?:对比|比较).*(?:新客|新客户).*(?:老客|老客户).*(?:消费|实收|金额)/.test(
        input.question,
      );
    const governedBalanceRisk =
      /(?:储值|会员).{0,4}余额.*(?:异常|偏高|过高|风险)|(?:异常|偏高|过高).*(?:储值|会员).{0,4}余额/.test(
        input.question,
      );
    const governedCustomerSegment =
      /(?:金卡|银卡|钻石|VIP|高价值|高净值).*(?:没来|未到店|没到店|沉睡|不活跃)|(?:沉睡|不活跃).*(?:金卡|银卡|钻石|VIP|高价值|高净值)/i.test(
        input.question,
      );
    if (!customerCohortComparison && !governedBalanceRisk && !governedCustomerSegment) return input.intent;

    const clearedSlots = new Set<string>();
    if (customerCohortComparison) clearedSlots.add('comparisonTarget');
    if (governedBalanceRisk) {
      clearedSlots.add('metric');
      clearedSlots.add('dimension');
      clearedSlots.add('orderBy');
    }
    if (governedCustomerSegment) {
      clearedSlots.add('entity');
      clearedSlots.add('customerIdentity');
    }
    return {
      ...input.intent,
      ...(customerCohortComparison ? { intent: 'comparison' as const, answerShape: 'comparison' as const } : {}),
      ...(governedBalanceRisk ? { intent: 'ranking' as const, answerShape: 'ranking' as const } : {}),
      missingSlots: input.intent.missingSlots.filter((slot) => !clearedSlots.has(slot)),
      ambiguities: input.intent.ambiguities.filter((ambiguity) => !clearedSlots.has(ambiguity.slot)),
      assumptions: [
        ...input.intent.assumptions,
        ...(governedBalanceRisk ? ['储值余额异常使用能力内已治理默认阈值，并在答案中披露。'] : []),
        ...(governedCustomerSegment ? ['会员等级和价值标签按客群筛选处理，不作为具体客户姓名。'] : []),
      ],
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
    scope: { conversationId: number; userId: number; storeId: number };
  }): BrainSemanticIntent {
    const resultSets = this.modelContextResultSets(input.conversationSlots);
    if (input.intent.actionRef && input.intent.actionSlots?.length) {
      let invalidReference = false;
      const actionSlots = input.intent.actionSlots.map((slot) => {
        if (!slot.resultReferenceId) {
          if (slot.source === 'conversation' && slot.entityKey) invalidReference = true;
          return slot;
        }
        const resolved = this.resultReferenceService.resolveReferenceById(
          slot.resultReferenceId,
          resultSets,
          input.scope,
        );
        if (!resolved) {
          invalidReference = true;
          return { ...slot, entityKey: undefined, entityDefinitionRef: undefined };
        }
        return {
          ...slot,
          source: 'conversation' as const,
          rawValue: resolved.reference.mention,
          entityKey: resolved.reference.entityKey,
          ...(resolved.reference.definitionRef ? { entityDefinitionRef: { ...resolved.reference.definitionRef } } : {}),
          confidence: 1,
        };
      });
      if (invalidReference) {
        return {
          ...input.intent,
          actionSlots,
          missingSlots: [...new Set([...input.intent.missingSlots, 'resultReference'])],
          ambiguities: [
            ...input.intent.ambiguities.filter((ambiguity) => ambiguity.slot !== 'resultReference'),
            {
              slot: 'resultReference',
              reason: '动作引用的上轮结果未绑定到当前会话中的受控 refId，请重新选择明确结果项。',
              candidates: resultSets.flatMap((set) => set.items.slice(0, 10).map((item) => item.refId)),
            },
          ],
          confidence: Math.min(input.intent.confidence, 0.55),
        };
      }
      if (actionSlots.some((slot) => slot.resultReferenceId)) {
        return {
          ...input.intent,
          actionSlots,
          assumptions: [
            ...input.intent.assumptions.filter((assumption) => !assumption.startsWith('动作信息载体引用：')),
            `动作信息载体引用：${actionSlots
              .filter((slot) => slot.resultReferenceId)
              .map((slot) => `${slot.slotKey}=${slot.resultReferenceId}`)
              .join('，')}。`,
          ],
        };
      }
    }
    if (input.intent.actionRef) return input.intent;
    if (!this.resultReferenceService.isFollowUpReferenceQuestion(input.question, resultSets)) return input.intent;
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

  private answerFromConversationReferencePreflight(input: {
    question: string;
    conversationSlots: Record<string, unknown>;
    modelMetadata: BrainModelMetadata;
  }): BrainChatAnswer | undefined {
    const resultSets = this.modelContextResultSets(input.conversationSlots);
    if (!resultSets.length && this.resultReferenceService.requiresPriorResultSelection(input.question)) {
      const requestedEntityType = this.resultReferenceService.requestedReferenceEntityType(input.question) ?? 'entity';
      const requestedLabel = this.modelEntityTypeLabel(requestedEntityType);
      const question = `上轮没有返回可供选择的${requestedLabel}列表，无法继续绑定“第几个”或“最好那个”。请先查询对应${requestedLabel}列表，或直接说明具体名称。`;
      return {
        status: 'completed',
        answer: question,
        citations: [],
        suggestedActions: [],
        blocks: [{ kind: 'clarification', question, options: [] }],
        grounding: 'none',
        adapterMetadata: {
          decisionCode: 'result_reference_source_set_missing_clarification_required',
          requestedEntityType,
          completion: { status: 'partial', missingCriteria: ['resultRef'], recoverable: true },
        },
        modelMetadata: input.modelMetadata,
      };
    }
    if (!this.resultReferenceService.isFollowUpReferenceQuestion(input.question, resultSets)) return undefined;
    const resolved = this.resultReferenceService.resolveReference({ question: input.question, resultSets });
    if (!resolved || resolved.kind === 'resolved' || resolved.kind === 'set') return undefined;

    const citation = {
      sourceType: 'brain_run',
      sourceId: String(resolved.set.sourceRunId),
      label: '上轮受控查询结果',
    };
    if (resolved.kind === 'empty') {
      const answer = `上轮查询结果中没有匹配的${this.modelEntityTypeLabel(resolved.set.entityType)}，因此无法继续选择“最高”“最急”或指定序号的对象。Ami Brain 不会改用其他库存、客户或指标代替。`;
      return {
        status: 'completed',
        answer,
        citations: [citation],
        suggestedActions: [],
        blocks: [
          { kind: 'text', text: answer, citationIds: [citation.sourceId] },
          { kind: 'limitations', items: ['上轮结果集为空，本轮没有生成建议、草稿或动作预览。'] },
        ],
        grounding: 'db_skill',
        adapterMetadata: {
          decisionCode: 'result_reference_empty_terminal',
          sourceResultSet: resolved.set,
          completion: { status: 'complete', missingCriteria: [], recoverable: false },
        },
        modelMetadata: input.modelMetadata,
      };
    }

    const requestedLabel = this.modelEntityTypeLabel(resolved.requestedEntityType ?? 'entity');
    const availableLabel = this.modelEntityTypeLabel(resolved.set.entityType);
    const question =
      resolved.kind === 'type_mismatch'
        ? `上轮返回的是${availableLabel}结果，不是${requestedLabel}列表，无法从中选择你说的对象。请明确要查询的${requestedLabel}或重新获取对应列表。`
        : `上轮结果中有多个可选${availableLabel}，当前指代无法唯一绑定。请补充名称或明确序号后再继续。`;
    const options = resolved.set.items.slice(0, 5).map((item) => ({
      id: item.refId,
      label: `第 ${item.rank} 项：${item.mention}`,
      value: item.mention,
    }));
    return {
      status: 'completed',
      answer: question,
      citations: [citation],
      suggestedActions: [],
      blocks: [{ kind: 'clarification', question, options }],
      grounding: 'db_skill',
      adapterMetadata: {
        decisionCode:
          resolved.kind === 'type_mismatch'
            ? 'result_reference_type_mismatch_clarification_required'
            : 'result_reference_ambiguity_clarification_required',
        sourceResultSet: resolved.set,
        completion: { status: 'partial', missingCriteria: ['resultRef'], recoverable: true },
      },
      modelMetadata: input.modelMetadata,
    };
  }

  private async answerFromVerifiedConversationReferenceCapability(input: {
    question: string;
    conversationSlots: Record<string, unknown>;
    cards: readonly BrainCapabilityCard[];
    context: BrainRequestContext;
    runId: number;
    modelMetadata: BrainModelMetadata;
  }): Promise<BrainChatAnswer | undefined> {
    if (!this.capabilityExecutorRegistry) return undefined;
    const resultSets = this.modelContextResultSets(input.conversationSlots);
    if (!this.resultReferenceService.isFollowUpReferenceQuestion(input.question, resultSets)) return undefined;
    const resolved = this.resultReferenceService.resolveReference({ question: input.question, resultSets });
    if (resolved?.kind !== 'resolved' || !resolved.reference) return undefined;

    const capabilityKey = this.controlledReferenceCapabilityKey(input.question, resolved.reference);
    if (!capabilityKey) return undefined;
    const card = input.cards.find((candidate) => candidate.key === capabilityKey);
    if (!card || !card.readOnly || card.sideEffect || card.grounding !== 'domain_service') return undefined;
    const entity = this.resultReferenceService.toConversationEntity(resolved.reference);
    if (!entity) return undefined;

    const answerShape = capabilityKey === 'marketing_message_draft' ? 'draft' : 'list';
    try {
      const execution = await this.capabilityExecutorRegistry.execute({
        card,
        context: input.context,
        runId: input.runId,
        question: input.question,
        answerShape,
        args: {
          objective: input.question,
          entities: [entity],
          metrics: [],
          dimensions: [],
          filters: [],
          orderBy: [],
          limit: 1,
        },
      });
      if (execution.status !== 'completed') {
        return this.modelFailure(
          'CAPABILITY_EXECUTION_FAILED',
          this.modelMetadata('execute', {
            ...input.modelMetadata,
            capabilityKey: card.key,
            capabilityVersion: card.version,
          }),
        );
      }
      const resultCitation = {
        sourceType: 'brain_result_ref',
        sourceId: resolved.reference.refId,
        label: `上轮受控结果：${resolved.reference.mention}`,
      };
      const grounded =
        execution.grounding === 'none'
          ? undefined
          : this.groundedAnswerComposer?.composeDomainAnswer(
              execution,
              this.controlledReferenceIntent(input.question, entity, capabilityKey),
            );
      return {
        status: 'completed',
        answer: grounded?.answer ?? execution.answer,
        citations: [...(grounded?.citations ?? execution.citations), resultCitation],
        suggestedActions: grounded?.suggestedActions ?? execution.suggestedActions ?? [],
        blocks: grounded?.blocks ?? execution.blocks,
        grounding: execution.grounding,
        adapterMetadata: {
          ...(execution.metadata ?? {}),
          decisionCode: 'verified_result_reference_capability_executed',
          resolvedResultRef: resolved.reference,
          sourceResultSet: resolved.set,
          completion: { status: 'complete', missingCriteria: [], recoverable: false },
        },
        modelMetadata: this.modelMetadata('execute', {
          ...input.modelMetadata,
          capabilityKey: card.key,
          capabilityVersion: card.version,
        }),
        modelContextIntent: this.controlledReferenceIntent(input.question, entity, capabilityKey),
        modelContextResultSets: resultSets,
      };
    } catch (error) {
      await this.recordModelFailure({
        runId: input.runId,
        stepKey: 'verified_result_reference_capability',
        layer: 'execution',
        stage: 'execute',
        code: 'CAPABILITY_EXECUTION_FAILED',
        diagnosticCode: this.modelDiagnosticCode(error),
        error,
      });
      return this.modelFailure(
        'CAPABILITY_EXECUTION_FAILED',
        this.modelMetadata('execute', {
          ...input.modelMetadata,
          capabilityKey: card.key,
          capabilityVersion: card.version,
        }),
      );
    }
  }

  private controlledReferenceCapabilityKey(
    question: string,
    reference: { entityType: string },
  ): 'marketing_message_draft' | 'inventory_procurement_advice' | undefined {
    if (reference.entityType === 'customer' && /(?:怎么|如何|怎样)?.*(?:召回|唤回|挽回)/.test(question)) {
      return 'marketing_message_draft';
    }
    if (reference.entityType === 'product' && /(?:补多少|补货|采购|进货|备货)/.test(question)) {
      return 'inventory_procurement_advice';
    }
    return undefined;
  }

  private controlledReferenceIntent(
    question: string,
    entity: BrainSemanticEntityReference,
    capabilityKey: 'marketing_message_draft' | 'inventory_procurement_advice',
  ): BrainSemanticIntent {
    const marketing = capabilityKey === 'marketing_message_draft';
    return {
      schemaVersion: '1.0',
      objective: question,
      domains: marketing ? ['customer', 'marketing'] : ['inventory', 'procurement'],
      intent: marketing ? 'draft' : 'recommendation',
      entities: [entity],
      metrics: [],
      dimensions: [],
      filters: [],
      orderBy: [],
      limit: 1,
      answerShape: marketing ? 'draft' : 'list',
      successCriteria: marketing ? ['返回可编辑召回草稿', '不发送消息'] : ['仅返回所选商品的建议补货量'],
      ambiguities: [],
      missingSlots: [],
      assumptions: [`对象来自服务端验证的上轮结果引用 ${entity.entityKey ?? entity.mention}。`],
      confidence: 1,
      decisionSummary: `使用已验证结果引用执行 ${capabilityKey}`,
    };
  }

  private modelCompilerCapabilityCards(
    cards: readonly BrainCapabilityCard[],
    topK: readonly BrainCapabilityRankedCandidate[],
    selected?: BrainCapabilityCard,
    continuationCapability?: BrainCapabilityCard,
    question = '',
  ): readonly BrainCapabilityCard[] {
    const governedExampleCapability = this.findGovernedCapabilityExampleCard(question, cards);
    const specificCustomerCapability = this.modelSpecificCustomerCapabilityCard(cards, question);
    const customerLevelCapability = this.modelCustomerLevelCapabilityCard(cards, question);
    const customerPredictionCapability = this.modelCustomerPredictionCapabilityCard(cards, question);
    const managerStaffDirectoryCapability = this.modelManagerStaffDirectoryCapabilityCard(cards, question);
    const managerStaffMetricCapability = this.modelManagerStaffMetricCapabilityCard(cards, question);
    const cardPackageSalesCapability = this.modelCardPackageSalesCapabilityCard(cards, question);
    const projectMarginCapability = this.modelProjectMarginCapabilityCard(cards, question);
    const projectCatalogCapability = this.modelProjectCatalogCapabilityCard(cards, question);
    const ordered = [
      selected,
      continuationCapability,
      governedExampleCapability,
      specificCustomerCapability,
      customerLevelCapability,
      customerPredictionCapability,
      managerStaffDirectoryCapability,
      managerStaffMetricCapability,
      cardPackageSalesCapability,
      projectMarginCapability,
      projectCatalogCapability,
      ...topK.map((candidate) => candidate.card),
    ].filter((card): card is BrainCapabilityCard => Boolean(card));
    const unique = new Map(ordered.map((card) => [card.key, card]));
    if (unique.size) return [...unique.values()].slice(0, 12);
    return cards.slice(0, 12);
  }

  private modelSpecificCustomerCapabilityCard(
    cards: readonly BrainCapabilityCard[],
    question: string,
  ): BrainCapabilityCard | undefined {
    if (!isSpecificCustomerReadOnlyQuestion(question)) return undefined;
    return cards.find(
      (card) => card.key === 'customer_facts' && card.readOnly && !card.sideEffect && card.intents.includes('query'),
    );
  }

  private modelCustomerLevelCapabilityCard(
    cards: readonly BrainCapabilityCard[],
    question: string,
  ): BrainCapabilityCard | undefined {
    if (
      !/会员/.test(question) ||
      !/(?:多少|几(?:个|位)?|统计|查询|查一下|列出|哪些|一共有|客户数|人数|名单)/.test(question) ||
      /(?:预约|接待|到店|排班|今天|明天|后天|下一个)/.test(question)
    ) {
      return undefined;
    }
    return cards.find(
      (card) =>
        card.key === 'customer_facts' &&
        card.readOnly &&
        !card.sideEffect &&
        card.definitionRefs.some((ref) => ref.definitionKey === 'dimension.customerLevel'),
    );
  }

  private modelManagerStaffDirectoryCapabilityCard(
    cards: readonly BrainCapabilityCard[],
    question: string,
  ): BrainCapabilityCard | undefined {
    if (!this.isManagerStaffDirectoryQuestion(question)) return undefined;
    return cards.find(
      (card) =>
        card.key === 'manager_staff_overview' && card.readOnly && !card.sideEffect && card.intents.includes('query'),
    );
  }

  private modelCustomerPredictionCapabilityCard(
    cards: readonly BrainCapabilityCard[],
    question: string,
  ): BrainCapabilityCard | undefined {
    const predictionQuestion =
      /(?:最可能复购|复购(?:概率|评分|可能性).*(?:最高|排行)|(?:最高|排行).*(?:复购概率|复购评分|复购可能性))/.test(
        question,
      ) ||
      /(?:营销触达|营销).*(?:响应度|响应评分).*(?:最高|排行)|(?:响应度|响应评分).*(?:最高|排行)/.test(question) ||
      /(?:预测|预估).*(?:12个月|十二个月).*(?:生命周期价值|LTV)|(?:12个月|十二个月).*(?:生命周期价值|LTV).*(?:预测|预估)/i.test(
        question,
      );
    if (!predictionQuestion) return undefined;
    return cards.find(
      (card) =>
        card.key === 'marketing_customer_segment' &&
        card.readOnly &&
        !card.sideEffect &&
        card.intents.includes('query'),
    );
  }

  private modelManagerStaffMetricCapabilityCard(
    cards: readonly BrainCapabilityCard[],
    question: string,
  ): BrainCapabilityCard | undefined {
    const staffMetricQuestion =
      this.isManagerStaffDirectoryQuestion(question) ||
      /(?:服务了多少个客户|服务了多少客户|服务客户(?:数)?(?:有)?多少)/.test(question) ||
      /(?:哪个|哪位|谁).*(?:美容师|员工|技师)?.*(?:业绩|服务收入|关联实收).*(?:最高|最好)|(?:美容师|员工|技师).*(?:业绩|服务收入|关联实收).*(?:最高|最好)/.test(
        question,
      );
    if (!staffMetricQuestion) return undefined;
    return cards.find(
      (card) =>
        card.key === 'manager_staff_overview' &&
        card.readOnly &&
        !card.sideEffect &&
        (card.intents.includes('query') || card.intents.includes('ranking')),
    );
  }

  private modelCardPackageSalesCapabilityCard(
    cards: readonly BrainCapabilityCard[],
    question: string,
  ): BrainCapabilityCard | undefined {
    if (
      !/(?:次卡|套餐卡).*(?:卖得最好|卖得最多|销量最高|销售排行|销售排名|哪个卖得好)|(?:卖得最好|卖得最多|销量最高|销售排行|销售排名).*(?:次卡|套餐卡)/.test(
        question,
      )
    ) {
      return undefined;
    }
    return cards.find(
      (card) =>
        card.key === 'finance_risk_overview' && card.readOnly && !card.sideEffect && card.intents.includes('query'),
    );
  }

  private modelProjectMarginCapabilityCard(
    cards: readonly BrainCapabilityCard[],
    question: string,
  ): BrainCapabilityCard | undefined {
    if (
      !/(?:各个?|每个|所有)(?:项目|护理项目|服务项目).*(?:毛利|利润)|(?:毛利|利润).*(?:各个?|每个|所有)(?:项目|护理项目|服务项目)|(?:项目|护理项目|服务项目)(?:的)?(?:毛利|利润)(?:排行|排名|对比|分析)/.test(
        question,
      ) ||
      /(?:商品|产品|订单|单号)/.test(question)
    ) {
      return undefined;
    }
    return cards.find(
      (card) =>
        card.key === 'project_margin_analysis' && card.readOnly && !card.sideEffect && card.intents.includes('query'),
    );
  }

  private modelProjectCatalogCapabilityCard(
    cards: readonly BrainCapabilityCard[],
    question: string,
  ): BrainCapabilityCard | undefined {
    if (!this.isProjectCatalogQuestion(question)) return undefined;
    const selectedKey = this.isProjectSpecificBomQuestion(question)
      ? 'project_material_consumption_analysis'
      : 'project_service_ranking';
    return cards.find(
      (card) =>
        card.key === selectedKey &&
        card.readOnly &&
        !card.sideEffect &&
        (card.intents.includes('query') ||
          (selectedKey === 'project_service_ranking' && card.intents.includes('ranking'))),
    );
  }

  private modelContinuationCapabilityCard(
    cards: readonly BrainCapabilityCard[],
    conversationSlots: Record<string, unknown>,
  ): BrainCapabilityCard | undefined {
    const directives = this.modelContextRecord(conversationSlots.turnDirectives);
    if (!['continue', 'resolve_pending_or_new'].includes(String(directives.mode))) return undefined;
    const inherit = Array.isArray(directives.inherit)
      ? directives.inherit.filter((slot): slot is string => typeof slot === 'string')
      : [];
    const doNotInherit = Array.isArray(directives.doNotInherit)
      ? directives.doNotInherit.filter((slot): slot is string => typeof slot === 'string')
      : [];
    if (!inherit.includes('capability') || doNotInherit.includes('capability')) return undefined;

    const modelContext = this.modelContextRecord(conversationSlots.modelContext);
    const capability = this.modelContextRecord(modelContext.capability);
    if (typeof capability.key !== 'string' || !Number.isInteger(capability.version)) return undefined;
    return cards.find(
      (card) => card.key === capability.key && card.version === capability.version && card.readOnly && !card.sideEffect,
    );
  }

  private resolveModelSelectedDeliveryCapability(input: {
    selectedCapabilityKey?: string;
    intent: BrainSemanticIntent;
    question: string;
    cards: readonly BrainCapabilityCard[];
    catalogTopK: readonly BrainCapabilityRankedCandidate[];
  }): BrainCapabilityCard | undefined {
    if (!input.selectedCapabilityKey || ['action', 'workflow'].includes(input.intent.intent)) return undefined;
    const candidate =
      input.cards.find((item) => item.key === input.selectedCapabilityKey) ??
      input.catalogTopK.find((item) => item.card.key === input.selectedCapabilityKey)?.card;
    const intentCompatible =
      candidate?.intents.includes(input.intent.intent) ||
      (input.selectedCapabilityKey === 'project_service_ranking' &&
        input.intent.intent === 'query' &&
        candidate?.intents.includes('ranking') &&
        this.isProjectServiceSalesQuestion(input.question));
    if (!candidate?.readOnly || candidate.sideEffect || !intentCompatible) {
      return undefined;
    }
    return findCapabilityContractMissingDefinitions(input.intent, candidate, input.question).length === 0
      ? candidate
      : undefined;
  }

  private modelEntityTypeLabel(entityType: string): string {
    return (
      (
        {
          customer: '客户',
          beautician: '员工',
          product: '商品',
          reservation: '预约',
          project: '项目',
          marketing_strategy: '营销策略',
        } as Record<string, string>
      )[entityType] ?? '业务对象'
    );
  }

  private answerFromConversationResultReference(input: {
    intent: BrainSemanticIntent;
    question: string;
    conversationSlots: Record<string, unknown>;
    cards: readonly BrainCapabilityCard[];
    modelMetadata: BrainModelMetadata;
  }): BrainChatAnswer | undefined {
    const resultSets = this.modelContextResultSets(input.conversationSlots);
    if (!this.resultReferenceService.isFollowUpReferenceQuestion(input.question, resultSets)) return undefined;
    const resolved = this.resultReferenceService.resolveReference({
      question: input.question,
      resultSets,
    });
    if (!resolved) return undefined;

    if (resolved.kind === 'ambiguous' && ['action', 'workflow'].includes(input.intent.intent)) {
      const options = resolved.set.items.slice(0, 5).map((item) => ({
        id: item.refId,
        label: `第 ${item.rank} 名：${item.mention}`,
        value: `第${item.rank}名 ${item.mention}`,
      }));
      const question = `上轮结果中有 ${resolved.set.items.length} 个可选对象，请明确选择排名或名称后再继续。`;
      const pendingClarification: BrainModelPendingClarification = {
        missingSlots: ['resultRef'],
        questions: [question],
        ambiguities: [
          {
            slot: 'resultRef',
            reason: '代词无法唯一绑定到上轮结果对象',
            candidates: options.map((option) => option.label),
          },
        ],
      };
      return {
        status: 'completed',
        answer: question,
        citations: [
          {
            sourceType: 'brain_result_ref',
            sourceId: resolved.set.setId,
            label: '上轮受控查询结果集',
          },
        ],
        suggestedActions: [],
        blocks: [{ kind: 'clarification', question, options }],
        grounding: 'db_skill',
        adapterMetadata: {
          decisionCode: 'result_reference_ambiguity_clarification_required',
          sourceResultSet: resolved.set,
          completion: { status: 'partial', missingCriteria: ['resultRef'], recoverable: true },
        },
        modelMetadata: input.modelMetadata,
        modelContextIntent: {
          ...input.intent,
          intent: 'clarify',
          answerShape: 'clarification',
          missingSlots: ['resultRef'],
          ambiguities: pendingClarification.ambiguities,
        },
        modelContextPendingClarification: pendingClarification,
        modelContextResultSets: resultSets,
      };
    }

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
    intent?: BrainSemanticIntent;
    question: string;
    modelMetadata: BrainModelMetadata;
  }): BrainChatAnswer | undefined {
    if (!this.isGenericObjectiveQuestion(input.question)) return undefined;

    const question = '为了准确处理，请补充要检查的业务范围：门店经营、财务、库存、预约现场、客户经营或员工运营。';
    const options = [
      {
        id: 'objective:store_operations',
        label: '门店经营风险',
        value: { slot: 'objective', candidate: '门店经营风险' },
      },
      {
        id: 'objective:finance_risk',
        label: '财务与退款风险',
        value: { slot: 'objective', candidate: '财务与退款风险' },
      },
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
      ...(input.intent ?? {
        schemaVersion: '1.0' as const,
        objective: input.question,
        entities: [],
        filters: [],
        successCriteria: ['获得明确的业务范围后继续'],
        assumptions: [],
        confidence: 1,
        decisionSummary: '问题缺少明确业务目标，需要先澄清',
      }),
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

  private isGenericObjectiveQuestion(question: string): boolean {
    const normalized = question.trim().replace(/[\s？?。！!]+/g, '');
    return [
      '有什么问题吗',
      '有什么问题',
      '有问题吗',
      '本月怎么样',
      '这个月怎么样',
      '这月怎么样',
      '本月如何',
      '这个月如何',
    ].includes(normalized);
  }

  private modelContextResultSets(conversationSlots: Record<string, unknown>): BrainModelResultSet[] {
    const modelContext = this.modelContextRecord(conversationSlots.modelContext);
    if (!Array.isArray(modelContext.resultSets)) return [];
    return modelContext.resultSets.filter((set): set is BrainModelResultSet => isBrainModelResultSet(set));
  }

  private async verifyConversationResultReferenceSlots(input: {
    conversationId: number;
    runId: number;
    context: BrainRequestContext;
    conversationSlots: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    const modelContext = this.modelContextRecord(input.conversationSlots.modelContext);
    const resultSets = Array.isArray(modelContext.resultSets)
      ? modelContext.resultSets.filter((set): set is BrainModelResultSet => isBrainModelResultSet(set))
      : [];
    if (!resultSets.length) return input.conversationSlots;

    const scope = {
      conversationId: input.conversationId,
      userId: input.context.userId,
      storeId: input.context.storeId,
    };
    const scopedSets = resultSets.filter((set) => this.resultReferenceService.isScopedTo(set, scope));
    let verifiedSets: BrainModelResultSet[] = [];
    try {
      const sourceRunIds = [...new Set(scopedSets.map((set) => set.sourceRunId))];
      const sourceRuns = sourceRunIds.length
        ? await this.prisma.brainRun.findMany({
            where: {
              id: { in: sourceRunIds },
              conversationId: input.conversationId,
              userId: input.context.userId,
              storeId: input.context.storeId,
              status: 'completed',
            },
            select: { id: true, output: true },
          })
        : [];
      const outputByRunId = new Map(sourceRuns.map((run) => [run.id, run.output]));
      verifiedSets = scopedSets.filter((set) =>
        this.resultReferenceService.isPersistedInRunOutput(set, outputByRunId.get(set.sourceRunId)),
      );
      await this.recordModelTrace({
        runId: input.runId,
        stepKey: 'model_result_reference_verify',
        layer: 'memory',
        status: 'completed',
        output: this.toJsonValue({
          inputCount: resultSets.length,
          scopedCount: scopedSets.length,
          verifiedCount: verifiedSets.length,
          rejectedCount: resultSets.length - verifiedSets.length,
        }),
      });
    } catch (error) {
      await this.recordModelTrace({
        runId: input.runId,
        stepKey: 'model_result_reference_verify',
        layer: 'memory',
        status: 'failed',
        error: this.toJsonValue({ message: this.errorMessage(error) }),
      });
    }

    return {
      ...input.conversationSlots,
      modelContext: { ...modelContext, resultSets: verifiedSets },
    };
  }

  private normalizeExactCustomerFactIntent(input: {
    intent: BrainSemanticIntent;
    question: string;
  }): BrainSemanticIntent {
    if (!this.isSpecificCustomerFactQuestion(input.question, input.intent)) return input.intent;
    const phoneTail = input.question.match(/(?:尾号|手机尾号|手机号后四位|手机后四位)[^0-9]*(\d{4})/)?.[1];
    const recommendation = isSpecificCustomerProjectRecommendationQuestion(input.question);
    return {
      ...input.intent,
      domains: ['customer'],
      intent: recommendation ? 'recommendation' : 'query',
      answerShape: recommendation ? 'diagnosis' : 'list',
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
    const candidates = [card.name, card.description, ...(card.examples ?? []), ...(card.synonyms ?? [])].filter(
      (value): value is string => typeof value === 'string',
    );
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
    const reservationListCard = this.findReservationListCapabilityCard(question, cards);
    if (reservationListCard) return reservationListCard;
    const customerAnalyticsCard = this.findCustomerAnalyticsCapabilityCard(question, cards);
    if (customerAnalyticsCard) return customerAnalyticsCard;
    const exactExampleCard = this.findExactGovernedCapabilityExampleCard(question, cards);
    if (exactExampleCard) return exactExampleCard;
    const inventorySpecificCard = this.findInventorySpecificCapabilityCard(question, cards);
    if (inventorySpecificCard) return inventorySpecificCard;
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
    return undefined;
  }

  private findCustomerAnalyticsCapabilityCard(
    question: string,
    cards: readonly BrainCapabilityCard[],
  ): BrainCapabilityCard | undefined {
    const customerAnalyticsQuestion =
      /(?:新客|新客户).*(?:第二次|二次).*(?:消费|复购)|(?:买过|购买过|做过|体验过).*(?:项目|护理|疗程)?.*(?:客户).*(?:平均消费|客单价)|(?:健康档案.*过敏|过敏.*健康档案)|(?:客户结构|会员等级|各等级).*(?:占比|比例|分布)|(?:新客|新客户).*(?:老客|老客户).*(?:消费|实收|金额).*(?:对比|比较)|(?:到店|来店).*(?:频次|次数).*(?:分布|结构)|(?:来源|渠道).*(?:客户质量|转化|消费).*(?:对比|比较)|(?:对比|比较).*(?:来源|渠道).*(?:客户质量|转化|消费)|(?:储值|会员).{0,4}余额.*(?:异常|偏高|过高|风险)|(?:高价值|高净值).*(?:没来|未到店|没到店|沉睡|不活跃)|(?:金卡|银卡|钻石|VIP).*(?:没来|未到店|没到店|沉睡|不活跃)|消费.*(?:骤降|大幅下降|明显下降)/i.test(
        question,
      );
    if (!customerAnalyticsQuestion) return undefined;
    return cards.find((card) => card.key === 'customer_facts' && card.readOnly && !card.sideEffect);
  }

  private findExactGovernedCapabilityExampleCard(
    question: string,
    cards: readonly BrainCapabilityCard[],
  ): BrainCapabilityCard | undefined {
    const normalizedQuestion = this.normalizeGovernedExampleText(question);
    return cards.find((card) =>
      (card.examples ?? []).some((example) => this.normalizeGovernedExampleText(example) === normalizedQuestion),
    );
  }

  private findReservationListCapabilityCard(
    question: string,
    cards: readonly BrainCapabilityCard[],
  ): BrainCapabilityCard | undefined {
    if (!/预约/.test(question)) return undefined;
    if (/(?:到店率|转化率|当前在店|现在在店|在忙|忙闲|空着|可接待|现场)/.test(question)) return undefined;
    const scheduleListOrCount =
      /(?:有多少个预约|多少个预约|几个预约|预约.*(?:多少个|几个|名单|清单|明细|都有谁|有谁|哪些|哪个客户|哪些客户)|(?:未确认|待确认|没确认|没有确认).*(?:预约|客户|客人)|(?:预约|客户|客人).*(?:未确认|待确认|没确认|没有确认))/.test(
        question,
      );
    if (!scheduleListOrCount) return undefined;
    return cards.find((card) => card.key === 'reservation_list' && card.readOnly && !card.sideEffect);
  }

  private findInventorySpecificCapabilityCard(
    question: string,
    cards: readonly BrainCapabilityCard[],
  ): BrainCapabilityCard | undefined {
    if (
      !/(?:库存|产品|商品|货品|耗材|物料|采购|补货|进货|备货|供应商|报价|交货|收货|缺货|断货|临期|过期)/.test(question)
    ) {
      return undefined;
    }
    const procurementQuestion =
      /(?:采购|补货|进货|备货|买多少|补多少|供应商|报价|交货|交期|收货|待收货|采购金额|采购总额|采购成本|采购单|采购订单|结算待付款|最便宜)/.test(
        question,
      ) &&
      !/(?:缺货|低于安全库存|低库存|临期|过期|库存风险|库存预警).*(?:有多少|几个|哪些|排行|排名|最高|最紧急|优先)/.test(
        question,
      );
    if (procurementQuestion) {
      const procurementCard = cards.find(
        (card) => card.key === 'inventory_procurement_advice' && card.readOnly && !card.sideEffect,
      );
      if (procurementCard) return procurementCard;
    }
    const riskQuestion =
      /(?:缺货|断货|低于安全库存|低库存|安全库存|临期|过期|库存风险|库存预警|风险排行|预警排行|最紧急|优先处理|最需要关注)/.test(
        question,
      );
    if (riskQuestion) {
      return cards.find((card) => card.key === 'inventory_risk_ranking' && card.readOnly && !card.sideEffect);
    }
    return undefined;
  }

  private findReservationProjectRankingCapabilityCard(
    intent: BrainSemanticIntent,
    cards: readonly BrainCapabilityCard[],
  ): BrainCapabilityCard | undefined {
    const rankingIntent = intent.intent === 'ranking' || intent.answerShape === 'ranking';
    if (!rankingIntent) return undefined;
    if (!intent.domains.includes('reservation') || !intent.domains.includes('project')) return undefined;
    const requestedDimensionKeys = new Set([
      ...intent.dimensions.map((dimension) => dimension.definitionKey),
      ...intent.filters
        .filter((filter) => filter.fieldRef.definitionType === 'dimension')
        .map((filter) => filter.fieldRef.definitionKey),
    ]);
    if (!requestedDimensionKeys.has('dimension.projectName')) return undefined;
    return cards.find(
      (card) =>
        card.key === 'reservation_list' &&
        card.readOnly &&
        !card.sideEffect &&
        card.intents.includes('query') &&
        card.domains.includes('reservation') &&
        card.definitionRefs.some((ref) => ref.definitionKey === 'dimension.projectName'),
    );
  }

  private findManagerStaffDirectoryCapabilityCard(
    question: string,
    intent: BrainSemanticIntent,
    cards: readonly BrainCapabilityCard[],
  ): BrainCapabilityCard | undefined {
    if (!this.isManagerStaffDirectoryQuestion(question)) return undefined;
    const hasStaffSemanticSignal =
      intent.domains.some((domain) => ['staff', 'beautician'].includes(domain)) ||
      intent.entities.some((entity) => ['staff', 'beautician'].includes(entity.entityType)) ||
      intent.dimensions.some((dimension) =>
        ['dimension.beauticianId', 'dimension.beauticianName', 'dimension.staff_name'].includes(
          dimension.definitionKey,
        ),
      ) ||
      /(?:美容师|员工|技师)/.test(question);
    if (!hasStaffSemanticSignal) return undefined;
    return cards.find(
      (card) =>
        card.key === 'manager_staff_overview' &&
        card.readOnly &&
        !card.sideEffect &&
        card.intents.includes('query') &&
        card.domains.some((domain) => ['staff', 'beautician'].includes(domain)),
    );
  }

  private isManagerStaffDirectoryQuestion(question: string) {
    return (
      /(?:在职美容师|是什么职级|会做哪些项目|可做项目|项目技能|排班是怎样|有哪些美容师请假|谁在上班|谁在岗)/.test(
        question,
      ) ||
      /(?:能做|会做).*(?:美容师|员工|技师).*(?:在岗|上班)/.test(question) ||
      /(?:美容师|员工|技师).*(?:能做|会做).*(?:在岗|上班)/.test(question) ||
      this.isManagerStaffReleaseCoreQuestion(question)
    );
  }

  private isManagerStaffReleaseCoreQuestion(question: string) {
    return (
      /(?:业绩|实收).*(?:趋势|走势)|(?:趋势|走势).*(?:业绩|实收)/.test(question) ||
      /(?:连带销售|连带率|搭售能力|交叉销售)/.test(question) ||
      /(?:职级).*(?:产出|业绩|实收)|(?:产出|业绩|实收).*(?:职级)/.test(question) ||
      /(?:主力).*(?:美容师|员工|技师)?.*(?:业绩|实收)?.*(?:下滑|下降)|(?:业绩|实收).*(?:主力).*(?:下滑|下降)/.test(
        question,
      ) ||
      /(?:技能覆盖|技能配置).*(?:短板|不足|缺口)|(?:项目).*(?:缺人做|没人做|只有一人做)/.test(question) ||
      /(?:业绩|实收).*(?:下滑|下降).*(?:建议|怎么帮|怎么办|如何帮)|(?:建议|怎么帮|怎么办|如何帮).*(?:业绩|实收).*(?:下滑|下降)/.test(
        question,
      ) ||
      /(?:排班).*(?:怎么|如何|怎样)?.*(?:优化|调整).*(?:产能|人效)|(?:提升|提高).*(?:产能|人效).*(?:排班)/.test(
        question,
      ) ||
      /(?:给|帮).{0,8}(?:美容师|员工|技师)?.{0,6}(?:制定|做|给出).{0,4}(?:成长|提升|发展)(?:建议|方案)/.test(
        question,
      ) ||
      /(?:技能).*(?:缺口|短板|不足).*(?:怎么补|如何补|培训|训练|提升)|(?:培训|训练).*(?:技能).*(?:缺口|短板|不足)/.test(
        question,
      )
    );
  }

  private isProjectCatalogQuestion(question: string) {
    return this.isProjectServiceSalesQuestion(question) || this.isProjectSpecificBomQuestion(question);
  }

  private isProjectServiceSalesQuestion(question: string) {
    const normalized = question.replace(/\s+/gu, '');
    const projectSignal = /(?:项目|护理|SPA|spa|管理|养护|修护|提拉|焕肤|清洁|舒缓|净透|淡斑)/u.test(normalized);
    const serviceSalesSignal = /(?:卖了多少|卖出多少|卖了几|卖出几|销量|销售数量|服务次数|做了多少次|做了几次)/u.test(
      normalized,
    );
    const productSignal = /(?:商品|产品|货品)/u.test(normalized) && !/(?:项目|护理|SPA|spa)/u.test(normalized);
    const materialSignal = /(?:BOM|bom|耗材|物料|材料)/iu.test(normalized);
    const aggregateSignal =
      /(?:各项目|每个项目|所有项目|全店|哪个项目|哪些项目|排行|排名|最多|最少|最高|最低|前\d+|top\d+)/iu.test(
        normalized,
      );
    return projectSignal && serviceSalesSignal && !productSignal && !materialSignal && !aggregateSignal;
  }

  private isProjectSpecificBomQuestion(question: string) {
    const normalized = question.replace(/\s+/gu, '');
    const bomSignal =
      /(?:BOM|bom).*(?:成本|清单|明细|用到|包含|需要)|(?:用到|需要|包含|配置|配了|有哪些).*(?:耗材|物料|材料|产品|商品)|(?:耗材|物料|材料|产品|商品).*(?:清单|有哪些|用到|需要)/iu.test(
        normalized,
      );
    const projectSignal = /(?:项目|护理|SPA|spa|管理|养护|修护|提拉|焕肤|清洁|舒缓|净透|淡斑)/u.test(normalized);
    const aggregateQuestion =
      /(?:各项目|每个项目|所有项目|全店|哪个项目|哪些项目|排行|排名|最高|最多|最低|实际消耗|消耗最多|消耗排行)/u.test(
        normalized,
      );
    return projectSignal && bomSignal && !aggregateQuestion;
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

  private findProjectCatalogCapabilityCard(
    question: string,
    intent: BrainSemanticIntent,
    cards: readonly BrainCapabilityCard[],
  ): BrainCapabilityCard | undefined {
    if (['action', 'workflow'].includes(intent.intent) || !this.isProjectCatalogQuestion(question)) return undefined;
    const selectedKey = this.isProjectSpecificBomQuestion(question)
      ? 'project_material_consumption_analysis'
      : 'project_service_ranking';
    return cards.find(
      (card) =>
        card.key === selectedKey &&
        card.readOnly &&
        !card.sideEffect &&
        (card.intents.includes('query') ||
          (selectedKey === 'project_service_ranking' && card.intents.includes('ranking'))),
    );
  }

  private isSpecificCustomerFactQuestion(question: string, intent: BrainSemanticIntent) {
    if (['action', 'workflow'].includes(intent.intent) || this.hasExplicitSideEffectRequest(question)) return false;
    if (/(?:预约).*(?:几点|时间|安排|改期|取消|确认)|(?:几点|时间|安排).*(?:预约)/.test(question)) {
      return false;
    }
    const directCustomerName = extractSpecificCustomerNameFromQuestion(question);
    const hasPhoneTail = /(?:尾号|手机尾号|手机号后四位|手机后四位)[^0-9]*\d{4}/.test(question);
    if (
      !directCustomerName &&
      !hasPhoneTail &&
      /(?:今天|明天|后天|本周|上周|本月|上月)?(?:预约|到店|来店).{0,8}(?:客户|客人|会员)|(?:预约|到店|来店)(?:客户|客人|会员)/.test(
        question,
      )
    ) {
      return false;
    }
    const hasIdentity =
      intent.entities.some((entity) => entity.entityType === 'customer' && this.isSpecificModelEntity(entity)) ||
      Boolean(directCustomerName) ||
      hasPhoneTail;
    if (!hasIdentity) return false;
    return /(?:上次来|最近来|到店|消费|会员等级|办过卡|卡项|还有多少次|余额|来源|渠道|标签|备注|上次做|最近服务|服务记录|做的什么项目|过敏|皮肤|注意事项|适合.*(?:推荐|项目)|推荐.*项目)/.test(
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

  private normalizeReadOnlyPreviewCapabilityIntent(
    intent: BrainSemanticIntent,
    card: BrainCapabilityCard,
  ): BrainSemanticIntent {
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
      assumptions: [...intent.assumptions, `能力 ${card.key} 只有只读规则建议合同，不生成不可执行的确认动作。`],
    };
  }

  private normalizeReservationProjectRankingCapabilityIntent(
    intent: BrainSemanticIntent,
    card: BrainCapabilityCard,
  ): BrainSemanticIntent {
    if (card.key !== 'reservation_list') return intent;
    if (!this.findReservationProjectRankingCapabilityCard(intent, [card])) return intent;
    const supportedDefinitionKeys = new Set((card.definitionRefs ?? []).map((ref) => ref.definitionKey));
    const metrics = intent.metrics.filter((metric) => supportedDefinitionKeys.has(metric.definitionKey));
    const removedMetricKeys = new Set(
      intent.metrics
        .filter((metric) => !supportedDefinitionKeys.has(metric.definitionKey))
        .map((metric) => metric.definitionKey),
    );
    const orderBy = intent.orderBy.filter((item) => !removedMetricKeys.has(item.definitionRef.definitionKey));
    const domains = intent.domains.filter((domain) => card.domains.includes(domain));
    return {
      ...intent,
      domains: domains.length ? domains : [...card.domains],
      metrics,
      orderBy,
      assumptions: [...intent.assumptions, '预约项目排行按预约事实分组统计，不使用服务核销次数或订单指标替代。'],
    };
  }

  private normalizeManagerStaffDirectoryCapabilityIntent(
    intent: BrainSemanticIntent,
    card: BrainCapabilityCard,
    question: string,
  ): BrainSemanticIntent {
    if (card.key !== 'manager_staff_overview') return intent;
    if (!this.isManagerStaffDirectoryQuestion(question) && !this.isManagerStaffDirectoryQuestion(intent.objective)) {
      return intent;
    }
    const supportedDimensionKeys = new Set(['dimension.beauticianName']);
    const dimensions = intent.dimensions.filter((dimension) => supportedDimensionKeys.has(dimension.definitionKey));
    const entities = intent.entities.filter((entity) => entity.entityType === 'beautician');
    const metrics = intent.metrics.filter((metric) =>
      [
        'metric.staff_service_count',
        'metric.staff_unique_customer_count',
        'metric.staff_commission_amount',
        'metric.staff_service_revenue',
        'metric.staff_performance_score',
        'metric.staff_customer_repurchase_rate',
      ].includes(metric.definitionKey),
    );
    return {
      ...intent,
      domains: ['staff', 'beautician'],
      entities,
      metrics,
      dimensions,
      filters: [],
      orderBy: [],
    };
  }

  private normalizeManagerStaffReleaseCoreAfterCompleteness(input: {
    intent: BrainSemanticIntent;
    question: string;
    cards: readonly BrainCapabilityCard[];
    timezone: 'Asia/Shanghai' | 'UTC';
  }): BrainSemanticIntent {
    if (!this.isManagerStaffReleaseCoreQuestion(input.question)) return input.intent;
    const card = input.cards.find(
      (candidate) => candidate.key === 'manager_staff_overview' && candidate.readOnly && !candidate.sideEffect,
    );
    if (!card) return input.intent;
    const staffPerformanceTrend = /(?:业绩|实收).*(?:趋势|走势)|(?:趋势|走势).*(?:业绩|实收)/.test(input.question);
    const staffCrossSell = /(?:连带销售|连带率|搭售能力|交叉销售)/.test(input.question);
    const staffLevelRevenue = /(?:职级).*(?:产出|业绩|实收)|(?:产出|业绩|实收).*(?:职级)/.test(input.question);
    const staffSkillCoverage = /(?:技能覆盖|技能配置).*(?:短板|不足|缺口)|(?:项目).*(?:缺人做|没人做|只有一人做)/.test(
      input.question,
    );
    const revenueRef = card.definitionRefs
      .filter((ref) => ref.definitionKey === 'metric.staff_service_revenue')
      .map((ref) => definitionRefFromCard(ref, 'metric'))[0];
    const beauticianDimensionRef = card.definitionRefs
      .filter((ref) => ref.definitionKey === 'dimension.beauticianName')
      .map((ref) => definitionRefFromCard(ref, 'dimension'))[0];
    const parsedTime = this.timeRangeParser.parse(input.question);
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: input.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const timeRange = parsedTime.range
      ? {
          label: parsedTime.range.label,
          startDate: formatter.format(parsedTime.range.startDate),
          endDate: formatter.format(parsedTime.range.endDate),
          timezone: input.timezone,
        }
      : input.intent.timeRange;
    const intent: BrainSemanticIntent['intent'] = staffPerformanceTrend
      ? 'query'
      : staffCrossSell || staffLevelRevenue
        ? 'ranking'
        : 'diagnosis';
    const answerShape: BrainSemanticIntent['answerShape'] =
      staffPerformanceTrend || staffCrossSell ? 'comparison' : staffLevelRevenue ? 'ranking' : 'diagnosis';
    return {
      ...input.intent,
      domains: ['staff', 'beautician'],
      intent,
      entities: input.intent.entities.filter((entity) => entity.entityType === 'beautician'),
      metrics: revenueRef && !staffCrossSell && !staffSkillCoverage ? [revenueRef] : [],
      dimensions: staffCrossSell && beauticianDimensionRef ? [beauticianDimensionRef] : [],
      filters: [],
      orderBy: staffLevelRevenue && revenueRef ? [{ definitionRef: revenueRef, direction: 'desc' }] : [],
      answerShape,
      ...(timeRange ? { timeRange } : {}),
      ambiguities: input.intent.ambiguities.filter(
        (ambiguity) => !['metric', 'timeRange', 'comparisonTarget'].includes(ambiguity.slot),
      ),
      missingSlots: input.intent.missingSlots.filter(
        (slot) => !['metric', 'timeRange', 'comparisonTarget'].includes(slot),
      ),
      assumptions: [
        ...input.intent.assumptions,
        '本问法使用 manager_staff_overview 已发布的员工真实只读事实合同，不要求用户在已明确语义下重复选择内部指标。',
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
    const supervisorPlanningStartedAt = Date.now();
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
              provider: planning.provider,
              model: planning.model,
              routing: planning.routing ?? null,
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
      latencyMs: Date.now() - supervisorPlanningStartedAt,
    });
    if (planning.status !== 'planned') {
      const failureCode = ['PROVIDER_UNAVAILABLE', 'PROVIDER_AUTH_FAILED'].includes(planning.errorCode)
        ? planning.errorCode
        : 'MODEL_SUPERVISOR_PLAN_UNAVAILABLE';
      return this.modelFailure(failureCode, this.modelMetadata('plan', input.modelMetadata));
    }
    const plannedCards = planning.plan.nodes
      .map(
        (node) =>
          topK.find(
            (candidate) =>
              candidate.card.key === node.capabilityKey && candidate.card.version === node.capabilityVersion,
          )?.card,
      )
      .filter((card): card is BrainCapabilityCard => Boolean(card));
    const contractMismatches = findCapabilityContractMissingDefinitions(
      input.intent,
      {
        domains: [...new Set(plannedCards.flatMap((card) => card.domains))],
        definitionRefs: plannedCards.flatMap((card) => card.definitionRefs ?? []),
      },
      input.dto.message,
      { requireExplicitIntentDimensions: true },
    );
    if (contractMismatches.length) {
      await this.recordModelTrace({
        runId: input.runId,
        stepKey: 'supervisor_plan_contract_validation',
        layer: 'planning',
        status: 'failed',
        output: this.toJsonValue({
          code: 'CAPABILITY_CONTRACT_MISMATCH',
          planId: planning.plan.planId,
          missingDefinitions: contractMismatches,
          plannedCapabilities: plannedCards.map((card) => ({ key: card.key, version: card.version })),
        }),
      });
      return this.modelFailure(
        'CAPABILITY_CONTRACT_MISMATCH',
        this.modelMetadata('plan', {
          ...input.modelMetadata,
          planId: planning.plan.planId,
          provider: planning.provider,
          model: planning.model,
          modelRouting: planning.routing ?? null,
        }),
        input.intent,
      );
    }
    const boundedExecutionStartedAt = Date.now();
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
    const boundedExecutionLatencyMs = Date.now() - boundedExecutionStartedAt;
    const boundedPhaseLatencyMs = execution.timings
      ? {
          ...execution.timings,
          executorOverheadMs: Math.max(
            0,
            boundedExecutionLatencyMs -
              execution.timings.capabilityExecutionMs -
              execution.timings.completionVerificationMs -
              execution.timings.replanningMs,
          ),
        }
      : null;
    await this.recordModelTrace({
      runId: input.runId,
      stepKey: 'bounded_dag_execution',
      layer: 'execution',
      output: this.toJsonValue({
        status: execution.status,
        planId: execution.plan.planId,
        replanCount: execution.replanCount,
        completion: execution.completion,
        phaseLatencyMs: boundedPhaseLatencyMs,
        observations: execution.observations.map((item) => ({
          nodeId: item.nodeId,
          capabilityKey: item.capabilityKey,
          capabilityVersion: item.capabilityVersion,
          status: item.status,
          grounding: item.grounding,
          citationCount: item.citations.length,
          errorCode: item.errorCode ?? null,
          executionDeduplication:
            item.data?.metadata && typeof item.data.metadata === 'object' && !Array.isArray(item.data.metadata)
              ? ((item.data.metadata as Record<string, unknown>).executionDeduplication ?? null)
              : null,
        })),
      }),
      status: execution.status === 'rejected' || noSuccessfulExecution ? 'failed' : 'completed',
      latencyMs: boundedExecutionLatencyMs,
    });

    const supervisorAnswerCompositionStartedAt = Date.now();
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
      modelRouting: planning.routing ?? null,
    });
    const executionTimeRange = this.modelExecutionTimeRange(
      ...execution.observations.map((observation) => observation.data?.metadata),
    );
    await this.recordModelTrace({
      runId: input.runId,
      stepKey: 'supervisor_answer_compose',
      layer: 'response',
      status: execution.status === 'rejected' || noSuccessfulExecution ? 'failed' : 'completed',
      latencyMs: Date.now() - supervisorAnswerCompositionStartedAt,
      output: this.toJsonValue({
        planId: execution.plan.planId,
        completedObservationCount: completed.length,
        limitationCount: limitations.length,
      }),
    });
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
      modelRouting: null,
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
      PRODUCTION_BASELINE_UNAVAILABLE: '生产能力基线暂不可用，本次未执行查询，请联系管理员恢复已验证发布。',
      PRODUCTION_BASELINE_INVALID: '当前生产发布未包含有效语义快照和能力目录，本次未执行查询。',
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
    diagnosticDetail?: string;
    latencyMs?: number;
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
        ...(input.diagnosticDetail && /^[a-z0-9_]+(?::[a-z0-9_]+){1,2}$/iu.test(input.diagnosticDetail)
          ? { diagnosticDetail: input.diagnosticDetail }
          : {}),
      },
      status: 'failed',
      ...(input.latencyMs !== undefined ? { latencyMs: input.latencyMs } : {}),
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

  /**
   * Preserve only a whitelisted, code-shaped suffix for diagnostics.  The public answer and
   * persisted error stay generic; this lets evaluation distinguish a missing KPI from missing
   * list rows without placing an arbitrary exception message (which may contain business data)
   * into the trace.
   */
  private modelDiagnosticDetail(error: unknown): string | undefined {
    if (!(error instanceof Error)) return undefined;
    const value = error.message.trim().toLowerCase();
    return /^(?:brain_response_answer_contract_mismatch|brain_response_citation_required):[a-z_]+(?::[a-z_]+)?$/u.test(
      value,
    )
      ? value
      : undefined;
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

  private async enrichStoreScopedNamedEntityRefs(input: {
    intent: BrainSemanticIntent;
    question: string;
    context: BrainRequestContext;
    snapshot: ProductionReadyBusinessDefinitionSnapshot;
  }): Promise<BrainSemanticIntent> {
    const beauticianDefinition = input.snapshot.entities.find(
      (entity) => entity.definitionKey === 'entity.beautician' || entity.entityKey === 'beautician',
    );
    if (!beauticianDefinition) return input.intent;

    const beauticianEntities = input.intent.entities.filter(
      (entity) =>
        entity.entityType === 'beautician' ||
        entity.definitionRef?.definitionKey === beauticianDefinition.definitionKey,
    );
    const requestsBeautician =
      beauticianEntities.length > 0 ||
      input.intent.metrics.some((metric) => metric.definitionKey === 'metric.staff_commission_component_amount') ||
      input.intent.dimensions.some((dimension) =>
        ['dimension.beauticianId', 'dimension.beauticianName'].includes(dimension.definitionKey),
      );
    if (!requestsBeautician) return input.intent;
    if (
      beauticianEntities.some(
        (entity) => entity.source === 'conversation' && /^\d+$/u.test(String(entity.entityKey ?? '')),
      )
    ) {
      return input.intent;
    }

    const directory = await this.prisma.beautician.findMany({
      where: { storeId: input.context.storeId, status: 'active' },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
      take: 100,
    });
    const requestedMentions = new Set(beauticianEntities.map((entity) => entity.mention.trim()).filter(Boolean));
    const matched = directory.filter((beautician) => {
      const name = beautician.name.trim();
      return Boolean(name) && (input.question.includes(name) || requestedMentions.has(name));
    });
    const retainedEntities = input.intent.entities.filter(
      (entity) =>
        entity.entityType !== 'beautician' &&
        entity.definitionRef?.definitionKey !== beauticianDefinition.definitionKey,
    );
    if (!matched.length) {
      const unresolvedBeauticians = beauticianEntities.map((entity) => ({
        ...entity,
        entityKey: undefined,
        definitionRef: {
          definitionType: 'entity' as const,
          definitionKey: beauticianDefinition.definitionKey,
          definitionVersion: beauticianDefinition.version,
          definitionFingerprint: beauticianDefinition.definitionFingerprint,
          sourceFingerprint: beauticianDefinition.sourceFingerprint,
        },
      }));
      return unresolvedBeauticians.length
        ? { ...input.intent, entities: [...retainedEntities, ...unresolvedBeauticians] }
        : input.intent;
    }

    const seenIds = new Set<number>();
    const resolvedBeauticians = matched.flatMap((beautician) => {
      if (seenIds.has(beautician.id)) return [];
      seenIds.add(beautician.id);
      return [
        {
          entityType: 'beautician',
          entityKey: String(beautician.id),
          mention: beautician.name.trim(),
          source: 'user' as const,
          definitionRef: {
            definitionType: 'entity' as const,
            definitionKey: beauticianDefinition.definitionKey,
            definitionVersion: beauticianDefinition.version,
            definitionFingerprint: beauticianDefinition.definitionFingerprint,
            sourceFingerprint: beauticianDefinition.sourceFingerprint,
          },
          confidence: 1,
        },
      ];
    });
    return { ...input.intent, entities: [...retainedEntities, ...resolvedBeauticians] };
  }

  private normalizeExplicitActionTargetIntent(input: {
    intent: BrainSemanticIntent;
    question: string;
  }): BrainSemanticIntent {
    if (input.intent.intent !== 'action') return input.intent;
    const match = input.question.match(/(?:服务单|服务任务|任务)[#号\s]*(\d+)/);
    if (!match) return input.intent;
    const entityKey = match[1];
    const mention = match[0].trim();
    let normalized = false;
    const entities = input.intent.entities.map((entity) => {
      if (!['service_task', 'service_record'].includes(entity.entityType) || entity.definitionRef) return entity;
      normalized = true;
      return {
        ...entity,
        entityType: 'service_task',
        entityKey,
        mention,
        source: 'user' as const,
        confidence: Math.max(entity.confidence, 0.99),
      };
    });
    if (!normalized) {
      entities.unshift({
        entityType: 'service_task',
        entityKey,
        mention,
        source: 'user',
        confidence: 0.99,
      });
    }
    return { ...input.intent, entities };
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
      longTermMemory?: unknown;
      updatedAt?: unknown;
    };
    return {
      ...(snapshot.version === 1
        ? {
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
          }
        : {}),
      ...(snapshot.turnDirectives ? { turnDirectives: snapshot.turnDirectives } : {}),
      ...(snapshot.longTermMemory ? { longTermMemory: snapshot.longTermMemory } : {}),
    };
  }

  private modelConversationContextReadTrace(
    prepared: Awaited<ReturnType<BrainConversationContextService['prepareModelTurn']>>,
  ): Record<string, unknown> {
    const previous = prepared.previous;
    const directives = prepared.directives;
    const comparisonTarget = this.modelContextRecord(directives?.resolve).comparisonTarget;
    return {
      hasPreviousContext: Boolean(previous),
      rejectionCode: prepared.rejectionCode ?? null,
      metricCount: previous?.metrics.length ?? 0,
      dimensionCount: previous?.dimensions.length ?? 0,
      entityCount: previous?.entities.length ?? 0,
      capabilityKey: previous?.capability?.key ?? null,
      capabilityVersion: previous?.capability?.version ?? null,
      directiveMode: directives?.mode ?? null,
      inherit: directives?.inherit ?? [],
      hasComparisonTarget: Boolean(comparisonTarget),
    };
  }

  private modelContextCapabilityForCompletedAnswer(
    answer: BrainChatAnswer,
  ): { key: string; version: number; source: 'model_metadata' | 'verified_execution_consensus' } | undefined {
    const metadataKey = answer.modelMetadata?.capabilityKey;
    const metadataVersion = answer.modelMetadata?.capabilityVersion;
    if (
      typeof metadataKey === 'string' &&
      metadataKey.trim() &&
      Number.isInteger(metadataVersion) &&
      Number(metadataVersion) > 0
    ) {
      return { key: metadataKey, version: Number(metadataVersion), source: 'model_metadata' };
    }
    if (answer.modelMetadata?.modelStage !== 'execute') return undefined;

    const adapterMetadata = this.modelContextRecord(answer.adapterMetadata);
    const executionPlan = this.modelContextRecord(adapterMetadata.executionPlan);
    const nodes = Array.isArray(executionPlan.nodes) ? executionPlan.nodes : [];
    const observations = Array.isArray(adapterMetadata.observations) ? adapterMetadata.observations : [];
    const executed = observations.flatMap((value) => {
      const observation = this.modelContextRecord(value);
      return observation.status === 'completed' &&
        typeof observation.capabilityKey === 'string' &&
        Number.isInteger(observation.capabilityVersion) &&
        Number(observation.capabilityVersion) > 0
        ? [{ key: observation.capabilityKey, version: Number(observation.capabilityVersion) }]
        : [];
    });
    const matching = executed.filter((candidate) =>
      nodes.some((value) => {
        const node = this.modelContextRecord(value);
        return node.capabilityKey === candidate.key && node.capabilityVersion === candidate.version;
      }),
    );
    const unique = new Map(matching.map((candidate) => [`${candidate.key}@${candidate.version}`, candidate]));
    if (unique.size !== 1) return undefined;
    const [capability] = unique.values();
    return { ...capability!, source: 'verified_execution_consensus' };
  }

  private async loadLongTermMemorySlots(input: { context: BrainRequestContext; question: string; runId: number }) {
    if (!this.memoryService) return [];
    try {
      const items = await this.memoryService.retrieveForPlanning({
        storeId: input.context.storeId,
        userId: input.context.userId,
        question: input.question,
      });
      if (items.length) {
        await this.recordModelTrace({
          runId: input.runId,
          stepKey: 'long_term_memory_recall',
          layer: 'memory',
          status: 'completed',
          output: this.toJsonValue({ memoryIds: items.map((item) => item.id), count: items.length }),
        });
      }
      return items;
    } catch (error) {
      await this.recordModelTrace({
        runId: input.runId,
        stepKey: 'long_term_memory_recall',
        layer: 'memory',
        status: 'failed',
        error: this.toJsonValue({ message: this.errorMessage(error) }),
      });
      return [];
    }
  }

  private isStandaloneMemoryInstruction(message: string) {
    const normalized = message.replace(/\s+/g, ' ').trim();
    return /^(?:请记住|帮我记住|记住这条|以后|今后|设为默认|作为默认|忘记|不要再记|删除.*记忆|清除.*偏好|取消.*默认|你记得我什么|你都记得什么|查看我的记忆|列出我的记忆|我的偏好是什么|记住了什么)/.test(
      normalized,
    );
  }

  private canManageStoreMemory(context: BrainRequestContext) {
    const permission = 'core:brain-governance:manage';
    return (
      !context.deniedPermissions.includes(permission) &&
      (context.permissions.includes('*') || context.permissions.includes(permission))
    );
  }

  private memoryInstructionCitations(
    memories: Awaited<ReturnType<BrainMemoryService['retrieveRelevant']>>,
    runId: number,
  ) {
    return memories
      .filter((memory) => !memory.deletedAt)
      .map((memory) => ({
        sourceType: 'memory',
        sourceId: String(memory.id),
        label: memory.userId === null ? '门店共享记忆' : '个人长期记忆',
        definition: `来源 Run #${memory.sourceRunId ?? runId}，更新时间 ${memory.updatedAt.toISOString()}`,
      }));
  }

  private recordMemoryInstructionTrace(runId: number, action: string, memoryIds: number[]) {
    return this.traceService.recordStep({
      runId,
      stepKey: 'memory_instruction',
      layer: 'memory',
      input: { action } as Prisma.InputJsonValue,
      output: { action, memoryIds } as Prisma.InputJsonValue,
      status: action === 'rejected' ? 'failed' : 'completed',
    });
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

  private modelDefinitionRef<T extends 'entity' | 'relation' | 'metric' | 'dimension' | 'action'>(
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
    latencyMs: number;
    output?: Record<string, unknown>;
    error?: Record<string, unknown>;
  }) {
    try {
      await this.traceService.recordStep({
        runId: input.runId,
        stepKey: 'business_semantic_evidence_capture',
        layer: 'semantic',
        status: input.status,
        latencyMs: input.latencyMs,
        output: {
          timingScope: 'outside_brain_run',
          ...(input.output ?? {}),
        } as Prisma.InputJsonValue,
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
    return (
      context.roles
        ?.map((role) => resolveBrainDomainRole(role))
        .find((role): role is BrainDomainRole => Boolean(role)) ?? 'store_manager'
    );
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
    if (/(?=.*(?:美容师|员工|技师))(?=.*客户)(?=.*(?:流失|未到店|沉睡))/.test(question)) {
      return {
        unsupportedReason: 'staff_customer_churn_attribution_not_available',
        answer:
          '当前管理端和后台没有按美容师归属的客户留存基线、流失事件和归因事实，无法判断哪位美容师的客户流失偏多。Ami Brain 不会用客户流失名单、员工表现分、服务量或复购人数替代客户流失归因。',
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
        roles: _context.roles,
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

  private async createAssistantMessageWithRetry(input: Parameters<PrismaService['brainMessage']['create']>[0]) {
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
  options: { exactGovernedExample?: boolean; requireExplicitIntentDimensions?: boolean } = {},
): string[] {
  if (options.exactGovernedExample) return [];
  const declared = Array.isArray(card.definitionRefs)
    ? card.definitionRefs.map((item) => normalizeDefinitionKey(item.definitionKey))
    : [];
  const domains = [
    ...(Array.isArray(card.domains) ? card.domains.map((item) => item.toLowerCase()) : []),
    ...capabilityKeyDomains(card.key),
  ];
  const requestedMetrics = (intent.metrics ?? [])
    .map((item) => item.definitionKey)
    .filter((item): item is string => Boolean(item));
  const requestedIntentDimensions = (intent.dimensions ?? [])
    .map((item) => item.definitionKey)
    .filter((item): item is string => Boolean(item));
  const inferredQuestionDimensions = inferQuestionDimensionDefinitions(question);
  const missingIntentDimensions = requestedIntentDimensions.filter((item) => {
    if (declared.includes(normalizeDefinitionKey(item))) return false;
    if (options.requireExplicitIntentDimensions) return true;
    const requiredDomains = definitionDomains(item);
    return requiredDomains.length > 0 && !requiredDomains.some((domain) => domains.includes(domain));
  });
  if (intent.intent === 'draft' || intent.intent === 'action') {
    return options.requireExplicitIntentDimensions ? [...new Set(missingIntentDimensions)] : [];
  }
  if (intent.intent === 'diagnosis' && card.grounding === 'domain_service') {
    return options.requireExplicitIntentDimensions ? [...new Set(missingIntentDimensions)] : [];
  }
  const allowsFinanceOrderProfitContract =
    card.key === 'finance_risk_overview' && requestedMetrics.some(isFinanceOrderProfitMetricDefinitionKey);
  const allowsFinanceStaffCommissionCompositionContract =
    card.key === 'finance_risk_overview' &&
    requestedMetrics.some(isFinanceStaffCommissionCompositionMetricDefinitionKey);
  const allowedFinanceRiskMetrics = new Set<string>();
  if (allowsFinanceOrderProfitContract) {
    for (const key of [
      'metric.negative_margin_order_count',
      'metric.order_gross_profit_amount',
      'metric.prepaid_order_gross_profit_amount',
      'metric.product_order_total_cost_amount',
      'metric.product_order_gross_profit_amount',
    ]) {
      allowedFinanceRiskMetrics.add(key);
    }
  }
  if (allowsFinanceStaffCommissionCompositionContract) {
    allowedFinanceRiskMetrics.add('metric.staff_commission_component_amount');
  }
  return [
    ...new Set([
      ...requestedMetrics.filter(
        (item) => !declared.includes(normalizeDefinitionKey(item)) && !allowedFinanceRiskMetrics.has(item),
      ),
      ...missingIntentDimensions,
      ...inferredQuestionDimensions.filter((item) => {
        if (allowsFinanceOrderProfitContract || allowsFinanceStaffCommissionCompositionContract) return false;
        if (declared.includes(normalizeDefinitionKey(item))) return false;
        const requiredDomains = definitionDomains(item);
        return requiredDomains.length > 0 && !requiredDomains.some((domain) => domains.includes(domain));
      }),
    ]),
  ];
}

export function findUnresolvedBusinessDefinitionRequirements(intent: BrainSemanticIntent, question: string): string[] {
  const normalizedQuestion = question.replace(/\s+/gu, '');
  const hasOrderProfitMetric = intent.metrics.some((metric) => {
    return isFinanceOrderProfitMetricDefinitionKey(metric.definitionKey);
  });
  if (
    hasOrderProfitMetric &&
    /(?:产品|商品|货品).*(?:低于成本|毛利率|毛利)|(?:低于成本|毛利率|毛利).*(?:产品|商品|货品)/.test(normalizedQuestion)
  ) {
    return [];
  }
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

function isFinanceOrderProfitMetricDefinitionKey(definitionKey: string): boolean {
  const key = normalizeDefinitionKey(definitionKey);
  return (
    key.includes('order') &&
    (key.includes('gross_profit') || key.includes('total_cost') || key.includes('cost') || key.includes('margin'))
  );
}

function isFinanceStaffCommissionCompositionMetricDefinitionKey(definitionKey: string): boolean {
  return normalizeDefinitionKey(definitionKey) === 'staffcommissioncomponentamount';
}

function controlledCapabilityRetrievalReason(value: string): string {
  const allowed = new Set([
    'no_capability_after_hard_filters',
    'top1_below_confidence_threshold',
    'top1_margin_insufficient',
    'top1_selected',
    'action_definition_not_resolved',
    'action_binding_not_published',
    'action_binding_priority_ambiguous',
    'action_binding_selected',
    'catalog_top1_below_confidence_threshold',
    'catalog_top1_margin_insufficient',
    'catalog_unique_field_evidence',
    'catalog_top1_selected',
    'model_delivery_contract_selected',
    'reservation_project_ranking_contract_selected',
    'manager_staff_directory_contract_selected',
  ]);
  return allowed.has(value) ? value : 'capability_retrieval_result';
}

function definitionRefFromCard<T extends 'entity' | 'metric' | 'dimension'>(
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
  if (isStaffCommissionCompositionQuestion(question)) {
    metrics.push('metric.staff_commission_component_amount');
  } else if (/提成/.test(question)) {
    metrics.push('metric.staff_commission_amount');
  }
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
  if (
    /(?:库存|产品|商品|货品|耗材|物料).*(?:缺货|断货|低于安全库存|低库存|安全库存|临期|过期|风险|预警|最紧急|优先处理)|(?:缺货|断货|低于安全库存|低库存|安全库存|临期|过期|库存风险|库存预警|最紧急|优先处理).*(?:库存|产品|商品|货品|耗材|物料)/.test(
      question,
    )
  ) {
    metrics.push('metric.stock_risk_score');
  }
  return [...new Set(metrics)];
}

function isStaffCommissionCompositionQuestion(question: string): boolean {
  return (
    /提成/.test(question) &&
    (/(?:构成|组成|拆分|分布|来源|结构|类型|分类)/.test(question) ||
      /(?:项目|服务).*(?:产品|商品)|(?:产品|商品).*(?:项目|服务)/.test(question))
  );
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
