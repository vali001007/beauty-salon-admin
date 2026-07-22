import { BrainOntologyCandidateGeneratorService } from './brain-ontology-candidate-generator.service.js';
import { BrainSemanticCandidateVerifierService } from './brain-semantic-candidate-verifier.service.js';

describe('BrainOntologyCandidateGeneratorService', () => {
  const datamodel = {
    models: [
      {
        name: 'Store',
        fields: [
          { name: 'id', kind: 'scalar', type: 'Int', isRequired: true, isList: false, isId: true, isUnique: true },
          {
            name: 'products',
            kind: 'object',
            type: 'Product',
            isRequired: true,
            isList: true,
            relationName: 'ProductToStore',
            relationFromFields: [],
            relationToFields: [],
          },
        ],
      },
      {
        name: 'Product',
        fields: [
          { name: 'id', kind: 'scalar', type: 'Int', isRequired: true, isList: false, isId: true, isUnique: true },
          {
            name: 'storeId',
            kind: 'scalar',
            type: 'Int',
            isRequired: true,
            isList: false,
            isId: false,
            isUnique: false,
          },
          {
            name: 'status',
            kind: 'enum',
            type: 'EntityStatus',
            isRequired: true,
            isList: false,
            isId: false,
            isUnique: false,
          },
          {
            name: 'store',
            kind: 'object',
            type: 'Store',
            isRequired: true,
            isList: false,
            relationName: 'ProductToStore',
            relationFromFields: ['storeId'],
            relationToFields: ['id'],
          },
        ],
      },
      {
        name: 'Role',
        fields: [
          { name: 'id', kind: 'scalar', type: 'Int', isRequired: true, isList: false, isId: true, isUnique: true },
          {
            name: 'users',
            kind: 'object',
            type: 'UserRole',
            isRequired: true,
            isList: true,
            relationFromFields: [],
            relationToFields: [],
          },
        ],
      },
      {
        name: 'IndustryServiceTemplate',
        fields: [
          { name: 'id', kind: 'scalar', type: 'Int', isRequired: true, isList: false, isId: true, isUnique: true },
          {
            name: 'projects',
            kind: 'object',
            type: 'Project',
            isRequired: true,
            isList: true,
            relationFromFields: [],
            relationToFields: [],
          },
        ],
      },
    ],
    enums: [{ name: 'EntityStatus', values: ['active', 'disabled', 'archived'] }],
  };

  it('derives entity, field, owner-side physical relation and status dictionary candidates', () => {
    const result = new BrainOntologyCandidateGeneratorService().generate({ datamodel: datamodel as any });

    expect(result.find((candidate) => candidate.definitionKey === 'entity.product')).toMatchObject({
      kind: 'entity',
      domain: 'product',
      lifecycleStatus: 'candidate',
      ownerType: 'ami_core_semantic_scanner',
      storeScope: { mode: 'current_store' },
      payload: expect.objectContaining({ model: 'Product', storeScopeField: 'storeId' }),
    });
    expect(result.find((candidate) => candidate.definitionKey === 'field.product.status')).toMatchObject({
      kind: 'field',
      payload: expect.objectContaining({
        model: 'Product',
        field: 'status',
        scalarType: 'EntityStatus',
        required: true,
        list: false,
        id: false,
        unique: false,
        enumName: 'EntityStatus',
      }),
    });
    expect(result.find((candidate) => candidate.definitionKey === 'relation.product.store')).toMatchObject({
      kind: 'relation',
      domain: 'product',
      payload: expect.objectContaining({
        fromModel: 'Product',
        toModel: 'Store',
        relationFromFields: ['storeId'],
        relationToFields: ['id'],
        executableJoin: true,
      }),
    });
    expect(result.find((candidate) => candidate.definitionKey === 'status_dictionary.entity_status')).toMatchObject({
      kind: 'status_dictionary',
      payload: expect.objectContaining({ enumName: 'EntityStatus', values: ['active', 'disabled', 'archived'] }),
    });
  });

  it('does not infer store scope through reverse list relations', () => {
    const result = new BrainOntologyCandidateGeneratorService().generate({ datamodel: datamodel as any });

    expect(result.find((candidate) => candidate.definitionKey === 'entity.role')?.storeScope).toEqual({
      mode: 'global',
    });
    expect(
      result.find((candidate) => candidate.definitionKey === 'entity.industry_service_template')?.storeScope,
    ).toEqual({
      mode: 'global',
    });
    expect(result.find((candidate) => candidate.definitionKey === 'relation.store.products')).toMatchObject({
      payload: expect.objectContaining({ executableJoin: false }),
    });
  });

  it('resolves owner-side store scope through cycles without order-dependent false memoization', () => {
    const cyclic = {
      models: [
        {
          name: 'Store',
          fields: [{ name: 'id', kind: 'scalar', type: 'Int', isRequired: true, isList: false }],
        },
        {
          name: 'A',
          fields: [
            { name: 'bId', kind: 'scalar', type: 'Int', isRequired: true, isList: false },
            { name: 'homeStoreId', kind: 'scalar', type: 'Int', isRequired: true, isList: false },
            {
              name: 'b',
              kind: 'object',
              type: 'B',
              isRequired: true,
              isList: false,
              relationFromFields: ['bId'],
              relationToFields: ['id'],
            },
            {
              name: 'homeStore',
              kind: 'object',
              type: 'Store',
              isRequired: true,
              isList: false,
              relationFromFields: ['homeStoreId'],
              relationToFields: ['id'],
            },
          ],
        },
        {
          name: 'B',
          fields: [
            { name: 'id', kind: 'scalar', type: 'Int', isRequired: true, isList: false },
            { name: 'aId', kind: 'scalar', type: 'Int', isRequired: true, isList: false },
            {
              name: 'a',
              kind: 'object',
              type: 'A',
              isRequired: true,
              isList: false,
              relationFromFields: ['aId'],
              relationToFields: ['id'],
            },
          ],
        },
      ],
      enums: [],
    };

    const candidates = new BrainOntologyCandidateGeneratorService().generate({ datamodel: cyclic as any });

    expect(candidates.find((candidate) => candidate.definitionKey === 'entity.a')?.storeScope).toEqual({
      mode: 'current_store',
    });
    expect(candidates.find((candidate) => candidate.definitionKey === 'entity.b')?.storeScope).toEqual({
      mode: 'current_store',
    });
  });

  it('keeps reverse or empty-join relation evidence but verifier blocks it from draft', () => {
    const candidate = new BrainOntologyCandidateGeneratorService()
      .generate({ datamodel: datamodel as any })
      .find((item) => item.definitionKey === 'relation.store.products')!;

    expect(
      new BrainSemanticCandidateVerifierService().verify(candidate, {
        datamodel: datamodel as any,
        semanticEvidence: [],
      }),
    ).toMatchObject({
      status: 'blocked',
      blockedReasons: expect.arrayContaining(['relation_join_not_executable:Store.products']),
    });
  });

  it('maps CreateCustomerDto to Customer fields and keeps unbound route/menu labels unbound', () => {
    const service = new BrainOntologyCandidateGeneratorService();
    const evidence = service.extractTypeScriptEvidence([
      {
        path: 'src/customer/customer.dto.ts',
        content: `
          export class CreateCustomerDto {
            @ApiProperty({ description: '客户状态' })
            status!: string;
          }
          const route = { path: '/customers', title: '客户管理' };
          const menu = { path: '/customers', label: '客户档案' };
        `,
      },
    ]);

    expect(evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetSymbol: 'Customer.status', label: '客户状态', sourceType: 'dto' }),
        expect.objectContaining({ targetSymbol: '__unbound__', label: '客户管理', sourceType: 'route' }),
        expect.objectContaining({ targetSymbol: '__unbound__', label: '客户档案', sourceType: 'menu' }),
      ]),
    );
  });

  it('keeps conflict and low-confidence semantic evidence out of payload aliases', () => {
    const service = new BrainOntologyCandidateGeneratorService();
    const semanticEvidence = [
      {
        targetSymbol: 'Product',
        label: '商品档案',
        sourceType: 'menu',
        sourcePath: 'src/menu.ts',
        confidence: 0.9,
      },
      {
        targetSymbol: 'Product',
        label: '商品',
        sourceType: 'eval_question',
        sourcePath: 'docs/questions.md',
        confidence: 0.99,
        conflictGroup: 'alias_ambiguity:商品',
      },
      {
        targetSymbol: 'Product',
        label: 'products',
        sourceType: 'controller',
        sourcePath: 'src/product.controller.ts',
        confidence: 0.75,
      },
    ] as any;
    const candidate = service
      .generate({ datamodel: datamodel as any, semanticEvidence })
      .find((item) => item.definitionKey === 'entity.product')!;

    expect(candidate.payload.aliases).toEqual(['商品档案']);
    expect(candidate.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ conflictGroup: 'alias_ambiguity:商品', observedLabel: '商品' }),
      ]),
    );
  });

  it('automatically conflicts normalized aliases that target multiple structural symbols', () => {
    const semanticEvidence = [
      {
        targetSymbol: 'Product',
        label: '商品 档案',
        sourceType: 'menu',
        sourcePath: 'src/product-menu.ts',
        confidence: 0.95,
      },
      {
        targetSymbol: 'Role',
        label: '商品档案',
        sourceType: 'menu',
        sourcePath: 'src/role-menu.ts',
        confidence: 0.95,
      },
    ] as any;

    const candidates = new BrainOntologyCandidateGeneratorService().generate({
      datamodel: datamodel as any,
      semanticEvidence,
    });
    const product = candidates.find((candidate) => candidate.definitionKey === 'entity.product')!;
    const role = candidates.find((candidate) => candidate.definitionKey === 'entity.role')!;

    expect(product.payload.aliases).toEqual([]);
    expect(role.payload.aliases).toEqual([]);
    expect(product.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ conflictGroup: 'alias_ambiguity:商品档案', observedLabel: '商品 档案' }),
      ]),
    );
    expect(role.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ conflictGroup: 'alias_ambiguity:商品档案', observedLabel: '商品档案' }),
      ]),
    );
  });

  it('derives relation-aware owner-side store scope that passes deterministic verification', () => {
    const candidate = new BrainOntologyCandidateGeneratorService()
      .generate({ datamodel: datamodel as any })
      .find((item) => item.definitionKey === 'relation.product.store')!;

    expect(candidate.storeScope).toEqual({ mode: 'current_store' });
    expect(
      new BrainSemanticCandidateVerifierService().verify(candidate, {
        datamodel: datamodel as any,
        semanticEvidence: [],
      }),
    ).toMatchObject({
      status: 'draft',
      blockedReasons: [],
    });
  });
});
