import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { listAgentV2CapabilityManifests } from '../capability/agent-v2-capability-manifest.js';
import type { AgentV2CapabilityManifest } from '../capability/agent-v2-capability.types.js';

@Injectable()
export class AgentV2ManifestProviderService implements OnModuleInit {
  private readonly logger = new Logger(AgentV2ManifestProviderService.name);
  private readonly builtinManifests = listAgentV2CapabilityManifests();
  private manifests = this.builtinManifests;
  private activeVersion: string | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.refreshFromDatabase();
  }

  listManifests() {
    return this.manifests;
  }

  getActiveVersion() {
    return this.activeVersion;
  }

  async refreshFromDatabase() {
    try {
      const version = await this.prisma.agentCapabilityManifestVersion.findFirst({
        where: { status: 'active' },
        orderBy: { publishedAt: 'desc' },
        include: { items: { where: { status: 'enabled' } } },
      });

      if (!version) {
        this.activeVersion = null;
        this.manifests = this.builtinManifests;
        return;
      }

      const dbManifests = version.items
        .map((item) => this.parseManifest(item.manifestJson))
        .filter((item): item is AgentV2CapabilityManifest => Boolean(item));
      const merged = new Map<string, AgentV2CapabilityManifest>();
      for (const manifest of this.builtinManifests) merged.set(manifest.capabilityId, manifest);
      for (const manifest of dbManifests) merged.set(manifest.capabilityId, manifest);

      this.activeVersion = version.version;
      this.manifests = Array.from(merged.values());
    } catch (error) {
      this.logger.warn(`Agent V2 DB Manifest 加载失败，已回退内置能力：${error instanceof Error ? error.message : String(error)}`);
      this.activeVersion = null;
      this.manifests = this.builtinManifests;
    }
  }

  private parseManifest(value: unknown): AgentV2CapabilityManifest | null {
    if (!value || typeof value !== 'object') return null;
    const manifest = value as AgentV2CapabilityManifest;
    if (!manifest.capabilityId || !manifest.executor?.tool) return null;
    return manifest;
  }
}
