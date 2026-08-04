import { Injectable } from '@nestjs/common';
import type { AskDataSemanticIntent } from './ask-data-free-sql.types.js';

export type AskDataClarificationDecision = {
  required: boolean;
  reason?: string;
  question?: string;
};

@Injectable()
export class AskDataClarificationPolicy {
  inspect(intent: AskDataSemanticIntent): AskDataClarificationDecision {
    if (!intent.ambiguities.length) return { required: false };
    const decisions = intent.ambiguities.map((ambiguity) => this.inspectAmbiguity(ambiguity));
    if (decisions.length === 1) return decisions[0];
    return {
      required: true,
      reason: intent.ambiguities.map((ambiguity) => ambiguity.reason).join('；'),
      question: `请同时补充：${decisions
        .map((decision) => (decision.question ?? '').replace(/^请(?:补充|明确)/, '').replace(/[。；]+$/, ''))
        .filter(Boolean)
        .join('；')}。`,
    };
  }

  private inspectAmbiguity(ambiguity: AskDataSemanticIntent['ambiguities'][number]): AskDataClarificationDecision {
    if (ambiguity.slot === 'year') {
      return {
        required: true,
        reason: ambiguity.reason,
        question: '请补充要查询的具体年份，例如“2025 年双十一”。',
      };
    }
    if (ambiguity.slot === 'threshold') {
      return {
        required: true,
        reason: ambiguity.reason,
        question: /观察周期|利用率/.test(ambiguity.reason)
          ? '请补充观察周期或利用率阈值，例如“连续 30 天利用率低于 30%”。'
          : /大量空档/.test(ambiguity.reason)
            ? '请补充空档判断标准，例如“可用容量超过 20 个”“空档时段超过 10 个”或“利用率低于 50%”。'
            : /差评|负面反馈/.test(ambiguity.reason)
              ? '请补充负面反馈判断标准，例如“本月差评超过 5 条”“负面反馈占比超过 10%”或“高于上月”。'
              : /贡献毛利/.test(ambiguity.reason)
                ? '请补充贡献毛利判断标准，例如“贡献毛利率低于 20%”“贡献毛利为负”或“低于上月”。'
              : /供应商集中度/.test(ambiguity.reason)
                ? '请补充供应商集中度标准，例如“第一大供应商采购金额占比超过 50%”或“高于上月”。'
                : /余额.*异常偏高/.test(ambiguity.reason)
                  ? '请补充余额异常标准，例如“总余额超过 5000 元”或“高于客户余额中位数 2 倍”。'
          : /自动化触达失败率/.test(ambiguity.reason)
            ? '请补充失败率阈值或比较基线，例如“失败率高于 10%”或“高于上月”。'
            : /成本/.test(ambiguity.reason)
              ? '请补充成本异常标准，例如“单项超过 5000 元”“环比增加 30%”或“高于近 3 个月均值”。'
          : /退款率/.test(ambiguity.reason)
            ? '请补充退款率判断阈值或比较基线，例如“退款率高于 10%”或“高于上月”。'
            : /库存损耗率/.test(ambiguity.reason)
              ? '请补充损耗率阈值或比较基线，例如“损耗率高于 3%”或“高于上月”。'
              : /爽约率/.test(ambiguity.reason)
                ? '请补充爽约率阈值或比较基线，例如“爽约率高于 10%”或“高于上月”。'
                : /核销率/.test(ambiguity.reason)
                  ? '请补充核销率阈值或比较基线，例如“核销率高于 30%”或“高于上月”。'
            : /可疑|异常退款/.test(ambiguity.reason)
              ? '请补充连续退款次数、金额或观察窗口，例如“24 小时内连续退款 3 次”。'
          : '请补充金额阈值或次数阈值，例如“退款金额超过 1000 元”或“剩余次数超过 5 次”。',
      };
    }
    if (ambiguity.slot.endsWith('_identity')) {
      return {
        required: true,
        reason: ambiguity.reason,
        question: '请补充更完整的名称或对象 ID，以便唯一定位。',
      };
    }
    if (ambiguity.slot === 'time_point') {
      return {
        required: true,
        reason: ambiguity.reason,
        question: '请补充具体日期，例如“上周三”。',
      };
    }
    if (ambiguity.slot === 'comparison_relation') {
      return {
        required: true,
        reason: ambiguity.reason,
        question: /采购结构/.test(ambiguity.reason)
          ? '请明确采购结构维度，例如按供应商、采购状态或月份分析。'
          : /耗占比/.test(ambiguity.reason)
            ? '请明确“耗占比”的分子和分母，例如消耗量占出库量、耗材成本占收入或报废量占出库量。'
            : '请明确要比较的指标，例如营业额、实收或日结净收。',
      };
    }
    if (ambiguity.slot === 'comparison_baseline') {
      return {
        required: true,
        reason: ambiguity.reason,
        question: /供应商.*性价比/.test(ambiguity.reason)
          ? '请明确供应商比较标准：按最低报价、按预计交期，或同时展示报价和交期但不做综合评分。'
          : /库存结构/.test(ambiguity.reason)
          ? '请明确库存结构的判断基线，例如目标品类占比、上月结构或近 30 天平均结构。'
          : '请明确“平时”的比较基线，例如最近 7 天、最近 30 天或上月。',
      };
    }
    return { required: true, reason: ambiguity.reason, question: `请补充${ambiguity.slot}。` };
  }
}
