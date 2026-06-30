import { SmartSchedulingController } from './smart-scheduling.controller';
import { SmartSchedulingService } from './smart-scheduling.service';

describe('SmartSchedulingController', () => {
  let controller: SmartSchedulingController;
  let service: jest.Mocked<Pick<SmartSchedulingService, 'oneClick' | 'preview' | 'evaluate' | 'publish' | 'rollback' | 'runs' | 'demand'>>;

  beforeEach(() => {
    service = {
      oneClick: jest.fn().mockResolvedValue({ runId: 'smart_1', weekStart: '2026-06-08' }),
      preview: jest.fn().mockResolvedValue({ runId: 'smart_1', weekStart: '2026-06-08' }),
      evaluate: jest.fn().mockResolvedValue({ weekStart: '2026-06-08' }),
      publish: jest.fn().mockResolvedValue({ runId: 'smart_1', weekStart: '2026-06-08' }),
      rollback: jest.fn().mockResolvedValue({ runId: 'smart_rollback_1', weekStart: '2026-06-08' }),
      runs: jest.fn().mockResolvedValue({ weekStart: '2026-06-08', runs: [], versions: [] }),
      demand: jest.fn().mockResolvedValue({ weekStart: '2026-06-08', slots: [] }),
    };
    controller = new SmartSchedulingController(service as unknown as SmartSchedulingService);
  });

  it('uses x-store-id when one-click body does not include storeId', async () => {
    await controller.oneClick('3', 9, {
      weekStart: '2026-06-08',
      mode: 'balanced',
      generateAlternatives: true,
    });

    expect(service.oneClick).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 3,
        createdById: 9,
        weekStart: '2026-06-08',
        mode: 'balanced',
        generateAlternatives: true,
      }),
    );
  });

  it('uses x-store-id when preview body does not include storeId', async () => {
    await controller.preview('3', {
      weekStart: '2026-06-08',
      mode: 'copy_last_week_optimize',
      objective: 'cover_reservations',
    });

    expect(service.preview).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 3,
        weekStart: '2026-06-08',
        mode: 'copy_last_week_optimize',
      }),
    );
  });

  it('prefers body storeId over header storeId', async () => {
    await controller.evaluate('3', {
      storeId: 5,
      weekStart: '2026-06-08',
      schedules: [],
    });

    expect(service.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 5,
        weekStart: '2026-06-08',
        schedules: [],
      }),
    );
  });

  it('passes runId and schedules when publishing', async () => {
    await controller.publish('3', 9, {
      runId: 'smart_1_20260608_001',
      weekStart: '2026-06-08',
      schedules: [
        {
          beauticianId: 1,
          date: '2026-06-08',
          startTime: '10:00',
          endTime: '11:00',
          status: 'available',
        },
      ],
    });

    expect(service.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 3,
        createdById: 9,
        runId: 'smart_1_20260608_001',
        schedules: expect.arrayContaining([
          expect.objectContaining({ beauticianId: 1, startTime: '10:00', endTime: '11:00' }),
        ]),
      }),
    );
  });

  it('passes target version when rolling back', async () => {
    await controller.rollback('3', 9, {
      weekStart: '2026-06-08',
      targetVersionId: 12,
    });

    expect(service.rollback).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 3,
        createdById: 9,
        targetVersionId: 12,
      }),
    );
  });

  it('lists smart scheduling runs by query storeId first', async () => {
    await controller.runs('3', '2026-06-08', '5');

    expect(service.runs).toHaveBeenCalledWith({
      storeId: 5,
      weekStart: '2026-06-08',
    });
  });

  it('passes storeId and weekStart for demand heatmap', async () => {
    await controller.demand('3', '2026-06-08');

    expect(service.demand).toHaveBeenCalledWith({
      storeId: 3,
      weekStart: '2026-06-08',
    });
  });
});
