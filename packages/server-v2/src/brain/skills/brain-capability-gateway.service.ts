import { Injectable } from '@nestjs/common';

const CAPABILITY_MAP: Record<
  string,
  { endpoint: string; method: 'POST' | 'PUT' | 'PATCH'; permission: string; riskLevel: 'medium' | 'high' | 'critical' }
> = {
  create_reservation: { endpoint: 'reservations', method: 'POST', permission: 'core:store:reservations', riskLevel: 'medium' },
  create_customer_followup: { endpoint: 'marketing/followups', method: 'POST', permission: 'core:marketing:create', riskLevel: 'medium' },
  create_purchase_order: { endpoint: 'supply-platform/purchase-orders', method: 'POST', permission: 'core:supply:view', riskLevel: 'high' },
  settle_commission: { endpoint: 'commission/settlements', method: 'POST', permission: 'core:finance:manage', riskLevel: 'critical' },
};

@Injectable()
export class BrainCapabilityGatewayService {
  resolve(skillKey: string) {
    const capability = CAPABILITY_MAP[skillKey];
    if (!capability) throw new Error(`unsupported_capability:${skillKey}`);
    return capability;
  }
}
