import { Injectable } from '@nestjs/common';

export type SemanticDimensionDefinition = {
  key: string;
  label: string;
  description: string;
  source: string[];
  sensitive: boolean;
};

@Injectable()
export class DimensionRegistryService {
  private readonly dimensions: SemanticDimensionDefinition[] = [
    { key: 'date', label: '日期', description: '按日期聚合趋势。', source: ['createdAt', 'paidAt', 'verifiedAt', 'date'], sensitive: false },
    { key: 'productId', label: '商品', description: '商品 ID。', source: ['Product.id', 'OrderItem.itemId'], sensitive: false },
    { key: 'productName', label: '商品名称', description: '商品名称。', source: ['Product.name', 'OrderItem.name'], sensitive: false },
    { key: 'projectId', label: '项目', description: '项目 ID。', source: ['Project.id', 'OrderItem.itemId'], sensitive: false },
    { key: 'projectName', label: '项目名称', description: '项目名称。', source: ['Project.name', 'OrderItem.name'], sensitive: false },
    { key: 'customerId', label: '客户', description: '客户 ID。', source: ['Customer.id'], sensitive: true },
    { key: 'customerName', label: '客户姓名', description: '客户姓名。', source: ['Customer.name'], sensitive: true },
    { key: 'beauticianId', label: '员工', description: '美容师 ID。', source: ['Beautician.id'], sensitive: true },
    { key: 'beauticianName', label: '员工姓名', description: '美容师姓名。', source: ['Beautician.name'], sensitive: false },
    { key: 'storeId', label: '门店', description: '门店 ID。', source: ['Store.id'], sensitive: true },
    { key: 'storeName', label: '门店名称', description: '门店名称。', source: ['Store.name'], sensitive: false },
    { key: 'cardId', label: '卡项', description: '卡项 ID。', source: ['Card.id', 'CustomerCard.cardId'], sensitive: false },
    { key: 'cardName', label: '卡项名称', description: '卡项名称。', source: ['Card.name', 'CustomerCard.cardName'], sensitive: false },
    { key: 'campaignId', label: '活动', description: '营销活动 ID。', source: ['MarketingActivity.id'], sensitive: false },
    { key: 'campaignName', label: '活动名称', description: '营销活动名称。', source: ['MarketingActivity.name'], sensitive: false },
    { key: 'payMethod', label: '支付方式', description: '订单或支付记录的支付方式。', source: ['ProductOrder.payMethod', 'PaymentRecord.method'], sensitive: false },
    { key: 'channel', label: '渠道', description: '小程序、营销页或活动来源渠道。', source: ['CustomerAppEvent.channel', 'MarketingPageEvent.source'], sensitive: false },
  ];

  list() {
    return [...this.dimensions];
  }

  findByKey(key: string) {
    return this.dimensions.find((dimension) => dimension.key === key);
  }

  allKnown(keys: string[]) {
    return keys.every((key) => Boolean(this.findByKey(key)));
  }
}
