import { BadRequestException, ConflictException } from '@nestjs/common';
import { formatBusinessDate, formatBusinessDateTime, toBusinessDateOnly } from '../common/utils/business-time.js';

const BLOCKING_RESERVATION_STATUSES = [
  'pending',
  'confirmed',
  'checked_in',
  'in_service',
  'scheduled',
  '待确认',
  '已确认',
  '已到店',
  '服务中',
];
const ACTIVE_TIME_OFF_STATUSES = ['approved', 'active'];

export interface NormalizedReservationWindow {
  readonly appointment: Date;
  readonly date: Date;
  readonly dateKey: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly durationMinutes: number;
}

export interface ReservationWindowAvailabilityInput extends NormalizedReservationWindow {
  readonly storeId: number;
  readonly beauticianId?: number | null;
  readonly excludeReservationId?: number;
}

export function normalizeReservationWindow(input: {
  appointmentTime: unknown;
  startTime?: unknown;
  endTime?: unknown;
  duration?: unknown;
  fallbackDuration?: unknown;
}): NormalizedReservationWindow {
  const appointment = parseReservationAppointment(input.appointmentTime);
  const [dateKey, appointmentStart] = formatBusinessDateTime(appointment).split(' ');
  if (!dateKey || !appointmentStart) throw new BadRequestException('预约时间无效');

  const declaredStart = optionalTime(input.startTime);
  if (declaredStart && declaredStart !== appointmentStart) {
    throw new BadRequestException('预约开始时间与预约时间不一致');
  }

  const declaredEnd = optionalTime(input.endTime);
  const explicitDuration = optionalPositiveDuration(input.duration);
  const fallbackDuration = optionalPositiveDuration(input.fallbackDuration) ?? 60;
  const durationFromEnd = declaredEnd ? minutesBetween(appointmentStart, declaredEnd) : undefined;
  if (declaredEnd && durationFromEnd === undefined) throw new BadRequestException('预约结束时间必须晚于开始时间');
  if (explicitDuration && durationFromEnd && explicitDuration !== durationFromEnd) {
    throw new BadRequestException('预约时长与结束时间不一致');
  }
  const durationMinutes = explicitDuration ?? durationFromEnd ?? fallbackDuration;
  if (durationMinutes > 12 * 60) throw new BadRequestException('预约时长不能超过 12 小时');

  const end = new Date(appointment.getTime() + durationMinutes * 60_000);
  if (formatBusinessDate(end) !== dateKey) throw new BadRequestException('预约暂不支持跨营业日');
  const endTime = formatBusinessDateTime(end).split(' ')[1];
  if (!endTime) throw new BadRequestException('预约结束时间无效');

  return {
    appointment,
    date: toBusinessDateOnly(appointment),
    dateKey,
    startTime: appointmentStart,
    endTime,
    durationMinutes,
  };
}

export async function assertReservationWindowAvailable(
  db: any,
  input: ReservationWindowAvailabilityInput,
): Promise<void> {
  const beauticianId = positiveId(input.beauticianId);
  if (!beauticianId) return;
  const nextDate = new Date(input.date);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);

  const [reservations, timeOffs, availabilityRules] = await Promise.all([
    db.reservation.findMany({
      where: {
        storeId: input.storeId,
        beauticianId,
        date: { gte: input.date, lt: nextDate },
        status: { in: BLOCKING_RESERVATION_STATUSES },
        ...(input.excludeReservationId ? { id: { not: input.excludeReservationId } } : {}),
      },
      select: { id: true, startTime: true, endTime: true, project: { select: { duration: true } } },
    }),
    db.beauticianTimeOff.findMany({
      where: {
        storeId: input.storeId,
        beauticianId,
        date: { gte: input.date, lt: nextDate },
        status: { in: ACTIVE_TIME_OFF_STATUSES },
      },
      select: { startTime: true, endTime: true },
    }),
    db.beauticianAvailability.findMany({
      where: {
        storeId: input.storeId,
        beauticianId,
        weekday: businessWeekday(input.dateKey),
        OR: [
          { effectiveFrom: null, effectiveTo: null },
          { effectiveFrom: null, effectiveTo: { gte: input.date } },
          { effectiveFrom: { lte: input.date }, effectiveTo: null },
          { effectiveFrom: { lte: input.date }, effectiveTo: { gte: input.date } },
        ],
      },
      select: { startTime: true, endTime: true, type: true },
    }),
  ]);

  const conflict = reservations.find((reservation: any) => {
    const startTime = validTime(reservation.startTime) ? reservation.startTime : '00:00';
    const fallbackEnd = addMinutes(startTime, optionalPositiveDuration(reservation.project?.duration) ?? 60);
    const endTime = validTime(reservation.endTime) ? reservation.endTime : fallbackEnd;
    return overlaps(startTime, endTime, input.startTime, input.endTime);
  });
  if (conflict) throw new ConflictException(`美容师该时段已有预约，请调整时间或美容师:reservation=${conflict.id}`);

  if (
    timeOffs.some((item: any) => overlaps(String(item.startTime), String(item.endTime), input.startTime, input.endTime))
  ) {
    throw new ConflictException('美容师该时段处于请假或不可用状态');
  }

  const unavailableRules = availabilityRules.filter((item: any) => String(item.type) === 'unavailable');
  if (
    unavailableRules.some((item: any) =>
      overlaps(String(item.startTime), String(item.endTime), input.startTime, input.endTime),
    )
  ) {
    throw new ConflictException('美容师该时段配置为不可用');
  }
  const availableRules = availabilityRules.filter((item: any) =>
    ['available', 'preferred'].includes(String(item.type)),
  );
  if (
    availableRules.length &&
    !availableRules.some((item: any) =>
      covers(String(item.startTime), String(item.endTime), input.startTime, input.endTime),
    )
  ) {
    throw new ConflictException('预约时段不在美容师可用时间内');
  }
}

export function reservationWindowLockKey(input: { storeId: number; dateKey: string; beauticianId?: number | null }) {
  const beauticianId = positiveId(input.beauticianId);
  return beauticianId ? `reservation-window:${input.storeId}:${input.dateKey}:${beauticianId}` : undefined;
}

function parseReservationAppointment(value: unknown) {
  if (value instanceof Date) {
    if (!Number.isNaN(value.getTime())) return new Date(value);
    throw new BadRequestException('预约时间无效');
  }
  const text = String(value ?? '').trim();
  if (!text) throw new BadRequestException('预约时间无效');
  const naive = text.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?$/u);
  const parsed = new Date(naive ? `${naive[1]}T${naive[2]}:${naive[3] ?? '00'}+08:00` : text);
  if (Number.isNaN(parsed.getTime())) throw new BadRequestException('预约时间无效');
  return parsed;
}

function optionalPositiveDuration(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new BadRequestException('预约时长必须为正整数分钟');
  return number;
}

function optionalTime(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined;
  const text = String(value).trim();
  if (!validTime(text)) throw new BadRequestException('预约时间段格式无效');
  return text;
}

function validTime(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(value);
}

function minutesBetween(startTime: string, endTime: string) {
  const difference = toMinutes(endTime) - toMinutes(startTime);
  return difference > 0 ? difference : undefined;
}

function overlaps(startA: string, endA: string, startB: string, endB: string) {
  return toMinutes(startA) < toMinutes(endB) && toMinutes(startB) < toMinutes(endA);
}

function covers(outerStart: string, outerEnd: string, innerStart: string, innerEnd: string) {
  return toMinutes(outerStart) <= toMinutes(innerStart) && toMinutes(outerEnd) >= toMinutes(innerEnd);
}

function toMinutes(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function addMinutes(value: string, minutes: number) {
  const total = toMinutes(value) + minutes;
  if (total >= 24 * 60) return '23:59';
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function businessWeekday(dateKey: string) {
  const day = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  return day || 7;
}

function positiveId(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}
