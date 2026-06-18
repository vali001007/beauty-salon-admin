import { Injectable } from '@nestjs/common';
import type { AgentFieldScopes, AgentToolResult } from './agent.types.js';

type FieldScopeRule = {
  scope: string;
  match: (normalizedKey: string) => boolean;
  kind: 'phone' | 'identifier' | 'money' | 'text';
};

@Injectable()
export class AgentFieldScopeSanitizerService {
  private readonly fieldScopeRules: FieldScopeRule[] = [
    {
      scope: 'customerPhone',
      match: (key) => ['phone', 'customerphone', 'mobile', 'customermobile'].includes(key),
      kind: 'phone',
    },
    {
      scope: 'customerWechat',
      match: (key) => ['wechat', 'customerwechat', 'wechatid', 'customerwechatid'].includes(key),
      kind: 'identifier',
    },
    {
      scope: 'customerBalance',
      match: (key) =>
        key.includes('balance') ||
        key.includes('recharge') ||
        key.includes('storedvalue') ||
        key.includes('cashbalance') ||
        key.includes('giftbalance'),
      kind: 'money',
    },
    {
      scope: 'customerCost',
      match: (key) =>
        key.includes('cost') ||
        key.includes('costprice') ||
        key.includes('materialcost') ||
        key.includes('purchaseamount') ||
        key.includes('settlementamount'),
      kind: 'money',
    },
    {
      scope: 'customerProfit',
      match: (key) =>
        key.includes('profit') ||
        key.includes('margin') ||
        key.includes('grossprofit') ||
        key.includes('netrevenue') ||
        key.includes('profitrate') ||
        key.includes('marginrate'),
      kind: 'money',
    },
    {
      scope: 'customerPrivateNote',
      match: (key) => key.includes('privatenote') || key.includes('internalnote') || key.includes('sensitivecomment'),
      kind: 'text',
    },
    {
      scope: 'customerRemark',
      match: (key) => key === 'remark' || key.endsWith('remark') || key === 'note' || key.endsWith('note') || key.includes('comment'),
      kind: 'text',
    },
    {
      scope: 'staffCommission',
      match: (key) => key.includes('commission'),
      kind: 'money',
    },
  ];

  sanitize(result: AgentToolResult, fieldScopes?: AgentFieldScopes): AgentToolResult {
    const scopes = fieldScopes ?? {};
    if (!Object.keys(scopes).length) return result;
    return {
      ...result,
      summary: this.applyFieldScopesToText(result.summary, scopes),
      data: this.applyFieldScopesToValue(result.data, scopes),
    };
  }

  inspect(fieldScopes?: AgentFieldScopes) {
    const scopes = fieldScopes ?? {};
    const protectedScopes = this.fieldScopeRules
      .map((rule) => rule.scope)
      .filter((scope, index, list) => list.indexOf(scope) === index)
      .filter((scope) => scopes[scope] === 'hidden' || scopes[scope] === 'masked');
    return {
      enabled: protectedScopes.length > 0,
      protectedScopes,
    };
  }

  private applyFieldScopesToValue(value: unknown, fieldScopes: AgentFieldScopes): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.applyFieldScopesToValue(item, fieldScopes)).filter((item) => item !== undefined);
    }
    if (!value || typeof value !== 'object') return value;

    const output: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value)) {
      const scopedValue = this.applySingleFieldScope(key, raw, fieldScopes);
      if (scopedValue !== raw) {
        if (scopedValue !== undefined) output[key] = scopedValue;
        continue;
      }
      const nested = this.applyFieldScopesToValue(raw, fieldScopes);
      if (nested !== undefined) output[key] = nested;
    }
    return output;
  }

  private applySingleFieldScope(key: string, value: unknown, fieldScopes: AgentFieldScopes): unknown {
    const normalizedKey = key.toLowerCase();
    const rule = this.fieldScopeRules.find((item) => item.match(normalizedKey));
    if (rule) {
      return this.applyScalarScope(value, fieldScopes[rule.scope], rule.kind);
    }
    return value;
  }

  private applyScalarScope(value: unknown, scope: string | undefined, kind: 'phone' | 'identifier' | 'money' | 'text') {
    if (scope === 'hidden') return undefined;
    if (scope !== 'masked') return value;
    if (value === undefined || value === null || value === '') return value;
    if (kind === 'phone') return this.maskPhone(String(value));
    if (kind === 'identifier') return this.maskIdentifier(String(value));
    if (kind === 'money') return '已脱敏';
    return this.maskText(String(value));
  }

  private applyFieldScopesToText(text: string, fieldScopes: AgentFieldScopes) {
    let output = text;
    const phoneScope = fieldScopes.customerPhone;
    if (phoneScope === 'masked' || phoneScope === 'hidden') {
      output = output.replace(/1[3-9]\d{9}/g, (phone) => (phoneScope === 'hidden' ? '手机号已隐藏' : this.maskPhone(phone)));
    }
    output = this.applyKeywordTextScope(output, fieldScopes.customerBalance, ['余额', '储值', '充值', '沉淀余额']);
    output = this.applyKeywordTextScope(output, fieldScopes.customerCost, ['成本', '耗材成本', '采购成本', '结算金额']);
    output = this.applyKeywordTextScope(output, fieldScopes.customerProfit, ['利润', '毛利', '毛利率', '净收入']);
    output = this.applyKeywordTextScope(output, fieldScopes.staffCommission, ['提成', '提成成本']);
    output = this.applyKeywordTextScope(output, fieldScopes.customerPrivateNote, ['私密备注']);
    return this.applyKeywordTextScope(output, fieldScopes.customerRemark, ['备注']);
  }

  private maskPhone(value: string) {
    return value.replace(/1[3-9]\d{9}/g, (phone) => `${phone.slice(0, 3)}****${phone.slice(-4)}`);
  }

  private maskIdentifier(value: string) {
    if (value.length <= 2) return '**';
    if (value.length <= 6) return `${value.slice(0, 1)}***`;
    return `${value.slice(0, 2)}****${value.slice(-2)}`;
  }

  private maskText(value: string) {
    if (value.length <= 2) return '**';
    return `${value.slice(0, 1)}***`;
  }

  private applyKeywordTextScope(text: string, scope: string | undefined, keywords: string[]) {
    if (scope !== 'hidden' && scope !== 'masked') return text;
    const replacement = scope === 'hidden' ? '已隐藏' : '已脱敏';
    return keywords.reduce((current, keyword) => {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return current.replace(
        new RegExp(`${escaped}[^，。；、\\n]*`, 'g'),
        (match) => `${keyword}${match.includes('：') || match.includes(':') ? '：' : ' '}${replacement}`,
      );
    }, text);
  }
}
