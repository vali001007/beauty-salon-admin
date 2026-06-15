import type { AuraIntentSlots } from "./intentTypes";

const CUSTOMER_PREFIXES = [
  "帮我查一下",
  "帮我看一下",
  "查一下",
  "查",
  "查询",
  "搜索",
  "找",
  "看看",
  "看一下",
  "帮我看",
  "帮我查",
  "客户",
  "会员",
];
const CUSTOMER_NOISE_WORDS = [
  "今天",
  "现在",
  "一下",
  "的",
  "客户",
  "会员",
  "档案",
  "皮肤",
  "肤况",
  "上次",
  "做了什么",
  "做什么",
  "怎么样",
  "有没有",
  "预约",
];

export function normalizeCommandText(command: string) {
  return command.trim().replace(/\s+/g, " ");
}

function stripOuterPunctuation(text: string) {
  return text.replace(/^[，。、“”‘’：:；;\s]+/, "").replace(/[，。、“”‘’：:；;\s]+$/, "").trim();
}

export function extractCustomerKeyword(command: string) {
  let text = normalizeCommandText(command);
  for (const prefix of CUSTOMER_PREFIXES) {
    if (text.startsWith(prefix)) {
      text = text.slice(prefix.length).trim();
      break;
    }
  }
  text = stripOuterPunctuation(text);
  for (const word of CUSTOMER_NOISE_WORDS) {
    text = text.replaceAll(word, " ");
  }
  text = normalizeCommandText(stripOuterPunctuation(text));
  return text || undefined;
}

export function extractAmount(command: string) {
  const matched = command.match(/(?:￥|¥)?\s*(\d+(?:\.\d+)?)\s*(?:元|块)?/);
  return matched ? Number(matched[1]) : undefined;
}

export function extractCustomerPhone(command: string) {
  const matched = command.replace(/[\s-]/g, "").match(/1[3-9]\d{9}/);
  return matched?.[0];
}

export function extractPaymentMethod(command: string) {
  if (/微信|企微/.test(command)) return "wechat";
  if (/支付宝|支(?:付)?宝/.test(command)) return "alipay";
  if (/现金|现结/.test(command)) return "cash";
  if (/银行卡|刷卡|银联/.test(command)) return "card";
  if (/会员卡|储值|余额/.test(command)) return "member_balance";
  return undefined;
}

export function extractCardName(command: string) {
  const normalized = normalizeCommandText(command);
  const quoted = normalized.match(/[「《“](.+?卡|.+?套餐)[」》”]/)?.[1];
  if (quoted) return quoted;

  const matched = normalized.match(/(?:核销|扣次|消次|使用|续费|办|开|买|查)([^，。；;]*?(?:次卡|卡项|套餐|卡))/);
  return stripOuterPunctuation(matched?.[1] ?? "") || undefined;
}

export function extractProjectName(command: string) {
  const normalized = normalizeCommandText(command);
  const quoted = normalized.match(/[「《“](.+?护理|.+?项目|.+?疗程)[」》”]/)?.[1];
  if (quoted) return quoted;

  const matched = normalized.match(/(?:预约|做|体验|推荐|适合做|安排)([^，。；;]*?(?:护理|项目|疗程|清洁|补水|修护|抗衰|祛痘|肩颈))/);
  return stripOuterPunctuation(matched?.[1] ?? "") || undefined;
}

export function buildSlots(command: string): AuraIntentSlots {
  return {
    rawText: command,
    amount: extractAmount(command),
    customerName: extractCustomerKeyword(command),
    customerPhone: extractCustomerPhone(command),
    cardName: extractCardName(command),
    projectName: extractProjectName(command),
    paymentMethod: extractPaymentMethod(command),
  };
}
