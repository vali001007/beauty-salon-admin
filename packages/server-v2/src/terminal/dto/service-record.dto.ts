import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

export class TerminalServiceRecordConsumptionItemDto {
  @ApiPropertyOptional({ description: '耗材商品 ID' })
  @IsOptional()
  @IsInt()
  productId?: number;

  @ApiPropertyOptional({ description: '耗材名称' })
  @IsOptional()
  @IsString()
  productName?: string;

  @ApiPropertyOptional({ description: 'SKU' })
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional({ description: '标准用量' })
  @IsOptional()
  @IsNumber()
  standardQty?: number;

  @ApiPropertyOptional({ description: '实际用量' })
  @IsOptional()
  @IsNumber()
  actualQty?: number;

  @ApiPropertyOptional({ description: '单位' })
  @IsOptional()
  @IsString()
  unit?: string;
}

export class CreateTerminalServiceRecordDto {
  @ApiPropertyOptional({ description: '服务任务 ID' })
  @IsOptional()
  @IsInt()
  taskId?: number;

  @ApiProperty({ description: '客户 ID' })
  @IsInt()
  customerId: number;

  @ApiPropertyOptional({ description: '项目 ID' })
  @IsOptional()
  @IsInt()
  projectId?: number;

  @ApiPropertyOptional({ description: '美容师 ID' })
  @IsOptional()
  @IsInt()
  beauticianId?: number;

  @ApiPropertyOptional({ description: '服务结果' })
  @IsOptional()
  @IsString()
  result?: string;

  @ApiPropertyOptional({ description: '客户反馈' })
  @IsOptional()
  @IsString()
  customerFeedback?: string;

  @ApiPropertyOptional({ description: '下次护理建议' })
  @IsOptional()
  @IsString()
  nextSuggestion?: string;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional({ description: '服务图片' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @ApiPropertyOptional({ description: '耗材明细', type: [TerminalServiceRecordConsumptionItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TerminalServiceRecordConsumptionItemDto)
  consumptionItems?: TerminalServiceRecordConsumptionItemDto[];

  @ApiPropertyOptional({ description: '是否转前台收银' })
  @IsOptional()
  @IsBoolean()
  transferToCashier?: boolean;

  @ApiPropertyOptional({ description: '下次预约建议' })
  @IsOptional()
  @IsString()
  nextReservationSuggestion?: string;
}
