import type { Project } from '@/types';
import { mockGetProjects, mockGetProjectById, mockCreateProject, mockUpdateProject } from './mock/project';
import { realGetProjects, realGetProjectById, realCreateProject, realUpdateProject } from './real/project';

const isReal = import.meta.env.VITE_API_MODE === 'real';

export const getProjects: (params?: { keyword?: string; type?: string }) => Promise<Project[]> =
  isReal ? realGetProjects : mockGetProjects;

export const getProjectById: (id: number) => Promise<Project | undefined> =
  isReal ? realGetProjectById : mockGetProjectById;

export const createProject: (data: Omit<Project, 'id'>) => Promise<Project> =
  isReal ? realCreateProject : mockCreateProject;

export const updateProject: (id: number, data: Partial<Project>) => Promise<Project> =
  isReal ? realUpdateProject : mockUpdateProject;

import type { PaginatedResponse, PaginationParams } from '@/types/pagination';
import { mockGetReservationsPaginated } from './mock/project';
import { realGetReservationsPaginated } from './real/project';

export const getReservationsPaginated: (params: PaginationParams & { storeName?: string; userName?: string; projectName?: string; status?: string }) => Promise<PaginatedResponse<any>> =
  isReal ? realGetReservationsPaginated : mockGetReservationsPaginated;
