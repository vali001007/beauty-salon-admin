import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { CustomerAppRequestContext } from './types.js';

type CustomerAppRequest = Request & {
  customerApp?: CustomerAppRequestContext;
};

export const CurrentCustomerAppUser = createParamDecorator(
  (data: keyof CustomerAppRequestContext | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<CustomerAppRequest>();
    const user = request.customerApp;
    return data ? user?.[data] : user;
  },
);
