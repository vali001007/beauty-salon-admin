import { PartialType } from '@nestjs/swagger';
import { CreateCommissionRuleDto } from './create-commission-rule.dto.js';

export class UpdateCommissionRuleDto extends PartialType(CreateCommissionRuleDto) {}
