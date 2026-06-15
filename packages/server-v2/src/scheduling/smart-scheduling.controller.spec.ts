import { SmartSchedulingController } from './smart-scheduling.controller';
import { SmartSchedulingService } from './smart-scheduling.service';

describe('SmartSchedulingController', () => {
  let controller: SmartSchedulingController;
  let service: jest.Mocked<Pick<SmartSchedulingService, 'preview' | 'evaluate' | 'publish' | 'demand'>>;

  beforeEach(() => {
    service = {
      preview: jest.fn().mockResolvedValue({ runId: 'smart_1', weekStart: '2026-06-08' }),
      evaluate: jest.fn().mockResolvedValue({ weekStart: '2026-06-08' }),
      publish: jest.fn().mockResolvedValue({ runId: 'smart_1', weekStart: '2026-06-08' }),
      demand: jest.fn().mockResolvedValue({ weekStart: '2026-06-08', slots: [] }),
    };
    controller = new SmartSchedulingController(service as unknown as SmartSchedulingService);
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
    await controller.publish('3', {
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
        runId: 'smart_1_20260608_001',
        schedules: expect.arrayContaining([
          expect.objectContaining({ beauticianId: 1, startTime: '10:00', endTime: '11:00' }),
        ]),
      }),
    );
  });

  it('passes storeId and weekStart for demand heatmap', async () => {
    await controller.demand('3', '2026-06-08');

    expect(service.demand).toHaveBeenCalledWith({
      storeId: 3,
      weekStart: '2026-06-08',
    });
  });
});
