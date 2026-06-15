import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class CustomerAppAnalyzeSkinDto {
  @ApiProperty({ description: '图片 Data URL 或已上传图片 URL' })
  @IsString()
  imageDataUrl: string;

  @ApiPropertyOptional({ description: '图片 URL 列表；用于保存报告关联图' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @ApiPropertyOptional({ description: '拍摄时间 ISO 字符串' })
  @IsOptional()
  @IsString()
  capturedAt?: string;
}

export class CustomerAppSkinRecommendationsQueryDto {
  @ApiPropertyOptional({ description: '门店 ID' })
  @IsOptional()
  @IsString()
  storeId?: string;
}
