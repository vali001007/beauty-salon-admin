import { Injectable } from '@nestjs/common';
import type { AgentEvidence, AgentToolExecutionContext, AgentToolResult } from '../../agent/agent.types.js';

@Injectable()
export class AgentV2NavigationService {
  async execute(args: Record<string, unknown>, _context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const capabilityId = String(args.capabilityId ?? '');
    if (capabilityId === 'navigation.cashier.open') return this.openCashier();
    if (capabilityId === 'navigation.card-usage.open') return this.openCardUsage();
    return {
      status: 'unsupported',
      title: '暂不支持的导航动作',
      summary: `V2 导航工具暂未支持 ${capabilityId || 'unknown'}。`,
      data: { capabilityId },
      evidence: this.evidence('未找到对应导航能力。'),
      actions: [],
    };
  }

  private openCashier(): AgentToolResult {
    return {
      status: 'success',
      title: '打开收银界面',
      summary: '已准备打开 Ami Aura Lite 收银界面；这里只生成导航动作，不执行收款。',
      data: {
        target: 'Ami Aura Lite 收银',
        actionCommand: 'operation.cashier',
        launchMode: 'terminal_micro_app',
        writeScope: 'none',
      },
      evidence: this.evidence('收银导航 = 打开终端收银入口；不创建订单、不收款、不修改库存。'),
      actions: [{ label: '打开收银界面', action: 'navigation:operation.cashier', riskLevel: 'low' }],
    };
  }

  private openCardUsage(): AgentToolResult {
    return {
      status: 'success',
      title: '打开次卡核销界面',
      summary: '已准备打开次卡核销入口；这里只生成导航动作，不执行核销。',
      data: {
        target: '次卡核销',
        terminalActionCommand: 'operation.verify',
        adminRoute: '/orders/card-usage',
        launchMode: 'terminal_or_admin_route',
        writeScope: 'none',
      },
      evidence: this.evidence('核销导航 = 打开终端或管理端次卡核销入口；不扣减次数、不生成消耗记录。'),
      actions: [{ label: '打开核销界面', action: 'navigation:operation.verify', riskLevel: 'low' }],
    };
  }

  private evidence(metricDefinition: string): AgentEvidence {
    return {
      source: ['AgentV2CapabilityManifest', 'AmiAuraLiteCommandRegistry', 'AdminRoutes'],
      sourceTables: ['AgentV2CapabilityManifest'],
      metricDefinition,
      filters: ['releaseStrategy=auto_publish', 'writeScope=none'],
      sampleSize: 1,
      limitations: ['导航动作只负责打开页面或终端入口，不直接写入业务数据。'],
    };
  }
}
