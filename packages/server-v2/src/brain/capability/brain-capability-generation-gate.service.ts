import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import * as ts from 'typescript';
import { canonicalizeBusinessDefinition } from '../../semantic-data/business-definition-projection-compiler.service.js';
import { findForbiddenCapabilityIdentityArg } from './brain-capability-identity-args.js';
import type { BrainCapabilityCandidate } from './brain-capability-scan.types.js';
import {
  assertGeneratedCapabilityContract,
  type BrainCapabilityGenerationProposal,
} from './brain-capability-codegen.service.js';
import {
  createGeneratedCapabilityProposalFingerprint,
  generatedBindingFingerprint,
  renderGeneratedCapabilityBindingSource,
  renderGeneratedCapabilityContractTestSource,
  resolveGeneratedCapabilityTarget,
} from './brain-generated-capability-binding.js';

export type BrainCapabilityGenerationGateName = 'compile' | 'contract' | 'security' | 'test';

export interface BrainCapabilityGenerationGateResult {
  gate: BrainCapabilityGenerationGateName;
  passed: boolean;
  reasons: string[];
  remediation: string[];
}

export interface BrainCapabilityGenerationGateReport {
  passed: boolean;
  gates: BrainCapabilityGenerationGateResult[];
}

@Injectable()
export class BrainCapabilityGenerationGateService {
  async evaluate(input: {
    capability: BrainCapabilityCandidate;
    proposal: BrainCapabilityGenerationProposal;
    workspaceRoot?: string;
  }): Promise<BrainCapabilityGenerationGateReport> {
    const gates = [
      await this.compileGate(input.capability, input.proposal, input.workspaceRoot),
      this.contractGate(input.capability, input.proposal),
      this.securityGate(input.capability, input.proposal),
      this.testGate(input.proposal),
    ];
    return { passed: gates.every((gate) => gate.passed), gates };
  }

  private async compileGate(
    capability: BrainCapabilityCandidate,
    proposal: BrainCapabilityGenerationProposal,
    workspaceRoot?: string,
  ): Promise<BrainCapabilityGenerationGateResult> {
    const reasons: string[] = [];
    try {
      if (!workspaceRoot) throw new Error('generated_capability_workspace_root_required');
      const root = resolve(workspaceRoot);
      const serverRoot = resolve(root, 'packages/server-v2');
      const bindingPath = resolve(root, proposal.executorBinding.generatedSourcePath);
      const contractPath = resolve(bindingPath, '..', 'contract.spec.ts');
      assertWithin(root, bindingPath, 'generated_capability_virtual_path_invalid');
      const targetPath = resolve(root, proposal.executorBinding.target.sourcePath);
      assertWithin(root, targetPath, 'generated_capability_target_path_invalid');
      reasons.push(...(await targetDeclarationIssues(targetPath, proposal.executorBinding.target)));
      const configPath = resolve(serverRoot, 'tsconfig.json');
      const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
      if (configFile.error) reasons.push(formatDiagnostic(configFile.error));
      const parsed = ts.parseJsonConfigFileContent(configFile.config ?? {}, ts.sys, serverRoot, {
        noEmit: true,
        incremental: false,
      }, configPath);
      reasons.push(...parsed.errors.map(formatDiagnostic));
      const virtualFiles = new Map([
        [normalizeFileName(bindingPath), proposal.bindingSource],
        [normalizeFileName(contractPath), proposal.contractTestSource],
      ]);
      const host = ts.createCompilerHost(parsed.options, true);
      const originalFileExists = host.fileExists.bind(host);
      const originalReadFile = host.readFile.bind(host);
      const originalGetSourceFile = host.getSourceFile.bind(host);
      host.fileExists = (fileName) => virtualFiles.has(normalizeFileName(fileName)) || originalFileExists(fileName);
      host.readFile = (fileName) => virtualFiles.get(normalizeFileName(fileName)) ?? originalReadFile(fileName);
      host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
        const virtual = virtualFiles.get(normalizeFileName(fileName));
        return virtual === undefined
          ? originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile)
          : ts.createSourceFile(fileName, virtual, languageVersion, true, ts.ScriptKind.TS);
      };
      host.resolveModuleNames = (moduleNames, containingFile) =>
        moduleNames.map((moduleName) => {
          if (normalizeFileName(containingFile) === normalizeFileName(contractPath) && moduleName === './binding.js') {
            return { resolvedFileName: bindingPath, extension: ts.Extension.Ts };
          }
          return ts.resolveModuleName(moduleName, containingFile, parsed.options, host).resolvedModule;
        });
      const program = ts.createProgram({
        rootNames: [bindingPath, contractPath],
        options: parsed.options,
        host,
      });
      for (const diagnostic of ts.getPreEmitDiagnostics(program)) {
        reasons.push(formatDiagnostic(diagnostic));
      }
    } catch (error) {
      reasons.push(error instanceof Error ? error.message : String(error));
    }
    return gateResult('compile', reasons, ['修复生成 binding 或 contract 的 TypeScript 类型与模块解析错误。']);
  }

  private contractGate(
    capability: BrainCapabilityCandidate,
    proposal: BrainCapabilityGenerationProposal,
  ): BrainCapabilityGenerationGateResult {
    const reasons: string[] = [];
    try {
      assertGeneratedCapabilityContract(proposal.contractArtifact);
    } catch (error) {
      reasons.push(error instanceof Error ? error.message : String(error));
    }
    try {
      const expectedTarget = resolveGeneratedCapabilityTarget(capability);
      if (canonical(expectedTarget) !== canonical(proposal.executorBinding.target)) {
        reasons.push('generated_binding_target_identity_mismatch');
      }
    } catch (error) {
      reasons.push(error instanceof Error ? error.message : String(error));
    }
    if (generatedBindingFingerprint(proposal.executorBinding) !== proposal.executorBinding.bindingFingerprint) {
      reasons.push('generated_binding_fingerprint_mismatch');
    }
    const expectedProposalFingerprint = createGeneratedCapabilityProposalFingerprint({
      sourceFingerprint: proposal.sourceFingerprint,
      manifest: proposal.manifest,
      executorBinding: proposal.executorBinding,
      bindingSource: proposal.bindingSource,
      contractTestSource: proposal.contractTestSource,
    });
    if (expectedProposalFingerprint !== proposal.proposalFingerprint) {
      reasons.push('generated_proposal_fingerprint_mismatch');
    }
    return gateResult('contract', reasons, [
      '重新扫描固定 controller/service target，并重新生成 canonical binding 与 proposal fingerprint。',
    ]);
  }

  private securityGate(
    capability: BrainCapabilityCandidate,
    proposal: BrainCapabilityGenerationProposal,
  ): BrainCapabilityGenerationGateResult {
    const reasons: string[] = [];
    const binding = proposal.executorBinding;
    const readOnlyCapability = capability.readOnly && !capability.sideEffect && binding.readOnly && !binding.sideEffect;
    const governedPreviewAction =
      !capability.readOnly && capability.sideEffect && capability.requiresConfirmation && capability.idempotency === 'required' &&
      !binding.readOnly && binding.sideEffect && binding.requiresConfirmation && binding.idempotency === 'required' &&
      proposal.manifest.grounding === 'preview_action';
    if (!readOnlyCapability && !governedPreviewAction) {
      reasons.push('generated_write_executor_forbidden');
    }
    if (canonical(binding.requiredPermissions) !== canonical(capability.requiredPermissions)) {
      reasons.push('generated_binding_permission_mismatch');
    }
    if (binding.storeScope !== capability.storeScope) reasons.push('generated_binding_store_scope_mismatch');
    if (binding.requiresConfirmation !== capability.requiresConfirmation) {
      reasons.push('generated_binding_confirmation_mismatch');
    }
    if (binding.idempotency !== capability.idempotency) reasons.push('generated_binding_idempotency_mismatch');
    const forbiddenArgument = findForbiddenCapabilityIdentityArg(schemaProperties(binding.inputSchema));
    if (forbiddenArgument) reasons.push(`generated_binding_identity_argument_forbidden:${forbiddenArgument}`);
    reasons.push(...dangerousSourceIssues(proposal.bindingSource, 'binding.ts', proposal));
    reasons.push(...dangerousSourceIssues(proposal.contractTestSource, 'contract.spec.ts', proposal));
    return gateResult('security', uniqueSorted(reasons), [
      '移除危险 import/API、任意 URL 和调用方可控身份参数；权限与门店范围只能来自固定 binding 和受控 invoker 上下文。',
    ]);
  }

  private testGate(proposal: BrainCapabilityGenerationProposal): BrainCapabilityGenerationGateResult {
    const reasons: string[] = [];
    if (proposal.bindingSource !== renderGeneratedCapabilityBindingSource(proposal.executorBinding)) {
      reasons.push('generated_binding_source_not_deterministic');
    }
    if (proposal.contractTestSource !== renderGeneratedCapabilityContractTestSource(proposal.executorBinding)) {
      reasons.push('generated_contract_source_not_deterministic');
    }
    const source = ts.createSourceFile('binding.ts', proposal.bindingSource, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
    let targetCalls = 0;
    let executeParameterCount: number | undefined;
    const visit = (node: ts.Node) => {
      if (ts.isMethodDeclaration(node) && node.name.getText(source) === 'execute') {
        executeParameterCount = node.parameters.length;
      }
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.expression.getText(source) === 'this.target' &&
        node.expression.name.text === proposal.executorBinding.target.methodName
      ) {
        targetCalls += 1;
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    if (executeParameterCount !== 1) reasons.push('generated_binding_execute_signature_invalid');
    if (targetCalls !== 1) reasons.push('generated_binding_target_call_count_invalid');
    if (proposal.bindingSource.includes('GeneratedCapabilityInvoker') || proposal.bindingSource.includes('this.invoker')) {
      reasons.push('generated_binding_arbitrary_invoker_forbidden');
    }
    return gateResult('test', reasons, [
      '重新生成确定性 binding；execute 只接收业务参数并且只能调用一次受控 GeneratedCapabilityInvoker。',
    ]);
  }
}

function dangerousSourceIssues(
  source: string,
  fileName: string,
  proposal: BrainCapabilityGenerationProposal,
): string[] {
  const issues: string[] = [];
  if (/https?:\/\//i.test(source)) issues.push(`${fileName}:arbitrary_url_forbidden`);
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const bannedIdentifiers = new Set([
    'eval',
    'Function',
    'fetch',
    'XMLHttpRequest',
    'WebSocket',
    'require',
    'process',
    'child_process',
  ]);
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) {
      const moduleName = ts.isStringLiteralLike(node.moduleSpecifier) ? node.moduleSpecifier.text : '';
      const allowed =
        (fileName === 'contract.spec.ts' && moduleName === './binding.js') ||
        (fileName === 'binding.ts' &&
          (moduleName === proposal.executorBinding.targetImportPath ||
            moduleName === '../../brain-generated-capability-binding.js'));
      if (!allowed) {
        issues.push(`${fileName}:dangerous_import:${moduleName || 'dynamic'}`);
      }
    }
    if (node.kind === ts.SyntaxKind.ImportKeyword) issues.push(`${fileName}:dynamic_import_forbidden`);
    if (ts.isIdentifier(node) && bannedIdentifiers.has(node.text)) {
      issues.push(`${fileName}:dangerous_api:${node.text}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return uniqueSorted(issues);
}

async function targetDeclarationIssues(
  targetPath: string,
  expected: BrainCapabilityGenerationProposal['executorBinding']['target'],
): Promise<string[]> {
  const sourceText = await readFile(targetPath, 'utf8');
  const source = ts.createSourceFile(targetPath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const declaration = source.statements
    .filter(ts.isClassDeclaration)
    .find((item) => item.name?.text === expected.className);
  if (!declaration) return ['generated_capability_target_class_missing'];
  const exported = Boolean(
    ts.canHaveModifiers(declaration) &&
      ts.getModifiers(declaration)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
  );
  if (!exported) return ['generated_capability_target_class_not_exported'];
  const method = declaration.members
    .filter(ts.isMethodDeclaration)
    .find((item) => item.name?.getText(source) === expected.methodName);
  if (!method) return ['generated_capability_target_method_missing'];
  const access = ts.canHaveModifiers(method)
    ? ts.getModifiers(method)?.find((modifier) =>
        [ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ProtectedKeyword].includes(modifier.kind),
      )?.kind
    : undefined;
  if (access) return ['generated_capability_target_method_not_public'];
  const parameterTypes = method.parameters.map((parameter) => parameter.type?.getText(source) ?? 'unknown');
  const returnType = method.type?.getText(source) ?? 'unknown';
  const reasons: string[] = [];
  if (method.parameters.length !== expected.parameterCount) reasons.push('generated_capability_target_parameter_count_changed');
  if (canonical(parameterTypes) !== canonical(expected.parameterTypes)) {
    reasons.push('generated_capability_target_parameter_types_changed');
  }
  if (returnType !== expected.returnType) reasons.push('generated_capability_target_return_type_changed');
  return reasons;
}

function assertWithin(root: string, target: string, code: string): void {
  const relationship = relative(root, target);
  if (relationship === '' || (!relationship.startsWith('..') && !isAbsolute(relationship))) return;
  throw new Error(code);
}

function normalizeFileName(value: string): string {
  return resolve(value).toLowerCase();
}

function schemaProperties(schema: Record<string, unknown>): Record<string, unknown> {
  const value = schema.properties;
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function formatDiagnostic(diagnostic: ts.Diagnostic): string {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
  if (!diagnostic.file || diagnostic.start === undefined) return `TS${diagnostic.code}:${message}`;
  const location = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  return `TS${diagnostic.code}:${diagnostic.file.fileName}:${location.line + 1}:${location.character + 1}:${message}`;
}

function gateResult(
  gate: BrainCapabilityGenerationGateName,
  reasons: string[],
  remediation: string[],
): BrainCapabilityGenerationGateResult {
  return { gate, passed: reasons.length === 0, reasons: uniqueSorted(reasons), remediation: reasons.length ? remediation : [] };
}

function canonical(value: unknown): string {
  return canonicalizeBusinessDefinition(value);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
