import { PERMISSIONS_KEY } from '../common/decorators/permissions.decorator.js';
import { CommissionController } from './commission.controller.js';

describe('CommissionController finance scope', () => {
  const user = { id: 7, storeIds: [3], roles: ['store_manager'], permissions: ['core:finance:manage'] };

  it('passes the authenticated actor and selected store when confirming a daily settlement', async () => {
    const service: any = { confirmDailySettlement: jest.fn().mockResolvedValue({ id: 99 }) };
    const controller = new CommissionController(service);

    await controller.confirmDailySettlement(99, user as any, '3');

    expect(service.confirmDailySettlement).toHaveBeenCalledWith(99, 7, 3);
  });

  it('passes the authenticated super admin context and reason when reopening a daily settlement', async () => {
    const service: any = { reopenDailySettlement: jest.fn().mockResolvedValue({ id: 99, status: 'draft' }) };
    const controller = new CommissionController(service);
    const admin = { id: 1, storeIds: [], roles: ['super_admin'], permissions: ['*'] };

    await controller.reopenDailySettlement(99, { reason: '补录退款后重新结账' }, admin as any);

    expect(service.reopenDailySettlement).toHaveBeenCalledWith(99, {
      userId: 1,
      storeIds: [],
      roles: ['super_admin'],
      permissions: ['*'],
      reason: '补录退款后重新结账',
    });
  });

  it('protects platform revenue with the platform revenue permission', () => {
    const permissions = Reflect.getMetadata(PERMISSIONS_KEY, CommissionController.prototype.getPlatformRevenue);
    expect(permissions).toEqual(['core:platform-revenue:view']);
  });

  it('runs reconciliation in the authenticated store and uses the reconciliation gate for manual confirmation', async () => {
    const commissionService: any = {};
    const reconciliationService: any = {
      runDailyClose: jest.fn().mockResolvedValue({ status: 'passed' }),
      confirmDailySettlementManually: jest.fn().mockResolvedValue({ id: 99, status: 'confirmed' }),
    };
    const controller = new CommissionController(commissionService, reconciliationService);

    await controller.runReconciliation({ storeId: 3, date: '2026-07-13' }, '3', user as any);
    await controller.confirmDailySettlement(99, user as any, '3');

    expect(reconciliationService.runDailyClose).toHaveBeenCalledWith(3, '2026-07-13', { triggerType: 'manual', autoConfirm: true });
    expect(reconciliationService.confirmDailySettlementManually).toHaveBeenCalledWith(99, {
      userId: 7,
      storeIds: [3],
      roles: ['store_manager'],
      permissions: ['core:finance:manage'],
    }, 3);
  });
});
