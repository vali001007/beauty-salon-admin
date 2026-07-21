import { Injectable } from '@nestjs/common';
import { extname } from 'node:path';
import * as ts from 'typescript';
import {
  createPrismaStoreScopeResolver,
  deriveCanonicalOntologyIdentity,
  findSemanticAliasConflicts,
  isExecutableOwnerRelation,
  normalizeSemanticAlias,
} from './brain-semantic-candidate.types.js';
import type {
  BusinessDefinitionCandidateDraft,
  BusinessDefinitionCandidateEvidence,
  CandidateSourceFile,
  PrismaDatamodelAst,
  PrismaFieldAst,
  SemanticLabelEvidence,
} from './brain-semantic-candidate.types.js';

const PRISMA_SCHEMA_PATH = 'packages/server-v2/prisma/schema.prisma';

@Injectable()
export class BrainOntologyCandidateGeneratorService {
  generate(input: {
    datamodel: PrismaDatamodelAst;
    semanticEvidence?: SemanticLabelEvidence[];
  }): BusinessDefinitionCandidateDraft[] {
    const semanticEvidence = applyGlobalAliasConflicts(input.semanticEvidence ?? []);
    const candidates: BusinessDefinitionCandidateDraft[] = [];
    const resolveStoreScope = createPrismaStoreScopeResolver(input.datamodel);

    for (const model of input.datamodel.models) {
      const storeScope = resolveStoreScope(model.name) ? { mode: 'current_store' } : { mode: 'global' };
      candidates.push(
        candidate({
          kind: 'entity',
          structuralSymbol: model.name,
          payload: {
            model: model.name,
            storeScopeField: model.fields.some((field) => field.name === 'storeId') ? 'storeId' : null,
            fields: model.fields.filter((field) => field.kind !== 'object').map((field) => field.name),
            relationFields: model.fields.filter((field) => field.kind === 'object').map((field) => field.name),
          },
          storeScope,
          evidence: modelEvidence(model, 'model_declaration'),
          semanticEvidence,
        }),
      );

      for (const field of model.fields) {
        if (field.kind === 'object') {
          candidates.push(
            candidate({
              kind: 'relation',
              structuralSymbol: `${model.name}.${field.name}`,
              payload: {
                fromModel: model.name,
                relationField: field.name,
                toModel: field.type,
                relationName: field.relationName ?? null,
                relationFromFields: field.relationFromFields ?? [],
                relationToFields: field.relationToFields ?? [],
                cardinality: field.isList ? 'many' : field.isRequired === false ? 'zero_or_one' : 'one',
                executableJoin: isExecutableOwnerRelation(field),
              },
              storeScope,
              evidence: fieldEvidence(model.name, field, 'physical_relation'),
              semanticEvidence,
            }),
          );
          continue;
        }

        candidates.push(
          candidate({
            kind: 'field',
            structuralSymbol: `${model.name}.${field.name}`,
            payload: {
              model: model.name,
              field: field.name,
              scalarType: field.type,
              enumName: field.kind === 'enum' ? field.type : null,
              required: field.isRequired ?? null,
              list: field.isList ?? false,
              id: field.isId ?? false,
              unique: field.isUnique ?? false,
            },
            storeScope,
            evidence: fieldEvidence(model.name, field, field.kind === 'enum' ? 'enum_field' : 'field_declaration'),
            semanticEvidence,
          }),
        );
      }
    }

    for (const prismaEnum of input.datamodel.enums) {
      candidates.push(
        candidate({
          kind: 'status_dictionary',
          structuralSymbol: prismaEnum.name,
          payload: {
            enumName: prismaEnum.name,
            values: prismaEnum.values.map((value) => (typeof value === 'string' ? value : value.name)),
          },
          storeScope: { mode: 'global' },
          evidence: modelEvidence(prismaEnum, 'enum_declaration'),
          semanticEvidence,
        }),
      );
    }

    return candidates.sort((left, right) => left.definitionKey.localeCompare(right.definitionKey));
  }

  extractTypeScriptEvidence(sources: CandidateSourceFile[]): SemanticLabelEvidence[] {
    const result: SemanticLabelEvidence[] = [];
    for (const source of sources) {
      const sourceFile = ts.createSourceFile(
        source.path,
        source.content,
        ts.ScriptTarget.Latest,
        true,
        extname(source.path).toLowerCase() === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      const visit = (node: ts.Node) => {
        if (ts.isClassDeclaration(node) && node.name) {
          this.scanClassEvidence(node, sourceFile, source.path, result);
        }
        if (ts.isObjectLiteralExpression(node)) {
          this.scanObjectEvidence(node, sourceFile, source.path, result);
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }
    return dedupeSemanticEvidence(result);
  }

  extractEvalQuestionEvidence(
    markdown: string,
    sourcePath: string,
    aliases: Array<{ targetSymbol: string; alias: string }>,
  ): SemanticLabelEvidence[] {
    const result: SemanticLabelEvidence[] = [];
    const aliasTargets = new Map<string, Set<string>>();
    for (const item of aliases) {
      if (!item.alias.trim()) continue;
      const targets = aliasTargets.get(item.alias) ?? new Set<string>();
      targets.add(item.targetSymbol);
      aliasTargets.set(item.alias, targets);
    }
    for (const [index, line] of markdown.split(/\r?\n/).entries()) {
      const question = /^\s*\d+[.、]\s*(.+?)\s*$/.exec(line)?.[1];
      if (!question) continue;
      for (const [alias, targets] of aliasTargets) {
        if (!question.includes(alias)) continue;
        const conflictGroup = targets.size > 1 ? `alias_ambiguity:${alias}` : undefined;
        for (const targetSymbol of targets) {
          result.push({
            targetSymbol,
            label: question,
            sourceType: 'eval_question',
            sourcePath,
            sourceSymbol: `question:${index + 1}`,
            lineStart: index + 1,
            confidence: 0.55,
            conflictGroup,
            metadata: { matchedAlias: alias },
          });
        }
      }
    }
    return dedupeSemanticEvidence(result);
  }

  private scanClassEvidence(
    node: ts.ClassDeclaration,
    sourceFile: ts.SourceFile,
    sourcePath: string,
    result: SemanticLabelEvidence[],
  ) {
    const className = node.name!.text;
    const controllerTarget = stripSuffix(className, 'Controller');
    const controller = decoratorCall(node, 'Controller');
    const controllerPath = stringArgument(controller);
    if (controller && controllerTarget && controllerPath) {
      result.push(
        semanticEvidence(sourceFile, node, sourcePath, {
          targetSymbol: controllerTarget,
          label: controllerPath,
          sourceType: 'controller',
          sourceSymbol: className,
          confidence: 0.75,
        }),
      );
    }

    const dtoTarget = normalizeDtoTarget(className);
    if (dtoTarget === className) return;
    for (const property of node.members.filter(ts.isPropertyDeclaration)) {
      if (!property.name) continue;
      const apiProperty = decoratorCall(property, 'ApiProperty') ?? decoratorCall(property, 'ApiPropertyOptional');
      const options = apiProperty?.arguments[0];
      if (!options || !ts.isObjectLiteralExpression(options)) continue;
      const label =
        objectString(options, 'description') ?? objectString(options, 'title') ?? objectString(options, 'name');
      if (!label) continue;
      const fieldName = property.name.getText(sourceFile).replace(/["']/g, '');
      result.push(
        semanticEvidence(sourceFile, property, sourcePath, {
          targetSymbol: `${dtoTarget}.${fieldName}`,
          label,
          sourceType: 'dto',
          sourceSymbol: `${className}.${fieldName}`,
          confidence: 0.85,
        }),
      );
    }
  }

  private scanObjectEvidence(
    node: ts.ObjectLiteralExpression,
    sourceFile: ts.SourceFile,
    sourcePath: string,
    result: SemanticLabelEvidence[],
  ) {
    const targetSymbol =
      objectString(node, 'entity') ?? objectString(node, 'model') ?? objectString(node, 'targetModel');
    const routeLabel = objectString(node, 'title');
    const menuLabel = objectString(node, 'label');
    if (!targetSymbol && !routeLabel && !menuLabel) return;
    const bindingTarget = targetSymbol ?? '__unbound__';
    if (routeLabel) {
      result.push(
        semanticEvidence(sourceFile, node, sourcePath, {
          targetSymbol: bindingTarget,
          label: routeLabel,
          sourceType: 'route',
          sourceSymbol: objectString(node, 'path'),
          confidence: 0.8,
          metadata: targetSymbol ? { binding: 'explicit' } : { binding: 'unbound' },
        }),
      );
    }
    if (menuLabel) {
      result.push(
        semanticEvidence(sourceFile, node, sourcePath, {
          targetSymbol: bindingTarget,
          label: menuLabel,
          sourceType: 'menu',
          sourceSymbol: objectString(node, 'path'),
          confidence: 0.8,
          metadata: targetSymbol ? { binding: 'explicit' } : { binding: 'unbound' },
        }),
      );
    }
  }
}

function candidate(input: {
  kind: BusinessDefinitionCandidateDraft['kind'];
  structuralSymbol: string;
  payload: Record<string, unknown>;
  storeScope: Record<string, unknown>;
  evidence: BusinessDefinitionCandidateEvidence[];
  semanticEvidence: SemanticLabelEvidence[];
}): BusinessDefinitionCandidateDraft {
  const identity = deriveCanonicalOntologyIdentity(input.kind, input.payload);
  if (!identity) throw new Error(`ontology_candidate_identity_invalid:${input.kind}`);
  const labels = input.semanticEvidence.filter((item) => item.targetSymbol === input.structuralSymbol);
  const aliases = [
    ...new Set(
      labels
        .filter((item) => !item.conflictGroup && item.confidence >= 0.8)
        .map((item) => item.label.trim())
        .filter(Boolean),
    ),
  ].sort();
  return {
    definitionKey: identity.definitionKey,
    kind: input.kind,
    domain: identity.domain,
    name: identity.name,
    ownerType: identity.ownerType,
    ownerId: identity.ownerId,
    lifecycleStatus: 'candidate',
    schemaVersion: identity.schemaVersion,
    payload: { ...input.payload, aliases },
    storeScope: input.storeScope,
    evidence: [
      ...input.evidence,
      ...labels.map((item) => ({
        sourceType: item.sourceType,
        sourcePath: item.sourcePath,
        sourceSymbol: item.sourceSymbol,
        lineStart: item.lineStart,
        lineEnd: item.lineStart,
        evidenceKind: 'alias_observation',
        confidence: item.confidence,
        conflictGroup: item.conflictGroup,
        observedLabel: item.label,
      })),
    ],
  };
}

function modelEvidence(
  source: { name: string; sourcePath?: string; lineStart?: number },
  evidenceKind: string,
): BusinessDefinitionCandidateEvidence[] {
  return [
    {
      sourceType: source.sourcePath ? 'prisma_schema_ast' : 'prisma_dmmf',
      sourcePath: source.sourcePath ?? PRISMA_SCHEMA_PATH,
      sourceSymbol: source.name,
      lineStart: source.lineStart,
      lineEnd: source.lineStart,
      evidenceKind,
      confidence: 1,
    },
  ];
}

function fieldEvidence(model: string, field: PrismaFieldAst, evidenceKind: string) {
  return [
    {
      sourceType: field.sourcePath ? 'prisma_schema_ast' : 'prisma_dmmf',
      sourcePath: field.sourcePath ?? PRISMA_SCHEMA_PATH,
      sourceSymbol: `${model}.${field.name}`,
      lineStart: field.lineStart,
      lineEnd: field.lineStart,
      evidenceKind,
      confidence: 1,
    },
  ];
}

function semanticEvidence(
  sourceFile: ts.SourceFile,
  node: ts.Node,
  sourcePath: string,
  input: Omit<SemanticLabelEvidence, 'sourcePath' | 'lineStart'>,
): SemanticLabelEvidence {
  return {
    ...input,
    sourcePath,
    lineStart: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
  };
}

function decoratorCall(node: ts.Node, name: string): ts.CallExpression | undefined {
  if (!ts.canHaveDecorators(node)) return undefined;
  for (const decorator of ts.getDecorators(node) ?? []) {
    if (ts.isCallExpression(decorator.expression) && decorator.expression.expression.getText() === name) {
      return decorator.expression;
    }
  }
  return undefined;
}

function stringArgument(call: ts.CallExpression | undefined): string | undefined {
  const value = call?.arguments[0];
  return value && ts.isStringLiteralLike(value) ? value.text : undefined;
}

function objectString(node: ts.ObjectLiteralExpression, name: string): string | undefined {
  const property = node.properties.find(
    (item): item is ts.PropertyAssignment =>
      ts.isPropertyAssignment(item) && item.name.getText().replace(/["']/g, '') === name,
  );
  return property?.initializer && ts.isStringLiteralLike(property.initializer) ? property.initializer.text : undefined;
}

function stripSuffix(value: string, suffix: string) {
  return value.endsWith(suffix) ? value.slice(0, -suffix.length) : value;
}

function normalizeDtoTarget(value: string) {
  const wrappers = ['Dto', 'Input', 'Query', 'Response', 'Request'];
  const operations = ['Create', 'Update', 'Patch', 'Delete', 'Get', 'List', 'Search', 'Find'];
  let target = stripAffixes(value, wrappers);
  target = stripAffixes(target, operations);
  target = stripAffixes(target, wrappers);
  return target;
}

function stripAffixes(value: string, affixes: string[]) {
  let result = value;
  for (const affix of affixes) {
    if (result.startsWith(affix) && result.length > affix.length) result = result.slice(affix.length);
    if (result.endsWith(affix) && result.length > affix.length) result = result.slice(0, -affix.length);
  }
  return result;
}

function applyGlobalAliasConflicts(evidence: SemanticLabelEvidence[]) {
  const conflicts = findSemanticAliasConflicts(evidence);
  return evidence.map((item) => {
    const normalized = normalizeSemanticAlias(item.label);
    if (!conflicts.has(normalized)) return item;
    return {
      ...item,
      conflictGroup: item.conflictGroup ?? `alias_ambiguity:${normalized}`,
    };
  });
}

function dedupeSemanticEvidence(evidence: SemanticLabelEvidence[]) {
  const seen = new Set<string>();
  return evidence.filter((item) => {
    const key = [item.targetSymbol, item.label, item.sourceType, item.sourcePath, item.lineStart].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
