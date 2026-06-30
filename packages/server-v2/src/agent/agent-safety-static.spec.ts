import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUSINESS_QUERY_CAPABILITIES } from '../business-query/business-query.capabilities.js';
import { AGENT_CAPABILITY_CATALOG } from './knowledge/capability-catalog.service.js';

describe('Agent safety static guards', () => {
  it('does not expose raw customer phone fields from BusinessQuery response shaping code', () => {
    const sourcePath = join(process.cwd(), 'src/business-query/business-query.service.ts');
    const source = readFileSync(sourcePath, 'utf8');
    const suspiciousPhoneAssignments = source
      .split(/\r?\n/)
      .map((line, index) => ({ line: line.trim(), lineNo: index + 1 }))
      .filter(({ line }) => /\b(customerPhone|phone)\s*:/.test(line))
      .filter(({ line }) => !/true|this\.maskPhone|phoneMasked|undefined|null|''|""/.test(line));

    expect(suspiciousPhoneAssignments).toEqual([]);
  });

  it('keeps high-risk natural-language actions behind approval-oriented task parsing', () => {
    const sourcePath = join(process.cwd(), 'src/agent/business-task/business-task-preparser.service.ts');
    const source = readFileSync(sourcePath, 'utf8');

    for (const keyword of ['群发', '发送', '扣款', '直接退款', '确认退款', '确认核销', '确认收银', '下发']) {
      expect(source).toContain(keyword);
    }
    expect(source).toContain("return 'confirm_action'");
  });

  it('keeps marketing automation execution queries scoped to current store through customer touches', () => {
    const sourcePath = join(process.cwd(), 'src/business-query/business-query.service.ts');
    const source = readFileSync(sourcePath, 'utf8');
    const executionQueryCount = source.match(/marketingAutomationExecution\.findMany/g)?.length ?? 0;
    const scopedExecutionQueryCount =
      source.match(/marketingAutomationExecution\.findMany\(\{[\s\S]*?touches: \{ some: \{ customer: \{ storeId \} \} \}/g)?.length ??
      0;

    expect(executionQueryCount).toBeGreaterThan(0);
    expect(scopedExecutionQueryCount).toBe(executionQueryCount);
  });

  it('keeps BusinessQuery Prisma reads scoped by store, authorized multi-store access, or documented schema exceptions', () => {
    const sourcePath = join(process.cwd(), 'src/business-query/business-query.service.ts');
    const source = readFileSync(sourcePath, 'utf8');
    const lines = source.split(/\r?\n/);
    const queryLinePattern =
      /(?:this\.prisma|\(this\.prisma as any\))\.[A-Za-z0-9_]+\.(?:findMany|findFirst|findUnique)\(/;
    const unscopedQueries = lines
      .map((line, index) => ({ line: line.trim(), lineNo: index + 1 }))
      .filter(({ line }) => queryLinePattern.test(line))
      .filter(({ line, lineNo }) => {
        const block = lines.slice(Math.max(0, lineNo - 1), Math.min(lines.length, lineNo + 24)).join(' ');
        if (/storeId|operatorId|UserStore|sourceId|activityId/.test(block)) return false;
        if (/marketingActivity\.findMany/.test(line)) {
          return !(
            source.includes('MarketingActivity 当前未内置 storeId，仅展示能关联到当前门店或全局 MarketingPage 的活动') &&
            source.includes('MarketingPage.storeId=当前门店或全局页')
          );
        }
        return true;
      });

    expect(unscopedQueries).toEqual([]);
  });

  it('executes every implemented knowledge-map business capability before legacy fallback', () => {
    const sourcePath = join(process.cwd(), 'src/business-query/business-query.service.ts');
    const source = readFileSync(sourcePath, 'utf8');
    const implementedBusinessCapabilities = new Set<string>(
      BUSINESS_QUERY_CAPABILITIES.filter((capability) => capability.implemented).map((capability) => capability.id),
    );
    const catalogBusinessCapabilities = new Set<string>(
      AGENT_CAPABILITY_CATALOG.map((capability) => capability.businessQueryCapabilityId).filter(Boolean) as string[],
    );
    const missingCatalog = [...implementedBusinessCapabilities].filter((capabilityId) => !catalogBusinessCapabilities.has(capabilityId));
    const requiredCapabilities = [...implementedBusinessCapabilities];
    const missing = requiredCapabilities.filter((capabilityId) => {
      const switchCase = `case '${capabilityId}':`;
      const specialBranch = `businessCapabilityId === '${capabilityId}'`;
      return !source.includes(switchCase) && !source.includes(specialBranch);
    });

    expect(requiredCapabilities.length).toBeGreaterThan(0);
    expect(missingCatalog).toEqual([]);
    expect(missing).toEqual([]);
  });
});
