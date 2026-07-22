import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto.js';

const TERMINAL_CONVERSATION_ROLES = ['manager', 'reception', 'beautician'] as const;
const TERMINAL_CONVERSATION_MESSAGE_ROLES = ['user', 'assistant', 'system'] as const;
const TERMINAL_CONVERSATION_RUNTIMES = ['ami_brain'] as const;

export class TerminalConversationMessageDto {
  @ApiProperty({ enum: TERMINAL_CONVERSATION_MESSAGE_ROLES })
  @IsIn(TERMINAL_CONVERSATION_MESSAGE_ROLES)
  role: (typeof TERMINAL_CONVERSATION_MESSAGE_ROLES)[number];

  @ApiProperty()
  @IsString()
  @MaxLength(4000)
  content: string;

  @ApiProperty({ description: 'Unix timestamp in ms' })
  @IsNumber()
  timestamp: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  title?: string;

  @ApiPropertyOptional({ enum: TERMINAL_CONVERSATION_RUNTIMES })
  @IsOptional()
  @IsIn(TERMINAL_CONVERSATION_RUNTIMES)
  runtime?: (typeof TERMINAL_CONVERSATION_RUNTIMES)[number];
}

export class SaveTerminalConversationDto {
  @ApiProperty({ enum: TERMINAL_CONVERSATION_ROLES })
  @IsIn(TERMINAL_CONVERSATION_ROLES)
  role: (typeof TERMINAL_CONVERSATION_ROLES)[number];

  @ApiPropertyOptional({ description: '当前终端操作账号 ID' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  operatorId?: number;

  @ApiPropertyOptional({ example: '2026-06-08' })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiProperty({ type: [TerminalConversationMessageDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TerminalConversationMessageDto)
  messages: TerminalConversationMessageDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  messageCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class QueryTerminalConversationsDto extends PaginationDto {
  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number = 30;

  @ApiPropertyOptional({ example: '2026-06-01' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-06-08' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ enum: TERMINAL_CONVERSATION_ROLES })
  @IsOptional()
  @IsIn(TERMINAL_CONVERSATION_ROLES)
  role?: (typeof TERMINAL_CONVERSATION_ROLES)[number];

  @ApiPropertyOptional({ description: '按终端操作账号隔离历史' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  operatorId?: number;
}
