import { Injectable } from '@nestjs/common';
import type { BusinessActionIntent } from './knowledge.types.js';

@Injectable()
export class ActionOntologyService {
  detect(text: string): BusinessActionIntent {
    const normalized = this.normalize(text);
    if (/链接|二维码|小程序路径|小程序码|url|地址|分享|发我|复制/.test(normalized)) return 'get_link';
    if (/打印(?!机)|小票|票据/.test(normalized)) return 'print';
    if (/草稿|生成|写一份|拟定|创建/.test(normalized)) return 'draft';
    if (/推荐|建议|适合|优先|召回|跟进|复购|激活|联系|触达|概率高|需要处理|补货/.test(normalized)) return 'recommend';
    if (/复盘|执行效果|执行情况|转化表现/.test(normalized)) return 'analyze';
    if (/确认|执行|发送|提交|批准/.test(normalized)) return 'confirm_action';
    if (/为什么|原因|诊断|风险|异常|预警|过期|流失|健康|故障|离线|失败|是否正常|不正常/.test(normalized)) return 'diagnose';
    if (/排行|排名|名单/.test(normalized)) return 'list';
    if (/分析|复盘|效果|转化|归因|表现|利用率|忙闲|空闲|占用率|核销(趋势|情况|分析|最多)/.test(normalized)) return 'analyze';
    if (/对比|相比|环比|同比|比较/.test(normalized)) return 'compare';
    if (/(有哪些|哪些|哪几个|哪几位).*(流水|订单|客户|产品|商品|活动|预约|员工|美容师|卡项|次卡|排班)/.test(normalized)) return 'list';
    if (/汇总|总额|多少|营业额|营收|收入|实收|流水|客单价|订单数|还剩|剩几次|几次|权益|到期|状态|够吗|够不够|还够/.test(normalized)) return 'summary';
    if (/清单|列表|明细|列出|列一下|找出|有哪些|哪些|有什么|哪几个|哪几位|排行|排名|名单|做得好|卖得好/.test(normalized)) return 'list';
    if (/查看|查询|查一下|查下|看看|详情|档案|情况|怎么样|如何/.test(normalized)) return 'lookup';
    return 'unknown';
  }

  private normalize(text: string) {
    return String(text || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '');
  }
}
