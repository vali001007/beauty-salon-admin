import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import ts from 'typescript';

export const AMI_BRAIN_TEST_QUESTION_BASELINE_SCHEMA = 'ami-brain-test-question-legacy-baseline/v1';
export const AMI_BRAIN_TEST_QUESTION_APPROVED_BASELINE_CHECKSUM =
  '656d6a22f45f50eebece42b6c2e96787bc671fa9c71be451d70af31429442a42';

const DEFAULT_TEST_ROOTS = ['.'];
const SKIPPED_TEST_DIRECTORY_NAMES = new Set([
  '.git',
  'coverage',
  'dist',
  'docs',
  'node_modules',
  'outputs',
  'vendor-src',
]);
const DEFAULT_MANAGED_QUESTION_SOURCES = [
  'packages/server-v2/src/brain/eval/brain-adversarial-eval-cases.ts',
  'packages/server-v2/src/brain/eval/brain-release-eval-gate.ts',
];
const EXCLUDED_NON_BRAIN_TEST_PATH_PREFIXES = [
  'packages/server-v2/src/ask-data-free-sql/',
  'packages/server-v2/src/read-only-sql-kernel/',
];
const TEST_FILE_PATTERN = /(?:\.test|\.spec)\.(?:ts|tsx|js|jsx|mjs)$/u;
const QUESTION_PROPERTY_NAMES = new Set(['question', 'message', 'command', 'input', 'userInput']);
const QUESTION_CALL_NAMES = new Set(['sendMessage', 'submitQuestion', 'askQuestion']);
const QUESTION_CALL_NAME_PATTERN = /(?:question|message|query|prompt|compiler)Input$/iu;
const RESPONSE_MESSAGE_SIBLING_PROPERTIES = new Set([
  'businessObjectType',
  'businessObjectId',
  'receipt',
  'errorCode',
  'recovery',
  'retryable',
  'duplicated',
  'capabilityKey',
]);
const CHINESE_PATTERN = /[\u3400-\u9fff]/u;
const QUESTION_ID_PATTERN = /\bBQ\d{4}\b/gu;
const UNIT_ONLY_MARKER = 'ami-brain-unit-only';
const HISTORICAL_ONLY_MARKER = 'ami-brain-historical-only';
const RUNTIME_INPUT_GOVERNANCE = new Set([
  'suite_manifest_v2',
  'governed_eval_catalog',
  'product_loop_eligibility_v1',
]);
const RUNTIME_QUESTION_IDENTITIES = new Set(['registered_case_id', 'required_cli_question_id']);
const RUNTIME_PRODUCT_ACCEPTANCE = new Set([
  'current_release_test_only',
  'historical_only_non_product_gate',
]);

export function validateAmiBrainTestQuestions({
  repoRoot,
  eligibility,
  legacyBaseline,
  roots = DEFAULT_TEST_ROOTS,
  managedQuestionSources = DEFAULT_MANAGED_QUESTION_SOURCES,
  runtimeQuestionSourceRegistry,
  approvedBaselineChecksum = AMI_BRAIN_TEST_QUESTION_APPROVED_BASELINE_CHECKSUM,
}) {
  assertEligibility(eligibility);
  assertLegacyBaseline(legacyBaseline, approvedBaselineChecksum);
  assertRuntimeQuestionSourceRegistry(repoRoot, runtimeQuestionSourceRegistry);
  const casesById = new Map(eligibility.cases.map((item) => [item.id, item]));
  const allowedCounts = new Map(
    legacyBaseline.allowedUnmarked.map((item) => [legacyKey(item.path, item.questionChecksum), item.count]),
  );
  const allowedDynamicCounts = new Map(
    legacyBaseline.allowedDynamic.map((item) => [legacyKey(item.path, item.expressionChecksum), item.count]),
  );
  const scan = scanAmiBrainTestQuestions({ repoRoot, casesById, roots, managedQuestionSources });
  const violations = [...scan.violations];
  for (const item of scan.unmarked.values()) {
    const allowed = allowedCounts.get(legacyKey(item.path, item.questionChecksum)) ?? 0;
    if (item.count > allowed) {
      violations.push(
        `unregistered_test_question:${item.path}:${item.firstLine}:${item.count}/${allowed}:${item.preview}`,
      );
    }
  }
  for (const item of scan.dynamic.values()) {
    const allowed = allowedDynamicCounts.get(legacyKey(item.path, item.expressionChecksum)) ?? 0;
    if (item.count > allowed) {
      violations.push(
        `dynamic_test_question_requires_static_registered_fixture:${item.path}:${item.firstLine}:${item.count}/${allowed}:${item.preview}`,
      );
    }
  }
  if (violations.length) {
    throw new Error(`ami_brain_test_question_governance_failed\n${violations.join('\n')}`);
  }
  return {
    scannedFiles: scan.scannedFiles,
    candidates: scan.candidates,
    registered: scan.registered,
    unitOnly: scan.unitOnly,
    historicalOnly: scan.historicalOnly,
    legacyUnmarked: [...scan.unmarked.values()].reduce((sum, item) => sum + item.count, 0),
    legacyDynamic: [...scan.dynamic.values()].reduce((sum, item) => sum + item.count, 0),
  };
}

function assertRuntimeQuestionSourceRegistry(repoRoot, registry) {
  if (!registry) return;
  if (registry.schemaVersion !== 'ami-brain-question-source-registry/v1' || !Array.isArray(registry.sources)) {
    throw new Error('ami_brain_question_source_registry_invalid');
  }
  const registered = new Set();
  for (const source of registry.sources) {
    if (
      !source ||
      typeof source.path !== 'string' ||
      !source.path ||
      typeof source.inputGovernance !== 'string' ||
      !RUNTIME_INPUT_GOVERNANCE.has(source.inputGovernance) ||
      typeof source.questionIdentity !== 'string' ||
      !RUNTIME_QUESTION_IDENTITIES.has(source.questionIdentity) ||
      typeof source.productAcceptance !== 'string' ||
      !RUNTIME_PRODUCT_ACCEPTANCE.has(source.productAcceptance) ||
      registered.has(source.path) ||
      !isFile(resolve(repoRoot, source.path))
    ) {
      throw new Error(`ami_brain_question_source_registry_invalid:${source?.path ?? 'unknown'}`);
    }
    if (
      source.inputGovernance === 'governed_eval_catalog' &&
      source.productAcceptance !== 'historical_only_non_product_gate'
    ) {
      throw new Error(`ami_brain_question_source_product_acceptance_invalid:${source.path}`);
    }
    if (
      source.inputGovernance !== 'governed_eval_catalog' &&
      source.productAcceptance !== 'current_release_test_only'
    ) {
      throw new Error(`ami_brain_question_source_product_acceptance_invalid:${source.path}`);
    }
    if (
      source.questionIdentity === 'required_cli_question_id' &&
      !readFileSync(resolve(repoRoot, source.path), 'utf8').includes('--question-id')
    ) {
      throw new Error(`ami_brain_question_source_identity_contract_missing:${source.path}`);
    }
    registered.add(source.path);
  }
  for (const path of discoverRuntimeQuestionSources(repoRoot)) {
    if (!registered.has(path)) throw new Error(`unregistered_runtime_question_source:${path}`);
  }
}

function discoverRuntimeQuestionSources(repoRoot) {
  const roots = ['packages/server-v2/prisma', 'packages/server-v2/scripts'];
  const result = [];
  for (const root of roots) {
    const absoluteRoot = resolve(repoRoot, root);
    if (!exists(absoluteRoot)) continue;
    for (const filePath of listSourceFiles(absoluteRoot)) {
      const relativePath = relative(repoRoot, filePath);
      if (!/^ami-brain-.*\.(?:ts|js|mjs)$/u.test(filePath.split('/').at(-1) ?? '')) continue;
      if (/(?:\.test|\.spec)\.(?:ts|js|mjs)$/u.test(filePath)) continue;
      const raw = readFileSync(filePath, 'utf8');
      if (/\.(?:sendMessage|sendBrainMessage)\s*\(/u.test(raw)) result.push(relativePath);
    }
  }
  return result.sort();
}

function listSourceFiles(root) {
  const result = [];
  const visit = (path) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (SKIPPED_TEST_DIRECTORY_NAMES.has(entry.name)) continue;
      const target = resolve(path, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (/\.(?:ts|js|mjs)$/u.test(entry.name)) result.push(target);
    }
  };
  visit(root);
  return result;
}

export function buildAmiBrainTestQuestionLegacyBaseline({
  repoRoot,
  eligibility,
  roots = DEFAULT_TEST_ROOTS,
  managedQuestionSources = DEFAULT_MANAGED_QUESTION_SOURCES,
}) {
  assertEligibility(eligibility);
  const casesById = new Map(eligibility.cases.map((item) => [item.id, item]));
  const scan = scanAmiBrainTestQuestions({ repoRoot, casesById, roots, managedQuestionSources });
  if (scan.violations.length) {
    throw new Error(`ami_brain_test_question_marker_invalid\n${scan.violations.join('\n')}`);
  }
  const allowedUnmarked = [...scan.unmarked.values()]
    .map(({ path, questionChecksum, count }) => ({ path, questionChecksum, count }))
    .sort((left, right) => left.path.localeCompare(right.path) || left.questionChecksum.localeCompare(right.questionChecksum));
  const allowedDynamic = [...scan.dynamic.values()]
    .map(({ path, expressionChecksum, count }) => ({ path, expressionChecksum, count }))
    .sort((left, right) => left.path.localeCompare(right.path) || left.expressionChecksum.localeCompare(right.expressionChecksum));
  const contentChecksum = sha256(JSON.stringify({ allowedUnmarked, allowedDynamic }));
  return {
    schemaVersion: AMI_BRAIN_TEST_QUESTION_BASELINE_SCHEMA,
    generatedAt: stableGeneratedAt(contentChecksum),
    policy:
      '冻结现有未标记的单元测试、正式发布评测问题字面量和既有动态派生表达式；新增或增加出现次数的 Ami Brain 自然语言测试题必须就近声明有效 BQ 题号。新增运行时动态拼接问题默认阻断，必须改为静态可核对 fixture。ami-brain-unit-only 仅允许非 Brain 执行入口的纯算法或结构测试，正式 eval 源、Brain 调用、用户消息和 Terminal 查询不得使用该豁免。',
    contentChecksum,
    allowedUnmarked,
    allowedDynamic,
  };
}

export function inspectAmiBrainTestQuestionSource({ repoRoot, eligibility, path, managedSource = false }) {
  assertEligibility(eligibility);
  const filePath = resolve(repoRoot, path);
  if (!isFile(filePath)) return [];
  const raw = readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/u);
  const casesById = new Map(eligibility.cases.map((item) => [item.id, item]));
  return collectQuestionCandidates(raw, filePath, managedSource).flatMap((candidate) => {
    if (candidate.dynamic) return [];
    const lineIndex = lineAt(raw, candidate.position);
    const marker = candidate.marker ?? nearestQuestionId(lines, lineIndex);
    if (!marker) return [];
    const registeredCase = casesById.get(marker);
    if (!registeredCase || !questionMatches(candidate.question, registeredCase.question)) return [];
    return [{
      id: marker,
      question: candidate.question,
      line: lineIndex + 1,
      registrationRequired: candidate.registrationRequired,
    }];
  });
}

function scanAmiBrainTestQuestions({ repoRoot, casesById, roots, managedQuestionSources }) {
  const managedSourcePaths = new Set(
    managedQuestionSources
      .map((path) => resolve(repoRoot, path))
      .filter((path) => isFile(path)),
  );
  const files = [...new Set([...roots.flatMap((root) => listTestFiles(resolve(repoRoot, root))), ...managedSourcePaths])]
    .filter((filePath) => !isExcludedNonBrainTestFile(repoRoot, filePath))
    .sort();
  const unmarked = new Map();
  const dynamic = new Map();
  const violations = [];
  let candidates = 0;
  let registered = 0;
  let unitOnly = 0;
  let historicalOnly = 0;
  for (const filePath of files) {
    const raw = readFileSync(filePath, 'utf8');
    const lines = raw.split(/\r?\n/u);
    const relativePath = relative(repoRoot, filePath);
    for (const candidate of collectQuestionCandidates(raw, filePath, managedSourcePaths.has(filePath))) {
      candidates += 1;
      const lineIndex = lineAt(raw, candidate.position);
      const nearby = nearbyLines(lines, lineIndex);
      if (candidate.dynamic) {
        if (nearby.some((line) => line.includes(UNIT_ONLY_MARKER))) {
          violations.push(
            `unit_only_not_allowed_for_product_question:${relativePath}:${lineIndex + 1}:${candidate.preview}`,
          );
        } else {
          const expressionChecksum = sha256(normalizeDynamicExpression(candidate.expression));
          const key = legacyKey(relativePath, expressionChecksum);
          const current = dynamic.get(key);
          if (current) {
            current.count += 1;
          } else {
            dynamic.set(key, {
              path: relativePath,
              expressionChecksum,
              count: 1,
              firstLine: lineIndex + 1,
              preview: candidate.preview,
            });
          }
        }
        continue;
      }
      const question = candidate.question;
      if (nearby.some((line) => line.includes(HISTORICAL_ONLY_MARKER))) {
        if (nearby.some((line) => line.includes(UNIT_ONLY_MARKER))) {
          violations.push(
            `historical_only_marker_conflicts_with_unit_only:${relativePath}:${lineIndex + 1}:${preview(question)}`,
          );
          continue;
        }
        if (managedSourcePaths.has(filePath)) {
          violations.push(
            `historical_only_not_allowed_for_release_eval_source:${relativePath}:${lineIndex + 1}:${preview(question)}`,
          );
          continue;
        }
        historicalOnly += 1;
        continue;
      }
      if (nearby.some((line) => line.includes(UNIT_ONLY_MARKER))) {
        if (candidate.registrationRequired) {
          violations.push(
            `unit_only_not_allowed_for_product_question:${relativePath}:${lineIndex + 1}:${preview(question)}`,
          );
          continue;
        }
        unitOnly += 1;
        continue;
      }
      const marker = candidate.marker ?? nearestQuestionId(lines, lineIndex);
      if (marker) {
        const registeredCase = casesById.get(marker);
        if (!registeredCase) {
          violations.push(`unknown_test_question_id:${relativePath}:${lineIndex + 1}:${marker}`);
          continue;
        }
        if (!questionMatches(question, registeredCase.question)) {
          violations.push(
            `test_question_marker_mismatch:${relativePath}:${lineIndex + 1}:${marker}:${preview(question)}`,
          );
          continue;
        }
        if (candidate.registrationRequired && registeredCase.status !== 'current_release_test') {
          violations.push(
            `ineligible_test_question_execution:${relativePath}:${lineIndex + 1}:${marker}:${registeredCase.status}`,
          );
          continue;
        }
        registered += 1;
        continue;
      }
      const questionChecksum = sha256(normalizeQuestion(question));
      const key = legacyKey(relativePath, questionChecksum);
      const current = unmarked.get(key);
      if (current) {
        current.count += 1;
      } else {
        unmarked.set(key, {
          path: relativePath,
          questionChecksum,
          count: 1,
          firstLine: lineIndex + 1,
          preview: preview(question),
        });
      }
    }
  }
  return { scannedFiles: files.length, candidates, registered, unitOnly, historicalOnly, unmarked, dynamic, violations };
}

function isExcludedNonBrainTestFile(repoRoot, filePath) {
  const relativePath = relative(repoRoot, filePath);
  return EXCLUDED_NON_BRAIN_TEST_PATH_PREFIXES.some((prefix) => relativePath.startsWith(prefix));
}

function listTestFiles(root) {
  if (!exists(root)) return [];
  const result = [];
  const visit = (path) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (SKIPPED_TEST_DIRECTORY_NAMES.has(entry.name)) continue;
      const target = resolve(path, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (TEST_FILE_PATTERN.test(entry.name)) result.push(target);
    }
  };
  visit(root);
  return result.sort();
}

function exists(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function nearestQuestionId(lines, lineIndex) {
  const sameLineIds = [...(lines[lineIndex] ?? '').matchAll(QUESTION_ID_PATTERN)].map((match) => match[0]);
  if (sameLineIds.length === 1) return sameLineIds[0];
  const previousLine = (lines[lineIndex - 1] ?? '').trim();
  if (!/^(?:\/\/|\/\*|\*)/u.test(previousLine)) return null;
  const previousLineIds = [...previousLine.matchAll(QUESTION_ID_PATTERN)].map((match) => match[0]);
  if (previousLineIds.length === 1) return previousLineIds[0];
  return null;
}

function nearbyLines(lines, lineIndex) {
  return [lines[lineIndex] ?? '', lines[lineIndex - 1] ?? '', lines[lineIndex - 2] ?? ''];
}

function questionMatches(candidate, registered) {
  const left = normalizeQuestion(candidate);
  return registeredQuestionVariants(registered).some((item) => left === normalizeQuestion(item));
}

function registeredQuestionVariants(value) {
  const raw = String(value ?? '').trim();
  const turns = raw
    .split(/(?:→|->)/u)
    .map((item) => item.replace(/^第\s*\d+\s*轮\s*[:：]\s*/u, '').trim())
    .filter(Boolean);
  return [raw, ...turns];
}

function normalizeQuestion(value) {
  return String(value ?? '')
    .replace(/第\s*\d+\s*轮\s*[:：]/gu, '')
    .replace(/[\s，。！？、：；“”‘’"'`（）()→\-]/gu, '')
    .trim();
}

function lineAt(raw, index) {
  return raw.slice(0, index).split('\n').length - 1;
}

function collectQuestionCandidates(raw, filePath, managedSource = false) {
  const sourceFile = ts.createSourceFile(filePath, raw, ts.ScriptTarget.Latest, true);
  const candidates = new Map();
  const bindings = collectStaticBindingInitializers(sourceFile);
  const add = (
    expression,
    marker = null,
    registrationRequired = managedSource,
    { resolveIdentifiers = true, failClosedDynamic = false } = {},
  ) => {
    if (!expression) return;
    if (ts.isIdentifier(expression) && QUESTION_PROPERTY_NAMES.has(expression.text)) return;
    const question = resolveStaticString(expression, bindings, new Set(), resolveIdentifiers);
    const position = expression.getStart(sourceFile) + 1;
    if (question === null) {
      if (
        registrationRequired &&
        (failClosedDynamic || managedSource || containsQuestionTextFragment(expression, bindings))
      ) {
        const key = `dynamic\u0000${position}`;
        candidates.set(key, {
          dynamic: true,
          position,
          expression: expression.getText(sourceFile),
          preview: preview(expression.getText(sourceFile)),
          registrationRequired: true,
        });
      }
      return;
    }
    const key = `${position}\u0000${question}`;
    const existing = candidates.get(key);
    candidates.set(key, {
      question,
      position,
      marker: marker ?? existing?.marker ?? null,
      registrationRequired: registrationRequired || existing?.registrationRequired === true,
    });
  };
  const visit = (node) => {
    if (ts.isPropertyAssignment(node)) {
      const name = propertyName(node.name);
      const executionCall = enclosingQuestionCall(node);
      if (
        QUESTION_PROPERTY_NAMES.has(name) &&
        !(
          name === 'message' &&
          !executionCall &&
          (isSystemResponseMessageProperty(node) || isPromiseSettlementMatcherMessageProperty(node))
        )
      ) {
        add(node.initializer, objectQuestionId(node.parent), managedSource || Boolean(executionCall));
      }
      if (name === 'content' && objectLiteralPropertyValue(node.parent, 'role') === 'user') {
        add(node.initializer, null, true, { resolveIdentifiers: false });
      }
      if (name === 'text') {
        const marker = objectQuestionId(node.parent);
        if (marker) add(node.initializer, marker, managedSource);
        else if (isTerminalQueryText(node)) add(node.initializer, null, true, { resolveIdentifiers: false });
      }
    } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      if (QUESTION_PROPERTY_NAMES.has(node.name.text)) add(node.initializer, null, managedSource);
    } else if (ts.isCallExpression(node)) {
      const name = callName(node.expression);
      if (QUESTION_CALL_NAMES.has(name) || QUESTION_CALL_NAME_PATTERN.test(name)) {
        for (const input of questionCallInputs(node, name)) {
          const expanded = expandQuestionInputExpression(input, sourceFile, bindings);
          if (expanded.length) {
            for (const source of expanded) add(source.expression, source.marker, true);
          } else if (!ts.isObjectLiteralExpression(input)) {
            add(input, null, true, { failClosedDynamic: true });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...candidates.values()];
}

function collectStaticBindingInitializers(sourceFile) {
  const bindings = new Map();
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const records = bindings.get(node.name.text) ?? [];
      records.push({ declaration: node, initializer: node.initializer, scope: bindingScope(node) });
      bindings.set(node.name.text, records);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return bindings;
}

function questionCallInputs(node, name) {
  if (!node.arguments.length) return [];
  if (name === 'submitQuestion') return [node.arguments.at(-1)];
  if (name === 'sendMessage') {
    const objectInput = node.arguments.find(
      (argument) => ts.isObjectLiteralExpression(argument) && objectQuestionTextProperties(argument).length,
    );
    if (objectInput) return [objectInput];
    if (ts.isPropertyAccessExpression(node.expression) && node.arguments.length >= 3) {
      return [node.arguments[2]];
    }
  }
  return [node.arguments[0]];
}

function expandQuestionInputExpression(expression, sourceFile, bindings) {
  if (!expression) return [];
  const value = unwrapExpression(expression);
  if (ts.isIdentifier(value)) {
    const binding = bindingForIdentifier(value, bindings);
    const initializer = binding ? unwrapExpression(binding.initializer) : null;
    if (initializer && ts.isObjectLiteralExpression(initializer)) {
      return objectQuestionTextProperties(initializer);
    }
    return [];
  }
  if (!ts.isPropertyAccessExpression(value) || !ts.isIdentifier(value.expression)) return [];
  const property = value.name.text;
  if (![...QUESTION_PROPERTY_NAMES, 'text', 'content'].includes(property)) return [];
  const loop = enclosingForOfBinding(value, value.expression.text);
  if (!loop) return [];
  const collection = resolveArrayExpression(loop.expression, bindings);
  if (!collection) return [];
  const result = [];
  for (const element of collection.elements) {
    const item = unwrapExpression(element);
    if (!ts.isObjectLiteralExpression(item)) return [];
    const propertyAssignment = objectLiteralProperty(item, property);
    if (!propertyAssignment) return [];
    result.push({ expression: propertyAssignment.initializer, marker: objectQuestionId(item) });
  }
  return result;
}

function objectQuestionTextProperties(object) {
  if (!ts.isObjectLiteralExpression(object)) return [];
  const result = [];
  for (const name of [...QUESTION_PROPERTY_NAMES, 'text']) {
    const property = objectLiteralProperty(object, name);
    if (property) result.push({ expression: property.initializer, marker: objectQuestionId(object) });
  }
  if (objectLiteralPropertyValue(object, 'role') === 'user') {
    const content = objectLiteralProperty(object, 'content');
    if (content) result.push({ expression: content.initializer, marker: objectQuestionId(object) });
  }
  return result;
}

function enclosingForOfBinding(node, identifierName) {
  let current = node.parent;
  while (current && !ts.isSourceFile(current)) {
    if (ts.isForOfStatement(current)) {
      const declaration = current.initializer?.declarations?.[0];
      if (declaration && ts.isIdentifier(declaration.name) && declaration.name.text === identifierName) {
        return current;
      }
    }
    current = current.parent;
  }
  return null;
}

function resolveArrayExpression(expression, bindings) {
  const value = unwrapExpression(expression);
  if (ts.isArrayLiteralExpression(value)) return value;
  if (!ts.isIdentifier(value)) return null;
  const binding = bindingForIdentifier(value, bindings);
  const initializer = binding ? unwrapExpression(binding.initializer) : null;
  return initializer && ts.isArrayLiteralExpression(initializer) ? initializer : null;
}

function unwrapExpression(node) {
  let current = node;
  while (
    current &&
    (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isTypeAssertionExpression(current))
  ) {
    current = current.expression;
  }
  return current;
}

function resolveStaticString(node, bindings, resolving = new Set(), resolveIdentifiers = true) {
  if (!node) return null;
  if (isStaticStringLiteral(node)) return node.text;
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
    return resolveStaticString(node.expression, bindings, resolving, resolveIdentifiers);
  }
  if (ts.isIdentifier(node)) {
    if (!resolveIdentifiers) return null;
    if (resolving.has(node.text)) return null;
    const binding = bindingForIdentifier(node, bindings);
    if (!binding) return null;
    const next = new Set(resolving);
    next.add(node.text);
    return resolveStaticString(binding.initializer, bindings, next, resolveIdentifiers);
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = resolveStaticString(node.left, bindings, resolving, resolveIdentifiers);
    const right = resolveStaticString(node.right, bindings, resolving, resolveIdentifiers);
    return left === null || right === null ? null : `${left}${right}`;
  }
  if (ts.isTemplateExpression(node)) {
    let value = node.head.text;
    for (const span of node.templateSpans) {
      const expression = resolveStaticString(span.expression, bindings, resolving, resolveIdentifiers);
      if (expression === null) return null;
      value += expression + span.literal.text;
    }
    return value;
  }
  return null;
}

function containsQuestionTextFragment(node, bindings, resolving = new Set()) {
  if (!node) return false;
  if (isStaticStringLiteral(node)) return CHINESE_PATTERN.test(node.text);
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
    return containsQuestionTextFragment(node.expression, bindings, resolving);
  }
  if (ts.isIdentifier(node)) {
    if (resolving.has(node.text)) return false;
    const binding = bindingForIdentifier(node, bindings);
    if (!binding) return false;
    const next = new Set(resolving);
    next.add(node.text);
    return containsQuestionTextFragment(binding.initializer, bindings, next);
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return (
      containsQuestionTextFragment(node.left, bindings, resolving) ||
      containsQuestionTextFragment(node.right, bindings, resolving)
    );
  }
  if (ts.isTemplateExpression(node)) {
    return (
      CHINESE_PATTERN.test(node.head.text) ||
      node.templateSpans.some(
        (span) =>
          CHINESE_PATTERN.test(span.literal.text) ||
          containsQuestionTextFragment(span.expression, bindings, resolving),
      )
    );
  }
  return false;
}

function bindingScope(node) {
  let current = node.parent;
  while (current && !ts.isSourceFile(current)) {
    if (ts.isBlock(current) || ts.isFunctionLike(current)) return current;
    current = current.parent;
  }
  return current;
}

function bindingForIdentifier(node, bindings) {
  return (bindings.get(node.text) ?? [])
    .filter(
      (record) =>
        record.declaration.getStart() < node.getStart() &&
        isAncestor(record.scope, node),
    )
    .sort((left, right) => right.declaration.getStart() - left.declaration.getStart())[0];
}

function isAncestor(ancestor, node) {
  let current = node;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

function normalizeDynamicExpression(value) {
  return String(value ?? '').replace(/\s+/gu, ' ').trim();
}

function isStaticStringLiteral(node) {
  return Boolean(node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)));
}

function propertyName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
  return '';
}

function objectLiteralProperty(object, name) {
  if (!ts.isObjectLiteralExpression(object)) return null;
  return object.properties.find((property) => ts.isPropertyAssignment(property) && propertyName(property.name) === name) ?? null;
}

function objectLiteralPropertyValue(object, name) {
  const property = objectLiteralProperty(object, name);
  return property && isStaticStringLiteral(property.initializer) ? property.initializer.text : null;
}

function objectQuestionId(object) {
  for (const name of ['id', 'questionId']) {
    const value = objectLiteralPropertyValue(object, name);
    if (/^BQ\d{4}$/u.test(value ?? '')) return value;
  }
  return null;
}

function isTerminalQueryText(node) {
  if (objectLiteralPropertyValue(node.parent, 'type') === 'query') return true;
  const payloadProperty = node.parent?.parent;
  const outerObject = payloadProperty?.parent;
  return (
    ts.isPropertyAssignment(payloadProperty) &&
    propertyName(payloadProperty.name) === 'payload' &&
    objectLiteralPropertyValue(outerObject, 'type') === 'query'
  );
}

function isSystemResponseMessageProperty(node) {
  const object = node.parent;
  if (!ts.isObjectLiteralExpression(object)) return false;
  return object.properties.some(
    (property) =>
      ts.isPropertyAssignment(property) &&
      property !== node &&
      RESPONSE_MESSAGE_SIBLING_PROPERTIES.has(propertyName(property.name)),
  );
}

function isPromiseSettlementMatcherMessageProperty(node) {
  const object = node.parent;
  const call = object?.parent;
  if (!ts.isObjectLiteralExpression(object) || !ts.isCallExpression(call)) return false;
  if (!call.arguments.includes(object) || !ts.isPropertyAccessExpression(call.expression)) return false;
  const settlement = call.expression.expression;
  return (
    ts.isPropertyAccessExpression(settlement) &&
    (settlement.name.text === 'rejects' || settlement.name.text === 'resolves')
  );
}

function callName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return '';
}

function enclosingQuestionCall(node) {
  let current = node.parent;
  while (current && !ts.isSourceFile(current)) {
    if (ts.isCallExpression(current)) {
      const name = callName(current.expression);
      if (QUESTION_CALL_NAMES.has(name) || QUESTION_CALL_NAME_PATTERN.test(name)) return name;
    }
    if (ts.isStatement(current)) break;
    current = current.parent;
  }
  return null;
}

function preview(value) {
  return String(value).replace(/\s+/gu, ' ').slice(0, 48);
}

function legacyKey(path, checksum) {
  return `${path}\u0000${checksum}`;
}

function assertEligibility(value) {
  if (value?.schemaVersion !== 'ami-brain-product-loop-eligibility/v1' || !Array.isArray(value.cases)) {
    throw new Error('ami_brain_test_question_eligibility_invalid');
  }
}

function assertLegacyBaseline(value, approvedBaselineChecksum) {
  if (
    value?.schemaVersion !== AMI_BRAIN_TEST_QUESTION_BASELINE_SCHEMA ||
    !Array.isArray(value.allowedUnmarked) ||
    !Array.isArray(value.allowedDynamic) ||
    value.contentChecksum !==
      sha256(JSON.stringify({ allowedUnmarked: value.allowedUnmarked, allowedDynamic: value.allowedDynamic })) ||
    value.contentChecksum !== approvedBaselineChecksum
  ) {
    throw new Error('ami_brain_test_question_legacy_baseline_invalid');
  }
}

function stableGeneratedAt(checksum) {
  const seconds = Number.parseInt(checksum.slice(0, 8), 16) % 86_400;
  return new Date(Date.UTC(2026, 6, 29, 0, 0, seconds)).toISOString();
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
