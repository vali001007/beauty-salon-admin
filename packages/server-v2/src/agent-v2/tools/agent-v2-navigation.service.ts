import { Injectable, Optional } from '@nestjs/common';
import type { AgentEvidence, AgentToolExecutionContext, AgentToolResult } from '../../agent/agent.types.js';
import { listAgentV2CapabilityManifests } from '../capability/agent-v2-capability-manifest.js';
import type { AgentV2CapabilityManifest } from '../capability/agent-v2-capability.types.js';
import { AgentV2ManifestProviderService } from '../capability-center/agent-v2-manifest-provider.service.js';

type NavigationTarget = {
  capabilityId: string;
  queryKey?: string;
  displayName: string;
  sourceApis: string[];
  sourceModels: string[];
  permissionCodes: string[];
  boundaryNotes: string[];
  riskLevel: AgentV2CapabilityManifest['riskLevel'];
};

@Injectable()
export class AgentV2NavigationService {
  constructor(@Optional() private readonly manifestProvider?: AgentV2ManifestProviderService) {}

  private get targets() {
    return this.buildTargets();
  }

  async execute(args: Record<string, unknown>, _context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const capabilityId = String(args.capabilityId ?? '');
    const queryKey = String(args.queryKey ?? '');
    const target = this.resolveTarget(capabilityId, queryKey);
    if (target) return this.openTarget(target);

    return {
      status: 'unsupported',
      title: '暂不支持的导航动作',
      summary: `V2 导航工具暂未支持 ${capabilityId || 'unknown'}。`,
      data: { capabilityId },
      evidence: this.evidence('未找到对应导航能力。'),
      actions: [],
    };
  }

  private buildTargets(): NavigationTarget[] {
    return this.activeManifests()
      .filter((manifest) => manifest.status === 'enabled' && manifest.executor.tool === 'navigation.open')
      .map((manifest) => ({
        capabilityId: manifest.capabilityId,
        queryKey: manifest.executor.queryKey,
        displayName: manifest.displayName,
        sourceApis: manifest.sourceApis ?? [],
        sourceModels: manifest.sourceModels,
        permissionCodes: manifest.permissionCodes,
        boundaryNotes: manifest.boundaryNotes,
        riskLevel: manifest.riskLevel,
      }));
  }

  private activeManifests() {
    return this.manifestProvider?.listManifests() ?? listAgentV2CapabilityManifests();
  }

  private resolveTarget(capabilityId: string, queryKey: string) {
    const candidates = [capabilityId, queryKey].map((value) => value.trim()).filter(Boolean);
    return this.targets.find((target) => candidates.includes(target.capabilityId) || (target.queryKey && candidates.includes(target.queryKey))) ?? null;
  }

  private openTarget(target: NavigationTarget): AgentToolResult {
    const terminalActionCommand = target.sourceApis.find((sourceApi) => sourceApi.startsWith('operation.'));
    const adminRoute = target.sourceApis.find((sourceApi) => sourceApi.startsWith('/'));
    const action = terminalActionCommand
      ? `navigation:${terminalActionCommand}`
      : adminRoute
        ? `navigation:${adminRoute}`
        : `navigation:${target.queryKey ?? target.capabilityId}`;
    const data: Record<string, unknown> = {
      capabilityId: target.capabilityId,
      queryKey: target.queryKey,
      target: this.targetLabel(target),
      launchMode: this.launchMode(terminalActionCommand, adminRoute),
      writeScope: 'none',
      sourceApis: target.sourceApis,
      permissionCodes: target.permissionCodes,
    };
    if (terminalActionCommand) {
      data.terminalActionCommand = terminalActionCommand;
      data.actionCommand = terminalActionCommand;
    }
    if (adminRoute) data.adminRoute = adminRoute;

    return {
      status: 'success',
      title: target.displayName,
      summary: `已准备${target.displayName}；这里只生成导航动作，不执行写入。`,
      data,
      evidence: this.evidence(target),
      actions: [{ label: this.actionLabel(target), action, riskLevel: target.riskLevel }],
    };
  }

  private launchMode(terminalActionCommand?: string, adminRoute?: string) {
    if (terminalActionCommand && adminRoute) return 'terminal_or_admin_route';
    if (terminalActionCommand) return 'terminal_micro_app';
    if (adminRoute) return 'admin_route';
    return 'navigation_action';
  }

  private targetLabel(target: NavigationTarget) {
    if (target.capabilityId === 'navigation.cashier.open') return 'Ami Aura Lite 收银';
    if (target.capabilityId === 'navigation.card-usage.open') return '次卡核销';
    return target.displayName.replace(/^打开/, '') || target.displayName;
  }

  private actionLabel(target: NavigationTarget) {
    if (target.capabilityId === 'navigation.card-usage.open') return '打开核销界面';
    return target.displayName;
  }

  private evidence(targetOrDefinition: NavigationTarget | string): AgentEvidence {
    const target = typeof targetOrDefinition === 'string' ? null : targetOrDefinition;
    const metricDefinition = target
      ? `${target.displayName} = ${target.sourceApis.length ? target.sourceApis.join(' / ') : target.capabilityId}；只返回导航动作，不执行写入。`
      : String(targetOrDefinition);

    return {
      source: ['AgentV2CapabilityManifest', ...(target?.sourceModels ?? ['AmiAuraLiteCommandRegistry', 'AdminRoutes'])],
      sourceTables: ['AgentV2CapabilityManifest'],
      metricDefinition,
      filters: ['releaseStrategy=auto_publish', 'writeScope=none', ...(target?.permissionCodes.map((code) => `permission=${code}`) ?? [])],
      sampleSize: 1,
      limitations: ['导航动作只负责打开页面或终端入口，不直接写入业务数据。', ...(target?.boundaryNotes ?? [])],
    };
  }
}
