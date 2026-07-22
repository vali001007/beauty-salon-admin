import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

export type BrainInspectionRepairDecision = 'approve' | 'modify' | 'reject';

export interface BrainInspectionRepairChange {
  inputKey: string;
  field: string;
  label: string;
  currentValue: unknown;
  proposedValue: unknown;
  reason: string;
  editable: true;
}

export interface BrainInspectionRepairPreview {
  schemaVersion: 1;
  findingId: number;
  ruleKey: string;
  title: string;
  severity: string;
  target: { objectType: string; objectId: string };
  summary: string;
  entry: string | null;
  changes: BrainInspectionRepairChange[];
  risks: string[];
  policy: {
    mode: 'preview_only';
    autoExecute: false;
    createsBusinessWrite: false;
    requiresSeparateBusinessAction: true;
  };
  previewFingerprint: string;
  existingDecision: Record<string, unknown> | null;
}

type FindingRecord = {
  id: number;
  storeId: number;
  ruleKey: string;
  title: string;
  severity: string;
  objectType: string;
  objectId: string;
  evidence: unknown;
  suggestion: unknown;
  status: string;
};

@Injectable()
export class BrainInspectionRepairPreviewService {
  constructor(private readonly prisma: PrismaService) {}

  async getPreview(input: { storeId: number; findingId: number }): Promise<BrainInspectionRepairPreview> {
    const finding = await this.loadFinding(input);
    return this.buildPreview(finding);
  }

  async recordDecision(input: {
    storeId: number;
    findingId: number;
    userId: number;
    decision: BrainInspectionRepairDecision;
    modifications?: Record<string, unknown>;
    note?: string;
  }) {
    if (!['approve', 'modify', 'reject'].includes(input.decision)) {
      throw new BadRequestException('inspection_repair_decision_invalid');
    }
    const finding = await this.loadFinding(input);
    const preview = this.buildPreview(finding);
    const modifications = this.validateModifications(preview, input.decision, input.modifications);
    const reviewedAt = new Date().toISOString();
    const suggestion = this.record(finding.suggestion);
    const repairReview = {
      decision: input.decision,
      modifications,
      note: this.optionalText(input.note),
      reviewedBy: input.userId,
      reviewedAt,
      previewFingerprint: preview.previewFingerprint,
      executionStatus: 'not_executed',
      executionPolicy: preview.policy,
    };
    const rejected = input.decision === 'reject';
    const updated = await this.prisma.brainInspectionFinding.update({
      where: { id: finding.id, storeId: finding.storeId },
      data: {
        suggestion: this.json({ ...suggestion, repairPreview: preview, repairReview }),
        disposition: rejected ? 'ignored' : 'adopted',
        dispositionNote: repairReview.note,
        status: rejected ? 'closed' : 'in_progress',
        resolvedAt: rejected ? new Date(reviewedAt) : null,
      },
    });
    return {
      findingId: finding.id,
      decision: input.decision,
      status: updated.status,
      repairReview,
      nextAction: rejected
        ? null
        : { type: 'open_business_screen', entry: preview.entry, autoExecute: false },
    };
  }

  private async loadFinding(input: { storeId: number; findingId: number }): Promise<FindingRecord> {
    const finding = await this.prisma.brainInspectionFinding.findFirst({
      where: { id: input.findingId, storeId: input.storeId },
      select: {
        id: true,
        storeId: true,
        ruleKey: true,
        title: true,
        severity: true,
        objectType: true,
        objectId: true,
        evidence: true,
        suggestion: true,
        status: true,
      },
    });
    if (!finding) throw new NotFoundException('inspection_finding_not_found');
    return finding as FindingRecord;
  }

  private buildPreview(finding: FindingRecord): BrainInspectionRepairPreview {
    const evidence = this.record(finding.evidence);
    const suggestion = this.record(finding.suggestion);
    const changes = this.changesFor(finding.ruleKey, evidence);
    const core = {
      schemaVersion: 1 as const,
      findingId: finding.id,
      ruleKey: finding.ruleKey,
      title: finding.title,
      severity: finding.severity,
      target: { objectType: finding.objectType, objectId: finding.objectId },
      summary: this.text(suggestion.action) || '复核证据并在对应业务页面修正数据。',
      entry: this.optionalText(suggestion.entry),
      changes,
      risks: this.risksFor(finding.ruleKey),
      policy: {
        mode: 'preview_only' as const,
        autoExecute: false as const,
        createsBusinessWrite: false as const,
        requiresSeparateBusinessAction: true as const,
      },
    };
    return {
      ...core,
      previewFingerprint: createHash('sha256').update(JSON.stringify(core)).digest('hex'),
      existingDecision: this.nullableRecord(suggestion.repairReview),
    };
  }

  private changesFor(ruleKey: string, evidence: Record<string, unknown>): BrainInspectionRepairChange[] {
    switch (ruleKey) {
      case 'reception_in_store_state_stale':
        return [this.change('actualStatus', 'status', '实际预约状态', evidence.status, null, '当前到店状态持续时间异常，需要人工确认实际履约状态。')];
      case 'service_task_state_inconsistent':
        return [
          this.change('actualStatus', 'status', '实际服务状态', evidence.status, null, '状态与服务时间记录不一致。'),
          this.change('startedAt', 'startedAt', '实际开始时间', evidence.startedAt ?? null, null, '仅在核对服务记录后填写。'),
          this.change('completedAt', 'completedAt', '实际完成时间', evidence.completedAt ?? null, null, '仅在核对服务记录后填写。'),
        ];
      case 'inventory_safety_stock_invalid': {
        const changes: BrainInspectionRepairChange[] = [];
        if (Number(evidence.safetyStock) <= 0) changes.push(this.change('safetyStock', 'safetyStock', '安全库存', evidence.safetyStock, null, '安全库存必须由门店根据补货周期确认。'));
        if (Number(evidence.currentStock) < 0) changes.push(this.change('currentStock', 'currentStock', '当前库存', evidence.currentStock, null, '负库存需要先完成库存盘点。'));
        if (Number(evidence.minPurchaseQty) < 0) changes.push(this.change('minPurchaseQty', 'minPurchaseQty', '最小采购量', evidence.minPurchaseQty, null, '最小采购量不能为负数。'));
        return changes;
      }
      case 'procurement_evidence_missing': {
        const changes: BrainInspectionRepairChange[] = [];
        if (!this.optionalText(evidence.supplierName)) changes.push(this.change('supplierName', 'supplierName', '供应商', null, null, '采购建议缺少有效供应映射。'));
        if (evidence.unitPrice == null) changes.push(this.change('unitPrice', 'unitPrice', '有效报价', null, null, '采购金额不能在缺少报价时确认。'));
        return changes;
      }
      default:
        return [this.change('resolutionNote', 'manualReview', '人工复核结论', null, null, '该规则没有安全的自动字段推断，只允许记录人工复核结论。')];
    }
  }

  private risksFor(ruleKey: string): string[] {
    const shared = ['批准仅记录治理决策，不会修改业务数据。', '实际业务修改必须在对应页面再次核对并提交。'];
    const specific: Record<string, string[]> = {
      reception_in_store_state_stale: ['错误关闭预约会影响在店人数、履约率和客户记录。'],
      service_task_state_inconsistent: ['错误修改服务状态或时间会影响业绩、提成和服务追踪。'],
      inventory_safety_stock_invalid: ['安全库存设置不当会造成缺货或积压；负库存修正前必须盘点。'],
      procurement_evidence_missing: ['缺少供应商或有效报价时不得生成或确认采购单。'],
    };
    return [...(specific[ruleKey] ?? ['修复前必须核对原始业务记录。']), ...shared];
  }

  private validateModifications(
    preview: BrainInspectionRepairPreview,
    decision: BrainInspectionRepairDecision,
    value: Record<string, unknown> | undefined,
  ) {
    if (decision !== 'modify') return {};
    const modifications = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const allowed = new Set(preview.changes.map((change) => change.inputKey));
    const unknown = Object.keys(modifications).filter((key) => !allowed.has(key));
    if (unknown.length) throw new BadRequestException(`inspection_repair_modification_unknown:${unknown.join(',')}`);
    if (!Object.keys(modifications).length) throw new BadRequestException('inspection_repair_modification_required');
    return modifications;
  }

  private change(inputKey: string, field: string, label: string, currentValue: unknown, proposedValue: unknown, reason: string): BrainInspectionRepairChange {
    return { inputKey, field, label, currentValue, proposedValue, reason, editable: true };
  }

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }

  private nullableRecord(value: unknown): Record<string, unknown> | null {
    const result = this.record(value);
    return Object.keys(result).length ? result : null;
  }

  private text(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
  }

  private optionalText(value: unknown) {
    const result = this.text(value);
    return result || null;
  }

  private json(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
