import type { BrainDefinitionRef } from './brain-semantic-intent.types.js';
import type {
  BusinessActionParticipantRole,
  BusinessActionParticipantSource,
} from './business-definition-snapshot.types.js';

export interface BrainActionReleaseIdentity {
  readonly releaseId: number;
  readonly releaseFingerprint: string;
}

export type BrainActionQualifiedRole =
  | 'store_manager'
  | 'receptionist'
  | 'marketing'
  | 'beautician'
  | 'inventory'
  | 'finance'
  | 'customer_service';

export interface BrainActionSituationContext {
  readonly schemaVersion: '1.0';
  readonly profileFingerprint: string;
  readonly runId: number;
  readonly conversationId: number;
  readonly storeId: number;
  readonly businessDate: string;
  readonly timezone: 'Asia/Shanghai';
  readonly actorUserId: number;
  readonly qualifiedRole: BrainActionQualifiedRole;
  readonly requestChannel?: string;
  readonly deviceIdHash?: string;
  readonly fingerprint: string;
}

export interface BrainActionInformationArtifact {
  readonly schemaVersion: '1.0';
  readonly profileFingerprint: string;
  readonly artifactType: 'brain_result_reference';
  readonly artifactKey: string;
  readonly artifactVersion: 1;
  readonly sourceRunId: number;
  readonly sourceCapabilityKey?: string;
  readonly sourceCapabilityVersion?: number;
  readonly sourceOutputKey: string;
  readonly sourceSetId: string;
  readonly referencedEntityType: string;
  readonly referencedEntityKey: string;
  readonly contentFingerprint: string;
  readonly fingerprint: string;
}

export interface BrainActionExecutionParticipant {
  readonly role: BusinessActionParticipantRole;
  readonly source: BusinessActionParticipantSource;
  readonly subjectRef: string;
  readonly slotKey?: string;
  readonly storeId: number;
  readonly businessDate: string;
  readonly valueFingerprint?: string;
  readonly fingerprint: string;
}

export interface BrainActionExecutionProvenance {
  readonly schemaVersion: '1.0' | '1.1' | '1.2';
  readonly actionRef: BrainDefinitionRef<'action'>;
  readonly actionBindingFingerprint: string;
  readonly actionSituationContextProfileFingerprint: string;
  readonly actionModalityPolicyFingerprint: string;
  readonly actionInformationArtifactProfileFingerprint: string;
  readonly actionSideEffectInvariantProfileFingerprint: string;
  readonly actionParticipantProfileFingerprint?: string;
  readonly actionRelationProfileFingerprint?: string;
  readonly actionInstitutionalEffectProfileFingerprint?: string;
  readonly ontologySnapshotFingerprint: string;
  readonly situationContext: BrainActionSituationContext;
  readonly informationArtifacts: readonly BrainActionInformationArtifact[];
  readonly participants?: readonly BrainActionExecutionParticipant[];
  readonly capability: {
    readonly key: string;
    readonly version: number;
    readonly sourceFingerprint: string;
  };
  readonly gatewayActionKey: string;
  readonly release?: BrainActionReleaseIdentity;
}
