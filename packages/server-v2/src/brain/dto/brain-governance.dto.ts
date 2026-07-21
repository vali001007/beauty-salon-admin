import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateBrainFeedbackDto {
  @IsInt()
  @Min(1)
  runId!: number;

  @IsString()
  rating!: string;

  @IsOptional()
  correction?: Record<string, unknown>;
}

export class CreateBrainEvalRunDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  releaseId?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @Matches(/^[A-Za-z0-9_.:@-]{1,160}$/, { each: true })
  caseKeys?: string[];

  @IsOptional()
  @IsIn(['store_manager', 'receptionist', 'marketing', 'beautician', 'inventory', 'finance', 'customer_service'])
  roleKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  modelVersion?: string;
}
