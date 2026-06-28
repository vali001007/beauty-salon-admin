import type { AuraPayload } from "../microApps/microAppTypes";
import type { Message } from "../types";

export interface TerminalFactGroup<TItem = Record<string, unknown>> {
  source: string;
  updatedAt: string;
  items: TItem[];
  limitations: string[];
}

export interface TerminalFactContext {
  store: TerminalFactGroup;
  operator: TerminalFactGroup;
  recentEntities: TerminalFactGroup;
  inventory: TerminalFactGroup;
  customers: TerminalFactGroup;
  orders: TerminalFactGroup;
  appointments: TerminalFactGroup;
  cards: TerminalFactGroup;
  device: TerminalFactGroup;
}

export interface TerminalFactContextOptions {
  store?: object | null;
  operator?: object | null;
  device?: object | null;
  maxItems?: number;
  now?: Date;
}

type FactBucket = keyof TerminalFactContext;

const DEFAULT_MAX_ITEMS = 20;

const SENSITIVE_KEYS = new Set([
  "address",
  "birthday",
  "customerPhone",
  "email",
  "landline",
  "phone",
  "remark",
  "wechat",
  "workplace",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function toIso(value: unknown, fallback: string) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) return value;
  return fallback;
}

function maskPhone(value: unknown) {
  const text = String(value ?? "").replace(/\D/g, "");
  if (text.length < 7) return undefined;
  return `${text.slice(0, 3)}****${text.slice(-4)}`;
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, 8).map(sanitizeValue);
  if (!isRecord(value)) return value;

  const next: Record<string, unknown> = {};
  Object.entries(value).forEach(([key, raw]) => {
    if (SENSITIVE_KEYS.has(key)) {
      const masked = maskPhone(raw);
      if (masked) next[`${key}Masked`] = masked;
      return;
    }
    if (raw instanceof Date || typeof raw !== "object" || raw === null) {
      next[key] = raw;
      return;
    }
    if (Array.isArray(raw)) {
      next[key] = raw.slice(0, 8).map((item) => (isRecord(item) ? sanitizeKnownRecord(item) : item));
    }
  });
  return next;
}

function sanitizeKnownRecord(record: Record<string, unknown>) {
  return sanitizeValue(record) as Record<string, unknown>;
}

function createGroup(source: string, updatedAt: string): TerminalFactGroup {
  return {
    source,
    updatedAt,
    items: [],
    limitations: ["仅包含终端最近会话和已加载卡片中的结构化事实。"],
  };
}

function pushItem(
  group: TerminalFactGroup,
  item: Record<string, unknown>,
  maxItems: number,
  meta: { kind: string; source: string; updatedAt: string },
) {
  if (group.items.length >= maxItems) {
    if (!group.limitations.includes(`超过 ${maxItems} 条时已截断。`)) {
      group.limitations.push(`超过 ${maxItems} 条时已截断。`);
    }
    return;
  }

  group.items.push({
    kind: meta.kind,
    source: meta.source,
    updatedAt: meta.updatedAt,
    ...sanitizeKnownRecord(item),
  });
}

function addInventoryFacts(context: TerminalFactContext, data: Record<string, unknown>, maxItems: number, updatedAt: string) {
  asArray<Record<string, unknown>>(data.lowStock).forEach((item) => {
    pushItem(context.inventory, item, maxItems, { kind: "low_stock", source: "InventoryAlertsCard.lowStock", updatedAt });
  });
  asArray<Record<string, unknown>>(data.expiring).forEach((item) => {
    pushItem(context.inventory, item, maxItems, { kind: "expiring_inventory", source: "InventoryAlertsCard.expiring", updatedAt });
  });
  asArray<Record<string, unknown>>(data.replenishment).forEach((item) => {
    pushItem(context.inventory, item, maxItems, { kind: "replenishment", source: "InventoryAlertsCard.replenishment", updatedAt });
  });
}

function addCustomerFacts(context: TerminalFactContext, data: Record<string, unknown>, maxItems: number, updatedAt: string) {
  const directCustomer = isRecord(data.customer) ? data.customer : null;
  if (directCustomer) {
    pushItem(context.customers, directCustomer, maxItems, { kind: "customer_card", source: "CustomerProfileCard.customer", updatedAt });
  }

  asArray<Record<string, unknown>>(data.items).forEach((item) => {
    const customer = isRecord(item.customer) ? item.customer : item;
    pushItem(context.customers, customer, maxItems, { kind: "customer_item", source: "CustomerList.items", updatedAt });
  });
}

function addAppointmentFacts(context: TerminalFactContext, data: Record<string, unknown>, maxItems: number, updatedAt: string) {
  asArray<Record<string, unknown>>(data.items).forEach((item) => {
    pushItem(context.appointments, item, maxItems, { kind: "appointment", source: "AppointmentCard.items", updatedAt });
  });
}

function addCardFacts(context: TerminalFactContext, data: Record<string, unknown>, maxItems: number, updatedAt: string) {
  asArray<Record<string, unknown>>(data.customers).forEach((item) => {
    pushItem(context.cards, item, maxItems, { kind: "card_customer", source: "CardFlow.customers", updatedAt });
  });
  asArray<Record<string, unknown>>(data.cards).forEach((item) => {
    pushItem(context.cards, item, maxItems, { kind: "card_option", source: "CardOpening.cards", updatedAt });
  });
}

function addPayloadFacts(context: TerminalFactContext, payload: AuraPayload, maxItems: number, updatedAt: string) {
  if (!isRecord(payload.data)) return;
  const data = payload.data;

  if (payload.kind === "inventory") addInventoryFacts(context, data, maxItems, updatedAt);
  if (payload.kind === "customer" || payload.kind === "growth" || payload.kind === "followUpTasks" || payload.kind === "beauticianCustomers") {
    addCustomerFacts(context, data, maxItems, updatedAt);
  }
  if (payload.kind === "reception") addAppointmentFacts(context, data, maxItems, updatedAt);
  if (payload.kind === "cardVerification" || payload.kind === "cardOpening" || payload.kind === "recharge") {
    addCardFacts(context, data, maxItems, updatedAt);
  }
}

export function buildTerminalFactContext(messages: Message[], options: TerminalFactContextOptions = {}): TerminalFactContext {
  const updatedAt = (options.now ?? new Date()).toISOString();
  const maxItems = Math.max(1, Math.min(options.maxItems ?? DEFAULT_MAX_ITEMS, DEFAULT_MAX_ITEMS));
  const context: TerminalFactContext = {
    store: createGroup("Terminal.store", updatedAt),
    operator: createGroup("Terminal.operator", updatedAt),
    recentEntities: createGroup("Terminal.recentEntities", updatedAt),
    inventory: createGroup("Terminal.inventory", updatedAt),
    customers: createGroup("Terminal.customers", updatedAt),
    orders: createGroup("Terminal.orders", updatedAt),
    appointments: createGroup("Terminal.appointments", updatedAt),
    cards: createGroup("Terminal.cards", updatedAt),
    device: createGroup("Terminal.device", updatedAt),
  };

  if (options.store) pushItem(context.store, options.store as Record<string, unknown>, 1, { kind: "store", source: "TerminalBootstrap.currentStore", updatedAt });
  if (options.operator) pushItem(context.operator, options.operator as Record<string, unknown>, 1, { kind: "operator", source: "TerminalBootstrap.currentUser", updatedAt });
  if (options.device) pushItem(context.device, options.device as Record<string, unknown>, 1, { kind: "device", source: "Terminal.runtime", updatedAt });

  messages.forEach((message) => {
    const payload = message.payload as AuraPayload | undefined;
    if (!payload || !isRecord(payload)) return;
    addPayloadFacts(context, payload, maxItems, toIso(message.timestamp, updatedAt));
  });

  return context;
}
