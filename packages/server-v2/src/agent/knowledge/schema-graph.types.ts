import type { BusinessObjectType } from './knowledge.types.js';

export type SchemaGraphField = {
  name: string;
  displayName: string;
  type: string;
  queryable: boolean;
  displayable: boolean;
  sensitive?: boolean;
  optional?: boolean;
  list?: boolean;
  id?: boolean;
  unique?: boolean;
  indexed?: boolean;
  relation?: boolean;
};

export type SchemaGraphRelation = {
  fromModel: string;
  toModel: string;
  relationType: 'one_to_one' | 'one_to_many' | 'many_to_one' | 'logical';
  joinFields: Array<{ from: string; to: string }>;
  businessMeaning: string;
};

export type SchemaGraphNode = {
  modelName: string;
  objectType: BusinessObjectType;
  displayName: string;
  description: string;
  storeScoped: boolean;
  sourceModels: string[];
  fields: SchemaGraphField[];
  relations: SchemaGraphRelation[];
};

export type SchemaGraphGeneratedModel = Omit<SchemaGraphNode, 'relations'> & {
  relations: SchemaGraphRelation[];
  generatedFrom: 'prisma';
};
