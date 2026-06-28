import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateAgentRunDto {
  @ApiProperty({ description: '用户自然语言输入', example: '有哪些商品适合做活动' })
  @IsString()
  @MaxLength(1000)
  message!: string;

  @ApiPropertyOptional({ description: '当前角色', enum: ['manager', 'reception', 'beautician'] })
  @IsOptional()
  @IsIn(['manager', 'reception', 'beautician'])
  role?: 'manager' | 'reception' | 'beautician';

  @ApiPropertyOptional({ description: '入口来源', example: 'aura_lite' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  entrypoint?: string;

  @ApiPropertyOptional({ description: '角色 Agent 代码', example: 'manager' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  personaCode?: string;

  @ApiPropertyOptional({ description: '当前终端选择的操作账号 ID' })
  @IsOptional()
  @IsInt()
  operatorId?: number | null;

  @ApiPropertyOptional({ description: '上一轮任务上下文' })
  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}

export class AppendAgentMessageDto {
  @ApiProperty({ description: '用户追加输入', example: '帮我生成活动草稿' })
  @IsString()
  @MaxLength(1000)
  message!: string;

  @ApiPropertyOptional({ description: '当前角色', enum: ['manager', 'reception', 'beautician'] })
  @IsOptional()
  @IsIn(['manager', 'reception', 'beautician'])
  role?: 'manager' | 'reception' | 'beautician';

  @ApiPropertyOptional({ description: '入口来源', example: 'terminal:kiosk' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  entrypoint?: string;

  @ApiPropertyOptional({ description: '角色 Agent 代码', example: 'manager' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  personaCode?: string;

  @ApiPropertyOptional({ description: '当前终端选择的操作账号 ID' })
  @IsOptional()
  @IsInt()
  operatorId?: number | null;

  @ApiPropertyOptional({ description: '追加上下文' })
  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}

export class DecideAgentApprovalDto {
  @ApiPropertyOptional({ description: '当前角色', enum: ['manager', 'reception', 'beautician'] })
  @IsOptional()
  @IsIn(['manager', 'reception', 'beautician'])
  role?: 'manager' | 'reception' | 'beautician';

  @ApiPropertyOptional({ description: '当前终端选择的操作账号 ID' })
  @IsOptional()
  @IsInt()
  operatorId?: number | null;

  @ApiPropertyOptional({ description: '审批备注' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;

  @ApiPropertyOptional({ description: '人工调整后的工具参数' })
  @IsOptional()
  @IsObject()
  args?: Record<string, unknown>;
}
