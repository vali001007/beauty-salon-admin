export type AgentRiskLevel = 'low' | 'medium' | 'high';

export type AuraBlockAction = {
  label: string;
  actionId: string;
  riskLevel: AgentRiskLevel;
};

export type AuraClarificationOption = {
  label: string;
  value: string;
  description?: string;
  actionId?: string;
};

export type MetricTone = 'default' | 'warning' | 'critical' | 'success';

export type AuraResponseBlock =
  | { kind: 'summary_text'; content: string; title?: string }
  | { kind: 'text'; content: string }
  | { kind: 'kpi_card'; label: string; value: string; delta?: string; deltaType?: 'up' | 'down' | 'neutral'; unit?: string; hint?: string }
  | { kind: 'table'; columns: string[]; rows: string[][]; sortable?: boolean; caption?: string }
  | { kind: 'chart'; chartType: 'line' | 'bar' | 'pie' | 'funnel'; title: string; data: unknown; xKey?: string; yKeys?: string[] }
  | {
      kind: 'entity_resolution_badge';
      objectType: string;
      entityName: string;
      confidence?: number;
      sourceModel?: string;
      matchStrategy?: string;
      label?: string;
    }
  | {
      kind: 'capability_trace';
      title?: string;
      capabilityId?: string;
      queryTemplateId?: string;
      action?: string;
      executionPath?: string;
      schemaPath?: string[];
      confidence?: number;
      fallbackReason?: string | null;
      entity?: {
        objectType?: string;
        entityName?: string;
        entityId?: string;
        sourceModel?: string;
        confidence?: number;
      };
    }
  | {
      kind: 'link_card';
      title: string;
      description?: string;
      primaryUrl?: string;
      miniappPath?: string;
      qrCodeUrl?: string;
      statusLabel?: string;
      links?: Array<{ label: string; value: string; type?: 'url' | 'miniapp_path' | 'qr_code' | 'text' }>;
      actions?: AuraBlockAction[];
    }
  | { kind: 'customer_card'; customerId: string; name: string; vipLevel?: string; lastVisit?: string; suggestion?: string; actions?: AuraBlockAction[] }
  | {
      kind: 'opportunity_card';
      title: string;
      summary: string;
      opportunityType: string;
      fitScore: number;
      productName: string;
      sku?: string;
      currentStock?: number;
      safetyStock?: number;
      salesQuantity?: number;
      salesAmount?: number;
      customerCount?: number;
      expiringStock?: number;
      daysToExpiry?: number | null;
      marginRateText?: string;
      reason: string;
      suggestedCampaign?: string;
      suggestedChannels?: string[];
      riskWarnings?: string[];
      actions?: AuraBlockAction[];
    }
  | {
      kind: 'copy_variants';
      title: string;
      target: string;
      offer: string;
      variants: Array<{
        label: string;
        content: string;
        tone?: string;
      }>;
      actions?: AuraBlockAction[];
    }
  | {
      kind: 'activity_draft_card';
      title: string;
      targetAudience: string;
      offerSummary: string;
      copyPreview: string;
      scheduleHint?: string;
      impactSummary?: string;
      offerCostEstimate?: Array<{
        label: string;
        value: string;
        tone?: MetricTone;
      }>;
      audienceDetails?: Array<{
        label: string;
        value: string;
        description?: string;
      }>;
      editable?: boolean;
      recommendedItems?: Array<{
        name: string;
        reason?: string;
        fitScore?: number;
      }>;
      actions?: AuraBlockAction[];
    }
  | {
      kind: 'inventory_item_card';
      title: string;
      itemName: string;
      subtitle?: string;
      riskLevel?: AgentRiskLevel;
      statusLabel?: string;
      metrics: Array<{ label: string; value: string; tone?: MetricTone }>;
      reason?: string;
      actions?: AuraBlockAction[];
    }
  | {
      kind: 'supplier_purchase_card';
      title: string;
      productName: string;
      supplierName: string;
      statusLabel?: string;
      metrics: Array<{ label: string; value: string; tone?: MetricTone }>;
      reason?: string;
      actions?: AuraBlockAction[];
    }
  | {
      kind: 'clarification_card';
      title: string;
      question: string;
      options: AuraClarificationOption[];
      allowFreeText?: boolean;
    }
  | { kind: 'confirm_action'; title: string; preview: string; actionId: string; riskLevel: AgentRiskLevel; impactSummary?: string }
  | { kind: 'action_card'; title: string; preview: string; actionId: string; riskLevel: AgentRiskLevel; impactSummary?: string }
  | { kind: 'alert'; level: 'warning' | 'critical' | 'info'; message: string; actionId?: string }
  | { kind: 'follow_up_chips'; suggestions: string[] }
  | { kind: 'document_preview'; title: string; content: string; downloadable?: boolean }
  | { kind: 'evidence_panel'; sources: string[]; dateRange?: string; metricDefinition: string; limitations?: string[] }
  | { kind: 'data_gap'; title: string; message: string; missingData: string[]; nextSteps?: string[] }
  | { kind: 'permission_notice'; title: string; message: string; allowedSummary?: string; actions?: AuraBlockAction[] };

export type BrainResponseBlockCompat =
  | { kind: 'text'; text: string; citationIds?: string[] }
  | { kind: 'kpi'; items: Array<{ label: string; value: string; hint?: string }>; citationIds?: string[] }
  | { kind: 'ranking' | 'table'; rows: Array<Record<string, unknown>>; columns: string[]; citationIds?: string[] }
  | { kind: 'chart'; chartType: 'bar' | 'line'; rows: Array<Record<string, unknown>>; xKey: string; yKeys: string[]; citationIds?: string[] }
  | { kind: 'comparison'; items: Array<{ label: string; current: string; previous: string; delta?: string }>; citationIds?: string[] }
  | { kind: 'diagnosis'; findings: Array<{ title: string; detail: string; severity: 'info' | 'warning' | 'critical' }>; citationIds?: string[] }
  | { kind: 'clarification'; question: string; options: Array<{ id: string; label: string; value: unknown }> }
  | { kind: 'action_preview'; actions: unknown[] }
  | { kind: 'limitations'; items: string[] }
  | { kind: 'evidence'; citations: Array<{ sourceType: string; sourceId: string; label?: string; definition?: string }> };
