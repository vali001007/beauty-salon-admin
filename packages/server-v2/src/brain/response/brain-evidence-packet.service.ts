import { Injectable } from '@nestjs/common';
import type { BrainObservation } from '../execution/brain-observation.service.js';
import type { BrainEvidencePacket, BrainEvidencePacketSourceCitation } from './brain-evidence-packet.types.js';

const MAX_SAMPLE_ROWS = 3;

@Injectable()
export class BrainEvidencePacketService {
  buildFromObservations(observations: readonly BrainObservation[]): BrainEvidencePacket[] {
    const packets = observations.flatMap((observation) => {
      const metadata = record(record(observation.data).metadata);
      const explicitPackets = arrayOfRecords(metadata.evidencePackets).flatMap((packet) =>
        this.normalizePacket(packet, observation),
      );
      if (explicitPackets.length) return explicitPackets;
      return observation.citations.flatMap((citation) => this.packetFromCitation(citation, observation));
    });
    return dedupePackets(packets);
  }

  hasAuditablePacket(packets: readonly BrainEvidencePacket[]) {
    return packets.some((packet) =>
      Boolean(
        packet.sourceType &&
          packet.sourceId &&
          (packet.metrics.length ||
            packet.filters.length ||
            packet.sampleRows.length ||
            packet.formula?.expression ||
            packet.formula?.key),
      ),
    );
  }

  private normalizePacket(value: Record<string, unknown>, observation: BrainObservation): BrainEvidencePacket[] {
    const sourceType = stringValue(value.sourceType);
    const sourceId = stringValue(value.sourceId);
    if (!sourceType || !sourceId) return [];
    return [
      {
        sourceType,
        sourceId,
        label: stringValue(value.label) || labelFor(sourceType, sourceId),
        ...optionalString('timeRange', value.timeRange),
        filters: stringArray(value.filters),
        metrics: stringArray(value.metrics),
        ...optionalFormula(value.formula),
        sampleRows: sampleRows(value.sampleRows).length ? sampleRows(value.sampleRows) : this.sampleRowsFromObservation(observation),
        limitations: stringArray(value.limitations),
      },
    ];
  }

  private packetFromCitation(
    citation: BrainEvidencePacketSourceCitation,
    observation: BrainObservation,
  ): BrainEvidencePacket[] {
    if (!citation.sourceType || !citation.sourceId) return [];
    const metadata = record(record(observation.data).metadata);
    const blocks = arrayOfRecords(record(observation.data).blocks);
    return [
      {
        sourceType: citation.sourceType,
        sourceId: citation.sourceId,
        label: citation.label || labelFor(citation.sourceType, citation.sourceId),
        ...(citation.timeRange || stringValue(metadata.timeRange) || stringValue(metadata.dateRange)
          ? { timeRange: citation.timeRange || stringValue(metadata.timeRange) || stringValue(metadata.dateRange) }
          : {}),
        filters: [...stringArray(citation.filters), ...stringArray(metadata.filters)],
        metrics: [
          ...stringArray(citation.metrics),
          ...stringArray(metadata.metrics),
          ...blocks.flatMap((block) => this.metricLabelsFromBlock(block)),
        ],
        ...(citation.formula ? { formula: citation.formula } : optionalFormula(metadata.formula)),
        sampleRows: sampleRows(citation.sampleRows).length ? sampleRows(citation.sampleRows) : this.sampleRowsFromObservation(observation),
        limitations: [...stringArray(citation.limitations), ...stringArray(metadata.limitations)],
      },
    ];
  }

  private metricLabelsFromBlock(block: Record<string, unknown>) {
    if (block.kind === 'kpi') {
      return arrayOfRecords(block.items).flatMap((item) => (typeof item.label === 'string' ? [item.label] : []));
    }
    if (block.kind === 'chart') return stringArray(block.yKeys);
    if (block.kind === 'comparison') {
      return arrayOfRecords(block.items).flatMap((item) => (typeof item.label === 'string' ? [item.label] : []));
    }
    return [];
  }

  private sampleRowsFromObservation(observation: BrainObservation) {
    const blocks = arrayOfRecords(record(observation.data).blocks);
    for (const block of blocks) {
      if ((block.kind === 'table' || block.kind === 'ranking' || block.kind === 'chart') && Array.isArray(block.rows)) {
        const rows = sampleRows(block.rows);
        if (rows.length) return rows;
      }
    }
    const mappingRows = Object.entries(record(observation.data))
      .filter(([key, value]) => key !== 'blocks' && key !== 'metadata' && Array.isArray(value))
      .flatMap(([, value]) => sampleRows(value));
    return mappingRows.slice(0, MAX_SAMPLE_ROWS);
  }
}

function dedupePackets(packets: BrainEvidencePacket[]) {
  const seen = new Set<string>();
  return packets.filter((packet) => {
    const key = `${packet.sourceType}:${packet.sourceId}:${packet.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function labelFor(sourceType: string, sourceId: string) {
  if (sourceType === 'business_definition') return `业务定义：${sourceId}`;
  if (sourceType === 'db_skill') return `事实查询：${sourceId}`;
  return `${sourceType}:${sourceId}`;
}

function optionalString(key: 'timeRange', value: unknown): Pick<BrainEvidencePacket, 'timeRange'> | Record<string, never> {
  const text = stringValue(value);
  return text ? { [key]: text } : {};
}

function optionalFormula(value: unknown): Pick<BrainEvidencePacket, 'formula'> | Record<string, never> {
  const formula = record(value);
  if (!Object.keys(formula).length) return {};
  const normalized: NonNullable<BrainEvidencePacket['formula']> = {};
  const key = stringValue(formula.key);
  const version = stringValue(formula.version);
  const expression = stringValue(formula.expression);
  const inputs = record(formula.inputs);
  const computedValues = record(formula.computedValues);
  const calculationSteps = stringArray(formula.calculationSteps);
  if (key) normalized.key = key;
  if (version) normalized.version = version;
  if (expression) normalized.expression = expression;
  if (Object.keys(inputs).length) normalized.inputs = inputs;
  if (Object.keys(computedValues).length) normalized.computedValues = computedValues;
  if (calculationSteps.length) normalized.calculationSteps = calculationSteps;
  return Object.keys(normalized).length ? { formula: normalized } : {};
}

function sampleRows(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord).slice(0, MAX_SAMPLE_ROWS).map(redactInternalKeys) : [];
}

function redactInternalKeys(row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => !/(?:api|token|secret|password|connection|string|url)$/i.test(key)),
  );
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function arrayOfRecords(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
