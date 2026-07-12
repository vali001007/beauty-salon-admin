import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { BrainReleaseStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class BrainReleaseService {
  constructor(@Optional() private readonly prisma?: PrismaService) {}

  buildRollbackPlan(currentReleaseKey: string, previousReleaseKey: string) {
    return {
      currentReleaseKey,
      previousReleaseKey,
      steps: ['disable_current_release', 'enable_previous_release', 'record_release_log'],
    };
  }

  async createRelease(input: {
    releaseKey: string;
    scope: string;
    rollout: Record<string, unknown>;
    resourceVersionIds: number[];
    createdBy: number;
  }) {
    const prisma = this.requirePrisma();
    const releaseKey = this.nonEmpty(input.releaseKey, 'releaseKey');
    const versions = await prisma.brainResourceVersion.findMany({ where: { id: { in: input.resourceVersionIds } } });
    if (!versions.length || versions.length !== new Set(input.resourceVersionIds).size) {
      throw new BadRequestException('release_resource_versions_incomplete');
    }
    const duplicateKeys = new Set<string>();
    for (const version of versions) {
      const key = `${version.resourceType}:${version.resourceKey}`;
      if (duplicateKeys.has(key)) throw new BadRequestException(`duplicate_release_resource:${key}`);
      duplicateKeys.add(key);
    }
    const previous = await prisma.brainRelease.findFirst({ where: { status: 'active' }, orderBy: { activatedAt: 'desc' } });
    const versionMap = Object.fromEntries(versions.map((item) => [`${item.resourceType}:${item.resourceKey}`, item.version]));
    return prisma.$transaction(async (tx) => {
      const release = await tx.brainRelease.create({
        data: {
          releaseKey,
          scope: input.scope || 'global',
          rollout: this.toJson(input.rollout ?? {}),
          versionMap: this.toJson(versionMap),
          status: 'draft',
          previousReleaseId: previous?.id,
          createdBy: input.createdBy,
        },
      });
      await tx.brainReleaseItem.createMany({
        data: versions.map((version) => ({
          releaseId: release.id,
          resourceVersionId: version.id,
          resourceType: version.resourceType,
          resourceKey: version.resourceKey,
          version: version.version,
          snapshot: this.toJson(version.snapshot),
        })),
      });
      return release;
    });
  }

  async activateRelease(input: { releaseId: number; activatedBy: number }) {
    const prisma = this.requirePrisma();
    const release = await prisma.brainRelease.findUnique({
      where: { id: input.releaseId },
      include: { items: { include: { resourceVersion: true } } },
    });
    if (!release || release.status !== 'draft') throw new BadRequestException('release_not_draft');
    if (!release.items.length) throw new BadRequestException('release_has_no_resource_items');
    const evalRun = await prisma.brainEvalRun.findFirst({
      where: { releaseId: release.id, status: 'completed' },
      orderBy: { createdAt: 'desc' },
    });
    const summary = evalRun ? this.record(evalRun.summary) : {};
    if (!evalRun || summary.canRelease !== true || Number(summary.total ?? 0) <= 0) {
      throw new BadRequestException('release_eval_gate_failed');
    }
    await this.validateDependencies(release.items.map((item) => item.resourceVersion));

    return prisma.$transaction(async (tx) => {
      if (release.scope === 'global') {
        await tx.brainRelease.updateMany({ where: { status: 'active', id: { not: release.id } }, data: { status: 'archived' } });
      }
      for (const item of release.items) {
        await tx.brainResourceVersion.updateMany({
          where: { resourceType: item.resourceType, resourceKey: item.resourceKey, status: 'active' },
          data: { status: 'archived', archivedAt: new Date() },
        });
        await tx.brainResourceVersion.update({
          where: { id: item.resourceVersionId },
          data: { status: 'active', activatedAt: new Date(), archivedAt: null },
        });
        await this.activateSource(tx, item.resourceVersion);
      }
      return tx.brainRelease.update({
        where: { id: release.id },
        data: { status: 'active', activatedAt: new Date(), failureReason: null },
        include: { items: true },
      });
    });
  }

  async rollbackRelease(input: { releaseId: number; reason: string }) {
    const prisma = this.requirePrisma();
    const current = await prisma.brainRelease.findUnique({ where: { id: input.releaseId } });
    if (!current || current.status !== 'active') throw new BadRequestException('release_not_active');
    const previous = current.previousReleaseId
      ? await prisma.brainRelease.findUnique({ where: { id: current.previousReleaseId }, include: { items: { include: { resourceVersion: true } } } })
      : null;
    if (!previous) throw new BadRequestException('previous_release_not_found');
    return prisma.$transaction(async (tx) => {
      await tx.brainRelease.update({
        where: { id: current.id },
        data: { status: 'rolled_back', rolledBackAt: new Date(), failureReason: input.reason },
      });
      for (const item of previous.items) {
        await tx.brainResourceVersion.updateMany({
          where: {
            resourceType: item.resourceType,
            resourceKey: item.resourceKey,
            status: 'active',
            id: { not: item.resourceVersionId },
          },
          data: { status: 'archived', archivedAt: new Date() },
        });
        await tx.brainResourceVersion.update({
          where: { id: item.resourceVersionId },
          data: { status: 'active', activatedAt: new Date(), archivedAt: null },
        });
        await this.activateSource(tx, item.resourceVersion);
      }
      return tx.brainRelease.update({
        where: { id: previous.id },
        data: { status: 'active', activatedAt: new Date(), rolledBackAt: null, failureReason: null },
        include: { items: true },
      });
    });
  }

  listReleases() {
    return this.requirePrisma().brainRelease.findMany({
      orderBy: { createdAt: 'desc' },
      include: { items: true },
      take: 100,
    });
  }

  async selectRelease(input: { storeId: number; userId: number; roleKey: string }) {
    const releases = await this.requirePrisma().brainRelease.findMany({
      where: { status: 'active' },
      orderBy: { activatedAt: 'desc' },
      include: { items: true },
    });
    return releases.find((release) => this.matchesRollout(release.scope, this.record(release.rollout), input)) ?? null;
  }

  private async validateDependencies(versions: Array<{ resourceType: string; resourceKey: string; snapshot: Prisma.JsonValue }>) {
    const prisma = this.requirePrisma();
    const roles = await prisma.role.findMany({ where: { status: 'active' }, select: { permissions: true } });
    const registeredPermissions = new Set(roles.flatMap((role) => role.permissions).filter((permission) => permission !== '*'));
    const releaseSkillKeys = new Set(versions.filter((item) => item.resourceType === 'skill').map((item) => item.resourceKey));
    const activeSkills = await prisma.brainSkillRegistry.findMany({ where: { enabled: true }, select: { skillKey: true } });
    const availableSkills = new Set([...activeSkills.map((item) => item.skillKey), ...releaseSkillKeys]);
    for (const version of versions) {
      const snapshot = this.record(version.snapshot);
      const permissions = this.extractPermissions(snapshot);
      const unknownPermissions = permissions.filter((permission) => !registeredPermissions.has(permission));
      if (unknownPermissions.length) throw new BadRequestException(`release_unregistered_permissions:${unknownPermissions.join(',')}`);
      if (version.resourceType === 'agent_profile') {
        const skills = Array.isArray(snapshot.allowedSkills) ? snapshot.allowedSkills.filter((item): item is string => typeof item === 'string') : [];
        const missingSkills = skills.filter((skill) => !availableSkills.has(skill));
        if (missingSkills.length) throw new BadRequestException(`release_missing_skills:${missingSkills.join(',')}`);
      }
    }
  }

  private extractPermissions(snapshot: Record<string, unknown>) {
    const direct = Array.isArray(snapshot.permissions) ? snapshot.permissions.filter((item): item is string => typeof item === 'string') : [];
    const scope = this.record(snapshot.dataScopeRules as Prisma.JsonValue);
    const scoped = Array.isArray(scope.requiredPermissions) ? scope.requiredPermissions.filter((item): item is string => typeof item === 'string') : [];
    return [...new Set([...direct, ...scoped])];
  }

  private async activateSource(tx: Prisma.TransactionClient, version: { resourceType: string; resourceKey: string; sourceResourceId: number | null }) {
    if (!version.sourceResourceId) return;
    switch (version.resourceType) {
      case 'metric':
        await tx.brainMetric.updateMany({ where: { metricKey: version.resourceKey, status: 'active' }, data: { status: 'archived' } });
        await tx.brainMetric.update({ where: { id: version.sourceResourceId }, data: { status: 'active' } });
        break;
      case 'ontology_entity':
        await tx.brainOntologyEntity.updateMany({ where: { entityKey: version.resourceKey, status: 'active' }, data: { status: 'archived' } });
        await tx.brainOntologyEntity.update({ where: { id: version.sourceResourceId }, data: { status: 'active' } });
        break;
      case 'ontology_relation':
        await tx.brainOntologyRelation.updateMany({ where: { relationKey: version.resourceKey, status: 'active' }, data: { status: 'archived' } });
        await tx.brainOntologyRelation.update({ where: { id: version.sourceResourceId }, data: { status: 'active' } });
        break;
      case 'agent_profile':
        await tx.brainAgentProfile.updateMany({ where: { roleKey: version.resourceKey, enabled: true }, data: { enabled: false } });
        await tx.brainAgentProfile.update({ where: { id: version.sourceResourceId }, data: { enabled: true } });
        break;
      case 'skill':
        await tx.brainSkillRegistry.updateMany({ where: { skillKey: version.resourceKey, enabled: true }, data: { enabled: false } });
        await tx.brainSkillRegistry.update({ where: { id: version.sourceResourceId }, data: { enabled: true } });
        break;
      case 'inspection_rule':
        await tx.brainInspectionRule.updateMany({ where: { ruleKey: version.resourceKey, enabled: true }, data: { enabled: false } });
        await tx.brainInspectionRule.update({ where: { id: version.sourceResourceId }, data: { enabled: true } });
        break;
    }
  }

  private matchesRollout(scope: string, rollout: Record<string, unknown>, input: { storeId: number; userId: number; roleKey: string }) {
    if (scope === 'global') return true;
    const storeIds = Array.isArray(rollout.storeIds) ? rollout.storeIds.map(Number) : [];
    const roleKeys = Array.isArray(rollout.roleKeys) ? rollout.roleKeys.map(String) : [];
    if (scope === 'store') return storeIds.includes(input.storeId);
    if (scope === 'role') return roleKeys.includes(input.roleKey) && (!storeIds.length || storeIds.includes(input.storeId));
    if (scope === 'percentage') {
      const percentage = Math.max(0, Math.min(100, Number(rollout.userPercentage ?? 0)));
      return this.bucket(`${input.storeId}:${input.userId}:${input.roleKey}`) < percentage;
    }
    return false;
  }

  private bucket(value: string) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
    return hash % 100;
  }

  private requirePrisma() {
    if (!this.prisma) throw new Error('brain_release_prisma_unavailable');
    return this.prisma;
  }

  private nonEmpty(value: unknown, field: string) {
    if (typeof value !== 'string' || !value.trim()) throw new BadRequestException(`missing_release_field:${field}`);
    return value.trim();
  }

  private record(value: Prisma.JsonValue): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
