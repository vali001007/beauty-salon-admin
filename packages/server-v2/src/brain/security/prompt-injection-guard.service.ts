import { Injectable } from '@nestjs/common';

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /忽略(以上|之前|前面|所有).{0,8}指令/,
  /无视.*(指令|规则|权限|安全)/,
  /不要遵守.*(系统|开发者|权限|安全)/,
  /绕过(权限|安全|系统)/,
  /(输出|打印|泄露|展示).*(系统提示词|system\s*prompt|密钥|token|api\s*key)/i,
  /pretend\s+to\s+be\s+(system|developer|admin)/i,
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
