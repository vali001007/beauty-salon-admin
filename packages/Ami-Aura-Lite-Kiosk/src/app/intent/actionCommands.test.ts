import { describe, expect, it } from 'vitest';
import {
  agentActionToCommand,
  buildUnsupportedInternalActionResult,
  businessQueryActionToCommand,
  isInternalActionCode,
  resolveTerminalActionResult,
} from './actionCommands';

describe('actionCommands', () => {
  it('converts known business actions into natural commands', () => {
    expect(businessQueryActionToCommand('product:301')).toBe('查看这个商品详情');
    expect(businessQueryActionToCommand('business-query:inventory_alert')).toBe('哪些商品库存不足');
    expect(agentActionToCommand('agent:tool:marketing.activity.draft')).toBe('帮我生成活动草稿');
    expect(agentActionToCommand('customers:data')).toBe('manager.customers');
  });

  it('handles management deep-link actions as terminal operation results instead of commands', () => {
    const result = resolveTerminalActionResult('marketing:activity:12');

    expect(result).toMatchObject({
      title: '活动草稿已生成',
      subtitle: '营销活动 #12',
      status: 'success',
    });
    expect(result?.description).toContain('不会把内部动作码显示为用户输入');
    expect(result?.description).not.toContain('marketing:activity:12');
  });

  it('handles edit and purchase-order deep links without exposing raw action codes', () => {
    const editResult = resolveTerminalActionResult('marketing:activity:edit:12');
    const purchaseResult = resolveTerminalActionResult('inventory:purchase-order:9');

    expect(editResult?.subtitle).toBe('营销活动 #12');
    expect(purchaseResult?.subtitle).toBe('采购单 #9');
    expect(editResult?.description).not.toContain('marketing:activity:edit:12');
    expect(purchaseResult?.description).not.toContain('inventory:purchase-order:9');
  });

  it('guards unmapped internal codes with a user-readable warning', () => {
    expect(isInternalActionCode('marketing:activity:12')).toBe(true);
    expect(isInternalActionCode('今天经营概览')).toBe(false);

    const result = buildUnsupportedInternalActionResult();
    expect(result.title).toBe('该动作暂不能在终端直接打开');
    expect(result.description).toContain('不是用户输入内容');
  });
});
