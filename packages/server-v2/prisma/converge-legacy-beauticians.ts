import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

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

async function main() {
  const apply = hasFlag('apply') && hasFlag('yes');
  const storeName = getArg('store-name') || 'Ami 全量演示门店';
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
      where: { storeId: store.id },
      select: { id: true, name: true, userId: true, status: true },
      orderBy: { id: 'asc' },
    });
    const realBeauticians = beauticians.filter((item) => item.userId && item.status === 'active');
    const legacyBeauticians = beauticians.filter((item) => !item.userId && item.status === 'active');
    if (!realBeauticians.length) throw new Error('No active real beauticians with userId were found.');
    if (!legacyBeauticians.length) {
      console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', store, message: 'No active legacy beauticians found.' }, null, 2));
      return;
    }

    const legacyIds = legacyBeauticians.map((item) => item.id);
    const activeServiceTasks = await prisma.serviceTask.findMany({
      where: { storeId: store.id, beauticianId: { in: legacyIds }, status: { in: ['pending', 'in_progress'] } },
      select: { id: true, beauticianId: true, appointmentTime: true, status: true, taskNo: true },
      orderBy: [{ appointmentTime: 'asc' }, { id: 'asc' }],
    });
    const pendingFollowUpTasks = await prisma.terminalFollowUpTask.findMany({
      where: { storeId: store.id, assigneeBeauticianId: { in: legacyIds }, status: 'pending', deletedAt: null },
      select: { id: true, assigneeBeauticianId: true, assigneeUserId: true, status: true, title: true, dueAt: true },
      orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
    });

    const movedCount = new Map<number, number>(realBeauticians.map((item) => [item.id, 0]));
    const byId = new Map<number, BeauticianItem>(beauticians.map((item) => [item.id, item]));
    const pickTarget = () => {
      const target = [...realBeauticians].sort((left, right) => {
        const movedDelta = (movedCount.get(left.id) ?? 0) - (movedCount.get(right.id) ?? 0);
        if (movedDelta) return movedDelta;
        return left.id - right.id;
      })[0];
      if (!target) throw new Error('No target beautician found.');
      movedCount.set(target.id, (movedCount.get(target.id) ?? 0) + 1);
      return target;
    };

    const serviceTaskAssignments = activeServiceTasks.map((task) => {
      const target = pickTarget();
      return {
        taskId: task.id,
        taskNo: task.taskNo,
        fromBeauticianId: task.beauticianId,
        fromBeauticianName: task.beauticianId ? byId.get(task.beauticianId)?.name : undefined,
        toBeauticianId: target.id,
        toBeauticianName: target.name,
        status: task.status,
        appointmentTime: task.appointmentTime,
      };
    });

    const followUpAssignments = pendingFollowUpTasks.map((task) => {
      const target = pickTarget();
      return {
        taskId: task.id,
        title: task.title,
        fromBeauticianId: task.assigneeBeauticianId,
        fromBeauticianName: task.assigneeBeauticianId ? byId.get(task.assigneeBeauticianId)?.name : undefined,
        toBeauticianId: target.id,
        toBeauticianName: target.name,
        toUserId: target.userId,
        status: task.status,
        dueAt: task.dueAt,
      };
    });

    if (apply) {
      const operations = [];
      for (const target of realBeauticians) {
        const serviceTaskIds = serviceTaskAssignments.filter((assignment) => assignment.toBeauticianId === target.id).map((assignment) => assignment.taskId);
        if (serviceTaskIds.length) {
          operations.push(prisma.serviceTask.updateMany({
            where: { id: { in: serviceTaskIds }, storeId: store.id },
            data: { beauticianId: target.id },
          }));
        }
        const followUpTaskIds = followUpAssignments.filter((assignment) => assignment.toBeauticianId === target.id).map((assignment) => assignment.taskId);
        if (followUpTaskIds.length) {
          operations.push(prisma.terminalFollowUpTask.updateMany({
            where: { id: { in: followUpTaskIds }, storeId: store.id },
            data: {
              assigneeBeauticianId: target.id,
              assigneeUserId: target.userId ?? null,
            },
          }));
        }
      }
      operations.push(prisma.beautician.updateMany({
        where: { id: { in: legacyIds }, storeId: store.id },
        data: { status: 'inactive' },
      }));
      await prisma.$transaction(operations, { timeout: 30_000 });
    }

    console.log(JSON.stringify({
      mode: apply ? 'apply' : 'dry-run',
      store,
      realBeauticians,
      legacyBeauticians,
      activeServiceTasks: activeServiceTasks.length,
      pendingFollowUpTasks: pendingFollowUpTasks.length,
      statusUpdates: legacyIds.length,
      movedCountByBeautician: realBeauticians.map((item) => ({ id: item.id, name: item.name, moved: movedCount.get(item.id) ?? 0 })),
      sampleServiceTaskAssignments: serviceTaskAssignments.slice(0, 20),
      sampleFollowUpAssignments: followUpAssignments.slice(0, 20),
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
