import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateBrainConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  title?: string;
}

export class SendBrainMessageDto {
  @IsString()
  @MaxLength(4000)
  message!: string;

  @IsOptional()
  @IsIn(['store_manager', 'receptionist', 'beautician', 'marketing', 'finance', 'inventory', 'customer_service'])
  roleHint?: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}

export class ConfirmBrainActionDto {
  @IsInt()
  @Min(1)
  runId!: number;

  @IsString()
  actionId!: string;
}
