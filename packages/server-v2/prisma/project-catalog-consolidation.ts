import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

type RefCounts = {
  bom: number;
  reservation: number;
  serviceTask: number;
  beauticianSkill: number;
  cardUsage: number;
  gapCandidate: number;
  orderItem: number;
  total: number;
};

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const confirmed = args.has('--yes');

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

function toNumber(value: unknown) {
  return Number(value ?? 0) || 0;
}

function archivalProjectName(name: string, suffix: string, projectId: number) {
  const base = String(name || `Project ${projectId}`).trim();
  return `${base} ${suffix} ${projectId}`.slice(0, 180);
}

async function getRefCounts(projectId: number): Promise<RefCounts> {
  const [bom, reservation, serviceTask, beauticianSkill, cardUsage, gapCandidate, orderItem] = await Promise.all([
    prisma.projectBomItem.count({ where: { projectId } }),
    prisma.reservation.count({ where: { projectId } }),
    prisma.serviceTask.count({ where: { projectId } }),
    prisma.beauticianProjectSkill.count({ where: { projectId } }),
    prisma.cardUsageRecord.count({ where: { projectId } }),
    prisma.appointmentGapCandidate.count({ where: { projectId } }).catch(() => 0),
    prisma.orderItem.count({ where: { itemType: 'project', itemId: projectId } }).catch(() => 0),
  ]);
  return {
    bom,
    reservation,
    serviceTask,
    beauticianSkill,
    cardUsage,
    gapCandidate,
    orderItem,
    total: bom + reservation + serviceTask + beauticianSkill + cardUsage + gapCandidate + orderItem,
  };
}

async function updateBeauticianSkillRefs(tx: any, fromProjectId: number, toProjectId: number) {
  const rows = await tx.beauticianProjectSkill.findMany({ where: { projectId: fromProjectId } });
  let updated = 0;
  let deleted = 0;
  for (const row of rows) {
    const existing = await tx.beauticianProjectSkill.findUnique({
      where: { beauticianId_projectId: { beauticianId: row.beauticianId, projectId: toProjectId } },
    });
    if (existing) {
      await tx.beauticianProjectSkill.delete({ where: { id: row.id } });
      deleted += 1;
    } else {
      await tx.beauticianProjectSkill.update({ where: { id: row.id }, data: { projectId: toProjectId } });
      updated += 1;
    }
  }
  return { updated, deleted };
}

async function mergeDuplicateProjects(groups: Array<{ storeId: number; key: string; ids: number[] }>) {
  const actions = [];
  for (const group of groups) {
    const projects = await prisma.project.findMany({
      where: { id: { in: group.ids } },
      include: { type: true, store: true },
    });
    const rows = [];
    for (const project of projects) {
      rows.push({ project, refs: await getRefCounts(project.id) });
    }
    rows.sort((a, b) => {
      if (b.refs.total !== a.refs.total) return b.refs.total - a.refs.total;
      if (toNumber(b.project.price) !== toNumber(a.project.price)) return toNumber(b.project.price) - toNumber(a.project.price);
      return a.project.id - b.project.id;
    });
    const keeper = rows[0];
    const losers = rows.slice(1);
    for (const loser of losers) {
      actions.push({
        kind: 'merge_duplicate',
        key: group.key,
        storeId: group.storeId,
        keepProjectId: keeper.project.id,
        keepName: keeper.project.name,
        removeProjectId: loser.project.id,
        removeName: loser.project.name,
        removePrice: toNumber(loser.project.price),
        refs: loser.refs,
      });
      if (!apply) continue;
      await prisma.$transaction(async (tx) => {
        await tx.projectBomItem.updateMany({ where: { projectId: loser.project.id }, data: { projectId: keeper.project.id } });
        await tx.reservation.updateMany({ where: { projectId: loser.project.id }, data: { projectId: keeper.project.id } });
        await tx.serviceTask.updateMany({ where: { projectId: loser.project.id }, data: { projectId: keeper.project.id } });
        await tx.cardUsageRecord.updateMany({ where: { projectId: loser.project.id }, data: { projectId: keeper.project.id } });
        await tx.appointmentGapCandidate.updateMany({ where: { projectId: loser.project.id }, data: { projectId: keeper.project.id } });
        await tx.orderItem.updateMany({ where: { itemType: 'project', itemId: loser.project.id }, data: { itemId: keeper.project.id } });
        await updateBeauticianSkillRefs(tx, loser.project.id, keeper.project.id);
        await tx.project.update({
          where: { id: keeper.project.id },
          data: {
            recommend: Boolean(keeper.project.recommend || loser.project.recommend),
            online: Boolean(keeper.project.online || loser.project.online),
            home: Boolean(keeper.project.home || loser.project.home),
            duration: Math.max(toNumber(keeper.project.duration), toNumber(loser.project.duration)),
            sort: Math.min(toNumber(keeper.project.sort), toNumber(loser.project.sort)),
          },
        });
        await tx.project.update({
          where: { id: loser.project.id },
          data: {
            status: 'inactive',
            deletedAt: new Date(),
            name: archivalProjectName(loser.project.name, 'MERGED', loser.project.id),
            description: `已归并至项目 #${keeper.project.id}（${keeper.project.name}）`,
            online: false,
            recommend: false,
            home: false,
          },
        });
      });
    }
  }
  return actions;
}

async function archiveUnpricedProjects() {
  const projects = await prisma.project.findMany({
    where: {
      deletedAt: null,
      status: 'active',
      price: 0,
    },
    include: { type: true, store: true },
    orderBy: [{ storeId: 'asc' }, { id: 'asc' }],
  });
  const actions = [];
  const retained = [];
  for (const project of projects) {
    const refs = await getRefCounts(project.id);
    if (refs.total > 0) {
      retained.push({
        id: project.id,
        name: project.name,
        type: project.type?.name,
        refs,
        reason: '已被预约/服务/订单/BOM/次卡核销引用，保留为历史项目档案；项目订单选择器已剔除无售价项目',
      });
      continue;
    }
    actions.push({
      kind: 'archive_unpriced',
      projectId: project.id,
      name: project.name,
      type: project.type?.name,
      refs,
    });
    if (!apply) continue;
    await prisma.project.update({
      where: { id: project.id },
      data: {
        status: 'inactive',
        deletedAt: new Date(),
        name: archivalProjectName(project.name, 'NO-PRICE', project.id),
        description: '无售价且无业务引用，已从项目目录归档',
        online: false,
        recommend: false,
        home: false,
      },
    });
  }
  return { actions, retained };
}

async function main() {
  if (apply && !confirmed) {
    throw new Error('真实写库需要同时传入 --apply --yes');
  }

  const duplicateGroups = await prisma.$queryRaw<Array<{ storeId: number; key: string; ids: number[] }>>`
    select "storeId", lower(trim(name)) as key, array_agg(id order by id) as ids
    from "Project"
    where "deletedAt" is null
      and status = 'active'
      and price > 0
    group by "storeId", lower(trim(name)), price
    having count(*) > 1
    order by "storeId", key
  `;

  const duplicateActions = await mergeDuplicateProjects(duplicateGroups);
  const unpriced = await archiveUnpricedProjects();
  const activeProjectCount = await prisma.project.count({ where: { deletedAt: null, status: 'active' } });

  const result = {
    mode: apply ? 'apply' : 'dry-run',
    activeProjectCount,
    duplicateGroupCount: duplicateGroups.length,
    duplicateActions,
    archivedUnpricedCount: unpriced.actions.length,
    archivedUnpricedActions: unpriced.actions,
    retainedUnpricedCount: unpriced.retained.length,
    retainedUnpriced: unpriced.retained,
  };
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
