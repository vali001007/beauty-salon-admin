import { BadRequestException, Injectable } from '@nestjs/common';
import { Ajv, type ValidateFunction } from 'ajv';
import type { BrainCapabilityCard } from './brain-capability.types.js';
import { findForbiddenCapabilityIdentityArg } from './brain-capability-identity-args.js';

@Injectable()
export class BrainCapabilityArgsValidatorService {
  private readonly ajv = new Ajv({ allErrors: true, strict: true });
  private readonly validators = new Map<string, ValidateFunction>();

  assertValid(card: BrainCapabilityCard, args: Record<string, unknown>): void {
    this.assertNoIdentityArgs(args);
    const cacheKey = `${card.key}@${card.version}:${card.sourceFingerprint}`;
    let validator = this.validators.get(cacheKey);
    if (!validator) {
      try {
        validator = this.ajv.compile(structuredClone(card.inputSchema) as object);
      } catch {
        throw new BadRequestException(`capability_input_schema_invalid:${card.key}`);
      }
      this.validators.set(cacheKey, validator);
    }
    if (!validator(args)) {
      const detail = (validator.errors ?? []).map((error) => `${error.instancePath || '/'}:${error.keyword}`).join(',');
      throw new BadRequestException(`capability_args_invalid:${card.key}:${detail || 'schema_mismatch'}`);
    }
  }

  private assertNoIdentityArgs(args: Record<string, unknown>) {
    const forbidden = findForbiddenCapabilityIdentityArg(args);
    if (forbidden) throw new BadRequestException(`capability_identity_arg_forbidden:${forbidden}`);
  }
}
