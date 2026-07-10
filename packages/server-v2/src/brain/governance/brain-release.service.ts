import { Injectable } from '@nestjs/common';

@Injectable()
export class BrainReleaseService {
  buildRollbackPlan(currentReleaseKey: string, previousReleaseKey: string) {
    return {
      currentReleaseKey,
      previousReleaseKey,
      steps: ['disable_current_release', 'enable_previous_release', 'record_release_log'],
    };
  }
}
