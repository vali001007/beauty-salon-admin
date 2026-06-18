import { IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';
import type { AgentRole } from '../agent.types.js';
import type { BusinessTimeRange } from '../business-task/business-task.types.js';

export class ExecuteSemanticSqlDto {
  @IsString()
  taskId!: string;

  @IsOptional()
  @IsIn(['manager', 'reception', 'beautician'])
  actorRole?: AgentRole;

  @IsArray()
  @IsString({ each: true })
  metricKeys!: string[];

  @IsArray()
  @IsString({ each: true })
  dimensions!: string[];

  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  timeRange?: BusinessTimeRange;

  @IsOptional()
  @IsArray()
  orderBy?: Array<{ metric: string; direction: 'asc' | 'desc' }>;

  @IsInt()
  @Min(1)
  @Max(100)
  limit!: number;

  @IsOptional()
  @IsBoolean()
  betaEnabled?: boolean;
}
