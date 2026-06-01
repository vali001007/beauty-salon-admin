import type { SystemUser, SystemUserCreateInput, SystemUserUpdateInput } from '@/types';
import { realGetUsers, realCreateUser, realUpdateUser, realDeleteUser, realResetPassword } from './real/user';

export const getUsers: () => Promise<SystemUser[]> =
  realGetUsers;

export const createUser: (data: SystemUserCreateInput) => Promise<SystemUser> =
  realCreateUser;

export const updateUser: (id: number, data: SystemUserUpdateInput) => Promise<SystemUser> =
  realUpdateUser;

export const deleteUser: (id: number) => Promise<void> =
  realDeleteUser;

export const resetPassword: (id: number, newPassword: string) => Promise<void> =
  realResetPassword;

import type { PaginatedResponse, PaginationParams } from '@/types/pagination';
import { realGetUsersPaginated } from './real/user';

export const getUsersPaginated: (params: PaginationParams) => Promise<PaginatedResponse<SystemUser>> =
  realGetUsersPaginated;
