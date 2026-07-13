import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AgentV3SemanticRouterService } from './agent-v3-semantic-router.service.js';
import type { AgentV3TextToSqlRequest } from './agent-v3-text-to-sql.types.js';

@Injectable()
export class AgentV3SemanticRouterAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly router: AgentV3SemanticRouterService,
  ) {}

  async inspect(input: Pick<AgentV3TextToSqlRequest, 'question' | 'permissions' | 'roleCodes'>) {
    const active = await this.getActiveSnapshotSafe();
    return {
      route: this.router.route(input),
      activeSnapshot: active ? this.snapshotSummary(active) : null,
    };
  }

  async listSnapshots(input: { page?: number; pageSize?: number; status?: string }) {
    const page = Math.max(1, Number(input.page) || 1);
    const pageSize = Math.min(Math.max(1, Number(input.pageSize) || 20), 100);
    const where = {
      ...(input.status ? { status: input.status } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.agentV3SemanticKgSnapshot.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.agentV3SemanticKgSnapshot.count({ where }),
    ]);
    return {
      items: items.map((item) => this.snapshotSummary(item)),
      total,
      page,
      pageSize,
    };
  }

  async getActiveSnapshot() {
    const active = await this.getActiveSnapshotSafe();
    return active ? this.snapshotSummary(active) : null;
  }

  async generateSnapshot(input: { createdBy?: number; generatedFromVersion?: string }) {
    const snapshot = this.router.exportLocalSnapshot();
    const version = `${snapshot.version}-${Date.now()}`;
    const created = await this.prisma.agentV3SemanticKgSnapshot.create({
      data: {
        version,
        source: snapshot.source,
        status: 'draft',
        snapshotJson: this.json(snapshot),
        statsJson: this.json(snapshot.stats),
        generatedFromVersion: input.generatedFromVersion,
        createdBy: input.createdBy,
      },
    });
    return this.snapshotSummary(created);
  }

  async generateSnapshotFromAgentV2(input: { createdBy?: number }) {
    const [{ AGENT_V2_KNOWLEDGE_GRAPH_SCHEMA_HASH, AGENT_V2_KNOWLEDGE_GRAPH_SNAPSHOT }, localSnapshot] = await Promise.all([
      import('../../agent-v2/knowledge-graph/generated/knowledge-graph.generated.js'),
      Promise.resolve(this.router.exportLocalSnapshot()),
    ]);
    const businessObjects = AGENT_V2_KNOWLEDGE_GRAPH_SNAPSHOT.nodes
      .filter((node) => node.type === 'BusinessObject')
      .map((node) => ({
        id: node.id,
        name: node.name,
        displayName: node.displayName,
        aliases: Array.isArray(node.properties?.aliases) ? node.properties.aliases : [],
        queryableFields: Array.isArray(node.properties?.queryableFields) ? node.properties.queryableFields : [],
        evidenceSourceModels: Array.isArray(node.properties?.evidenceSourceModels) ? node.properties.evidenceSourceModels : [],
      }));
    const snapshot = {
      ...localSnapshot,
      version: `v3-kg-from-v2-${AGENT_V2_KNOWLEDGE_GRAPH_SCHEMA_HASH.slice(0, 12)}-${new Date().toISOString().slice(0, 10)}`,
      source: 'agent_v2_kg_migration',
      migrationReference: {
        agentV2SchemaHash: AGENT_V2_KNOWLEDGE_GRAPH_SCHEMA_HASH,
        agentV2GeneratedAt: AGENT_V2_KNOWLEDGE_GRAPH_SNAPSHOT.generatedAt,
        businessObjectCount: businessObjects.length,
        sampledBusinessObjects: businessObjects,
        note: 'V3 仅把 Agent V2 KG 作为离线迁移参考；运行时语义路由使用 V3 QueryIntent、V3 snapshot 和 V3 semantic views。',
      },
      stats: {
        ...localSnapshot.stats,
        v2BusinessObjectCount: businessObjects.length,
        v2NodeCount: AGENT_V2_KNOWLEDGE_GRAPH_SNAPSHOT.summary.nodeCount,
        v2EdgeCount: AGENT_V2_KNOWLEDGE_GRAPH_SNAPSHOT.summary.edgeCount,
      },
    };
    const created = await this.prisma.agentV3SemanticKgSnapshot.create({
      data: {
        version: `${snapshot.version}-${Date.now()}`,
        source: snapshot.source,
        status: 'draft',
        snapshotJson: this.json(snapshot),
        statsJson: this.json(snapshot.stats),
        generatedFromVersion: AGENT_V2_KNOWLEDGE_GRAPH_SCHEMA_HASH,
        createdBy: input.createdBy,
      },
    });
    return this.snapshotSummary(created);
  }

  async activateSnapshot(input: { id: number; activatedBy?: number }) {
    const target = await this.prisma.agentV3SemanticKgSnapshot.findUnique({ where: { id: input.id } });
    if (!target) {
      return { status: 'not_found' as const, message: 'V3 KG snapshot 不存在。' };
    }
    const activatedAt = new Date();
    await this.prisma.$transaction([
      this.prisma.agentV3SemanticKgSnapshot.updateMany({
        where: { status: 'active' },
        data: { status: 'archived' },
      }),
      this.prisma.agentV3SemanticKgSnapshot.update({
        where: { id: input.id },
        data: {
          status: 'active',
          activatedAt,
          createdBy: target.createdBy ?? input.activatedBy,
        },
      }),
    ]);
    const active = await this.prisma.agentV3SemanticKgSnapshot.findUnique({ where: { id: input.id } });
    return {
      status: 'active' as const,
      snapshot: active ? this.snapshotSummary(active) : null,
    };
  }

  async createFeedback(input: {
    question: string;
    permissions: string[];
    roleCodes: string[];
    createdBy?: number;
    expectedView?: string;
    feedbackText?: string;
    isWrongAnswer?: boolean;
  }) {
    const route = this.router.route(input);
    const created = await this.prisma.agentV3SemanticRoutingFeedback.create({
      data: {
        question: input.question,
        routeIntentJson: this.json(route),
        selectedView: route.selectedView,
        expectedView: input.expectedView,
        feedbackText: input.feedbackText,
        isWrongAnswer: input.isWrongAnswer ?? true,
        status: 'open',
        createdBy: input.createdBy,
      },
    });
    return created;
  }

  async listFeedback(input: { page?: number; pageSize?: number; status?: string; isWrongAnswer?: boolean }) {
    const page = Math.max(1, Number(input.page) || 1);
    const pageSize = Math.min(Math.max(1, Number(input.pageSize) || 20), 100);
    const where = {
      ...(input.status ? { status: input.status } : {}),
      ...(typeof input.isWrongAnswer === 'boolean' ? { isWrongAnswer: input.isWrongAnswer } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.agentV3SemanticRoutingFeedback.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.agentV3SemanticRoutingFeedback.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async resolveFeedback(input: { id: number; resolvedBy?: number }) {
    return this.prisma.agentV3SemanticRoutingFeedback.update({
      where: { id: input.id },
      data: {
        status: 'resolved',
        resolvedBy: input.resolvedBy,
        resolvedAt: new Date(),
      },
    });
  }

  private getActiveSnapshotSafe() {
    return this.prisma.agentV3SemanticKgSnapshot.findFirst({
      where: { status: 'active' },
      orderBy: { activatedAt: 'desc' },
    });
  }

  private snapshotSummary(snapshot: {
    id: number;
    version: string;
    source: string;
    status: string;
    statsJson: Prisma.JsonValue | null;
    generatedFromVersion: string | null;
    activatedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: snapshot.id,
      version: snapshot.version,
      source: snapshot.source,
      status: snapshot.status,
      stats: snapshot.statsJson,
      generatedFromVersion: snapshot.generatedFromVersion,
      activatedAt: snapshot.activatedAt,
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
    };
  }

  private json(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
  }
}
