import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { CreateBusinessDefinitionDraftDto, ValidateBusinessDefinitionVersionDto } from './business-definition.dto.js';

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

describe('Business definition DTO security boundary', () => {
  it('rejects client-controlled source and evidence fingerprints', async () => {
    await expect(
      transform(CreateBusinessDefinitionDraftDto, {
        ...validDraft(),
        sourceFingerprint: '0'.repeat(64),
        evidence: [{ ...validDraft().evidence[0], evidenceFingerprint: '1'.repeat(64) }],
      }),
    ).rejects.toThrow();
  });

  it('rejects client-controlled validation passed/report fields', async () => {
    await expect(
      transform(ValidateBusinessDefinitionVersionDto, { passed: true, report: { passed: true } }),
    ).rejects.toThrow();
  });

  it('rejects lineEnd before lineStart', async () => {
    await expect(
      transform(CreateBusinessDefinitionDraftDto, {
        ...validDraft(),
        evidence: [{ ...validDraft().evidence[0], lineStart: 20, lineEnd: 10 }],
      }),
    ).rejects.toThrow();
  });
});

function transform<T>(metatype: new () => T, value: unknown) {
  const metadata: ArgumentMetadata = { type: 'body', metatype, data: undefined };
  return pipe.transform(value, metadata);
}

function validDraft() {
  return {
    definitionKey: 'metric.net_revenue',
    kind: 'metric',
    domain: 'finance',
    name: '净收入',
    ownerType: 'system',
    payload: { aggregation: 'sum' },
    canonicalQueryRef: 'finance_metrics.net_revenue',
    fixtureSetKey: 'finance.net_revenue.v1',
    timezone: 'Asia/Shanghai',
    storeScope: { mode: 'current_store' },
    evidence: [
      {
        sourceType: 'service',
        sourcePath: 'src/finance-metrics/finance-metrics.service.ts',
        lineStart: 10,
        lineEnd: 20,
        evidenceKind: 'query_implementation',
        confidence: 1,
      },
    ],
  };
}
