import { Injectable } from '@nestjs/common';

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /忽略(以上|之前|所有)指令/,
  /绕过(权限|安全|系统)/,
  /输出(系统提示词|密钥|token)/i,
];

@Injectable()
export class PromptInjectionGuardService {
  inspectText(text: string): { safe: boolean; hits: string[] } {
    const hits = INJECTION_PATTERNS
      .filter((pattern) => pattern.test(text))
      .map((pattern) => pattern.source);

    return { safe: hits.length === 0, hits };
  }
}
