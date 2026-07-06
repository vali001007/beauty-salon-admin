import { Transform, Type } from 'class-transformer';
import {
  Allow,
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const CAPABILITY_ID_LIMIT = 200;
const DEFAULT_TEXT_LIMIT = 500;

export enum AgentV2CapabilityDraftStatusDto {
  all = 'all',
  draft = 'draft',
  approved = 'approved',
  published = 'published',
  rejected = 'rejected',
  deprecated = 'deprecated',
  needs_review = 'needs_review',
  needs_development = 'needs_development',
}

export enum AgentV2CapabilityDraftWriteStatusDto {
  draft = 'draft',
  approved = 'approved',
  published = 'published',
  rejected = 'rejected',
  deprecated = 'deprecated',
  needs_review = 'needs_review',
  needs_development = 'needs_development',
}

export enum AgentV2RiskLevelDto {
  all = 'all',
  low = 'low',
  medium = 'medium',
  high = 'high',
}

export enum AgentV2RiskLevelWriteDto {
  low = 'low',
  medium = 'medium',
  high = 'high',
}

export enum AgentV2ReleaseStrategyDto {
  all = 'all',
  auto_publish = 'auto_publish',
  approval_required = 'approval_required',
  write_blocked = 'write_blocked',
}

export enum AgentV2ReleaseStrategyWriteDto {
  auto_publish = 'auto_publish',
  approval_required = 'approval_required',
  write_blocked = 'write_blocked',
}

export enum AgentV2AutoPublishScanModeDto {
  full = 'full',
  git_diff = 'git_diff',
  hash = 'hash',
}

export enum AgentV2ReviewDecisionDto {
  approve = 'approve',
  reject = 'reject',
  needs_changes = 'needs_changes',
  draft = 'draft',
}

export enum AgentV2PublishModeDto {
  selected = 'selected',
  approved = 'approved',
  auto = 'auto',
}

export class AgentV2CapabilityDraftListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @IsOptional()
  @IsEnum(AgentV2CapabilityDraftStatusDto)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  domain?: string;

  @IsOptional()
  @IsEnum(AgentV2RiskLevelDto)
  riskLevel?: string;

  @IsOptional()
  @IsEnum(AgentV2ReleaseStrategyDto)
  releaseStrategy?: string;
}

export class AgentV2ImportDraftsDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  path?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  overwriteReviewed?: boolean;

  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @ArrayMaxSize(CAPABILITY_ID_LIMIT)
  @IsString({ each: true })
  capabilityIds?: string[];
}

export class AgentV2UpdateDraftDto {
  @IsOptional()
  @IsEnum(AgentV2CapabilityDraftWriteStatusDto)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayNameZh?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  domain?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  businessObject?: string;

  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  actions?: string[];

  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  personaCodes?: string[];

  @IsOptional()
  @IsEnum(AgentV2ReleaseStrategyWriteDto)
  releaseStrategy?: string;

  @IsOptional()
  @IsEnum(AgentV2RiskLevelWriteDto)
  riskLevel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  permissionSource?: string;

  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @ArrayMaxSize(80)
  @IsString({ each: true })
  permissionCodes?: string[];

  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  sourceModels?: string[];

  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  sourceApis?: string[];

  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  sourceDtos?: string[];

  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  sourceRoutes?: string[];

  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  outputKinds?: string[];

  @IsOptional()
  @Allow()
  executor?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  customServiceReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  storeScope?: string;

  @IsOptional()
  @Allow()
  fieldPolicies?: unknown[];

  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  triggerKeywords?: string[];

  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  examples?: string[];

  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  negativeExamples?: string[];

  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  boundaryNotes?: string[];

  @IsOptional()
  @Allow()
  governanceIssues?: unknown[];
}

export class AgentV2StoreScopedBodyDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  storeId?: number;
}

export class AgentV2PostPublishSmokeDto extends AgentV2StoreScopedBodyDto {
  @IsOptional()
  @IsString()
  @MaxLength(DEFAULT_TEXT_LIMIT)
  question?: string;
}

export class AgentV2EvalGateDto {
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @ArrayMaxSize(CAPABILITY_ID_LIMIT)
  @IsString({ each: true })
  capabilityIds?: string[];
}

class AgentV2AutoPublishRunBaseDto {
  @IsOptional()
  @IsEnum(AgentV2AutoPublishScanModeDto)
  scanMode?: 'full' | 'git_diff' | 'hash';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  path?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  postPublishSmoke?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  postPublishSmokeLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  postPublishSmokeStoreId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;
}

export class AgentV2AutoPublishRunDto extends AgentV2AutoPublishRunBaseDto {
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  overwriteReviewed?: boolean;
}

export class AgentV2DeployHookRunDto extends AgentV2AutoPublishRunBaseDto {}

export class AgentV2AutoPublishRunListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  trigger?: string;
}

export class AgentV2ReviewDraftDto {
  @IsString()
  @MaxLength(160)
  capabilityId!: string;

  @IsEnum(AgentV2ReviewDecisionDto)
  decision!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  @IsOptional()
  @Allow()
  changes?: Record<string, unknown>;
}

export class AgentV2PublishDto {
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @ArrayMaxSize(CAPABILITY_ID_LIMIT)
  @IsString({ each: true })
  capabilityIds?: string[];

  @IsOptional()
  @IsEnum(AgentV2PublishModeDto)
  mode?: 'selected' | 'approved' | 'auto';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;
}

export class AgentV2QueryKeyListQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  domain?: string;
}

function toStringArray({ value }: { value: unknown }) {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value;
  return [value];
}

function toBoolean({ value, obj, key }: { value: unknown; obj?: Record<string, unknown>; key?: string }) {
  const raw = key && obj ? obj[key] : value;
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return raw;
}
