import type { Project } from '@/types';
import type { PaginatedResponse, PaginationParams } from '@/types/pagination';
import {
  realCancelReservation,
  realCheckInReservation,
  realConfirmReservation,
  realGetProjects,
  realGetProjectById,
  realCreateProject,
  realUpdateProject,
  realGetProjectBom,
  realSetProjectBom,
  type ProjectBomPayloadItem,
  realDeleteProject,
  realGetProjectsPaginated,
  realGetReservationById,
  realGetReservationsPaginated,
  realCreateReservation,
  realUpdateReservation,
} from './real/project';

export const getProjects: (params?: { keyword?: string; type?: string; status?: string; sellableOnly?: boolean }) => Promise<Project[]> =
  realGetProjects;

export const getProjectById: (id: number) => Promise<Project | undefined> =
  realGetProjectById;

export const createProject: (data: Omit<Project, 'id'>) => Promise<Project> =
  realCreateProject;

export const updateProject: (id: number, data: Partial<Project>) => Promise<Project> =
  realUpdateProject;

export type { ProjectBomPayloadItem };

export const getProjectBom: (id: number) => Promise<NonNullable<Project['bom']>> =
  realGetProjectBom;

export const setProjectBom: (id: number, items: ProjectBomPayloadItem[]) => Promise<NonNullable<Project['bom']>> =
  realSetProjectBom;

export const deleteProject: (id: number) => Promise<void> =
  realDeleteProject;

export const getProjectsPaginated: (params: PaginationParams & { keyword?: string; type?: string; status?: string; sellableOnly?: boolean }) => Promise<PaginatedResponse<Project>> =
  realGetProjectsPaginated;

export const getReservationsPaginated: (
  params: PaginationParams & {
    storeName?: string;
    userName?: string;
    projectName?: string;
    beauticianName?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    scope?: 'future' | 'history';
  },
) => Promise<PaginatedResponse<any>> =
  realGetReservationsPaginated;

export const getReservationById: (id: string | number) => Promise<any> =
  realGetReservationById;

export const createReservation: (data: Record<string, any>) => Promise<any> =
  realCreateReservation;

export const updateReservation: (id: string | number, data: Record<string, any>) => Promise<any> =
  realUpdateReservation;

export const confirmReservation: (id: string | number) => Promise<any> =
  realConfirmReservation;

export const checkInReservation: (id: string | number) => Promise<any> =
  realCheckInReservation;

export const cancelReservation: (id: string | number, reason?: string) => Promise<any> =
  realCancelReservation;
