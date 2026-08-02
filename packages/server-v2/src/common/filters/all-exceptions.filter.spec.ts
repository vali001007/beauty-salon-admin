import { ConflictException, ForbiddenException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

describe('AllExceptionsFilter', () => {
  it('maps database connection failures to a retryable service response', () => {
    const status = jest.fn();
    const json = jest.fn();
    status.mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
      }),
    };
    const error = Object.assign(new Error("Can't reach database server"), { code: 'P1001' });

    new AllExceptionsFilter().catch(error, host as any);

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({
      message: '数据服务暂不可用，请稍后重试',
      code: 'DATABASE_UNAVAILABLE',
      status: 503,
      details: undefined,
    });
  });

  it('maps session pool exhaustion nested in Prisma metadata to 503', () => {
    const status = jest.fn();
    const json = jest.fn();
    status.mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
      }),
    };
    const error = Object.assign(new Error('Driver adapter error'), {
      meta: {
        cause: {
          originalCode: 'XX000',
          originalMessage:
            '(EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size: 15',
        },
      },
    });

    new AllExceptionsFilter().catch(error, host as any);

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({
      message: '数据服务暂不可用，请稍后重试',
      code: 'DATABASE_UNAVAILABLE',
      status: 503,
      details: undefined,
    });
  });

  it('maps local pool acquisition timeouts to 503', () => {
    const status = jest.fn();
    const json = jest.fn();
    status.mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
      }),
    };

    new AllExceptionsFilter().catch(
      new Error('timeout exceeded when trying to connect'),
      host as any,
    );

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({
      message: '数据服务暂不可用，请稍后重试',
      code: 'DATABASE_UNAVAILABLE',
      status: 503,
      details: undefined,
    });
  });

  it('does not expose Prisma or local source details for unknown server errors', () => {
    const status = jest.fn();
    const json = jest.fn();
    status.mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
      }),
    };
    const error = new Error('Invalid tx.orderItem.createMany() invocation in D:\\AI coding\\beauty-salon-admin');

    new AllExceptionsFilter().catch(error, host as any);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      message: '服务器内部错误，请稍后重试',
      code: 'INTERNAL_ERROR',
      status: 500,
      details: undefined,
    });
  });

  it('returns a structured wait-CI blocker for governance evidence conflicts', () => {
    const status = jest.fn();
    const json = jest.fn();
    status.mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ originalUrl: '/api/brain/governance/tasks/7/retry' }),
        getResponse: () => ({ status }),
      }),
    };

    new AllExceptionsFilter().catch(
      new ConflictException('governance_task_waiting_for_evidence'),
      host as any,
    );

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'governance_task_waiting_for_evidence',
      category: 'business_blocker',
      message: '正在等待 CI 可信证据，Receipt 入库后会自动继续。',
      resolutionType: 'wait_ci',
      retryable: false,
    }));
  });

  it('returns a structured permission response for governance authorization failures', () => {
    const status = jest.fn();
    const json = jest.fn();
    status.mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ originalUrl: '/api/brain/governance/policy-snapshots/7/publish' }),
        getResponse: () => ({ status }),
      }),
    };

    new AllExceptionsFilter().catch(new ForbiddenException(), host as any);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'brain_governance_permission_denied',
      category: 'permission',
      message: '缺少执行该治理操作所需的权限。',
      resolutionType: 'request_approval',
      retryable: false,
    }));
  });

  it('returns retry metadata for an unexpected governance system failure', () => {
    const status = jest.fn();
    const json = jest.fn();
    status.mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ originalUrl: '/api/brain/governance/candidates' }),
        getResponse: () => ({ status }),
      }),
    };

    new AllExceptionsFilter().catch(new Error('worker unavailable'), host as any);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'INTERNAL_ERROR',
      category: 'system',
      message: '服务器内部错误，请稍后重试',
      resolutionType: 'retry_system',
      retryable: true,
    }));
  });
});
