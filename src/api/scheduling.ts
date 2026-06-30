import type { ScheduleSlot } from '@/types/store';
import {
  realGetSchedule,
  realGetWeeklySchedules,
  realSaveSchedule,
  realGetSchedulePaginated,
  realCreateScheduleSlot,
  realDeleteScheduleSlot,
  realPreviewSmartSchedule,
  realOneClickSmartSchedule,
  realEvaluateSmartSchedule,
  realPublishSmartSchedule,
  realRollbackSmartSchedule,
  realGetSmartSchedulingRuns,
  realGetSchedulingDemand,
  realGetGapOpportunities,
  realRefreshGapCandidates,
  realCreateGapFollowUpTasks,
  realCreateGapConfirmationDraft,
  realCreateGapBenefitDraft,
} from './real/scheduling';
import type {
  BenefitDraft,
  ConfirmationDraft,
  GapCandidate,
  GapOpportunityResult,
  SchedulingDemandResult,
  SmartSchedulingOptions,
  SmartSchedulingResult,
  SmartSchedulingRunsResult,
} from './real/scheduling';

export const getSchedule: (params: {
  beauticianId: number;
  weekStart: string;
}) => Promise<ScheduleSlot[][]> =
  realGetSchedule;

export const getWeeklySchedules: (params: {
  beauticianIds: number[];
  weekStart: string;
}) => Promise<Record<number, ScheduleSlot[][]>> =
  realGetWeeklySchedules;

export const saveSchedule: (data: {
  beauticianId: number;
  weekStart: string;
  slots: ScheduleSlot[][];
}) => Promise<void> =
  realSaveSchedule;

import type { PaginatedResponse, PaginationParams } from '@/types/pagination';

export const getSchedulePaginated: (params: PaginationParams & { beauticianId?: number; weekStart?: string }) => Promise<PaginatedResponse<any>> =
  realGetSchedulePaginated;

export const createScheduleSlot: (data: { beauticianId: number; date: string; time: string; available: boolean }) => Promise<any> =
  realCreateScheduleSlot;

export const deleteScheduleSlot: (id: number) => Promise<void> =
  realDeleteScheduleSlot;

export type {
  DemandLoadLevel,
  DemandRecommendedAction,
  BenefitDraft,
  SchedulingDemandResult,
  SchedulingDemandSlot,
  ConfirmationDraft,
  GapCandidate,
  GapOpportunity,
  GapOpportunityResult,
  GapOpportunitySummary,
  SmartScheduleItem,
  SmartSchedulingConflict,
  SmartSchedulingAlternative,
  SmartSchedulingMode,
  SmartSchedulingOptions,
  SmartSchedulingResult,
  SmartSchedulingRunsResult,
  SmartSchedulingSummary,
  ScheduleVersion,
} from './real/scheduling';

export const previewSmartSchedule: (data: SmartSchedulingOptions) => Promise<SmartSchedulingResult> =
  realPreviewSmartSchedule;

export const oneClickSmartSchedule: (data: SmartSchedulingOptions) => Promise<SmartSchedulingResult> =
  realOneClickSmartSchedule;

export const evaluateSmartSchedule: (data: SmartSchedulingOptions) => Promise<SmartSchedulingResult> =
  realEvaluateSmartSchedule;

export const publishSmartSchedule: (data: SmartSchedulingOptions) => Promise<SmartSchedulingResult> =
  realPublishSmartSchedule;

export const rollbackSmartSchedule: (data: SmartSchedulingOptions) => Promise<SmartSchedulingResult> =
  realRollbackSmartSchedule;

export const getSmartSchedulingRuns: (params: { weekStart: string }) => Promise<SmartSchedulingRunsResult> =
  realGetSmartSchedulingRuns;

export const getSchedulingDemand: (params: { weekStart: string }) => Promise<SchedulingDemandResult> =
  realGetSchedulingDemand;

export const getGapOpportunities: (params: { weekStart: string }) => Promise<GapOpportunityResult> =
  realGetGapOpportunities;

export const refreshGapCandidates: (id: number, data?: { limit?: number; projectIds?: number[]; channel?: string }) => Promise<GapCandidate[]> =
  realRefreshGapCandidates;

export const createGapFollowUpTasks: (
  id: number,
  data: {
    candidateIds?: number[];
    assigneeRole?: 'manager' | 'consultant' | 'reception';
    assigneeUserId?: number;
    assigneeBeauticianId?: number;
    dueAt?: string;
  },
) => Promise<{ items: Array<{ candidate: GapCandidate; task: unknown }> }> =
  realCreateGapFollowUpTasks;

export const createGapConfirmationDraft: (id: number, data: { candidateId?: number; channel?: string }) => Promise<ConfirmationDraft> =
  realCreateGapConfirmationDraft;

export const createGapBenefitDraft: (id: number, data: { candidateId?: number; channel?: string }) => Promise<BenefitDraft> =
  realCreateGapBenefitDraft;
