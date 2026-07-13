import { Injectable } from '@nestjs/common';
import { BrainQueryCompilerService } from './brain-query-compiler.service.js';
import { BrainReadonlyQueryExecutorService } from './brain-readonly-query-executor.service.js';

@Injectable()
export class BrainSemanticQueryEngineService {
  constructor(
    private readonly compiler: BrainQueryCompilerService,
    private readonly executor: BrainReadonlyQueryExecutorService,
  ) {}

  getRequiredPermission(metric: string) {
    return this.compiler.getRequiredPermission(metric);
  }

  async run(intent: Parameters<BrainQueryCompilerService['compile']>[0]) {
    const compiled = this.compiler.compile(intent);
    const rows = await this.executor.execute(compiled);
    return { rows, citations: compiled.citations, compiled };
  }
}
