export function extractCustomerPhoneTail(message: string): string | undefined {
  return message.match(/(?:尾号|手机尾号|手机号后四位|手机后四位)[^0-9]*(\d{4})/)?.[1];
}

export function extractSpecificCustomerNameFromMention(mention: string): string | undefined {
  const nameOnly = mention
    .trim()
    .replace(/[（(][^）)]*(?:手机|号码|尾号|后四位)[^）)]*[）)]/g, '')
    .trim();
  if (
    !nameOnly ||
    /(客户|顾客|老客|新客|会员|客群|人群|消费者|用户|手机|号码|尾号|后四位|\d{4})/.test(nameOnly)
  ) {
    return undefined;
  }
  return nameOnly;
}
