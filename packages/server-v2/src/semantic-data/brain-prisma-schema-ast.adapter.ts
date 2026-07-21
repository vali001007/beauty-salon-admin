import type {
  PrismaDatamodelAst,
  PrismaEnumAst,
  PrismaFieldAst,
  PrismaModelAst,
} from './brain-semantic-candidate.types.js';

type TokenKind = 'identifier' | 'string' | 'symbol' | 'newline';

interface Token {
  kind: TokenKind;
  value: string;
  line: number;
}

interface Declaration {
  kind: 'model' | 'enum';
  name: string;
  line: number;
  body: Token[];
}

const SCALAR_TYPES = new Set([
  'String',
  'Boolean',
  'Int',
  'BigInt',
  'Float',
  'Decimal',
  'DateTime',
  'Json',
  'Bytes',
  'Unsupported',
]);

export class BrainPrismaSchemaAstAdapter {
  parse(schema: string, sourcePath: string): PrismaDatamodelAst {
    const declarations = parseDeclarations(tokenize(schema));
    const modelNames = new Set(declarations.filter((item) => item.kind === 'model').map((item) => item.name));
    const enumNames = new Set(declarations.filter((item) => item.kind === 'enum').map((item) => item.name));
    const models = declarations
      .filter((item): item is Declaration & { kind: 'model' } => item.kind === 'model')
      .map((item) => parseModel(item, sourcePath, modelNames, enumNames));
    const enums = declarations
      .filter((item): item is Declaration & { kind: 'enum' } => item.kind === 'enum')
      .map((item) => parseEnum(item, sourcePath));
    return { models, enums };
  }

  mergeWithDmmf(dmmf: PrismaDatamodelAst, schema: string, sourcePath: string): PrismaDatamodelAst {
    const parsed = this.parse(schema, sourcePath);
    const dmmfModels = new Map((dmmf.models ?? []).map((model) => [model.name, model]));
    return {
      models: parsed.models.map((model) => {
        const dmmfModel = dmmfModels.get(model.name);
        if (!dmmfModel) return model;
        const dmmfFields = new Map(dmmfModel.fields.map((field) => [field.name, field]));
        return {
          ...model,
          fields: model.fields.map((field) => ({ ...dmmfFields.get(field.name), ...field })),
        };
      }),
      enums: parsed.enums,
    };
  }
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  let line = 1;
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '\r') {
      index += 1;
      continue;
    }
    if (char === '\n') {
      tokens.push({ kind: 'newline', value: '\n', line });
      line += 1;
      index += 1;
      continue;
    }
    if (isSpace(char)) {
      index += 1;
      continue;
    }
    if (char === '/' && next === '/') {
      index += 2;
      while (index < source.length && source[index] !== '\n') index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      index += 2;
      while (index < source.length) {
        if (source[index] === '\n') {
          tokens.push({ kind: 'newline', value: '\n', line });
          line += 1;
          index += 1;
          continue;
        }
        if (source[index] === '*' && source[index + 1] === '/') {
          index += 2;
          break;
        }
        index += 1;
      }
      continue;
    }
    if (char === '"') {
      let value = '';
      index += 1;
      while (index < source.length) {
        const current = source[index];
        if (current === '\\' && index + 1 < source.length) {
          value += source[index + 1];
          index += 2;
          continue;
        }
        if (current === '"') {
          index += 1;
          break;
        }
        value += current;
        index += 1;
      }
      tokens.push({ kind: 'string', value, line });
      continue;
    }
    if (isIdentifierStart(char)) {
      let value = '';
      while (index < source.length && isIdentifierPart(source[index])) {
        value += source[index];
        index += 1;
      }
      tokens.push({ kind: 'identifier', value, line });
      continue;
    }
    tokens.push({ kind: 'symbol', value: char, line });
    index += 1;
  }
  return tokens;
}

function parseDeclarations(tokens: Token[]): Declaration[] {
  const declarations: Declaration[] = [];
  let index = 0;
  while (index < tokens.length) {
    const kindToken = tokens[index];
    if (kindToken?.kind !== 'identifier' || (kindToken.value !== 'model' && kindToken.value !== 'enum')) {
      index += 1;
      continue;
    }
    const nameToken = nextNonNewline(tokens, index + 1);
    if (!nameToken || nameToken.token.kind !== 'identifier') {
      index += 1;
      continue;
    }
    const opening = nextNonNewline(tokens, nameToken.index + 1);
    if (!opening || opening.token.value !== '{') {
      index += 1;
      continue;
    }
    const body: Token[] = [];
    let depth = 1;
    index = opening.index + 1;
    while (index < tokens.length && depth > 0) {
      const token = tokens[index];
      if (token.value === '{') depth += 1;
      if (token.value === '}') depth -= 1;
      if (depth > 0) body.push(token);
      index += 1;
    }
    declarations.push({
      kind: kindToken.value,
      name: nameToken.token.value,
      line: kindToken.line,
      body,
    });
  }
  return declarations;
}

function parseModel(
  declaration: Declaration,
  sourcePath: string,
  modelNames: Set<string>,
  enumNames: Set<string>,
): PrismaModelAst {
  const fields = splitEntries(declaration.body)
    .map((entry) => parseField(entry, sourcePath, modelNames, enumNames))
    .filter((field): field is PrismaFieldAst => Boolean(field));
  return { name: declaration.name, fields, sourcePath, lineStart: declaration.line };
}

function parseEnum(declaration: Declaration, sourcePath: string): PrismaEnumAst {
  const values = splitEntries(declaration.body)
    .filter((entry) => entry.find((token) => token.kind !== 'newline')?.value !== '@')
    .map((entry) => entry.find((token) => token.kind === 'identifier'))
    .filter((token): token is Token => Boolean(token))
    .filter((token) => token.value.charAt(0) !== '@')
    .map((token) => token.value);
  return { name: declaration.name, values, sourcePath, lineStart: declaration.line };
}

function parseField(
  entry: Token[],
  sourcePath: string,
  modelNames: Set<string>,
  enumNames: Set<string>,
): PrismaFieldAst | undefined {
  const meaningful = entry.filter((token) => token.kind !== 'newline');
  if (!meaningful.length || meaningful[0].value === '@') return undefined;
  const name = meaningful[0];
  const type = meaningful[1];
  if (name?.kind !== 'identifier' || type?.kind !== 'identifier') return undefined;
  const typeSuffix = meaningful.slice(2, firstAttributeIndex(meaningful));
  const isList = containsSequence(typeSuffix, ['[', ']']);
  const isRequired = !typeSuffix.some((token) => token.value === '?');
  const kind: PrismaFieldAst['kind'] = modelNames.has(type.value)
    ? 'object'
    : enumNames.has(type.value)
      ? 'enum'
      : SCALAR_TYPES.has(type.value)
        ? 'scalar'
        : 'unsupported';
  const relation = parseRelationAttribute(meaningful);
  return {
    name: name.value,
    kind,
    type: type.value,
    isRequired,
    isList,
    isId: hasAttribute(meaningful, 'id'),
    isUnique: hasAttribute(meaningful, 'unique') || hasAttribute(meaningful, 'id'),
    relationName: relation.name,
    relationFromFields: relation.fields,
    relationToFields: relation.references,
    sourcePath,
    lineStart: name.line,
  };
}

function splitEntries(tokens: Token[]): Token[][] {
  const entries: Token[][] = [];
  let current: Token[] = [];
  let parenthesisDepth = 0;
  let bracketDepth = 0;
  for (const token of tokens) {
    if (token.value === '(') parenthesisDepth += 1;
    if (token.value === ')') parenthesisDepth = Math.max(0, parenthesisDepth - 1);
    if (token.value === '[') bracketDepth += 1;
    if (token.value === ']') bracketDepth = Math.max(0, bracketDepth - 1);
    if (token.kind === 'newline' && parenthesisDepth === 0 && bracketDepth === 0) {
      if (current.length) entries.push(current);
      current = [];
      continue;
    }
    current.push(token);
  }
  if (current.length) entries.push(current);
  return entries;
}

function parseRelationAttribute(tokens: Token[]) {
  const relationIndex = findAttribute(tokens, 'relation');
  if (relationIndex < 0) return { name: undefined, fields: [], references: [] };
  const openingIndex = tokens.findIndex((token, index) => index > relationIndex && token.value === '(');
  if (openingIndex < 0) return { name: undefined, fields: [], references: [] };
  const closingIndex = matchingClosing(tokens, openingIndex, '(', ')');
  const argumentsTokens = tokens.slice(openingIndex + 1, closingIndex < 0 ? tokens.length : closingIndex);
  const firstMeaningful = argumentsTokens.find((token) => token.kind !== 'newline');
  return {
    name: firstMeaningful?.kind === 'string' ? firstMeaningful.value : undefined,
    fields: namedArray(argumentsTokens, 'fields'),
    references: namedArray(argumentsTokens, 'references'),
  };
}

function namedArray(tokens: Token[], name: string) {
  const nameIndex = tokens.findIndex((token) => token.kind === 'identifier' && token.value === name);
  if (nameIndex < 0) return [];
  const openingIndex = tokens.findIndex((token, index) => index > nameIndex && token.value === '[');
  if (openingIndex < 0) return [];
  const closingIndex = matchingClosing(tokens, openingIndex, '[', ']');
  return tokens
    .slice(openingIndex + 1, closingIndex < 0 ? tokens.length : closingIndex)
    .filter((token) => token.kind === 'identifier')
    .map((token) => token.value);
}

function hasAttribute(tokens: Token[], name: string) {
  return findAttribute(tokens, name) >= 0;
}

function findAttribute(tokens: Token[], name: string) {
  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (tokens[index].value === '@' && tokens[index + 1].kind === 'identifier' && tokens[index + 1].value === name) {
      return index;
    }
  }
  return -1;
}

function firstAttributeIndex(tokens: Token[]) {
  const index = tokens.findIndex((token) => token.value === '@');
  return index < 0 ? tokens.length : index;
}

function matchingClosing(tokens: Token[], openingIndex: number, opening: string, closing: string) {
  let depth = 0;
  for (let index = openingIndex; index < tokens.length; index += 1) {
    if (tokens[index].value === opening) depth += 1;
    if (tokens[index].value === closing) depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

function containsSequence(tokens: Token[], sequence: string[]) {
  for (let index = 0; index <= tokens.length - sequence.length; index += 1) {
    if (sequence.every((value, offset) => tokens[index + offset].value === value)) return true;
  }
  return false;
}

function nextNonNewline(tokens: Token[], start: number) {
  for (let index = start; index < tokens.length; index += 1) {
    if (tokens[index].kind !== 'newline') return { token: tokens[index], index };
  }
  return undefined;
}

function isSpace(value: string) {
  return value === ' ' || value === '\t' || value === '\f';
}

function isIdentifierStart(value: string) {
  const code = value.charCodeAt(0);
  return value === '_' || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isIdentifierPart(value: string) {
  const code = value.charCodeAt(0);
  return isIdentifierStart(value) || (code >= 48 && code <= 57) || value === '.' || value === '-';
}
