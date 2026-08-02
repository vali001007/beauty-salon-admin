import { createCuratedActionCandidates } from './brain-action-candidate-catalog.js';
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
      actionModel('Customer'),
      actionModel('Project'),
      actionModel('Beautician'),
      actionModel('Reservation'),
      actionModel('PurchaseOrder'),
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

  it('rebuilds all six aligned actions as drafts', () => {
    const verifier = new BrainSemanticCandidateVerifierService();
    const sourceFiles = curatedActionSourceFiles();

    for (const candidate of createCuratedActionCandidates()) {
      const result = verifier.verify(candidate, {
        datamodel: datamodel as any,
        semanticEvidence: [],
        sourcePaths: new Set(sourceFiles.keys()),
        sourceFiles,
      });

      expect(result.draftInput).toMatchObject({
        definitionKey: candidate.definitionKey,
        kind: 'action',
        ownerType: 'ami_core_action_catalog',
        lifecycleStatus: 'draft',
        storeScope: { mode: 'current_store' },
      });
      expect(result).toMatchObject({ status: 'draft', blockedReasons: [] });
      expect(result.draftInput.payload).toEqual(candidate.payload);
      expect(result.draftInput.evidence).toEqual(candidate.evidence);
    }
  });

  it('fails closed and rebuilds the catalog contract when an action forges slots, binding, policy or evidence', () => {
    const candidate = structuredClone(
      createCuratedActionCandidates().find((item) => item.definitionKey === 'action.create_purchase_order')!,
    );
    const payload = candidate.payload as any;
    payload.targetEntityRefs = ['entity.customer'];
    payload.inputSlots[1].slotKey = 'product';
    payload.confirmationPolicy = 'none';
    payload.preconditionPredicateRefs[0].fingerprint = '0'.repeat(64);
    payload.lexicalFrame.fingerprint = '1'.repeat(64);
    payload.situationContext.fingerprint = '2'.repeat(64);
    payload.modalityPolicy.fingerprint = '3'.repeat(64);
    payload.informationArtifact.fingerprint = '4'.repeat(64);
    payload.sideEffectInvariant.fingerprint = '5'.repeat(64);
    delete payload.capabilityBindings[0].gatewayActionKey;
    candidate.evidence = candidate.evidence.filter((item) => item.evidenceKind !== 'backend_api_contract');

    const result = new BrainSemanticCandidateVerifierService().verify(candidate, {
      datamodel: datamodel as any,
      semanticEvidence: [],
      sourcePaths: new Set(curatedActionSourceFiles().keys()),
      sourceFiles: curatedActionSourceFiles(),
    });

    expect(result.status).toBe('blocked');
    expect(result.blockedReasons).toEqual(
      expect.arrayContaining([
        'action_catalog_payload_mismatch:action.create_purchase_order',
        'action_catalog_evidence_mismatch:action.create_purchase_order',
        'action_entity_ref_not_governed:entity.customer',
        'action_slot_duplicate:product',
        'action_confirmation_policy_must_be_controlled',
        `action_predicate_contract_unresolved:${payload.preconditionPredicateRefs[0].key}`,
        'action_lexical_frame_fingerprint_invalid:action.create_purchase_order',
        'action_situation_context_fingerprint_invalid:action.create_purchase_order',
        'action_modality_policy_fingerprint_invalid:action.create_purchase_order',
        'action_information_artifact_fingerprint_invalid:action.create_purchase_order',
        'action_side_effect_invariant_fingerprint_invalid:action.create_purchase_order',
        'action_binding_gateway_key_missing:purchase_order_draft',
        'action_evidence_missing:backend_api_contract',
      ]),
    );
    expect(result.draftInput.payload).toEqual(
      createCuratedActionCandidates().find((item) => item.definitionKey === 'action.create_purchase_order')!.payload,
    );
    expect(result.draftInput.evidence).toEqual(
      createCuratedActionCandidates().find((item) => item.definitionKey === 'action.create_purchase_order')!.evidence,
    );
  });

  it('requires the workspace source-path snapshot before an action can become a draft', () => {
    const candidate = createCuratedActionCandidates()[0];
    const result = new BrainSemanticCandidateVerifierService().verify(candidate, {
      datamodel: datamodel as any,
      semanticEvidence: [],
    });

    expect(result.status).toBe('blocked');
    expect(result.blockedReasons).toContain('action_source_file_context_missing');
  });

  it('blocks a current-store action when its governed business object has no resolvable store scope', () => {
    const candidate = createCuratedActionCandidates().find(
      (item) => item.definitionKey === 'action.create_purchase_order',
    )!;
    const unscopedDatamodel = structuredClone(datamodel) as any;
    unscopedDatamodel.models.find((model: any) => model.name === 'PurchaseOrder').fields = [
      { name: 'id', kind: 'scalar', type: 'Int', isRequired: true, isList: false, isId: true },
    ];

    const result = new BrainSemanticCandidateVerifierService().verify(candidate, {
      datamodel: unscopedDatamodel,
      semanticEvidence: [],
      sourcePaths: new Set(curatedActionSourceFiles().keys()),
      sourceFiles: curatedActionSourceFiles(),
    });

    expect(result.status).toBe('blocked');
    expect(result.blockedReasons).toContain('action_entity_store_scope_missing:entity.purchase_order:PurchaseOrder');
  });

  it('blocks an action when the catalog path still exists but the declared backend method is gone', () => {
    const sourceFiles = curatedActionSourceFiles();
    sourceFiles.set(
      'packages/server-v2/src/customers/customers.controller.ts',
      `class CustomersController { @Permissions('core:customer:create') list() {} }`,
    );

    const result = verifyCuratedAction('action.create_customer', sourceFiles, datamodel);

    expect(result.blockedReasons).toContain('action_backend_method_missing:CustomersController.create');
  });

  it('blocks an action when the controller permission drifts from the curated contract', () => {
    const sourceFiles = curatedActionSourceFiles();
    sourceFiles.set(
      'packages/server-v2/src/reservations/reservations.controller.ts',
      sourceFiles
        .get('packages/server-v2/src/reservations/reservations.controller.ts')!
        .replaceAll('core:store:reservations', 'core:store:reservation-admin'),
    );

    const result = verifyCuratedAction('action.create_reservation', sourceFiles, datamodel);

    expect(result.blockedReasons).toContain(
      'action_backend_permission_mismatch:ReservationsController.create:core:store:reservations',
    );
  });

  it('blocks an action when the capability decorator key or permission drifts', () => {
    const sourceFiles = curatedActionSourceFiles();
    sourceFiles.set(
      'packages/server-v2/src/brain/capability/executors/brain-action-capability.executor.ts',
      sourceFiles
        .get('packages/server-v2/src/brain/capability/executors/brain-action-capability.executor.ts')!
        .replace(`key: 'reservation_action_preview'`, `key: 'reservation_preview_v2'`)
        .replace(`'core:store:reservations'`, `'core:store:reservation-admin'`),
    );

    const result = verifyCuratedAction('action.create_reservation', sourceFiles, datamodel);

    expect(result.blockedReasons).toEqual(
      expect.arrayContaining([
        'action_capability_key_mismatch:BrainActionCapabilityExecutor.reservationActionPreview:reservation_action_preview',
        'action_capability_permission_mismatch:BrainActionCapabilityExecutor.reservationActionPreview:core:store:reservations',
      ]),
    );
  });

  it('blocks an action when the gateway descriptor key or permission drifts', () => {
    const sourceFiles = curatedActionSourceFiles();
    sourceFiles.set(
      'packages/server-v2/src/brain/skills/brain-capability-gateway.service.ts',
      sourceFiles
        .get('packages/server-v2/src/brain/skills/brain-capability-gateway.service.ts')!
        .replace('create_customer:', 'create_customer_v2:')
        .replace(`permission: 'core:customer:create'`, `permission: 'core:customer:update'`),
    );

    const result = verifyCuratedAction('action.create_customer', sourceFiles, datamodel);

    expect(result.blockedReasons).toContain('action_gateway_key_missing:create_customer');
  });

  it('blocks an action when the Gateway declared effect boundary drifts', () => {
    const sourceFiles = curatedActionSourceFiles();
    sourceFiles.set(
      'packages/server-v2/src/brain/skills/brain-capability-gateway.service.ts',
      sourceFiles
        .get('packages/server-v2/src/brain/skills/brain-capability-gateway.service.ts')!
        .replace(`effectKeys: ['customer_created_in_context_store']`, `effectKeys: ['customer_updated']`),
    );

    const result = verifyCuratedAction('action.create_customer', sourceFiles, datamodel);

    expect(result.blockedReasons).toContain('action_gateway_effect_contract_mismatch:create_customer');
  });

  it('blocks a product entry that imports the expected API symbol but no longer calls it', () => {
    const sourceFiles = curatedActionSourceFiles();
    sourceFiles.set(
      'src/app/pages/CustomerData.tsx',
      `import { createCustomer } from '../../api/real/customers'; export function CustomerData() { return null; }`,
    );

    const result = verifyCuratedAction('action.create_customer', sourceFiles, datamodel);

    expect(result.blockedReasons).toContain(
      'action_product_entry_call_missing:src/app/pages/CustomerData.tsx:createCustomer',
    );
  });

  it('blocks an action when the deterministic predicate evaluator or effect observer method is removed', () => {
    const sourceFiles = curatedActionSourceFiles();
    sourceFiles.set(
      'packages/server-v2/src/brain/domain/brain-action-predicate-effect-evaluator.service.ts',
      `class BrainActionPredicateEffectEvaluatorService { evaluateSomethingElse() {} }`,
    );

    const result = verifyCuratedAction('action.create_customer', sourceFiles, datamodel);

    expect(result.blockedReasons).toEqual(
      expect.arrayContaining([
        'action_predicate_evaluator_method_missing:BrainActionPredicateEffectEvaluatorService.assertPreconditions',
        'action_effect_observer_method_missing:BrainActionPredicateEffectEvaluatorService.observeEffects',
      ]),
    );
  });

  it('blocks an action when the situation profile builder or execution revalidator is removed', () => {
    const sourceFiles = curatedActionSourceFiles();
    sourceFiles.set(
      'packages/server-v2/src/brain/cognition/business-action-situation-context.ts',
      `export function somethingElse() {}`,
    );
    sourceFiles.set(
      'packages/server-v2/src/brain/cognition/brain-action-situation-context.ts',
      `export function somethingElse() {}`,
    );

    const result = verifyCuratedAction('action.create_reservation', sourceFiles, datamodel);

    expect(result.blockedReasons).toEqual(
      expect.arrayContaining([
        'action_situation_context_profile_function_missing:createBusinessActionSituationContextProfile',
        'action_situation_context_revalidation_function_missing:brainActionSituationContextIssue',
      ]),
    );
  });

  it('blocks an action when an ontology profile builder is removed', () => {
    const sourceFiles = curatedActionSourceFiles();
    sourceFiles.set(
      'packages/server-v2/src/brain/cognition/business-action-modality-policy.ts',
      `export function somethingElse() {}`,
    );
    sourceFiles.set(
      'packages/server-v2/src/brain/cognition/business-action-information-artifact.ts',
      `export function somethingElse() {}`,
    );
    sourceFiles.set(
      'packages/server-v2/src/brain/cognition/business-action-side-effect-invariant.ts',
      `export function somethingElse() {}`,
    );
    sourceFiles.set(
      'packages/server-v2/src/brain/cognition/business-action-institutional-effect.ts',
      `export function somethingElse() {}`,
    );

    const result = verifyCuratedAction('action.create_reservation', sourceFiles, datamodel);

    expect(result.blockedReasons).toEqual(
      expect.arrayContaining([
        'action_modality_policy_function_missing:createBusinessActionModalityPolicy',
        'action_information_artifact_profile_function_missing:createBusinessActionInformationArtifactProfile',
        'action_side_effect_invariant_profile_function_missing:createBusinessActionSideEffectInvariantProfile',
        'action_institutional_effect_profile_function_missing:createBusinessActionInstitutionalEffectProfile',
      ]),
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

function actionModel(name: string) {
  return {
    name,
    fields: [
      { name: 'id', kind: 'scalar', type: 'Int', isRequired: true, isList: false, isId: true },
      { name: 'storeId', kind: 'scalar', type: 'Int', isRequired: true, isList: false },
    ],
  };
}

function verifyCuratedAction(definitionKey: string, sourceFiles: Map<string, string>, datamodel: unknown) {
  const candidate = createCuratedActionCandidates().find((item) => item.definitionKey === definitionKey)!;
  return new BrainSemanticCandidateVerifierService().verify(candidate, {
    datamodel: datamodel as any,
    semanticEvidence: [],
    sourcePaths: new Set(sourceFiles.keys()),
    sourceFiles,
  });
}

function curatedActionSourceFiles() {
  return new Map<string, string>([
    [
      'packages/server-v2/src/semantic-data/brain-action-candidate-catalog.ts',
      createCuratedActionCandidates()
        .map((candidate) => `action({ actionKey: '${candidate.definitionKey}' });`)
        .join('\n'),
    ],
    [
      'src/app/pages/CustomerData.tsx',
      `import { createCustomer } from '../../api/real/customers'; createCustomer({});`,
    ],
    [
      'src/app/pages/PurchaseManagement.tsx',
      `import { createPurchaseOrder, submitPurchaseOrderForApproval } from '../../api/inventory'; createPurchaseOrder({}); submitPurchaseOrderForApproval(1, '2026-07-30T10:00:00.000Z');`,
    ],
    [
      'src/app/pages/ProjectReservation.tsx',
      `
        import { createReservation, updateReservation, cancelReservation } from '../../api/real/reservations';
        createReservation({}); updateReservation(1, {}); cancelReservation(1);
      `,
    ],
    [
      'packages/server-v2/src/customers/customers.controller.ts',
      `class CustomersController { @Permissions('core:customer:create') create() {} }`,
    ],
    [
      'packages/server-v2/src/inventory/inventory.controller.ts',
      `class InventoryController {
        @Permissions('core:inventory:purchase') createPurchaseOrder() {}
        @Permissions('core:inventory:purchase') submitPurchaseOrderForApproval() {}
      }`,
    ],
    [
      'packages/server-v2/src/reservations/reservations.controller.ts',
      `
        class ReservationsController {
          @Permissions('core:store:reservations') create() {}
          @Permissions('core:store:reservations') update() {}
          @Permissions('core:store:reservations') cancel() {}
        }
      `,
    ],
    [
      'packages/server-v2/src/brain/capability/executors/brain-action-capability.executor.ts',
      `
        class BrainActionCapabilityExecutor {
          @BrainCapability({ key: 'reservation_action_preview', permissions: ['core:brain:use', 'core:store:reservations'] })
          reservationActionPreview() {}
          @BrainCapability({ key: 'purchase_order_draft', permissions: ['core:brain:use', 'core:inventory:purchase'] })
          purchaseOrderDraft() {}
          @BrainCapability({ key: 'purchase_order_submit_for_approval_preview', permissions: ['core:brain:use', 'core:inventory:purchase'] })
          purchaseOrderSubmitForApprovalPreview() {}
        }
      `,
    ],
    [
      'packages/server-v2/src/brain/capability/executors/brain-customer-create-capability.executor.ts',
      `
        class BrainCustomerCreateCapabilityExecutor {
          @BrainCapability({ key: 'customer_create_preview', permissions: ['core:brain:use', 'core:customer:create'] })
          customerCreatePreview() {}
        }
      `,
    ],
    [
      'packages/server-v2/src/brain/skills/brain-capability-gateway.service.ts',
      `
        const CAPABILITY_MAP = {
          create_customer: { permission: 'core:customer:create', effectKeys: ['customer_created_in_context_store'] },
          create_purchase_order: { permission: 'core:inventory:purchase', effectKeys: ['purchase_order_draft_created_in_context_store'] },
          submit_purchase_order_for_approval: { permission: 'core:inventory:purchase', effectKeys: ['purchase_order_submitted_for_approval'] },
          create_reservation: { permission: 'core:store:reservations', effectKeys: ['reservation_created_in_context_store'] },
          reschedule_reservation: { permission: 'core:store:reservations', effectKeys: ['reservation_time_updated'] },
          cancel_reservation: { permission: 'core:store:reservations', effectKeys: ['reservation_cancelled'] },
        };
      `,
    ],
    [
      'packages/server-v2/src/brain/domain/brain-action-predicate-effect-evaluator.service.ts',
      `
        class BrainActionPredicateEffectEvaluatorService {
          assertPreconditions() {}
          observeEffects() {}
        }
      `,
    ],
    [
      'packages/server-v2/src/brain/cognition/business-action-situation-context.ts',
      `export function createBusinessActionSituationContextProfile() {}`,
    ],
    [
      'packages/server-v2/src/brain/cognition/business-action-modality-policy.ts',
      `export function createBusinessActionModalityPolicy() {}`,
    ],
    [
      'packages/server-v2/src/brain/cognition/business-action-information-artifact.ts',
      `export function createBusinessActionInformationArtifactProfile() {}`,
    ],
    [
      'packages/server-v2/src/brain/cognition/business-action-side-effect-invariant.ts',
      `export function createBusinessActionSideEffectInvariantProfile() {}`,
    ],
    [
      'packages/server-v2/src/brain/cognition/business-action-institutional-effect.ts',
      `export function createBusinessActionInstitutionalEffectProfile() {}`,
    ],
    [
      'packages/server-v2/src/semantic-data/brain-action-invariant-catalog.ts',
      `export function curatedActionInvariantRef() {}`,
    ],
    [
      'packages/server-v2/src/brain/cognition/business-action-participant-profile.ts',
      `export function createBusinessActionParticipantProfile() {}`,
    ],
    [
      'packages/server-v2/src/brain/cognition/business-action-relation-profile.ts',
      `export function createBusinessActionRelationProfile() {}`,
    ],
    [
      'packages/server-v2/src/semantic-data/brain-action-relation-catalog.ts',
      `export const CURATED_ACTION_RELATION_DEFINITIONS = [];`,
    ],
    [
      'packages/server-v2/src/brain/cognition/brain-action-situation-context.ts',
      `export function brainActionSituationContextIssue() {}`,
    ],
  ]);
}
