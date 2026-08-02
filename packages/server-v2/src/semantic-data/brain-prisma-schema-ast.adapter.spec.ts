import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Prisma } from '@prisma/client';
import { BrainOntologyCandidateGeneratorService } from './brain-ontology-candidate-generator.service.js';
import { BrainPrismaSchemaAstAdapter } from './brain-prisma-schema-ast.adapter.js';
import { BrainSemanticCandidateVerifierService } from './brain-semantic-candidate-verifier.service.js';

describe('BrainPrismaSchemaAstAdapter', () => {
  it('parses owner-side relation metadata and enum values without regex parsing', () => {
    const schema = `
      enum Status {\n active\n archived\n @@map("entity_status")\n }
      model Store {\n id Int @id\n products Product[]\n }
      model Product {
        id Int @id
        storeId Int
        status Status
        store Store @relation("ProductToStore", fields: [storeId], references: [id])
      }
    `;

    const result = new BrainPrismaSchemaAstAdapter().parse(schema, 'schema.prisma');
    const relation = result.models
      .find((model) => model.name === 'Product')
      ?.fields.find((field) => field.name === 'store');

    expect(result.enums).toEqual([expect.objectContaining({ name: 'Status', values: ['active', 'archived'] })]);
    expect(relation).toMatchObject({
      kind: 'object',
      type: 'Store',
      relationName: 'ProductToStore',
      relationFromFields: ['storeId'],
      relationToFields: ['id'],
      isList: false,
      isRequired: true,
    });
  });

  it('supplements Prisma.dmmf with every model and enum from the real schema', () => {
    const schemaPath = resolve(process.cwd(), 'prisma/schema.prisma');
    const schema = readFileSync(schemaPath, 'utf8');
    const datamodel = new BrainPrismaSchemaAstAdapter().mergeWithDmmf(
      Prisma.dmmf.datamodel as any,
      schema,
      'packages/server-v2/prisma/schema.prisma',
    );
    const candidates = new BrainOntologyCandidateGeneratorService().generate({ datamodel });

    const declaredModelCount = [...schema.matchAll(/^model\s+/gm)].length;
    const declaredEnumCount = [...schema.matchAll(/^enum\s+/gm)].length;
    expect(datamodel.models).toHaveLength(declaredModelCount);
    expect(datamodel.enums).toHaveLength(declaredEnumCount);
    expect(candidates.filter((candidate) => candidate.kind === 'status_dictionary')).toHaveLength(declaredEnumCount);
    expect(candidates.find((candidate) => candidate.definitionKey === 'entity.role')?.storeScope).toEqual({
      mode: 'global',
    });
    expect(
      candidates.find((candidate) => candidate.definitionKey === 'entity.industry_service_template')?.storeScope,
    ).toEqual({ mode: 'global' });

    const actions = candidates.filter((candidate) => candidate.kind === 'action');
    const sourcePaths = new Set(
      actions.flatMap((candidate) =>
        candidate.evidence
          .map((item) => item.sourcePath)
          .filter((sourcePath) => sourcePath !== 'packages/server-v2/prisma/schema.prisma'),
      ),
    );
    const workspaceRoot = resolve(process.cwd(), '../..');
    const sourceFiles = new Map(
      [...sourcePaths].map((sourcePath) => [sourcePath, readFileSync(resolve(workspaceRoot, sourcePath), 'utf8')]),
    );
    const verifier = new BrainSemanticCandidateVerifierService();
    const verifiedActions = actions.map((candidate) =>
      verifier.verify(candidate, { datamodel, semanticEvidence: [], sourcePaths, sourceFiles }),
    );
    expect(
      verifiedActions.filter((item) => item.status === 'draft').map((item) => item.draftInput.definitionKey),
    ).toEqual([
      'action.cancel_reservation',
      'action.create_customer',
      'action.create_purchase_order',
      'action.create_reservation',
      'action.reschedule_reservation',
      'action.submit_purchase_order_for_approval',
    ]);
    expect(verifiedActions.every((item) => item.status === 'draft' && item.blockedReasons.length === 0)).toBe(true);
  });
});
