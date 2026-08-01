import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AskDataFreeSqlController } from './ask-data-free-sql.controller.js';

describe('AskDataFreeSqlController', () => {
  const service = { query: jest.fn(), getCatalog: jest.fn() };
  const controller = new AskDataFreeSqlController(service as any);

  it('passes authenticated store scope and permissions to the service', async () => {
    service.query.mockResolvedValueOnce({ status: 'success' });
    const req = {
      headers: { 'x-store-id': '6' },
      user: { id: 9, storeIds: [6], permissions: ['core:dashboard:view'], deniedPermissions: [] },
    } as any;
    await controller.query(req, { question: '本月收入' });
    expect(service.query).toHaveBeenCalledWith(
      { question: '本月收入' },
      expect.objectContaining({ storeId: 6, visibleStoreIds: [6] }),
    );
  });

  it('accepts the current JwtStrategy stores field as the visible store scope', async () => {
    service.query.mockResolvedValueOnce({ status: 'success' });
    const req = {
      headers: { 'x-store-id': '6' },
      user: { id: 9, stores: [6], permissions: ['core:dashboard:view'], deniedPermissions: [] },
    } as any;
    await controller.query(req, { question: '本月收入' });
    expect(service.query).toHaveBeenCalledWith(
      { question: '本月收入' },
      expect.objectContaining({ storeId: 6, visibleStoreIds: [6] }),
    );
  });

  it('rejects missing or out-of-scope store', () => {
    expect(() => controller.query({ headers: {}, user: { storeIds: [6] } } as any, { question: 'x' })).toThrow(
      BadRequestException,
    );
    expect(() =>
      controller.query({ headers: { 'x-store-id': '7' }, user: { storeIds: [6] } } as any, { question: 'x' }),
    ).toThrow(ForbiddenException);
  });
});
