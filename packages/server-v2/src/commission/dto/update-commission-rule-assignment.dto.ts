import { PartialType } from '@nestjs/swagger';
import { CreateCommissionRuleAssignmentDto } from './create-commission-rule.dto.js';

export class UpdateCommissionRuleAssignmentDto extends PartialType(CreateCommissionRuleAssignmentDto) {}
