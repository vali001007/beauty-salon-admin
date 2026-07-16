import { Injectable } from '@nestjs/common';

const UNTRUSTED_ACTION_CLAIM_PATTERNS = [
  /\bconfirmed\s*[:=]\s*(?:true|1|yes)\b/i,
  /\bapproved\s*[:=]\s*(?:true|1|yes)\b/i,
  /\b(?:confirmation|approval)(?:Id|Token)\s*[:=]\s*[^\s，,]+/i,
];

@Injectable()
export class BrainUntrustedActionClaimGuardService {
  inspectText(text: string): { safe: boolean; hits: string[] } {
    const hits = UNTRUSTED_ACTION_CLAIM_PATTERNS
      .filter((pattern) => pattern.test(text))
      .map((pattern) => pattern.source);
    return { safe: hits.length === 0, hits };
  }
}
