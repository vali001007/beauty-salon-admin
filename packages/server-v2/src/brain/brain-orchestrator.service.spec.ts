import { BrainOrchestratorService } from './orchestrator/brain-orchestrator.service.js';

describe('BrainOrchestratorService', () => {
  it('routes finance question to finance agent and store manager summary', () => {
    const orchestrator = new BrainOrchestratorService({} as never, {} as never, {} as never);
    const plan = orchestrator.planTasks({ intent: 'diagnose_profit_drop', metrics: ['paid_revenue', 'gross_margin_rate'] });

    expect(plan.tasks.map((task) => task.roleKey)).toEqual(['finance', 'store_manager']);
  });

  it('keeps seven role keys fixed for MVP', () => {
    expect(BrainOrchestratorService.MVP_ROLE_KEYS).toEqual([
      'store_manager',
      'receptionist',
      'beautician',
      'marketing',
      'finance',
      'inventory',
      'customer_service',
    ]);
  });
});
