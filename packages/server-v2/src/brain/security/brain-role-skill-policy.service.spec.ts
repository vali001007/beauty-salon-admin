import { BrainRoleSkillPolicyService } from './brain-role-skill-policy.service';

describe('BrainRoleSkillPolicyService', () => {
  it('maps finance summary to finance permission', () => {
    const service = new BrainRoleSkillPolicyService();

    expect(service.requiredPermissions('finance_risk_summary')).toEqual(['core:finance:view']);
  });

  it('maps reception action preview to reservation permission', () => {
    const service = new BrainRoleSkillPolicyService();

    expect(service.requiredPermissions('reception_action_preview')).toEqual(['core:store:reservations']);
  });
});
