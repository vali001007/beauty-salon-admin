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
    /(客户|顾客|老客|新客|会员|客群|人群|消费者|用户|手机|号码|尾号|后四位|\d{4}|高价值|高净值|潜力|沉睡|流失|活跃|不活跃|过敏|健康档案|金卡|银卡|钻石|普通会员|VIP|多少|几个|几位|哪些|什么|有没有|是否|情况|人数|数量|合计|总数|统计)/i.test(
      nameOnly,
    )
  ) {
    return undefined;
  }
  return nameOnly;
}

const GENERIC_CUSTOMER_SCOPE = /^(?:全店|本店|门店|所有|全部|全体|整体|本月|上月|本周|上周|今天|昨天|近期|最近)$/u;
const INVALID_CUSTOMER_NAME_PHRASE =
  /^(?:的|说|当前|今天|明天|后天|本周|上周|本月|上月)|(?:说她叫|说他叫|她叫|他叫|这个|那个|这位|那位)/u;
const SPECIFIC_CUSTOMER_READ_ONLY_SIGNAL =
  /(?:累计|总共|一共)?消费|上次|最近|到店|来店|会员等级|办过卡|卡项|还有多少次|余额|来源|渠道|标签|备注|服务记录|做过|做的什么项目|过敏|皮肤|注意事项|生命周期价值|LTV|适合.*(?:推荐|项目)|推荐.*项目/iu;
const EXPLICIT_CUSTOMER_SIDE_EFFECT_SIGNAL =
  /(?:创建|新建|新增|添加|修改|更新|删除|取消|核销|扣次|划扣|退款|发送|群发|发放|发布|保存|提交|下单|采购|调货|充值|改约|改期)/u;

export function extractSpecificCustomerNameFromQuestion(message: string): string | undefined {
  const text = message.trim();
  const patterns = [
    /(?:预测|预估)([\u3400-\u9fff·]{2,5}?)(?:的)?(?=(?:12个月|十二个月).*(?:生命周期价值|LTV))/iu,
    /(?:她|他)?叫([\u3400-\u9fff·]{2,5}?)(?=，|,|。|\s|$)/u,
    /^(?:请|麻烦|帮我)?(?:查一下|查查|查询|看一下|看看|找一下|搜一下)?(?:客户|顾客|客人|会员)?(?:叫|是|为)?([\u3400-\u9fff·]{2,5}?)(?=(?:的)?(?:(?:累计|总共|一共)?消费|上次|最近|到店|来店|会员等级|办过卡|卡项|还有多少次|余额|来源|渠道|标签|备注|服务记录|做过|做的什么项目|是从|来自|适合|推荐))/u,
    /(?:客户|顾客|客人|会员)(?:叫|是|为)?([\u3400-\u9fff·]{2,5}?)(?=(?:的)?(?:累计|消费|上次|最近|到店|来店|会员等级|余额|来源|渠道|标签|备注|服务记录|适合|推荐|，|,|。|\s|$))/u,
    /(?:查一下|查查|查询|看一下|看看|找一下|搜一下)(?:客户|顾客|客人|会员)?([\u3400-\u9fff·]{2,5}?)(?=的|，|,|。|\s|$)/u,
  ];
  for (const pattern of patterns) {
    const candidate = text.match(pattern)?.[1]?.trim();
    if (!candidate || GENERIC_CUSTOMER_SCOPE.test(candidate) || INVALID_CUSTOMER_NAME_PHRASE.test(candidate)) continue;
    const name = extractSpecificCustomerNameFromMention(candidate);
    if (name) return name;
  }
  return undefined;
}

export function isSpecificCustomerProjectRecommendationQuestion(message: string): boolean {
  return /(?:适合.*(?:推荐|项目)|推荐.*(?:什么|哪个|哪些|适合).*(?:项目|护理)|(?:什么|哪个|哪些)项目.*(?:适合|推荐))/u.test(
    message,
  );
}

export function isSpecificCustomerReadOnlyQuestion(message: string): boolean {
  const hasIdentity = Boolean(extractSpecificCustomerNameFromQuestion(message) || extractCustomerPhoneTail(message));
  return (
    hasIdentity &&
    SPECIFIC_CUSTOMER_READ_ONLY_SIGNAL.test(message) &&
    !EXPLICIT_CUSTOMER_SIDE_EFFECT_SIGNAL.test(message)
  );
}
