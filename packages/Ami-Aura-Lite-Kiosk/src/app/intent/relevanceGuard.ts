const BEAUTY_KEYWORDS =
  /客户|会员|预约|排班|收银|开单|买单|结账|充值|办卡|开卡|核销|扣次|次卡|库存|商品|产品|耗材|项目|服务|护理|美容|皮肤|肤况|面部|身体|头发|美甲|美睫|顾问|美容师|员工|技师|门店|店里|经营|营业|业绩|订单|退款|优惠|活动|提成|回访|流失|沉睡|档案|建档|登记|小票|打印|收款|支付/;

const OFF_TOPIC_PATTERNS =
  /天气|新闻|股票|基金|写诗|写首诗|作文|作业|讲笑话|笑话|编程|代码|翻译.*英文|英文翻译|历史人物|政治|体育赛事|游戏攻略|做饭|菜谱|食谱|旅游攻略|星座|彩票|电影|电视剧|宇宙的尽头/;

const BUSINESS_SHORTCUTS =
  /^(收银|开单|办卡|开卡|充值|核销|扣次|预约|排班|库存|业绩|客户|会员|建档|登记|打印|小票|提成|回访)$/;

export const OFF_TOPIC_REPLY = "抱歉，该问题与本门店业务无关，暂时无法回复。";

export function isBusinessRelevant(command: string): boolean {
  const text = command.trim();
  if (!text) return true;
  if (BUSINESS_SHORTCUTS.test(text)) return true;
  if (OFF_TOPIC_PATTERNS.test(text) && !BEAUTY_KEYWORDS.test(text)) return false;
  if (BEAUTY_KEYWORDS.test(text)) return true;
  if (text.length <= 4) return true;
  return true;
}
