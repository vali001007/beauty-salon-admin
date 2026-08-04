export function extractCustomerPhoneTail(message: string): string | undefined {
  return message.match(/(?:尾号|手机尾号|手机号后四位|手机后四位)[^0-9]*(\d{4})/)?.[1];
}

export function extractSpecificCustomerNameFromMention(mention: string): string | undefined {
  const nameOnly = mention
    .trim()
    .replace(/[（(][^）)]*(?:手机|号码|尾号|后四位)[^）)]*[）)]/g, '')
    .replace(/[，,\s]*(?:手机|手机号)?(?:尾号|后四位)(?:是|为)?[^0-9]*\d{4}.*$/g, '')
    .replace(/^(?:客户|顾客|客人|会员)(?:叫|是|为)?/u, '')
    .trim();
  if (
    !nameOnly ||
    /(客户|顾客|老客|新客|会员|客群|人群|消费者|用户|手机|号码|尾号|后四位|\d{4}|高价值|高净值|潜力|沉睡|流失|活跃|不活跃|过敏|健康档案|金卡|银卡|钻石|普通会员|VIP)/i.test(
      nameOnly,
    )
  ) {
    return undefined;
  }
  return nameOnly;
}
