import type { AuraIntentSlots } from "./intentTypes";

const CUSTOMER_PREFIXES = ["查", "查询", "搜索", "找", "客户"];

export function normalizeCommandText(command: string) {
  return command.trim().replace(/\s+/g, " ");
}

export function extractCustomerKeyword(command: string) {
  let text = normalizeCommandText(command);
  for (const prefix of CUSTOMER_PREFIXES) {
    if (text.startsWith(prefix)) {
      text = text.slice(prefix.length).trim();
      break;
    }
  }
  return text || undefined;
}

export function extractAmount(command: string) {
  const matched = command.match(/(?:￥|¥)?\s*(\d+(?:\.\d+)?)\s*(?:元|块)?/);
  return matched ? Number(matched[1]) : undefined;
}

export function buildSlots(command: string): AuraIntentSlots {
  return {
    rawText: command,
    amount: extractAmount(command),
  };
}

