import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBooleanString, IsInt, IsOptional, IsString } from 'class-validator';

export class CustomerAppHomeQueryDto {
  @ApiPropertyOptional({ description: '门店 ID' })
  @IsOptional()
  @IsInt()
  storeId?: number;

  @ApiPropertyOptional({ description: '渠道来源' })
  @IsOptional()
  @IsString()
  channel?: string;
}

export class CustomerAppProjectQueryDto {
  @ApiPropertyOptional({ description: '门店 ID' })
  @IsOptional()
  @IsInt()
  storeId?: number;

  @ApiPropertyOptional({ description: '搜索关键词' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: '项目分类名称' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: '是否只看推荐' })
  @IsOptional()
  @IsBooleanString()
  recommended?: string;

  @ApiPropertyOptional({ description: '页码' })
  @IsOptional()
  @IsInt()
  page?: number;

  @ApiPropertyOptional({ description: '每页数量' })
  @IsOptional()
  @IsInt()
  pageSize?: number;
}

export class CustomerAppPaginationDto {
  @ApiPropertyOptional({ description: '页码' })
  @IsOptional()
  @IsInt()
  page?: number;

  @ApiPropertyOptional({ description: '每页数量' })
  @IsOptional()
  @IsInt()
  pageSize?: number;

  @ApiPropertyOptional({ description: '状态' })
  @IsOptional()
  @IsString()
  status?: string;
}
