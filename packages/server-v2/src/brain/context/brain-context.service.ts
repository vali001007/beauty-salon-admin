import { createHash } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { BrainRequestContext } from './brain-request-context.js';

interface AuthenticatedBrainRequest extends Request {
  user?: {
    id?: number;
    roles?: string[];
    permissions?: string[];
    deniedPermissions?: string[];
    storeIds?: number[];
    stores?: number[];
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

    const permissions = req.user?.permissions ?? [];
    const visibleStoreIds = Array.from(
      new Set(
        [...(req.user?.storeIds ?? []), ...(req.user?.stores ?? [])].filter((id) => Number.isInteger(id) && id > 0),
      ),
    );
    if (visibleStoreIds.length === 0 && permissions.includes('*')) visibleStoreIds.push(storeId);
    if (!visibleStoreIds.includes(storeId)) {
      throw new BadRequestException('当前账号无权访问该门店');
    }

    const requestChannel = this.controlledChannel(req.headers['x-ami-client-channel']);
    const deviceId = this.optionalHeader(req.headers['x-ami-device-id'], 256);

    return {
      userId: Number(req.user?.id),
      storeId,
      visibleStoreIds,
      roles: req.user?.roles ?? [],
      permissions,
      deniedPermissions: req.user?.deniedPermissions ?? [],
      requestId: String(req.headers['x-request-id'] ?? `brain_${Date.now()}`),
      timezone,
      ...(requestChannel ? { requestChannel } : {}),
      ...(deviceId ? { deviceIdHash: createHash('sha256').update(deviceId).digest('hex') } : {}),
    };
  }

  private optionalHeader(value: string | string[] | undefined, maxLength: number) {
    const normalized = (Array.isArray(value) ? value[0] : value)?.trim();
    if (!normalized || normalized.length > maxLength || !/^[a-zA-Z0-9._:-]+$/u.test(normalized)) return undefined;
    return normalized;
  }

  private controlledChannel(value: string | string[] | undefined) {
    const normalized = this.optionalHeader(value, 64);
    return normalized === 'admin_web' || normalized === 'ami_mobile_web' ? normalized : undefined;
  }
}
