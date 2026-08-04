const CHINESE_DIGITS: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

const CHINESE_UNITS: Record<string, number> = {
  十: 10,
  百: 100,
  千: 1_000,
  万: 10_000,
};

export function parseAskDataNumber(value: string): number | undefined {
  const normalized = value.trim().replace(/[,，\s]/g, '');
  if (!normalized) return undefined;
  if (/^\d+(?:\.\d+)?$/.test(normalized)) return Number(normalized);
  if (!/^[零〇一二两三四五六七八九十百千万]+$/.test(normalized)) return undefined;

  let total = 0;
  let section = 0;
  let digit = 0;
  for (const character of normalized) {
    if (character in CHINESE_DIGITS) {
      digit = CHINESE_DIGITS[character];
      continue;
    }
    const unit = CHINESE_UNITS[character];
    if (!unit) return undefined;
    if (unit === 10_000) {
      section += digit;
      total += (section || 1) * unit;
      section = 0;
      digit = 0;
      continue;
    }
    section += (digit || 1) * unit;
    digit = 0;
  }
  return total + section + digit;
}

export function containsAskDataExplicitThreshold(question: string) {
  return /(?:大于|超过|高于|不少于|至少|不超过|低于|小于|<=?|>=?|￥|¥)\s*(?:\d+(?:\.\d+)?|[零〇一二两三四五六七八九十百千万]+)\s*(?:元|块|万|件|次|天|分钟)?|\d+(?:\.\d+)?\s*%|百分之[零一二三四五六七八九十百两\d]+/i.test(question);
}

export function extractAskDataGreaterThanThreshold(question: string, subject: RegExp) {
  const match = question.match(new RegExp(`${subject.source}(?:\s*)(?:大于|超过|高于|不少于|至少)\\s*(\\d+(?:\\.\\d+)?|[零〇一二两三四五六七八九十百千万]+)`, subject.flags.replace('g', '')));
  if (!match?.[1]) return undefined;
  const value = parseAskDataNumber(match[1]);
  if (value === undefined) return undefined;
  return {
    operator: /(?:不少于|至少)/.test(match[0]) ? 'gte' as const : 'gt' as const,
    value,
  };
}
