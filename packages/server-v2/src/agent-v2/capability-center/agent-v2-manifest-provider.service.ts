import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { listAgentV2CapabilityManifests } from '../capability/agent-v2-capability-manifest.js';
import type { AgentV2CapabilityManifest } from '../capability/agent-v2-capability.types.js';

export type AgentV2ManifestVersionSnapshot = {
  requestedVersion?: string | null;
  version: string | null;
  status?: string | null;
  source: 'active' | 'database' | 'builtin' | 'missing' | 'database_error' | 'fallback';
  found: boolean;
  itemCount: number;
  manifests: AgentV2CapabilityManifest[];
  reason?: string;
};

@Injectable()
export class AgentV2ManifestProviderService implements OnModuleInit {
  private readonly logger = new Logger(AgentV2ManifestProviderService.name);
  private readonly builtinManifests = listAgentV2CapabilityManifests();
  private manifests: AgentV2CapabilityManifest[] = [];
  private activeVersion: string | null = null;
  private activeSource: AgentV2ManifestVersionSnapshot['source'] = 'missing';
  private activeReason: string | undefined;
  private lastRefreshAt = 0;
  private refreshInFlight: Promise<void> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.refreshFromDatabase();
  }

  listManifests() {
    this.refreshIfStale();
    return this.manifests;
  }

  getActiveVersion() {
    return this.activeVersion;
  }

  getActiveSource() {
    return this.activeSource;
  }

  async listManifestsForVersion(versionName?: string | null): Promise<AgentV2ManifestVersionSnapshot> {
    const requestedVersion = String(versionName ?? '').trim();
    if (!requestedVersion || requestedVersion === 'active' || requestedVersion === this.activeVersion) {
      return {
        requestedVersion: requestedVersion || 'active',
        version: this.activeVersion,
        status: this.activeVersion ? 'active' : this.activeSource,
        source: this.activeVersion ? 'active' : this.activeSource,
        found: Boolean(this.activeVersion),
        itemCount: this.manifests.length,
        manifests: this.manifests,
        reason: this.activeReason,
      };
    }

    if (requestedVersion === 'builtin' || requestedVersion === 'static') {
      return {
        requestedVersion,
        version: 'builtin',
        status: 'builtin',
        source: 'builtin',
        found: true,
        itemCount: this.builtinManifests.length,
        manifests: this.builtinManifests,
      };
    }

    try {
      const version = await this.prisma.agentCapabilityManifestVersion.findUnique({
        where: { version: requestedVersion },
        include: { items: { where: { status: 'enabled' } } },
      });
      if (!version) {
        return {
          requestedVersion,
          version: requestedVersion,
          status: null,
          source: 'missing',
          found: false,
          itemCount: 0,
          manifests: [],
          reason: 'Manifest 版本不存在。',
        };
      }

      const dbManifests = version.items
        .map((item) => this.parseManifest(item.manifestJson))
        .filter((item): item is AgentV2CapabilityManifest => Boolean(item))
        .map((manifest) => ({ ...manifest, version: version.version }));
      return {
        requestedVersion,
        version: version.version,
        status: version.status,
        source: 'database',
        found: true,
        itemCount: dbManifests.length,
        manifests: dbManifests,
      };
    } catch (error) {
      this.logger.warn(`Agent V2 指定 Manifest 版本加载失败：${error instanceof Error ? error.message : String(error)}`);
      return {
        requestedVersion,
        version: this.activeVersion,
        status: this.activeVersion ? 'active' : 'database_error',
        source: this.activeVersion ? 'fallback' : 'database_error',
        found: false,
        itemCount: this.manifests.length,
        manifests: this.manifests,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async refreshFromDatabase() {
    const previousVersion = this.activeVersion;
    const previousManifests = this.manifests;
    this.lastRefreshAt = Date.now();
    try {
      const version = await this.prisma.agentCapabilityManifestVersion.findFirst({
        where: { status: 'active' },
        orderBy: { publishedAt: 'desc' },
        include: { items: { where: { status: 'enabled' } } },
      });

      if (!version) {
        this.activeVersion = null;
        this.activeSource = 'missing';
        this.activeReason = '缺少 active DB Manifest。';
        this.manifests = [];
        return;
      }

      const dbManifests = version.items
        .map((item) => this.parseManifest(item.manifestJson))
        .filter((item): item is AgentV2CapabilityManifest => Boolean(item));
      this.activeVersion = version.version;
      this.activeSource = 'active';
      this.activeReason = undefined;
      this.manifests = dbManifests;
    } catch (error) {
      if (previousVersion) {
        this.logger.warn(`Agent V2 DB Manifest 刷新失败，继续使用上一版 active Manifest：${error instanceof Error ? error.message : String(error)}`);
        this.activeVersion = previousVersion;
        this.manifests = previousManifests;
        this.activeSource = 'fallback';
        this.activeReason = error instanceof Error ? error.message : String(error);
        return;
      }
      this.logger.warn(`Agent V2 DB Manifest 加载失败，Runtime 将保持空 Manifest：${error instanceof Error ? error.message : String(error)}`);
      this.activeVersion = null;
      this.activeSource = 'database_error';
      this.activeReason = error instanceof Error ? error.message : String(error);
      this.manifests = [];
    }
  }

  private refreshIfStale() {
    const ttlMs = this.refreshTtlMs();
    if (ttlMs <= 0) return;
    if (Date.now() - this.lastRefreshAt < ttlMs) return;
    if (this.refreshInFlight) return;
    this.refreshInFlight = this.refreshFromDatabase().finally(() => {
      this.refreshInFlight = null;
    });
  }

  private refreshTtlMs() {
    const raw = Number(process.env.AGENT_V2_MANIFEST_REFRESH_TTL_MS ?? 30_000);
    if (!Number.isFinite(raw)) return 30_000;
    return Math.max(0, Math.floor(raw));
  }

  private parseManifest(value: unknown): AgentV2CapabilityManifest | null {
    if (!value || typeof value !== 'object') return null;
    const manifest = value as AgentV2CapabilityManifest;
    if (!manifest.capabilityId || !manifest.executor?.tool) return null;
    return manifest;
  }
}
