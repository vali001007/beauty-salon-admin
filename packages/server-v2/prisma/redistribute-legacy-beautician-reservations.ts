import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const ACTIVE_STATUSES = new Set(['pending', 'confirmed', 'checked_in', 'in_progress', 'completed']);
const CANCELLED_STATUSES = new Set(['cancelled', 'canceled']);

type ReservationItem = {
  id: number;
  storeId: number;
  beauticianId: number | null;
  date: Date;
  startTime: string;
  endTime: string | null;
  status: string;
  project?: { duration: number | null } | null;
};

type BeauticianItem = {
  id: number;
  name: string;
  userId: number | null;
};

function getArg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length);
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function businessDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const year = parts.find((item) => item.type === 'year')?.value ?? '1970';
  const month = parts.find((item) => item.type === 'month')?.value ?? '01';
  const day = parts.find((item) => item.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

function dateKey(value: Date | string) {
  if (value instanceof Date) return businessDate(value);
  return String(value).slice(0, 10);
}

function businessDayStartUtc(dateText: string) {
  return new Date(`${dateText}T00:00:00+08:00`);
}

function toMinutes(time: string) {
  const [hour, minute] = String(time || '00:00').split(':').map((part) => Number(part));
  return hour * 60 + minute;
}

function addMinutes(time: string, minutes: number) {
  const total = toMinutes(time) + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function endTimeOf(reservation: ReservationItem) {
  return reservation.endTime || addMinutes(reservation.startTime, Number(reservation.project?.duration ?? 60));
}

function overlaps(left: ReservationItem, right: ReservationItem) {
  return dateKey(left.date) === dateKey(right.date)
    && toMinutes(left.startTime) < toMinutes(endTimeOf(right))
    && toMinutes(endTimeOf(left)) > toMinutes(right.startTime);
}

function shouldBlockConflict(reservation: ReservationItem) {
  const status = String(reservation.status || '').toLowerCase();
  return ACTIVE_STATUSES.has(status) && !CANCELLED_STATUSES.has(status);
}

async function main() {
  const apply = hasFlag('apply') && hasFlag('yes');
  const storeName = getArg('store-name') || 'Ami 全量演示门店';
  const today = getArg('from') || businessDate();
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    max: Number(process.env.DATABASE_POOL_MAX || 5),
    idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
    connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
  });
  const prisma = new PrismaClient({ adapter });

  try {
    const store = await prisma.store.findFirst({ where: { name: storeName }, select: { id: true, name: true } });
    if (!store) throw new Error(`Store not found: ${storeName}`);

    const beauticians = await prisma.beautician.findMany({
      where: { storeId: store.id, status: 'active' },
      select: { id: true, name: true, userId: true },
      orderBy: { id: 'asc' },
    });
    const realBeauticians = beauticians.filter((item) => item.userId);
    const legacyBeauticians = beauticians.filter((item) => !item.userId);
    if (!realBeauticians.length) throw new Error('No real beauticians with userId were found.');
    if (!legacyBeauticians.length) {
      console.log(JSON.stringify({ store, today, message: 'No legacy beauticians found.' }, null, 2));
      return;
    }

    const legacyIds = new Set(legacyBeauticians.map((item) => item.id));
    const futureReservations = await prisma.reservation.findMany({
      where: {
        storeId: store.id,
        date: { gte: businessDayStartUtc(today) },
      },
      select: {
        id: true,
        storeId: true,
        beauticianId: true,
        date: true,
        startTime: true,
        endTime: true,
        status: true,
        project: { select: { duration: true } },
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }, { id: 'asc' }],
    });

    const legacyReservations = futureReservations.filter((item) => item.beauticianId && legacyIds.has(item.beauticianId));
    const occupancy = new Map<number, ReservationItem[]>();
    const assignedCount = new Map<number, number>();
    const movedCount = new Map<number, number>();
    for (const real of realBeauticians) {
      occupancy.set(real.id, futureReservations.filter((item) => item.beauticianId === real.id && shouldBlockConflict(item)));
      assignedCount.set(real.id, occupancy.get(real.id)?.length ?? 0);
      movedCount.set(real.id, 0);
    }

    const assignments: Array<{ reservationId: number; fromBeauticianId: number; fromBeauticianName: string; toBeauticianId: number; toBeauticianName: string; date: string; startTime: string; endTime: string; status: string }> = [];
    const unresolved: Array<{ reservationId: number; fromBeauticianId: number; date: string; startTime: string; endTime: string; status: string }> = [];
    const byId = new Map<number, BeauticianItem>(beauticians.map((item) => [item.id, item]));

    for (const reservation of legacyReservations) {
      const candidates = [...realBeauticians].sort((left, right) => {
        const movedDelta = (movedCount.get(left.id) ?? 0) - (movedCount.get(right.id) ?? 0);
        if (movedDelta) return movedDelta;
        const assignedDelta = (assignedCount.get(left.id) ?? 0) - (assignedCount.get(right.id) ?? 0);
        if (assignedDelta) return assignedDelta;
        return left.id - right.id;
      });
      const target = shouldBlockConflict(reservation)
        ? candidates.find((beautician) => !(occupancy.get(beautician.id) ?? []).some((existing) => overlaps(existing, reservation)))
        : candidates[0];
      if (!target || !reservation.beauticianId) {
        unresolved.push({
          reservationId: reservation.id,
          fromBeauticianId: reservation.beauticianId ?? 0,
          date: dateKey(reservation.date),
          startTime: reservation.startTime,
          endTime: endTimeOf(reservation),
          status: reservation.status,
        });
        continue;
      }
      assignments.push({
        reservationId: reservation.id,
        fromBeauticianId: reservation.beauticianId,
        fromBeauticianName: byId.get(reservation.beauticianId)?.name ?? '',
        toBeauticianId: target.id,
        toBeauticianName: target.name,
        date: dateKey(reservation.date),
        startTime: reservation.startTime,
        endTime: endTimeOf(reservation),
        status: reservation.status,
      });
      movedCount.set(target.id, (movedCount.get(target.id) ?? 0) + 1);
      assignedCount.set(target.id, (assignedCount.get(target.id) ?? 0) + 1);
      if (shouldBlockConflict(reservation)) {
        occupancy.get(target.id)?.push({ ...reservation, beauticianId: target.id });
      }
    }

    if (apply) {
      await prisma.$transaction(
        assignments.map((assignment) =>
          prisma.reservation.update({
            where: { id: assignment.reservationId },
            data: { beauticianId: assignment.toBeauticianId },
          }),
        ),
      );
    }

    console.log(JSON.stringify({
      mode: apply ? 'apply' : 'dry-run',
      store,
      from: today,
      realBeauticians,
      legacyBeauticians,
      totalFutureReservations: futureReservations.length,
      legacyFutureReservations: legacyReservations.length,
      assignments: assignments.length,
      unresolved: unresolved.length,
      movedCountByBeautician: realBeauticians.map((item) => ({ id: item.id, name: item.name, moved: movedCount.get(item.id) ?? 0 })),
      sampleAssignments: assignments.slice(0, 30),
      unresolvedItems: unresolved,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
