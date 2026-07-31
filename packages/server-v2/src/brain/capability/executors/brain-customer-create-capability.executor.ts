import { Injectable } from '@nestjs/common';
import type { BrainRiskLevel, Prisma } from '@prisma/client';
import type { BrainDomainAnswer } from '../../domain/brain-domain-adapter.types.js';
import { BrainActionConfirmationService } from '../../skills/brain-action-confirmation.service.js';
import type {
  BrainCapabilityExecutionInput,
  BrainCapabilityExecutor,
  BrainCapabilityToolArgs,
} from '../brain-capability-executor.registry.js';
import { BrainCapability } from '../brain-capability.decorator.js';

const CAPABILITY_KEY = 'customer_create_preview';
const ACTION_KEY = 'create_customer';

@Injectable()
export class BrainCustomerCreateCapabilityExecutor implements BrainCapabilityExecutor {
  readonly kind = 'action' as const;
  readonly capabilityKeys = Object.freeze([CAPABILITY_KEY]);

  constructor(private readonly actionConfirmationService: BrainActionConfirmationService) {}

  @BrainCapability({
    key: 'customer_create_preview',
    name: '客户建档预览',
    description:
      '从当前问题解析客户姓名和手机号，生成高风险待确认客户建档预览。门店只使用服务端上下文，确认前不创建客户；确认后通过 CustomersService.create 写入当前门店并返回客户档案回执。脱敏手机号允许预览，但执行前必须补全。',
    intents: ['action'],
    examples: ['帮王静怡新建客户档案，电话138xxxx807', '创建客户李女士，手机号13800138000'],
    negativeExamples: ['直接创建不要确认', '给其他门店创建客户', '没有姓名或电话也直接建档', '查询客户档案'],
    synonyms: ['新建客户档案', '创建客户资料', '客户建档', '新增客户'],
    businessDefinitionKeys: ['entity.customer', 'action.create_customer'],
    readOnly: false,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:customer:create'],
    allowedRoles: ['receptionist', 'customer_service', 'store_manager'],
    requiresConfirmation: true,
    idempotency: 'required',
  })
  customerCreatePreview(args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared(args, input);
  }

  async execute(input: BrainCapabilityExecutionInput): Promise<BrainDomainAnswer> {
    if (input.card.key !== CAPABILITY_KEY) throw new Error(`unsupported_customer_create_capability:${input.card.key}`);
    return this.executeDeclared(input.args as BrainCapabilityToolArgs, input);
  }

  private async executeDeclared(
    args: BrainCapabilityToolArgs,
    input: BrainCapabilityExecutionInput,
  ): Promise<BrainDomainAnswer> {
    if (input.actionProvenance && args.actionModality !== 'request') {
      return this.clarification(['actionRequest']);
    }
    const target = input.actionProvenance
      ? parseGovernedCustomerCreateTarget(args)
      : parseCustomerCreateTarget(input.question);
    const missingCriteria = [!target.name ? 'customerName' : null, !target.phone ? 'customerPhone' : null].filter(
      (value): value is string => Boolean(value),
    );
    if (missingCriteria.length) return this.clarification(missingCriteria);

    const name = target.name;
    const phone = target.phone;
    if (!name || !phone)
      return this.clarification(missingCriteria.length ? missingCriteria : ['customerName', 'customerPhone']);

    const phoneMasked = isMaskedPhone(phone);
    const maskedPhone = maskPhone(phone);
    const preview = {
      actionId: `preview_customer_create_${input.runId}`,
      skillKey: ACTION_KEY,
      actionType: ACTION_KEY,
      riskLevel: 'high' as BrainRiskLevel,
      requiresConfirmation: true,
      summary: `新建客户档案：${name}，手机号 ${maskedPhone}`,
      impactItems: [{ objectType: 'customer', objectId: 'new', label: `${name}（${maskedPhone}）` }],
      customer: { name, phone: maskedPhone, phoneMasked },
      expectedReceipt: {
        businessObjectType: 'customer',
        message: phoneMasked
          ? '当前号码为脱敏号码，确认执行会被拒绝写入；请补充完整手机号后重新生成预览。'
          : '确认并成功写入后返回客户档案 ID；确认前客户数量保持不变。',
      },
    };
    const confirmation = await this.actionConfirmationService.createPreview({
      runId: input.runId,
      userId: input.context.userId,
      storeId: input.context.storeId,
      skillKey: ACTION_KEY,
      capabilityVersion: 1,
      riskLevel: 'high',
      preview: preview as unknown as Prisma.InputJsonValue,
      payload: { name, phone } as Prisma.InputJsonValue,
      planId: input.planId,
      ...(input.actionProvenance ? { actionProvenance: input.actionProvenance } : {}),
    });
    const persistedPreview = { ...preview, actionId: confirmation.actionId };
    return {
      status: 'completed',
      answer: `${preview.summary}。这是待确认预览，确认前不会写入客户数据。`,
      citations: [{ sourceType: 'domain_service', sourceId: 'customers.create', label: 'Ami Core 客户建档正式接口' }],
      suggestedActions: [persistedPreview],
      grounding: 'preview_action',
      blocks: [{ kind: 'action_preview', actions: [persistedPreview] }],
      metadata: {
        capabilityKey: CAPABILITY_KEY,
        actionType: ACTION_KEY,
        previewOnly: true,
        createsBusinessWrite: false,
        storeIdSource: 'server_context',
        phoneMasked,
        ...(phoneMasked ? { executionBlockedUntil: 'customer_phone_completed' } : {}),
      },
    };
  }

  private clarification(missingCriteria: string[]): BrainDomainAnswer {
    const question = missingCriteria.includes('actionRequest')
      ? '当前语义不是新建客户请求；确认、撤销或定时操作必须引用对应的既有动作记录。'
      : missingCriteria.includes('customerName')
        ? '请补充要新建档案的客户姓名。'
        : '请补充客户手机号后再生成建档预览。';
    return {
      status: 'completed',
      answer: question,
      citations: [],
      suggestedActions: [],
      grounding: 'none',
      blocks: [{ kind: 'clarification', question, options: [] }],
      metadata: {
        unsupportedReason: 'customer_create_target_requires_clarification',
        completion: { status: 'partial', missingCriteria, recoverable: true },
      },
    };
  }
}

function parseGovernedCustomerCreateTarget(args: BrainCapabilityToolArgs) {
  const slots = Array.isArray(args.actionSlots) ? args.actionSlots : [];
  const name = slots.find((slot) => slot.slotKey === 'name')?.rawValue?.trim() || null;
  const phone = slots.find((slot) => slot.slotKey === 'phone')?.rawValue?.trim() || null;
  return { name, phone };
}

function parseCustomerCreateTarget(question: string) {
  const compact = String(question ?? '')
    .replace(/\s+/gu, ' ')
    .trim();
  const name =
    compact.match(/帮\s*([\u3400-\u9fff·]{2,8})\s*(?:新建|创建|新增|添加)(?:一个|一份)?客户(?:档案|资料)?/u)?.[1] ??
    compact.match(
      /(?:新建|创建|新增|添加)(?:一个|一份)?客户(?:档案|资料)?[，,：:\s]*(?:姓名|名字|叫)[：:\s]*([\u3400-\u9fff·]{2,8})/u,
    )?.[1] ??
    compact.match(
      /(?:新建|创建|新增|添加)(?:一个|一份)?客户(?!档案|资料|电话|手机|手机号)([\u3400-\u9fff·]{2,8})(?=[，,。；;\s]|$)/u,
    )?.[1] ??
    compact.match(
      /(?:新建|创建|新增|添加)(?:一个|一份)?客户(?:档案|资料)?[，,：:\s]+(?!电话|手机|手机号)([\u3400-\u9fff·]{2,8})(?=[，,。；;\s]|$)/u,
    )?.[1] ??
    null;
  const phone = compact.match(/1\d{2}[\dxX*]{4,8}\d{2,4}/u)?.[0] ?? null;
  return { name, phone };
}

function isMaskedPhone(phone: string) {
  return /[xX*]/u.test(phone);
}

function maskPhone(phone: string) {
  if (isMaskedPhone(phone)) return phone.replace(/[xX*]+/gu, '****');
  if (phone.length < 7) return phone;
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}
