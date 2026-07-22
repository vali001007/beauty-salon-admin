import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { CreateBrainEvalRunDto } from './brain-governance.dto.js';

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const metadata: ArgumentMetadata = { type: 'body', metatype: CreateBrainEvalRunDto };

describe('CreateBrainEvalRunDto', () => {
  it('accepts a positive source eval run id for failed-case regression', async () => {
    await expect(pipe.transform({ sourceEvalRunId: 41 }, metadata)).resolves.toMatchObject({ sourceEvalRunId: 41 });
  });

  it('rejects an invalid source eval run id', async () => {
    await expect(pipe.transform({ sourceEvalRunId: 0 }, metadata)).rejects.toBeDefined();
  });

  it('accepts a bounded release evaluation request', async () => {
    await expect(
      pipe.transform(
        {
          releaseId: 21,
          caseKeys: ['release_capability:21:customer_facts:1'],
          roleKey: 'store_manager',
          modelVersion: 'deepseek-chat',
        },
        metadata,
      ),
    ).resolves.toMatchObject({ releaseId: 21, roleKey: 'store_manager' });
  });

  it.each([
    { releaseId: 0 },
    { caseKeys: 'case_1' },
    { caseKeys: ['bad key with spaces'] },
    { roleKey: 'super_admin' },
    { modelVersion: 'x'.repeat(121) },
    { unknown: true },
  ])('rejects malformed governance eval input: %o', async (body) => {
    await expect(pipe.transform(body, metadata)).rejects.toBeDefined();
  });
});
