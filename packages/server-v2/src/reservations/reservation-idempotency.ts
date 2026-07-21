import { createHash } from 'node:crypto';

export function normalizeReservationBookingSource(value: unknown) {
  const source = String(value ?? '').trim().toLowerCase();
  return source || 'manual';
}

export function buildReservationIdempotencyKey(storeId: number, bookingSource: unknown, value: unknown) {
  const key = String(value ?? '').trim();
  if (!key) return undefined;
  const source = normalizeReservationBookingSource(bookingSource);
  return createHash('sha256').update(`reservation:${storeId}:${source}:${key}`).digest('hex');
}

export function buildReservationCreationFingerprint(input: Record<string, unknown>) {
  const appointment = new Date(String(input.appointmentTime ?? input.date ?? ''));
  const normalizedAppointment = Number.isNaN(appointment.getTime())
    ? ''
    : new Date(appointment.getTime() - (appointment.getTime() % 60_000)).toISOString();
  const customerId = positiveId(input.customerId);
  const projectId = positiveId(input.projectId);
  const beauticianId = positiveId(input.beauticianId);
  const payload = {
    storeId: positiveId(input.storeId),
    bookingSource: normalizeReservationBookingSource(input.bookingSource),
    customerId,
    customerName: customerId ? '' : text(input.customerName),
    customerPhone: customerId ? '' : text(input.customerPhone),
    projectId,
    projectName: projectId ? '' : text(input.projectName),
    beauticianId,
    beauticianName: beauticianId ? '' : text(input.beauticianName),
    appointmentTime: normalizedAppointment,
    startTime: text(input.startTime),
    endTime: text(input.endTime),
    duration: positiveId(input.duration),
    remark: text(input.remark),
  };
  return createHash('sha256').update(`reservation-create:${JSON.stringify(payload)}`).digest('hex');
}

function positiveId(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function text(value: unknown) {
  return String(value ?? '').trim();
}
