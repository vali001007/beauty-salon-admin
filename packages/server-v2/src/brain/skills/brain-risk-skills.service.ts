import { Injectable } from '@nestjs/common';

interface RiskItem {
  title: string;
  severity: number;
  evidence: string[];
  action: string;
  entry: string;
}

@Injectable()
export class BrainRiskSkillsService {
  formatRisks(items: RiskItem[]) {
    return [...items].sort((a, b) => b.severity - a.severity);
  }
}
