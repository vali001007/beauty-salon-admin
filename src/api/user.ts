import type { SystemUser } from '@/types';
import { mockGetUsers, mockCreateUser, mockUpdateUser } from './mock/user';
import { realGetUsers, realCreateUser, realUpdateUser } from './real/user';

const isReal = import.meta.env.VITE_API_MODE === 'real';

export const getUsers: () => Promise<SystemUser[]> =
  isReal ? realGetUsers : mockGetUsers;

export const createUser: (data: Omit<SystemUser, 'id' | 'lastLogin' | 'createdAt' | 'status'>) => Promise<SystemUser> =
  isReal ? realCreateUser : mockCreateUser;

export const updateUser: (id: number, data: Partial<SystemUser>) => Promise<SystemUser> =
  isReal ? realUpdateUser : mockUpdateUser;

import type { PaginatedResponse, PaginationParams } from '@/types/pagination';
import { mockGetUsersPaginated } from './mock/user';
import { realGetUsersPaginated } from './real/user';

export const getUsersPaginated: (params: PaginationParams) => Promise<PaginatedResponse<SystemUser>> =
  isReal ? realGetUsersPaginated : mockGetUsersPaginated;
