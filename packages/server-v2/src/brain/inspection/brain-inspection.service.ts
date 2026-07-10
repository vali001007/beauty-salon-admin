import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class BrainInspectionService {
  async listRules() {
    return [
      'customer_churn_risk',
      'finance_margin_drop',
      'inventory_expiry',
      'fulfillment_no_show',
      'marketing_low_roi',
      'staff_productivity_drop',
    ];
  }

  @Cron('0 8 * * *')
  async runMorningInspection() {
    return {
      ruleKeys: [
        'high_value_customer_not_visited',
        'card_expiring_without_reservation',
        'daily_settlement_unbalanced',
        'stockout_sku',
        'low_marketing_roi',
        'beautician_capacity_gap',
      ],
    };
  }
}
