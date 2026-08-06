import { Body, Controller, NotFoundException, Post, Req, UseGuards } from '@nestjs/common';
import { BrainGateReceiptVerificationService } from './brain-gate-receipt-verification.service.js';
import { BrainGovernanceControlPlaneService } from './brain-governance-control-plane.service.js';
import { BrainGovernanceCandidateService } from './brain-governance-candidate.service.js';
import { BrainGovernanceEventService } from './brain-governance-event.service.js';
import {
  BrainGovernanceReceiptIngestGuard,
  type BrainReceiptIngestRequest,
} from './brain-governance-receipt-ingest.guard.js';

@Controller('brain/governance/internal')
export class BrainGovernanceReceiptController {
  constructor(
    private readonly verificationService: BrainGateReceiptVerificationService,
    private readonly governanceControlPlaneService: BrainGovernanceControlPlaneService,
    private readonly candidateService: BrainGovernanceCandidateService,
    private readonly events?: BrainGovernanceEventService,
  ) {}

  @Post('gate-receipts')
  @UseGuards(BrainGovernanceReceiptIngestGuard)
  async ingestReceipt(@Req() request: BrainReceiptIngestRequest, @Body() body: Record<string, unknown>) {
    if (!request.brainReceiptIssuer) throw new NotFoundException('receipt_verified_issuer_missing');
    const verified = this.verificationService.verifyReceipt(
      body,
      request.brainReceiptIssuer,
      new Date(),
      request.brainReceiptAuthentication,
    );
    await this.verificationService.verifyReleaseEvidence(verified);
    const candidate = verified.trustLevel === 'untrusted_dev'
      ? null
      : verified.receipt.stage === 'release'
        ? await this.candidateService.bindVerifiedReleaseReceipt(verified.receipt)
        : await this.candidateService.upsertFromReceipt(verified.receipt);
    const result = await this.governanceControlPlaneService.ingestReceipt(
      { ...verified.receipt, ...(candidate ? { governanceCandidateId: candidate.id } : {}) },
      undefined,
      verified.trustLevel,
    );
    await this.events?.record({
      candidateId: candidate?.id,
      eventType: 'receipt_verified',
      entityType: 'receipt',
      entityId: result.id,
      actorType: 'ci',
      actorId: verified.issuer,
      payload: {
        receiptKey: result.receiptKey,
        stage: result.stage,
        trustLevel: verified.trustLevel,
        admissionEligible: verified.admissionEligible,
        rescheduledTaskIds: result.rescheduledTaskIds,
      },
    });
    return result;
  }
}
