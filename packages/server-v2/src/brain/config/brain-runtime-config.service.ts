import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';

export type BrainRuntimeMode = 'rules' | 'shadow' | 'model';
export type BrainRolloutCohort = 'default' | 'shadow' | 'canary';

export interface BrainRuntimeConfig {
  cognitionMode: BrainRuntimeMode;
  plannerMode: BrainRuntimeMode;
  modelShadowPercent: number;
  modelCanaryPercent: number;
  minConfidence: number;
  capabilityTopK: number;
  capabilityMinConfidence: number;
  maxPlanNodes: number;
  maxReplans: number;
  totalTimeoutMs: number;
  modelTimeoutMs: number;
  singleToolFastPath: boolean;
  allowCandidateInspectionGuards: boolean;
}

const RUNTIME_MODES: BrainRuntimeMode[] = ['rules', 'shadow', 'model'];

@Injectable()
export class BrainRuntimeConfigService {
  readonly runtime: Readonly<BrainRuntimeConfig>;

  constructor(private readonly configService: ConfigService) {
    const runtime: BrainRuntimeConfig = {
      cognitionMode: this.readMode('BRAIN_COGNITION_MODE', 'rules'),
      plannerMode: this.readMode('BRAIN_PLANNER_MODE', 'rules'),
      modelShadowPercent: this.readInteger('BRAIN_MODEL_SHADOW_PERCENT', 0, 0, 100),
      modelCanaryPercent: this.readInteger('BRAIN_MODEL_CANARY_PERCENT', 0, 0, 100),
      minConfidence: this.readNumber('BRAIN_MODEL_MIN_CONFIDENCE', 0.85, 0, 1),
      capabilityTopK: this.readInteger('BRAIN_CAPABILITY_TOP_K', 8, 1, 20),
      capabilityMinConfidence: this.readNumber('BRAIN_CAPABILITY_MIN_CONFIDENCE', 0.3, 0, 1),
      maxPlanNodes: this.readInteger('BRAIN_MAX_PLAN_NODES', 8, 1, 8),
      maxReplans: this.readInteger('BRAIN_MAX_REPLANS', 2, 0, 2),
      totalTimeoutMs: this.readInteger('BRAIN_TOTAL_TIMEOUT_MS', 20_000, 1_000, 20_000),
      modelTimeoutMs: this.readInteger('BRAIN_MODEL_TIMEOUT_MS', 12_000, 100, 15_000),
      singleToolFastPath: this.readBoolean('BRAIN_SINGLE_TOOL_FAST_PATH', true),
      allowCandidateInspectionGuards: this.readBoolean('BRAIN_ALLOW_CANDIDATE_INSPECTION_GUARDS', false),
    };

    if (runtime.modelTimeoutMs > runtime.totalTimeoutMs) {
      throw new Error('BRAIN_MODEL_TIMEOUT_MS must not exceed BRAIN_TOTAL_TIMEOUT_MS');
    }

    this.runtime = Object.freeze(runtime);
  }

  getStableBucket(requestId: string, cohort: BrainRolloutCohort = 'default'): number {
    const normalizedRequestId = typeof requestId === 'string' ? requestId.trim() : '';
    if (!normalizedRequestId) {
      throw new Error('requestId must be a non-empty string');
    }

    const digest = createHash('sha256').update(`${cohort}:${normalizedRequestId}`).digest();
    return digest.readUInt32BE(0) % 100;
  }

  isInShadow(requestId: string): boolean {
    return this.isInPercentage(requestId, this.runtime.modelShadowPercent, 'shadow');
  }

  isInCanary(requestId: string): boolean {
    return this.isInPercentage(requestId, this.runtime.modelCanaryPercent, 'canary');
  }

  private isInPercentage(requestId: string, percentage: number, cohort: BrainRolloutCohort): boolean {
    return this.getStableBucket(requestId, cohort) < percentage;
  }

  private readMode(key: string, defaultValue: BrainRuntimeMode): BrainRuntimeMode {
    const value = this.readRaw(key, defaultValue);
    if (!RUNTIME_MODES.includes(value as BrainRuntimeMode)) {
      throw new Error(`${key} must be one of ${RUNTIME_MODES.join(', ')}`);
    }
    return value as BrainRuntimeMode;
  }

  private readInteger(key: string, defaultValue: number, min: number, max: number): number {
    const value = this.readNumber(key, defaultValue, min, max);
    if (!Number.isInteger(value)) {
      throw new Error(`${key} must be an integer`);
    }
    return value;
  }

  private readNumber(key: string, defaultValue: number, min: number, max: number): number {
    const raw = this.readRaw(key, String(defaultValue));
    if (raw.length === 0) {
      throw new Error(`${key} must be a finite number`);
    }
    const value = Number(raw);

    if (!Number.isFinite(value)) {
      throw new Error(`${key} must be a finite number`);
    }
    if (value < min || value > max) {
      throw new Error(`${key} must be between ${min} and ${max}`);
    }
    return value;
  }

  private readBoolean(key: string, defaultValue: boolean): boolean {
    const value = this.readRaw(key, String(defaultValue)).toLowerCase();
    if (value !== 'true' && value !== 'false') {
      throw new Error(`${key} must be true or false`);
    }
    return value === 'true';
  }

  private readRaw(key: string, defaultValue: string): string {
    const value = this.configService.get<string | number | boolean>(key);
    return value === undefined || value === null ? defaultValue : String(value).trim();
  }
}
