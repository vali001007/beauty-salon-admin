import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class CreateTerminalAutomationDto {
  @ApiProperty({ description: '终端草稿ID' })
  @IsString()
  draftId: string;

  @ApiProperty({ description: '自动化名称' })
  @IsString()
  title: string;

  @ApiProperty({ description: '面向店员展示的摘要' })
  @IsString()
  summary: string;

  @ApiProperty({ description: '原始自然语言指令' })
  @IsString()
  sourceText: string;

  @ApiProperty({ description: '触发时机' })
  @IsString()
  trigger: string;

  @ApiProperty({ description: '触发对象' })
  @IsString()
  audience: string;

  @ApiProperty({ description: '执行动作' })
  @IsString()
  action: string;

  @ApiProperty({ description: '频控说明' })
  @IsString()
  frequencyCap: string;

  @ApiProperty({ enum: ['low', 'medium', 'high'], description: '风险等级' })
  @IsIn(['low', 'medium', 'high'])
  riskLevel: 'low' | 'medium' | 'high';

  @ApiProperty({ description: '是否需要审批' })
  @IsBoolean()
  requiresApproval: boolean;

  @ApiPropertyOptional({ type: [String], description: '缺失字段' })
  @IsOptional()
  @IsArray()
  missingFields?: string[];
}

export class UpdateTerminalAutomationDto {
  @ApiPropertyOptional({ description: '自动化名称' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: '触发时机' })
  @IsOptional()
  @IsString()
  trigger?: string;

  @ApiPropertyOptional({ description: '触发对象' })
  @IsOptional()
  @IsString()
  audience?: string;

  @ApiPropertyOptional({ description: '执行动作' })
  @IsOptional()
  @IsString()
  action?: string;
}
