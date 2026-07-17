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
});
