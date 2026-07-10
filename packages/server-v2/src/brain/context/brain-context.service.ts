import { BadRequestException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { BrainRequestContext } from './brain-request-context.js';

interface AuthenticatedBrainRequest extends Request {
  user?: {
    id?: number;
    permissions?: string[];
    deniedPermissions?: string[];
    storeIds?: number[];
  };
}

@Injectable()
export class BrainContextService {
  fromRequest(req: AuthenticatedBrainRequest, timezone = 'Asia/Shanghai'): BrainRequestContext {
    const storeHeader = req.headers['x-store-id'];
    const storeId = Number(Array.isArray(storeHeader) ? storeHeader[0] : storeHeader);

    if (!Number.isInteger(storeId) || storeId <= 0) {
      throw new BadRequestException('缺少有效的 X-Store-Id');
    }

    return {
      userId: Number(req.user?.id),
      storeId,
      visibleStoreIds: req.user?.storeIds?.length ? req.user.storeIds : [storeId],
      permissions: req.user?.permissions ?? [],
      deniedPermissions: req.user?.deniedPermissions ?? [],
      requestId: String(req.headers['x-request-id'] ?? `brain_${Date.now()}`),
      timezone,
    };
  }
}
