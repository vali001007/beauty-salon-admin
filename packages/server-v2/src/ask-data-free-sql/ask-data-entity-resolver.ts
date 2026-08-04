import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ReadOnlySqlView } from '../read-only-sql-kernel/read-only-sql-kernel.types.js';
import type { AskDataSemanticIntent } from './ask-data-free-sql.types.js';

export type AskDataResolvedEntityFilter = {
  entityType: string;
  mention: string;
  viewName: string;
  field: string;
  operator: 'eq';
  value: string | number;
  resolution: 'id' | 'exact_name';
};

export type AskDataNamedEntityResolution = {
  semanticIntent: AskDataSemanticIntent;
  clarificationQuestion?: string;
  clarificationReason?: string;
};

const ENTITY_FIELDS: Record<string, { ids: string[]; names: string[] }> = {
  customer: { ids: ['customer_id'], names: ['customer_name_masked'] },
  客户: { ids: ['customer_id'], names: ['customer_name_masked'] },
  staff: { ids: ['staff_id', 'beautician_id'], names: ['staff_name', 'beautician_name'] },
  员工: { ids: ['staff_id', 'beautician_id'], names: ['staff_name', 'beautician_name'] },
  project: { ids: ['project_id'], names: ['project_name'] },
  项目: { ids: ['project_id'], names: ['project_name'] },
  product: { ids: ['product_id'], names: ['product_name', 'sku'] },
  商品: { ids: ['product_id'], names: ['product_name', 'sku'] },
  supplier: { ids: ['supplier_id'], names: ['supplier_name'] },
  供应商: { ids: ['supplier_id'], names: ['supplier_name'] },
};

export function resolveAskDataEntities(intent: AskDataSemanticIntent, views: ReadOnlySqlView[]) {
  const resolved: AskDataResolvedEntityFilter[] = [];
  for (const entity of intent.entities) {
    const fieldOptions = ENTITY_FIELDS[entity.type];
    if (!fieldOptions) continue;
    const resolvedValue = entity.resolvedValue?.trim();
    const numericId = resolvedValue?.match(/^\d+$/)?.[0]
      ?? entity.mention.match(/^(?:id[:：#\s]*)?(\d+)$/i)?.[1];
    for (const view of views) {
      const allowedFields = new Set(view.fields.filter((field) => field.policy !== 'deny').map((field) => field.name));
      const field = (numericId ? fieldOptions.ids : fieldOptions.names).find((candidate) => allowedFields.has(candidate));
      if (!field) continue;
      resolved.push({
        entityType: entity.type,
        mention: entity.mention,
        viewName: view.viewName,
        field,
        operator: 'eq',
        value: numericId ? Number(numericId) : entity.mention,
        resolution: numericId ? 'id' : 'exact_name',
      });
      break;
    }
  }
  return resolved;
}

@Injectable()
export class AskDataNamedEntityResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(intent: AskDataSemanticIntent, storeId: number): Promise<AskDataNamedEntityResolution> {
    let entities = [...intent.entities];
    for (let index = 0; index < entities.length; index += 1) {
      const entity = entities[index];
      if (entity.resolvedValue) continue;
      const entityKind = /^(?:customer|客户)$/.test(entity.type)
        ? 'customer'
        : /^(?:staff|员工)$/.test(entity.type)
          ? 'staff'
          : /^(?:project|项目)$/.test(entity.type)
            ? 'project'
            : /^(?:product|商品)$/.test(entity.type)
              ? 'product'
              : /^(?:supplier|供应商)$/.test(entity.type)
                ? 'supplier'
          : undefined;
      if (!entityKind) continue;
      const matches = entityKind === 'customer'
        ? await this.prisma.customer.findMany({ where: { storeId, deletedAt: null, name: entity.mention }, select: { id: true }, orderBy: { id: 'asc' }, take: 2 })
        : entityKind === 'staff'
          ? await this.prisma.beautician.findMany({ where: { storeId, name: entity.mention }, select: { id: true }, orderBy: { id: 'asc' }, take: 2 })
          : entityKind === 'project'
            ? await this.prisma.project.findMany({ where: { storeId, deletedAt: null, name: entity.mention }, select: { id: true }, orderBy: { id: 'asc' }, take: 2 })
            : entityKind === 'product'
              ? await this.prisma.product.findMany({ where: { storeId, deletedAt: null, name: entity.mention }, select: { id: true }, orderBy: { id: 'asc' }, take: 2 })
              : await this.prisma.supplySupplier.findMany({
                where: { deletedAt: null, name: entity.mention, orders: { some: { storeId } } },
                select: { id: true },
                orderBy: { id: 'asc' },
                take: 2,
              });
      if (matches.length !== 1) {
        const entityLabel = { customer: '客户', staff: '员工', project: '项目', product: '商品', supplier: '供应商' }[entityKind];
        const entityCode = entityKind;
        const reason = matches.length === 0
          ? `当前门店未找到姓名为“${entity.mention}”的${entityLabel}。`
          : `当前门店有多位姓名为“${entity.mention}”的${entityLabel}，无法唯一定位。`;
        return {
          semanticIntent: {
            ...intent,
            entities,
            ambiguities: [
              ...intent.ambiguities,
              { slot: 'entity_identity', reason, candidates: [] },
            ],
          },
          clarificationQuestion: `${reason}请补充${entityLabel} ID。`,
          clarificationReason: matches.length === 0 ? `${entityCode}_entity_not_found` : `${entityCode}_entity_not_unique`,
        };
      }
      entities = entities.map((item, itemIndex) => itemIndex === index
        ? { ...item, resolvedValue: String(matches[0].id) }
        : item);
    }
    return { semanticIntent: { ...intent, entities } };
  }
}
