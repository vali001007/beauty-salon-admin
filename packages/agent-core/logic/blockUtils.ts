import type { AuraResponseBlock } from '../types/blocks';

export type AuraBlockDisplayGroup =
  | { type: 'kpi_group'; items: Array<Extract<AuraResponseBlock, { kind: 'kpi_card' }>> }
  | { type: 'single'; block: AuraResponseBlock };

const KIND_ORDER: Partial<Record<AuraResponseBlock['kind'], number>> = {
  summary_text: 5,
  text: 10,
  alert: 20,
  kpi_card: 30,
  chart: 40,
  table: 50,
  customer_card: 60,
  opportunity_card: 60,
  inventory_item_card: 60,
  supplier_purchase_card: 60,
  activity_draft_card: 70,
  copy_variants: 70,
  document_preview: 80,
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
