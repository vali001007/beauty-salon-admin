import type { AuraResponseBlock, BrainResponseBlockCompat } from '../types/blocks';

export type AuraBlockDisplayGroup =
  | { type: 'kpi_group'; items: Array<Extract<AuraResponseBlock, { kind: 'kpi_card' }>> }
  | { type: 'single'; block: AuraResponseBlock };

const KIND_ORDER: Partial<Record<AuraResponseBlock['kind'], number>> = {
  summary_text: 5,
  text: 10,
  alert: 20,
  data_gap: 25,
  permission_notice: 25,
  entity_resolution_badge: 26,
  kpi_card: 30,
  chart: 40,
  link_card: 45,
  table: 50,
  customer_card: 60,
  opportunity_card: 60,
  inventory_item_card: 60,
  supplier_purchase_card: 60,
  clarification_card: 65,
  activity_draft_card: 70,
  copy_variants: 70,
  document_preview: 80,
  capability_trace: 85,
  evidence_panel: 90,
  confirm_action: 100,
  action_card: 100,
  follow_up_chips: 110,
};

export function orderBlocksForDisplay(blocks: AuraResponseBlock[]): AuraResponseBlock[] {
  return [...blocks].sort((a, b) => (KIND_ORDER[a.kind] ?? 999) - (KIND_ORDER[b.kind] ?? 999));
}

export function groupKpiCards(blocks: AuraResponseBlock[]): Array<AuraResponseBlock | AuraResponseBlock[]> {
  const result: Array<AuraResponseBlock | AuraResponseBlock[]> = [];
  let currentGroup: AuraResponseBlock[] = [];

  for (const block of blocks) {
    if (block.kind === 'kpi_card') {
      currentGroup.push(block);
      continue;
    }

    if (currentGroup.length) {
      result.push(currentGroup);
      currentGroup = [];
    }
    result.push(block);
  }

  if (currentGroup.length) result.push(currentGroup);
  return result;
}

export function groupBlocksForDisplay(blocks: AuraResponseBlock[]): AuraBlockDisplayGroup[] {
  const groups: AuraBlockDisplayGroup[] = [];
  let kpiBuffer: Array<Extract<AuraResponseBlock, { kind: 'kpi_card' }>> = [];

  const flushKpi = () => {
    if (!kpiBuffer.length) return;
    groups.push({ type: 'kpi_group', items: [...kpiBuffer] });
    kpiBuffer = [];
  };

  for (const block of orderBlocksForDisplay(blocks)) {
    if (block.kind === 'kpi_card') {
      kpiBuffer.push(block);
      continue;
    }
    flushKpi();
    groups.push({ type: 'single', block });
  }

  flushKpi();
  return groups;
}

export function mapBrainResponseBlocks(blocks: readonly BrainResponseBlockCompat[]): AuraResponseBlock[] {
  return blocks.flatMap((block): AuraResponseBlock[] => {
    if (block.kind === 'text') return [{ kind: 'text', content: block.text }];
    if (block.kind === 'kpi') return block.items.map((item) => ({ kind: 'kpi_card', ...item }));
    if (block.kind === 'ranking' || block.kind === 'table') {
      const columns = block.columns.length ? block.columns : Object.keys(block.rows[0] ?? {});
      return [{
        kind: 'table',
        caption: block.kind === 'ranking' ? '排行结果' : '明细结果',
        columns,
        rows: block.rows.map((row) => columns.map((column) => formatCompatValue(row[column]))),
      }];
    }
    if (block.kind === 'chart') return [{ kind: 'chart', chartType: block.chartType, title: '经营数据', data: block.rows, xKey: block.xKey, yKeys: block.yKeys }];
    if (block.kind === 'comparison') return [{ kind: 'table', caption: '对比结果', columns: ['项目', '当前', '上期', '变化'], rows: block.items.map((item) => [item.label, item.current, item.previous, item.delta ?? '-']) }];
    if (block.kind === 'diagnosis') return block.findings.map((item) => ({ kind: 'alert', level: item.severity === 'critical' ? 'critical' : item.severity === 'warning' ? 'warning' : 'info', message: `${item.title}：${item.detail}` }));
    if (block.kind === 'clarification') return [{ kind: 'clarification_card', title: '需要确认', question: block.question, options: block.options.map((item) => ({ label: item.label, value: typeof item.value === 'string' ? item.value : JSON.stringify(item.value), actionId: item.id })) }];
    if (block.kind === 'follow_up_questions') return [{ kind: 'follow_up_chips', suggestions: block.questions.map((item) => item.value || item.label) }];
    if (block.kind === 'limitations') return [{ kind: 'data_gap', title: '未完成范围', message: block.items.join('；'), missingData: block.items }];
    if (block.kind === 'evidence') return [{ kind: 'evidence_panel', sources: block.citations.map((item) => item.label ?? item.sourceId), metricDefinition: block.citations.map((item) => item.definition).filter(Boolean).join('；') || 'Ami Core 业务定义' }];
    if (block.kind === 'action_preview') {
      return block.actions.flatMap((value): AuraResponseBlock[] => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
        const action = value as Record<string, unknown>;
        if (typeof action.actionId !== 'string') return [];
        return [{ kind: 'confirm_action', title: String(action.label ?? action.actionType ?? '动作预览'), preview: String(action.summary ?? '请确认后执行'), actionId: action.actionId, riskLevel: normalizeRisk(action.riskLevel), impactSummary: typeof action.impactSummary === 'string' ? action.impactSummary : undefined }];
      });
    }
    return [];
  });
}

function formatCompatValue(value: unknown) {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function normalizeRisk(value: unknown): 'low' | 'medium' | 'high' {
  return value === 'high' || value === 'medium' ? value : 'low';
}
