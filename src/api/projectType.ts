import type { ProjectType } from './mock/projectType';
import { mockGetProjectTypes, mockCreateProjectType, mockUpdateProjectType, mockDeleteProjectTypes } from './mock/projectType';
import { realGetProjectTypes, realCreateProjectType, realUpdateProjectType, realDeleteProjectTypes } from './real/projectType';

const isReal = import.meta.env.VITE_API_MODE === 'real';

export type { ProjectType };

export const getProjectTypes: () => Promise<ProjectType[]> =
  isReal ? realGetProjectTypes : mockGetProjectTypes;

export const createProjectType: (data: { name: string; description: string; status: '启用' | '停用' }) => Promise<ProjectType> =
  isReal ? realCreateProjectType : mockCreateProjectType;

export const updateProjectType: (id: number, data: Partial<{ name: string; description: string; status: '启用' | '停用' }>) => Promise<ProjectType> =
  isReal ? realUpdateProjectType : mockUpdateProjectType;

export const deleteProjectTypes: (ids: number[]) => Promise<void> =
  isReal ? realDeleteProjectTypes : mockDeleteProjectTypes;
