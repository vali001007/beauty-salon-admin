import { Injectable } from '@nestjs/common';
import { BrainSemanticQueryEngineService } from '../semantic/brain-semantic-query-engine.service.js';

@Injectable()
export class BrainQuerySkillsService {
  constructor(private readonly semanticQueryEngine: BrainSemanticQueryEngineService) {}

  runMetricQuery(input: Parameters<BrainSemanticQueryEngineService['run']>[0]) {
    return this.semanticQueryEngine.run(input);
  }
}
