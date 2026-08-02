import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { BrainGateReceiptVerificationService } from './brain-gate-receipt-verification.service.js';

export type BrainReceiptIngestRequest = Request & {
  brainReceiptIssuer?: string;
};

@Injectable()
export class BrainGovernanceReceiptIngestGuard implements CanActivate {
  constructor(private readonly verificationService: BrainGateReceiptVerificationService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<BrainReceiptIngestRequest>();
    const body = request.body && typeof request.body === 'object' && !Array.isArray(request.body)
      ? request.body as Record<string, unknown>
      : {};
    const verified = await this.verificationService.verifyEnvelope({
      body,
      authorization: request.headers.authorization,
      timestamp: request.headers['x-brain-receipt-timestamp'],
      signature: request.headers['x-brain-receipt-signature'],
      issuer: request.headers['x-brain-receipt-issuer'],
    });
    request.brainReceiptIssuer = verified.issuer;
    return true;
  }
}
