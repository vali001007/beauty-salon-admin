import { Injectable } from '@nestjs/common';
import { resolveAskDataDateRange } from './ask-data-free-sql.date-range.js';
import type {
  AskDataSemanticAnswerShape,
  AskDataSemanticIntent,
  AskDataSemanticIntentName,
} from './ask-data-free-sql.types.js';
import {
  ASK_DATA_DIMENSION_ALIASES,
  ASK_DATA_SEMANTIC_CONTRACTS,
  ASK_DATA_SEMANTIC_PATTERNS,
  normalizeSemanticText,
  type AskDataSemanticMetricContract,
} from './ask-data-semantic-contracts.js';
import { hasExplicitMetricCombination } from './ask-data-semantic-index.js';
import { containsAskDataExplicitThreshold } from './ask-data-number-parser.js';

export type AskDataParsedIntent = {
  semanticIntent: AskDataSemanticIntent;
  matchedContracts: Array<{ contract: AskDataSemanticMetricContract; score: number; matchedAliases: string[] }>;
};

@Injectable()
export class AskDataIntentParser {
  parse(question: string, now = new Date()): AskDataParsedIntent {
    const normalized = normalizeSemanticText(question);
    const answerShape = this.answerShape(normalized);
    const intent = this.intent(normalized, answerShape);
    const explicitCombination = hasExplicitMetricCombination(question, answerShape);
    const allMatches = ASK_DATA_SEMANTIC_CONTRACTS.map((contract) => {
      const matchedAliases = contract.aliases.filter((alias) => normalized.includes(normalizeSemanticText(alias)));
      const matchedPatterns = (ASK_DATA_SEMANTIC_PATTERNS[contract.metricKey] ?? []).filter((pattern) => pattern.test(normalized));
      const negativeAliases = contract.negativeAliases.filter((alias) => normalized.includes(normalizeSemanticText(alias)));
      const negativePatterns = contract.negativePatterns.filter((pattern) => pattern.test(normalized));
      const longest = Math.max(0, ...matchedAliases.map((alias) => normalizeSemanticText(alias).length));
      return {
        contract,
        matchedAliases,
        score:
          matchedAliases.length || matchedPatterns.length
            ? (contract.priority ?? 10) + longest * 3 + matchedAliases.length + matchedPatterns.length * 24
              - (explicitCombination ? 0 : negativeAliases.length * 80 + negativePatterns.length * 80)
            : 0,
      };
    })
      .filter((item) => item.score > 0)
      .filter((item) => !this.isShadowedProcurementDetail(item.contract.metricKey, normalized))
      .sort((left, right) => right.score - left.score || left.contract.metricKey.localeCompare(right.contract.metricKey));
    const topScore = allMatches[0]?.score ?? 0;
    const matchedContracts = explicitCombination
      ? allMatches.filter((item) => topScore - item.score <= 40).slice(0, 4)
      : allMatches.filter((item) => topScore - item.score <= 8).slice(0, 2);
    const dimensions = ASK_DATA_DIMENSION_ALIASES.filter((dimension) =>
      dimension.aliases.some((alias) => normalized.includes(normalizeSemanticText(alias))),
    ).map((dimension) => dimension.key);
    const recencyOrdering = /最近(?:入职|更新|创建|采购|执行|处理|发生)/.test(normalized);
    const timeRange = recencyOrdering ? undefined : resolveAskDataDateRange(question, now);
    const assumptions: string[] = [];
    if (/(?:最近|近期|近一个月)/.test(normalized) && timeRange?.label === '近 30 天') {
      assumptions.push('“最近”按近 30 天查询。');
    }
    if (answerShape === 'ranking' && !/(?:前|top)\s*\d+/i.test(question)) {
      assumptions.push('未指定排行数量，默认返回前 10 名。');
    }
    if (answerShape === 'trend' && !/(按日|每日|每天|按月|每月|每个月|逐月|按周|每周)/.test(normalized)) {
      const days = timeRange ? (Date.parse(timeRange.endAt) - Date.parse(timeRange.startAt)) / 86_400_000 : 30;
      assumptions.push(days <= 30 ? '未指定趋势粒度，默认按日统计。' : '未指定趋势粒度，默认按月统计。');
    }
    if (/当前|现在|目前/.test(normalized)) assumptions.push('“当前”按最新可用数据查询。');
    if (/快过生日/.test(normalized) && !/(?:未来|近|接下来)\s*\d+\s*天/.test(question)) {
      assumptions.push('“快过生日”默认查询未来 30 天。');
    }
    if (/(?:产品|商品).*(?:快过期|临期|效期)/.test(normalized) && !/(?:未来|近|接下来)\s*\d+\s*天/.test(question)) {
      assumptions.push('商品临期未指定窗口，默认查询未来 30 天。');
    }
    if (/交货最稳定|交付最稳定/.test(normalized)) assumptions.push('供应商交付稳定性按平均交付天数判断。');
    if (/(?:每个月|逐月)/.test(normalized) && timeRange?.label === '近 3 个完整自然月') {
      assumptions.push('“每个月”未指定范围，默认查询近 3 个完整自然月并按月展示。');
    }
    if (/库存消耗.*异常/.test(normalized) && /上个月|环比|相比|对比/.test(normalized)) {
      assumptions.push('库存消耗异常按所选期间与上一可比期间的变化判断，不预设金额阈值。');
    }
    if (/消费了钱.*很少用次卡/.test(normalized)) {
      assumptions.push('“很少使用次卡”按当前有效次卡且累计核销不超过 1 次判断。');
    }
    if (/消费频率.*明显下降/.test(normalized)) {
      assumptions.push('“频率明显下降”按距最近到店天数超过平均复购间隔 1.5 倍判断。');
    }
    if (/权益.*吸引力/.test(normalized)) assumptions.push('权益吸引力默认按归因转化率判断。');

    const ambiguities: AskDataSemanticIntent['ambiguities'] = [];
    if (/供应商.*性价比|性价比.*供应商/.test(normalized) && !/(?:按|根据)(?:报价|价格|交期|交付天数|价格和交期)/.test(normalized)) {
      ambiguities.push({
        slot: 'comparison_baseline',
        reason: '供应商“性价比”缺少比较标准；当前只开放报价和预计交期，没有质量评分。',
        candidates: ['按最低报价比较', '按预计交期比较', '同时展示报价和预计交期但不做综合评分'],
      });
    }
    if (/(双十一|双十二|春节|国庆|中秋|端午|元旦|五一|618)/i.test(question) && !/(?:19|20)\d{2}|今年|去年|明年/.test(question)) {
      ambiguities.push({ slot: 'year', reason: '活动或节日跨年份，年份会改变查询结果。', candidates: [] });
    }
    if (/(大额退款|大额订单|大额消费|高消费金额|高价值订单)/.test(normalized) && !this.hasExplicitThreshold(question)) {
      ambiguities.push({ slot: 'threshold', reason: '“大额/高价值”没有统一金额阈值。', candidates: [] });
    }
    if (/(?:毛利|毛利率).*(?:异常低|明显偏低|偏低)|(?:异常低|明显偏低|偏低).*(?:毛利|毛利率)/.test(normalized)
      && !this.hasExplicitThreshold(question)
      && !/上月|环比|同比|相比|对比|排名|排行|最低/.test(normalized)) {
      ambiguities.push({
        slot: 'threshold',
        reason: '贡献毛利或贡献毛利率“异常低”缺少金额、比例阈值或比较基线。',
        candidates: ['指定贡献毛利率阈值', '与上月比较', '返回贡献毛利率最低排行但不判断异常'],
      });
    }
    if (/(?:储值余额|现金余额|赠送余额).*(?:异常偏高|明显偏高)|(?:异常偏高|明显偏高).*(?:储值余额|现金余额|赠送余额)/.test(normalized)
      && !this.hasExplicitThreshold(question)) {
      ambiguities.push({
        slot: 'threshold',
        reason: '余额“异常偏高”缺少金额阈值或比较基线。',
        candidates: ['指定金额阈值', '与客户余额中位数比较', '返回余额排行但不判断异常'],
      });
    }
    if (/供应商集中度.*(?:太高|偏高|高不高|是否高)/.test(normalized) && !this.hasExplicitThreshold(question)) {
      ambiguities.push({
        slot: 'threshold',
        reason: '供应商集中度是否过高缺少集中度阈值或比较基线。',
        candidates: ['指定采购金额占比阈值', '与上期比较'],
      });
    }
    if (/(?:大量|很多).*(?:空档|空闲时段)|(?:空档|空闲时段).*(?:大量|很多)/.test(normalized)
      && !this.hasExplicitThreshold(question)) {
      ambiguities.push({
        slot: 'threshold',
        reason: '“大量空档”缺少空档容量、空档时段数或利用率阈值。',
        candidates: ['指定空档容量', '指定空档时段数', '指定利用率阈值'],
      });
    }
    if (/(?:很多|大量).*(?:差评|负面反馈)|(?:差评|负面反馈).*(?:很多|大量)/.test(normalized)
      && !this.hasExplicitThreshold(question)) {
      ambiguities.push({
        slot: 'threshold',
        reason: '“很多差评或负面反馈”缺少数量、占比或比较基线。',
        candidates: ['指定反馈数量', '指定负面反馈占比', '与上月比较'],
      });
    }
    if (/(?:退款率).*(?:正常|偏高|高不高|是否高|可疑)/.test(normalized) && !this.hasExplicitThreshold(question)) {
      ambiguities.push({
        slot: 'threshold',
        reason: '退款率是否正常或偏高缺少治理阈值或明确比较基线。',
        candidates: ['指定退款率阈值', '与上月比较', '与近 30 天平均比较'],
      });
    }
    if (/(?:库存损耗率|爽约率|核销率).*(?:正常|偏高|高不高|是否高|可疑|异常)/.test(normalized)
      && !this.hasExplicitThreshold(question)) {
      const metricLabel = normalized.includes('库存损耗率')
        ? '库存损耗率'
        : normalized.includes('爽约率')
          ? '预约爽约率'
          : '优惠券核销率';
      ambiguities.push({
        slot: 'threshold',
        reason: `${metricLabel}是否偏高缺少治理阈值或明确比较基线。`,
        candidates: [`指定${metricLabel}阈值`, '与上月比较', '与近 30 天平均比较'],
      });
    }
    if (/(?:可疑|异常).*(?:连续)?退款|(?:连续)?退款.*(?:可疑|异常)/.test(normalized) && !this.hasExplicitThreshold(question)) {
      ambiguities.push({
        slot: 'threshold',
        reason: '“可疑/异常退款”缺少连续次数、金额或时间窗口阈值。',
        candidates: ['连续退款次数', '退款金额', '观察时间窗口'],
      });
    }
    if (/(?:库存金额高|高库存金额|库存价值高|高库存价值)/.test(normalized) && !this.hasExplicitThreshold(question)) {
      ambiguities.push({ slot: 'threshold', reason: '“库存金额高”没有统一金额阈值。', candidates: [] });
    }
    if (/(?:库存金额|库存价值).*(?:太高|过高)|(?:太高|过高).*(?:库存金额|库存价值)/.test(normalized)
      && !this.hasExplicitThreshold(question)) {
      ambiguities.push({ slot: 'threshold', reason: '“库存金额太高”没有统一金额阈值。', candidates: [] });
    }
    if (/高客单价/.test(normalized) && !this.hasExplicitThreshold(question)) {
      ambiguities.push({ slot: 'threshold', reason: '“高客单价”没有统一金额阈值。', candidates: [] });
    }
    if (/(?:roi|投入产出率|投产率).*(?:偏低|太低|很低|低不低)/i.test(normalized) && !this.hasExplicitThreshold(question)) {
      ambiguities.push({ slot: 'threshold', reason: '营销 ROI 是否偏低缺少治理阈值或比较基线。', candidates: ['指定 ROI 阈值', '与上月比较'] });
    }
    if (/(?:利用率|产能利用率).*(?:过高|太高|偏高)/.test(normalized) && !this.hasExplicitThreshold(question)) {
      ambiguities.push({ slot: 'threshold', reason: '产能利用率是否过高缺少治理阈值。', candidates: ['指定利用率阈值'] });
    }
    if (/(?:耗材偏差|用量偏差|实际用量偏差).*(?:很大|太大)|(?:很大|太大).*(?:耗材偏差|用量偏差)/.test(normalized)
      && !this.hasExplicitThreshold(question)) {
      ambiguities.push({ slot: 'threshold', reason: '耗材偏差是否异常缺少偏差率阈值。', candidates: ['指定偏差率阈值'] });
    }
    if (/(?:储值余额|现金余额|赠送余额|余额).*(?:异常|不正常)/.test(normalized) && !this.hasExplicitThreshold(question)) {
      ambiguities.push({ slot: 'threshold', reason: '余额是否异常缺少金额阈值或比较基线。', candidates: ['指定金额阈值', '与余额中位数比较'] });
    }
    if (/(?:异常经营成本|经营成本异常|(?:经营|运营)?成本(?:支出|科目|金额)?(?:是不是|是否)?(?:异常|太高|过高|偏高))/.test(normalized) && !this.hasExplicitThreshold(question)) {
      ambiguities.push({ slot: 'threshold', reason: '经营成本是否异常缺少金额或变化率阈值。', candidates: ['指定金额阈值', '指定变化率阈值'] });
    }
    if (/低评分反馈.*(?:多不多|很多|偏多)/.test(normalized) && !this.hasExplicitThreshold(question)) {
      ambiguities.push({ slot: 'threshold', reason: '低评分反馈是否偏多缺少数量、占比或比较基线。', candidates: ['指定数量阈值', '指定占比阈值', '与上月比较'] });
    }
    if (/(?:交付|交货).*(?:太慢|很慢|偏慢)|(?:太慢|很慢|偏慢).*供应商/.test(normalized) && !this.hasExplicitThreshold(question)) {
      ambiguities.push({ slot: 'threshold', reason: '供应商交付是否过慢缺少交付天数阈值。', candidates: ['指定平均交付天数阈值'] });
    }
    if (/库存结构.*(?:合理|健康|正常)/.test(normalized)) {
      ambiguities.push({
        slot: 'comparison_baseline',
        reason: '“库存结构合理”缺少目标结构、历史基线或品类占比标准。',
        candidates: ['目标品类占比', '上月库存结构', '近 30 天平均结构'],
      });
    }
    if (/自动化触达失败率.*(?:高|偏高|正常|异常)/.test(normalized) && !this.hasExplicitThreshold(question)) {
      ambiguities.push({
        slot: 'threshold',
        reason: '自动化触达失败率是否偏高缺少治理阈值或比较基线。',
        candidates: ['指定失败率阈值', '与上月比较', '与近 30 天平均比较'],
      });
    }
    if (/异常成本支出|成本支出.*异常/.test(normalized) && !this.hasExplicitThreshold(question)) {
      ambiguities.push({
        slot: 'threshold',
        reason: '“异常成本支出”缺少金额、变化率或比较基线阈值。',
        candidates: ['指定金额阈值', '指定环比变化率', '与历史均值比较'],
      });
    }
    if (/(?:剩余次数还很多|还有很多余量|余量很多)/.test(normalized) && !this.hasExplicitThreshold(question)) {
      ambiguities.push({ slot: 'threshold', reason: '“剩余很多/余量很多”没有统一次数阈值。', candidates: [] });
    }
    if (/(?:长期闲置|长期空闲|长期产能浪费)/.test(normalized) && !/(?:最近|近|连续)\s*\d+\s*(?:天|周|个月)|利用率.*(?:低于|小于)\s*\d+/.test(question)) {
      ambiguities.push({ slot: 'threshold', reason: '“长期闲置”没有明确观察周期或利用率阈值。', candidates: [] });
    }
    if (/(?:跟|和|与)平时比|比平时/.test(normalized)) {
      ambiguities.push({ slot: 'comparison_baseline', reason: '“平时”没有明确比较基线，最近 7 天、30 天或上月会得出不同结论。', candidates: ['最近 7 天', '最近 30 天', '上月'] });
    }
    if (/(?:营业额|利润|业绩|转化率|产能|退款情况|roi|投入产出率|会员负债|流失风险结构|优惠活动使用率|服务完成).*(?:算好|好不好|正常|怎么样|健康|值得继续投|是否安全|安全吗|变差|差了吗)/i.test(normalized)
      && !(/(?:趋势|走势|变化)/.test(normalized)
        && !/(?:算好|好不好|正常|健康|值得继续投|是否安全|安全吗|变差|差了吗)/.test(normalized))
      && !/(?:比上月|比上周|同比|环比|与上月|和上月|最近\s*\d+\s*天)/.test(normalized)) {
      ambiguities.push({ slot: 'comparison_baseline', reason: '判断好坏、正常、安全或变差需要明确目标值或历史比较基线。', candidates: ['上月', '近 30 天平均', '业务目标值'] });
    }
    if (/(?:跟|和|与)以前比|比以前/.test(normalized)) {
      ambiguities.push({ slot: 'comparison_baseline', reason: '“以前”没有明确比较期间，选择上月、去年同期或近 30 天平均会得到不同结论。', candidates: ['上月', '去年同期', '近 30 天平均'] });
    }
    if (/(?:所有|各)?活动.*效果/.test(normalized) && !/(?:参与|转化|归因收入|营收|roi|投产|点击|触达)/i.test(normalized)) {
      ambiguities.push({
        slot: 'comparison_relation',
        reason: '“活动效果”没有说明按参与人数、转化率、归因收入还是 ROI 判断。',
        candidates: ['参与人数', '转化率', '归因收入', 'ROI'],
      });
    }
    if (/耗占比/.test(normalized)) {
      ambiguities.push({
        slot: 'comparison_relation',
        reason: '“耗占比”没有说明分子和分母，可能表示消耗量占出库量、耗材成本占收入或报废量占出库量。',
        candidates: ['消耗量占出库量', '耗材成本占收入', '报废量占出库量'],
      });
    }
    if (/采购结构(?:分析|情况|怎么样)?/.test(normalized) && !/(?:按|各)(?:供应商|状态|月份|金额)/.test(normalized)) {
      ambiguities.push({
        slot: 'comparison_relation',
        reason: '“采购结构”没有说明按供应商、采购状态还是时间维度分析。',
        candidates: ['按供应商', '按采购状态', '按月份'],
      });
    }
    if (answerShape === 'comparison' && !matchedContracts.length) {
      ambiguities.push({
        slot: 'comparison_relation',
        reason: '问题只描述了比较关系，没有说明营业额、实收、净收或其他业务指标。',
        candidates: ['营业额', '实收', '日结净收'],
      });
    }
    if (/上周某天|上星期某天/.test(normalized)) {
      ambiguities.push({ slot: 'time_point', reason: '“上周某天”没有指定具体日期，无法唯一定位流水。', candidates: [] });
    }
    if (/有个客人.*(?:预约|付款|收款|消费)|(?:预约|付款|收款|消费).*有个客人/.test(normalized)) {
      ambiguities.push({ slot: 'entity_identity', reason: '没有提供可唯一定位的客户名称或客户 ID。', candidates: [] });
    }
    if (/(?:这个|这位|有个|有)客人|她的|某个(?:客户|客人|员工|美容师|项目)|某笔|这笔|这批|某批|那个(?:商品|产品|精华|活动|优惠活动|项目|美容师|员工)|那笔|那家供应商|那张(?:卡|次卡)/.test(normalized)
      && !/有没有客人/.test(normalized)) {
      ambiguities.push({ slot: 'entity_identity', reason: '问题使用了上下文指代，但当前问数请求没有可唯一定位的对象 ID。', candidates: [] });
    }
    if (/(?:小[\p{Script=Han}]|[\p{Script=Han}]{1,2}(?:老师|小姐))(?:的|这个月|明天|国庆|最近|那天|那张)|([\p{Script=Han}])\1的/u.test(question)) {
      ambiguities.push({ slot: 'entity_identity', reason: '昵称或称谓不足以唯一定位客户或员工。', candidates: [] });
    }
    if (/美白项目做一次多久/.test(normalized)) {
      ambiguities.push({ slot: 'entity_identity', reason: '“美白项目”可能对应多个项目，需要完整项目名称或项目 ID。', candidates: [] });
    }
    if (/那天/.test(normalized) && !/(?:19|20)\d{2}[-年/]\d{1,2}|\d{1,2}月\d{1,2}日/.test(question)) {
      ambiguities.push({ slot: 'time_point', reason: '“那天”没有绑定具体日期。', candidates: [] });
    }
    if (/那个美容师.*空闲时间/.test(normalized) && !timeRange) {
      ambiguities.push({ slot: 'time_point', reason: '员工空闲时间必须绑定具体日期。', candidates: [] });
    }
    if (/(?:次卡|卡项|那张卡).*(?:快到期)|快到期.*(?:次卡|卡项|卡)/.test(normalized)
      && !/(?:未来|近|接下来)\s*\d+\s*天|\d+月\d+日/.test(question)) {
      ambiguities.push({ slot: 'threshold', reason: '“快到期”缺少到期窗口，例如未来 30 天或 60 天。', candidates: ['未来 30 天', '未来 60 天'] });
    }
    if (/我.*(?:服务(?:几|几个)小时|排班|业绩)/.test(normalized)) {
      ambiguities.push({ slot: 'entity_identity', reason: '当前问数上下文无法从“我”唯一确定员工身份。', candidates: [] });
    }
    const entities = this.entities(question);
    for (const entity of entities) {
      if (entity.mention.length <= 1 || (entity.mention.length <= 2 && /^(项目|商品|供应商)$/.test(entity.type))) {
        ambiguities.push({
          slot: 'entity_identity',
          reason: `${entity.type}名称过短，可能对应多个对象。`,
          candidates: [],
        });
      }
    }

    const deduplicatedAmbiguities = ambiguities.filter((ambiguity, index, values) =>
      values.findIndex((candidate) => candidate.slot === ambiguity.slot) === index,
    );
    const metricKeys = matchedContracts.map((item) => item.contract.metricKey);
    const confidence = this.confidence({ matchedContracts, dimensions, timeRange: Boolean(timeRange), answerShape, question });
    return {
      matchedContracts,
      semanticIntent: {
        intent,
        answerShape,
        metricKeys,
        dimensionKeys: [...new Set(dimensions)],
        entities,
        filters: this.filters(normalized),
        ...(timeRange ? { timeRange } : {}),
        ambiguities: deduplicatedAmbiguities,
        assumptions,
        confidence,
      },
    };
  }

  private answerShape(text: string): AskDataSemanticAnswerShape {
    const comparisonText = text.replace(/比较(?:好|合适|安全|敏感)/g, '');
    if (/(?:商品|产品).*(?:和|与).*(?:项目|服务).*(?:哪个|哪类|哪种).*(?:更高|更低|高|低)|(?:项目|服务).*(?:和|与).*(?:商品|产品).*(?:哪个|哪类|哪种).*(?:更高|更低|高|低)/.test(text)) {
      return 'comparison';
    }
    // A relative time phrase such as “前 30 天” is not a Top-N request.
    // Remove the time window before applying ranking markers, while keeping
    // the rest of the question (for example “前 30 天销量最高”) intact.
    const rankingText = text.replace(/前\s*[一二三四五六七八九十百\d]+\s*(?:天|日|周|个?月|季度|年)/g, '');
    const paymentMethodMentions = [/现金/, /微信/, /支付宝/, /银行卡|刷卡/, /会员余额|储值/]
      .filter((pattern) => pattern.test(text)).length;
    if (paymentMethodMentions > 1 && /(?:各|分别)/.test(text)) return 'comparison';
    if (
      /对比|比较|相比|环比|同比|跟.+比|比(?:上个月|上月|上周|昨天|去年)/.test(comparisonText)
      || (/(?:分别|各多少)/.test(text) && /和|与|以及|、|，|,/.test(text))
    ) return 'comparison';
    if (/(?:每日平均|每天平均|日均).*(?:是多少|多少|费用|成本|用量)/.test(text)) return 'scalar';
    if (/趋势|走势|变化/.test(text)) return 'trend';
    if (/按最高优先级机会类型统计|按.+(?:类型|状态|级别|职级|方向|范围).*(?:统计|汇总)/.test(text)) return 'list';
    if (/(?:首选|优选)供应商.*(?:同商品)?最低报价.*(?:差多少|差额)/.test(text)) return 'list';
    if (
      /供应商.*(?:账期|结算方式|付款条件|月结条款)/.test(text)
      && /(?:怎么|如何|约定|是什么|有哪些)/.test(text)
    ) return 'list';
    if (
      /(?:最低采购量|最小采购量|起订量|moq)/i.test(text)
      && /(?:各|每个|每种|品类|商品|产品|要求|分别)/.test(text)
      && !/(?:排行|排名|哪(?:个|家).*供应商|供应商.*哪(?:个|家)|从低到高|从高到低)/.test(text)
    ) return 'list';
    if (/排行|排名|榜前[一二三四五六七八九十\d]+|从高到低|从低到高|从短到长|从长到短|排一下|降序|升序|最高|最低|最多|最少|最大|最小|最快|最慢|最短|前[一二三四五六七八九十\d]+|top\d*|最受欢迎|最热门|卖得最好|转化最好|主要来自什么渠道|贡献.*主要营收|业绩最好|进步最快|最容易过期/.test(rankingText)) return 'ranking';
    if (/按日|每日|每天|按月|每月|每个月|逐月|按周|每周/.test(text)) return 'trend';
    if (/一共有多少|总共有多少|共多少|多少条|多少张|多少笔|多少人|合计是多少|总计是多少/.test(text) && !/(?:^|，|。)(?:各|按)|分别/.test(text)) return 'scalar';
    if (/哪些|有什么(?:产品|商品)|有没有.*(?:产品|商品)|做什么项目|哪里有|哪里还有|哪个时段|列出|列表|清单|名单|明细|记录|流水|逐笔|逐条|各个|每个|每种|每位|每家|每场|所有|都有谁|由谁|按.+统计|按.+各有多少|^各|各(?:支付|供应商|员工|美容师|门店|商品|项目|品类|类型|状态|成本科目)|找(?:一下|下)?.*客户|的客户(?:$|，|。)|下一个预约|第一笔收款|首笔收款|全部预约|基本信息|谁服务了几个客人|怎么分布/.test(text)) return 'list';
    return 'scalar';
  }

  private intent(text: string, answerShape: AskDataSemanticAnswerShape): AskDataSemanticIntentName {
    if (/为什么|原因|诊断|异常原因|怎么回事/.test(text)) return 'diagnosis';
    if (answerShape === 'ranking') return 'ranking';
    if (answerShape === 'comparison') return 'comparison';
    if (answerShape === 'trend') return 'trend';
    if (answerShape === 'list') return 'list';
    return 'query';
  }

  private confidence(input: {
    matchedContracts: AskDataParsedIntent['matchedContracts'];
    dimensions: string[];
    timeRange: boolean;
    answerShape: AskDataSemanticAnswerShape;
    question: string;
  }) {
    if (!input.matchedContracts.length) return 0.35;
    const explicitCombination = hasExplicitMetricCombination(input.question, input.answerShape);
    const topScore = input.matchedContracts[0]?.score ?? 0;
    const secondScore = input.matchedContracts[1]?.score ?? 0;
    const scoreMargin = topScore - secondScore;
    let score = input.matchedContracts.length === 1 ? 0.82 : explicitCombination ? 0.8 : 0.6;
    score += Math.min(0.1, topScore / 500);
    if (input.matchedContracts.length === 1 || scoreMargin >= 20) score += 0.05;
    if (input.matchedContracts.length > 1 && scoreMargin < 8 && !explicitCombination) score -= 0.12;
    if (input.dimensions.length) score += 0.03;
    if (input.timeRange) score += 0.03;
    if (input.answerShape !== 'scalar') score += 0.02;
    return Math.min(0.98, Number(score.toFixed(2)));
  }

  private hasExplicitThreshold(question: string) {
    return containsAskDataExplicitThreshold(question);
  }

  private isShadowedProcurementDetail(metricKey: string, question: string) {
    if (metricKey !== 'procurement_detail') return false;
    const supplierSummary = /(?:各供应商|供应商).*(?:采购次数|采购金额|平均交付天数|表现|排行|合作最多|集中度|交货最稳定|交付最稳定)/.test(question);
    const eventDetail = /采购单|采购明细|采购记录|到货|在途|结算待付款|按日|按月|每月|趋势|变化/.test(question);
    return supplierSummary && !eventDetail;
  }

  private entities(question: string): AskDataSemanticIntent['entities'] {
    const entities: AskDataSemanticIntent['entities'] = [];
    const quoted = [...question.matchAll(/(客户|会员|员工|美容师|项目|商品|供应商)?[“\"']([^”\"']{1,24})[”\"']/g)];
    for (const match of quoted) {
      const rawType = match[1] ?? 'entity';
      const type = /客户|会员/.test(rawType)
        ? '客户'
        : /员工|美容师/.test(rawType)
          ? '员工'
          : rawType || 'entity';
      entities.push({ type, mention: match[2].trim() });
    }
    const namedCustomerPatterns = [
      /(?:^|[\s，,。！？?；;])(?:帮我|请|查询|查看|查一下|查下|看看|预测|分析|告诉我)?(?:客户|会员|顾客)?([\p{Script=Han}·]{2,4})的(?:预约|会员等级|流失风险|生命周期|客户价值分层预测|储值余额|现金余额|赠送余额|余额|次卡|消费记录|消费情况|最近到店|生日)/gu,
      /(?:^|[\s，,。！？?；;])预测([\p{Script=Han}·]{2,4})的(?:流失风险|生命周期|客户价值)/gu,
      /(?:^|[\s，,。！？?；;])(?:客户|会员|顾客)?([\p{Script=Han}·]{2,4}?)(?:本周末|这周末|本周|这周|今天|明天)?有预约吗/gu,
    ];
    const reserved = new Set(['客户', '会员', '顾客', '今天', '本月', '最近', '当前', '哪些客户', '所有客户']);
    for (const pattern of namedCustomerPatterns) {
      for (const match of question.matchAll(pattern)) {
        const mention = match[1]?.replace(/^(?:客户|会员|顾客)/, '').trim();
        if (!mention || reserved.has(mention) || /(?:今天|昨天|昨日|明天|本周|上周|下周|本月|上月|下月|今年|去年|所有|全部|最近)/.test(mention)) continue;
        if (!entities.some((entity) => /^(?:customer|客户)$/.test(entity.type) && entity.mention === mention)) {
          entities.push({ type: '客户', mention });
        }
      }
    }
    const namedStaffPatterns = [
      /(?:^|[\s，,。！？?；;])(?:员工|美容师)?([\p{Script=Han}·]{2,4}?)(?:是什么职级|是什么级别)/gu,
      /(?:^|[\s，,。！？?；;])(?:员工|美容师)?([\p{Script=Han}·]{2,4}?)(?:这半年|昨天|本月|上个月|最近\s*\d+\s*天|这个季度|今年|上周)的?(?:提成|排班|业绩)/gu,
      /(?:^|[\s，,。！？?；;])(?:员工|美容师)?([\p{Script=Han}·]{2,4}?)的(?:提成|排班|业绩)/gu,
      /(?:^|[\s，,。！？?；;])(?:员工|美容师)?([\p{Script=Han}·]{2,4}?)(?:这半年|昨天|本月|上个月|最近\s*\d+\s*天|这个季度|今年|上周)有(?:几|多少)个预约/gu,
      /(?:^|[\s，,。！？?；;])(?:员工|美容师)?([\p{Script=Han}·]{2,4}?)(?:本周末|这周末|本周|这周)有(?:几|多少)个预约/gu,
      /(?:^|[\s，,。！？?；;])(?:员工|美容师)?([\p{Script=Han}·]{2,4}?)服务过的客户.*满意度/gu,
    ];
    const reservedStaff = new Set(['员工', '美容师', '今天', '昨天', '本月', '最近', '当前', '哪些', '所有', '这个月', '下午还']);
    for (const pattern of namedStaffPatterns) {
      for (const match of question.matchAll(pattern)) {
        const mention = match[1]?.replace(/^(?:员工|美容师)/, '').trim();
        if (!mention || reservedStaff.has(mention) || /(?:今天|昨天|本月|上月|最近|当前|哪些|所有|这个月|下午)/.test(mention)) continue;
        if (!entities.some((entity) => /^(?:staff|员工)$/.test(entity.type) && entity.mention === mention)) {
          entities.push({ type: '员工', mention });
        }
      }
    }
    const namedProjectPatterns = [
      /(?:^|[\s，,。！？?；;])([\p{Script=Han}A-Za-z0-9·\s]{2,24}?)(?:属于哪个项目类型|的价格是多少|做一次要多久)/gu,
    ];
    for (const pattern of namedProjectPatterns) {
      for (const match of question.matchAll(pattern)) {
        const mention = match[1]?.trim();
        if (mention && !entities.some((entity) => /^(?:project|项目)$/.test(entity.type) && entity.mention === mention)) {
          entities.push({ type: '项目', mention });
        }
      }
    }
    const namedProductPatterns = [
      /(?:^|[\s，,。！？?；;])([\p{Script=Han}A-Za-z0-9·\s]{2,24}?)(?:的安全库存是多少|现在还有多少库存)/gu,
      /(?:^|[\s，,。！？?；;])(?:今天|昨天|上周|本周|最近\s*\d+\s*天)?([\p{Script=Han}A-Za-z0-9·\s]{2,24}?)消耗了多少/gu,
    ];
    for (const pattern of namedProductPatterns) {
      for (const match of question.matchAll(pattern)) {
        const mention = match[1]?.trim();
        if (mention && !entities.some((entity) => /^(?:product|商品)$/.test(entity.type) && entity.mention === mention)) {
          entities.push({ type: '商品', mention });
        }
      }
    }
    const namedSupplierPatterns = [
      /(?:^|[\s，,。！？?；;])供应商[“"']?([^”"'，,。！？?；;]{2,24})[”"']?的(?:采购金额|采购次数|平均交付天数)/gu,
    ];
    for (const pattern of namedSupplierPatterns) {
      for (const match of question.matchAll(pattern)) {
        const mention = match[1]?.trim();
        if (mention && !entities.some((entity) => /^(?:supplier|供应商)$/.test(entity.type) && entity.mention === mention)) {
          entities.push({ type: '供应商', mention });
        }
      }
    }
    return entities;
  }

  private filters(text: string): AskDataSemanticIntent['filters'] {
    const filters: AskDataSemanticIntent['filters'] = [];
    if (/已完成/.test(text)) filters.push({ key: 'status', operator: 'eq', value: 'completed' });
    if (/未完成/.test(text)) filters.push({ key: 'status', operator: 'not_in', value: ['completed', 'received', 'done'] });
    if (/未处理|未解决/.test(text)) filters.push({ key: 'status', operator: 'in', value: ['open', 'in_progress'] });
    if (/低评分/.test(text)) filters.push({ key: 'rating', operator: 'lte', value: 2 });
    if (/缺少标准bom|标准bom缺失|标准缺失|缺少标准/.test(text)) {
      filters.push({ key: 'standard_status', operator: 'in', value: ['standard_missing', 'project_unresolved'] });
    }
    if (/偏差超过20%|偏差率超过20%|异常消耗|消耗异常/.test(text)) {
      filters.push({ key: 'is_abnormal', operator: 'eq', value: true });
    }
    const inactiveDays = text.match(/(\d{1,3})\s*天没来/);
    if (inactiveDays) filters.push({ key: 'days_since_last_visit', operator: 'gte', value: Number(inactiveDays[1]) });
    if (/三个月没来/.test(text)) filters.push({ key: 'days_since_last_visit', operator: 'gte', value: 90 });
    if (/快过生日/.test(text)) filters.push({ key: 'days_until_birthday', operator: 'between', value: [0, 30] });
    if (/新客/.test(text) && !/老客/.test(text)) filters.push({ key: 'customer_status', operator: 'eq', value: 'new' });
    if (/老客|回头客/.test(text) && !/新客/.test(text)) filters.push({ key: 'customer_status', operator: 'in', value: ['repeat', 'inactive'] });
    if (/(?:办了卡|开了次卡|买了次卡).*(?:没预约|不来|没使用)/.test(text)) {
      filters.push({ key: 'unused_card_count', operator: 'gt', value: 0 });
    }
    if (/次数快用完/.test(text)) filters.push({ key: 'low_remaining_card_count', operator: 'gt', value: 0 });
    const hasInbound = /调入|待接收/.test(text);
    const hasOutbound = /调出/.test(text);
    if (hasInbound && !hasOutbound) filters.push({ key: 'direction', operator: 'eq', value: 'inbound' });
    if (hasOutbound && !hasInbound) filters.push({ key: 'direction', operator: 'eq', value: 'outbound' });
    const hasGlobalOffer = /全局优惠/.test(text);
    const hasStoreOffer = /门店优惠/.test(text);
    if (hasGlobalOffer && !hasStoreOffer) filters.push({ key: 'scope_type', operator: 'eq', value: 'global' });
    return filters;
  }
}
