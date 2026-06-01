import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class QuickCreateCustomerDto {
  @ApiProperty({ description: '客户姓名', example: '李女士' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: '手机号', example: '13800138000' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: '性别', example: '女' })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({ description: '客户来源', example: 'Ami Aura Lite' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ description: '生日', example: '1992-05-20' })
  @IsOptional()
  @IsDateString()
  birthday?: string;

  @ApiPropertyOptional({ description: '会员等级', example: '银卡会员' })
  @IsOptional()
  @IsString()
  memberLevel?: string;

  @ApiPropertyOptional({ description: '肤质/画像摘要', example: '干性敏感，重点补水修护' })
  @IsOptional()
  @IsString()
  skinCondition?: string;

  @ApiPropertyOptional({ description: '客户标签', example: ['敏感肌', '高意向'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  remark?: string;
}
