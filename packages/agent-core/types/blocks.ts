export type AgentRiskLevel = 'low' | 'medium' | 'high';

export type AuraBlockAction = {
  label: string;
  actionId: string;
  riskLevel: AgentRiskLevel;
};

export type MetricTone = 'default' | 'warning' | 'critical' | 'success';

export type AuraResponseBlock =
  | { kind: 'summary_text'; content: string; title?: string }
  | { kind: 'text'; content: string }
  | { kind: 'kpi_card'; label: string; value: string; delta?: string; deltaType?: 'up' | 'down' | 'neutral'; unit?: string; hint?: string }
  | { kind: 'table'; columns: string[]; rows: string[][]; sortable?: boolean; caption?: string }
  | { kind: 'chart'; chartType: 'line' | 'bar' | 'pie' | 'funnel'; title: string; data: unknown; xKey?: string; yKeys?: string[] }
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
  | { kind: 'confirm_action'; title: string; preview: string; actionId: string; riskLevel: AgentRiskLevel; impactSummary?: string }
  | { kind: 'action_card'; title: string; preview: string; actionId: string; riskLevel: AgentRiskLevel; impactSummary?: string }
  | { kind: 'alert'; level: 'warning' | 'critical' | 'info'; message: string; actionId?: string }
  | { kind: 'follow_up_chips'; suggestions: string[] }
  | { kind: 'document_preview'; title: string; content: string; downloadable?: boolean }
  | { kind: 'evidence_panel'; sources: string[]; dateRange?: string; metricDefinition: string; limitations?: string[] };
