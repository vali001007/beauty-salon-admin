import { Injectable } from '@nestjs/common';
import type { AgentV5ConstraintResult, AgentV5RouteDecision } from '../agent-v5.types.js';

@Injectable()
export class AgentV5ConstraintGuardService {
  inspect(route: AgentV5RouteDecision, actions: Array<{ action?: string; riskLevel?: string }> = []): AgentV5ConstraintResult {
    const blockedActions = actions
      .map((item) => String(item.action ?? ''))
      .filter((action) => /auto_send|mass_send|customer_asset_write|stock_deduct|order_create|schedule_write|refund_confirm/.test(action));
    if (blockedActions.length || route.riskLevel === 'blocked') {
      return {
        decision: 'blocked',
        risks: ['命中 V5 禁止动作边界。'],
        blockedActions,
        limitations: ['V5 不允许自动发券、群发、改资产、扣库存、创建订单、改排班或确认退款。'],
      };
    }
    if (route.riskLevel === 'approval_required') {
      return {
        decision: 'approval_required',
        risks: ['该能力需要人工审批后才能承接。'],
        blockedActions: [],
        limitations: ['审批后仍只允许创建草稿或跟进任务。'],
      };
    }
    if (route.riskLevel === 'draft') {
      return {
        decision: 'draft_only',
        risks: [],
        blockedActions: [],
        limitations: ['当前仅生成草稿，不自动执行。'],
      };
    }
    return { decision: 'allow', risks: [], blockedActions: [], limitations: [] };
  }
}
