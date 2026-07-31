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
  /** Server-owned conversation identity attached after conversation access is verified. */
  conversationId?: number;
  /** Trusted application channel only when the client supplies the governed header. */
  requestChannel?: string;
  /** SHA-256 of the client device identifier; raw device identifiers never enter Brain traces. */
  deviceIdHash?: string;
  /** Server-owned override used only by governance evaluation runs. */
  governanceEvalReleaseId?: number;
  /** Frozen server-owned snapshot reused by every case in one evaluation run. */
  governanceEvalReleaseSnapshot?: BrainEvaluationReleaseSnapshot;
}
