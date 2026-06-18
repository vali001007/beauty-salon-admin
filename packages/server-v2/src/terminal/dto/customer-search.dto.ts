import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CustomerSearchDto {
  @ApiProperty({ description: '搜索关键词（手机号/姓名）', example: '138' })
  @IsString()
  @IsNotEmpty()
  keyword: string;
}
