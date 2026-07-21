import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { extname, relative, resolve, sep } from 'node:path';
import * as ts from 'typescript';
import type {
  BrainCapabilityDecoratorMetadata,
  BrainCapabilityExecutionKind,
  BrainCapabilitySourceEvidence,
  BrainCapabilitySourceType,
} from './brain-capability-scan.types.js';

const PERMISSION_PATTERN = /^[a-z][a-z0-9-]*:[a-z0-9-]+:[a-z0-9-]+$/;
const HTTP_DECORATORS = new Map([
  ['Get', 'GET'],
  ['Post', 'POST'],
  ['Put', 'PUT'],
  ['Patch', 'PATCH'],
  ['Delete', 'DELETE'],
]);

export interface BrainCapabilitySourceRecords {
  evidence: BrainCapabilitySourceEvidence[];
  dtoContracts: Map<string, Record<string, string>>;
  registeredPermissions: Set<string>;
}

export async function scanBrainCapabilitySources(workspaceRoot: string): Promise<BrainCapabilitySourceRecords> {
  const root = resolve(workspaceRoot);
  const evidence: BrainCapabilitySourceEvidence[] = [];
  const dtoContracts = new Map<string, Record<string, string>>();
  const registeredPermissions = new Set<string>();
  const sourceRoots = [
    'packages/server-v2/src',
    'src/api',
    'src/app/routes.tsx',
    'src/app/components/Layout.tsx',
    'src/config/permissions.ts',
  ];

  for (const sourceRoot of sourceRoots) {
    for (const absolutePath of await collectSourceFiles(resolve(root, sourceRoot))) {
      const sourceText = await readFile(absolutePath, 'utf8');
      const path = normalizePath(relative(root, absolutePath));
      const sourceFile = ts.createSourceFile(
        absolutePath,
        sourceText,
        ts.ScriptTarget.Latest,
        true,
        extname(absolutePath).toLowerCase() === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      const parseDiagnostics = (sourceFile as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] })
        .parseDiagnostics;
      for (const diagnostic of parseDiagnostics ?? []) {
        const position = diagnostic.start ?? 0;
        evidence.push({
          sourceType: 'parser',
          path,
          line: sourceFile.getLineAndCharacterOfPosition(position).line + 1,
          symbol: 'typescript_parse_error',
          data: { message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n') },
        });
      }
      scanTypeScriptFile(sourceFile, path, evidence, dtoContracts, registeredPermissions);
    }
  }

  const prismaPath = resolve(root, 'packages/server-v2/prisma/schema.prisma');
  try {
    evidence.push(...parsePrismaSchema(await readFile(prismaPath, 'utf8'), normalizePath(relative(root, prismaPath))));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  return { evidence, dtoContracts, registeredPermissions };
}

async function collectSourceFiles(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    const nested = await Promise.all(
      entries
        .filter((entry) => !['node_modules', 'dist', 'coverage'].includes(entry.name))
        .map((entry) => collectSourceFiles(resolve(path, entry.name))),
    );
    return nested.flat();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOTDIR') {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    return ['.ts', '.tsx'].includes(extname(path).toLowerCase()) && !path.endsWith('.spec.ts') ? [path] : [];
  }
}

function scanTypeScriptFile(
  sourceFile: ts.SourceFile,
  path: string,
  evidence: BrainCapabilitySourceEvidence[],
  dtoContracts: Map<string, Record<string, string>>,
  registeredPermissions: Set<string>,
) {
  const visit = (node: ts.Node) => {
    if (ts.isInterfaceDeclaration(node)) {
      scanInterfaceContract(node, sourceFile, path, evidence, dtoContracts);
    }
    if (ts.isClassDeclaration(node) && node.name) {
      scanClass(node, sourceFile, path, evidence, dtoContracts);
    }
    if (isRouteOrMenuPath(path) && ts.isObjectLiteralExpression(node)) {
      scanRouteOrMenu(node, sourceFile, path, evidence);
    }
    if (isFacadePath(path) && (ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node))) {
      scanFacade(node, sourceFile, path, evidence);
    }
    if (path === 'src/config/permissions.ts' && ts.isStringLiteralLike(node) && PERMISSION_PATTERN.test(node.text)) {
      registeredPermissions.add(node.text);
      evidence.push(record('permission', path, sourceFile, node, node.text, { code: node.text }));
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

function scanInterfaceContract(
  node: ts.InterfaceDeclaration,
  sourceFile: ts.SourceFile,
  path: string,
  evidence: BrainCapabilitySourceEvidence[],
  dtoContracts: Map<string, Record<string, string>>,
) {
  const name = node.name.text;
  if (!/(Dto|Args|Input)$/.test(name) && !path.includes('/dto/')) return;
  const fields = Object.fromEntries(
    node.members
      .filter(ts.isPropertySignature)
      .filter((member) => member.name)
      .map((member) => [
        member.name.getText(sourceFile).replace(/["']/g, ''),
        `${member.questionToken ? 'optional:' : 'required:'}${normalizeTypeScriptText(member.type?.getText(sourceFile) ?? 'unknown')}`,
      ]),
  );
  dtoContracts.set(name, fields);
  evidence.push(record('dto', path, sourceFile, node, name, { fields }));
}

function scanClass(
  node: ts.ClassDeclaration,
  sourceFile: ts.SourceFile,
  path: string,
  evidence: BrainCapabilitySourceEvidence[],
  dtoContracts: Map<string, Record<string, string>>,
) {
  const className = node.name!.text;
  const exportedClass = hasModifier(node, ts.SyntaxKind.ExportKeyword);
  const executorKind = classStringProperty(node, sourceFile, 'kind');
  const controllerDecorator = decoratorCall(node, 'Controller');
  const classPermissions = decoratorStrings(node, 'Permissions');
  const constructorParameters = node.members
    .filter(ts.isConstructorDeclaration)
    .flatMap((constructor) => constructor.parameters);
  const serviceBindings = Object.fromEntries(
    constructorParameters
      .filter((parameter) => parameter.name && parameter.type)
      .map((parameter) => [
        parameter.name.getText(sourceFile),
        normalizeTypeScriptText(parameter.type!.getText(sourceFile)),
      ]),
  );
  const injectionBindings = Object.fromEntries(
    constructorParameters.flatMap((parameter) => {
      const injection = decoratorCall(parameter, 'Inject')?.arguments[0];
      return parameter.name && injection
        ? [[parameter.name.getText(sourceFile), injection.getText(sourceFile)]]
        : [];
    }),
  );

  scanNestModuleProviders(node, sourceFile, path, evidence);

  if (/Dto$/.test(className) || path.includes('/dto/')) {
    const fields = Object.fromEntries(
      node.members
        .filter(ts.isPropertyDeclaration)
        .filter((member) => member.name)
        .map((member) => [
          member.name.getText(sourceFile).replace(/["']/g, ''),
          `${member.questionToken ? 'optional:' : 'required:'}${normalizeTypeScriptText(member.type?.getText(sourceFile) ?? 'unknown')}`,
        ]),
    );
    dtoContracts.set(className, fields);
    evidence.push(record('dto', path, sourceFile, node, className, { fields }));
  }

  if (controllerDecorator) {
    const controllerPath = firstStringArgument(controllerDecorator) ?? '';
    for (const method of node.members.filter(ts.isMethodDeclaration)) {
      const http = [...HTTP_DECORATORS.entries()].find(([name]) => decoratorCall(method, name));
      if (!http || !method.name) continue;
      const [decoratorName, httpMethod] = http;
      const methodPath = firstStringArgument(decoratorCall(method, decoratorName)) ?? '';
      const ownPermissions = decoratorStrings(method, 'Permissions');
      const permissions = ownPermissions.length > 0 ? ownPermissions : classPermissions;
      const capability = decoratorObject(method, 'BrainCapability') ?? decoratorObject(node, 'BrainCapability');
      const inputTypes = method.parameters.map((parameter) =>
        normalizeTypeScriptText(parameter.type?.getText(sourceFile) ?? 'unknown'),
      );
      const returnType = normalizeTypeScriptText(method.type?.getText(sourceFile) ?? 'unknown');
      const serviceCalls = collectPropertyCalls(method, sourceFile);
      const methodSemantics = collectMethodSemanticEvidence(method, sourceFile);
      const symbol = `${className}.${method.name.getText(sourceFile)}`;
      const executorTarget = {
        kind: 'controller',
        ...(executorKind ? { executorKind } : {}),
        className,
        methodName: method.name.getText(sourceFile),
        sourcePath: path,
        exportedClass,
        methodAccess: methodAccess(method),
        parameterCount: method.parameters.length,
        parameterTypes: inputTypes,
        returnType,
      } as const;
      evidence.push(
        record('controller', path, sourceFile, method, symbol, {
          controllerPath,
          methodPath,
          httpMethod,
          permissions,
          inputTypes,
          returnType,
          serviceCalls,
          serviceBindings,
          injectionBindings,
          executorTarget,
          methodSemantics,
          writeHint: httpMethod !== 'GET',
          capability,
        }),
      );
      if (capability) evidence.push(record('decorator', path, sourceFile, method, symbol, { ...capability }));
    }
    return;
  }

  const hasCapabilityMethod = node.members
    .filter(ts.isMethodDeclaration)
    .some((method) => Boolean(decoratorObject(method, 'BrainCapability')));
  if (/Service$/.test(className) || Boolean(decoratorCall(node, 'Injectable')) || hasCapabilityMethod) {
    for (const method of node.members.filter(ts.isMethodDeclaration)) {
      if (!method.name) continue;
      const prismaOperations = collectPrismaOperations(method, sourceFile);
      const inputTypes = method.parameters.map((parameter) =>
        normalizeTypeScriptText(parameter.type?.getText(sourceFile) ?? 'unknown'),
      );
      const returnType = normalizeTypeScriptText(method.type?.getText(sourceFile) ?? 'unknown');
      const methodSemantics = collectMethodSemanticEvidence(method, sourceFile);
      const capability = decoratorObject(method, 'BrainCapability') ?? decoratorObject(node, 'BrainCapability');
      const symbol = `${className}.${method.name.getText(sourceFile)}`;
      const executorTarget = {
        kind: 'service',
        ...(executorKind ? { executorKind } : {}),
        className,
        methodName: method.name.getText(sourceFile),
        sourcePath: path,
        exportedClass,
        methodAccess: methodAccess(method),
        parameterCount: method.parameters.length,
        parameterTypes: inputTypes,
        returnType,
      } as const;
      evidence.push(
        record('service', path, sourceFile, method, symbol, {
          serviceClass: className,
          executorTarget,
          inputTypes,
          returnType,
          prismaOperations,
          methodSemantics,
          serviceBindings,
          injectionBindings,
          writes: prismaOperations.some((operation) => isPrismaWriteOperation(operation)),
          capability,
        }),
      );
      if (capability) evidence.push(record('decorator', path, sourceFile, method, symbol, { ...capability }));
    }
  }

  scanGovernanceEvidence(node, sourceFile, path, evidence, className);
}

function scanNestModuleProviders(
  node: ts.ClassDeclaration,
  sourceFile: ts.SourceFile,
  path: string,
  evidence: BrainCapabilitySourceEvidence[],
) {
  const moduleArgument = decoratorCall(node, 'Module')?.arguments[0];
  if (!moduleArgument || !ts.isObjectLiteralExpression(moduleArgument)) return;
  const providers = objectProperty(moduleArgument, 'providers');
  if (!providers || !ts.isArrayLiteralExpression(providers)) return;
  for (const provider of providers.elements) {
    if (!ts.isObjectLiteralExpression(provider)) continue;
    const provide = objectProperty(provider, 'provide');
    if (!provide) continue;
    const inject = objectProperty(provider, 'inject');
    const dependencies = inject && ts.isArrayLiteralExpression(inject)
      ? inject.elements.map((item) => item.getText(sourceFile)).filter(Boolean)
      : [];
    const useExisting = objectProperty(provider, 'useExisting')?.getText(sourceFile);
    if (useExisting) dependencies.push(useExisting);
    evidence.push(record('provider', path, sourceFile, provider, provide.getText(sourceFile), {
      dependencies: [...new Set(dependencies)].sort(),
    }));
  }
}

function scanGovernanceEvidence(
  node: ts.ClassDeclaration,
  sourceFile: ts.SourceFile,
  path: string,
  evidence: BrainCapabilitySourceEvidence[],
  className: string,
) {
  const text = node.getText(sourceFile);
  const lowered = text.toLowerCase();
  if (/confirmation|confirmaction|approval/.test(lowered)) {
    evidence.push(record('approval', path, sourceFile, node, className, { token: 'confirmation_or_approval' }));
  }
  if (/idempot|requestkey|executionkey/.test(lowered)) {
    evidence.push(record('idempotency', path, sourceFile, node, className, { token: 'idempotency' }));
  }
  if (/\w+Event\.create|event\.create|emit\(/.test(text)) {
    evidence.push(record('event', path, sourceFile, node, className, { token: 'business_event' }));
  }
}

function scanRouteOrMenu(
  node: ts.ObjectLiteralExpression,
  sourceFile: ts.SourceFile,
  path: string,
  evidence: BrainCapabilitySourceEvidence[],
) {
  const routePath = objectString(node, 'path');
  if (!routePath) return;
  const guard = objectCall(node, 'element', 'withGuard');
  const handle = objectProperty(node, 'handle');
  const permission =
    objectString(node, 'permission') ??
    (handle && ts.isObjectLiteralExpression(handle) ? objectString(handle, 'permission') : undefined) ??
    (guard?.arguments[0] && ts.isStringLiteralLike(guard.arguments[0]) ? guard.arguments[0].text : undefined);
  const component = guard?.arguments[1]?.getText(sourceFile);
  const title = objectString(node, 'title');
  evidence.push(
    record(path.endsWith('Layout.tsx') ? 'menu' : 'route', path, sourceFile, node, routePath, {
      path: routePath.startsWith('/') ? routePath : `/${routePath}`,
      permission,
      component,
      title,
    }),
  );
}

function scanFacade(
  node: ts.FunctionDeclaration | ts.VariableDeclaration,
  sourceFile: ts.SourceFile,
  path: string,
  evidence: BrainCapabilitySourceEvidence[],
) {
  const name = node.name?.getText(sourceFile);
  if (!name) return;
  if (!isExported(node)) return;
  const text = node.getText(sourceFile);
  if (!/real[A-Z]|apiClient\.|Promise</.test(text)) return;
  const apiCall = findApiCall(node, sourceFile);
  const type = path.includes('/real/') ? 'real_facade' : 'facade';
  evidence.push(
    record(type, path, sourceFile, node, name, {
      httpMethod: apiCall?.method,
      url: apiCall?.url,
      signature: normalizeTypeScriptText(text),
      writeHint: apiCall ? apiCall.method !== 'GET' : /create|update|delete|refund|cancel|receive/i.test(name),
    }),
  );
}

function isExported(node: ts.Node): boolean {
  let current: ts.Node | undefined = node;
  while (current && !ts.isSourceFile(current)) {
    if (
      ts.canHaveModifiers(current) &&
      ts.getModifiers(current)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function findApiCall(node: ts.Node, sourceFile: ts.SourceFile): { method: string; url?: string } | undefined {
  let result: { method: string; url?: string } | undefined;
  const visit = (child: ts.Node) => {
    if (result) return;
    if (ts.isCallExpression(child) && ts.isPropertyAccessExpression(child.expression)) {
      const owner = child.expression.expression.getText(sourceFile);
      const method = child.expression.name.text.toUpperCase();
      if (owner === 'apiClient' && ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        const first = child.arguments[0];
        result = { method, url: first && ts.isStringLiteralLike(first) ? first.text : first?.getText(sourceFile) };
        return;
      }
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return result;
}

interface PrismaToken {
  value: string;
  line: number;
  kind: 'word' | 'symbol' | 'newline' | 'string';
}

function parsePrismaSchema(source: string, path: string): BrainCapabilitySourceEvidence[] {
  const records: BrainCapabilitySourceEvidence[] = [];
  const tokens = tokenizePrisma(source);
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token?.kind !== 'word' || !['model', 'enum'].includes(token.value)) {
      index += 1;
      continue;
    }
    const kind = token.value as 'model' | 'enum';
    const name = tokens[index + 1];
    const opening = tokens[index + 2];
    if (name?.kind !== 'word' || opening?.value !== '{') {
      records.push(prismaParseError(path, token.line, `Invalid ${kind} declaration.`));
      index += 1;
      continue;
    }
    index += 3;
    const entries: PrismaToken[][] = [];
    let entry: PrismaToken[] = [];
    let nestedDepth = 0;
    let closed = false;
    while (index < tokens.length) {
      const current = tokens[index++]!;
      if (current.value === '}' && nestedDepth === 0) {
        if (entry.length) entries.push(entry);
        closed = true;
        break;
      }
      if (current.value === '(' || current.value === '[') nestedDepth += 1;
      if (current.value === ')' || current.value === ']') nestedDepth = Math.max(0, nestedDepth - 1);
      if (current.kind === 'newline' && nestedDepth === 0) {
        if (entry.length) entries.push(entry);
        entry = [];
        continue;
      }
      entry.push(current);
    }
    if (!closed) records.push(prismaParseError(path, token.line, `Unclosed ${kind} ${name.value}.`));
    for (const item of entries) {
      const meaningful = item.filter((part) => part.kind !== 'newline');
      if (!meaningful.length || meaningful[0]?.value === '@') continue;
      if (kind === 'enum') {
        for (const value of meaningful.filter((part) => part.kind === 'word')) {
          records.push({
            sourceType: 'prisma',
            path,
            line: value.line,
            symbol: `${name.value}.${value.value}`,
            data: { kind: 'enum_value', enum: name.value, value: value.value },
          });
        }
        continue;
      }
      const field = meaningful[0];
      if (field?.kind !== 'word' || meaningful[1]?.kind !== 'word') continue;
      const attributeIndex = meaningful.findIndex((part, partIndex) => part.value === '@' && partIndex > 1);
      const typeEnd = attributeIndex === -1 ? meaningful.length : attributeIndex;
      const type = canonicalPrismaTokens(meaningful.slice(1, typeEnd));
      const attributes = attributeIndex === -1 ? '' : canonicalPrismaTokens(meaningful.slice(attributeIndex));
      records.push({
        sourceType: 'prisma',
        path,
        line: field.line,
        symbol: `${name.value}.${field.value}`,
        data: {
          kind: 'field',
          model: name.value,
          field: field.value,
          type,
          attributes,
          relation: attributes.includes('@relation'),
        },
      });
    }
  }
  return records;
}

function tokenizePrisma(source: string): PrismaToken[] {
  const tokens: PrismaToken[] = [];
  let index = 0;
  let line = 1;
  while (index < source.length) {
    const char = source[index]!;
    const next = source[index + 1];
    if (char === '\n') {
      tokens.push({ value: '\n', line, kind: 'newline' });
      line += 1;
      index += 1;
      continue;
    }
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      index += 2;
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
        if (source[index] === '\n') {
          tokens.push({ value: '\n', line, kind: 'newline' });
          line += 1;
        }
        index += 1;
      }
      index += 2;
      continue;
    }
    if (char === '"') {
      let value = char;
      index += 1;
      while (index < source.length) {
        const current = source[index++]!;
        value += current;
        if (current === '"' && value.at(-2) !== '\\') break;
      }
      tokens.push({ value, line, kind: 'string' });
      continue;
    }
    if (/[A-Za-z0-9_.$-]/.test(char)) {
      let value = '';
      while (index < source.length && /[A-Za-z0-9_.$-]/.test(source[index]!)) value += source[index++]!;
      tokens.push({ value, line, kind: 'word' });
      continue;
    }
    tokens.push({ value: char, line, kind: 'symbol' });
    index += 1;
  }
  return tokens;
}

function canonicalPrismaTokens(tokens: PrismaToken[]): string {
  return tokens
    .map((token) => token.value)
    .join('')
    .replace(/,+/g, ',');
}

function prismaParseError(path: string, line: number, message: string): BrainCapabilitySourceEvidence {
  return { sourceType: 'parser', path, line, symbol: 'prisma_parse_error', data: { message } };
}

function decoratorCall(node: ts.Node, name: string): ts.CallExpression | undefined {
  const decorators = ts.canHaveDecorators(node) ? ts.getDecorators(node) : undefined;
  for (const decorator of decorators ?? []) {
    if (ts.isCallExpression(decorator.expression) && decorator.expression.expression.getText() === name) {
      return decorator.expression;
    }
  }
  return undefined;
}

function decoratorStrings(node: ts.Node, name: string): string[] {
  const values: string[] = [];
  for (const item of decoratorCall(node, name)?.arguments ?? []) {
    if (ts.isStringLiteralLike(item)) values.push(item.text);
  }
  return values;
}

function decoratorObject(node: ts.Node, name: string): BrainCapabilityDecoratorMetadata | undefined {
  const argument = decoratorCall(node, name)?.arguments[0];
  if (!argument || !ts.isObjectLiteralExpression(argument)) return undefined;
  const permissions = objectStringArray(argument, 'permissions');
  const key = objectString(argument, 'key');
  const businessDefinitionKeys = objectStringArray(argument, 'businessDefinitionKeys');
  const readOnly = objectBoolean(argument, 'readOnly');
  const storeScope = objectString(argument, 'storeScope');
  const requiresConfirmation = objectBoolean(argument, 'requiresConfirmation');
  const idempotency = objectString(argument, 'idempotency');
  const mappingOutputs = objectStringArray(argument, 'mappingOutputs');
  if (
    !key ||
    businessDefinitionKeys.length === 0 ||
    readOnly === undefined ||
    !storeScope ||
    requiresConfirmation === undefined ||
    !idempotency
  ) {
    return undefined;
  }
  return {
    key,
    businessDefinitionKeys,
    readOnly,
    storeScope: storeScope as BrainCapabilityDecoratorMetadata['storeScope'],
    permissions,
    allowedRoles: objectStringArray(argument, 'allowedRoles'),
    requiresConfirmation,
    idempotency: idempotency as BrainCapabilityDecoratorMetadata['idempotency'],
    enabled: objectBoolean(argument, 'enabled'),
    name: objectString(argument, 'name'),
    description: objectString(argument, 'description'),
    intents: objectStringArray(argument, 'intents'),
    examples: objectStringArray(argument, 'examples'),
    negativeExamples: objectStringArray(argument, 'negativeExamples'),
    synonyms: objectStringArray(argument, 'synonyms'),
    ...(mappingOutputs.length ? { mappingOutputs } : {}),
  };
}

function objectProperty(node: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
  const property = node.properties.find(
    (item): item is ts.PropertyAssignment =>
      ts.isPropertyAssignment(item) && item.name.getText().replace(/["']/g, '') === name,
  );
  return property?.initializer;
}

function objectString(node: ts.ObjectLiteralExpression, name: string): string | undefined {
  const value = objectProperty(node, name);
  return value && ts.isStringLiteralLike(value) ? value.text : undefined;
}

function objectBoolean(node: ts.ObjectLiteralExpression, name: string): boolean | undefined {
  const value = objectProperty(node, name);
  if (value?.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (value?.kind === ts.SyntaxKind.FalseKeyword) return false;
  return undefined;
}

function objectStringArray(node: ts.ObjectLiteralExpression, name: string): string[] {
  const value = objectProperty(node, name);
  return value && ts.isArrayLiteralExpression(value)
    ? value.elements.filter(ts.isStringLiteralLike).map((item) => item.text)
    : [];
}

function objectCall(
  node: ts.ObjectLiteralExpression,
  propertyName: string,
  callName: string,
): ts.CallExpression | undefined {
  const value = objectProperty(node, propertyName);
  return value && ts.isCallExpression(value) && value.expression.getText() === callName ? value : undefined;
}

function firstStringArgument(call: ts.CallExpression | undefined): string | undefined {
  const first = call?.arguments[0];
  return first && ts.isStringLiteralLike(first) ? first.text : undefined;
}

function classStringProperty(
  node: ts.ClassDeclaration,
  sourceFile: ts.SourceFile,
  name: string,
): BrainCapabilityExecutionKind | undefined {
  const property = node.members.find(
    (member): member is ts.PropertyDeclaration =>
      ts.isPropertyDeclaration(member) && member.name?.getText(sourceFile).replace(/["']/g, '') === name,
  );
  const value = stringLiteralExpression(property?.initializer);
  return value && ['semantic', 'domain', 'action'].includes(value)
    ? (value as BrainCapabilityExecutionKind)
    : undefined;
}

function stringLiteralExpression(value: ts.Expression | undefined): string | undefined {
  if (!value) return undefined;
  if (ts.isStringLiteralLike(value)) return value.text;
  if (ts.isAsExpression(value) || ts.isTypeAssertionExpression(value) || ts.isParenthesizedExpression(value)) {
    return stringLiteralExpression(value.expression);
  }
  return undefined;
}

function collectPropertyCalls(node: ts.Node, sourceFile: ts.SourceFile): string[] {
  const calls = new Set<string>();
  const visit = (child: ts.Node) => {
    if (ts.isCallExpression(child) && ts.isPropertyAccessExpression(child.expression)) {
      calls.add(child.expression.getText(sourceFile));
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return [...calls].sort();
}

function collectPrismaOperations(node: ts.Node, sourceFile: ts.SourceFile): string[] {
  const operations = new Set<string>();
  const transactionAliases = new Set<string>();
  const visit = (child: ts.Node) => {
    if (ts.isCallExpression(child) && ts.isPropertyAccessExpression(child.expression)) {
      if (child.expression.name.text === '$transaction') {
        const owner = child.expression.expression.getText(sourceFile);
        const callback = child.arguments[0];
        if (
          (owner === 'this.prisma' || owner === 'prisma') &&
          callback &&
          (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))
        ) {
          for (const parameter of callback.parameters) {
            if (ts.isIdentifier(parameter.name)) transactionAliases.add(parameter.name.text);
          }
        }
      }
      const operation = child.expression.name.text;
      const modelAccess = child.expression.expression;
      if (ts.isPropertyAccessExpression(modelAccess)) {
        const owner = modelAccess.expression.getText(sourceFile);
        if (owner === 'this.prisma' || owner === 'prisma' || transactionAliases.has(owner)) {
          operations.add(`${modelAccess.name.text}.${operation}`);
        }
      }
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return [...operations].sort();
}

function collectMethodSemanticEvidence(node: ts.MethodDeclaration, sourceFile: ts.SourceFile) {
  const body = node.body;
  const printedBody = body
    ? ts.createPrinter({ removeComments: true }).printNode(ts.EmitHint.Unspecified, body, sourceFile)
    : '';
  const queryClauses = new Set<string>();
  const storeScopeReferences = new Set<string>();
  const controlFlow = new Set<string>();
  const visit = (child: ts.Node) => {
    if (
      ts.isPropertyAssignment(child) ||
      ts.isShorthandPropertyAssignment(child) ||
      ts.isPropertyAccessExpression(child)
    ) {
      const name = ts.isPropertyAccessExpression(child)
        ? child.name.text
        : child.name.getText(sourceFile).replace(/["']/g, '');
      if (['where', 'select', 'include', 'orderBy', 'take', 'skip', 'cursor', 'distinct'].includes(name)) {
        queryClauses.add(name);
      }
      if (/^(store|shop|branch)Id$/i.test(name)) storeScopeReferences.add(name);
    }
    if (ts.isIdentifier(child) && /^(store|shop|branch)Id$/i.test(child.text)) {
      storeScopeReferences.add(child.text);
    }
    if (
      ts.isIfStatement(child) ||
      ts.isSwitchStatement(child) ||
      ts.isConditionalExpression(child) ||
      ts.isForStatement(child) ||
      ts.isForOfStatement(child) ||
      ts.isForInStatement(child) ||
      ts.isWhileStatement(child) ||
      ts.isDoStatement(child) ||
      ts.isTryStatement(child) ||
      ts.isThrowStatement(child) ||
      ts.isReturnStatement(child)
    ) {
      controlFlow.add(ts.SyntaxKind[child.kind]);
    }
    ts.forEachChild(child, visit);
  };
  if (body) visit(body);
  return {
    bodyFingerprint: createHash('sha256').update(normalizeTypeScriptText(printedBody)).digest('hex'),
    propertyCalls: collectPropertyCalls(node, sourceFile),
    prismaOperations: collectPrismaOperations(node, sourceFile),
    queryClauses: [...queryClauses].sort(),
    storeScopeReferences: [...storeScopeReferences].sort(),
    controlFlow: [...controlFlow].sort(),
  };
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return Boolean(ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((modifier) => modifier.kind === kind));
}

function methodAccess(node: ts.MethodDeclaration): 'public' | 'protected' | 'private' {
  if (hasModifier(node, ts.SyntaxKind.PrivateKeyword)) return 'private';
  if (hasModifier(node, ts.SyntaxKind.ProtectedKeyword)) return 'protected';
  return 'public';
}

function isPrismaWriteOperation(operation: string): boolean {
  return /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)$/.test(operation);
}

function record(
  sourceType: BrainCapabilitySourceType,
  path: string,
  sourceFile: ts.SourceFile,
  node: ts.Node,
  symbol: string,
  data: Record<string, unknown>,
): BrainCapabilitySourceEvidence {
  return {
    sourceType,
    path,
    line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
    symbol,
    data,
  };
}

function isRouteOrMenuPath(path: string): boolean {
  return path === 'src/app/routes.tsx' || path === 'src/app/components/Layout.tsx';
}

function isFacadePath(path: string): boolean {
  return path.startsWith('src/api/') && !path.endsWith('.test.ts');
}

function normalizePath(path: string): string {
  return path.split(sep).join('/');
}

function normalizeTypeScriptText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}():;,<>=])\s*/g, '$1')
    .trim();
}
