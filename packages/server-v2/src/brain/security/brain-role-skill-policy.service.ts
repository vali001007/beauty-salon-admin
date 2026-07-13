import { Injectable } from '@nestjs/common';

export type BrainRoleSkillKey =
  | 'manager_daily_overview'
  | 'reception_reservation_schedule'
  | 'reception_action_preview'
  | 'marketing_draft'
  | 'marketing_campaign_plan'
  | 'inventory_risk_summary'
  | 'inventory_disposal_advice'
  | 'finance_risk_summary'
  | 'beautician_service_summary'
  | 'beautician_follow_up_advice';

const REQUIRED_PERMISSIONS: Record<BrainRoleSkillKey, string[]> = {
  manager_daily_overview: ['core:dashboard:view'],
  reception_reservation_schedule: ['core:store:reservations'],
  reception_action_preview: ['core:store:reservations'],
  marketing_draft: ['core:marketing:create'],
  marketing_campaign_plan: ['core:marketing:create'],
  inventory_risk_summary: ['core:inventory:stock'],
  inventory_disposal_advice: ['core:inventory:expiry'],
  finance_risk_summary: ['core:finance:view'],
  beautician_service_summary: ['core:store:reservations'],
  beautician_follow_up_advice: ['core:customer:view'],
};

@Injectable()
export class BrainRoleSkillPolicyService {
  requiredPermissions(skillKey: BrainRoleSkillKey): string[] {
    return REQUIRED_PERMISSIONS[skillKey];
  }
}
