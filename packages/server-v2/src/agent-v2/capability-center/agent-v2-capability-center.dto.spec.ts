import { ArgumentMetadata, Type, ValidationPipe } from '@nestjs/common';
import {
  AgentV2AutoGovernanceDto,
  AgentV2AutoPublishRunDto,
  AgentV2CapabilityDraftListQueryDto,
  AgentV2DeployHookRunDto,
  AgentV2PostPublishSmokeDto,
  AgentV2PublishDto,
  AgentV2UpdateDraftDto,
} from './agent-v2-capability-center.dto.js';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

function metadata(metatype: Type<unknown>, type: ArgumentMetadata['type'] = 'body'): ArgumentMetadata {
  return { type, metatype, data: '' };
}

function transform<T>(metatype: new () => T, value: unknown, type: ArgumentMetadata['type'] = 'body') {
  return pipe.transform(value, metadata(metatype, type)) as Promise<T>;
}

describe('AgentV2CapabilityCenter DTO validation', () => {
  it('converts list query paging while keeping filter enums bounded', async () => {
    const result = await transform(AgentV2CapabilityDraftListQueryDto, {
      page: '2',
      pageSize: '50',
      status: 'published',
      riskLevel: 'low',
      releaseStrategy: 'auto_publish',
    }, 'query');

    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(50);
    await expect(transform(AgentV2CapabilityDraftListQueryDto, { page: '0' }, 'query')).rejects.toThrow();
    await expect(transform(AgentV2CapabilityDraftListQueryDto, { status: 'published;drop' }, 'query')).rejects.toThrow();

    await expect(transform(AgentV2CapabilityDraftListQueryDto, { status: 'needs_development' }, 'query')).resolves.toMatchObject({
      status: 'needs_development',
    });
    await expect(transform(AgentV2CapabilityDraftListQueryDto, { status: 'needs_changes' }, 'query')).resolves.toMatchObject({
      status: 'needs_changes',
    });
  });

  it('rejects list-only values when updating a draft', async () => {
    await expect(transform(AgentV2UpdateDraftDto, {
      status: 'all',
      releaseStrategy: 'all',
      riskLevel: 'all',
    })).rejects.toThrow();

    const result = await transform(AgentV2UpdateDraftDto, {
      status: 'approved',
      releaseStrategy: 'auto_publish',
      riskLevel: 'low',
      triggerKeywords: '人效',
    });
    expect(result.triggerKeywords).toEqual(['人效']);
  });

  it('validates read-only smoke input before executing runtime tools', async () => {
    await expect(transform(AgentV2PostPublishSmokeDto, { storeId: 0 })).rejects.toThrow();
    await expect(transform(AgentV2PostPublishSmokeDto, { question: 'x'.repeat(501) })).rejects.toThrow();

    const result = await transform(AgentV2PostPublishSmokeDto, {
      storeId: '3',
      question: '这个月人效怎么样',
    });
    expect(result.storeId).toBe(3);
    expect(result.question).toBe('这个月人效怎么样');
  });

  it('validates auto governance scope before changing draft statuses', async () => {
    const result = await transform(AgentV2AutoGovernanceDto, {
      mode: 'open',
      limit: '20',
      capabilityIds: 'order.product.records.list',
      storeId: '1',
    });
    expect(result.limit).toBe(20);
    expect(result.storeId).toBe(1);
    expect(result.capabilityIds).toEqual(['order.product.records.list']);

    await expect(transform(AgentV2AutoGovernanceDto, { mode: 'everything' })).rejects.toThrow();
    await expect(transform(AgentV2AutoGovernanceDto, { limit: '101' })).rejects.toThrow();
  });

  it('keeps deploy hook input narrower than manual auto-publish input', async () => {
    const manual = await transform(AgentV2AutoPublishRunDto, {
      scanMode: 'git_diff',
      overwriteReviewed: 'false',
      postPublishSmoke: 'true',
      postPublishSmokeLimit: '3',
    });
    expect(manual.overwriteReviewed).toBe(false);
    expect(manual.postPublishSmoke).toBe(true);
    expect(manual.postPublishSmokeLimit).toBe(3);

    await expect(transform(AgentV2DeployHookRunDto, {
      scanMode: 'git_diff',
      overwriteReviewed: true,
    })).rejects.toThrow();
  });

  it('rejects malformed publish payloads before manifest writes', async () => {
    await expect(transform(AgentV2PublishDto, {
      mode: 'force',
      capabilityIds: ['finance.staff-efficiency.metric'],
    })).rejects.toThrow();
    await expect(transform(AgentV2PublishDto, {
      mode: 'selected',
      capabilityIds: [7],
    })).rejects.toThrow();

    const result = await transform(AgentV2PublishDto, {
      mode: 'selected',
      capabilityIds: 'finance.staff-efficiency.metric',
    });
    expect(result.capabilityIds).toEqual(['finance.staff-efficiency.metric']);
  });
});
