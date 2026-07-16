import type { BrainEvaluationReleaseSnapshot } from '../governance/brain-evaluation-release-snapshot.js';

export interface BrainRequestContext {
  userId: number;
  storeId: number;
  visibleStoreIds: number[];
  roles?: string[];
  permissions: string[];
  deniedPermissions: string[];
  requestId: string;
  timezone: string;
  /** Server-owned override used only by governance evaluation runs. */
  governanceEvalReleaseId?: number;
  /** Frozen server-owned snapshot reused by every case in one evaluation run. */
  governanceEvalReleaseSnapshot?: BrainEvaluationReleaseSnapshot;
}
