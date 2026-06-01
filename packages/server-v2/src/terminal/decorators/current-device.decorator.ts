import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * 从请求中提取当前终端设备信息
 * 需配合 DeviceAuthGuard 使用
 */
export const CurrentDevice = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const device = request.device;
    return data ? device?.[data] : device;
  },
);
