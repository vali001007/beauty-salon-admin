import { BrainSemanticCandidateVerifierService } from './brain-semantic-candidate-verifier.service.js';

describe('BrainSemanticCandidateVerifierService', () => {
  const datamodel = {
    models: [
      {
        name: 'Store',
        fields: [
          { name: 'id', kind: 'scalar', type: 'Int', isRequired: true, isList: false, isId: true, isUnique: true },
          {
            name: 'orders',
            kind: 'object',
            type: 'ProductOrder',
            isRequired: true,
            isList: true,
            relationFromFields: [],
            relationToFields: [],
          },
        ],
      },
      {
        name: 'ProductOrder',
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
            type: 'OrderStatus',
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
            relationName: 'ProductOrderToStore',
            relationFromFields: ['storeId'],
            relationToFields: ['id'],
          },
          {
            name: 'refunds',
            kind: 'object',
            type: 'RefundRecord',
            isRequired: true,
            isList: true,
            relationName: 'ProductOrderToRefundRecord',
            relationFromFields: [],
            relationToFields: [],
          },
        ],
      },
      {
        name: 'RefundRecord',
        fields: [
          { name: 'id', kind: 'scalar', type: 'Int', isRequired: true, isList: false, isId: true, isUnique: true },
          {
            name: 'orderId',
            kind: 'scalar',
            type: 'Int',
            isRequired: true,
            isList: false,
            isId: false,
            isUnique: false,
          },
          {
            name: 'order',
            kind: 'object',
            type: 'ProductOrder',
            isRequired: true,
            isList: false,
            relationName: 'ProductOrderToRefundRecord',
            relationFromFields: ['orderId'],
            relationToFields: ['id'],
          },
        ],
      },
      {
        name: 'Product',
        sourcePath: 'packages/server-v2/prisma/schema.prisma',
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
            type: 'OrderStatus',
            isRequired: true,
            isList: false,
            isId: false,
            isUnique: false,
          },
        ],
      },
    ],
    enums: [{ name: 'OrderStatus', values: ['paid', 'completed', 'cancelled'] }],
  };

  it('returns a whitelist-rebuilt Registry draft for a structurally valid entity', () => {
    const candidate = { ...entityCandidate(), attackerControlled: true, fingerprint: 'forged' } as any;
    candidate.payload.permissions = ['core:forged:admin'];
    candidate.payload.attackerControlled = true;
    candidate.payload.aliases = ['伪造别名'];
    candidate.evidence.push(aliasEvidence('经营订单', 0.95), aliasEvidence('冲突订单', 0.99, 'alias_ambiguity:订单'));

    const result = new BrainSemanticCandidateVerifierService().verify(candidate, {
      datamodel: datamodel as any,
      semanticEvidence: [],
    });

    expect(result.status).toBe('draft');
    expect(result.draftInput).toMatchObject({
      definitionKey: 'entity.product_order',
      kind: 'entity',
      lifecycleStatus: 'draft',
      payload: expect.objectContaining({ model: 'ProductOrder', aliases: ['经营订单'] }),
    });
    expect(result.draftInput).not.toHaveProperty('attackerControlled');
    expect(result.draftInput).not.toHaveProperty('fingerprint');
    expect(result.draftInput.payload).not.toHaveProperty('permissions');
    expect(result.draftInput.payload).not.toHaveProperty('attackerControlled');
    expect(result.draftInput.evidence.every((item: any) => !('observedLabel' in item))).toBe(true);
  });

  it('blocks a Product payload that forges candidate identity and query references', () => {
    const candidate = {
      ...entityCandidate(),
      definitionKey: 'entity.customer',
      domain: 'FinancialRisk',
      name: 'Customer',
      ownerId: 'prisma:model:Customer',
      schemaVersion: '999',
      canonicalQueryRef: 'semantic_query.financial_risk',
      fixtureSetKey: 'semantic.financial_risk.v999',
      payload: {
        model: 'Product',
        storeScopeField: 'storeId',
        fields: ['id', 'storeId', 'status'],
        relationFields: [],
        aliases: [],
      },
      evidence: [
        {
          sourceType: 'prisma_schema_ast',
          sourcePath: 'packages/server-v2/prisma/schema.prisma',
          sourceSymbol: 'Product',
          evidenceKind: 'model_declaration',
          confidence: 1,
        },
      ],
    } as any;

    const result = new BrainSemanticCandidateVerifierService().verify(candidate, {
      datamodel: datamodel as any,
      semanticEvidence: [],
    });

    expect(result.status).toBe('blocked');
    expect(result.blockedReasons).toEqual(
      expect.arrayContaining([
        'identity_definition_key_mismatch:entity.product',
        'identity_domain_mismatch:product',
        'identity_name_mismatch:Product',
        'identity_owner_id_mismatch:prisma:model:Product',
        'identity_schema_version_mismatch:1.0',
        'canonical_query_ref_not_allowed',
        'fixture_set_key_not_allowed',
      ]),
    );
    expect(result.draftInput).toMatchObject({
      definitionKey: 'entity.product',
      domain: 'product',
      name: 'Product',
      ownerId: 'prisma:model:Product',
      schemaVersion: '1.0',
    });
    expect(result.draftInput).not.toHaveProperty('canonicalQueryRef');
    expect(result.draftInput).not.toHaveProperty('fixtureSetKey');
  });

  it('blocks structural evidence whose symbol or source path does not match the payload AST node', () => {
    const candidate = {
      ...entityCandidate(),
      definitionKey: 'entity.product',
      domain: 'product',
      name: 'Product',
      ownerId: 'prisma:model:Product',
      payload: { model: 'Product', aliases: [] },
      evidence: [
        {
          sourceType: 'prisma_schema_ast',
          sourcePath: 'tmp/forged-schema.prisma',
          sourceSymbol: 'Customer',
          evidenceKind: 'model_declaration',
          confidence: 1,
        },
      ],
    } as any;

    const result = new BrainSemanticCandidateVerifierService().verify(candidate, {
      datamodel: datamodel as any,
      semanticEvidence: [],
    });

    expect(result.blockedReasons).toEqual(
      expect.arrayContaining([
        'structural_evidence_symbol_mismatch:Product',
        'structural_evidence_path_mismatch:packages/server-v2/prisma/schema.prisma',
      ]),
    );
  });

  it('fails closed when global normalized alias evidence targets more than one symbol', () => {
    const candidate = {
      ...entityCandidate(),
      definitionKey: 'entity.product',
      domain: 'product',
      name: 'Product',
      ownerId: 'prisma:model:Product',
      payload: { model: 'Product', aliases: ['商品档案'] },
      evidence: [
        {
          sourceType: 'prisma_schema_ast',
          sourcePath: 'packages/server-v2/prisma/schema.prisma',
          sourceSymbol: 'Product',
          evidenceKind: 'model_declaration',
          confidence: 1,
        },
        aliasEvidence('商品档案', 0.95),
      ],
    } as any;
    const semanticEvidence = [
      {
        targetSymbol: 'Product',
        label: '商品 档案',
        sourceType: 'menu',
        sourcePath: 'src/product.ts',
        confidence: 0.95,
      },
      {
        targetSymbol: 'Customer',
        label: '商品档案',
        sourceType: 'menu',
        sourcePath: 'src/customer.ts',
        confidence: 0.95,
      },
    ];

    const result = new BrainSemanticCandidateVerifierService().verify(candidate, {
      datamodel: datamodel as any,
      semanticEvidence,
    } as any);

    expect(result.status).toBe('blocked');
    expect(result.blockedReasons).toContain('alias_conflict:商品档案');
    expect(result.draftInput.payload).toMatchObject({ aliases: [] });
  });

  it('blocks aliases when the required global conflict context is omitted at runtime', () => {
    const candidate = {
      ...entityCandidate(),
      definitionKey: 'entity.product',
      domain: 'product',
      name: 'Product',
      ownerId: 'prisma:model:Product',
      payload: { model: 'Product', aliases: ['档案'] },
      evidence: [
        {
          sourceType: 'prisma_schema_ast',
          sourcePath: 'packages/server-v2/prisma/schema.prisma',
          sourceSymbol: 'Product',
          evidenceKind: 'model_declaration',
          confidence: 1,
        },
        aliasEvidence('档案', 0.95),
      ],
    } as any;

    const result = new BrainSemanticCandidateVerifierService().verify(candidate, {
      datamodel: datamodel as any,
    } as any);

    expect(result.status).toBe('blocked');
    expect(result.blockedReasons).toContain('alias_conflict_context_missing');
    expect(result.draftInput.payload).toMatchObject({ aliases: [] });
  });

  it('accepts an alias-free structural candidate with an explicit empty evidence snapshot', () => {
    const result = new BrainSemanticCandidateVerifierService().verify(entityCandidate(), {
      datamodel: datamodel as any,
      semanticEvidence: [],
    });

    expect(result.status).toBe('draft');
    expect(result.blockedReasons).not.toContain('alias_conflict_context_missing');
    expect(result.draftInput.payload).toMatchObject({ aliases: [] });
  });

  it('checks every field contract attribute against structured Prisma metadata', () => {
    const field = {
      ...entityCandidate(),
      definitionKey: 'field.product_order.status',
      kind: 'field',
      payload: {
        model: 'ProductOrder',
        field: 'status',
        scalarType: 'String',
        required: false,
        list: true,
        id: true,
        unique: true,
        enumName: 'MissingStatus',
        aliases: [],
      },
    } as any;

    const result = new BrainSemanticCandidateVerifierService().verify(field, {
      datamodel: datamodel as any,
      semanticEvidence: [],
    });

    expect(result.blockedReasons).toEqual(
      expect.arrayContaining([
        'field_scalar_type_mismatch:ProductOrder.status:OrderStatus',
        'field_required_mismatch:ProductOrder.status:true',
        'field_list_mismatch:ProductOrder.status:false',
        'field_id_mismatch:ProductOrder.status:false',
        'field_unique_mismatch:ProductOrder.status:false',
        'field_enum_mismatch:ProductOrder.status:OrderStatus',
      ]),
    );
  });

  it('checks owner-side relation join fields, target, name and cardinality', () => {
    const relation = {
      ...entityCandidate(),
      definitionKey: 'relation.refund_record.order',
      kind: 'relation',
      name: 'RefundRecord.order',
      payload: {
        fromModel: 'RefundRecord',
        relationField: 'order',
        toModel: 'Store',
        relationName: 'WrongRelation',
        relationFromFields: ['id'],
        relationToFields: ['storeId'],
        cardinality: 'many',
        executableJoin: true,
        aliases: [],
      },
    } as any;

    const result = new BrainSemanticCandidateVerifierService().verify(relation, {
      datamodel: datamodel as any,
      semanticEvidence: [],
    });

    expect(result.blockedReasons).toEqual(
      expect.arrayContaining([
        'relation_target_mismatch:RefundRecord.order:ProductOrder',
        'relation_name_mismatch:RefundRecord.order:ProductOrderToRefundRecord',
        'relation_from_fields_mismatch:RefundRecord.order:orderId',
        'relation_to_fields_mismatch:RefundRecord.order:id',
        'relation_cardinality_mismatch:RefundRecord.order:one',
      ]),
    );
  });

  it('blocks reverse-list relation candidates that do not own executable join fields', () => {
    const relation = {
      ...entityCandidate(),
      definitionKey: 'relation.product_order.refunds',
      kind: 'relation',
      name: 'ProductOrder.refunds',
      payload: {
        fromModel: 'ProductOrder',
        relationField: 'refunds',
        toModel: 'RefundRecord',
        relationName: 'ProductOrderToRefundRecord',
        relationFromFields: [],
        relationToFields: [],
        cardinality: 'many',
        executableJoin: false,
        aliases: [],
      },
    } as any;

    expect(
      new BrainSemanticCandidateVerifierService().verify(relation, {
        datamodel: datamodel as any,
        semanticEvidence: [],
      }).blockedReasons,
    ).toEqual(expect.arrayContaining(['relation_join_not_executable:ProductOrder.refunds']));
  });

  it('validates enum values and blocks unresolved store scope or missing structural evidence', () => {
    const enumCandidate = {
      ...entityCandidate(),
      definitionKey: 'status_dictionary.order_status',
      kind: 'status_dictionary',
      name: 'OrderStatus',
      domain: 'shared',
      storeScope: { mode: 'global' },
      payload: { enumName: 'OrderStatus', values: ['paid', 'completed'], aliases: [] },
    } as any;
    const entity = { ...entityCandidate(), storeScope: { mode: 'global' }, evidence: [] } as any;

    expect(
      new BrainSemanticCandidateVerifierService().verify(enumCandidate, {
        datamodel: datamodel as any,
        semanticEvidence: [],
      }).blockedReasons,
    ).toContain('enum_values_mismatch:OrderStatus');
    expect(
      new BrainSemanticCandidateVerifierService().verify(entity, {
        datamodel: datamodel as any,
        semanticEvidence: [],
      }).blockedReasons,
    ).toEqual(
      expect.arrayContaining(['store_scope_mismatch:ProductOrder:current_store', 'structural_evidence_missing']),
    );
  });
});

function entityCandidate() {
  return {
    definitionKey: 'entity.product_order',
    kind: 'entity',
    domain: 'product_order',
    name: 'ProductOrder',
    ownerType: 'ami_core_semantic_scanner',
    ownerId: 'prisma:model:ProductOrder',
    lifecycleStatus: 'candidate',
    schemaVersion: '1.0',
    payload: {
      model: 'ProductOrder',
      storeScopeField: 'storeId',
      fields: ['id', 'storeId', 'status'],
      relationFields: ['store', 'refunds'],
      aliases: [],
    },
    storeScope: { mode: 'current_store' },
    evidence: [
      {
        sourceType: 'prisma_schema_ast',
        sourcePath: 'packages/server-v2/prisma/schema.prisma',
        sourceSymbol: 'ProductOrder',
        evidenceKind: 'model_declaration',
        confidence: 1,
      },
    ],
  } as any;
}

function aliasEvidence(observedLabel: string, confidence: number, conflictGroup?: string) {
  return {
    sourceType: 'menu',
    sourcePath: 'src/menu.ts',
    sourceSymbol: '/orders',
    evidenceKind: 'alias_observation',
    confidence,
    conflictGroup,
    observedLabel,
  };
}
