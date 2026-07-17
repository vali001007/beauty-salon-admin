import { Injectable } from '@nestjs/common';
import { BrainBeauticianSkillsService } from './brain-beautician-skills.service.js';
import { BrainFinanceSkillsService } from './brain-finance-skills.service.js';
import { BrainInventorySkillsService } from './brain-inventory-skills.service.js';
import { BrainManagerSkillsService } from './brain-manager-skills.service.js';
import { BrainMarketingSkillsService } from './brain-marketing-skills.service.js';
import { BrainQuerySkillsService } from './brain-query-skills.service.js';
import { BrainReceptionSkillsService } from './brain-reception-skills.service.js';
import { BrainSkillRegistryService } from './brain-skill-registry.service.js';

@Injectable()
export class BrainSkillRuntimeService {
  private readonly readCache = new Map<string, { expiresAt: number; value: Promise<unknown> }>();

  constructor(
    private readonly registry: BrainSkillRegistryService,
    private readonly querySkills: BrainQuerySkillsService,
    private readonly managerSkills: BrainManagerSkillsService,
    private readonly receptionSkills: BrainReceptionSkillsService,
    private readonly marketingSkills: BrainMarketingSkillsService,
    private readonly inventorySkills: BrainInventorySkillsService,
    private readonly financeSkills: BrainFinanceSkillsService,
    private readonly beauticianSkills: BrainBeauticianSkillsService,
  ) {}

  composeSuggestion(input: {
    conclusion: string;
    evidence: string[];
    action: string;
    benefit: string;
    entry: string;
  }) {
    return input;
  }

  listEnabledSkills() {
    return this.registry.listEnabledSkills();
  }

  runMetricQuery(input: Parameters<BrainQuerySkillsService['runMetricQuery']>[0]) {
    return this.cachedRead('metric', input, 15_000, () => this.querySkills.runMetricQuery(input));
  }

  buildManagerDailyOverview(input: Parameters<BrainManagerSkillsService['buildDailyOverview']>[0]) {
    return this.cachedRead('manager_daily_overview', input, 30_000, () => this.managerSkills.buildDailyOverview(input));
  }

  buildManagerOperationsAnalysis(input: Parameters<BrainManagerSkillsService['buildOperationsAnalysis']>[0]) {
    return this.managerSkills.buildOperationsAnalysis(input);
  }

  buildManagerStaffAnalysis(input: Parameters<BrainManagerSkillsService['buildStaffAnalysis']>[0]) {
    return this.managerSkills.buildStaffAnalysis(input);
  }

  buildManagerRevenueForecastBaseline(input: Parameters<BrainManagerSkillsService['buildRevenueForecastBaseline']>[0]) {
    return this.managerSkills.buildRevenueForecastBaseline(input);
  }

  countReceptionReservations(input: Parameters<BrainReceptionSkillsService['countReservations']>[0]) {
    return this.receptionSkills.countReservations(input);
  }

  listReceptionReservations(input: Parameters<BrainReceptionSkillsService['listReservationSchedule']>[0]) {
    return this.receptionSkills.listReservationSchedule(input);
  }

  buildReceptionOperationsSnapshot(input: Parameters<BrainReceptionSkillsService['buildOperationsSnapshot']>[0]) {
    return this.receptionSkills.buildOperationsSnapshot(input);
  }

  buildReceptionServiceOverrunAnalysis(input: Parameters<BrainReceptionSkillsService['buildServiceOverrunAnalysis']>[0]) {
    return this.receptionSkills.buildServiceOverrunAnalysis(input);
  }

  buildReceptionCatalogSnapshot(input: Parameters<BrainReceptionSkillsService['buildCatalogSnapshot']>[0]) {
    return this.receptionSkills.buildCatalogSnapshot(input);
  }

  previewReservationAction(input: Parameters<BrainReceptionSkillsService['previewReservationAction']>[0]) {
    return this.receptionSkills.previewReservationAction(input);
  }

  draftAppointmentReminder(input: Parameters<BrainMarketingSkillsService['draftAppointmentReminder']>[0]) {
    return this.marketingSkills.draftAppointmentReminder(input);
  }

  draftCustomerRecall(input: Parameters<BrainMarketingSkillsService['draftCustomerRecall']>[0]) {
    return this.marketingSkills.draftCustomerRecall(input);
  }

  draftCampaignPlan(input: Parameters<BrainMarketingSkillsService['draftCampaignPlan']>[0]) {
    return this.marketingSkills.draftCampaignPlan(input);
  }

  buildMarketingAnalytics(input: Parameters<BrainMarketingSkillsService['buildMarketingAnalytics']>[0]) {
    return this.marketingSkills.buildMarketingAnalytics(input);
  }

  buildMarketingFollowUpPriority(input: Parameters<BrainMarketingSkillsService['buildFollowUpPriorityRows']>[0]) {
    return this.marketingSkills.buildFollowUpPriorityRows(input);
  }

  buildMarketingFollowUpPrioritySnapshot(input: Parameters<BrainMarketingSkillsService['buildFollowUpPrioritySnapshot']>[0]) {
    return this.marketingSkills.buildFollowUpPrioritySnapshot(input);
  }

  buildInventoryRiskSummary(input: Parameters<BrainInventorySkillsService['buildInventoryRiskSummary']>[0]) {
    return this.inventorySkills.buildInventoryRiskSummary(input);
  }

  buildInventoryDetailAnalysis(input: Parameters<BrainInventorySkillsService['buildInventoryDetailAnalysis']>[0]) {
    return this.inventorySkills.buildInventoryDetailAnalysis(input);
  }

  buildInventoryProcurementAnalysis(input: Parameters<BrainInventorySkillsService['buildProcurementAnalysis']>[0]) {
    return this.inventorySkills.buildProcurementAnalysis(input);
  }

  composeInventoryDisposalAdvice() {
    return this.inventorySkills.composeDisposalAdvice();
  }

  buildFinanceRiskSummary(input: Parameters<BrainFinanceSkillsService['buildFinanceRiskSummary']>[0]) {
    return this.financeSkills.buildFinanceRiskSummary(input);
  }

  buildFinanceRefundReasonAnalysis(input: Parameters<BrainFinanceSkillsService['buildRefundReasonAnalysis']>[0]) {
    return this.financeSkills.buildRefundReasonAnalysis(input);
  }

  buildFinanceProductMarginAnalysis(input: Parameters<BrainFinanceSkillsService['buildProductMarginAnalysis']>[0]) {
    return this.financeSkills.buildProductMarginAnalysis(input);
  }

  buildFinanceIncomeAnalysis(input: Parameters<BrainFinanceSkillsService['buildIncomeAnalysis']>[0]) {
    return this.financeSkills.buildIncomeAnalysis(input);
  }

  buildFinanceMemberBalanceFlowSummary(input: Parameters<BrainFinanceSkillsService['buildMemberBalanceFlowSummary']>[0]) {
    return this.financeSkills.buildMemberBalanceFlowSummary(input);
  }

  buildFinanceCostAnalysis(input: Parameters<BrainFinanceSkillsService['buildCostAnalysis']>[0]) {
    return this.financeSkills.buildCostAnalysis(input);
  }

  buildBeauticianServiceSummary(input: Parameters<BrainBeauticianSkillsService['buildTodayServiceSummary']>[0]) {
    return this.beauticianSkills.buildTodayServiceSummary(input);
  }

  buildBeauticianPersonalPerformance(input: Parameters<BrainBeauticianSkillsService['buildPersonalPerformance']>[0]) {
    return this.beauticianSkills.buildPersonalPerformance(input);
  }

  composeBeauticianFollowUpAdvice(input: Parameters<BrainBeauticianSkillsService['composeFollowUpAdvice']>[0]) {
    return this.beauticianSkills.composeFollowUpAdvice(input);
  }

  private cachedRead<T>(namespace: string, input: unknown, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const key = `${namespace}:${JSON.stringify(input)}`;
    const now = Date.now();
    const cached = this.readCache.get(key);
    if (cached && cached.expiresAt > now) return cached.value as Promise<T>;
    const value = loader().catch((error) => {
      this.readCache.delete(key);
      throw error;
    });
    this.readCache.set(key, { expiresAt: now + ttlMs, value });
    return value;
  }
}
