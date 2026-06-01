import type { ProjectType } from './domain-types';
import { realGetProjectTypes, realCreateProjectType, realUpdateProjectType, realDeleteProjectTypes } from './real/projectType';

export type { ProjectType };

export const getProjectTypes: () => Promise<ProjectType[]> =
  realGetProjectTypes;

export const createProjectType: (data: { name: string; description: string; status: '启用' | '停用' }) => Promise<ProjectType> =
  realCreateProjectType;

export const updateProjectType: (id: number, data: Partial<{ name: string; description: string; status: '启用' | '停用' }>) => Promise<ProjectType> =
  realUpdateProjectType;

export const deleteProjectTypes: (ids: number[]) => Promise<void> =
  realDeleteProjectTypes;
