import { Injectable } from '@nestjs/common';
import { BUSINESS_OBJECT_CATALOG, FIELD_DISPLAY_NAME_MAP, getBusinessObjectDefinition } from './business-object.catalog.js';
import { SCHEMA_GRAPH_GENERATED_MODELS } from './generated/schema-graph.generated.js';
import type { BusinessObjectType } from './knowledge.types.js';
import type { SchemaGraphNode, SchemaGraphRelation } from './schema-graph.types.js';

const STATIC_RELATIONS: SchemaGraphRelation[] = [
  {
    fromModel: 'ProductOrder',
    toModel: 'OrderItem',
    relationType: 'one_to_many',
    joinFields: [{ from: 'id', to: 'orderId' }],
    businessMeaning: '订单与订单明细关联，用于查询收银、项目、商品和办卡明细。',
  },
  {
    fromModel: 'ProductOrder',
    toModel: 'PaymentRecord',
    relationType: 'one_to_many',
    joinFields: [{ from: 'id', to: 'orderId' }],
    businessMeaning: '订单与支付记录关联，用于查询实收、支付方式和对账。',
  },
  {
    fromModel: 'ProductOrder',
    toModel: 'RefundRecord',
    relationType: 'one_to_many',
    joinFields: [{ from: 'id', to: 'orderId' }],
    businessMeaning: '订单与退款记录关联，用于查询退款、退费和售后风险。',
  },
  {
    fromModel: 'CustomerCard',
    toModel: 'CardUsageRecord',
    relationType: 'one_to_many',
    joinFields: [{ from: 'id', to: 'customerCardId' }],
    businessMeaning: '客户卡项与核销记录关联，用于查询剩余次数、核销明细和权益承接。',
  },
  {
    fromModel: 'ProductOrder',
    toModel: 'CustomerCard',
    relationType: 'one_to_many',
    joinFields: [{ from: 'id', to: 'sourceOrderId' }],
    businessMeaning: '办卡订单与客户卡项关联，用于从订单追溯卡项资产。',
  },
  {
    fromModel: 'MarketingActivity',
    toModel: 'MarketingPage',
    relationType: 'one_to_many',
    joinFields: [{ from: 'id', to: 'activityId' }],
    businessMeaning: '一个营销活动可以生成多个推广页，用于查询活动链接、小程序路径和二维码。',
  },
  {
    fromModel: 'MarketingActivity',
    toModel: 'MarketingPage',
    relationType: 'logical',
    joinFields: [{ from: 'id', to: 'sourceId' }],
    businessMeaning: '历史推广页可能通过 sourceType/sourceId 逻辑关联活动。',
  },
  {
    fromModel: 'Customer',
    toModel: 'CustomerCard',
    relationType: 'one_to_many',
    joinFields: [{ from: 'id', to: 'customerId' }],
    businessMeaning: '客户与持有卡项、权益和余额关联。',
  },
  {
    fromModel: 'Customer',
    toModel: 'Reservation',
    relationType: 'one_to_many',
    joinFields: [{ from: 'id', to: 'customerId' }],
    businessMeaning: '客户与预约记录关联，用于查询客户今日/近期预约。',
  },
  {
    fromModel: 'Product',
    toModel: 'ProductOrder',
    relationType: 'logical',
    joinFields: [{ from: 'id', to: 'items.productId' }],
    businessMeaning: '商品通过订单明细统计销量、收入和复购。',
  },
  {
    fromModel: 'Product',
    toModel: 'StockBatch',
    relationType: 'one_to_many',
    joinFields: [{ from: 'id', to: 'productId' }],
    businessMeaning: '商品与库存批次关联，用于查询临期、批次库存和补货风险。',
  },
  {
    fromModel: 'Product',
    toModel: 'StockMovement',
    relationType: 'one_to_many',
    joinFields: [{ from: 'id', to: 'productId' }],
    businessMeaning: '商品与库存流水关联，用于查询出入库、调拨和耗材消耗。',
  },
  {
    fromModel: 'Project',
    toModel: 'ServiceTask',
    relationType: 'logical',
    joinFields: [{ from: 'id', to: 'projectId' }],
    businessMeaning: '护理项目通过服务任务统计服务次数、服务收入和趋势。',
  },
  {
    fromModel: 'Project',
    toModel: 'Reservation',
    relationType: 'one_to_many',
    joinFields: [{ from: 'id', to: 'projectId' }],
    businessMeaning: '护理项目与预约关联，用于查询项目预约和到店承接。',
  },
  {
    fromModel: 'Beautician',
    toModel: 'Schedule',
    relationType: 'one_to_many',
    joinFields: [{ from: 'id', to: 'beauticianId' }],
    businessMeaning: '美容师与排班、忙闲时段关联。',
  },
  {
    fromModel: 'Beautician',
    toModel: 'ServiceTask',
    relationType: 'one_to_many',
    joinFields: [{ from: 'id', to: 'beauticianId' }],
    businessMeaning: '美容师与服务任务关联，用于查询服务量、服务收入和绩效。',
  },
];

@Injectable()
export class SchemaGraphService {
  listNodes(): SchemaGraphNode[] {
    const generatedByModel = new Map(SCHEMA_GRAPH_GENERATED_MODELS.map((node) => [node.modelName, node]));
    return BUSINESS_OBJECT_CATALOG.flatMap((object) =>
      object.sourceModels.map((modelName) => {
        const generated = generatedByModel.get(modelName);
        return {
          modelName,
          objectType: object.objectType,
          displayName: object.displayName,
          description: object.description,
          storeScoped: generated?.storeScoped ?? this.isStoreScoped(modelName),
          sourceModels: object.sourceModels,
          fields: generated
            ? generated.fields.map((field) => ({
                ...field,
                displayName: object.displayFields[field.name] ?? field.displayName,
                queryable: object.queryableFields.includes(field.name) || field.queryable,
                displayable: Boolean(object.displayFields[field.name]) || field.displayable,
                sensitive: field.sensitive ?? this.isSensitiveField(field.name),
              }))
            : object.queryableFields.map((field) => ({
                name: field,
                displayName: object.displayFields[field] ?? FIELD_DISPLAY_NAME_MAP[field] ?? this.humanizeField(field),
                type: 'unknown',
                queryable: true,
                displayable: Boolean(object.displayFields[field]),
                sensitive: this.isSensitiveField(field),
              })),
          relations: this.relationsForModel(modelName),
        };
      }),
    );
  }

  listGeneratedNodes() {
    return [...SCHEMA_GRAPH_GENERATED_MODELS];
  }

  getNode(modelName: string) {
    return this.listNodes().find((node) => node.modelName === modelName);
  }

  getObjectDefinition(objectType: BusinessObjectType) {
    return getBusinessObjectDefinition(objectType);
  }

  relationsForModel(modelName: string) {
    const generated = SCHEMA_GRAPH_GENERATED_MODELS.find((node) => node.modelName === modelName)?.relations ?? [];
    const merged = [...STATIC_RELATIONS, ...generated];
    return this.uniqueRelations(merged.filter((relation) => relation.fromModel === modelName || relation.toModel === modelName));
  }

  findPath(fromModel: string, toModel: string) {
    return this.relationsForModel(fromModel).filter((relation) => relation.fromModel === fromModel && relation.toModel === toModel);
  }

  displayNameForField(field: string) {
    return FIELD_DISPLAY_NAME_MAP[field] ?? this.humanizeField(field);
  }

  private isStoreScoped(modelName: string) {
    return !['MarketingActivity'].includes(modelName);
  }

  private isSensitiveField(field: string) {
    return /phone|mobile|idcard|password|token|secret/i.test(field);
  }

  private humanizeField(field: string) {
    if (field === 'id') return 'ID';
    return field
      .replace(/Id$/, 'ID')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/^./, (char) => char.toUpperCase());
  }

  private uniqueRelations(relations: SchemaGraphRelation[]) {
    const seen = new Set<string>();
    return relations.filter((relation) => {
      const key = `${relation.fromModel}->${relation.toModel}:${relation.joinFields.map((field) => `${field.from}:${field.to}`).join(',')}:${relation.relationType}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
