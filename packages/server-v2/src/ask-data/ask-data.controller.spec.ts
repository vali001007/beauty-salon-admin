import { ForbiddenException } from '@nestjs/common';
import { AskDataController } from './ask-data.controller';

describe('AskDataController', () => {
  const service = { query: jest.fn(), getCatalog: jest.fn() };
  const controller = new AskDataController(service as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('denies querying a store outside current user scope', () => {
    const req = {
      headers: { 'x-store-id': '9' },
      user: { id: 1, storeIds: [6], permissions: ['core:dashboard:view'], deniedPermissions: [] },
    } as never;

    expect(() => controller.query(req, { question: '项目收入多少' })).toThrow(ForbiddenException);
    expect(service.query).not.toHaveBeenCalled();
  });

  it('passes scoped store context to service', () => {
    service.query.mockResolvedValue({
      status: 'unsupported',
      rows: [],
      columns: [],
      sources: [],
      queryPlan: { intent: 'unsupported' },
    });
    const req = {
      headers: { 'x-store-id': '6' },
      user: { id: 1, storeIds: [6], permissions: ['core:dashboard:view'], deniedPermissions: [] },
    } as never;

    controller.query(req, { question: '项目收入多少' });

    expect(service.query).toHaveBeenCalledWith(
      { question: '项目收入多少' },
      expect.objectContaining({ storeId: 6, userId: 1 }),
    );
  });
});
