import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  Validate,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

export const BUSINESS_DEFINITION_KINDS = [
  'entity',
  'field',
  'relation',
  'metric',
  'dimension',
  'status_dictionary',
  'time_policy',
  'query_definition',
] as const;

export type BusinessDefinitionKindValue = (typeof BUSINESS_DEFINITION_KINDS)[number];
export type BusinessDefinitionDraftLifecycle = 'candidate' | 'draft';

@ValidatorConstraint({ name: 'evidenceLineRange', async: false })
export class EvidenceLineRangeConstraint implements ValidatorConstraintInterface {
  validate(lineEnd: number | undefined, args: ValidationArguments) {
    const lineStart = (args.object as BusinessDefinitionEvidenceDto).lineStart;
    return lineEnd === undefined || lineStart === undefined || lineEnd >= lineStart;
  }

  defaultMessage() {
    return 'lineEnd must be greater than or equal to lineStart';
  }
}

export class BusinessDefinitionEvidenceDto {
  @IsString()
  @MinLength(1)
  sourceType!: string;

  @IsString()
  @MinLength(1)
  sourcePath!: string;

  @IsOptional()
  @IsString()
  sourceSymbol?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  lineStart?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Validate(EvidenceLineRangeConstraint)
  lineEnd?: number;

  @IsString()
  @MinLength(1)
  evidenceKind!: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  confidence!: number;

  @IsOptional()
  @IsString()
  conflictGroup?: string;
}

export class CreateBusinessDefinitionDraftDto {
  @IsString()
  @MinLength(1)
  definitionKey!: string;

  @IsIn(BUSINESS_DEFINITION_KINDS)
  kind!: BusinessDefinitionKindValue;

  @IsString()
  @MinLength(1)
  domain!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  ownerType!: string;

  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsOptional()
  @IsIn(['candidate', 'draft'])
  lifecycleStatus?: BusinessDefinitionDraftLifecycle;

  @IsOptional()
  @IsString()
  schemaVersion?: string;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  canonicalQueryRef?: string;

  @IsOptional()
  @IsString()
  fixtureSetKey?: string;

  @IsOptional()
  @IsIn(['Asia/Shanghai', 'UTC'])
  timezone?: 'Asia/Shanghai' | 'UTC';

  @IsOptional()
  @IsObject()
  storeScope?: Record<string, unknown>;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BusinessDefinitionEvidenceDto)
  evidence!: BusinessDefinitionEvidenceDto[];
}

export class ValidateBusinessDefinitionVersionDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class PublishBusinessDefinitionVersionDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedCurrentVersionId?: number;
}

export class ListBusinessDefinitionsDto {
  @IsOptional()
  @IsIn(BUSINESS_DEFINITION_KINDS)
  kind?: BusinessDefinitionKindValue;

  @IsOptional()
  @IsString()
  domain?: string;

  @IsOptional()
  @IsIn(['active', 'archived'])
  status?: 'active' | 'archived';

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
}

export interface CreateBusinessDefinitionDraftInput extends CreateBusinessDefinitionDraftDto {
  createdBy: number;
  candidateDiagnostics?: {
    source: string;
    blockedReasons: string[];
  };
}

export interface ValidateBusinessDefinitionVersionInput extends ValidateBusinessDefinitionVersionDto {
  validatedBy: number;
}

export interface PublishBusinessDefinitionVersionInput {
  publishedBy: number;
  expectedCurrentVersionId?: number;
}
