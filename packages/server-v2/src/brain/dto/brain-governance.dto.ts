import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateBrainFeedbackDto {
  @IsInt()
  @Min(1)
  runId!: number;

  @IsString()
  rating!: string;

  @IsOptional()
  correction?: Record<string, unknown>;
}
