import { Inject, Injectable, Optional } from '@nestjs/common';
import { canonicalizeBusinessDefinition } from './business-definition-projection-compiler.service.js';
import type { BusinessDefinitionVersionRecord } from './business-definition-projection-compiler.service.js';

export const BUSINESS_DEFINITION_FIXTURE_SOURCE = Symbol('BUSINESS_DEFINITION_FIXTURE_SOURCE');
export const BUSINESS_DEFINITION_QUERY_ADAPTERS = Symbol('BUSINESS_DEFINITION_QUERY_ADAPTERS');

export interface BusinessDefinitionFixtureCase {
  caseKey: string;
  input: unknown;
  expected: unknown;
}

export interface BusinessDefinitionFixtureSet {
  fixtureSetKey: string;
  cases: BusinessDefinitionFixtureCase[];
}

export interface BusinessDefinitionFixtureSource {
  load(fixtureSetKey: string): Promise<BusinessDefinitionFixtureSet | null>;
}

export interface BusinessDefinitionCanonicalQueryAdapter {
  supports(canonicalQueryRef: string): boolean;
  execute(input: {
    canonicalQueryRef: string;
    version: BusinessDefinitionVersionRecord;
    fixtureCase: BusinessDefinitionFixtureCase;
    timezone: string;
    storeScope: unknown;
  }): Promise<unknown>;
}

export interface BusinessDefinitionCanonicalVerificationInput {
  version: BusinessDefinitionVersionRecord;
  canonicalQueryRef: string;
  fixtureSetKey: string;
  timezone: string;
  storeScope: unknown;
}

export interface BusinessDefinitionCanonicalVerificationResult {
  passed: boolean;
  code: string;
  comparedCases: number;
  mismatches: string[];
}

export abstract class BusinessDefinitionCanonicalVerificationPort {
  abstract verify(
    input: BusinessDefinitionCanonicalVerificationInput,
  ): Promise<BusinessDefinitionCanonicalVerificationResult>;
}

@Injectable()
export class BusinessDefinitionCanonicalVerifierService extends BusinessDefinitionCanonicalVerificationPort {
  constructor(
    @Optional()
    @Inject(BUSINESS_DEFINITION_FIXTURE_SOURCE)
    private readonly fixtureSource?: BusinessDefinitionFixtureSource,
    @Optional()
    @Inject(BUSINESS_DEFINITION_QUERY_ADAPTERS)
    private readonly queryAdapters: BusinessDefinitionCanonicalQueryAdapter[] = [],
  ) {
    super();
  }

  async verify(
    input: BusinessDefinitionCanonicalVerificationInput,
  ): Promise<BusinessDefinitionCanonicalVerificationResult> {
    if (!this.fixtureSource || !this.queryAdapters.length) return failed('canonical_verifier_unavailable');
    if (!isCanonicalQueryRef(input.canonicalQueryRef)) return failed('invalid_canonical_query_ref');

    const adapter = this.queryAdapters.find((candidate) => {
      try {
        return candidate.supports(input.canonicalQueryRef);
      } catch {
        return false;
      }
    });
    if (!adapter) return failed('unknown_canonical_query_ref');

    let fixtureSet: BusinessDefinitionFixtureSet | null;
    try {
      fixtureSet = await this.fixtureSource.load(input.fixtureSetKey);
    } catch {
      return failed('fixture_load_failed');
    }
    if (!fixtureSet?.cases.length || fixtureSet.fixtureSetKey !== input.fixtureSetKey) {
      return failed('unknown_fixture_set');
    }

    const mismatches: string[] = [];
    let comparedCases = 0;
    for (const fixtureCase of fixtureSet.cases) {
      let actual: unknown;
      try {
        actual = await adapter.execute({
          canonicalQueryRef: input.canonicalQueryRef,
          version: input.version,
          fixtureCase,
          timezone: input.timezone,
          storeScope: input.storeScope,
        });
      } catch {
        return failed('canonical_execution_failed', comparedCases);
      }
      comparedCases += 1;
      if (canonicalizeBusinessDefinition(actual) !== canonicalizeBusinessDefinition(fixtureCase.expected)) {
        mismatches.push(fixtureCase.caseKey);
      }
    }

    if (mismatches.length) {
      return { passed: false, code: 'canonical_result_mismatch', comparedCases, mismatches };
    }
    return { passed: true, code: 'canonical_verification_passed', comparedCases, mismatches: [] };
  }
}

function isCanonicalQueryRef(value: string): boolean {
  return /^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+$/.test(value);
}

function failed(code: string, comparedCases = 0): BusinessDefinitionCanonicalVerificationResult {
  return { passed: false, code, comparedCases, mismatches: [] };
}
