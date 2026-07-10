import { Injectable } from '@nestjs/common';
import { BrainQuerySkillsService } from './brain-query-skills.service.js';
import { BrainSkillRegistryService } from './brain-skill-registry.service.js';

@Injectable()
export class BrainSkillRuntimeService {
  constructor(
    private readonly registry: BrainSkillRegistryService,
    private readonly querySkills: BrainQuerySkillsService,
  ) {}

  composeSuggestion(input: {
    conclusion: string;
    evidence: string[];
    action: string;
    benefit: string;
    entry: string;
  }) {
    return input;
  }
}
