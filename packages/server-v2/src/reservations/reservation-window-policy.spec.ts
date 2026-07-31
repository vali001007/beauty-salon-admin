import { ConflictException } from '@nestjs/common';
import { assertReservationWindowAvailable, normalizeReservationWindow } from './reservation-window-policy.js';

describe('reservation window policy', () => {
  it('normalizes a timezone-less management input in the governed business timezone', () => {
    const window = normalizeReservationWindow({
      appointmentTime: '2026-08-01 15:00:00',
      endTime: '16:30',
    });

    expect(window).toMatchObject({
      dateKey: '2026-08-01',
      startTime: '15:00',
      endTime: '16:30',
      durationMinutes: 90,
    });
    expect(window.appointment.toISOString()).toBe('2026-08-01T07:00:00.000Z');
    expect(window.date.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });

  it('rejects an overlapping beautician reservation', async () => {
    const db = fixture();
    db.reservation.findMany.mockResolvedValue([
      { id: 41, startTime: '15:30', endTime: '16:30', project: { duration: 60 } },
    ]);
    const window = normalizeReservationWindow({ appointmentTime: '2026-08-01 15:00:00', duration: 60 });

    await expect(
      assertReservationWindowAvailable(db, { ...window, storeId: 6, beauticianId: 31 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows adjacent windows and excludes the reservation being rescheduled', async () => {
    const db = fixture();
    db.reservation.findMany.mockResolvedValue([
      { id: 42, startTime: '14:00', endTime: '15:00', project: { duration: 60 } },
    ]);
    const window = normalizeReservationWindow({ appointmentTime: '2026-08-01 15:00:00', duration: 60 });

    await expect(
      assertReservationWindowAvailable(db, {
        ...window,
        storeId: 6,
        beauticianId: 31,
        excludeReservationId: 41,
      }),
    ).resolves.toBeUndefined();
    expect(db.reservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { not: 41 } }) }),
    );
  });

  it('rejects approved time off and configured unavailable windows', async () => {
    const window = normalizeReservationWindow({ appointmentTime: '2026-08-01 15:00:00', duration: 60 });
    const timeOffDb = fixture();
    timeOffDb.beauticianTimeOff.findMany.mockResolvedValue([{ startTime: '14:30', endTime: '16:00' }]);
    await expect(
      assertReservationWindowAvailable(timeOffDb, { ...window, storeId: 6, beauticianId: 31 }),
    ).rejects.toThrow('请假或不可用');

    const unavailableDb = fixture();
    unavailableDb.beauticianAvailability.findMany.mockResolvedValue([
      { startTime: '15:00', endTime: '17:00', type: 'unavailable' },
    ]);
    await expect(
      assertReservationWindowAvailable(unavailableDb, { ...window, storeId: 6, beauticianId: 31 }),
    ).rejects.toThrow('配置为不可用');
  });
});

function fixture() {
  return {
    reservation: { findMany: jest.fn().mockResolvedValue([]) },
    beauticianTimeOff: { findMany: jest.fn().mockResolvedValue([]) },
    beauticianAvailability: { findMany: jest.fn().mockResolvedValue([]) },
  };
}
